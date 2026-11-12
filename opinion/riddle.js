// Казуал Хаб: «Загадка дня» в Мнении — кнопка в шапке и окно игры (сервер — functions/_lib/riddle.js).
// Подсказки приходят с сервера по одной; ответ страница узнаёт, только когда отгадал или кончились попытки.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const T = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  const api = async (path, body) => {
    const r = await fetch('/api' + path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: 'Bearer ' + token(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз');
    if (r.headers.get('x-levels')) document.dispatchEvent(new CustomEvent('casualhub:levels'));
    return d;
  };

  const css = document.createElement('style');
  css.textContent = `
.rd-open { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; height: 38px; padding: 0 14px; border: 1px solid var(--line, #2b2e38); border-radius: 999px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: border-color .16s, transform .16s cubic-bezier(.2, .8, .2, 1); }
.rd-open:hover { border-color: color-mix(in srgb, var(--accent, #5B74FF) 55%, var(--line, #2b2e38)); }
.rd-open:active { transform: scale(.97); }
.rd-open i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent, #5B74FF); }
.rd-open.done i { background: #2EAD60; }
.rd-ov { position: fixed; inset: 0; z-index: 126; display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top)) 16px 16px; background: rgb(0 0 0 / .55); animation: rd-fade .16s ease-out; }
@keyframes rd-fade { from { opacity: 0; } }
.rd-card { width: min(560px, 100%); max-height: min(760px, 100%); overflow-y: auto; padding: 22px; border: 1px solid var(--line, #2b2e38); border-radius: 22px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); animation: rd-in .22s cubic-bezier(.2, .8, .2, 1); }
@keyframes rd-in { from { opacity: 0; transform: translateY(8px) scale(.985); } }
.rd-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.rd-head h2 { margin: 0; font-size: 22px; }
.rd-x { width: 36px; height: 36px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ink, #fff) 8%, transparent); color: inherit; font-size: 18px; cursor: pointer; }
.rd-sub { margin: 0 0 14px; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.rd-hints { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 6px; }
.rd-hints li { padding: 9px 12px; border-radius: 12px; background: color-mix(in srgb, var(--ink, #fff) 5%, transparent); font-size: 14px; line-height: 1.4; animation: rd-in .22s cubic-bezier(.2, .8, .2, 1); }
.rd-hints li.lock { color: var(--ink-3, #8a8f9c); font-size: 13px; animation: none; }
.rd-hints b { margin-right: 6px; color: var(--accent, #5B74FF); font-variant-numeric: tabular-nums; }
.rd-form { display: flex; gap: 8px; }
.rd-form input { flex: 1; min-width: 0; height: 42px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 12px; background: var(--bg, #0f1014); color: inherit; font: inherit; font-size: 15px; }
.rd-form button { height: 42px; padding: 0 16px; border: 0; border-radius: 12px; background: var(--accent, #5B74FF); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.rd-form button:disabled { opacity: .5; cursor: default; }
.rd-tries { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
.rd-tries li { padding: 4px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; background: color-mix(in srgb, #E5534B 16%, transparent); color: #E5534B; }
.rd-tries li.ok { background: color-mix(in srgb, #2EAD60 18%, transparent); color: #2EAD60; }
.rd-msg { margin: 12px 0 0; font-size: 14px; font-weight: 600; }
.rd-msg.ok { color: #2EAD60; }
.rd-msg.err { color: #E5534B; }
.rd-res { margin-top: 14px; padding: 14px; border-radius: 14px; background: color-mix(in srgb, var(--accent, #5B74FF) 9%, transparent); }
.rd-res p { margin: 0 0 8px; }
.rd-share { height: 36px; padding: 0 14px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel, #17181c); color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
.rd-fr { margin-top: 14px; }
.rd-fr h3 { margin: 0 0 6px; font-size: 13px; color: var(--ink-2, #b8bcc8); }
.rd-fr ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 13.5px; }
.rd-fr li { display: flex; justify-content: space-between; gap: 8px; }
.rd-fr li b { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .rd-ov, .rd-card, .rd-hints li { animation: none; } .rd-open { transition: none; } }
html.unslop:not([data-ui]) :is(.rd-ov, .rd-card, .rd-hints li) { animation: none; }
`;
  document.head.appendChild(css);

  let S = null, names = null, ov = null, busy = false, msg = '', msgCls = '', lastFocus = null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rd-open';
  btn.innerHTML = '<i aria-hidden="true"></i><span>Загадка дня</span>';
  btn.addEventListener('click', () => open());

  function mountBtn() {
    const at = document.querySelector('.masthead > div:first-child');
    if (at && !btn.isConnected) at.appendChild(btn);
    const done = S && (S.solved || S.over);
    btn.classList.toggle('done', !!done);
    btn.querySelector('span').textContent = S ? `${T('Загадка дня')} №${S.n}${done ? '' : ` · ${T('отгадай')}`}` : T('Загадка дня');
  }
  function shareText() {
    const marks = S.tries.map((t, i) => (S.solved && i === S.tries.length - 1 ? '🟩' : '🟥')).join('');
    return `${T('Загадка дня')} №${S.n} — ${S.solved ? S.tries.length : 'X'}/${S.max}\n${marks}\n${location.origin}/opinion/`;
  }
  function paint() {
    if (!ov) return;
    const card = ov.querySelector('.rd-card');
    if (!token()) {
      card.innerHTML = `<div class="rd-head"><h2>${T('Загадка дня')}</h2><button type="button" class="rd-x" data-rd-x aria-label="Закрыть">✕</button></div>
        <p class="rd-sub">Каждый день одна загадка на всех: угадай игру, фильм, сериал или аниме по подсказкам.</p>
        <p class="rd-msg">Войди в аккаунт, чтобы отгадывать и получать опыт.</p>`;
      return;
    }
    if (!S) { card.innerHTML = `<div class="rd-head"><h2>${T('Загадка дня')}</h2><button type="button" class="rd-x" data-rd-x aria-label="Закрыть">✕</button></div><p class="rd-sub">${esc(msg || 'Загружаю…')}</p>`; return; }
    const done = S.solved || S.over, left = S.max - S.tries.length;
    const hints = S.hints.map((h, i) => `<li><b>${i + 1}</b>${esc(h)}</li>`).join('')
      + (done ? '' : Array.from({ length: Math.max(0, S.total - S.hints.length) }, (_, i) => `<li class="lock"><b>${S.hints.length + i + 1}</b>${T('Откроется после неверной попытки')}</li>`).join(''));
    const tries = S.tries.length ? `<ul class="rd-tries">${S.tries.map((t, i) => `<li class="${S.solved && i === S.tries.length - 1 ? 'ok' : ''}">${esc(t)}</li>`).join('')}</ul>` : '';
    const res = done ? `<div class="rd-res"><p>${S.solved ? `<b>${T('Отгадал с попытки')} ${S.tries.length}!</b> ${T('Опыт уже начислен.')}` : `<b>${T('Попытки кончились.')}</b>`} ${T('Ответ')}: <b>${esc(S.answer || '')}</b></p>
        <p>${T('Серия')}: <b>${S.streak || 0}</b> ${T('дн. подряд')}. ${T('Завтра — новая загадка.')}</p><button type="button" class="rd-share" data-rd-share>${T('Поделиться результатом')}</button></div>` : '';
    const fr = (S.friends || []).length ? `<div class="rd-fr"><h3>${T('Друзья сегодня')}</h3><ul>${S.friends.map((f) => `<li><span>${esc(f.name)}</span><b>${f.solved ? `${f.tries}/${S.max}` : 'X'}</b></li>`).join('')}</ul></div>` : '';
    card.innerHTML = `<div class="rd-head"><h2>${T('Загадка дня')} №${S.n}</h2><button type="button" class="rd-x" data-rd-x aria-label="Закрыть">✕</button></div>
      <p class="rd-sub">${T('Угадай игру, фильм, сериал или аниме.')} ${done ? '' : `${T('Попыток осталось')}: <b>${left}</b>.`}</p>
      <ol class="rd-hints">${hints}</ol>
      ${done ? '' : `<form class="rd-form" data-rd-form><input name="g" list="rdNames" autocomplete="off" maxlength="80" placeholder="${esc(T('Твой ответ'))}" aria-label="${esc(T('Твой ответ'))}" required><button type="submit"${busy ? ' disabled' : ''}>${T('Ответить')}</button></form><datalist id="rdNames">${(names || []).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`}
      ${tries}${msg ? `<p class="rd-msg ${msgCls}">${esc(msg)}</p>` : ''}${res}${fr}`;
  }
  async function load() {
    if (!token()) { S = null; mountBtn(); return; }
    try { S = await api('/riddle'); msg = ''; } catch (e) { msg = e.message; }
    mountBtn(); paint();
  }
  function close() {
    if (!ov) return;
    ov.remove(); ov = null;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function open() {
    lastFocus = document.activeElement;
    ov = document.createElement('div');
    ov.className = 'rd-ov';
    ov.innerHTML = '<div class="rd-card" role="dialog" aria-modal="true" aria-label="Загадка дня"></div>';
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-rd-x]')) close(); else if (e.target.closest('[data-rd-share]')) share(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    ov.addEventListener('submit', onGuess);
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    msg = '';
    paint();
    if (token() && !names) api('/riddle/names').then((d) => { names = d.names || []; paint(); }, () => {});
    load().then(() => { const i = ov && ov.querySelector('[data-rd-form] input'); if (i) i.focus(); });
  }
  async function onGuess(e) {
    if (!e.target.matches('[data-rd-form]')) return;
    e.preventDefault();
    const g = e.target.g.value.trim();
    if (!g || busy) return;
    busy = true; msg = '';
    try {
      S = await api('/riddle/guess', { g });
      if (S.ok) { msg = T('Верно!'); msgCls = 'ok'; } else if (!S.over) { msg = T('Мимо. Открылась ещё одна подсказка.'); msgCls = 'err'; } else { msg = ''; }
    } catch (err) { msg = err.message; msgCls = 'err'; }
    busy = false;
    mountBtn(); paint();
    const i = ov && ov.querySelector('[data-rd-form] input');
    if (i) i.focus();
  }
  async function share() {
    try { await navigator.clipboard.writeText(shareText()); msg = T('Результат скопирован.'); msgCls = 'ok'; } catch (e) { msg = shareText(); msgCls = ''; }
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mountBtn(); load(); }); else { mountBtn(); load(); }
})();
