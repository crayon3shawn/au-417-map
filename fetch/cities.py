#!/usr/bin/env python3
"""把人工維護的城市清單解析成座標。

人只維護 data/cities-<state>.seed.json：顯示名稱、要查的地名、層級、標籤方向。
座標由這支腳本從 Australia Post 地名資料查出來，不靠人（或我）憑印象輸入。

用法： python3 fetch/cities.py qld
輸入： data/cities-<state>.seed.json
輸出： data/cities-<state>.json
"""
import sys, csv, io, json, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, save, load, STATES

SRC = ("https://raw.githubusercontent.com/matthewproctor/australianpostcodes"
       "/master/australian_postcodes.csv")
ROOT = pathlib.Path(__file__).resolve().parents[1]


def main(state):
    if state not in STATES:
        raise SystemExit(f"未知的州別 {state}")
    seed_path = ROOT / "data" / f"cities-{state}.seed.json"
    if not seed_path.exists():
        raise SystemExit(f"找不到 {seed_path.name}，請先建立城市清單")
    seed = load(seed_path)["cities"]

    print(f"下載 {SRC}")
    rows = [r for r in csv.DictReader(io.StringIO(fetch(SRC, timeout=180)))
            if (r.get("state") or "").strip().lower() == state]

    index = {}
    for r in rows:
        name = (r.get("locality") or "").strip().lower()
        try:
            lat = float(r.get("Lat_precise") or r["lat"])
            lon = float(r.get("Long_precise") or r["long"])
        except (ValueError, TypeError):
            continue
        if not lat or not lon:
            continue
        index.setdefault((name, r["postcode"].strip()), (lon, lat))
        index.setdefault((name, None), (lon, lat))

    out, missing = [], []
    for c in seed:
        key = c.get("locality", c["name"]).strip().lower()
        pc = str(c["postcode"]) if c.get("postcode") else None
        hit = index.get((key, pc)) or index.get((key, None))
        if not hit:
            missing.append(f"{c['name']}（查 {key!r}"
                           + (f" 郵區 {pc}" if pc else "") + "）")
            continue
        lon, lat = hit
        out.append({"name": c["name"], "lon": round(lon, 4), "lat": round(lat, 4),
                    "tier": c.get("tier", 2), "side": c.get("side", "r")})

    if missing:
        print("\n以下城市在地名資料裡查不到，請修正 seed 的 locality／postcode：")
        for m in missing:
            print("  ✗", m)
        raise SystemExit(f"\n{len(missing)} 筆未解析，已中止（未寫入）")

    save(ROOT / "data" / f"cities-{state}.json",
         {"note": "座標由 fetch/cities.py 從地名資料解析，請改 seed 檔而非本檔。",
          "source": SRC, "state": state, "cities": out})
    print(f"  解析 {len(out)} 個城市 -> data/cities-{state}.json")


if __name__ == "__main__":
    main((sys.argv[1] if len(sys.argv) > 1 else "qld").lower())
