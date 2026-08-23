# 昆士蘭 417 集簽地圖

澳洲打工度假簽證（417 / 462）集簽合格郵遞區號的互動地圖，以**建築工地**為取向。
郵區以整片色塊渲染，可切換 regional、叢林大火宣告區、天災宣告區三個圖層。

產出是**單一自包含 HTML**（無外部請求，字型除外），可直接發佈為 Artifact。

## 快速開始

```bash
make build          # 用現有 data/ 產生 dist/qld.html
make serve          # 建置並在 http://127.0.0.1:8731/qld.html 預覽
```

`make build` 不連網。要更新資料才需要 `make update`。

## 資料從哪來

| 資料 | 來源 | 抓取腳本 |
|---|---|---|
| 五張指定地區郵區表（417 與 462） | [Home Affairs](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work) | `fetch/postcodes.py` |
| 郵區邊界多邊形 | ABS ArcGIS，ASGS2021 POA_GEN 圖層 | `fetch/boundaries.py` |
| 郵區地區名與中心座標 | [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes) | `fetch/localities.py` |
| 州界輪廓 | [rowanhogan/australian-states](https://github.com/rowanhogan/australian-states) | `fetch/basemap.py` |
| 城市標註 | 人工維護 | 直接編輯 `data/cities-qld.json` |

## 架構：抓取 → 凍結 → 建置

三層刻意分開，每層可以單獨重跑。

```
fetch/*.py  --(連網)-->  data/*.json  --(離線)-->  dist/qld.html
```

* **抓取**只在 `make update` 時發生。
* **凍結**：抓下來的東西進版控。所以官網改動會出現在 `git diff` 裡，而不是默默生效。
* **建置**只讀本地檔案，離線可跑，結果可重現。

### 郵區清單存的是「範圍字串」不是展開後的號碼

`data/postcodes.json` 保存官網原文，例如 `"4307 to 4499, 4510"`。
展開成號碼集合是 `lib.expand()` 在建置時做的。

這樣做是為了 `git diff` 讀得懂 —— 官網把 `4417 to 4420` 改成 `4417 to 4421`，
diff 就是一行；如果存展開後的陣列，diff 會是幾百個數字，沒人看得出來改了什麼。

## 更新流程

```bash
make update                 # 重抓全部
git diff data/postcodes.json   # 官網到底改了哪些郵區？
make build
```

`fetch/postcodes.py` 內建健檢，**寧可壞掉也不默默給錯資料**。以下情況會中止並保留舊資料：

* 五張指定地區表少了任何一張
* 頁面更新日期讀不到
* 任一州的郵區數量比上次變動超過 10%
* 範圍字串解析不出來

確認官網真的改了而且改對了，再用 `python3 fetch/postcodes.py --force` 覆寫。

`--keep-raw` 會把原始 HTML 存到 `data/raw/`（不進版控）供人工核對。

## 加一個州

資料層是全澳設計的，`data/postcodes.json` 已含八州。要加 NSW：

```bash
make update STATE=nsw
# 建立 data/cities-nsw.json（照 cities-qld.json 的格式）
make build STATE=nsw
```

`build.py` 的 `TITLES` 可加該州標題。投影是等距長方投影加緯度餘弦修正，
`src/template.html` 會依資料自動算出視野範圍，不需要改。

## 417 與 462

建置時會比對兩者在該州的五張表，並把結果寫進頁面。
目前**八州的五張表 417 與 462 完全相同**，所以同一張圖兩種簽證都適用。

差別在**產業**不在地點：417 的礦業算集簽，462 沒有礦業這一項；
漁業與林業 462 只限 northern Australia。建築業兩者相同。

## 免責

郵區範圍為 ABS 概化邊界，僅供判讀，非法定界線。
個別災害的宣告範圍與日期請對 [Disaster Assist](https://www.disasterassist.gov.au/find-a-disaster) 查證。
送件前一律以 Home Affairs 官方頁面為準。
