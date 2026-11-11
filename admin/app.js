(() => {
  const profUrl = (id, h) => (typeof h === 'string' && /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/.test(h) ? '/profile/' + h : '/profile/?id=' + encodeURIComponent(id));
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const read = window.CasualUtil.read; // общий, /util.js
  const esc = window.CasualUtil.esc; // общий, /util.js
  const user = read('ocenshik.user.v1');
  const token = user && (read('casualhub.tokens.v1') || {})[user.id];
  const call = (method, path, body) => fetch('/api' + path, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Не получилось, попробуй ещё раз'), { status: r.status });
    return d;
  }, () => { throw Object.assign(new Error('Нет связи с сервером, проверь интернет и попробуй ещё раз'), { status: 0 }); });
  const lostAdmin = (x) => x && x.status === 404 && x.message === 'Нет такого адреса.';
  const lostSession = (x) => x && x.status === 401;
  const SHIELD = (s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l8 3v6.2c0 4.9-3.4 8.6-8 10-4.6-1.4-8-5.1-8-10V5.5z"/><path d="M8.5 12l2.5 2.5 4.6-5"/></svg>`;
  const LOCK = (s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/></svg>`;
  const remember = () => { try { localStorage.setItem('casualhub.admin.v1', user.id); } catch (e) {} };
  let me = { handle: '' };

  function message(title, text, actions) {
    app.innerHTML = `<section class="card rise adm-lock"><span class="adm-ic">${SHIELD(30)}</span><h1 class="h2">${esc(title)}</h1><p class="muted">${text}</p>${actions || ''}</section>`;
  }
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
        if (!form.isConnected) return;
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
          if (x.status === 403) { codeForm(false, x.message); return; }
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
          if (r === null) { busy = false; close(null); return; }
          await r;
          busy = false;
          close(true);
        } catch (x) {
          busy = false;
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

  const TABS = [['stats', '📊', 'Статистика'], ['users', '👥', 'Пользователи'], ['comments', '💬', 'Комментарии'], ['announce', '📢', 'Объявление'], ['mail', '✉️', 'Почта'], ['backup', '💾', 'Копии'], ['levels', '⭐', 'Уровни'], ['changes', '🛠', 'Изменения'], ['log', '📜', 'Журнал']];
  let tab = 'stats';
  const sec = () => $('#admSec');
  const when = (t) => (t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const plural = window.CasualUtil.plural; // общий, /util.js
  const fail = (x) => {
    if (lostSession(x)) { message('Вход закончился', 'Войди в аккаунт ещё раз, и админка снова откроется.', '<a class="btn primary" href="/opinion/#login">Войти</a>'); return; }
    if (lostAdmin(x)) { me.active = false; pinForm(); return; }
    const s = sec();
    if (s) s.innerHTML = `<p class="adm-err">${esc(x.message)}</p><button type="button" class="btn ghost small" id="admRetryTab">Попробовать ещё раз</button>`;
    const again = $('#admRetryTab');
    if (again) again.addEventListener('click', showTab);
  };
  let view = 0;
  const fresh = () => ++view;
  const stale = (my) => my !== view || !sec();
  function showTab() {
    const s = sec();
    if (!s) return;
    s.innerHTML = '<p class="muted">Загружаю…</p>';
    ({ stats, users, comments, announce, mail, backup, levels, changes, log })[tab]();
  }
  let emos = null;
  const emoOf = (x) => { if (!emos || !emos.length) return ''; let h = 0; for (const c of x.title) h = (h * 31 + c.charCodeAt(0)) >>> 0; return emos[h % emos.length]; };
  const groupHTML = (g) => `<section class="log-day">${g.day || g.ver ? `<h3 class="log-date">${esc(g.day || '')}${g.ver ? `<span>версия ${esc(g.ver)}</span>` : ''}</h3>` : ''}
      <article class="rel"><span class="rel-v">${esc(g.ver || '')}</span><div>${g.items.map((x) => `<p><b>${emoOf(x) ? `<img class="wn-emo" src="/wheel/${esc(emoOf(x))}" alt="" loading="lazy" decoding="async">` : ''}${esc(x.title)}</b> ${esc(x.body)}</p>`).join('')}</div></article></section>`;
  // журнал изменений для админов: вид как у «Что нового»
  async function changes() {
    const my = fresh();
    try {
      if (!emos) {
        try { const ix = await (await fetch('/wheel/hub/index.json')).json(); emos = (ix.groups || []).flatMap((g) => g.items || []).map((x) => x.src).filter((s) => /^hub\/roflan\/.+\.(png|webp)$/.test(s)).slice(0, 160); } catch (e) { emos = []; }
      }
      const d = await call('GET', '/admin/changes');
      if (stale(my)) return;
      if (d.needKey) {
        sec().innerHTML = `<div class="head"><h2 class="h2">Изменения</h2></div>
          <form class="adm-key" id="chgKey">
            <p class="muted">Журнал закрыт ключом. Его нужно ввести один раз, дальше журнал увидят все админы.</p>
            <input class="adm-in" id="chgKeyIn" autocomplete="off" spellcheck="false" placeholder="Ключ журнала" required>
            <p class="adm-key-err" id="chgKeyErr" role="alert" hidden></p>
            <button type="submit" class="btn primary small">Открыть журнал</button>
          </form>`;
        $('#chgKey').addEventListener('submit', async (e) => {
          e.preventDefault();
          // неверный ключ: форма остаётся, ошибка под полем
          const err = $('#chgKeyErr');
          err.hidden = true;
          try { await call('POST', '/admin/changes-key', { key: $('#chgKeyIn').value }); showTab(); }
          catch (x) { err.textContent = (x && (x.error || x.message)) || 'Ключ не подошёл.'; err.hidden = false; $('#chgKeyIn').focus(); }
        });
        return;
      }
      const groups = [];
      for (const x of d.items) { const g = groups[groups.length - 1]; if (g && g.ver === x.ver && g.day === x.day) g.items.push(x); else groups.push({ ver: x.ver, day: x.day, items: [x] }); }
      sec().innerHTML = `<div class="head"><h2 class="h2">Изменения</h2><span class="muted">Видны только в админке</span></div>
        <div class="adm-wn">${groups.length ? `<div class="log-days">${groups.map(groupHTML).join('')}</div>` : '<p class="muted">Пока пусто.</p>'}</div>`;
    } catch (x) { if (!stale(my)) fail(x); }
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
    const facts = [u.email, 'с ' + when(u.createdAt), 'был ' + when(u.lastSeen), 'оценок ' + u.ratings, 'входов ' + (u.sessions || 0)].filter(Boolean).map(esc).join(' · ');
    // безопасность аккаунта одним взглядом: почта подтверждена, двухфакторная защита
    const sec = (u.email ? (u.emailOk ? ' <em class="adm-badge ok" title="Почта подтверждена письмом">✓ почта</em>' : ' <em class="adm-badge mute" title="Почта не подтверждена">почта не подтверждена</em>') : ' <em class="adm-badge mute">без почты</em>')
      + (u.twoFactor ? ' <em class="adm-badge ok" title="Вход с кодом из приложения">🔐 2FA</em>' : '');
    return `<li class="adm-row${u.banned ? ' banned' : ''}" style="--k:${Math.min(i, 12)}" data-uid="${esc(u.id)}"${u.admin ? ' data-admin="1"' : ''}>
          <div class="adm-who"><b>${esc(u.username)}</b> <a href="${profUrl(u.id, u.handle)}">@${esc(u.handle)}</a>${u.admin ? ' <em class="adm-badge">админ</em>' : ''}${sec}${u.banned ? ` <em class="adm-badge bad">бан${u.banReason ? ': ' + esc(u.banReason) : ''}</em>` : ''}
            <small>${facts}</small></div>
          <div class="adm-acts">${edit}${u.admin ? '' : hard}</div>
        </li>`;
  };
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
        let ok = null;
        if (act === 'set-handle') ok = await dialog({
          icon: '@', title: 'Новый юзернейм', who: name,
          field: { value: b.dataset.h, prefix: '@', placeholder: 'username', max: 20, filterHint: 'В юзернейме только латинские буквы, цифры, «_» и «.» — без пробелов и кириллицы', filter: (v) => v.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_.]/g, ''), check: (v) => (/^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/.test(v) ? '' : 'От 3 до 20 символов: латинские буквы, цифры, «_» и «.» (точка не по краям)') },
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
  // почта сайта (Resend): подключена ли, последняя отправка и её ответ, тестовое письмо себе
  // уровни: опыт и уровень каждого, журнал начислений, поправки, опыт за прошлое, тематическая неделя
  async function levels() {
    const my = fresh();
    try {
      const d = await call('GET', '/admin/levels');
      if (stale(my)) return;
      const MODE = { off: 'выключены (LEVELS = "0")', admins: 'видят только админы', all: 'включены для всех' };
      const ev = d.event;
      sec().innerHTML = `<div class="head"><h2 class="h2">Уровни</h2><span class="label">${esc(MODE[d.mode] || d.mode)}</span></div>
        <p class="muted">Опыт за оценки, общение, тир-листы и лоты. Правила — в functions/_lib/levels.js, включение — LEVELS в wrangler.toml.</p>
        ${d.mode === 'off' ? '' : `<div class="adm-ann-row"><button type="button" class="btn ghost" id="lvBack">Начислить опыт за прошлое всем</button></div>
        <p class="adm-err" id="lvMsg" role="status"></p>
        <div class="adm-lv-ev"><h3 class="h3">Тематическая неделя</h3>
          ${ev ? `<p>Идёт: <b>${esc(ev.title)}</b> · ×${ev.mult} до ${esc(when(ev.until))} · ${ev.kinds.map(esc).join(', ')}</p><button type="button" class="btn ghost" id="lvEvOff">Закончить</button>`
            : `<div class="adm-ann-row"><input id="lvEvTitle" maxlength="80" placeholder="Например: Неделя тир-листов"><select id="lvEvMult"><option value="2">×2</option><option value="1.5">×1,5</option><option value="3">×3</option></select><select id="lvEvDays"><option value="7">7 дней</option><option value="3">3 дня</option><option value="14">14 дней</option></select></div>
              <div class="adm-lv-kinds">${d.kinds.map((k) => `<label><input type="checkbox" value="${esc(k.k)}"> ${esc(k.label)}</label>`).join('')}</div>
              <button type="button" class="btn primary" id="lvEvOn">Начать неделю</button>`}
        </div>
        <ul class="adm-list">${d.users.map((u, i) => `<li class="adm-row" style="--k:${Math.min(i, 12)}">
          <div class="adm-who"><b>${esc(u.username)} <span class="muted">@${esc(u.handle)}</span>${u.fast ? ' <em class="adm-badge bad" title="Больше 60 начислений за последний час">быстро</em>' : ''}${u.hidden ? ' <em class="adm-badge mute">уровень скрыт</em>' : ''}</b>
            <small>ур. ${u.level} · ${esc(u.rank)} · ${u.xp} опыта · за неделю ${u.week} · серия ${u.streak} (лучшая ${u.best}) · ачивок ${u.ach}</small></div>
          <div class="adm-acts"><button type="button" class="btn ghost small" data-lvlog="${esc(u.id)}">Журнал</button><button type="button" class="btn ghost small" data-lvadj="${esc(u.id)}" data-name="${esc(u.username)}">Опыт ±</button></div>
          <div class="adm-lv-log" id="lvLog-${esc(u.id)}" hidden></div>
        </li>`).join('')}</ul>`}`;
      const msg = $('#lvMsg');
      const back = $('#lvBack');
      if (back) back.addEventListener('click', async () => {
        back.disabled = true; msg.textContent = 'Считаю…';
        try { const r = await call('POST', '/admin/levels/backfill'); msg.textContent = `Готово: ${r.users.length} человек.`; setTimeout(levels, 1200); }
        catch (x) { if (lostAdmin(x) || lostSession(x)) fail(x); else { msg.textContent = x.message; back.disabled = false; } }
      });
      const on = $('#lvEvOn');
      if (on) on.addEventListener('click', async () => {
        const kinds = [...document.querySelectorAll('.adm-lv-kinds input:checked')].map((x) => x.value);
        try { await call('PUT', '/admin/levels/event', { title: $('#lvEvTitle').value, mult: +$('#lvEvMult').value, days: +$('#lvEvDays').value, kinds }); levels(); }
        catch (x) { if (lostAdmin(x) || lostSession(x)) fail(x); else msg.textContent = x.message; }
      });
      const offB = $('#lvEvOff');
      if (offB) offB.addEventListener('click', async () => { try { await call('DELETE', '/admin/levels/event'); levels(); } catch (x) { if (lostAdmin(x) || lostSession(x)) fail(x); else msg.textContent = x.message; } });
      document.querySelectorAll('[data-lvlog]').forEach((b) => b.addEventListener('click', async () => {
        const box = $('#lvLog-' + b.dataset.lvlog);
        if (!box.hidden) { box.hidden = true; return; }
        try {
          const r = await call('GET', '/admin/levels/log?id=' + encodeURIComponent(b.dataset.lvlog));
          box.innerHTML = r.items.length ? r.items.slice(0, 60).map((x) => `<div class="${x.gone ? 'gone' : ''}"><span>${esc(when(x.at))}</span><span>${esc(x.what)}${x.peer && x.kind === 'admin' ? ' · ' + esc(x.peer) : ''}</span><b>${x.xp > 0 ? '+' : ''}${x.xp}</b></div>`).join('') : '<p class="muted">Пусто.</p>';
          box.hidden = false;
        } catch (x) { if (lostAdmin(x) || lostSession(x)) fail(x); else msg.textContent = x.message; }
      }));
      document.querySelectorAll('[data-lvadj]').forEach((b) => b.addEventListener('click', () => {
        const row = b.closest('.adm-row');
        if (row.querySelector('.adm-lv-adj')) return;
        const f = document.createElement('form');
        f.className = 'adm-lv-adj adm-ann-row';
        f.innerHTML = `<input type="number" step="1" required placeholder="+50 или -50" aria-label="Сколько опыта"><input maxlength="120" placeholder="За что (видно в журнале)" aria-label="За что"><button class="btn primary">Сохранить</button>`;
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const [n, note] = f.querySelectorAll('input');
          try { await call('POST', '/admin/levels/adjust', { id: b.dataset.lvadj, xp: +n.value, note: note.value }); levels(); }
          catch (x) { if (lostAdmin(x) || lostSession(x)) fail(x); else msg.textContent = x.message; }
        });
        row.appendChild(f);
        f.querySelector('input').focus();
      }));
    } catch (x) { if (!stale(my)) fail(x); }
  }

  async function mail() {
    const my = fresh();
    try {
      const d = await call('GET', '/admin/mail');
      if (stale(my)) return;
      const last = d.last;
      const kinds = { reset: 'сброс пароля', verify: 'подтверждение почты', test: 'тестовое' };
      sec().innerHTML = `<div class="head"><h2 class="h2">Почта</h2><span class="label">${d.on ? 'подключена' : 'не подключена'}</span></div>
        <p class="muted">Письма для «Забыли пароль?» и подтверждения почты уходят через Resend. Ключ задаётся в Cloudflare (MAIL_KEY), здесь не показывается.</p>
        <ul class="adm-mail">
          <li><b>Ключ</b> ${d.hasKey ? (d.keyLooksRight ? 'есть' : 'есть, но не похож на ключ Resend (должен начинаться с re_)') : 'нет'}</li>
          <li><b>Отправитель</b> ${d.from ? esc(d.from) : 'не задан (MAIL_FROM)'}</li>
          <li><b>Последнее письмо</b> ${last ? `${esc(when(last.at))} · ${esc(kinds[last.kind] || last.kind || '')} · ${esc(last.to || '')} · ${last.ok ? '<span class="adm-ok">ушло</span>' : `<span class="adm-bad">не ушло (${esc(last.status)})</span>`}` : 'пока не отправлялось'}</li>
          ${last && !last.ok ? `<li><b>Ответ Resend</b> ${esc(last.msg || '—')}</li>` : ''}
        </ul>
        <div class="adm-ann-row"><button type="button" class="btn primary" id="admMailTest"${d.on ? '' : ' disabled'}>Отправить тестовое письмо себе${d.to ? ' (' + esc(d.to) + ')' : ''}</button></div>
        <p class="adm-err" id="admMailMsg" role="status"></p>`;
      $('#admMailTest').addEventListener('click', async (e) => {
        const b = e.currentTarget, m = $('#admMailMsg');
        b.disabled = true; m.textContent = 'Отправляю…';
        try {
          const r = await call('POST', '/admin/mail-test');
          m.textContent = r.ok ? `Ушло на ${r.to}. Проверь почту, в том числе «Спам».` : 'Не ушло. Ответ Resend — в строке выше.';
          setTimeout(mail, r.ok ? 1500 : 0);
        } catch (x) { if (lostAdmin(x) || lostSession(x)) fail(x); else { m.textContent = x.message; b.disabled = false; } }
      });
    } catch (x) { if (!stale(my)) fail(x); }
  }

  // резервные копии базы: каждую ночь их делает casualhub-rt (rt/backup.js), здесь — список, «Сделать копию сейчас» и скачать
  const size = (n) => (n < 1e6 ? Math.max(1, Math.round(n / 1e3)) + ' КБ' : mb(n));
  const rowsText = (n) => `${n} ${plural(n, 'строка', 'строки', 'строк')}`;
  let backupT = 0;
  async function backup() {
    const my = fresh();
    clearTimeout(backupT);
    try {
      const d = await call('GET', '/admin/backup');
      if (stale(my)) return;
      if (!d.on) {
        sec().innerHTML = `<div class="head"><h2 class="h2">Копии</h2><span class="label">не включены</span></div>
          <p class="muted">Копию базы каждую ночь делает Worker casualhub-rt и кладёт в хранилище R2. Пока он не выложен вместе с хранилищем, копий нет. Порядок — в README, раздел «Резервные копии».</p>`;
        return;
      }
      const run = d.run, facts = (list) => list.map((x) => `<span>${esc(x)}</span>`).join('');
      sec().innerHTML = `<div class="head"><h2 class="h2">Копии</h2><span class="label">каждую ночь, хранятся последние ${d.keep}</span></div>
        <p class="muted">В копии все оценки, фото, тир-листы, лоты и аккаунты. Пароли, 2FA и пин-коды в ней зашифрованы ключом BACKUP_KEY, которого в хранилище нет. Входы на устройствах в копию не попадают: после восстановления все войдут заново. Файл — JSON Lines, восстановление описано в README.</p>
        ${d.secrets === 'blank' ? '<p class="adm-err">Ключ BACKUP_KEY не задан: пароли, 2FA и пин-коды в копию не попадают, после восстановления их придётся сбрасывать. Как задать ключ — в README, раздел «Резервные копии».</p>' : ''}
        ${run ? `<p class="adm-bk-run" role="status"><b>Делаю копию</b>${facts((run.of ? [run.table ? 'таблица ' + run.table : 'дописываю', `${Math.min(run.step + 1, run.of)} из ${run.of}`, rowsText(run.rows)].concat(run.bytes ? [size(run.bytes)] : []) : ['начинаю']).concat(run.fails ? ['повторяю после ошибки'] : []))}</p>` : ''}
        ${d.error ? `<p class="adm-err">Копия ${esc(when(d.error.at))} не получилась: ${esc(d.error.msg)}</p>` : ''}
        <div class="adm-ann-row"><button type="button" class="btn primary" id="admBkNow"${run ? ' disabled' : ''}>Сделать копию сейчас</button></div>
        <p class="adm-err" id="admBkMsg" role="status"></p>
        ${d.runs.length ? `<ul class="adm-list adm-bk">${d.runs.map((r, i) => `<li class="adm-row" style="--k:${Math.min(i, 12)}">
            <div class="adm-who"><b>${esc(when(r.done))}</b><small>${facts([size(r.bytes), rowsText(r.rows), r.by === 'cron' ? 'ночная' : 'вручную ' + r.by].concat(r.secrets === 'blank' ? ['без паролей'] : []))}</small></div>
            <div class="adm-acts"><button type="button" class="btn ghost small" data-bk="${esc(r.id)}">Скачать</button></div>
          </li>`).join('')}</ul>` : '<p class="muted">Копий пока нет: первая появится ночью или по кнопке выше.</p>'}`;
      const msg = $('#admBkMsg');
      $('#admBkNow').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try { await call('POST', '/admin/backup'); backup(); }
        catch (x) { if (lostAdmin(x) || lostSession(x)) fail(x); else { msg.textContent = x.message; btn.disabled = false; } }
      });
      sec().querySelectorAll('[data-bk]').forEach((b) => b.addEventListener('click', async () => {
        const label = b.textContent;
        b.disabled = true; b.textContent = 'Скачиваю…'; msg.textContent = '';
        try {
          // через fetch, а не ссылкой: админке нужен заголовок с токеном
          const r = await fetch('/api/admin/export?id=' + encodeURIComponent(b.dataset.bk), { headers: { authorization: 'Bearer ' + token } })
            .catch(() => { throw Object.assign(new Error('Нет связи с сервером, проверь интернет и попробуй ещё раз'), { status: 0 }); });
          if (!r.ok) { const x = await r.json().catch(() => ({})); throw Object.assign(new Error(x.error || 'Не получилось скачать копию'), { status: r.status }); }
          const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
          a.href = url; a.download = `casualhub-${b.dataset.bk}.ndjson`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60e3);
        } catch (x) { if (lostAdmin(x) || lostSession(x)) { fail(x); return; } msg.textContent = x.message; }
        b.disabled = false; b.textContent = label;
      }));
      // пока копия идёт, вкладка обновляется сама
      if (run) backupT = setTimeout(() => { if (!stale(my) && tab === 'backup') backup(); }, 3000);
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
    if (!me.pinSet) { pinSetup(); return; }
    if (me.active) panel(); else pinForm();
  }
  start();
})();
