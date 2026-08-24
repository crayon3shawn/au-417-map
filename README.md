# 澳洲 417 集簽地圖

澳洲打工度假簽證（417 / 462）集簽合格郵遞區號的互動地圖，以**建築工地**為取向。
郵區以整片色塊渲染，可切換 regional、叢林大火宣告區、天災宣告區三個圖層。

產出是**單一自包含 HTML**（無外部請求，字型除外），可直接發佈為 Artifact。

## 快速開始

```bash
make all      # 建全部州頁 + 入口頁
make test     # 跑測試（不連網）
make serve    # 建置並在 http://127.0.0.1:8731/index.html 預覽
```

產出四頁，各自獨立：

| 頁面 | 內容 | 大小 |
|---|---|---|
| `dist/index.html` | **入口頁**：全澳郵區查詢 + 各州導覽 | 0.10 MB |
| `dist/qld.html` | 昆士蘭地圖 | 1.12 MB |
| `dist/nsw.html` | 新南威爾斯地圖 | 1.43 MB |
| `dist/vic.html` | 維多利亞地圖 | 0.89 MB |
| `dist/wa.html` | 西澳地圖 | 0.75 MB |

**SA、TAS、NT 不做地圖。** 官網原文就是「All postcodes are eligible」，
全境都在 regional 名單上，整張圖只會是一片綠。入口頁直接寫「全境都算」。

**ACT 也不做地圖**，但理由相反：Regional Australia 名單上根本沒有 ACT，
一般建築工地全境都不算；而整個 ACT 都是叢林大火宣告區，所以災後重建工作
在哪裡都算。唯一例外是 2618 Hall——它落在 NSW 的 regional 區間 2618-2739 裡。
25 個都市郵區擠在很小的範圍，畫成地圖沒有資訊量，入口頁把規則寫清楚即可。

入口頁不放郵區多邊形，只放郵區號碼對應的身分與州界輪廓，所以很輕，
查詢秒回，也不會被各州地圖的體積拖累。

## 地圖怎麼讀

每個郵區只有三種答案，互斥且涵蓋 100%：

| | 意思 |
|---|---|
| 🟩 綠 | 一般建築工地就算 |
| 🟧 琥珀 | 一般工地不算，**只有災後重建工作算** |
| ⬜ 灰 | 完全不算 |

沒有篩選器、沒有勾選框。顏色就是答案本身。

早期版本用「勾選圖層 + 顏色表示身分」兩個軸，結果是：勾了 Regional 之後，
NSW 的 292 塊裡只有 1 塊是綠的、78% 是紫色——圖例花兩行講的東西在畫面上
等於不存在，而且勾選和顏色共用同一組詞彙，直覺會以為勾了就變色。

災害種類（大火／天災）另給一個開關，只作用在琥珀那一類：唯有「重建是唯一
路徑」時，災害種類才影響你的判斷（日期門檻不同、ImmiAccount 的 Employment
type 也不同）。在綠色郵區一般工作本來就算，那是次要資訊，留在詳情面板。

`make build` 不連網。要更新資料才需要 `make update`。

## 資料從哪來

| 資料 | 來源 | 授權 | 抓取腳本 |
|---|---|---|---|
| 五張指定地區郵區表 | [Home Affairs — Specified work (417)](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work) · [462 版](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-462/specified-462-work) | [Copyright and disclaimer](https://www.homeaffairs.gov.au/access-and-accountability/using-our-website/copyright-and-disclaimer)（未逐條確認）| `fetch/postcodes.py` |
| 郵區邊界（Postal Areas 2021） | [ABS ArcGIS — ASGS2021/POA](https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/POA/MapServer) | **CC BY 4.0**（服務中繼資料載明）| `fetch/boundaries.py` |
| 郵區地名與座標 | [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes) | ⚠️ **未宣告授權** | `fetch/localities.py`、`fetch/cities.py`、`fetch/portal.py` |
| 州界輪廓（入口頁用） | [ABS ArcGIS — ASGS2021/STE](https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer) | **CC BY 4.0** | `fetch/portal.py` |
| 產業與地區表的對應 | Home Affairs 頁面的散文段落，**人工整理** | — | 直接維護 `data/industries.json` |
| 城市標註 | 人工維護清單，座標自動解析 | — | 改 `data/cities-<state>.seed.json` |
| 災害宣告查證 | [Disaster Assist — Find a disaster](https://www.disasterassist.gov.au/find-a-disaster) | — | 未自動抓取，供人工核對 |

### ABS POA 是近似值，不是法定郵區界線

ABS 自己的描述：POA 是「an ABS Mesh Block approximation of a general definition of
postcodes」。它不是 Australia Post 的官方郵區界線——後者並未公開釋出。
所以郵區交界附近務必以工地實際地址的郵遞區號為準，不要拿地圖上的線去量。

### ABS 與 matthewproctor 的差別

兩者回答的是不同問題，不能互相取代：

* **ABS POA** 給幾何，不給地名。
* **matthewproctor** 給郵區↔地名、一個代表座標，以及 `type` 欄位
  （Delivery Area／LVR／Post Office Boxes）——那個欄位是過濾信箱型郵區的關鍵。

覆蓋差異很小且可解釋：只在 matthewproctor 的多半是非地理郵區（信箱、大學、
郵件中心），ABS 不給它們面是正確的；只在 ABS 的是 0872 這種跨州郵區與外島。

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

### 州頁不畫州界輪廓

郵區面本來就鋪滿整個州，形狀也比輪廓精確得多，視野範圍直接由它算。

輪廓是另一份解析度粗得多的幾何（RDP 容差約 3 公里），疊在半透明的郵區色塊
底下會出現兩種假象：描邊從色塊透出來，變成一條不跟隨任何東西的線；
即使只留底色不描邊，輪廓外緣仍會露出淡色細帶。兩份不同解析度的幾何疊在
一起就是會這樣，所以州頁乾脆不畫。入口頁沒有郵區面，那裡輪廓就是地圖本身。

## 產業

這份地圖是**建築業**取向。產業會決定要看哪幾張地區表，換產業結果就不同：

| 產業 | 417 | 462 |
|---|---|---|
| 建築 | Regional | Regional（結果相同）|
| 農牧 | Regional | Regional |
| 礦業 | Regional | **462 沒有這一項產業** |
| 漁業／珍珠 | Regional | **僅 Northern** |
| 林業伐木 | Regional | **僅 Northern** |
| 觀光餐旅 | Northern ＋ Remote | 同左 |

對應表在 `data/industries.json`，`build.py` 的 `INDUSTRY` 指定要用哪一個。
官方**沒有**這張表——它是頁面上的散文規則，人工整理來的，所以 `tests/test_industries.py`
釘得比較細。地區表本身則是抓取來的。

要支援多產業，資料層已經備好，剩下的是 UI：加一個選單、依選擇重算三分類即可。

### 跨州郵區 0872

0872 橫跨 NT／WA／SA 交界的沙漠，只在 NT 的郵區號碼區間內。它絆倒了三個地方：

* **逐州比對覆蓋範圍會看到假差異**——NT 的五張表都有它，但它只出現在 WA 的
  northern 而不在 WA 的 regional。跨州取聯集後，417 與 462 的建築業覆蓋
  各 4519 個郵區，完全相同。
* **郵區身分必須跨全澳計算**，不能只看本州。它是郵區本身的屬性，不該隨你
  看哪一頁而變。逐州算的話 0872 在 WA 頁會被誤判成不是 regional。
* **邊界要另外指定**（`lib.CROSS_BORDER`）。只抓 `6%` 的話 WA 東側會出現
  一大片留白。地名也在 NT 的檔案裡，本州查不到，所以有面卻沒地名的郵區
  改用全澳索引補地名、用多邊形重心補座標。

## 只做 417

頁面只處理 417（Working Holiday）。462 的地區表目前跟 417 逐字相同，
但**產業規則不同**——462 沒有礦業這一項，漁業與林業只限 Northern Australia，
所以不能拿這裡的判斷給 462 用。

`data/postcodes.json` 仍然兩種簽證都抓、都存：成本是零，而且測試裡有一條
盯著「兩者的地區表是否仍然相同」，哪天官網讓它們分家會先失敗，提醒我們去
看發生了什麼事。只是不顯示而已。

## 授權與開源

**目前尚未加上 LICENSE，開源前有事情要處理。**

本專案自己的程式碼（`fetch/`、`build*.py`、`lib.py`、`src/`、`tests/`）沒有問題，
問題在 `data/` 裡進了版控的衍生資料：

* **ABS 來源的部分沒問題** —— CC BY 4.0，只要標示出處。
* **只剩 `matthewproctor` 一個來源沒有宣告授權**，預設就是保留所有權利。
  它的 README 說資料「arguably public domain」，但那是作者的意見，不是授權條款。
  受影響的檔案只有 `data/localities-*.json`、`portal-index.json`、`cities-*.json`。
  （州界原本用的 rowanhogan 已改為 ABS STE。）

幾條可行的路，各有代價：

1. **不把第三方衍生資料進版控**，改成建置時現抓。倉庫裡只有程式碼，
   完全避開再散布的問題。代價是失去「官網改了什麼在 git diff 看得到」這個優點。
2. **改用 ABS 的 SAL（Suburbs and Localities）圖層**做空間疊合取得地名。
   代價不小：郊區與郵區是兩套分區系統，疊合在交界必然出錯；而且會失去
   `type` 欄位（Delivery Area／LVR／Post Office Boxes），那是過濾信箱型郵區的
   關鍵——ABS 沒有這個資訊，它是 Australia Post 的屬性。**不建議。**
3. **去問來源作者補上授權**（開個 issue）。成本最低，但不一定有回應。

我不是律師，上面只是把查到的事實列出來，不構成法律意見。

### 放上 GitHub Pages

`dist/` 本來就是自包含的靜態檔案，可以直接當 Pages 的輸出目錄。
改成 Pages 之後有一個額外好處：各頁之間可以用相對路徑互連
（`qld.html`），不必再繞 Artifact 的網址，也就沒有 iframe 沙箱那些限制。
`data/artifacts.json` 屆時可以換成相對路徑。

## 免責

本專案不是移民建議。郵區範圍為 ABS 概化邊界，僅供判讀，非法定界線；
個別災害的宣告範圍與日期請對 [Disaster Assist](https://www.disasterassist.gov.au/find-a-disaster) 查證。
送件前一律以 [Home Affairs 官方頁面](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work) 為準。

## 出處標示

含有澳洲統計局（ABS）依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
授權提供的資料：ASGS 2021 Postal Areas（POA）與 State and Territory（STE）。
