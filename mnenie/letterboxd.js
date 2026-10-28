/* Мнение: импорт оценок из Letterboxd.
   Letterboxd отдаёт все данные архивом: Settings → Import & Export → Export Your Data (ZIP с CSV).
   Принимаем весь ZIP или отдельные CSV (ratings, reviews, diary, watched). Звёзды 0,5–5 становятся баллами 1–10,
   фильм — оценкой в «Фильмах и сериалах» с одним критерием «Оценка с Letterboxd» (детальных критериев там нет),
   рецензия — заметкой, год и теги — в «Год / Жанр / Теги». Уже оценённые фильмы пропускаются.
   Работает поверх основного скрипта Мнения: берёт state, normalizeRating, saveLocalRatings и помощники оттуда. */
(() => {
  const FILES = ['ratings.csv', 'reviews.csv', 'diary.csv', 'watched.csv'];
  const SCORE_ID = 'lb-score';

  // ---------- ZIP: читаем центральный каталог, распаковываем нужные файлы (deflate — встроенным DecompressionStream) ----------
  async function unzip(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Это не ZIP-архив');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const out = {};
    for (let k = 0; k < count && p + 46 <= buf.length; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      // только файлы в корне архива: в папке deleted/ лежат удалённые записи с такими же именами
      if (name.includes('/') || !FILES.includes(name.toLowerCase())) continue;
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const data = buf.subarray(start, start + size);
      let bytes;
      if (method === 0) bytes = data;
      else if (method === 8 && typeof DecompressionStream === 'function') bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else continue;
      out[name.toLowerCase()] = dec.decode(bytes);
    }
    return out;
  }

  // ---------- CSV: кавычки, запятые и переносы строк внутри рецензий ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    const t = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    return { head, rows: rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()]))) };
  }
  // какой это файл, понимаем по заголовкам: имя файла при загрузке по одному может быть любым
  function kindOf(head) {
    if (head.includes('review')) return 'reviews';
    if (head.includes('watched date')) return 'diary';
    if (head.includes('rating')) return 'ratings';
    if (head.includes('name') && head.includes('year')) return 'watched';
    return '';
  }
  const cleanText = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').trim();

  // ---------- собираем фильмы: оценка из ratings, рецензия и теги из reviews / diary ----------
  function collect(parts) {
    const has = (k) => parts.some((x) => x.kind === k);
    const byKey = new Map();
    const order = ['ratings', 'diary', 'reviews', 'watched'];
    parts.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    for (const part of parts) {
      for (const row of part.rows) {
        const name = row.name;
        if (!name) continue;
        const year = (row.year || '').slice(0, 4);
        const key = keyOf(name) + '|' + year;
        const cur = byKey.get(key) || { name, year, rating: 0, date: '', review: '', tags: '' };
        const rt = parseFloat(String(row.rating || '').replace(',', '.'));
        const date = row['watched date'] || row.date || '';
        if (rt > 0) {
          // текущая оценка — из ratings.csv; без него берём самую свежую запись дневника
          if (part.kind === 'ratings' || (!has('ratings') && (!cur.rating || date >= cur.date))) { cur.rating = rt; if (date) cur.date = date; }
        }
        if (!cur.date && date) cur.date = date;
        if (row.review && !cur.review) cur.review = cleanText(row.review);
        if (row.tags && !cur.tags) cur.tags = row.tags;
        byKey.set(key, cur);
      }
    }
    const all = [...byKey.values()];
    return { rated: all.filter((x) => x.rating > 0), unrated: all.filter((x) => !(x.rating > 0)).length };
  }

  // ---------- куда класть: «Фильмы и сериалы» (или категория с фильмами), нет — создаём встроенную ----------
  function filmCat() {
    let c = state.cats.find((x) => x.id === 'films') || state.cats.find((x) => /фильм|кино|сериал/.test(keyOf(x.name)));
    if (!c) {
      const s = STARTERS.find((x) => x.id === 'films');
      c = clone(s);
      state.cats.push(c);
      saveLocalCats();
      renderCats();
    }
    return c;
  }
  const scoreOf = (stars) => Math.max(1, Math.min(10, Math.round(stars * 2)));
  const isoOf = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00:00.000Z' : new Date().toISOString());

  // ---------- окно ----------
  let sheet = null, plan = null;
  function ensure() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.id = 'lbSheet';
    sheet.hidden = true;
    sheet.innerHTML = `<div class="sheet-card lb-card" role="dialog" aria-modal="true" aria-labelledby="lbTitle">
      <div class="sheet-head"><h3 id="lbTitle">Импорт из Letterboxd</h3><button type="button" class="mini-btn" data-lb="close" aria-label="Закрыть">✕</button></div>
      <div class="lb-body" id="lbBody"></div></div>`;
    document.body.appendChild(sheet);
    const css = document.createElement('style');
    css.textContent = `.lb-card { display: grid; gap: 14px; }
.lb-body { display: grid; gap: 12px; }
.lb-steps { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14px; color: var(--ink-2); }
.lb-steps b { color: var(--ink); }
.lb-drop { display: grid; place-items: center; gap: 6px; padding: 22px 14px; border: 1.5px dashed var(--line); border-radius: 14px; background: var(--panel-2); text-align: center; cursor: pointer; transition: border-color .15s, background-color .15s; }
.lb-drop:hover, .lb-drop.drag { border-color: var(--accent); }
.lb-drop strong { font-size: 15px; }
.lb-drop small { color: var(--ink-3); font-size: 12.5px; }
.lb-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.lb-sum div { padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); }
.lb-sum b { display: block; font-family: var(--font-display); font-size: 28px; line-height: 1; }
.lb-sum small { color: var(--ink-2); font-size: 12px; }
.lb-list { display: grid; gap: 4px; max-height: 260px; overflow: auto; margin: 0; padding: 0; list-style: none; }
.lb-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); font-size: 13.5px; }
.lb-list li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-list li small { color: var(--ink-3); margin-left: 6px; }
.lb-list li.dup { opacity: .55; }
.lb-catpick { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; }
.lb-catpick select { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); color: var(--ink); font: inherit; font-weight: 600; }
.lb-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.lb-opt input { width: 18px; height: 18px; accent-color: var(--accent); }
.lb-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.lb-note { margin: 0; font-size: 12.5px; color: var(--ink-3); }
.lb-err { margin: 0; color: var(--bad-ink, var(--bad)); font-size: 13.5px; font-weight: 600; }
@media (max-width: 480px) { .lb-sum b { font-size: 22px; } }`;
    document.head.appendChild(css);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) return close();
      const b = e.target.closest('[data-lb]');
      if (!b) return;
      if (b.dataset.lb === 'close') close();
      if (b.dataset.lb === 'pick') sheet.querySelector('#lbFile').click();
      if (b.dataset.lb === 'back') drawStart();
      if (b.dataset.lb === 'go') runImport();
    });
    sheet.addEventListener('change', (e) => {
      if (e.target.id === 'lbFile') readFiles([...e.target.files]);
      // другая категория: заново смотрим, какие фильмы в ней уже есть
      if (e.target.id === 'lbCat' && plan) {
        const cat = state.cats.find((c) => c.id === e.target.value);
        if (!cat) return;
        plan.cat = cat;
        const have = new Set(state.ratings.filter((r) => !r.example && catKey(r) === keyOf(cat.name)).flatMap((r) => [r.nameKey, r.lbName ? keyOf(r.lbName) : ''].filter(Boolean)));
        plan.items.forEach((x) => { x.dup = have.has(keyOf(x.name)); });
        drawPlan();
      }
    });
    sheet.addEventListener('dragover', (e) => { const d = e.target.closest('.lb-drop'); if (d) { e.preventDefault(); d.classList.add('drag'); } });
    sheet.addEventListener('dragleave', (e) => { const d = e.target.closest('.lb-drop'); if (d) d.classList.remove('drag'); });
    sheet.addEventListener('drop', (e) => { const d = e.target.closest('.lb-drop'); if (!d) return; e.preventDefault(); d.classList.remove('drag'); readFiles([...(e.dataTransfer.files || [])]); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
    return sheet;
  }
  function open() {
    ensure();
    if (typeof closeAuthModal === 'function') closeAuthModal();
    sheet.hidden = false;
    document.documentElement.classList.add('locked');
    drawStart();
  }
  function close() {
    if (!sheet) return;
    sheet.hidden = true;
    document.documentElement.classList.remove('locked');
    plan = null;
  }
  const body = () => sheet.querySelector('#lbBody');
  function drawStart(err) {
    body().innerHTML = `<ol class="lb-steps">
        <li>На Letterboxd открой <b>Settings → Import & Export</b> и нажми <b>Export Your Data</b>: скачается ZIP-архив.</li>
        <li>Загрузи этот архив сюда целиком или только файл <b>ratings.csv</b> из него.</li>
      </ol>
      <div class="lb-drop" data-lb="pick" role="button" tabindex="0"><strong>📦 Выбрать архив или CSV</strong><small>или перетащи файл сюда</small></div>
      <input type="file" id="lbFile" class="vh" accept=".zip,.csv,application/zip,text/csv" multiple>
      ${err ? `<p class="lb-err" role="alert">${esc(err)}</p>` : ''}
      <p class="lb-note">Звёзды Letterboxd станут баллами от 1 до 10 (½ звезды = 1, 5 звёзд = 10). Фильмы, которые уже есть в рейтинге, не трогаются.</p>`;
  }
  async function readFiles(files) {
    if (!files.length) return;
    body().innerHTML = '<p class="lb-note">Читаю файл…</p>';
    try {
      const parts = [];
      for (const f of files) {
        if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
          const texts = await unzip(f);
          for (const [, text] of Object.entries(texts)) { const p = parseCSV(text); const kind = kindOf(p.head); if (kind) parts.push({ kind, rows: p.rows }); }
        } else {
          const p = parseCSV(await f.text());
          const kind = kindOf(p.head);
          if (kind) parts.push({ kind, rows: p.rows });
        }
      }
      if (!parts.length) return drawStart('В файле не нашлось оценок Letterboxd. Нужен архив из Export Your Data или ratings.csv из него.');
      const { rated, unrated } = collect(parts);
      if (!rated.length) return drawStart(unrated ? `Нашлось ${unrated} ${plural(unrated, 'фильм', 'фильма', 'фильмов')} без оценки: импортировать нечего. Нужны фильмы со звёздами.` : 'В файле не нашлось оценок.');
      const cat = filmCat();
      const have = new Set(state.ratings.filter((r) => !r.example && catKey(r) === keyOf(cat.name)).flatMap((r) => [r.nameKey, r.lbName ? keyOf(r.lbName) : ''].filter(Boolean)));
      plan = { cat, items: rated.map((x) => ({ ...x, dup: have.has(keyOf(x.name)) })).sort((a, b) => (b.date || '').localeCompare(a.date || '')), unrated };
      drawPlan();
    } catch (e) {
      drawStart((e && e.message && /ZIP/.test(e.message)) ? e.message : 'Не получилось прочитать файл. Попробуй ещё раз или загрузи ratings.csv.');
    }
  }
  function drawPlan() {
    const fresh = plan.items.filter((x) => !x.dup), dups = plan.items.length - fresh.length, withReview = fresh.filter((x) => x.review).length;
    body().innerHTML = `<label class="lb-catpick">В категорию <select id="lbCat">${state.cats.filter((c) => !isMusicCat(c)).map((c) => `<option value="${esc(c.id)}"${c.id === plan.cat.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="lb-sum">
        <div><b>${fresh.length}</b><small>${plural(fresh.length, 'новый фильм', 'новых фильма', 'новых фильмов')}</small></div>
        <div><b>${dups}</b><small>уже в рейтинге</small></div>
        <div><b>${plan.unrated}</b><small>без оценки</small></div>
      </div>
      <ul class="lb-list">${plan.items.slice(0, 60).map((x) => `<li class="${x.dup ? 'dup' : ''}"><span>${esc(x.name)}${x.year ? `<small>${esc(x.year)}</small>` : ''}${x.dup ? '<small>уже есть</small>' : ''}</span><span class="badge" data-tier="${tierT(scoreOf(x.rating))}">${scoreOf(x.rating)}</span></li>`).join('')}</ul>
      ${plan.items.length > 60 ? `<p class="lb-note">И ещё ${plan.items.length - 60}.</p>` : ''}
      ${withReview ? `<label class="lb-opt"><input type="checkbox" id="lbReviews" checked> Рецензии — в заметки (${withReview})</label>` : ''}
      <p class="lb-note">Попадут в «${esc(plan.cat.name)}» с одним баллом «Оценка с Letterboxd». Любой фильм потом можно переоценить по критериям: открой его и нажми «Изменить». Обложки подтянутся сами после импорта.</p>
      <div class="lb-acts">${fresh.length ? `<button type="button" class="btn primary" data-lb="go">Импортировать ${fresh.length}</button>` : ''}<button type="button" class="btn ghost" data-lb="back">Другой файл</button></div>`;
  }
  async function runImport() {
    if (!plan) return;
    const reviews = !!(sheet.querySelector('#lbReviews') || {}).checked;
    const fresh = plan.items.filter((x) => !x.dup);
    const cat = plan.cat;
    const author = state.user
      ? { id: state.user.id, name: state.user.name, avatar: state.user.avatar || state.user.name.charAt(0).toUpperCase(), color: state.user.color || '#3550E8' }
      : { name: 'Гость' };
    const docs = fresh.map((x) => {
      const v = scoreOf(x.rating), at = isoOf(x.date);
      return {
        id: newId('r'), cat: cat.id, catName: cat.name, name: x.name.slice(0, 140), nameKey: keyOf(x.name),
        scores: [{ id: SCORE_ID, name: 'Оценка с Letterboxd', v }], total: v, fav: false, status: 'Завершено', src: 'letterboxd',
        meta: [x.year, x.tags].filter(Boolean).join(', ').slice(0, 80), pros: '', cons: '',
        note: reviews ? x.review.slice(0, 4000) : '', example: false, author, createdAt: at, updatedAt: at,
      };
    });
    body().innerHTML = '<p class="lb-note">Добавляю оценки…</p>';
    if (state.mode === 'db') {
      for (const d of docs) { const { id, ...rest } = d; try { await putRating(id, rest); } catch (e) {} }
    } else {
      // примеры уступают место настоящим оценкам
      state.ratings = state.ratings.filter((r) => !r.example).concat(docs.map((d) => normalizeRating(d.id, d)).filter(Boolean).map((r) => Object.assign(r, { author })));
      saveLocalRatings(); // заодно уходит в аккаунт (friends.js)
      renderBoard();
    }
    plan = null;
    body().innerHTML = `<p style="margin:0;font-size:16px;font-weight:700">Готово: добавлено ${docs.length} ${plural(docs.length, 'оценка', 'оценки', 'оценок')} 🎬</p>
      <p class="lb-note">Они в рейтинге, в категории «${esc(cat.name)}». Если войти в аккаунт, оценки увидят и друзья.</p>
      <div class="lb-acts"><button type="button" class="btn primary" data-lb="close">Отлично</button></div>`;
    if (typeof toast === 'function') toast(`Импорт из Letterboxd: ${docs.length} ${plural(docs.length, 'оценка', 'оценки', 'оценок')}`);
    // постеры подтягиваются сами (нужен вход в аккаунт)
    setTimeout(() => fillPosters(true), 2500);
  }

  // ---------- постеры для импортированных фильмов: ищем в IMDb через наш сервер (нужен вход) и ставим ссылкой ----------
  // Адреса постеров IMDb постоянные, поэтому картинку не скачиваем. Ищем по названию и сверяем год, чужой постер не ставим.
  // Идём медленно (лимит поиска на сервере — 40 в минуту), неудачные не повторяем неделю.
  const TRIED_KEY = 'ocenshik.posterTried.v1'; // { id оценки: когда искали }
  const readTried = () => { try { return JSON.parse(localStorage.getItem(TRIED_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const keepTried = (t) => { try { localStorage.setItem(TRIED_KEY, JSON.stringify(t)); } catch (e) {} };
  const flat = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let filling = false;
  function posterTodo() {
    const tried = readTried(), now = Date.now();
    return state.ratings.filter((r) => r && !r.example && !r.photo && (r.src === 'letterboxd' || r.scores.some((x) => x.id === SCORE_ID)) && !(tried[r.id] && now - tried[r.id] < 7 * 864e5));
  }
  function pickPoster(items, name, year) {
    const want = flat(name);
    const same = (c) => flat(c.title) === want;
    const near = (c) => { const t = flat(c.title); return t && (t.includes(want) || want.includes(t)); };
    return items.find((c) => same(c) && (!year || c.year === year))
      || (year ? items.find((c) => near(c) && c.year === year) : null)
      || (year ? items.find((c) => same(c) && Math.abs(+c.year - +year) === 1) : null)
      || null;
  }
  async function fillPosters(announce) {
    const api = window.casualApi;
    if (filling || state.mode === 'db' || !api || !api.online()) return;
    const todo = posterTodo();
    if (!todo.length) return;
    filling = true;
    if (announce && typeof toast === 'function') toast(`Подтягиваю обложки для ${todo.length} ${plural(todo.length, 'фильма', 'фильмов', 'фильмов')} из Letterboxd…`);
    const tried = readTried();
    let found = 0, done = 0;
    for (let i = 0; i < todo.length; i++) {
      const r = state.ratings.find((x) => x.id === todo[i].id);
      if (!r || r.photo) continue;
      const year = (String(r.meta || '').match(/\b(18|19|20)\d{2}\b/) || [''])[0];
      let items;
      try { items = ((await api.get(`/covers?kind=movie&q=${encodeURIComponent(r.name)}`)) || {}).items || []; }
      catch (e) {
        if (e && e.status === 429) { await wait(65e3); i--; continue; } // упёрлись в лимит — ждём минуту и повторяем этот же фильм
        break; // сервер не отвечает — попробуем в следующий раз
      }
      const pick = pickPoster(items, r.name, year);
      tried[r.id] = Date.now();
      if (pick && /^https:\/\//.test(pick.art) && !r.photo) {
        r.photo = { id: pick.art, url: pick.art, data: '', w: 600, h: 900 };
        found++;
      }
      done++;
      if (done % 5 === 0) { keepTried(tried); saveLocalRatings(); renderBoard(); }
      await wait(1600);
    }
    keepTried(tried);
    if (found) { saveLocalRatings(); renderBoard(); }
    filling = false;
    if (announce && typeof toast === 'function') toast(found ? `Обложки: нашлось ${found} из ${done}` : 'Подходящих обложек не нашлось');
  }
  // при заходе в Мнение: дождались входа в аккаунт — подтягиваем, если есть фильмы без постеров
  (async () => {
    for (let k = 0; k < 20; k++) {
      await wait(2000);
      if (window.casualApi && window.casualApi.online()) { if (posterTodo().length) fillPosters(true); return; }
    }
  })();

  // кнопки «Импорт из Letterboxd» в окне аккаунта и ссылка /mnenie/#letterboxd
  document.addEventListener('click', (e) => { if (e.target.closest('[data-lb-open]')) { e.preventDefault(); open(); } });
  window.CasualLetterboxd = { open, parseCSV, unzip, collect, fillPosters, pickPoster };
})();
