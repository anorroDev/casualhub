// Казуал Хаб: чат на странице сбора (/lots/<код>). Виджет — /chat.js (CasualChat), сервер — functions/_lib/chat.js.
// Снимок сбора приходит от lots/app.js событием casualhub:lots: по нему карточка «Чат» встаёт в раскладку один раз.
// На широком экране она справа над лотами (колесо слева на всю высоту), на телефоне — своя вкладка «Чат» в переключателе
// сверху: вкладки переключает lots/app.js сам (data-section), здесь только кнопка и значок новых сообщений.
(() => {
  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.5L6 19.5V16H7a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M8.5 9h7M8.5 12h4.5"/></svg>';
  let chat = null, card = null;
  function tab() {
    const nav = document.getElementById('mnav');
    if (!nav || nav.querySelector('[data-section="chat"]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.section = 'chat';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `${ICON}<span>Чат<i class="ch-badge" hidden></i></span>`;
    nav.appendChild(b);
    nav.classList.add('has-chat');
  }
  function badge(n) {
    const i = document.querySelector('#mnav [data-section="chat"] .ch-badge');
    if (!i) return;
    i.hidden = !n;
    i.textContent = n > 99 ? '99+' : String(n || '');
  }
  document.addEventListener('casualhub:lots', (e) => {
    const d = e.detail || {};
    if (!d.room || !/^[A-Za-z0-9]{12}$/.test(d.code || '') || !window.CasualChat) return;
    if (card && card.isConnected) { chat.setModerate(!!d.room.own); return; }
    const view = document.getElementById('view'), board = view && view.querySelector(':scope > .board');
    if (!board) return;
    if (chat) chat.destroy();
    card = document.createElement('section');
    card.className = 'card ch-card';
    card.setAttribute('aria-label', 'Чат');
    board.before(card);
    view.classList.add('has-chat');
    tab();
    chat = window.CasualChat.mount(card, { scope: 'lots', room: d.code, canModerate: !!d.room.own, onUnread: badge });
  });
})();
