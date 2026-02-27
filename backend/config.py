from pathlib import Path
from typing import Any, Tuple, Type

from pydantic import BaseModel
from pydantic_settings import (
    BaseSettings,
    JsonConfigSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

# Docker 路径优先，本地开发 fallback 到 ./config/config.json
_DOCKER_CONFIG  = Path("/config/config.json")
_LOCAL_CONFIG   = Path("./config/config.json")


def _config_file() -> Path:
    """返回实际可读的配置文件路径"""
    if _DOCKER_CONFIG.exists():
        return _DOCKER_CONFIG
    return _LOCAL_CONFIG


class ProxyConfig(BaseModel):
    is_proxy: bool = False
    address: str = "127.0.0.1"
    port: int = 7890
    username: str = ""
    password: str = ""


class AppConfig(BaseSettings):
    is_zip: bool = True
    max_thread: int = 10
    re_count: int = 5
    download_path: str = "/data"
    db_path: str = "/config/data.sqlite"
    manga_main_url: str = "https://www.wnacg.com"
    manga_page_url: str = "https://www.wnacg.com/photos-index-page-{page}-aid-{aid}.html"
    proxy: ProxyConfig = ProxyConfig()

    model_config = SettingsConfigDict(
        json_file=str(_config_file()),
        json_file_encoding="utf-8",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: Type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        **kwargs: Any,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        sources: list[PydanticBaseSettingsSource] = [init_settings]
        cfg_file = _config_file()
        if cfg_file.exists():
            sources.append(JsonConfigSettingsSource(settings_cls))
        sources.append(env_settings)
        return tuple(sources)


# 单例
_config: AppConfig | None = None


def get_config() -> AppConfig:
    global _config
    if _config is None:
        _config = AppConfig()
    return _config


def reload_config() -> AppConfig:
    """强制重新从文件加载配置（保存设置后调用）"""
    global _config
    _config = AppConfig()
    return _config
