/* Казуал Хаб: подсказки для новичков на всех страницах.
   Карточка «Впервые тут? Всё просто» с тремя шагами висит, пока не нажали «Понятно 👍».
   Открыть её снова можно всегда: кнопкой «❓ Помощь» в шапке, круглой «❓» в углу (она появляется, когда шапка
   уехала за экран) или клавишей «?». Если карточка есть в разметке страницы (Мнение, Колесо), берётся она,
   иначе карточка создаётся здесь. */
(() => {
  const KEY = 'casualhub.howto.v1';
  const path = location.pathname;
  const PAGE = path.startsWith('/mnenie') ? 'mnenie' : path.startsWith('/koleso') ? 'koleso' : path.startsWith('/profile') ? 'profile' : 'hub';
  // шаги для страниц, где карточки нет в разметке
  const STEPS = {
    hub: [
      '<b>Мнение</b> — оценивай игры, фильмы, еду, что угодно по шкале от 1 до 10, рейтинг соберётся сам',
      '<b>Колесо</b> — впиши варианты или участников и крути: кто вылетит, кто победит',
      'Вверху кнопка аккаунта: <b>войди</b>, чтобы оценки были на всех твоих устройствах и их видели друзья. Там же <b>«Друзья»</b> и <b>тема</b>',
    ],
    profile: [
      'Тут вся твоя статистика: сколько оценок, средний балл, лучшие и значки за достижения',
      'Нажми на аватарку или баннер, чтобы поставить свою картинку, а <b>«＋ стикер»</b> под ником — чтобы добавить стикер из колеса',
      'Ниже все твои оценки: их можно искать и сортировать. Числа сверху кликаются и ведут к нужному разделу',
    ],
  };
  // вкладка на телефоне, где живёт карточка
  const HOME = { mnenie: 'rate', koleso: 'wheel' };

  const css = document.createElement('style');
  css.textContent = `
.howto { position: relative; display: grid; gap: 12px; margin: 0 0 18px; padding: 16px 16px 14px; border-radius: 18px; background: linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--accent-soft) 60%, var(--panel))); border: 2px solid var(--accent); box-shadow: 0 14px 34px -18px color-mix(in srgb, var(--accent) 70%, transparent); text-align: left; animation: howto-in .6s cubic-bezier(.34, 1.56, .64, 1) both, howto-nudge 2.4s ease-in-out 1.2s 3; }
.howto[hidden] { display: none; }
.howto.again { animation: howto-in .6s cubic-bezier(.34, 1.56, .64, 1) both; }
@keyframes howto-in { from { transform: translateY(-14px) scale(.96); } }
@keyframes howto-nudge { 0%, 30%, 60%, 100% { transform: none; } 15% { transform: translateY(-5px); } 45% { transform: translateY(-2px); } }
.howto-head { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 800; line-height: 1.2; color: var(--ink); }
.howto-wave { display: inline-block; font-size: 26px; transform-origin: 70% 80%; animation: howto-wave 1.6s ease-in-out .6s 3; }
@keyframes howto-wave { 0%, 60%, 100% { transform: rotate(0); } 10%, 30% { transform: rotate(16deg); } 20%, 40% { transform: rotate(-10deg); } }
.howto ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
.howto li { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 11px; align-items: center; font-size: 15px; line-height: 1.4; color: var(--ink); animation: howto-step .5s cubic-bezier(.34, 1.56, .64, 1) backwards; }
.howto li:nth-child(2) { animation-delay: .12s; }
.howto li:nth-child(3) { animation-delay: .24s; }
@keyframes howto-step { from { transform: translateX(-14px); } }
.howto li > b { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: var(--on-accent, #fff); font-size: 14px; font-weight: 800; box-shadow: 0 4px 10px -4px var(--accent); }
.howto li span b { font-weight: 800; }
.howto-x { justify-self: end; height: 40px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-size: 14.5px; font-weight: 800; cursor: pointer; transition: transform .2s cubic-bezier(.34, 1.56, .64, 1); }
.howto-x:hover { transform: translateY(-2px) scale(1.03); }
.howto-x:active { transform: scale(.95); }
.howto-page { width: min(100%, 640px); margin: 4px auto 18px; }
.howto-btn { gap: 5px; }
@media (max-width: 560px) { .hb-t { display: none; } .howto-x { justify-self: stretch; } }
.howto-fab { position: fixed; right: max(14px, env(safe-area-inset-right, 0px)); bottom: calc(env(safe-area-inset-bottom, 0px) + 16px + var(--fab-lift, 0px)); z-index: 60; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--accent); background: var(--panel); color: var(--ink); font: inherit; font-size: 21px; line-height: 1; cursor: pointer; box-shadow: 0 10px 26px -12px color-mix(in srgb, var(--accent) 80%, transparent); transform: translateY(calc(100% + 40px + var(--fab-lift, 0px))) scale(.6); transition: transform .45s cubic-bezier(.34, 1.56, .64, 1), bottom .25s; }
.howto-fab.on { transform: none; }
.howto-fab.on:hover { transform: translateY(-3px) scale(1.06); }
.howto-fab.on:active { transform: scale(.92); }
@media (prefers-reduced-motion: reduce) { .howto, .howto li, .howto-wave, .howto.again { animation: none; } .howto-fab { transition: none; } }`;
  document.head.appendChild(css);

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const mark = (v) => { try { const m = read(); m[PAGE] = v; localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function makeBox() {
    const box = document.createElement('div');
    box.className = 'howto howto-page';
    box.id = 'howto';
    box.hidden = true;
    box.innerHTML = `<div class="howto-head"><span class="howto-wave" aria-hidden="true">👋</span><span>Впервые тут? Всё просто:</span></div>
      <ol>${STEPS[PAGE].map((s, i) => `<li><b>${i + 1}</b><span>${s}</span></li>`).join('')}</ol>
      <button type="button" class="howto-x">Понятно 👍</button>`;
    // главная: под заголовком, перед карточками; профиль: над содержимым (сам профиль перерисовывается и карточку бы стёр)
    const anchor = PAGE === 'profile' ? document.getElementById('app') : (document.querySelector('.page > .apps') || document.querySelector('main'));
    if (anchor) anchor.parentNode.insertBefore(box, anchor); else document.body.prepend(box);
    return box;
  }
  function makeHeaderBtn() {
    const pick = document.getElementById('themePick');
    if (!pick) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'howtoBtn';
    // кнопка в том же стиле, что и соседние в шапке
    const twin = pick.querySelector('summary');
    b.className = (twin && /\bpill\b/.test(twin.className) ? 'pill' : 'theme-btn') + ' howto-btn';
    b.title = 'Как пользоваться';
    b.setAttribute('aria-controls', 'howto');
    b.innerHTML = '<span aria-hidden="true">❓</span><span class="hb-t">Помощь</span>';
    pick.parentNode.insertBefore(b, pick);
    return b;
  }

  function init() {
    const box = document.getElementById('howto') || (STEPS[PAGE] ? makeBox() : null);
    if (!box) return;
    const btn = document.getElementById('howtoBtn') || makeHeaderBtn();
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'howto-fab';
    fab.title = 'Как пользоваться';
    fab.setAttribute('aria-label', 'Как пользоваться: открыть подсказку');
    fab.textContent = '❓';
    fab.tabIndex = -1;
    document.body.appendChild(fab);

    const shown = () => !box.hidden && box.offsetHeight > 0;
    const sync = () => { if (btn) btn.setAttribute('aria-expanded', String(shown())); };
    box.hidden = !!read()[PAGE];
    sync();
    function open() {
      mark(false);
      box.hidden = false;
      if (!box.offsetHeight && HOME[PAGE]) { const tab = document.querySelector(`[data-section="${HOME[PAGE]}"]`); if (tab) tab.click(); }
      box.classList.remove('again'); void box.offsetWidth; box.classList.add('again');
      box.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
      sync(); later();
    }
    function close() { mark(true); box.hidden = true; sync(); later(); }
    box.querySelector('.howto-x').addEventListener('click', close);
    // «❓ Помощь»: подсказку не видно — показать, видно — спрятать
    if (btn) btn.addEventListener('click', () => (shown() ? close() : open()));
    fab.addEventListener('click', open);
    addEventListener('keydown', (e) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault();
      open();
    });

    // круглая «❓» видна, когда кнопка в шапке и сама подсказка ушли за экран; держится над нижними панелями (кнопка «Сохранить» и т. п.)
    let q = false;
    function place() {
      q = false;
      const vh = innerHeight;
      const off = (el) => { if (!el) return true; const r = el.getBoundingClientRect(); return !r.height || r.bottom < 0 || r.top > vh; };
      const want = off(btn) && (box.hidden || off(box));
      let lift = 0;
      if (want) {
        for (const el of document.querySelectorAll('.scorebar, .mnav, [data-fab-avoid]')) {
          const r = el.getBoundingClientRect();
          if (r.height && r.bottom >= vh - 2 && r.top < vh && r.right > innerWidth - 80) lift = Math.max(lift, vh - r.top);
        }
      }
      fab.style.setProperty('--fab-lift', lift + 'px');
      fab.classList.toggle('on', want);
      fab.tabIndex = want ? 0 : -1;
    }
    function later() { if (!q) { q = true; requestAnimationFrame(place); } }
    addEventListener('scroll', later, { passive: true });
    addEventListener('resize', later);
    addEventListener('click', () => setTimeout(later, 80));
    place();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
