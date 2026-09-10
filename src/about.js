// 說明頁。它沒有地圖、沒有搜尋、沒有郵區資料——只有語言切換與把 data-t 填進去。
//
// 為什麼不共用 portal.js：那支要 DATA（郵區索引、輪廓、統計）才跑得起來，
// 而說明頁不需要那 200 KB。共用的代價是把一整份資料塞進一個純文字頁面。
//
// 共用的是「怎麼填字」這件事的規則，不是程式碼：data-t 用 innerHTML（字串
// 裡有 <strong> 與連結），data-t-aria 走 aria-label。三頁一致。
'use strict';

const DATA = __DATA__;
const META = DATA.meta;
const S = META.strings;
const savedLang = (() => { try { return localStorage.getItem('lang'); } catch (_) { return null; } })();
let lang = (savedLang === 'zh' || savedLang === 'en') ? savedLang : 'zh';

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function T(key, vars){
  const e = S[key];
  let s = e ? (e[lang] !== undefined ? e[lang] : e.zh) : key;
  if(vars) for(const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

function drawNav(){
  const nav = document.getElementById('nav');
  if(!nav) return;
  nav.innerHTML = '';
  // 先回全澳入口，再列各州。跟入口頁用同一份 DATA.states。
  const home = document.createElement('a');
  home.href = META.home_url || 'index.html';
  home.textContent = T('nav_home');
  nav.appendChild(home);
  for(const s of DATA.states){
    if(!s.url) continue;
    const a = document.createElement('a');
    a.href = s.url;
    a.textContent = s.abbr;
    if(/^https?:/.test(s.url)){ a.target = '_blank'; a.rel = 'noopener'; }
    nav.appendChild(a);
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
      // 窄螢幕上表格會攤成一疊卡片，那時 rowspan 的儲存格只會出現在該組的
      // 第一張卡上，其餘四張就不知道自己看哪張表。每一列都帶著表名，卡片
      // 模式用 ::before 印出來（見 portal.css）。表格模式仍走 rowspan。
      tr.dataset.areas = g.areas.map(a => covName(a)).join(T('p_area_join'));
      tr.innerHTML = `<th scope="row">${esc(label)}${sub}</th>`
        + (i === 0 ? `<td class="areas"${g.inds.length > 1 ? ` rowspan="${g.inds.length}"` : ''}>${areas}</td>` : '')
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

// 資料出處。原本在三頁的頁尾各印一次，現在只有這裡有。
// ABS 那一筆是 CC BY 4.0，標示出處是授權條件——這份清單不能省。
const SRC = [
  [META.source_url, 'foot_src_ha'],
  ['https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/POA/MapServer', 'foot_src_abs'],
  ['https://github.com/matthewproctor/australianpostcodes', 'foot_src_pc'],
  ['https://www.disasterassist.gov.au/find-a-disaster', 'foot_src_da'],
];
function drawSources(){
  const el = document.getElementById('srclist');
  if(!el) return;
  el.innerHTML = SRC.map(([url, key]) =>
    `<li><a href="${url}" target="_blank" rel="noopener">${esc(T(key))}</a></li>`).join('');
}

const langBtn = document.getElementById('lang');
// 頁尾導覽：回入口頁與各州。說明頁自己不列。
function footLinks(){
  return [{label: T('nav_home'), url: META.home_url || 'index.html'}]
    .concat(DATA.states.filter(s => s.url).map(s => ({label: s.abbr, url: s.url})));
}

function applyLang(){
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.title = T('about_title');
  for(const n of document.querySelectorAll('[data-t]'))      n.innerHTML = T(n.getAttribute('data-t'));
  for(const n of document.querySelectorAll('[data-t-aria]')) n.setAttribute('aria-label', T(n.getAttribute('data-t-aria')));
  langBtn.textContent = lang === 'zh' ? 'EN' : '中文';
  langBtn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切換為中文');
  drawNav();
  drawCov();
  drawTable();
  drawSameList();
  drawSources();
  const a = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${esc(text)}</a>`;
  const bn = document.getElementById('basisnote');
  if(bn) bn.innerHTML = T('p_basis_note2', {link: a(META.source_url, T('p_official_text'))});
  renderFoot(document.getElementById('foot'), {
    T, esc,
    links: footLinks(),
    repoUrl: META.repo_url,
    pageDate: META.page_date, builtAt: META.built_at,
  });
}
langBtn.addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', lang); } catch (_) {}
  applyLang();
});

applyLang();
