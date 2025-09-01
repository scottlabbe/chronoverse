from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.routes import poems
from app.data.events import init_db

setup_logging(); init_db()
app = FastAPI(title="ChronoVerse", version="1.2")

cfg = get_settings()
app.add_middleware(CORSMiddleware, allow_origins=cfg.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

@app.get("/healthz") 
async def healthz(): return {"ok": True}
app.include_router(poems.router)