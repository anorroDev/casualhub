/* Казуал Хаб: общие мелочи для скриптов страниц. Подключается первым на каждой странице, раньше остальных скриптов.
   Раньше каждый файл объявлял их у себя; теперь берёт отсюда: const esc = window.CasualUtil.esc.
   esc(v)                    — текст для вставки в разметку (& < > " ' экранируются; null и undefined — пустая строка)
   read(key)                 — JSON из localStorage или null, если ключа нет или он испорчен
   plural(n, one, few, many) — нужная форма слова: 1 оценка, 2 оценки, 5 оценок
   script(src, ready)        — подгрузить скрипт один раз: Promise, который выполнится, когда ready() вернёт правду.
                               Второй, кто попросит тот же скрипт, дождётся того же тега, а не останется ни с чем
   emptyArt(name)            — котик Васян в пустом состоянии (/art/empty-*.webp: rate, friends, tier, lots), в половину исходника — пиксели ровные
   loop(fn, fps)             — цикл анимации под любую частоту экрана: движение по времени, не чаще fps раз в секунду; ответ — stop()
   confetti(canvas, o)       — конфетти на холсте победы (колесо, лоты); ответ — stop()
   size                      — размер интерфейса (Настройки → «Внешний вид»): list, get(), stored(), fits(pct), ok(), apply(pct, save) */
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
  // ---------- размер интерфейса (Настройки → «Внешний вид») ----------
  // 80–150 %, выбор запоминается в этом браузере (casualhub.size.v1; у 100 % ключа нет). Размер — CSS zoom на <html>:
  // ставится здесь, в <head>, до первой отрисовки, вместе с --uiz для стилей (/base.css: --vh, --dvh, --vw).
  // Внутри zoom браузер отдаёт координаты окна (getBoundingClientRect, clientX/Y мыши, innerWidth/Height, прокрутку окна)
  // в пикселях экрана, а размеры в стилях считает в пикселях страницы: меню, подсказки и перетаскивание встали бы мимо.
  // Поэтому при размере не 100 % эти свойства отдают пиксели страницы — как при масштабе самого браузера (sizeShim);
  // devicePixelRatio тоже растёт, и холсты колеса остаются чёткими. При 100 % ничего не подменяется.
  // Браузер, который не знает zoom или считает его по-старому (координаты не масштабирует), размер не меняет: size.ok() — false.
  const SIZE_KEY = 'casualhub.size.v1', SIZES = [80, 90, 100, 110, 125, 150];
  const root = document.documentElement;
  const findDesc = (o, p) => { for (; o; o = Object.getPrototypeOf(o)) { const d = Object.getOwnPropertyDescriptor(o, p); if (d) return d; } return null; };
  // настоящие (до подмены) координаты окна — в пикселях экрана
  const natRect = Element.prototype.getBoundingClientRect, natScrollTo = window.scrollTo;
  const natGet = { w: findDesc(window, 'innerWidth'), x: findDesc(window, 'scrollX'), y: findDesc(window, 'scrollY') };
  const natOf = (k) => { try { return natGet[k] && natGet[k].get ? natGet[k].get.call(window) : 0; } catch (e) { return 0; } };
  let sizeNow = 100, zk = 1, shimOn = false, sizeCan = null; // zk — сколько пикселей экрана в пикселе страницы
  // умеет ли браузер: знает zoom и считает его по стандарту — блок шириной 100 px внутри zoom: 2 отдаёт ширину 200
  // (по-старому — 100: координаты не масштабируются, и меню с перетаскиванием встали бы мимо). Проверяется один раз, когда понадобилось
  const sizeOk = () => {
    if (sizeCan !== null) return sizeCan;
    sizeCan = false;
    try {
      if (!(window.CSS && CSS.supports && CSS.supports('zoom', '2'))) return false;
      const p = document.createElement('div');
      p.style.cssText = 'position:fixed;left:0;top:0;zoom:2;visibility:hidden;pointer-events:none';
      p.appendChild(document.createElement('div')).style.cssText = 'width:100px;height:1px';
      (document.body || root).appendChild(p);
      sizeCan = Math.abs(natRect.call(p.firstChild).width / zk - 200) < 4;
      p.remove();
    } catch (e) {}
    return sizeCan;
  };
  const sizeStored = () => { try { const v = +localStorage.getItem(SIZE_KEY); return SIZES.includes(v) ? v : 100; } catch (e) { return 100; } };
  // крупный размер ставится, только если странице остаётся достаточно ширины: запросы @media на zoom не смотрят и раскладку
  // выбирают по настоящей ширине окна. Раскладке для компьютера (окно от 980 px) нужно не меньше 720 px, для планшета
  // (от 560) — 560, телефонной — 320: иначе колонки для широкого экрана оказались бы в ширине телефона.
  // Не помещается — ставится самый крупный из помещающихся
  const sizeFit = (pct) => {
    const a = natOf('w'), b = (window.screen && screen.width) || 0, w = a && b ? Math.min(a, b) : a || b;
    if (!w) return pct;
    const min = w >= 980 ? 720 : w >= 560 ? 560 : 320;
    let best = Math.min(pct, 100);
    for (const s of SIZES) if (s > best && s <= pct && w / (s / 100) >= min) best = s;
    return best;
  };
  function sizeShim() {
    if (shimOn) return;
    shimOn = true;
    const down = (v) => (zk === 1 ? v : v / zk), up = (v) => (zk === 1 ? v : v * zk);
    // свойство-геттер на obj (само свойство может жить выше по цепочке прототипов) → то же, но через conv
    const acc = (obj, names, conv, back) => names.forEach((p) => {
      const d = findDesc(obj, p);
      if (!d || !d.get) return;
      try {
        Object.defineProperty(obj, p, {
          configurable: true, enumerable: !!d.enumerable,
          get() { return conv(d.get.call(this)); },
          ...(d.set ? { set(v) { d.set.call(this, back ? back(v) : v); } } : {}),
        });
      } catch (e) {}
    });
    acc(window, ['innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset'], down);
    acc(window, ['devicePixelRatio'], up);
    acc(MouseEvent.prototype, ['clientX', 'clientY', 'pageX', 'pageY', 'x', 'y'], down);
    if (window.Touch) acc(Touch.prototype, ['clientX', 'clientY', 'pageX', 'pageY'], down);
    // у <html> ширина, высота и прокрутка — это окно: тоже в пикселях экрана (у остальных элементов — уже в пикселях страницы)
    acc(root, ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight'], down);
    acc(root, ['scrollTop', 'scrollLeft'], down, up);
    const rect = (nat) => function () { const r = nat.apply(this, arguments); return zk === 1 ? r : new DOMRect(r.x / zk, r.y / zk, r.width / zk, r.height / zk); };
    Element.prototype.getBoundingClientRect = rect(natRect);
    if (window.Range && Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = rect(Range.prototype.getBoundingClientRect);
    ['elementFromPoint', 'elementsFromPoint'].forEach((n) => {
      const f = Document.prototype[n];
      if (f) Document.prototype[n] = function (x, y) { return f.call(this, up(x), up(y)); };
    });
    ['scrollTo', 'scroll', 'scrollBy'].forEach((n) => {
      const f = window[n];
      if (typeof f !== 'function') return;
      window[n] = function (a, b) {
        if (zk === 1 || !arguments.length) return f.apply(window, arguments);
        if (a && typeof a === 'object') { const o = Object.assign({}, a); if (typeof o.top === 'number') o.top *= zk; if (typeof o.left === 'number') o.left *= zk; return f.call(window, o); }
        return arguments.length < 2 ? f.apply(window, arguments) : f.call(window, a * zk, b * zk);
      };
    });
  }
  function sizeSet(pct) {
    pct = SIZES.includes(+pct) && (+pct === 100 || sizeOk()) ? +pct : 100;
    const z = pct / 100, was = zk, sx = natOf('x'), sy = natOf('y');
    if (z === 1) { root.style.zoom = ''; root.style.removeProperty('--uiz'); }
    else { root.style.zoom = String(z); root.style.setProperty('--uiz', String(z)); sizeShim(); }
    zk = z;
    sizeNow = pct;
    // страница растянулась или сжалась, а прокрутка окна считается в пикселях экрана: остаёмся на том же месте
    if (zk !== was && (sx || sy)) { try { natScrollTo.call(window, sx * zk / was, sy * zk / was); } catch (e) {} }
    return pct;
  }
  // размер сменился: кто считает раскладку и холсты по событию resize — пересчитает (колесо, котик, меню ☰)
  const sizeTell = () => {
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    document.dispatchEvent(new CustomEvent('casualhub:size', { detail: sizeNow }));
  };
  // что должно стоять сейчас: выбранный размер или, на узком экране, самый крупный из помещающихся
  let sizeWant = sizeStored(); // что просили последним (apply без save — тоже): по нему размер возвращается, когда окно снова стало шире
  const sizeSync = () => { const was = sizeNow; if (sizeFit(sizeWant) !== was && sizeSet(sizeFit(sizeWant)) !== was) sizeTell(); };
  // list — какие размеры есть (%), get() — какой стоит на странице, stored() — какой выбран в этом браузере (на узком экране
  // стоит меньший), fits(pct) — помещается ли на этом экране, ok() — умеет ли браузер, apply(pct, save) — поставить (и запомнить)
  const size = Object.freeze({
    list: SIZES, get: () => sizeNow, stored: sizeStored, fits: (pct) => sizeFit(pct) === pct, ok: sizeOk,
    apply(pct, save) {
      pct = SIZES.includes(+pct) ? +pct : 100;
      sizeWant = pct;
      const was = sizeNow;
      sizeSet(sizeFit(pct));
      if (save) { try { if (pct === 100 || !sizeOk()) localStorage.removeItem(SIZE_KEY); else localStorage.setItem(SIZE_KEY, String(pct)); } catch (e) {} }
      if (sizeNow !== was) sizeTell();
      return sizeNow;
    },
  });
  if (sizeStored() !== 100) sizeSet(sizeFit(sizeStored()));
  // окно сузили или расширили — крупный размер мог перестать помещаться (или снова поместиться); выбрали в другой вкладке — эта тоже меняется
  let sizeT = 0;
  addEventListener('resize', () => { clearTimeout(sizeT); sizeT = setTimeout(sizeSync, 150); });
  addEventListener('storage', (e) => { if (e.key === SIZE_KEY) { sizeWant = sizeStored(); sizeSync(); } });

  window.CasualUtil = Object.freeze({ esc, read, plural, script, emptyArt, loop, confetti, size });
  // котик Васян внизу экрана (vasyan.js сам проверяет, не выключен ли он в Настройках; в админке и на /r/ его нет)
  if (!/^\/(admin|r)\//.test(location.pathname)) script('/vasyan.js', () => !!window.CasualVasyan).catch(() => {});
})();
