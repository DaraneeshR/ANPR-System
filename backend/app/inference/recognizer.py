"""Plate OCR.

This module is the OCR seam: `read_plate` is the only thing the rest of the
application knows about. EasyOCR is an implementation detail and must not be
imported anywhere outside this file — swapping in a CRNN means rewriting this
file and nothing else.
"""

from __future__ import annotations

import re

import cv2
import easyocr
import numpy as np

# Built once at import time — construction loads model weights (~35s cold,
# instant once the weights are cached in ~/.EasyOCR).
_READER = easyocr.Reader(["en"], gpu=False, verbose=False)

_NON_ALNUM = re.compile(r"[^A-Z0-9]")

# Crops shorter than this are upscaled before OCR. 96px measured best on the
# held-out demo frames; 128 over-smooths and 64 loses stroke detail.
_TARGET_HEIGHT = 96


def _preprocess(crop: np.ndarray) -> np.ndarray:
    h, w = crop.shape[:2]
    if 0 < h < _TARGET_HEIGHT:
        scale = _TARGET_HEIGHT / h
        crop = cv2.resize(
            crop,
            (max(1, int(w * scale)), _TARGET_HEIGHT),
            interpolation=cv2.INTER_CUBIC,
        )
    return cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)


def _in_reading_order(results: list) -> list[dict]:
    """Sort EasyOCR boxes top-to-bottom, then left-to-right within each line.

    Two-line plates ("MH02" above "BT6482") come back from EasyOCR in arbitrary
    order; sorting purely by x would emit "BT6482MH02".
    """
    items = []
    for box, text, conf in results:
        pts = np.asarray(box, dtype=np.float32)
        items.append(
            {
                "text": text,
                "conf": float(conf),
                "x": float(pts[:, 0].min()),
                "y_center": float(pts[:, 1].mean()),
                "height": float(pts[:, 1].max() - pts[:, 1].min()),
            }
        )

    items.sort(key=lambda i: i["y_center"])

    ordered: list[dict] = []
    line: list[dict] = []
    for item in items:
        if line:
            prev = line[-1]
            same_line = abs(item["y_center"] - prev["y_center"]) < 0.6 * max(
                prev["height"], item["height"], 1.0
            )
            if not same_line:
                ordered.extend(sorted(line, key=lambda i: i["x"]))
                line = []
        line.append(item)
    if line:
        ordered.extend(sorted(line, key=lambda i: i["x"]))

    return ordered


def read_plate(crop) -> tuple[str, float]:
    """crop: BGR numpy array of just the plate. Returns (text, confidence)."""
    if crop is None or getattr(crop, "size", 0) == 0:
        return "", 0.0

    try:
        results = _READER.readtext(_preprocess(crop), detail=1, paragraph=False)
    except Exception:
        # OCR must never be the reason a request fails.
        return "", 0.0

    if not results:
        return "", 0.0

    # A plate is often split across several boxes; join them in reading order
    # and average confidence weighted by how much text each box contributed.
    parts: list[str] = []
    weighted, total_len = 0.0, 0
    for item in _in_reading_order(results):
        cleaned = _NON_ALNUM.sub("", item["text"].upper())
        if not cleaned:
            continue
        parts.append(cleaned)
        weighted += item["conf"] * len(cleaned)
        total_len += len(cleaned)

    if not parts:
        return "", 0.0

    return "".join(parts), round(weighted / total_len, 4)
