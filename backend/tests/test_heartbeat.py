# Tests for POST /api/monitor/heartbeat (iteration 5)
# Focus: GET forwarding with `codigo` param, normalization, URL preservation.
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Fallback: read the frontend .env because the backend proxy is the public URL
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")
ENDPOINT = f"{BASE_URL}/api/monitor/heartbeat"
FALACOM = "https://falacom.com.br/tv-monitor/api/heartbeat.php"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestHeartbeatFalacom:
    def test_plain_code(self, api):
        r = api.post(ENDPOINT, json={
            "server_url": FALACOM,
            "tv_code": "WEYEN_LOJA_01",
            "app_version": "1.0.0",
        }, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True, j
        assert j["method"] == "GET"
        assert j["status_code"] == 200
        assert j["request_url"] == f"{FALACOM}?codigo=WEYEN_LOJA_01"
        assert j["codigo_sent"] == "WEYEN_LOJA_01"
        assert j["codigo_raw_length"] == 13
        assert j["codigo_clean_length"] == 13
        assert j.get("response_snippet", "").strip().upper().startswith("OK")

    def test_surrounding_spaces(self, api):
        r = api.post(ENDPOINT, json={
            "server_url": FALACOM,
            "tv_code": " WEYEN_LOJA_01 ",
            "app_version": "1.0.0",
        }, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["request_url"].endswith("?codigo=WEYEN_LOJA_01"), j["request_url"]
        assert "%20" not in j["request_url"]
        assert j["codigo_sent"] == "WEYEN_LOJA_01"
        assert j["codigo_raw_length"] == 15
        assert j["codigo_clean_length"] == 13

    def test_zero_width_space(self, api):
        r = api.post(ENDPOINT, json={
            "server_url": FALACOM,
            "tv_code": "WEYEN_LOJA_01\u200B",
            "app_version": "1.0.0",
        }, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["codigo_sent"] == "WEYEN_LOJA_01"
        assert j["codigo_clean_length"] < j["codigo_raw_length"]
        assert j["codigo_clean_length"] == 13

    def test_tabs_newlines(self, api):
        r = api.post(ENDPOINT, json={
            "server_url": FALACOM,
            "tv_code": "\tWEYEN_\nLOJA_01\r",
            "app_version": "1.0.0",
        }, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["codigo_sent"] == "WEYEN_LOJA_01"
        assert j["request_url"].endswith("?codigo=WEYEN_LOJA_01")


class TestHeartbeatURLPreservation:
    def test_existing_query_preserved(self, api):
        r = api.post(ENDPOINT, json={
            "server_url": "https://httpbin.org/get?foo=bar",
            "tv_code": "WEYEN_LOJA_01",
        }, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        url = j["request_url"]
        assert "foo=bar" in url
        assert "codigo=WEYEN_LOJA_01" in url
        assert j["ok"] is True

    def test_existing_codigo_is_replaced(self, api):
        r = api.post(ENDPOINT, json={
            "server_url": "https://httpbin.org/get?codigo=OLD",
            "tv_code": "WEYEN_LOJA_01",
        }, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        url = j["request_url"]
        # exactly one codigo param
        assert url.count("codigo=") == 1
        assert "codigo=WEYEN_LOJA_01" in url
        assert "codigo=OLD" not in url


class TestHeartbeatValidation:
    def test_invalid_server_url(self, api):
        r = api.post(ENDPOINT, json={
            "server_url": "not-a-url",
            "tv_code": "WEYEN_LOJA_01",
        }, timeout=15)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        # Portuguese message
        assert "URL" in detail or "inv" in detail.lower()
