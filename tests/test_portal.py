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
