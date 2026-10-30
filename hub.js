(() => {
  const $ = (s) => document.querySelector(s);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
  };
  const chip = (num, word, cls, go) => `<span class="chip${cls ? ' ' + cls : ''}"${go ? ` data-go="${go}"` : ''}><b>${num}</b>${word}</span>`;
  const fmt = (n) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const tierT = (t) => (t == null ? 'none' : t >= 7.5 ? 'good' : t >= 5 ? 'mid' : 'bad');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- аккаунт (тот же, что в Мнении Казуала) ----------
  const user = read('ocenshik.user.v1');
  const renderAccount = () => window.hubRenderAccount(); // кнопка профиля рисуется сразу после шапки

  // ---------- точные переходы внутри карточек: строка топа — к оценке, чип — к рейтингу или друзьям ----------
  document.querySelector('.apps').addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    e.preventDefault();
    location.href = go.dataset.go;
  });

  // ---------- что лежит в разделах ----------
  const ratings = (read('ocenshik.ratings.v2') || []).filter((r) => r && !r.example);
  const mine = user ? ratings.filter((r) => r.author && r.author.id === user.id) : ratings;
  const mMeta = $('#opinionMeta');
  mMeta.innerHTML = '<span id="mnCount" style="display:contents"></span>';
  const renderMnCount = (n) => { $('#mnCount').innerHTML = n ? chip(n, plural(n, 'оценка', 'оценки', 'оценок'), 'go', '/opinion/#rating') : '<span class="chip">Пока ни одной оценки</span>'; };
  renderMnCount(mine.length);

  const wheel = read('koleso-vybyvanie-v1');
  const items = wheel && Array.isArray(wheel.items) ? wheel.items : [];
  const alive = items.filter((i) => !i.out).length;
  const total = items.length;
  $('#wheelMeta').innerHTML = total
    ? chip(alive, plural(alive, 'участник', 'участника', 'участников') + (alive < total ? ` из ${total}` : '') + ' на колесе')
    : '<span class="chip">Колесо пустое</span>';

  // ---------- превью Мнения: свой топ-3 или примеры ----------
  function renderMnPreview(list) {
  const top = list.filter((r) => typeof r.total === 'number' && r.name).sort((a, b) => b.total - a.total).slice(0, 3);
  const rows = top.length ? top.map((r) => ({ name: r.name, t: r.total, id: r.id }))
    : [{ name: 'Интерстеллар', t: 9.8 }, { name: 'The Witcher 3', t: 9.3 }, { name: 'Hades', t: 8.4 }];
  const barsOf = (on) => Array.from({ length: 10 }, (_, j) => `<b style="--j:${j};height:${30 + j * 7}%"${j < on ? ' class="on"' : ''}></b>`).join('');
  // своих оценок меньше трёх: пустые места ждут следующих
  const ghosts = Array.from({ length: 3 - rows.length }, (_, g) => `<span class="pv-row ghost" style="--k:${rows.length + g}"><span class="pv-rank">${rows.length + g + 1}</span><span class="pv-name">${g ? '…' : 'Следующая оценка'}</span><span class="pv-bar">${barsOf(0)}</span><span class="pv-badge">—</span></span>`).join('');
  $('#mnPreview').innerHTML = (top.length ? '<span class="pv-tag">твой топ</span>' : '<span class="pv-tag">пример</span>')
    + rows.map((r, k) => `<span class="pv-row" data-tier="${tierT(r.t)}" style="--k:${k}"${r.id ? ` data-go="/opinion/#r=${encodeURIComponent(r.id)}" title="Открыть оценку «${esc(r.name)}»"` : ''}><span class="pv-rank">${k + 1}</span><span class="pv-name">${esc(r.name)}</span><span class="pv-bar">${barsOf(Math.round(r.t))}</span><span class="pv-badge">${fmt(r.t)}</span></span>`).join('')
    + ghosts;
  }
  renderMnPreview(mine);

  // ---------- превью Колеса: настоящее мини-колесо ----------
  // Крутятся только обычные блоки с готовой картинкой внутри: видеокарта двигает их сама, без перерисовки
  const COLORS = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#06B6D4', '#F97316', '#14B8A6'];
  const aliveNames = items.filter((i) => !i.out).map((i) => i.name).filter(Boolean);
  const allNames = items.map((i) => i.name).filter(Boolean);
  // на колесе живых меньше двух (розыгрыш закончен): показываем всех участников, а не пример
  const names = (aliveNames.length >= 2 ? aliveNames : allNames).slice(0, 12);
  const seg = names.length >= 2 ? names : ['Hollow Knight', 'Hades', 'Celeste', 'Outer Wilds', 'Disco Elysium', 'Inscryption'];
  const n = seg.length, R = 76, C = 84, step = 360 / n;
  const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)].map((v) => v.toFixed(2)); };
  let paths = '', lines = '', ticks = '';
  for (let i = 0; i < n; i++) {
    const a0 = i * step, a1 = a0 + step;
    paths += `<path d="M${C} ${C}L${pt(a0, R).join(' ')}A${R} ${R} 0 ${step > 180 ? 1 : 0} 1 ${pt(a1, R).join(' ')}Z" fill="${COLORS[i % COLORS.length]}"/>`;
    const [x, y] = pt(a0, R);
    lines += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}"/>`;
  }
  for (let i = 0; i < n * 2; i++) { const [x, y] = pt(i * step / 2, R + 4); ticks += `<circle cx="${x}" cy="${y}" r="1.6" fill="var(--panel)"/>`; }
  $('#wheel').innerHTML =
    `<svg class="wheel-layer" viewBox="0 0 168 168"><circle cx="${C}" cy="${C}" r="${R + 7}" fill="var(--ink)"/></svg>`
    + `<span class="wheel-layer"><span id="wheelIdle"><span id="wheelRot"><svg viewBox="0 0 168 168">${paths}<g stroke="rgba(0,0,0,.18)" stroke-width="1">${lines}</g></svg></span></span></span>`
    + `<svg class="wheel-layer" viewBox="0 0 168 168">${ticks}<circle cx="${C}" cy="${C}" r="17" fill="var(--accent)" stroke="var(--panel)" stroke-width="4"/></svg>`
    + `<svg class="wheel-ptr" viewBox="0 0 20 22"><path d="M10 22L1 4a3 3 0 0 1 2.7-4h12.6A3 3 0 0 1 19 4z" fill="var(--panel)" stroke="var(--ink)" stroke-width="2"/></svg>`;
  const rotEl = $('#wheelRot'), idleEl = $('#wheelIdle'), nameEl = $('#wheelName'), ptr = document.querySelector('.wheel-ptr');
  const IDLE = 60000, SPIN = 3200, SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
  const idle = calm ? null : idleEl.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: IDLE, iterations: Infinity });
  // угол считаем по времени анимаций, не трогая стили: так проверка «кто под стрелкой» ничего не стоит
  let from = 0, to = 0, spinAnim = null;
  const idleAngle = () => (idle ? ((idle.currentTime || 0) % IDLE) / IDLE * 360 : 0);
  const spinAngle = () => {
    if (!spinAnim || spinAnim.playState !== 'running') return to;
    const p = spinAnim.effect.getComputedTiming().progress;
    return p == null ? to : from + (to - from) * p;
  };
  const under = () => {
    const rot = ((idleAngle() + spinAngle()) % 360 + 360) % 360;
    return seg[Math.floor(((360 - rot) % 360) / step) % n];
  };
  const showName = (s) => {
    if (nameEl.textContent === s) return;
    nameEl.textContent = s;
    if (!calm) nameEl.animate([{ transform: 'none' }, { transform: 'translateY(-5px) scale(1.05)' }, { transform: 'none' }], { duration: 300, easing: SPRING });
  };
  const flick = () => ptr.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(0deg)' }], { duration: 120, easing: 'ease-in-out' });
  nameEl.textContent = under();
  let watching = false;
  const watch = () => {
    let last = nameEl.textContent;
    const loop = () => {
      const s = under();
      if (s !== last) { last = s; showName(s); flick(); }
      if (watching) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  const spin = () => {
    if (calm) return;
    from = spinAngle();
    if (spinAnim) spinAnim.cancel();
    to = from + 720 + Math.floor(Math.random() * 360);
    if (idle) idle.pause();
    spinAnim = rotEl.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }], { duration: SPIN, easing: 'cubic-bezier(.12, .7, .12, 1)', fill: 'forwards' });
    spinAnim.onfinish = () => { watching = false; showName(under()); if (idle) idle.play(); };
    if (!watching) { watching = true; watch(); }
  };
  const wheelCard = document.querySelector('.app[href="/wheel/"]');
  wheelCard.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') spin(); });
  // на телефоне наводить нечем: колесо крутится само, когда показывается на экране
  if (!matchMedia('(hover: hover)').matches && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) spin(); }), { threshold: 0.7 }).observe(document.getElementById('wheel'));
  }

  // ---------- шкала в шапке: проведи и оцени ----------
  const meter = $('#meter'), read$ = $('#meterRead'), scoreEl = $('#meterScore'), wordEl = $('#meterWord'), hintEl = $('#meterHint');
  meter.innerHTML = Array.from({ length: 10 }, (_, i) => `<i style="--d:${i * 45}"></i>`).join('');
  const cells = [...meter.children];
  // у каждого балла своё слово (те же, что в Мнении Казуала)
  const WORDS = { 1: 'Ужас', 2: 'Провал', 3: 'Плохо', 4: 'Слабо', 5: 'Средне', 6: 'Нормально', 7: 'Неплохо', 8: 'Хорошо', 9: 'Отлично', 10: 'Шедевр' };
  const tierV = (v) => (v >= 8 ? 'good' : v >= 5 ? 'mid' : 'bad');
  let val = 0;
  const setVal = (v, quiet) => {
    v = Math.max(1, Math.min(10, v));
    if (v === val) return;
    val = v;
    cells.forEach((c, i) => { c.classList.toggle('on', i < v); c.classList.toggle('knob', i + 1 === v); });
    meter.dataset.tier = read$.dataset.tier = tierV(v);
    meter.setAttribute('aria-valuenow', String(v));
    meter.setAttribute('aria-valuetext', `${v} из 10, ${WORDS[v].toLowerCase()}`);
    scoreEl.textContent = v; wordEl.textContent = WORDS[v];
    if (!quiet && !calm) scoreEl.animate([{ transform: 'none' }, { transform: 'scale(1.14) rotate(-3deg)' }, { transform: 'none' }], { duration: 360, easing: SPRING });
  };
  let meterBox = null;
  const fromX = (x) => { const r = meterBox || meter.getBoundingClientRect(); return Math.ceil(((x - r.left) / r.width) * 10) || 1; };
  let drag = false, touched = false;
  meter.addEventListener('pointerenter', () => { meterBox = meter.getBoundingClientRect(); });
  meter.addEventListener('pointerleave', () => { meterBox = null; });
  meter.addEventListener('pointerdown', (e) => { meterBox = meter.getBoundingClientRect(); drag = true; touched = true; meter.classList.add('live'); meter.setPointerCapture(e.pointerId); setVal(fromX(e.clientX)); hintEl.textContent = 'Так и оценивают в Мнении'; });
  meter.addEventListener('pointermove', (e) => { if (drag || e.pointerType === 'mouse') { meter.classList.add('live'); touched = true; setVal(fromX(e.clientX)); } });
  meter.addEventListener('pointerup', () => { drag = false; });
  meter.addEventListener('pointercancel', () => { drag = false; });
  meter.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (k) { e.preventDefault(); touched = true; meter.classList.add('live'); setVal(val + k); }
    else if (e.key === 'Home') { e.preventDefault(); setVal(1); } else if (e.key === 'End') { e.preventDefault(); setVal(10); }
  });
  // на старте шкала заполняется сама, клетка за клеткой
  if (calm) setVal(10, true);
  else {
    setVal(1, true);
    let v = 1;
    setTimeout(function grow() { if (touched) return; v += 1; setVal(v, v < 10); if (v < 10) setTimeout(grow, 80); }, 900);
  }

  // ---------- карточки: наклон и свет за курсором ----------
  // размеры берём один раз при наведении, а сдвиг применяем раз в кадр
  if (!calm && matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.app').forEach((card) => {
      const spot = card.querySelector('.glow i');
      let box = null, px = 0, py = 0, queued = false;
      const paint = () => {
        queued = false;
        if (!box) return;
        const x = px / box.width, y = py / box.height;
        spot.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        card.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`);
      };
      card.addEventListener('pointerenter', () => { box = card.getBoundingClientRect(); });
      card.addEventListener('pointermove', (e) => {
        if (!box) box = card.getBoundingClientRect();
        px = e.clientX - box.left; py = e.clientY - box.top;
        if (!queued) { queued = true; requestAnimationFrame(paint); }
      });
      card.addEventListener('pointerleave', () => { box = null; card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
  }

  // ---------- лента: что оценили друзья ----------
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
    return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };
  const FC = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#06B6D4', '#F97316', '#14B8A6'];
  const colorOf = (id) => FC[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % FC.length];
  function feedItem(it) {
    const who = esc(it.user.username || 'друг');
    // те же реакции, что в friends.js и на сервере
    const RXI = { fire: '🔥', skull: '💀', nope: '🙅', lol: '😂', love: '😍', like: '👍', dislike: '👎', think: '🤔', cry: '😭', clown: '🤡', moai: '🗿', goat: '🐐' };
    // друг отреагировал на мою оценку
    if (it.kind === 'react') {
      const x = it.react;
      const ico = (x.emoji && RXI[x.emoji]) || '';
      const what = x.emoji === 'nope' ? '🙅 «не согласен» на твою оценку' : ico ? `${ico} на твою оценку` : '💬 комментарий к твоей оценке';
      return `<li><a class="fd" href="/opinion/#r=${encodeURIComponent(x.rid)}" title="Открыть твою оценку">
        <span class="fd-pic rx" style="--fc:${colorOf(it.user.id)}">${ico || '💬'}</span>
        <span class="fd-text"><b>${who}: ${esc(what)}</b><span>«${esc(x.name)}»${x.text ? ' · ' + esc(x.text) : ''} · ${ago(it.at)}</span></span>
        <span class="fd-score none">открыть</span></a></li>`;
    }
    // друг написал мне: на стене профиля или под моей оценкой
    if (it.kind === 'comment') {
      const x = it.comment;
      const href = x.rid ? `/opinion/#r=${encodeURIComponent(x.rid)}` : '/profile/#wallSec';
      return `<li><a class="fd" href="${href}" title="${x.rid ? 'Открыть оценку' : 'Открыть стену профиля'}">
        <span class="fd-pic rx" style="--fc:${colorOf(it.user.id)}">💬</span>
        <span class="fd-text"><b>${who}: ${x.rid ? `комментарий к «${esc(x.name)}»` : 'написал на твоей стене'}</b><span>${esc(x.text)} · ${ago(it.at)}</span></span>
        <span class="fd-score none">открыть</span></a></li>`;
    }
    if (it.kind !== 'rating') return '';
    const r = it.rating;
    const pic = r.photo && r.photo.url ? `<img src="${esc(r.photo.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${esc(String(r.name).charAt(0))}">`
      : r.photo && r.photo.remote ? '' : esc(String(r.name).charAt(0));
    const rx = it.reacts ? Object.keys(RXI).map((k) => (it.reacts[k] ? RXI[k] + it.reacts[k] : '')).concat(it.reacts.text ? ['💬' + it.reacts.text] : []).filter(Boolean).join(' ') : '';
    const meta = [`<em>${who}</em>`, r.cat && esc(r.cat), r.status && esc(r.status), rx, ago(it.at)].filter(Boolean).join(' · ');
    return `<li><a class="fd" href="/opinion/#friend=${encodeURIComponent(it.user.id)}&r=${encodeURIComponent(r.id)}" title="Открыть оценку у ${who}">
      <span class="fd-pic" style="--fc:${colorOf(r.id || r.name)}"${r.photo && r.photo.remote ? ` data-ph="${esc(it.user.id + '|' + r.id)}"` : ''}>${pic || esc(String(r.name).charAt(0))}</span>
      <span class="fd-text"><b>${r.fav ? '★ ' : ''}${esc(r.name)}</b><span>${meta}</span></span>
      ${r.total != null ? `<span class="fd-score" data-tier="${tierT(r.total)}">${fmt(r.total)}</span>` : '<span class="fd-score none">без оценки</span>'}</a></li>`;
  }

  // ---------- онлайн: сколько людей на сайте и кто из друзей в сети (online.js) ----------
  const hubFriends = new Map(); // id -> ник
  function renderOnline() {
    const O = window.CasualOnline;
    if (!O || !O.ready) return;
    // общее число людей на сайте — в шапке, здесь только друзья, которые сейчас в сети
    const on = O.friendsOnline().filter((id) => hubFriends.has(id));
    $('#onlineText').innerHTML = on.length
      ? `Из друзей в сети: ${on.slice(0, 5).map((id) => `<a href="/profile/?id=${encodeURIComponent(id)}">${esc(hubFriends.get(id))}</a>`).join(', ')}${on.length > 5 ? ` и ещё ${on.length - 5}` : ''}`
      : '';
    $('#onlineNow').hidden = !on.length;
  }
  document.addEventListener('casual-online', renderOnline);

  // ---------- друзья: сколько их и есть ли заявки ----------
  const tokens = read('casualhub.tokens.v1') || {};
  const token = user && tokens[user.id];
  if (token) {
    const sidP = user.serverId ? Promise.resolve(user.serverId)
      : fetch('/api/me', { headers: { authorization: 'Bearer ' + token } }).then((r) => (r.ok ? r.json() : null)).then((d) => d && d.user && d.user.id);
    sidP.then((sid) => sid && fetch('/api/shelf/' + encodeURIComponent(sid), { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' }))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.ratings)) return;
        const gone = new Map((d.deleted || []).map((x) => [x.id, +x.at || 0]));
        const stampOf = (x) => +new Date(x.updatedAt || x.createdAt || 0) || 0;
        // аккаунт плюс то, что ещё не успело уйти с этого устройства
        const byId = new Map(d.ratings.filter((x) => x && x.id && !(gone.has(x.id) && stampOf(x) <= gone.get(x.id))).map((x) => [x.id, x]));
        mine.forEach((x) => { const sv = byId.get(x.id); if ((!sv || stampOf(x) > stampOf(sv)) && !(gone.has(x.id) && stampOf(x) <= gone.get(x.id))) byId.set(x.id, x); });
        const list = [...byId.values()];
        renderMnCount(list.length);
        renderMnPreview(list);
      })
      .catch(() => {});
  }
  if (token) {
    // ник, почта и @юзернейм — из аккаунта: поменял ник на другом устройстве, здесь он тоже новый
    fetch('/api/me', { headers: { authorization: 'Bearer ' + token } }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const u = d && d.user;
      if (!u || (u.username === user.name && (u.email || '') === (user.email || '') && (u.handle || '') === (user.handle || ''))) return;
      if (u.username !== user.name && !/^(data:image\/|https?:\/\/)/.test(user.avatar || '')) user.avatar = u.username.charAt(0).toUpperCase(); // аватар-буква следует за ником
      Object.assign(user, { name: u.username, email: u.email || user.email || '', handle: u.handle || '' });
      try {
        localStorage.setItem('ocenshik.user.v1', JSON.stringify(user));
        const all = read('ocenshik.users.v1') || [];
        localStorage.setItem('ocenshik.users.v1', JSON.stringify(all.map((x) => (x.id === user.id ? { ...x, name: user.name, email: user.email, handle: user.handle, avatar: user.avatar } : x))));
      } catch (e) {}
      renderAccount();
    }).catch(() => {});
  }
  if (token && window.CasualAvatar) {
    // аватар общий для аккаунта: на телефоне или в новом браузере подтягивается с сервера
    const sid = user.serverId;
    (sid ? Promise.resolve(sid) : fetch('/api/me', { headers: { authorization: 'Bearer ' + token } }).then((r) => (r.ok ? r.json() : null)).then((d) => d && d.user && d.user.id))
      .then((id) => id && window.CasualAvatar.sync(id, token))
      .then((ch) => {
        if (!ch) return;
        user.avatar = ch.still;
        renderAccount();
      })
      .catch(() => {});
  }
  if (token) {
    fetch('/api/friends', { headers: { authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const f = d.friends.length, inc = d.incoming.length;
        d.friends.forEach((x) => hubFriends.set(x.id, x.username));
        renderOnline();
        if (f) mMeta.insertAdjacentHTML('beforeend', chip(f, plural(f, 'друг', 'друга', 'друзей'), 'go', '/opinion/#friends'));
        if (inc) {
          mMeta.insertAdjacentHTML('beforeend', chip(inc, plural(inc, 'заявка', 'заявки', 'заявок') + ' в друзья', 'alert go', '/opinion/#friends'));
          const dot = $('#reqDot');
          if (dot) { dot.textContent = inc; dot.hidden = false; }
        }
      })
      .catch(() => {});

    // лента: сервер собирает свежие оценки всех друзей
    fetch('/api/feed', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const feed = $('#feed');
        feed.hidden = false;
        if (!d.friends) {
          $('#feedList').innerHTML = '<li class="feed-empty">Тут появятся оценки друзей. <a href="/opinion/">Добавь друзей в Мнении Казуала</a> через кнопку «👥 Друзья».</li>';
          return;
        }
        if (!d.items.length) { $('#feedList').innerHTML = '<li class="feed-empty">Друзья пока ничего не оценили.</li>'; return; }
        $('#feedNote').textContent = `${d.friends} ${plural(d.friends, 'друг', 'друга', 'друзей')}`;
        $('#feedList').innerHTML = d.items.slice(0, 12).map(feedItem).join('');
        // фото по ссылке не открылось: вместо него буква
        document.querySelectorAll('#feedList img[data-fallback]').forEach((img) => { img.onerror = () => img.replaceWith(img.dataset.fallback); if (img.complete && !img.naturalWidth) img.onerror(); });
        // загруженные фото подтягиваются, когда строка видна
        const pics = [...document.querySelectorAll('.fd-pic[data-ph]')];
        const load = (el) => {
          const [u, id] = el.dataset.ph.split('|');
          fetch(`/api/photo/${encodeURIComponent(u)}/${encodeURIComponent(id)}?thumb=1`, { headers: { authorization: 'Bearer ' + token } })
            .then((r) => (r.ok ? r.json() : null))
            .then((p) => {
              if (!p || !p.data) return;
              const img = new Image();
              img.alt = '';
              img.onload = () => { el.textContent = ''; el.appendChild(img); }; // битое фото не показываем, остаётся буква
              img.src = p.data;
            })
            .catch(() => {});
        };
        if ('IntersectionObserver' in window) {
          const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), { rootMargin: '200px' });
          pics.forEach((el) => io.observe(el));
        } else pics.forEach(load);
      })
      .catch(() => {});
  }

  // ---------- темы: те же, что на других страницах ----------
  const THEMES = window.CasualThemes.list; // общий список тем: /themes.js
  const PALETTE = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/></svg>';
  const PREFS_KEY = 'ocenshik.prefs.v1';
  let theme = (read(PREFS_KEY) || {}).theme;
  if (!THEMES.some((t) => t.id === theme)) theme = 'auto';
  function applyTheme(id, save) {
    const th = THEMES.find((t) => t.id === id) || THEMES[0];
    theme = th.id;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    $('#themeBtn').innerHTML = `${PALETTE}<span>Тема: ${th.name}</span>`;
    $('#themeBtn').setAttribute('aria-label', `Тема: ${th.name}`);
    $('#themeMenu').classList.add('tm-grid');
    $('#themeMenu').innerHTML = window.CasualThemes.menuHTML(theme);
    if (save) {
      try {
        let p = read(PREFS_KEY);
        if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
        p.theme = theme;
        localStorage.setItem(PREFS_KEY, JSON.stringify(p));
      } catch (e) {}
    }
  }
  applyTheme(theme, false);
  const pick = $('#themePick');
  // меню тем не уходит за край экрана, где бы ни оказалась кнопка
  pick.addEventListener('toggle', () => {
    const menu = document.getElementById('themeMenu');
    if (!pick.open || !menu) return;
    menu.style.translate = '';
    const box = menu.offsetParent ? menu.offsetParent.getBoundingClientRect() : { left: 0 };
    const left = box.left + menu.offsetLeft, right = left + menu.offsetWidth;
    const shift = left < 8 ? 8 - left : right > innerWidth - 8 ? innerWidth - 8 - right : 0;
    if (shift) menu.style.translate = `${Math.round(shift)}px 0`;
  });
  $('#themeMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    let done = false;
    const go = () => { if (!done) { done = true; applyTheme(b.dataset.themeId, true); } };
    // смена темы расходится кругом от кнопки, где это умеет браузер
    if (document.startViewTransition && !calm) {
      const r = b.getBoundingClientRect();
      document.documentElement.style.setProperty('--tx', `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty('--ty', `${r.top + r.height / 2}px`);
      document.documentElement.classList.add('theme-swap');
      const t = document.startViewTransition(go);
      t.ready.catch(() => {});
      if (t.updateCallbackDone) t.updateCallbackDone.catch(() => {});
      t.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('theme-swap'));
      setTimeout(go, 400); // если переход не начался (вкладка в фоне), тема всё равно сменится
    } else go();
    pick.open = false;
    $('#themeBtn').focus();
  });
  document.addEventListener('click', (e) => { if (pick.open && !pick.contains(e.target)) pick.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pick.open) { pick.open = false; $('#themeBtn').focus(); } });
})();
