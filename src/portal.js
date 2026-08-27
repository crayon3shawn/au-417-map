// @ts-check
const DATA = __DATA__;
const STATES = DATA.states, META = DATA.meta;

// 郵區索引拆成兩份。旗標表（州別＋地區表旗標）小，內嵌——地圖上色、各州統計、
// 行政區統計都要用它，延後載入的話一進頁面會先看到一張沒有顏色的地圖。
// 地名表大（約 216 KB）而且只有「用地名搜尋」才需要，所以抽成一個共用檔，
// 入口頁與四個州頁指向同一個網址，瀏覽器只下載一次。
const IDX = {};                       // 郵區 -> [州, 旗標]
for(const st in META.nat) for(const pc in META.nat[st]) IDX[pc] = [st, META.nat[st][pc]];
let NAMES = META.index_inline || null;   // 郵區 -> "地名|地名|…"，可能還沒載入
const stOf = pc => (IDX[pc] || [])[0];
const flagOf = pc => (IDX[pc] || [])[1] || 0;
const namesOf = pc => (NAMES && NAMES[pc] ? NAMES[pc].split('|') : []);
const mainName = pc => namesOf(pc)[0] || pc;
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
// 索引鍵去掉了前導零（'872'），顯示要補回四位，否則 NT 的 08xx 看起來像打錯
const pad4 = n => String(n).padStart(4, '0');
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
// 目前顯示的是哪一筆（郵區或行政區）。換產業／換語言時要照原樣重畫，
// 所以宣告在所有會用到它的函式之前。
let shownPc = null, shownName = null, shownRegion = null;
function cats(){
  const n = indLabel();
  return {
    work:    {c:CAT_COLOR.work,    say:T('cat_work', {ind:n}),   sub:T('v_work_yes_sub', {ind:n})},
    rebuild: {c:CAT_COLOR.rebuild, say:T('cat_rebuild'),         sub:T('p_rebuild_sub', {ind:n})},
    none:    {c:CAT_COLOR.none,    say:T('cat_none'),            sub:T('p_none_sub')},
  };
}
// 查單一郵區時，判定字永遠講到底是哪一張表。Bushfire 與 Natural disaster 在
// 官網是兩張獨立的表，起算日差兩年半（2019-07-31 vs 2021-12-31）——建築的
// 638 個「只有重建算」郵區裡有 348 個只落在其中一張上，併起來講等於把該走
// 哪條路、用哪個日期都藏起來。州頁的 sayOf() 是同一套邏輯。
function sayOf(f){
  if(f & industry.mask) return T('cat_work', {ind: indLabel()});
  if((f & BIT_FIRE) && (f & BIT_DISASTER)) return T('cat_both');
  if(f & BIT_FIRE) return T('cat_fire_only');
  if(f & BIT_DISASTER) return T('cat_flood_only');
  return T('cat_none');
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
  // 跟各州頁同一種卡片：標題列說這張卡在講什麼，內容區放範圍與官方連結。
  const tables = (industry.areas || []).map(covName).join(T('p_area_join'));
  document.getElementById('indnote').innerHTML =
    `<div class="hd">${esc(T('industry_table'))}</div>`
    + `<div class="bd">${esc(indScope() || '')} `
    + `${HA}${esc(T('official_def', {tables}))}</a></div>`;
  // 原本這裡還有一句「切換產業會改變下面的判定與各州統計」加上「462 不適用」。
  // 前者是在解釋一個一看就懂的下拉選單；後者在頁面上另外還有三處（下方的
  // 說明段落、溯源細帶、地圖出處），不會因為這裡拿掉就沒人看得到。
  drawStates();
  drawCards();
  drawSameList();
  // 換產業／換語言之後要把目前看的東西重畫一次。不能一律走 lookup()——
  // 有些行政區名同時也是地名（Newcastle、Cairns、Sydney），重查會退回列表，
  // 使用者已經選好的區域就被收起來了。
  if(shownRegion) showRegion(shownRegion);
  else if(shownPc) render(shownPc, shownName);
  else if(q.value.trim()) lookup();
  else clearShown();          // 初次載入也要把空狀態畫出來
}
indSel.addEventListener('change', () => {
  industry = DATA.industry_masks.find(i => i.key === indSel.value) || industry;
  // 產業要一起帶進網址：判定取決於它，只帶 pc 貼給別人會看到不同的答案
  writeUrlState(industry.key, shownPc);
  applyIndustry();
});
const stateOf = k => STATES.find(s => s.key === k);

// ---- 行政區 ----
// 職缺廣告是用行政區名寫的（「Central Coast」「Moreton Bay」），郵政資料裡
// 只有地名，所以另外從 ABS 的 LGA 圖層算了一份對照表。這只是查詢的入口——
// 判定永遠來自郵區，一個行政區內的郵區判定可以不一致。
const REGIONS = (DATA.regions || []).map(([name, st, pcs]) => ({name, st, pcs}));
function regionStats(r){
  const n = {work:0, rebuild:0, none:0};
  for(const pc of r.pcs){
    if(IDX[String(pc)]) n[catOf(flagOf(String(pc)))]++;
  }
  return n;
}

// ---- 州別導覽 ----
// 跟各州頁的標頭同一套。有了它，各州卡片就不再是唯一的導覽路徑，
// 可以下放到說明區當「分布概況」看。
function drawNav(){
  const nav = document.getElementById('nav');
  if(!nav) return;
  nav.innerHTML = '';
  for(const s of STATES){
    if(!s.url) continue;
    const a = document.createElement('a');
    a.href = s.url;
    a.textContent = s.abbr;
    if(/^https?:/.test(s.url)){ a.target = '_blank'; a.rel = 'noopener'; }
    nav.appendChild(a);
  }
}

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
const vbW = (x1-x0)+pad*2, vbH = (y1-y0)+pad*2;
svg.setAttribute('viewBox', `${x0-pad} ${y0-pad} ${vbW} ${vbH}`);
svg.setAttribute('preserveAspectRatio','xMidYMid meet');
// 手機上讓地圖窗格的高度跟著澳洲的形狀走。固定高度（例如 52vh）配上橫向的
// 澳洲，上下會各留一大條空白。CSS 只吃得到這個比例，算不出來，所以由這裡給。
document.documentElement.style.setProperty('--au-aspect', (vbW / vbH).toFixed(3));
const at = el('title',{id:'autitle'});
svg.appendChild(at);

// 各州統計依選定產業即時算，不用 build 端算好的固定值——換產業數字要跟著變
function statsFor(s){
  let work = 0, rebuild = 0, none = 0;
  for(const pc in IDX){
    if(IDX[pc][0] !== s.key) continue;
    const f = IDX[pc][1];
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
  const node = el('path',{class:'st' + (s.mapped ? '' : ' nomap'), d,
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
    const fs = (x1-x0)*0.034;
    const lbl = el('text',{class:'stlbl',
      x:px(s.label_at[0]).toFixed(2), y:py(s.label_at[1]).toFixed(2),
      'font-size':fs, 'stroke-width':fs*0.07});
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
  // 有網址就請人去看；沒網址但這個州其實有地圖（局部預覽）就什麼都不說——
  // 「尚無地圖」是假的，「看地圖 →」又點不動，留白才是誠實的。
  const status = s.url ? T('p_card_go')
               : s.mapped ? ''
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
    <div class="mix">${seg(s.work,'var(--c-work)')}${seg(s.rebuild,'var(--c-rebuild)')}${seg(s.none,'var(--c-none)')}</div>
    ${detail}`;
  let node;
  if(s.url){ node = document.createElement('a'); node.href = s.url; node.className = 'statecard';
             if(/^https?:/.test(s.url)){ node.target = '_blank'; node.rel = 'noopener'; } }
  else { node = document.createElement('div');
         node.className = 'statecard ' + ((note || s.mapped) ? 'off' : 'nomap'); }
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
// 判定色掛在容器上（--vc），不是掛在每一段內容上——左邊那條色帶是 .ans 的
// 偽元素，色值必須由容器提供。傳 null 代表沒有判定（清空、找不到）。
function show(html, vc, none){
  if(vc) result.style.setProperty('--vc', vc);
  else result.style.removeProperty('--vc');
  result.classList.toggle('no', !!none);
  result.innerHTML = html;
}

// 地名索引：多數人知道自己在哪個鎮，不知道郵區號碼。
// 要等地名表載進來才建得起來。
let byName = [];
function buildNameIndex(){
  byName = [];
  if(!NAMES) return;
  for(const pc in NAMES){
    const st = stOf(pc);
    if(!st) continue;
    for(const nm of NAMES[pc].split('|')) byName.push([nm.toLowerCase(), pc, nm, st]);
  }
}
const clearHits = () => { hitsEl.innerHTML = ''; };

// 區域列排在地名之前——打「Cairns」時行政區是比較大的答案，先給它。
function regionRow(r){
  const n = regionStats(r);
  const total = (n.work + n.rebuild + n.none) || 1;
  const seg = (c, v) => c ? `<i style="width:${(c/total*100).toFixed(1)}%;background:${v}"></i>` : '';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'reg';
  b.innerHTML = `<span class="rn">${esc(r.name)}</span>`
    + `<u>${esc((stateOf(r.st) || {abbr:r.st.toUpperCase()}).abbr)}</u>`
    + `<span class="rc">${esc(T('p_reg_count', {n:r.pcs.length}))}</span>`
    + `<span class="rbar">${seg(n.work,'var(--c-work)')}${seg(n.rebuild,'var(--c-rebuild)')}${seg(n.none,'var(--c-none)')}</span>`;
  b.addEventListener('click', () => { q.value = r.name; showRegion(r); });
  return b;
}

function showRegion(r){
  shownRegion = r; shownPc = null; shownName = null;
  setHint('');
  const n = regionStats(r);
  const ind = indLabel();
  const only = n.rebuild === 0 && n.none === 0 ? T('p_reg_all_work', {ind})
             : n.work === 0 && n.none === 0    ? T('p_reg_all_rebuild', {ind})
             : n.work === 0 && n.rebuild === 0 ? T('p_reg_all_none')
             : T('p_reg_mixed');
  const cat = n.rebuild === 0 && n.none === 0 ? 'work'
            : n.work === 0 && n.none === 0    ? 'rebuild'
            : n.work === 0 && n.rebuild === 0 ? 'none' : null;
  // 郵區清單直接放進網址，州頁就不必多存一份行政區對照表
  const st = stateOf(r.st);
  const mapLink = (st && st.url)
    ? `<a class="golink" href="${st.url}#lga=${encodeURIComponent(r.name + '|' + r.pcs.join(','))}"`
      + `${/^https?:/.test(st.url) ? ' target="_blank" rel="noopener"' : ''}>`
      + `${esc(T('p_reg_open_map', {state: stLabel(st)}))}</a>`
    : '';
  // 判定不一致時沒有代表色可用。用 --line-2 會讓標題比內文還淡、主次顛倒，
  // 所以退回一般文字色，而不是更淡的線條色。
  show(`<div class="ans"><span class="rgn">${esc(r.name)}</span>
        <span class="say">${esc(only)}</span>
        <span class="loc">${esc(T('p_reg_count', {n:r.pcs.length}))}</span></div>
      <div class="bd">
        <div class="sub">${esc(T('p_reg_lead'))}</div>
        <div class="legend2">
          <span style="--sw:var(--c-work)"><i></i>${esc(T('p_leg_work', {ind}))} <b>${n.work}</b></span>
          <span style="--sw:var(--c-rebuild)"><i></i>${esc(T('p_leg_rebuild'))} <b>${n.rebuild}</b></span>
          <span style="--sw:var(--c-none)"><i></i>${esc(T('p_leg_none'))} <b>${n.none}</b></span>
        </div>
        ${mapLink}
      </div>`,
    cat ? CAT_COLOR[cat] : 'var(--ink)', cat === 'none');
  clearHits();
  for(const pc of r.pcs){
    const key = String(pc);
    if(!IDX[key]) continue;
    const s = stateOf(stOf(key)), nm = mainName(key);
    const b = document.createElement('button');
    b.type = 'button';
    b.style.setProperty('--hc', CAT_COLOR[catOf(flagOf(key))]);
    b.innerHTML = `<em></em><b>${pad4(pc)}<u>${esc(s.abbr)}</u></b><i>${esc(nm)}</i>`;
    b.addEventListener('click', () => { q.value = nm; clearHits(); render(key, nm); });
    hitsEl.appendChild(b);
  }
}

function showHits(list, term, regs){
  clearHits();
  // 出現候選清單時要把上一筆答案收掉。不清的話，查「gosford」會看到候選是
  // Gosford 的五筆、但右邊還停在上一次查「gold coast」的區域卡片。
  shownPc = null; shownName = null; shownRegion = null;
  show(`<div class="empty">${esc(T('detail_empty'))}</div>`);
  for(const r of (regs || []).slice(0, 8)) hitsEl.appendChild(regionRow(r));
  for(const [pc, nm, st] of list.slice(0, 40)){
    const f = flagOf(pc), s = stateOf(st);
    const b = document.createElement('button');
    b.type = 'button';
    b.style.setProperty('--hc', CAT_COLOR[catOf(f)]);
    b.innerHTML = `<em></em><b>${pad4(pc)}<u>${esc(s.abbr)}</u></b><i>${esc(nm)}</i>`;
    b.addEventListener('click', () => { q.value = nm; clearHits(); render(pc, nm); });
    hitsEl.appendChild(b);
  }
  const extra = list.length - 40;
  const nreg = (regs || []).length;
  // 行政區與地名可能同時命中（打「Cairns」兩種都有），兩邊的筆數都要講，
  // 不然使用者不知道下面那些列是兩種東西混在一起。
  const parts = [];
  if(nreg) parts.push(T('p_reg_found', {q:term, n:nreg}));
  if(list.length) parts.push(T('hits_found', {n:list.length})
                             + (extra > 0 ? T('hits_more', {n:40}) : '')
                             + T('p_hits_tail'));
  setHint(parts.length ? parts.join(' ') : T('hits_none', {q:term}));
}

// 清掉目前顯示的東西。輸入框空了就該回到初始狀態，否則換語言／換產業時
// 那些函式會照著 shownPc 把舊結果又畫回來。
// 提示列在搜尋框下面，只在「還沒查」或「查詢有話要說」時出現。
// 有結果時讓位給結果本身，跟州頁的 qhint 一樣。
function setHint(s){
  const h = document.getElementById('hint');
  if(h) h.textContent = s;
}

function clearShown(){
  shownPc = null; shownName = null; shownRegion = null;
  writeUrlState(industry.key, null);
  clearHits();
  show(`<div class="empty">${esc(T('detail_empty'))}</div>`);
  setHint(T('p_hint', {n: META.n_postcodes, m: META.n_maps}));
}

function lookup(){
  const v = q.value.trim();
  if(!v){ clearShown(); return; }
  if(!/^\d{3,4}$/.test(v)){
    // 郵區號碼不必等地名表；用地名查就得等。載好之後會自動重跑一次。
    if(!NAMES){ clearHits(); setHint(T('loading_index')); return; }
    const term = v.toLowerCase();
    const starts = [], contains = [];
    for(const [low, pc, nm, st] of byName){
      if(low.startsWith(term)) starts.push([pc, nm, st]);
      else if(low.includes(term)) contains.push([pc, nm, st]);
    }
    const list = starts.concat(contains);
    const regs = REGIONS.filter(r => r.name.toLowerCase().includes(term));
    // 只對到一個行政區、而且沒有地名同名，就直接展開它——打完整的
    // 「central coast」不該還要再點一次。
    if(regs.length === 1 && !list.length){ showRegion(regs[0]); return; }
    // 只剩一筆就直接顯示結果，但**不能動輸入框**——這是每敲一個鍵都會跑的
    // 路徑，改掉 value 等於搶走使用者正在打的字。打「central c」時全澳只有
    // Central Colo 一筆，輸入框被換成它，接著打的 oast 就接在後面變成
    // 「Central Colooast」，再也查不到東西。點選結果時改 value 才是對的，
    // 那是使用者明確選的。
    if(list.length === 1 && !regs.length){ clearHits(); render(list[0][0]); return; }
    showHits(list, v, regs);
    return;
  }
  clearHits();
  render(String(parseInt(v,10)));
}

// pick 是使用者實際點的那個地名。一個郵區底下可能有幾十個地名，點了
// 「Gosford」卻顯示代表地名「Calga」會讓人以為點錯了。
function render(key, pick){
  shownRegion = null;
  const hit = IDX[key];
  if(!hit){
    shownPc = null; shownName = null;
    show(`<div class="empty">${T('p_nf_pc', {pc:esc(key)})}</div>`);
    return;
  }
  shownPc = key; shownName = pick || null;
  writeUrlState(industry.key, key);
  setHint('');
  const v = key;
  const stKey = hit[0], f = hit[1];
  const name = pick || mainName(key);
  const s = stateOf(stKey), cat = cats()[catOf(f)];
  // 表名要寫出來：送件時官方問的就是這個，而兩張表的起算日不一樣
  const routes = [];
  if(f & BIT_FIRE) routes.push(T('p_route_fire'));
  if(f & BIT_DISASTER) routes.push(T('p_route_flood'));
  const extra = routes.length ? '<br>' + esc(T('p_also_declared', {list:joinList(routes)}))
    + [(f & BIT_FIRE) ? T('tbl_bushfire') : '', (f & BIT_DISASTER) ? T('tbl_disaster') : '']
        .filter(Boolean).map(s => `<br><em class="tbl">${esc(s)}</em>`).join('')
    : '';
  // s.mapped 而不是 s.url：這句話是在陳述「這個州有沒有地圖」，
  // 而不是「這次建置有沒有它的網址」。局部的 Artifact 預覽只發了部分州頁時，
  // 用 url 判斷會對 NSW 說「還沒做地圖」——那是假的，而且使用者看得到。
  const link = s.url
    ? `<a class="golink" href="${s.url}#pc=${parseInt(v,10)}"${/^https?:/.test(s.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(T('p_golink', {state:stLabel(s)}))}</a>`
    : s.mapped ? ''
    : `<p class="nomap">${esc(T('p_nomap_line', {state:stLabel(s)}))}</p>`;
  // 版面跟州頁的答案面板一模一樣：郵遞區號 38px 等寬，判定色走左邊色帶與判定字。
  // 兩頁共用同一個 .detail/.ans 結構，使用者從入口頁點進州頁不必重新認一次。
  show(`<div class="ans"><span class="pcn">${pad4(v)}<u>${esc(s.abbr)}</u></span>
        <span class="say">${esc(sayOf(f))}</span>
        <span class="loc">${esc(name)}</span></div>
      <div class="bd"><div class="sub">${esc(cat.sub)}${extra}</div>${link}</div>`,
    cat.c, catOf(f) === 'none');
}
// 打字就查，沒有「查」按鈕。條件跟州頁一致——原本入口頁漏掉三位數郵區
// （北領地的 0800 打完不會自動查，只能按按鈕），那是條件寫得不一致，不是按鈕的價值。
q.addEventListener('keydown', e => { if(e.key === 'Enter') lookup(); });
q.addEventListener('input', () => {
  const v = q.value.trim();
  if(v.length >= 2 && !/^\d{1,2}$/.test(v)) lookup();
  else clearShown();
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
  // 法規那一句放這裡不放頁首：頁首要短，而且對使用者來說「這不是政府網站」
  // 比「不構成移民協助」有用得多。這裡有空間講完整。
  document.getElementById('note4').innerHTML = T('p_note4_b', {
    ha: a(META.source_url, T('p_ha_link')),
    da: a('https://www.disasterassist.gov.au/find-a-disaster', T('p_da_link')),
  }) + ` <span class="dim">${esc(T('not_assistance'))}</span>`;
  document.getElementById('stamp').textContent =
    T('p_stamp', {d: META.page_date, b: META.built_at});
  // #hint 住在 #result 裡面，顯示查詢結果時整塊會被換掉，這個元素就不在了。
  // 沒有防呆的話這裡會丟例外，applyLang 後面的東西（包括重畫目前的結果）
  // 全部不會跑——切語言看起來像「只換了一半」。
  const hintEl = document.getElementById('hint');
  if(hintEl) hintEl.textContent = T('p_hint', {n: META.n_postcodes, m: META.n_maps});

  // 開發版只在本機建（CHANNEL=dev），不上 Pages。橫幅是提醒手上這份不是
  // 線上那份，連結指向已發佈的站台方便對照。
  if(META.channel === 'dev'){
    const bar = document.getElementById('devbar');
    if(bar){
      bar.hidden = false;
      bar.innerHTML = esc(T('dev_banner')) + (META.site_url
        ? `<a href="${META.site_url}" target="_blank" rel="noopener">${esc(T('dev_stable_link'))}</a>`
        : '');
    }
  }

  langBtn.textContent = lang === 'zh' ? 'EN' : '中文';
  langBtn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切換為中文');

  drawNav();
  fillIndustries();
  drawCov();
  drawTable();
  applyIndustry();          // 會重畫地圖、卡片、同表清單，以及目前顯示的結果
}
langBtn.addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', lang); } catch (_) {}
  applyLang();
});

// 地名表是共用檔，跟四個州頁指向同一個網址，所以多半直接命中瀏覽器快取。
// 抓失敗不讓整頁掛掉——郵區號碼查詢與地圖都不依賴它。
function loadNames(){
  if(NAMES){ buildNameIndex(); return; }
  if(!META.index_url) return;
  fetch(META.index_url)
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if(!d) return;
      NAMES = d;
      buildNameIndex();
      if(q.value.trim()) lookup();     // 補上載入期間打的字
      else clearShown();
    })
    .catch(() => {});
}

// 網址帶進來的狀態。產業要在郵區之前套用——判定取決於產業，順序反了會先
// 算出一個錯的答案再改掉。
const urlState = readUrlState();
if(urlState.ind){
  const found = DATA.industry_masks.find(i => i.key === urlState.ind);
  if(found){ industry = found; indSel.value = found.key; }
}
if(urlState.pc) q.value = urlState.pc;

applyLang();   // 初次繪製。放最後是因為它會用到上面宣告的每一樣東西。
loadNames();
