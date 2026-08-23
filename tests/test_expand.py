"""lib.expand() 的測試。

這是整份專案風險最高的一段：解析錯一個範圍，合格郵區就默默變了，
而且畫面上不會有任何徵兆。所以這裡釘得比較細。
"""
import unittest, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import expand, STATES


class TestExpand(unittest.TestCase):

    def test_單一郵區(self):
        self.assertEqual(expand("4870", "qld"), {4870})

    def test_範圍是包含兩端的(self):
        self.assertEqual(expand("4417 to 4420", "qld"), {4417, 4418, 4419, 4420})

    def test_逗號與分號都當分隔(self):
        # 417 頁面用逗號，462 頁面用分號，兩邊必須解析成同一組
        a = expand("4124 to 4125, 4133, 4211", "qld")
        b = expand("4124 to 4125; 4133; 4211", "qld")
        self.assertEqual(a, b)
        self.assertEqual(a, {4124, 4125, 4133, 4211})

    def test_多餘空白與空片段(self):
        self.assertEqual(expand("  4870 ,, 4871 ,  ", "qld"), {4870, 4871})

    def test_全州通吃的寫法(self):
        for phrase in ("All postcodes in South Australia are eligible",
                       "All areas.",
                       "all postcodes in Northern Territory are eligible"):
            got = expand(phrase, "tas")
            self.assertEqual(got, set(range(7000, 8000)), phrase)

    def test_三位數郵區(self):
        # NT 是 0800-0999，官網寫成三位數
        self.assertEqual(expand("822, 847", "nt"), {822, 847})

    def test_範圍顛倒要拋錯(self):
        with self.assertRaises(ValueError):
            expand("4499 to 4307", "qld")

    def test_無法解析要拋錯而不是安靜略過(self):
        for bad in ("4870 and 4871", "4870-4875", "Queensland", "48700", "4870 to"):
            with self.assertRaises(ValueError, msg=bad):
                expand(bad, "qld")

    def test_None與空字串(self):
        self.assertEqual(expand(None, "qld"), set())
        self.assertEqual(expand("", "qld"), set())

    def test_各州的全州展開落在自己的號碼區間內(self):
        for key, st in STATES.items():
            got = expand("All postcodes are eligible", key)
            self.assertTrue(got, key)
            for pc in got:
                self.assertTrue(any(lo <= pc <= hi for lo, hi in st["ranges"]),
                                f"{key} 展開出區間外的 {pc}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
