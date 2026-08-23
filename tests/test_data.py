"""凍結資料的結構性檢查。

刻意不釘死郵區數量——官網本來就會改，釘數字只會在正常更新時假警報。
這裡釘的是結構完整性，以及幾個短期內不該變的既知事實。
"""
import unittest, sys, pathlib, json
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib import expand, load, AREA_SECTIONS, STATES

DATA = load(ROOT / "data" / "postcodes.json")


class TestPostcodeData(unittest.TestCase):

    def test_兩種簽證都在(self):
        self.assertEqual(set(DATA["areas"]), {"417", "462"})

    def test_五張指定地區表都在(self):
        for visa in ("417", "462"):
            self.assertEqual(set(DATA["areas"][visa]), set(AREA_SECTIONS), visa)

    def test_每一筆原文都解析得動(self):
        for visa, areas in DATA["areas"].items():
            for area, per_state in areas.items():
                for st, raw in per_state.items():
                    if st not in STATES:
                        continue
                    with self.subTest(visa=visa, area=area, state=st):
                        self.assertTrue(expand(raw, st), "展開後是空的")

    def test_有記錄來源與頁面更新日期(self):
        for visa in ("417", "462"):
            src = DATA["sources"][visa]
            self.assertTrue(src["url"].startswith("https://immi.homeaffairs.gov.au/"))
            self.assertRegex(src["page_last_updated"], r"^\d{4}-\d{2}-\d{2}$")

    def test_417與462的地區表目前完全相同(self):
        # 這是頁面上那句「兩種簽證都適用」的依據。哪天官網讓它們分家，
        # 這個測試會先失敗，提醒我們去改頁面文案而不是繼續講錯話。
        for area in AREA_SECTIONS:
            for st in STATES:
                a = expand(DATA["areas"]["417"][area].get(st), st)
                b = expand(DATA["areas"]["462"][area].get(st), st)
                self.assertEqual(a, b, f"{area}/{st} 已經不同了，請更新頁面說明")


class TestKnownFacts(unittest.TestCase):
    """幾個拿來當定錨的既知事實。變了就代表官網真的改了政策。"""

    def area(self, area, state):
        return expand(DATA["areas"]["417"][area].get(state), state)

    def test_凱恩斯是regional(self):
        self.assertIn(4870, self.area("regional", "qld"))

    def test_布里斯本市區不是regional但是天災宣告區(self):
        self.assertNotIn(4000, self.area("regional", "qld"))
        self.assertIn(4000, self.area("disaster", "qld"))

    def test_雪梨不在任何一張表上(self):
        for a in ("regional", "bushfire", "disaster"):
            self.assertNotIn(2000, self.area(a, "nsw"), a)

    def test_紐卡索與臥龍崗不是regional(self):
        reg = self.area("regional", "nsw")
        self.assertNotIn(2300, reg)   # Newcastle
        self.assertNotIn(2500, reg)   # Wollongong

    def test_北領地全境都是regional(self):
        self.assertIn(822, self.area("regional", "nt"))


class TestBuiltPages(unittest.TestCase):

    def pages(self):
        return sorted((ROOT / "dist").glob("*.html"))

    def test_產出頁面沒有殘留注入點(self):
        for p in self.pages():
            html = p.read_text(encoding="utf-8")
            for token in ("__DATA__", "__TITLE__"):
                self.assertNotIn(token, html, f"{p.name} 有未替換的 {token}")

    def test_產出頁面有viewport與charset(self):
        for p in self.pages():
            html = p.read_text(encoding="utf-8")[:2000]
            self.assertIn('name="viewport"', html, p.name)
            self.assertIn('charset="utf-8"', html, p.name)

    def test_產出頁面沒有別州的殘留字串(self):
        other = {"qld": "新南威爾斯", "nsw": "昆士蘭"}
        for p in self.pages():
            wrong = other.get(p.stem)
            if wrong:
                self.assertNotIn(wrong, p.read_text(encoding="utf-8"),
                                 f"{p.name} 出現了 {wrong}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
