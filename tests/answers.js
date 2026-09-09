// 入口頁與州頁對同一個郵區必須給出同一個答案。
//
// 為什麼需要這條守衛：答案面板的邏輯（answerHead／answerBody）兩頁各有一份。
// 那是刻意的——兩頁不共用 JS，各自內嵌自己需要的資料——但重複的東西會漂，
// 而且漂掉不會有任何錯誤訊息。
//
// 這個專案已經被咬過一次：入口頁改成「一次列出全部產業」之後，州頁還停在
// 「只看選擇器選的那一行」。使用者是照著入口頁答案下面那顆「在○○地圖上看 →」
// 跳過去的，剛被告知「這要看行業」，點進去卻只剩建築業的答案。做觀光餐旅的
// 人在那一跳之後會拿到對他而言錯誤的結論。沒有任何測試看得到這件事。
//
// 比的是**行為**不是原始碼。兩邊的寫法本來就有差（入口頁用 joinList()，州頁
// 用區域變數 sep），逐字比對只會一直誤報。所以直接把函式叫出來，餵全部 32 種
// 旗標組合，比對輸出的字串。
'use strict';
const path = require('path');
const { runPage } = require('./pagevm');

const ROOT = path.resolve(__dirname, '..');
// 州頁挑 NSW：它是唯一同時有大量 regional、bushfire、disaster 郵區的州，
// 32 種組合裡真的會出現的那些它都有。
const PAGES = [
  ['入口頁', path.join(ROOT, 'dist', 'index.html')],
  ['州頁',   path.join(ROOT, 'dist', 'nsw.html')],
];

// 五張地區表的位元，跟 build.py 的 AREA_BITS 一致。
// 這裡不從 Python 匯入——如果哪天兩邊漂了，這支測試的輸出會變得沒有意義，
// 而 test_build 那邊有自己的守衛盯著位元值。
const BITS = { remote: 1, northern: 2, regional: 4, bushfire: 8, disaster: 16 };
const NAMES = Object.keys(BITS);

function describe(f) {
  const on = NAMES.filter(n => f & BITS[n]);
  return on.length ? on.join('+') : '（不在任何表上）';
}

let ctx;
try {
  ctx = PAGES.map(([label, file]) => [label, runPage(file)]);
} catch (e) {
  console.error(`載入頁面時拋錯：${e.name}: ${e.message}`);
  process.exit(1);
}

for (const [label, s] of ctx) {
  for (const fn of ['answerHead', 'answerBody']) {
    if (typeof s[fn] !== 'function') {
      console.error(`${label}沒有頂層的 ${fn}()。`);
      console.error('如果那個函式被改成 const／箭頭函式，它就不會掛到全域上，');
      console.error('這支測試會靜靜地什麼都比不到——所以這裡要硬性失敗。');
      process.exit(1);
    }
  }
}

const [[labelA, A], [labelB, B]] = ctx;
const bad = [];

for (let f = 0; f < 32; f++) {
  let ha, hb, ba, bb;
  try {
    ha = A.answerHead(f); hb = B.answerHead(f);
    ba = A.answerBody(f); bb = B.answerBody(f);
  } catch (e) {
    bad.push({ f, why: `呼叫時拋錯：${e.name}: ${e.message}` });
    continue;
  }
  if (ha.say !== hb.say)   bad.push({ f, why: '判定字不同', a: ha.say, b: hb.say });
  if (ha.band !== hb.band) bad.push({ f, why: '色帶不同',   a: ha.band, b: hb.band });
  if (ha.none !== hb.none) bad.push({ f, why: 'none 旗標不同', a: String(ha.none), b: String(hb.none) });
  if (ba !== bb)           bad.push({ f, why: '面板內容不同', a: ba, b: bb });
}

if (bad.length) {
  console.error(`兩頁的答案有 ${bad.length} 處不一致：\n`);
  for (const x of bad.slice(0, 8)) {
    console.error(`  旗標 ${String(x.f).padStart(2)}  ${describe(x.f)}  ——  ${x.why}`);
    if (x.a !== undefined) {
      console.error(`    ${labelA}: ${String(x.a).slice(0, 160)}`);
      console.error(`    ${labelB}: ${String(x.b).slice(0, 160)}`);
    }
  }
  if (bad.length > 8) console.error(`  …另外還有 ${bad.length - 8} 處`);
  console.error('\n兩頁的 answerHead／answerBody 要一起改。');
  process.exit(1);
}

console.log(`兩頁對 32 種旗標組合的答案完全相同（${labelA} vs ${labelB}）`);
