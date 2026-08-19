"""Evaluate the ANPR pipeline over the held-out demo frames.

Produces everything the submission needs in one run:

    results/outputs/      annotated frames (box + predicted plate)
    results/graphs/       performance charts (PNG)
    results/predictions.csv   per-frame raw numbers
    results/metrics.md    summary tables, ready to paste into the report

Run from backend/:   python scripts/evaluate.py
"""

from __future__ import annotations

import csv
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import DEMO_FRAMES_DIR  # noqa: E402
from app.inference.pipeline import ANPRPipeline  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
RESULTS_DIR = REPO_ROOT / "results"
OUTPUTS_DIR = RESULTS_DIR / "outputs"
GRAPHS_DIR = RESULTS_DIR / "graphs"
SCRIPTS_DIR = Path(__file__).resolve().parent
REFERENCE_CSV = SCRIPTS_DIR / "demo_plates.csv"
GROUND_TRUTH = SCRIPTS_DIR / "ground_truth.csv"


def load_ground_truth() -> dict[str, dict]:
    """image filename -> {plate, ref_*_conf, is_real_plate}.

    Accuracy is scored against ground_truth.csv, which is hand-verified. The
    original demo_plates.csv is EasyOCR's own output from the training notebook,
    so scoring against it measures agreement between two OCR runs rather than
    accuracy — it was wrong on 8 of the 29 real plates. It is still read here
    for the reference confidence values it records.
    """
    reference: dict[str, dict] = {}
    with REFERENCE_CSV.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            reference[row["image"]] = {
                "ref_ocr_conf": float(row["ocr_conf"]),
                "ref_det_conf": float(row["det_conf"]),
            }

    verified: dict[str, str] = {}
    with GROUND_TRUTH.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            verified[row["image"]] = row["plate"].strip().upper()

    rows: dict[str, dict] = {}
    for image, ref in reference.items():
        # Presence in ground_truth.csv is what marks a frame as holding a real
        # vehicle plate. The other 71 frames are number-plate dealer signage.
        rows[image] = {
            "plate": verified.get(image, ""),
            "is_real_plate": image in verified,
            **ref,
        }
    return rows


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def char_accuracy(pred: str, truth: str) -> float:
    """1.0 = exact match, 0.0 = nothing in common. Normalised edit distance."""
    if not truth:
        return 0.0
    return max(0.0, 1.0 - levenshtein(pred, truth) / len(truth))


def annotate(frame: np.ndarray, results: list[dict], truth: str | None) -> np.ndarray:
    """Draw each detection: box, predicted plate, confidences."""
    out = frame.copy()
    for r in results:
        x1, y1, x2, y2 = r["bbox"]
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 220, 0), 2)

        label = f"{r['plate'] or '(no text)'}  det {r['det_conf']:.2f}  ocr {r['ocr_conf']:.2f}"
        (tw, th), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)

        # Keep the label inside the frame on all sides: flip below the box when
        # it would clip the top edge, and shift left when it would run off the
        # right edge.
        ty = y1 - 8 if y1 - th - base - 8 >= 0 else y2 + th + base + 8
        tx = min(x1, max(0, out.shape[1] - tw - 8))
        cv2.rectangle(
            out, (tx, ty - th - base), (tx + tw + 6, ty + base), (0, 220, 0), -1
        )
        cv2.putText(
            out, label, (tx + 3, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2
        )

    if truth:
        cv2.putText(
            out, f"expected: {truth}", (10, 28),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4,
        )
        cv2.putText(
            out, f"expected: {truth}", (10, 28),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1,
        )
    return out


def run_evaluation() -> list[dict]:
    truth_rows = load_ground_truth()
    frames = sorted(p for p in DEMO_FRAMES_DIR.iterdir() if p.suffix.lower() == ".jpg")
    if not frames:
        raise SystemExit(f"No demo frames found in {DEMO_FRAMES_DIR}")

    print(f"Loading pipeline (first run downloads EasyOCR weights, ~40s)...")
    pipeline = ANPRPipeline()

    records: list[dict] = []
    for i, path in enumerate(frames, start=1):
        frame = cv2.imread(str(path))
        if frame is None:
            print(f"  [{i:3}/{len(frames)}] SKIP unreadable {path.name}")
            continue

        gt = truth_rows.get(path.name, {})
        expected = gt.get("plate", "")

        t0 = time.perf_counter()
        results = pipeline.run(frame)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        best = max(results, key=lambda r: r["det_conf"]) if results else None
        predicted = (best["plate"] or "") if best else ""

        records.append(
            {
                "image": path.name,
                "expected": expected,
                "predicted": predicted,
                "n_boxes": len(results),
                "det_conf": best["det_conf"] if best else 0.0,
                "ocr_conf": best["ocr_conf"] if best else 0.0,
                "latency_ms": round(elapsed_ms, 1),
                "is_real_plate": gt.get("is_real_plate", False),
                "exact_match": bool(expected) and predicted == expected,
                "char_acc": round(char_accuracy(predicted, expected), 4) if expected else 0.0,
            }
        )

        cv2.imwrite(str(OUTPUTS_DIR / path.name), annotate(frame, results, expected))
        print(
            f"  [{i:3}/{len(frames)}] {path.name[:44]:44} "
            f"-> {predicted or '(none)':18} {elapsed_ms:6.0f}ms"
        )

    return records


def write_predictions(records: list[dict]) -> None:
    fields = [
        "image", "expected", "predicted", "n_boxes", "det_conf",
        "ocr_conf", "latency_ms", "is_real_plate", "exact_match", "char_acc",
    ]
    with (RESULTS_DIR / "predictions.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)


def summarise(records: list[dict]) -> dict:
    real = [r for r in records if r["is_real_plate"]]
    detected = [r for r in records if r["n_boxes"] > 0]
    latencies = [r["latency_ms"] for r in records]
    box_counts = Counter(r["n_boxes"] for r in records)

    exact = sum(r["exact_match"] for r in real)
    return {
        "total_frames": len(records),
        "real_plate_frames": len(real),
        "detection_rate": len(detected) / len(records) if records else 0.0,
        "frames_with_one_box": box_counts.get(1, 0),
        "max_boxes": max(box_counts) if box_counts else 0,
        "mean_det_conf": float(np.mean([r["det_conf"] for r in detected])) if detected else 0.0,
        "mean_ocr_conf": float(np.mean([r["ocr_conf"] for r in real])) if real else 0.0,
        "exact_matches": exact,
        "exact_match_rate": exact / len(real) if real else 0.0,
        "mean_char_acc": float(np.mean([r["char_acc"] for r in real])) if real else 0.0,
        "mean_latency_ms": float(np.mean(latencies)) if latencies else 0.0,
        "p95_latency_ms": float(np.percentile(latencies, 95)) if latencies else 0.0,
    }


def write_metrics(records: list[dict], s: dict) -> None:
    real = [r for r in records if r["is_real_plate"]]
    near = [r for r in real if not r["exact_match"] and r["char_acc"] >= 0.8]

    lines = [
        "# Results",
        "",
        "Measured on the 100 held-out demo frames (never seen during training).",
        "",
        "## Detection",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Frames evaluated | {s['total_frames']} |",
        f"| Frames producing a box | {int(s['detection_rate'] * s['total_frames'])} ({s['detection_rate']:.0%}) |",
        f"| Frames with exactly 1 box after NMS | {s['frames_with_one_box']} |",
        f"| Max boxes on any frame | {s['max_boxes']} |",
        f"| Mean detection confidence | {s['mean_det_conf']:.3f} |",
        "",
        "## Recognition (29 real-plate frames)",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Exact plate matches | {s['exact_matches']}/{s['real_plate_frames']} ({s['exact_match_rate']:.0%}) |",
        f"| Mean character accuracy | {s['mean_char_acc']:.1%} |",
        f"| Near misses (>=80% chars correct) | {len(near)} |",
        f"| Mean OCR confidence | {s['mean_ocr_conf']:.3f} |",
        "",
        "## Latency (CPU, full pipeline)",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Mean per frame | {s['mean_latency_ms']:.0f} ms |",
        f"| 95th percentile | {s['p95_latency_ms']:.0f} ms |",
        "",
        "## Near-miss detail",
        "",
        "Single-character confusions are the dominant failure mode; these are exactly",
        "what the `corrected_plate` field on each log row captures as retraining data.",
        "",
        "| Image | Expected | Predicted | Char accuracy |",
        "| --- | --- | --- | --- |",
    ]
    for r in sorted(near, key=lambda r: -r["char_acc"]):
        lines.append(
            f"| `{r['image'][:38]}` | {r['expected']} | {r['predicted']} | {r['char_acc']:.0%} |"
        )

    lines += [
        "",
        "## Graphs",
        "",
        "![Detection confidence](graphs/detection_confidence.png)",
        "![OCR confidence](graphs/ocr_confidence.png)",
        "![Recognition outcomes](graphs/recognition_outcomes.png)",
        "![Latency](graphs/latency.png)",
        "",
    ]
    (RESULTS_DIR / "metrics.md").write_text("\n".join(lines), encoding="utf-8")


def plot_graphs(records: list[dict], s: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.dpi": 140, "font.size": 10})
    real = [r for r in records if r["is_real_plate"]]
    signage = [r for r in records if not r["is_real_plate"]]

    # 1. Detection confidence — the detector fires reliably on both groups,
    #    which is the point: it finds plate-shaped regions, sign or not.
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.hist(
        [[r["det_conf"] for r in real], [r["det_conf"] for r in signage]],
        bins=12, stacked=True, color=["#2563eb", "#cbd5e1"],
        label=["Real plates (29)", "Signage (71)"], edgecolor="white",
    )
    ax.set_xlabel("Detection confidence")
    ax.set_ylabel("Frames")
    ax.set_title("Plate detection confidence distribution")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / "detection_confidence.png")
    plt.close(fig)

    # 2. OCR confidence — separates cleanly, real plates score far higher.
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.hist(
        [[r["ocr_conf"] for r in real], [r["ocr_conf"] for r in signage]],
        bins=12, stacked=True, color=["#16a34a", "#cbd5e1"],
        label=["Real plates (29)", "Signage (71)"], edgecolor="white",
    )
    ax.set_xlabel("OCR confidence")
    ax.set_ylabel("Frames")
    ax.set_title("OCR confidence distribution")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / "ocr_confidence.png")
    plt.close(fig)

    # 3. Recognition outcomes on the real-plate subset.
    exact = s["exact_matches"]
    near = sum(1 for r in real if not r["exact_match"] and r["char_acc"] >= 0.8)
    wrong = len(real) - exact - near
    fig, ax = plt.subplots(figsize=(6, 3.6))
    bars = ax.bar(
        ["Exact match", "Near miss\n(>=80% chars)", "Incorrect"],
        [exact, near, wrong],
        color=["#16a34a", "#f59e0b", "#dc2626"],
    )
    ax.bar_label(bars, padding=2)
    ax.set_ylabel("Frames")
    ax.set_title(f"Plate recognition outcomes (n={len(real)})")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / "recognition_outcomes.png")
    plt.close(fig)

    # 4. Latency spread.
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.hist([r["latency_ms"] for r in records], bins=15, color="#7c3aed", edgecolor="white")
    ax.axvline(s["mean_latency_ms"], color="#111", ls="--", lw=1.2,
               label=f"mean {s['mean_latency_ms']:.0f} ms")
    ax.set_xlabel("End-to-end latency per frame (ms)")
    ax.set_ylabel("Frames")
    ax.set_title("Full pipeline latency (CPU)")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / "latency.png")
    plt.close(fig)


def main() -> None:
    for d in (RESULTS_DIR, OUTPUTS_DIR, GRAPHS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    records = run_evaluation()
    write_predictions(records)
    s = summarise(records)
    write_metrics(records, s)
    plot_graphs(records, s)

    print(
        f"\nDetection {s['detection_rate']:.0%}  |  "
        f"exact match {s['exact_matches']}/{s['real_plate_frames']} "
        f"({s['exact_match_rate']:.0%})  |  "
        f"mean {s['mean_latency_ms']:.0f} ms/frame"
    )
    print(f"Wrote {RESULTS_DIR.relative_to(REPO_ROOT)}/ — outputs, graphs, metrics.md, predictions.csv")


if __name__ == "__main__":
    main()
