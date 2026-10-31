/* Казуал Хаб: просмотр картинки на весь экран. Она вылетает из того места, где на неё нажали, и туда же возвращается: только движение, без растворения.
   window.CasualPhotoView.open({ src, full, from, caption, action }): full — обещание полной версии, from — элемент, откуда вылетать, action — { label, run }. */
(() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
  const css = document.createElement('style');
  css.textContent = `
.pv { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); overflow: hidden; overscroll-behavior: contain; cursor: zoom-out;
  background: color-mix(in srgb, var(--bg) 72%, transparent); -webkit-backdrop-filter: blur(14px) saturate(1.1); backdrop-filter: blur(14px) saturate(1.1); }
.pv-fig { margin: 0; min-width: 0; display: grid; justify-items: center; gap: 10px; }
.pv-img { display: block; max-width: 100%; border-radius: 14px; background: var(--panel-2); box-shadow: 0 30px 70px -24px rgba(0, 0, 0, .6); user-select: none; -webkit-user-select: none; -webkit-user-drag: none; }
.pv-cap { max-width: min(92vw, 720px); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; font-size: 14px; font-weight: 700; line-height: 1.3; text-align: center; color: var(--ink); }
.pv-cap:empty, .pv-act[hidden] { display: none; }
.pv-act { cursor: pointer; }
.pv-x { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--panel-2); color: var(--ink); font: inherit; font-size: 16px; cursor: pointer; }
.pv-x:hover { color: var(--accent); }
.pv-x:focus-visible, .pv-act:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
body.pv-lock { overflow: hidden; }`;
  document.head.appendChild(css);

  let cur = null, wanted = 0;

  // большая картинка влезает в экран, маленькая (аватарка) растёт не больше чем в два с половиной раза
  function fit(w, h, extra) {
    const pad = 32;
    const k = Math.min((innerWidth - pad) / w, (innerHeight - pad - extra) / h, Math.max(1, Math.min(2.5, 720 / Math.max(w, h))));
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  }
  function layout() {
    if (!cur) return;
    const { img, cap, act, nw, nh } = cur;
    const extra = (cap.textContent ? cap.offsetHeight + 10 : 0) + (act.hidden ? 0 : act.offsetHeight + 10);
    const [w, h] = fit(nw, nh, extra);
    img.style.width = w + 'px';
    img.style.height = h + 'px';
  }
  // откуда лететь и куда возвращаться: то место на странице, где лежит картинка
  function placeOf(el, img) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return null;
    const b = img.getBoundingClientRect();
    const k = Math.max(r.width / b.width, r.height / b.height);
    const dx = r.left + r.width / 2 - (b.left + b.width / 2), dy = r.top + r.height / 2 - (b.top + b.height / 2);
    const rad = getComputedStyle(el).borderTopLeftRadius;
    return { transform: `translate(${dx}px, ${dy}px) scale(${k})`, borderRadius: /%/.test(rad) ? rad : (parseFloat(rad) || 0) / k + 'px' };
  }
  function onKey(e) {
    if (!cur) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [cur.x, cur.act].filter((n) => !n.hidden);
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      e.stopPropagation();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }
  function close() {
    if (!cur || cur.closing) return;
    const me = cur;
    me.closing = true;
    const finish = () => {
      me.box.remove();
      if (cur === me) cur = null;
      document.body.classList.remove('pv-lock');
      document.removeEventListener('keydown', onKey, true);
      removeEventListener('resize', layout);
      if (me.back && me.back.isConnected && me.back !== document.body) me.back.focus({ preventScroll: true });
    };
    if (calm || !me.img.animate) { finish(); return; }
    const to = placeOf(me.from, me.img) || { transform: 'translateY(60px) scale(.9)' };
    me.img.animate([{ transform: 'none', borderRadius: '14px' }, { borderRadius: '14px', ...to }], { duration: 240, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' });
    [me.cap, me.act, me.x].forEach((n) => n.animate([{ transform: 'none' }, { transform: 'scale(0)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' }));
    setTimeout(finish, 230); // по таймеру: в фоновой вкладке анимации не доигрывают
  }
  function show(o, pre) {
    const box = document.createElement('div');
    box.className = 'pv';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Просмотр картинки');
    box.innerHTML = '<button type="button" class="pv-x" aria-label="Закрыть">✕</button><figure class="pv-fig"><img class="pv-img" alt="" draggable="false"><figcaption class="pv-cap"></figcaption><button type="button" class="btn small ghost pv-act" hidden></button></figure>';
    const img = box.querySelector('.pv-img'), cap = box.querySelector('.pv-cap'), act = box.querySelector('.pv-act'), x = box.querySelector('.pv-x');
    img.referrerPolicy = 'no-referrer';
    img.src = pre.src;
    cap.textContent = o.caption || '';
    if (o.action) { act.textContent = o.action.label; act.hidden = false; }
    cur = { box, img, cap, act, x, from: o.from || null, back: document.activeElement, nw: pre.naturalWidth || 1, nh: pre.naturalHeight || 1 };
    const me = cur;
    document.body.appendChild(box);
    document.body.classList.add('pv-lock');
    layout();
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', layout);
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const go = o.action && e.target.closest('.pv-act');
      close();
      if (go) setTimeout(o.action.run, calm ? 0 : 250);
    });
    x.focus({ preventScroll: true });
    if (!calm && img.animate) {
      const from = placeOf(me.from, img) || { transform: 'translateY(48px) scale(.86)', borderRadius: '14px' };
      img.animate([from, { transform: 'none', borderRadius: '14px' }], { duration: 520, easing: SPRING });
      [cap, act].forEach((n, i) => n.animate([{ transform: 'translateY(26px) scale(.8)' }, { transform: 'none' }], { duration: 460, delay: 110 + i * 50, easing: SPRING, fill: 'backwards' }));
      x.animate([{ transform: 'scale(0) rotate(-90deg)' }, { transform: 'none' }], { duration: 420, delay: 120, easing: SPRING, fill: 'backwards' });
    }
    // в списках лежит превью: полная версия подменяет его, как только загрузится
    if (o.full) {
      Promise.resolve(o.full).then((src) => {
        if (!src || src === pre.src || cur !== me || me.closing) return;
        const big = new Image();
        big.referrerPolicy = 'no-referrer';
        big.onload = () => {
          if (cur !== me || me.closing) return;
          const was = img.getBoundingClientRect().width;
          img.src = src;
          me.nw = big.naturalWidth || me.nw;
          me.nh = big.naturalHeight || me.nh;
          layout();
          const now = img.getBoundingClientRect().width;
          if (!calm && img.animate && Math.abs(was - now) > 2) img.animate([{ transform: `scale(${was / now})` }, { transform: 'none' }], { duration: 320, easing: SPRING });
        };
        big.src = src;
      }, () => {});
    }
  }
  function open(o) {
    if (!o || !o.src || cur) return;
    const ask = ++wanted;
    const pre = new Image();
    pre.referrerPolicy = 'no-referrer';
    pre.onload = () => { if (ask === wanted && !cur) show(o, pre); };
    pre.src = o.src;
  }
  window.CasualPhotoView = { open, close };
})();
