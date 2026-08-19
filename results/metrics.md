# Results

Measured on the 100 held-out demo frames (never seen during training).

## Detection

| Metric | Value |
| --- | --- |
| Frames evaluated | 100 |
| Frames producing a box | 100 (100%) |
| Frames with exactly 1 box after NMS | 94 |
| Max boxes on any frame | 2 |
| Mean detection confidence | 0.795 |

## Recognition (29 real-plate frames)

| Metric | Value |
| --- | --- |
| Exact plate matches | 18/29 (62%) |
| Mean character accuracy | 91.6% |
| Near misses (>=80% chars correct) | 7 |
| Mean OCR confidence | 0.605 |

## Latency (CPU, full pipeline)

| Metric | Value |
| --- | --- |
| Mean per frame | 121 ms |
| 95th percentile | 197 ms |

## Near-miss detail

Single-character confusions are the dominant failure mode; these are exactly
what the `corrected_plate` field on each log row captures as retraining data.

| Image | Expected | Predicted | Char accuracy |
| --- | --- | --- | --- |
| `af608b5e-07d6-4bcf-84d0-f0cba9e54e12__` | MH20CS4946 | MH2OCS4946 | 90% |
| `video3_1810.jpg` | MH02BT6482 | MH02BT8482 | 90% |
| `car-ybs-MH47N4570_00000.jpg` | MH47N4570 | VH47N4570 | 89% |
| `video2_3740.jpg` | MH47N2829 | MH47H2829 | 89% |
| `UP16.jpg` | UP32KN7325 | P32K47325 | 80% |
| `video10_1260.jpg` | MH05DS8679 | HO5DS8679 | 80% |
| `video3_1760.jpg` | MH02BT6482 | HH02BT8482 | 80% |

## Graphs

![Detection confidence](graphs/detection_confidence.png)
![OCR confidence](graphs/ocr_confidence.png)
![Recognition outcomes](graphs/recognition_outcomes.png)
![Latency](graphs/latency.png)
