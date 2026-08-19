from __future__ import annotations

import csv
import uuid
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import BACKEND_DIR, CROPS_DIR, DEMO_FRAMES_DIR, FRAMES_DIR
from app.db.models import AccessLog, Vehicle
from app.db.session import get_db

router = APIRouter(prefix="/api/anpr", tags=["anpr"])

DEMO_PLATES_CSV = BACKEND_DIR / "scripts" / "demo_plates.csv"


class DemoFrameRequest(BaseModel):
    filename: str


def _decode_image(data: bytes) -> np.ndarray | None:
    buf = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def _no_detection(frame_url: str | None = None) -> dict:
    return {
        "plate": None,
        "det_confidence": None,
        "ocr_confidence": None,
        "decision": "no_detection",
        "vehicle": None,
        "crop_url": None,
        "frame_url": frame_url,
        "log_id": None,
    }


def _decide(db: Session, plate: str | None) -> tuple[str, Vehicle | None]:
    """granted / denied / unknown. Exact match only."""
    if not plate:
        return "unknown", None
    vehicle = db.scalar(select(Vehicle).where(Vehicle.plate_number == plate))
    if vehicle is None:
        return "unknown", None
    return ("granted" if vehicle.is_authorized else "denied"), vehicle


def _process_frame(
    request: Request,
    db: Session,
    frame: np.ndarray,
    frame_url: str | None,
    direction: str = "in",
) -> dict:
    """Run the pipeline on one frame, persist a log row, build the response."""
    results = request.app.state.pipeline.run(frame)
    if not results:
        return _no_detection(frame_url)

    # Highest-confidence plate wins — one vehicle per frame for the demo.
    best = max(results, key=lambda r: r["det_conf"])
    plate = best["plate"]
    decision, vehicle = _decide(db, plate)

    crop_name = f"{uuid.uuid4().hex}.jpg"
    crop_path = CROPS_DIR / crop_name
    cv2.imwrite(str(crop_path), best["crop"])
    crop_url = f"/storage/crops/{crop_name}"

    log = AccessLog(
        plate_number=plate,
        vehicle_id=vehicle.id if vehicle else None,
        direction=direction,
        decision=decision,
        det_confidence=best["det_conf"],
        ocr_confidence=best["ocr_conf"],
        crop_path=crop_url,
        frame_path=frame_url,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return {
        "plate": plate,
        "det_confidence": best["det_conf"],
        "ocr_confidence": best["ocr_conf"],
        "decision": decision,
        "vehicle": (
            {
                "id": vehicle.id,
                "plate_number": vehicle.plate_number,
                "owner_name": vehicle.owner_name,
                "phone": vehicle.phone,
                "vehicle_type": vehicle.vehicle_type,
                "is_authorized": vehicle.is_authorized,
            }
            if vehicle
            else None
        ),
        "crop_url": crop_url,
        "frame_url": frame_url,
        "bbox": best["bbox"],
        "log_id": log.id,
    }


@router.post("/process")
async def process_image(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    """Multipart image -> run pipeline, decide, log, return result."""
    data = await file.read()
    frame = _decode_image(data)
    if frame is None:
        # Not a readable image — still no stack trace at the demo.
        return _no_detection()

    frame_name = f"{uuid.uuid4().hex}.jpg"
    cv2.imwrite(str(FRAMES_DIR / frame_name), frame)
    frame_url = f"/storage/frames/{frame_name}"

    return _process_frame(request, db, frame, frame_url)


@lru_cache(maxsize=1)
def _real_plate_frames() -> list[tuple[str, str]]:
    """[(filename, plate)] for demo frames that actually show a vehicle plate.

    demo_frames/ is the held-out *test* set: ~70% of it is scraped signage from
    number-plate dealers, where the expected text isn't a plate at all. Those
    frames can only ever produce `unknown`, so they are pushed to the back of
    the feed rather than opening the demo with a wall of grey cards.

    Sorted by the reference OCR confidence recorded in the CSV, so the frames
    that read most cleanly come first — a low-confidence frame is the one most
    likely to be misread and land on `unknown` despite being registered.
    """
    if not DEMO_PLATES_CSV.is_file():
        return []
    rows = []
    with open(DEMO_PLATES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row.get("valid_format") != "True":
                continue
            try:
                confidence = float(row.get("ocr_conf", 0) or 0)
            except ValueError:
                confidence = 0.0
            rows.append((row["image"], row["plate"], confidence))

    rows.sort(key=lambda r: r[2], reverse=True)
    return [(name, plate) for name, plate, _ in rows]


def _curated_order(db: Session, available: set[str]) -> list[str]:
    """Real-plate frames, round-robined across granted / denied / unknown.

    Decisions are resolved against the live registry, so a vehicle registered
    mid-demo moves its frame into the granted rotation on the next fetch.
    """
    buckets: dict[str, list[str]] = {"granted": [], "denied": [], "unknown": []}
    for filename, plate in _real_plate_frames():
        if filename not in available:
            continue
        decision, _ = _decide(db, plate)
        buckets[decision].append(filename)

    ordered: list[str] = []
    seen: set[str] = set()
    for i in range(max((len(b) for b in buckets.values()), default=0)):
        for key in ("granted", "denied", "unknown"):
            bucket = buckets[key]
            if i < len(bucket) and bucket[i] not in seen:
                ordered.append(bucket[i])
                seen.add(bucket[i])
    return ordered


@router.get("/demo-frames")
def list_demo_frames(db: Session = Depends(get_db)) -> dict:
    if not DEMO_FRAMES_DIR.exists():
        return {"frames": [], "count": 0, "curated_count": 0}

    names = sorted(
        p.name
        for p in DEMO_FRAMES_DIR.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )

    curated = _curated_order(db, set(names))
    remainder = [n for n in names if n not in set(curated)]

    return {
        "frames": curated + remainder,
        "count": len(names),
        "curated_count": len(curated),
    }


@router.post("/demo-frame")
def process_demo_frame(
    payload: DemoFrameRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    # Reject path traversal — only bare filenames inside demo_frames/.
    name = Path(payload.filename).name
    path = DEMO_FRAMES_DIR / name
    if name != payload.filename or not path.is_file():
        raise HTTPException(status_code=404, detail="demo frame not found")

    frame = cv2.imread(str(path))
    if frame is None:
        return _no_detection()

    return _process_frame(request, db, frame, f"/demo-frames/{name}")
