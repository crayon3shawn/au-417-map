"""入口頁與州頁對同一個郵區必須給出同一個答案。

答案面板的邏輯兩頁各有一份（兩頁不共用 JS），重複的東西會漂，而且漂掉不會有
任何錯誤訊息。這個專案已經被咬過一次——入口頁改成一次列出全部產業之後，州頁
還停在「只看選擇器選的那一行」，而使用者正是照著入口頁的按鈕跳過去的。

比的是行為不是原始碼：把兩頁的 answerHead／answerBody 叫出來，餵 32 種旗標
組合比對輸出。細節見 tests/answers.js。
"""
import unittest, subprocess, shutil, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "找不到 node，略過兩頁答案比對")
class TestAnswersMatch(unittest.TestCase):

    def test_兩頁的答案邏輯沒有漂掉(self):
        for name in ("index.html", "nsw.html"):
            if not (ROOT / "dist" / name).exists():
                self.skipTest(f"dist/{name} 不存在，請先 make all")
        r = subprocess.run([NODE, str(ROOT / "tests" / "answers.js")],
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stderr or r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
