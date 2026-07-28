import pytest

from plugins.image_group import process
from plugins.image_gen import _collect_image_urls


@pytest.mark.asyncio
async def test_image_group_outputs_roles_and_selection():
    items = """[
      {"id":"bg","url":"https://img/bg.png","role":"background"},
      {"id":"fg","url":"https://img/fg.png","role":"foreground"},
      {"id":"ref","url":"https://img/ref.png","role":"reference"}
    ]"""

    result = await process({}, {"items": items, "selected_id": "ref"}, {})

    assert result == {
        "image": "https://img/ref.png",
        "background": "https://img/bg.png",
        "foreground": "https://img/fg.png",
        "references": ["https://img/ref.png"],
        "images": ["https://img/bg.png", "https://img/fg.png", "https://img/ref.png"],
    }


def test_image_gen_collects_group_references_without_duplicates():
    inputs = {
        "image": "https://img/ref-1.png",
        "images": ["https://img/ref-1.png", "https://img/ref-2.png"],
    }

    assert _collect_image_urls(inputs, {}) == [
        "https://img/ref-1.png",
        "https://img/ref-2.png",
    ]
