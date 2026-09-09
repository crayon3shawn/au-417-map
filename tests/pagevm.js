// 把產出頁面的腳本跑進一個假 DOM 裡。兩支測試共用這一份：
//
//   smoke.js   －－ 只驗「腳本跑得完、沒有拋錯」
//   answers.js －－ 跑完之後把頁面自己定義的函式叫出來比對
//
// 為什麼共用：沙箱一旦兩份，改了一邊不會有任何錯誤訊息，只會變成「其中一支
// 測試測的是另一個世界」。這個專案對 CSS 也立過同一條規則（test_tokens 擋
// 兩頁重複宣告），沙箱沒理由例外。
//
// 為什麼可以把頁面的函式叫出來：vm.runInNewContext 是把 sandbox 當成全域物件，
// 而頂層的 `function foo(){}` 宣告會掛到全域上。const／let 不會，但那些東西
// 都在函式的閉包裡，所以從外面呼叫 foo() 一樣讀得到 T()、esc()、DATA 這些。
'use strict';
const fs = require('fs');
const vm = require('vm');

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

// 把一個產出頁面跑起來，回傳它的全域物件（頁面定義的頂層函式在上面）。
// 拋錯就讓它往上丟——呼叫端決定要怎麼報。
function runPage(file) {
  const html = fs.readFileSync(file, 'utf8');
  // 頁面有兩段腳本：先是主題切換（要在繪製前跑），最後才是主程式。
  // 兩段都要跑，而且要照順序——貪婪比對會把中間整段 HTML 也吃進來。
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]);
  if (!blocks.length) throw new Error('找不到 <script>');

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
    location: { hash: '#pc=4870', href: 'about:blank', search: '', pathname: '/qld.html' },
    history: { replaceState() {}, pushState() {} },
    URLSearchParams,
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
    // 頁面會抓共用的地名索引。這裡回一個永遠不完成的 promise——測試只驗
    // 「腳本跑得完」，不驗非同步之後的行為，而真的去抓檔案會讓測試依賴檔案系統。
    fetch: () => new Promise(() => {}),
    // 頁面用它來偵測「地圖區從沒有尺寸變成有尺寸」。假的 DOM 不會真的變動，
    // 所以只要能建立、observe 不拋錯就好。
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    console,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  vm.runInNewContext(blocks.join('\n;\n'), sandbox, { filename: file, timeout: 20000 });
  return sandbox;
}

module.exports = { runPage, stub };
