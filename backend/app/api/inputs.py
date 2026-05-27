from fastapi import APIRouter

from backend.app.core.schemas import ApiResponse, ParseInputRequest
from backend.app.services.input_service import input_service

router = APIRouter(prefix="/api/inputs", tags=["inputs"])


@router.post("/parse", response_model=ApiResponse)
async def parse_inputs(payload: ParseInputRequest):
    result = await input_service.parse(payload.text, payload.source)
    return ApiResponse(data=result)

