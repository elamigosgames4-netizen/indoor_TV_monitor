import os

import pytest
import requests


BASE_URL = os.environ["EXPO_BACKEND_URL"].rstrip("/")
FOLDER_LINK = "https://drive.google.com/drive/folders/1HxrMIjxOK8oF5-mR2sOg5OxpYDt4_OD7"


def test_health():
    response = requests.get(f"{BASE_URL}/api/health", timeout=30)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_resolve_public_folder_and_cache():
    first = requests.get(f"{BASE_URL}/api/drive/resolve", params={"link": FOLDER_LINK}, timeout=45)
    assert first.status_code == 200
    body = first.json()
    assert body["folder_id"] == "1HxrMIjxOK8oF5-mR2sOg5OxpYDt4_OD7"
    assert body["source"] == "embeddedfolderview"
    assert len(body["items"]) == 3
    assert [item["type"] for item in body["items"]] == ["video", "video", "video"]
    assert [item["name"] for item in body["items"]] == [
        "LG 4K HDR Demo - Chess.mp4",
        "LG 4K HDR Demo - Cymatic Jazz.mp4",
        "LG 4K HDR Demo - NASA.mp4",
    ]
    second = requests.get(f"{BASE_URL}/api/drive/resolve", params={"link": FOLDER_LINK}, timeout=30)
    assert second.status_code == 200
    assert second.json()["cached"] is True


def test_invalid_link_returns_portuguese_detail():
    response = requests.get(f"{BASE_URL}/api/drive/resolve", params={"link": "https://example.com"}, timeout=30)
    assert response.status_code >= 400
    assert response.json()["detail"]
    assert any(word in response.json()["detail"].lower() for word in ("link", "pasta", "drive"))


def test_empty_link_returns_400_portuguese():
    response = requests.get(f"{BASE_URL}/api/drive/resolve", params={"link": ""}, timeout=30)
    assert response.status_code == 400
    detail = response.json()["detail"]
    # Portuguese error, and NOT a MONGO_URL environment error
    assert "MONGO" not in detail.upper()
    assert any(word in detail.lower() for word in ("link", "pasta", "informe"))
