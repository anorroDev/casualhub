/* Казуал Хаб: котик Васян живёт на страницах сайта — только у своих 10 хозяев.
   Это подарок «Первой десятке» (первые 10 аккаунтов): письмо в почте уровней, «Забрать котика».
   Хозяин ли этот браузер, помнит levels-ui.js (casualhub.vasyan.own) и шлёт событие casualhub:vasyan.
   Как Shimeji: ходит не только по низу экрана, но и по верхним краям карточек и блоков, прыгает между ними,
   падает, если блок уехал при прокрутке; его можно схватить мышкой (висит за шкирку) и бросить — упадёт на то, что ниже.
   Как oneko: остановил курсор — может прибежать к нему или подкрасться и прыгнуть. Клик — погладить (мурчит, сердечки),
   много кликов подряд — пугается. Спит — Zzz, ест из миски (корм — кликом по миске), голоден при пустой миске —
   думает о еде. Голод копится и между заходами (localStorage, только в этом браузере).
   Миска — вещь с весом: её можно утащить мышкой и поставить на карточку или на пол — отпустил, и она падает (брошенная —
   кувыркается). Встала на новое место — Васян бежит к ней, прыгая по плиткам, поесть (пустую — понюхать). Карточку с миской
   прокрутили — миска падает, а Васян за ней. Сам он иногда подкрадывается и толкает миску лапой — с карточки, как коты
   со стола. Упала вверх дном — корм рассыпался рядом, Васян ест с пола; клик по перевёрнутой миске ставит её обратно.
   Лоток (тоже можно перетащить): поел — через пару минут идёт в лоток, копает, делает, закапывает и носится по полу.
   Кучки копятся — лоток надо убирать кликом; грязный — «Фу!», злится и делает рядом (и это убирать тоже).
   Злится, если часто тыкать, бросать или ронять с высоты: глаза-щёлочки, венка, сидит спиной, шипит; отходит от еды,
   уборки, редкой ласки и со временем. Корм и еда в миске и на полу каждый раз лежат по-разному, кусочки не одинаковые.
   Ещё повадки: смотрит на курсор, машет хвостом, умывается, зевает, чихает, потягивается, точит когти, лежит буханкой,
   перекатывается на спину, сидит на краю карточки свесив лапы, играет с клубком или игрушечной мышкой.
   Скины: окрас (палитра шерсти, глаз и носа), наряд (слой поверх головы) и миска (цвета и узор; часть — в магазине,
   четыре — за тайные достижения); ещё еда — что лежит в миске и о чём он думает, когда голоден (сухой корм у всех,
   остальная открывается по одной за уровень или покупается в магазине).
   Выбор — в Настройках → Внешний вид: этот файл сам заполняет блок data-vasyan-skins. Хранится в casualhub.vasyan.v1
   (skin, outfit, food, bowlSkin; порции в миске — bowl; где миска на полу — bx, вверх дном — flip, рассыпанное — spill)
   и сразу доходит до других вкладок.
   Выключается там же («Котик Васян на сайте», data-vasyan). При «меньше движения» не ходит, не прыгает и не кувыркается.
   Спрайты — пиксельные сетки ниже, контур дорисовывается сам; картинок не грузит. Подключает util.js. */
(() => {
  if (window.CasualVasyan || /^\/(admin|r)\//.test(location.pathname)) return;
  const KEY = 'casualhub.vasyan.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // на страницах игр (/games/…) котик не гуляет: там он сам герой игры и рисуется на холсте — кадры берёт CasualVasyan.pixels
  const NO_PET = /^\/games(\/|$)/.test(location.pathname);

  // ---------- окрасы и наряды ----------
  const INK = '#1B1B1F';
  // окрас: M — шерсть, O и K — пятна и хвост, E — глаза, N — нос, ink — контур (если не обычный).
  // id общие с магазином (vasyan.skin.<id>); classic — бесплатно у всех
  const COATS = [
    { id: 'classic', name: 'Классика', M: '#F4F4F0', O: '#F28E4C', K: '#353A47', E: INK, N: '#F59AC4' },
    { id: 'ginger', name: 'Рыжий', M: '#F7B26A', O: '#E5822F', K: '#B85E1F', E: INK, N: '#F08AA8' },
    { id: 'black', name: 'Чёрный', M: '#3A3E4B', O: '#2C2F39', K: '#22242C', E: '#F2C94C', N: '#9A5B72' },
    { id: 'tabby', name: 'Серый полосатый', M: '#BFC5CF', O: '#8E97A6', K: '#5D6677', E: INK, N: '#E99AB0' },
    // коричневый табби: тёплая коричневая шерсть, тёмные полосы и хвост, зелёные глаза
    { id: 'btabby', name: 'Коричневый табби', M: '#C08A5B', O: '#8A5A34', K: '#5C3A20', E: '#7FB24A', N: '#D98E86' },
    { id: 'siamese', name: 'Сиамский', M: '#F3E8D6', O: '#7A5644', K: '#4D3327', E: '#3E8FD6', N: '#C9857F' },
    // трёхцветный: пятна на голове чёрные, хвост рыжий — не путается с «Классикой»
    { id: 'calico', name: 'Трёхцветный', M: '#FFFDF8', O: '#26282F', K: '#E8772A', E: INK, N: '#F59AC4' },
    { id: 'white', name: 'Белый', M: '#FFFFFF', O: '#EEF1F6', K: '#D3D9E4', E: '#3E8FD6', N: '#F7A7C0' },
    // призрак: полупрозрачная шерсть и мягкий голубой контур
    { id: 'ghost', name: 'Призрак', M: '#EEF4FFCC', O: '#D2E0FFCC', K: '#B2C6F5CC', E: '#5B74FF', N: '#C9B8FF', ink: '#8EA6E0' },
    { id: 'choco', name: 'Шоколадный', M: '#8F6342', O: '#6E472C', K: '#4F311D', E: '#F2C94C', N: '#D9928A' },
    { id: 'smoke', name: 'Дымчатый', M: '#9FAABD', O: '#7F8BA1', K: '#5F6A80', E: '#E8C547', N: '#D798AE' },
    { id: 'peach', name: 'Персиковый', M: '#FBE3C1', O: '#F0BF83', K: '#D29554', E: INK, N: '#F2A0A8' },
    { id: 'neon', name: 'Неоновый', M: '#3B3F5C', O: '#FF5FB0', K: '#36E2D4', E: '#FFFFFF', N: '#FF5FB0' },
  ];
  // общие цвета: сердечко, рыбка, миска и корм; строчные буквы — наряды и игрушки (окрас их не меняет)
  const PAL = { R: '#E8483B', W: '#FFFFFF', S: '#8CC8F0', L: '#D3D8E0', G: '#9AA1AE', H: '#5E6573', I: '#F7F9FC', F: '#A8693A', J: '#D39A5E',
    a: '#F2C230', b: '#C8901A', c: '#4FA3F7', d: '#4C5266', e: '#5B74FF', f: '#3E50C8', g: '#15161B', h: '#6B4A2E', i: '#946A44',
    j: '#D63A4A', k: '#D9363E', n: '#F06292', o: '#B0185A', p: '#8B6CFF', q: '#FFD54A', r: '#E8483B', s: '#E5484D', t: '#F8F8F8',
    u: '#A3A9B6', v: '#FF6FB5', w: '#FFFFFF', x: '#D2438C', z: '#6C7383' };
  // наряд: части относительно головы кадра (L — столбец левого уха, top — строка ушей, neck — шея).
  // id общие с магазином (vasyan.outfit.<id>); none — у всех
  const OUTFITS = [
    { id: 'none', name: 'Без наряда', parts: [] },
    { id: 'hat', name: 'Шляпа', parts: [{ g: ['.hhh.', '.hih.', '.jjj.', 'hhhhh'], at: (h) => [h.L, h.top - 2] }] },
    { id: 'crown', name: 'Корона', parts: [{ g: ['a.a.a', 'aaaaa', 'arcra'], at: (h) => [h.L, h.top - 1] }] },
    { id: 'glasses', name: 'Очки', parts: [{ g: ['gwggggg', '.gg.gg.'], at: (h) => [h.L - 1, h.top + 3] }] },
    { id: 'scarf', name: 'Шарф', parts: [{ g: ['stststs', 'ts.....', 'st.....'], at: (h) => [h.L - 1, h.neck] }] },
    { id: 'headphones', name: 'Наушники', parts: [{ g: ['..ddddd..', '.d.....d.', '.d.....d.', 'ee.....ee', 'ef.....fe', 'ee.....ee'], at: (h) => [h.L - 2, h.top - 1] }] },
    { id: 'bow', name: 'Бантик', parts: [{ g: ['v...v', 'vvxvv', 'v...v'], at: (h) => [h.L + 2, h.top - 1] }] },
    { id: 'party', name: 'Колпак', parts: [{ g: ['..w..', '..p..', '.pqp.', '.qpq.', '.pqp.'], at: (h) => [h.L, h.top - 4] }] },
    { id: 'bell', name: 'Колокольчик', parts: [{ g: ['kkkkk', '..a..', '..b..'], at: (h) => [h.L, h.neck] }] },
  ];
  const coatOf = (id) => COATS.find((c) => c.id === id) || COATS[0];
  const outfitOf = (id) => OUTFITS.find((o) => o.id === id) || OUTFITS[0];

  // ---------- спрайты ----------
  // голова кадра — для наряда; face: 'l' — кадр нарисован мордой влево; drop — строк ниже линии лап (свесил лапы)
  const F = (rows, head, extra) => Object.assign(rows, { head }, extra);
  const HEAD_WALK = { L: 13, top: 1, neck: 7 }, HEAD_SIT = { L: 12, top: 1, neck: 7 };
  const WALK_A = F(['...................', '..K..........O...K.', '..K.........OOO.KKK', '..K.........OOMMKKK', '..K.........OEMMMEK', '..KK........MEMNMEM', '...K........MMMMMMM', '...KKKMMMMMOOMMMMM.', '....MMMMMOOOMMMMM..', '....MMKKMMMMMMMMM..', '....MM.MM...MM.MM..', '....MM.MM...MM.MM..', '...................'], HEAD_WALK);
  const WALK_B = F(WALK_A.slice(), HEAD_WALK);
  WALK_B[1] = '.K...........O...K.'; WALK_B[2] = '.K..........OOO.KKK'; WALK_B[10] = '.....MM.MM.MM.MM...'; WALK_B[11] = '.....MM.MM.MM.MM...';
  const JUMP = F(WALK_A.slice(), HEAD_WALK); JUMP[10] = '...MM........MM....'; JUMP[11] = '..MM..........MM...';

  // сидит: голова (глаза, щёки), а ниже — левая часть (хвост) и правая (грудь, лапы, рот) собираются из кусков
  const SIT_HEAD = ['....................', '............O...K...', '...........OOO.KKK..', '...........OOOOKKKK.'];
  const EYES = {
    open: ['...........OMEMMEMK.', '...........MMEMMEMM.'],
    blink: ['...........OMMMMMMK.', '...........MEEMMEEM.'],
    left: ['...........OEMMEMMK.', '...........MEMMEMMM.'],
    right: ['...........OMMEMMEK.', '...........MMMEMMEM.'],
    up: ['...........OMEMMEMK.', '...........MMMMMMMM.'],
    wide: ['...........OEEMEEMK.', '...........MEEMEEMM.'],
    // злой: глаза-щёлочки углом «\ /»
    angry: ['...........OEMMMMEK.', '...........MMEMMEMM.'],
  };
  const NOSE = '...........MMMNNMMM.', CHEEKS = '...........MNMNNMNM.';
  const TAILS = {
    down: ['.........', '.........', '........O', '........O', '..KKK...O', '..KKKKKKK'],
    mid: ['.........', '.........', '........O', '.KK.....O', '..KK....O', '...KKKKKK'],
    up: ['..K......', '..K......', '..KK....O', '...KK...O', '....KKK.O', '......KKK'],
    puff: ['.KK......', '.KK......', '.KKK....O', '..KKK...O', '...KKK..O', '.....KKKK'],
  };
  const BASE = ['.MMMMMMMM..', 'OOMMMMMMM..', 'OOMMMMMMM..', 'OMMMMMMMK..', 'MMMMMMMKK..', 'KKMMMMMMM..'];
  const POSES = {
    base: BASE,
    yawn: ['.MMMERREM..', 'OOMMMEEMM..', ...BASE.slice(2)],
    sneeze: ['.MMMMEEMM..', ...BASE.slice(1)],
    washA: ['.MMMMNMMMM.', 'OOMMMMMMMM.', 'OOMMMMMMMM.', BASE[3], BASE[4], 'KKMMMMM....'],
    washB: [BASE[0], 'OOMMMMMMMM.', 'OOMMMMMMMM.', 'OMMMMMMMKM.', BASE[4], 'KKMMMMM....'],
  };
  const sitMemo = new Map();
  function sitRows(eyes = 'open', pose = 'base', tail = 'down', cheeks = false) {
    const key = eyes + '|' + pose + '|' + tail + '|' + cheeks;
    let r = sitMemo.get(key);
    if (!r) {
      r = [...SIT_HEAD, ...EYES[eyes], cheeks ? CHEEKS : NOSE];
      for (let i = 0; i < 6; i++) r.push(TAILS[tail][i] + POSES[pose][i]);
      r.push('....................');
      sitMemo.set(key, F(r, HEAD_SIT));
    }
    return r;
  }
  const SIT = sitRows(), BLINK = sitRows('blink');
  const YAWN = sitRows('blink', 'yawn'), SNEEZE = sitRows('blink', 'sneeze');
  const WASH_A = sitRows('blink', 'washA'), WASH_B = sitRows('blink', 'washB');
  const PURR = sitRows('blink', 'base', 'down', true), PURR_B = sitRows('blink', 'base', 'mid', true);
  const SCARED = sitRows('wide', 'base', 'puff');
  // злой: шипит — шерсть дыбом, глаза-щёлочки; в лотке — сидит, хвост трубой, глаза зажмурены (тужится)
  const HISS = sitRows('angry', 'base', 'puff'), POTTY = sitRows('blink', 'base', 'up');
  // венка над головой, когда злой (как в аниме)
  const VEIN = ['.R.R.', 'RR.RR', '.....', 'RR.RR', '.R.R.'];

  const SLEEP = F(['..................', '...O...K..........', '..OOO.KKK.........', '..OOOMMKKMMMMMMM..', '..MEEMEEMMMOOOMMM.', '..MMMNNMMMMOOOMMMM', '..MMMMMMMMMMMMMMMM', '...KKKKKKKKKKKKKKM', '..................'], { L: 3, top: 1, neck: 6, face: 'l' });
  const SLEEP_B = F(SLEEP.slice(), SLEEP.head); SLEEP_B[3] = '..OOOMMKKMMMMMMMM.'; SLEEP_B[6] = '..MMMMMMMMMMMMMMMMM';
  // за шкирку: висит, лапки болтаются
  const HANG = F(['....O...K....', '...OOO.KKK...', '...OOOOKKKK..', '...OMEMMEMK..', '...MMEMMEMM..', '...MMMNNMMM..', '....MMMMMM...', '...MMMMMMMM..', '...OMMMMMMK..', '...OOMMMMKK..', '...MM.MM.MM..', '...MM....MM..', '.........KK..', '..........K..'], { L: 4, top: 0, neck: 6 });
  const HANG_B = F(HANG.slice(), HANG.head); HANG_B[10] = '...MM.MMMM...'; HANG_B[11] = '....MM..MM...'; HANG_B[12] = '........KK...'; HANG_B[13] = '........K....';
  // буханка: лапы спрятаны, хвост обёрнут вокруг
  const LOAF = F(['......................', '.............O...K....', '............OOO.KKK...', '............OOOOKKKK..', '............OMEMMEMK..', '.....MMMMMMMMMEMMEMM..', '...MMMMOOOMMMMMNNMMM..', '..MMMMOOOOOMMMMMMMMM..', '..MMMMMOOOMMMMMMMMMM..', '..KMMMMMMMMMMMMMMMMM..', '...KKKKKKKKKKKKKKKKK..', '......................'], { L: 13, top: 1, neck: 7 });
  const LOAF_BLINK = F(LOAF.slice(), LOAF.head); LOAF_BLINK[4] = '............OMMMMMMK..'; LOAF_BLINK[5] = '.....MMMMMMMMEEMMEEM..';
  // крадётся: низко, хвост прямо назад
  const STALK_A = F(['....................', '....................', '....................', '.............O...K..', '............OOO.KKK.', '............OOMMKKK.', '............OEMMMEK.', '............MEMNMEM.', '.KKKK.MMMMMMMMMMMMM.', '....MMMMMOOOMMMMMM..', '....MMKKMMMMMMMMM...', '...MM.MM...MM.MM....', '....................'], { L: 13, top: 3, neck: 8 });
  const STALK_B = F(STALK_A.slice(), STALK_A.head); STALK_B[11] = '....MMMM...MMMM.....';
  // перед прыжком виляет задом, кончик хвоста дёргается
  const WIGGLE = F(STALK_A.slice(), STALK_A.head); WIGGLE[7] = '.K..........MEMNMEM.'; WIGGLE[8] = '..KKK.MMMMMMMMMMMMM.';
  // играет: лапа вперёд по полу, потом — удар
  const PLAY_A = F(STALK_A.slice(), STALK_A.head); PLAY_A[11] = '...MM.MM...MM.MM.MM.';
  const PLAY_B = F(STALK_A.slice(), STALK_A.head); PLAY_B[10] = '....MMKKMMMMMMMMMMMM'; PLAY_B[11] = '...MM.MM...MM.......';
  // потягивается: зад вверх, передние лапы вытянуты вперёд; точит когти — лапы ходят вперёд-назад
  const STRETCH = F(['........................', '.K......................', '.K......................', '.KK.MMMMM...............', '..KMMMMMMMM.......O...K.', '...MMOOMMMMMM....OOO.KKK', '...MMOOOMMMMMMM..OOMMKKK', '...MM..MMMMMMMMMMOEMMMEK', '...MM....MMMMMMMMMEMNMEM', '...MM......MMMMMMMMMMMMM', '...MM....MMMMMMMMMMMMM..', '........................'], { L: 18, top: 4, neck: 9 });
  const SCRATCH = F(STRETCH.slice(), STRETCH.head); SCRATCH[10] = '...MM.......MMMMMMMMMM..';
  // сидит на краю карточки, лапы и хвост свешены вниз (3 строки ниже линии, на которой сидит)
  const EDGE = F(['................', '....O...K.......', '...OOO.KKK......', '...OOOOKKKK.....', '...OMEMMEMK.....', '...MMEMMEMM.....', '...MMMNNMMM.....', '...MMMMMMMM.....', '..OOMMMMMMMM....', '..OOMMMMMMMMKK..', '...MM..MM...K...', '...MM..MM...K...', '............K...'], { L: 4, top: 1, neck: 7 }, { drop: 3 });
  const EDGE_B = F(EDGE.slice(), EDGE.head, { drop: 3 }); EDGE_B[10] = '...MM..MM....K..'; EDGE_B[11] = '..MM....MM...K..'; EDGE_B[12] = '.............K..';
  const EDGE_BLINK = F(EDGE.slice(), EDGE.head, { drop: 3 }); EDGE_BLINK[4] = '...OMMMMMMK.....'; EDGE_BLINK[5] = '...MEEMMEEM.....';

  // ест из миски: пригнулся, голова опущена в миску (на dy строк ниже, чем когда крадётся), глаза довольно прищурены,
  // хвост трубой. Два кадра — голова чуть ниже и чуть выше: жуёт
  function eatFrame(dy) {
    const h = STALK_A.head, W = 20, g = STALK_A.map((r) => [...r.padEnd(W, '.')]);
    const out = g.map((r, y) => r.map((ch, x) => (y >= h.neck || x < h.L - 1 ? ch : '.')));
    for (let x = 0; x < 6; x++) if (out[8][x] === 'K') out[8][x] = '.';
    [[4, 2], [5, 2], [6, 2], [7, 2], [7, 3], [8, 3], [8, 4], [8, 5]].forEach(([y, x]) => { out[y][x] = 'K'; });
    for (let y = h.top; y < h.neck; y++) for (let x = h.L - 1; x < W; x++) {
      let ch = g[y][x];
      if (ch === '.' || y + dy >= out.length) continue;
      if (y === h.top + 3 && ch === 'E') ch = 'M';
      out[y + dy][x] = ch;
    }
    return F(out.map((r) => r.join('')), { L: h.L, top: h.top + dy, neck: h.neck + dy });
  }
  const EAT_A = eatFrame(2), EAT_B = eatFrame(3);

  const HEART = ['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];
  // игрушки: клубок (два кадра — катится) и мышка
  const YARN_A = ['..nn..', '.nonn.', 'nnoonn', 'nonnon', '.nnon.', '..nn..'];
  const YARN_B = ['..nn..', '.nnon.', 'nonnon', 'nnoonn', '.nonn.', '..nn..'];
  const MOUSE = ['.....uv...', '...uuuuuu.', 'z.uuuuugu.', '.zuuuuuuuv', '..z.u..u..'];

  // ---------- еда ----------
  // id общие с магазином (vasyan.food.<id>): сухой корм — у всех, остальное открывается по одной за уровень или покупается.
  // Картинка лежит в миске и снится Васяну, когда он голоден; у каждой еды своя палитра (pal), окрас её не трогает
  const FOODS = [
    // A, C, P — ещё три оттенка кусочков корма (к J и F из PAL): горка не из одинаковых зёрен
    { id: 'kibble', name: 'Сухой корм', pal: { b: '#A8693A', c: '#D39A5E', A: '#8A5228', C: '#C27D45', P: '#E8BC86' }, g: ['.bb..bb.', 'bcbbbbcb', 'bbb.bbbb', '.bbbcb..', '..bbb...'] },
    { id: 'fish', name: 'Рыбка', pal: { s: '#8CC8F0', t: '#5FA8DC', w: '#FFFFFF' }, g: ['..s.....', '.ssss.s.', 'sswssss.', 'ssssssss', '.sttt.s.', '..s.....'] },
    { id: 'milk', name: 'Молоко', pal: { t: '#C9D3E3', w: '#F7F9FC', b: '#4F8BE8' }, g: ['..tt..', '.tttt.', 'wwwwww', 'wbbbbw', 'wbwwbw', 'wbbbbw', 'wwwwww'] },
    { id: 'sausage', name: 'Сосиска', pal: { p: '#D9765C', h: '#F2B39E', r: '#8E3B2A' }, g: ['..pppppp..', '.phhhhhpp.', 'rppppppppr', '.pppppppp.'] },
    { id: 'cheese', name: 'Сыр', pal: { y: '#F6C343', o: '#D89A1E' }, g: ['....yyy', '..yyyyy', 'yyyoyyy', 'yoyyyoy', 'yyyyyyy'] },
    { id: 'chicken', name: 'Курочка', pal: { b: '#9A5A2B', c: '#D08A4A', w: '#F4EFE4' }, g: ['..bbb...', '.bcccb..', 'bcccccb.', 'bccccb..', '.bbbb...', '....ww..', '....w.w.'] },
    { id: 'pelmeni', name: 'Пельмени', pal: { p: '#F7EBD3', d: '#D6BC8E', g: '#5BB04F' }, g: ['.dd.g.dd.', 'dppd.dppd', 'dppd.dppd', '.dd...dd.'] },
    { id: 'noodles', name: 'Доширак', pal: { y: '#F2D06B', r: '#E04A3A', w: '#FFFFFF', g: '#9AA1AE' }, g: ['......g.', '.y.y.yg.', 'yyyyyyyy', 'rrrrrrrr', 'rwwrrwwr', '.rrrrrr.', '..rrrr..'] },
    { id: 'shrimp', name: 'Креветки', pal: { o: '#F28E5C', h: '#FBC4A8', k: '#1B1B1F', t: '#E0663A' }, g: ['..oooo..', '.oohhok.', 'oo......', 'oo......', '.oo..tt.', '..oooott'] },
    { id: 'pizza', name: 'Пицца', pal: { b: '#C98A4B', y: '#F6C343', r: '#D9443B' }, g: ['bbbbbbb', 'yryyyry', '.yyyyy.', '..yry..', '...y...'] },
    { id: 'watermelon', name: 'Арбуз', pal: { r: '#E8484F', k: '#1B1B1F', w: '#E9F5D8', g: '#3FA34D' }, g: ['rrrrrrrrrr', 'rrkrrrrkrr', '.rrrrkrrr.', '..wwwwww..', '...gggg...'] },
    { id: 'sushi', name: 'Суши', pal: { o: '#F28E5C', h: '#FBC4A8', w: '#F4F4F0', n: '#1E2A22' }, g: ['.oooooo.', 'ohohohoo', 'wwwnnwww', '.wwnnww.'] },
    { id: 'shawarma', name: 'Шаурма', pal: { g: '#5BB04F', m: '#8A5530', r: '#D9443B', p: '#E9C891', w: '#F4F4F0' }, g: ['.gmrmg.', 'ppppppp', 'ppppppp', 'wwwwwww', 'wwwwwww', '.wwwww.'] },
    { id: 'cake', name: 'Тортик', pal: { r: '#D9443B', w: '#FFF6F0', p: '#F59AC4', c: '#F2D9A6' }, g: ['...r....', '.wwwwww.', 'pppppppp', 'cccccccc', 'pppppppp', 'cccccccc'] },
  ];
  FOODS.forEach((f) => { f.rows = Object.assign(f.g.slice(), { pal: f.pal }); });
  const foodOf = (id) => FOODS.find((f) => f.id === id) || FOODS[0];
  // зерно → одни и те же «случайные» числа: горка корма выглядит одинаково, пока её не тронули (насыпали — новое зерно)
  const rnd = (seed) => {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  // кусочек сухого корма — один из пяти оттенков, от тёмного до светлого
  const kib = (r) => { const v = r(); return v < 0.3 ? 'F' : v < 0.55 ? 'J' : v < 0.74 ? 'C' : v < 0.9 ? 'A' : 'P'; };
  // ещё одна штука той же еды — не копия первой: зеркально, светлее или темнее. У каждой копии свои буквы (палитра
  // у спрайта одна на всё), а цвета — те же, сдвинутые по яркости
  const COPY_KEYS = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';
  function shade(hex, k) {
    const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
    if (!m || !k) return hex;
    const n = parseInt(m[1], 16), to = k > 0 ? 255 : 0, a = Math.abs(k);
    const ch = (v) => Math.round(v + (to - v) * a).toString(16).padStart(2, '0');
    return '#' + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255) + (m[2] || '');
  }
  function foodCopy(f, i, flip) {
    const w = Math.max(...f.g.map((r) => r.length)), v = i % 3, k = [0, 0.14, -0.14][v], map = {}, pal = {};
    Object.keys(f.pal).forEach((ch, j) => { const nk = v ? COPY_KEYS[(v - 1) * 16 + j] : ch; map[ch] = nk; pal[nk] = shade(f.pal[ch], k); });
    const g = f.g.map((r) => { const row = [...r.padEnd(w, '.')].map((ch) => (ch === '.' ? ch : map[ch] || ch)); return (flip ? row.reverse() : row).join(''); });
    return { g, pal };
  }

  // ---------- миски ----------
  // id общие с магазином (vasyan.bowl.<id>): стальная — у всех, часть продаётся, часть открывают достижения: secret —
  // тайные (какое — знает только сервер), ach — обычные (название — из магазина, CasualShop.achOf).
  // pal — цвета: G — край и тень, L — сама миска, I — блик, H — дно;
  // body — свой узор на верхних строках тела (остальные — как у стальной). Буквы узоров заглавные: строчные — у еды
  const BOWLS = [
    { id: 'steel', name: 'Стальная', pal: {} },
    { id: 'red', name: 'Красная', pal: { G: '#A8362F', L: '#E8584D', I: '#FF9C8F', H: '#70201B' } },
    { id: 'dots', name: 'В горошек', pal: { G: '#8E96A6', L: '#FFFFFF', I: '#FFFFFF', H: '#5E6573', D: '#4F8BE8' },
      body: ['GIIILLLDLLLLDLLLLG', '.GLILDLLLLDLLLLDG.', '..GGLLLDLLLLDLGG..'] },
    { id: 'wood', name: 'Деревянная', pal: { G: '#6E4A2A', L: '#B07A45', I: '#D9A46A', H: '#4A3018', D: '#8A5A30' },
      body: ['GIIILLLDDDLLLLDDLG', '.GLIDDLLLLDDDLLLG.', '..GGLLLDDDLLLLGG..'] },
    { id: 'sea', name: 'С рыбкой', pal: { G: '#3F7FB0', L: '#8CC8F0', I: '#D4EDFC', H: '#2A5A80', D: '#F28E4C', Q: '#1B1B1F' },
      body: ['GIIILLLLDDLDLLLLLG', '.GLILLLQDDDDLLLLG.', '..GGLLLLDDLDLLGG..'] },
    { id: 'gold', name: 'Золотая', pal: { G: '#A8780E', L: '#F2C230', I: '#FFF2A8', H: '#6E4E06', T: '#FFFFFF' },
      body: ['GIIILLLLLLLLLTLLLG', '.GLILLLLLLLLLLLLG.', '..GGLLLLLLLLLTGG..'] },
    { id: 'moon', name: 'Лунная', secret: true, pal: { G: '#1F2A52', L: '#33427A', I: '#5466A8', H: '#141B38', Y: '#F2C94C', T: '#FFFFFF' },
      body: ['GIIILLYYLLLLLTLLLG', '.GLILYLLLLTLLLLLG.', '..GGLLYYLLLLLTGG..'] },
    { id: 'ref', name: 'Судейская', secret: true, pal: { G: '#1B1B1F', L: '#F4F4F0', I: '#FFFFFF', H: '#111114', D: '#1B1B1F' },
      body: ['GIIDDLLDDLLDDLLDDG', '.GLDDLLDDLLDDLLDG.', '..GGDLLDDLLDDLGG..'] },
    { id: 'nope', name: 'Несогласная', secret: true, pal: { G: '#8E1E25', L: '#D9363E', I: '#F27A80', H: '#5C1418', X: '#FFFFFF' },
      body: ['GIIILLLXLXLLLLLLLG', '.GLILLLLXLLLLLLLG.', '..GGLLLXLXLLLLGG..'] },
    { id: 'home', name: 'Домашняя', secret: true, pal: { G: '#B0507A', L: '#F59AC4', I: '#FFD4E8', H: '#7A3354', R: '#D9363E' },
      body: ['GIIILLRRLRRLLLLLLG', '.GLILLRRRRRLLLLLG.', '..GGLLLRRRLLLLGG..'] },
    { id: 'paw', name: 'С лапкой', ach: true, pal: { G: '#8E96A6', L: '#FFFFFF', I: '#FFFFFF', H: '#5E6573', R: '#F59AC4' },
      body: ['GIIILLLRLRLRLLLLLG', '.GLILLLLRRRLLLLLG.', '..GGLLLLRRRLLLGG..'] },
    { id: 'note', name: 'Нотная', ach: true, pal: { G: '#1B1B1F', L: '#3A3E4B', I: '#5E6573', H: '#111114', D: '#F2C94C' },
      body: ['GIIILLLDDLLLLDDLLG', '.GLILLLDLLLLLDLLG.', '..GGLLDDLLLLDDGG..'] },
    { id: 'chess', name: 'Шахматная', ach: true, pal: { G: '#5E6573', L: '#F4F4F0', I: '#FFFFFF', H: '#3A3E4B', D: '#1B1B1F' },
      body: ['GIIIDDLLDDLLDDLLDG', '.GLILLDDLLDDLLDDG.', '..GGDDLLDDLLDDGG..'] },
  ];
  const bowlOf = (id) => BOWLS.find((b) => b.id === id) || BOWLS[0];
  // миска с бликом; в ней — выбранная еда: сухой корм горкой, остальное картинками
  // (одна, две рядом, три — горкой), нижний ряд картинки лежит на кромке миски
  const BOWL_RIM = 'GLLLLLLLLLLLLLLLLG', BOWL_EMPTY = 'GLLHHHHHHHHHHHHLLG', BLANK = '..................';
  const BOWL_BODY = ['GIIILLLLLLLLLLLLLG', '.GLILLLLLLLLLLLLG.', '..GGLLLLLLLLLLGG..', '...HGGGGGGGGGGH...', '....HHHHHHHHHH....'];
  const bodyOf = (b) => (b.body ? [...b.body, ...BOWL_BODY.slice(b.body.length)] : BOWL_BODY);
  // горка корма в миске: снизу шире, кверху уже, края и верх неровные, зёрна разных оттенков
  function kibblePile(n, seed) {
    const r = rnd(seed), spans = n >= 3 ? [16, 12, 6] : n === 2 ? [14, 8] : [12], rows = [BLANK, BLANK, BLANK];
    spans.forEach((w, i) => {
      const a = Math.floor((18 - w) / 2) + (i && r() < 0.5 ? 1 : 0), row = [...BLANK], top = i === spans.length - 1;
      for (let xx = a; xx < Math.min(17, a + w); xx++) {
        if ((xx === a || xx === a + w - 1 || top) && r() < 0.3) continue;
        row[xx] = kib(r);
      }
      rows[2 - i] = row.join('');
    });
    return rows;
  }
  // одни и те же строки — один и тот же массив: sprite() помнит картинку по нему, и миска не перерисовывается зря
  const rowsMemo = new Map();
  const memo = (key, make) => {
    let out = rowsMemo.get(key);
    if (!out) { if (rowsMemo.size > 400) rowsMemo.clear(); out = make(); rowsMemo.set(key, out); }
    return out;
  };
  // seed — зерно этой порции: еда в миске лежит каждый раз немного по-другому
  function bowlRows(n, f, b = bowlSkin, seed = st.seed) {
    return memo(n + '|' + f.id + '|' + b.id + '|' + seed, () => {
      const body = bodyOf(b), extra = {};
      let out;
      if (!n) out = [BLANK, BLANK, BLANK, BOWL_EMPTY, ...body];
      else if (f.id === 'kibble') out = [...kibblePile(n, seed), BOWL_RIM, ...body];
      else {
        const w = Math.max(...f.g.map((r) => r.length)), h = f.g.length, mid = Math.floor((18 - w) / 2);
        // широкая еда (сосиска, арбуз) рядом не помещается — кладётся стопкой
        const spots = w > 8 ? Array.from({ length: n }, (_, i) => [mid + (i % 2), i * 2])
          : n === 1 ? [[mid, 0]] : [[1, 0], [17 - w, 0]];
        if (n >= 3 && w <= 8) spots.push([mid, h - 2]);
        const up = Math.max(...spots.map((s) => s[1])) + h - 1;
        const grid = Array.from({ length: up + 1 + body.length }, () => Array(18).fill('.'));
        [BOWL_RIM, ...body].forEach((r, i) => { [...r].forEach((ch, x) => { grid[up + i][x] = ch; }); });
        // каждая штука своя: зеркально, светлее, темнее — как выпало по зерну
        const flip0 = rnd(seed)() < 0.5;
        spots.forEach(([sx, lift], i) => {
          const c = foodCopy(f, i, i === 1 ? !flip0 : flip0);
          Object.assign(extra, c.pal);
          c.g.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && sx + x >= 0 && sx + x < 18) grid[up - lift - (h - 1) + y][sx + x] = ch; }));
        });
        out = grid.map((r) => r.join(''));
      }
      return Object.assign(out, { pal: { ...b.pal, ...(n ? f.pal : {}), ...extra } });
    });
  }
  // миска вверх дном: дно сверху, край — на полу
  const flipRows = (b = bowlSkin) => memo('flip|' + b.id, () => Object.assign([...bodyOf(b)].reverse().concat([BOWL_EMPTY]), { pal: b.pal }));
  // рассыпанная еда на полу: сухой корм — плоской горкой (шире, чем больше порций, гуще к середине, пара зёрен
  // укатилась), остальное — штуками вразброс: каждая своя и чуть выше или ниже соседней
  function spillRows(n, f, seed = 1) {
    return memo('spill|' + n + '|' + f.id + '|' + seed, () => {
      const r = rnd(seed);
      if (f.id === 'kibble') {
        const w = 8 + 4 * n, top = Array(w).fill('.'), low = Array(w).fill('.');
        for (let i = 1; i < w - 1; i++) {
          const mid = 1 - Math.abs(i - (w - 1) / 2) / (w / 2);
          if (r() < 0.45 + mid * 0.5) low[i] = kib(r);
          if (r() < mid * 0.6) top[i] = kib(r);
        }
        low[r() < 0.5 ? 0 : w - 1] = kib(r);
        return Object.assign([top.join(''), low.join('')], { pal: f.pal });
      }
      const w = Math.max(...f.g.map((q) => q.length)), h = f.g.length, flip0 = r() < 0.5, pal = {};
      const grid = Array.from({ length: h + 1 }, () => Array(n * (w + 1) - 1).fill('.'));
      for (let i = 0; i < n; i++) {
        const c = foodCopy(f, i, i % 2 ? !flip0 : flip0), dy = r() < 0.5 ? 0 : 1;
        Object.assign(pal, c.pal);
        c.g.forEach((q, yy) => [...q].forEach((ch, xx) => { if (ch !== '.') grid[yy + 1 - dy][i * (w + 1) + xx] = ch; }));
      }
      return Object.assign(grid.map((q) => q.join('')), { pal });
    });
  }

  // ---------- лоток ----------
  // вид спереди-сверху: задний бортик, наполнитель, передний бортик и стенка. Кучки лежат на наполнителе (видно до
  // трёх; с трёх лоток грязный). Пока котик в лотке, поверх него рисуется только передняя стенка (boxFrontRows)
  const BOX_PAL = { T: '#2E4F8C', U: '#4F7FD0', V: '#86ACEB', X: '#E3CF9E', Y: '#C4AA72', p: '#6B4423', q: '#94643A' };
  const BOX_BLANK = '........................';
  const BOX_BACK = ['.TTTTTTTTTTTTTTTTTTTTTT.', 'TXXYXXXXXYXXXXXXYXXXXYXT'];
  const BOX_FRONT = ['TTTTTTTTTTTTTTTTTTTTTTTT', 'TUVUUUUUUUUUUUUUUUUUUUUT', 'TUUUUUUUUUUUUUUUUUUUUUUT', '.TTTTTTTTTTTTTTTTTTTTTT.'];
  const POO = ['..p..', '.pqp.', 'ppppp'], POO_SPOTS = [4, 10, 15], BOX_FULL = 3;
  // скины лотка: id общие с магазином (vasyan.box.<id>), синий — у всех, часть продаётся, часть открывают достижения
  // (ach). pal — цвета (T — бортики, U — стенка, V — блик; наполнитель X и Y — у всех свой), front — свой узор на двух
  // средних строках передней стенки
  const BOXES = [
    { id: 'blue', name: 'Синий', pal: {} },
    { id: 'pink', name: 'Розовый', pal: { T: '#A84473', U: '#F28DB8', V: '#FFC7DF' } },
    { id: 'green', name: 'Зелёный', pal: { T: '#2F7A3E', U: '#55B86A', V: '#9BE0A8' } },
    { id: 'wood', name: 'Деревянный', pal: { T: '#5C3D22', U: '#B07A45', V: '#D9A46A', D: '#8A5A30' },
      front: ['TUVUUUDDDUUUUUUDDDUUUUUT', 'TUUDDDUUUUUUDDDUUUUDDDUT'] },
    { id: 'tiger', name: 'Тигровый', pal: { T: '#1B1B1F', U: '#F28E4C', V: '#FFC08A', D: '#1B1B1F' },
      front: ['TUVDUUDUUDUUDUUDUUDUUDUT', 'TUDUUDUUDUUDUUDUUDUUDUUT'] },
    { id: 'gold', name: 'Золотой', pal: { T: '#A8780E', U: '#F2C230', V: '#FFF2A8', W: '#FFFFFF' },
      front: ['TUVUUUUUWUUUUUUUUWUUUUUT', 'TUUUUWUUUUUUUWUUUUUUUWUT'] },
    // за достижения: «В ритме», «Критик», «Исполнительный», «Участник события»
    { id: 'retro', name: 'Ретро', ach: true, pal: { T: '#3A3E4B', U: '#9AA1AE', V: '#D3D8E0', W: '#5E6573', D: '#E8483B', E: '#4F8BE8' },
      front: ['TUVUWWWUUUUUUUUUUUUDUEUT', 'TUUUWWWUUUUUUUUUUUUUUUUT'] },
    { id: 'space', name: 'Космос', ach: true, pal: { T: '#141B38', U: '#33427A', V: '#5466A8', W: '#FFFFFF', D: '#F2C94C' },
      front: ['TUVUUWUUUUUUDUUUUUUWUUUT', 'TUUUUUUUWUUUUUUWUUUUUDUT'] },
    { id: 'crown', name: 'Королевский', ach: true, pal: { T: '#C9971A', U: '#7A3FB0', V: '#A96BE0', D: '#F2C230', R: '#E8483B' },
      front: ['TUVUUUUUUUUUUUUUUUUUUUUT', 'TUUDUUURUUUDUUURUUUDUUUT'] },
    { id: 'party', name: 'Праздничный', ach: true, pal: { T: '#8E96A6', U: '#FFFFFF', V: '#FFFFFF', A: '#E8483B', B: '#4F8BE8', C: '#F2C230', E: '#43C97A' },
      front: ['TUVAUUBUUCUUEUUAUUBUUCUT', 'TUUUCUUEUUAUUBUUCUUEUUUT'] },
  ];
  const boxSkinOf = (id) => BOXES.find((b) => b.id === id) || BOXES[0];
  const frontOf = (b) => (b.front ? [BOX_FRONT[0], ...b.front, BOX_FRONT[3]] : BOX_FRONT);
  // n — сколько кучек: низ кучки — на наполнителе, верх — над задним бортиком
  const boxRows = (n, b = boxSkin) => memo('box|' + Math.min(3, n) + '|' + b.id, () => {
    const rows = [BOX_BLANK, ...BOX_BACK, ...frontOf(b)].map((r) => [...r]);
    for (let i = 0; i < Math.min(3, n); i++) POO.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch !== '.') rows[yy][POO_SPOTS[i] + xx] = ch; }));
    return Object.assign(rows.map((r) => r.join('')), { pal: { ...BOX_PAL, ...b.pal } });
  });
  const boxFrontRows = (b = boxSkin) => memo('boxfront|' + b.id, () => Object.assign([BOX_BLANK, BOX_BLANK, BOX_BLANK, ...frontOf(b)], { pal: { ...BOX_PAL, ...b.pal } }));
  const pooRows = () => memo('poo', () => Object.assign(POO.slice(), { pal: BOX_PAL }));
  // вонь над грязным лотком — три волнистые линии
  const STINK = Object.assign(['.s...s...s', 's...s...s.', '.s...s...s', 's...s...s.'], { pal: { s: '#8BC34A' } });

  let coat = COATS[0], outfit = OUTFITS[0], bowlSkin = BOWLS[0], boxSkin = BOXES[0];
  const cache = new WeakMap();
  // кадр → сетка цветов (null — пусто): окрас, наряд поверх головы и контур. Наряд, который вылезает за кадр, расширяет
  // поле — сверху и симметрично по бокам, чтобы при развороте кот не съезжал. Из сетки sprite() ниже собирает svg,
  // а игры на холсте берут её как есть (CasualVasyan.pixels)
  function cells(rows, outline, c, o) {
    const W0 = Math.max(...rows.map((r) => r.length)), H0 = rows.length;
    const put = [];
    if (rows.head && o.parts.length) for (const p of o.parts) {
      let [x0, y0] = p.at(rows.head), g = p.g;
      const w = Math.max(...g.map((r) => r.length));
      // кадр мордой влево — наряд зеркально (бант на другом ухе, конец шарфа сзади)
      if (rows.head.face === 'l') { g = g.map((r) => [...r.padEnd(w, '.')].reverse().join('')); x0 = 2 * rows.head.L + 4 - x0 - w + 1; }
      put.push({ g, x0, y0, w });
    }
    let minX = 0, minY = 0, maxX = W0 - 1;
    for (const p of put) { minX = Math.min(minX, p.x0); minY = Math.min(minY, p.y0); maxX = Math.max(maxX, p.x0 + p.w - 1); }
    const padY = put.length && outline ? Math.max(0, 1 - minY) : Math.max(0, -minY);
    const padX = put.length ? Math.max(0, (outline ? 1 : 0) - minX, maxX - (W0 - 1) + (outline ? 1 : 0)) : 0;
    const W = W0 + padX * 2, H = H0 + padY;
    const g = Array.from({ length: H }, () => Array(W).fill(null));
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch === '.') continue; const v = (rows.pal && rows.pal[ch]) || c[ch] || PAL[ch]; if (v) g[y + padY][x + padX] = v; } });
    for (const p of put) p.g.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const v = r[x] === '.' ? null : PAL[r[x]];
        const gy = p.y0 + y + padY, gx = p.x0 + x + padX;
        if (v && g[gy] && gx >= 0 && gx < W) g[gy][gx] = v;
      }
    });
    if (outline) {
      const ink = (rows.head && c.ink) || INK, add = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const v = g[y + dy] && g[y + dy][x + dx]; return v && v !== INK && v !== ink; })) add.push([x, y]);
      add.forEach(([x, y]) => { g[y][x] = ink; });
    }
    return { g, W, H, W0, H0, padX, padY };
  }
  // кадр → svg. Пиксели одного цвета — одним path (подряд по строке — одним прямоугольником): меньше узлов при смене кадра.
  // ox и oy — поля под наряд, cw и ch — размер самого кота
  function sprite(rows, k, outline = true, cId, oId) {
    const c = cId ? coatOf(cId) : coat, o = oId ? outfitOf(oId) : outfit;
    const key = k + '|' + outline + '|' + c.id + '|' + o.id;
    let m = cache.get(rows);
    if (!m) { m = new Map(); cache.set(rows, m); }
    let out = m.get(key);
    if (out) return out;
    const { g, W, H, W0, H0, padX, padY } = cells(rows, outline, c, o);
    const by = new Map();
    for (let y = 0; y < H; y++) for (let x = 0; x < W;) {
      const v = g[y][x];
      if (!v) { x++; continue; }
      let e = x + 1;
      while (e < W && g[y][e] === v) e++;
      by.set(v, (by.get(v) || '') + `M${x} ${y}h${e - x}v1h-${e - x}z`);
      x = e;
    }
    let r = '';
    for (const [v, d] of by) r += `<path fill="${v}" d="${d}"/>`;
    out = { svg: `<svg viewBox="0 0 ${W} ${H}" width="${W * k}" height="${H * k}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`,
      w: W * k, h: H * k, ox: padX * k, oy: padY * k, cw: W0 * k, ch: H0 * k };
    m.set(key, out);
    return out;
  }

  // ---------- разметка ----------
  const css = document.createElement('style');
  css.textContent = `
.vy-cat, .vy-bowl { position: fixed; z-index: 40; padding: 0; margin: 0; border: 0; background: none; cursor: pointer; line-height: 0; -webkit-tap-highlight-color: transparent; }
.vy-cat { left: 0; top: 0; touch-action: none; cursor: grab; }
.vy-cat.drag { cursor: grabbing; z-index: 60; }
.vy-cat svg, .vy-bowl svg, .vy-toy svg { display: block; }
.vy-body { display: block; transform-origin: 50% 50%; } /* строчный span не принимает transform — без этого Васян не разворачивался и ходил задом */
.vy-cat.flip .vy-body { transform: scaleX(-1); }
.vy-cat.belly .vy-body { transform: rotate(180deg); }
.vy-cat.flip.belly .vy-body { transform: scaleX(-1) rotate(180deg); }
.vy-cat.rolling .vy-body { transition: transform .45s steps(4, jump-none); }
.vy-cat.hop .vy-body { animation: vy-hop .35s steps(3, jump-none); }
@keyframes vy-hop { 50% { translate: 0 -8px; } }
/* приземление: присел от удара (от лап, не от середины) */
.vy-cat.land .vy-body { transform-origin: 50% 100%; animation: vy-land .3s steps(3, jump-none); }
@keyframes vy-land { 0% { scale: 1.18 .78; } 55% { scale: .94 1.07; } }
/* сальто на длинном прыжке: оборот за время полёта, по шагам, как пиксельный спрайт */
.vy-cat.flipjump .vy-body { animation: vy-flip var(--fd, .7s) steps(8, jump-none) both; }
@keyframes vy-flip { to { rotate: var(--fr, 360deg); } }
/* пыль из-под лап */
.vy-crumb { position: fixed; z-index: 41; width: 4px; height: 4px; pointer-events: none; animation: vy-crumb .6s steps(6, jump-none) forwards; }
@keyframes vy-crumb { 45% { translate: calc(var(--dx, 0px) * .6) -12px; } to { translate: var(--dx, 0px) 5px; opacity: 0; } }
.vy-bowl.nom svg { animation: vy-nom .22s steps(2, jump-none); }
@keyframes vy-nom { 50% { transform: translateX(1px) rotate(-3deg); } }
.vy-dust { position: fixed; z-index: 39; width: 6px; height: 6px; margin: -3px 0 0 -3px; background: var(--ink-3, #8a8f9c); opacity: .75; pointer-events: none; animation: vy-dust .5s steps(4, jump-none) forwards; }
@keyframes vy-dust { to { translate: var(--dx, 10px) -9px; opacity: 0; } }
/* миска: место ставит transform (как у котика), поворот в полёте — у вложенного .vy-bowl-in */
.vy-bowl { left: 0; top: 0; touch-action: none; cursor: grab; filter: drop-shadow(0 3px 0 rgb(0 0 0 / .18)); }
.vy-bowl.drag { cursor: grabbing; z-index: 60; }
.vy-bowl-in { display: block; transform-origin: 50% 55%; }
.vy-bowl.land .vy-bowl-in { transform-origin: 50% 100%; animation: vy-land .3s steps(3, jump-none); }
.vy-bowl.add svg, .vy-box.add svg { animation: vy-hop .3s steps(2, jump-none); }
/* рассыпанная еда — под миской и котиком */
.vy-spill { position: fixed; left: 0; top: 0; z-index: 39; line-height: 0; cursor: grab; touch-action: none; -webkit-tap-highlight-color: transparent; }
.vy-spill.drag { cursor: grabbing; z-index: 60; }
/* кусок еды маленький: хватать можно и рядом с ним; текст под ним не выделяется */
.vy-spill { -webkit-user-select: none; user-select: none; }
.vy-spill::before { content: ""; position: absolute; inset: -9px -7px -5px; }
/* отношения — пять пиксельных сердечек над котиком (по 20 очков, половинка — 10); пока он говорит, летит или в руке — не видно */
/* карточка Васяна при наведении (и после поглаживания пальцем): мордочка ступени отношений, полоски, настроение,
   еда, лоток. Над котиком; у края окна сдвигается (--dx); пока он говорит, летит или в руке — не видно */
.vy-card { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(calc(-50% + var(--dx, 0px))); min-width: 196px; padding: 10px 12px 11px; border-radius: 12px; background: var(--panel, #1b1d24); color: var(--ink, #f3f4f6); border: 1px solid var(--line, #2b2e38); box-shadow: 0 12px 30px -14px rgb(0 0 0 / .55); font: 600 12px/1.35 system-ui, -apple-system, sans-serif; text-align: left; white-space: nowrap; line-height: 1.35; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity .15s, visibility .15s; }
.vy-card.on { opacity: 1; visibility: visible; }
.vy-card .vc-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.vy-card .vc-top svg { display: block; flex: none; }
.vy-card .vc-top b { display: block; font-size: 14px; }
.vy-card .vc-top small { display: block; font-size: 12px; color: #E4553F; }
.vy-card .vc-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; align-items: center; }
.vy-card .vc-grid > span { color: var(--ink-2, #a3a8b5); font-weight: 500; }
.vy-card .vc-bar { display: block; height: 6px; border-radius: 4px; background: color-mix(in srgb, var(--ink, #fff) 12%, transparent); overflow: hidden; }
.vy-card .vc-bar i { display: block; height: 100%; border-radius: inherit; background: #E4553F; }
.vy-card .vc-bar.food i { background: #EAA92C; }
.vy-cat:has(> .vy-bub) .vy-card, .vy-cat.drag .vy-card { opacity: 0; visibility: hidden; }
@media (prefers-reduced-motion: reduce) { .vy-card { transition: none; } }
.vy-spill svg { display: block; }
/* лоток — за котиком; пока он в лотке, поверх него — только передняя стенка (.vy-box-front) */
.vy-box, .vy-poo { position: fixed; left: 0; top: 0; z-index: 39; padding: 0; margin: 0; border: 0; background: none; line-height: 0; -webkit-tap-highlight-color: transparent; }
.vy-box { touch-action: none; cursor: grab; filter: drop-shadow(0 3px 0 rgb(0 0 0 / .18)); }
.vy-box.drag { cursor: grabbing; z-index: 60; }
.vy-box-in { display: block; transform-origin: 50% 60%; }
.vy-box.land .vy-box-in { transform-origin: 50% 100%; animation: vy-land .3s steps(3, jump-none); }
.vy-box-front { position: fixed; left: 0; top: 0; z-index: 41; pointer-events: none; line-height: 0; }
.vy-poo { cursor: pointer; }
.vy-box svg, .vy-box-front svg, .vy-poo svg, .vy-stink svg { display: block; }
.vy-box:focus-visible, .vy-poo:focus-visible { outline: 2px solid var(--accent, #5B74FF); outline-offset: 3px; }
/* вонь над грязным лотком и кучкой мимо */
.vy-stink { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%); pointer-events: none; line-height: 0; animation: vy-stink 2.4s steps(6) infinite; }
@keyframes vy-stink { from { translate: 0 6px; opacity: 0; } 35% { opacity: .9; } to { translate: 0 -10px; opacity: 0; } }
/* наполнитель летит из лотка, пока копает */
.vy-sand { position: fixed; z-index: 42; width: 3px; height: 3px; pointer-events: none; animation: vy-crumb .55s steps(5, jump-none) forwards; }
.vy-bub.hiss, .vy-bub.ugh, .vy-bub.hmph, .vy-bub.vein { animation: vy-love 1.4s steps(7) forwards; }
.vy-bub.hiss { color: #E8483B; font-size: 17px; }
.vy-cat:focus-visible, .vy-bowl:focus-visible { outline: 2px solid var(--accent, #5B74FF); outline-offset: 3px; }
.vy-toy { position: fixed; left: 0; top: 0; z-index: 40; pointer-events: none; line-height: 0; }
.vy-toy.flip svg { transform: scaleX(-1); }
.vy-bub { position: absolute; left: 50%; bottom: calc(100% + 4px); transform: translateX(-50%); pointer-events: none; line-height: 0; }
.vy-bub.think { padding: 6px 7px; background: var(--panel, #fff); border-radius: 12px; box-shadow: 0 0 0 2px #1B1B1F; }
.vy-bub.think::after { content: ""; position: absolute; left: 30%; bottom: -10px; width: 6px; height: 6px; border-radius: 50%; background: var(--panel, #fff); box-shadow: 0 0 0 2px #1B1B1F; }
.vy-bub.txt { font: 700 15px/1 var(--font-display, system-ui), sans-serif; letter-spacing: .04em; color: var(--accent, #8C9BFF); text-shadow: 1px 1px 0 #1B1B1F; white-space: nowrap; line-height: 1; }
.vy-bub.zz { letter-spacing: .08em; animation: vy-zz 2.4s steps(6) infinite; }
@keyframes vy-zz { from { translate: 0 6px; opacity: .3; } to { translate: 8px -10px; opacity: 1; } }
.vy-bub.bang { font-size: 24px; color: #F2C230; animation: vy-pop .45s steps(3, jump-none) both; }
@keyframes vy-pop { from { scale: .4; } 60% { scale: 1.3; } }
.vy-bub.love, .vy-bub.achoo, .vy-bub.purr, .vy-bub.yum, .vy-bub.meow { animation: vy-love 1.4s steps(7) forwards; }
@keyframes vy-love { to { translate: 0 -22px; opacity: 0; } }
.vy-heart { position: absolute; bottom: 78%; margin-left: -9px; pointer-events: none; line-height: 0; animation: vy-love 1.3s steps(7) forwards; }
.vy-plus { position: fixed; z-index: 41; font: 700 14px/1 var(--font-display, system-ui), sans-serif; color: var(--good, #43C97A); text-shadow: 1px 1px 0 #1B1B1F; pointer-events: none; animation: vy-love .9s steps(5) forwards; }
@media (prefers-reduced-motion: reduce) { .vy-box.land .vy-box-in, .vy-stink, .vy-sand, .vy-bub.hiss, .vy-bub.ugh, .vy-bub.hmph, .vy-bub.vein, .vy-cat.land .vy-body, .vy-bowl.land .vy-bowl-in, .vy-cat.flipjump .vy-body, .vy-dust, .vy-crumb, .vy-bowl.nom svg, .vy-cat.hop .vy-body, .vy-bowl.add svg, .vy-box.add svg, .vy-bub.zz, .vy-bub.love, .vy-bub.bang, .vy-bub.achoo, .vy-bub.purr, .vy-bub.yum, .vy-bub.meow, .vy-heart, .vy-plus { animation: none; } .vy-cat.rolling .vy-body { transition: none; } }
@media print { .vy-cat, .vy-bowl, .vy-toy, .vy-spill, .vy-box, .vy-box-front, .vy-poo { display: none; } }
/* выбор окраса и наряда в Настройках (блок data-vasyan-skins) */
.vy-skins { display: grid; gap: 12px; margin-top: 4px; }
.vy-sk-g { display: grid; gap: 6px; }
.vy-sk-t { font-size: 12.5px; font-weight: 700; color: var(--ink-3, #8a8f9e); }
.vy-sk-row { display: flex; flex-wrap: wrap; gap: 6px; }
.vy-sk { display: grid; justify-items: center; align-content: end; gap: 4px; width: 88px; padding: 6px 4px 6px; border-radius: 12px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--ink, #f3f4f6); font: 600 11px/1.15 inherit; font-family: inherit; cursor: pointer; }
.vy-sk:hover { border-color: color-mix(in srgb, var(--accent, #5B74FF) 45%, var(--line, #2b2e38)); }
.vy-sk[aria-pressed="true"] { border-color: var(--accent, #5B74FF); box-shadow: inset 0 0 0 1px var(--accent, #5B74FF); }
.vy-sk:focus-visible { outline: 2px solid var(--accent, #5B74FF); outline-offset: 2px; }
.vy-sk-pic { height: 40px; display: flex; align-items: flex-end; justify-content: center; }
.vy-sk-n { text-align: center; overflow-wrap: break-word; hyphens: auto; }
.vy-sk.locked { cursor: default; color: var(--ink-3, #8a8f9e); border-style: dashed; }
.vy-sk.locked .vy-sk-pic { filter: grayscale(1); opacity: .5; }
.vy-lock { display: inline-block; vertical-align: -1px; margin-right: 3px; }
.vy-sk-lv { font-size: 10.5px; font-weight: 600; color: var(--ink-3, #8a8f9e); text-align: center; }
.vy-sk-shop { margin-top: 2px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line, #2b2e38); background: transparent; color: var(--accent, #5B74FF); font: 600 11px/1.1 inherit; font-family: inherit; cursor: pointer; white-space: nowrap; }
.vy-sk-shop:focus-visible { outline: 2px solid var(--accent, #5B74FF); outline-offset: 2px; }
@media (max-width: 400px) { .vy-sk { width: calc(33.33% - 4px); } }`;

  const K = innerWidth < 480 ? 2.5 : 3; // размер «пикселя» котика
  let st = read();
  const now0 = Date.now();
  // голод копится и пока сайт закрыт: 1 пункт за 12 секунд, но не больше чем до «очень голоден»
  st.hunger = Math.min(100, (+st.hunger || 0) + (st.at ? Math.max(0, now0 - st.at) / 12000 : 0));
  // bowl — сколько порций в миске (0–3), food — какая еда (id). Раньше порции лежали в food числом — переносим
  st.bowl = Math.max(0, Math.min(3, st.bowl != null ? +st.bowl || 0 : typeof st.food === 'number' ? st.food : 2));
  st.food = foodOf(typeof st.food === 'string' ? st.food : 'kibble').id;
  // рассыпанное (миска упала вверх дном): кучки [{ n — порций, food, seed — как лежат зёрна }]
  const newSeed = () => 1 + Math.floor(Math.random() * 2e9);
  // каждый кусок еды — отдельная кучка (n: 1): её тащат, бросают и съедают отдельно. Кучки прежних версий с n 2–3
  // разбираются на куски (зерно следующего — от первого, одинаково во всех вкладках). Не больше MAX_PILES
  const MAX_PILES = 8;
  const normSpill = (list) => (Array.isArray(list) ? list : list ? [list] : []).filter((q) => q && +q.n > 0)
    .flatMap((q) => { const n = Math.min(3, Math.max(1, Math.round(+q.n))), seed = (+q.seed >>> 0) || newSeed(), food = foodOf(q.food).id;
      return Array.from({ length: n }, (_, i) => ({ n: 1, food, seed: i ? ((seed + i * 7919) >>> 0) || newSeed() : seed })); })
    .slice(-MAX_PILES);
  // кучки мимо лотка: x — где лежит, id — чтобы вкладки узнавали одну и ту же кучку
  const normPoos = (list) => (Array.isArray(list) ? list : []).filter((q) => q && Number.isFinite(+q.x)).slice(-3).map((q) => ({ x: +q.x, id: (+q.id >>> 0) || newSeed() }));
  st.spill = normSpill(st.spill);
  // зерно порции в миске: насыпали — новое, и корм лежит по-другому
  st.seed = (+st.seed >>> 0) || newSeed();
  // лоток: где стоит на полу (x; null — справа), сколько в нём кучек (n). Кучки рядом с лотком на полу (сделал мимо,
  // потому что лоток был грязный) — poos [{ x }]. pooAt — когда захочет в лоток (после еды)
  st.box = { x: st.box && Number.isFinite(+st.box.x) && st.box.x !== null ? +st.box.x : null, n: Math.max(0, Math.min(4, Math.round(+(st.box && st.box.n) || 0))) };
  st.poos = normPoos(st.poos);
  st.pooAt = +st.pooAt || 0;
  // злость 0–100 (много кликов, бросили, грязный лоток): проходит сама, пока сайт закрыт — тоже (1 пункт за 5 секунд)
  st.anger = Math.max(0, Math.min(100, (+st.anger || 0) - (st.at ? Math.max(0, now0 - st.at) / 5000 : 0)));
  st.at = now0;
  // отношения 0–100 (BOND ниже): у нового котика — «Привыкает», у того, кого уже много гладили, — повыше
  st.bond = Number.isFinite(+st.bond) ? Math.max(0, Math.min(100, +st.bond)) : (+st.pets || 0) > 30 ? 45 : 25;
  coat = coatOf(st.skin); outfit = outfitOf(st.outfit); bowlSkin = bowlOf(st.bowlSkin); boxSkin = boxSkinOf(st.boxSkin);
  // эти поля пишутся всегда: по ним другая вкладка отличает запись этой версии от записи старой (там их нет совсем)
  st.bowlSkin = bowlSkin.id; st.boxSkin = boxSkin.id; st.flip = !!st.flip;
  // рассыпанное и кучки мимо лотка пишет только та вкладка, которая их меняла (dirty): остальные оставляют в записи то,
  // что там лежит, — вкладка, пропустившая чужую запись (спала, закрывается), не сотрёт корм и кучки своей старой копией
  const dirty = { spill: false, poos: false };
  const save = () => {
    st.at = Date.now();
    const out = { ...st };
    if (!dirty.spill || !dirty.poos) {
      const cur = read();
      if (!dirty.spill && Array.isArray(cur.spill)) out.spill = cur.spill;
      if (!dirty.poos && Array.isArray(cur.poos)) out.poos = cur.poos;
    }
    dirty.spill = dirty.poos = false;
    write(out);
  };

  let cat, body, bubble, bowl, bowlIn, box, boxIn, boxFront, card = null, cardOn = false, cardT = 0, cardAt = 0, cardLast = '', lastPtr = '', alive = false, raf = 0;
  // положение: x — левый край, y — линия лап (в координатах окна). surf — блок, на котором стоит (null — пол)
  let x = 120, y = 0, vy = 0, dir = 1, mode = 'sit', until = 0, target = 0, frame = 0, lastFrame = 0, saveT = 0, floor = 0, lastT = 0;
  let surf = null, jump = null, after = null, prep = null, climb = null, thudT = 0, size = { w: 57, h: 39 };
  let mouse = { x: -1, y: -1, t: 0 }, chaseT = 0, measureT = 0;
  let press = null, dragged = false, shown = null, turnUntil = 0, faced = 1;
  let wagFrom = 0, wagUntil = 0, roll = null, toy = null, play = '', playT = 0, sneezeAt = 0, runMood = '', lastAct = '';
  // оглядывается, кружится (за хвостом и перед сном), жуёт: когда началось, что потом, на каком «укусе» сыпались крошки
  let lookT0 = 0, spinT0 = 0, spinThen = '', biteN = -1;
  // бросили (летит с размаху), уронили сами (откуда — fallY0), когда в последний раз показывал венку, когда копал
  let vx = 0, thrown = false, dropped = false, fallY0 = 0, veinT = 0, sandT = 0;
  const clicks = [];

  function mount() {
    if (alive || NO_PET) return;
    alive = true;
    if (!css.isConnected) document.head.appendChild(css);
    bowl = document.createElement('button');
    bowl.type = 'button'; bowl.className = 'vy-bowl';
    bowl.dataset.noPress = ''; // без «проседания» из fx.js: его scale сжимает и наш transform-сдвиг
    bowl.innerHTML = '<span class="vy-bowl-in"></span>';
    bowlIn = bowl.firstChild;
    bowl.addEventListener('pointerdown', (e) => tdown(e, bw));
    // клик — насыпать корм (перевёрнутую — поставить); после перетаскивания клик не считается
    bowl.addEventListener('click', (e) => { e.preventDefault(); if (bw.dragged) { bw.dragged = false; return; } bowlClick(); });
    // лоток: клик — убрать, перетащить — как миску. Передняя стенка — отдельно, поверх котика, пока он в лотке
    box = document.createElement('button');
    box.type = 'button'; box.className = 'vy-box';
    box.dataset.noPress = '';
    box.innerHTML = '<span class="vy-box-in"></span>';
    boxIn = box.firstChild;
    box.addEventListener('pointerdown', (e) => tdown(e, lt));
    box.addEventListener('click', (e) => { e.preventDefault(); if (lt.dragged) { lt.dragged = false; return; } cleanBox(); });
    boxFront = document.createElement('span');
    boxFront.className = 'vy-box-front';
    boxFront.setAttribute('aria-hidden', 'true');
    boxFront.hidden = true;
    cat = document.createElement('button');
    cat.type = 'button'; cat.className = 'vy-cat';
    // fx.js при нажатии уменьшает кнопку (scale: .94), а scale применяется поверх transform: translate —
    // весь сдвиг сжимался к левому верхнему углу, и схваченный Васян висел далеко от курсора
    cat.dataset.noPress = '';
    cat.setAttribute('aria-label', 'Котик Васян: нажми, чтобы погладить, или перетащи');
    cat.innerHTML = '<span class="vy-body"></span>';
    body = cat.firstChild;
    // карточка: мышью — при наведении, с клавиатуры — в фокусе, пальцем — на пару секунд после поглаживания
    card = document.createElement('span');
    card.className = 'vy-card';
    card.id = 'vyCard';
    card.setAttribute('role', 'tooltip');
    cat.appendChild(card);
    cat.setAttribute('aria-describedby', 'vyCard');
    cat.addEventListener('pointerdown', (e) => { lastPtr = e.pointerType; });
    cat.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') cardShow(); });
    cat.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') cardHide(); });
    cat.addEventListener('focus', () => cardShow());
    cat.addEventListener('blur', () => cardHide());
    cat.addEventListener('pointerdown', down);
    cat.addEventListener('click', (e) => { e.preventDefault(); if (dragged) { dragged = false; return; } pet(); if (lastPtr === 'touch' || lastPtr === 'pen') cardShow(2500); });
    // любит — встречает сердечком, когда открываешь страницу
    if (bondLv() >= 3) setTimeout(() => { if (alive && cat && !BUSY.includes(mode) && !grumpy()) { hearts(2); say('love'); } }, 1500);
    document.body.append(box, bowl, cat, boxFront);
    measure();
    x = Math.min(innerWidth - 80, 90 + Math.random() * Math.max(40, innerWidth / 3));
    y = floorAt(x + 28); surf = null; shown = null; goal = null; wantEat = false; vx = 0; thrown = dropped = false;
    placeBowl(); placeBox(); decide();
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function unmount() {
    alive = false; cancelAnimationFrame(raf);
    stopPlay(); tup(); up(); clearTimeout(bowlT);
    [cat, bowl, box, boxFront].forEach((el) => { if (el) el.remove(); });
    // в st.spill и st.poos остаётся: включат снова — рассыпанное у миски, кучки у лотка
    sps.forEach((q) => q.el.remove()); sps = [];
    poos.forEach((q) => q.el.remove()); poos = [];
    cat = bowl = bowlIn = box = boxIn = boxFront = bubble = bowlSpr = boxSpr = card = null; cardOn = false; clearTimeout(cardT); roll = null; goal = null;
  }

  // ---------- пол и блоки ----------
  // пол — над закреплёнными внизу панелями (полоса «Сохранить» в Мнении, кнопка «?», нижние меню).
  // Свой для каждой полосы шириной 30 px: панель может занимать только часть ширины (полоса «Сохранить» —
  // средняя колонка), и рядом с ней пол остаётся у самого низа экрана — там стоит и миска
  const COL = 30;
  let cols = [];
  function measure() {
    let top = innerHeight;
    cols = [];
    for (let px = COL / 2; px < innerWidth; px += COL) {
      let t = innerHeight;
      for (const el of document.elementsFromPoint(px, innerHeight - 12)) {
        if (mine(el) || el === document.body || el === document.documentElement) continue;
        let n = el, found = false;
        while (n && n !== document.body) {
          const p = getComputedStyle(n).position;
          if (p === 'fixed' || p === 'sticky') { const r = n.getBoundingClientRect(); if (r.height < innerHeight * 0.5) t = Math.min(t, r.top); found = true; break; }
          n = n.parentElement;
        }
        if (found) break;
      }
      cols.push(t);
      top = Math.min(top, t);
    }
    floor = Math.max(0, innerHeight - top);
  }
  // линия пола под точкой x (в координатах окна)
  const floorAt = (px) => (cols.length ? cols[Math.max(0, Math.min(cols.length - 1, Math.floor(px / COL)))] : innerHeight) - 2;
  const mine = (el) => !!el && (el === cat || el === bowl || (cat && cat.contains(el)) || (bowl && bowl.contains(el)) || (toy && toy.el === el) || sps.some((q) => q.el === el) || (box && (el === box || box.contains(el))) || el === boxFront || poos.some((q) => q.el === el || q.el.contains(el)));
  const floorY = () => innerHeight - floor - 2;
  // выше, чем на REACH, за один прыжок не запрыгивает (прокрутка вверх, путь к миске) — идёт по плиткам
  const REACH = 320;
  // блоки, по верху которых можно ходить: крупные карточки, верхний край виден и ничем не закрыт.
  // Баннер профиля — «место в профиле»: котик садится не на верх баннера, а на его нижний край, рядом с аватаркой
  // (правее котика из профиля, если он есть) — туда он приходит, когда страницу домотали до самого верха
  const PLAT = '.card, .app, .lv-box, .panel, .feed-list > li, .tl-tile, .recs, .feed, section, .banner';
  const isSeat = (s) => !!(s && s.classList && s.classList.contains('banner'));
  // линия, на которой котик стоит: верх блока, у баннера — низ
  const edgeOf = (s, r = s.getBoundingClientRect()) => (isSeat(s) ? r.bottom : r.top);
  function seatLeft(r) {
    let left = r.left + 2;
    for (const el of document.querySelectorAll('#avaWrap, #avaWrap > .lv-pet')) { const q = el.getBoundingClientRect(); if (q.width && q.bottom > r.bottom - 160) left = Math.max(left, q.right + 12); }
    return left;
  }
  // можно ли встать на блок el: { el, r, top, seat } или null
  function platOf(el, fy = floorY()) {
    if (mine(el)) return null;
    const r = el.getBoundingClientRect(), seat = isSeat(el), top = seat ? r.bottom : r.top;
    if (r.width < 150 || r.height < 50 || top < (seat ? 110 : 80) || top > fy - 60 || r.left < 0 || r.right > innerWidth) return null;
    if (seat && r.right - seatLeft(r) < size.w + 20) return null; // рядом с аватаркой нет места
    const hit = document.elementFromPoint(r.left + r.width / 2, seat ? top - 3 : top + 3);
    return hit && (el === hit || el.contains(hit)) ? { el, r, top, seat } : null;
  }
  // все такие блоки; у вложенных с общим верхним краем остаётся внешний (первый по порядку)
  // плитки ищутся по всей странице — дорого: падает несколько вещей сразу (прокрутка уронила куски еды) — каждая
  // спрашивала заново, и сайт подлагивал. Ответ живёт 32 мс (два кадра)
  let platC = null, platAt = -1e9;
  function platforms() {
    const now = performance.now();
    if (platC && now - platAt < 32) return platC;
    platAt = now;
    platC = platScan();
    return platC;
  }
  function platScan() {
    const fy = floorY(), out = [];
    for (const el of document.querySelectorAll(PLAT)) {
      const p = platOf(el, fy);
      if (!p || out.some((q) => Math.abs(q.top - p.top) < 6 && Math.abs(q.r.left - p.r.left) < 6)) continue;
      out.push(p);
      if (out.length > 40) break;
    }
    return out;
  }
  const surfTop = (s, px = x) => (s ? edgeOf(s) : floorAt(px + size.w / 2));
  function bounds(s) {
    if (!s) return [6, innerWidth - size.w - 6];
    const r = s.getBoundingClientRect(), a = isSeat(s) ? seatLeft(r) : r.left + 2;
    return [a, Math.max(a, r.right - size.w - 2)];
  }
  const surfaceOk = (s) => {
    if (!s) return true;
    if (!s.isConnected) return false;
    const r = s.getBoundingClientRect(), top = edgeOf(s, r);
    return r.width >= 100 && top > 60 && top < floorY() - 30;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- миска: где стоит, как падает, рассыпанное ----------
  // x — левый край, y — линия, на которой стоит (как у котика); s — блок под ней (null — пол), ox — сдвиг от левого края
  // блока: блок уезжает при прокрутке — миска едет с ним. mode: rest — стоит, slide — едет по блоку (толкнули),
  // fall — падает, drag — в руке. rot — поворот в полёте (градусы), av — скорость вращения, tilt — наклон в руке;
  // flip — лежит вверх дном; by — отчего упала: drop (отпустили), scroll (уехал блок), push (столкнул Васян)
  const bw = { x: 10, y: 0, s: null, ox: 0, vx: 0, vy: 0, rot: 0, av: 0, tilt: 0, mode: 'rest', flip: false, by: '', w: 18 * K, h: 9 * K, dragged: false };
  // лоток — такая же вещь, только не кувыркается и его не толкают (mode: rest | fall | drag)
  const lt = { x: 0, y: 0, s: null, ox: 0, vx: 0, vy: 0, tilt: 0, mode: 'rest', by: '', w: 24 * K, h: 7 * K, dragged: false };
  // рассыпанная еда — кучки там, где миска упала вверх дном (не больше трёх, самая старая пропадает):
  // [{ n, food, seed, el, x, y, s, ox, w, h, mode: rest | fall, vy }]; poos — кучки мимо лотка (до трёх), те же поля
  let sps = [], poos = [], bowlSpr = null, boxSpr = null, bowlT = 0, tpress = null;
  // вещь o (миска или рассыпанное) — на блок s (или на пол) в точку px; на карточке хоть 60 % вещи — на ней
  function setOn(o, s, px) {
    o.s = s;
    if (s) {
      const r = s.getBoundingClientRect(), lo = isSeat(s) ? seatLeft(r) : r.left;
      px = clamp(px, lo - o.w * 0.3, Math.max(lo - o.w * 0.3, r.right - o.w * 0.7));
      o.ox = px - r.left;
    } else px = clamp(px, 4, Math.max(4, innerWidth - o.w - 4));
    o.x = px;
    onSurf(o);
  }
  // стоит — держится своего блока: x и y заново от его места
  function onSurf(o) {
    if (o.s) { const r = o.s.getBoundingClientRect(); o.x = r.left + o.ox; o.y = edgeOf(o.s, r); }
    else o.y = floorAt(o.x + o.w / 2);
  }
  // куда упала вещь, пролетев от prev до o.y: блок, через верх которого пролетела, пол (null) или ещё летит (undefined)
  function hitBelow(o, prev) {
    const cx = o.x + o.w / 2;
    const p = platforms().find((q) => cx >= (q.seat ? seatLeft(q.r) : q.r.left) && cx <= q.r.right && q.top >= prev - 2 && q.top <= o.y);
    if (p) return p.el;
    return o.y >= floorAt(cx) ? null : undefined;
  }
  function drawBowl() {
    if (!bowl) return;
    const s = sprite(bw.flip ? flipRows() : bowlRows(st.bowl, foodOf(st.food)), K);
    if (s !== bowlSpr) { bowlIn.innerHTML = s.svg; bowlSpr = s; bw.w = s.cw; bw.h = s.ch; }
    bowl.setAttribute('aria-label', bw.flip ? 'Миска Васяна вверх дном: нажми, чтобы поставить' : 'Миска Васяна: нажми, чтобы насыпать корм, или перетащи');
  }
  function paintBowl() {
    if (!bowl) return;
    // в полёте крутится шагами по 45°, как пиксельный спрайт; в руке — наклон по ходу
    const deg = bw.mode === 'fall' ? Math.round(bw.rot / 45) * 45 : bw.mode === 'drag' ? bw.tilt : 0;
    bowl.style.transform = `translate(${Math.round(bw.x)}px, ${Math.round(bw.y - bw.h)}px)`;
    bowlIn.style.transform = deg ? `rotate(${deg}deg)` : '';
  }
  // на место из прошлого захода: на полу, где оставили (bx), вверх дном — если так и лежала; рядом — рассыпанное
  function placeBowl() {
    Object.assign(bw, { mode: 'rest', flip: !!st.flip, vx: 0, vy: 0, rot: 0, av: 0, tilt: 0 });
    bowlSpr = null; drawBowl();
    setOn(bw, null, Number.isFinite(+st.bx) ? +st.bx : 10);
    // рассыпанное из прошлого захода — кусками у миски, рядком
    sps.forEach((q) => q.el.remove()); sps = [];
    st.spill.forEach((q, k) => makeSpill(1, q.food, q.seed, k));
    paintBowl();
  }
  function hopBowl() { if (!bowl) return; bowl.classList.remove('add'); void bowl.offsetWidth; bowl.classList.add('add'); }
  // приземлилась: присела от удара, пыль из-под края
  function bowlThud() {
    if (!bowl || calm) return;
    bowl.classList.remove('land'); void bowl.offsetWidth; bowl.classList.add('land');
    setTimeout(() => { if (bowl) bowl.classList.remove('land'); }, 320);
    dust(bw.x + bw.w / 2, bw.y, bw.w * 0.4);
  }
  // начала падать: why — отчего; vx, vy — с какой скоростью бросили, av — как крутится (градусов в секунду)
  function bowlFall(why, vx = 0, av = 0, vy = 0) {
    Object.assign(bw, { mode: 'fall', s: null, vx, vy, av: calm ? 0 : av, rot: 0, by: why });
    if (calm) {
      // «меньше движения»: без полёта — сразу туда, куда упала бы
      bowlLand(below(bw));
    }
  }
  function bowlLand(s) {
    // как легла: по повороту в полёте (и тому, как лежала до него) — дном вниз или вверх
    const turn = ((((bw.flip ? 180 : 0) + bw.rot) % 360) + 540) % 360 - 180;
    const flipNow = Math.abs(turn) > 90, was = bw.flip, why = bw.by;
    Object.assign(bw, { mode: 'rest', vx: 0, vy: 0, av: 0, rot: 0, tilt: 0, flip: flipNow });
    drawBowl(); // вверх дном — другая картинка (и высота): сначала она, потом место
    setOn(bw, s, bw.x);
    let spilt = false;
    if (flipNow && !was && st.bowl > 0) { spillOut(); spilt = true; }
    st.flip = bw.flip;
    if (!bw.s) st.bx = Math.round(bw.x);
    save();
    bowlThud();
    afterBowl(why, spilt);
  }
  // упала вверх дном — то, что было в миске, рассыпалось рядом
  function spillOut() {
    const n = st.bowl;
    st.bowl = 0;
    for (let i = 0; i < n; i++) makeSpill(1, st.food, undefined, i); // каждая порция — свой кусок, рядком
    save();
  }
  // кусок еды — рядом с миской, со стороны, где на блоке больше места; k — какой по счёту (кладутся рядком дальше от
  // миски); seed — как лёг
  function makeSpill(n, food, seed = newSeed(), k = 0) {
    const q = { n, food, seed, x: 0, y: 0, s: null, ox: 0, w: 0, h: 0, mode: 'rest', vy: 0, el: document.createElement('span') };
    q.el.className = 'vy-spill';
    q.el.setAttribute('aria-hidden', 'true');
    q.el.dataset.noPress = '';
    // кучку можно утащить и бросить, как миску: где встанет — туда Васян и пойдёт доедать (pileLand)
    // preventDefault: иначе нажатие на кусок начинало выделять текст страницы под ним, и кусок не тащился
    q.el.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); tdown(e, q); });
    document.body.insertBefore(q.el, bowl && bowl.parentNode === document.body ? bowl : null);
    sps.push(q);
    if (sps.length > MAX_PILES) sps.shift().el.remove();
    drawSpill(q);
    const r = bw.s ? bw.s.getBoundingClientRect() : null, lo = r ? r.left : 0, hi = r ? r.right : innerWidth;
    const step = (q.w + K) * k, left = bw.x - lo > hi - (bw.x + bw.w);
    setOn(q, bw.s, clamp(left ? bw.x - q.w + 2 * K - step : bw.x + bw.w - 2 * K + step, lo + 2, hi - q.w - 2));
    paintPile(q);
    keepSpills();
  }
  const keepSpills = () => { st.spill = sps.map((q) => ({ n: q.n, food: q.food, seed: q.seed })); dirty.spill = true; };
  // куда вещь встанет, если упадёт отсюда: ближний блок под ней или пол (null) — для «меньше движения», без полёта
  function below(o) {
    const cx = o.x + o.w / 2;
    const p = platforms().filter((q) => cx >= (q.seat ? seatLeft(q.r) : q.r.left) && cx <= q.r.right && q.top >= o.y - 2).sort((a, b) => a.top - b.top)[0];
    return p ? p.el : null;
  }
  function drawSpill(q) { const s = sprite(spillRows(q.n, foodOf(q.food), q.seed), K); q.el.innerHTML = s.svg; q.w = s.cw; q.h = s.ch; }
  // место не поменялось — стиль не трогаем: куски лежат, а кадры идут
  function paintPile(q) { const tf = `translate(${Math.round(q.x)}px, ${Math.round(q.y - q.h)}px)`; if (q.tf !== tf) { q.tf = tf; q.el.style.transform = tf; } }
  function dropSpill(q) { q.el.remove(); sps = sps.filter((v) => v !== q); keepSpills(); }
  // кучку корма отпустили или бросили: летит и падает на блок или пол («меньше движения» — сразу туда)
  function pileFall(q, vx = 0, vy = 0) {
    Object.assign(q, { mode: 'fall', s: null, vx, vy });
    if (calm) { q.mode = 'rest'; q.vx = q.vy = 0; setOn(q, below(q), q.x); pileLand(q); }
  }
  // кучка корма встала на новое место (перенесли, бросили, уехала при прокрутке) — Васян идёт её собирать
  function pileLand() { keepSpills(); afterBowl('drop'); }
  // кучка (рассыпанное, кучка мимо лотка): держится своего блока, блок уехал — падает; в руке — за пальцем (tmove)
  function stepPile(q, dt) {
    if (q.mode === 'drag') { paintPile(q); return; }
    if (q.mode === 'fall') {
      const prev = q.y;
      q.vy = Math.min(1700, q.vy + 2200 * dt); q.y += q.vy * dt;
      if (q.vx) {
        q.x += q.vx * dt; q.vx *= Math.max(0, 1 - 1.5 * dt);
        if (q.x < 4) { q.x = 4; q.vx = Math.abs(q.vx) * 0.4; } else if (q.x > innerWidth - q.w - 4) { q.x = innerWidth - q.w - 4; q.vx = -Math.abs(q.vx) * 0.4; }
      }
      const hit = q.vy > 0 ? hitBelow(q, prev) : undefined;
      if (hit !== undefined) { q.mode = 'rest'; q.vy = 0; q.vx = 0; setOn(q, hit, q.x); if (sps.includes(q)) pileLand(q); }
    } else if (q.s && !surfaceOk(q.s)) {
      // «меньше движения»: без полёта — сразу туда, куда упала бы (как миска)
      if (calm) setOn(q, below(q), q.x); else { q.mode = 'fall'; q.s = null; q.vy = 0; }
    } else onSurf(q);
    paintPile(q);
  }
  // миска, лоток и кучки — каждый кадр: полёт, скольжение, держатся своего блока (уехал при прокрутке — падают)
  function stepThings(dt) {
    if (!bowl || !box) return;
    if (bw.mode === 'fall') {
      const prev = bw.y;
      bw.vy = Math.min(1700, bw.vy + 2200 * dt); bw.y += bw.vy * dt; bw.x += bw.vx * dt; bw.rot += bw.av * dt;
      if (bw.x < 4) { bw.x = 4; bw.vx = Math.abs(bw.vx) * 0.4; } else if (bw.x > innerWidth - bw.w - 4) { bw.x = innerWidth - bw.w - 4; bw.vx = -Math.abs(bw.vx) * 0.4; }
      if (bw.vy > 0) { const hit = hitBelow(bw, prev); if (hit !== undefined) bowlLand(hit); }
    } else if (bw.mode !== 'drag') {
      // карточку прокрутили: падает, бывает — кувырком
      if (bw.s && !surfaceOk(bw.s)) bowlFall('scroll', 0, Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 360) : 0);
      else { if (bw.mode === 'slide') slideBowl(dt); if (bw.mode !== 'fall') onSurf(bw); }
    }
    paintBowl();
    if (lt.mode === 'fall') {
      const prev = lt.y;
      lt.vy = Math.min(1700, lt.vy + 2200 * dt); lt.y += lt.vy * dt; lt.x += lt.vx * dt;
      if (lt.x < 4) { lt.x = 4; lt.vx = Math.abs(lt.vx) * 0.4; } else if (lt.x > innerWidth - lt.w - 4) { lt.x = innerWidth - lt.w - 4; lt.vx = -Math.abs(lt.vx) * 0.4; }
      if (lt.vy > 0) { const hit = hitBelow(lt, prev); if (hit !== undefined) boxLand(hit); }
    } else if (lt.mode !== 'drag') {
      if (lt.s && !surfaceOk(lt.s)) boxFall('scroll'); else onSurf(lt);
    }
    paintBox();
    for (const q of sps) stepPile(q, dt);
    for (const q of poos) stepPile(q, dt);
  }
  // толкнули: едет по блоку и тормозит; съехала за край карточки — падает, кувыркаясь в ту же сторону
  function slideBowl(dt) {
    const d = bw.vx * dt;
    bw.vx *= Math.max(0, 1 - 2.4 * dt);
    if (bw.s) {
      bw.ox += d;
      const r = bw.s.getBoundingClientRect(), c = r.left + bw.ox + bw.w / 2;
      if (c < (isSeat(bw.s) ? seatLeft(r) : r.left) || c > r.right) {
        bw.x = r.left + bw.ox;
        bowlFall('push', bw.vx, Math.sign(bw.vx) * (260 + Math.random() * 380));
        return;
      }
    } else {
      bw.x += d;
      if (bw.x < 4) { bw.x = 4; bw.vx = Math.abs(bw.vx) * 0.4; } else if (bw.x > innerWidth - bw.w - 4) { bw.x = innerWidth - bw.w - 4; bw.vx = -Math.abs(bw.vx) * 0.4; }
    }
    if (Math.abs(bw.vx) < 10) { bw.vx = 0; bw.mode = 'rest'; if (!bw.s) { st.bx = Math.round(bw.x); save(); } }
  }

  // ---------- миску, лоток и кучки корма можно утащить мышкой или пальцем ----------
  // o — bw (миска), lt (лоток) или кучка корма из sps; o.dragged — тащили, и клик после этого — не клик
  const elOf = (o) => (o === bw ? bowl : o === lt ? box : o && o.el && o.el.isConnected ? o.el : null);
  function tdown(e, o) {
    if (e.button > 0 || o.mode === 'fall' || tpress) return;
    tpress = { o, x: e.clientX, y: e.clientY, id: e.pointerId, pts: [[performance.now(), e.clientX, e.clientY]] };
    o.dragged = false;
    addEventListener('pointermove', tmove); addEventListener('pointerup', tup); addEventListener('pointercancel', tup);
  }
  function tmove(e) {
    const p = tpress;
    if (!p || e.pointerId !== p.id || !elOf(p.o)) return;
    // кнопку отпустили где-то, где pointerup не дошёл, — отпустить и здесь
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { tup(e); return; }
    const o = p.o;
    if (!o.dragged && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    const t = performance.now(), pts = p.pts;
    if (!o.dragged) { o.dragged = true; Object.assign(o, { mode: 'drag', s: null, vx: 0, vy: 0 }); elOf(o).classList.add('drag'); }
    pts.push([t, e.clientX, e.clientY]);
    while (pts.length > 2 && t - pts[0][0] > 100) pts.shift();
    // в руке покачивается по ходу — шагами по 15°
    const v = t > pts[0][0] ? (e.clientX - pts[0][1]) / ((t - pts[0][0]) / 1000) : 0;
    o.tilt = calm ? 0 : clamp(Math.round(v / 500) * 15, -30, 30);
    o.x = e.clientX - o.w / 2; o.y = e.clientY + o.h / 2;
  }
  function tup(e) {
    if (e && tpress && e.pointerId !== tpress.id) return;
    removeEventListener('pointermove', tmove); removeEventListener('pointerup', tup); removeEventListener('pointercancel', tup);
    const p = tpress;
    tpress = null;
    if (!p || !p.o.dragged || !elOf(p.o)) return;
    const o = p.o;
    elOf(o).classList.remove('drag');
    // отпустили — падает; брошенная (скорость за последние ~0,1 с) летит, миска ещё и кувыркается. Подержал на месте
    // и отпустил — просто падает, без броска
    const a = p.pts[0], b = p.pts[p.pts.length - 1], dt = b[0] > a[0] && performance.now() - b[0] < 80 ? (b[0] - a[0]) / 1000 : 0;
    const tvx = dt ? clamp((b[1] - a[1]) / dt, -1500, 1500) : 0, tvy = dt ? clamp((b[2] - a[2]) / dt, -1200, 1500) : 0;
    o.tilt = 0;
    if (o === bw) bowlFall('drop', tvx * 0.8, clamp(tvx * 0.6, -720, 720), tvy * 0.8);
    else if (o === lt) boxFall('drop', tvx * 0.5, tvy * 0.6);
    else pileFall(o, tvx * 0.5, tvy * 0.6);
  }
  // клик: перевёрнутую — поставить обратно (пустой: всё рассыпалось), иначе — насыпать
  function bowlClick() {
    if (bw.mode !== 'rest' && bw.mode !== 'slide') return;
    if (bw.flip) { bw.flip = false; st.flip = false; save(); drawBowl(); hopBowl(); return; }
    feed();
  }

  // ---------- лоток: рисунок, место, падение, уборка; кучки мимо лотка ----------
  function drawBox() {
    if (!box) return;
    const s = sprite(boxRows(st.box.n, boxSkin), K);
    if (s !== boxSpr) { boxIn.innerHTML = s.svg; boxSpr = s; lt.w = s.cw; lt.h = s.ch; boxFront.innerHTML = sprite(boxFrontRows(boxSkin), K).svg; }
    // грязный — над ним вонь
    const dirty = st.box.n >= BOX_FULL;
    let sk = box.querySelector('.vy-stink');
    if (dirty && !sk) { sk = document.createElement('span'); sk.className = 'vy-stink'; sk.innerHTML = sprite(STINK, K * 0.8, false).svg; box.appendChild(sk); }
    else if (!dirty && sk) sk.remove();
    box.setAttribute('aria-label', st.box.n ? 'Лоток Васяна: нажми, чтобы убрать, или перетащи' : 'Лоток Васяна: чистый, его можно перетащить');
  }
  function paintBox() {
    if (!box) return;
    const tr = `translate(${Math.round(lt.x)}px, ${Math.round(lt.y - lt.h)}px)`;
    box.style.transform = tr;
    boxIn.style.transform = lt.mode === 'drag' && lt.tilt ? `rotate(${lt.tilt}deg)` : '';
    // передняя стенка — поверх котика, пока он в лотке
    const inBox = mode === 'litter' && lt.mode === 'rest';
    if (boxFront.hidden === inBox) boxFront.hidden = !inBox;
    if (inBox) boxFront.style.transform = tr;
  }
  // на место из прошлого захода: на полу, где оставили (ещё не двигали — справа); кучки мимо — тоже на полу
  function placeBox() {
    Object.assign(lt, { mode: 'rest', vx: 0, vy: 0, tilt: 0 });
    boxSpr = null; drawBox();
    setOn(lt, null, st.box.x != null ? st.box.x : innerWidth * 0.72);
    poos.forEach((q) => q.el.remove()); poos = [];
    st.poos.forEach((p) => makePoo(null, p.x, p.id));
    paintBox();
  }
  function hopBox() { if (!box) return; box.classList.remove('add'); void box.offsetWidth; box.classList.add('add'); }
  function boxFall(why, fvx = 0, fvy = 0) {
    Object.assign(lt, { mode: 'fall', s: null, vx: fvx, vy: fvy, by: why });
    if (calm) boxLand(below(lt));
  }
  function boxLand(s) {
    Object.assign(lt, { mode: 'rest', vx: 0, vy: 0, tilt: 0 });
    setOn(lt, s, lt.x);
    if (!lt.s) { st.box.x = Math.round(lt.x); save(); }
    if (!box || calm) return;
    box.classList.remove('land'); void box.offsetWidth; box.classList.add('land');
    setTimeout(() => { if (box) box.classList.remove('land'); }, 320);
    dust(lt.x + lt.w / 2, lt.y, lt.w * 0.4);
  }
  // надпись над вещью и вверх: «+1» у миски, «чисто!» у лотка
  function floatText(el, text) {
    const r = el.getBoundingClientRect(), p = document.createElement('span');
    p.className = 'vy-plus'; p.textContent = text;
    p.style.left = Math.round(r.left + r.width / 2 - 12) + 'px'; p.style.top = Math.round(r.top - 18) + 'px';
    document.body.appendChild(p); setTimeout(() => p.remove(), 1000);
  }
  // убрать лоток (и кучки мимо него): чисто — Васян добреет, а рядом — ещё и радуется
  function cleanBox() {
    if (lt.mode !== 'rest') return;
    if (!st.box.n && !poos.length) { hopBox(); return; }
    st.box.n = 0;
    poos.forEach((q) => q.el.remove()); poos = []; keepPoos();
    soothe(12); bond(3, 'clean', 20000); save(); drawBox(); hopBox();
    floatText(box, 'чисто!');
    if (alive && !grumpy() && !BUSY.includes(mode) && Math.abs(lt.x + lt.w / 2 - (x + size.w / 2)) < 420) hearts(2);
  }
  // кучка мимо лотка (лоток был грязный): на блоке s (или полу) в точке px; клик — убрать
  function makePoo(s, px, id = newSeed()) {
    const q = { id, x: 0, y: 0, s: null, ox: 0, w: 0, h: 0, mode: 'rest', vy: 0, el: document.createElement('button') };
    q.el.type = 'button'; q.el.className = 'vy-poo'; q.el.dataset.noPress = '';
    q.el.setAttribute('aria-label', 'Убрать за Васяном');
    const sp = sprite(pooRows(), K);
    q.el.innerHTML = sp.svg + `<span class="vy-stink">${sprite(STINK, K * 0.6, false).svg}</span>`;
    q.w = sp.cw; q.h = sp.ch;
    q.el.addEventListener('click', (e) => { e.preventDefault(); floatText(q.el, 'чисто!'); q.el.remove(); poos = poos.filter((v) => v !== q); keepPoos(); soothe(4); save(); });
    document.body.insertBefore(q.el, box && box.parentNode === document.body ? box : null);
    poos.push(q);
    if (poos.length > 3) poos.shift().el.remove();
    setOn(q, s, px);
    paintPile(q);
  }
  const keepPoos = () => { st.poos = poos.map((q) => ({ x: Math.round(q.x), id: q.id })); dirty.poos = true; };

  // ---------- корм и ласка ----------
  function feed() {
    // полная — насыпали через край: порция просыпается рядом кучкой (её можно унести куда угодно, Васян найдёт)
    if (st.bowl >= 3) {
      if (bw.mode !== 'rest' || sps.length >= MAX_PILES) { say('love'); return; }
      makeSpill(1, st.food, undefined, sps.filter((q) => q.s === bw.s && q.mode === 'rest').length); save(); hopBowl();
      afterBowl('drop');
      return;
    }
    st.bowl += 1; st.seed = newSeed(); save(); drawBowl(); // насыпали — корм лёг по-новому
    hopBowl();
    floatText(bowl, '+1');
    if (st.hunger > 60 && !['eat', 'goEat', 'drag', 'fall', 'jump', 'climb', 'prep', 'push'].includes(mode)) goEat();
  }
  // крошки еды, пока ест (цвета — из палитры еды); миска при этом подрагивает
  function crumbs(o) {
    const el = o && o !== bw ? o.el : bowl;
    if (!el) return;
    if (el === bowl) { bowl.classList.remove('nom'); void bowl.offsetWidth; bowl.classList.add('nom'); }
    if (calm) return;
    const r = el.getBoundingClientRect(), cols = Object.values(foodOf(el === bowl ? st.food : o.food).pal || {});
    for (let i = 0; i < 2; i++) {
      const c = document.createElement('i');
      c.className = 'vy-crumb';
      c.setAttribute('aria-hidden', 'true');
      c.style.left = Math.round(r.left + r.width * (0.3 + Math.random() * 0.45)) + 'px';
      c.style.top = Math.round(r.top + r.height * 0.35) + 'px';
      c.style.background = cols.length ? cols[Math.floor(Math.random() * cols.length)] : '#D39A5E';
      c.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 30) + 'px');
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 640);
    }
  }
  function hop() { if (!cat) return; cat.classList.remove('hop'); void cat.offsetWidth; cat.classList.add('hop'); }
  // несколько сердечек вразлёт
  function hearts(n) {
    if (!cat) return;
    n = Math.min(n, 8 - cat.querySelectorAll('.vy-heart').length);
    for (let i = 0; i < n; i++) {
      const h = document.createElement('span');
      h.className = 'vy-heart';
      h.innerHTML = sprite(HEART, K * 0.75).svg;
      h.style.left = 25 + Math.random() * 50 + '%';
      h.style.animationDelay = i * 0.2 + 's';
      cat.appendChild(h);
      setTimeout(() => h.remove(), 1400 + i * 200);
    }
  }
  // ---------- злость ----------
  // st.anger 0–100: тыкают часто (больше трёх кликов за пару секунд), напугали, бросили, уронили с высоты, лоток
  // грязный — злится. Гладят по одному разу, кормят, убирают лоток — отходит; и само, по пункту за 5 секунд.
  // С GRUMPY дуется: не мурчит, не бежит к курсору и на зов. С CROSS злой: глаза-щёлочки, венка над головой, сидит
  // спиной, тронешь — шипит и отмахивается лапой, назло толкает миску
  const GRUMPY = 30, CROSS = 55;
  const grumpy = () => st.anger >= GRUMPY, cross = () => st.anger >= CROSS;

  // ---------- отношения ----------
  // st.bond 0–100 — насколько Васян к тебе привязан. Растёт от заботы: погладил без спешки, поел (в том числе корм,
  // который ты разложил), убрал лоток. Падает, когда его бросают, пугают частыми кликами, шипит на тебя, лоток грязный.
  // Ступени — BOND: на нижней от ласки иногда отходит («хмф»), с «Любит» мурчит дольше, сердечек больше и встречает
  // сердечком, когда открываешь страницу. Ступень — в подсказке у котика, в магазине (CasualVasyan.bond) и надписью,
  // когда меняется. У одного действия — пауза (bondCd), чтобы закликиванием дружбу не набить
  const BOND = [[0, 'Сторонится', 'Васян тебя сторонится'], [20, 'Привыкает', 'Васян к тебе привыкает'], [40, 'Доверяет', 'Васян тебе доверяет'],
    [60, 'Любит', 'Васян тебя любит'], [80, 'Обожает', 'Васян тебя обожает']];
  const bondLv = (v = st.bond) => BOND.reduce((k, [min], i) => (v >= min ? i : k), 0);
  const bondInfo = () => { const lv = bondLv(); return { v: Math.round(st.bond), lv, name: BOND[lv][1], text: BOND[lv][2], next: BOND[lv + 1] ? BOND[lv + 1][0] : null, levels: BOND.map(([min, name]) => ({ min, name })) }; };
  const bondCd = {};
  // мордочки ступеней отношений (11×9): сторонится, привыкает, доверяет, любит, обожает
  const FACES = ["<svg viewBox=\"0 0 11 9\" width=\"33\" height=\"27\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"0\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"3\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"4\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"8\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"9\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"5\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"6\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"6\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"6\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/></svg>","<svg viewBox=\"0 0 11 9\" width=\"33\" height=\"27\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"1\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"8\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"4\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"8\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"8\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"6\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/></svg>","<svg viewBox=\"0 0 11 9\" width=\"33\" height=\"27\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"1\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"8\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"4\" y=\"3\" width=\"1\" height=\"1\" fill=\"#FFF3E6\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"8\" y=\"3\" width=\"1\" height=\"1\" fill=\"#FFF3E6\"/><rect x=\"9\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"8\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"5\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"5\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"5\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"6\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/></svg>","<svg viewBox=\"0 0 11 9\" width=\"33\" height=\"27\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"1\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"8\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"4\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"3\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"8\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"7\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"4\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"9\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"5\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"2\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"5\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"5\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"5\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"10\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"6\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/></svg>","<svg viewBox=\"0 0 11 9\" width=\"33\" height=\"27\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"1\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"0\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"8\" y=\"1\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"2\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"3\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"5\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"7\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"9\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"3\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"3\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"7\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"8\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"9\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"4\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"4\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E4553F\"/><rect x=\"8\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"10\" y=\"5\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"0\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"6\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"2\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"6\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"6\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"6\" width=\"1\" height=\"1\" fill=\"#F5A3B5\"/><rect x=\"10\" y=\"6\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"#3A2A22\"/><rect x=\"6\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"2\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"6\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/><rect x=\"8\" y=\"8\" width=\"1\" height=\"1\" fill=\"#E08A3C\"/></svg>"];
  function cardHTML() {
    const b = bondInfo(), full = clamp(100 - Math.round(st.hunger), 0, 100);
    const mood = cross() ? 'Злится' : grumpy() ? 'Дуется' : 'Доволен';
    const food = st.hunger > 80 ? 'Голоден' : st.hunger > 60 ? 'Проголодался' : 'Сыт';
    const tray = st.box.n >= BOX_FULL ? 'Грязный' : st.box.n || poos.length ? 'Пора убрать' : 'Чистый';
    return `<span class="vc-top">${FACES[b.lv]}<span><b>Васян</b><small>${b.name}</small></span></span>`
      + `<span class="vc-grid"><span>Отношения</span><span class="vc-bar"><i style="width:${b.v}%"></i></span>`
      + `<span>Сытость</span><span class="vc-bar food"><i style="width:${full}%"></i></span>`
      + `<span>Настроение</span><b>${mood}</b><span>Еда</span><b>${food}</b><span>Лоток</span><b>${tray}</b></span>`;
  }
  // у края окна карточка сдвигается внутрь (--dx), чтобы не уходить за экран
  function cardClamp() {
    if (!card || !cat) return;
    card.style.setProperty('--dx', '0px');
    const r = card.getBoundingClientRect();
    const dx = r.left < 8 ? 8 - r.left : r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0;
    if (dx) card.style.setProperty('--dx', Math.round(dx) + 'px');
  }
  // содержимое меняется — перерисовать (только если правда поменялось: перевод страницы не дёргается каждые полсекунды)
  function cardRefresh() {
    if (!card || !cardOn) return;
    const h = cardHTML();
    if (h !== cardLast) { cardLast = h; card.innerHTML = h; }
    cardClamp();
  }
  function cardShow(ms) {
    if (!card) return;
    cardOn = true; card.classList.add('on'); cardRefresh();
    clearTimeout(cardT);
    if (ms) cardT = setTimeout(cardHide, ms);
  }
  function cardHide() { if (!card) return; cardOn = false; card.classList.remove('on'); clearTimeout(cardT); }
  function bond(n, key, gap = 0) {
    const now = Date.now();
    if (key && gap && now - (bondCd[key] || 0) < gap) return;
    if (key) bondCd[key] = now;
    const was = bondLv();
    st.bond = clamp(Math.round((st.bond + n) * 10) / 10, 0, 100);
    cardRefresh();
    const lv = bondLv();
    if (lv === was) return;
    if (cat) floatText(cat, BOND[lv][2]);
    if (lv > was && cat && !BUSY.includes(mode)) hearts(3);
    document.dispatchEvent(new CustomEvent('casualhub:vasyan-bond', { detail: bondInfo() }));
  }
  function annoy(n) {
    const was = cross();
    st.anger = Math.min(100, st.anger + n);
    if (!was && cross() && cat && !BUSY.includes(mode)) { say('hiss'); hop(); }
  }
  // отошёл совсем — мурлычет: помирились
  function soothe(n) {
    const was = grumpy();
    st.anger = Math.max(0, st.anger - n);
    if (was && !grumpy() && cat && !BUSY.includes(mode) && mode !== 'sleep') say('purr');
  }
  function hiss(t) {
    stopPlay();
    mode = 'hiss'; until = t + 950;
    dir = mouse.t && mouse.x < x + size.w / 2 ? -1 : 1; faced = dir;
    hop(); say('hiss');
  }

  // погладили: мурчит; гладят часто и много — пугается и злится; злой — шипит
  const BUSY = ['drag', 'fall', 'jump', 'climb'];
  function pet() {
    const t = performance.now();
    // уже напуган, шипит или удирает — ещё клик только злит
    if (mode === 'scared' || mode === 'hiss' || (mode === 'run' && runMood)) { hop(); annoy(3); return; }
    clicks.push(t);
    while (clicks.length && t - clicks[0] > 2200) clicks.shift();
    if (cross() && !BUSY.includes(mode)) { annoy(4); hiss(t); bond(-1, 'hiss', 5000); return; }
    if (clicks.length >= 5 && !BUSY.includes(mode)) { clicks.length = 0; annoy(15); scare(t); bond(-2, 'scare', 5000); return; }
    if (clicks.length >= 3) annoy(5); else soothe(3);
    st.pets = (+st.pets || 0) + 1;
    // ещё сторонится — от ласки иногда отходит, но понемногу привыкает
    if (bondLv() === 0 && !BUSY.includes(mode) && clicks.length < 3 && Math.random() < 0.4) { bond(0.5, 'shy', 8000); save(); stopPlay(); hop(); say('hmph'); return; }
    if (clicks.length < 3) bond(1, 'pet', 12000);
    save();
    // дуется — терпит, но не мурчит
    if (grumpy()) { if (!BUSY.includes(mode)) { stopPlay(); mode = 'sit'; until = t + 2500; } hop(); say('hmph'); return; }
    const fond = bondLv() >= 3; // любит — мурчит дольше, сердечек больше
    if (!BUSY.includes(mode)) { stopPlay(); mode = 'purr'; until = t + 2400 + clicks.length * 400 + (fond ? 1500 : 0); }
    hop();
    hearts(Math.min(fond ? 5 : 4, 1 + clicks.length + (fond ? 1 : 0)));
    if (clicks.length >= 3) say('purr');
  }
  function scare(t) {
    stopPlay();
    mode = 'scared'; until = t + 750;
    hop(); say('bang');
  }

  // ---------- перетаскивание (как Shimeji) ----------
  function down(e) {
    if (e.button > 0) return;
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, pts: [[performance.now(), e.clientX, e.clientY]] };
    dragged = false;
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function move(e) {
    if (!press) return;
    if (!dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
    if (!dragged) { dragged = true; mode = 'drag'; jump = null; after = null; prep = null; climb = null; goal = null; stopPlay(); clearBubble(); cat.classList.remove('flipjump'); cat.classList.add('drag'); }
    const t = performance.now(), pts = press.pts;
    pts.push([t, e.clientX, e.clientY]);
    while (pts.length > 2 && t - pts[0][0] > 100) pts.shift();
    const s = sprite(HANG, K);
    x = e.clientX - s.cw / 2; y = e.clientY + s.ch - 6;
  }
  // отпустили — падает; бросили с размаху (быстрее 650 px/с за последние ~0,1 с) — летит и злится, просто
  // таскали — чуть недоволен
  function up() {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const p = press;
    press = null;
    if (!dragged || !cat || !p) return;
    cat.classList.remove('drag'); mode = 'fall'; vy = 0; vx = 0; surf = null; dropped = true; fallY0 = y;
    const a = p.pts[0], b = p.pts[p.pts.length - 1], dt = b[0] > a[0] && performance.now() - b[0] < 80 ? (b[0] - a[0]) / 1000 : 0;
    const tvx = dt ? (b[1] - a[1]) / dt : 0, tvy = dt ? (b[2] - a[2]) / dt : 0;
    if (!calm && Math.hypot(tvx, tvy) > 650) { thrown = true; vx = clamp(tvx * 0.7, -1300, 1300); vy = clamp(tvy * 0.7, -1100, 1300); annoy(22); bond(-5, 'throw', 3000); }
    else annoy(3);
  }

  // ---------- что делать дальше ----------
  // насколько ниже края висит, когда зацепился: голова над краем, лапы болтаются
  const HANG_DY = () => (HANG.length - 4) * K;
  function jumpTo(s, tx) {
    const [a, b] = bounds(s);
    tx = Math.max(a, Math.min(b, tx));
    const top = surfTop(s, tx), dist = Math.hypot(tx - x, top - y);
    // высоко — не долетает: цепляется за край и вскарабкивается; далеко — иногда сальто
    const climbIt = !!s && y - top > 110 && Math.random() < 0.75;
    const flip = !calm && !climbIt && dist > 240 && Math.random() < 0.22;
    jump = { s, x0: x, y0: y, x1: tx, t0: performance.now(), dur: Math.min(900, 380 + dist * 0.9), climb: climbIt };
    dir = tx >= x ? 1 : -1;
    mode = 'jump'; prep = null; clearBubble('zz');
    if (cat) {
      cat.classList.toggle('flipjump', flip);
      if (flip) { cat.style.setProperty('--fd', jump.dur + 'ms'); cat.style.setProperty('--fr', (dir > 0 ? 360 : -360) + 'deg'); }
    }
  }
  // наверх — сначала присесть и повилять задом, как перед охотой; вниз и на пол — прыгает сразу
  function prepJump(s, tx, ms) {
    const [a, b] = bounds(s), gx = Math.max(a, Math.min(b, tx));
    if (calm || surfTop(s, gx) > y - 24) { jumpTo(s, tx); return; }
    prep = { s, tx, until: performance.now() + (ms || 380 + Math.random() * 420) };
    dir = gx >= x ? 1 : -1;
    mode = 'prep'; clearBubble('zz');
  }
  // приземление: присел от удара и пыль из-под лап
  function thud() {
    if (!cat || calm) return;
    cat.classList.remove('land'); void cat.offsetWidth; cat.classList.add('land');
    clearTimeout(thudT); thudT = setTimeout(() => { if (cat) cat.classList.remove('land'); }, 320);
    dust(x + size.w / 2, y, size.w * 0.3);
  }
  // пыль в обе стороны от точки cx на линии ly
  function dust(cx, ly, spread) {
    for (const dx of [-1, 1]) {
      const d = document.createElement('i');
      d.className = 'vy-dust';
      d.setAttribute('aria-hidden', 'true');
      d.style.left = Math.round(cx + dx * spread) + 'px';
      d.style.top = Math.round(ly - 3) + 'px';
      d.style.setProperty('--dx', dx * 12 + 'px');
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 540);
    }
  }

  // ---------- к миске: поесть, понюхать, столкнуть ----------
  // goal: { o — миска (bw) или кучка рассыпанного (из sps), act — eat | sniff | push, d — куда толкать, side — с какой стороны
  // встал, tries — сколько прыжков уже сделал по пути }. wantEat — миску переставили с едой: сходить поесть, даже
  // если не голоден (как только она встанет и он сам будет на лапах)
  let goal = null, wantEat = false, thinkUntil = 0, lastPush = -1e9;
  const thingOk = (o) => (o === bw ? !!bowl && bw.mode === 'rest' : o === lt ? !!box && lt.mode === 'rest' : sps.includes(o) && o.n > 0 && o.mode === 'rest');
  // где есть еда: сначала рассыпанная, потом — в миске (не вверх дном); то, что летит или в руке, — пока нет
  function foodSpot() {
    // из кучек — та, что на его блоке, потом ближняя
    const ok = sps.filter((q) => q.n > 0 && q.mode === 'rest');
    if (ok.length) return ok.sort((a, b) => (a.s !== surf) - (b.s !== surf) || Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    if (bowl && st.bowl > 0 && !bw.flip && bw.mode === 'rest') return bw;
    return null;
  }
  const foodAvail = () => sps.some((q) => q.n > 0) || (st.bowl > 0 && !bw.flip);
  function goEat() { const o = foodSpot(); return !!o && goToThing(o, 'eat'); }
  // пойти к вещи: она на другом блоке — сначала туда (по плиткам), дальше — пешком (mode goEat)
  function goToThing(o, act, d) {
    if (!goal || goal.o !== o || goal.act !== act) goal = { o, act, d, tries: 0, side: 0 };
    if (o.s !== surf) {
      // не добраться — бросает
      if (++goal.tries > 6) { goal = null; wantEat = false; return false; }
      // «меньше движения»: не прыгает и не летит — сразу оказывается на том же блоке (или на полу), дальше пешком
      if (calm) {
        surf = o.s; jump = null; prep = null; climb = null; after = null;
        const [a, b] = bounds(surf);
        x = clamp(o.x + o.w / 2 - size.w / 2, a, b); y = surfTop(surf);
        mode = 'goEat';
        return true;
      }
      routeTo(o.s, o.x + o.w / 2 - size.w / 2);
      after = 'goal';
      return true;
    }
    mode = 'goEat';
    return true;
  }
  // встал на лапы (прыжок, падение) — продолжить путь к вещи
  function resumeGoal() {
    if (goal && thingOk(goal.o)) return goToThing(goal.o, goal.act, goal.d);
    goal = null;
    return !!(wantEat && goEat());
  }
  // цель пропала (миску схватили, она падает, её доели) — передумать. Ел — «мяу?»; еда упадёт — afterBowl позовёт снова
  function replan() {
    const g = goal;
    if (mode === 'eat') say('meow');
    goal = null;
    if (g && g.act !== 'eat' && thingOk(g.o) && goToThing(g.o, g.act, g.d)) return;
    if ((wantEat || st.hunger > 60) && goEat()) return;
    decide();
  }
  // дойти до блока s (null — пол): вниз прыгает сразу, вверх — по плиткам, не выше REACH за прыжок
  function routeTo(s, tx) {
    if (!s) { jumpTo(null, tx); return; }
    const top = edgeOf(s);
    if (top >= y - REACH) { prepJump(s, tx, 240); return; }
    const gx = tx + size.w / 2, mid = (p) => (p.r.left + p.r.right) / 2, cost = (p) => (p.top - top) + Math.abs(mid(p) - gx) * 0.35;
    const step = platforms().filter((p) => p.el !== surf && p.el !== s && !p.seat && p.top < y - 20 && p.top >= y - REACH && p.top > top).sort((a, b) => cost(a) - cost(b))[0];
    if (step) { const [a, b] = bounds(step.el); prepJump(step.el, clamp(gx - size.w / 2, a, b), 200); } else prepJump(s, tx, 240);
  }
  // где встать у вещи: есть и нюхать — головой над ней, с ближней стороны (если там есть место);
  // толкать — с той стороны, откуда толкают, мордой туда, куда покатится
  function spotOf(g) {
    const o = g.o, [a, b] = bounds(o.s), ov = 4 * K;
    if (g.act === 'push') return { x: clamp(g.d > 0 ? o.x - size.w + ov : o.x + o.w - ov, a, b), dir: g.d };
    // в лоток — посередине; сделать рядом — вплотную сбоку, где есть место
    if (g.act === 'potty') { if (!g.side) g.side = x + size.w / 2 > o.x + o.w / 2 ? -1 : 1; return { x: clamp(o.x + o.w / 2 - size.w / 2, a, b), dir: g.side }; }
    if (g.act === 'beside') {
      const L = o.x - size.w - 2, R = o.x + o.w + 2, right = R <= b && (L < a || x > o.x);
      return { x: clamp(right ? R : L, a, b), dir: right ? -1 : 1 };
    }
    const L = o.x - size.w + ov, R = o.x + o.w - ov, fits = (v) => v >= a - 2 && v <= b + 2;
    if (!g.side) g.side = x + size.w / 2 > o.x + o.w / 2 ? 1 : -1;
    if (!fits(g.side > 0 ? R : L) && fits(g.side > 0 ? L : R)) g.side = -g.side;
    return { x: clamp(g.side > 0 ? R : L, a, b), dir: g.side > 0 ? -1 : 1 };
  }
  // дошёл: есть, толкать или нюхать
  function arrive(t) {
    const p = spotOf(goal);
    dir = p.dir; faced = dir;
    if (goal.act === 'eat') { mode = 'eat'; until = t + 3200; wantEat = false; biteN = -1; say('yum'); }
    else if (goal.act === 'push') { mode = 'push'; goal.t0 = t; goal.hit = false; }
    else if (goal.act === 'potty') { mode = 'litter'; goal.t0 = t; goal.done = false; goal.turned = 0; }
    else if (goal.act === 'refuse') { mode = 'refuse'; until = t + 1300; }
    else if (goal.act === 'beside') { mode = 'squat'; until = t + 2000; }
    else { mode = 'sniff'; until = t + 1500; }
  }
  // доел порцию: из рассыпанного или из миски
  function finishEat(t) {
    const o = goal && goal.o;
    if (o && o !== bw) { o.n -= 1; if (o.n > 0) { drawSpill(o); keepSpills(); } else dropSpill(o); }
    else { st.bowl = Math.max(0, st.bowl - 1); drawBowl(); }
    st.hunger = Math.max(0, st.hunger - 70); goal = null;
    // корм, разложенный по сайту, собирает весь, и сытый: осталась кучка — умоется и пойдёт к ней (decide → goEat)
    if (sps.some((q) => q.n > 0)) wantEat = true;
    bond(2, 'eat', 30000); // накормили — благодарен
    if (!st.pooAt) st.pooAt = Date.now() + (90 + Math.random() * 150) * 1000;
    soothe(20); save();
    clearBubble('think'); say('love'); mode = 'wash'; until = t + 1600 + Math.random() * 900;
  }
  // толкнуть миску можно, если она стоит там же, где он, недалеко, и он давно её не толкал
  const pushOk = () => !calm && !!bowl && bw.mode === 'rest' && bw.s === surf && performance.now() - lastPush > 25000 && Math.abs(bw.x + bw.w / 2 - (x + size.w / 2)) < 650;
  function hitBowl(d) {
    lastPush = performance.now();
    if (bw.mode !== 'rest' || bw.s !== surf || Math.abs(bw.x + bw.w / 2 - (x + size.w / 2)) > size.w + bw.w) return;
    bw.mode = 'slide'; bw.vx = d * (150 + Math.random() * 190); bw.by = 'push';
    hopBowl();
  }
  // миска встала на новое место: Васян идёт к ней — поесть, если есть что, или понюхать пустую. Сам столкнул —
  // сначала смотрит, что вышло (рассыпал — «!»), а к еде идёт, только если голоден
  function afterBowl(why, spilt) {
    if (!alive || !cat || calm) return;
    if (why === 'push') { if (spilt) say('bang'); if (st.hunger <= 60) return; }
    wantEat = foodAvail();
    if (BUSY.includes(mode) || mode === 'prep' || mode === 'push') return; // встанет на лапы — пойдёт сам (land → resumeGoal)
    clearTimeout(bowlT);
    bowlT = setTimeout(() => {
      if (!alive || !cat || BUSY.includes(mode) || ['prep', 'push', 'eat', 'scared'].includes(mode)) return;
      if (wantEat && foodSpot()) { stopPlay(); clearBubble('zz'); goEat(); return; }
      if (mode !== 'sleep' && thingOk(bw)) { stopPlay(); goToThing(bw, 'sniff'); }
    }, why === 'push' ? 900 : 350 + Math.random() * 300);
  }
  // ---------- лоток: захотел — идёт, копает ямку, делает, закапывает и носится ----------
  // st.pooAt — когда захочет (ставится после еды, через 1,5–4 минуты). Лоток грязный (BOX_FULL кучек) — нюхает,
  // «Фу!», злится и делает рядом на полу: эту кучку убирают кликом (или вместе с лотком)
  const POTTY_FREE = ['sit', 'walk', 'loaf', 'look', 'edge', 'wash', 'sulk'];
  let pottyT = 0;
  function goPotty() {
    if (!box || lt.mode !== 'rest') return false;
    return goToThing(lt, st.box.n >= BOX_FULL ? 'refuse' : 'potty');
  }
  // сделал дело — носится по полу (как коты после лотка)
  function zoomies(t) {
    const [a, b] = bounds(surf);
    if (calm || b - a < 160) { mode = 'sit'; until = t + 3000; return; }
    mode = 'run'; runMood = 'zoom'; target = x - a > b - x ? a : b;
    hop();
  }
  // наполнитель летит из-под лап, пока копает
  function sand() {
    if (calm || !box) return;
    for (let i = 0; i < 2; i++) {
      const c = document.createElement('i');
      c.className = 'vy-sand';
      c.setAttribute('aria-hidden', 'true');
      c.style.left = Math.round(x + size.w / 2 + (Math.random() - 0.5) * size.w * 0.6) + 'px';
      c.style.top = Math.round(lt.y - lt.h * 0.6) + 'px';
      c.style.background = Math.random() < 0.5 ? BOX_PAL.X : BOX_PAL.Y;
      c.style.setProperty('--dx', Math.round(-dir * (8 + Math.random() * 24)) + 'px');
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 600);
    }
  }
  // случайное действие с весами; только что сделанное — реже, чтобы кот не повторялся
  function pick(opts) {
    const list = opts.filter((o) => o[1] > 0).map(([k, w]) => [k, k === lastAct ? w * 0.35 : w]);
    let r = Math.random() * list.reduce((s, o) => s + o[1], 0);
    for (const [k, w] of list) if ((r -= w) <= 0) return k;
    return list[0][0];
  }
  function decide() {
    const t = performance.now();
    if ((st.hunger > 60 || wantEat) && goEat()) return;
    // при «меньше движения» — только спокойные позы на месте. Миску рядом иногда толкает (с карточки — охотнее)
    const opts = cross()
      ? (calm ? [['sulk', 3], ['loaf', 2], ['sit', 1]] : [['sulk', 4], ['loaf', 1.2], ['walk', 1], ['wash', 1], ['sit', 0.8], ['jump', 0.6], ['push', pushOk() ? 1.6 : 0]])
      : calm
      ? [['sit', 3], ['loaf', 2], ['sleep', 2], ['wash', 1.2], ['yawn', 0.6], ['look', 1]]
      : [['walk', 3.2], ['jump', 2.4], ['sit', 2], ['loaf', 1.3], ['sleep', 1], ['wash', 1], ['stretch', 0.7], ['scratch', 0.5],
        ['roll', 0.6], ['yawn', 0.5], ['sneeze', 0.25], ['look', 1.1], ['spin', 0.35], ['play', isSeat(surf) ? 0 : surf ? 0.4 : 0.7], ['edge', surf && !isSeat(surf) ? 1.8 : 0],
        ['push', pushOk() ? (surf ? 1.4 : 0.45) : 0]];
    act(pick(opts), t);
  }
  function act(k, t = performance.now()) {
    lastAct = k;
    goal = null;
    switch (k) {
      case 'walk': { const [a, b] = bounds(surf); mode = 'walk'; target = a + Math.random() * Math.max(10, b - a); return; }
      case 'jump': {
        // прыжок на другой блок недалеко (или вниз, на пол)
        const ps = platforms().filter((p) => p.el !== surf && Math.abs((p.r.left + p.r.right) / 2 - x) < 520 && Math.abs(p.top - y) < 420);
        if (ps.length && Math.random() < 0.8) { const p = ps[Math.floor(Math.random() * ps.length)], [a, b] = bounds(p.el); prepJump(p.el, a + Math.random() * Math.max(10, b - a)); return; }
        if (surf) { jumpTo(null, x + (Math.random() - 0.5) * 200); return; }
        act('walk', t); return;
      }
      case 'loaf': mode = 'loaf'; until = t + 8000 + Math.random() * 9000; return;
      // перед сном кружится на месте, как кот устраивается
      case 'sleep': if (!calm) { mode = 'spin'; spinT0 = t; until = t + 900; spinThen = 'sleep'; return; } mode = 'sleep'; until = t + 10000 + Math.random() * 15000; return;
      case 'look': mode = 'look'; lookT0 = t; until = t + 2600; return;
      // гоняется за хвостом
      case 'spin': if (calm) break; mode = 'spin'; spinT0 = t; until = t + 1500; spinThen = ''; hop(); return;
      case 'wash': mode = 'wash'; until = t + 2600 + Math.random() * 2400; return;
      case 'yawn': mode = 'yawn'; until = t + 1500; return;
      case 'stretch': mode = 'stretch'; until = t + 1700; return;
      case 'scratch': mode = 'scratch'; until = t + 2200 + Math.random() * 1200; return;
      case 'sneeze': mode = 'sneeze'; sneezeAt = t + 800; until = t + 1500; return;
      case 'roll': mode = 'roll'; roll = { ph: 'over', t: t + 450 }; cat.classList.add('rolling', 'belly'); return;
      case 'play': startPlay(t); return;
      case 'edge': if (surf) { mode = 'edge'; until = t + 7000 + Math.random() * 8000; return; } break;
      case 'scared': scare(t); return;
      // дуется: сидит спиной к курсору, хвост хлещет
      case 'sulk': mode = 'sulk'; until = t + 5000 + Math.random() * 5000; return;
      // в лоток (для проверки — сразу, не дожидаясь, пока захочет)
      case 'potty': if (goPotty()) return; break;
      case 'push': {
        if (!pushOk()) break;
        // на карточке — к ближнему краю (сталкивает, как коты со стола), на полу — туда, где больше места
        const r = surf ? surf.getBoundingClientRect() : null, c = bw.x + bw.w / 2;
        const d = r ? (c - r.left < r.right - c ? -1 : 1) : (c < innerWidth / 2 ? 1 : -1);
        if (goToThing(bw, 'push', d)) return;
        break;
      }
      default: break;
    }
    mode = 'sit'; until = t + 3000 + Math.random() * 6000;
  }
  // как oneko: курсор остановился неподалёку — прибежать к нему, а то и подкрасться и прыгнуть
  function chase(t) {
    if (calm || grumpy() || !['sit', 'walk', 'loaf'].includes(mode) || t - chaseT < 7000) return;
    if (mouse.t === 0 || t - mouse.t < 1100 || t - mouse.t > 1400 || Math.random() < 0.4) return;
    chaseT = t;
    const ps = platforms();
    let best = null;
    for (const p of ps) if (mouse.x >= p.r.left && mouse.x <= p.r.right && p.top >= mouse.y - 12 && (!best || p.top < best.top)) best = p;
    const s = best ? best.el : null;
    const tx = mouse.x - size.w / 2;
    if (s === surf) {
      const [a, b] = bounds(s), goal = clamp(tx, a, b);
      // охота: подбегает поближе, последние шаги крадётся, виляет задом и прыгает; иначе — просто подбегает
      const d = goal - x, sg = Math.sign(d);
      if (Math.abs(d) > 130 && Math.random() < 0.6) {
        lastAct = 'hunt';
        if (Math.abs(d) > 300) { mode = 'run'; runMood = 'hunt'; target = goal - sg * 220; }
        else { mode = 'stalk'; target = goal - sg * 70; }
      } else { mode = 'run'; target = goal; runMood = ''; }
    } else prepJump(s, tx, 220);
  }
  function pounce() {
    const [a, b] = bounds(surf);
    jumpTo(surf, clamp(mouse.x - size.w / 2, a, b));
    after = 'caught';
  }

  // ---------- игрушки: клубок или мышка ----------
  function startPlay(t) {
    const [a, b] = bounds(surf);
    if (b - a < 180) { mode = 'sit'; until = t + 3000; return; }
    const kind = Math.random() < 0.5 ? 'yarn' : 'mouse';
    const spr = sprite(kind === 'yarn' ? YARN_A : MOUSE, K * 0.8);
    const el = document.createElement('span');
    el.className = 'vy-toy';
    el.innerHTML = spr.svg;
    document.body.appendChild(el);
    const front = x + size.w + 14 + spr.w < b + size.w - 4;
    toy = { el, kind, w: spr.w, h: spr.h, x: front ? x + size.w + 14 : x - spr.w - 14, vx: 0, s: surf, f: 0, ft: 0, bats: 3 + Math.floor(Math.random() * 3), end: t + 16000 };
    if (kind === 'mouse' && !front) el.classList.add('flip');
    mode = 'play'; play = 'go';
  }
  function stopPlay() { if (toy) { toy.el.remove(); toy = null; } play = ''; }
  function toyBounds(s, w) {
    if (!s) return [6, innerWidth - w - 6];
    const r = s.getBoundingClientRect();
    return [r.left + 2, Math.max(r.left + 2, r.right - w - 2)];
  }
  function moveToy(t, dt) {
    const [lo, hi] = toyBounds(toy.s, toy.w);
    toy.x += toy.vx * dt;
    toy.vx *= Math.max(0, 1 - 2.4 * dt);
    if (toy.x < lo) { toy.x = lo; toy.vx = Math.abs(toy.vx) * 0.45; }
    if (toy.x > hi) { toy.x = hi; toy.vx = -Math.abs(toy.vx) * 0.45; }
    if (Math.abs(toy.vx) < 5) toy.vx = 0;
    // клубок катится — меняет кадр; мышка смотрит туда, куда едет
    if (toy.kind === 'yarn' && toy.vx && t - toy.ft > 110) { toy.ft = t; toy.f ^= 1; toy.el.innerHTML = sprite(toy.f ? YARN_B : YARN_A, K * 0.8).svg; }
    if (toy.kind === 'mouse' && toy.vx) toy.el.classList.toggle('flip', toy.vx < 0);
    const top = toy.s ? toy.s.getBoundingClientRect().top : floorAt(toy.x + toy.w / 2);
    toy.el.style.transform = `translate(${Math.round(toy.x)}px, ${Math.round(top - toy.h + K)}px)`;
  }

  // ---------- реплики над головой ----------
  const TXT = { zz: 'Zzz…', bang: '!', achoo: 'Апчхи!', purr: 'мрр…', meow: 'мяу?', hiss: 'Ш-ш-ш!', ugh: 'Фу!', hmph: 'Хмф' };
  function say(kind) {
    if (!cat) return;
    if (bubble) bubble.remove();
    bubble = document.createElement('span');
    bubble.className = 'vy-bub ' + kind + (TXT[kind] ? ' txt' : '');
    if (kind === 'love') bubble.innerHTML = sprite(HEART, K * 0.9).svg;
    else if (kind === 'vein') bubble.innerHTML = sprite(VEIN, K * 0.8).svg;
    // голоден — думает о своей еде; ест — показывает, что ест
    else if (kind === 'think' || kind === 'yum') bubble.innerHTML = sprite(foodOf(st.food).rows, K * 0.8).svg;
    else bubble.textContent = TXT[kind] || '';
    cat.appendChild(bubble);
    if (kind !== 'zz' && kind !== 'think') { const b = bubble; setTimeout(() => { if (b === bubble) { b.remove(); bubble = null; } }, 1400); }
  }
  function clearBubble(kind) { if (bubble && (!kind || bubble.classList.contains(kind))) { bubble.remove(); bubble = null; } }

  // ---------- взгляд и хвост, пока сидит ----------
  // глаза — туда, где курсор (если он рядом и недавно двигался); спрайт развёрнут — лево и право меняются местами
  function lookEyes(t) {
    if (!mouse.t || t - mouse.t > 4000) return 'open';
    const flipped = cat.classList.contains('flip');
    const hx = x + size.w * (flipped ? 0.3 : 0.7), hy = y - size.h * 0.75;
    const dx = mouse.x - hx, dy = mouse.y - hy;
    if (Math.hypot(dx, dy) > 450) return 'open';
    if (dy < -50 && Math.abs(dx) < 90) return 'up';
    if (Math.abs(dx) < 24) return 'open';
    return (dx > 0) !== flipped ? 'right' : 'left';
  }
  function sitFrame(t) {
    // время от времени машет хвостом: вниз — середина — вверх — середина
    if (t >= wagUntil && Math.random() < 0.004) { wagFrom = t; wagUntil = t + 1300; }
    const tail = t < wagUntil ? ['mid', 'up', 'mid', 'down'][Math.floor((t - wagFrom) / 160) % 4] : 'down';
    const eyes = frame % 18 === 17 ? 'blink' : grumpy() ? 'angry' : lookEyes(t);
    return sitRows(eyes, 'base', tail);
  }

  // ---------- кадр ----------
  const GROUND = new Set(['look', 'spin', 'prep', 'sit', 'walk', 'run', 'sleep', 'goEat', 'eat', 'sniff', 'push', 'litter', 'refuse', 'squat', 'hiss', 'sulk', 'loaf', 'wash', 'yawn', 'stretch', 'scratch', 'roll', 'play', 'edge', 'stalk', 'wiggle', 'scared', 'sneeze', 'purr']);
  function land(s) {
    const air = mode === 'jump' || mode === 'fall', wasThrown = thrown;
    // уронили сами с большой высоты — ещё недоволен
    if (dropped && y - fallY0 > 350) annoy(6);
    surf = s; y = surfTop(s); jump = null; vx = 0; thrown = dropped = false;
    if (air) thud();
    // бросили: злой — шипит, нет — «!»
    if (wasThrown) { after = null; if (cross()) { hiss(performance.now()); return; } say('bang'); }
    // шёл к миске (или к рассыпанному) по плиткам — дальше к ней
    if (after === 'goal') { after = null; if (!resumeGoal()) decide(); }
    else if (after === 'caught') { after = null; mode = 'sit'; until = performance.now() + 3500; say('love'); }
    // позвали в чате и он запрыгнул к чату: сел, сердечки
    else if (after === 'called') { after = null; mode = 'sit'; until = performance.now() + 4500; hop(); hearts(3); say('love'); }
    // упал или бросили, а миску переставили с едой — к ней
    else if (!resumeGoal()) decide();
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !cat) { lastT = t; return; }
    // на 120–240 Гц шаг не каждый кадр: котику хватает ~60 в секунду, а страница не греет процессор (движение — по времени, dt)
    if (t - lastT < 12.5) return;
    const dt = Math.min(100, t - lastT) / 1000; lastT = t;
    st.hunger = Math.min(100, st.hunger + dt / 12);
    if (t - lastFrame > 160) { frame++; lastFrame = t; }
    if (t - measureT > 2000) { measureT = t; measure(); }
    stepThings(dt);
    chase(t);
    if (st.anger) soothe(dt * 0.2);
    const hungry = st.hunger > 60, canEat = hungry && !!foodSpot();
    // кувырок прервали (схватили, упал, погладили) — сразу на лапы; игру тоже
    if (mode !== 'roll' && roll) { roll = null; cat.classList.remove('belly', 'rolling'); }
    if (mode !== 'play' && toy) stopPlay();

    // блок уехал при прокрутке или исчез — падаем
    if (GROUND.has(mode) && !surfaceOk(surf)) { mode = 'fall'; vy = 0; surf = null; clearBubble('zz'); }
    // миска (или рассыпанное), к которой шёл или из которой ест, пропала, упала или уехала — передумать
    if (['goEat', 'eat', 'sniff', 'litter', 'refuse'].includes(mode) && (!goal || !thingOk(goal.o) || goal.o.s !== surf || (mode !== 'goEat' && Math.abs(spotOf(goal).x - x) > 16))) replan();
    // захотел в лоток — идёт, как только свободен
    if (st.pooAt && Date.now() > st.pooAt && POTTY_FREE.includes(mode) && t - pottyT > 3000) { pottyT = t; if (!goPotty()) st.pooAt = Date.now() + 60e3; }
    // злой — время от времени венка над головой
    if (cross() && !bubble && t - veinT > 4500 && GROUND.has(mode) && mode !== 'sleep') { veinT = t; say('vein'); }
    if (mode === 'push' && (!goal || goal.o !== bw)) { goal = null; decide(); }

    let rows;
    if (mode === 'drag') rows = frame % 4 < 2 ? HANG : HANG_B;
    else if (mode === 'fall') {
      const prev = y; vy = Math.min(1600, vy + 2200 * dt); y += vy * dt;
      // брошенный летит и вбок, отскакивая от краёв окна
      if (vx) {
        x += vx * dt; vx *= Math.max(0, 1 - 0.6 * dt);
        if (x < 0) { x = 0; vx = Math.abs(vx) * 0.5; } else if (x > innerWidth - size.w) { x = innerWidth - size.w; vx = -Math.abs(vx) * 0.5; }
      }
      rows = thrown ? (frame % 2 ? JUMP : WALK_A) : HANG_B;
      // приземлиться на блок, через верх которого пролетели, или на пол
      const cx = x + size.w / 2;
      const hit = platforms().find((p) => cx >= (p.seat ? seatLeft(p.r) : p.r.left) && cx <= p.r.right && p.top >= prev - 2 && p.top <= y); // в профиле — только правее аватарки
      if (hit) land(hit.el); else if (y >= floorAt(cx)) land(null);
    } else if (mode === 'jump' && jump) {
      const k = Math.min(1, (t - jump.t0) / jump.dur), y1 = surfTop(jump.s, jump.x1) + (jump.climb ? HANG_DY() : 0);
      const h = 50 + Math.max(0, jump.y0 - y1) * 0.6;
      x = jump.x0 + (jump.x1 - jump.x0) * k;
      y = jump.y0 + (y1 - jump.y0) * k - h * 4 * k * (1 - k);
      rows = jump.climb && k > 0.6 ? (frame % 2 ? HANG : HANG_B) : k < 0.5 ? JUMP : WALK_A;
      if (k >= 1) {
        if (!surfaceOk(jump.s)) { mode = 'fall'; vy = 0; surf = null; jump = null; }
        else if (jump.climb) { climb = { s: jump.s, t0: t }; jump = null; mode = 'climb'; }
        else land(jump.s);
      }
    } else if (mode === 'climb' && climb) {
      // висит на краю и сучит лапами, потом подтягивается
      const k = Math.min(1, (t - climb.t0) / 680), top = surfTop(climb.s, x), hang = top + HANG_DY();
      if (!surfaceOk(climb.s)) { climb = null; mode = 'fall'; vy = 0; surf = null; rows = HANG_B; }
      else {
        if (k < 0.65) { rows = frame % 2 ? HANG : HANG_B; y = hang; }
        else { rows = JUMP; y = hang + (top - hang) * ((k - 0.65) / 0.35); }
        if (k >= 1) { const cs = climb.s; climb = null; land(cs); hop(); }
      }
    } else {
      y = surfTop(surf);
      if (mode === 'walk' || mode === 'run' || mode === 'goEat' || mode === 'stalk' || (mode === 'play' && play === 'go')) {
        if (mode === 'play') target = toy.x > x ? toy.x - size.w + 4 : toy.x + toy.w - 4;
        if (mode === 'goEat') target = spotOf(goal).x; // миска могла уехать с карточкой — место у неё каждый кадр заново
        const dx = target - x; dir = dx >= 0 ? 1 : -1;
        // сменил направление — сначала разворачивается на месте, потом идёт мордой вперёд
        if (dir !== faced && Math.abs(dx) > 1) { faced = dir; turnUntil = t + 220; }
        // толкать миску идёт крадучись
        const sneak = mode === 'goEat' && goal.act === 'push';
        const speed = mode === 'walk' ? 42 : mode === 'stalk' ? 30 : mode === 'play' ? 64 : sneak ? 48 : runMood === 'zoom' ? 270 : 110;
        if (t >= turnUntil) x += dir * Math.min(Math.abs(dx), speed * dt);
        const low = mode === 'stalk' || mode === 'play' || sneak;
        rows = t < turnUntil ? (low ? STALK_A : SIT) : low ? (frame % 2 ? STALK_B : STALK_A) : frame % 2 ? WALK_B : WALK_A;
        if (Math.abs(target - x) < 1.5) {
          if (mode === 'goEat') arrive(t);
          else if (mode === 'run' && runMood === 'hunt') {
            // добежал до курсора поближе — дальше крадётся
            const [a, b] = bounds(surf), goal = clamp(mouse.x - size.w / 2, a, b);
            runMood = ''; mode = 'stalk'; target = goal - Math.sign(goal - x || 1) * 70;
          } else if (mode === 'run') { mode = 'sit'; until = t + (runMood ? 3000 : 4000); if (runMood === 'zoom') hop(); else if (!runMood) say('love'); runMood = ''; }
          else if (mode === 'stalk') { mode = 'wiggle'; until = t + 750; }
          else if (mode === 'play') { play = 'bat'; playT = t + 380; dir = toy.x > x ? 1 : -1; }
          else decide();
        }
      } else if (mode === 'prep') {
        // перед прыжком наверх: присел, смотрит на цель и виляет задом
        rows = frame % 2 ? WIGGLE : STALK_A;
        if (!prep) decide();
        else if (t > prep.until) { const pj = prep; prep = null; if (!pj.s || surfaceOk(pj.s)) jumpTo(pj.s, pj.tx); else decide(); }
      } else if (mode === 'wiggle') {
        rows = frame % 2 ? WIGGLE : STALK_A;
        dir = mouse.x > x + size.w / 2 ? 1 : -1;
        if (t > until) pounce();
      } else if (mode === 'play') {
        if (!toy || toy.s !== surf) { stopPlay(); decide(); rows = SIT; }
        else if (play === 'bat') {
          rows = t < playT - 190 ? PLAY_A : PLAY_B;
          if (t >= playT) {
            toy.vx = dir * (150 + Math.random() * 150); toy.bats -= 1;
            play = toy.bats > 0 && t < toy.end ? 'watch' : 'done'; playT = t + 600;
          }
        } else if (play === 'watch') {
          rows = frame % 12 === 11 ? STALK_B : STALK_A;
          dir = toy.x + toy.w / 2 > x + size.w / 2 ? 1 : -1;
          if (t > playT && !toy.vx) play = 'go';
        } else { stopPlay(); mode = 'sit'; until = t + 4000; say('love'); rows = SIT; }
      } else if (mode === 'eat') {
        // ест: голова в миске (или у рассыпанного на полу), жуёт (голова вверх-вниз), на каждый укус — крошки
        const n = Math.floor(frame / 2);
        rows = n % 2 ? EAT_B : EAT_A;
        if (n % 2 && n !== biteN) { biteN = n; crumbs(goal.o); }
        // доел — облизывает лапу
        if (t > until) finishEat(t);
      } else if (mode === 'sniff') {
        // нюхает пустую миску: голову к ней и обратно, потом сидит рядом и думает о еде
        rows = frame % 4 < 2 ? EAT_A : STALK_A;
        if (t > until) { goal = null; mode = 'sit'; until = t + 3500 + Math.random() * 2000; thinkUntil = t + 2600; }
      } else if (mode === 'push') {
        // лапа назад — удар: миска поехала; смотрит ей вслед. Не упала — бывает, толкает ещё раз
        const k = t - goal.t0;
        rows = k < 300 ? PLAY_A : k < 560 ? PLAY_B : frame % 12 === 11 ? STALK_B : STALK_A;
        dir = goal.d;
        if (k >= 300 && !goal.hit) { goal.hit = true; hitBowl(goal.d); }
        if (k > 1500) {
          const g = goal;
          if (bw.mode === 'rest' && bw.s === surf && (g.n || 0) < 2 && Math.random() < 0.45) { g.n = (g.n || 0) + 1; g.hit = false; lastPush = -1e9; goToThing(bw, 'push', g.d); }
          else { goal = null; mode = 'sit'; until = t + 2500 + Math.random() * 2500; }
        }
      } else if (mode === 'litter') {
        // в лотке: копает ямку, разворачивается, садится (хвост трубой, зажмурился), закапывает — и носится
        const k = t - goal.t0;
        if (k < 1300 || (k >= 3500 && k < 4700)) { rows = frame % 2 ? PLAY_B : PLAY_A; if (t - sandT > 140) { sandT = t; sand(); } }
        else {
          if (!goal.turned) { goal.turned = 1; dir = -dir; }
          rows = k < 1500 ? SIT : POTTY;
          if (k > 2600 && !goal.done) { goal.done = true; st.box.n = Math.min(4, st.box.n + 1); st.pooAt = 0; save(); drawBox(); hopBox(); }
        }
        if (k >= 3500 && goal.turned === 1) { goal.turned = 2; dir = -dir; }
        if (k >= 4700) { goal = null; zoomies(t); }
      } else if (mode === 'refuse') {
        // лоток грязный: нюхает, фыркает — «Фу!» — злится и идёт делать рядом
        rows = frame % 4 < 2 ? EAT_A : STALK_A;
        if (t > until) { say('ugh'); annoy(10); bond(-2, 'ugh', 60000); goal = null; if (!goToThing(lt, 'beside')) { st.pooAt = Date.now() + 60e3; decide(); } }
      } else if (mode === 'squat') {
        // делает рядом с лотком: кучка — за ним, на том же блоке
        rows = POTTY;
        if (t > until) { makePoo(surf, x + size.w / 2 - 2.5 * K - dir * size.w * 0.25); keepPoos(); st.pooAt = 0; save(); goal = null; zoomies(t); }
      } else if (mode === 'hiss') {
        // шипит: шерсть дыбом, глаза-щёлочки, отмахивается лапой
        rows = frame % 4 < 2 ? HISS : PLAY_B;
        if (t > until) { mode = 'sulk'; until = t + 4000 + Math.random() * 3000; }
      } else if (mode === 'sulk') {
        // дуется: сидит спиной к курсору, хвост хлещет, глаза-щёлочки
        dir = mouse.t && mouse.x > x + size.w / 2 ? -1 : 1;
        rows = sitRows(frame % 18 === 17 ? 'blink' : 'angry', 'base', ['mid', 'up', 'mid', 'down'][Math.floor(t / 140) % 4]);
        if (t > until) decide();
      } else if (mode === 'sleep') {
        rows = Math.floor(frame / 6) % 2 ? SLEEP_B : SLEEP;
        if (!bubble || !bubble.classList.contains('zz')) say('zz');
        // проснулся — потягивается (а голодный и с кормом — сразу к миске)
        if (t > until || canEat) { clearBubble('zz'); if (!calm && !canEat) { mode = 'stretch'; until = t + 1700; } else decide(); }
      } else if (mode === 'look') {
        // оглядывается: влево, вправо, вверх и снова прямо
        const seq = ['left', 'left', 'right', 'right', 'up', 'open'];
        rows = sitRows(seq[Math.min(seq.length - 1, Math.floor((t - lookT0) / 420))]);
        if (t > until) { mode = 'sit'; until = t + 2000 + Math.random() * 2500; }
      } else if (mode === 'spin') {
        // кружится: за хвостом или перед сном (как устраивается). Разворот каждые 140 мс
        rows = frame % 2 ? WALK_B : WALK_A;
        dir = Math.floor((t - spinT0) / 140) % 2 ? 1 : -1;
        if (t > until) {
          if (spinThen === 'sleep') { spinThen = ''; mode = 'sleep'; until = t + 10000 + Math.random() * 15000; }
          else { mode = 'sit'; until = t + 2500 + Math.random() * 2000; hop(); }
        }
      } else if (mode === 'loaf') {
        rows = frame % 24 === 23 ? LOAF_BLINK : LOAF;
        if (t > until || canEat) decide();
      } else if (mode === 'wash') {
        rows = Math.floor(frame / 2) % 2 ? WASH_B : WASH_A;
        if (t > until) { mode = 'sit'; until = t + 2000 + Math.random() * 3000; }
      } else if (mode === 'yawn') {
        rows = t > until - 1200 && t < until - 250 ? YAWN : BLINK;
        if (t > until) { if (Math.random() < 0.4) act('loaf', t); else { mode = 'sit'; until = t + 2500 + Math.random() * 3000; } }
      } else if (mode === 'stretch') {
        rows = STRETCH;
        if (t > until) act('walk', t);
      } else if (mode === 'scratch') {
        rows = frame % 2 ? SCRATCH : STRETCH;
        if (t > until) { mode = 'sit'; until = t + 2500 + Math.random() * 2500; }
      } else if (mode === 'roll') {
        // перекатывается на спину (поворот спрайта шагами), болтает лапами в воздухе, встаёт
        if (roll.ph === 'over') { rows = SIT; if (t > roll.t) roll = { ph: 'belly', t: t + 2500 + Math.random() * 2500 }; }
        else if (roll.ph === 'belly') { rows = Math.floor(frame / 2) % 2 ? WALK_B : WALK_A; if (t > roll.t) { cat.classList.remove('belly'); roll = { ph: 'back', t: t + 450 }; } }
        else { rows = SIT; if (t > roll.t) { cat.classList.remove('rolling'); roll = null; mode = 'sit'; until = t + 2500; } }
      } else if (mode === 'edge') {
        // сидит на краю карточки и болтает лапами
        rows = frame % 20 === 19 ? EDGE_BLINK : Math.floor(frame / 4) % 2 ? EDGE_B : EDGE;
        if (t > until || canEat) decide();
      } else if (mode === 'scared') {
        rows = SCARED;
        if (t > until) {
          // отбегает подальше от курсора и косится на него
          if (calm) { mode = 'sit'; until = t + 3000; }
          else {
            const [a, b] = bounds(surf), away = mouse.x > x + size.w / 2 ? -1 : 1;
            mode = 'run'; runMood = 'wary'; target = clamp(x + away * (140 + Math.random() * 90), a, b);
            if (Math.abs(target - x) < 20) { mode = 'sit'; until = t + 3000; runMood = ''; }
          }
        }
      } else if (mode === 'sneeze') {
        rows = t < sneezeAt ? (frame % 2 ? BLINK : SIT) : SNEEZE;
        if (sneezeAt && t >= sneezeAt) { sneezeAt = 0; hop(); say('achoo'); }
        if (t > until) { mode = 'sit'; until = t + 2500 + Math.random() * 2000; }
      } else if (mode === 'purr') {
        rows = Math.floor(frame / 3) % 2 ? PURR_B : PURR;
        if (t > until) { mode = 'sit'; until = t + 3000 + Math.random() * 3000; }
      } else {
        rows = sitFrame(t);
        if (t > until) decide();
      }
    }
    if (mode !== 'sleep') clearBubble('zz');
    // понюхал пустую миску — думает о еде; голоден, а корма нет ни в миске, ни на полу — тоже (по несколько секунд, с перерывами)
    if (t < thinkUntil && mode === 'sit') { if (!bubble) say('think'); }
    else if (hungry && !foodAvail() && ['sit', 'walk', 'loaf'].includes(mode)) { if (frame % 40 < 18) { if (!bubble) say('think'); } else clearBubble('think'); }
    else clearBubble('think');
    if (toy) moveToy(t, dt);

    const s = sprite(rows, K);
    if (shown !== s) { body.innerHTML = s.svg; shown = s; }
    if (rows === WALK_A || rows === WALK_B) size = { w: s.cw, h: s.ch };
    // спрайты нарисованы мордой вправо, спящий — влево
    if (!['walk', 'run', 'goEat', 'stalk', 'play'].includes(mode)) faced = dir;
    const face = rows.head && rows.head.face === 'l' ? -1 : 1;
    cat.classList.toggle('flip', dir * face < 0);
    if (mode !== 'jump' && cat.classList.contains('flipjump')) cat.classList.remove('flipjump');
    if (mode !== 'drag' && mode !== 'fall' && mode !== 'jump' && mode !== 'climb') {
      const [a, b] = surf ? bounds(surf) : [6, innerWidth - s.cw - 6];
      x = Math.max(a, Math.min(b, x));
    }
    // лапы — на линии y; свесил лапы — часть кадра ниже неё; на спине — поле под наряд оказывается внизу
    const ty = y - s.h + (rows.drop || 0) * K + (roll && cat.classList.contains('belly') ? s.oy : 0);
    cat.style.transform = `translate(${Math.round(x - s.ox)}px, ${Math.round(ty)}px)`;
    if (t - saveT > 15000) { saveT = t; save(); }
    if (cardOn && t - cardAt > 500) { cardAt = t; cardRefresh(); } // голод, лоток, настроение меняются сами
  }

  // ---------- скины, миски и еда: что своё и выбор в Настройках ----------
  // своё знает магазин (CasualShop.owned('vasyan.skin.<id>' / 'vasyan.outfit.<id>' / 'vasyan.bowl.<id>' / 'vasyan.food.<id>')):
  // куплено, еда — ещё и открыта уровнем, миска — тайным достижением. classic, none, стальная миска и сухой корм — у всех;
  // пока магазина на странице нет — доступно всё
  const shopOn = () => !!(window.CasualShop && typeof window.CasualShop.owned === 'function');
  const FREE = new Set(['skin.classic', 'outfit.none', 'food.kibble', 'bowl.steel', 'box.blue']);
  function owned(kind, id) {
    if (FREE.has(kind + '.' + id) || !shopOn()) return true;
    try { return !!window.CasualShop.owned('vasyan.' + kind + '.' + id); } catch (e) { return true; }
  }
  // за какое обычное достижение миска или лоток — знает магазин ('' — не знает)
  const achOf = (kind, id) => { try { return (window.CasualShop && typeof window.CasualShop.achOf === 'function' && String(window.CasualShop.achOf('vasyan.' + kind + '.' + id) || '')) || ''; } catch (e) { return ''; } };
  const escH = (v) => (window.CasualUtil && window.CasualUtil.esc ? window.CasualUtil.esc(v) : String(v).replace(/[&<>"']/g, ''));
  // с какого уровня открывается еда — знает магазин (0 — не знает)
  const unlockAt = (id) => { try { return (window.CasualShop && typeof window.CasualShop.unlockAt === 'function' && +window.CasualShop.unlockAt('vasyan.food.' + id)) || 0; } catch (e) { return 0; } };
  // надетое, но не своё — снять (когда магазин уже знает покупки: ready не false)
  function enforceOwned() {
    if (!shopOn() || !own()) return;
    let changed = false;
    if (!owned('skin', coat.id)) { coat = COATS[0]; st.skin = coat.id; changed = true; }
    if (!owned('outfit', outfit.id)) { outfit = OUTFITS[0]; st.outfit = outfit.id; changed = true; }
    if (!owned('food', st.food)) { st.food = FOODS[0].id; changed = true; drawBowl(); }
    if (!owned('bowl', bowlSkin.id)) { bowlSkin = BOWLS[0]; st.bowlSkin = bowlSkin.id; changed = true; drawBowl(); }
    if (!owned('box', boxSkin.id)) { boxSkin = BOXES[0]; st.boxSkin = boxSkin.id; changed = true; drawBox(); }
    if (changed) { save(); shown = null; }
  }
  const LOCK = '<svg class="vy-lock" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function paintSkins(box) {
    if (!css.isConnected) document.head.appendChild(css);
    box.dataset.vyFilled = '1';
    // lock: 'secret' — за тайное достижение, 'ach' — за обычное (подпись — его название); в магазине их не купить,
    // кнопки «В магазин» нет
    const tile = (kind, id, name, svg, lock) => {
      if (!owned(kind, id)) {
        const lv = kind === 'food' ? unlockAt(id) : 0, ach = lock === 'ach' ? achOf(kind, id) : '';
        const note = lock === 'secret' ? '<span class="vy-sk-lv">Тайное достижение</span>'
          : lock === 'ach' ? `<span class="vy-sk-lv">За достижение${ach ? ` «<span>${escH(ach)}</span>»` : ''}</span>`
          : lv ? `<span class="vy-sk-lv">С ${lv}-го уровня</span>` : '';
        return `<div class="vy-sk locked"><span class="vy-sk-pic">${svg}</span><span class="vy-sk-n">${LOCK}${name}</span>${note}${lock ? '' : '<button type="button" class="vy-sk-shop" data-vy-shop>В магазин</button>'}</div>`;
      }
      const on = kind === 'skin' ? id === coat.id : kind === 'outfit' ? id === outfit.id : kind === 'bowl' ? id === bowlSkin.id : kind === 'box' ? id === boxSkin.id : id === st.food;
      return `<button type="button" class="vy-sk" data-vy-${kind}="${id}" aria-pressed="${on}"><span class="vy-sk-pic">${svg}</span><span class="vy-sk-n">${name}</span></button>`;
    };
    const group = (title, label, html) => `<div class="vy-sk-g"><span class="vy-sk-t">${title}</span><div class="vy-sk-row" role="group" aria-label="${label}">${html}</div></div>`;
    box.innerHTML = '<div class="vy-skins">'
      + group('Окрас', 'Окрас Васяна', COATS.map((c) => tile('skin', c.id, c.name, sprite(SIT, 2, true, c.id, outfit.id).svg)).join(''))
      + group('Наряд', 'Наряд Васяна', OUTFITS.map((o) => tile('outfit', o.id, o.name, sprite(SIT, 2, true, coat.id, o.id).svg)).join(''))
      + group('Миска', 'Миска Васяна', BOWLS.map((b) => tile('bowl', b.id, b.name, sprite(bowlRows(0, FOODS[0], b), 3).svg, b.secret ? 'secret' : b.ach ? 'ach' : '')).join(''))
      + group('Лоток', 'Лоток Васяна', BOXES.map((b) => tile('box', b.id, b.name, sprite(boxRows(0, b), 3).svg, b.ach ? 'ach' : '')).join(''))
      + group('Еда', 'Еда Васяна', FOODS.map((f) => tile('food', f.id, f.name, sprite(f.rows, 3).svg)).join(''))
      + '</div>';
  }
  const repaintSkins = () => document.querySelectorAll('[data-vasyan-skins]').forEach(paintSkins);
  function applyLook() { shown = null; drawBowl(); repaintSkins(); }
  function setSkin(id) { if (!owned('skin', id)) return false; coat = coatOf(id); st.skin = coat.id; save(); applyLook(); return true; }
  function setOutfit(id) { if (!owned('outfit', id)) return false; outfit = outfitOf(id); st.outfit = outfit.id; save(); applyLook(); return true; }
  // насыпать другую еду: что было в миске, то и остаётся по количеству, но уже новая
  function setFood(id) { if (!FOODS.some((f) => f.id === id) || !owned('food', id)) return false; st.food = id; save(); applyLook(); if (bubble && bubble.classList.contains('think')) say('think'); return true; }
  // другой лоток: те же кучки, то же место
  function setBox(id) { if (!BOXES.some((b) => b.id === id) || !owned('box', id)) return false; boxSkin = boxSkinOf(id); st.boxSkin = boxSkin.id; save(); boxSpr = null; drawBox(); repaintSkins(); return true; }
  // другая миска: та же еда, то же место (лежит вверх дном — так и лежит, только другая)
  function setBowl(id) { if (!BOWLS.some((b) => b.id === id) || !owned('bowl', id)) return false; bowlSkin = bowlOf(id); st.bowlSkin = bowlSkin.id; save(); applyLook(); return true; }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-vy-skin], [data-vy-outfit], [data-vy-bowl], [data-vy-box], [data-vy-food], [data-vy-shop]');
    if (!b) return;
    if (b.hasAttribute('data-vy-shop')) { if (window.CasualShop && typeof window.CasualShop.open === 'function') window.CasualShop.open('vasyan'); return; }
    if (b.dataset.vySkin) setSkin(b.dataset.vySkin); else if (b.dataset.vyOutfit) setOutfit(b.dataset.vyOutfit); else if (b.dataset.vyBowl) setBowl(b.dataset.vyBowl); else if (b.dataset.vyBox) setBox(b.dataset.vyBox); else setFood(b.dataset.vyFood);
  });
  // магазин загрузился или что-то купили (или уровень открыл еду) — проверить своё и перерисовать выбор
  document.addEventListener('casualhub:shop', () => { enforceOwned(); repaintSkins(); });
  // картинка для карточки в магазине: окрас — без наряда, наряд — на «Классике», еда — в стальной миске,
  // миска — с сухим кормом. Вид — из id (vasyan.<вид>.<id>): у еды и мисок бывают одинаковые короткие id
  function preview(id, k = 3) {
    const m = /^vasyan\.(skin|outfit|food|bowl|box)\.(.+)$/.exec(String(id || ''));
    const kind = m ? m[1] : '', bare = m ? m[2] : String(id || '');
    if ((!kind || kind === 'skin') && COATS.some((c) => c.id === bare)) return sprite(SIT, k, true, bare, 'none').svg;
    if ((!kind || kind === 'outfit') && OUTFITS.some((o) => o.id === bare)) return sprite(SIT, k, true, 'classic', bare).svg;
    if ((!kind || kind === 'food') && FOODS.some((f) => f.id === bare)) return sprite(bowlRows(2, foodOf(bare), BOWLS[0]), k, true, 'classic', 'none').svg;
    if (kind === 'bowl' && BOWLS.some((b) => b.id === bare)) return sprite(bowlRows(2, FOODS[0], bowlOf(bare)), k, true, 'classic', 'none').svg;
    if (kind === 'box' && BOXES.some((b) => b.id === bare)) return sprite(boxRows(0, boxSkinOf(bare)), k, true, 'classic', 'none').svg;
    return '';
  }
  // окно Настроек рисуется позже: ждём блок data-vasyan-skins (только у хозяина; свои кадры Васяна не считаем)
  let mo = null;
  function watchSkins() {
    if (mo || !own() || !document.body) return;
    const fill = () => document.querySelectorAll('[data-vasyan-skins]:not([data-vy-filled])').forEach(paintSkins);
    fill();
    mo = new MutationObserver((list) => {
      for (const m of list) {
        if (!m.addedNodes.length || (m.target.closest && m.target.closest('.vy-cat, .vy-bowl, .vy-toy, .vy-spill'))) continue;
        fill(); return;
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  // выбор в другой вкладке — сразу и здесь
  addEventListener('storage', (e) => {
    // вошли, вышли или сменили аккаунт в другой вкладке — Васян здесь тоже появляется или уходит
    if (e.key === null || ['casualhub.vasyan.own', 'ocenshik.user.v1', 'casualhub.tokens.v1'].includes(e.key)) {
      if (own() && !st.off) { watchSkins(); mount(); } else unmount();
      if (e.key !== null) return;
    }
    if (e.key !== KEY || !e.newValue) return;
    try { adopt(JSON.parse(e.newValue) || {}); } catch (er) {}
  });
  // запись другой вкладки (v) — сюда. Берётся только то, что в записи есть: вкладка со старым vasyan.js пишет состояние
  // без миски, лотка, рассыпанного и кучек — эти поля от её записи не меняются
  function adopt(v) {
    const was = { ...dirty }; // то, что здесь достроится и уберётся по чужой записи, — не «меняла эта вкладка»
    const food = typeof v.food === 'string' ? foodOf(v.food).id : st.food; // старая вкладка пишет в food число — его не трогаем
    const bs = 'bowlSkin' in v ? bowlOf(v.bowlSkin).id : bowlSkin.id, xs = 'boxSkin' in v ? boxSkinOf(v.boxSkin).id : boxSkin.id;
    if ((v.skin || 'classic') !== coat.id || (v.outfit || 'none') !== outfit.id || food !== st.food || bs !== bowlSkin.id || xs !== boxSkin.id) {
      st.skin = v.skin; st.outfit = v.outfit; st.food = food; st.bowlSkin = bs; st.boxSkin = xs;
      coat = coatOf(v.skin); outfit = outfitOf(v.outfit); bowlSkin = bowlOf(bs); boxSkin = boxSkinOf(xs); boxSpr = null; drawBox(); applyLook();
    }
    // голод, злость, когда в лоток, сколько погладили — как там
    for (const k of ['hunger', 'anger', 'pooAt', 'pets', 'bond']) if (Number.isFinite(+v[k])) st[k] = +v[k];
    cardRefresh(); // отношения поменялись в другой вкладке — карточка как там
    // насыпали, перевернули, убрали — здесь та же миска и тот же лоток
    const portions = Math.max(0, Math.min(3, +v.bowl || 0)), flip = 'flip' in v ? !!v.flip : !!st.flip;
    if (portions !== st.bowl || flip !== !!st.flip || (+v.seed >>> 0) !== st.seed) {
      st.bowl = portions; st.flip = flip; st.seed = (+v.seed >>> 0) || st.seed;
      if (bw.mode === 'rest' || bw.mode === 'slide') { bw.flip = st.flip; drawBowl(); }
    }
    const n = v.box ? Math.max(0, Math.min(4, Math.round(+v.box.n || 0))) : st.box.n;
    if (n !== st.box.n) { st.box.n = n; drawBox(); }
    // где миска и лоток стоят на полу — как там; здесь вещь переезжает, только если сама стоит на полу в покое
    if (v.bx != null && Number.isFinite(+v.bx) && +v.bx !== st.bx) { st.bx = +v.bx; if (alive && bw.mode === 'rest' && !bw.s) setOn(bw, null, st.bx); }
    if (v.box && v.box.x != null && Number.isFinite(+v.box.x) && +v.box.x !== st.box.x) { st.box.x = +v.box.x; if (alive && lt.mode === 'rest' && !lt.s) setOn(lt, null, st.box.x); }
    // рассыпанное (кучку узнаём по зерну) и кучки мимо лотка (по id): убрали или съели там — нет и здесь, появились
    // там — появляются и здесь (у миски, у лотка на полу). Васяна на странице нет — просто запоминаем
    if (Array.isArray(v.spill)) {
      const sp = normSpill(v.spill);
      if (!alive) st.spill = sp;
      else {
        for (const q of [...sps]) {
          const w = sp.find((u) => u.seed === q.seed);
          if (!w) { q.el.remove(); q.n = 0; sps = sps.filter((u) => u !== q); } else if (w.n !== q.n || w.food !== q.food) { q.n = w.n; q.food = w.food; drawSpill(q); }
        }
        for (const w of sp) if (!sps.some((q) => q.seed === w.seed)) makeSpill(1, w.food, w.seed, sps.length);
        keepSpills();
      }
    }
    if (Array.isArray(v.poos)) {
      const pp = normPoos(v.poos.filter((q) => q && (+q.id >>> 0)));
      if (!alive) st.poos = pp;
      else {
        for (const q of [...poos]) if (!pp.some((u) => u.id === q.id)) { q.el.remove(); poos = poos.filter((u) => u !== q); }
        for (const w of pp) if (!poos.some((q) => q.id === w.id)) makePoo(null, w.x, w.id);
        keepPoos();
      }
    }
    Object.assign(dirty, was);
    // выключили в Настройках другой вкладки
    if (!!v.off !== !!st.off) {
      st.off = !!v.off;
      if (st.off) unmount(); else if (own()) mount();
      document.querySelectorAll('[data-vasyan]').forEach((c) => { c.checked = !st.off; });
    }
  }
  // вкладка могла пропустить чужие записи (спала в фоне, вернулась из кэша «назад»): снова на виду — сверить с тем, что записано
  const resync = () => { try { const raw = localStorage.getItem(KEY); if (raw) adopt(JSON.parse(raw) || {}); } catch (er) {} };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
  addEventListener('pageshow', (e) => { if (e.persisted) resync(); });

  // ---------- включение и выключение ----------
  // хозяин и вошёл в аккаунт: флаг ставит levels-ui.js по ответу /levels/me
  const own = () => {
    try {
      if (localStorage.getItem('casualhub.vasyan.own') !== '1') return false;
      const u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null');
      return !!(u && (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || 'null') || {})[u.id]);
    } catch (e) { return false; }
  };
  const start = () => { enforceOwned(); watchSkins(); if (!st.off && own()) mount(); };
  document.addEventListener('casualhub:vasyan', () => { if (own()) watchSkins(); if (own() && !st.off) mount(); else unmount(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  addEventListener('resize', () => {
    if (!alive) return;
    measure();
    for (const o of [bw, lt, ...sps, ...poos]) if (o.mode === 'rest' || o.mode === 'slide') setOn(o, o.s && o.s.isConnected ? o.s : null, o.x);
  });
  addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
  addEventListener('pagehide', () => { if (alive) save(); });
  // вернулся на вкладку после перерыва — котик радуется: подпрыгивает и сердечки (спящего не будит)
  let awayAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { awayAt = Date.now(); return; }
    if (!alive || !cat || !awayAt || Date.now() - awayAt < 30000 || BUSY.includes(mode) || mode === 'sleep' || grumpy()) return;
    awayAt = 0;
    hop(); hearts(2); say('love');
    if (['sit', 'loaf', 'look', 'walk'].includes(mode)) { mode = 'sit'; until = performance.now() + 3000; }
  });
  // позвали в чате (в сообщении есть «васян», событие шлёт chat.js): ушки на макушке — подпрыгнул, «мяу?», посмотрел
  // вверх, повернулся к чату и бежит к нему: запрыгивает на карточку чата, если её верх виден и на него можно встать,
  // иначе подбегает по своей плитке (или полу) под чат. Чат не виден (другая вкладка страницы, прокручен) или
  // «меньше движения» — только отзывается на месте. Ест — отзывается, но от миски не уходит. Не чаще раза в 5 с
  let callT = 0, callTimer = 0;
  function called(d) {
    if (!alive || !cat) return;
    const t = performance.now();
    if (t - callT < 5000) { if (!BUSY.includes(mode)) hop(); return; }
    callT = t;
    clearTimeout(callTimer);
    if (mode === 'drag') { say('meow'); return; } // в руках — только отзывается
    // в прыжке, падает или вскарабкивается — отзовётся, когда встанет на лапы
    if (BUSY.includes(mode) || mode === 'prep') { callTimer = setTimeout(() => { callT = 0; called(d); }, 700); return; }
    if (grumpy()) { hop(); say('hmph'); if (!['eat', 'goEat', 'litter', 'squat'].includes(mode)) { dir = -dir; faced = dir; } return; }
    hop(); say('meow');
    if (['eat', 'goEat', 'scared', 'litter', 'refuse', 'squat', 'hiss'].includes(mode)) return;
    stopPlay();
    const el = d && d.el && d.el.isConnected ? d.el : null, r = el && el.getBoundingClientRect();
    const seen = !!(r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight);
    if (seen) { dir = r.left + r.width / 2 > x + size.w / 2 ? 1 : -1; faced = dir; }
    mode = 'look'; lookT0 = t - 4 * 420; until = t + 900; // сразу «вверх»: ушки на макушке
    if (calm || !seen) return;
    callTimer = setTimeout(() => toChat(el), 650);
  }
  function toChat(el) {
    if (!alive || !cat || !el.isConnected || BUSY.includes(mode) || mode === 'prep' || mode === 'eat' || mode === 'goEat') return;
    const r = el.getBoundingClientRect(), tx = r.left + r.width / 2 - size.w / 2;
    // карточку чата проверяем саму: в общем списке её может заменить внешний блок с тем же верхним краем.
    // Уже стоит на этом краю (на ней или на таком блоке) — не прыгает, а идёт по нему
    const onIt = surf === el || (surf && Math.abs(surfTop(surf) - r.top) < 6);
    if (!onIt && platOf(el)) { after = 'called'; prepJump(el, tx, 300); return; }
    const [a, b] = bounds(surf), goal = clamp(tx, a, b);
    if (Math.abs(goal - x) < 6) { mode = 'sit'; until = performance.now() + 4500; hearts(3); say('love'); return; }
    mode = 'run'; runMood = ''; target = goal; // добежит — сядет с сердечком (как всегда после бега)
  }
  document.addEventListener('casualhub:vasyan-call', (e) => called(e.detail));

  // прокрутка страницы: вниз — котик спрыгивает на плитку ниже (а с нижней — на пол), вверх — запрыгивает на ближайшую
  // плитку выше, не дальше REACH за прыжок (по плиточкам, а не сразу наверх). Домотали до самого верха — приходит
  // в профиль: садится на низ баннера рядом с аватаркой. Не чаще раза в ~0,6 с, не посреди прыжка и не когда его держат;
  // при «меньше движения» — как раньше
  let scrollY0 = scrollY, scrollHop = 0, scrollLook = 0;
  addEventListener('scroll', () => {
    const dy = scrollY - scrollY0;
    scrollY0 = scrollY;
    if (!alive || !cat || calm || Math.abs(dy) < 2) return;
    const t = performance.now();
    // очень резкая прокрутка (рывок колесом или «в начало») — иногда пугается: хвост трубой, «!»
    if (Math.abs(dy) > 900 && !BUSY.includes(mode) && mode !== 'scared' && Math.random() < 0.35) { stopPlay(); scrollHop = t; scare(t); return; }
    if (t - scrollHop < 600 || ['drag', 'jump', 'climb', 'fall', 'prep', 'eat', 'goEat', 'sniff', 'push', 'scared', 'litter', 'refuse', 'squat', 'hiss'].includes(mode)) return;
    if ((dy > 0 && !surf) || t - scrollLook < 160) return; // на полу и листают вниз — прыгать некуда; площадки ищем не на каждое событие
    scrollLook = t;
    const cx = x + size.w / 2, near = (p) => Math.abs((p.r.left + p.r.right) / 2 - cx);
    const ps = platforms().filter((p) => p.el !== surf && near(p) < 700);
    let next;
    if (dy > 0) next = ps.filter((p) => !p.seat && p.top > y + 20).sort((a, b) => a.top - b.top || near(a) - near(b))[0];
    else {
      // наверху страницы — место в профиле (если оно есть и котик ещё не там), иначе ближайшая плитка выше в пределах прыжка
      const seat = scrollY < 40 && !isSeat(surf) ? ps.find((p) => p.seat) : null;
      next = seat || ps.filter((p) => !p.seat && p.top < y - 30 && p.top >= y - REACH).sort((a, b) => b.top - a.top || near(a) - near(b))[0];
    }
    if (!next && (dy < 0 || !surf)) return; // выше прыгать некуда / уже на полу
    scrollHop = t;
    stopPlay(); clearBubble('zz');
    jumpTo(next ? next.el : null, x); // место на плитке — ближе к тому, где стоял (bounds в jumpTo)
  }, { passive: true });
  // переключатель в Настройках → Внешний вид
  document.addEventListener('change', (e) => {
    const c = e.target.closest && e.target.closest('[data-vasyan]');
    if (!c) return;
    st.off = !c.checked; save();
    if (st.off) unmount(); else mount();
    document.querySelectorAll('[data-vasyan]').forEach((x) => { x.checked = c.checked; });
  });
  // skins — все окрасы, наряды, миски и еда для магазина: { id, kind: 'skin' | 'outfit' | 'bowl' | 'food', name };
  // preview(id) — svg для карточки. act(вид) — показать повадку сразу (для проверки): sit, walk, jump, loaf, sleep, wash,
  // yawn, stretch, scratch, sneeze, roll, play, edge (только на карточке), scared, push (миска рядом, там же, где он)
  const kindOf = (id) => {
    const m = /^vasyan\.(skin|outfit|food|bowl|box)\./.exec(String(id || ''));
    if (m) return m[1];
    return COATS.some((c) => c.id === id) ? 'skin' : FOODS.some((f) => f.id === id) ? 'food' : BOWLS.some((b) => b.id === id) ? 'bowl' : BOXES.some((b) => b.id === id) ? 'box' : 'outfit';
  };
  // для игр на холсте (games/catch): кадр Васяна или еда пиксельной сеткой — { w, h, px }, px[y][x] — цвет CSS или null.
  // name — кадр из PIX или id еды из FOODS («food.» в начале можно); { coat, outfit } — id окраса и наряда, без них —
  // «Классика» без наряда (свой окрас и наряд страница берёт из skin() и outfit(), если own()). Только чтение: сетка каждый раз новая
  const PIX = { walkA: WALK_A, walkB: WALK_B, jump: JUMP, sit: SIT, blink: BLINK, purr: PURR, eatA: EAT_A, eatB: EAT_B, scared: SCARED, hang: HANG, hangB: HANG_B, heart: HEART };
  function pixels(name, o) {
    const id = String(name || '').replace(/^food\./, '');
    const rows = Object.prototype.hasOwnProperty.call(PIX, id) ? PIX[id] : FOODS.some((f) => f.id === id) ? foodOf(id).rows : null;
    if (!rows) return null;
    const { g, W, H } = cells(rows, true, coatOf(o && o.coat), outfitOf(o && o.outfit));
    return { w: W, h: H, px: g };
  }
  window.CasualVasyan = {
    pixels,
    on: () => !st.off, own,
    skins: [...COATS.map((c) => ({ id: c.id, kind: 'skin', name: c.name })), ...OUTFITS.map((o) => ({ id: o.id, kind: 'outfit', name: o.name })),
      ...BOWLS.map((b) => ({ id: b.id, kind: 'bowl', name: b.name })), ...BOXES.map((b) => ({ id: b.id, kind: 'box', name: b.name })),
      ...FOODS.map((f) => ({ id: f.id, kind: 'food', name: f.name }))],
    preview, owned: (id) => owned(kindOf(id), String(id || '').replace(/^vasyan\.(skin|outfit|food|bowl|box)\./, '')),
    skin: () => coat.id, outfit: () => outfit.id, food: () => st.food, bowl: () => bowlSkin.id, box: () => boxSkin.id, setSkin, setOutfit, setFood, setBowl, setBox,
    act: (k) => { if (alive && !BUSY.includes(mode)) act(k); },
    bond: bondInfo, // отношения: { v, lv, name, text, next, levels } — магазин; меняются — событие casualhub:vasyan-bond
  };
})();
