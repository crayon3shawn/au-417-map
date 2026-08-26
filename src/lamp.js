/* 跟著滑鼠的光源。只有入口頁有，州頁刻意不做。

   為什麼只有入口頁：
   入口頁那張澳洲圖是導覽用的，一個州一塊、三個相隔很遠的分類色，光暈打上去
   讀起來是質感。州頁那張是工作面——你會拿它比較幾百個相鄰郵區的顏色，同一
   片區域因為滑鼠經過而忽明忽暗，在那裡是雜訊不是效果。試過，不好看。

   為什麼亮度只能到 --lamp-a（0.10）就停：
   州的填色**就是答案**（橘＝算、藍紫＝只有重建算、灰＝不算），而填色是
   fill-opacity:0.62，所以墊在 SVG 底下的光會透 38% 上來。0.10 的峰值透上來
   等於在色塊上蓋一層 alpha 0.038 的橘，造成的 ΔE 約 1–4；三個分類彼此相差
   ΔE 50 以上，所以不影響判讀。但這是上限——再調亮就會開始讓「同一種分類的
   兩個州看起來像不同顏色」。

   只在下面三個條件同時成立時才裝：
   - 深色主題（--lamp-a 在淺色是 0；淺底上的光暈只會變成一塊髒污）
   - 真的有滑鼠（hover:hover + pointer:fine）。觸控裝置沒有游標，裝了只會讓
     光停在最後一次點擊的地方不動。
   - 使用者沒有要求減少動態。

   移動用 translate3d 而不是改 gradient 的座標：前者只走合成器（不重排也不
   重繪），後者每一幀都要重畫一整片漸層。 */
function initLamp() {
  var pane = document.querySelector('.app-map');
  if (!pane) return;
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  var lamp = document.createElement('div');
  lamp.className = 'lamp';
  lamp.setAttribute('aria-hidden', 'true');
  var glow = document.createElement('i');
  lamp.appendChild(glow);
  // 插在最前面：要墊在 <svg> 底下，不能蓋在州的色塊上面
  pane.insertBefore(lamp, pane.firstChild);

  var x = 0, y = 0, queued = false, on = false;
  function paint() {
    queued = false;
    glow.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
  }
  pane.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var r = pane.getBoundingClientRect();
    x = e.clientX - r.left;
    y = e.clientY - r.top;
    if (!on) { on = true; lamp.classList.add('on'); }
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  });
  pane.addEventListener('pointerleave', function () {
    on = false;
    lamp.classList.remove('on');
  });
}
