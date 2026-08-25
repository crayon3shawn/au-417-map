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
// 字級與點徑以「目標螢幕像素」定義，再換算成世界單位。
// 各州的視野比例不同（QLD 貼高度、NSW 貼寬度），寫死世界單位會讓字忽大忽小。
const PX = {lbl1:11.5, lbl2:9.5, dot1:3.2, dot2:2.3, halo:1.5, gap:5, trop:8.5, stray:2.2};
const SZ = {};
function sizeToViewport(){
  const r = svg.getBoundingClientRect();
  const perUnit = Math.min(r.width / VB.w, r.height / VB.h) || 1;   // preserveAspectRatio meet
  for(const key in PX) SZ[key] = PX[key] / perUnit;
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

let industry = META.industries.find(i => i.key === META.industry) || META.industries[0];
const workMask = () => industry.mask;

// 三個互斥的答案。顏色就是答案本身，沒有第二個軸。
//   work    這個產業認可的地區表裡，一般工作就算
//   rebuild 不在那些表裡，但被宣告為災區，只有災後重建工作算
//   none    兩者皆非
const catOf = f => (f & workMask()) ? 'work' : (f & REBUILD) ? 'rebuild' : 'none';

// 細分只作用在 rebuild：災害種類唯有在「重建是唯一路徑」時才影響判斷。
function colorOf(f, split){
  if(f & workMask()) return 'var(--c-work)';
  if(!(f & REBUILD)) return 'var(--c-none)';
  if(!split) return 'var(--c-rebuild)';
  return ((f & BIT_FIRE) && (f & BIT_DISASTER)) ? 'var(--c-both)'
       : (f & BIT_FIRE) ? 'var(--c-fire)' : 'var(--c-flood)';
}

const areasG = el('g',{}); proj.appendChild(areasG);    // 郵區面（原始經緯度）
const strayG = el('g',{}); over.appendChild(strayG);    // 沒有邊界面的郵區，以小點代替
const byPc = new Map();
const flagOf = new Map(Object.entries(FLAGS).map(([pc, f]) => [+pc, f]));

for(const pc of Object.keys(POA).map(Number).sort((a,b)=>a-b)){
  const f = flagOf.get(pc) || 0;
  const cat = catOf(f);
  const node = el('path',{class:'poa ' + cat, d:POA[pc], fill:colorOf(f, false),
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
  for(const s of strayG.children) s.setAttribute('r', SZ.stray/k);
  if(tlbl){
    tlbl.setAttribute('font-size', SZ.trop/k);
    tlbl.setAttribute('x', VB.x + SZ.gap/k);
    tlbl.setAttribute('y', tropY - SZ.gap*0.7/k);
  }
}
apply();

// 標籤寬度要等字型載入才量得準。溢出視野就把視野撐開，
// 免得像 Byron Bay 這種在最東端的地名被切掉。
function fitLabels(){
  if(!cityG.getBBox) return;
  const bb = cityG.getBBox();
  const pad = SZ.gap;
  let changed = false;
  if(bb.x + bb.width > VB.x + VB.w){ VB.w = bb.x + bb.width - VB.x + pad; changed = true; }
  if(bb.x < VB.x){ const d = VB.x - bb.x + pad; VB.x -= d; VB.w += d; changed = true; }
  if(bb.y < VB.y){ const d = VB.y - bb.y + pad; VB.y -= d; VB.h += d; changed = true; }
  if(bb.y + bb.height > VB.y + VB.h){ VB.h = bb.y + bb.height - VB.y + pad; changed = true; }
  if(changed){
    svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
    sizeToViewport();
    apply();
  }
}
if(document.fonts && document.fonts.ready) document.fonts.ready.then(fitLabels);
else fitLabels();
addEventListener('resize', () => {
  sizeToViewport();
  relabelCities();
  apply();
});

function relabelCities(){
  for(const g of cityNodes) g.__c.t.textContent = cityLabel(g.__c.name);
}

function toBase(e){
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function zoomAt(bp, nk){
  nk = Math.max(1, Math.min(40, nk));
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
      const nk = Math.max(1, Math.min(40, pinch.k * (d / pinch.d)));
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
function focusOn(rec, nk){
  k = nk;
  tx = (VB.x+VB.w/2) - k*px(rec[1]);
  ty = (VB.y+VB.h/2) - k*py(rec[2]);
  apply();
}

// ---- 圖例：數量與細分開關 ----
let selNode = null, selPc = null;

const legend = document.getElementById('legend');
const splitBox = document.getElementById('split');
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

function applyIndustry(){
  const on = splitBox.checked;
  for(const s of areasG.children){
    const f = byPc.get(s.__pc).f;
    s.setAttribute('class', 'poa ' + catOf(f) + (s.classList.contains('sel') ? ' sel' : ''));
    s.setAttribute('fill', colorOf(f, on));
  }
  for(const s of strayG.children){
    const f = byPc.get(s.__pc).f;
    s.setAttribute('fill', colorOf(f, on));
  }
  const c = industry.counts;
  for(const [id, n] of [['n-work', c.work], ['n-rebuild', c.rebuild], ['n-none', c.none],
                        ['n-fire', c.fire_only], ['n-flood', c.flood_only], ['n-both', c.fire_and_flood]])
    document.getElementById(id).textContent = n;
  document.getElementById('r-none').style.display = c.none ? '' : 'none';
  const tables = areasOf(industry.mask).join(' + ');
  document.getElementById('n-work-label').textContent = T('cat_work', {ind: indLabel()});
  // 範圍是官方定義的中文摘要，不是官方文字，所以一定要附原文連結讓人核對
  indNote.innerHTML = esc(T('industry_table', {tables})).replace(esc(tables), `<b>${esc(tables)}</b>`)
    + (indScope()
        ? `<span class="scope">${esc(indScope())} `
          + `<a href="${META.source_url}" target="_blank" rel="noopener">${esc(T('official_def'))}</a></span>`
        : '');
  document.getElementById('subind').textContent = `${T('showing')}: ${indLabel()}`;
  document.getElementById('fact1').textContent = T('fact1_body', {ind: indLabel(), tables});
  splitBox.closest('.lgtoggle').style.display = c.rebuild ? '' : 'none';
  if(selPc !== null) select(selPc);
}

indSel.addEventListener('change', () => {
  industry = META.industries.find(i => i.key === indSel.value) || industry;
  applyIndustry();
});
splitBox.addEventListener('change', () => {
  legend.classList.toggle('split', splitBox.checked);
  applyIndustry();
});

// ---- 詳情 ----
const detail = document.getElementById('detail');

function clearSel(){ if(selNode){ selNode.classList.remove('sel'); selNode = null; } }

function select(pc){
  selPc = pc;
  clearSel();
  const d = byPc.get(pc);
  if(d){ d.node.classList.add('sel'); selNode = d.node; d.node.parentNode.appendChild(d.node); }

  if(!d || !d.rec){
    const names = OTHER[pc];
    const where = names ? `（${esc(names.join('、'))}）` : '';
    detail.innerHTML = `<div class="empty">${esc(T('v_not_listed',{pc, where, state: stateName(), ind: indLabel()}))}</div>`;
    return;
  }

  const [p, , , f, names] = d.rec;
  const shown = names.slice(0, 6);
  const more = names.length > shown.length ? T('more_areas', {n: names.length}) : '';
  const rows = [];
  const ind = indLabel();
  if(f & workMask()) rows.push(`<div class="verdict" style="--vc:var(--c-work)"><span class="dot"></span><span><b>${esc(T('v_work_yes',{ind}))}</b><br>${esc(T('v_work_yes_sub',{ind}))}</span></div>`);
  else rows.push(`<div class="verdict no"><span class="dot"></span><span><b>${esc(T('v_work_no',{ind}))}</b><br>${esc(T('v_work_no_sub',{ind}))}</span></div>`);
  if(f & BIT_FIRE) rows.push(`<div class="verdict" style="--vc:var(--c-fire)"><span class="dot"></span><span><b>${esc(T('v_fire'))}</b><br>${esc(T('v_fire_sub'))}</span></div>`);
  if(f & BIT_DISASTER) rows.push(`<div class="verdict" style="--vc:var(--c-flood)"><span class="dot"></span><span><b>${esc(T('v_flood'))}</b><br>${esc(T('v_flood_sub'))}</span></div>`);
  if(!(f & workMask()) && (f & REBUILD)) rows.push(`<div class="note">${esc(T('v_rebuild_only',{ind}))}</div>`);
  if(d.stray) rows.push(`<div class="note">${esc(T('v_no_polygon'))}</div>`);

  detail.innerHTML =
    `<div class="hd"><span class="pcn" style="color:${colorOf(f, splitBox.checked)}">${p}</span><span class="loc">${esc(shown.join(lang === 'zh' ? '、' : ', '))}${more}</span></div>` +
    `<div class="bd">${rows.join('')}</div>`;
}

const tip = document.getElementById('tip'), wrap = document.getElementById('mapwrap');
const hit = e => e.target.closest('.poa, .stray');
svg.addEventListener('click', e => { if(drag && drag.moved) return; const t = hit(e); if(t) select(t.__pc); });
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
  select(pc);
  const d = byPc.get(pc);
  if(d && d.rec) focusOn(d.rec, Math.max(k, 6));
}

function showHits(list, term){
  clearHits();
  for(const [pc, nm] of list.slice(0, 30)){
    const f = (byPc.get(pc) || {}).f || 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.style.setProperty('--hc', CAT_COLOR[catOf(f)]);
    b.innerHTML = `<em></em><b>${pc}</b><i>${esc(nm)}</i>`;
    b.addEventListener('click', () => { q.value = nm; goto(pc); });
    hits.appendChild(b);
  }
  const extra = list.length - 30;
  qhint.textContent = list.length
    ? T('hits_found', {n: list.length}) + (extra > 0 ? T('hits_more', {n: 30}) : '')
    : T('hits_none', {q: term});
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
  if(list.length === 1){                 // 只有一個就直接跳過去
    clearHits(); qhint.textContent = '';
    q.value = list[0][1];
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
function fromHash(){
  const m = /pc=(\d{3,4})/.exec(location.hash || '');
  if(!m) return;
  q.value = m[1];
  doSearch();
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

// ---- 語言切換 ----
const langBtn = document.getElementById('lang');
const h1 = document.getElementById('h1');

function applyLang(){
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.title = h1.textContent = T('title_state', {state: stateName()});
  applyMapA11y();
  relabelCities();
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
  document.getElementById('srctext').innerHTML = T('map_src', {
    ha: a(META.source_url, T('map_ha_link')),
    da: a('https://www.disasterassist.gov.au/find-a-disaster', T('map_da_link')),
    date: META.page_date, strays: META.n_no_poly,
  });
  document.getElementById('stamp').textContent =
    T('map_stamp', {d: META.page_date, b: META.built_at});
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
