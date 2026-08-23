#!/usr/bin/env python3
"""抓州界輪廓，當作郵區面被篩掉時的底圖參考。

用法： python3 fetch/basemap.py qld
輸出： data/outline-<state>.json
"""
import sys, json, math, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import fetch, save, STATES

SRC = "https://raw.githubusercontent.com/rowanhogan/australian-states/master/states.geojson"
EPS = 0.03          # Douglas–Peucker 容差（度）
MIN_RING = 40       # 小於這個點數的環（零碎小島）不畫
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.setrecursionlimit(10000)


def perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    return math.hypot(x - x1, y - y1) if L < 1e-12 else abs(dy * (x - x1) - dx * (y - y1)) / L


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    dmax, idx = -1, 0
    for i in range(1, len(pts) - 1):
        d = perp(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def simplify_ring(ring, eps):
    """閉合環要先拆成兩段再做 RDP——直接做的話首尾同點會讓垂距恆為 0。"""
    r = ring[:-1] if ring[0] == ring[-1] else list(ring)
    if len(r) < 6:
        return list(ring)
    h = len(r) // 2
    out = rdp(r[:h + 1], eps)[:-1] + rdp(r[h:] + [r[0]], eps)[:-1]
    return out + [out[0]]


def main(state):
    if state not in STATES:
        raise SystemExit(f"未知的州別 {state}；可用：{', '.join(STATES)}")
    name = STATES[state]["name"]
    print(f"下載 {SRC}")
    d = json.loads(fetch(SRC, timeout=180))
    f = next((x for x in d["features"] if x["properties"]["STATE_NAME"] == name), None)
    if f is None:
        raise SystemExit(f"GeoJSON 裡找不到 {name}——來源可能改了欄位，已中止")

    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    rings = sorted([p[0] for p in polys], key=len, reverse=True)
    out = [[[round(x, 3), round(y, 3)] for x, y in simplify_ring([(x, y) for x, y in r], EPS)]
           for r in rings if len(r) >= MIN_RING]
    if not out:
        raise SystemExit("簡化後沒有任何環，已中止")

    path = ROOT / "data" / f"outline-{state}.json"
    save(path, {"source": SRC, "state": state, "rdp_eps_deg": EPS, "rings": out}, compact=True)
    print(f"  {len(out)} 個環 / {sum(len(r) for r in out)} 個點 -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main((sys.argv[1] if len(sys.argv) > 1 else "qld").lower())
