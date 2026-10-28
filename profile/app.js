// iOS 15 и старые браузеры не знают roundRect у canvas: рисуем скругление сами
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.max(0, Math.min(Array.isArray(r) ? r[0] : +r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}
(() => {
  const $ = (s) => document.querySelector(s);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const fmt = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const tierT = (t) => (t == null ? 'none' : t >= 7.5 ? 'good' : t >= 5 ? 'mid' : 'bad');
  const tierV = (v) => (v >= 8 ? 'good' : v >= 5 ? 'mid' : v >= 1 ? 'bad' : 'none');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const app = $('#app');
  const AV_COLORS = ['#3550E8', '#2EAD60', '#EAA92C', '#E4553F', '#9333EA', '#06B6D4', '#EC4899', '#F97316'];
  const colorOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; };
  const keyOf = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const ago = (t) => {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
    const h = Math.round(m / 60); if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
    const d = Math.round(h / 24); if (d < 30) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
    return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  // значки шапки профиля: карандаш у ника, витрины и блоки, колокольчик подписки
  const ICON_PEN = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z"/><path d="M9.5 4l2.5 2.5"/></svg>';
  const ICON_LAYOUT = '<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/></svg>';
  const ICON_BELL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
  const ICON_BELL_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9"/><path d="M10 19a2 2 0 0 0 4 0" fill="none"/><path d="M3 5.5c.6-1.4 1.5-2.5 2.6-3.3M21 5.5c-.6-1.4-1.5-2.5-2.6-3.3" fill="none"/></svg>';
  const ICON = {
    go:'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
    star: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.5l1.9 4 4.3.5-3.2 2.9.9 4.3L8 11 4.1 13.2l.9-4.3L1.8 6l4.3-.5z" fill="currentColor"/></svg>',
  };

  // ---------- кто на странице ----------
  const user = read('ocenshik.user.v1');
  const tokens = read('casualhub.tokens.v1') || {};
  const token = user && tokens[user.id];
  const api = (path) => fetch('/api' + path, { headers: { authorization: 'Bearer ' + token } }).then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d), () => Promise.reject({}))));
  const wantId = new URLSearchParams(location.search).get('id');

  // жанры и теги из описания «2010, фантастика, боевик»: всё через запятую, кроме года
  const genresOf = (meta) => [...new Set(String(meta || '').split(/\s*[,;]\s*/).map((s) => s.trim().toLowerCase()).filter((s) => s && s.length <= 24 && !/^\d{4}$/.test(s)))];
  const norm = (r) => ({
    id: r.id, name: String(r.name || 'Без названия'), cat: r.catName || r.catLabel || r.cat || 'Без категории',
    total: typeof r.total === 'number' ? r.total : null, scores: Array.isArray(r.scores) ? r.scores : [],
    status: r.status || '', fav: !!r.fav, meta: r.meta || '', photo: r.photo || null, note: !!String(r.note || '').trim(),
    genres: genresOf(r.meta),
    lb: r.src === 'letterboxd' || (Array.isArray(r.scores) && r.scores.some((s) => s && s.id === 'lb-score')),
    text: String(r.note || '').trim().slice(0, 4000), pros: String(r.pros || '').slice(0, 1000), cons: String(r.cons || '').slice(0, 1000),
    created: +new Date(r.createdAt || r.date || 0) || 0,
    at: +new Date(r.updatedAt || r.date || r.createdAt || 0) || 0,
  });
  const myRatings = () => {
    const all = (read('ocenshik.ratings.v2') || []).filter((r) => r && !r.example);
    return (user ? all.filter((r) => r.author && r.author.id === user.id) : all).map(norm);
  };

  // ---------- фото: свои лежат прямо в оценке или в аккаунте, у друзей берём с сервера ----------
  const photoCache = new Map();
  const photoOf = (p, r) => {
    if (!r.photo) return Promise.resolve(null);
    if (r.photo.data && /^data:image\//.test(r.photo.data)) return Promise.resolve(r.photo.data);
    // фото-ссылка (например, постер из IMDb после импорта из Letterboxd) показывается как есть
    const link = r.photo.url || (typeof r.photo.id === 'string' && /^https:\/\//.test(r.photo.id) ? r.photo.id : '');
    if (link) return Promise.resolve(link);
    if (!token || !p.uid) return Promise.resolve(null);
    const k = p.uid + ':' + r.id;
    if (!photoCache.has(k)) photoCache.set(k, api(`/photo/${encodeURIComponent(p.uid)}/${encodeURIComponent(r.id)}?thumb=1`).then((d) => d.data || null, () => null)); // превью: в профиле картинки маленькие
    return photoCache.get(k);
  };
  const hydratePhotos = (p, root) => {
    const nodes = [...root.querySelectorAll('[data-photo]')];
    if (!nodes.length) return;
    const load = (n) => {
      const r = p.ratings.find((x) => x.id === n.dataset.photo) || (p.allRatings || []).find((x) => x.id === n.dataset.photo);
      if (!r) return;
      photoOf(p, r).then((src) => {
        if (!src) return;
        const img = new Image(); img.alt = ''; img.decoding = 'async';
        img.onload = () => {
          // номер места на пьедестале остаётся, убираем только букву-заглушку
          const ltr = n.querySelector('.ltr');
          if (ltr) ltr.remove(); else [...n.childNodes].forEach((c) => { if (c.nodeType === 3) c.remove(); }); // значок Letterboxd остаётся
          n.appendChild(img);
        };
        img.src = src;
      });
    };
    if (!('IntersectionObserver' in window)) { nodes.forEach(load); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), { rootMargin: '200px' });
    nodes.forEach((n) => io.observe(n));
  };

  // ---------- звания по оценкам ----------
  function titlesOf(rs) {
    const rated = rs.filter((r) => r.total != null);
    const n = rated.length;
    const avg = n ? rated.reduce((a, r) => a + r.total, 0) / n : null;
    const out = [];
    out.push({ t: n >= 50 ? 'Легенда оценок' : n >= 20 ? 'Критик' : n >= 5 ? 'Ценитель' : n >= 1 ? 'Осматривается' : 'Новичок', tier: n >= 20 ? 'good' : n >= 5 ? 'mid' : 'none' });
    if (avg != null) out.push(avg >= 8.5 ? { t: 'Щедрая душа', tier: 'good' } : avg >= 7.5 ? { t: 'Добрый критик', tier: 'good' } : avg >= 5.5 ? { t: 'Взвешенный взгляд', tier: 'mid' } : { t: 'Строгий судья', tier: 'bad' });
    const cats = new Map(); rated.forEach((r) => cats.set(r.cat, (cats.get(r.cat) || 0) + 1));
    const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && n >= 3) out.push({ t: `Больше всего: ${top[0]}`, tier: 'none' });
    const masters = rated.filter((r) => r.total >= 9.5).length;
    if (masters >= 3) out.push({ t: `Нашёл ${masters} ${plural(masters, 'шедевр', 'шедевра', 'шедевров')}`, tier: 'good' });
    return out;
  }

  // ---------- значки: стаж аккаунта, число оценок и особые ----------
  const AGE_BADGES = [
    { days: 7, ic: '🌱', t: 'Неделя в клубе', need: 'неделя' },
    { days: 30, ic: '🌙', t: 'Месяц в клубе', need: 'месяц' },
    { days: 91, ic: '🍂', t: 'Три месяца', need: '3 месяца' },
    { days: 182, ic: '🌗', t: 'Полгода', need: 'полгода' },
    { days: 365, ic: '🏆', t: 'Год в клубе', need: 'год' },
    { days: 730, ic: '👑', t: 'Два года', need: '2 года' },
    { days: 1095, ic: '💎', t: 'Три года', need: '3 года' },
  ];
  const COUNT_BADGES = [[1, '📝', 'Первая оценка'], [10, '🗂️', '10 оценок'], [50, '📚', '50 оценок'], [100, '🏛️', '100 оценок'], [250, '🗿', '250 оценок']];
  const PIONEER_BEFORE = +new Date(2026, 11, 1); // аккаунты до 1 декабря 2026
  const dayFmt = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  // самая длинная серия дней подряд, в которые что-то оценено
  function bestStreak(times) {
    const days = [...new Set(times.filter(Boolean).map((t) => { const d = new Date(t); d.setHours(12, 0, 0, 0); return +d; }))].sort((a, b) => a - b);
    let best = 0, cur = 0;
    days.forEach((t, i) => { cur = i && Math.round((t - days[i - 1]) / 864e5) === 1 ? cur + 1 : 1; best = Math.max(best, cur); });
    return best;
  }
  // ступенчатая серия: у первого неполученного видно, сколько осталось
  function series(list, have, subOf) {
    let nextShown = false;
    return list.map((b) => {
      const got = have >= b.goal;
      const next = !got && !nextShown;
      if (next) nextShown = true;
      return { ...b, got, next, pct: Math.min(100, (have / b.goal) * 100), sub: subOf(b, got, next) };
    });
  }
  // одиночный значок с прогрессом (сколько из скольких)
  const goal = (ic, t, have, need, hint, word) => ({ ic, t, hint, got: have >= need, next: have < need && have > 0, pct: Math.min(100, (have / need) * 100),
    sub: have >= need ? hint : `${have} из ${need} ${word}` });
  const flag = (ic, t, got, hint, todo) => ({ ic, t, hint, got, sub: got ? hint : todo });
  function badgesOf(p) {
    const out = [];
    const t0 = +new Date(p.createdAt || 0);
    if (t0) {
      const age = (Date.now() - t0) / 864e5;
      out.push(...series(AGE_BADGES.map((b) => ({ ...b, goal: b.days, hint: 'аккаунту ' + b.need })), age, (b, got, next) => {
        const left = Math.max(1, Math.ceil(b.days - age));
        return got ? 'с ' + dayFmt(t0 + b.days * 864e5) : next ? `через ${left} ${plural(left, 'день', 'дня', 'дней')}` : 'аккаунту ' + b.need;
      }));
    }
    const rs = p.ratings || [];
    const n = rs.length;
    out.push(...series(COUNT_BADGES.map(([k, ic, t]) => ({ goal: k, ic, t, hint: k === 1 ? 'первая оценка' : k + ' оценок' })), n,
      (b, got, next) => (got ? 'есть' : next ? `ещё ${b.goal - n} ${plural(b.goal - n, 'оценка', 'оценки', 'оценок')}` : 'нужно ' + b.goal)));
    const rated = rs.filter((r) => r.total != null);
    out.push(flag('🔪', 'Безжалостный', rated.some((r) => r.total < 2.5), 'есть оценка 1 или 2', 'поставь 1 или 2'));
    out.push(flag('💯', 'Щедрый', rated.some((r) => r.total >= 9.95), 'есть оценка 10', 'поставь 10'));
    out.push(goal('🧭', 'Эрудит', new Set(rs.map((r) => keyOf(r.cat))).size, 5, 'оценки в 5 категориях', 'категорий'));
    out.push(goal('✍️', 'Писатель', rs.filter((r) => r.note).length, 10, '10 оценок с заметками', 'с заметками'));
    out.push(goal('📸', 'Фотограф', rs.filter((r) => r.photo).length, 10, '10 оценок с фото', 'с фото'));
    out.push(goal('⭐', 'Коллекционер', rs.filter((r) => r.fav).length, 10, '10 оценок в избранном', 'в избранном'));
    out.push(flag('🦉', 'Ночная сова', rs.some((r) => r.created && new Date(r.created).getHours() < 5), 'оценка между 0:00 и 5:00', 'оцени что-нибудь ночью, с 0 до 5'));
    out.push(goal('🔥', 'Марафонец', bestStreak(rs.map((r) => r.created)), 7, 'оценки 7 дней подряд', 'дней подряд'));
    if (p.friendCount != null) out.push(goal('👥', 'Душа компании', p.friendCount, 5, '5 друзей', 'друзей'));
    // успеть можно было только до декабря 2026: позже значок не показывается
    if (t0 && t0 < PIONEER_BEFORE) out.push(flag('🚀', 'Перво­проходец', true, 'в клубе с первых недель', ''));
    // полученные сначала, из остальных выше те, до которых ближе
    return out.filter((b) => b.got).concat(out.filter((b) => !b.got).sort((a, b) => (b.pct || 0) - (a.pct || 0)));
  }
  const badgesHTML = (list) => `<div class="bdg">${list.map((b, k) => `<div style="--k:${Math.min(k, 14)}" class="bdg-i${b.got ? '' : ' off'}${b.next ? ' next' : ''}" title="${esc(b.t)}: ${esc(b.hint)}"><span class="ic" aria-hidden="true">${b.ic}</span><span><b>${esc(b.t)}</b><small>${esc(b.sub)}</small>${b.next ? `<span class="tr"><i style="width:${b.pct.toFixed(1)}%"></i></span>` : ''}</span></div>`).join('')}</div>`;

  // ---------- отрисовка ----------
  const cells = (v) => `<span class="cells" data-tier="${tierT(v)}" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${v != null && i < Math.round(v) ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const badge = (t, cls) => `<span class="badge${cls ? ' ' + cls : ''}" data-tier="${tierT(t)}">${t != null ? fmt(t) : '—'}</span>`;
  const letter = (s) => esc([...String(s).trim()][0] || '?');
  // значок Letterboxd на обложке у импортированных оценок
  const LB_MARK = '<span class="lb-mark" title="Импортировано из Letterboxd" aria-label="Из Letterboxd"><i></i><i></i><i></i></span>';
  const lbm = (r) => (r.lb ? LB_MARK : '');


  const ST = { cat: 'all', sort: 'score', q: '', limit: 24, topics: false, genres: [], gOpen: false };
  // фильтр по жанрам: кнопка «Фильтры» раскрывает строку жанров; выбранные нужны все сразу
  const hasGenres = (r, sel) => sel.every((g) => r.genres.includes(g));
  function genreUI(btn, box, pool, S) {
    const n = new Map();
    pool.forEach((r) => r.genres.forEach((g) => n.set(g, (n.get(g) || 0) + 1)));
    S.genres.forEach((g) => { if (!n.has(g)) n.set(g, 0); });
    const list = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
    btn.hidden = !list.length;
    btn.setAttribute('aria-expanded', String(S.gOpen));
    btn.toggleAttribute('data-on', S.genres.length > 0);
    btn.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3h11l-4.2 5.2v4.3l-2.6 1.3V8.2z"/></svg><span>Фильтры</span>' + (S.genres.length ? `<b class="gb-n">${S.genres.length}</b>` : '');
    box.hidden = !S.gOpen || !list.length;
    box.innerHTML = list.map(([g, k]) => `<button type="button" class="chip" data-genre="${esc(g)}" aria-pressed="${S.genres.includes(g)}">${esc(g)} <b>${k}</b></button>`).join('')
      + (S.genres.length ? '<button type="button" class="chip genre-reset" data-genre="*">✕ Сбросить</button>' : '');
  }
  function wireGenres(btn, box, S, redraw) {
    btn.addEventListener('click', () => { S.gOpen = !S.gOpen; redraw(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-genre]');
      if (!b) return;
      const g = b.dataset.genre;
      S.genres = g === '*' ? [] : S.genres.includes(g) ? S.genres.filter((x) => x !== g) : [...S.genres, g];
      S.limit = S === AST ? 60 : 24;
      redraw();
    });
  }

  // ---------- темы профиля: скрытые категории не видны ни в своём профиле, ни у друзей ----------
  const HIDE_KEY = 'casualhub.profileHide.v1'; // { id профиля: { hide: [ключи категорий], at } }
  const hideOwner = () => (user ? user.id : 'guest');
  // ---------- стикер возле ника: любая картинка из колеса, общий для аккаунта ----------
  const STICKER_KEY = 'casualhub.profileSticker.v1'; // { id профиля: { src: 'hub/…', at } }
  const localSticker = () => (read(STICKER_KEY) || {})[hideOwner()] || { src: '', at: 0 };
  const keepSticker = (st) => { try { const all = read(STICKER_KEY) || {}; all[hideOwner()] = st; localStorage.setItem(STICKER_KEY, JSON.stringify(all)); } catch (e) {} };
  // старые iPhone не играют WebM: рядом лежит тот же ролик в MP4
  const WEBM_OK = (() => { try { return !!document.createElement('video').canPlayType('video/webm; codecs="vp9"'); } catch (e) { return false; } })();
  const stUrl = (src) => '/koleso/' + (WEBM_OK ? src : String(src).replace(/\.webm$/i, '.mp4'));
  const isVid = (src) => /\.webm$/i.test(src);
  const stMedia = (src, lazy) => (isVid(src)
    ? `<video ${lazy ? 'data-src' : 'src'}="${esc(stUrl(src))}" muted loop playsinline${lazy ? '' : ' autoplay'}></video>`
    : `<img src="${esc(stUrl(src))}" alt=""${lazy ? ' loading="lazy"' : ''} decoding="async">`);
  const stickerSlot = (p) => (p.kind === 'me'
    ? `<button type="button" class="nick-st${p.sticker ? '' : ' empty'}" id="stBtn" aria-haspopup="dialog" title="Стикер возле ника">${p.sticker ? stMedia(p.sticker) : '＋ стикер'}</button>`
    : p.sticker ? `<span class="nick-st" aria-hidden="true">${stMedia(p.sticker)}</span>` : '');

  let stCatalog = null, stP = null, stGroup = '', stObs = null;
  function stickerPicker(p) {
    stP = p;
    let box = $('#stPick');
    if (!box) {
      box = document.createElement('div');
      box.className = 'st-pick'; box.id = 'stPick'; box.hidden = true;
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'stTitle');
      box.innerHTML = `<div class="st-card">
        <div class="st-head"><h2 id="stTitle">Стикер возле ника</h2><button type="button" class="st-x" data-st="close" aria-label="Закрыть">✕</button></div>
        <div class="st-tabs" role="group" aria-label="Набор стикеров"></div>
        <div class="st-grid"><p class="muted">Загружаю стикеры…</p></div>
        <div class="st-foot"><small>Его видят все, кто открывает твой профиль.</small><button type="button" class="btn ghost" data-st="none">Убрать стикер</button></div>
      </div>`;
      document.body.appendChild(box);
      box.addEventListener('click', (e) => {
        if (e.target === box || e.target.closest('[data-st="close"]')) return closePicker();
        const t = e.target.closest('[data-stg]');
        if (t) { stGroup = t.dataset.stg; return fillPicker(); }
        const it = e.target.closest('[data-stsrc]');
        if (it) return setSticker(it.dataset.stsrc);
        if (e.target.closest('[data-st="none"]')) return setSticker('');
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) closePicker(); });
    }
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    box.querySelector('.st-x').focus({ preventScroll: true });
    if (stCatalog) return fillPicker();
    fetch('/koleso/hub/index.json').then((r) => r.json()).then((d) => { stCatalog = d.groups || []; fillPicker(); })
      .catch(() => { box.querySelector('.st-grid').innerHTML = '<p class="muted">Стикеры не загрузились, попробуй ещё раз.</p>'; });
  }
  function fillPicker() {
    const box = $('#stPick');
    if (!box || !stCatalog || !stCatalog.length) return;
    // открывается на наборе, где лежит текущий стикер
    if (!stCatalog.some((g) => g.id === stGroup)) {
      const own = stCatalog.find((g) => g.items.some((i) => i.src === stP.sticker));
      stGroup = (own || stCatalog[0]).id;
    }
    box.querySelector('.st-tabs').innerHTML = stCatalog.map((g) => `<button type="button" data-stg="${esc(g.id)}" aria-pressed="${g.id === stGroup}">${esc(g.title)} · ${g.items.length}</button>`).join('');
    const g = stCatalog.find((x) => x.id === stGroup);
    const grid = box.querySelector('.st-grid');
    grid.innerHTML = g.items.map((i) => `<button type="button" data-stsrc="${esc(i.src)}" title="${esc(i.name)}" aria-label="${esc(i.name)}" aria-pressed="${i.src === stP.sticker}">${stMedia(i.src, true)}</button>`).join('');
    grid.scrollTop = 0;
    // ролики играют, только пока видны в окне
    if (stObs) stObs.disconnect();
    const vids = grid.querySelectorAll('video[data-src]');
    if (!('IntersectionObserver' in window)) { vids.forEach((v) => { v.src = v.dataset.src; v.play().catch(() => {}); }); return; }
    stObs = new IntersectionObserver((ents) => ents.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
    }), { root: grid, rootMargin: '120px' });
    vids.forEach((v) => stObs.observe(v));
  }
  function closePicker() {
    const box = $('#stPick');
    if (!box) return;
    box.hidden = true;
    document.body.style.overflow = '';
    if (stObs) stObs.disconnect();
    box.querySelectorAll('video').forEach((v) => v.pause());
    const b = $('#stBtn');
    if (b) b.focus({ preventScroll: true });
  }
  function setSticker(src) {
    const p = stP;
    const st = { src, at: Date.now() };
    p.sticker = src;
    keepSticker(st);
    if (token) send('PUT', '/shelf', { ratings: [], sticker: st }).catch(() => {});
    // меняем только кнопку: ник заново не анимируется
    const b = $('#stBtn');
    if (b) { b.classList.toggle('empty', !src); b.innerHTML = src ? stMedia(src) : '＋ стикер'; b.classList.remove('pop'); void b.offsetWidth; if (src) b.classList.add('pop'); }
    closePicker();
  }
  const localHide = () => (read(HIDE_KEY) || {})[hideOwner()] || { hide: [], at: 0 };
  const keepHide = (h) => { try { const all = read(HIDE_KEY) || {}; all[hideOwner()] = h; localStorage.setItem(HIDE_KEY, JSON.stringify(all)); } catch (e) {} };
  const visibleOf = (list, hide) => { const set = new Set(hide || []); return set.size ? list.filter((r) => !set.has(keyOf(r.cat))) : list; };

  // ---------- витрины и блоки профиля: что видно в профиле, решает хозяин; хранится в аккаунте ----------
  const LAYOUT_KEY = 'casualhub.profileLayout.v1'; // { id профиля: { showcases, sections, at } }
  const SECTIONS = [['stats', 'Цифры'], ['titles', 'Звания'], ['podium', 'Любимое'], ['all', 'Все оценки'], ['badges', 'Значки'], ['friends', 'Друзья'], ['hist', 'Оценки 1–10'], ['cats', 'Категории']];
  const SC_MAX = 6;
  const localLayout = () => (read(LAYOUT_KEY) || {})[hideOwner()] || null;
  const keepLayout = (l) => { try { const all = read(LAYOUT_KEY) || {}; all[hideOwner()] = l; localStorage.setItem(LAYOUT_KEY, JSON.stringify(all)); } catch (e) {} };
  const secOn = (p, k) => !(p.layout && p.layout.sections && p.layout.sections[k] === false);
  const hid = (p, k) => (secOn(p, k) ? '' : ' hidden');
  const catTitle = (p, key) => { const r = (p.allRatings || p.ratings).find((x) => keyOf(x.cat) === key); return r ? r.cat : key; };
  const autoTitle = (p, sc) => `Топ-${sc.n}: ${sc.cat ? catTitle(p, sc.cat) : 'всё подряд'}`;
  function scItems(p, sc) {
    const pool = p.ratings.filter((r) => !sc.cat || keyOf(r.cat) === sc.cat);
    if (sc.mode === 'pick') { const byId = new Map(pool.map((r) => [r.id, r])); return (sc.ids || []).map((id) => byId.get(id)).filter(Boolean).slice(0, sc.n); }
    return pool.filter((r) => r.total != null).sort((a, b) => b.total - a.total || b.at - a.at).slice(0, sc.n);
  }
  function showcasesHTML(p, d) {
    const out = ((p.layout && p.layout.showcases) || []).map((sc) => {
      const items = scItems(p, sc);
      if (!items.length && p.kind !== 'me') return '';
      return `<section class="card rise show" style="--d:${d++}">
        <div class="head"><h2 class="h2">${esc(sc.title || autoTitle(p, sc))}</h2><span class="label">${esc(sc.cat ? catTitle(p, sc.cat) : 'все темы')} · ${sc.mode === 'pick' ? 'мой выбор' : 'лучшие по баллу'}</span></div>
        ${items.length ? `<div class="sc-row ${sc.style === 'list' ? 'as-list' : 'as-posters'}">${items.map((r, k) => `<a class="sc-it" href="${rateLink(p, r)}" title="${esc(r.name)}" data-tier="${tierT(r.total)}">
          <div class="pic" data-photo="${r.photo ? esc(r.id) : ''}"><span class="place">${k + 1}</span><span class="ltr">${letter(r.name)}</span>${lbm(r)}</div>
          <strong>${esc(r.name)}</strong>${badge(r.total)}</a>`).join('')}</div>`
          : '<p class="muted">Пока пусто: в этой теме нет подходящих оценок. Витрину можно изменить кнопкой «Витрины и блоки».</p>'}
      </section>`;
    }).join('');
    return out ? `<div class="shows">${out}</div>` : '';
  }

  // окно «Витрины и блоки»: включить или выключить блоки, добавить, изменить, переставить витрины
  let lyP = null, lyEdit = null; // lyEdit — витрина, которую сейчас добавляют или меняют
  function saveLayout(p) {
    p.layout = { ...p.layout, at: Date.now() };
    keepLayout(p.layout);
    if (token) send('PUT', '/shelf', { ratings: [], layout: p.layout }).catch(() => {});
    render(p);
  }
  function layoutEditor(p) {
    lyP = p;
    if (!p.layout) p.layout = { showcases: [], sections: {}, at: 0 };
    let box = $('#lyPick');
    if (!box) {
      box = document.createElement('div');
      box.className = 'st-pick'; box.id = 'lyPick'; box.hidden = true;
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'lyTitle');
      box.innerHTML = '<div class="st-card ly-card"><div class="st-head"><h2 id="lyTitle">Витрины и блоки</h2><button type="button" class="st-x" data-ly="close" aria-label="Закрыть">✕</button></div><div class="ly-body" id="lyBody"></div></div>';
      document.body.appendChild(box);
      box.addEventListener('click', onLayoutClick);
      box.addEventListener('input', onLayoutInput);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) { if (lyEdit) { lyEdit = null; drawLayout(); } else closeLayout(); } });
    }
    lyEdit = null;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    drawLayout();
    box.querySelector('.st-x').focus({ preventScroll: true });
  }
  function closeLayout() {
    const box = $('#lyPick');
    if (!box) return;
    box.hidden = true;
    document.body.style.overflow = '';
    const b = $('#layoutBtn');
    if (b) b.focus({ preventScroll: true });
  }
  const lyCats = (p) => [...new Map((p.allRatings || p.ratings).map((r) => [keyOf(r.cat), r.cat])).entries()];
  function drawLayout() {
    const p = lyP, body = $('#lyBody');
    if (!p || !body) return;
    $('#lyTitle').textContent = lyEdit ? (lyEdit.isNew ? 'Новая витрина' : 'Витрина') : 'Витрины и блоки';
    if (lyEdit) { body.innerHTML = scFormHTML(p, lyEdit); hydratePhotos(p, body); return; }
    const scs = p.layout.showcases || [];
    body.innerHTML = `<span class="label">Что видно в профиле</span>
      <div class="chips ly-secs">${SECTIONS.map(([k, t]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${secOn(p, k)}">${esc(t)}</button>`).join('')}</div>
      <p class="ly-hint">Нажми на блок, чтобы скрыть его или вернуть. Скрытые блоки не видны ни тебе, ни друзьям.</p>
      <span class="label">Витрины · ${scs.length} из ${SC_MAX}</span>
      ${scs.length ? `<div class="ly-list">${scs.map((sc, i) => `<div class="ly-row"><span><b>${esc(sc.title || autoTitle(p, sc))}</b><small>${esc(sc.cat ? catTitle(p, sc.cat) : 'все темы')} · топ-${sc.n} · ${sc.mode === 'pick' ? 'выбор вручную' : 'лучшие по баллу'} · ${sc.style === 'list' ? 'список' : 'постеры'}</small></span>
        <button type="button" class="mini" data-ly="up" data-i="${i}" aria-label="Выше"${i ? '' : ' disabled'}>↑</button><button type="button" class="mini" data-ly="down" data-i="${i}" aria-label="Ниже"${i < scs.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="mini" data-ly="edit" data-i="${i}" aria-label="Изменить витрину">✎</button><button type="button" class="mini del" data-ly="del" data-i="${i}" aria-label="Удалить витрину">✕</button></div>`).join('')}</div>`
        : '<p class="ly-hint">Витрина — это твой топ, например «Топ-5 игр» или «Любимые фильмы». Она появится в профиле под цифрами.</p>'}
      ${scs.length < SC_MAX ? '<button type="button" class="btn primary" data-ly="add">＋ Добавить витрину</button>' : ''}`;
  }
  function pickListHTML(p, sc) {
    const q = keyOf(sc.q || '');
    const pool = (p.allRatings || p.ratings).filter((r) => (!sc.cat || keyOf(r.cat) === sc.cat) && (!q || keyOf(r.name).includes(q)))
      .sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.name.localeCompare(b.name, 'ru')).slice(0, 80);
    return pool.length ? pool.map((r) => { const i = sc.ids.indexOf(r.id); return `<button type="button" class="ly-it" data-pick="${esc(r.id)}" aria-pressed="${i >= 0}" data-tier="${tierT(r.total)}" title="${esc(r.name)}">
        <span class="pic" data-photo="${r.photo ? esc(r.id) : ''}"><span class="ltr">${letter(r.name)}</span>${lbm(r)}</span><i class="ly-n">${i >= 0 ? i + 1 : ''}</i>${badge(r.total)}<span class="nm">${esc(r.name)}</span></button>`; }).join('')
      : '<p class="ly-hint">В этой теме ничего не нашлось.</p>';
  }
  // превью витрины прямо в окне: обложки по порядку, свободные места пунктиром; в «Выберу сам» нажатие на обложку убирает её
  function scPreviewHTML(p, sc) {
    const all = p.allRatings || p.ratings;
    const items = sc.mode === 'pick' ? sc.ids.map((id) => all.find((r) => r.id === id)).filter(Boolean) : scItems(p, sc);
    const slot = (r, k) => (r
      ? `<${sc.mode === 'pick' ? `button type="button" data-pick="${esc(r.id)}" title="Убрать «${esc(r.name)}» из витрины"` : 'span'} class="sc-slot" data-tier="${tierT(r.total)}"><span class="pic" data-photo="${r.photo ? esc(r.id) : ''}"><span class="place">${k + 1}</span><span class="ltr">${letter(r.name)}</span>${sc.mode === 'pick' ? '<em aria-hidden="true">✕</em>' : ''}</span><small>${esc(r.name)}</small></${sc.mode === 'pick' ? 'button' : 'span'}>`
      : `<span class="sc-slot free"><span class="pic"><span class="place">${k + 1}</span><span class="plus">＋</span></span><small>${sc.mode === 'pick' ? 'выбери ниже' : 'пусто'}</small></span>`);
    return `<div class="sc-prev" id="scPrev"><div class="sc-prev-h"><b>${esc((sc.title || '').trim() || autoTitle(p, sc))}</b><small>${esc(sc.cat ? catTitle(p, sc.cat) : 'все темы')} · ${sc.mode === 'pick' ? 'мой выбор' : 'лучшие по баллу'} · ${items.length} из ${sc.n}</small></div>
      <div class="sc-prev-row n${sc.n}">${Array.from({ length: sc.n }, (_, k) => slot(items[k], k)).join('')}</div></div>`;
  }
  // после выбора: номера на обложках и превью обновляются на месте, без перерисовки всей сетки
  function syncPicks(p, sc) {
    const grid = $('#scPickList');
    if (grid) {
      grid.classList.toggle('full', sc.ids.length >= sc.n);
      grid.querySelectorAll('.ly-it').forEach((b) => { const i = sc.ids.indexOf(b.dataset.pick); b.setAttribute('aria-pressed', String(i >= 0)); b.querySelector('.ly-n').textContent = i >= 0 ? i + 1 : ''; });
    }
    const prev = $('#scPrev');
    if (prev) { prev.outerHTML = scPreviewHTML(p, sc); hydratePhotos(p, $('#scPrev')); }
    const lab = $('#scPicked');
    if (lab) lab.textContent = `Выбрано ${sc.ids.length} из ${sc.n} · порядок как нажимаешь`;
  }
  function scFormHTML(p, sc) {
    const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-f="${key}" data-v="${v}" aria-pressed="${String(sc[key]) === String(v)}">${t}</button>`).join('')}</div>`;
    return `${scPreviewHTML(p, sc)}
      <label class="ly-f"><span class="label">Название</span><input id="scTitle" type="text" maxlength="60" value="${esc(sc.title)}" placeholder="${esc(autoTitle(p, sc))}" autocomplete="off"></label>
      <div class="ly-f"><span class="label">Тема</span><div class="chips">${[['', 'Все темы'], ...lyCats(p)].map(([k, t]) => `<button type="button" class="chip" data-f="cat" data-v="${esc(k)}" aria-pressed="${sc.cat === k}">${esc(t)}</button>`).join('')}</div></div>
      <div class="ly-f"><span class="label">Сколько</span>${seg('n', [[3, 'Топ-3'], [5, 'Топ-5'], [10, 'Топ-10']])}</div>
      <div class="ly-f"><span class="label">Что попадёт</span>${seg('mode', [['auto', 'Лучшие по баллу'], ['pick', 'Выберу сам']])}</div>
      <div class="ly-f"><span class="label">Вид</span>${seg('style', [['posters', 'Постеры'], ['list', 'Список']])}</div>
      ${sc.mode === 'pick' ? `<div class="ly-f"><span class="label" id="scPicked">Выбрано ${sc.ids.length} из ${sc.n} · порядок как нажимаешь</span>
        <input id="scQ" class="search" type="search" placeholder="Найти по названию…" value="${esc(sc.q || '')}" autocomplete="off">
        <div class="ly-pickl${sc.ids.length >= sc.n ? ' full' : ''}" id="scPickList">${pickListHTML(p, sc)}</div></div>` : ''}
      ${sc.err ? `<p class="ly-err" role="alert">${esc(sc.err)}</p>` : ''}
      <div class="ly-acts"><button type="button" class="btn primary" data-ly="save">Сохранить витрину</button><button type="button" class="btn ghost" data-ly="cancel">Отмена</button></div>`;
  }
  function onLayoutInput(e) {
    if (!lyEdit) return;
    if (e.target.id === 'scTitle') { lyEdit.title = e.target.value; const h = $('#scPrev .sc-prev-h b'); if (h) h.textContent = lyEdit.title.trim() || autoTitle(lyP, lyEdit); }
    if (e.target.id === 'scQ') { lyEdit.q = e.target.value; $('#scPickList').innerHTML = pickListHTML(lyP, lyEdit); hydratePhotos(lyP, $('#scPickList')); }
  }
  function onLayoutClick(e) {
    const p = lyP, L = p.layout, box = $('#lyPick');
    if (e.target === box) return closeLayout();
    const sec = e.target.closest('[data-sec]');
    if (sec) { L.sections = { ...(L.sections || {}), [sec.dataset.sec]: !secOn(p, sec.dataset.sec) }; saveLayout(p); return drawLayout(); }
    const f = e.target.closest('[data-f]');
    if (f && lyEdit) {
      const k = f.dataset.f;
      const v = k === 'n' ? +f.dataset.v : f.dataset.v;
      if (k === 'cat' && lyEdit.cat !== v) lyEdit.ids = [];
      lyEdit[k] = v;
      if (k === 'n') lyEdit.ids = lyEdit.ids.slice(0, v);
      lyEdit.err = '';
      return drawLayout();
    }
    const pk = e.target.closest('[data-pick]');
    if (pk && lyEdit) {
      const id = pk.dataset.pick, i = lyEdit.ids.indexOf(id);
      if (i >= 0) lyEdit.ids.splice(i, 1);
      else if (lyEdit.ids.length < lyEdit.n) lyEdit.ids.push(id);
      else { lyEdit.err = `В топ-${lyEdit.n} больше не помещается: убери что-нибудь или выбери топ побольше`; return drawLayout(); }
      lyEdit.err = '';
      syncPicks(p, lyEdit);
      const errEl = $('#lyBody .ly-err'); if (errEl) errEl.remove();
      return;
    }
    const b = e.target.closest('[data-ly]');
    if (!b) return;
    const act = b.dataset.ly, i = +b.dataset.i;
    const scs = (L.showcases || []).slice();
    if (act === 'close') return closeLayout();
    if (act === 'add') { lyEdit = { id: 'sc' + Date.now().toString(36), title: '', cat: '', n: 5, mode: 'auto', ids: [], style: 'posters', q: '', isNew: true }; return drawLayout(); }
    if (act === 'edit') { lyEdit = { ...scs[i], ids: [...(scs[i].ids || [])], q: '' }; return drawLayout(); }
    if (act === 'cancel') { lyEdit = null; return drawLayout(); }
    if (act === 'save') {
      if (lyEdit.mode === 'pick' && !lyEdit.ids.length) { lyEdit.err = 'Выбери хотя бы одну оценку'; return drawLayout(); }
      const sc = { id: lyEdit.id, title: (lyEdit.title || '').trim().slice(0, 60), cat: lyEdit.cat, n: lyEdit.n, mode: lyEdit.mode, ids: lyEdit.mode === 'pick' ? lyEdit.ids.slice(0, lyEdit.n) : [], style: lyEdit.style };
      const at = scs.findIndex((x) => x.id === sc.id);
      if (at >= 0) scs[at] = sc; else scs.push(sc);
      L.showcases = scs.slice(0, SC_MAX);
      lyEdit = null;
      saveLayout(p);
      return drawLayout();
    }
    if (act === 'del') { scs.splice(i, 1); L.showcases = scs; saveLayout(p); return drawLayout(); }
    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= scs.length) return;
      [scs[i], scs[j]] = [scs[j], scs[i]];
      L.showcases = scs;
      saveLayout(p);
      return drawLayout();
    }
  }

  // ---------- отдельная страница «Все оценки» (/profile/?all=1): список, плитка, тир-лист или подробно ----------
  const ALL = new URLSearchParams(location.search).has('all');
  const ALL_KEY = 'casualhub.allView.v1';
  const AST = (() => {
    const v = read(ALL_KEY) || {};
    return { view: ['list', 'grid', 'tier', 'full'].includes(v.view) ? v.view : 'grid', sort: ['score', 'date', 'name'].includes(v.sort) ? v.sort : 'score', cats: [], q: '', limit: 60, genres: [], gOpen: false };
  })();
  const keepAll = () => { try { localStorage.setItem(ALL_KEY, JSON.stringify({ view: AST.view, sort: AST.sort })); } catch (e) {} };
  const TIERS = [['S', 9.2, '9,2–10'], ['A', 8.2, '8,2–9,1'], ['B', 7, '7–8,1'], ['C', 5, '5–6,9'], ['D', -1, 'ниже 5']];
  const allHref = (p) => (p.kind === 'me' || !p.uid ? '/profile/?all=1' : `/profile/?id=${encodeURIComponent(p.uid)}&all=1`);
  const cellsV = (v) => `<span class="cells" data-tier="${tierV(v)}" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < v ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.replace(/^[+\-•*]\s*/, '').trim()).filter(Boolean);
  let allP = null;
  function renderAll(p) {
    allP = p;
    document.title = `Все оценки · ${p.name} · Казуал Хаб`;
    if (!$('#allBody')) {
      app.innerHTML = `<section class="card rise all-top"><a class="btn ghost" href="${p.kind === 'me' || !p.uid ? '/profile/' : '/profile/?id=' + encodeURIComponent(p.uid)}">← Профиль</a>
        <div><h1 class="h2">Все оценки</h1><p class="muted"><span id="allWho"></span> · <span id="allCount"></span></p></div></section>
        <section class="card rise all-card" style="--d:1">
          <div class="chips" id="allCats"></div>
          <div class="tools">
            <input class="search" id="allQ" type="search" placeholder="Найти по названию…" aria-label="Найти оценку" autocomplete="off">
            <div class="seg" id="allSort" role="group" aria-label="Сортировка"><button type="button" data-sort="score">По баллу</button><button type="button" data-sort="date">Новые</button><button type="button" data-sort="name">А–Я</button></div>
            <div class="seg" id="allView" role="group" aria-label="Вид"><button type="button" data-view="list">Список</button><button type="button" data-view="grid">Плитка</button><button type="button" data-view="tier">Тир-лист</button><button type="button" data-view="full">Подробно</button></div>
            <button type="button" class="btn ghost genre-btn" id="allGenreBtn" aria-controls="allGenres" hidden>Фильтры</button>
          </div>
          <div class="chips genre-chips" id="allGenres" hidden></div>
          <div id="allBody"></div>
          <button type="button" class="btn ghost more" id="allMore" hidden>Показать ещё</button>
        </section>`;
      $('#allCats').addEventListener('click', (e) => {
        const b = e.target.closest('[data-acat]');
        if (!b) return;
        const k = b.dataset.acat;
        AST.cats = k === '*' ? [] : AST.cats.includes(k) ? AST.cats.filter((x) => x !== k) : [...AST.cats, k];
        AST.limit = 60;
        drawAll();
      });
      $('#allQ').addEventListener('input', (e) => { AST.q = e.target.value; AST.limit = 60; drawAll(); });
      $('#allSort').addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (b) { AST.sort = b.dataset.sort; keepAll(); drawAll(); } });
      $('#allView').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) { AST.view = b.dataset.view; AST.limit = 60; keepAll(); drawAll(); } });
      $('#allMore').addEventListener('click', () => { AST.limit += 60; drawAll(); });
      // «Свой тир-лист»: те же оценки, что сейчас на странице (темы, жанры, поиск), раскладываются по рядам вручную
      $('#allBody').addEventListener('click', (e) => {
        if (!e.target.closest('[data-tiermaker]') || !window.CasualTierMaker) return;
        const p = allP, mine = p.kind === 'me' || !p.uid;
        window.CasualTierMaker.open({
          scope: mine ? 'me' : 'u:' + p.uid,
          title: mine ? 'Свой тир-лист' : `Свой тир-лист: оценки ${p.name}`,
          items: (AST.shown || []).map((r) => ({ id: r.id, name: r.name, total: r.total, img: r.photo ? () => photoOf(p, r) : '' })),
        });
      });
      wireGenres($('#allGenreBtn'), $('#allGenres'), AST, drawAll);
    }
    $('#allWho').textContent = p.name;
    drawAll();
  }
  function drawAll() {
    const p = allP, rs = p.ratings;
    const cats = [...new Map(rs.map((r) => [keyOf(r.cat), r.cat])).entries()];
    AST.cats = AST.cats.filter((k) => cats.some(([c]) => c === k));
    $('#allCats').innerHTML = cats.length > 1 ? [`<button type="button" class="chip" data-acat="*" aria-pressed="${!AST.cats.length}">Все <b>${rs.length}</b></button>`]
      .concat(cats.map(([k, t]) => `<button type="button" class="chip" data-acat="${esc(k)}" aria-pressed="${AST.cats.includes(k)}">${esc(t)} <b>${rs.filter((r) => keyOf(r.cat) === k).length}</b></button>`)).join('') : '';
    $('#allSort').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === AST.sort)));
    $('#allView').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === AST.view)));
    $('#allSort').hidden = AST.view === 'tier';
    const q = keyOf(AST.q);
    const inCats = rs.filter((r) => !AST.cats.length || AST.cats.includes(keyOf(r.cat)));
    genreUI($('#allGenreBtn'), $('#allGenres'), inCats, AST);
    const list = inCats.filter((r) => hasGenres(r, AST.genres) && (!q || keyOf(r.name + ' ' + r.meta).includes(q)));
    AST.shown = list;
    list.sort(AST.sort === 'date' ? (a, b) => b.at - a.at : AST.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'ru') : (a, b) => (b.total ?? -1) - (a.total ?? -1) || b.at - a.at);
    $('#allCount').textContent = `${list.length} ${plural(list.length, 'оценка', 'оценки', 'оценок')}`;
    const body = $('#allBody');
    const more = $('#allMore');
    more.hidden = true;
    if (!list.length) { body.innerHTML = `<p class="muted">${rs.length ? 'Ничего не нашлось.' : 'Оценок пока нет.'}</p>`; return; }
    const pic = (r, cls) => `<div class="${cls || 'pic'}" data-photo="${r.photo ? esc(r.id) : ''}"><span class="ltr">${letter(r.name)}</span>${lbm(r)}</div>`;
    if (AST.view === 'tier') {
      const rated = list.filter((r) => r.total != null).sort((a, b) => b.total - a.total || b.at - a.at);
      const rows = TIERS.map(([t, min, range], i) => {
        const items = rated.filter((r) => r.total >= min && (i === 0 || r.total < TIERS[i - 1][1]));
        return `<div class="tl-row" data-t="${t}"><div class="tl-lab"><b>${t}</b><small>${range}</small></div><div class="tl-items">${items.length
          ? items.map((r) => `<a class="tl-it" href="${rateLink(p, r)}" title="${esc(r.name)} · ${fmt(r.total)}" data-tier="${tierT(r.total)}">${pic(r)}<span>${esc(r.name)}</span><b>${fmt(r.total)}</b></a>`).join('')
          : '<span class="tl-empty">—</span>'}</div></div>`;
      }).join('');
      const unrated = list.length - rated.length;
      body.innerHTML = `<div class="tm-open"><button type="button" class="btn ghost" data-tiermaker title="Разложить оценки по рядам самому, а не по баллу">✍️ Свой тир-лист</button></div><div class="tl">${rows}</div>${unrated ? `<p class="muted">Без балла: ${unrated}. В тир-лист они не попадают.</p>` : ''}`;
    } else {
      const shown = list.slice(0, AST.limit);
      more.hidden = list.length <= AST.limit;
      if (AST.view === 'list') {
        body.innerHTML = `<div class="list">${shown.map((r) => `<a class="item" href="${rateLink(p, r)}" title="Открыть оценку «${esc(r.name)}»" data-tier="${tierT(r.total)}">
          <span class="th" data-photo="${r.photo ? esc(r.id) : ''}">${letter(r.name)}${lbm(r)}</span>
          <span class="nm">${r.fav ? `<span class="fav">${ICON.star}</span> ` : ''}${esc(r.name)}</span>${badge(r.total)}
          <span class="meta">${cells(r.total)}<span>${esc(r.cat)}${r.status ? ' · ' + esc(r.status) : ''}</span></span></a>`).join('')}</div>`;
      } else if (AST.view === 'grid') {
        body.innerHTML = `<div class="tiles">${shown.map((r) => `<a class="tile" href="${rateLink(p, r)}" title="${esc(r.name)}" data-tier="${tierT(r.total)}">${pic(r)}
          <strong>${r.fav ? `<span class="fav">${ICON.star}</span> ` : ''}${esc(r.name)}</strong><div class="row"><small>${esc(r.cat)}</small>${badge(r.total)}</div></a>`).join('')}</div>`;
      } else {
        body.innerHTML = `<div class="full">${shown.map((r) => {
          const pros = lines(r.pros), cons = lines(r.cons);
          return `<article class="fr-card" data-tier="${tierT(r.total)}">
            <header><div class="th" data-photo="${r.photo ? esc(r.id) : ''}">${letter(r.name)}${lbm(r)}</div>
              <div class="fr-t"><a href="${rateLink(p, r)}">${r.fav ? `<span class="fav">${ICON.star}</span> ` : ''}${esc(r.name)}</a><small>${esc([r.cat, r.status, r.meta].filter(Boolean).join(' · '))}</small></div>${badge(r.total)}</header>
            ${r.scores.length ? `<ul class="crit">${r.scores.map((s) => `<li><span>${esc(s.name)}${s.w && s.w !== 1 ? ` <small>×${String(s.w).replace('.', ',')}</small>` : ''}</span>${cellsV(+s.v || 0)}<b>${+s.v || '—'}</b>${s.note ? `<em>${esc(s.note)}</em>` : ''}</li>`).join('')}</ul>` : ''}
            ${pros.length || cons.length ? `<div class="fr-pc">${pros.length ? `<div><span class="label">Плюсы</span><ul>${pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${cons.length ? `<div><span class="label">Минусы</span><ul>${cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
            ${r.text ? `<p class="fr-note">${esc(r.text)}</p>` : ''}
          </article>`;
        }).join('')}</div>`;
      }
    }
    hydratePhotos(p, body);
  }

  // ---------- карточка оценки: открывается окном прямо в профиле, без перехода в Мнение ----------
  const WORDS = ['—', 'Ужас', 'Провал', 'Плохо', 'Слабо', 'Средне', 'Нормально', 'Неплохо', 'Хорошо', 'Отлично', 'Шедевр'];
  const fullPhotoCache = new Map();
  // в окне фото крупное: своё берём из оценки, у друга — целиком с сервера (в списках лежат превью)
  const photoFull = (p, r) => {
    if (!r.photo) return Promise.resolve(null);
    if (r.photo.data && /^data:image\//.test(r.photo.data)) return Promise.resolve(r.photo.data);
    if (r.photo.url && /^https:\/\//.test(r.photo.url)) return Promise.resolve(r.photo.url);
    if (typeof r.photo.id === 'string' && /^https:\/\//.test(r.photo.id)) return Promise.resolve(r.photo.id);
    if (!token || !p.uid) return Promise.resolve(null);
    const k = p.uid + ':' + r.id;
    if (!fullPhotoCache.has(k)) fullPhotoCache.set(k, api(`/photo/${encodeURIComponent(p.uid)}/${encodeURIComponent(r.id)}`).then((d) => d.data || null, () => null));
    return fullPhotoCache.get(k);
  };
  let curP = null, rdBox = null, rdBack = null;
  function openRating(p, r) {
    if (!rdBox) {
      rdBox = document.createElement('div');
      rdBox.className = 'st-pick rd-pick'; rdBox.hidden = true;
      rdBox.setAttribute('role', 'dialog'); rdBox.setAttribute('aria-modal', 'true'); rdBox.setAttribute('aria-labelledby', 'rdTitle');
      document.body.appendChild(rdBox);
      rdBox.addEventListener('click', (e) => { if (e.target === rdBox || e.target.closest('[data-rd="close"]')) closeRating(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !rdBox.hidden) closeRating(); });
    }
    rdBack = document.activeElement;
    const word = r.total != null ? WORDS[Math.max(1, Math.min(10, Math.round(r.total)))] : 'Без балла';
    const n = r.scores.filter((s) => +s.v > 0).length;
    const pros = lines(r.pros), cons = lines(r.cons);
    const when = r.created || r.at;
    rdBox.innerHTML = `<article class="rd-card" data-tier="${tierT(r.total)}">
      <button type="button" class="st-x rd-x" data-rd="close" aria-label="Закрыть">✕</button>
      ${r.photo ? `<div class="rd-pic" id="rdPic"><span class="ltr">${letter(r.name)}</span>${lbm(r)}</div>` : ''}
      <div class="rd-top">
        <div class="rd-name"><span class="label">${esc(r.cat)}</span><h2 id="rdTitle">${r.fav ? `<span class="fav">${ICON.star}</span> ` : ''}${esc(r.name)}</h2>
          <p>${esc([word, n ? `${n} ${plural(n, 'критерий', 'критерия', 'критериев')}` : '', r.status, r.meta].filter(Boolean).join(' · '))}${r.lb ? ' <span class="lb-src">· <span class="lb-mark"><i></i><i></i><i></i></span>из Letterboxd</span>' : ''}</p></div>
        <div class="rd-score"><b>${r.total != null ? fmt(r.total) : '—'}</b><small>из 10</small></div>
      </div>
      ${r.scores.length ? `<ul class="rd-crit">${r.scores.map((s) => { const v = Math.max(0, Math.min(10, Math.round(+s.v || 0))); return `<li data-tier="${tierV(v)}">
        <div class="rd-ct"><b>${esc(s.name)}${s.w && s.w !== 1 ? ` <small>×${String(s.w).replace('.', ',')}</small>` : ''}</b><span>${v || '—'}</span></div>
        ${s.desc ? `<small class="rd-desc">${esc(s.desc)}</small>` : ''}
        <div class="rd-bar" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < v ? ' class="on"' : ''}></i>`).join('')}</div>
        ${s.note ? `<em>${esc(s.note)}</em>` : ''}</li>`; }).join('')}</ul>` : ''}
      ${pros.length || cons.length ? `<div class="fr-pc">${pros.length ? `<div><span class="label">Плюсы</span><ul>${pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${cons.length ? `<div><span class="label">Минусы</span><ul>${cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
      ${r.text ? `<p class="fr-note">${esc(r.text)}</p>` : ''}
      <div class="rd-foot"><span>${when ? dayFmt(when) : ''}</span><a class="btn ghost" href="${rateLink(p, r)}">Открыть в Мнении</a></div>
      ${p.uid && token ? '<div class="rd-cm" id="rdComments"></div>' : ''}
    </article>`;
    // ветка комментариев под оценкой: та же, что в Мнении у этой оценки
    if (p.uid && token && window.CasualComments) window.CasualComments.mount(rdBox.querySelector('#rdComments'), { uid: p.uid, target: 'r.' + r.id, token, title: 'Комментарии к оценке', placeholder: 'Что думаешь об этой оценке?' });
    rdBox.hidden = false;
    document.body.style.overflow = 'hidden';
    rdBox.querySelector('.rd-x').focus({ preventScroll: true });
    photoFull(p, r).then((src) => {
      const box = rdBox.querySelector('#rdPic');
      if (!src || !box) return;
      const img = new Image(); img.alt = ''; img.decoding = 'async';
      img.onload = () => { const l = box.querySelector('.ltr'); if (l) l.remove(); box.appendChild(img); };
      img.src = src;
    });
  }
  function closeRating() {
    if (!rdBox) return;
    rdBox.hidden = true;
    document.body.style.overflow = '';
    if (rdBack && rdBack.isConnected) rdBack.focus({ preventScroll: true });
  }
  // любая ссылка на оценку в профиле (список, «Любимое», витрины, все оценки) открывает карточку;
  // с Ctrl, Shift или средней кнопкой ссылка по-прежнему открывается в Мнении
  document.addEventListener('click', (e) => {
    const a = e.target.closest('#app a[href^="/mnenie/#"]');
    if (!a || !curP || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const id = new URLSearchParams((a.getAttribute('href').split('#')[1]) || '').get('r');
    const r = id && curP.ratings.find((x) => x.id === id);
    if (!r) return;
    e.preventDefault();
    openRating(curP, r);
  });

  function render(p) {
    curP = p;
    if (ALL) return renderAll(p);
    const rs = p.ratings;
    const rated = rs.filter((r) => r.total != null);
    const avg = rated.length ? rated.reduce((a, r) => a + r.total, 0) / rated.length : null;
    const masters = rated.filter((r) => r.total >= 8.5).length;
    const cats = new Map(); rs.forEach((r) => { const c = cats.get(r.cat) || { n: 0, sum: 0, k: 0 }; c.n++; if (r.total != null) { c.sum += r.total; c.k++; } cats.set(r.cat, c); });
    const hist = Array.from({ length: 10 }, (_, i) => rated.filter((r) => Math.min(10, Math.max(1, Math.round(r.total))) === i + 1).length);
    const hmax = Math.max(1, ...hist);
    const top3 = rated.slice().sort((a, b) => b.total - a.total || b.at - a.at).slice(0, 3);
    let d = 0;
    const isMe = p.kind === 'me';
    p.friendCount = p.kind === 'me' ? (p.friends ? p.friends.length : null) : p.friendCount;
    p.badges = user || p.kind !== 'me' ? badgesOf(p) : null;
    const ava = p.avatar && /^(data:image\/|https?:\/\/)/.test(p.avatar)
      ? `<span class="ava" style="background-image:url('${esc(p.avatar)}')"></span>`
      : `<span class="ava" style="background-color:${esc(p.color || colorOf(p.name))}">${letter(p.name)}</span>`;
    let i = 0;
    const nameHTML = calm ? esc(p.name) : [...p.name].map((c) => (c === ' ' ? ' ' : `<span class="ch" style="--i:${i++}">${esc(c)}</span>`)).join('');

    app.innerHTML = `
      <section class="card hero rise" style="--d:${d++}">
        <div class="banner${p.banner ? '' : ' def'}" id="banner"${p.banner ? ` style="background-image:url('${esc(p.banner)}');background-position:${posOf(p.banner).x}% ${posOf(p.banner).y}%"` : ''}><span class="ban-blur top" aria-hidden="true"></span><span class="ban-blur bot" aria-hidden="true"></span>${isMe ? `<button type="button" class="ban-btn" id="banBtn" aria-expanded="false" aria-controls="banMenu"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="2"/><circle cx="5.5" cy="6.5" r="1.3"/><path d="M14.5 11l-4-3.5-6 5.5"/></svg><span>Баннер</span></button>` : ''}</div>
        ${isMe ? `<div class="ban-menu" id="banMenu" role="dialog" aria-label="Баннер профиля" hidden>
          <span class="label">Своя картинка</span>
          <label class="btn ghost ban-up">Загрузить картинку<input type="file" id="banFile" accept="image/*" class="vh"></label>
          <p class="ban-hint">Лучше широкая, примерно 3 к 1. Картинку можно и просто перетащить на баннер.</p>
          <span class="label">Готовые</span>
          <div class="ban-presets" id="banPresets"></div>
          ${token && p.uid ? '<span class="label">Прошлые баннеры</span><div class="hist-grid hg-ban" id="banHist"></div>' : ''}
          <button type="button" class="btn ghost" id="banPos"${p.banner ? '' : ' hidden'}>Выбрать видимую часть</button>
          <button type="button" class="btn ghost" id="banRemove"${p.banner ? '' : ' hidden'}>Убрать баннер</button>
          <p class="ban-msg" id="banMsg" role="status"></p>
        </div>` : ''}
        <div class="ava-wrap${isMe && user ? ' can' : ''}" id="avaWrap"${isMe && user ? ' role="button" tabindex="0" aria-label="Сменить аватар, можно и анимированный GIF" title="Сменить аватар"' : ''}><span class="ava-ring" aria-hidden="true"></span>${ava}${isMe && user ? `<span class="ava-edit" aria-hidden="true"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M2 5.5h2.5L6 3.5h4l1.5 2H14v7H2z"/><circle cx="8" cy="9" r="2.3"/></svg></span><input type="file" id="avaFile" accept="image/*" class="vh">` : ''}</div>
        <div class="who">
          <div class="name-row">${isMe && p.editingName
            ? `<form class="name-edit" id="nameEditForm"><input id="profileNameInput" type="text" value="${esc(p.name)}" minlength="2" maxlength="24" aria-label="Ник"><button type="submit" class="btn primary">Сохранить</button><button type="button" class="btn ghost" id="profileNameCancel">Отмена</button></form>`
            : `<h1 class="name" id="profileName" aria-label="${esc(p.name)}"${isMe ? ' role="button" tabindex="0" title="Нажми, чтобы изменить ник"' : ''}>${nameHTML}</h1>`}${isMe && !p.editingName ? `<button type="button" class="name-ic" id="profileEditBtn" title="Изменить ник" aria-label="Изменить ник">${ICON_PEN}</button>` : ''}${!isMe && p.uid && token ? bellHTML(p.followed) : ''}${stickerSlot(p)}</div>
          <p class="sub">${esc(p.sub)}</p>
          ${!isMe && p.uid ? `<p class="sub" data-seen="${esc(p.uid)}" data-last="${+p.lastSeen || ''}"></p>` : ''}
          <div class="titles"${hid(p, 'titles')}>${titlesOf(rs).map((t) => `<span class="title-chip" data-tier="${t.tier}"><i></i>${esc(t.t)}</span>`).join('')}</div>
          <div class="hero-acts">${isMe
            ? `<a class="btn primary" href="/mnenie/">Оценить что-нибудь</a><button type="button" class="btn ghost ic-btn" id="layoutBtn" title="Витрины и блоки: что показывать в профиле" aria-label="Витрины и блоки">${ICON_LAYOUT}</button>`
            : `<a class="btn ghost" href="/profile/">Мой профиль</a>${p.common && p.common.length ? '<a class="btn primary" href="#taste">Сравнить вкусы</a>' : ''}`}</div>
        </div>
      </section>

      <div class="stats"${hid(p, 'stats')}>
        <button type="button" class="stat rise" data-jump="allSec" style="--d:${d++}"><b data-count="${rs.length}">${rs.length}</b><span>${plural(rs.length, 'оценка', 'оценки', 'оценок')}</span></button>
        <div class="stat tiered rise" data-tier="${tierT(avg)}" style="--d:${d++}"><b>${avg != null ? fmt(avg) : '—'}</b><span>средний балл</span></div>
        <button type="button" class="stat rise" data-jump="best" style="--d:${d++}"><b data-count="${masters}">${masters}</b><span>${plural(masters, 'шедевр', 'шедевра', 'шедевров')} 8,5+</span></button>
        <button type="button" class="stat rise" data-jump="catsSec" style="--d:${d++}"><b data-count="${cats.size}">${cats.size}</b><span>${plural(cats.size, 'категория', 'категории', 'категорий')}</span></button>
        ${p.common
          ? `<button type="button" class="stat rise" data-jump="taste" style="--d:${d++}"><b data-count="${p.common.length}">${p.common.length}</b><span>${plural(p.common.length, 'общая оценка', 'общие оценки', 'общих оценок')}</span></button>`
          : `<button type="button" class="stat rise" data-jump="friendsSec" style="--d:${d++}"><b>${p.friends ? `<span data-count="${p.friends.length}">${p.friends.length}</span>` : '—'}</b><span>${p.friends ? plural(p.friends.length, 'друг', 'друга', 'друзей') : 'друзья'}</span></button>`}
      </div>

      ${showcasesHTML(p, d)}

      <div class="grid">
        <div class="col">
          ${top3.length && secOn(p, 'podium') ? `<section class="card rise" style="--d:${d++}">
            <div class="head"><h2 class="h2">Любимое</h2><span class="label">топ по баллу</span></div>
            <div class="podium">${top3.map((r, k) => `<a class="pod p${k + 1}" href="${rateLink(p, r)}" title="Открыть оценку «${esc(r.name)}»" data-tier="${tierT(r.total)}">
              <div class="pic" data-photo="${r.photo ? esc(r.id) : ''}"><span class="place">${k + 1}</span><span class="ltr">${letter(r.name)}</span>${lbm(r)}</div>
              <strong>${esc(r.name)}</strong>
              <div class="row"><small>${esc(r.cat)}</small>${badge(r.total)}</div></a>`).join('')}</div>
          </section>` : ''}

          <section class="card rise" id="allSec"${hid(p, 'all')} style="--d:${d++}">
            <div class="head"><h2 class="h2">Все оценки</h2><span class="label" id="listStat"></span>
              <div class="head-pill">${isMe && p.allRatings && p.allRatings.length ? `<button type="button" class="hp-btn hp-down" id="topicsBtn" aria-expanded="${ST.topics}" aria-controls="topics" title="Что показывать в профиле${p.hide && p.hide.length ? ` · скрыто тем: ${p.hide.length}` : ''}" aria-label="Что показывать в профиле"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>${p.hide && p.hide.length ? `<i class="hp-n">${p.hide.length}</i>` : ''}</button><span class="hp-sep" aria-hidden="true"></span>` : ''}<a class="hp-btn" href="${allHref(p)}" title="Открыть все оценки" aria-label="Открыть все оценки"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 4.5h6v6M11.5 4.5l-7 7"/></svg></a></div></div>
            ${isMe && p.allRatings && p.allRatings.length ? `<div class="topics" id="topics"${ST.topics ? '' : ' hidden'}>
              <span class="label">Что видно в профиле</span>
              <div class="chips" style="margin:0">${[...new Map(p.allRatings.map((r) => [keyOf(r.cat), r.cat])).entries()].map(([k, name]) => `<button type="button" class="chip" data-topic="${esc(k)}" aria-pressed="${!(p.hide || []).includes(k)}">${esc(name)} <b>${p.allRatings.filter((r) => keyOf(r.cat) === k).length}</b></button>`).join('')}</div>
              <p>Нажми на тему, чтобы скрыть её или вернуть. Скрытые темы не видны в профиле ни тебе, ни друзьям, а в Мнении всё остаётся как было.</p>
            </div>` : ''}
            ${rs.length ? `
            <div class="chips" id="catChips"></div>
            <div class="tools">
              <input class="search" id="q" type="search" placeholder="Найти по названию…" aria-label="Найти оценку" autocomplete="off">
              <div class="seg" id="sortSeg" role="group" aria-label="Сортировка"><button type="button" data-sort="score">По баллу</button><button type="button" data-sort="date">Новые</button><button type="button" data-sort="name">А–Я</button></div>
              <button type="button" class="btn ghost genre-btn" id="genreBtn" aria-controls="genreChips" hidden>Фильтры</button>
            </div>
            <div class="chips genre-chips" id="genreChips" hidden></div>
            <div class="list" id="list"></div>
            <button type="button" class="btn ghost more" id="more" hidden>Показать ещё</button>`
            : `<div class="empty"><p class="muted"><strong>${isMe ? 'Тут появятся твои оценки.' : 'У друга пока нет оценок.'}</strong> ${isMe ? 'Оцени игру, фильм или любимую кофейню в Мнении Казуала, и профиль оживёт.' : 'Как только он что-нибудь оценит, оценки появятся здесь.'}</p>${isMe ? '<a class="btn primary" href="/mnenie/">Оценить первое</a>' : ''}</div>`}
          </section>
        </div>

        <div class="col">
          ${p.badges ? `<section class="card rise" id="badgesSec"${hid(p, 'badges')} style="--d:${d++}">
            <div class="head"><h2 class="h2">Значки</h2><span class="label">${p.badges.filter((b) => b.got).length} из ${p.badges.length}</span></div>
            ${(() => { const shown = p.badges.filter((b) => b.got).length + 4; return badgesHTML(p.badges.slice(0, shown)) + (p.badges.length > shown ? `<details class="bdg-more"><summary>Все значки · ещё ${p.badges.length - shown}</summary>${badgesHTML(p.badges.slice(shown))}</details>` : ''); })()}
          </section>` : ''}
          ${p.common ? `<section class="card rise" id="taste" style="--d:${d++}">
            <div class="head"><h2 class="h2">Вкусы</h2><span class="label">ты и ${esc(p.name)}</span></div>
            ${p.common.length ? `<div class="match"><div class="ring" data-tier="${tierT(p.match / 10)}" style="--p:${p.match}"><b>${p.match}%</b></div>
              <p class="muted">${p.match >= 80 ? 'Вы смотрите на мир почти одинаково.' : p.match >= 60 ? 'Во многом сходитесь, но есть о чём поспорить.' : 'Вкусы расходятся: отличный повод для спора.'} Общих оценок: <b>${p.common.length}</b>.</p></div>
              <div class="cmp-head"><span>Что</span><span>ты</span><span>${esc([...p.name][0] || '')}</span><span></span></div>
              <div class="cmp">${p.common.slice(0, 12).map((c) => `<div class="cmp-row"><span title="${esc(c.name)}">${esc(c.name)}</span>${badge(c.mine)}${badge(c.theirs)}<em>${c.diff ? (c.diff > 0 ? '+' : '') + fmt(c.diff) : '='}</em></div>`).join('')}</div>`
              : '<p class="muted">Общих оценок пока нет. Оцените одно и то же, и здесь появится, насколько совпадают ваши вкусы.</p>'}
          </section>` : ''}

          ${p.friends ? `<section class="card rise"${hid(p, 'friends')} style="--d:${d++}">
            <div class="head" id="friendsSec"><h2 class="h2">Друзья</h2><span class="label">${p.friends.length}</span></div>
            ${p.friends.length ? `<div class="frs">${p.friends.map((f) => `<a class="fr" href="/profile/?id=${encodeURIComponent(f.id)}">
                <span class="av" data-uid="${esc(f.id)}" style="background-color:${colorOf(f.username)}">${letter(f.username)}</span>
                <span class="tx"><b>${esc(f.username)} <i class="on-dot" data-on="${esc(f.id)}" data-last="${+f.lastSeen || ''}"></i></b><small><span data-seen="${esc(f.id)}" data-last="${+f.lastSeen || ''}" data-post=" · "></span>${f.handle ? '@' + esc(f.handle) : ''}${isMe ? `${f.handle ? ' · ' : ''}${f.updatedAt ? 'оценки обновлены ' + ago(f.updatedAt) : 'оценок пока нет'}` : ''}</small></span>${ICON.go}</a>`).join('')}</div>`
              : `<p class="muted">${isMe ? 'Пока никого. Добавить друга можно кнопкой «Друзья» в меню вверху.' : 'Пока никого.'}</p>`}
            ${p.incoming ? `<p class="note">${p.incoming} ${plural(p.incoming, 'заявка', 'заявки', 'заявок')} в друзья ${plural(p.incoming, 'ждёт', 'ждут', 'ждут')} ответа. <a href="/mnenie/">Открыть в Мнении</a></p>` : ''}
          </section>` : (isMe ? `<section class="card rise"${hid(p, 'friends')} style="--d:${d++}"><div class="head"><h2 class="h2">Друзья</h2></div><p class="muted">${esc(p.friendsHint || '')}</p></section>` : '')}

          ${cats.size ? `<section class="card rise"${hid(p, 'hist')} style="--d:${d++}">
            <div class="head"><h2 class="h2">Оценки 1–10</h2><span class="label">${rated.length} с баллом</span></div>
            <div class="hist">${hist.map((n, k) => `<div data-tier="${tierV(k + 1)}"><span class="bar${n ? '' : ' zero'}" style="height:${n ? Math.max(6, (n / hmax) * 100) : 3}%;--d:${k}"></span><small>${n || ''}</small><em>${k + 1}</em></div>`).join('')}</div>
          </section>
          <section class="card rise" id="catsSec"${hid(p, 'cats')} style="--d:${d++}">
            <div class="head"><h2 class="h2">Категории</h2></div>
            <div class="catl">${[...cats.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, c]) => { const av = c.k ? c.sum / c.k : null; return `<button type="button" class="cat" data-catgo="${esc(name)}" title="Показать оценки «${esc(name)}»"><b>${esc(name)}</b><small>${c.n} · ${av != null ? 'в среднем ' + fmt(av) : 'без балла'}</small><span class="tr" data-tier="${tierT(av)}"><i style="width:${(c.n / rs.length) * 100}%"></i></span></button>`; }).join('')}</div>
          </section>` : ''}
        </div>
      </div>
      ${p.uid && token ? `<section class="card rise wall" id="wallSec" style="--d:${d++}" aria-label="Комментарии в профиле"></section>` : ''}`;

    // стена профиля в самом низу, как в Steam: пишут хозяин и его друзья
    if (p.uid && token && window.CasualComments) window.CasualComments.mount($('#wallSec'), {
      uid: p.uid, target: 'wall', token, title: isMe ? 'Комментарии в твоём профиле' : `Комментарии в профиле ${p.name}`,
      placeholder: isMe ? 'Напиши что-нибудь у себя на стене…' : `Напиши что-нибудь ${p.name}…`,
      empty: isMe ? 'Пока никто ничего не написал. Друзья могут оставить тут комментарий.' : 'Пока пусто. Напиши первым!',
    });
    if (rs.length) wireList(p);
    wireJumps(p);
    if (isMe) { const lb = $('#layoutBtn'); if (lb) lb.addEventListener('click', () => layoutEditor(p)); wireProfileName(p); }
    const fb = $('#followBtn');
    if (fb) fb.addEventListener('click', () => toggleFollow(p, fb));
    if (isMe) { wireBanner(p); wireAvatar(p); wireTopics(p); const sb = $('#stBtn'); if (sb) sb.addEventListener('click', () => stickerPicker(p)); }
    hydrateFriendAvatars(p);
    if (window.CasualOnline) window.CasualOnline.paint(app);
    hydratePhotos(p, app);
    countUp();
  }

  const rateLink = (p, r) => (p.kind === 'me' || !p.uid ? `/mnenie/#r=${encodeURIComponent(r.id)}` : `/mnenie/#friend=${encodeURIComponent(p.uid)}&r=${encodeURIComponent(r.id)}`);
  // плитки и категории: прокрутка к разделу, категория ещё и фильтрует список
  // плавная прокрутка к разделу; если браузер её не довёл — докручиваем сразу
  const jumpTo = (el) => {
    if (!el) return;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => { if (Math.abs(el.getBoundingClientRect().top) > 60) el.scrollIntoView({ block: 'start' }); }, 900);
  };
  let jumpP = null, jumpsWired = false;
  function wireJumps(p) {
    jumpP = p; // обработчик один на страницу, профиль берётся последний отрисованный
    if (jumpsWired) return;
    jumpsWired = true;
    app.addEventListener('click', (e) => {
      const p = jumpP;
      if (!p) return;
      const j = e.target.closest('[data-jump]');
      if (j) {
        const to = j.dataset.jump;
        if (to === 'best') { ST.sort = 'score'; ST.cat = 'all'; ST.limit = 24; render(p); }
        const target = document.getElementById(to === 'best' ? 'allSec' : to);
        if ((!target || target.hidden) && (to === 'best' || to === 'allSec' || to === 'catsSec')) { location.href = allHref(p); return; }
        jumpTo(target);
        return;
      }
      const c = e.target.closest('[data-catgo]');
      if (c) {
        ST.cat = c.dataset.catgo; ST.limit = 24; ST.q = '';
        render(p);
        jumpTo(document.getElementById('allSec'));
      }
    });
  }

  function wireTopics(p) {
    const btn = $('#topicsBtn'), box = $('#topics');
    if (!btn || !box) return;
    btn.addEventListener('click', () => { ST.topics = !ST.topics; box.hidden = !ST.topics; btn.setAttribute('aria-expanded', String(ST.topics)); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-topic]');
      if (!b) return;
      const k = b.dataset.topic;
      const hide = new Set(p.hide || []);
      if (hide.has(k)) hide.delete(k); else hide.add(k);
      const h = { hide: [...hide], at: Date.now() };
      p.hide = h.hide;
      keepHide(h);
      if (token) send('PUT', '/shelf', { ratings: [], profile: h }).catch(() => {});
      p.ratings = visibleOf(p.allRatings, p.hide);
      if (ST.cat !== 'all' && !p.ratings.some((r) => r.cat === ST.cat)) ST.cat = 'all';
      render(p);
    });
  }

  function wireList(p) {
    const rs = p.ratings;
    const cats = [...new Set(rs.map((r) => r.cat))];
    const chips = $('#catChips');
    const draw = () => {
      chips.innerHTML = cats.length > 1 ? [`<button type="button" class="chip" data-cat="all" aria-pressed="${ST.cat === 'all'}">Все <b>${rs.length}</b></button>`]
        .concat(cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${ST.cat === c}">${esc(c)} <b>${rs.filter((r) => r.cat === c).length}</b></button>`)).join('') : '';
      $('#sortSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === ST.sort)));
      const q = keyOf(ST.q);
      const inCat = rs.filter((r) => ST.cat === 'all' || r.cat === ST.cat);
      genreUI($('#genreBtn'), $('#genreChips'), inCat, ST);
      let list = inCat.filter((r) => hasGenres(r, ST.genres) && (!q || keyOf(r.name + ' ' + r.meta).includes(q)));
      list.sort(ST.sort === 'date' ? (a, b) => b.at - a.at : ST.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'ru') : (a, b) => (b.total ?? -1) - (a.total ?? -1) || b.at - a.at);
      $('#listStat').textContent = `${list.length} ${plural(list.length, 'оценка', 'оценки', 'оценок')}`;
      const shown = list.slice(0, ST.limit);
      $('#list').innerHTML = shown.length ? shown.map((r) => `<a class="item" href="${rateLink(p, r)}" title="Открыть оценку «${esc(r.name)}»" data-tier="${tierT(r.total)}">
          <span class="th" data-photo="${r.photo ? esc(r.id) : ''}">${letter(r.name)}${lbm(r)}</span>
          <span class="nm" title="${esc(r.name)}">${r.fav ? `<span class="fav">${ICON.star}</span> ` : ''}${esc(r.name)}</span>
          ${badge(r.total)}
          <span class="meta">${cells(r.total)}<span>${esc(r.cat)}${r.status ? ' · ' + esc(r.status) : ''}</span></span>
        </a>`).join('') : '<p class="muted">Ничего не нашлось.</p>';
      $('#more').hidden = list.length <= ST.limit;
      hydratePhotos(p, $('#list'));
    };
    chips.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; ST.cat = b.dataset.cat; ST.limit = 24; draw(); });
    $('#sortSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (!b) return; ST.sort = b.dataset.sort; draw(); });
    $('#q').addEventListener('input', (e) => { ST.q = e.target.value; ST.limit = 24; draw(); });
    $('#more').addEventListener('click', () => { ST.limit += 24; draw(); });
    wireGenres($('#genreBtn'), $('#genreChips'), ST, draw);
    draw();
  }

  // числа в плитках набегают от нуля
  function countUp() {
    if (calm) return;
    document.querySelectorAll('[data-count]').forEach((n) => {
      const to = +n.dataset.count; if (!to) return;
      const t0 = performance.now(), D = 700;
      const step = (t) => { const k = Math.min(1, (t - t0) / D); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      n.textContent = '0';
      requestAnimationFrame(step);
    });
  }

  // ---------- баннер: своя картинка или готовый, хранится в браузере и в аккаунте ----------
  const BANNER_KEY = 'casualhub.banner.v1';
  const bannerOwner = () => (user ? user.id : 'guest');
  const localBanner = () => (read(BANNER_KEY) || {})[bannerOwner()] || null;
  const keepBanner = (d) => {
    try {
      const all = read(BANNER_KEY) || {};
      if (d) all[bannerOwner()] = d; else delete all[bannerOwner()];
      localStorage.setItem(BANNER_KEY, JSON.stringify(all));
      return true;
    } catch (e) { return false; }
  };
  const send = (method, path, body) => fetch('/api' + path, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  // видимая часть баннера едет вместе с картинкой: «…#pos=x,y» в конце (браузер такой хвост у картинки не читает)
  const posOf = (d) => { const m = /#pos=(\d{1,3}),(\d{1,3})$/.exec(d || ''); return m ? { x: Math.min(100, +m[1]), y: Math.min(100, +m[2]) } : { x: 50, y: 50 }; };
  const bare = (d) => String(d || '').replace(/#pos=\d{1,3},\d{1,3}$/, '');
  const showBanner = (d) => {
    const b = document.getElementById('banner');
    if (!b) return;
    b.classList.toggle('def', !d);
    b.style.backgroundImage = d ? `url("${d}")` : '';
    const ps = posOf(d);
    b.style.backgroundPosition = d ? `${ps.x}% ${ps.y}%` : '';
    ['banRemove', 'banPos'].forEach((id) => { const e = document.getElementById(id); if (e) e.hidden = !d; });
  };
  // любая картинка ложится в 1500×500 «по ширине», в JPEG, чтобы влезть и в браузер, и в аккаунт
  const W = 1500, H = 500;
  const paint = (draw, w = W, h = H, type = 'image/jpeg') => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.scale(w / W, h / H);
    draw(ctx);
    let q = 0.86, d = c.toDataURL(type, q);
    while (d.length > 900000 && q > 0.5) { q -= 0.1; d = c.toDataURL(type, q); }
    return d;
  };
  const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const TIER = ['#F26A55', '#F2BA44', '#43C97A'];
  const PRESETS = [
    { name: 'Шкала', draw(ctx) {
      ctx.fillStyle = '#14161C'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1F232C'; for (let x = 9; x < W; x += 18) for (let y = 9; y < H; y += 18) ctx.fillRect(x, y, 2, 2);
      const n = 10, gap = 18, cw = (W - 260 - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x = 130 + i * (cw + gap), knob = i === 8, hh = knob ? 220 : 70;
        ctx.fillStyle = i < 9 ? (i < 4 ? TIER[0] : i < 7 ? TIER[1] : TIER[2]) : '#272C36';
        ctx.beginPath(); ctx.roundRect(x, H / 2 - hh / 2, cw, hh, knob ? 24 : 16); ctx.fill();
      }
    } },
    { name: 'Пиксели', draw(ctx) {
      ctx.fillStyle = '#0D0F14'; ctx.fillRect(0, 0, W, H);
      const r = rnd(42), cols = ['#F26A55', '#F2BA44', '#43C97A', '#8C9BFF', '#272C36', '#272C36', '#1D2129'];
      for (let x = 0; x < W; x += 50) for (let y = 0; y < H; y += 50) {
        const fade = Math.max(0, 1 - Math.abs(x - W * 0.6) / (W * 0.6));
        if (r() > 0.25 + (1 - fade) * 0.55) continue;
        ctx.fillStyle = cols[Math.floor(r() * cols.length)];
        ctx.beginPath(); ctx.roundRect(x + 5, y + 5, 40, 40, 9); ctx.fill();
      }
    } },
    { name: 'Сияние', draw(ctx) {
      ctx.fillStyle = '#0D0F14'; ctx.fillRect(0, 0, W, H);
      [['#8C9BFF', 300, 60, 520], ['#43C97A', 1100, 120, 460], ['#F2BA44', 760, 560, 420], ['#EC4899', 1400, 520, 300]].forEach(([c, x, y, rr]) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, c + 'cc'); g.addColorStop(1, c + '00');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });
    } },
    { name: 'Колесо', draw(ctx) {
      ctx.fillStyle = '#120B1F'; ctx.fillRect(0, 0, W, H);
      const cols = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#06B6D4', '#F97316', '#14B8A6'], cx = 1180, cy = 250, R = 420;
      cols.forEach((c, i) => { const a0 = i / cols.length * Math.PI * 2 - 0.3, a1 = (i + 1) / cols.length * Math.PI * 2 - 0.3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); });
      ctx.lineWidth = 26; ctx.strokeStyle = '#14161C'; ctx.beginPath(); ctx.arc(cx, cy, R + 13, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#8C9BFF'; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(0, 0, W * 0.7, 0); g.addColorStop(0, '#120B1F'); g.addColorStop(1, '#120B1F00'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } },
    { name: 'Закат', draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2B1A3F'); g.addColorStop(0.55, '#F26A55'); g.addColorStop(1, '#F2BA44');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#FFE3A8'; ctx.beginPath(); ctx.arc(W * 0.68, H * 0.72, 150, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#2B1A3F'; for (let i = 0; i < 7; i++) ctx.fillRect(0, H * 0.72 + i * 22, W, 6 + i * 2);
    } },
    { name: 'Неон', draw(ctx) {
      ctx.fillStyle = '#120B1F'; ctx.fillRect(0, 0, W, H);
      const sun = ctx.createLinearGradient(0, 60, 0, 300); sun.addColorStop(0, '#FFC857'); sun.addColorStop(1, '#FF4FD8');
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(W / 2, 290, 190, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#FF4FD8'; ctx.lineWidth = 3;
      for (let i = 0; i < 9; i++) { const y = 300 + i * i * 3.4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 22, 300); ctx.lineTo(W / 2 + i * 140, H); ctx.stroke(); }
      ctx.fillStyle = '#120B1F'; ctx.fillRect(0, 296, W, 4);
    } },
  ];

  const ANIM_MAX = 1.3 * 1048576, ANIM_MAX_MB = '1,3', AVA_ANIM_MAX = 1048576;
  const asDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  // картинку «по размеру» w×h: обрезаем по центру, как background-size: cover
  const fitImage = (bmp, w, h, type, q) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const k = Math.max(w / bmp.width, h / bmp.height);
    c.getContext('2d').drawImage(bmp, (w - bmp.width * k) / 2, (h - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
    let qq = q || 0.86, d = c.toDataURL(type, qq);
    while (d.length > 900000 && qq > 0.5) { qq -= 0.1; d = c.toDataURL(type, qq); }
    return d;
  };
  // анимированная аватарка хранится отдельно, один раз на аккаунт: в оценки уходит маленький статичный первый кадр.
  // Показывается, пока статичная аватарка та же (если сменить её в Мнении, анимация больше не показывается).
  const ANIM_KEY = 'casualhub.avatarAnim.v1';
  const sigOf = (a) => (typeof a === 'string' ? a.slice(-48) : '');
  const shownAvatar = (u) => {
    if (!u) return null;
    const a = (read(ANIM_KEY) || {})[u.id];
    return a && a.data && a.sig === sigOf(u.avatar) ? a.data : u.avatar;
  };
  const isImgSrc = (a) => typeof a === 'string' && /^(data:image\/|https?:\/\/)/.test(a);
  const toastEl = () => document.getElementById('toast') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toast', className: 'toast', role: 'status' }));
  let toastT = 0;
  const toast = (t) => { const e = toastEl(); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 3200); };
  const setAvaEl = (src) => {
    const a = document.querySelector('#avaWrap .ava');
    if (!a || !isImgSrc(src)) return;
    a.style.backgroundImage = `url("${src}")`;
    a.textContent = '';
  };

  function wireAvatar(p) {
    const wrap = $('#avaWrap'), inp = $('#avaFile');
    if (!wrap || !inp) return;
    // с аккаунтом нажатие открывает меню: загрузить новую или вернуть одну из прошлых; без аккаунта — сразу выбор файла
    const pick = () => (token && p.uid ? histMenu(wrap, 'avatar', p, { upload: () => inp.click(), use: (d) => setAvatar(dataToBlob(d)) }) : inp.click());
    wrap.addEventListener('click', (e) => { if (e.target !== inp && !e.target.closest('.hist-menu')) pick(); });
    wrap.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.hist-menu')) { e.preventDefault(); pick(); } });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.value = '';
      if (f) setAvatar(f);
    });
    async function setAvatar(f) {
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast('Нужна картинка: JPG, PNG, WebP или GIF'); return; }
      const animated = /^image\/(gif|webp)$/.test(f.type) && f.size <= AVA_ANIM_MAX;
      if (f.type === 'image/gif' && f.size > AVA_ANIM_MAX) toast('GIF больше 1 МБ, поставлю его первый кадр без анимации');
      wrap.classList.add('busy');
      try {
        const bmp = await createImageBitmap(f);
        const still = fitImage(bmp, 160, 160, 'image/jpeg', 0.88); // первый кадр, квадратом
        if (bmp.close) bmp.close();
        const anim = animated ? await asDataUrl(f) : null;
        // статичная аватарка там же, где её хранит Мнение: в профиле, в списке профилей и в твоих оценках
        const cur = read('ocenshik.user.v1');
        if (!cur || cur.id !== user.id) throw new Error('user');
        cur.avatar = still; user.avatar = still;
        const users = (read('ocenshik.users.v1') || []).map((u) => (u.id === cur.id ? Object.assign(u, { avatar: still }) : u));
        const ratings = (read('ocenshik.ratings.v2') || []).map((r) => (r && r.author && r.author.id === cur.id ? Object.assign(r, { author: Object.assign({}, r.author, { avatar: still }) }) : r));
        const all = read(ANIM_KEY) || {};
        if (anim) all[cur.id] = { data: anim, sig: sigOf(still) }; else delete all[cur.id];
        try {
          localStorage.setItem('ocenshik.user.v1', JSON.stringify(cur));
          localStorage.setItem('ocenshik.users.v1', JSON.stringify(users));
          localStorage.setItem('ocenshik.ratings.v2', JSON.stringify(ratings));
        } catch (e) { toast('Браузер не дал сохранить аватар: мало места'); return; }
        let animKept = true;
        try { localStorage.setItem(ANIM_KEY, JSON.stringify(all)); } catch (e) { animKept = false; }
        p.avatar = anim && animKept ? anim : still;
        setAvaEl(p.avatar);
        if (token) {
          send('PUT', '/photo/avatar', { data: anim || still })
            .then(() => toast(anim ? 'Анимированный аватар стоит, друзья тоже его увидят' : 'Аватар обновлён, друзья тоже его увидят'), () => toast('Аватар стоит здесь, но в аккаунт не сохранился'));
        } else toast(anim && !animKept ? 'Аватар стоит, но анимация не влезла в браузер' : 'Аватар обновлён');
      } catch (e) {
        toast('Не получилось открыть эту картинку');
      } finally {
        wrap.classList.remove('busy');
      }
    }
  }

  // ---------- история аватарок и баннеров: сервер хранит 8 прошлых, вернуть любую — одно нажатие ----------
  // data URL в Blob без fetch (fetch data: под CSP запрещён)
  function dataToBlob(d) {
    const s = bare(d), comma = s.indexOf(',');
    const type = (s.slice(0, comma).match(/^data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(s.slice(comma + 1));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type });
  }
  let histOpen = null;
  function closeHist() { if (histOpen) { histOpen.remove(); histOpen = null; } }
  document.addEventListener('click', (e) => { if (histOpen && !histOpen.contains(e.target) && !e.target.closest('#avaWrap, #banBtn')) closeHist(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHist(); });
  // меню «Загрузить новую + история» у аватарки; у баннера история встраивается в его меню (histInto)
  function histMenu(anchor, kind, p, act) {
    if (histOpen) { closeHist(); return; }
    const m = document.createElement('div');
    m.className = 'hist-menu';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', 'Аватар');
    m.innerHTML = `<button type="button" class="btn primary" data-h="up">📷 Загрузить новую</button><span class="label">Прошлые аватарки</span><div class="hist-grid hg-ava" data-hist></div>`;
    // меню живёт в body (внутри аватарки на него действовали бы её стили) и стоит под аватаркой; при прокрутке закрывается
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(12, Math.min(r.left, innerWidth - m.offsetWidth - 12)) + 'px';
    m.style.top = Math.min(r.bottom + 10, innerHeight - m.offsetHeight - 12) + 'px';
    histOpen = m;
    addEventListener('scroll', closeHist, { once: true, passive: true });
    m.querySelector('[data-h="up"]').addEventListener('click', (e) => { e.stopPropagation(); closeHist(); act.upload(); });
    histInto(m.querySelector('[data-hist]'), kind, p, (d) => { closeHist(); act.use(d); });
  }
  async function histInto(box, kind, p, use) {
    box.innerHTML = '<p class="hist-empty">Загружаю…</p>';
    let items = [];
    try { items = (await api('/photo-history/' + kind)).items || []; } catch (e) {}
    if (!box.isConnected) return;
    if (!items.length) { box.innerHTML = `<p class="hist-empty">Пока пусто: прошлые ${kind === 'avatar' ? 'аватарки' : 'баннеры'} появятся тут, когда поставишь новые.</p>`; return; }
    box.innerHTML = items.map((x) => `<span class="hist-it" data-id="${esc(x.id)}"><button type="button" class="hist-pic" data-use title="Вернуть (${esc(dayFmt(x.at))})" aria-label="Вернуть картинку от ${esc(dayFmt(x.at))}"></button><button type="button" class="hist-x" data-del aria-label="Удалить из истории" title="Удалить из истории">✕</button></span>`).join('');
    const data = new Map();
    box.querySelectorAll('.hist-it').forEach((it) => {
      api(`/photo/${encodeURIComponent(p.uid)}/${encodeURIComponent(it.dataset.id)}`).then((d) => {
        if (!d.data) { it.remove(); return; }
        data.set(it.dataset.id, d.data);
        const b = it.querySelector('.hist-pic');
        b.style.backgroundImage = `url("${bare(d.data)}")`;
        if (kind === 'banner') { const ps = posOf(d.data); b.style.backgroundPosition = `${ps.x}% ${ps.y}%`; }
      }, () => it.remove());
    });
    // onclick, а не addEventListener: меню баннера открывают много раз, обработчик должен быть один
    box.onclick = async (e) => {
      e.stopPropagation();
      const it = e.target.closest('.hist-it');
      if (!it) return;
      if (e.target.closest('[data-del]')) {
        try { await send('DELETE', '/photo/' + encodeURIComponent(it.dataset.id)); it.classList.add('gone'); setTimeout(() => it.remove(), calm ? 0 : 250); } catch (err) { toast('Не получилось удалить'); }
        return;
      }
      const d = data.get(it.dataset.id);
      if (d) use(d);
    };
  }

  // аватарки друзей: каждый ставит свою в профиле, сервер отдаёт её друзьям
  const friendAva = new Map();
  function hydrateFriendAvatars(p) {
    if (!token || !p.friends) return;
    document.querySelectorAll('.fr .av[data-uid]').forEach((el) => {
      const id = el.dataset.uid;
      if (!friendAva.has(id)) friendAva.set(id, api(`/photo/${encodeURIComponent(id)}/avatar`).then((d) => d.data || null, () => null));
      friendAva.get(id).then((src) => { if (isImgSrc(src) && el.isConnected) { el.style.backgroundImage = `url("${src}")`; el.textContent = ''; } });
    });
  }

  function wireBanner(p) {
    const btn = $('#banBtn'), menu = $('#banMenu'), banner = $('#banner'), msg = $('#banMsg');
    if (!btn) return;
    const say = (t, err) => { msg.textContent = t || ''; msg.classList.toggle('err', !!err); };
    const open = (on) => {
      menu.hidden = !on; btn.setAttribute('aria-expanded', String(on));
      if (on && !$('#banPresets').childElementCount) {
        $('#banPresets').innerHTML = PRESETS.map((pr, k) => `<button type="button" data-k="${k}" title="${esc(pr.name)}" aria-label="Баннер «${esc(pr.name)}»" style="background-image:url('${paint(pr.draw, 300, 100)}')"></button>`).join('');
      }
      if (on) say('');
      // история: при каждом открытии меню свежая (новый баннер только что ушёл в неё)
      if (on && $('#banHist')) histInto($('#banHist'), 'banner', p, (d) => { open(false); apply(d); });
    };
    // выбор видимой части: тянем картинку внутри баннера, «Готово» сохраняет положение
    let posing = null;
    const startPos = async () => {
      if (!p.banner || posing) return;
      open(false);
      const img = new Image();
      // ждём загрузку картинки: decode() в фоновых вкладках может не завершиться
      try { await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = bare(p.banner); if (img.complete && img.naturalWidth) res(); }); } catch (e) { return; }
      if (posing || !p.banner) return;
      const ps = posOf(p.banner);
      posing = { x: ps.x, y: ps.y, iw: img.naturalWidth, ih: img.naturalHeight, drag: null };
      banner.classList.add('posing');
      banner.insertAdjacentHTML('beforeend', '<div class="ban-pos" id="banPosBar"><span>Потяни картинку, чтобы выбрать, что видно</span><button type="button" class="btn small" id="banPosDone">Готово</button></div>');
      $('#banPosDone').addEventListener('click', (e) => { e.stopPropagation(); finishPos(); });
    };
    // выбор видимой части закончен: положение сохраняется вместе с картинкой
    const finishPos = () => {
      if (!posing) return;
      const d = `${bare(p.banner)}#pos=${Math.round(posing.x)},${Math.round(posing.y)}`;
      posing = null;
      banner.classList.remove('posing', 'grabbing');
      const bar = $('#banPosBar'); if (bar) bar.remove();
      apply(d);
    };
    banner.addEventListener('pointerdown', (e) => {
      // кнопка «Баннер» и меню лежат на баннере: их нажатие не таскает картинку
      if (!posing || e.target.closest('#banPosBar, #banBtn, #banMenu')) return;
      posing.drag = { x: e.clientX, y: e.clientY, px: posing.x, py: posing.y };
      try { banner.setPointerCapture(e.pointerId); } catch (_) {}
      banner.classList.add('grabbing');
    });
    banner.addEventListener('pointermove', (e) => {
      if (!posing || !posing.drag) return;
      const bw = banner.clientWidth, bh = banner.clientHeight, k = Math.max(bw / posing.iw, bh / posing.ih);
      const ox = posing.iw * k - bw, oy = posing.ih * k - bh; // насколько картинка шире и выше баннера
      if (ox > 1) posing.x = Math.min(100, Math.max(0, posing.drag.px - (e.clientX - posing.drag.x) / ox * 100));
      if (oy > 1) posing.y = Math.min(100, Math.max(0, posing.drag.py - (e.clientY - posing.drag.y) / oy * 100));
      banner.style.backgroundPosition = `${posing.x}% ${posing.y}%`;
    });
    const dragEnd = () => { if (posing) { posing.drag = null; banner.classList.remove('grabbing'); } };
    banner.addEventListener('pointerup', dragEnd);
    banner.addEventListener('pointercancel', dragEnd);
    const apply = (d, pose) => {
      p.banner = d;
      showBanner(d);
      const kept = keepBanner(d);
      if (!kept && token) say('Баннер большой, поэтому хранится только в аккаунте.');
      if (d && pose) startPos(); // новую картинку сразу можно подвинуть, и без входа тоже
      if (!token) { say(kept ? (d ? 'Баннер стоит. Войди в аккаунт, чтобы его видели друзья.' : 'Баннер убран.') : 'Браузер не дал сохранить баннер: мало места.', !kept); return; }
      banner.classList.add('busy');
      (d ? send('PUT', '/photo/banner', { data: d }) : send('DELETE', '/photo/banner'))
        .then(() => say(d ? 'Готово, друзья тоже увидят этот баннер.' : 'Баннер убран.'), () => say('Баннер стоит здесь, но в аккаунт не сохранился. Попробуй ещё раз позже.', true))
        .finally(() => banner.classList.remove('busy'));
    };
    const fromFile = async (f) => {
      if (!f || !/^image\//.test(f.type)) { say('Нужна картинка: JPG, PNG, WebP или GIF.', true); return; }
      // GIF и WebP могут быть анимированными: их не перерисовываем, а ставим как есть, чтобы анимация осталась
      if (/^image\/(gif|webp)$/.test(f.type)) {
        if (f.size <= ANIM_MAX) { apply(await asDataUrl(f), true); return; }
        if (f.type === 'image/gif') { say(`Анимированный баннер должен весить до ${ANIM_MAX_MB} МБ, этот ${(f.size / 1048576).toFixed(1)} МБ. Сожми GIF или возьми WebP.`, true); return; }
      }
      try {
        const bmp = await createImageBitmap(f);
        apply(fitImage(bmp, 1600, 640, 'image/jpeg'), true);
        if (bmp.close) bmp.close();
      } catch (e) { say('Не получилось открыть эту картинку.', true); }
    };
    // «Баннер» работает и во время выбора видимой части: положение сохраняется, меню открывается — можно сразу сменить картинку
    btn.addEventListener('click', () => { if (posing) { finishPos(); open(true); return; } open(menu.hidden); });
    $('#banFile').addEventListener('change', (e) => { fromFile(e.target.files && e.target.files[0]); e.target.value = ''; });
    $('#banPresets').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) apply(paint(PRESETS[+b.dataset.k].draw), true); });
    $('#banPos').addEventListener('click', () => startPos());
    $('#banRemove').addEventListener('click', () => apply(null));
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); } });
    banner.addEventListener('dragover', (e) => { e.preventDefault(); banner.classList.add('drag'); });
    banner.addEventListener('dragleave', () => banner.classList.remove('drag'));
    banner.addEventListener('drop', (e) => { e.preventDefault(); banner.classList.remove('drag'); open(true); fromFile(e.dataTransfer.files && e.dataTransfer.files[0]); });
  }

  function wireProfileName(p) {
    const form = $('#nameEditForm'), name = $('#profileName');
    if (form) {
      const input = $('#profileNameInput');
      const cancel = $('#profileNameCancel');
      const save = async () => {
        const value = input.value.trim();
        if (!value || value.length < 2 || value.length > 24) { toast('Ник должен быть от 2 до 24 символов'); input.focus(); return; }
        const sb = form.querySelector('[type="submit"]'); if (sb.disabled) return; sb.disabled = true; // двойное нажатие не отправляет ник дважды
        try {
          if (token) {
            const d = await send('PUT', '/account', { username: value });
            if (d.user && user) user.name = d.user.username || value;
          } else if (user) {
            user.name = value;
          }
          if (user) {
            const users = (read('ocenshik.users.v1') || []).map((u) => u.id === user.id ? { ...u, name: value } : u);
            localStorage.setItem('ocenshik.user.v1', JSON.stringify(user));
            localStorage.setItem('ocenshik.users.v1', JSON.stringify(users));
          }
          p.name = value;
          p.editingName = false;
          render(p);
          toast('Ник обновлён');
        } catch (e) {
          toast(e && e.error ? e.error : 'Не получилось сохранить ник');
          sb.disabled = false;
          input.focus();
        }
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      cancel.addEventListener('click', () => { p.editingName = false; render(p); });
      input.focus({ preventScroll: true });
      input.select();
      return;
    }
    const edit = $('#profileEditBtn');
    const start = () => { p.editingName = true; render(p); };
    if (edit) edit.addEventListener('click', start);
    if (name) {
      name.addEventListener('click', start);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
    }
  }

  function message(title, text, actions) {
    app.innerHTML = `<section class="card state rise"><h1 class="h2">${esc(title)}</h1><p class="muted">${text}</p><div class="hero-acts">${actions || ''}</div></section>`;
  }

  // ---------- свой профиль ----------
  async function showMe(meServer) {
    const local = (read('ocenshik.users.v1') || []).find((u) => user && u.id === user.id) || user || {};
    // дата регистрации и ник — из аккаунта, если он есть: так они одинаковые на всех устройствах
    const born = (meServer && meServer.createdAt) || local.createdAt;
    const since = born ? dayFmt(born) : '';
    const p = {
      kind: 'me', name: meServer && meServer.username ? meServer.username : user ? user.name : 'Гость', avatar: shownAvatar(user), color: user && user.color,
      sub: user ? [meServer && meServer.handle ? '@' + meServer.handle : '', since ? 'в Казуал Хабе с ' + since : ''].filter(Boolean).join(' · ') || 'твой профиль' : 'Гостевой профиль: оценки хранятся в этом браузере',
      createdAt: user ? born : null,
      ratings: [], allRatings: myRatings(), hide: localHide().hide, uid: meServer && meServer.id, banner: localBanner(), sticker: localSticker().src, layout: localLayout(),
    };
    p.ratings = visibleOf(p.allRatings, p.hide);
    if (!user) p.friendsHint = 'Друзья появятся, когда войдёшь в аккаунт. Это можно сделать в Мнении Казуала.';
    else if (!token) p.friendsHint = 'Аккаунт ещё не подключён к друзьям. Подключить можно в Мнении, кнопка «Друзья».';
    render(p);
    if (!token) return;
    if (meServer) {
      // оценки из аккаунта: здесь могут быть не все (например, музыку оценили на другом устройстве, а Мнение здесь не открывали)
      api(`/shelf/${encodeURIComponent(meServer.id)}`).then((s) => {
        let changed = false;
        const have = new Set(p.allRatings.map((r) => r.id));
        for (const r of s.ratings || []) {
          if (!r || r.example || have.has(r.id)) continue;
          p.allRatings.push(norm(r));
          changed = true;
        }
        const sh = s.profile, lh = localHide();
        if (sh && +sh.at > (+lh.at || 0)) { p.hide = sh.hide; keepHide({ hide: sh.hide, at: +sh.at }); changed = true; }
        else if (lh.at && (!sh || +lh.at > +sh.at)) send('PUT', '/shelf', { ratings: [], profile: lh }).catch(() => {}); // выбор сделан здесь до входа
        // стикер: более свежий выбор побеждает — с другого устройства берём, свой отправляем
        const ss = s.sticker, ls = localSticker();
        if (ss && +ss.at > (+ls.at || 0)) { if (ss.src !== p.sticker) { p.sticker = ss.src; changed = true; } keepSticker(ss); }
        else if (ls.at && (!ss || +ls.at > +ss.at)) send('PUT', '/shelf', { ratings: [], sticker: ls }).catch(() => {});
        // витрины и блоки: тоже побеждает более свежий выбор
        const sl = s.layout, ll = localLayout();
        if (sl && +sl.at > ((ll && +ll.at) || 0)) { p.layout = sl; keepLayout(sl); changed = true; }
        else if (ll && ll.at && (!sl || +ll.at > +sl.at)) send('PUT', '/shelf', { ratings: [], layout: ll }).catch(() => {});
        if (!changed) return;
        p.ratings = visibleOf(p.allRatings, p.hide);
        render(p);
      }, () => {});
      // аватар общий для аккаунта: в аккаунте другой — берём его (его сменили на другом устройстве),
      // в аккаунте пусто — отправляем тот, что здесь
      if (window.CasualAvatar) window.CasualAvatar.sync(meServer.id, token).then((ch) => {
        if (!ch || !user) return;
        user.avatar = ch.still;
        p.avatar = shownAvatar(user);
        setAvaEl(p.avatar);
      });
      api(`/photo/${encodeURIComponent(meServer.id)}/banner`).then(
        (d) => { if (d.data && d.data !== p.banner) { p.banner = d.data; keepBanner(d.data); showBanner(d.data); } },
        () => { if (p.banner) send('PUT', '/photo/banner', { data: p.banner }).catch(() => {}); } // в аккаунте ещё нет: отправляем свой
      );
    }
    try {
      const fr = await api('/friends');
      p.friends = fr.friends || [];
      p.incoming = (fr.incoming || []).length;
      render(p);
    } catch (e) {
      p.friendsHint = 'Сервер друзей сейчас не отвечает. Список друзей появится позже.';
      render(p);
    }
  }

  // ---------- подписка на оценки друга: новые оценки появятся в Журнале Мнения с кружком ----------
  async function toggleFollow(p, btn) {
    btn.disabled = true;
    try {
      const cur = (await api('/follow')).ids || [];
      const on = !cur.includes(p.uid);
      const ids = on ? cur.concat(p.uid) : cur.filter((x) => x !== p.uid);
      await send('PUT', '/follow', { ids, at: Date.now() });
      if (on) { // уже стоящие оценки новыми не считаем
        try { const all = read('casualhub.followSeen.v1') || {}; all[p.uid] = Date.now(); localStorage.setItem('casualhub.followSeen.v1', JSON.stringify(all)); } catch (e) {}
      }
      p.followed = on;
      btn.outerHTML = bellHTML(on);
      const nb = $('#followBtn');
      if (nb) {
        nb.addEventListener('click', () => toggleFollow(p, nb));
        if (on && !calm) nb.classList.add('ring'); // колокольчик качается, как на YouTube
        toast(on ? '🔔 Подписка есть: новые оценки друга появятся в Журнале Мнения' : 'Подписка отменена');
      }
      return;
    } catch (e) {
      toast('Не получилось, попробуй ещё раз');
    }
    btn.disabled = false;
  }
  // колокольчик подписки рядом с ником друга: пустой — не подписан, залитый — подписан
  function bellHTML(on) {
    return `<button type="button" class="bell${on ? ' on' : ''}" id="followBtn" aria-pressed="${!!on}" title="${on ? 'Ты подписан. Нажми, чтобы отписаться' : 'Подписаться: новые оценки друга будут видны в Журнале Мнения'}" aria-label="${on ? 'Отписаться от оценок' : 'Подписаться на оценки'}">${on ? ICON_BELL_ON : ICON_BELL}</button>`;
  }

  // ---------- профиль друга ----------
  async function showFriend(id) {
    if (!token) {
      message('Профиль друга', 'Профили друзей видны после входа в аккаунт, подключённый к друзьям.', '<a class="btn primary" href="/mnenie/#login">Войти</a><a class="btn ghost" href="/profile/">Мой профиль</a>');
      return;
    }
    app.innerHTML = '<section class="card state"><p class="muted">Загружаю профиль…</p></section>';
    try {
      // друзья друга видны, если он не скрыл блок «Друзья»
      const [s, fol, fr] = await Promise.all([api(`/shelf/${encodeURIComponent(id)}`), api('/follow').catch(() => ({ ids: [] })), api(`/friends/of/${encodeURIComponent(id)}`).catch(() => null)]);
      const ratings = visibleOf((s.ratings || []).filter((r) => r && !r.example).map(norm), s.profile && s.profile.hide);
      const mine = new Map(myRatings().filter((r) => r.total != null).map((r) => [keyOf(r.name), r]));
      const common = ratings.filter((r) => r.total != null && mine.has(keyOf(r.name))).map((r) => {
        const m = mine.get(keyOf(r.name));
        return { name: r.name, mine: m.total, theirs: r.total, diff: Math.round((r.total - m.total) * 10) / 10 };
      }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      const match = common.length ? Math.max(0, Math.min(100, Math.round(100 - (common.reduce((a, c) => a + Math.abs(c.diff), 0) / common.length) * 10))) : 0;
      render({
        kind: 'friend', name: s.user.username, sub: [s.user.handle ? '@' + s.user.handle : '', s.updatedAt ? 'оценки обновлены ' + ago(s.updatedAt) : 'оценок пока нет'].filter(Boolean).join(' · '),
        ratings, uid: s.user.id, common, match, layout: s.layout || null, followed: (fol.ids || []).includes(s.user.id),
        friends: fr && !fr.hidden ? fr.friends || [] : null, createdAt: s.user.createdAt, lastSeen: s.user.lastSeen, sticker: s.sticker && s.sticker.src, friendCount: s.user.friends != null ? s.user.friends : null,
      });
      document.title = `${s.user.username} · Казуал Хаб`;
      api(`/photo/${encodeURIComponent(s.user.id)}/banner`).then((d) => { if (d.data) showBanner(d.data); }, () => {});
      api(`/photo/${encodeURIComponent(s.user.id)}/avatar`).then((d) => { if (d.data) setAvaEl(d.data); }, () => {});
    } catch (e) {
      message('Профиль закрыт', esc(e && e.error ? e.error : 'Не получилось загрузить профиль. Профили видны только друзьям.'), '<a class="btn primary" href="/profile/">Мой профиль</a>');
    }
  }

  (async () => {
    let meServer = null;
    if (token) { try { meServer = (await api('/me')).user; } catch (e) {} }
    if (wantId && !(meServer && meServer.id === wantId)) showFriend(wantId);
    else showMe(meServer);
  })();

  // ---------- темы: те же, что на других страницах ----------
  const THEMES = window.CasualThemes.list; // общий список тем: /themes.js
  const PALETTE = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/></svg>';
  const PREFS_KEY = 'ocenshik.prefs.v1';
  let theme = (read(PREFS_KEY) || {}).theme;
  if (!THEMES.some((t) => t.id === theme)) theme = 'auto';
  function applyTheme(id, save) {
    const th = THEMES.find((t) => t.id === id) || THEMES[0];
    theme = th.id;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme);
    $('#themeBtn').innerHTML = `${PALETTE}<span class="t">Тема: ${th.name}</span>`;
    $('#themeBtn').setAttribute('aria-label', `Тема: ${th.name}`);
    $('#themeMenu').classList.add('tm-grid');
    $('#themeMenu').innerHTML = window.CasualThemes.menuHTML(theme);
    if (save) { try { let p = read(PREFS_KEY); if (!p || typeof p !== 'object' || Array.isArray(p)) p = {}; p.theme = theme; localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }
  }
  applyTheme(theme, false);
  const pick = $('#themePick');
  // меню тем не уходит за край экрана, где бы ни оказалась кнопка
  pick.addEventListener('toggle', () => {
    const menu = document.getElementById('themeMenu');
    if (!pick.open || !menu) return;
    menu.style.translate = '';
    const box = menu.offsetParent ? menu.offsetParent.getBoundingClientRect() : { left: 0 };
    const left = box.left + menu.offsetLeft, right = left + menu.offsetWidth;
    const shift = left < 8 ? 8 - left : right > innerWidth - 8 ? innerWidth - 8 - right : 0;
    if (shift) menu.style.translate = `${Math.round(shift)}px 0`;
  });
  $('#themeMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    let done = false;
    const go = () => { if (!done) { done = true; applyTheme(b.dataset.themeId, true); } };
    if (document.startViewTransition && !calm) {
      const r = b.getBoundingClientRect();
      document.documentElement.style.setProperty('--tx', `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty('--ty', `${r.top + r.height / 2}px`);
      document.documentElement.classList.add('theme-swap');
      const t = document.startViewTransition(go);
      t.ready.catch(() => {});
      if (t.updateCallbackDone) t.updateCallbackDone.catch(() => {});
      t.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('theme-swap'));
      setTimeout(go, 400);
    } else go();
    pick.open = false;
    $('#themeBtn').focus();
  });
  document.addEventListener('click', (e) => { if (pick.open && !pick.contains(e.target)) pick.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pick.open) { pick.open = false; $('#themeBtn').focus(); } });
})();
