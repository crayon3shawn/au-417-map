#!/usr/bin/env python3
"""把 data/ 裡的資料與 src/template.html 合成單一自包含 HTML。

只讀本地檔案，不連網。要更新資料請先跑 fetch/ 底下的腳本（或 make update）。

用法： python3 build.py qld
輸出： dist/<state>.html
"""
import os, sys, json, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib import expand, load, save, STATES

ROOT = pathlib.Path(__file__).resolve().parent
VISA = "417"          # 顯示用的主要簽證；地點清單 417/462 相同時會註明
DEFAULT_INDUSTRY = "construction"   # 預設取向；使用者可在頁面上切換

# 每個郵區記錄它在五張地區表裡的成員資格。
# 不預先算成「算／不算」，因為那取決於選了哪個產業——前端切換產業時
# 只要換一組遮罩重新上色，不必重新載入資料。
AREA_BITS = {"remote": 1, "northern": 2, "regional": 4, "bushfire": 8, "disaster": 16}
BIT_FIRE, BIT_DISASTER = AREA_BITS["bushfire"], AREA_BITS["disaster"]
REBUILD_MASK = BIT_FIRE | BIT_DISASTER

LABELS = {"qld": "昆士蘭", "nsw": "新南威爾斯", "vic": "維多利亞",
          "sa": "南澳", "wa": "西澳", "tas": "塔斯馬尼亞",
          "nt": "北領地", "act": "首都領地"}


EXCLUDED = {
    "qld": "布里斯本市區與黃金海岸多數郵區不在名單上。",
    "nsw": "雪梨、紐卡索、臥龍崗、中央海岸的郵區不在名單上。",
    "vic": "墨爾本都會區的郵區不在名單上。",
    "wa": "珀斯都會區的郵區不在名單上。",
}
EXCLUDED_EN = {
    "qld": "Inner Brisbane and most of the Gold Coast are not on the list.",
    "nsw": "Sydney, Newcastle, Wollongong and the Central Coast are not on the list.",
    "vic": "Metropolitan Melbourne is not on the list.",
    "wa": "Metropolitan Perth is not on the list.",
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


def work_mask(industry_areas):
    """某個產業的「一般工作就算」是哪幾張表的聯集。"""
    m = 0
    for a in industry_areas or []:
        m |= AREA_BITS[a]
    return m


def categorise(rings, flags, mask):
    """把每個郵區歸成三個互斥類別，並統計數量。

    綠 work    ：這個產業認可的地區表裡，一般工作就算
    琥珀 rebuild：不在上面那些表裡，但被宣告為災區，只有災後重建工作算
    灰 none    ：兩者皆非

    琥珀再細分成大火／天災／兩者——災害種類只有在「重建是唯一路徑」時才
    影響決定（日期門檻不同、ImmiAccount 的 Employment type 也不同）。
    在綠色郵區，一般工作本來就算，災害種類是次要資訊，留在詳情面板。
    """
    c = dict(work=0, rebuild=0, none=0, fire_only=0, flood_only=0, fire_and_flood=0)
    for k in rings:
        f = flags.get(int(k), 0)
        if f & mask:
            c["work"] += 1
        elif f & REBUILD_MASK:
            c["rebuild"] += 1
            if (f & BIT_FIRE) and (f & BIT_DISASTER):
                c["fire_and_flood"] += 1
            elif f & BIT_FIRE:
                c["fire_only"] += 1
            else:
                c["flood_only"] += 1
        else:
            c["none"] += 1
    return c


# 建置目標。
#   pages    －－ 頁面之間用相對路徑（qld.html）。給 GitHub Pages 用，也是預設。
#              相對路徑在同一個站台裡原地跳轉，沒有 iframe 沙箱那些限制。
#   artifact －－ 用 data/artifacts.json 裡的絕對網址。那個檔不進版控
#              （裡面是私人的 Artifact 連結），所以只有本機才建得出來。
TARGET = os.environ.get("TARGET", "pages")

# 發佈管道。dev 會多一條細橫幅與 noindex——開發版在 Pages 上是公開的，
# 要擋的是「被搜尋引擎索引」和「有人誤以為那是正式版」，不是擋人進來。
CHANNEL = os.environ.get("CHANNEL", "stable")
# 已發佈站台的網址。開發版橫幅要連過去讓人對照——開發版現在只在本機建，
# 相對路徑沒有意義。留空就只出橫幅不出連結。
SITE_URL = "https://crayon3shawn.github.io/au-417-map/"
ARTIFACTS = ROOT / "data" / "artifacts.json"


def robots_meta():
    """開發版擋搜尋引擎收錄的 meta，建置時就寫進 head。

    不留給 JS 去插入：爬蟲不保證會執行 JS。而 robots.txt 只有放在網域根目錄
    才會被讀到，站台掛在 /<repo>/ 底下時那個檔是無效的，所以這行 meta 是
    唯一真正在擋的東西。
    """
    return '<meta name="robots" content="noindex, nofollow">\n' if CHANNEL == "dev" else ""

STATE_ORDER = ["qld", "nsw", "vic", "wa"]


SEARCH_INDEX = "search-index.json"


def national_flags():
    """全澳郵區的「州別 + 地區表旗標」，依州分組。

    這一份小（約 26 KB）所以每個頁面都內嵌：入口頁的地圖上色、各州統計、
    行政區統計全部要用它，延後載入的話一進頁面會先看到一張沒有顏色的地圖。
    """
    idx = load(ROOT / "data" / "portal-index.json")["postcodes"]
    src = load(ROOT / "data" / "postcodes.json")["areas"][VISA]
    flags = {}
    for area, bit in AREA_BITS.items():
        for st, ranges in src.get(area, {}).items():
            for n in expand(ranges, st):
                flags[n] = flags.get(n, 0) | bit
    out = {}
    for pc, v in idx.items():
        out.setdefault(v[0], {})[pc] = flags.get(int(pc), 0)
    return out


def national_names():
    """全澳郵區的地名，用 | 串接。

    這一份大（約 217 KB），而且只有「用地名搜尋」才需要，所以 pages 版抽成
    一個共用檔：入口頁與四個州頁指向同一個網址，瀏覽器只下載一次，之後走
    快取。內嵌到每一頁的話光四個州頁就多將近 900 KB，而使用者多半只會開一兩頁。

    artifact 版沒有第二個檔可以放，只能內嵌。
    """
    idx = load(ROOT / "data" / "portal-index.json")["postcodes"]
    return {pc: "|".join([v[1]] + list(v[2] or [])) for pc, v in idx.items()}


def write_search_index():
    """pages 版把地名表寫成獨立檔，回傳頁面要用的網址；artifact 版回傳 None。"""
    if TARGET == "artifact":
        return None
    path = ROOT / "dist" / SEARCH_INDEX
    path.parent.mkdir(parents=True, exist_ok=True)
    save(path, national_names(), compact=True)
    return SEARCH_INDEX


def site_links(state=None):
    """各頁之間的連結。

    導覽用縮寫：澳洲當地（求職廣告、地址）就是講 QLD／NSW，比中文州名好認也省空間。
    """
    if TARGET == "artifact":
        if not ARTIFACTS.exists():
            raise SystemExit("TARGET=artifact 需要 data/artifacts.json（該檔不進版控）")
        art = load(ARTIFACTS)
        home, urls = art.get("portal"), art.get("urls", {})
    else:
        home, urls = "index.html", {k: f"{k}.html" for k in STATE_ORDER}

    out = []
    if home:
        out.append({"label": "全澳入口", "url": home, "home": True})
    for key in STATE_ORDER:
        if key in urls:
            out.append({"label": key.upper(), "url": urls[key], "current": key == state})
    return out


def nav_links(state):
    """頁首的導覽：回入口頁，以及切到其他州。

    州頁原本是死路——從入口頁點進來之後沒有任何方式回去或切換。
    """
    return site_links(state)


def part(name):
    """樣板拆成結構／樣式／程式三個檔，建置時再合成單一自包含 HTML。
    產出完全一樣，拆的是原始碼不是成品。"""
    return (ROOT / "src" / name).read_text(encoding="utf-8")


def theme_js():
    """深淺色切換。注入在 <style> 之後、內容之前——它必須在畫面繪製前執行，
    等到頁尾的主程式才跑會先閃一下系統主題。"""
    return (ROOT / "src" / "theme.js").read_text(encoding="utf-8")


def url_js():
    """可分享的網址（?ind=&pc=）。兩頁共用同一份格式——各寫一份的話，改了一邊
    只會變成入口頁貼出來的連結在州頁打不開，不會有錯誤訊息。"""
    return (ROOT / "src" / "url.js").read_text(encoding="utf-8")


def lamp_js():
    """跟著滑鼠的光源。只有入口頁注入，州頁刻意不做（理由寫在 lamp.js 檔頭）。
    放在主程式之後——它要抓 .app-map 裡的節點，而那是主程式建的。"""
    return (ROOT / "src" / "lamp.js").read_text(encoding="utf-8")


def tokens_css():
    """共用的設計 token 與外殼元件。兩個樣板都注入同一份。

    tokens.css 是顏色與字級，base.css 是外殼與元件（標頭、側欄區塊、卡片、
    搜尋結果列…）。兩份都共用的理由一樣：各自維護一份的話，改了一邊不會有
    任何錯誤訊息，只會變成「入口頁跟州頁長得不一樣」，要有人看到才會發現。
    """
    return "\n".join((ROOT / "src" / f).read_text(encoding="utf-8")
                     for f in ("tokens.css", "base.css"))

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

    industries = load(ROOT / "data" / "industries.json")["industries"]

    # 每個郵區在五張地區表裡的成員資格。
    #
    # 跨全澳取聯集，不是只看本州：郵區的合格性是郵區本身的屬性，不該隨你
    # 看哪一頁而變。0872 橫跨 NT／WA／SA，只出現在 NT 的 regional 表
    # （「全境皆可」），逐州算的話在 WA 頁會被誤判成不是 regional。
    flags = {}
    for area, bit in AREA_BITS.items():
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

    # flags 是全澳的（郵區身分不隨頁面而變），但這一頁只需要本州相關的郵區：
    # 有邊界面的，加上本州地名檔裡有登記且在任一張表上的。
    candidates = {int(k) for k in rings} | {int(k) for k in loc if int(k) in flags}

    records, no_coord, non_geo = [], [], []
    for pc in sorted(candidates):
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
        records.append([pc, d["lon"], d["lat"], flags.get(pc, 0), d["names"]])
    no_poly = sorted(r[0] for r in records if str(r[0]) not in rings)
    other = {k: loc[k]["names"] for k in rings if k in loc}

    src = pcdata["sources"]
    meta = {
        "state": state,
        "visa": VISA,
        # 落款與出處段落都要用到這些值。不在這裡組成句子——組好的句子只有一種
        # 語言，而且樣板裡若另外寫死一份日期，官網一更新那份就開始說謊。
        "page_date": src[VISA]["page_last_updated"],
        "built_at": pcdata["fetched_at"][:10],
        "n_no_poly": len(no_poly),
        "state_label": LABELS.get(state, STATES[state]["name"]),
        "state_abbr": state.upper(),
        "channel": CHANNEL,
        "site_url": SITE_URL,
        "source_url": src[VISA]["url"],
        "strings": load(ROOT / "data" / "strings.json")["s"],
        # 跨州查詢：旗標表小所以內嵌，地名表大所以指向共用檔（見 national_names）
        "nat": national_flags(),
        "index_url": write_search_index(),
        "index_inline": national_names() if TARGET == "artifact" else None,
        "state_name_en": STATES[state]["name"],
        "nav": nav_links(state),
        "excluded_note": EXCLUDED.get(state, ""),
        "excluded_note_en": EXCLUDED_EN.get(state, ""),
        "bbox": bbox([r for rs in rings.values() for r in rs]),
        "industries": [
            {"key": key, "label": v["label"], "en": v["en"],
             "scope": v.get("scope", ""), "scope_en": v.get("scope_en", ""),
             "label_en": v.get("label_en", v["en"]),
             "mask": work_mask(v["areas"][VISA]),
             "counts": categorise(rings, flags, work_mask(v["areas"][VISA]))}
            for key, v in industries.items() if v["areas"][VISA]
        ],
        "industry": DEFAULT_INDUSTRY,
        "counts": {**categorise(rings, flags, work_mask(industries[DEFAULT_INDUSTRY]["areas"][VISA])),
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
    for token, value in (("__ROBOTS__", robots_meta()),
                         ("__TOKENS__", tokens_css()),
                         ("__THEME__", theme_js()),
                         ("__URL__", url_js()),
                         ("__CSS__", part("map.css")),
                         ("__JS__", part("map.js").replace("// @ts-check\n", "", 1)),
                         # JS 一跑就會依語言改寫 document.title，這裡只是後備，
                         # 所以雙語並列——寫死單一語言的話切語言標題不會動。
                         ("__TITLE__", f"{LABELS.get(state, STATES[state]['name'])}"
                                       f" 417 集簽地圖 · {STATES[state]['name']} 417 Visa Map"),
                         ("__DATA__", json.dumps(payload, ensure_ascii=False, separators=(",", ":")))):
        if token not in html:
            raise SystemExit(f"樣板裡找不到注入點 {token}")
        html = html.replace(token, value)

    dest = ROOT / "dist" / f"{state}.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")

    print(f"郵區 {len(rings)}，各產業的「一般工作就算」數量：")
    for ind in meta["industries"]:
        c = ind["counts"]
        mark = "  ←預設" if ind["key"] == DEFAULT_INDUSTRY else ""
        print(f"    {ind['label']:6s} 就算 {c['work']:4d} · 只有重建 {c['rebuild']:4d}"
              f" · 不算 {c['none']:4d}{mark}")
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
    print(f"  Home Affairs {meta['page_date']} · 建置 {meta['built_at']}")
    print(f"-> {dest.relative_to(ROOT)}  ({dest.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    main((sys.argv[1] if len(sys.argv) > 1 else "qld").lower())
