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
