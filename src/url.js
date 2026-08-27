/* 可分享的網址：?ind=<產業>&pc=<郵區>

   兩頁共用一份，理由跟 base.css 一樣——格式各寫一份的話，改了一邊不會有任何
   錯誤訊息，只會變成「入口頁貼出來的連結，在州頁打不開」，要有人踩到才會發現。

   為什麼產業一定要在網址裡：判定本身取決於產業。只帶 ?pc=2264 貼給別人，
   對方看到的可能是完全不同的答案（觀光餐旅跟建築用的不是同一張表）。

   行政區框選仍然走 #lga=<名稱>|<郵區清單>：那是一份會很長的酬載，而且是入口頁
   交棒給州頁的機制，不是使用者會自己編或自己讀的網址。 */
function readUrlState() {
  var q = new URLSearchParams(location.search);
  var pc = q.get('pc');
  return { ind: q.get('ind') || null, pc: /^\d{3,4}$/.test(pc || '') ? pc : null };
}

/* 用 replaceState 不是 pushState：每查一個郵區就塞一筆歷史，等於把「上一頁」
   變成「上一個郵區」——使用者按返回是想離開這個站，不是想倒帶查詢過程。 */
function writeUrlState(ind, pc) {
  if (!window.history || !history.replaceState) return;
  var q = new URLSearchParams(location.search);
  if (ind) q.set('ind', ind); else q.delete('ind');
  if (pc) q.set('pc', String(pc)); else q.delete('pc');
  var s = q.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
}
