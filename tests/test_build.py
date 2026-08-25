"""build.py 裡幾個會影響資料正確性的判斷。"""
import unittest, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build


class TestNonGeographic(unittest.TestCase):
    """郵件處理中心不是真實地區，地名資料給的座標也不可靠，必須排除。"""

    def test_純郵件中心要被判為非地理(self):
        for names in (["New England Mc"],
                      ["Kempsey Msc", "Mid North Coast Mc", "Mid North Coast Msc"],
                      ["Australian Defence Forces", "Forces"],
                      ["International Mc", "Sydney Gateway Facility"]):
            self.assertTrue(build.is_non_geographic(names), names)

    def test_真實地名不能被誤殺(self):
        for names in (["Cairns City", "Aeroglen"],
                      ["Amosfield", "Ruby Creek", "Undercliffe"],
                      ["University Of New England"],
                      ["Mcdowall"],            # 開頭是 Mc，不是結尾
                      ["Mackay"],
                      ["Bimberi", "Brindabella"]):
            self.assertFalse(build.is_non_geographic(names), names)

    def test_只要有一個真實地名就保留(self):
        self.assertFalse(build.is_non_geographic(["Armidale", "New England Mc"]))

    def test_空清單不算非地理(self):
        self.assertFalse(build.is_non_geographic([]))


class TestPath(unittest.TestCase):

    def test_環會閉合成Z(self):
        d = build.to_path([[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0], [1.0, 2.0]]])
        self.assertTrue(d.startswith("M") and d.endswith("Z"))

    def test_降精度後重合的點會被去掉(self):
        ring = [[1.00001, 2.0], [1.00002, 2.0], [3.0, 4.0], [5.0, 6.0], [1.00001, 2.0]]
        d = build.to_path([ring])
        self.assertEqual(d.count("L"), 2)   # 起點 + 兩個 L，重合點已合併

    def test_點數不足的環會被丟掉(self):
        self.assertEqual(build.to_path([[[1.0, 2.0], [1.0, 2.0]]]), "")

    def test_多環會產生多段子路徑(self):
        rings = [[[0, 0], [1, 0], [1, 1], [0, 0]], [[5, 5], [6, 5], [6, 6], [5, 5]]]
        self.assertEqual(build.to_path(rings).count("M"), 2)


class TestBbox(unittest.TestCase):

    def test_取所有環的極值(self):
        self.assertEqual(build.bbox([[[1, 2], [3, 4]], [[-1, 9], [0, 0]]]), [-1, 0, 3, 9])


if __name__ == "__main__":
    unittest.main(verbosity=2)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestRobotsMeta(unittest.TestCase):
    """開發版現在只在本機建，不上 Pages，但這行 meta 還是留著當保險。

    真要哪天把開發版放上去，擋索引就只剩它——robots.txt 在專案站台的子路徑
    下讀不到。掉了不會有任何錯誤，只會安靜地被 Google 收錄，所以釘住。
    """

    def _with_channel(self, channel):
        old = build.CHANNEL
        build.CHANNEL = channel
        try:
            return build.robots_meta()
        finally:
            build.CHANNEL = old

    def test_開發版有noindex(self):
        self.assertIn("noindex", self._with_channel("dev"))

    def test_穩定版沒有(self):
        self.assertEqual("", self._with_channel("stable"))

    def test_必須是寫死在html不是靠JS插入(self):
        for src in ("src/map.js", "src/portal.js"):
            self.assertNotIn("noindex", (ROOT / src).read_text(encoding="utf-8"), src)
        for tpl in ("src/template.html", "src/portal.html"):
            self.assertIn("__ROBOTS__", (ROOT / tpl).read_text(encoding="utf-8"), tpl)
