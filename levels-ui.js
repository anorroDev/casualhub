/* Казуал Хаб: уровни на страницах — строка уровня в меню ☰, кружок у аватара, плашки наград и окно «Прогресс»
   (обзор, достижения, рейтинг недели, оформление, история, приглашение, итоги года). Подгружается из header-menu.js
   только у вошедших; если сервер ответил on: false (LEVELS = "0" или «только админы»), ничего не показывает.
   Правила опыта — на сервере (functions/_lib/levels.js), здесь только показ. */
(() => {
  if (window.CasualLevels) return;
  const U = window.CasualUtil || {};
  const esc = U.esc || ((v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
  const plural = U.plural || ((n, a, b, c) => { const x = Math.abs(n) % 100, y = x % 10; return x > 10 && x < 20 ? c : y > 1 && y < 5 ? b : y === 1 ? a : c; });
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const token = () => { const u = read('ocenshik.user.v1'); const t = u && (read('casualhub.tokens.v1') || {})[u.id]; return t || ''; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = (n) => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // fetch сайта без обёртки: обёртка ниже ловит заголовок x-levels у всех запросов страницы
  const rawFetch = window.fetch.bind(window);
  async function api(path, method = 'GET', body) {
    const r = await rawFetch('/api' + path, { method, cache: 'no-store', headers: { authorization: 'Bearer ' + token(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Сервер не ответил'); e.status = r.status; throw e; }
    return d;
  }
  // ответ сервера с x-levels — у человека новые награды: забираем плашки
  window.fetch = async function (...args) {
    const res = await rawFetch(...args);
    try { if (res.headers.get('x-levels')) setTimeout(pullNews, 50); } catch (e) {}
    return res;
  };

  const CSS = `
.lv-row { display: grid !important; gap: 6px !important; text-align: left; cursor: pointer; }
/* в меню прямые span'ы кнопок header-menu.js делает строчными (display: inline !important) — здесь они блоки */
.hm-panel > .lv-row > .lv-top, .hm-panel > .lv-row > .lv-sub { display: flex !important; }
.hm-panel > .lv-row > .lv-bar { display: block !important; }
.lv-row .lv-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; width: 100%; font-size: 13.5px; }
.lv-row .lv-top b { font-weight: 700; }
.lv-row .lv-top span { color: var(--ink-3, #8a8f9e); font-variant-numeric: tabular-nums; font-size: 12.5px; }
.lv-bar { height: 7px; width: 100%; border-radius: 4px; background: color-mix(in srgb, var(--ink, #fff) 10%, transparent); overflow: hidden; }
.lv-bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent, #3550E8), #E85FA5); transition: width .5s; }
.lv-row .lv-sub { display: flex; gap: 12px; font-size: 12.5px; color: var(--ink-3, #8a8f9e); width: 100%; }
.lv-acc { position: relative; overflow: visible !important; }
/* кнопка уровня в шапке: кольцо прогресса с номером уровня и подпись */
.lv-hbtn { position: relative; display: inline-flex !important; align-items: center; gap: 7px; cursor: pointer; }
.lv-ring { position: relative; flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--accent, #3550E8) var(--p, 0%), color-mix(in srgb, var(--ink, #fff) 16%, transparent) 0); }
.lv-ring::before { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: var(--panel, #1b1d24); }
.lv-ring b { position: relative; font: 800 11px/1 system-ui, sans-serif; color: var(--ink, #f3f4f6); font-variant-numeric: tabular-nums; }
.lv-hbtn .lv-hl { font-weight: 700; }
/* мигает, пока на кнопку ни разу не нажали */
.lv-hbtn.lv-pulse { animation: lv-pulse 1.8s ease-in-out infinite; border-color: color-mix(in srgb, var(--accent, #3550E8) 70%, transparent) !important; }
.lv-hbtn.lv-pulse::after { content: ""; position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; border-radius: 50%; background: #E85FA5; box-shadow: 0 0 0 2px var(--panel, #1b1d24); }
@keyframes lv-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent, #3550E8) 60%, transparent); } 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent, #3550E8) 0%, transparent), 0 0 18px 2px color-mix(in srgb, var(--accent, #3550E8) 45%, transparent); } }
@media (prefers-reduced-motion: reduce) { .lv-hbtn.lv-pulse { animation: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #3550E8) 60%, transparent); } }
/* магазин: пока серый, при наведении — «Soon» */
.lv-shop { position: relative; display: inline-flex !important; align-items: center; justify-content: center; cursor: default; color: var(--ink-3, #8a8f9e) !important; filter: grayscale(1); opacity: .6; }
.lv-shop:hover, .lv-shop:focus-visible, .lv-shop.lv-tip { opacity: .85; }
.lv-shop::after { content: attr(data-soon); position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%) translateY(-4px); padding: 4px 9px; border-radius: 8px; background: var(--ink, #f3f4f6); color: var(--panel, #1b1d24); font: 700 12px/1.2 system-ui, sans-serif; letter-spacing: .02em; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s, transform .15s; z-index: 100; filter: none; }
.lv-shop:hover::after, .lv-shop:focus-visible::after, .lv-shop.lv-tip::after { opacity: 1; transform: translateX(-50%) translateY(0); }
@media (max-width: 480px) { .lv-hbtn .lv-hl { display: none; } .lv-hbtn { padding: 0 9px !important; } header .lv-shop { display: none !important; } }
/* строки меню: почта и (на телефоне) магазин */
.hm-panel > .lv-mailrow, .hm-panel > .lv-shoprow { display: flex !important; align-items: center; gap: 8px !important; }
.hm-panel > .lv-shoprow { display: none !important; color: var(--ink-3, #8a8f9e) !important; cursor: default; }
@media (max-width: 480px) { .hm-panel > .lv-shoprow { display: flex !important; } }
.lv-mailrow .lv-cnt, .lv-shoprow .lv-soon { margin-left: auto; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
.lv-mailrow .lv-cnt { background: #E4553F; color: #fff; }
.lv-shoprow .lv-soon { border: 1px solid var(--line, #2b2e38); }
.lv-mailrow .wn-dot { display: none !important; }
.lv-mail { display: grid; gap: 10px; }
.lv-letter { display: grid; gap: 6px; padding: 14px 16px; border-radius: 16px; border: 1px solid var(--line, #2b2e38); }
.lv-letter.new { border-color: color-mix(in srgb, var(--accent, #3550E8) 60%, var(--line, #2b2e38)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3550E8) 14%, transparent); }
.lv-letter .top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.lv-letter b { font-size: 15px; }
.lv-letter small { color: var(--ink-3, #8a8f9e); font-size: 12px; white-space: nowrap; }
.lv-letter p { margin: 0; font-size: 13.5px; color: var(--ink-2, #b5b5b5); white-space: pre-line; overflow-wrap: anywhere; }
.lv-letter .act { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lv-letter .gift { font-weight: 800; color: #D99A1E; }
html.unslop .lv-hbtn.lv-pulse { animation-duration: 2.6s; }
.lv-num { position: absolute; right: -5px; bottom: -4px; min-width: 18px; height: 18px; padding: 0 4px; box-sizing: border-box; border-radius: 9px; background: var(--accent, #3550E8); color: #fff; font: 700 10.5px/18px system-ui, sans-serif; text-align: center; box-shadow: 0 0 0 2px var(--panel, #1b1d24); pointer-events: none; z-index: 2; }
[data-ava].lv-has { position: relative; overflow: visible !important; }
[data-ava] > .lv-num { right: -4px; bottom: -3px; min-width: 16px; height: 16px; font-size: 9.5px; line-height: 16px; }
.lv-frame-frame1 { box-shadow: 0 0 0 2px var(--panel, #1b1d24), 0 0 0 4px #F5B942 !important; border-radius: 50%; }
.lv-frame-frame2 { box-shadow: 0 0 0 2px var(--panel, #1b1d24), 0 0 0 4px #5B74FF, 0 0 12px 2px color-mix(in srgb, #5B74FF 55%, transparent) !important; border-radius: 50%; }
.lv-frame-frame3 { box-shadow: 0 0 0 2px var(--panel, #1b1d24), 0 0 0 4px #E85FA5 !important; border-radius: 50%; animation: lv-spin 6s linear infinite; }
.lv-frame-frame4 { box-shadow: 0 0 0 2px var(--panel, #1b1d24), 0 0 0 5px #E2A925, 0 0 0 7px #8C5A12 !important; border-radius: 50%; }
@keyframes lv-spin { 0%, 100% { box-shadow: 0 0 0 2px var(--panel, #1b1d24), 0 0 0 4px #E85FA5; } 50% { box-shadow: 0 0 0 2px var(--panel, #1b1d24), 0 0 0 4px #5B74FF; } }
@media (prefers-reduced-motion: reduce) { .lv-frame-frame3 { animation: none; } }
.lv-bg-dawn { background-image: linear-gradient(135deg, color-mix(in srgb, #F5B942 16%, transparent), color-mix(in srgb, #E85FA5 14%, transparent)) !important; }
.lv-bg-night { background-image: linear-gradient(135deg, color-mix(in srgb, #3550E8 22%, transparent), color-mix(in srgb, #0D0F14 30%, transparent)) !important; }
.lv-bg-forest { background-image: linear-gradient(135deg, color-mix(in srgb, #2EAD60 18%, transparent), color-mix(in srgb, #14A3A8 14%, transparent)) !important; }
.lv-bg-ember { background-image: linear-gradient(135deg, color-mix(in srgb, #F08A24 20%, transparent), color-mix(in srgb, #E4553F 14%, transparent)) !important; }
.lv-bg-legend { background-image: linear-gradient(135deg, color-mix(in srgb, #E2A925 26%, transparent), color-mix(in srgb, #9B6BFF 22%, transparent), color-mix(in srgb, #E85FA5 18%, transparent)) !important; }
.lv-prof { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; color: var(--ink-2, #b5b5b5); }
.lv-prof .lv-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent, #3550E8) 14%, transparent); color: var(--ink, #f3f4f6); font-weight: 600; }
.lv-prof .lv-show { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); font-size: 12px; }
.lv-medal { display: inline-grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 7px; color: #fff; font: 800 11px/1 system-ui, sans-serif; }
.lv-t0 { background: linear-gradient(135deg, var(--accent, #3550E8), #E85FA5); } .lv-t1 { background: #B06A35; } .lv-t2 { background: #8893A3; } .lv-t3 { background: #D99A1E; } .lv-tx { background: color-mix(in srgb, var(--ink, #fff) 12%, transparent); color: var(--ink-3, #8a8f9e); }

.lv-toast { position: fixed; z-index: 96; top: max(12px, env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); width: min(420px, calc(100vw - 32px)); box-sizing: border-box; display: grid; gap: 4px; padding: 12px 10px 12px 14px; border-radius: 16px; border: 1px solid var(--line, #2b2e38); background: var(--panel, #17181c); color: var(--ink, #f2f2f2); box-shadow: 0 14px 34px rgb(0 0 0 / .3); font-size: 14px; line-height: 1.35; cursor: pointer; animation: lv-in .35s cubic-bezier(.22, 1, .36, 1); }
.lv-toast .lv-t-head { display: flex; align-items: center; gap: 10px; }
.lv-toast .lv-big { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; color: #fff; font: 800 18px/1 system-ui, sans-serif; background: linear-gradient(135deg, var(--accent, #3550E8), #E85FA5); }
.lv-toast b { font-weight: 700; }
.lv-toast ul { margin: 2px 0 0 50px; padding: 0; list-style: none; display: grid; gap: 2px; color: var(--ink-2, #b5b5b5); font-size: 13px; }
.lv-toast .x { margin-left: auto; flex: none; width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; color: var(--ink-2, #b5b5b5); font: inherit; cursor: pointer; }
@keyframes lv-in { from { transform: translate(-50%, -14px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .lv-toast { animation: none; } }

.lv-ov { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px)); background: rgb(0 0 0 / .55); }
.lv-card { width: min(760px, 100%); height: min(720px, 100%); display: grid; grid-template-rows: auto auto minmax(0, 1fr); border-radius: 20px; border: 1px solid var(--line, #2b2e38); background: var(--panel, #17181c); color: var(--ink, #f2f2f2); overflow: hidden; box-shadow: 0 30px 70px -20px rgb(0 0 0 / .6); }
.lv-head { display: flex; align-items: center; gap: 12px; padding: 16px 16px 10px 20px; }
.lv-head h2 { margin: 0; font-size: 20px; font-family: var(--font-display, inherit); }
.lv-head .x { margin-left: auto; width: 36px; height: 36px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ink, #fff) 8%, transparent); color: var(--ink, #fff); font-size: 16px; cursor: pointer; }
.lv-tabs { display: flex; gap: 6px; padding: 0 16px 12px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line, #2b2e38); }
.lv-tabs::-webkit-scrollbar { display: none; }
.lv-tabs button { flex: none; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink-2, #b5b5b5); font: 600 13px/1.2 inherit; font-family: inherit; cursor: pointer; }
.lv-tabs button[aria-selected="true"] { background: var(--accent, #3550E8); border-color: transparent; color: #fff; }
.lv-body { overflow-y: auto; padding: 16px 20px 24px; display: grid; gap: 16px; align-content: start; scrollbar-width: thin; }
.lv-box { border: 1px solid var(--line, #2b2e38); border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px; background: var(--panel-2, color-mix(in srgb, var(--ink, #fff) 3%, transparent)); }
.lv-box h3 { margin: 0; font-size: 15px; }
.lv-hero { display: flex; align-items: center; gap: 16px; }
.lv-hero .n { font: 800 54px/0.9 var(--font-display, system-ui); color: var(--accent, #3550E8); font-variant-numeric: tabular-nums; }
.lv-hero .r { display: grid; gap: 2px; min-width: 0; flex: 1; }
.lv-hero .r b { font-size: 17px; }
.lv-hero .r span { font-size: 13px; color: var(--ink-3, #8a8f9e); }
.lv-muted { color: var(--ink-3, #8a8f9e); font-size: 13px; margin: 0; }
.lv-q { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 12px; align-items: center; font-size: 14px; }
.lv-q .xp { font-weight: 700; color: #D99A1E; font-variant-numeric: tabular-nums; }
.lv-q .lv-bar { grid-column: 1 / -1; height: 5px; }
.lv-q.done > span:first-child { color: var(--ink-3, #8a8f9e); text-decoration: line-through; }
.lv-q.done .lv-bar i { background: #2EAD60; }
.lv-streak { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lv-streak .big { font: 800 30px/1 var(--font-display, system-ui); }
.lv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 10px; }
.lv-ach { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 10px; align-items: center; padding: 10px; border-radius: 14px; border: 1px solid var(--line, #2b2e38); }
.lv-ach .lv-medal { width: 40px; height: 40px; border-radius: 12px; font-size: 17px; }
.lv-ach b { display: block; font-size: 14px; }
.lv-ach span, .lv-ach small { display: block; font-size: 12px; color: var(--ink-3, #8a8f9e); }
.lv-ach.off { opacity: .55; }
.lv-ach .pin { margin-top: 4px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink-2, #b5b5b5); font: 600 11.5px/1.2 inherit; font-family: inherit; cursor: pointer; justify-self: start; }
.lv-ach .pin[aria-pressed="true"] { background: var(--accent, #3550E8); color: #fff; border-color: transparent; }
.lv-board { display: grid; gap: 6px; }
.lv-board > div { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 12px; border-radius: 12px; background: color-mix(in srgb, var(--ink, #fff) 4%, transparent); font-size: 14px; }
.lv-board > div.me { outline: 1.5px solid color-mix(in srgb, var(--accent, #3550E8) 55%, transparent); }
.lv-board em { font-style: normal; font-weight: 800; color: var(--ink-3, #8a8f9e); text-align: center; }
.lv-board b { font-variant-numeric: tabular-nums; }
.lv-seg { display: inline-flex; gap: 4px; padding: 3px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); justify-self: start; }
.lv-seg button { padding: 5px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--ink-2, #b5b5b5); font: 600 13px/1.2 inherit; font-family: inherit; cursor: pointer; }
.lv-seg button[aria-pressed="true"] { background: var(--accent, #3550E8); color: #fff; }
.lv-pick { display: flex; flex-wrap: wrap; gap: 8px; }
.lv-pick button { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 12px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink, #fff); font: 600 13px/1.2 inherit; font-family: inherit; cursor: pointer; }
.lv-pick button[aria-pressed="true"] { border-color: var(--accent, #3550E8); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #3550E8) 35%, transparent); }
.lv-pick button:disabled { opacity: .45; cursor: not-allowed; }
.lv-pick .dot { width: 18px; height: 18px; border-radius: 50%; }
.lv-pick .sw { width: 30px; height: 20px; border-radius: 6px; border: 1px solid var(--line, #2b2e38); }
.lv-tg { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
.lv-tg input { width: 20px; height: 20px; accent-color: var(--accent, #3550E8); flex: none; }
.lv-hist { display: grid; gap: 0; }
.lv-hist > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 8px 0; border-top: 1px solid var(--line, #2b2e38); font-size: 13.5px; }
.lv-hist > div:first-child { border-top: 0; }
.lv-hist .xp { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent, #3550E8); }
.lv-hist .gone .xp { color: var(--ink-3, #8a8f9e); text-decoration: line-through; }
.lv-hist small { grid-column: 1 / -1; color: var(--ink-3, #8a8f9e); font-size: 12px; }
.lv-rw { display: grid; gap: 0; }
.lv-rw > div { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 12px; align-items: center; padding: 6px 0; font-size: 14px; }
.lv-rw .l { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; border: 2px solid var(--line, #2b2e38); }
.lv-rw .got .l { border-color: var(--accent, #3550E8); color: var(--accent, #3550E8); }
.lv-rw .no { color: var(--ink-3, #8a8f9e); }
.lv-link { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.lv-link input { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink, #fff); font: inherit; font-size: 13px; }
.lv-btn { padding: 9px 14px; border-radius: 10px; border: 0; background: var(--accent, #3550E8); color: #fff; font: 700 13.5px/1.2 inherit; font-family: inherit; cursor: pointer; }
.lv-btn.ghost { background: transparent; color: var(--ink, #fff); border: 1px solid var(--line, #2b2e38); }
.lv-recap { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 10px; }
.lv-recap > div { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line, #2b2e38); display: grid; gap: 2px; }
.lv-recap b { font: 800 26px/1.1 var(--font-display, system-ui); font-variant-numeric: tabular-nums; }
.lv-recap span { font-size: 12.5px; color: var(--ink-3, #8a8f9e); }
.lv-recap .wide { grid-column: 1 / -1; }
.lv-recap .wide b { font-size: 18px; }
.lv-err { color: #E4553F; font-size: 13px; margin: 0; }
/* знакомство: всё размыто, кроме кнопки уровня (её копия лежит поверх размытия ровно на месте настоящей) */
.lv-spot { position: fixed; inset: 0; z-index: 130; background: rgb(8 10 16 / .55); -webkit-backdrop-filter: blur(9px) saturate(.8); backdrop-filter: blur(9px) saturate(.8); animation: lv-fade .35s ease both; }
@keyframes lv-fade { from { opacity: 0; } }
.lv-ov.lv-blur { -webkit-backdrop-filter: blur(9px) saturate(.8); backdrop-filter: blur(9px) saturate(.8); background: rgb(8 10 16 / .55); }
.lv-spot-btn { position: fixed; z-index: 131; margin: 0 !important; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent, #3550E8) 45%, transparent), 0 0 34px 6px color-mix(in srgb, var(--accent, #3550E8) 55%, transparent) !important; animation: lv-pulse 1.6s ease-in-out infinite; }
.lv-spot-tip { position: fixed; z-index: 131; width: min(300px, calc(100vw - 32px)); padding: 14px 16px; border-radius: 16px; background: var(--panel, #17181c); color: var(--ink, #f2f2f2); border: 1px solid color-mix(in srgb, var(--accent, #3550E8) 50%, var(--line, #2b2e38)); box-shadow: 0 18px 40px -12px rgb(0 0 0 / .6); display: grid; gap: 4px; animation: lv-tip-in .45s .15s cubic-bezier(.22, 1, .36, 1) both; }
.lv-spot-tip b { font-size: 16px; }
.lv-spot-tip span { font-size: 13.5px; color: var(--ink-2, #b5b5b5); line-height: 1.4; }
.lv-spot-tip::before { content: ""; position: absolute; top: -7px; left: var(--ax, 28px); width: 12px; height: 12px; background: inherit; border-left: 1px solid color-mix(in srgb, var(--accent, #3550E8) 50%, var(--line, #2b2e38)); border-top: 1px solid color-mix(in srgb, var(--accent, #3550E8) 50%, var(--line, #2b2e38)); transform: rotate(45deg); }
@keyframes lv-tip-in { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { .lv-spot, .lv-spot-tip, .lv-spot-btn { animation: none; } }
/* тур: одна карточка — картинка, заголовок, две строки */
.lv-tour { width: min(440px, 100%); display: grid; gap: 18px; padding: 26px 24px 20px; border-radius: 24px; border: 1px solid var(--line, #2b2e38); background: var(--panel, #17181c); color: var(--ink, #f2f2f2); box-shadow: 0 30px 70px -20px rgb(0 0 0 / .65); text-align: center; }
.lv-tour .pic { height: 132px; display: grid; place-items: center; }
.lv-tour h3 { margin: 0; font: 800 24px/1.15 var(--font-display, system-ui); text-wrap: balance; }
.lv-tour p { margin: 0; font-size: 14.5px; line-height: 1.5; color: var(--ink-2, #b5b5b5); text-wrap: balance; }
.lv-tour .dots { display: flex; justify-content: center; gap: 6px; }
.lv-tour .dots i { width: 7px; height: 7px; border-radius: 4px; background: color-mix(in srgb, var(--ink, #fff) 18%, transparent); transition: width .25s, background .25s; }
.lv-tour .dots i.on { width: 22px; background: var(--accent, #3550E8); }
.lv-tour .nav { display: flex; gap: 10px; }
.lv-tour .nav button { flex: 1; padding: 12px; border-radius: 14px; font: 700 14.5px/1.2 inherit; font-family: inherit; cursor: pointer; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink, #fff); }
.lv-tour .nav .go { background: var(--accent, #3550E8); border-color: transparent; color: #fff; }
.lv-tour .slide { display: grid; gap: 10px; animation: lv-slide .35s cubic-bezier(.22, 1, .36, 1); }
@keyframes lv-slide { from { opacity: 0; transform: translateX(14px); } }
@media (prefers-reduced-motion: reduce) { .lv-tour .slide { animation: none; } }
.lv-bigring { position: relative; width: 112px; height: 112px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--accent, #3550E8) var(--p, 60%), color-mix(in srgb, var(--ink, #fff) 12%, transparent) 0); }
.lv-bigring::before { content: ""; position: absolute; inset: 10px; border-radius: 50%; background: var(--panel, #17181c); }
.lv-bigring b { position: relative; font: 800 44px/1 var(--font-display, system-ui); }
.lv-bigring small { position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%); padding: 3px 10px; border-radius: 999px; background: var(--accent, #3550E8); color: #fff; font: 700 11.5px/1.2 system-ui, sans-serif; white-space: nowrap; }
.lv-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; max-width: 360px; }
.lv-chips span { display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); font-size: 13px; font-weight: 600; }
.lv-chips span b { color: var(--accent, #3550E8); font-variant-numeric: tabular-nums; }
.lv-tq { display: grid; gap: 8px; width: min(300px, 100%); text-align: left; }
.lv-tq div { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--line, #2b2e38); font-size: 13.5px; }
.lv-tq div i { width: 18px; height: 18px; border-radius: 6px; border: 2px solid var(--line, #2b2e38); flex: none; }
.lv-tq div.ok i { background: #2EAD60; border-color: #2EAD60; }
.lv-tq div em { margin-left: auto; font-style: normal; font-weight: 800; color: #D99A1E; }
.lv-tmedals { display: flex; gap: 12px; align-items: flex-end; }
.lv-tmedals .lv-medal { width: 54px; height: 54px; border-radius: 16px; font-size: 22px; }
.lv-tmedals .lv-medal:nth-child(2) { width: 68px; height: 68px; font-size: 28px; }
.lv-tmail { position: relative; width: 120px; height: 86px; border-radius: 16px; border: 2px solid var(--line, #2b2e38); display: grid; place-items: center; }
.lv-tmail svg { width: 64px; height: 64px; color: var(--accent, #3550E8); }
.lv-tmail span { position: absolute; top: -10px; right: -10px; padding: 4px 9px; border-radius: 999px; background: #D99A1E; color: #fff; font: 800 13px/1 system-ui, sans-serif; }
html.unslop .lv-tour .nav .go, html.unslop .lv-tour .dots i.on { background: var(--accent, #3550E8); }
@media (max-width: 600px) { .lv-ov { padding: 0; } .lv-card { width: 100%; height: 100%; border-radius: 0; border: 0; } .lv-body { padding: 14px 16px 24px; } }
html.unslop .lv-row .lv-bar i, html.unslop .lv-bar i { background: var(--accent, #3550E8); }
html.unslop .lv-toast .lv-big, html.unslop .lv-t0 { background: var(--accent, #3550E8); }
`;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  let ME = null;
  const NEWS_ICON = { level: '★', ach: '🏅', quest: '✓', quest_all: '✓', quest_week: '✓', streak: '🔥', first: '→', invite: '+', invite_me: '+', freeze: '❄' };
  function newsLine(n) {
    if (n.t === 'level') return `Новый уровень: ${n.to} · ${n.rank}`;
    if (n.t === 'ach') return `Достижение «${n.title}»${n.tier ? ' · ' + ['', 'бронза', 'серебро', 'золото'][n.tier] : ''}`;
    if (n.t === 'quest') return `Задание выполнено: ${n.title} · +${n.xp}`;
    if (n.t === 'quest_all') return `Все задания дня · +${n.xp}`;
    if (n.t === 'quest_week') return `Задание недели: ${n.title} · +${n.xp}`;
    if (n.t === 'streak') return `Серия ${n.streak} ${plural(n.streak, 'день', 'дня', 'дней')} подряд · +${n.xp}`;
    if (n.t === 'freeze') return `«Заморозка» спасла серию: ${n.streak} ${plural(n.streak, 'день', 'дня', 'дней')}`;
    if (n.t === 'first') return `Первые шаги: ${n.title} · +${n.xp}`;
    if (n.t === 'invite') return `Друг по твоей ссылке дошёл до 3-го уровня · +${n.xp}`;
    if (n.t === 'invite_me') return `Ты пришёл по ссылке друга · +${n.xp}`;
    if (n.t === 'gift') return `Подарок из почты · +${n.xp} опыта`;
    return '';
  }

  // ---------- плашки наград ----------
  let pulling = false, noteT = 0;
  async function pullNews() {
    if (!ME || pulling) return;
    pulling = true;
    try {
      const d = await api('/levels/news');
      if (d.news && d.news.length) { showNews(d.news); refreshMe(); }
    } catch (e) {} finally { pulling = false; }
  }
  function showNews(list) {
    if (ME && ME.prefs && ME.prefs.notify === false) return;
    const lvl = [...list].reverse().find((n) => n.t === 'level');
    // новый уровень — в заголовке плашки, в списке его не повторяем
    const lines = list.filter((n) => !(lvl && n.t === 'level')).map(newsLine).filter(Boolean);
    if (!lines.length && !lvl) return;
    const head = lvl ? { big: lvl.to, title: `Новый уровень: ${lvl.rank}` } : { big: NEWS_ICON[list[0].t] || '★', title: lines.length > 1 ? 'Награды' : 'Награда' };
    let box = document.getElementById('lvToast');
    if (box) box.remove();
    box = document.createElement('div');
    box.id = 'lvToast';
    box.className = 'lv-toast';
    box.setAttribute('role', 'status');
    box.innerHTML = `<div class="lv-t-head"><span class="lv-big">${esc(head.big)}</span><b>${esc(head.title)}</b><button type="button" class="x" aria-label="Закрыть">✕</button></div><ul>${lines.slice(0, 5).map((l) => `<li>${esc(l)}</li>`).join('')}${lines.length > 5 ? `<li>и ещё ${lines.length - 5}</li>` : ''}</ul>`;
    box.addEventListener('click', (e) => { box.remove(); if (!e.target.closest('.x')) openProgress('home'); });
    document.body.appendChild(box);
    clearTimeout(noteT);
    noteT = setTimeout(() => box.remove(), 8000);
  }
  // сигнал из комнаты присутствия (online.js): кто-то отреагировал — у меня награда
  document.addEventListener('casual-levels-news', pullNews);

  // ---------- строка в меню и кружок у аватара ----------
  function paintMenu() {
    const panel = document.getElementById('hmPanel');
    if (!panel || !ME) return;
    let row = panel.querySelector('.lv-row');
    if (!row) {
      const twin = panel.querySelector('.hm-all');
      row = document.createElement('button');
      row.type = 'button';
      row.className = (twin ? twin.className.replace(/\bhm-all\b/, '') : 'pill') + ' lv-row';
      row.addEventListener('click', () => openProgress('home'));
      if (twin) twin.after(row); else panel.prepend(row);
    }
    const q = ME.quests ? ME.quests.daily : [];
    const qd = q.filter((x) => x.done).length;
    row.title = 'Уровень, задания и достижения';
    // «Почта»: подарки и письма; непрочитанное — красная цифра, и точка на ☰ (header-menu.js ищет .wn-dot)
    let mail = panel.querySelector('.lv-mailrow');
    if (!mail) {
      mail = document.createElement('button');
      mail.type = 'button';
      mail.className = row.className.replace(/\blv-row\b/, '') + ' lv-mailrow';
      mail.title = 'Подарки и письма';
      mail.addEventListener('click', () => openProgress('mail'));
      row.after(mail);
      const shop = document.createElement('span');
      shop.className = row.className.replace(/\blv-row\b/, '') + ' lv-shoprow';
      shop.setAttribute('aria-disabled', 'true');
      shop.innerHTML = `${SHOP_ICON}<span class="hm-t">Магазин</span><span class="lv-soon">Soon</span>`;
      mail.after(shop);
    }
    const m = +ME.mail || 0;
    const mh = `${MAIL_ICON}<span class="hm-t">Почта</span>${m ? `<span class="lv-cnt">${m}</span><i class="wn-dot"></i>` : ''}`;
    if (mail.innerHTML !== mh) mail.innerHTML = mh;
    row.innerHTML = `<span class="lv-top"><b>Уровень ${ME.level} · ${esc(ME.rank)}</b><span>${nf(ME.into)} / ${nf(ME.need)}</span></span>
      <span class="lv-bar"><i style="width:${Math.min(100, Math.round((ME.into / ME.need) * 100))}%"></i></span>
      <span class="lv-sub"><span>Задания ${qd}/${q.length}</span>${ME.streak.days ? `<span>🔥 ${ME.streak.days} ${plural(ME.streak.days, 'день', 'дня', 'дней')}</span>` : ''}${ME.event ? `<span>${esc(ME.event.title)}</span>` : ''}</span>`;
  }
  function paintAccount() {
    const header = document.querySelector('header');
    const box = header && header.querySelector('#account, [data-account], #userBar');
    // кружок — на самом аватаре (у #account на главной нет своего размера: display: contents)
    const acc = box && (box.querySelector('.avatar, .ava, img') || box);
    if (!acc || !ME) return;
    acc.classList.add('lv-acc');
    let n = acc.querySelector(':scope > .lv-num');
    if (ME.prefs.hideLevel || !ME.unlocked.badge) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('i'); n.className = 'lv-num'; acc.appendChild(n); }
    // без лишних записей в DOM: наблюдатель за страницей иначе крутился бы по кругу
    if (n.textContent !== String(ME.level)) { n.textContent = ME.level; n.title = `Уровень ${ME.level}`; }
  }
  // ---------- кнопки в шапке: уровень (мигает до первого нажатия) и магазин «Soon» ----------
  const SEEN_KEY = 'casualhub.levels.seen.v1';
  const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return true; } };
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {} document.querySelectorAll('.lv-hbtn.lv-pulse').forEach((b) => b.classList.remove('lv-pulse')); };
  const MAIL_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
  const SHOP_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
  let tipT = 0;
  function paintHeader() {
    const header = document.querySelector('header');
    if (!header || !ME) return;
    const bar = header.querySelector('.masthead-right > .user-bar') || header.querySelector('.user-bar') || header;
    const twin = bar.querySelector('.pill, .theme-btn');
    const cls = twin && /\bpill\b/.test(twin.className) ? 'pill' : 'theme-btn';
    // перед «Друзьями», а если их нет — перед профилем
    const before = bar.querySelector(':scope > [data-friends-btn]') || bar.querySelector(':scope > #account, :scope > [data-account], :scope > #userBar') || bar.querySelector(':scope > .hm-wrap');
    let btn = bar.querySelector(':scope > .lv-hbtn');
    btn = btn || (header.querySelector('.hm-left > .lv-hbtn'));
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = cls + ' lv-hbtn';
      btn.addEventListener('click', () => { markSeen(); openProgress('home'); });
      const shop = document.createElement('button');
      shop.type = 'button';
      shop.className = cls + ' lv-shop';
      shop.dataset.soon = 'Soon';
      shop.setAttribute('aria-disabled', 'true');
      shop.setAttribute('aria-label', 'Магазин — скоро');
      shop.innerHTML = SHOP_ICON;
      // на телефоне наведения нет: подсказка «Soon» показывается по нажатию
      shop.addEventListener('click', () => { shop.classList.add('lv-tip'); clearTimeout(tipT); tipT = setTimeout(() => shop.classList.remove('lv-tip'), 1600); });
      // место слева у логотипа (header-menu.js), иначе — перед «Друзьями»
      const slot = header.querySelector('.hm-left');
      if (slot) { slot.appendChild(btn); slot.appendChild(shop); }
      else if (before) { bar.insertBefore(btn, before); bar.insertBefore(shop, before); } else { bar.appendChild(btn); bar.appendChild(shop); }
    }
    const p = Math.min(100, Math.round((ME.into / Math.max(1, ME.need)) * 100));
    const html = `<span class="lv-ring" style="--p:${p}%"><b>${ME.level}</b></span><span class="lv-hl">Уровень</span>`;
    if (btn.innerHTML !== html) btn.innerHTML = html;
    const t = `Уровень ${ME.level} · ${ME.rank} · ${ME.into} / ${ME.need} опыта`;
    if (btn.title !== t) { btn.title = t; btn.setAttribute('aria-label', t); }
    btn.classList.toggle('lv-pulse', !seen());
  }
  async function refreshMe() {
    try {
      const d = await api('/levels/me');
      if (!d.on) { ME = null; return; }
      ME = d;
      paintMenu();
      paintHeader();
      paintAccount();
      paintAvatars();
    } catch (e) {}
  }

  // ---------- кружки уровня у чужих аватаров ([data-ava] в комментариях и у друзей) ----------
  const looks = new Map(); // id -> оформление или null
  let pend = new Set(), lookT = 0;
  function paintAvatars(root) {
    if (!ME) return;
    const els = (root || document).querySelectorAll('[data-ava]');
    for (const el of els) {
      const id = el.getAttribute('data-ava');
      if (!/^[0-9a-f]{24}$/.test(id || '')) continue;
      if (looks.has(id)) decorate(el, looks.get(id));
      else pend.add(id);
    }
    if (pend.size && !lookT) lookT = setTimeout(loadLooks, 120);
  }
  async function loadLooks() {
    lookT = 0;
    const ids = [...pend].slice(0, 150);
    pend = new Set([...pend].slice(150));
    ids.forEach((id) => looks.set(id, null));
    try {
      const d = await api('/levels/users?ids=' + ids.join(','));
      for (const [id, l] of Object.entries(d.users || {})) looks.set(id, l);
    } catch (e) {}
    paintAvatars();
  }
  function decorate(el, l) {
    if (el.dataset.lv === (l ? l.level + l.frame : '-')) return;
    el.dataset.lv = l ? l.level + l.frame : '-';
    el.querySelectorAll(':scope > .lv-num').forEach((x) => x.remove());
    [...el.classList].filter((c) => c.startsWith('lv-frame-')).forEach((c) => el.classList.remove(c));
    if (!l || l.level < 2) return;
    el.classList.add('lv-has');
    if (l.frame) el.classList.add('lv-frame-' + l.frame);
    const n = document.createElement('i');
    n.className = 'lv-num';
    n.textContent = l.level;
    n.setAttribute('aria-hidden', 'true');
    el.appendChild(n);
  }
  let moT = 0;
  new MutationObserver(() => { if (!ME) return; clearTimeout(moT); moT = setTimeout(() => { paintAvatars(); paintProfile(); paintAccount(); paintHeader(); }, 150); })
    .observe(document.documentElement, { subtree: true, childList: true });

  // ---------- профиль: уровень, звание, витрина, рамка, цвет ника и фон ----------
  let profFor = '', profData = null;
  async function paintProfile() {
    if (!ME || !location.pathname.startsWith('/profile')) return;
    const hero = document.querySelector('.card.hero');
    const who = hero && hero.querySelector('.who');
    if (!who) return;
    const seen = who.querySelector('[data-seen]');
    const me = read('ocenshik.user.v1');
    const id = seen ? seen.getAttribute('data-seen') : (me && me.serverId) || (me && me.id) || '';
    if (!/^[0-9a-f]{24}$/.test(id)) return;
    if (who.querySelector('.lv-prof[data-for="' + id + '"]')) return;
    if (profFor !== id) { profFor = id; profData = null; try { profData = await api('/levels/profile?id=' + id); } catch (e) { profData = { hidden: true }; } }
    const d = profData;
    if (!d || !d.on || d.hidden || who.querySelector('.lv-prof[data-for="' + id + '"]')) return;
    who.querySelectorAll('.lv-prof').forEach((x) => x.remove());
    const box = document.createElement('div');
    box.className = 'lv-prof';
    box.dataset.for = id;
    box.innerHTML = `<span class="lv-chip">Уровень ${d.level}${d.look.rank ? ' · ' + esc(d.look.rank) : ''}</span>${(d.showcase || []).map((a) => `<span class="lv-show"><i class="lv-medal lv-t${a.tiers > 1 ? a.tier : 0}">${esc(a.title.charAt(0))}</i>${esc(a.title)}</span>`).join('')}`;
    const sub = who.querySelector('.sub');
    if (sub) sub.after(box); else who.appendChild(box);
    const name = hero.querySelector('#profileName');
    if (name && d.look.color && ME.colors) name.style.color = ME.colors[d.look.color] || '';
    const ava = hero.querySelector('#avaWrap');
    if (ava) { [...ava.classList].filter((c) => c.startsWith('lv-frame-')).forEach((c) => ava.classList.remove(c)); if (d.look.frame) ava.classList.add('lv-frame-' + d.look.frame); }
    const banner = hero.querySelector('.banner.def');
    [...hero.classList].filter((c) => c.startsWith('lv-bg-')).forEach((c) => hero.classList.remove(c));
    if (d.look.bg) hero.classList.add('lv-bg-' + d.look.bg);
    if (banner && d.look.bg) banner.classList.add('lv-bg-' + d.look.bg);
  }

  // ---------- окно «Прогресс» ----------
  const TABS = [['home', 'Обзор'], ['mail', 'Почта'], ['ach', 'Достижения'], ['board', 'Рейтинг'], ['look', 'Оформление'], ['hist', 'История'], ['invite', 'Пригласить'], ['recap', 'Итоги 2026']];
  let ov = null, tab = 'home', lastFocus = null;
  function openProgress(which) {
    if (!ME) return;
    markSeen();
    tab = which || tab;
    lastFocus = document.activeElement;
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'lv-ov';
      ov.innerHTML = `<div class="lv-card" role="dialog" aria-modal="true" aria-labelledby="lvTitle"><div class="lv-head"><h2 id="lvTitle">Прогресс</h2><button type="button" class="x" aria-label="Закрыть">✕</button></div><div class="lv-tabs" role="tablist"></div><div class="lv-body" id="lvBody"></div></div>`;
      ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.lv-head .x')) closeProgress(); });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProgress(); });
    }
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    renderTabs();
    render();
    setTimeout(() => { const b = ov.querySelector('.lv-tabs [aria-selected="true"]'); if (b) b.focus(); }, 0);
  }
  function closeProgress() {
    if (!ov) return;
    ov.remove();
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderTabs() {
    const t = ov.querySelector('.lv-tabs');
    t.innerHTML = TABS.filter(([k]) => k !== 'recap' || ME.recap).map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}${k === 'mail' && +ME.mail ? ` (${ME.mail})` : ''}</button>`).join('');
    t.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderTabs(); render(); }));
  }
  const body = () => ov.querySelector('#lvBody');
  let seq = 0;
  async function render() {
    const my = ++seq;
    const b = body();
    b.scrollTop = 0;
    try {
      const html = await VIEWS[tab]();
      if (my !== seq || !ov.isConnected) return;
      b.innerHTML = html;
      if (BIND[tab]) BIND[tab](b);
    } catch (e) {
      if (my === seq) b.innerHTML = `<p class="lv-err">${esc(e.message || 'Не получилось загрузить')}</p>`;
    }
  }
  const pct = (a, b) => Math.min(100, Math.round((a / Math.max(1, b)) * 100));
  const medal = (a) => `<i class="lv-medal ${a.got ? 'lv-t' + (a.tiers > 1 ? a.tier : 0) : 'lv-tx'}">${a.got || !a.hidden ? esc(a.title.charAt(0)) : '?'}</i>`;
  const VIEWS = {
    async home() {
      await refreshMe();
      const m = ME, q = m.quests;
      const daily = q.daily.map((x) => `<div class="lv-q${x.done ? ' done' : ''}"><span>${esc(x.title)}</span><span class="xp">+${x.xp}</span><span class="lv-bar"><i style="width:${pct(x.progress, x.goal)}%"></i></span></div>`).join('');
      const w = q.weekly;
      const steps = m.steps ? `<div class="lv-box"><h3>Первые шаги</h3>${m.steps.map((s) => `<div class="lv-q${s.done ? ' done' : ''}"><span>${esc(s.title)}</span><span class="xp">+${s.xp}</span></div>`).join('')}</div>` : '';
      return `<div class="lv-hero"><span class="n">${m.level}</span><div class="r"><b>${esc(m.rank)}</b><span>${nf(m.xp)} опыта всего · до ${m.level + 1}-го уровня ещё ${nf(m.need - m.into)}</span><span class="lv-bar"><i style="width:${pct(m.into, m.need)}%"></i></span></div></div>
        ${m.event ? `<div class="lv-box"><h3>${esc(m.event.title)}</h3><p class="lv-muted">×${m.event.mult} опыта до ${new Date(m.event.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.</p></div>` : ''}
        <div class="lv-box"><div class="lv-streak"><span class="big">🔥 ${m.streak.days}</span><div><b>${m.streak.days ? `${plural(m.streak.days, 'день', 'дня', 'дней')} подряд` : 'Серии пока нет'}</b><p class="lv-muted">${m.streak.today ? 'Сегодня уже засчитан.' : 'Оцени что-нибудь или отреагируй другу, чтобы засчитать сегодня.'} Лучшая серия: ${m.streak.best}. «Заморозок»: ${m.streak.freezes} — спасают серию, если пропустишь день.</p></div></div></div>
        <div class="lv-box"><h3>Задания дня</h3>${daily || '<p class="lv-muted">Заданий пока нет.</p>'}<p class="lv-muted">За все три — ещё +${q.allXp}${q.allPaid ? ' (получено)' : ''}. Новые задания — завтра.</p></div>
        ${w ? `<div class="lv-box"><h3>Задание недели</h3><div class="lv-q${w.done ? ' done' : ''}"><span>${esc(w.title)} · ${w.progress} из ${w.goal}</span><span class="xp">+${w.xp}</span><span class="lv-bar"><i style="width:${pct(w.progress, w.goal)}%"></i></span></div></div>` : ''}
        ${steps}
        <p class="lv-muted">Опыт дают оценки, отзывы, тир-листы, реакции и комментарии друзьям, лоты. У каждого действия дневной лимит; удалишь — опыт уйдёт.</p>`;
    },
    async mail() {
      const d = await api('/levels/mail');
      VIEWS.mailIds = d.items.filter((g) => !g.read).map((g) => g.id);
      const when = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const rows = d.items.map((g) => `<div class="lv-letter${!g.read || (g.xp && !g.claimed) ? ' new' : ''}"><div class="top"><b>${esc(g.title)}</b><small>${when(g.at)}</small></div>
        ${g.body ? `<p>${esc(g.body)}</p>` : ''}
        ${g.xp ? `<div class="act"><span class="gift">+${g.xp} опыта</span>${g.claimed ? '<span class="lv-muted">Забрано</span>' : `<button type="button" class="lv-btn" data-claim="${esc(g.id)}">Забрать</button>`}${g.until && !g.claimed ? `<span class="lv-muted">до ${when(g.until)}</span>` : ''}</div>` : ''}</div>`).join('');
      return `<p class="lv-muted">Сюда приходят подарки от администрации и письма о новых уровнях.</p><div class="lv-mail">${rows || '<p class="lv-muted">Писем пока нет.</p>'}</div><p class="lv-err" id="lvMailMsg" role="status"></p>`;
    },
    async ach() {
      const d = await api('/levels/achievements');
      const got = d.items.filter((a) => a.got).length;
      const show = new Set(ME.prefs.showcase || []);
      return `<p class="lv-muted">Получено ${got} из ${d.items.length}. Отметь до трёх — они будут видны в профиле.</p>
        <div class="lv-grid">${d.items.map((a) => `<div class="lv-ach${a.got ? '' : ' off'}">${medal(a)}<div><b>${esc(a.title)}${a.got && a.tiers > 1 ? ' · ' + ['', 'бронза', 'серебро', 'золото'][a.tier] : ''}</b><span>${esc(a.desc)}${a.next ? ` · дальше: ${a.next}` : ''}</span><small>есть у ${a.rarity}%</small>${a.got ? `<button type="button" class="pin" data-pin="${esc(a.code)}" aria-pressed="${show.has(a.code)}">${show.has(a.code) ? 'В профиле' : 'Показать в профиле'}</button>` : ''}</div></div>`).join('')}</div>`;
    },
    async board() {
      const scope = VIEWS.scope || 'friends';
      const d = await api('/levels/board?scope=' + scope);
      const rows = d.top.map((x) => `<div class="${x.me ? 'me' : ''}"><em>${x.place}</em><span>${esc(x.username)}${x.level ? ` · ур. ${x.level}` : ''}</span><b>${nf(x.week)}</b></div>`).join('');
      return `<div class="lv-seg" role="group" aria-label="Чей рейтинг"><button type="button" data-scope="friends" aria-pressed="${scope === 'friends'}">Друзья</button><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">Весь сайт</button></div>
        <div class="lv-box"><h3>Опыт за неделю</h3><div class="lv-board">${rows || '<p class="lv-muted">На этой неделе пока никто не набрал опыта.</p>'}</div>
        ${d.best ? `<p class="lv-muted">Лучший прогресс: ${esc(d.best.username)}${d.best.growth != null ? ` — +${d.best.growth}% к прошлой неделе` : ' — новичок недели'}.</p>` : ''}
        <p class="lv-muted">Рейтинг обнуляется в понедельник. Скрыть себя можно во вкладке «Оформление».</p></div>`;
    },
    async look() {
      await refreshMe();
      const m = ME, u = m.unlocked, p = m.prefs;
      const FR = { '': 'Без рамки', frame1: 'Казуал', frame2: 'Неон', frame3: 'Переливы', frame4: 'Мастер' };
      const BG = { '': 'Без фона', dawn: 'Рассвет', night: 'Ночь', forest: 'Лес', ember: 'Угли', legend: 'Легенда' };
      const frames = ['', 'frame1', 'frame2', 'frame3', 'frame4'].map((f) => `<button type="button" data-frame="${f}" aria-pressed="${p.frame === f}"${f && !u.frames.includes(f) ? ' disabled' : ''}>${f ? `<span class="dot lv-frame-${f}" style="background:var(--panel-2,#222)"></span>` : ''}${FR[f]}</button>`).join('');
      const colors = ['', ...Object.keys(m.colors)].map((c) => `<button type="button" data-color="${c}" aria-pressed="${p.color === c}"${c && !u.colors.includes(c) ? ' disabled' : ''}>${c ? `<span class="dot" style="background:${m.colors[c]}"></span>` : ''}${c ? '' : 'Обычный'}</button>`).join('');
      const bgs = ['', ...m.bgs].map((b) => `<button type="button" data-bg="${b}" aria-pressed="${p.bg === b}"${b && !u.bgs.includes(b) ? ' disabled' : ''}>${b ? `<span class="sw lv-bg-${b}"></span>` : ''}${BG[b]}</button>`).join('');
      const rw = m.rewards.map((r) => `<div class="${m.level >= r.level ? 'got' : ''}"><span class="l">${r.level}</span><span class="${m.level >= r.level ? '' : 'no'}">${esc(r.title)}</span></div>`).join('');
      const tg = (k, label, on) => `<label class="lv-tg"><span>${label}</span><input type="checkbox" data-tg="${k}"${on ? ' checked' : ''}></label>`;
      return `<div class="lv-box"><h3>Рамка аватара</h3><div class="lv-pick">${frames}</div></div>
        <div class="lv-box"><h3>Цвет ника в профиле</h3><div class="lv-pick">${colors}</div>${u.colors.length ? '' : '<p class="lv-muted">Откроется на 10-м уровне.</p>'}</div>
        <div class="lv-box"><h3>Фон профиля</h3><div class="lv-pick">${bgs}</div>${u.bgs.length ? '' : '<p class="lv-muted">Откроется на 15-м уровне.</p>'}</div>
        <div class="lv-box"><h3>Награды за уровни</h3><div class="lv-rw">${rw}</div></div>
        <div class="lv-box"><h3>Видимость и уведомления</h3>${tg('hideLevel', 'Скрыть мой уровень от других', p.hideLevel)}${tg('hideBoard', 'Не показывать меня в рейтинге недели', p.hideBoard)}${tg('notify', 'Плашки о наградах', p.notify)}</div>
        <p class="lv-err" id="lvLookMsg" role="status"></p>`;
    },
    async hist() {
      const d = await api('/levels/history');
      const rows = d.items.map((x) => `<div class="${x.gone ? 'gone' : ''}"><span>${esc(x.what)}${x.name ? ` «${esc(x.name)}»` : ''}</span><span class="xp">${x.xp > 0 ? '+' : ''}${x.xp}</span><small>${new Date(x.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${x.gone ? ' · удалено, опыт списан' : ''}</small></div>`).join('');
      return `<div class="lv-box"><h3>Последние начисления</h3><div class="lv-hist">${rows || '<p class="lv-muted">Пока пусто.</p>'}</div></div>`;
    },
    async invite() {
      const d = await api('/levels/invite');
      return `<div class="lv-box"><h3>Пригласи друга</h3><p class="lv-muted">Друг откроет ссылку и зарегистрируется — вы сразу станете друзьями. Когда он дойдёт до 3-го уровня, вы оба получите +${d.xp} опыта.</p>
        <div class="lv-link"><input id="lvInv" readonly value="${esc(d.url)}" aria-label="Ссылка-приглашение"><button type="button" class="lv-btn" id="lvCopy">Скопировать</button></div>
        <p class="lv-muted" id="lvCopyMsg" role="status"></p></div>
        <div class="lv-box"><h3>Пришли по твоей ссылке</h3>${d.people.length ? d.people.map((p) => `<div class="lv-q${p.done ? ' done' : ''}"><span>${esc(p.username)}</span><span class="xp">${p.done ? '+' + d.xp : 'ещё не 3-й уровень'}</span></div>`).join('') : '<p class="lv-muted">Пока никого.</p>'}</div>`;
    },
    async recap() {
      const d = await api('/levels/recap');
      VIEWS.recapData = d;
      const c = (big, small, wide) => `<div${wide ? ' class="wide"' : ''}><b>${big}</b><span>${small}</span></div>`;
      return `<div class="lv-box"><h3>Твой 2026 на Казуал Хабе</h3><div class="lv-recap">
        ${c(d.ratings, plural(d.ratings, 'оценка', 'оценки', 'оценок') + ' за год')}
        ${d.avg != null ? c(d.avg, 'средний балл') : ''}
        ${c(d.cats, plural(d.cats, 'категория', 'категории', 'категорий'))}
        ${c(d.reactsGiven + d.commentsGiven, 'реакций и комментариев друзьям')}
        ${c(d.reactsGot + d.commentsGot, 'получил от друзей')}
        ${c(d.tierlists, plural(d.tierlists, 'тир-лист', 'тир-листа', 'тир-листов'))}
        ${c(d.level, 'уровень · ' + esc(d.rank))}
        ${c(d.achievements, plural(d.achievements, 'достижение', 'достижения', 'достижений'))}
        ${d.topCat ? c(esc(d.topCat.name), `любимая категория · ${d.topCat.n} ${plural(d.topCat.n, 'оценка', 'оценки', 'оценок')}`, true) : ''}
        ${d.best ? c(`${esc(d.best.name)} · ${d.best.total}`, 'лучшая оценка года', true) : ''}
        ${d.worst ? c(`${esc(d.worst.name)} · ${d.worst.total}`, 'самая строгая оценка', true) : ''}
        ${d.friend ? c(esc(d.friend.username), `друг года · ${d.friend.together} реакций и комментариев друг другу`, true) : ''}
      </div></div><div class="lv-link"><button type="button" class="lv-btn" id="lvRecapImg">Сохранить картинкой</button><span class="lv-muted" id="lvRecapMsg" role="status"></span></div>`;
    },
  };
  const BIND = {
    mail(b) {
      // открыл почту — всё прочитано
      if ((VIEWS.mailIds || []).length) api('/levels/mail/read', 'POST', {}).then((r) => { ME.mail = r.unread; paintMenu(); renderTabs(); }).catch(() => {});
      const msg = b.querySelector('#lvMailMsg');
      b.querySelectorAll('[data-claim]').forEach((btn) => btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await api('/levels/mail/claim', 'POST', { id: btn.dataset.claim });
          ME.mail = r.unread;
          if (r.gained) showNews([{ t: 'gift', xp: r.gained }]);
          await refreshMe();
          renderTabs();
          render();
        } catch (e) { btn.disabled = false; if (msg) msg.textContent = e.message; }
      }));
    },
    ach(b) {
      b.querySelectorAll('[data-pin]').forEach((btn) => btn.addEventListener('click', async () => {
        const cur = new Set(ME.prefs.showcase || []);
        const c = btn.dataset.pin;
        if (cur.has(c)) cur.delete(c); else { if (cur.size >= 3) { const first = [...cur][0]; cur.delete(first); } cur.add(c); }
        try { const r = await api('/levels/prefs', 'PUT', { showcase: [...cur] }); ME.prefs = r.prefs; profFor = ''; render(); } catch (e) {}
      }));
    },
    board(b) {
      b.querySelectorAll('[data-scope]').forEach((btn) => btn.addEventListener('click', () => { VIEWS.scope = btn.dataset.scope; render(); }));
    },
    look(b) {
      const msg = b.querySelector('#lvLookMsg');
      const save = async (patch) => {
        try { const r = await api('/levels/prefs', 'PUT', patch); ME.prefs = r.prefs; profFor = ''; paintAccount(); render(); }
        catch (e) { if (msg) msg.textContent = e.message; }
      };
      b.querySelectorAll('[data-frame]').forEach((x) => x.addEventListener('click', () => save({ frame: x.dataset.frame })));
      b.querySelectorAll('[data-color]').forEach((x) => x.addEventListener('click', () => save({ color: x.dataset.color })));
      b.querySelectorAll('[data-bg]').forEach((x) => x.addEventListener('click', () => save({ bg: x.dataset.bg })));
      b.querySelectorAll('[data-tg]').forEach((x) => x.addEventListener('change', () => save({ [x.dataset.tg]: x.checked })));
    },
    invite(b) {
      const inp = b.querySelector('#lvInv'), msg = b.querySelector('#lvCopyMsg');
      b.querySelector('#lvCopy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(inp.value); msg.textContent = 'Скопировано.'; }
        catch (e) { inp.select(); msg.textContent = 'Выделил ссылку — скопируй её.'; }
      });
    },
    recap(b) {
      b.querySelector('#lvRecapImg').addEventListener('click', () => saveRecap(VIEWS.recapData, b.querySelector('#lvRecapMsg')));
    },
  };

  // карточка итогов года картинкой (рисуется в браузере)
  function saveRecap(d, msg) {
    if (!d) return;
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#11131A'); bg.addColorStop(1, '#1D1530');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const acc = g.createLinearGradient(80, 0, W - 80, 0);
    acc.addColorStop(0, '#5B74FF'); acc.addColorStop(.55, '#E85FA5'); acc.addColorStop(1, '#F5B942');
    g.fillStyle = acc; g.fillRect(80, 110, 160, 10);
    g.fillStyle = '#F1F2F6';
    g.font = '800 92px system-ui, sans-serif';
    g.fillText('Мой 2026', 80, 230);
    g.font = '500 38px system-ui, sans-serif';
    g.fillStyle = '#B7BCCB';
    g.fillText('на Казуал Хабе', 80, 290);
    const cells = [
      [d.ratings, plural(d.ratings, 'оценка', 'оценки', 'оценок')], [d.avg != null ? d.avg : '—', 'средний балл'],
      [d.reactsGiven + d.commentsGiven, 'реакций и комментариев'], [d.level, 'уровень'],
    ];
    cells.forEach(([big, small], i) => {
      const x = 80 + (i % 2) * 470, y = 420 + Math.floor(i / 2) * 220;
      g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.roundRect(x, y - 110, 440, 190, 28); g.fill();
      g.fillStyle = '#F1F2F6'; g.font = '800 88px system-ui, sans-serif'; g.fillText(String(big), x + 32, y + 2);
      g.fillStyle = '#9AA0B2'; g.font = '500 32px system-ui, sans-serif'; g.fillText(small, x + 32, y + 52);
    });
    const lines = [
      d.topCat && ['Любимая категория', d.topCat.name], d.best && ['Лучшая оценка', `${d.best.name} · ${d.best.total}`],
      d.friend && ['Друг года', d.friend.username], ['Звание', d.rank],
    ].filter(Boolean);
    let y = 930;
    for (const [k, v] of lines) {
      g.fillStyle = '#9AA0B2'; g.font = '500 30px system-ui, sans-serif'; g.fillText(k, 80, y);
      g.fillStyle = '#F1F2F6'; g.font = '700 42px system-ui, sans-serif';
      let t = String(v); while (g.measureText(t).width > W - 160 && t.length > 4) t = t.slice(0, -2) + '…';
      g.fillText(t, 80, y + 52); y += 115;
    }
    g.fillStyle = '#6E7489'; g.font = '500 28px system-ui, sans-serif'; g.fillText(location.host, 80, H - 70);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'casualhub-2026.png', { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Мой 2026 на Казуал Хабе' }); return; } } catch (e) {}
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'casualhub-2026.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (msg) msg.textContent = 'Картинка сохранена.';
    }, 'image/png');
  }

  // ---------- знакомство с уровнями (один раз на аккаунт) ----------
  const INTRO_KEY = 'casualhub.levels.intro.v1';
  const introDone = () => { try { if (localStorage.getItem(INTRO_KEY) === '1') return true; } catch (e) {} return !!(ME && ME.prefs && ME.prefs.intro); };
  let spot = null;
  // всё размыто, видна только кнопка уровня: нажать её — единственный путь дальше
  function spotlight() {
    const real = document.querySelector('.lv-hbtn');
    if (!real || spot) return;
    spot = { ov: document.createElement('div'), tip: document.createElement('div'), btn: real.cloneNode(true) };
    spot.ov.className = 'lv-spot';
    spot.btn.classList.add('lv-spot-btn');
    spot.btn.classList.remove('lv-pulse');
    spot.tip.className = 'lv-spot-tip';
    spot.tip.setAttribute('role', 'dialog');
    spot.tip.setAttribute('aria-label', 'Новое на сайте: уровни');
    spot.tip.innerHTML = '<b>Новое: уровни</b><span>Получай опыт за оценки и общение с друзьями. Нажми, чтобы узнать, как это работает.</span>';
    const place = () => {
      const r = real.getBoundingClientRect();
      Object.assign(spot.btn.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      const tw = Math.min(300, innerWidth - 32);
      const left = Math.max(16, Math.min(r.left, innerWidth - tw - 16));
      spot.tip.style.left = left + 'px';
      spot.tip.style.top = r.bottom + 14 + 'px';
      spot.tip.style.setProperty('--ax', Math.max(14, Math.min(tw - 26, r.left + r.width / 2 - left - 6)) + 'px');
    };
    // сначала убираем прокрутку страницы: без полосы прокрутки шапка сдвигается, и копия встала бы мимо кнопки
    document.documentElement.style.overflow = 'hidden';
    place();
    requestAnimationFrame(place);
    spot.place = place;
    addEventListener('resize', place);
    addEventListener('scroll', place, { passive: true });
    spot.btn.addEventListener('click', () => { endSpot(); openIntro(); });
    spot.tip.addEventListener('click', () => { endSpot(); openIntro(); });
    // только кнопка: клавиатура тоже не уходит под размытие
    spot.ov.addEventListener('keydown', (e) => e.preventDefault());
    document.body.append(spot.ov, spot.btn, spot.tip);
    setTimeout(() => spot && spot.btn.focus(), 50);
  }
  function endSpot() {
    if (!spot) return;
    removeEventListener('resize', spot.place);
    removeEventListener('scroll', spot.place);
    spot.ov.remove(); spot.btn.remove(); spot.tip.remove();
    spot = null;
    document.documentElement.style.overflow = '';
  }
  document.addEventListener('focusin', (e) => { if (spot && !spot.btn.contains(e.target) && !spot.tip.contains(e.target)) spot.btn.focus(); });

  // тур: пять карточек, на каждой картинка, заголовок и пара строк
  function slides() {
    const m = ME, lv = m.level, p = Math.max(8, Math.round((m.into / Math.max(1, m.need)) * 100));
    const past = m.xp > 0;
    return [
      {
        pic: `<div class="lv-bigring" style="--p:${p}%"><b>${lv}</b><small>${esc(m.rank)}</small></div>`,
        h: past ? `У тебя уже ${lv}-й уровень` : 'Теперь у всех есть уровень',
        t: past ? `Это за всё, что ты успел сделать на сайте раньше: ${nf(m.xp)} опыта. Дальше — больше.` : 'Делай то, что и так делаешь на сайте, — и уровень будет расти.',
      },
      {
        pic: '<div class="lv-chips"><span>Оценка <b>+10</b></span><span>Отзыв <b>+5</b></span><span>Тир-лист <b>+25</b></span><span>Реакция другу <b>+3</b></span><span>Комментарий <b>+6</b></span><span>Новый друг <b>+15</b></span><span>Сбор лотов <b>+30</b></span></div>',
        h: 'Опыт за то, что ты любишь',
        t: 'Больше всего — за общение с друзьями. У каждого действия есть дневной лимит, а удалённое списывается.',
      },
      {
        pic: '<div class="lv-tq"><div class="ok"><i></i>Оцени 2 произведения<em>+15</em></div><div class="ok"><i></i>Отреагируй на 3 оценки<em>+15</em></div><div><i></i>Напиши отзыв<em>+15</em></div></div>',
        h: 'Задания и серия',
        t: 'Каждый день три задания. Заходи подряд — растёт серия 🔥, а «заморозка» спасёт, если пропустишь день.',
      },
      {
        pic: '<div class="lv-tmedals"><i class="lv-medal lv-t1">К</i><i class="lv-medal lv-t3">★</i><i class="lv-medal lv-t2">Д</i></div>',
        h: 'Достижения и награды',
        t: 'Собирай достижения и открывай рамки для аватара, цвет ника и фон профиля.',
      },
      {
        pic: `<div class="lv-tmail">${MAIL_ICON.replace('width="17" height="17"', '')}<span>+50</span></div>`,
        h: 'Подарки в почте',
        t: 'В меню ☰ → «Почта» приходят подарки от нас. А в «Рейтинге» видно, кто из друзей сильнее на этой неделе.',
      },
    ];
  }
  let tour = null;
  function openIntro() {
    if (!ME) return;
    const list = slides();
    let i = 0;
    tour = document.createElement('div');
    tour.className = 'lv-ov lv-blur';
    tour.style.zIndex = '132';
    tour.innerHTML = '<div class="lv-tour" role="dialog" aria-modal="true" aria-labelledby="lvTourH"></div>';
    const box = tour.firstElementChild;
    const draw = () => {
      const s = list[i], last = i === list.length - 1;
      box.innerHTML = `<div class="slide"><div class="pic">${s.pic}</div><h3 id="lvTourH">${s.h}</h3><p>${s.t}</p></div>
        <div class="dots" aria-hidden="true">${list.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="nav">${i ? '<button type="button" class="back">Назад</button>' : ''}<button type="button" class="go">${last ? 'Поехали' : 'Дальше'}</button></div>`;
      box.querySelector('.go').addEventListener('click', () => { if (last) finish(); else { i++; draw(); } });
      const back = box.querySelector('.back');
      if (back) back.addEventListener('click', () => { i--; draw(); });
      box.querySelector('.go').focus();
    };
    tour.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' && i < list.length - 1) { i++; draw(); }
      if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
    });
    document.body.appendChild(tour);
    document.documentElement.style.overflow = 'hidden';
    draw();
  }
  async function finish() {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
    markSeen();
    if (tour) { tour.remove(); tour = null; }
    document.documentElement.style.overflow = '';
    try { const r = await api('/levels/prefs', 'PUT', { intro: true }); ME.prefs = r.prefs; } catch (e) {}
    openProgress('home');
    pullNews();
  }

  window.CasualLevels = { open: openProgress, refresh: refreshMe, news: pullNews, intro: openIntro };
  if (!token()) return;
  refreshMe().then(() => { if (ME && !introDone()) { setTimeout(spotlight, 400); return; } if (ME) { pullNews(); if (/^#progress$/.test(location.hash)) { history.replaceState(null, '', location.pathname + location.search); openProgress('home'); } } });
})();
