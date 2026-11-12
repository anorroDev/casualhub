// Казуал Хаб: «Вечер с друзьями» на странице сбора — у каждого одно вето (сервер — functions/_lib/lots-evening.js).
// Снимок сбора приходит от lots/app.js событием casualhub:lots; вето — свой опрос /api/lots/<код>/veto.
(() => {
  const m = /^\/lots\/([A-Za-z0-9]{12})\/?$/.exec(location.pathname);
  if (!m) return;
  const code = m[1];
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const api = async (method, body) => {
    const t = token();
    const r = await fetch(`/api/lots/${code}/veto`, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    return d;
  };
  const css = document.createElement('style');
  css.textContent = `
.ev-box { margin: 4px 0 14px; padding: 14px; border: 1px solid var(--line, #2b2e38); border-radius: 16px; background: color-mix(in srgb, #F2C230 6%, var(--panel, #17181c)); animation: ev-in .22s cubic-bezier(.2, .8, .2, 1); }
@keyframes ev-in { from { opacity: 0; transform: translateY(6px); } }
.ev-box h3 { margin: 0 0 4px; font-size: 15px; font-weight: 800; }
.ev-box > p { margin: 0 0 10px; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.ev-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.ev-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 38px; padding: 5px 6px 5px 10px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel, #17181c); font-size: 13.5px; }
.ev-list li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.ev-list li.out span { text-decoration: line-through; color: var(--ink-3, #8a8f9c); }
.ev-list li small { display: block; font-size: 11.5px; font-weight: 500; color: var(--ink-3, #8a8f9c); text-decoration: none; }
.ev-btn { height: 30px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 8px; background: transparent; color: var(--ink, #f2f2f2); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: border-color .16s; }
.ev-btn:hover:not(:disabled) { border-color: #E5534B; color: #E5534B; }
.ev-btn:disabled { opacity: .45; cursor: default; }
.ev-msg { margin: 10px 0 0; font-size: 13px; font-weight: 600; }
.ev-msg.err { color: #E5534B; }
@media (prefers-reduced-motion: reduce) { .ev-box { animation: none; } .ev-btn { transition: none; } }
html.unslop:not([data-ui]) .ev-box { animation: none; }
`;
  document.head.appendChild(css);

  let lots = [], data = null, msg = '', msgCls = '', busy = false, timer = 0, lastKey = '';
  const box = document.createElement('div');
  box.className = 'ev-box';
  box.setAttribute('aria-live', 'polite');
  function paint() {
    const board = document.querySelector('#view .board');
    if (!board || !data || !data.evening || !lots.length) { box.remove(); return; }
    if (!box.isConnected) { const head = board.querySelector(':scope > .card-head'); if (head) head.after(box); else board.prepend(box); }
    const by = new Map(data.vetoes.map((v) => [v.lot, v]));
    const own = new Set(data.own || []);
    const rows = lots.map((l) => {
      const v = by.get(l.id);
      const act = !data.open || !data.can ? '' : v && v.me ? '<button type="button" class="ev-btn" data-ev-undo>Вернуть</button>'
        : v || own.has(l.id) ? '' : `<button type="button" class="ev-btn" data-ev="${esc(l.id)}"${busy ? ' disabled' : ''}>${data.mine ? 'Вето сюда' : 'Вето'}</button>`;
      return `<li class="${v ? 'out' : ''}"><span>${esc(l.name)}${v ? `<small>вето от ${esc(v.name)}</small>` : ''}</span>${act}</li>`;
    }).join('');
    const note = msg || (!token() ? 'Войди в аккаунт, чтобы добавить вариант и получить вето.'
      : !data.open ? 'Колесо уже крутится: вето больше не меняются.'
        : !data.can ? 'Вето есть у тех, кто добавил вариант.' : data.mine ? 'Твоё вето использовано. Можно передумать до прокрутки.' : 'У тебя одно вето.');
    box.innerHTML = `<h3>Вечер с друзьями</h3><p>У каждого одно вето: убери чужой вариант, который точно не хочешь. Колесо крутится из оставшихся.</p>
      <ul class="ev-list">${rows}</ul><p class="ev-msg ${msg ? msgCls : ''}">${esc(note)}</p>`;
  }
  async function load() { try { data = await api('GET'); } catch (e) { data = null; } paint(); }
  function schedule() {
    clearTimeout(timer);
    if (data && data.evening && data.open) timer = setTimeout(() => { if (!document.hidden) load().then(schedule); else schedule(); }, 10000);
  }
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ev], [data-ev-undo]');
    if (!b || b.disabled || busy) return;
    busy = true; msg = '';
    try { data = await api('POST', { lot: b.dataset.ev || '' }); } catch (err) { msg = err.message; msgCls = 'err'; }
    busy = false;
    paint();
  });
  document.addEventListener('casualhub:lots', (e) => {
    const d = e.detail || {};
    lots = (d.lots || []).filter((l) => l && l.id).map((l) => ({ id: l.id, name: l.name || '' }));
    const live = d.live;
    const key = [lots.length, live ? !!live.res : 0, live && live.winner ? live.winner.at : 0].join(':');
    if (key !== lastKey || !data) { lastKey = key; load().then(schedule); } else paint();
  });
})();
