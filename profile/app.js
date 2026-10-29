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
  // значки шапки профиля: редактирование профиля, колокольчик подписки
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
  // своё фото из IndexedDB (photo-store.js): в оценке лежит только ссылка ph_…
  const idbPhoto = (r) => (r.photo && window.CasualPhotos && window.CasualPhotos.isKey(r.photo.ref) ? window.CasualPhotos.get(r.photo.ref).then((d) => (typeof d === 'string' ? d : null)) : null);
  const photoOf = (p, r) => {
    if (!r.photo) return Promise.resolve(null);
    if (r.photo.data && /^data:image\//.test(r.photo.data)) return Promise.resolve(r.photo.data);
    const own = idbPhoto(r);
    if (own) return own.then((d) => d || serverThumb(p, r));
    // фото-ссылка (например, постер из IMDb после импорта из Letterboxd) показывается как есть
    const link = r.photo.url || (typeof r.photo.id === 'string' && /^https:\/\//.test(r.photo.id) ? r.photo.id : '');
    if (link) return Promise.resolve(link);
    return serverThumb(p, r);
  };
  const serverThumb = (p, r) => {
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

  // ---------- ачивки: стаж аккаунта, число оценок и особые ----------
  const AGE_BADGES = [
    { days: 7, id: 'age7', t: 'Неделя в клубе', need: 'неделя' },
    { days: 30, id: 'age30', t: 'Месяц в клубе', need: 'месяц' },
    { days: 91, id: 'age91', t: 'Три месяца', need: '3 месяца' },
    { days: 182, id: 'age182', t: 'Полгода', need: 'полгода' },
    { days: 365, id: 'age365', t: 'Год в клубе', need: 'год' },
    { days: 730, id: 'age730', t: 'Два года', need: '2 года' },
    { days: 1095, id: 'age1095', t: 'Три года', need: '3 года' },
  ];
  const COUNT_BADGES = [[1, 'cnt1', 'Первая оценка'], [10, 'cnt10', '10 оценок'], [50, 'cnt50', '50 оценок'], [100, 'cnt100', '100 оценок'], [250, 'cnt250', '250 оценок']];
  // эмблемы ачивок: цвета градиента и рисунок на сетке 24×24 (белая линия 2px); у семейства один цвет
  const ACH = {
    age7: ['#34D399', '#0F9F8C', '<path d="M12 20.5v-8"/><path d="M12 12.5c0-4.2 2.9-6.6 7-6.6 0 4.2-2.9 6.6-7 6.6z"/><path d="M12 14.5c0-3.3-2.4-5.5-6-5.5 0 3.3 2.4 5.5 6 5.5z"/>'],
    age30: ['#34D399', '#0F9F8C', '<path d="M18.5 14.6A7.5 7.5 0 1 1 9.4 4.5a6 6 0 0 0 9.1 10.1z"/>'],
    age91: ['#34D399', '#0F9F8C', '<path d="M5 19c0-8.3 5.2-14 14-14 0 8.8-5.7 14-14 14z"/><path d="M5 19l8.5-8.5"/>'],
    age182: ['#34D399', '#0F9F8C', '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor"/>'],
    age365: ['#34D399', '#0F9F8C', '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5A2.5 2.5 0 0 0 8 9.6M16 6h2.5A2.5 2.5 0 0 1 16 9.6"/><path d="M12 13v4M8.5 20h7M10 17h4"/>'],
    age730: ['#34D399', '#0F9F8C', '<path d="M4.5 16.5L3.5 8l4.8 3.6L12 5l3.7 6.6L20.5 8l-1 8.5z"/><path d="M5 20h14"/>'],
    age1095: ['#34D399', '#0F9F8C', '<path d="M7.5 4.5h9l4 4.5L12 20 3.5 9z"/><path d="M3.5 9h17M12 20L9.2 9l1.8-4.5M12 20l2.8-11L13 4.5"/>'],
    cnt1: ['#60A5FA', '#4F46E5', '<rect x="5.5" y="3.5" width="13" height="17" rx="2.5"/><path d="M9 12.3l2.2 2.2 4-4.6"/>'],
    cnt10: ['#60A5FA', '#4F46E5', '<rect x="8" y="3.5" width="11.5" height="14" rx="2.3"/><path d="M5 7.5v10.2A2.8 2.8 0 0 0 7.8 20.5h8"/><path d="M11 8.5h5.5M11 12h4"/>'],
    cnt50: ['#60A5FA', '#4F46E5', '<rect x="4" y="5" width="4" height="15" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><path d="M15.6 6.2l3.6-1 3.4 14-3.6 1z"/>'],
    cnt100: ['#60A5FA', '#4F46E5', '<path d="M3.5 9L12 4.5 20.5 9z"/><path d="M6.5 11v6M10.2 11v6M13.8 11v6M17.5 11v6M4 20h16"/>'],
    cnt250: ['#60A5FA', '#4F46E5', '<path d="M3 20l6.5-10 3.4 5 2.6-3.6L21 20z"/><path d="M15.5 11.4V3.5l4 1.9-4 1.9"/>'],
    ruthless: ['#F87171', '#C81E1E', '<path d="M7 13.5V4.5H4.5v9z"/><path d="M7 13.5l3.6 6.5c1.4 0 2.3-1.1 2-2.4l-.7-3.6h5.3a2 2 0 0 0 2-2.4l-1.3-6A2 2 0 0 0 15.9 4.5H7"/>'],
    generous: ['#FCD34D', '#E8890B', '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>'],
    erudite: ['#C084FC', '#7C3AED', '<circle cx="12" cy="12" r="8.2"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" fill="currentColor"/>'],
    writer: ['#5EEAD4', '#0D9488', '<path d="M4.5 19.5l2.6-7.6L15 4l5 5-7.9 7.9z"/><path d="M4.5 19.5l5.2-5.2"/><circle cx="11.2" cy="12.8" r="1.5"/>'],
    photo: ['#F9A8D4', '#DB2777', '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.6-2.5h6.4L16.8 7H19a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="13.3" r="3.6"/>'],
    collector: ['#FDE68A', '#D97706', '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>'],
    owl: ['#818CF8', '#3730A3', '<path d="M5.5 4.5L8 7.2A6 6 0 0 1 16 7.2l2.5-2.7V14a6.5 6.5 0 0 1-13 0z"/><circle cx="9.4" cy="11.3" r="2"/><circle cx="14.6" cy="11.3" r="2"/><path d="M11.2 14.6l.8 1.4.8-1.4z"/>'],
    marathon: ['#FDBA74', '#EA580C', '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.6 3-5.6 3.6-9.2 2.6 1.5 4.4 4 4.4 6.6 1-.8 1.5-2 1.6-3.1 1.8 1.6 3.4 3.7 3.4 5.7 0 3.4-2.6 6-6.5 6z"/>'],
    social: ['#A78BFA', '#6D28D9', '<circle cx="9" cy="8.2" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.6 5.2a3.2 3.2 0 0 1 0 6M17 13.6a5.5 5.5 0 0 1 3.5 5.9"/>'],
    pioneer: ['#67E8F9', '#0284C7', '<path d="M12 3c3 2 4.5 5.5 4.5 9.5L14.6 16H9.4l-1.9-3.5C7.5 8.5 9 5 12 3z"/><circle cx="12" cy="9.6" r="1.6"/><path d="M7.6 12.4L5 15v3.2l4.2-2.2M16.4 12.4L19 15v3.2l-4.2-2.2M10.6 18.5L12 21l1.4-2.5"/>'],
  };
  const achIcon = (id) => `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${(ACH[id] || ACH.cnt1)[2]}</svg></span>`;
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
  // одиночная ачивка с прогрессом (сколько из скольких)
  const goal = (id, t, have, need, hint, word) => ({ id, t, hint, got: have >= need, next: have < need && have > 0, pct: Math.min(100, (have / need) * 100),
    sub: have >= need ? hint : `${have} из ${need} ${word}` });
  const flag = (id, t, got, hint, todo) => ({ id, t, hint, got, sub: got ? hint : todo });
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
    out.push(...series(COUNT_BADGES.map(([k, id, t]) => ({ goal: k, id, t, hint: k === 1 ? 'первая оценка' : k + ' оценок' })), n,
      (b, got, next) => (got ? 'есть' : next ? `ещё ${b.goal - n} ${plural(b.goal - n, 'оценка', 'оценки', 'оценок')}` : 'нужно ' + b.goal)));
    const rated = rs.filter((r) => r.total != null);
    out.push(flag('ruthless', 'Безжалостный', rated.some((r) => r.total < 2.5), 'есть оценка 1 или 2', 'поставь 1 или 2'));
    out.push(flag('generous', 'Щедрый', rated.some((r) => r.total >= 9.95), 'есть оценка 10', 'поставь 10'));
    out.push(goal('erudite', 'Эрудит', new Set(rs.map((r) => keyOf(r.cat))).size, 5, 'оценки в 5 категориях', 'категорий'));
    out.push(goal('writer', 'Писатель', rs.filter((r) => r.note).length, 10, '10 оценок с заметками', 'с заметками'));
    out.push(goal('photo', 'Фотограф', rs.filter((r) => r.photo).length, 10, '10 оценок с фото', 'с фото'));
    out.push(goal('collector', 'Коллекционер', rs.filter((r) => r.fav).length, 10, '10 оценок в избранном', 'в избранном'));
    out.push(flag('owl', 'Ночная сова', rs.some((r) => r.created && new Date(r.created).getHours() < 5), 'оценка между 0:00 и 5:00', 'оцени что-нибудь ночью, с 0 до 5'));
    out.push(goal('marathon', 'Марафонец', bestStreak(rs.map((r) => r.created)), 7, 'оценки 7 дней подряд', 'дней подряд'));
    if (p.friendCount != null) out.push(goal('social', 'Душа компании', p.friendCount, 5, '5 друзей', 'друзей'));
    // успеть можно было только до декабря 2026: позже ачивка не показывается
    if (t0 && t0 < PIONEER_BEFORE) out.push(flag('pioneer', 'Перво­проходец', true, 'в клубе с первых недель', ''));
    // полученные сначала, из остальных выше те, до которых ближе
    return out.filter((b) => b.got).concat(out.filter((b) => !b.got).sort((a, b) => (b.pct || 0) - (a.pct || 0)));
  }
  // карточка ачивки: эмблема, у неполученной — полоса с процентами, у полученной — галочка
  const badgesHTML = (list) => `<div class="bdg">${list.map((b, k) => {
    const a = ACH[b.id] || ACH.cnt1;
    const pct = Math.max(0, Math.min(99, Math.floor(b.pct || 0)));
    return `<div style="--k:${Math.min(k, 14)};--c1:${a[0]};--c2:${a[1]}" class="bdg-i${b.got ? ' got' : ' off'}${b.next ? ' next' : ''}" title="${esc(b.t)}: ${esc(b.hint)}">${achIcon(b.id)}<span><b>${esc(b.t)}</b><small>${esc(b.sub)}</small>${!b.got && b.pct != null ? `<span class="pg" role="img" aria-label="Готово на ${pct}%"><span class="tr"><i style="width:${pct}%"></i></span><em>${pct}%</em></span>` : ''}</span>${b.got ? '<span class="ok" aria-label="Получено">✓</span>' : ''}</div>`;
  }).join('')}</div>`;

  // ---------- звания: открываются за оценки и ачивки; какие показывать под ником, выбирает хозяин ----------
  const TITLE_MAX = 4;
  function titleCatalog(p, rs) {
    const rated = rs.filter((r) => r.total != null);
    const n = rated.length;
    const avg = n ? rated.reduce((a, r) => a + r.total, 0) / n : null;
    const out = [];
    const add = (id, t, tier, got, need) => out.push({ id, t, tier, got: !!got, need });
    if (p.isAdmin) add('admin', 'Администратор', 'admin', true, ''); // всегда первое, его не убрать и не передвинуть
    add('n0', 'Новичок', 'none', true, '');
    [[1, 'Осматривается', 'none'], [5, 'Ценитель', 'mid'], [20, 'Критик', 'good'], [50, 'Легенда оценок', 'good'], [100, 'Архивариус', 'good']]
      .forEach(([k, t, tier]) => add('n' + k, t, tier, n >= k, k === 1 ? 'первая оценка с баллом' : `${k} оценок с баллом`));
    add('avg-gen', 'Щедрая душа', 'good', avg != null && avg >= 8.5, 'средний балл 8,5 и выше');
    add('avg-kind', 'Добрый критик', 'good', avg != null && avg >= 7.5 && avg < 8.5, 'средний балл от 7,5 до 8,4');
    add('avg-bal', 'Взвешенный взгляд', 'mid', avg != null && avg >= 5.5 && avg < 7.5, 'средний балл от 5,5 до 7,4');
    add('avg-strict', 'Строгий судья', 'bad', avg != null && avg < 5.5, 'средний балл ниже 5,5');
    const cats = new Map(); rated.forEach((r) => cats.set(r.cat, (cats.get(r.cat) || 0) + 1));
    const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
    add('top', top && n >= 3 ? `Больше всего: ${top[0]}` : 'Больше всего: …', 'none', top && n >= 3, '3 оценки с баллом');
    const masters = rated.filter((r) => r.total >= 9.5).length;
    add('masters', masters >= 3 ? `Нашёл ${masters} ${plural(masters, 'шедевр', 'шедевра', 'шедевров')}` : 'Охотник за шедеврами', 'good', masters >= 3, '3 оценки 9,5 и выше');
    // каждая полученная ачивка — ещё одно звание
    (p.badges || []).forEach((b) => add('b:' + b.id, b.t.replace(/\u00ad/g, ''), 'good', b.got, b.hint));
    return out;
  }
  // если хозяин ничего не выбирал — как раньше: звание за число оценок, за средний балл, любимая тема и шедевры
  // звание «Администратор» сюда не входит: оно показывается отдельно и всегда первым
  function titlesShown(p, cat) {
    const got = (id) => id !== 'admin' && cat.find((t) => t.id === id && t.got);
    const sel = p.layout && Array.isArray(p.layout.titles) ? p.layout.titles : null;
    if (sel) return sel.map(got).filter(Boolean);
    return [['n100', 'n50', 'n20', 'n5', 'n1', 'n0'].map(got).find(Boolean), ...['avg-gen', 'avg-kind', 'avg-bal', 'avg-strict', 'top', 'masters'].map(got)].filter(Boolean);
  }
  const adminChip = (p) => (p.isAdmin ? '<span class="title-chip t-admin" data-tier="admin" title="Админ Казуал Хаба"><i></i>Администратор</span>' : '');
  function titlePopHTML(cat, shown) {
    const sel = shown.map((t) => t.id);
    const locked = cat.filter((t) => !t.got && t.need);
    return `<div class="t-pop-h"><b>Звания</b><small>выбрано ${sel.length} из ${TITLE_MAX}</small></div>
      <div class="t-list">${cat.filter((t) => t.got && t.id !== 'admin').map((t) => `<button type="button" class="t-opt" data-tadd="${esc(t.id)}" aria-pressed="${sel.includes(t.id)}" data-tier="${t.tier}"><i></i><span>${esc(t.t)}</span>${sel.includes(t.id) ? '<em>✓</em>' : ''}</button>`).join('')}</div>
      ${locked.length ? `<span class="label">Ещё не открыты</span><div class="t-list">${locked.map((t) => `<span class="t-opt off" data-tier="${t.tier}"><i></i><span>${esc(t.t)}<small>${esc(t.need)}</small></span></span>`).join('')}</div>` : ''}`;
  }
  function titlesRowHTML(p, rs) {
    const cat = titleCatalog(p, rs), shown = titlesShown(p, cat);
    const chip = (t) => (EDIT
      ? `<span class="title-chip" data-tier="${t.tier}" data-tid="${esc(t.id)}" tabindex="0" title="Перетащи, чтобы поменять порядок (или стрелками)"><i></i>${esc(t.t)}<button type="button" class="t-x" data-tx="${esc(t.id)}" aria-label="Убрать звание «${esc(t.t)}»" title="Убрать">✕</button></span>`
      : `<span class="title-chip" data-tier="${t.tier}"><i></i>${esc(t.t)}</span>`);
    if (!EDIT) return `<div class="titles"${hid(p, 'titles')}>${adminChip(p)}${shown.map(chip).join('')}</div>`;
    const on = secOn(p, 'titles');
    return `<div class="t-wrap"><div class="titles edit${on ? '' : ' off'}" id="titlesRow">${adminChip(p)}${shown.map(chip).join('')}<button type="button" class="title-add" id="titleAdd" aria-expanded="${tpOpen}" aria-controls="titlePop">＋ Звание</button><button type="button" class="title-eye" id="titleEye" aria-pressed="${!on}" title="${on ? 'Скрыть звания' : 'Показать звания'}" aria-label="${on ? 'Скрыть звания' : 'Показать звания'}">${on ? WIC.eye : WIC.eyeOff}</button></div>
      <div class="t-pop" id="titlePop"${tpOpen ? '' : ' hidden'}>${titlePopHTML(cat, shown)}</div></div>`;
  }

  // ---------- цифры в профиле: кубики выбирает хозяин (в режиме редактирования: ✕ убрать, ＋ добавить, перетащить) ----------
  const STAT_MAX = 12;
  const STAT_DEF = ['count', 'avg', 'masters', 'cats', 'friends'];
  // вид категории по названию: для цифр «фильмы и сериалы · просмотрено», «игры · пройдено» и т. п.
  const KINDS = [['movie', /фильм|сериал|кино|мульт|film|movie|series/, 'фильмы и сериалы'], ['anime', /аниме|манг|anime|manga/, 'аниме'], ['game', /игр|game/, 'игры'], ['book', /книг|литератур|book/, 'книги']];
  const kindOf = (cat) => { const k = keyOf(cat); const f = KINDS.find(([, re]) => re.test(k)); return f ? f[0] : ''; };
  const ST_RE = { done: /Завершено|Просмотрено/, doing: /В процессе/, plan: /В планах/, drop: /Брошено/ };
  const DONE_WORD = { movie: 'просмотрено', anime: 'просмотрено', game: 'пройдено', book: 'прочитано' };
  const stWord = (kind, s) => (s === 'done' ? DONE_WORD[kind] || 'завершено' : { doing: 'в процессе', plan: 'в планах', drop: 'брошено' }[s]);
  // id цифры по категории — короткий отпечаток названия (в названии бывают любые символы)
  const catHash = (s) => { let h = 0x811c9dc5; for (const ch of keyOf(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
  // все цифры, которые можно поставить в профиль: { group, id, value, label, tier?, jump?, count? }
  function statCatalog(p) {
    const rs = p.ratings, rated = rs.filter((r) => r.total != null), out = [], now = Date.now();
    const add = (group, id, value, label, extra) => out.push(Object.assign({ group, id, value, label }, extra));
    const avgOf = (list) => { const x = list.filter((r) => r.total != null); return x.length ? x.reduce((a, r) => a + r.total, 0) / x.length : null; };
    const num = (group, id, v, label, extra) => add(group, id, v, label, Object.assign({ count: true }, extra));
    // категории — по ключу названия (как везде в профиле: «Игры» и «Игры (прежние критерии)» — одна)
    const cats = [...new Map(rs.map((r) => [keyOf(r.cat), r.cat])).values()], avg = avgOf(rs);
    const masters = rated.filter((r) => r.total >= 8.5).length;
    num('Основное', 'count', rs.length, plural(rs.length, 'оценка', 'оценки', 'оценок'), { jump: 'allSec' });
    add('Основное', 'avg', avg != null ? fmt(avg) : '—', 'средний балл', { tier: tierT(avg) });
    num('Основное', 'masters', masters, plural(masters, 'шедевр', 'шедевра', 'шедевров') + ' 8,5+', { jump: 'best' });
    num('Основное', 'cats', cats.length, plural(cats.length, 'категория', 'категории', 'категорий'), { jump: 'catsSec' });
    if (p.common) num('Основное', 'common', p.common.length, plural(p.common.length, 'общая оценка', 'общие оценки', 'общих оценок'), { jump: 'taste' });
    else if (p.friends) num('Основное', 'friends', p.friends.length, plural(p.friends.length, 'друг', 'друга', 'друзей'), { jump: 'friendsSec' });
    else add('Основное', 'friends', '—', 'друзья', { jump: 'friendsSec' });
    const best = rated.length ? Math.max(...rated.map((r) => r.total)) : null;
    add('Основное', 'best', best != null ? fmt(best) : '—', 'лучший балл', { tier: tierT(best) });
    const cnt = (f) => rs.filter(f).length;
    const ten = rated.filter((r) => r.total >= 9.95).length, low = rated.filter((r) => r.total < 5).length;
    num('Основное', 'ten', ten, plural(ten, 'оценка «10»', 'оценки «10»', 'оценок «10»'));
    num('Основное', 'low', low, plural(low, 'оценка ниже 5', 'оценки ниже 5', 'оценок ниже 5'));
    num('Основное', 'fav', cnt((r) => r.fav), 'в избранном');
    num('Основное', 'notes', cnt((r) => r.text || r.pros || r.cons), 'с заметками');
    num('Основное', 'photos', cnt((r) => r.photo), 'с фото');
    num('Основное', 'lb', cnt((r) => r.lb), 'из Letterboxd');
    const genres = new Set(rs.flatMap((r) => r.genres)).size;
    num('Основное', 'genres', genres, plural(genres, 'жанр', 'жанра', 'жанров'));
    const week = cnt((r) => r.created && now - r.created < 7 * 864e5), month = cnt((r) => r.created && now - r.created < 30 * 864e5);
    num('Основное', 'week', week, plural(week, 'оценка', 'оценки', 'оценок') + ' за неделю');
    num('Основное', 'month', month, plural(month, 'оценка', 'оценки', 'оценок') + ' за месяц');
    const streak = bestStreak(rs.map((r) => r.created));
    num('Основное', 'streak', streak, plural(streak, 'день', 'дня', 'дней') + ' подряд — рекорд');
    if (p.badges) { const got = p.badges.filter((b) => b.got).length; num('Основное', 'ach', got, `${plural(got, 'ачивка', 'ачивки', 'ачивок')} из ${p.badges.length}`, { jump: 'badgesSec' }); }
    if (p.createdAt) { const days = Math.max(0, Math.floor((now - +new Date(p.createdAt)) / 864e5)); num('Основное', 'days', days, plural(days, 'день', 'дня', 'дней') + ' в клубе'); }
    for (const s of ['done', 'doing', 'plan', 'drop']) num('Статусы', 's:' + s, cnt((r) => ST_RE[s].test(r.status)), 'всего ' + stWord('', s));
    // по видам — только те, что есть в оценках
    for (const [kind, , name] of KINDS) {
      const list = rs.filter((r) => kindOf(r.cat) === kind);
      if (!list.length) continue;
      for (const s of ['done', 'doing', 'plan', 'drop']) num('Статусы', `k:${kind}:${s}`, list.filter((r) => ST_RE[s].test(r.status)).length, `${name} · ${stWord(kind, s)}`);
    }
    for (const c of cats) {
      const list = rs.filter((r) => keyOf(r.cat) === keyOf(c)), h = catHash(c), a = avgOf(list);
      num('Категории', 'c:' + h, list.length, `${c}: ${plural(list.length, 'оценка', 'оценки', 'оценок')}`);
      add('Категории', 'ca:' + h, a != null ? fmt(a) : '—', `${c}: средний балл`, { tier: tierT(a) });
    }
    return out;
  }
  // какие цифры показаны: выбор хозяина или как раньше. У друга вместо «друзей» — «общие оценки»
  const statIds = (p) => (p.layout && Array.isArray(p.layout.stats) && p.layout.stats.length ? p.layout.stats : STAT_DEF).map((id) => (id === 'friends' && p.common ? 'common' : id));
  function statsHTML(p, dd) {
    const by = new Map(statCatalog(p).map((s) => [s.id, s]));
    const shown = statIds(p).map((id) => by.get(id)).filter(Boolean);
    const tile = (s) => {
      const btn = s.jump && !EDIT, tag = btn ? 'button' : 'div';
      // счёт с нуля — только при просмотре: при правке числа не прыгают на каждом изменении
      const val = s.count && typeof s.value === 'number' && !EDIT ? `<b data-count="${s.value}">${s.value}</b>` : `<b>${esc(String(s.value))}</b>`;
      return `<${tag}${btn ? ' type="button"' : ''} class="stat${s.tier ? ' tiered' : ''} rise"${s.tier ? ` data-tier="${s.tier}"` : ''}${btn ? ` data-jump="${s.jump}"` : ''} data-sid="${esc(s.id)}" style="--d:${dd.v++}">${val}<span>${esc(s.label)}</span>${EDIT ? `<button type="button" class="stx-rm" data-sx="${esc(s.id)}" aria-label="Убрать «${esc(s.label)}»" title="Убрать">✕</button>` : ''}</${tag}>`;
    };
    return `<div class="stats${EDIT ? ' edit' : ''}" id="statsRow">${shown.map(tile).join('')}${EDIT && shown.length < STAT_MAX ? '<button type="button" class="stat st-add" id="statAdd" title="Выбрать, какие цифры показывать"><b>＋</b><span>добавить цифру</span></button>' : ''}</div>`;
  }

  // ---------- отрисовка ----------
  const cells = (v) => `<span class="cells" data-tier="${tierT(v)}" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${v != null && i < Math.round(v) ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const badge = (t, cls) => `<span class="badge${cls ? ' ' + cls : ''}" data-tier="${tierT(t)}">${t != null ? fmt(t) : '—'}</span>`;
  const letter = (s) => esc([...String(s).trim()][0] || '?');
  // значок Letterboxd на обложке у импортированных оценок
  const LB_MARK = '<span class="lb-mark" title="Импортировано из Letterboxd" aria-label="Из Letterboxd"><i></i><i></i><i></i></span>';
  const lbm = (r) => (r.lb ? LB_MARK : '');


  const ST = { cat: 'all', sort: 'score', q: '', limit: 24, topics: false, genres: [], gOpen: false, status: 'all' };
  // статус над списком: «◷ В планах» и «▶ В процессе» с числом; переключатель виден, если такие оценки есть
  const STATUS_F = [['plan', /В планах/, '◷ В планах'], ['doing', /В процессе/, '▶ В процессе']];
  const statusOk = (r, f) => { const s = STATUS_F.find((x) => x[0] === f); return !s || s[1].test(r.status || ''); };
  function statusSegUI(box, pool, S) {
    const opts = STATUS_F.map(([k, re, t]) => [k, t, pool.filter((r) => re.test(r.status || '')).length]).filter((x) => x[2] || S.status === x[0]);
    box.hidden = !opts.length;
    if (!opts.length) { S.status = 'all'; box.replaceChildren(); return; }
    box.innerHTML = `<button type="button" data-st="all" aria-pressed="${S.status === 'all'}">Все</button>`
      + opts.map(([k, t, n]) => `<button type="button" data-st="${k}" aria-pressed="${S.status === k}">${t}<b>${n}</b></button>`).join('');
  }
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
  const SC_MAX = 6;
  // блоки профиля — виджеты на сетке из 12 колонок: блок стоит там, куда его поставили, ширина — от 3 до 12 колонок
  const WG_NAME = { stats: 'Цифры', podium: 'Любимое', all: 'Все оценки', badges: 'Ачивки', taste: 'Вкусы', friends: 'Друзья', hist: 'Оценки 1–10', cats: 'Категории' };
  const COLS = 12, ROW = 8; // колонки и шаг строк сетки в пикселях
  const HSTEP = 5, HMIN = 10; // высота, заданная вручную: шаг 5 строк (40px), не меньше 10 строк
  const WG_W = { stats: 12, podium: 8, all: 8, badges: 4, taste: 4, friends: 4, hist: 4, cats: 4 };
  const OLD_W = { s: 4, m: 6, l: 8, f: 12 }; // размеры из прошлой версии (⅓, ½, ⅔, во всю ширину)
  const wgMin = (k) => (k === 'stats' ? 6 : k === 'all' || k === 'podium' || k.startsWith('sc:') ? 4 : 3);
  const WIC = {
    move: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>',
    pen: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/></svg>',
  };
  let EDIT = false, tpOpen = false; // режим редактирования профиля; открыт ли список званий
  let lySnap = null, lyDirty = false; // раскладка до правок (для «Отмены») и есть ли несохранённые правки
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
  function showcaseHTML(p, sc, d) {
    const items = scItems(p, sc);
    if (!items.length && p.kind !== 'me') return '';
    return `<section class="card rise show" style="--d:${d}">
        <div class="head"><h2 class="h2">${esc(sc.title || autoTitle(p, sc))}</h2><span class="label">${esc(sc.cat ? catTitle(p, sc.cat) : 'все темы')} · ${sc.mode === 'pick' ? 'мой выбор' : 'лучшие по баллу'}</span></div>
        ${items.length ? `<div class="sc-row ${sc.style === 'list' ? 'as-list' : 'as-posters'}">${items.map((r, k) => `<a class="sc-it" href="${rateLink(p, r)}" title="${esc(r.name)}" data-tier="${tierT(r.total)}">
          <div class="pic" data-photo="${r.photo ? esc(r.id) : ''}"><span class="place">${k + 1}</span><span class="ltr">${letter(r.name)}</span>${lbm(r)}</div>
          <strong>${esc(r.name)}</strong>${badge(r.total)}</a>`).join('')}</div>`
          : '<p class="muted">Пока пусто: в этой теме нет подходящих оценок. Витрину можно изменить в режиме редактирования профиля (кнопка с квадратиками).</p>'}
      </section>`;
  }

  // окно витрины: добавить новую или изменить; блоки двигают и скрывают прямо в профиле
  let lyP = null, lyEdit = null, lyPush = 0; // lyEdit — витрина, которую сейчас добавляют или меняют
  // в режиме редактирования правка — черновик: в браузер и аккаунт она уходит только по «Сохранить»
  function saveLayout(p, noRender) {
    if (EDIT) { lyDirty = true; markDirty(); } else commitLayout(p);
    if (!noRender) render(p);
  }
  function commitLayout(p) {
    p.layout = { ...p.layout, at: Date.now() };
    keepLayout(p.layout);
    if (token) { clearTimeout(lyPush); const l = p.layout; lyPush = setTimeout(() => send('PUT', '/shelf', { ratings: [], layout: l }).catch(() => {}), 300); }
  }
  const markDirty = () => { const t = $('#edHint'); if (t) { t.textContent = 'Есть несохранённые изменения'; t.classList.add('dirty'); } };
  function startEdit(p) {
    if (!p.layout) p.layout = { showcases: [], sections: {}, at: 0 };
    lySnap = JSON.stringify(p.layout); lyDirty = false;
    EDIT = true; tpOpen = false;
    render(p);
  }
  // «Сохранить» или «Отмена»: раскладка до правок возвращается целиком (и витрины тоже)
  function endEdit(p, keep) {
    const had = lyDirty;
    if (keep && had) commitLayout(p);
    if (!keep && lySnap) p.layout = JSON.parse(lySnap);
    EDIT = false; tpOpen = false; lySnap = null; lyDirty = false;
    render(p);
    toast(keep ? (had ? 'Профиль сохранён' : 'Изменений не было') : had ? 'Изменения отменены' : 'Редактирование закрыто');
  }
  addEventListener('beforeunload', (e) => { if (EDIT && lyDirty) { e.preventDefault(); e.returnValue = ''; } });
  function openScForm(p, id) {
    const scs = (p.layout && p.layout.showcases) || [];
    const sc = id && scs.find((x) => x.id === id);
    if (!sc && scs.length >= SC_MAX) { toast(`Витрин может быть не больше ${SC_MAX}`); return; }
    layoutEditor(p, sc ? { ...sc, ids: [...(sc.ids || [])], q: '' } : { id: 'sc' + Date.now().toString(36), title: '', cat: '', n: 5, mode: 'auto', ids: [], style: 'posters', q: '', isNew: true });
  }
  function layoutEditor(p, edit) {
    lyP = p;
    if (!p.layout) p.layout = { showcases: [], sections: {}, at: 0 };
    let box = $('#lyPick');
    if (!box) {
      box = document.createElement('div');
      box.className = 'st-pick'; box.id = 'lyPick'; box.hidden = true;
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'lyTitle');
      box.innerHTML = '<div class="st-card ly-card"><div class="st-head"><h2 id="lyTitle">Витрина</h2><button type="button" class="st-x" data-ly="close" aria-label="Закрыть">✕</button></div><div class="ly-body" id="lyBody"></div></div>';
      document.body.appendChild(box);
      box.addEventListener('click', onLayoutClick);
      box.addEventListener('input', onLayoutInput);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) { if (lyEdit) { lyEdit = null; drawLayout(); } else closeLayout(); } });
    }
    lyEdit = edit;
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
    // форма сохранена или отменена — окно закрывается
    if (!lyEdit) { closeLayout(); return; }
    $('#lyTitle').textContent = lyEdit.isNew ? 'Новая витрина' : 'Витрина';
    body.innerHTML = scFormHTML(p, lyEdit);
    hydratePhotos(p, body);
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
    if (e.target === box) { lyEdit = null; return closeLayout(); }
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
    const act = b.dataset.ly;
    const scs = (L.showcases || []).slice();
    if (act === 'close' || act === 'cancel') { lyEdit = null; return closeLayout(); }
    if (act === 'save') {
      if (lyEdit.mode === 'pick' && !lyEdit.ids.length) { lyEdit.err = 'Выбери хотя бы одну оценку'; return drawLayout(); }
      const sc = { id: lyEdit.id, title: (lyEdit.title || '').trim().slice(0, 60), cat: lyEdit.cat, n: lyEdit.n, mode: lyEdit.mode, ids: lyEdit.mode === 'pick' ? lyEdit.ids.slice(0, lyEdit.n) : [], style: lyEdit.style };
      const at = scs.findIndex((x) => x.id === sc.id);
      if (at >= 0) scs[at] = sc; else scs.push(sc);
      L.showcases = scs.slice(0, SC_MAX);
      lyEdit = null;
      saveLayout(p);
      return closeLayout();
    }
  }

  // ---------- режим редактирования профиля: блок тащат за ✥ куда угодно, ширину тянут за край, глаз скрывает ----------
  // ключи блоков в обычном порядке: с него раскладываются блоки, у которых ещё нет места на сетке
  function wgOrder(p, keys) {
    const rank = (k) => ['stats', 'sc', 'podium', 'all', 'badges', 'taste', 'friends', 'hist', 'cats'].indexOf(k.startsWith('sc:') ? 'sc' : k);
    const out = ((p.layout && p.layout.order) || []).filter((k, i, a) => keys.includes(k) && a.indexOf(k) === i);
    keys.filter((k) => !out.includes(k)).forEach((k) => { const i = out.findIndex((x) => rank(x) > rank(k)); out.splice(i >= 0 ? i : out.length, 0, k); });
    return out;
  }
  function wgHTML(p, k, html) {
    const on = secOn(p, k);
    if (!EDIT) return `<div class="wg" data-wg="${esc(k)}"${on ? '' : ' hidden'}>${html}</div>`;
    const sc = k.startsWith('sc:') && ((p.layout && p.layout.showcases) || []).find((x) => 'sc:' + x.id === k);
    const name = esc(sc ? sc.title || autoTitle(p, sc) : WG_NAME[k]);
    return `<div class="wg" data-wg="${esc(k)}"${on ? '' : ' data-off'}>
      <button type="button" class="wg-btn wg-move" title="Зажми и перетащи куда угодно. Стрелками на клавиатуре тоже можно" aria-label="Переместить блок «${name}»">${WIC.move}</button>
      <span class="wg-tools">${sc ? `<button type="button" class="wg-btn" data-wga="scedit" title="Изменить витрину" aria-label="Изменить витрину «${name}»">${WIC.pen}</button><button type="button" class="wg-btn danger" data-wga="scdel" title="Удалить витрину" aria-label="Удалить витрину «${name}»">${WIC.trash}</button>` : ''}<button type="button" class="wg-btn" data-wga="eye" aria-pressed="${!on}" title="${on ? 'Скрыть блок' : 'Показать блок'}" aria-label="${on ? 'Скрыть' : 'Показать'} блок «${name}»">${on ? WIC.eye : WIC.eyeOff}</button></span>
      <button type="button" class="wg-rs" title="Тяни, чтобы поменять ширину. Стрелками тоже можно" aria-label="Ширина блока «${name}»"><i></i></button>
      <button type="button" class="wg-rh" title="Тяни, чтобы поменять высоту. Двойной щелчок — высота по содержимому" aria-label="Высота блока «${name}»"><i></i></button>
      ${html}</div>`;
  }
  const editBarHTML = (p) => `<div class="ed-bar" id="edBar" role="toolbar" aria-label="Редактирование профиля">
    <span class="ed-tx"><b>Редактирование профиля</b><small id="edHint"${lyDirty ? ' class="dirty"' : ''}>${lyDirty ? 'Есть несохранённые изменения' : 'Тащи блоки за ✥, размер — за правый и нижний край, глаз скрывает'}</small></span>
    ${((p.layout && p.layout.showcases) || []).length < SC_MAX ? '<button type="button" class="btn ghost ed-add" data-ed="add">＋ Витрина</button>' : ''}
    <button type="button" class="btn ghost" data-ed="cancel">Отмена</button>
    <button type="button" class="btn primary" data-ed="save">Сохранить</button></div>`;

  // ---------- сетка блоков ----------
  // широкий экран: 12 колонок, строки по 8px. Блок стоит в своей колонке, а по высоте всплывает вверх,
  // пока не упрётся в блок выше (как виджеты на телефоне): дыр не остаётся, а соседи расступаются.
  // узкий экран: те же блоки списком в 2 колонки или в одну — по порядку сверху вниз и слева направо
  let BL = null; // { p, items: [{ k, el, x, y, w, h, i, fresh }], drag }
  const mqWide = matchMedia('(min-width: 980px)'), mqTwo = matchMedia('(min-width: 640px)');
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // сверху вниз: каждый блок всплывает, пока не упрётся, а налезающий сдвигается под мешающий;
  // lead — блок, который сейчас тащат: при равной высоте он встаёт первым, а мешающие ему блоки
  // сначала пробуют отойти вбок на свободное место и только потом уезжают вниз
  function compact(list, lead) {
    const placed = [];
    const free = (it, x, y) => !placed.some((o) => hit({ x, y, w: it.w, h: it.h }, o));
    const rise = (it) => { while (it.y > 0 && free(it, it.x, it.y - 1)) it.y--; };
    const key = (it) => (it === lead && it.sy != null ? it.sy : it.y);
    list.slice().sort((a, b) => key(a) - key(b) || (a === lead ? -1 : b === lead ? 1 : a.x - b.x)).forEach((it) => {
      it.y = Math.max(0, Math.round(it.y));
      rise(it);
      if (lead && it !== lead && !free(it, it.x, it.y)) {
        const xs = [...Array(COLS - it.w + 1).keys()].sort((a, b) => Math.abs(a - it.x) - Math.abs(b - it.x));
        const fx = xs.find((x) => free(it, x, it.y));
        if (fx != null) { it.x = fx; rise(it); }
      }
      let c;
      while ((c = placed.find((o) => hit(it, o)))) it.y = c.y + c.h;
      placed.push(it);
    });
    return placed;
  }
  // новый блок: первое свободное место сверху и слева
  function firstFit(placed, it) {
    for (let y = 0; ; y++) for (let x = 0; x <= COLS - it.w; x++) if (!placed.some((o) => hit({ x, y, w: it.w, h: it.h }, o))) return { x, y };
  }
  function boardItems(p, board) {
    const g = (p.layout && p.layout.grid) || {}, sz = (p.layout && p.layout.size) || {};
    return [...board.children].map((el, i) => {
      const k = el.dataset.wg, s = g[k];
      const w = Math.max(wgMin(k), Math.min(COLS, Math.round(s ? s.w : OLD_W[sz[k]] || WG_W[k] || (k.startsWith('sc:') ? 12 : 4))));
      const fh = s && s.h ? Math.max(HMIN, Math.round(s.h / HSTEP) * HSTEP) : 0; // 0 — высота по содержимому
      return s ? { k, el, i, w, fh, x: Math.max(0, Math.min(COLS - w, Math.round(s.x))), y: Math.max(0, +s.y || 0), h: 1, fresh: false } : { k, el, i, w, fh, x: 0, y: Infinity, h: 1, fresh: true };
    });
  }
  // плавный переезд: блок рисуется на новом месте, но стартует со старого
  function flip(items, before) {
    if (calm || !before) return;
    items.forEach((it) => {
      const a = before.get(it.el);
      if (!a || it === (BL && BL.drag)) return;
      const b = it.el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      it.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    });
  }
  const rects = (items) => new Map(items.map((it) => [it.el, it.el.getBoundingClientRect()]));
  function layoutBoard(lead, animate) {
    if (!BL) return;
    const its = BL.items.filter((it) => !it.el.hidden && it.el.isConnected);
    const before = animate ? rects(its) : null;
    if (mqWide.matches) {
      // пока блок тащат, соседи каждый раз считаются от мест до начала перетаскивания: не «уползают» по пути
      if (lead) its.forEach((q) => { if (q !== lead && q.bx != null) { q.x = q.bx; q.y = q.by; } });
      // блок отпускают на верхнюю половину соседа — встаёт на его место, сосед уступает
      if (lead) { const up = its.filter((q) => q !== lead && hit(lead, q) && lead.y < q.y + q.h / 2); lead.sy = up.length ? Math.min(...up.map((q) => q.y)) - 0.5 : null; }
      its.forEach((it) => {
        it.el.style.order = ''; it.el.style.gridColumn = `${(it.fresh ? 0 : it.x) + 1} / span ${it.w}`;
        // высота вручную: блок ровно такой, лишнее прокручивается внутри
        it.el.toggleAttribute('data-fh', !!it.fh);
        it.el.style.height = it.fh ? it.fh * ROW + 'px' : '';
      });
      const hs = its.map((it) => (it.fh ? 0 : it.el.offsetHeight)); // сначала все замеры, потом запись: одна раскладка
      its.forEach((it, n) => { it.h = it.fh || Math.max(1, Math.ceil(hs[n] / ROW)); });
      const placed = compact(its.filter((it) => !it.fresh), lead);
      its.filter((it) => it.fresh).sort((a, b) => a.i - b.i).forEach((it) => { Object.assign(it, firstFit(placed, it), { fresh: false }); placed.push(it); });
      its.forEach((it) => { it.el.style.gridColumn = `${it.x + 1} / span ${it.w}`; it.el.style.gridRow = `${it.y + 1} / span ${it.h}`; });
    } else {
      // узко: порядок — сверху вниз и слева направо, широкие блоки (от 7 колонок) — на обе колонки
      seqOf(its).forEach((it, n) => { it.el.style.order = n; it.el.style.gridColumn = mqTwo.matches && it.w >= 7 ? 'span 2' : ''; it.el.style.gridRow = ''; it.el.style.height = ''; it.el.removeAttribute('data-fh'); });
      const hs = its.map((it) => it.el.offsetHeight);
      its.forEach((it, n) => { it.el.style.gridRow = 'span ' + Math.max(1, Math.ceil(hs[n] / ROW)); });
    }
    flip(its, before);
  }
  // места блоков до начала перетаскивания (или забыть их)
  const base = (on) => BL.items.forEach((q) => { q.bx = on ? q.x : null; q.by = on ? q.y : null; });
  const seqOf = (its) => its.slice().sort((a, b) => a.y - b.y || a.x - b.x || a.i - b.i);
  let wgRO = null, wgRaf = 0;
  const relayout = () => { if (!BL || BL.drag || wgRaf) return; wgRaf = requestAnimationFrame(() => { wgRaf = 0; layoutBoard(null, false); }); };
  mqWide.addEventListener('change', relayout);
  mqTwo.addEventListener('change', relayout);
  function sizeBoard(p, board) {
    if (wgRO) wgRO.disconnect();
    BL = { p, items: boardItems(p, board), drag: null };
    layoutBoard(null, false);
    if (!('ResizeObserver' in window)) return;
    wgRO = new ResizeObserver(relayout); // высота блока поменялась (картинки, список) — соседи подстраиваются
    BL.items.forEach((it) => wgRO.observe(it.el));
  }
  // места блоков — в черновик раскладки (на сервер уйдут по «Сохранить»)
  function keepGrid(p) {
    const grid = {};
    BL.items.forEach((it) => { if (!it.fresh) grid[it.k] = it.fh ? { x: it.x, y: it.y, w: it.w, h: it.fh } : { x: it.x, y: it.y, w: it.w }; });
    p.layout.grid = { ...(p.layout.grid || {}), ...grid };
    saveLayout(p, true);
  }
  // перетаскивание за ✥: копия блока едет за пальцем, а сам блок пунктиром показывает, куда встанет
  function dragMove(e, it, p) {
    e.preventDefault();
    const board = $('#wboard'), r = it.el.getBoundingClientRect();
    const ghost = it.el.cloneNode(true);
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.classList.add('wg-ghost');
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', gridColumn: '', gridRow: '', order: '' });
    document.body.appendChild(ghost);
    it.el.classList.add('wg-lift');
    document.body.classList.add('wg-dragging');
    BL.drag = it;
    base(true);
    const wide = mqWide.matches, ox = e.clientX - r.left, oy = e.clientY - r.top;
    let x = e.clientX, y = e.clientY, raf = 0, ty = it.y, moved = false;
    const frame = () => {
      raf = 0;
      const gl = x - ox, gt = y - oy;
      ghost.style.left = gl + 'px'; ghost.style.top = gt + 'px';
      const edge = 70;
      if (y < edge || y > innerHeight - edge) { scrollBy(0, y < edge ? -14 : 14); raf = requestAnimationFrame(frame); }
      const br = board.getBoundingClientRect();
      if (wide) {
        // клетка под левым верхним углом копии
        const step = (br.width + parseFloat(getComputedStyle(board).columnGap)) / COLS;
        const nx = Math.max(0, Math.min(COLS - it.w, Math.round((gl - br.left) / step)));
        const ny = Math.max(0, Math.round((gt - br.top) / ROW));
        if (nx === it.x && ny === ty) return;
        it.x = nx; ty = ny; it.y = ny; moved = true;
        layoutBoard(it, true);
      } else {
        // узко: блок встаёт до или после блока под пальцем
        const t = document.elementFromPoint(x, y), over = t && t.closest('#wboard > .wg');
        const o = over && BL.items.find((q) => q.el === over);
        if (!o || o === it) return;
        const seq = seqOf(BL.items.filter((q) => !q.el.hidden)).filter((q) => q !== it);
        const or = over.getBoundingClientRect(), at = seq.indexOf(o) + (y < or.top + or.height / 2 ? 0 : 1);
        seq.splice(at, 0, it);
        if (seq.every((q, n) => q.y === n)) return;
        seq.forEach((q, n) => { q.y = n; });
        moved = true;
        layoutBoard(it, true);
      }
    };
    const move = (ev) => { x = ev.clientX; y = ev.clientY; if (!raf) raf = requestAnimationFrame(frame); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (raf) { cancelAnimationFrame(raf); frame(); } // последний сдвиг (быстрый рывок) тоже учитываем
      cancelAnimationFrame(raf);
      const end = ghost.getBoundingClientRect();
      ghost.remove();
      it.el.classList.remove('wg-lift');
      document.body.classList.remove('wg-dragging');
      BL.drag = null;
      base(false);
      // блок «приземляется» с места, где его отпустили
      if (!calm) { const b = it.el.getBoundingClientRect(); it.el.animate([{ transform: `translate(${end.left - b.left}px, ${end.top - b.top}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' }); }
      if (moved) keepGrid(p);
      it.el.querySelector('.wg-move').focus({ preventScroll: true });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  // ширина: тянем за правый край, шаг — одна колонка
  function dragSize(e, it, p) {
    e.preventDefault();
    const board = $('#wboard');
    it.el.classList.add('wg-sizing');
    document.body.classList.add('wg-dragging', 'wg-ew');
    BL.drag = it;
    base(true);
    let x = e.clientX, raf = 0, moved = false;
    const frame = () => {
      raf = 0;
      const br = board.getBoundingClientRect(), step = (br.width + parseFloat(getComputedStyle(board).columnGap)) / COLS;
      const left = br.left + it.x * step;
      const nw = Math.max(wgMin(it.k), Math.min(COLS - it.x, Math.round((x - left) / step)));
      if (nw === it.w) return;
      it.w = nw; moved = true;
      layoutBoard(it, true);
    };
    const move = (ev) => { x = ev.clientX; if (!raf) raf = requestAnimationFrame(frame); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (raf) { cancelAnimationFrame(raf); frame(); }
      it.el.classList.remove('wg-sizing');
      document.body.classList.remove('wg-dragging', 'wg-ew');
      BL.drag = null;
      base(false);
      layoutBoard(null, true);
      if (moved) keepGrid(p);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  // высота: тянем за нижний край, шаг — 40px; двойной щелчок по ручке — снова по содержимому
  function dragHeight(e, it, p) {
    e.preventDefault();
    it.el.classList.add('wg-sizing');
    document.body.classList.add('wg-dragging', 'wg-ns');
    BL.drag = it;
    base(true);
    let y = e.clientY, raf = 0, moved = false;
    const frame = () => {
      raf = 0;
      if (y > innerHeight - 70) { scrollBy(0, 14); raf = requestAnimationFrame(frame); }
      const top = it.el.getBoundingClientRect().top;
      const nh = Math.max(HMIN, Math.round((y - top + 18) / (ROW * HSTEP)) * HSTEP);
      if (nh === it.fh) return;
      it.fh = nh; moved = true;
      layoutBoard(it, true);
    };
    const move = (ev) => { y = ev.clientY; if (!raf) raf = requestAnimationFrame(frame); };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (raf) { cancelAnimationFrame(raf); frame(); }
      cancelAnimationFrame(raf);
      it.el.classList.remove('wg-sizing');
      document.body.classList.remove('wg-dragging', 'wg-ns');
      BL.drag = null;
      base(false);
      layoutBoard(null, true);
      if (moved) keepGrid(p);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  // клавиатура: ✥ стрелками двигает блок, края стрелками меняют ширину и высоту (Delete — высота по содержимому)
  function keyBoard(e, p) {
    const mv = e.target.closest('.wg-move'), rs = e.target.closest('.wg-rs'), rh = e.target.closest('.wg-rh');
    if (!mv && !rs && !rh) return;
    const dir = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd', Delete: 'x', Backspace: 'x' }[e.key];
    if (!dir) return;
    e.preventDefault();
    const it = BL.items.find((q) => q.el === e.target.closest('.wg'));
    const vis = BL.items.filter((q) => !q.el.hidden && q !== it);
    if (rh) {
      if (dir === 'x') it.fh = 0;
      else if (dir === 'u' || dir === 'd') it.fh = Math.max(HMIN, Math.round((it.fh || it.h) / HSTEP) * HSTEP + (dir === 'd' ? HSTEP : -HSTEP));
      else return;
    } else if (dir === 'x') return;
    else if (rs) {
      if (dir !== 'l' && dir !== 'r') return;
      it.w = Math.max(wgMin(it.k), Math.min(COLS - it.x, it.w + (dir === 'r' ? 1 : -1)));
    } else if (!mqWide.matches) {
      const seq = seqOf(vis), at = seqOf([...vis, it]).indexOf(it) + (dir === 'u' || dir === 'l' ? -1 : 1);
      seq.splice(Math.max(0, Math.min(seq.length, at)), 0, it);
      seq.forEach((q, n) => { q.y = n; });
    } else if (dir === 'l' || dir === 'r') {
      it.x = Math.max(0, Math.min(COLS - it.w, it.x + (dir === 'r' ? 1 : -1)));
    } else {
      // вверх — встать перед ближайшим блоком сверху, вниз — после ближайшего снизу (в тех же колонках)
      const cols = (o) => o.x < it.x + it.w && it.x < o.x + o.w;
      const near = dir === 'u' ? vis.filter((o) => cols(o) && o.y < it.y).sort((a, b) => b.y - a.y)[0] : vis.filter((o) => cols(o) && o.y > it.y).sort((a, b) => a.y - b.y)[0];
      if (!near) return;
      it.y = dir === 'u' ? near.y : near.y + 1;
    }
    layoutBoard(it, true);
    keepGrid(p);
    e.target.scrollIntoView({ block: 'nearest' });
  }
  function onWgClick(e, p) {
    const b = e.target.closest('[data-wga]');
    if (!b) return;
    const wg = b.closest('.wg'), k = wg.dataset.wg, L = p.layout, a = b.dataset.wga;
    if (a === 'eye') {
      const on = !secOn(p, k);
      L.sections = { ...(L.sections || {}), [k]: on };
      wg.toggleAttribute('data-off', !on);
      b.innerHTML = on ? WIC.eye : WIC.eyeOff;
      b.setAttribute('aria-pressed', String(!on));
      b.title = on ? 'Скрыть блок' : 'Показать блок';
      saveLayout(p, true);
    } else if (a === 'scedit') openScForm(p, k.slice(3));
    else if (a === 'scdel') {
      L.showcases = (L.showcases || []).filter((x) => 'sc:' + x.id !== k);
      saveLayout(p);
      toast('Витрина убрана. Вернуть можно кнопкой «Отмена»');
    }
  }
  // звания под ником: перетаскиваются за сам чип (или стрелками), крестик убирает, «＋ Звание» добавляет
  function dragTitle(e, chip, p) {
    if (e.button > 0 || e.target.closest('.t-x')) return;
    dragInRow(e, chip, '.title-chip[data-tid]', () => keepTitles(p));
  }
  // перетаскивание внутри ряда (звания, кубики цифр): элемент встаёт до или после того, над кем палец
  function dragInRow(e, item, sel, done) {
    e.preventDefault();
    const row = item.parentElement, sx = e.clientX, sy = e.clientY;
    const all = () => [...row.querySelectorAll(sel)].map((el) => ({ el }));
    let on = false;
    const move = (ev) => {
      if (!on && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!on) { on = true; item.classList.add('t-lift'); document.body.classList.add('wg-dragging'); }
      const t = document.elementFromPoint(ev.clientX, ev.clientY), o = t && t.closest(sel);
      if (!o || o === item || o.parentElement !== row) return;
      const r = o.getBoundingClientRect();
      const before = rects(all());
      row.insertBefore(item, ev.clientX < r.left + r.width / 2 ? o : o.nextSibling);
      flip(all(), before);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!on) { item.focus({ preventScroll: true }); return; }
      item.classList.remove('t-lift');
      document.body.classList.remove('wg-dragging');
      done();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  // ---------- цифры: ✕ убирает, ＋ открывает каталог, кубики перетаскиваются ----------
  function setStats(p, list, noRender) {
    p.layout.stats = list.slice(0, STAT_MAX);
    saveLayout(p, noRender);
  }
  function wireStats(p) {
    const row = $('#statsRow');
    if (!row) return;
    const ids = () => [...row.querySelectorAll('.stat[data-sid]')].map((el) => el.dataset.sid);
    row.addEventListener('click', (e) => {
      const x = e.target.closest('[data-sx]');
      if (x) {
        const list = ids().filter((id) => id !== x.dataset.sx);
        if (!list.length) { toast('Хотя бы одна цифра должна остаться'); return; }
        setStats(p, list);
        return;
      }
      if (e.target.closest('#statAdd')) statPicker(p);
    });
    row.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('.stat[data-sid]');
      if (!t || e.button > 0 || e.target.closest('[data-sx]')) return;
      const was = ids().join();
      dragInRow(e, t, '.stat[data-sid]', () => { if (ids().join() !== was) setStats(p, ids(), true); });
    });
  }
  // каталог цифр: все варианты сразу со своими значениями, нажатие добавляет или убирает
  let spBox = null, spP = null;
  function statPicker(p) {
    spP = p;
    if (!spBox) {
      spBox = document.createElement('div');
      spBox.className = 'st-pick'; spBox.id = 'statPick'; spBox.hidden = true;
      spBox.setAttribute('role', 'dialog'); spBox.setAttribute('aria-modal', 'true'); spBox.setAttribute('aria-labelledby', 'spTitle');
      spBox.innerHTML = '<div class="st-card sp-card"><div class="st-head"><h2 id="spTitle">Цифры в профиле</h2><button type="button" class="st-x" data-sp-close aria-label="Закрыть">✕</button></div><div class="sp-body" id="spBody"></div></div>';
      document.body.appendChild(spBox);
      const close = () => { spBox.hidden = true; document.body.style.overflow = ''; const a = $('#statAdd'); if (a) a.focus({ preventScroll: true }); };
      spBox.addEventListener('click', (e) => {
        if (e.target === spBox || e.target.closest('[data-sp-close]')) { close(); return; }
        const o = e.target.closest('[data-sp]');
        if (!o) return;
        const list = statIds(spP), id = o.dataset.sp;
        if (list.includes(id)) {
          if (list.length === 1) { toast('Хотя бы одна цифра должна остаться'); return; }
          setStats(spP, list.filter((x) => x !== id));
        } else if (list.length >= STAT_MAX) { toast(`Цифр может быть не больше ${STAT_MAX}: сначала убери одну`); return; }
        else setStats(spP, [...list, id]);
        drawPicker();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !spBox.hidden) close(); });
    }
    drawPicker();
    spBox.hidden = false;
    document.body.style.overflow = 'hidden';
    spBox.querySelector('.st-x').focus({ preventScroll: true });
  }
  function drawPicker() {
    const p = spP, sel = statIds(p), cat = statCatalog(p);
    const group = (g, hint) => {
      const items = cat.filter((s) => s.group === g);
      return items.length ? `<span class="label">${esc(g)}</span>${hint ? `<p class="ly-hint">${hint}</p>` : ''}<div class="sp-grid">${items.map((s) => `<button type="button" class="sp-opt" data-sp="${esc(s.id)}" aria-pressed="${sel.includes(s.id)}"${s.tier ? ` data-tier="${s.tier}"` : ''}><b>${esc(String(s.value))}</b><span>${esc(s.label)}</span></button>`).join('')}</div>` : '';
    };
    $('#spBody').innerHTML = `<p class="ly-hint">Выбрано ${sel.length} из ${STAT_MAX}. Нажми на цифру, чтобы добавить её в профиль или убрать. Порядок меняется перетаскиванием прямо в профиле.</p>`
      + group('Основное') + group('Статусы', 'Сколько просмотрено, пройдено, в процессе и в планах: всего и по видам') + group('Категории');
  }
  function keepTitles(p) {
    const ids = [...$('#titlesRow').querySelectorAll('.title-chip[data-tid]')].map((c) => c.dataset.tid);
    const cur = titlesShown(p, titleCatalog(p, p.ratings)).map((t) => t.id);
    if (ids.join() === cur.join()) return;
    p.layout.titles = ids;
    saveLayout(p, true);
  }
  function wireTitles(p) {
    const row = $('#titlesRow'), pop = $('#titlePop');
    if (!row) return;
    const shownIds = () => titlesShown(p, titleCatalog(p, p.ratings)).map((t) => t.id);
    const setSel = (ids) => { p.layout.titles = ids.slice(0, TITLE_MAX); saveLayout(p); };
    row.addEventListener('pointerdown', (e) => { const c = e.target.closest('.title-chip[data-tid]'); if (c) dragTitle(e, c, p); });
    row.addEventListener('keydown', (e) => {
      const c = e.target.closest('.title-chip');
      if (!c || e.target !== c || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const sib = e.key === 'ArrowLeft' ? c.previousElementSibling : c.nextElementSibling;
      if (!sib || !sib.matches('.title-chip[data-tid]')) return;
      if (e.key === 'ArrowLeft') sib.before(c); else sib.after(c);
      c.focus();
      keepTitles(p);
    });
    row.addEventListener('click', (e) => {
      const x = e.target.closest('[data-tx]');
      if (x) { setSel(shownIds().filter((id) => id !== x.dataset.tx)); return; }
      const add = e.target.closest('#titleAdd');
      if (add) { tpOpen = !tpOpen; pop.hidden = !tpOpen; add.setAttribute('aria-expanded', String(tpOpen)); return; }
      if (e.target.closest('#titleEye')) { p.layout.sections = { ...(p.layout.sections || {}), titles: !secOn(p, 'titles') }; saveLayout(p); }
    });
    pop.addEventListener('click', (e) => {
      const o = e.target.closest('[data-tadd]');
      if (!o) return;
      const sel = shownIds(), id = o.dataset.tadd;
      if (sel.includes(id)) setSel(sel.filter((x) => x !== id));
      else if (sel.length >= TITLE_MAX) toast(`Можно выбрать до ${TITLE_MAX} званий: сначала убери одно`);
      else setSel([...sel, id]);
    });
  }
  function wireBoard(p) {
    const board = $('#wboard');
    if (!board) return;
    sizeBoard(p, board);
    if (!EDIT) return;
    board.addEventListener('click', (e) => onWgClick(e, p));
    board.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const h = e.target.closest('.wg-move, .wg-rs, .wg-rh');
      if (!h) return;
      const it = BL.items.find((q) => q.el === h.closest('.wg'));
      if (h.classList.contains('wg-move')) dragMove(e, it, p); else if (h.classList.contains('wg-rs')) dragSize(e, it, p); else dragHeight(e, it, p);
    });
    // двойной щелчок по нижней ручке — высота снова по содержимому
    board.addEventListener('dblclick', (e) => {
      const h = e.target.closest('.wg-rh');
      const it = h && BL.items.find((q) => q.el === h.closest('.wg'));
      if (!it || !it.fh) return;
      it.fh = 0;
      layoutBoard(it, true);
      keepGrid(p);
    });
    board.addEventListener('keydown', (e) => keyBoard(e, p));
    $('#edBar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ed]');
      if (!b) return;
      if (b.dataset.ed === 'add') openScForm(p, null);
      else endEdit(p, b.dataset.ed === 'save');
    });
    wireTitles(p);
    wireStats(p);
  }
  // Esc: закрывает список званий; без правок — выходит из редактирования, с правками — просит сохранить или отменить
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !EDIT || !curP || document.querySelector('.st-pick:not([hidden])')) return;
    if (tpOpen) { tpOpen = false; render(curP); }
    else if (!lyDirty) endEdit(curP, false);
    else toast('Сохрани или отмени изменения кнопками внизу');
  });

  // ---------- отдельная страница «Все оценки» (/profile/?all=1): список, плитка, тир-лист или подробно ----------
  const ALL = new URLSearchParams(location.search).has('all');
  const ALL_KEY = 'casualhub.allView.v1';
  const AST = (() => {
    const v = read(ALL_KEY) || {};
    return { view: ['list', 'grid', 'tier', 'full'].includes(v.view) ? v.view : 'grid', sort: ['score', 'date', 'name'].includes(v.sort) ? v.sort : 'score', cats: [], q: '', limit: 60, genres: [], gOpen: false, status: 'all' };
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
            <div class="seg st-seg" id="allStSeg" role="group" aria-label="Статус" hidden></div>
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
      $('#allStSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) { AST.status = b.dataset.st; AST.limit = 60; drawAll(); } });
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
    statusSegUI($('#allStSeg'), inCats, AST);
    const list = inCats.filter((r) => statusOk(r, AST.status) && hasGenres(r, AST.genres) && (!q || keyOf(r.name + ' ' + r.meta).includes(q)));
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
    const own = idbPhoto(r);
    if (own) return own.then((d) => d || serverFull(p, r));
    if (r.photo.url && /^https:\/\//.test(r.photo.url)) return Promise.resolve(r.photo.url);
    if (typeof r.photo.id === 'string' && /^https:\/\//.test(r.photo.id)) return Promise.resolve(r.photo.id);
    return serverFull(p, r);
  };
  const serverFull = (p, r) => {
    if (!token || !p.uid) return Promise.resolve(null);
    const k = p.uid + ':' + r.id;
    if (!fullPhotoCache.has(k)) fullPhotoCache.set(k, api(`/photo/${encodeURIComponent(p.uid)}/${encodeURIComponent(r.id)}`).then((d) => d.data || null, () => null));
    return fullPhotoCache.get(k);
  };
  // ---------- быстрая правка своей оценки прямо в карточке: баллы, плюсы, минусы, заметка ----------
  const RKEY = 'ocenshik.ratings.v2';
  // править можно свою оценку, которая лежит в этом браузере (Мнение здесь уже открывали)
  const ownDoc = (p, id) => (p.kind === 'me' && (read(RKEY) || []).find((x) => x && x.id === id && !x.example && (!user || !x.author || x.author.id === user.id))) || null;
  const round1 = (x) => Math.round(x * 10) / 10;
  // итог — как в Мнении: среднее поставленных баллов с весами критериев
  const totalOf = (scores) => {
    let sum = 0, wSum = 0;
    for (const s of scores) { if (!(s.v > 0)) continue; const w = typeof s.w === 'number' && s.w > 0 ? s.w : 1; sum += s.v * w; wSum += w; }
    return wSum ? round1(sum / wSum) : null;
  };
  // оценка для сервера — в том же виде, что шлёт Мнение (friends.js): фото-файл отпечатком, фото-ссылка как есть
  const fpOf = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + '.' + s.length.toString(36); };
  const shelfCopy = (r) => {
    const c = Object.assign({}, r), ph = r.photo;
    const d = ph && typeof ph.data === 'string' && ph.data.startsWith('data:image/') ? ph.data : ph && typeof ph.id === 'string' && ph.id.startsWith('data:image/') ? ph.id : '';
    const u = ph && (ph.url || ph.id);
    const link = typeof u === 'string' && /^https:\/\//.test(u) && u.length < 2000 ? u : '';
    const ref = !d && ph && window.CasualPhotos && window.CasualPhotos.isKey(ph.ref) ? window.CasualPhotos.remoteOf(ph.ref) : ''; // фото в IndexedDB: отпечаток в самой ссылке
    c.photo = d ? { remote: fpOf(d), w: ph.w || 0, h: ph.h || 0 } : link ? { url: link, w: ph.w || 0, h: ph.h || 0 } : ref ? { remote: ref, w: ph.w || 0, h: ph.h || 0 } : undefined;
    if (!c.photo) delete c.photo;
    delete c.hist; delete c.history;
    const cs = read('ocenshik.cats.v2');
    const cat = (Array.isArray(cs) ? cs : (cs && cs.items) || []).find((x) => x && x.id === r.cat);
    c.catLabel = (cat && String(cat.name || '').trim()) || r.catName || r.catLabel || 'Без категории';
    return c;
  };
  const pushOwn = (p, doc) => (token && p.uid ? send('PUT', '/shelf', { ratings: [shelfCopy(doc)] }).then(() => true, () => false) : Promise.resolve(null));
  const RD_IC = {
    edit: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/></svg>',
  };
  let curP = null, rdBox = null, rdBack = null, rdCur = null, rdEd = null;
  function rdReplace(p, nr) {
    for (const arr of [p.allRatings, p.ratings]) { const k = arr ? arr.findIndex((x) => x.id === nr.id) : -1; if (k >= 0) arr[k] = nr; }
  }
  // правка оценки в браузере: сохраняем, перерисовываем профиль и карточку, отправляем в аккаунт
  function rdCommit(p, doc, msg) {
    const all = read(RKEY) || [];
    const k = all.findIndex((x) => x && x.id === doc.id);
    if (k < 0) { toast('Эта оценка не нашлась в браузере. Поправь её в Мнении'); return; }
    all[k] = doc;
    try { localStorage.setItem(RKEY, JSON.stringify(all)); } catch (e) { toast('Браузер не дал сохранить: мало места'); return; }
    const nr = norm(doc);
    rdReplace(p, nr);
    render(p);
    openRating(p, nr);
    pushOwn(p, doc).then((ok) => toast(ok === false ? msg + '. В аккаунт уйдёт, когда откроешь Мнение' : msg));
  }
  function rdSave() {
    const { p, r } = rdCur;
    const doc = ownDoc(p, r.id);
    if (!doc || !rdEd) return;
    const scores = (doc.scores || []).map((s, k) => Object.assign({}, s, { v: rdEd.v[k] != null ? rdEd.v[k] : s.v }));
    const next = { pros: rdEd.pros.trim().slice(0, 1000), cons: rdEd.cons.trim().slice(0, 1000), note: rdEd.note.trim().slice(0, 4000) };
    const same = scores.every((s, k) => (+s.v || 0) === (+doc.scores[k].v || 0)) && next.pros === (doc.pros || '') && next.cons === (doc.cons || '') && next.note === (doc.note || '');
    rdEd = null;
    if (same) { openRating(p, r); return; }
    rdCommit(p, Object.assign(doc, next, { scores, total: totalOf(scores), updatedAt: new Date().toISOString() }), 'Оценка сохранена');
  }
  function rdFav() {
    const { p, r } = rdCur;
    const doc = ownDoc(p, r.id);
    if (!doc) return;
    doc.fav = !doc.fav; // как в Мнении: избранное не считается правкой оценки
    rdCommit(p, doc, doc.fav ? '★ В избранном' : 'Убрано из избранного');
  }
  // ссылка на отзыв (страница /r/<код>): та же, что делает Мнение
  async function rdLink(b) {
    const { p, r } = rdCur;
    b.disabled = true;
    let id = '';
    try { id = (await send('POST', '/share', { rid: r.id })).id; } catch (st) {
      // оценка ещё не дошла до сервера: отправляем её и пробуем ещё раз
      const doc = st === 404 && ownDoc(p, r.id);
      if (doc) { try { await send('PUT', '/shelf', { ratings: [shelfCopy(doc)] }); id = (await send('POST', '/share', { rid: r.id })).id; } catch (e) {} }
    }
    b.disabled = false;
    if (!id) { toast('Не получилось сделать ссылку, попробуй ещё раз'); return; }
    const url = location.origin + '/r/' + id;
    b.classList.add('on');
    if (matchMedia('(pointer: coarse)').matches && navigator.share) {
      try { await navigator.share({ title: r.name, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {}
    toast(ok ? 'Ссылка на отзыв скопирована, отправь её кому хочешь' : url);
  }
  // нажатие на деление: балл; нажатие на последнее закрашенное — сброс
  function rdCell(k, v) {
    if (!rdEd) return;
    rdEd.v[k] = rdEd.v[k] === v ? 0 : v;
    const nv = rdEd.v[k];
    const li = rdBox.querySelector(`.rd-crit li[data-k="${k}"]`);
    if (li) {
      li.dataset.tier = tierV(nv);
      li.querySelector('.rd-ct span').textContent = nv || '—';
      li.querySelectorAll('.rd-bar button').forEach((b, i) => { b.classList.toggle('on', i < nv); b.setAttribute('aria-pressed', String(i < nv)); });
    }
    const doc = ownDoc(rdCur.p, rdCur.r.id);
    const t = totalOf(((doc && doc.scores) || []).map((s, i) => ({ v: rdEd.v[i], w: s.w })));
    rdBox.querySelector('.rd-card').dataset.tier = tierT(t);
    rdBox.querySelector('.rd-score b').textContent = t != null ? fmt(t) : '—';
  }
  function openRating(p, r) {
    if (!rdBox) {
      rdBox = document.createElement('div');
      rdBox.className = 'st-pick rd-pick'; rdBox.hidden = true;
      rdBox.setAttribute('role', 'dialog'); rdBox.setAttribute('aria-modal', 'true'); rdBox.setAttribute('aria-labelledby', 'rdTitle');
      document.body.appendChild(rdBox);
      rdBox.addEventListener('click', (e) => {
        // во время правки мимо карточки не закрываем: так не потерять поставленные баллы
        if ((e.target === rdBox && !rdEd) || e.target.closest('[data-rd="close"]')) { closeRating(); return; }
        const c = e.target.closest('.rd-bar.ed button');
        if (c) { rdCell(+c.dataset.k, +c.dataset.v); return; }
        const b = e.target.closest('button[data-rd]');
        if (!b || !rdCur) return;
        const act = b.dataset.rd;
        if (act === 'edit') {
          const doc = ownDoc(rdCur.p, rdCur.r.id);
          if (!doc) return;
          rdEd = { v: (doc.scores || []).map((s) => Math.max(0, Math.min(10, Math.round(+s.v || 0)))), pros: doc.pros || '', cons: doc.cons || '', note: doc.note || '' };
          openRating(rdCur.p, rdCur.r);
          const first = rdBox.querySelector('.rd-bar.ed button');
          if (first) first.focus({ preventScroll: true });
        } else if (act === 'cancel') { rdEd = null; openRating(rdCur.p, rdCur.r); }
        else if (act === 'save') rdSave();
        else if (act === 'fav') rdFav();
        else if (act === 'link') rdLink(b);
      });
      rdBox.addEventListener('input', (e) => { const f = e.target.dataset && e.target.dataset.f; if (f && rdEd) rdEd[f] = e.target.value; });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !rdBox.hidden) closeRating(); });
    }
    if (rdBox.hidden) { rdBack = document.activeElement; rdEd = null; }
    rdCur = { p, r };
    const own = ownDoc(p, r.id);
    const ed = own && rdEd;
    const scores = ed ? (own.scores || []) : r.scores;
    const total = ed ? totalOf(scores.map((s, k) => ({ v: rdEd.v[k], w: s.w }))) : r.total;
    const word = total != null ? WORDS[Math.max(1, Math.min(10, Math.round(total)))] : 'Без балла';
    const n = r.scores.filter((s) => +s.v > 0).length;
    const pros = lines(r.pros), cons = lines(r.cons);
    const when = r.created || r.at;
    const tools = !own ? '' : ed
      ? `<div class="rd-tools"><span class="rd-hint">Нажми на деление, чтобы поставить балл. Ещё раз на последнее закрашенное — сбросить</span><span class="rd-tb"><button type="button" class="btn ghost" data-rd="cancel">Отмена</button><button type="button" class="btn primary" data-rd="save">Сохранить</button></span></div>`
      : `<div class="rd-tools"><button type="button" class="btn primary rd-edit" data-rd="edit">${RD_IC.edit}Изменить</button><span class="rd-ib">
        <button type="button" class="rd-i fav${r.fav ? ' on' : ''}" data-rd="fav" aria-pressed="${r.fav}" title="${r.fav ? 'Убрать из избранного' : 'В избранное'}" aria-label="${r.fav ? 'Убрать из избранного' : 'В избранное'}">${RD_IC.star}</button>
        ${token && p.uid ? `<button type="button" class="rd-i" data-rd="link" title="Поделиться ссылкой: отзыв увидит кто угодно, даже без аккаунта" aria-label="Поделиться ссылкой">${RD_IC.link}</button>` : ''}
        <a class="rd-i" href="/mnenie/#r=${encodeURIComponent(r.id)}&amp;share=1" title="Картинка или текст: откроется в Мнении" aria-label="Картинка или текст">${RD_IC.share}</a></span></div>`;
    rdBox.innerHTML = `<article class="rd-card${ed ? ' editing' : ''}" data-tier="${tierT(total)}">
      <button type="button" class="st-x rd-x" data-rd="close" aria-label="Закрыть">✕</button>
      ${r.photo ? `<div class="rd-pic" id="rdPic"><span class="ltr">${letter(r.name)}</span>${lbm(r)}</div>` : ''}
      <div class="rd-top">
        <div class="rd-name"><span class="label">${esc(r.cat)}</span><h2 id="rdTitle">${r.fav ? `<span class="fav">${ICON.star}</span> ` : ''}${esc(r.name)}</h2>
          <p>${esc([word, n ? `${n} ${plural(n, 'критерий', 'критерия', 'критериев')}` : '', r.status, r.meta].filter(Boolean).join(' · '))}${r.lb ? ' <span class="lb-src">· <span class="lb-mark"><i></i><i></i><i></i></span>из Letterboxd</span>' : ''}</p></div>
        <div class="rd-score"><b>${total != null ? fmt(total) : '—'}</b><small>из 10</small></div>
      </div>
      ${tools}
      ${scores.length ? `<ul class="rd-crit">${scores.map((s, k) => { const v = ed ? rdEd.v[k] : Math.max(0, Math.min(10, Math.round(+s.v || 0))); return `<li data-tier="${tierV(v)}" data-k="${k}">
        <div class="rd-ct"><b>${esc(s.name)}${s.w && s.w !== 1 ? ` <small>×${String(s.w).replace('.', ',')}</small>` : ''}</b><span>${v || '—'}</span></div>
        ${s.desc ? `<small class="rd-desc">${esc(s.desc)}</small>` : ''}
        ${ed ? `<div class="rd-bar ed" role="group" aria-label="${esc(s.name)}: балл">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-k="${k}" data-v="${i + 1}"${i < v ? ' class="on"' : ''} aria-pressed="${i < v}" aria-label="${i + 1}"></button>`).join('')}</div>`
          : `<div class="rd-bar" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i${i < v ? ' class="on"' : ''}></i>`).join('')}</div>`}
        ${s.note ? `<em>${esc(s.note)}</em>` : ''}</li>`; }).join('')}</ul>` : ''}
      ${ed ? `<div class="rd-fields">
        <label><span class="label">Плюсы</span><textarea data-f="pros" rows="2" maxlength="1000" placeholder="Каждый плюс с новой строки">${esc(rdEd.pros)}</textarea></label>
        <label><span class="label">Минусы</span><textarea data-f="cons" rows="2" maxlength="1000" placeholder="Каждый минус с новой строки">${esc(rdEd.cons)}</textarea></label>
        <label><span class="label">Заметка</span><textarea data-f="note" rows="3" maxlength="4000" placeholder="Что думаешь в целом">${esc(rdEd.note)}</textarea></label></div>`
      : `${pros.length || cons.length ? `<div class="fr-pc">${pros.length ? `<div><span class="label">Плюсы</span><ul>${pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${cons.length ? `<div><span class="label">Минусы</span><ul>${cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
      ${r.text ? `<p class="fr-note">${esc(r.text)}</p>` : ''}`}
      <div class="rd-foot"><span>${when ? dayFmt(when) : ''}</span><a class="btn ghost" href="${rateLink(p, r)}">Открыть в Мнении</a></div>
      ${p.uid && token && !ed ? '<div class="rd-cm" id="rdComments"></div>' : ''}
    </article>`;
    // ветка комментариев под оценкой: та же, что в Мнении у этой оценки
    if (p.uid && token && !ed && window.CasualComments) window.CasualComments.mount(rdBox.querySelector('#rdComments'), { uid: p.uid, target: 'r.' + r.id, token, title: 'Комментарии к оценке', placeholder: 'Что думаешь об этой оценке?' });
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
    rdEd = null;
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
    let d = 1; // 0 — у шапки, она появляется первой
    const isMe = p.kind === 'me';
    if (!isMe) EDIT = false;
    document.body.classList.toggle('prof-edit', EDIT);
    p.friendCount = p.kind === 'me' ? (p.friends ? p.friends.length : null) : p.friendCount;
    p.badges = user || p.kind !== 'me' ? badgesOf(p) : null;
    const ava = p.avatar && /^(data:image\/|https?:\/\/)/.test(p.avatar)
      ? `<span class="ava" style="background-image:url('${esc(p.avatar)}')"></span>`
      : `<span class="ava" style="background-color:${esc(p.color || colorOf(p.name))}">${letter(p.name)}</span>`;
    let i = 0;
    const nameHTML = calm ? esc(p.name) : [...p.name].map((c) => (c === ' ' ? ' ' : `<span class="ch" style="--i:${i++}">${esc(c)}</span>`)).join('');

    // ---------- блоки профиля: каждый — виджет на сетке; порядок, размер и видимость выбирает хозяин ----------
    const W = {};
    const dd = { v: d };
    W.stats = statsHTML(p, dd);
    d = dd.v;
    ((p.layout && p.layout.showcases) || []).forEach((sc) => { const h = showcaseHTML(p, sc, d++); if (h) W['sc:' + sc.id] = h; });
    if (top3.length) W.podium = `<section class="card rise" style="--d:${d++}">
            <div class="head"><h2 class="h2">Любимое</h2><span class="label">топ по баллу</span></div>
            <div class="podium">${top3.map((r, k) => `<a class="pod p${k + 1}" href="${rateLink(p, r)}" title="Открыть оценку «${esc(r.name)}»" data-tier="${tierT(r.total)}">
              <div class="pic" data-photo="${r.photo ? esc(r.id) : ''}"><span class="place">${k + 1}</span><span class="ltr">${letter(r.name)}</span>${lbm(r)}</div>
              <strong>${esc(r.name)}</strong>
              <div class="row"><small>${esc(r.cat)}</small>${badge(r.total)}</div></a>`).join('')}</div>
          </section>`;
    W.all = `<section class="card rise" id="allSec" style="--d:${d++}">
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
              <div class="seg st-seg" id="stSeg" role="group" aria-label="Статус" hidden></div>
              <button type="button" class="btn ghost genre-btn" id="genreBtn" aria-controls="genreChips" hidden>Фильтры</button>
            </div>
            <div class="chips genre-chips" id="genreChips" hidden></div>
            <div class="list" id="list"></div>
            <button type="button" class="btn ghost more" id="more" hidden>Показать ещё</button>`
            : `<div class="empty"><p class="muted"><strong>${isMe ? 'Тут появятся твои оценки.' : 'У друга пока нет оценок.'}</strong> ${isMe ? 'Оцени игру, фильм или любимую кофейню в Мнении Казуала, и профиль оживёт.' : 'Как только он что-нибудь оценит, оценки появятся здесь.'}</p>${isMe ? '<a class="btn primary" href="/mnenie/">Оценить первое</a>' : ''}</div>`}
          </section>`;
    if (p.badges) {
      const got = p.badges.filter((b) => b.got).length, pc = Math.round((got / Math.max(1, p.badges.length)) * 100), shown = got + 4;
      W.badges = `<section class="card rise" id="badgesSec" style="--d:${d++}">
            <div class="head"><h2 class="h2">Ачивки</h2><span class="label">${got} из ${p.badges.length}</span></div>
            <div class="ach-sum" role="img" aria-label="Открыто ${pc}% ачивок"><span class="tr"><i style="width:${pc}%"></i></span><b>${pc}%</b></div>
            ${badgesHTML(p.badges.slice(0, shown))}${p.badges.length > shown ? `<details class="bdg-more"><summary>Все ачивки · ещё ${p.badges.length - shown}</summary>${badgesHTML(p.badges.slice(shown))}</details>` : ''}
          </section>`;
    }
    if (p.common) W.taste = `<section class="card rise" id="taste" style="--d:${d++}">
            <div class="head"><h2 class="h2">Вкусы</h2><span class="label">ты и ${esc(p.name)}</span></div>
            ${p.common.length ? `<div class="match"><div class="ring" data-tier="${tierT(p.match / 10)}" style="--p:${p.match}"><b>${p.match}%</b></div>
              <p class="muted">${p.match >= 80 ? 'Вы смотрите на мир почти одинаково.' : p.match >= 60 ? 'Во многом сходитесь, но есть о чём поспорить.' : 'Вкусы расходятся: отличный повод для спора.'} Общих оценок: <b>${p.common.length}</b>.</p></div>
              <div class="cmp-head"><span>Что</span><span>ты</span><span>${esc([...p.name][0] || '')}</span><span></span></div>
              <div class="cmp">${p.common.slice(0, 12).map((c) => `<div class="cmp-row"><span title="${esc(c.name)}">${esc(c.name)}</span>${badge(c.mine)}${badge(c.theirs)}<em>${c.diff ? (c.diff > 0 ? '+' : '') + fmt(c.diff) : '='}</em></div>`).join('')}</div>`
              : '<p class="muted">Общих оценок пока нет. Оцените одно и то же, и здесь появится, насколько совпадают ваши вкусы.</p>'}
          </section>`;
    if (p.friends || isMe) W.friends = p.friends ? `<section class="card rise" style="--d:${d++}">
            <div class="head" id="friendsSec"><h2 class="h2">Друзья</h2><span class="label">${p.friends.length}</span></div>
            ${p.friends.length ? `<div class="frs">${p.friends.map((f) => `<a class="fr" href="/profile/?id=${encodeURIComponent(f.id)}">
                <span class="av" data-uid="${esc(f.id)}" style="background-color:${colorOf(f.username)}">${letter(f.username)}</span>
                <span class="tx"><b>${esc(f.username)} <i class="on-dot" data-on="${esc(f.id)}" data-last="${+f.lastSeen || ''}"></i></b><small><span data-seen="${esc(f.id)}" data-last="${+f.lastSeen || ''}" data-post=" · "></span>${f.handle ? '@' + esc(f.handle) : ''}${isMe ? `${f.handle ? ' · ' : ''}${f.updatedAt ? 'оценки обновлены ' + ago(f.updatedAt) : 'оценок пока нет'}` : ''}</small></span>${ICON.go}</a>`).join('')}</div>`
              : `<p class="muted">${isMe ? 'Пока никого. Добавить друга можно кнопкой «Друзья» в меню вверху.' : 'Пока никого.'}</p>`}
            ${p.incoming ? `<p class="note">${p.incoming} ${plural(p.incoming, 'заявка', 'заявки', 'заявок')} в друзья ${plural(p.incoming, 'ждёт', 'ждут', 'ждут')} ответа. <a href="/mnenie/">Открыть в Мнении</a></p>` : ''}
          </section>` : (isMe ? `<section class="card rise" style="--d:${d++}"><div class="head"><h2 class="h2">Друзья</h2></div><p class="muted">${esc(p.friendsHint || '')}</p></section>` : '');
    if (cats.size) { W.hist = `<section class="card rise" style="--d:${d++}">
            <div class="head"><h2 class="h2">Оценки 1–10</h2><span class="label">${rated.length} с баллом</span></div>
            <div class="hist">${hist.map((n, k) => `<div data-tier="${tierV(k + 1)}"><span class="bar${n ? '' : ' zero'}" style="height:${n ? Math.max(6, (n / hmax) * 100) : 3}%;--d:${k}"></span><small>${n || ''}</small><em>${k + 1}</em></div>`).join('')}</div>
          </section>`; W.cats = `<section class="card rise" id="catsSec" style="--d:${d++}">
            <div class="head"><h2 class="h2">Категории</h2></div>
            <div class="catl">${[...cats.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, c]) => { const av = c.k ? c.sum / c.k : null; return `<button type="button" class="cat" data-catgo="${esc(name)}" title="Показать оценки «${esc(name)}»"><b>${esc(name)}</b><small>${c.n} · ${av != null ? 'в среднем ' + fmt(av) : 'без балла'}</small><span class="tr" data-tier="${tierT(av)}"><i style="width:${(c.n / rs.length) * 100}%"></i></span></button>`; }).join('')}</div>
          </section>`; }

    app.innerHTML = `
      <section class="card hero rise" style="--d:0">
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
            : `<h1 class="name" id="profileName" aria-label="${esc(p.name)}"${isMe ? ' role="button" tabindex="0" title="Нажми, чтобы изменить ник"' : ''}>${nameHTML}</h1>`}${!isMe && p.uid && token ? bellHTML(p.followed) : ''}${stickerSlot(p)}</div>
          <p class="sub">${esc(p.sub)}</p>
          ${!isMe && p.uid ? `<p class="sub" data-seen="${esc(p.uid)}" data-last="${+p.lastSeen || ''}"></p>` : ''}
          ${titlesRowHTML(p, rs)}
          <div class="hero-acts">${isMe
            ? `<a class="btn primary" href="/mnenie/">Оценить что-нибудь</a><button type="button" class="btn ghost ic-btn" id="layoutBtn" aria-pressed="${EDIT}" title="${EDIT ? 'Сохрани или отмени изменения внизу' : 'Редактировать профиль: блоки, витрины, звания'}" aria-label="Редактировать профиль">${ICON_LAYOUT}</button>`
            : `<a class="btn ghost" href="/profile/">Мой профиль</a>${p.common && p.common.length ? '<a class="btn primary" href="#taste">Сравнить вкусы</a>' : ''}`}</div>
        </div>
      </section>

      <div class="wboard" id="wboard">${wgOrder(p, Object.keys(W)).map((k) => wgHTML(p, k, W[k])).join('')}</div>
      ${EDIT ? editBarHTML(p) : ''}
      ${p.uid && token ? `<section class="card rise wall" id="wallSec" style="--d:${d++}" aria-label="Комментарии в профиле"></section>` : ''}`;

    // стена профиля в самом низу, как в Steam: пишут хозяин и его друзья
    if (p.uid && token && window.CasualComments) window.CasualComments.mount($('#wallSec'), {
      uid: p.uid, target: 'wall', token, title: isMe ? 'Комментарии в твоём профиле' : `Комментарии в профиле ${p.name}`,
      placeholder: isMe ? 'Напиши что-нибудь у себя на стене…' : `Напиши что-нибудь ${p.name}…`,
      empty: isMe ? 'Пока никто ничего не написал. Друзья могут оставить тут комментарий.' : 'Пока пусто. Напиши первым!',
    });
    if (rs.length) wireList(p);
    wireJumps(p);
    if (isMe) {
      const lb = $('#layoutBtn');
      if (lb) lb.addEventListener('click', () => {
        if (!EDIT) startEdit(p);
        else if (!lyDirty) endEdit(p, false);
        else toast('Сохрани или отмени изменения кнопками внизу');
      });
      wireProfileName(p);
    }
    wireBoard(p);
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
      if (!p || EDIT) return;
      const j = e.target.closest('[data-jump]');
      if (j) {
        const to = j.dataset.jump;
        if (to === 'best') { ST.sort = 'score'; ST.cat = 'all'; ST.limit = 24; render(p); }
        const target = document.getElementById(to === 'best' ? 'allSec' : to);
        if ((!target || !target.offsetParent) && (to === 'best' || to === 'allSec' || to === 'catsSec')) { location.href = allHref(p); return; }
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
      statusSegUI($('#stSeg'), inCat, ST);
      let list = inCat.filter((r) => statusOk(r, ST.status) && hasGenres(r, ST.genres) && (!q || keyOf(r.name + ' ' + r.meta).includes(q)));
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
    $('#stSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; ST.status = b.dataset.st; ST.limit = 24; draw(); });
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
        // в оценки картинку аватарки не копируем (место в браузере): Мнение берёт её из профиля
        const mini = /^data:/.test(still || '') ? '' : still;
        const ratings = (read('ocenshik.ratings.v2') || []).map((r) => (r && r.author && r.author.id === cur.id ? Object.assign(r, { author: Object.assign({}, r.author, { avatar: mini }) }) : r));
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

  let banCtl = null, banDocWired = false;
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
    // клик мимо меню и Esc закрывают его. Обработчики на документе вешаются один раз на страницу (профиль перерисовывается
    // много раз, и раньше каждый раз добавлялась ещё пара), а работают с текущим меню баннера
    banCtl = { menu, btn, open };
    if (!banDocWired) {
      banDocWired = true;
      document.addEventListener('click', (e) => { const c = banCtl; if (c && c.menu.isConnected && !c.menu.hidden && !c.menu.contains(e.target) && !c.btn.contains(e.target)) c.open(false); });
      document.addEventListener('keydown', (e) => { const c = banCtl; if (c && e.key === 'Escape' && c.menu.isConnected && !c.menu.hidden) { c.open(false); c.btn.focus(); } });
    }
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
    const start = () => { p.editingName = true; render(p); };
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
      kind: 'me', name: meServer && meServer.username ? meServer.username : user ? user.name : 'Гость', avatar: shownAvatar(user), color: user && user.color, isAdmin: !!(meServer && meServer.admin),
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
        ratings, uid: s.user.id, common, match, layout: s.layout || null, followed: (fol.ids || []).includes(s.user.id), isAdmin: !!s.user.admin,
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
