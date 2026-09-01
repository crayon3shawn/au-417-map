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
// 位元記的是地區表成員資格，判定取決於問的是哪一組產業
const BIT_FIRE = 8, BIT_DISASTER = 16, REBUILD = BIT_FIRE | BIT_DISASTER;
const catFor = (f, mask) => (f & mask) ? 'work' : (f & REBUILD) ? 'rebuild' : 'none';

// 查一個郵區，答案直接把所有產業一次講完，不要求使用者先承諾一個行業。
//
// 可以這樣做是因為 417 的六個產業只有兩種地區組合：建築／農牧／礦業／漁業
// 與採珠／林業伐木走 regional，觀光與餐旅走 remote + northern。所以「六個
// 選項」實際上只有兩個答案，列出來最多兩列。
//
// 而這兩個答案分歧得很厲害——全澳 2715 個郵區裡有 1404 個（51.7%）兩組判定
// 不同。先選產業的話，超過一半的查詢會因為一個使用者沒意識到自己做過的選擇
// 而拿到相反的答案。最極端的是 Rottnest Island（6161）與 Norfolk Island
// （2899）：預設的建築業回答「完全不算」，但那兩座島上實際存在的工作是觀光
// 餐旅，而觀光餐旅「算」。
//
// 分組從 industry_masks 現算，不寫死。哪天官網把某一行移到別張表，這裡會
// 自己變成三組。
function indGroups(){
  const out = [];
  for(const i of DATA.industry_masks){
    const nm = lang === 'zh' ? i.label : (i.label_en || i.label);
    const g = out.find(x => x.mask === i.mask);
    if(g) g.names.push(nm); else out.push({mask: i.mask, names: [nm]});
  }
  return out;
}

let industry = DATA.industry_masks.find(i => i.key === DATA.industry) || DATA.industry_masks[0];
// 各州統計、行政區分布、候選清單的色點仍然要挑一個產業來數——那些是分布，
// 不是判定，一次只能用一把尺。郵區判定已經不走這條路了。
const catOf = f => catFor(f, industry.mask);

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
    + `${HA}${esc(T('official_def', {tables}))}</a>`
    + `<div class="what">${esc(T('p_ind_what'))}</div></div>`;
  // 這個選擇器已經不決定郵區判定了（判定一次列出全部產業），所以要講一句它
  // 現在管什麼——不然使用者會以為自己選錯了行會看到錯的答案。
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
  // 產業仍然帶進網址：郵區判定已經跟它無關，但各州統計與行政區分布還是
  // 照它來數，貼給別人時那些數字要一樣。
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
  // 全部同一個顏色。這張圖的工作是**導覽**——點哪一州進哪一張地圖，
  // 以及哪幾州沒有地圖（虛線邊框）。
  //
  // 原本按「優勢類別」上色（該州最多的是 work 還是 rebuild），但整州取一個
  // 代表色沒有可用的資訊：一個州內部本來就混雜，塗成綠的不代表你那塊算，
  // 塗成琥珀也不代表不算——真正的答案要點進去看那一州的地圖，或直接查郵區。
  // 拿顏色講一個使用者不能據以行動的統計量，只會讓人誤以為那是判定。
  //
  // 填色交給 CSS（.st），不寫在屬性上——CSS 才能處理 hover 與深淺色主題。
  const node = el('path',{class:'st' + (s.mapped ? '' : ' nomap'), d,
    'vector-effect':'non-scaling-stroke'});
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
  // 「看哪張郵區表」那一欄其實只有兩種值：建築／農牧／礦業／漁業與採珠／
  // 林業伐木都走 Regional，只有觀光餐旅走 Remote + Northern。逐列各印一次
  // 會看起來像六條互不相干的規則，用 rowspan 併起來，表格自己就把「只有
  // 兩類」講出來了。
  //
  // 範圍那一欄不能併。每個產業的定義都不一樣，而那一欄存在的理由正是避免
  // 把不算的工作誤認為算——農牧的二次加工（釀酒、製麵、加工肉品）不算、
  // 礦業的支援服務算，這種事沒有第二個地方會講。
  //
  // 分組的依據是 areas 不是 mask：DATA.industries 這一份沒有 mask 欄位
  // （那是 DATA.industry_masks 才有的），拿 undefined 去比會把六個產業
  // 全部併成一組，表格會印出 rowspan=6 加上一個對五種產業都錯的表名。
  const groups = [];
  for(const ind of INDS){
    if(!ind.areas) continue;
    const sig = JSON.stringify(ind.areas);
    const g = groups.find(x => x.sig === sig);
    if(g) g.inds.push(ind); else groups.push({sig, areas: ind.areas, inds: [ind]});
  }
  for(const g of groups){
    const areas = g.areas.map(a => esc(covName(a))).join(T('p_area_join'));
    g.inds.forEach((ind, i) => {
      const label = lang === 'zh' ? ind.label : (ind.label_en || ind.en);
      const scope = lang === 'zh' ? ind.scope : (ind.scope_en || ind.scope);
      // 中文版把英文原名附在下面（官網用語，查得到）；英文版就是原名，不必重複
      const sub = lang === 'zh' ? `<em>${esc(ind.en)}</em>` : '';
      const tr = document.createElement('tr');
      if(i === 0) tr.className = 'grp';
      tr.innerHTML = `<th scope="row">${esc(label)}${sub}</th>`
        + (i === 0 ? `<td${g.inds.length > 1 ? ` rowspan="${g.inds.length}"` : ''}>${areas}</td>` : '')
        + `<td class="sc">${esc(scope || '')}</td>`;
      tb.appendChild(tr);
    });
  }
}

// 兩張表差多少。上面的表格已經用 rowspan 把「誰跟誰吃同一張表」畫出來了，
// 這裡補的是它畫不出來的東西：兩張表的大小差一個數量級。
function drawSameList(){
  document.getElementById('samelist').innerHTML = T('p_samelist', {
    tour: COV._tourism, reg: COV.regional,
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
  show(`<div class="empty">${esc(T('p_detail_empty'))}</div>`);
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
  show(`<div class="empty">${esc(T('p_detail_empty'))}</div>`);
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
  const s = stateOf(stKey);
  // 每一組產業各給一個判定。兩組相同時（全澳 48.3% 的郵區）收成標題那一句，
  // 不列出來——「不分產業，一般工作就算」已經把話講完了，再列兩行同樣的結論
  // 只是把答案變長。
  const groups = indGroups().map(g => ({names: g.names, cat: catFor(f, g.mask)}));
  const uniform = groups.every(g => g.cat === groups[0].cat);
  const anyWork = groups.some(g => g.cat === 'work');
  // 鍵寫成字面量。測試掃的是原始碼裡的 T('...')，'p_all_' + cat 這種拼法
  // 「用到的鍵都存在」與「沒有沒人用的鍵」兩個守衛都會漏掉。
  const SAY_ALL = {work: T('p_all_work'), rebuild: T('p_all_rebuild'), none: T('p_all_none')};
  const SAY_GRP = {work: T('p_grp_work'), rebuild: T('p_grp_rebuild'), none: T('p_grp_none')};
  const say = uniform ? SAY_ALL[groups[0].cat] : T('p_depends');
  // 判定不一致時沒有代表色可用，退回一般文字色——跟 showRegion() 同一個處理。
  const band = uniform ? CAT_COLOR[groups[0].cat] : 'var(--ink)';
  // 表名要寫出來：送件時官方問的就是這個。頁面上不再印起算日（2019-07-31 與
  // 2021-12-31 都已經過去好幾年，對「找工作前先確認」的人永遠成立），表名就是
  // 使用者回官網查細則的入口。
  const routes = [];
  if(f & BIT_FIRE) routes.push(T('p_route_fire'));
  if(f & BIT_DISASTER) routes.push(T('p_route_flood'));
  const tbls = [(f & BIT_FIRE) ? T('tbl_bushfire') : '', (f & BIT_DISASTER) ? T('tbl_disaster') : '']
      .filter(Boolean).map(x => `<em class="tbl">${esc(x)}</em>`).join('<br>');
  const anyRebuild = groups.some(g => g.cat === 'rebuild');
  // 表名掛在它解釋的那一列下面（跟州頁的答案面板同一個做法），不另外寫一句
  // 「這裡也被宣告為災區：…」——那句話跟「只有災後重建工作算」這一列講的是
  // 同一件事，兩個都印就是同一件事講兩次。
  const rows = uniform ? '' : groups.map(g =>
      `<div class="verdict" style="--vc:${CAT_COLOR[g.cat]}"><span class="dot"></span>`
      + `<span><b>${esc(SAY_GRP[g.cat])}</b><br>${esc(joinList(g.names))}`
      + (g.cat === 'rebuild' && tbls ? `<br>${tbls}` : '') + `</span></div>`
    ).join('');
  const notes = [];
  // 兩組收成標題那一句時就沒有判定列可以掛表名了，改用一句話帶出來。
  // 「也」只有在一般工作本來就算的時候才成立——沒有任何一組算的話，災後重建
  // 是唯一的路，不是額外多一條。
  if(uniform && tbls)
    notes.push(esc(T(anyWork ? 'p_also_declared' : 'p_declared', {list:joinList(routes)})) + '<br>' + tbls);
  if(uniform && groups[0].cat === 'none') notes.push(esc(T('p_none_sub')));
  if(anyRebuild) notes.push(esc(T('p_rebuild_note')));
  const body = rows + (notes.length ? `<div class="sub">${notes.join('<br>')}</div>` : '');
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
        <span class="say">${esc(say)}</span>
        <span class="loc">${esc(name)}</span></div>
      <div class="bd">${body}${link}</div>`,
    band, uniform && groups[0].cat === 'none');
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
  document.getElementById('basisnote').innerHTML =
    T('p_basis_note2', {link: a(META.source_url, T('p_official_text'))});
  renderFoot(document.getElementById('foot'), {
    T, esc, sourceUrl: META.source_url,
    pageDate: META.page_date, builtAt: META.built_at,
  });
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
