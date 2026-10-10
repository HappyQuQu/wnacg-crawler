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

        cover_url = self._extract_cover(soup)
        return {"id": manga_id, "title": title, "page_count": page_count, "cover_url": cover_url}

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
