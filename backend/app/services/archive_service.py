import re
import zipfile
import zlib
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from pathlib import Path

from backend.app.core.config import get_settings
from backend.app.core.files import atomic_output_path
from backend.app.crawler.images import SUPPORTED_EXTENSIONS, is_valid_image_file

MAX_ZIP_BYTES = 2_000_000_000
MAX_ZIP_ENTRIES = 65535
ArchivePlan = list[tuple[Path, list[Path]]]


def plan_zip(target: Path, files: Sequence[Path]) -> ArchivePlan:
    if not get_settings().split_large_zip:
        return [(target, list(files))]
    groups: list[list[Path]] = [[]]
    size = 22
    for path in files:
        # Stored ZIP size includes both filename copies and the central directory.
        required = path.stat().st_size + 76 + 2 * len(path.name.encode("utf-8"))
        if required + 22 >= MAX_ZIP_BYTES:
            raise ValueError(f"单张图片超过 ZIP 大小上限，无法拆分：{path.name}")
        if size + required >= MAX_ZIP_BYTES or len(groups[-1]) >= MAX_ZIP_ENTRIES:
            groups.append([])
            size = 22
        groups[-1].append(path)
        size += required
    if len(groups) == 1:
        return [(target, groups[0])]
    return [(_part_path(target, index), group) for index, group in enumerate(groups, 1)]


def existing_zip_paths(target: Path) -> list[Path]:
    if not target.parent.exists():
        return []
    prefix = re.escape(_part_path(target, 1).name.rsplit(".part", 1)[0])
    pattern = re.compile(prefix + r"\.part\d{4,}\.zip")
    return sorted(
        path for path in target.parent.iterdir()
        if (path == target or pattern.fullmatch(path.name)) and path.is_file()
    )


def is_complete_zip(target: Path, files: Sequence[Path]) -> bool:
    try:
        plan = plan_zip(target, files)
        if set(existing_zip_paths(target)) != {path for path, _ in plan}:
            return False
        return all(_is_complete_part(path, group) for path, group in plan)
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError, zlib.error):
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
    plan = plan_zip(target, selected)
    split = get_settings().split_large_zip
    with ExitStack() as stack:
        for path, group in plan:
            temporary = stack.enter_context(atomic_output_path(path))
            _write_zip(temporary, group, split)
    expected = {path for path, _ in plan}
    for obsolete in existing_zip_paths(target):
        if obsolete not in expected:
            obsolete.unlink()


def _part_path(target: Path, index: int) -> Path:
    suffix = f".part{index:04d}.zip"
    stem = target.stem.encode("utf-8")[:255 - len(suffix)].decode("utf-8", errors="ignore")
    return target.with_name(stem + suffix)


def _write_zip(target: Path, files: Sequence[Path], split: bool) -> None:
    # Images are already encoded; storing them gives an exact size and avoids ZIP64.
    with zipfile.ZipFile(
        target, "w", zipfile.ZIP_STORED if split else zipfile.ZIP_DEFLATED,
        compresslevel=None if split else 1, allowZip64=not split,
    ) as archive:
        for path in files:
            archive.write(path, path.name)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:
            raise ValueError("ZIP 校验失败")


def _is_complete_part(target: Path, files: Sequence[Path]) -> bool:
    expected = {path.name: path.stat().st_size for path in files}
    if not expected or len(expected) != len(files):
        return False
    split = get_settings().split_large_zip
    if split and target.stat().st_size >= MAX_ZIP_BYTES:
        return False
    with zipfile.ZipFile(target) as archive:
        entries = archive.infolist()
        if len(entries) != len(expected) or any(
            entry.filename not in expected
            or entry.file_size != expected[entry.filename]
            or (split and entry.extract_version >= 45)
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


def _validate_images(files: Sequence[Path]) -> None:
    if not files or len({path.name for path in files}) != len(files):
        raise ValueError("图片不完整或文件名重复，无法打包")
    with ThreadPoolExecutor(max_workers=2) as workers:
        if not all(workers.map(is_valid_image_file, files)):
            raise ValueError("图片不完整或校验失败，无法打包")
