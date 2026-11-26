// Казуал Хаб: мини-игра «Выше или ниже» (/games/hilo/, сервер — functions/_lib/game-hilo.js).
// Две карточки: у первой балл открыт, у второй — «Выше» или «Ниже» (кнопки или стрелки ↑ ↓ на клавиатуре). Верно — балл
// второй на миг виден, она становится первой и приходит новая; неверно, вышло время или ушёл со страницы — итог игры.
// Против подглядывания (так просил владелец сайта): пока идёт игра, уход со страницы — другая вкладка, другое окно,
// свёрнутый браузер, другое приложение на телефоне — сразу проигрыш. Ловят его visibilitychange, blur окна (фокус внутри
// страницы, в том числе во встроенном плеере, не в счёт), pagehide (sendBeacon: у него нет входа, хватает кода игры)
// и проверка document.hasFocus() раз в 0,4 с: окно рядом с другим, без фокуса, тоже не годится. Обложки и названия не
// выделяются, не перетаскиваются, меню и долгое нажатие на них не работают. Срок хода и балл второй карточки знает только
// сервер. Гость играет без рекордов и опыта.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = U.read || ((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } });
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const lang = () => (window.CasualLang && /^(uk|en)$/.test(window.CasualLang.lang) ? window.CasualLang.lang : 'ru');
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const focused = () => { try { return document.hasFocus(); } catch (e) { return true; } };
  const board = document.getElementById('hlBoard');
  const side = document.getElementById('hlSide');
  if (!board || !side) return;
  const API = '/api/games/hilo';
  async function api(method, path, body, keepalive) {
    const t = token();
    const r = await fetch(API + path, { method, cache: 'no-store', keepalive: !!keepalive, headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(d.error || 'Не получилось, попробуй ещё раз'); er.status = r.status; throw er; }
    return d;
  }
  // гость: тот же код, что у счётчика «на сайте» (online.js), — по нему сервер закрывает прежнюю незаконченную игру
  const guestId = () => { try { const g = localStorage.getItem('casualhub.guestId.v1'); return g && /^[a-z0-9]{12,40}$/.test(g) ? g : ''; } catch (e) { return ''; } };

  // phase: intro (правила) → loading → play (ход) → wait (верно: балл второй виден) → play … → over (итог)
  const S = { info: null, phase: 'intro', err: '', run: '', a: null, b: null, ms: 15000, end: 0, raf: 0, poll: 0, wait: 0, live: false, busy: false, streak: 0, xp: 0, best: 0, over: null, reveal: null, next: null };

  // ---------- вид ----------
  const num = (v) => { const s = (Math.round(+v * 10) / 10).toFixed(1); return lang() === 'en' ? s : s.replace('.', ','); };
  const tier = (v) => (v >= 7.5 ? 'good' : v >= 5 ? 'mid' : 'bad'); // как у оценок сайта
  const KIND = { game: 'Игра', anime: 'Аниме', movie: 'Фильм' };
  // по-русски — русское название (у аниме и фильмов), а под ним оригинал; на других языках — название из источника
  const nameOf = (x) => (lang() === 'ru' && x.ru ? x.ru : x.t);
  const svg = (d) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const UP = svg('<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/>'), DOWN = svg('<path d="M8 3v10M3.5 8.5L8 13l4.5-4.5"/>');
  const WARN = '<svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8 15 14H1z"/><path d="M8 6v3.6M8 11.8v.1"/></svg>';
  const profUrl = (u) => (/^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/.test(u.handle || '') ? '/profile/' + u.handle : '/profile/?id=' + encodeURIComponent(u.id));

  // карточка: o.score — открытый балл второй (после ответа), o.res — good или bad
  function card(x, sideName, o = {}) {
    const name = nameOf(x), orig = name !== x.t ? x.t : '';
    const s = sideName === 'a' ? x.s : o.score;
    const open = s != null;
    const cover = x.img
      ? `<img src="${esc(x.img)}" alt="" width="600" height="900" decoding="async" draggable="false">`
      : `<em>${esc(name.charAt(0).toUpperCase())}</em>`;
    return `<article class="hl-card${o.res ? ' ' + o.res : ''}${o.enter ? ' in' : ''}" data-side="${sideName}" data-img="${esc(x.img || '')}">
      <div class="hl-cover${x.wide ? ' wide' : ''}">${cover}${o.res ? `<span class="hl-res">${o.res === 'good' ? 'Верно' : 'Мимо'}</span>` : ''}</div>
      <span class="hl-kind"><span>${KIND[x.kind] || ''}</span>${x.y ? ` · <span>${+x.y}</span>` : ''}</span>
      <span class="hl-names"><b class="hl-name">${esc(name)}</b>${orig ? `<small class="hl-orig">${esc(orig)}</small>` : ''}</span>
      <span class="hl-score"><span class="badge" data-tier="${open ? tier(s) : 'idle'}"${open ? '' : ' aria-label="Балл скрыт"'}>${open ? num(s) : '?'}</span><span class="hl-src">${esc(x.src || '')}</span></span>
    </article>`;
  }
  // кнопки ответа — под второй карточкой (на телефоне — во всю ширину), а не в ней: так баллы обеих карточек на одной высоте
  const acts = (off) => `<span class="hl-acts"><button type="button" class="btn primary" data-pick="higher"${off ? ' disabled' : ''}>${UP}<span>Выше</span></button><button type="button" class="btn ghost" data-pick="lower"${off ? ' disabled' : ''}>${DOWN}<span>Ниже</span></button></span>`;
  function top() {
    const sec = Math.round((S.ms || 15000) / 1000);
    return `<div class="hl-top"><div class="hl-streak"><span class="label">Серия</span><b id="hlStreak">${S.streak}</b></div>
      <div class="hl-time${S.phase === 'over' ? ' off' : ''}" id="hlTime"><span class="vh">Осталось секунд</span><b id="hlSec" role="timer">${sec}</b><span class="hl-meter" aria-hidden="true"><i id="hlMeter"></i></span></div></div>`;
  }
  function intro() {
    const i = S.info || {};
    const movies = (i.srcs || []).includes('IMDb');
    return `<div class="hl-intro">
      <h2>Как играть</h2>
      <ol class="hl-rules">
        <li>У первой карточки балл открыт. Угадай, у второй он выше или ниже.</li>
        <li>Угадал — вторая становится первой и приходит новая. Ошибся — игра окончена.</li>
        <li>На ответ ${+i.round || 15} секунд. Одинаковых баллов в паре не бывает.</li>
        <li>${movies ? 'Баллы — от 0 до 10: у игр — доля положительных отзывов в Steam (93 % — это 9,3), у аниме — средний балл AniList, у фильмов — рейтинг IMDb.' : 'Баллы — от 0 до 10: у игр — доля положительных отзывов в Steam (93 % — это 9,3), у аниме — средний балл AniList.'}</li>
      </ol>
      <div class="hl-warn" role="note">${WARN}<strong>Уйдёшь со страницы — проиграешь</strong><span>Другая вкладка, другое окно, свёрнутый браузер или другое приложение на телефоне — и игра сразу окончена. Погуглить не выйдет.</span></div>
      <div class="hl-go"><button type="button" class="btn primary" data-act="start"${S.phase === 'loading' ? ' disabled' : ''}>${S.phase === 'loading' ? 'Загружаю…' : 'Начать'}</button><small>Клавиши: ↑ — выше, ↓ — ниже</small></div>
      <p class="hl-msg" role="alert">${esc(S.err)}</p>
    </div>`;
  }
  const WHY = { time: 'Время вышло', left: 'Ты ушёл со страницы — игра окончена', pool: 'Карточки кончились — ты угадал все до одной', error: 'Не получилось загрузить следующую карточку. Серия засчитана' };
  // still — итог уже был на экране (пришёл ответ сервера после «ушёл» или «время вышло»): без повторного появления
  function overBox(still) {
    const o = S.over, i = S.info || {};
    const b = o.b || null;
    let why = WHY[o.why] || WHY.left;
    if (o.why === 'wrong') why = b ? `Мимо: у «${esc(nameOf(b))}» ${num(b.s)}` : 'Мимо';
    if (o.why === 'gone') why = esc(o.msg || WHY.error);
    const signed = o.best != null;
    const tags = [
      o.record ? '<span class="rec">Новый рекорд!</span>' : '',
      signed ? `<span><span>Сегодня</span> <b>${+o.today || 0}</b></span><span><span>Рекорд</span> <b>${+o.best || 0}</b></span>` : '',
      S.xp ? `<span class="xp">+${S.xp} опыта</span>` : '',
    ].join('');
    return `<div class="hl-over${still ? ' still' : ''}" role="status">
      <h2>${o.why === 'pool' ? 'Ты прошёл все карточки!' : 'Игра окончена'}</h2>
      <p class="hl-why">${why}</p>
      <div class="hl-final"><span class="label">Серия</span><b>${+o.streak || 0}</b></div>
      ${tags ? `<div class="hl-tags">${tags}</div>` : ''}
      ${!signed && !i.signed ? '<p class="hl-guest">Войди, чтобы сохранять рекорды и получать опыт</p>' : ''}
      <button type="button" class="btn primary" data-act="start"${o.pending ? ' disabled' : ''}>Ещё раз</button>
    </div>`;
  }
  // how: start — обе карточки въезжают, next — въезжает новая вторая, иначе без анимации
  function renderBoard(how) {
    if (S.phase === 'intro' || S.phase === 'loading' || !S.a || !S.b) { board.innerHTML = intro(); return; }
    const over = S.phase === 'over' ? S.over : null;
    const openB = S.phase === 'wait' ? S.reveal : over && over.b ? over.b.s : null;
    const res = S.phase === 'wait' ? 'good' : over && over.why === 'wrong' ? 'bad' : '';
    const b = over && over.b ? over.b : S.b;
    board.innerHTML = top()
      + `<div class="hl-pair">${card(S.a, 'a', { enter: how === 'start' })}<span class="hl-or" aria-hidden="true">или</span>${card(b, 'b', { score: openB, res, enter: how === 'start' || how === 'next' })}${S.phase === 'play' || S.phase === 'wait' ? acts(S.phase !== 'play' || S.busy) : ''}</div>`
      + (over ? overBox() : '<p class="hl-keys">Клавиши: ↑ — выше, ↓ — ниже</p><p class="hl-msg" role="alert" id="hlMsg"></p>');
  }
  function renderSide() {
    const i = S.info;
    if (!i) { side.innerHTML = '<p class="hl-empty">Загружаю…</p>'; return; }
    let h = '<h2>Рекорды</h2>';
    if (i.signed && i.me) {
      h += `<div class="hl-stats"><div class="hl-stat"><span>Сегодня</span><b>${+i.me.today || 0}</b></div><div class="hl-stat"><span>За всё время</span><b>${+i.me.best || 0}</b></div><div class="hl-stat"><span>Сыграно</span><b>${+i.me.runs || 0}</b></div></div>`;
      h += '<h3>Среди друзей</h3>';
      h += i.friends && i.friends.length
        ? `<table class="hl-table"><thead><tr><th></th><th></th><th>Лучшая</th><th>Сегодня</th></tr></thead><tbody>${i.friends.map((f, k) => `<tr${f.me ? ' class="me"' : ''}><td>${k + 1}</td><td><a href="${esc(profUrl(f))}">${esc(f.username || f.handle)}</a></td><td>${+f.best || 0}</td><td>${+f.today || '—'}</td></tr>`).join('')}</tbody></table>`
        : '<p class="hl-note">Друзья ещё не играли. Позови их и сравните серии.</p>';
    } else {
      h += `<div class="hl-stats one"><div class="hl-stat"><span>Лучшая серия за этот заход</span><b>${S.best}</b></div></div>`;
      h += '<p class="hl-note">Войди, чтобы сохранять рекорды и получать опыт</p><a class="btn ghost" href="/opinion/#login">Войти</a>';
    }
    if (i.xp) h += `<p class="hl-note muted"><span>+${+i.xp.per} опыта за верный ответ — до ${+i.xp.day} в день.</span> <span>+${+i.xp.bonus} за серию от ${+i.xp.at} подряд — раз в день.</span></p>`;
    h += '<a class="btn text hl-more" href="/games/">Все мини-игры</a>';
    side.innerHTML = h;
  }
  const say = (t) => { const m = document.getElementById('hlMsg'); if (m) m.textContent = t || ''; };
  const setActs = (off, pick) => board.querySelectorAll('.hl-acts .btn').forEach((b) => { b.disabled = off; b.setAttribute('aria-pressed', String(!!pick && b.dataset.pick === pick)); });
  function bump() {
    const el = document.getElementById('hlStreak');
    if (!el) return;
    el.textContent = S.streak;
    if (calm()) return;
    el.classList.remove('up'); void el.offsetWidth; el.classList.add('up');
  }
  // Дальше — правки на месте, без пересборки пары: заново вставленные обложки на миг пустеют, пока картинка снова не разберётся.
  // Балл второй карточки открылся: цифра, цвет по баллу, рамка и метка «Верно» или «Мимо» на обложке
  function openB(score, res) {
    const c = board.querySelector('.hl-card[data-side="b"]');
    const badge = c && c.querySelector('.badge');
    if (!badge) return;
    if (score != null) { badge.textContent = num(score); badge.dataset.tier = tier(score); badge.removeAttribute('aria-label'); }
    c.classList.remove('good', 'bad');
    let r = c.querySelector('.hl-res');
    if (res) {
      c.classList.add(res);
      if (!r) { r = document.createElement('span'); r.className = 'hl-res'; c.querySelector('.hl-cover').appendChild(r); }
      r.textContent = res === 'good' ? 'Верно' : 'Мимо';
    } else if (r) r.remove();
  }
  // новая пара: вторая карточка (уже с баллом) переезжает на место первой, новая вторая въезжает
  function nextPair() {
    const pair = board.querySelector('.hl-pair');
    const a = pair && pair.querySelector('.hl-card[data-side="a"]'), b = pair && pair.querySelector('.hl-card[data-side="b"]');
    if (!a || !b || b.dataset.img !== (S.a.img || '')) { renderBoard('next'); return; }
    b.classList.remove('good', 'bad', 'in');
    b.dataset.side = 'a';
    const r = b.querySelector('.hl-res');
    if (r) r.remove();
    a.replaceWith(b);
    pair.querySelector('.hl-or').insertAdjacentHTML('afterend', card(S.b, 'b', { enter: true }));
    setActs(false);
    say('');
  }
  // итог: пара остаётся (с открытым баллом второй), таймер и кнопки уходят, под парой — итог. Другая пара в разметке
  // (ушёл, пока был виден балл после верного ответа) — собрать заново
  function showOver() {
    const o = S.over, c = board.querySelector('.hl-card[data-side="b"]');
    if (!c || (o.b && c.dataset.img !== (o.b.img || ''))) { renderBoard(); return; }
    if (o.b) openB(o.b.s, o.why === 'wrong' ? 'bad' : '');
    const had = !!board.querySelector('.hl-over');
    board.querySelectorAll('.hl-acts, .hl-keys, .hl-msg, .hl-over').forEach((el) => el.remove());
    const t = document.getElementById('hlTime');
    if (t) t.classList.add('off');
    const st = document.getElementById('hlStreak');
    if (st) st.textContent = +o.streak || 0;
    board.insertAdjacentHTML('beforeend', overBox(had));
  }

  const snd = (n, p) => { if (window.CasualSound) window.CasualSound.play(n, p); }; // звуки — /games/sound.js
  // ---------- таймер хода: только показывает, срок считает сервер ----------
  function stopTimer() { cancelAnimationFrame(S.raf); S.raf = 0; }
  function tick() {
    stopTimer();
    const step = () => {
      if (!S.live || S.phase !== 'play' || S.busy) return;
      const left = Math.max(0, S.end - performance.now());
      const sec = String(Math.ceil(left / 1000));
      const el = document.getElementById('hlSec'), m = document.getElementById('hlMeter'), box = document.getElementById('hlTime');
      if (el && el.textContent !== sec) { el.textContent = sec; if (left > 0 && +sec <= 3) snd('tick'); }
      if (m) m.style.setProperty('--p', (left / (S.ms || 15000)).toFixed(4));
      if (box) box.classList.toggle('low', left <= 5000);
      if (left <= 0) { timeUp(); return; }
      S.raf = requestAnimationFrame(step);
    };
    step();
  }

  // ---------- уход со страницы: сразу проигрыш ----------
  const onVis = () => { if (document.visibilityState === 'hidden') leave(false); };
  // blur окна приходит и тогда, когда фокус ушёл во встроенный плеер на этой же странице: это не уход
  const onBlur = (e) => {
    if (e && e.target !== window) return;
    setTimeout(() => {
      if (!S.live) return;
      const el = document.activeElement;
      if ((el && el.tagName === 'IFRAME') || focused()) return;
      leave(false);
    }, 0);
  };
  const onHide = () => leave(true);
  function arm() {
    document.addEventListener('visibilitychange', onVis);
    addEventListener('blur', onBlur);
    addEventListener('pagehide', onHide);
    clearInterval(S.poll);
    // раз в 0,4 с: окно без фокуса — уход; срок хода вышел — «время вышло», даже если кадры анимации не идут
    S.poll = setInterval(() => {
      if (!S.live) return;
      if (document.visibilityState === 'hidden' || !focused()) leave(false);
      else if (S.phase === 'play' && !S.busy && performance.now() >= S.end) timeUp();
    }, 400);
  }
  function disarm() {
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('blur', onBlur);
    removeEventListener('pagehide', onHide);
    clearInterval(S.poll);
  }
  function stop() { S.live = false; stopTimer(); disarm(); clearTimeout(S.wait); }
  // итог с сервера (после ответа, «ушёл», «время вышло»)
  function finish(over, run) {
    if (run && S.run !== run) return;
    S.over = over;
    S.best = Math.max(S.best, +over.streak || 0);
    S.phase = 'over';
    showOver();
    loadInfo();
  }
  function endLocal(why, beacon) {
    if (!S.live) return;
    stop();
    snd('lose');
    const run = S.run;
    // ушёл, пока был виден балл после верного ответа: на сервере уже новая пара — её и показываем
    if (S.phase === 'wait' && S.next) { S.a = S.next.a; S.b = S.next.b; }
    const moved = S.phase === 'wait';
    S.over = { why, streak: S.streak, pending: true };
    S.phase = 'over';
    if (moved) renderBoard(); else showOver();
    const body = { run, why };
    // страница уходит: ответа уже не прочитать. Вернутся «Назад» (страница из кэша браузера) — «Ещё раз» должна работать
    if (beacon && navigator.sendBeacon) { try { if (navigator.sendBeacon(API + '/lose', JSON.stringify(body))) { S.over.pending = false; showOver(); return; } } catch (e) {} }
    api('POST', '/lose', body, true).then((d) => finish(d.over, run)).catch(() => { if (S.run === run && S.over && S.over.pending) { S.over.pending = false; showOver(); } });
  }
  const leave = (beacon) => endLocal('left', beacon);
  const timeUp = () => endLocal('time', false);

  // ---------- игра ----------
  async function start() {
    if (S.live || S.phase === 'loading') return;
    S.phase = 'loading'; S.err = ''; S.a = S.b = null;
    renderBoard();
    let d;
    try { d = await api('POST', '/start', guestId() && !token() ? { guest: guestId() } : {}); }
    catch (e) { S.phase = 'intro'; S.err = e.message; renderBoard(); return; }
    Object.assign(S, { run: d.run, a: d.a, b: d.b, ms: d.ms || 15000, streak: 0, xp: 0, over: null, reveal: null, next: null, busy: false, phase: 'play', live: true });
    S.end = performance.now() + S.ms;
    renderBoard('start');
    snd('tap');
    arm();
    // пока шёл запрос, ушёл с вкладки или переключил окно — игра не начинается
    if (document.visibilityState === 'hidden' || !focused()) { leave(false); return; }
    tick();
    // доска видна не целиком (телефон) — её верх (серия, время, первая карточка) к верху экрана
    try {
      const r = board.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) scrollTo({ top: scrollY + r.top - 8, behavior: calm() ? 'auto' : 'smooth' });
    } catch (e) {}
  }
  async function answer(pick) {
    if (!S.live || S.phase !== 'play' || S.busy) return;
    S.busy = true;
    stopTimer();
    setActs(true, pick);
    say('');
    const run = S.run;
    let d;
    try { d = await api('POST', '/answer', { run, pick }); }
    catch (e) {
      if (!S.live || S.run !== run) return;
      // игры уже нет или она чужая (вышел из аккаунта посреди игры): сообщение сервера
      if (e.status === 403 || e.status === 404) { stop(); finish({ why: 'gone', msg: e.message, streak: S.streak }); return; }
      // нет связи: срок хода идёт дальше, можно нажать ещё раз
      S.busy = false; setActs(false); say(e.message); tick();
      return;
    }
    if (!S.live || S.run !== run) return; // ушёл со страницы, пока шёл ответ: итог придёт из /lose
    if (d.over) {
      stop();
      if (d.ok) { S.streak = d.streak; S.xp += d.xp || 0; }
      snd(d.ok || d.over.record ? 'win' : 'lose');
      finish(d.over);
      return;
    }
    // верно: балл второй виден, потом новая пара
    S.streak = d.streak; S.xp += d.xp || 0; S.best = Math.max(S.best, d.streak);
    S.phase = 'wait'; S.reveal = d.score; S.next = d;
    openB(d.score, 'good');
    snd('good');
    bump();
    if (!token()) renderSide();
    if (d.b && d.b.img) { const im = new Image(); im.decoding = 'async'; im.src = d.b.img; }
    const t0 = performance.now(), wait = +d.wait || 0;
    clearTimeout(S.wait);
    S.wait = setTimeout(() => {
      if (!S.live || S.run !== run) return;
      Object.assign(S, { a: d.a, b: d.b, ms: d.ms || S.ms, phase: 'play', busy: false, reveal: null, next: null });
      S.end = t0 + wait + S.ms;
      nextPair();
      tick();
    }, calm() ? Math.min(wait, 700) : wait);
  }

  // ---------- данные ----------
  async function loadInfo() {
    try { S.info = await api('GET', ''); }
    catch (e) { if (!S.info) S.info = { signed: false, round: 15, srcs: ['Steam', 'AniList'] }; }
    renderSide();
    if (S.phase === 'intro') renderBoard();
  }

  // ---------- события ----------
  board.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.pick) answer(b.dataset.pick);
    else if (b.dataset.act === 'start') start();
  });
  document.addEventListener('keydown', (e) => {
    // зажатая стрелка повторяет нажатие — это не ответ на следующий ход
    if (S.phase !== 'play' || S.busy || !S.live || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); answer('higher'); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); answer('lower'); }
  });
  // на карточках — ни меню (там «Найти картинку» и «Искать в Google»), ни перетаскивания, ни выделения
  const inCard = (t) => { const el = t && (t.nodeType === 1 ? t : t.parentElement); return !!(el && el.closest && el.closest('.hl-card')); };
  ['contextmenu', 'dragstart', 'selectstart', 'copy'].forEach((ev) => board.addEventListener(ev, (e) => { if (inCard(e.target)) e.preventDefault(); }));
  // обложка не загрузилась — первая буква названия
  board.addEventListener('error', (e) => {
    const im = e.target;
    if (!im || im.tagName !== 'IMG' || !im.closest('.hl-cover')) return;
    const name = (im.closest('.hl-card').querySelector('.hl-name') || {}).textContent || '?';
    const em = document.createElement('em');
    em.textContent = name.charAt(0).toUpperCase();
    im.replaceWith(em);
  }, true);
  // вошли или вышли (в этой вкладке или в соседней) — рекорды под нового человека, но не посреди игры
  const authChanged = () => { if (!S.live) loadInfo(); };
  document.addEventListener('casualhub:auth', authChanged);
  addEventListener('storage', (e) => { if (e.key === 'ocenshik.user.v1' || e.key === 'casualhub.tokens.v1') authChanged(); });

  // заголовок по буквам и въезд шапки — как на других страницах режимов (стили .title .ch и html.intro — в index.html)
  (() => {
    const title = document.getElementById('hlTitle');
    if (!title || calm()) return;
    const text = title.textContent.trim();
    let i = 0;
    title.setAttribute('aria-label', text);
    title.innerHTML = text.split(' ').map((w) => `<span class="w" aria-hidden="true">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
    document.documentElement.classList.add('intro');
    setTimeout(() => document.documentElement.classList.remove('intro'), 1400);
  })();

  renderBoard();
  renderSide();
  loadInfo();
})();
