"""入口頁的郵區索引：擋住資料集裡幾個已知陷阱。"""
import unittest, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from lib import load, STATES, is_deliverable

IDX_PATH = ROOT / "data" / "portal-index.json"


@unittest.skipUnless(IDX_PATH.exists(), "尚未產生 portal-index.json")
class TestPortalIndex(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.idx = load(IDX_PATH)["postcodes"]

    def test_每個郵區都落在所屬州的號碼區間內(self):
        # 資料集裡有 9999 NORTH POLE 被標成 VIC，不能讓它進索引
        for pc, (st, *_rest) in self.idx.items():
            with self.subTest(pc=pc, state=st):
                self.assertTrue(any(lo <= int(pc) <= hi for lo, hi in STATES[st]["ranges"]))

    def test_沒有北極(self):
        self.assertNotIn("9999", self.idx)

    def test_達爾文在裡面(self):
        # 0800 DARWIN 的 type 欄位是空的，嚴格比對 "Delivery Area" 會誤殺
        self.assertIn("800", self.idx)
        self.assertEqual(self.idx["800"][0], "nt")

    def test_雪梨信箱郵區不在裡面(self):
        # NSW 1000-1999 全是 LVR 企業信箱
        for pc in ("1001", "1235", "1999"):
            self.assertNotIn(pc, self.idx)

    def test_幾個定錨郵區(self):
        for pc, st in (("4870", "qld"), ("2000", "nsw"), ("3000", "vic"),
                       ("5000", "sa"), ("6000", "wa"), ("7000", "tas")):
            self.assertIn(pc, self.idx, pc)
            self.assertEqual(self.idx[pc][0], st, pc)

    def test_涵蓋量合理(self):
        self.assertGreater(len(self.idx), 2000)


class TestMappedVsUrl(unittest.TestCase):
    """「這個州有沒有地圖」不能用「這次建置有沒有它的網址」來判斷。

    入口頁上「還沒做地圖」「尚無地圖」是在陳述專案的事實。拿 url 判斷的話，
    局部的 Artifact 預覽（只發了部分州頁）會對 NSW 講出那句話——而 NSW
    明明有地圖。使用者查 2020 Mascot 時就撞到過一次。
    """

    def test_四個做了地圖的州都標成mapped(self):
        from build import STATE_ORDER
        self.assertEqual(set(STATE_ORDER), {"qld", "nsw", "vic", "wa"})

    def test_portal_js_用mapped而不是url宣稱有沒有地圖(self):
        js = (ROOT / "src" / "portal.js").read_text(encoding="utf-8")
        # 查詢結果那句
        self.assertIn("s.mapped ? ''", js, "查詢結果的沒地圖訊息應該看 mapped")
        self.assertIn("p_nomap_line", js)
        # 入口地圖的虛線邊框
        self.assertIn("s.mapped ? '' : ' nomap'", js, "州塊的 nomap 樣式應該看 mapped")
        # 不該再有用 url 決定 nomap 樣式的寫法
        self.assertNotIn("s.url ? '' : ' nomap'", js)

    def test_建置有送出mapped欄位(self):
        import build_portal
        src = (ROOT / "build_portal.py").read_text(encoding="utf-8")
        self.assertIn('"mapped": st in STATE_ORDER', src)


class TestDeliverable(unittest.TestCase):

    def test_排除信箱型別(self):
        for bad in ("LVR", "Post Office Boxes"):
            self.assertFalse(is_deliverable({"postcode": "2000", "type": bad}, "nsw"), bad)

    def test_空白型別視為可投遞(self):
        self.assertTrue(is_deliverable({"postcode": "0800", "type": ""}, "nt"))
        self.assertTrue(is_deliverable({"postcode": "0800"}, "nt"))

    def test_號碼不在該州區間就排除(self):
        self.assertFalse(is_deliverable({"postcode": "9999", "type": "Delivery Area"}, "vic"))
        self.assertTrue(is_deliverable({"postcode": "3000", "type": "Delivery Area"}, "vic"))

    def test_壞掉的號碼不會拋錯(self):
        self.assertFalse(is_deliverable({"postcode": "abc"}, "vic"))
        self.assertFalse(is_deliverable({}, "vic"))


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestMainName(unittest.TestCase):
    """代表地名要是使用者認得出來的那個鎮。

    答案面板上郵遞區號底下印的就是它。原本取最短的地名，在有主聚落的郵區
    沒問題（Cairns 而不是 Cairns North），在沒有主聚落的郵區就變成隨機挑一個
    小村：2480 是 Lismore，74 個地名裡最短的是 Jiggi。

    這幾筆是規則的兩個訊號各自的代表案例，以及兩個「不可以改壞」的反例。
    """

    def setUp(self):
        sys.path.insert(0, str(ROOT / "fetch"))
        import importlib.util
        spec = importlib.util.spec_from_file_location("fp", ROOT / "fetch" / "portal.py")
        self.fp = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.fp)

    def test_包含關係的樞紐(self):
        # Lismore 被四個衍生地名包住
        real = sorted(["Jiggi", "Lismore", "East Lismore", "North Lismore",
                       "South Lismore", "Lismore Heights", "Back Creek"])
        self.assertEqual("Lismore", self.fp.main_name(2480, real, None))

    def test_投遞中心_在包含關係命不中時接手(self):
        # Byron Bay 沒有任何衍生地名，但每一列的投遞中心都是 BYRON BAY DC
        real = sorted(["Broken Head", "Byron Bay", "Ewingsdale", "Myocum", "Talofa"])
        self.assertEqual("Byron Bay",
                         self.fp.main_name(2481, real, ["BYRON BAY DC"] * 5))

    def test_投遞中心的方位變體不採用(self):
        # CLOVELLY WEST DC 不可以把 Clovelly 換成 Clovelly West
        real = sorted(["Clovelly", "Clovelly West", "Waverley"])
        self.assertEqual("Clovelly",
                         self.fp.main_name(2031, real, ["CLOVELLY WEST DC"] * 3))

    def test_兩個訊號都命不中就退回最短的(self):
        real = sorted(["Bilinga", "Greenmount", "Kirra", "Tugun"])
        self.assertEqual("Kirra", self.fp.main_name(4225, real, None))

    def test_包含關係只有一個不算數(self):
        # Colo / Colo Vale 這種一個就中的太容易誤判，門檻是兩個
        real = sorted(["Colo", "Colo Vale", "Bathurst"])
        self.assertEqual("Colo", self.fp.main_name(9999, real, None))

    def test_產出的索引沒有漏掉地名(self):
        """換代表名不可以動到地名集合——地名是拿來搜尋的，少一個就查不到。"""
        idx = load(IDX_PATH)["postcodes"]
        for pc, v in idx.items():
            with self.subTest(pc=pc):
                self.assertNotIn(v[1], v[2] or [], f"{pc} 的代表名同時也在其餘地名裡")
