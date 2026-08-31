"""介面文字必須全部住在 data/strings.json 裡。

之前入口頁的字寫死在 portal.html／portal.js，結果那一頁根本沒有英文版，
連切換鈕都沒有。這種漏抽不會拋錯——T() 找不到鍵就回傳鍵名本身，畫面上
直接出現 "p_lede" 這種字串；寫死的中文則是在英文版底下安靜地繼續說中文。
兩種都得靠檢查抓，所以這裡把規則釘死。
"""
import unittest, pathlib, json, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
STRINGS = json.loads((ROOT / "data" / "strings.json").read_text(encoding="utf-8"))["s"]

HTML = ["template.html", "portal.html"]
# foot.js 是兩頁共用的頁尾，也帶介面文字——漏掉它的話，頁尾的字可以
# 寫死中文而不被抓到，而那正是這整組測試要防的事。
JS = ["map.js", "portal.js", "foot.js"]

CJK = re.compile(r"[一-鿿]")


def t_call_keys(src):
    """抓出 T(...) 呼叫裡的鍵。鍵可能夾在三元運算裡（T(n === 1 ? 'a' : 'b')），
    所以是先切出整個呼叫，再撈裡面的字面值，不是直接比對 T('x'。"""
    keys = set()
    for call in re.findall(r"\bT\(([^()]*)\)", src):
        keys |= set(re.findall(r"'([a-z0-9_]+)'", call))
    return keys


def strip_comments(src, kind):
    """拿掉註解——註解是寫給維護者看的，本來就該是中文。"""
    if kind == "js":
        src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
        return "\n".join(re.sub(r"//.*$", "", ln) for ln in src.splitlines())
    return re.sub(r"<!--.*?-->", "", src, flags=re.S)


class TestMapTextRelabelled(unittest.TestCase):
    """畫在地圖上的文字，切語言時一定要被重寫。

    這一類 bug 是靜的：字串本身兩種語言都對，但元素的 textContent 在繪製時
    設定過一次就沒人再碰，切成英文之後它繼續說中文。實際發生過——南回歸線的
    標籤在英文版一直是「TROPIC OF CAPRICORN 南回歸線」，而 tropic 這個鍵的
    en 值明明是乾淨的。

    有 data-t 的元素由 applyLang 統一處理，不會有這個問題；會中招的是用
    JS 畫上去的 SVG 文字（城市、南回歸線、飛地標記）。它們現在集中在
    relabelMapText() 裡，applyLang 呼叫它一次。
    """

    def test_applyLang_有呼叫_relabelMapText(self):
        src = (SRC / "map.js").read_text(encoding="utf-8")
        i = src.index("function applyLang()")
        self.assertIn("relabelMapText()", src[i:i + 900],
                      "applyLang 沒有重寫地圖上的文字，切語言會留下上一個語言的字")

    def test_地圖上帶文字的圖層都在_relabelMapText_裡(self):
        """畫在地圖上的文字有三處。漏掉任何一處，那一處切語言就不會更新。"""
        src = (SRC / "map.js").read_text(encoding="utf-8")
        i = src.index("function relabelMapText()")
        body = src[i:src.index("\n}\n", i)]
        for token, what in (("cityNodes", "城市標籤"),
                            ("tlbl", "南回歸線標籤"),
                            ("encNodes", "飛地標記")):
            self.assertIn(token, body, f"relabelMapText() 沒有處理{what}")


class TestKeysExist(unittest.TestCase):

    def test_樣板引用的鍵都存在(self):
        for name in HTML:
            src = (SRC / name).read_text(encoding="utf-8")
            keys = re.findall(r'data-t(?:-ph|-aria|-title)?="([^"]+)"', src)
            self.assertTrue(keys, f"{name} 沒有任何 data-t，是不是又寫死了？")
            for k in keys:
                self.assertTrue(k in STRINGS, f"{name} 用了不存在的鍵 {k}")

    def test_JS引用的鍵都存在(self):
        for name in JS:
            src = (SRC / name).read_text(encoding="utf-8")
            for k in t_call_keys(src):
                self.assertTrue(k in STRINGS, f"{name} 用了不存在的鍵 {k}")

    def test_沒有沒人用的鍵(self):
        """沒人用的鍵多半是改版時忘了刪，或是接錯了名字沒接上。

        鍵可能透過三元運算或變數傳進 T()，正則追不到，所以這裡放寬成
        「原始碼裡出現過這個字面值」——寧可漏抓，也不要誤報逼人加白名單。
        """
        used = set()
        for name in HTML + JS:
            src = (SRC / name).read_text(encoding="utf-8")
            used |= set(re.findall(r'data-t(?:-ph|-aria|-title)?="([^"]+)"', src))
            used |= {k for k in STRINGS if f"\'{k}\'" in src}
        self.assertEqual(set(), set(STRINGS) - used, "strings.json 裡有沒人用的鍵")


class TestTranslations(unittest.TestCase):

    def test_每個鍵都有中英兩種且不為空(self):
        for k, v in STRINGS.items():
            self.assertEqual({"zh", "en"}, set(v), f"{k} 少了語言")
            for L in ("zh", "en"):
                self.assertTrue(v[L].strip(), f"{k}.{L} 是空的")

    def test_英文裡不能夾中文(self):
        for k, v in STRINGS.items():
            # tropic 的中文版刻意雙語（地圖上同時標中英），英文版才必須純英文
            self.assertFalse(CJK.search(v["en"]), f"{k}.en 夾了中文：{v['en']!r}")

    def test_兩種語言的佔位符要一致(self):
        for k, v in STRINGS.items():
            zh = set(re.findall(r"\{(\w+)\}", v["zh"]))
            en = set(re.findall(r"\{(\w+)\}", v["en"]))
            self.assertEqual(zh, en, f"{k} 的佔位符對不上：zh={zh} en={en}")


class TestNoHardcoded(unittest.TestCase):
    """註解以外不准出現中文。唯一例外是語言鈕自己的標籤——它顯示的永遠是
    「另一種」語言，本來就不該跟著介面語言翻。"""

    ALLOWED = {"中文", "切換為中文"}

    def test_樣板裡沒有寫死的中文(self):
        for name in HTML:
            body = strip_comments((SRC / name).read_text(encoding="utf-8"), "html")
            # <title> 是 JS 跑之前的後備，雙語並列是刻意的
            body = re.sub(r"<title>.*?</title>", "", body, flags=re.S)
            hits = [ln for ln in body.splitlines() if CJK.search(ln)]
            self.assertEqual([], hits, f"{name} 有寫死的中文")

    def test_JS裡沒有寫死的中文(self):
        for name in JS:
            body = strip_comments((SRC / name).read_text(encoding="utf-8"), "js")
            for ln in body.splitlines():
                if not CJK.search(ln):
                    continue
                rest = ln
                # 由長到短，否則拿掉「中文」會讓「切換為中文」剩下「切換為」
                for ok in sorted(self.ALLOWED, key=len, reverse=True):
                    rest = rest.replace(ok, "")
                self.assertFalse(CJK.search(rest), f"{name} 有寫死的中文：{ln.strip()!r}")


if __name__ == "__main__":
    unittest.main()
