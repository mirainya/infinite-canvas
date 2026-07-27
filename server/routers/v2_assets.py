"""V2 素材库 API。"""

import io
import json
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from PIL import Image, UnidentifiedImageError

from auth import get_current_user
from db import get_pool
from xfs import upload_bytes

router = APIRouter(prefix="/api/v2/assets", tags=["v2-assets"])

MAX_IMAGE_BYTES = 20 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def inspect_image(raw: bytes) -> tuple[str, int, int, str]:
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("图片大小必须在 20 MB 以内")
    try:
        with Image.open(io.BytesIO(raw)) as image:
            image.verify()
        with Image.open(io.BytesIO(raw)) as image:
            image_format = (image.format or "").upper()
            mime_type = ALLOWED_FORMATS.get(image_format)
            if not mime_type:
                raise ValueError("仅支持 JPG、PNG 和 WebP")
            width, height = image.size
            if width < 1 or height < 1 or width * height > 100_000_000:
                raise ValueError("图片尺寸无效或像素过大")
            extension = ".jpg" if image_format == "JPEG" else f".{image_format.lower()}"
            return mime_type, width, height, extension
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("文件不是有效图片") from exc


def create_thumbnail(raw: bytes, size: tuple[int, int] = (480, 480)) -> bytes:
    with Image.open(io.BytesIO(raw)) as image:
        image.thumbnail(size)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=82, method=4)
        return output.getvalue()


@router.post("", status_code=201)
async def upload_asset(
    file: UploadFile = File(...),
    project_id: uuid.UUID | None = Form(default=None),
    kind: str = Form(default="image", pattern="^(image|mask|output)$"),
    user: dict = Depends(get_current_user),
):
    raw = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        mime_type, width, height, extension = inspect_image(raw)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    owner_id = int(user["sub"])
    pool = await get_pool()
    if project_id:
        owns_project = await pool.fetchval(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL)",
            project_id, owner_id,
        )
        if not owns_project:
            raise HTTPException(404, "项目不存在")

    stem = Path(file.filename or "image").stem[:80] or "image"
    filename = f"{stem}{extension}"
    thumbnail = create_thumbnail(raw)
    asset_id = uuid.uuid4()
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        original_url = await upload_bytes(client, raw, filename, mime_type, "infinite-canvas/assets")
        thumbnail_url = await upload_bytes(
            client, thumbnail, f"{asset_id}.webp", "image/webp", "infinite-canvas/thumbnails"
        )

    row = await pool.fetchrow(
        """INSERT INTO assets
           (id, owner_id, project_id, kind, filename, mime_type, size_bytes,
            width, height, original_url, thumbnail_url, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *""",
        asset_id, owner_id, project_id, kind, filename, mime_type, len(raw), width, height,
        original_url, thumbnail_url, json.dumps({"source": "upload"}),
    )
    return dict(row)


@router.get("")
async def list_assets(
    project_id: uuid.UUID | None = None,
    limit: int = Query(default=60, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    if project_id:
        rows = await pool.fetch(
            "SELECT * FROM assets WHERE owner_id=$1 AND project_id=$2 AND deleted_at IS NULL "
            "ORDER BY created_at DESC LIMIT $3",
            int(user["sub"]), project_id, limit,
        )
    else:
        rows = await pool.fetch(
            "SELECT * FROM assets WHERE owner_id=$1 AND deleted_at IS NULL "
            "ORDER BY created_at DESC LIMIT $2",
            int(user["sub"]), limit,
        )
    return [dict(row) for row in rows]


@router.delete("/{asset_id}")
async def delete_asset(asset_id: uuid.UUID, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE assets SET deleted_at=NOW() WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL",
        asset_id, int(user["sub"]),
    )
    if result == "UPDATE 0":
        raise HTTPException(404, "素材不存在")
    return {"ok": True}
