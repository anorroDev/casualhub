/* Казуал Хаб: кнопка профиля справа вверху на каждой странице.
   Ставится в [data-account] (класс кнопки берётся из data-cls, чтобы она выглядела как соседние) и рисуется сразу,
   до первой отрисовки страницы: иначе ряд кнопок шапки съезжает, когда она появляется. */
(function () {
  var read = function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var css = document.createElement('style');
  css.textContent = '.acct-btn{display:inline-flex;align-items:center;gap:7px;text-decoration:none;white-space:nowrap}'
    + '.acct-btn .acct-ava{flex:none;width:24px;height:24px;border-radius:50%;display:inline-grid;place-items:center;background-position:center;background-size:cover;color:#fff;font-size:12px;font-weight:800;line-height:1;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent,#3550E8) 55%,transparent)}'
    + '.acct-btn .acct-name{max-width:130px;overflow:hidden;text-overflow:ellipsis}'
    + '.acct-btn[aria-current="page"]{border-color:var(--accent,#3550E8)}'
    + '@media (max-width:560px){.acct-btn .acct-name{max-width:72px}}';
  document.head.appendChild(css);
  var USER_ICON = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3"/></svg>';
  function render() {
    var user = read('ocenshik.user.v1');
    // свой профиль открывается и по /u/<имя> или ?id=: это знает только страница профиля, она ставит own
    var here = (/^\/profile\/?$/.test(location.pathname) && !/[?&](id|all)=/.test(location.search)) || window.CasualAccount.own;
    document.querySelectorAll('[data-account]').forEach(function (slot) {
      var cls = slot.getAttribute('data-cls') || 'pill';
      if (!user || !user.name) {
        slot.innerHTML = '<a class="' + esc(cls) + ' acct-btn" href="/opinion/#login" title="Войти или зарегистрироваться">' + USER_ICON + '<span class="acct-name">Войти</span></a>';
        return;
      }
      var img = typeof user.avatar === 'string' && /^(data:image\/|https?:\/\/)/.test(user.avatar);
      // анимированный аватар хранится отдельно; показываем его, если он от этой же картинки
      var anim = (read('casualhub.avatarAnim.v1') || {})[user.id];
      var src = img && anim && anim.data && anim.sig === user.avatar.slice(-48) ? anim.data : user.avatar;
      var ava = img
        ? '<span class="acct-ava" style="background-image:url(\'' + esc(src) + '\')"></span>'
        : '<span class="acct-ava" style="background-color:' + esc(user.color || '#3550E8') + '">' + esc(String(user.name).charAt(0).toUpperCase()) + '</span>';
      slot.innerHTML = '<a class="' + esc(cls) + ' acct-btn" href="/profile/" title="Мой профиль"' + (here ? ' aria-current="page"' : '') + '>' + ava + '<span class="acct-name">' + esc(user.name) + '</span></a>';
    });
  }
  window.CasualAccount = { render: render, own: false };
  render();
  // вошли, вышли или сменили аватар в другой вкладке — кнопка обновляется сама
  window.addEventListener('storage', function (e) { if (e.key === 'ocenshik.user.v1' || e.key === 'casualhub.avatarAnim.v1') render(); });
})();
