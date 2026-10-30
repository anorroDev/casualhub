/* тема ставится до первой отрисовки, чтобы при обновлении страница не мелькала */
try { var cp = JSON.parse(localStorage.getItem('ocenshik.prefs.v1') || 'null'); if (cp && cp.theme && cp.theme !== 'auto') document.documentElement.setAttribute('data-theme', cp.theme); } catch (e) {}
/* пока грузятся оценки, основная часть скрыта и появляется сразу готовой, без промежуточного вида */
document.documentElement.classList.add('booting');
setTimeout(function () { document.documentElement.classList.remove('booting'); }, 2500);
/* направление сдвига между страницами: главная → Мнение → Колесо → Тир-листы */
addEventListener('pagereveal', function (e) {
  if (!e.viewTransition) return;
  var rank = function (u) { try { var p = new URL(u, location.href).pathname; return p.indexOf('/profile') === 0 ? 4 : p.indexOf('/tier') === 0 ? 3 : p.indexOf('/wheel') === 0 ? 2 : p.indexOf('/opinion') === 0 ? 1 : 0; } catch (x) { return 0; } };
  var from = window.navigation && navigation.activation && navigation.activation.from;
  e.viewTransition.types.add(from && rank(from.url) > rank(location.href) ? 'back' : 'forward');
});
