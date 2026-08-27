"""diff_postcodes.py 的測試。

這支的職責是「別吵醒不該吵醒的人」：每週跑一次，官網沒改就必須完全安靜。
誤報一次會讓人開始忽略通知，之後真的改了也不會有人看。
"""
import unittest, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from diff_postcodes import summarise, collapse


def doc(page_date="2026-08-18", qld_regional="4307 to 4499", nt_fire="0870, 0872 to 0875"):
    return {
        "fetched_at": "2026-08-23T11:24:38+00:00",
        "sources": {"417": {"page_last_updated": page_date}},
        "areas": {"417": {"regional": {"qld": qld_regional},
                          "bushfire": {"nt": nt_fire}}},
    }


class TestSummarise(unittest.TestCase):

    def test_完全相同就沒有變動(self):
        changed, lines = summarise(doc(), doc())
        self.assertFalse(changed)
        self.assertEqual(lines, [])

    def test_只有fetched_at不同不算變動(self):
        a, b = doc(), doc()
        b["fetched_at"] = "2026-09-01T00:00:00+00:00"
        changed, _ = summarise(a, b)
        self.assertFalse(changed, "fetched_at 每次抓都會變，不能當成官網改了")

    def test_只改寫法但郵區相同不算變動(self):
        # 官網把 "4307 to 4309" 改寫成逐個列出，合格郵區其實一模一樣
        changed, _ = summarise(doc(qld_regional="4307 to 4309"),
                               doc(qld_regional="4307, 4308, 4309"))
        self.assertFalse(changed)

    def test_分號改逗號不算變動(self):
        changed, _ = summarise(doc(qld_regional="4307 to 4309, 4311"),
                               doc(qld_regional="4307 to 4309; 4311"))
        self.assertFalse(changed)

    def test_新增郵區抓得到(self):
        changed, lines = summarise(doc(), doc(nt_fire="0870, 0872 to 0875, 0880"))
        self.assertTrue(changed)
        self.assertTrue(any("＋新增 1" in l and "0880" in l for l in lines), lines)

    def test_移除郵區抓得到(self):
        changed, lines = summarise(doc(qld_regional="4307 to 4499"),
                                   doc(qld_regional="4307 to 4450"))
        self.assertTrue(changed)
        self.assertTrue(any("－移除 49" in l for l in lines), lines)

    def test_頁面日期變動要報出來(self):
        changed, lines = summarise(doc(), doc(page_date="2026-09-01"))
        self.assertTrue(changed)
        self.assertTrue(any("頁面更新日期" in l for l in lines), lines)

    def test_整州消失要標警告(self):
        after = doc()
        del after["areas"]["417"]["regional"]["qld"]
        changed, lines = summarise(doc(), after)
        self.assertTrue(changed)
        self.assertTrue(any("整列拿掉" in l for l in lines), lines)

    def test_解析失敗不會炸掉整支(self):
        changed, lines = summarise(doc(), doc(qld_regional="4307 to 慘"))
        self.assertTrue(changed)
        self.assertTrue(any("解析失敗" in l for l in lines), lines)


class TestCollapse(unittest.TestCase):

    def test_連號收成範圍(self):
        self.assertEqual(collapse({4307, 4308, 4309}), "4307 to 4309")

    def test_單號與兩連號(self):
        self.assertEqual(collapse({4307}), "4307")
        self.assertEqual(collapse({4307, 4308}), "4307-4308")

    def test_北領地補足四位數(self):
        # 0872 印成 872 會讓人以為是別的號碼
        self.assertEqual(collapse({872}), "0872")

    def test_太長會截斷(self):
        out = collapse(set(range(4000, 4900, 2)))   # 450 個不連續號碼
        self.assertIn("中間省略", out)


if __name__ == "__main__":
    unittest.main()
