// @ts-check
const DATA = __DATA__;
const IDX = DATA.postcodes, STATES = DATA.states, META = DATA.meta;
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---- 語言 ----
// 兩種語言的字串都在頁面裡，靠切換鈕換。跟各州地圖共用 localStorage 的 'lang'
// 鍵——同源，所以從這裡點進地圖會沿用同一個語言，不會中文入口配英文地圖。
// 預設中文：不猜 navigator.language，猜的話瀏覽器語言與站台預設不一致的人
// 每頁看到的語言都不一樣。想看英文的人按一次鈕，之後都記得。
const S = META.strings;
const savedLang = (() => { try { return localStorage.getItem('lang'); } catch (_) { return null; } })();
let lang = (savedLang === 'zh' || savedLang === 'en') ? savedLang : 'zh';

/** @param {string} key @param {Record<string,string|number>} [vars] */
function T(key, vars){
  let s = (S[key] && S[key][lang]) || (S[key] && S[key].zh) || key;
  if(vars) for(const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
const stLabel  = s => lang === 'zh' ? s.label : s.name;
const indLabel = () => lang === 'zh' ? industry.label : (industry.label_en || industry.label);
const indScope = () => lang === 'zh' ? industry.scope : (industry.scope_en || industry.scope);
const joinList = a => a.join(T('p_list_sep'));

const HA = `<a href="${META.source_url}" target="_blank" rel="noopener">`;

// 三個互斥的答案，跟各州地圖用同一套說法
// 判定文字要跟著選定的產業變，所以是函式不是常數
const CAT_COLOR = {work:'var(--c-work)', rebuild:'var(--c-rebuild)', none:'var(--c-none)'};
function cats(){
  const n = indLabel();
  return {
    work:    {c:CAT_COLOR.work,    say:T('cat_work', {ind:n}),   sub:T('v_work_yes_sub', {ind:n})},
    rebuild: {c:CAT_COLOR.rebuild, say:T('cat_rebuild'),         sub:T('p_rebuild_sub', {ind:n})},
    none:    {c:CAT_COLOR.none,    say:T('cat_none'),            sub:T('p_none_sub')},
  };
}
// 位元記的是地區表成員資格，判定取決於選了哪個產業
const BIT_FIRE = 8, BIT_DISASTER = 16, REBUILD = BIT_FIRE | BIT_DISASTER;
let industry = DATA.industry_masks.find(i => i.key === DATA.industry) || DATA.industry_masks[0];
const catOf = f => (f & industry.mask) ? 'work' : (f & REBUILD) ? 'rebuild' : 'none';

const indSel = document.getElementById('ind');
function fillIndustries(){
  indSel.innerHTML = '';
  for(const i of DATA.industry_masks){
    const o = document.createElement('option');
    o.value = i.key;
    o.textContent = lang === 'zh' ? i.label : (i.label_en || i.label);
    if(i.key === industry.key) o.selected = true;
    indSel.appendChild(o);
  }
}
function applyIndustry(){
  document.getElementById('indnote').innerHTML = esc(indScope() || '')
    + ` ${HA}${T('official_def')}</a>`
    + `<br><span class="dim">${T('p_indnote_switch')}</span>`;
  drawStates();
  drawCards();
  drawSameList();
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
at.textContent = T('p_au_title');
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
    ? T('p_state_all', {abbr:s.abbr, name:stLabel(s), w:s.work})
    : T('p_state_mix', {abbr:s.abbr, name:stLabel(s), ind:indLabel(),
                        w:s.work, r:s.rebuild, n:s.none});
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
  const status = s.url ? T('p_card_go')
               : s.all_work ? T('p_card_all')
               : s.work === 0 ? T('p_card_nowork')
               : s.work <= 5 ? T('p_card_few') : T('p_card_nomap');
  const note = s.all_work
    ? T('p_card_note_all', {ind:indLabel(), w:s.work})
    : s.work === 0
      ? T('p_card_note_none', {ind:indLabel()})
      : s.work <= 5
        ? T('p_card_note_few', {ind:indLabel(), w:s.work,
                                unit:T(s.work === 1 ? 'p_unit_pc_one' : 'p_unit_pc_many')})
        : null;
  const detail = (!s.url && note)
    ? `<div class="allwork">${esc(note)}</div>`
    : `<div class="legend2">
        <span style="--sw:var(--c-work)"><i></i>${esc(T('p_leg_work', {ind:indLabel()}))} <b>${s.work}</b></span>
        <span style="--sw:var(--c-rebuild)"><i></i>${esc(T('p_leg_rebuild'))} <b>${s.rebuild}</b></span>
        <span style="--sw:var(--c-none)"><i></i>${esc(T('p_leg_none'))} <b>${s.none}</b></span>
      </div>`;
  // 中文版兩個名字都給（縮寫＋英文＋中文），英文版重複的中文就不用出現
  const names = lang === 'zh' ? `${esc(s.name)}　${esc(s.label)}` : esc(s.name);
  const inner = `
    <div class="top">
      <span class="nm">${esc(s.abbr)}</span>
      <span class="en">${names}</span>
      <span class="go">${esc(status)}</span>
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

// ---- 依據：五張表的大小、產業對應 ----
const COV = DATA.area_coverage, INDS = DATA.industries;
// 前三張表的名字是官方英文專有名詞，兩種語言都照原文；後兩張是描述，要翻。
const AREA_FIXED = {regional:'Regional Australia', remote:'Remote and Very Remote',
                    northern:'Northern Australia'};
const AREA_KEY = {bushfire:'p_area_bushfire', disaster:'p_area_disaster'};
const covName = k => AREA_FIXED[k] || T(AREA_KEY[k]);
const covEl = document.getElementById('cov');
function drawCov(){
  covEl.innerHTML = '';
  for(const k of ['regional','disaster','bushfire','remote','northern']){
    const n = COV[k], pct = Math.round(n / COV._total * 100);
    const div = document.createElement('div');
    div.innerHTML = `<span>${esc(covName(k))}</span><b>${n}</b><i>${esc(T('p_cov_unit', {pct}))}</i>`;
    covEl.appendChild(div);
  }
}

const tb = document.querySelector('#imap tbody');
function drawTable(){
  tb.innerHTML = '';
  for(const ind of INDS){
    if(!ind.areas) continue;
    const label = lang === 'zh' ? ind.label : (ind.label_en || ind.en);
    const scope = lang === 'zh' ? ind.scope : (ind.scope_en || ind.scope);
    // 中文版把英文原名附在下面（官網用語，查得到）；英文版就是原名，不必重複
    const sub = lang === 'zh' ? `<em>${esc(ind.en)}</em>` : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `<th scope="row">${esc(label)}${sub}</th>`
      + `<td>${ind.areas.map(a => esc(covName(a))).join(T('p_area_join'))}</td>`
      + `<td class="sc">${esc(scope || '')}</td>`;
    tb.appendChild(tr);
  }
}

// 哪些產業跟建築吃同一張表——這是最常被問的一句
function drawSameList(){
  const base = JSON.stringify(INDS.find(i => i.en === 'Construction').areas);
  const same = INDS.filter(i => i.en !== 'Construction' && JSON.stringify(i.areas) === base)
                   .map(i => lang === 'zh' ? i.label : (i.label_en || i.en));
  document.getElementById('samelist').innerHTML = T('p_samelist', {
    same: esc(joinList(same)), tour: COV._tourism, reg: COV.regional,
    ratio: Math.round(COV.regional / COV._tourism),
  });
}

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
    ? esc(T('hits_found', {n:list.length}) + (extra > 0 ? T('hits_more', {n:40}) : '') + T('p_hits_tail'))
    : esc(T('hits_none', {q:term}))}</p>`);
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

let shownPc = null;   // 記住目前顯示哪一筆，切語言時要重畫
// 索引鍵去掉了前導零（'872'），顯示要補回四位，否則 NT 的 08xx 看起來像打錯
const pad4 = n => String(n).padStart(4, '0');
function render(key){
  const hit = IDX[key];
  if(!hit){
    shownPc = null;
    show(`<p class="hint">${T('p_nf_pc', {pc:esc(key)})}</p>`);
    return;
  }
  shownPc = key;
  const v = key;
  const [stKey, name, f] = hit;
  const s = stateOf(stKey), cat = cats()[catOf(f)];
  const routes = [];
  if(f & BIT_FIRE) routes.push(T('p_route_fire'));
  if(f & BIT_DISASTER) routes.push(T('p_route_flood'));
  const extra = routes.length ? '<br>' + esc(T('p_also_declared', {list:joinList(routes)})) : '';
  const link = s.url
    ? `<a class="golink" href="${s.url}#pc=${parseInt(v,10)}"${/^https?:/.test(s.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(T('p_golink', {state:stLabel(s)}))}</a>`
    : `<p class="nomap">${esc(T('p_nomap_line', {state:stLabel(s)}))}</p>`;
  show(`<div class="verdict" style="--vc:${cat.c}">
      <span class="chip"></span>
      <div class="body">
        <div><span class="pc">${pad4(v)}</span> <span class="where">${esc(T('p_where', {name, state:stLabel(s)}))}</span></div>
        <div class="say">${esc(cat.say)}</div>
        <div class="sub">${esc(cat.sub)}${extra}</div>
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

// ---- 套用語言 ----
const langBtn = document.getElementById('lang');
function applyLang(){
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.title = T('p_title');

  for(const n of document.querySelectorAll('[data-t]'))      n.innerHTML = T(n.getAttribute('data-t'));
  for(const n of document.querySelectorAll('[data-t-ph]'))   n.setAttribute('placeholder', T(n.getAttribute('data-t-ph')));
  for(const n of document.querySelectorAll('[data-t-aria]')) n.setAttribute('aria-label', T(n.getAttribute('data-t-aria')));

  // 帶連結或變數的句子，佔位符在 strings.json 裡，這裡才組得起來
  const a = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${esc(text)}</a>`;
  document.getElementById('disclaim').innerHTML =
    T('p_disclaim', {link: a(META.source_url, T('p_official_page'))});
  document.getElementById('basisnote').innerHTML =
    T('p_basis_note2', {link: a(META.source_url, T('p_official_text'))});
  document.getElementById('note4').innerHTML = T('p_note4_b', {
    ha: a(META.source_url, T('p_ha_link')),
    da: a('https://www.disasterassist.gov.au/find-a-disaster', T('p_da_link')),
  });
  document.getElementById('stamp').textContent =
    T('p_stamp', {d: META.page_date, b: META.built_at});
  document.getElementById('hint').textContent =
    T('p_hint', {n: META.n_postcodes, m: META.n_maps});

  if(DATA.meta.channel === 'dev'){
    const bar = document.getElementById('devbar');
    if(bar){
      bar.hidden = false;
      bar.innerHTML = esc(T('dev_banner')) + `<a href="../">${esc(T('dev_stable_link'))}</a>`;
    }
  }

  langBtn.textContent = lang === 'zh' ? 'EN' : '中文';
  langBtn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切換為中文');

  fillIndustries();
  drawCov();
  drawTable();
  applyIndustry();          // 會重畫地圖、卡片、同表清單，必要時重跑查詢
  if(shownPc) render(shownPc);
}
langBtn.addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', lang); } catch (_) {}
  applyLang();
});

applyLang();   // 初次繪製。放最後是因為它會用到上面宣告的每一樣東西。
