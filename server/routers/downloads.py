import asyncio
import ipaddress
import mimetypes
import re
import socket
from pathlib import PurePosixPath
from urllib.parse import quote, unquote, urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from auth import get_current_user


router = APIRouter(prefix="/api", tags=["downloads"])

_MAX_IMAGE_BYTES = 50 * 1024 * 1024
_REDIRECT_CODES = {301, 302, 303, 307, 308}
_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}


class ImageDownloadRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)


async def _validate_remote_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(400, "仅支持公网 HTTPS 图片")

    try:
        addresses = await asyncio.to_thread(
            socket.getaddrinfo,
            parsed.hostname,
            parsed.port or 443,
            type=socket.SOCK_STREAM,
        )
    except OSError:
        raise HTTPException(400, "图片地址无法解析")

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0].split("%", 1)[0])
        if not ip.is_global:
            raise HTTPException(400, "图片地址不允许访问内网")


def _download_filename(url: str, content_type: str) -> str:
    name = unquote(PurePosixPath(urlparse(url).path).name)
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip(" .")
    if not name:
        name = "infinite-canvas-image"
    extension = _EXTENSIONS.get(content_type) or mimetypes.guess_extension(content_type) or ""
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff", ".svg"}
    if PurePosixPath(name).suffix.lower() not in allowed_extensions:
        name = f"{PurePosixPath(name).stem or 'infinite-canvas-image'}{extension}"
    return name[:180]


@router.post("/download-image")
async def download_image(body: ImageDownloadRequest, _user: dict = Depends(get_current_user)):
    current_url = body.url
    timeout = httpx.Timeout(120.0, connect=15.0)

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            for _ in range(6):
                await _validate_remote_url(current_url)
                async with client.stream("GET", current_url) as upstream:
                    if upstream.status_code in _REDIRECT_CODES:
                        location = upstream.headers.get("location")
                        if not location:
                            raise HTTPException(502, "图片重定向地址缺失")
                        current_url = urljoin(current_url, location)
                        continue

                    if upstream.status_code >= 400:
                        raise HTTPException(502, f"图片下载失败: {upstream.status_code}")

                    content_type = upstream.headers.get("content-type", "").split(";", 1)[0].lower()
                    if not content_type.startswith("image/"):
                        raise HTTPException(415, "目标地址不是图片")

                    content_length = upstream.headers.get("content-length")
                    if content_length:
                        try:
                            if int(content_length) > _MAX_IMAGE_BYTES:
                                raise HTTPException(413, "图片超过 50 MB")
                        except ValueError:
                            raise HTTPException(502, "图片响应大小无效")

                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in upstream.aiter_bytes():
                        total += len(chunk)
                        if total > _MAX_IMAGE_BYTES:
                            raise HTTPException(413, "图片超过 50 MB")
                        chunks.append(chunk)

                    filename = _download_filename(current_url, content_type)
                    disposition = f"attachment; filename=image; filename*=UTF-8''{quote(filename)}"
                    return Response(
                        content=b"".join(chunks),
                        media_type=content_type,
                        headers={"Content-Disposition": disposition},
                    )
    except httpx.HTTPError as exc:
        raise HTTPException(502, "图片服务不可达") from exc

    raise HTTPException(502, "图片重定向次数过多")
