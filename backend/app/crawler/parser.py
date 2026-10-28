import json
import re
from dataclasses import dataclass
from html import unescape
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup


@dataclass
class PicPageItem:
    page_name: str
    page_url: str
    pic_num: str
    pic_index: int
    pic_url: str = ""


@dataclass
class SeriesChapter:
    manga_id: str
    pic_count: int
    index: int


class MangaParser:
    def parse_manga_info(self, html: str, manga_id: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")
        heading = soup.find("h2")
        title = heading.get_text(strip=True) if heading is not None else ""
        page_count = 1
        links = soup.find_all("a", href=re.compile(r"page-(\d+)-aid-"))
        nums = []
        for link in links:
            match = re.search(r"page-(\d+)-aid-", str(link.get("href", "")))
            if match:
                nums.append(int(match.group(1)))
        if nums:
            page_count = max(nums)

        chapter_count = 0
        series = soup.select_one("#sr_pub[data-total][data-per]")
        if series is not None:
            chapter_count = int(str(series["data-total"]))
            per_page = int(str(series["data-per"]))
            if chapter_count <= 0 or per_page <= 0:
                raise ValueError("合集章节数量无效")
            page_count = (chapter_count + per_page - 1) // per_page

        cover_url = self._extract_cover(soup)
        return {
            "id": manga_id, "title": title, "page_count": page_count,
            "cover_url": cover_url, "chapter_count": chapter_count,
        }

    def parse_series_chapters(self, html: str) -> list[SeriesChapter]:
        soup = BeautifulSoup(html, "html.parser")
        chapters = []
        for link in soup.select(".sr_compact a[data-chid], .sr_grid a[data-chid]"):
            manga_id = str(link["data-chid"])
            count = re.search(r"\b(\d+)\s*P\b", str(link.get("title", "")))
            ordinal = re.search(r"第\s*(\d+)\s*[話话]", link.get_text(" ", strip=True))
            if (
                not manga_id.isdecimal() or count is None or int(count.group(1)) <= 0
                or ordinal is None
            ):
                raise ValueError("合集章节 ID 或图片数量无效")
            chapters.append(SeriesChapter(manga_id, int(count.group(1)), int(ordinal.group(1))))
        return chapters

    def parse_reader_page_list(
        self, script: str, chapter_id: str, manga_id: str, main_url: str
    ) -> list[PicPageItem]:
        reader = urljoin(main_url, f"photos-slide-aid-{chapter_id}-sid-{manga_id}.html")
        # 同一阅读器提供整章图片，用 fragment 持久化图序，地址过期时仍可按序刷新。
        return [
            PicPageItem(
                page_name=f"id_{manga_id}_pic_{index}",
                page_url=f"{reader}#image-{index}",
                pic_num=f"{chapter_id}_{index:04d}",
                pic_index=index,
                pic_url=url,
            )
            for index, url in enumerate(self.parse_reader_images(script, reader), start=1)
        ]

    def parse_reader_images(self, script: str, base_url: str) -> list[str]:
        match = re.search(r'mReader\.initData\(\s*\{\s*"page_url"\s*:\s*\[', script)
        if match is None:
            raise ValueError("未解析到章节阅读器图片列表")
        decoder = json.JSONDecoder()
        cursor = match.end()
        images: list[str] = []
        # 站点输出的数组允许末尾逗号，只读取 JSON 字符串，不执行外围 JavaScript。
        while cursor < len(script):
            while cursor < len(script) and script[cursor].isspace():
                cursor += 1
            if cursor < len(script) and script[cursor] == "]":
                return images
            value, cursor = decoder.raw_decode(script, cursor)
            if not isinstance(value, str):
                raise ValueError("章节图片地址不是字符串")
            url = self._resolve_image_url(unescape(value).strip(), base_url)
            if url is None:
                raise ValueError("章节图片地址无效")
            images.append(url)
            while cursor < len(script) and script[cursor].isspace():
                cursor += 1
            if cursor < len(script) and script[cursor] == ",":
                cursor += 1
            elif cursor >= len(script) or script[cursor] != "]":
                raise ValueError("章节图片列表格式不完整")
        raise ValueError("章节图片列表格式不完整")

    def _extract_cover(self, soup: BeautifulSoup) -> str:
        # Priority 1: Look for cover in .uwthumb container (WNACG specific)
        uwthumb = soup.select_one(".uwthumb")
        if uwthumb:
            img = uwthumb.find("img", src=True)
            if img:
                return self._normalize_img_src(str(img["src"]))

        # Priority 2: Look for cover in other common containers
        for container_selector in [".manga-info", ".book-info", ".comic-info", "#manga-info"]:
            container = soup.select_one(container_selector)
            if container:
                img = container.find("img", src=True)
                if img:
                    return self._normalize_img_src(str(img["src"]))

        # Priority 3: Look for first image with qy0.ru domain (known CDN)
        for img in soup.find_all("img", src=True):
            src = str(img["src"])
            if "qy0.ru" in src:
                return self._normalize_img_src(src)

        return ""

    def _normalize_img_src(self, src: str) -> str:
        if not src:
            return ""
        # Remove multiple leading slashes (e.g., "////t4.qy0.ru/..." -> "//t4.qy0.ru/...")
        while src.startswith("////"):
            src = src[1:]
        if src.startswith("//"):
            return f"https:{src}"
        if src.startswith("/"):
            # Relative URL - would need base URL to resolve
            return src
        return src

    def parse_pic_page_list(self, html: str, manga_id: str, main_url: str) -> list[PicPageItem]:
        soup = BeautifulSoup(html, "html.parser")
        items = []
        gallery_items = soup.find_all("li", class_=lambda c: c and "gallary_item" in c)
        for index, li in enumerate(gallery_items, start=1):
            link = li.find("a", href=True)
            if not link:
                continue
            span = li.find("span")
            pic_num = span.get_text(strip=True) if span else str(index)
            items.append(
                PicPageItem(
                    page_name=f"id_{manga_id}_pic_{index}",
                    page_url=urljoin(main_url, str(link["href"])),
                    pic_num=pic_num,
                    pic_index=index,
                )
            )
        return items

    def parse_pic_url(self, html: str, base_url: str = "") -> str | None:
        soup = BeautifulSoup(html, "html.parser")
        area = soup.find("span", id="imgarea")
        image = area.find("img", src=True) if area else None
        if not image:
            match = re.search(
                r"<span[^>]*id=[\"']imgarea[\"'][^>]*>[\s\S]*?"
                r"<img[^>]*src=[\"']([^\"']+)[\"']",
                html,
                re.IGNORECASE,
            )
            if not match:
                return None
            src = unescape(match.group(1)).strip()
        else:
            src = str(image["src"]).strip()
        return self._resolve_image_url(src, base_url)

    def _resolve_image_url(self, src: str, base_url: str) -> str | None:
        if not src:
            return None
        if src.startswith("//"):
            src = f"https:{src}"
        try:
            source = urlsplit(src)
            if source.scheme and (
                source.scheme not in {"http", "https"} or not source.hostname
            ):
                return None
            resolved = urljoin(base_url, src) if base_url else src
            parsed = urlsplit(resolved)
        except ValueError:
            return None
        if base_url or parsed.scheme:
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                return None
        return resolved


manga_parser = MangaParser()
