import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from loguru import logger


@dataclass
class PicPageItem:
    page_name: str
    page_url: str
    pic_num: str
    pic_index: int


class MangaParser:
    """BeautifulSoup4 替代原版所有手写正则，容错更强"""

    def parse_manga_info(self, html: str, manga_id: str) -> dict:
        """解析漫画基本信息（标题、封面、总页数）"""
        soup = BeautifulSoup(html, "html.parser")

        # 漫画名
        name = ""
        h2 = soup.find("h2")
        if h2:
            name = h2.get_text(strip=True)

        # 封面图
        cover_url = ""
        thumb_div = soup.find("div", class_="asTBcell uwthumb")
        if thumb_div:
            img = thumb_div.find("img")
            if img and img.get("src"):
                src = str(img["src"])
                cover_url = "https:" + src if src.startswith("//") else src

        # 最大页数（分页链接中提取数字最大值）
        page_count = 1
        page_links = soup.find_all("a", href=re.compile(r"page-(\d+)-aid-"))
        if page_links:
            nums = []
            for a in page_links:
                m = re.search(r"page-(\d+)-aid-", str(a.get("href", "")))
                if m:
                    nums.append(int(m.group(1)))
            if nums:
                page_count = max(nums)

        logger.info("解析漫画 {} 完成：{} - 共 {} 页", manga_id, name, page_count)
        return {
            "id": manga_id,
            "name": name,
            "cover_url": cover_url,
            "page_count": page_count,
        }

    def parse_pic_page_list(
        self, html: str, manga_id: str, main_url: str
    ) -> list[PicPageItem]:
        """解析列表页，提取每张图片的详情页 URL"""
        soup = BeautifulSoup(html, "html.parser")
        items: list[PicPageItem] = []
        seen_pic_nums: set[str] = set()
        index = 1

        for li in soup.find_all("li", class_="li tb gallary_item"):
            # 图片名（alt 属性）
            img = li.find("img")
            page_name = img["alt"] if img and img.get("alt") else f"pic_{index}"

            # 详情页 href
            a_tag = li.find("a", href=True)
            if not a_tag:
                continue
            pic_info_url = urljoin(main_url, str(a_tag["href"]))

            # 图片编号（span 文本）
            span = li.find("span")
            pic_num = span.get_text(strip=True) if span else str(index)

            if pic_num in seen_pic_nums:
                continue
            seen_pic_nums.add(pic_num)

            items.append(
                PicPageItem(
                    page_name=f"id_{manga_id}_{page_name}",
                    page_url=pic_info_url,
                    pic_num=pic_num,
                    pic_index=index,
                )
            )
            index += 1

        return items

    def parse_pic_url(self, html: str) -> Optional[str]:
        """解析图片详情页，提取真实图片 URL"""
        soup = BeautifulSoup(html, "html.parser")
        span = soup.find("span", id="imgarea")
        if not span:
            return None
        img = span.find("img")
        if not img or not img.get("src"):
            return None
        src = str(img["src"])
        return "https:" + src if src.startswith("//") else src


# 全局单例
manga_parser = MangaParser()
