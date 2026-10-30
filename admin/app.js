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
  }, () => { throw Object.assign(new Error('Нет связи с сервером, проверь интернет и попробуй ещё раз'), { status: 0 }); });
  // вход в админку закончился (12 часов прошло или вышли на другом устройстве): сервер отвечает «нет такого адреса»
  const lostAdmin = (x) => x && x.status === 404 && x.message === 'Нет такого адреса.';
  const lostSession = (x) => x && x.status === 401;
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
    let pinHint = false;
    form.querySelectorAll('input[data-pin]').forEach((i) => i.addEventListener('input', () => {
      const clean = i.value.replace(/\D/g, '').slice(0, 8);
      if (clean !== i.value && /\D/.test(i.value)) {
        err.textContent = 'В пин-коде только цифры 0–9. Это не пароль от аккаунта, а свой короткий код из цифр.';
        pinHint = true;
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      } else if (pinHint) { err.textContent = ''; pinHint = false; }
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
      message(reset ? 'Сброс пин-кода' : 'Админ-панель', `${reset ? 'Сбросить пин-код можно одноразовым паролем, но он' : 'Одноразовый пароль'} сейчас не задан на сервере. Его добавляет владелец сайта в настройках хостинга, а потом нужно обновить эту страницу.`,
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

  // ---------- окно админки в стиле сайта (вместо системных prompt/confirm) ----------
  // dialog({ icon, title, who, text, field: { value, prefix, placeholder, label, type, max, filter, check, optional }, hint, button, danger, submit })
  // submit(значение) — запрос на сервер; ошибка показывается в окне, окно закрывается, только когда всё получилось.
  // Возвращает true (сделано) или null (закрыли или ничего не поменялось)
  function dialog(o) {
    return new Promise((resolve) => {
      const f = o.field;
      const m = document.createElement('div');
      m.className = 'adm-modal';
      m.innerHTML = `<form class="adm-dlg${o.danger ? ' danger' : ''}" role="dialog" aria-modal="true" aria-labelledby="admDlgT" novalidate>
        <button type="button" class="adm-dlg-x" data-x aria-label="Закрыть">✕</button>
        <span class="adm-dlg-ic" aria-hidden="true"></span>
        <h2 id="admDlgT"></h2>
        ${o.who ? '<p class="adm-dlg-who"></p>' : ''}
        ${o.text ? '<p class="adm-dlg-text"></p>' : ''}
        ${f ? `<label class="adm-dlg-f">${f.label ? '<span class="adm-dlg-l"></span>' : ''}<span class="adm-dlg-box${f.prefix ? ' pre' : ''}">${f.prefix ? `<i aria-hidden="true">${esc(f.prefix)}</i>` : ''}${f.type === 'textarea' ? '<textarea rows="3"></textarea>' : `<input type="${f.type === 'email' ? 'email' : 'text'}" autocomplete="off" spellcheck="false">`}</span></label>` : ''}
        ${o.hint ? '<p class="adm-dlg-hint"></p>' : ''}
        <p class="adm-dlg-err" role="alert"></p>
        <div class="adm-dlg-acts"><button type="button" class="btn ghost" data-x>Отмена</button><button type="submit" class="btn ${o.danger ? 'danger' : 'primary'}" data-ok></button></div>
      </form>`;
      // все тексты — через textContent: имена и ники пользователей не превращаются в разметку
      m.querySelector('.adm-dlg-ic').textContent = o.icon || '✎';
      m.querySelector('#admDlgT').textContent = o.title;
      if (o.who) m.querySelector('.adm-dlg-who').textContent = o.who;
      if (o.text) m.querySelector('.adm-dlg-text').textContent = o.text;
      if (o.hint) m.querySelector('.adm-dlg-hint').textContent = o.hint;
      const okBtn = m.querySelector('[data-ok]');
      okBtn.textContent = o.button || 'Готово';
      const inp = f ? m.querySelector('input, textarea') : null;
      const err = m.querySelector('.adm-dlg-err'), form = m.querySelector('form');
      if (f) {
        if (f.label) m.querySelector('.adm-dlg-l').textContent = f.label;
        inp.value = f.value || '';
        inp.placeholder = f.placeholder || '';
        if (f.max) inp.maxLength = f.max;
      }
      document.body.appendChild(m);
      document.body.classList.add('adm-lock-scroll');
      const back = document.activeElement;
      const val = () => (inp ? inp.value : '');
      // проверка на лету: кнопка доступна, только когда значение подходит
      const validate = () => {
        if (!f || !f.check) { okBtn.disabled = false; return true; }
        const v = val();
        const msg = !v.trim() && !f.optional ? '' : f.check(v);
        okBtn.disabled = !!msg || (!v.trim() && !f.optional);
        err.textContent = msg && msg.trim() && v ? msg : '';
        return !okBtn.disabled;
      };
      if (inp) {
        inp.addEventListener('input', () => {
          let dropped = false;
          if (f.filter) { const p = inp.selectionStart, before = inp.value; inp.value = f.filter(inp.value); if (inp.value !== before) { const k = Math.max(0, p - (before.length - inp.value.length)); inp.setSelectionRange(k, k); dropped = before.toLowerCase().replace(/^@+/, '') !== inp.value; } }
          validate();
          // символы не пропадают молча: говорим, какие тут можно
          if (dropped && f.filterHint) { err.textContent = f.filterHint; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
        });
        inp.focus();
        if (inp.select) inp.select();
      } else okBtn.focus();
      validate();
      let closed = false, busy = false;
      const close = (v) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        m.classList.add('out'); document.body.classList.remove('adm-lock-scroll');
        setTimeout(() => m.remove(), calm ? 0 : 220);
        if (back && back.isConnected) back.focus({ preventScroll: true });
        resolve(v);
      };
      // Esc закрывает, а Tab не уходит на страницу под окном, где бы ни был фокус (например, после клика по тексту окна)
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) close(null); return; }
        if (e.key !== 'Tab') return;
        const items = [...m.querySelectorAll('button, input, textarea')].filter((n) => !n.disabled);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1], cur = document.activeElement;
        if (e.shiftKey && (cur === first || !m.contains(cur))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (cur === last || !m.contains(cur))) { e.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown', onKey, true);
      // клик мимо закрывает, только если и нажатие началось мимо окна: выделение текста в поле с вылетом за край окно не закрывает
      let downOut = false;
      m.addEventListener('pointerdown', (e) => { downOut = e.target === m; });
      m.addEventListener('click', (e) => { if (busy) return; if ((e.target === m && downOut) || e.target.closest('[data-x]')) close(null); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy || okBtn.disabled || !validate()) return;
        busy = true;
        okBtn.disabled = true; err.textContent = '';
        const label = okBtn.textContent; okBtn.textContent = 'Секунду…';
        try {
          const r = o.submit ? o.submit(val()) : true;
          if (r === null) { busy = false; close(null); return; } // ничего не поменялось
          await r;
          busy = false;
          close(true);
        } catch (x) {
          busy = false;
          // вход в админку уже закончился: окно ни при чём, снова спрашиваем пин-код
          if (lostAdmin(x) || lostSession(x)) { close(null); fail(x); return; }
          err.textContent = x.message;
          okBtn.textContent = label; okBtn.disabled = false;
          form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
          if (inp) inp.focus();
        }
      });
    });
  }
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- разделы админки ----------
  const TABS = [['stats', '📊', 'Статистика'], ['users', '👥', 'Пользователи'], ['comments', '💬', 'Комментарии'], ['announce', '📢', 'Объявление'], ['log', '📜', 'Журнал']];
  let tab = 'stats';
  const sec = () => $('#admSec');
  const when = (t) => (t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };
  const fail = (x) => {
    // сессия аккаунта закончилась: пин-код тут не поможет
    if (lostSession(x)) { message('Вход закончился', 'Войди в аккаунт ещё раз, и админка снова откроется.', '<a class="btn primary" href="/opinion/#login">Войти</a>'); return; }
    if (lostAdmin(x)) { me.active = false; pinForm(); return; }
    const s = sec();
    if (s) s.innerHTML = `<p class="adm-err">${esc(x.message)}</p><button type="button" class="btn ghost small" id="admRetryTab">Попробовать ещё раз</button>`;
    const again = $('#admRetryTab');
    if (again) again.addEventListener('click', showTab);
  };
  // быстрый клик по вкладкам: ответ на прошлую вкладку не должен перезаписать ту, что открыта сейчас
  let view = 0;
  const fresh = () => ++view;
  const stale = (my) => my !== view || !sec();
  function showTab() {
    const s = sec();
    if (!s) return;
    s.innerHTML = '<p class="muted">Загружаю…</p>';
    ({ stats, users, comments, announce, log })[tab]();
  }
  const mb = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2).replace('.', ',') + ' ГБ' : Math.max(1, Math.round(n / 1e6)) + ' МБ');
  async function stats() {
    const my = fresh();
    try {
      const d = await call('GET', '/admin/stats');
      if (stale(my)) return;
      const tiles = [['Аккаунтов', d.users], ['Новых за неделю', d.new7], ['Заходили за сутки', d.active24], ['Сейчас на сайте', `${d.onlineUsers} + ${d.onlineGuests} ${plural(d.onlineGuests, 'гость', 'гостя', 'гостей')}`], ['Оценок', d.ratings], ['Комментариев', d.comments], ['Реакций', d.reactions], ['Ссылок на отзывы', d.shares], ['Забанено', d.banned], ['Фото в базе', d.photos]];
      if (d.dbBytes) tiles.push(['Размер базы', mb(d.dbBytes)]);
      sec().innerHTML = `<div class="head"><h2 class="h2">Статистика</h2><button type="button" class="btn ghost small" id="admRe">Обновить</button></div>
        <div class="adm-stats">${tiles.map(([k, v], i) => `<div class="adm-stat" style="--k:${i}"><b>${esc(v)}</b><small>${esc(k)}</small></div>`).join('')}</div>`;
      $('#admRe').addEventListener('click', showTab);
    } catch (x) { if (!stale(my)) fail(x); }
  }
  const userRow = (u, i) => {
    const edit = `<button type="button" class="btn ghost small" data-act="set-handle" data-h="${esc(u.handle)}" title="Сменить @юзернейм">@ Юзернейм</button><button type="button" class="btn ghost small" data-act="set-nick" title="Сменить ник">✎ Ник</button><button type="button" class="btn ghost small" data-act="set-mail" data-m="${esc(u.email)}" title="Сменить почту">✉ Почта</button>`;
    const hard = `<button type="button" class="btn ghost small" data-act="kick">Выкинуть с устройств</button><button type="button" class="btn small danger" data-act="delete" data-h="${esc(u.handle)}">🗑 Удалить</button><button type="button" class="btn small ${u.banned ? 'ghost' : 'danger'}" data-act="${u.banned ? 'unban' : 'ban'}">${u.banned ? 'Разбанить' : 'Забанить'}</button>`;
    const facts = [u.email, 'с ' + when(u.createdAt), 'был ' + when(u.lastSeen), 'оценок ' + u.ratings].filter(Boolean).map(esc).join(' · ');
    return `<li class="adm-row${u.banned ? ' banned' : ''}" style="--k:${Math.min(i, 12)}" data-uid="${esc(u.id)}"${u.admin ? ' data-admin="1"' : ''}>
          <div class="adm-who"><b>${esc(u.username)}</b> <a href="/profile/?id=${encodeURIComponent(u.id)}">@${esc(u.handle)}</a>${u.admin ? ' <em class="adm-badge">админ</em>' : ''}${u.banned ? ` <em class="adm-badge bad">бан${u.banReason ? ': ' + esc(u.banReason) : ''}</em>` : ''}
            <small>${facts}</small></div>
          <div class="adm-acts">${edit}${u.admin ? '' : hard}</div>
        </li>`;
  };
  // q — поиск; страницы по 50 подгружаются кнопкой, чтобы старые аккаунты тоже можно было найти глазами
  async function users(q) {
    q = q || '';
    const my = fresh();
    try {
      const d = await call('GET', '/admin/users?q=' + encodeURIComponent(q));
      if (stale(my)) return;
      let shown = d.users.length;
      sec().innerHTML = `<div class="head"><h2 class="h2">Пользователи</h2><span class="label" id="admUn">${shown}${d.more ? '+' : ''}</span></div>
        <form class="adm-search" id="admUq"><input class="adm-in" type="search" placeholder="@юзернейм, ник или почта" value="${esc(q)}" aria-label="Поиск пользователя"><button class="btn primary" type="submit">Найти</button></form>
        <ul class="adm-list">${d.users.map(userRow).join('') || '<li class="muted">Никого не нашлось.</li>'}</ul>
        ${d.more ? '<button type="button" class="btn ghost adm-more" id="admMore">Показать ещё</button>' : ''}`;
      $('#admUq').addEventListener('submit', (e) => { e.preventDefault(); users(e.target.querySelector('input').value.trim()); });
      const more = $('#admMore');
      if (more) more.addEventListener('click', async () => {
        more.disabled = true;
        const v = view;
        try {
          const n = await call('GET', `/admin/users?q=${encodeURIComponent(q)}&offset=${shown}`);
          if (v !== view) return;
          sec().querySelector('.adm-list').insertAdjacentHTML('beforeend', n.users.map(userRow).join(''));
          shown += n.users.length;
          $('#admUn').textContent = shown + (n.more ? '+' : '');
          if (n.more) more.disabled = false; else more.remove();
        } catch (x) { more.disabled = false; if (v === view) fail(x); }
      });
      sec().querySelector('.adm-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const li = b.closest('[data-uid]'), id = li.dataset.uid, name = li.querySelector('.adm-who b').textContent, handle = b.dataset.h || (li.querySelector('.adm-who a') || {}).textContent || '';
        const act = b.dataset.act;
        const rename = (field, val) => call('POST', `/admin/rename/${encodeURIComponent(id)}`, { [field]: val });
        // @юзернейм, ник или почта по отдельности: одно окно — одно изменение (те же правила, что у самого человека)
        let ok = null;
        if (act === 'set-handle') ok = await dialog({
          icon: '@', title: 'Новый юзернейм', who: name,
          field: { value: b.dataset.h, prefix: '@', placeholder: 'yukomagod', max: 20, filterHint: 'В юзернейме только латинские буквы, цифры, «_» и «.» — без пробелов и кириллицы', filter: (v) => v.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_.]/g, ''), check: (v) => (/^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/.test(v) ? '' : 'От 3 до 20 символов: латинские буквы, цифры, «_» и «.» (точка не по краям)') },
          // у админа вход в админку привязан к @: сменишь — он потеряет доступ, пока не вернёт прежний в настройках профиля
          hint: li.dataset.admin ? 'Осторожно: вход в админку привязан к @. После смены этот админ не откроет панель, пока не вернёт прежний @ в настройках профиля.' : 'По нему человека находят друзья и открывают его профиль: casualhub.pages.dev/u/…', button: 'Сохранить',
          submit: (v) => (v === b.dataset.h ? null : rename('handle', v)),
        });
        else if (act === 'set-nick') ok = await dialog({
          icon: '✎', title: 'Новый ник', who: '@' + handle.replace(/^@/, ''),
          field: { value: name, placeholder: 'Ник', max: 24, check: (v) => (/^[\p{L}\p{N}_.\- ]{2,24}$/u.test(v.trim()) ? '' : 'От 2 до 24 символов: буквы, цифры, пробел, точка, дефис или «_»') },
          hint: 'Ник может совпадать с чужим, различают людей по @юзернейму.', button: 'Сохранить',
          submit: (v) => (v.trim() === name ? null : rename('username', v.trim())),
        });
        else if (act === 'set-mail') ok = await dialog({
          icon: '✉', title: 'Новая почта', who: name,
          field: { value: b.dataset.m || '', type: 'email', placeholder: 'name@mail.com', max: 120, check: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Нужна почта, например name@mail.com') },
          hint: 'На неё приходит код для входа. После смены все устройства человека подтверждаются заново.', button: 'Сохранить',
          submit: (v) => (v.trim().toLowerCase() === (b.dataset.m || '') ? null : rename('email', v.trim())),
        });
        // удаление насовсем: нужно вписать его юзернейм, чтобы не удалить по ошибке
        else if (act === 'delete') ok = await dialog({
          icon: '🗑', danger: true, title: 'Удалить аккаунт насовсем?', who: `${name} · @${b.dataset.h}`,
          text: 'Пропадут все его оценки, фото, друзья, реакции, комментарии и ссылки на отзывы. Вернуть будет нельзя.',
          field: { value: '', prefix: '@', placeholder: b.dataset.h, label: `Чтобы удалить, впиши его юзернейм @${b.dataset.h}`, filter: (v) => v.replace(/^@+/, ''), check: (v) => (v.toLowerCase() === b.dataset.h ? '' : ' ') },
          button: 'Удалить навсегда',
          submit: (v) => call('POST', `/admin/delete/${encodeURIComponent(id)}`, { confirm: v }),
        });
        else if (act === 'ban') ok = await dialog({
          icon: '⛔', danger: true, title: 'Забанить?', who: name,
          text: 'Его выкинет со всех устройств, войти он не сможет. Разбанить можно в любой момент.',
          field: { value: '', type: 'textarea', placeholder: 'Например: спам в комментариях', max: 200, label: 'Причина — её увидит он сам при входе (можно пусто)', optional: true },
          button: 'Забанить', submit: (v) => call('POST', `/admin/ban/${encodeURIComponent(id)}`, { on: true, reason: v.trim() }),
        });
        else if (act === 'unban') ok = await dialog({ icon: '✅', title: 'Разбанить?', who: name, text: 'Он снова сможет входить и пользоваться сайтом.', button: 'Разбанить', submit: () => call('POST', `/admin/ban/${encodeURIComponent(id)}`, { on: false }) });
        else if (act === 'kick') ok = await dialog({ icon: '🚪', title: 'Выкинуть со всех устройств?', who: name, text: 'Все его входы закончатся, ему придётся войти заново. Аккаунт и оценки останутся.', button: 'Выкинуть', submit: () => call('POST', `/admin/kick/${encodeURIComponent(id)}`, {}) });
        if (!ok) return;
        if (act === 'delete') { li.classList.add('gone'); setTimeout(() => users(q), 300); } else users(q);
      });
    } catch (x) { fail(x); }
  }
  async function comments() {
    const my = fresh();
    try {
      const d = await call('GET', '/admin/comments');
      if (stale(my)) return;
      sec().innerHTML = `<div class="head"><h2 class="h2">Комментарии</h2><span class="label">последние ${d.items.length}</span></div>
        <ul class="adm-list">${d.items.map((c, i) => `<li class="adm-row" style="--k:${Math.min(i, 12)}" data-cid="${esc(c.id)}">
          <div class="adm-who"><b>${esc(c.from.username)}</b> <small class="inl">@${esc(c.from.handle)} → ${c.where === 'wall' ? 'стена' : c.where === 'tier' ? 'тир-лист' : 'оценка'} @${esc(c.owner.handle)} · ${when(c.at)}</small><p class="adm-text">${esc(c.text)}</p></div>
          <div class="adm-acts"><button type="button" class="btn small danger" data-del>Удалить</button></div></li>`).join('') || '<li class="muted">Комментариев пока нет.</li>'}</ul>`;
      sec().querySelector('.adm-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del]');
        if (!b) return;
        const li = b.closest('[data-cid]');
        const ok = await dialog({ icon: '💬', danger: true, title: 'Удалить комментарий?', who: li.querySelector('.adm-who b').textContent, text: li.querySelector('.adm-text').textContent, button: 'Удалить', submit: () => call('DELETE', '/admin/comment/' + encodeURIComponent(li.dataset.cid)) });
        if (ok) { li.classList.add('gone'); setTimeout(() => li.remove(), 300); }
      });
    } catch (x) { if (!stale(my)) fail(x); }
  }
  async function announce() {
    const my = fresh();
    try {
      const { announce: a } = await call('GET', '/admin/announce');
      if (stale(my)) return;
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
      const area = f.querySelector('textarea'), msg = $('#admAnnMsg');
      let sending = false;
      const save = async (text) => {
        if (sending) return;
        sending = true;
        f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await call('PUT', '/admin/announce', { text, kind: f.kind.value, hours: +f.hours.value }); announce(); }
        catch (x) {
          sending = false;
          f.querySelectorAll('button').forEach((b) => { b.disabled = false; });
          if (lostAdmin(x) || lostSession(x)) fail(x); else msg.textContent = x.message;
        }
      };
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = area.value.trim();
        if (t) { save(t); return; }
        msg.textContent = 'Напиши текст объявления';
        area.focus();
      });
      area.addEventListener('input', () => { msg.textContent = ''; });
      const off = $('#admAnnOff');
      if (off) off.addEventListener('click', () => save(''));
    } catch (x) { if (!stale(my)) fail(x); }
  }
  async function log() {
    const my = fresh();
    try {
      const d = await call('GET', '/admin/log');
      if (stale(my)) return;
      sec().innerHTML = `<div class="head"><h2 class="h2">Журнал</h2><span class="label">последние ${d.items.length}</span></div>
        <ul class="adm-list adm-log">${d.items.map((x) => `<li class="adm-row${x.ok ? '' : ' banned'}"><div class="adm-who"><b>${x.ok ? '✔' : '✖'} ${esc(x.action)}</b><small>@${esc(x.handle || '?')} · ${when(x.at)} · ${esc(x.ip)}</small></div></li>`).join('') || '<li class="muted">Пусто.</li>'}</ul>`;
    } catch (x) { if (!stale(my)) fail(x); }
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
      message('Админ-панель', 'Сначала войди в онлайн-аккаунт в Мнении.', '<a class="btn primary" href="/opinion/#login">Войти</a>');
      return;
    }
    try { me = await call('GET', '/admin/me'); } catch (x) {
      if (x.status === 401) message('Вход закончился', 'Войди в аккаунт ещё раз: сессия на этом устройстве больше не действует.', '<a class="btn primary" href="/opinion/#login">Войти</a>');
      else if (x.status === 404) message('Нет доступа', 'Эта страница только для админов сайта.', '<a class="btn ghost" href="/">На главную</a>');
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
