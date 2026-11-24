/* Казуал Хаб: снег на страницах в новогодние дни. Подключает util.js (CasualUtil.snow) — с 1 декабря по 10 января,
   если снег не выключен в Настройках и в системе не включено «уменьшить движение». Холст поверх страницы, но под окнами
   и меню; клики проходят насквозь, на скрытой вкладке не рисует (CasualUtil.loop). На светлой теме снег голубовато-серый,
   иначе его не видно; в виде «Пиксель» снежинки квадратные. */
(() => {
  if (window.CasualSnow) return;
  const U = window.CasualUtil;
  const css = document.createElement('style');
  css.textContent = '.cs-snow { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 40; } @media print { .cs-snow { display: none; } }';
  document.head.appendChild(css);
  let cv = null, g = null, halt = null, mo = null, flakes = [], W = 0, H = 0, ink = '255,255,255', px = false;
  // цвет снега — по яркости фона страницы; вид «Пиксель» — квадратные снежинки
  const tone = () => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor || '');
    const lum = m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : 0;
    ink = lum > 0.6 ? '110,140,185' : '255,255,255';
    px = document.documentElement.getAttribute('data-ui') === 'pixel';
  };
  const flake = (anywhere) => ({
    x: Math.random() * W, y: anywhere ? Math.random() * H : -6, r: 0.8 + Math.random() * 2.2,
    vy: 0.35 + Math.random() * 0.7, ph: Math.random() * 6.28, sw: 0.3 + Math.random() * 0.7, a: 0.3 + Math.random() * 0.45,
  });
  // размер холста — в точках экрана (devicePixelRatio при размере сайта не 100 % уже учитывает его, util.js → sizeShim)
  const fit = () => {
    if (!cv) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // снежинок — по площади окна: на телефоне ~25, на большом экране до 100
    const want = Math.round(Math.min(100, Math.max(24, (W * H) / 15000)));
    while (flakes.length < want) flakes.push(flake(true));
    flakes.length = want;
  };
  const draw = (k) => {
    g.clearRect(0, 0, W, H);
    for (const f of flakes) {
      f.y += f.vy * k * (0.6 + f.r / 4);
      f.ph += 0.012 * k;
      f.x += Math.sin(f.ph) * f.sw * 0.4 * k;
      if (f.y > H + 6) Object.assign(f, flake(false));
      if (f.x < -6) f.x = W + 5; else if (f.x > W + 6) f.x = -5;
      g.fillStyle = `rgba(${ink},${f.a})`;
      if (px) { const s = f.r > 1.9 ? 3 : 2; g.fillRect(Math.round(f.x), Math.round(f.y), s, s); }
      else { g.beginPath(); g.arc(f.x, f.y, f.r, 0, 6.2832); g.fill(); }
    }
  };
  function start() {
    if (cv) return;
    const go = () => {
      if (cv) return;
      cv = document.createElement('canvas');
      cv.className = 'cs-snow';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
      g = cv.getContext('2d');
      tone();
      fit();
      addEventListener('resize', fit);
      // сменили тему или вид — другой цвет и форма снега
      mo = new MutationObserver(tone);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-ui', 'class'] });
      halt = U.loop(draw, 40);
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, { once: true });
  }
  function stop() {
    if (!cv) return;
    if (halt) halt();
    if (mo) mo.disconnect();
    removeEventListener('resize', fit);
    cv.remove();
    cv = null; flakes = []; halt = null; mo = null;
  }
  window.CasualSnow = Object.freeze({ start, stop, on: () => !!cv });
})();
