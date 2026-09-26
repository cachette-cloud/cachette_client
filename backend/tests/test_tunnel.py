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

    # Seed root_env with existing variables
    root_env.write_text("DATABASE_URL=postgres://localhost\nSECRET_KEY=12345\n", encoding="utf-8")

    monkeypatch.setattr(tunnel_service, "ROOT_ENV_PATH", root_env)
    monkeypatch.setattr(tunnel_service, "BACKEND_ENV_PATH", backend_env)

    token = "eyJh...sample_cf_token..."
    tunnel_service.write_tunnel_token_to_env(token)

    root_content = root_env.read_text("utf-8")
    backend_content = backend_env.read_text("utf-8")

    assert "DATABASE_URL=postgres://localhost" in root_content
    assert "SECRET_KEY=12345" in root_content
    assert f"CF_TUNNEL_TOKEN={token}" in root_content
    assert f"CF_TUNNEL_TOKEN={token}" in backend_content

    # Now test updating existing token
    new_token = "new_token_value_999"
    tunnel_service.write_tunnel_token_to_env(new_token)

    root_content_updated = root_env.read_text("utf-8")
    assert f"CF_TUNNEL_TOKEN={new_token}" in root_content_updated
    assert token not in root_content_updated


def test_start_cloudflared_missing_compose_file(tmp_path, monkeypatch):
    non_existent_compose = tmp_path / "docker-compose.yml"
    monkeypatch.setattr(tunnel_service, "DOCKER_COMPOSE_PATH", non_existent_compose)

    success, msg = tunnel_service.start_cloudflared("token123")
    assert success is False
    assert "Docker compose file not found" in msg


def test_start_cloudflared_docker_not_found(tmp_path, monkeypatch):
    fake_compose = tmp_path / "docker-compose.yml"
    fake_compose.write_text("services: {}", encoding="utf-8")
    monkeypatch.setattr(tunnel_service, "DOCKER_COMPOSE_PATH", fake_compose)
    monkeypatch.setattr(tunnel_service, "_get_docker_compose_cmd", lambda: None)

    success, msg = tunnel_service.start_cloudflared("token123")
    assert success is False
    assert "Docker or Docker Compose command not found" in msg


def test_start_cloudflared_daemon_unreachable(tmp_path, monkeypatch):
    fake_compose = tmp_path / "docker-compose.yml"
    fake_compose.write_text("services: {}", encoding="utf-8")
    monkeypatch.setattr(tunnel_service, "DOCKER_COMPOSE_PATH", fake_compose)
    monkeypatch.setattr(tunnel_service, "_get_docker_compose_cmd", lambda: ["docker", "compose"])

    mock_res = MagicMock()
    mock_res.returncode = 1
    mock_res.stdout = ""
    mock_res.stderr = "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?"

    with patch("subprocess.run", return_value=mock_res):
        success, msg = tunnel_service.start_cloudflared("token123")
        assert success is False
        assert "Docker daemon is unreachable" in msg


def test_start_cloudflared_success(tmp_path, monkeypatch):
    fake_compose = tmp_path / "docker-compose.yml"
    fake_compose.write_text("services: {}", encoding="utf-8")
    monkeypatch.setattr(tunnel_service, "DOCKER_COMPOSE_PATH", fake_compose)
    monkeypatch.setattr(tunnel_service, "_get_docker_compose_cmd", lambda: ["docker", "compose"])

    mock_res = MagicMock()
    mock_res.returncode = 0
    mock_res.stdout = "Container cachette-cloudflared-1 Recreated\nContainer cachette-cloudflared-1 Started"
    mock_res.stderr = ""

    with patch("subprocess.run", return_value=mock_res):
        success, msg = tunnel_service.start_cloudflared("token123")
        assert success is True
        assert "started" in msg.lower()


@pytest.mark.asyncio
async def test_verify_cloudflared_health_success(monkeypatch):
    monkeypatch.setattr(tunnel_service, "_get_docker_compose_cmd", lambda: ["docker", "compose"])
    monkeypatch.setattr(
        tunnel_service,
        "_fetch_cloudflared_logs",
        lambda cmd: (0, "2026-09-08T19:00:00Z INF Registered tunnel connection connIndex=0 connection=abc-123\n"),
    )

    success, msg = await tunnel_service.verify_cloudflared_health(timeout=2.0, poll_interval=0.1)
    assert success is True
    assert "registered successfully" in msg.lower()


@pytest.mark.asyncio
async def test_verify_cloudflared_health_invalid_token(monkeypatch):
    monkeypatch.setattr(tunnel_service, "_get_docker_compose_cmd", lambda: ["docker", "compose"])
    monkeypatch.setattr(
        tunnel_service,
        "_fetch_cloudflared_logs",
        lambda cmd: (1, "2026-09-08T19:00:00Z ERR Failed to create tunnel: Invalid tunnel token\n"),
    )

    success, msg = await tunnel_service.verify_cloudflared_health(timeout=2.0, poll_interval=0.1)
    assert success is False
    assert "invalid tunnel token" in msg.lower()


@pytest.mark.asyncio
async def test_start_tunnel_workflow(monkeypatch):
    monkeypatch.setattr(tunnel_service, "write_tunnel_token_to_env", lambda token: None)
    monkeypatch.setattr(tunnel_service, "start_cloudflared", lambda token: (True, "Started"))
    monkeypatch.setattr(tunnel_service, "verify_cloudflared_health", AsyncMock(return_value=(True, "Connected")))

    await tunnel_service.start_tunnel_workflow("test_token")

    status = tunnel_service.get_tunnel_status()
    assert status["status"] == "ready"
    assert status["ready"] is True
    assert status["error"] is None


@pytest.mark.asyncio
async def test_start_tunnel_workflow_failure(monkeypatch):
    monkeypatch.setattr(tunnel_service, "write_tunnel_token_to_env", lambda token: None)
    monkeypatch.setattr(tunnel_service, "start_cloudflared", lambda token: (False, "Docker daemon down"))

    await tunnel_service.start_tunnel_workflow("test_token")

    status = tunnel_service.get_tunnel_status()
    assert status["status"] == "failed"
    assert status["ready"] is False
    assert "Docker daemon down" in status["error"]


@pytest.mark.asyncio
async def test_pairing_status_and_session_tunnel_fields():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/v1/node-pairing/status")
        assert res.status_code == 200
        data = res.json()
        assert "tunnel_status" in data
        assert "tunnel_ready" in data

        session_res = await ac.get("/api/v1/node-pairing/session")
        assert session_res.status_code == 200
        session_data = session_res.json()
        assert "tunnel_status" in session_data
        assert "tunnel_ready" in session_data


@pytest.mark.asyncio
async def test_restart_tunnel_endpoint(monkeypatch):
    fake_creds = {"cf_tunnel_token": "token_abc"}
    monkeypatch.setattr("app.routes.pairing.get_pairing_credentials", lambda: fake_creds)

    mock_workflow = AsyncMock()
    monkeypatch.setattr("app.routes.pairing.start_tunnel_workflow", mock_workflow)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.post("/api/v1/node-pairing/tunnel/restart")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "starting"
