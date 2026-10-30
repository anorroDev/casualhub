/* тема ставится до первой отрисовки, чтобы при обновлении страница не мелькала */
try { var cp = JSON.parse(localStorage.getItem('ocenshik.prefs.v1') || 'null'); if (cp && cp.theme && cp.theme !== 'auto') document.documentElement.setAttribute('data-theme', cp.theme); } catch (e) {}
/* пока грузятся оценки, основная часть скрыта и появляется сразу готовой, без промежуточного вида */
document.documentElement.classList.add('booting');
setTimeout(function () { document.documentElement.classList.remove('booting'); }, 2500);
/* вступительные анимации не играют при обновлении (F5) и поверх сдвига между страницами: всё сразу на месте. Бесконечные не трогаем */
function settleIntro(ms) {
  if (!document.getAnimations) return;
  var until = performance.now() + ms;
  requestAnimationFrame(function tick() {
    document.getAnimations().forEach(function (a) {
      var fx = a.effect;
      if (!fx || /view-transition/.test(fx.pseudoElement || '') || fx.getTiming().iterations === Infinity) return;
      try { a.finish(); } catch (x) {}
    });
    if (performance.now() < until) requestAnimationFrame(tick);
  });
}
try {
  var navE = performance.getEntriesByType('navigation')[0];
  var cameBy = (sessionStorage.getItem('casualhub.side') || '').split(':');
  var byClick = 'CSSViewTransitionRule' in window && Date.now() - cameBy[1] < 10000;
  window.CasualSettled = !!(navE && navE.type === 'reload') || byClick;
  if (navE && navE.type === 'reload') settleIntro(2500);
} catch (e) {}
/* сдвиг между страницами: первая кнопка разделов в шапке ведёт влево, остальные вправо, а всё прочее — в ту сторону экрана, где стоит кнопка */
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href], [data-go]');
  if (!a || (a.target && a.target !== '_self')) return;
  var r = a.getBoundingClientRect();
  if (!r.width) return;
  try { sessionStorage.setItem('casualhub.side', ((a.classList.contains('hm-nav') ? a === document.querySelector('header .hm-nav') : r.left + r.width / 2 < document.documentElement.clientWidth * 0.48) ? 'back' : 'forward') + ':' + Date.now()); } catch (x) {}
}, true);
addEventListener('pagereveal', function (e) {
  var side = '';
  try { var saved = (sessionStorage.getItem('casualhub.side') || '').split(':'); sessionStorage.removeItem('casualhub.side'); if (Date.now() - saved[1] < 10000) side = saved[0]; } catch (x) {}
  if (!e.viewTransition) return;
  settleIntro(1000);
  if (side) { e.viewTransition.types.add(side); return; }
  /* без нажатия (кнопка «назад» в браузере): по порядку страниц в шапке */
  var rank = function (u) { try { var a = new URL(u, location.href), p = a.pathname; return p.indexOf('/admin') === 0 ? 6 : p.indexOf('/profile') === 0 ? (/[?&]all=/.test(a.search) ? 5 : 4) : p.indexOf('/tierlist') === 0 ? 3 : p.indexOf('/wheel') === 0 ? 2 : p.indexOf('/opinion') === 0 ? 1 : 0; } catch (x) { return 0; } };
  /* на iPhone и в старых браузерах нет navigation.activation: откуда пришли, подскажет document.referrer */
  var from = window.navigation && navigation.activation && navigation.activation.from;
  var was = (from && from.url) || document.referrer;
  e.viewTransition.types.add(was && rank(was) > rank(location.href) ? 'back' : 'forward');
});
