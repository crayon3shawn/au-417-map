# 澳洲 417／462 集簽地圖

澳洲打工度假簽證（417 / 462）集簽合格郵遞區號的互動地圖，以**建築工地**為取向。
郵區以整片色塊渲染，可切換 regional、叢林大火宣告區、天災宣告區三個圖層。

產出是**單一自包含 HTML**（無外部請求，字型除外），可直接發佈為 Artifact。

## 快速開始

```bash
make build                # dist/qld.html
make build STATE=nsw      # dist/nsw.html
make test                 # 跑測試（不連網）
make serve                # 建置並在 http://127.0.0.1:8731/qld.html 預覽
```

目前已建 **QLD** 與 **NSW** 兩州，各自獨立一頁。

`make build` 不連網。要更新資料才需要 `make update`。

## 資料從哪來

| 資料 | 來源 | 抓取腳本 |
|---|---|---|
| 五張指定地區郵區表（417 與 462） | [Home Affairs](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work) | `fetch/postcodes.py` |
| 郵區邊界多邊形 | ABS ArcGIS，ASGS2021 POA_GEN 圖層 | `fetch/boundaries.py` |
| 郵區地區名與中心座標 | [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes) | `fetch/localities.py` |
| 州界輪廓 | [rowanhogan/australian-states](https://github.com/rowanhogan/australian-states) | `fetch/basemap.py` |
| 城市標註 | 人工維護清單，座標自動解析 | `fetch/cities.py`（改 `data/cities-<state>.seed.json`）|

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

## 測試

```bash
make test
```

不連網，分四塊：

| 檔案 | 管什麼 |
|---|---|
| `tests/test_expand.py` | 郵區範圍字串的解析。解析錯一個範圍，合格郵區就默默變了，這是風險最高的一段 |
| `tests/test_data.py` | 凍結資料的結構完整性，加上幾個定錨事實（凱恩斯是 regional、雪梨不在任何清單上）|
| `tests/test_build.py` | 郵件中心郵區的判定、path 產生、bbox |
| `tests/test_smoke.py` | **把產出頁面的腳本在 node 裡真的跑一遍** |

刻意不釘死郵區數量——官網本來就會改，釘數字只會在正常更新時假警報。
釘的是結構，以及「417 與 462 目前完全相同」這件事：哪天官網讓它們分家，
測試會先失敗，提醒去改頁面文案而不是繼續講錯話。

### 為什麼要有 node 煙霧測試

暫時死區（TDZ）、拼錯的變數、呼叫不存在的東西——這類錯在瀏覽器只會讓
**整段腳本靜靜掛掉**，畫面上看起來就只是「地圖沒出來」，沒有其他線索。
這個專案已經栽過三次。`tests/smoke.js` 用一個「什麼都回傳假物件」的 DOM
把腳本跑完，跑得完就代表沒有這類錯。需要 `node`，沒裝就自動略過。

## 效能

**一州一頁**，不把多州塞進同一份 HTML —— 這是控制成本最有效的一件事。

單頁內的兩個關鍵作法：

* **一個郵區一條 path。** 邊界與填色不分兩層，沒被篩選到就 `fill-opacity: 0`，
  只剩邊界線。篩選只是加減一個 class，不動幾何。這讓節點數直接減半。
* **path 字串在 build 端烘好，投影交給 SVG group transform。**
  資料維持原始經緯度，前端啟動時不必逐點做字串運算（NSW 有 8 萬多個點）。
  座標精度 3 位小數（約 110 公尺），與邊界概化的 165 公尺容差相稱。

實測（1280×860）：

| | path 數 | SVG 節點 | 頁面大小 | 篩選切換 |
|---|---|---|---|---|
| QLD 改版前 | 872 | 1035 | 1353 KB | — |
| QLD 現在 | 434 | 598 | 1094 KB | 0.6 ms |
| NSW 現在 | 614 | 817 | 1397 KB | 0.8 ms |

版面尺寸（字級、點徑）以**目標螢幕像素**定義再換算成世界單位。
各州視野比例不同（QLD 貼高度、NSW 貼寬度），寫死世界單位會讓字忽大忽小。

## 加一個州

資料層是全澳設計的，`data/postcodes.json` 已含八州。以 VIC 為例：

```bash
make update STATE=vic                  # 郵區清單、邊界、地名、州界
# 建立 data/cities-vic.seed.json（照 cities-qld.seed.json 的格式）
python3 fetch/cities.py vic            # 解析城市座標
make build STATE=vic
```

`build.py` 的 `TITLES`、`LABELS`、`EXCLUDED` 各加一行該州的文案。
其餘不用改：視野範圍、字級、南回歸線畫不畫，樣板都會依資料自行決定。

## 417 與 462

建置時會比對兩者在該州的五張表，並把結果寫進頁面。
目前**八州的五張表 417 與 462 完全相同**，所以同一張圖兩種簽證都適用。

差別在**產業**不在地點：417 的礦業算集簽，462 沒有礦業這一項；
漁業與林業 462 只限 northern Australia。建築業兩者相同。

## 免責

郵區範圍為 ABS 概化邊界，僅供判讀，非法定界線。
個別災害的宣告範圍與日期請對 [Disaster Assist](https://www.disasterassist.gov.au/find-a-disaster) 查證。
送件前一律以 Home Affairs 官方頁面為準。
