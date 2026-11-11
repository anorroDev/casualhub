/* Казуал Хаб: котик Васян живёт на страницах сайта — только у своих 10 хозяев.
   Это подарок «Первой десятке» (первые 10 аккаунтов): письмо в почте уровней, «Забрать котика».
   Хозяин ли этот браузер, помнит levels-ui.js (casualhub.vasyan.own) и шлёт событие casualhub:vasyan.
   Как Shimeji: ходит не только по низу экрана, но и по верхним краям карточек и блоков, прыгает между ними,
   падает, если блок уехал при прокрутке; его можно схватить мышкой (висит за шкирку) и бросить — упадёт на то, что ниже.
   Как oneko: остановил курсор — может прибежать к нему. Клик — погладить (сердечко), спит — Zzz,
   ест из серой миски в левом нижнем углу (корм — кликом по миске), голоден при пустой миске — думает о рыбке.
   Голод копится и между заходами (localStorage, только в этом браузере). Выключается в Настройках → Внешний вид
   («Котик Васян на сайте», data-vasyan). При «меньше движения» не ходит и не прыгает.
   Спрайты — пиксельные сетки ниже, контур дорисовывается сам; картинок не грузит. Подключает util.js. */
(() => {
  if (window.CasualVasyan || /^\/(admin|r)\//.test(location.pathname)) return;
  const KEY = 'casualhub.vasyan.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- спрайты ----------
  const INK = '#1B1B1F';
  const PAL = { M: '#F4F4F0', O: '#F28E4C', K: '#353A47', E: INK, N: '#F59AC4', R: '#E8483B', W: '#FFFFFF', S: '#8CC8F0',
    L: '#D3D8E0', G: '#9AA1AE', H: '#5E6573', I: '#F7F9FC', F: '#A8693A', J: '#D39A5E' };
  const WALK_A = ['...................', '..K..........O...K.', '..K.........OOO.KKK', '..K.........OOMMKKK', '..K.........OEMMMEK', '..KK........MEMNMEM', '...K........MMMMMMM', '...KKKMMMMMOOMMMMM.', '....MMMMMOOOMMMMM..', '....MMKKMMMMMMMMM..', '....MM.MM...MM.MM..', '....MM.MM...MM.MM..', '...................'];
  const WALK_B = WALK_A.slice();
  WALK_B[1] = '.K...........O...K.'; WALK_B[2] = '.K..........OOO.KKK'; WALK_B[10] = '.....MM.MM.MM.MM...'; WALK_B[11] = '.....MM.MM.MM.MM...';
  const JUMP = WALK_A.slice(); JUMP[10] = '...MM........MM....'; JUMP[11] = '..MM..........MM...';
  const SIT = ['....................', '............O...K...', '...........OOO.KKK..', '...........OOOOKKKK.', '...........OMEMMEMK.', '...........MMEMMEMM.', '...........MMMNNMMM.', '..........MMMMMMMM..', '.........OOMMMMMMM..', '........OOOMMMMMMM..', '........OOMMMMMMMK..', '..KKK...OMMMMMMMKK..', '..KKKKKKKKKMMMMMMM..', '....................'];
  const BLINK = SIT.slice(); BLINK[4] = '...........OMMMMMMK.'; BLINK[5] = '...........MEEMMEEM.';
  const SLEEP = ['..................', '...O...K..........', '..OOO.KKK.........', '..OOOMMKKMMMMMMM..', '..MEEMEEMMMOOOMMM.', '..MMMNNMMMMOOOMMMM', '..MMMMMMMMMMMMMMMM', '...KKKKKKKKKKKKKKM', '..................'];
  const SLEEP_B = SLEEP.slice(); SLEEP_B[3] = '..OOOMMKKMMMMMMMM.'; SLEEP_B[6] = '..MMMMMMMMMMMMMMMMM';
  // за шкирку: висит, лапки болтаются
  const HANG = ['....O...K....', '...OOO.KKK...', '...OOOOKKKK..', '...OMEMMEMK..', '...MMEMMEMM..', '...MMMNNMMM..', '....MMMMMM...', '...MMMMMMMM..', '...OMMMMMMK..', '...OOMMMMKK..', '...MM.MM.MM..', '...MM....MM..', '.........KK..', '..........K..'];
  const HANG_B = HANG.slice(); HANG_B[10] = '...MM.MMMM...'; HANG_B[11] = '....MM..MM...'; HANG_B[12] = '........KK...'; HANG_B[13] = '........K....';
  const HEART = ['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];
  const FISH = ['..S.....', '.SSSS.S.', 'SSWSSSS.', 'SSSSSSSS', '.SSSS.S.', '..S.....'];
  // серая металлическая миска с бликом; корм — горкой
  const BOWL = (n) => [
    n >= 3 ? '.......JF.J.......' : '..................',
    n >= 2 ? '....FJFJFJFJFJ....' : '..................',
    n >= 1 ? '..JFJFJFJFJFJFJF..' : '..................',
    n >= 1 ? 'GLLLLLLLLLLLLLLLLG' : 'GLLHHHHHHHHHHHHLLG',
    'GIIILLLLLLLLLLLLLG',
    '.GLILLLLLLLLLLLLG.',
    '..GGLLLLLLLLLLGG..',
    '...HGGGGGGGGGGH...',
    '....HHHHHHHHHH....'];
  const cache = new Map();
  function sprite(rows, k, outline = true) {
    const key = rows.join('|') + k + outline;
    if (cache.has(key)) return cache.get(key);
    const H = rows.length, W = Math.max(...rows.map((r) => r.length));
    const g = rows.map((r) => [...r.padEnd(W, '.')].map((c) => (c === '.' ? null : PAL[c])));
    if (outline) {
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] && g[y + dy][x + dx] !== INK)) out.push([x, y]);
      out.forEach(([x, y]) => { g[y][x] = INK; });
    }
    let r = '';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${g[y][x]}"/>`;
    const out = { svg: `<svg viewBox="0 0 ${W} ${H}" width="${W * k}" height="${H * k}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`, w: W * k, h: H * k };
    cache.set(key, out);
    return out;
  }

  // ---------- разметка ----------
  const css = document.createElement('style');
  css.textContent = `
.vy-cat, .vy-bowl { position: fixed; z-index: 40; padding: 0; margin: 0; border: 0; background: none; cursor: pointer; line-height: 0; -webkit-tap-highlight-color: transparent; }
.vy-cat { left: 0; top: 0; touch-action: none; cursor: grab; }
.vy-cat.drag { cursor: grabbing; z-index: 60; }
.vy-cat svg, .vy-bowl svg { display: block; }
.vy-body { display: block; } /* строчный span не принимает transform — без этого Васян не разворачивался и ходил задом */
.vy-cat.flip .vy-body { transform: scaleX(-1); }
.vy-cat.hop .vy-body { animation: vy-hop .35s steps(3, jump-none); }
@keyframes vy-hop { 50% { translate: 0 -8px; } }
.vy-bowl { left: 10px; bottom: 6px; filter: drop-shadow(0 3px 0 rgb(0 0 0 / .18)); }
.vy-bowl.add svg { animation: vy-hop .3s steps(2, jump-none); }
.vy-cat:focus-visible, .vy-bowl:focus-visible { outline: 2px solid var(--accent, #5B74FF); outline-offset: 3px; }
.vy-bub { position: absolute; left: 50%; bottom: calc(100% + 4px); transform: translateX(-50%); pointer-events: none; line-height: 0; }
.vy-bub.think { padding: 6px 7px; background: var(--panel, #fff); border-radius: 12px; box-shadow: 0 0 0 2px #1B1B1F; }
.vy-bub.think::after { content: ""; position: absolute; left: 30%; bottom: -10px; width: 6px; height: 6px; border-radius: 50%; background: var(--panel, #fff); box-shadow: 0 0 0 2px #1B1B1F; }
.vy-bub.zz { font: 700 15px/1 var(--font-display, system-ui), sans-serif; letter-spacing: .08em; color: var(--accent, #8C9BFF); text-shadow: 1px 1px 0 #1B1B1F; white-space: nowrap; line-height: 1; animation: vy-zz 2.4s steps(6) infinite; }
@keyframes vy-zz { from { translate: 0 6px; opacity: .3; } to { translate: 8px -10px; opacity: 1; } }
.vy-bub.love { animation: vy-love 1.4s steps(7) forwards; }
@keyframes vy-love { to { translate: 0 -22px; opacity: 0; } }
.vy-plus { position: fixed; z-index: 41; font: 700 14px/1 var(--font-display, system-ui), sans-serif; color: var(--good, #43C97A); text-shadow: 1px 1px 0 #1B1B1F; pointer-events: none; animation: vy-love .9s steps(5) forwards; }
@media (prefers-reduced-motion: reduce) { .vy-cat.hop .vy-body, .vy-bowl.add svg, .vy-bub.zz, .vy-bub.love, .vy-plus { animation: none; } }
@media print { .vy-cat, .vy-bowl { display: none; } }`;

  const K = innerWidth < 480 ? 2.5 : 3; // размер «пикселя» котика
  let st = read();
  const now0 = Date.now();
  // голод копится и пока сайт закрыт: 1 пункт за 12 секунд, но не больше чем до «очень голоден»
  st.hunger = Math.min(100, (+st.hunger || 0) + (st.at ? Math.max(0, now0 - st.at) / 12000 : 0));
  st.food = st.food == null ? 2 : Math.max(0, Math.min(3, +st.food));
  st.at = now0;
  const save = () => { st.at = Date.now(); write(st); };

  let cat, body, bubble, bowl, alive = false, raf = 0;
  // положение: x — левый край, y — линия лап (в координатах окна). surf — блок, на котором стоит (null — пол)
  let x = 120, y = 0, vy = 0, dir = 1, mode = 'sit', until = 0, target = 0, frame = 0, lastFrame = 0, saveT = 0, floor = 0, lastT = 0;
  let surf = null, jump = null, after = null, size = { w: 57, h: 39 };
  let mouse = { x: -1, y: -1, t: 0 }, chaseT = 0, measureT = 0;
  let press = null, dragged = false, shown = null, turnUntil = 0, faced = 1;

  function mount() {
    if (alive) return;
    alive = true;
    if (!css.isConnected) document.head.appendChild(css);
    bowl = document.createElement('button');
    bowl.type = 'button'; bowl.className = 'vy-bowl';
    bowl.dataset.noPress = ''; // без «проседания» из fx.js: его scale сжимает и наш transform-сдвиг
    bowl.setAttribute('aria-label', 'Миска Васяна: насыпать корм');
    bowl.addEventListener('click', feed);
    cat = document.createElement('button');
    cat.type = 'button'; cat.className = 'vy-cat';
    // fx.js при нажатии уменьшает кнопку (scale: .94), а scale применяется поверх transform: translate —
    // весь сдвиг сжимался к левому верхнему углу, и схваченный Васян висел далеко от курсора
    cat.dataset.noPress = '';
    cat.setAttribute('aria-label', 'Котик Васян: нажми, чтобы погладить, или перетащи');
    cat.innerHTML = '<span class="vy-body"></span>';
    body = cat.firstChild;
    cat.addEventListener('pointerdown', down);
    cat.addEventListener('click', (e) => { e.preventDefault(); if (dragged) { dragged = false; return; } pet(); });
    document.body.append(bowl, cat);
    measure();
    x = Math.min(innerWidth - 80, 90 + Math.random() * Math.max(40, innerWidth / 3));
    y = floorY(); surf = null;
    drawBowl(); decide();
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function unmount() {
    alive = false; cancelAnimationFrame(raf);
    if (cat) cat.remove(); if (bowl) bowl.remove();
    cat = bowl = bubble = null;
  }

  // ---------- пол и блоки ----------
  // пол — над закреплёнными внизу панелями (полоса «Сохранить» в Мнении, нижние меню)
  function measure() {
    let top = innerHeight;
    for (let px = 12; px < innerWidth; px += 60) {
      for (const el of document.elementsFromPoint(px, innerHeight - 12)) {
        if (mine(el) || el === document.body || el === document.documentElement) continue;
        let n = el;
        while (n && n !== document.body) {
          const p = getComputedStyle(n).position;
          if (p === 'fixed' || p === 'sticky') { const r = n.getBoundingClientRect(); if (r.height < innerHeight * 0.5) top = Math.min(top, r.top); break; }
          n = n.parentElement;
        }
      }
    }
    floor = Math.max(0, innerHeight - top);
    if (bowl) bowl.style.bottom = floor + 6 + 'px';
  }
  const mine = (el) => !!el && (el === cat || el === bowl || (cat && cat.contains(el)) || (bowl && bowl.contains(el)));
  const floorY = () => innerHeight - floor - 2;
  const bowlRight = () => 10 + 18 * K + 4;
  // блоки, по верху которых можно ходить: крупные карточки, верхний край виден и ничем не закрыт
  const PLAT = '.card, .app, .lv-box, .panel, .feed-list > li, .tl-tile, .recs, .feed, section';
  function platforms() {
    const fy = floorY(), out = [];
    for (const el of document.querySelectorAll(PLAT)) {
      if (mine(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 150 || r.height < 50 || r.top < 80 || r.top > fy - 60 || r.left < 0 || r.right > innerWidth) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 3);
      if (!hit || !(el === hit || el.contains(hit))) continue;
      if (out.some((p) => Math.abs(p.r.top - r.top) < 6 && Math.abs(p.r.left - r.left) < 6)) continue;
      out.push({ el, r });
      if (out.length > 40) break;
    }
    return out;
  }
  const surfTop = (s) => (s ? s.getBoundingClientRect().top : floorY());
  function bounds(s) {
    if (!s) return [bowlRight(), innerWidth - size.w - 6];
    const r = s.getBoundingClientRect();
    return [r.left + 2, Math.max(r.left + 2, r.right - size.w - 2)];
  }
  const surfaceOk = (s) => {
    if (!s) return true;
    if (!s.isConnected) return false;
    const r = s.getBoundingClientRect();
    return r.width >= 100 && r.top > 60 && r.top < floorY() - 30;
  };

  // ---------- миска и ласка ----------
  function drawBowl() { if (bowl) bowl.innerHTML = sprite(BOWL(st.food), K).svg; }
  function feed() {
    if (st.food >= 3) { say('love'); return; }
    st.food += 1; save(); drawBowl();
    bowl.classList.remove('add'); void bowl.offsetWidth; bowl.classList.add('add');
    const r = bowl.getBoundingClientRect();
    const p = document.createElement('span'); p.className = 'vy-plus'; p.textContent = '+1';
    p.style.left = r.left + r.width / 2 - 8 + 'px'; p.style.top = r.top - 18 + 'px';
    document.body.appendChild(p); setTimeout(() => p.remove(), 1000);
    if (st.hunger > 60 && !['eat', 'goEat', 'drag', 'fall', 'jump'].includes(mode)) goEat();
  }
  function pet() {
    st.pets = (+st.pets || 0) + 1; save();
    if (!['drag', 'fall', 'jump'].includes(mode)) { mode = 'sit'; until = performance.now() + 3500; }
    cat.classList.remove('hop'); void cat.offsetWidth; cat.classList.add('hop');
    say('love');
  }

  // ---------- перетаскивание (как Shimeji) ----------
  function down(e) {
    if (e.button > 0) return;
    press = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged = false;
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function move(e) {
    if (!press) return;
    if (!dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
    if (!dragged) { dragged = true; mode = 'drag'; jump = null; after = null; clearBubble(); cat.classList.add('drag'); }
    const s = sprite(HANG, K);
    x = e.clientX - s.w / 2; y = e.clientY + s.h - 6;
  }
  function up() {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    press = null;
    if (dragged) { cat.classList.remove('drag'); mode = 'fall'; vy = 0; surf = null; }
  }

  // ---------- что делать дальше ----------
  function jumpTo(s, tx) {
    const [a, b] = bounds(s);
    tx = Math.max(a, Math.min(b, tx));
    const dist = Math.hypot(tx - x, surfTop(s) - y);
    jump = { s, x0: x, y0: y, x1: tx, t0: performance.now(), dur: Math.min(900, 380 + dist * 0.9) };
    dir = tx >= x ? 1 : -1;
    mode = 'jump'; clearBubble('zz');
  }
  function goEat() {
    if (surf) { jumpTo(null, x); after = 'goEat'; return; }
    mode = 'goEat'; target = bowlRight() - 6;
  }
  function decide() {
    const t = performance.now();
    if (st.hunger > 60 && st.food > 0) { goEat(); return; }
    const r = Math.random();
    if (calm) { mode = r < 0.3 ? 'sleep' : 'sit'; until = t + 8000 + Math.random() * 8000; return; }
    if (r < 0.34) { const [a, b] = bounds(surf); mode = 'walk'; target = a + Math.random() * Math.max(10, b - a); return; }
    if (r < 0.58) {
      // прыжок на другой блок недалеко (или вниз, на пол)
      const ps = platforms().filter((p) => p.el !== surf && Math.abs((p.r.left + p.r.right) / 2 - x) < 520 && Math.abs(p.r.top - y) < 420);
      if (ps.length && Math.random() < 0.8) { const p = ps[Math.floor(Math.random() * ps.length)]; jumpTo(p.el, p.r.left + Math.random() * Math.max(10, p.r.width - size.w)); return; }
      if (surf) { jumpTo(null, x + (Math.random() - 0.5) * 200); return; }
    }
    if (r < 0.82) { mode = 'sit'; until = t + 3000 + Math.random() * 6000; return; }
    mode = 'sleep'; until = t + 10000 + Math.random() * 15000;
  }
  // как oneko: курсор остановился неподалёку — прибежать к нему (по блоку под курсором или по полу)
  function chase(t) {
    if (calm || !['sit', 'walk'].includes(mode) || t - chaseT < 7000) return;
    if (mouse.t === 0 || t - mouse.t < 1100 || t - mouse.t > 1400 || Math.random() < 0.4) return;
    chaseT = t;
    const ps = platforms();
    let best = null;
    for (const p of ps) if (mouse.x >= p.r.left && mouse.x <= p.r.right && p.r.top >= mouse.y - 12 && (!best || p.r.top < best.r.top)) best = p;
    const s = best ? best.el : null;
    const tx = mouse.x - size.w / 2;
    if (s === surf) { mode = 'run'; target = Math.max(bounds(s)[0], Math.min(bounds(s)[1], tx)); }
    else jumpTo(s, tx);
  }

  function say(kind) {
    if (!cat) return;
    if (bubble) bubble.remove();
    bubble = document.createElement('span');
    bubble.className = 'vy-bub ' + kind;
    bubble.innerHTML = kind === 'love' ? sprite(HEART, K * 0.9).svg : kind === 'think' ? sprite(FISH, K * 0.9, false).svg : 'Zzz…';
    cat.appendChild(bubble);
    if (kind === 'love') { const b = bubble; setTimeout(() => { if (b === bubble) { b.remove(); bubble = null; } }, 1400); }
  }
  function clearBubble(kind) { if (bubble && (!kind || bubble.classList.contains(kind))) { bubble.remove(); bubble = null; } }

  // ---------- кадр ----------
  function land(s) { surf = s; y = surfTop(s); jump = null; if (after === 'goEat') { after = null; mode = 'goEat'; target = bowlRight() - 6; } else decide(); }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !cat) { lastT = t; return; }
    const dt = Math.min(100, t - lastT) / 1000; lastT = t;
    st.hunger = Math.min(100, st.hunger + dt / 12);
    if (t - lastFrame > 160) { frame++; lastFrame = t; }
    if (t - measureT > 2000) { measureT = t; measure(); }
    chase(t);
    const hungry = st.hunger > 60;

    // блок уехал при прокрутке или исчез — падаем
    if (['sit', 'walk', 'run', 'sleep'].includes(mode) && !surfaceOk(surf)) { mode = 'fall'; vy = 0; surf = null; clearBubble('zz'); }

    let rows;
    if (mode === 'drag') rows = frame % 4 < 2 ? HANG : HANG_B;
    else if (mode === 'fall') {
      const prev = y; vy = Math.min(1600, vy + 2200 * dt); y += vy * dt;
      rows = HANG_B;
      // приземлиться на блок, через верх которого пролетели, или на пол
      const cx = x + size.w / 2;
      const hit = platforms().find((p) => cx >= p.r.left && cx <= p.r.right && p.r.top >= prev - 2 && p.r.top <= y);
      if (hit) land(hit.el); else if (y >= floorY()) { x = Math.max(bowlRight(), x); land(null); }
    } else if (mode === 'jump' && jump) {
      const k = Math.min(1, (t - jump.t0) / jump.dur), y1 = surfTop(jump.s);
      const h = 50 + Math.max(0, jump.y0 - y1) * 0.6;
      x = jump.x0 + (jump.x1 - jump.x0) * k;
      y = jump.y0 + (y1 - jump.y0) * k - h * 4 * k * (1 - k);
      rows = k < 0.5 ? JUMP : WALK_A;
      if (k >= 1) { if (surfaceOk(jump.s)) land(jump.s); else { mode = 'fall'; vy = 0; surf = null; jump = null; } }
    } else {
      y = surfTop(surf);
      if (mode === 'walk' || mode === 'run' || mode === 'goEat') {
        const dx = target - x; dir = dx >= 0 ? 1 : -1;
        // сменил направление — сначала разворачивается на месте, потом идёт мордой вперёд
        if (dir !== faced && Math.abs(dx) > 1) { faced = dir; turnUntil = t + 220; }
        const speed = mode === 'walk' ? 42 : 110;
        if (t >= turnUntil) x += dir * Math.min(Math.abs(dx), speed * dt);
        rows = t < turnUntil ? SIT : frame % 2 ? WALK_B : WALK_A;
        if (Math.abs(target - x) < 1) {
          if (mode === 'goEat') { mode = 'eat'; until = t + 3200; dir = -1; }
          else if (mode === 'run') { mode = 'sit'; until = t + 4000; say('love'); }
          else decide();
        }
      } else if (mode === 'eat') {
        rows = frame % 2 ? BLINK : SIT; dir = -1;
        if (t > until) { st.food = Math.max(0, st.food - 1); st.hunger = Math.max(0, st.hunger - 70); save(); drawBowl(); clearBubble('think'); say('love'); decide(); }
      } else if (mode === 'sleep') {
        rows = Math.floor(frame / 6) % 2 ? SLEEP_B : SLEEP;
        if (!bubble || !bubble.classList.contains('zz')) say('zz');
        if (t > until || (hungry && st.food > 0)) { clearBubble('zz'); decide(); }
      } else {
        rows = frame % 18 === 17 ? BLINK : SIT;
        if (t > until) decide();
      }
    }
    if (mode !== 'sleep') clearBubble('zz');
    // голоден, а корма нет: думает о рыбке (по несколько секунд, с перерывами)
    if (hungry && st.food === 0 && ['sit', 'walk'].includes(mode)) { if (frame % 40 < 18) { if (!bubble) say('think'); } else clearBubble('think'); }
    else clearBubble('think');

    const s = sprite(rows, K);
    if (shown !== rows) { body.innerHTML = s.svg; shown = rows; }
    if (rows === WALK_A || rows === WALK_B) size = { w: s.w, h: s.h };
    // спрайты нарисованы мордой вправо, спящий — влево
    if (!['walk', 'run', 'goEat'].includes(mode)) faced = dir;
    cat.classList.toggle('flip', mode === 'sleep' ? dir > 0 : dir < 0);
    if (mode !== 'drag' && mode !== 'fall' && mode !== 'jump') {
      const [a, b] = surf ? bounds(surf) : [mode === 'eat' || mode === 'goEat' ? bowlRight() - 8 : bowlRight(), innerWidth - s.w - 6];
      x = Math.max(a, Math.min(b, x));
    }
    cat.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - s.h)}px)`;
    if (t - saveT > 15000) { saveT = t; save(); }
  }

  // ---------- включение и выключение ----------
  // хозяин и вошёл в аккаунт: флаг ставит levels-ui.js по ответу /levels/me
  const own = () => {
    try {
      if (localStorage.getItem('casualhub.vasyan.own') !== '1') return false;
      const u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null');
      return !!(u && (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || 'null') || {})[u.id]);
    } catch (e) { return false; }
  };
  const start = () => { if (!st.off && own()) mount(); };
  document.addEventListener('casualhub:vasyan', () => { if (own() && !st.off) mount(); else unmount(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  addEventListener('resize', () => { if (alive) measure(); });
  addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
  addEventListener('pagehide', () => { if (alive) save(); });
  // переключатель в Настройках → Внешний вид
  document.addEventListener('change', (e) => {
    const c = e.target.closest && e.target.closest('[data-vasyan]');
    if (!c) return;
    st.off = !c.checked; save();
    if (st.off) unmount(); else mount();
    document.querySelectorAll('[data-vasyan]').forEach((x) => { x.checked = c.checked; });
  });
  window.CasualVasyan = { on: () => !st.off, own };
})();
