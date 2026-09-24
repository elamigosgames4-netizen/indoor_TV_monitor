from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
import logging
import os
import re
import time

import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

MEDIA_EXT_TYPE = {".mp4": "video", ".jpg": "photo", ".jpeg": "photo", ".png": "photo"}
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
CACHE_TTL_SECONDS = 45  # in-memory cache so several devices sharing a folder don't hammer Google

# folder_id -> {"ts": float, "data": dict}
_resolve_cache: dict = {}


class DriveItem(BaseModel):
    file_id: str
    name: str
    ext: str
    type: str  # "video" | "photo"


class ResolveResponse(BaseModel):
    folder_id: str
    items: List[DriveItem]
    source: str
    cached: bool = False
    fetched_at: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def natural_key(name: str):
    # "2" after "001": numeric-aware ordering (001, 002, 003, ..., 010, 100)
    return [(0, int(t)) if t.isdigit() else (1, t.lower()) for t in re.split(r"(\d+)", name.lower())]


def extract_folder_id(url: str) -> Optional[str]:
    m = re.search(r"/drive/(?:u/\d+/)?folders/([A-Za-z0-9_-]{20,})", url)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([A-Za-z0-9_-]{20,})", url)
    if m:
        return m.group(1)
    return None


def parse_embedded_folder_view(html: str) -> List[DriveItem]:
    """Parse https://drive.google.com/embeddedfolderview HTML (works for public folders, no API key)."""
    items: List[DriveItem] = []
    for chunk in html.split('<div class="flip-entry"')[1:]:
        id_m = re.search(r"file/d/([A-Za-z0-9_-]{20,})", chunk)
        title_m = re.search(r'class="flip-entry-title">([^<]+)<', chunk)
        if not id_m or not title_m:
            continue
        name = unescape(title_m.group(1)).strip()
        ext = os.path.splitext(name)[1].lower()
        if ext in MEDIA_EXT_TYPE:
            items.append(DriveItem(file_id=id_m.group(1), name=name, ext=ext, type=MEDIA_EXT_TYPE[ext]))
    items.sort(key=lambda i: natural_key(i.name))
    return items


async def resolve_from_google(link: str):
    """Follow redirects (tiny.cc etc.), find the Drive folder id and list media files. No API key needed."""
    async with httpx.AsyncClient(
        follow_redirects=True, timeout=20.0, headers={"User-Agent": USER_AGENT}
    ) as http:
        resp = await http.get(link)
        resp.raise_for_status()
        final_url = str(resp.url)
        folder_id = extract_folder_id(final_url) or extract_folder_id(link)
        if not folder_id:
            raise HTTPException(
                status_code=400,
                detail="O link não aponta para uma pasta do Google Drive. Use o link tiny.cc da pasta ou o link direto da pasta (drive.google.com/drive/folders/...).",
            )
        resource_key = None
        rk = re.search(r"[?&]resourcekey=([^&#]+)", final_url)
        if rk:
            resource_key = rk.group(1)

        url = f"https://drive.google.com/embeddedfolderview?id={folder_id}"
        if resource_key:
            url += f"&resourcekey={resource_key}"
        listing = await http.get(url)
        listing.raise_for_status()
        html = listing.text
        if "flip-entry" in html:
            return folder_id, parse_embedded_folder_view(html), "embeddedfolderview"
        if "accounts.google.com" in html or "solicitar acesso" in html.lower() or "request access" in html.lower():
            raise ValueError("A pasta do Drive não está compartilhada publicamente. Compartilhe como 'Qualquer pessoa com o link'.")
        # Valid public folder with no media files (or empty folder)
        return folder_id, [], "embeddedfolderview"


@api_router.get("/")
async def root():
    return {"message": "Indoor player API"}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


@api_router.get("/drive/resolve", response_model=ResolveResponse)
async def resolve_drive_folder(link: str = Query(..., description="Link tiny.cc ou pasta pública do Google Drive")):
    link = (link or "").strip()
    if not link:
        raise HTTPException(status_code=400, detail="Informe o link da pasta.")
    if not re.match(r"^https?://", link):
        link = "https://" + link

    known_folder_id = extract_folder_id(link)
    now = time.time()

    # Fresh in-memory cache
    if known_folder_id and known_folder_id in _resolve_cache:
        cached = _resolve_cache[known_folder_id]
        if now - cached["ts"] < CACHE_TTL_SECONDS:
            return ResolveResponse(**{**cached["data"], "cached": True})

    try:
        folder_id, items, source = await resolve_from_google(link)
    except HTTPException:
        raise
    except Exception as exc:
        # Google unreachable / parsing broke / not public: serve the last good listing so
        # devices keep working (they still keep their own local copy if the backend fails).
        if known_folder_id and known_folder_id in _resolve_cache:
            return ResolveResponse(**{**_resolve_cache[known_folder_id]["data"], "cached": True})
        doc = await db.drive_cache.find_one({"_id": known_folder_id or link})
        if doc and isinstance(doc.get("data"), dict):
            return ResolveResponse(**{**doc["data"], "cached": True})
        logger.error(f"drive resolve failed for {link}: {exc}")
        if isinstance(exc, ValueError):
            raise HTTPException(status_code=400, detail=str(exc))
        raise HTTPException(
            status_code=502,
            detail="Não foi possível ler a pasta do Google Drive agora. Verifique o link, o compartilhamento público e a conexão.",
        )

    data = {
        "folder_id": folder_id,
        "items": [item.model_dump() for item in items],
        "source": source,
        "fetched_at": utc_now_iso(),
    }
    _resolve_cache[folder_id] = {"ts": time.time(), "data": data}
    await db.drive_cache.update_one(
        {"_id": folder_id},
        {"$set": {"data": data, "updated_at": utc_now_iso()}},
        upsert=True,
    )
    return ResolveResponse(**data)


class HeartbeatIn(BaseModel):
    server_url: str = Field(..., description="URL do servidor de monitoramento configurado no aparelho")
    tv_code: str
    status: str = "online"
    timestamp: Optional[str] = None
    app_version: Optional[str] = None


class HeartbeatOut(BaseModel):
    ok: bool
    status_code: int
    response_snippet: Optional[str] = None
    error: Optional[str] = None


@api_router.post("/monitor/heartbeat", response_model=HeartbeatOut)
async def proxy_heartbeat(body: HeartbeatIn):
    """Forwards the heartbeat to the URL configured on the device. Existing to
    bypass browser CORS in the preview and to give the app one uniform code path
    on web and native.
    """
    server_url = (body.server_url or "").strip()
    if not re.match(r"^https?://", server_url):
        raise HTTPException(status_code=400, detail="URL do servidor de monitoramento inválida.")
    payload = {
        "tv_code": body.tv_code.strip(),
        "status": body.status or "online",
        "timestamp": body.timestamp or utc_now_iso(),
        "app_version": body.app_version or "unknown",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as http:
            resp = await http.post(
                server_url,
                json=payload,
                headers={
                    "Accept": "application/json",
                    # Custom UA: many shared hosts (Mod_Security) block the generic
                    # Chrome UA on POSTs. This UA is uniquely ours and consistently accepted.
                    "User-Agent": f"TVIndoorPlayer/{body.app_version or '1.0.0'}",
                },
            )
        snippet = (resp.text or "")[:200]
        return HeartbeatOut(
            ok=resp.is_success,
            status_code=resp.status_code,
            response_snippet=snippet,
            error=None if resp.is_success else f"Servidor respondeu HTTP {resp.status_code}",
        )
    except httpx.TimeoutException:
        return HeartbeatOut(ok=False, status_code=0, response_snippet=None, error="Tempo esgotado ao contatar o servidor de monitoramento.")
    except Exception as exc:
        return HeartbeatOut(ok=False, status_code=0, response_snippet=None, error=f"Falha ao enviar heartbeat: {exc}")


@api_router.get("/drive/stream")
async def stream_drive_file(id: str = Query(..., description="Google Drive file id")):
    """Streams a public Drive file through the backend so the web preview (and any
    device that struggles with the redirect chain) can render it without hitting
    Google's HTML confirmation page or CORS.
    """
    file_id = id.strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", file_id):
        raise HTTPException(status_code=400, detail="Id de arquivo do Drive inválido.")
    url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
    client_http = httpx.AsyncClient(timeout=None, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    try:
        req = client_http.build_request("GET", url)
        resp = await client_http.send(req, stream=True)
    except Exception as exc:
        await client_http.aclose()
        raise HTTPException(status_code=502, detail=f"Falha ao contatar Google Drive: {exc}")
    if resp.status_code >= 400:
        await resp.aclose()
        await client_http.aclose()
        raise HTTPException(status_code=resp.status_code, detail="Google Drive retornou erro para este arquivo.")
    media_type = resp.headers.get("content-type", "application/octet-stream")

    async def iterator():
        try:
            async for chunk in resp.aiter_bytes(65536):
                yield chunk
        finally:
            await resp.aclose()
            await client_http.aclose()

    return StreamingResponse(iterator(), media_type=media_type)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
