from io import BytesIO

from PIL import Image


def image_bytes(format: str = "JPEG", color: str = "white") -> bytes:
    output = BytesIO()
    with Image.new("RGB", (16, 16), color) as image:
        image.save(output, format=format)
    return output.getvalue()
