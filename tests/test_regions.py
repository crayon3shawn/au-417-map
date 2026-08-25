"""行政區對照表。

這份資料是查詢的入口，不是判定依據——判定永遠來自郵區。但錯了會讓人以為
某個郵區屬於某個區域，進而以為那份工作算集簽，所以還是要釘住。

之所以自己從 ABS 圖層算，是因為兩份現成資料都不可靠：地名 CSV 的 lgaregion
欄位抽驗八個錯兩個，而 CSV 的座標本身也是壞的（郵區 2000 的九個地名有八個
共用一組落在海上的座標）。這裡的測試就是拿那些踩過的坑當樣本。
"""
import unittest, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data" / "regions.json").read_text(encoding="utf-8"))
REGIONS = DATA["regions"]
INDEX = json.loads((ROOT / "data" / "portal-index.json").read_text(encoding="utf-8"))["postcodes"]


def regions_of(pc):
    return {n for n, v in REGIONS.items() if pc in v["postcodes"]}


class TestKnownAnswers(unittest.TestCase):
    """每一筆都是人工可查證的。前兩筆是現成資料弄錯、我們算對的。"""

    CASES = [
        (2250, "Central Coast (NSW)"),   # CSV 的 lgaregion 說是 Hawkesbury
        (4825, "Mount Isa"),             # CSV 的 lgaregion 說是 Carpentaria
        (2000, "Sydney"),                # CSV 座標落在海上，用座標會判到市外
        (4510, "Moreton Bay"),
        (2095, "Northern Beaches"),
        (4870, "Cairns"),
        (3000, "Melbourne"),
        (4217, "Gold Coast"),
    ]

    def test_已知歸屬(self):
        for pc, want in self.CASES:
            self.assertIn(want, regions_of(pc), f"{pc} 應該在 {want}")

    def test_不能有離譜的歸屬(self):
        # CABOOLTURE BC 的座標在 900 公里外的 Charters Towers。用地名座標時
        # 這一筆會讓 Caboolture 被歸到 Charters Towers 底下。
        self.assertNotIn("Charters Towers", regions_of(4510))


class TestShape(unittest.TestCase):

    def test_每個行政區都有州別與郵區(self):
        for name, v in REGIONS.items():
            self.assertTrue(name.strip(), "行政區沒有名字")
            self.assertRegex(v["state"], r"^[a-z]+$", f"{name} 的州別怪怪的")
            self.assertTrue(v["postcodes"], f"{name} 沒有郵區")

    def test_郵區號碼合理(self):
        for name, v in REGIONS.items():
            for pc in v["postcodes"]:
                self.assertTrue(200 <= pc <= 9999, f"{name} 有怪號碼 {pc}")

    def test_涵蓋量合理(self):
        # 全澳 566 個行政區，扣掉無人區與外島，剩下的量級應該在這個範圍
        self.assertGreater(len(REGIONS), 400)
        self.assertLess(len(REGIONS), 600)
        pairs = sum(len(v["postcodes"]) for v in REGIONS.values())
        self.assertGreater(pairs, 2500)

    def test_大區域的郵區數要說得過去(self):
        for name, lo, hi in [("Central Coast (NSW)", 8, 20),
                             ("Moreton Bay", 15, 40),
                             ("Sunshine Coast", 12, 35),
                             ("Gold Coast", 12, 35)]:
            n = len(REGIONS[name]["postcodes"])
            self.assertTrue(lo <= n <= hi, f"{name} 有 {n} 個郵區，不在 {lo}–{hi}")

    def test_同名的行政區要能分辨(self):
        # 「Central Coast」在 NSW 與 TAS 各有一個，名字必須帶州別後綴，
        # 否則使用者查了會不知道看到的是哪一個。
        same = [n for n in REGIONS if n.startswith("Central Coast")]
        self.assertEqual(2, len(same), f"預期兩個 Central Coast，實際 {same}")
        self.assertEqual(2, len({REGIONS[n]["state"] for n in same}))


class TestAgainstIndex(unittest.TestCase):

    def test_對照表裡的郵區多半在索引裡(self):
        """對照表是從 ABS 的郵區面算的，索引是從郵政資料來的，兩邊不會完全
        重合（ABS 有些面對應到信箱型號碼）。但差太多就表示有一邊錯了。"""
        pcs = {pc for v in REGIONS.values() for pc in v["postcodes"]}
        known = {int(k) for k in INDEX}
        overlap = len(pcs & known) / len(pcs)
        self.assertGreater(overlap, 0.9, f"只有 {overlap:.1%} 的郵區在索引裡")


if __name__ == "__main__":
    unittest.main()
