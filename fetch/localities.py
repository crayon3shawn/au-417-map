#!/usr/bin/env python3
"""抓郵區的地區名與中心座標。

來源：matthewproctor/australianpostcodes（Australia Post 郵區資料的公開整理版）。
原始 CSV 約 8 MB，這支腳本只留下需要的欄位，蒸餾成幾十 KB 進版控。

用法： python3 fetch/localities.py qld
輸出： data/localities-<state>.json
"""
import sys, csv, io, statistics, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch_cached, is_deliverable, save, STATES

SRC = ("https://raw.githubusercontent.com/matthewproctor/australianpostcodes"
       "/master/australian_postcodes.csv")
ROOT = pathlib.Path(__file__).resolve().parents[1]

# 州境外的座標視為髒資料濾掉
BOUNDS = {"qld": (-30, -9, 137, 155), "nsw": (-38, -28, 140, 154), "vic": (-40, -33, 140, 150),
          "sa": (-39, -25, 128, 142), "wa": (-36, -13, 112, 130), "tas": (-44, -39, 143, 149),
          "nt": (-27, -10, 128, 139), "act": (-36, -35, 148, 150)}


def main(state):
    if state not in STATES:
        raise SystemExit(f"未知的州別 {state}；可用：{', '.join(STATES)}")
    print(f"下載 {SRC}")
    rows = list(csv.DictReader(io.StringIO(fetch_cached(SRC, "australian_postcodes.csv"))))
    print(f"  {len(rows)} 列")

    lo_lat, hi_lat, lo_lon, hi_lon = BOUNDS[state]
    acc, skipped = {}, 0
    for r in rows:
        if (r.get("state") or "").strip().lower() != state:
            continue
        if not is_deliverable(r, state):
            skipped += 1
            continue
        try:
            pc, lat, lon = int(r["postcode"]), float(r["lat"]), float(r["long"])
        except (ValueError, TypeError, KeyError):
            skipped += 1
            continue
        if lat == 0 or lon == 0 or not (lo_lat < lat < hi_lat and lo_lon < lon < hi_lon):
            skipped += 1
            continue
        a = acc.setdefault(pc, {"lat": [], "lon": [], "loc": set()})
        a["lat"].append(lat); a["lon"].append(lon)
        name = (r.get("locality") or "").strip().title()
        if name:
            a["loc"].add(name)

    out = {}
    for pc, a in sorted(acc.items()):
        names = sorted(a["loc"])
        out[str(pc)] = {
            "lon": round(statistics.median(a["lon"]), 4),
            "lat": round(statistics.median(a["lat"]), 4),
            # 存全部地名，不是只存前幾個——搜尋要用。
            # 多數人知道自己在哪個鎮，不知道郵區號碼；只存前 6 個的話，
            # 搜「Manunda」這種郊區會落空（4870 有 32 個地區）。
            "names": names,
        }
    if len(out) < 100:
        raise SystemExit(f"只取得 {len(out)} 個郵區，明顯過少——來源格式可能變了，已中止")

    path = ROOT / "data" / f"localities-{state}.json"
    save(path, {"source": SRC, "state": state, "postcodes": out})
    print(f"  {len(out)} 個郵區（略過 {skipped} 列）-> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main((sys.argv[1] if len(sys.argv) > 1 else "qld").lower())
