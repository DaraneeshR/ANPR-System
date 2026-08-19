# ANPR-Based Vehicle Access Control System

Automatic Number Plate Recognition for gate access control. A YOLO11n detector
(exported to ONNX, CPU-only) locates the number plate in a frame, EasyOCR reads
the characters, and the plate is matched against a vehicle registry to produce a
**GRANTED / DENIED / UNKNOWN** verdict — every decision logged with the cropped
plate image as evidence.

FastAPI backend, React dashboard, PostgreSQL. Runs entirely on localhost.

---

## Problem Statement

Manual vehicle entry control at gated premises — campuses, apartment complexes,
office parks — depends on a guard reading each number plate and checking it
against a register. This is slow at peak hours, error-prone at night or in poor
weather, and produces no reliable audit trail: paper registers are rarely
complete and cannot be searched after an incident.

An automated system must therefore do four things that a camera alone cannot:
**locate** the plate within a full vehicle frame, **read** it accurately enough
to be actionable, **decide** access against an authoritative registry, and
**record** the decision with visual evidence so a human can audit and correct it
later. The engineering difficulty sits in the first two: Indian plates vary
widely in font, spacing, single- vs two-line layout, mounting angle, and
illumination, and a naive detector returns a dozen overlapping boxes for one
plate.

## Objectives

1. Train a single-class plate detector accurate enough for real gate footage,
   and export it to ONNX so the runtime needs no PyTorch.
2. Build a detection → OCR pipeline that returns exactly one box per plate,
   handling two-line plates in correct reading order.
3. Match recognised plates against a vehicle registry and classify each event as
   granted, denied, or unknown.
4. Persist every event — plate text, both confidence scores, cropped image — in
   a queryable access log.
5. Let an operator correct a misread plate, storing the correction *alongside*
   the model's original output so it accumulates as retraining data.
6. Present all of it in a dashboard usable without training: live feed, searchable
   logs, and registry management.
7. Keep the OCR stage behind a single-function interface so the engine can be
   replaced without touching anything else.

## Dataset Used

The detector was trained in [`notebooks/ANPR_Train_Detector_Colab.ipynb`](notebooks/ANPR_Train_Detector_Colab.ipynb),
which supports two interchangeable sources. Both are public and free.

**Path A — Kaggle (Indian plates)**

| Dataset | Slug |
| --- | --- |
| Indian License Plates with Labels (~2 000 images, YOLO labels) | [`kedarsai/indian-license-plates-with-labels`](https://www.kaggle.com/datasets/kedarsai/indian-license-plates-with-labels) |
| Indian Vehicle Dataset | [`saisirishan/indian-vehicle-dataset`](https://www.kaggle.com/datasets/saisirishan/indian-vehicle-dataset) |
| Indian Number Plates Dataset | [`dataclusterlabs/indian-number-plates-dataset`](https://www.kaggle.com/datasets/dataclusterlabs/indian-number-plates-dataset) |

**Path B — Roboflow Universe (≈10 000 general plates)**

[`roboflow-universe-projects/license-plate-recognition-rxg4e`](https://universe.roboflow.com/roboflow-universe-projects/license-plate-recognition-rxg4e), version 4, YOLOv8 export.

The notebook downloads whichever path you configure, auto-detects the annotation
format (YOLO `.txt`, Pascal VOC `.xml`, 4-point polygon, or COCO `.json`),
converts everything to single-class YOLO format (`0 = plate`), and merges the
sources into one pool.

**As shipped**, the model was trained on **1 397 images** with an 85/15 train/val
split, plus a **100-image holdout** that the model never saw. That holdout is
committed to this repository as [`backend/demo_frames/`](backend/demo_frames/)
and is the evaluation set for every number in [Results](#results).

> **Note on the holdout.** Only **29 of the 100** holdout images contain a real
> vehicle plate. The remaining 71 are scraped number-plate *dealer signage* —
> shop hoardings and advertising boards. They are retained deliberately: they are
> genuine hard negatives that show how the system behaves on plate-shaped objects
> that are not plates. All recognition accuracy figures are reported against the
> 29-image real-plate subset, with the ground truth in
> [`backend/scripts/demo_plates.csv`](backend/scripts/demo_plates.csv).

## Technologies / Libraries Used

| Layer | Stack |
| --- | --- |
| Detection | YOLO11n (Ultralytics), exported to ONNX opset 12 |
| Inference runtime | `onnxruntime` 1.20 — CPU execution provider |
| OCR | EasyOCR 1.7 (English) |
| Image processing | OpenCV 4.10 (`opencv-python-headless`), NumPy 1.26 |
| API | FastAPI 0.115, Uvicorn, Pydantic v2 |
| Database | PostgreSQL 16 via SQLAlchemy 2.0 ORM |
| Frontend | React 18, Vite 5, GSAP 3 (animation), plain CSS |
| Infrastructure | Docker Compose (Postgres only) |
| Training | Google Colab (T4 GPU), Ultralytics, PyTorch |
| Evaluation | Matplotlib 3.9 |

The runtime deliberately avoids PyTorch for detection — that is the entire point
of the ONNX export. PyTorch does appear in the installed environment because
EasyOCR hard-depends on it; see [A note on PyTorch](#a-note-on-pytorch).

## Methodology

### 1. Training

`yolo11n.pt` fine-tuned for 60 epochs at 640×640, batch 16, `lr0=0.001` (low,
because training starts from pretrained COCO weights), `patience=15`, AMP
enabled. Augmentation: horizontal flip 0.5, rotation ±10°, perspective 0.0005,
HSV value 0.5 for day/night brightness variation, mosaic 1.0. Vertical flip is
explicitly disabled — an upside-down plate is not a plate.

The exported ONNX is verified against the PyTorch model on 10 holdout images
before use; silent export breakage is a known failure mode.

### 2. Image Preprocessing

**Detector input** — resize to 640×640, BGR→RGB, scale to `[0,1]`, transpose to
NCHW, add batch dimension, `float32`. Shape `[1, 3, 640, 640]`.

**OCR input** — the crop is upscaled to a 96 px height with cubic interpolation
and converted to greyscale. 96 px was measured as the optimum on the holdout
set: 128 px over-smooths the strokes, 64 px loses stroke detail.

### 3. Detection and Post-processing

Raw ONNX output is `[1, 5, 8400]`, transposed to 8 400 rows of
`cx, cy, w, h, confidence` in input-pixel coordinates. Rows are filtered at
`confidence > 0.25`, then passed through `cv2.dnn.NMSBoxes(..., 0.25, 0.45)`.

**Non-Maximum Suppression is essential here** — without it a single plate yields
8–13 overlapping boxes. With it, the holdout set collapses to exactly one box
per plate. Surviving boxes are rescaled to the original frame dimensions and
clamped to its bounds before cropping.

### 4. Character Recognition

EasyOCR returns one or more text boxes per crop. These are sorted **top-to-bottom,
then left-to-right within each line**, grouping boxes into lines when their
vertical centres fall within 0.6 × box height of each other. This ordering is
what makes two-line plates work: without it, `MH02` above `BT6482` is emitted as
`BT6482MH02`. Text is uppercased, stripped to `[A-Z0-9]`, and confidence is
averaged across boxes weighted by character count.

The entire OCR stage sits behind one function —
`read_plate(crop) -> (text, confidence)` in
[`backend/app/inference/recognizer.py`](backend/app/inference/recognizer.py).
Nothing outside that file imports or names EasyOCR, so replacing it with a custom
CRNN means rewriting one file.

### 5. Access Decision

Exact string match against the `vehicles` table:

| Condition | Decision |
| --- | --- |
| Plate in registry **and** `is_authorized = true` | `granted` |
| Plate in registry **and** `is_authorized = false` | `denied` |
| Plate not in registry | `unknown` |
| No plate detected | `no_detection` |

No fuzzy or Levenshtein matching — a near-match on a security decision is a
wrong answer, not a helpful one.

### 6. Logging and Correction

Every processed frame writes an `access_logs` row with the plate text, detection
and OCR confidences, the decision, and paths to the saved crop and frame. An
operator can correct a misread plate from the Logs page; the correction is stored
in `corrected_plate` **alongside** the model's original reading, never
overwriting it. That pairing is exactly the labelled data a retraining run needs.

### Architecture

```
Frame ──> detector.py ──> pipeline.py ──> recognizer.py ──> routers/anpr.py
          ONNX + NMS      orchestration   EasyOCR seam      decision + log
                                                                  │
   React dashboard <──── FastAPI JSON <──── PostgreSQL <──────────┘
```

The ONNX session and the EasyOCR reader are both constructed **once at import**,
and `ANPRPipeline` is instantiated once in the FastAPI `lifespan` handler and
kept on `app.state`. Loading per request turns 80 ms into 2 s.

### Database Schema

```
vehicles      id, plate_number (unique, indexed), owner_name, phone,
              vehicle_type, is_authorized, created_at

access_logs   id, plate_number, vehicle_id -> vehicles.id, direction,
              decision, det_confidence, ocr_confidence, crop_path,
              frame_path, corrected_plate, created_at (indexed)
```

Tables are created automatically at startup — no migration tool.

---

## Steps to Execute the Project

### Prerequisites

- **Python 3.11** — required. The pinned `numpy==1.26.4` and `easyocr==1.7.2`
  have no wheels for Python 3.13/3.14 and will fail to build.
- Node 18+
- Docker (for PostgreSQL)

### 0. Model weights

The trained detector ships with this repository at
`backend/app/weights/plate_detector.onnx` (YOLO11n, ~10 MB). Nothing to do —
it is cloned along with everything else.

Confirm it is present and valid before starting the backend:

```bash
python -c "import onnxruntime as ort; \
s = ort.InferenceSession('backend/app/weights/plate_detector.onnx'); \
print(s.get_inputs()[0].shape, s.get_outputs()[0].shape)"
# expect: [1, 3, 640, 640] [1, 5, 8400]
```

To retrain it from scratch instead: open
[`notebooks/ANPR_Train_Detector_Colab.ipynb`](notebooks/ANPR_Train_Detector_Colab.ipynb)
in Google Colab, set a T4 GPU runtime, fill in your Kaggle or Roboflow API key in
the CONFIG cell, and run top to bottom (~60 min). Cell 14 packages the ONNX for
download.

### 1. Database

```bash
docker compose up -d
```

PostgreSQL listens on **localhost:5436** (not 5432 — that port was taken by
another local project). To change it, edit `docker-compose.yml` and
`backend/.env` together.

### 2. Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows

pip install -r requirements.txt
cp .env.example .env

python scripts/seed_demo.py        # creates the 10 demo vehicles
python -m uvicorn app.main:app --reload --port 8000
```

First startup takes ~40 s while EasyOCR downloads its weights into `~/.EasyOCR/`.
Subsequent starts take a few seconds.

API docs: <http://localhost:8000/docs>

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

### 4. Verify it works

```bash
curl -X POST http://localhost:8000/api/anpr/demo-frame \
  -H "Content-Type: application/json" \
  -d '{"filename":"car-wbs-HR26CT4063_00000.jpg"}'
```

Expected: plate `HR26CT4063`, decision `denied`.

### 5. Reproduce the results

```bash
cd backend
pip install -r requirements-eval.txt
python scripts/evaluate.py
```

Runs all 100 holdout frames and writes to `results/`: annotated output images,
performance graphs, `metrics.md`, and per-frame `predictions.csv`.

### Using the dashboard

**Live** — "Start feed" walks the demo frames one every 2 s, showing each verdict
as a colour-coded card. "Upload image" runs any file you drop in. Both write to
the access log.

**Logs** — every processed frame, newest first. Filter by decision, search by
plate, correct a misread plate inline.

**Registry** — add, edit, and delete vehicles; toggle `is_authorized` to block a
vehicle without deleting it.

Plates that demonstrate each verdict:

| Decision | Demo frame | Plate |
| --- | --- | --- |
| `granted` | `59e121dc-...-Autopsyches-Skoda-Laura-6.jpg.jpg` | DL3CAY2231 |
| `denied` | `car-wbs-HR26CT4063_00000.jpg` | HR26CT4063 |
| `unknown` | `video11_1030.jpg` | MH47Y1124 |

### API Reference

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/anpr/process` | multipart image → detect, read, decide, log |
| GET | `/api/anpr/demo-frames` | list available demo frames |
| POST | `/api/anpr/demo-frame` | `{ filename }` → process that demo image |
| GET | `/api/logs` | `?limit=&decision=&plate=` |
| PATCH | `/api/logs/{id}/correct` | `{ corrected_plate }` |
| GET | `/api/vehicles` | list |
| POST | `/api/vehicles` | create |
| PATCH | `/api/vehicles/{id}` | update |
| DELETE | `/api/vehicles/{id}` | delete |
| GET | `/api/stats` | today's counts by decision |

---

## Results

All figures measured on the **100 held-out images** the model never saw during
training. Full tables, graphs, and per-frame numbers are in
[`results/`](results/), regenerated by `python scripts/evaluate.py`.

### Detector training metrics

| Metric | Value |
| --- | --- |
| mAP@50 | **0.9834** |
| mAP@50-95 | **0.8193** |
| Precision | 0.9834 |
| Recall | 0.9681 |

### Pipeline performance on the holdout set

| Metric | Value |
| --- | --- |
| Frames producing a detection | 100 / 100 (100%) |
| Boxes per plate after NMS | 1 |
| Detection latency | ~66 ms/frame (CPU) |
| Full pipeline latency | ~530 ms/frame (CPU, detection + OCR) |
| **Plate text exact match** | **22 / 29 (76%)** on the real-plate subset |

### Interpretation

Detection is effectively solved on this data — every frame yields a box, and NMS
reliably collapses the 8–13 raw proposals to one. The bottleneck is recognition:
76% exact match, where the dominant failure mode is **single-character
confusion** (`KI12BT6482` read as `NI12BI6482`) rather than wholesale
misreading. Character-level accuracy is therefore substantially higher than the
exact-match figure suggests.

This is precisely why the `corrected_plate` field exists: each correction an
operator makes captures one of these confusions as labelled retraining data,
targeted at the exact characters the model confuses.

Latency is dominated by OCR — ~66 ms of the ~530 ms budget is detection, the
remaining ~464 ms is EasyOCR on CPU. This is the strongest argument for replacing
EasyOCR with a purpose-built CRNN: a plate-specific model would be both faster
and more accurate on the confusable character set.

### Sample outputs

Annotated detections for all 100 frames are in [`results/outputs/`](results/outputs/),
and the performance graphs in [`results/graphs/`](results/graphs/).

---

## Limitations and Future Scope

**Current limitations**

- Exact-match only — a single misread character produces `unknown` for an
  authorised vehicle.
- OCR accuracy of 76% exact match is below what unattended gate operation needs.
- Single-frame processing; no video input or multi-frame voting.
- CPU-only, ~530 ms per frame — adequate for a gate, not for highway speeds.
- No authentication on the dashboard.
- Evaluated on 29 real-plate images, which is a small test set.

**Future scope**

- Replace EasyOCR with a CRNN trained specifically on Indian plates — addresses
  the accuracy *and* the latency bottleneck simultaneously.
- Multi-frame voting from a video stream: aggregate reads across consecutive
  frames of the same vehicle to suppress single-frame errors.
- Confidence-gated review queue — route low-confidence reads to a human instead
  of rejecting them.
- Retraining loop consuming accumulated `corrected_plate` data.
- GPU inference and authentication for production deployment.

---

## A note on PyTorch

`requirements.txt` does not list PyTorch, but **installing EasyOCR pulls in
`torch` and `torchvision` anyway** — EasyOCR hard-depends on them and there is no
torch-free install path. The detector genuinely runs on `onnxruntime` alone; the
torch dependency comes entirely from the OCR side. Because
`recognizer.py` is the only file that touches EasyOCR, replacing it removes
PyTorch from the project completely.

## Repository Structure

```
├── notebooks/
│   └── ANPR_Train_Detector_Colab.ipynb   # training + ONNX export (Colab)
├── backend/
│   ├── app/
│   │   ├── inference/{detector,recognizer,pipeline}.py
│   │   ├── routers/{anpr,logs,vehicles}.py
│   │   ├── db/{models,session}.py
│   │   └── weights/plate_detector.onnx   # trained detector (committed)
│   ├── demo_frames/                      # 100 held-out evaluation images
│   ├── scripts/
│   │   ├── evaluate.py                   # regenerates everything in results/
│   │   ├── seed_demo.py
│   │   └── demo_plates.csv               # holdout ground truth
│   └── requirements.txt
├── frontend/src/
│   ├── pages/{Live,Logs,Registry}.jsx
│   └── components/
├── results/                              # graphs, tables, annotated outputs
├── model_info.txt
└── docker-compose.yml
```
