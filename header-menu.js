/* Казуал Хаб: шапка без россыпи кнопок.
   На виду остаются главная, «Мнение», «Колесо», «Тир-листы», «Друзья», профиль и кнопка ☰. В меню ☰ уезжают «Помощь»,
   «Тема», «⚙️ Настройки» (окно с импортом из Letterboxd и обновлением обложек) и GitHub. «Что нового» на широком экране стоит в самом углу страницы, на узком — тоже в меню.
   Кнопки переносятся целиком, поэтому их обработчики и счётчики (online.js, whatsnew.js) продолжают работать. */
(() => {
  const MOVE = '#howtoBtn, .howto-btn, .theme-pick, a[href*="github.com"]';
  const css = document.createElement('style');
  css.textContent = `
.hm-wrap { position: relative; display: inline-flex; flex: none; }
.hm-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 40px; cursor: pointer; }
.hm-btn svg { flex: none; }
.hm-dot { position: absolute; top: 4px; right: 4px; width: 9px; height: 9px; border-radius: 50%; background: var(--bad, #E4553F); box-shadow: 0 0 0 2px var(--panel, #1b1d24); pointer-events: none; }
.hm-dot[hidden] { display: none; }
.hm-panel { position: fixed; right: 12px; top: 64px; z-index: 95; max-height: calc(100dvh - 80px); overflow: auto; width: min(300px, calc(100vw - 24px)); display: grid; gap: 6px; padding: 10px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); border: 1px solid var(--line, #2b2e38); border-radius: 16px; box-shadow: 0 24px 50px -20px rgba(0, 0, 0, .55); animation: hm-in .22s cubic-bezier(.34, 1.56, .64, 1); transform-origin: 100% 0; }
@keyframes hm-in { from { transform: translateY(-6px) scale(.97); } }
@media (prefers-reduced-motion: reduce) { .hm-panel { animation: none; } }
.hm-panel[hidden] { display: none; }
.hm-panel > * { display: flex !important; width: 100%; margin: 0 !important; justify-content: flex-start !important; text-align: left; }
.hm-panel > [hidden] { display: none !important; }
.hm-panel .theme-pick { display: block !important; }
.hm-panel .theme-pick > summary { width: 100%; justify-content: flex-start; }
.hm-panel .theme-menu { position: static !important; translate: none !important; transform: none !important; inset: auto !important; width: 100% !important; max-width: none !important; margin-top: 8px; box-shadow: none !important; }
.hm-panel .oc-t, .hm-panel .fb-t, .hm-panel .hb-t, .hm-panel .t, .hm-panel .wn-text, .hm-panel summary > span, .hm-panel .hm-t { display: inline !important; }
/* в меню все пункты — строки одной ширины с подписью, даже если на телефоне в шапке они были круглыми значками */
.hm-panel > a, .hm-panel > button, .hm-panel > span, .hm-panel .theme-pick > summary { width: 100% !important; min-width: 0 !important; height: auto !important; min-height: 40px; padding: 8px 12px !important; gap: 8px !important; border-radius: 11px !important; font-size: 13.5px !important; line-height: 1.2 !important; align-items: center; }
.hm-t { margin-left: 2px; }
.hm-panel > .hm-all { border: 1.5px solid transparent !important; background: linear-gradient(var(--panel, #1b1d24), var(--panel, #1b1d24)) padding-box, linear-gradient(120deg, var(--accent, #3550E8), #E85FA5 55%, #F5B942) border-box !important; color: var(--ink, #f3f4f6) !important; font-weight: 700 !important; min-height: 46px; margin-bottom: 4px !important; text-decoration: none; transition: box-shadow .2s, transform .2s; }
.hm-panel > .hm-all:hover, .hm-panel > .hm-all:focus-visible { transform: translateY(-1px); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3550E8) 20%, transparent), 0 10px 24px -14px #E85FA5; }
.hm-all svg { color: var(--accent, #3550E8); flex: none; }
.hm-all .hm-go { margin-left: auto; font-size: 18px; line-height: 1; opacity: .55; }
/* на узком экране «Мнение» и «Колесо» — только значки, чтобы шапка помещалась в одну строку */
@media (max-width: 480px) { .hm-nav .hm-t, .hm-nav .t, .hm-fr .fb-t { display: none !important; } .hm-nav, .hm-fr { padding: 0 11px !important; } }
/* телефон: «← Хаб» только стрелкой, а на самых узких ещё и без счётчика, чтобы разделы, «Друзья», профиль и ☰ поместились в одну строку */
@media (max-width: 400px) { .oc-mini { display: none !important; } #homeLink, #backLink, header .pill[href="/"] { margin-right: auto !important; } }
@media (max-width: 480px) { #homeLink, #backLink, header .pill[href="/"] { width: 36px; min-width: 36px; padding: 0 !important; font-size: 0 !important; justify-content: center; } }
/* у гостя на главной «Регистрация» на телефоне не помещается — она есть в окне «Войти» */
@media (max-width: 480px) { #account a[href="/opinion/#reg"] { display: none !important; } }
/* сколько людей на сайте: слева в шапке, только кружок и число (подпись — во всплывающей подсказке) */
.oc-mini { flex: none; min-width: 0 !important; padding: 0 11px !important; gap: 7px !important; }
.oc-mini .oc-t { display: none !important; }
header.top > .oc-mini { margin-right: auto; margin-left: 4px; }
@media (max-width: 480px) { .oc-mini { padding: 0 9px !important; margin-left: 0 !important; } .top .sp { display: none; } .top .oc-mini { margin-right: auto; } }
.wn-corner { position: absolute; top: 14px; right: 16px; z-index: 60; display: flex; align-items: center; gap: 8px; }
.wn-corner .hm-admin { box-shadow: 0 10px 24px -14px rgba(0, 0, 0, .6); }
.hm-admin { border-color: color-mix(in srgb, #E4553F 55%, var(--line, #2b2e38)) !important; color: var(--ink, #f3f4f6) !important; }
.hm-admin svg { color: #E4553F; flex: none; }
.wn-corner [data-whatsnew] { box-shadow: 0 10px 24px -14px rgba(0, 0, 0, .6); }
/* окно «Настройки» */
.hs-sheet { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; padding: 16px; background: rgba(8, 10, 14, .6); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.hs-sheet[hidden] { display: none; }
.hs-card { width: min(480px, 100%); max-height: calc(100dvh - 32px); display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 12px; padding: 18px; border: 1px solid var(--line, #2b2e38); border-radius: 20px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); box-shadow: 0 30px 70px -28px rgba(0, 0, 0, .7); animation: hm-in .24s cubic-bezier(.34, 1.56, .64, 1); }
.hs-head { display: flex; align-items: center; gap: 10px; }
.hs-head h2 { flex: 1; margin: 0; font-size: 19px; }
.hs-x { flex: none; width: 36px; height: 36px; border: 1px solid var(--line, #2b2e38); border-radius: 50%; background: transparent; color: inherit; font-size: 15px; cursor: pointer; }
.hs-body { overflow: auto; display: grid; gap: 16px; align-content: start; }
.hs-sec { display: grid; gap: 6px; }
.hs-lab { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3, #8b8f9c); }
.hs-it { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line, #2b2e38); border-radius: 14px; background: var(--panel-2, #23262f); color: var(--ink, #f3f4f6); text-decoration: none; transition: border-color .15s, transform .15s; }
.hs-it:hover { border-color: var(--accent, #3550E8); transform: translateY(-1px); }
.hs-ic { flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 20px; background: color-mix(in srgb, var(--accent, #3550E8) 16%, transparent); }
.hs-t { flex: 1; min-width: 0; display: grid; gap: 2px; }
.hs-t b { font-size: 14.5px; }
.hs-t small { font-size: 12.5px; color: var(--ink-2, #b9bdc8); line-height: 1.3; }
.hs-go { flex: none; font-size: 22px; color: var(--ink-3, #8b8f9c); }
.hs-note { margin: 0; font-size: 12.5px; color: var(--ink-3, #8b8f9c); }
@media (prefers-reduced-motion: reduce) { .hs-card { animation: none; } }
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
  const MENU_ICON ='<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>';
  const ICON = {
    '/opinion/': '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1.5" y="9" width="3.4" height="5.5" rx="1" fill="#E4553F"/><rect x="6.3" y="6" width="3.4" height="8.5" rx="1" fill="#EAA92C"/><rect x="11.1" y="2" width="3.4" height="12.5" rx="1" fill="#2EAD60"/></svg>',
    '/wheel/': '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#3550E8"/><path d="M8 8V1.5A6.5 6.5 0 0 1 14.5 8z" fill="#EAA92C"/><path d="M8 8h6.5A6.5 6.5 0 0 1 8 14.5z" fill="#2EAD60"/><circle cx="8" cy="8" r="1.8" fill="#fff"/></svg>',
    '/tier/': '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1" y="1.5" width="4" height="3.6" rx="1" fill="#2EAD60"/><rect x="6" y="1.5" width="9" height="3.6" rx="1" fill="currentColor" opacity=".55"/><rect x="1" y="6.2" width="4" height="3.6" rx="1" fill="#EAA92C"/><rect x="6" y="6.2" width="6" height="3.6" rx="1" fill="currentColor" opacity=".55"/><rect x="1" y="10.9" width="4" height="3.6" rx="1" fill="#E4553F"/><rect x="6" y="10.9" width="3" height="3.6" rx="1" fill="currentColor" opacity=".55"/></svg>',
  };
  const NAMES = { '/opinion/': 'Мнение', '/wheel/': 'Колесо', '/tier/': 'Тир-листы' };
  // окно «Настройки»: разделы и пункты. Новая настройка — ещё один пункт здесь.
  // href — куда вести со страниц, где пункт сам не работает; attr — атрибут, по которому его ловит Мнение
  const SETTINGS = [
    { title: 'Импорт', items: [
      { icon: '🎬', name: 'Импорт из Letterboxd', desc: 'Перенести оценки фильмов из архива Letterboxd', href: '/opinion/#letterboxd', attr: 'data-lb-open' },
    ] },
    { title: 'Обложки и названия', items: [
      { icon: '🔄', name: 'Обновить обложки и названия', desc: 'Подтянуть к сохранённым оценкам обложки, русские названия, год и жанры', href: '/opinion/#refresh', attr: 'data-refresh-open' },
    ] },
  ];
  const escH = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let setBox = null;
  function openSettings() {
    if (!setBox) {
      setBox = document.createElement('div');
      setBox.className = 'hs-sheet';
      setBox.hidden = true;
      setBox.innerHTML = `<div class="hs-card" role="dialog" aria-modal="true" aria-labelledby="hsTitle">
        <div class="hs-head"><h2 id="hsTitle">⚙️ Настройки</h2><button type="button" class="hs-x" data-hs="close" aria-label="Закрыть">✕</button></div>
        <div class="hs-body">${SETTINGS.map((sec) => `<section class="hs-sec"><span class="hs-lab">${escH(sec.title)}</span>
          ${sec.items.map((it) => `<a class="hs-it" href="${escH(it.href)}" ${it.attr}><span class="hs-ic" aria-hidden="true">${it.icon}</span><span class="hs-t"><b>${escH(it.name)}</b><small>${escH(it.desc)}</small></span><span class="hs-go" aria-hidden="true">›</span></a>`).join('')}</section>`).join('')}
          <p class="hs-note">Скоро здесь появятся и другие настройки.</p></div></div>`;
      document.body.appendChild(setBox);
      setBox.addEventListener('click', (e) => {
        // пункт: окно закрывается, а сам пункт открывает своё окно (в Мнении) или ведёт туда
        if (e.target === setBox || e.target.closest('[data-hs="close"], .hs-it')) closeSettings();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && setBox && !setBox.hidden) closeSettings(); });
    }
    setBox.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    setBox.querySelector('.hs-x').focus({ preventScroll: true });
  }
  function closeSettings() {
    if (!setBox || setBox.hidden) return;
    setBox.hidden = true;
    document.documentElement.style.overflow = '';
  }

  // админы сайта: им видна кнопка «Админ». Это только кнопка, доступ к админке проверяет сервер
  const ADMINS = ['anorro', 'yukomagod'];
  function adminBtn(cls) {
    let u = null, t = null, seen = null;
    try {
      u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null');
      t = u && (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || 'null') || {})[u.id];
      seen = localStorage.getItem('casualhub.admin.v1'); // админка уже открывалась с этого аккаунта
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
    ['/opinion/', '/wheel/', '/tier/'].forEach((href) => {
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
      a.title = NAMES[href] + ' Казуала';
      if (account) bar.insertBefore(a, account); else bar.appendChild(a);
    });

    // «Друзья» — рядом с профилем, слева от него
    const fr = bar.querySelector('[data-friends-btn]');
    if (fr) {
      fr.classList.add('hm-fr');
      if (account) bar.insertBefore(fr, account); else bar.appendChild(fr);
    }

    // счётчик «на сайте» — слева: сразу после логотипа или кнопки главной
    const oc = header.querySelector('[data-online-count]');
    const home = header.querySelector('a[href="/"]');
    if (oc) {
      oc.classList.add('oc-mini');
      if (home && home.parentElement) home.after(oc); else bar.prepend(oc);
      // в Мнении и Колесе кнопку главной прижимает влево отступ справа от неё: переносим его на счётчик
      if (home && home.parentElement === oc.parentElement && parseFloat(getComputedStyle(home).marginRight) > 24) {
        home.style.marginRight = '0';
        oc.style.marginRight = 'auto';
        oc.style.marginLeft = '8px';
      }
    }

    // меню ☰
    const wrap = document.createElement('div');
    wrap.className = 'hm-wrap';
    wrap.innerHTML = `<button type="button" class="${cls} hm-btn" aria-expanded="false" aria-controls="hmPanel" aria-label="Меню" title="Меню">${MENU_ICON}<i class="hm-dot" hidden></i></button><div class="hm-panel" id="hmPanel" role="menu" hidden></div>`;
    bar.appendChild(wrap);
    const btn = wrap.firstElementChild, panel = wrap.lastElementChild, dot = btn.querySelector('.hm-dot');
    // меню живёт в конце страницы: так оно поверх всего (и нижней панели Мнения), а стили шапки не прячут подписи
    document.body.appendChild(panel);
    [...bar.querySelectorAll(MOVE)].filter((el) => !el.closest('.hm-panel') && el.parentElement && !el.closest('.theme-menu')).forEach((el) => {
      // у кнопок-иконок в меню видна подпись
      if (!el.matches('.theme-pick') && !el.textContent.trim() && el.title) el.insertAdjacentHTML('beforeend', `<span class="hm-t">${el.title.replace(/\s*:.*$/, '')}</span>`);
      panel.appendChild(el);
    });
    // «Настройки»: окно с импортом из Letterboxd и обновлением обложек (пункты — в SETTINGS выше)
    const set = document.createElement('button');
    set.type = 'button';
    set.className = cls + ' hm-set';
    set.title = 'Импорт оценок, обложки и названия';
    set.innerHTML = '<span aria-hidden="true">⚙️</span><span class="hm-t">Настройки</span>';
    set.addEventListener('click', openSettings);
    panel.appendChild(set);
    // язык сайта (i18n.js): кнопка называет тот язык, на который переключит
    if (window.CasualLang) {
      const en = window.CasualLang.lang === 'en';
      const lang = document.createElement('button');
      lang.type = 'button';
      lang.className = cls + ' hm-lang';
      lang.title = en ? 'Switch to Russian' : 'Switch to English';
      lang.innerHTML = `<span aria-hidden="true">🌐</span><span class="hm-t">${en ? 'Русский' : 'English'}</span>`;
      lang.addEventListener('click', () => window.CasualLang.set(en ? 'ru' : 'en'));
      panel.appendChild(lang);
    }
    // одинаковый порядок пунктов на всех страницах
    ['#howtoBtn, .howto-btn', '.theme-pick', '.hm-lang', '.hm-set', 'a[href*="github.com"]'].forEach((sel) => { const el = panel.querySelector(`:scope > :is(${sel})`); if (el) panel.appendChild(el); });
    // «Все оценки» — самый первый пункт, в цветной рамке
    const all = document.createElement('a');
    all.className = cls + ' hm-all';
    all.href = '/profile/?all=1';
    all.title = 'Все твои оценки: список, плитки и тир-лист';
    all.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.3"/><rect x="9" y="2" width="5" height="5" rx="1.3"/><rect x="2" y="9" width="5" height="5" rx="1.3"/><rect x="9" y="9" width="5" height="5" rx="1.3"/></svg><span class="hm-t">Все оценки</span><span class="hm-go" aria-hidden="true">›</span>';
    panel.prepend(all);

    // «Админ» — справа от «Что нового», только у админов (кто админ на самом деле, проверяет сервер)
    const adm = adminBtn(cls);
    // «Что нового»: в самом углу страницы, на узком экране — в меню
    const wn = bar.querySelector('[data-whatsnew]');
    const corner = document.createElement('div');
    corner.className = 'wn-corner';
    document.body.appendChild(corner);
    // в угол — только если справа от шапки хватает места, чтобы кнопка ничего не закрывала
    const placeWn = () => {
      if (!wn) { if (adm && !adm.parentElement) panel.appendChild(adm); return; }
      if (!wn.textContent.trim()) wn.insertAdjacentHTML('beforeend', '<span class="hm-t">Что нового</span>');
      const room = document.documentElement.clientWidth - header.getBoundingClientRect().right;
      const wnW = (wn.parentElement === corner && wn.offsetWidth) || 140, admW = adm ? (adm.parentElement === corner && adm.offsetWidth) || 96 : 0;
      const wnCorner = room >= wnW + 40;
      if (wnCorner) { if (wn.parentElement !== corner) corner.appendChild(wn); }
      else if (wn.parentElement !== panel) panel.appendChild(wn);
      // «Админ» — справа от «Что нового»: в углу рядом с ней, если влезает обе, иначе в меню
      if (!adm) return;
      if (wnCorner && room < wnW + admW + 48) { if (adm.parentElement !== panel) panel.appendChild(adm); }
      else if (adm.previousElementSibling !== wn) wn.after(adm);
    };
    placeWn();
    if (location.hash === '#settings') { history.replaceState(null, '', location.pathname + location.search); openSettings(); }
    window.CasualSettings = { open: openSettings, close: closeSettings };
    let rq = 0;
    addEventListener('resize', () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(placeWn); });

    const open = (on) => {
      if (on) {
        const r = btn.getBoundingClientRect();
        panel.style.top = Math.round(r.bottom + 8) + 'px';
        panel.style.right = Math.max(8, Math.round(document.documentElement.clientWidth - r.right)) + 'px';
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
    // нажали пункт меню (кроме выбора темы) — меню закрывается
    panel.addEventListener('click', (e) => {
      if (e.target.closest('.theme-pick > summary')) return;
      if (e.target.closest('.theme-menu') && !e.target.closest('[data-theme-id]')) return;
      if (e.target.closest('a, button')) setTimeout(() => open(false), 0);
    });

    // точка на ☰: непрочитанное «Что нового» внутри меню (заявки в друзья видны на самой кнопке «Друзья»)
    const sync = () => { dot.hidden = !panel.querySelector('.wn-dot'); };
    new MutationObserver(sync).observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    sync();
  }
  // «Помощь» дорисовывается на DOMContentLoaded (howto.js) — собираем меню после неё
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(build, 0));
  else setTimeout(build, 0);
})();
