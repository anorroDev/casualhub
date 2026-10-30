/* тема ставится до первой отрисовки, чтобы при обновлении страница не мелькала */
try { var cp = JSON.parse(localStorage.getItem('ocenshik.prefs.v1') || 'null'); if (cp && cp.theme && cp.theme !== 'auto') document.documentElement.setAttribute('data-theme', cp.theme); } catch (e) {}
/* направление сдвига между страницами: главная → Мнение → Колесо → Тир-листы */
addEventListener('pagereveal', function (e) {
  if (!e.viewTransition) return;
  var rank = function (u) { try { var a = new URL(u, location.href), p = a.pathname; return p.indexOf('/admin') === 0 ? 6 : p.indexOf('/profile') === 0 ? (/[?&]all=/.test(a.search) ? 5 : 4) : p.indexOf('/tierlist') === 0 ? 3 : p.indexOf('/wheel') === 0 ? 2 : p.indexOf('/opinion') === 0 ? 1 : 0; } catch (x) { return 0; } };
  /* на iPhone и в старых браузерах нет navigation.activation: откуда пришли, подскажет document.referrer */
  var from = window.navigation && navigation.activation && navigation.activation.from;
  var was = (from && from.url) || document.referrer;
  e.viewTransition.types.add(was && rank(was) > rank(location.href) ? 'back' : 'forward');
});
