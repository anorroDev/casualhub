/* Казуал Хаб: окно «Настройки» — разделы слева (на телефоне — списком, раздел открывается целиком).
   Грузится из header-menu.js при первом открытии. Аккаунт и безопасность работают через /api (PUT /account,
   /sessions, /account/delete), остальное хранится в этом браузере. Новый пункт — в SECTIONS и render-функцию раздела. */
(() => {
  const API = '/api';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const user = () => read('ocenshik.user.v1');
  const token = () => { const u = user(); return u && u.id ? (read('casualhub.tokens.v1') || {})[u.id] || null : null; };
  async function api(path, method = 'GET', body) {
    const t = token();
    const r = await fetch(API + path, { method, cache: 'no-store', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.error || 'Не получилось, попробуй ещё раз.');
    return d;
  }

  const I = (p) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const SECTIONS = [
    { id: 'account', name: 'Аккаунт', desc: 'Ник, юзернейм, профиль', icon: I('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/>') },
    { id: 'security', name: 'Безопасность', desc: 'Пароль, почта, устройства', icon: I('<path d="M12 3l7 2.6v5.6c0 4.4-3 7.8-7 9.3-4-1.5-7-4.9-7-9.3V5.6z"/><path d="M9 12l2.2 2.2L15.5 10"/>') },
    { id: 'privacy', name: 'Приватность', desc: 'Кто что видит', icon: I('<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>') },
    { id: 'look', name: 'Внешний вид', desc: 'Тема, вид, язык', icon: I('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/>') },
    { id: 'data', name: 'Данные', desc: 'Импорт, обложки, копия', icon: I('<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/>') },
    { id: 'general', name: 'Общее', desc: 'Примеры и подсказки', icon: I('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>') },
  ];

  const STYLE = `
.st-sheet { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; padding: 16px; background: rgba(8, 10, 14, .6); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.st-sheet[hidden] { display: none; }
.st-card { position: relative; width: min(880px, 100%); height: min(640px, calc(100dvh - 32px)); display: grid; grid-template-columns: 230px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); border: 1px solid var(--line, #2b2e38); border-radius: 20px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); box-shadow: 0 30px 70px -28px rgba(0, 0, 0, .7); overflow: hidden; animation: st-in .24s cubic-bezier(.22, 1, .36, 1); }
@keyframes st-in { from { transform: translateY(12px) scale(.98); opacity: 0; } }
.st-nav { min-height: 0; display: grid; align-content: start; gap: 2px; padding: 18px 10px; border-right: 1px solid var(--line, #2b2e38); background: var(--panel-2, #23262f); overflow: auto; }
.st-nav h2 { margin: 0 0 10px; padding: 0 10px; font-size: 19px; }
.st-nb { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 11px; background: transparent; color: var(--ink-2, #b9bdc8); font: inherit; font-size: 14px; font-weight: 600; text-align: left; cursor: pointer; }
.st-nb:hover { background: color-mix(in srgb, var(--ink, #fff) 6%, transparent); color: var(--ink, #f3f4f6); }
.st-nb[aria-current="page"] { background: var(--accent-soft, rgba(53, 80, 232, .16)); color: var(--ink, #f3f4f6); }
.st-nb[aria-current="page"] .st-ni { color: var(--accent, #3550E8); }
.st-ni { flex: none; display: grid; place-items: center; width: 22px; color: var(--ink-3, #8b8f9c); }
.st-nt { display: grid; gap: 1px; min-width: 0; }
.st-nt small { display: none; font-size: 12.5px; font-weight: 500; color: var(--ink-3, #8b8f9c); }
.st-ngo { display: none; margin-left: auto; font-size: 22px; color: var(--ink-3, #8b8f9c); }
.st-main { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; }
.st-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px 24px; }
.st-head h3 { flex: 1; margin: 0; font-size: 19px; }
.st-back { display: none; flex: none; height: 36px; padding: 0 10px 0 6px; border: 0; border-radius: 10px; background: transparent; color: var(--accent, #3550E8); font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; }
.st-x { flex: none; width: 36px; height: 36px; border: 1px solid var(--line, #2b2e38); border-radius: 50%; background: transparent; color: inherit; font-size: 15px; cursor: pointer; }
.st-x:hover, .st-back:hover { background: color-mix(in srgb, var(--ink, #fff) 6%, transparent); }
.st-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 24px 24px; display: grid; gap: 22px; align-content: start; }
.st-grp { display: grid; gap: 8px; }
.st-lab { font-size: 12.5px; font-weight: 700; color: var(--ink-3, #8b8f9c); }
.st-box { display: grid; border: 1px solid var(--line, #2b2e38); border-radius: 14px; background: var(--panel-2, #23262f); }
.st-box > * + * { border-top: 1px solid var(--line, #2b2e38); }
.st-row { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 10px 14px; color: inherit; text-decoration: none; }
a.st-row:hover, label.st-row:hover { background: color-mix(in srgb, var(--ink, #fff) 4%, transparent); }
.st-box > :first-child { border-radius: 13px 13px 0 0; } .st-box > :last-child { border-radius: 0 0 13px 13px; } .st-box > :only-child { border-radius: 13px; }
label.st-row { cursor: pointer; }
.st-t { flex: 1; min-width: 0; display: grid; gap: 2px; }
.st-t b { font-size: 14.5px; font-weight: 600; }
.st-t small { font-size: 12.5px; line-height: 1.35; color: var(--ink-2, #b9bdc8); }
.st-go { flex: none; font-size: 22px; color: var(--ink-3, #8b8f9c); }
.st-sw { position: relative; flex: none; width: 42px; height: 24px; margin: 0; appearance: none; -webkit-appearance: none; border-radius: 99px; background: var(--line, #3a3e4a); cursor: pointer; transition: background .2s; }
.st-sw::after { content: ''; position: absolute; left: 3px; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); transition: transform .2s; }
.st-sw:checked { background: var(--accent, #3550E8); }
.st-sw:checked::after { transform: translateX(18px); }
.st-sw:focus-visible { outline: 2px solid var(--accent, #3550E8); outline-offset: 2px; }
.st-form { display: grid; gap: 10px; padding: 14px; }
.st-f { display: grid; gap: 5px; }
.st-f > span { font-size: 13px; font-weight: 600; color: var(--ink-2, #b9bdc8); }
.st-in { width: 100%; height: 44px; padding: 0 12px; border: 1px solid var(--line, #2b2e38); border-radius: 11px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); font: inherit; font-size: 15px; }
.st-in:focus { outline: none; border-color: var(--accent, #3550E8); box-shadow: 0 0 0 3px var(--accent-soft, rgba(53, 80, 232, .2)); }
.st-at { display: flex; align-items: center; border: 1px solid var(--line, #2b2e38); border-radius: 11px; background: var(--panel, #1b1d24); }
.st-at > span { padding-left: 12px; color: var(--ink-3, #8b8f9c); }
.st-at .st-in { border: 0; background: transparent; padding-left: 2px; }
.st-at:focus-within { border-color: var(--accent, #3550E8); box-shadow: 0 0 0 3px var(--accent-soft, rgba(53, 80, 232, .2)); }
.st-at:focus-within .st-in { box-shadow: none; }
.st-hint { font-size: 12.5px; line-height: 1.35; color: var(--ink-3, #8b8f9c); }
.st-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.st-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 16px; border: 1px solid var(--line, #2b2e38); border-radius: 11px; background: transparent; color: var(--ink, #f3f4f6); font: inherit; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; }
.st-btn:hover { background: color-mix(in srgb, var(--ink, #fff) 6%, transparent); }
.st-btn.pri { border-color: transparent; background: var(--ink, #f3f4f6); color: var(--panel, #1b1d24); }
.st-btn.pri:hover { opacity: .9; }
.st-btn.bad { border-color: color-mix(in srgb, #e5484d 55%, transparent); color: #f2555a; }
.st-btn.bad:hover { background: color-mix(in srgb, #e5484d 12%, transparent); }
.st-btn.bad.pri { background: #e5484d; color: #fff; border-color: transparent; }
.st-btn:disabled { opacity: .5; cursor: default; }
.st-msg { font-size: 13px; font-weight: 600; }
.st-msg[data-tone="ok"] { color: #2EAD60; } .st-msg[data-tone="bad"] { color: #f2555a; }
.st-me { display: flex; align-items: center; gap: 14px; padding: 14px; }
.st-ava { flex: none; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background-size: cover; background-position: center; color: #fff; font-size: 22px; font-weight: 800; }
.st-me .st-t b { font-size: 17px; }
.st-dev { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
.st-dev .st-ni { width: 36px; height: 36px; border-radius: 10px; background: var(--panel, #1b1d24); }
.st-tag { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 99px; background: var(--accent-soft, rgba(53, 80, 232, .16)); color: var(--accent, #3550E8); font-size: 11.5px; font-weight: 700; vertical-align: 1px; }
.st-fold > summary { list-style: none; cursor: pointer; }
.st-fold > summary::-webkit-details-marker { display: none; }
.st-fold > summary:hover { background: color-mix(in srgb, var(--ink, #fff) 4%, transparent); }
.st-fold[open] > summary .st-btn { opacity: .55; }
.st-fold > .st-form { padding-top: 2px; }
.st-qr { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.st-qr svg { flex: none; width: 176px; height: 176px; border-radius: 12px; }
.st-qr > .st-t { flex: 1 1 180px; }
.st-key { font: 600 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .06em; word-break: normal; user-select: all; color: var(--ink, #f3f4f6); }
.st-codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.st-codes code { padding: 8px 10px; border: 1px solid var(--line, #2b2e38); border-radius: 10px; background: var(--panel, #1b1d24); font: 600 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: center; letter-spacing: .06em; user-select: all; }
.st-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2, #b9bdc8); cursor: pointer; }
.st-check input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent, #3550E8); }
.st-danger { border-color: color-mix(in srgb, #e5484d 40%, var(--line, #2b2e38)); }
.st-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; padding: 12px; }
.st-th { display: grid; gap: 6px; padding: 6px; border: 2px solid transparent; border-radius: 12px; background: transparent; color: var(--ink, #f3f4f6); font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
.st-th:hover { background: color-mix(in srgb, var(--ink, #fff) 5%, transparent); }
.st-th[aria-pressed="true"] { border-color: var(--accent, #3550E8); background: var(--accent-soft, rgba(53, 80, 232, .16)); }
.st-th i { position: relative; display: block; height: 40px; border-radius: 8px; background: var(--pb); box-shadow: inset 0 0 0 1px rgb(127 127 127 / .25); overflow: hidden; }
.st-th i::before { content: ''; position: absolute; left: 6px; right: 6px; top: 6px; height: 12px; border-radius: 4px; background: var(--pp); }
.st-th i::after { content: ''; position: absolute; left: 6px; bottom: 6px; width: 46%; height: 8px; border-radius: 99px; background: var(--pa); }
.st-seg { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--line, #2b2e38); border-radius: 12px; }
.st-seg button { min-height: 36px; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; color: var(--ink-2, #b9bdc8); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.st-seg button[aria-pressed="true"] { background: var(--ink, #f3f4f6); color: var(--panel, #1b1d24); }
.st-empty { display: grid; gap: 12px; justify-items: start; padding: 18px; }
.st-empty p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ink-2, #b9bdc8); }
.st-toast { position: absolute; left: 50%; bottom: 16px; z-index: 2; width: max-content; max-width: calc(100% - 32px); padding: 10px 16px; border-radius: 12px; background: var(--ink, #f3f4f6); color: var(--panel, #1b1d24); font-size: 14px; font-weight: 600; text-align: center; transform: translate(-50%, 12px); opacity: 0; pointer-events: none; transition: opacity .2s, transform .25s; }
.st-toast.on { opacity: 1; transform: translate(-50%, 0); }
/* полосы прокрутки — общие для сайта, в /base.css */
@media (max-width: 719px) {
  .st-sheet { padding: 0; place-items: stretch; }
  .st-card { width: 100%; height: 100dvh; grid-template-columns: minmax(0, 1fr); border: 0; border-radius: 0; }
  .st-nav { padding: max(14px, env(safe-area-inset-top)) 12px 24px; border-right: 0; background: var(--panel, #1b1d24); gap: 4px; }
  .st-nav h2 { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 6px; font-size: 24px; }
  .st-nb { min-height: 60px; padding: 10px 12px; border: 1px solid var(--line, #2b2e38); background: var(--panel-2, #23262f); color: var(--ink, #f3f4f6); }
  .st-nb[aria-current="page"] { background: var(--panel-2, #23262f); }
  .st-nb[aria-current="page"] .st-ni { color: var(--ink-3, #8b8f9c); }
  .st-nt small, .st-ngo { display: block; }
  .st-card[data-view="list"] .st-main { display: none; }
  .st-card[data-view="sec"] .st-nav { display: none; }
  .st-head { padding: max(12px, env(safe-area-inset-top)) 12px 8px 8px; }
  .st-back { display: inline-flex; align-items: center; }
  .st-head h3 { font-size: 18px; text-align: center; }
  .st-body { padding: 0 14px calc(24px + env(safe-area-inset-bottom)); }
}
@media (min-width: 720px) { .st-nav-x { display: none; } }
@media (prefers-reduced-motion: reduce) { .st-card { animation: none; } .st-sw, .st-sw::after { transition: none; } }
html.unslop .st-card { box-shadow: 0 24px 60px -30px rgb(0 0 0 / .45); }
html.unslop .st-sheet { backdrop-filter: none; -webkit-backdrop-filter: none; }`;

  let box = null, card = null, cur = 'account', me = null, toastT = 0, mailOn = false;
  fetch(API + '/auth/options', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((o) => { mailOn = !!(o && o.mail); }).catch(() => {});
  const $ = (s) => box.querySelector(s);
  const narrow = () => matchMedia('(max-width: 719px)').matches;
  function toast(t) {
    const n = $('.st-toast');
    n.textContent = t;
    n.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => n.classList.remove('on'), 2600);
  }
  const msg = (form, text, tone) => { const m = form.querySelector('.st-msg'); if (m) { m.textContent = text || ''; m.dataset.tone = tone || ''; } };
  const row = (o) => `<${o.href ? `a href="${esc(o.href)}"` : 'div'} class="st-row"${o.attr ? ' ' + o.attr : ''}><span class="st-t"><b>${esc(o.name)}</b>${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span>${o.href ? '<span class="st-go" aria-hidden="true">›</span>' : o.end || ''}</${o.href ? 'a' : 'div'}>`;
  const toggle = (o) => `<label class="st-row"><span class="st-t"><b>${esc(o.name)}</b>${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span><input type="checkbox" class="st-sw" ${o.attr}${o.on ? ' checked' : ''}></label>`;
  // пункт, который раскрывает свою форму по кнопке справа: длинные формы не висят открытыми все сразу
  const fold = (o) => `<details class="st-fold"${o.attr ? ' ' + o.attr : ''}><summary class="st-row"><span class="st-t"><b>${esc(o.name)}</b>${o.desc ? `<small>${o.desc}</small>` : ''}</span><span class="st-btn${o.bad ? ' bad' : ''}" aria-hidden="true">${esc(o.btn)}</span></summary>${o.form}</details>`;
  const grp = (title, inner, cls) => `<section class="st-grp">${title ? `<span class="st-lab">${esc(title)}</span>` : ''}<div class="st-box${cls ? ' ' + cls : ''}">${inner}</div></section>`;
  const needAccount = (what) => grp('', `<div class="st-empty"><p>${esc(what)} Войди или создай аккаунт: это бесплатно и занимает минуту.</p><a class="st-btn pri" href="/opinion/#login">Войти или создать аккаунт</a></div>`);
  const ago = (t) => {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60e3);
    if (m < 2) return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ч назад`;
    return day(t);
  };
  // даты и страны — на языке сайта
  const loc = () => (window.CasualLang && window.CasualLang.lang === 'en' ? 'en-US' : 'ru-RU');
  const day = (t, year) => new Date(t).toLocaleDateString(loc(), { day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) });
  const country = (c) => { try { return c ? new Intl.DisplayNames([loc().slice(0, 2)], { type: 'region' }).of(c) : ''; } catch (e) { return c || ''; } };
  // поменяли ник, юзернейм или почту здесь — та же запись в браузере, чтобы кнопка профиля и Мнение сразу видели новое
  function patchLocal(fields) {
    const u = user();
    if (!u) return;
    if (fields.name && fields.name !== u.name && !/^(data:image\/|https?:\/\/)/.test(u.avatar || '')) u.avatar = fields.name.charAt(0).toUpperCase();
    Object.assign(u, fields);
    write('ocenshik.user.v1', u);
    const all = read('ocenshik.users.v1');
    if (Array.isArray(all)) { const i = all.findIndex((x) => x && x.id === u.id); if (i >= 0) { all[i] = { ...all[i], ...fields, avatar: u.avatar }; write('ocenshik.users.v1', all); } }
    // Мнение держит профиль в памяти и при следующем сохранении записало бы старый: правим и там
    try {
      if (typeof state !== 'undefined' && state && state.user && state.user.id === u.id) {
        Object.assign(state.user, fields, { avatar: u.avatar });
        (state.users || []).forEach((x) => { if (x && x.id === u.id) Object.assign(x, fields, { avatar: u.avatar }); });
        if (fields.name) (state.ratings || []).forEach((r) => { if (r.author && r.author.id === u.id) r.author = { ...r.author, name: fields.name, avatar: u.avatar }; });
        if (typeof renderUserBar === 'function') renderUserBar();
      }
    } catch (e) {}
    if (window.CasualAccount) window.CasualAccount.render();
  }
  function forgetAccount() {
    const u = user();
    const t = read('casualhub.tokens.v1') || {};
    if (u) delete t[u.id];
    write('casualhub.tokens.v1', t);
    try { localStorage.removeItem('ocenshik.user.v1'); } catch (e) {}
  }

  // ---------- копия оценок: тот же файл, что «Резервная копия» в Мнении ----------
  // фото оценок лежат в IndexedDB (photo-store.js): на страницах без него скрипт подгружается
  const photoStore = () => (window.CasualPhotos ? Promise.resolve(window.CasualPhotos) : new Promise((res) => {
    const sc = document.createElement('script'); sc.src = '/photo-store.js';
    sc.onload = () => res(window.CasualPhotos || null); sc.onerror = () => res(null); document.head.appendChild(sc);
  }));
  const stampOf = (x) => +new Date(x.updatedAt || x.createdAt || 0) || 0;
  async function makeBackup() {
    const ratings = (read('ocenshik.ratings.v2') || []).filter((r) => r && typeof r.id === 'string' && !r.example);
    const ps = await photoStore();
    if (ps) {
      const keys = ratings.filter((r) => r.photo && ps.isKey(r.photo.ref) && !r.photo.data).map((r) => r.photo.ref);
      const got = keys.length ? await ps.getMany(keys) : {};
      ratings.forEach((r, i) => { const k = r.photo && r.photo.ref; if (k && got[k]) ratings[i] = { ...r, photo: { id: got[k], data: got[k], w: r.photo.w || 0, h: r.photo.h || 0 } }; });
    }
    // пароли в файл не попадают: копию могут и переслать
    return { version: 2, appName: 'Мнение Казуала', exportedAt: new Date().toISOString(), ratings, categories: read('ocenshik.cats.v2') || [], users: (read('ocenshik.users.v1') || []).map(({ pass, ...x }) => x), log: read('ocenshik.log.v2') || [] };
  }
  // бережное восстановление: недостающие добавляются, более свежие из файла заменяют старые, остальное не трогается
  async function restoreFrom(file) {
    if (file.size > 60e6) throw new Error('Файл слишком большой для копии оценок.');
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { throw new Error('Не получилось прочитать файл: это не копия оценок.'); }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.ratings) ? data.ratings : null;
    const inFile = (list || []).filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id && r.id.length <= 120 && typeof r.name === 'string' && r.name.trim() && !r.example).slice(0, 5000);
    if (!inFile.length) throw new Error('В этом файле нет оценок.');
    const u = user();
    const local = (read('ocenshik.ratings.v2') || []).filter((r) => r && typeof r.id === 'string');
    const at = new Map(local.map((r, i) => [r.id, i]));
    const people = new Set((read('ocenshik.users.v1') || []).map((x) => x && x.id));
    // удалённые раньше (здесь и, если вошёл, в аккаунте): восстановленная оценка свежее отметки, и синхронизация её не уберёт
    const tomb = new Map((read('casualhub.deleted.v1') || []).filter((d) => d && d.id).map((d) => [d.id, +d.at || 0]));
    let acc = null;
    if (token()) {
      try {
        acc = me || (await api('/me')).user;
        const sh = await api('/shelf/' + encodeURIComponent(acc.id));
        (sh.deleted || []).forEach((d) => { if (d && d.id) tomb.set(d.id, Math.max(tomb.get(d.id) || 0, +d.at || 0)); });
      } catch (e) {}
    }
    const ps = await photoStore();
    let added = 0, updated = 0;
    for (const r0 of inFile) {
      const r = { ...r0 };
      // копия с другого устройства: оценки становятся твоими, а не чужого профиля, которого здесь нет
      if (u && (!r.author || !people.has(r.author.id))) r.author = { id: u.id, name: u.name, avatar: u.avatar, color: u.color };
      const t = tomb.get(r.id);
      if (t && stampOf(r) <= t) r.updatedAt = new Date(t + 1000).toISOString();
      const i = at.get(r.id);
      if (i != null && stampOf(r) <= stampOf(local[i])) continue;
      // фото из файла — в IndexedDB, в оценке остаётся ссылка (иначе тяжёлые фото не влезут в браузер)
      const d = r.photo && [r.photo.data, r.photo.id].find((x) => typeof x === 'string' && x.startsWith('data:image/'));
      if (d && ps) { const key = ps.keyOf(d); if (await ps.put(key, d)) r.photo = { ref: key, w: r.photo.w || 0, h: r.photo.h || 0 }; }
      if (i == null) { at.set(r.id, local.length); local.push(r); added++; } else { local[i] = r; updated++; }
    }
    const ids = new Set(inFile.map((r) => r.id));
    write('casualhub.deleted.v1', (read('casualhub.deleted.v1') || []).filter((d) => !(d && ids.has(d.id))));
    // категории: добавляются только те, которых нет (по id или названию)
    const fileCats = Array.isArray(data.categories) ? data.categories.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.criteria)) : [];
    const cats = read('ocenshik.cats.v2');
    const have = Array.isArray(cats) ? cats : [];
    const newCats = fileCats.filter((c) => !have.some((x) => x && (x.id === c.id || String(x.name || '').trim().toLowerCase() === c.name.trim().toLowerCase())));
    if (newCats.length) {
      write('ocenshik.cats.v2', [...have, ...newCats].slice(0, 40));
      write('ocenshik.catsDeleted.v1', (read('ocenshik.catsDeleted.v1') || []).filter((d) => !(d && newCats.some((c) => c.id === d.id))));
      if (acc) { const m = read('ocenshik.catsAt.v1') || {}; m[acc.id] = Date.now(); write('ocenshik.catsAt.v1', m); }
    }
    if (added || updated) {
      try { localStorage.setItem('ocenshik.ratings.v2', JSON.stringify(local)); }
      catch (e) { throw new Error('В браузере не хватает места для всех оценок из файла.'); }
    }
    return { added, updated, same: inFile.length - added - updated, cats: newCats.length };
  }

  // ---------- разделы ----------
  const R = {};
  R.account = () => {
    const u = user();
    if (!u || !token()) return needAccount('Ник, юзернейм и профиль есть у аккаунта.');
    const img = typeof u.avatar === 'string' && /^(data:image\/|https?:\/\/)/.test(u.avatar);
    const since = me && me.createdAt ? day(me.createdAt, true) : '';
    return grp('', `<div class="st-me"><span class="st-ava" style="${img ? `background-image:url('${esc(u.avatar)}')` : `background-color:${esc(u.color || '#3550E8')}`}">${img ? '' : esc(String(u.name || '?').charAt(0).toUpperCase())}</span>
        <span class="st-t"><b>${esc(u.name)}</b><small>@${esc((me && me.handle) || u.handle || '')}${since ? ` · <span>с нами с ${esc(since)}</span>` : ''}</small></span></div>`)
      + grp('Ник и юзернейм', `<form class="st-form" data-f="names">
          <label class="st-f"><span>Ник</span><input class="st-in" name="name" value="${esc(u.name)}" minlength="2" maxlength="24" required autocomplete="nickname"></label>
          <span class="st-hint">Так тебя видят все. Может совпадать с чужим ником.</span>
          <label class="st-f"><span>Юзернейм</span><span class="st-at"><span>@</span><input class="st-in" name="handle" value="${esc((me && me.handle) || u.handle || '')}" minlength="3" maxlength="21" autocapitalize="none" autocorrect="off" spellcheck="false"></span></label>
          <span class="st-hint">По нему тебя находят друзья и по нему можно войти. Латиница, цифры, «_» и «.».</span>
          <div class="st-acts"><button type="submit" class="st-btn pri">Сохранить</button><span class="st-msg" role="status"></span></div></form>`)
      + grp('Профиль', row({ name: 'Аватар, обложка и виджеты', desc: 'Меняются прямо на странице профиля: нажми «Изменить профиль»', href: '/profile/' })
        + row({ name: 'Все мои оценки', desc: 'Список, плитки и тир-лист на отдельной странице', href: '/profile/?all=1' }))
      + grp('', `<div class="st-row"><span class="st-t"><b>Выйти из аккаунта</b><small>Оценки в этом браузере останутся, войти можно в любой момент</small></span><button type="button" class="st-btn" data-do="logout">Выйти</button></div>`);
  };
  R.security = () => {
    if (!user() || !token()) return needAccount('Пароль, почта и устройства есть у аккаунта.');
    const mail = (me && me.email) || user().email || '';
    return grp('Вход', fold({ name: 'Пароль', desc: 'После смены на остальных устройствах нужно будет войти заново', btn: 'Сменить', form: `<form class="st-form" data-f="pass">
          <label class="st-f"><span>Текущий пароль</span><input class="st-in" type="password" name="current" autocomplete="current-password" required></label>
          <label class="st-f"><span>Новый пароль</span><input class="st-in" type="password" name="pass" autocomplete="new-password" minlength="8" required></label>
          <label class="st-f"><span>Новый пароль ещё раз</span><input class="st-in" type="password" name="pass2" autocomplete="new-password" minlength="8" required></label>
          <label class="st-check"><input type="checkbox" data-show> Показать пароли</label>
          <span class="st-hint">От 8 символов и не из самых простых вроде «12345678».</span>
          <div class="st-acts"><button type="submit" class="st-btn pri">Сменить пароль</button><span class="st-msg" role="status"></span></div></form>` })
        + fold({ name: 'Почта', desc: mail ? esc(mail) + (me && me.emailOk ? ' · <span>подтверждена</span>' : mailOn && me ? ' · <span>не подтверждена</span>' : ' · <span>по почте тоже можно войти</span>') : 'Не указана', btn: 'Сменить', form: `<form class="st-form" data-f="mail">
          <label class="st-f"><span>Новая почта</span><input class="st-in" type="email" name="email" autocomplete="email" required placeholder="name@mail.com"></label>
          <label class="st-f"><span>Текущий пароль</span><input class="st-in" type="password" name="current" autocomplete="current-password" required></label>
          <div class="st-acts"><button type="submit" class="st-btn pri">Сменить почту</button><span class="st-msg" role="status"></span></div></form>` })
      + (mail && mailOn && me && !me.emailOk ? `<div class="st-row"><span class="st-t"><b>Подтвердить почту</b><small>Пришлём письмо со ссылкой. С подтверждённой почтой забытый пароль можно сбросить</small></span><button type="button" class="st-btn" data-do="verify-mail">Отправить письмо</button></div>` : ''))
      + grp('Двухфакторная защита', tfaBlock())
      + `<section class="st-grp"><span class="st-lab">Где выполнен вход</span><div class="st-box" id="stDevs"><div class="st-row"><span class="st-t"><small>Загружаю устройства…</small></span></div></div>
          <div class="st-acts"><button type="button" class="st-btn" data-do="others" hidden>Выйти на всех остальных устройствах</button></div></section>`
      + grp('Удаление', fold({ name: 'Удалить аккаунт', desc: 'Навсегда, вместе со всем на сервере', btn: 'Удалить…', bad: true, form: `<form class="st-form" data-f="delete">
          <span class="st-hint">Аккаунт и всё, что лежит на сервере, удалятся сразу и навсегда: оценки в облаке, тир-листы, друзья, комментарии, реакции и сборы лотов. Вернуть нельзя. Оценки в этом браузере останутся гостевыми.</span>
          <label class="st-f"><span>Текущий пароль</span><input class="st-in" type="password" name="current" autocomplete="current-password" required></label>
          <label class="st-f"><span>Впиши свой юзернейм для подтверждения</span><span class="st-at"><span>@</span><input class="st-in" name="confirm" autocapitalize="none" autocorrect="off" spellcheck="false" required></span></label>
          <div class="st-acts"><button type="submit" class="st-btn bad pri">Удалить аккаунт навсегда</button><span class="st-msg" role="status"></span></div></form>` }), 'st-danger');
  };
  // двухфакторная защита: выключена — подключение по QR-коду, включена — запасные коды и выключение
  function tfaBlock() {
    if (me && me.twoFactor) {
      return fold({ name: 'Включена', desc: `При входе нужен код из приложения · запасных кодов: ${me.backupLeft}`, btn: 'Настроить', form: `<div class="st-form" data-tfa>
          <form class="st-form" data-f="tfa-codes" style="padding:0">
            <span class="st-hint"><b>Новые запасные коды.</b> Старые перестанут работать. Нужен код из приложения.</span>
            <label class="st-f"><span>Код из приложения</span><input class="st-in" name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="6" required></label>
            <div class="st-acts"><button type="submit" class="st-btn">Получить новые коды</button><span class="st-msg" role="status"></span></div></form>
          <form class="st-form" data-f="tfa-off" style="padding:12px 0 0;border-top:1px solid var(--line, #2b2e38)">
            <span class="st-hint"><b>Выключить защиту.</b> Входить можно будет снова только по паролю.</span>
            <label class="st-f"><span>Текущий пароль</span><input class="st-in" type="password" name="current" autocomplete="current-password" required></label>
            <label class="st-f"><span>Код из приложения или запасной</span><input class="st-in" name="code" autocomplete="one-time-code" maxlength="12" required></label>
            <div class="st-acts"><button type="submit" class="st-btn bad">Выключить</button><span class="st-msg" role="status"></span></div></form></div>` });
    }
    return fold({ name: 'Выключена', desc: 'Включи: при входе, кроме пароля, понадобится код из приложения на телефоне. Даже узнав пароль, чужой не войдёт', btn: 'Включить', form: `<div class="st-form" data-tfa>
        <span class="st-hint">Нужно приложение-аутентификатор: Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden или любое похожее.</span>
        <div class="st-acts"><button type="button" class="st-btn pri" data-do="tfa-start">Показать QR-код</button><span class="st-msg" role="status"></span></div></div>` });
  }
  const loadQR = () => (window.CasualQR ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/qr.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); }));
  // запасные коды показываются один раз: скопировать, скачать файлом
  function showCodes(box, codes) {
    box.innerHTML = `<span class="st-hint"><b>Запасные коды.</b> Сохрани их: каждый работает один раз и выручит, если телефона нет под рукой. Больше их не покажем.</span>
      <div class="st-codes">${codes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
      <div class="st-acts"><button type="button" class="st-btn" data-do="codes-copy">Скопировать</button><button type="button" class="st-btn" data-do="codes-save">Скачать файлом</button><button type="button" class="st-btn pri" data-do="codes-done">Готово, сохранил</button></div>`;
    box.dataset.codes = codes.join('\n');
  }

  R.privacy = () => {
    const acc = user() && token();
    return (acc ? grp('Друзья', toggle({ name: 'Показывать друзьям, что я в сети', desc: 'Зелёная точка у тебя в списке друзей. Выключишь — друзья не увидят, когда ты на сайте', attr: 'data-online', on: !(me && me.hideOnline) })) : needAccount('Друзья и «в сети» есть у аккаунта.'))
      + grp('Оценки и тир-листы', row({ name: 'Кто видит оценки', desc: 'У каждой оценки свой выбор в форме: все, друзья или только я. Всем сразу — кнопкой «Кто видит» в рейтинге Мнения', href: '/opinion/#rating' })
        + row({ name: 'Кто видит тир-листы', desc: 'Выбирается в редакторе тир-листа под кнопками', href: '/tierlist/' }));
  };
  R.look = () => {
    const pressed = document.querySelector('.theme-menu [data-theme-id][aria-pressed="true"]');
    const curTheme = pressed ? pressed.dataset.themeId : 'auto';
    const list = (window.CasualThemes && window.CasualThemes.list) || [];
    const en = window.CasualLang && window.CasualLang.lang === 'en';
    return grp('Тема', `<div class="st-themes">${list.map((t) => {
        const p = t.prev, bg = t.id === 'auto' ? `linear-gradient(135deg, ${p.bg} 50%, ${p.panel} 50%)` : p.bg;
        return `<button type="button" class="st-th" data-st-theme="${esc(t.id)}" aria-pressed="${t.id === curTheme}"><i style="--pb:${bg};--pp:${t.id === 'auto' ? '#FFFFFF' : p.panel};--pa:${p.accent}"></i>${esc(t.name)}</button>`;
      }).join('')}</div>`)
      + grp('Вид', toggle({ name: 'Казуальный вид', desc: 'Спокойнее: без свечений, цветных пятен и прыгающих анимаций. Работает с любой темой', attr: 'data-unslop', on: document.documentElement.classList.contains('unslop') }))
      + grp('Язык', `<div class="st-row"><span class="st-t"><b>Язык сайта</b><small>Страница перезагрузится</small></span><span class="st-seg" role="group" aria-label="Язык сайта"><button type="button" data-lang="ru" aria-pressed="${!en}">Русский</button><button type="button" data-lang="en" aria-pressed="${en}">English</button></span></div>`);
  };
  R.data = () => grp('Импорт', row({ name: 'Импорт из Letterboxd', desc: 'Перенести оценки фильмов из архива Letterboxd', href: '/opinion/#letterboxd', attr: 'data-lb-open data-close' }))
    + grp('Обложки и названия', row({ name: 'Обновить обложки и названия', desc: 'Подтянуть к сохранённым оценкам обложки, русские названия, год и жанры', href: '/opinion/#refresh', attr: 'data-refresh-open data-close' }))
    + grp('Копия', `<div class="st-row"><span class="st-t"><b>Скачать копию</b><small>Оценки, категории, фото и журнал из этого браузера в одном файле</small></span><button type="button" class="st-btn" data-do="backup">Скачать</button></div>
        <div class="st-row"><span class="st-t"><b>Восстановить из копии</b><small>Каких оценок нет — добавит, более старые обновит, остальные не тронет. Подходит и копия из профиля в Мнении</small></span><label class="st-btn">Выбрать файл<input type="file" accept=".json,application/json" data-restore hidden></label></div>`);
  R.general = () => {
    const ex = (() => { try { return localStorage.getItem('casualhub.examples.v1') !== '0'; } catch (e) { return true; } })();
    return grp('Примеры', toggle({ name: 'Показывать примеры', desc: 'Пример топа на главной и участники в пустом Колесе. Выключишь — они уберутся и больше не появятся', attr: 'data-examples', on: ex }))
      + grp('Подсказки', `<div class="st-row"><span class="st-t"><b>Показать подсказки снова</b><small>Окно «Впервые тут?» снова откроется на каждой странице при следующем заходе</small></span><button type="button" class="st-btn" data-do="howto">Показать</button></div>`);
  };

  async function loadDevices() {
    const boxD = $('#stDevs');
    if (!boxD) return;
    try {
      const { sessions } = await api('/sessions');
      if (!$('#stDevs')) return;
      boxD.innerHTML = sessions.map((s) => {
        const where = [s.current ? 'сейчас здесь' : s.seen ? 'заходил ' + ago(s.seen) : '', country(s.country), s.created ? 'вход ' + day(s.created) : ''].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join(' · ');
        const phone = /iPhone|Android/.test(s.ua);
        return `<div class="st-dev"><span class="st-ni" aria-hidden="true">${phone ? I('<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/>') : I('<rect x="3" y="4.5" width="18" height="12" rx="1.8"/><path d="M8 20h8M12 16.5V20"/>')}</span>
          <span class="st-t"><b>${esc(s.ua || 'Устройство')}${s.current ? '<span class="st-tag">Это устройство</span>' : ''}</b><small>${where || 'вход был раньше, чем сайт начал запоминать устройства'}</small></span>
          ${s.current ? '' : `<button type="button" class="st-btn" data-end="${esc(s.id)}">Выйти</button>`}</div>`;
      }).join('') || '<div class="st-row"><span class="st-t"><small>Нет активных входов.</small></span></div>';
      const others = $('[data-do="others"]');
      if (others) others.hidden = !sessions.some((s) => !s.current);
    } catch (e) {
      boxD.innerHTML = `<div class="st-row"><span class="st-t"><small>${esc(e.message)}</small></span></div>`;
    }
  }

  function show(id, fromList) {
    cur = SECTIONS.some((s) => s.id === id) ? id : 'account';
    const s = SECTIONS.find((x) => x.id === cur);
    box.querySelectorAll('.st-nb').forEach((b) => b.setAttribute('aria-current', b.dataset.sec === cur ? 'page' : 'false'));
    $('.st-head h3').textContent = s.name;
    $('.st-body').innerHTML = R[cur]();
    $('.st-body').scrollTop = 0;
    card.dataset.view = 'sec';
    if (cur === 'security') loadDevices();
    if (fromList && narrow()) $('.st-back').focus({ preventScroll: true });
  }

  function build() {
    if (!document.getElementById('stCss')) { const st = document.createElement('style'); st.id = 'stCss'; st.textContent = STYLE; document.head.appendChild(st); }
    box = document.createElement('div');
    box.className = 'st-sheet';
    box.hidden = true;
    box.innerHTML = `<div class="st-card" role="dialog" aria-modal="true" aria-labelledby="stTitle" data-view="sec">
      <nav class="st-nav" aria-label="Разделы настроек"><h2 id="stTitle">Настройки<button type="button" class="st-x st-nav-x" data-close aria-label="Закрыть">✕</button></h2>
        ${SECTIONS.map((s) => `<button type="button" class="st-nb" data-sec="${s.id}"><span class="st-ni">${s.icon}</span><span class="st-nt">${esc(s.name)}<small>${esc(s.desc)}</small></span><span class="st-ngo" aria-hidden="true">›</span></button>`).join('')}</nav>
      <div class="st-main"><div class="st-head"><button type="button" class="st-back" data-back>‹ Назад</button><h3></h3><button type="button" class="st-x" data-close aria-label="Закрыть">✕</button></div><div class="st-body"></div></div>
      <div class="st-toast" role="status" aria-live="polite"></div></div>`;
    document.body.appendChild(box);
    card = $('.st-card');

    box.addEventListener('click', async (e) => {
      if (e.target === box || e.target.closest('[data-close]')) { close(); return; }
      const nb = e.target.closest('.st-nb');
      if (nb) { show(nb.dataset.sec, true); return; }
      if (e.target.closest('[data-back]')) { card.dataset.view = 'list'; const b = box.querySelector(`.st-nb[data-sec="${cur}"]`); if (b) b.focus({ preventScroll: true }); return; }
      // свой атрибут: data-theme стоит и на <html>, closest нашёл бы его при любом нажатии в окне
      const th = e.target.closest('[data-st-theme]');
      if (th) {
        // тему ставит сама страница (её меню тем): так же, как при выборе в меню ☰
        const pick = document.querySelector(`.theme-menu [data-theme-id="${CSS.escape(th.dataset.stTheme)}"]`);
        if (pick) pick.click();
        box.querySelectorAll('[data-st-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b === th)));
        return;
      }
      const lang = e.target.closest('[data-lang]');
      if (lang && window.CasualLang && lang.getAttribute('aria-pressed') !== 'true') { window.CasualLang.set(lang.dataset.lang); return; }
      const end = e.target.closest('[data-end]');
      if (end) {
        end.disabled = true;
        try { await api('/sessions/' + end.dataset.end, 'DELETE'); toast('Вышли на этом устройстве'); loadDevices(); }
        catch (er) { end.disabled = false; toast(er.message); }
        return;
      }
      const act = e.target.closest('[data-do]');
      if (!act) return;
      const what = act.dataset.do;
      if (what === 'others') {
        // второе нажатие подтверждает
        if (!act.dataset.armed) { act.dataset.armed = '1'; act.textContent = 'Точно выйти везде, кроме этого?'; setTimeout(() => { if (act.isConnected) { delete act.dataset.armed; act.textContent = 'Выйти на всех остальных устройствах'; } }, 4000); return; }
        act.disabled = true;
        try { const r = await api('/sessions/others', 'POST'); toast(r.n ? `Вышли на других устройствах: ${r.n}` : 'Других входов не было'); loadDevices(); }
        catch (er) { toast(er.message); }
        act.disabled = false; delete act.dataset.armed; act.textContent = 'Выйти на всех остальных устройствах';
      } else if (what === 'logout') {
        // в Мнении выход знает сама страница (локальный профиль и синхронизация), на других — то же самое здесь
        if (typeof window.logoutUser === 'function') { await window.logoutUser(); close(); return; }
        try { await api('/logout', 'POST'); } catch (er) {}
        forgetAccount();
        location.reload();
      } else if (what === 'backup') {
        act.disabled = true;
        try {
          const data = await makeBackup();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
          a.download = `casualhub-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast(`В копии оценок: ${data.ratings.length}`);
        } catch (er) { toast('Не получилось собрать копию'); }
        act.disabled = false;
      } else if (what === 'tfa-start') {
        const boxT = act.closest('[data-tfa]');
        act.disabled = true;
        try {
          const [r] = await Promise.all([api('/2fa/start', 'POST'), loadQR()]);
          const key = r.secret.replace(/(.{4})/g, '$1 ').trim();
          boxT.innerHTML = `<span class="st-hint"><b>1.</b> Отсканируй QR-код приложением-аутентификатором${narrow() ? ' или нажми «Открыть в приложении»' : ''}.</span>
            <div class="st-qr">${window.CasualQR.svg(r.uri, 176)}<span class="st-t"><small>Не получается отсканировать? Добавь вручную по ключу:</small><span class="st-key">${esc(key)}</span>${narrow() ? `<a class="st-btn" href="${esc(r.uri)}" style="justify-self:start;margin-top:6px">Открыть в приложении</a>` : ''}</span></div>
            <form class="st-form" data-f="tfa-on" style="padding:0"><span class="st-hint"><b>2.</b> Введи 6 цифр, которые показывает приложение для «CasualHub».</span>
              <label class="st-f"><span>Код из приложения</span><input class="st-in" name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="6" required></label>
              <div class="st-acts"><button type="submit" class="st-btn pri">Включить защиту</button><span class="st-msg" role="status"></span></div></form>`;
          const i = boxT.querySelector('input[name="code"]'); if (i && !narrow()) i.focus();
        } catch (er) { act.disabled = false; msg(boxT, er.message, 'bad'); }
      } else if (what === 'codes-copy') {
        const codes = act.closest('[data-codes]').dataset.codes;
        try { await navigator.clipboard.writeText(codes); toast('Коды скопированы'); } catch (er) { toast('Не получилось скопировать: выдели коды вручную'); }
      } else if (what === 'codes-save') {
        const codes = act.closest('[data-codes]').dataset.codes;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([`Казуал Хаб — запасные коды для входа (@${(me && me.handle) || ''})\nКаждый код работает один раз.\n\n${codes}\n`], { type: 'text/plain' }));
        a.download = 'casualhub-backup-codes.txt';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } else if (what === 'codes-done') {
        show('security');
      } else if (what === 'verify-mail') {
        act.disabled = true;
        try { await api('/email/verify-send', 'POST'); act.textContent = 'Письмо отправлено'; toast('Письмо отправлено: открой ссылку из него'); }
        catch (er) { act.disabled = false; toast(er.message); }
      } else if (what === 'howto') {
        try { localStorage.removeItem('casualhub.howto.v1'); } catch (er) {}
        toast('Подсказки покажутся при следующем заходе на страницы');
      }
    });

    box.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!d.matches || !d.matches('.st-fold') || !d.open) return;
      box.querySelectorAll('.st-fold[open]').forEach((x) => { if (x !== d) x.open = false; });
      const i = d.querySelector('input'); if (i && !narrow()) i.focus({ preventScroll: true });
    }, true);

    box.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.matches('[data-show]')) { t.closest('form').querySelectorAll('input[type="password"], input[data-pw]').forEach((i) => { i.type = t.checked ? 'text' : 'password'; i.dataset.pw = '1'; }); return; }
      if (t.matches('[data-restore]')) {
        const f = t.files && t.files[0];
        t.value = '';
        if (!f) return;
        try {
          const r = await restoreFrom(f);
          if (!r.added && !r.updated && !r.cats) { toast(`Всё из файла уже есть: ${r.same}`); return; }
          toast(`Добавлено: ${r.added}, обновлено: ${r.updated}`);
          // Мнение перечитает оценки и отправит их в аккаунт
          setTimeout(() => { if (/^\/opinion\/?$/.test(location.pathname)) { location.hash = 'rating'; location.reload(); } else location.href = '/opinion/#rating'; }, 1200);
        } catch (er) { toast(er.message); }
        return;
      }
      if (t.matches('[data-examples]')) {
        try { localStorage.setItem('casualhub.examples.v1', t.checked ? '1' : '0'); } catch (er) {}
        window.dispatchEvent(new CustomEvent('casualhub:examples', { detail: t.checked }));
        return;
      }
      if (t.matches('[data-online]')) {
        t.disabled = true;
        try { me = (await api('/account', 'PUT', { hideOnline: !t.checked })).user || me; toast(t.checked ? 'Друзья видят, когда ты в сети' : 'Друзья больше не видят, когда ты в сети'); }
        catch (er) { t.checked = !t.checked; toast(er.message); }
        t.disabled = false;
      }
      // «Казуальный вид» (data-unslop) переключает themes.js сам
    });

    box.addEventListener('submit', async (e) => {
      const f = e.target.closest('form[data-f]');
      if (!f) return;
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      const btn = f.querySelector('[type="submit"]');
      msg(f, '');
      try {
        if (f.dataset.f === 'names') {
          const name = String(v.name || '').trim().replace(/\s+/g, ' '), handle = String(v.handle || '').trim().replace(/^@+/, '').toLowerCase();
          if (name.length < 2) throw new Error('Ник: минимум 2 символа.');
          btn.disabled = true;
          me = (await api('/account', 'PUT', { username: name, handle })).user;
          patchLocal({ name: me.username, handle: me.handle });
          msg(f, 'Сохранено', 'ok');
          $('.st-me .st-t b').textContent = me.username;
        } else if (f.dataset.f === 'pass') {
          if (String(v.pass).length < 8) throw new Error('Новый пароль: от 8 символов.');
          if (v.pass !== v.pass2) throw new Error('Новые пароли не совпадают.');
          btn.disabled = true;
          me = (await api('/account', 'PUT', { password: v.pass, current: v.current })).user;
          f.reset();
          msg(f, 'Пароль сменён. На остальных устройствах нужно войти заново.', 'ok');
          loadDevices();
        } else if (f.dataset.f === 'mail') {
          const em = String(v.email || '').trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('Нужна почта, например name@mail.com.');
          btn.disabled = true;
          me = (await api('/account', 'PUT', { email: em, current: v.current })).user;
          patchLocal({ email: me.email });
          show('security');
          toast('Почта сменена');
          return;
        } else if (f.dataset.f === 'tfa-on') {
          btn.disabled = true;
          const r = await api('/2fa/enable', 'POST', { code: v.code });
          me = r.user;
          showCodes(f.closest('[data-tfa]'), r.codes);
          toast('Двухфакторная защита включена');
          return;
        } else if (f.dataset.f === 'tfa-codes') {
          btn.disabled = true;
          const r = await api('/2fa/codes', 'POST', { code: v.code });
          me = r.user;
          showCodes(f.closest('[data-tfa]'), r.codes);
          return;
        } else if (f.dataset.f === 'tfa-off') {
          btn.disabled = true;
          me = (await api('/2fa/disable', 'POST', { password: v.current, code: v.code })).user;
          show('security');
          toast('Двухфакторная защита выключена');
          return;
        } else if (f.dataset.f === 'delete') {
          btn.disabled = true;
          await api('/account/delete', 'POST', { password: v.current, confirm: v.confirm });
          forgetAccount();
          location.href = '/';
          return;
        }
      } catch (er) {
        msg(f, er.message, 'bad');
      }
      if (btn) btn.disabled = false;
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box && !box.hidden) close(); });
  }

  let lastFocus = null;
  async function open(section) {
    if (!box) build();
    lastFocus = document.activeElement;
    box.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    if (narrow() && !section) { show(cur); card.dataset.view = 'list'; box.querySelector('.st-nb').focus({ preventScroll: true }); }
    else { show(section || cur); $('.st-x[data-close]:not(.st-nav-x)').focus({ preventScroll: true }); }
    // свежие данные аккаунта: почта, дата регистрации, «в сети»
    if (token()) {
      try {
        me = (await api('/me')).user;
        // перерисовываем раздел с новыми данными, если человек ещё ничего в нём не начал вводить
        if (!box.hidden && ['account', 'security', 'privacy'].includes(cur) && !box.querySelector('.st-body :focus')) { const v = card.dataset.view; show(cur); card.dataset.view = v; }
      } catch (e) {}
    }
  }
  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  window.CasualSettings = { open, close };
})();
