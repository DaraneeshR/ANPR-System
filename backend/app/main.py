from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import DEMO_FRAMES_DIR, STORAGE_DIR, settings
from app.db.session import init_db
from app.inference.pipeline import ANPRPipeline
from app.routers import anpr, logs, vehicles


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Built once here: the ONNX session and the OCR reader both load model
    # weights, which is the difference between 80ms and 2s per request.
    app.state.pipeline = ANPRPipeline()
    yield


app = FastAPI(title="ANPR Vehicle Access", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")
if DEMO_FRAMES_DIR.exists():
    app.mount(
        "/demo-frames", StaticFiles(directory=DEMO_FRAMES_DIR), name="demo-frames"
    )

app.include_router(anpr.router)
app.include_router(logs.router)
app.include_router(vehicles.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
