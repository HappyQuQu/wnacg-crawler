import zipfile
from collections.abc import Sequence
from pathlib import Path

from backend.app.core.files import atomic_output_path
from backend.app.crawler.images import SUPPORTED_EXTENSIONS, is_valid_image_file


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
    if not selected or any(not is_valid_image_file(path) for path in selected):
        raise ValueError("图片不完整或校验失败，无法打包")
    with atomic_output_path(target) as temporary:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in selected:
                archive.write(path, path.name)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError("ZIP 校验失败")
