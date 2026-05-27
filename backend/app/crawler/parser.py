import re
from dataclasses import dataclass
from urllib.parse import urljoin

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
        return {"id": manga_id, "title": title, "page_count": page_count, "cover_url": ""}

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
            src = match.group(1)
        else:
            src = str(image["src"])
        if not src:
            return None
        if src.startswith("//"):
            return f"https:{src}"
        return urljoin(base_url, src) if base_url else src


manga_parser = MangaParser()
