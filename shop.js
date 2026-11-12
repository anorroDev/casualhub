/* Казуал Хаб: магазин за рофланы (по-английски Souls) — окно магазина, баланс, что куплено и что надето.
   Подгружается через CasualUtil.script: по кнопке «Магазин» и у вошедших на каждой странице (купленное нужно vasyan.js,
   надетые фон и курсор — всем страницам). Цены, покупка и что надето — на сервере (functions/_lib/shop.js); как выглядит
   каждый предмет (рамки, значки, стили ника, палитры колеса и тир-листа, конфетти) — здесь.
   Снаружи (window.CasualShop):
     owned(id) — куплено ли (бесплатное — всегда); open(section) — окно на разделе: 'profile', 'nick', 'wheel', 'tier',
     'site', 'perks', 'vasyan', 'earn'; balance(); refresh(); worn(slot) — что надето;
     look(ids) — Promise { id: { frame, badge, nick } }: что надето у людей (видят все);
     dress({ avatar, name }, look) — надеть это на аватар и имя на странице;
     confettiPart(g, w, h) — нарисовать одну частицу надетого конфетти (Колесо), false — рисуй своё.
   Событие casualhub:shop на document — изменилось купленное, надетое или баланс.
   Что надето на себе, помнится в этом браузере (casualhub.shop.v1, по id аккаунта): .look.wheel.palette,
   .look.confetti, .look.tier — их читают Колесо и тир-листы, даже если этот файл на странице ещё не загрузился.
   Фон «Пейзаж» включает util.js по ключу casualhub.bg.v1 до первой отрисовки, курсор — этот файл. */
(() => {
  if (window.CasualShop) return;
  const U = window.CasualUtil || {};
  const esc = U.esc || ((v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
  const plural = U.plural || ((n, a, b, c) => { const x = Math.abs(n) % 100, y = x % 10; return x > 10 && x < 20 ? c : y > 1 && y < 5 ? b : y === 1 ? a : c; });
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const user = () => read('ocenshik.user.v1');
  const token = () => { const u = user(); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const uid = () => { const u = user(); return u && token() ? String(u.id) : ''; };
  const nf = (n) => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const coins = (n) => `${nf(n)} ${plural(Math.abs(Math.round(+n || 0)), 'рофлан', 'рофлана', 'рофланов')}`;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tail = (id) => String(id || '').split('.').pop();
  const KEY = 'casualhub.shop.v1';
  const BG_KEY = 'casualhub.bg.v1'; // его читает util.js до первой отрисовки
  const VY_KEY = 'casualhub.vasyan.v1'; // состояние Васяна (vasyan.js): надетые окрас и наряд
  // бесплатное «как у всех» в каждом слоте (сервер считает так же)
  const DEF = { frame: 'shop.frame.none', badge: 'shop.badge.none', nick: 'shop.nick.none', wheel: 'shop.wheel.default', confetti: 'shop.confetti.default', tier: 'shop.tier.default', bg: 'site.bg.stars', cursor: 'site.cursor.default' };
  const FREE = new Set([...Object.values(DEF), 'vasyan.skin.classic', 'vasyan.outfit.none', 'vasyan.food.kibble']);
  // монетка «рофлан» (Souls) — пиксельная, в манере значков званий (/art/shop/roflan-coin.svg)
  const COIN = '/art/shop/roflan-coin.svg';
  const coinImg = (s = 18) => `<img class="sh-coin" src="${COIN}" width="${s}" height="${s}" alt="" decoding="async">`;

  // ---------- как выглядит каждый предмет ----------
  const px = (rows, pal, k = 2) => {
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    let r = '';
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (pal[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>`; }));
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * k}" height="${h * k}" shape-rendering="crispEdges">${r}</svg>`, w: w * k, h: h * k };
  };
  // рамки аватара: кольца без свечения (видны и в казуальном виде)
  const FRAMES = {
    wood: '0 0 0 3px #8B5A2B, 0 0 0 5px #5C3A1A',
    mint: '0 0 0 3px #3CCF91, 0 0 0 6px color-mix(in srgb, #3CCF91 35%, transparent)',
    fire: '0 0 0 2px #FFD24A, 0 0 0 4px #F28E1C, 0 0 0 6px #E8483B',
    ice: '0 0 0 2px #EAF7FF, 0 0 0 4px #7FC8F8, 0 0 0 6px #3A7BD5',
    retro: '0 0 0 2px #E8483B, 0 0 0 4px #F2B134, 0 0 0 6px #3FB950, 0 0 0 8px #2F81F7',
    royal: '0 0 0 2px #FFE08A, 0 0 0 4px #C9780F, 0 0 0 6px #E8483B, 0 0 0 8px #C9780F',
  };
  // стили ника
  const NICKS = {
    serif: 'font-family: Georgia, "PT Serif", "Times New Roman", serif !important; font-style: italic;',
    pixel: 'font-family: var(--font-display, "Handjet", sans-serif) !important; letter-spacing: .02em;',
    outline: 'text-shadow: 1px 0 0 var(--accent, #3550E8), -1px 0 0 var(--accent, #3550E8), 0 1px 0 var(--accent, #3550E8), 0 -1px 0 var(--accent, #3550E8);',
    wave: 'text-decoration: underline wavy var(--accent, #3550E8) !important; text-underline-offset: .24em; text-decoration-thickness: 1.5px !important;',
  };
  // значки у ника: пиксельные картинки, без эмодзи (одинаковы в обычном и казуальном виде)
  const BADGES = {
    potato: px(['...PPPP...', '.PPPPPPPP.', 'PPpPPPPPPP', 'PPPPPPpPPP', 'PPPPPPPPPP', 'PpPPPPPPpP', '.PPPPPPPP.', '...PPPP...'], { P: '#C8955A', p: '#7A4E25' }, 1).svg,
    coffee: px(['..S..S....', '...S..S...', 'XXXXXXXX..', 'XWWWWWWXXX', 'XWCCCCWX.X', 'XWCCCCWXXX', '.XWWWWX...', '..XXXX....'], { X: '#3B2A22', W: '#F4F4F0', C: '#8B5A2B', S: '#9AA1AE' }, 1).svg,
    heart: px(['.XX.XX.', 'XRRXRRX', 'XRRRRRX', 'XRRRRRX', '.XRRRX.', '..XRX..', '...X...'], { X: '#7A1020', R: '#E8483B' }, 1).svg,
    bolt: px(['....XXX', '...XYYX', '..XYYX.', '.XYYYXX', 'XXYYYYX', '.XYYYX.', '.XYYX..', 'XYYX...', 'XXX....'], { X: '#7A4E00', Y: '#FFD24A' }, 1).svg,
    roflan: `<img src="${COIN}" alt="" decoding="async">`,
  };
  // Колесо: палитра секторов (подпись Колесо подбирает само — тёмную или белую)
  const WHEEL_DEF = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#F97316', '#06B6D4', '#E4553F', '#84CC16', '#64748B'];
  const WHEELS = {
    candy: ['#FF9EC7', '#FFD38A', '#A8E6CF', '#B5A8FF', '#FFB3A7', '#9AD8FF', '#FDE68A', '#C4F1BE', '#F5B0E6', '#D9D4FF'],
    ocean: ['#0E7490', '#22D3EE', '#1E3A8A', '#67E8F9', '#2563EB', '#155E75', '#60A5FA', '#0891B2', '#93C5FD', '#3B82F6'],
    neon: ['#FF2E88', '#00F5D4', '#FEE440', '#9B5DE5', '#00BBF9', '#F15BB5', '#7CFF4F', '#FF7A00', '#5CE1E6', '#C77DFF'],
    arcade: ['#E8483B', '#F2B134', '#3FB950', '#2F81F7', '#A371F7', '#F778BA', '#56D4DD', '#FF8A3D', '#B3D334', '#8B949E'],
  };
  const CONFETTI = {
    hearts: { shape: 'heart', colors: ['#FF4D8D', '#FF8FB1', '#E8483B', '#FFB3C7'] },
    stars: { shape: 'star', colors: ['#FFD24A', '#FFF3B8', '#F5C542', '#FFE08A'] },
    roflan: { shape: 'coin', colors: ['#C9CDD6', '#9AA1AE'], img: COIN },
  };
  // тир-листы: цвета рядов S–D для новых тир-листов, палитра рядов, фон и текст картинки при скачивании
  const TIERS = {
    pastel: { rows: ['#A8E6CF', '#DCEDC1', '#FFD3B6', '#FFAAA5', '#FF8B94'], palette: ['#A8E6CF', '#DCEDC1', '#FFD3B6', '#FFAAA5', '#FF8B94', '#F5B0E6', '#C9B8FF', '#A8D8FF', '#B8F0E6', '#D6D9E0'], bg: '#FFF8F0', ink: '#2B2B33' },
    arcade: { rows: ['#3FB950', '#B3D334', '#F2B134', '#FF8A3D', '#E8483B'], palette: WHEELS.arcade, bg: '#0B0D12', ink: '#F3F4F6' },
    night: { rows: ['#7C9CFF', '#9B8CFF', '#C084FC', '#F0ABFC', '#FDA4AF'], palette: ['#7C9CFF', '#9B8CFF', '#C084FC', '#F0ABFC', '#FDA4AF', '#67E8F9', '#5EEAD4', '#FDE68A', '#A5B4FC', '#94A3B8'], bg: '#0A0E1F', ink: '#E8ECFF' },
  };
  // курсоры — пиксельные картинки (SVG): стрелка для всего, та же с заливкой акцентом — для того, что нажимается
  const ARROW = ['X.........', 'XX........', 'XWX.......', 'XWWX......', 'XWWWX.....', 'XWWWWX....', 'XWWWWWX...', 'XWWWWWWX..', 'XWWWWWWWX.', 'XWWWWWXXXX', 'XWWXWWX...', 'XWX.XWWX..', 'XX..XWWX..', 'X....XWWX.', '.....XWWX.', '......XX..'];
  const PAW = ['...XX.XX...', '..XPPXPPX..', '..XPPXPPX..', 'XX.XX.XX.XX', 'XPPX...XPPX', 'XPPX.X.XPPX', '.XX.XPX.XX.', '...XPPPX...', '..XPPPPPX..', '..XPPPPPX..', '...XXXXX...'];
  const CURSORS = {
    pixel: { a: px(ARROW, { X: '#14121A', W: '#FFFFFF' }), b: px(ARROW, { X: '#14121A', W: '#FFD24A' }), at: [1, 1] },
    paw: { a: px(PAW, { X: '#14121A', P: '#F59AC4' }), b: px(PAW, { X: '#14121A', P: '#FFD24A' }), at: [11, 2] },
  };

  // ---------- память браузера: куплено, надето, баланс ----------
  let S = (() => { const c = read(KEY); return c && typeof c === 'object' ? c : {}; })(); // { uid, owned, wear, balance, look, at }
  const mine = () => !!S.uid && S.uid === uid();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  const owned = (id) => FREE.has(String(id)) || (mine() && Array.isArray(S.owned) && S.owned.includes(String(id)));
  const worn = (slot) => (mine() && S.wear && S.wear[slot]) || DEF[slot] || '';
  // то, что надето на себе и нужно другим страницам (Колесо, тир-листы) ещё до загрузки этого файла
  const lookFrom = (w) => ({
    wheel: WHEELS[tail(w.wheel)] ? { palette: WHEELS[tail(w.wheel)] } : null,
    confetti: CONFETTI[tail(w.confetti)] || null,
    tier: TIERS[tail(w.tier)] || null,
  });
  function emit() { document.dispatchEvent(new CustomEvent('casualhub:shop', { detail: { owned: mine() ? (S.owned || []).slice() : [], wear: mine() ? { ...DEF, ...(S.wear || {}) } : { ...DEF }, balance: mine() ? +S.balance || 0 : 0 } })); }

  // ---------- общий стиль: рамки, значки, стили ника (нужен везде, где их показывают) ----------
  (() => {
    if (document.getElementById('shLook')) return;
    const s = document.createElement('style');
    s.id = 'shLook';
    s.textContent = Object.entries(FRAMES).map(([k, v]) => `.sh-fr-${k} { box-shadow: ${v} !important; }`).join('\n')
      + '\n' + Object.entries(NICKS).map(([k, v]) => `.sh-nk-${k} { ${v} }`).join('\n')
      + '\n.sh-badge { display: inline-flex; width: 1em; height: 1em; margin-left: .3em; vertical-align: -.12em; flex: none; }'
      + '\n.sh-badge svg, .sh-badge img { width: 100%; height: 100%; image-rendering: pixelated; border-radius: 50%; }'
      + '\n.sh-badge svg { border-radius: 0; }';
    document.head.appendChild(s);
  })();
  const badgeHTML = (id, title) => (BADGES[tail(id)] ? `<span class="sh-badge" role="img" aria-label="${esc(title || 'Значок')}" title="${esc(title || '')}">${BADGES[tail(id)]}</span>` : '');
  // надеть чужое (или своё) оформление на аватар и имя на странице: look — из look(ids)
  function dress(els, look) {
    const l = look || {};
    const a = els && els.avatar, n = els && els.name;
    if (a) {
      [...a.classList].filter((c) => c.startsWith('sh-fr-')).forEach((c) => a.classList.remove(c));
      if (FRAMES[tail(l.frame)]) a.classList.add('sh-fr-' + tail(l.frame));
    }
    if (n) {
      [...n.classList].filter((c) => c.startsWith('sh-nk-')).forEach((c) => n.classList.remove(c));
      if (NICKS[tail(l.nick)]) n.classList.add('sh-nk-' + tail(l.nick));
      const old = n.querySelector(':scope > .sh-badge');
      if (old) old.remove();
      if (BADGES[tail(l.badge)]) n.insertAdjacentHTML('beforeend', badgeHTML(l.badge, titleOf(l.badge)));
    }
  }
  const looks = new Map(); // id → { at, v }: чужое оформление помним минуту
  async function look(ids) {
    const list = [...new Set((ids || []).map(String).filter((x) => /^[0-9a-f]{24}$/.test(x)))];
    const now = Date.now(), need = list.filter((id) => !looks.has(id) || looks.get(id).at < now - 60e3);
    if (need.length && token()) {
      for (let i = 0; i < need.length; i += 100) {
        try {
          const d = await api('/shop/look?ids=' + need.slice(i, i + 100).join(','));
          need.slice(i, i + 100).forEach((id) => looks.set(id, { at: now, v: (d.users || {})[id] || {} }));
        } catch (e) { break; }
      }
    }
    return Object.fromEntries(list.map((id) => [id, (looks.get(id) || {}).v || {}]));
  }
  // одна частица конфетти (Колесо уже сдвинуло и повернуло холст): false — надетого нет, рисуй своё
  let coinPic = null;
  function confettiPart(g, w, h) {
    const c = mine() && S.look && S.look.confetti;
    if (!c) return false;
    const s = Math.max(w, h);
    if (c.shape === 'coin') {
      if (!coinPic) { coinPic = new Image(); coinPic.src = COIN; }
      if (coinPic.complete && coinPic.naturalWidth) { g.drawImage(coinPic, -s * .9, -s * .9, s * 1.8, s * 1.8); return true; }
      return false;
    }
    g.beginPath();
    if (c.shape === 'heart') {
      const r = s / 2;
      g.moveTo(0, r * .9);
      g.bezierCurveTo(-r * 1.6, -r * .2, -r * .6, -r * 1.3, 0, -r * .35);
      g.bezierCurveTo(r * .6, -r * 1.3, r * 1.6, -r * .2, 0, r * .9);
    } else {
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? s * .32 : s * .75, a = -Math.PI / 2 + (i * Math.PI) / 5; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    }
    g.closePath();
    g.fill();
    return true;
  }

  // ---------- курсор и фон ----------
  const curUrl = (s) => `url("data:image/svg+xml,${encodeURIComponent(s.svg)}")`;
  let curStyle = null;
  function applyCursor() {
    const c = CURSORS[tail(worn('cursor'))];
    if (!c) { if (curStyle) curStyle.textContent = ''; document.documentElement.classList.remove('sh-cur'); return; }
    if (!curStyle) { curStyle = document.createElement('style'); curStyle.id = 'shCursor'; document.head.appendChild(curStyle); }
    const [x, y] = c.at;
    // поля ввода оставляем с обычным текстовым курсором, всё нажимаемое — со своим
    curStyle.textContent = `html.sh-cur, html.sh-cur body { cursor: ${curUrl(c.a)} ${x} ${y}, auto; }
html.sh-cur :is(a[href], button:not(:disabled), [role="button"], [role="tab"], summary, label, select, .pill, [data-tab]) { cursor: ${curUrl(c.b)} ${x} ${y}, pointer !important; }
html.sh-cur :is(input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"]), textarea, [contenteditable="true"]) { cursor: text !important; }`;
    document.documentElement.classList.add('sh-cur');
  }
  const bgNow = () => { try { return localStorage.getItem(BG_KEY) === 'horizon' ? 'horizon' : 'stars'; } catch (e) { return 'stars'; } };
  function applyBg() {
    if (!mine()) return; // фон без аккаунта (?bg=horizon в адресе) не трогаем
    const v = tail(worn('bg')) === 'horizon' ? 'horizon' : 'stars';
    if (bgNow() === v && document.documentElement.dataset.bg === v) return;
    try { if (v === 'horizon') localStorage.setItem(BG_KEY, 'horizon'); else localStorage.removeItem(BG_KEY); } catch (e) {}
    document.documentElement.dataset.bg = v;
  }

  // ---------- сервер ----------
  async function api(path, method = 'GET', body) {
    const r = await fetch('/api' + path, { method, cache: 'no-store', headers: { authorization: 'Bearer ' + token(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Сервер не ответил'); e.status = r.status; e.need = d.need || 0; throw e; }
    return d;
  }
  let D = null; // последний ответ /shop/me: каталог, баланс, заработанное, надетое
  const titleOf = (id) => { const it = D && (D.items || []).find((x) => x.id === id); return it ? it.title : ''; };
  function take(d) {
    if (!d || !d.on) { D = d; return; }
    D = d;
    const before = JSON.stringify([S.owned, S.balance, S.wear]);
    const wear = { ...DEF, ...(d.wear || {}) };
    // owned — купленное и открытое уровнем (еда Васяна); unlock — с какого уровня еда своя без покупки
    S = { ...S, uid: uid(), owned: (d.items || []).filter((x) => x.owned && x.price > 0).map((x) => x.id), balance: +d.balance || 0, wear, look: lookFrom(wear),
      unlock: Object.fromEntries((d.items || []).filter((x) => x.unlock).map((x) => [x.id, x.unlock])), at: Date.now() };
    save();
    applyCursor();
    applyBg();
    if (JSON.stringify([S.owned, S.balance, S.wear]) !== before) emit();
  }
  let loading = null;
  function refresh() {
    if (!token()) return Promise.resolve(null);
    if (!loading) loading = api('/shop/me').then((d) => { take(d); return d; }).finally(() => { loading = null; });
    return loading;
  }

  // ---------- картинки карточек ----------
  // Васян: картинку даёт vasyan.js (CasualVasyan.preview), а пока его нет — своя мордочка с окрасом и нарядом
  const HEAD = ['.O.........O.', 'OOO.......OOO', 'OPOOOOOOOOOPO', 'OMMMMMMMMMMMO', 'MMMMMMMMMMMMM', 'MMEEMMMMMEEMM', 'MMEEMMNMMEEMM', 'MMMMMKMKMMMMM', '.MMMMMMMMMMM.', '..MMMMMMMMM..'];
  const SKIN = {
    classic: { M: '#F4F4F0', O: '#F28E4C', P: '#F59AC4', E: '#1B1B1F', N: '#F59AC4', K: '#1B1B1F' },
    ginger: { M: '#F2A54C', O: '#D9772A', P: '#F59AC4', E: '#1B1B1F', N: '#E26D8F', K: '#1B1B1F' },
    black: { M: '#2C2F38', O: '#1E2027', P: '#C06A8A', E: '#F5D547', N: '#C06A8A', K: '#0E0F12' },
    white: { M: '#FAFAF7', O: '#E9E6DF', P: '#F59AC4', E: '#4AA3E0', N: '#F59AC4', K: '#9AA1AE' },
    tabby: { M: '#A1A6B0', O: '#6E7480', P: '#E8A0B8', E: '#2E7D32', N: '#E26D8F', K: '#1B1B1F', S: '#5B606B' },
    siamese: { M: '#F2E6D3', O: '#5A4032', P: '#B5838D', E: '#4AA3E0', N: '#3B2A22', K: '#3B2A22', D: '#7A5A48' },
    calico: { M: '#F4F4F0', O: '#F28E4C', P: '#F59AC4', E: '#1B1B1F', N: '#F59AC4', K: '#1B1B1F', B: '#353A47' },
    ghost: { M: '#E6EEFF', O: '#C9D7F5', P: '#D7C9F5', E: '#7A8BB0', N: '#B9C6E6', K: '#7A8BB0' },
  };
  // полоски у серого, маска у сиамского, тёмное пятно у трёхцветного — поверх общей мордочки
  const MARKS = {
    tabby: { 3: '.....S.S.....', 4: '....S.S.S....', 8: '.S.........S.' },
    siamese: { 5: '.....DDD.....', 6: '....DDDDD....', 7: '.....DDD.....' },
    calico: { 2: '..........BB.', 3: '.........BBB.', 4: '.........BBBB' },
  };
  const OUTFIT = { // слой поверх, строки от самого верха картинки (у мордочки 4 строки сверху — под шляпы)
    hat: { 0: '....HHHHHH.....', 1: '....HHHHHH.....', 2: '....HRRRRH.....', 3: '..HHHHHHHHHH...' },
    crown: { 1: '...C..C..C.....', 2: '...CCCJCCC.....', 3: '...CCCCCCC.....' },
    bow: { 3: '..........QQ.QQ', 4: '...........QQQ.', 5: '..........QQ.QQ' },
    glasses: { 9: '..GGGG.GGGG....', 10: '..GLLGGGLLG....' },
    scarf: { 12: '..RRRRRRRRR....', 13: '...RRRRRRRRR...', 14: '........RR.....' },
    headphones: { 3: '...AAAAAAAA....', 4: '..A.........A..', 8: 'BB...........BB', 9: 'BB...........BB', 10: 'BB...........BB' },
  };
  const OPAL = { H: '#2B2D35', R: '#D9443B', C: '#F5C542', J: '#E8483B', Q: '#F28EB8', G: '#14121A', L: '#7FC8F8', A: '#5E6573', B: '#3550E8' };
  function catSvg(skin = 'classic', outfit = '') {
    const pal = { ...SKIN.classic, ...(SKIN[skin] || {}), ...OPAL };
    const W = 15, H = 16, ox = 1, oy = 4;
    const g = Array.from({ length: H }, () => Array(W).fill(''));
    HEAD.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') g[y + oy][x + ox] = c; }));
    Object.entries(MARKS[skin] || {}).forEach(([y, row]) => [...row].forEach((c, x) => { if (c !== '.' && g[+y + oy][x + ox]) g[+y + oy][x + ox] = c; }));
    Object.entries(OUTFIT[outfit] || {}).forEach(([y, row]) => [...row].forEach((c, x) => { if (c !== '.' && g[+y]) g[+y][x] = c; }));
    // контур: тёмная клетка вокруг всего, что нарисовано
    const out = g.map((r) => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] && !'GK'.includes(g[y + dy][x + dx]))) out[y][x] = 'Z';
    pal.Z = '#14121A';
    let r = '';
    out.forEach((row, y) => row.forEach((c, x) => { if (c && pal[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>`; }));
    return `<svg viewBox="0 0 ${W} ${H}" width="64" height="68" shape-rendering="crispEdges" aria-hidden="true" focusable="false"${skin === 'ghost' ? ' opacity=".82"' : ''}>${r}</svg>`;
  }
  function vyPreview(id) {
    const V = window.CasualVasyan;
    if (V && typeof V.preview === 'function') {
      try { const s = String(V.preview(id) || ''); if (/^\s*<svg[\s>]/i.test(s) && !/<(script|foreignObject)|\son[a-z]+\s*=/i.test(s)) return s; } catch (e) {}
    }
    const [, kind, name] = id.split('.');
    if (kind === 'food') return ''; // еду рисует только vasyan.js
    return kind === 'skin' ? catSvg(name) : catSvg('classic', name === 'none' ? '' : name);
  }
  const FLAKE = px(['....W....', '.W..W..W.', '..W.W.W..', '...WWW...', 'WWWWWWWWW', '...WWW...', '..W.W.W..', '.W..W..W.', '....W....'], { W: '#7FC8F8' }, 5).svg;
  // маленькое колесо из палитры
  function wheelSvg(pal) {
    const n = pal.length, R = 30;
    let p = '';
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      p += `<path d="M32 32L${(32 + R * Math.cos(a0)).toFixed(2)} ${(32 + R * Math.sin(a0)).toFixed(2)}A${R} ${R} 0 0 1 ${(32 + R * Math.cos(a1)).toFixed(2)} ${(32 + R * Math.sin(a1)).toFixed(2)}Z" fill="${pal[i]}"/>`;
    }
    return `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">${p}<circle cx="32" cy="32" r="7" fill="var(--panel, #17181c)"/></svg>`;
  }
  function confettiSvg(c) {
    const spots = [[10, 14, -20], [30, 8, 15], [50, 16, 40], [18, 34, 60], [42, 34, -35], [8, 52, 10], [30, 50, -60], [54, 50, 25]];
    if (!c) return `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">${spots.map(([x, y, r], i) => `<rect x="${x - 4}" y="${y - 2.5}" width="8" height="5" fill="${WHEEL_DEF[i % WHEEL_DEF.length]}" transform="rotate(${r} ${x} ${y})"/>`).join('')}</svg>`;
    if (c.shape === 'coin') return `<span class="sh-cf">${spots.slice(0, 5).map(([x, y]) => `<img src="${COIN}" alt="" decoding="async" style="left:${x - 6}px;top:${y - 4}px">`).join('')}</span>`;
    const heart = 'M0 4.5C-8 -1 -3 -6.5 0 -1.8C3 -6.5 8 -1 0 4.5Z';
    const star = 'M0 -6L1.8 -1.9L6 -1.9L2.6 0.8L3.8 5L0 2.5L-3.8 5L-2.6 0.8L-6 -1.9L-1.8 -1.9Z';
    return `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">${spots.map(([x, y, r], i) => `<path d="${c.shape === 'heart' ? heart : star}" fill="${c.colors[i % c.colors.length]}" transform="translate(${x} ${y}) rotate(${r})"/>`).join('')}</svg>`;
  }
  function tierSvg(t) {
    const rows = t ? t.rows : ['#43C97A', '#9BCF4E', '#F2BA44', '#F28E4C', '#F26A55'];
    const bg = t ? t.bg : 'var(--panel-2, #1f2128)', ink = t ? t.ink : 'currentColor';
    return `<svg viewBox="0 0 80 64" width="80" height="64" aria-hidden="true"><rect width="80" height="64" rx="6" fill="${bg}"/>${rows.map((c, i) => `<rect x="5" y="${5 + i * 11}" width="14" height="9" rx="2" fill="${c}"/><rect x="22" y="${5 + i * 11}" width="${50 - i * 7}" height="9" rx="2" fill="${ink}" opacity=".18"/>`).join('')}</svg>`;
  }
  const me = () => { const u = user(); return { name: (u && (u.username || u.handle)) || 'Ты', letter: String((u && (u.username || u.handle)) || 'Т').trim().charAt(0).toUpperCase() || 'Т' }; };
  function picOf(it) {
    const name = tail(it.id);
    if (it.sec === 'vasyan') return vyPreview(it.id);
    if (it.kind === 'frame') return `<span class="sh-ava${FRAMES[name] ? ' sh-fr-' + name : ''}">${esc(me().letter)}</span>`;
    if (it.kind === 'badge') return `<span class="sh-nmp">${esc(me().name)}${badgeHTML(it.id, it.title)}</span>`;
    if (it.kind === 'nick') return `<span class="sh-nmp${NICKS[name] ? ' sh-nk-' + name : ''}">${esc(me().name)}</span>`;
    if (it.kind === 'wheel') return wheelSvg(WHEELS[name] || WHEEL_DEF);
    if (it.kind === 'confetti') return confettiSvg(CONFETTI[name] || null);
    if (it.kind === 'tier') return tierSvg(TIERS[name] || null);
    if (it.kind === 'bg') return `<span class="sh-bgp sh-bg-${name === 'horizon' ? 'horizon' : 'stars'}" aria-hidden="true"></span>`;
    if (it.kind === 'cursor') {
      const c = CURSORS[name];
      return c ? `<span class="sh-curp" aria-hidden="true">${c.a.svg}${c.b.svg}</span>` : '<span class="sh-curp" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M5 3l14 8-6.2 1.5L16 20l-2.6 1.2-3.2-7.4L5 18z"/></svg></span>';
    }
    if (it.kind === 'freeze') return FLAKE.replace('<svg ', '<svg aria-hidden="true" ');
    return '';
  }

  // ---------- что надето ----------
  const vyState = () => read(VY_KEY) || {};
  function isWorn(it) {
    if (it.slot) return worn(it.slot) === it.id;
    if (it.kind === 'skin') return (vyState().skin || 'classic') === tail(it.id);
    if (it.kind === 'outfit') return (vyState().outfit || 'none') === tail(it.id);
    // еда: что сейчас в миске (у старого vasyan.js в food лежало число порций — это сухой корм)
    if (it.kind === 'food') { const f = vyState().food; return (typeof f === 'string' ? f : 'kibble') === tail(it.id); }
    return false;
  }
  // окрас, наряд и еду Васяна носит vasyan.js (CasualVasyan.setSkin / setOutfit / setFood), остальное — сервер (PUT /shop/wear)
  const VY_SET = { skin: 'setSkin', outfit: 'setOutfit', food: 'setFood' };
  const vyCan = (kind) => { const V = window.CasualVasyan; return !!(V && VY_SET[kind] && typeof V[VY_SET[kind]] === 'function'); };
  async function wearIt(it) {
    if (VY_SET[it.kind]) {
      if (!vyCan(it.kind)) return false;
      window.CasualVasyan[VY_SET[it.kind]](tail(it.id));
      return true;
    }
    if (!it.slot) return false;
    take(await api('/shop/wear', 'PUT', { item: it.id }));
    return true;
  }

  // ---------- окно ----------
  const SECTIONS = [['profile', 'Профиль'], ['nick', 'Ник'], ['wheel', 'Колесо'], ['tier', 'Тир-листы'], ['site', 'Сайт'], ['perks', 'Бонусы'], ['vasyan', 'Васян'], ['earn', 'Как заработать']];
  let ov = null, sec = 'profile', lastFocus = null, armed = null, armT = 0, msgT = 0;
  function css() {
    if (document.getElementById('shCss')) return;
    const s = document.createElement('style');
    s.id = 'shCss';
    s.textContent = `
.sh-ov { position: fixed; inset: 0; z-index: 125; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top, 0px)) 20px max(20px, env(safe-area-inset-bottom, 0px)); background: rgb(6 8 12 / .5); }
.sh-card { width: min(880px, 100%); height: min(780px, 100%); display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; border-radius: 24px; border: 1px solid var(--line, #2b2e38); background: var(--panel, #17181c); color: var(--ink, #f2f2f2); overflow: hidden; box-shadow: 0 30px 80px -30px rgb(0 0 0 / .6); animation: sh-in .22s cubic-bezier(.2, .8, .2, 1); }
@keyframes sh-in { from { transform: translateY(10px) scale(.985); opacity: 0; } }
.sh-ov { animation: sh-fade .16s ease-out; }
@keyframes sh-fade { from { opacity: 0; } }
.sh-head { display: flex; align-items: center; gap: 12px; padding: 20px 20px 12px 26px; }
.sh-head h2 { margin: 0; font-size: 24px; font-family: var(--font-display, inherit); }
.sh-bal { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 6px; border-radius: 999px; background: color-mix(in srgb, var(--ink, #fff) 7%, transparent); font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sh-coin { display: inline-block; vertical-align: -4px; flex: none; image-rendering: pixelated; }
.sh-head .x { margin-left: auto; width: 36px; height: 36px; flex: none; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--ink, #fff) 8%, transparent); color: var(--ink, #fff); font-size: 16px; cursor: pointer; }
.sh-tabs { display: flex; gap: 8px; padding: 0 26px 14px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line, #2b2e38); }
.sh-tabs::-webkit-scrollbar { display: none; }
.sh-tabs button { flex: none; padding: 8px 15px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink-2, #b5b5b5); font: 600 13px/1.2 inherit; font-family: inherit; cursor: pointer; }
.sh-tabs button[aria-selected="true"] { background: var(--accent, #3550E8); border-color: transparent; color: #fff; }
@media (max-width: 700px) { .sh-tabs { -webkit-mask: linear-gradient(90deg, #000 82%, transparent); mask: linear-gradient(90deg, #000 82%, transparent); } }
.sh-body { overflow-y: auto; padding: 18px 26px 24px; display: grid; gap: 14px; align-content: start; }
.sh-note { margin: 0; font-size: 13px; color: var(--ink-3, #8a8f9e); line-height: 1.45; }
.sh-h3 { margin: 6px 0 0; font-size: 14px; }
.sh-me { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 16px; border: 1px dashed var(--line, #2b2e38); }
.sh-me small { display: block; font-size: 12px; color: var(--ink-3, #8a8f9e); }
.sh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 10px; }
.sh-it { position: relative; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 6px; padding: 12px; border-radius: 16px; border: 1px solid var(--line, #2b2e38); background: var(--panel-2, color-mix(in srgb, var(--ink, #fff) 3%, transparent)); min-width: 0; transition: border-color .15s; }
.sh-it:hover { border-color: color-mix(in srgb, var(--accent, #3550E8) 45%, var(--line, #2b2e38)); }
.sh-it.on { border-color: var(--accent, #3550E8); box-shadow: inset 0 0 0 1px var(--accent, #3550E8); }
.sh-it.lock .sh-pic { filter: grayscale(1); opacity: .5; }
.sh-pic { position: relative; height: 80px; display: grid; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--ink, #fff) 5%, transparent); overflow: hidden; }
.sh-pic svg { image-rendering: pixelated; }
.sh-it b { font-size: 14px; line-height: 1.25; overflow-wrap: anywhere; }
.sh-it small { font-size: 12px; color: var(--ink-3, #8a8f9e); line-height: 1.3; }
.sh-it .sh-tag { position: absolute; top: 8px; right: 8px; z-index: 1; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--accent, #3550E8); color: #fff; }
.sh-ava { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--accent, #3550E8); color: #fff; font-weight: 800; font-size: 18px; }
.sh-nmp { display: inline-flex; align-items: center; max-width: 100%; padding: 0 6px; font-weight: 700; font-size: 16px; color: var(--ink, #f2f2f2); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sh-cf { position: relative; display: block; width: 64px; height: 64px; }
.sh-cf img { position: absolute; width: 13px; height: 13px; border-radius: 50%; }
.sh-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 6px 12px; border-radius: 12px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink, #f2f2f2); font: 700 13px/1.2 inherit; font-family: inherit; cursor: pointer; font-variant-numeric: tabular-nums; text-decoration: none; }
.sh-btn.buy { background: var(--accent, #3550E8); border-color: transparent; color: #fff; }
.sh-btn.sure { background: var(--good, #2EAD60); border-color: transparent; color: #fff; }
.sh-btn:disabled { opacity: .55; cursor: default; }
.sh-btn .sh-coin { vertical-align: -3px; }
.sh-bgp { position: relative; display: block; width: 100%; height: 100%; background: var(--bg, #0d0f14); }
.sh-bgp::after { content: ""; position: absolute; inset: 0; background: color-mix(in srgb, var(--ink, #888) 40%, transparent); -webkit-mask: url(/art/site/stars.webp) 0 0 / 210px 210px repeat; mask: url(/art/site/stars.webp) 0 0 / 210px 210px repeat; }
.sh-bg-horizon::before { content: ""; position: absolute; inset: 0; z-index: 1; background: color-mix(in srgb, var(--accent, #8C9BFF) 45%, var(--bg, #0D0F14)); -webkit-mask: url(/art/site/horizon-far.webp) left bottom / auto 60px repeat-x; mask: url(/art/site/horizon-far.webp) left bottom / auto 60px repeat-x; }
.sh-curp { display: inline-flex; align-items: flex-start; gap: 14px; color: var(--ink, #f2f2f2); }
.sh-msg { min-height: 20px; margin: 0; padding: 10px 26px 14px; border-top: 1px solid var(--line, #2b2e38); font-size: 13px; color: var(--ink-2, #b5b5b5); }
.sh-msg.err { color: var(--bad, #E5484D); }
.sh-earn { display: grid; gap: 6px; }
.sh-earn > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line, #2b2e38); font-size: 14px; }
.sh-earn > div:first-child { border-top: 0; }
.sh-earn b { font-variant-numeric: tabular-nums; white-space: nowrap; }
.sh-pop { animation: sh-pop .45s cubic-bezier(.2, .8, .2, 1); }
@keyframes sh-pop { 40% { transform: scale(1.05); } }
@media (max-width: 560px) {
  .sh-ov { padding: 0; }
  .sh-card { width: 100%; height: 100%; border-radius: 0; border: 0; }
  .sh-head { padding: max(14px, env(safe-area-inset-top, 0px)) 14px 10px 16px; flex-wrap: wrap; }
  .sh-head h2 { font-size: 21px; }
  .sh-tabs { padding: 0 16px 12px; }
  .sh-body { padding: 14px 16px 20px; }
  .sh-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .sh-it { padding: 10px; }
  .sh-msg { padding: 10px 16px max(12px, env(safe-area-inset-bottom, 0px)); }
}
@media (prefers-reduced-motion: reduce) { .sh-ov, .sh-card, .sh-pop { animation: none; } .sh-it { transition: none; } }
/* казуальный вид: без теней, свечений и подпрыгиваний */
html.unslop .sh-card { box-shadow: 0 24px 60px -30px rgb(0 0 0 / .45); }
/* спокойный только «Казуальный» вид; в остальных видах окно появляется с анимацией */
html.unslop:not([data-ui]) :is(.sh-ov, .sh-card) { animation: none; }
html.unslop:not([data-ui]) .sh-pop { animation: none; }
html.unslop .sh-it.on { box-shadow: none; }`;
    document.head.appendChild(s);
  }
  function say(t, err) {
    const m = ov && ov.querySelector('.sh-msg');
    if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('err', !!err);
    clearTimeout(msgT);
    if (t && !err) msgT = setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 5000);
  }
  function open(which) {
    css();
    if (which && SECTIONS.some(([k]) => k === which)) sec = which;
    lastFocus = document.activeElement;
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'sh-ov';
      ov.innerHTML = `<div class="sh-card" role="dialog" aria-modal="true" aria-labelledby="shTitle" tabindex="-1"><div class="sh-head"><h2 id="shTitle">Магазин</h2><span class="sh-bal" id="shBal">${coinImg(22)}<span>…</span></span><button type="button" class="x" aria-label="Закрыть">✕</button></div><div class="sh-tabs" role="tablist" aria-label="Разделы магазина"></div><div class="sh-body" id="shBody"></div><p class="sh-msg" role="status" aria-live="polite"></p></div>`;
      ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.sh-head .x')) close(); });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      ov.querySelector('.sh-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) { sec = b.dataset.sec; armed = null; render(); } });
      ov.querySelector('#shBody').addEventListener('click', onCard);
    }
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    say('');
    render();
    requestAnimationFrame(() => { const b = ov.querySelector('.sh-tabs [aria-selected="true"]') || ov.querySelector('.sh-card'); if (b) b.focus(); });
    refresh().then(() => { if (ov && ov.isConnected) render(); }, (e) => { if (ov && ov.isConnected) { render(); say(e.message, true); } });
  }
  function close() {
    if (!ov) return;
    ov.remove();
    document.documentElement.style.overflow = '';
    armed = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function render() {
    if (!ov) return;
    const bal = ov.querySelector('#shBal span');
    if (bal) bal.textContent = mine() || (D && D.on) ? coins(D && D.on ? D.balance : S.balance) : '—';
    ov.querySelector('.sh-tabs').innerHTML = SECTIONS.map(([k, n]) => `<button type="button" role="tab" data-sec="${k}" aria-selected="${k === sec}">${n}</button>`).join('');
    const body = ov.querySelector('#shBody');
    if (!token()) { body.innerHTML = '<p class="sh-note">Рофланы копятся у тех, кто вошёл в аккаунт: за оценки, отзывы, задания и всё, за что даётся опыт.</p><a class="sh-btn buy" href="/opinion/#login">Войти</a>'; return; }
    if (!D) { body.innerHTML = '<p class="sh-note">Загружаю…</p>'; return; }
    if (!D.on) { body.innerHTML = '<p class="sh-note">Магазин пока закрыт: он откроется вместе с уровнями.</p>'; return; }
    body.innerHTML = sec === 'earn' ? earnHTML() : listHTML(sec);
  }
  // как тебя видят другие: аватар с рамкой, ник со стилем и значком
  function meHTML() {
    const w = { ...DEF, ...(D.wear || {}) }, f = tail(w.frame), n = tail(w.nick);
    return `<div class="sh-me"><span class="sh-ava${FRAMES[f] ? ' sh-fr-' + f : ''}">${esc(me().letter)}</span><div><span class="sh-nmp${NICKS[n] ? ' sh-nk-' + n : ''}">${esc(me().name)}${badgeHTML(w.badge, titleOf(w.badge))}</span><small>Так тебя видят в профиле и в списках друзей</small></div></div>`;
  }
  const NOTES = {
    profile: 'Рамку и значок видят все, кто открывает твой профиль или видит тебя в списке друзей.',
    nick: 'Стиль ника видят все: в профиле и в списках.',
    wheel: 'Цвета секторов и конфетти на победу — на твоём Колесе.',
    tier: 'Тема задаёт цвета рядов новых тир-листов, палитру рядов и фон картинки, когда скачиваешь тир-лист.',
    site: 'Фон и курсор видишь только ты, на всех страницах сайта. Курсор — на компьютере, на телефоне его нет.',
  };
  function listHTML(k) {
    const items = (D.items || []).filter((x) => x.sec === k);
    const group = (kind, title) => { const xs = items.filter((x) => x.kind === kind); return xs.length ? `${title ? `<h3 class="sh-h3">${title}</h3>` : ''}<div class="sh-grid">${xs.map(card).join('')}</div>` : ''; };
    const note = (t) => `<p class="sh-note">${t}</p>`;
    if (k === 'vasyan') {
      return note(D.vasyan
        ? 'Окрасы, наряды и еда для котика Васяна. Купленное надевается здесь же или в Настройках → «Внешний вид». Еда открывается и сама: по одной за каждый уровень, начиная со 2-го, — купить можно раньше.'
        : 'Котик Васян есть у первой десятки и у всех с 25-го уровня. Окрасы, наряды и еда откроются, когда он появится у тебя.') + group('skin', 'Окрасы') + group('outfit', 'Наряды') + group('food', 'Еда');
    }
    if (k === 'profile') return meHTML() + note(NOTES.profile) + group('frame', 'Рамки аватара') + group('badge', 'Значки у ника');
    if (k === 'nick') return meHTML() + note(NOTES.nick) + group('nick', '');
    if (k === 'wheel') return note(NOTES.wheel) + group('wheel', 'Колесо') + group('confetti', 'Конфетти');
    if (k === 'tier') return note(NOTES.tier) + group('tier', '');
    if (k === 'site') return note(NOTES.site) + group('bg', 'Фон') + group('cursor', 'Курсор');
    if (k === 'perks') return note(`Заморозка спасает серию, если пропустишь день. Сейчас ${D.freezes} из ${D.freezeMax}; одна новая и так приходит каждую неделю.`) + `<div class="sh-grid">${items.map(card).join('')}</div>`;
    return `<div class="sh-grid">${items.map(card).join('')}</div>`;
  }
  function card(it) {
    const lock = it.sec === 'vasyan' && !D.vasyan;
    const on = it.owned && !it.consumable && isWorn(it);
    const food = it.kind === 'food'; // еду не надевают, а насыпают в миску
    let btn;
    if (lock) btn = '<button type="button" class="sh-btn" disabled>Нужен Васян</button>';
    else if (it.kind === 'freeze') btn = D.freezes >= D.freezeMax ? '<button type="button" class="sh-btn" disabled>Больше не помещается</button>' : buyBtn(it);
    else if (!it.owned) btn = buyBtn(it);
    else if (on) btn = `<button type="button" class="sh-btn" disabled>${food ? 'В миске' : 'Надето'}</button>`;
    else if (it.sec === 'vasyan' && !vyCan(it.kind)) btn = `<button type="button" class="sh-btn" disabled>${it.byLevel ? 'Открыто' : 'Куплено'}</button>`;
    else btn = `<button type="button" class="sh-btn" data-wear="${esc(it.id)}">${food ? 'Насыпать' : 'Надеть'}</button>`;
    // еда: своя за уровень — «За N-й уровень»; закрытая — цена и с какого уровня откроется сама
    const sub = it.kind === 'freeze' ? 'Расходуется, если пропустишь день'
      : it.byLevel ? `За ${it.unlock}-й уровень`
      : !it.price ? 'Бесплатно'
      : it.owned ? 'Куплено'
      : it.unlock ? `${coins(it.price)} · Откроется на ${it.unlock}-м уровне` : coins(it.price);
    return `<div class="sh-it${on ? ' on' : ''}${lock ? ' lock' : ''}" data-id="${esc(it.id)}">${on ? `<span class="sh-tag">${food ? 'В миске' : 'Надето'}</span>` : ''}<div class="sh-pic">${picOf(it)}</div><b>${esc(it.title)}</b><small>${esc(sub)}</small>${btn}</div>`;
  }
  const buyBtn = (it) => (armed === it.id
    ? `<button type="button" class="sh-btn sure" data-buy="${esc(it.id)}">Точно купить?</button>`
    : `<button type="button" class="sh-btn buy" data-buy="${esc(it.id)}">${coinImg(16)}${nf(it.price)}</button>`);
  function earnHTML() {
    const e = D.earned || {};
    const row = (t, n) => `<div><span>${t}</span><b>${n < 0 ? '−' : ''}${coins(Math.abs(n))}</b></div>`;
    return `<p class="sh-note">Рофланы копятся сами — за всё, за что на сайте даётся опыт: 1 рофлан за каждые ${D.rate} опыта. Ещё — за достижения (бронза 15, серебро ещё 40, золото ещё 100, особые 30) и за звание в конце сезона (до 300 у «Величайшего»). Покупать можно только оформление и заморозки: опыт и звания за рофланы не купить.</p>
      <div class="sh-earn">${row('За опыт', e.xp || 0)}${row('За достижения', e.ach || 0)}${row('За сезоны', e.season || 0)}${D.gifts ? row('От администрации', D.gifts) : ''}${row('Потрачено', -(D.spent || 0))}<div><span><b>Сейчас</b></span><b>${coinImg(16)} ${coins(D.balance)}</b></div></div>
      ${D.debt ? `<p class="sh-note">Часть опыта ушла (например, удалены оценки), и потрачено больше, чем заработано: нужно ещё ${coins(D.debt)}, прежде чем копить на новое.</p>` : ''}`;
  }
  async function onCard(e) {
    const w = e.target.closest('[data-wear]');
    if (w) {
      const it = (D.items || []).find((x) => x.id === w.dataset.wear);
      if (!it || !it.owned) return;
      w.disabled = true;
      try { if (await wearIt(it)) { render(); say(it.kind === 'food' ? `В миске: ${it.title}` : `Надето: ${it.title}`); } else w.disabled = false; } catch (err) { render(); say(err.message, true); }
      return;
    }
    const b = e.target.closest('[data-buy]');
    if (!b) return;
    const it = (D.items || []).find((x) => x.id === b.dataset.buy);
    if (!it) return;
    // первое нажатие — «Точно купить?», второе в течение 4 секунд — покупка
    if (armed !== it.id) {
      armed = it.id;
      clearTimeout(armT);
      armT = setTimeout(() => { if (armed === it.id) { armed = null; render(); } }, 4000);
      render();
      const again = ov.querySelector(`[data-buy="${CSS.escape(it.id)}"]`);
      if (again) again.focus();
      return;
    }
    armed = null;
    clearTimeout(armT);
    b.disabled = true;
    try {
      const rid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      const d = await api('/shop/buy', 'POST', { item: it.id, rid });
      take(d);
      // купленное сервер надевает сам; Васяна (окрас, наряд, еду) — vasyan.js, если умеет
      if (VY_SET[it.kind]) await wearIt(it).catch(() => {});
      render();
      say(it.kind === 'freeze' ? `Заморозка куплена: теперь их ${d.freezes}.` : `Куплено: ${it.title}.`);
      const c = ov.querySelector(`.sh-it[data-id="${CSS.escape(it.id)}"]`);
      if (c && !calm()) c.classList.add('sh-pop');
    } catch (err) {
      render();
      say(err.message, true);
    }
  }

  // ---------- запуск ----------
  window.CasualShop = Object.freeze({
    owned,
    open,
    close,
    refresh,
    worn,
    look,
    dress,
    confettiPart,
    balance: () => (mine() ? +S.balance || 0 : 0),
    // с какого уровня вещь своя без покупки (еда Васяна), 0 — только купить
    unlockAt: (id) => (S.unlock && +S.unlock[String(id)]) || 0,
  });
  applyCursor();
  // купили или надели в соседней вкладке — обновить и здесь
  addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const c = read(KEY);
    if (c && typeof c === 'object') { S = c; applyCursor(); applyBg(); emit(); if (ov && ov.isConnected) render(); }
  });
  if (token()) refresh().catch(() => {});
})();
