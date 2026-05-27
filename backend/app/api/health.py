from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check():
    return {
        "ok": True,
        "data": {
            "status": "ok",
            "service": "WNACG Downloader",
            "version": "2.0.0-dev",
        },
        "error": None,
    }

