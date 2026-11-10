/* Казуал Хаб: темы оформления — один список на все страницы и CasualThemes.apply, которым тема ставится везде.
   Цвета каждой темы задаются в CSS страниц (:root[data-theme=…]); здесь название, значок и три цвета
   для картинки-превью (фон, панель, акцент). Выбирают тему в Настройках (settings.js, раздел «Внешний вид»),
   до первой отрисовки её ставят head-скрипты страниц из ocenshik.prefs.v1. */
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
  // «Казуальный вид» (unslop): тише, без свечений, пятен фона и прыгающих анимаций; работает с любой темой.
  // Переключатель — в Настройках, раздел «Внешний вид» (settings.js), а включает и запоминает его обработчик ниже
  const UNSLOP_KEY = 'casualhub.unslop.v1';
  document.addEventListener('change', (e) => {
    const c = e.target.closest && e.target.closest('[data-unslop]');
    if (!c) return;
    document.documentElement.classList.toggle('unslop', c.checked);
    try { if (c.checked) localStorage.setItem(UNSLOP_KEY, '1'); else localStorage.removeItem(UNSLOP_KEY); } catch (er) {}
    document.querySelectorAll('[data-unslop]').forEach((x) => { x.checked = c.checked; });
  });
  // включили в другой вкладке — эта тоже переключается
  addEventListener('storage', (e) => { if (e.key === UNSLOP_KEY) { const on = e.newValue === '1'; document.documentElement.classList.toggle('unslop', on); document.querySelectorAll('[data-unslop]').forEach((x) => { x.checked = on; }); } });

  const PREFS_KEY = 'ocenshik.prefs.v1'; // общий для сайта: тема и то, что запоминает Мнение
  const root = document.documentElement;
  const find = (id) => LIST.find((t) => t.id === id) || LIST[0];
  // head-скрипт уже поставил тему; неизвестную (например, убранную из списка) снимаем, чтобы работало «Авто»
  const was = root.getAttribute('data-theme');
  if (was !== null && (was === 'auto' || find(was).id !== was)) root.removeAttribute('data-theme');
  let current = root.getAttribute('data-theme') || 'auto';

  // Ставит тему на страницу: data-theme на <html>. «Авто» — без атрибута: светлую или тёмную выбирает система
  // (@media (prefers-color-scheme: dark) в CSS страниц). save — запомнить в этом браузере для всех страниц.
  // from — кнопка, от которой новая тема расходится кругом (html.theme-swap в CSS страниц), если браузер это умеет.
  // Холсты Колеса и лотов перерисовываются сами: следят за data-theme и за темой системы
  function apply(id, save, from) {
    const th = find(id);
    current = th.id;
    if (save) {
      try {
        let p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
        if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
        p.theme = th.id;
        localStorage.setItem(PREFS_KEY, JSON.stringify(p));
      } catch (e) {}
    }
    const set = () => { if (th.id === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', th.id); };
    if (!from || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { set(); return th.id; }
    const r = from.getBoundingClientRect();
    root.style.setProperty('--tx', `${r.left + r.width / 2}px`);
    root.style.setProperty('--ty', `${r.top + r.height / 2}px`);
    root.classList.add('theme-swap');
    let done = false;
    const go = () => { if (!done) { done = true; set(); } };
    const vt = document.startViewTransition(go);
    vt.ready.catch(() => {});
    if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
    vt.finished.catch(() => {}).finally(() => root.classList.remove('theme-swap'));
    setTimeout(go, 400); // если переход не начался (вкладка в фоне), тема всё равно сменится
    return th.id;
  }

  // current — тема, которая сейчас на этой странице (id из list)
  window.CasualThemes = { list: LIST, ids: LIST.map((t) => t.id), find, apply, current: () => current };
})();
