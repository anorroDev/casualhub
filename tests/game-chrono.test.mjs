// «Хронология»: набор дня, счёт, ответ один раз, гости без записи, опыт, серия и обложки. node --test tests/game-chrono.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { chronoOf, setOf, scoreOf, numberOf, nextDayAt, coverPick, coverQuery, makeChronoRoutes, CHRONO_N, CHRONO_MAX } from '../functions/_lib/game-chrono.js';
import { POOL, riddleOf } from '../functions/_lib/riddle.js';

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
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const DAY = 864e5;
const NOW = Date.UTC(2026, 11, 3, 10); // 3 декабря 2026, 12:00 по Киеву — «Хронология» №3
const dayOf = (i) => new Date(Date.UTC(2026, 11, 1) + i * DAY).toISOString().slice(0, 10);
const at = async (t, fn) => { const real = Date.now; Date.now = () => t; try { return await fn(); } finally { Date.now = real; } };
const sorted = (ids) => ids.slice().sort((a, b) => POOL[a].y - POOL[b].y);

function setup(users = {}) {
  const env = { DB: fakeD1() };
  const given = [], asked = [];
  const routes = makeChronoRoutes({
    json: (o) => o, fail: (status, error) => ({ status, error }), readBody: async (req) => (req && req.body) || {},
    burst: () => 0, clientIp: () => '1.2.3.4',
    currentUser: async (e, req) => users[req && req.token] || null,
    lvGive: async (e, req, me, uid, items) => { given.push({ uid, items }); },
    cachedJson: async (url) => { asked.push(url); throw new Error('нет сети'); },
  });
  return { env, routes, given, asked };
}

test('набор дня: пять разных лет, разброс от 10 лет, не больше двух одного вида, без загадки дня и без двух прошлых дней', () => {
  assert.equal(numberOf('2026-12-01'), 1);
  assert.equal(numberOf('2026-12-03'), 3);
  assert.deepEqual(chronoOf('2026-12-03'), chronoOf('2026-12-03'), 'весь день — один и тот же набор');
  let prev = [], prev2 = [];
  for (let i = 0; i < 400; i++) {
    const d = dayOf(i), { n, ids } = chronoOf(d), set = setOf(ids), ys = set.map((x) => x.y);
    assert.equal(n, i + 1);
    assert.equal(new Set(ids).size, CHRONO_N, d);
    assert.equal(new Set(ys).size, CHRONO_N, `${d}: годы разные`);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 10, `${d}: от старого до нового — от 10 лет`);
    const kinds = {};
    set.forEach((x) => { kinds[x.t] = (kinds[x.t] || 0) + 1; });
    assert.ok(Object.values(kinds).every((k) => k <= 2), `${d}: одного вида не больше двух`);
    assert.ok(!ids.includes(POOL.indexOf(riddleOf(d).r)), `${d}: без сегодняшней загадки`);
    assert.ok(scoreOf(set, ids).score <= 4, `${d}: карточки перемешаны, а не почти по годам`);
    // внутри блока из 28 дней карточки двух прошлых дней не повторяются
    if (i % 28 >= 2) assert.ok(!ids.some((x) => prev.includes(x) || prev2.includes(x)), `${d}: без вчерашних карточек`);
    prev2 = prev; prev = ids;
  }
  // посчитанный «вперёд» день и потом более ранний — те же наборы, что и по порядку
  const later = JSON.stringify(chronoOf(dayOf(1000)));
  assert.deepEqual(chronoOf(dayOf(5)), chronoOf(dayOf(5)));
  assert.equal(JSON.stringify(chronoOf(dayOf(1000))), later);
  assert.notDeepEqual(chronoOf(dayOf(0)).ids, chronoOf(dayOf(1)).ids);
  // до запуска (проверки на тестовом сайте) — тоже набор, номер не больше нуля
  assert.equal(chronoOf('2026-11-26').ids.length, CHRONO_N);
  assert.ok(chronoOf('2026-11-26').n <= 0);
});

test('счёт: на своём месте плюс соседи по порядку, всего 9', () => {
  const ids = chronoOf('2026-12-03').ids, set = setOf(ids), right = sorted(ids);
  const best = scoreOf(set, right);
  assert.deepEqual([best.pos, best.pairs, best.score, best.max, best.perfect], [5, 4, 9, 9, true]);
  assert.deepEqual(best.right, right);
  const back = scoreOf(set, right.slice().reverse());
  assert.deepEqual([back.pos, back.pairs, back.score, back.perfect], [1, 0, 1, false], 'задом наперёд — на месте только средняя');
  const swap = [right[1], right[0], ...right.slice(2)];
  const s = scoreOf(set, swap);
  assert.deepEqual([s.pos, s.pairs, s.score], [3, 3, 6]);
  assert.deepEqual(s.ok, [false, false, true, true, true]);
  assert.equal(s.years[right[0]], POOL[right[0]].y);
  assert.equal(CHRONO_MAX, 9);
});

test('полночь по Киеву: зимой 22:00 UTC, летом 21:00 UTC', () => {
  assert.equal(new Date(nextDayAt(Date.UTC(2026, 11, 3, 10))).toISOString(), '2026-12-03T22:00:00.000Z');
  assert.equal(new Date(nextDayAt(Date.UTC(2026, 11, 3, 22, 0))).toISOString(), '2026-12-04T22:00:00.000Z');
  assert.equal(new Date(nextDayAt(Date.UTC(2027, 6, 1, 10))).toISOString(), '2027-07-01T21:00:00.000Z');
});

test('гость: набор без годов, ответ считается, но ничего не записывается и опыта нет', async () => {
  const { env, routes, given } = setup();
  const s = await at(NOW, () => routes['GET /games/chrono']({ env, request: {} }));
  assert.equal(s.day, '2026-12-03');
  assert.equal(s.n, 3);
  assert.equal(s.signed, false);
  assert.equal(s.result, null);
  assert.equal(s.items.length, CHRONO_N);
  assert.ok(s.items.every((x) => Object.keys(x).sort().join() === 'en,id,title,type'), 'у карточек нет года');
  assert.ok(!/"(y|year|years)"/.test(JSON.stringify(s)), 'годы до ответа не уходят');
  const order = sorted(s.items.map((x) => x.id));
  const r = await at(NOW + 60e3, () => routes['POST /games/chrono']({ env, request: { body: { order, day: s.day } } }));
  assert.equal(r.saved, false);
  assert.equal(r.result.score, 9);
  assert.equal(r.result.perfect, true);
  assert.equal(Object.keys(r.result.years).length, CHRONO_N);
  assert.deepEqual(given, []);
  const t = env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'chrono_days'").get();
  assert.ok(!t || env.DB.raw.prepare('SELECT COUNT(*) AS n FROM chrono_days').get().n === 0, 'гость ничего не пишет');
});

test('вошедший: ответ один раз в день, повтор — тот же итог, опыт за игру и за порядок без ошибок', async () => {
  const me = { id: 'u1' };
  const { env, routes, given } = setup({ t1: me });
  const req = (body) => ({ token: 't1', body });
  const s = await at(NOW, () => routes['GET /games/chrono']({ env, request: req() }));
  assert.equal(s.signed, true);
  assert.equal(s.result, null);
  const right = sorted(s.items.map((x) => x.id));
  const wrong = [right[1], right[0], ...right.slice(2)];
  const r = await at(NOW + 60e3, () => routes['POST /games/chrono']({ env, request: req({ order: wrong, day: s.day }) }));
  assert.equal(r.saved, true);
  assert.equal(r.again, false);
  assert.equal(r.result.score, 6);
  assert.deepEqual(r.result.order, wrong);
  assert.deepEqual(given, [{ uid: 'u1', items: [{ kind: 'chrono', ref: '2026-12-03' }] }], 'не без ошибок — только опыт за игру');
  // второй ответ (уже верный) ничего не меняет: тот же итог, опыта больше нет
  const again = await at(NOW + 120e3, () => routes['POST /games/chrono']({ env, request: req({ order: right, day: s.day }) }));
  assert.equal(again.again, true);
  assert.equal(again.result.score, 6);
  assert.deepEqual(again.result.order, wrong);
  assert.equal(given.length, 1);
  const g = await at(NOW + 180e3, () => routes['GET /games/chrono']({ env, request: req() }));
  assert.equal(g.result.score, 6);
  assert.deepEqual(g.items.map((x) => x.id), s.items.map((x) => x.id), 'карточки — в том же порядке, что были');
  assert.equal(g.streak, 1);
  // завтра — без ошибок: опыт за игру и бонус, серия 2, вчерашний день в истории
  const s2 = await at(NOW + DAY, () => routes['GET /games/chrono']({ env, request: req() }));
  assert.equal(s2.n, 4);
  assert.equal(s2.result, null);
  const r2 = await at(NOW + DAY, () => routes['POST /games/chrono']({ env, request: req({ order: sorted(s2.items.map((x) => x.id)) }) }));
  assert.equal(r2.result.perfect, true);
  assert.deepEqual(given[1], { uid: 'u1', items: [{ kind: 'chrono', ref: '2026-12-04' }, { kind: 'chrono_perfect', ref: '2026-12-04' }] });
  assert.equal(r2.streak, 2);
  assert.deepEqual(r2.history, [{ day: '2026-12-03', n: 3, score: 6, perfect: false }]);
  // пропустил день — серия заново
  const s4 = await at(NOW + 3 * DAY, () => routes['GET /games/chrono']({ env, request: req() }));
  assert.equal(s4.streak, 0);
  assert.equal(s4.history.length, 2);
});

test('вошедший: двойное нажатие — один итог и опыт один раз', async () => {
  const { env, routes, given } = setup({ t1: { id: 'u1' } });
  const s = await at(NOW, () => routes['GET /games/chrono']({ env, request: { token: 't1' } }));
  const order = s.items.map((x) => x.id);
  const [a, b] = await at(NOW, () => Promise.all([0, 1].map(() => routes['POST /games/chrono']({ env, request: { token: 't1', body: { order } } }))));
  assert.deepEqual([a.again, b.again].sort(), [false, true]);
  assert.equal(a.result.score, b.result.score);
  assert.equal(given.length, 1);
});

test('ответ: только все пять карточек дня; вчерашняя страница получает «обнови»', async () => {
  const { env, routes, given } = setup({ t1: { id: 'u1' }, tb: { id: 'u2', banned: 1 } });
  const s = await at(NOW, () => routes['GET /games/chrono']({ env, request: {} }));
  const ids = s.items.map((x) => x.id);
  const post = (body, token = 't1') => at(NOW, () => routes['POST /games/chrono']({ env, request: { token, body } }));
  assert.equal((await post({ order: ids.slice(0, 4) })).status, 400);
  assert.equal((await post({ order: [ids[0], ...ids.slice(0, 4)] })).status, 400, 'повтор карточки');
  const foreign = POOL.findIndex((_, i) => !ids.includes(i));
  assert.equal((await post({ order: [foreign, ...ids.slice(1)] })).status, 400, 'чужая карточка');
  assert.equal((await post({ order: 'abc' })).status, 400);
  assert.equal((await post({ order: ids, day: '2026-12-02' })).status, 409);
  assert.deepEqual(given, []);
  // заблокированный — как гость: счёт есть, записи нет
  const b = await post({ order: ids }, 'tb');
  assert.equal(b.saved, false);
  assert.equal(b.signed, false);
});

test('обложки: с IMDb того же вида и года; не нашлось или нет сети — без обложки', async () => {
  const img = (n) => `https://m.media-amazon.com/images/M/MV5B${n}@._V1_.jpg`;
  const doom = { id: 1, a: 'Doom', en: '', t: 'game', y: 2016 };
  const list = [
    { l: 'Doom', qid: 'videoGame', y: 1993, i: { imageUrl: img('old') } },
    { l: 'Doom', qid: 'movie', y: 2005, i: { imageUrl: img('film') } },
    { l: 'Doom', qid: 'videoGame', y: 2016, i: { imageUrl: img('new') } },
  ];
  assert.equal(coverPick(doom, list), img('new').replace('._V1_.jpg', '._V1_QL75_UX160_.jpg'));
  assert.equal(coverPick({ ...doom, y: 2018 }, list), img('new').replace('._V1_.jpg', '._V1_QL75_UX160_.jpg'), 'год на два в сторону — при том же названии (Minecraft на IMDb — 2009)');
  assert.equal(coverPick({ ...doom, y: 2010 }, list), '', 'другого года — нет');
  const dune = { id: 2, a: 'Дюна', en: 'Dune', t: 'movie', y: 2021 };
  assert.equal(coverPick(dune, [{ l: 'Dune: Part One', qid: 'movie', y: 2021, i: { imageUrl: img('dune') } }]), img('dune').replace('._V1_.jpg', '._V1_QL75_UX160_.jpg'));
  assert.equal(coverPick(dune, [{ l: 'Dune: Part One', qid: 'movie', y: 2022, i: { imageUrl: img('dune') } }]), '', 'другое название и другой год — нет');
  assert.equal(coverPick(dune, [{ l: 'Dune', qid: 'movie', y: 2021, i: { imageUrl: 'https://evil.example/x.jpg' } }]), '', 'картинка только с IMDb');
  const rdr = { id: 3, a: 'Red Dead Redemption 2', en: '', t: 'game', y: 2018 };
  assert.ok(coverPick(rdr, [{ l: 'Red Dead Redemption II', qid: 'videoGame', y: 2018, i: { imageUrl: img('rdr') } }]), 'II — это 2');
  assert.equal(coverQuery({ a: 'Брат', en: '' }), 'Brother');
  assert.equal(coverQuery({ a: 'Неизвестное', en: '' }), '', 'кириллицу IMDb не ищем');
  // маршрут: без сети — пусто (и игра работает без обложек)
  const { env, routes, asked } = setup();
  const r = await at(NOW, () => routes['GET /games/chrono/covers']({ env, request: {} }));
  assert.deepEqual(r.covers, {});
  assert.ok(asked.length >= 4 && asked.every((u) => u.startsWith('https://v3.sg.media-imdb.com/suggestion/x/')));
  // с ответами IMDb: у каждого своя обложка, запоминается на день
  const ids = chronoOf('2026-12-03').ids, set = setOf(ids);
  let calls = 0;
  const kindOf = { game: 'videoGame', movie: 'movie', series: 'tvSeries', anime: 'tvSeries' };
  const ok = makeChronoRoutes({
    json: (o) => o, fail: (status, error) => ({ status, error }),
    cachedJson: async (url) => {
      calls++;
      const x = set.find((it) => url.includes(encodeURIComponent(coverQuery(it).toLowerCase())));
      return { d: x ? [{ l: coverQuery(x), qid: kindOf[x.t], y: x.y, i: { imageUrl: img('c' + x.id) } }] : [] };
    },
  });
  const c = await at(NOW, () => ok['GET /games/chrono/covers']({ env, request: {} }));
  assert.deepEqual(Object.keys(c.covers).map(Number).sort(), set.filter((x) => coverQuery(x)).map((x) => x.id).sort());
  const before = calls;
  await at(NOW, () => ok['GET /games/chrono/covers']({ env, request: {} }));
  assert.equal(calls, before, 'второй раз за день — из памяти');
});
