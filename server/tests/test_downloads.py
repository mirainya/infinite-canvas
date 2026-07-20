import socket

import pytest
from fastapi import HTTPException

from routers import downloads


@pytest.mark.asyncio
async def test_validate_remote_url_accepts_public_https(monkeypatch):
    monkeypatch.setattr(
        downloads.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))],
    )
    await downloads._validate_remote_url("https://images.example.com/file.png")


@pytest.mark.asyncio
@pytest.mark.parametrize("url", [
    "http://images.example.com/file.png",
    "https://127.0.0.1/file.png",
])
async def test_validate_remote_url_rejects_unsafe_targets(monkeypatch, url):
    monkeypatch.setattr(
        downloads.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))],
    )
    with pytest.raises(HTTPException) as exc:
        await downloads._validate_remote_url(url)
    assert exc.value.status_code == 400


def test_download_filename_keeps_image_extension():
    assert downloads._download_filename("https://cdn.example.com/a%20b.png?x=1", "image/png") == "a b.png"
    assert downloads._download_filename("https://cdn.example.com/image", "image/jpeg") == "image.jpg"
