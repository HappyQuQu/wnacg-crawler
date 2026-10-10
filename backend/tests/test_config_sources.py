import json
import os

import pytest

from backend.app.core.config import get_config_path, get_settings
from backend.app.core.schemas import ConfigUpdateRequest
from backend.app.services.config_service import config_service


@pytest.fixture
def isolated_config(monkeypatch, tmp_path):
    for name in tuple(os.environ):
        if name.startswith("WNACG_"):
            monkeypatch.delenv(name)
    monkeypatch.chdir(tmp_path)
    path = tmp_path / "config.local.json"
    monkeypatch.setenv("WNACG_CONFIG_PATH", str(path))
    get_settings.cache_clear()
    yield path
    get_settings.cache_clear()


def test_environment_overrides_json_and_dotenv(isolated_config, monkeypatch):
    isolated_config.write_text(json.dumps({"enable_stealth": True, "max_thread": 2}))
    (isolated_config.parent / ".env").write_text(
        "WNACG_ENABLE_STEALTH=true\nWNACG_MAX_THREAD=3\n",
    )
    monkeypatch.setenv("WNACG_ENABLE_STEALTH", "false")
    monkeypatch.setenv("WNACG_MAX_THREAD", "4")
    settings = get_settings()
    assert settings.enable_stealth is False
    assert settings.max_thread == 4


def test_dotenv_overrides_json_with_system_env_unset(isolated_config):
    isolated_config.write_text(json.dumps({"enable_browser": True, "max_thread": 2}))
    (isolated_config.parent / ".env").write_text(
        "WNACG_ENABLE_BROWSER=false\nWNACG_MAX_THREAD=3\n",
    )
    settings = get_settings()
    assert settings.enable_browser is False
    assert settings.max_thread == 3


def test_config_path_can_come_from_dotenv(isolated_config, monkeypatch):
    alternate = isolated_config.parent / "alternate.json"
    alternate.write_text('{"max_thread": 8}')
    (isolated_config.parent / ".env").write_text(f"WNACG_CONFIG_PATH={alternate}\n")
    monkeypatch.delenv("WNACG_CONFIG_PATH")
    assert get_config_path() == alternate
    assert get_settings().max_thread == 8
    monkeypatch.setenv("WNACG_CONFIG_PATH", str(isolated_config))
    assert get_config_path() == isolated_config


def test_nested_proxy_overrides_preserve_other_json_fields(isolated_config, monkeypatch):
    isolated_config.write_text(json.dumps({"proxy": {
        "is_proxy": True, "address": "proxy.example.test", "port": 1234,
        "username": "test-user", "password": "test-placeholder",
    }}))
    (isolated_config.parent / ".env").write_text("WNACG_PROXY__PORT=2345\n")
    monkeypatch.setenv("WNACG_PROXY__PORT", "3456")
    settings = get_settings()
    assert settings.proxy.port == 3456
    assert settings.proxy.address == "proxy.example.test"
    assert settings.proxy.username == "test-user"
    assert settings.proxy.password == "test-placeholder"
    assert settings.proxy.is_proxy


@pytest.mark.asyncio
async def test_saving_preserves_crawler_config_and_unknown_fields(isolated_config):
    original = {"enable_stealth": False, "fetch_mode": "http", "crawler_max_retry": 4,
                "browser_state_path": "custom-state.json", "future_setting": {"enabled": True}}
    isolated_config.write_text(json.dumps(original))
    result = await config_service.update(ConfigUpdateRequest(max_thread=7))
    assert result["max_thread"] == 7
    assert result["enable_stealth"] is False
    assert json.loads(isolated_config.read_text()) == {**original, "max_thread": 7}


@pytest.mark.asyncio
async def test_saving_does_not_copy_environment_secrets_into_json(isolated_config, monkeypatch):
    isolated_config.write_text('{"is_zip": false}')
    monkeypatch.setenv("WNACG_EXTENSION_TOKEN", "test-env-placeholder")
    monkeypatch.setenv("WNACG_PROXY__PASSWORD", "test-proxy-placeholder")
    await config_service.update(ConfigUpdateRequest(max_thread=7))
    assert json.loads(isolated_config.read_text()) == {"is_zip": False, "max_thread": 7}


@pytest.mark.asyncio
async def test_saving_reports_environment_overrides(isolated_config, monkeypatch):
    monkeypatch.setenv("WNACG_MAX_THREAD", "4")
    result = await config_service.update(ConfigUpdateRequest(max_thread=7))
    assert result["max_thread"] == 4
    assert result["overridden_fields"] == ["max_thread"]
    assert json.loads(isolated_config.read_text())["max_thread"] == 7
    monkeypatch.delenv("WNACG_MAX_THREAD")
    get_settings.cache_clear()
    assert get_settings().max_thread == 7


@pytest.mark.asyncio
async def test_partial_proxy_save_preserves_existing_fields(isolated_config):
    original = {"address": "proxy.example.test", "port": 1234, "username": "test-user"}
    isolated_config.write_text(json.dumps({"proxy": original}))
    result = await config_service.update(
        ConfigUpdateRequest.model_validate({"proxy": {"port": 2345}}),
    )
    assert result["proxy"]["address"] == "proxy.example.test"
    assert result["overridden_fields"] == []
    assert json.loads(isolated_config.read_text())["proxy"] == {**original, "port": 2345}


@pytest.mark.asyncio
async def test_token_response_reports_active_environment_token(isolated_config, monkeypatch):
    monkeypatch.setenv("WNACG_EXTENSION_TOKEN", "test-env-placeholder")
    result = await config_service.generate_extension_token()
    assert result["extension_token"] == "test-env-placeholder"
    assert result["overridden_fields"] == ["extension_token"]


@pytest.mark.asyncio
async def test_path_normalization_is_not_reported_as_environment_override(isolated_config):
    result = await config_service.update(ConfigUpdateRequest(download_path="./downloads"))
    assert result["overridden_fields"] == []
