#!/usr/bin/env python3
"""比對 data/postcodes.json 有沒有「實質」變動，並印出人看得懂的差異。

fetch/postcodes.py 每次都會重寫 fetched_at，所以 `git diff` 一定有東西——
那只代表跑過了，不代表官網改了。這支只看真正重要的兩個地方：

  * areas                        五張指定地區表的郵區
  * sources[*].page_last_updated 官網頁面自己標示的更新日期

差異用「展開後的郵區集合」比，不是比字串：官網把 "4417, 4418, 4419" 改寫成
"4417 to 4419" 時郵區其實沒變，那種噪音不該吵醒任何人。

用法：
    python3 diff_postcodes.py                  # 跟 git HEAD 的版本比
    python3 diff_postcodes.py --restore        # 沒有實質變動就還原檔案
    python3 diff_postcodes.py --base old.json  # 指定舊檔，不走 git

離開碼：
    0  沒有實質變動
    1  有實質變動（差異印在 stdout）
    2  讀不到舊版或解析失敗
"""
import sys, json, subprocess, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib import expand, load

ROOT = pathlib.Path(__file__).resolve().parent
TARGET = ROOT / "data" / "postcodes.json"
REL = "data/postcodes.json"

# 一個州別列列出太多號碼時只印前後各這麼多，中間省略。
# 全部印出來的話，NSW 的天災表一改就是幾百行，PR 內文會沒法看。
HEAD_TAIL = 12


def git_show(rev=f"HEAD:{REL}"):
    """取出 git 裡的版本。檔案是新增的（HEAD 還沒有）就回傳 None。"""
    r = subprocess.run(["git", "show", rev], cwd=ROOT,
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout)


def collapse(nums):
    """把號碼集合收回成範圍字串，讀起來跟官網原文同一個形狀。"""
    out, run = [], []
    for n in sorted(nums):
        if run and n == run[-1] + 1:
            run.append(n)
            continue
        if run:
            out.append(run)
        run = [n]
    if run:
        out.append(run)
    parts = [f"{r[0]:04d}" if len(r) == 1 else
             f"{r[0]:04d}-{r[1]:04d}" if len(r) == 2 else
             f"{r[0]:04d} to {r[-1]:04d}" for r in out]
    if len(parts) > HEAD_TAIL * 2:
        n = len(parts) - HEAD_TAIL * 2
        parts = parts[:HEAD_TAIL] + [f"…（中間省略 {n} 段）…"] + parts[-HEAD_TAIL:]
    return ", ".join(parts)


def summarise(old, new):
    """回傳 (有無實質變動, 差異的文字行)。"""
    lines = []

    for visa in sorted(set(old.get("sources", {})) | set(new.get("sources", {}))):
        o = old.get("sources", {}).get(visa, {}).get("page_last_updated")
        n = new.get("sources", {}).get(visa, {}).get("page_last_updated")
        if o != n:
            lines.append(f"**{visa} 官網頁面更新日期**：`{o}` → `{n}`")

    for visa in sorted(set(old.get("areas", {})) | set(new.get("areas", {}))):
        oa = old.get("areas", {}).get(visa, {})
        na = new.get("areas", {}).get(visa, {})
        for area in sorted(set(oa) | set(na)):
            op, np_ = oa.get(area, {}), na.get(area, {})
            for st in sorted(set(op) | set(np_)):
                o_raw, n_raw = op.get(st), np_.get(st)
                if o_raw == n_raw:
                    continue
                where = f"{visa} / {area} / {st.upper()}"
                if o_raw is None:
                    lines.append(f"**{where}**：官網新增了這一州")
                    continue
                if n_raw is None:
                    lines.append(f"**{where}**：⚠️ 官網把這一州整列拿掉了")
                    continue
                try:
                    o_set, n_set = expand(o_raw, st), expand(n_raw, st)
                except ValueError as e:
                    lines.append(f"**{where}**：⚠️ 解析失敗 — {e}")
                    continue
                added, removed = n_set - o_set, o_set - n_set
                if not added and not removed:
                    continue        # 只有寫法改變，郵區沒變，不值得吵
                lines.append(f"**{where}**（{len(o_set)} → {len(n_set)} 個郵區）")
                if added:
                    lines.append(f"  * ＋新增 {len(added)}：{collapse(added)}")
                if removed:
                    lines.append(f"  * －移除 {len(removed)}：{collapse(removed)}")

    return bool(lines), lines


def main():
    argv = sys.argv[1:]
    restore = "--restore" in argv
    base = None
    if "--base" in argv:
        base = load(argv[argv.index("--base") + 1])

    if not TARGET.exists():
        print(f"找不到 {REL}", file=sys.stderr)
        return 2
    new = load(TARGET)

    if base is None:
        base = git_show()
        if base is None:
            print(f"{REL} 在 git HEAD 裡不存在，視為全新檔案。")
            return 1

    try:
        changed, lines = summarise(base, new)
    except Exception as e:
        print(f"比對失敗：{e}", file=sys.stderr)
        return 2

    if not changed:
        print("官網無實質變動（郵區與頁面日期都沒改）。")
        if restore:
            subprocess.run(["git", "checkout", "--", REL], cwd=ROOT, check=False)
            print(f"已還原 {REL}，只有 fetched_at 被重寫，不留下改動。")
        return 0

    print("\n".join(lines))
    return 1


if __name__ == "__main__":
    sys.exit(main())
