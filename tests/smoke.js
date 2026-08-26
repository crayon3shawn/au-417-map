// 把產出頁面的腳本放進一個「什麼都回傳假物件」的 DOM 裡真的跑一遍。
//
// 目的不是驗證畫面，而是抓執行期就會炸掉的錯：暫時死區（TDZ）、拼錯的變數、
// 呼叫不存在的東西。這類錯在瀏覽器只會讓整段腳本靜靜掛掉，畫面上看起來
// 就只是「地圖沒出來」，沒有其他線索。這個專案已經栽過三次。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('找不到 <script>'); process.exit(1); }

// 任何屬性存取都回傳同一個可呼叫、可當數字、可當陣列用的替身
function stub(name) {
  const fn = function () { return proxy; };
  fn.__name = name;
  const proxy = new Proxy(fn, {
    get(t, k) {
      // 程式自己掛上去的屬性（例如 node.__pc）要原樣讀得回來，
      // 否則替身會把真實資料吃掉，測出來的錯是假的
      if (Object.prototype.hasOwnProperty.call(t, k) && k !== 'length' && k !== 'name') return t[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'length') return 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;              // 別被當成 Promise
      if (k === 'textContent' || k === 'value') return '';
      if (k === 'classList') return proxy;
      if (k === 'style') return proxy;
      if (k === 'children' || k === 'childNodes') return [];
      if (k === 'firstChild' || k === 'parentNode') return proxy;
      if (k === 'contains' || k === 'matches') return () => false;
      if (k === 'getBoundingClientRect' || k === 'getBBox')
        return () => ({ x: 0, y: 0, width: 800, height: 600, top: 0, left: 0 });
      if (k === 'getScreenCTM') return () => ({ inverse: () => proxy });
      if (k === 'createSVGPoint') return () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) });
      if (k === 'getAttribute') return () => '';
      return proxy;
    },
    apply() { return proxy; },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true },
  });
  return proxy;
}

// 從頁面實際的 HTML 收集所有 id。getElementById 對不存在的 id 要回傳 null，
// 不能一律給假物件——否則「引用已被刪掉的元素」這種錯會被替身吃掉。
const IDS = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const doc = stub('document');
const sandbox = {
  document: new Proxy({}, {
    get(t, k) {
      if (k === 'querySelectorAll') return () => [];
      if (k === 'fonts') return { ready: { then: (f) => f() } };
      if (k === 'getElementById') return (id) => (IDS.has(id) ? stub('#' + id) : null);
      return doc[k];
    },
  }),
  window: stub('window'),
  performance: { now: () => 0, getEntriesByType: () => [{}] },
  location: { hash: '#pc=4870', href: 'about:blank', search: '' },
  navigator: { language: 'zh-TW' },
  localStorage: {
    _v: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
    setItem(k, v) { this._v[k] = String(v); },
    removeItem(k) { delete this._v[k]; },
  },
  requestAnimationFrame: (f) => f(0),
  // 捲動位置與視窗尺寸：頁面載入時會讀它們決定標頭要不要收合、
  // 城市名要不要縮短。少了就是 ReferenceError，整支腳本停在那裡。
  scrollY: 0, scrollX: 0,
  innerWidth: 1280, innerHeight: 800,
  setTimeout: (f) => { f(); return 0; },
  clearTimeout: () => {},
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  MouseEvent: function () {}, Event: function () {},
  // 頁面會抓共用的地名索引。這裡回一個永遠不完成的 promise——smoke test 只驗
  // 「腳本跑得完」，不驗非同步之後的行為，而真的去抓檔案會讓測試依賴檔案系統。
  fetch: () => new Promise(() => {}),
  // 頁面用它來偵測「地圖區從沒有尺寸變成有尺寸」。假的 DOM 不會真的變動，
  // 所以只要能建立、observe 不拋錯就好。
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  console,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

try {
  vm.runInNewContext(m[1], sandbox, { filename: path.basename(file), timeout: 20000 });
} catch (e) {
  console.error(`${path.basename(file)} 執行時拋錯：\n  ${e.name}: ${e.message}`);
  const line = (e.stack || '').split('\n').find((l) => l.includes(path.basename(file)));
  if (line) console.error(`  ${line.trim()}`);
  process.exit(1);
}
console.log(`${path.basename(file)}: 腳本執行完畢，沒有拋錯`);
