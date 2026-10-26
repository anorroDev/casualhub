// Аватар один на аккаунт: лежит на сервере (/api/photo/<id>/avatar), а на устройстве — его копия.
// Главная, Мнение и профиль сверяют копию с аккаунтом: так аватар видно и с телефона, и с нового браузера.
(() => {
  const ANIM_KEY = 'casualhub.avatarAnim.v1'; // анимированный аватар целиком; в профиле и оценках лежит его первый кадр
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const isImg = (a) => typeof a === 'string' && /^(data:image\/|https?:\/\/)/.test(a);
  const sigOf = (a) => (typeof a === 'string' ? a.slice(-48) : '');
  const shown = (u) => {
    if (!u) return null;
    const a = (read(ANIM_KEY) || {})[u.id];
    return a && a.data && a.sig === sigOf(u.avatar) ? a.data : u.avatar;
  };

  // первый кадр картинки квадратом 160×160, как делает профиль при загрузке аватара
  function stillOf(src) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const S = 160, cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const k = Math.max(S / im.naturalWidth, S / im.naturalHeight);
        const w = im.naturalWidth * k, h = im.naturalHeight * k;
        cv.getContext('2d').drawImage(im, (S - w) / 2, (S - h) / 2, w, h);
        try { res(cv.toDataURL('image/jpeg', 0.88)); } catch (e) { res(null); }
      };
      im.onerror = () => res(null);
      im.src = src;
    });
  }

  // записать аватар в профиль сайта, список профилей и свои оценки
  function apply(id, still, anim) {
    const cur = read('ocenshik.user.v1');
    if (cur && cur.id === id) { cur.avatar = still; write('ocenshik.user.v1', cur); }
    write('ocenshik.users.v1', (read('ocenshik.users.v1') || []).map((u) => (u && u.id === id ? Object.assign(u, { avatar: still }) : u)));
    const ratings = read('ocenshik.ratings.v2');
    if (Array.isArray(ratings)) write('ocenshik.ratings.v2', ratings.map((r) => (r && r.author && r.author.id === id ? Object.assign(r, { author: Object.assign({}, r.author, { avatar: still }) }) : r)));
    const all = read(ANIM_KEY) || {};
    if (anim) all[id] = { data: anim, sig: sigOf(still) }; else delete all[id];
    write(ANIM_KEY, all);
  }

  const call = (path, token, method = 'GET', data) => fetch('/api' + path, {
    method, cache: 'no-store',
    headers: { authorization: 'Bearer ' + token, ...(data ? { 'content-type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });

  // Сверяет аватар текущего профиля с аккаунтом. Если аватар на устройстве поменялся, возвращает { still, anim }.
  async function sync(serverId, token) {
    const user = read('ocenshik.user.v1');
    if (!user || !serverId || !token) return null;
    let srv;
    try {
      const r = await call('/photo/' + encodeURIComponent(serverId) + '/avatar', token);
      if (!r.ok) return null;
      srv = (await r.json()).data || null;
    } catch (e) { return null; }
    const local = shown(user);
    if (!srv) {
      // в аккаунте пусто (аватар ставили до того, как он стал общим): отправляем свой
      if (isImg(local)) call('/photo/avatar', token, 'PUT', { data: local }).catch(() => {});
      return null;
    }
    if (srv === local || srv === user.avatar) return null;
    const anim = /^data:image\/(gif|webp)/.test(srv) ? srv : null;
    const still = anim || srv.length > 150000 ? await stillOf(srv) : srv;
    if (!still) return null;
    apply(user.id, still, anim);
    return { still, anim };
  }

  // аватар сменили на этом устройстве: отправить в аккаунт (или убрать оттуда, если вместо картинки буква)
  function push(token, avatar) {
    if (!token) return Promise.resolve();
    if (isImg(avatar)) return call('/photo/avatar', token, 'PUT', { data: avatar }).catch(() => {});
    return call('/photo/avatar', token, 'DELETE').catch(() => {});
  }

  window.CasualAvatar = { sync, push, apply, shown, isImg };
})();
