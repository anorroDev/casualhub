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
.rx { margin-top: 14px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.rx-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.rx-btns button { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); color: var(--ink-2); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: transform .2s cubic-bezier(.34,1.56,.64,1), border-color .15s, background-color .15s; }
.rx-btns button b { font-weight: 800; color: var(--ink); }
.rx-btns button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
.rx-btns button:active { transform: scale(.94); }
/* оценки друга въезжают по очереди, нажатая реакция подпрыгивает — без растворения */
#friendBoard .entry.fr-in { animation: fr-in .55s cubic-bezier(.34, 1.56, .64, 1) backwards; animation-delay: calc(var(--k, 0) * 35ms); }
@keyframes fr-in { from { transform: translateY(16px) scale(.985); } }
.rx-btns button[aria-pressed="true"] { animation: rx-pop .45s cubic-bezier(.34, 1.56, .64, 1); }
@keyframes rx-pop { 40% { transform: scale(1.15) rotate(-3deg); } }
@media (prefers-reduced-motion: reduce) { #friendBoard .entry.fr-in, .rx-btns button[aria-pressed="true"] { animation: none; } }
.rx-form { display: flex; gap: 6px; }
.rx-form input { flex: 1; min-width: 0; height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); font: inherit; font-size: 14px; }
.rx-form button { flex: none; height: 38px; padding: 0 14px; border: 0; border-radius: 10px; background: var(--ink); color: var(--panel); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.rx-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.rx-list li { padding: 8px 11px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); font-size: 13.5px; overflow-wrap: anywhere; }
.rx-list li b { font-weight: 700; }
.rx-list li span { color: var(--ink-2); }
.rx-sum { display: inline-flex; gap: 6px; font-size: 12px; color: var(--ink-2); }
.rx-title { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.friend-bar .sub-chip b { font-weight: 700; color: var(--bad-ink); margin-left: 2px; }
.fr-card .sheet-head p { font-size: 13px; color: var(--ink-2); margin-top: 2px; }
.fr-sec { display: grid; gap: 8px; }
.fr-sec + .fr-sec { padding-top: 14px; border-top: 1px solid var(--line); }
.fr-list { display: grid; gap: 6px; }
.fr-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 6px 6px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.fr-row span { min-width: 0; overflow-wrap: anywhere; }
.fr-row b { font-weight: 600; }
.fr-row small { display: block; font-size: 12px; color: var(--ink-3); }
.fr-row i, .rx-list li i { font-style: normal; font-weight: 600; color: var(--ink-3); margin-left: 6px; }
.fr-nick.copy { border: 0; font: inherit; cursor: pointer; }
.fr-nick.copy svg { width: 13px; height: 13px; }
.fr-row > span:first-child { flex: 1 1 150px; }
.fr-acts { display: flex; flex: none; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.fr-form { display: flex; flex-wrap: wrap; gap: 8px; }
.fr-form input { flex: 1 1 160px; min-width: 0; height: 40px; padding: 0 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; font-size: 15px; color: var(--ink); }
.fr-form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.fr-nick { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.fr-msg { font-size: 13px; color: var(--ink-2); }
.fr-toggle { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.fr-toggle input { width: 18px; height: 18px; accent-color: var(--accent); }
.friend-bar .sub-chip .on-dot { margin-right: 2px; }
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

  // для Мнения: запросы к серверу от имени вошедшего (фото исполнителей с Genius)
  window.casualApi = { get: (path) => api(path), online: () => !!(F.me && F.token) };
  // переходы с главной и из профиля: доска друга на его оценке, окно друзей
  const waitFor = (test, ms = 8000) => new Promise((res) => {
    const t0 = Date.now();
    const tick = () => { const v = test(); if (v || Date.now() - t0 > ms) res(v); else setTimeout(tick, 250); };
    tick();
  });
  window.CasualFriends = {
    openSheet: () => waitFor(() => F.me || !F.online, 6000).then(() => openSheet()),
    async showFriend(uid, rid) {
      // друзья подгружаются после входа: ждём, пока этот друг появится в списке
      const ok = await waitFor(() => F.friends.some((f) => f.id === uid));
      if (!ok) { toast('Оценки этого человека видны только друзьям'); return; }
      if (isNarrow()) setSection('board'); else setView('board');
      state.sfilter = 'mine';
      F.view = uid;
      lsSet(VIEW_KEY, uid);
      loadShelf(uid, true);
      renderBoard();
      if (!rid) return;
      const li = await waitFor(() => fboard.querySelector(`.entry[data-rid="${CSS.escape(rid)}"]`));
      if (!li) { toast('Этой оценки у друга уже нет'); return; }
      const det = li.querySelector('details');
      if (det) det.open = true;
      li.classList.add('flash');
      li.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      for (const ms of [700, 1400]) setTimeout(() => { const r = li.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) li.scrollIntoView({ block: 'center' }); }, ms); // после того как страница доразложится
      setTimeout(() => li.classList.remove('flash'), 2000);
    },
  };

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
  function setView(v) { if (v !== F.view) F.animated = null; F.view = v; lsSet(VIEW_KEY, v); }

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
    // нет онлайн-сессии (старый аккаунт или сессия потерялась): подключаем сам, паролем из профиля
    F.autoLinkTried = F.autoLinkTried || new Set();
    if (F.online && !F.token && state.user && !F.autoLinkTried.has(state.user.id)
        && String(state.user.pass || '').length >= 6) {
      F.autoLinkTried.add(state.user.id);
      if (await linkCurrent(state.user.pass)) return;
    }
    if (F.online && F.token) {
      try {
        F.me = (await api('/me')).user;
        if (state.user && state.user.serverId !== F.me.id) { state.user.serverId = F.me.id; saveUsers(); }
        adoptAccount(F.me);
        forgetPass();
        await syncAvatar();
        await refreshFriends();
        await pullOwnShelf(); // сначала забираем свои оценки с сервера, потом отправляем общий список
        pushShelf();
        loadReacts(F.me.id, true).then(() => decorateOwn());
      } catch (e) {}
    }
    if (F.view !== 'me' && !F.friends.some((f) => f.id === F.view)) setView('me');
    redraw();
  }

  // свои оценки с сервера: на новом устройстве появятся все, на старом добавятся недостающие.
  // Совпадающие по id остаются в более свежей версии; фото на сервер не уходят, поэтому у местных оценок они сохраняются.
  async function pullOwnShelf() {
    if (!F.me || !state.user) return;
    try { await ready; } catch (e) {}
    let r;
    try { r = await api('/shelf/' + encodeURIComponent(F.me.id)); } catch (e) { return; }
    const remote = r && Array.isArray(r.ratings) ? r.ratings : [];
    const remoteDeleted = r && Array.isArray(r.deleted) ? r.deleted : [];
    const stampOf = (x) => +new Date(x.updatedAt || x.createdAt || 0) || 0;
    // удалённые на других устройствах: убираем и здесь
    let removed = 0;
    if (remoteDeleted.length) {
      const del = new Map(remoteDeleted.map((d) => [d.id, +d.at || 0]));
      const before = state.ratings.length;
      state.ratings = state.ratings.filter((x) => !(del.has(x.id) && stampOf(x) <= del.get(x.id)));
      removed = before - state.ratings.length;
    }
    // категории — только после удалений: иначе отрисовка соберёт удалённую категорию заново по её старым оценкам
    pullCats(r && r.cats);
    const byId = new Map(state.ratings.map((x) => [x.id, x]));
    let added = 0, updated = 0, photos = 0;
    const sent = readJSON(PHOTOS_KEY, {});
    for (const rr of remote) {
      if (!rr || !rr.id) continue;
      const copy = { ...rr };
      const remotePhoto = copy.photo && copy.photo.remote ? copy.photo : null;
      const linkPhoto = copy.photo && !copy.photo.remote && photoLink(copy.photo) ? copy.photo : null;
      delete copy.photo;
      if (!state.cats.some((c) => c.id === copy.cat) && copy.catLabel) copy.catName = copy.catName || copy.catLabel;
      delete copy.catLabel;
      copy.author = { ...(rr.author || {}), id: state.user.id, name: state.user.name, avatar: state.user.avatar, color: state.user.color };
      let loc = byId.get(rr.id);
      if (!loc) { delete copy.example; state.ratings.push(copy); byId.set(copy.id, copy); loc = copy; added++; }
      else if (stampOf(rr) > stampOf(loc)) { const photo = loc.photo; Object.assign(loc, copy); if (photo) loc.photo = photo; updated++; }
      if (linkPhoto && !loc.photo) { loc.photo = { id: linkPhoto.url, url: linkPhoto.url, w: linkPhoto.w || 0, h: linkPhoto.h || 0 }; photos++; }
      // фото: качаем, если здесь его нет или на сервере другое и оценка там свежее
      if (remotePhoto) {
        const localData = photoData(loc.photo);
        const needs = !localData || (fp(localData) !== remotePhoto.remote && stampOf(rr) >= stampOf(loc));
        if (needs) {
          try {
            const ph = await api('/photo/' + encodeURIComponent(F.me.id) + '/' + encodeURIComponent(rr.id));
            if (ph && ph.data) { loc.photo = { id: ph.data, data: ph.data, w: remotePhoto.w || 0, h: remotePhoto.h || 0 }; sent[rr.id] = fp(ph.data); photos++; }
          } catch (e) {}
        }
      }
    }
    // аватарка исполнителя сменилась на другом устройстве: в оценках другой отпечаток, качаем новую
    if (typeof artistGet === 'function') {
      const seen = new Set();
      for (const x of state.ratings) {
        if (x.example || !x.artist || !x.artistAva) continue;
        const rid = artistRid(x.artist);
        if (seen.has(rid)) continue;
        seen.add(rid);
        const a = artistGet(x.artist);
        if (a && a.fp === x.artistAva) continue;
        try {
          const ph = await api('/photo/' + encodeURIComponent(F.me.id) + '/' + encodeURIComponent(rid));
          if (ph && ph.data) { artistSetAva(x.artist, ph.data, true); sent[rid] = avaFp(ph.data); photos++; }
        } catch (e) {}
      }
    }
    if (photos) lsSet(PHOTOS_KEY, JSON.stringify(sent));
    if (!added && !updated && !removed && !photos) return;
    if (added) state.ratings = state.ratings.filter((x) => !x.example); // примеры уступают место настоящим оценкам
    saveLocalRatingsQuiet();
    renderBoard();
    const parts = [added && '+' + added, updated && 'обновлено ' + updated, removed && 'удалено ' + removed, photos && 'фото ' + photos].filter(Boolean);
    try { toast('Оценки из аккаунта: ' + parts.join(', ')); } catch (e) {}
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
      r = await api('/login', 'POST', { login: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : nick, password: pass }, null);
    } catch (e) {
      if (e.status !== 401) { F.linkError = e.message; return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        F.linkError = 'У аккаунта нет почты. Добавь её в профиле («Войти / Профиль» → изменить) и подключи снова.';
        return false;
      }
      try {
        r = await api('/register', 'POST', { username: nick, handle: state.user.handle || undefined, password: pass, email: mail }, null);
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
    delete state.user.pass;
    saveUsers();
    F.linkError = '';
    await syncSession();
    return true;
  }

  // профиль подключён к аккаунту: пароль из браузера стираем (его могли сохранить старые версии сайта)
  function forgetPass() {
    let ch = false;
    state.users.forEach((u) => { if (u.serverId && u.pass && readTokens()[u.id]) { delete u.pass; ch = true; } });
    if (state.user && state.user.pass && state.user.serverId) { delete state.user.pass; ch = true; }
    if (ch) saveUsers();
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
      const [sh] = await Promise.all([api('/shelf/' + encodeURIComponent(id)), loadReacts(id, true)]);
      F.shelves.set(id, sh);
    } catch (e) {
      F.shelves.set(id, { error: e.message, ratings: [] });
    }
    F.loading.delete(id);
    if (F.view === id) renderBoard();
  }

  // свои оценки: те же, что показывает фильтр «Мои», без примеров и без фото
  // ---------- синхронизация: фото, удаления, старые оценки ----------
  const THUMBS_KEY = 'casualhub.thumbs.v1'; // { id оценки: отпечаток фото, к которому уже отправлено превью }
  const PHOTOS_KEY = 'casualhub.photos.v1';   // { id оценки: отпечаток уже отправленного фото }
  const DELETED_KEY = 'casualhub.deleted.v1'; // [{ id, at }] оценки, удалённые на этом устройстве
  const readJSON = (k, d) => { try { return JSON.parse(lsGet(k) || 'null') || d; } catch (e) { return d; } };
  const photoData = (p) => (p && typeof p.data === 'string' && p.data.startsWith('data:image/') ? p.data
    : p && typeof p.id === 'string' && p.id.startsWith('data:image/') ? p.id : '');
  const photoLink = (p) => {
    const u = p && (p.url || p.id);
    return typeof u === 'string' && /^https:///.test(u) && u.length < 2000 ? u : '';
  };
  // быстрый отпечаток строки (FNV-1a), чтобы не отправлять одно и то же фото дважды
  function fp(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
  }
  let rawSave = null; // сохранение без отправки на сервер, ставится в хуках внизу

  // ---------- категории: общие для всех устройств аккаунта ----------
  // На сервере лежит весь список категорий с критериями и время его правки (at), остаётся более свежий.
  // Первая синхронизация на устройстве объединяет серверные категории со здешними, чтобы ничего не потерять.
  const CATS_AT_KEY = 'ocenshik.catsAt.v1'; // { id аккаунта: время последней правки категорий на этом устройстве }
  let rawSaveCats = null;
  const catsAt = () => (F.me ? +readJSON(CATS_AT_KEY, {})[F.me.id] || 0 : 0);
  const setCatsAt = (t) => { if (!F.me) return; const m = readJSON(CATS_AT_KEY, {}); m[F.me.id] = t; lsSet(CATS_AT_KEY, JSON.stringify(m)); };
  const CATS_DEL_KEY = 'ocenshik.catsDeleted.v1'; // [{ id, name, at }] удалённые категории
  const catTombs = () => readJSON(CATS_DEL_KEY, []);
  const isTombed = (c, tombs) => tombs.some((d) => d.id === c.id || (d.name && keyOf(d.name) === keyOf(c.name)));
  function addCatTombs(list) {
    const m = new Map(catTombs().map((d) => [d.id, d]));
    for (const d of list || []) if (d && d.id && (!m.has(d.id) || +d.at > +m.get(d.id).at)) m.set(d.id, { id: d.id, name: d.name || '', at: +d.at || Date.now() });
    lsSet(CATS_DEL_KEY, JSON.stringify([...m.values()].sort((a, b) => b.at - a.at).slice(0, 100)));
  }
  function catsPayload() {
    if (typeof serializeCats !== 'function' || !state.cats || !state.cats.length) return undefined;
    return { items: serializeCats(), at: catsAt(), deleted: catTombs() };
  }
  function mergeCats(remote, local) {
    const out = remote.map((c) => ({ ...c, criteria: c.criteria.map((k) => ({ ...k })) }));
    for (const c of local) {
      let t = out.find((x) => x.id === c.id) || out.find((x) => keyOf(x.name) === keyOf(c.name));
      if (!t) { if (out.length < MAX_CATS) out.push({ ...c, criteria: c.criteria.map((k) => ({ ...k })) }); continue; }
      for (const k of c.criteria) {
        if (t.criteria.length >= MAX_CRIT) break;
        if (!t.criteria.some((x) => x.id === k.id || keyOf(x.name) === keyOf(k.name))) t.criteria.push({ ...k });
      }
    }
    return out;
  }
  function applyCats(items) {
    state.cats = items;
    (rawSaveCats || saveLocalCats)();
    if (!form.editingId && !state.cats.some((c) => c.id === form.cat)) form.cat = state.cats[0].id;
    try { renderForm(); } catch (e) {}
    renderBoard();
  }
  function pullCats(rc) {
    if (typeof parseCats !== 'function' || state.editCat) return;
    if (rc && Array.isArray(rc.deleted)) addCatTombs(rc.deleted);
    // действуют только отметки новее здешнего списка: категорию, созданную здесь заново позже удаления, не трогаем
    const tombs = catTombs().filter((d) => +d.at > catsAt());
    // категория удалена на другом устройстве: здесь её тоже нет, даже если здешний список свежее
    if (tombs.length && state.cats.some((c) => isTombed(c, tombs)) && state.cats.some((c) => !isTombed(c, tombs))) {
      applyCats(state.cats.filter((c) => !isTombed(c, tombs)));
    }
    const items = rc && Array.isArray(rc.items) ? parseCats({ items: rc.items }) : null;
    const local = catsAt();
    if (!items || !items.length) { if (!local) setCatsAt(Date.now()); return; } // на сервере пусто: отправим здешние
    if (!local) {
      const merged = mergeCats(items, state.cats.filter((c) => !isTombed(c, tombs)));
      if (JSON.stringify(merged) !== JSON.stringify(state.cats)) applyCats(merged);
      setCatsAt(Date.now());
    } else if (+rc.at > local) {
      if (JSON.stringify(items) !== JSON.stringify(state.cats)) applyCats(items);
      setCatsAt(+rc.at);
    }
  }
  function saveLocalRatingsQuiet() { return (rawSave || saveLocalRatings)(); }
  const ownsRating =(r) => !r.example && r.author && state.user && r.author.id === state.user.id;
  // гостевые оценки этого устройства переходят в аккаунт
  function claimGuestRatings() {
    if (!state.user) return 0;
    let n = 0;
    state.ratings.forEach((r) => {
      if (r.example || (r.author && r.author.id)) return;
      r.author = { id: state.user.id, name: state.user.name, avatar: state.user.avatar || state.user.name.charAt(0).toUpperCase(), color: state.user.color || '#3550E8' };
      n++;
    });
    return n;
  }
  function myRatings() {
    return state.ratings.filter(ownsRating).map((r) => {
      const copy = { ...r };
      const d = photoData(r.photo);
      const link = photoLink(r.photo);
      copy.photo = d ? { remote: fp(d), w: r.photo.w || 0, h: r.photo.h || 0 }
        : link ? { url: link, w: r.photo.w || 0, h: r.photo.h || 0 } : undefined;
      if (!copy.photo) delete copy.photo;
      delete copy.hist;
      delete copy.history;
      try { copy.catLabel = catNameOf(r); } catch (e) {}
      return copy;
    });
  }
  // маленькое превью фото (до 320px): его показывают лента и карточки друзей, чтобы телефон не качал полные фото
  function thumbOf(src) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 320 / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        try { res(cv.toDataURL('image/jpeg', 0.8)); } catch (e) { res(null); }
      };
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  async function uploadPhotos() {
    const sent = readJSON(PHOTOS_KEY, {});
    const thumbs = readJSON(THUMBS_KEY, {});
    let changed = false, tChanged = false, busy = false;
    // сервер попросил подождать (429): остальные фото уйдут со следующей отправкой
    for (const r of state.ratings.filter(ownsRating)) {
      if (busy) break;
      const d = photoData(r.photo);
      if (!d) continue;
      const f = fp(d);
      if (sent[r.id] !== f) {
        try { await api('/photo/' + encodeURIComponent(r.id), 'PUT', { data: d }); sent[r.id] = f; changed = true; }
        catch (e) { if (e.status === 413) { sent[r.id] = f; changed = true; } if (e.status === 429) { busy = true; break; } }
      }
      // превью уходит и для старых фото, и для слишком больших, которые сервер не принял целиком
      if (thumbs[r.id] !== f) {
        const t = await thumbOf(d);
        if (t) {
          try { await api('/photo/' + encodeURIComponent(r.id + '.t'), 'PUT', { data: t }); thumbs[r.id] = f; tChanged = true; } catch (e) { if (e.status === 429) busy = true; }
        }
      }
    }
    // аватарки исполнителей (музыка): одна картинка на исполнителя по адресу art.<хеш имени>
    if (typeof artistsMap === 'function' && !busy) {
      for (const a of Object.values(artistsMap())) {
        if (!a || !a.name || !a.fp || typeof a.ava !== 'string' || !a.ava.startsWith('data:image/')) continue;
        const rid = artistRid(a.name);
        if (sent[rid] === a.fp) continue;
        try { await api('/photo/' + encodeURIComponent(rid), 'PUT', { data: a.ava }); sent[rid] = a.fp; changed = true; } catch (e) { if (e.status === 429) break; }
      }
    }
    if (changed) lsSet(PHOTOS_KEY, JSON.stringify(sent));
    if (tChanged) lsSet(THUMBS_KEY, JSON.stringify(thumbs));
    return busy;
  }
  // сервер сам объединяет оценки с разных устройств, поэтому отправка ничего не затирает
  async function pushShelf() {
    if (!F.me) return;
    if (claimGuestRatings()) { saveLocalRatingsQuiet(); renderBoard(); }
    try {
      // не все фото ушли (сервер попросил подождать): досылаем через минуту
      if (await uploadPhotos()) { clearTimeout(F.photoRetry); F.photoRetry = setTimeout(() => pushShelf(), 65e3); }
      const r = await api('/shelf', 'PUT', { ratings: myRatings(), deleted: readJSON(DELETED_KEY, []), cats: catsPayload() });
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

  const atOf = (u) => (u && u.handle ? '@' + u.handle : '');
  const whoHTML = (u) => `<b>${esc(u.username)}</b>${u.handle ? `<i>@${esc(u.handle)}</i>` : ''}`;
  // профиль сайта повторяет аккаунт: ник, почта и юзернейм, поменянные на другом устройстве, приходят сюда
  function adoptAccount(u) {
    if (!u || !state.user) return;
    let ch = false;
    const set = (k, v) => { if (v && state.user[k] !== v) { state.user[k] = v; ch = true; } };
    // аватар-буква следует за ником
    if (u.username && u.username !== state.user.name && !/^(data:image\/|https?:\/\/)/.test(state.user.avatar || '')) set('avatar', u.username.charAt(0).toUpperCase());
    set('name', u.username);
    set('email', u.email);
    set('handle', u.handle);
    if (u.createdAt) set('serverCreatedAt', new Date(u.createdAt).toISOString());
    if (!ch) return;
    const i = state.users.findIndex((x) => x.id === state.user.id);
    if (i >= 0) state.users[i] = state.user;
    state.ratings.forEach((r) => { if (r.author && r.author.id === state.user.id && r.author.name !== state.user.name) r.author = { ...r.author, name: state.user.name }; });
    saveUsers();
    renderUserBar();
  }

  // ---------- полоса «Я / друзья» и чужой рейтинг ----------
  function renderBar() {
    const chips = [`<button type="button" class="sub-chip" data-fview="me" aria-pressed="${F.view === 'me'}">Я</button>`]
      .concat(F.friends.map((f) => `<button type="button" class="sub-chip" data-fview="${esc(f.id)}" aria-pressed="${F.view === f.id}" title="${esc(atOf(f))}"><i class="on-dot" data-on="${esc(f.id)}" data-last="${+f.lastSeen || ''}"></i> ${esc(f.username)}</button>`));
    const n = F.incoming.length;
    const needLink = F.online && state.user && !F.me;
    chips.push(`<button type="button" class="sub-chip" data-fopen="1">👥 Друзья${n ? ` <b>+${n}</b>` : ''}${needLink ? ' <b>· подключить</b>' : ''}</button>`);
    bar.innerHTML = chips.join('');
    if (window.CasualOnline) window.CasualOnline.paint(bar);
  }

  // фото друга: ссылка показывается сразу, загруженное фото подтягивается с сервера, когда карточка на экране
  function friendPhoto(r, kind) {
    const p = r.photo;
    // без своего фото у трека друга видна аватарка исполнителя
    if (!p) return kind === 'thumb' && r.artist && r.artistAva && F.view && F.view !== 'me' && typeof artistRid === 'function'
      ? `<img class="e-thumb ava f-photo" data-fphoto="${esc(F.view + '|' + artistRid(r.artist))}" alt="" decoding="async">` : '';
    const cls = kind === 'thumb' ? 'e-thumb' : 'e-photo';
    const size = kind === 'body' && p.w && p.h ? ` width="${+p.w}" height="${+p.h}"` : '';
    const alt = kind === 'body' ? `Фото: ${esc(r.name)}` : '';
    if (photoLink(p)) return `<img class="${cls}" src="${esc(photoLink(p))}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${size}>`;
    if (!p.remote || !F.view || F.view === 'me') return '';
    return `<img class="${cls} f-photo" data-fphoto="${esc(F.view + '|' + r.id + (kind === 'thumb' ? '|t' : ''))}" alt="${alt}" decoding="async"${size}>`;
  }
  const photoCache = new Map(); // "uid|rid" -> Promise<data URL | ''>
  let photoObs = null;
  function loadFriendPhoto(key) {
    if (!photoCache.has(key)) {
      const [uid, rid, small] = key.split('|');
      photoCache.set(key, api('/photo/' + encodeURIComponent(uid) + '/' + encodeURIComponent(rid) + (small ? '?thumb=1' : '')).then((r) => (r && r.data) || '', () => ''));
    }
    return photoCache.get(key);
  }
  function hydratePhotos(root) {
    const imgs = [...root.querySelectorAll('img[data-fphoto]:not([src])')];
    if (!imgs.length) return;
    const show = (img) => loadFriendPhoto(img.dataset.fphoto).then((d) => { if (d) { img.onerror = () => img.remove(); img.src = d; } else img.remove(); });
    if (!('IntersectionObserver' in window)) { imgs.forEach(show); return; }
    if (!photoObs) photoObs = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { photoObs.unobserve(e.target); show(e.target); } }), { rootMargin: '300px' });
    imgs.forEach((img) => photoObs.observe(img));
  }

  // ---------- реакции: 🔥 / 💀 / «не согласен» и короткий комментарий ----------
  const RX = [['fire', '🔥', 'огонь'], ['skull', '💀', 'жесть'], ['nope', '🙅', 'не согласен']];
  const rxIcon = (k) => (RX.find((x) => x[0] === k) || [])[1] || '';
  F.reacts = new Map(); // id владельца -> [{ rid, from, emoji, text, at }]
  async function loadReacts(uid, force) {
    if (!F.token || !uid || (F.reacts.has(uid) && !force)) return F.reacts.get(uid) || [];
    try { F.reacts.set(uid, (await api('/reacts/' + encodeURIComponent(uid))).items || []); } catch (e) { F.reacts.set(uid, []); }
    return F.reacts.get(uid);
  }
  const reactsOf = (uid, rid) => (F.reacts.get(uid) || []).filter((x) => x.rid === rid);
  function rxSummary(list) {
    if (!list.length) return '';
    const parts = RX.map(([k, ico]) => { const n = list.filter((x) => x.emoji === k).length; return n ? `${ico}${n}` : ''; }).filter(Boolean);
    const c = list.filter((x) => x.text).length;
    if (c) parts.push(`💬${c}`);
    return `<span class="rx-sum" title="Реакции друзей">${parts.join(' ')}</span>`;
  }
  const rxComments = (list) => {
    const withText = list.filter((x) => x.text || x.emoji);
    return withText.length ? `<ul class="rx-list">${withText.map((x) => `<li>${whoHTML(x.from)} ${rxIcon(x.emoji)} ${x.text ? `<span>${esc(x.text)}</span>` : ''}</li>`).join('')}</ul>` : '';
  };
  // блок на доске друга: свои кнопки, своё поле и чужие реакции
  function rxBlock(uid, rid) {
    const list = reactsOf(uid, rid);
    const mine = list.find((x) => F.me && x.from.id === F.me.id) || {};
    const others = list.filter((x) => !(F.me && x.from.id === F.me.id));
    return `<div class="rx-title">Твоя реакция</div>
      <div class="rx-btns">${RX.map(([k, ico, label]) => { const n = list.filter((x) => x.emoji === k).length; return `<button type="button" data-rx-emoji="${k}" aria-pressed="${mine.emoji === k}">${ico} ${label}${n ? ` <b>${n}</b>` : ''}</button>`; }).join('')}</div>
      <form class="rx-form" data-rx-form><input type="text" maxlength="140" enterkeyhint="send" placeholder="Пара слов о его оценке…" value="${esc(mine.text || '')}" aria-label="Комментарий к оценке"><button type="submit">${mine.text ? 'Изменить' : 'Отправить'}</button></form>
      ${rxComments(others)}`;
  }
  async function sendReact(uid, rid, emoji, text) {
    const list = F.reacts.get(uid) || [];
    const prev = list.find((x) => x.rid === rid && F.me && x.from.id === F.me.id);
    try {
      await api('/react/' + encodeURIComponent(uid) + '/' + encodeURIComponent(rid), 'PUT', { emoji, text });
    } catch (e) { toast(e.message); return; }
    const rest = list.filter((x) => x !== prev);
    if (emoji || text) rest.unshift({ rid, from: { id: F.me.id, username: F.me.username, handle: F.me.handle }, emoji, text, at: Date.now() });
    F.reacts.set(uid, rest);
    const box = fboard.querySelector(`.rx[data-rx="${CSS.escape(rid)}"]`);
    if (box) box.innerHTML = rxBlock(uid, rid);
    const sum = fboard.querySelector(`.entry[data-rid="${CSS.escape(rid)}"] .rx-sum-slot`);
    if (sum) sum.innerHTML = rxSummary(reactsOf(uid, rid));
  }
  fboard.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rx-emoji]');
    if (!b || !F.view || F.view === 'me') return;
    const rid = b.closest('.rx').dataset.rx;
    const mine = reactsOf(F.view, rid).find((x) => F.me && x.from.id === F.me.id) || {};
    const k = b.dataset.rxEmoji;
    sendReact(F.view, rid, mine.emoji === k ? null : k, mine.text || '');
  });
  fboard.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-rx-form]');
    if (!form || !F.view || F.view === 'me') return;
    e.preventDefault();
    const rid = form.closest('.rx').dataset.rx;
    const mine = reactsOf(F.view, rid).find((x) => F.me && x.from.id === F.me.id) || {};
    sendReact(F.view, rid, mine.emoji || null, form.querySelector('input').value.trim());
    form.querySelector('input').blur();
  });
  // свои оценки в рейтинге: что сказали друзья
  function decorateOwn() {
    if (!F.me || state.sfilter === 'mine' && F.view !== 'me') return;
    const list = F.reacts.get(F.me.id);
    if (!list || !list.length) return;
    el.board.querySelectorAll('.entry[data-id]').forEach((li) => {
      const got = list.filter((x) => x.rid === li.dataset.id);
      if (!got.length || li.querySelector('.rx-own')) return;
      const sub = li.querySelector('.e-sub');
      if (sub) sub.insertAdjacentHTML('beforeend', rxSummary(got));
      const body = li.querySelector('.e-body');
      if (body) body.insertAdjacentHTML('beforeend', `<div class="rx rx-own"><div class="rx-title">Друзья о твоей оценке</div>${rxComments(got)}</div>`);
    });
  }

  function friendEntryHTML(r, rank) {
    const t = typeof r.total === 'number' && Number.isFinite(r.total) ? r.total : null;
    const scores = (Array.isArray(r.scores) ? r.scores : []).filter((s) => s && typeof s === 'object').map((s) => ({ ...s, v: Math.max(0, Math.min(10, +s.v || 0)) }));
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
    return `<li class="entry fr-in" style="--k:${Math.min(rank, 12)}" data-rid="${esc(r.id || '')}"><details><summary><span class="sum">
<span class="rank">${rank}</span>
<span class="e-main">${friendPhoto(r, 'thumb')}<span class="e-text"><span class="e-name">${r.fav ? '<span class="fav-star-inline">★</span>' : ''}${esc(r.name)}</span><span class="e-sub"><span>${esc(meta)}</span><span class="rx-sum-slot">${rxSummary(reactsOf(F.view, r.id))}</span>${r.catLabel ? `<span class="tag">${esc(r.catLabel)}</span>` : ''}${r.status ? `<span class="tag status-tag">${esc(r.status)}</span>` : ''}${r.meta ? `<span class="tag meta-tag">${esc(r.meta)}</span>` : ''}</span></span></span>
<span class="spark" aria-hidden="true">${spark}</span>
<span class="badge" data-tier="${tierT(t)}">${t != null ? fmt(t) : '—'}</span>
${ICON.chev}
</span></summary>
<div class="e-body">${friendPhoto(r, 'body')}<ul class="bd">${bd}</ul>${pc}${r.note ? `<div class="e-note"><span class="label">Заметки</span><p>${esc(r.note)}</p></div>` : ''}<div class="rx" data-rx="${esc(r.id || '')}">${rxBlock(F.view, r.id)}</div></div>
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
      el.boardStat.textContent = friend ? `${friend.username} ${atOf(friend)}` : '';
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
    el.boardStat.textContent = `${shelf.user.username}${shelf.user.handle ? ' @' + shelf.user.handle : ''}: ${shelf.ratings.length} ${plural(shelf.ratings.length, 'оценка', 'оценки', 'оценок')}` + (avg != null ? ` · средний балл ${fmt(avg)}` : '');
    fboard.classList.toggle('grid-mode', state.bmode === 'grid');
    fboard.innerHTML = list.map((r, i) => friendEntryHTML(r, i + 1)).join('');
    // въезжают только при первом открытии доски этого друга, а не при каждом символе в поиске
    if (F.animated === F.view) fboard.querySelectorAll('.fr-in').forEach((li) => li.classList.remove('fr-in'));
    F.animated = F.view;
    hydratePhotos(fboard);
    fboard.hidden = !list.length;
    fnote.hidden = !!list.length;
    fnote.textContent = shelf.ratings.length ? 'Ничего не нашлось.' : `${shelf.user.username} пока ничего не оценил.`;
  }

  function afterBoard() {
    try { decorateOwn(); } catch (e) {}
    const mine = state.sfilter === 'mine';
    // во «Моих» уже есть строка друзей со своей кнопкой «Друзья» — вторая не нужна
    const fo = document.getElementById('friendsOpen');
    if (fo) fo.hidden = mine;
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
    const head = `<div class="sheet-head"><div><h3 id="friendSheetTitle">Друзья</h3>${F.me ? `<p>Тебя добавляют по юзернейму: <button type="button" class="fr-nick copy" data-fr="copy" title="Скопировать">@${esc(F.me.handle || '')} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></p>` : ''}</div>
      <button type="button" class="mini-btn" data-fr="close" aria-label="Закрыть">${ICON.x}</button></div>`;
    const msg = F.msg ? `<p class="fr-msg${F.msgErr ? ' err' : ''}" role="status">${esc(F.msg)}</p>` : '';
    let body = '';
    if (F.online === false) {
      body = `<div class="fr-sec"><p class="fr-muted"><strong>Сервер друзей сейчас не отвечает.</strong> Заявки и оценки друзей появятся, когда он заработает. Всё остальное работает как обычно.</p></div>`;
    } else if (!state.user) {
      body = `<div class="fr-sec">
        <p class="fr-muted">Друзья работают через твой аккаунт Казуал Хаба. Войди или зарегистрируйся, и по твоему @юзернейму тебя смогут добавить.</p>
        <div class="sheet-actions"><button type="button" class="btn small primary" data-fr="auth-login">Войти</button><button type="button" class="btn small ghost" data-fr="auth-reg">Зарегистрироваться</button></div>
      </div>`;
    } else if (!F.me) {
      body = `<div class="fr-sec">
        <p class="fr-muted">Аккаунт <span class="fr-nick">${esc(state.user.name)}</span> ещё не подключён к друзьям. Введи его пароль, и друзья смогут добавить тебя по @юзернейму. Друзья увидят твои оценки из вкладки «Мои», фото не отправляются.</p>
        ${F.linkError ? `<p class="fr-msg err">${esc(F.linkError)}</p>` : ''}
        <form class="fr-form" data-fr-form="link">
          <input name="password" type="password" placeholder="Пароль от аккаунта, от 6 символов" autocomplete="current-password" required minlength="6">
          <button type="submit" class="btn small primary">Подключить</button>
        </form></div>`;
    } else {
      const row = (u, acts, sub) => `<div class="fr-row"><span>${whoHTML(u)}${sub ? `<small>${sub}</small>` : ''}</span><span class="fr-acts">${acts}</span></div>`;
      const btn = (act, id, label, cls) => `<button type="button" class="btn small ${cls || 'ghost'}" data-fr="${act}" data-id="${esc(id)}">${label}</button>`;
      const when = (t) => (t ? 'оценки обновлены ' + new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'оценок пока нет');
      const seenOf = (u) => `<span data-seen="${esc(u.id)}" data-last="${+u.lastSeen || ''}" data-post=" · "></span>`;
      body = `
        <div class="fr-sec">
          <span class="label">Добавить друга</span>
          <form class="fr-form" data-fr-form="request">
            <input name="handle" placeholder="@юзернейм друга" maxlength="21" required autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
            <button type="submit" class="btn small primary">Отправить заявку</button>
          </form>
        </div>
        ${F.incoming.length ? `<div class="fr-sec"><span class="label">Заявки тебе</span><div class="fr-list">${F.incoming.map((u) => row(u, btn('accept', u.id, 'Принять', 'primary') + btn('remove', u.id, 'Отклонить'))).join('')}</div></div>` : ''}
        <div class="fr-sec"><span class="label">Друзья</span>
          ${F.friends.length ? `<div class="fr-list">${F.friends.map((u) => row(u, `<a class="btn small ghost" href="/profile/?id=${encodeURIComponent(u.id)}" style="text-decoration:none">Профиль</a>` + btn('show', u.id, 'Оценки') + (F.removeArmed === u.id ? btn('remove', u.id, 'Точно убрать?', 'danger-solid') : btn('arm', u.id, 'Убрать', 'ghost danger')), seenOf(u) + when(u.updatedAt))).join('')}</div>`
            : '<p class="fr-muted">Пока никого. Отправь заявку по @юзернейму, друг увидит её у себя в этом окне.</p>'}
        </div>
        ${F.outgoing.length ? `<div class="fr-sec"><span class="label">Ты отправил</span><div class="fr-list">${F.outgoing.map((u) => row(u, btn('remove', u.id, 'Отменить'), 'ждёт ответа')).join('')}</div></div>` : ''}
        <div class="fr-sec">
          <p class="fr-muted">${F.pushedAt ? `Друзья видят ${F.pushedCount} ${plural(F.pushedCount, 'твою оценку', 'твои оценки', 'твоих оценок')}, отправлено ${new Date(F.pushedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.` : 'Твои оценки отправляются друзьям сами после каждого сохранения.'}</p>
          <div class="sheet-actions"><button type="button" class="btn small ghost" data-fr="push">Отправить оценки сейчас</button></div>
        </div>
        <div class="fr-sec"><label class="fr-toggle"><input type="checkbox" data-fr-online${F.me.hideOnline ? '' : ' checked'}> Показывать друзьям, что я в сети</label>
          <p class="fr-muted">Если выключить, друзья не увидят, что ты в сети и когда был(а) последний раз. Общий счётчик на главной тебя всё равно посчитает, но без имени.</p></div>`;
    }
    card.innerHTML = head + msg + body;
    if (window.CasualOnline) window.CasualOnline.paint(card);
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
        const r = await api('/friends/request', 'POST', { handle: fd.get('handle') });
        F.msg = r.status === 'accepted' ? `${r.user.username} (@${r.user.handle}) теперь в друзьях.` : `Заявка отправлена: ${r.user.username} (@${r.user.handle}).`;
        F.msgErr = false;
        await refreshFriends();
      }
    } catch (err) {
      say(err.message, true);
    }
    btn.disabled = false;
    if (!sheet.hidden) renderSheet();
  });

  card.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-fr-online]');
    if (!t || !F.me) return;
    t.disabled = true;
    try { F.me = (await api('/account', 'PUT', { hideOnline: !t.checked })).user; }
    catch (err) { t.checked = !t.checked; say(err.message, true); }
    t.disabled = false;
  });
  // онлайн обновился: перерисовывается только полоса друзей (окно с полем ввода не трогаем, там точки красит online.js)
  document.addEventListener('casual-online', () => { if (state.sfilter === 'mine' && F.friends.length) renderBar(); });

  card.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fr]');
    if (!b) return;
    const act = b.dataset.fr, id = b.dataset.id;
    if (act === 'close') return closeSheet();
    if (act === 'copy' && F.me) {
      const t = '@' + F.me.handle;
      try { await navigator.clipboard.writeText(t); toast('Скопировано: ' + t); } catch (err) { toast(t); }
      return;
    }
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
      if ((act === 'accept' || act === 'remove') && window.CasualOnline) window.CasualOnline.ping(); // цифры на кнопке «Друзья» сразу
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
  const HANDLE_RE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
  // аватар общий для аккаунта: на новом устройстве подтягивается с сервера (avatar-sync.js)
  async function syncAvatar() {
    if (!window.CasualAvatar || !F.me || !state.user) return;
    const ch = await window.CasualAvatar.sync(F.me.id, F.token);
    if (!ch || !state.user) return;
    state.user.avatar = ch.still;
    state.users.forEach((u) => { if (u.id === state.user.id) u.avatar = ch.still; });
    state.ratings.forEach((r) => { if (r.author && r.author.id === state.user.id) r.author = { ...r.author, avatar: ch.still }; });
    saveUsers();
    saveLocalRatingsQuiet();
    renderUserBar();
    renderBoard();
  }
  const cleanNick = (s) => String(s || '').trim().replace(/\s+/g, ' ');

  if (typeof orig.register === 'function') {
    window.registerUser = async function (username, email, password, avatar, color, handle) {
      if (!F.online) return orig.register.apply(this, arguments);
      const nick = cleanNick(username);
      const em = String(email || '').trim().toLowerCase();
      const pass = String(password || '').trim();
      // локальные проверки отдаём исходной функции, она сама покажет подсказку
      const localBad = nick.length < 2 || !EMAIL_RE.test(em) || state.users.some((u) => u.email && u.email.toLowerCase() === em) || pass.length < 8;
      if (localBad) return orig.register.apply(this, arguments);
      if (!NICK_RE.test(nick)) { toast('Ник: буквы, цифры, пробел, точка, дефис или подчёркивание, до 24 символов'); return false; }
      const h = String(handle || '').trim().replace(/^@+/, '').toLowerCase();
      if (!HANDLE_RE.test(h)) { toast(h ? 'Юзернейм: от 3 до 20 символов, латинские буквы, цифры, «_» и «.»' : 'Придумай юзернейм: по нему тебя найдут друзья'); return false; }
      let r;
      try { r = await api('/register', 'POST', { username: nick, handle: h, password: pass, email: em }, null); }
      catch (e) {
        if (e.status === 0 || e.status === 503) return orig.register.call(this, nick, email, password, avatar, color, h);
        toast(e.status === 409 && /почт/.test(e.message) ? `${e.message} Если это твой аккаунт, войди на вкладке «Вход».` : e.message);
        return false;
      }
      const ok = orig.register.call(this, nick, email, password, avatar, color, r.user.handle);
      if (ok && state.user) {
        setTokenFor(state.user.id, r.token);
        state.user.serverId = r.user.id;
        state.user.handle = r.user.handle;
        delete state.user.pass;
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
      const local = state.users.find((x) => (x.email && x.email.toLowerCase() === low) || (x.handle && x.handle === low.replace(/^@+/, '')) || (x.name && x.name.toLowerCase() === low));
      let r = null, err = null;
      try { r = await api('/login', 'POST', { login: ident, password: pass }, null); } // сервер ищет и по почте, и по нику
      catch (e) { err = e; }
      if (r) {
        let u = state.users.find((x) => x.serverId === r.user.id) || (local && (!local.serverId || local.serverId === r.user.id) ? local : null);
        if (!u) {
          // вход на новом устройстве: заводим профиль сайта из онлайн-аккаунта
          u = {
            id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: r.user.username, email: r.user.email || '', handle: r.user.handle || '', pass: '',
            avatar: r.user.username.charAt(0).toUpperCase(),
            color: randomAvatarColor(r.user.username),
            createdAt: new Date().toISOString(),
          };
          state.users.push(u);
        }
        u.serverId = r.user.id;
        delete u.pass; // пароль проверяет сервер, в браузере он не хранится
        setTokenFor(u.id, r.token);
        state.user = u;
        adoptAccount(r.user);
        saveUsers();
        renderUserBar();
        renderBoard();
        toast(`Вход выполнен: ${u.name}`);
        closeAuthModal();
        await syncSession();
        return true;
      }
      // сервер недоступен: обычный вход на этом устройстве
      if (err && (err.status === 0 || err.status === 503)) return orig.login.apply(this, arguments);
      if (err && err.status === 429) { toast(err.message); return false; }
      // старый аккаунт, созданный до онлайн-входа: входим локально и тихо подключаем к друзьям
      if (local && !local.serverId && (!local.pass || local.pass === pass)) {
        const ok = orig.login.apply(this, arguments);
        if (ok) await linkCurrent(pass);
        return ok;
      }
      toast(local ? 'Неверный пароль, попробуй ещё раз' : 'Неверная почта, юзернейм или пароль');
      return false;
    };
  }

  if (typeof orig.logout === 'function') {
    // «Выйти» закрывает и онлайн-сессию: на чужом компьютере следующий человек не попадёт в аккаунт,
    // просто переключившись на этот профиль. Оценки профиля на устройстве остаются, вход — по паролю.
    window.logoutUser = function () {
      const localId = state.user && state.user.id;
      const tok = localId ? readTokens()[localId] : null;
      if (tok) { api('/logout', 'POST', {}, tok).catch(() => {}); setTokenFor(localId, null); }
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
    window.updateUserProfile = async function (username, email, password, avatar, color, handle, current) {
      if (!F.me || !state.user) return orig.update.apply(this, arguments);
      const nick = cleanNick(username);
      const pass = String(password || '').trim();
      const em = String(email || '').trim().toLowerCase();
      const nickChanged = nick !== state.user.name;
      const emailChanged = !!em && em !== (state.user.email || '').toLowerCase() && EMAIL_RE.test(em);
      const h = handle == null ? '' : String(handle).trim().replace(/^@+/, '').toLowerCase();
      const handleChanged = !!h && h !== (F.me.handle || '');
      if (handle != null && !HANDLE_RE.test(h)) { toast('Юзернейм: от 3 до 20 символов, латинские буквы, цифры, «_» и «.»'); return false; }
      if ((nickChanged || pass || emailChanged || handleChanged) && nick.length >= 2) {
        if (nickChanged && !NICK_RE.test(nick)) { toast('Ник: буквы, цифры, пробел, точка, дефис или подчёркивание, до 24 символов'); return false; }
        if (pass && pass.length < 8) { toast('Новый пароль: минимум 8 символов'); return false; }
        if ((pass || emailChanged) && !current) { toast('Чтобы сменить почту или пароль, впиши текущий пароль'); return false; }
        try {
          const r = await api('/account', 'PUT', { username: nickChanged ? nick : undefined, handle: handleChanged ? h : undefined, password: pass || undefined, email: emailChanged ? em : undefined, current: current || undefined });
          F.me = r.user;
        } catch (e) {
          toast(e.message);
          return false;
        }
      }
      const before = state.user.avatar;
      // почта берётся из аккаунта: пустое или неверное поле её не сбрасывает
      const ok = orig.update.call(this, nick, F.me.email || email, password, avatar, color, F.me.handle);
      if (state.user && state.user.pass) { delete state.user.pass; saveUsers(); }
      if (ok && pass) toast('Пароль сменён. На других устройствах нужно войти заново.');
      // сменили аватар здесь: он уходит в аккаунт, чтобы его видели другие устройства и друзья
      if (ok && state.user && state.user.avatar !== before && window.CasualAvatar) {
        window.CasualAvatar.apply(state.user.id, state.user.avatar, null);
        window.CasualAvatar.push(F.token, state.user.avatar);
      }
      return ok;
    };
  }

  // ---------- хуки рейтинга ----------
  if (typeof window.renderBoard === 'function') {
    const o = window.renderBoard;
    window.renderBoard = function () { const r = o.apply(this, arguments); try { afterBoard(); } catch (e) { console.error(e); } return r; };
  }
  if (typeof window.saveLocalRatings === 'function') {
    const o = window.saveLocalRatings;
    rawSave = o;
    window.saveLocalRatings = function () { const r = o.apply(this, arguments); schedulePush(); return r; };
  }
  // правка категорий здесь: новое время правки и отправка на сервер
  if (typeof window.saveLocalCats === 'function') {
    const o = window.saveLocalCats;
    rawSaveCats = o;
    window.saveLocalCats = function () {
      // категорию с тем же названием или id создали заново — значит, она снова нужна
      const tombs = catTombs();
      if (tombs.length && state.cats.some((c) => isTombed(c, tombs))) lsSet(CATS_DEL_KEY, JSON.stringify(tombs.filter((d) => !state.cats.some((c) => c.id === d.id || (d.name && keyOf(d.name) === keyOf(c.name))))));
      const r = o.apply(this, arguments); setCatsAt(Date.now()); schedulePush(); return r;
    };
  }
  if (typeof window.deleteCategory === 'function') {
    const o = window.deleteCategory;
    window.deleteCategory = async function (id) {
      const c = state.cats.find((x) => x.id === id);
      const tomb = c ? { id: c.id, name: c.name, at: Date.now() } : null;
      if (tomb) addCatTombs([tomb]); // до удаления: сохранение категорий не должно принять её за «созданную заново»
      const r = await o.apply(this, arguments);
      if (tomb && state.cats.some((x) => x.id === tomb.id)) lsSet(CATS_DEL_KEY, JSON.stringify(catTombs().filter((d) => d.id !== tomb.id))); // не удалилась
      return r;
    };
  }
  // удаление запоминаем, чтобы оценка пропала и на других устройствах
  if (typeof window.removeRating === 'function') {
    const o = window.removeRating;
    window.removeRating = function (id) {
      const r = state.ratings.find((x) => x.id === id);
      if (r && !r.example) {
        const list = readJSON(DELETED_KEY, []).filter((d) => d.id !== id);
        list.push({ id, at: Date.now() });
        lsSet(DELETED_KEY, JSON.stringify(list.slice(-2000)));
        const sent = readJSON(PHOTOS_KEY, {});
        if (sent[id]) { delete sent[id]; lsSet(PHOTOS_KEY, JSON.stringify(sent)); }
        const thumbs = readJSON(THUMBS_KEY, {});
        if (thumbs[id]) { delete thumbs[id]; lsSet(THUMBS_KEY, JSON.stringify(thumbs)); }
      }
      return o.apply(this, arguments);
    };
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
