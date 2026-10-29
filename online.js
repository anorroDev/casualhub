/* Казуал Хаб: кто сейчас на сайте.
   Пока вкладка открыта и видна, раз в минуту отмечаемся на сервере (/api/ping): вошедший — токеном,
   гость — случайным id из своего браузера. В ответ приходит, сколько людей на сайте и кто из друзей в сети.
   Страницы слушают событие «casual-online» и берут данные из window.CasualOnline. */
(() => {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const GUEST_KEY = 'casualhub.guestId.v1';
  const WINDOW = 150e3; // «в сети» — заходил за последние 2,5 минуты, как на сервере
  const st = { online: 0, friends: new Map(), incoming: 0, ready: false };

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
    const t = Math.max(st.friends.get(id) || 0, +lastSeen || 0);
    if (!t) return { on: false, text: '' };
    const m = Math.floor((Date.now() - t) / 60e3);
    if (Date.now() - t < WINDOW) return { on: true, text: 'в сети' };
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

  // объявление из админки: плашка вверху страницы, пока его не закрыли (закрытое не всплывает снова, пока не появится новое)
  const ANN_KEY = 'casualhub.announceSeen.v1';
  function announce(a) {
    let bar = document.getElementById('siteAnnounce');
    let seenId = '';
    try { seenId = localStorage.getItem(ANN_KEY) || ''; } catch (e) {}
    if (!a || !a.text || a.id === seenId) { if (bar) bar.remove(); return; }
    if (bar && bar.dataset.id === a.id) return;
    if (!document.getElementById('annCss')) {
      const css = document.createElement('style');
      css.id = 'annCss';
      css.textContent = `.site-ann { position: relative; z-index: 50; display: flex; align-items: center; gap: 10px; max-width: 1180px; margin: 10px auto 0; padding: 10px 12px 10px 16px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--ann) 45%, transparent); background: color-mix(in srgb, var(--ann) 14%, var(--panel, #161920)); color: var(--ink, #e8eaf0); font: 600 14px/1.4 var(--font-body, system-ui, sans-serif); animation: ann-in .5s cubic-bezier(.34, 1.56, .64, 1); }
.site-ann[data-kind="info"] { --ann: var(--accent, #3550E8); } .site-ann[data-kind="warn"] { --ann: var(--mid, #EAA92C); } .site-ann[data-kind="party"] { --ann: var(--good, #2EAD60); }
.site-ann span { flex: 1; min-width: 0; overflow-wrap: anywhere; } .site-ann i { font-style: normal; font-size: 18px; }
.site-ann button { flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ann) 20%, transparent); color: inherit; font: inherit; cursor: pointer; }
@keyframes ann-in { from { transform: translateY(-14px) scale(.97); } }
@media (max-width: 1220px) { .site-ann { margin: 10px 16px 0; } }
@media (prefers-reduced-motion: reduce) { .site-ann { animation: none; } }`;
      document.head.appendChild(css);
    }
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
    bar.querySelector('i').textContent = a.kind === 'warn' ? '⚠️' : a.kind === 'party' ? '🎉' : '📢';
    bar.querySelector('span').textContent = a.text;
    bar.querySelector('button').addEventListener('click', () => { try { localStorage.setItem(ANN_KEY, a.id); } catch (e) {} bar.remove(); });
  }

  let timer = 0, busy = false;
  async function ping() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const t = token();
      const r = await fetch('/api/ping', {
        method: 'POST', cache: 'no-store',
        headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) },
        body: JSON.stringify(t ? {} : { guest: guestId() }),
      });
      if (r.ok) {
        const d = await r.json();
        st.online = +d.online || 0;
        st.friends = new Map((d.friends || []).map((x) => [x.id, +x.at || Date.now()]));
        st.incoming = +d.incoming || 0;
        st.ready = true;
        paint(document);
        // общий счётчик «N на сайте» на всех страницах
        const bump = (n, v) => { if (n.textContent === String(v)) return; n.textContent = v; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); };
        document.querySelectorAll('[data-online-count]').forEach((el) => { bump(el.querySelector('b'), st.online); el.hidden = false; });
        // кнопка «Друзья»: зелёная цифра — друзья в сети, красная — заявки, которые ждут ответа
        const on = [...st.friends.keys()].filter((id) => seen(id).on).length;
        document.querySelectorAll('[data-friends-btn]').forEach((el) => {
          const g = el.querySelector('.fb-on'), r = el.querySelector('.fb-req');
          if (g) { g.hidden = !on; if (on) bump(g, on); }
          if (r) { r.hidden = !st.incoming; if (st.incoming) bump(r, st.incoming); }
          el.title = 'Друзья' + (on ? ` · в сети: ${on}` : '') + (st.incoming ? ` · заявок: ${st.incoming}` : '');
        });
        announce(d.announce);
        document.dispatchEvent(new CustomEvent('casual-online', { detail: { online: st.online, friends: [...st.friends.keys()] } }));
      }
    } catch (e) {} finally { busy = false; }
  }
  const start = () => { clearInterval(timer); ping(); timer = setInterval(ping, 60e3); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else start(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
