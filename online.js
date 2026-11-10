/* Казуал Хаб: «в сети», счётчик «N на сайте», заявки в друзья, объявление сайта и уведомления о реакциях и комментариях.
   С комнатой присутствия (ответ POST /ping с rt: true) всё приходит по WebSocket сразу: друг открыл сайт или закрыл
   последнюю вкладку, объявление, новая заявка, реакция. Без неё — как раньше: пинг раз в минуту, объявление раз в 15 секунд.
   Вкладку спрятали дольше чем на 2,5 минуты — сокет закрывается, «в сети» значит «сейчас на сайте». */
(() => {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const GUEST_KEY = 'casualhub.guestId.v1';
  const WINDOW = 150e3; // «в сети» — заходил за последние 2,5 минуты, как на сервере
  // on — друзья, у кого сайт открыт сейчас (по сокету), left — закрыли последнюю вкладку: уже не «в сети»
  const st = { online: 0, friends: new Map(), incoming: 0, ready: false, on: new Set(), left: new Set() };

  const token = () => {
    const u = read('ocenshik.user.v1');
    const t = read('casualhub.tokens.v1') || {};
    return (u && t[u.id]) || null;
  };
  function guestId() {
    let g = null;
    try { g = localStorage.getItem(GUEST_KEY); } catch (e) {}
    if (!g || !/^[a-z0-9]{12,40}$/.test(g)) {
      g = (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).toLowerCase();
      try { localStorage.setItem(GUEST_KEY, g); } catch (e) {}
    }
    return g;
  }
  // «в сети» / «был(а) 5 мин назад» по времени последнего захода
  function seen(id, lastSeen) {
    if (st.on.has(id)) return { on: true, text: 'в сети' };
    const t = Math.max(st.friends.get(id) || 0, +lastSeen || 0);
    if (!t) return { on: false, text: '' };
    const m = Math.floor((Date.now() - t) / 60e3);
    if (Date.now() - t < WINDOW && !st.left.has(id)) return { on: true, text: 'в сети' };
    if (m < 1) return { on: false, text: 'был(а) только что' };
    if (m < 60) return { on: false, text: `был(а) ${m} мин назад` };
    const h = Math.floor(m / 60);
    if (h < 24) return { on: false, text: `был(а) ${h} ч назад` };
    const d = Math.floor(h / 24);
    if (d === 1) return { on: false, text: 'был(а) вчера' };
    if (d < 7) return { on: false, text: `был(а) ${d} ${d < 5 ? 'дня' : 'дней'} назад` };
    return { on: false, text: 'был(а) ' + new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) };
  }
  // элементы страниц: [data-seen="id"] — подпись «в сети / был(а)…», [data-on="id"] — зелёная точка;
  // data-last — время последнего захода из списка друзей, data-post — что дописать после подписи
  function paint(root) {
    (root || document).querySelectorAll('[data-seen]').forEach((el) => {
      const s = seen(el.dataset.seen, el.dataset.last);
      el.textContent = s.text ? s.text + (el.dataset.post || '') : '';
      el.classList.toggle('on', s.on);
    });
    (root || document).querySelectorAll('[data-on]').forEach((el) => el.classList.toggle('on', seen(el.dataset.on, el.dataset.last).on));
  }
  const css = document.createElement('style');
  css.textContent = '.on-dot{display:none;flex:none;width:8px;height:8px;border-radius:50%;background:var(--good,#2EAD60);box-shadow:0 0 0 2px color-mix(in srgb,var(--good,#2EAD60) 30%,transparent);vertical-align:middle}.on-dot.on{display:inline-block}[data-seen].on{color:var(--good,#2EAD60);font-weight:700}[data-seen]:empty{display:none}.online-chip{display:inline-flex;align-items:center;gap:7px}.online-chip[hidden]{display:none!important}.online-chip em{flex:none;width:8px;height:8px;border-radius:50%;background:var(--good,#2EAD60);box-shadow:0 0 0 3px color-mix(in srgb,var(--good,#2EAD60) 25%,transparent)}.online-chip b{font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}.fb-n{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 4px;border-radius:999px;font:800 11px/1 system-ui,sans-serif;font-style:normal;color:#fff}.fb-n[hidden]{display:none}.fb-on{background:var(--good,#2EAD60);color:var(--on-tier,#0D0F14)}.fb-req{background:var(--bad,#E4553F)}.bump{animation:oc-bump .45s cubic-bezier(.34,1.56,.64,1)}@keyframes oc-bump{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}@media (prefers-reduced-motion:reduce){.bump{animation:none}}';
  document.head.appendChild(css);
  window.CasualOnline = {
    paint,
    get count() { return st.online; },
    get ready() { return st.ready; },
    get incoming() { return st.incoming; },
    isOnline: (id) => seen(id).on,
    friendsOnline: () => [...st.friends.keys()].filter((id) => seen(id).on),
    seen,
    ping: () => ping(),
  };

  const ANN_KEY = 'casualhub.announceSeen.v1';
  function announce(a) {
    let bar = document.getElementById('siteAnnounce');
    let seenId = '';
    try { seenId = localStorage.getItem(ANN_KEY) || ''; } catch (e) {}
    if (!document.getElementById('annCss')) {
      const css = document.createElement('style');
      css.id = 'annCss';
      css.textContent = `.site-ann { position: relative; z-index: 50; display: flex; align-items: center; gap: 10px; max-width: 1180px; margin: 10px auto 0; padding: 10px 12px 10px 16px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--ann) 45%, transparent); background: color-mix(in srgb, var(--ann) 14%, var(--panel, #161920)); color: var(--ink, #e8eaf0); font: 600 14px/1.4 var(--font-body, system-ui, sans-serif); animation: ann-in .5s cubic-bezier(.34, 1.56, .64, 1); }
.site-ann[data-kind="info"] { --ann: var(--accent, #3550E8); } .site-ann[data-kind="warn"] { --ann: var(--mid, #EAA92C); } .site-ann[data-kind="party"] { --ann: var(--good, #2EAD60); }
.site-ann span { flex: 1; min-width: 0; overflow-wrap: anywhere; } .site-ann i { font-style: normal; font-size: 18px; }
.site-ann button { flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ann) 20%, transparent); color: inherit; font: inherit; cursor: pointer; }
@keyframes ann-in { from { transform: translateY(-14px) scale(.97); } }
@media (max-width: 1220px) { .site-ann { margin: 10px 16px 0; } }
.site-ann a { color: inherit; font-weight: 800; }
@media (prefers-reduced-motion: reduce) { .site-ann { animation: none; } }`;
      document.head.appendChild(css);
    }
    if (!a || !a.text || a.id === seenId) { if (bar) bar.remove(); return; }
    if (bar && bar.dataset.id === a.id) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'siteAnnounce';
      bar.className = 'site-ann';
      bar.setAttribute('role', 'status');
      document.body.prepend(bar);
    }
    bar.dataset.id = a.id;
    bar.dataset.kind = a.kind || 'info';
    // текст объявления — только как текст, без разметки
    bar.innerHTML = '<i aria-hidden="true"></i><span></span><button type="button" aria-label="Закрыть объявление">✕</button>';
    bar.querySelector('i').innerHTML = a.kind === 'warn' ? '<span class="u-old">⚠️</span><svg class="u-new" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/></svg>' : a.kind === 'party' ? '<span class="u-old">🎉</span><svg class="u-new" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/></svg>' : '<span class="u-old">📢</span><svg class="u-new" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/></svg>';
    // текст — в свой span, а не в первый попавшийся: внутри значка тоже есть span (эмодзи для обычного вида)
    bar.querySelector(':scope > span').textContent = a.text;
    bar.querySelector('button').addEventListener('click', () => { try { localStorage.setItem(ANN_KEY, a.id); } catch (e) {} bar.remove(); });
  }

  let goneShown = false;
  function sessionGone() {
    try {
      const u = read('ocenshik.user.v1'), t = read('casualhub.tokens.v1') || {};
      if (u && t[u.id]) { delete t[u.id]; localStorage.setItem('casualhub.tokens.v1', JSON.stringify(t)); }
    } catch (e) {}
    if (goneShown || location.pathname.startsWith('/admin')) return;
    goneShown = true;
    if (!document.getElementById('annCss')) announce(null);
    const bar = document.createElement('div');
    bar.className = 'site-ann';
    bar.dataset.kind = 'warn';
    bar.setAttribute('role', 'alert');
    bar.innerHTML = '<i aria-hidden="true"><span class="u-old">🔒</span><svg class="u-new" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></i><span>Вход в аккаунт закончился: оценки на этом устройстве целы, войди ещё раз, чтобы они снова синхронизировались. <a href="/opinion/#login">Войти</a></span><button type="button" aria-label="Закрыть">✕</button>';
    bar.querySelector('button').addEventListener('click', () => bar.remove());
    document.body.prepend(bar);
  }

  let timer = 0, busy = false, pingAt = 0;
  async function ping() {
    if (busy || document.hidden) return;
    busy = true;
    pingAt = Date.now();
    try {
      const t = token();
      const r = await fetch('/api/ping', {
        method: 'POST', cache: 'no-store',
        headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) },
        body: JSON.stringify(t ? {} : { guest: guestId() }),
      });
      if (r.ok) {
        const d = await r.json();
        if (t && d.authed === false) sessionGone();
        // пока сокет жив, он главнее: ответ пинга, который был в пути, ничего не меняет
        if (rtLive()) return;
        apply(d, false);
        if (d.rt) startRT();
      }
    } catch (e) {} finally { busy = false; }
  }
  // снимок присутствия: ответ пинга или state из сокета (там у друзей ещё on — сайт открыт прямо сейчас)
  function apply(d, fromRT) {
    st.online = +d.online || 0;
    st.friends = new Map((d.friends || []).map((x) => [x.id, +x.at || Date.now()]));
    // комната знает точно, у кого сайт открыт сейчас: остальные недавно ушли, даже если заходили минуту назад
    st.on = new Set(fromRT ? (d.friends || []).filter((x) => x.on).map((x) => x.id) : []);
    st.left = new Set(fromRT ? (d.friends || []).filter((x) => !x.on).map((x) => x.id) : []);
    st.incoming = +d.incoming || 0;
    st.ready = true;
    render();
    announce(d.announce);
  }
  function render() {
    paint(document);
    // общий счётчик «N на сайте» на всех страницах
    const bump = (n, v) => { if (!n || n.textContent === String(v)) return; n.textContent = v; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); };
    document.querySelectorAll('[data-online-count]').forEach((el) => { bump(el.querySelector('b'), st.online); el.hidden = false; });
    // кнопка «Друзья»: зелёная цифра — друзья в сети, красная — заявки, которые ждут ответа
    const on = new Set([...st.friends.keys(), ...st.on].filter((id) => seen(id).on)).size;
    document.querySelectorAll('[data-friends-btn]').forEach((el) => {
      const g = el.querySelector('.fb-on'), r = el.querySelector('.fb-req');
      if (g) { g.hidden = !on; if (on) bump(g, on); }
      if (r) { r.hidden = !st.incoming; if (st.incoming) bump(r, st.incoming); }
      el.title = 'Друзья' + (on ? ` · в сети: ${on}` : '') + (st.incoming ? ` · заявок: ${st.incoming}` : '');
    });
    document.dispatchEvent(new CustomEvent('casual-online', { detail: { online: st.online, friends: [...new Set([...st.friends.keys(), ...st.on])] } }));
  }

  // ---------- присутствие вживую: WebSocket к комнате PresenceDO ----------
  let rt = null, rtToken = null, hideT = 0;
  const rtLive = () => !!(rt && rt.live());
  function startRT() {
    if (rt) return;
    const go = () => {
      if (rt || !window.CasualRT || document.hidden) return;
      rtToken = token();
      rt = window.CasualRT.open('/api/presence/ws', {
        protocols: () => { const t = token(); rtToken = t; return t ? ['casualhub', 'bearer.' + t] : ['casualhub', 'guest.' + guestId()]; },
        onMessage: onRT,
        // сокет жив — пинг и опрос объявления не нужны; оборвался — снова они, пока он переподключается
        onStatus: (open) => { clearInterval(timer); clearInterval(annTimer); if (!open && !document.hidden) { timer = setInterval(ping, 60e3); annTimer = setInterval(pollAnnounce, 15e3); } },
      });
    };
    if (window.CasualRT) { go(); return; }
    if (document.querySelector('script[src="/ws-client.js"]')) return;
    const sc = document.createElement('script');
    sc.src = '/ws-client.js';
    sc.onload = go;
    document.head.appendChild(sc);
  }
  function stopRT() { if (rt) { rt.close(); rt = null; } }
  function onRT(m) {
    if (m.t === 'state') {
      if (rtToken && m.authed === false) sessionGone();
      apply(m, true);
    } else if (m.t === 'friend') {
      if (m.on) { st.on.add(m.id); st.left.delete(m.id); } else { st.on.delete(m.id); st.left.add(m.id); }
      st.friends.set(m.id, +m.at || Date.now());
      render();
    } else if (m.t === 'count') { st.online = +m.online || 0; render(); }
    else if (m.t === 'announce') announce(m.announce);
    else if (m.t === 'notify') notify(m);
  }
  // вошёл или вышел в этой вкладке или в другой: сокет переподключается уже с новым токеном (или гостем)
  setInterval(() => { if (rt && token() !== rtToken) { stopRT(); startRT(); } }, 5000);

  // ---------- уведомление: друг отреагировал или написал, пока ты на сайте ----------
  const RXI = { fire: '🔥', skull: '💀', nope: '🙅', lol: '😂', love: '😍', like: '👍', dislike: '👎', think: '🤔', cry: '😭', clown: '🤡', moai: '🗿', goat: '🐐' };
  const CM_ICON = '<span class="u-old">💬</span><svg class="u-new" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/></svg>';
  const ratingName = (rid) => { const rs = read('ocenshik.ratings.v2'); const r = Array.isArray(rs) && rs.find((x) => x && x.id === rid); return r && r.name ? String(r.name).slice(0, 80) : ''; };
  let noteT = 0;
  function notify(n) {
    const who = (n.from && (n.from.username || (n.from.handle ? '@' + n.from.handle : ''))) || 'Друг';
    let what = '', href = '/', ico = '', sub = n.text || '';
    if (n.kind === 'react') {
      const tier = /^t\./.test(n.rid || ''), name = tier ? '' : ratingName(n.rid);
      ico = (n.emoji && RXI[n.emoji]) || '';
      href = tier ? '/tierlist/#l=' + encodeURIComponent(n.rid.slice(2)) : '/opinion/#r=' + encodeURIComponent(n.rid || '');
      what = tier ? (ico ? `${ico} на твой тир-лист` : 'комментарий к твоему тир-листу')
        : n.emoji === 'nope' ? '🙅 «не согласен» на твою оценку' : ico ? `${ico} на твою оценку` : name ? `комментарий к «${name}»` : 'комментарий к твоей оценке';
      // как в ленте на главной: под реакцией — на какую оценку и что дописал друг
      if (ico && name) sub = [`«${name}»`, n.text].filter(Boolean).join(' · ');
    } else {
      const t = String(n.target || '');
      if (t === 'wall') { what = 'написал на твоей стене'; href = '/profile/#wallSec'; }
      else if (t.startsWith('t.')) { what = 'комментарий к твоему тир-листу'; href = '/tierlist/#l=' + encodeURIComponent(t.slice(2)); }
      else { const name = ratingName(t.slice(2)); what = name ? `комментарий к «${name}»` : 'комментарий к твоей оценке'; href = '/opinion/#r=' + encodeURIComponent(t.slice(2)); }
    }
    if (!document.getElementById('noteCss')) {
      const css = document.createElement('style');
      css.id = 'noteCss';
      css.textContent = `.site-note { position: fixed; z-index: 95; top: max(12px, env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); width: min(440px, calc(100vw - 32px)); box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 12px; border-radius: 14px; border: 1px solid var(--line, #2a2b30); background: var(--panel, #17181c); color: var(--ink, #f2f2f2); box-shadow: 0 12px 32px rgb(0 0 0 / .28); font-size: 14px; line-height: 1.35; animation: note-in .35s cubic-bezier(.34, 1.56, .64, 1); }
.site-note i { flex: none; width: 28px; font-style: normal; font-size: 20px; line-height: 1; text-align: center; color: var(--accent, #3550E8); }
.site-note a { flex: 1; min-width: 0; display: grid; gap: 2px; color: inherit; text-decoration: none; }
.site-note b { font-weight: 700; overflow-wrap: anywhere; }
.site-note small { overflow: hidden; color: var(--ink-2, #b5b5b5); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.site-note small:empty { display: none; }
.site-note button { flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; color: var(--ink-2, #b5b5b5); font: inherit; cursor: pointer; }
.site-note button:hover { background: color-mix(in srgb, var(--ink, #fff) 10%, transparent); color: var(--ink, #fff); }
@keyframes note-in { from { transform: translate(-50%, -16px) scale(.96); } }
@media (prefers-reduced-motion: reduce) { .site-note { animation: none; } }`;
      document.head.appendChild(css);
    }
    let box = document.getElementById('siteNote');
    if (!box) {
      box = document.createElement('div');
      box.id = 'siteNote';
      box.className = 'site-note';
      box.setAttribute('role', 'status');
      box.innerHTML = '<i aria-hidden="true"></i><a><b></b><small></small></a><button type="button" aria-label="Закрыть уведомление">✕</button>';
      box.querySelector('button').addEventListener('click', () => { clearTimeout(noteT); box.remove(); });
      document.body.appendChild(box);
    }
    // имя и текст — только как текст: их написал человек
    box.querySelector('i').innerHTML = n.kind === 'react' && ico ? '' : CM_ICON;
    if (n.kind === 'react' && ico) box.querySelector('i').textContent = ico;
    box.querySelector('a').href = href;
    box.querySelector('b').textContent = `${who}: ${what}`;
    box.querySelector('small').textContent = sub;
    clearTimeout(noteT);
    noteT = setTimeout(() => box.remove(), 9000);
    document.dispatchEvent(new CustomEvent('casual-notify', { detail: n }));
  }
  let annTimer = 0;
  async function pollAnnounce() {
    if (document.hidden) return;
    try { const r = await fetch('/api/announce', { cache: 'no-store' }); if (r.ok) announce((await r.json()).announce); } catch (e) {}
  }
  const start = () => {
    clearInterval(timer); clearInterval(annTimer);
    if (rtLive()) return;
    // вкладку то прячут, то открывают (на телефоне — при каждом переключении): пинг не чаще раза в 15 секунд
    if (Date.now() - pingAt > 15e3) ping();
    timer = setInterval(ping, 60e3); annTimer = setInterval(pollAnnounce, 15e3);
  };
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hideT);
    if (document.hidden) { clearInterval(timer); clearInterval(annTimer); hideT = setTimeout(stopRT, WINDOW); }
    else start();
  });
  // объявление закрыли в другой вкладке — убираем и здесь
  addEventListener('storage', (e) => { if (e.key === ANN_KEY) { const bar = document.getElementById('siteAnnounce'); if (bar && bar.dataset.id === e.newValue) bar.remove(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
