# ANPR Vehicle Access System

Plate detection (YOLO11n → ONNX, CPU) + OCR (EasyOCR) behind a FastAPI service,
with a React dashboard for live processing, access logs, and a vehicle registry.

Everything runs on localhost. No auth, no deployment.

---

## Prerequisites

- Docker (for Postgres)
- Python 3.10+
- Node 18+

---

## Run it

Three terminals. Commands assume you start from the repo root.

### 1. Database

```bash
docker compose up -d
```

Postgres listens on **localhost:5436** (not 5432 — that port was already taken
by another local project). Change the port in `docker-compose.yml` and
`backend/.env` together if you want it elsewhere.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt
cp .env.example .env

python scripts/seed_demo.py       # creates the 10 demo vehicles
python -m uvicorn app.main:app --reload --port 8000
```

First startup takes ~40s: EasyOCR downloads its model weights into
`~/.EasyOCR/` once, then caches them. Subsequent starts are a few seconds.

API docs: <http://localhost:8000/docs>

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

The dashboard is React + Vite with [GSAP](https://gsap.com) driving every
transition. Motion lives in `src/anim/` — `motion.js` holds the shared easing
and duration vocabulary, `hooks.js` wraps GSAP in scoped, self-reverting React
hooks. `prefers-reduced-motion: reduce` collapses the global timeline, so end
states are identical without the movement. No animation library beyond GSAP,
no icon package, no CSS framework.

---

## Using the demo

**Live** — "Start feed" walks the demo frames, one every 2s, showing each
verdict as a large colour-coded card. "Upload image" runs any file you drop in.
Both write to the access log.

> **Feed ordering.** `demo_frames/` is the held-out *test* set, and 71 of the
> 100 images are scraped signage from number-plate dealers rather than photos of
> vehicles — they contain no real plate and can only ever produce `unknown`.
> `/api/anpr/demo-frames` therefore returns the **29 real-plate frames first**,
> round-robined across granted / denied / unknown so the demo opens on a proper
> mix instead of a wall of grey cards. Within each group, frames are ordered by
> the reference OCR confidence in `demo_plates.csv`, so the cleanest reads lead.
> The remaining 71 frames still follow, and `curated_count` in the response says
> where the curated set ends. Decisions are resolved against the live registry,
> so a vehicle you add mid-demo moves its frame into the granted rotation on the
> next fetch.

**Logs** — every processed frame, newest first. Filter by decision, search by
plate, and correct a misread plate inline (stored in `corrected_plate`,
alongside what the model actually read).

**Registry** — add / edit / delete vehicles, and toggle `is_authorized` to block
a vehicle without deleting it. Adding a vehicle is one row of inputs and a
button.

### Which plates do what

Seeded by `scripts/seed_demo.py`:

| Decision | Plates |
| --- | --- |
| `granted` | MH14EU3498, DL3CAY2231, MH01BU5207, NP32KN7325, TN28BA9999, MH2OCS4946, KL43B2344, HR26CM6005 |
| `denied` | HR26CT4063, KL65H4383 |
| `unknown` | anything else, e.g. MH47Y1124, TN21AT0480 |

Good frames to demo by hand:

- `59e121dc-...-Autopsyches-Skoda-Laura-6.jpg.jpg` → DL3CAY2231 → **GRANTED**
- `car-wbs-HR26CT4063_00000.jpg` → HR26CT4063 → **DENIED**
- `video11_1030.jpg` → MH47Y1124 → **UNKNOWN**

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/anpr/process` | multipart image → detect, read, decide, log |
| GET | `/api/anpr/demo-frames` | list filenames in `demo_frames/` |
| POST | `/api/anpr/demo-frame` | `{ filename }` → process that demo image |
| GET | `/api/logs` | `?limit=&decision=&plate=` |
| PATCH | `/api/logs/{id}/correct` | `{ corrected_plate }` |
| GET | `/api/vehicles` | list |
| POST | `/api/vehicles` | create |
| PATCH | `/api/vehicles/{id}` | update |
| DELETE | `/api/vehicles/{id}` | delete |
| GET | `/api/stats` | today's counts by decision |

Plate crops are written to `app/storage/crops/` and served at `/storage/crops/…`.
Uploaded frames go to `app/storage/frames/`; demo frames are served from
`/demo-frames/…`.

If no plate is found the response is a clean
`{"plate": null, "decision": "no_detection"}` — never a 500.

Quick check:

```bash
curl -X POST http://localhost:8000/api/anpr/demo-frame \
  -H "Content-Type: application/json" \
  -d '{"filename":"car-wbs-HR26CT4063_00000.jpg"}'
```

---

## How the pipeline works

`app/inference/detector.py` — the ONNX session is built **once at import**.
Frames are resized to 640×640, BGR→RGB, `/255`, NCHW. The raw `[1, 5, 8400]`
output is transposed to 8400 rows of `cx, cy, w, h, conf`, filtered at
`conf > 0.25`, then passed through `cv2.dnn.NMSBoxes(..., 0.25, 0.45)`. Without
NMS a single plate produces 8–13 overlapping boxes; measured on the demo frames,
NMS collapses those to exactly 1. Boxes are rescaled to the original frame and
clamped to its bounds before cropping.

`app/inference/recognizer.py` — **the OCR seam.** `read_plate(crop) -> (text,
confidence)` is the entire contract; nothing outside this file imports or
mentions EasyOCR. Swapping in a CRNN means rewriting this one file. Crops are
upscaled to 96px height and greyscaled, and multi-box results are joined in
reading order (top-to-bottom, then left-to-right) — without that, two-line
plates come back as `BT6482MH02` instead of `MH02BT6482`.

`app/inference/pipeline.py` — `ANPRPipeline.run(frame)` returns one dict per
plate: `{plate, det_conf, ocr_conf, bbox, crop}`. Instantiated once in the
FastAPI `lifespan` handler and kept on `app.state`.

### Measured on the 100 held-out demo frames

| | |
| --- | --- |
| Detection rate | 100/100 frames produced a box |
| Boxes per plate after NMS | 1 (0 frames returned more than 3) |
| Detector latency | ~66 ms/frame (CPU) |
| Full pipeline latency | ~530 ms/frame (CPU, detection + OCR) |
| Plate text exact match | 22/29 (76%) on the real-plate subset |

The 76% is against the `valid_format=True` rows of `scripts/demo_plates.csv`.
The remaining 71 frames include shop hoardings and advertising boards where the
"expected" text isn't a plate at all, so they aren't a meaningful accuracy
target. Typical misses are single-character confusions (`KI12BT6482` read as
`NI12BI6482`) — exactly what the `corrected_plate` field on each log row exists
to capture as retraining data.

---

## A note on PyTorch

`requirements.txt` does not list PyTorch, but **installing EasyOCR pulls in
`torch` and `torchvision` anyway** — EasyOCR hard-depends on them and there is
no torch-free install path for it. The detector genuinely runs on onnxruntime
alone; the torch dependency comes purely from the OCR side.

Because `recognizer.py` is the only file that touches EasyOCR, replacing it with
the CRNN next week removes torch from the project entirely. Nothing else needs
to change.

---

## Schema

```
vehicles      id, plate_number (unique, indexed), owner_name, phone,
              vehicle_type, is_authorized, created_at

access_logs   id, plate_number, vehicle_id -> vehicles.id, direction,
              decision, det_confidence, ocr_confidence, crop_path,
              frame_path, corrected_plate, created_at (indexed)
```

Decision logic is exact-match only: in `vehicles` and authorized → `granted`;
in `vehicles` but not authorized → `denied`; not in `vehicles` → `unknown`.

Tables are created automatically at startup — no migration tool.

To clear the log history between runs:

```bash
docker exec -it anpr_db psql -U anpr -d anpr -c "TRUNCATE access_logs;"
```

---

## Not built (deliberately deferred)

WebSockets, video file processing, fuzzy/Levenshtein matching, character
normalisation, a review queue, dashboard charts, auth, tests, and Docker images
for the backend or frontend.
