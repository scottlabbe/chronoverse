from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from app.core.config import Settings, get_settings
from app.core.types import PoemRequest, PoemResponse, Tone
from app.adapters.registry import OpenAIAdapter
from app.services.poem_service import generate_poem, TONE_STYLE

router = APIRouter(prefix="/api")

def get_adapter(cfg: Settings = Depends(get_settings)) -> OpenAIAdapter:
    return OpenAIAdapter(api_key=cfg.OPENAI_API_KEY)

@router.post("/poem", response_model=PoemResponse)
async def post_poem(req: PoemRequest, bg: BackgroundTasks,
                    cfg: Settings = Depends(get_settings),
                    adapter: OpenAIAdapter = Depends(get_adapter)):
    if req.tone not in TONE_STYLE: raise HTTPException(400, f"Invalid tone. Valid: {list(TONE_STYLE)}")
    return await generate_poem(cfg, adapter, req.tone, req.timezone, req.format, req.forceNew, bg)