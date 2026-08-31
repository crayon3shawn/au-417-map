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


class TestCategorise(unittest.TestCase):
    """categorise() 的兩條不變量。

    這兩條破掉的話畫面上不會有任何徵兆——郵區數量對不起來，肉眼看不出來。
    而 categorise() 正是最容易被改壞的地方：只要有人加一個分支
    （例如「同時在工作名單又在災區」要不要另外算一類），互斥性就沒了。

      work + rebuild + none            == total
      fire_only + flood_only + fire_and_flood == rebuild

    第二條說的是「重建是唯一路徑」的那些郵區，一定恰好落在三種災害組合的
    其中一種。fire_all／flood_all 不在這條裡——它們連「本來就算」的一起數，
    刻意跟 rebuild 那一組脫鉤（圖層檢視問的是在不在表上，不是有沒有別條路）。
    """

    W, F, D = 4, build.BIT_FIRE, build.BIT_DISASTER      # 4 = regional

    def run_one(self, flags):
        rings = {str(pc): [] for pc in flags}
        return build.categorise(rings, flags, self.W)

    def assert_invariants(self, c):
        self.assertEqual(c["work"] + c["rebuild"] + c["none"], c["total"],
                         "三類必須互斥且涵蓋全部")
        self.assertEqual(c["fire_only"] + c["flood_only"] + c["fire_and_flood"],
                         c["rebuild"], "災害細分必須剛好切完 rebuild")

    def test_六種組合各一個(self):
        W, F, D = self.W, self.F, self.D
        c = self.run_one({1: W, 2: F, 3: D, 4: F | D, 5: W | F, 6: 0})
        self.assert_invariants(c)
        self.assertEqual(c["total"], 6)
        self.assertEqual(c["work"], 2)          # 1 與 5——在工作名單上就算，災害是次要
        self.assertEqual(c["rebuild"], 3)       # 2、3、4
        self.assertEqual(c["none"], 1)          # 6
        self.assertEqual((c["fire_only"], c["flood_only"], c["fire_and_flood"]), (1, 1, 1))
        # fire_all 連 5 一起數（它同時在工作名單上），所以是 3 不是 2
        self.assertEqual(c["fire_all"], 3)
        self.assertEqual(c["flood_all"], 2)

    def test_全空(self):
        c = self.run_one({})
        self.assert_invariants(c)
        self.assertEqual(c["total"], 0)

    def test_全部都在工作名單上(self):
        c = self.run_one({1: self.W, 2: self.W})
        self.assert_invariants(c)
        self.assertEqual((c["work"], c["rebuild"], c["none"]), (2, 0, 0))

    def test_拿真實資料跑過四個州與所有產業(self):
        """合成資料驗邏輯，真實資料驗它在實際的旗標分布下也成立。"""
        from lib import expand, load
        pc = load(ROOT / "data" / "postcodes.json")["areas"][build.VISA]
        inds = load(ROOT / "data" / "industries.json")["industries"]
        for st in build.STATE_ORDER:
            path = ROOT / "data" / f"poa-{st}.json"
            if not path.exists():
                continue
            rings = load(path)["rings"]
            flags = {}
            for area, bit in build.AREA_BITS.items():
                raw = pc.get(area, {}).get(st)
                if not raw:
                    continue
                for n in expand(raw, st):
                    flags[n] = flags.get(n, 0) | bit
            for key, v in inds.items():
                areas = v["areas"][build.VISA]
                if not areas:
                    continue
                with self.subTest(state=st, industry=key):
                    c = build.categorise(rings, flags, build.work_mask(areas))
                    self.assert_invariants(c)
                    self.assertEqual(c["total"], len(rings))


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


class TestSearchIndex(unittest.TestCase):
    """跨州查詢用的共用地名索引。

    這個東西壞掉不會有任何徵兆：fetch 失敗被 catch 吃掉，頁面照樣運作，
    只是打別州的地名永遠「找不到」。所以要從兩頭釘住——檔案有產出，
    而且部署流程真的會把它帶上去。
    """

    def test_旗標表涵蓋全澳且分好州(self):
        nat = build.national_flags()
        self.assertGreater(sum(len(v) for v in nat.values()), 2000)
        self.assertIn("nsw", nat)
        self.assertIn("qld", nat)

    def test_地名表每筆都有內容(self):
        names = build.national_names()
        self.assertGreater(len(names), 2000)
        for pc in ("2000", "4870", "3000"):
            self.assertTrue(names.get(pc, "").strip(), f"{pc} 沒有地名")
        self.assertIn("Byron Bay", names["2481"])

    def test_部署流程有帶上共用索引(self):
        wf = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
        self.assertIn("dist/*.json", wf,
                      "workflow 只複製 *.html 的話，跨州查詢會靜靜地失效")
