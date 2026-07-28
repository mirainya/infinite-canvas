from v2_graph import GraphNode
import pytest

from v2_executor import estimate_node_cost
from v2_worker import _local_node_output


def test_image_collection_includes_connected_and_uploaded_images():
    node = GraphNode(
        id="images",
        type="image-collection",
        data={"items": ["https://xfs.example/uploaded.png"]},
    )

    output = _local_node_output(
        node,
        {"images": ["https://xfs.example/connected.png"]},
    )

    assert output == {
        "image": "https://xfs.example/connected.png",
        "images": [
            "https://xfs.example/connected.png",
            "https://xfs.example/uploaded.png",
        ],
    }


@pytest.mark.asyncio
async def test_image_split_does_not_charge_credits():
    node = GraphNode(id="split", type="image-split", data={"rows": 2, "columns": 2})

    assert await estimate_node_cost(node, {"image": "https://xfs.example/source.png"}) == 0
