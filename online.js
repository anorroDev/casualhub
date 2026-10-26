/* Казуал Хаб: кто сейчас на сайте.
   Пока вкладка открыта и видна, раз в минуту отмечаемся на сервере (/api/ping): вошедший — токеном,
   гость — случайным id из своего браузера. В ответ приходит, сколько людей на сайте и кто из друзей в сети.
   Страницы слушают событие «casual-online» и берут данные из window.CasualOnline. */
(() => {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const GUEST_KEY = 'casualhub.guestId.v1';
  const WINDOW = 150e3; // «в сети» — заходил за последние 2,5 минуты, как на сервере
  const st = { online: 0, friends: new Map(), ready: false };

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
  css.textContent = '.on-dot{display:none;flex:none;width:8px;height:8px;border-radius:50%;background:var(--good,#2EAD60);box-shadow:0 0 0 2px color-mix(in srgb,var(--good,#2EAD60) 30%,transparent);vertical-align:middle}.on-dot.on{display:inline-block}[data-seen].on{color:var(--good,#2EAD60);font-weight:700}[data-seen]:empty{display:none}';
  document.head.appendChild(css);
  window.CasualOnline = {
    paint,
    get count() { return st.online; },
    get ready() { return st.ready; },
    isOnline: (id) => seen(id).on,
    friendsOnline: () => [...st.friends.keys()].filter((id) => seen(id).on),
    seen,
    ping: () => ping(),
  };

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
        st.ready = true;
        paint(document);
        document.dispatchEvent(new CustomEvent('casual-online', { detail: { online: st.online, friends: [...st.friends.keys()] } }));
      }
    } catch (e) {} finally { busy = false; }
  }
  const start = () => { clearInterval(timer); ping(); timer = setInterval(ping, 60e3); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else start(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
