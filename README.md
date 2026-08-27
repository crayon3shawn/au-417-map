# 澳洲 417 集簽地圖

澳洲打工度假簽證 **417**（Working Holiday）集簽合格郵遞區號的互動地圖，以**建築工地**為取向。462 的產業規則不同，不適用（理由見〈只做 417〉）。
郵區以整片色塊渲染，可切換 regional、叢林大火宣告區、天災宣告區三個圖層。

產出是**單一自包含 HTML**（無外部請求，字型除外），可直接發佈為 Artifact。

## 快速開始

```bash
make all      # 建全部州頁 + 入口頁
make test     # 跑測試（不連網）
make serve    # 建置並在 http://127.0.0.1:8731/index.html 預覽
```

## 建置目標

| | 頁面之間的連結 | 用在哪 |
|---|---|---|
| `make all`（預設）| 相對路徑 `qld.html` | GitHub Pages。同站台原地跳轉 |
| `TARGET=artifact make all` | `data/artifacts.json` 的絕對網址 | 發佈成 Claude Artifact |

`data/artifacts.json` **不進版控**——裡面是私人的 Artifact 連結，推上公開 repo
等於把「知道網址就能看」的頁面攤開。所以 `TARGET=artifact` 只有本機建得出來。

## 部署

推 `main` 之後，`.github/workflows/pages.yml` 會建置、跑測試、部署到 Pages。
**站台只有一份**，就是 `main`。

開發流程是**本機測完才推**：

```bash
CHANNEL=dev make all      # 建出帶開發版橫幅的一份
make serve                # http://127.0.0.1:8731/index.html
make test                 # 73 項，不連網
git push origin main      # 確認沒問題才推
```

`CHANNEL=dev` 建出來的頁面會多一條細橫幅（連到已發佈的站台方便對照）與
`noindex`。橫幅的用處是提醒你手上這份不是線上那份。

以前 `/dev/` 是掛在站台上的第二條線，後來拿掉了——那要多維護一整套東西
（Pages 環境的分支白名單、`robots.txt`、兩份成品的組裝），而既然流程是本機
測完才推，那條線沒有存在的必要。`noindex` 保留著，萬一哪天真的把開發版放上去
才不會裸奔。

> 順帶記一個坑：`robots.txt` 只有放在**網域根目錄**才會被爬蟲讀到。專案站台在
> `/<repo>/` 底下時那個檔是無效的，所以擋索引真正靠的是頁面自己的 `noindex`。

### 自訂網域（目前未綁）

站台在 `<帳號>.github.io/<repo>/`。要綁自訂網域時，**兩件事都要做**：

1. workflow 的 `CUSTOM_DOMAIN` 填上子網域 → 產生 `CNAME` 檔
2. DNS 加一筆記錄：`CNAME  417  <帳號>.github.io`

驗證（TXT）與路由（CNAME）是**不同的兩件事**：驗證只是宣告網域是你的、
防止被接管，不會導流；沒有 CNAME 的話子網域根本解析不到。

**Cloudflare 要注意兩點**：CNAME 先設 **DNS only（灰雲）**，橘雲會讓 GitHub
的 Let's Encrypt 驗證過不了、HTTPS 永遠發不出來；之後若要開橘雲，
SSL/TLS 模式要選 **Full**，選 Flexible 會跟 Pages 的強制 HTTPS 打成轉址迴圈。

產出五頁，各自獨立（`dist/` 不進版控，由 `make all` 產生）：

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

## 操作

* **查郵區或地名**——輸入 `4870` 或 `Cairns` 都可以。多數人知道自己在哪個鎮，
  不知道郵區號碼，所以地名搜尋是主要入口。地名有多筆時會列出候選，
  每筆前面的色點就是那個郵區的判定結果。
* **導覽列**——回入口頁、切到其他州。Artifact 在沙箱 iframe 裡不能改上層網址，
  所以一律開新分頁；之後放上 GitHub Pages 可改成相對路徑原地跳轉。
* **觸控**——一指平移、**兩指捏合縮放**。CSS 的 `touch-action:none` 關掉了瀏覽器
  原生手勢，所以捏合是自己實作的，否則手機上只能用 ＋／− 按鈕。
* **滑鼠**——滾輪縮放、拖曳平移。

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
| 五張指定地區郵區表 | [Home Affairs — Specified work (417)](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work) | [Copyright and disclaimer](https://www.homeaffairs.gov.au/access-and-accountability/using-our-website/copyright-and-disclaimer)（未逐條確認）| `fetch/postcodes.py` |
| 郵區邊界（Postal Areas 2021） | [ABS ArcGIS — ASGS2021/POA](https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/POA/MapServer) | **CC BY 4.0**（服務中繼資料載明）| `fetch/boundaries.py` |
| 郵區地名與座標 | [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes) | ⚠️ **未宣告授權** | `fetch/localities.py`、`fetch/cities.py`、`fetch/portal.py` |
| 州界輪廓（入口頁用） | [ABS ArcGIS — ASGS2021/STE](https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer) | **CC BY 4.0** | `fetch/portal.py` |
| 產業與地區表的對應 | Home Affairs 頁面的散文段落，**人工整理** | — | 直接維護 `data/industries.json` |
| 城市標註 | 人工維護清單，座標自動解析 | — | 改 `data/cities-<state>.seed.json` |
| 災害宣告查證 | [Disaster Assist — Find a disaster](https://www.disasterassist.gov.au/find-a-disaster) | — | 未自動抓取，供人工核對 |

### 官網改了怎麼辦——每週自動健檢

郵區清單是這個站台唯一的事實來源。官網改了而我們不知道，頁面就會**安靜地**
給出過期的答案：沒有錯誤訊息，沒有徵兆，使用者照著做才發現。

`.github/workflows/data-check.yml` 每週一 09:00（台北）跑一次：

```
抓官網 → 健檢 → 比對 → 沒變就什麼都不做
                    └→ 變了就開 PR，內文列出哪些郵區進出了哪張表
```

**沒變動時完全安靜**——不 commit、不開 PR、不發通知。這一點是刻意的：
誤報一次就會讓人開始忽略通知，之後真的改了也不會有人看。

判斷「有沒有變」不能用 `git diff`，因為 `fetch/postcodes.py` 每次都會重寫
`fetched_at`。`diff_postcodes.py` 比的是**展開後的郵區集合**，所以官網把
`4307, 4308` 改寫成 `4307 to 4308`、或逗號換成分號時不會觸發 PR——
郵區沒變的事不值得吵醒任何人。

本機要看同樣的比對用 `make diff`。

三種結果分別代表什麼：

| workflow 結果 | 意思 | 你要做什麼 |
|---|---|---|
| ✅ 綠燈、沒有 PR | 官網沒改 | 什麼都不用做 |
| ✅ 綠燈、開了 PR | 官網改了，且改動後建得起來 | 人工核對 PR 內文列的改動，沒問題就合併 |
| ❌ 紅燈 | 健檢沒過（少一張表／某州郵區數變動超過 10%／範圍字串解析不出來），或改動後建不起來 | 一定要人看。失敗時原始 HTML 會存成 artifact，保留 30 天 |

健檢沒過時**不會寫入 `data/postcodes.json`**，寧可壞掉也不要默默給出錯的郵區。
官網改版型（表格搬家、hidden field 換名字）就屬於這一類。

> GitHub 會在 repo 連續 60 天沒有活動後停掉排程 workflow，久沒動的話記得
> 去 Actions 頁面重新啟用。

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

## 跨州查詢與共用索引

每個州頁只有自己州的郵區資料，所以打「Byron Bay」原本會得到「找不到」——那個
地方明明存在，只是在隔壁州。現在別州的結果會排在本州之後，標上州別縮寫，點下去
換到那一州的地圖並直接選中該郵區。

索引拆成兩份，理由是它們的大小與用途完全不同：

| | 大小 | 放哪 | 為什麼 |
|---|---|---|---|
| 州別 + 地區表旗標 | 26 KB | 每頁內嵌 | 地圖上色、各州統計、行政區統計都要用，延後載入會先看到一張沒有顏色的地圖 |
| 地名（`\|` 串接） | 216 KB | `search-index.json` 共用 | 只有「用地名搜尋」才需要，五個頁面指向同一個網址，瀏覽器只下載一次 |

入口頁因此從 **0.41 MB 降到 0.16 MB**（它原本內嵌整份 281 KB 的索引）。四個州頁
各加 26 KB。使用者開入口頁再看兩個州，下載量從 3.03 MB 降到 2.97 MB——而把地名
內嵌到每一頁的話會變成 3.37 MB。

`TARGET=artifact` 沒有第二個檔可以放，那個版本仍然內嵌。

**這東西壞掉不會有徵兆**：`fetch` 失敗被 catch 吃掉，頁面照樣運作，只是打別州的
地名永遠「找不到」。所以測試從兩頭釘：檔案有產出、而且 workflow 真的會複製它
（原本只 `cp dist/*.html`）。

## 行政區搜尋

職缺廣告是用**行政區名**寫的（Seek 的地點分類就是「Gosford & Central Coast」
「Sunshine Coast」這種），但郵政資料裡只有地名（suburb）。使用者打
「Central Coast」查不到東西——而那正是他決定要不要投履歷的當下，手上唯一的
資訊。所以另外建了一份行政區（LGA）對照表。

**這只是查詢的入口，不是判定依據。** 判定永遠來自郵區，而一個行政區內的
郵區判定可以不一致（Sunshine Coast 就是 21 個算、1 個只有重建），所以區域
結果一律列出它涵蓋的每一個郵區。

`fetch/regions.py` 用 ABS 的 LGA 與 POA 兩個圖層對算：在每個郵區面內部灑
8×8 格點，看落在哪個行政區，佔到 10% 以上才算涵蓋。等於粗略地算面積重疊。

**為什麼不用現成的欄位或座標**，兩個都試過了：

- 地名 CSV 有 `lgaregion` 欄位，抽驗八個錯兩個（GOSFORD 標成 Hawkesbury、
  MOUNT ISA 標成 Carpentaria）。
- CSV 的座標也不能拿來做幾何運算。它給同一郵區底下大多數地名同一組座標，
  而那組座標本身可能是錯的——郵區 2000 的九個地名有八個共用 `151.2566`，
  那在雪梨 CBD 東邊五公里的海上。用它判斷會得到「2000 不在 Sydney 市內」。

單點判斷還有另一個問題：一個壞座標就能製造假歸屬（`CABOOLTURE BC` 的座標
在 900 公里外，會讓 Caboolture 被歸到 Charters Towers）。用面積取樣加比例
門檻兩個問題一起解決。`tests/test_regions.py` 拿這些踩過的坑當樣本釘住。

## CSS 分三層

```
src/tokens.css   顏色與尺寸的變數（三個主題區塊）
src/base.css     兩頁共用的外殼與元件（標頭、側欄區塊、卡片、搜尋結果列…）
src/map.css      州頁專屬（地圖、圖例、縮放、判定列）
src/portal.css   入口頁專屬（兩欄工具、各州卡片、產業對應表）
```

前兩份由 build 注入到兩個樣板的 `<style>` 開頭，樣板不要再宣告一次。

**為什麼要拆 `base.css`**：兩頁原本各自維護一份 CSS，27 個同名選擇器裡有 13 個
內容已經漂走（內距 22 vs 26、圓角 3 vs 4、`.stamp` 一個 `display:block` 一個
`margin`），而且有三個是**同名不同物**——`.card`／`.verdict`／`.bar` 在兩頁指
完全不同的元件，撞名讓它們根本沒辦法共用。入口頁那三個已改名成 `.statecard`／
`.answer`／`.mix`，標頭統一叫 `.topbar`。

`tests/test_tokens.py` 釘住三條規則：兩份頁面 CSS 不准有同名選擇器、不准重複
宣告 `base.css` 已有的、CSS 裡不准有沒人用的 class（改版面時最容易留下這種
東西，上一次改版就留了 14 條）。`@media` 裡的覆寫放行——州頁標頭在手機上會
黏頂收合，入口頁沒那個行為，那是合理的差異。

## 語言

介面有中英文，右上角切換，偏好記在 `localStorage` 的 `lang` 鍵。**預設中文**，
不看 `navigator.language`——猜的話瀏覽器是英文的人會拿到中文入口配英文地圖。
入口頁與各州地圖同源，共用同一個鍵，所以點進地圖會沿用上一頁的語言。

**用切換而不是分成兩份產出**——那樣 Artifact 數量會加倍，每份都要單獨設分享
權限，那個摩擦比多帶幾 KB 字串大得多。

### 所有介面文字都住在 `data/strings.json`

樣板不寫死任何一種語言的字。靜態文字用 `data-t`（屬性用 `data-t-ph`、
`data-t-aria`、`data-t-title`），JS 端用 `T('key', {vars})`。

這條規則是被咬過才立的：入口頁原本整頁寫死中文，結果那一頁根本沒有英文版，
連切換鈕都沒有，而且沒有任何東西會報錯。漏抽的兩種失敗都是靜的——`T()` 找不到
鍵會回傳鍵名本身（畫面上出現 `p_lede`），寫死的中文則在英文版底下繼續說中文。
所以 `tests/test_i18n.py` 把規則釘死：引用的鍵必須存在、不能有沒人用的鍵、
每個鍵中英都要有、兩種語言的 `{佔位符}` 要一致、英文不能夾中文，以及註解以外
不准出現中文。

同一個道理，**句子裡的事實一律從 `META` 帶入，不在樣板裡再寫一份**。出處那段
原本自己寫死了「頁面標示更新於 2026 年 8 月 18 日」，官網一更新那句就開始說謊。

產業的英文標籤與範圍**直接取自官網原文**，不是把中文再翻回英文——後者會二次
失真。頁面 `<title>` 由 JS 依語言改寫；HTML 裡的那份是 JS 跑之前的後備，刻意
中英並列。

## 檔案怎麼分

| | 是什麼 | 進版控？ |
|---|---|---|
| `src/tokens.css` | **設計 token 的唯一來源**——配色、字級尺度 | ✅ |
| `src/template.html`、`src/portal.html` | 只有結構，各約 100 行 | ✅ |
| `src/map.css`、`src/portal.css` | 樣式 | ✅ |
| `src/map.js`、`src/portal.js` | 程式，開頭有 `// @ts-check` | ✅ |
| `data/strings.json` | 中英文介面字串 | ✅ |
| `data/regions.json` | 行政區（LGA）→ 郵區對照表 | ✅ |
| `data/*.json` | 凍結的資料 | ✅ |
| `dist/*.html` | **建置產出** | ❌ 見下 |

### 為什麼 token 要抽出來

配色如果在兩個樣板裡各存一份，改的時候漏掉一邊**不會有任何錯誤訊息**，
測試也抓不到，只會變成「入口頁還是舊配色、點進地圖是新配色」。
這個專案已經差點發生過（改深色底色那次要同時動兩個檔案）。

現在是單一來源，而且 `tests/test_tokens.py` 會檢查：樣板裡不准再宣告 token、
三個主題區塊的 token 名稱必須一致、所有產出頁面的配色必須完全相同。

### 為什麼樣板要拆成三個檔

`jsconfig.json` 讓 VS Code 內建的 TypeScript 引擎檢查 `src/*.js`——**不需要
`npm install`，也沒有 build 步驟**，這個專案維持零外部相依。

`strict` 打開的重點是 `strictNullChecks`：`getElementById` 回傳
`HTMLElement | null`，這個專案已經因為引用被刪掉的元素而壞過兩次
（`statelbl`、`lgnone`）。JS 塞在 HTML 裡的話這個檢查跑不起來。

拆的是原始碼，**產出完全一樣**——build 會把三個檔合成單一自包含 HTML，
使用者拿到的東西沒有任何差別。

### 為什麼 dist 不進版控

它由 `data/` 加 `src/` 完全決定，刪掉重跑 `make all` 會得到一模一樣的檔案。
進版控的話，每改一行文案就重寫 4 MB，`git log` 會被淹沒——這個專案早期
16 個提交裡 dist 出現了 34 次。

要發佈 Artifact 時本機仍然會有這些檔案，只是不提交。

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
釘的是結構完整性，加上幾個短期內不該變的定錨事實。

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
  資料維持原始經緯度，前端啟動時不必逐點做字串運算（NSW 有 7 萬多個點）。
* **概化容差依郵區面積分級。** 地圖會依郵區大小聚焦，所以每個郵區被看到的
  比例尺跟它自己的大小成正比——大郵區永遠在低倍率被看到，對它們用細容差是
  白花點數；而市區郵區只有兩三公里，用同一個容差會被簡化到剩二十幾個點，
  邊緣變粗折線、相鄰郵區之間還會露出黑色縫隙（各自簡化後邊界不再貼合）。

  | 面積 | 容差 | 為什麼 |
  |---|---|---|
  | < 300 km² | 89 m | 市區近郊，會被放到縮放上限（畫面寬約 28 公里） |
  | 300–3000 | 166 m | 區域型郵區 |
  | ≥ 3000 | 444 m | 內陸大郵區，本來就只在低倍率看得到 |

  小的細一倍、大的放粗，四個州總點數反而**少 4.4%**（244811 → 233928）。

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

頁面上可以切換產業，預設是建築。產業決定要看哪幾張地區表：

| 產業 | 417 | 462 |
|---|---|---|
| 建築 | Regional | Regional（結果相同）|
| 農牧 | Regional | Regional |
| 礦業 | Regional | **462 沒有這一項產業** |
| 漁業與採珠 | Regional | **僅 Northern** |
| 林業伐木 | Regional | **僅 Northern** |
| 觀光餐旅 | Northern ＋ Remote | 同左 |

對應表在 `data/industries.json`，`build.py` 的 `DEFAULT_INDUSTRY` 指定預設值。
每個產業另外帶一段 `scope`（範圍摘要），顯示在選單下方——官方對每個產業的
範圍有明確定義，搞錯會被拒（例如農牧的二次加工不算：釀酒、碾磨、加工肉品）。

`scope` 是**官方定義與例示的中文摘要，不是官方文字**，所以頁面上一律附
「官方定義 →」連結。放在選單旁邊而不是另開一頁，是因為它的價值在「選行業
的那一秒」——移到別頁就不會有人看，等於白寫。

每個郵區存的是**它在五張地區表裡的成員資格**（位元遮罩），不是預先算好的
「算／不算」——判定取決於選了哪個產業，所以切換時只要換一組遮罩重新上色，
不必重新載入資料。六個產業裡有五個看同一張 Regional Australia 表，
只有觀光餐旅不同，所以切換時多數情況畫面不會變。
官方**沒有**這張表——它是頁面上的散文規則，人工整理來的，所以 `tests/test_industries.py`
釘得比較細。地區表本身則是抓取來的。

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

頁面只處理 417（Working Holiday），`data/postcodes.json` 也**只抓 417**。

⚠️ **不要拿這裡的判斷給 462 用。** 兩者的郵區表在 2026-08-18 那版是逐字相同的，
但**產業規則不同**：

* 462 **沒有礦業**這一項產業
* 462 的**漁業與林業只限 Northern Australia**（350 個郵區），417 是整個
  Regional（4519 個）——差 4169 個郵區

也就是說，一個 462 持有者照著這張圖去做漁業或林業，很可能做完才發現不算。
所以頁面在產業卡上直接寫「462 不適用」，而不是含糊帶過。

**為什麼連抓都不抓**：既然不呈現 462，抓它唯一的效果是 462 頁面改版型時
`fetch/postcodes.py` 的健檢會紅燈——而那對一個 417-only 的站台不是壞消息，
是假警報。假警報會讓人開始忽略通知，之後真的出事也不會有人看。要加回來
的話，`fetch/postcodes.py` 的 `PAGES` 補一行就行。

代價是失去了哨兵：官網哪天讓兩份分家，我們不會自動知道。這是知情的取捨——
反正頁面本來就不該給 462 用，分不分家都不改變那句警語。

`data/industries.json` 仍然保留兩種簽證的產業對應。那是人工整理的規則知識，
不是抓來的資料，「462 的漁業只限 northern」這件事不會因為我們不抓它就不成立。

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

`.github/workflows/pages.yml` 已經寫好：push 到 `main` 就建置、跑測試、部署。
建置**完全離線**（只讀 `data/`），不會連到 Home Affairs 或 ABS——資料更新
是手動跑 `make update` 之後提交的，CI 不會偷偷改資料。

上 Pages 之後有個額外好處：各頁之間可以用相對路徑互連（`qld.html`），
不必再繞 Artifact 的網址，也就沒有 iframe 沙箱那些限制。
`data/artifacts.json` 屆時換成相對路徑即可。

## 免責

**本站非官方網站。** 郵區範圍為 ABS 概化邊界，僅供判讀，非法定界線；
個別災害的宣告範圍與日期請對 [Disaster Assist](https://www.disasterassist.gov.au/find-a-disaster) 查證。
送件前一律以 [Home Affairs 官方頁面](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417/specified-work) 為準。

本站不構成移民協助（immigration assistance），個案問題請洽註冊移民代辦（MARA）
或法律執業者。

> 措辭的由來：原本頁首寫「非移民建議」，有兩個問題。一是會被讀成「非移民」＋
> 「建議」；二是 migration advice 並不是法規上的說法——Home Affairs 用的詞是
> **immigration assistance**，定義涵蓋「advising about a visa application or
> visa matter」，且只有註冊移民代辦、法律執業者或豁免者能提供。
>
> 現在拆成兩處：頁首講「這不是政府網站」加一個動作（送件前再上官網確認），
> 那是使用者最需要知道的；法規那句留在出處段落，那裡有空間講完整。

## 出處標示

含有澳洲統計局（ABS）依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
授權提供的資料：ASGS 2021 Postal Areas（POA）與 State and Territory（STE）。
