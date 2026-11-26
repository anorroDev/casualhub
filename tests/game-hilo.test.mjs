// «Выше или ниже»: списки, баллы из Steam и AniList (подменены), забег — старт, верный и неверный ответ, срок хода,
// «ушёл со страницы», рекорды и таблица друзей, опыт с дневным лимитом, чужой забег, двойной ответ, фильмы только с ключом OMDb.
// node --test tests/game-hilo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  GAMES, ANIME, MOVIES, ROUND_MS, REVEAL_MS, GRACE_MS, STREAK_BONUS, HILO_PUBLIC,
  steamItems, aniItems, view, isRight, pickItem, sourcesOf, forgetScores, makeHiloRoutes,
} from '../functions/_lib/game-hilo.js';
import { RULES } from '../functions/_lib/levels.js';

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
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, banned INTEGER, created_at INTEGER);
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

// источники: у игры балл 50 + appid % 50 (%), у аниме 60 + id % 40 (из 100) — одинаковых баллов много, это и проверяем
const steamPct = (id) => 50 + (id % 50);
const aniScore = (id) => 60 + (id % 40);
const calls = { steam: 0, ani: 0, omdb: 0 };
let down = { steam: false, ani: false };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.steampowered.com/IStoreBrowseService/GetItems/')) {
    calls.steam++;
    if (down.steam) throw new Error('steam down');
    const ids = JSON.parse(new URL(u).searchParams.get('input_json')).ids.map((x) => x.appid);
    return Response.json({ response: { store_items: ids.map((appid) => ({
      appid, id: appid, success: 1, type: 0, name: `Game™ ${appid}`, release: { steam_release_date: 1300000000 },
      reviews: { summary_filtered: { review_count: 50000, percent_positive: steamPct(appid) } },
      assets: { asset_url_format: 'steam/apps/' + appid + '/${FILENAME}?t=1', library_capsule: 'library_600x900.jpg', header: 'header.jpg' },
    })) } });
  }
  if (u === 'https://graphql.anilist.co') {
    calls.ani++;
    if (down.ani) throw new Error('anilist down');
    const ids = JSON.parse(init.body).variables.ids;
    return Response.json({ data: { Page: { media: ids.map((id) => ({ id, isAdult: false, averageScore: aniScore(id), popularity: 100000, seasonYear: 2010, title: { english: 'Anime ' + id, romaji: 'Anime ' + id }, coverImage: { large: `https://s4.anilist.co/file/${id}.jpg` } })) } } });
  }
  if (u.startsWith('https://www.omdbapi.com/')) {
    calls.omdb++;
    const id = new URL(u).searchParams.get('i');
    return Response.json({ Response: 'True', imdbRating: (5 + (parseInt(id.slice(2), 10) % 45) / 10).toFixed(1), imdbVotes: '250,000', Poster: `https://m.media-amazon.com/images/M/${id}.jpg`, Type: 'movie', Ratings: [] });
  }
  return realFetch(url, init);
};

const DAY = 864e5;
const NOW = Date.UTC(2026, 11, 3, 10); // 3 декабря 2026, 12:00 по Киеву
const at = async (t, fn) => { const real = Date.now; Date.now = () => t; try { return await fn(); } finally { Date.now = real; } };
const USERS = { u1: { id: 'u1', username: 'Аня' }, u2: { id: 'u2', username: 'Боря' }, f1: { id: 'f1', username: 'Вика' } };

function setup(envExtra = {}) {
  forgetScores();
  down = { steam: false, ani: false };
  const env = { DB: fakeD1(), LEVELS: '1', ...envExtra };
  const q = (sql, ...a) => env.DB.raw.prepare(sql).run(...a);
  q("INSERT INTO users (id, username, uname) VALUES ('u1', 'Аня', 'anya'), ('u2', 'Боря', 'borya'), ('f1', 'Вика', 'vika'), ('f3', 'Гоша', 'gosha')");
  q("INSERT INTO friendships (a, b, status) VALUES ('u1', 'f1', 'accepted'), ('f3', 'u1', 'pending')");
  const given = [];
  const routes = makeHiloRoutes({
    json: (o) => o, fail: (status, error) => ({ status, error }), readBody: async (req) => (req && req.body) || {},
    currentUser: async (e, req) => (req && req.user) || null, clientIp: () => '203.0.113.7',
    lvGive: async (e, req, me, uid, items) => { given.push({ uid, items }); return { gained: items.reduce((s, it) => s + RULES[it.kind].xp, 0) }; },
  });
  const call = (route, body, user, t = NOW) => at(t, () => routes[route]({ env, request: { body, user: user ? USERS[user] : null } }));
  const runRow = (id) => env.DB.raw.prepare('SELECT * FROM hilo_runs WHERE id = ?').get(id);
  // верный ответ: подсматриваем скрытый балл в базе (страница его не знает)
  const rightPick = (id) => { const r = runRow(id); return JSON.parse(r.b).v > JSON.parse(r.a).v ? 'higher' : 'lower'; };
  return { env, routes, given, call, runRow, rightPick, q };
}

test('списки: сотни известных тайтлов без повторов, у аниме и фильмов — русские названия', () => {
  assert.ok(GAMES.length >= 150 && ANIME.length >= 120 && MOVIES.length >= 150);
  assert.equal(new Set(GAMES).size, GAMES.length);
  assert.equal(new Set(ANIME.map((x) => x[0])).size, ANIME.length);
  assert.equal(new Set(MOVIES.map((x) => x[0])).size, MOVIES.length);
  for (const id of GAMES) assert.ok(Number.isInteger(id) && id > 0, String(id));
  for (const [id, ru] of ANIME) assert.ok(Number.isInteger(id) && /[а-яё]/i.test(ru), String(id));
  for (const [id, en, ru, y] of MOVIES) assert.ok(/^tt\d{7,8}$/.test(id) && en && /[а-яё0-9]/i.test(ru) && y > 1900 && y < 2030, id);
  assert.deepEqual(HILO_PUBLIC.sort(), ['GET /games/hilo', 'POST /games/hilo/answer', 'POST /games/hilo/lose', 'POST /games/hilo/start']);
});

test('баллы: доля положительных отзывов Steam и средний балл AniList — по шкале 0–10, лишнее пропускается', () => {
  const st = steamItems({ response: { store_items: [
    { appid: 620, success: 1, type: 0, name: 'Portal™ 2', reviews: { summary_filtered: { percent_positive: 98, review_count: 390000 } }, assets: { asset_url_format: 'steam/apps/620/${FILENAME}?t=1', library_capsule: 'library_600x900.jpg' }, release: { steam_release_date: 1303186800 } },
    { appid: 621, success: 1, type: 4, name: 'DLC', reviews: { summary_filtered: { percent_positive: 90, review_count: 9000 } }, assets: { asset_url_format: 'x/${FILENAME}', library_capsule: 'a.jpg' } },
    { appid: 622, success: 1, type: 0, name: 'Тихая', reviews: { summary_filtered: { percent_positive: 90, review_count: 12 } }, assets: { asset_url_format: 'x/${FILENAME}', library_capsule: 'a.jpg' } },
    { appid: 623, success: 1, type: 0, name: 'Старая', reviews: { summary_filtered: { percent_positive: 71, review_count: 9000 } }, assets: { asset_url_format: 'steam/apps/623/${FILENAME}', header: 'h.jpg' } },
    { appid: 624, success: 0 },
  ] } });
  assert.deepEqual(Object.keys(st), ['g:620', 'g:623'], 'дополнения, игры почти без отзывов и пропавшие — мимо');
  assert.equal(st['g:620'].t, 'Portal 2', 'без знаков марки');
  assert.equal(st['g:620'].v, 98);
  assert.equal(st['g:620'].y, 2011);
  assert.equal(st['g:620'].img, 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg?t=1');
  assert.equal(st['g:623'].wide, 1, 'без вертикальной обложки — шапка магазина');
  const al = aniItems({ data: { Page: { media: [
    { id: 1535, isAdult: false, averageScore: 84, popularity: 980000, seasonYear: 2006, title: { english: 'Death Note' }, coverImage: { extraLarge: 'https://s4.anilist.co/x.jpg' } },
    { id: 1, isAdult: true, averageScore: 86, popularity: 470000, title: { english: 'Bebop' }, coverImage: { large: 'https://s4.anilist.co/y.jpg' } },
    { id: 16498, isAdult: false, averageScore: null, popularity: 1e6, title: { romaji: 'Shingeki' }, coverImage: { large: 'https://s4.anilist.co/z.jpg' } },
    { id: 999999, isAdult: false, averageScore: 70, popularity: 1e6, title: { romaji: 'Чужое' }, coverImage: { large: 'https://s4.anilist.co/w.jpg' } },
  ] } } });
  assert.deepEqual(Object.keys(al), ['a:1535'], '18+, без балла и не из списка — мимо');
  assert.deepEqual([al['a:1535'].v, al['a:1535'].ru, al['a:1535'].t], [84, 'Тетрадь смерти', 'Death Note']);
  // на страницу: у открытой карточки балл с одной цифрой после запятой, у закрытой балла нет вовсе
  const it = { k: 'g:620', t: 'Portal 2', img: 'https://x/y.jpg', y: 2011, v: 98 };
  assert.deepEqual(view(it, true), { t: 'Portal 2', img: 'https://x/y.jpg', y: 2011, kind: 'game', src: 'Steam', s: 9.8 });
  assert.equal('s' in view(it, false), false);
  assert.ok(isRight({ v: 80 }, { v: 81 }, 'higher') && isRight({ v: 80 }, { v: 79 }, 'lower'));
  assert.ok(!isRight({ v: 80 }, { v: 79 }, 'higher') && !isRight({ v: 80 }, { v: 81 }, 'lower') && !isRight({ v: 80 }, { v: 81 }, 'x'));
});

test('выбор карточки: без повторов и без балла первой; все показаны — none; фильмы — только с ключом OMDb', async () => {
  const { env } = setup();
  assert.deepEqual(sourcesOf(env), ['g', 'a']);
  for (let i = 0; i < 40; i++) {
    const a = await pickItem(env, new Set(), null);
    const b = await pickItem(env, new Set([a.k]), a.v);
    assert.ok(a.k && b.k && a.k !== b.k && a.v !== b.v, 'в паре нет одинаковых баллов');
    assert.ok(!a.k.startsWith('m:') && !b.k.startsWith('m:'), 'без ключа OMDb фильмов нет');
  }
  const all = new Set([...GAMES.map((id) => 'g:' + id), ...ANIME.map((x) => 'a:' + x[0])]);
  assert.deepEqual(await pickItem(env, all, null), { none: true });
  // кусок списка спрашивается у источника один раз, дальше — из памяти
  const before = calls.steam + calls.ani;
  for (let i = 0; i < 20; i++) await pickItem(env, new Set(), null);
  assert.ok(calls.steam + calls.ani - before <= 9, 'не больше одного подзапроса на кусок');
  // с ключом — и фильмы (рейтинг и постер — OMDb через imdbLookup)
  const { env: env2 } = setup({ OMDB_KEY: 'test' });
  assert.deepEqual(sourcesOf(env2), ['g', 'a', 'm']);
  let movie = null;
  for (let i = 0; i < 60 && !movie; i++) { const x = await pickItem(env2, new Set(), null); if (x.k.startsWith('m:')) movie = x; }
  assert.ok(movie, 'фильм попадается');
  assert.ok(/[а-яё0-9]/i.test(movie.ru) && /^https:\/\/m\.media-amazon\.com\//.test(movie.img) && movie.v > 0);
  assert.equal(view(movie, true).src, 'IMDb');
});

test('забег гостя: пара без балла второй, верный ответ — новая пара, неверный — конец с баллом', async () => {
  const { call, runRow, rightPick } = setup();
  const s = await call('POST /games/hilo/start', { guest: 'g0123456789abcdef' });
  assert.ok(/^[0-9a-f]{32}$/.test(s.run));
  assert.equal(typeof s.a.s, 'number');
  assert.equal(s.b.s, undefined, 'балл второй до ответа не уходит');
  assert.equal(s.ms, ROUND_MS);
  assert.equal(s.signed, false);
  const row = runRow(s.run);
  assert.equal(row.user_id, null);
  assert.equal(row.guest, 'g0123456789abcdef');
  assert.equal(row.deadline, NOW + ROUND_MS);
  const hidden = JSON.parse(row.b).v / 10;
  const ok = await call('POST /games/hilo/answer', { run: s.run, pick: rightPick(s.run) }, null, NOW + 3000);
  assert.equal(ok.ok, true);
  assert.equal(ok.score, hidden);
  assert.equal(ok.streak, 1);
  assert.equal(ok.xp, 0, 'гостю опыта нет');
  assert.deepEqual(ok.a, { ...s.b, s: hidden }, 'вторая стала первой — уже с баллом');
  assert.equal(ok.b.s, undefined);
  assert.ok(ok.a.s !== ok.b.s);
  assert.equal(ok.wait, REVEAL_MS);
  assert.equal(runRow(s.run).deadline, NOW + 3000 + REVEAL_MS + ROUND_MS, 'срок — с выдачи плюс показ балла');
  const wrong = rightPick(s.run) === 'higher' ? 'lower' : 'higher';
  const hidden2 = JSON.parse(runRow(s.run).b).v / 10;
  const bad = await call('POST /games/hilo/answer', { run: s.run, pick: wrong }, null, NOW + 6000);
  assert.equal(bad.ok, false);
  assert.equal(bad.score, hidden2);
  assert.deepEqual({ why: bad.over.why, streak: bad.over.streak, s: bad.over.b.s }, { why: 'wrong', streak: 1, s: hidden2 });
  assert.equal(bad.over.best, undefined, 'у гостя рекордов нет');
  // законченный забег не продолжается
  const again = await call('POST /games/hilo/answer', { run: s.run, pick: 'higher' }, null, NOW + 7000);
  assert.deepEqual([again.ok, again.over.why], [false, 'wrong']);
  assert.equal((await call('POST /games/hilo/answer', { run: 'f'.repeat(32), pick: 'higher' })).status, 404);
  assert.equal((await call('POST /games/hilo/answer', { run: s.run, pick: 'maybe' })).status, 400);
  assert.equal((await call('POST /games/hilo/answer', { run: [s.run], pick: 'higher' })).status, 400, 'код игры — только строка');
});

test('срок хода и «ушёл со страницы»: позже срока — проигрыш, lose без входа заканчивает забег', async () => {
  const { call, runRow, rightPick } = setup();
  const s = await call('POST /games/hilo/start', {});
  const late = await call('POST /games/hilo/answer', { run: s.run, pick: rightPick(s.run) }, null, NOW + ROUND_MS + GRACE_MS + 1);
  assert.deepEqual([late.ok, late.over.why, late.over.streak], [false, 'time', 0]);
  assert.equal(typeof late.over.b.s, 'number', 'после конца балл второй виден');
  const s2 = await call('POST /games/hilo/start', {}, null, NOW + 60e3);
  const ok = await call('POST /games/hilo/answer', { run: s2.run, pick: rightPick(s2.run) }, null, NOW + 61e3);
  assert.equal(ok.ok, true);
  const gone = await call('POST /games/hilo/lose', { run: s2.run, why: 'left' }, null, NOW + 62e3);
  assert.deepEqual([gone.over.why, gone.over.streak], ['left', 1]);
  assert.equal(runRow(s2.run).status, 'lost');
  const after = await call('POST /games/hilo/answer', { run: s2.run, pick: rightPick(s2.run) }, null, NOW + 63e3);
  assert.deepEqual([after.ok, after.over.why], [false, 'left'], 'после ухода ответ не засчитывается');
  // таймер на странице дошёл до нуля
  const s3 = await call('POST /games/hilo/start', {}, null, NOW + 120e3);
  assert.equal((await call('POST /games/hilo/lose', { run: s3.run, why: 'time' }, null, NOW + 121e3)).over.why, 'time');
  assert.equal((await call('POST /games/hilo/lose', { run: 'nope' })).status, 400);
});

test('вошедший: рекорды за день и за всё время, опыт за первые 20 верных в день и раз в день за серию от 10', async () => {
  const { call, runRow, rightPick, given } = setup();
  const s = await call('POST /games/hilo/start', {}, 'u1');
  assert.equal(s.signed, true);
  assert.equal(runRow(s.run).user_id, 'u1');
  let t = NOW, last = null;
  for (let i = 1; i <= 22; i++) {
    t += 2000;
    last = await call('POST /games/hilo/answer', { run: s.run, pick: rightPick(s.run) }, 'u1', t);
    assert.equal(last.ok, true, 'ход ' + i);
    assert.equal(last.streak, i);
  }
  const hilo = given.flatMap((g) => g.items).filter((x) => x.kind === 'hilo');
  assert.equal(hilo.length, RULES.hilo.day, 'после дневного лимита опыт за ответы не спрашивается');
  assert.deepEqual(hilo.slice(0, 2).map((x) => x.ref), [`${s.run}:1`, `${s.run}:2`]);
  const bonus = given.flatMap((g) => g.items).filter((x) => x.kind === 'hilo_streak');
  assert.deepEqual(bonus, [{ kind: 'hilo_streak', ref: '2026-12-03' }]);
  assert.ok(given.every((g) => g.uid === 'u1'));
  assert.equal(last.xp, 0, '21-й и дальше — без опыта');
  const wrong = rightPick(s.run) === 'higher' ? 'lower' : 'higher';
  const end = await call('POST /games/hilo/answer', { run: s.run, pick: wrong }, 'u1', t + 2000);
  assert.deepEqual({ why: end.over.why, streak: end.over.streak, best: end.over.best, today: end.over.today, record: end.over.record }, { why: 'wrong', streak: 22, best: 22, today: 22, record: true });
  // вторая игра: слабее — не рекорд; новый день — «сегодня» с нуля, а лучшая серия остаётся
  const s2 = await call('POST /games/hilo/start', {}, 'u1', t + 10e3);
  await call('POST /games/hilo/answer', { run: s2.run, pick: rightPick(s2.run) }, 'u1', t + 11e3);
  const e2 = await call('POST /games/hilo/lose', { run: s2.run }, 'u1', t + 12e3);
  assert.deepEqual([e2.over.streak, e2.over.best, e2.over.record], [1, 22, false]);
  const st = await call('GET /games/hilo', null, 'u1', NOW + DAY);
  assert.deepEqual(st.me, { best: 22, today: 0, runs: 2 });
  // на следующий день опыт за ответы снова есть
  given.length = 0;
  const s3 = await call('POST /games/hilo/start', {}, 'u1', NOW + DAY);
  const a3 = await call('POST /games/hilo/answer', { run: s3.run, pick: rightPick(s3.run) }, 'u1', NOW + DAY + 2000);
  assert.equal(a3.xp, RULES.hilo.xp);
  assert.deepEqual(given[0].items, [{ kind: 'hilo', ref: `${s3.run}:1` }]);
});

test('таблица друзей: только принятые друзья, кто играл, и я; у гостя — без рекордов', async () => {
  const { call, q, rightPick } = setup();
  const g = await call('GET /games/hilo', null, null); // заодно создаёт таблицы
  const today = '2026-12-03';
  q('INSERT INTO hilo_best (user_id, best, best_at, day, day_best, day_ok, runs, updated_at) VALUES (?, ?, 1, ?, ?, 0, 3, 1)', 'f1', 7, today, 4);
  q('INSERT INTO hilo_best (user_id, best, best_at, day, day_best, day_ok, runs, updated_at) VALUES (?, ?, 1, ?, ?, 0, 9, 1)', 'f3', 50, today, 50);
  assert.equal(g.signed, false);
  assert.equal(g.me, undefined);
  assert.deepEqual(g.srcs, ['Steam', 'AniList']);
  assert.equal(g.round, ROUND_MS / 1000);
  assert.deepEqual(g.xp, { per: RULES.hilo.xp, day: RULES.hilo.day, bonus: RULES.hilo_streak.xp, at: STREAK_BONUS });
  const s = await call('POST /games/hilo/start', {}, 'u1');
  for (let i = 0; i < 3; i++) await call('POST /games/hilo/answer', { run: s.run, pick: rightPick(s.run) }, 'u1', NOW + 1000 * (i + 1));
  const st = await call('GET /games/hilo', null, 'u1', NOW + 5000);
  assert.deepEqual(st.friends.map((x) => [x.id, x.best, x.today, !!x.me]), [['f1', 7, 4, false], ['u1', 3, 3, true]], 'f3 — только заявка, не друг');
  assert.equal(st.friends[0].username, 'Вика');
  const solo = await call('GET /games/hilo', null, 'u2');
  assert.deepEqual([solo.me, solo.friends], [{ best: 0, today: 0, runs: 0 }, []]);
  // уровни выключены — подписи про опыт не нужны
  const { call: call2 } = setup({ LEVELS: '0' });
  assert.equal((await call2('GET /games/hilo', null, null)).xp, null);
});

test('чужой забег не продолжить; гость с кодом забега — может; новый старт закрывает прежний', async () => {
  const { call, runRow, rightPick } = setup();
  const s = await call('POST /games/hilo/start', {}, 'u1');
  assert.equal((await call('POST /games/hilo/answer', { run: s.run, pick: rightPick(s.run) }, 'u2')).status, 403);
  assert.equal((await call('POST /games/hilo/answer', { run: s.run, pick: rightPick(s.run) }, null)).status, 403);
  // уход со страницы приходит без входа (sendBeacon) — забег всё равно заканчивается
  const lost = await call('POST /games/hilo/lose', { run: s.run }, null);
  assert.equal(lost.over.why, 'left');
  assert.equal(lost.over.best, undefined, 'без входа — без рекордов в ответе');
  const s2 = await call('POST /games/hilo/start', {}, 'u1', NOW + 1000);
  const s3 = await call('POST /games/hilo/start', {}, 'u1', NOW + 2000);
  assert.deepEqual([runRow(s2.run).status, runRow(s2.run).why, runRow(s3.run).status], ['lost', 'left', 'live']);
  const g1 = await call('POST /games/hilo/start', { guest: 'guestaaaaaaaaaaaa' }, null, NOW + 3000);
  const g2 = await call('POST /games/hilo/start', { guest: 'guestaaaaaaaaaaaa' }, null, NOW + 4000);
  assert.deepEqual([runRow(g1.run).status, runRow(g2.run).status], ['lost', 'live']);
});

test('двойное нажатие: засчитывается один ответ', async () => {
  const { call, rightPick } = setup();
  const s = await call('POST /games/hilo/start', {}, 'u1');
  const pick = rightPick(s.run);
  const [x, y] = await Promise.all([call('POST /games/hilo/answer', { run: s.run, pick }, 'u1', NOW + 1000), call('POST /games/hilo/answer', { run: s.run, pick }, 'u1', NOW + 1000)]);
  assert.deepEqual([x.ok === true, y.ok === true].sort(), [false, true]);
  assert.equal([x, y].filter((r) => r.status === 409).length, 1);
});

test('источник не ответил: без AniList играем играми, без всех — 503', async () => {
  const { call } = setup();
  down.ani = true;
  for (let i = 0; i < 5; i++) {
    const s = await call('POST /games/hilo/start', {}, null, NOW + i * 1000);
    assert.equal(s.a.kind, 'game');
    assert.equal(s.b.kind, 'game');
  }
  forgetScores();
  down.steam = true;
  const none = await call('POST /games/hilo/start', {}, null, NOW + 10e3);
  assert.equal(none.status, 503);
});
