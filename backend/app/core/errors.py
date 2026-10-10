from pydantic import BaseModel


class ImageHTTPError(Exception):
    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"图片请求返回 HTTP {status_code}: {url}")
        self.status_code = status_code
        self.url = url


class ErrorDetail(BaseModel):
    code: str
    message: str
    detail: dict | None = None

