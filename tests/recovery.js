// 災後重建那段文字，必須跟官網原文對得上。
//
// 為什麼要釘住：這段文字對 636 個郵區（全澳的 23%）來說**就是全部的答案**
// ——重建是那些郵區唯一的路。而它是散文，不是資料，所以沒有任何既有測試看
// 得到它改壞。曾經有一版寫「土建、拆除、修繕、道路橋樑」，那是人工整理的，
// 漏掉了「一般清理」——而清理是官網在 Natural disaster 底下舉的**第一個**
// 例子，在災區找清潔職缺的人比找工地職缺的多。漏掉它會讓那群人以為自己不算。
//
// 釘的是官方原文的關鍵詞，不是我們的句子，所以改寫措辭不會誤報，
// 但把某一項「順手刪掉」會被擋下來。
//
// 查證日期與依據記在 data/industries.json 的 recovery.note。
'use strict';
const path = require('path');
const { runPage } = require('./pagevm');

const ROOT = path.resolve(__dirname, '..');
const BIT = { regional: 4, bushfire: 8, disaster: 16 };

// 官網 https://immi.homeaffairs.gov.au/.../work-holiday-417/specified-work
// 章節 Approved industries and areas for specified work
const CASES = [
  {
    what: '大火（Bushfire recovery work）',
    flag: BIT.bushfire,
    absent: BIT.disaster,
    zh: ['2019 年 7 月 31 日', '野生動物', '支援服務', '圍籬'],
    en: ['31 July 2019', 'wildlife', 'support services', 'restitution'],
  },
  {
    what: '天災（Natural disaster recovery work）',
    flag: BIT.disaster,
    absent: BIT.bushfire,
    // 清理是官網舉的第一個例子，也是這次查證改掉的那一項——單獨列出來，
    // 它掉了要一眼看得出是掉了哪一個。
    zh: ['2021 年 12 月 31 日', '清理', '拖地', '載運垃圾', '話務', 'Employment type', '2025 年 4 月 5 日'],
    en: ['31 December 2021', 'cleaning up', 'mopping floors', 'transportation of rubbish',
         'call centres', 'Employment type', '5 April 2025'],
  },
];

// 官網沒有替大火那條路指定 Employment type，所以介面上也不能寫——
// 那是會讓人在 ImmiAccount 選錯的資訊。
const FIRE_MUST_NOT = { zh: ['Employment type'], en: ['Employment type'] };

const PAGES = [
  ['入口頁', path.join(ROOT, 'dist', 'index.html')],
  ['州頁',   path.join(ROOT, 'dist', 'nsw.html')],
];

const bad = [];
for (const [label, file] of PAGES) {
  for (const lang of ['zh', 'en']) {
    // 語言要在載入前就決定：`lang` 是閉包裡的 let，跑完之後改不到。
    const s = runPage(file, { localStorage: { lang } });
    if (typeof s.answerBody !== 'function') {
      console.error(`${label}沒有頂層的 answerBody()。`);
      process.exit(1);
    }
    for (const c of CASES) {
      const html = s.answerBody(c.flag);
      for (const kw of c[lang]) {
        if (!html.includes(kw)) {
          bad.push(`${label} ${lang} ${c.what}：找不到官方關鍵詞「${kw}」`);
        }
      }
    }
    // 只有大火時不該出現 Employment type
    const fireOnly = s.answerBody(BIT.bushfire);
    for (const kw of FIRE_MUST_NOT[lang]) {
      if (fireOnly.includes(kw)) {
        bad.push(`${label} ${lang} 只有大火時出現了「${kw}」——官網沒有替大火指定 Employment type`);
      }
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
console.log(`災後重建文字對照官網：${PAGES.length} 頁 × 2 語言 × ${CASES.length} 條路，全部通過`);
