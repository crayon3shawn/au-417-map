#!/usr/bin/env python3
"""從 Home Affairs 抓 417 的「指定地區」郵區清單。

輸出 data/postcodes.json，保存官網原文的範圍字串（不展開），並記下
官網頁面自己標示的 Last updated 日期。

用法：
    python3 fetch/postcodes.py            # 抓取並健檢，有異常就中止
    python3 fetch/postcodes.py --force    # 健檢失敗仍然寫入（自行負責）
    python3 fetch/postcodes.py --keep-raw # 另存原始 HTML 到 data/raw/ 供人工核對

健檢會擋下的情況：
  * 五張指定地區表少了任何一張
  * 任何一州的郵區數量比上次變動超過 THRESHOLD
  * 範圍字串解析不出來
這是刻意的：寧可壞掉，也不要默默給出過期或錯誤的郵區。
"""
import sys, os, re, json, html, datetime, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, expand, load, save, AREA_SECTIONS, STATE_ALIASES, STATES

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "postcodes.json"
THRESHOLD = 0.10          # 單一州郵區數量的可接受變動幅度

# 只抓 417。站台本來就只處理 417（build.py 的 VISA 寫死），而 462 的產業規則
# 不同（沒有礦業，漁業與林業只限 Northern Australia），本來就不能拿這裡的
# 判斷給 462 用——那段警語在 README 裡。
#
# 既然頁面不呈現 462，抓它只會製造假警報：462 頁面改版型時健檢會紅燈，
# 但那對一個 417-only 的站台不是壞消息。要加回來的話補一行就行。
PAGES = {
    "417": "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work",
}

# 內容不在 DOM 表格裡，而是這個 hidden input 的 value 屬性（官網自己的內容 payload）
HIDDEN = re.compile(
    r'id="ctl00_PlaceHolderMain_PageSchemaHiddenField_Input"[^>]*?\svalue="([^"]*)"')
ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S | re.I)
CELL = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")


def text_of(fragment):
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", fragment))).strip()


def sections(page_html):
    m = HIDDEN.search(page_html)
    if not m:
        raise SystemExit("找不到內容 payload（hidden field）——官網版型可能改了，請人工檢查")
    doc = json.loads(html.unescape(m.group(1)))
    return {(s.get("text") or "").strip(): (s.get("block") or "") for s in doc["content"]}


def parse_area(block_html):
    """把一個章節裡所有表格的 州 -> 郵區範圍字串 讀出來。"""
    found = {}
    for row in ROW.findall(block_html):
        cells = [text_of(c) for c in CELL.findall(row)]
        if len(cells) < 2:
            continue
        key = STATE_ALIASES.get(cells[0].strip().lower())
        if not key or key == "norfolk":
            continue
        value = cells[1].strip()
        if not value:
            continue
        # 同一章節可能有多張表（例如 Remote 有兩張），同州就併起來
        found[key] = f"{found[key]}, {value}" if key in found else value
    return found


def scrape(url, keep_raw=None):
    raw = fetch(url)
    if keep_raw:
        keep_raw.write_text(raw, encoding="utf-8")
    secs = sections(raw)
    areas = {}
    missing = []
    for area, heading in AREA_SECTIONS.items():
        block = next((v for k, v in secs.items() if k.lower() == heading.lower()), None)
        if block is None:
            missing.append(heading)
            continue
        got = parse_area(block)
        if not got:
            missing.append(heading + "（章節在，但表格讀不到州別列）")
        areas[area] = got
    updated = None
    m = re.search(r'id="pageModified"[^>]*>\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})', raw)
    if m:
        d, mo, y = m.group(1).split("/")
        updated = f"{y}-{int(mo):02d}-{int(d):02d}"
    else:
        missing.append("頁面更新日期（pageModified）讀不到")
    return areas, missing, updated


def check(new, old):
    """回傳問題清單。空清單代表通過。"""
    problems = []
    for visa, areas in new["areas"].items():
        for area, per_state in areas.items():
            for st, raw in per_state.items():
                if st not in STATES:
                    continue
                try:
                    n = len(expand(raw, st))
                except ValueError as e:
                    problems.append(f"{visa}/{area}/{st}: {e}")
                    continue
                if n == 0:
                    problems.append(f"{visa}/{area}/{st}: 展開後是空的")
                    continue
                if not old:
                    continue
                prev_raw = old.get("areas", {}).get(visa, {}).get(area, {}).get(st)
                if prev_raw is None:
                    continue
                try:
                    p = len(expand(prev_raw, st))
                except ValueError:
                    continue
                if p and abs(n - p) / p > THRESHOLD:
                    problems.append(
                        f"{visa}/{area}/{st}: 郵區數量 {p} -> {n}"
                        f"（變動 {abs(n-p)/p:.0%}，超過 {THRESHOLD:.0%} 門檻）")
    return problems


def main():
    force = "--force" in sys.argv
    keep = "--keep-raw" in sys.argv
    rawdir = ROOT / "data" / "raw"
    if keep:
        rawdir.mkdir(parents=True, exist_ok=True)

    old = load(OUT) if OUT.exists() else None
    out = {
        "fetched_at": datetime.datetime.now(datetime.timezone.utc)
                        .replace(microsecond=0).isoformat(),
        "note": "郵區為官網原文的範圍字串，未展開。展開請用 lib.expand()。",
        "sources": {},
        "areas": {},
    }
    hard = []
    for visa, url in PAGES.items():
        print(f"抓取 {visa} … {url}")
        areas, missing, updated = scrape(url, rawdir / f"{visa}.html" if keep else None)
        out["sources"][visa] = {"url": url, "page_last_updated": updated}
        out["areas"][visa] = areas
        for m in missing:
            hard.append(f"{visa}: 缺少章節 {m}")
        print(f"  頁面標示更新於 {updated} | 讀到 {len(areas)} 張指定地區表 "
              f"| 州別列 {sum(len(v) for v in areas.values())} 筆")

    problems = hard + check(out, old)
    if problems:
        print("\n健檢未通過：")
        for p in problems:
            print("  ✗", p)
        if not force:
            print("\n已中止，data/postcodes.json 未更動。"
                  "\n確認官網真的改了、且改動正確之後，再用 --force 覆寫。")
            return 1
        print("\n--force：仍然寫入。")

    for visa in out["sources"]:
        prev = (old or {}).get("sources", {}).get(visa, {}).get("page_last_updated")
        now = out["sources"][visa]["page_last_updated"]
        if prev and prev != now:
            print(f"\n⚠  {visa} 官網頁面更新日期由 {prev} 變成 {now}，請人工看一次改了什麼。")

    save(OUT, out)
    print(f"\n已寫入 {OUT.relative_to(ROOT)}")
    print("下一步：git diff data/postcodes.json 看官網到底改了哪些郵區。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
