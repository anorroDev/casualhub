/* Казуал Хаб: чат комнаты — общий виджет (сбор лотов — lots/chat.js, «Царь Горы» — king/app.js). Сервер — functions/_lib/chat.js.
   CasualChat.mount(el, { scope: 'lots' | 'king', room: код, canModerate, onUnread(n) }) → { destroy(), setModerate(v) }
     canModerate — страница знает, что это хозяин комнаты (удалять чужие); админа сайта сервер отмечает сам (mod).
     onUnread(n) — сколько новых сообщений человек ещё не видел (значок на вкладке «Чат»).
   Новые сообщения приходят по WebSocket от комнаты чата в casualhub-rt (ответ сервера rt: true, /ws-client.js). Без неё —
   опрос «что нового после N» раз в 9 секунд, и только пока чат виден на экране и вкладка открыта.
   Стикеры — каталог Колеса (/wheel/hub/index.json, наборы Папич, roflan, arthas, Twitch). Текст людей вставляется только
   через esc(), обработчики — из скрипта (CSP). */
(() => {
  if (window.CasualChat) return;
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = U.read || ((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } });
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WEBM_OK = (() => { try { return !!document.createElement('video').canPlayType('video/webm; codecs="vp9"'); } catch (e) { return false; } })();
  const vidSrc = (src) => '/wheel/' + (WEBM_OK ? src : src.replace(/\.webm$/i, '.mp4'));
  const POLL_MS = 9000, WS_GIVEUP_MS = 45000, MAX = 300, GROUP_MS = 5 * 60e3;
  const COLORS = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#06B6D4', '#F97316', '#14B8A6'];
  const colorOf = (id) => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const profUrl = (u) => (/^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/.test(u.handle || '') ? '/profile/' + u.handle : '/profile/?id=' + encodeURIComponent(u.id));
  const timeOf = (t) => {
    const d = new Date(t), hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? hm : `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${hm}`;
  };
  const SMILE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2"/><path d="M9.2 9.6h.01M14.8 9.6h.01" stroke-width="2.6"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12h11M11 6.5l5.5 5.5-5.5 5.5"/><path d="M19.5 5v14"/></svg>';

  async function api(method, path, body) {
    const t = token();
    let r;
    try {
      r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { const er = new Error('Нет связи с сервером.'); er.status = 0; throw er; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(d.error || 'Не получилось, попробуй ещё раз.'); er.status = r.status; throw er; }
    return d;
  }
  // каталог стикеров: один раз на страницу (файл ещё и в кэше браузера на неделю)
  let catalog = null;
  const names = new Map();
  const loadCatalog = () => catalog || (catalog = fetch('/wheel/hub/index.json').then((r) => r.json()).then((d) => {
    const groups = (d.groups || []).map((g) => ({ id: String(g.id), title: g.title || g.id, items: (g.items || []).filter((it) => it && /^hub\/[\w\/.-]+\.(?:gif|png|webp|webm)$/.test(it.src || '')) })).filter((g) => g.items.length);
    groups.forEach((g) => g.items.forEach((it) => names.set(it.src, it.name || '')));
    return groups;
  }).catch((e) => { catalog = null; throw e; }));

  const css = document.createElement('style');
  css.textContent = `
.ch { display: grid; gap: 10px; min-width: 0; }
.ch-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 24px; }
.ch-head h2 { margin: 0; }
.ch-box { position: relative; min-width: 0; }
.ch-list { list-style: none; margin: 0; padding: 10px 10px 4px 2px; height: var(--ch-h, clamp(220px, 42vh, 380px)); overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; scrollbar-width: thin; }
.ch-list > :first-child { margin-top: auto; }
.ch-empty { padding: 18px 10px; text-align: center; font-size: 13.5px; line-height: 1.45; color: var(--ink-3, #8a8f9c); text-wrap: pretty; }
.ch-m { display: grid; grid-template-columns: 30px minmax(0, 1fr); column-gap: 8px; align-items: start; margin-top: 10px; }
.ch-m.ch-cont { margin-top: 3px; }
.ch-m.ch-mine { grid-template-columns: minmax(0, 1fr); }
.ch-m > .ch-bub { grid-column: 2; }
.ch-m.ch-mine > .ch-bub { grid-column: 1; justify-self: end; }
.ch-ava { grid-column: 1; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #fff; font-weight: 800; font-size: 13px; line-height: 1; text-decoration: none; }
.ch-bub { position: relative; justify-self: start; max-width: min(100%, 520px); min-width: 0; padding: 6px 11px 7px; border-radius: 14px; background: var(--panel-2, #1d2129); border: 1px solid var(--line, #2a2f3a); }
.ch-mine > .ch-bub { background: color-mix(in srgb, var(--accent, #5B74FF) 13%, var(--panel, #161920)); border-color: color-mix(in srgb, var(--accent, #5B74FF) 32%, var(--line, #2a2f3a)); }
.ch-bub.ch-bare { padding: 2px 0 0; background: none; border-color: transparent; }
.ch-meta { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 12px; line-height: 1.3; }
.ch-mine .ch-meta { justify-content: flex-end; }
.ch-who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink, #f2f2f2); font-weight: 700; text-decoration: none; }
.ch-who:hover { text-decoration: underline; }
.ch-meta time { flex: none; color: var(--ink-3, #8a8f9c); font-variant-numeric: tabular-nums; }
.ch-txt { margin: 1px 0 0; font-size: 14.5px; line-height: 1.42; color: var(--ink, #f2f2f2); overflow-wrap: anywhere; white-space: pre-wrap; }
.ch-stk { display: block; height: 64px; width: auto; max-width: 160px; object-fit: contain; margin-top: 3px; }
.ch-mine .ch-stk { margin-left: auto; }
.ch-del { position: absolute; top: -9px; right: -9px; width: 24px; height: 24px; display: grid; place-items: center; padding: 0; border: 1px solid var(--line, #2a2f3a); border-radius: 50%; background: var(--panel, #161920); color: var(--ink-3, #8a8f9c); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; opacity: 0; transition: opacity .15s, background-color .15s, color .15s; }
.ch-mine .ch-del { right: auto; left: -9px; }
.ch-m:hover .ch-del, .ch-del:focus-visible, .ch-del.armed { opacity: 1; }
@media (hover: none) { .ch-del { opacity: .75; } }
.ch-del.armed { background: var(--bad, #E4553F); border-color: var(--bad, #E4553F); color: #fff; }
.ch-new { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--ink, #f2f2f2); color: var(--panel, #161920); font: inherit; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; box-shadow: 0 8px 20px -10px rgb(0 0 0 / .55); }
.ch-form { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px; align-items: center; }
.ch-in { width: 100%; min-width: 0; height: 42px; padding: 0 12px; border: 1px solid var(--line, #2a2f3a); border-radius: 12px; background: var(--panel-2, #1d2129); color: var(--ink, #f2f2f2); font: inherit; font-size: 15px; }
.ch-in::placeholder { color: var(--ink-3, #8a8f9c); opacity: 1; }
.ch-in:focus { outline: none; border-color: var(--accent, #5B74FF); box-shadow: 0 0 0 3px var(--accent-soft, transparent); }
.ch-ic { width: 42px; height: 42px; display: grid; place-items: center; padding: 0; border: 1px solid var(--line, #2a2f3a); border-radius: 12px; background: var(--panel, #161920); color: var(--ink-2, #b8bcc8); cursor: pointer; transition: border-color .15s, color .15s, background-color .15s; }
.ch-ic:hover { color: var(--ink, #f2f2f2); border-color: color-mix(in srgb, var(--accent, #5B74FF) 55%, var(--line, #2a2f3a)); }
.ch-ic[aria-expanded="true"] { color: var(--accent, #5B74FF); border-color: var(--accent, #5B74FF); }
.ch-ic:focus-visible, .ch-new:focus-visible, .ch-del:focus-visible, .ch-tabs button:focus-visible, .ch-grid button:focus-visible { outline: 2px solid var(--accent, #5B74FF); outline-offset: 2px; }
.ch-send { background: var(--accent, #5B74FF); border-color: var(--accent, #5B74FF); color: var(--on-accent, #fff); }
.ch-send:hover { color: var(--on-accent, #fff); }
.ch-ic:disabled { opacity: .5; cursor: default; }
.ch-pick { display: grid; gap: 8px; padding: 8px; border: 1px solid var(--line, #2a2f3a); border-radius: 14px; background: var(--panel-2, #1d2129); }
.ch-tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.ch-tabs button { flex: none; height: 30px; padding: 0 11px; border: 1px solid var(--line, #2a2f3a); border-radius: 999px; background: var(--panel, #161920); color: var(--ink-2, #b8bcc8); font: inherit; font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer; }
.ch-tabs button[aria-selected="true"] { background: var(--ink, #f2f2f2); border-color: var(--ink, #f2f2f2); color: var(--panel, #161920); }
.ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); gap: 4px; max-height: 208px; overflow-y: auto; overscroll-behavior: contain; }
.ch-grid button { aspect-ratio: 1; display: grid; place-items: center; min-width: 0; padding: 4px; border: 1px solid transparent; border-radius: 10px; background: var(--panel, #161920); cursor: pointer; }
.ch-grid button:hover { border-color: var(--accent, #5B74FF); }
.ch-grid img, .ch-grid video { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.ch-grid p { grid-column: 1 / -1; margin: 6px; font-size: 13px; color: var(--ink-3, #8a8f9c); }
.ch-login { margin: 0; font-size: 14px; color: var(--ink-2, #b8bcc8); }
.ch-login a { color: var(--accent, #5B74FF); font-weight: 700; }
.ch-msg { margin: 0; font-size: 12.5px; color: var(--ink-3, #8a8f9c); }
.ch-msg:empty { display: none; }
.ch-msg.err { color: var(--bad, #E4553F); font-weight: 600; }
.ch-m.ch-fresh { animation: ch-in .2s cubic-bezier(.2, .8, .2, 1); }
@keyframes ch-in { from { opacity: 0; transform: translateY(6px); } }
html.unslop .ch-m.ch-fresh { animation: u-in var(--mo-in, .22s) var(--mo-ease, ease); }
@media (max-width: 400px) { .ch-stk { height: 56px; } .ch-list { padding-right: 6px; } }
@media (prefers-reduced-motion: reduce) { .ch-m.ch-fresh, html.unslop .ch-m.ch-fresh { animation: none; } .ch-del, .ch-ic { transition: none; } }
`;
  document.head.appendChild(css);

  function mount(el, opt) {
    opt = opt || {};
    const scope = opt.scope, room = opt.room;
    if (!el || !/^(lots|king)$/.test(scope || '') || !/^[A-Za-z0-9]{12}$/.test(room || '')) return { destroy() {}, setModerate() {} };
    const q = `s=${encodeURIComponent(scope)}&r=${encodeURIComponent(room)}`;
    const S = { msgs: [], ids: new Set(), last: 0, you: null, mod: false, pageMod: !!opt.canModerate, loaded: false, dead: false, gone: false, unread: 0, stick: true, sending: false, sock: null, sockT: 0, pollT: 0, polling: false, tab: '' };
    el.classList.add('ch');
    el.innerHTML = `<div class="ch-head"><h2 class="eyebrow"><span class="dot" aria-hidden="true"></span><span>Чат</span></h2></div>
      <div class="ch-box"><ol class="ch-list" role="log" aria-live="polite" aria-label="Сообщения чата"><li class="ch-empty">Загружаю…</li></ol>
      <button type="button" class="ch-new" hidden>новые сообщения ↓</button></div>
      <div class="ch-pick" hidden><div class="ch-tabs" role="tablist" aria-label="Наборы стикеров"></div><div class="ch-grid"></div></div>
      <form class="ch-form" hidden><button type="button" class="ch-ic ch-stk-btn" aria-label="Стикеры" title="Стикеры" aria-expanded="false">${SMILE}</button><input type="text" class="ch-in" maxlength="${MAX}" placeholder="Сообщение…" aria-label="Сообщение" autocomplete="off" enterkeyhint="send"><button type="submit" class="ch-ic ch-send" aria-label="Отправить" title="Отправить">${SEND}</button></form>
      <p class="ch-login" hidden></p><p class="ch-msg" role="status"></p>`;
    const $ = (s) => el.querySelector(s);
    const list = $('.ch-list'), pill = $('.ch-new'), pick = $('.ch-pick'), tabs = $('.ch-tabs'), grid = $('.ch-grid');
    const form = $('.ch-form'), input = $('.ch-in'), stkBtn = $('.ch-stk-btn'), sendBtn = $('.ch-send'), login = $('.ch-login'), note = $('.ch-msg');
    let noteT = 0;
    const say = (t, err) => { clearTimeout(noteT); note.textContent = t || ''; note.classList.toggle('err', !!err); if (t) noteT = setTimeout(() => { note.textContent = ''; }, err ? 6000 : 3000); };
    const shown = () => !document.hidden && list.getClientRects().length > 0;
    const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const toBottom = () => { list.scrollTop = list.scrollHeight; };
    const canDel = (m) => !!S.you && (m.u.id === S.you.id || S.mod || S.pageMod);
    function setUnread(n) {
      if (n === S.unread) return;
      S.unread = n;
      pill.hidden = !n || !shown();
      if (opt.onUnread) { try { opt.onUnread(n); } catch (e) {} }
    }
    function seen() { if (shown() && atBottom()) { S.stick = true; setUnread(0); } }

    // ---------- сообщения ----------
    function stickerHTML(src) {
      const name = names.get(src) || 'Стикер';
      if (/\.webm$/i.test(src)) return `<video class="ch-stk" src="${esc(vidSrc(src))}#t=0.1" muted loop playsinline preload="none" aria-label="${esc(name)}"></video>`;
      return `<img class="ch-stk" src="/wheel/${esc(src)}" alt="${esc(name)}" title="${esc(name)}" loading="lazy" decoding="async">`;
    }
    function itemHTML(m, prev, fresh) {
      const mine = !!S.you && m.u.id === S.you.id;
      const cont = !!prev && prev.u.id === m.u.id && m.at - prev.at < GROUP_MS;
      const name = m.u.name || '?';
      const ava = mine || cont ? '' : `<a class="ch-ava" href="${esc(profUrl(m.u))}" style="--c:${colorOf(m.u.id)}" tabindex="-1" aria-hidden="true">${esc(([...name.trim()][0] || '?').toUpperCase())}</a>`;
      const meta = cont ? '' : `<div class="ch-meta">${mine ? '' : `<a class="ch-who" href="${esc(profUrl(m.u))}">${esc(name)}</a>`}<time datetime="${new Date(m.at).toISOString()}">${esc(timeOf(m.at))}</time></div>`;
      const del = canDel(m) ? '<button type="button" class="ch-del" data-del aria-label="Удалить" title="Удалить">×</button>' : '';
      const bare = !m.text && cont;
      return `<li class="ch-m${mine ? ' ch-mine' : ''}${cont ? ' ch-cont' : ''}${fresh ? ' ch-fresh' : ''}" data-id="${m.id}">${ava}<div class="ch-bub${bare ? ' ch-bare' : ''}" title="${esc(timeOf(m.at))}">${meta}${m.text ? `<p class="ch-txt">${esc(m.text)}</p>` : ''}${m.sticker ? stickerHTML(m.sticker) : ''}${del}</div></li>`;
    }
    const emptyHTML = () => `<li class="ch-empty">${S.gone ? 'Чат закрыт: комнаты больше нет.' : 'Пока тихо. Напиши первым или кинь стикер.'}</li>`;
    function paintAll() {
      const keep = S.stick ? -1 : list.scrollTop;
      list.innerHTML = S.msgs.length ? S.msgs.map((m, i) => itemHTML(m, S.msgs[i - 1], false)).join('') : emptyHTML();
      watchVideos();
      if (keep < 0) toBottom(); else list.scrollTop = keep;
    }
    // новые сообщения: дописываются в конец, без перерисовки остальных
    function add(items, fromOthers) {
      const fresh = items.filter((m) => m && m.id && !S.ids.has(m.id) && m.u).sort((a, b) => a.id - b.id);
      if (!fresh.length) return;
      const stick = S.stick && atBottom();
      const wasEmpty = !S.msgs.length;
      if (wasEmpty) list.innerHTML = '';
      for (const m of fresh) {
        S.ids.add(m.id);
        if (m.id > S.last) S.last = m.id;
        const prev = S.msgs[S.msgs.length - 1];
        S.msgs.push(m);
        list.insertAdjacentHTML('beforeend', itemHTML(m, prev, !calm()));
      }
      // хранится не больше трёхсот: старые уходят сверху
      while (S.msgs.length > 300) { const old = S.msgs.shift(); S.ids.delete(old.id); const li = list.querySelector(`[data-id="${old.id}"]`); if (li) li.remove(); }
      watchVideos();
      const others = fresh.filter((m) => !S.you || m.u.id !== S.you.id).length;
      if (stick || !others) { S.stick = true; toBottom(); }
      // чужие, а человек их не видит (чат скрыт или он читает выше) — «новые сообщения ↓» и значок на вкладке
      if (fromOthers && others && (!shown() || !S.stick)) setUnread(S.unread + others);
      else seen();
    }
    function drop(ids) {
      const gone = (ids || []).filter((id) => S.ids.has(id));
      if (!gone.length) return;
      gone.forEach((id) => S.ids.delete(id));
      S.msgs = S.msgs.filter((m) => S.ids.has(m.id));
      paintAll();
    }
    function apply(d) {
      if (!d) return;
      if (d.reset) { S.msgs = []; S.ids.clear(); S.stick = true; }
      if (d.last > S.last) S.last = d.last;
      if (d.reset) { add(d.msgs || [], false); paintAll(); return; }
      drop(d.del);
      add(d.msgs || [], true);
    }
    // видео-стикеры играют, только пока их видно (и не просили «меньше движения»): так полсотни сообщений не грузят страницу
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { if (calm()) { if (v.preload === 'none') { v.preload = 'metadata'; try { v.load(); } catch (er) {} } } else { v.preload = 'auto'; v.play().catch(() => {}); } }
      else if (!v.paused) v.pause();
    }), { root: list, rootMargin: '60px' }) : null;
    function watchVideos() {
      list.querySelectorAll('video.ch-stk:not([data-w])').forEach((v) => { v.dataset.w = '1'; if (io) io.observe(v); else if (!calm()) { v.autoplay = true; v.preload = 'auto'; } });
    }

    // ---------- сервер ----------
    function showForm() {
      form.hidden = !S.you || S.gone;
      login.hidden = !!S.you || S.gone;
      if (!S.you) login.innerHTML = S.banned ? 'Аккаунт заблокирован: писать в чат нельзя.' : '<a href="/opinion/#login">Войди, чтобы писать</a>';
    }
    async function load() {
      try {
        const d = await api('GET', `/chat?${q}`);
        if (S.dead) return;
        S.you = d.you || null; S.mod = !!d.mod; S.banned = !!d.banned; S.loaded = true;
        S.msgs = []; S.ids.clear(); S.last = d.last || 0;
        (d.msgs || []).forEach((m) => { S.ids.add(m.id); S.msgs.push(m); });
        S.stick = true;
        paintAll();
        showForm();
        if (d.rt) startSock();
      } catch (e) {
        if (S.dead) return;
        if (e.status === 404) { goneNow(); return; }
        list.innerHTML = `<li class="ch-empty">${esc(e.message)}</li>`;
        S.pollT = setTimeout(load, 15000); // сервер не ответил — ещё раз попозже
        return;
      }
      loop();
    }
    async function poll() {
      if (S.polling || !S.loaded || S.dead || S.gone) return;
      S.polling = true;
      try { apply(await api('GET', `/chat?${q}&after=${S.last}`)); }
      catch (e) { if (e.status === 404) goneNow(); }
      S.polling = false;
    }
    const sockLive = () => !!(S.sock && S.sock.live());
    // опрос — только без сокета, на открытой вкладке и когда чат виден (не на соседней вкладке «Колесо» или «Лоты»)
    function loop() {
      clearTimeout(S.pollT);
      if (S.dead || S.gone) return;
      S.pollT = setTimeout(async () => {
        if (!el.isConnected) { destroy(); return; }
        if (!sockLive() && shown()) await poll();
        loop();
      }, POLL_MS);
    }
    async function startSock() {
      if (S.sock || S.dead || S.gone) return;
      try { if (U.script) await U.script('/ws-client.js', () => !!window.CasualRT); } catch (e) { return; }
      if (!window.CasualRT || S.sock || S.dead) return;
      let opened = false;
      S.sock = window.CasualRT.open(`/api/chat/ws?${q}`, {
        onMessage(m) {
          if (!el.isConnected) { destroy(); return; }
          if (m.t === 'chat' && m.m) add([m.m], true);
          else if (m.t === 'chatdel' && Number.isInteger(m.id)) drop([m.id]);
        },
        // сокет (пере)подключился: что пришло, пока его не было, — одним запросом
        onStatus(open) { if (open) { opened = true; poll(); } },
        onGone() { goneNow(); },
      });
      // комната вживую так и не ответила (её ещё не выложили или нет связи) — остаёмся на опросе
      clearTimeout(S.sockT);
      S.sockT = setTimeout(() => { if (!opened && S.sock) { S.sock.close(); S.sock = null; } }, WS_GIVEUP_MS);
    }
    function goneNow() {
      S.gone = true;
      clearTimeout(S.pollT);
      if (S.sock) { S.sock.close(); S.sock = null; }
      S.msgs = []; S.ids.clear();
      list.innerHTML = emptyHTML();
      pick.hidden = true; pill.hidden = true;
      showForm();
    }

    // ---------- отправка ----------
    async function send(body) {
      if (S.sending || S.gone) return false;
      S.sending = true; sendBtn.disabled = true;
      let ok = false;
      try {
        const d = await api('POST', '/chat', { s: scope, r: room, ...body });
        S.stick = true;
        add([d.m], false);
        toBottom();
        say('');
        ok = true;
      } catch (e) {
        say(e.message, true);
        if (e.status === 401) { S.you = null; showForm(); }
        if (e.status === 404) goneNow();
      }
      S.sending = false; sendBtn.disabled = false;
      return ok;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      if (await send({ text })) input.value = '';
      input.focus();
    });
    input.addEventListener('input', () => { const left = MAX - input.value.length; if (left <= 30) say(`Осталось ${left} ${(U.plural || ((n, a, b, c) => c))(left, 'символ', 'символа', 'символов')}`); else if (!note.classList.contains('err')) say(''); });

    // ---------- стикеры ----------
    function paintPick(groups) {
      if (!groups.some((g) => g.id === S.tab)) S.tab = groups[0] ? groups[0].id : '';
      tabs.innerHTML = groups.map((g) => `<button type="button" role="tab" data-tab="${esc(g.id)}" aria-selected="${g.id === S.tab}">${esc(g.title)}</button>`).join('');
      const g = groups.find((x) => x.id === S.tab);
      grid.innerHTML = g ? g.items.map((it) => {
        const v = /\.webm$/i.test(it.src);
        return `<button type="button" data-stk="${esc(it.src)}" title="${esc(it.name || '')}" aria-label="${esc(it.name || 'Стикер')}">${v ? `<video src="${esc(vidSrc(it.src))}#t=0.1" muted playsinline preload="none" data-lazy></video>` : `<img src="/wheel/${esc(it.src)}" alt="" loading="lazy" decoding="async">`}</button>`;
      }).join('') : '<p>Стикеры не загрузились, попробуй ещё раз</p>';
      grid.scrollTop = 0;
      if (pio) grid.querySelectorAll('video[data-lazy]').forEach((v) => pio.observe(v));
    }
    // превью видео-стикеров грузится, только когда плитка видна
    const pio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const v = e.target; pio.unobserve(v); v.preload = 'metadata'; try { v.load(); } catch (er) {} } }), { root: grid, rootMargin: '60px' }) : null;
    function openPick(on) {
      pick.hidden = !on;
      stkBtn.setAttribute('aria-expanded', String(on));
      if (!on) return;
      grid.innerHTML = '<p>Загружаю…</p>';
      loadCatalog().then((groups) => { if (!pick.hidden) paintPick(groups); }).catch(() => { grid.innerHTML = '<p>Стикеры не загрузились, попробуй ещё раз</p>'; });
    }
    stkBtn.addEventListener('click', () => openPick(pick.hidden));
    pick.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { S.tab = t.dataset.tab; loadCatalog().then(paintPick).catch(() => {}); return; }
      const b = e.target.closest('[data-stk]');
      if (!b) return;
      if (await send({ sticker: b.dataset.stk })) openPick(false);
    });
    const onKey = (e) => { if (e.key === 'Escape' && !pick.hidden) { openPick(false); stkBtn.focus(); } };
    // путь события запоминается при нажатии: вкладка набора, которую перерисовали, всё ещё считается «внутри»
    const onDocClick = (e) => { const p = e.composedPath ? e.composedPath() : [e.target]; if (!pick.hidden && !p.includes(pick) && !p.includes(stkBtn)) openPick(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);

    // ---------- прокрутка, новые и удаление ----------
    list.addEventListener('scroll', () => { S.stick = atBottom(); if (S.stick) seen(); else if (S.unread) pill.hidden = false; }, { passive: true });
    pill.addEventListener('click', () => { S.stick = true; toBottom(); seen(); });
    // картинка догрузилась и сдвинула ленту: кто был внизу, остаётся внизу
    list.addEventListener('load', () => { if (S.stick) toBottom(); }, true);
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      // удаление в два нажатия: первое спрашивает «Точно удалить?»
      if (!b.classList.contains('armed')) {
        b.classList.add('armed'); b.title = 'Точно удалить?'; b.setAttribute('aria-label', 'Точно удалить?');
        setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.title = 'Удалить'; b.setAttribute('aria-label', 'Удалить'); } }, 3000);
        return;
      }
      const id = +b.closest('[data-id]').dataset.id;
      b.disabled = true;
      try { await api('POST', '/chat/delete', { s: scope, r: room, id }); drop([id]); }
      catch (err) { b.disabled = false; say(err.message, true); }
    });
    // чат снова показали (вкладка «Чат» на телефоне, вернулись на страницу): вниз, новые прочитаны, без сокета — сразу спросить
    let wasShown = false;
    const onShow = () => {
      const now = shown();
      if (now && !wasShown) { if (S.stick) toBottom(); seen(); if (S.loaded && !sockLive()) poll(); }
      wasShown = now;
    };
    const ro = 'ResizeObserver' in window ? new ResizeObserver(onShow) : null;
    if (ro) ro.observe(list);
    document.addEventListener('visibilitychange', onShow);

    function destroy() {
      if (S.dead) return;
      S.dead = true;
      clearTimeout(S.pollT); clearTimeout(S.sockT); clearTimeout(noteT);
      if (S.sock) { S.sock.close(); S.sock = null; }
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (pio) pio.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('visibilitychange', onShow);
    }
    loadCatalog().catch(() => {}); // имена стикеров для подписей
    load();
    return {
      destroy,
      setModerate(v) { v = !!v; if (v === S.pageMod) return; S.pageMod = v; if (S.loaded) paintAll(); },
    };
  }
  window.CasualChat = { mount };
})();
