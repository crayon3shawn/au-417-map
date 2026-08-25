#!/usr/bin/env python3
"""建立「行政區（LGA）→ 郵遞區號」對照表。

為什麼要這個：職缺廣告是用行政區名寫的（Seek 的地點分類就是「Gosford &
Central Coast」「Sunshine Coast」這種），但郵政資料裡只有地名（suburb），
沒有行政區名。使用者打「Central Coast」查不到任何東西，而那正是他決定要不要
投履歷的當下手上唯一的資訊。

為什麼不用現成欄位、也不用地名座標：
  * 地名 CSV 有 lgaregion 欄位，抽驗八個錯兩個（GOSFORD 被標成 Hawkesbury、
    MOUNT ISA 被標成 Carpentaria）。
  * CSV 的座標也不能拿來做幾何運算。它給同一郵區底下大多數地名同一組座標，
    而那組座標本身可能是錯的——郵區 2000 的九個地名有八個共用 151.2566，
    那在雪梨 CBD 東邊五公里的海上，測出來會落在 Sydney 市之外。

所以兩邊都用 ABS 自己的圖層：郵區面（POA）與行政區面（LGA）。做法是在每個
郵區面內部灑格點，看各格點落在哪個行政區，再依比例決定歸屬——等於粗略地算
面積重疊。單點判斷會讓橫跨兩區的郵區只拿到其中一邊，而聯集又會讓一個壓線的
角落就製造出假的歸屬。

界線只拿來做點在多邊形內判斷，不會畫出來，所以兩邊都可以概化得很粗。

用法： python3 fetch/regions.py
輸出： data/regions.json
"""
import sys, json, urllib.parse, pathlib, collections

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, save

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRV = "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021"
LGA_Q = f"{SRV}/LGA/MapServer/1/query"
POA_Q = f"{SRV}/POA/MapServer/1/query"

LGA_OFFSET = 0.005      # 約 550 公尺，行政區尺度夠用
POA_OFFSET = 0.005
PAGE = 200
GRID = 8                # 每個郵區面取樣 GRID×GRID 個格點
MIN_SHARE = 0.10        # 行政區要佔到郵區這個比例的格點才算涵蓋

ST = {"New South Wales": "nsw", "Victoria": "vic", "Queensland": "qld",
      "South Australia": "sa", "Western Australia": "wa", "Tasmania": "tas",
      "Northern Territory": "nt", "Australian Capital Territory": "act",
      "Other Territories": "other"}


def download(url, fields, offset_deg, label):
    feats, off = [], 0
    while True:
        q = urllib.parse.urlencode({
            "where": "1=1", "outFields": fields, "returnGeometry": "true",
            "outSR": 4326, "geometryPrecision": 4,
            "maxAllowableOffset": offset_deg,
            "resultOffset": off, "resultRecordCount": PAGE, "f": "geojson"})
        batch = json.loads(fetch(f"{url}?{q}", timeout=180)).get("features", [])
        if not batch:
            break
        feats += batch
        off += PAGE
        print(f"  {label} 已取 {len(feats)}…")
    return feats


def rings_of(geom):
    """Polygon / MultiPolygon 一律攤平成環的清單。

    外環與內環（挖空）都收——射線法會自然把挖空處判成在外面，因為穿越次數
    多了一次。
    """
    if not geom:
        return []
    if geom["type"] == "MultiPolygon":
        return [r for poly in geom["coordinates"] for r in poly]
    return list(geom["coordinates"])


def inside(rings, x, y):
    c = False
    for r in rings:
        j = len(r) - 1
        for i in range(len(r)):
            xi, yi = r[i][0], r[i][1]
            xj, yj = r[j][0], r[j][1]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
            j = i
    return c


def bbox_of(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    lgas = []
    for f in download(LGA_Q, "lga_name_2021,state_name_2021", LGA_OFFSET, "行政區"):
        rings = rings_of(f.get("geometry"))
        if not rings:
            continue
        p = f["properties"]
        lgas.append({"name": p["lga_name_2021"],
                     "state": ST.get(p["state_name_2021"], "?"),
                     "rings": rings, "bbox": bbox_of(rings)})
    print(f"  {len(lgas)} 個行政區")

    poas = []
    for f in download(POA_Q, "poa_code_2021", POA_OFFSET, "郵區"):
        rings = rings_of(f.get("geometry"))
        if not rings:
            continue
        try:
            pc = int(f["properties"]["poa_code_2021"])
        except (ValueError, TypeError):
            continue
        poas.append((pc, rings, bbox_of(rings)))
    print(f"  {len(poas)} 個郵區面")

    # 照整數緯度分桶，格點只要跟重疊的那幾個行政區比對
    band = collections.defaultdict(list)
    for r in lgas:
        for b in range(int(r["bbox"][1]) - 1, int(r["bbox"][3]) + 2):
            band[b].append(r)

    hits = collections.defaultdict(set)
    no_sample = []
    for n, (pc, rings, bb) in enumerate(poas):
        if n % 400 == 0:
            print(f"  取樣中 {n}/{len(poas)}…")
        x0, y0, x1, y1 = bb
        pts = []
        for i in range(GRID):
            for j in range(GRID):
                x = x0 + (x1 - x0) * (i + 0.5) / GRID
                y = y0 + (y1 - y0) * (j + 0.5) / GRID
                if inside(rings, x, y):
                    pts.append((x, y))
        if not pts:                       # 細長或極小的郵區可能一個格點都沒中
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            pts = [(cx, cy)]
            no_sample.append(pc)
        votes = collections.Counter()
        for x, y in pts:
            for r in band.get(int(y), ()):
                b = r["bbox"]
                if b[0] <= x <= b[2] and b[1] <= y <= b[3] and inside(r["rings"], x, y):
                    votes[(r["name"], r["state"])] += 1
        need = max(1, len(pts) * MIN_SHARE)
        for key, c in votes.items():
            if c >= need:
                hits[key].add(pc)

    out = {}
    for (name, state), pcs in sorted(hits.items()):
        out[name] = {"state": state, "postcodes": sorted(pcs)}

    pairs = sum(len(v["postcodes"]) for v in out.values())
    print(f"  {len(out)} 個行政區、{pairs} 組對應"
          f"（{len(no_sample)} 個郵區太小或太細長，退回用中心點）")

    save(ROOT / "data" / "regions.json", {
        "source": SRV,
        "layers": "LGA_GEN + POA_GEN",
        "params": {"lga_offset": LGA_OFFSET, "poa_offset": POA_OFFSET,
                   "grid": GRID, "min_share": MIN_SHARE},
        "regions": out,
    }, compact=True)


if __name__ == "__main__":
    main()
