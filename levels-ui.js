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
  // полоса из 10 делений, как шкала оценок сайта: заполнено до ближайшего деления вверх, точное число — в тексте рядом
  function bar(p) { const v = Math.max(0, Math.min(100, +p || 0)); const c = v > 0 ? Math.min(100, Math.ceil(v / 10) * 10) : 0; return `<span class="lv-bar" style="--p:${c}" role="img" aria-label="${Math.round(v)}%"></span>`; }

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
.lv-bar { position: relative; display: block; height: 8px; width: 100%; background: linear-gradient(90deg, var(--bad, #E4553F) 0 40%, var(--mid, #EAA92C) 40% 70%, var(--good, #2EAD60) 70%);
  -webkit-mask: repeating-linear-gradient(90deg, #000 0 calc(10% - 3px), transparent calc(10% - 3px) 10%); mask: repeating-linear-gradient(90deg, #000 0 calc(10% - 3px), transparent calc(10% - 3px) 10%); }
.lv-bar::after { content: ""; position: absolute; top: 0; bottom: 0; right: 0; width: calc((100 - var(--p, 0)) * 1%); background: var(--cell, color-mix(in srgb, var(--ink, #fff) 14%, transparent)); transition: width .5s; }
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
/* Рамки аватара — награды за уровни. Пиксельный дух: чёткие кольца без размытия, анимация ступеньками.
   --u — толщина «пикселя» рамки: у маленьких аватаров в списках 1px, в профиле и в предпросмотре крупнее.
   У анимированных рамок нет !important: он сильнее анимации, и рамка стояла бы на месте */
#avaWrap { --u: 1.7px; }
.lv-pick .dot { --u: .75px; }
.lv-frame-frame1 { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #F2BA44 !important; border-radius: 50%; }
.lv-frame-frame5 { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24) !important; outline: calc(var(--u, 1px) * 3) dashed var(--accent, #5B74FF); outline-offset: calc(var(--u, 1px) * 2); border-radius: 50%; }
.lv-frame-frame2 { border-radius: 50%; animation: lv-neon 1.6s steps(1, end) infinite; }
@keyframes lv-neon { 0%, 100% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #5B74FF, 0 0 0 calc(var(--u, 1px) * 6) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 7.5) #E85FA5; } 50% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #E85FA5, 0 0 0 calc(var(--u, 1px) * 6) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 7.5) #5B74FF; } }
.lv-frame-frame3 { border-radius: 50%; animation: lv-flow 3s steps(1, end) infinite; }
@keyframes lv-flow { 0.0% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #F26A55; } 16.7% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #F2BA44; } 33.3% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #43C97A; } 50.0% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #14A3A8; } 66.7% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #5B74FF; } 83.3% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #E85FA5; } 100% { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #F26A55; } }
.lv-frame-frame4 { box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #E2A925, 0 0 0 calc(var(--u, 1px) * 6) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 7.5) #8C5A12, 0 0 0 calc(var(--u, 1px) * 9) #E2A925 !important; border-radius: 50%; }
.lv-frame-frame6 { border-radius: 50%; outline: calc(var(--u, 1px) * 2.5) dashed #F2BA44; outline-offset: calc(var(--u, 1px) * 7); animation: lv-flow 1.5s steps(1, end) infinite; }
@media (prefers-reduced-motion: reduce) { .lv-frame-frame2, .lv-frame-frame3, .lv-frame-frame6 { animation: none; box-shadow: 0 0 0 calc(var(--u, 1px) * 2) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 4) #5B74FF, 0 0 0 calc(var(--u, 1px) * 6) var(--panel, #1b1d24), 0 0 0 calc(var(--u, 1px) * 7.5) #E85FA5 !important; } }
/* корона («Мастер», «Легенда») и котик Васян (25-й уровень): в профиле у аватара и в предпросмотре */
#avaWrap > .lv-crown, .lv-lk-ava > .lv-crown { position: absolute; left: 50%; top: -28px; width: 46px; height: auto; transform: translateX(-50%) rotate(-8deg); image-rendering: pixelated; z-index: 3; pointer-events: none; }
/* Васян — лист /art/pet-vasyan.webp из 6 кадров (последний — моргнул) */
#avaWrap > .lv-pet, .lv-lk-ava > .lv-pet { position: absolute; right: -86px; top: -4px; width: 80px; height: 56px; z-index: 3; pointer-events: none; background: url(/art/pet-vasyan.webp) 0 0 / 600% 100% no-repeat; image-rendering: pixelated; animation: lv-blink 3s steps(6, jump-none) infinite; }
@keyframes lv-blink { to { background-position: 100% 0; } }
.lv-lk-ava > .lv-crown { width: 34px; top: -22px; }
.lv-lk-ava > .lv-pet { width: 46px; height: 32px; right: -52px; top: 0; }
/* ник: пиксельная тень (18-й) и радужный ступеньками (35-й) */
.lv-nick-shadow { text-shadow: .06em .06em 0 color-mix(in srgb, var(--accent, #5B74FF) 80%, #000), .12em .12em 0 color-mix(in srgb, var(--ink, #fff) 16%, transparent); }
.lv-nick-rainbow { background: linear-gradient(90deg, #F26A55 0 16.6%, #F2BA44 0 33.3%, #43C97A 0 50%, #14A3A8 0 66.6%, #5B74FF 0 83.3%, #E85FA5 0) 0 0 / 200% 100% repeat-x; -webkit-background-clip: text; background-clip: text; color: transparent !important; -webkit-text-fill-color: transparent; animation: lv-rb 3s steps(12) infinite; }
@keyframes lv-rb { to { background-position: 200% 0; } }
/* ник в профиле — отдельные буквы .ch со своей анимацией: градиент через фон на них не ложится,
   поэтому каждая буква своего цвета, а переливание — сдвиг оттенка у всего ника */
.lv-nick-rainbow:has(> .ch) { background: none; -webkit-text-fill-color: currentColor; color: inherit !important; animation: lv-hue 3s steps(6) infinite; }
.lv-nick-rainbow > .ch:nth-child(6n+1) { color: #F26A55 !important; } .lv-nick-rainbow > .ch:nth-child(6n+2) { color: #F2BA44 !important; } .lv-nick-rainbow > .ch:nth-child(6n+3) { color: #43C97A !important; } .lv-nick-rainbow > .ch:nth-child(6n+4) { color: #14A3A8 !important; } .lv-nick-rainbow > .ch:nth-child(6n+5) { color: #5B74FF !important; } .lv-nick-rainbow > .ch:nth-child(6n+6) { color: #E85FA5 !important; }
@keyframes lv-hue { to { filter: hue-rotate(360deg); } }
/* эффекты профиля: звездопад в шапке (22-й) и конфетти при открытии (45-й) */
.lv-fx-stars { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: #fff; opacity: .85; -webkit-mask: url(/art/site/stars.webp) 0 0 / 260px 260px repeat; mask: url(/art/site/stars.webp) 0 0 / 260px 260px repeat; animation: lv-fall 10s steps(52) infinite linear; }
@keyframes lv-fall { to { -webkit-mask-position: 0 260px; mask-position: 0 260px; } }
.lv-conf { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 6; border-radius: inherit; }
.lv-conf i { position: absolute; top: -14px; width: 10px; height: 10px; animation: lv-cf 1.9s steps(16) var(--d, 0s) forwards; }
@keyframes lv-cf { to { transform: translate(var(--x, 0), 520px) rotate(180deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .lv-pet, .lv-nick-rainbow, .lv-fx-stars { animation: none !important; } }
/* вкладка «Оформление»: предпросмотр профиля, замки, заметка для админа */
.lv-lk { position: relative; border-radius: 14px; overflow: hidden; background: var(--panel-2, #1d2129); }
.lv-lk-ban { position: relative; height: 112px; overflow: hidden; background: linear-gradient(135deg, color-mix(in srgb, var(--accent, #5B74FF) 35%, transparent), color-mix(in srgb, var(--good, #43C97A) 22%, transparent)); background-size: cover; background-position: center 70%; }
.lv-lk-row { position: relative; z-index: 2; display: flex; align-items: flex-end; gap: 18px; padding: 0 16px 16px; margin-top: -34px; }
.lv-lk-ava { --u: 1.3px; position: relative; flex: none; width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: var(--accent, #5B74FF); color: #fff; font: 800 30px/1 system-ui, sans-serif; }
.lv-lk-who { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; padding-bottom: 4px; }
.lv-lk-name { font: 800 24px/1.15 var(--font-display, system-ui), sans-serif; overflow-wrap: anywhere; color: var(--ink, #f3f4f6); }
.lv-lk .lv-chip { display: inline-flex; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent, #3550E8) 14%, transparent); font-size: 13px; font-weight: 600; }
.lv-lock { margin-left: 6px; font-size: 11px; font-weight: 700; color: var(--ink-3, #8a8f9e); }
.lv-adm { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; border: 1px dashed var(--accent, #5B74FF); font-size: 13px; color: var(--ink-2, #b5b5b5); }
/* фон профиля: у карточки профиля — лёгкий оттенок, у баннера по умолчанию и у образца в «Оформлении» — пиксельная картинка из /art/bg */
.lv-bg-dawn { background-image: linear-gradient(135deg, color-mix(in srgb, #F5B942 16%, transparent), color-mix(in srgb, #E85FA5 14%, transparent)) !important; }
.lv-bg-night { background-image: linear-gradient(135deg, color-mix(in srgb, #3550E8 22%, transparent), color-mix(in srgb, #0D0F14 30%, transparent)) !important; }
.lv-bg-city { background-image: linear-gradient(135deg, color-mix(in srgb, #3550E8 16%, transparent), color-mix(in srgb, #F2BA44 10%, transparent)) !important; }
.lv-bg-forest { background-image: linear-gradient(135deg, color-mix(in srgb, #2EAD60 18%, transparent), color-mix(in srgb, #14A3A8 14%, transparent)) !important; }
.lv-bg-ember { background-image: linear-gradient(135deg, color-mix(in srgb, #F08A24 20%, transparent), color-mix(in srgb, #E4553F 14%, transparent)) !important; }
.lv-bg-legend { background-image: linear-gradient(135deg, color-mix(in srgb, #E2A925 26%, transparent), color-mix(in srgb, #9B6BFF 22%, transparent), color-mix(in srgb, #E85FA5 18%, transparent)) !important; }
.banner.lv-bg-dawn, .lv-lk-ban.lv-bg-dawn, .lv-pick .sw.lv-bg-dawn { background-image: url(/art/bg/dawn.webp) !important; }
.banner.lv-bg-night, .lv-lk-ban.lv-bg-night, .lv-pick .sw.lv-bg-night { background-image: url(/art/bg/night.webp) !important; }
.banner.lv-bg-city, .lv-lk-ban.lv-bg-city, .lv-pick .sw.lv-bg-city { background-image: url(/art/bg/city.webp) !important; }
.banner.lv-bg-forest, .lv-lk-ban.lv-bg-forest, .lv-pick .sw.lv-bg-forest { background-image: url(/art/bg/forest.webp) !important; }
.banner.lv-bg-ember, .lv-lk-ban.lv-bg-ember, .lv-pick .sw.lv-bg-ember { background-image: url(/art/bg/ember.webp) !important; }
.banner.lv-bg-legend, .lv-lk-ban.lv-bg-legend, .lv-pick .sw.lv-bg-legend { background-image: url(/art/bg/legend.webp) !important; }
.lv-pick .sw[class*="lv-bg-"] { background-image: none; background-size: cover !important; background-position: center !important; }
.lv-pick .sw.lv-bg-dawn { background-image: url(/art/bg/dawn-s.webp) !important; }
.lv-pick .sw.lv-bg-night { background-image: url(/art/bg/night-s.webp) !important; }
.lv-pick .sw.lv-bg-city { background-image: url(/art/bg/city-s.webp) !important; }
.lv-pick .sw.lv-bg-forest { background-image: url(/art/bg/forest-s.webp) !important; }
.lv-pick .sw.lv-bg-ember { background-image: url(/art/bg/ember-s.webp) !important; }
.lv-pick .sw.lv-bg-legend { background-image: url(/art/bg/legend-s.webp) !important; }
.banner[class*="lv-bg-"], .lv-lk-ban[class*="lv-bg-"] { background-size: cover !important; background-position: center 70% !important; }
.banner.lv-bg-legend, .lv-lk-ban.lv-bg-legend { background-position: center 15% !important; } /* сияние — вверху картинки */
/* эмблемы достижений: пиксельные картинки из листа /art/ach.webp (6×4, порядок как в ACH_ART).
   Одни и те же в обычном и казуальном виде (html.unslop); линейный SVG остаётся только у скрытых «?» */
.lv-px { display: none; }
html .px > svg { display: none; }
html .px > .lv-px { display: block; width: 100%; height: 100%; background: url(/art/ach.webp) calc(var(--ax) * 20%) calc(var(--ay) * 100% / 3) / 600% 400% no-repeat; }
html .lv-bi .ic.px { padding: 3px; background: color-mix(in srgb, var(--c1) 14%, var(--panel, #1b1d24)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c2) 45%, transparent); }
html .lv-sic.px { width: 22px; height: 22px; background: none; }
html .px > .lv-px.vasyan { background: url(/art/pet-vasyan.webp) 0 50% / 600% auto no-repeat; image-rendering: pixelated; }
.lv-prof { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; color: var(--ink-2, #b5b5b5); }
/* кольцо с номером уровня — как у кнопки в шапке, только крупнее */
.lv-pring { position: relative; flex: none; width: 34px; height: 34px; border-radius: 50%; display: inline-grid; place-items: center; background: conic-gradient(var(--accent, #3550E8) var(--p, 0%), color-mix(in srgb, var(--ink, #fff) 16%, transparent) 0); }
.lv-pring::before { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: var(--panel, #1b1d24); }
.lv-pring b { position: relative; font: 800 13px/1 system-ui, sans-serif; color: var(--ink, #f3f4f6); font-variant-numeric: tabular-nums; }
/* у профиля при уровнях — только рамка уровня, без прежнего радужного кольца */
html.lv-on .ava-wrap > .ava-ring { display: none !important; }
.lv-sic { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; color: #fff; background: linear-gradient(140deg, var(--c1), var(--c2)); }
.lv-sic svg { width: 13px; height: 13px; }
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

.lv-ov { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top, 0px)) 20px max(20px, env(safe-area-inset-bottom, 0px)); background: rgb(6 8 12 / .5); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
.lv-card { width: min(980px, 100%); height: min(820px, 100%); display: grid; grid-template-rows: auto auto minmax(0, 1fr); border-radius: 24px; border: 1px solid var(--line, #2b2e38); background: var(--panel, #17181c); color: var(--ink, #f2f2f2); overflow: hidden; box-shadow: 0 40px 90px -30px rgb(0 0 0 / .7); }
.lv-head { display: flex; align-items: center; gap: 12px; padding: 22px 22px 14px 28px; }
.lv-head h2 { margin: 0; font-size: 24px; font-family: var(--font-display, inherit); }
.lv-head .x { margin-left: auto; width: 36px; height: 36px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ink, #fff) 8%, transparent); color: var(--ink, #fff); font-size: 16px; cursor: pointer; }
.lv-tabs { display: flex; gap: 8px; padding: 0 28px 16px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line, #2b2e38); }
.lv-tabs::-webkit-scrollbar { display: none; }
/* на узком экране вкладки листаются вбок: правый край тает — видно, что дальше есть ещё */
@media (max-width: 700px) { .lv-tabs { -webkit-mask: linear-gradient(90deg, #000 82%, transparent); mask: linear-gradient(90deg, #000 82%, transparent); } }
.lv-tabs button { position: relative; flex: none; padding: 8px 15px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink-2, #b5b5b5); font: 600 13px/1.2 inherit; font-family: inherit; cursor: pointer; }
.lv-tabs button[aria-selected="true"] { background: var(--accent, #3550E8); border-color: transparent; color: #fff; }
/* вкладки «в разработке»: серые, по наведению или нажатию — подсказка */
.lv-tabs button.soon { color: var(--ink-3, #8a8f9e); opacity: .55; cursor: default; border-style: dashed; }
.lv-tabs button.soon:hover, .lv-tabs button.soon.lv-tip { opacity: .8; }
.lv-tabs { position: relative; }
.lv-soon-tip { position: fixed; z-index: 140; padding: 4px 9px; border-radius: 8px; background: var(--ink, #f3f4f6); color: var(--panel, #1b1d24); font: 700 12px/1.2 system-ui, sans-serif; pointer-events: none; white-space: nowrap; }
.lv-body { overflow-y: auto; padding: 22px 28px 32px; display: grid; gap: 18px; align-content: start; }
.lv-box { border: 1px solid var(--line, #2b2e38); border-radius: 18px; padding: 18px 20px; display: grid; gap: 10px; background: var(--panel-2, color-mix(in srgb, var(--ink, #fff) 3%, transparent)); }
.lv-box h3 { margin: 0; font-size: 15px; }
.lv-hero { display: flex; align-items: center; gap: 16px; }
.lv-hero .n { font: 800 54px/0.9 var(--font-display, system-ui); color: var(--accent, #3550E8); font-variant-numeric: tabular-nums; }
.lv-hero .r { display: grid; gap: 2px; min-width: 0; flex: 1; }
.lv-hero .r b { font-size: 17px; }
.lv-hero .r span { font-size: 13px; color: var(--ink-3, #8a8f9e); }
.lv-muted { color: var(--ink-3, #8a8f9e); font-size: 13px; margin: 0; }
.lv-q { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 12px; align-items: center; font-size: 14px; }
.lv-q .xp { font-weight: 700; color: #D99A1E; font-variant-numeric: tabular-nums; }
.lv-q .lv-bar { grid-column: 1 / -1; height: 6px; }
.lv-q.done > span:first-child { color: var(--ink-3, #8a8f9e); text-decoration: line-through; }
.lv-q.done .lv-bar { background: var(--good, #2EAD60); }
.lv-streak { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lv-streak .big { font: 800 30px/1 var(--font-display, system-ui); }
/* достижения: эмблема на цветной плашке, как ачивки в профиле */
.lv-bdg { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); gap: 10px; }
.lv-bi { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--line, #2b2e38); background: var(--panel-2, var(--panel, #1b1d24)); min-width: 0; }
.lv-bi.got { padding-right: 30px; border-color: color-mix(in srgb, var(--c2) 35%, var(--line, #2b2e38)); background: linear-gradient(135deg, color-mix(in srgb, var(--c1) 12%, var(--panel-2, var(--panel, #1b1d24))), var(--panel-2, var(--panel, #1b1d24)) 65%); }
.lv-bi .ic { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; background: linear-gradient(140deg, var(--c1), var(--c2)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35), inset 0 -2px 0 rgba(0, 0, 0, .14), 0 8px 16px -10px var(--c2); }
.lv-bi .ic svg { width: 24px; height: 24px; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .22)); }
.lv-bi.off .ic { filter: grayscale(1); opacity: .45; box-shadow: none; }
.lv-bi b { display: block; font-size: 14px; line-height: 1.25; overflow-wrap: anywhere; }
.lv-bi.off b { color: var(--ink-2, #b5b5b5); }
.lv-bi small { display: block; margin-top: 2px; font-size: 12px; color: var(--ink-3, #8a8f9e); }
.lv-bi .lv-bar { margin-top: 7px; height: 6px; }
.lv-bi .ok { position: absolute; top: 9px; right: 10px; font-weight: 800; color: var(--c2); }
.lv-bi .pin { margin-top: 8px; padding: 4px 10px; white-space: nowrap; border-radius: 999px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink-2, #b5b5b5); font: 600 11.5px/1.2 inherit; font-family: inherit; cursor: pointer; }
.lv-bi .pin[aria-pressed="true"] { background: var(--accent, #3550E8); color: #fff; border-color: transparent; }
.lv-more { margin-top: 4px; }
.lv-more summary { cursor: pointer; padding: 8px 2px; font-size: 13.5px; font-weight: 700; color: var(--accent, #3550E8); list-style: none; }
.lv-more summary::-webkit-details-marker { display: none; }
.lv-more[open] summary { margin-bottom: 8px; }
.lv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 12px; }
.lv-ach { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 12px; align-items: start; padding: 14px; border-radius: 16px; border: 1px solid var(--line, #2b2e38); }
.lv-ach .lv-medal { width: 44px; height: 44px; border-radius: 13px; font-size: 18px; }
.lv-ach b { display: block; font-size: 14px; }
.lv-ach span, .lv-ach small { display: block; font-size: 12px; color: var(--ink-3, #8a8f9e); }
.lv-ach.off { opacity: .55; }
.lv-ach .pin { margin-top: 8px; padding: 4px 10px; white-space: nowrap; border-radius: 999px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink-2, #b5b5b5); font: 600 11.5px/1.2 inherit; font-family: inherit; cursor: pointer; justify-self: start; }
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
.lv-rw > div { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 6px 0; font-size: 14px; }
.lv-rw .l { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; border: 2px solid var(--line, #2b2e38); }
.lv-rw .got .l { border-color: var(--accent, #3550E8); color: var(--accent, #3550E8); }
.lv-rw .no { color: var(--ink-3, #8a8f9e); }
.lv-rw .ok { color: var(--good, #43C97A); font-weight: 800; }
.lv-letter .lv-vy { width: 60px; height: 42px; flex: none; background: url(/art/pet-vasyan.webp) 0 0 / 600% 100% no-repeat; image-rendering: pixelated; animation: lv-blink 3s steps(6, jump-none) infinite; }
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
html.unslop .lv-bar { height: 7px; }
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
    if (n.t === 'quest') return `Задание выполнено: ${n.title}\u00a0·\u00a0+${n.xp}`;
    if (n.t === 'quest_all') return `Все задания дня\u00a0·\u00a0+${n.xp}`;
    if (n.t === 'quest_week') return `Задание недели: ${n.title}\u00a0·\u00a0+${n.xp}`;
    if (n.t === 'streak') return `Серия ${n.streak} ${plural(n.streak, 'день', 'дня', 'дней')} подряд\u00a0·\u00a0+${n.xp}`;
    if (n.t === 'freeze') return `«Заморозка» спасла серию: ${n.streak} ${plural(n.streak, 'день', 'дня', 'дней')}`;
    if (n.t === 'first') return `Первые шаги: ${n.title}\u00a0·\u00a0+${n.xp}`;
    if (n.t === 'invite') return `Друг по твоей ссылке дошёл до 3-го уровня\u00a0·\u00a0+${n.xp}`;
    if (n.t === 'invite_me') return `Приглашение друга засчитано\u00a0·\u00a0+${n.xp}`;
    if (n.t === 'gift') return `Подарок из почты ·\u00a0+${n.xp}\u00a0опыта`;
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
      ${bar(Math.min(100, Math.round((ME.into / ME.need) * 100)))}
      <span class="lv-sub"><span>Задания ${qd}/${q.length}</span>${ME.streak.days ? `<span>🔥 ${ME.streak.days} ${plural(ME.streak.days, 'день', 'дня', 'дней')}</span>` : ''}${ME.event ? `<span>${esc(ME.event.title)}</span>` : ''}</span>`;
  }
  function paintAccount() {
    const header = document.querySelector('header');
    const box = header && header.querySelector('#account, [data-account], #userBar');
    // кружок — на самом аватаре (у #account на главной нет своего размера: display: contents)
    const acc = box && (box.querySelector('.avatar, .ava, img') || box);
    if (!acc || !ME) return;
    // своя цифра на аватаре только путала: уровень и так виден на кнопке «Уровень» рядом
    const n = acc.querySelector(':scope > .lv-num');
    if (n) n.remove();
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
  // котик Васян (подарок «Первой десятке»): vasyan.js показывает его только хозяину — флаг в этом браузере
  function vasyanOwn(on) {
    let was = null;
    try { was = localStorage.getItem('casualhub.vasyan.own'); if (on) localStorage.setItem('casualhub.vasyan.own', '1'); else localStorage.removeItem('casualhub.vasyan.own'); } catch (e) {}
    if (!!was !== on) document.dispatchEvent(new CustomEvent('casualhub:vasyan', { detail: { own: on } }));
  }
  async function refreshMe() {
    try {
      const d = await api('/levels/me');
      if (!d.on) { ME = null; return; }
      ME = d;
      vasyanOwn(!!d.vasyan);
      document.documentElement.classList.add('lv-on');
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
  let confFor = '';
  // пиксельное конфетти над карточкой профиля (награда 45-го уровня); при «меньше движения» — нет
  function burst(host) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const COLS = ['#F26A55', '#F2BA44', '#43C97A', '#5B74FF', '#E85FA5', '#E8EAF0'];
    const box = document.createElement('div');
    box.className = 'lv-conf'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${COLS[i % COLS.length]};--d:${(i % 8) * 0.07}s;--x:${((i * 53) % 60) - 30}px"></i>`).join('');
    host.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }
  const ACH_TOTAL = 25;
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
    const pr = Math.min(100, Math.round(((+d.into || 0) / Math.max(1, +d.need || 1)) * 100));
    box.innerHTML = `<span class="lv-pring" style="--p:${pr}%" title="Уровень ${d.level} · ${esc(d.rank)}" aria-label="Уровень ${d.level}"><b>${d.level}</b></span>${d.look.rank ? `<span class="lv-chip">${esc(d.look.rank)}</span>` : ''}${(d.showcase || []).map((a) => { const art = ACH_ART[a.code] || ACH_ART.critic; return `<span class="lv-show"><i class="lv-sic px" style="--c1:${art[0]};--c2:${art[1]}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${art[2]}</svg>${achPx(a.code)}</i>${esc(a.title)}</span>`; }).join('')}`;
    const sub = who.querySelector('.sub');
    if (sub) sub.after(box); else who.appendChild(box);
    const name = hero.querySelector('#profileName');
    if (name && d.look.color && ME.colors) name.style.color = ME.colors[d.look.color] || '';
    const ava = hero.querySelector('#avaWrap');
    if (ava) { [...ava.classList].filter((c) => c.startsWith('lv-frame-')).forEach((c) => ava.classList.remove(c)); if (d.look.frame) ava.classList.add('lv-frame-' + d.look.frame); }
    // ник с тенью или радужный, корона у «Мастера» и «Легенды», котик Васян, звездопад в шапке, конфетти один раз за просмотр
    if (name) { [...name.classList].filter((c) => c.startsWith('lv-nick-')).forEach((c) => name.classList.remove(c)); if (d.look.nick) name.classList.add('lv-nick-' + d.look.nick); }
    if (ava) {
      ava.querySelectorAll(':scope > .lv-crown, :scope > .lv-pet').forEach((x) => x.remove());
      if (d.look.frame === 'frame4' || d.look.frame === 'frame6') ava.insertAdjacentHTML('beforeend', '<img class="lv-crown" src="/art/crown.svg" width="44" height="30" alt="" aria-hidden="true">');
      if (d.look.pet) ava.insertAdjacentHTML('beforeend', '<i class="lv-pet" aria-hidden="true"></i>');
    }
    const anyBan = hero.querySelector('.banner');
    if (anyBan) { anyBan.querySelectorAll(':scope > .lv-fx-stars').forEach((x) => x.remove()); if (d.look.fx === 'stars') anyBan.insertAdjacentHTML('beforeend', '<i class="lv-fx-stars" aria-hidden="true"></i>'); }
    if (d.look.fx === 'confetti' && confFor !== id) { confFor = id; burst(hero); }
    const banner = hero.querySelector('.banner.def');
    [...hero.classList].filter((c) => c.startsWith('lv-bg-')).forEach((c) => hero.classList.remove(c));
    if (d.look.bg) hero.classList.add('lv-bg-' + d.look.bg);
    if (banner && d.look.bg) banner.classList.add('lv-bg-' + d.look.bg);
    paintProfileAch(id);
  }
  // карточка «Ачивки» в профиле: одна система с «Прогрессом» (свой профиль — всё, чужой — только полученное)
  let achFor = '', achData = null;
  async function paintProfileAch(id) {
    const card = [...document.querySelectorAll('#app .card')].find((c) => { const h = c.querySelector('.head h2'); return h && h.textContent.trim() === 'Ачивки'; });
    if (!card || card.dataset.lv === id) return;
    if (achFor !== id) { achFor = id; achData = null; try { achData = (await api('/levels/achievements?id=' + id)).items; } catch (e) { achData = null; } }
    if (!achData || card.dataset.lv === id) return;
    card.dataset.lv = id;
    const got = achData.filter((a) => a.got).length;
    const label = card.querySelector('.head .label');
    if (label) label.textContent = `${got} из ${ACH_TOTAL}`;
    // общая полоска «открыто N%» над списком — по тем же достижениям
    const sum = card.querySelector(':scope > .ach-sum');
    if (sum) {
      const p = Math.round((got / ACH_TOTAL) * 100);
      sum.setAttribute('aria-label', `Открыто ${p}% достижений`);
      const i = sum.querySelector('.tr i'), bb = sum.querySelector('b');
      if (i) i.style.width = p + '%';
      if (bb) bb.textContent = p + '%';
    }
    card.querySelectorAll(':scope > .bdg, :scope > .bdg-more, :scope > details').forEach((x) => x.remove());
    const box = document.createElement('div');
    box.className = 'lv-prof-ach';
    box.innerHTML = achData.length ? achList(achData, false) : '<p class="lv-muted">Пока нет полученных достижений.</p>';
    card.appendChild(box);
  }

  // ---------- окно «Прогресс» ----------
  const TABS = [['home', 'Обзор'], ['mail', 'Почта'], ['ach', 'Достижения'], ['board', 'Рейтинг'], ['hist', 'История'], ['recap', 'Итоги 2026'], ['look', 'Оформление'], ['invite', 'Пригласить']];
  const SOON_TABS = new Set(['look', 'invite']); // пока в разработке: серые, с подсказкой
  // «Оформление» админу уже открыто: проверять награды до выхода (сервер отдаёт admin в /levels/me)
  const soon = (k) => SOON_TABS.has(k) && !(k === 'look' && ME && ME.admin);
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
    // фокус — внутрь окна: на выбранную вкладку, а если её не видно — на само окно
    requestAnimationFrame(() => { const b = ov.querySelector('.lv-tabs [aria-selected="true"]'); const card = ov.querySelector('.lv-card'); if (b) b.focus(); else if (card) { card.tabIndex = -1; card.focus(); } });
  }
  function closeProgress() {
    if (!ov) return;
    soonTip(null);
    ov.remove();
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderTabs() {
    const t = ov.querySelector('.lv-tabs');
    if (soon(tab)) tab = 'home';
    t.innerHTML = TABS.filter(([k]) => k !== 'recap' || ME.recap).map(([k, n]) => soon(k)
      ? `<button type="button" class="soon" data-soon-tab="${k}" aria-disabled="true" aria-label="${n} — в разработке">${n}</button>`
      : `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${n}${k === 'mail' && +ME.mail ? ` (${ME.mail})` : ''}</button>`).join('');
    t.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderTabs(); render(); }));
    t.querySelectorAll('[data-soon-tab]').forEach((b) => {
      const show = () => soonTip(b), hide = () => soonTip(null);
      b.addEventListener('mouseenter', show); b.addEventListener('mouseleave', hide); b.addEventListener('focus', show); b.addEventListener('blur', hide);
      b.addEventListener('click', () => { show(); clearTimeout(tipT); tipT = setTimeout(hide, 1500); });
    });
  }
  // подсказка «В разработке» над серой вкладкой (вкладки прокручиваются вбок, поэтому подсказка — поверх окна)
  function soonTip(b) {
    let tip = document.querySelector('.lv-soon-tip');
    if (!b) { if (tip) tip.remove(); return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'lv-soon-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
    tip.textContent = 'В разработке';
    const r = b.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(innerWidth - 120, r.left + r.width / 2 - 50)) + 'px';
    tip.style.top = r.bottom + 8 + 'px';
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
  // эмблемы достижений: [цвет 1, цвет 2, рисунок 24×24] — тот же вид, что у ачивок в профиле
  const ACH_ART = {
    first10: ['#F9A8D4', '#F28E4C', '<path d="M5 20v-9L4 4l4.5 3h7L20 4l-1 7v9z"/><path d="M9.5 12.5h.01M14.5 12.5h.01M11 15.5h2"/>'],
    founder: ['#67E8F9', '#0284C7', '<path d="M12 3c3 2 4.5 5.5 4.5 9.5L14.6 16H9.4l-1.9-3.5C7.5 8.5 9 5 12 3z"/><circle cx="12" cy="9.6" r="1.6"/><path d="M7.6 12.4L5 15v3.2l4.2-2.2M16.4 12.4L19 15v3.2l-4.2-2.2M10.6 18.5L12 21l1.4-2.5"/>'],
    first_steps: ['#86EFAC', '#16A34A', '<path d="M8 3.5c1.6 0 2.6 1.6 2.6 3.6S9.6 11 8 11 5.4 9.1 5.4 7.1 6.4 3.5 8 3.5zM7.4 13.5h1.8l.4 2.5c.2 1.4-.6 2.5-1.6 2.5s-1.8-1.1-1.6-2.5zM16 7.5c1.6 0 2.6 1.6 2.6 3.6S17.6 15 16 15s-2.6-1.9-2.6-3.9 1-3.6 2.6-3.6zM15.4 17.5h1.8l.4 1.5c.2 1.4-.6 1.5-1.6 1.5s-1.8-.1-1.6-1.5z"/>'],
    critic: ['#60A5FA', '#4F46E5', '<path d="M3.5 9L12 4.5 20.5 9z"/><path d="M6.5 11v6M10.2 11v6M13.8 11v6M17.5 11v6M4 20h16"/>'],
    reviewer: ['#5EEAD4', '#0D9488', '<path d="M4.5 19.5l2.6-7.6L15 4l5 5-7.9 7.9z"/><path d="M4.5 19.5l5.2-5.2"/><circle cx="11.2" cy="12.8" r="1.5"/>'],
    omnivore: ['#C084FC', '#7C3AED', '<circle cx="12" cy="12" r="8.2"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" fill="currentColor"/>'],
    finisher: ['#FCA5A5', '#DC2626', '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3M8.8 14.5l2.2 2.2 4.4-4.4"/>'],
    moved: ['#FDBA74', '#EA580C', '<path d="M4 12h12M12 6.5l5.5 5.5-5.5 5.5"/><path d="M20 5v14"/>'],
    tiermaker: ['#6EE7B7', '#059669', '<rect x="4" y="4.5" width="4" height="3.4" rx="1"/><rect x="4" y="10.3" width="4" height="3.4" rx="1"/><rect x="4" y="16.1" width="4" height="3.4" rx="1"/><path d="M11 6.2h9M11 12h6M11 17.8h3"/>'],
    masterpiece: ['#FDE68A', '#D97706', '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>'],
    soul: ['#A78BFA', '#6D28D9', '<circle cx="9" cy="8.2" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.6 5.2a3.2 3.2 0 0 1 0 6M17 13.6a5.5 5.5 0 0 1 3.5 5.9"/>'],
    chatter: ['#93C5FD', '#2563EB', '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>'],
    fan: ['#F9A8D4', '#DB2777', '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>'],
    popular: ['#FDBA74', '#EA580C', '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.6 3-5.6 3.6-9.2 2.6 1.5 4.4 4 4.4 6.6 1-.8 1.5-2 1.6-3.1 1.8 1.6 3.4 3.7 3.4 5.7 0 3.4-2.6 6-6.5 6z"/>'],
    recruiter: ['#A5B4FC', '#4338CA', '<circle cx="10" cy="8" r="3.4"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><path d="M18.5 7.5v6M15.5 10.5h6"/>'],
    auctioneer: ['#FCD34D', '#B45309', '<circle cx="12" cy="12" r="8.2"/><path d="M12 12V3.8M12 12l7.2 4M12 12l-7.2 4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'],
    lucky: ['#86EFAC', '#15803D', '<circle cx="9" cy="9" r="3.2"/><circle cx="15" cy="9" r="3.2"/><circle cx="9" cy="15" r="3.2"/><circle cx="15" cy="15" r="3.2"/><path d="M12 12l5 8"/>'],
    rhythm: ['#FDBA74', '#C2410C', '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.6 3-5.6 3.6-9.2 2.6 1.5 4.4 4 4.4 6.6 1-.8 1.5-2 1.6-3.1 1.8 1.6 3.4 3.7 3.4 5.7 0 3.4-2.6 6-6.5 6z"/><path d="M12 18a2.4 2.4 0 0 1-2.4-2.4c0-1.4 1.2-2.2 1.5-3.6 1.4.9 3.3 2 3.3 3.6A2.4 2.4 0 0 1 12 18z"/>'],
    questor: ['#5EEAD4', '#0F766E', '<rect x="4.5" y="4" width="15" height="16.5" rx="2.5"/><path d="M8 9l1.5 1.5L12 8M8 14.5l1.5 1.5L12 13.5M14 9.3h2.5M14 14.8h2.5"/>'],
    night: ['#818CF8', '#3730A3', '<path d="M5.5 4.5L8 7.2A6 6 0 0 1 16 7.2l2.5-2.7V14a6.5 6.5 0 0 1-13 0z"/><circle cx="9.4" cy="11.3" r="2"/><circle cx="14.6" cy="11.3" r="2"/><path d="M11.2 14.6l.8 1.4.8-1.4z"/>'],
    strict: ['#F87171', '#C81E1E', '<path d="M7 13.5V4.5H4.5v9z"/><path d="M7 13.5l3.6 6.5c1.4 0 2.3-1.1 2-2.4l-.7-3.6h5.3a2 2 0 0 0 2-2.4l-1.3-6A2 2 0 0 0 15.9 4.5H7"/>'],
    nope: ['#FCA5A5', '#B91C1C', '<circle cx="12" cy="12" r="8.2"/><path d="M6.2 6.2l11.6 11.6"/>'],
    comeback: ['#67E8F9', '#0E7490', '<path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2"/>'],
    event: ['#F0ABFC', '#A21CAF', '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3"/><path d="M12 12l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/>'],
    recap2026: ['#FDE68A', '#CA8A04', '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18v-3H3zM12 6v14M12 6c-1-2.5-4.5-2.5-4.5-.5S10 6 12 6zm0 0c1-2.5 4.5-2.5 4.5-.5S14 6 12 6z"/>'],
  };
  // пиксельная эмблема: клетка листа /art/ach.webp по порядку ключей ACH_ART (незнакомый код — как у «Критика»)
  const ACH_KEYS = Object.keys(ACH_ART);
  function achPx(code) {
    if (code === 'first10') return '<i class="lv-px vasyan"></i>'; // эмблема — сам Васян
    const i = ACH_KEYS.indexOf(code), k = i < 0 ? ACH_KEYS.indexOf('critic') : i;
    return `<i class="lv-px" style="--ax:${k % 6};--ay:${Math.floor(k / 6)}"></i>`;
  }
  const TIER = ['', 'бронза', 'серебро', 'золото'];
  function achCard(a, pin, show) {
    const art = ACH_ART[a.code] || ACH_ART.critic;
    const sub = a.got ? (a.next ? `${a.desc} · дальше ${a.have || 0} из ${a.next}` : a.desc) : a.next ? `${a.desc} · ${a.have || 0} из ${a.next}` : a.desc;
    const p = a.next && a.have != null ? pct(a.have, a.next) : null;
    return `<div class="lv-bi ${a.got ? 'got' : 'off'}" style="--c1:${art[0]};--c2:${art[1]}" title="${esc(a.title)}: ${esc(a.desc)}">`
      + `<span class="ic${a.got || !a.hidden ? ' px' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.got || !a.hidden ? art[2] : '<path d="M9.2 9a2.9 2.9 0 1 1 4.1 2.6c-.8.4-1.3 1.1-1.3 2v.6M12 17.5h.01"/>'}</svg>${a.got || !a.hidden ? achPx(a.code) : ''}</span>`
      + `<span><b>${esc(a.title)}${a.got && a.tiers > 1 ? ' · ' + TIER[a.tier] : ''}</b><small>${esc(sub)} · есть у ${a.rarity}%</small>${p != null && (!a.got || a.next) ? bar(p) : ''}`
      + `${pin && a.got ? `<button type="button" class="pin" data-pin="${esc(a.code)}" aria-pressed="${show.has(a.code)}">${show.has(a.code) ? 'В профиле ✓' : 'В профиль'}</button>` : ''}</span>`
      + `${a.got ? '<span class="ok" aria-label="Получено">✓</span>' : ''}</div>`;
  }
  // полученные сверху, из остальных выше те, до которых ближе; дальние — под «Ещё N»
  function achList(items, pin) {
    const show = new Set((ME && ME.prefs && ME.prefs.showcase) || []);
    const near = (a) => (a.next && a.have != null ? a.have / a.next : 0);
    const got = items.filter((a) => a.got), rest = items.filter((a) => !a.got).sort((x, y) => near(y) - near(x));
    const first = rest.slice(0, 6), more = rest.slice(6);
    return `<div class="lv-bdg">${got.concat(first).map((a) => achCard(a, pin, show)).join('')}</div>`
      + (more.length ? `<details class="lv-more"><summary>Ещё ${more.length}</summary><div class="lv-bdg">${more.map((a) => achCard(a, pin, show)).join('')}</div></details>` : '');
  }
  const medal = (a) => `<i class="lv-medal ${a.got ? 'lv-t' + (a.tiers > 1 ? a.tier : 0) : 'lv-tx'}">${a.got || !a.hidden ? esc(a.title.charAt(0)) : '?'}</i>`;
  const VIEWS = {
    async home() {
      await refreshMe();
      const m = ME, q = m.quests;
      const daily = q.daily.map((x) => `<div class="lv-q${x.done ? ' done' : ''}"><span>${esc(x.title)}</span><span class="xp">+${x.xp}</span>${bar(pct(x.progress, x.goal))}</div>`).join('');
      const w = q.weekly;
      const steps = m.steps ? `<div class="lv-box"><h3>Первые шаги</h3>${m.steps.map((s) => `<div class="lv-q${s.done ? ' done' : ''}"><span>${esc(s.title)}</span><span class="xp">+${s.xp}</span></div>`).join('')}</div>` : '';
      return `<div class="lv-hero"><span class="n">${m.level}</span><div class="r"><b>${esc(m.rank)}</b><span>${nf(m.xp)} опыта всего · до ${m.level + 1}-го уровня ещё ${nf(m.need - m.into)}</span>${bar(pct(m.into, m.need))}</div></div>
        ${m.event ? `<div class="lv-box"><h3>${esc(m.event.title)}</h3><p class="lv-muted">×${m.event.mult} опыта до ${new Date(m.event.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.</p></div>` : ''}
        <div class="lv-box"><div class="lv-streak"><span class="big">🔥 ${m.streak.days}</span><div><b>${m.streak.days ? `${plural(m.streak.days, 'день', 'дня', 'дней')} подряд` : 'Серии пока нет'}</b><p class="lv-muted">${m.streak.today ? 'Сегодня уже засчитан.' : 'Оцени что-нибудь или отреагируй другу, чтобы засчитать сегодня.'} Лучшая серия: ${m.streak.best}. «Заморозок»: ${m.streak.freezes} — спасают серию, если пропустишь день.</p></div></div></div>
        <div class="lv-box"><h3>Задания дня</h3>${daily || '<p class="lv-muted">Заданий пока нет.</p>'}<p class="lv-muted">За все три — ещё +${q.allXp}${q.allPaid ? ' (получено)' : ''}. Новые задания — завтра.</p></div>
        ${w ? `<div class="lv-box"><h3>Задание недели</h3><div class="lv-q${w.done ? ' done' : ''}"><span>${esc(w.title)} · ${w.progress} из ${w.goal}</span><span class="xp">+${w.xp}</span>${bar(pct(w.progress, w.goal))}</div></div>` : ''}
        ${steps}
        <p class="lv-muted">Опыт дают оценки, отзывы, тир-листы, реакции и комментарии друзьям, лоты. У каждого действия дневной лимит; удалишь — опыт уйдёт.</p>`;
    },
    async mail() {
      const d = await api('/levels/mail');
      VIEWS.mailIds = d.items.filter((g) => !g.read).map((g) => g.id);
      const when = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const rows = d.items.map((g) => `<div class="lv-letter${!g.read || ((g.xp || g.kind === 'vasyan') && !g.claimed) ? ' new' : ''}"><div class="top"><b>${esc(g.title)}</b><small>${when(g.at)}</small></div>
        ${g.body ? `<p>${esc(g.body)}</p>` : ''}
        ${g.kind === 'vasyan' ? `<div class="act"><span class="lv-vy" aria-hidden="true"></span>${g.claimed ? '<span class="lv-muted">Васян уже у тебя — гуляет внизу экрана</span>' : `<button type="button" class="lv-btn" data-claim="${esc(g.id)}">Забрать котика</button>`}</div>` : ''}
        ${g.xp ? `<div class="act"><span class="gift">+${g.xp} опыта</span>${g.claimed ? '<span class="lv-muted">Забрано</span>' : `<button type="button" class="lv-btn" data-claim="${esc(g.id)}">Забрать</button>`}${g.until && !g.claimed ? `<span class="lv-muted">до ${when(g.until)}</span>` : ''}</div>` : ''}</div>`).join('');
      return `<p class="lv-muted">Сюда приходят подарки от администрации и письма о новых уровнях.</p><div class="lv-mail">${rows || '<p class="lv-muted">Писем пока нет.</p>'}</div><p class="lv-err" id="lvMailMsg" role="status"></p>`;
    },
    async ach() {
      const d = await api('/levels/achievements');
      const got = d.items.filter((a) => a.got).length;
      const show = new Set(ME.prefs.showcase || []);
      return `<p class="lv-muted">${got ? `Получено ${got} из ${d.items.length}. Три любимых можно показать в профиле.` : `Пока ни одного из ${d.items.length} — первое уже близко: ниже видно, сколько осталось.`}</p>${achList(d.items, true)}`;
    },
    async board() {
      const scope = VIEWS.scope || 'friends';
      const d = await api('/levels/board?scope=' + scope);
      if (scope === 'friends' && d.top.filter((x) => !x.me).length === 0) {
        return `<div class="lv-seg" role="group" aria-label="Чей рейтинг"><button type="button" data-scope="friends" aria-pressed="true">Друзья</button><button type="button" data-scope="all" aria-pressed="false">Весь сайт</button></div>
          <div class="lv-box"><h3>Пока соревноваться не с кем</h3><p class="lv-muted">Добавь друзей через кнопку «Друзья» в шапке — тут появится, кто из вас набрал больше опыта за неделю. А пока загляни во «Весь сайт».</p></div>`;
      }
      const rows = d.top.map((x) => `<div class="${x.me ? 'me' : ''}"><em>${x.place}</em><span>${esc(x.username)}${x.level ? ` · ур. ${x.level}` : ''}</span><b>${nf(x.week)}</b></div>`).join('');
      return `<div class="lv-seg" role="group" aria-label="Чей рейтинг"><button type="button" data-scope="friends" aria-pressed="${scope === 'friends'}">Друзья</button><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">Весь сайт</button></div>
        <div class="lv-box"><h3>Опыт за неделю</h3><div class="lv-board">${rows || '<p class="lv-muted">На этой неделе пока никто не набрал опыта.</p>'}</div>
        ${d.best ? `<p class="lv-muted">Лучший прогресс: ${esc(d.best.username)}${d.best.growth != null ? ` — +${d.best.growth}% к прошлой неделе` : ' — новичок недели'}.</p>` : ''}
        <p class="lv-muted">Рейтинг обнуляется в понедельник.</p></div>`;
    },
    async look() {
      await refreshMe();
      const m = ME, u = m.unlocked, p = m.prefs;
      // уровень, на котором открывается награда (для подписи на закрытой кнопке)
      const at = (id) => (m.rewards.find((r) => r.id === id) || {}).level || '';
      const lock = (id) => `<small class="lv-lock">${at(id)} ур.</small>`;
      const opt = (attr, val, cur, open, need, inner) => `<button type="button" data-${attr}="${val}" aria-pressed="${cur === val}"${val && !open ? ` disabled title="Откроется на ${at(need)}-м уровне"` : ''}>${inner}${val && !open ? lock(need) : ''}</button>`;
      const FR = { '': 'Без рамки', frame1: 'Казуал', frame5: 'Пиксель', frame2: 'Неон', frame3: 'Переливы', frame4: 'Мастер', frame6: 'Легенда' };
      const BG = { '': 'Без фона', dawn: 'Закат', night: 'Ночь', city: 'Город', forest: 'Лес', ember: 'Уют', legend: 'Легенда' };
      const NK = { '': 'Обычный', shadow: 'С тенью', rainbow: 'Радужный' };
      const FX = { '': 'Без эффекта', stars: 'Звездопад', confetti: 'Конфетти' };
      const frames = Object.keys(FR).map((f) => opt('frame', f, p.frame, u.frames.includes(f), f, `${f ? `<span class="dot lv-frame-${f}"></span>` : ''}${FR[f]}`)).join('');
      const colors = ['', ...Object.keys(m.colors)].map((c) => opt('color', c, p.color, u.colors.includes(c), c === 'gold' ? 'gold' : 'colors', c ? `<span class="dot" style="background:${m.colors[c]}" aria-label="${c}"></span>` : 'Обычный')).join('');
      const nicks = Object.keys(NK).map((n) => opt('nick', n, p.nick, u.nicks.includes(n), n, NK[n])).join('');
      const bgs = ['', ...m.bgs].map((g) => opt('bg', g, p.bg, u.bgs.includes(g), g === 'legend' ? 'frame6' : 'bgs', `${g ? `<span class="sw lv-bg-${g}"></span>` : ''}${BG[g]}`)).join('');
      const fxs = Object.keys(FX).map((f) => opt('fx', f, p.fx, u.fx.includes(f), f, FX[f])).join('');
      const pet = [['', 'Не показывать'], ['1', 'Показывать']].map(([v, t]) => opt('pet', v, p.pet ? '1' : '', u.pet, 'pet', t)).join('');
      const rw = m.rewards.map((r) => { const got = m.level >= r.level; return `<div class="${got ? 'got' : ''}"><span class="l">${r.level}</span><span class="${got ? '' : 'no'}">${esc(r.title)}</span>${got ? '<span class="ok" aria-label="Открыто">✓</span>' : ''}</div>`; }).join('');
      const tg = (k, label, on) => `<label class="lv-tg"><span>${label}</span><input type="checkbox" data-tg="${k}"${on ? ' checked' : ''}></label>`;
      // предпросмотр: так профиль увидят другие
      const acc = read('ocenshik.user.v1') || {};
      const nm = acc.username || acc.name || 'Ты';
      const crown = p.frame === 'frame4' || p.frame === 'frame6' ? '<img class="lv-crown" src="/art/crown.svg" width="44" height="30" alt="">' : '';
      const prev = `<div class="lv-lk" aria-label="Так твой профиль увидят другие">
          <div class="lv-lk-ban${p.bg ? ' lv-bg-' + p.bg : ''}">${p.fx === 'stars' ? '<i class="lv-fx-stars" aria-hidden="true"></i>' : ''}</div>
          <div class="lv-lk-row">
            <span class="lv-lk-ava${p.frame ? ' lv-frame-' + p.frame : ''}">${esc(nm.charAt(0).toUpperCase())}${crown}${p.pet ? '<i class="lv-pet" aria-hidden="true"></i>' : ''}</span>
            <div class="lv-lk-who"><b class="lv-lk-name${p.nick ? ' lv-nick-' + p.nick : ''}"${p.color && m.colors[p.color] ? ` style="color:${m.colors[p.color]}"` : ''}>${esc(nm)}</b>${u.rankChip ? `<span class="lv-chip">${esc(m.rank)}</span>` : ''}${p.fx === 'confetti' ? '<span class="lv-muted">+ конфетти при открытии профиля</span>' : ''}</div>
          </div>
        </div>`;
      return `${m.admin ? '<p class="lv-adm">Вкладка пока видна только админам. Тебе открыто всё оформление, чтобы проверить его до выхода; другие увидят твой выбор в профиле.</p>' : ''}
        <div class="lv-box">${prev}</div>
        <div class="lv-box"><h3>Рамка аватара</h3><div class="lv-pick">${frames}</div></div>
        <div class="lv-box"><h3>Ник в профиле</h3><div class="lv-pick">${colors}</div><div class="lv-pick" style="margin-top:8px">${nicks}</div></div>
        <div class="lv-box"><h3>Фон профиля</h3><div class="lv-pick">${bgs}</div></div>
        <div class="lv-box"><h3>Эффект и котик</h3><div class="lv-pick">${fxs}</div><p class="lv-muted" style="margin:10px 0 6px">Котик Васян рядом с аватаром</p><div class="lv-pick">${pet}</div></div>
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
          if (r.vasyan) vasyanOwn(true);
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
      b.querySelectorAll('[data-nick]').forEach((x) => x.addEventListener('click', () => save({ nick: x.dataset.nick })));
      b.querySelectorAll('[data-fx]').forEach((x) => x.addEventListener('click', () => save({ fx: x.dataset.fx })));
      b.querySelectorAll('[data-pet]').forEach((x) => x.addEventListener('click', () => save({ pet: x.dataset.pet === '1' })));
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
        pic: '<div class="lv-tq"><div class="ok"><i></i>Поставь 2 оценки<em>+15</em></div><div class="ok"><i></i>Отреагируй на 3 оценки<em>+15</em></div><div><i></i>Напиши отзыв<em>+15</em></div></div>',
        h: 'Задания и серия',
        t: 'Каждый день три задания. Заходи подряд — растёт серия, а «заморозка» спасёт, если пропустишь день.',
      },
      {
        pic: `<div class="lv-tmedals">${['critic', 'masterpiece', 'soul'].map((c) => `<span class="lv-bi got" style="--c1:${ACH_ART[c][0]};--c2:${ACH_ART[c][1]};padding:0;border:0;background:none"><span class="ic px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ACH_ART[c][2]}</svg>${achPx(c)}</span></span>`).join('')}</div>`,
        h: 'Достижения',
        t: 'Бронза, серебро и золото за оценки, тир-листы и общение. Три любимых видны у тебя в профиле.',
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
