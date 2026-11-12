/* Казуал Хаб: вкладка «Магазин» в админке — рофланы человека, подарить или снять, что покупают.
   Отдельный файл, чтобы не трогать admin/app.js: когда админка открыта, вкладка сама встаёт в ряд вкладок и рисует
   свой раздел в #admSec. Остальные вкладки переключает admin/app.js, эта — сама. Адреса — /api/admin/shop…
   (functions/_lib/shop-api.js), правила рофланов — functions/_lib/shop.js. */
(() => {
  const U = window.CasualUtil;
  const esc = U.esc, read = U.read, plural = U.plural;
  const app = document.getElementById('app');
  if (!app) return;
  const who = read('ocenshik.user.v1');
  const token = who && (read('casualhub.tokens.v1') || {})[who.id];
  const call = (method, path, body) => fetch('/api' + path, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Не получилось, попробуй ещё раз'), { status: r.status });
    return d;
  }, () => { throw Object.assign(new Error('Нет связи с сервером, проверь интернет и попробуй ещё раз'), { status: 0 }); });
  const nf = (n) => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const coins = (n) => `${nf(n)} ${plural(Math.abs(Math.round(+n || 0)), 'рофлан', 'рофлана', 'рофланов')}`;
  const when = (t) => (t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const ICON = '<span class="u-old">🪙</span><svg class="u-new" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/></svg>';

  function css() {
    if (document.getElementById('admShopCss')) return;
    const s = document.createElement('style');
    s.id = 'admShopCss';
    s.textContent = `
.ash-find { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.ash-find .adm-in { flex: 1 1 200px; min-width: 0; }
.ash-box { border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; margin: 12px 0; display: grid; gap: 10px; }
.ash-box h3 { margin: 0; font-size: 15px; }
.ash-nums { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 14px; }
.ash-nums b { font-variant-numeric: tabular-nums; }
.ash-grant { display: grid; grid-template-columns: minmax(90px, 140px) minmax(0, 1fr); gap: 8px; }
.ash-grant .ash-act { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
.ash-log { display: grid; }
.ash-log > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
.ash-log > div:first-child { border-top: 0; }
.ash-log small { grid-column: 1 / -1; color: var(--ink-3); font-size: 12px; }
.ash-log .plus { color: var(--good, #2EAD60); font-weight: 700; font-variant-numeric: tabular-nums; }
.ash-log .minus { color: var(--ink-2); font-weight: 700; font-variant-numeric: tabular-nums; }
.ash-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ash-chips span { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); font-size: 12.5px; }
.ash-err { color: var(--bad, #E5484D); font-size: 13px; margin: 0; }
@media (max-width: 480px) { .ash-grant { grid-template-columns: 1fr; } }`;
    document.head.appendChild(s);
  }

  // ---------- вкладка ----------
  function inject() {
    const tabs = app.querySelector('.adm-tabs');
    if (!tabs || tabs.querySelector('[data-shop-tab]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.dataset.shopTab = '';
    b.innerHTML = `<span aria-hidden="true">${ICON}</span>Магазин`;
    // перед «Журналом» действий, если он есть, иначе в конец
    const last = [...tabs.querySelectorAll('[data-tab]')].find((x) => x.dataset.tab === 'log');
    tabs.insertBefore(b, last || null);
    b.addEventListener('click', () => {
      tabs.querySelectorAll('[role="tab"]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      show();
    });
    // выбрали другую вкладку (её рисует admin/app.js) — эта больше не выбрана
    tabs.addEventListener('click', (e) => { if (e.target.closest('[data-tab]')) b.setAttribute('aria-selected', 'false'); });
  }
  new MutationObserver(inject).observe(app, { childList: true, subtree: true });
  inject();

  // ---------- раздел ----------
  let view = 0; // ответ пришёл, когда уже открыта другая вкладка или другой человек — не рисуем
  const sec = () => document.getElementById('admSec');
  const mineTab = () => !!app.querySelector('[data-shop-tab][aria-selected="true"]');
  function lost(x) {
    const s = sec();
    if (!s) return;
    if (x && x.status === 404 && x.message === 'Нет такого адреса.') { s.innerHTML = '<p class="adm-err">Вход в админку закончился. Обнови страницу и введи пин-код.</p>'; return; }
    s.innerHTML = `<p class="adm-err">${esc(x.message)}</p>`;
  }
  const logHTML = (items, withWho) => (items.length
    ? `<div class="ash-log">${items.map((x) => `<div><span>${withWho && x.handle ? `@${esc(x.handle)} · ` : ''}${x.reason === 'buy' ? `Купил «${esc(x.title)}»` : x.delta > 0 ? 'Подарок от администрации' : 'Снято администрацией'}</span><span class="${x.delta > 0 ? 'plus' : 'minus'}">${x.delta > 0 ? '+' : '−'}${nf(Math.abs(x.delta))}</span><small>${esc(when(x.at))}${x.by ? ` · @${esc(x.by)}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</small></div>`).join('')}</div>`
    : '<p class="muted">Пока ничего.</p>');
  async function show(q) {
    const s = sec();
    if (!s) return;
    css();
    const my = ++view;
    s.innerHTML = `<div class="head"><h2 class="h2">Магазин</h2></div>
      <p class="muted">Рофланы копятся сами: 1 за каждые 10 опыта, ещё — за достижения и звания в конце сезона. Здесь можно подарить или снять их человеку и посмотреть, что покупают.</p>
      <form class="ash-find" id="ashFind"><input class="adm-in" id="ashWho" placeholder="@юзернейм" autocomplete="off" spellcheck="false" value="${esc(q || '')}"><button type="submit" class="btn primary small">Открыть</button></form>
      <div id="ashBody"><p class="muted">Загружаю…</p></div>`;
    s.querySelector('#ashFind').addEventListener('submit', (e) => { e.preventDefault(); show(s.querySelector('#ashWho').value.trim()); });
    try {
      const d = await call('GET', '/admin/shop' + (q ? '?user=' + encodeURIComponent(q.replace(/^@+/, '')) : ''));
      if (my !== view || !mineTab()) return;
      const body = s.querySelector('#ashBody');
      if (!d.on) { body.innerHTML = '<p class="muted">Магазин выключен вместе с уровнями (LEVELS = "0").</p>'; return; }
      if (d.user) { body.innerHTML = userHTML(d); wireGrant(body, d); return; }
      const t = d.totals || {};
      body.innerHTML = `<div class="ash-box"><h3>Всего</h3><div class="ash-nums"><span>Покупок: <b>${nf(t.buys)}</b></span><span>Потрачено: <b>${coins(t.spent)}</b></span><span>Покупателей: <b>${nf(t.people)}</b></span></div>
        ${(t.top || []).length ? `<div class="ash-chips">${t.top.map((x) => `<span>${esc(x.title)} · ${nf(x.n)}</span>`).join('')}</div>` : ''}</div>
        <div class="ash-box"><h3>Последние операции</h3>${logHTML(d.log || [], true)}</div>`;
    } catch (x) {
      if (my === view && mineTab()) lost(x);
    }
  }
  function userHTML(d) {
    const e = d.earned || {};
    const have = (d.items || []).filter((x) => x.owned && x.price > 0);
    return `<div class="ash-box"><h3>${esc(d.user.username || '')} · @${esc(d.user.handle || '')}</h3>
      <div class="ash-nums"><span>Сейчас: <b>${coins(d.balance)}</b>${d.debt ? ` (долг ${nf(d.debt)})` : ''}</span><span>За опыт: <b>${nf(e.xp)}</b></span><span>За достижения: <b>${nf(e.ach)}</b></span><span>За сезоны: <b>${nf(e.season)}</b></span><span>От администрации: <b>${nf(d.gifts)}</b></span><span>Потрачено: <b>${nf(d.spent)}</b></span></div>
      ${have.length ? `<div class="ash-chips">${have.map((x) => `<span>${esc(x.title)}</span>`).join('')}</div>` : '<p class="muted">Ничего не купил.</p>'}</div>
      <form class="ash-box ash-grant" id="ashGrant"><h3 style="grid-column: 1 / -1">Подарить или снять</h3>
        <input class="adm-in" id="ashN" type="number" inputmode="numeric" min="1" max="100000" step="1" placeholder="Сколько" required>
        <input class="adm-in" id="ashNote" maxlength="120" placeholder="За что (видно в журнале)">
        <div class="ash-act"><button type="submit" class="btn primary small" data-sign="1">Подарить</button><button type="submit" class="btn ghost small" data-sign="-1">Снять</button></div>
        <p class="ash-err" id="ashErr" role="alert" hidden></p></form>
      <div class="ash-box"><h3>Журнал</h3>${logHTML(d.log || [], false)}</div>`;
  }
  function wireGrant(body, d) {
    const f = body.querySelector('#ashGrant');
    let sign = 1;
    f.querySelectorAll('[data-sign]').forEach((b) => b.addEventListener('click', () => { sign = +b.dataset.sign; }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = Math.trunc(+f.querySelector('#ashN').value || 0), err = f.querySelector('#ashErr');
      err.hidden = true;
      if (n <= 0) { err.textContent = 'Нужно число больше нуля'; err.hidden = false; return; }
      if (sign < 0 && !confirm(`Снять ${coins(n)} у @${d.user.handle}?`)) return;
      f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        const r = await call('POST', '/admin/shop/grant', { to: d.user.id, delta: sign * n, note: f.querySelector('#ashNote').value });
        if (!mineTab()) return;
        body.innerHTML = userHTML(r);
        wireGrant(body, r);
      } catch (x) {
        if (x.status === 404 && x.message === 'Нет такого адреса.') { lost(x); return; }
        err.textContent = x.message; err.hidden = false;
        f.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
    });
  }
})();
