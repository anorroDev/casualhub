/* Казуал Хаб: общая живость для всех страниц — только движение, без растворения.
   Кнопки пружинят при нажатии, блоки ниже экрана въезжают снизу при прокрутке, числа в статистике досчитываются,
   уведомления выезжают сверху. Ничего не делает, если в системе включено «уменьшить движение». */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return;
  const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

  const css = document.createElement('style');
  css.textContent = `
.toast { opacity: 1 !important; visibility: hidden; transform: translate(-50%, calc(-100% - 40px)) scale(.92) !important; transition: transform .45s ${SPRING}, visibility 0s linear .45s !important; }
.toast.show { visibility: visible; transform: translate(-50%, 0) scale(1) !important; transition: transform .45s ${SPRING}, visibility 0s !important; }`;
  document.head.appendChild(css);

  // нажатие: кнопка чуть проседает и пружинит обратно (свойство scale не мешает своим transform у кнопок)
  const PRESS = 'button, summary, a.theme-btn, a.btn, .btn, [role="button"]';
  const SKIP = '.cell, .crit-cells *, canvas, input, select, textarea, .rx-btns button, .howto-x';
  let pressed = null, down = null;
  const release = () => {
    if (!pressed) return;
    if (down) down.cancel();
    pressed.animate([{ scale: '.94' }, { scale: '1' }], { duration: 380, easing: SPRING });
    pressed = null; down = null;
  };
  addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest(PRESS);
    if (!b || b.disabled || b.matches(SKIP) || b.closest('[data-no-press]')) return;
    pressed = b;
    down = b.animate([{ scale: '1' }, { scale: '.94' }], { duration: 110, easing: 'ease-out', fill: 'forwards' });
  }, { passive: true });
  ['pointerup', 'pointercancel', 'dragstart'].forEach((t) => addEventListener(t, release, { passive: true }));
  addEventListener('blur', release);

  // наведение мышью: карточки, чипы и строки списков чуть приподнимаются (свойство translate — не мешает их transition и transform)
  if (matchMedia('(hover: hover)').matches) {
    const LIFT = '.chip-btn, button.cat, button.stat, a.pod, a.item, .fr-row, .cm-item, .kpi-card, .app, .feed .fd, .mcard, .rel';
    const lifted = new WeakMap();
    addEventListener('pointerover', (e) => {
      const el = e.target.closest && e.target.closest(LIFT);
      if (!el || lifted.has(el) || el.disabled) return;
      lifted.set(el, el.animate([{ translate: '0 0' }, { translate: '0 -3px' }], { duration: 220, easing: SPRING, fill: 'forwards' }));
      const out = (ev) => {
        if (ev.relatedTarget && el.contains(ev.relatedTarget)) return;
        el.removeEventListener('pointerout', out);
        const a = lifted.get(el); lifted.delete(el);
        if (a) a.cancel();
        el.animate([{ translate: '0 -3px' }, { translate: '0 0' }], { duration: 260, easing: SPRING });
      };
      el.addEventListener('pointerout', out);
    }, { passive: true });
  }

  // блоки, которые при загрузке были ниже экрана, въезжают снизу, когда до них долистали
  const REVEAL = '.kpi-card, .stat-block, .rel, .log-day, .card:not(.rise), .app, .fx-reveal';
  const seen = new WeakSet();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const k = +en.target.dataset.fxK || 0;
    en.target.animate([{ translate: '0 34px', scale: '.97' }, { translate: '0 0', scale: '1' }], { duration: 750, delay: k * 60, easing: SPRING, fill: 'backwards' });
    countUp(en.target);
  }), { rootMargin: '0px 0px -40px 0px' }) : null;
  const scan = () => {
    if (!io) return;
    const vh = innerHeight;
    let k = 0, lastTop = null;
    document.querySelectorAll(REVEAL).forEach((el) => {
      if (seen.has(el)) return;
      const r = el.getBoundingClientRect();
      if (!r.height) return; // скрытая вкладка: проверим, когда её откроют
      seen.add(el);
      if (r.top < vh) return; // уже видно сразу — его покажет своя анимация страницы
      // соседи в одной строке въезжают лесенкой
      k = lastTop !== null && Math.abs(r.top - lastTop) < 4 ? k + 1 : 0;
      lastTop = r.top;
      el.dataset.fxK = k;
      io.observe(el);
    });
  };
  // числа в карточках статистики досчитываются от нуля, когда карточка показалась
  function countUp(root) {
    root.querySelectorAll('.kpi-val').forEach((n) => {
      const txt = n.textContent.trim();
      if (!/^\d{1,6}$/.test(txt) || n.dataset.fxCounted) return;
      n.dataset.fxCounted = '1';
      const end = +txt, t0 = performance.now(), dur = Math.min(900, 300 + end * 20);
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        n.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
        if (p < 1 && n.isConnected) requestAnimationFrame(step); else n.textContent = txt;
      };
      if (end > 0) requestAnimationFrame(step);
    });
  }
  // обложки, фото и аватарки, которые догрузились, когда страница уже стоит, слегка «выпрыгивают» (только масштаб)
  addEventListener('load', (e) => {
    const im = e.target;
    if (!im || im.tagName !== 'IMG' || !im.isConnected || im.closest('.theme-menu, .hist-menu, #baseThumbs')) return;
    const r = im.getBoundingClientRect();
    if (r.width < 24 || r.bottom < 0 || r.top > innerHeight) return;
    im.animate([{ scale: '.9' }, { scale: '1' }], { duration: 420, easing: SPRING });
  }, true);
  // баллы и числа подпрыгивают, когда появились на экране (один раз)
  const POP = '.badge, .fd-score:not(.none), .kpi-val, .adm-stat b';
  const popped = new WeakSet();
  const pio = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) return;
    pio.unobserve(en.target);
    // перерисовка списка (поиск, фильтр) не должна заново подбрасывать всё, что и так на экране: прыгают только при первом показе и при прокрутке
    if (performance.now() > 2500 && en.time - (+en.target.dataset.fxObs || 0) < 80) return;
    en.target.animate([{ scale: '.6', rotate: '-6deg' }, { scale: '1.08', rotate: '2deg', offset: 0.6 }, { scale: '1', rotate: '0deg' }], { duration: 520, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }), { rootMargin: '0px 0px -20px 0px' }) : null;
  const popScan = () => { if (pio) document.querySelectorAll(POP).forEach((el) => { if (!popped.has(el)) { popped.add(el); el.dataset.fxObs = performance.now(); pio.observe(el); } }); };
  // значки вкладок и пунктов меню покачиваются при нажатии
  addEventListener('click', (e) => {
    const ic = e.target.closest && e.target.closest('.mnav button, .adm-tabs button, .hm-panel a, .hm-panel button');
    const g = ic && ic.querySelector('.mi, span[aria-hidden="true"], svg');
    if (g && g.animate) g.animate([{ rotate: '0deg' }, { rotate: '-14deg', scale: '1.2' }, { rotate: '10deg' }, { rotate: '0deg', scale: '1' }], { duration: 480, easing: 'ease-out' });
  }, { passive: true });

  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); popScan(); }); };
  const start = () => { scan(); popScan(); new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); addEventListener('click', () => setTimeout(later, 60)); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
