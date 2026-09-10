// 災後重建那段文字，必須跟官網原文對得上。
//
// 為什麼要釘住：這段文字對 638 個郵區（全澳的 23%）來說**就是全部的答案**
// ——重建是那些郵區唯一的路。而它是散文，不是資料，所以沒有任何既有測試看
// 得到它改壞。曾經有一版寫「土建、拆除、修繕、道路橋樑」，那是人工整理的，
// 漏掉了「一般清理」——而清理是官網在 Natural disaster 底下舉的**第一個**
// 例子，在災區找清潔職缺的人比找工地職缺的多。漏掉它會讓那群人以為自己不算。
//
// 兩層守衛，因為內容住在兩個地方：
//
//   面板（answerBody）  只剩「哪一張表 + 起算日」與往下的連結。用 pagevm 把
//                       函式叫出來驗，這樣旗標組合的邏輯也一起顧到。
//   下面那一節（#recovery）  範圍、官方舉例、送件注意事項、天數計算。它是靜態
//                       markup + data-t，所以驗兩件事：樣板裡那個 data-t 還在
//                       （區塊沒被整個刪掉），而且字串本身還含官方關鍵詞。
//
// 釘的是官方原文的關鍵詞，不是我們的句子，所以改寫措辭不會誤報，
// 但把某一項「順手刪掉」會被擋下來。
//
// 查證日期與依據記在 data/industries.json 的 recovery.note。
'use strict';
const fs = require('fs');
const path = require('path');
const { runPage } = require('./pagevm');

const ROOT = path.resolve(__dirname, '..');
const BIT = { bushfire: 8, disaster: 16 };

const PAGES = [
  ['入口頁', path.join(ROOT, 'dist', 'index.html')],
  ['州頁',   path.join(ROOT, 'dist', 'nsw.html')],
];

// ---- 面板上該留的 ----
// 官網 https://immi.homeaffairs.gov.au/.../work-holiday-417/specified-work
const PANEL = [
  { what: '大火', flag: BIT.bushfire, absent: 'Natural disaster',
    zh: ['Bushfire declared areas', '2019 年 7 月 31 日', '跟你做哪一行無關'],
    en: ['Bushfire declared areas', '31 July 2019', 'does not depend on your industry'] },
  { what: '天災', flag: BIT.disaster, absent: 'Bushfire',
    zh: ['Natural disaster declared areas', '2021 年 12 月 31 日', '跟你做哪一行無關'],
    en: ['Natural disaster declared areas', '31 December 2021', 'does not depend on your industry'] },
];

// ---- 搬到 #recovery 的 ----
// key 是 strings.json 的鍵；樣板裡必須有對應的 data-t，字串必須含這些官方關鍵詞。
const SECTION = {
  rec_fire_scope:      { zh: ['野生動物', '支援服務'], en: ['wildlife', 'restitution'] },
  rec_fire_eg:         { zh: ['圍籬'],                 en: ['fences'] },
  // 清理是官網舉的第一個例子，也是這次查證改掉的那一項——單獨列出來，
  // 它掉了要一眼看得出是掉了哪一個。
  rec_disaster_scope:  { zh: ['清理', '拖地', '載運垃圾'],
                         en: ['cleaning up', 'mopping floors', 'transportation of rubbish'] },
  rec_disaster_eg:     { zh: ['話務'],                 en: ['call centres'] },
  rec_disaster_form:   { zh: ['Employment type'],      en: ['Employment type'] },
  rec_disaster_lodged: { zh: ['2025 年 4 月 5 日'],    en: ['5 April 2025'] },
  rec_volunteer_days:  { zh: ['志工', '等同全職'],
                         en: ['volunteer recovery work', 'full-time equivalent'] },
};

const STRINGS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'strings.json'), 'utf8')).s;
// 完整說明只住在說明頁。工具頁上只留「哪一張表 + 起算日」與一個往這裡的連結
// ——那兩頁的檢查在上面的 PANEL 那一段。
const TEMPLATES = ['src/about.html'];

const bad = [];

// --- 面板 ---
for (const [label, file] of PAGES) {
  for (const lang of ['zh', 'en']) {
    // 語言要在載入前就決定：`lang` 是閉包裡的 let，跑完之後改不到。
    const s = runPage(file, { localStorage: { lang } });
    if (typeof s.answerBody !== 'function') {
      console.error(`${label}沒有頂層的 answerBody()。`);
      process.exit(1);
    }
    for (const c of PANEL) {
      const html = s.answerBody(c.flag);
      // 面板一定要有往完整說明的入口，否則「只有重建算」的人拿不到範圍
      if (!html.includes('about.html#recovery')) {
        bad.push(`${label} ${lang} 面板/${c.what}：沒有連到說明頁的 #recovery`);
      }
      for (const kw of c[lang]) {
        if (!html.includes(kw)) bad.push(`${label} ${lang} 面板/${c.what}：找不到「${kw}」`);
      }
      // 只在一張表上的郵區，不該看到另一張表的名字
      if (html.includes(c.absent)) {
        bad.push(`${label} ${lang} 面板/${c.what}：出現了不相干的「${c.absent}」`);
      }
    }
  }
}

// --- 下面那一節 ---
for (const tpl of TEMPLATES) {
  const html = fs.readFileSync(path.join(ROOT, tpl), 'utf8');
  if (!html.includes('id="recovery"')) {
    bad.push(`${tpl}：找不到 #recovery——完整說明的區塊被刪掉了？`);
    continue;
  }
  for (const key of Object.keys(SECTION)) {
    if (!html.includes(`data-t="${key}"`)) {
      bad.push(`${tpl}：#recovery 裡沒有 data-t="${key}"`);
    }
  }
}
for (const [key, langs] of Object.entries(SECTION)) {
  if (!STRINGS[key]) { bad.push(`strings.json 少了 ${key}`); continue; }
  for (const lang of ['zh', 'en']) {
    for (const kw of langs[lang]) {
      if (!STRINGS[key][lang].includes(kw)) {
        bad.push(`strings.json ${key}.${lang}：找不到官方關鍵詞「${kw}」`);
      }
    }
  }
}
// 官網沒有替大火那條路指定 Employment type，所以不能寫成大火也要選——
// 那會讓人在 ImmiAccount 選錯。
for (const lang of ['zh', 'en']) {
  for (const key of ['rec_fire_scope', 'rec_fire_eg']) {
    if (STRINGS[key][lang].includes('Employment type')) {
      bad.push(`strings.json ${key}.${lang}：出現 Employment type——官網沒有替大火指定`);
    }
  }
}

if (bad.length) {
  console.error('災後重建的文字跟官網對不上：\n');
  for (const b of bad) console.error('  ' + b);
  console.error('\n改文案可以，但不能把官方列出的項目刪掉。');
  console.error('如果官網真的改了，請重新逐字對過，並更新 data/industries.json 的 recovery.note。');
  process.exit(1);
}
console.log(`災後重建：面板 ${PAGES.length} 頁 × 2 語言 × ${PANEL.length} 條路，`
  + `完整說明 ${TEMPLATES.length} 個樣板 × ${Object.keys(SECTION).length} 個鍵，全部通過`);
