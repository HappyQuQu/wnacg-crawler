import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProxySettings(BaseModel):
    is_proxy: bool = False
    address: str = "127.0.0.1"
    port: int = Field(default=7890, ge=1, le=65535)
    username: str = ""
    password: str = ""


class Settings(BaseSettings):
    app_name: str = "WNACG Downloader"
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8080
    download_path: Path = Path("./data")
    db_path: Path = Path("./config/data.sqlite")
    is_zip: bool = True
    max_thread: int = Field(default=6, ge=1, le=20)
    re_count: int = Field(default=5, ge=1, le=12)
    request_delay_ms: int = Field(default=1200, ge=0, le=10000)
    timeout_seconds: int = Field(default=30, ge=5, le=120)
    user_agent: str = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0 Safari/537.36"
    )
    manga_main_url: str = "https://www.wnacg.com/"
    manga_page_url: str = "https://www.wnacg.com/photos-index-page-{page}-aid-{aid}.html"
    extension_token: str = ""
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    proxy: ProxySettings = ProxySettings()

    model_config = SettingsConfigDict(
        env_prefix="WNACG_",
        env_nested_delimiter="__",
        extra="ignore",
    )


def get_config_path() -> Path:
    return Path(os.getenv("WNACG_CONFIG_PATH", "./config/config.local.json"))


def load_file_config() -> dict[str, Any]:
    path = get_config_path()
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)
    return data if isinstance(data, dict) else {}


def save_file_config(data: dict[str, Any]) -> Path:
    path = get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    with temp_path.open("w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    temp_path.replace(path)
    return path


@lru_cache
def get_settings() -> Settings:
    return Settings(**load_file_config())


def reload_settings() -> Settings:
    get_settings.cache_clear()
    return get_settings()
