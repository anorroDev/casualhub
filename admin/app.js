/* Админ-панель Казуал Хаба. Кто админ, решает сервер (/api/admin/me): остальным страница отвечает «нет доступа».
   Первый вход — одноразовый пароль (секрет ADMIN_CODE в Cloudflare), сразу после него админ задаёт свой пин-код.
   Дальше админка открывается пин-кодом на 12 часов на этом устройстве (вход привязан к сессии на сервере).
   Забытый пин-код сбрасывается одноразовым паролем. */
(() => {
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const user = read('ocenshik.user.v1');
  const token = user && (read('casualhub.tokens.v1') || {})[user.id];
  const call = (method, path, body) => fetch('/api' + path, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Не получилось, попробуй ещё раз'), { status: r.status });
    return d;
  });
  const SHIELD = (s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l8 3v6.2c0 4.9-3.4 8.6-8 10-4.6-1.4-8-5.1-8-10V5.5z"/><path d="M8.5 12l2.5 2.5 4.6-5"/></svg>`;
  const LOCK = (s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></svg>`;
  // запоминаем, что админка открывалась: кнопка «Админ» в шапке останется и после смены юзернейма
  const remember = () => { try { localStorage.setItem('casualhub.admin.v1', user.id); } catch (e) {} };
  let me = { handle: '' };

  function message(title, text, actions) {
    app.innerHTML = `<section class="card rise adm-lock"><span class="adm-ic">${SHIELD(30)}</span><h1 class="h2">${esc(title)}</h1><p class="muted">${text}</p>${actions || ''}</section>`;
  }
  // окно с одной формой: заголовок, текст, поля, кнопка и ссылки под ней
  function gate({ icon, title, text, fields, button, links, onSubmit }) {
    app.innerHTML = `<section class="card rise adm-lock" id="admLock">
      <span class="adm-ic">${icon}</span>
      <h1 class="h2">${esc(title)}</h1>
      <p class="muted">${text}</p>
      <form id="admForm" autocomplete="off" novalidate>${fields}
        <p class="adm-err" id="admErr" role="alert"></p>
        <button type="submit" class="btn primary">${esc(button)}</button>
      </form>${links || ''}
    </section>`;
    const form = $('#admForm'), err = $('#admErr'), box = $('#admLock');
    const first = form.querySelector('input');
    if (first) first.focus();
    // в пин-коде только цифры
    // буквы молча не пропадают: говорим, что тут нужны цифры (частая ошибка — вводить сюда пароль от аккаунта)
    form.querySelectorAll('input[data-pin]').forEach((i) => i.addEventListener('input', () => {
      const clean = i.value.replace(/\D/g, '').slice(0, 8);
      if (clean !== i.value && /\D/.test(i.value)) {
        err.textContent = 'В пин-коде только цифры 0–9. Это не пароль от аккаунта, а свой короткий код из цифр.';
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      } else if (err.textContent.startsWith('В пин-коде только цифры')) err.textContent = '';
      i.value = clean;
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (btn.disabled) return;
      btn.disabled = true; err.textContent = '';
      try { await onSubmit(form); } catch (x) {
        if (!form.isConnected) return; // форма уже сменилась другим окном
        err.textContent = x.message;
        const bad = form.querySelector('input');
        if (bad) bad.select();
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
        btn.disabled = false;
      }
    });
    return box;
  }
  const pinField = (id, label, auto) => `<label class="vh" for="${id}">${esc(label)}</label><input class="adm-in adm-pin" id="${id}" data-pin type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="${auto}" maxlength="8" placeholder="${esc(label)}">`;
  const need = (v, text) => { if (!v) throw new Error(text); };

  // одноразовый пароль: первый вход или сброс забытого пин-кода
  function codeForm(reset, note) {
    if (!me.ready) {
      message(reset ? 'Сброс пин-кода' : 'Админ-панель', `${reset ? 'Сбросить пин-код можно одноразовым паролем, но он' : 'Одноразовый пароль'} сейчас не задан на сервере. Его нужно добавить в настройках Cloudflare (секрет <b>ADMIN_CODE</b>), а потом обновить эту страницу.`,
        reset ? '<button type="button" class="btn ghost" id="admBack">Назад</button>' : '');
      const back = $('#admBack');
      if (back) back.addEventListener('click', pinForm);
      return;
    }
    gate({
      icon: SHIELD(30),
      title: reset ? 'Сброс пин-кода' : 'Вход в админку',
      text: note ? esc(note) : reset ? 'Введи одноразовый пароль, и потом задашь новый пин-код.' : `Привет, @${esc(me.handle)}! Первый раз нужно ввести одноразовый пароль. Сразу после него придумаешь свой пин-код: дальше админка будет открываться им.`,
      fields: '<label class="vh" for="admCode">Одноразовый пароль</label><input class="adm-in" id="admCode" type="password" autocomplete="one-time-code" maxlength="200" placeholder="Одноразовый пароль">',
      button: 'Дальше',
      links: reset ? '<button type="button" class="adm-link" id="admBack">Вспомнил пин-код</button>' : '',
      async onSubmit(form) {
        const code = form.querySelector('#admCode').value;
        need(code.trim(), 'Введи одноразовый пароль');
        await call('POST', '/admin/unlock', { code });
        remember();
        pinSetup();
      },
    });
    const back = $('#admBack');
    if (back) back.addEventListener('click', pinForm);
  }
  // свой пин-код: два раза, чтобы не ошибиться. Задать его можно только в первые 15 минут после одноразового пароля
  function pinSetup() {
    gate({
      icon: LOCK(30),
      title: 'Придумай пин-код',
      text: 'От 4 до 8 цифр. Им ты будешь входить в админку дальше, одноразовый пароль больше не понадобится.',
      fields: pinField('admPin', 'Пин-код', 'new-password') + pinField('admPin2', 'Ещё раз', 'new-password'),
      button: 'Сохранить пин-код',
      async onSubmit(form) {
        const a = form.querySelector('#admPin').value, b = form.querySelector('#admPin2').value;
        need(/^\d{4,8}$/.test(a), 'Пин-код — от 4 до 8 цифр');
        need(a === b, 'Пин-коды не совпадают');
        try { await call('POST', '/admin/pin/set', { pin: a }); } catch (x) {
          if (x.status === 403) { codeForm(false, x.message); return; } // 15 минут прошли: снова одноразовый пароль
          throw x;
        }
        panel();
      },
    });
  }
  function pinForm() {
    gate({
      icon: LOCK(30),
      title: 'Админ-панель',
      text: `@${esc(me.handle)}, введи свой пин-код. Вход действует 12 часов на этом устройстве.`,
      fields: pinField('admPin', 'Пин-код', 'current-password'),
      button: 'Войти',
      links: '<button type="button" class="adm-link" id="admForgot">Забыл пин-код</button>',
      async onSubmit(form) {
        const pin = form.querySelector('#admPin').value;
        need(/^\d{4,8}$/.test(pin), 'Пин-код — от 4 до 8 цифр');
        await call('POST', '/admin/pin', { pin });
        panel();
      },
    });
    $('#admForgot').addEventListener('click', () => codeForm(true));
  }

  // сама панель: пока пусто, разделы появятся позже
  function panel() {
    remember();
    document.title = 'Админ-панель · Казуал Хаб';
    app.innerHTML = `<div class="adm">
      <section class="card rise adm-hero" style="--d:0">
        <span class="adm-ic">${SHIELD(32)}</span>
        <div><span class="adm-tag">Админ</span><h1>Админ-панель</h1><p class="muted">Ты вошёл как @${esc(me.handle)}. Вход действует 12 часов на этом устройстве. Все действия записываются в журнал.</p></div>
        <button type="button" class="btn ghost adm-out" id="admOut" title="Закрыть админку: в следующий раз снова спросит пин-код">${LOCK(16)}Выйти из админки</button>
      </section>
      <nav class="adm-tabs rise" style="--d:1" role="tablist" aria-label="Разделы админки">${TABS.map(([id, ico, name]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === tab}"><span aria-hidden="true">${ico}</span>${name}</button>`).join('')}</nav>
      <section class="card rise adm-sec" id="admSec" style="--d:2" role="tabpanel"></section>
    </div>`;
    $('#admOut').addEventListener('click', async () => {
      try { await call('POST', '/admin/lock'); } catch (e) {}
      pinForm();
    });
    document.querySelector('.adm-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
      document.querySelectorAll('.adm-tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      showTab();
    });
    showTab();
  }

  // ---------- разделы админки ----------
  const TABS = [['stats', '📊', 'Статистика'], ['users', '👥', 'Пользователи'], ['comments', '💬', 'Комментарии'], ['announce', '📢', 'Объявление'], ['log', '📜', 'Журнал']];
  let tab = 'stats';
  const sec = () => $('#admSec');
  const when = (t) => (t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const fail = (x) => { const s = sec(); if (s) s.innerHTML = `<p class="adm-err">${esc(x.message)}</p>`; if (x.status === 404) pinForm(); };
  function showTab() {
    const s = sec();
    if (!s) return;
    s.innerHTML = '<p class="muted">Загружаю…</p>';
    ({ stats, users, comments, announce, log })[tab]();
  }
  async function stats() {
    try {
      const d = await call('GET', '/admin/stats');
      const tiles = [['Аккаунтов', d.users], ['Новых за неделю', d.new7], ['Заходили за сутки', d.active24], ['Сейчас на сайте', `${d.onlineUsers} + ${d.onlineGuests} гостей`], ['Оценок', d.ratings], ['Комментариев', d.comments], ['Реакций', d.reactions], ['Ссылок на отзывы', d.shares], ['Забанено', d.banned]];
      sec().innerHTML = `<div class="head"><h2 class="h2">Статистика</h2><button type="button" class="btn ghost small" id="admRe">Обновить</button></div>
        <div class="adm-stats">${tiles.map(([k, v], i) => `<div class="adm-stat" style="--k:${i}"><b>${esc(v)}</b><small>${esc(k)}</small></div>`).join('')}</div>`;
      $('#admRe').addEventListener('click', showTab);
    } catch (x) { fail(x); }
  }
  async function users(q) {
    q = q || '';
    try {
      const d = await call('GET', '/admin/users?q=' + encodeURIComponent(q));
      sec().innerHTML = `<div class="head"><h2 class="h2">Пользователи</h2><span class="label">${d.users.length}${d.users.length === 50 ? '+' : ''}</span></div>
        <form class="adm-search" id="admUq"><input class="adm-in" type="search" placeholder="@юзернейм, ник или почта" value="${esc(q)}" aria-label="Поиск пользователя"><button class="btn primary" type="submit">Найти</button></form>
        <ul class="adm-list">${d.users.map((u, i) => `<li class="adm-row${u.banned ? ' banned' : ''}" style="--k:${Math.min(i, 12)}" data-uid="${esc(u.id)}">
          <div class="adm-who"><b>${esc(u.username)}</b> <a href="/profile/?id=${encodeURIComponent(u.id)}">@${esc(u.handle)}</a>${u.admin ? ' <em class="adm-badge">админ</em>' : ''}${u.banned ? ` <em class="adm-badge bad">бан${u.banReason ? ': ' + esc(u.banReason) : ''}</em>` : ''}
            <small>${esc(u.email)} · с ${when(u.createdAt)} · был ${when(u.lastSeen)} · оценок ${u.ratings}</small></div>
          ${u.admin ? `<div class="adm-acts"><button type="button" class="btn ghost small" data-act="rename" data-h="${esc(u.handle)}">✎ Ник и @</button></div>` : `<div class="adm-acts"><button type="button" class="btn ghost small" data-act="rename" data-h="${esc(u.handle)}">✎ Ник и @</button><button type="button" class="btn ghost small" data-act="kick">Выкинуть с устройств</button><button type="button" class="btn small ${u.banned ? 'ghost' : 'danger'}" data-act="${u.banned ? 'unban' : 'ban'}">${u.banned ? 'Разбанить' : 'Забанить'}</button></div>`}
        </li>`).join('') || '<li class="muted">Никого не нашлось.</li>'}</ul>`;
      $('#admUq').addEventListener('submit', (e) => { e.preventDefault(); users(e.target.querySelector('input').value.trim()); });
      sec().querySelector('.adm-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const li = b.closest('[data-uid]'), id = li.dataset.uid, name = li.querySelector('.adm-who b').textContent;
        // новый @юзернейм и ник: пустое поле — оставить как есть
        if (b.dataset.act === 'rename') {
          const h = prompt(`Новый @юзернейм для ${name} (латиница, цифры, «_» и «.», 3–20 символов). Пусто — не менять:`, b.dataset.h);
          if (h === null) return;
          const n = prompt(`Новый ник для ${name} (2–24 символа). Пусто — не менять:`, name);
          if (n === null) return;
          b.disabled = true;
          try { await call('POST', `/admin/rename/${encodeURIComponent(id)}`, { handle: h.trim() === b.dataset.h ? '' : h.trim(), username: n.trim() === name ? '' : n.trim() }); users(q); } catch (x) { alert(x.message); b.disabled = false; }
          return;
        }
        let body = null;
        if (b.dataset.act === 'ban') {
          const reason = prompt(`Забанить ${name}? Причина (её увидит он сам при входе), можно пусто:`, '');
          if (reason === null) return;
          body = { on: true, reason };
        } else if (b.dataset.act === 'unban') body = { on: false };
        else if (!confirm(`Выкинуть ${name} со всех устройств? Ему придётся войти заново.`)) return;
        b.disabled = true;
        try { await call('POST', `/admin/${body ? 'ban' : 'kick'}/${encodeURIComponent(id)}`, body || {}); users(q); } catch (x) { alert(x.message); b.disabled = false; }
      });
    } catch (x) { fail(x); }
  }
  async function comments() {
    try {
      const d = await call('GET', '/admin/comments');
      sec().innerHTML = `<div class="head"><h2 class="h2">Комментарии</h2><span class="label">последние ${d.items.length}</span></div>
        <ul class="adm-list">${d.items.map((c, i) => `<li class="adm-row" style="--k:${Math.min(i, 12)}" data-cid="${esc(c.id)}">
          <div class="adm-who"><b>${esc(c.from.username)}</b> <small class="inl">@${esc(c.from.handle)} → ${c.where === 'wall' ? 'стена' : 'оценка'} @${esc(c.owner.handle)} · ${when(c.at)}</small><p class="adm-text">${esc(c.text)}</p></div>
          <div class="adm-acts"><button type="button" class="btn small danger" data-del>Удалить</button></div></li>`).join('') || '<li class="muted">Комментариев пока нет.</li>'}</ul>`;
      sec().querySelector('.adm-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del]');
        if (!b || !confirm('Удалить этот комментарий?')) return;
        const li = b.closest('[data-cid]');
        b.disabled = true;
        try { await call('DELETE', '/admin/comment/' + encodeURIComponent(li.dataset.cid)); li.classList.add('gone'); setTimeout(() => li.remove(), 300); } catch (x) { alert(x.message); b.disabled = false; }
      });
    } catch (x) { fail(x); }
  }
  async function announce() {
    try {
      const { announce: a } = await call('GET', '/admin/announce');
      const live = a && a.text && (!a.until || a.until > Date.now());
      sec().innerHTML = `<div class="head"><h2 class="h2">Объявление</h2><span class="label">${live ? 'висит' + (a.until ? ' до ' + when(a.until) : '') : 'нет'}</span></div>
        <p class="muted">Плашка вверху у всех на сайте. Каждый может её закрыть; новое объявление покажется снова.</p>
        <form class="adm-ann" id="admAnn">
          <textarea class="adm-in" maxlength="280" rows="3" placeholder="Например: «Завтра вечером сайт ненадолго выключится»">${live ? esc(a.text) : ''}</textarea>
          <div class="adm-ann-row">
            <select class="adm-in" name="kind" aria-label="Вид"><option value="info">📢 Обычное</option><option value="warn">⚠️ Важное</option><option value="party">🎉 Праздник</option></select>
            <select class="adm-in" name="hours" aria-label="Сколько висит"><option value="0">Пока не уберу</option><option value="1">1 час</option><option value="24">Сутки</option><option value="168">Неделю</option></select>
          </div>
          <div class="adm-ann-row"><button type="submit" class="btn primary">Показать всем</button>${live ? '<button type="button" class="btn ghost" id="admAnnOff">Убрать</button>' : ''}</div>
          <p class="adm-err" id="admAnnMsg" role="status"></p>
        </form>`;
      const f = $('#admAnn');
      if (live) f.kind.value = a.kind || 'info';
      const save = async (text) => {
        try { await call('PUT', '/admin/announce', { text, kind: f.kind.value, hours: +f.hours.value }); announce(); } catch (x) { $('#admAnnMsg').textContent = x.message; }
      };
      f.addEventListener('submit', (e) => { e.preventDefault(); const t = f.querySelector('textarea').value.trim(); if (t) save(t); });
      const off = $('#admAnnOff');
      if (off) off.addEventListener('click', () => save(''));
    } catch (x) { fail(x); }
  }
  async function log() {
    try {
      const d = await call('GET', '/admin/log');
      sec().innerHTML = `<div class="head"><h2 class="h2">Журнал</h2><span class="label">последние ${d.items.length}</span></div>
        <ul class="adm-list adm-log">${d.items.map((x) => `<li class="adm-row${x.ok ? '' : ' banned'}"><div class="adm-who"><b>${x.ok ? '✔' : '✖'} ${esc(x.action)}</b><small>@${esc(x.handle || '?')} · ${when(x.at)} · ${esc(x.ip)}</small></div></li>`).join('') || '<li class="muted">Пусто.</li>'}</ul>`;
    } catch (x) { fail(x); }
  }

  // ---------- тема: тот же выбор, что на остальных страницах (меню ☰ → «Тема») ----------
  (() => {
    const pick = $('#themePick'), btn = $('#themeBtn'), menu = $('#themeMenu');
    if (!pick || !btn || !menu || !window.CasualThemes) return;
    const THEMES = window.CasualThemes.list;
    const PALETTE = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/></svg>';
    const PREFS_KEY = 'ocenshik.prefs.v1';
    const apply = (id, save) => {
      const th = THEMES.find((t) => t.id === id) || THEMES[0];
      if (th.id === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th.id);
      btn.innerHTML = `${PALETTE}<span class="t">Тема: ${esc(th.name)}</span>`;
      btn.setAttribute('aria-label', `Тема: ${th.name}`);
      menu.classList.add('tm-grid');
      menu.innerHTML = window.CasualThemes.menuHTML(th.id);
      if (save) { try { let p = read(PREFS_KEY); if (!p || typeof p !== 'object' || Array.isArray(p)) p = {}; p.theme = th.id; localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }
    };
    apply((read(PREFS_KEY) || {}).theme || 'auto', false);
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-id]');
      if (!b) return;
      apply(b.dataset.themeId, true);
      pick.open = false;
    });
    // меню тем не уходит за край экрана
    pick.addEventListener('toggle', () => {
      if (!pick.open) return;
      menu.style.translate = '';
      const r = menu.getBoundingClientRect();
      const shift = r.left < 8 ? 8 - r.left : r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0;
      if (shift) menu.style.translate = `${Math.round(shift)}px 0`;
    });
  })();

  async function start() {
    if (!token) {
      message('Админ-панель', 'Сначала войди в онлайн-аккаунт в Мнении.', '<a class="btn primary" href="/mnenie/#login">Войти</a>');
      return;
    }
    try { me = await call('GET', '/admin/me'); } catch (x) {
      if (x.status === 404 || x.status === 401) message('Нет доступа', 'Эта страница только для админов сайта.', '<a class="btn ghost" href="/">На главную</a>');
      else { message('Админ-панель', esc(x.message), '<button type="button" class="btn ghost" id="admRetry">Попробовать ещё раз</button>'); $('#admRetry').addEventListener('click', start); }
      return;
    }
    if (!me.admin) { codeForm(false); return; }
    remember();
    if (!me.pinSet) { pinSetup(); return; } // после одноразового пароля пин-код ещё не задан
    if (me.active) panel(); else pinForm();
  }
  start();
})();
