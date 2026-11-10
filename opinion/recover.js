/* Казуал Хаб: вход и восстановление — код из приложения-аутентификатора при входе (двухфакторная защита),
   «Забыли пароль?» и ссылки из писем (#reset=… — новый пароль, #verify=… — подтверждение почты).
   Письма работают, только если на сервере подключена почта (GET /api/auth/options → mail). */
(() => {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function post(path, body) {
    const r = await fetch('/api' + path, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз.');
    return d;
  }
  let optsP = null;
  const options = () => optsP || (optsP = fetch('/api/auth/options', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  // почта подключена — на формах входа появляется «Забыли пароль?»
  options().then((o) => { if (o && o.mail) document.documentElement.classList.add('mail-on'); });

  const css = document.createElement('style');
  css.textContent = `
[data-forgot] { display: none !important; }
html.mail-on [data-forgot] { display: inline-flex !important; }
.rv-sheet { position: fixed; inset: 0; z-index: 130; display: grid; place-items: center; padding: 16px; background: rgba(8, 10, 14, .6); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.rv-card { width: min(400px, 100%); display: grid; gap: 12px; padding: 20px; border: 1px solid var(--line, #2b2e38); border-radius: 20px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); box-shadow: 0 30px 70px -28px rgba(0, 0, 0, .7); }
.rv-card h3 { margin: 0; font-size: 19px; }
.rv-card p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ink-2, #b9bdc8); }
.rv-in { width: 100%; height: 46px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 12px; background: var(--panel-2, #23262f); color: var(--ink, #f3f4f6); font: inherit; font-size: 16px; }
.rv-in.code { font-size: 22px; letter-spacing: .2em; text-align: center; font-variant-numeric: tabular-nums; }
.rv-in:focus { outline: none; border-color: var(--accent, #3550E8); box-shadow: 0 0 0 3px var(--accent-soft, rgba(53, 80, 232, .2)); }
.rv-err { min-height: 0; font-size: 13px; font-weight: 600; color: #f2555a; }
.rv-err:empty { display: none; }
.rv-acts { display: flex; gap: 8px; }
.rv-acts button { flex: 1; min-height: 44px; border-radius: 12px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink, #f3f4f6); font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; }
.rv-acts .pri { border-color: transparent; background: var(--ink, #f3f4f6); color: var(--panel, #1b1d24); }
.rv-acts button:disabled { opacity: .55; cursor: default; }`;
  document.head.appendChild(css);

  // маленькое окно: заголовок, текст, поля и две кнопки. Отмена — null
  function dialog({ title, text, fields, ok, cancel, onOk }) {
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.className = 'rv-sheet';
      box.innerHTML = `<form class="rv-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
        ${(fields || []).map((f) => `<input class="rv-in${f.code ? ' code' : ''}" name="${f.name}" type="${f.type || 'text'}" ${f.attrs || ''} placeholder="${esc(f.ph || '')}" value="${esc(f.value || '')}" aria-label="${esc(f.ph || f.name)}">`).join('')}
        <span class="rv-err" role="alert"></span>
        <div class="rv-acts">${cancel === false ? '' : `<button type="button" data-x>${esc(cancel || 'Отмена')}</button>`}<button type="submit" class="pri">${esc(ok || 'Готово')}</button></div></form>`;
      document.body.appendChild(box);
      const form = box.querySelector('form'), err = box.querySelector('.rv-err');
      const done = (v) => { box.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
      document.addEventListener('keydown', key, true);
      box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-x]')) done(null); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(form));
        if (!onOk) { done(v); return; }
        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true; err.textContent = '';
        try { const r = await onOk(v, form); if (r !== false) done(r === undefined ? v : r); }
        catch (er) { err.textContent = er.message; }
        btn.disabled = false;
      });
      const first = form.querySelector('input');
      setTimeout(() => (first || form.querySelector('.pri')).focus(), 30);
    });
  }

  // второй шаг входа: код из приложения или запасной. Ошибка прошлой попытки показывается в окне
  window.CasualAskCode = function (error) {
    const p = dialog({
      title: 'Код из приложения',
      text: 'У аккаунта включена двухфакторная защита. Открой приложение-аутентификатор и введи 6 цифр для Казуал Хаба. Нет телефона под рукой — подойдёт запасной код.',
      fields: [{ name: 'code', code: true, ph: '123 456', attrs: 'autocomplete="one-time-code" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="12" required' }],
      ok: 'Войти',
    });
    if (error) setTimeout(() => { const e = document.querySelector('.rv-sheet:last-child .rv-err'); if (e) e.textContent = error; }, 0);
    return p.then((v) => (v ? String(v.code || '').trim() : null));
  };

  // «Забыли пароль?»: письмо со ссылкой на почту аккаунта
  function forgot(prefill) {
    return dialog({
      title: 'Восстановление пароля',
      text: 'Впиши почту аккаунта: пришлём ссылку, по которой можно задать новый пароль.',
      fields: [{ name: 'email', type: 'email', ph: 'name@mail.com', value: /@/.test(prefill || '') ? prefill : '', attrs: 'autocomplete="email" required' }],
      ok: 'Отправить',
      onOk: async (v) => {
        await post('/password/forgot', { email: v.email });
        await dialog({ title: 'Письмо в пути', text: 'Если на эту почту есть аккаунт, письмо со ссылкой уже отправлено. Ссылка работает час. Не видно письма — загляни в «Спам».', ok: 'Понятно', cancel: false });
      },
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-forgot]');
    if (!b) return;
    e.preventDefault();
    const ident = document.getElementById('inputLoginIdent');
    forgot(ident ? ident.value.trim() : '');
  });

  // ссылки из писем
  function fromHash() {
    const m = location.hash.match(/^#(reset|verify)=([0-9a-f]{64})$/);
    if (!m) return;
    // ссылка с токеном не остаётся в адресной строке и истории
    history.replaceState(null, '', location.pathname + location.search);
    const token = m[2];
    if (m[1] === 'reset') {
      dialog({
        title: 'Новый пароль',
        text: 'Придумай новый пароль: от 8 символов и не из самых простых. После смены все входы на других устройствах закроются.',
        fields: [{ name: 'pass', type: 'password', ph: 'Новый пароль', attrs: 'autocomplete="new-password" minlength="8" required' }, { name: 'pass2', type: 'password', ph: 'Ещё раз', attrs: 'autocomplete="new-password" minlength="8" required' }],
        ok: 'Сменить пароль',
        onOk: async (v) => {
          if (v.pass !== v.pass2) throw new Error('Пароли не совпадают.');
          await post('/password/reset', { token, password: v.pass });
        },
      }).then(async (v) => {
        if (!v) return;
        await dialog({ title: 'Пароль сменён', text: 'Теперь войди с новым паролем.', ok: 'Войти', cancel: false });
        if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); else location.hash = 'login';
      });
    } else {
      post('/email/verify', { token })
        .then(() => dialog({ title: 'Почта подтверждена', text: 'Готово: если когда-нибудь забудешь пароль, его можно будет сбросить по почте.', ok: 'Отлично', cancel: false }))
        .catch((er) => dialog({ title: 'Не получилось', text: esc(er.message), ok: 'Понятно', cancel: false }));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fromHash); else fromHash();
  addEventListener('hashchange', fromHash);

  window.CasualRecover = { options, forgot, dialog };
})();
