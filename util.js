/* Казуал Хаб: общие мелочи для скриптов страниц. Подключается первым на каждой странице, раньше остальных скриптов.
   Раньше каждый файл объявлял их у себя; теперь берёт отсюда: const esc = window.CasualUtil.esc.
   esc(v)                    — текст для вставки в разметку (& < > " ' экранируются; null и undefined — пустая строка)
   read(key)                 — JSON из localStorage или null, если ключа нет или он испорчен
   plural(n, one, few, many) — нужная форма слова: 1 оценка, 2 оценки, 5 оценок
   script(src, ready)        — подгрузить скрипт один раз: Promise, который выполнится, когда ready() вернёт правду.
                               Второй, кто попросит тот же скрипт, дождётся того же тега, а не останется ни с чем
   emptyArt(name)            — котик Васян в пустом состоянии (/art/empty-*.webp: rate, friends, tier, lots), в половину исходника — пиксели ровные
   loop(fn, fps)             — цикл анимации под любую частоту экрана: движение по времени, не чаще fps раз в секунду; ответ — stop()
   confetti(canvas, o)       — конфетти на холсте победы (колесо, лоты); ответ — stop() */
(() => {
  // фон сайта (base.css, html[data-bg]): у всех пиксельные звёзды. Пейзаж в запасе — ?bg=horizon запоминается в этом браузере, ?bg= — вернуть звёзды
  try {
    const q = new URLSearchParams(location.search).get('bg');
    if (q !== null) { if (q === 'horizon') localStorage.setItem('casualhub.bg.v1', q); else localStorage.removeItem('casualhub.bg.v1'); }
  } catch (e) {}
  let bg = 'stars';
  try { if (localStorage.getItem('casualhub.bg.v1') === 'horizon') bg = 'horizon'; } catch (e) {}
  document.documentElement.dataset.bg = bg;
  if (window.CasualUtil) return;
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => MAP[c]);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const loading = new Map();
  const script = (src, ready) => {
    if (ready && ready()) return Promise.resolve();
    if (!loading.has(src)) {
      loading.set(src, new Promise((resolve, reject) => {
        let sc = [...document.scripts].find((s) => s.getAttribute('src') === src);
        if (!sc) { sc = document.createElement('script'); sc.src = src; document.head.appendChild(sc); }
        sc.addEventListener('load', () => resolve(), { once: true });
        sc.addEventListener('error', () => { loading.delete(src); reject(new Error('не загрузился ' + src)); }, { once: true });
        // тег уже был и успел загрузиться раньше, чем мы подписались: тогда его событие load мы пропустили
        if (ready) { const t0 = Date.now(), check = () => { if (ready()) resolve(); else if (Date.now() - t0 < 15e3) setTimeout(check, 100); }; setTimeout(check, 100); }
      }));
    }
    return loading.get(src);
  };
  const EMPTY_SIZE = { rate: [140, 70], friends: [110, 70], tier: [100, 55], lots: [80, 60] }; // половина исходника 10 px на пиксель
  const emptyArt = (name) => { const s = EMPTY_SIZE[name]; return s ? `<img class="empty-art" src="/art/empty-${name}.webp" width="${s[0]}" height="${s[1]}" alt="" loading="lazy" decoding="async">` : ''; };
  // цикл анимации под любую частоту экрана: fn(k, now) — k = сколько «кадров 60 Гц» прошло (движение по времени, на 60, 144
  // и 240 Гц одинаковой скорости), не чаще fps раз в секунду (тяжёлой перерисовке больше 60 не нужно), на скрытой вкладке стоит.
  // fn вернула false — цикл закончился. Ответ — stop()
  const loop = (fn, fps = 60) => {
    // шаг с запасом: на 144 Гц — каждый второй кадр (~72 в секунду), на 240 — каждый третий (~80), на 60 и 120 — ровно 60
    const gap = 750 / fps;
    let raf = 0, last = 0, on = true;
    const tick = (now) => {
      if (!on) return;
      raf = requestAnimationFrame(tick);
      if (!last) { last = now - 1000 / 60; }
      if (now - last < gap) return;
      if (document.hidden) { last = now; return; }
      const k = Math.min(4, (now - last) / (1000 / 60)); // после паузы — не скачком
      last = now;
      if (fn(k, now) === false) { on = false; cancelAnimationFrame(raf); }
    };
    raf = requestAnimationFrame(tick);
    return () => { on = false; cancelAnimationFrame(raf); };
  };
  // конфетти на холсте (победа на колесе и в лотах): из точки o.x, o.y, цвета o.colors, своя форма частицы — o.part(g, w, h).
  // Холст — не больше ~3 млн точек (на 4K-экране плотность ниже, на глаз не видно), перерисовка — 60 раз в секунду. Ответ — stop()
  const confetti = (cv, o) => {
    const W = innerWidth, H = innerHeight;
    const r = Math.max(.5, Math.min(devicePixelRatio || 1, 2, Math.sqrt(3e6 / (W * H))));
    cv.width = Math.round(W * r); cv.height = Math.round(H * r);
    const g = cv.getContext('2d');
    const cols = o.colors && o.colors.length ? o.colors : ['#F26A55', '#F2BA44', '#43C97A', '#5B74FF', '#E85FA5'];
    const parts = Array.from({ length: o.count || 160 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6, v = 6 + Math.random() * 11;
      return { x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], gone: false };
    });
    const stop = loop((k) => {
      g.setTransform(r, 0, 0, r, 0, 0);
      g.clearRect(0, 0, W, H);
      const damp = Math.pow(0.985, k);
      let alive = 0;
      for (const p of parts) {
        if (p.gone) continue;
        p.vx *= damp; p.vy = p.vy * damp + 0.32 * k; p.x += p.vx * k; p.y += p.vy * k; p.r += p.vr * k;
        if (p.y > H + 20) { p.gone = true; continue; }
        alive++;
        const c = Math.cos(p.r), s = Math.sin(p.r);
        g.setTransform(r * c, r * s, -r * s, r * c, r * p.x, r * p.y);
        g.fillStyle = p.c;
        if (!(o.part && o.part(g, p.w, p.h))) { const f = Math.abs(Math.cos(p.r * 2)); g.fillRect(-p.w / 2, -p.h / 2 * f, p.w, p.h * f + 1); }
      }
      if (!alive) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); }
      return alive > 0;
    }, 60);
    return () => { stop(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); };
  };
  window.CasualUtil = Object.freeze({ esc, read, plural, script, emptyArt, loop, confetti });
  // котик Васян внизу экрана (vasyan.js сам проверяет, не выключен ли он в Настройках; в админке и на /r/ его нет)
  if (!/^\/(admin|r)\//.test(location.pathname)) script('/vasyan.js', () => !!window.CasualVasyan).catch(() => {});
})();
