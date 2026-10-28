/* Казуал Хаб: комментарии — стена профиля (как в Steam, в самом низу) и ветка под оценкой.
   Видят и пишут хозяин и его друзья; удалить может автор и хозяин. Текст всегда вставляется как текст, не как разметка.
   Использование: CasualComments.mount(контейнер, { uid, target: 'wall' | 'r.<id оценки>', token, title, empty }) */
(() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const MAX = 500;
  const COLORS = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#06B6D4', '#F97316', '#14B8A6'];
  const colorOf = (id) => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
  const ago = (t) => {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'только что';
    const m = Math.round(s / 60); if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60); if (h < 24) return `${h} ч назад`;
    const d = Math.round(h / 24); if (d < 7) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
    return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = document.createElement('style');
  css.textContent = `
.cm { display: grid; gap: 12px; min-width: 0; }
.cm-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.cm-head h3 { margin: 0; font-size: 15px; font-weight: 800; color: var(--ink); }
.cm-head span { font-size: 12.5px; color: var(--ink-3); }
.cm-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.cm-item { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--line); }
.cm-item.fresh { animation: cm-in .5s cubic-bezier(.34, 1.56, .64, 1); }
.cm-item.gone { animation: cm-out .3s cubic-bezier(.5, 0, .75, 0) forwards; }
@keyframes cm-in { from { transform: translateY(12px) scale(.97); } }
@keyframes cm-out { to { transform: translateX(40px) scale(.9); } }
.cm-ava { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 15px; background: var(--c); background-size: cover; background-position: center; }
.cm-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 13px; }
.cm-meta b { color: var(--ink); font-weight: 800; }
.cm-meta i { font-style: normal; color: var(--ink-3); }
.cm-meta time { color: var(--ink-3); font-size: 12px; }
.cm-text { margin: 3px 0 0; font-size: 14.5px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.cm-del { margin-left: auto; padding: 0 6px; height: 24px; border: 0; border-radius: 8px; background: none; color: var(--ink-3); font: inherit; font-size: 12px; cursor: pointer; }
.cm-del:hover, .cm-del.armed { color: var(--bad); background: color-mix(in srgb, var(--bad) 12%, transparent); }
.cm-empty { margin: 0; font-size: 14px; color: var(--ink-3); }
.cm-form { display: grid; gap: 6px; }
.cm-form textarea { width: 100%; min-height: 44px; max-height: 200px; resize: vertical; padding: 11px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); font: inherit; font-size: 14.5px; line-height: 1.4; box-sizing: border-box; }
.cm-form textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.cm-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cm-row small { font-size: 12px; color: var(--ink-3); }
.cm-row small.err { color: var(--bad); }
.cm-send { height: 38px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; transition: transform .2s cubic-bezier(.34, 1.56, .64, 1); }
.cm-send:active { transform: scale(.94); }
.cm-send:disabled { opacity: .55; cursor: default; }
.cm-more { justify-self: start; padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .cm-item.fresh, .cm-item.gone { animation: none; } }`;
  document.head.appendChild(css);

  // кэш веток: при перерисовке страницы ветка показывается сразу, а свежие комментарии подтягиваются в фоне
  const cache = new Map(); // ключ uid|target -> { items, at }
  const avatars = new Map(); // id человека -> data URL аватарки (или null)

  function req(token, method, path, body) {
    return fetch('/api' + path, { method, headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
      .then((r) => r.json().catch(() => ({})).then((d) => (r.ok ? d : Promise.reject(d))));
  }

  function itemHTML(x, fresh) {
    const letter = esc((String(x.from.username || '?').trim()[0] || '?').toUpperCase());
    return `<li class="cm-item${fresh ? ' fresh' : ''}" data-cm="${esc(x.id)}">
      <a class="cm-ava" href="/profile/?id=${encodeURIComponent(x.from.id)}" data-ava="${esc(x.from.id)}" style="--c:${colorOf(x.from.id)}" aria-label="Профиль ${esc(x.from.username)}">${letter}</a>
      <div><div class="cm-meta"><b>${esc(x.from.username)}</b>${x.from.handle ? `<i>@${esc(x.from.handle)}</i>` : ''}<time datetime="${new Date(x.at).toISOString()}" title="${esc(new Date(x.at).toLocaleString('ru-RU'))}">${ago(x.at)}</time>${x.canDelete ? '<button type="button" class="cm-del" data-cm-del>Удалить</button>' : ''}</div>
      <p class="cm-text">${esc(x.text)}</p></div></li>`;
  }

  function mount(el, opt) {
    if (!el || !opt || !opt.uid || !opt.token) return;
    const key = opt.uid + '|' + opt.target;
    const LIMIT = 30;
    let showAll = false;
    el.innerHTML = `<div class="cm">
      <div class="cm-head"><h3>💬 ${esc(opt.title || 'Комментарии')}</h3><span data-cm-n></span></div>
      <ul class="cm-list" data-cm-list></ul>
      <form class="cm-form" data-cm-form>
        <textarea maxlength="${MAX}" rows="2" placeholder="${esc(opt.placeholder || 'Напиши комментарий…')}" aria-label="Текст комментария"></textarea>
        <div class="cm-row"><small data-cm-msg>Enter — отправить, Shift+Enter — новая строка</small><button type="submit" class="cm-send">Отправить</button></div>
      </form></div>`;
    const list = el.querySelector('[data-cm-list]'), nEl = el.querySelector('[data-cm-n]'), form = el.querySelector('[data-cm-form]');
    const ta = form.querySelector('textarea'), msg = el.querySelector('[data-cm-msg]'), btn = form.querySelector('.cm-send');
    const say = (t, err) => { msg.textContent = t; msg.classList.toggle('err', !!err); };
    const paint = (freshId) => {
      const c = cache.get(key);
      const items = c ? c.items : null;
      nEl.textContent = items && items.length ? `${items.length} ${plural(items.length, 'комментарий', 'комментария', 'комментариев')}` : '';
      if (!items) { list.innerHTML = '<li class="cm-empty">Загружаю…</li>'; return; }
      if (!items.length) { list.innerHTML = `<li class="cm-empty">${esc(opt.empty || 'Пока пусто. Напиши первым!')}</li>`; return; }
      const shown = showAll ? items : items.slice(-LIMIT);
      list.innerHTML = (items.length > shown.length ? `<li><button type="button" class="cm-more" data-cm-more>Показать ранние (${items.length - shown.length})</button></li>` : '') + shown.map((x) => itemHTML(x, x.id === freshId)).join('');
      hydrate();
    };
    // аватарки авторов: их собственные, если есть (тянем по одной и запоминаем)
    function hydrate() {
      list.querySelectorAll('[data-ava]').forEach((a) => {
        const id = a.dataset.ava;
        const put = (d) => { if (d && /^data:image\//.test(d)) { a.style.backgroundImage = `url("${d}")`; a.textContent = ''; } };
        if (avatars.has(id)) { const v = avatars.get(id); if (v && v.then) v.then(put); else put(v); return; }
        const pr = req(opt.token, 'GET', `/photo/${encodeURIComponent(id)}/avatar?thumb=1`).then((d) => d.data || null, () => null);
        avatars.set(id, pr);
        pr.then((d) => { avatars.set(id, d); put(d); });
      });
    }
    const load = () => req(opt.token, 'GET', `/comments/${encodeURIComponent(opt.uid)}/${encodeURIComponent(opt.target)}`)
      .then((d) => { cache.set(key, { items: d.items || [], at: Date.now() }); if (el.isConnected) paint(); if (opt.onCount) opt.onCount((d.items || []).length); })
      .catch((e) => { if (!cache.has(key) && el.isConnected) list.innerHTML = `<li class="cm-empty">${esc((e && e.error) || 'Комментарии сейчас не загрузились.')}</li>`; });
    paint();
    const c = cache.get(key);
    if (!c || Date.now() - c.at > 15e3) load();

    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    ta.addEventListener('input', () => { const left = MAX - ta.value.length; say(left < 60 ? `Осталось ${left} ${plural(left, 'символ', 'символа', 'символов')}` : 'Enter — отправить, Shift+Enter — новая строка', left < 0); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      btn.disabled = true;
      try {
        const d = await req(opt.token, 'POST', `/comments/${encodeURIComponent(opt.uid)}/${encodeURIComponent(opt.target)}`, { text });
        const cur = cache.get(key) || { items: [], at: Date.now() };
        cur.items.push(d.item);
        cache.set(key, cur);
        ta.value = '';
        say('Отправлено ✔');
        paint(d.item.id);
        if (opt.onCount) opt.onCount(cur.items.length);
      } catch (err) {
        say((err && err.error) || 'Не получилось отправить, попробуй ещё раз.', true);
      }
      btn.disabled = false;
    });
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cm-more]')) { showAll = true; paint(); return; }
      const del = e.target.closest('[data-cm-del]');
      if (!del) return;
      // удаление в два нажатия: первое спрашивает «Точно?»
      if (!del.classList.contains('armed')) {
        del.classList.add('armed'); del.textContent = 'Точно удалить?';
        setTimeout(() => { if (del.isConnected) { del.classList.remove('armed'); del.textContent = 'Удалить'; } }, 3000);
        return;
      }
      const li = del.closest('[data-cm]'), id = li.dataset.cm;
      del.disabled = true;
      try {
        await req(opt.token, 'DELETE', `/comment/${encodeURIComponent(id)}`);
        const cur = cache.get(key);
        if (cur) cur.items = cur.items.filter((x) => x.id !== id);
        const done = () => { paint(); if (opt.onCount && cur) opt.onCount(cur.items.length); };
        if (calm) done(); else { li.classList.add('gone'); setTimeout(done, 280); }
      } catch (err) { say((err && err.error) || 'Не получилось удалить.', true); del.disabled = false; }
    });
  }

  window.CasualComments = { mount };
})();
