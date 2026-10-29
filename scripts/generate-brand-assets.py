"""Regenerate web and extension icons from extension/icons/icon.svg."""

import shutil
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image, ImageColor, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension/icons/icon.svg"
PUBLIC = ROOT / "frontend/public"
SCALE = 4


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    artwork = render_source()
    for dimension in (16, 32, 48, 128):
        artwork.resize((dimension, dimension), Image.Resampling.LANCZOS).save(
            ROOT / f"extension/icons/icon{dimension}.png"
        )
    artwork.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png")
    artwork.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    shutil.copyfile(SOURCE, PUBLIC / "favicon.svg")


def render_source() -> Image.Image:
    source = ElementTree.parse(SOURCE).getroot()
    size = int(source.attrib["viewBox"].split()[2])
    artwork = Image.new("RGBA", (size * SCALE, size * SCALE))
    for element in source:
        draw = ImageDraw.Draw(artwork)
        if element.tag.endswith("rect"):
            draw.rounded_rectangle(
                (0, 0, size * SCALE - 1, size * SCALE - 1),
                radius=int(element.attrib["rx"]) * SCALE,
                fill=element.attrib["fill"],
            )
        elif element.tag.endswith("polyline"):
            points = [
                tuple(float(value) * SCALE for value in point.split(","))
                for point in element.attrib["points"].split()
            ]
            width = int(element.attrib["stroke-width"]) * SCALE
            layer = Image.new("RGBA", artwork.size)
            ink = ImageDraw.Draw(layer)
            opacity = round(255 * float(element.attrib.get("stroke-opacity", "1")))
            color = (*ImageColor.getrgb(element.attrib["stroke"]), opacity)
            ink.line(points, fill=color, width=width, joint="curve")
            radius = width / 2
            for x, y in points:
                ink.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
            artwork = Image.alpha_composite(artwork, layer)
    return artwork


if __name__ == "__main__":
    main()
