// Журнал обновлений «Что нового»: один файл /whatsnew.html на весь сайт.
// Мнение показывает его во вкладке «Журнал», главная и Колесо — окном по кнопке [data-whatsnew].
(() => {
  const SEEN_KEY = 'casualhub.whatsnewSeen.v1'; // последняя версия, которую человек уже открывал
  let cache = null;

  function load() {
    if (!cache) {
      cache = fetch('/whatsnew', { cache: 'no-cache' }) // Cloudflare отдаёт whatsnew.html по адресу без .html
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
        .then((html) => {
          const box = document.createElement('div');
          box.innerHTML = html;
          const days = box.querySelector('.log-days');
          const top = days && days.querySelector('.rel-v');
          return { html: days ? days.outerHTML : html, stat: (days && days.dataset.stat) || '', latest: top ? top.textContent.trim() : '' };
        })
        .catch((e) => { cache = null; throw e; });
    }
    return cache;
  }
  const seen = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; } };
  const markSeen = (v) => { try { if (v) localStorage.setItem(SEEN_KEY, v); } catch (e) {} };

  // стили окна: только переменные цветов сайта, поэтому одинаково на всех страницах и темах
  const CSS = `
.wn-sheet { position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; overscroll-behavior: contain;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
  background: rgba(5, 6, 10, .55); }
.wn-sheet[hidden] { display: none; }
.wn-card { width: min(620px, 100%); max-height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--panel); color: var(--ink);
  border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 30px 70px -30px rgba(0, 0, 0, .6); animation: wn-pop .32s cubic-bezier(.34, 1.56, .64, 1); }
@keyframes wn-pop { from { transform: translateY(14px) scale(.96); } }
.wn-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--line); }
.wn-head h2 { margin: 0; font-family: var(--font-display); font-weight: 800; font-size: 34px; line-height: .95; }
.wn-head small { display: block; margin-top: 4px; color: var(--ink-3); font-size: 12.5px; font-weight: 600; }
.wn-x { flex: none; width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); color: var(--ink); font-size: 18px; cursor: pointer; }
.wn-x:hover { border-color: var(--accent); }
.wn-x:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wn-body { overflow: auto; -webkit-overflow-scrolling: touch; padding: 0 20px 20px; }
.wn-body .log-days { display: grid; gap: 24px; margin-top: 16px; }
.wn-body .log-date { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0; padding-bottom: 8px; border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 700; }
.wn-body .log-date span { flex: none; font-size: 12.5px; font-weight: 500; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.wn-body .rel { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 10px; padding: 12px 0; }
.wn-body .rel + .rel { border-top: 1px solid var(--line); }
.wn-body .rel-v { padding-top: 1px; font-family: var(--font-display); font-weight: 700; font-size: 22px; line-height: 1; color: var(--ink-3); white-space: nowrap; }
.wn-body .rel h4 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; }
.wn-body .rel p { max-width: 62ch; margin: 3px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--ink-2); text-wrap: pretty; }
/* в патче дня каждое изменение начинается со своего жирного названия на отдельной строке */
.wn-body .rel p > b:first-child { display: block; margin: 14px 0 2px; color: var(--ink); font-size: 14px; }
.wn-body .rel h4 + p > b:first-child { margin-top: 8px; }
.wn-msg { padding: 24px 0; color: var(--ink-2); }
[data-whatsnew] { position: relative; }
[data-whatsnew] .wn-dot { position: absolute; top: 4px; right: 4px; width: 9px; height: 9px; border-radius: 50%; background: var(--bad); box-shadow: 0 0 0 2px var(--panel); }
@media (max-width: 560px) {
  .wn-sheet { place-items: end stretch; padding: 0; }
  .wn-card { width: 100%; max-height: 90vh; max-height: 90dvh; border-bottom: 0; border-radius: 20px 20px 0 0; animation-name: wn-up; }
  @keyframes wn-up { from { transform: translateY(40%); } }
  .wn-head { padding: 16px max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px)); }
  .wn-body { padding: 0 max(16px, env(safe-area-inset-right, 0px)) calc(18px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); }
  .wn-body .rel { grid-template-columns: 62px minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) { .wn-card { animation: none; } }`;

  let sheet = null, lastFocus = null;
  function ensureSheet() {
    if (sheet) return sheet;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    sheet = document.createElement('div');
    sheet.className = 'wn-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'wnTitle');
    sheet.innerHTML = `<div class="wn-card"><div class="wn-head"><div><h2 id="wnTitle">Что нового</h2><small id="wnStat"></small></div>
      <button type="button" class="wn-x" aria-label="Закрыть">✕</button></div><div class="wn-body" id="wnBody"><p class="wn-msg">Загружаю…</p></div></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.wn-x')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
    return sheet;
  }
  function open() {
    const s = ensureSheet();
    lastFocus = document.activeElement;
    s.hidden = false;
    document.documentElement.style.overflow = 'hidden'; // страница под окном не прокручивается
    s.querySelector('.wn-x').focus({ preventScroll: true });
    load().then((d) => {
      s.querySelector('#wnBody').innerHTML = d.html;
      s.querySelector('#wnBody').scrollTop = 0;
      s.querySelector('#wnStat').textContent = d.stat;
      markSeen(d.latest);
      document.querySelectorAll('[data-whatsnew] .wn-dot').forEach((n) => n.remove());
    }, () => { s.querySelector('#wnBody').innerHTML = '<p class="wn-msg">Не получилось загрузить журнал, проверь интернет и попробуй ещё раз.</p>'; });
  }
  function close() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // кнопки на странице: открывают окно и показывают точку, пока свежая версия не просмотрена
  function bindButtons() {
    const btns = document.querySelectorAll('[data-whatsnew]');
    if (!btns.length) return;
    btns.forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));
    load().then((d) => {
      if (d.latest && d.latest !== seen()) btns.forEach((b) => { if (!b.querySelector('.wn-dot')) b.insertAdjacentHTML('beforeend', '<i class="wn-dot" aria-hidden="true"></i>'); });
    }, () => {});
  }

  window.CasualWhatsNew = { load, open, close, markSeen };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButtons);
  else bindButtons();
})();
