// Казуал Хаб: «Бинго для стрима» на странице сбора (сервер — functions/_lib/bingo.js).
// Ведущий запускает бинго и отмечает клише, которые случились; зрители видят свою карточку 5×5, клетки закрываются сами.
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
    const r = await fetch(`/api/lots/${code}/bingo`, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    return d;
  };
  const css = document.createElement('style');
  css.textContent = `
.bg-box { margin: 4px 0 14px; padding: 14px; border: 1px solid var(--line, #2b2e38); border-radius: 16px; background: color-mix(in srgb, #9B6BFF 6%, var(--panel, #17181c)); animation: bg-in .22s cubic-bezier(.2, .8, .2, 1); }
@keyframes bg-in { from { opacity: 0; transform: translateY(6px); } }
.bg-box h3 { margin: 0 0 4px; font-size: 15px; font-weight: 800; }
.bg-box > p { margin: 0 0 10px; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.bg-card { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; max-width: 460px; }
.bg-cell { aspect-ratio: 1; display: grid; place-items: center; padding: 3px; border-radius: 8px; border: 1px solid var(--line, #2b2e38); background: var(--panel, #17181c); font-size: 10.5px; line-height: 1.15; text-align: center; overflow: hidden; overflow-wrap: anywhere; transition: background-color .2s, border-color .2s, transform .2s cubic-bezier(.2, .8, .2, 1); }
.bg-cell.on { background: color-mix(in srgb, #9B6BFF 30%, var(--panel, #17181c)); border-color: #9B6BFF; transform: scale(.97); }
.bg-cell.free { background: color-mix(in srgb, #F2C230 22%, var(--panel, #17181c)); border-color: #F2C230; font-weight: 800; }
.bg-win { margin: 10px 0 0; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, #2EAD60 18%, transparent); color: #2EAD60; font-weight: 800; font-size: 15px; animation: bg-pop .3s cubic-bezier(.2, .8, .2, 1); }
@keyframes bg-pop { from { opacity: 0; transform: scale(.96); } }
.bg-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 360px; overflow-y: auto; }
.bg-list button { width: 100%; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; align-items: center; min-height: 34px; padding: 4px 8px; border: 1px solid var(--line, #2b2e38); border-radius: 9px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: border-color .16s; }
.bg-list button i { width: 16px; height: 16px; border-radius: 5px; border: 2px solid var(--ink-3, #8a8f9c); }
.bg-list button.on { border-color: #9B6BFF; }
.bg-list button.on i { background: #9B6BFF; border-color: #9B6BFF; }
.bg-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.bg-btn { height: 34px; padding: 0 14px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.bg-btn.main { background: #9B6BFF; border-color: #9B6BFF; color: #fff; }
.bg-items { width: 100%; min-height: 140px; margin-top: 8px; padding: 8px 10px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--bg, #0f1014); color: inherit; font: inherit; font-size: 13px; resize: vertical; }
.bg-wins { margin: 10px 0 0; padding-left: 20px; font-size: 13px; }
.bg-msg { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #E5534B; }
@media (max-width: 380px) { .bg-cell { font-size: 9.5px; } }
@media (prefers-reduced-motion: reduce) { .bg-box, .bg-win { animation: none; } .bg-cell, .bg-list button { transition: none; } }
html.unslop:not([data-ui]) :is(.bg-box, .bg-win) { animation: none; }
`;
  document.head.appendChild(css);

  let data = null, msg = '', busy = false, timer = 0, editing = false, wonSeen = false;
  const box = document.createElement('div');
  box.className = 'bg-box';
  box.setAttribute('aria-live', 'polite');
  function paint() {
    const board = document.querySelector('#view .board');
    if (!board || !data || (!data.on && !data.host)) { box.remove(); return; }
    if (!box.isConnected) { const head = board.querySelector(':scope > .card-head'); if (head) head.after(box); else board.prepend(box); }
    if (editing && box.querySelector('textarea')) return; // не сбивать ввод списка
    const wins = (data.winners || []).length ? `<ol class="bg-wins">${data.winners.map((w) => `<li>${esc(w.name)}</li>`).join('')}</ol>` : '';
    let body = '';
    if (!data.on) {
      body = `<p>Поле 5×5 из клише стрима. У каждого зрителя своя карточка, а отмечаешь ты: что случилось на стриме — то и закрывается у всех. Кто первым соберёт линию, побеждает.</p>
        <details><summary>Свой список клише (от 24 до 60, по одному в строке)</summary><textarea class="bg-items" data-bg-items>${esc((data.defaults || []).join('\n'))}</textarea></details>
        <div class="bg-acts"><button type="button" class="bg-btn main" data-bg="start">Запустить бинго</button></div>`;
    } else if (data.host) {
      const marked = new Set(data.marked);
      body = `<p>Отмечай, что случилось на стриме. Карточек у зрителей: ${data.players}.</p>
        <ul class="bg-list">${data.items.map((t, i) => `<li><button type="button" class="${marked.has(i) ? 'on' : ''}" data-bg-mark="${i}" aria-pressed="${marked.has(i)}"><i aria-hidden="true"></i><span>${esc(t)}</span></button></li>`).join('')}</ul>
        ${wins ? `<h3 style="margin-top:12px">Победители</h3>${wins}` : ''}
        <div class="bg-acts"><button type="button" class="bg-btn" data-bg="stop">Закончить бинго</button></div>`;
    } else if (!data.card) {
      body = `<p>Идёт бинго! Войди в аккаунт, чтобы получить свою карточку.</p>${wins}`;
    } else {
      const marked = new Set(data.marked);
      body = `<p>Клетки закрываются сами, когда ведущий отмечает, что это случилось на стриме. Собери линию — ряд, столбец или диагональ.</p>
        <div class="bg-card">${data.card.map((x) => (x < 0 ? '<div class="bg-cell free">★</div>' : `<div class="bg-cell${marked.has(x) ? ' on' : ''}">${esc(data.items[x] || '')}</div>`)).join('')}</div>
        ${data.won ? `<p class="bg-win">БИНГО! Ты ${data.place}-й${data.place && data.place <= 3 ? ' — держи опыт' : ''}</p>` : ''}
        ${wins ? `<h3 style="margin-top:12px">Победители</h3>${wins}` : ''}`;
    }
    box.innerHTML = `<h3>Бинго для стрима</h3>${body}${msg ? `<p class="bg-msg">${esc(msg)}</p>` : ''}`;
    // своя победа — конфетти, если на странице есть эффекты сайта
    if (data.won && !wonSeen) { wonSeen = true; try { if (window.CasualFx && window.CasualFx.confetti) window.CasualFx.confetti(); } catch (e) {} }
  }
  async function load() { try { data = await api('GET'); } catch (e) { data = null; } paint(); }
  function schedule() {
    clearTimeout(timer);
    if (data && data.on) timer = setTimeout(() => { if (!document.hidden) load().then(schedule); else schedule(); }, 6000);
  }
  box.addEventListener('focusin', (e) => { if (e.target.matches('textarea')) editing = true; });
  box.addEventListener('focusout', (e) => { if (e.target.matches('textarea')) editing = false; });
  box.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-bg], [data-bg-mark]');
    if (!a || busy) return;
    let body;
    if (a.dataset.bgMark != null) { const i = +a.dataset.bgMark; body = { act: 'mark', i, on: !a.classList.contains('on') }; }
    else if (a.dataset.bg === 'start') {
      const ta = box.querySelector('[data-bg-items]');
      const items = ta ? ta.value.split('\n').map((s) => s.trim()).filter(Boolean) : null;
      const same = items && data && data.defaults && items.join('\n') === data.defaults.join('\n');
      body = { act: 'start', ...(items && !same ? { items } : {}) };
    } else if (a.dataset.bg === 'stop') { if (!confirm('Закончить бинго? Карточки зрителей пропадут.')) return; body = { act: 'stop' }; }
    else return;
    busy = true; msg = ''; editing = false;
    try { data = await api('POST', body); } catch (err) { msg = err.message; }
    busy = false;
    paint(); schedule();
  });
  let started = false;
  document.addEventListener('casualhub:lots', () => { if (!started) { started = true; load().then(schedule); } else paint(); });
})();
