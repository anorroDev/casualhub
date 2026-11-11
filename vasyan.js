/* Казуал Хаб: котик Васян живёт внизу экрана на всех страницах — только у своих 10 хозяев.
   Это подарок «Первой десятке» (первые 10 аккаунтов): письмо в почте уровней, «Забрать котика».
   Хозяин ли этот браузер, помнит levels-ui.js (casualhub.vasyan.own) и шлёт событие casualhub:vasyan.
   Гуляет, сидит, спит (Zzz), гладится кликом (сердечко), ест из миски в левом нижнем углу; миску пополняют кликом.
   Проголодался, а корма нет — думает о рыбке. Голод копится и между заходами (localStorage, только в этом браузере).
   Выключается в Настройках → Внешний вид («Котик Васян на сайте», data-vasyan). При «меньше движения» не ходит.
   Спрайты — пиксельные сетки ниже, контур дорисовывается сам; картинок не грузит. Подключает util.js. */
(() => {
  if (window.CasualVasyan || /^\/(admin|r)\//.test(location.pathname)) return;
  const KEY = 'casualhub.vasyan.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- спрайты ----------
  const INK = '#1B1B1F';
  const PAL = { M: '#F4F4F0', O: '#F28E4C', K: '#353A47', E: INK, N: '#F59AC4', B: '#5B74FF', D: '#3B4FC4', F: '#A8693A', G: '#C98B5A', R: '#E8483B', Y: '#F2BA44', W: '#FFFFFF', S: '#8CC8F0' };
  const WALK_A = ['...................', '..K..........O...K.', '..K.........OOO.KKK', '..K.........OOMMKKK', '..K.........OEMMMEK', '..KK........MEMNMEM', '...K........MMMMMMM', '...KKKMMMMMOOMMMMM.', '....MMMMMOOOMMMMM..', '....MMKKMMMMMMMMM..', '....MM.MM...MM.MM..', '....MM.MM...MM.MM..', '...................'];
  const WALK_B = WALK_A.slice();
  WALK_B[1] = '.K...........O...K.'; WALK_B[2] = '.K..........OOO.KKK'; WALK_B[10] = '.....MM.MM.MM.MM...'; WALK_B[11] = '.....MM.MM.MM.MM...';
  const SIT = ['....................', '............O...K...', '...........OOO.KKK..', '...........OOOOKKKK.', '...........OMEMMEMK.', '...........MMEMMEMM.', '...........MMMNNMMM.', '..........MMMMMMMM..', '.........OOMMMMMMM..', '........OOOMMMMMMM..', '........OOMMMMMMMK..', '..KKK...OMMMMMMMKK..', '..KKKKKKKKKMMMMMMM..', '....................'];
  const BLINK = SIT.slice(); BLINK[4] = '...........OMMMMMMK.'; BLINK[5] = '...........MEEMMEEM.';
  const SLEEP = ['..................', '...O...K..........', '..OOO.KKK.........', '..OOOMMKKMMMMMMM..', '..MEEMEEMMMOOOMMM.', '..MMMNNMMMMOOOMMMM', '..MMMMMMMMMMMMMMMM', '...KKKKKKKKKKKKKKM', '..................'];
  const SLEEP_B = SLEEP.slice(); SLEEP_B[3] = '..OOOMMKKMMMMMMMM.'; SLEEP_B[6] = '..MMMMMMMMMMMMMMMMM';
  const HEART = ['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];
  const FISH = ['..S.....', '.SSSS.S.', 'SSWSSSS.', 'SSSSSSSS', '.SSSS.S.', '..S.....'];
  const BOWL = (n) => ['................', n >= 3 ? '...F.G.F.G.F....' : '................', n >= 2 ? '..GFGFGFGFGFGF..' : '................', n >= 1 ? 'DGFGFGFGFGFGFGFD' : 'DDDDDDDDDDDDDDDD', 'DBBBBBBBBBBBBBBD', '.BBBWBBBBBBBBBB.', '.BBBBBBBBBBBBBB.', '..BBBBBBBBBBBB..', '...DDDDDDDDDD...'];
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
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W * k}" height="${H * k}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`;
    cache.set(key, svg);
    return svg;
  }

  // ---------- разметка ----------
  const css = document.createElement('style');
  css.textContent = `
.vy-cat, .vy-bowl { position: fixed; z-index: 40; padding: 0; margin: 0; border: 0; background: none; cursor: pointer; line-height: 0; -webkit-tap-highlight-color: transparent; }
.vy-cat { left: 0; bottom: 0; transform-origin: 50% 100%; }
.vy-cat svg, .vy-bowl svg { display: block; }
.vy-cat.flip .vy-body { transform: scaleX(-1); }
.vy-cat.hop .vy-body { animation: vy-hop .35s steps(3, jump-none); }
@keyframes vy-hop { 50% { translate: 0 -8px; } }
.vy-bowl { left: 10px; bottom: 6px; }
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
  const now = Date.now();
  // голод копится и пока сайт закрыт: 1 пункт за 12 секунд, но не больше чем до «очень голоден»
  st.hunger = Math.min(100, (+st.hunger || 0) + (st.at ? Math.max(0, now - st.at) / 12000 : 0));
  st.food = st.food == null ? 2 : Math.max(0, Math.min(3, +st.food));
  st.at = now;
  const save = () => { st.at = Date.now(); write(st); };

  let cat, body, bubble, bowl, alive = false, raf = 0;
  let x = 120, dir = 1, mode = 'sit', until = 0, target = 0, frame = 0, lastFrame = 0, bubT = 0, floor = 0, lastT = 0;

  function mount() {
    if (alive) return;
    alive = true;
    if (!css.isConnected) document.head.appendChild(css);
    bowl = document.createElement('button');
    bowl.type = 'button'; bowl.className = 'vy-bowl';
    bowl.setAttribute('aria-label', 'Миска Васяна: насыпать корм');
    bowl.addEventListener('click', feed);
    cat = document.createElement('button');
    cat.type = 'button'; cat.className = 'vy-cat';
    cat.setAttribute('aria-label', 'Погладить котика Васяна');
    cat.innerHTML = '<span class="vy-body"></span>';
    body = cat.firstChild;
    cat.addEventListener('click', pet);
    document.body.append(bowl, cat);
    x = Math.min(innerWidth - 80, 90 + Math.random() * Math.max(40, innerWidth / 3));
    drawBowl(); decide(); measure();
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function unmount() {
    alive = false; cancelAnimationFrame(raf);
    if (cat) cat.remove(); if (bowl) bowl.remove();
    cat = bowl = bubble = null;
  }

  // над закреплёнными внизу панелями (полоса «Сохранить» в Мнении, нижние меню): ищем их у нижнего края
  function measure() {
    let top = innerHeight;
    for (let px = 12; px < innerWidth; px += 60) { // панель может занимать не всю ширину (полоса «Сохранить» в Мнении — только левая колонка)
      for (const el of document.elementsFromPoint(px, innerHeight - 12)) {
        if (el === cat || el === bowl || (cat && cat.contains(el)) || (bowl && bowl.contains(el)) || el === document.body || el === document.documentElement) continue;
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

  function drawBowl() { if (bowl) bowl.innerHTML = sprite(BOWL(st.food), K); }
  function feed() {
    if (st.food >= 3) { say('love'); return; }
    st.food += 1; save(); drawBowl();
    bowl.classList.remove('add'); void bowl.offsetWidth; bowl.classList.add('add');
    const r = bowl.getBoundingClientRect();
    const p = document.createElement('span'); p.className = 'vy-plus'; p.textContent = '+1';
    p.style.left = r.left + r.width / 2 - 8 + 'px'; p.style.top = r.top - 18 + 'px';
    document.body.appendChild(p); setTimeout(() => p.remove(), 1000);
    if (st.hunger > 60 && mode !== 'eat') goEat();
  }
  function pet() {
    st.pets = (+st.pets || 0) + 1; save();
    if (mode === 'sleep' || mode === 'walk' || mode === 'goEat') { mode = 'sit'; until = performance.now() + 3500; }
    cat.classList.remove('hop'); void cat.offsetWidth; cat.classList.add('hop');
    say('love');
  }
  const bowlX = () => 10 + 16 * K + 4;
  function goEat() { mode = 'goEat'; target = bowlX(); }

  // ---------- что делать дальше ----------
  function decide() {
    const t = performance.now();
    if (st.hunger > 60 && st.food > 0) { goEat(); return; }
    const r = Math.random();
    if (calm) { mode = r < 0.3 ? 'sleep' : 'sit'; until = t + 8000 + Math.random() * 8000; return; }
    if (r < 0.45) { mode = 'walk'; target = 16 * K + 30 + Math.random() * Math.max(60, innerWidth - 120 - 32 * K); }
    else if (r < 0.8) { mode = 'sit'; until = t + 3000 + Math.random() * 6000; }
    else { mode = 'sleep'; until = t + 10000 + Math.random() * 15000; }
  }

  function say(kind) {
    if (!cat) return;
    if (bubble) bubble.remove();
    bubble = document.createElement('span');
    bubble.className = 'vy-bub ' + kind;
    bubble.innerHTML = kind === 'love' ? sprite(HEART, K * 0.9) : kind === 'think' ? sprite(FISH, K * 0.9, false) : 'Zzz…';
    cat.appendChild(bubble);
    if (kind === 'love') { const b = bubble; setTimeout(() => { if (b === bubble) { b.remove(); bubble = null; } }, 1400); }
  }
  function clearBubble(kind) { if (bubble && (!kind || bubble.classList.contains(kind))) { bubble.remove(); bubble = null; } }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !cat) { lastT = t; return; }
    const dt = Math.min(100, t - lastT) / 1000; lastT = t;
    st.hunger = Math.min(100, st.hunger + dt / 12);
    if (t - lastFrame > 170) { frame++; lastFrame = t; }
    if (frame % 12 === 0 && t - lastFrame < 20) measure();
    const hungry = st.hunger > 60;

    let rows;
    if (mode === 'walk' || mode === 'goEat') {
      const dx = target - x; dir = dx >= 0 ? 1 : -1;
      x += dir * Math.min(Math.abs(dx), (mode === 'goEat' ? 70 : 42) * dt);
      rows = frame % 2 ? WALK_B : WALK_A;
      if (Math.abs(target - x) < 1) {
        if (mode === 'goEat') { mode = 'eat'; until = t + 3200; dir = -1; }
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
    if (mode !== 'sleep') clearBubble('zz');
    // голоден, а корма нет: думает о рыбке (по несколько секунд, с перерывами)
    if (hungry && st.food === 0 && mode !== 'sleep') { if (frame % 40 < 18) { if (!bubble) say('think'); } else clearBubble('think'); }
    else clearBubble('think');

    body.innerHTML = sprite(rows, K);
    // спрайты нарисованы мордой вправо, спящий — влево
    cat.classList.toggle('flip', mode === 'sleep' ? dir > 0 : dir < 0);
    const w = body.firstChild ? body.firstChild.getAttribute('width') : 57;
    x = Math.max(bowlX() - 6, Math.min(innerWidth - w - 6, x));
    cat.style.transform = `translateX(${Math.round(x)}px)`;
    cat.style.bottom = floor + 2 + 'px';
    if (t - bubT > 15000) { bubT = t; save(); }
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
