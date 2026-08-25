// @ts-check
const DATA = __DATA__;
const IDX = DATA.postcodes, STATES = DATA.states, META = DATA.meta;
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

document.getElementById('stamp').textContent = META.stamp;
document.getElementById('hint').textContent =
  `可查 ${META.n_postcodes} 個郵遞區號，涵蓋全澳。目前有 ${META.n_maps} 個州做了地圖。`;

// 三個互斥的答案，跟各州地圖用同一套說法
// 判定文字要跟著選定的產業變，所以是函式不是常數
const CAT_COLOR = {work:'var(--c-work)', rebuild:'var(--c-rebuild)', none:'var(--c-none)'};
function cats(){
  const n = industry.label;
  return {
    work:    {c:CAT_COLOR.work,    say:`一般${n}工作就算`,
              sub:`這個郵區在${n}適用的地區名單上。`},
    rebuild: {c:CAT_COLOR.rebuild, say:'只有災後重建工作算',
              sub:`一般${n}工作不算。重建的土建、拆除、修繕、道路橋樑才算，志工也算，記得留下能證明工程屬於災後修復的紀錄。`},
    none:    {c:CAT_COLOR.none,    say:'完全不算',
              sub:'這個郵區不在任何一張合格清單上。'},
  };
}
// 位元記的是地區表成員資格，判定取決於選了哪個產業
const BIT_FIRE = 8, BIT_DISASTER = 16, REBUILD = BIT_FIRE | BIT_DISASTER;
let industry = DATA.industry_masks.find(i => i.key === DATA.industry) || DATA.industry_masks[0];
const catOf = f => (f & industry.mask) ? 'work' : (f & REBUILD) ? 'rebuild' : 'none';

const indSel = document.getElementById('ind');
for(const i of DATA.industry_masks){
  const o = document.createElement('option');
  o.value = i.key; o.textContent = i.label;
  if(i.key === industry.key) o.selected = true;
  indSel.appendChild(o);
}
function applyIndustry(){
  document.getElementById('indnote').innerHTML = esc(industry.scope || '')
    + ` <a href="${DATA.meta.source_url}" target="_blank" rel="noopener">官方定義 →</a>`
    + `<br><span class="dim">切換行業會改變下面的判定與各州統計。</span>`;
  drawStates();
  drawCards();
  if(q.value.trim()) lookup();
}
indSel.addEventListener('change', () => {
  industry = DATA.industry_masks.find(i => i.key === indSel.value) || industry;
  applyIndustry();
});
const stateOf = k => STATES.find(s => s.key === k);

// ---- 全澳概觀圖 ----
const svg = document.getElementById('au');
const COS = Math.cos(27 * Math.PI / 180);
const px = lon => lon * COS, py = lat => -lat;
let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
for(const k in DATA.outlines) for(const r of DATA.outlines[k]) for(const [lo,la] of r){
  const x=px(lo), y=py(la);
  if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
}
const pad=(x1-x0)*0.02;
svg.setAttribute('viewBox', `${x0-pad} ${y0-pad} ${(x1-x0)+pad*2} ${(y1-y0)+pad*2}`);
svg.setAttribute('preserveAspectRatio','xMidYMid meet');
const at = el('title',{id:'autitle'});
at.textContent = '澳洲各州地圖導覽。有做地圖的州可以點進去，其餘僅供參考。';
svg.appendChild(at);

// 各州統計依選定產業即時算，不用 build 端算好的固定值——換產業數字要跟著變
function statsFor(s){
  let work = 0, rebuild = 0, none = 0;
  for(const pc in IDX){
    if(IDX[pc][0] !== s.key) continue;
    const f = IDX[pc][2];
    if(f & industry.mask) work++;
    else if(f & REBUILD) rebuild++;
    else none++;
  }
  const total = work + rebuild + none;
  return {work, rebuild, none, total,
          all_work: rebuild === 0 && none === 0 && work > 0};
}

function drawStates(){
for(const n of [...svg.querySelectorAll('path.st, a, text.stlbl')]) n.remove();
for(const s of STATES){
  Object.assign(s, statsFor(s));
  const rings = DATA.outlines[s.key];
  if(!rings || !rings.length) continue;   // 空陣列是 truthy，要另外擋
  const d = rings.map(r => r.map(([lo,la],i)=>(i?'L':'M')+px(lo).toFixed(2)+' '+py(la).toFixed(2)).join('')+'Z').join('');
  // 顏色一律反映該州的實際身分。有沒有地圖只影響能不能點，不能拿顏色表示——
  // SA、TAS、NT 全境都算，塗成灰色（＝完全不算）會誤導。
  const dominant = s.none > s.work && s.none > s.rebuild ? 'none'
                 : s.work >= s.rebuild ? 'work' : 'rebuild';
  const node = el('path',{class:'st' + (s.url ? '' : ' nomap'), d,
    fill: CAT_COLOR[dominant], 'vector-effect':'non-scaling-stroke'});
  const t = el('title',{});
  t.textContent = s.all_work
    ? `${s.abbr} ${s.label}：全境都算，${s.work} 個郵區`
    : `${s.abbr} ${s.label}：一般${industry.label} ${s.work}、只有重建 ${s.rebuild}、不算 ${s.none}`;
  node.appendChild(t);
  // Artifact 在沙箱 iframe 裡執行，改變上層網址會被擋掉（畫面變成一片白），
  // 所以一律用 <a target="_blank"> 在新分頁開啟。
  if(s.url){
    const a = el('a',{});
    a.setAttribute('href', s.url);
    if(/^https?:/.test(s.url)){ a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
    a.appendChild(node);
    svg.appendChild(a);
  } else {
    svg.appendChild(node);
  }

  // 標註位置由資料指定（重心會讓 ACT 疊在 NSW 上）。沒給就不標。
  if(s.label_at){
    const fs = (x1-x0)*0.030;
    const lbl = el('text',{class:'stlbl' + (s.url ? '' : ' dim'),
      x:px(s.label_at[0]).toFixed(2), y:py(s.label_at[1]).toFixed(2),
      'font-size':fs, 'stroke-width':fs*0.16});
    lbl.textContent = s.abbr;   // 地圖上用縮寫，短又是當地慣用
    svg.appendChild(lbl);
  }
}
}

// ---- 各州卡片 ----
const cards = document.getElementById('cards');
function drawCards(){
cards.innerHTML = '';
for(const s of STATES){
  const total = s.total || 1;
  const seg = (n, v) => n ? `<i style="width:${(n/total*100).toFixed(1)}%;background:${v}"></i>` : '';
  const status = s.url ? '看地圖 →'
               : s.all_work ? '全境都算'
               : s.work === 0 ? '一般工作不算'
               : s.work <= 5 ? '幾乎都不算' : '尚無地圖';
  const note = s.all_work
    ? `整個州都在${esc(industry.label)}適用的地區名單上，在哪裡工作都算，所以不需要地圖。共 ${s.work} 個郵區。`
    : s.work === 0
      ? `一般${esc(industry.label)}工作在這裡都不算。但全境被宣告為災區，災後重建工作在哪裡都算。`
      : s.work <= 5
        ? `一般${esc(industry.label)}工作只有 ${s.work} 個郵區算，其餘只有災後重建工作算。`
        : null;
  const detail = (!s.url && note)
    ? `<div class="allwork">${esc(note)}</div>`
    : `<div class="legend2">
        <span style="--sw:var(--c-work)"><i></i>一般${esc(industry.label)} <b>${s.work}</b></span>
        <span style="--sw:var(--c-rebuild)"><i></i>只有重建 <b>${s.rebuild}</b></span>
        <span style="--sw:var(--c-none)"><i></i>不算 <b>${s.none}</b></span>
      </div>`;
  const inner = `
    <div class="top">
      <span class="nm">${esc(s.abbr)}</span>
      <span class="en">${esc(s.name)}　${esc(s.label)}</span>
      <span class="go">${status}</span>
    </div>
    <div class="bar">${seg(s.work,'var(--c-work)')}${seg(s.rebuild,'var(--c-rebuild)')}${seg(s.none,'var(--c-none)')}</div>
    ${detail}`;
  let node;
  if(s.url){ node = document.createElement('a'); node.href = s.url; node.className = 'card';
             if(/^https?:/.test(s.url)){ node.target = '_blank'; node.rel = 'noopener'; } }
  else { node = document.createElement('div');
         node.className = 'card ' + (note ? 'off' : 'nomap'); }
  node.innerHTML = inner;
  cards.appendChild(node);
}
}

// ---- 開發版橫幅 ----
if(DATA.meta.channel === 'dev'){
  const bar = document.getElementById('devbar');
  if(bar){
    bar.hidden = false;
    bar.innerHTML = '開發版 · 資料與判定可能不正確，正式版請看 <a href="../">穩定版</a>';
  }
  const m = document.createElement('meta');
  m.name = 'robots'; m.content = 'noindex, nofollow';
  document.head.appendChild(m);
}

// ---- 依據：五張表的大小、產業對應 ----
const COV = DATA.area_coverage, INDS = DATA.industries;
const COV_LABEL = {regional:'Regional Australia', remote:'Remote and Very Remote',
                   northern:'Northern Australia', bushfire:'大火宣告區', disaster:'天災宣告區'};
const covEl = document.getElementById('cov');
for(const k of ['regional','disaster','bushfire','remote','northern']){
  const n = COV[k], pct = Math.round(n / COV._total * 100);
  const div = document.createElement('div');
  div.innerHTML = `<span>${COV_LABEL[k]}</span><b>${n}</b><i>個 · ${pct}%</i>`;
  covEl.appendChild(div);
}

const tb = document.querySelector('#imap tbody');
for(const ind of INDS){
  if(!ind.areas) continue;
  const tr = document.createElement('tr');
  tr.innerHTML = `<th scope="row">${esc(ind.label)}<em>${esc(ind.en)}</em></th>`
    + `<td>${ind.areas.map(esc).join('　＋　')}</td>`
    + `<td class="sc">${esc(ind.scope || '')}</td>`;
  tb.appendChild(tr);
}

// 哪些產業跟建築吃同一張表——這是最常被問的一句
const base = JSON.stringify(INDS.find(i => i.en === 'Construction').areas);
const same = INDS.filter(i => i.en !== 'Construction' && JSON.stringify(i.areas) === base)
                 .map(i => i.label);
document.getElementById('samelist').innerHTML =
  `<b>${esc(same.join('、'))}跟建築吃同一張 Regional Australia 表</b>，判斷完全相同——`
  + `所以這張地圖對做農場、肉廠、礦區的人一樣有效。`
  + `觀光餐旅差最多：它看的是 Remote 與 Northern，可用郵區只有 ${COV._tourism} 個，`
  + `不到 Regional（${COV.regional} 個）的 ${Math.round(COV.regional / COV._tourism)} 分之一。`;

// ---- 查詢 ----
const q = document.getElementById('q'), result = document.getElementById('result');
const hitsEl = document.getElementById('hits');
function show(html){ result.innerHTML = html; }

// 地名索引：多數人知道自己在哪個鎮，不知道郵區號碼
const byName = [];
for(const pc in IDX){
  const [st, main, , others] = IDX[pc];   // 第 3 個是旗標，跳過
  for(const nm of [main, ...(others || [])]) byName.push([nm.toLowerCase(), pc, nm, st]);
}
const clearHits = () => { hitsEl.innerHTML = ''; };

function showHits(list, term){
  clearHits();
  for(const [pc, nm, st] of list.slice(0, 40)){
    const f = IDX[pc][2], s = stateOf(st);
    const b = document.createElement('button');
    b.type = 'button';
    b.style.setProperty('--hc', CAT_COLOR[catOf(f)]);
    b.innerHTML = `<em></em><b>${pc}</b><i>${esc(nm)}</i><u>${esc(s.abbr)}</u>`;
    b.addEventListener('click', () => { q.value = nm; clearHits(); render(pc); });
    hitsEl.appendChild(b);
  }
  const extra = list.length - 40;
  show(`<p class="hint">${list.length
    ? `找到 ${list.length} 筆` + (extra > 0 ? `，只列出前 40 筆，再打幾個字縮小範圍` : '') + '，點一筆看結果。'
    : `找不到「${esc(term)}」。試試郵遞區號，或只打地名的前幾個字。`}</p>`);
}

function lookup(){
  const v = q.value.trim();
  if(!v){ clearHits(); show(`<p class="hint" id="hint"></p>`); return; }
  if(!/^\d{3,4}$/.test(v)){
    const term = v.toLowerCase();
    const starts = [], contains = [];
    for(const [low, pc, nm, st] of byName){
      if(low.startsWith(term)) starts.push([pc, nm, st]);
      else if(low.includes(term)) contains.push([pc, nm, st]);
    }
    const list = starts.concat(contains);
    if(list.length === 1){ q.value = list[0][1]; clearHits(); render(list[0][0]); return; }
    showHits(list, v);
    return;
  }
  clearHits();
  render(String(parseInt(v,10)));
}

function render(key){
  const hit = IDX[key];
  if(!hit){
    show(`<p class="hint">找不到郵遞區號 <b class="mono">${esc(key)}</b>。可能是信箱型號碼，或這個號碼澳洲郵政沒有發行。</p>`);
    return;
  }
  const v = key;
  const [stKey, name, f] = hit;
  const s = stateOf(stKey), cat = cats()[catOf(f)];
  const routes = [];
  if(f & BIT_FIRE) routes.push('叢林大火重建（2019/7/31 之後）');
  if(f & BIT_DISASTER) routes.push('洪水／氣旋等天災重建（2021/12/31 之後）');
  const extra = routes.length ? `<br>這裡也被宣告為災區：${routes.join('、')}。` : '';
  const link = s.url
    ? `<a class="golink" href="${s.url}#pc=${parseInt(v,10)}"${/^https?:/.test(s.url) ? ' target="_blank" rel="noopener"' : ''}>在${esc(s.label)}地圖上看 →</a>`
    : `<p class="nomap">${esc(s.label)}還沒做地圖。上面的判斷仍然有效。</p>`;
  show(`<div class="verdict" style="--vc:${cat.c}">
      <span class="chip"></span>
      <div class="body">
        <div><span class="pc">${parseInt(v,10)}</span> <span class="where">${esc(name)}，${esc(s.label)}</span></div>
        <div class="say">${cat.say}</div>
        <div class="sub">${cat.sub}${extra}</div>
        ${link}
      </div>
    </div>`);
}
// 打字就查，沒有「查」按鈕。條件跟州頁一致——原本入口頁漏掉三位數郵區
// （北領地的 0800 打完不會自動查，只能按按鈕），那是條件寫得不一致，不是按鈕的價值。
q.addEventListener('keydown', e => { if(e.key === 'Enter') lookup(); });
q.addEventListener('input', () => {
  const v = q.value.trim();
  if(v.length >= 2 && !/^\d{1,2}$/.test(v)) lookup();
  else { clearHits(); show(`<p class="hint" id="hint"></p>`); }
});

applyIndustry();   // 初次繪製。放最後是因為它會用到上面宣告的 q 與 lookup。
