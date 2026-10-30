/* Тир-листы Казуала: свои тир-листы из картинок, текста, оценок и стикеров, как на tiermaker.com.
   Списки лежат в localStorage, картинки — отдельно в IndexedDB (там много места). Всё хранится в этом браузере,
   на другое устройство тир-лист переносится файлом. Перетаскивание — мышью, на телефоне — нажатиями: карточка, потом ряд. */
(() => {
  const KEY = 'casualhub.tierlists.v1', PREFS_KEY = 'ocenshik.prefs.v1', RATINGS_KEY = 'ocenshik.ratings.v2';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const COLORS = ['#43C97A', '#9BCF4E', '#F2BA44', '#F28E4C', '#F26A55', '#E85FA5', '#8C7BFF', '#5B9BF5', '#4CC9C0', '#9AA0AE'];
  const DEFAULT_ROWS = [['S', '#43C97A'], ['A', '#9BCF4E'], ['B', '#F2BA44'], ['C', '#F28E4C'], ['D', '#F26A55']];
  const LIMIT = { rows: 20, items: 500, title: 80, label: 40, name: 80, file: 20 * 1024 * 1024, json: 80 * 1024 * 1024 };
  const COLOR_RE = /^#[0-9a-f]{6}$/i, SRC_RE = /^\/wheel\/hub\/[\w\-/.]+\.(png|webp|gif|jpe?g)$/i, DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };

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
  const urls = new Map(); // ключ картинки → адрес blob:
  async function putImg(blob) {
    const key = rid('ti_');
    const ok = await idb('readwrite', (st) => st.put(blob, key));
    urls.set(key, URL.createObjectURL(blob));
    return ok ? key : Promise.reject(new Error('store'));
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
    keys.forEach((k) => { if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } });
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
    return (await toBlob(c, 'image/webp', 0.86)) || toBlob(c, 'image/png');
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
      if (!it || typeof it !== 'object' || !/^[\w.:-]{1,80}$/.test(id)) continue;
      const out = { id, name: str(it.name, LIMIT.name), kind: 'text' };
      if (it.kind === 'img' && typeof it.img === 'string' && /^ti_\w+$/.test(it.img)) { out.kind = 'img'; out.img = it.img; }
      else if (it.kind === 'url' && SRC_RE.test(String(it.src))) { out.kind = 'url'; out.src = String(it.src); }
      else if (!out.name) continue;
      items[id] = out;
    }
    const seen = new Set();
    const own = (arr) => (Array.isArray(arr) ? arr : []).filter((id) => typeof id === 'string' && items[id] && !seen.has(id) && seen.add(id));
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
      title: str(raw.title, LIMIT.title), rows, pool, items, captions: !!raw.captions,
      at: Number.isFinite(+raw.at) ? +raw.at : Date.now(),
    };
  }
  function readLists() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return (d && Array.isArray(d.lists) ? d.lists : []).map(clean).filter(Boolean);
    } catch (e) { return []; }
  }
  let lists = readLists();
  let saveFailed = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ lists })); saveFailed = false; }
    catch (e) { if (!saveFailed) toast('Браузеру не хватило места: последние изменения могут не сохраниться.', true); saveFailed = true; }
  }
  const touchList = (l) => { l.at = Date.now(); save(); };
  const newList = (title) => {
    const l = clean({ title: title || '', rows: [], items: {} });
    lists.unshift(l);
    save();
    return l;
  };

  // ---------- мелочи интерфейса ----------
  let toastTimer = 0;
  function toast(text, bad) {
    let t = $('.tl-toast');
    if (!t) { t = document.createElement('div'); t.className = 'tl-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.toggle('bad', !!bad);
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('in'), 3400);
  }
  let dlg = null, dlgBack = null;
  function dialog(title, body, wide) {
    closeDialog();
    dlgBack = document.activeElement;
    dlg = document.createElement('div');
    dlg.className = 'tl-sheet';
    dlg.innerHTML = `<div class="tl-dialog${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="tlDlgT"><div class="tl-dlg-head"><h2 id="tlDlgT">${esc(title)}</h2><button type="button" class="mini-btn" data-dlg="close" aria-label="Закрыть">✕</button></div><div class="tl-dlg-body">${body}</div></div>`;
    document.body.appendChild(dlg);
    document.documentElement.style.overflow = 'hidden';
    dlg.addEventListener('pointerdown', (e) => { if (e.target === dlg) dlg.dataset.down = '1'; });
    dlg.addEventListener('click', (e) => {
      if ((e.target === dlg && dlg.dataset.down) || e.target.closest('[data-dlg="close"]')) closeDialog();
      if (dlg) delete dlg.dataset.down;
    });
    const f = dlg.querySelector('[data-focus]') || dlg.querySelector('button');
    if (f) f.focus({ preventScroll: true });
    return dlg;
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
  const S = { list: null, sel: '', pop: '', armed: '' };
  let drag = null, justDragged = false;
  const fmtDate = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const allItems = (l) => [...l.rows.flatMap((r) => r.items), ...l.pool];
  const whereIs = (l, id) => { const r = l.rows.find((x) => x.items.includes(id)); return r ? r.items : l.pool; };
  const imgOf = (it) => (it.kind === 'img' ? urls.get(it.img) || '' : it.kind === 'url' ? it.src : '');
  const hashId = () => { const m = /^#l=(\w+)$/.exec(location.hash); return m ? m[1] : ''; };
  const open = (id) => { location.hash = 'l=' + id; };

  // ---------- главная раздела ----------
  function thumb(l, id) {
    const it = l.items[id], src = imgOf(it);
    return src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : `<span>${esc([...it.name][0] || '?')}</span>`;
  }
  async function renderHome() {
    S.list = null;
    document.body.classList.remove('tl-editing');
    await loadUrls(lists.flatMap((l) => allItems(l).slice(0, 40).map((id) => l.items[id].img).filter(Boolean)));
    view.innerHTML = `<section class="card tl-start" aria-label="Новый тир-лист">
        <h2 class="eyebrow"><span class="dot" aria-hidden="true"></span>Новый тир-лист</h2>
        <div class="tl-start-grid">
          <button type="button" class="tl-go" data-new="empty"><span class="tl-go-i" aria-hidden="true">＋</span><b>С нуля</b><small>Загрузи свои картинки или впиши текст</small></button>
          <button type="button" class="tl-go" data-new="ratings"><span class="tl-go-i" aria-hidden="true">📊</span><b>Из моих оценок</b><small>Игры, фильмы, что угодно из Мнения</small></button>
          <button type="button" class="tl-go" data-new="stickers"><span class="tl-go-i" aria-hidden="true">😎</span><b>Из стикеров</b><small>Папич, roflan, arthas и Twitch</small></button>
          <button type="button" class="tl-go" data-new="file"><span class="tl-go-i" aria-hidden="true">📂</span><b>Из файла</b><small>Тир-лист, скачанный на другом устройстве</small></button>
        </div>
      </section>
      <section class="tl-mine" aria-label="Мои тир-листы">
        <h2 class="tl-h2">Мои тир-листы${lists.length ? ` <small>${lists.length}</small>` : ''}</h2>
        ${lists.length ? `<div class="tl-grid">${[...lists].sort((a, b) => b.at - a.at).map((l, k) => {
          const n = Object.keys(l.items).length;
          return `<a class="tl-tile" href="#l=${esc(l.id)}" style="--k:${Math.min(k, 8)}"><span class="tl-mini" aria-hidden="true">${l.rows.slice(0, 5).map((r) => `<span class="tl-mini-r"><i style="background:${esc(r.color)}"></i><span>${r.items.slice(0, 7).map((id) => thumb(l, id)).join('')}</span></span>`).join('')}</span><b>${esc(l.title || 'Без названия')}</b><small>${n} ${plural(n, 'карточка', 'карточки', 'карточек')} · ${esc(fmtDate(l.at))}</small></a>`;
        }).join('')}</div>` : '<p class="tl-empty">Пока пусто. Начни с любого варианта выше: тир-лист сохранится сам.</p>'}
        <p class="tl-note">Тир-листы хранятся в этом браузере. Чтобы открыть тир-лист на другом устройстве, скачай его кнопкой «Файл».</p>
      </section>
      <input type="file" id="tlFile" accept=".json,application/json" hidden>`;
    window.scrollTo(0, 0);
  }

  // ---------- редактор ----------
  function cardHTML(l, id) {
    const it = l.items[id], src = imgOf(it), sel = S.sel === id, just = S.pop === id;
    const cap = l.captions && it.name && it.kind !== 'text' ? `<small>${esc(it.name)}</small>` : '';
    const face = src ? `<img src="${esc(src)}" alt="" draggable="false" decoding="async">` : `<span class="tl-txt">${esc(it.name || '?')}</span>`;
    return `<button type="button" class="tl-it${sel ? ' sel' : ''}${just ? ' pop' : ''}${src ? '' : ' text'}" data-id="${esc(id)}" aria-pressed="${sel}" title="${esc(it.name)}" aria-label="${esc(it.name || 'Картинка')}"><span class="tl-face">${face}</span>${cap}</button>`;
  }
  function renderEditor() {
    const l = S.list;
    if (!view.querySelector('#tlTitle')) {
      view.innerHTML = `<section class="card tl-bar">
          <div class="tl-bar-top">
            <a class="btn small ghost" href="#">‹ Все тир-листы</a>
            <label class="vh" for="tlTitle">Название тир-листа</label>
            <input class="tl-title" id="tlTitle" maxlength="${LIMIT.title}" placeholder="Название, например «Лучшие игры»" autocomplete="off">
          </div>
          <div class="tl-tools">
            <span class="tl-group"><button type="button" class="btn small primary" data-do="add-img">＋ Картинки</button><button type="button" class="btn small ghost" data-do="add-text">＋ Текст</button><button type="button" class="btn small ghost" data-do="add-ratings">Из оценок</button><button type="button" class="btn small ghost" data-do="add-stickers">Стикеры</button></span>
            <span class="tl-group"><label class="tl-check"><input type="checkbox" id="tlCaps"> Подписи</label><button type="button" class="btn small ghost" data-do="png">Скачать PNG</button><button type="button" class="btn small ghost" data-do="copy">Скопировать картинку</button><button type="button" class="btn small ghost" data-do="file">Файл</button><button type="button" class="btn small ghost" data-do="clear">Всё убрать</button><button type="button" class="btn small danger" data-do="delete">Удалить</button></span>
          </div>
          <p class="tl-hint" id="tlHint" aria-live="polite"></p>
          <input type="file" id="tlImgs" accept="image/*" multiple hidden>
        </section>
        <div class="tl-board" id="tlBoard"></div>
        <div class="tl-dock" id="tlDock"></div>`;
      document.body.classList.add('tl-editing');
      window.scrollTo(0, 0);
    }
    const title = $('#tlTitle');
    if (document.activeElement !== title) title.value = l.title;
    $('#tlCaps').checked = l.captions;
    $('#tlHint').textContent = S.sel
      ? (touch ? 'Теперь нажми на ряд или на карточку, перед которой поставить.' : 'Теперь нажми на ряд или на карточку, перед которой поставить. Стрелки двигают, Delete удаляет карточку.')
      : (touch ? 'Нажми на карточку, а потом на ряд. Нажми на название ряда, чтобы его поменять. Всё сохраняется само.' : 'Перетаскивай карточки по рядам. Картинки можно бросить прямо сюда или вставить через Ctrl+V. Нажми на название ряда, чтобы его поменять. Всё сохраняется само.');
    $('#tlBoard').innerHTML = l.rows.map((r) => `<div class="tl-row" data-row="${esc(r.id)}"><button type="button" class="tl-lab${[...r.label].length > 12 ? ' long' : [...r.label].length > 4 ? ' mid' : ''}" data-edit="${esc(r.id)}" style="background:${esc(r.color)};color:${inkOn(r.color)}" title="Настроить ряд">${esc(r.label) || '&nbsp;'}</button><div class="tl-items">${r.items.map((id) => cardHTML(l, id)).join('') || `<span class="tl-drop">${touch ? 'пусто' : 'перетащи сюда'}</span>`}</div></div>`).join('')
      + (l.rows.length < LIMIT.rows ? '<button type="button" class="btn small text tl-addrow" data-do="add-row">＋ Ряд</button>' : '');
    const n = l.pool.length;
    const selBar = S.sel ? `<span class="tl-selbar"><button type="button" class="btn small ghost" data-do="sel-pool">Убрать из ряда</button><button type="button" class="btn small danger" data-do="sel-del">Удалить карточку</button></span>` : '';
    $('#tlDock').innerHTML = `<div class="tl-row tl-pool" data-row=""><div class="tl-pool-h"><b>Без места · ${n}</b>${selBar}</div><div class="tl-items">${l.pool.map((id) => cardHTML(l, id)).join('') || `<span class="tl-drop">${Object.keys(l.items).length ? 'Всё разложено 👌' : 'Добавь карточки кнопками наверху'}</span>`}</div></div>`;
    S.pop = '';
    if (S.sel) { const b = view.querySelector(`.tl-it[data-id="${CSS.escape(S.sel)}"]`); if (b && !touch) b.focus({ preventScroll: true }); }
  }
  // подпись ряда читается на любом цвете
  function inkOn(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#0D0F14' : '#FFFFFF';
  }
  function moveTo(id, rowId, beforeId, after) {
    const l = S.list;
    const from = whereIs(l, id);
    from.splice(from.indexOf(id), 1);
    const to = rowId ? (l.rows.find((r) => r.id === rowId) || l).items || l.pool : l.pool;
    let at = beforeId ? to.indexOf(beforeId) : -1;
    if (at >= 0 && after) at += 1;
    if (at >= 0) to.splice(at, 0, id); else to.push(id);
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
    if (!good.length) { toast(skipped ? 'Подходят только картинки до 20 МБ.' : 'В этом нет картинок.', true); return; }
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
    if (failed || skipped) toast(`Добавлено: ${added}, не получилось: ${failed + skipped}.`, true);
    else toast(`Добавлено: ${added} ${plural(added, 'карточка', 'карточки', 'карточек')}.`);
  }
  function addTextDialog() {
    const d = dialog('Карточки с текстом', `<label class="label" for="tlLines">Каждая строка станет карточкой</label>
      <textarea class="tl-area" id="tlLines" rows="7" maxlength="6000" data-focus placeholder="Дота 2&#10;Hollow Knight&#10;Шаурма у метро"></textarea>
      <div class="tl-dlg-foot"><button type="button" class="btn small primary" data-add>Добавить</button></div>`);
    d.querySelector('[data-add]').addEventListener('click', () => {
      const l = S.list;
      const lines = d.querySelector('#tlLines').value.split('\n').map((s) => str(s, LIMIT.name)).filter(Boolean);
      if (!lines.length) { d.querySelector('#tlLines').focus(); return; }
      let n = 0;
      lines.forEach((name) => { if (addItem(l, { id: rid('x'), kind: 'text', name })) n += 1; });
      touchList(l);
      closeDialog();
      renderEditor();
      toast(`Добавлено: ${n} ${plural(n, 'карточка', 'карточки', 'карточек')}.`);
    });
  }
  // оценки из Мнения этого браузера: обложка копируется в тир-лист, дальше он от оценки не зависит
  function readRatings() {
    try {
      const a = JSON.parse(localStorage.getItem(RATINGS_KEY) || '[]');
      return (Array.isArray(a) ? a : []).filter((r) => r && r.id && r.name && !/^ex-/.test(String(r.id)));
    } catch (e) { return []; }
  }
  const catOf = (r) => String(r.catLabel || r.catName || 'Без категории');
  function addRatingsDialog() {
    const l = S.list, rs = readRatings();
    if (!rs.length) {
      dialog('Из моих оценок', '<p class="tl-empty">В этом браузере пока нет оценок.</p><div class="tl-dlg-foot"><a class="btn small primary" href="/opinion/">Открыть Мнение</a></div>');
      return;
    }
    const cats = [...new Set(rs.map(catOf))];
    const picked = new Set(cats);
    const d = dialog('Из моих оценок', `<p class="label">Какие категории добавить</p><div class="tl-chips" id="tlCats">${cats.map((c) => `<button type="button" class="tl-chip" data-cat="${esc(c)}" aria-pressed="true">${esc(c)} <small>${rs.filter((r) => catOf(r) === c).length}</small></button>`).join('')}</div>
      <div class="tl-dlg-foot"><button type="button" class="btn small primary" data-add>Добавить</button></div>`);
    d.querySelector('#tlCats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      if (picked.has(b.dataset.cat)) picked.delete(b.dataset.cat); else picked.add(b.dataset.cat);
      b.setAttribute('aria-pressed', String(picked.has(b.dataset.cat)));
    });
    d.querySelector('[data-add]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const chosen = rs.filter((r) => picked.has(catOf(r)) && !l.items['r_' + String(r.id).replace(/[^\w.:-]/g, '').slice(0, 70)]);
      const refs = chosen.map((r) => r.photo && r.photo.ref).filter(Boolean);
      let stored = {};
      if (refs.length && window.CasualPhotos) { try { stored = await window.CasualPhotos.getMany(refs); } catch (x) {} }
      let n = 0;
      for (const r of chosen) {
        const id = 'r_' + String(r.id).replace(/[^\w.:-]/g, '').slice(0, 70);
        const p = r.photo || {};
        const src = stored[p.ref] || (typeof p.data === 'string' && p.data) || (typeof p.id === 'string' && /^(data:image\/|https:\/\/)/.test(p.id) ? p.id : '') || (typeof p.url === 'string' ? p.url : '');
        let key = '';
        if (/^(data:image\/|https:\/\/)/.test(src)) { try { key = await putImg(await squareBlob(await loadImage(src, true))); } catch (x) {} }
        if (addItem(l, key ? { id, kind: 'img', img: key, name: str(r.name, LIMIT.name) } : { id, kind: 'text', name: str(r.name, LIMIT.name) })) n += 1;
      }
      touchList(l);
      closeDialog();
      renderEditor();
      toast(n ? `Добавлено: ${n} ${plural(n, 'карточка', 'карточки', 'карточек')}.` : 'Эти оценки уже в тир-листе.');
    });
  }
  let stickers = null;
  async function addStickersDialog() {
    const l = S.list;
    const d = dialog('Стикеры', '<p class="tl-empty">Загружаю…</p>', true);
    try {
      stickers = stickers || await fetch('/wheel/hub/index.json').then((r) => r.json());
    } catch (e) { d.querySelector('.tl-dlg-body').innerHTML = '<p class="tl-empty">Не получилось загрузить стикеры, проверь интернет.</p>'; return; }
    if (dlg !== d) return;
    // анимированные .webm на картинку не лягут: только то, что можно нарисовать
    const groups = stickers.groups.map((g) => ({ id: g.id, title: g.title, items: g.items.filter((i) => /\.(png|webp|gif)$/i.test(i.src)) })).filter((g) => g.items.length);
    let cur = groups[0];
    const idOf = (i) => 's_' + i.id.replace(/[^\w.:-]/g, '');
    const paint = () => {
      d.querySelector('.tl-dlg-body').innerHTML = `<div class="tl-chips">${groups.map((g) => `<button type="button" class="tl-chip" data-g="${esc(g.id)}" aria-pressed="${g === cur}">${esc(g.title)} <small>${g.items.length}</small></button>`).join('')}</div>
        <div class="tl-picks">${cur.items.map((i) => `<button type="button" class="tl-pick" data-s="${esc(i.id)}" aria-pressed="${!!l.items[idOf(i)]}" title="${esc(i.name)}" aria-label="${esc(i.name)}"><img src="/wheel/${esc(i.src)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>
        <div class="tl-dlg-foot"><button type="button" class="btn small ghost" data-all>Добавить все из набора</button><button type="button" class="btn small primary" data-dlg="close">Готово</button></div>`;
    };
    paint();
    d.querySelector('.tl-dlg-body').addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]');
      if (g) { cur = groups.find((x) => x.id === g.dataset.g) || cur; paint(); return; }
      const item = (i) => ({ id: idOf(i), kind: 'url', src: '/wheel/' + i.src, name: str(i.name, LIMIT.name) });
      if (e.target.closest('[data-all]')) {
        cur.items.forEach((i) => { if (!l.items[idOf(i)]) addItem(l, item(i)); });
        touchList(l); renderEditor(); paint();
        return;
      }
      const s = e.target.closest('[data-s]');
      if (!s) return;
      const i = cur.items.find((x) => x.id === s.dataset.s);
      if (!i) return;
      if (l.items[idOf(i)]) removeItems([idOf(i)]); else { addItem(l, item(i)); touchList(l); }
      s.setAttribute('aria-pressed', String(!!l.items[idOf(i)]));
      renderEditor();
    });
  }
  function rowDialog(rowId) {
    const l = S.list, r = l.rows.find((x) => x.id === rowId);
    if (!r) return;
    const at = l.rows.indexOf(r);
    const d = dialog('Настроить ряд', `<label class="label" for="tlRowName">Название</label><input class="tl-input" id="tlRowName" maxlength="${LIMIT.label}" data-focus value="${esc(r.label)}" autocomplete="off">
      <p class="label tl-mt">Цвет</p><div class="tl-swatches">${COLORS.map((c) => `<button type="button" class="tl-sw" data-color="${c}" style="background:${c}" aria-label="Цвет ${c}" aria-pressed="${c.toLowerCase() === r.color.toLowerCase()}"></button>`).join('')}<label class="tl-sw tl-sw-own" title="Свой цвет"><span class="vh">Свой цвет</span><input type="color" id="tlRowColor" value="${esc(r.color)}"></label></div>
      <div class="tl-dlg-foot tl-spread"><span><button type="button" class="btn small ghost" data-r="up"${at === 0 ? ' disabled' : ''}>↑ Выше</button> <button type="button" class="btn small ghost" data-r="down"${at === l.rows.length - 1 ? ' disabled' : ''}>↓ Ниже</button> <button type="button" class="btn small ghost" data-r="add"${l.rows.length >= LIMIT.rows ? ' disabled' : ''}>＋ Ряд ниже</button></span>
      <button type="button" class="btn small danger" data-r="del"${l.rows.length < 2 ? ' disabled' : ''}>Удалить ряд</button></div>`);
    const name = d.querySelector('#tlRowName');
    name.select();
    name.addEventListener('input', () => { r.label = str(name.value, LIMIT.label); touchList(l); renderEditor(); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeDialog(); } });
    const setColor = (c) => { r.color = c; touchList(l); renderEditor(); d.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color.toLowerCase() === c.toLowerCase()))); };
    d.querySelector('#tlRowColor').addEventListener('input', (e) => { if (COLOR_RE.test(e.target.value)) setColor(e.target.value); });
    d.querySelector('.tl-dlg-body').addEventListener('click', (e) => {
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
  async function pngOut(copy) {
    const l = S.list;
    if (!l.rows.some((r) => r.items.length)) { toast('Сначала разложи карточки по рядам.', true); return; }
    try {
      const c = await drawPicture(l);
      const blob = await toBlob(c, 'image/png');
      if (!blob) throw new Error('blob');
      if (copy) {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('Картинка скопирована, можно вставлять в чат.');
          return;
        }
        toast('Браузер не умеет копировать картинки, поэтому она скачается файлом.');
      }
      download(blob, safeName(l) + '.png');
    } catch (e) { toast('Не получилось сделать картинку, попробуй ещё раз.', true); }
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
    if (file.size > LIMIT.json) { toast('Файл слишком большой.', true); return; }
    let d;
    try { d = JSON.parse(await file.text()); } catch (e) { toast('Это не файл тир-листа.', true); return; }
    if (!d || d.casualhubTier !== 1) { toast('Это не файл тир-листа.', true); return; }
    const l = clean({ ...d.list, id: rid('t'), at: Date.now() });
    if (!l) { toast('Это не файл тир-листа.', true); return; }
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
    save();
    open(l.id);
  }

  // ---------- нажатия ----------
  async function startNew(how) {
    if (how === 'file') { $('#tlFile').click(); return; }
    const l = newList();
    open(l.id);
    await route();
    if (how === 'ratings') addRatingsDialog();
    if (how === 'stickers') addStickersDialog();
    if (how === 'empty') $('#tlTitle').focus();
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
    if (a === 'add-img') $('#tlImgs').click();
    else if (a === 'add-text') addTextDialog();
    else if (a === 'add-ratings') addRatingsDialog();
    else if (a === 'add-stickers') addStickersDialog();
    else if (a === 'add-row') { l.rows.push({ id: rid('r'), label: '', color: COLORS[COLORS.length - 1], items: [] }); touchList(l); renderEditor(); rowDialog(l.rows[l.rows.length - 1].id); }
    else if (a === 'png') { b.disabled = true; pngOut(false).finally(() => { b.disabled = false; }); }
    else if (a === 'copy') { b.disabled = true; pngOut(true).finally(() => { b.disabled = false; }); }
    else if (a === 'file') fileOut().catch(() => toast('Не получилось сохранить файл.', true));
    else if (a === 'clear') armed(b, 'clear', 'Точно убрать?', () => { l.rows.forEach((r) => { l.pool.push(...r.items); r.items = []; }); S.sel = ''; touchList(l); renderEditor(); });
    else if (a === 'delete') armed(b, 'delete', 'Точно удалить?', () => {
      dropImgs(Object.values(l.items).map((it) => it.img).filter(Boolean));
      lists = lists.filter((x) => x !== l);
      save();
      S.list = null;
      location.hash = '';
    });
    else if (a === 'sel-pool') { if (S.sel) { moveTo(S.sel, '', ''); S.sel = ''; renderEditor(); } }
    else if (a === 'sel-del') { if (S.sel) { removeItems([S.sel]); S.sel = ''; renderEditor(); } }
  }
  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) { startNew(e.target.closest('[data-new]').dataset.new); return; }
    if (!S.list || justDragged) return;
    const act = e.target.closest('[data-do]');
    if (act) { doAction(act.dataset.do, act); return; }
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
    if (e.target.id === 'tlTitle' && S.list) { S.list.title = str(e.target.value, LIMIT.title); touchList(S.list); }
  });
  view.addEventListener('change', (e) => {
    if (e.target.id === 'tlCaps' && S.list) { S.list.captions = e.target.checked; touchList(S.list); renderEditor(); }
    if (e.target.id === 'tlImgs' && S.list) { addFiles(e.target.files); e.target.value = ''; }
    if (e.target.id === 'tlFile') { if (e.target.files[0]) fileIn(e.target.files[0]); e.target.value = ''; }
  });
  document.addEventListener('keydown', (e) => {
    if (dlg) { if (e.key === 'Escape') { e.preventDefault(); closeDialog(); } return; }
    if (!S.list || !S.sel || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    const l = S.list, id = S.sel, list = whereIs(l, id), at = list.indexOf(id);
    if (e.key === 'Escape') { S.sel = ''; renderEditor(); e.stopPropagation(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeItems([id]); S.sel = ''; renderEditor(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const j = at + (e.key === 'ArrowLeft' ? -1 : 1);
      if (j >= 0 && j < list.length) { list.splice(j, 0, list.splice(at, 1)[0]); S.pop = id; touchList(l); renderEditor(); }
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
    const it = e.target.closest('.tl-it');
    if (!it || e.button > 0 || e.pointerType === 'touch' || !S.list) return;
    drag = { id: it.dataset.id, x: e.clientX, y: e.clientY, moved: false, src: it, ghost: null, row: null, near: null };
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
      if (ev.type === 'pointerup' && d.row) moveTo(d.id, d.row.dataset.row, d.near ? d.near.dataset.id : '', d.after);
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

  // другая вкладка изменила тир-листы
  addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    lists = readLists();
    if (drag) return;
    route();
  });

  // ---------- адрес: #l=<id> — редактор, без него — список ----------
  async function route() {
    const id = hashId();
    const l = id ? lists.find((x) => x.id === id) : null;
    if (!l) {
      if (id) history.replaceState(null, '', location.pathname);
      S.sel = '';
      closeDialog();
      await renderHome();
      return;
    }
    const same = S.list && S.list.id === l.id;
    S.list = l;
    if (!same) { S.sel = ''; view.innerHTML = ''; }
    await loadUrls(Object.values(l.items).map((it) => it.img).filter(Boolean));
    if (S.list === l) renderEditor();
  }
  addEventListener('hashchange', route);

  // ---------- тема: одна на весь сайт ----------
  const THEMES = window.CasualThemes.list, THEME_IDS = THEMES.map((t) => t.id);
  function readThemePref() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (p && THEME_IDS.includes(p.theme)) return p.theme;
    } catch (e) {}
    return 'auto';
  }
  function writeThemePref(t) {
    try {
      let p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
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

  route();
})();
