from secrets import token_urlsafe
from typing import Any

from backend.app.core.config import (
    Settings,
    get_config_path,
    get_settings,
    load_file_config,
    reload_settings,
    save_file_config,
)
from backend.app.core.schemas import ConfigUpdateRequest
from backend.app.crawler.downloader import downloader


class ConfigService:
    async def get(self) -> dict:
        settings = get_settings()
        return self._response(settings)

    async def update(self, payload: ConfigUpdateRequest) -> dict:
        current = get_settings().model_dump(mode="json")
        patch = payload.model_dump(mode="json", exclude_none=True, exclude_unset=True)
        merged = self._merge(current, patch)
        requested = Settings(**merged).model_dump(mode="json")
        saved = self._merge(load_file_config(), patch)
        save_file_config(saved)
        effective = reload_settings()
        await downloader.close()
        effective_data = effective.model_dump(mode="json")
        overridden = [
            key for key in patch if effective_data[key] != requested[key]
        ]
        message = "配置已保存并热重载"
        if overridden:
            message = "配置已保存；部分字段仍由环境变量或 .env 控制：" + ", ".join(overridden)
        return {
            "status": "saved",
            "message": message,
            "overridden_fields": overridden,
            **self._response(effective),
        }

    async def generate_extension_token(self) -> dict:
        token = token_urlsafe(32)
        request = ConfigUpdateRequest(extension_token=token)
        return await self.update(request)

    def _merge(self, current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        merged = {**current, **patch}
        if "proxy" in patch:
            merged["proxy"] = {**current.get("proxy", {}), **patch["proxy"]}
        return merged

    def _response(self, settings: Settings) -> dict:
        data = settings.model_dump(mode="json")
        data["config_path"] = str(get_config_path())
        data["extension_token_set"] = bool(settings.extension_token)
        return data


config_service = ConfigService()
