#!/usr/bin/env python3
"""建入口頁：全澳郵區查詢 + 各州地圖導覽。

入口頁不放郵區多邊形，只放郵區號碼對應的身分與州界輪廓，所以很輕。
各州地圖的網址由 build.site_links() 決定：預設相對路徑（GitHub Pages），
TARGET=artifact 時用 data/artifacts.json 的絕對網址。

用法： python3 build_portal.py
輸出： dist/index.html
"""
import sys, json, pathlib, collections
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib import expand, load, STATES
from build import (LABELS, VISA, AREA_BITS, REBUILD_MASK, DEFAULT_INDUSTRY,
                   work_mask, site_links, CHANNEL)

ROOT = pathlib.Path(__file__).resolve().parent

# 州名在概觀圖上的標註位置（經度, 緯度）。用重心會讓 ACT 疊在 NSW 上、
# VIC 和 NSW 擠在一起，所以手動指定。ACT 太小，不在圖上標，卡片列表有。
LABEL_POS = {
    "qld": (144.3, -22.2), "nsw": (146.3, -32.2), "vic": (144.2, -36.9),
    "sa": (135.0, -29.8), "wa": (120.5, -25.5), "tas": (146.7, -42.1),
    "nt": (133.4, -20.0),
}


FEW = 5   # 一般工地只有這麼少郵區算的話，直接把它們點名出來


def part(name):
    """樣板拆成結構／樣式／程式三個檔，建置時再合成單一自包含 HTML。
    產出完全一樣，拆的是原始碼不是成品。"""
    return (ROOT / "src" / name).read_text(encoding="utf-8")


def tokens_css():
    """共用的設計 token。兩個樣板都注入同一份，避免改配色時漏掉一邊。"""
    return (ROOT / "src" / "tokens.css").read_text(encoding="utf-8")


def area_coverage(pcdata, real):
    """五張地區表各自涵蓋多少個實際存在的郵區，用來說明它們的大小差距。"""
    out = {}
    for area in ("remote", "northern", "regional", "bushfire", "disaster"):
        s = set()
        for st in STATES:
            s |= expand(pcdata["areas"][VISA].get(area, {}).get(st), st)
        out[area] = len(s & real)
    # 觀光餐旅看的是 remote 與 northern 的聯集。兩張表有重疊，不能相加。
    tour = set()
    for area in ("remote", "northern"):
        for st in STATES:
            tour |= expand(pcdata["areas"][VISA].get(area, {}).get(st), st)
    out["_tourism"] = len(tour & real)
    out["_total"] = len(real)
    return out


def summarise(state, s, work_pcs):
    """給沒有地圖的行政區一句準確的說明，取代含糊的「尚無地圖」。"""
    if s["rebuild"] == 0 and s["none"] == 0 and s["work"] > 0:
        return (f"整個州都在 Regional Australia 名單上，"
                f"一般建築工地在哪裡工作都算，所以不需要地圖。共 {s['work']} 個郵區。")
    if s["work"] == 0:
        return ("一般建築工地在這裡都不算——Regional Australia 名單上沒有這個行政區。"
                "但全境都被宣告為災區，災後重建工作在哪裡都算。")
    if s["work"] <= FEW:
        named = "、".join(f"{pc} {name}" for pc, name in work_pcs)
        return (f"一般建築工地只有 {named} 這個郵區算——Regional Australia 名單上沒有"
                f"這個行政區，是它落在鄰州的郵區區間裡。其餘 {s['rebuild'] + s['none']} 個郵區"
                f"全境都被宣告為災區，只有災後重建工作算。")
    return None


def main():
    pcdata = load(ROOT / "data" / "postcodes.json")
    index  = load(ROOT / "data" / "portal-index.json")["postcodes"]
    out    = load(ROOT / "data" / "outline-au.json")["outlines"]
    urls   = {n["label"].lower(): n["url"] for n in site_links() if not n.get("home")}
    inds   = load(ROOT / "data" / "industries.json")["industries"]
    default_mask = work_mask(inds[DEFAULT_INDUSTRY]["areas"][VISA])

    # 每個郵區在五張地區表裡的成員資格（跟州頁同一套位元）
    flags = {}
    for st in STATES:
        for area, bit in AREA_BITS.items():
            for pc in expand(pcdata["areas"][VISA].get(area, {}).get(st), st):
                flags[pc] = flags.get(pc, 0) | bit

    # 郵區索引：號碼 -> [州, 代表地名, 旗標]
    entries, stats = {}, collections.defaultdict(lambda: dict(work=0, rebuild=0, none=0))
    work_pcs = collections.defaultdict(list)     # 一般工地算的郵區，供少數例外時點名
    for pc, (st, name, others) in index.items():
        f = flags.get(int(pc), 0)
        # [州, 代表地名, 旗標, 其餘地名]——最後一個給搜尋用
        entries[pc] = [st, name, f, others]
        stats[st]["work" if f & default_mask else "rebuild" if f & REBUILD_MASK else "none"] += 1
        if f & default_mask:
            work_pcs[st].append((int(pc), name))

    states = []
    for st in ("qld", "nsw", "vic", "sa", "wa", "tas", "nt", "act"):
        s = stats[st]
        total = s["work"] + s["rebuild"] + s["none"]
        states.append({
            "key": st, "label": LABELS.get(st, STATES[st]["name"]), "abbr": st.upper(),
            "name": STATES[st]["name"], "url": urls.get(st),
            "total": total, "label_at": LABEL_POS.get(st),
            # 全境都在 regional 名單上（官網原文就是 All postcodes are eligible）。
            # 這種州不必做地圖——整張圖只會是一片綠。
            "all_work": s["rebuild"] == 0 and s["none"] == 0 and s["work"] > 0,
            "summary": summarise(st, s, sorted(work_pcs[st])),
            **s,
        })

    # 產業對應表直接從 industries.json 生成，頁面不寫死——對應改了頁面會跟著變
    ind = {"industries": inds}
    AREA_LABEL = {"regional": "Regional Australia", "northern": "Northern Australia",
                  "remote": "Remote and Very Remote", "bushfire": "大火宣告區",
                  "disaster": "天災宣告區"}
    industries = []
    for key, v in ind["industries"].items():
        areas = v["areas"][VISA]
        industries.append({"label": v["label"], "en": v["en"], "scope": v.get("scope", ""),
                           "areas": None if areas is None else [AREA_LABEL[a] for a in areas]})

    payload = {
        "industries": industries,
        "industry_masks": [
            {"key": key, "label": v["label"], "scope": v.get("scope", ""),
             "mask": work_mask(v["areas"][VISA])}
            for key, v in inds.items() if v["areas"][VISA]
        ],
        "industry": DEFAULT_INDUSTRY,
        "area_coverage": area_coverage(pcdata, {int(p) for p in index}),
        "meta": {
            "source_url": pcdata["sources"][VISA]["url"],
            "channel": CHANNEL,
            "visa": VISA,
            "stamp": (f"郵區清單 Home Affairs {pcdata['sources'][VISA]['page_last_updated']}"
                      f" · 州界 ABS/公開資料 · 建置 {pcdata['fetched_at'][:10]}"),
            "n_postcodes": len(entries),
            "n_maps": sum(1 for s in states if s["url"]),
        },
        "postcodes": entries,
        "states": states,
        "outlines": out,
    }

    html = (ROOT / "src" / "portal.html").read_text(encoding="utf-8")
    for token, value in (("__TOKENS__", tokens_css()),
                         ("__CSS__", part("portal.css")),
                         ("__JS__", part("portal.js").replace("// @ts-check\n", "", 1)),
                         ("__DATA__", json.dumps(payload, ensure_ascii=False, separators=(",", ":")))):
        if token not in html:
            raise SystemExit(f"樣板裡找不到注入點 {token}")
        html = html.replace(token, value)

    dest = ROOT / "dist" / "index.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")
    have = ", ".join(s["label"] for s in states if s["url"])
    print(f"可查郵區 {len(entries)} 個 · 已有地圖的州：{have}")
    for s in states:
        print(f"  {s['label']:6s} 一般工地 {s['work']:4d} · 只有重建 {s['rebuild']:4d} · 不算 {s['none']:4d}"
              + ("" if s["url"] else "   （尚無地圖）"))
    print(f"-> {dest.relative_to(ROOT)}  ({dest.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
