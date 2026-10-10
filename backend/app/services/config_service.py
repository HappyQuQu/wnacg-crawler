from secrets import token_urlsafe
from typing import Any

from backend.app.core.config import (
    Settings,
    get_config_path,
    get_settings,
    reload_settings,
    save_file_config,
)
from backend.app.core.schemas import ConfigUpdateRequest
from backend.app.crawler.downloader import downloader

PERSISTED_KEYS = {
    "download_path",
    "db_path",
    "is_zip",
    "enable_image_compression",
    "image_max_size_kb",
    "keep_original_images",
    "allow_image_resize",
    "max_thread",
    "re_count",
    "request_delay_ms",
    "timeout_seconds",
    "user_agent",
    "manga_main_url",
    "manga_page_url",
    "extension_token",
    "proxy",
}


class ConfigService:
    async def get(self) -> dict:
        settings = get_settings()
        return self._response(settings)

    async def update(self, payload: ConfigUpdateRequest) -> dict:
        current = get_settings().model_dump(mode="json")
        patch = payload.model_dump(mode="json", exclude_none=True)
        merged = self._merge(current, patch)
        settings = Settings(**merged)
        saved = self._persistable(settings)
        save_file_config(saved)
        reload_settings()
        await downloader.close()
        return {
            "status": "saved",
            "message": "配置已保存并热重载",
            **self._response(get_settings()),
        }

    async def generate_extension_token(self) -> dict:
        token = token_urlsafe(32)
        request = ConfigUpdateRequest(extension_token=token)
        result = await self.update(request)
        result["extension_token"] = token
        return result

    def _merge(self, current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        merged = {**current, **patch}
        if "proxy" in patch:
            merged["proxy"] = {**current.get("proxy", {}), **patch["proxy"]}
        return merged

    def _persistable(self, settings: Settings) -> dict:
        data = settings.model_dump(mode="json")
        return {key: data[key] for key in PERSISTED_KEYS if key in data}

    def _response(self, settings: Settings) -> dict:
        data = settings.model_dump(mode="json")
        data["config_path"] = str(get_config_path())
        data["extension_token_set"] = bool(settings.extension_token)
        return data


config_service = ConfigService()
