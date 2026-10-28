/* Появление разделов: то, что показывается после нажатия, чуть выезжает снизу (без затухания).
   Включается через секунду после загрузки, чтобы стартовая отрисовка ничего не дёргала. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SEL = '[role="tabpanel"], .card, #friendBoard, .board-list, #tierBoard, .example-bar, .empty, .board-bar, .friend-bar, .editor';
  const kick = n => {
    if (!(n instanceof Element) || !n.matches(SEL)) return;
    n.classList.remove('enter');
    void n.offsetWidth;
    n.classList.add('enter');
  };
  addEventListener('animationend', e => { if (e.animationName === 'enter-up' && e.target.classList) e.target.classList.remove('enter'); });
  const start = () => setTimeout(() => {
    new MutationObserver(ms => {
      for (const m of ms) {
        const n = m.target;
        if (m.attributeName === 'hidden' && !n.hidden) kick(n);
        if (m.attributeName === 'data-section') n.querySelectorAll(':scope > .card').forEach(c => { if (getComputedStyle(c).display !== 'none') kick(c); });
      }
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden', 'data-section'] });
  }, 1000);
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
})();

/* Ссылки с главной: /mnenie/#login, #reg и #profile сразу открывают окно аккаунта */
function openAuthFromHash() {
  const h = location.hash;
  if (/^#(login|reg|profile)$/.test(h)) {
    const tab = h.slice(1);
    history.replaceState(null, '', location.pathname + location.search);
    // «Настроить профиль» из профиля сразу открывает настройки (без входа — окно входа)
    Promise.resolve(ready).then(() => openAuthModal(tab === 'profile' ? (state.user ? 'edit' : undefined) : tab));
    return;
  }
  // ссылка для друзей с Letterboxd: /mnenie/#letterboxd сразу открывает импорт
  if (h === '#letterboxd') {
    history.replaceState(null, '', location.pathname + location.search);
    Promise.resolve(ready).catch(() => {}).then(() => { if (window.CasualLetterboxd) window.CasualLetterboxd.open(); });
    return;
  }
  // «Обновить обложки и названия» из меню ☰ на других страницах
  if (h === '#refresh') {
    history.replaceState(null, '', location.pathname + location.search);
    Promise.resolve(ready).catch(() => {}).then(async () => {
      for (let i = 0; i < 20 && !(window.casualApi && window.casualApi.online()); i++) await new Promise(r => setTimeout(r, 150)); // ждём вход в аккаунт
      if (window.CasualRefresh) window.CasualRefresh.open();
    });
    return;
  }
  // ссылки с главной и из профиля: #r=<оценка>, #friend=<друг>&r=<оценка>, #friends, #rating
  const q = new URLSearchParams(h.slice(1));
  if (!q.has('r') && !q.has('friend') && h !== '#friends' && h !== '#rating') return;
  history.replaceState(null, '', location.pathname + location.search);
  Promise.resolve(ready).catch(() => {}).then(async () => {
    for (let i = 0; i < 20 && !window.CasualFriends; i++) await new Promise(r => setTimeout(r, 150)); // модуль друзей грузится последним
    if (h === '#rating') { if (isNarrow()) setSection('board'); else setView('board'); return; }
    if (h === '#friends') { if (window.CasualFriends) window.CasualFriends.openSheet(); return; }
    if (q.has('friend')) { if (window.CasualFriends) window.CasualFriends.showFriend(q.get('friend'), q.get('r')); return; }
    // своя оценка могла прийти из аккаунта чуть позже загрузки: ждём её несколько секунд
    const id = q.get('r');
    for (let i = 0; i < 24 && !state.ratings.some(x => x.id === id); i++) await new Promise(r => setTimeout(r, 250));
    goToRating(id);
    if (q.get('share')) { const r = state.ratings.find(x => x.id === id); if (r) openShare(exportFromRating(r)); }
    // страница ещё раскладывается после загрузки: доводим прокрутку до оценки ещё раз
    for (const ms of [700, 1400]) setTimeout(() => {
      const li = el.board.querySelector(`.entry[data-id="${CSS.escape(id)}"]`);
      if (!li) return;
      const r = li.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) li.scrollIntoView({ block: 'center' });
    }, ms);
  });
}
openAuthFromHash();
addEventListener('hashchange', openAuthFromHash);

/* оценки загружены и разложены: показываем основную часть разом */
Promise.resolve(ready).catch(() => {}).then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('booting')));
});
