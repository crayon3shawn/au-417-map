"""設計 token 的單一來源。

配色定義如果在兩個樣板裡各存一份，改配色時漏掉一邊不會報錯、測試也抓不到，
只會變成「入口頁舊配色、點進地圖新配色」。這裡就是那個「抓得到」的機制。
"""
import unittest, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKENS = ROOT / "src" / "tokens.css"
TEMPLATES = [ROOT / "src" / "template.html", ROOT / "src" / "portal.html"]
PAGES = sorted((ROOT / "dist").glob("*.html"))

THEME_BLOCKS = [
    (r"^:root\{(.*?)^\}", "light"),
    (r'@media \(prefers-color-scheme:dark\)\{ :root:not\(\[data-theme="light"\]\)\{(.*?)^\}\}', "auto-dark"),
    (r'^:root\[data-theme="dark"\]\{(.*?)^\}', "explicit-dark"),
]


def decls(text):
    return dict(re.findall(r"(--[a-z0-9-]+):\s*([^;]+);", text))


class TestTokenSource(unittest.TestCase):

    def test_共用檔存在且三個主題區塊都在(self):
        css = TOKENS.read_text(encoding="utf-8")
        for pattern, name in THEME_BLOCKS:
            with self.subTest(block=name):
                # 必須自己指定 re.S|re.M，assertRegex 不會套用
                self.assertIsNotNone(re.search(pattern, css, re.S | re.M),
                                     f"tokens.css 缺少 {name} 區塊")

    def test_三個主題區塊的token名稱要一致(self):
        # 少一個就代表某個主題下那個顏色沒有定義，會沿用上一個主題的值
        css = TOKENS.read_text(encoding="utf-8")
        sets = []
        for pattern, name in THEME_BLOCKS:
            body = re.search(pattern, css, re.S | re.M).group(1)
            sets.append((name, set(decls(body))))
        base_name, base = sets[0]
        for name, s in sets[1:]:
            with self.subTest(block=name):
                self.assertEqual(s, base, f"{name} 與 {base_name} 的 token 名稱不一致")

    def test_樣板不可以自己宣告token(self):
        for p in TEMPLATES:
            with self.subTest(template=p.name):
                css = re.search(r"<style>(.*?)</style>", p.read_text(encoding="utf-8"), re.S).group(1)
                self.assertNotIn(":root{", css, "樣板裡不該再宣告一次 token，請改 src/tokens.css")
                self.assertIn("__TOKENS__", css, "樣板缺少 __TOKENS__ 注入點")


class TestBuiltPages(unittest.TestCase):

    def light_tokens(self, page):
        body = re.search(r"^:root\{(.*?)^\}", page.read_text(encoding="utf-8"), re.S | re.M)
        return decls(body.group(1)) if body else {}

    def test_每個產出頁面都只有一組token定義(self):
        for p in PAGES:
            with self.subTest(page=p.name):
                n = len(re.findall(r"^:root\{", p.read_text(encoding="utf-8"), re.M))
                self.assertEqual(n, 1, "重複注入或樣板殘留了自己的宣告")

    def test_所有產出頁面的配色完全一致(self):
        if len(PAGES) < 2:
            self.skipTest("產出頁面不足兩個")
        first, *rest = PAGES
        base = self.light_tokens(first)
        self.assertTrue(base, "讀不到 token")
        for p in rest:
            with self.subTest(page=p.name):
                self.assertEqual(self.light_tokens(p), base,
                                 f"{p.name} 的配色跟 {first.name} 不同")

    def test_頁面用到的token都有定義(self):
        # 有些 token 是元素層級的區域變數（style="--sw:…"），不在 :root 裡，
        # 所以要看整份文件有沒有定義過，不是只看主題區塊。
        for p in PAGES:
            text = p.read_text(encoding="utf-8")
            declared = set(re.findall(r"(--[a-z0-9-]+)\s*:", text))
            # 也有些區域變數是 JS 在執行時設的（style.setProperty）
            declared |= set(re.findall(r"setProperty\(\s*['\"](--[a-z0-9-]+)", text))
            used = set(re.findall(r"var\((--[a-z0-9-]+)\)", text))
            with self.subTest(page=p.name):
                self.assertFalse(used - declared, f"用了但沒定義：{sorted(used - declared)}")

    def test_主題token在三個區塊都齊全(self):
        # 頁面實際用到的全域 token，三個主題下都必須有值
        for p in PAGES:
            text = p.read_text(encoding="utf-8")
            root = set(self.light_tokens(p))
            for pattern, name in THEME_BLOCKS[1:]:
                m = re.search(pattern, text, re.S | re.M)
                with self.subTest(page=p.name, block=name):
                    self.assertIsNotNone(m, f"{p.name} 缺少 {name} 區塊")
                    self.assertEqual(set(decls(m.group(1))), root)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestSharedComponents(unittest.TestCase):
    """外殼與元件的 CSS 只能有一份。

    這條規則是被咬過才立的：兩個頁面原本各自維護一份 CSS，27 個同名選擇器裡
    有 13 個內容已經漂走（內距 22 vs 26、圓角 3 vs 4、卡片背景色不同），而且
    有三個是同名不同物（.card／.verdict／.bar 在兩頁指不同元件）。漂走不會有
    任何錯誤訊息，只會變成「兩頁長得不一樣」，要有人看到才會發現。
    """

    @staticmethod
    def selectors(name):
        """只看最外層的選擇器。@media 裡面的是「這個尺寸下的覆寫」，兩邊各自
        有一份是合理的——州頁的標頭在手機上會黏頂並收合，入口頁沒有那個行為。"""
        import re
        t = (ROOT / "src" / name).read_text(encoding="utf-8")
        t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
        t = re.sub(r"@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}", "", t, flags=re.S)
        return {re.sub(r"\s+", "", m.group(1))
                for m in re.finditer(r"([^{}]+)\{", t)
                if not m.group(1).strip().startswith("@")}

    def test_共用檔存在(self):
        self.assertTrue((ROOT / "src" / "base.css").exists())

    def test_兩個頁面的CSS不能有同名選擇器(self):
        a, b = self.selectors("map.css"), self.selectors("portal.css")
        self.assertEqual(set(), a & b,
                         "同名選擇器要嘛抽到 base.css，要嘛其中一邊改名")

    def test_共用檔的選擇器不能在頁面檔重複宣告(self):
        base = self.selectors("base.css")
        for name in ("map.css", "portal.css"):
            dup = base & self.selectors(name)
            self.assertEqual(set(), dup, f"{name} 重複宣告了 base.css 已有的 {dup}")


class TestNoDeadCSS(unittest.TestCase):
    """CSS 裡不該有沒人用的 class。

    改版面時最容易留下這種東西：把一組併排的控制項改成堆疊之後，原本那組
    規則就沒人用了，但不會有任何錯誤訊息。實際上一次改版就留下 14 條。
    """

    def test_沒有沒人用的class(self):
        import re
        # 樣板、JS、以及 strings.json——介面字串裡也會帶 class（例如 .mono）
        corpus = "".join(
            (ROOT / f).read_text(encoding="utf-8")
            for f in ("src/template.html", "src/portal.html",
                      "src/map.js", "src/portal.js", "data/strings.json"))
        dead = set()
        for name in ("base.css", "map.css", "portal.css"):
            t = (ROOT / "src" / name).read_text(encoding="utf-8")
            t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
            for sel in re.findall(r"([^{}]+)\{", t):
                if sel.strip().startswith("@"):
                    continue
                for cls in re.findall(r"\.([a-z][a-z0-9-]*)", sel):
                    if cls not in corpus:
                        dead.add(f"{name}: .{cls}")
        self.assertEqual(set(), dead, "CSS 有沒人用的 class")
