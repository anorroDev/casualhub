// Казуал Хаб: «Тир-лист вместе» (сервер — functions/_lib/tiercoop.js). Кнопка «Вместе» в редакторе тир-листа
// открывает комнату по ссылке /tierlist/?coop=<код>: каждый раскладывает элементы сам, все видят средний тир-лист.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const T = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  async function api(method, path, body) {
    const t = token();
    const r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    return d;
  }
  const css = document.createElement('style');
  css.textContent = `
.tc-ov { position: fixed; inset: 0; z-index: 124; display: grid; place-items: center; padding: max(14px, env(safe-area-inset-top)) 14px 14px; background: rgb(0 0 0 / .55); animation: tc-fade .16s ease-out; }
@keyframes tc-fade { from { opacity: 0; } }
.tc-card { width: min(980px, 100%); max-height: 100%; overflow-y: auto; padding: 20px; border: 1px solid var(--line, #2b2e38); border-radius: 22px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); animation: tc-in .22s cubic-bezier(.2, .8, .2, 1); }
@keyframes tc-in { from { opacity: 0; transform: translateY(8px) scale(.985); } }
.tc-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.tc-head h2 { margin: 0; font-size: 21px; }
.tc-head small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--ink-2, #b8bcc8); }
.tc-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.tc-btn { height: 34px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel, #17181c); color: inherit; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.tc-btn[aria-pressed="true"] { border-color: var(--accent, #5B74FF); background: color-mix(in srgb, var(--accent, #5B74FF) 14%, var(--panel, #17181c)); }
.tc-rows { display: grid; gap: 6px; margin-top: 10px; }
.tc-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 6px; min-height: 64px; }
.tc-lab { display: grid; place-items: center; border: 0; border-radius: 10px; font: inherit; font-size: 18px; font-weight: 900; color: #14161C; cursor: pointer; overflow-wrap: anywhere; padding: 4px; }
.tc-lab:disabled { cursor: default; }
.tc-its { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; padding: 6px; border-radius: 10px; background: color-mix(in srgb, var(--ink, #fff) 4%, transparent); }
.tc-it { position: relative; display: grid; place-items: center; width: 64px; height: 64px; padding: 2px; border: 2px solid transparent; border-radius: 10px; background: var(--panel-2, #20232c); color: inherit; font: inherit; font-size: 11px; line-height: 1.15; text-align: center; overflow: hidden; overflow-wrap: anywhere; cursor: pointer; transition: border-color .16s, transform .16s cubic-bezier(.2, .8, .2, 1); }
.tc-it img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.tc-it span { position: relative; padding: 1px 3px; border-radius: 4px; background: rgb(0 0 0 / .55); color: #fff; }
.tc-it.sel { border-color: var(--accent, #5B74FF); transform: translateY(-2px); }
.tc-it em { position: absolute; right: 2px; top: 2px; padding: 0 4px; border-radius: 6px; background: rgb(0 0 0 / .65); color: #fff; font-style: normal; font-size: 10px; font-weight: 800; }
.tc-it.hot { box-shadow: inset 0 0 0 2px #E5534B; }
.tc-pool { margin-top: 10px; }
.tc-pool h3 { margin: 0 0 6px; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.tc-note { margin: 10px 0 0; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.tc-msg { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #E5534B; }
@media (max-width: 520px) { .tc-row { grid-template-columns: 48px minmax(0, 1fr); } .tc-it { width: 54px; height: 54px; } }
@media (prefers-reduced-motion: reduce) { .tc-ov, .tc-card { animation: none; } .tc-it { transition: none; } }
html.unslop:not([data-ui]) :is(.tc-ov, .tc-card) { animation: none; }
`;
  document.head.appendChild(css);

  // ---------- создать комнату из тир-листа редактора ----------
  async function create(l) {
    const all = [...l.rows.flatMap((r) => r.items), ...(l.pool || [])];
    const items = all.map((id, k) => { const it = l.items[id] || {}; return { n: String(it.name || '').trim() || `${T('Элемент')} ${k + 1}`, img: it.kind === 'url' ? it.src : '' }; });
    const rows = l.rows.map((r) => ({ t: r.label, c: r.color }));
    const d = await api('POST', '/tiercoop', { title: l.title, rows, items });
    location.href = '/tierlist/?coop=' + d.id;
  }
  window.CasualTierCoop = Object.freeze({ create });

  // ---------- комната ----------
  const code = (/^[A-Za-z0-9]{12}$/.exec(new URLSearchParams(location.search).get('coop') || '') || [''])[0];
  if (!code) return;
  let D = null, tab = 'mine', picks = {}, sel = '', msg = '', ov = null, timer = 0, saveT = 0, dirty = false;
  const it = (id) => D.room.items.find((x) => x.id === id) || { n: '?', img: '' };
  function tile(id, extra) {
    const x = it(id);
    return `<button type="button" class="tc-it${sel === id ? ' sel' : ''}${extra && extra.hot ? ' hot' : ''}" data-it="${esc(id)}" title="${esc(x.n)}">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}<span>${esc(x.n)}</span>${extra && extra.n ? `<em>${extra.n}</em>` : ''}</button>`;
  }
  function paint() {
    if (!ov || !D) return;
    const R = D.room, open = R.status === 'open', mine = tab === 'mine';
    const avg = new Map(D.avg.map((a) => [a.id, a]));
    const rowsHTML = R.rows.map((r, k) => {
      const ids = mine ? R.items.filter((x) => picks[x.id] === k).map((x) => x.id) : R.items.filter((x) => (avg.get(x.id) || {}).row === k).sort((a, b) => avg.get(a.id).mean - avg.get(b.id).mean).map((x) => x.id);
      const tiles = ids.map((id) => (mine ? tile(id) : tile(id, { n: avg.get(id).n, hot: avg.get(id).spread >= 1.2 }))).join('');
      return `<div class="tc-row"><button type="button" class="tc-lab" data-row="${k}" style="background:${esc(r.c)}"${mine && open && token() ? '' : ' disabled'}>${esc(r.t)}</button><div class="tc-its">${tiles}</div></div>`;
    }).join('');
    const rest = mine ? R.items.filter((x) => picks[x.id] == null).map((x) => x.id) : R.items.filter((x) => (avg.get(x.id) || {}).row < 0).map((x) => x.id);
    const note = !open ? T('Голосование закрыто: это итог компании.') : mine ? (token() ? T('Нажми на элемент, потом на ряд. Раскладка сохраняется сама.') : T('Войди в аккаунт, чтобы разложить по-своему.')) : T('Средний тир-лист: элемент стоит там, куда его в среднем ставили. Цифра — сколько голосов, красная рамка — мнения сильно разошлись.');
    ov.querySelector('.tc-card').innerHTML = `<div class="tc-head"><div><h2>${esc(R.title)}</h2><small>${T('Тир-лист вместе')} · ${T('ведёт')} ${esc(R.owner)} · ${T('голосов')}: ${D.voters}${open ? '' : ` · ${T('закрыт')}`}</small></div>
      <div class="tc-acts"><button type="button" class="tc-btn" data-tab="mine" aria-pressed="${mine}">${T('Моя раскладка')}</button><button type="button" class="tc-btn" data-tab="avg" aria-pressed="${!mine}">${T('Средний')}</button><button type="button" class="tc-btn" data-tc="share">${T('Ссылка')}</button>${R.own && open ? `<button type="button" class="tc-btn" data-tc="close">${T('Закрыть голосование')}</button>` : ''}<button type="button" class="tc-btn" data-tc="x" aria-label="${T('Закрыть')}">✕</button></div></div>
      <div class="tc-rows">${rowsHTML}</div>
      ${rest.length ? `<div class="tc-pool"><h3>${mine ? T('Ещё не разложено') : T('Пока без голосов')}</h3><div class="tc-its">${rest.map((id) => tile(id)).join('')}</div></div>` : ''}
      <p class="tc-note">${note}</p>${msg ? `<p class="tc-msg">${esc(msg)}</p>` : ''}`;
  }
  async function load() {
    try {
      const first = !D;
      D = await api('GET', `/tiercoop/room?c=${code}`);
      if (!dirty) picks = { ...(D.mine || {}) };
      // закрыто или без входа — сразу итог компании
      if (first && (D.room.status !== 'open' || !token())) tab = 'avg';
      msg = '';
    }
    catch (e) { msg = e.message; }
    paint();
  }
  function poll() { clearTimeout(timer); timer = setTimeout(async () => { if (!document.hidden && ov) await load(); if (ov) poll(); }, 5000); }
  function save() {
    clearTimeout(saveT); dirty = true;
    saveT = setTimeout(async () => {
      try { D = await api('POST', '/tiercoop/vote', { c: code, picks }); dirty = false; msg = ''; }
      catch (e) { msg = e.message; }
      paint();
    }, 600);
  }
  function close() {
    if (!ov) return;
    ov.remove(); ov = null; clearTimeout(timer);
    document.documentElement.style.overflow = '';
    history.replaceState(history.state, '', '/tierlist/');
  }
  function open() {
    ov = document.createElement('div');
    ov.className = 'tc-ov';
    ov.innerHTML = `<div class="tc-card" role="dialog" aria-modal="true" aria-label="${esc(T('Тир-лист вместе'))}"><p>${T('Загружаю…')}</p></div>`;
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    ov.addEventListener('click', async (e) => {
      if (e.target === ov) return close();
      const b = e.target.closest('[data-it], [data-row], [data-tab], [data-tc]');
      if (!b || !D) return;
      if (b.dataset.tab) { tab = b.dataset.tab; sel = ''; return paint(); }
      if (b.dataset.tc === 'x') return close();
      if (b.dataset.tc === 'share') {
        const url = `${location.origin}/tierlist/?coop=${code}`;
        try { await navigator.clipboard.writeText(url); msg = ''; b.textContent = T('Скопировано'); } catch (er) { msg = url; paint(); }
        return;
      }
      if (b.dataset.tc === 'close') { if (!confirm(T('Закрыть голосование? Раскладки больше не будут меняться.'))) return; try { D = await api('POST', '/tiercoop/close', { c: code }); } catch (er) { msg = er.message; } tab = 'avg'; return paint(); }
      if (tab !== 'mine' || D.room.status !== 'open' || !token()) return;
      if (b.dataset.it) { sel = sel === b.dataset.it ? '' : b.dataset.it; return paint(); }
      if (b.dataset.row != null && sel) { picks[sel] = +b.dataset.row; sel = ''; paint(); save(); }
    });
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    load().then(poll);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open); else open();
})();
