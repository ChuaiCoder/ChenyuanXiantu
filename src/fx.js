/* ============ 特效工具：金光闪 / 盖章 / 飘字（直接操作 DOM，组件无关） ============ */
const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;

let flashTimer = null, lastFlash = 0;
export function flashFx() {
  const now = performance.now();
  if (now - lastFlash < 400) return;
  lastFlash = now;
  const el = document.getElementById('fx');
  if (!el) return;
  el.classList.add('go');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('go'), 500);
}

let sealTimer = null;
export function sealStamp(txt = '道') {
  const el = document.getElementById('seal');
  if (!el) return;
  const span = el.querySelector('span');
  if (span) span.textContent = txt;
  el.classList.add('show');
  clearTimeout(sealTimer);
  sealTimer = setTimeout(() => el.classList.remove('show'), 1000);
}

let lastFloat = 0;
export function floatText(txt, x, y, cls = '') {
  if (reduced()) return;
  const now = performance.now();
  if (now - lastFloat < 250) return;
  lastFloat = now;
  const el = document.createElement('div');
  el.className = 'float-txt' + (cls ? ' ' + cls : '');
  el.textContent = txt;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
