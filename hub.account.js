  /* кнопка профиля рисуется сразу, до первой отрисовки: иначе ряд кнопок шапки съезжает вниз, когда она появляется */
  (function () {
    var read = function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    window.hubRenderAccount = function () {
      var acc = document.getElementById('account');
      var user = read('ocenshik.user.v1');
      if (!user || !user.name) { acc.innerHTML = '<a class="pill" href="/mnenie/#login">Войти</a> <a class="pill primary" href="/mnenie/#reg">Регистрация</a>'; return; }
      var anim = (read('casualhub.avatarAnim.v1') || {})[user.id];
      var img = typeof user.avatar === 'string' && /^(data:image\/|https?:\/\/)/.test(user.avatar);
      var src = anim && anim.data && img && anim.sig === user.avatar.slice(-48) ? anim.data : user.avatar;
      var dot = document.getElementById('reqDot');
      var dotText = dot && !dot.hidden ? dot.textContent : '';
      var av = img
        ? '<span class="avatar" style="background-image:url(\'' + esc(src) + '\')"></span>'
        : '<span class="avatar" style="background-color:' + esc(user.color || '#3550E8') + '">' + esc(user.name.charAt(0)) + '</span>';
      acc.innerHTML = '<a class="pill" href="/profile/" title="Мой профиль">' + av + '<span class="acc-name">' + esc(user.name) + '</span><span class="badge-dot" id="reqDot"' + (dotText ? '' : ' hidden') + '>' + esc(dotText) + '</span></a>';
    };
    window.hubRenderAccount();
  })();
