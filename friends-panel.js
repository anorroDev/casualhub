/* Казуал Хаб: окно «Друзья» на любой странице.
   Кнопка «Друзья» в шапке ([data-friends-btn]) и ссылки на /mnenie/#friends открывают окно на месте, без перехода.
   В Мнении открывается его собственное окно (friends.js: там ещё доски друзей и отправка оценок),
   на остальных страницах — это: заявки, добавление по @юзернейму, список друзей, «в сети».
   Аватарки друзей с рамкой отсюда же берёт и окно Мнения (window.CasualFriendsUI). */
(() => {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const COLORS = ['#3550E8', '#2EAD60', '#EAA92C', '#E4553F', '#9333EA', '#06B6D4', '#EC4899', '#F97316'];
  const colorOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const token = () => { const u = read('ocenshik.user.v1'); const t = read('casualhub.tokens.v1') || {}; return (u && t[u.id]) || null; };
  async function api(path, method = 'GET', body) {
    const t = token();
    let r;
    try {
      r = await fetch('/api' + path, { method, cache: 'no-store', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error('Нет связи с сервером.'); }
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) { const e = new Error(d.error || 'Сервер не ответил, попробуй ещё раз.'); e.status = r.status; throw e; }
    return d;
  }

  const css = document.createElement('style');
  css.textContent = `
.fp-ava { position: relative; flex: none; width: 44px; height: 44px; padding: 2px; border-radius: 50%; background: conic-gradient(from 210deg, var(--good, #2EAD60), var(--mid, #EAA92C), var(--bad, #E4553F), var(--accent, #3550E8), var(--good, #2EAD60)); }
.fp-ava > span { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; border: 2px solid var(--panel-2, var(--panel, #1b1d24)); background-position: center; background-size: cover; color: #fff; font-weight: 800; font-size: 16px; line-height: 1; }
.fp-ava > span.img { color: transparent; }
.fp-ava .on-dot { position: absolute; right: 0; bottom: 1px; width: 11px; height: 11px; box-shadow: 0 0 0 2px var(--panel-2, var(--panel, #1b1d24)); }
.fr-who { display: flex; align-items: center; gap: 10px; flex: 1 1 170px; min-width: 0; }
.fr-who > span { min-width: 0; overflow-wrap: anywhere; }
.fr-row .fr-who > span b { font-weight: 700; }
.fr-add { justify-self: start; }
.fp-sheet { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg, #0d0f14) 70%, transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); overscroll-behavior: contain; }
.fp-sheet[hidden] { display: none; }
.fp-card { width: min(560px, 100%); max-height: min(720px, calc(100dvh - 32px)); overflow: auto; overscroll-behavior: contain; display: grid; gap: 14px; padding: 18px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); border: 1px solid var(--line, #2b2e38); border-radius: 20px; box-shadow: 0 30px 70px -30px rgba(0, 0, 0, .6); animation: fp-pop .3s cubic-bezier(.34, 1.56, .64, 1); font-family: inherit; }
@keyframes fp-pop { from { transform: translateY(12px) scale(.97); } }
@media (prefers-reduced-motion: reduce) { .fp-card { animation: none; } }
.fp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.fp-head h3 { margin: 0; font-size: 20px; font-weight: 800; }
.fp-head p { margin: 4px 0 0; font-size: 13px; color: var(--ink-2, #a3a7b3); }
.fp-x { flex: none; width: 36px; height: 36px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel-2, #23262f); color: var(--ink, #f3f4f6); font-size: 16px; cursor: pointer; }
.fp-card .label { display: block; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2, #a3a7b3); }
.fp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 9px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); font: inherit; font-size: 13.5px; font-weight: 600; text-decoration: none; white-space: nowrap; cursor: pointer; transition: transform .2s cubic-bezier(.34, 1.56, .64, 1), border-color .15s; }
.fp-btn:hover { border-color: color-mix(in srgb, var(--ink, #fff) 32%, var(--line, #2b2e38)); }
.fp-btn:active { transform: scale(.96); }
.fp-btn:disabled { opacity: .5; cursor: default; }
.fp-btn.primary { border-color: transparent; background: var(--ink, #f3f4f6); color: var(--panel, #1b1d24); }
.fp-btn.danger { color: var(--bad-ink, var(--bad, #E4553F)); }
.fp-btn.danger-solid { border-color: transparent; background: var(--bad, #E4553F); color: #fff; }
.fp-card .fr-form button { flex: none; }
/* строки окна: те же, что в окне Мнения (friends.js) */
.fr-sec { display: grid; gap: 8px; }
.fr-sec + .fr-sec { padding-top: 14px; border-top: 1px solid var(--line); }
.fr-list { display: grid; gap: 6px; }
.fr-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 6px 6px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.fr-row span { min-width: 0; overflow-wrap: anywhere; }
.fr-row b { font-weight: 600; }
.fr-row small { display: block; font-size: 12px; color: var(--ink-3); }
.fr-row i, .rx-list li i { font-style: normal; font-weight: 600; color: var(--ink-3); margin-left: 6px; }
.fr-nick.copy { border: 0; font: inherit; cursor: pointer; }
.fr-nick.copy svg { width: 13px; height: 13px; }
.fr-row > span:first-child { flex: 1 1 150px; }
.fr-acts { display: flex; flex: none; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.fr-form { display: flex; flex-wrap: wrap; gap: 8px; }
.fr-form input { flex: 1 1 160px; min-width: 0; height: 40px; padding: 0 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; font-size: 15px; color: var(--ink); }
.fr-form input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.fr-nick { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.fr-msg { font-size: 13px; color: var(--ink-2); }
.fr-toggle { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
.fr-toggle input { width: 18px; height: 18px; accent-color: var(--accent); }
.fr-msg.err { color: var(--bad-ink); font-weight: 600; }
.fr-muted { font-size: 13px; color: var(--ink-2); text-wrap: pretty; }
@media (pointer: coarse) { .fr-form input { font-size: 16px; } }
`;
  document.head.appendChild(css);

  // ---------- аватарки с рамкой: буква сразу, фото подтягивается с сервера ----------
  const avaCache = new Map(); // id -> Promise<data URL | ''>
  const avaHTML = (u) => `<span class="fp-ava" data-ava="${esc(u.id)}" aria-hidden="true"><span style="background-color:${colorOf(u.username || u.id)}">${esc(([...String(u.username || '?').trim()][0] || '?').toUpperCase())}</span><i class="on-dot" data-on="${esc(u.id)}" data-last="${+u.lastSeen || ''}"></i></span>`;
  function hydrate(root) {
    if (!root || !token()) return;
    root.querySelectorAll('[data-ava]').forEach((el) => {
      const id = el.dataset.ava;
      if (!avaCache.has(id)) avaCache.set(id, api(`/photo/${encodeURIComponent(id)}/avatar`).then((d) => (typeof d.data === 'string' && /^data:image\//.test(d.data) ? d.data : ''), () => ''));
      avaCache.get(id).then((src) => {
        if (!src || !el.isConnected) return;
        const s = el.firstElementChild;
        s.style.backgroundImage = `url("${src}")`;
        s.classList.add('img');
      });
    });
  }
  const whoHTML = (u, sub) => `<div class="fr-who">${avaHTML(u)}<span><b>${esc(u.username)}</b>${u.handle ? `<i>@${esc(u.handle)}</i>` : ''}${sub ? `<small>${sub}</small>` : ''}</span></div>`;
  window.CasualFriendsUI = { avaHTML, whoHTML, hydrate };

  // ---------- своё окно (вне Мнения) ----------
  const COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  const S = { me: null, friends: [], incoming: [], outgoing: [], msg: '', err: false, addOpen: false, armed: '', failed: false, loaded: false };
  let sheet = null, card = null, lastFocus = null;
  function build() {
    sheet = document.createElement('div');
    sheet.className = 'fp-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'fpTitle');
    sheet.innerHTML = '<div class="fp-card"></div>';
    document.body.appendChild(sheet);
    card = sheet.firstElementChild;
    sheet.addEventListener('click', onClick);
    card.addEventListener('submit', onSubmit);
    card.addEventListener('change', onChange);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  }
  function open() {
    if (!sheet) build();
    lastFocus = document.activeElement;
    S.msg = ''; S.armed = '';
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    draw();
    const x = card.querySelector('[data-fp="close"]');
    if (x) x.focus({ preventScroll: true });
    load();
  }
  function close() {
    if (!sheet) return;
    sheet.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  async function load() {
    if (!token()) return draw();
    try {
      const [m, f] = await Promise.all([api('/me'), api('/friends')]);
      S.me = m.user || null;
      S.friends = f.friends || []; S.incoming = f.incoming || []; S.outgoing = f.outgoing || [];
      S.failed = false;
    } catch (e) {
      S.failed = true;
    }
    S.loaded = true;
    if (!sheet.hidden) draw();
  }
  function draw() {
    const user = read('ocenshik.user.v1');
    const head = `<div class="fp-head"><div><h3 id="fpTitle">Друзья</h3>${S.me && S.me.handle ? `<p>Тебя добавляют по юзернейму: <button type="button" class="fr-nick copy" data-fp="copy" title="Скопировать">@${esc(S.me.handle)} ${COPY}</button></p>` : ''}</div>
      <button type="button" class="fp-x" data-fp="close" aria-label="Закрыть">✕</button></div>`;
    const msg = S.msg ? `<p class="fr-msg${S.err ? ' err' : ''}" role="status">${esc(S.msg)}</p>` : '';
    let body;
    if (!user) {
      body = `<div class="fr-sec"><p class="fr-muted">Друзья работают через аккаунт Казуал Хаба. Войди или зарегистрируйся, и по твоему @юзернейму тебя смогут добавить.</p>
        <div class="fr-acts" style="margin:0"><a class="fp-btn primary" href="/mnenie/#login">Войти</a><a class="fp-btn" href="/mnenie/#reg">Зарегистрироваться</a></div></div>`;
    } else if (!token()) {
      body = `<div class="fr-sec"><p class="fr-muted">Аккаунт ${esc(user.name || '')} ещё не подключён к друзьям. Подключить его можно в Мнении Казуала.</p>
        <div class="fr-acts" style="margin:0"><a class="fp-btn primary" href="/mnenie/#friends">Подключить в Мнении</a></div></div>`;
    } else if (!S.loaded) {
      body = '<p class="fr-muted">Загружаю друзей…</p>';
    } else if (S.failed && !S.friends.length) {
      body = '<div class="fr-sec"><p class="fr-muted"><strong>Сервер друзей сейчас не отвечает.</strong> Попробуй открыть окно ещё раз чуть позже.</p></div>';
    } else {
      const btn = (act, id, label, cls) => `<button type="button" class="fp-btn ${cls || ''}" data-fp="${act}" data-id="${esc(id)}">${label}</button>`;
      const row = (u, acts, sub) => `<div class="fr-row">${whoHTML(u, sub)}<span class="fr-acts">${acts}</span></div>`;
      const when = (t) => (t ? 'оценки обновлены ' + new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'оценок пока нет');
      const seenOf = (u) => `<span data-seen="${esc(u.id)}" data-last="${+u.lastSeen || ''}" data-post=" · "></span>`;
      body = `
        <div class="fr-sec">
          <button type="button" class="fp-btn ${S.addOpen ? '' : 'primary'} fr-add" data-fp="add" aria-expanded="${S.addOpen}">${S.addOpen ? 'Скрыть' : '＋ Добавить друга'}</button>
          ${S.addOpen ? `<form class="fr-form" data-fp-form="request">
            <input name="handle" placeholder="@юзернейм друга" maxlength="21" required autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Юзернейм друга">
            <button type="submit" class="fp-btn primary">Отправить заявку</button>
          </form>` : ''}
        </div>
        ${S.incoming.length ? `<div class="fr-sec"><span class="label">Заявки тебе</span><div class="fr-list">${S.incoming.map((u) => row(u, btn('accept', u.id, 'Принять', 'primary') + btn('remove', u.id, 'Отклонить'))).join('')}</div></div>` : ''}
        <div class="fr-sec"><span class="label">Друзья${S.friends.length ? ' · ' + S.friends.length : ''}</span>
          ${S.friends.length ? `<div class="fr-list">${S.friends.map((u) => row(u,
            `<a class="fp-btn" href="/profile/?id=${encodeURIComponent(u.id)}">Профиль</a><a class="fp-btn" href="/mnenie/#friend=${encodeURIComponent(u.id)}">Оценки</a>`
            + (S.armed === u.id ? btn('remove', u.id, 'Точно убрать?', 'danger-solid') : btn('arm', u.id, 'Убрать', 'danger')),
            seenOf(u) + when(u.updatedAt))).join('')}</div>`
            : '<p class="fr-muted">Пока никого. Нажми «Добавить друга» и введи его @юзернейм, друг увидит заявку у себя.</p>'}
        </div>
        ${S.outgoing.length ? `<div class="fr-sec"><span class="label">Ты отправил</span><div class="fr-list">${S.outgoing.map((u) => row(u, btn('remove', u.id, 'Отменить'), 'ждёт ответа')).join('')}</div></div>` : ''}
        ${S.me ? `<div class="fr-sec"><label class="fr-toggle"><input type="checkbox" data-fp-online${S.me.hideOnline ? '' : ' checked'}> Показывать друзьям, что я в сети</label></div>` : ''}`;
    }
    card.innerHTML = head + msg + body;
    if (window.CasualOnline) window.CasualOnline.paint(card);
    hydrate(card);
  }
  async function onClick(e) {
    if (e.target === sheet) return close();
    const b = e.target.closest('[data-fp]');
    if (!b) return;
    const act = b.dataset.fp, id = b.dataset.id;
    if (act === 'close') return close();
    if (act === 'copy' && S.me) {
      const t = '@' + S.me.handle;
      try { await navigator.clipboard.writeText(t); S.msg = 'Скопировано: ' + t; } catch (err) { S.msg = t; }
      S.err = false;
      return draw();
    }
    if (act === 'add') {
      S.addOpen = !S.addOpen;
      draw();
      const inp = card.querySelector('input[name="handle"]');
      if (inp) inp.focus();
      return;
    }
    if (act === 'arm') { S.armed = id; return draw(); }
    b.disabled = true;
    try {
      if (act === 'accept') { await api('/friends/accept', 'POST', { userId: id }); S.msg = 'Заявка принята.'; S.err = false; }
      if (act === 'remove') { await api('/friends/remove', 'POST', { userId: id }); S.armed = ''; S.msg = ''; }
      await load();
      if (window.CasualOnline) window.CasualOnline.ping(); // цифры на кнопке «Друзья» сразу
    } catch (err) {
      S.msg = err.message; S.err = true;
      draw();
    }
  }
  async function onSubmit(e) {
    const form = e.target.closest('[data-fp-form]');
    if (!form) return;
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const r = await api('/friends/request', 'POST', { handle: new FormData(form).get('handle') });
      S.msg = r.status === 'accepted' ? `${r.user.username} (@${r.user.handle}) теперь в друзьях.` : `Заявка отправлена: ${r.user.username} (@${r.user.handle}).`;
      S.err = false;
      S.addOpen = false;
      await load();
    } catch (err) {
      S.msg = err.message; S.err = true;
      btn.disabled = false;
      draw();
    }
  }
  async function onChange(e) {
    const t = e.target.closest('[data-fp-online]');
    if (!t || !S.me) return;
    t.disabled = true;
    try { S.me = (await api('/account', 'PUT', { hideOnline: !t.checked })).user || S.me; }
    catch (err) { t.checked = !t.checked; S.msg = err.message; S.err = true; draw(); }
    t.disabled = false;
  }

  // кнопка «Друзья» и ссылки на окно друзей: открываем окно на месте; в Мнении — его собственное
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-friends-btn], a[href="/mnenie/#friends"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.closest('.fp-card')) return; // «Подключить в Мнении» внутри окна ведёт в Мнение
    e.preventDefault();
    if (window.CasualFriends && typeof window.CasualFriends.openSheet === 'function') { window.CasualFriends.openSheet(); return; }
    open();
  });
  window.CasualFriendsPanel = { open, close };
})();
