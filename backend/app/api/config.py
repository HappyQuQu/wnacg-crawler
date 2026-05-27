from fastapi import APIRouter

from backend.app.core.schemas import ApiResponse, ConfigUpdateRequest
from backend.app.services.config_service import config_service

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("", response_model=ApiResponse)
async def get_config():
    return ApiResponse(data=await config_service.get())


@router.post("", response_model=ApiResponse)
async def update_config(payload: ConfigUpdateRequest):
    result = await config_service.update(payload)
    return ApiResponse(data=result)


@router.post("/extension-token", response_model=ApiResponse)
async def generate_extension_token():
    result = await config_service.generate_extension_token()
    return ApiResponse(data=result)
