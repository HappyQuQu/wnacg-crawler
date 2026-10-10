from collections.abc import Iterator
from dataclasses import dataclass
from io import BytesIO
from math import sqrt
from typing import Any

from PIL import Image

from backend.app.crawler.images import IMAGE_EXTENSIONS, validated_image_extension


@dataclass(frozen=True)
class PreparedImage:
    data: bytes
    extension: str
    source_extension: str
    processed: bool = False
    warning: str = ""


def prepare_image(
    data: bytes,
    *,
    enabled: bool,
    max_size_kb: int,
    allow_resize: bool,
) -> PreparedImage:
    """Compress valid new downloads; failure leaves the valid source bytes intact."""
    source_extension = validated_image_extension(data)
    original = PreparedImage(data, source_extension, source_extension)
    limit = max_size_kb * 1024
    if not enabled or len(data) <= limit:
        return original

    try:
        with Image.open(BytesIO(data)) as source:
            if getattr(source, "n_frames", 1) > 1:
                return PreparedImage(
                    data,
                    source_extension,
                    source_extension,
                    warning="动画或多帧图片保持原样，未进行压缩",
                )
            format = source.format or ""
            image = source.copy()
        # PNG preserves transparency for BMP and single-frame GIF conversions.
        output_format = "PNG" if format in {"BMP", "GIF"} else format
        extension = IMAGE_EXTENSIONS[output_format]
        best = data
        best_extension = source_extension
        try:
            while True:
                for candidate in _encode_candidates(image, output_format):
                    if len(candidate) < len(best):
                        best = candidate
                        best_extension = extension
                    if len(best) <= limit:
                        break
                if len(best) <= limit or not allow_resize or max(image.size) <= 1:
                    break
                scale = min(0.9, max(0.5, sqrt(limit / len(best)) * 0.95))
                dimensions = tuple(max(1, int(value * scale)) for value in image.size)
                resized = image.resize(dimensions, Image.Resampling.LANCZOS)
                image.close()
                image = resized
        finally:
            image.close()
        # Recheck the encoded output before it can replace any file.
        validated_image_extension(best)
        warning = ""
        if len(best) > limit:
            warning = "图片未达到大小上限，已保留较小的有效文件"
        return PreparedImage(
            best,
            best_extension,
            source_extension,
            processed=best != data,
            warning=warning,
        )
    except Exception as exc:
        return PreparedImage(
            data,
            source_extension,
            source_extension,
            warning=f"图片压缩失败，已保留原图：{type(exc).__name__}",
        )


def _encode_candidates(image: Image.Image, format: str) -> Iterator[bytes]:
    metadata: dict[str, Any] = {
        key: image.info[key] for key in ("exif", "icc_profile") if key in image.info
    }
    if format in {"JPEG", "WEBP", "AVIF"}:
        for quality in (90, 80, 70, 60, 50, 40, 30, 20):
            options: dict[str, Any] = {"quality": quality, **metadata}
            if format == "JPEG":
                options["optimize"] = True
            elif format == "AVIF":
                options.update(speed=8, max_threads=1)
            stream = BytesIO()
            image.save(stream, format=format, **options)
            yield stream.getvalue()
        return

    stream = BytesIO()
    image.save(stream, format="PNG", optimize=True, **metadata)
    yield stream.getvalue()
    with image.convert("RGBA") as rgba:
        with rgba.getchannel("A") as alpha:
            transparent = alpha.getextrema() != (255, 255)
            for colors in (256, 128, 64, 32, 16):
                if transparent:
                    with rgba.convert("RGB") as rgb:
                        with rgb.quantize(colors) as palette:
                            with palette.convert("RGBA") as quantized:
                                quantized.putalpha(alpha)
                                stream = BytesIO()
                                quantized.save(stream, format="PNG", optimize=True, **metadata)
                                yield stream.getvalue()
                else:
                    with rgba.quantize(colors, method=Image.Quantize.FASTOCTREE) as quantized:
                        stream = BytesIO()
                        quantized.save(stream, format="PNG", optimize=True, **metadata)
                        yield stream.getvalue()
