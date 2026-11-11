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
  async function refreshMe() {
    try {
      const d = await api('/levels/me');
      if (!d.on) { ME = null; return; }
      ME = d;
      paintMenu();
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
  new MutationObserver(() => { if (!ME) return; clearTimeout(moT); moT = setTimeout(() => { paintAvatars(); paintProfile(); paintAccount(); }, 150); })
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
  const TABS = [['home', 'Обзор'], ['ach', 'Достижения'], ['board', 'Рейтинг'], ['look', 'Оформление'], ['hist', 'История'], ['invite', 'Пригласить'], ['recap', 'Итоги 2026']];
  let ov = null, tab = 'home', lastFocus = null;
  function openProgress(which) {
    if (!ME) return;
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
    t.innerHTML = TABS.filter(([k]) => k !== 'recap' || ME.recap).map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}</button>`).join('');
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

  window.CasualLevels = { open: openProgress, refresh: refreshMe, news: pullNews };
  if (!token()) return;
  refreshMe().then(() => { if (ME) { pullNews(); if (/^#progress$/.test(location.hash)) { history.replaceState(null, '', location.pathname + location.search); openProgress('home'); } } });
})();
