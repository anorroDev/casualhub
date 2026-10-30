/* тема ставится до первой отрисовки, чтобы при обновлении страница не мелькала */
try { var cp = JSON.parse(localStorage.getItem('ocenshik.prefs.v1') || 'null'); if (cp && cp.theme && cp.theme !== 'auto') document.documentElement.setAttribute('data-theme', cp.theme); } catch (e) {}
/* обновили страницу (F5): вступительные анимации не запускаются заново, всё сразу на месте */
try {
  var navE = performance.getEntriesByType('navigation')[0];
  if (navE && navE.type === 'reload') {
    window.CasualReloaded = true;
    var still = document.createElement('style');
    still.textContent = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }';
    document.head.appendChild(still);
    /* и те, что запускает код; бесконечные (медленное вращение колеса) не трогаем */
    var realAnimate = Element.prototype.animate;
    Element.prototype.animate = function (keys, o) {
      if (o && o.iterations === Infinity) return realAnimate.call(this, keys, o);
      return realAnimate.call(this, keys, Object.assign({}, typeof o === 'object' ? o : {}, { duration: 0, delay: 0 }));
    };
    setTimeout(function () {
      Element.prototype.animate = realAnimate;
      document.getAnimations().forEach(function (a) { if (window.CSSAnimation && a instanceof CSSAnimation && a.effect.getTiming().iterations !== Infinity) a.cancel(); });
      still.remove();
    }, 2500);
  }
} catch (e) {}
/* сдвиг между страницами: всё едет туда, где на экране стоит нажатая кнопка. Левая половина экрана — влево, правая — вправо */
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href], [data-go]');
  if (!a || (a.target && a.target !== '_self')) return;
  var r = a.getBoundingClientRect();
  if (!r.width) return;
  try { sessionStorage.setItem('casualhub.side', (r.left + r.width / 2 < document.documentElement.clientWidth * 0.48 ? 'back' : 'forward') + ':' + Date.now()); } catch (x) {}
}, true);
addEventListener('pagereveal', function (e) {
  var side = '';
  try { var saved = (sessionStorage.getItem('casualhub.side') || '').split(':'); sessionStorage.removeItem('casualhub.side'); if (Date.now() - saved[1] < 10000) side = saved[0]; } catch (x) {}
  if (!e.viewTransition) return;
  if (side) { e.viewTransition.types.add(side); return; }
  /* без нажатия (кнопка «назад» в браузере): по порядку страниц в шапке */
  var rank = function (u) { try { var a = new URL(u, location.href), p = a.pathname; return p.indexOf('/admin') === 0 ? 6 : p.indexOf('/profile') === 0 ? (/[?&]all=/.test(a.search) ? 5 : 4) : p.indexOf('/tierlist') === 0 ? 3 : p.indexOf('/wheel') === 0 ? 2 : p.indexOf('/opinion') === 0 ? 1 : 0; } catch (x) { return 0; } };
  /* на iPhone и в старых браузерах нет navigation.activation: откуда пришли, подскажет document.referrer */
  var from = window.navigation && navigation.activation && navigation.activation.from;
  var was = (from && from.url) || document.referrer;
  e.viewTransition.types.add(was && rank(was) > rank(location.href) ? 'back' : 'forward');
});
