# Claude Code — Master Prompt

Paste everything below the line into Claude Code, run from inside `anpr-system/`.

---

I'm building an ANPR (Automatic Number Plate Recognition) vehicle access system. I have a
trained plate-detection model already exported to ONNX. I need you to build the entire
application around it.

**This is for a demo tomorrow morning. Prioritise working over complete.** Build the
"MUST BUILD" list fully and correctly. Do not build anything in the "DO NOT BUILD" list.

## What already exists

```
anpr-system/
├── model_info.txt                          # model metrics + I/O spec — READ THIS FIRST
└── backend/
    ├── app/weights/plate_detector.onnx      # trained YOLO detector, single class "plate"
    ├── demo_frames/*.jpg                    # ~100 held-out images for the demo
    └── scripts/
        ├── seed_demo.py                     # generated list of demo vehicles (needs wiring to DB)
        └── demo_plates.csv                  # plate text read from each demo image
```

Read `model_info.txt` before writing any inference code. It contains the exact input
tensor shape, output format, and the model's accuracy metrics.

## Stack

- Backend: FastAPI + SQLAlchemy + PostgreSQL
- Inference: onnxruntime (CPU) + EasyOCR. **Do not install PyTorch** — the whole point of
  the ONNX export was to avoid it.
- Frontend: React + Vite + plain CSS or Tailwind
- Database: PostgreSQL via docker-compose
- Everything runs on localhost. No deployment, no auth, no cloud.

## Target structure

```
anpr-system/
├── docker-compose.yml
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── weights/plate_detector.onnx
│       ├── inference/
│       │   ├── detector.py
│       │   ├── recognizer.py
│       │   └── pipeline.py
│       ├── db/
│       │   ├── models.py
│       │   └── session.py
│       ├── routers/
│       │   ├── anpr.py
│       │   ├── logs.py
│       │   └── vehicles.py
│       └── storage/            # saved plate crops (gitignored)
├── backend/demo_frames/
├── backend/scripts/seed_demo.py
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── api.js
        ├── pages/{Live,Logs,Registry}.jsx
        └── components/ResultCard.jsx
```

## The inference pipeline — get this exactly right

### detector.py

Load the ONNX session **once** at module level, not per call.

Preprocessing: resize to the model's input size, BGR→RGB, divide by 255, transpose to
NCHW, add batch dim, float32.

Postprocessing — this is where it usually goes wrong:
- Raw YOLO ONNX output is roughly `[1, 5, 8400]` (or transposed). Each of the 8400
  columns is `cx, cy, w, h, confidence` in input-image pixel coordinates.
- Transpose if needed so you're iterating over 8400 rows of 5 values.
- Filter by `confidence > 0.25`.
- **Apply NMS** — use `cv2.dnn.NMSBoxes(boxes, scores, 0.25, 0.45)`. Without this you get
  8–12 duplicate boxes on the same plate.
- Convert coordinates back to the original image scale before cropping.
- Return `[(x1, y1, x2, y2, confidence), ...]`.

### recognizer.py

**This exact signature — do not change it:**

```python
def read_plate(crop) -> tuple[str, float]:
    """crop: BGR numpy array of just the plate. Returns (text, confidence)."""
```

Implement it with EasyOCR, CPU mode, reader loaded once at module level.
Uppercase the result, strip spaces/hyphens/non-alphanumerics.

I'm replacing EasyOCR with my own CRNN next week, so this function is the seam.
Nothing outside this file may import or reference EasyOCR.

### pipeline.py

```python
class ANPRPipeline:
    def __init__(self, det_path, ...): ...
    def run(self, frame) -> list[dict]:
        # each dict: {plate, det_conf, ocr_conf, bbox, crop}
```

Instantiate once in FastAPI's `lifespan` startup handler and store on `app.state`.
Loading per-request turns 80ms into 2 seconds.

## Database

```
vehicles
  id            serial PK
  plate_number  text unique not null, indexed
  owner_name    text
  phone         text
  vehicle_type  text
  is_authorized boolean default true
  created_at    timestamp default now()

access_logs
  id              serial PK
  plate_number    text
  vehicle_id      int null FK -> vehicles.id
  direction       text default 'in'
  decision        text          # granted | denied | unknown
  det_confidence  float
  ocr_confidence  float
  crop_path       text
  frame_path      text
  corrected_plate text null
  created_at      timestamp default now(), indexed
```

`corrected_plate` stores what a human says it really was, separate from what the model
read. Keep both — it becomes retraining data later.

Decision logic:
- plate found in `vehicles` AND `is_authorized` → `granted`
- plate found but not authorized → `denied`
- plate not in table → `unknown`

Exact match only for now. No fuzzy matching.

## API

```
POST   /api/anpr/process          multipart image -> run pipeline, decide, log, return result
GET    /api/anpr/demo-frames      list filenames in demo_frames/
POST   /api/anpr/demo-frame       { filename } -> process that demo image
GET    /api/logs                  ?limit=&decision=&plate=
PATCH  /api/logs/{id}/correct     { corrected_plate }
GET    /api/vehicles
POST   /api/vehicles
PATCH  /api/vehicles/{id}
DELETE /api/vehicles/{id}
GET    /api/stats                 today's counts by decision
```

`/api/anpr/process` response:

```json
{
  "plate": "KA05MH1234",
  "det_confidence": 0.94,
  "ocr_confidence": 0.87,
  "decision": "granted",
  "vehicle": { "owner_name": "R. Menon", "vehicle_type": "car" },
  "crop_url": "/storage/crops/abc123.jpg",
  "log_id": 42
}
```

Save the cropped plate to `app/storage/crops/` and serve that directory as static files
so the frontend can show the thumbnail.

Enable CORS for `http://localhost:5173`.

## Frontend — three pages

**Live** (default)
- Fetches the demo-frame list on mount
- "Start feed" button → `setInterval` every 2000ms, POSTs the next demo frame, prepends
  the result to a list. "Stop feed" clears the interval.
- Also a file-upload input that hits `/api/anpr/process` directly
- Latest result shown as a large card: crop image, plate text in monospace, confidence
  bar, owner name, and a big colour-coded verdict — green GRANTED / red DENIED /
  grey UNKNOWN
- Below it, a scrolling list of previous results this session

**Logs**
- Table: time, crop thumbnail, plate, decision badge, confidence
- Filter by decision, search by plate
- Inline "correct" input on each row calling the PATCH endpoint

**Registry**
- Table of vehicles with add / edit / delete
- Toggle for `is_authorized`
- Adding a vehicle must take about three seconds — this gets demoed live

Keep the styling clean and minimal. Dark or light, doesn't matter. Legibility over polish.

## MUST BUILD

- docker-compose.yml for Postgres
- Full inference pipeline with correct NMS
- All endpoints above
- All three frontend pages
- Working seed script (wire `backend/scripts/seed_demo.py` up to actually insert rows —
  it currently just holds a `DEMO_VEHICLES` list)
- README with exact run commands

## DO NOT BUILD

- WebSockets (the setInterval loop replaces it)
- Video file processing
- Fuzzy / Levenshtein matching
- Character normalisation rules
- Review queue page
- Dashboard charts
- Authentication
- Tests
- Docker for the backend or frontend

These are deliberately deferred to next week. Do not add them, even if they seem quick.

## Constraints

- `.gitignore` must include `*.onnx`, `app/storage/`, `.env`, `node_modules`, `__pycache__`
- Load the ONNX session and EasyOCR reader once at startup, never per request
- If no plate is detected, return a clean `{"plate": null, "decision": "no_detection"}` —
  never a 500. The demo must never show a stack trace.
- No PyTorch in requirements.txt

## Build order

1. docker-compose.yml + db models + session — verify Postgres connects
2. `detector.py` + `pipeline.py` — verify against one demo frame before anything else
3. `recognizer.py`
4. `/api/anpr/process` — verify end to end with curl
5. Remaining endpoints
6. Seed script — run it, confirm rows exist
7. Frontend: Registry, then Live, then Logs

Stop after each of steps 1–4 and tell me the result before continuing. If the detector
returns 8+ boxes for a single plate, NMS isn't working — fix that before moving on.
