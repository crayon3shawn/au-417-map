#!/usr/bin/env python3
"""建入口頁：全澳郵區查詢 + 各州地圖導覽。

入口頁不放郵區多邊形，只放郵區號碼對應的身分與州界輪廓，所以很輕。
各州地圖的網址取自 data/artifacts.json——那些州頁必須先發佈過。

用法： python3 build_portal.py
輸出： dist/index.html
"""
import sys, json, pathlib, collections
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib import expand, load, STATES
from build import LABELS, VISA

ROOT = pathlib.Path(__file__).resolve().parent

# 州名在概觀圖上的標註位置（經度, 緯度）。用重心會讓 ACT 疊在 NSW 上、
# VIC 和 NSW 擠在一起，所以手動指定。ACT 太小，不在圖上標，卡片列表有。
LABEL_POS = {
    "qld": (144.3, -22.2), "nsw": (146.3, -32.2), "vic": (144.2, -36.9),
    "sa": (135.0, -29.8), "wa": (120.5, -25.5), "tas": (146.7, -42.1),
    "nt": (133.4, -20.0),
}


def main():
    pcdata = load(ROOT / "data" / "postcodes.json")
    index  = load(ROOT / "data" / "portal-index.json")["postcodes"]
    out    = load(ROOT / "data" / "outline-au.json")["outlines"]
    urls   = load(ROOT / "data" / "artifacts.json")["urls"]

    # 每個州展開三張表，算出每個郵區的身分旗標
    flags = {}
    for st in STATES:
        for area, bit in (("regional", 1), ("bushfire", 2), ("disaster", 4)):
            for pc in expand(pcdata["areas"][VISA].get(area, {}).get(st), st):
                flags[pc] = flags.get(pc, 0) | bit

    # 郵區索引：號碼 -> [州, 代表地名, 旗標]
    entries, stats = {}, collections.defaultdict(lambda: dict(work=0, rebuild=0, none=0))
    for pc, (st, name) in index.items():
        f = flags.get(int(pc), 0)
        entries[pc] = [st, name, f]
        stats[st]["work" if f & 1 else "rebuild" if f & 6 else "none"] += 1

    states = []
    for st in ("qld", "nsw", "vic", "sa", "wa", "tas", "nt", "act"):
        s = stats[st]
        total = s["work"] + s["rebuild"] + s["none"]
        states.append({
            "key": st, "label": LABELS.get(st, STATES[st]["name"]),
            "name": STATES[st]["name"], "url": urls.get(st),
            "total": total, "label_at": LABEL_POS.get(st), **s,
        })

    payload = {
        "meta": {
            "visa": VISA,
            "stamp": (f"郵區清單 Home Affairs {pcdata['sources'][VISA]['page_last_updated']}"
                      f" · 州界 ABS/公開資料 · 建置 {pcdata['fetched_at'][:10]}"),
            "n_postcodes": len(entries),
            "n_maps": sum(1 for s in states if s["url"]),
        },
        "postcodes": entries,
        "states": states,
        "outlines": out,
    }

    html = (ROOT / "src" / "portal.html").read_text(encoding="utf-8")
    token = "__DATA__"
    if token not in html:
        raise SystemExit(f"樣板裡找不到注入點 {token}")
    html = html.replace(token, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    dest = ROOT / "dist" / "index.html"
    dest.write_text(html, encoding="utf-8")
    have = ", ".join(s["label"] for s in states if s["url"])
    print(f"可查郵區 {len(entries)} 個 · 已有地圖的州：{have}")
    for s in states:
        print(f"  {s['label']:6s} 一般工地 {s['work']:4d} · 只有重建 {s['rebuild']:4d} · 不算 {s['none']:4d}"
              + ("" if s["url"] else "   （尚無地圖）"))
    print(f"-> {dest.relative_to(ROOT)}  ({dest.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
