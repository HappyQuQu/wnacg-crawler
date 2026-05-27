import os
import shutil
import tempfile
from pathlib import Path

import pytest

TEST_ROOT = Path(tempfile.gettempdir()) / "wnacg-crawler-tests"
if TEST_ROOT.exists():
    shutil.rmtree(TEST_ROOT)
TEST_ROOT.mkdir(parents=True, exist_ok=True)

os.environ["WNACG_CONFIG_PATH"] = str(TEST_ROOT / "config.local.json")
os.environ["WNACG_DB_PATH"] = str(TEST_ROOT / "data.sqlite")
os.environ["WNACG_DOWNLOAD_PATH"] = str(TEST_ROOT / "data")

from backend.app.db.database import init_db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def init_test_database() -> None:
    import asyncio

    asyncio.run(init_db())
