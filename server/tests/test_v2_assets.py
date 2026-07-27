import io

import pytest
from PIL import Image

from routers.v2_assets import create_thumbnail, inspect_image


def image_bytes(image_format="PNG", size=(80, 60)):
    output = io.BytesIO()
    Image.new("RGB", size, "#ff8fa3").save(output, format=image_format)
    return output.getvalue()


def test_inspect_image_uses_file_content():
    mime_type, width, height, extension = inspect_image(image_bytes("PNG"))
    assert (mime_type, width, height, extension) == ("image/png", 80, 60, ".png")


def test_create_thumbnail_limits_dimensions():
    thumbnail = create_thumbnail(image_bytes(size=(1200, 800)))
    with Image.open(io.BytesIO(thumbnail)) as image:
        assert image.format == "WEBP"
        assert image.width <= 480
        assert image.height <= 480


def test_inspect_image_rejects_non_image():
    with pytest.raises(ValueError, match="有效图片"):
        inspect_image(b"not-an-image")
