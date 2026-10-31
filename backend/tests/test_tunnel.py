import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.service import tunnel_service


@pytest.fixture(autouse=True)
def reset_tunnel_state():
    tunnel_service._update_state("unpaired", False, None)
    yield
    tunnel_service._update_state("unpaired", False, None)


def test_write_tunnel_token_to_env(tmp_path, monkeypatch):
    root_env = tmp_path / "root.env"
    backend_env = tmp_path / "backend.env"

    root_env.write_text("DATABASE_URL=sqlite:///./cachette.db\nSECRET_KEY=12345\n", encoding="utf-8")

    monkeypatch.setattr(tunnel_service, "ROOT_ENV_PATH", root_env)
    monkeypatch.setattr(tunnel_service, "BACKEND_ENV_PATH", backend_env)

    token = "eyJh...sample_cf_token..."
    tunnel_service.write_tunnel_token_to_env(token)

    root_content = root_env.read_text("utf-8")
    backend_content = backend_env.read_text("utf-8")

    assert "DATABASE_URL=sqlite:///./cachette.db" in root_content
    assert "SECRET_KEY=12345" in root_content
    assert f"CF_TUNNEL_TOKEN={token}" in root_content
    assert f"CF_TUNNEL_TOKEN={token}" in backend_content

    # Updating existing token
    new_token = "new_token_value_999"
    tunnel_service.write_tunnel_token_to_env(new_token)

    root_content_updated = root_env.read_text("utf-8")
    assert f"CF_TUNNEL_TOKEN={new_token}" in root_content_updated
    assert token not in root_content_updated


def test_start_cloudflared_native_success(monkeypatch):
    mock_pm = MagicMock()
    mock_pm.start.return_value = (True, "Cloudflared native process started")
    monkeypatch.setattr(tunnel_service, "get_process_manager", lambda: mock_pm)
    monkeypatch.setattr(tunnel_service, "setup_cloudflared", lambda **kwargs: None)

    success, msg = tunnel_service.start_cloudflared("token123")
    assert success is True
    assert "started" in msg.lower()


def test_start_cloudflared_native_failure(monkeypatch):
    mock_pm = MagicMock()
    mock_pm.start.return_value = (False, "Process failed to spawn")
    monkeypatch.setattr(tunnel_service, "get_process_manager", lambda: mock_pm)
    monkeypatch.setattr(tunnel_service, "setup_cloudflared", lambda **kwargs: None)

    success, msg = tunnel_service.start_cloudflared("token123")
    assert success is False
    assert "Process failed to spawn" in msg


@pytest.mark.asyncio
async def test_start_tunnel_workflow_success(monkeypatch):
    monkeypatch.setattr(tunnel_service, "write_tunnel_token_to_env", lambda token: None)
    monkeypatch.setattr(tunnel_service, "start_cloudflared", lambda token: (True, "Started"))

    async def mock_verify(timeout=30.0, poll_interval=1.0):
        return True, "Tunnel registered successfully"

    monkeypatch.setattr(tunnel_service, "verify_cloudflared_health", mock_verify)

    await tunnel_service.start_tunnel_workflow("test_token")
    status = tunnel_service.get_tunnel_status()

    assert status["status"] == "ready"
    assert status["ready"] is True
    assert status["error"] is None


@pytest.mark.asyncio
async def test_start_tunnel_workflow_start_failure(monkeypatch):
    monkeypatch.setattr(tunnel_service, "write_tunnel_token_to_env", lambda token: None)
    monkeypatch.setattr(tunnel_service, "start_cloudflared", lambda token: (False, "Binary execution error"))

    await tunnel_service.start_tunnel_workflow("test_token")
    status = tunnel_service.get_tunnel_status()

    assert status["status"] == "failed"
    assert status["ready"] is False
    assert "Binary execution error" in status["error"]


@pytest.mark.asyncio
async def test_start_tunnel_workflow_verify_failure(monkeypatch):
    monkeypatch.setattr(tunnel_service, "write_tunnel_token_to_env", lambda token: None)
    monkeypatch.setattr(tunnel_service, "start_cloudflared", lambda token: (True, "Started"))

    async def mock_verify(timeout=30.0, poll_interval=1.0):
        return False, "Registration timeout"

    monkeypatch.setattr(tunnel_service, "verify_cloudflared_health", mock_verify)

    await tunnel_service.start_tunnel_workflow("test_token")
    status = tunnel_service.get_tunnel_status()

    assert status["status"] == "failed"
    assert status["ready"] is False
    assert "Registration timeout" in status["error"]


@pytest.mark.asyncio
async def test_ensure_cloudflared_on_startup_unpaired(tmp_path, monkeypatch):
    non_existent = tmp_path / "non_existent_pairing.json"
    monkeypatch.setattr(tunnel_service, "PAIRING_CREDENTIALS_PATH", non_existent)

    await tunnel_service.ensure_cloudflared_on_startup()
    status = tunnel_service.get_tunnel_status()
    assert status["status"] == "unpaired"
    assert status["ready"] is False


@pytest.mark.asyncio
async def test_ensure_cloudflared_on_startup_paired(tmp_path, monkeypatch):
    pairing_file = tmp_path / "pairing_credentials.json"
    import json
    pairing_file.write_text(
        json.dumps({
            "cf_tunnel_token": "persisted_token_abc",
            "session_token": "valid_session_xyz",
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(tunnel_service, "PAIRING_CREDENTIALS_PATH", pairing_file)

    workflow_called = False

    async def mock_workflow(token: str):
        nonlocal workflow_called
        workflow_called = True
        assert token == "persisted_token_abc"
        tunnel_service._update_state("ready", True, None)

    monkeypatch.setattr(tunnel_service, "start_tunnel_workflow", mock_workflow)

    await tunnel_service.ensure_cloudflared_on_startup()
    assert workflow_called is True
    assert tunnel_service.get_tunnel_status()["status"] == "ready"


@pytest.mark.asyncio
async def test_pairing_status_reporting(client):
    tunnel_service._update_state("ready", True, None)
    res = await client.get("/api/v1/node-pairing/status")
    assert res.status_code == 200
    data = res.json()
    assert data["tunnel_status"] == "ready"
    assert data["tunnel_ready"] is True
