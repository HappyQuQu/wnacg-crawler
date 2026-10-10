from io import BytesIO
from pathlib import Path

from PIL import Image

IMAGE_EXTENSIONS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "GIF": ".gif",
    "WEBP": ".webp",
    "BMP": ".bmp",
    "AVIF": ".avif",
}
SUPPORTED_EXTENSIONS = {*IMAGE_EXTENSIONS.values(), ".jpeg"}


def validated_image_extension(source: bytes | Path) -> str:
    """Identify the format and decode every frame without changing the original bytes."""
    stream = BytesIO(source) if isinstance(source, bytes) else source
    with Image.open(stream) as image:
        extension = IMAGE_EXTENSIONS.get(image.format or "")
        if extension is None:
            raise ValueError("不支持的图片格式")
        image.verify()
    if isinstance(stream, BytesIO):
        stream.seek(0)
    with Image.open(stream) as image:
        for frame in range(getattr(image, "n_frames", 1)):
            image.seek(frame)
            image.load()
    return extension


def is_valid_image(data: bytes) -> bool:
    return _is_valid(data)


def is_valid_image_file(path: Path) -> bool:
    return _is_valid(path)


def _is_valid(source: bytes | Path) -> bool:
    try:
        validated_image_extension(source)
        return True
    except (OSError, ValueError, SyntaxError, EOFError, Image.DecompressionBombError):
        return False


def find_valid_image_path(expected: Path, recorded: Path | None = None) -> Path | None:
    """Prefer the persisted path, then accept an existing file with another extension."""
    for path in (recorded, expected):
        if path is not None and is_valid_image_file(path):
            return path
    if expected.parent.exists():
        for path in sorted(expected.parent.iterdir()):
            if (
                path.stem == expected.stem
                and path.suffix.lower() in SUPPORTED_EXTENSIONS
                and is_valid_image_file(path)
            ):
                return path
    return None
