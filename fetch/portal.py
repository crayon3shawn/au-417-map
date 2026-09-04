#!/usr/bin/env python3
"""入口頁需要的兩份資料，各自只下載一次。

  1. 全澳郵區索引：郵區號碼 -> [州, 代表地名]
  2. 全澳各行政區的州界輪廓

入口頁不放郵區多邊形，所以很輕；郵區的「算不算」由 build 從
data/postcodes.json 現算，不重複儲存。

用法： python3 fetch/portal.py
輸出： data/portal-index.json, data/outline-au.json
"""
import sys, csv, io, json, re, pathlib, collections, urllib.parse
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, fetch_cached, is_deliverable, save, STATES
from importlib import import_module

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSV_SRC = ("https://raw.githubusercontent.com/matthewproctor/australianpostcodes"
           "/master/australian_postcodes.csv")
STE_SRC = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer/1/query"
STE_OFFSET = 0.05      # 概化容差（度），約 5 公里——入口頁只是概觀
STE_MIN_RING = 0.02    # 額外環的面積門檻（平方度），濾掉零碎離島

# 郵件處理中心之類的非地理郵區，索引裡不需要
sys.path.insert(0, str(ROOT))
build = import_module("build")


def ring_area(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2


# 郵區的代表地名。答案面板上「2480」下面印的就是這一個，所以它要是**使用者
# 認得出來的那個鎮**，不是這個郵區底下任何一個地名。
#
# 原本取最短的，理由是「通常就是主聚落（Cairns 而不是 Cairns North）」。那個
# 理由在有主聚落的郵區成立，在沒有的郵區就變成隨機挑一個小村：2480 是
# Lismore，74 個地名裡最短的卻是「Jiggi」；2250 是 Gosford，取到「Calga」；
# 2795 是 Bathurst，102 個地名裡取到「Colo」。
#
# 改用兩個資料訊號，都命不中才退回原本的規則：
#
#   1. 包含關係。其他地名把它整個包在裡面的，多半是本鎮——Lismore 被
#      East Lismore、North Lismore、South Lismore、Lismore Heights 包住。
#      門檻設兩個以上，一個的話太容易誤中（Colo / Colo Vale 之類）。
#
#   2. 投遞中心（CSV 的 dc 欄）。2481 的每一列都寫 BYRON BAY DC，而
#      Byron Bay 沒有任何衍生地名，訊號 1 命不中。取眾數再去掉 DC／LPO
#      那類尾綴即可。
#      但方位變體要擋掉：2031 的投遞中心是 CLOVELLY WEST DC，照抄會把
#      Clovelly 換成 Clovelly West——那是變糟，不是變好。
#
# 全澳 2715 個郵區裡 671 個因此換到更好的名字，其餘維持原樣。
_DC_SUFFIX = re.compile(r"\s+(DC|LPO|MC|BC|PDC|DELIVERY CENTRE)$", re.I)
_DIRECTION = re.compile(r"\s+(North|South|East|West|Central|Heights|Upper|Lower)$", re.I)


def main_name(pc, real, centres):
    score = {n: sum(1 for m in real if m != n and n in m) for n in real}
    best = max(real, key=lambda n: (score[n], -len(n), n))
    if score[best] >= 2:
        return best
    if centres:
        hub = _DC_SUFFIX.sub("", collections.Counter(centres).most_common(1)[0][0]).title()
        if hub in real and not (_DIRECTION.search(hub) and _DIRECTION.sub("", hub) in real):
            return hub
    return min(real, key=lambda s: (len(s), s))


def postcode_index():
    print(f"下載 {CSV_SRC}")
    rows = list(csv.DictReader(io.StringIO(fetch_cached(CSV_SRC, "australian_postcodes.csv"))))
    print(f"  {len(rows)} 列")
    names = collections.defaultdict(list)
    centres = collections.defaultdict(list)
    state_of = {}
    for r in rows:
        st = (r.get("state") or "").strip().lower()
        if st not in STATES or not is_deliverable(r, st):
            continue
        try:
            pc = int(r["postcode"])
        except (ValueError, TypeError, KeyError):
            continue
        nm = (r.get("locality") or "").strip().title()
        if nm:
            names[pc].append(nm)
        dc = (r.get("dc") or "").strip()
        if dc:
            centres[pc].append(dc)
        state_of.setdefault(pc, st)

    out = {}
    for pc, ns in names.items():
        real = sorted({n for n in ns if not build.is_non_geographic([n])})
        if not real:
            continue
        # [州, 代表地名, 其餘地名]
        # 其餘地名保留下來供搜尋——入口頁要能用地名查，不是只能查號碼。
        out[str(pc)] = [state_of[pc], main_name(pc, real, centres.get(pc)),
                        None]
        out[str(pc)][2] = [n for n in real if n != out[str(pc)][1]]
    if len(out) < 2000:
        raise SystemExit(f"只取得 {len(out)} 個郵區，明顯過少，已中止")
    save(ROOT / "data" / "portal-index.json",
         {"source": CSV_SRC, "postcodes": out}, compact=True)
    print(f"  {len(out)} 個郵區 -> data/portal-index.json")


def outlines():
    """州界輪廓，取自 ABS 的 STE 圖層（跟郵區邊界同一個服務、同樣 CC BY 4.0）。

    概化交給伺服器端的 maxAllowableOffset，所以這裡不需要自己實作簡化演算法。
    """
    print(f"下載 {STE_SRC}")
    q = urllib.parse.urlencode({
        "where": "1=1", "outFields": "state_name_2021", "returnGeometry": "true",
        "outSR": 4326, "geometryPrecision": 2, "maxAllowableOffset": STE_OFFSET,
        "f": "geojson"})
    d = json.loads(fetch(f"{STE_SRC}?{q}", timeout=300))

    by_name = {st["name"]: key for key, st in STATES.items()}
    out = {}
    for ft in d.get("features", []):
        key = by_name.get(ft["properties"]["state_name_2021"])
        if key is None:
            continue          # Other Territories / Outside Australia，入口頁不畫
        g = ft.get("geometry")
        if not g:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = sorted([p[0] for p in polys if len(p[0]) >= 4], key=ring_area, reverse=True)
        if not rings:
            continue
        # 最大環一律保留（ACT 很小），其餘只留夠大的島
        keep = [rings[0]] + [r for r in rings[1:] if ring_area(r) >= STE_MIN_RING]
        out[key] = [[[round(x, 2), round(y, 2)] for x, y in r] for r in keep]

    missing = set(STATES) - set(out)
    if missing:
        raise SystemExit(f"缺少行政區 {sorted(missing)}，ABS 服務或欄位可能有變，已中止")

    save(ROOT / "data" / "outline-au.json",
         {"source": STE_SRC, "layer": "ASGS2021/STE/1 (STE_GEN)",
          "params": {"maxAllowableOffset": STE_OFFSET}, "outlines": out}, compact=True)
    pts = sum(len(r) for rs in out.values() for r in rs)
    print(f"  {len(out)} 個行政區 / {pts} 個點 -> data/outline-au.json")


if __name__ == "__main__":
    postcode_index()
    outlines()
