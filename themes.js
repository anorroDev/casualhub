/* Казуал Хаб: темы оформления — один список на все страницы и меню выбора с живыми превью.
   Цвета каждой темы задаются в CSS страниц (:root[data-theme=…]); здесь только то, что нужно для меню:
   название, значок и три цвета для картинки-превью (фон, панель, акцент). */
(() => {
  const T = (id, name, icon, group, bg, panel, accent) => ({ id, name, icon, group, sw: [bg, accent], prev: { bg, panel, accent } });
  const LIST = [
    T('auto', 'Авто', '🌓', 'auto', '#ECEEF3', '#0D0F14', '#3550E8'),
    T('light', 'Светлая', '☀️', 'light', '#ECEEF3', '#FFFFFF', '#3550E8'),
    T('sand', 'Песок', '🏜️', 'light', '#F3EDE3', '#FFFCF7', '#C2571B'),
    T('sakura', 'Сакура', '🌸', 'light', '#FBEFF3', '#FFFFFF', '#D6336C'),
    T('mint', 'Мята', '🌿', 'light', '#EAF6F1', '#FFFFFF', '#0F9D76'),
    T('lavender', 'Лаванда', '💜', 'light', '#F1EEFA', '#FFFFFF', '#7C4DDB'),
    T('sky', 'Небо', '☁️', 'light', '#EAF3FB', '#FFFFFF', '#1D7FD6'),
    T('peach', 'Персик', '🍑', 'light', '#FDF0E8', '#FFFFFF', '#E8692A'),
    T('lemon', 'Лимон', '🍋', 'light', '#FAF7E4', '#FFFFFF', '#A16207'),
    T('dark', 'Тёмная', '🌙', 'dark', '#0D0F14', '#161920', '#8C9BFF'),
    T('neon', 'Неон', '🌆', 'dark', '#120B1F', '#1B1230', '#FF4FD8'),
    T('ocean', 'Океан', '🌊', 'dark', '#07131F', '#0C1B2B', '#38BDF8'),
    T('forest', 'Лес', '🌲', 'dark', '#0E1411', '#141C17', '#4CC9C0'),
    T('amethyst', 'Аметист', '🔮', 'dark', '#110E1C', '#171328', '#A98BFF'),
    T('coffee', 'Кофе', '☕', 'dark', '#170F0B', '#1F1510', '#FF8F57'),
    T('vampire', 'Вампир', '🦇', 'dark', '#140A0C', '#1D0F12', '#FF4D5E'),
    T('graphite', 'Графит', '🖤', 'dark', '#000000', '#0E0E0F', '#FFB020'),
  ];
  const GROUPS = [['auto', ''], ['light', 'Светлые'], ['dark', 'Тёмные']];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // карточка темы: маленькая «страница» в её цветах — фон, панель и акцентная кнопка
  const card = (t, current, i) => {
    const p = t.prev;
    const bg = t.id === 'auto' ? `linear-gradient(135deg, ${p.bg} 50%, ${p.panel} 50%)` : p.bg;
    return `<button type="button" class="theme-opt tm${t.id === 'auto' ? ' tm-wide' : ''}" data-theme-id="${t.id}" aria-pressed="${t.id === current}" style="--ti:${i}">`
      + `<span class="tm-prev" style="--pb:${bg};--pp:${t.id === 'auto' ? '#FFFFFF' : p.panel};--pa:${p.accent}" aria-hidden="true"><span class="tm-panel"></span><span class="tm-btn"></span><span class="tm-dot"></span></span>`
      + `<span class="tm-name">${t.icon} ${esc(t.name)}${t.id === 'auto' ? '<small>светлая днём, тёмная ночью — как в телефоне или компьютере</small>' : ''}</span></button>`;
  };
  function menuHTML(current) {
    let i = 0;
    return GROUPS.map(([g, title]) => (title ? `<span class="tm-group">${title}</span>` : '') + LIST.filter((t) => t.group === g).map((t) => card(t, current, i++)).join('')).join('');
  }

  const css = document.createElement('style');
  css.textContent = `
.theme-menu.tm-grid { width: min(300px, calc(100vw - 16px)); grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 8px; max-height: min(72vh, 560px); overflow-y: auto; overscroll-behavior: contain; }
.theme-menu.tm-grid .tm-group { grid-column: 1 / -1; padding: 6px 4px 0; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.theme-menu.tm-grid .theme-opt.tm { display: grid; gap: 6px; height: auto; padding: 6px; border: 2px solid transparent; border-radius: 12px; text-align: left; align-content: start; }
.theme-menu.tm-grid .theme-opt.tm-wide { grid-column: 1 / -1; grid-template-columns: 76px minmax(0, 1fr); align-items: center; }
.theme-menu.tm-grid .tm-prev { position: relative; display: block; height: 44px; border-radius: 8px; background: var(--pb); box-shadow: inset 0 0 0 1px rgb(127 127 127 / .25); overflow: hidden; }
.theme-menu.tm-grid .tm-panel { position: absolute; left: 7px; right: 7px; top: 7px; height: 14px; border-radius: 4px; background: var(--pp); box-shadow: 0 1px 2px rgb(0 0 0 / .12); }
.theme-menu.tm-grid .tm-btn { position: absolute; left: 7px; bottom: 7px; width: 46%; height: 9px; border-radius: 99px; background: var(--pa); }
.theme-menu.tm-grid .tm-dot { position: absolute; right: 7px; bottom: 6px; width: 11px; height: 11px; border-radius: 50%; background: var(--pa); opacity: .55; }
.theme-menu.tm-grid .tm-name { display: grid; font-size: 13px; font-weight: 700; line-height: 1.2; color: var(--ink); }
.theme-menu.tm-grid .tm-name small { font-size: 11.5px; font-weight: 500; color: var(--ink-3); }
.theme-menu.tm-grid .theme-opt.tm:hover { background: var(--panel-2); }
.theme-menu.tm-grid .theme-opt.tm[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
.theme-pick[open] .theme-menu.tm-grid .theme-opt.tm { animation: tm-in .45s cubic-bezier(.34, 1.56, .64, 1) backwards; animation-delay: calc(var(--ti, 0) * 22ms); }
.theme-menu.tm-grid .theme-opt.tm:hover .tm-prev { transform: translateY(-2px) rotate(-1.5deg); }
.theme-menu.tm-grid .tm-prev { transition: transform .25s cubic-bezier(.34, 1.56, .64, 1); }
@keyframes tm-in { from { transform: translateY(10px) scale(.92); } }
@media (prefers-reduced-motion: reduce) { .theme-pick[open] .theme-menu.tm-grid .theme-opt.tm { animation: none; } }
.theme-menu.tm-grid .theme-opt.tm:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }`;
  document.head.appendChild(css);

  window.CasualThemes = { list: LIST, ids: LIST.map((t) => t.id), find: (id) => LIST.find((t) => t.id === id) || LIST[0], menuHTML };
})();
