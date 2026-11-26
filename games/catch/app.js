/* Казуал Хаб: «Васян ловит еду» — аркада на холсте (/games/catch/; что и когда падает — rules.js, сервер — functions/_lib/game-catch.js).
   Васян бегает по низу и ловит еду; огурцы и капли из тучки отнимают жизнь, жизней три. Промах по еде жизни не стоит.
   Управление: ← → или A D; мышью — нажать или зажать и вести (бежит к курсору); пальцем — держать слева или справа от
   середины поля (бежит туда), повёл пальцем — следует за ним. P или Esc — пауза; вкладку спрятали, окно потеряло фокус,
   нажали мимо поля — тоже пауза.
   Рисунок: мир 180×120 пикселей на отдельном холсте, на экран — целым числом точек экрана на пиксель (fit), поэтому пиксели
   ровные при любом размере сайта и экрана. Васян и еда — пиксели из vasyan.js (CasualVasyan.pixels), у хозяев Васяна — свой
   окрас и наряд; огурец, тучка и капля нарисованы здесь. Цвета сцены — из темы, перечитываются при смене темы и вида.
   Движение — по времени (CasualUtil.loop), а не по кадрам. «Меньше движения»: без крошек, кувырков, подскоков и мигания.
   Вошёл в аккаунт — счёт уходит на сервер: start в начале игры (номер забега), score в конце; оттуда же рекорды и лучшие
   за сегодня среди друзей. Гость играет без сохранения. */
(() => {
  const U = window.CasualUtil || {};
  const R = window.CasualCatchRules;
  const $ = (id) => document.getElementById(id);
  const cv = $('cgCanvas'), frame = $('cgFrame'), box = $('cgBox'), over = $('cgOver');
  if (!cv || !R) return;
  const ctx = cv.getContext('2d');
  const esc = U.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const read = U.read || ((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } });
  const token = () => { const u = read('ocenshik.user.v1'); return (u && (read('casualhub.tokens.v1') || {})[u.id]) || ''; };
  const onMq = (mq, f) => { if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let calm = motion.matches;
  onMq(motion, (e) => { calm = e.matches; });

  // ---------- мир ----------
  const W = 180, H = 120, FLOOR = 110; // мир в пикселях спрайтов; с FLOOR начинается пол
  // Васян: пикселей в секунду; жизни; сколько секунд после удара не бьют; ближе к краю не бегает и ничего не падает
  const SPEED = 155, LIVES = 3, INV = 1.3, EDGE = 10;
  const buf = document.createElement('canvas');
  buf.width = W; buf.height = H;
  const b = buf.getContext('2d');

  async function api(method, path, body) {
    const t = token();
    let r;
    try {
      r = await fetch('/api' + path, { method, cache: 'no-store', headers: { ...(t ? { authorization: 'Bearer ' + t } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error('Нет связи с сервером. Счёт не сохранился'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(d.error || 'Не получилось, попробуй ещё раз'); er.status = r.status; throw er; }
    return d;
  }

  // ---------- цвета темы ----------
  // переменные темы → [r, g, b]: через пробный элемент, так понимается любой вид записи цвета
  const probe = document.createElement('i');
  probe.hidden = true;
  document.body.appendChild(probe);
  function rgbOf(s) {
    let m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s || '');
    if (m) return [+m[1], +m[2], +m[3]].map(Math.round);
    m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s || '');
    return m ? [+m[1], +m[2], +m[3]].map((v) => Math.round(v * 255)) : null;
  }
  const theme = (v, fb) => { probe.style.color = `var(${v}, ${fb})`; return rgbOf(getComputedStyle(probe).color) || rgbOf(fb) || [128, 128, 128]; };
  const rgb = (c, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
  const mix = (a, c, t) => a.map((v, i) => Math.round(v + (c[i] - v) * t));
  let C = null, bgCv = null;
  function colors() {
    C = {
      bg: theme('--panel-2', 'rgb(244,245,248)'), ink: theme('--ink', 'rgb(20,22,28)'), cell: theme('--cell', 'rgb(225,228,235)'),
      good: theme('--good', 'rgb(46,173,96)'), bad: theme('--bad', 'rgb(228,85,63)'), accent: theme('--accent', 'rgb(53,80,232)'),
    };
    bgCv = null;
    texts.clear();
  }
  // фон сцены — один раз на тему: точки, как на фоне сайта, и пол плитками
  function background() {
    if (bgCv) return bgCv;
    bgCv = document.createElement('canvas');
    bgCv.width = W; bgCv.height = H;
    const g = bgCv.getContext('2d');
    g.fillStyle = rgb(C.bg); g.fillRect(0, 0, W, H);
    g.fillStyle = rgb(mix(C.bg, C.ink, 0.1));
    for (let y = 7, row = 0; y < FLOOR - 6; y += 10, row++) for (let x = 5 + (row % 2) * 5; x < W; x += 10) g.fillRect(x, y, 1, 1);
    g.fillStyle = rgb(C.cell); g.fillRect(0, FLOOR, W, H - FLOOR);
    g.fillStyle = rgb(mix(C.cell, C.ink, 0.16)); g.fillRect(0, FLOOR, W, 1);
    g.fillStyle = rgb(mix(C.cell, C.ink, 0.08));
    g.fillRect(0, FLOOR + 5, W, 1);
    for (let x = 14; x < W; x += 24) g.fillRect(x, FLOOR + 1, 1, 4);
    for (let x = 2; x < W; x += 24) g.fillRect(x, FLOOR + 6, 1, H - FLOOR - 6);
    return bgCv;
  }

  // ---------- спрайты ----------
  const INK = '#1B1B1F';
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const fromRows = (rows, pal) => {
    const w = Math.max(...rows.map((r) => r.length));
    return { w, h: rows.length, px: rows.map((r) => [...r.padEnd(w, '.')].map((ch) => (ch === '.' ? null : pal[ch] || null))) };
  };
  // цвет контура у сетки из vasyan.js: обычно INK, у окраса «Призрак» — свой (самый частый цвет по краю рисунка)
  function inkOf(px) {
    const n = new Map();
    px.forEach((row, y) => row.forEach((v, x) => {
      if (v && DIRS.some(([dx, dy]) => !(px[y + dy] && px[y + dy][x + dx]))) n.set(v, (n.get(v) || 0) + 1);
    }));
    if (n.has(INK)) return INK;
    let best = INK, k = 0;
    for (const [v, c] of n) if (c > k) { best = v; k = c; }
    return best;
  }
  // на пиксель шире со всех сторон, и контур дорисован там, где рисунок упирался в край кадра
  function outlined(p, ink = inkOf(p.px)) {
    const w = p.w + 2, h = p.h + 2;
    const px = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (p.px[y - 1] && p.px[y - 1][x - 1]) || null));
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!px[y][x] && DIRS.some(([dx, dy]) => { const v = px[y + dy] && px[y + dy][x + dx]; return v && v !== ink && v !== INK; })) add.push([x, y]);
    }
    add.forEach(([x, y]) => { px[y][x] = ink; });
    return { w, h, px };
  }
  const mirror = (p) => ({ w: p.w, h: p.h, px: p.px.map((r) => r.slice().reverse()) });
  const rot90 = (p) => ({ w: p.h, h: p.w, px: Array.from({ length: p.w }, (_, y) => Array.from({ length: p.h }, (_, x) => p.px[p.h - 1 - x][y])) });
  // сетка → холст спрайта и где на нём сам рисунок (x0…x1, y0…y1): по нему спрайт ставится серединой и лапами на пол
  function toCanvas(p) {
    const c = document.createElement('canvas');
    c.width = p.w; c.height = p.h;
    const g = c.getContext('2d');
    let x0 = p.w, x1 = 0, y0 = p.h, y1 = 0;
    p.px.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      g.fillStyle = v; g.fillRect(x, y, 1, 1);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }));
    return { cv: c, w: p.w, h: p.h, x0, x1, y0, y1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, hw: (x1 - x0 + 1) / 2, hh: (y1 - y0 + 1) / 2 };
  }
  // сетка → svg для легенды и жизней; off — потерянная жизнь: цветом текста, контур ярче заливки
  function toSvg(p, k, off) {
    const ink = inkOf(p.px), by = new Map();
    p.px.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        const v = row[x];
        if (!v) { x++; continue; }
        let e = x + 1;
        while (e < row.length && row[e] === v) e++;
        const key = off ? (v === ink ? 'o' : 'f') : v;
        by.set(key, (by.get(key) || '') + `M${x} ${y}h${e - x}v1h-${e - x}z`);
        x = e;
      }
    });
    let out = '';
    for (const [v, d] of by) out += off ? `<path fill="currentColor" opacity="${v === 'o' ? '.75' : '.2'}" d="${d}"/>` : `<path fill="${v}" d="${d}"/>`;
    return `<svg viewBox="0 0 ${p.w} ${p.h}" width="${p.w * k}" height="${p.h * k}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${out}</svg>`;
  }
  const colorsOf = (p) => [...new Set(p.px.flat().filter((v) => v && v !== INK))];

  // огурец, капля и тучка — свои рисунки (у Васяна в vasyan.js их нет); у тучки перед дождём — сердитые брови и цвет темнее
  const CUKE = fromRows(['..GGGGGGGGG...', '.GgglggglgggG.', 'bggggggggggggG', '.GgggglgggglG.', '..GGGGGGGGG...'], { G: '#2E7D32', g: '#43A047', l: '#8BCF7A', b: '#8D6E3F' });
  const DROP = fromRows(['..b..', '.bbb.', '.bWb.', 'bWbbb', 'bbbbb', '.bbb.'], { b: '#4FA3F7', W: '#D4EDFC' });
  const CLOUD_ROWS = ['......wwww......', '..www.wwwwww.ww.', '.wwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwkwwwwwwkwwww', 'wwwwwwwwwwwwwwww', 'ssssssssssssssss', '.ssssssssssssss.'];
  const STORM_ROWS = CLOUD_ROWS.slice();
  STORM_ROWS[3] = 'wwwkwwwwwwwwkwww';
  const CLOUD = fromRows(CLOUD_ROWS, { w: '#EEF2F7', s: '#C9D3E3', k: INK });
  const STORM = fromRows(STORM_ROWS, { w: '#AEB7C6', s: '#7E8798', k: INK });
  const CAT_FRAMES = ['walkA', 'walkB', 'sit', 'blink', 'eatA', 'eatB', 'scared', 'jump', 'hang', 'hangB'];
  const FOOD = Object.keys(R.POINTS);
  let S = null, look = '';
  // окрас и наряд — свои, если Васян у тебя есть (CasualVasyan.own), иначе «Классика» без наряда
  function sprites() {
    const V = window.CasualVasyan;
    const mine = !!(V.own && V.own());
    const o = { coat: mine && V.skin ? V.skin() : 'classic', outfit: mine && V.outfit ? V.outfit() : 'none' };
    const key = o.coat + '|' + o.outfit;
    if (S && key === look) return;
    look = key;
    const cat = {};
    for (const n of CAT_FRAMES) { const p = outlined(V.pixels(n, o)); cat[n] = [toCanvas(p), toCanvas(mirror(p))]; }
    if (S) { S.cat = cat; return; }
    const grids = {}, food = {}, crumb = {};
    for (const k of FOOD) { grids[k] = outlined(V.pixels(k)); food[k] = toCanvas(grids[k]); crumb[k] = colorsOf(grids[k]); }
    grids.cucumber = outlined(CUKE, INK);
    grids.cloud = outlined(CLOUD, INK);
    grids.heart = outlined(V.pixels('heart'));
    const turns = [grids.cucumber];
    for (let i = 1; i < 4; i++) turns.push(rot90(turns[i - 1]));
    S = { cat, food, crumb, grids, cuke: turns.map(toCanvas), drop: toCanvas(outlined(DROP, INK)), cloud: toCanvas(grids.cloud), storm: toCanvas(outlined(STORM, INK)) };
  }

  // «+3», «-1» — пиксельным шрифтом 3×5 с обводкой цветом фона: читается поверх еды и пола
  const GLYPH = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'], '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
  };
  const texts = new Map();
  function textSprite(s, color) {
    const key = s + '|' + color;
    let t = texts.get(key);
    if (t) return t;
    const w = s.length * 4 + 1, h = 7, dots = [];
    [...s].forEach((ch, i) => (GLYPH[ch] || []).forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') dots.push([1 + i * 4 + x, 1 + y]); })));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = rgb(C.bg);
    for (const [x, y] of dots) for (const [dx, dy] of DIRS) g.fillRect(x + dx, y + dy, 1, 1);
    g.fillStyle = color;
    for (const [x, y] of dots) g.fillRect(x, y, 1, 1);
    t = { cv: c, w, h };
    if (texts.size > 40) texts.clear();
    texts.set(key, t);
    return t;
  }

  // ---------- состояние игры ----------
  // state: load → ready → play ⇄ pause → over → play …
  const g = { state: 'load', t: 0, next: 0, cloudAt: 0, cloud: null, items: [], fx: [], pops: [], score: 0, caught: 0, lives: LIVES, inv: 0, last: {}, runP: null, idleT: 0, overT: 0, guard: 0, beat: false };
  const cat = { x: W / 2, face: 1, moving: false, walkT: 0, eatT: 0, hitT: 0, joyT: 0 };
  const keys = { l: false, r: false };
  let ptr = null, target = null;
  // best — рекорд для строки над полем: у вошедшего — за всё время с сервера, у гостя — лучший за этот заход на страницу
  let best = 0, guestBest = 0, seenToken = null;

  function reset() {
    Object.assign(g, { t: 0, next: R.SPAWN.first, cloudAt: R.CLOUD.from, cloud: null, items: [], fx: [], pops: [], score: 0, caught: 0, lives: LIVES, inv: 0, last: {}, runP: null, overT: 0, beat: false });
    Object.assign(cat, { x: W / 2, face: 1, moving: false, walkT: 0, eatT: 0, hitT: 0, joyT: 0 });
    keys.l = keys.r = false;
    ptr = null; target = null;
    clearTimeout(newT); newEl.hidden = true;
    hudScore(); hudLives();
  }
  const clampX = (x) => Math.max(EDGE, Math.min(W - EDGE, x));

  // появление — по цепочке правил (rules.js), по времени из расписания, а не кадра: так же считает сервер
  function spawn(s) {
    const k = R.pick(s, g.last, Math.random);
    const spr = k === 'cucumber' ? S.cuke[0] : S.food[k];
    g.items.push({ k, x: EDGE + Math.random() * (W - 2 * EDGE), y: -spr.hh, vy: R.fallAt(s) * (0.9 + Math.random() * 0.2), t: Math.random() * 4, spr });
  }
  // огурец кувыркается ступеньками по 90°; при «меньше движения» — летит ровно
  const sprOf = (it) => (it.k === 'cucumber' ? S.cuke[calm ? 0 : Math.floor(it.t * 6) % 4] : it.spr);

  function moveCat(dt) {
    let dir = keys.l === keys.r ? 0 : keys.l ? -1 : 1;
    if (!dir && ptr && ptr.mode === 'half') dir = ptr.half;
    const was = cat.x;
    if (dir) { cat.x += dir * SPEED * dt; target = null; }
    else if (target != null) { const d = target - cat.x; cat.x = Math.abs(d) <= SPEED * dt ? target : cat.x + Math.sign(d) * SPEED * dt; }
    cat.x = clampX(cat.x);
    const dx = cat.x - was;
    cat.moving = Math.abs(dx) > 0.01;
    if (cat.moving) { cat.face = dx > 0 ? 1 : -1; cat.walkT += dt; }
  }

  // поймал или задело: еда — у головы и спины, опасное — с поблажкой в полтора пикселя (задело краешком — не считается)
  function updItems(dt) {
    const top = FLOOR - 12, bottom = FLOOR - 1;
    for (let i = g.items.length - 1; i >= 0; i--) {
      const it = g.items[i];
      it.y += it.vy * dt; it.t += dt;
      const s = sprOf(it), food = it.k in R.POINTS, sh = food ? 0 : 1.5, reach = food ? 8 : 6;
      if (Math.abs(it.x - cat.x) < reach + s.hw - sh && it.y + s.hh - sh > top && it.y - s.hh + sh < bottom) {
        g.items.splice(i, 1);
        if (food) eat(it); else hurt(it);
        if (g.state !== 'play') return; // последняя жизнь: дальше уже ничего не ловится
        continue;
      }
      if (it.y + s.hh >= FLOOR + 1) { g.items.splice(i, 1); landed(it); }
    }
  }
  function eat(it) {
    const p = R.POINTS[it.k];
    g.score += p; g.caught++;
    cat.eatT = 0.22;
    pop('+' + p, it.k === 'cake' ? C.accent : C.good, cat.x, FLOOR - 17);
    bits(it.x, FLOOR - 11, S.crumb[it.k], 3);
    // побил свой рекорд посреди игры — подпрыгнул от радости и плашка «Новый рекорд!» на пару секунд (один раз за игру)
    if (!g.beat && best > 0 && g.score > best) {
      g.beat = true; cat.joyT = 0.4;
      newEl.hidden = false;
      clearTimeout(newT); newT = setTimeout(() => { newEl.hidden = true; }, 2500);
    }
    hudScore(true);
  }
  function hurt(it) {
    if (it.k === 'drop') bits(it.x, it.y, ['#4FA3F7', '#D4EDFC'], 3);
    if (g.inv > 0) return; // только что задело: ещё не бьют
    g.lives--; g.inv = INV; cat.hitT = 0.5; cat.eatT = 0;
    pop('-1', C.bad, cat.x, FLOOR - 19);
    hudLives(true);
    if (g.lives <= 0) end();
  }
  function landed(it) {
    if (it.k === 'drop') bits(it.x, FLOOR - 1, ['#4FA3F7', '#D4EDFC'], 3);
    else if (it.k === 'cucumber') bits(it.x, FLOOR - 1, ['#43A047', '#2E7D32'], 2);
    else bits(it.x, FLOOR - 1, S.crumb[it.k], 2);
  }

  // тучка: выплывает сбоку туда, где Васян, хмурится (пунктир до пола — куда пойдёт дождь), четыре капли, уплывает
  function startCloud() {
    const side = Math.random() < 0.5 ? -1 : 1;
    g.cloud = { x: side < 0 ? -S.cloud.w : W + S.cloud.w, tx: Math.max(16, Math.min(W - 16, cat.x + (Math.random() - 0.5) * 24)), y: 13, st: 'in', t: 0, n: 0, side };
  }
  function updCloud(dt) {
    if (!g.cloud) { if (g.t >= g.cloudAt) startCloud(); return; }
    const c = g.cloud;
    c.t += dt;
    if (c.st === 'in') {
      const d = c.tx - c.x, v = 120 * dt;
      if (Math.abs(d) <= v) { c.x = c.tx; c.st = 'warn'; c.t = 0; } else c.x += Math.sign(d) * v;
    } else if (c.st === 'warn') {
      if (c.t >= 0.85) { c.st = 'rain'; c.t = 0; }
    } else if (c.st === 'rain') {
      while (c.n < 4 && c.t >= c.n * 0.11) {
        c.n++;
        g.items.push({ k: 'drop', x: c.x + (Math.random() - 0.5) * 10, y: c.y + 5, vy: R.fallAt(g.t) * R.FALL.drop * (0.95 + Math.random() * 0.1), t: 0, spr: S.drop });
      }
      if (c.n >= 4 && c.t > 0.5) { c.st = 'out'; c.t = 0; }
    } else {
      c.x -= c.side * 90 * dt;
      if (c.x < -S.cloud.w || c.x > W + S.cloud.w) { g.cloud = null; g.cloudAt = g.t + R.cloudGap(g.t, Math.random); }
    }
  }

  // крошки и брызги — пиксели с тяжестью; «+N» — над Васяном, поднимается по пикселю
  function bits(x, y, cols, n) {
    if (calm || !cols || !cols.length) return;
    for (let i = 0; i < n; i++) g.fx.push({ x, y, vx: (Math.random() - 0.5) * 70, vy: -35 - Math.random() * 45, c: cols[Math.floor(Math.random() * cols.length)], t: 0 });
    if (g.fx.length > 60) g.fx.splice(0, g.fx.length - 60);
  }
  function pop(s, c, x, y) {
    g.pops.push({ s, c: rgb(c), x, y, t: 0 });
    if (g.pops.length > 8) g.pops.shift();
  }
  function updFx(dt) {
    for (const p of g.fx) {
      p.t += dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > FLOOR - 1) { p.y = FLOOR - 1; p.vy = 0; p.vx *= 0.5; }
    }
    g.fx = g.fx.filter((p) => p.t < 0.5);
    for (const p of g.pops) p.t += dt;
    g.pops = g.pops.filter((p) => p.t < 0.75);
  }

  function step(dt) {
    g.t += dt; g.idleT += dt;
    while (g.t >= g.next) { spawn(g.next); g.next += R.gapAt(g.next); }
    moveCat(dt);
    updCloud(dt);
    updItems(dt);
    if (g.state !== 'play') return; // последняя жизнь кончилась на этом шаге
    updFx(dt);
    cat.eatT -= dt; cat.hitT -= dt; cat.joyT -= dt; g.inv -= dt;
  }

  // ---------- рисунок ----------
  const put = (s, x, y) => b.drawImage(s.cv, Math.round(x - s.cx), Math.round(y - s.cy));
  function catFrame() {
    if (g.state === 'over') return g.overT < 0.45 ? 'scared' : calm || Math.floor(g.overT / 0.4) % 2 ? 'hang' : 'hangB';
    if (cat.hitT > 0) return 'scared';
    if (cat.joyT > 0 && !calm) return 'jump';
    if (cat.eatT > 0) return cat.eatT > 0.11 ? 'eatA' : 'eatB';
    if (cat.moving) return Math.floor(cat.walkT / 0.11) % 2 ? 'walkB' : 'walkA';
    return g.idleT % 3.2 < 0.16 ? 'blink' : 'sit';
  }
  function drawCat() {
    const s = S.cat[catFrame()][cat.face < 0 ? 1 : 0];
    let lift = 0;
    // конец игры: Васяна поднимают за шкирку, лапки болтаются
    if (g.state === 'over' && g.overT >= 0.45) lift = calm ? 8 : Math.min(8, Math.floor((g.overT - 0.45) / 0.08) * 2);
    else if (!calm && (cat.hitT > 0 || cat.joyT > 0)) { const p = cat.hitT > 0 ? 1 - cat.hitT / 0.5 : 1 - cat.joyT / 0.4; lift = Math.round(Math.sin(Math.PI * Math.min(1, p)) * 3) * 2; }
    // после удара: мигает, а при «меньше движения» — просто полупрозрачный
    if (g.inv > 0 && g.state === 'play') { if (calm) b.globalAlpha = 0.5; else if (Math.floor(g.inv * 10) % 2) return; }
    b.drawImage(s.cv, Math.round(cat.x - s.cx), FLOOR - 1 - s.y1 - lift);
    b.globalAlpha = 1;
  }
  function drawCloud() {
    const c = g.cloud;
    if (!c) return;
    if (c.st === 'warn') {
      b.fillStyle = 'rgba(79,163,247,.65)';
      const x = Math.round(c.x);
      for (let y = c.y + 8, i = 0; y < FLOOR - 1; y += 5, i++) b.fillRect(x + (i % 3 - 1) * 4, y, 1, 2);
    }
    const storm = c.st === 'rain' || (c.st === 'warn' && (calm || Math.floor(c.t / 0.12) % 2 === 0));
    const shake = c.st === 'warn' && !calm ? (Math.floor(c.t / 0.06) % 2 ? 1 : -1) : 0;
    put(storm ? S.storm : S.cloud, c.x + shake, c.y);
  }
  function draw() {
    if (!C) colors();
    b.drawImage(background(), 0, 0);
    if (S) {
      for (const it of g.items) put(sprOf(it), it.x, it.y);
      drawCloud();
      drawCat();
      for (const p of g.fx) { b.fillStyle = p.c; b.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
      for (const p of g.pops) {
        if (!calm && p.t > 0.6 && Math.floor(p.t * 20) % 2) continue; // мигнул и пропал
        const t = textSprite(p.s, p.c), rise = calm ? 0 : Math.min(8, Math.floor(p.t / 0.07));
        b.drawImage(t.cv, Math.round(Math.max(0, Math.min(W - t.w, p.x - t.w / 2))), Math.round(p.y - rise - t.h));
      }
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(buf, 0, 0, cv.width, cv.height);
  }

  // ---------- цикл ----------
  let stop = null, loopFps = 0;
  function runLoop(fps) {
    if (stop && loopFps === fps) return;
    if (stop) stop();
    loopFps = fps;
    const fn = (k) => { tick(k / 60); };
    if (U.loop) { stop = U.loop(fn, fps); return; }
    let raf = 0, last = 0;
    const f = (now) => { raf = requestAnimationFrame(f); const k = last ? Math.min(4, (now - last) / (1000 / 60)) : 1; last = now; if (!document.hidden) fn(k); };
    raf = requestAnimationFrame(f);
    stop = () => cancelAnimationFrame(raf);
  }
  function halt() { if (stop) stop(); stop = null; loopFps = 0; }
  function tick(dt) {
    if (g.state === 'play') {
      let rest = dt;
      while (rest > 1e-6 && g.state === 'play') { const s = Math.min(rest, 1 / 60); step(s); rest -= s; }
    } else {
      g.idleT += dt; g.overT += dt;
      updFx(dt);
    }
    draw();
  }

  // ---------- поле на экране ----------
  // целое число точек экрана на пиксель мира: не шире карточки и не выше ~70 % окна (под шапкой счёта и подсказкой)
  let kNow = 0;
  function fit() {
    const dpr = devicePixelRatio || 1;
    const cw = box.clientWidth || 320;
    const maxH = Math.max(150, Math.min(innerHeight * 0.7, innerHeight - 150));
    const k = Math.max(1, Math.min(Math.floor(cw * dpr / W + 1e-6), Math.floor(maxH * dpr / H + 1e-6)));
    if (k !== kNow) { kNow = k; cv.width = W * k; cv.height = H * k; }
    frame.style.aspectRatio = 'auto';
    frame.style.width = W * k / dpr + 'px';
    frame.style.height = H * k / dpr + 'px';
    draw();
  }
  // по таймеру, а не по кадру: в фоновой вкладке кадров нет, а размер должен встать сразу
  let fitT = 0;
  const fitSoon = () => { clearTimeout(fitT); fitT = setTimeout(fit, 40); };
  if (window.ResizeObserver) new ResizeObserver(fitSoon).observe(box);
  addEventListener('resize', fitSoon);
  // экран сменился (окно перетащили на другой монитор) — другая плотность точек
  (function watchDpr() {
    const mq = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    const f = () => { fitSoon(); if (mq.removeEventListener) mq.removeEventListener('change', f); watchDpr(); };
    onMq(mq, f);
  })();

  // ---------- над полем: счёт, рекорд, жизни ----------
  const scoreEl = $('cgScore'), bestEl = $('cgBest'), bestBox = $('cgBestBox'), newEl = $('cgNew'), livesEl = $('cgLives'), pauseBtn = $('cgPause');
  const PAUSE_ICON = pauseBtn.innerHTML;
  const PLAY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z"/></svg>';
  let heartOn = '', heartOff = '', newT = 0;
  function hudScore(bump) {
    scoreEl.textContent = g.score;
    bestEl.textContent = Math.max(best, g.score);
    bestBox.classList.toggle('up', best > 0 && g.score > best); // рекорд бьётся прямо сейчас — цветом акцента
    if (bump && !calm) { scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump'); }
  }
  function hudLives(lost) {
    if (!heartOn) return;
    livesEl.innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="cg-heart${lost && i === g.lives ? ' lost' : ''}">${i < g.lives ? heartOn : heartOff}</span>`).join('');
    livesEl.setAttribute('aria-label', 'Жизни: ' + Math.max(0, g.lives));
  }
  function pauseIcon(paused) {
    pauseBtn.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
    pauseBtn.setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
    pauseBtn.title = paused ? 'Продолжить' : 'Пауза';
  }

  // ---------- поверх поля ----------
  const GUEST = '<span>Войди, чтобы сохранять рекорды и получать опыт</span> · <a href="/opinion/#login">Войти</a>';
  const guestNote = () => (token() ? '' : `<p class="cg-o-note">${GUEST}</p>`);
  function overlay(html, focus) {
    over.innerHTML = `<div class="cg-card">${html}</div>`;
    over.hidden = false;
    if (focus) setTimeout(() => { const btn = over.querySelector('.btn.primary'); if (btn && g.state !== 'play' && !over.hidden) btn.focus({ preventScroll: true }); }, focus);
  }
  function showReady() {
    g.state = 'ready';
    overlay(`<p class="cg-o-text">Лови еду и не попадай под огурцы и капли. Жизней — три</p>
      <button type="button" class="btn primary" data-act="start">Играть</button>${guestNote()}`);
  }
  const mmss = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function showOver(score, ms, rec) {
    overlay(`<p class="cg-o-title${rec ? ' rec' : ''}" id="cgOverT">${rec ? 'Новый рекорд!' : 'Игра окончена'}</p>
      <p class="cg-o-score">${score}</p>
      <p class="cg-o-meta"><span><span>Время</span> <b>${mmss(ms)}</b></span><span><span>Поймано</span> <b>${g.caught}</b></span></p>
      <p class="cg-o-status" id="cgStatus" role="status">${token() ? '' : GUEST}</p>
      <div class="cg-o-acts"><button type="button" class="btn primary" data-act="start">Сыграть ещё</button></div>`, 700);
  }
  over.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'start') start();
    else if (a.dataset.act === 'resume') resume();
    else if (a.dataset.act === 'restart') start();
  });

  // ---------- игра ----------
  function start() {
    if (!S || g.state === 'load') return;
    sprites(); // окрас могли сменить, пока шла прошлая игра
    fit(); // окно могли поменять, пока вкладка была в фоне (там нет ни кадров, ни событий resize)
    reset();
    g.state = 'play';
    over.hidden = true;
    frame.classList.add('playing');
    pauseBtn.disabled = false;
    pauseIcon(false);
    // номер забега — сразу, не дожидаясь ответа: счёт уйдёт с ним в конце
    g.runP = token() ? api('POST', '/games/catch/start', {}).catch((e) => ({ error: e.message })) : null;
    const r = frame.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) frame.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    runLoop(60);
  }
  function pause() {
    if (g.state !== 'play') return;
    g.state = 'pause';
    keys.l = keys.r = false; ptr = null; target = null;
    frame.classList.remove('playing');
    halt();
    draw();
    pauseIcon(true);
    overlay(`<p class="cg-o-title">Пауза</p>
      <div class="cg-o-acts"><button type="button" class="btn primary" data-act="resume">Продолжить</button><button type="button" class="btn ghost" data-act="restart">Заново</button></div>`, 60);
  }
  function resume() {
    if (g.state !== 'pause') return;
    g.state = 'play';
    over.hidden = true;
    frame.classList.add('playing');
    pauseIcon(false);
    runLoop(60);
  }
  function end() {
    g.state = 'over'; g.overT = 0;
    g.guard = performance.now() + 700; // пробел или Enter сразу после удара не начинают новую игру
    keys.l = keys.r = false; ptr = null; target = null;
    clearTimeout(newT); newEl.hidden = true;
    frame.classList.remove('playing');
    pauseBtn.disabled = true;
    pauseIcon(false);
    const score = g.score, ms = Math.round(g.t * 1000);
    const rec = best > 0 && score > best;
    if (!token()) { guestBest = Math.max(guestBest, score); best = guestBest; }
    showOver(score, ms, rec);
    save(score, ms, g.runP);
    runLoop(20);
  }
  // счёт — на сервер (только вошедшим и только с номером забега); ответ — свежие рекорды и лучшие за сегодня
  async function save(score, ms, runP) {
    const say = (html, bad) => { const el = $('cgStatus'); if (el) { el.innerHTML = html; el.classList.toggle('bad', !!bad); } };
    if (!runP) { if (token()) say('<span>Эта игра началась без входа — счёт не сохранился</span>', true); return; }
    say('<span>Сохраняю…</span>');
    const run = await runP;
    if (!run || !run.run) { say(`<span>${esc((run && run.error) || 'Нет связи с сервером. Счёт не сохранился')}</span>`, true); return; }
    try {
      const d = await api('POST', '/games/catch/score', { run: run.run, score, ms });
      applyTop(d);
      if (d.record) { const t = $('cgOverT'); if (t) { t.textContent = 'Новый рекорд!'; t.classList.add('rec'); } }
      say(`<span>${d.record ? 'Рекорд сохранён' : 'Сохранено'}</span>${d.xp ? ` · <span class="xp">+${d.xp} опыта</span>` : ''}`);
    } catch (e) { say(`<span>${esc(e.message)}</span>`, true); }
  }

  // ---------- справа: рекорды и лучшие за сегодня ----------
  function applyTop(d) {
    if (!d || !d.all || !d.today) return;
    best = d.all.best || 0;
    if (g.state !== 'play') hudScore();
    $('cgToday').textContent = d.today.best;
    $('cgAll').textContent = d.all.best;
    $('cgTodayN').textContent = d.today.games ? 'Игр сегодня: ' + d.today.games : '';
    const list = d.board || [];
    $('cgBoard').innerHTML = list.map((x, i) => `<li${x.me ? ' class="me"' : ''}><span class="n">${i + 1}</span><span class="who"><b>${x.me ? 'Ты' : esc(x.username || x.handle)}</b>${x.handle ? `<small>@${esc(x.handle)}</small>` : ''}</span><b class="pts">${+x.score || 0}</b></li>`).join('');
    $('cgBoard').hidden = !list.length;
    $('cgNoFriends').hidden = !!d.friends;
    $('cgNoGames').hidden = !d.friends || list.some((x) => !x.me);
    $('cgFriends').hidden = false;
  }
  // вошли или вышли (здесь или в другой вкладке): рекорды и друзья — для нового аккаунта, гостю — приглашение войти
  function auth() {
    const t = token();
    if (t === seenToken) return;
    seenToken = t;
    $('cgGuest').hidden = !!t;
    $('cgRecs').hidden = !t;
    if (!t) { best = guestBest; $('cgFriends').hidden = true; if (g.state !== 'play') hudScore(); }
    else { best = 0; api('GET', '/games/catch/top').then((d) => { if (token() === t) applyTop(d); }).catch(() => {}); }
    if (g.state === 'ready') showReady();
  }
  document.addEventListener('casualhub:auth', auth);
  addEventListener('storage', (e) => { if (e.key === null || e.key === 'ocenshik.user.v1' || e.key === 'casualhub.tokens.v1') auth(); });

  // ---------- управление ----------
  const typing = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const c = e.code;
    if (g.state === 'play') {
      if (c === 'ArrowLeft' || c === 'KeyA') { keys.l = true; e.preventDefault(); }
      else if (c === 'ArrowRight' || c === 'KeyD') { keys.r = true; e.preventDefault(); }
      else if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); pause(); }
      else if (c === 'Space' || c === 'ArrowUp' || c === 'ArrowDown') e.preventDefault(); // посреди игры страница не прокручивается
      return;
    }
    // на кнопке или ссылке пробел и Enter — им самим
    const onCtl = !!(e.target.closest && e.target.closest('button, a, [role="button"], summary'));
    if (g.state === 'pause' && (c === 'KeyP' || ((c === 'Space' || c === 'Enter') && !onCtl))) { e.preventDefault(); resume(); return; }
    if ((g.state === 'ready' || g.state === 'over') && (c === 'Space' || c === 'Enter') && !onCtl && performance.now() > g.guard) { e.preventDefault(); start(); }
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = false;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = false;
  });
  // мышь — бежит к курсору (нажал и отпустил — добежит до места); палец — держать слева или справа от середины,
  // а повёл больше чем на 10 px — Васян идёт за пальцем, куда бы его ни поставили
  const toWorld = (e) => { const r = cv.getBoundingClientRect(); return (e.clientX - r.left) / (r.width || 1) * W; };
  cv.addEventListener('pointerdown', (e) => {
    if (g.state !== 'play' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    const wx = toWorld(e), mouse = e.pointerType === 'mouse';
    ptr = { id: e.pointerId, mode: mouse ? 'abs' : 'half', half: wx < W / 2 ? -1 : 1, x0: e.clientX, cat0: cat.x };
    target = mouse ? clampX(wx) : null;
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id || g.state !== 'play') return;
    if (ptr.mode === 'abs') { target = clampX(toWorld(e)); return; }
    if (ptr.mode === 'half' && Math.abs(e.clientX - ptr.x0) > 10) { ptr.mode = 'rel'; ptr.x0 = e.clientX; ptr.cat0 = cat.x; }
    if (ptr.mode === 'rel') { const r = cv.getBoundingClientRect(); target = clampX(ptr.cat0 + (e.clientX - ptr.x0) / (r.width || 1) * W); }
  });
  const ptrEnd = (e) => { if (!ptr || e.pointerId !== ptr.id) return; if (ptr.mode === 'half') target = null; ptr = null; };
  cv.addEventListener('pointerup', ptrEnd);
  cv.addEventListener('pointercancel', ptrEnd);
  cv.addEventListener('contextmenu', (e) => { if (g.state === 'play') e.preventDefault(); });
  pauseBtn.addEventListener('click', () => { if (g.state === 'play') pause(); else resume(); });
  // нажали мышью мимо поля (шапка, меню, ссылка) — пауза (палец мимо поля — нет: промахнуться им легко); вкладку спрятали
  // или окно потеряло фокус — тоже пауза
  document.addEventListener('pointerdown', (e) => { if (g.state === 'play' && e.pointerType === 'mouse' && !frame.contains(e.target) && !pauseBtn.contains(e.target)) pause(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('blur', () => { keys.l = keys.r = false; pause(); });

  // тема, вид или тема системы сменились — сцена в новых цветах
  const recolor = () => { colors(); draw(); };
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-ui', 'class'] });
  onMq(matchMedia('(prefers-color-scheme: dark)'), recolor);
  document.addEventListener('casualhub:ui', () => setTimeout(recolor, 80));

  // ---------- запуск ----------
  colors();
  fit();
  const ready = () => !!(window.CasualVasyan && typeof window.CasualVasyan.pixels === 'function');
  (U.script ? U.script('/vasyan.js', ready) : Promise.resolve()).catch(() => {}).then(() => {
    if (!ready()) { overlay('<p class="cg-o-text">Не загрузился котик. Обнови страницу</p>'); return; }
    sprites();
    document.querySelectorAll('[data-spr]').forEach((el) => { const p = S.grids[el.dataset.spr]; if (p) el.innerHTML = toSvg(p, el.classList.contains('cg-hh') ? 1.5 : 2); });
    heartOn = toSvg(S.grids.heart, 2);
    heartOff = toSvg(S.grids.heart, 2, true);
    hudLives();
    hudScore();
    auth();
    showReady();
    runLoop(20);
  });
})();
