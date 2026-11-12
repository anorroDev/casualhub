// Казуал Хаб: «Прогнозы» на странице сбора — угадай, какой лот победит (сервер — functions/_lib/lots-predict.js).
// Снимок сбора приходит от lots/app.js событием casualhub:lots; прогнозы — свой опрос /api/lots/<код>/predict.
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
    const r = await fetch(`/api/lots/${code}/predict`, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    return d;
  };

  const css = document.createElement('style');
  css.textContent = `
.lp-box { margin: 4px 0 14px; padding: 14px; border: 1px solid var(--line, #2b2e38); border-radius: 16px; background: color-mix(in srgb, var(--accent, #5B74FF) 5%, var(--panel, #17181c)); animation: lp-in .22s cubic-bezier(.2, .8, .2, 1); }
@keyframes lp-in { from { opacity: 0; transform: translateY(6px); } }
.lp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.lp-head h3 { margin: 0; font-size: 15px; font-weight: 800; }
.lp-st { font-size: 12px; font-weight: 700; color: var(--ink-3, #8a8f9c); }
.lp-st.on { color: #2EAD60; }
.lp-lede { margin: 0 0 10px; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.lp-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.lp-opt { position: relative; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 38px; padding: 6px 10px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; overflow: hidden; transition: border-color .16s, transform .16s cubic-bezier(.2, .8, .2, 1); }
.lp-opt:disabled { cursor: default; }
.lp-opt:not(:disabled):hover { border-color: color-mix(in srgb, var(--accent, #5B74FF) 55%, var(--line, #2b2e38)); }
.lp-opt:not(:disabled):active { transform: scale(.98); }
.lp-opt .lp-bar { position: absolute; inset: 0 auto 0 0; width: var(--p, 0%); background: color-mix(in srgb, var(--accent, #5B74FF) 13%, transparent); transition: width .3s cubic-bezier(.2, .8, .2, 1); pointer-events: none; }
.lp-opt > span, .lp-opt > b { position: relative; }
.lp-opt .lp-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.lp-opt b { font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--ink-2, #b8bcc8); }
.lp-opt.on { border-color: var(--accent, #5B74FF); box-shadow: inset 0 0 0 1px var(--accent, #5B74FF); }
.lp-opt.win { border-color: #2EAD60; }
.lp-opt.win .lp-bar { background: color-mix(in srgb, #2EAD60 18%, transparent); }
.lp-who { margin: 2px 2px 0; font-size: 11.5px; color: var(--ink-3, #8a8f9c); }
.lp-msg { margin: 10px 0 0; font-size: 13px; font-weight: 600; }
.lp-msg.ok { color: #2EAD60; }
.lp-msg.err { color: #E5534B; }
.lp-top { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line, #2b2e38); }
.lp-top h4 { margin: 0 0 6px; font-size: 12.5px; font-weight: 700; color: var(--ink-2, #b8bcc8); }
.lp-top ol { margin: 0; padding-left: 20px; display: grid; gap: 3px; font-size: 13px; }
.lp-top li span { font-weight: 600; }
.lp-top li b { margin-left: 6px; color: var(--ink-3, #8a8f9c); font-weight: 700; }
@media (prefers-reduced-motion: reduce) { .lp-box { animation: none; } .lp-opt, .lp-opt .lp-bar { transition: none; } }
html.unslop:not([data-ui]) .lp-box { animation: none; }
`;
  document.head.appendChild(css);

  let lots = [], live = null, data = null, msg = '', msgCls = '', busy = false, timer = 0, lastKey = '';
  const box = document.createElement('div');
  box.className = 'lp-box';
  box.setAttribute('aria-live', 'polite');

  function mount() {
    const board = document.querySelector('#view .board');
    if (!board || lots.length < 2) { box.remove(); return; }
    if (!box.isConnected) {
      const head = board.querySelector(':scope > .card-head');
      if (head) head.after(box); else board.prepend(box);
    }
  }
  function paint() {
    mount();
    if (!box.isConnected) return;
    const d = data || { open: true, counts: {}, total: 0, top: [] };
    const total = d.total || 0;
    const rows = lots.map((l) => {
      const n = (d.counts && d.counts[l.id]) || 0, p = total ? Math.round((n / total) * 100) : 0;
      const names = d.who && d.who[l.id] ? `<p class="lp-who">${d.who[l.id].slice(0, 12).map(esc).join(', ')}${d.who[l.id].length > 12 ? ' …' : ''}</p>` : '';
      return `<li><button type="button" class="lp-opt${d.mine === l.id ? ' on' : ''}${d.win === l.id ? ' win' : ''}" data-lp="${esc(l.id)}"${d.open && d.signed ? '' : ' disabled'} aria-pressed="${d.mine === l.id}"><span class="lp-bar" style="--p:${p}%"></span><span class="lp-n">${esc(l.name)}</span><b>${p}%</b></button>${names}</li>`;
    }).join('');
    let note = msg;
    if (!note) {
      if (d.win && d.mine) note = d.got ? 'Угадал! Опыт уже начислен.' : 'Не угадал в этот раз.';
      else if (!d.open) note = d.mine ? 'Прогнозы закрыты, ждём победителя.' : 'Прогнозы закрыты: колесо уже крутится.';
      else if (!d.signed) note = 'Войди в аккаунт, чтобы сделать прогноз.';
      else if (!d.mine) note = 'Нажми на лот, который, по-твоему, победит.';
    }
    const cls = msg ? msgCls : d.win && d.mine && d.got ? 'ok' : '';
    const top = (d.top || []).length ? `<div class="lp-top"><h4>Лучшие прогнозисты сезона</h4><ol>${d.top.map((t) => `<li><span>${esc(t.name)}</span><b>${t.n}</b></li>`).join('')}</ol></div>` : '';
    box.innerHTML = `<div class="lp-head"><h3>Прогноз</h3><span class="lp-st${d.open ? ' on' : ''}">${d.open ? 'открыт' : 'закрыт'}${total ? ` · ${total}` : ''}</span></div>
      <p class="lp-lede">Угадай, какой лот победит: угадавшим — опыт на сайте.</p>
      <ul class="lp-list">${rows}</ul>${note ? `<p class="lp-msg ${cls}">${esc(note)}</p>` : ''}${top}`;
  }
  async function load() {
    try { data = await api('GET'); } catch (e) { /* без прогнозов страница работает как раньше */ }
    paint();
  }
  // опрос: пока прогнозы открыты или ждём победителя — раз в 15 секунд, на видимой вкладке
  function schedule() {
    clearTimeout(timer);
    const waiting = !data || data.open || (!data.win && data.mine);
    if (waiting) timer = setTimeout(() => { if (!document.hidden) load().then(schedule); else schedule(); }, 15000);
  }
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lp]');
    if (!b || b.disabled || busy) return;
    busy = true; msg = '';
    const id = b.dataset.lp;
    try { data = await api('POST', { lot: data && data.mine === id ? '' : id }); }
    catch (err) { msg = err.message; msgCls = 'err'; }
    busy = false;
    paint();
  });
  document.addEventListener('casualhub:lots', (e) => {
    const d = e.detail || {};
    lots = (d.lots || []).filter((l) => l && l.id).map((l) => ({ id: l.id, name: l.name || '' }));
    live = d.live || null;
    // крутанули колесо или выпал победитель — прогнозы обновить сразу
    const key = live ? [!!live.res, live.winner ? live.winner.at : 0, (live.hist || []).length].join(':') : '';
    if (key !== lastKey || !data) { lastKey = key; load().then(schedule); } else paint();
  });
})();
