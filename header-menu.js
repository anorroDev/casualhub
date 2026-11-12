/* Казуал Хаб: шапка без россыпи кнопок.
   На виду остаются главная, «Мнение», «Колесо», «Тир-листы», «Друзья», профиль и кнопка ☰. В меню ☰ уезжают «Помощь»,
   «⚙️ Настройки» (окно /settings.js: аккаунт, безопасность, тема, язык, данные) и GitHub. «Что нового» на широком экране стоит в самом углу страницы, на узком — тоже в меню.
   Тема и язык меняются только в Настройках (раздел «Внешний вид»), тему ставит CasualThemes.apply из /themes.js.
   Кнопки переносятся целиком, поэтому их обработчики и счётчики (online.js, whatsnew.js) продолжают работать. */
(() => {
  // музыка чужого аука не обрывается при уходе со страницы зрителя: мини-плеер сам решает, нужно ли ему что-то делать
  try { if (localStorage.getItem('casualhub.lots.follow.v1')) { const f = document.createElement('script'); f.src = '/lots-follow.js'; f.defer = true; document.head.appendChild(f); } } catch (e) {}
  // iPhone и iPad увеличивают страницу, когда нажимаешь на поле с шрифтом меньше 16 px, и она так и остаётся увеличенной.
  // maximum-scale=1 убирает это, а пальцами масштаб на iOS всё равно меняется (Safari этого не запрещает).
  // Только на iOS: на Android та же настройка запретила бы увеличивать страницу пальцами
  try {
    const ios = /iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const vp = document.querySelector('meta[name="viewport"]');
    if (ios && vp && !/maximum-scale/.test(vp.content)) vp.content += ', maximum-scale=1';
  } catch (e) {}
  const MOVE = '#howtoBtn, .howto-btn, a[href*="github.com"]';
  const css = document.createElement('style');
  css.textContent = `
.hm-wrap { position: relative; display: inline-flex; flex: none; }
.hm-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 40px; cursor: pointer; }
.hm-btn svg { flex: none; }
.hm-dot { position: absolute; top: 4px; right: 4px; width: 9px; height: 9px; border-radius: 50%; background: var(--bad, #E4553F); box-shadow: 0 0 0 2px var(--panel, #1b1d24); pointer-events: none; }
.hm-dot[hidden] { display: none; }
.hm-panel { position: fixed; right: 12px; top: 64px; z-index: 95; max-height: calc(100 * var(--dvh, 1vh) - 80px); overflow-x: hidden; overflow-y: auto; width: min(300px, calc(100 * var(--vw, 1vw) - 24px)); display: grid; gap: 6px; padding: 10px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); border: 1px solid var(--line, #2b2e38); border-radius: 16px; box-shadow: 0 24px 50px -20px rgba(0, 0, 0, .55); animation: hm-in .22s cubic-bezier(.34, 1.56, .64, 1); transform-origin: 100% 0; }
@keyframes hm-in { from { transform: translateY(-6px) scale(.97); } }
@media (prefers-reduced-motion: reduce) { .hm-panel { animation: none; } }
.hm-panel[hidden] { display: none; }
.hm-panel > * { animation: hm-item .24s cubic-bezier(.34, 1.56, .64, 1) backwards; animation-delay: calc(min(var(--i, 0), 8) * 15ms); }
@keyframes hm-item { from { transform: translateX(14px); } }
@media (prefers-reduced-motion: reduce) { .hm-panel > * { animation: none; } }
.hm-panel > * { display: flex !important; width: 100%; margin: 0 !important; justify-content: flex-start !important; text-align: left; }
.hm-panel > [hidden] { display: none !important; }
.hm-panel .oc-t, .hm-panel .fb-t, .hm-panel .hb-t, .hm-panel .t, .hm-panel .wn-text, .hm-panel .hm-t, .hm-panel > a > span, .hm-panel > button > span { display: inline !important; }
/* в меню все пункты — строки одной ширины с подписью, даже если на телефоне в шапке они были круглыми значками */
.hm-panel > a, .hm-panel > button, .hm-panel > span { width: 100% !important; min-width: 0 !important; height: auto !important; min-height: 40px; padding: 8px 12px !important; gap: 8px !important; border-radius: 11px !important; font-size: 13.5px !important; line-height: 1.2 !important; align-items: center; }
.hm-t { margin-left: 2px; }
.hm-panel > .hm-all { border: 1.5px solid transparent !important; background: linear-gradient(var(--panel, #1b1d24), var(--panel, #1b1d24)) padding-box, linear-gradient(120deg, var(--accent, #3550E8), #E85FA5 55%, #F5B942) border-box !important; color: var(--ink, #f3f4f6) !important; font-weight: 700 !important; min-height: 46px; margin-bottom: 4px !important; text-decoration: none; transition: box-shadow .2s, transform .2s; }
.hm-panel > .hm-all:focus-visible { transform: translateY(-1px); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3550E8) 20%, transparent), 0 10px 24px -14px #E85FA5; }
/* подъём при наведении — только с мышью: на телефоне после касания строка оставалась «приподнятой» */
@media (hover: hover) { .hm-panel > .hm-all:hover { transform: translateY(-1px); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3550E8) 20%, transparent), 0 10px 24px -14px #E85FA5; } }
.hm-all svg { color: var(--accent, #3550E8); flex: none; }
.hm-all .hm-go { margin-left: auto; font-size: 18px; line-height: 1; opacity: .55; }
/* до 1000 px (телефон боком, планшет) «Мнение», «Колесо», «Тир-листы» и «Друзья» — только значки, а у профиля — только аватар:
   с подписями шапка шла в 2–4 строки (на телефоне боком 640×360 она занимала больше трети экрана). Подписи — в подсказках и в меню ☰ */
@media (max-width: 1000px) {
  /* .ml-text и .wl-text — подписи «Мнение» в Колесе и «Колесо» в Мнении (их ссылки стоят в разметке страниц) */
  .hm-nav .hm-t, .hm-nav .t, .hm-nav .ml-text, .hm-nav .wl-text, .hm-fr .fb-t { display: none !important; }
  .hm-nav, .hm-fr { padding: 0 11px !important; }
  /* в Мнении кнопка профиля своя (.user-pill), в Колесе и Тир-листах — .acct-btn: у них тоже только аватар, размером с соседние кнопки */
  header .acc-name, header .user-pill .user-name, header .acct-btn .acct-name { display: none !important; }
  header .user-pill { width: 40px; height: 40px; padding: 0 !important; gap: 0 !important; justify-content: center; flex: none; }
  header .acct-btn { min-width: 40px; padding: 0 !important; gap: 0 !important; justify-content: center; flex: none; }
}
/* на главной надпись у логотипа — только когда для неё есть место: до 420 px разделы уходят в меню и она помещается,
   а с 481 до 700 px разделы снова в шапке значками */
@media (max-width: 420px), (min-width: 481px) and (max-width: 700px) { header.top > .mark { font-size: 0 !important; gap: 0 !important; } }
/* телефон: «← Хаб» только стрелкой, а на самых узких ещё и без счётчика, чтобы разделы, «Друзья», профиль и ☰ поместились в одну строку */
@media (max-width: 400px) { #homeLink, #backLink, header .pill[href="/"] { margin-right: 0 !important; } .hm-left { margin-right: auto !important; } }
/* место слева, сразу после логотипа: туда levels-ui.js ставит кнопку уровня (и магазин); пустое — ничего не занимает */
.hm-left { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.hm-left:empty { display: none; }
/* всегда сразу за кнопкой главной, остальное — вправо: без замеров при загрузке (они иногда не успевали) */
.hm-left { margin-right: auto !important; margin-left: 8px; }
header a[href="/"]:has(+ .hm-left) { margin-right: 0 !important; }
header.top > .hm-left { margin-left: 4px; }
@media (max-width: 480px) { .top .hm-left { margin-right: auto; } .hm-left { gap: 6px; } }
/* телефон: шапка в одну строку — логотип, уровень, друзья, профиль, ☰; разделы переезжают в меню строкой с подписями */
.hm-panel > .hm-secs { display: none !important; }
@media (max-width: 480px) {
  header .hm-nav { display: none !important; }
  .hm-panel > .hm-secs { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .hm-secs a { display: grid; justify-items: center; gap: 5px; padding: 10px 4px; border-radius: 12px; border: 1px solid var(--line, #2b2e38); color: var(--ink, #f3f4f6); text-decoration: none; font-size: 12.5px; font-weight: 600; min-height: 56px; }
  .hm-secs a[aria-current="page"] { border-color: var(--accent, #3550E8); background: color-mix(in srgb, var(--accent, #3550E8) 12%, transparent); }
}
/* большие экраны (2K, 4K): меню ☰ шире и крупнее, а на 4K при масштабе 100% (от 3000 px) и сами кнопки шапки —
   36 px там выглядели точками */
@media (min-width: 2200px) { .hm-panel { width: 340px; top: 72px; } }
@media (min-width: 3000px) {
  .hm-panel { width: 400px; top: 84px; }
  .hm-panel > a, .hm-panel > button, .hm-panel > span { min-height: 48px; font-size: 16px !important; }
  header .theme-btn, header .pill, header .user-pill, .wn-corner > * { height: 48px; min-width: 48px; font-size: 16.5px; }
  header .theme-btn:not(.hm-btn):not(.lv-shop), header .pill:not(.hm-btn):not(.lv-shop) { padding-inline: 16px; }
  header .theme-btn svg, header .pill svg, .wn-corner svg { width: 19px; height: 19px; }
  header .user-avatar, header .avatar, header .acct-ava { width: 34px; height: 34px; font-size: 15px; }
  header.top > .mark { font-size: 28px; }
  header.top > .mark img { width: 40px; height: 40px; }
}
/* счётчик «на сайте»: в правом углу страницы, а если места нет — строкой в меню */
.wn-corner .oc-mini { box-shadow: 0 10px 24px -14px rgba(0, 0, 0, .6); }
@media (max-width: 480px) { #homeLink, #backLink, header .pill[href="/"] { width: 36px; min-width: 36px; padding: 0 !important; font-size: 0 !important; justify-content: center; } }
/* у гостя на главной «Регистрация» на телефоне не помещается — она есть в окне «Войти» */
@media (max-width: 480px) { #account a[href="/opinion/#reg"] { display: none !important; } }
/* сколько людей на сайте: слева в шапке, только кружок и число (подпись — во всплывающей подсказке) */
.oc-mini { flex: none; min-width: 0 !important; padding: 0 11px !important; gap: 7px !important; }
.oc-mini .oc-t { display: none !important; }
header.top > .oc-mini { margin-right: auto; margin-left: 4px; }
@media (max-width: 480px) { .oc-mini { padding: 0 9px !important; margin-left: 0 !important; } .top .sp { display: none; } .top .oc-mini { margin-right: auto; } }
.wn-corner { position: absolute; top: 14px; right: 16px; z-index: 60; display: flex; align-items: center; gap: 8px; }
.hm-admin { border-color: color-mix(in srgb, #E4553F 55%, var(--line, #2b2e38)) !important; color: var(--ink, #f3f4f6) !important; }
.hm-admin svg { color: #E4553F; flex: none; }
.wn-corner [data-whatsnew] { box-shadow: 0 10px 24px -14px rgba(0, 0, 0, .6); }
`;
  document.head.appendChild(css);
  // ссылка на страницу, где ты уже находишься (кнопка своего профиля на своём профиле, логотип на главной):
  // без перезагрузки и анимации перехода, только наверх страницы
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    // ссылка с «#» — это переход внутри страницы, его не трогаем
    const same = !a.getAttribute('href').includes('#') && a.origin === location.origin && a.pathname === location.pathname && a.search === location.search;
    if (!same && a.getAttribute('aria-current') !== 'page') return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  // ссылка-приглашение (?invite=код): запоминаем до регистрации (friends.js отправит её с регистрацией) и убираем из адреса
  try {
    const inv = new URLSearchParams(location.search).get('invite');
    if (inv && /^[a-z0-9]{8}$/.test(inv)) {
      localStorage.setItem('casualhub.invite.v1', inv);
      const url = new URL(location.href);
      url.searchParams.delete('invite');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch (e) {}
  const MENU_ICON ='<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>';
  const GH_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  const ICON = {
    '/opinion/': '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1.5" y="9" width="3.4" height="5.5" rx="1" fill="#E4553F"/><rect x="6.3" y="6" width="3.4" height="8.5" rx="1" fill="#EAA92C"/><rect x="11.1" y="2" width="3.4" height="12.5" rx="1" fill="#2EAD60"/></svg>',
    '/wheel/': '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#3550E8"/><path d="M8 8V1.5A6.5 6.5 0 0 1 14.5 8z" fill="#EAA92C"/><path d="M8 8h6.5A6.5 6.5 0 0 1 8 14.5z" fill="#2EAD60"/><circle cx="8" cy="8" r="1.8" fill="#fff"/></svg>',
    '/tierlist/': '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1" y="1.5" width="4" height="3.6" rx="1" fill="#2EAD60"/><rect x="6" y="1.5" width="9" height="3.6" rx="1" fill="currentColor" opacity=".55"/><rect x="1" y="6.2" width="4" height="3.6" rx="1" fill="#EAA92C"/><rect x="6" y="6.2" width="6" height="3.6" rx="1" fill="currentColor" opacity=".55"/><rect x="1" y="10.9" width="4" height="3.6" rx="1" fill="#E4553F"/><rect x="6" y="10.9" width="3" height="3.6" rx="1" fill="currentColor" opacity=".55"/></svg>',
  };
  ICON['/king/'] = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2.2 12.2 1.4 4.9l3.5 2.6L8 2.4l3.1 5.1 3.5-2.6-.8 7.3z" fill="#F2C230"/><rect x="2.2" y="12.6" width="11.6" height="2" rx=".6" fill="#D9A21B"/></svg>';
  const NAMES = { '/opinion/': 'Мнение', '/wheel/': 'Колесо', '/tierlist/': 'Тир-листы', '/king/': 'Царь Горы' };
  // окно «Настройки» живёт в /settings.js и грузится при первом открытии: страницам оно не нужно, пока его не открыли
  let setLoad = null;
  function openSettings(section) {
    const sec = typeof section === 'string' ? section : undefined;
    if (window.CasualSettings) { window.CasualSettings.open(sec); return; }
    if (!setLoad) setLoad = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/settings.js'; sc.onload = res; sc.onerror = () => { setLoad = null; rej(); }; document.head.appendChild(sc); });
    setLoad.then(() => window.CasualSettings.open(sec), () => {});
  }
  window.CasualOpenSettings = openSettings;

  const ADMINS = ['YW5vcnJv', 'eXVrb21hZ29k'].map((x) => atob(x));
  function adminBtn(cls) {
    let u = null, t = null, seen = null;
    try {
      u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null');
      t = u && (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || 'null') || {})[u.id];
      seen = localStorage.getItem('casualhub.admin.v1');
    } catch (e) {}
    if (!u || !t || !(ADMINS.includes(String(u.handle || '').toLowerCase()) || seen === u.id)) return null;
    const a = document.createElement('a');
    a.className = cls + ' hm-admin';
    a.href = '/admin/';
    a.title = 'Админ-панель';
    a.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5l5.5 2v4.2c0 3.3-2.3 5.8-5.5 6.8-3.2-1-5.5-3.5-5.5-6.8V3.5z"/><path d="M5.6 8l1.7 1.7 3.2-3.4" stroke-linecap="round"/></svg><span class="hm-t">Админ</span>';
    return a;
  }

  function build() {
    const header = document.querySelector('header');
    if (!header || header.dataset.hm) return;
    const bar = header.querySelector('.masthead-right > .user-bar') || header.querySelector('.user-bar') || header;
    header.dataset.hm = '1';
    // «Профиль» — последняя кнопка до ☰; с какого класса брать вид кнопок
    const account = bar.querySelector(':scope > #account, :scope > [data-account], :scope > #userBar');
    const twin = bar.querySelector('.pill, .theme-btn');
    const cls = twin && /\bpill\b/.test(twin.className) ? 'pill' : 'theme-btn';
    const here = location.pathname.replace(/index\.html$/, '');

    // «Мнение», «Колесо» и «Тир-листы» всегда на виду (кроме страницы, где ты уже находишься), с подписью
    ['/opinion/', '/wheel/', '/tierlist/', '/king/'].forEach((href) => {
      let a = bar.querySelector(`a[href="${href}"]`);
      if (here.startsWith(href)) return;
      if (!a) {
        a = document.createElement('a');
        a.className = cls;
        a.href = href;
        a.innerHTML = ICON[href];
      }
      a.classList.remove('ic');
      a.classList.add('hm-nav');
      if (!a.textContent.trim()) a.insertAdjacentHTML('beforeend', `<span class="hm-t">${NAMES[href]}</span>`);
      a.title = href === '/king/' ? 'Царь Горы: турниры' : NAMES[href] + ' Казуала';
      if (account) bar.insertBefore(a, account); else bar.appendChild(a);
    });

    // «Друзья» — рядом с профилем, слева от него
    const fr = bar.querySelector('[data-friends-btn]');
    if (fr) {
      fr.classList.add('hm-fr');
      if (account) bar.insertBefore(fr, account); else bar.appendChild(fr);
    }

    // слева, сразу после логотипа или кнопки главной — место для кнопки уровня (levels-ui.js)
    const oc = header.querySelector('[data-online-count]');
    const home = header.querySelector('a[href="/"]');
    const left = document.createElement('span');
    left.className = 'hm-left';
    if (home && home.parentElement) home.after(left); else bar.prepend(left);
    // в Мнении и Колесе кнопку главной прижимает влево отступ справа от неё: переносим его на это место
    if (home && home.parentElement === left.parentElement && parseFloat(getComputedStyle(home).marginRight) > 24) {
      home.style.marginRight = '0';
      left.style.marginRight = 'auto';
      left.style.marginLeft = '8px';
    }
    // счётчик «на сайте» — в правом углу страницы (см. placeWn ниже)
    if (oc) oc.classList.add('oc-mini');

    // меню ☰
    const wrap = document.createElement('div');
    wrap.className = 'hm-wrap';
    wrap.innerHTML = `<button type="button" class="${cls} hm-btn" aria-expanded="false" aria-controls="hmPanel" aria-label="Меню" title="Меню">${MENU_ICON}<i class="hm-dot" hidden></i></button><div class="hm-panel" id="hmPanel" role="menu" hidden></div>`;
    bar.appendChild(wrap);
    const btn = wrap.firstElementChild, panel = wrap.lastElementChild, dot = btn.querySelector('.hm-dot');
    // меню живёт в конце страницы: так оно поверх всего (и нижней панели Мнения), а стили шапки не прячут подписи
    document.body.appendChild(panel);
    [...bar.querySelectorAll(MOVE)].filter((el) => !el.closest('.hm-panel') && el.parentElement).forEach((el) => {
      // у кнопок-иконок в меню видна подпись
      if (!el.textContent.trim() && el.title) el.insertAdjacentHTML('beforeend', `<span class="hm-t">${el.title.replace(/\s*:.*$/, '')}</span>`);
      panel.appendChild(el);
    });
    // GitHub есть в меню на всех страницах, даже если в шапке страницы его нет
    if (!panel.querySelector('a[href*="github.com"]')) {
      const gh = document.createElement('a');
      gh.className = cls;
      gh.href = 'https://github.com/anorroDev/casualhub';
      gh.target = '_blank';
      gh.rel = 'noopener';
      gh.title = 'Код сайта на GitHub';
      gh.innerHTML = GH_ICON + '<span class="hm-t">GitHub</span>';
      panel.appendChild(gh);
    }
    // «Настройки»: аккаунт, безопасность, приватность, тема и язык, данные (окно — /settings.js)
    const set = document.createElement('button');
    set.type = 'button';
    set.className = cls + ' hm-set';
    set.title = 'Аккаунт, безопасность, тема, язык и данные';
    set.innerHTML = '<span aria-hidden="true"><span class="u-old">⚙️</span><svg class="u-new" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></span><span class="hm-t">Настройки</span>';
    set.addEventListener('click', openSettings);
    panel.appendChild(set);
    // одинаковый порядок пунктов на всех страницах
    ['#howtoBtn, .howto-btn', '.hm-set', 'a[href*="github.com"]'].forEach((sel) => { const el = panel.querySelector(`:scope > :is(${sel})`); if (el) panel.appendChild(el); });
    // «Все оценки» — самый первый пункт, в цветной рамке
    const all = document.createElement('a');
    all.className = cls + ' hm-all';
    all.href = '/profile/?all=1';
    all.title = 'Все твои оценки: список, плитки и тир-лист';
    all.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.3"/><rect x="9" y="2" width="5" height="5" rx="1.3"/><rect x="2" y="9" width="5" height="5" rx="1.3"/><rect x="9" y="9" width="5" height="5" rx="1.3"/></svg><span class="hm-t">Все оценки</span><span class="hm-go" aria-hidden="true">›</span>';
    panel.prepend(all);
    // разделы строкой с подписями (видно только на телефоне, где их нет в шапке) и «Лоты по ссылке» — на всех экранах
    const secs = document.createElement('nav');
    secs.className = 'hm-secs';
    secs.setAttribute('aria-label', 'Разделы');
    secs.innerHTML = ['/opinion/', '/wheel/', '/tierlist/', '/king/'].map((h) => `<a href="${h}"${here.startsWith(h) ? ' aria-current="page"' : ''}>${ICON[h]}<span>${NAMES[h]}</span></a>`).join('');
    all.after(secs);
    const lots = document.createElement('a');
    lots.className = cls + ' hm-lots';
    lots.href = here.startsWith('/lots/') ? '/wheel/#lots' : '/lots/';
    lots.title = 'Друзья предлагают, колесо выбирает';
    lots.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 8V1.8M8 8l5.4 3.1M8 8l-5.4 3.1"/></svg><span class="hm-t">Лоты по ссылке</span>';
    secs.after(lots);

    const adm = adminBtn(cls);
    // «Что нового»: в самом углу страницы, на узком экране — в меню
    const wn = bar.querySelector('[data-whatsnew]');
    const corner = document.createElement('div');
    corner.className = 'wn-corner';
    document.body.appendChild(corner);
    // в угол — только если справа от шапки хватает места, чтобы кнопка ничего не закрывала
    const placeWn = () => {
      if (wn && !wn.textContent.trim()) wn.insertAdjacentHTML('beforeend', '<span class="hm-t">Что нового</span>');
      const room = document.documentElement.clientWidth - header.getBoundingClientRect().right;
      const ocW = oc ? (oc.parentElement === corner && oc.offsetWidth) || 70 : 0;
      const wnW = wn ? (wn.parentElement === corner && wn.offsetWidth) || 140 : 0;
      // онлайн важнее: он в углу, если влезает хотя бы он; «Что нового» — если влезают оба
      const ocFits = !!oc && room >= ocW + 40, wnFits = !!wn && room >= ocW + wnW + 48;
      if (oc) {
        if (ocFits) { oc.classList.add('oc-mini'); if (oc.parentElement !== corner) corner.prepend(oc); }
        else { oc.classList.remove('oc-mini'); if (oc.parentElement !== panel) panel.appendChild(oc); }
      }
      if (wn) { if (wnFits) { if (wn.parentElement !== corner) corner.appendChild(wn); } else if (wn.parentElement !== panel) panel.appendChild(wn); }
      if (adm) panel.appendChild(adm);
    };
    placeWn();
    // /…#settings открывает настройки, #settings-security — сразу нужный раздел
    const sh = location.hash.match(/^#settings(?:-([a-z]+))?$/);
    if (sh) { history.replaceState(null, '', location.pathname + location.search); openSettings(sh[1]); }
    let rq = 0;
    addEventListener('resize', () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(placeWn); });

    const open = (on) => {
      if (on) {
        const r = btn.getBoundingClientRect();
        panel.style.top = Math.round(r.bottom + 8) + 'px';
        panel.style.right = Math.max(8, Math.round(document.documentElement.clientWidth - r.right)) + 'px';
        [...panel.children].forEach((c, i) => c.style.setProperty('--i', i));
      }
      panel.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
    };
    addEventListener('scroll', () => { if (!panel.hidden && !panel.contains(document.activeElement)) open(false); }, { passive: true });
    addEventListener('resize', () => { if (!panel.hidden) open(true); });
    btn.addEventListener('click', (e) => { e.stopPropagation(); open(panel.hidden); });
    document.addEventListener('click', (e) => {
      if (panel.hidden || wrap.contains(e.target) || panel.contains(e.target)) return;
      if (e.target.closest('.fp-sheet, .st-pick, #friendSheet, .sheet')) return;
      open(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); } });
    // нажали пункт меню — меню закрывается
    panel.addEventListener('click', (e) => { if (e.target.closest('a, button')) setTimeout(() => open(false), 0); });

    // уровни: строка в меню, кружок у аватара, плашки наград и окно «Прогресс» — /levels-ui.js, только у вошедших
    // (сам решает, показывать ли: сервер отвечает on: false, пока уровни выключены)
    try {
      const lu = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null');
      const lt = lu && (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || 'null') || {})[lu.id];
      if (lt && !window.CasualLevels && !document.querySelector('script[src="/levels-ui.js"]')) { const sc = document.createElement('script'); sc.src = '/levels-ui.js'; document.head.appendChild(sc); }
      // шапка собрана: показать её разом. Значок уровня из прошлого ответа рисует levels-ui — тогда ждём его (не дольше 0,7 с из head-скрипта)
      const head = lt && JSON.parse(localStorage.getItem('casualhub.lv.head.v1') || 'null');
      if (!(head && head.id === lu.id)) document.documentElement.classList.remove('hdr-wait');
    } catch (e) { document.documentElement.classList.remove('hdr-wait'); }

    // точка на ☰: непрочитанное «Что нового» внутри меню (заявки в друзья видны на самой кнопке «Друзья»)
    const sync = () => { dot.hidden = !panel.querySelector('.wn-dot'); };
    new MutationObserver(sync).observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    sync();
  }
  // «Помощь» дорисовывается на DOMContentLoaded (howto.js) — собираем меню после неё
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(build, 0));
  else setTimeout(build, 0);
})();
