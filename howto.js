/* Казуал Хаб: подсказки для новичков на всех страницах — отдельным окном поверх размытой страницы.
   При первом заходе на страницу окно «Впервые тут? Всё просто» открывается само один раз и только у гостя без аккаунта.
   Закрыли его любым способом («Понятно 👍», ✕, Esc, клик мимо) — на этой странице оно само больше не появляется.
   Открыть его можно всегда: «❓ Помощь» в шапке (в меню ☰), круглая «❓» в углу, когда шапка уехала, или клавиша «?». */
(() => {
  const KEY = 'casualhub.howto.v1';
  const path = location.pathname;
  // подсказка только на пяти страницах сайта: на админке, странице отзыва и прочих её нет
  const PAGE = path.startsWith('/opinion') ? 'opinion' : path.startsWith('/wheel') ? 'wheel' : path.startsWith('/tierlist') ? 'tierlist' : path.startsWith('/profile') ? 'profile' : (path === '/' || path === '/index.html') ? 'hub' : '';
  const STEPS = {
    hub: {
      title: 'Казуал Хаб',
      steps: [
        '<b>Мнение</b> — оценивай игры, фильмы, еду, что угодно по шкале от 1 до 10, рейтинг соберётся сам',
        '<b>Колесо</b> — впиши варианты или участников и крути: кто вылетит, кто победит',
        '<b>Тир-листы</b> — собери свой тир-лист из картинок, текста, оценок или стикеров и скачай картинкой',
        'Вверху кнопка аккаунта: <b>войди</b>, чтобы оценки были на всех твоих устройствах и их видели друзья. Рядом — «Друзья», а в меню <b>☰</b> — тема и эта подсказка',
      ],
    },
    opinion: {
      title: 'Мнение Казуала',
      steps: [
        'Выбери <b>категорию</b> и напиши, что оцениваешь: игру, фильм, кафе — что угодно',
        'Нажимай на <b>клетки от 1 до 10</b> у пунктов ниже. Чем больше клеток, тем лучше',
        'Жми <b>«Сохранить»</b> внизу — оценка появится в рейтинге. Друзья смогут поставить реакцию и написать комментарий',
      ],
    },
    wheel: {
      title: 'Колесо Казуала',
      steps: [
        'Впиши участника в поле <b>«Имя или название»</b> и жми <b>«Добавить»</b>, или вставь сразу всех через <b>«Вставить списком»</b>. На телефоне это вкладка <b>«👥 Участники»</b>',
        'Жми <b>«Крутить»</b> в центре колеса. Музыку можно ставить на паузу и перематывать прямо во время прокрутки',
        '<b>На выбывание</b>: на кого показала стрелка — вылетает, последний побеждает. <b>«Один победитель»</b> — выигрывает сразу тот, на ком остановилось',
      ],
    },
    tierlist: {
      title: 'Тир-листы Казуала',
      steps: [
        'Начни <b>с нуля</b>, из своих оценок или из стикеров. Картинки можно загрузить, бросить на страницу или вставить через Ctrl+V',
        'Перетаскивай карточки по рядам. На телефоне нажми на карточку, а потом на ряд',
        'Нажми на <b>название ряда</b>, чтобы поменять его и цвет. Готовый тир-лист можно <b>скачать картинкой</b>, а всё сохраняется само',
        'После входа тир-листы видны друзьям: их можно смотреть во вкладке <b>«Друзья»</b>, ставить реакции и писать комментарии',
      ],
    },
    profile: {
      title: 'Профиль',
      steps: [
        'Тут вся твоя статистика: сколько оценок, средний балл, лучшие и ачивки за достижения',
        'Кнопка с квадратиками рядом с «Оценить что-нибудь» включает <b>редактирование профиля</b>: блоки можно таскать за ✥ куда угодно, тянуть за край и скрывать глазом, а звания под ником — выбирать через «＋ Звание» и переставлять. Правки применяются кнопкой «Сохранить»',
        'Нажми на <b>ник</b>, чтобы его поменять, на <b>аватарку</b> или <b>баннер</b> — чтобы поставить картинку (прошлые сохраняются в истории), а <b>«＋ стикер»</b> — чтобы добавить стикер из колеса',
        'В самом низу — <b>комментарии</b>: друзья могут писать тебе на стену, а ты им',
      ],
    },
  };
  const conf = STEPS[PAGE];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = document.createElement('style');
  css.textContent = `
.howto-modal { position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; padding: 16px; padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
  background: color-mix(in srgb, var(--bg) 45%, transparent); -webkit-backdrop-filter: blur(10px) saturate(1.1); backdrop-filter: blur(10px) saturate(1.1); overscroll-behavior: contain; }
.howto-modal[hidden] { display: none; }
.howto { position: relative; width: min(100%, 480px); max-height: calc(100dvh - 32px); overflow-y: auto; display: grid; gap: 14px; padding: 20px 18px 16px; border-radius: 22px;
  background: linear-gradient(160deg, var(--panel), color-mix(in srgb, var(--accent-soft) 70%, var(--panel))); border: 2px solid var(--accent);
  box-shadow: 0 30px 70px -24px rgba(0, 0, 0, .55), 0 14px 34px -18px color-mix(in srgb, var(--accent) 70%, transparent); text-align: left; }
.howto-modal.in .howto { animation: howto-in .55s cubic-bezier(.34, 1.56, .64, 1) both; }
.howto-modal.out .howto { animation: howto-out .28s cubic-bezier(.5, 0, .75, 0) both; }
@keyframes howto-in { from { transform: translateY(40px) scale(.9); } }
@keyframes howto-out { to { transform: translateY(60px) scale(.92); } }
.howto-head { display: flex; align-items: center; gap: 10px; padding-right: 34px; font-size: 18px; font-weight: 800; line-height: 1.2; color: var(--ink); }
.howto-head small { display: block; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
.howto-wave { flex: none; display: inline-block; font-size: 30px; transform-origin: 70% 80%; animation: howto-wave 1.6s ease-in-out .5s 3; }
@keyframes howto-wave { 0%, 60%, 100% { transform: rotate(0); } 10%, 30% { transform: rotate(16deg); } 20%, 40% { transform: rotate(-10deg); } }
.howto ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.howto li { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; align-items: center; font-size: 15px; line-height: 1.42; color: var(--ink); }
.howto-modal.in .howto li { animation: howto-step .5s cubic-bezier(.34, 1.56, .64, 1) backwards; }
.howto-modal.in .howto li:nth-child(1) { animation-delay: .12s; }
.howto-modal.in .howto li:nth-child(2) { animation-delay: .22s; }
.howto-modal.in .howto li:nth-child(3) { animation-delay: .32s; }
@keyframes howto-step { from { transform: translateX(-18px); } }
.howto li > b { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: var(--on-accent, #fff); font-size: 15px; font-weight: 800; box-shadow: 0 4px 10px -4px var(--accent); }
.howto li span b { font-weight: 800; }
.howto-acts { display: flex; justify-content: flex-end; gap: 8px; }
.howto-ok { height: 44px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; transition: transform .2s cubic-bezier(.34, 1.56, .64, 1); }
.howto-ok:hover { transform: translateY(-2px) scale(1.03); }
.howto-ok:active { transform: scale(.95); }
.howto-close { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--panel-2); color: var(--ink-2); font: inherit; font-size: 15px; cursor: pointer; }
.howto-close:hover { color: var(--ink); }
.howto-btn { gap: 5px; }
@media (max-width: 560px) { .hb-t { display: none; } .howto-ok { flex: 1; } }
.howto-fab { position: fixed; right: max(14px, env(safe-area-inset-right, 0px)); bottom: calc(env(safe-area-inset-bottom, 0px) + 16px + var(--fab-lift, 0px)); z-index: 60; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--accent); background: var(--panel); color: var(--ink); font: inherit; font-size: 21px; line-height: 1; cursor: pointer; box-shadow: 0 10px 26px -12px color-mix(in srgb, var(--accent) 80%, transparent); transform: translateY(calc(100% + 40px + var(--fab-lift, 0px))) scale(.6); transition: transform .45s cubic-bezier(.34, 1.56, .64, 1), bottom .25s; }
.howto-fab.on { transform: none; }
.howto-fab.on:hover { transform: translateY(-3px) scale(1.06); }
.howto-fab.on:active { transform: scale(.92); }
body.howto-lock { overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .howto-modal.in .howto, .howto-modal.out .howto, .howto-modal.in .howto li, .howto-wave { animation: none; } .howto-fab { transition: none; } }`;
  document.head.appendChild(css);

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const mark = (v) => { try { const m = read(); m[PAGE] = v; localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} };

  function makeHeaderBtn() {
    const pick = document.getElementById('themePick');
    if (!pick) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'howtoBtn';
    // кнопка в том же стиле, что и соседние в шапке; меню ☰ (header-menu.js) забирает её к себе
    const twin = pick.querySelector('summary');
    b.className = (twin && /\bpill\b/.test(twin.className) ? 'pill' : 'theme-btn') + ' howto-btn';
    b.title = 'Как пользоваться';
    b.innerHTML = '<span aria-hidden="true">❓</span><span class="hb-t">Помощь</span>';
    pick.parentNode.insertBefore(b, pick);
    return b;
  }

  function init() {
    if (!conf) return;
    // старая встроенная карточка (если страница ещё со старой разметкой) не нужна
    const old = document.getElementById('howto');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.className = 'howto-modal';
    modal.hidden = true;
    modal.innerHTML = `<div class="howto" id="howto" role="dialog" aria-modal="true" aria-labelledby="howtoTitle">
      <button type="button" class="howto-close" aria-label="Закрыть">✕</button>
      <div class="howto-head"><span class="howto-wave" aria-hidden="true">👋</span><span id="howtoTitle"><small>${conf.title}</small>Впервые тут? Всё просто:</span></div>
      <ol>${conf.steps.map((s, i) => `<li><b>${i + 1}</b><span>${s}</span></li>`).join('')}</ol>
      <div class="howto-acts"><button type="button" class="howto-ok">Понятно 👍</button></div>
    </div>`;
    document.body.appendChild(modal);
    const btn = document.getElementById('howtoBtn') || makeHeaderBtn();
    if (btn) { btn.setAttribute('aria-haspopup', 'dialog'); btn.removeAttribute('aria-controls'); btn.removeAttribute('aria-expanded'); }
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'howto-fab';
    fab.title = 'Как пользоваться';
    fab.setAttribute('aria-label', 'Как пользоваться: открыть подсказку');
    fab.textContent = '❓';
    fab.tabIndex = -1;
    document.body.appendChild(fab);

    let back = null, closing = 0;
    function open() {
      clearTimeout(closing);
      back = document.activeElement;
      modal.classList.remove('out');
      modal.hidden = false;
      modal.classList.remove('in'); void modal.offsetWidth; modal.classList.add('in');
      document.body.classList.add('howto-lock');
      modal.querySelector('.howto-ok').focus({ preventScroll: true });
      later();
    }
    function close(forever) {
      if (modal.hidden) return;
      if (forever) mark(true);
      modal.classList.remove('in');
      modal.classList.add('out');
      const done = () => { modal.hidden = true; modal.classList.remove('out'); document.body.classList.remove('howto-lock'); later(); };
      if (calm) done(); else closing = setTimeout(done, 260);
      if (back && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
    }
    modal.querySelector('.howto-ok').addEventListener('click', () => close(true));
    // любое закрытие — «понял»: иначе окно всплывало на каждом заходе, пока не нажмёшь именно «Понятно»
    modal.querySelector('.howto-close').addEventListener('click', () => close(true));
    modal.addEventListener('click', (e) => { if (e.target === modal) close(true); });
    document.addEventListener('keydown', (e) => {
      if (!modal.hidden && e.key === 'Escape') { e.preventDefault(); close(true); return; }
      // Tab не уходит из окна, пока оно открыто
      if (!modal.hidden && e.key === 'Tab') {
        const f = [...modal.querySelectorAll('button')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        return;
      }
      if (e.key !== '?' || !modal.hidden || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault();
      open();
    });
    if (btn) btn.addEventListener('click', () => open());
    fab.addEventListener('click', () => open());
    // первый заход (и каждый следующий, пока не нажали «Понятно»): окно открывается само, когда страница показалась
    // не поверх другого открытого окна (вход, карточка оценки): считаем только те, что реально видно
    const otherOpen = () => [...document.querySelectorAll('[role="dialog"], dialog[open]')].some((d) => d.id !== 'howto' && d.getClientRects().length && getComputedStyle(d).visibility !== 'hidden');
    // само окно — только новичкам: гостю без аккаунта и только пока на этой странице его ещё не закрывали
    const hasAccount = (() => { try { const u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null'); return !!(u && u.name); } catch (e) { return false; } })();
    if (!read()[PAGE] && !read()[{ opinion: 'mnenie', wheel: 'koleso', tierlist: 'tier' }[PAGE]] && !hasAccount) setTimeout(() => { if (modal.hidden && !otherOpen()) open(); }, calm ? 200 : 900);

    // круглая «❓» видна, когда шапка (кнопка «Помощь» или меню ☰) уехала за экран; держится над нижними панелями
    let q = false;
    function place() {
      q = false;
      const vh = innerHeight;
      const head = document.querySelector('header, .top, .masthead');
      const off = (el) => { if (!el) return true; const r = el.getBoundingClientRect(); return !r.height || r.bottom < 0 || r.top > vh; };
      const want = modal.hidden && off(head);
      let lift = 0;
      if (want) {
        for (const el of document.querySelectorAll('.scorebar, [data-fab-avoid]')) {
          const r = el.getBoundingClientRect();
          if (r.height && r.bottom >= vh - 2 && r.top < vh && r.right > innerWidth - 80) lift = Math.max(lift, vh - r.top);
        }
      }
      fab.style.setProperty('--fab-lift', lift + 'px');
      fab.classList.toggle('on', want);
      fab.tabIndex = want ? 0 : -1;
    }
    function later() { if (!q) { q = true; requestAnimationFrame(place); } }
    addEventListener('scroll', later, { passive: true });
    addEventListener('resize', later);
    addEventListener('click', () => setTimeout(later, 80));
    place();
    window.CasualHowto = { open, close: () => close(false) };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
