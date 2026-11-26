// «Угадай по пикселям»: какой тайтл в какой день, поиск обложки, картинка без метаданных и без настоящего адреса,
// попытки (атомарно, двойное нажатие), гость, перенос в аккаунт, опыт. node --test tests/game-pixel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { POOL, riddleOf, norm, isRight } from '../functions/_lib/riddle.js';
import { makePixelRoutes, candidatesOf, numberOf, replay, statsOf, stripMeta, coverFor, nextDay, NAMES, PIXEL_PUBLIC, STEPS, MAX_TRIES } from '../functions/_lib/game-pixel.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isRead = (sql) => /^\s*(SELECT|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
    exec() {
      const p = db.prepare(sql);
      if (isRead(sql)) return { results: p.all(...args), meta: { changes: 0 } };
      return { results: [], meta: { changes: p.run(...args).changes } };
    },
  });
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, created_at INTEGER);
    CREATE TABLE friendships (a TEXT, b TEXT, status TEXT, requested_by TEXT, created_at INTEGER, PRIMARY KEY (a, b));`);
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
// Cache API в памяти: ключ — адрес запроса
function fakeCache() {
  const m = new Map();
  const key = (r) => (typeof r === 'string' ? r : r.url);
  return {
    m,
    async match(r) { const v = m.get(key(r)); return v ? new Response(v.body.slice(), { headers: v.headers }) : undefined; },
    async put(r, res) { m.set(key(r), { body: new Uint8Array(await res.arrayBuffer()), headers: Object.fromEntries(res.headers) }); },
  };
}
const txt = (s) => [...Buffer.from(s, 'utf8')];
const seg = (mk, payload) => [0xff, mk, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255, ...payload];
// «JPEG» с названием в EXIF, XMP и комментариях: декодировать его не нужно, нужны только маркеры
function jpeg(secret, w = 600, h = 900) {
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, txt('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    ...seg(0xe1, [...txt('Exif\0\0'), ...txt(secret)]),
    ...seg(0xe1, txt('http://ns.adobe.com/xap/1.0/\0<dc:title>' + secret + '</dc:title>')),
    ...seg(0xed, txt('Photoshop 3.0\0' + secret)),
    ...seg(0xfe, txt('cover of ' + secret)),
    ...seg(0xe2, [...txt('ICC_PROFILE\0'), 1, 1, 9, 9]),
    ...seg(0xee, [...txt('Adobe'), 0, 100, 0, 0, 0, 0, 1]),
    ...seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78,
    ...seg(0xfe, txt('late ' + secret)),
    ...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    0x9a, 0xbc,
    0xff, 0xd9,
    ...txt('trailer ' + secret),
  ]);
}
const has = (bytes, s) => Buffer.from(bytes).includes(Buffer.from(s, 'utf8'));
const hasSeq = (bytes, seq) => Buffer.from(bytes).includes(Buffer.from(seq));

// источники обложек: IMDb (фильмы и сериалы), AniList (аниме), Steam (игры — через works.cover), картинки — JPEG с названием.
// none — названия без обложки, broken — источник отвечает ошибкой для этих названий
function sources({ none = new Set(), broken = new Set() } = {}) {
  const calls = [];
  const ok = (d) => new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
  const byName = (t, q) => POOL.find((x) => t.includes(x.t) && [x.en, x.a].filter(Boolean).some((n) => norm(n) === norm(q)));
  const fetcher = async (url, init = {}) => {
    calls.push(url);
    const u = new URL(url);
    if (u.hostname === 'v3.sg.media-imdb.com') {
      const q = decodeURIComponent(u.pathname.split('/').pop().replace(/\.json$/, ''));
      const r = byName(['movie', 'series'], q);
      if (r && broken.has(r.a)) return new Response('busy', { status: 503 });
      const d = r && !none.has(r.a) ? [{ id: 'tt' + (1000000 + POOL.indexOf(r)), l: r.en || r.a, y: r.y, qid: r.t === 'series' ? 'tvSeries' : 'movie', i: { imageUrl: `https://m.media-amazon.com/images/M/${encodeURIComponent(r.en || r.a)}._V1_SX300.jpg` } }] : [];
      return ok({ d });
    }
    if (u.hostname === 'graphql.anilist.co') {
      const r = byName(['anime'], JSON.parse(init.body).variables.s);
      if (r && broken.has(r.a)) return new Response('busy', { status: 503 });
      const media = r && !none.has(r.a) ? [{ type: 'ANIME', format: 'TV', isAdult: false, title: { english: r.en, romaji: r.en }, startDate: { year: r.y }, genres: [], coverImage: { extraLarge: `https://s4.anilist.co/file/${encodeURIComponent(r.en)}-xl.jpg`, large: `https://s4.anilist.co/file/${encodeURIComponent(r.en)}-l.jpg` }, studios: { nodes: [] }, staff: { edges: [] } }] : [];
      return ok({ data: { m: { media }, p: { staff: [] }, s: { studios: [] } } });
    }
    if (/wikidata\.org|wikipedia\.org/.test(u.hostname)) return ok({});
    if (/media-amazon\.com|anilist\.co|steamstatic\.com|wikimedia\.org/.test(u.hostname)) return new Response(jpeg(decodeURIComponent(u.pathname)), { headers: { 'content-type': 'image/jpeg' } });
    return new Response('nope', { status: 404 });
  };
  const works = {
    // Steam: игра находится под своим английским названием
    cover: async (kind, q) => {
      const r = byName(['game'], q);
      if (r && broken.has(r.a)) throw new Error('steam 503');
      return r && !none.has(r.a) ? [{ id: String(10 + POOL.indexOf(r)), title: r.en || r.a, art: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${encodeURIComponent(r.en || r.a)}/library_600x900.jpg`, alt: '' }] : [];
    },
    steam: async () => [], latin: async () => [], translit: (s) => s, genres: () => [],
  };
  return { fetcher, works, calls };
}

const DAY = 864e5;
const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
// полдень по Киеву этого дня
const noon = (day) => Date.parse(day + 'T10:00:00Z');
const at = async (t, fn) => { const real = Date.now; Date.now = () => t; try { return await fn(); } finally { Date.now = real; } };
function setup(src = sources()) {
  const env = { DB: fakeD1() };
  const q = (sql, ...a) => env.DB.raw.prepare(sql).run(...a);
  q("INSERT INTO users (id, username, uname) VALUES ('u1', 'Аня', 'anya'), ('f1', 'Боря', 'borya'), ('f2', 'Вика', 'vika')");
  q("INSERT INTO friendships (a, b, status) VALUES ('u1', 'f1', 'accepted'), ('f2', 'u1', 'pending')");
  const given = [], cache = fakeCache();
  const routes = makePixelRoutes({
    json: (o) => o, fail: (status, error) => ({ status, error }), readBody: async (req) => (req && req.body) || {},
    currentUser: async (e, req) => (req && req.user) || null, clientIp: () => '203.0.113.7',
    lvGive: async (e, req, me, uid, items) => { given.push({ uid, items }); },
    cache, fetch: src.fetcher, works: src.works,
  });
  const call = (key, { user = null, body = null, url = 'https://casualhub.test/api' + key.split(' ')[1] } = {}) => routes[key]({ env, request: { user, body, url, headers: new Headers() }, me: user });
  return { env, routes, call, given, cache, src };
}
const pickRow = (env, day) => env.DB.raw.prepare('SELECT idx, art, alt FROM pixel_days WHERE day = ?').get(day);
const wrongFor = (r, k = 0) => POOL.filter((x) => x !== r && !isRight(r, x.a) && !isRight(r, x.en || ''))[k].a;
// первый день с 1 декабря, когда картинка — тайтл этого вида
const dayOf = (t) => { for (let i = 0; i < 400; i++) { const d = shift('2026-12-01', i); if (POOL[candidatesOf(d)[0]].t === t) return d; } throw new Error(t); };

test('день: №1 — 1 декабря 2026, свой порядок, не загадка дня и не недавняя картинка', () => {
  assert.equal(numberOf('2026-12-01'), 1);
  assert.equal(numberOf('2026-12-12'), 12);
  assert.equal(numberOf('2026-11-20'), 1, 'до запуска — №1');
  assert.deepEqual(candidatesOf('2026-12-05'), candidatesOf('2026-12-05'), 'день — всегда тот же порядок');
  const firsts = new Set();
  for (let i = 0; i < 400; i++) {
    const d = shift('2026-12-01', i), c = candidatesOf(d);
    assert.ok(!c.includes(POOL.indexOf(riddleOf(d).r)), 'в день загадки её тайтл картинкой не бывает: ' + d);
    if (i < POOL.length) firsts.add(c[0]);
  }
  assert.ok(firsts.size >= POOL.length - 3, 'за круг почти все тайтлы, без повторов подряд: ' + firsts.size);
  const c = candidatesOf('2026-12-07'), recent = new Set([c[0], c[1]]);
  assert.equal(candidatesOf('2026-12-07', recent)[0], c[2], 'недавние картинки пропускаются');
  assert.equal(NAMES.length, POOL.length);
  assert.ok(NAMES.every((x) => typeof x.a === 'string' && Array.isArray(x.al)));
  assert.deepEqual(STEPS, [6, 9, 14, 22, 36, 0]);
  assert.ok(PIXEL_PUBLIC.includes('GET /games/pixel/img') && !PIXEL_PUBLIC.some((k) => k.includes('claim')), 'перенос в аккаунт — только со входом');
});

test('новая картинка: полночь по Киеву зимой и летом', () => {
  assert.equal(new Date(nextDay(Date.UTC(2026, 10, 26, 15))).toISOString(), '2026-11-26T22:00:00.000Z');
  assert.equal(new Date(nextDay(Date.UTC(2027, 5, 26, 15))).toISOString(), '2027-06-26T21:00:00.000Z');
  assert.equal(new Date(nextDay(Date.UTC(2026, 10, 26, 22, 30))).toISOString(), '2026-11-27T22:00:00.000Z', 'после полуночи — уже следующая');
});

test('попытки по порядку: первый верный ответ заканчивает игру, шестой мимо — тоже', () => {
  const r = POOL.find((x) => x.en === 'The Witcher 3: Wild Hunt');
  assert.deepEqual(replay(r, ['Skyrim', '', 'ведьмак 3', 'Doom']), { tries: ['Skyrim', '', 'ведьмак 3'], solved: true, over: false });
  assert.deepEqual(replay(r, ['a', 'b', 'c', 'd', 'e', 'f', 'g']).tries.length, 6);
  assert.equal(replay(r, ['a', 'b', 'c', 'd', 'e', 'f']).over, true);
  assert.deepEqual(replay(r, 'не список'), { tries: [], solved: false, over: false });
  assert.equal(replay(r, ['x'.repeat(200)]).tries[0].length, 80);
});

test('рекорды: сыграно, угадано, серия, лучшая серия, с какой попытки', () => {
  const rows = [
    { day: '2026-12-10', n: 2, solved: 1 }, { day: '2026-12-09', n: 6, solved: 0 }, { day: '2026-12-08', n: 1, solved: 1 },
    { day: '2026-12-07', n: 3, solved: 1 }, { day: '2026-12-06', n: 3, solved: 1 }, { day: '2026-12-05', n: 2, solved: 0 },
  ];
  assert.deepEqual(statsOf(rows, '2026-12-10'), { played: 5, won: 4, streak: 1, best: 3, dist: [1, 1, 2, 0, 0, 0] });
  assert.equal(statsOf(rows, '2026-12-11').streak, 1, 'сегодня ещё не играл — серия до вчера');
  assert.deepEqual(statsOf([], '2026-12-10'), { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] });
});

test('картинка без метаданных: JPEG, PNG и WebP; заглушки и чужие форматы — нет', () => {
  const j = stripMeta(jpeg('The Witcher 3'));
  assert.equal(j.type, 'image/jpeg');
  assert.deepEqual([j.w, j.h], [600, 900]);
  assert.ok(!has(j.bytes, 'Witcher'), 'ни EXIF, ни XMP, ни Photoshop, ни комментариев, ни хвоста после конца');
  assert.ok(has(j.bytes, 'ICC_PROFILE') && has(j.bytes, 'Adobe') && has(j.bytes, 'JFIF'), 'цвета (ICC, Adobe) остаются');
  assert.ok(hasSeq(j.bytes, [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]) && hasSeq(j.bytes, [0x9a, 0xbc, 0xff, 0xd9]), 'данные кадров — как были');
  assert.equal(stripMeta(jpeg('x', 40, 40)), null, 'маленькая — это заглушка, а не обложка');
  // PNG: IHDR, текст с названием, данные, конец
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); Buffer.from(data).copy(b, 8); return [...b]; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(300, 0); ihdr.writeUInt32BE(450, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = new Uint8Array([0x89, ...txt('PNG\r\n\x1a\n'), ...chunk('IHDR', [...ihdr]), ...chunk('tEXt', txt('Title\0Dune')), ...chunk('iTXt', txt('XML:com.adobe.xmp\0\0\0\0\0Dune')), ...chunk('IDAT', [1, 2, 3]), ...chunk('IEND', [])]);
  const p = stripMeta(png);
  assert.equal(p.type, 'image/png');
  assert.deepEqual([p.w, p.h], [300, 450]);
  assert.ok(!has(p.bytes, 'Dune') && has(p.bytes, 'IDAT') && has(p.bytes, 'IEND'));
  // WebP: VP8X с флагами EXIF и XMP, картинка, EXIF и XMP
  const rc = (type, data) => { const b = Buffer.alloc(8 + data.length + (data.length & 1)); b.write(type, 0, 'latin1'); b.writeUInt32LE(data.length, 4); Buffer.from(data).copy(b, 8); return [...b]; };
  const vp8x = [0x0c, 0, 0, 0, 299 & 255, 299 >> 8, 0, 449 & 255, 449 >> 8, 0];
  const body = [...txt('WEBP'), ...rc('VP8X', vp8x), ...rc('VP8 ', [1, 2, 3, 4, 5]), ...rc('EXIF', txt('Exif\0\0Matrix')), ...rc('XMP ', txt('<x>Matrix</x>'))];
  const riff = Buffer.alloc(8); riff.write('RIFF', 0, 'latin1'); riff.writeUInt32LE(body.length, 4);
  const w = stripMeta(new Uint8Array([...riff, ...body]));
  assert.equal(w.type, 'image/webp');
  assert.deepEqual([w.w, w.h], [300, 450]);
  const wb = Buffer.from(w.bytes);
  assert.ok(!has(w.bytes, 'Matrix') && !has(w.bytes, 'EXIF') && has(w.bytes, 'VP8 '));
  assert.equal(wb.readUInt32LE(4), wb.length - 8, 'размер RIFF пересчитан');
  assert.equal(wb[20] & 0x0c, 0, 'флагов EXIF и XMP в VP8X больше нет');
  assert.equal(stripMeta(new Uint8Array([...txt('GIF89a'), ...Array(40).fill(0)])), null);
  assert.equal(stripMeta(new Uint8Array(10)), null);
});

test('обложка: Steam по точному названию, фильм — по году, аниме — как ни пиши, игра — по Wikidata и Википедии', async () => {
  const get = (map) => async (url) => { for (const [re, v] of map) if (re.test(url)) return typeof v === 'function' ? v(url) : v; return {}; };
  const deps = (map, cover = async () => []) => ({ get: get(map), cover, steam: async () => [], latin: async () => [], translit: (s) => s, genres: () => [], lang: 'en', geo: null });
  const doom = POOL.find((x) => x.a === 'Doom');
  const steam = async () => [{ id: '0', title: 'DOOM (1993)', art: 'https://x.steamstatic.com/1993.jpg' }, { id: '1', title: 'DOOM Eternal', art: 'https://x.steamstatic.com/eternal.jpg' }, { id: '2', title: 'DOOM', art: 'https://x.steamstatic.com/doom.jpg', alt: 'https://x.steamstatic.com/doom-h.jpg' }];
  assert.deepEqual(await coverFor(doom, deps([], steam)), { art: 'https://x.steamstatic.com/doom.jpg', alt: 'https://x.steamstatic.com/doom-h.jpg' });
  // «Король Лев»: в подсказках IMDb и мультфильм 1994 года, и фильм 2019-го — нужен первый
  const lion = POOL.find((x) => x.en === 'The Lion King');
  const imdb = [[/media-imdb/, { d: [
    { id: 'tt6105098', l: 'The Lion King', y: 2019, qid: 'movie', i: { imageUrl: 'https://m.media-amazon.com/images/M/new._V1_.jpg' } },
    { id: 'tt0110357', l: 'The Lion King', y: 1994, qid: 'movie', i: { imageUrl: 'https://m.media-amazon.com/images/M/old._V1_.jpg' } },
  ] }]];
  assert.equal((await coverFor(lion, deps(imdb))).art, 'https://m.media-amazon.com/images/M/old._V1_QL80_UX600_.jpg');
  // «Твоё имя»: у AniList «Your Name.» — с точкой
  const yn = POOL.find((x) => x.en === 'Your Name');
  const ani = [[/anilist/, { data: { m: { media: [{ type: 'ANIME', format: 'MOVIE', isAdult: false, title: { english: 'Your Name.', romaji: 'Kimi no Na wa.' }, startDate: { year: 2016 }, genres: [], coverImage: { extraLarge: 'https://s4.anilist.co/file/yn.jpg', large: 'https://s4.anilist.co/file/yn-l.jpg' }, studios: { nodes: [] }, staff: { edges: [] } }] }, p: { staff: [] }, s: { studios: [] } } }]];
  assert.deepEqual(await coverFor(yn, deps(ani)), { art: 'https://s4.anilist.co/file/yn.jpg', alt: 'https://s4.anilist.co/file/yn-l.jpg' });
  // Minecraft в Steam нет: Wikidata (дата — ранний доступ 2009 года, а в списке 2011) и обложка из английской Википедии
  const mc = POOL.find((x) => x.a === 'Minecraft');
  const wd = [
    [/list=search/, { query: { search: [{ title: 'Q49740' }] } }],
    [/query\.wikidata\.org/, { results: { bindings: [{ g: { value: 'http://www.wikidata.org/entity/Q49740' }, links: { value: '150' }, en: { value: 'Minecraft' }, date: { value: '2009-05-17T00:00:00Z' }, wiki: { value: 'https://en.wikipedia.org/wiki/Minecraft' } }] } }],
    [/en\.wikipedia\.org/, { query: { pages: { 1: { title: 'Minecraft', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/5/51/Minecraft_cover.png', width: 400, height: 560 } } } } }],
  ];
  assert.deepEqual(await coverFor(mc, deps(wd)), { art: 'https://upload.wikimedia.org/wikipedia/en/5/51/Minecraft_cover.png', alt: '' });
  // AniList находит и мангу «Твоё имя» того же года — нужна обложка фильма
  const both = [[/anilist/, { data: { m: { media: [
    { type: 'MANGA', format: 'MANGA', isAdult: false, title: { english: 'Your Name.', romaji: 'Kimi no Na wa.' }, startDate: { year: 2016 }, genres: [], coverImage: { extraLarge: 'https://s4.anilist.co/file/manga.jpg' }, studios: { nodes: [] }, staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Makoto Shinkai' } } }] } },
    { type: 'ANIME', format: 'MOVIE', isAdult: false, title: { english: 'Your Name.', romaji: 'Kimi no Na wa.' }, startDate: { year: 2016 }, genres: [], coverImage: { extraLarge: 'https://s4.anilist.co/file/film.jpg' }, studios: { nodes: [{ name: 'CoMix Wave Films' }] }, staff: { edges: [] } },
  ] }, p: { staff: [] }, s: { studios: [] } } }]];
  assert.equal((await coverFor(yn, deps(both))).art, 'https://s4.anilist.co/file/film.jpg');
  // у AniList экранизации — с пометкой в скобках, нужная — по году: OVA 1993 и 2000 года не подходят, сериал 2012-го — да
  const jojo = POOL.find((x) => x.en === "JoJo's Bizarre Adventure");
  const al = (en, year, file, fmt = 'TV') => ({ type: 'ANIME', format: fmt, isAdult: false, title: { english: en, romaji: en }, startDate: { year }, genres: [], coverImage: { extraLarge: 'https://s4.anilist.co/file/' + file }, studios: { nodes: [{ name: 'Studio ' + file }] }, staff: { edges: [] } });
  const jj = [[/anilist/, { data: { m: { media: [al("JoJo's Bizarre Adventure", 1993, 'ova.jpg', 'OVA'), al("JoJo's Bizarre Adventure (TV)", 2012, 'jojo.jpg'), al("JoJo's Bizarre Adventure (2000)", 2000, 'ova2.jpg', 'OVA')] }, p: { staff: [] }, s: { studios: [] } } }]];
  assert.equal((await coverFor(jojo, deps(jj))).art, 'https://s4.anilist.co/file/jojo.jpg');
  // Ведьмак 3: в Steam он теперь «— Remastered» (точного названия нет), в Wikidata есть код Steam. Картинка статьи — фото
  // с Викисклада, а не коробка: берём Steam. Коробка из английской Википедии (/wikipedia/en/) была бы первой
  const w3 = POOL.find((x) => x.en === 'The Witcher 3: Wild Hunt');
  const w3map = (thumb) => [
    [/list=search/, { query: { search: [{ title: 'Q17561' }] } }],
    [/query\.wikidata\.org/, { results: { bindings: [{ g: { value: 'http://www.wikidata.org/entity/Q17561' }, links: { value: '90' }, en: { value: 'The Witcher 3: Wild Hunt' }, date: { value: '2015-05-19T00:00:00Z' }, steam: { value: '292030' }, wiki: { value: 'https://en.wikipedia.org/wiki/The_Witcher_3:_Wild_Hunt' } }] } }],
    [/en\.wikipedia\.org/, { query: { pages: { 1: { title: 'The Witcher 3: Wild Hunt', thumbnail: { source: thumb, width: 600, height: 400 } } } } }],
  ];
  const w3deps = (thumb) => ({ ...deps(w3map(thumb), async () => [{ id: '292030', title: 'The Witcher 3: Wild Hunt — Remastered', art: 'https://x.steamstatic.com/w3.jpg' }]),
    steam: async (list) => list.map((i) => ({ id: String(i.id), title: 'The Witcher 3: Wild Hunt — Remastered', art: 'https://x.steamstatic.com/w3.jpg', alt: 'https://x.steamstatic.com/w3-h.jpg', tall: true })) });
  assert.equal((await coverFor(w3, w3deps('https://upload.wikimedia.org/wikipedia/commons/0/0b/Unboxing.jpg'))).art, 'https://x.steamstatic.com/w3.jpg');
  assert.deepEqual(await coverFor(w3, w3deps('https://upload.wikimedia.org/wikipedia/en/0/0c/Witcher_3_cover_art.jpg')), { art: 'https://upload.wikimedia.org/wikipedia/en/0/0c/Witcher_3_cover_art.jpg', alt: 'https://x.steamstatic.com/w3.jpg' });
  // не то название или совсем не тот год — обложки нет
  const off = [[/media-imdb/, { d: [{ id: 'tt1', l: 'The Lion King', y: 1960, qid: 'movie', i: { imageUrl: 'https://m.media-amazon.com/images/M/z._V1_.jpg' } }, { id: 'tt2', l: 'The Lion Guard', y: 1994, qid: 'tvSeries', i: { imageUrl: 'https://m.media-amazon.com/images/M/g._V1_.jpg' } }] }]];
  assert.equal(await coverFor(lion, deps(off)), null);
});

test('игра: обложка ищется один раз в день, до конца — ни названия, ни адреса картинки, попытки и опыт', async () => {
  const day = dayOf('movie'), T = noon(day);
  const { env, call, given, src, cache } = setup();
  const u1 = { id: 'u1' };
  const s = await at(T, () => call('GET /games/pixel', { user: u1 }));
  assert.equal(s.ready, true);
  assert.equal(s.day, day);
  assert.equal(s.n, numberOf(day));
  assert.deepEqual([s.max, s.tries, s.solved, s.over, s.answer], [MAX_TRIES, [], false, false, null]);
  const row = pickRow(env, day), r = POOL[row.idx];
  assert.equal(row.idx, candidatesOf(day)[0]);
  const text = JSON.stringify(s).toLowerCase();
  for (const n of [r.a, r.en, row.art].filter(Boolean)) assert.ok(!text.includes(n.toLowerCase()), 'до конца игры на страницу не уходит: ' + n);
  assert.equal(s.img, '/api/games/pixel/img?d=' + day);
  const lookups = src.calls.length;
  await at(T + 60e3, () => call('GET /games/pixel'));
  assert.equal(src.calls.length, lookups, 'второй раз за день источники не спрашиваются');
  assert.ok([...cache.m.keys()].some((k) => k.includes('/img/' + day)), 'картинка уже в кэше');

  const w1 = wrongFor(r), w2 = wrongFor(r, 1);
  let x = await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day, guess: w1, at: 0 } }));
  assert.deepEqual([x.right, x.tries, x.answer], [false, [w1], null]);
  assert.equal((await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day, guess: '  ' + w1.toUpperCase() + '!', at: 1 } }))).status, 400, 'тот же ответ второй раз не тратит попытку');
  assert.equal((await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day, guess: '   ', at: 1 } }))).status, 400);
  x = await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day, skip: true, at: 1 } }));
  assert.deepEqual([x.right, x.tries], [false, [w1, '']]);
  x = await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day, guess: w2, at: 1 } }));
  assert.deepEqual([x.right, x.stale, x.tries.length], [null, true, 2], 'страница видела старое число попыток — не засчитано');
  assert.equal((await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day: shift(day, -1), guess: w2, at: 2 } }))).status, 409, 'вчерашняя вкладка');
  x = await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day, guess: (r.en || r.a).toLowerCase() + '!!', at: 2 } }));
  assert.equal(x.right, true);
  assert.equal(x.solved, true);
  assert.deepEqual(x.answer, { title: r.a, en: r.en && r.en !== r.a ? r.en : '', year: r.y, type: r.t });
  assert.deepEqual(given, [{ uid: 'u1', items: [{ kind: 'pixel', ref: day }] }], 'с 3-й попытки — без опыта за скорость');
  x = await at(T, () => call('POST /games/pixel/guess', { user: u1, body: { day, guess: w2, at: 3 } }));
  assert.deepEqual([x.right, x.tries.length, given.length], [null, 3, 1], 'после конца игры попытки не идут');
  const again = await at(T + 3600e3, () => call('GET /games/pixel', { user: u1 }));
  assert.equal(again.answer.title, r.a);
  assert.deepEqual(again.stats, { played: 1, won: 1, streak: 1, best: 1, dist: [0, 0, 1, 0, 0, 0] });
  // друг сыграл с 1-й попытки: опыт и за скорость; у меня в списке «друзья сегодня» — без его ответа
  const f = await at(T, () => call('POST /games/pixel/guess', { user: { id: 'f1' }, body: { day, guess: r.a, at: 0 } }));
  assert.equal(f.solved, true);
  assert.deepEqual(given[1], { uid: 'f1', items: [{ kind: 'pixel', ref: day }, { kind: 'pixel_fast', ref: day }] });
  const mine = await at(T, () => call('GET /games/pixel', { user: u1 }));
  assert.deepEqual(mine.friends, [{ name: 'Боря', handle: 'borya', tries: 1, solved: true }]);
  // шесть раз мимо — игра окончена, ответ открыт, опыта нет
  const u9 = { id: 'u9' };
  for (let i = 0; i < 6; i++) x = await at(T, () => call('POST /games/pixel/guess', { user: u9, body: { day, guess: wrongFor(r, i), at: i } }));
  assert.deepEqual([x.over, x.solved, x.answer && x.answer.title, given.length], [true, false, r.a, 2]);
});

test('попытки атомарны: двойное нажатие засчитывается один раз, параллельные — не больше шести', async () => {
  const day = dayOf('anime'), T = noon(day);
  const { env, call } = setup();
  await at(T, () => call('GET /games/pixel'));
  const r = POOL[pickRow(env, day).idx], me = { id: 'u7' };
  const two = await at(T, () => Promise.all([0, 1, 2].map((k) => call('POST /games/pixel/guess', { user: me, body: { day, guess: wrongFor(r, k), at: 0 } }))));
  assert.equal(two.filter((x) => x.right === false).length, 1);
  assert.equal(two.filter((x) => x.stale).length, 2);
  const many = await at(T, () => Promise.all(Array.from({ length: 12 }, (_, k) => call('POST /games/pixel/guess', { user: me, body: { day, guess: wrongFor(r, 3 + k) } }))));
  const row = env.DB.raw.prepare("SELECT n, json_array_length(tries) AS len FROM pixel_tries WHERE user_id = 'u7'").get();
  assert.ok(row.n <= MAX_TRIES && row.n === row.len, 'n и список попыток сходятся: ' + JSON.stringify(row));
  assert.equal(many.filter((x) => x.right === false).length, row.n - 1);
  for (let i = row.n; i < MAX_TRIES; i++) await at(T, () => call('POST /games/pixel/guess', { user: me, body: { day, skip: true, at: i } }));
  const end = await at(T, () => Promise.all([0, 1, 2].map(() => call('POST /games/pixel/guess', { user: me, body: { day, skip: true } }))));
  assert.ok(end.every((x) => x.over && x.right === null));
  assert.equal(env.DB.raw.prepare("SELECT n FROM pixel_tries WHERE user_id = 'u7'").get().n, MAX_TRIES);
});

test('гость: попытки из браузера, сервер только сверяет; ответ — в конце; перенос в аккаунт после входа', async () => {
  const day = dayOf('series'), T = noon(day);
  const { env, call, given } = setup();
  const g0 = await at(T, () => call('GET /games/pixel'));
  assert.deepEqual([g0.guest, g0.stats, g0.tries], [true, null, []]);
  const r = POOL[pickRow(env, day).idx], w = (k) => wrongFor(r, k);
  let g = await at(T, () => call('POST /games/pixel/guess', { body: { day, guess: w(0) } }));
  assert.deepEqual([g.guest, g.right, g.tries, g.answer], [true, false, [w(0)], null]);
  g = await at(T, () => call('POST /games/pixel/guess', { body: { day, skip: true, prev: g.tries } }));
  assert.deepEqual(g.tries, [w(0), '']);
  assert.equal((await at(T, () => call('POST /games/pixel/guess', { body: { day, guess: w(0), prev: g.tries } }))).status, 400);
  g = await at(T, () => call('POST /games/pixel/guess', { body: { day, prev: [w(0), ''], peek: true } }));
  assert.deepEqual([g.tries.length, g.answer], [2, null], 'после обновления страницы — как было, без ответа');
  g = await at(T, () => call('POST /games/pixel/guess', { body: { day, prev: [w(0), '', w(1), w(2), w(3)], guess: r.a } }));
  assert.deepEqual([g.solved, g.answer.title], [true, r.a]);
  const over = await at(T, () => call('POST /games/pixel/guess', { body: { day, prev: [1, 2, 3, 4, 5, 6].map((k) => w(k)), peek: true } }));
  assert.deepEqual([over.over, over.answer.title], [true, r.a]);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM pixel_tries').get().n, 0, 'у гостя в базе ничего нет');
  assert.equal(given.length, 0, 'и опыта нет');
  // вошёл: сыгранное переносится (ответы сверяются заново, после верного ничего не считается), опыт — с 2-й попытки и за скорость
  const u2 = { id: 'u2' };
  let a = await at(T, () => call('POST /games/pixel/claim', { user: u2, body: { day, tries: [w(0), r.a, w(1)] } }));
  assert.deepEqual([a.guest, a.solved, a.tries], [false, true, [w(0), r.a]]);
  assert.deepEqual(given, [{ uid: 'u2', items: [{ kind: 'pixel', ref: day }, { kind: 'pixel_fast', ref: day }] }]);
  a = await at(T, () => call('POST /games/pixel/claim', { user: u2, body: { day, tries: [r.a] } }));
  assert.deepEqual([a.tries.length, given.length], [2, 1], 'второй раз не переносится');
  // в аккаунте уже есть попытка — перенос не трогает её
  const u3 = { id: 'u3' };
  await at(T, () => call('POST /games/pixel/guess', { user: u3, body: { day, guess: w(4), at: 0 } }));
  a = await at(T, () => call('POST /games/pixel/claim', { user: u3, body: { day, tries: [r.a] } }));
  assert.deepEqual([a.tries, a.solved, given.length], [[w(4)], false, 1]);
  assert.equal((await at(T, () => call('POST /games/pixel/claim', { user: u3, body: { day: shift(day, -1), tries: [r.a] } }))).status, 409);
});

test('картинка: только через наш адрес, без метаданных; завтрашняя и неизвестные дни — 404', async () => {
  const day = dayOf('game'), T = noon(day);
  const { env, call, cache } = setup();
  await at(T, () => call('GET /games/pixel'));
  const row = pickRow(env, day), r = POOL[row.idx];
  assert.match(row.art, /steamstatic\.com/);
  const img = (d) => call('GET /games/pixel/img', { url: 'https://casualhub.test/api/games/pixel/img?d=' + d });
  const res = await at(T, () => img(day));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(!has(bytes, r.en || r.a) && !has(bytes, 'library_600x900'), 'название и адрес из метаданных вырезаны');
  for (const [, v] of res.headers) assert.ok(!v.includes('steam') && !v.includes(r.en || r.a), 'и в заголовках их нет: ' + v);
  // кэш пропал — картинка скачивается заново по адресу из pixel_days
  cache.m.clear();
  assert.equal((await at(T, () => img(day))).status, 200);
  assert.equal((await at(T, () => img(shift(day, 1)))).status, 404, 'завтрашняя — нет');
  assert.equal((await at(T + DAY, () => img(shift(day, -3)))).status, 404, 'день без картинки');
  assert.equal((await at(T, () => img('../../etc'))).status, 404);
});

test('нет обложки — следующий тайтл и пометка; источник не ответил — следующий, но без пометки', async () => {
  const day = dayOf('movie'), T = noon(day), c = candidatesOf(day);
  const first = POOL[c[0]];
  const a = setup(sources({ none: new Set([first.a]) }));
  await at(T, () => a.call('GET /games/pixel'));
  assert.equal(pickRow(a.env, day).idx, c[1], 'у первого обложки нет — картинкой стал следующий');
  assert.ok([...a.cache.m.keys()].some((k) => k.includes('/none/')), 'у тайтла без обложки — пометка');
  const b = setup(sources({ broken: new Set([first.a]) }));
  await at(T, () => b.call('GET /games/pixel'));
  assert.equal(pickRow(b.env, day).idx, c[1]);
  assert.ok(![...b.cache.m.keys()].some((k) => k.includes('/none/')), 'источник просто не ответил — тайтл не помечен');
  // никто не ответил — картинки пока нет: страница спросит ещё раз, в базе ничего не записано
  const all = new Set(POOL.map((x) => x.a));
  const d = setup(sources({ broken: all }));
  const s = await at(T, () => d.call('GET /games/pixel'));
  assert.equal(s.ready, false);
  assert.equal(pickRow(d.env, day), undefined);
  assert.equal((await at(T, () => d.call('POST /games/pixel/guess', { body: { day, guess: 'Doom' } }))).status, 503);
  // через две недели тайтл, который уже был картинкой, не повторяется (даже если он первый по кругу)
  const e = setup();
  const days = Array.from({ length: 5 }, (_, i) => shift(day, i));
  for (const dd of days) await at(noon(dd), () => e.call('GET /games/pixel'));
  const idxs = days.map((dd) => pickRow(e.env, dd).idx);
  assert.equal(new Set(idxs).size, idxs.length, 'пять дней — пять разных тайтлов');
});
