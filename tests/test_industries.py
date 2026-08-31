"""產業與地區表的對應。

這張表是人工整理自官網散文，不是官方資料表，所以特別容易在改動時走鐘。
釘住的是 417 與 462 之間幾個真實差異——搞錯的話會給出錯誤的集簽建議。

data/postcodes.json 只收 417 的郵區表了，但這張對應表兩種簽證都留著：
它是人工整理的規則知識，不是抓來的資料，而「462 的漁業只限 northern」
這種事實不會因為我們不抓它就不成立。下面用到郵區表的地方一律用 417 的，
測的是「哪個產業對到哪張表」，不是表本身的內容。
"""
import unittest, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib import expand, load, AREA_SECTIONS, STATES

IND = load(ROOT / "data" / "industries.json")
PC = load(ROOT / "data" / "postcodes.json")


class TestMapping(unittest.TestCase):

    def areas(self, key, visa):
        return IND["industries"][key]["areas"][visa]

    def test_每個產業都有兩種簽證的條目(self):
        for key, ind in IND["industries"].items():
            with self.subTest(industry=key):
                self.assertEqual(set(ind["areas"]), {"417", "462"})
                self.assertTrue(ind.get("label"))

    def test_引用的地區表都真的存在(self):
        for key, ind in IND["industries"].items():
            for visa, areas in ind["areas"].items():
                for a in areas or []:
                    with self.subTest(industry=key, visa=visa, area=a):
                        self.assertIn(a, AREA_SECTIONS)
                        self.assertIn(a, PC["areas"]["417"])

    def test_礦業在462是不適用而不是空清單(self):
        # null 代表 462 根本沒有這個產業；空清單會被誤讀成「哪裡都不算」
        self.assertIsNone(self.areas("mining", "462"))
        self.assertEqual(self.areas("mining", "417"), ["regional"])

    def test_漁業與林業在462只限northern(self):
        for key in ("fishing", "forestry"):
            with self.subTest(industry=key):
                self.assertEqual(self.areas(key, "417"), ["regional"])
                self.assertEqual(self.areas(key, "462"), ["northern"])

    def test_觀光餐旅兩種簽證都只限northern與remote(self):
        for visa in ("417", "462"):
            self.assertEqual(set(self.areas("tourism", visa)), {"remote", "northern"})
            self.assertNotIn("regional", self.areas("tourism", visa))

    def coverage(self, industry, visa):
        """全澳合計的覆蓋範圍。

        必須跨州取聯集，不能逐州比。0872 這種橫跨 NT／WA／SA 的偏遠郵區，
        在 NT 的五張表裡都有，但只出現在 WA 的 northern 而不在 WA 的 regional，
        逐州比會看到假的差異。

        郵區表一律取 417 的（只有這份會抓）。這裡要測的是產業對到哪幾張表，
        表的內容本身由 test_data.py 負責。
        """
        out = set()
        for st in STATES:
            for k in self.areas(industry, visa) or []:
                out |= expand(PC["areas"]["417"][k].get(st), st)
        return out

    def test_建築在兩種簽證下覆蓋範圍相同(self):
        # 462 多寫了 northern，但 northern 是 regional 的子集，全澳合計結果一致
        self.assertEqual(self.coverage("construction", "417"),
                         self.coverage("construction", "462"))

    def test_漁業在462的覆蓋確實比417小很多(self):
        a = self.coverage("fishing", "417")
        b = self.coverage("fishing", "462")
        self.assertTrue(b < a, "462 的漁業應該是 417 的真子集")
        self.assertLess(len(b), len(a) * 0.5, "462 只限 northern，應該小很多")

    def test_跨州郵區0872(self):
        # 記錄這個容易絆倒逐州比對的案例
        nt = expand(PC["areas"]["417"]["regional"].get("nt"), "nt")
        wa_n = expand(PC["areas"]["417"]["northern"].get("wa"), "wa")
        wa_r = expand(PC["areas"]["417"]["regional"].get("wa"), "wa")
        self.assertIn(872, nt)
        self.assertIn(872, wa_n)
        self.assertNotIn(872, wa_r)

    def test_災後重建與產業無關(self):
        rec = IND["recovery"]
        self.assertEqual(rec["bushfire"]["area"], "bushfire")
        self.assertEqual(rec["disaster"]["area"], "disaster")
        self.assertEqual(rec["bushfire"]["from"], "2019-07-31")
        self.assertEqual(rec["disaster"]["from"], "2021-12-31")


class TestBuildUsesMapping(unittest.TestCase):

    def test_預設產業存在於對應表(self):
        import build
        self.assertIn(build.DEFAULT_INDUSTRY, IND["industries"])
        self.assertIsNotNone(IND["industries"][build.DEFAULT_INDUSTRY]["areas"][build.VISA])

    def test_每個產業都能算出工作遮罩(self):
        import build
        for key, v in IND["industries"].items():
            areas = v["areas"][build.VISA]
            if areas is None:
                continue
            with self.subTest(industry=key):
                self.assertGreater(build.work_mask(areas), 0)

    def test_地區位元互不重疊(self):
        import build
        bits = list(build.AREA_BITS.values())
        self.assertEqual(len(set(bits)), len(bits))
        for b in bits:
            self.assertEqual(b & (b - 1), 0, "每個地區必須佔一個獨立的位元")


if __name__ == "__main__":
    unittest.main(verbosity=2)
