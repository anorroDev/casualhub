/* Админ-панель Казуал Хаба. Кто админ, решает сервер (/api/admin/me): остальным страница отвечает «нет доступа».
   Первый вход — одноразовый пароль (секрет ADMIN_CODE в Cloudflare), дальше аккаунт запоминается админом. */
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
  // запоминаем, что админка открывалась: кнопка «Админ» в шапке останется и после смены юзернейма
  const remember = () => { try { localStorage.setItem('casualhub.admin.v1', user.id); } catch (e) {} };

  function message(title, text, actions) {
    app.innerHTML = `<section class="card rise adm-lock"><span class="adm-ic">${SHIELD(30)}</span><h1 class="h2">${esc(title)}</h1><p class="muted">${text}</p>${actions || ''}</section>`;
  }

  // уже админ, но вход в админку истёк (он живёт 12 часов и только на этом устройстве): подтверди паролем от аккаунта
  function relock(handle) {
    app.innerHTML = `<section class="card rise adm-lock" id="admLock">
      <span class="adm-ic">${SHIELD(30)}</span>
      <h1 class="h2">Подтверди, что это ты</h1>
      <p class="muted">@${esc(handle)}, вход в админку действует 12 часов. Введи пароль от своего аккаунта, чтобы открыть её снова.</p>
      <form id="admForm">
        <label class="vh" for="admCode">Пароль от аккаунта</label>
        <input class="adm-in" id="admCode" type="password" autocomplete="current-password" maxlength="200" placeholder="Пароль от аккаунта" required>
        <p class="adm-err" id="admErr" role="alert"></p>
        <button type="submit" class="btn primary">Открыть админку</button>
      </form>
    </section>`;
    wireForm(handle, (v) => ({ password: v }));
  }
  function wireForm(handle, bodyOf) {
    const form = $('#admForm'), input = $('#admCode'), err = $('#admErr'), box = $('#admLock');
    input.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      if (btn.disabled || !input.value.trim()) return;
      btn.disabled = true; err.textContent = '';
      try {
        await call('POST', '/admin/unlock', bodyOf(input.value));
        input.value = '';
        remember();
        panel(handle);
      } catch (x) {
        err.textContent = x.message;
        input.select();
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
        btn.disabled = false;
      }
    });
  }

  function lock(ready, handle) {
    if (!ready) {
      message('Админ-панель', 'Одноразовый пароль ещё не задан на сервере. Его нужно добавить в настройках Cloudflare (секрет <b>ADMIN_CODE</b>), а потом обновить эту страницу.');
      return;
    }
    app.innerHTML = `<section class="card rise adm-lock" id="admLock">
      <span class="adm-ic">${SHIELD(30)}</span>
      <h1 class="h2">Вход в админку</h1>
      <p class="muted">Привет, @${esc(handle)}! Первый раз нужно ввести одноразовый пароль. Потом админка будет открываться сразу.</p>
      <form id="admForm" autocomplete="off">
        <label class="vh" for="admCode">Одноразовый пароль</label>
        <input class="adm-in" id="admCode" type="password" autocomplete="one-time-code" maxlength="200" placeholder="Одноразовый пароль" required>
        <p class="adm-err" id="admErr" role="alert"></p>
        <button type="submit" class="btn primary">Войти</button>
      </form>
    </section>`;
    wireForm(handle, (v) => ({ code: v }));
  }

  // сама панель: пока пусто, разделы появятся позже
  function panel(handle) {
    document.title = 'Админ-панель · Казуал Хаб';
    app.innerHTML = `<div class="adm">
      <section class="card rise adm-hero" style="--d:0">
        <span class="adm-ic">${SHIELD(32)}</span>
        <div><span class="adm-tag">Админ</span><h1>Админ-панель</h1><p class="muted">Ты вошёл как @${esc(handle)}. Вход действует 12 часов на этом устройстве. Пока здесь пусто: инструменты будут появляться по мере надобности.</p>
          <button type="button" class="btn ghost" id="admOut">Выйти из админки</button></div>
      </section>
      <section class="card rise" style="--d:1">
        <div class="head"><h2 class="h2">Разделы</h2><span class="label">скоро</span></div>
        <div class="adm-grid">
          <div class="adm-tile"><em>скоро</em><b>Пользователи</b><small>Аккаунты, ники и баны</small></div>
          <div class="adm-tile"><em>скоро</em><b>Комментарии</b><small>Жалобы и удаление</small></div>
          <div class="adm-tile"><em>скоро</em><b>Статистика</b><small>Сколько людей и оценок</small></div>
          <div class="adm-tile"><em>скоро</em><b>Объявления</b><small>Сообщение всем на сайте</small></div>
        </div>
      </section>
    </div>`;
    $('#admOut').addEventListener('click', async () => {
      try { await call('POST', '/admin/lock'); } catch (e) {}
      relock(handle);
    });
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
    let st;
    try { st = await call('GET', '/admin/me'); } catch (x) {
      if (x.status === 404 || x.status === 401) message('Нет доступа', 'Эта страница только для админов сайта.', '<a class="btn ghost" href="/">На главную</a>');
      else message('Админ-панель', esc(x.message), '<button type="button" class="btn ghost" id="admRetry">Попробовать ещё раз</button>');
      const r = $('#admRetry');
      if (r) r.addEventListener('click', start);
      return;
    }
    if (st.admin && st.active) { remember(); panel(st.handle); } else if (st.admin) { remember(); relock(st.handle); } else lock(st.ready, st.handle);
  }
  start();
})();
