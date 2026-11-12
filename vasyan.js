/* Казуал Хаб: котик Васян живёт на страницах сайта — только у своих 10 хозяев.
   Это подарок «Первой десятке» (первые 10 аккаунтов): письмо в почте уровней, «Забрать котика».
   Хозяин ли этот браузер, помнит levels-ui.js (casualhub.vasyan.own) и шлёт событие casualhub:vasyan.
   Как Shimeji: ходит не только по низу экрана, но и по верхним краям карточек и блоков, прыгает между ними,
   падает, если блок уехал при прокрутке; его можно схватить мышкой (висит за шкирку) и бросить — упадёт на то, что ниже.
   Как oneko: остановил курсор — может прибежать к нему или подкрасться и прыгнуть. Клик — погладить (мурчит, сердечки),
   много кликов подряд — пугается. Спит — Zzz, ест из серой миски в левом нижнем углу (корм — кликом по миске),
   голоден при пустой миске — думает о рыбке. Голод копится и между заходами (localStorage, только в этом браузере).
   Ещё повадки: смотрит на курсор, машет хвостом, умывается, зевает, чихает, потягивается, точит когти, лежит буханкой,
   перекатывается на спину, сидит на краю карточки свесив лапы, играет с клубком или игрушечной мышкой.
   Скины: окрас (палитра шерсти, глаз и носа) и наряд (слой поверх головы); ещё еда — что лежит в миске и о чём он
   думает, когда голоден (сухой корм у всех, остальная открывается по одной за уровень или покупается в магазине).
   Выбор — в Настройках → Внешний вид: этот файл сам заполняет блок data-vasyan-skins. Хранится в casualhub.vasyan.v1
   (skin, outfit, food; порции в миске — bowl) и сразу доходит до других вкладок.
   Выключается там же («Котик Васян на сайте», data-vasyan). При «меньше движения» не ходит, не прыгает и не кувыркается.
   Спрайты — пиксельные сетки ниже, контур дорисовывается сам; картинок не грузит. Подключает util.js. */
(() => {
  if (window.CasualVasyan || /^\/(admin|r)\//.test(location.pathname)) return;
  const KEY = 'casualhub.vasyan.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    { id: 'kibble', name: 'Сухой корм', pal: { b: '#A8693A', c: '#D39A5E' }, g: ['.bb..bb.', 'bcbbbbcb', 'bbb.bbbb', '.bbbcb..', '..bbb...'] },
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
  // серая металлическая миска с бликом; в ней — выбранная еда: сухой корм горкой, остальное картинками
  // (одна, две рядом, три — горкой), нижний ряд картинки лежит на кромке миски
  const BOWL_RIM = 'GLLLLLLLLLLLLLLLLG', BOWL_EMPTY = 'GLLHHHHHHHHHHHHLLG', BLANK = '..................';
  const BOWL_BODY = ['GIIILLLLLLLLLLLLLG', '.GLILLLLLLLLLLLLG.', '..GGLLLLLLLLLLGG..', '...HGGGGGGGGGGH...', '....HHHHHHHHHH....'];
  const KIBBLE_PILE = ['.......JF.J.......', '....FJFJFJFJFJ....', '..JFJFJFJFJFJFJF..'];
  function bowlRows(n, f) {
    if (!n) return [BLANK, BLANK, BLANK, BOWL_EMPTY, ...BOWL_BODY];
    if (f.id === 'kibble') return [n >= 3 ? KIBBLE_PILE[0] : BLANK, n >= 2 ? KIBBLE_PILE[1] : BLANK, KIBBLE_PILE[2], BOWL_RIM, ...BOWL_BODY];
    const g = f.g, w = Math.max(...g.map((r) => r.length)), h = g.length, mid = Math.floor((18 - w) / 2);
    // широкая еда (сосиска, арбуз) рядом не помещается — кладётся стопкой
    const spots = w > 8 ? Array.from({ length: n }, (_, i) => [mid + (i % 2), i * 2])
      : n === 1 ? [[mid, 0]] : [[1, 0], [17 - w, 0]];
    if (n >= 3 && w <= 8) spots.push([mid, h - 2]);
    const up = Math.max(...spots.map((s) => s[1])) + h - 1;
    const grid = Array.from({ length: up + 1 + BOWL_BODY.length }, () => Array(18).fill('.'));
    [BOWL_RIM, ...BOWL_BODY].forEach((r, i) => { [...r].forEach((ch, x) => { grid[up + i][x] = ch; }); });
    for (const [sx, lift] of spots) g.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && sx + x >= 0 && sx + x < 18) grid[up - lift - (h - 1) + y][sx + x] = ch; }));
    return Object.assign(grid.map((r) => r.join('')), { pal: f.pal });
  }

  let coat = COATS[0], outfit = OUTFITS[0];
  const cache = new WeakMap();
  // кадр → svg. Пиксели одного цвета — одним path (подряд по строке — одним прямоугольником): меньше узлов при смене кадра.
  // Наряд дорисовывается поверх головы; если вылезает за кадр, поле расширяется — сверху и симметрично по бокам,
  // чтобы при развороте кот не съезжал. ox и oy — эти поля, cw и ch — размер самого кота
  function sprite(rows, k, outline = true, cId, oId) {
    const c = cId ? coatOf(cId) : coat, o = oId ? outfitOf(oId) : outfit;
    const key = k + '|' + outline + '|' + c.id + '|' + o.id;
    let m = cache.get(rows);
    if (!m) { m = new Map(); cache.set(rows, m); }
    let out = m.get(key);
    if (out) return out;
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
.vy-bowl { left: 10px; bottom: 6px; filter: drop-shadow(0 3px 0 rgb(0 0 0 / .18)); }
.vy-bowl.add svg { animation: vy-hop .3s steps(2, jump-none); }
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
@media (prefers-reduced-motion: reduce) { .vy-cat.land .vy-body, .vy-cat.flipjump .vy-body, .vy-dust, .vy-crumb, .vy-bowl.nom svg, .vy-cat.hop .vy-body, .vy-bowl.add svg, .vy-bub.zz, .vy-bub.love, .vy-bub.bang, .vy-bub.achoo, .vy-bub.purr, .vy-bub.yum, .vy-bub.meow, .vy-heart, .vy-plus { animation: none; } .vy-cat.rolling .vy-body { transition: none; } }
@media print { .vy-cat, .vy-bowl, .vy-toy { display: none; } }
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
  st.at = now0;
  coat = coatOf(st.skin); outfit = outfitOf(st.outfit);
  const save = () => { st.at = Date.now(); write(st); };

  let cat, body, bubble, bowl, alive = false, raf = 0;
  // положение: x — левый край, y — линия лап (в координатах окна). surf — блок, на котором стоит (null — пол)
  let x = 120, y = 0, vy = 0, dir = 1, mode = 'sit', until = 0, target = 0, frame = 0, lastFrame = 0, saveT = 0, floor = 0, lastT = 0;
  let surf = null, jump = null, after = null, prep = null, climb = null, thudT = 0, size = { w: 57, h: 39 };
  let mouse = { x: -1, y: -1, t: 0 }, chaseT = 0, measureT = 0;
  let press = null, dragged = false, shown = null, turnUntil = 0, faced = 1;
  let wagFrom = 0, wagUntil = 0, roll = null, toy = null, play = '', playT = 0, sneezeAt = 0, runMood = '', lastAct = '';
  // оглядывается, кружится (за хвостом и перед сном), жуёт: когда началось, что потом, на каком «укусе» сыпались крошки
  let lookT0 = 0, spinT0 = 0, spinThen = '', biteN = -1;
  const clicks = [];

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
    y = floorAt(x + 28); surf = null; shown = null;
    drawBowl(); decide();
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function unmount() {
    alive = false; cancelAnimationFrame(raf);
    stopPlay();
    if (cat) cat.remove(); if (bowl) bowl.remove();
    cat = bowl = bubble = null; roll = null;
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
    if (bowl) bowl.style.bottom = innerHeight - floorAt(10 + 9 * K) + 6 + 'px';
  }
  // линия пола под точкой x (в координатах окна)
  const floorAt = (px) => (cols.length ? cols[Math.max(0, Math.min(cols.length - 1, Math.floor(px / COL)))] : innerHeight) - 2;
  const mine = (el) => !!el && (el === cat || el === bowl || (cat && cat.contains(el)) || (bowl && bowl.contains(el)) || (toy && toy.el === el));
  const floorY = () => innerHeight - floor - 2;
  const bowlRight = () => 10 + 18 * K + 4;
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
  function platforms() {
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
    if (!s) return [bowlRight(), innerWidth - size.w - 6];
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

  // ---------- миска и ласка ----------
  function drawBowl() { if (bowl) bowl.innerHTML = sprite(bowlRows(st.bowl, foodOf(st.food)), K).svg; }
  function feed() {
    if (st.bowl >= 3) { say('love'); return; }
    st.bowl += 1; save(); drawBowl();
    bowl.classList.remove('add'); void bowl.offsetWidth; bowl.classList.add('add');
    const r = bowl.getBoundingClientRect();
    const p = document.createElement('span'); p.className = 'vy-plus'; p.textContent = '+1';
    p.style.left = r.left + r.width / 2 - 8 + 'px'; p.style.top = r.top - 18 + 'px';
    document.body.appendChild(p); setTimeout(() => p.remove(), 1000);
    if (st.hunger > 60 && !['eat', 'goEat', 'drag', 'fall', 'jump', 'climb', 'prep'].includes(mode)) goEat();
  }
  // крошки еды из миски, пока ест (цвета — из палитры еды), и миска подрагивает
  function crumbs() {
    if (!bowl) return;
    bowl.classList.remove('nom'); void bowl.offsetWidth; bowl.classList.add('nom');
    if (calm) return;
    const r = bowl.getBoundingClientRect(), cols = Object.values(foodOf(st.food).pal || {});
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
  // погладили: мурчит; гладят часто и много — пугается
  const BUSY = ['drag', 'fall', 'jump', 'climb'];
  function pet() {
    const t = performance.now();
    // уже напуган и удирает — ещё клик только подгоняет
    if (mode === 'scared' || (mode === 'run' && runMood)) { hop(); return; }
    clicks.push(t);
    while (clicks.length && t - clicks[0] > 2200) clicks.shift();
    if (clicks.length >= 5 && !BUSY.includes(mode)) { clicks.length = 0; scare(t); return; }
    st.pets = (+st.pets || 0) + 1; save();
    if (!BUSY.includes(mode)) { stopPlay(); mode = 'purr'; until = t + 2400 + clicks.length * 400; }
    hop();
    hearts(Math.min(4, 1 + clicks.length));
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
    press = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged = false;
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function move(e) {
    if (!press) return;
    if (!dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
    if (!dragged) { dragged = true; mode = 'drag'; jump = null; after = null; prep = null; climb = null; stopPlay(); clearBubble(); cat.classList.remove('flipjump'); cat.classList.add('drag'); }
    const s = sprite(HANG, K);
    x = e.clientX - s.cw / 2; y = e.clientY + s.ch - 6;
  }
  function up() {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    press = null;
    if (dragged) { cat.classList.remove('drag'); mode = 'fall'; vy = 0; surf = null; }
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
    const fx = x + size.w / 2;
    for (const dx of [-1, 1]) {
      const d = document.createElement('i');
      d.className = 'vy-dust';
      d.setAttribute('aria-hidden', 'true');
      d.style.left = Math.round(fx + dx * size.w * 0.3) + 'px';
      d.style.top = Math.round(y - 3) + 'px';
      d.style.setProperty('--dx', dx * 12 + 'px');
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 540);
    }
  }
  function goEat() {
    if (surf) { jumpTo(null, x); after = 'goEat'; return; }
    mode = 'goEat'; target = bowlRight() - 6;
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
    if (st.hunger > 60 && st.bowl > 0) { goEat(); return; }
    // при «меньше движения» — только спокойные позы на месте
    const opts = calm
      ? [['sit', 3], ['loaf', 2], ['sleep', 2], ['wash', 1.2], ['yawn', 0.6], ['look', 1]]
      : [['walk', 3.2], ['jump', 2.4], ['sit', 2], ['loaf', 1.3], ['sleep', 1], ['wash', 1], ['stretch', 0.7], ['scratch', 0.5],
        ['roll', 0.6], ['yawn', 0.5], ['sneeze', 0.25], ['look', 1.1], ['spin', 0.35], ['play', isSeat(surf) ? 0 : surf ? 0.4 : 0.7], ['edge', surf && !isSeat(surf) ? 1.8 : 0]];
    act(pick(opts), t);
  }
  function act(k, t = performance.now()) {
    lastAct = k;
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
      default: break;
    }
    mode = 'sit'; until = t + 3000 + Math.random() * 6000;
  }
  // как oneko: курсор остановился неподалёку — прибежать к нему, а то и подкрасться и прыгнуть
  function chase(t) {
    if (calm || !['sit', 'walk', 'loaf'].includes(mode) || t - chaseT < 7000) return;
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
    if (!s) return [bowlRight(), innerWidth - w - 6];
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
  const TXT = { zz: 'Zzz…', bang: '!', achoo: 'Апчхи!', purr: 'мрр…', meow: 'мяу?' };
  function say(kind) {
    if (!cat) return;
    if (bubble) bubble.remove();
    bubble = document.createElement('span');
    bubble.className = 'vy-bub ' + kind + (TXT[kind] ? ' txt' : '');
    if (kind === 'love') bubble.innerHTML = sprite(HEART, K * 0.9).svg;
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
    const eyes = frame % 18 === 17 ? 'blink' : lookEyes(t);
    return sitRows(eyes, 'base', tail);
  }

  // ---------- кадр ----------
  const GROUND = new Set(['look', 'spin', 'prep', 'sit', 'walk', 'run', 'sleep', 'goEat', 'eat', 'loaf', 'wash', 'yawn', 'stretch', 'scratch', 'roll', 'play', 'edge', 'stalk', 'wiggle', 'scared', 'sneeze', 'purr']);
  function land(s) {
    const air = mode === 'jump' || mode === 'fall';
    surf = s; y = surfTop(s); jump = null;
    if (air) thud();
    if (after === 'goEat') { after = null; mode = 'goEat'; target = bowlRight() - 6; }
    else if (after === 'caught') { after = null; mode = 'sit'; until = performance.now() + 3500; say('love'); }
    // позвали в чате и он запрыгнул к чату: сел, сердечки
    else if (after === 'called') { after = null; mode = 'sit'; until = performance.now() + 4500; hop(); hearts(3); say('love'); }
    else decide();
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
    chase(t);
    const hungry = st.hunger > 60;
    // кувырок прервали (схватили, упал, погладили) — сразу на лапы; игру тоже
    if (mode !== 'roll' && roll) { roll = null; cat.classList.remove('belly', 'rolling'); }
    if (mode !== 'play' && toy) stopPlay();

    // блок уехал при прокрутке или исчез — падаем
    if (GROUND.has(mode) && !surfaceOk(surf)) { mode = 'fall'; vy = 0; surf = null; clearBubble('zz'); }

    let rows;
    if (mode === 'drag') rows = frame % 4 < 2 ? HANG : HANG_B;
    else if (mode === 'fall') {
      const prev = y; vy = Math.min(1600, vy + 2200 * dt); y += vy * dt;
      rows = HANG_B;
      // приземлиться на блок, через верх которого пролетели, или на пол
      const cx = x + size.w / 2;
      const hit = platforms().find((p) => cx >= (p.seat ? seatLeft(p.r) : p.r.left) && cx <= p.r.right && p.top >= prev - 2 && p.top <= y); // в профиле — только правее аватарки
      if (hit) land(hit.el); else if (y >= floorAt(cx)) { x = Math.max(bowlRight(), x); land(null); }
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
        const dx = target - x; dir = dx >= 0 ? 1 : -1;
        // сменил направление — сначала разворачивается на месте, потом идёт мордой вперёд
        if (dir !== faced && Math.abs(dx) > 1) { faced = dir; turnUntil = t + 220; }
        const speed = mode === 'walk' ? 42 : mode === 'stalk' ? 30 : mode === 'play' ? 64 : 110;
        if (t >= turnUntil) x += dir * Math.min(Math.abs(dx), speed * dt);
        const low = mode === 'stalk' || mode === 'play';
        rows = t < turnUntil ? (low ? STALK_A : SIT) : low ? (frame % 2 ? STALK_B : STALK_A) : frame % 2 ? WALK_B : WALK_A;
        if (Math.abs(target - x) < 1.5) {
          if (mode === 'goEat') { mode = 'eat'; until = t + 3200; dir = -1; say('yum'); }
          else if (mode === 'run' && runMood === 'hunt') {
            // добежал до курсора поближе — дальше крадётся
            const [a, b] = bounds(surf), goal = clamp(mouse.x - size.w / 2, a, b);
            runMood = ''; mode = 'stalk'; target = goal - Math.sign(goal - x || 1) * 70;
          } else if (mode === 'run') { mode = 'sit'; until = t + (runMood ? 3000 : 4000); if (!runMood) say('love'); runMood = ''; }
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
        // ест: голова в миске, жуёт (голова вверх-вниз), на каждый укус — крошки и миска подрагивает
        const n = Math.floor(frame / 2);
        rows = n % 2 ? EAT_B : EAT_A; dir = -1;
        if (n % 2 && n !== biteN) { biteN = n; crumbs(); }
        // доел — облизывает лапу
        if (t > until) { st.bowl = Math.max(0, st.bowl - 1); st.hunger = Math.max(0, st.hunger - 70); save(); drawBowl(); clearBubble('think'); say('love'); mode = 'wash'; until = t + 1600 + Math.random() * 900; }
      } else if (mode === 'sleep') {
        rows = Math.floor(frame / 6) % 2 ? SLEEP_B : SLEEP;
        if (!bubble || !bubble.classList.contains('zz')) say('zz');
        // проснулся — потягивается (а голодный и с кормом — сразу к миске)
        if (t > until || (hungry && st.bowl > 0)) { clearBubble('zz'); if (!calm && !(hungry && st.bowl > 0)) { mode = 'stretch'; until = t + 1700; } else decide(); }
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
        if (t > until || (hungry && st.bowl > 0)) decide();
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
        if (t > until || (hungry && st.bowl > 0)) decide();
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
    // голоден, а корма нет: думает о рыбке (по несколько секунд, с перерывами)
    if (hungry && st.bowl === 0 && ['sit', 'walk', 'loaf'].includes(mode)) { if (frame % 40 < 18) { if (!bubble) say('think'); } else clearBubble('think'); }
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
      const [a, b] = surf ? bounds(surf) : [mode === 'eat' || mode === 'goEat' ? bowlRight() - 8 : bowlRight(), innerWidth - s.cw - 6];
      x = Math.max(a, Math.min(b, x));
    }
    // лапы — на линии y; свесил лапы — часть кадра ниже неё; на спине — поле под наряд оказывается внизу
    const ty = y - s.h + (rows.drop || 0) * K + (roll && cat.classList.contains('belly') ? s.oy : 0);
    cat.style.transform = `translate(${Math.round(x - s.ox)}px, ${Math.round(ty)}px)`;
    if (t - saveT > 15000) { saveT = t; save(); }
  }

  // ---------- скины и еда: что своё и выбор в Настройках ----------
  // своё знает магазин (CasualShop.owned('vasyan.skin.<id>' / 'vasyan.outfit.<id>' / 'vasyan.food.<id>')): куплено,
  // а еда — ещё и открыта уровнем. classic, none и сухой корм — у всех; пока магазина на странице нет — доступно всё
  const shopOn = () => !!(window.CasualShop && typeof window.CasualShop.owned === 'function');
  const FREE = new Set(['classic', 'none', 'kibble']);
  function owned(kind, id) {
    if (FREE.has(id) || !shopOn()) return true;
    try { return !!window.CasualShop.owned('vasyan.' + kind + '.' + id); } catch (e) { return true; }
  }
  // с какого уровня открывается еда — знает магазин (0 — не знает)
  const unlockAt = (id) => { try { return (window.CasualShop && typeof window.CasualShop.unlockAt === 'function' && +window.CasualShop.unlockAt('vasyan.food.' + id)) || 0; } catch (e) { return 0; } };
  // надетое, но не своё — снять (когда магазин уже знает покупки: ready не false)
  function enforceOwned() {
    if (!shopOn() || window.CasualShop.ready === false) return;
    let changed = false;
    if (!owned('skin', coat.id)) { coat = COATS[0]; st.skin = coat.id; changed = true; }
    if (!owned('outfit', outfit.id)) { outfit = OUTFITS[0]; st.outfit = outfit.id; changed = true; }
    if (!owned('food', st.food)) { st.food = FOODS[0].id; changed = true; drawBowl(); }
    if (changed) { save(); shown = null; }
  }
  const LOCK = '<svg class="vy-lock" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function paintSkins(box) {
    if (!css.isConnected) document.head.appendChild(css);
    box.dataset.vyFilled = '1';
    const tile = (kind, id, name, svg) => {
      if (!owned(kind, id)) {
        const lv = kind === 'food' ? unlockAt(id) : 0;
        return `<div class="vy-sk locked"><span class="vy-sk-pic">${svg}</span><span class="vy-sk-n">${LOCK}${name}</span>${lv ? `<span class="vy-sk-lv">С ${lv}-го уровня</span>` : ''}<button type="button" class="vy-sk-shop" data-vy-shop>В магазин</button></div>`;
      }
      const on = kind === 'skin' ? id === coat.id : kind === 'outfit' ? id === outfit.id : id === st.food;
      return `<button type="button" class="vy-sk" data-vy-${kind}="${id}" aria-pressed="${on}"><span class="vy-sk-pic">${svg}</span><span class="vy-sk-n">${name}</span></button>`;
    };
    const group = (title, label, html) => `<div class="vy-sk-g"><span class="vy-sk-t">${title}</span><div class="vy-sk-row" role="group" aria-label="${label}">${html}</div></div>`;
    box.innerHTML = '<div class="vy-skins">'
      + group('Окрас', 'Окрас Васяна', COATS.map((c) => tile('skin', c.id, c.name, sprite(SIT, 2, true, c.id, outfit.id).svg)).join(''))
      + group('Наряд', 'Наряд Васяна', OUTFITS.map((o) => tile('outfit', o.id, o.name, sprite(SIT, 2, true, coat.id, o.id).svg)).join(''))
      + group('Еда', 'Еда Васяна', FOODS.map((f) => tile('food', f.id, f.name, sprite(f.rows, 3).svg)).join(''))
      + '</div>';
  }
  const repaintSkins = () => document.querySelectorAll('[data-vasyan-skins]').forEach(paintSkins);
  function applyLook() { shown = null; drawBowl(); repaintSkins(); }
  function setSkin(id) { if (!owned('skin', id)) return false; coat = coatOf(id); st.skin = coat.id; save(); applyLook(); return true; }
  function setOutfit(id) { if (!owned('outfit', id)) return false; outfit = outfitOf(id); st.outfit = outfit.id; save(); applyLook(); return true; }
  // насыпать другую еду: что было в миске, то и остаётся по количеству, но уже новая
  function setFood(id) { if (!FOODS.some((f) => f.id === id) || !owned('food', id)) return false; st.food = id; save(); applyLook(); if (bubble && bubble.classList.contains('think')) say('think'); return true; }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-vy-skin], [data-vy-outfit], [data-vy-food], [data-vy-shop]');
    if (!b) return;
    if (b.hasAttribute('data-vy-shop')) { if (window.CasualShop && typeof window.CasualShop.open === 'function') window.CasualShop.open('vasyan'); return; }
    if (b.dataset.vySkin) setSkin(b.dataset.vySkin); else if (b.dataset.vyOutfit) setOutfit(b.dataset.vyOutfit); else setFood(b.dataset.vyFood);
  });
  // магазин загрузился или что-то купили (или уровень открыл еду) — проверить своё и перерисовать выбор
  document.addEventListener('casualhub:shop', () => { enforceOwned(); repaintSkins(); });
  // картинка для карточки в магазине: окрас — без наряда, наряд — на «Классике», еда — в миске
  function preview(id, k = 3) {
    const bare = String(id || '').replace(/^vasyan\.(skin|outfit|food)\./, '');
    if (COATS.some((c) => c.id === bare)) return sprite(SIT, k, true, bare, 'none').svg;
    if (OUTFITS.some((o) => o.id === bare)) return sprite(SIT, k, true, 'classic', bare).svg;
    if (FOODS.some((f) => f.id === bare)) return sprite(bowlRows(2, foodOf(bare)), k, true, 'classic', 'none').svg;
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
        if (!m.addedNodes.length || (m.target.closest && m.target.closest('.vy-cat, .vy-bowl, .vy-toy'))) continue;
        fill(); return;
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  // выбор в другой вкладке — сразу и здесь
  addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const v = JSON.parse(e.newValue) || {};
      const food = typeof v.food === 'string' ? foodOf(v.food).id : st.food; // старая вкладка пишет в food число — его не трогаем
      if ((v.skin || 'classic') !== coat.id || (v.outfit || 'none') !== outfit.id || food !== st.food) {
        st.skin = v.skin; st.outfit = v.outfit; st.food = food; coat = coatOf(v.skin); outfit = outfitOf(v.outfit); applyLook();
      }
    } catch (er) {}
  });

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
  addEventListener('resize', () => { if (alive) measure(); });
  addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
  addEventListener('pagehide', () => { if (alive) save(); });
  // вернулся на вкладку после перерыва — котик радуется: подпрыгивает и сердечки (спящего не будит)
  let awayAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { awayAt = Date.now(); return; }
    if (!alive || !cat || !awayAt || Date.now() - awayAt < 30000 || BUSY.includes(mode) || mode === 'sleep') return;
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
    hop(); say('meow');
    if (mode === 'eat' || mode === 'goEat' || mode === 'scared') return;
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
  const REACH = 320;
  let scrollY0 = scrollY, scrollHop = 0, scrollLook = 0;
  addEventListener('scroll', () => {
    const dy = scrollY - scrollY0;
    scrollY0 = scrollY;
    if (!alive || !cat || calm || Math.abs(dy) < 2) return;
    const t = performance.now();
    // очень резкая прокрутка (рывок колесом или «в начало») — иногда пугается: хвост трубой, «!»
    if (Math.abs(dy) > 900 && !BUSY.includes(mode) && mode !== 'scared' && Math.random() < 0.35) { stopPlay(); scrollHop = t; scare(t); return; }
    if (t - scrollHop < 600 || ['drag', 'jump', 'climb', 'fall', 'prep', 'eat', 'goEat', 'scared'].includes(mode)) return;
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
  // skins — все окрасы, наряды и еда для магазина: { id, kind: 'skin' | 'outfit' | 'food', name }; preview(id) — svg для карточки.
  // act(вид) — показать повадку сразу (для проверки): sit, walk, jump, loaf, sleep, wash, yawn, stretch, scratch,
  // sneeze, roll, play, edge (только на карточке), scared
  const kindOf = (id) => (COATS.some((c) => c.id === id) ? 'skin' : FOODS.some((f) => f.id === id) ? 'food' : 'outfit');
  window.CasualVasyan = {
    on: () => !st.off, own,
    skins: [...COATS.map((c) => ({ id: c.id, kind: 'skin', name: c.name })), ...OUTFITS.map((o) => ({ id: o.id, kind: 'outfit', name: o.name })), ...FOODS.map((f) => ({ id: f.id, kind: 'food', name: f.name }))],
    preview, owned: (id) => owned(kindOf(id), id),
    skin: () => coat.id, outfit: () => outfit.id, food: () => st.food, setSkin, setOutfit, setFood,
    act: (k) => { if (alive && !BUSY.includes(mode)) act(k); },
  };
})();
