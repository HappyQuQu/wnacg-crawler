import re
from pathlib import Path

ILLEGAL_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|]')


def safe_filename(value: str, fallback: str = "untitled") -> str:
    cleaned = ILLEGAL_FILENAME_CHARS.sub("_", value).strip()
    return cleaned or fallback


def manga_dir(base: Path, manga_id: str, title: str) -> Path:
    return base / "Manga" / f"[{manga_id}] {safe_filename(title, manga_id)}"


def zip_path(base: Path, manga_id: str, title: str) -> Path:
    return base / "Zip" / f"[{manga_id}] {safe_filename(title, manga_id)}.zip"

