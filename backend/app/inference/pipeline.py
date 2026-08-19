"""Detection + OCR orchestration.

Instantiate ANPRPipeline once, at FastAPI startup, and hang it off app.state.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from app.config import WEIGHTS_PATH


class ANPRPipeline:
    def __init__(
        self,
        det_path: str | Path = WEIGHTS_PATH,
        det_conf_threshold: float | None = None,
        nms_iou_threshold: float | None = None,
    ) -> None:
        # Imported here so constructing the pipeline is what pays the model
        # load cost, at startup, in one place.
        from app.inference import detector, recognizer

        self._detector = detector
        self._recognizer = recognizer
        self.det_path = str(det_path)
        self.det_conf_threshold = det_conf_threshold
        self.nms_iou_threshold = nms_iou_threshold

    def run(self, frame: np.ndarray) -> list[dict]:
        """frame: BGR numpy array. Returns one dict per detected plate:
        {plate, det_conf, ocr_conf, bbox, crop}
        """
        if frame is None or getattr(frame, "size", 0) == 0:
            return []

        detections = self._detector.detect(
            frame,
            conf_threshold=self.det_conf_threshold,
            iou_threshold=self.nms_iou_threshold,
        )

        results: list[dict] = []
        for x1, y1, x2, y2, det_conf in detections:
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            plate, ocr_conf = self._recognizer.read_plate(crop)
            results.append(
                {
                    "plate": plate or None,
                    "det_conf": round(float(det_conf), 4),
                    "ocr_conf": round(float(ocr_conf), 4),
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "crop": crop,
                }
            )
        return results
