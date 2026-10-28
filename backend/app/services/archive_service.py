import zipfile
import zlib
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend.app.core.files import atomic_output_path
from backend.app.crawler.images import SUPPORTED_EXTENSIONS, is_valid_image_file


def is_complete_zip(target: Path, files: Sequence[Path]) -> bool:
    try:
        expected = {path.name: path.stat().st_size for path in files}
        if not expected or len(expected) != len(files):
            return False
        with zipfile.ZipFile(target) as archive:
            entries = archive.infolist()
            if len(entries) != len(expected) or any(
                entry.filename not in expected
                or entry.file_size != expected[entry.filename]
                for entry in entries
            ):
                return False
            if len({entry.filename for entry in entries}) != len(expected):
                return False
            for path in files:
                checksum = 0
                with path.open("rb") as source:
                    while block := source.read(1024 * 1024):
                        checksum = zlib.crc32(block, checksum)
                if archive.getinfo(path.name).CRC != checksum:
                    return False
            return archive.testzip() is None
    except (OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError, zlib.error):
        return False


def create_zip(source: Path, target: Path, files: Sequence[Path] | None = None) -> None:
    selected = (
        list(files)
        if files is not None
        else [
            path
            for path in sorted(source.iterdir())
            if path.is_file()
            and not path.name.startswith(".")
            and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ]
    )
    _validate_images(selected)
    with atomic_output_path(target) as temporary:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
            for path in selected:
                archive.write(path, path.name)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError("ZIP 校验失败")


def _validate_images(files: Sequence[Path]) -> None:
    if not files:
        raise ValueError("图片不完整或校验失败，无法打包")
    with ThreadPoolExecutor(max_workers=2) as workers:
        if not all(workers.map(is_valid_image_file, files)):
            raise ValueError("图片不完整或校验失败，无法打包")
