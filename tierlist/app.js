/* Тир-листы Казуала: свои тир-листы из картинок, текста, оценок и стикеров, как на tiermaker.com.
   Списки лежат в localStorage, картинки — в IndexedDB; после входа всё синхронизируется с аккаунтом, и тир-листы видят друзья
   (вкладка «Друзья», реакции и комментарии — как у оценок в Мнении). У гостя тир-листы живут только в этом браузере.
   Перетаскивание — мышью, на телефоне — нажатиями: карточка, потом ряд.
   Адреса: без якоря — мои, #friends — друзья, #l=<id> — мой тир-лист, #f=<id друга>.<id> — тир-лист друга. */
(() => {
  const BASE_KEY = 'casualhub.tierlists.v1', SYNC_BASE = 'casualhub.tier.sync.v1', PREFS_KEY = 'ocenshik.prefs.v1', RATINGS_KEY = 'ocenshik.ratings.v2';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const COLORS = ['#43C97A', '#9BCF4E', '#F2BA44', '#F28E4C', '#F26A55', '#E85FA5', '#8C7BFF', '#5B9BF5', '#4CC9C0', '#9AA0AE'];
  const DEFAULT_ROWS = [['S', '#43C97A'], ['A', '#9BCF4E'], ['B', '#F2BA44'], ['C', '#F28E4C'], ['D', '#F26A55']];
  const LIMIT = { rows: 20, items: 500, title: 80, label: 40, name: 80, file: 20 * 1024 * 1024, json: 80 * 1024 * 1024 };
  const COLOR_RE = /^#[0-9a-f]{6}$/i, SRC_RE = /^\/wheel\/hub\/(?!.*\.\.)[\w\-/.]+\.(png|webp|gif|jpe?g)$/i, DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const ITEM_RE = /^(?!__proto__$|constructor$|prototype$)[\w.:-]{1,80}$/;
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const cards = (n) => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ---------- аккаунт ----------
  const user = read('ocenshik.user.v1');
  const token = user ? (read('casualhub.tokens.v1') || {})[user.id] || null : null;
  const me = user && token ? user.id : '';
  const KEY = user && user.id ? `${BASE_KEY}:${user.id}` : BASE_KEY; // у каждого аккаунта свои тир-листы, гостю чужие не видны
  async function api(path, method = 'GET', body) {
    let r;
    try {
      r = await fetch('/api' + path, { method, cache: 'no-store', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { const er = new Error('Нет связи с сервером.'); er.status = 0; throw er; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(d.error || 'Сервер не ответил.'); er.status = r.status; throw er; }
    return d;
  }

  // ---------- картинки ----------
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res) => {
    try {
      const rq = indexedDB.open('casualhub-tier', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('img');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  }));
  const idb = async (mode, fn) => {
    const d = await db();
    if (!d) return undefined;
    return new Promise((res) => {
      try {
        const t = d.transaction('img', mode), rq = fn(t.objectStore('img'));
        t.oncomplete = () => res(rq && 'result' in rq ? rq.result : true);
        t.onerror = t.onabort = () => res(undefined);
      } catch (e) { res(undefined); }
    });
  };
  const urls = new Map(); // ключ картинки → адрес для <img>
  async function putImg(blob, key) {
    const k = key || rid('ti_');
    const ok = await idb('readwrite', (st) => st.put(blob, k));
    urls.set(k, URL.createObjectURL(blob));
    if (!ok) throw new Error('store');
    return k;
  }
  async function loadUrls(keys) {
    await Promise.all(keys.filter((k) => !urls.has(k)).map(async (k) => {
      const b = await idb('readonly', (st) => st.get(k));
      if (b instanceof Blob) urls.set(k, URL.createObjectURL(b));
    }));
  }
  const dropImgs = (keys) => {
    if (!keys.length) return;
    idb('readwrite', (st) => { keys.forEach((k) => st.delete(k)); });
    keys.forEach((k) => { const u = urls.get(k); if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); urls.delete(k); delete sync.sent[k]; });
  };
  const loadImage = (src, cors) => new Promise((res, rej) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));
  // квадрат 240×240 по центру картинки: столько хватает и карточке, и картинке тир-листа
  async function squareBlob(source) {
    const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height, side = Math.min(w, h);
    if (!side) throw new Error('empty');
    const c = document.createElement('canvas');
    c.width = c.height = 240;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 240, 240);
    // Safari не умеет сохранять WebP и вернул бы PNG: для фото он слишком тяжёлый, а в аккаунт картинка едет как есть
    const webp = await toBlob(c, 'image/webp', 0.86);
    return webp && webp.type === 'image/webp' ? webp : toBlob(c, 'image/jpeg', 0.86);
  }
  function dataToBlob(data) {
    const [head, body] = data.split(',');
    const bin = atob(body), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: head.slice(5).split(';')[0] });
  }
  const blobToData = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

  // ---------- хранение ----------
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').trim().slice(0, n);
  function clean(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const items = {};
    for (const [id, it] of Object.entries(raw.items && typeof raw.items === 'object' ? raw.items : {}).slice(0, LIMIT.items)) {
      if (!it || typeof it !== 'object' || !ITEM_RE.test(id)) continue;
      const out = { id, name: str(it.name, LIMIT.name), kind: 'text' };
      if (it.kind === 'img' && typeof it.img === 'string' && /^ti_\w+$/.test(it.img)) { out.kind = 'img'; out.img = it.img; }
      else if (it.kind === 'url' && SRC_RE.test(String(it.src))) { out.kind = 'url'; out.src = String(it.src); }
      else if (!out.name) continue;
      items[id] = out;
    }
    const seen = new Set();
    const own = (arr) => (Array.isArray(arr) ? arr : []).filter((id) => typeof id === 'string' && has(items, id) && !seen.has(id) && seen.add(id));
    let rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, LIMIT.rows).filter((r) => r && typeof r === 'object').map((r) => ({
      id: typeof r.id === 'string' && /^\w{1,40}$/.test(r.id) ? r.id : rid('r'),
      label: str(r.label, LIMIT.label),
      color: COLOR_RE.test(String(r.color)) ? String(r.color) : COLORS[COLORS.length - 1],
      items: own(r.items),
    }));
    if (!rows.length) rows = DEFAULT_ROWS.map(([label, color]) => ({ id: rid('r'), label, color, items: [] }));
    const pool = own(raw.pool);
    Object.keys(items).forEach((id) => { if (!seen.has(id)) { seen.add(id); pool.push(id); } });
    return {
      id: typeof raw.id === 'string' && /^\w{1,40}$/.test(raw.id) ? raw.id : rid('t'),
      title: str(raw.title, LIMIT.title), rows, pool, items, captions: !!raw.captions, private: !!raw.private, fav: !!raw.fav,
      at: Number.isFinite(+raw.at) && +raw.at > 0 ? +raw.at : Date.now(),
    };
  }
  const readLists = (k) => { const d = read(k); return (d && Array.isArray(d.lists) ? d.lists : []).map(clean).filter(Boolean); };
  let lists = readLists(KEY);
  // тир-листы, собранные до входа, переходят в аккаунт
  if (KEY !== BASE_KEY) {
    const guest = readLists(BASE_KEY);
    if (guest.length) {
      lists = [...guest.filter((g) => !lists.some((l) => l.id === g.id)), ...lists];
      try { localStorage.setItem(KEY, JSON.stringify({ lists })); localStorage.removeItem(BASE_KEY); } catch (e) {}
    }
  }
  let saveFailed = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ lists })); saveFailed = false; }
    catch (e) { if (!saveFailed) toast('Браузеру не хватило места: последние изменения могут не сохраниться.'); saveFailed = true; }
  }
  const touchList = (l) => { l.at = Math.max(Date.now(), l.at + 1); save(); scheduleSync(); };
  const newList = (title) => {
    const l = clean({ title: title || '', rows: [], items: {} });
    lists.unshift(l);
    touchList(l);
    return l;
  };

  // ---------- синхронизация с аккаунтом ----------
  // marks — версия каждого тир-листа, уже известная серверу; sent — картинки, которые на сервере уже есть; del — ждут удаления там
  const SYNC_KEY = `${SYNC_BASE}:${me}`;
  const sync = (() => { const d = me ? read(SYNC_KEY) : null; return { marks: (d && d.marks) || {}, sent: (d && d.sent) || {}, del: (d && Array.isArray(d.del) && d.del) || [] }; })();
  const keepSync = () => { if (!me) return; try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) {} };
  let syncTimer = 0, syncing = false, syncAgain = false, needPull = false, pulledOnce = !me, syncState = me ? 'ok' : 'guest', lastPull = 0, imgLimitShown = false, listLimitShown = false;
  const isBlank = (l) => !l.title && !Object.keys(l.items).length;
  function paintSync() {
    const n = $('#tlSync');
    if (!n) return;
    n.textContent = syncState === 'guest' ? 'Только в этом браузере' : syncState === 'off' ? 'Нет связи: сохранится позже' : syncState === 'busy' ? 'Сохраняю…' : 'Сохранено в аккаунте';
  }
  function scheduleSync(delay) {
    if (!me) return;
    clearTimeout(syncTimer);
    syncState = 'busy'; paintSync();
    syncTimer = setTimeout(() => runSync(false), delay == null ? 1500 : delay);
  }
  async function fetchImgs(uid, l) {
    const keys = Object.values(l.items).map((it) => it.img).filter(Boolean);
    await loadUrls(keys);
    const need = keys.filter((k) => !urls.has(k));
    for (let i = 0; i < need.length; i += 40) {
      const part = need.slice(i, i + 40);
      let images = {};
      try { images = (await api('/tierlist-imgs/' + encodeURIComponent(uid), 'POST', { keys: part })).images || {}; } catch (e) { continue; }
      for (const k of part) {
        const data = images[k];
        if (typeof data !== 'string' || !DATA_RE.test(data)) continue;
        if (uid === me) { try { await putImg(dataToBlob(data), k); sync.sent[k] = 1; } catch (e) {} } else urls.set(k, data);
      }
    }
  }
  async function pull() {
    const d = await api('/tierlists');
    let changed = false;
    for (const g of d.deleted || []) {
      const l = lists.find((x) => x.id === g.id);
      if (l && l.at <= g.at) {
        dropImgs(Object.values(l.items).map((it) => it.img).filter(Boolean));
        lists = lists.filter((x) => x !== l);
        changed = true;
      }
      delete sync.marks[g.id];
    }
    for (const it of d.items || []) {
      const l = lists.find((x) => x.id === it.id);
      if (l && it.at <= l.at) { if (it.at === l.at) sync.marks[it.id] = it.at; continue; }
      const r = await api(`/tierlist/${encodeURIComponent(me)}/${encodeURIComponent(it.id)}`);
      const fresh = clean(r.list);
      if (!fresh) continue;
      fresh.id = it.id; fresh.at = it.at;
      await fetchImgs(me, fresh);
      if (l) lists[lists.indexOf(l)] = fresh; else lists.push(fresh);
      if (S.list && S.list.id === fresh.id) { S.list = fresh; S.sel = ''; }
      sync.marks[it.id] = it.at;
      changed = true;
    }
    return changed;
  }
  async function push() {
    for (const g of [...sync.del]) {
      await api(`/tierlist/${encodeURIComponent(g.id)}?at=${g.at}`, 'DELETE');
      sync.del = sync.del.filter((x) => x !== g);
      delete sync.marks[g.id];
    }
    let changed = false;
    for (const l of [...lists]) {
      if (sync.marks[l.id] === l.at || isBlank(l)) continue; // пустой тир-лист никому не нужен, пока в нём ничего нет
      for (const it of Object.values(l.items)) {
        if (!it.img || sync.sent[it.img]) continue;
        const b = await idb('readonly', (st) => st.get(it.img));
        if (!(b instanceof Blob)) continue;
        try {
          await api('/tierlist-img/' + encodeURIComponent(it.img), 'PUT', { data: await blobToData(b) });
          sync.sent[it.img] = 1;
        } catch (e) {
          if (e.status === 413) { if (!imgLimitShown) { imgLimitShown = true; toast(e.message); } continue; }
          throw e;
        }
      }
      const sentAt = l.at;
      let r;
      try { r = await api('/tierlist/' + encodeURIComponent(l.id), 'PUT', { list: l }); }
      catch (e) {
        // этот тир-лист сервер не примет и в следующий раз, но остальные это задерживать не должно
        if (e.status === 413 || e.status === 400) { if (!listLimitShown) { listLimitShown = true; toast(e.message); } continue; }
        throw e;
      }
      if (r.stale && r.gone) { dropImgs(Object.values(l.items).map((it) => it.img).filter(Boolean)); lists = lists.filter((x) => x !== l); if (S.list === l) S.list = null; delete sync.marks[l.id]; changed = true; }
      else if (r.stale) needPull = true; // на другом устройстве новее: заберём при следующем проходе
      else { sync.marks[l.id] = r.at; if (l.at === sentAt && r.at !== sentAt) { l.at = r.at; save(); } }
      keepSync();
    }
    return changed;
  }
  async function runSync(full) {
    if (!me) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    let changed = false, ok = true, status = 0;
    const firstPull = full && !pulledOnce;
    try {
      if (full) { lastPull = Date.now(); changed = await pull(); pulledOnce = true; }
      if (await push()) changed = true;
      // пока шла отправка, тир-лист поправили ещё раз или на сервере нашлась версия новее
      for (let i = 0; i < 3 && (syncAgain || needPull); i++) {
        const wantPull = needPull;
        syncAgain = false; needPull = false;
        if (wantPull && await pull()) changed = true;
        if (await push()) changed = true;
      }
    } catch (e) { ok = false; status = e.status; }
    syncing = false;
    keepSync();
    if (changed) save();
    if ((changed || (firstPull && S.built === 'wait')) && !drag && !dlg) route();
    syncState = ok ? 'ok' : 'off';
    paintSync();
    // нет связи или лимит на загрузку: пробуем снова сами; вышедшему из аккаунта пробовать незачем
    if (!ok && status !== 401) { clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync(false), 60e3); }
  }

  // ---------- мелочи интерфейса ----------
  let toastTimer = 0;
  function toast(text, act) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.toggle('has-act', !!act);
    if (act) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = act.label;
      b.addEventListener('click', () => { t.classList.remove('show'); act.fn(); });
      t.appendChild(b);
    }
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), act ? 6000 : 3400);
  }
  let dlg = null, dlgBack = null;
  function dialog(title, body, wide) {
    closeDialog();
    dlgBack = document.activeElement;
    dlg = document.createElement('div');
    dlg.className = 'sheet';
    dlg.innerHTML = `<div class="sheet-card${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="tlDlgT"><div class="tl-head"><h2 id="tlDlgT">${esc(title)}</h2><button type="button" class="mini-btn" data-dlg="close" aria-label="Закрыть">✕</button></div><div class="tl-body">${body}</div></div>`;
    document.body.appendChild(dlg);
    document.documentElement.style.overflow = 'hidden';
    const box = dlg;
    box.addEventListener('pointerdown', (e) => { if (e.target === box) box.dataset.down = '1'; });
    box.addEventListener('click', (e) => {
      if ((e.target === box && box.dataset.down) || e.target.closest('[data-dlg="close"]')) closeDialog();
      delete box.dataset.down;
    });
    const f = box.querySelector('[data-focus]') || box.querySelector('button');
    if (f) f.focus({ preventScroll: true });
    return box;
  }
  function closeDialog() {
    if (!dlg) return;
    dlg.remove();
    dlg = null;
    document.documentElement.style.overflow = '';
    if (dlgBack && dlgBack.isConnected) dlgBack.focus({ preventScroll: true });
  }

  // ---------- состояние страницы ----------
  const view = $('#view');
  const S = { list: null, friend: null, sel: '', pop: '', dropped: '', armed: '', tab: 'mine', who: '', feed: null, feedAt: 0, built: '', q: '', sort: 'new', shares: null };
  let drag = null, justDragged = false;
  const fmtDate = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const allItems = (l) => [...l.rows.flatMap((r) => r.items), ...l.pool];
  const whereIs = (l, id) => { const r = l.rows.find((x) => x.items.includes(id)); return r ? r.items : l.pool; };
  const imgOf = (it) => (it.kind === 'img' ? urls.get(it.img) || '' : it.kind === 'url' ? it.src : '');
  const open = (id) => { location.hash = 'l=' + id; };

  // ---------- главная раздела ----------
  function homeShell() {
    if (S.built === 'home') return;
    S.built = 'home';
    document.body.classList.remove('tl-editing');
    view.innerHTML = `<div class="layout">
      <section class="card" aria-label="Новый тир-лист">
        <div class="card-head"><h2 class="eyebrow"><span class="dot" aria-hidden="true"></span>Новый тир-лист</h2></div>
        <div class="tl-start-list">
          <button type="button" class="tl-go" data-new="empty"><span class="tl-go-i" aria-hidden="true">＋</span><b>С нуля</b><small>Загрузи свои картинки или впиши текст</small></button>
          <button type="button" class="tl-go" data-new="ratings"><span class="tl-go-i" aria-hidden="true">📊</span><b>Из моих оценок</b><small>Игры, фильмы, что угодно из Мнения</small></button>
          <button type="button" class="tl-go" data-new="stickers"><span class="tl-go-i" aria-hidden="true">😎</span><b>Из стикеров</b><small>Папич, roflan, arthas и Twitch</small></button>
          <button type="button" class="tl-go" data-new="file"><span class="tl-go-i" aria-hidden="true">📂</span><b>Из файла</b><small>Тир-лист, скачанный кнопкой «Файл»</small></button>
        </div>
        ${me ? '<p class="tl-note">Тир-листы хранятся в аккаунте, есть на всех твоих устройствах и видны друзьям. Скрыть тир-лист от друзей можно галочкой внутри него.</p>'
          : '<div class="tl-guest"><span>Сейчас тир-листы только в этом браузере. Войди, и они появятся на всех твоих устройствах, а друзья смогут их смотреть.</span><a class="btn small primary" href="/opinion/#login">Войти</a></div>'}
        <input type="file" id="tlFile" accept=".json,application/json" hidden>
      </section>
      <section class="card" aria-label="Тир-листы">
        <div class="views" role="tablist" aria-label="Чьи тир-листы">
          <button type="button" class="view-tab" role="tab" data-tab="mine" aria-selected="false">Мои</button>
          <button type="button" class="view-tab" role="tab" data-tab="friends" aria-selected="false">Друзья</button>
          <button type="button" class="view-tab" role="tab" data-tab="fav" aria-selected="false">★ Избранное</button>
        </div>
        <div class="tl-find">
          <input id="tlQ" type="search" maxlength="80" autocomplete="off" placeholder="Поиск по названию, рядам и карточкам" aria-label="Поиск тир-листов" value="${esc(S.q)}">
          <div class="seg" role="group" aria-label="Сортировка"><button type="button" data-sort="new" aria-pressed="${S.sort === 'new'}">Новые</button><button type="button" data-sort="name" aria-pressed="${S.sort === 'name'}">А–Я</button></div>
        </div>
        <div id="tlPanel" role="tabpanel"></div>
      </section>
    </div>`;
  }
  function renderTabs() {
    view.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  }
  function miniThumb(it, uid) {
    if (!it) return '';
    const src = it.src || (it.img && urls.get(it.img)) || '';
    if (src) return `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`;
    return `<span${it.img ? ` data-fi="${esc(it.img)}" data-fu="${esc(uid || '')}"` : ''}>${esc([...String(it.name || '')][0] || '?')}</span>`;
  }
  const lower = (v) => String(v || '').toLowerCase();
  const inQuery = (...texts) => { const q = lower(S.q.trim()); return !q || texts.some((x) => lower(x).includes(q)); };
  const bySort = (arr, name, at) => [...arr].sort((a, b) => (S.sort === 'name' ? name(a).localeCompare(name(b), 'ru') : at(b) - at(a)));
  const renderPanel = () => (S.tab === 'friends' ? (S.feed && S.feed.items && S.feed.friends ? paintFriends() : renderFriendsTab()) : renderMine());
  async function renderMine() {
    await loadUrls(lists.flatMap((l) => allItems(l).slice(0, 40).map((id) => l.items[id].img).filter(Boolean)));
    const box = $('#tlPanel');
    if (!box || S.tab === 'friends') return;
    const pool = S.tab === 'fav' ? lists.filter((l) => l.fav) : lists;
    const found = pool.filter((l) => inQuery(l.title, ...l.rows.map((r) => r.label), ...Object.values(l.items).map((it) => it.name)));
    const n = found.length;
    const none = pool.length ? 'Ничего не нашлось.' : S.tab === 'fav' ? 'Нажми ★ у тир-листа, и он появится здесь.' : 'Пока пусто. Начни с любого варианта рядом: тир-лист сохранится сам.';
    box.innerHTML = n ? `<p class="tl-stat"><b>${n}</b> ${plural(n, 'тир-лист', 'тир-листа', 'тир-листов')}</p><div class="tl-grid">${bySort(found, (l) => l.title || 'Без названия', (l) => l.at).map((l, k) => {
      const c = Object.keys(l.items).length;
      return `<div class="tl-cell"><button type="button" class="tl-star" data-fav="${esc(l.id)}" aria-pressed="${l.fav}" aria-label="${l.fav ? 'Убрать из избранного' : 'В избранное'}" title="${l.fav ? 'Убрать из избранного' : 'В избранное'}">★</button><a class="tl-tile" href="#l=${esc(l.id)}" style="--k:${Math.min(k, 8)}"><span class="tl-mini" aria-hidden="true">${l.rows.slice(0, 5).map((r) => `<span class="tl-mini-r"><i style="background:${esc(r.color)}"></i><span>${r.items.slice(0, 7).map((id) => miniThumb(l.items[id])).join('')}</span></span>`).join('')}</span><b>${esc(l.title || 'Без названия')}</b><small>${cards(c)} · ${esc(fmtDate(l.at))}${l.private ? ' · скрыт от друзей' : ''}</small></a></div>`;
    }).join('')}</div>` : `<p class="tl-empty">${none}</p>`;
  }
  async function renderFriendsTab() {
    const box = $('#tlPanel');
    if (!box) return;
    if (!me) { box.innerHTML = '<p class="tl-empty">Тир-листы друзей видны после входа в аккаунт.</p>'; return; }
    if (!S.feed) box.innerHTML = '<p class="tl-empty">Загружаю…</p>';
    if (!S.feed || Date.now() - S.feedAt > 30e3) {
      try { S.feed = await api('/tierlists-feed'); S.feed.items = (S.feed.items || []).filter((x) => x.title || +x.count > 0); S.feedAt = Date.now(); }
      catch (e) { if (!S.feed) { if (S.tab === 'friends' && $('#tlPanel')) $('#tlPanel').innerHTML = `<p class="tl-empty">${esc(e.message)}</p>`; return; } }
    }
    if (S.tab !== 'friends' || !$('#tlPanel')) return;
    paintFriends();
  }
  function paintFriends() {
    const box = $('#tlPanel'), feed = S.feed;
    if (!feed.friends) { box.innerHTML = '<div class="tl-empty"><p>Пока нет друзей. Добавь их, и здесь появятся их тир-листы.</p><p class="tl-mt"><a class="btn small primary" href="/opinion/#friends">Добавить друзей</a></p></div>'; return; }
    if (!feed.items.length) { box.innerHTML = '<p class="tl-empty">Друзья пока не собрали ни одного тир-листа.</p>'; return; }
    const people = [...new Map(feed.items.map((x) => [x.user.id, x.user])).values()];
    if (S.who && !people.some((p) => p.id === S.who)) S.who = '';
    const shown = bySort(feed.items.filter((x) => (!S.who || x.user.id === S.who) && inQuery(x.title, x.user.username)), (x) => x.title || 'Без названия', (x) => x.at);
    box.innerHTML = `<p class="tl-stat"><b>${shown.length}</b> ${plural(shown.length, 'тир-лист', 'тир-листа', 'тир-листов')}</p>
      ${people.length > 1 ? `<div class="tl-chips tl-mt"><button type="button" class="tl-chip" data-who="" aria-pressed="${!S.who}">Все</button>${people.map((p) => `<button type="button" class="tl-chip" data-who="${esc(p.id)}" aria-pressed="${S.who === p.id}">${esc(p.username)}</button>`).join('')}</div>` : ''}
      ${shown.length ? '' : '<p class="tl-empty">Ничего не нашлось.</p>'}<div class="tl-grid">${shown.map((x, k) => `<a class="tl-tile" href="#f=${esc(x.user.id)}.${esc(x.id)}" style="--k:${Math.min(k, 8)}"><span class="tl-mini" aria-hidden="true">${(x.rows || []).slice(0, 5).map((r) => `<span class="tl-mini-r"><i style="background:${COLOR_RE.test(r.color) ? r.color : '#9AA0AE'}"></i><span>${(r.items || []).map((it) => miniThumb(it, x.user.id)).join('')}</span></span>`).join('')}</span><b>${esc(x.title || 'Без названия')}</b><small>${esc(x.user.username)} · ${cards(+x.count || 0)} · ${esc(fmtDate(x.at))}</small></a>`).join('')}</div>`;
    hydrateMini(box);
  }
  // картинки в карточках списка друзей подгружаются пачками, по человеку
  async function hydrateMini(box) {
    const byUser = new Map();
    box.querySelectorAll('[data-fi]').forEach((n) => { const u = n.dataset.fu; if (!byUser.has(u)) byUser.set(u, new Set()); byUser.get(u).add(n.dataset.fi); });
    for (const [uid, keys] of byUser) {
      const list = [...keys].filter((k) => !urls.has(k));
      for (let i = 0; i < list.length; i += 40) {
        try {
          const { images } = await api('/tierlist-imgs/' + encodeURIComponent(uid), 'POST', { keys: list.slice(i, i + 40) });
          Object.entries(images || {}).forEach(([k, d]) => { if (typeof d === 'string' && DATA_RE.test(d)) urls.set(k, d); });
        } catch (e) { break; }
      }
      box.querySelectorAll(`[data-fu="${CSS.escape(uid)}"]`).forEach((n) => {
        const src = urls.get(n.dataset.fi);
        if (!src) return;
        const im = new Image(); im.alt = ''; im.src = src;
        n.replaceWith(im);
      });
    }
  }

  // ---------- карточки и ряды ----------
  function cardHTML(l, id, readOnly) {
    const it = l.items[id], src = imgOf(it), sel = S.sel === id, just = S.pop === id;
    const cap = l.captions && it.name && it.kind !== 'text' ? `<small>${esc(it.name)}</small>` : '';
    const face = src ? `<img src="${esc(src)}" alt="" draggable="false" decoding="async">` : `<span class="tl-txt">${esc(it.name || '?')}</span>`;
    if (readOnly) return `<div class="tl-it" title="${esc(it.name)}"><span class="tl-card"><span class="tl-face">${face}</span>${cap}</span></div>`;
    return `<div class="tl-it${sel ? ' sel' : ''}${just ? ' pop' : ''}" data-id="${esc(id)}"><button type="button" class="tl-card" aria-pressed="${sel}" title="${esc(it.name)}" aria-label="${esc(it.name || 'Картинка')}"><span class="tl-face">${face}</span>${cap}</button><button type="button" class="tl-x" aria-label="Удалить карточку" title="Удалить карточку">✕</button></div>`;
  }
  // подпись ряда читается на любом цвете
  function inkOn(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#0D0F14' : '#FFFFFF';
  }
  const labClass = (s) => ([...s].length > 12 ? ' long' : [...s].length > 4 ? ' mid' : '');
  function rowsHTML(l, readOnly) {
    return l.rows.map((r, k) => {
      const style = `background:${esc(r.color)};color:${inkOn(r.color)}`;
      const lab = readOnly ? `<div class="tl-lab${labClass(r.label)}" style="${style}">${esc(r.label) || '&nbsp;'}</div>`
        : `<button type="button" class="tl-lab${labClass(r.label)}" data-edit="${esc(r.id)}" style="${style}" title="Настроить ряд">${esc(r.label) || '&nbsp;'}</button>`;
      const empty = readOnly ? '' : `<span class="tl-drop">${touch ? 'пусто' : 'перетащи сюда'}</span>`;
      return `<div class="tl-row" ${readOnly ? '' : `data-row="${esc(r.id)}"`} style="--k:${Math.min(k, 8)}">${lab}<div class="tl-items">${r.items.map((id) => cardHTML(l, id, readOnly)).join('') || empty}</div></div>`;
    }).join('');
  }

  // где сейчас карточки: после перерисовки они поедут отсюда на новые места
  function cardSpots() {
    const spots = new Map();
    if (reduced) return spots;
    view.querySelectorAll('.tl-it[data-id]').forEach((el) => {
      const row = el.closest('[data-row]');
      spots.set(el.dataset.id, { rect: el.getBoundingClientRect(), row: row ? row.dataset.row : '' });
    });
    return spots;
  }
  function flyCards(before) {
    if (!before.size || drag) return;
    view.querySelectorAll('.tl-it[data-id]').forEach((el) => {
      const id = el.dataset.id, was = before.get(id);
      if (!was || id === S.dropped) return;
      const r = el.getBoundingClientRect();
      const dx = was.rect.left - r.left, dy = was.rect.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const row = el.closest('[data-row]');
      if (!row || row.dataset.row === was.row) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2, .8, .2, 1)' });
        return;
      }
      // в другой ряд: ряды обрезают содержимое по краям, поэтому летит копия поверх страницы
      el.classList.remove('pop');
      const ghost = el.cloneNode(true);
      ghost.classList.add('tl-ghost', 'tl-fly');
      ghost.style.left = r.left + 'px';
      ghost.style.top = r.top + 'px';
      document.body.appendChild(ghost);
      el.style.visibility = 'hidden';
      ghost.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(1.04) rotate(-3deg)` },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: 460, easing: 'cubic-bezier(.34, 1.3, .64, 1)' });
      setTimeout(() => { ghost.remove(); el.style.visibility = ''; }, 460);
    });
    S.dropped = '';
  }
  function boardIntro(el) {
    if (!el) return;
    el.classList.add('intro');
    setTimeout(() => el.classList.remove('intro'), 1100);
  }

  // ---------- редактор ----------
  // ссылка на тир-лист: кому её дашь, тот увидит его и без аккаунта
  const shareOf = (l) => (S.shares && l ? S.shares.get('t.' + l.id) : '');
  function paintShare() {
    const a = $('#tlLink'), b = $('#tlUnlink');
    if (!a || !S.list) return;
    const has = shareOf(S.list);
    a.textContent = has ? '🔗 Скопировать ссылку' : '🔗 Ссылка';
    a.title = 'Ссылка, по которой тир-лист видно без аккаунта';
    b.hidden = !has;
  }
  async function loadShares() {
    if (!me || S.shares) return;
    S.shares = new Map();
    try { ((await api('/shares')).items || []).forEach((x) => S.shares.set(x.rid, x.id)); }
    catch (e) { S.shares = null; return; }
    paintShare();
  }
  async function shareList(l, b) {
    if (!allItems(l).length) { toast('Сначала добавь карточки.'); return; }
    b.disabled = true;
    try {
      await loadShares();
      if (!S.shares) throw new Error('Нет связи, попробуй ещё раз.');
      let id = shareOf(l);
      if (!id) {
        // тир-лист сначала должен дойти до сервера
        clearTimeout(syncTimer);
        await runSync(false);
        id = (await api('/tierlist-share', 'POST', { id: l.id })).id;
        S.shares.set('t.' + l.id, id);
      }
      paintShare();
      const url = location.origin + '/r/' + id;
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована. Её увидит любой, кому ты её дашь.'); }
      catch (e) { toast(url); }
    } catch (e) { toast(e.message); } finally { b.disabled = false; }
  }
  async function unshareList(l, b) {
    const id = shareOf(l);
    if (!id) return;
    b.disabled = true;
    try {
      await api('/share/' + encodeURIComponent(id), 'DELETE');
      S.shares.delete('t.' + l.id);
      paintShare();
      toast('Ссылка закрыта: по ней тир-лист больше не откроется.');
    } catch (e) { toast(e.message); } finally { b.disabled = false; }
  }
  function renderEditor() {
    const l = S.list;
    if (S.built !== 'edit:' + l.id) {
      S.built = 'edit:' + l.id;
      document.body.classList.add('tl-editing');
      view.innerHTML = `<div class="tl-editor">
        <section class="card tl-bar">
          <div class="tl-bar-top">
            <a class="btn small ghost" href="#">‹ Все тир-листы</a>
            <label class="vh" for="tlTitle">Название тир-листа</label>
            <input class="tl-title" id="tlTitle" maxlength="${LIMIT.title}" placeholder="Название, например «Лучшие игры»" autocomplete="off">
            <button type="button" class="tl-star on-bar" id="tlFav" data-do="fav" aria-pressed="false">★</button>
          </div>
          <div class="tl-tools">
            <span class="tl-group"><button type="button" class="btn small primary" data-do="add-img">＋ Картинки</button><button type="button" class="btn small ghost" data-do="add-text">＋ Текст</button><button type="button" class="btn small ghost" data-do="add-ratings">Из оценок</button><button type="button" class="btn small ghost" data-do="add-stickers">Стикеры</button></span>
            <span class="tl-group"><button type="button" class="btn small ghost" data-do="png">Скачать PNG</button><button type="button" class="btn small ghost" data-do="copy">Скопировать картинку</button>${me ? '<button type="button" class="btn small ghost" id="tlLink" data-do="share">🔗 Ссылка</button><button type="button" class="btn small text" id="tlUnlink" data-do="unshare" hidden>Закрыть ссылку</button>' : ''}<button type="button" class="btn small ghost" data-do="file">Файл</button><button type="button" class="btn small ghost" data-do="clear">Всё убрать</button><button type="button" class="btn small danger" data-do="delete">Удалить</button></span>
          </div>
          <div class="tl-tools">
            <span class="tl-group"><label class="tl-check"><input type="checkbox" id="tlCaps"> Подписи</label>${me ? '<label class="tl-check"><input type="checkbox" id="tlShare"> Видно друзьям</label>' : ''}</span>
            <span class="tl-sync" id="tlSync" aria-live="polite"></span>
          </div>
          <p class="tl-hint" id="tlHint" aria-live="polite"></p>
          <input type="file" id="tlImgs" accept="image/*" multiple hidden>
        </section>
        <div class="tl-board" id="tlBoard"></div>
        <div class="tl-dock" id="tlDock"></div>
        ${me ? '<section class="card tl-social" id="tlSocial"><div class="rx" id="tlRx"></div><div id="tlComments"></div></section>' : ''}
      </div>`;
      window.scrollTo(0, 0);
      boardIntro($('#tlBoard'));
      if (me) { mountSocial(me, l.id, true); loadShares(); }
    }
    const before = cardSpots();
    const title = $('#tlTitle');
    if (document.activeElement !== title) title.value = l.title;
    $('#tlCaps').checked = l.captions;
    { const fv = $('#tlFav'), tip = l.fav ? 'Убрать из избранного' : 'В избранное'; fv.setAttribute('aria-pressed', String(l.fav)); fv.title = tip; fv.setAttribute('aria-label', tip); }
    paintShare();
    const share = $('#tlShare');
    if (share) share.checked = !l.private;
    paintSync();
    $('#tlHint').textContent = S.sel
      ? (touch ? 'Теперь нажми на ряд или на карточку, перед которой поставить.' : 'Теперь нажми на ряд или на карточку, перед которой поставить. Стрелки двигают, Delete удаляет карточку.')
      : (touch ? 'Нажми на карточку, а потом на ряд. Крестик удаляет карточку, а название ряда меняется нажатием. Всё сохраняется само.' : 'Перетаскивай карточки по рядам. Картинки можно бросить прямо сюда или вставить через Ctrl+V. Крестик удаляет карточку, а название ряда меняется нажатием. Всё сохраняется само.');
    $('#tlBoard').innerHTML = rowsHTML(l, false)
      + (l.rows.length < LIMIT.rows ? '<button type="button" class="btn small text tl-addrow" data-do="add-row">＋ Ряд</button>' : '');
    const n = l.pool.length;
    const poolScroll = (() => { const p = $('#tlDock .tl-items'); return p ? p.scrollTop : 0; })();
    const selBar = S.sel ? '<span class="tl-selbar"><button type="button" class="btn small ghost" data-do="sel-pool">Убрать из ряда</button></span>' : '';
    $('#tlDock').innerHTML = `<div class="tl-row tl-pool" data-row=""><div class="tl-pool-h"><span>Без места · ${n}</span>${selBar}</div><div class="tl-items">${l.pool.map((id) => cardHTML(l, id)).join('') || `<span class="tl-drop">${Object.keys(l.items).length ? 'Всё разложено 👌' : 'Добавь карточки кнопками наверху'}</span>`}</div></div>`;
    { const p = $('#tlDock .tl-items'); if (p) p.scrollTop = poolScroll; }
    flyCards(before);
    S.pop = '';
    if (S.sel && !touch) { const b = view.querySelector(`.tl-it[data-id="${CSS.escape(S.sel)}"] .tl-card`); if (b) b.focus({ preventScroll: true }); }
  }
  function moveTo(id, rowId, beforeId, after) {
    const l = S.list;
    const from = whereIs(l, id);
    from.splice(from.indexOf(id), 1);
    const row = rowId ? l.rows.find((r) => r.id === rowId) : null;
    const to = row ? row.items : l.pool;
    let pos = beforeId ? to.indexOf(beforeId) : -1;
    if (pos >= 0 && after) pos += 1;
    if (pos >= 0) to.splice(pos, 0, id); else to.push(id);
    S.pop = id;
    touchList(l);
  }
  function removeItems(ids) {
    const l = S.list, imgs = [];
    ids.forEach((id) => {
      const it = l.items[id];
      if (!it) return;
      const from = whereIs(l, id);
      from.splice(from.indexOf(id), 1);
      if (it.img) imgs.push(it.img);
      delete l.items[id];
    });
    dropImgs(imgs);
    touchList(l);
  }
  // крестик: карточка уходит сразу, но несколько секунд её можно вернуть (картинка стирается только потом)
  function removeWithUndo(id) {
    const l = S.list, it = l.items[id];
    if (!it) return;
    const from = whereIs(l, id), at = from.indexOf(id);
    const row = l.rows.find((r) => r.items === from);
    from.splice(at, 1);
    delete l.items[id];
    if (it.img) delete sync.sent[it.img]; // сервер сотрёт её вместе с карточкой: вернули — отправим заново
    if (S.sel === id) S.sel = '';
    touchList(l);
    renderEditor();
    const timer = setTimeout(() => { if (it.img) dropImgs([it.img]); }, 6500);
    toast(`Карточка «${it.name || 'без названия'}» удалена.`, { label: 'Вернуть', fn: () => {
      clearTimeout(timer);
      l.items[id] = it;
      const back = row && l.rows.includes(row) ? row.items : l.pool;
      back.splice(Math.min(at, back.length), 0, id);
      S.pop = id;
      touchList(l);
      if (S.list === l) renderEditor();
    } });
  }
  function addItem(l, it) {
    if (Object.keys(l.items).length >= LIMIT.items) return false;
    l.items[it.id] = it;
    l.pool.push(it.id);
    return true;
  }

  // ---------- добавление карточек ----------
  async function addFiles(files) {
    const l = S.list;
    const good = [...files].filter((f) => /^image\//.test(f.type) && f.size <= LIMIT.file);
    const skipped = files.length - good.length;
    if (!good.length) { toast(skipped ? 'Подходят только картинки до 20 МБ.' : 'В этом нет картинок.'); return; }
    toast(`Добавляю: ${good.length}…`);
    let added = 0, failed = 0;
    for (const f of good) {
      if (Object.keys(l.items).length >= LIMIT.items) { failed += 1; continue; }
      const url = URL.createObjectURL(f);
      try {
        const im = await loadImage(url);
        const key = await putImg(await squareBlob(im));
        addItem(l, { id: rid('i'), kind: 'img', img: key, name: str(f.name.replace(/\.[^.]+$/, ''), LIMIT.name) });
        added += 1;
      } catch (e) { failed += 1; } finally { URL.revokeObjectURL(url); }
    }
    touchList(l);
    if (S.list === l) renderEditor();
    if (failed || skipped) toast(`Добавлено: ${added}, не получилось: ${failed + skipped}.`);
    else toast(`Добавлено: ${cards(added)}.`);
  }
  function addTextDialog() {
    const d = dialog('Карточки с текстом', `<label class="label" for="tlLines">Каждая строка станет карточкой</label>
      <textarea class="tl-area" id="tlLines" rows="7" maxlength="6000" data-focus placeholder="Дота 2&#10;Hollow Knight&#10;Шаурма у метро"></textarea>
      <div class="tl-foot"><button type="button" class="btn small primary" data-add>Добавить</button></div>`);
    d.querySelector('[data-add]').addEventListener('click', () => {
      const l = S.list;
      const lines = d.querySelector('#tlLines').value.split('\n').map((s) => str(s, LIMIT.name)).filter(Boolean);
      if (!lines.length) { d.querySelector('#tlLines').focus(); return; }
      let n = 0;
      lines.forEach((name) => { if (addItem(l, { id: rid('x'), kind: 'text', name })) n += 1; });
      touchList(l);
      closeDialog();
      renderEditor();
      toast(`Добавлено: ${cards(n)}.`);
    });
  }
  // оценки из Мнения этого браузера: обложка копируется в тир-лист, дальше он от оценки не зависит
  function readRatings() {
    const a = read(RATINGS_KEY);
    return (Array.isArray(a) ? a : []).filter((r) => r && r.id && r.name && !/^ex-/.test(String(r.id)));
  }
  const catOf = (r) => String(r.catLabel || r.catName || 'Без категории');
  const ratingItemId = (r) => 'r_' + String(r.id).replace(/[^\w.:-]/g, '').slice(0, 70);
  // обложка оценки: в этом браузере, в аккаунте или по ссылке (чужой сайт — через наш сервер, браузеру нельзя)
  async function ratingCover(r, stored) {
    const p = r.photo || {};
    let src = stored[p.ref] || (typeof p.data === 'string' && p.data) || (typeof p.id === 'string' && /^data:image\//.test(p.id) ? p.id : '');
    if (!src && me && p.remote) { try { src = (await api(`/photo/${encodeURIComponent(me)}/${encodeURIComponent(r.id)}`)).data || ''; } catch (e) {} }
    if (!src && typeof p.url === 'string' && /^https:\/\//.test(p.url) && me) { try { src = (await api('/fetch-img?u=' + encodeURIComponent(p.url))).data || ''; } catch (e) {} }
    src = String(src).split('#')[0];
    if (!/^data:image\//.test(src)) return '';
    return putImg(await squareBlob(await loadImage(src)));
  }
  async function addRatingsDialog() {
    const l = S.list;
    let rs = readRatings();
    if (!rs.length && me) {
      try { rs = ((await api('/shelf/' + encodeURIComponent(me))).ratings || []).filter((r) => r && r.id && r.name); } catch (e) {}
    }
    if (S.list !== l) return;
    if (!rs.length) {
      dialog('Из моих оценок', '<p class="tl-empty">Пока нет оценок.</p><div class="tl-foot"><a class="btn small primary" href="/opinion/">Открыть Мнение</a></div>');
      return;
    }
    const cats = [...new Set(rs.map(catOf))];
    const picked = new Set(cats);
    const d = dialog('Из моих оценок', `<p class="label">Какие категории добавить</p><div class="tl-chips" id="tlCats">${cats.map((c) => `<button type="button" class="tl-chip" data-cat="${esc(c)}" aria-pressed="true">${esc(c)} <small>${rs.filter((r) => catOf(r) === c).length}</small></button>`).join('')}</div>
      <div class="tl-foot"><button type="button" class="btn small primary" data-add>Добавить</button></div>`);
    d.querySelector('#tlCats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      if (picked.has(b.dataset.cat)) picked.delete(b.dataset.cat); else picked.add(b.dataset.cat);
      b.setAttribute('aria-pressed', String(picked.has(b.dataset.cat)));
    });
    d.querySelector('[data-add]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const chosen = rs.filter((r) => picked.has(catOf(r)) && !has(l.items, ratingItemId(r)));
      const refs = chosen.map((r) => r.photo && r.photo.ref).filter(Boolean);
      let stored = {};
      if (refs.length && window.CasualPhotos) { try { stored = await window.CasualPhotos.getMany(refs); } catch (x) {} }
      let n = 0;
      for (const r of chosen) {
        const id = ratingItemId(r);
        let key = '';
        try { key = await ratingCover(r, stored); } catch (x) {}
        if (addItem(l, key ? { id, kind: 'img', img: key, name: str(r.name, LIMIT.name) } : { id, kind: 'text', name: str(r.name, LIMIT.name) })) n += 1;
      }
      touchList(l);
      closeDialog();
      renderEditor();
      toast(n ? `Добавлено: ${cards(n)}.` : 'Эти оценки уже в тир-листе.');
    });
  }
  let stickers = null;
  async function addStickersDialog() {
    const l = S.list;
    const d = dialog('Стикеры', '<p class="tl-empty">Загружаю…</p>', true);
    const body = d.querySelector('.tl-body');
    try {
      stickers = stickers || await fetch('/wheel/hub/index.json').then((r) => r.json());
    } catch (e) { body.innerHTML = '<p class="tl-empty">Не получилось загрузить стикеры, проверь интернет.</p>'; return; }
    if (dlg !== d) return;
    // анимированные .webm на картинку не лягут: только то, что можно нарисовать
    const groups = stickers.groups.map((g) => ({ id: g.id, title: g.title, items: g.items.filter((i) => /\.(png|webp|gif)$/i.test(i.src)) })).filter((g) => g.items.length);
    let cur = groups[0];
    const idOf = (i) => 's_' + i.id.replace(/[^\w.:-]/g, '');
    const paint = () => {
      body.innerHTML = `<div class="tl-chips">${groups.map((g) => `<button type="button" class="tl-chip" data-g="${esc(g.id)}" aria-pressed="${g === cur}">${esc(g.title)} <small>${g.items.length}</small></button>`).join('')}</div>
        <div class="tl-picks">${cur.items.map((i) => `<button type="button" class="tl-pick" data-s="${esc(i.id)}" aria-pressed="${has(l.items, idOf(i))}" title="${esc(i.name)}" aria-label="${esc(i.name)}"><img src="/wheel/${esc(i.src)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>
        <div class="tl-foot"><button type="button" class="btn small ghost" data-all>Добавить все из набора</button><button type="button" class="btn small primary" data-dlg="close">Готово</button></div>`;
    };
    paint();
    body.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]');
      if (g) { cur = groups.find((x) => x.id === g.dataset.g) || cur; paint(); return; }
      const item = (i) => ({ id: idOf(i), kind: 'url', src: '/wheel/' + i.src, name: str(i.name, LIMIT.name) });
      if (e.target.closest('[data-all]')) {
        cur.items.forEach((i) => { if (!has(l.items, idOf(i))) addItem(l, item(i)); });
        touchList(l); renderEditor(); paint();
        return;
      }
      const s = e.target.closest('[data-s]');
      if (!s) return;
      const i = cur.items.find((x) => x.id === s.dataset.s);
      if (!i) return;
      if (has(l.items, idOf(i))) removeItems([idOf(i)]); else { addItem(l, item(i)); touchList(l); }
      s.setAttribute('aria-pressed', String(has(l.items, idOf(i))));
      renderEditor();
    });
  }
  function rowDialog(rowId) {
    const l = S.list, r = l.rows.find((x) => x.id === rowId);
    if (!r) return;
    const pos = l.rows.indexOf(r);
    const d = dialog('Настроить ряд', `<label class="label" for="tlRowName">Название</label><input class="tl-input" id="tlRowName" maxlength="${LIMIT.label}" data-focus value="${esc(r.label)}" autocomplete="off">
      <p class="label">Цвет</p><div class="tl-swatches">${COLORS.map((c) => `<button type="button" class="tl-sw" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}" aria-pressed="${c.toLowerCase() === r.color.toLowerCase()}"></button>`).join('')}<label class="tl-sw tl-sw-own" title="Свой цвет"><span class="vh">Свой цвет</span><input type="color" id="tlRowColor" value="${esc(r.color)}"></label></div>
      <div class="tl-foot tl-spread"><span class="tl-group"><button type="button" class="btn small ghost" data-r="up"${pos === 0 ? ' disabled' : ''}>↑ Выше</button><button type="button" class="btn small ghost" data-r="down"${pos === l.rows.length - 1 ? ' disabled' : ''}>↓ Ниже</button><button type="button" class="btn small ghost" data-r="add"${l.rows.length >= LIMIT.rows ? ' disabled' : ''}>＋ Ряд ниже</button></span>
      <button type="button" class="btn small danger" data-r="del"${l.rows.length < 2 ? ' disabled' : ''}>Удалить ряд</button></div>`);
    const name = d.querySelector('#tlRowName');
    name.select();
    name.addEventListener('input', () => { r.label = str(name.value, LIMIT.label); touchList(l); renderEditor(); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeDialog(); } });
    const setColor = (c) => { r.color = c; touchList(l); renderEditor(); d.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color.toLowerCase() === c.toLowerCase()))); };
    d.querySelector('#tlRowColor').addEventListener('input', (e) => { if (COLOR_RE.test(e.target.value)) setColor(e.target.value); });
    d.querySelector('.tl-body').addEventListener('click', (e) => {
      const c = e.target.closest('[data-color]');
      if (c) { setColor(c.dataset.color); return; }
      const b = e.target.closest('[data-r]');
      if (!b || b.disabled) return;
      const i = l.rows.indexOf(r);
      if (b.dataset.r === 'up' || b.dataset.r === 'down') { const j = i + (b.dataset.r === 'up' ? -1 : 1); l.rows.splice(j, 0, l.rows.splice(i, 1)[0]); }
      if (b.dataset.r === 'add') l.rows.splice(i + 1, 0, { id: rid('r'), label: '', color: COLORS[COLORS.length - 1], items: [] });
      if (b.dataset.r === 'del') { l.pool.push(...r.items); l.rows.splice(i, 1); }
      touchList(l);
      closeDialog();
      renderEditor();
    });
  }

  // ---------- картинка тир-листа ----------
  const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  function wrap(g, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    for (let w of words) {
      while (g.measureText(w).width > maxW && w.length > 1) { // длинное слово без пробелов
        let k = w.length - 1;
        while (k > 1 && g.measureText(w.slice(0, k)).width > maxW) k -= 1;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, k));
        w = w.slice(k);
      }
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1,2}$/, '') + '…'; }
    return lines;
  }
  async function drawPicture(l) {
    try { await Promise.all([document.fonts.load('800 60px Handjet'), document.fonts.load('600 15px Onest')]); } catch (e) {}
    const W = 1280, PAD = 24, LAB = 132, T = 112, GAP = 6, CAP = l.captions ? 34 : 0, H_T = T + CAP;
    const perRow = Math.max(1, Math.floor((W - PAD * 2 - LAB - GAP * 2 + GAP) / (T + GAP)));
    const hasTitle = !!l.title;
    const rowsH = l.rows.map((r) => Math.max(T + GAP * 2, Math.ceil(Math.max(r.items.length, 1) / perRow) * (H_T + GAP) + GAP));
    const H = PAD + (hasTitle ? 72 : 0) + rowsH.reduce((a, b) => a + b + 6, 0) + 34;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#0D0F14'; g.fillRect(0, 0, W, H);
    let y = PAD;
    if (hasTitle) {
      g.fillStyle = '#F3F4F6'; g.font = '800 60px Handjet, Onest, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
      let t = l.title;
      while (g.measureText(t).width > W - PAD * 2 && t.length > 2) t = t.slice(0, -2);
      g.fillText(t === l.title ? t : t + '…', PAD, y + 26);
      y += 72;
    }
    const imgs = new Map();
    await Promise.all(l.rows.flatMap((r) => r.items).map(async (id) => {
      const src = imgOf(l.items[id]);
      if (src) { try { imgs.set(id, await loadImage(src)); } catch (e) {} }
    }));
    l.rows.forEach((r, k) => {
      const h = rowsH[k];
      g.save();
      rr(g, PAD, y, W - PAD * 2, h, 12); g.clip();
      g.fillStyle = '#181B22'; g.fillRect(PAD, y, W - PAD * 2, h);
      g.fillStyle = r.color; g.fillRect(PAD, y, LAB, h);
      g.fillStyle = inkOn(r.color); g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 54;
      g.font = `800 ${fs}px Handjet, Onest, sans-serif`;
      let lines = wrap(g, r.label, LAB - 16, 3);
      while (fs > 18 && (lines.some((s) => g.measureText(s).width > LAB - 16) || lines.length * fs > h - 8)) { fs -= 4; g.font = `800 ${fs}px Handjet, Onest, sans-serif`; lines = wrap(g, r.label, LAB - 16, 3); }
      lines.forEach((s, i) => g.fillText(s, PAD + LAB / 2, y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.02));
      r.items.forEach((id, i) => {
        const x0 = PAD + LAB + GAP + (i % perRow) * (T + GAP), y0 = y + GAP + Math.floor(i / perRow) * (H_T + GAP);
        const it = l.items[id], im = imgs.get(id);
        g.save();
        rr(g, x0, y0, T, T, 8); g.clip();
        g.fillStyle = '#252933'; g.fillRect(x0, y0, T, T);
        if (im) {
          const s = Math.min(T / im.naturalWidth, T / im.naturalHeight), w = im.naturalWidth * s, ih = im.naturalHeight * s;
          g.drawImage(im, x0 + (T - w) / 2, y0 + (T - ih) / 2, w, ih);
        } else {
          g.fillStyle = '#F3F4F6'; g.font = '600 15px Onest, sans-serif';
          const tl = wrap(g, it.name, T - 12, 5);
          tl.forEach((s, j) => g.fillText(s, x0 + T / 2, y0 + T / 2 + (j - (tl.length - 1) / 2) * 18));
        }
        g.restore();
        if (CAP && it.kind !== 'text' && it.name) {
          g.fillStyle = '#B9BDC8'; g.font = '500 12px Onest, sans-serif';
          wrap(g, it.name, T - 4, 2).forEach((s, j) => g.fillText(s, x0 + T / 2, y0 + T + 9 + j * 14));
        }
      });
      g.restore();
      y += h + 6;
    });
    g.fillStyle = '#6F7482'; g.font = '500 13px Onest, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText('casualhub.pages.dev', W - PAD, H - 18);
    return c;
  }
  const safeName = (l) => (l.title || 'tier-list').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 60) || 'tier-list';
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  async function pngOut(l, copy) {
    if (!l.rows.some((r) => r.items.length)) { toast('Сначала разложи карточки по рядам.'); return; }
    try {
      const c = await drawPicture(l);
      const blob = await toBlob(c, 'image/png');
      if (!blob) throw new Error('blob');
      if (copy && navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('Картинка скопирована, можно вставлять в чат.');
          return;
        } catch (e) {}
      }
      if (copy) toast('Браузер не дал скопировать картинку, поэтому она скачается файлом.');
      download(blob, safeName(l) + '.png');
    } catch (e) { toast('Не получилось сделать картинку, попробуй ещё раз.'); }
  }

  // ---------- файл ----------
  async function fileOut() {
    const l = S.list, images = {};
    for (const it of Object.values(l.items)) {
      if (!it.img) continue;
      const b = await idb('readonly', (st) => st.get(it.img));
      if (b instanceof Blob) images[it.img] = await blobToData(b);
    }
    download(new Blob([JSON.stringify({ casualhubTier: 1, list: l, images })], { type: 'application/json' }), safeName(l) + '.tier.json');
    toast('Файл скачан: открой его на другом устройстве через «Из файла».');
  }
  async function fileIn(file) {
    if (file.size > LIMIT.json) { toast('Файл слишком большой.'); return; }
    let d;
    try { d = JSON.parse(await file.text()); } catch (e) { toast('Это не файл тир-листа.'); return; }
    if (!d || d.casualhubTier !== 1) { toast('Это не файл тир-листа.'); return; }
    const l = clean({ ...d.list, id: rid('t'), at: Date.now() });
    if (!l) { toast('Это не файл тир-листа.'); return; }
    const images = d.images && typeof d.images === 'object' ? d.images : {};
    for (const it of Object.values(l.items)) {
      if (it.kind !== 'img') continue;
      const data = images[it.img];
      let key = '';
      if (typeof data === 'string' && DATA_RE.test(data)) { try { key = await putImg(dataToBlob(data)); } catch (e) {} }
      if (key) it.img = key;
      else { delete it.img; it.kind = 'text'; it.name = it.name || '?'; }
    }
    lists.unshift(l);
    touchList(l);
    open(l.id);
  }

  // ---------- тир-лист друга: только смотреть, реагировать и комментировать ----------
  async function renderFriendList(uid, id) {
    S.list = null; S.sel = '';
    S.built = 'friend:' + uid + '.' + id;
    document.body.classList.add('tl-editing');
    view.innerHTML = '<section class="card"><p class="tl-empty">Загружаю…</p></section>';
    window.scrollTo(0, 0);
    let d;
    try { d = await api(`/tierlist/${encodeURIComponent(uid)}/${encodeURIComponent(id)}`); }
    catch (e) {
      if (S.built !== 'friend:' + uid + '.' + id) return;
      view.innerHTML = `<section class="card"><p class="tl-empty">${esc(e.message)}</p><div class="tl-foot"><a class="btn small ghost" href="#friends">‹ Тир-листы друзей</a></div></section>`;
      return;
    }
    const l = clean(d.list);
    if (S.built !== 'friend:' + uid + '.' + id) return;
    if (!l) return;
    S.friend = { uid, id, list: l, user: d.user };
    const paint = () => {
      const n = Object.keys(l.items).length;
      view.innerHTML = `<div class="tl-editor tl-view">
        <section class="card tl-bar">
          <div class="tl-bar-top"><a class="btn small ghost" href="#friends">‹ Тир-листы друзей</a><h2 class="tl-view-title">${esc(l.title || 'Без названия')}</h2></div>
          <p class="tl-who"><a href="/profile/?id=${encodeURIComponent(uid)}">${esc(d.user.username)}</a><span>@${esc(d.user.handle)}</span><span>${cards(n)} · ${esc(fmtDate(l.at))}</span></p>
          <div class="tl-tools"><span class="tl-group"><button type="button" class="btn small primary" data-do="clone">Собрать свой из этих карточек</button><button type="button" class="btn small ghost" data-do="f-png">Скачать PNG</button><button type="button" class="btn small ghost" data-do="f-copy">Скопировать картинку</button></span></div>
        </section>
        <div class="tl-board" id="tlFriendBoard">${rowsHTML(l, true)}</div>
        ${l.pool.length ? `<div class="tl-row tl-pool"><div class="tl-pool-h"><span>Без места · ${l.pool.length}</span></div><div class="tl-items">${l.pool.map((x) => cardHTML(l, x, true)).join('')}</div></div>` : ''}
        <section class="card tl-social"><div class="rx" id="tlRx"></div><div id="tlComments"></div></section>
      </div>`;
    };
    paint();
    boardIntro($('#tlFriendBoard'));
    mountSocial(uid, id, false);
    // картинки догружаются пачками: тир-лист виден сразу
    await fetchImgs(uid, l);
    if (S.friend && S.friend.list === l && S.built === 'friend:' + uid + '.' + id) {
      const board = $('#tlFriendBoard');
      if (board) { board.classList.remove('intro'); board.innerHTML = rowsHTML(l, true); }
      const poolBox = view.querySelector('.tl-view .tl-pool .tl-items');
      if (poolBox) poolBox.innerHTML = l.pool.map((x) => cardHTML(l, x, true)).join('');
    }
  }
  async function cloneFriend() {
    const f = S.friend;
    if (!f) return;
    await fetchImgs(f.uid, f.list);
    if (S.friend !== f) return;
    const items = {};
    for (const [id, it] of Object.entries(f.list.items)) {
      const copy = { ...it };
      if (it.img) {
        const src = urls.get(it.img);
        try { copy.img = src && DATA_RE.test(src) ? await putImg(dataToBlob(src)) : ''; } catch (e) { copy.img = ''; }
        if (!copy.img) { delete copy.img; copy.kind = 'text'; copy.name = copy.name || '?'; }
      }
      items[id] = copy;
    }
    const l = clean({ title: f.list.title, rows: f.list.rows.map((r) => ({ id: r.id, label: r.label, color: r.color, items: [] })), items, captions: f.list.captions });
    lists.unshift(l);
    touchList(l);
    open(l.id);
    toast('Готово: карточки внизу, раскладывай по-своему.');
  }

  // ---------- реакции и комментарии ----------
  const RX = [['fire', '🔥', 'огонь'], ['lol', '😂', 'ору'], ['love', '😍', 'обожаю'], ['goat', '🐐', 'легенда'], ['like', '👍', 'согласен'], ['moai', '🗿', 'база'],
    ['think', '🤔', 'спорно'], ['cry', '😭', 'до слёз'], ['skull', '💀', 'жесть'], ['clown', '🤡', 'клоунада'], ['dislike', '👎', 'мимо'], ['nope', '🙅', 'не согласен']];
  let rxState = null;
  const rxIcon = (k) => (RX.find((x) => x[0] === k) || [])[1] || '';
  function paintRx() {
    const box = $('#tlRx');
    if (!box || !rxState) return;
    const { own, items } = rxState;
    const mine = items.find((x) => x.from.id === me) || {};
    const others = items.filter((x) => x.from.id !== me);
    const shown = mine.text ? [mine, ...others] : others;
    const list = shown.length ? `<ul class="rx-list">${shown.map((x) => `<li><b>${esc(x.from.username)}</b> ${rxIcon(x.emoji)} ${x.text ? `<span>${esc(x.text)}</span>` : ''}</li>`).join('')}</ul>` : '';
    if (own) {
      box.innerHTML = `<div class="rx-title">Реакции друзей</div>${list || '<p class="tl-note">Пока никто не отреагировал.</p>'}`;
      return;
    }
    const picked = RX.find((x) => x[0] === mine.emoji);
    box.innerHTML = `<div class="rx-title">Твоя реакция${picked ? `: <span>${picked[1]} ${picked[2]}</span>` : ''}</div>
      <div class="rx-btns">${RX.map(([k, ico, label]) => { const n = items.filter((x) => x.emoji === k).length; return `<button type="button" data-rx="${k}" aria-pressed="${mine.emoji === k}" title="${label}" aria-label="${label}${n ? ', ' + n : ''}"><span class="rx-e">${ico}</span>${n ? `<b>${n}</b>` : ''}</button>`; }).join('')}</div>
      ${list}`;
  }
  // выбранный смайлик разлетается веером над кнопкой и улетает вверх, уменьшаясь до нуля
  function rxBurst(btn, ico) {
    if (!ico || reduced || !btn.animate) return;
    const r = btn.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.textContent = ico;
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;z-index:90;font-size:22px;line-height:1;pointer-events:none;translate:-50% -50%`;
      document.body.appendChild(s);
      const a = (i / 6) * Math.PI * 0.9 + Math.PI * 0.55, d = 46 + Math.random() * 34;
      const x = Math.cos(a) * d * -1, y = -Math.abs(Math.sin(a)) * d - 30;
      s.animate([
        { transform: 'translate(0, 0) scale(.4) rotate(0deg)' },
        { transform: `translate(${x * 0.7}px, ${y * 0.7}px) scale(1.25) rotate(${(Math.random() - 0.5) * 50}deg)`, offset: 0.45 },
        { transform: `translate(${x}px, ${y - 40}px) scale(0) rotate(${(Math.random() - 0.5) * 90}deg)` },
      ], { duration: 750 + Math.random() * 250, easing: 'cubic-bezier(.2, .8, .2, 1)' }).onfinish = () => s.remove();
    }
  }
  async function sendRx(emoji, text) {
    const { uid, rid: rx } = rxState;
    try { await api(`/react/${encodeURIComponent(uid)}/${encodeURIComponent(rx)}`, 'PUT', { emoji, text }); }
    catch (e) { toast(e.message); return; }
    const rest = rxState.items.filter((x) => x.from.id !== me);
    if (emoji || text) rest.unshift({ rid: rx, from: { id: me, username: user.username || user.name, handle: user.handle }, emoji, text, at: Date.now() });
    rxState.items = rest;
    paintRx();
  }
  function mountSocial(uid, id, own) {
    rxState = { uid, rid: 't.' + id, own, items: [] };
    const cm = $('#tlComments');
    if (cm && window.CasualComments) {
      window.CasualComments.mount(cm, {
        uid, target: 't.' + id, token, title: 'Комментарии',
        placeholder: own ? 'Напиши что-нибудь об этом тир-листе…' : 'Напиши, что думаешь об этом тир-листе…',
        empty: own ? 'Пока никто не написал. Друзья увидят этот тир-лист в своей вкладке «Друзья».' : 'Пока пусто. Напиши первым!',
      });
    }
    paintRx();
    const state = rxState;
    api('/reacts/' + encodeURIComponent(uid)).then((d) => {
      if (rxState !== state) return;
      state.items = (d.items || []).filter((x) => x.rid === state.rid);
      paintRx();
    }).catch(() => {});
  }

  function discardBlank(l) {
    if (!l || !isBlank(l) || !lists.includes(l)) return;
    lists = lists.filter((x) => x !== l);
    if (me && sync.marks[l.id]) { sync.del.push({ id: l.id, at: Date.now() }); keepSync(); scheduleSync(0); }
    delete sync.marks[l.id];
    save();
  }

  // ---------- нажатия ----------
  async function startNew(how) {
    if (how === 'file') { $('#tlFile').click(); return; }
    const l = newList();
    open(l.id);
    await route();
    if (how === 'ratings') addRatingsDialog();
    if (how === 'stickers') addStickersDialog();
    if (how === 'empty' && $('#tlTitle')) $('#tlTitle').focus();
  }
  function armed(b, key, text, fn) {
    if (S.armed === key) { S.armed = ''; fn(); return; }
    S.armed = key;
    const old = b.textContent;
    b.textContent = text;
    b.dataset.armed = '1';
    setTimeout(() => { if (S.armed === key) S.armed = ''; if (b.isConnected) { b.textContent = old; delete b.dataset.armed; } }, 3500);
  }
  function doAction(a, b) {
    const l = S.list;
    if (a === 'clone') { b.disabled = true; cloneFriend().finally(() => { b.disabled = false; }); return; }
    if (a === 'f-png' || a === 'f-copy') { if (S.friend) { b.disabled = true; pngOut(S.friend.list, a === 'f-copy').finally(() => { b.disabled = false; }); } return; }
    if (!l) return;
    if (a === 'add-img') $('#tlImgs').click();
    else if (a === 'add-text') addTextDialog();
    else if (a === 'add-ratings') addRatingsDialog();
    else if (a === 'add-stickers') addStickersDialog();
    else if (a === 'add-row') { l.rows.push({ id: rid('r'), label: '', color: COLORS[COLORS.length - 1], items: [] }); touchList(l); renderEditor(); rowDialog(l.rows[l.rows.length - 1].id); }
    else if (a === 'png') { b.disabled = true; pngOut(l, false).finally(() => { b.disabled = false; }); }
    else if (a === 'copy') { b.disabled = true; pngOut(l, true).finally(() => { b.disabled = false; }); }
    else if (a === 'fav') { l.fav = !l.fav; touchList(l); renderEditor(); }
    else if (a === 'share') shareList(l, b);
    else if (a === 'unshare') armed(b, 'unshare', 'Точно закрыть?', () => unshareList(l, b));
    else if (a === 'file') fileOut().catch(() => toast('Не получилось сохранить файл.'));
    else if (a === 'clear') armed(b, 'clear', 'Точно убрать?', () => { l.rows.forEach((r) => { l.pool.push(...r.items); r.items = []; }); S.sel = ''; touchList(l); renderEditor(); });
    else if (a === 'delete') armed(b, 'delete', 'Точно удалить?', () => {
      dropImgs(Object.values(l.items).map((it) => it.img).filter(Boolean));
      lists = lists.filter((x) => x !== l);
      if (me) { sync.del.push({ id: l.id, at: Date.now() }); keepSync(); scheduleSync(0); }
      save();
      S.list = null;
      location.hash = '';
    });
    else if (a === 'sel-pool') { if (S.sel) { moveTo(S.sel, '', ''); S.sel = ''; renderEditor(); } }
  }
  view.addEventListener('click', (e) => {
    const nw = e.target.closest('[data-new]');
    if (nw) { startNew(nw.dataset.new); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { location.hash = tab.dataset.tab === 'mine' ? '' : tab.dataset.tab; return; }
    const star = e.target.closest('[data-fav]');
    if (star) {
      const fl = lists.find((x) => x.id === star.dataset.fav);
      if (fl) { fl.fav = !fl.fav; touchList(fl); renderMine(); }
      return;
    }
    const so = e.target.closest('[data-sort]');
    if (so) {
      S.sort = so.dataset.sort;
      view.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === so)));
      renderPanel();
      return;
    }
    const who = e.target.closest('[data-who]');
    if (who) { S.who = who.dataset.who; paintFriends(); return; }
    const act = e.target.closest('[data-do]');
    if (act) { if (!justDragged) doAction(act.dataset.do, act); return; }
    const emo = e.target.closest('[data-rx]');
    if (emo && rxState) {
      const mine = rxState.items.find((x) => x.from.id === me) || {};
      const k = emo.dataset.rx, on = mine.emoji !== k;
      if (on) rxBurst(emo, rxIcon(k));
      sendRx(on ? k : null, on ? mine.text || '' : '');
      return;
    }
    if (!S.list || justDragged) return;
    const x = e.target.closest('.tl-x');
    if (x) {
      const card = x.closest('.tl-it'), id = card.dataset.id;
      if (reduced || !card.animate) { removeWithUndo(id); return; }
      card.style.pointerEvents = 'none';
      card.animate([{ transform: 'none' }, { transform: 'scale(.2) rotate(-14deg)' }], { duration: 170, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' });
      setTimeout(() => removeWithUndo(id), 170); // по таймеру: в фоновой вкладке анимации не доигрывают
      return;
    }
    const it = e.target.closest('.tl-it');
    const row = e.target.closest('[data-row]');
    if (S.sel) {
      if (it && it.dataset.id === S.sel) { S.sel = ''; renderEditor(); return; }
      if (row) { moveTo(S.sel, row.dataset.row, it ? it.dataset.id : ''); S.sel = ''; renderEditor(); return; }
    }
    if (it) { S.sel = it.dataset.id; renderEditor(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) rowDialog(ed.dataset.edit);
  });
  view.addEventListener('input', (e) => {
    if (e.target.id === 'tlQ') { S.q = e.target.value; renderPanel(); return; }
    if (e.target.id === 'tlTitle' && S.list) { S.list.title = str(e.target.value, LIMIT.title); touchList(S.list); }
  });
  view.addEventListener('change', (e) => {
    if (e.target.id === 'tlCaps' && S.list) { S.list.captions = e.target.checked; touchList(S.list); renderEditor(); }
    if (e.target.id === 'tlShare' && S.list) { S.list.private = !e.target.checked; touchList(S.list); toast(S.list.private ? 'Теперь этот тир-лист видишь только ты.' : 'Теперь этот тир-лист видят друзья.'); }
    if (e.target.id === 'tlImgs' && S.list) { addFiles(e.target.files); e.target.value = ''; }
    if (e.target.id === 'tlFile') { if (e.target.files[0]) fileIn(e.target.files[0]); e.target.value = ''; }
  });
  document.addEventListener('keydown', (e) => {
    if (dlg) {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
      if (e.key === 'Tab') {
        const all = [...dlg.querySelectorAll('button:not([disabled]), input, textarea, a[href]')].filter((n) => n.offsetParent !== null);
        if (!all.length) return;
        const first = all[0], last = all[all.length - 1];
        if (e.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !dlg.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (!S.list || !S.sel || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    const l = S.list, id = S.sel, list = whereIs(l, id), pos = list.indexOf(id);
    if (e.key === 'Escape') { S.sel = ''; renderEditor(); e.stopPropagation(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeWithUndo(id); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const j = pos + (e.key === 'ArrowLeft' ? -1 : 1);
      if (j >= 0 && j < list.length) { list.splice(j, 0, list.splice(pos, 1)[0]); S.pop = id; touchList(l); renderEditor(); }
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const order = [...l.rows.map((r) => r.id), ''];
      const cur = order.indexOf((l.rows.find((r) => r.items === list) || { id: '' }).id);
      const next = order[cur + (e.key === 'ArrowUp' ? -1 : 1)];
      if (next !== undefined) { moveTo(id, next, ''); renderEditor(); }
    }
  });

  // ---------- перетаскивание мышью ----------
  view.addEventListener('pointerdown', (e) => {
    const it = e.target.closest('.tl-it[data-id]');
    if (!it || e.target.closest('.tl-x') || e.button > 0 || e.pointerType === 'touch' || !S.list) return;
    drag = { id: it.dataset.id, x: e.clientX, y: e.clientY, moved: false, src: it, ghost: null, row: null, near: null, after: false };
    let raf = 0, lastY = 0;
    const clearMarks = () => {
      if (drag.row) drag.row.classList.remove('over');
      if (drag.near) drag.near.classList.remove('ins-before', 'ins-after');
    };
    const hover = (ev) => {
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = hit && hit.closest('[data-row]');
      const near = hit && hit.closest('.tl-it');
      const after = !!(near && ev.clientX > near.getBoundingClientRect().left + near.offsetWidth / 2);
      clearMarks();
      drag.row = row; drag.near = near && near !== drag.src ? near : null; drag.after = after;
      if (row) row.classList.add('over');
      if (drag.near) drag.near.classList.add(after ? 'ins-after' : 'ins-before');
    };
    const scroller = () => {
      if (!drag || !drag.moved) return;
      const dy = lastY < 70 ? -14 : lastY > innerHeight - 70 ? 14 : 0;
      if (dy) window.scrollBy(0, dy);
      raf = requestAnimationFrame(scroller);
    };
    const move = (ev) => {
      if (!drag) return;
      lastY = ev.clientY;
      if (!drag.moved) {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 6) return;
        drag.moved = true;
        S.sel = '';
        drag.ghost = drag.src.cloneNode(true);
        drag.ghost.classList.remove('sel', 'pop');
        drag.ghost.classList.add('tl-ghost');
        document.body.appendChild(drag.ghost);
        drag.src.classList.add('tl-src');
        document.body.classList.add('tl-dragging');
        raf = requestAnimationFrame(scroller);
      }
      drag.ghost.style.left = ev.clientX + 'px';
      drag.ghost.style.top = ev.clientY + 'px';
      hover(ev);
    };
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf);
      const d = drag;
      drag = null;
      if (!d || !d.moved) return;
      d.ghost.remove();
      document.body.classList.remove('tl-dragging');
      d.src.classList.remove('tl-src');
      if (d.row) d.row.classList.remove('over');
      if (d.near) d.near.classList.remove('ins-before', 'ins-after');
      if (ev.type === 'pointerup' && d.row) { S.dropped = d.id; moveTo(d.id, d.row.dataset.row, d.near ? d.near.dataset.id : '', d.after); }
      renderEditor();
      // клик сразу после перетаскивания — не выбор карточки
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });

  // ---------- картинки бросают на страницу или вставляют из буфера ----------
  addEventListener('dragover', (e) => {
    if (!S.list || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    document.body.classList.add('tl-dropping');
  });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('tl-dropping'); });
  addEventListener('drop', (e) => {
    document.body.classList.remove('tl-dropping');
    if (!S.list || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });
  addEventListener('paste', (e) => {
    if (!S.list || dlg || !e.clipboardData) return;
    const files = [...e.clipboardData.files].filter((f) => /^image\//.test(f.type));
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  addEventListener('storage', (e) => {
    if (e.key === 'ocenshik.user.v1') { const u = read('ocenshik.user.v1'); if ((u && u.id) !== (user && user.id)) location.reload(); return; }
    if (e.key !== KEY) return;
    lists = readLists(KEY); // другая вкладка изменила тир-листы
    if (S.list) S.list = lists.find((x) => x.id === S.list.id) || null;
    if (!drag && !dlg) route();
  });
  // вернулись на вкладку: вдруг на другом устройстве что-то поменялось
  addEventListener('focus', () => { if (me && Date.now() - lastPull > 30e3) runSync(true); });

  // ---------- адрес ----------
  async function route() {
    const h = location.hash.slice(1);
    const fm = /^f=([^.]+)\.(\w+)$/.exec(h);
    if (fm && fm[1] === me) { location.replace('#l=' + fm[2]); return; }
    if (fm) {
      closeDialog();
      if (!me) { S.built = ''; S.list = null; S.friend = null; S.tab = 'friends'; homeShell(); renderTabs(); await renderFriendsTab(); return; }
      if (S.built !== 'friend:' + fm[1] + '.' + fm[2]) await renderFriendList(fm[1], fm[2]);
      return;
    }
    S.friend = null;
    const lm = /^l=(\w+)$/.exec(h);
    const l = lm ? lists.find((x) => x.id === lm[1]) : null;
    if (S.list && S.list !== l) discardBlank(S.list);
    if (lm && !l && !pulledOnce) {
      // ссылка на свой тир-лист с другого устройства: он ещё едет из аккаунта
      S.list = null; S.built = 'wait';
      view.innerHTML = '<section class="card"><p class="tl-empty">Загружаю…</p></section>';
      return;
    }
    if (l) {
      const same = S.list && S.list.id === l.id;
      S.list = l;
      if (!same) S.sel = '';
      await loadUrls(Object.values(l.items).map((it) => it.img).filter(Boolean));
      if (S.list === l) renderEditor();
      return;
    }
    if (lm) { history.replaceState(null, '', location.pathname); }
    S.list = null; S.sel = '';
    closeDialog();
    S.tab = h === 'friends' ? 'friends' : h === 'fav' ? 'fav' : 'mine';
    const fresh = S.built !== 'home';
    homeShell();
    if (fresh) window.scrollTo(0, 0);
    renderTabs();
    if (S.tab === 'friends') await renderFriendsTab(); else await renderMine();
  }
  addEventListener('hashchange', route);

  // ---------- тема: одна на весь сайт ----------
  const THEMES = window.CasualThemes.list, THEME_IDS = THEMES.map((t) => t.id);
  function readThemePref() {
    const p = read(PREFS_KEY);
    return p && THEME_IDS.includes(p.theme) ? p.theme : 'auto';
  }
  function writeThemePref(t) {
    try {
      let p = read(PREFS_KEY);
      if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
      p.theme = t;
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  function applyTheme(t, fromUser) {
    const theme = THEME_IDS.includes(t) ? t : 'auto';
    if (theme === 'auto') { if (fromUser) document.documentElement.removeAttribute('data-theme'); }
    else document.documentElement.setAttribute('data-theme', theme);
    const th = THEMES.find((x) => x.id === theme);
    $('#themeBtn').innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/></svg><span>Тема: ${th.name}</span>`;
    $('#themeBtn').setAttribute('aria-label', `Тема: ${th.name}`);
    $('#themeMenu').classList.add('tm-grid');
    $('#themeMenu').innerHTML = window.CasualThemes.menuHTML(theme);
    if (fromUser) writeThemePref(theme);
  }
  $('#themeMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    const swap = () => applyTheme(b.dataset.themeId, true);
    if (document.startViewTransition && !reduced) {
      const r = b.getBoundingClientRect();
      document.documentElement.style.setProperty('--tx', `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty('--ty', `${r.top + r.height / 2}px`);
      document.documentElement.classList.add('theme-swap');
      let done = false;
      const go = () => { if (!done) { done = true; swap(); } };
      const vt = document.startViewTransition(go);
      vt.ready.catch(() => {});
      if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
      vt.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('theme-swap'));
      setTimeout(go, 400); // если переход не начался (вкладка в фоне), тема всё равно сменится
    } else swap();
    $('#themePick').open = false;
    $('#themeBtn').focus();
  });
  document.addEventListener('click', (e) => { const p = $('#themePick'); if (p.open && !p.contains(e.target)) p.open = false; });
  applyTheme(readThemePref(), false);

  // заголовок по буквам и въезд карточек, как на остальных страницах
  if (!reduced) {
    const title = $('.title');
    const text = title.textContent.trim();
    let i = 0;
    title.setAttribute('aria-label', text);
    title.innerHTML = text.split(' ').map((w) => `<span class="w" aria-hidden="true">${[...w].map((c) => `<span class="ch" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
    document.documentElement.classList.add('intro');
    setTimeout(() => document.documentElement.classList.remove('intro'), 1400);
  }

  const openId = (/^#l=(\w+)$/.exec(location.hash) || [])[1];
  lists.filter((l) => isBlank(l) && l.id !== openId).forEach(discardBlank);
  route().then(() => { if (me) runSync(true); });
})();
