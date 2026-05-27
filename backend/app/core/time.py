from datetime import UTC, datetime
from zoneinfo import ZoneInfo

LOCAL_TIMEZONE = ZoneInfo("Asia/Shanghai")


def local_isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    aware = value if value.tzinfo else value.replace(tzinfo=UTC)
    return aware.astimezone(LOCAL_TIMEZONE).isoformat()
