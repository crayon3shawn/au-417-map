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
VISA = "417"          # 顯示用的主要簽證；地點清單 417/462 相同時會註明
INDUSTRY = "construction"   # 這份地圖的取向。換產業要看的地區表就不同——
                            # 例如漁業在 462 只限 northern Australia。
                            # 對應規則在 data/industries.json。

BIT_WORK, BIT_FIRE, BIT_DISASTER = 1, 2, 4   # 位元旗標

TITLES = {"qld": "昆士蘭 417 集簽地圖", "nsw": "新南威爾斯 417 集簽地圖",
          "vic": "維多利亞 417 集簽地圖", "wa": "西澳 417 集簽地圖"}
LABELS = {"qld": "昆士蘭", "nsw": "新南威爾斯", "vic": "維多利亞",
          "sa": "南澳", "wa": "西澳", "tas": "塔斯馬尼亞",
          "nt": "北領地", "act": "首都領地"}
EXCLUDED = {
    "qld": "布里斯本市區與黃金海岸多數郵區不在名單上。",
    "nsw": "雪梨、紐卡索、臥龍崗、中央海岸的郵區不在名單上。",
    "vic": "墨爾本都會區的郵區不在名單上。",
    "wa": "珀斯都會區的郵區不在名單上。",
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
        if len(seg) > 1 and seg[0] == seg[-1]:
            seg.pop()                 # Z 會封口，重複的收尾點是多餘的
        if len(seg) >= 3:
            out.append("M" + "L".join(seg) + "Z")
    return "".join(out)


# 郵件處理中心／信箱型郵區：不是真實地區，地名資料給的座標也不可靠
# （例如 2348 "New England Mc" 落在離 New England 400 公里外）。
# 這種郵區 ABS 本來就沒有對應面，畫成點只會誤導，所以整個排除。
import re as _re
NON_GEO = _re.compile(r"(\b(Mc|Msc|Dc|Bc)$)|Mail|Forces|Gateway|Post Office Boxes", _re.I)


def is_non_geographic(names):
    return bool(names) and all(NON_GEO.search(n) for n in names)


def categorise(rings, flags):
    """把每個郵區歸成三個互斥類別，並統計數量。

    綠 work    ：regional，一般建築工地就算
    琥珀 rebuild：不是 regional，但被宣告為災區，只有災後重建工作算
    灰 none    ：不在任何清單上

    琥珀再細分成大火／天災／兩者——災害種類只有在「重建是唯一路徑」時才
    影響決定（日期門檻不同、ImmiAccount 的 Employment type 也不同）。
    在綠色郵區，一般工作本來就算，災害種類是次要資訊，留在詳情面板。
    """
    c = dict(work=0, rebuild=0, none=0, fire_only=0, flood_only=0, fire_and_flood=0)
    for k in rings:
        f = flags.get(int(k), 0)
        if f & 1:
            c["work"] += 1
        elif f & 6:
            c["rebuild"] += 1
            if (f & 2) and (f & 4):
                c["fire_and_flood"] += 1
            elif f & 2:
                c["fire_only"] += 1
            else:
                c["flood_only"] += 1
        else:
            c["none"] += 1
    return c


def nav_links(state):
    """頁首的導覽：回入口頁，以及切到其他州。

    州頁原本是死路——從入口頁點進來之後沒有任何方式回去或切換。
    網址取自 data/artifacts.json，沒登記的州不會出現。
    """
    art = load(ROOT / "data" / "artifacts.json")
    out = []
    if art.get("portal"):
        out.append({"label": "全澳入口", "url": art["portal"], "home": True})
    for key, url in art.get("urls", {}).items():
        # 導覽用縮寫：澳洲當地（求職廣告、地址）就是講 QLD／NSW，比中文州名好認也省空間
        out.append({"label": key.upper(), "url": url, "current": key == state})
    return out


def tokens_css():
    """共用的設計 token。兩個樣板都注入同一份，避免改配色時漏掉一邊。"""
    return (ROOT / "src" / "tokens.css").read_text(encoding="utf-8")

def ring_centroid(rings):
    """取最大環的平均點當代表座標。搜尋定位用，不需要精確的幾何重心。"""
    big = max(rings, key=len)
    return (round(sum(x for x, _ in big) / len(big), 4),
            round(sum(y for _, y in big) / len(big), 4))


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
    cities = load(ROOT / "data" / f"cities-{state}.json")["cities"]

    # 這個產業在這個簽證下要看哪幾張地區表
    ind = load(ROOT / "data" / "industries.json")["industries"][INDUSTRY]
    work_areas = ind["areas"][VISA]
    if work_areas is None:
        raise SystemExit(f"{ind['label']}在 {VISA} 沒有這一項產業，無法建圖")

    # 展開成每個郵區一組位元旗標。災後重建是獨立於產業的另一條路。
    #
    # 跨全澳取聯集，不是只看本州：郵區的合格性是郵區本身的屬性，不該隨你
    # 看哪一頁而變。0872 橫跨 NT／WA／SA，只出現在 NT 的 regional 表
    # （「全境皆可」），逐州算的話在 WA 頁會被誤判成不是 regional。
    flags = {}
    for area, bit in [(a, BIT_WORK) for a in work_areas] + \
                     [("bushfire", BIT_FIRE), ("disaster", BIT_DISASTER)]:
        for st in STATES:
            for pc in expand(pcdata["areas"][VISA].get(area, {}).get(st), st):
                flags[pc] = flags.get(pc, 0) | bit
    if not flags:
        raise SystemExit(f"{state} 沒有任何合格郵區，資料可能有問題")

    # 只保留有座標的郵區（其餘多為信箱型號碼，畫不出來也查不到地名）
    # 全部郵區的邊界都送進去。前端拿它畫底層格線，篩選只影響上層填色，
    # 不然被篩掉的地方會變成空洞，看不出那裡是哪個郵區。
    rings = poa["rings"]

    # 跨州郵區（例如 0872）的地名資料在別州的檔案裡，本州查不到。
    # 有面卻沒地名的，用全澳索引補地名、用多邊形重心補座標，
    # 否則點下去會顯示「不在合格清單上」——但它明明是綠的。
    national = {}
    idx_path = ROOT / "data" / "portal-index.json"
    if idx_path.exists():
        national = load(idx_path)["postcodes"]

    records, no_coord, non_geo = [], [], []
    for pc in sorted(flags):
        d = loc.get(str(pc))
        if not d and str(pc) in rings:
            n = national.get(str(pc))
            lon, lat = ring_centroid(rings[str(pc)])
            d = {"lon": lon, "lat": lat,
                 "names": [n[1]] if n else [f"郵區 {pc}"]}
        if not d:
            no_coord.append(pc)
            continue
        if str(pc) not in rings and is_non_geographic(d["names"]):
            non_geo.append(pc)
            continue
        records.append([pc, d["lon"], d["lat"], flags[pc], d["names"]])
    no_poly = sorted(r[0] for r in records if str(r[0]) not in rings)
    other = {k: loc[k]["names"]
             for k in rings if int(k) not in flags and k in loc}

    src = pcdata["sources"]
    meta = {
        "state": state,
        "visa": VISA,
        "stamp": (f"郵區清單 Home Affairs {src[VISA]['page_last_updated']}"
                  f" · 邊界 ABS POA 2021 · 建置 {pcdata['fetched_at'][:10]}"),
        "state_label": LABELS.get(state, STATES[state]["name"]),
        "state_abbr": state.upper(),
        "nav": nav_links(state),
        "excluded_note": EXCLUDED.get(state, ""),
        "bbox": bbox([r for rs in rings.values() for r in rs]),
        "counts": {**categorise(rings, flags),
                   "eligible": len(records), "boundaries": len(rings),
                   "not_eligible": len(other),
                   "no_polygon": len(no_poly), "no_coordinates": len(no_coord),
                   "non_geographic": len(non_geo)},
    }

    paths = {k: to_path(v) for k, v in rings.items()}
    # 每個多邊形的身分直接給前端，不要讓它從 records 反推：
    # 有些郵區有邊界也合格，卻因為缺地名座標而不在 records 裡，
    # 反推會把它算成「完全不算」，圖例數字就跟畫面對不上。
    poa_flags = {k: flags.get(int(k), 0) for k in rings}

    # 不再送州界輪廓：它是另一份解析度粗得多的幾何（RDP 容差約 3 公里），
    # 疊在郵區面底下會從半透明色塊外緣露出淡色細帶。郵區面本來就鋪滿整個州，
    # 形狀也精確得多，視野範圍直接由它算。
    payload = {"meta": meta, "postcodes": records, "poa": paths, "flags": poa_flags,
               "other": other,
               "cities": [[c["name"], c["lon"], c["lat"], c["tier"],
                           -1 if c.get("side") == "l" else 1] for c in cities]}

    html = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
    for token, value in (("__TOKENS__", tokens_css()),
                         ("__TITLE__", TITLES.get(state, f"{STATES[state]['name']} 417 集簽地圖")),
                         ("__DATA__", json.dumps(payload, ensure_ascii=False, separators=(",", ":")))):
        if token not in html:
            raise SystemExit(f"樣板裡找不到注入點 {token}")
        html = html.replace(token, value)

    dest = ROOT / "dist" / f"{state}.html"
    dest.write_text(html, encoding="utf-8")

    cat = meta["counts"]
    print(f"郵區 {len(rings)}：一般工地就算 {cat['work']}、"
          f"只有重建算 {cat['rebuild']}（大火 {cat['fire_only']}／"
          f"天災 {cat['flood_only']}／兩者 {cat['fire_and_flood']}）、"
          f"完全不算 {cat['none']}")
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
