from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent

WEIGHTS_PATH = APP_DIR / "weights" / "plate_detector.onnx"
STORAGE_DIR = APP_DIR / "storage"
CROPS_DIR = STORAGE_DIR / "crops"
FRAMES_DIR = STORAGE_DIR / "frames"
DEMO_FRAMES_DIR = BACKEND_DIR / "demo_frames"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", extra="ignore"
    )

    database_url: str = "postgresql+psycopg2://anpr:anpr@localhost:5436/anpr"
    det_conf_threshold: float = 0.25
    nms_iou_threshold: float = 0.45
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

for _d in (CROPS_DIR, FRAMES_DIR):
    _d.mkdir(parents=True, exist_ok=True)
