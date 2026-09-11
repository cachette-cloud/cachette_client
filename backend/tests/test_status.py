import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.service.status_service import (
    format_bytes,
    check_tunnel,
    get_node_status,
)


def test_format_bytes():
    """Verify human-readable byte conversions across magnitudes."""
    assert format_bytes(0) == "0 B"
    assert format_bytes(500) == "500 B"
    assert format_bytes(1024) == "1.00 KB"
    assert format_bytes(1024 * 1024) == "1.00 MB"
    assert format_bytes(1024 * 1024 * 1024 * 2) == "2.00 GB"
    assert format_bytes(None) == "0 B"
    assert format_bytes(-1) == "0 B"


@pytest.mark.asyncio
async def test_check_tunnel_connected():
    """Verify tunnel reports connected when cloudflared returns 200."""
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        result = await check_tunnel()
        assert result["status"] == "connected"


@pytest.mark.asyncio
async def test_check_tunnel_disconnected():
    """Verify tunnel reports disconnected gracefully when daemon is offline."""
    with patch("httpx.AsyncClient.get", side_effect=Exception("Connection refused")):
        result = await check_tunnel()
        assert result["status"] == "disconnected"
        assert "offline" in result["message"].lower() or "unreachable" in result["message"].lower()


@pytest.mark.asyncio
async def test_get_node_status_structure():
    """Verify get_node_status consolidates all 3 data points without throwing."""
    status = await get_node_status()

    assert "running_state" in status
    assert status["running_state"] in ("healthy", "degraded", "unhealthy")
    assert "services" in status
    assert "postgres" in status["services"]
    assert "redis" in status["services"]
    assert "s3" in status["services"]
    assert "disk" in status["storage"]
    assert "total_human" in status["storage"]["disk"]
    assert "cachette" in status["storage"]
    assert "tunnel" in status


@pytest.mark.asyncio
async def test_status_endpoint_html():
    """Verify GET /status serves self-contained HTML when requested by browser."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/status", headers={"Accept": "text/html"})
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        content = response.text
        assert "<!DOCTYPE html>" in content
        assert "Cachette Node" in content
        assert "Core Services" in content
        assert "Storage Utilization" in content
        assert "Cloudflared Tunnel" in content


@pytest.mark.asyncio
async def test_status_endpoint_json():
    """Verify GET /status.json or format=json serves valid structured JSON."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Test direct JSON path /status.json
        resp_path = await client.get("/status.json")
        assert resp_path.status_code == 200
        data_path = resp_path.json()
        assert "running_state" in data_path
        assert "services" in data_path
        assert "storage" in data_path
        assert "tunnel" in data_path

        # Test query parameter ?format=json
        resp_query = await client.get("/status?format=json")
        assert resp_query.status_code == 200
        data_query = resp_query.json()
        assert data_query["running_state"] == data_path["running_state"]

        # Test Accept: application/json header
        resp_header = await client.get("/status", headers={"Accept": "application/json"})
        assert resp_header.status_code == 200
        assert "running_state" in resp_header.json()
