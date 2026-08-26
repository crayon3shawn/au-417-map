#!/usr/bin/env python3
"""從 ABS 官方 ArcGIS 服務抓郵區（Postal Area）邊界。

用的是 POA_GEN 概化圖層，再加上 maxAllowableOffset 讓伺服器端先簡化，
所以下載量小、也不需要在本機做拓樸運算。

**概化容差依郵區面積分級**，不是全部同一個值。理由是地圖會依郵區大小聚焦
（見 src/map.js 的 focusOnNode），所以每個郵區被看到的比例尺跟它自己的
大小成正比——大郵區永遠在低倍率被看到，用同一個細容差是白花點數。

單一容差 165 公尺的實際後果：市區郵區（雪梨 CBD 只有兩三公里）被簡化到
只剩二十幾個點，邊緣變成粗折線，而且相鄰郵區各自簡化後邊界不再貼合，放大
時會露出黑色縫隙。同一個 165 公尺對內陸那些上百公里的郵區來說，卻比需要的
細了好幾倍。

分級之後小郵區細一倍、大郵區放粗，總點數反而少約 4%。

用法： python3 fetch/boundaries.py qld
輸出： data/poa-<state>.json
"""
import sys, json, urllib.parse, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, save, STATES, CROSS_BORDER

BASE = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/POA/MapServer/1/query"

# (面積上限（平方公里）, 概化容差（度）)。上限用 None 表示沒有上限。
# 容差的依據：郵區聚焦後大約佔視野六成，所以畫面上一個像素代表的距離
# 跟郵區大小成正比。要讓概化誤差維持在兩個像素以內，容差大約是「郵區
# 邊長除以 180」；小郵區則受縮放上限（畫面寬約 28 公里）限制，需要 90 公尺
# 上下才夠。
TIERS = [
    (300,  0.0008),   # 約 89 公尺——市區與近郊，會被放到縮放上限
    (3000, 0.0015),   # 約 165 公尺——區域型郵區
    (None, 0.004),    # 約 444 公尺——內陸大郵區，本來就只在低倍率看得到
]
PRECISION = 4        # 座標小數位
# 最大環一律保留；額外離島小於此面積（平方度）就丟掉。
# 0.00005 平方度約 0.5 平方公里——原本設 0.0006（約 6 平方公里）比整個
# 市區郵區還大，會把多塊組成的市區郵區的其他塊整個丟掉。
MIN_EXTRA_AREA = 0.00005
PAGE = 40
ROOT = pathlib.Path(__file__).resolve().parents[1]


def ring_area(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2


def query(where, page_offset, tolerance):
    q = urllib.parse.urlencode({
        "where": where, "outFields": "poa_code_2021", "returnGeometry": "true",
        "outSR": 4326, "geometryPrecision": PRECISION, "maxAllowableOffset": tolerance,
        "resultOffset": page_offset, "resultRecordCount": PAGE, "f": "geojson"})
    return json.loads(fetch(f"{BASE}?{q}", timeout=180))


def fetch_tier(where, tolerance, label):
    feats, page = [], 0
    while True:
        batch = query(where, page, tolerance).get("features", [])
        if not batch:
            break
        feats += batch
        page += PAGE
        if page > 5000:
            raise SystemExit("分頁次數異常，已中止")
    print(f"  {label}: {len(feats)} 個面（容差 {tolerance} 度，約 {tolerance*111000:.0f} 公尺）")
    return feats


def main(state):
    if state not in STATES:
        raise SystemExit(f"未知的州別 {state}；可用：{', '.join(STATES)}")
    clauses = [f"poa_code_2021 LIKE '{p}%'" for p in STATES[state]["abs_like"]]
    # 橫跨州界的郵區用號碼直接指定，否則本州地圖會出現大片留白
    extra = CROSS_BORDER.get(state, [])
    clauses += [f"poa_code_2021 = '{pc:04d}'" for pc in extra]
    where = " OR ".join(clauses)

    feats, lo_area = [], 0
    for hi_area, tol in TIERS:
        cond = (f"area_albers_sqkm >= {lo_area}" if hi_area is None
                else f"area_albers_sqkm >= {lo_area} AND area_albers_sqkm < {hi_area}")
        label = f"{lo_area}–{hi_area if hi_area else '∞'} 平方公里"
        feats += fetch_tier(f"({where}) AND {cond}", tol, label)
        lo_area = hi_area
    if len(feats) < 20:
        raise SystemExit(f"只取得 {len(feats)} 個郵區面，明顯過少——服務或參數可能有變，已中止")

    lo, hi = STATES[state]["ranges"][0][0], STATES[state]["ranges"][-1][1]
    rings, dropped = {}, 0
    for ft in feats:
        code = int(ft["properties"]["poa_code_2021"])
        if code not in extra and not any(a <= code <= b for a, b in STATES[state]["ranges"]):
            continue
        g = ft.get("geometry")
        if not g:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rs = [p[0] for p in polys if len(p[0]) >= 4]
        if not rs:
            continue
        rs.sort(key=ring_area, reverse=True)
        keep = [rs[0]]
        for r in rs[1:]:
            if ring_area(r) >= MIN_EXTRA_AREA:
                keep.append(r)
            else:
                dropped += 1
        rings[str(code)] = [[[round(x, PRECISION), round(y, PRECISION)] for x, y in r] for r in keep]

    path = ROOT / "data" / f"poa-{state}.json"
    save(path, {
        "source": BASE, "layer": "ASGS2021/POA/MapServer/1 (POA_GEN)", "state": state,
        "params": {"tiers": [[hi, tol] for hi, tol in TIERS],
                   "geometryPrecision": PRECISION,
                   "min_extra_ring_area_sqdeg": MIN_EXTRA_AREA},
        "rings": rings}, compact=True)
    pts = sum(len(r) for rs in rings.values() for r in rs)
    print(f"  {len(rings)} 個郵區面 / {pts} 個座標點（丟棄零碎離島環 {dropped} 個）"
          f" -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main((sys.argv[1] if len(sys.argv) > 1 else "qld").lower())
