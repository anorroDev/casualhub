/* Мнение: импорт игр из Steam (сервер — functions/_lib/steam.js, ключ STEAM_KEY; без ключа кнопок нет).
   Ссылка на свой профиль → список игр по наигранному → отмечаешь, что перенести, и по желанию ставишь балл. С баллом —
   оценка с одним критерием «Оценка при импорте из Steam» (статус «Завершено»), без балла — «В планах». Обложка — из Steam,
   в «Год / Жанр / Теги» — сколько наиграно. Игры, которые уже есть в выбранной категории, не трогаются. Опыт — как за
   импорт (src 'steam' → import в levels.js), а не как за новые оценки. Работает поверх основного скрипта Мнения:
   state, normalizeRating, saveLocalRatings, putRating, renderBoard, keyOf, catKey, newId — оттуда (как letterboxd.js). */
(() => {
  const SCORE_ID = STEAM_SCORE; // app.js: балл импорта, а не критерий категории (IMPORT_SCORES) — переоценка по критериям его заменяет
  const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // баллы критериев в Мнении — целые (normalizeRating → clampInt)
  let sheet = null, plan = null, busy = false;
  const api = () => window.casualApi;

  // кнопки «Импорт из Steam» (их рисует окно аккаунта, когда откроется) видны, только если на сайте есть ключ Steam и человек
  // вошёл: класс sm-on на <html> — правило ниже прячет их до тех пор
  const hide = document.createElement('style');
  hide.textContent = 'html:not(.sm-on) [data-sm-open] { display: none !important; }';
  document.head.appendChild(hide);
  async function reveal() {
    for (let k = 0; k < 20; k++) {
      if (api() && api().online()) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!api() || !api().online()) return;
    try { const d = await api().get('/steam/on'); document.documentElement.classList.toggle('sm-on', !!(d && d.on)); } catch (e) {}
  }

  function ensure() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.id = 'smSheet';
    sheet.hidden = true;
    sheet.innerHTML = `<div class="sheet-card sm-card" role="dialog" aria-modal="true" aria-labelledby="smTitle">
      <div class="sheet-head"><h3 id="smTitle">Импорт из Steam</h3><button type="button" class="mini-btn" data-sm="close" aria-label="Закрыть">✕</button></div>
      <div class="sm-body" id="smBody"></div></div>`;
    document.body.appendChild(sheet);
    const css = document.createElement('style');
    css.textContent = `.sm-card { display: grid; gap: 14px; }
.sm-body { display: grid; gap: 12px; }
.sm-row { display: flex; gap: 8px; flex-wrap: wrap; }
.sm-row .inp { flex: 1 1 220px; min-width: 0; }
.sm-note { margin: 0; font-size: 13px; line-height: 1.45; color: var(--ink-3); }
.sm-err { margin: 0; color: var(--bad-ink, var(--bad)); font-size: 13.5px; font-weight: 600; }
.sm-sum { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between; font-size: 13.5px; }
.sm-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: min(calc(48 * var(--dvh, 1vh)), 440px); overflow-y: auto; }
.sm-list li { display: grid; grid-template-columns: auto 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 10px; }
.sm-list li.dup { opacity: .5; }
.sm-list li:not(.dup):hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.sm-list img, .sm-list .sm-ph { width: 34px; height: 45px; border-radius: 6px; object-fit: cover; background: color-mix(in srgb, var(--ink) 8%, transparent); }
.sm-list .sm-n { min-width: 0; display: grid; gap: 1px; }
.sm-list .sm-n b { font-size: 14px; overflow-wrap: anywhere; }
.sm-list .sm-n small { font-size: 12px; color: var(--ink-3); }
.sm-list select { max-width: 76px; }
.sm-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.sm-cat { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13.5px; }`;
    document.head.appendChild(css);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) return close();
      const b = e.target.closest('[data-sm]');
      if (!b) return;
      const a = b.dataset.sm;
      if (a === 'close') close();
      else if (a === 'find') find();
      else if (a === 'back') drawStart();
      else if (a === 'go') runImport();
      else if (a === 'hours' || a === 'none') { sheet.querySelectorAll('[data-sm-pick]').forEach((c) => { const g = plan.items[+c.dataset.smPick]; c.checked = a === 'hours' && !g.dup && g.hours >= 2; }); drawCount(); }
    });
    sheet.addEventListener('change', (e) => {
      if (e.target.id === 'smCat' && plan) { plan.cat = state.cats.find((c) => c.id === e.target.value) || plan.cat; markDups(); drawPlan(); return; }
      // поставил балл — игра сразу отмечена
      const sc = e.target.closest('[data-sm-score]');
      if (sc && sc.value) { const c = sheet.querySelector(`[data-sm-pick="${sc.dataset.smScore}"]`); if (c && !c.disabled) c.checked = true; }
      drawCount();
    });
    sheet.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'smProfile') { e.preventDefault(); find(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet && !sheet.hidden) close(); });
    return sheet;
  }
  const body = () => sheet.querySelector('#smBody');
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
  function drawStart(err) {
    const online = api() && api().online();
    body().innerHTML = online
      ? `<p class="sm-note">Вставь ссылку на свой профиль Steam — придёт список игр, отсортированный по наигранному. Отметишь, что перенести, и, если хочешь, сразу поставишь балл.</p>
        <div class="sm-row"><input class="inp" id="smProfile" placeholder="steamcommunity.com/id/… или /profiles/…" autocomplete="off" spellcheck="false"><button type="button" class="btn primary" data-sm="find">Найти игры</button></div>
        ${err ? `<p class="sm-err" role="alert">${esc(err)}</p>` : ''}
        <p class="sm-note">Список игр должен быть открыт: в Steam — профиль → «Редактировать профиль» → «Приватность» → «Сведения об играх» — «Открытые».</p>`
      : '<p class="sm-note">Импорт из Steam работает с аккаунтом: войди, и игры сразу попадут в твой рейтинг.</p>';
    const i = sheet.querySelector('#smProfile');
    if (i) i.focus();
  }
  function gameCat() {
    const cats = state.cats.filter((c) => !isMusicCat(c));
    return cats.find((c) => c.id === 'games') || cats.find((c) => /игр|game/i.test(c.name)) || cats[0];
  }
  function markDups() {
    const have = new Set(state.ratings.filter((r) => !r.example && catKey(r) === keyOf(plan.cat.name)).map((r) => r.nameKey || keyOf(r.name)));
    plan.items.forEach((g) => { g.dup = have.has(keyOf(g.name)); });
  }
  async function find() {
    const v = (sheet.querySelector('#smProfile') || {}).value || '';
    if (!v.trim() || busy) return;
    busy = true;
    body().innerHTML = '<p class="sm-note">Ищу игры…</p>';
    try {
      const d = await api().get('/steam/games?profile=' + encodeURIComponent(v.trim()));
      if (!d.games.length) { busy = false; return drawStart('В этом профиле нет игр.'); }
      plan = { cat: gameCat(), items: d.games.map((g) => ({ ...g })) };
      markDups();
      drawPlan();
    } catch (e) { drawStart(e && e.message ? e.message : 'Не получилось получить игры. Попробуй ещё раз.'); }
    busy = false;
  }
  const hoursText = (h) => (h >= 1 ? `${Math.round(h)} ч` : h > 0 ? 'меньше часа' : 'не запускалась');
  function drawPlan() {
    const fresh = plan.items.filter((g) => !g.dup).length;
    const rows = plan.items.map((g, i) => `<li class="${g.dup ? 'dup' : ''}">
        <input type="checkbox" data-sm-pick="${i}" aria-label="${esc(g.name)}"${g.dup ? ' disabled' : g.hours >= 2 ? ' checked' : ''}>
        <img src="${esc(g.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <span class="sm-n"><b>${esc(g.name)}</b><small>${g.dup ? 'уже есть' : hoursText(g.hours)}</small></span>
        ${g.dup ? '<span></span>' : `<select class="inp small" data-sm-score="${i}" aria-label="Балл для «${esc(g.name)}»"><option value="">—</option>${SCORES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>`}
      </li>`).join('');
    body().innerHTML = `<label class="sm-cat">В категорию <select class="inp small" id="smCat">${state.cats.filter((c) => !isMusicCat(c)).map((c) => `<option value="${esc(c.id)}"${c.id === plan.cat.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="sm-sum"><span><span>${plan.items.length} ${plural(plan.items.length, 'игра', 'игры', 'игр')}</span>, <span>новых — ${fresh}</span></span><span class="sm-acts"><button type="button" class="btn ghost small" data-sm="hours">Отметить с 2+ часами</button><button type="button" class="btn ghost small" data-sm="none">Снять все</button></span></div>
      <ul class="sm-list">${rows}</ul>
      <p class="sm-note">С баллом — оценка с одним баллом «Оценка при импорте из Steam», без балла — «В планах». Любую потом можно переоценить по критериям.</p>
      <div class="sm-acts"><button type="button" class="btn primary" data-sm="go">Импортировать</button><button type="button" class="btn ghost" data-sm="back">Другой профиль</button></div>`;
    drawCount();
  }
  function picked() {
    return [...sheet.querySelectorAll('[data-sm-pick]:checked')].map((c) => {
      const i = +c.dataset.smPick, sel = sheet.querySelector(`[data-sm-score="${i}"]`);
      return { g: plan.items[i], v: sel && sel.value ? +sel.value : null };
    }).filter((x) => x.g && !x.g.dup);
  }
  function drawCount() {
    const b = sheet.querySelector('[data-sm="go"]');
    if (!b) return;
    const n = picked().length;
    b.disabled = !n;
    b.textContent = n ? `Импортировать ${n}` : 'Отметь игры';
  }
  async function runImport() {
    if (!plan || busy) return;
    const list = picked();
    if (!list.length) return;
    busy = true;
    const cat = plan.cat, now = new Date().toISOString();
    const author = state.user
      ? { id: state.user.id, name: state.user.name, avatar: state.user.avatar || state.user.name.charAt(0).toUpperCase(), color: state.user.color || '#3550E8' }
      : { name: 'Гость' };
    const docs = list.map(({ g, v }) => ({
      id: newId('r'), cat: cat.id, catName: cat.name, name: g.name.slice(0, 140), nameKey: keyOf(g.name),
      scores: v ? [{ id: SCORE_ID, name: 'Оценка при импорте из Steam', v }] : [], total: v || null, fav: false,
      status: v ? 'Завершено' : 'В планах', src: 'steam', meta: `Steam: ${hoursText(g.hours)}`.slice(0, 80), pros: '', cons: '', note: '',
      example: false, author, createdAt: now, updatedAt: now, photo: /^https:\/\//.test(g.art) ? { id: g.art, url: g.art, data: '', w: 600, h: 900 } : null,
    }));
    body().innerHTML = '<p class="sm-note">Добавляю игры…</p>';
    if (state.mode === 'db') {
      for (const d of docs) { const { id, ...rest } = d; try { await putRating(id, rest); } catch (e) {} }
    } else {
      state.ratings = state.ratings.filter((r) => !r.example).concat(docs.map((d) => normalizeRating(d.id, d)).filter(Boolean).map((r) => Object.assign(r, { author })));
      saveLocalRatings(); // заодно уходит в аккаунт (friends.js)
      renderBoard();
    }
    const rated = docs.filter((d) => d.total).length;
    plan = null; busy = false;
    body().innerHTML = `<p style="margin:0;font-size:16px;font-weight:700">Готово: добавлено ${docs.length} ${plural(docs.length, 'игра', 'игры', 'игр')}</p>
      <p class="sm-note">С баллом — ${rated}, в «В планах» — ${docs.length - rated}. Они в категории «${esc(cat.name)}».</p>
      <div class="sm-acts"><button type="button" class="btn primary" data-sm="close">Отлично</button></div>`;
    if (typeof toast === 'function') toast(`Импорт из Steam: ${docs.length} ${plural(docs.length, 'игра', 'игры', 'игр')}`);
  }

  document.addEventListener('click', (e) => { if (e.target.closest('[data-sm-open]')) { e.preventDefault(); open(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal); else reveal();
  window.CasualSteam = { open };
})();
