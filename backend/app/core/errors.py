from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str
    detail: dict | None = None

