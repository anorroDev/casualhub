/* Казуал Хаб: друзья.
   Онлайн-аккаунт, заявки в друзья и оценки друзей во вкладке «Мои».
   Работает поверх основного скрипта: берёт state, el и помощники рендера оттуда,
   а renderBoard и saveLocalRatings оборачивает своими хуками. Сервер: functions/api. */
(() => {
  const API = '/api';
  const TOKEN_KEY = 'casualhub.token.v1';
  const VIEW_KEY = 'casualhub.friendView.v1';
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };

  const F = {
    token: lsGet(TOKEN_KEY),
    me: null,
    online: null, // null: ещё не знаем, false: сервера нет, true: работает
    friends: [], incoming: [], outgoing: [],
    view: lsGet(VIEW_KEY) || 'me',
    shelves: new Map(),
    loading: new Set(),
    authTab: 'login',
    msg: '', msgErr: false,
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
  async function api(path, method = 'GET', data) {
    const headers = { 'content-type': 'application/json' };
    if (F.token) headers.authorization = 'Bearer ' + F.token;
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: data ? JSON.stringify(data) : undefined });
    } catch (e) {
      throw new Error('Нет связи с сервером.');
    }
    let out = {};
    try { out = await res.json(); } catch (e) {}
    if (res.status === 401 && F.token && path !== '/login') logoutLocal();
    if (!res.ok) throw new Error(out.error || 'Сервер не отвечает.');
    return out;
  }

  function setToken(t) { F.token = t; lsSet(TOKEN_KEY, t); }
  function logoutLocal() {
    setToken(null);
    F.me = null;
    F.friends = []; F.incoming = []; F.outgoing = [];
    F.shelves.clear();
    setView('me');
  }
  function setView(v) { F.view = v; lsSet(VIEW_KEY, v); }

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
      const r = await api('/shelf/' + encodeURIComponent(id));
      F.shelves.set(id, r);
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
  async function pushShelf() {
    if (!F.me) return;
    try {
      const r = await api('/shelf', 'PUT', { ratings: myRatings() });
      F.pushedAt = r.updatedAt;
      F.pushedCount = r.count;
    } catch (e) { say(e.message, true); }
    if (!sheet.hidden) renderSheet();
  }
  function schedulePush() {
    if (!F.me) return;
    clearTimeout(F.pushTimer);
    F.pushTimer = setTimeout(pushShelf, 1500);
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
  const stampSafe = (r) => { try { return +new Date(stamp(r)) || 0; } catch (e) { return 0; } };

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
    const head = `<div class="sheet-head"><div><h3 id="friendSheetTitle">Друзья</h3>${F.me ? `<p>Ты вошёл как <b>${esc(F.me.username)}</b></p>` : '<p>Онлайн-аккаунт для друзей</p>'}</div>
      <button type="button" class="mini-btn" data-fr="close" aria-label="Закрыть">${ICON.x}</button></div>`;
    const msg = F.msg ? `<p class="fr-msg${F.msgErr ? ' err' : ''}" role="status">${esc(F.msg)}</p>` : '';
    let body = '';
    if (F.online === false) {
      body = `<div class="fr-sec"><p class="fr-muted"><strong>Сервер друзей пока не подключён.</strong> Заявки и оценки друзей заработают, когда к сайту подключат базу данных. Всё остальное работает как раньше.</p></div>`;
    } else if (!F.me) {
      const reg = F.authTab === 'register';
      body = `<div class="fr-sec">
        <div class="seg" role="group" aria-label="Вход или регистрация">
          <button type="button" data-fr="tab-login" aria-pressed="${!reg}">Вход</button>
          <button type="button" data-fr="tab-register" aria-pressed="${reg}">Регистрация</button>
        </div>
        <p class="fr-muted">Это отдельный онлайн-аккаунт, он нужен только для друзей. Друзья увидят твои оценки из вкладки «Мои», фото не отправляются.</p>
        <form class="fr-form" data-fr-form="${reg ? 'register' : 'login'}">
          <input name="username" placeholder="Ник" autocomplete="username" maxlength="24" required value="${esc(state.user ? state.user.name || '' : '')}">
          <input name="password" type="password" placeholder="${reg ? 'Пароль, от 6 символов' : 'Пароль'}" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
          <button type="submit" class="btn small primary">${reg ? 'Создать аккаунт' : 'Войти'}</button>
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
          <div class="sheet-actions"><button type="button" class="btn small ghost" data-fr="push">Отправить оценки сейчас</button><button type="button" class="btn small ghost danger" data-fr="logout">Выйти</button></div>
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
      if (kind === 'login' || kind === 'register') {
        const r = await api('/' + kind, 'POST', { username: fd.get('username'), password: fd.get('password') });
        setToken(r.token);
        F.me = r.user;
        F.msg = kind === 'register' ? 'Аккаунт создан. Теперь добавь друзей по нику.' : '';
        F.msgErr = false;
        await refreshFriends();
        pushShelf();
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
    if (act === 'tab-login' || act === 'tab-register') { F.authTab = act.slice(4); F.msg = ''; return renderSheet(); }
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
      if (act === 'push') { await pushShelf(); F.msg = 'Оценки отправлены.'; F.msgErr = false; }
      if (act === 'logout') { try { await api('/logout', 'POST'); } catch (err) {} logoutLocal(); F.msg = 'Ты вышел из онлайн-аккаунта.'; F.msgErr = false; }
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

  // ---------- хуки в основной скрипт ----------
  if (typeof window.renderBoard === 'function') {
    const orig = window.renderBoard;
    window.renderBoard = function () { const r = orig.apply(this, arguments); try { afterBoard(); } catch (e) { console.error(e); } return r; };
  }
  if (typeof window.saveLocalRatings === 'function') {
    const orig = window.saveLocalRatings;
    window.saveLocalRatings = function () { const r = orig.apply(this, arguments); schedulePush(); return r; };
  }

  // ---------- старт ----------
  (async () => {
    try {
      const h = await fetch(API + '/health', { cache: 'no-store' });
      const d = h.ok ? await h.json() : null;
      F.online = !!(d && d.ok);
    } catch (e) { F.online = false; }
    if (F.online && F.token) {
      try {
        F.me = (await api('/me')).user;
        await refreshFriends();
        pushShelf();
      } catch (e) {}
    }
    renderBoard();
  })();
})();
