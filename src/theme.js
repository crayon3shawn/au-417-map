// 深淺色切換。CSS 早就支援 :root[data-theme]，但一直沒有東西去設定它，
// 所以站台只能跟隨系統。
//
// 這一段必須在畫面繪製之前執行，不能等頁尾的主程式——不然會先閃一下系統
// 主題再跳成使用者選的那個。所以 build 把它注入在 <style> 後面。
(function () {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (_) {}
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
})();

// 沒選過就回報系統目前的樣子——按鈕要顯示「按下去會變成什麼」，
// 所以得知道現在實際是哪一種，不能只看有沒有存過。
function currentTheme() {
  var set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
}

function paintThemeBtn() {
  var b = document.getElementById('theme');
  if (b) b.textContent = currentTheme() === 'dark' ? '☀' : '☾';
}

function toggleTheme() {
  var next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (_) {}
  paintThemeBtn();
}

addEventListener('DOMContentLoaded', function () {
  var b = document.getElementById('theme');
  if (!b) return;
  b.addEventListener('click', toggleTheme);
  paintThemeBtn();
});
