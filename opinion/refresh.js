/* Казуал Хаб, Мнение: окно «Обновить обложки и названия».
   Выбираешь категорию и оценки, сайт сам находит к ним обложку, русское название, год и основные жанры.
   Ищет через наш сервер (нужен вход): фильмы и сериалы — IMDb и Wikidata, игры — Steam, аниме — AniList, книги — Open Library.
   Своё загруженное фото не заменяется: обложка ставится, только если фото нет или это ссылка на постер. */
(() => {
  const KINDS = { movie: 1, game: 1, anime: 1, book: 1 };
  const CYR = /[а-яё]/i;
  const S = { cat: '', sel: new Set(), opt: { cover: true, name: false, meta: true }, busy: false, res: {} };
  let sheet = null;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cats = () => state.cats.filter((c) => KINDS[catKind(c)]);
  const items = () => state.ratings.filter((r) => r && !r.example && r.cat === S.cat).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const linkPhoto = (p) => !!p && ((typeof p.id === 'string' && /^https:\/\//.test(p.id)) || (typeof p.url === 'string' && /^https:\/\//.test(p.url)));
  const yearOf = (r) => (String(r.meta || '').match(/\b(18|19|20)\d{2}\b/) || [''])[0];
  const fromLb = (r) => r.src === 'letterboxd' || r.scores.some((s) => s.id === 'lb-score');

  function ensure() {
    if (sheet) return;
    sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.id = 'rfSheet';
    sheet.hidden = true;
    sheet.innerHTML = `<div class="sheet-card rf-card" role="dialog" aria-modal="true" aria-labelledby="rfTitle">
      <div class="sheet-head"><h3 id="rfTitle">Обновить обложки и названия</h3><button type="button" class="mini-btn" data-rf="close" aria-label="Закрыть">✕</button></div>
      <div class="rf-body" id="rfBody"></div></div>`;
    document.body.appendChild(sheet);
    const css = document.createElement('style');
    css.textContent = `.rf-card { display: grid; gap: 12px; }
.rf-body { display: grid; gap: 12px; min-width: 0; }
.rf-cat { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; }
.rf-cat select { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); color: var(--ink); font: inherit; font-weight: 600; }
.rf-opts { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); }
.rf-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.rf-opt input, .rf-list input { width: 18px; height: 18px; flex: none; accent-color: var(--accent); }
.rf-opt small { color: var(--ink-3); font-weight: 500; }
.rf-quick { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); }
.rf-quick button { padding: 4px 10px; border: 1px solid var(--line); border-radius: 99px; background: var(--panel); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
.rf-quick button:hover { border-color: var(--accent); }
.rf-list { display: grid; gap: 4px; max-height: min(46vh, 380px); overflow: auto; margin: 0; padding: 0; list-style: none; }
.rf-list li { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); font-size: 13.5px; }
.rf-list label { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; cursor: pointer; }
.rf-th { flex: none; width: 30px; height: 40px; border-radius: 6px; overflow: hidden; display: grid; place-items: center; background: var(--panel-2); color: var(--ink-3); font-weight: 800; }
.rf-th img { width: 100%; height: 100%; object-fit: cover; }
.rf-nm { min-width: 0; display: grid; }
.rf-nm b { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf-nm small { color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf-st { flex: none; max-width: 42%; font-style: normal; font-size: 12px; font-weight: 700; color: var(--ink-3); text-align: right; }
.rf-st.ok { color: var(--good, #2EAD60); }
.rf-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.rf-note { margin: 0; font-size: 12.5px; color: var(--ink-3); }`;
    document.head.appendChild(css);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) return close();
      const b = e.target.closest('[data-rf]');
      if (!b) return;
      const a = b.dataset.rf;
      if (a === 'close') return close();
      if (a === 'login') { close(); if (typeof openAuthModal === 'function') openAuthModal('login'); return; }
      if (a === 'go') return run();
      if (S.busy) return;
      const list = items();
      if (a === 'all') list.forEach((r) => S.sel.add(r.id));
      if (a === 'none') S.sel.clear();
      if (a === 'nophoto') { S.sel.clear(); list.filter((r) => !r.photo).forEach((r) => S.sel.add(r.id)); }
      if (a === 'lb') { S.sel.clear(); list.filter(fromLb).forEach((r) => S.sel.add(r.id)); }
      draw();
    });
    sheet.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'rfCat') { S.cat = t.value; preselect(); S.res = {}; draw(); return; }
      if (t.dataset.opt) { S.opt[t.dataset.opt] = t.checked; drawGo(); return; }
      if (t.dataset.id) { if (t.checked) S.sel.add(t.dataset.id); else S.sel.delete(t.dataset.id); drawGo(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet && !sheet.hidden) close(); });
  }
  function preselect() {
    S.sel.clear();
    items().filter((r) => !r.photo).forEach((r) => S.sel.add(r.id));
  }
  function open() {
    ensure();
    if (typeof closeAuthModal === 'function') closeAuthModal();
    const list = cats();
    if (!list.some((c) => c.id === S.cat)) {
      // по умолчанию — категория, где больше всего оценок без обложки
      const miss = (c) => state.ratings.filter((r) => r && !r.example && r.cat === c.id && !r.photo).length;
      S.cat = list.length ? list.slice().sort((a, b) => miss(b) - miss(a))[0].id : '';
      preselect();
    }
    S.res = {};
    sheet.hidden = false;
    document.documentElement.classList.add('locked');
    draw();
  }
  function close() {
    if (!sheet) return;
    sheet.hidden = true;
    document.documentElement.classList.remove('locked');
  }
  const body = () => sheet.querySelector('#rfBody');
  function thumb(r) {
    const u = r.photo && typeof resolvePhotoUrl === 'function' ? resolvePhotoUrl(r.photo) : '';
    return `<span class="rf-th">${u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : esc([...r.name.trim()][0] || '?')}</span>`;
  }
  function draw() {
    const api = window.casualApi;
    const list = cats();
    if (!list.length) {
      body().innerHTML = '<p class="rf-note">Нет подходящих категорий. Обновлять можно фильмы и сериалы, игры, аниме и книги — заведи такую категорию в Мнении.</p>';
      return;
    }
    const online = !!(api && api.online());
    const rs = items();
    body().innerHTML = `<label class="rf-cat">Категория <select id="rfCat"${S.busy ? ' disabled' : ''}>${list.map((c) => `<option value="${esc(c.id)}"${c.id === S.cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="rf-opts">
        <label class="rf-opt"><input type="checkbox" data-opt="cover"${S.opt.cover ? ' checked' : ''}${S.busy ? ' disabled' : ''}> Обложка <small>— если фото нет; своё фото не трогается</small></label>
        <label class="rf-opt"><input type="checkbox" data-opt="name"${S.opt.name ? ' checked' : ''}${S.busy ? ' disabled' : ''}> Название по-русски <small>— фильмы и игры</small></label>
        <label class="rf-opt"><input type="checkbox" data-opt="meta"${S.opt.meta ? ' checked' : ''}${S.busy ? ' disabled' : ''}> Год и жанры в описание</label>
      </div>
      ${rs.length ? `<div class="rf-quick">Выбрать: <button type="button" data-rf="all">все</button><button type="button" data-rf="nophoto">без обложки</button>${rs.some(fromLb) ? '<button type="button" data-rf="lb">из Letterboxd</button>' : ''}<button type="button" data-rf="none">снять</button></div>
      <ul class="rf-list">${rs.map((r) => { const st = S.res[r.id]; return `<li><label><input type="checkbox" data-id="${esc(r.id)}"${S.sel.has(r.id) ? ' checked' : ''}${S.busy ? ' disabled' : ''}>${thumb(r)}<span class="rf-nm"><b>${esc(r.name)}</b><small>${esc(r.meta || '—')}</small></span></label>${st ? `<em class="rf-st${st.ok ? ' ok' : ''}">${esc(st.text)}</em>` : ''}</li>`; }).join('')}</ul>`
        : '<p class="rf-note">В этой категории пока нет оценок.</p>'}
      ${online ? '' : '<p class="rf-note">Поиск идёт через сервер сайта, поэтому нужно войти в аккаунт.</p>'}
      <div class="rf-acts">${online ? '<button type="button" class="btn primary" data-rf="go" id="rfGo"></button>' : '<button type="button" class="btn primary" data-rf="login">Войти</button>'}<button type="button" class="btn ghost" data-rf="close">${S.busy ? 'Свернуть' : 'Закрыть'}</button></div>
      <p class="rf-note">Совпадение ищется по названию и году. Если уверенного совпадения нет, оценка не меняется.</p>`;
    drawGo();
  }
  function drawGo() {
    const b = sheet && sheet.querySelector('#rfGo');
    if (!b) return;
    const n = items().filter((r) => S.sel.has(r.id)).length;
    const any = S.opt.cover || S.opt.name || S.opt.meta;
    b.disabled = S.busy || !n || !any;
    b.textContent = S.busy ? 'Обновляю…' : n ? `Обновить ${n}` : 'Выбери оценки';
  }
  function mark(id, text, ok) {
    S.res[id] = { text, ok: !!ok };
    if (!sheet || sheet.hidden) return;
    const li = sheet.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!li) return;
    let em = li.closest('li').querySelector('.rf-st');
    if (!em) { em = document.createElement('em'); li.closest('li').appendChild(em); }
    em.className = 'rf-st' + (ok ? ' ok' : '');
    em.textContent = text;
  }

  // одна оценка: ищем обложку, берём уверенное совпадение и меняем только то, что выбрано
  async function refreshOne(r, kind) {
    const api = window.casualApi;
    const year = kind === 'game' ? '' : yearOf(r); // у Steam в поиске нет года
    const found = ((await api.get(`/covers?kind=${kind}&q=${encodeURIComponent(r.name)}`)) || {}).items || [];
    const pick = window.CasualLetterboxd.pickPoster(found, r.name, year)
      // по-русски сервер ищет по переведённому названию — тогда сравнить названия нельзя, сверяем год
      || (CYR.test(r.name) ? (year ? found.find((c) => c.year === year) : found[0]) : null);
    if (!pick) return { text: 'не нашлось' };
    const did = [];
    if (S.opt.cover && /^https:\/\//.test(pick.art) && (!r.photo || linkPhoto(r.photo)) && !(r.photo && r.photo.id === pick.art)) {
      r.photo = { id: pick.art, url: pick.art, data: '', w: 600, h: 900 };
      did.push('обложка');
    }
    let info = { ru: '', genres: Array.isArray(pick.genres) ? pick.genres : [] };
    if ((S.opt.name || S.opt.meta) && pick.id && (kind === 'movie' || kind === 'game')) {
      try { info = Object.assign(info, await api.get(`/covers/info?kind=${kind}&id=${encodeURIComponent(pick.id)}`)); }
      catch (e) { if (e && e.status === 429) throw e; }
    }
    let touched = false;
    const ru = String(info.ru || '').trim().slice(0, 140);
    if (S.opt.name && ru && ru !== r.name && !state.ratings.some((x) => x !== r && x.cat === r.cat && x.nameKey === keyOf(ru))) {
      if (fromLb(r) && !r.lbName) r.lbName = r.name; // повторный импорт из Letterboxd узнает фильм и под новым названием
      r.name = ru;
      r.nameKey = keyOf(ru);
      did.push('название');
      touched = true;
    }
    if (S.opt.meta) {
      const y = pick.year || yearOf(r);
      const genres = (info.genres || []).map((g) => String(g).toLowerCase());
      // теги и прочее, что уже было в описании, остаются после года и жанров
      const rest = String(r.meta || '').split(/\s*,\s*/).filter((p) => p && !/^(18|19|20)\d{2}$/.test(p) && !genres.includes(p.toLowerCase()));
      const meta = [y, ...genres, ...rest].filter(Boolean).join(', ').slice(0, 80);
      if (meta && meta !== r.meta) { r.meta = meta; did.push(genres.length ? 'жанры' : 'год'); touched = true; }
    }
    // название и описание меняются и на других устройствах: оценка становится чуть новее (без сдвига в списке)
    if (touched) r.updatedAt = new Date((+new Date(r.updatedAt || r.createdAt || 0) || Date.now()) + 1000).toISOString();
    return did.length ? { text: '✓ ' + did.join(', '), ok: true, changed: true } : { text: 'уже актуально', ok: true };
  }
  async function run() {
    const api = window.casualApi;
    if (S.busy || !api || !api.online()) return;
    const ids = items().filter((r) => S.sel.has(r.id)).map((r) => r.id);
    const kind = catKind(state.cats.find((c) => c.id === S.cat));
    if (!ids.length || !KINDS[kind]) return;
    S.busy = true;
    S.res = {};
    draw();
    let changed = 0, done = 0;
    for (let i = 0; i < ids.length; i++) {
      const r = state.ratings.find((x) => x.id === ids[i]);
      if (!r) continue;
      mark(r.id, '…');
      let out;
      try { out = await refreshOne(r, kind); }
      catch (e) {
        if (e && e.status === 429) { mark(r.id, 'жду минуту…'); await wait(65e3); i--; continue; }
        out = { text: 'сервер не ответил' };
      }
      done++;
      mark(r.id, out.text, out.ok);
      if (out.changed && ++changed % 5 === 0) { saveLocalRatings(); renderBoard(); }
      await wait(1300); // поиск на сервере — до 40 запросов в минуту
    }
    if (changed) { saveLocalRatings(); renderBoard(); }
    S.busy = false;
    if (sheet && !sheet.hidden) draw();
    if (typeof toast === 'function') toast(changed ? `Обновлено: ${changed} из ${done}` : 'Менять нечего — всё уже на месте');
  }

  // пункт «Обновить» в меню ☰ и ссылка /opinion/#refresh
  document.addEventListener('click', (e) => { if (e.target.closest('[data-refresh-open]')) { e.preventDefault(); open(); } });
  window.CasualRefresh = { open };
})();
