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
  // ---------- вид интерфейса (Настройки → «Внешний вид», settings.js); работает с любой темой ----------
  // «Казуальный» — класс unslop на <html>: тише, без свечений, пятен фона и прыгающих анимаций. Остальные виды строятся
  // поверх него: unslop + data-ui="<id>" и свой файл /ui/<id>.css со своими шрифтами и анимациями.
  // До первой отрисовки вид ставят head-скрипты страниц (файл — через document.write), здесь — выбор и смена без перезагрузки.
  // Прежний ключ casualhub.unslop.v1 («1» у любого вида, кроме обычного) остаётся: старые вкладки покажут хотя бы казуальный
  const UI_KEY = 'casualhub.ui.v1', UNSLOP_KEY = 'casualhub.unslop.v1';
  // новый вид: строка здесь, файл /ui/<id>.css и id в списке head-скриптов (hub.head.js и другие)
  const UI = [
    { id: 'normal', name: 'Обычный', desc: 'Привычный сайт: цветные пятна, свечения и живые анимации' },
    { id: 'casual', name: 'Казуальный', desc: 'Спокойнее: без свечений, цветных пятен и прыгающих анимаций' },
    { id: 'minimal', name: 'Минимал', desc: 'Много воздуха, крупные чистые заголовки, плавные переходы' },
    { id: 'pixel', name: 'Пиксель', desc: 'Как меню старой игры: прямые углы, жёсткие тени, пиксельный шрифт' },
    { id: 'paper', name: 'Газета', desc: 'Как журнал: шрифт с засечками, тонкие линии, без теней' },
    { id: 'lobby', name: 'Лобби', desc: 'Плотные скруглённые панели и подсветка строк, как в чате' },
    { id: 'arena', name: 'Арена', desc: 'Срезанные углы, узкий шрифт заглавными, резкие анимации' },
  ];
  const uiIds = UI.map((x) => x.id);
  const withFile = (id) => id !== 'normal' && id !== 'casual';
  // что выбрано в этом браузере (без ключа — по прежнему переключателю «Казуальный вид»)
  function uiStored() {
    try {
      const v = localStorage.getItem(UI_KEY);
      if (uiIds.includes(v)) return v;
      return localStorage.getItem(UNSLOP_KEY) === '1' ? 'casual' : 'normal';
    } catch (e) { return 'normal'; }
  }
  // что стоит на этой странице сейчас
  const uiNow = () => document.documentElement.dataset.ui || (document.documentElement.classList.contains('unslop') ? 'casual' : 'normal');
  let uiSeq = 0;
  function uiApply(id, save) {
    const v = uiIds.includes(id) ? id : 'normal';
    if (save) {
      try {
        localStorage.setItem(UI_KEY, v);
        if (v === 'normal') localStorage.removeItem(UNSLOP_KEY); else localStorage.setItem(UNSLOP_KEY, '1');
      } catch (e) {}
    }
    const my = ++uiSeq, el = document.documentElement;
    let done = false;
    const set = () => {
      if (done || my !== uiSeq) return;
      done = true;
      el.classList.toggle('unslop', v !== 'normal');
      if (withFile(v)) el.dataset.ui = v; else delete el.dataset.ui;
      document.querySelectorAll('link[data-ui-css]').forEach((l) => { if (l.dataset.uiCss !== v) l.remove(); });
      document.dispatchEvent(new CustomEvent('casualhub:ui', { detail: v }));
    };
    if (!withFile(v) || document.querySelector(`link[data-ui-css="${v}"]`)) { set(); return v; }
    // файл вида грузится заранее, а включается, когда загрузился: страница не мелькает наполовину оформленной
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `/ui/${v}.css`;
    l.dataset.uiCss = v;
    l.onload = l.onerror = set;
    document.head.appendChild(l);
    setTimeout(set, 3000); // не дождались файла — включаем как есть
    return v;
  }
  // выбрали в другой вкладке — эта тоже переключается
  addEventListener('storage', (e) => { if (e.key === UI_KEY || e.key === UNSLOP_KEY) uiApply(uiStored(), false); });

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
  // ui — вид интерфейса: list (порядок для Настроек), current() — что стоит сейчас, apply(id, save)
  window.CasualThemes = { list: LIST, ids: LIST.map((t) => t.id), find, apply, current: () => current, ui: { list: UI, current: uiNow, apply: uiApply } };
})();
