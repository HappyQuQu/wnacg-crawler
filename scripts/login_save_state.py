"""首次登录保存浏览器登录态。

用法：
    python scripts/login_save_state.py

会打开一个 Chromium 窗口，手动登录后回到终端按 Enter，
登录态保存到 config/browser_state.json，后续 Docker 爬虫可复用。
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

STATE_PATH = Path("config/browser_state.json")
TARGET_URL = "https://www.wnacg.com/"


def main() -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        page.goto(TARGET_URL)
        print(f"已打开 {TARGET_URL}")
        print("请在浏览器中完成登录（含年龄确认等），完成后回到终端按 Enter...")
        input()

        context.storage_state(path=str(STATE_PATH))
        print(f"登录态已保存到 {STATE_PATH.resolve()}")
        browser.close()


if __name__ == "__main__":
    main()
