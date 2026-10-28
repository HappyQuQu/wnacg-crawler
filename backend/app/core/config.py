import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

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
    theme: Literal["light", "dark", "system"] = "system"
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8080
    download_path: Path = Path("./data")
    db_path: Path = Path("./config/data.sqlite")
    is_zip: bool = True
    enable_image_compression: bool = False
    image_max_size_kb: int = Field(default=1024, ge=1, le=102400)
    keep_original_images: bool = True
    allow_image_resize: bool = False
    max_thread: int = Field(default=6, ge=1, le=20)
    max_active_tasks: int = Field(default=2, ge=1, le=20)
    re_count: int = Field(default=5, ge=1, le=12)  # deprecated: unused, kept for config compat
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

    # Playwright / anti-403
    fetch_mode: str = Field(default="auto", pattern="^(http|browser|auto)$")
    enable_browser: bool = True
    browser_headless: bool = True
    browser_state_path: str = ""
    debug_save_on_fail: bool = True
    crawler_min_delay: float = Field(default=2.0, ge=0)
    crawler_max_delay: float = Field(default=5.0, ge=0)
    crawler_max_retry: int = Field(default=2, ge=0, le=10)
    crawler_403_backoff: float = Field(default=30.0, ge=0)
    enable_stealth: bool = True

    model_config = SettingsConfigDict(
        env_prefix="WNACG_",
        env_nested_delimiter="__",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class _ConfigPathSettings(BaseSettings):
    config_path: Path = Path("./config/config.local.json")

    model_config = SettingsConfigDict(
        env_prefix="WNACG_", env_file=".env", env_file_encoding="utf-8", extra="ignore",
    )


def get_config_path() -> Path:
    return _ConfigPathSettings().config_path


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
    file_config = load_file_config()
    overrides = Settings().model_dump(exclude_unset=True)
    merged = {**file_config, **overrides}
    if "proxy" in overrides:
        merged["proxy"] = {**file_config.get("proxy", {}), **overrides["proxy"]}
    return Settings(**merged)


def reload_settings() -> Settings:
    get_settings.cache_clear()
    return get_settings()
