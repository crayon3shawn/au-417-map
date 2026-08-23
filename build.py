#!/usr/bin/env python3
"""把 data/ 裡的資料與 src/template.html 合成單一自包含 HTML。

只讀本地檔案，不連網。要更新資料請先跑 fetch/ 底下的腳本（或 make update）。

用法： python3 build.py qld
輸出： dist/<state>.html
"""
import sys, json, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib import expand, load, STATES

ROOT = pathlib.Path(__file__).resolve().parent
VISA = "417"                     # 顯示用的主要簽證；地點清單 417/462 相同時會註明
AREAS = {"regional": 1, "bushfire": 2, "disaster": 4}   # 位元旗標，前端用來篩選

TITLES = {"qld": "昆士蘭 417 集簽地圖", "nsw": "新南威爾斯 417 集簽地圖"}
LABELS = {"qld": "昆士蘭", "nsw": "新南威爾斯"}
EXCLUDED = {
    "qld": "布里斯本市區與黃金海岸多數郵區不在名單上。",
    "nsw": "雪梨、紐卡索、臥龍崗、中央海岸的郵區不在名單上。",
}
COORD_DP = 3          # 約 110 公尺，與邊界抓取的 165 公尺概化容差相稱


def to_path(rings):
    """把環座標烘成 SVG path 字串（維持原始經緯度，投影由前端 group transform 處理）。

    烘在 build 端有兩個好處：payload 比 JSON 座標陣列小，
    而且前端啟動時不必逐點做字串運算——NSW 有 8 萬多個點。
    """
    out = []
    for r in rings:
        seg = []
        prev = None
        for x, y in r:
            pt = (round(x, COORD_DP), round(y, COORD_DP))
            if pt == prev:            # 降精度後相鄰點可能重合，去掉
                continue
            seg.append(f"{pt[0]:g} {pt[1]:g}")
            prev = pt
        if len(seg) >= 3:
            out.append("M" + "L".join(seg) + "Z")
    return "".join(out)


def visa_note(pcdata, state):
    """比對 417 與 462 在這一州的五張表，回傳給頁面的說明句。"""
    diff = []
    for area in ("remote", "northern", "regional", "bushfire", "disaster"):
        a = expand(pcdata["areas"]["417"].get(area, {}).get(state), state)
        b = expand(pcdata["areas"]["462"].get(area, {}).get(state), state)
        if a != b:
            diff.append(area)
    if not diff:
        return ("這一州的五張指定地區郵區表，417 與 462 完全相同，所以這張地圖兩種簽證都適用。"
                "差別在產業：417 的礦業算集簽，462 沒有礦業這一項；漁業與林業 462 只限 northern Australia。"
                "在礦區接土建案子拿 462 的話，雇主證明要寫成 construction 才算。")
    return f"注意：417 與 462 在這一州的 {', '.join(diff)} 郵區表並不相同，本圖以 {VISA} 為準。"


# 郵件處理中心／信箱型郵區：不是真實地區，地名資料給的座標也不可靠
# （例如 2348 "New England Mc" 落在離 New England 400 公里外）。
# 這種郵區 ABS 本來就沒有對應面，畫成點只會誤導，所以整個排除。
import re as _re
NON_GEO = _re.compile(r"(\b(Mc|Msc|Dc|Bc)$)|Mail|Forces|Gateway|Post Office Boxes", _re.I)


def is_non_geographic(names):
    return bool(names) and all(NON_GEO.search(n) for n in names)


def bbox(rings):
    xs = [x for r in rings for x, y in r]
    ys = [y for r in rings for x, y in r]
    return [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]


def main(state):
    if state not in STATES:
        raise SystemExit(f"未知的州別 {state}；可用：{', '.join(STATES)}")

    pcdata = load(ROOT / "data" / "postcodes.json")
    loc    = load(ROOT / "data" / f"localities-{state}.json")["postcodes"]
    poa    = load(ROOT / "data" / f"poa-{state}.json")
    out    = load(ROOT / "data" / f"outline-{state}.json")["rings"]
    cities = load(ROOT / "data" / f"cities-{state}.json")["cities"]

    # 展開三張表 -> 每個郵區一組位元旗標
    flags = {}
    for area, bit in AREAS.items():
        raw = pcdata["areas"][VISA].get(area, {}).get(state)
        for pc in expand(raw, state):
            flags[pc] = flags.get(pc, 0) | bit
    if not flags:
        raise SystemExit(f"{state} 沒有任何合格郵區，資料可能有問題")

    # 只保留有座標的郵區（其餘多為信箱型號碼，畫不出來也查不到地名）
    # 全部郵區的邊界都送進去。前端拿它畫底層格線，篩選只影響上層填色，
    # 不然被篩掉的地方會變成空洞，看不出那裡是哪個郵區。
    rings = poa["rings"]

    records, no_coord, non_geo = [], [], []
    for pc in sorted(flags):
        d = loc.get(str(pc))
        if not d:
            no_coord.append(pc)
            continue
        if str(pc) not in rings and is_non_geographic(d["names"]):
            non_geo.append(pc)
            continue
        records.append([pc, d["lon"], d["lat"], flags[pc], d["names"], d["n_names"]])
    no_poly = sorted(r[0] for r in records if str(r[0]) not in rings)
    other = {k: [loc[k]["names"], loc[k]["n_names"]]
             for k in rings if int(k) not in flags and k in loc}

    src = pcdata["sources"]
    meta = {
        "state": state,
        "visa": VISA,
        "stamp": (f"郵區清單 Home Affairs {src[VISA]['page_last_updated']}"
                  f" · 邊界 ABS POA 2021 · 建置 {pcdata['fetched_at'][:10]}"),
        "visa_note": visa_note(pcdata, state),
        "state_label": LABELS.get(state, STATES[state]["name"]),
        "excluded_note": EXCLUDED.get(state, ""),
        "bbox": bbox(out),
        "counts": {"eligible": len(records), "boundaries": len(rings),
                   "not_eligible": len(other),
                   "no_polygon": len(no_poly), "no_coordinates": len(no_coord),
                   "non_geographic": len(non_geo)},
    }

    paths = {k: to_path(v) for k, v in rings.items()}
    payload = {"meta": meta, "postcodes": records, "poa": paths, "other": other,
               "outline": to_path(out),
               "cities": [[c["name"], c["lon"], c["lat"], c["tier"],
                           -1 if c.get("side") == "l" else 1] for c in cities]}

    html = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
    for token, value in (("__TITLE__", TITLES.get(state, f"{STATES[state]['name']} 417 集簽地圖")),
                         ("__DATA__", json.dumps(payload, ensure_ascii=False, separators=(",", ":")))):
        if token not in html:
            raise SystemExit(f"樣板裡找不到注入點 {token}")
        html = html.replace(token, value)

    dest = ROOT / "dist" / f"{state}.html"
    dest.write_text(html, encoding="utf-8")

    print(f"合格郵區 {len(records)}，畫出邊界的郵區 {len(rings)}"
          f"（其中不合格 {len(other)} 個，只畫邊界不填色）")
    if no_poly:
        pass
    if no_coord:
        # 官方清單是以範圍書寫（例如 "4307 to 4499"），範圍內有大量澳洲郵政
        # 從未發行的號碼。這些查不到地區也畫不出來，摘要即可，不必逐一列出。
        print(f"  官方範圍內但無此郵區（澳洲郵政未發行）：{len(no_coord)} 個，"
              f"例如 {', '.join(str(x) for x in no_coord[:5])} …")
    if non_geo:
        print(f"  郵件中心／信箱型郵區，已排除：{', '.join(str(x) for x in non_geo)}")
    if no_poly:
        print(f"  有郵區但 ABS 無對應面（以小點顯示）：{', '.join(str(x) for x in no_poly)}")
    print(f"  {meta['stamp']}")
    print(f"-> {dest.relative_to(ROOT)}  ({dest.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    main((sys.argv[1] if len(sys.argv) > 1 else "qld").lower())
