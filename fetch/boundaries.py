#!/usr/bin/env python3
"""從 ABS 官方 ArcGIS 服務抓郵區（Postal Area）邊界。

用的是 POA_GEN 概化圖層，再加上 maxAllowableOffset 讓伺服器端先簡化，
所以下載量小、也不需要在本機做拓樸運算。

用法： python3 fetch/boundaries.py qld
輸出： data/poa-<state>.json
"""
import sys, json, urllib.parse, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, save, STATES

BASE = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/POA/MapServer/1/query"
OFFSET = 0.0015      # 概化容差（度），約 165 公尺
PRECISION = 4        # 座標小數位
MIN_EXTRA_AREA = 0.0006   # 最大環一律保留；額外離島小於此面積（平方度）就丟掉
PAGE = 40
ROOT = pathlib.Path(__file__).resolve().parents[1]


def ring_area(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2


def query(where, offset):
    q = urllib.parse.urlencode({
        "where": where, "outFields": "poa_code_2021", "returnGeometry": "true",
        "outSR": 4326, "geometryPrecision": PRECISION, "maxAllowableOffset": OFFSET,
        "resultOffset": offset, "resultRecordCount": PAGE, "f": "geojson"})
    return json.loads(fetch(f"{BASE}?{q}", timeout=180))


def main(state):
    if state not in STATES:
        raise SystemExit(f"未知的州別 {state}；可用：{', '.join(STATES)}")
    where = " OR ".join(f"poa_code_2021 LIKE '{p}%'" for p in STATES[state]["abs_like"])

    feats, offset = [], 0
    while True:
        batch = query(where, offset).get("features", [])
        if not batch:
            break
        feats += batch
        print(f"  offset {offset}: +{len(batch)}（累計 {len(feats)}）")
        offset += PAGE
        if offset > 5000:
            raise SystemExit("分頁次數異常，已中止")
    if len(feats) < 20:
        raise SystemExit(f"只取得 {len(feats)} 個郵區面，明顯過少——服務或參數可能有變，已中止")

    lo, hi = STATES[state]["ranges"][0][0], STATES[state]["ranges"][-1][1]
    rings, dropped = {}, 0
    for ft in feats:
        code = int(ft["properties"]["poa_code_2021"])
        if not any(a <= code <= b for a, b in STATES[state]["ranges"]):
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
        "params": {"maxAllowableOffset": OFFSET, "geometryPrecision": PRECISION,
                   "min_extra_ring_area_sqdeg": MIN_EXTRA_AREA},
        "rings": rings}, compact=True)
    pts = sum(len(r) for rs in rings.values() for r in rs)
    print(f"  {len(rings)} 個郵區面 / {pts} 個座標點（丟棄零碎離島環 {dropped} 個）"
          f" -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main((sys.argv[1] if len(sys.argv) > 1 else "qld").lower())
