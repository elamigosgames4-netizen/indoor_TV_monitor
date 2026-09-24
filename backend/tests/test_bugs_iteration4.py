"""Backend regression tests for iteration 4: heartbeat proxy + drive stream + regression."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/")

# Known public folder link (from problem statement)
TINY_LINK = "http://tiny.cc/03fc"
# Known valid file id from that folder (from problem statement)
VALID_FILE_ID = "1QO0PvkhodrzMw_8l_g_Lcx2ekRvHP3NX"


# --- Regression: health ---
def test_health_ok():
    r = requests.get(f"{BASE_URL}/api/health", timeout=30)
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# --- Regression: drive resolve for tiny.cc folder ---
def test_drive_resolve_tiny_folder():
    r = requests.get(f"{BASE_URL}/api/drive/resolve", params={"link": TINY_LINK}, timeout=60)
    assert r.status_code == 200
    body = r.json()
    assert body.get("folder_id")
    assert isinstance(body.get("items"), list)
    assert len(body["items"]) >= 1  # Should resolve at least one item
    # First item should have a file_id
    assert body["items"][0].get("file_id")


# --- BUG 1 backend: heartbeat proxy ---
def test_heartbeat_success_to_falacom():
    """Real heartbeat to falacom.com.br must return 200 with ok:true, status_code:200."""
    payload = {
        "server_url": "https://falacom.com.br/tv-monitor/api/heartbeat.php",
        "tv_code": "WEYEN_LOJA_01",
        "status": "online",
        "timestamp": "2026-01-01T00:00:00Z",
        "app_version": "1.0.0",
    }
    r = requests.post(f"{BASE_URL}/api/monitor/heartbeat", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True, body
    assert body.get("status_code") == 200, body


def test_heartbeat_invalid_url_returns_400_portuguese():
    payload = {
        "server_url": "not-a-url",
        "tv_code": "WEYEN_LOJA_01",
        "status": "online",
    }
    r = requests.post(f"{BASE_URL}/api/monitor/heartbeat", json=payload, timeout=30)
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "inválida" in detail.lower() or "url" in detail.lower()


def test_heartbeat_non2xx_upstream_returns_ok_false():
    """When upstream returns 500 (httpbin), backend returns 200 with ok:false, status_code:500."""
    payload = {
        "server_url": "https://httpbin.org/status/500",
        "tv_code": "WEYEN_LOJA_01",
        "status": "online",
    }
    r = requests.post(f"{BASE_URL}/api/monitor/heartbeat", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is False, body
    assert body.get("status_code") == 500, body


# --- BUG 2 backend: drive stream proxy ---
def test_drive_stream_valid_file_returns_image():
    r = requests.get(f"{BASE_URL}/api/drive/stream", params={"id": VALID_FILE_ID}, timeout=60, stream=True)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    # Should be an image type (Google returns image/jpeg for this file)
    assert ct.startswith("image/") or "octet-stream" in ct, ct
    # Non-empty body
    total = 0
    for chunk in r.iter_content(65536):
        total += len(chunk)
        if total > 4096:
            break
    r.close()
    assert total > 0


def test_drive_stream_invalid_id_returns_400_portuguese():
    r = requests.get(f"{BASE_URL}/api/drive/stream", params={"id": "INVALID"}, timeout=30)
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "inválido" in detail.lower() or "id" in detail.lower()


def test_drive_stream_nonexistent_wellformed_id_returns_4xx():
    # 25-char random-looking id that is well-formed but not real
    r = requests.get(
        f"{BASE_URL}/api/drive/stream",
        params={"id": "ZZZZZZZZZZZZZZZZZZZZZZZZZ"},
        timeout=30,
    )
    assert 400 <= r.status_code < 500, r.status_code
