"""災後重建那段文字必須跟官網原文對得上。

這段散文對 636 個郵區（全澳 23%）來說就是全部的答案——重建是那些郵區唯一的
路——但它不是資料，沒有任何既有測試看得到它改壞。曾經有一版漏掉「一般清理」，
而清理是官網在 Natural disaster 底下舉的第一個例子。

釘的是官方原文的關鍵詞，不是我們的措辭。細節見 tests/recovery.js。
"""
import unittest, subprocess, shutil, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "找不到 node，略過災後重建文字對照")
class TestRecoveryText(unittest.TestCase):

    def test_災後重建的文字跟官網對得上(self):
        for name in ("index.html", "nsw.html"):
            if not (ROOT / "dist" / name).exists():
                self.skipTest(f"dist/{name} 不存在，請先 make all")
        r = subprocess.run([NODE, str(ROOT / "tests" / "recovery.js")],
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stderr or r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
