/* 頁尾：站名、導覽、原始碼、最後更新。三頁共用一份。

   以前這裡放的是免責 + 資料出處 + 日期戳記，那三樣加起來 200 多字，是頁面
   最下面最重的一塊。現在：

     免責     移除（由使用者決定）
     資料出處 移到說明頁——CC BY 4.0 要求標示 ABS 的出處，那是授權條件不是
              禮貌，所以只能搬不能刪
     日期     留下來。「這份資料是什麼時候的」是頁尾本來就該回答的問題

   導覽在頁尾重複一次是刻意的：讀完一頁之後人在最下面，這時候要換州或去看
   說明，回頭捲到標頭是多餘的動作。

   不依賴任何全域變數（T／esc 都由呼叫端傳進來）：這個檔在主程式之前注入，
   那時候那些東西還不存在。 */
function renderFoot(el, ctx) {
  if (!el) return;
  var T = ctx.T, esc = ctx.esc;
  var nav = (ctx.links || []).map(function (l) {
    var ext = /^https?:/.test(l.url) ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + l.url + '"' + ext + '>' + esc(l.label) + '</a>';
  }).join('');
  el.innerHTML =
    '<p class="foot-name">' + esc(T('foot_name')) + '</p>'
    + (nav ? '<nav class="foot-nav">' + nav + '</nav>' : '')
    + '<p class="foot-stamp">'
    + esc(T('foot_stamp', { d: ctx.pageDate, b: ctx.builtAt }))
    + (ctx.repoUrl
        ? ' · <a href="' + ctx.repoUrl + '" target="_blank" rel="noopener">'
          + esc(T('foot_repo')) + '</a>'
        : '')
    + '</p>';
}
