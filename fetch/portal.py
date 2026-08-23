#!/usr/bin/env python3
"""入口頁需要的兩份資料，各自只下載一次。

  1. 全澳郵區索引：郵區號碼 -> [州, 代表地名]
  2. 全澳各行政區的州界輪廓

入口頁不放郵區多邊形，所以很輕；郵區的「算不算」由 build 從
data/postcodes.json 現算，不重複儲存。

用法： python3 fetch/portal.py
輸出： data/portal-index.json, data/outline-au.json
"""
import sys, csv, io, json, pathlib, collections
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, fetch_cached, is_deliverable, save, STATES
from importlib import import_module

ROOT = pathlib.Path(__file__).resolve().parents[1]
CSV_SRC = ("https://raw.githubusercontent.com/matthewproctor/australianpostcodes"
           "/master/australian_postcodes.csv")
GEO_SRC = "https://raw.githubusercontent.com/rowanhogan/australian-states/master/states.geojson"

# 郵件處理中心之類的非地理郵區，索引裡不需要
sys.path.insert(0, str(ROOT))
build = import_module("build")


def postcode_index():
    print(f"下載 {CSV_SRC}")
    rows = list(csv.DictReader(io.StringIO(fetch_cached(CSV_SRC, "australian_postcodes.csv"))))
    print(f"  {len(rows)} 列")
    names = collections.defaultdict(list)
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
        state_of.setdefault(pc, st)

    out = {}
    for pc, ns in names.items():
        real = [n for n in ns if not build.is_non_geographic([n])]
        if not real:
            continue
        # 代表地名取最短的：通常就是主聚落（"Cairns" 而不是 "Cairns North"）
        out[str(pc)] = [state_of[pc], min(real, key=lambda s: (len(s), s))]
    if len(out) < 2000:
        raise SystemExit(f"只取得 {len(out)} 個郵區，明顯過少，已中止")
    save(ROOT / "data" / "portal-index.json",
         {"source": CSV_SRC, "postcodes": out}, compact=True)
    print(f"  {len(out)} 個郵區 -> data/portal-index.json")


def outlines():
    print(f"下載 {GEO_SRC}")
    basemap = import_module("fetch.basemap") if False else None
    sys.path.insert(0, str(ROOT / "fetch"))
    import basemap as bm
    d = json.loads(fetch(GEO_SRC, timeout=300))
    out = {}
    for key, st in STATES.items():
        f = next((x for x in d["features"] if x["properties"]["STATE_NAME"] == st["name"]), None)
        if f is None:
            print(f"  ⚠ 找不到 {st['name']}")
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = sorted([p[0] for p in polys], key=len, reverse=True)
        # 入口頁只是概觀，簡化得比州頁更狠。但最大環一律保留——
        # ACT 很小，用固定點數門檻會把它整個濾掉。
        keep = [rings[0]] + [r for r in rings[1:] if len(r) >= 120]
        out[key] = [[[round(x, 2), round(y, 2)]
                     for x, y in bm.simplify_ring([(x, y) for x, y in r], 0.12)]
                    for r in keep]
    save(ROOT / "data" / "outline-au.json", {"source": GEO_SRC, "outlines": out}, compact=True)
    pts = sum(len(r) for rs in out.values() for r in rs)
    print(f"  {len(out)} 個行政區 / {pts} 個點 -> data/outline-au.json")


if __name__ == "__main__":
    postcode_index()
    outlines()
