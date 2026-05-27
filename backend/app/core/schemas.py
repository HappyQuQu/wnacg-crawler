from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.app.core.config import ProxySettings


class ApiResponse(BaseModel):
    ok: bool = True
    data: Any = None
    error: Any = None


class ParseInputRequest(BaseModel):
    text: str
    source: str = "manual"


class TaskCreateRequest(BaseModel):
    manga_id: str = Field(pattern=r"^\d+$")
    mode: Literal["download", "verify", "zip"] = "download"
    source: str = "manual"
    start_immediately: bool = True


class BatchTaskItem(BaseModel):
    manga_id: str = Field(pattern=r"^\d+$")


class BatchTaskCreateRequest(BaseModel):
    items: list[BatchTaskItem]
    mode: Literal["download", "verify", "zip"] = "download"
    source: str = "batch_text"
    dedupe: bool = True
    start_immediately: bool = True


class TaskRetryRequest(BaseModel):
    scope: str = "task"


class ExtensionSubmitRequest(BaseModel):
    manga_id: str = Field(pattern=r"^\d+$")
    url: str | None = None
    title_hint: str | None = None
    cover_hint: str | None = None
    page_type: str = "detail"


class ExtensionSubmitManyItem(BaseModel):
    manga_id: str = Field(pattern=r"^\d+$")
    url: str | None = None
    title_hint: str | None = None


class ExtensionSubmitManyRequest(BaseModel):
    items: list[ExtensionSubmitManyItem]
    page_url: str | None = None
    page_type: str = "list"
    mode: Literal["confirm", "queue"] = "confirm"


class ConfigUpdateRequest(BaseModel):
    download_path: str | None = None
    is_zip: bool | None = None
    max_thread: int | None = Field(default=None, ge=1, le=20)
    re_count: int | None = Field(default=None, ge=1, le=12)
    request_delay_ms: int | None = Field(default=None, ge=0, le=10000)
    timeout_seconds: int | None = Field(default=None, ge=5, le=120)
    extension_token: str | None = Field(default=None, max_length=256)
    proxy: ProxySettings | None = None
