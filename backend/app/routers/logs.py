from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AccessLog, Vehicle
from app.db.session import get_db

router = APIRouter(prefix="/api", tags=["logs"])


class CorrectionRequest(BaseModel):
    corrected_plate: str


def _serialize(log: AccessLog, owner_name: str | None) -> dict:
    return {
        "id": log.id,
        "plate_number": log.plate_number,
        "corrected_plate": log.corrected_plate,
        "vehicle_id": log.vehicle_id,
        "owner_name": owner_name,
        "direction": log.direction,
        "decision": log.decision,
        "det_confidence": log.det_confidence,
        "ocr_confidence": log.ocr_confidence,
        "crop_url": log.crop_path,
        "frame_url": log.frame_path,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


@router.get("/logs")
def list_logs(
    limit: int = Query(50, ge=1, le=500),
    decision: str | None = None,
    plate: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    stmt = (
        select(AccessLog, Vehicle.owner_name)
        .join(Vehicle, AccessLog.vehicle_id == Vehicle.id, isouter=True)
        .order_by(AccessLog.created_at.desc(), AccessLog.id.desc())
        .limit(limit)
    )
    if decision:
        stmt = stmt.where(AccessLog.decision == decision)
    if plate:
        stmt = stmt.where(AccessLog.plate_number.ilike(f"%{plate.strip()}%"))

    rows = db.execute(stmt).all()
    return {"logs": [_serialize(log, owner) for log, owner in rows]}


@router.patch("/logs/{log_id}/correct")
def correct_log(
    log_id: int,
    payload: CorrectionRequest,
    db: Session = Depends(get_db),
) -> dict:
    log = db.get(AccessLog, log_id)
    if log is None:
        raise HTTPException(status_code=404, detail="log not found")

    # Store what the human says it really was; leave plate_number (what the
    # model read) untouched — the pair is the retraining signal.
    log.corrected_plate = payload.corrected_plate.strip().upper()
    db.commit()
    db.refresh(log)

    owner = (
        db.get(Vehicle, log.vehicle_id).owner_name if log.vehicle_id else None
    )
    return _serialize(log, owner)


@router.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict:
    """Today's counts by decision (UTC day, matching created_at)."""
    start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    rows = db.execute(
        select(AccessLog.decision, func.count())
        .where(AccessLog.created_at >= start)
        .group_by(AccessLog.decision)
    ).all()

    counts = {"granted": 0, "denied": 0, "unknown": 0}
    for decision, count in rows:
        counts[decision] = counts.get(decision, 0) + count

    counts["total"] = sum(v for k, v in counts.items() if k != "total")
    counts["date"] = start.date().isoformat()
    return counts
