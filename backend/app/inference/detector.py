"""YOLO plate detector running on onnxruntime (CPU).

Model I/O (see model_info.txt):
    input  : float32 [1, 3, 640, 640]  RGB, /255, NCHW
    output : float32 [1, 5, 8400]      cx, cy, w, h, conf  (input-pixel coords)
"""

from __future__ import annotations

import cv2
import numpy as np
import onnxruntime as ort

from app.config import WEIGHTS_PATH, settings

# Session is built once at import time. Rebuilding it per call costs ~1.5s.
_SESSION = ort.InferenceSession(
    str(WEIGHTS_PATH), providers=["CPUExecutionProvider"]
)
_INPUT_NAME = _SESSION.get_inputs()[0].name
_, _, _IN_H, _IN_W = _SESSION.get_inputs()[0].shape

Detection = tuple[int, int, int, int, float]


def _preprocess(frame: np.ndarray) -> np.ndarray:
    """BGR HxWx3 uint8 -> float32 [1, 3, IN_H, IN_W] RGB, /255, NCHW."""
    resized = cv2.resize(frame, (_IN_W, _IN_H), interpolation=cv2.INTER_LINEAR)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    chw = rgb.transpose(2, 0, 1).astype(np.float32) / 255.0
    return np.expand_dims(chw, axis=0)


def detect(
    frame: np.ndarray,
    conf_threshold: float | None = None,
    iou_threshold: float | None = None,
) -> list[Detection]:
    """Detect plates in a BGR frame.

    Returns [(x1, y1, x2, y2, confidence), ...] in *original* frame coordinates,
    already de-duplicated by NMS and sorted by descending confidence.
    """
    conf_threshold = (
        settings.det_conf_threshold if conf_threshold is None else conf_threshold
    )
    iou_threshold = (
        settings.nms_iou_threshold if iou_threshold is None else iou_threshold
    )

    if frame is None or frame.size == 0:
        return []

    orig_h, orig_w = frame.shape[:2]
    outputs = _SESSION.run(None, {_INPUT_NAME: _preprocess(frame)})
    preds = np.squeeze(outputs[0], axis=0)  # (5, 8400) or (8400, 5)

    # Normalise to 8400 rows of [cx, cy, w, h, conf].
    if preds.shape[0] == 5 and preds.shape[1] != 5:
        preds = preds.T

    scores = preds[:, 4]
    keep = scores > conf_threshold
    if not np.any(keep):
        return []

    preds = preds[keep]
    scores = scores[keep]

    # Model coords are in 640x640 input space; rescale to the original frame.
    scale_x = orig_w / _IN_W
    scale_y = orig_h / _IN_H

    cx, cy, w, h = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
    x1 = (cx - w / 2) * scale_x
    y1 = (cy - h / 2) * scale_y
    bw = w * scale_x
    bh = h * scale_y

    # cv2.dnn.NMSBoxes wants [x, y, w, h] boxes.
    boxes_xywh = np.stack([x1, y1, bw, bh], axis=1).tolist()
    scores_list = scores.astype(float).tolist()

    indices = cv2.dnn.NMSBoxes(
        boxes_xywh, scores_list, conf_threshold, iou_threshold
    )
    if len(indices) == 0:
        return []
    indices = np.asarray(indices).flatten()

    detections: list[Detection] = []
    for i in indices:
        bx, by, bwi, bhi = boxes_xywh[i]
        # Clamp to frame bounds so the crop is always valid.
        px1 = max(0, min(orig_w - 1, int(round(bx))))
        py1 = max(0, min(orig_h - 1, int(round(by))))
        px2 = max(0, min(orig_w, int(round(bx + bwi))))
        py2 = max(0, min(orig_h, int(round(by + bhi))))
        if px2 <= px1 or py2 <= py1:
            continue
        detections.append((px1, py1, px2, py2, float(scores_list[i])))

    detections.sort(key=lambda d: d[4], reverse=True)
    return detections
