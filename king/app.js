// Казуал Хаб: «Царь Горы» — турниры по ссылке (/king/, сервер — functions/_lib/king.js).
// Без ?c= — новый турнир и свои турниры (удалить — кнопкой в строке, второе нажатие подтверждает). Участники — список:
// по названию (Enter или «Добавить»), вставкой сразу нескольких строк, «Название | https://картинка» или «Из моих оценок».
// Счётчик говорит, сколько ещё нужно: сетке — ровно её размер, горе — хотя бы двое. Черновик живёт до закрытия вкладки.
// С ?c=<код> — турнир: до начала — список с правкой; потом бой (выбранный — рамка цветом акцента и короткая анимация,
// проигравший гаснет, потом следующий бой), голоса, очередь или сетка, последние бои, карточка победителя с конфетти.
// Пульт ведущего: добавить и убрать участников, правила, переименовать (карандаш у названия), удалить турнир.
// Перерисовка кусками (put): кусок, у которого разметка не поменялась, не трогаем — поле ввода, фокус и анимации остаются.
(() => {
  const U = window.CasualUtil || {};
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = U.read || ((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } });
  const plural = U.plural || ((n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; });
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const T = (t) => (window.CasualLang && window.CasualLang.t ? window.CasualLang.t(t) : t);
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const view = document.getElementById('view');
  const code = (/^[A-Za-z0-9]{12}$/.exec(new URLSearchParams(location.search).get('c') || '') || [''])[0];
  // как на сервере (KING и IMG_RE в functions/_lib/king.js)
  const HILL_MAX = 64, SIZES = [4, 8, 16, 32], NAME = 80;
  const IMG_OK = /^(https:\/\/[^\s"'<>()\\]{8,590}|\/wheel\/hub\/[\w\/.-]{1,120}\.(?:gif|png|webp|jpe?g)|\/art\/[\w\/.-]{1,120}\.(?:svg|png|webp))$/;
  const TIMERS = [[0, 'без таймера'], [15, '15 с'], [30, '30 с'], [60, '1 мин'], [120, '2 мин']];
  async function api(method, path, body, etag) {
    const t = token();
    const r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(etag ? { 'if-none-match': etag } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 304) return { same: true };
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(d.error || 'Не получилось, попробуй ещё раз'); er.status = r.status; throw er; }
    return { d, etag: r.headers.get('etag') || '' };
  }

  const css = document.createElement('style');
  css.textContent = `
.kg { display: grid; gap: 18px; }
.kg .card { animation: kg-in .24s cubic-bezier(.2, .8, .2, 1) backwards; }
@keyframes kg-in { from { opacity: 0; transform: translateY(8px); } }
.kg-lead { margin: 0 0 18px; max-width: 72ch; font-size: 14px; color: var(--ink-2); text-wrap: pretty; }
.kg-f { display: grid; gap: 6px; margin: 0 0 16px; font-size: 13px; font-weight: 700; color: var(--ink-2); }
.kg-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.kg-seg button { height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: border-color .16s, background-color .16s; }
.kg-seg button[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--panel)); }
.kg-seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.kg-hint { margin: 0; font-size: 12.5px; font-weight: 500; line-height: 1.45; color: var(--ink-3); text-wrap: pretty; }
.kg-msg { margin: 12px 0 0; font-size: 13px; font-weight: 600; color: var(--bad-ink, #E5534B); }
.kg-msg:empty { display: none; }
.kg-msg.ok { color: var(--ink-2); }
.kg-acts { display: flex; flex-wrap: wrap; gap: 8px; }
/* обложки: постеры обычно 2:3, рамка 3:4 и object-fit: cover; нет картинки или она не загрузилась — плитка с буквой */
.kg-pic { display: block; flex: none; width: 32px; height: auto; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 6px; background: color-mix(in srgb, var(--ink) 7%, transparent); }
span.kg-pic { display: grid; place-items: center; overflow: hidden; background: color-mix(in srgb, var(--accent) 15%, var(--panel)); color: color-mix(in srgb, var(--accent) 62%, var(--ink)); font-family: var(--font-display); font-size: 17px; font-weight: 800; line-height: 1; user-select: none; }
.kg-pic.xs { width: 24px; border-radius: 4px; font-size: 13px; }
.kg-pic.lg { width: min(200px, 100%); border-radius: 14px; font-size: clamp(40px, 10vw, 76px); }
.kg-pic.xl { width: min(220px, 58vw); border-radius: 16px; font-size: clamp(56px, 16vw, 96px); }
span.kg-pic.blank { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
/* участники: счётчик, полоса заполнения сетки, список с крестиками */
.kg-pf { display: grid; gap: 10px; margin: 0 0 14px; }
.kg-pf-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; font-size: 13px; font-weight: 700; color: var(--ink-2); }
.kg-count { display: inline-flex; align-items: center; gap: 7px; color: var(--ink); font-variant-numeric: tabular-nums; }
.kg-count::before { content: ""; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--mid); }
.kg-count.ok::before { background: var(--good); }
.kg-count.over::before { background: var(--bad); }
.kg-meter { height: 6px; border-radius: 99px; background: color-mix(in srgb, var(--ink) 9%, transparent); overflow: hidden; }
.kg-meter i { display: block; width: var(--w, 0%); height: 100%; border-radius: inherit; background: var(--mid); }
.kg-meter.ok i { background: var(--good); }
.kg-meter.over i { background: var(--bad); }
.kg-people { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 6px; }
.kg-person { display: grid; grid-template-columns: 1.7em auto minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 52px; padding: 4px 4px 4px 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); color: var(--ink); font-size: 14px; font-weight: 600; }
.kg-person.new { animation: kg-row-in .26s cubic-bezier(.2, .8, .2, 1) backwards; }
@keyframes kg-row-in { from { opacity: 0; transform: translateY(6px) scale(.98); } }
.kg-num { text-align: right; font-size: 12px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.kg-pn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kg-person > :last-child:not(button) { grid-column: 3 / -1; }
.kg-x, .kg-ico { display: inline-grid; place-items: center; flex: none; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--ink-3); cursor: pointer; transition: background-color .15s, color .15s; }
.kg-x:hover { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad-ink, var(--bad)); }
.kg-ico:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
.kg-x:focus-visible, .kg-ico:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.kg-x:disabled { opacity: .4; cursor: default; }
.kg-empty { margin: 0; padding: 18px 14px; border: 1px dashed var(--line); border-radius: 12px; font-size: 13.5px; font-weight: 500; color: var(--ink-2); text-align: center; text-wrap: pretty; }
.kg-adder { display: grid; gap: 8px; margin: 0 0 16px; }
.kg-addrow { display: flex; flex-wrap: wrap; gap: 8px; }
.kg-addrow .inp { flex: 1 1 220px; width: auto; }
.kg-addrow .btn { flex: none; }
.kg-go { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.kg-go .kg-hint { flex: 1 1 240px; }
/* шапка турнира */
.kg-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; }
.kg-head-main { flex: 1 1 260px; min-width: 0; }
.kg-title { display: flex; align-items: flex-start; gap: 2px; }
.kg-title h2 { min-width: 0; font-size: 22px; line-height: 1.3; overflow-wrap: anywhere; text-wrap: balance; }
.kg-title .kg-ico { width: 32px; height: 32px; margin-top: -1px; }
.kg-rename { display: flex; flex-wrap: wrap; gap: 8px; }
.kg-rename .inp { flex: 1 1 220px; width: auto; height: 40px; }
.kg-rename .btn { height: 40px; }
.kg-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.kg-tags span { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); font-size: 12px; font-weight: 700; color: var(--ink-2); }
.kg-tags .live { background: color-mix(in srgb, var(--good) 16%, transparent); color: color-mix(in srgb, var(--good) 72%, var(--ink)); }
.kg-tags .live::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
/* бой: две карточки, выбор — рамка цветом акцента; победитель на миг подрастает, проигравший гаснет и отъезжает */
.kg-stage { margin-top: 16px; }
.kg-stage:empty { display: none; }
.kg-bout { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 14px; align-items: stretch; max-width: 640px; margin: 0 auto; }
.kg-side { position: relative; isolation: isolate; display: grid; gap: 10px; align-content: start; justify-items: center; min-width: 0; padding: 14px 12px 12px; border: 2px solid var(--line); border-radius: 18px; background: var(--panel); color: var(--ink); font: inherit; text-align: center; overflow: hidden; transition: border-color .18s, box-shadow .18s, transform .2s cubic-bezier(.2, .8, .2, 1), opacity .25s; }
button.kg-side { cursor: pointer; -webkit-tap-highlight-color: transparent; }
@media (hover: hover) { button.kg-side:not(:disabled):hover { border-color: color-mix(in srgb, var(--accent) 65%, var(--line)); transform: translateY(-3px); box-shadow: 0 18px 32px -24px color-mix(in srgb, var(--ink) 70%, transparent); } }
button.kg-side:not(:disabled):active { transform: scale(.97); border-color: var(--accent); transition-duration: .06s; }
button.kg-side:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
button.kg-side:disabled { cursor: default; }
.kg-side > b { font-size: 16px; line-height: 1.25; overflow-wrap: anywhere; }
.kg-king { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; color: var(--ink-2); }
.kg-side em { font-style: normal; font-size: 13px; font-weight: 800; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.kg-bar { position: absolute; inset: auto 0 0 0; z-index: -1; height: var(--p, 0%); background: color-mix(in srgb, var(--accent) 13%, transparent); transition: height .4s cubic-bezier(.2, .8, .2, 1); }
.kg-you { padding: 2px 9px; border-radius: 999px; background: var(--accent); color: var(--on-accent, #fff); font-size: 11.5px; font-weight: 800; }
.kg-side.on { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 24%, transparent); }
.kg-side.win { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--panel)); box-shadow: 0 0 0 3px var(--accent), 0 22px 40px -28px var(--accent); transition: none; }
.kg-side.lose { opacity: .42; filter: grayscale(.85); transform: scale(.94); transition: none; }
.kg-side.lose.a { transform: translateX(-6px) scale(.94); }
.kg-side.lose.b { transform: translateX(6px) scale(.94); }
.kg-won { position: absolute; top: 8px; left: 50%; z-index: 2; display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px 3px 8px; border-radius: 999px; background: var(--accent); color: var(--on-accent, #fff); font-size: 12px; font-weight: 800; white-space: nowrap; transform: translateX(-50%); }
.kg-vs { align-self: center; font-family: var(--font-display); font-size: 22px; font-weight: 800; color: var(--ink-3); transition: opacity .3s; }
.kg-res .kg-vs { opacity: .3; }
.kg-bout.wait .kg-side { opacity: .7; }
.kg-decide .kg-side.win { animation: kg-win .55s cubic-bezier(.2, .8, .2, 1); }
.kg-decide .kg-side.lose { animation: kg-lose .5s cubic-bezier(.4, 0, .2, 1) .06s backwards; }
.kg-decide .kg-won { animation: kg-badge .32s cubic-bezier(.2, .8, .2, 1) .14s backwards; }
@keyframes kg-win { 0% { transform: none; box-shadow: 0 0 0 0 var(--accent); } 45% { transform: scale(1.045); } 100% { transform: none; } }
@keyframes kg-ring { from { box-shadow: 0 0 0 0 var(--accent); } }
@keyframes kg-lose { from { opacity: 1; filter: none; transform: none; } }
@keyframes kg-badge { from { opacity: 0; transform: translate(-50%, -6px) scale(.7); } }
.kg-enter .kg-side.in { animation: kg-side-in .4s cubic-bezier(.2, .8, .2, 1) backwards; }
.kg-enter .kg-side.in.b { animation-delay: .07s; }
@keyframes kg-side-in { from { opacity: 0; transform: translateY(14px) scale(.96); } }
/* подписи под боем: кто что решает, таймер голосования; между боями — итог и полоса до следующего боя (без «0 с») */
.kg-note { margin: 14px auto 0; max-width: 560px; font-size: 13.5px; color: var(--ink-2); text-align: center; text-wrap: pretty; }
.kg-note b { color: var(--ink); font-variant-numeric: tabular-nums; }
.kg-clock { font-weight: 700; color: var(--ink); }
.kg-wait { display: grid; justify-items: center; gap: 8px; max-width: 440px; margin: 16px auto 0; text-align: center; }
.kg-wait p { margin: 0; font-size: 15px; color: var(--ink-2); text-wrap: balance; }
.kg-wait p b { color: var(--ink); }
.kg-score { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); font-size: 12.5px; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.kg-line { display: block; width: min(240px, 80%); height: 4px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 9%, transparent); overflow: hidden; }
.kg-line i { display: block; height: 100%; background: var(--accent); transform-origin: 0 50%; animation: kg-fill 4s linear both; }
@keyframes kg-fill { from { transform: scaleX(0); } }
.kg-wait small { font-size: 12.5px; font-weight: 700; color: var(--ink-3); }
.kg-ctl { justify-content: center; margin-top: 12px; }
/* победитель турнира */
.kg-champ { display: grid; justify-items: center; gap: 8px; padding: 4px 0 2px; text-align: center; }
.kg-champ-art { position: relative; margin-top: 30px; }
.kg-champ-art .kg-pic { box-shadow: 0 0 0 3px var(--accent), 0 26px 50px -30px color-mix(in srgb, var(--accent) 70%, var(--ink)); }
.kg-crown { position: absolute; left: 50%; top: -34px; width: 64px; height: auto; transform: translateX(-50%) rotate(-8deg); filter: drop-shadow(0 4px 5px rgb(0 0 0 / .28)); }
.kg-champ .label { margin-top: 10px; }
.kg-champ-name { max-width: 100%; font-family: var(--font-display); font-size: clamp(32px, 7vw, 52px); font-weight: 800; line-height: 1.02; overflow-wrap: anywhere; text-wrap: balance; }
.kg-stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
.kg-stat { display: grid; justify-items: center; align-content: start; gap: 3px; min-width: 104px; max-width: 210px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel-2); }
.kg-stat b { font-family: var(--font-display); font-size: 30px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.kg-stat span { font-size: 12px; font-weight: 600; color: var(--ink-2); }
.kg-stat small { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--ink-3); }
.kg-champ.kg-enter .kg-champ-art { animation: kg-champ-in .6s cubic-bezier(.2, .8, .2, 1) backwards; }
.kg-champ.kg-enter .kg-crown { animation: kg-crown-in .6s cubic-bezier(.3, 1.4, .5, 1) .3s backwards; }
.kg-champ.kg-enter :is(.kg-champ-name, .kg-stats) { animation: kg-in .4s cubic-bezier(.2, .8, .2, 1) .2s backwards; }
@keyframes kg-champ-in { from { opacity: 0; transform: translateY(16px) scale(.9); } }
@keyframes kg-crown-in { from { opacity: 0; transform: translate(-50%, -22px) rotate(-30deg) scale(.5); } }
.kg-fx { position: fixed; inset: 0; z-index: 70; width: 100%; height: 100%; pointer-events: none; }
/* очередь, выбывшие, рекорд, последние бои */
.kg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 18px; }
.kg-block { display: grid; gap: 8px; align-content: start; min-width: 0; }
.kg-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 13.5px; }
.kg-list li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 40px; padding: 3px 4px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
.kg-ln { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kg-list li.out { color: var(--ink-3); }
.kg-list li.out .kg-pic { filter: grayscale(1); opacity: .6; }
.kg-list .meta { display: inline-flex; align-items: center; gap: 6px; padding-right: 4px; font-size: 12px; font-weight: 700; color: var(--ink-3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.kg-list .meta .kg-x { width: 30px; height: 30px; margin-right: -4px; }
.kg-scroll { max-height: 352px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.kg-best { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; }
.kg-best b { display: block; overflow-wrap: anywhere; }
.kg-best small { font-size: 12.5px; color: var(--ink-2); }
.kg-none { margin: 0; font-size: 13.5px; color: var(--ink-3); }
/* сетка */
.kg-rounds { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(170px, 1fr); gap: 12px; margin-top: 10px; overflow-x: auto; padding: 2px 2px 8px; scrollbar-width: thin; }
.kg-round { display: grid; gap: 8px; align-content: space-around; min-width: 0; }
.kg-round h4 { margin: 0; font-size: 12px; font-weight: 700; color: var(--ink-3); }
.kg-m { display: grid; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); font-size: 12.5px; }
.kg-m.now { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
.kg-mr { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 7px; min-height: 36px; padding: 2px 6px 2px 2px; border-radius: 9px; }
.kg-mr > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kg-mr.w { background: color-mix(in srgb, var(--good) 16%, transparent); font-weight: 800; }
.kg-mr.l, .kg-mr.tbd { color: var(--ink-3); }
.kg-mr.l .kg-pic { filter: grayscale(1); opacity: .55; }
/* выбор участников из своих оценок «Мнения» */
.kg-pk { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in srgb, var(--ink) 3%, var(--panel)); }
.kg-pk-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.kg-pk-top .inp { flex: 1 1 180px; min-width: 0; height: 36px; }
.kg-pk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; max-height: 390px; overflow-y: auto; padding: 2px; scrollbar-width: thin; }
.kg-pk-it { position: relative; display: grid; gap: 6px; align-content: start; padding: 6px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12.5px; font-weight: 700; text-align: left; cursor: pointer; transition: border-color .15s, background-color .15s; }
.kg-pk-it[hidden] { display: none; }
.kg-pk-it .kg-pic { width: 100%; border-radius: 8px; font-size: 30px; }
.kg-pk-n { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.25; overflow-wrap: anywhere; }
.kg-pk-it b { position: absolute; top: 10px; right: 10px; padding: 1px 6px; border-radius: 6px; background: rgb(0 0 0 / .66); color: #fff; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.kg-pk-it i { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--ink-3); }
.kg-pk-it:not(:disabled):hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
.kg-pk-it[aria-pressed="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel)); }
.kg-pk-it[aria-pressed="true"]::after { content: '✓'; position: absolute; top: 10px; left: 10px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: var(--accent); color: var(--on-accent, #fff); font-size: 12px; font-weight: 800; }
.kg-pk-it.in { cursor: default; opacity: .62; }
/* свои турниры */
.kg-mine li { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 8px 6px 8px 12px; }
.kg-mine a { min-width: 0; color: var(--ink); font-weight: 700; text-decoration: none; overflow-wrap: anywhere; }
.kg-mine a:hover { color: var(--accent); }
.kg-mine .meta { grid-column: 1; padding: 0; white-space: normal; font-weight: 600; }
.kg-mine .kg-del { grid-column: 2; grid-row: 1 / span 2; }
.kg-del:not([data-armed]) { width: 36px; padding: 0; }
/* пульт ведущего */
.kg-own > .label { margin-bottom: 14px; }
.kg-own-h { margin: 0; font-size: 14px; font-weight: 700; color: var(--ink); }
.kg-own-add { display: grid; gap: 6px; margin: 0 0 18px; }
.kg-own-add .kg-adder { margin: 4px 0 0; }
.kg-own-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; padding-top: 14px; border-top: 1px solid var(--line); }
.kg-own-foot .kg-hint { flex: 1 1 220px; }
@media (max-width: 520px) {
  .kg-bout { gap: 6px; }
  .kg-side { padding: 10px 6px 8px; border-radius: 14px; gap: 8px; }
  .kg-side > b { font-size: 14px; }
  .kg-vs { font-size: 15px; }
  .kg-won { top: 6px; padding: 2px 8px 2px 6px; font-size: 11px; }
  .kg-title h2 { font-size: 19px; }
  .kg-stat { min-width: 86px; padding: 8px 10px; }
  .kg-stat b { font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .kg-line { display: none; }
  .kg .card, .kg-person.new, .kg-decide *, .kg-enter, .kg-enter * { animation: none !important; }
  .kg-side, .kg-bar, .kg-seg button, .kg-pk-it { transition: none; }
}
`;
  document.head.appendChild(css);
  view.classList.add('kg');

  const svg = (w, path, sw) => `<svg viewBox="0 0 16 16" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="${sw || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const ICON = {
    x: svg(14, '<path d="M4 4l8 8M12 4l-8 8"/>', 2),
    pen: svg(15, '<path d="M10.5 2.5l3 3L6 13H3v-3z"/><path d="M9 4l3 3"/>', 1.6),
    link: svg(14, '<path d="M6.5 9.5l3-3"/><path d="M7.5 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1"/><path d="M8.5 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1"/>'),
    trash: svg(15, '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/>', 1.6),
    check: svg(12, '<path d="M3 8.5l3.2 3L13 4.5"/>', 2.4),
  };
  // пиксельная корона — та же, что в значке «Царя Горы» (/art/logo/king.svg), без фона
  const CROWN_PX = '<rect x="6" y="11" width="3" height="9" fill="#F2C230"/><rect x="15" y="9" width="3" height="11" fill="#F2C230"/><rect x="24" y="11" width="3" height="9" fill="#F2C230"/><rect x="9" y="14" width="3" height="6" fill="#F2C230"/><rect x="21" y="14" width="3" height="6" fill="#F2C230"/><rect x="12" y="16" width="3" height="4" fill="#F2C230"/><rect x="18" y="16" width="3" height="4" fill="#F2C230"/><rect x="6" y="18" width="21" height="2" fill="#D9A21B"/><rect x="6" y="9" width="3" height="2" fill="#E5534B"/><rect x="15" y="7" width="3" height="2" fill="#5B74FF"/><rect x="24" y="9" width="3" height="2" fill="#E5534B"/><rect x="15" y="18" width="3" height="2" fill="#E5534B"/>';
  const crown = (cls, w) => `<svg class="${cls}" viewBox="5 6 23 15" width="${w}" height="${Math.round((w * 15) / 23)}" shape-rendering="crispEdges" aria-hidden="true">${CROWN_PX}</svg>`;

  // ---------- общее: перерисовка кусками, картинки, названия ----------
  // фокус: поле ввода — с текстом и курсором, кнопка — та же по data-*, чтобы клавиатура не теряла место
  const focusSel = (a) => {
    for (const k of ['k', 'del', 'rule', 'set', 'pkTab', 'delI', 'rm']) {
      if (a.dataset && a.dataset[k] != null) {
        const attr = 'data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        return `[${attr}="${CSS.escape(a.dataset[k])}"]${a.dataset.v != null ? `[data-v="${CSS.escape(a.dataset.v)}"]` : ''}`;
      }
    }
    return '';
  };
  function put(el, html) {
    if (!el || el._html === html) return false;
    const a = document.activeElement, inside = !!a && a !== document.body && el.contains(a);
    const field = inside && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.id ? { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
    const btn = inside && !field ? focusSel(a) : '';
    const keep = [...el.querySelectorAll('[data-keep]')].map((i) => [i.id, i.value]);
    const grid = el.querySelector('.kg-pk-grid'), top = grid ? grid.scrollTop : 0;
    el.innerHTML = html;
    el._html = html;
    if (el.tagName === 'SECTION') el.hidden = !html;
    for (const [id, v] of keep) { const i = id && v && el.querySelector('#' + id); if (i) i.value = v; }
    if (field) {
      const i = el.querySelector('#' + field.id);
      if (i) { i.value = field.v; i.focus({ preventScroll: true }); try { i.setSelectionRange(field.s, field.e); } catch (e) {} }
    } else if (btn) { const b = el.querySelector(btn); if (b) b.focus({ preventScroll: true }); }
    const g = el.querySelector('.kg-pk-grid');
    if (g && top) g.scrollTop = top;
    return true;
  }
  const cleanName = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME);
  const letter = (n) => ([...String(n || '').trim()][0] || '?').toUpperCase();
  const dead = new Set(); // ссылки, которые не загрузились: дальше сразу буква
  // «@» — своя картинка участника (обложка из «Мнения»), её отдаёт сервер турнира
  const imgUrl = (x) => (x.img === '@' ? (code && x.id ? `/api/king/img?c=${code}&p=${encodeURIComponent(x.id)}` : '') : x.img || '');
  // size: xs (сетка), без размера (списки), lg (бой), xl (победитель); lazy — в списках и сетках, в бою картинка нужна сразу
  function pic(x, size, lazy) {
    const src = imgUrl(x), cls = 'kg-pic' + (size ? ' ' + size : '');
    if (!src || dead.has(src)) return `<span class="${cls}" aria-hidden="true">${esc(letter(x.n))}</span>`;
    return `<img class="${cls}" src="${esc(src)}" alt="" data-ini="${esc(letter(x.n))}"${lazy ? ' loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer">`;
  }
  // строка списка: «Название» или «Название | https://картинка» (картинка — последний «|», если после него ссылка)
  function parseLine(line) {
    const s = String(line || ''), i = s.lastIndexOf('|');
    if (i > 0) {
      const img = s.slice(i + 1).trim();
      if (IMG_OK.test(img)) return { n: cleanName(s.slice(0, i)), img };
      if (/^(https?:)?\/\//i.test(img)) return { n: cleanName(s.slice(0, i)), img: '', bad: true };
    }
    return { n: cleanName(s), img: '' };
  }
  // сколько участников нужно: сетке — ровно её размер, горе — хотя бы двое (то же правило на сервере: bracketErr, cleanConfig)
  function need(n, fmt, size) {
    if (fmt === 'bracket') {
      if (n < size) return { cls: 'need', text: T(`${n} из ${size} · нужно ещё ${size - n}`), hint: T(`Добавь ещё ${size - n}, чтобы заполнить сетку на ${size}.`) };
      if (n > size) return { cls: 'over', text: T(`${n} из ${size} · лишних ${n - size}`), hint: T(`Убери ${n - size}: в сетку на ${size} помещается ровно ${size}.`) };
      return { cls: 'ok', text: T(`${n} из ${size} · сетка заполнена`), hint: '' };
    }
    if (n < 2) return { cls: 'need', text: T(`${n} · нужно хотя бы 2`), hint: T('Нужно хотя бы двое участников.') };
    return { cls: 'ok', text: T(`${n} ${plural(n, 'участник', 'участника', 'участников')}`), hint: '' };
  }
  const countHTML = (q, n, fmt, size) => `<div class="kg-pf-head"><span>${T('Участники')}</span><span class="kg-count ${q.cls}">${esc(q.text)}</span></div>${fmt === 'bracket' ? `<div class="kg-meter ${q.cls}" aria-hidden="true"><i style="--w:${Math.min(100, Math.round((n / size) * 100))}%"></i></div>` : ''}`;
  const personHTML = (x, i, attr, fresh) => `<li class="kg-person${fresh ? ' new' : ''}"><span class="kg-num">${i + 1}</span>${pic(x, '', true)}<span class="kg-pn" title="${esc(x.n)}">${esc(x.n)}</span>${attr ? `<button type="button" class="kg-x" ${attr} title="${esc(T('Убрать'))}" aria-label="${esc(T('Убрать'))}: ${esc(x.n)}">${ICON.x}</button>` : ''}</li>`;
  const addHTML = () => `<div class="kg-adder"><div class="kg-addrow"><input class="inp" id="kgAddIn" data-keep maxlength="700" autocomplete="off" enterkeyhint="done" placeholder="${esc(T('Добавить участника'))}" aria-label="${esc(T('Добавить участника'))}"><button type="button" class="btn ghost" data-k="add-one">${T('Добавить')}</button></div><p class="kg-hint">${T('Enter — добавить. Можно вставить сразу список, по одному в строке. Картинка — через «|»: Hades | https://…')}</p><div id="kgPk"></div></div>`;
  const seg = (attr, key, cur, opts) => `<div class="kg-seg" role="group">${opts.map(([v, t]) => `<button type="button" data-${attr}="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${esc(T(t))}</button>`).join('')}</div>`;

  // картинка не загрузилась (ссылка умерла): вместо пустой рамки — первая буква названия
  view.addEventListener('error', (e) => {
    const im = e.target;
    if (!(im instanceof HTMLImageElement) || !im.classList.contains('kg-pic')) return;
    dead.add(im.getAttribute('src'));
    const sp = document.createElement('span');
    sp.className = im.className;
    sp.setAttribute('aria-hidden', 'true');
    sp.textContent = im.dataset.ini || '?';
    im.replaceWith(sp);
  }, true);

  // ---------- участники из «Мнения»: свои оценки и «В планах», с обложками ----------
  const PK = { open: false, tab: 'rated', q: '', sel: new Set(), photos: {}, loaded: false };
  const score = (t) => String(Math.round(t * 10) / 10).replace('.', ',');
  function myRatings() {
    const u = read('ocenshik.user.v1'), all = read('ocenshik.ratings.v2');
    return (Array.isArray(all) ? all : []).filter((r) => r && r.id && r.name && !r.example && (!r.author || !u || r.author.id === u.id));
  }
  const planned = (r) => r.total == null || /план/i.test(r.status || '');
  // обложка оценки: ссылка https, картинка в самой оценке или из хранилища фото «Мнения» (IndexedDB)
  function srcOf(r) {
    const p = r.photo;
    if (!p) return '';
    if (typeof p.data === 'string' && p.data.startsWith('data:image/')) return p.data;
    if (typeof p.url === 'string' && /^https:\/\//.test(p.url)) return p.url;
    if (typeof p.id === 'string' && /^(data:image\/|https:\/\/)/.test(p.id)) return p.id;
    return (p.ref && PK.photos[p.ref]) || '';
  }
  async function loadPhotos() {
    if (PK.loaded) return;
    PK.loaded = true;
    const refs = myRatings().map((r) => r.photo && r.photo.ref).filter(Boolean);
    if (!refs.length) return;
    // хранилище фото «Мнения»: скрипт грузится только здесь; script() ждёт, пока появится CasualPhotos
    if (!window.CasualPhotos && U.script) await U.script('/photo-store.js', () => !!window.CasualPhotos).catch(() => {});
    if (!window.CasualPhotos) return;
    try { Object.assign(PK.photos, await window.CasualPhotos.getMany(refs)); } catch (e) {}
  }
  // своя картинка уходит на сервер маленькой (3:4, до ~16 КБ): турнир хранит её у себя и показывает всем зрителям.
  // Сначала 150×200 — в бою она крупная; не влезает — меньше и проще
  const thumb = (src) => new Promise((done) => {
    const im = new Image();
    if (/^https:/.test(src)) { im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; }
    im.onload = () => {
      try {
        for (const [W, H] of [[150, 200], [120, 160], [96, 128]]) {
          const c = document.createElement('canvas');
          c.width = W; c.height = H;
          const k = Math.max(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, W, H);
          g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
          for (let q = 0.82; q > 0.4; q -= 0.08) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 15800) return done(d); }
        }
        done('');
      } catch (e) { done(''); }
    };
    im.onerror = () => done('');
    im.src = src;
  });
  // кто уже в списке (новый турнир — черновик, турнир — его участники): в выборе из оценок они отмечены и не нажимаются
  const inList = () => new Set((code ? [...people.values()] : L).map((x) => x.n.toLowerCase()));
  function pickerHTML() {
    if (!PK.open) return `<div class="kg-acts"><button type="button" class="btn ghost small" data-k="pk-open">${T('Из моих оценок')}</button></div>`;
    const all = myRatings();
    const rated = all.filter((r) => !planned(r)).sort((a, b) => b.total - a.total);
    const plans = all.filter(planned);
    const list = PK.tab === 'plan' ? plans : rated;
    const q = PK.q.trim().toLowerCase(), have = inList();
    const items = list.map((r) => {
      const s = srcOf(r), on = have.has(cleanName(r.name).toLowerCase());
      const art = s ? `<img class="kg-pic" src="${esc(s)}" alt="" data-ini="${esc(letter(r.name))}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span class="kg-pic" aria-hidden="true">${esc(letter(r.name))}</span>`;
      return `<button type="button" class="kg-pk-it${on ? ' in' : ''}" data-pk="${esc(r.id)}" data-n="${esc(r.name.toLowerCase())}" aria-pressed="${on || PK.sel.has(r.id)}"${on ? ' disabled' : ''}${q && !r.name.toLowerCase().includes(q) ? ' hidden' : ''}>${art}<span class="kg-pk-n">${esc(r.name)}</span>${on ? `<i>${T('в списке')}</i>` : r.total != null ? `<b>${score(r.total)}</b>` : ''}</button>`;
    }).join('');
    return `<div class="kg-pk">
      <div class="kg-pk-top"><div class="kg-seg" role="group"><button type="button" data-pk-tab="rated" aria-pressed="${PK.tab !== 'plan'}">${T('Оценки')} ${rated.length}</button><button type="button" data-pk-tab="plan" aria-pressed="${PK.tab === 'plan'}">${T('В планах')} ${plans.length}</button></div>
        <input class="inp" type="search" id="kgPkQ" placeholder="${esc(T('Найти'))}" value="${esc(PK.q)}" aria-label="${esc(T('Найти'))}"></div>
      ${items ? `<div class="kg-pk-grid">${items}</div>` : `<p class="kg-hint">${T(all.length ? 'Здесь пусто.' : 'Здесь появятся твои оценки из «Мнения».')}</p>`}
      <div class="kg-acts"><button type="button" class="btn primary small" data-k="pk-add"${PK.sel.size ? '' : ' disabled'}>${T('Добавить')}${PK.sel.size ? ' · ' + PK.sel.size : ''}</button><button type="button" class="btn ghost small" data-k="pk-close">${T('Закрыть')}</button></div>
    </div>`;
  }
  const paintPk = () => put(document.getElementById('kgPk'), pickerHTML());
  async function addPicked() {
    const byId = new Map(myRatings().map((r) => [r.id, r]));
    const items = [];
    for (const id of PK.sel) {
      const r = byId.get(id);
      const n = r ? cleanName(r.name) : '';
      if (!n) continue;
      const s = srcOf(r);
      const img = !s ? '' : IMG_OK.test(s) ? s : await thumb(s);
      items.push({ n, img });
    }
    PK.sel.clear(); PK.open = false;
    paintPk();
    await addItems(items);
  }

  // ---------- добавить участников: в черновик нового турнира или сразу в турнир ----------
  async function addItems(items, input) {
    items = items.filter((x) => x && x.n);
    if (!items.length) return;
    const bad = items.some((x) => x.bad);
    if (!code) {
      const r = addLocal(items);
      if (input) input.value = '';
      const el = document.getElementById('kgMsg');
      if (el) {
        el.textContent = r.full ? T(`Больше ${HILL_MAX} участников нельзя.`) : r.dup.length === 1 ? `${T('Уже в списке:')} ${r.dup[0]}` : r.dup.length ? T(`Уже были в списке: ${r.dup.length}`) : bad ? T('Картинку можно дать только ссылкой https://…') : '';
        el.classList.toggle('ok', !r.full);
      }
      return;
    }
    if (!R || busy) return;
    const v = input ? input.value : '';
    if (input) input.value = '';
    const where = R.state.status === 'ready' ? 'main' : 'own';
    const ok = await act({ act: 'add', p: items.map((x) => ({ n: x.n, img: x.img || '' })) }, where);
    if (!ok) { const i = document.getElementById('kgAddIn'); if (i && v && !i.value) i.value = v; }
    else if (bad) { msg = T('Картинку можно дать только ссылкой https://…'); msgOk = true; msgAt = where; paintRoom(); }
  }
  function addFromInput() {
    const i = document.getElementById('kgAddIn');
    if (!i) return;
    const items = i.value.split(/\r?\n/).map(parseLine).filter((x) => x.n);
    if (!items.length) { i.focus(); return; }
    return addItems(items, i);
  }

  // ---------- новый турнир ----------
  const F = { title: '', fmt: 'hill', size: 8, mode: 'host', timer: 30, seed: 'order' };
  let L = []; // участники черновика: { n, img — что уйдёт на сервер (ссылка или маленький data URL) }
  const fresh = new Set(); // только что добавленные — въезжают в список
  const DRAFT = 'casualhub.king.draft.v1';
  function loadDraft() {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
      if (!d) return;
      if (d.F) {
        if (typeof d.F.title === 'string') F.title = d.F.title.slice(0, 80);
        if (['hill', 'bracket'].includes(d.F.fmt)) F.fmt = d.F.fmt;
        if (SIZES.includes(d.F.size)) F.size = d.F.size;
        if (['host', 'vote'].includes(d.F.mode)) F.mode = d.F.mode;
        if (TIMERS.some(([v]) => v === d.F.timer)) F.timer = d.F.timer;
        if (['order', 'random'].includes(d.F.seed)) F.seed = d.F.seed;
      }
      if (Array.isArray(d.L)) L = d.L.filter((x) => x && typeof x.n === 'string' && x.n).slice(0, HILL_MAX).map((x) => ({ n: cleanName(x.n), img: typeof x.img === 'string' ? x.img : '' }));
    } catch (e) {}
  }
  // в хранилище вкладки; не влезло со своими картинками — без них
  function saveDraft() {
    const put1 = (list) => sessionStorage.setItem(DRAFT, JSON.stringify({ F, L: list }));
    try { put1(L); } catch (e) { try { put1(L.map((x) => ({ n: x.n, img: x.img.startsWith('data:') ? '' : x.img }))); } catch (er) {} }
  }
  function addLocal(items) {
    const have = new Set(L.map((x) => x.n.toLowerCase())), dup = [];
    let full = 0;
    for (const x of items) {
      const k = x.n.toLowerCase();
      if (have.has(k)) { dup.push(x.n); continue; }
      if (L.length >= HILL_MAX) { full++; continue; }
      have.add(k);
      L.push({ n: x.n, img: x.img || '' });
      fresh.add(k);
    }
    saveDraft();
    paintPeople();
    if (PK.open) paintPk();
    return { dup, full };
  }
  function goHTML(q, kind) {
    const off = q.cls === 'ok' ? '' : ' disabled';
    const btns = kind === 'create'
      ? `<button type="button" class="btn primary" data-k="create"${off}>${T('Начать турнир')}</button><button type="button" class="btn ghost" data-k="create-later"${off}>${T('Создать и начать позже')}</button>`
      : `<button type="button" class="btn primary" data-k="start"${off}>${T('Начать турнир')}</button>`;
    const hint = q.hint || (kind === 'create' ? T('«Начать позже» — чтобы сначала поделиться ссылкой и поправить список.') : '');
    return `<div class="kg-go">${btns}${hint ? `<p class="kg-hint">${esc(hint)}</p>` : ''}</div>`;
  }
  function paintPeople() {
    const box = document.getElementById('kgPeople');
    if (!box) return;
    const q = need(L.length, F.fmt, F.size);
    put(box, countHTML(q, L.length, F.fmt, F.size) + (L.length
      ? `<ol class="kg-people">${L.map((x, i) => personHTML(x, i, `data-del-i="${i}"`, fresh.has(x.n.toLowerCase()))).join('')}</ol>`
      : `<p class="kg-empty">${T('Пока никого. Добавь участников по названию или из своих оценок.')}</p>`));
    fresh.clear();
    put(document.getElementById('kgGo'), goHTML(q, 'create'));
  }
  function paintNew() {
    if (!document.getElementById('kgNew')) view.innerHTML = '<section class="card" id="kgNew"></section><section class="card" id="kgMine" hidden></section>';
    const logged = !!token();
    const form = logged ? `
      <label class="kg-f">${T('Название')}<input class="inp" id="kgTitle" maxlength="80" placeholder="${esc(T('Например, лучшая игра 2010-х'))}" value="${esc(F.title)}"></label>
      <div class="kg-f">${T('Формат')}${seg('set', 'fmt', F.fmt, [['hill', 'Царь горы'], ['bracket', 'Сетка']])}</div>
      ${F.fmt === 'bracket' ? `<div class="kg-f">${T('Размер сетки')}${seg('set', 'size', F.size, SIZES.map((s) => [s, String(s)]))}</div>` : ''}
      <div class="kg-f">${T('Кто решает бой')}${seg('set', 'mode', F.mode, [['host', 'Ведущий'], ['vote', 'Голосование по ссылке']])}</div>
      ${F.mode === 'vote' ? `<div class="kg-f">${T('Таймер голосования')}${seg('set', 'timer', F.timer, TIMERS)}</div>` : ''}
      <div class="kg-f">${T('Порядок')}${seg('set', 'seed', F.seed, [['order', 'Как в списке'], ['random', 'Случайно']])}</div>
      <div class="kg-pf" id="kgPeople"></div>
      ${addHTML()}
      <div id="kgGo"></div>
      <p class="kg-msg" id="kgMsg" role="status"></p>`
      : `<p class="lots-empty">${T('Войди в аккаунт, чтобы создавать турниры. Смотреть и голосовать по ссылке можно и так.')}</p>`;
    const head = `<div class="card-head"><h2 class="eyebrow"><span class="dot" aria-hidden="true"></span>${T('Новый турнир')}</h2></div>
      <p class="kg-lead">${T('«Царь горы»: царь бьётся с претендентами по очереди, проигравший выбывает, считается серия побед. «Сетка»: пары на выбывание до финала.')}</p>`;
    if (put(document.getElementById('kgNew'), head + form) && logged) { paintPeople(); paintPk(); }
  }
  async function create(start) {
    const msgEl = document.getElementById('kgMsg');
    view.querySelectorAll('[data-k^="create"]').forEach((b) => { b.disabled = true; });
    try {
      const { d } = await api('POST', '/king', { title: F.title, fmt: F.fmt, size: F.size, mode: F.mode, timer: F.mode === 'vote' ? F.timer : 0, seed: F.seed, p: L.map((x) => ({ n: x.n, img: x.img })), start });
      try { sessionStorage.removeItem(DRAFT); } catch (e) {}
      location.href = '/king/?c=' + d.room.id;
    } catch (e) {
      if (msgEl) { msgEl.textContent = e.message; msgEl.classList.remove('ok'); }
      const go = document.getElementById('kgGo');
      if (go) { go._html = ''; paintPeople(); }
    }
  }

  // ---------- свои турниры: открыть или удалить (второе нажатие подтверждает) ----------
  let MINE = null, mineArmed = '', mineT = 0, mineMsg = '';
  const ST = { ready: 'ещё не начался', live: 'идёт', done: 'закончен' };
  function mineRow(r) {
    const armed = mineArmed === r.id;
    const meta = [T(r.fmt === 'bracket' ? 'Сетка' : 'Царь горы'), T(ST[r.status] || r.status), T(`${r.people} ${plural(r.people, 'участник', 'участника', 'участников')}`)];
    if (r.king) meta.push(`${T(r.status === 'done' ? 'победитель' : 'на горе')}: ${r.king}`);
    return `<li><a href="/king/?c=${esc(r.id)}">${esc(r.title)}</a><span class="meta">${esc(meta.join(' · '))}</span><button type="button" class="btn ghost small danger kg-del" data-del="${esc(r.id)}"${armed ? ' data-armed="1"' : ''} title="${esc(T('Удалить турнир'))}" aria-label="${esc(armed ? T('Точно удалить?') : `${T('Удалить турнир')}: ${r.title}`)}">${armed ? T('Точно удалить?') : ICON.trash}</button></li>`;
  }
  function paintMine() {
    const el = document.getElementById('kgMine');
    if (!el) return;
    const list = MINE || [];
    put(el, list.length || mineMsg ? `<div class="card-head"><h2 class="eyebrow"><span class="dot" aria-hidden="true"></span>${T('Мои турниры')}</h2></div>
      ${list.length ? `<ul class="kg-list kg-mine">${list.map(mineRow).join('')}</ul>` : ''}${mineMsg ? `<p class="kg-msg ok" role="status">${esc(mineMsg)}</p>` : ''}` : '');
  }
  async function loadMine() {
    if (!token()) return;
    try { const { d } = await api('GET', '/king/mine'); MINE = d.rooms || []; } catch (e) { MINE = []; }
    try { const g = sessionStorage.getItem('casualhub.king.gone.v1'); if (g) { mineMsg = `${T('Турнир удалён:')} ${g}`; sessionStorage.removeItem('casualhub.king.gone.v1'); } } catch (e) {}
    paintMine();
  }
  async function delMine(b) {
    const id = b.dataset.del;
    if (mineArmed !== id) {
      mineArmed = id; mineMsg = '';
      clearTimeout(mineT);
      mineT = setTimeout(() => { mineArmed = ''; paintMine(); }, 4000);
      paintMine();
      return;
    }
    clearTimeout(mineT);
    mineArmed = '';
    b.disabled = true;
    try {
      await api('POST', '/king/delete', { c: id });
      const r = (MINE || []).find((x) => x.id === id);
      MINE = (MINE || []).filter((x) => x.id !== id);
      mineMsg = r ? `${T('Турнир удалён:')} ${r.title}` : '';
    } catch (e) { mineMsg = e.message; }
    paintMine();
  }

  // ---------- турнир ----------
  let R = null, people = new Map(), pv = '', etag = '', off = 0, pollT = 0, tickT = 0, busy = false, forcedAt = 0;
  let msg = '', msgOk = false, msgAt = 'main';
  // итог только что закрытого боя видно, пока не откроется следующий (сервер ждёт KING.PAUSE), а после финала — пару секунд
  let logLen = -1, holdKey = '', holdUntil = 0;
  let shown = '', enteredN = 0, decided = '', picked = null, cheered = false, newIds = new Set();
  let editing = false, delArmed = false, delT = 0;
  let $head, $stage, $note, $ctl, $msg, $side, $log, $own;
  const now = () => Date.now() + off;
  const P = (id) => people.get(id) || { id, n: '…', img: '' };
  const lastLog = () => { const l = R && R.state.log; return l && l.length ? l[l.length - 1] : null; };
  const keyOf = (e) => (e ? e.n + '/' + e.at : '');
  function take(d) {
    const before = new Set(people.keys());
    R = d; off = (d.now || Date.now()) - Date.now();
    if (Array.isArray(d.state.p)) {
      people = new Map(d.state.p.map((x) => [x.id, x]));
      pv = String(d.state.pv);
      if (before.size) for (const id of people.keys()) if (!before.has(id)) newIds.add(id);
    }
    const st = d.state, n = (st.log || []).length, e = n ? st.log[n - 1] : null;
    if (n < logLen) { holdUntil = 0; holdKey = keyOf(e); } // отменили бой — его итог не показываем
    else if (e && keyOf(e) !== holdKey) {
      holdKey = keyOf(e);
      const srv = d.now || Date.now();
      holdUntil = srv - e.at > 9000 ? 0 : Math.max(st.status === 'live' && st.bout && st.bout.opens > e.at ? st.bout.opens : e.at + 2600, srv + 1200);
    }
    logLen = n;
  }
  function phaseOf() {
    const st = R.state, e = lastLog();
    if (st.status === 'ready') return 'ready';
    if (e && holdUntil && now() < holdUntil && keyOf(e) === holdKey) return 'result:' + holdKey;
    if (st.status === 'done' || !st.bout) return 'champ';
    return (now() < st.bout.opens ? 'wait:' : 'bout:') + st.bout.n;
  }
  const fmtTimer = (t) => (t < 60 ? `${t} с` : t % 60 ? `${Math.floor(t / 60)} мин ${t % 60} с` : `${t / 60} мин`);
  const undoLabel = (st) => (st.status !== 'done' ? 'Отменить прошлый бой' : st.fmt === 'hill' && (st.queue || []).length ? 'Продолжить турнир' : 'Отменить последний бой');
  function headHTML() {
    const st = R.state, room = R.room, own = room.own;
    const STATUS = { ready: 'ещё не начался', live: 'идёт', done: 'закончен' };
    const tags = [
      `<span class="${st.status === 'live' ? 'live' : ''}">${T(STATUS[st.status] || st.status)}</span>`,
      `<span>${st.fmt === 'hill' ? T('Царь горы') : T(`Сетка на ${st.size}`)}</span>`,
      `<span>${T(st.mode === 'vote' ? 'голосование' : 'решает ведущий')}${st.mode === 'vote' && st.timer ? ' · ' + T(fmtTimer(st.timer)) : ''}</span>`,
      room.owner ? `<span>${T('ведёт')} ${esc(room.owner)}</span>` : '',
    ].join('');
    const title = editing && own
      ? `<div class="kg-rename"><input class="inp" id="kgRename" data-keep maxlength="80" value="${esc(room.title)}" aria-label="${esc(T('Название турнира'))}"><button type="button" class="btn primary small" data-k="ren-save">${T('Сохранить')}</button><button type="button" class="btn ghost small" data-k="ren-cancel">${T('Отмена')}</button></div>`
      : `<div class="kg-title"><h2>${esc(room.title)}</h2>${own ? `<button type="button" class="kg-ico" data-k="ren" title="${esc(T('Переименовать'))}" aria-label="${esc(T('Переименовать'))}">${ICON.pen}</button>` : ''}</div>`;
    const undo = own && st.canUndo ? `<button type="button" class="btn ghost small" data-k="undo">${T(undoLabel(st))}</button>` : '';
    const fin = own && st.status === 'live' && st.fmt === 'hill' ? `<button type="button" class="btn ghost small" data-k="finish">${T('Закончить')}</button>` : '';
    return `<div class="kg-head"><div class="kg-head-main">${title}<div class="kg-tags">${tags}</div></div><div class="kg-acts"><button type="button" class="btn ghost small" data-k="share">${ICON.link}${T('Ссылка')}</button>${undo}${fin}</div></div>`;
  }
  // карточка участника в бою; o: tag (button | div), attr, king — «Царь горы» с серией, vote — полоса и счёт голосов, cls, won
  function sideHTML(k, x, o) {
    const t = o.tag || 'div';
    return `<${t}${t === 'button' ? ' type="button"' : ''} class="kg-side ${k}${o.cls || ''}" data-id="${esc(x.id || '')}"${o.attr || ''}>${o.vote ? `<span class="kg-bar" data-bar="${k}"></span>` : ''}${o.won ? `<span class="kg-won">${ICON.check}${T('Победа')}</span>` : ''}${pic(x, 'lg', false)}<b>${esc(x.n)}</b>${o.king ? `<small class="kg-king">${crown('', 16)}${T('Царь горы')}${o.streak ? ` · ${T('серия')} ${o.streak}` : ''}</small>` : ''}${o.vote ? `<em data-cnt="${k}"></em>` : ''}${o.mine ? `<span class="kg-you">${T('Твой голос')}</span>` : ''}</${t}>`;
  }
  function boutHTML(waiting) {
    const st = R.state, bt = st.bout, own = R.room.own, vote = st.mode === 'vote';
    const canVote = vote && !waiting && !!token() && !own;
    const canPick = own && !vote && !waiting;
    const one = (k) => sideHTML(k, P(bt[k]), {
      tag: canVote || canPick ? 'button' : 'div',
      attr: canVote ? ` data-vote="${k}" aria-pressed="${R.mine === k}"` : canPick ? ` data-win="${k}"` : '',
      king: st.fmt === 'hill' && k === 'a', streak: st.streak, vote, mine: vote && R.mine === k, cls: vote && R.mine === k ? ' on' : '',
    });
    return `<div class="kg-bout${waiting ? ' wait' : ''}">${one('a')}<span class="kg-vs" aria-hidden="true">VS</span>${one('b')}</div>`;
  }
  function resultHTML(e) {
    const one = (k) => sideHTML(k, P(e[k]), { won: e.w === k, cls: e.w === k ? ' win' : ' lose' });
    return `<div class="kg-bout kg-res">${one('a')}<span class="kg-vs" aria-hidden="true">VS</span>${one('b')}</div>`;
  }
  function readyHTML() {
    const st = R.state, own = R.room.own, list = [...people.values()];
    const q = need(list.length, st.fmt, st.size);
    const rows = list.map((x, i) => personHTML(x, i, own ? `data-rm="${esc(x.id)}"` : '', newIds.has(x.id))).join('');
    return `<div class="kg-pf">${countHTML(q, list.length, st.fmt, st.size)}${rows ? `<ol class="kg-people">${rows}</ol>` : `<p class="kg-empty">${T('Пока никого.')}</p>`}</div>
      ${own ? addHTML() + goHTML(q, 'start') : `<p class="kg-note">${T('Турнир ещё не начался: ведущий начнёт, когда все соберутся.')}</p>`}`;
  }
  function champHTML() {
    const st = R.state, c = st.champ ? P(st.champ) : null;
    if (!c) return `<p class="kg-empty">${T('Турнир закончился без победителя.')}</p>`;
    const bouts = (st.log || []).length, stats = [];
    if (st.fmt === 'hill') {
      const mine = st.best && st.best.id === st.champ;
      stats.push([st.streak, plural(st.streak, 'победа подряд', 'победы подряд', 'побед подряд'), mine ? T('рекорд турнира') : '']);
      if (st.best && !mine) stats.push([st.best.n, 'рекорд серии', P(st.best.id).n]);
    } else {
      const wins = (st.log || []).filter((e) => (e.w === 'a' ? e.a : e.b) === st.champ).length;
      stats.push([wins, plural(wins, 'победа', 'победы', 'побед'), '']);
    }
    stats.push([bouts, plural(bouts, 'бой', 'боя', 'боёв'), '']);
    return `<div class="kg-champ"><div class="kg-champ-art">${pic(c, 'xl', false)}${crown('kg-crown', 64)}</div><span class="label">${T('Победитель')}</span><b class="kg-champ-name">${esc(c.n)}</b>
      <div class="kg-stats">${stats.map(([n, cap, who]) => `<div class="kg-stat"><b>${n}</b><span>${T(cap)}</span>${who ? `<small>${esc(who)}</small>` : ''}</div>`).join('')}</div></div>`;
  }
  function stageHTML(ph) {
    if (ph === 'ready') return readyHTML();
    if (ph.startsWith('result:')) return resultHTML(lastLog());
    if (ph === 'champ') return champHTML();
    return boutHTML(ph.startsWith('wait:'));
  }
  function noteHTML(ph) {
    const st = R.state, own = R.room.own, bt = st.bout;
    if (ph === 'ready' || ph === 'champ') return '';
    if (ph.startsWith('result:')) {
      const e = lastLog(), w = P(e.w === 'a' ? e.a : e.b);
      const what = st.fmt === 'hill' ? (e.w === 'b' ? '— новый царь горы' : 'остаётся на горе') : st.rounds && e.r === st.rounds.length - 1 ? 'выигрывает финал' : 'проходит дальше';
      const votes = e.by !== 'host' ? `<span class="kg-score">${T('голоса')} ${e.va} : ${e.vb}</span>` : '';
      return `<div class="kg-wait" role="status"><p><b>${esc(w.n)}</b> ${T(what)}${votes}</p><span class="kg-line" aria-hidden="true"><i></i></span><small>${T(st.status === 'done' ? 'Итоги турнира…' : 'Следующий бой…')}</small></div>`;
    }
    if (ph.startsWith('wait:')) return `<div class="kg-wait"><span class="kg-line" aria-hidden="true"><i></i></span><small>${T('Следующий бой…')}</small></div>`;
    let t;
    if (st.mode === 'vote') {
      const who = own ? T('Закрой голосование, когда хватит голосов.') : token() ? T(R.mine ? 'Твой голос учтён, можно передумать.' : 'Нажми на того, кто лучше.') : T('Войди, чтобы голосовать.');
      const clock = bt.ends ? `<span class="kg-clock"><span class="kg-clock-on">${T('Голосование')}: <b data-k-tick></b> ${T('с')}.</span><span class="kg-clock-end" hidden>${T('Подводим итоги…')}</span></span> ` : bt.idle ? `${T('Никто не проголосовал — решает ведущий.')} ` : '';
      t = clock + who;
    } else t = own ? T('Нажми на победителя боя.') : T('Бой решает ведущий.');
    return `<p class="kg-note">${t}</p>`;
  }
  function ctlHTML(ph) {
    if (!R.room.own || !ph.startsWith('bout:') || R.state.mode !== 'vote') return '';
    return `<div class="kg-acts kg-ctl"><button type="button" class="btn primary small" data-k="close">${T('Закрыть голосование')}</button><button type="button" class="btn ghost small" data-win="a">${T('Победил левый')}</button><button type="button" class="btn ghost small" data-win="b">${T('Победил правый')}</button></div>`;
  }
  const xBtn = (x) => `<button type="button" class="kg-x" data-rm="${esc(x.id)}" title="${esc(T('Убрать'))}" aria-label="${esc(T('Убрать'))}: ${esc(x.n)}">${ICON.x}</button>`;
  function hillHTML() {
    const st = R.state, live = st.status === 'live', own = R.room.own && live;
    const q = st.queue || [], out = (st.out || []).slice().reverse();
    const best = st.best ? `<div class="kg-best">${pic(P(st.best.id), '', true)}<span><b>${esc(P(st.best.id).n)}</b><small>${T(`${st.best.n} ${plural(st.best.n, 'победа подряд', 'победы подряд', 'побед подряд')}`)}</small></span></div>` : `<p class="kg-none">${T('Пока нет: царь ещё не выиграл ни одного боя.')}</p>`;
    const qRows = q.map((id, i) => { const x = P(id); return `<li>${pic(x, '', true)}<span class="kg-ln">${esc(x.n)}</span><span class="meta">${i === 0 && live ? T('следующий') : ''}${own ? xBtn(x) : ''}</span></li>`; }).join('');
    const oRows = out.map((id) => { const x = P(id); return `<li class="out">${pic(x, '', true)}<span class="kg-ln">${esc(x.n)}</span><span class="meta"></span></li>`; }).join('');
    return `<div class="kg-grid">
      <div class="kg-block"><h3 class="label">${T('Рекорд серии')}</h3>${best}</div>
      <div class="kg-block"><h3 class="label">${T(live ? 'Очередь' : 'Не успели сыграть')} · ${q.length}</h3>${qRows ? `<ul class="kg-list kg-scroll">${qRows}</ul>` : `<p class="kg-none">${T(live ? 'Это последний претендент.' : 'Сыграли все.')}</p>`}</div>
      ${oRows ? `<div class="kg-block"><h3 class="label">${T('Выбыли')} · ${out.length}</h3><ul class="kg-list kg-scroll">${oRows}</ul></div>` : ''}</div>`;
  }
  function bracketHTML() {
    const st = R.state, rounds = st.rounds;
    if (!rounds) return '';
    const last = rounds.length - 1;
    const name = (r) => (r === last ? T('Финал') : r === last - 1 ? T('Полуфинал') : r === last - 2 ? T('Четвертьфинал') : `${T('Раунд')} ${r + 1}`);
    const row = (m, id) => {
      if (!id) return '<div class="kg-mr tbd"><span class="kg-pic xs blank" aria-hidden="true"></span><span>—</span></div>';
      const x = P(id);
      return `<div class="kg-mr${m.w ? (m.w === id ? ' w' : ' l') : ''}">${pic(x, 'xs', true)}<span>${esc(x.n)}</span></div>`;
    };
    return `<h3 class="label">${T('Сетка')}</h3><div class="kg-rounds">${rounds.map((round, r) => `<div class="kg-round"><h4>${name(r)}</h4>${round.map((m, i) => `<div class="kg-m${st.status === 'live' && st.bout && st.bout.r === r && st.bout.m === i ? ' now' : ''}">${row(m, m.a)}${row(m, m.b)}</div>`).join('')}</div>`).join('')}</div>`;
  }
  function logHTML() {
    const log = (R.state.log || []).slice(-8).reverse();
    if (!log.length) return '';
    const rows = log.map((e) => {
      const w = P(e.w === 'a' ? e.a : e.b), l = P(e.w === 'a' ? e.b : e.a);
      const meta = [e.x ? T('новый царь') : '', e.by === 'host' ? '' : `${e.va} : ${e.vb}`].filter(Boolean).join(' · ');
      return `<li>${pic(w, '', true)}<span class="kg-ln"><b>${esc(w.n)}</b> ${T('победил')} ${esc(l.n)}</span><span class="meta">${esc(meta)}</span></li>`;
    }).join('');
    return `<h3 class="label">${T('Последние бои')}</h3><ul class="kg-list" style="margin-top:10px">${rows}</ul>`;
  }
  function ownHTML() {
    const st = R.state;
    if (!R.room.own) return '';
    const parts = [];
    if (st.status === 'live' && st.fmt === 'hill') parts.push(`<div class="kg-own-add"><h4 class="kg-own-h">${T('Добавить участников')}</h4><p class="kg-hint">${T('Новые встанут в конец очереди.')}</p>${addHTML()}</div>`);
    if (st.status !== 'done') {
      parts.push(`<div class="kg-f">${T('Кто решает бой')}${seg('rule', 'mode', st.mode, [['host', 'Ведущий'], ['vote', 'Голосование по ссылке']])}</div>`);
      if (st.mode === 'vote') parts.push(`<div class="kg-f">${T('Таймер голосования')}${seg('rule', 'timer', st.timer, TIMERS)}</div>`);
    }
    if (st.status === 'ready') {
      parts.push(`<div class="kg-f">${T('Порядок')}${seg('rule', 'seed', st.seed, [['order', 'Как в списке'], ['random', 'Случайно']])}</div>`);
      if (st.fmt === 'bracket') parts.push(`<div class="kg-f">${T('Размер сетки')}${seg('rule', 'size', st.size, SIZES.map((s) => [s, String(s)]))}</div>`);
    }
    return `<h3 class="label">${T('Пульт ведущего')}</h3>${parts.join('')}
      <div class="kg-own-foot"><p class="kg-hint">${T('Удалённый турнир не вернуть: пропадут бои, голоса и ссылка.')}</p><button type="button" class="btn ghost small danger" data-k="del"${delArmed ? ' data-armed="1"' : ''}>${delArmed ? T('Точно удалить?') : ICON.trash + T('Удалить турнир')}</button></div>
      ${msg && msgAt === 'own' ? `<p class="kg-msg${msgOk ? ' ok' : ''}" role="status">${esc(msg)}</p>` : ''}`;
  }
  function frame() {
    if ($head && $head.isConnected) return;
    view.innerHTML = `<section class="card kg-main"><div id="kgHead"></div><div id="kgStage" class="kg-stage"></div><div id="kgNote"></div><div id="kgCtl"></div><div id="kgMsgMain"></div></section>
      <section class="card" id="kgSide" hidden></section><section class="card" id="kgLog" hidden></section><section class="card kg-own" id="kgOwn" hidden></section>`;
    const $ = (id) => document.getElementById(id);
    $head = $('kgHead'); $stage = $('kgStage'); $note = $('kgNote'); $ctl = $('kgCtl'); $msg = $('kgMsgMain'); $side = $('kgSide'); $log = $('kgLog'); $own = $('kgOwn');
  }
  function paintRoom() {
    if (!R) return;
    frame();
    const st = R.state, ph = phaseOf();
    document.title = `${R.room.title} · ${T('Царь Горы')}`;
    put($head, headHTML());
    // своё решение ведущего: на экране уже итог (pick → рамка и анимация), сервер ответил тем же — карточки не пересоздаём
    let stage = false;
    const e = lastLog();
    if (ph.startsWith('result:') && picked && e && picked.n === e.n && picked.w === e.w && $stage._html === '') { $stage._html = stageHTML(ph); decided = holdKey; }
    else stage = put($stage, stageHTML(ph));
    picked = null;
    if (put($note, noteHTML(ph))) line(ph);
    put($ctl, ctlHTML(ph));
    put($msg, msg && msgAt === 'main' ? `<p class="kg-msg${msgOk ? ' ok' : ''}" role="status">${esc(msg)}</p>` : '');
    put($side, st.status === 'ready' ? '' : st.fmt === 'hill' ? hillHTML() : bracketHTML());
    put($log, logHTML());
    const own = put($own, ownHTML());
    if (stage || own) paintPk();
    if (stage) motion(ph);
    newIds.clear();
    patchTally();
    clock();
    shown = ph;
  }
  // движение после перерисовки: новый бой въезжает (царь, оставшийся на горе, стоит), итог — рамка и затемнение, финал — конфетти
  function motion(ph) {
    const box = $stage.firstElementChild;
    if (!box) return;
    if (ph.startsWith('result:')) {
      if (decided !== holdKey) { decided = holdKey; box.classList.add('kg-decide'); }
      return;
    }
    if (ph.startsWith('bout:') || ph.startsWith('wait:')) {
      const bt = R.state.bout;
      if (enteredN === bt.n) return;
      const first = !shown;
      enteredN = bt.n;
      if (first) return; // страница только открылась: въезжает вся карточка
      const e = lastLog(), stay = e && e.w === 'a' && e.a === bt.a ? bt.a : '';
      box.classList.add('kg-enter');
      box.querySelectorAll('.kg-side').forEach((s) => { if (s.dataset.id !== stay) s.classList.add('in'); });
      return;
    }
    if (ph === 'champ' && !cheered) { cheered = true; box.classList.add('kg-enter'); celebrate(box); }
  }
  function celebrate(box) {
    if (calm() || !U.confetti) return;
    const art = box.querySelector('.kg-champ-art') || box, r = art.getBoundingClientRect();
    const cv = document.createElement('canvas');
    cv.className = 'kg-fx';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    let stop = null;
    try { stop = U.confetti(cv, { x: r.left + r.width / 2, y: Math.min(innerHeight - 40, Math.max(40, r.top + r.height * 0.3)), colors: [v('--accent'), v('--good'), v('--mid'), v('--bad'), '#F2C230'].filter(Boolean), count: 180 }); } catch (e) {}
    setTimeout(() => { try { if (stop) stop(); } catch (e) {} cv.remove(); }, 6500);
  }
  // полоса до следующего боя: продолжается с того места, где должна быть (длина паузы известна по времени сервера)
  function line(ph) {
    const i = $note.querySelector('.kg-line i');
    if (!i) return;
    const st = R.state, e = lastLog();
    let from, to;
    if (ph.startsWith('result:')) { from = e.at; to = holdUntil; }
    else { to = st.bout.opens; from = e && e.at < to ? e.at : to - 4000; }
    const len = Math.max(300, to - from);
    i.style.animationDuration = len + 'ms';
    i.style.animationDelay = -Math.min(len, Math.max(0, now() - from)) + 'ms';
  }
  function patchTally() {
    if (!$stage) return;
    const t = R.tally || { a: 0, b: 0 }, sum = (t.a || 0) + (t.b || 0);
    const pct = (k) => (sum ? Math.round(((t[k] || 0) / sum) * 100) : 0);
    $stage.querySelectorAll('[data-bar]').forEach((el) => el.style.setProperty('--p', pct(el.dataset.bar) + '%'));
    $stage.querySelectorAll('[data-cnt]').forEach((el) => { const k = el.dataset.cnt, s = `${t[k] || 0} · ${pct(k)}%`; if (el.textContent !== s) el.textContent = s; });
  }
  // таймер голосования: секунды; вышло время — «Подводим итоги…» и запрос (бой закрывает первый запрос после срока)
  function clock() {
    const bt = R && R.state.bout, el = $note && $note.querySelector('[data-k-tick]');
    if (!el || !bt || !bt.ends) return;
    const s = Math.ceil((bt.ends - now()) / 1000), on = s > 0;
    if (on && el.textContent !== String(s)) el.textContent = s;
    const a = $note.querySelector('.kg-clock-on'), b = $note.querySelector('.kg-clock-end');
    if (a && a.hidden !== !on) a.hidden = !on;
    if (b && b.hidden !== on) b.hidden = on;
    if (!on && !busy && Date.now() - forcedAt > 1500) { forcedAt = Date.now(); poll(true); }
  }
  function tick() {
    clearTimeout(tickT);
    if (R && !busy) { if (phaseOf() !== shown) paintRoom(); else clock(); }
    tickT = setTimeout(tick, 250);
  }
  function gone(text) {
    R = null;
    clearTimeout(pollT); clearTimeout(tickT);
    view.innerHTML = `<section class="card"><p class="lots-empty">${esc(text)}</p><div class="kg-acts" style="justify-content:center"><a class="btn primary" href="/king/">${T('К турнирам')}</a></div></section>`;
  }
  // чат турнира (/chat.js): под турниром, вне #view — paintRoom перерисовывает view целиком, а чат живёт своей жизнью
  let chat = null;
  function mountChat() {
    if (chat || !code || !R || !window.CasualChat) return;
    const sec = document.createElement('section');
    sec.className = 'card kg-chat';
    sec.style.marginTop = '18px';
    view.after(sec);
    chat = window.CasualChat.mount(sec, { scope: 'king', room: code, canModerate: !!R.room.own });
  }
  async function poll(soon) {
    clearTimeout(pollT);
    if (!document.hidden || soon) {
      try {
        const r = await api('GET', `/king/room?c=${code}&pv=${encodeURIComponent(pv)}`, null, etag);
        if (!r.same) { etag = r.etag; take(r.d); mountChat(); if (!busy) paintRoom(); }
      } catch (e) {
        if (!R || e.status === 404) { gone(e.status === 404 && R ? T('Этот турнир удалили.') : e.message); return; }
      }
    }
    pollT = setTimeout(() => poll(), R && R.state.status === 'live' ? 2000 : 8000);
  }
  async function act(body, where) {
    busy = true; msg = ''; msgOk = false; msgAt = where || 'main';
    try { const { d } = await api('POST', body.act ? '/king/act' : '/king/vote', { c: code, pv, ...body }); etag = ''; take(d); }
    catch (e) { msg = e.message; }
    busy = false;
    paintRoom();
    return !msg;
  }
  // ведущий выбрал победителя: рамка и анимация сразу, не дожидаясь сервера
  function decideNow(k) {
    const box = $stage && $stage.querySelector('.kg-bout');
    if (!box || box.classList.contains('kg-res')) return;
    picked = { n: R.state.bout.n, w: k };
    box.classList.remove('kg-enter');
    box.classList.add('kg-decide', 'kg-res');
    box.querySelectorAll('.kg-side').forEach((s) => {
      const win = s.classList.contains(k);
      s.classList.remove('on', 'in');
      s.classList.add(win ? 'win' : 'lose');
      if (s.tagName === 'BUTTON') s.disabled = true;
      if (win) s.insertAdjacentHTML('afterbegin', `<span class="kg-won">${ICON.check}${esc(T('Победа'))}</span>`);
    });
    $stage._html = '';
  }
  async function rename() {
    const i = document.getElementById('kgRename');
    const t = cleanName(i ? i.value : '');
    if (!t) { if (i) i.focus(); return; }
    editing = false;
    if (t === R.room.title) { paintRoom(); return; }
    if (!(await act({ act: 'title', title: t }))) {
      editing = true; paintRoom();
      const j = document.getElementById('kgRename');
      if (j) { j.value = t; j.focus(); }
    }
  }
  async function delRoom() {
    if (!delArmed) {
      delArmed = true;
      clearTimeout(delT);
      delT = setTimeout(() => { delArmed = false; if (R) paintRoom(); }, 4000);
      paintRoom();
      return;
    }
    clearTimeout(delT);
    busy = true;
    try {
      await api('POST', '/king/delete', { c: code });
      try { sessionStorage.setItem('casualhub.king.gone.v1', R.room.title); } catch (e) {}
      location.href = '/king/';
    } catch (e) { busy = false; delArmed = false; msg = e.message; msgOk = false; msgAt = 'own'; paintRoom(); }
  }

  // ---------- события ----------
  view.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'kgTitle') { F.title = t.value; saveDraft(); return; }
    // поиск в выборе из оценок: прячем лишние, не перерисовывая (фокус и выбор остаются)
    if (t.id !== 'kgPkQ') return;
    PK.q = t.value;
    const q = PK.q.trim().toLowerCase();
    view.querySelectorAll('.kg-pk-it').forEach((b) => { b.hidden = !!q && !b.dataset.n.includes(q); });
    const box = document.getElementById('kgPk');
    if (box) box._html = ''; // при следующей перерисовке — с новым поиском
  });
  view.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.isComposing) return;
    if (t.id === 'kgAddIn' && e.key === 'Enter') { e.preventDefault(); addFromInput(); return; }
    if (t.id === 'kgRename') {
      if (e.key === 'Enter') { e.preventDefault(); rename(); }
      else if (e.key === 'Escape') { editing = false; paintRoom(); const b = $head && $head.querySelector('[data-k="ren"]'); if (b) b.focus(); }
    }
  });
  // вставили несколько строк — это список: каждая строка — участник
  view.addEventListener('paste', (e) => {
    if (e.target.id !== 'kgAddIn') return;
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (!/[\r\n]/.test(text.trim())) return;
    e.preventDefault();
    const items = text.split(/\r?\n/).map(parseLine).filter((x) => x.n);
    if (items.length) addItems(items, e.target);
  });
  view.addEventListener('click', async (e) => {
    const t = e.target;
    const it = t.closest('[data-pk]');
    if (it) {
      if (it.disabled) return;
      const id = it.dataset.pk;
      if (PK.sel.has(id)) PK.sel.delete(id); else PK.sel.add(id);
      it.setAttribute('aria-pressed', String(PK.sel.has(id)));
      const go = view.querySelector('[data-k="pk-add"]');
      if (go) { go.disabled = !PK.sel.size; go.textContent = T('Добавить') + (PK.sel.size ? ' · ' + PK.sel.size : ''); }
      const box = document.getElementById('kgPk');
      if (box) box._html = '';
      return;
    }
    const tab = t.closest('[data-pk-tab]');
    if (tab) { PK.tab = tab.dataset.pkTab; paintPk(); return; }
    const pk = t.closest('[data-k^="pk-"]');
    if (pk) {
      if (pk.dataset.k === 'pk-open') {
        PK.open = true; paintPk();
        await loadPhotos();
        if (PK.open) { const box = document.getElementById('kgPk'); if (box) box._html = ''; paintPk(); }
        const q = document.getElementById('kgPkQ');
        if (q) q.focus({ preventScroll: true });
      } else if (pk.dataset.k === 'pk-close') { PK.open = false; PK.sel.clear(); paintPk(); }
      else if (pk.dataset.k === 'pk-add') { pk.disabled = true; await addPicked(); }
      return;
    }
    // новый турнир
    const set = t.closest('[data-set]');
    if (set) {
      F[set.dataset.set] = /^\d+$/.test(set.dataset.v) ? +set.dataset.v : set.dataset.v;
      saveDraft(); paintNew(); paintPeople();
      return;
    }
    const di = t.closest('[data-del-i]');
    if (di) {
      const i = +di.dataset.delI;
      L.splice(i, 1);
      saveDraft(); paintPeople();
      if (PK.open) paintPk();
      const next = view.querySelector(`[data-del-i="${Math.min(i, L.length - 1)}"]`) || document.getElementById('kgAddIn');
      if (next && di === document.activeElement) next.focus({ preventScroll: true });
      return;
    }
    const md = t.closest('[data-del]');
    if (md) { delMine(md); return; }
    const el = t.closest('[data-k], [data-win], [data-vote], [data-rm], [data-rule]');
    if (!el) return;
    const k = el.dataset.k;
    if (k === 'add-one') { addFromInput(); return; }
    if (k === 'create' || k === 'create-later') { create(k === 'create'); return; }
    if (!R) return;
    if (k === 'share') {
      const url = `${location.origin}/king/?c=${code}`;
      try { await navigator.clipboard.writeText(url); msg = T('Ссылка скопирована: зрители откроют турнир и смогут голосовать.'); } catch (er) { msg = url; }
      msgOk = true; msgAt = 'main';
      paintRoom();
      return;
    }
    if (k === 'ren') { editing = true; paintRoom(); const i = document.getElementById('kgRename'); if (i) { i.focus(); i.select(); } return; }
    if (k === 'ren-cancel') { editing = false; paintRoom(); return; }
    if (k === 'ren-save') { rename(); return; }
    if (k === 'del') { delRoom(); return; }
    if (busy) return;
    const st = R.state;
    if (el.dataset.vote) {
      const side = el.dataset.vote;
      $stage.querySelectorAll('.kg-side').forEach((s) => { const me = s.classList.contains(side); s.classList.toggle('on', me); s.setAttribute('aria-pressed', String(me)); });
      $stage._html = '';
      act({ n: st.bout.n, pick: side });
      return;
    }
    if (el.dataset.win) {
      if (!st.bout) return;
      if (!calm()) decideNow(el.dataset.win);
      act({ act: 'pick', n: st.bout.n, w: el.dataset.win });
      return;
    }
    if (el.dataset.rm) { act({ act: 'remove', id: el.dataset.rm }, st.status === 'ready' ? 'main' : 'own'); return; }
    if (el.dataset.rule) {
      if (el.getAttribute('aria-pressed') === 'true') return;
      const v = el.dataset.v;
      act({ act: 'rules', [el.dataset.rule]: /^\d+$/.test(v) ? +v : v }, 'own');
      return;
    }
    if (k === 'close' && st.bout) { act({ act: 'close', n: st.bout.n }); return; }
    if (k === 'finish' && !confirm(T('Закончить турнир? Победителем станет нынешний царь горы.'))) return;
    if (k === 'start' || k === 'undo' || k === 'finish') act({ act: k });
  });
  // вкладка снова на экране — сразу свежий снимок, не дожидаясь следующего опроса
  document.addEventListener('visibilitychange', () => { if (code && R && !document.hidden) poll(true); });

  if (!code) { loadDraft(); paintNew(); loadMine(); }
  else { poll(true); tick(); }
})();
