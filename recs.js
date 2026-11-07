/* Казуал Хаб: «Тебе может понравиться» на главной. Сервер (/api/recs, functions/_lib/recs.js) смотрит на твои оценки и подбирает похожее:
   фильмы и игры по Wikidata, аниме по рекомендациям AniList, плюс то, что друзья оценили высоко, а у тебя этого нет.
   «В планы» и «Оценить» — те же, что у чужой оценки (rating-card.js), ✕ убирает совет насовсем. */
(() => {
  const box = document.getElementById('recs');
  if (!box) return;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const user = read('ocenshik.user.v1');
  const token = user && (read('casualhub.tokens.v1') || {})[user.id];
  if (!token) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const api = (path, o = {}) => fetch('/api' + path, { ...o, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  const KIND = { movie: 'фильм', game: 'игра', anime: 'аниме' };
  const TABS = [['all', 'Всё'], ['movie', 'Фильмы'], ['game', 'Игры'], ['anime', 'Аниме'], ['friends', 'От друзей']];
  const row = document.getElementById('recsRow'), tabs = document.getElementById('recsTabs'), note = document.getElementById('recsNote');
  let data = null, tab = 'all';
  const items = new Map(); // key -> совет

  // «Всё»: по очереди из каждого вида, чтобы не было десяти фильмов подряд
  function listOf(t) {
    if (t !== 'all') return data[t] || [];
    const lists = ['friends', 'movie', 'anime', 'game'].map((k) => (data[k] || []).slice());
    const out = [];
    while (out.length < 16 && lists.some((l) => l.length)) lists.forEach((l) => { if (l.length && out.length < 16) out.push(l.shift()); });
    return out;
  }
  const infoUrl = (x) => (x.kind === 'movie' && /^tt\d+$/.test(x.code) ? `https://www.imdb.com/title/${x.code}/` : x.kind === 'game' && /^\d+$/.test(x.code) ? `https://store.steampowered.com/app/${x.code}/` : x.kind === 'anime' && /^\d+$/.test(x.code) ? `https://anilist.co/anime/${x.code}` : '');
  function tile(x) {
    const friend = x.key.startsWith('f:');
    const why = friend
      ? x.by.slice(0, 2).map((b) => `${esc(b.name)}: ${fmt(b.total)}`).join(', ') + (x.by.length > 2 ? ` и ещё ${x.by.length - 2}` : '')
      : `похоже на «${esc(x.why)}»`;
    const meta = [x.year || '', KIND[x.kind] || ''].filter(Boolean).join(' · ');
    const pic = x.art ? `<img src="${esc(x.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span>${esc([...String(x.title)][0] || '?')}</span>`;
    const url = friend ? '' : infoUrl(x);
    const pc = friend
      ? `<button type="button" class="rt-pic" data-rec-open title="Открыть оценку друга"${x.remote && !x.art ? ` data-ph="${esc(x.by[0].id + '|' + x.by[0].rid)}"` : ''}>${pic}</button>`
      : url ? `<a class="rt-pic" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Подробнее">${pic}</a>` : `<span class="rt-pic">${pic}</span>`;
    return `<article class="rt" data-key="${esc(x.key)}">
      ${pc}<button type="button" class="rt-x" data-rec-hide title="Не интересно" aria-label="Не интересно: ${esc(x.title)}">✕</button>
      <b class="rt-t" title="${esc(x.title)}${x.orig ? ' / ' + esc(x.orig) : ''}">${esc(x.title)}</b>
      <small class="rt-m">${esc(meta)}</small>
      <small class="rt-why">${why}</small>
      <span class="rt-acts"><button type="button" class="rt-b" data-rec="plan">В планы</button><button type="button" class="rt-b primary" data-rec="rate">Оценить</button></span>
    </article>`;
  }
  function paint() {
    const have = TABS.filter(([k]) => k === 'all' || (data[k] || []).length);
    if (have.length <= 1) { box.hidden = true; return; }
    if (!have.some(([k]) => k === tab)) tab = 'all';
    tabs.innerHTML = have.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join('');
    const list = listOf(tab);
    list.forEach((x) => items.set(x.key, x));
    row.innerHTML = list.map(tile).join('');
    row.scrollLeft = 0;
    // фото друга, загруженное файлом, подтягиваем превью
    row.querySelectorAll('[data-ph]').forEach((el) => {
      const [u, id] = el.dataset.ph.split('|');
      api(`/photo/${encodeURIComponent(u)}/${encodeURIComponent(id)}?thumb=1`).then((d) => { if (d && d.data && el.isConnected) el.innerHTML = `<img src="${esc(d.data)}" alt="">`; }, () => {});
    });
    // обложка не открылась: вместо неё первая буква названия
    row.querySelectorAll('.rt').forEach((t) => { const img = t.querySelector('.rt-pic img'), x = items.get(t.dataset.key); if (img && x) img.onerror = () => { const s = document.createElement('span'); s.textContent = [...String(x.title)][0] || '?'; img.replaceWith(s); }; });
    box.hidden = false;
  }
  // совет как оценка: «В планы» и «Оценить» из rating-card.js принимают её так же, как чужую оценку
  const asRating = (x) => x.key.startsWith('f:')
    ? { id: x.by[0].rid, name: x.title, catName: x.cat, meta: x.meta || (x.year ? String(x.year) : ''), photo: x.art ? { url: x.art } : x.remote ? { remote: true } : null }
    : { name: x.title, catName: x.cat, meta: x.year ? String(x.year) : '', photo: x.art ? { url: x.art } : null };
  const forget = (key) => {
    ['movie', 'game', 'anime', 'friends'].forEach((k) => { if (data[k]) data[k] = data[k].filter((x) => x.key !== key); });
  };
  row.addEventListener('click', async (e) => {
    const t = e.target.closest('.rt');
    if (!t) return;
    const x = items.get(t.dataset.key);
    if (!x) return;
    if (e.target.closest('[data-rec-hide]')) {
      t.classList.add('gone');
      forget(x.key);
      api('/recs/hide', { method: 'POST', body: JSON.stringify({ key: x.key }) }).catch(() => {});
      setTimeout(paint, 220);
      return;
    }
    if (e.target.closest('[data-rec-open]') && window.CasualRatingCard) {
      window.CasualRatingCard.open({ uid: x.by[0].id, rid: x.by[0].rid, who: x.by[0].name, handle: x.by[0].handle, preview: { name: x.title, cat: x.cat, total: x.by[0].total } });
      return;
    }
    const b = e.target.closest('[data-rec]');
    if (!b || !window.CasualRatingCard) return;
    b.disabled = true;
    const ok = await window.CasualRatingCard.take(asRating(x), b.dataset.rec, x.key.startsWith('f:') ? x.by[0].id : undefined);
    b.disabled = false;
    if (ok && b.dataset.rec === 'plan') {
      t.querySelector('.rt-acts').innerHTML = '<span class="rt-done">В планах ✓</span>';
      forget(x.key);
    }
  });
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b || b.dataset.tab === tab) return; tab = b.dataset.tab; paint(); });
  document.getElementById('recsMore').addEventListener('click', () => load(true));

  async function load(fresh) {
    box.hidden = false;
    box.classList.add('loading');
    if (!data || fresh) row.innerHTML = Array.from({ length: 6 }, () => '<article class="rt sk"><span class="rt-pic"></span><b class="rt-t"></b><small class="rt-m"></small></article>').join('');
    note.textContent = 'Подбираю по твоим оценкам…';
    try {
      data = await api('/recs' + (fresh ? '?fresh=1' : ''));
      note.textContent = '';
      paint();
    } catch (e) {
      if (!data) box.hidden = true;
      note.textContent = '';
    }
    box.classList.remove('loading');
  }
  load(false);
})();
