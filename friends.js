/* Казуал Хаб: друзья.
   Аккаунт один: регистрация и вход через «Войти / Профиль» заодно создают и открывают онлайн-аккаунт
   на сервере с тем же ником и паролем. По этому нику тебя добавляют друзья.
   Работает поверх основного скрипта: берёт state, el и помощники рендера оттуда, а функции
   аккаунтов, renderBoard и saveLocalRatings оборачивает своими хуками. Сервер: functions/api. */
(() => {
  const API = '/api';
  const TOKENS_KEY = 'casualhub.tokens.v1';   // { id локального профиля: токен сессии }
  const OLD_TOKEN_KEY = 'casualhub.token.v1'; // токен из версии с отдельным входом
  const VIEW_KEY = 'casualhub.friendView.v1';
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const readTokens = () => { try { return JSON.parse(lsGet(TOKENS_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const writeTokens = (t) => lsSet(TOKENS_KEY, JSON.stringify(t));
  function setTokenFor(localId, token) {
    const t = readTokens();
    if (token) t[localId] = token; else delete t[localId];
    writeTokens(t);
  }

  const F = {
    token: null,
    me: null,
    sessionUser: undefined,
    online: null, // null: ещё не знаем, false: сервера нет, true: работает
    friends: [], incoming: [], outgoing: [],
    view: lsGet(VIEW_KEY) || 'me',
    shelves: new Map(),
    loading: new Set(),
    msg: '', msgErr: false,
    linkError: '',
    pushedAt: null, pushedCount: 0, pushTimer: 0,
    removeArmed: '',
  };

  // ---------- стили ----------
  const css = document.createElement('style');
  css.textContent = `
.friend-bar { margin-top: 8px; }
.friend-bar .sub-chip b { font-weight: 700; color: var(--bad-ink); margin-left: 2px; }
.fr-card .sheet-head p { font-size: 13px; color: var(--ink-2); margin-top: 2px; }
.fr-sec { display: grid; gap: 8px; }
.fr-sec + .fr-sec { padding-top: 14px; border-top: 1px solid var(--line); }
.fr-list { display: grid; gap: 6px; }
.fr-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 6px 6px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.fr-row span { min-width: 0; overflow-wrap: anywhere; }
.fr-row b { font-weight: 600; }
.fr-row small { display: block; font-size: 12px; color: var(--ink-3); }
.fr-acts { display: flex; flex: none; gap: 6px; }
.fr-form { display: flex; flex-wrap: wrap; gap: 8px; }
.fr-form input { flex: 1 1 160px; min-width: 0; height: 40px; padding: 0 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; font-size: 15px; color: var(--ink); }
.fr-form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.fr-nick { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.fr-msg { font-size: 13px; color: var(--ink-2); }
.fr-msg.err { color: var(--bad-ink); font-weight: 600; }
.fr-muted { font-size: 13px; color: var(--ink-2); text-wrap: pretty; }
@media (pointer: coarse) { .fr-form input { font-size: 16px; } }
`;
  document.head.appendChild(css);

  // ---------- разметка ----------
  const bar = document.createElement('div');
  bar.className = 'sub-filters friend-bar';
  bar.id = 'friendBar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Чьи оценки показать');
  bar.hidden = true;
  el.subFilters.after(bar);

  const fboard = document.createElement('ol');
  fboard.className = 'board-list';
  fboard.id = 'friendBoard';
  fboard.hidden = true;
  const fnote = document.createElement('p');
  fnote.className = 'no-match';
  fnote.id = 'friendNote';
  fnote.hidden = true;
  el.board.after(fboard, fnote);

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'friendSheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'friendSheetTitle');
  sheet.innerHTML = '<div class="sheet-card fr-card" id="friendCard"></div>';
  document.body.appendChild(sheet);
  const card = sheet.querySelector('#friendCard');

  // ---------- сервер ----------
  async function api(path, method = 'GET', data, token = F.token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: data ? JSON.stringify(data) : undefined });
    } catch (e) {
      const err = new Error('Нет связи с сервером.');
      err.status = 0;
      throw err;
    }
    let out = {};
    try { out = await res.json(); } catch (e) {}
    if (res.status === 401 && token && token === F.token && path !== '/login' && path !== '/register') dropSession();
    if (!res.ok) {
      const err = new Error(out.error || 'Сервер не отвечает.');
      err.status = res.status;
      throw err;
    }
    return out;
  }

  function dropSession() {
    if (state.user) setTokenFor(state.user.id, null);
    F.token = null;
    F.me = null;
    F.friends = []; F.incoming = []; F.outgoing = [];
    F.shelves.clear();
  }
  function setView(v) { F.view = v; lsSet(VIEW_KEY, v); }

  // подтянуть онлайн-сессию текущего профиля сайта
  async function syncSession() {
    const uid = state.user ? state.user.id : null;
    if (uid !== F.sessionUser) {
      F.sessionUser = uid;
      F.friends = []; F.incoming = []; F.outgoing = [];
      F.shelves.clear();
      F.linkError = '';
      F.pushedAt = null;
      if (F.sessionUser !== undefined && F.view !== 'me') setView('me');
    }
    F.token = uid ? readTokens()[uid] || null : null;
    F.me = null;
    if (F.online && F.token) {
      try {
        F.me = (await api('/me')).user;
        if (state.user && state.user.serverId !== F.me.id) { state.user.serverId = F.me.id; saveUsers(); }
        await refreshFriends();
        pushShelf();
      } catch (e) {}
    }
    if (F.view !== 'me' && !F.friends.some((f) => f.id === F.view)) setView('me');
    redraw();
  }

  // привязать текущий профиль сайта к онлайн-аккаунту с тем же ником
  async function linkCurrent(pass) {
    if (!state.user) return false;
    const nick = state.user.name;
    const localId = state.user.id;
    if (String(pass || '').length < 6) {
      F.linkError = 'Для друзей нужен пароль от 6 символов. Впиши пароль в окне «Друзья».';
      return false;
    }
    const mail = String(state.user.email || '').trim().toLowerCase();
    let r = null;
    try {
      r = await api('/login', 'POST', { login: nick, password: pass }, null);
    } catch (e) {
      if (e.status !== 401) { F.linkError = e.message; return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        F.linkError = 'У аккаунта нет почты. Добавь её в профиле («Войти / Профиль» → изменить) и подключи снова.';
        return false;
      }
      try {
        r = await api('/register', 'POST', { username: nick, password: pass, email: mail }, null);
      } catch (e2) {
        F.linkError = e2.status === 409
          ? `${e2.message} Если аккаунт твой, проверь пароль, иначе поменяй ник или почту в профиле.`
          : e2.message;
        return false;
      }
    }
    if (!state.user || state.user.id !== localId) return false;
    setTokenFor(localId, r.token);
    state.user.serverId = r.user.id;
    if (!state.user.pass) state.user.pass = String(pass).trim();
    saveUsers();
    F.linkError = '';
    await syncSession();
    return true;
  }

  async function refreshFriends() {
    if (!F.me) return;
    try {
      const r = await api('/friends');
      F.friends = r.friends; F.incoming = r.incoming; F.outgoing = r.outgoing;
      if (F.view !== 'me' && !F.friends.some((f) => f.id === F.view)) setView('me');
    } catch (e) { say(e.message, true); }
    redraw();
  }

  async function loadShelf(id, force) {
    if (F.loading.has(id) || (F.shelves.has(id) && !force)) return;
    F.loading.add(id);
    try {
      F.shelves.set(id, await api('/shelf/' + encodeURIComponent(id)));
    } catch (e) {
      F.shelves.set(id, { error: e.message, ratings: [] });
    }
    F.loading.delete(id);
    if (F.view === id) renderBoard();
  }

  // свои оценки: те же, что показывает фильтр «Мои», без примеров и без фото
  function myRatings() {
    return state.ratings
      .filter((r) => !r.example && (state.user ? r.author && r.author.id === state.user.id : r.author && r.author.name === 'Гость'))
      .map((r) => {
        const copy = { ...r };
        delete copy.photo;
        delete copy.hist;
        delete copy.history;
        try { copy.catLabel = catNameOf(r); } catch (e) {}
        return copy;
      });
  }
  // force: отправить даже пустой список (кнопка). Иначе пустой не шлём, чтобы вход
  // с нового устройства, где оценок ещё нет, не стёр то, что видят друзья
  async function pushShelf(force) {
    if (!F.me) return;
    const ratings = myRatings();
    if (!ratings.length && !force) return;
    try {
      const r = await api('/shelf', 'PUT', { ratings });
      F.pushedAt = r.updatedAt;
      F.pushedCount = r.count;
    } catch (e) { say(e.message, true); }
    if (!sheet.hidden) renderSheet();
  }
  function schedulePush() {
    if (!F.me) return;
    clearTimeout(F.pushTimer);
    F.pushTimer = setTimeout(() => pushShelf(true), 1500);
  }

  // ---------- полоса «Я / друзья» и чужой рейтинг ----------
  function renderBar() {
    const chips = [`<button type="button" class="sub-chip" data-fview="me" aria-pressed="${F.view === 'me'}">Я</button>`]
      .concat(F.friends.map((f) => `<button type="button" class="sub-chip" data-fview="${esc(f.id)}" aria-pressed="${F.view === f.id}">${esc(f.username)}</button>`));
    const n = F.incoming.length;
    chips.push(`<button type="button" class="sub-chip" data-fopen="1">👥 Друзья${n ? ` <b>+${n}</b>` : ''}</button>`);
    bar.innerHTML = chips.join('');
  }

  function friendEntryHTML(r, rank) {
    const t = r.total;
    const scores = Array.isArray(r.scores) ? r.scores : [];
    const n = scores.filter((s) => s.v > 0).length;
    let when = '';
    try { when = fmtDate(stamp(r)); } catch (e) {}
    const meta = [t != null ? verdict(t) : 'Без оценки', `${n} ${critWord(n)}`, when].filter(Boolean).join(' · ');
    const spark = scores.map((s) => `<i data-tier="${tierV(s.v)}" data-v="${s.v}"></i>`).join('');
    const bd = scores.map((s) => `<li data-tier="${tierV(s.v)}"><span class="bd-name">${esc(s.name)}</span><span class="bd-bar" aria-hidden="true">${cellsHTML(s.v, 'bc', false)}</span><b class="bd-v">${s.v || '—'}</b>${s.note ? `<span class="bd-note">${esc(s.note)}</span>` : ''}</li>`).join('');
    const pros = splitLines(r.pros), cons = splitLines(r.cons);
    const pc = (pros.length || cons.length) ? `<div class="e-pc-grid">
        ${pros.length ? `<div class="e-pc-box pro"><span class="label pc-label-pro">➕ Плюсы</span><ul>${pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${cons.length ? `<div class="e-pc-box con"><span class="label pc-label-con">➖ Минусы</span><ul>${cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </div>` : '';
    return `<li class="entry"><details><summary><span class="sum">
<span class="rank">${rank}</span>
<span class="e-main"><span class="e-text"><span class="e-name">${r.fav ? '<span class="fav-star-inline">★</span>' : ''}${esc(r.name)}</span><span class="e-sub"><span>${esc(meta)}</span>${r.catLabel ? `<span class="tag">${esc(r.catLabel)}</span>` : ''}${r.status ? `<span class="tag status-tag">${esc(r.status)}</span>` : ''}${r.meta ? `<span class="tag meta-tag">${esc(r.meta)}</span>` : ''}</span></span></span>
<span class="spark" aria-hidden="true">${spark}</span>
<span class="badge" data-tier="${tierT(t)}">${t != null ? fmt(t) : '—'}</span>
${ICON.chev}
</span></summary>
<div class="e-body"><ul class="bd">${bd}</ul>${pc}${r.note ? `<div class="e-note"><span class="label">Заметки</span><p>${esc(r.note)}</p></div>` : ''}</div>
</details></li>`;
  }

  const stampSafe = (r) => { try { return +new Date(stamp(r)) || 0; } catch (e) { return 0; } };

  function showFriendBoard() {
    el.filters.hidden = true; // свои категории к чужим оценкам не относятся
    el.board.hidden = true;
    if (el.tierBoard) el.tierBoard.hidden = true;
    el.noMatch.hidden = true;
    el.empty.hidden = true;
    el.exampleBar.hidden = true;
    const friend = F.friends.find((f) => f.id === F.view);
    const shelf = F.shelves.get(F.view);
    if (!shelf) {
      fboard.hidden = true;
      fnote.hidden = false;
      fnote.textContent = 'Загружаю оценки…';
      el.boardStat.textContent = friend ? friend.username : '';
      loadShelf(F.view);
      return;
    }
    if (shelf.error) {
      fboard.hidden = true;
      fnote.hidden = false;
      fnote.textContent = shelf.error;
      return;
    }
    const q = keyOf(state.query || '');
    const list = shelf.ratings
      .filter((r) => !q || keyOf([r.name, r.meta, r.note, r.catLabel].join(' ')).includes(q))
      .sort((a, b) => state.sort === 'name' ? String(a.name).localeCompare(String(b.name), 'ru')
        : state.sort === 'date' ? (stampSafe(b) - stampSafe(a))
        : ((b.total ?? -1) - (a.total ?? -1)));
    const rated = shelf.ratings.filter((r) => r.total != null);
    const avg = rated.length ? Math.round(rated.reduce((s, r) => s + r.total, 0) / rated.length * 10) / 10 : null;
    el.boardStat.textContent = `${shelf.user.username}: ${shelf.ratings.length} ${plural(shelf.ratings.length, 'оценка', 'оценки', 'оценок')}` + (avg != null ? ` · средний балл ${fmt(avg)}` : '');
    fboard.classList.toggle('grid-mode', state.bmode === 'grid');
    fboard.innerHTML = list.map((r, i) => friendEntryHTML(r, i + 1)).join('');
    fboard.hidden = !list.length;
    fnote.hidden = !!list.length;
    fnote.textContent = shelf.ratings.length ? 'Ничего не нашлось.' : `${shelf.user.username} пока ничего не оценил.`;
  }

  function afterBoard() {
    const mine = state.sfilter === 'mine';
    bar.hidden = !mine;
    if (!mine || F.view === 'me') {
      fboard.hidden = true;
      fnote.hidden = true;
      if (mine) renderBar();
      return;
    }
    renderBar();
    showFriendBoard();
  }

  // ---------- окно «Друзья» ----------
  function say(text, err) { F.msg = text || ''; F.msgErr = !!err; if (!sheet.hidden) renderSheet(); }

  function renderSheet() {
    const head = `<div class="sheet-head"><div><h3 id="friendSheetTitle">Друзья</h3>${F.me ? `<p>Твой ник для друзей: <span class="fr-nick">${esc(F.me.username)}</span></p>` : ''}</div>
      <button type="button" class="mini-btn" data-fr="close" aria-label="Закрыть">${ICON.x}</button></div>`;
    const msg = F.msg ? `<p class="fr-msg${F.msgErr ? ' err' : ''}" role="status">${esc(F.msg)}</p>` : '';
    let body = '';
    if (F.online === false) {
      body = `<div class="fr-sec"><p class="fr-muted"><strong>Сервер друзей сейчас не отвечает.</strong> Заявки и оценки друзей появятся, когда он заработает. Всё остальное работает как обычно.</p></div>`;
    } else if (!state.user) {
      body = `<div class="fr-sec">
        <p class="fr-muted">Друзья работают через твой аккаунт Казуал Хаба. Войди или зарегистрируйся, и по твоему нику тебя смогут добавить.</p>
        <div class="sheet-actions"><button type="button" class="btn small primary" data-fr="auth-login">Войти</button><button type="button" class="btn small ghost" data-fr="auth-reg">Зарегистрироваться</button></div>
      </div>`;
    } else if (!F.me) {
      body = `<div class="fr-sec">
        <p class="fr-muted">Аккаунт <span class="fr-nick">${esc(state.user.name)}</span> ещё не подключён к друзьям. Введи его пароль, и по этому нику тебя смогут добавить. Друзья увидят твои оценки из вкладки «Мои», фото не отправляются.</p>
        ${F.linkError ? `<p class="fr-msg err">${esc(F.linkError)}</p>` : ''}
        <form class="fr-form" data-fr-form="link">
          <input name="password" type="password" placeholder="Пароль от аккаунта, от 6 символов" autocomplete="current-password" required minlength="6">
          <button type="submit" class="btn small primary">Подключить</button>
        </form></div>`;
    } else {
      const row = (u, acts, sub) => `<div class="fr-row"><span><b>${esc(u.username)}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="fr-acts">${acts}</span></div>`;
      const btn = (act, id, label, cls) => `<button type="button" class="btn small ${cls || 'ghost'}" data-fr="${act}" data-id="${esc(id)}">${label}</button>`;
      const when = (t) => (t ? 'оценки обновлены ' + new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'оценок пока нет');
      body = `
        <div class="fr-sec">
          <span class="label">Добавить друга</span>
          <form class="fr-form" data-fr-form="request">
            <input name="username" placeholder="Ник друга" maxlength="24" required autocomplete="off">
            <button type="submit" class="btn small primary">Отправить заявку</button>
          </form>
        </div>
        ${F.incoming.length ? `<div class="fr-sec"><span class="label">Заявки тебе</span><div class="fr-list">${F.incoming.map((u) => row(u, btn('accept', u.id, 'Принять', 'primary') + btn('remove', u.id, 'Отклонить'))).join('')}</div></div>` : ''}
        <div class="fr-sec"><span class="label">Друзья</span>
          ${F.friends.length ? `<div class="fr-list">${F.friends.map((u) => row(u, btn('show', u.id, 'Оценки') + (F.removeArmed === u.id ? btn('remove', u.id, 'Точно убрать?', 'danger-solid') : btn('arm', u.id, 'Убрать', 'ghost danger')), when(u.updatedAt))).join('')}</div>`
            : '<p class="fr-muted">Пока никого. Отправь заявку по нику, друг увидит её у себя в этом окне.</p>'}
        </div>
        ${F.outgoing.length ? `<div class="fr-sec"><span class="label">Ты отправил</span><div class="fr-list">${F.outgoing.map((u) => row(u, btn('remove', u.id, 'Отменить'), 'ждёт ответа')).join('')}</div></div>` : ''}
        <div class="fr-sec">
          <p class="fr-muted">${F.pushedAt ? `Друзья видят ${F.pushedCount} ${plural(F.pushedCount, 'твою оценку', 'твои оценки', 'твоих оценок')}, отправлено ${new Date(F.pushedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.` : 'Твои оценки отправляются друзьям сами после каждого сохранения.'}</p>
          <div class="sheet-actions"><button type="button" class="btn small ghost" data-fr="push">Отправить оценки сейчас</button></div>
        </div>`;
    }
    card.innerHTML = head + msg + body;
  }

  function openSheet() {
    F.msg = '';
    sheet.hidden = false;
    renderSheet();
    if (F.me) refreshFriends();
    const first = card.querySelector('input, button:not([data-fr="close"])');
    if (first) first.focus();
  }
  function closeSheet() { sheet.hidden = true; F.removeArmed = ''; }
  function redraw() { if (!sheet.hidden) renderSheet(); if (state.sfilter === 'mine') renderBoard(); }

  card.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-fr-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.frForm;
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (kind === 'link') {
        const ok = await linkCurrent(String(fd.get('password') || ''));
        F.msg = ok ? 'Готово, аккаунт подключён к друзьям.' : '';
        F.msgErr = false;
      } else if (kind === 'request') {
        const r = await api('/friends/request', 'POST', { username: fd.get('username') });
        F.msg = r.status === 'accepted' ? `${r.user.username} теперь в друзьях.` : `Заявка отправлена: ${r.user.username}.`;
        F.msgErr = false;
        await refreshFriends();
      }
    } catch (err) {
      say(err.message, true);
    }
    btn.disabled = false;
    if (!sheet.hidden) renderSheet();
  });

  card.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fr]');
    if (!b) return;
    const act = b.dataset.fr, id = b.dataset.id;
    if (act === 'close') return closeSheet();
    if (act === 'auth-login' || act === 'auth-reg') { closeSheet(); return openAuthModal(act === 'auth-reg' ? 'reg' : 'login'); }
    if (act === 'arm') { F.removeArmed = id; return renderSheet(); }
    if (act === 'show') {
      closeSheet();
      if (state.sfilter !== 'mine') state.sfilter = 'mine';
      setView(id);
      loadShelf(id, true);
      return renderBoard();
    }
    b.disabled = true;
    try {
      if (act === 'accept') { await api('/friends/accept', 'POST', { userId: id }); F.msg = 'Заявка принята.'; F.msgErr = false; }
      if (act === 'remove') { await api('/friends/remove', 'POST', { userId: id }); F.removeArmed = ''; F.shelves.delete(id); F.msg = ''; }
      if (act === 'push') { await pushShelf(true); F.msg = 'Оценки отправлены.'; F.msgErr = false; }
      await refreshFriends();
    } catch (err) {
      say(err.message, true);
    }
    redraw();
  });

  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  bar.addEventListener('click', (e) => {
    const open = e.target.closest('[data-fopen]');
    if (open) return openSheet();
    const b = e.target.closest('[data-fview]');
    if (!b) return;
    setView(b.dataset.fview);
    if (F.view !== 'me') loadShelf(F.view, true);
    renderBoard();
  });

  // ---------- один аккаунт: обёртки над функциями аккаунтов сайта ----------
  const orig = {
    register: window.registerUser,
    login: window.loginUser,
    logout: window.logoutUser,
    switchUser: window.switchUser,
    update: window.updateUserProfile,
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const NICK_RE = /^[\p{L}\p{N}_.\- ]{2,24}$/u;
  const cleanNick = (s) => String(s || '').trim().replace(/\s+/g, ' ');

  if (typeof orig.register === 'function') {
    window.registerUser = async function (username, email, password, avatar, color) {
      if (!F.online) return orig.register.apply(this, arguments);
      const nick = cleanNick(username);
      const em = String(email || '').trim().toLowerCase();
      const pass = String(password || '').trim();
      // локальные проверки отдаём исходной функции, она сама покажет подсказку
      const localBad = nick.length < 2 || state.users.some((u) => u.name.toLowerCase() === nick.toLowerCase())
        || !EMAIL_RE.test(em) || state.users.some((u) => u.email && u.email.toLowerCase() === em) || pass.length < 6;
      if (localBad) return orig.register.apply(this, arguments);
      if (!NICK_RE.test(nick)) { toast('Ник: буквы, цифры, пробел, точка, дефис или подчёркивание, до 24 символов'); return false; }
      let r;
      try { r = await api('/register', 'POST', { username: nick, password: pass, email: em }, null); }
      catch (e) {
        if (e.status === 0 || e.status === 503) return orig.register.call(this, nick, email, password, avatar, color);
        toast(e.status === 409 ? `${e.message} Если это твой аккаунт, войди на вкладке «Вход».` : e.message);
        return false;
      }
      const ok = orig.register.call(this, nick, email, password, avatar, color);
      if (ok && state.user) {
        setTokenFor(state.user.id, r.token);
        state.user.serverId = r.user.id;
        saveUsers();
        await syncSession();
      }
      return ok;
    };
  }

  if (typeof orig.login === 'function') {
    window.loginUser = async function (identifier, password) {
      if (!F.online) return orig.login.apply(this, arguments);
      const ident = String(identifier || '').trim();
      const pass = String(password || '').trim();
      if (!ident) return orig.login.apply(this, arguments);
      const low = ident.toLowerCase();
      const local = state.users.find((x) => (x.name && x.name.toLowerCase() === low) || (x.email && x.email.toLowerCase() === low));
      let r = null, err = null;
      try { r = await api('/login', 'POST', { login: ident, password: pass }, null); } // сервер ищет и по почте, и по нику
      catch (e) { err = e; }
      if (r) {
        let u = local || state.users.find((x) => x.serverId === r.user.id);
        if (!u) {
          // вход на новом устройстве: заводим профиль сайта из онлайн-аккаунта
          u = {
            id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: r.user.username, email: r.user.email || '', pass: '',
            avatar: r.user.username.charAt(0).toUpperCase(),
            color: randomAvatarColor(r.user.username),
            createdAt: new Date().toISOString(),
          };
          state.users.push(u);
        }
        u.serverId = r.user.id;
        u.pass = pass; // пароль сервера главный
        setTokenFor(u.id, r.token);
        state.user = u;
        saveUsers();
        renderUserBar();
        renderBoard();
        toast(`Вы вошли как ${u.name}`);
        closeAuthModal();
        await syncSession();
        return true;
      }
      // сервер недоступен: обычный вход на этом устройстве
      if (err && (err.status === 0 || err.status === 503)) return orig.login.apply(this, arguments);
      // старый аккаунт, созданный до онлайн-входа: входим локально и тихо подключаем к друзьям
      if (local && !local.serverId && (!local.pass || local.pass === pass)) {
        const ok = orig.login.apply(this, arguments);
        if (ok) await linkCurrent(pass);
        return ok;
      }
      toast(local ? 'Неверный пароль. Попробуйте еще раз' : 'Неверная почта, ник или пароль');
      return false;
    };
  }

  if (typeof orig.logout === 'function') {
    window.logoutUser = function () {
      const token = F.token;
      if (state.user) setTokenFor(state.user.id, null);
      if (token) api('/logout', 'POST', null, token).catch(() => {});
      const r = orig.logout.apply(this, arguments);
      syncSession();
      return r;
    };
  }

  if (typeof orig.switchUser === 'function') {
    window.switchUser = function () {
      const r = orig.switchUser.apply(this, arguments);
      syncSession();
      return r;
    };
  }

  if (typeof orig.update === 'function') {
    window.updateUserProfile = async function (username, email, password, avatar, color) {
      if (!F.me || !state.user) return orig.update.apply(this, arguments);
      const nick = cleanNick(username);
      const pass = String(password || '').trim();
      const em = String(email || '').trim().toLowerCase();
      const nickChanged = nick !== state.user.name;
      const emailChanged = !!em && em !== (state.user.email || '').toLowerCase() && EMAIL_RE.test(em);
      if ((nickChanged || pass || emailChanged) && nick.length >= 2) {
        if (nickChanged && !NICK_RE.test(nick)) { toast('Ник: буквы, цифры, пробел, точка, дефис или подчёркивание, до 24 символов'); return false; }
        if (pass && pass.length < 6) { toast('Пароль должен содержать минимум 6 символов'); return false; }
        try {
          const r = await api('/account', 'PUT', { username: nickChanged ? nick : undefined, password: pass || undefined, email: emailChanged ? em : undefined });
          F.me = r.user;
        } catch (e) {
          toast(e.status === 409 ? 'Такой ник уже занят, выбери другой' : e.message);
          return false;
        }
      }
      return orig.update.call(this, nick, email, password, avatar, color);
    };
  }

  // ---------- хуки рейтинга ----------
  if (typeof window.renderBoard === 'function') {
    const o = window.renderBoard;
    window.renderBoard = function () { const r = o.apply(this, arguments); try { afterBoard(); } catch (e) { console.error(e); } return r; };
  }
  if (typeof window.saveLocalRatings === 'function') {
    const o = window.saveLocalRatings;
    window.saveLocalRatings = function () { const r = o.apply(this, arguments); schedulePush(); return r; };
  }

  // ---------- старт ----------
  (async () => {
    // токен из версии с отдельным входом переносим на текущий профиль
    const old = lsGet(OLD_TOKEN_KEY);
    if (old && state.user && !readTokens()[state.user.id]) setTokenFor(state.user.id, old);
    if (old) lsSet(OLD_TOKEN_KEY, null);
    try {
      const h = await fetch(API + '/health', { cache: 'no-store' });
      const d = h.ok ? await h.json() : null;
      F.online = !!(d && d.ok);
    } catch (e) { F.online = false; }
    await syncSession();
    renderBoard();
  })();
})();
