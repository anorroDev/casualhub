/* Казуал Хаб: рейтинг IMDb рядом с фильмами и сериалами. Сервер (/api/imdb, functions/_lib/imdb.js) находит код фильма
   по названию и году и спрашивает OMDb; здесь — плашка «IMDb 7,6», строка «IMDb · Rotten Tomatoes · Metacritic» для карточки
   и запоминание ответов в браузере на неделю. Запросы со всей страницы собираются в один. */
(() => {
  const KEY = 'casualhub.imdb.v2', WEEK = 7 * 864e5, DAY = 864e5;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  try { localStorage.removeItem('casualhub.imdb.v1'); } catch (e) {}
  let store = read(), saveT = 0;
  const keep = () => { clearTimeout(saveT); saveT = setTimeout(() => {
    // старое и лишнее не держим: не больше 1500 фильмов
    const e = Object.entries(store).filter(([, v]) => v && Date.now() - v.at < WEEK).sort((a, b) => b[1].at - a[1].at).slice(0, 1500);
    store = Object.fromEntries(e);
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (er) {}
  }, 300); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const yearOf = (meta) => { const m = /\b(19|20)\d{2}\b/.exec(String(meta || '')); return m ? +m[0] : 0; };
  // ключ фильма: код IMDb, если он известен, иначе название и год
  const keyOf = (x) => (x.id && /^tt\d+$/.test(x.id) ? x.id : String(x.name || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ') + '|' + (x.year || ''));
  const token = () => { try { const u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null'); return u ? (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || '{}') || {})[u.id] || '' : ''; } catch (e) { return ''; } };

  let queue = new Map(), waiters = [], timer = 0, off = false;
  async function flush() {
    timer = 0;
    const batch = [...queue.values()].slice(0, 40), ws = waiters;
    queue = new Map(); waiters = [];
    if (batch.length && !off) {
      try {
        const r = await fetch('/api/imdb', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() }, body: JSON.stringify({ items: batch }) });
        const d = r.ok ? await r.json() : null;
        if (d && d.on === false) off = true; // ключ OMDb на сервере не задан: больше не спрашиваем
        if (d && d.items) for (const x of batch) if (x.k in d.items) store[x.k] = { d: d.items[x.k], at: d.items[x.k] ? Date.now() : Date.now() - WEEK + DAY };
        keep();
      } catch (e) {}
    }
    ws.forEach((f) => f());
  }
  // items: [{ id?, name, year? }] → Map(ключ → { id, r, v, rt, mc } | null). Что уже известно — сразу, остальное после ответа сервера
  function want(items) {
    const out = new Map(), need = [];
    for (const x of items) {
      const k = keyOf(x);
      const s = store[k];
      if (s && Date.now() - s.at < WEEK) { out.set(k, s.d); continue; }
      if (!queue.has(k)) need.push({ k, id: x.id || '', name: x.name || '', year: x.year || 0 });
    }
    if (!need.length || off) return Promise.resolve(out);
    need.forEach((x) => queue.set(x.k, x));
    return new Promise((res) => {
      waiters.push(() => { for (const x of items) { const s = store[keyOf(x)]; if (s) out.set(keyOf(x), s.d); } res(out); });
      if (!timer) timer = setTimeout(flush, 60);
    });
  }
  // что уже известно о фильме, без запроса: undefined — пока неизвестно
  function peek(x) { const s = store[keyOf(x)]; return s && Date.now() - s.at < WEEK ? s.d : undefined; }
  // пустые места .imdb-slot на странице (data-imdb-id или data-imdb-n + data-imdb-y) заполняются плашками одним запросом
  function fill(root) {
    const slots = [...(root || document).querySelectorAll('.imdb-slot:empty:not([data-done])')].slice(0, 80);
    if (!slots.length) return;
    const items = slots.map((s) => ({ id: s.dataset.imdbId || '', name: s.dataset.imdbN || '', year: +s.dataset.imdbY || 0 }));
    slots.forEach((s) => s.setAttribute('data-done', ''));
    want(items).then((m) => slots.forEach((s, i) => { if (s.isConnected) s.innerHTML = s.dataset.imdbRow ? row(m.get(keyOf(items[i]))) : badge(m.get(keyOf(items[i]))); }));
  }
  const votes = (v) => (v >= 1e6 ? `${fmt(v / 1e6)} млн голосов` : v >= 1000 ? `${Math.round(v / 1000)} тыс. голосов` : `${v} голосов`);
  // маленькая плашка для списков
  function badge(d) {
    if (!d || d.r == null) return '';
    return `<a class="imdb-b" href="https://www.imdb.com/title/${esc(d.id)}/" target="_blank" rel="noopener noreferrer" title="Рейтинг IMDb ${fmt(d.r)}${d.v ? ' · ' + votes(d.v) : ''}" onclick="event.stopPropagation()">IMDb <b>${fmt(d.r)}</b></a>`;
  }
  // строка для карточки оценки: IMDb, Rotten Tomatoes, Metacritic
  function row(d) {
    if (!d || (d.r == null && !d.rt && d.mc == null)) return '';
    return `<div class="imdb-row">${badge(d)}${d.v ? `<small>${votes(d.v)}</small>` : ''}${d.rt ? `<span class="imdb-o" title="Rotten Tomatoes: доля положительных рецензий критиков">Rotten Tomatoes <b>${esc(d.rt)}</b></span>` : ''}${d.mc != null ? `<span class="imdb-o" title="Metacritic: средняя оценка критиков из 100">Metacritic <b>${d.mc}</b></span>` : ''}</div>`;
  }
  // фильм ли это: по названию категории, как в остальных местах сайта
  const isMovie = (cat) => /фильм|сериал|кино|мульт|film|movie|series|cartoon|animat/i.test(String(cat || '')) && !/аниме|anime/i.test(String(cat || ''));

  const css = document.createElement('style');
  css.textContent = `
.imdb-slot:empty { display: none; }
.imdb-b { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 6px; border-radius: 5px; background: #F5C518; color: #000; font: 800 11px/1 var(--font-body, system-ui, sans-serif); letter-spacing: .02em; text-decoration: none; white-space: nowrap; vertical-align: middle; }
.imdb-b b { font-weight: 800; font-size: 12px; }
.imdb-b:hover { filter: brightness(1.06); }
.imdb-b:focus-visible { outline: 2px solid var(--accent, #3550E8); outline-offset: 2px; }
.imdb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; color: var(--ink-2, #a3a9b8); }
.imdb-row .imdb-b { height: 24px; font-size: 12px; } .imdb-row .imdb-b b { font-size: 14px; }
.imdb-slot .imdb-row { margin: 2px 0 10px; }
.imdb-o b { color: var(--ink, #e8eaf0); font-weight: 700; }`;
  document.head.appendChild(css);

  window.CasualIMDb = { want, peek, fill, badge, row, keyOf, yearOf, isMovie };
})();
