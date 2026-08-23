"""共用工具：州別定義、郵區範圍字串的解析與展開、HTTP 抓取。

郵區清單在 data/postcodes.json 裡是以官網原文的「範圍字串」保存
（例如 "4307 to 4499, 4510"），不是展開後的號碼陣列。這樣做的原因：
git diff 讀得懂，官網改一個號碼就看得出來改了哪裡。展開在 build 時進行。
"""
import json, re, urllib.request, urllib.error

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")

# abs_like: ABS POA 圖層查詢用的郵區開頭；ranges: 該州的郵區號碼區間
STATES = {
    "qld": {"name": "Queensland",        "abs_like": ["4"],      "ranges": [(4000, 4999)]},
    "nsw": {"name": "New South Wales",   "abs_like": ["1", "2"], "ranges": [(1000, 2599), (2619, 2899), (2921, 2999)]},
    "vic": {"name": "Victoria",          "abs_like": ["3", "8"], "ranges": [(3000, 3999), (8000, 8999)]},
    "sa":  {"name": "South Australia",   "abs_like": ["5"],      "ranges": [(5000, 5999)]},
    "wa":  {"name": "Western Australia", "abs_like": ["6"],      "ranges": [(6000, 6999)]},
    "tas": {"name": "Tasmania",          "abs_like": ["7"],      "ranges": [(7000, 7999)]},
    "nt":  {"name": "Northern Territory","abs_like": ["0"],      "ranges": [(800, 999)]},
    "act": {"name": "Australian Capital Territory", "abs_like": ["2"], "ranges": [(2600, 2618), (2900, 2920)]},
}

# 官網表格裡州別欄位的各種寫法
STATE_ALIASES = {
    "queensland": "qld", "qld": "qld",
    "new south wales": "nsw", "nsw": "nsw",
    "victoria": "vic", "vic": "vic",
    "south australia": "sa", "sa": "sa",
    "western australia": "wa", "wa": "wa",
    "tasmania": "tas", "tas": "tas",
    "northern territory": "nt", "nt": "nt",
    "australian capital territory (act)": "act",
    "australian capital territory": "act", "act": "act",
    "norfolk island": "norfolk",
}

# 五張「指定地區」表在官網上的章節標題
AREA_SECTIONS = {
    "remote":   "Remote and Very Remote Australia",
    "northern": "Northern Australia",
    "regional": "Regional Australia",
    "bushfire": "Bushfire declared areas",
    "disaster": "Natural disaster declared areas",
}


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def expand(raw, state_key):
    """把官網的範圍字串展開成郵區號碼集合。

    處理三種寫法：
      "4307 to 4499, 4510"            -> 範圍與單號
      "All postcodes in X are eligible" -> 該州全部號碼
      "All areas."                     -> 同上
    """
    if raw is None:
        return set()
    text = raw.strip()
    if re.search(r"\ball\b.*\b(postcodes|areas)\b", text, re.I):
        out = set()
        for lo, hi in STATES[state_key]["ranges"]:
            out.update(range(lo, hi + 1))
        return out
    out = set()
    for chunk in re.split(r"[,;]", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.fullmatch(r"(\d{3,4})\s*to\s*(\d{3,4})", chunk, re.I)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if a > b:
                raise ValueError(f"範圍顛倒: {chunk!r}")
            out.update(range(a, b + 1))
            continue
        m = re.fullmatch(r"\d{3,4}", chunk)
        if m:
            out.add(int(chunk))
            continue
        raise ValueError(f"無法解析的郵區片段: {chunk!r}（來自 {text[:60]!r}）")
    return out


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(path, obj, compact=False):
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
