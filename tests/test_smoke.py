"""在 node 裡把產出頁面的腳本真的跑一遍，抓執行期就會炸掉的錯。

TDZ、拼錯的變數、呼叫不存在的東西——這類錯在瀏覽器只會讓整段腳本靜靜掛掉，
畫面上看起來就只是「地圖沒出來」。這個專案已經栽過三次，所以列為必跑。
細節見 tests/smoke.js。
"""
import unittest, subprocess, shutil, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "找不到 node，略過腳本煙霧測試")
class TestSmoke(unittest.TestCase):

    def test_每個產出頁面的腳本都跑得完(self):
        pages = sorted((ROOT / "dist").glob("*.html"))
        self.assertTrue(pages, "dist/ 裡沒有頁面，請先 make build")
        for page in pages:
            with self.subTest(page=page.name):
                r = subprocess.run([NODE, str(ROOT / "tests" / "smoke.js"), str(page)],
                                   capture_output=True, text=True, timeout=120)
                self.assertEqual(r.returncode, 0, r.stderr or r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
