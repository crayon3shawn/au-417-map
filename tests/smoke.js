// 把產出頁面的腳本放進一個「什麼都回傳假物件」的 DOM 裡真的跑一遍。
//
// 目的不是驗證畫面，而是抓執行期就會炸掉的錯：暫時死區（TDZ）、拼錯的變數、
// 呼叫不存在的東西。這類錯在瀏覽器只會讓整段腳本靜靜掛掉，畫面上看起來
// 就只是「地圖沒出來」，沒有其他線索。這個專案已經栽過三次。
//
// 沙箱本身在 pagevm.js，跟 answers.js 共用。
'use strict';
const path = require('path');
const { runPage } = require('./pagevm');

const file = process.argv[2];
try {
  runPage(file);
} catch (e) {
  console.error(`${path.basename(file)} 執行時拋錯：\n  ${e.name}: ${e.message}`);
  const line = (e.stack || '').split('\n').find((l) => l.includes(path.basename(file)));
  if (line) console.error(`  ${line.trim()}`);
  process.exit(1);
}
console.log(`${path.basename(file)}: 腳本執行完畢，沒有拋錯`);
