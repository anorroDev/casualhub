(() => {
  const TAU = Math.PI * 2;
  const KEY = 'koleso-vybyvanie-v1';
  const $ = (s) => document.querySelector(s);
  const canvas = $('#wheel');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drawRot = null; // пока колесо крутит видеокарта, рисуем его в стартовом положении
  const FONT = 'Onest, ui-sans-serif, system-ui, sans-serif';
  const SAMPLE = ['Hollow Knight', 'Hades', 'Disco Elysium', 'Outer Wilds', 'Celeste', 'Inscryption'];
  const DUR_MIN = 1, DUR_MAX = 30; // секунды прокрута
  const HUBS = [[24, 'Малый'], [34, 'Средний'], [44, 'Большой']];

  // сектора: цвета аватаров «Оценщика» плюс лайм и графит; подпись тёмная или белая, смотря что контрастнее
  // надетое из магазина (shop.js помнит его в casualhub.shop.v1 для вошедшего): палитра колеса и цвета конфетти
  const SHOP = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('casualhub.shop.v1') || 'null'), u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null');
      return s && s.look && u && String(u.id) === s.uid ? s.look : {};
    } catch (e) { return {}; }
  })();
  const PALETTE = (SHOP.wheel && Array.isArray(SHOP.wheel.palette) && SHOP.wheel.palette.length ? SHOP.wheel.palette : null) || ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#F97316', '#06B6D4', '#E4553F', '#84CC16', '#64748B'];
  const INK_ON = '#14161C';
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const SEG_COLORS = PALETTE.map((c) => {
    const L = lum(c);
    return { c, t: (L + 0.05) / (lum(INK_ON) + 0.05) >= 1.05 / (L + 0.05) ? INK_ON : '#FFFFFF' };
  });
  const colorOf = (i) => SEG_COLORS[(Math.max(1, i.id) - 1) % SEG_COLORS.length];


  const svg = (inner, size, sw) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  const ICON = {
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 16, 2),
    xs: svg('<path d="M6 6l12 12M18 6L6 18"/>', 11, 3),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 20, 2),
    add: svg('<path d="M12 5v14M5 12h14"/>', 16, 2.2),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16, 2.4),
    play: svg('<path d="M8 5l11 7-11 7z"/>', 16, 2),
    pause: svg('<path d="M8 5v14M16 5v14"/>', 16, 2.6),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>', 16, 2),
  };

  // вылет и щелчки всегда стандартные; выбирать можно фон страницы и трек победы
  const MUSIC_SLOTS = [
    ['bg', 'Фон', 'играет по кругу, пока ты на странице'],
    ['win', 'Победа', 'играет, когда есть победитель'],
  ];
  // треки на выбор: ровно те ссылки, что дал хозяин колеса; играют через встроенные плееры YouTube и Spotify
  const PRESETS = [
    // start — секунда, где начинается звук: тишина в начале ролика пропускается (замерено по громкости дорожки)
    { id: 'vika', title: 'VI KA — Гимн Папича (Arthas)', src: 'yt', key: 'SXe1aTEJU2w', start: 0.6 },
    { id: 'mk', title: 'Mortal Kombat — Techno Syndrome', src: 'yt', key: 'kWO2AuJT67w', start: 0.4 },
    { id: 'serious', title: 'Serious Sam — The Grand Cathedral', src: 'yt', key: '0IVRoqDWwIk', start: 5.5 },
    { id: 'chopin', title: 'Шопен — Вальс до-диез минор, оп. 64 № 2', src: 'yt', key: 'SUT_0c2QVzo', start: 5 },
    { id: 'eva', title: 'Evangelion — E05 (ReMaster TV Original)', src: 'yt', key: '7dVDG6IqtV8', alt: ['ELcLRK8LZ-o'], start: 0 },
  ];
  const DEFAULT_WIN = 'vika'; // победа по умолчанию
  const presetOf = (v) => (typeof v === 'string' && v.startsWith('preset:') ? PRESETS.find((p) => p.id === v.slice(7)) || null : null);
  const EMPTY_HTML = `<li class="empty">
    <div class="ghost-rows" aria-hidden="true"><span>1</span><b class="w1"></b><i></i><span>2</span><b class="w2"></b><i></i><span>3</span><b class="w3"></b><i></i></div>
    <p><strong>Колесо пустое.</strong> Впиши первого участника выше или вставь сразу целый список.</p>
  </li>`;

  let S = null, T = {}, dpr = 1, size = 0, autoTimer = 0, clearTimer = 0, ac = null, lastTick = 0;
  const fitCache = new Map();

  // два независимых колеса: основное и «по ссылке» (лоты зрителей). Настройки у них общие (музыка, картинка в центре, время),
  // а список, шансы, вылетевшие и режим у каждого свои. В S лежит открытое сейчас колесо, второе ждёт в stash
  const WHEEL_FIELDS = ['items', 'seq', 'outSeq', 'rot', 'sample', 'pick', 'auto'];
  const linkFresh = () => ({ items: [], seq: 0, outSeq: 0, rot: 0, sample: false, pick: 'out', auto: false });
  const wheelPart = (o) => { const r = {}; WHEEL_FIELDS.forEach((k) => { r[k] = o[k]; }); return r; };
  let scope = 'main', savedScope = 'main', stash = linkFresh(), linkStatus = '';

  // ---------- helpers ----------
  const pct = (x) => {
    const v = x * 100;
    return (v > 0 && v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v))) + '%';
  };
  const esc = window.CasualUtil.esc; // общий, /util.js
  const mod = (a, m) => ((a % m) + m) % m;
  const nearest = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const rnd = () => {
    try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; }
    catch (e) { return Math.random(); }
  };

  // ---------- state ----------
  function fresh() {
    return {
      v: 3, items: [], seq: 0, outSeq: 0, rot: 0,
      duration: 8, pick: 'out', auto: false, sound: true, sample: false, hub: 24, gif: '', section: 'wheel',
      music: { bg: '', win: 'preset:vika' }, bgOn: true, vol: 80,
    };
  }
  function makeItem(name) {
    const id = ++S.seq;
    return { id, name, out: false, outOrder: 0 };
  }
  const alive = () => S.items.filter((i) => !i.out);

  // шансы у всех на колесе равные: победить 1 из N, вылететь на этом спине тоже 1 из N
  function chances() {
    const a = alive(), n = a.length, res = new Map();
    a.forEach((i) => res.set(i.id, n === 1 ? { win: 1, drop: 0 } : { win: 1 / n, drop: 1 / n }));
    return res;
  }

  function segments() {
    const a = alive(), ch = chances(), out = [];
    let acc = 0;
    a.forEach((i) => {
      const p = a.length === 1 ? 1 : ch.get(i.id).drop;
      if (p <= 0) return;
      out.push({ item: i, p, start: acc * TAU, end: (acc + p) * TAU });
      acc += p;
    });
    return out;
  }

  function segAt(rot, segs) {
    const a = mod(-Math.PI / 2 - rot, TAU);
    return segs.find((s) => a >= s.start && a < s.end) || segs[segs.length - 1];
  }

  let shownLastOut; // последний вылетевший, который уже показан в списке
  const freshRows = new Set(); // id строк, которые только что появились: въезжают один раз
  function addItem(name) {
    name = String(name).trim().slice(0, 60);
    if (!name) return 'empty';
    if (S.sample) { S.items = []; S.outSeq = 0; S.sample = false; }
    if (alive().some((i) => i.name.toLowerCase() === name.toLowerCase())) return 'dup';
    const it = makeItem(name);
    S.items.push(it);
    freshRows.add(it.id); // строка въедет в список при следующей отрисовке
    return 'added';
  }

  // ---------- «В планах» из Мнения ----------
  // Свои оценки со статусом «В планах»: те, что лежат в этом браузере (их хранит Мнение), плюс те, что есть в аккаунте.
  // С аккаунта приходят и оценки, поставленные на другом устройстве; из двух версий одной оценки берётся более свежая
  const PLAN_RATINGS_KEY = 'ocenshik.ratings.v2';
  const PLAN_USER_KEY = 'ocenshik.user.v1';
  const PLAN_TOKENS_KEY = 'casualhub.tokens.v1';
  const PLAN_DELETED_KEY = 'casualhub.deleted.v1'; // удалённые здесь, но ещё не отправленные в аккаунт
  let plansCat = '*';
  let plansRemote = null; // { ratings, deleted } с сервера, пока не загрузилось — null
  const nameKey = (n) => String(n || '').trim().slice(0, 60).toLowerCase();
  const planStamp = (r) => +new Date(r.updatedAt || r.createdAt || 0) || 0;
  const readLS = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } };
  function readPlans() {
    const user = readLS(PLAN_USER_KEY, null);
    let local = readLS(PLAN_RATINGS_KEY, []);
    if (!Array.isArray(local)) local = [];
    local = local.filter((r) => {
      const a = r && r.author;
      return r && !r.example && (user && user.id ? a && a.id === user.id : !a || a.name === 'Гость');
    });
    const byId = new Map(local.filter((r) => r.id).map((r) => [r.id, r]));
    if (user && user.id && plansRemote) {
      // удалённое на любом устройстве больше не показываем, если после удаления оценку не меняли
      const gone = new Map();
      [...plansRemote.deleted, ...readLS(PLAN_DELETED_KEY, [])].forEach((d) => { if (d && d.id) gone.set(d.id, Math.max(gone.get(d.id) || 0, +d.at || 0)); });
      plansRemote.ratings.forEach((r) => {
        if (!r || !r.id || r.example) return;
        const loc = byId.get(r.id);
        if (!loc || planStamp(r) > planStamp(loc)) byId.set(r.id, Object.assign({}, r, { catName: r.catName || r.catLabel }));
      });
      gone.forEach((at, id) => { const r = byId.get(id); if (r && planStamp(r) <= at) byId.delete(id); });
    }
    const seen = new Set();
    return [...byId.values()].filter((r) => {
      if (!/В планах/.test(r.status || '') || !String(r.name || '').trim()) return false;
      const k = nameKey(r.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  // свои оценки из аккаунта; без входа ничего не делаем
  let plansPulling = null, plansPulledAt = 0;
  function pullPlans() {
    const user = readLS(PLAN_USER_KEY, null);
    const token = user && user.id && (readLS(PLAN_TOKENS_KEY, {}) || {})[user.id];
    if (!token) { if (plansRemote) { plansRemote = null; renderPlans(); } return; }
    if (plansPulling || Date.now() - plansPulledAt < 20e3) return;
    const get = (url) => fetch(url, { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
    plansPulling = (user.serverId ? Promise.resolve(user.serverId) : get('/api/me').then((d) => d && d.user && d.user.id))
      .then((sid) => { planSid = sid || ''; return sid && get('/api/shelf/' + encodeURIComponent(sid)); })
      .then((d) => {
        if (!d || !Array.isArray(d.ratings)) return;
        plansRemote = { ratings: d.ratings, deleted: Array.isArray(d.deleted) ? d.deleted : [] };
        plansPulledAt = Date.now();
        renderPlans();
      })
      .catch(() => {})
      .finally(() => { plansPulling = null; });
  }
  // категория и год — отдельными кусками текста, чтобы английский словарь узнал название категории; у фильмов рядом рейтинг IMDb
  function planSub(r) {
    const year = (String(r.meta || '').match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/) || [])[1];
    const cat = r.catName ? esc(r.catName) : '';
    const I = window.CasualIMDb;
    let imdb = '';
    if (I && I.isMovie(r.catName)) {
      const x = { name: r.name, year: +year || 0 }, d = I.peek(x);
      imdb = d !== undefined ? I.badge(d) : `<span class="imdb-slot" data-imdb-n="${esc(r.name)}" data-imdb-y="${year || ''}"></span>`;
    }
    const cy = cat && year ? `${cat}<span> · ${year}</span>` : cat || year || '';
    return `<span>${cy}</span>${imdb}`;
  }
  // жанры — из описания оценки («2006, боевик, триллер»), как в фильтре жанров Мнения
  const planGenres = (r) => [...new Set(String(r.meta || '').split(/\s*[,;]\s*/).map((x) => x.trim().toLowerCase()).filter((x) => x && x.length <= 24 && !/^\d{4}$/.test(x)))];
  const planAdded = (r) => +new Date(r.createdAt || r.updatedAt || 0) || 0;
  let plansPane = false, plansGenre = '', plansWhen = '', plansSort = 'new';
  const plansInCat = (all) => (plansCat === '*' ? all : all.filter((r) => (r.catName || 'Другое') === plansCat));
  function plansRows(all) {
    let rows = plansInCat(all);
    if (plansGenre) rows = rows.filter((r) => planGenres(r).includes(plansGenre));
    if (plansWhen) {
      const now = Date.now(), D = 864e5;
      rows = rows.filter((r) => { const t = planAdded(r); return t && (plansWhen === 'old' ? now - t > 365 * D : now - t <= +plansWhen * D); });
    }
    const byName = (x, y) => x.name.localeCompare(y.name, 'ru', { sensitivity: 'base', numeric: true });
    return rows.slice().sort(plansSort === 'name' ? byName : plansSort === 'old' ? (x, y) => planAdded(x) - planAdded(y) || byName(x, y) : (x, y) => planAdded(y) - planAdded(x) || byName(x, y));
  }
  // вкладки: «Имена» — участники колеса, «В планах» — список из Мнения на их месте
  function paintPane() {
    $('#boardPane').hidden = plansPane;
    $('#plans').hidden = !plansPane;
    document.querySelectorAll('.view-tab').forEach((b) => b.setAttribute('aria-selected', String((b.dataset.pane === 'plans') === plansPane)));
  }

  // ---------- обложки в «В планах» ----------
  // своё фото — прямо в оценке или в IndexedDB (photo-store.js), из аккаунта — превью с сервера, у фильма без фото — постер с IMDb
  const planPics = new Map(); // id → Promise картинки ('' — нет)
  const planPicDone = new Map(); // id → картинка, когда уже известна
  const planById = new Map();
  let planSid = '';
  function planToken() {
    const user = readLS(PLAN_USER_KEY, null);
    return (user && user.id && (readLS(PLAN_TOKENS_KEY, {}) || {})[user.id]) || '';
  }
  function planThumb(r) {
    const user = readLS(PLAN_USER_KEY, null), token = planToken(), sid = (user && user.serverId) || planSid;
    if (!token || !sid) return Promise.resolve('');
    return fetch(`/api/photo/${encodeURIComponent(sid)}/${encodeURIComponent(r.id)}?thumb=1`, { headers: { authorization: 'Bearer ' + token } })
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => (d && typeof d.data === 'string' && /^data:image\//.test(d.data) ? d.data : ''), () => '');
  }
  function planPoster(r) {
    const I = window.CasualIMDb;
    if (!I || !I.isMovie(r.catName)) return Promise.resolve('');
    const x = { name: r.name, year: I.yearOf(r.meta) || 0 };
    return I.want([x]).then((m) => { const d = m.get(I.keyOf(x)); return d && /^https:\/\//.test(d.p || '') ? d.p : ''; }, () => '');
  }
  function planPicSrc(r) {
    const ph = r.photo;
    if (ph && typeof ph.data === 'string' && /^data:image\//.test(ph.data)) return Promise.resolve(ph.data);
    const link = ph && (ph.url || (typeof ph.id === 'string' && /^https:\/\//.test(ph.id) ? ph.id : ''));
    if (link) return Promise.resolve(link);
    const P = window.CasualPhotos;
    const own = ph && P && P.isKey(ph.ref) ? P.get(ph.ref).then((d) => (typeof d === 'string' ? d : ''), () => '') : Promise.resolve('');
    return own.then((d) => d || (ph ? planThumb(r) : '')).then((d) => d || planPoster(r)).catch(() => '');
  }
  const putPic = (n, src) => {
    if (!src || !n.isConnected || n.querySelector('img')) return;
    const im = new Image(); im.alt = ''; im.decoding = 'async'; im.src = src;
    n.textContent = '';
    n.appendChild(im);
  };
  let picIO = null;
  function hydratePlanPics() {
    const list = $('#plansList');
    if (picIO) picIO.disconnect();
    const load = (n) => {
      const id = n.dataset.pic, r = planById.get(id);
      if (!r) return;
      if (!planPics.has(id)) planPics.set(id, planPicSrc(r).then((src) => { planPicDone.set(id, src); return src; }));
      planPics.get(id).then((src) => putPic(n, src));
    };
    const nodes = [...list.querySelectorAll('[data-pic]')];
    nodes.forEach((n) => { const src = planPicDone.get(n.dataset.pic); if (src) putPic(n, src); });
    const rest = nodes.filter((n) => !planPicDone.has(n.dataset.pic));
    if (!('IntersectionObserver' in window)) { rest.forEach(load); return; }
    picIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { picIO.unobserve(e.target); load(e.target); } }), { root: list, rootMargin: '240px 0px' });
    rest.forEach((n) => picIO.observe(n));
  }

  // ---------- обложки на колесе: у участников, добавленных из «В планах» ----------
  const wheelPics = new Map(); // ссылка → Image
  const itemSrc = new Map(); // id оценки → картинка ('' — нет), пока ищется — Promise
  let picRepaint = 0;
  function planRating(id) {
    if (planById.has(id)) return planById.get(id);
    const own = (readLS(PLAN_RATINGS_KEY, []) || []).find((r) => r && String(r.id) === id);
    return own || (plansRemote ? plansRemote.ratings.find((r) => r && String(r.id) === id) : null) || null;
  }
  function picImg(url) {
    let im = wheelPics.get(url);
    if (im) return im.complete && im.naturalWidth ? im : null;
    im = new Image();
    im.decoding = 'async';
    im.referrerPolicy = 'no-referrer';
    // догрузилась — колесо перерисуется, когда стоит (во время прокрутки canvas только поворачивается)
    im.onload = () => { clearTimeout(picRepaint); picRepaint = setTimeout(() => { if (!S.spinning) { draw(); updateTicker(); } }, 60); };
    im.src = url;
    wheelPics.set(url, im);
    return null;
  }
  function itemPicUrl(it) {
    if (!it || !it.plan) return '';
    if (it.pic) return it.pic;
    const have = itemSrc.get(it.plan);
    if (typeof have === 'string') return have;
    if (!have) {
      const r = planRating(it.plan);
      if (!r) { itemSrc.set(it.plan, ''); return ''; }
      itemSrc.set(it.plan, planPicSrc(r).then((src) => {
        itemSrc.set(it.plan, src || '');
        planPicDone.set(it.plan, src || '');
        if (src && !S.spinning) { picImg(src); }
        return src;
      }));
    }
    return '';
  }
  const itemPic = (it) => { const u = itemPicUrl(it); return u ? picImg(u) : null; };
  function showTick(it) {
    $('#ticker').textContent = it ? it.name : '—';
    const im = $('#tickerImg'), u = it ? itemPicUrl(it) : '';
    if (!im) return;
    if (u && im.getAttribute('src') !== u) im.src = u;
    im.hidden = !u;
  }

  function renderPlans() {
    const box = $('#plans');
    if (!box) return;
    const all = readPlans();
    $('#plansN').textContent = all.length || '';
    if (!plansPane) return; // список рисуем, только когда вкладка открыта
    const onWheel = new Set(alive().map((i) => nameKey(i.name)));
    const cats = new Map();
    all.forEach((r) => { const c = r.catName || 'Другое'; cats.set(c, (cats.get(c) || 0) + 1); });
    if (plansCat !== '*' && !cats.has(plansCat)) plansCat = '*';
    $('#plansCats').innerHTML = cats.size > 1
      ? [['*', 'Все', all.length], ...[...cats.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'ru')).map(([c, n]) => [c, c, n])]
        .map(([v, l, n]) => `<button type="button" data-pcat="${esc(v)}" aria-pressed="${v === plansCat}">${esc(l)} <b>${n}</b></button>`).join('')
      : '';
    // жанры — только те, что есть в выбранной категории; выбранный, но пропавший жанр сбрасывается
    const gn = new Map();
    plansInCat(all).forEach((r) => planGenres(r).forEach((g) => gn.set(g, (gn.get(g) || 0) + 1)));
    if (plansGenre && !gn.has(plansGenre)) plansGenre = '';
    $('#plansGenre').innerHTML = '<option value="">Все жанры</option>' + [...gn.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'ru'))
      .map(([g, n]) => `<option value="${esc(g)}"${g === plansGenre ? ' selected' : ''}>${esc(g)} (${n})</option>`).join('');
    $('#plansGenreBox').hidden = !gn.size;
    $('#plansWhen').value = plansWhen;
    $('#plansSort').value = plansSort;
    $('#plansFilt').hidden = all.length < 2;
    const rows = plansRows(all);
    planById.clear();
    rows.forEach((r) => planById.set(String(r.id), r));
    $('#plansList').innerHTML = rows.map((r) => {
      const on = onWheel.has(nameKey(r.name));
      const added = planAdded(r) ? new Date(planAdded(r)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      return `<li class="plrow${on ? ' on' : ''}"${added ? ` title="Добавлено в планы ${added}"` : ''}>
        <span class="pl-pic" data-pic="${esc(r.id)}" aria-hidden="true">${esc((String(r.name).trim()[0] || '?').toUpperCase())}</span>
        <div class="e-text"><span class="e-name">${esc(r.name)}</span><span class="e-sub">${planSub(r)}</span></div>
        <button type="button" class="pl-btn" data-plan="${esc(r.id)}" aria-pressed="${on}" aria-label="${on ? 'Убрать с колеса' : 'Добавить на колесо'}: ${esc(r.name)}" title="${on ? 'Убрать с колеса' : 'Добавить на колесо'}">${on ? ICON.check : ICON.add}</button>
      </li>`;
    }).join('');
    const filtered = plansGenre || plansWhen;
    if (!all.length) $('#plansList').innerHTML = '<li class="plans-empty">Пока пусто. Отметь фильм, игру или что угодно «В планах» в <a href="/opinion/">Мнении</a>, и оно появится здесь.</li>';
    else if (!rows.length) $('#plansList').innerHTML = '<li class="plans-empty">Под эти фильтры ничего не подходит.</li>';
    $('#plansShown').innerHTML = filtered && all.length ? `Показано ${rows.length} из ${plansInCat(all).length} · <button type="button" id="plansReset">Сбросить фильтры</button>` : '';
    const left = rows.filter((r) => !onWheel.has(nameKey(r.name))).length;
    $('#plansAll').innerHTML = left ? `Добавить все <span>(${left})</span>` : 'Всё уже на колесе';
    $('#plansAll').disabled = !left;
    $('#plansAll').parentElement.hidden = !rows.length;
    if (window.CasualIMDb) window.CasualIMDb.fill($('#plansList'));
    hydratePlanPics();
  }
  function plansAdd(list) {
    if (S.spinning) return;
    let added = 0;
    list.forEach((r) => {
      if (addItem(r.name) !== 'added') return;
      added++;
      const it = S.items[S.items.length - 1], src = planPicDone.get(String(r.id));
      it.plan = String(r.id);
      if (src && /^https:\/\//.test(src)) it.pic = src.slice(0, 500);
    });
    if (!added) return;
    msg(list.length === 1 ? `«${list[0].name}» на колесе.` : `Из планов добавлено: ${added}.`, 'ok');
    save();
    render();
  }
  function bindPlans() {
    $('#plansCats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pcat]');
      if (!b) return;
      plansCat = b.dataset.pcat;
      renderPlans();
    });
    $('#plansGenre').addEventListener('change', (e) => { plansGenre = e.target.value; renderPlans(); });
    $('#plansWhen').addEventListener('change', (e) => { plansWhen = e.target.value; renderPlans(); });
    $('#plansSort').addEventListener('change', (e) => { plansSort = e.target.value; renderPlans(); });
    $('#plansShown').addEventListener('click', (e) => {
      if (!e.target.closest('#plansReset')) return;
      plansGenre = ''; plansWhen = '';
      renderPlans();
    });
    $('#plansList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-plan]');
      if (!b || S.spinning) return;
      const r = readPlans().find((x) => String(x.id) === b.dataset.plan);
      if (!r) return renderPlans();
      const k = nameKey(r.name);
      const ex = alive().find((i) => nameKey(i.name) === k);
      if (ex) {
        // убираем только то, что ещё не крутилось: у вылетевших своя история
        S.items = S.items.filter((i) => i !== ex);
        msg(`«${ex.name}» убран с колеса.`, 'ok');
        save();
        render();
      } else plansAdd([r]);
    });
    $('#plansAll').addEventListener('click', () => plansAdd(plansRows(readPlans()).filter((r) => !alive().some((i) => nameKey(i.name) === nameKey(r.name)))));
    // оценки поменялись во вкладке с Мнением — список обновится сам
    window.addEventListener('storage', (e) => {
      if (e.key === PLAN_USER_KEY || e.key === PLAN_TOKENS_KEY) { plansPulledAt = 0; pullPlans(); }
      if (e.key === PLAN_RATINGS_KEY || e.key === PLAN_USER_KEY || e.key === PLAN_DELETED_KEY || e.key === null) renderPlans();
    });
    // вернулся на вкладку (например, поставил оценку на телефоне) — подтягиваем аккаунт заново, не чаще раза в 20 секунд
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pullPlans(); });
    pullPlans();
  }

  const examplesOn = () => { try { return localStorage.getItem('casualhub.examples.v1') !== '0'; } catch (e) { return true; } };
  function dropSample() {
    S.items = []; S.outSeq = 0; S.sample = false;
  }
  // примеры выключили в «Настройках» прямо на этой странице или в другой вкладке
  function examplesChanged() {
    if (examplesOn() || !S.sample || S.spinning) return;
    dropSample();
    save();
    render();
  }
  window.addEventListener('casualhub:examples', examplesChanged);
  window.addEventListener('storage', (e) => { if (e.key === 'casualhub.examples.v1') examplesChanged(); });
  function save() {
    try {
      const { spinning, ...rest } = S;
      const own = wheelPart(S);
      localStorage.setItem(KEY, JSON.stringify({ ...rest, ...(scope === 'main' ? own : stash) }));
      localStorage.setItem(LINK_KEY, JSON.stringify({ scope, ...(scope === 'main' ? stash : own) }));
    } catch (e) {}
    lotsLiveSoon();
  }

  // ---------- drawing ----------
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    T = { panel: g('--panel'), panel2: g('--panel-2'), ink: g('--ink'), ink3: g('--ink-3'), accent: g('--accent') };
  }

  function resize() {
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    size = Math.round(canvas.clientWidth * dpr); // clientWidth не меняется, когда колесо повёрнуто
    if (!size) return;
    canvas.width = size;
    canvas.height = size;
    fitCache.clear();
    draw();
  }

  function fit(text, maxW, font) {
    const k = font + '|' + maxW + '|' + text;
    if (fitCache.has(k)) return fitCache.get(k);
    let s = text;
    if (ctx.measureText(s).width > maxW) {
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      s += '…';
    }
    fitCache.set(k, s);
    return s;
  }

  // Перерисовка колеса. Без своих сегментов (обычная перерисовка после изменений) колесо не прыгает,
  // а плавно перетекает: выбывший или удалённый участник сужается до нуля, новый вырастает из нуля.
  // кадр анимации, который не замирает в фоне: на виду — обычный кадр экрана, во свёрнутой вкладке (Alt+Tab) — таймер.
  // Прокрутка считается по часам, поэтому в фоне колесо докручивается и останавливается вовремя, вылет и победа тоже срабатывают
  function bgFrame(fn) {
    const h = { done: false, id: 0, to: 0 };
    const go = () => { if (h.done) return; h.done = true; cancelAnimationFrame(h.id); clearTimeout(h.to); fn(performance.now()); };
    h.id = requestAnimationFrame(go);
    h.to = setTimeout(go, document.hidden ? 0 : 120);
    return h;
  }
  function bgCancel(h) { if (h && h.done === false) { h.done = true; cancelAnimationFrame(h.id); clearTimeout(h.to); } }
  let shownSegs = null, tweenRaf = 0;
  function draw(segs, hl) {
    if (segs || hl || S.spinning || reduced || !shownSegs || !size) {
      if (tweenRaf) { bgCancel(tweenRaf); tweenRaf = 0; }
      const out = segs || segments();
      paint(out, hl);
      shownSegs = out;
      return;
    }
    const next = segments();
    const same = next.length === shownSegs.length && next.every((x, k) => x.item.id === shownSegs[k].item.id && Math.abs((x.end - x.start) - (shownSegs[k].end - shownSegs[k].start)) < 1e-4);
    if (same) { if (!tweenRaf) paint(next); shownSegs = tweenRaf ? shownSegs : next; return; }
    tweenTo(next);
  }
  function tweenTo(next) {
    const prev = shownSegs;
    const ids = new Set(next.map((x) => x.item.id));
    // порядок как у нового колеса, а ушедшие стоят на прежнем месте и сужаются там
    const order = next.map((x) => x.item);
    prev.forEach((x, k) => {
      if (ids.has(x.item.id)) return;
      const before = prev.slice(0, k).reverse().find((p) => ids.has(p.item.id));
      order.splice(before ? order.findIndex((it) => it.id === before.item.id) + 1 : 0, 0, x.item);
    });
    const w0 = new Map(prev.map((x) => [x.item.id, x.end - x.start]));
    const w1 = new Map(next.map((x) => [x.item.id, x.end - x.start]));
    const t0 = performance.now(), D = 400;
    if (tweenRaf) bgCancel(tweenRaf);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / D);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      let acc = 0;
      const cur = [];
      for (const it of order) {
        const a = w0.get(it.id) || 0, b = w1.get(it.id) || 0;
        const w = a + (b - a) * k;
        if (w > 1e-4) cur.push({ item: it, p: w / TAU, start: acc, end: acc + w });
        acc += w;
      }
      paint(cur);
      shownSegs = cur;
      if (t < 1) tweenRaf = bgFrame(frame);
      else { tweenRaf = 0; shownSegs = next; paint(next); }
    };
    tweenRaf = bgFrame(frame);
  }

  function paint(segs, hl) {
    if (!size) return;
    const rot = drawRot == null ? S.rot : drawRot;
    const c = size / 2;
    const ring = Math.max(8, size * 0.03);
    const R = c - ring - 2 * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(c, c);

    if (!segs.length) {
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = T.panel2; ctx.fill();
    }

    for (const s of segs) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, rot + s.start, rot + s.end);
      ctx.closePath();
      ctx.fillStyle = colorOf(s.item).c;
      ctx.fill();
      if (hl && hl.id === s.item.id) { ctx.fillStyle = `rgba(255,255,255,${hl.a})`; ctx.fill(); }
    }

    if (segs.length > 1) {
      ctx.lineWidth = Math.max(1.5, 2 * dpr);
      ctx.strokeStyle = T.panel;
      for (const s of segs) {
        const a = rot + s.start;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
      }
    }

    // подписи вдоль радиуса, от обода к центру
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const inner = (S.hub / 100) * c + 6 * dpr, pad = 12 * dpr, maxW = Math.round(R - inner - pad);
    for (const s of segs) {
      const ang = s.end - s.start;
      const fs = Math.round(Math.min(R * 0.072, R * 0.68 * Math.min(ang, 1.2) * 0.55));
      // обложка у обода, как постер (2:3), подпись — ближе к центру; когда секторов мало, обложка крупнее
      const im = itemPic(s.item);
      const ph = Math.min(R * (segs.length <= 4 ? 0.2 : segs.length <= 6 ? 0.17 : 0.14) * (canvas.clientWidth < 420 ? 0.8 : 1), 2 * (R - pad) * Math.sin(Math.min(ang, 1.2) / 2) * 0.66), pw = ph * 0.68;
      const withPic = !!im && ph >= 18 * dpr;
      if (fs < 9 * dpr && !withPic) continue;
      const font = `600 ${fs}px ${FONT}`;
      ctx.save();
      ctx.rotate(rot + (s.start + s.end) / 2);
      let right = R - pad;
      if (withPic) {
        // постер стоит вертикально к ободу: поворачиваем его, чтобы верх смотрел наружу
        const cx = right - ph / 2, rr = Math.min(6 * dpr, pw * 0.16);
        const sw = im.naturalWidth, sh = im.naturalHeight, k = Math.min(sw / 0.68, sh);
        ctx.save();
        ctx.translate(cx, 0);
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-pw / 2, -ph / 2, pw, ph, rr); else ctx.rect(-pw / 2, -ph / 2, pw, ph);
        ctx.save();
        ctx.clip();
        ctx.drawImage(im, (sw - k * 0.68) / 2, (sh - k) / 2, k * 0.68, k, -pw / 2, -ph / 2, pw, ph);
        ctx.restore();
        ctx.lineWidth = Math.max(1, dpr); ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.stroke();
        ctx.restore();
        right -= ph + 6 * dpr;
      }
      const room = Math.round(Math.min(maxW, right - inner));
      if (fs >= 9 * dpr && room > fs * 1.5) {
        ctx.font = font;
        ctx.fillStyle = colorOf(s.item).t;
        ctx.fillText(fit(s.item.name, room, font), right, 0);
      }
      ctx.restore();
    }

    // обод: тёмное кольцо с ячейками, как шкала у «Оценщика»
    ctx.beginPath(); ctx.arc(0, 0, R + ring / 2, 0, TAU);
    ctx.lineWidth = ring; ctx.strokeStyle = T.ink; ctx.stroke();
    const nb = 36, cs = ring * 0.36;
    ctx.fillStyle = T.panel;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU;
      ctx.save();
      ctx.translate(Math.cos(a) * (R + ring / 2), Math.sin(a) * (R + ring / 2));
      ctx.rotate(a);
      ctx.globalAlpha = k % 2 ? 0.4 : 0.9;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-cs / 2, -cs / 2, cs, cs, cs * 0.3);
      else ctx.rect(-cs / 2, -cs / 2, cs, cs);
      ctx.fill();
      ctx.restore();
    }

    if (!segs.length) {
      ctx.fillStyle = T.ink3; ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(R * 0.07)}px ${FONT}`;
      ctx.fillText('Колесо пустое', 0, R * 0.55);
    }
  }

  // ---------- sound ----------
  function ensureAudio() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  // общая громкость 0…1 из ползунка «Громкость»
  const volume = () => Math.max(0, Math.min(100, S.vol == null ? 80 : +S.vol)) / 100;
  function tone(freq, t, len, vol, type) {
    vol = Math.max(0.0002, vol * volume());
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + len + 0.02);
  }
  function kick() {
    if (reduced) return;
    const p = $('#pointer');
    if (p.animate) p.animate([{ transform: 'translateX(-50%) rotate(-16deg)' }, { transform: 'translateX(-50%) rotate(0deg)' }], { duration: 140, easing: 'ease-out' });
  }
  function tick() {
    kick();
    if (!S.sound || !ac) return;
    const t = ac.currentTime;
    if (t - lastTick < 0.035) return;
    lastTick = t;
    tone(1500, t, 0.03, 0.05, 'square');
  }
  function playOut() {
    if (!S.sound || !ac) return;
    const t = ac.currentTime;
    tone(330, t, 0.18, 0.12); tone(220, t + 0.12, 0.3, 0.12);
  }
  // стандартная победа: фанфара по нотам и долгий аккорд, заметно громче щелчков
  function playWin() {
    if (!S.sound || !ac) return;
    const t = ac.currentTime + 0.02;
    [523, 659, 784, 1047, 784, 1047].forEach((f, k) => {
      tone(f, t + k * 0.13, 0.34, 0.22);
      tone(f / 2, t + k * 0.13, 0.3, 0.08, 'square');
    });
    const end = t + 6 * 0.13;
    [523, 659, 784, 1047].forEach((f) => tone(f, end, 1.4, 0.16));
    tone(262, end, 1.4, 0.1, 'square');
  }

  // ---------- spin ----------
  function lock(on) {
    $('#deskSet').disabled = on;
    $('#spin').disabled = on || alive().length < 2;
    $('#spin').classList.toggle('spinning', on);
    $('#stage').classList.toggle('is-spinning', on);
    $('#restart').disabled = on || !S.items.some((i) => i.out);
  }

  function spin() {
    if (S.spinning) return;
    const a = alive();
    if (a.length < 2) { idleStatus(); return; }
    if (S.pick === 'one' || a.length === 2) cueWin(); // этот спин может дать победителя
    // новый спин: песня прошлой победы замолкает
    if (CH.win.active) { stopChannel('win'); resumeBg(); }
    if (S.sound) ensureAudio();

    const segs = segments();
    const r = rnd();
    let acc = 0, pick = segs[segs.length - 1];
    for (const s of segs) { acc += s.p; if (r < acc) { pick = s; break; } }
    const target = pick.start + (0.06 + rnd() * 0.88) * (pick.end - pick.start);

    const dur = reduced ? 1200 : S.duration * 1000;
    const turns = reduced ? 1 : Math.max(2, Math.round(S.duration * 0.8));
    const from = S.rot;
    const base = -Math.PI / 2 - target;
    const to = base + TAU * Math.ceil((from + TAU * turns - base) / TAU);

    S.spinning = true;
    lock(true);
    setStatus('Крутится…', baseSub());
    lotsSpin(from, to, dur);
    const t0 = performance.now();
    let last = segAt(from, segs), nameAt = t0;
    showTick(last.item);

    // колесо рисуется один раз, а крутит его видеокарта: canvas поворачивается целиком, без перерисовки в каждом кадре
    drawRot = from;
    draw(segs);
    canvas.style.willChange = 'transform';
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      S.rot = from + (to - from) * e;
      const cur = segAt(S.rot, segs);
      if (cur !== last) { last = cur; tick(); }
      // на большой скорости имена мелькали бы и резали глаза: новое не чаще раза в 0,3 секунды, а к концу прокрутки — каждое
      if (now - nameAt >= 300 && $('#ticker').textContent !== last.item.name) { nameAt = now; showTick(last.item); }
      canvas.style.transform = `rotate(${S.rot - from}rad)`;
      if (t < 1) bgFrame(frame);
      else {
        showTick(last.item);
        drawRot = null;
        canvas.style.transform = '';
        canvas.style.willChange = '';
        draw(segs);
        land(pick, segs);
      }
    };
    bgFrame(frame);
  }

  function land(pick, segs) {
    if (S.pick === 'one') return landOne(pick, segs);
    setStatus(`Вылетает: <b>${esc(pick.item.name)}</b>`, baseSub(), 'bad');
    if (scope === 'link') livePick = pick.item.name;
    lotsLiveNow();
    // на последнем вылете звучит победная, её запускает showWinner
    if (alive().length > 2) playOut();
    // лот уходит за секунду: 0,6 с мигает под стрелкой, 0,4 с его сектор сужается до нуля
    const t0 = performance.now(), D = reduced ? 400 : 600;
    const pulse = (now) => {
      const t = (now - t0) / D;
      if (t < 1) {
        draw(segs, { id: pick.item.id, a: 0.5 * Math.abs(Math.sin(t * Math.PI * 3)) });
        bgFrame(pulse);
        return;
      }
      pick.item.out = true;
      pick.item.outOrder = ++S.outSeq;
      S.rot = mod(S.rot, TAU);
      S.spinning = false;
      lock(false);
      save();
      render(true);
      const left = alive();
      if (left.length === 1) {
        setStatus(`Победитель: <b>${esc(left[0].name)}</b>`, winSub(), 'good');
        showWinner(left[0]);
      } else {
        setStatus(`<b>${esc(pick.item.name)}</b> выбывает`, baseSub(), 'bad');
        if (S.auto) autoTimer = setTimeout(spin, reduced ? 600 : 1100);
      }
    };
    bgFrame(pulse);
  }

  // обычный режим: на кого показала стрелка, тот и победил, никто не выбывает
  function landOne(pick, segs) {
    setStatus(`Выпал: <b>${esc(pick.item.name)}</b>`, baseSub(), 'good');
    if (scope === 'link') livePick = pick.item.name;
    lotsLiveNow();
    const t0 = performance.now(), D = reduced ? 400 : 900;
    const pulse = (now) => {
      const t = (now - t0) / D;
      if (t < 1) {
        draw(segs, { id: pick.item.id, a: 0.5 * Math.abs(Math.sin(t * Math.PI * 3)) });
        bgFrame(pulse);
        return;
      }
      S.rot = mod(S.rot, TAU);
      S.spinning = false;
      lock(false);
      save();
      lastWinner = pick.item; // до отрисовки: «Экспорт» в шапке колеса появляется сразу
      render(true);
      setStatus(`Победитель: <b>${esc(pick.item.name)}</b>`, winSub(), 'good');
      showWinner(pick.item);
    };
    bgFrame(pulse);
  }

  // ---------- UI ----------
  function setStatus(main, sub, tier) {
    $('#statusMain').innerHTML = main;
    $('#statusSub').textContent = sub || '';
    const b = $('#aliveBadge');
    b.dataset.tier = tier || 'idle';
    b.textContent = alive().length;
  }
  function baseSub() {
    const n = alive().length, total = S.items.length;
    return n < total ? `осталось из ${total}` : 'участников на колесе';
  }
  const winSub = () => (S.pick === 'one' ? `выпал из ${S.items.length}` : `последний из ${S.items.length}`);
  function idleStatus() {
    const a = alive(), n = a.length;
    if (n >= 2) setStatus('Жми «Крутить»', baseSub());
    else if (n === 1 && S.items.some((i) => i.out) && S.pick !== 'one') setStatus(`Победитель: <b>${esc(a[0].name)}</b>`, winSub(), 'good');
    else if (n === 1) setStatus('Нужен ещё хотя бы один', 'добавь участника в список');
    else setStatus('Колесо пустое', 'добавь участников в список');
  }
  function msg(text, kind) {
    const el = $('#formMsg');
    el.textContent = text || '';
    el.className = 'field-msg' + (kind ? ' ' + kind : '');
  }
  function updateTicker() {
    const segs = segments();
    showTick(segs.length ? segAt(S.rot, segs).item : null);
  }
  function updateMeta() {
    const n = alive().length;
    $('#boardStat').innerHTML = `<b>${n}</b> на колесе`;
    $('#mnavCount').textContent = n;
    $('#aliveBadge').textContent = n;
  }
  function renderSegs() {
    $('#durRange').value = S.duration;
    $('#durVal').textContent = S.duration + ' с';
    $('#hubSeg').innerHTML = HUBS.map(([v, l]) => `<button type="button" data-hub="${v}" aria-pressed="${v === S.hub}">${l}</button>`).join('');
  }
  function markSeg(sel, attr, val) {
    document.querySelectorAll(`${sel} [${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(+b.getAttribute(attr) === val)));
  }
  function applySection() {
    $('#layout').dataset.section = S.section;
    document.querySelectorAll('#mnav [data-section]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.section === S.section)));
  }

  function render(keep) {
    paintPane();
    $('#sampleNote').hidden = !S.sample;
    // «Экспорт» в шапке колеса: пока есть победитель — и после закрытия его карточки, и после перезагрузки страницы
    $('#exportRes').hidden = !winnerNow();

    const a = alive(), ch = chances();
    $('#list').innerHTML = a.length
      ? a.map((i) => {
          const c = ch.get(i.id), col = colorOf(i);
          return `<li class="prow${freshRows.has(i.id) ? ' row-in' : ''}" data-id="${i.id}">
            <div class="pnm"><i class="sw" style="--c:${col.c}"></i><div class="e-text"><span class="e-name">${esc(i.name)}</span></div></div>
            <span class="pc" title="Шанс победы ${pct(c.win)} · шанс вылететь на этом спине ${pct(c.drop)}"><b>${pct(c.win)}</b><i>${pct(c.drop)}</i></span>
            <button type="button" class="mini-btn del" data-act="del" aria-label="Убрать ${esc(i.name)}">${ICON.x}</button>
          </li>`;
        }).join('')
      : EMPTY_HTML;

    const outs = S.items.filter((i) => i.out).sort((x, y) => x.outOrder - y.outOrder);
    $('#outBox').hidden = !outs.length;
    // последний вылетевший въезжает в список вылетевших
    const lastOut = outs.length ? outs[outs.length - 1].id : null;
    if (lastOut !== shownLastOut) { if (shownLastOut !== undefined && lastOut != null) freshRows.add('o' + lastOut); shownLastOut = lastOut; }
    $('#outList').innerHTML = outs.map((i, k) => `<li class="orow${freshRows.has('o' + i.id) ? ' row-in' : ''}">
        <span class="onum">${k + 1}</span>
        <span class="oname">${esc(i.name)}</span>
        <button type="button" class="link-btn" data-act="back" data-id="${i.id}">вернуть</button>
      </li>`).join('');
    freshRows.clear();

    $('#auto').checked = S.auto;
    $('#autoOpt').hidden = S.pick === 'one';
    document.querySelectorAll('#pickSeg [data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === S.pick)));
    $('#pickHint').textContent = S.pick === 'one'
      ? 'Одна прокрутка — один победитель, участники остаются на колесе.'
      : 'Каждая прокрутка выбивает одного, побеждает последний.';
    $('#snd').checked = S.sound;

    updateMeta();
    draw();
    updateTicker();
    $('#spin').disabled = S.spinning || a.length < 2;
    $('#restart').disabled = S.spinning || !outs.length;
    renderPlans();
    if (!keep) idleStatus();
  }

  // заставка победы: стикер, имя по буквам, сумма, конфетти; клик или клавиша — сразу к карточке
  let fxDone = null;
  function winFx(it) {
    const fx = $('#winFx');
    if (reduced) return Promise.resolve();
    return new Promise((resolve) => {
      const timers = [];
      const at = (ms, f) => timers.push(setTimeout(f, ms));
      let raf = 0;
      const stage = fx.querySelector('.fx-stage');
      const stick = fx.querySelector('.fx-sticker');
      const brow = fx.querySelector('.fx-eyebrow');
      const name = fx.querySelector('.fx-name');
      stage.querySelectorAll('.in').forEach((n) => n.classList.remove('in'));
      // случайный стикер из базовых картинок сайта
      const pool = BASE_HUBS.length ? BASE_HUBS : [];
      const st = pool[Math.floor(Math.random() * pool.length)];
      stick.innerHTML = st ? (st.video
        ? `<video src="${st.src}" autoplay muted loop playsinline></video>`
        : `<img src="${st.src}" alt="">`) : '';
      stick.hidden = !st;
      // имя: каждая буква прилетает со своей стороны, слова не рвутся
      const chars = Array.from(it.name);
      name.style.setProperty('--len', String(Math.min(chars.length, 24)));
      let k = 0;
      name.innerHTML = it.name.split(/(\s+)/).map((w) => /^\s+$/.test(w) ? w : `<span class="fx-word${Array.from(w).length > 12 ? ' long' : ''}">${Array.from(w).map((c) => {
        const a = Math.random() * TAU, dist = 160 + Math.random() * 220;
        return `<span class="fx-ch" style="--dx:${Math.round(Math.cos(a) * dist)}px;--dy:${Math.round(Math.sin(a) * dist)}px;--r:${Math.round((Math.random() - .5) * 400)}deg;--d:${(k++ * Math.min(70, 900 / chars.length)).toFixed(0)}ms">${esc(c)}</span>`;
      }).join('')}</span>`).join('');
      // заставка раскрывается кругом из центра колеса
      const wr = $('.wheel-wrap').getBoundingClientRect();
      fx.style.setProperty('--fx-x', `${Math.round(wr.left + wr.width / 2)}px`);
      fx.style.setProperty('--fx-y', `${Math.round(wr.top + wr.height / 2)}px`);
      fx.classList.remove('closing');
      fx.hidden = false;
      fx.classList.add('open');
      fx.querySelector('.fx-skip').focus({ preventScroll: true });
      const step = Math.min(110, 1400 / chars.length);
      name.querySelectorAll('.fx-ch').forEach((c, j) => c.style.setProperty('--d', (j * step).toFixed(0) + 'ms'));
      const nameAt = st ? 1100 : 400;
      const lettersEnd = nameAt + 800 + chars.length * step;
      at(st ? 150 : 0, () => stick.classList.add('in'));
      at(nameAt - 150, () => brow.classList.add('in'));
      at(nameAt, () => name.querySelectorAll('.fx-ch').forEach((c) => c.classList.add('in')));
      at(lettersEnd - 250, () => confetti());
      at(lettersEnd + 600, () => fx.querySelector('.fx-hint').classList.add('in'));
      const end = () => {
        if (!fxDone) return;
        fxDone = null;
        timers.forEach(clearTimeout);
        cancelAnimationFrame(raf);
        fx.removeEventListener('click', end);
        document.removeEventListener('keydown', onKey, true);
        clearInterval(watch);
        fx.querySelector('.fx-hint').classList.remove('in');
        prog.style.width = '0';
        fx.classList.remove('open');
        fx.classList.add('closing');
        setTimeout(() => {
          fx.hidden = true;
          fx.classList.remove('closing');
          stick.innerHTML = '';
          const cv = fx.querySelector('.fx-confetti');
          cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        }, 400);
        resolve();
      };
      const onKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); end(); }
      };
      fxDone = end;
      fx.addEventListener('click', end);
      document.addEventListener('keydown', onKey, true);
      // сама заставка уходит, когда кончилась песня победы; без песни (звук выключен, трек не включился) — через несколько секунд
      const t0 = Date.now();
      const minEnd = lettersEnd + 4000;
      const prog = fx.querySelector('.fx-prog');
      let lastBurst = 0, lastSwap = 0;
      const watch = setInterval(() => {
        const el = Date.now() - t0;
        const tr = winTrack();
        prog.style.width = (tr && tr.dur > 0 ? Math.min(1, tr.pos / tr.dur) : Math.min(1, el / minEnd)) * 100 + '%';
        if (el < minEnd) return;
        if (!tr) { end(); return; }
        // пока играет песня: время от времени снова конфетти и новый стикер
        if (el - lastBurst > 9000) { lastBurst = el; confetti(); }
        if (pool.length > 1 && el - lastSwap > 12000) {
          lastSwap = el;
          const nx = pool[Math.floor(Math.random() * pool.length)];
          stick.classList.remove('in');
          stick.innerHTML = nx.video ? `<video src="${nx.src}" autoplay muted loop playsinline></video>` : `<img src="${nx.src}" alt="">`;
          void stick.offsetWidth;
          stick.classList.add('in');
        }
      }, 400);

      function confetti() {
        const cv = fx.querySelector('.fx-confetti');
        const dpr = Math.min(2, devicePixelRatio || 1);
        cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
        const g = cv.getContext('2d');
        g.scale(dpr, dpr);
        const nb = name.getBoundingClientRect();
        const ox = nb.left + nb.width / 2, oy = nb.top + nb.height / 2;
        // конфетти из магазина: свои цвета, а форму частицы рисует shop.js (сердечки, звёзды, рофланы)
        const CONF = (SHOP.confetti && Array.isArray(SHOP.confetti.colors) && SHOP.confetti.colors.length) ? SHOP.confetti.colors : PALETTE;
        const shopPart = window.CasualShop && window.CasualShop.confettiPart;
        const parts = Array.from({ length: 160 }, (_, i) => {
          const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.6, v = 6 + Math.random() * 11;
          return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
            r: Math.random() * TAU, vr: (Math.random() - .5) * .4, c: CONF[i % CONF.length] };
        });
        const tick = () => {
          g.clearRect(0, 0, innerWidth, innerHeight);
          let alive = 0;
          for (const p of parts) {
            p.vx *= .985; p.vy = p.vy * .985 + .32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
            if (p.y > innerHeight + 20) continue;
            alive++;
            g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
            if (!(shopPart && shopPart(g, p.w, p.h))) g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
            g.restore();
          }
          if (alive) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    });
  }

  // ---------- итог розыгрыша: текст и картинка ----------
  let lastWinner = null;
  // текущий победитель: на выбывание — последний оставшийся, в «Одном победителе» — тот, кто выпал последним
  const winnerNow = () => (S.pick === 'one' ? (lastWinner && S.items.includes(lastWinner) ? lastWinner : null) : (S.items.length > 1 && alive().length === 1 ? alive()[0] : null));
  function resultData(it) {
    const outs = S.pick === 'one' ? [] : S.items.filter((i) => i.out).sort((x, y) => x.outOrder - y.outOrder);
    return {
      name: it.name,
      total: S.items.length,
      outs: outs.map((i) => ({ name: i.name })),
      date: new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
  }
  function resultText(it) {
    const d = resultData(it);
    const lines = [`🏆 Победитель: ${d.name}`];
    lines.push(S.pick === 'one' ? `Выпал с одной прокрутки из ${d.total}` : `Остался последним из ${d.total}`);
    if (d.outs.length) {
      lines.push('', 'Порядок вылета:');
      d.outs.forEach((o, k) => lines.push(`${k + 1}. ${o.name}`));
    }
    lines.push('', `Колесо Казуала · ${d.date}`, location.origin + '/wheel/');
    return lines.join('\n');
  }
  async function resultImage(it) {
    const d = resultData(it);
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
    const C = { bg: v('--bg', '#101114'), panel: v('--panel', '#17181c'), ink: v('--ink', '#f2f2f2'), ink2: v('--ink-2', '#b5b5b5'), ink3: v('--ink-3', '#7a7a7a'), line: v('--line', '#2a2b30'), accent: v('--accent', '#3550E8') };
    const disp = (v('--font-display', 'Handjet') || 'Handjet').split(',')[0].replace(/["']/g, '').trim();
    try { await document.fonts.load(`800 80px "${disp}"`); await document.fonts.load('600 30px Onest'); } catch (e) {}
    const W = 1080, rows = Math.min(d.outs.length, 14);
    const H = Math.max(1080, 720 + (rows ? 110 + rows * 52 : 0) + (d.outs.length > rows ? 52 : 0));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const rrect = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    // точечный фон, как на сайте
    g.fillStyle = C.line;
    for (let y = 20; y < H; y += 28) for (let x = 20; x < W; x += 28) g.fillRect(x, y, 2, 2);
    // лучи за победителем
    g.save(); g.translate(W / 2, 330); g.fillStyle = C.accent; g.globalAlpha = .12;
    for (let k = 0; k < 16; k++) { g.rotate(TAU / 16); g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, -620); g.lineTo(60, -620); g.closePath(); g.fill(); }
    g.restore();
    const fit = (text, font, size, max) => { let sz = size; do { g.font = font.replace('$', sz); sz -= 4; } while (g.measureText(text).width > max && sz > 20); };
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink3; g.font = `700 34px "${disp}", ${FONT}`;
    g.fillText('КОЛЕСО КАЗУАЛА', W / 2, 90);
    g.fillStyle = C.accent; g.font = `700 40px "${disp}", ${FONT}`;
    g.fillText('П О Б Е Д И Т Е Л Ь', W / 2, 230);
    g.fillStyle = C.ink; fit(d.name, `800 $px "${disp}", ${FONT}`, 190, W - 120);
    g.fillText(d.name, W / 2, 400);
    let y = 500;
    g.fillStyle = C.ink2; g.font = `600 32px ${FONT}`;
    g.fillText(S.pick === 'one' ? `выпал из ${d.total}` : `последний из ${d.total}`, W / 2, y + 20);
    y += 100;
    if (rows) {
      g.textAlign = 'left'; g.fillStyle = C.ink3; g.font = `700 30px "${disp}", ${FONT}`;
      g.fillText('ПОРЯДОК ВЫЛЕТА', 120, y); y += 24;
      g.fillStyle = C.panel; g.strokeStyle = C.line; g.lineWidth = 2;
      const boxH = rows * 52 + (d.outs.length > rows ? 52 : 0) + 24;
      rrect(100, y, W - 200, boxH, 24); g.fill(); g.stroke();
      y += 50;
      d.outs.slice(0, rows).forEach((o, k) => {
        g.font = `500 30px ${FONT}`;
        g.textAlign = 'left'; g.fillStyle = C.ink3; g.fillText(String(k + 1), 130, y);
        g.fillStyle = C.ink2; fit(o.name, `500 $px ${FONT}`, 30, 760); g.fillText(o.name, 190, y);
        g.font = `500 30px ${FONT}`;
        y += 52;
      });
      if (d.outs.length > rows) { g.textAlign = 'left'; g.fillStyle = C.ink3; g.fillText(`…и ещё ${d.outs.length - rows}`, 190, y); }
    }
    g.textAlign = 'center'; g.fillStyle = C.ink3; g.font = `500 28px ${FONT}`;
    g.fillText(`${d.date}  ·  ${location.host}/wheel`, W / 2, H - 50);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  function wMsg(t) { $('#wMsg').textContent = t || ''; }
  async function shareImage() {
    if (!lastWinner) return;
    wMsg('Рисую картинку…');
    try {
      const blob = await resultImage(lastWinner);
      const file = new File([blob], `wheel-${Date.now()}.png`, { type: 'image/png' });
      // на телефоне — системное «Поделиться» (сохранить в фото, отправить в чат), на компьютере — скачать файл
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Колесо Казуала', text: `Победитель: ${lastWinner.name}` }); wMsg(''); return; }
        catch (e) { if (e.name === 'AbortError') { wMsg(''); return; } }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      wMsg('Картинка сохранена.');
    } catch (e) { wMsg('Не получилось сделать картинку.'); }
  }
  // картинка с итогом прямо в буфер обмена: вставляется в чат через Ctrl+V или «Вставить»
  async function copyImage() {
    if (!lastWinner) return;
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
      wMsg('Этот браузер не умеет копировать картинки, сохраняю файл…');
      return shareImage();
    }
    wMsg('Рисую картинку…');
    try {
      // картинка отдаётся обещанием сразу: Safari копирует, только пока не прошло нажатие
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': resultImage(lastWinner) })]);
      wMsg('Картинка скопирована, можно вставить в чат.');
    } catch (e) {
      wMsg('Не получилось скопировать картинку. Нажми «Сохранить картинку».');
    }
  }
  async function copyResult() {
    if (!lastWinner) return;
    const text = resultText(lastWinner);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      try { ok = document.execCommand('copy'); } catch (e2) {}
      ta.remove();
    }
    wMsg(ok ? 'Текст скопирован, можно вставить в чат.' : 'Не удалось скопировать.');
  }

  function showWinner(it) {
    lastWinner = it;
    if (scope === 'link') lotsWinner = { n: it.name, at: Date.now() + lotsOffset, sum: '' };
    lotsLiveNow();
    wMsg('');
    playWinMusic();
    winFx(it).then(() => openWinnerCard(it));
  }
  function openWinnerCard(it) {
    $('#wName').textContent = it.name;
    const total = S.items.length;
    $('#wStats').innerHTML = `<span class="badge" data-tier="good">${total}</span>
         <div class="total-meta"><strong>участников было на колесе</strong><span>${S.pick === 'one' ? 'выпал с одной прокрутки' : 'остался последним'}</span></div>`;
    $('#wAgain').textContent = S.pick === 'one' ? 'Крутить ещё раз' : 'Новый раунд с теми же';
    $('#winner').hidden = false;
    $('#wAgain').focus();
  }
  // песня победы доигрывает до конца и после закрытия карточки; фон вернётся, когда она кончится
  function hideWinner() {
    if ($('#winner').hidden) return;
    $('#winner').hidden = true;
    if (CH.win.active) { stopChannel('win'); resumeBg(); }
    $('#restart').focus();
  }

  function restoreAll() {
    if (S.spinning) return;
    clearTimeout(autoTimer);
    stopChannel('win');
    resumeBg();
    S.items.forEach((i) => { i.out = false; i.outOrder = 0; });
    S.outSeq = 0;
    if (scope === 'link') lotsWinner = null;
    $('#winner').hidden = true;
    save();
    render();
  }

  // ---------- гифки в центре (хранятся в IndexedDB этого браузера) ----------
  let dbP = null, persistOk = true, G = [];
  function db() {
    if (!dbP) dbP = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('koleso-gifs', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('gifs', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
      } catch (e) { rej(e); }
    });
    return dbP;
  }
  function idbReq(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const tx = d.transaction('gifs', mode);
      const q = fn(tx.objectStore('gifs'));
      tx.oncomplete = () => res(q && q.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    }));
  }
  const gifsAll = () => idbReq('readonly', (s) => s.getAll());
  const gifPut = (rec) => idbReq('readwrite', (s) => s.put(rec));
  const gifDel = (id) => idbReq('readwrite', (s) => s.delete(id));

  function gifNote(text, kind) {
    const el = $('#gifNote');
    el.textContent = text || (persistOk
      ? 'GIF, PNG, JPG или WebP. Файл можно перетащить прямо на колесо.'
      : 'Браузер не даёт сохранить гифки: после перезагрузки их придётся загрузить заново.');
    el.className = 'field-msg' + (kind ? ' ' + kind : '');
  }

  function applyHub() {
    $('.wheel-wrap').style.setProperty('--hub', S.hub + '%');
    draw();
  }

  // базовые картинки для центра лежат в hub/ и перечислены в hub/index.json по группам:
  // стикеры «Папич by @St1ckyyy», roflan-эмоуты, эмоуты канала arthas
  let BASE_GROUPS = [], BASE_HUBS = [];
  // iPhone со старой iOS не играет WebM: рядом лежат те же ролики в MP4
  const WEBM_OK = (() => { try { return !!document.createElement('video').canPlayType('video/webm; codecs="vp9"'); } catch (e) { return false; } })();
  const vsrc = (src) => (WEBM_OK ? src : src.replace(/\.webm$/i, '.mp4'));
  function loadBaseHubs() {
    return fetch('hub/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => {
        BASE_GROUPS = d.groups || [];
        // убранный повтор: выбор переходит на оставшийся вариант того же смайла
        if (d.aliases && d.aliases[S.gif]) { S.gif = d.aliases[S.gif]; save(); }
        BASE_HUBS = BASE_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, src: vsrc(it.src), video: /\.webm$/i.test(it.src) })));
        if (!BASE_GROUPS.some((g) => g.id === S.baseGroup)) {
          const own = BASE_GROUPS.find((g) => g.items.some((it) => it.id === S.gif));
          S.baseGroup = own ? own.id : (BASE_GROUPS[0] && BASE_GROUPS[0].id);
        }
        renderBaseHubs();
        renderGifs();
      })
      .catch(() => { $('#baseThumbs').innerHTML = '<p class="field-msg">Базовые картинки не загрузились, обнови страницу.</p>'; });
  }
  function renderBaseHubs() {
    const g = BASE_GROUPS.find((x) => x.id === S.baseGroup) || BASE_GROUPS[0];
    $('#baseTabs').innerHTML = BASE_GROUPS.map((x) => `<button type="button" data-bgroup="${x.id}" aria-pressed="${g && x.id === g.id}">${esc(x.title)} <b>${x.items.length}</b></button>`).join('');
    $('#baseThumbs').innerHTML = g ? g.items.map((it) => {
      const b = BASE_HUBS.find((x) => x.id === it.id);
      return `<button type="button" class="th th-base" data-gif="${b.id}" aria-pressed="${b.id === S.gif}" title="${esc(b.name)}" aria-label="${esc(b.name)}">${b.video
        ? `<video data-src="${b.src}" muted loop playsinline preload="none"></video>`
        : `<img src="${b.src}" alt="" loading="lazy" decoding="async">`}</button>`;
    }).join('') : '';
    watchThumbVideos();
  }
  // видео-стикеры грузятся и играют, только пока видны: на телефоне не качаем все сразу
  let thumbObs = null;
  function watchThumbVideos() {
    const vids = [...document.querySelectorAll('#baseThumbs video[data-src]')];
    if (!('IntersectionObserver' in window)) { vids.forEach((v) => { v.src = v.dataset.src; v.play().catch(() => {}); }); return; }
    if (!thumbObs) {
      thumbObs = new IntersectionObserver((ents) => ents.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) { if (!v.getAttribute('src')) v.src = v.dataset.src; v.play().catch(() => {}); }
        else if (!v.paused) v.pause();
      }), { rootMargin: '120px' });
    }
    thumbObs.disconnect(); // старые миниатюры после перерисовки больше не нужны
    vids.forEach((v) => thumbObs.observe(v));
  }

  function renderGifs() {
    const base = BASE_HUBS.find((b) => b.id === S.gif);
    const cur = base ? null : G.find((g) => g.id === S.gif);
    const img = $('#hubImg'), vid = $('#hubVid');
    const src = base ? base.src : cur ? cur.url : '';
    const isVid = !!(base && base.video);
    if (src && !isVid) { img.src = src; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    if (isVid) {
      if (vid.getAttribute('src') !== src) vid.src = src;
      vid.hidden = false;
      vid.play().catch(() => {});
    } else if (!vid.hidden) {
      vid.pause(); vid.hidden = true; vid.removeAttribute('src'); vid.load();
    }
    $('#spin').classList.toggle('has-gif', !!src);
    document.querySelectorAll('#baseThumbs [data-gif]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gif === S.gif)));
    $('#thumbs').innerHTML =
      `<button type="button" class="th add" id="gifPick" aria-label="Загрузить гифку">${ICON.plus}<span>Гифка</span></button>` +
      `<button type="button" class="th" data-gif="" aria-pressed="${!src}">Без гифки</button>` +
      G.map((g) => `<span class="thw">
        <button type="button" class="th" data-gif="${g.id}" aria-pressed="${g.id === S.gif}" title="${esc(g.name)}"><img src="${g.url}" alt="${esc(g.name)}" loading="lazy" decoding="async"></button>
        <button type="button" class="th-x" data-del="${g.id}" aria-label="Удалить ${esc(g.name)}">${ICON.xs}</button>
      </span>`).join('');
  }

  async function addGifs(files) {
    const list = [...files].filter((f) => /^image\/(gif|png|jpe?g|webp)$/.test(f.type));
    if (!list.length) { gifNote('Это не картинка. Нужен файл GIF, PNG, JPG или WebP.', 'err'); return; }
    let added = 0;
    for (const f of list) {
      if (f.size > 20 * 1024 * 1024) { gifNote(`«${f.name}» больше 20 МБ, возьми файл поменьше.`, 'err'); continue; }
      const rec = { id: 'g' + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36), name: f.name, blob: f, added: Date.now() };
      try { await gifPut(rec); } catch (e) { persistOk = false; }
      G.push({ ...rec, url: URL.createObjectURL(f) });
      S.gif = rec.id;
      added++;
    }
    if (!added) return;
    if (S.hub === HUBS[0][0]) { S.hub = HUBS[1][0]; applyHub(); markSeg('#hubSeg', 'data-hub', S.hub); } // с гифкой центр крупнее
    save();
    renderGifs();
    gifNote();
  }

  function removeGif(id) {
    const g = G.find((x) => x.id === id);
    if (!g) return;
    gifDel(id).catch(() => {});
    URL.revokeObjectURL(g.url);
    G = G.filter((x) => x.id !== id);
    if (S.gif === id) S.gif = '';
    save();
    renderGifs();
  }

  // ---------- музыка: фон страницы и трек победы (свои файлы лежат в том же IndexedDB, kind: 'audio') ----------
  let A = [], pendingSlot = '', bgWasOn = false;
  const slotTitle = (slot) => (MUSIC_SLOTS.find((m) => m[0] === slot) || [, slot])[1];
  // фон: всё, кроме VI KA; победа: только VI KA (или свой файл)
  const slotPresets = (slot) => (slot === 'bg' ? PRESETS.filter((p) => p.id !== DEFAULT_WIN) : PRESETS.filter((p) => p.id === DEFAULT_WIN));
  const CH = {
    bg: { active: false, type: null, el: null, loop: false, onFail: null },
    win: { active: false, type: null, el: null, loop: false, onFail: null },
  };

  // ---------- встроенные плееры YouTube и Spotify, по одному на канал ----------
  const EMB = { ytApi: null, spApi: null, yt: {}, ytReady: {}, sp: {}, spReady: {}, spUri: {}, cued: {}, failed: false };
  // песню победы подгружаем, пока колесо крутится: на победе она заиграет сразу, без паузы и тишины
  function cueWin() {
    const p = presetOf(S.music.win);
    if (!S.sound || !p || p.src !== 'yt' || EMB.failed || CH.win.active) return;
    ytPlayer('win').then((y) => { if (CH.win.active) return; try { y.cueVideoById({ videoId: p.key, startSeconds: p.start || 0 }); EMB.cued.win = p.key; } catch (e) {} }).catch(() => {});
  }
  // громкость играющего канала: свой файл и YouTube (у Spotify в плеере её не поменять)
  function applyVolume(ch) {
    const c = CH[ch], k = ch === 'bg' ? 0.6 : 1;
    if (c.el) c.el.volume = Math.min(1, volume() * k);
    try { if (EMB.yt[ch] && EMB.yt[ch].setVolume) EMB.yt[ch].setVolume(Math.round(volume() * k * 100)); } catch (e) {}
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  function ytApi() {
    if (!EMB.ytApi) {
      EMB.ytApi = Promise.race([new Promise((res, rej) => {
        if (window.YT && window.YT.Player) { res(); return; }
        window.onYouTubeIframeAPIReady = () => res();
        loadScript('https://www.youtube.com/iframe_api').catch(rej);
      }), timeout(15000)]);
      EMB.ytApi.catch(() => { EMB.failed = true; });
    }
    return EMB.ytApi;
  }
  function spApi() {
    if (!EMB.spApi) {
      EMB.spApi = Promise.race([new Promise((res, rej) => {
        window.onSpotifyIframeApiReady = (api) => res(api);
        loadScript('https://open.spotify.com/embed/iframe-api/v1').catch(rej);
      }), timeout(15000)]);
      EMB.spApi.catch(() => { EMB.failed = true; });
    }
    return EMB.spApi;
  }
  function ytPlayer(ch) {
    if (!EMB.ytReady[ch]) {
      EMB.ytReady[ch] = ytApi().then(() => new Promise((res) => {
        EMB.yt[ch] = new YT.Player('yt-' + ch, {
          width: 192, height: 108,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => res(EMB.yt[ch]),
            onStateChange: (e) => { if (e.data === 0) channelEnded(ch); },
            onError: (e) => {
              // запасная копия ролика, если основной нельзя встраивать
              const c = CH[ch];
              if (c.active && c.type === 'yt' && c.alts && c.alts.length) { EMB.yt[ch].loadVideoById({ videoId: c.alts.shift(), startSeconds: 0 }); return; }
              embedFailed(ch, e.data === 150 || e.data === 101
              ? 'Автор этого ролика на YouTube запретил проигрывать его на других сайтах. Поставь трек через «Свой файл».'
              : 'YouTube не дал проиграть этот трек.');
            },
          },
        });
      }));
    }
    return EMB.ytReady[ch];
  }
  function spPlayer(ch, uri) {
    if (!EMB.spReady[ch]) {
      EMB.spUri[ch] = uri;
      EMB.spReady[ch] = spApi().then((api) => new Promise((res) => {
        api.createController(document.getElementById('sp-' + ch), { uri, width: '100%', height: 80 }, (ctrl) => {
          EMB.sp[ch] = ctrl;
          ctrl.addListener('ready', () => res(ctrl));
          ctrl.addListener('playback_update', (e) => {
            const d = e && e.data;
            if (d) { CH[ch].pos = d.position; CH[ch].dur = d.duration; }
            if (d && d.duration && !d.isPaused && d.position >= d.duration - 400) channelEnded(ch);
          });
        });
      }));
    }
    return EMB.spReady[ch];
  }
  // плееры живут за пределами экрана, на странице видна только строка «Сейчас играет»
  function showFrame(ch, p) {
    const box = $('#mplayer-' + ch);
    box.hidden = false;
    box.querySelector('.mp-title').textContent = p.title;
    paintPlayers();
  }
  const hideFrame = (ch) => { $('#mplayer-' + ch).hidden = true; };

  // ролик не играет: сообщаем, а на победе звучит стандартная фанфара
  function embedFailed(ch, text) {
    const c = CH[ch];
    if (!c.active) return;
    musicNote(text + (ch === 'win' ? ' Пока играет стандартная фанфара.' : ''), 'err');
    hideFrame(ch);
    const f = c.onFail;
    Object.assign(c, { active: false, type: null, onFail: null });
    renderMusic();
    if (f) f();
  }
  async function startPreset(ch, p) {
    const c = CH[ch];
    showFrame(ch, p);
    try {
      if (p.src === 'yt') {
        const y = await ytPlayer(ch);
        if (!c.active || c.type !== 'yt') return;
        c.alts = (p.alt || []).slice();
        applyVolume(ch);
        // ролик уже подгружен во время вращения — просто включаем с нужной секунды, без паузы на загрузку
        if (EMB.cued[ch] === p.key) y.seekTo(p.start || 0, true);
        else y.loadVideoById({ videoId: p.key, startSeconds: p.start || 0 });
        EMB.cued[ch] = null;
        y.playVideo();
        // iPhone и Android молча блокируют звук без нажатия: если трек так и не заиграл, звучит стандартная фанфара
        setTimeout(() => {
          if (!c.active || c.type !== 'yt') return;
          let st = -1;
          try { st = y.getPlayerState(); } catch (e) {}
          if (st !== 1 && st !== 3) embedFailed(ch, ch === 'bg' ? 'Браузер не дал включить музыку сам: нажми ▶ у фоновой музыки.' : 'Браузер не дал включить трек без нажатия.');
        }, 4000);
      } else {
        const uri = 'spotify:track:' + p.key;
        const s = await spPlayer(ch, uri);
        if (!c.active || c.type !== 'sp') return;
        if (EMB.spUri[ch] !== uri) { s.loadUri(uri); EMB.spUri[ch] = uri; setTimeout(() => { if (c.active && c.type === 'sp') s.play(); }, 500); }
        else s.play();
      }
    } catch (e) {
      embedFailed(ch, 'Треки из списка играют на casualhub.pages.dev, здесь встроенные плееры недоступны.');
    }
  }
  // включить канал; false — играть нечего (тогда звучит стандартный звук)
  function playChannel(ch, opts = {}) {
    stopChannel(ch);
    if (!S.sound && !opts.force) return false;
    const c = CH[ch];
    const v = S.music[ch];
    const p = presetOf(v);
    if (p) {
      if (EMB.failed) return false;
      Object.assign(c, { active: true, paused: false, type: p.src, loop: !!opts.loop, onFail: opts.onFail || null, start: p.start || 0 });
      startPreset(ch, p);
      renderMusic();
      return true;
    }
    const rec = A.find((a) => a.id === v);
    if (!rec) return false;
    const el = new Audio(rec.url);
    showFrame(ch, { title: rec.name });
    // тишина в начале файла пропускается; по кругу тоже с первой секунды со звуком (см. channelEnded)
    el.loop = !!opts.loop && !(rec.start > 0);
    if (rec.start > 0) el.currentTime = rec.start;
    el.volume = Math.min(1, volume() * (ch === 'bg' ? 0.6 : 1));
    el.addEventListener('ended', () => channelEnded(ch));
    const fail = opts.onFail || null;
    // заблокированный автозапуск своего файла: на победе вместо него стандартная фанфара
    el.play().catch(() => { if (c.el === el) { stopChannel(ch); if (fail) fail(); } });
    Object.assign(c, { active: true, paused: false, type: 'file', el, loop: !!opts.loop, onFail: null, start: rec.start || 0 });
    renderMusic();
    return true;
  }
  function stopChannel(ch) {
    const c = CH[ch];
    const was = c.active;
    c.active = false;
    if (c.el) { c.el.pause(); c.el = null; }
    try { if (c.type === 'yt' && EMB.yt[ch] && EMB.yt[ch].pauseVideo) EMB.yt[ch].pauseVideo(); } catch (e) {}
    try { if (c.type === 'sp' && EMB.sp[ch]) EMB.sp[ch].pause(); } catch (e) {}
    c.type = null;
    c.onFail = null;
    c.paused = false;
    hideFrame(ch);
    if (was) renderMusic();
  }
  // что играет в канале: { pos, dur } в секундах (dur 0 — длина пока неизвестна), иначе null
  function trackOf(ch) {
    const c = CH[ch];
    if (!c.active) return null;
    try {
      if (c.type === 'file' && c.el) return { pos: c.el.currentTime || 0, dur: Number.isFinite(c.el.duration) ? c.el.duration : 0 };
      if (c.type === 'yt' && EMB.yt[ch] && EMB.yt[ch].getDuration) return { pos: EMB.yt[ch].getCurrentTime() || 0, dur: EMB.yt[ch].getDuration() || 0 };
      if (c.type === 'sp') return { pos: (c.pos || 0) / 1000, dur: (c.dur || 0) / 1000 };
    } catch (e) {}
    return { pos: 0, dur: 0 };
  }
  const winTrack = () => trackOf('win');
  // перемотка на секунду sec (не раньше начала звука и не дальше конца)
  function seekChannel(ch, sec) {
    const c = CH[ch], tr = trackOf(ch);
    if (!tr) return;
    const to = Math.max(c.start || 0, tr.dur ? Math.min(tr.dur - 0.5, sec) : sec);
    try {
      if (c.type === 'file' && c.el) c.el.currentTime = to;
      else if (c.type === 'yt' && EMB.yt[ch]) EMB.yt[ch].seekTo(to, true);
      else if (c.type === 'sp' && EMB.sp[ch]) { EMB.sp[ch].seek(to); c.pos = to * 1000; }
    } catch (e) {}
    paintPlayers();
  }
  // пауза и продолжение с того же места
  function togglePause(ch) {
    const c = CH[ch];
    if (!c.active) return;
    c.paused = !c.paused;
    try {
      if (c.type === 'file' && c.el) { if (c.paused) c.el.pause(); else c.el.play().catch(() => {}); }
      else if (c.type === 'yt' && EMB.yt[ch]) { if (c.paused) EMB.yt[ch].pauseVideo(); else EMB.yt[ch].playVideo(); }
      else if (c.type === 'sp' && EMB.sp[ch]) { if (c.paused) EMB.sp[ch].pause(); else EMB.sp[ch].resume(); }
    } catch (e) {}
    paintPlayers();
  }
  const mmss = (t) => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  // пульт под треком: время, полоса перемотки, значок паузы; обновляется и когда вкладка свёрнута
  let seeking = null;
  // то, что видит человек: позиция и длина без отрезанной тишины в начале
  function shownTrack(ch) {
    const tr = trackOf(ch) || { pos: 0, dur: 0 };
    const s = CH[ch].start || 0;
    return { pos: Math.max(0, tr.pos - s), dur: tr.dur ? Math.max(0, tr.dur - s) : 0 };
  }
  function paintPlayers() {
    for (const ch of ['bg', 'win']) {
      const box = document.getElementById('mplayer-' + ch);
      if (!box || box.hidden) continue;
      // время и ползунок считаются от начала звука: тишина в начале ролика отрезана, поэтому трек идёт с 0:00
      const tr = shownTrack(ch);
      const range = box.querySelector('.mp-seek');
      range.disabled = !tr.dur;
      if (seeking !== ch) range.value = tr.dur ? Math.round((tr.pos / tr.dur) * 1000) : 0;
      box.querySelector('[data-mp-pos]').textContent = mmss(seeking === ch && tr.dur ? (range.value / 1000) * tr.dur : tr.pos);
      box.querySelector('[data-mp-dur]').textContent = tr.dur ? mmss(tr.dur) : '—';
      const pp = box.querySelector('.mp-pp');
      const paused = !!CH[ch].paused;
      if (pp.dataset.state !== String(paused)) {
        pp.dataset.state = String(paused);
        pp.innerHTML = paused ? ICON.play : ICON.pause;
        pp.setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
        pp.title = paused ? 'Продолжить' : 'Пауза';
      }
    }
  }
  setInterval(() => { if (CH.bg.active || CH.win.active) paintPlayers(); }, 400);
  function channelEnded(ch) {
    const c = CH[ch];
    if (!c.active) return;
    if (c.loop) {
      try {
        if (c.type === 'yt') { EMB.yt[ch].seekTo(c.start || 0); EMB.yt[ch].playVideo(); }
        else if (c.type === 'sp') { EMB.sp[ch].seek(0); EMB.sp[ch].resume(); }
        else if (c.type === 'file' && c.el) { c.el.currentTime = c.start || 0; c.el.play().catch(() => {}); }
      } catch (e) {}
      return;
    }
    stopChannel(ch);
    if (ch === 'win') resumeBg();
  }

  // фон играет по кругу и стартует от первого действия на странице (так требуют браузеры)
  function startBg(force) {
    if (!S.music.bg || (!S.bgOn && !force) || CH.win.active || CH.bg.active) return;
    playChannel('bg', { loop: true, force });
  }
  function pauseBgForWin() { bgWasOn = CH.bg.active; if (bgWasOn) stopChannel('bg'); }
  function resumeBg() { if (bgWasOn) { bgWasOn = false; startBg(); } }
  function playWinMusic() {
    pauseBgForWin();
    if (!playChannel('win', { onFail: playWin })) playWin();
  }

  function musicNote(text, kind) {
    const el = $('#musicNote');
    el.textContent = text || 'Трек можно выбрать из списка или поставить свой файл, он сохранится в этом браузере. Вылет и щелчки при вращении всегда стандартные.';
    el.className = 'field-msg' + (kind ? ' ' + kind : '');
  }

  // громкость на виду (у заголовка колеса): значок выключает и возвращает звук, ползунок — тот же S.vol, что в «Музыке»
  const tr = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  let qvolPrev = 80;
  function paintQvol() {
    const v = S.vol == null ? 80 : +S.vol, r = $('#qvolRange'), b = $('#qvolBtn'), t = $('#qvolVal');
    if (r && document.activeElement !== r) r.value = v;
    if (t) t.textContent = v + '%';
    if (b) { const l = tr(v === 0 ? 'Включить звук' : 'Выключить звук'); b.classList.toggle('off', v === 0); b.title = l; b.setAttribute('aria-label', l); }
  }
  function setVol(v) {
    const el = $('#vol');
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function renderMusic() {
    const vol = $('#vol');
    if (vol && document.activeElement !== vol) { vol.value = S.vol == null ? 80 : S.vol; $('#volVal').textContent = vol.value + '%'; }
    paintQvol();
    $('#mslots').innerHTML = MUSIC_SLOTS.map(([slot, title, when]) => {
      const v = S.music[slot];
      const rec = A.find((a) => a.id === v);
      const pre = presetOf(v);
      const on = CH[slot].active;
      const has = !!(rec || pre);
      // один список на всё: треки, свой файл, загрузка своего, без музыки
      const opts = slotPresets(slot).map((p) => [`preset:${p.id}`, p.title])
        .concat(rec ? [[rec.id, rec.name]] : [])
        .concat([['__upload', rec ? 'Загрузить другой файл…' : 'Загрузить свой файл…']])
        .concat(slot === 'bg' ? [['', 'Без музыки']] : []);
      const label = on ? (slot === 'bg' ? 'Выключить' : 'Стоп') : (slot === 'bg' ? 'Включить' : 'Послушать');
      return `<div class="mcard${on ? ' on' : ''}">
        <div class="mc-head"><strong>${title}</strong><button type="button" class="mplay${on ? ' on' : ''}" data-mplay="${slot}"${has ? '' : ' disabled'} aria-label="${label}: ${title}">${on ? ICON.stop : ICON.play}${label}</button></div>
        <small>${when}</small>
        <select class="inp mpick" data-mpick="${slot}" aria-label="Трек: ${title}">${opts.map(([val, t]) => `<option value="${esc(val)}"${val === (v || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </div>`;
    }).join('');
  }
  function dropAudio(id) {
    const a = A.find((x) => x.id === id);
    if (!a) return;
    gifDel(id).catch(() => {});
    URL.revokeObjectURL(a.url);
    A = A.filter((x) => x.id !== id);
  }

  // где в своём файле кончается тишина: первая доля секунды громче 5% от пика
  async function leadingSilence(blob) {
    try {
      const a = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(await blob.arrayBuffer());
      const sr = a.sampleRate, chs = [...Array(a.numberOfChannels)].map((_, i) => a.getChannelData(i));
      let peak = 0;
      for (const ch of chs) for (let i = 0; i < ch.length; i += 64) peak = Math.max(peak, Math.abs(ch[i]));
      const thr = Math.max(0.01, peak * 0.05), win = Math.round(sr * 0.02), n = chs[0].length;
      for (let i = 0; i < n; i += win) {
        let sum = 0, cnt = 0;
        for (const ch of chs) for (let j = i; j < Math.min(i + win, n); j++) { sum += ch[j] * ch[j]; cnt++; }
        if (Math.sqrt(sum / cnt) > thr) return Math.max(0, Math.round((i / sr - 0.05) * 100) / 100);
      }
    } catch (e) {}
    return 0;
  }
  async function addAudio(file, slot) {
    if (!file || !(/^audio\//.test(file.type) || /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba)$/i.test(file.name))) {
      musicNote('Это не аудио. Нужен mp3, ogg, wav или m4a.', 'err');
      return;
    }
    if (file.size > 30 * 1024 * 1024) { musicNote(`«${file.name}» больше 30 МБ, возьми файл поменьше.`, 'err'); return; }
    stopChannel(slot);
    const old = S.music[slot];
    const rec = { id: 'a' + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36), kind: 'audio', slot, name: file.name, blob: file, added: Date.now() };
    musicNote('Ищу, где в треке начинается звук…');
    rec.start = await leadingSilence(file);
    try { await gifPut(rec); } catch (e) { persistOk = false; }
    A.push({ ...rec, url: URL.createObjectURL(file) });
    S.music[slot] = rec.id;
    if (old && !presetOf(old)) dropAudio(old);
    if (slot === 'bg') S.bgOn = true;
    save();
    renderMusic();
    if (slot === 'bg') startBg(true);
    musicNote(persistOk ? `«${file.name}» стоит на «${slotTitle(slot)}».` : 'Браузер не даёт сохранить трек: после перезагрузки его придётся загрузить заново.', persistOk ? 'ok' : 'err');
  }

  function bind() {
    bindPlans();
    $('#spin').addEventListener('click', () => { clearTimeout(autoTimer); lotsSpinAsk(); });

    $('#mslots').addEventListener('click', (e) => {
      const pl = e.target.closest('[data-mplay]');
      if (!pl) return;
      const slot = pl.dataset.mplay;
      if (S.spinning && slot === 'win' && !CH.win.active) return; // трек победы занят: колесо может вот-вот выдать победителя
      if (slot === 'bg') {
        if (CH.bg.active) { stopChannel('bg'); S.bgOn = false; musicNote(); }
        else { S.bgOn = true; startBg(true); }
        save();
        return;
      }
      // прослушать трек победы: фон на это время затихает
      if (CH.win.active) { stopChannel('win'); resumeBg(); return; }
      pauseBgForWin();
      if (!playChannel('win', { force: true })) resumeBg();
    });
    // пульт трека: −10 с, пауза, +10 с и перемотка ползунком (работают и пока колесо крутится)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mp]');
      if (!b) return;
      const ch = b.dataset.ch, tr = trackOf(ch);
      if (!tr) return;
      if (b.dataset.mp === 'toggle') togglePause(ch);
      else seekChannel(ch, tr.pos + (b.dataset.mp === 'fwd' ? 10 : -10));
    });
    document.addEventListener('input', (e) => {
      const r = e.target.closest('.mp-seek');
      if (!r) return;
      seeking = r.dataset.ch;
      paintPlayers();
    });
    document.addEventListener('change', (e) => {
      const r = e.target.closest('.mp-seek');
      if (!r) return;
      const ch = r.dataset.ch, tr = trackOf(ch);
      seeking = null;
      const sh = shownTrack(ch);
      if (tr && sh.dur) seekChannel(ch, (CH[ch].start || 0) + (r.value / 1000) * sh.dur);
    });
    // трек из списка
    $('#mslots').addEventListener('change', (e) => {
      const sel = e.target.closest('[data-mpick]');
      if (!sel) return;
      const slot = sel.dataset.mpick;
      if (sel.value === '__upload') { pendingSlot = slot; renderMusic(); $('#audioFile').click(); return; }
      if (sel.value === S.music[slot]) return;
      if (!sel.value) {
        // «Без музыки» — только у фона
        stopChannel(slot);
        const old = S.music[slot];
        if (old && !presetOf(old)) dropAudio(old);
        S.music[slot] = '';
        save();
        renderMusic();
        musicNote('Фоновая музыка выключена.', 'ok');
        return;
      }
      stopChannel(slot);
      const old = S.music[slot];
      if (old && !presetOf(old)) dropAudio(old);
      S.music[slot] = sel.value; // в списке уже «preset:id»
      if (slot === 'bg') S.bgOn = true;
      save();
      renderMusic();
      // название: у пресета — из списка треков, у своего файла — как подписан в выпадающем списке
      const p = presetOf(S.music[slot]);
      const opt = sel.selectedOptions && sel.selectedOptions[0];
      const title = p ? p.title : (opt ? opt.textContent.trim() : 'Свой трек');
      if (slot === 'bg') { startBg(true); musicNote(`«${title}» играет фоном.`, 'ok'); }
      else musicNote(`«${title}» стоит на победе. Нажми «Послушать», чтобы проверить.`, 'ok');
    });
    // громкость: сразу для того, что играет
    let volSave = 0;
    $('#vol').addEventListener('input', (e) => {
      S.vol = +e.target.value;
      $('#volVal').textContent = S.vol + '%';
      paintQvol();
      applyVolume('bg'); applyVolume('win');
      clearTimeout(volSave); volSave = setTimeout(save, 300);
    });
    const qr = $('#qvolRange'), qb = $('#qvolBtn');
    if (qr) qr.addEventListener('input', () => setVol(+qr.value));
    if (qb) qb.addEventListener('click', () => { const v = S.vol == null ? 80 : +S.vol; if (v > 0) { qvolPrev = v; setVol(0); } else setVol(qvolPrev || 80); });
    // фон включается от первого действия на странице: без него браузер звук не пустит
    const kickBg = (e) => {
      if (e.target && e.target.closest && e.target.closest('#mslots')) return;
      document.removeEventListener('pointerdown', kickBg, true);
      document.removeEventListener('keydown', kickBg, true);
      if (S.sound) ensureAudio();
      startBg();
    };
    document.addEventListener('pointerdown', kickBg, true);
    document.addEventListener('keydown', kickBg, true);
    $('#audioFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f && pendingSlot) addAudio(f, pendingSlot);
      e.target.value = '';
    });
    $('#restart').addEventListener('click', restoreAll);

    $('#mnav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-section]');
      if (!b || S.section === b.dataset.section) return;
      S.section = b.dataset.section;
      applySection();
      save();
      const y = $('#layout').getBoundingClientRect().top + window.scrollY - $('#mnav').offsetHeight - 24;
      if (window.scrollY > y) window.scrollTo(0, Math.max(0, y));
      resize();
    });

    document.querySelectorAll('.view-tab').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.pane === 'plans') {
        if (plansPane) return;
        plansPane = true;
        paintPane();
        renderPlans();
        return;
      }
      if (!plansPane) return;
      plansPane = false;
      paintPane();
    }));

    $('#durRange').addEventListener('input', (e) => {
      S.duration = Math.min(DUR_MAX, Math.max(DUR_MIN, Math.round(+e.target.value) || 8));
      $('#durVal').textContent = S.duration + ' с';
      save();
    });
    $('#hubSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hub]');
      if (!b) return;
      S.hub = +b.dataset.hub;
      markSeg('#hubSeg', 'data-hub', S.hub);
      applyHub();
      save();
    });
    $('#pickSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b || S.spinning || b.dataset.pick === S.pick) return;
      S.pick = b.dataset.pick;
      // в обычном режиме выбывших нет: возвращаем всех на колесо
      if (S.pick === 'one') S.items.forEach((i) => { i.out = false; i.outOrder = 0; });
      clearTimeout(autoTimer);
      save();
      render();
    });
    $('#auto').addEventListener('change', (e) => { S.auto = e.target.checked; if (!S.auto) clearTimeout(autoTimer); save(); });
    $('#snd').addEventListener('change', (e) => {
      S.sound = e.target.checked;
      if (!S.sound) { stopChannel('bg'); stopChannel('win'); bgWasOn = false; } else startBg();
      save();
    });

    $('#sampleClear').addEventListener('click', () => {
      S.items = [];
      S.outSeq = 0;
      S.sample = false;
      save();
      render();
      $('#name').focus();
    });

    $('#addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#name').value.trim();
      if (!name) return msg('Впиши имя или название.', 'err');
      const r = addItem(name);
      if (r === 'dup') return msg(`«${name}» уже на колесе.`, 'err');
      msg(`«${name}» на колесе.`, 'ok');
      $('#name').value = '';
      $('#name').focus();
      save();
      render();
    });

    $('#bulkAdd').addEventListener('click', () => {
      const lines = $('#bulk').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (!lines.length) return msg('Вставь хотя бы одну строку.', 'err');
      let added = 0, dup = 0;
      lines.forEach((line) => {
        const r = addItem(line);
        if (r === 'added') added++;
        else if (r === 'dup') dup++;
      });
      $('#bulk').value = '';
      let text = `Добавлено: ${added}`;
      if (dup) text += `, повторов пропущено: ${dup}`;
      msg(text, 'ok');
      save();
      render();
    });

    $('#list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="del"]');
      if (!b || S.spinning) return;
      const id = +b.closest('.prow').dataset.id;
      S.items = S.items.filter((i) => i.id !== id);
      S.sample = false;
      save();
      render();
      lotsDrop([id]);
    });

    $('#outList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="back"]');
      if (!b || S.spinning) return;
      const it = S.items.find((i) => i.id === +b.dataset.id);
      if (it) { it.out = false; it.outOrder = 0; }
      $('#winner').hidden = true;
      save();
      render();
    });

    $('#clear').addEventListener('click', () => {
      const b = $('#clear');
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Точно? Нажми ещё раз';
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => { delete b.dataset.armed; b.textContent = 'Очистить всё'; }, 3000);
        return;
      }
      clearTimeout(clearTimer);
      delete b.dataset.armed;
      b.textContent = 'Очистить всё';
      clearTimeout(autoTimer);
      const was = S.items.map((i) => i.id);
      S.items = [];
      S.outSeq = 0;
      S.sample = false;
      msg('');
      save();
      render();
      lotsDrop(was);
      $('#name').focus();
    });

    $('#gifFile').addEventListener('change', (e) => { addGifs(e.target.files); e.target.value = ''; });
    $('#thumbs').addEventListener('click', (e) => {
      if (e.target.closest('#gifPick')) { $('#gifFile').click(); return; }
      const del = e.target.closest('[data-del]');
      if (del) { removeGif(del.dataset.del); return; }
      const b = e.target.closest('[data-gif]');
      if (!b) return;
      S.gif = b.dataset.gif;
      save();
      renderGifs();
    });
    $('#baseTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bgroup]');
      if (!b || b.dataset.bgroup === S.baseGroup) return;
      S.baseGroup = b.dataset.bgroup;
      save();
      renderBaseHubs();
      $('#baseThumbs').scrollTop = 0;
    });
    $('#baseThumbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-gif]');
      if (!b) return;
      S.gif = b.dataset.gif;
      if (S.hub === HUBS[0][0]) { S.hub = HUBS[1][0]; applyHub(); markSeg('#hubSeg', 'data-hub', S.hub); } // с картинкой центр крупнее
      save();
      renderGifs();
    });

    // перетаскивание файла: подсветка на колесе, принимается в любом месте страницы
    const wrap = $('.wheel-wrap');
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    let dragDepth = 0;
    document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; wrap.classList.add('drop'); });
    document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) wrap.classList.remove('drop'); });
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      wrap.classList.remove('drop');
      addGifs(e.dataTransfer.files);
    });

    $('#wImg').addEventListener('click', shareImage);
    $('#wCopyImg').addEventListener('click', copyImage);
    $('#wCopy').addEventListener('click', copyResult);
    $('#wAgain').addEventListener('click', () => { restoreAll(); if (S.pick === 'one') spin(); });
    $('#wClose').addEventListener('click', hideWinner);
    const muteWin = (e) => { e.stopPropagation(); if (CH.win.active) stopChannel('win'); };
    $('#fxMute').addEventListener('click', muteWin);
    $('#wMute').addEventListener('click', muteWin);
    setInterval(() => { $('#fxMute').hidden = $('#wMute').hidden = !CH.win.active; }, 300);
    // та же карточка, что после победы (картинка: скопировать или скачать, текст), только без музыки и салюта
    $('#exportRes').addEventListener('click', () => { const w = winnerNow(); if (!w) return; lastWinner = w; wMsg(''); openWinnerCard(w); });
    $('#winner').addEventListener('click', (e) => { if (e.target.id === 'winner') hideWinner(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideWinner(); });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); draw(); });
    new MutationObserver(() => { readTheme(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new ResizeObserver(resize).observe(canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitCache.clear(); draw(); });
  }

  function start(data) {
    let d = data && Array.isArray(data.items) ? data : null;
    if (!d) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const p = JSON.parse(raw); if (p && Array.isArray(p.items)) d = p; }
      } catch (e) {}
    }
    S = Object.assign(fresh(), d || {});
    S.spinning = false;
    scope = 'main';
    try {
      const l = JSON.parse(localStorage.getItem(LINK_KEY) || 'null');
      if (l && Array.isArray(l.items)) { stash = wheelPart(Object.assign(linkFresh(), l)); savedScope = l.scope === 'link' ? 'link' : 'main'; }
    } catch (e) {}
    if (S.pick !== 'one') S.pick = 'out';
    if (stash.pick !== 'one') stash.pick = 'out';
    // донатов в Колесе больше нет: старые сохранения молча становятся обычным колесом с теми же участниками,
    // суммы, валюты и курсы выбрасываются
    const oldDonate = d && (d.v !== 3 || 'mode' in d || 'cur' in d || 'rates' in d);
    delete S.mode; delete S.cur; delete S.rates;
    S.v = 3;
    [S.items, stash.items].forEach((list) => list.forEach((i) => { delete i.amount; delete i.cur; delete i.startWin; }));
    if (oldDonate) save();
    S.duration = Math.min(DUR_MAX, Math.max(DUR_MIN, Math.round(+S.duration) || 8));
    S.hub = nearest(+S.hub || HUBS[0][0], HUBS.map((h) => h[0]));
    if (!['wheel', 'list'].includes(S.section)) S.section = 'wheel';
    S.music = Object.assign({ bg: '', win: '' }, S.music || {});
    // бывший «Спин» становится фоном (кроме VI KA, она только для победы), «Вылет» теперь всегда стандартный
    if (S.music.spin && !S.music.bg) S.music.bg = S.music.spin;
    if (S.music.bg === 'preset:' + DEFAULT_WIN) S.music.bg = '';
    delete S.music.spin;
    delete S.music.out;
    if (S.bgOn == null) S.bgOn = true;
    // победа по умолчанию VI KA; пустой трек победы тоже означает VI KA
    if (!S.music.win) S.music.win = 'preset:' + DEFAULT_WIN;
    // на победе из списка остался только VI KA: другие треки из списка заменяем на него
    if (presetOf(S.music.win) && presetOf(S.music.win).id !== DEFAULT_WIN) S.music.win = 'preset:' + DEFAULT_WIN;
    // пример участников — только при первом заходе и если примеры не выключены в «Настройках»; выключены — пример убирается
    if (!d && examplesOn()) { S.sample = true; SAMPLE.forEach((n) => S.items.push(makeItem(n))); }
    if (S.sample && !examplesOn()) dropSample();
    if (!/\/wheel(\/|\/index\.html)?$/.test(location.pathname)) { $('#backLink').hidden = true; $('#opinionLink').hidden = true; } // вне сайта ссылкам некуда вести

    readTheme();
    bind();
    renderSegs();
    applySection();
    render();
    resize();
    applyHub();
    renderGifs();
    loadBaseHubs();
    gifNote();
    lotsInit();
    renderMusic();
    musicNote();
    gifsAll()
      .then((recs) => {
        const all = recs || [];
        G = all.filter((r) => r.kind !== 'audio').sort((x, y) => x.added - y.added).map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
        lotsLiveSoon();
        A = all.filter((r) => r.kind === 'audio').map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
        // файлы, загруженные до обрезки тишины: находим её один раз и запоминаем
        A.filter((r) => r.start == null).forEach(async (r) => {
          r.start = await leadingSilence(r.blob);
          const { url, ...keep } = r;
          gifPut(keep).catch(() => {});
        });
        MUSIC_SLOTS.forEach(([s]) => {
          if (S.music[s] && !presetOf(S.music[s]) && !A.some((a) => a.id === S.music[s])) S.music[s] = s === 'win' ? 'preset:' + DEFAULT_WIN : '';
        });
        renderGifs();
        renderMusic();
      })
      .catch(() => { persistOk = false; gifNote(); musicNote(); });
  }

  // появление разделов после нажатий: чуть выезжают снизу, без затухания; через секунду после загрузки
  if (!reduced) {
    const SEL = '.card, .out-box, .board-list, .example-bar, .empty';
    const kick = (n) => {
      if (!(n instanceof Element) || !n.matches(SEL)) return;
      n.classList.remove('enter');
      void n.offsetWidth;
      n.classList.add('enter');
    };
    addEventListener('animationend', (e) => { if (e.animationName === 'enter-up' && e.target.classList) e.target.classList.remove('enter'); });
    const watch = () => setTimeout(() => {
      new MutationObserver((ms) => {
        for (const m of ms) {
          const n = m.target;
          if (m.attributeName === 'hidden' && !n.hidden) kick(n);
          if (m.attributeName === 'data-section') n.querySelectorAll(':scope > .card').forEach((c) => { if (getComputedStyle(c).display !== 'none') kick(c); });
        }
      }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden', 'data-section'] });
    }, 1000);
    if (document.readyState === 'complete') watch(); else addEventListener('load', watch);
  }

  // ---------- лоты по ссылке: здесь ведущий только открывает сбор и видит список своих сборов ----------
  // Колесо с лотами зрителей крутится на странице сбора (/lots/<код>): там у ведущего пульт, а у зрителей — просмотр.
  // На этой странице только своё колесо, переключателя на колесо по ссылке больше нет
  const lotsAccount = (() => { try { const u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null'); const t = u && (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || 'null') || {})[u.id]; return u && t ? { id: u.id, token: t } : null; } catch (e) { return null; } })();
  // хранилище прошлого колеса по ссылке: save() по-прежнему его пишет, данные никому не мешают
  const LINK_KEY = KEY + '.link' + (lotsAccount ? ':' + lotsAccount.id : '');
  let lotsEveningNew = false, lotsEditNew = false, lotsUniqNew = true, lotsFuzzyNew = true, lotsPerNew = 3, lotsMinsNew = 10, lotsKindNew = 'game', lotsErr = '', lotsRooms = [], lotsOffset = 0;
  // прокрутку, победителя и снимок для зрителей теперь ведёт страница сбора; здесь эти вызовы ничего не делают
  let lotsWinner = null, livePick = '';
  function lotsLiveSoon() {}
  function lotsLiveNow() {}
  function lotsSpin() {}
  function lotsDrop() {}
  function lotsSpinAsk() { spin(); }
  const LOT_KIND_NAMES = { game: 'Игры', movie: 'Фильмы и сериалы', anime: 'Аниме', book: 'Книги', music: 'Музыка', any: 'Что угодно' };
  async function lotsApi(path, method = 'GET', body) {
    let r;
    try {
      r = await fetch('/api' + path, { method, cache: 'no-store', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (lotsAccount ? lotsAccount.token : '') }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (e) { throw new Error('Нет связи с сервером.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(d.error || 'Сервер не ответил.'); er.status = r.status; throw er; }
    return d;
  }
  // после победы ссылка ведёт на итог: такой адрес мессенджер ещё не запомнил, и в предпросмотре будет победитель
  const wTag = (s) => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.codePointAt(0)) >>> 0; return h.toString(36); };
  const lotsRules = (o) => `<div class="lots-f"><span>Правила для зрителей</span>
        <label class="lots-chk"><input type="checkbox" data-lots-rule="editOwn"${o.editOwn ? ' checked' : ''}><span>Зрители могут убирать и менять свои лоты (пока лот не вылетел)</span></label>
        <label class="lots-chk"><input type="checkbox" data-lots-rule="uniq"${o.uniq ? ' checked' : ''}><span>Одно название — один лот: никто не займёт два лота одной игрой</span></label>
        <label class="lots-chk"><input type="checkbox" data-lots-rule="fuzzy"${o.fuzzy ? ' checked' : ''}${o.uniq ? '' : ' disabled'}><span>Ловить обход по похожему названию (outlast и ooutlast)</span></label>
      </div>`;
  function lotsPaint() {
    const box = $('#lotsBody');
    if (!box) return;
    if (!lotsAccount) { box.innerHTML = '<p class="lots-note">Войди в аккаунт, и можно будет дать зрителям ссылку: они сами добавят лоты, а ты будешь крутить колесо с ними на странице сбора.</p><a class="btn small primary" href="/opinion/#login">Войти</a>'; return; }
    box.innerHTML = `<p class="lots-note">Дай ссылку зрителям: они сами добавят лоты. Колесо с их лотами крутишь на странице сбора — там у тебя пульт ведущего, а зрители видят прокрутку вживую.</p>
      <label class="lots-f">Название<input class="inp" id="lotsTitle" maxlength="60" placeholder="Например, Аук Толика"></label>
      <div class="lots-f"><span>Категория колеса</span><div class="seg" role="group" aria-label="Категория колеса">${Object.entries(LOT_KIND_NAMES).map(([k, t]) => `<button type="button" data-lots-kind="${k}" aria-pressed="${k === lotsKindNew}">${t}</button>`).join('')}</div></div>
      <div class="lots-f"><span>Лотов на человека</span><div class="seg" role="group" aria-label="Лотов на человека">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-lots-per="${n}" aria-pressed="${n === lotsPerNew}">${n}</button>`).join('')}</div></div>
      <label class="lots-f">Сколько минут можно вписывать (0 — пока не закроешь сам)<input class="inp lots-mins" id="lotsMins" type="number" inputmode="numeric" min="0" max="1440" value="${lotsMinsNew}"></label>
      ${lotsRules({ editOwn: lotsEditNew, uniq: lotsUniqNew, fuzzy: lotsFuzzyNew && lotsUniqNew })}
      <label class="lots-f lots-evening"><span><input type="checkbox" data-lots-evening${lotsEveningNew ? ' checked' : ''}> <b>Вечер с друзьями</b></span><small>Без стрима: компания накидывает варианты, у каждого одно вето, колесо выбирает из оставшихся.</small></label>
      <div class="dfoot"><button type="button" class="btn small primary" data-lots="create">Открыть сбор</button></div>
      ${lotsErr ? `<p class="lots-note bad">${esc(lotsErr)}</p>` : ''}
      <div id="lotsRooms"></div>`;
    lotsPaintRooms();
  }
  // все сборы ведущего: у каждого ссылка (по ней же ведущий открывает свой пульт)
  function lotsPaintRooms() {
    const box = $('#lotsRooms');
    if (!box) return;
    const now = Date.now() + lotsOffset;
    const rows = lotsRooms.map((r) => {
      const state = r.winner ? '🏆 ' + r.winner : r.closed ? 'закрыт' : r.endsAt && r.endsAt <= now ? 'время вышло' : 'открыт';
      return `<li><span class="lots-room"><b>${esc(r.title || 'Без названия')}</b><small>${esc(LOT_KIND_NAMES[r.kind] || '')} · лотов: ${r.n} · ${esc(state)}</small></span><button type="button" class="btn small ghost" data-lots-copy="${esc(r.id)}">Ссылка</button><button type="button" class="btn text" data-lots-del="${esc(r.id)}">Удалить</button></li>`;
    });
    box.innerHTML = rows.length ? `<div class="lots-f"><span>Мои сборы</span><ul class="lots-rooms">${rows.join('')}</ul></div>` : '';
  }
  async function lotsRefreshRooms() {
    try { const d = await lotsApi('/lots-mine'); lotsRooms = d.rooms || []; if (d.now) lotsOffset = d.now - Date.now(); lotsPaintRooms(); } catch (e) {}
  }
  async function lotsInit() {
    const box = $('#lotsBody');
    if (!box) return;
    lotsPaint();
    const keepForm = () => { lotsMinsNew = +$('#lotsMins').value || 0; const title = $('#lotsTitle').value; lotsPaint(); $('#lotsTitle').value = title; };
    box.addEventListener('change', (e) => {
      const ev = e.target.closest('[data-lots-evening]');
      if (ev) { lotsEveningNew = ev.checked; if (lotsEveningNew) lotsPerNew = Math.min(lotsPerNew, 2); keepForm(); return; }
      const c = e.target.closest('[data-lots-rule]');
      if (!c) return;
      const k = c.dataset.lotsRule, v = c.checked;
      if (k === 'editOwn') lotsEditNew = v; else if (k === 'uniq') lotsUniqNew = v; else lotsFuzzyNew = v;
      keepForm();
    });
    box.addEventListener('click', async (e) => {
      const per = e.target.closest('[data-lots-per], [data-lots-kind]');
      if (per) {
        if (per.dataset.lotsPer) lotsPerNew = +per.dataset.lotsPer; else lotsKindNew = per.dataset.lotsKind;
        keepForm();
        return;
      }
      const cp = e.target.closest('[data-lots-copy]');
      if (cp) {
        const was = lotsRooms.find((x) => x.id === cp.dataset.lotsCopy);
        const url = location.origin + '/lots/' + cp.dataset.lotsCopy + (was && was.winner ? '?w=' + wTag(was.winner) : '');
        try { await navigator.clipboard.writeText(url); msg('Ссылка скопирована.', 'ok'); } catch (er) { msg(url, 'ok'); }
        return;
      }
      const del = e.target.closest('[data-lots-del]');
      if (del) {
        // удаление насовсем: ссылка перестанет открываться, поэтому нажать нужно дважды
        if (!del.dataset.armed) {
          del.dataset.armed = '1';
          del.textContent = 'Точно удалить?';
          setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Удалить'; } }, 3000);
          return;
        }
        const id = del.dataset.lotsDel;
        try {
          await lotsApi('/lots/' + id, 'DELETE');
          lotsRooms = lotsRooms.filter((r) => r.id !== id);
          lotsPaintRooms();
        } catch (er) { lotsErr = er.message; lotsPaint(); }
        return;
      }
      const b = e.target.closest('[data-lots="create"]');
      if (!b) return;
      const minutes = Math.max(0, Math.min(1440, Math.round(+$('#lotsMins').value) || 0));
      b.disabled = true;
      lotsErr = '';
      try {
        const d = await lotsApi('/lots', 'POST', { title: $('#lotsTitle').value, kind: lotsKindNew, perUser: lotsPerNew, minutes, editOwn: lotsEditNew, uniq: lotsUniqNew, fuzzy: lotsFuzzyNew && lotsUniqNew });
        // пульт ведущего — на странице сбора: туда же зрители придут по ссылке
        if (d.room && d.room.id) {
          if (lotsEveningNew) await lotsApi('/lots/' + d.room.id + '/evening', 'POST', { on: true }).catch(() => {});
          location.href = '/lots/' + d.room.id; return;
        }
        lotsRefreshRooms();
      } catch (er) { lotsErr = er.message; lotsPaint(); }
      b.disabled = false;
    });
    if (lotsAccount) lotsRefreshRooms();
  }

  // /wheel/#lots (из меню ☰ и со страницы лотов): сразу открыть «Лоты по ссылке» — там ведущий создаёт сбор
  if (location.hash === '#lots') {
    const box = $('#lotsBox');
    if (box) { box.open = true; setTimeout(() => box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 400); }
  }
  window.claude?.hot?.snapshot?.(() => { const { spinning, ...rest } = S || {}; return rest; });
  window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
