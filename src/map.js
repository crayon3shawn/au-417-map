// @ts-check
const DATA = __DATA__;
const PC = DATA.postcodes, POA = DATA.poa, CITIES = DATA.cities,
      META = DATA.meta, OTHER = DATA.other || {}, FLAGS = DATA.flags;

// 頁首出處與 417/462 等同性由資料決定，不寫死在樣板裡
document.getElementById('excluded').textContent = META.excluded_note;

// 導覽：Artifact 在沙箱 iframe 裡不能改上層網址，只能開新分頁。
// （之後放上 GitHub Pages 就能改成相對路徑原地跳轉。）
const navEl = document.getElementById('nav');
for(const n of (META.nav || [])){
  if(n.current){
    const s = document.createElement('span');
    s.className = 'here'; s.textContent = n.label;
    s.setAttribute('aria-current', 'page');
    navEl.appendChild(s);
  } else {
    const a = document.createElement('a');
    a.href = n.url;
    // 絕對網址代表在 Artifact 沙箱裡，只能開新分頁；相對路徑是同站台，原地跳轉即可
    if(/^https?:/.test(n.url)){ a.target = '_blank'; a.rel = 'noopener'; }
    a.className = n.home ? 'home' : '';
    a.textContent = n.home ? '← ' + n.label : n.label;
    navEl.appendChild(a);
  }
}

const COS = Math.cos(20 * Math.PI / 180);
const px = lon => lon * COS, py = lat => -lat;
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('map');
const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
// ---- 語言 ----
// 兩種語言的字串都在頁面裡，靠切換鈕換。分成兩份產出的話 Artifact 會加倍，
// 每份都要單獨設分享權限——那個摩擦比多帶幾 KB 字串大得多。
const S = META.strings;
const savedLang = (() => { try { return localStorage.getItem('lang'); } catch (_) { return null; } })();
// 預設中文，不猜 navigator.language。猜的話瀏覽器語言是英文的人會看到
// 中文入口頁配英文地圖；而且入口頁與這裡共用 localStorage 的 'lang'，
// 從入口頁點進來自然沿用同一個語言。
let lang = (savedLang === 'zh' || savedLang === 'en') ? savedLang : 'zh';

/** @param {string} key @param {Record<string,string|number>} [vars] */
function T(key, vars){
  let s = (S[key] && S[key][lang]) || (S[key] && S[key].zh) || key;
  if(vars) for(const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
const stateName = () => lang === 'zh' ? META.state_label : META.state_name_en;
const indLabel  = () => lang === 'zh' ? industry.label : (industry.label_en || industry.label);
const indScope  = () => lang === 'zh' ? industry.scope : (industry.scope_en || industry.scope);

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const [minLon, minLat, maxLon, maxLat] = META.bbox;
const x0=px(minLon), x1=px(maxLon), y0=py(maxLat), y1=py(minLat);
const padX=(x1-x0)*0.04, padY=(y1-y0)*0.04, padE=(x1-x0)*0.13;  // 東側多留海面給城市標籤
const VB={x:x0-padX, y:y0-padY, w:(x1-x0)+padX+padE, h:(y1-y0)+padY*2};
// 標籤還沒撐開之前的原始視野。fitLabels 只會把 VB 撐大，沒有這份底本就
// 沒辦法重算——反覆改視窗大小會讓地圖一次比一次小。
const VB0 = {...VB};
// 字級與點徑以「目標螢幕像素」定義，再換算成世界單位。
// 各州的視野比例不同（QLD 貼高度、NSW 貼寬度），寫死世界單位會讓字忽大忽小。
const PX = {lbl1:11.5, lbl2:9.5, dot1:3.2, dot2:2.3, halo:1.5, gap:5, trop:8.5, stray:2.2,
            ring:21, ringhalo:5};
const SZ = {};
let perUnit = 1;                  // k=1 時，一個世界單位有幾個螢幕像素
// 回傳有沒有量到真的尺寸。量到 0 時**不要**把 perUnit 定成 fallback——
// 城市標籤的世界單位大小是 PX/perUnit，perUnit 卡在 1 的話字會變成整片畫面
// 那麼大。載入初期、分頁在背景時都可能量到 0，交給 ResizeObserver 重試。
function sizeToViewport(){
  const r = svg.getBoundingClientRect();
  if(!r.width || !r.height) return false;
  perUnit = Math.min(r.width / VB.w, r.height / VB.h);   // preserveAspectRatio meet
  for(const key in PX) SZ[key] = PX[key] / perUnit;
  return true;
}
svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
svg.setAttribute('preserveAspectRatio','xMidYMid meet');
sizeToViewport();
const world = el('g',{}); svg.appendChild(world);
// 多邊形資料維持原始經緯度，投影交給這個 group 的 transform。
// 這樣 build 出來的 path 不必內嵌投影，啟動時也不用逐點換算。
const proj = el('g',{transform:`scale(${COS} -1)`}); 
const over = el('g',{});          // 需要在 JS 端算座標的東西（城市、小點、格線）
world.appendChild(proj); world.appendChild(over);

const grat = el('g',{class:'grat'});
for(let lon=138; lon<=154; lon+=2)
  grat.appendChild(el('line',{x1:px(lon),y1:VB.y,x2:px(lon),y2:VB.y+VB.h,'vector-effect':'non-scaling-stroke'}));
for(let lat=-10; lat>=-30; lat-=2)
  grat.appendChild(el('line',{x1:VB.x,y1:py(lat),x2:VB.x+VB.w,y2:py(lat),'vector-effect':'non-scaling-stroke'}));
over.appendChild(grat);

// ---- 郵區面 ----
// 每個郵區的旗標記的是「它在五張地區表裡的成員資格」，不是判定結果——
// 判定取決於選了哪個產業，所以切換產業只要換一組遮罩重新上色。
const BIT_FIRE = 8, BIT_DISASTER = 16, REBUILD = BIT_FIRE | BIT_DISASTER;

// 目前的地圖檢視：work（跟著產業走）／fire／flood。宣告要在 colorOf 之前——
// let 有 TDZ，而初始化時就會走到上色。
// 記在 localStorage：看過災害表的人多半下次還想從那裡看。
let view = 'work';
try {
  const v = localStorage.getItem('mapview');
  if(v === 'fire' || v === 'flood' || v === 'work') view = v;
} catch (_) {}

let industry = META.industries.find(i => i.key === META.industry) || META.industries[0];
const workMask = () => industry.mask;

// 三個互斥的答案。顏色就是答案本身，沒有第二個軸。
//   work    這個產業認可的地區表裡，一般工作就算
//   rebuild 不在那些表裡，但被宣告為災區，只有災後重建工作算
//   none    兩者皆非
const catOf = f => (f & workMask()) ? 'work' : (f & REBUILD) ? 'rebuild' : 'none';
// 答案面板上那一行判定字。**永遠講到底是哪一張表**，不跟著地圖的檢視切換走。
// 地圖可以只給三色（概覽），但查單一郵區時「只有災後重建工作算」是不夠的：
// 建築的 638 個「只有重建算」郵區裡有 348 個（55%）只落在其中一張表上，而
// 兩張表在官網是各自獨立的規則。併起來講等於把該走哪條路藏起來。
const sayOf = f =>
    (f & workMask())                    ? T('cat_work', {ind: indLabel()})
  : (f & BIT_FIRE) && (f & BIT_DISASTER) ? T('cat_both')
  : (f & BIT_FIRE)                      ? T('cat_fire_only')
  : (f & BIT_DISASTER)                  ? T('cat_flood_only')
                                        : T('cat_none');

// 地圖一次只畫一張表，所以只有兩色：在這張表上、不在。
// 三張表各有自己的「在」色，檢視之間才分得出來——但同一個畫面上永遠只有兩種。
const VIEW_BIT   = {work:0, fire:BIT_FIRE, flood:BIT_DISASTER};   // work 用產業遮罩
const VIEW_COLOR = {work:'var(--c-work)', fire:'var(--c-fire)', flood:'var(--c-flood)'};
const inView = f => !!(f & (view === 'work' ? workMask() : VIEW_BIT[view]));
function colorOf(f){ return inView(f) ? VIEW_COLOR[view] : 'var(--c-none)'; }

// 詳情面板與搜尋結果的色點走的是**判定**，不是目前的檢視：那裡問的是
// 「這個郵區算不算」，跟你正在看哪一張表無關。切換檢視不該讓答案變色。
function verdictColor(f){
  if(f & workMask()) return 'var(--c-work)';
  if(!(f & REBUILD)) return 'var(--c-none)';
  return ((f & BIT_FIRE) && (f & BIT_DISASTER)) ? 'var(--c-both)'
       : (f & BIT_FIRE) ? 'var(--c-fire)' : 'var(--c-flood)';
}

const areasG = el('g',{}); proj.appendChild(areasG);    // 郵區面（原始經緯度）
const strayG = el('g',{}); over.appendChild(strayG);    // 沒有邊界面的郵區，以小點代替
// 選取環。郵區小到在畫面上只有幾個像素時，白色描邊根本看不出來，而放大到
// 看得見又會讓概化邊界露餡（見 MIN_SPAN）。所以改成標一個畫面尺寸固定的環，
// 位置永遠看得到，地圖也不必放到失真。
const ringG = el('g',{class:'ring'}); over.appendChild(ringG);
const ringHalo = el('circle',{class:'ringhalo'}); ringG.appendChild(ringHalo);
const ringDot  = el('circle',{class:'ringline'}); ringG.appendChild(ringDot);
ringG.setAttribute('visibility','hidden');

// 選取的郵區在世界座標下的最長邊。0 代表沒有選取或量不出來（信箱型郵區）。
let selSize = -1;

// 小於這個像素數就加標選取環。40px 大約是一眼掃過去還找得到的下限。
const RING_BELOW = 40;

// 環該不該出現取決於「目前畫面上有多大」，所以縮放與改變視窗大小都要重算，
// 由 apply() 呼叫。這裡只做算術，不碰 getBBox——那是每幀都會跑的路徑。
function updateRing(){
  const show = selSize === 0 || (selSize > 0 && selSize * k * perUnit < RING_BELOW);
  ringG.setAttribute('visibility', show ? 'visible' : 'hidden');
}
const byPc = new Map();
const flagOf = new Map(Object.entries(FLAGS).map(([pc, f]) => [+pc, f]));

for(const pc of Object.keys(POA).map(Number).sort((a,b)=>a-b)){
  const f = flagOf.get(pc) || 0;
  const cat = catOf(f);
  const node = el('path',{class:'poa ' + cat, d:POA[pc], fill:colorOf(f),
    'vector-effect':'non-scaling-stroke', 'pointer-events':'all'});
  node.__pc = pc;
  node.__f = f;
  areasG.appendChild(node);
  byPc.set(pc, {node, f});
}

// 合格但 ABS 沒有對應面的郵區，用小點標出概略位置
for(const rec of PC){
  const [pc,lon,lat] = rec;
  const d = byPc.get(pc);
  if(d){ d.rec = rec; continue; }
  const node = el('circle',{class:'stray', cx:px(lon), cy:py(lat), r:SZ.stray,
    'vector-effect':'non-scaling-stroke'});
  node.__pc = pc;
  strayG.appendChild(node);
  byPc.set(pc, {node, f:rec[3], rec, stray:true});
}

// ---- 南回歸線 ----
// 南回歸線只在該州確實跨越時才畫（NSW 整個在它以南）
const TROPIC = -23.4362, tropY = py(TROPIC);
let tlbl = null;
if(minLat < TROPIC && TROPIC < maxLat){
  over.appendChild(el('line',{class:'tropic',x1:VB.x,y1:tropY,x2:VB.x+VB.w,y2:tropY,'vector-effect':'non-scaling-stroke'}));
  tlbl = el('text',{class:'tropiclbl'});
  tlbl.textContent=T('tropic');
  over.appendChild(tlbl);
}

// ---- 城市 ----
const cityG = el('g',{}); over.appendChild(cityG);
const cityNodes = [];
// 窄螢幕只留英文名：「Sunshine Coast 陽光海岸」在 375px 上佔 111px，
// 接近螢幕三分之一，一定會被切掉。而且字級是以螢幕像素定義再換算成世界單位的，
// 所以「撐開視野」會讓字級的世界單位跟著變大，追不上、收斂不了。
const shortName = n => n.replace(/\s+[\u4e00-\u9fff][^\s]*$/, '');
const narrow = () => svg.getBoundingClientRect().width < 560;
// 英文介面下中文市名沒有意義，一律拿掉；中文介面才看螢幕寬度決定要不要縮。
const cityLabel = n => (lang === 'en' || narrow()) ? shortName(n) : n;

for(const [name, lon, lat, tier, side] of CITIES){
  const g = el('g',{class:'city' + (tier===2 ? ' t2' : '')});
  const cx = px(lon), cy = py(lat);
  g.appendChild(el('circle',{cx, cy, r:tier===1?SZ.dot1:SZ.dot2, 'stroke-width':SZ.halo}));
  const t = el('text',{x:cx+SZ.gap*side, y:cy+SZ.lbl1*0.26, 'text-anchor': side<0 ? 'end' : 'start'});
  t.textContent = cityLabel(name);
  g.appendChild(t);
  g.__c = {cx, cy, t, dot:g.firstChild, tier, side, name};
  cityG.appendChild(g);
  cityNodes.push(g);
}
// ---- 飛地標記 ----
// ACT 整個被 NSW 包住，而郵區面逐州抓，所以那裡是一塊空白。空白用的是背景色
// 不是「不算」的灰，讀起來像資料壞掉。放一個標記把它變成「有標示、有解釋的
// 區域」——但**不畫界線**，理由寫在 build.py 的 ENCLAVES。
// 虛線底線跟入口頁「沒有地圖」的州用同一套語彙（stroke-dasharray）。
// 文案查表用字面鍵，不要拼字串：i18n 測試掃的是字面上的 T('…')，
// 拼出來的鍵會繞過「鍵存不存在」與「有沒有孤兒鍵」兩道檢查。
// 多一個飛地就多一筆，明寫比動態組合安全。
const ENC_TEXT = {
  act: () => ({mark: T('enc_act_mark'), say:  T('enc_act_say'), body: T('enc_act_body'),
               fire: T('enc_act_fire'), why:  T('enc_act_why')}),
};

const encG = el('g',{class:'enclaves'}); over.appendChild(encG);
const encNodes = [];
for(const e of (META.enclaves || [])){
  const g = el('g',{class:'enc'});
  const t = el('text',{x:px(e.lon), y:py(e.lat), 'text-anchor':'middle'});
  t.textContent = ENC_TEXT[e.key]().mark;
  g.appendChild(t);
  g.__e = {t, key:e.key};
  encG.appendChild(g);
  encNodes.push(g);
}

// 選取環要蓋在城市標記上面——市區郵區的環幾乎一定會跟城市點重疊，
// 被蓋住就失去意義。over 的子節點按加入順序疊，所以搬到最後。
over.appendChild(ringG);

// ---- 平移縮放 ----
let k=1, tx=0, ty=0;
function apply(){
  world.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
  for(const g of cityNodes){
    const c = g.__c;
    const fs = (c.tier===1 ? SZ.lbl1 : SZ.lbl2)/k;
    c.dot.setAttribute('r', (c.tier===1?SZ.dot1:SZ.dot2)/k);
    c.dot.setAttribute('stroke-width', SZ.halo/k);
    c.t.setAttribute('font-size', fs);
    c.t.setAttribute('stroke-width', SZ.halo*1.6/k);
    c.t.setAttribute('x', c.cx + SZ.gap*c.side/k);
    c.t.setAttribute('y', c.cy + SZ.lbl1*0.26/k);
    if(c.tier===2) g.classList.toggle('on', k >= 2);
  }
  // 飛地標記的字級也是螢幕像素定義的，跟城市一樣要除以 k
  for(const g of encNodes){
    g.__e.t.setAttribute('font-size', SZ.lbl1 / k);
    g.__e.t.setAttribute('stroke-width', SZ.halo * 1.6 / k);
  }
  for(const s of strayG.children) s.setAttribute('r', SZ.stray/k);
  ringHalo.setAttribute('r', SZ.ring/k);
  ringDot.setAttribute('r', SZ.ring/k);
  ringHalo.setAttribute('stroke-width', SZ.ringhalo/k);
  updateRing();          // 放大到郵區本身夠明顯之後，環就該退場
  if(tlbl){
    tlbl.setAttribute('font-size', SZ.trop/k);
    tlbl.setAttribute('x', VB.x + SZ.gap/k);
    tlbl.setAttribute('y', tropY - SZ.gap*0.7/k);
  }
}
apply();

// 標籤寬度要等字型載入才量得準。溢出視野就把視野撐開，
// 免得像 Byron Bay 這種在最東端的地名被切掉。
// 標籤的字級是以螢幕像素定義再換算成世界單位的，所以改變視窗大小會改變它們
// 在世界座標裡的大小——視野必須跟著重算，否則最東邊的地名（Sunshine Coast、
// Gold Coast）會被切在地圖右緣。
//
// 每次都從 VB0 重來，不是在現有的 VB 上繼續加：這個函式只會把視野撐大，
// 累加下去縮放視窗幾次地圖就縮成一小塊了。
function fitLabels(){
  if(!cityG.getBBox) return;
  // 使用者已經平移或縮放時不動 viewBox——改了畫面會整個跳掉，而那個狀態下
  // 標籤切在邊緣本來就不重要（他正在看局部）。
  if(k !== 1 || tx !== 0 || ty !== 0) return;
  Object.assign(VB, VB0);
  svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
  if(!sizeToViewport()) return;            // 還沒排版好，等 ResizeObserver 再來

  const bb = cityG.getBBox();
  // 邊距留兩倍：只留一倍的話最東邊的地名會貼齊視野邊緣，看起來像被切掉。
  const pad = SZ.gap * 2;
  if(bb.x + bb.width > VB.x + VB.w) VB.w = bb.x + bb.width - VB.x + pad;
  if(bb.x < VB.x){ const d = VB.x - bb.x + pad; VB.x -= d; VB.w += d; }
  if(bb.y < VB.y){ const d = VB.y - bb.y + pad; VB.y -= d; VB.h += d; }
  if(bb.y + bb.height > VB.y + VB.h) VB.h = bb.y + bb.height - VB.y + pad;

  svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
  sizeToViewport();
  apply();
}
// settleView 自己上次設定的視野。用來分辨「畫面還是我們擺的」跟「使用者已經
// 平移縮放過」——後者不能把視野搶回去。
let autoView = null;
// withZoom=false 時只做「完整放進窗格」。填滿窗格的放大要等版面尺寸定下來才能
// 算——在還沒定型的尺寸上算出來的平移量會把整張圖推到畫面外，看起來像沒載入。
// 完整放進去的視野則是由 viewBox 決定的，任何尺寸下都畫得對。
function settleView(withZoom){
  sizeMapPane();
  const untouched = !autoView || (k === autoView.k && tx === autoView.tx && ty === autoView.ty);
  // fitLabels 只在未縮放時運作（縮放中改 viewBox 畫面會跳），所以先歸零
  if(untouched){ k = 1; tx = 0; ty = 0; apply(); }
  fitLabels();
  if(untouched && withZoom) initialView();
  autoView = {k, tx, ty};
}
if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => settleView(false));
else settleView(false);
// resize 事件會連發，重算視野要量 getBBox，所以壓一下頻率
let resizeTimer = 0, lastVW = innerWidth;
function onResize(){
  sizeToViewport();
  relabelMapText();
  apply();
  // 手機上「只有高度變、寬度沒變」幾乎一定是鍵盤或網址列，不是版面真的變了。
  // 那時重算視野會讓地圖在使用者眼前縮一下——正是查詢打字時最不該發生的事。
  // 轉向會同時改寬度，所以真的需要重算的情況不會被這一行擋掉。
  const widthChanged = innerWidth !== lastVW;
  lastVW = innerWidth;
  if(!widthChanged && innerWidth <= 900) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => settleView(true), 120);
}
addEventListener('resize', onResize);

// 只靠 window resize 不夠：元素從「沒有尺寸」變成「有尺寸」不會發 resize 事件
// （載入初期、分頁在背景、手機改窗格高度都是）。那一刻沒有重算的話，perUnit
// 會一直是載入時量到的值，整張圖的字級與點大小全部錯掉。
if(typeof ResizeObserver === 'function'){
  const pane = document.getElementById('mapwrap');
  let lastW = 0, lastH = 0, roTimer = 0;
  if(pane) new ResizeObserver(() => {
    if(!sizeToViewport()) return;          // 還是 0，等下一次
    relabelMapText();
    apply();
    const r = pane.getBoundingClientRect();
    // 尺寸沒真的變就別重算——settleView 會動窗格高度，不擋的話會自己觸發自己。
    if(Math.abs(r.width - lastW) < 2 && Math.abs(r.height - lastH) < 2) return;
    lastW = r.width; lastH = r.height;
    clearTimeout(roTimer);
    roTimer = setTimeout(() => settleView(true), 80);
  }).observe(pane);
}

// 地圖上所有會隨語言變的文字，集中在這裡重寫。
// 原本只有城市標籤在管，結果南回歸線的標籤在英文版一直掛著中文——它是繪製
// 時設定一次就沒人再碰的。飛地標記目前剛好兩種語言都是「ACT」才沒露餡。
// 全部收在同一個函式裡，將來多畫一個帶文字的東西才不會又漏掉一個。
function relabelMapText(){
  for(const g of cityNodes) g.__c.t.textContent = cityLabel(g.__c.name);
  if(tlbl) tlbl.textContent = T('tropic');
  for(const g of encNodes) g.__e.t.textContent = ENC_TEXT[g.__e.key]().mark;
}

function toBase(e){
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function zoomAt(bp, nk){
  nk = Math.max(1, Math.min(MAX_K, nk));
  tx = bp.x - nk*((bp.x - tx)/k);
  ty = bp.y - nk*((bp.y - ty)/k);
  k = nk; apply();
}
svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(toBase(e), k*Math.pow(1.0016, -e.deltaY)); }, {passive:false});

// 觸控：一指平移、兩指縮放。
// CSS 的 touch-action:none 關掉了瀏覽器原生手勢，所以捏合必須自己實作——
// 否則手機上只能用 +／− 按鈕縮放。
const pts = new Map();          // pointerId -> 目前的螢幕座標
let drag = null, pinch = null;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid  = (a, b) => ({clientX:(a.x + b.x)/2, clientY:(a.y + b.y)/2});

function startPinch(){
  const [a, b] = [...pts.values()];
  pinch = {d: dist(a, b), k, base: toBase(mid(a, b)),
           tx0: tx, ty0: ty, m0: mid(a, b)};
  drag = null;
}

svg.addEventListener('pointerdown', e => {
  pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
  // 補捉失敗不該中斷後面的平移／縮放設定
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  if(pts.size === 2){ startPinch(); return; }
  if(pts.size === 1){
    drag = {x:e.clientX, y:e.clientY, tx, ty, moved:false};
    svg.classList.add('drag');
  }
});

svg.addEventListener('pointermove', e => {
  if(!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, {x:e.clientX, y:e.clientY});

  if(pinch && pts.size >= 2){
    const [a, b] = [...pts.values()];
    const d = dist(a, b);
    if(pinch.d > 0 && d > 0){
      // 縮放同時跟著兩指中點移動，手感才對
      const nk = Math.max(1, Math.min(MAX_K, pinch.k * (d / pinch.d)));
      const m = mid(a, b), now = toBase(m);
      tx = now.x - nk * ((pinch.base.x - pinch.tx0) / pinch.k);
      ty = now.y - nk * ((pinch.base.y - pinch.ty0) / pinch.k);
      k = nk; apply();
    }
    return;
  }
  if(!drag) return;
  const a = toBase(e), b = toBase({clientX:drag.x, clientY:drag.y});
  if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y) > 3) drag.moved = true;
  tx = drag.tx + (a.x-b.x); ty = drag.ty + (a.y-b.y); apply();
});

function release(e){
  pts.delete(e.pointerId);
  if(pts.size < 2) pinch = null;
  if(pts.size === 0){
    svg.classList.remove('drag');
    setTimeout(() => { drag = null; }, 0);
  } else if(pts.size === 1){
    // 放開一指後接著單指平移，不要跳一下
    const [only] = [...pts.values()];
    drag = {x:only.x, y:only.y, tx, ty, moved:true};
  }
}
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
const centre = () => ({x:VB.x+VB.w/2, y:VB.y+VB.h/2});
document.getElementById('zin').onclick  = () => zoomAt(centre(), k*1.6);
document.getElementById('zout').onclick = () => zoomAt(centre(), k/1.6);
document.getElementById('zrst').onclick = () => { k=1; tx=0; ty=0; apply(); };
// 縮放上限用「畫面上至少要看得到多寬的地面」定義，不用固定倍率——各州的
// viewBox 大小差好幾倍，固定 40 倍在面積大的州放不夠（市區郵區只有兩三
// 公里，全州上千公里），面積小的州又放過頭。
// 為什麼要有下限：邊界是用 maxAllowableOffset=0.0015 度（約 165 公尺）抓的
// 概化圖層。放得太大時那個誤差會變成幾十像素的鋸齒，相鄰郵區之間還會冒出
// 黑色縫隙——簡化後兩邊的邊界不再貼合。看起來像資料壞掉，比看不清楚更糟。
//
// 0.25 世界單位約 28 公里，這時 1 像素約 48 公尺，概化誤差不到 4 像素，
// 邊界還是乾淨的。小到這樣還看不清楚的郵區（市區那些）不靠放大解決，
// 改用畫面尺寸固定的選取環標位置（見 markSelection）。
const MIN_SPAN = 0.25;                          // 世界單位，約 28 公里
const MAX_K = Math.max(40, VB.w / MIN_SPAN);

// 置中到指定的世界座標與縮放倍率。倍率沿用平移縮放的上下限。
function centreOn(cx, cy, nk){
  k = Math.max(1, Math.min(MAX_K, nk));
  tx = (VB.x+VB.w/2) - k*cx;
  ty = (VB.y+VB.h/2) - k*cy;
  apply();
}

// 郵區大小差好幾個數量級——內城區只有幾公里，內陸一個郵區比台灣還大。
// 固定倍率一定有一邊不對：小的看不到，大的爆框。所以依實際範圍算。
// 目標是讓郵區佔視野約六成，留點周邊當參考。
const FOCUS_FILL = 0.6;
// 把一個經緯度 bbox 放進視野。areasG 掛在 proj 底下（transform 是
// scale(COS,-1)），所以 getBBox() 拿到的是經緯度，要自己換算到 px/py。
function focusOnLonLatBox(x0, y0, x1, y1){
  const w = (x1 - x0) * COS, h = y1 - y0;
  if(!w || !h) return false;
  centreOn((x0 + x1) / 2 * COS, -(y0 + y1) / 2,
           Math.min(VB.w * FOCUS_FILL / w, VB.h * FOCUS_FILL / h));
  return true;
}

function focusOnNode(node, fallback){
  // areasG 掛在 proj 底下，proj 的 transform 是 scale(COS,-1)，
  // 所以 getBBox() 拿到的是經緯度，要自己換算到 px/py 空間。
  let bb;
  try { bb = node.getBBox(); } catch(_) { bb = null; }
  if(!bb || !bb.width || !bb.height) return fallback();
  focusOnLonLatBox(bb.x, bb.y, bb.x + bb.width, bb.y + bb.height);
}

// ---- 圖例：數量與細分開關 ----
let selNode = null, selPc = null;

const vBtn = {work:  document.getElementById('v-work'),
              fire:  document.getElementById('v-fire'),
              flood: document.getElementById('v-flood')};
const indSel = document.getElementById('ind');
const indNote = document.getElementById('indnote');

const AREA_NAME = {1:'Remote and Very Remote', 2:'Northern Australia', 4:'Regional Australia'};
function areasOf(mask){
  return Object.keys(AREA_NAME).map(Number).filter(b => mask & b).map(b => AREA_NAME[b]);
}

for(const i of META.industries){
  const o = document.createElement('option');
  o.value = i.key; o.textContent = i.label;
  if(i.key === industry.key) o.selected = true;
  indSel.appendChild(o);
}

// 重上色只該換「判定」那一類 class。整個 setAttribute('class', …) 蓋掉的話，
// 選取（sel）與行政區框選（inreg／outreg）會一起被洗掉——換產業時框選消失，
// 而且載入時只要 applyLang 排在讀網址之後，框選根本畫不出來。
const CAT_CLASS = ['work', 'rebuild', 'none'];
function recolour(s, f){
  s.classList.remove(...CAT_CLASS);
  s.classList.add(catOf(f));            // class 仍是判定，樣式（hover／選取）靠它
  s.setAttribute('fill', colorOf(f));
}

function applyIndustry(){
  for(const s of areasG.children) recolour(s, byPc.get(s.__pc).f);
  for(const s of strayG.children) s.setAttribute('fill', colorOf(byPc.get(s.__pc).f));
  const c = industry.counts;
  const tables = areasOf(industry.mask).join(' + ');
  // 圖例跟著檢視走：在這張表上幾個、不在幾個，加上這張表的官方名稱。
  // 官方名稱一定要出現——選項用「一般工作／叢林大火／天災」這種白話命名，
  // 使用者不必先懂術語就能選，但要去核對官網時得知道那張表叫什麼。
  const inN  = view === 'work' ? c.work : view === 'fire' ? c.fire_all : c.flood_all;
  const label = view === 'work' ? T('cat_work', {ind: indLabel()})
              : view === 'fire' ? T('leg_in_fire') : T('leg_in_flood');
  const src   = view === 'work' ? T('tbl_work', {tables})
              : view === 'fire' ? T('tbl_bushfire') : T('tbl_disaster');
  const rIn = document.getElementById('r-in');
  rIn.style.setProperty('--sw', VIEW_COLOR[view]);
  document.getElementById('mini-in').style.setProperty('--sw', VIEW_COLOR[view]);
  document.getElementById('n-in-label').textContent = label;
  document.getElementById('n-in').textContent  = inN;
  document.getElementById('n-out').textContent = c.total - inN;
  document.getElementById('lgsrc').textContent = src;
  // 只在「一般工作」檢視出現：那裡才有「我是不是漏了另一條路」這個疑問。
  // 數的是**不在工作名單上**的那些郵區裡，有多少在災害表上——所以要用
  // fire_only + fire_and_flood，不是 fire_all（後者含本來就算的）。
  const hint = document.getElementById('lghint');
  hint.textContent = '';
  if(view === 'work'){
    const also = [['fire',  c.fire_only  + c.fire_and_flood, 'leg_also_fire'],
                  ['flood', c.flood_only + c.fire_and_flood, 'leg_also_flood']];
    for(const [v, n, key] of also){
      if(!n) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = T(key, {n}) + ' →';
      btn.addEventListener('click', () => setView(v));
      hint.appendChild(btn);
    }
  }
  // 範圍是官方定義的中文摘要，不是官方文字，所以一定要附原文連結讓人核對。
  // 標題列只標「這張卡在講什麼」，適用的郵區表放在連結上——連結本來就是要
  // 帶人去看那張表，表名放在那裡比放在標題更貼近它的用途。
  indNote.innerHTML =
    `<div class="hd">${esc(T('industry_table'))}</div>`
    + (indScope()
        ? `<div class="bd">${esc(indScope())} `
          + `<a href="${META.source_url}" target="_blank" rel="noopener">${esc(T('official_def', {tables}))}</a></div>`
        : '');
  document.getElementById('subind').textContent = `${T('showing')}: ${indLabel()}`;
  document.getElementById('fact1').textContent = T('fact1_body', {ind: indLabel(), tables});
  if(selPc !== null) select(selPc);
  else renderRegionPanel();
}

indSel.addEventListener('change', () => {
  industry = META.industries.find(i => i.key === indSel.value) || industry;
  // 產業要一起帶進網址：判定取決於它，只帶 pc 貼給別人會看到不同的答案
  writeUrlState(industry.key, selPc);
  applyIndustry();
});
// 畫面狀態與重新上色分開：初始化時只能畫狀態，不能順手呼叫 applyIndustry()
// ——它會走到 renderRegionPanel()，而 regPcs 要到檔案後面才宣告，在這裡碰它
// 就是 TDZ 錯誤。上色由後面既有的初始化流程負責。
function paintView(){
  for(const k in vBtn) vBtn[k].setAttribute('aria-pressed', String(k === view));
}
function setView(v){
  view = v;
  paintView();
  try { localStorage.setItem('mapview', v); } catch (_) {}
  applyIndustry();
}
for(const k in vBtn) vBtn[k].addEventListener('click', () => setView(k));
paintView();

// ---- 詳情 ----
const detail = document.getElementById('detail');

function clearSel(){
  if(selNode){ selNode.classList.remove('sel'); selNode = null; }
  selSize = -1;
  ringG.setAttribute('visibility','hidden');
}

function markSelection(d){
  if(!d || !d.rec){ selSize = -1; updateRing(); return; }
  // 環要對準「被框起來的那塊多邊形」，不能用 rec 的座標。rec 是地名點
  // （郵政地名的位置），跟多邊形的幾何中心可以差好幾公里——郵區 2000 就差
  // 4.4 公里。縮小時看不出來，放大到上百倍就整個跑掉。
  // 信箱型郵區沒有多邊形，只有一個點，那才用 rec。
  selSize = 0;
  let cx = px(d.rec[1]), cy = py(d.rec[2]);
  if(!d.stray && d.node){
    let bb; try { bb = d.node.getBBox(); } catch(_) { bb = null; }
    if(bb && bb.width){
      // getBBox() 拿到的是經緯度（areasG 掛在 proj 底下），要換算到 px/py
      selSize = Math.max(bb.width*COS, bb.height);
      cx = (bb.x + bb.width/2) * COS;
      cy = -(bb.y + bb.height/2);
    }
  }
  for(const c of ringG.children){ c.setAttribute('cx', cx); c.setAttribute('cy', cy); }
  updateRing();
}

// 飛地的說明。它不是郵區，所以不走 select()——沒有旗標、沒有選取環、
// 也不進網址（網址的 pc 參數只認郵遞區號）。
function showEnclave(key){
  selPc = null;
  clearSel();
  markSelection(null);
  detail.style.setProperty('--vc', 'var(--c-none)');
  detail.classList.add('no');
  const x = ENC_TEXT[key]();
  detail.innerHTML =
    `<div class="ans"><span class="pcn">${esc(x.mark)}</span>`
    + `<span class="say">${esc(x.say)}</span></div>`
    + `<div class="bd"><div class="sub">${esc(x.body)}</div>`
    + `<div class="note">${esc(x.fire)}</div>`
    + `<div class="note">${esc(x.why)}</div></div>`;
}

function select(pc){
  selPc = pc;
  writeUrlState(industry.key, pc);
  clearSel();
  const d = byPc.get(pc);
  if(d){ d.node.classList.add('sel'); selNode = d.node; d.node.parentNode.appendChild(d.node);
         markSelection(d); }

  if(!d || !d.rec){
    // 這個郵區存在但不在本州的合格清單上。還是給它同一個版面——使用者問的
    // 是「4000 算不算」，答案是「不算」，不該因為它不在清單上就變成一段文字。
    const names = OTHER[pc];
    const where = names ? `（${esc(names.join('、'))}）` : '';
    detail.style.setProperty('--vc', 'var(--c-none)');
    detail.classList.add('no');
    detail.innerHTML =
      `<div class="ans"><span class="pcn">${pc}</span>` +
      `<span class="say">${esc(T('cat_none'))}</span></div>` +
      `<div class="bd"><div class="verdict no"><span class="dot"></span><span>` +
      `${esc(T('v_not_listed',{pc, where, state: stateName(), ind: indLabel()}))}` +
      `</span></div></div>`;
    return;
  }

  const [p, , , f, names] = d.rec;
  const shown = names.slice(0, 6);
  const more = names.length > shown.length ? T('more_areas', {n: names.length}) : '';
  const rows = [];
  const ind = indLabel();
  // 一般工作那一列不再接副標——「這個郵區在{ind}適用的地區名單上」
  // 只是把標題再講一次，沒有新資訊，只有佔位置。
  if(f & workMask()) rows.push(`<div class="verdict" style="--vc:var(--c-work)"><span class="dot"></span><span><b>${esc(T('v_work_yes',{ind}))}</b></span></div>`);
  else rows.push(`<div class="verdict no"><span class="dot"></span><span><b>${esc(T('v_work_no',{ind}))}</b></span></div>`);
  // 表名要寫出來：送件時官方問的就是這個。
  if(f & BIT_FIRE) rows.push(`<div class="verdict" style="--vc:var(--c-fire)"><span class="dot"></span><span><b>${esc(T('v_fire'))}</b><br><em class="tbl">${esc(T('tbl_bushfire'))}</em><br>${esc(T('v_fire_sub'))}</span></div>`);
  // 天災那一列沒有副標：原本那句只講了一個 2021 年的日期門檻（現在找工作的人
  // 永遠通過）跟一個 ImmiAccount 表單欄位（送件時才用得到）。官方對「哪些
  // 工作算天災重建」的範圍定義沒有可引的來源，寧可留白也不編。
  if(f & BIT_DISASTER) rows.push(`<div class="verdict" style="--vc:var(--c-flood)"><span class="dot"></span><span><b>${esc(T('v_flood'))}</b><br><em class="tbl">${esc(T('tbl_disaster'))}</em></span></div>`);
  if(!(f & workMask()) && (f & REBUILD)) rows.push(`<div class="note">${esc(T('v_rebuild_only',{ind}))}</div>`);
  if(d.stray) rows.push(`<div class="note">${esc(T('v_no_polygon'))}</div>`);

  // 判定色走色帶與判定字，不上郵遞區號本身（理由在 base.css 的 .fbox 段）
  detail.style.setProperty('--vc', verdictColor(f));
  detail.classList.toggle('no', catOf(f) === 'none');
  detail.innerHTML =
    `<div class="ans"><span class="pcn">${p}</span>` +
    `<span class="say">${esc(sayOf(f))}</span>` +
    `<span class="loc">${esc(shown.join(lang === 'zh' ? '、' : ', '))}${more}</span></div>` +
    `<div class="bd">${rows.join('')}</div>`;
}

const tip = document.getElementById('tip'), wrap = document.getElementById('mapwrap');
// e.target 在這裡永遠是 svg 本身，不是被點到的那塊郵區——平移與捏合縮放用了
// svg.setPointerCapture()，而指標捕捉會把後續的 click 重新導向到捕捉元素。
// 所以要用座標反查。這是既有的 bug：在地圖上點郵區一直沒有反應（滑鼠移過去
// 的提示框沒事，因為 pointerover 發生在 pointerdown 之前，那時還沒有捕捉）。
const at = e => document.elementFromPoint(e.clientX, e.clientY);
const hit = e => { const el = at(e); return (el && el.closest) ? el.closest('.poa, .stray') : null; };
svg.addEventListener('click', e => {
  if(drag && drag.moved) return;
  const el = at(e);
  // 飛地標記要先於郵區判斷：它畫在郵區上層，點到它就是要看它的說明
  const enc = (el && el.closest) ? el.closest('.enc') : null;
  if(enc && enc.__e){ showEnclave(enc.__e.key); return; }
  const t = hit(e); if(t) select(t.__pc);
});
svg.addEventListener('pointerover', e => {
  const t = hit(e); if(!t) return;
  const d = byPc.get(t.__pc);
  const names = (d && d.rec) ? d.rec[4] : OTHER[t.__pc];
  tip.textContent = t.__pc + (names ? '  ' + names[0] : '');
  tip.classList.add('on');
});
svg.addEventListener('pointerout', e => { if(hit(e)) tip.classList.remove('on'); });
svg.addEventListener('pointermove', e => {
  if(!tip.classList.contains('on')) return;
  const r = wrap.getBoundingClientRect();
  tip.style.left = (e.clientX - r.left + 13) + 'px';
  tip.style.top  = (e.clientY - r.top  - 30) + 'px';
});

const q = document.getElementById('q');
const hits = document.getElementById('hits');
const qhint = document.getElementById('qhint');

// 地名 -> 郵區。多數人知道自己在哪個鎮，不知道郵區號碼。
const byName = [];
for(const rec of PC) for(const nm of rec[4]) byName.push([nm.toLowerCase(), rec[0], nm]);

const CAT_COLOR = {work:'var(--c-work)', rebuild:'var(--c-rebuild)', none:'var(--c-none)'};

function clearHits(){ hits.innerHTML = ''; }

function goto(pc){
  clearHits();
  clearRegion();
  select(pc);
  const d = byPc.get(pc);
  if(!d || !d.rec) return;
  // 沒有對應面的郵區（信箱型）只有一個點，量不出範圍，退回固定倍率
  const toPoint = () => centreOn(px(d.rec[1]), py(d.rec[2]), Math.max(k, 8));
  if(d.node && !d.stray) focusOnNode(d.node, toPoint);
  else toPoint();
  markSelection(d);        // 要在縮放之後判斷，畫面尺寸取決於 k
}

function showHits(list, term){
  clearHits();
  // 候選清單排在答案盒子後面。這時候使用者還沒選，留著上一次的答案會讓人
  // 以為那就是結論——打「gosford」卻看到上一次查的「黃金海岸」就是這樣來的。
  clearSel(); selPc = null;
  detail.style.removeProperty('--vc');
  detail.classList.remove('no');
  detail.innerHTML = `<div class="empty">${esc(T('detail_empty'))}</div>`;
  for(const [pc, nm] of list.slice(0, 30)){
    const f = (byPc.get(pc) || {}).f || 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.style.setProperty('--hc', CAT_COLOR[catOf(f)]);
    b.innerHTML = `<em></em><b>${pc}</b><i>${esc(nm)}</i>`;
    b.addEventListener('click', () => { q.value = nm; goto(pc); });
    hits.appendChild(b);
  }
  // 別州的結果排在本州之後，標上州別縮寫；點下去換頁並帶著郵區。
  const other = otherHits(term);
  for(const [pc, nm, st] of other){
    const a = document.createElement('a');
    a.className = 'xstate';
    a.href = `${stateUrl[st]}#pc=${pc}`;
    if(/^https?:/.test(stateUrl[st])){ a.target = '_blank'; a.rel = 'noopener'; }
    a.style.setProperty('--hc', CAT_COLOR[catOf(NAT[st][pc] || 0)]);
    a.innerHTML = `<em></em><b>${pc}<u>${esc(st.toUpperCase())}</u></b><i>${esc(nm)}</i>`;
    hits.appendChild(a);
  }
  const extra = list.length - 30;
  const parts = [];
  if(list.length) parts.push(T('hits_found', {n: list.length}) + (extra > 0 ? T('hits_more', {n: 30}) : ''));
  if(other.length) parts.push(T('hits_other', {n: other.length}));
  qhint.textContent = parts.length ? parts.join(' ') : T('hits_none', {q: term});
}

function doSearch(){
  const v = q.value.trim();
  if(!v){ clearHits(); qhint.textContent = ''; return; }

  if(/^\d{3,4}$/.test(v)){          // 純數字當郵遞區號
    clearHits(); qhint.textContent = '';
    goto(parseInt(v, 10));
    return;
  }

  const term = v.toLowerCase();
  const starts = [], contains = [];
  for(const [low, pc, nm] of byName){
    if(low.startsWith(term)) starts.push([pc, nm]);
    else if(low.includes(term)) contains.push([pc, nm]);
  }
  const list = starts.concat(contains);
  // 只剩一筆就直接跳過去，但**不能動輸入框**——這是每敲一個鍵都會跑的路徑，
  // 改掉 value 等於搶走使用者正在打的字（打到一半剛好只剩一筆時，後面的字
  // 會接到被換上的地名後面，整串就毀了）。點選結果時改 value 才是對的。
  // 本州只命中一筆就直接跳過去——但別州也有結果時不行。打「byron」時本州剛好
  // 有個 Mount Byron，直接跳過去的話 NSW 的 Byron Bay 就沒機會出現，而那多半
  // 才是使用者要找的。
  if(list.length === 1 && !otherHits(term).length){
    clearHits(); qhint.textContent = '';
    goto(list[0][0]);
    return;
  }
  showHits(list, v);
}

// 打字就查，沒有「查」按鈕——按鈕在即時搜尋之下沒有任何作用。
// 只有 1-2 位數字先不查：那時候候選太多，列出來只是洗版。
q.addEventListener('keydown', e => { if(e.key === 'Enter') doSearch(); });
q.addEventListener('input', () => {
  const v = q.value.trim();
  if(v.length >= 2 && !/^\d{1,2}$/.test(v)) doSearch();
  else { clearHits(); qhint.textContent = ''; }
});

// 從入口頁帶郵區進來：#pc=4870
// ---- 框選行政區 ----
// 入口頁點「在地圖上框出來」會帶著 #lga=<名稱>|<郵區,郵區,…> 過來。郵區清單
// 直接放在網址裡，州頁就不必多存一份行政區對照表（NSW 的 LGA 界線本身要
// 355 KB，而我們要的只是「哪些郵區屬於它」，那個資訊清單裡就有了）。
let regPcs = null, regName = '';
function clearRegion(){
  if(!regPcs) return;
  regPcs = null; regName = '';
  for(const [, d] of byPc) if(d.node) d.node.classList.remove('inreg', 'outreg');
  detail.style.removeProperty('--vc');
  detail.classList.remove('no');
  detail.innerHTML = `<div class="empty">${esc(T('detail_empty'))}</div>`;
}

// 面板內容跟框選本身分開：切語言／換產業要重畫文字，但不該把視野拉回去。
function renderRegionPanel(){
  if(!regPcs) return;
  // 行政區不是單一郵區，沒有判定色——色帶留在預設的線色。
  detail.style.removeProperty('--vc');
  detail.innerHTML =
    `<div class="ans"><span class="rgn">${esc(regName)}</span>`
    + `<span class="loc">${esc(T('map_reg_sub', {n: regPcs.size}))}</span></div>`
    + `<div class="bd">`
    + `<button type="button" class="rgnclr" id="rgnclr">${esc(T('map_reg_clear'))}</button></div>`;
  const btn = document.getElementById('rgnclr');
  if(btn) btn.addEventListener('click', () => { location.hash = ''; clearRegion(); });
}

function showLga(name, pcs){
  const members = new Set(pcs);
  regPcs = members; regName = name;
  let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9, n=0;
  for(const [pc, d] of byPc){
    if(!d.node) continue;
    const inn = members.has(pc);
    d.node.classList.toggle('inreg', inn);
    d.node.classList.toggle('outreg', !inn);
    if(!inn || d.stray) continue;
    let bb; try { bb = d.node.getBBox(); } catch(_) { continue; }
    if(!bb || !bb.width) continue;
    x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y);
    x1 = Math.max(x1, bb.x + bb.width); y1 = Math.max(y1, bb.y + bb.height);
    n++;
  }
  clearSel();
  selPc = null;
  if(n) focusOnLonLatBox(x0, y0, x1, y1);
  renderRegionPanel();
}

function fromHash(){
  const h = location.hash || '';
  const lga = /lga=([^&]*)/.exec(h);
  if(lga){
    const [name, list] = decodeURIComponent(lga[1]).split('|');
    const pcs = (list || '').split(',').map(Number).filter(Boolean);
    if(pcs.length){ showLga(name, pcs); return; }
  }
  clearRegion();
  // 郵區可以走 ?pc=（可分享的網址）或 #pc=（入口頁交棒用的舊格式）
  const m = /pc=(\d{3,4})/.exec(h) || [null, readUrlState().pc];
  if(!m[1]) return;
  q.value = m[1];
  doSearch();
}
// 產業要在讀郵區之前套用：判定取決於產業，順序反了會先算出一個錯的答案。
const urlInd = readUrlState().ind;
if(urlInd){
  const found = META.industries.find(i => i.key === urlInd);
  if(found){ industry = found; indSel.value = found.key; applyIndustry(); }
}
addEventListener('hashchange', fromHash);
fromHash();

// ---- 無障礙 ----
// 地圖不是可逐格 tab 的（幾百個郵區當 tab stop 反而更難用），
// 鍵盤與螢幕閱讀器的路徑是「查郵遞區號」欄位加上 live region 的詳情面板。
const mt = el('title',{id:'maptitle'});
svg.insertBefore(mt, svg.firstChild);
// 這兩個是給螢幕閱讀器唸的，切語言時也要跟著換，所以由 applyLang 負責填。
function applyMapA11y(){
  svg.setAttribute('aria-roledescription', T('map_role'));
  mt.textContent = T('map_title', {state: stateName(), n: META.counts.boundaries});
}

// ---- 初始視野 ----
// 窗格比州本身「寬」的時候（桌機常見：1048x797 是 1.31，而南北狹長的州
// viewBox 只有 0.91），完整放進去會讓左右各留一大條空白——實測各 162px，
// 等於窗格寬度的三成。而且沒有東西可以回收：內距只有 4%，州本體已經佔了
// viewBox 寬 87%、高 93%，高度是綁定條件。要變大就只能放大裁切。
//
// 裁掉的部分往上下分，所以垂直方向對到首府（種子檔第一筆）而不是幾何中心。
// 首府那一帶是人口與「都會區不算」的交界，最該先看到；對到幾何中心的話，
// 南端那條會被裁掉，而幾個最大的都會區正好都在南端。
//
// 想看完整的州仍然可以按「回到全州視野」。手機不套用——那裡窗格比內容窄，
// 完整放進去本來就填滿寬度。
// 手機上地圖窗格的高度跟著州的形狀走，不用固定的 62vh。東西狹長的州（viewBox
// 比例 2.79）塞進直式窗格，固定高度會上下各留一大條空白；南北狹長的州則相反。
// 下限 320px 是「還看得出形狀」的底線——真照 2.79 算下去只有 134px。
// 上限 62vh 是不要一進來整張畫面都是地圖，搜尋與答案還在上面。
// 手機的 innerHeight 是會動的：叫出鍵盤、網址列收合都會改它，而且就發生在
// 使用者查詢或捲動的當下。直接拿它算高度的話，鍵盤一彈出地圖就當場縮一截——
// 實測 iPhone 14 從 381px 掉到 320px（-16%），而且收起鍵盤只回到 364px，
// 因為中間 fitLabels 把 viewBox 撐大了一點點，回不去。
//
// 62vh 這個上限的用意是「一進來不要整張畫面都是地圖」，那是**進場時的版面意圖**，
// 不是需要跟著鍵盤即時追蹤的東西。所以基準只在寬度改變時更新——鍵盤與網址列
// 不會改寬度，轉向會。
let baseVW = innerWidth, baseVH = innerHeight;
function stableViewportHeight(){
  if(innerWidth !== baseVW){ baseVW = innerWidth; baseVH = innerHeight; }
  return baseVH;
}

function sizeMapPane(){
  // 這裡就地取元素，不用外面的 wrap——settleView 在模組很早就會跑，
  // 那個常數還沒宣告。
  const pane = document.getElementById('mapwrap');
  if(!pane) return;
  if(innerWidth > 900){ pane.style.height = ''; return; }
  const w = pane.getBoundingClientRect().width;
  if(!w) return;
  // 用 VB 而不是 VB0：SVG 是以 preserveAspectRatio:meet 把 VB 等比放進窗格的，
  // 窗格比例對齊 VB 才不會上下留黑邊。VB 含 fitLabels 為地名撐開的部分，那些
  // 空間也真的畫著東西。代價是轉向來回後高度會漂 1% 左右（VB 的撐開量跟窗格
  // 大小有關），肉眼看不出來，不值得為它改成會多留白的 VB0。
  const want = w * VB.h / VB.w;
  pane.style.height = Math.round(Math.min(Math.max(want, 320), stableViewportHeight() * 0.62)) + 'px';
}

function initialView(){
  const box = svg.getBoundingClientRect();
  if(!box.width || !box.height) return;
  const paneA = box.width / box.height, vbA = VB.w / VB.h;
  // 兩個方向都可能留白：南北狹長的州（viewBox 比例 0.83）在寬窗格裡左右留白，
  // 東西狹長的州（2.79）則是上下留白，而且更嚴重。取兩者的較大者就是「填滿
  // 窗格」需要的倍率。
  // 上限 1.8：東西狹長的州放進手機的直式窗格要放大近四倍才填得滿，那時只剩
  // 首府周邊，「這個州哪裡算」整個看不到了。填滿是為了不要空，不是目的本身。
  const nk = Math.min(1.8, Math.max(paneA / vbA, vbA / paneA));
  if(nk < 1.08) return;                    // 本來就接近填滿就別動
  const cap = CITIES[0];
  const halfW = VB.w / nk / 2, halfH = VB.h / nk / 2;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const cx = clamp(cap ? px(cap[1]) : VB.x + VB.w / 2, VB.x + halfW, VB.x + VB.w - halfW);
  const cy = clamp(cap ? py(cap[2]) : VB.y + VB.h / 2, VB.y + halfH, VB.y + VB.h - halfH);
  centreOn(cx, cy, nk);
}

// ---- 手機上收合標頭 ----
// 捲過標題的高度就把標題與副標收起來，只留換州按鈕黏在頂端。門檻用標頭
// 自己的高度而不是固定值——中英文與不同州名的標題高度不一樣。
// 有 hysteresis（收起來的門檻比展開高）才不會在臨界點反覆跳。
const bar = document.getElementById('bar');
if(bar){
  let compact = false;
  const onScroll = () => {
    const y = scrollY;
    if(!compact && y > 90) { compact = true; bar.classList.add('compact'); }
    else if(compact && y < 40) { compact = false; bar.classList.remove('compact'); }
  };
  addEventListener('scroll', onScroll, {passive:true});
  onScroll();
}

// ---- 開發版橫幅 ----
// 開發版現在只在本機建（CHANNEL=dev），不會上 Pages。橫幅的用處是讓人一眼
// 知道手上這份不是線上那份，連結指向已發佈的站台方便對照。
function drawDevBar(){
  const bar = document.getElementById('devbar');
  if(!bar || META.channel !== 'dev') return;
  bar.hidden = false;
  bar.textContent = T('dev_banner');
  if(META.site_url){
    const a = document.createElement('a');
    a.href = META.site_url;
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = T('dev_stable_link');
    bar.appendChild(a);
  }
}

// ---- 跨州查詢 ----
// 這一頁只有自己州的郵區資料，所以打「Byron Bay」原本會得到「找不到」——
// 那個地方明明存在，只是在隔壁州。旗標表（州別）內嵌，地名表是四個州頁與
// 入口頁共用的一個檔，瀏覽器只下載一次。
const NAT = META.nat || {};
const stateUrl = {};
for(const n of (META.nav || [])) if(!n.home) stateUrl[n.label.toLowerCase()] = n.url;
const pcState = {};
for(const st in NAT) if(st !== META.state) for(const pc in NAT[st]) pcState[pc] = st;

let NAMES = META.index_inline || null;
let otherNames = [];                 // [小寫地名, 郵區, 原地名, 州]
function buildOtherNames(){
  otherNames = [];
  if(!NAMES) return;
  for(const pc in NAMES){
    const st = pcState[pc];
    if(!st || !stateUrl[st]) continue;   // 沒做地圖的州跳過，點了沒地方去
    for(const nm of NAMES[pc].split('|')) otherNames.push([nm.toLowerCase(), pc, nm, st]);
  }
}
function loadNames(){
  if(NAMES){ buildOtherNames(); return; }
  if(!META.index_url) return;
  fetch(META.index_url)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if(!d) return; NAMES = d; buildOtherNames(); if(q.value.trim()) doSearch(); })
    .catch(() => {});                    // 抓不到就只剩本州查詢，不讓整頁掛掉
}

// 完全相符 > 開頭相符 > 包含。只分兩層不夠：打「perth」時 Perthville 也是
// 「開頭相符」，而索引順序讓 NSW 排在 WA 前面，結果西澳的 Perth 被擠到後面。
function otherHits(term){
  const exact = [], starts = [], contains = [];
  for(const [low, pc, nm, st] of otherNames){
    if(low === term) exact.push([pc, nm, st]);
    else if(low.startsWith(term)) starts.push([pc, nm, st]);
    else if(low.includes(term)) contains.push([pc, nm, st]);
  }
  return exact.concat(starts, contains).slice(0, 15);
}

// ---- 語言切換 ----
const langBtn = document.getElementById('lang');
const h1 = document.getElementById('h1');

function applyLang(){
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.title = h1.textContent = T('title_state', {state: stateName()});
  applyMapA11y();
  relabelMapText();
  for(const el2 of document.querySelectorAll('[data-t]')){
    const key = el2.getAttribute('data-t');
    if(key) el2.textContent = T(key);
  }
  for(const n of document.querySelectorAll('[data-t-ph]'))    n.setAttribute('placeholder', T(n.getAttribute('data-t-ph')));
  for(const n of document.querySelectorAll('[data-t-aria]'))  n.setAttribute('aria-label', T(n.getAttribute('data-t-aria')));
  for(const n of document.querySelectorAll('[data-t-title]')) n.setAttribute('title', T(n.getAttribute('data-t-title')));

  // 出處整段與落款。日期與無邊界郵區數一律取自 META——樣板裡再寫一份的話，
  // 官網更新後那份會安靜地開始說謊。
  const a = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${esc(text)}</a>`;
  // 頁尾由共用的 renderFoot 產生。map_strays 是這一頁特有的資料品質註記
  // （有幾個郵區沒有對應的多邊形，以小點顯示），接在免責後面。
  renderFoot(document.getElementById('foot'), {
    T, esc, sourceUrl: META.source_url,
    pageDate: META.page_date, builtAt: META.built_at,
    extra: META.n_no_poly ? [esc(T('map_strays', {n: META.n_no_poly}))] : [],
  });
  // 導覽的「全澳入口」也要換
  const home = document.querySelector('#nav a.home');
  if(home) home.textContent = '← ' + T('nav_home');
  // 產業選單的選項文字
  for(const o of indSel.options){
    const i = META.industries.find(x => x.key === o.value);
    if(i) o.textContent = lang === 'zh' ? i.label : (i.label_en || i.label);
  }
  document.getElementById('excluded').textContent =
    lang === 'zh' ? META.excluded_note : (META.excluded_note_en || '');
  drawDevBar();
  langBtn.textContent = lang === 'zh' ? 'EN' : '中文';
  langBtn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切換為中文');
  applyIndustry();
}

langBtn.addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', lang); } catch (_) {}
  applyLang();
});

applyLang();

// 圖例在手機上會蓋掉半張地圖，所以窄螢幕預設收起，桌機維持展開
document.getElementById('legend').open = !matchMedia('(max-width:900px)').matches;

// 放最後：地名表的宣告在上面的「跨州查詢」段落，提早呼叫會踩到 TDZ。
loadNames();
