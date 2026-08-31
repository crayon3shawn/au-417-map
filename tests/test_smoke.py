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

class TestReadmeTestCount(unittest.TestCase):
    """README 寫的測試數量要跟實際一致。

    這個數字在版本之間漂過兩次——它沒有任何東西在盯，而讀 README 的人會拿它
    當「這個專案測得多細」的參考。加測試的人順手改一個數字很便宜，發現它是
    錯的卻要有人剛好去數。

    失敗時就照訊息把 README 那個數字改掉，不必想太多。
    """

    def test_數量與README一致(self):
        import re
        loader = unittest.defaultTestLoader
        # 跟 Makefile 同一種呼叫方式（`unittest discover -s tests`）——
        # tests/ 沒有 __init__.py，指定 top_level_dir 會匯入不了。
        suite = loader.discover(str(ROOT / "tests"))
        def count(s):
            return sum(count(x) if isinstance(x, unittest.TestSuite) else 1 for x in s)
        actual = count(suite)
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        m = re.search(r"make test\s+# (\d+) 項", readme)
        self.assertIsNotNone(m, "README 裡找不到「make test # N 項」那一行")
        self.assertEqual(int(m.group(1)), actual,
                         f"README 寫 {m.group(1)} 項，實際 {actual} 項——把 README 改成 {actual}")
