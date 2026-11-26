/* Казуал Хаб: «в сети», счётчик «N на сайте», заявки в друзья, объявление сайта и уведомления о реакциях и комментариях.
   С комнатой присутствия (ответ POST /ping с rt: true) всё приходит по WebSocket сразу: друг открыл сайт или закрыл
   последнюю вкладку, объявление, новая заявка, реакция. Без неё — как раньше: пинг раз в минуту, объявление раз в 15 секунд.
   Вкладку спрятали дольше чем на 2,5 минуты — сокет закрывается, «в сети» значит «сейчас на сайте». */
(() => {
  const read = window.CasualUtil.read; // общий, /util.js
  const GUEST_KEY = 'casualhub.guestId.v1';
  const WINDOW = 150e3; // «в сети» — заходил за последние 2,5 минуты, как на сервере
  // on — друзья, у кого сайт открыт сейчас (по сокету), left — закрыли последнюю вкладку: уже не «в сети»
  const st = { online: 0, friends: new Map(), incoming: 0, ready: false, on: new Set(), left: new Set() };
  // «N на сайте»: при заходе на страницу — последнее известное число (не старше 10 минут), а не прочерк до ответа сервера
  const OC_KEY = 'casualhub.online.last';
  let ocSaved = -1;
  try {
    const c = JSON.parse(localStorage.getItem(OC_KEY) || 'null');
    if (c && c.n > 0 && Date.now() - c.at < 6e5) {
      const early = () => document.querySelectorAll('[data-online-count] b').forEach((b) => { if (b.textContent.trim() === '—') b.textContent = c.n; });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', early); else early();
    }
  } catch (e) {}

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

  // ---------- объявления: окно при заходе, один раз ----------
  // Окно показывается каждому один раз: закрыл — id запоминается в браузере (ANN_KEY, список) и, если вошёл, в аккаунте
  // (/api/announce/seen), поэтому на другом устройстве то же объявление не всплывёт. Тематическая неделя приходит своим
  // объявлением (kind 'event'), а пока она идёт, внизу слева у всех висит таймер (eventChip).
  const ANN_KEY = 'casualhub.announceSeen.v1';
  const seenList = () => {
    let v = '';
    try { v = localStorage.getItem(ANN_KEY) || ''; } catch (e) {}
    if (!v) return [];
    if (v[0] !== '[') return [v]; // раньше хранился один id
    try { return JSON.parse(v).filter((x) => typeof x === 'string'); } catch (e) { return []; }
  };
  const remember = (id) => { try { localStorage.setItem(ANN_KEY, JSON.stringify([...new Set([...seenList(), id])].slice(-30))); } catch (e) {} };
  const authH = () => { const t = token(); return t ? { authorization: 'Bearer ' + t } : null; };
  const ICONS = {
    info: '<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>',
    warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    party: '<path d="M4 20 9 7l8 8z"/><path d="M13 4v2M18 6l-1.5 1.5M20 11h-2M14 9l1-1"/>',
    event: '<path d="M12 3c1 3.5 4.5 5 4.5 9.5A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.5C7.5 10 9 9 9.5 7c1 1.5 2 2 2.5 2.5C12.5 7.5 12 5 12 3z"/><path d="M8 21h8"/>',
  };
  const LABEL = { info: 'Объявление', warn: 'Важно', party: 'Праздник', event: 'Тематическая неделя' };
  const pad = (n) => String(n).padStart(2, '0');
  const left = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(t / 86400); return (d ? d + ' д ' : '') + pad(Math.floor(t / 3600) % 24) + ':' + pad(Math.floor(t / 60) % 60) + ':' + pad(t % 60); };
  let annCur = null, evCur = null, annBusy = '';
  function annCss() {
    if (document.getElementById('annCss')) return;
    const css = document.createElement('style');
    css.id = 'annCss';
    css.textContent = `.site-ann { position: relative; z-index: 50; display: flex; align-items: center; gap: 10px; max-width: 1180px; margin: 10px auto 0; padding: 10px 12px 10px 16px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--ann) 45%, transparent); background: color-mix(in srgb, var(--ann) 14%, var(--panel, #161920)); color: var(--ink, #e8eaf0); font: 600 14px/1.4 var(--font-body, system-ui, sans-serif); animation: ann-in .3s cubic-bezier(.34, 1.56, .64, 1); }
.site-ann[data-kind="info"] { --ann: var(--accent, #3550E8); } .site-ann[data-kind="warn"] { --ann: var(--mid, #EAA92C); } .site-ann[data-kind="party"] { --ann: var(--good, #2EAD60); }
.site-ann span { flex: 1; min-width: 0; overflow-wrap: anywhere; } .site-ann i { font-style: normal; font-size: 18px; }
.site-ann button { flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ann) 20%, transparent); color: inherit; font: inherit; cursor: pointer; }
@keyframes ann-in { from { transform: translateY(-14px) scale(.97); } }
@media (max-width: 1220px) { .site-ann { margin: 10px 16px 0; } }
.site-ann a { color: inherit; font-weight: 800; }
@media (prefers-reduced-motion: reduce) { .site-ann { animation: none; } }
.ann-modal { position: fixed; inset: 0; z-index: 96; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg, #0d0f14) 50%, transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.ann-box { --ann: var(--accent, #3550E8); position: relative; width: min(100%, 480px); max-height: calc(100 * var(--dvh, 1vh) - 32px); overflow-y: auto; display: grid; gap: 14px; padding: 20px 18px 16px; border-radius: 22px; border: 2px solid var(--ann);
  background: linear-gradient(160deg, var(--panel, #161920), color-mix(in srgb, var(--ann) 14%, var(--panel, #161920))); color: var(--ink, #e8eaf0); box-shadow: 0 30px 70px -24px rgba(0, 0, 0, .55), 0 14px 34px -18px color-mix(in srgb, var(--ann) 70%, transparent); animation: ann-pop .3s cubic-bezier(.34, 1.56, .64, 1) both; font-family: var(--font-body, system-ui, sans-serif); }
.ann-box[data-kind="warn"] { --ann: var(--mid, #EAA92C); } .ann-box[data-kind="party"] { --ann: var(--good, #2EAD60); } .ann-box[data-kind="event"] { --ann: #F28E4C; }
@keyframes ann-pop { from { transform: translateY(40px) scale(.9); } }
.ann-head { display: flex; align-items: center; gap: 12px; padding-right: 36px; }
.ann-ico { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: color-mix(in srgb, var(--ann) 22%, transparent); color: var(--ann); }
.ann-head small { display: block; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ann); }
.ann-head b { display: block; font-size: 19px; line-height: 1.2; font-weight: 800; }
.ann-text { margin: 0; font-size: 15px; line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; color: var(--ink, #e8eaf0); }
.ann-text.small { font-size: 13.5px; color: var(--ink-2, #b5b5b5); }
.ann-note { margin: 0; padding: 4px 0 4px 12px; border-left: 3px solid var(--ann); font-size: 16px; line-height: 1.5; font-weight: 600; white-space: pre-line; overflow-wrap: anywhere; color: var(--ink, #e8eaf0); }
.ann-facts { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 13.5px; line-height: 1.45; color: var(--ink-2, #b5b5b5); }
.ann-facts li { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 6px; }
.ann-facts li::before { content: ''; width: 6px; height: 6px; margin-top: 7px; border-radius: 50%; background: var(--ann); }
.ann-ev { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 12px; border-radius: 14px; background: color-mix(in srgb, var(--ann) 12%, transparent); }
.ann-ev .x { font-family: var(--font-display, inherit); font-size: 30px; line-height: 1; color: var(--ann); }
.ann-ev span { font-size: 13.5px; color: var(--ink-2, #b5b5b5); } .ann-ev b { color: var(--ink, #fff); font-variant-numeric: tabular-nums; }
.ann-acts { display: flex; justify-content: flex-end; }
.ann-ok { height: 44px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--ann); color: #fff; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
.ann-x { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border: 0; border-radius: 50%; background: var(--panel-2, #1d2029); color: var(--ink-2, #b5b5b5); font: inherit; font-size: 15px; cursor: pointer; }
@media (max-width: 560px) { .ann-ok { flex: 1; } }
.ev-chip { position: fixed; left: max(14px, env(safe-area-inset-left, 0px)); bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); z-index: 61; display: flex; align-items: center; gap: 8px; max-width: calc(100 * var(--vw, 1vw) - 92px); height: 44px; padding: 0 14px 0 6px; border-radius: 999px;
  border: 1.5px solid color-mix(in srgb, #F28E4C 70%, transparent); background: color-mix(in srgb, #F28E4C 14%, var(--panel, #161920)); color: var(--ink, #e8eaf0); font: 600 13.5px/1 var(--font-body, system-ui, sans-serif); cursor: pointer; box-shadow: 0 10px 26px -14px rgba(0, 0, 0, .7); animation: ann-pop .35s cubic-bezier(.34, 1.56, .64, 1) both; }
.ev-chip .x { display: grid; place-items: center; min-width: 32px; height: 32px; padding: 0 6px; border-radius: 999px; background: #F28E4C; color: #1a0f05; font-weight: 900; }
.ev-chip .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ev-chip b { font-variant-numeric: tabular-nums; white-space: nowrap; }
@media (max-width: 480px) { .ev-chip .t { display: none; } }
/* есть место слева от шапки — таймер в левом верхнем углу, по середине шапки (top ставит placeChip) */
.ev-chip.top { position: absolute; bottom: auto; top: 14px; transform: translateY(-50%); max-width: none; animation-name: ev-top; }
@keyframes ev-top { from { transform: translateY(-50%) scale(.85); opacity: 0; } }
.ev-chip.mini .t { display: none; }
@media (prefers-reduced-motion: reduce) { .ann-box, .ev-chip { animation: none; } }`;
    document.head.appendChild(css);
  }
  function closeModal(mark) {
    const m = document.getElementById('annModal');
    if (!m) return;
    const id = m.dataset.id;
    m.remove();
    if (mark && id) {
      remember(id);
      const h = authH();
      if (h) fetch('/api/announce/seen', { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
    }
    if (m.prevFocus && m.prevFocus.isConnected) m.prevFocus.focus({ preventScroll: true });
  }
  // окно объявления; повтор (кнопка таймера) — без пометки «прочитано»
  function showModal(a, again) {
    annCss();
    closeModal(false);
    const kind = LABEL[a.kind] ? a.kind : 'info';
    const m = document.createElement('div');
    m.id = 'annModal';
    m.className = 'ann-modal';
    m.dataset.id = again ? '' : a.id;
    m.prevFocus = document.activeElement;
    const ev = kind === 'event' && evCur && evCur.until > Date.now() ? evCur : null;
    m.innerHTML = `<div class="ann-box" data-kind="${kind}" role="dialog" aria-modal="true" aria-labelledby="annTitle">
      <button type="button" class="ann-x" aria-label="Закрыть">✕</button>
      <div class="ann-head"><span class="ann-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind]}</svg></span><span id="annTitle"><small>${LABEL[kind]}</small><b></b></span></div>
      <p class="ann-note" hidden></p>
      <p class="ann-text"></p>
      ${ev ? `<div class="ann-ev"><span class="x">×${String(ev.mult).replace('.', ',')}</span><span>До конца: <b data-ev-left>${left(ev.until - Date.now())}</b></span></div>` : ''}
      <div class="ann-acts"><button type="button" class="ann-ok">Понятно</button></div></div>`;
    // текст объявления — только как текст, без разметки
    m.querySelector('.ann-head b').textContent = a.title || (kind === 'event' && ev ? ev.title : LABEL[kind]);
    // свои слова (поле note) — отдельно и крупнее; строки недели и скидки («×2 опыта за…», «До…») — списком, мельче
    const note = m.querySelector('.ann-note'), txt = m.querySelector('.ann-text');
    if (a.note) { note.textContent = a.note; note.hidden = false; }
    const facts = kind === 'event' || /^sale-/.test(a.id || '') ? String(a.text).split(/(?<=\.)\s+(?=[А-ЯЁA-Z×])/).filter(Boolean) : [];
    if (facts.length > 1) {
      const ul = document.createElement('ul');
      ul.className = 'ann-facts';
      facts.forEach((f) => { const li = document.createElement('li'); li.textContent = f.replace(/\.$/, ''); ul.appendChild(li); });
      txt.replaceWith(ul);
    } else {
      txt.textContent = a.text;
      if (a.note) txt.classList.add('small');
    }
    const done = () => closeModal(!again);
    m.querySelector('.ann-ok').addEventListener('click', done);
    m.querySelector('.ann-x').addEventListener('click', done);
    m.addEventListener('click', (e) => { if (e.target === m) done(); });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(); } });
    document.body.appendChild(m);
    m.querySelector('.ann-ok').focus({ preventScroll: true });
  }
  async function announce(a, ev) {
    annCss();
    if (ev !== undefined) eventChip(ev);
    annCur = a && a.text ? a : null;
    const open = document.getElementById('annModal');
    if (!annCur) { if (open && open.dataset.id) closeModal(false); return; }
    if (location.pathname.startsWith('/admin')) return; // в админке окно не мешает работе
    if (seenList().includes(annCur.id) || annBusy === annCur.id || (open && open.dataset.id === annCur.id)) return;
    annBusy = annCur.id;
    const cur = annCur;
    // вошёл: вдруг уже прочитал на другом устройстве
    const h = authH();
    if (h) {
      try {
        const r = await fetch('/api/announce/seen?id=' + encodeURIComponent(cur.id), { headers: h, cache: 'no-store' });
        if (r.ok && (await r.json()).seen) { remember(cur.id); annBusy = ''; return; }
      } catch (e) {}
    }
    // поверх подсказки «Впервые тут?» не открываем: подождём, пока её закроют
    const wait = () => {
      if (annCur !== cur || seenList().includes(cur.id)) { annBusy = ''; return; }
      if (document.querySelector('.howto-modal:not([hidden]), .lv-spot, .alb-ov')) { setTimeout(wait, 1500); return; }
      annBusy = '';
      showModal(cur);
    };
    wait();
  }
  // таймер тематической недели на всех страницах, пока она идёт: в левом верхнем углу, на одной линии с шапкой,
  // а если слева от шапки места нет (телефон, узкое окно) — внизу слева. Нажатие — снова окно о неделе
  let evT = 0, evRq = 0;
  // по высоте — середина полосы кнопок шапки (у страниц с большим заголовком сам header выше полосы).
  // Места мало — без названия («×2 · 2 д 23:40»), совсем нет — внизу слева
  function placeChip() {
    const chip = document.getElementById('evChip');
    const hdr = document.querySelector('header');
    if (!chip) return;
    if (chip.dataset.plq) return; // таймер перетащили: лежит внизу, где его уронили (CasualUtil.plaque)
    chip.classList.remove('top', 'mini');
    chip.style.top = '';
    if (!hdr) return;
    const room = hdr.getBoundingClientRect().left;
    if (room < chip.offsetWidth + 32) {
      chip.classList.add('mini');
      if (room < chip.offsetWidth + 32) { chip.classList.remove('mini'); return; }
    }
    const btn = hdr.querySelector('.theme-btn, .pill') || hdr.querySelector('a, button') || hdr;
    const r = btn.getBoundingClientRect();
    chip.classList.add('top');
    chip.style.top = Math.round(r.top + scrollY + r.height / 2) + 'px';
  }
  addEventListener('resize', () => { cancelAnimationFrame(evRq); evRq = requestAnimationFrame(placeChip); });
  function eventChip(ev) {
    evCur = ev && ev.until > Date.now() ? ev : null;
    let chip = document.getElementById('evChip');
    if (!evCur) { if (chip) chip.remove(); clearInterval(evT); return; }
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.id = 'evChip';
      chip.className = 'ev-chip';
      chip.addEventListener('click', () => {
        const e = evCur;
        if (!e) return;
        const a = annCur && annCur.kind === 'event' ? annCur : { id: 'ev-' + e.id, kind: 'event', title: e.title, text: `×${String(e.mult).replace('.', ',')} опыта за: ${(e.kinds || []).join(', ')}.` };
        showModal(a, true);
      });
      document.body.appendChild(chip);
    }
    chip.innerHTML = '<span class="x"></span><span class="t"></span><b></b>';
    chip.querySelector('.x').textContent = '×' + String(evCur.mult).replace('.', ',');
    chip.querySelector('.t').textContent = evCur.title;
    chip.title = `Тематическая неделя «${evCur.title}»: ×${String(evCur.mult).replace('.', ',')} опыта за ${(evCur.kinds || []).join(', ')}`;
    const tick = () => {
      const ms = evCur ? evCur.until - Date.now() : 0;
      if (ms <= 0) { eventChip(null); return; }
      chip.querySelector('b').textContent = left(ms);
      chip.setAttribute('aria-label', `Тематическая неделя «${evCur.title}», до конца ${left(ms)}`);
      const l = document.querySelector('[data-ev-left]');
      if (l) l.textContent = left(ms);
    };
    clearInterval(evT);
    tick();
    evT = setInterval(tick, 1000);
    // таймер можно утащить и уронить вниз, куда удобно; место помнится (после текста и времени — чтобы знать ширину)
    if (window.CasualUtil && window.CasualUtil.plaque) window.CasualUtil.plaque.drag(chip, 'evChip');
    placeChip();
    setTimeout(placeChip, 600); // шапку могли достроить позже (кнопки, шрифты)
  }

  let goneShown = false;
  // gone — токен, на который сервер ответил «не вошёл». Пока ответ шёл, другая вкладка могла войти заново:
  // её свежий токен не стираем и плашку не показываем
  function sessionGone(gone) {
    let fresh = false;
    try {
      const u = read('ocenshik.user.v1'), t = read('casualhub.tokens.v1') || {};
      if (u && t[u.id] && t[u.id] === gone) { delete t[u.id]; localStorage.setItem('casualhub.tokens.v1', JSON.stringify(t)); }
      else if (u && t[u.id]) fresh = true;
    } catch (e) {}
    if (fresh || goneShown || location.pathname.startsWith('/admin')) return;
    goneShown = true;
    annCss();
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
        if (t && d.authed === false) sessionGone(t);
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
    // от сервера сайта — полное объявление и неделя; из комнаты присутствия — только знак, что пора спросить
    if (fromRT) pollAnnounce(true); else announce(d.announce, d.event);
  }
  function render() {
    paint(document);
    // общий счётчик «N на сайте» на всех страницах
    const bump = (n, v) => { if (!n || n.textContent === String(v)) return; n.textContent = v; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); };
    document.querySelectorAll('[data-online-count]').forEach((el) => { bump(el.querySelector('b'), st.online); el.hidden = false; });
    if (st.ready && st.online !== ocSaved) { ocSaved = st.online; try { localStorage.setItem(OC_KEY, JSON.stringify({ n: st.online, at: Date.now() })); } catch (e) {} }
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
    // ws-client.js нужен и мини-плееру лотов (lots-follow.js): кто попросит вторым, дождётся того же тега
    window.CasualUtil.script('/ws-client.js', () => !!window.CasualRT).then(go, () => {});
  }
  function stopRT() { if (rt) { rt.close(); rt = null; } }
  function onRT(m) {
    if (m.t === 'state') {
      if (rtToken && m.authed === false) sessionGone(rtToken);
      apply(m, true);
    } else if (m.t === 'friend') {
      if (m.on) { st.on.add(m.id); st.left.delete(m.id); } else { st.on.delete(m.id); st.left.add(m.id); }
      st.friends.set(m.id, +m.at || Date.now());
      render();
    } else if (m.t === 'count') { st.online = +m.online || 0; render(); }
    else if (m.t === 'announce') pollAnnounce(true);
    else if (m.t === 'notify') notify(m);
  }
  // вошёл или вышел в этой вкладке или в другой: сокет переподключается уже с новым токеном (или гостем)
  setInterval(() => { if (rt && token() !== rtToken) { stopRT(); startRT(); } }, 5000);
  // вход или выход без перезагрузки (окно входа в Мнении, сигнал из friends.js): заявки и друзья в сети — сразу под новым
  // входом, а не через минуту, до следующего пинга (без сокета до него на кнопке «Друзья» оставались заявки прошлого аккаунта)
  let authTok = token();
  document.addEventListener('casualhub:auth', () => {
    const t = token();
    if (t === authTok) return;
    authTok = t;
    if (rt) { stopRT(); startRT(); } else ping();
  });

  // ---------- уведомление: друг отреагировал или написал, пока ты на сайте ----------
  const RXI = { fire: '🔥', skull: '💀', nope: '🙅', lol: '😂', love: '😍', like: '👍', dislike: '👎', think: '🤔', cry: '😭', clown: '🤡', moai: '🗿', goat: '🐐' };
  const CM_ICON = '<span class="u-old">💬</span><svg class="u-new" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/></svg>';
  const ratingName = (rid) => { const rs = read('ocenshik.ratings.v2'); const r = Array.isArray(rs) && rs.find((x) => x && x.id === rid); return r && r.name ? String(r.name).slice(0, 80) : ''; };
  let noteT = 0;
  function notify(n) {
    // уровни: «у тебя награда» — плашку покажет levels-ui.js, забрав её с сервера
    if (n.kind === 'award') { document.dispatchEvent(new CustomEvent('casual-levels-news')); return; }
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
      css.textContent = `.site-note { position: fixed; z-index: 95; top: max(12px, env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); width: min(440px, calc(100 * var(--vw, 1vw) - 32px)); box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 12px; border-radius: 14px; border: 1px solid var(--line, #2a2b30); background: var(--panel, #17181c); color: var(--ink, #f2f2f2); box-shadow: 0 12px 32px rgb(0 0 0 / .28); font-size: 14px; line-height: 1.35; animation: note-in .28s cubic-bezier(.34, 1.56, .64, 1); }
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
  async function pollAnnounce(force) {
    if (document.hidden && !force) return;
    try { const r = await fetch('/api/announce', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); announce(d.announce, d.event || null); } } catch (e) {}
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
  // прочитал объявление в другой вкладке — то же окно закрывается и здесь
  addEventListener('storage', (e) => { if (e.key !== ANN_KEY) return; const m = document.getElementById('annModal'); if (m && m.dataset.id && seenList().includes(m.dataset.id)) closeModal(false); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
