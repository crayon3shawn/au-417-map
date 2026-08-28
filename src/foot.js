/* 頁尾：免責、資料出處、日期戳記。兩頁共用一份。

   為什麼要有這個檔：這些內容原本散在五個地方（標頭下的細帶、標頭下的免責、
   側欄的「出處」區塊、文件段的「出處與查證」、文件段的「資料出處」四點），
   彼此重複。實際數過的結果：同一個 Home Affairs 網址在入口頁出現四次，
   用四個不同的名字；ABS 被提到三次卻從來沒有連結；地名資料的來源
   （australianpostcodes）完全沒有標示——而整個地名搜尋都靠它。

   出處只給名字與網址，不解釋抓了什麼、怎麼抓的——那是 README 的工作，
   不是使用者要讀的東西。唯一留在免責裡的來源說明是「產業對應表是人工整理
   的」，因為那不是出處而是**品質警語**：其他部分都是機器逐字解析，只有那
   一張表是人讀了散文整理出來的，使用者有權知道哪一段最可能出錯。

   不依賴任何全域變數（T／esc 都由呼叫端傳進來）：這個檔在主程式之前注入，
   那時候那些東西還不存在。 */
function renderFoot(el, ctx) {
  if (!el) return;
  var T = ctx.T, esc = ctx.esc;
  var link = function (url, text) {
    return '<a href="' + url + '" target="_blank" rel="noopener">' + esc(text) + '</a>';
  };
  var SRC = [
    [ctx.sourceUrl, 'foot_src_ha'],
    ['https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/POA/MapServer', 'foot_src_abs'],
    ['https://github.com/matthewproctor/australianpostcodes', 'foot_src_pc'],
    ['https://www.disasterassist.gov.au/find-a-disaster', 'foot_src_da'],
  ];
  // 免責裡不連 Home Affairs：正下方的出處清單就是同一個網址，連兩次是噪音。
  var notes = [esc(T('foot_disclaim'))].concat(ctx.extra || []);
  el.innerHTML =
    '<p class="foot-note">' + notes.join(' ') + '</p>'
    + '<div class="foot-src"><span class="eyebrow">' + esc(T('foot_src_h')) + '</span><ul>'
    + SRC.map(function (s) { return '<li>' + link(s[0], T(s[1])) + '</li>'; }).join('')
    + '</ul></div>'
    + '<p class="foot-stamp">' + esc(T('foot_stamp', { d: ctx.pageDate, b: ctx.builtAt })) + '</p>';
}
