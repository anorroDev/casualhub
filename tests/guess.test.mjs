// «Угадай оценку друга»: очки за точность, набор дня, ответы один раз, опыт и таблица недели.
// node --test tests/guess.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { pointsFor, pickSet, makeGuessRoutes, GUESS_N } from '../functions/_lib/guess.js';

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
    CREATE TABLE friendships (a TEXT, b TEXT, status TEXT, requested_by TEXT, created_at INTEGER, PRIMARY KEY (a, b));
    CREATE TABLE shelves (user_id TEXT PRIMARY KEY, data TEXT, updated_at INTEGER);`);
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
const NOW = Date.UTC(2026, 11, 3, 10); // четверг, 3 декабря 2026
const fresh = new Date(NOW - 5 * DAY).toISOString();
const r = (id, name, total, extra = {}) => ({ id, name, total, scores: total == null ? [] : [{ v: total }], catName: 'Игры', createdAt: fresh, updatedAt: fresh, ...extra });

test('очки: чем ближе к баллу друга, тем больше', () => {
  assert.equal(pointsFor(8, 7.9), 3);
  assert.equal(pointsFor(8, 7.8), 3, 'ползунок с шагом 0,5 точнее не попадёт — это «в точку»');
  assert.equal(pointsFor(7.5, 7.5), 3);
  assert.equal(pointsFor(7, 7.5), 2);
  assert.equal(pointsFor(8.5, 7.8), 2);
  assert.equal(pointsFor(6.5, 7.6), 1);
  assert.equal(pointsFor(5, 7.6), 0);
});

test('набор дня: только видимые друзьям оценки с баллом, сначала разные друзья, весь день один и тот же', () => {
  const sh = [
    { owner: 'f1', ratings: [r('a', 'Hades', 9), r('b', 'Dune', 6, { vis: 'private' }), r('c', 'Old', 5, { createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }), r('p', 'План', null, { status: 'В планах' })] },
    { owner: 'f2', ratings: [r('d', 'Blonde', 8.6), r('e', 'Ivy', 7, { albumOf: 'd', trackNo: 2 }), r('x', 'Пример', 5, { example: true })] },
    { owner: 'f3', ratings: [r('g', 'Hollow Knight', 9.5), r('h', 'Doom', 7)] },
  ];
  const a = pickSet(sh, 'u1:2026-12-03', NOW);
  assert.equal(a.length, GUESS_N);
  const ids = a.map((x) => x.rid).sort();
  assert.deepEqual(ids, ['a', 'c', 'd', 'g', 'h'], 'без скрытой, «В планах», трека и примера; старая — только если свежих не хватило');
  assert.equal(new Set(a.slice(0, 3).map((x) => x.owner)).size, 3, 'первые три — от разных друзей');
  assert.deepEqual(pickSet(sh, 'u1:2026-12-03', NOW), a, 'весь день — тот же набор');
  assert.equal(a.find((x) => x.rid === 'a').total, 9);
  // свежих хватает — старая не попадает
  const many = [{ owner: 'f1', ratings: [r('a1', 'A', 5), r('a2', 'B', 6), r('a3', 'C', 7), r('c', 'Old', 5, { createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' })] }, { owner: 'f2', ratings: [r('b1', 'D', 8), r('b2', 'E', 9)] }];
  assert.ok(!pickSet(many, 's', NOW).some((x) => x.rid === 'c'));
  assert.deepEqual(pickSet([], 's', NOW), []);
  // категория, которую друг скрыл из профиля, в игру не идёт (как и в его профиле)
  const hid = [{ owner: 'f1', hide: ['игры'], ratings: [r('g1', 'Игра', 7, { cat: 'Игры' }), r('m1', 'Фильм', 8, { cat: 'Фильмы', catName: 'Фильмы' })] }];
  assert.deepEqual(pickSet(hid, 's', NOW).map((x) => x.rid), ['m1']);
});

async function setup() {
  const env = { DB: fakeD1() };
  const q = (sql, ...a) => env.DB.raw.prepare(sql).run(...a);
  q("INSERT INTO users (id, username, uname) VALUES ('u1', 'Аня', 'anya'), ('f1', 'Боря', 'borya'), ('f2', 'Вика', 'vika'), ('f3', 'Гоша', 'gosha'), ('u9', 'Одинокий', 'solo')");
  q("INSERT INTO friendships (a, b, status) VALUES ('u1', 'f1', 'accepted'), ('f2', 'u1', 'accepted'), ('u1', 'f3', 'pending')");
  const shelf = (id, ratings) => q('INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, 1)', id, JSON.stringify({ ratings }));
  shelf('u1', [r('m1', 'Portal', 9), r('m2', 'Skyrim', 6)]);
  shelf('f1', [r('a', 'Hades', 9), r('b', 'Dune', 6, { vis: 'private' }), r('c', 'Doom', 7)]);
  shelf('f2', [r('d', 'Blonde', 8.5), r('e', 'Ivy', 4)]);
  shelf('f3', [r('z', 'Чужое', 1)]); // только заявка — не друг
  const given = [], metrics = [];
  const routes = makeGuessRoutes({
    json: (o) => o, fail: (status, error) => ({ status, error }), readBody: async (req) => (req && req.body) || {},
    lvGive: async (e, req, me, uid, items, opts) => { given.push({ uid, items }); metrics.push(opts && opts.metrics); },
  });
  return { env, routes, given, metrics };
}
const at = async (t, fn) => { const real = Date.now; Date.now = () => t; try { return await fn(); } finally { Date.now = real; } };

test('игра: набор без баллов, ответы один раз, очки, опыт и таблица недели', async () => {
  const { env, routes, given, metrics } = await setup();
  const me = { id: 'u1' };
  const s = await at(NOW, () => routes['GET /guess']({ env, me }));
  assert.equal(s.day, '2026-12-03');
  assert.equal(s.done, false);
  assert.equal(s.items.length, 4, 'у друзей всего 4 видимые оценки: скрытая и чужая заявка не в счёт');
  assert.ok(s.items.every((x) => x.total === undefined), 'балл друга до ответа не отдаётся');
  assert.ok(s.items.every((x) => x.friend && x.friend.username));
  assert.ok(!s.items.some((x) => x.rid === 'b' || x.rid === 'z'));
  const answers = Object.fromEntries(s.items.map((x) => [x.k, x.rid === 'a' ? 9 : x.rid === 'e' ? 9.5 : 5]));
  const res = await at(NOW + 60e3, () => routes['POST /guess']({ env, request: { body: { answers } }, me }));
  assert.equal(res.done, true);
  const byRid = Object.fromEntries(res.items.map((x) => [x.rid, x]));
  assert.deepEqual([byRid.a.total, byRid.a.guess, byRid.a.points], [9, 9, 3]);
  assert.deepEqual([byRid.e.total, byRid.e.points], [4, 0]);
  assert.equal(res.score, res.items.reduce((sum, x) => sum + x.points, 0));
  assert.equal(res.max, 3 * 4);
  assert.deepEqual(given, [{ uid: 'u1', items: [{ kind: 'guess', ref: '2026-12-03' }] }], 'опыт — один раз за день');
  assert.deepEqual(metrics[0], { telepath: 1 }, 'для «Телепата» — сколько всего баллов угадано в точку');
  assert.equal((await at(NOW + 120e3, () => routes['POST /guess']({ env, request: { body: { answers } }, me }))).status, 409);
  const again = await at(NOW + 180e3, () => routes['GET /guess']({ env, me }));
  assert.equal(again.done, true);
  assert.equal(again.score, res.score);
  // друг сыграл тоже — таблица недели: я и друзья, по сумме очков с понедельника
  const fs = await at(NOW, () => routes['GET /guess']({ env, me: { id: 'f1' } }));
  await at(NOW, () => routes['POST /guess']({ env, request: { body: { answers: Object.fromEntries(fs.items.map((x) => [x.k, 1])) } }, me: { id: 'f1' } }));
  const b = (await at(NOW + 240e3, () => routes['GET /guess']({ env, me }))).board;
  assert.deepEqual(b.map((x) => x.id), ['u1', 'f1']);
  assert.ok(b[0].me && b[0].score === res.score);
  // ответы — числа от 1 до 10; не на всё ответил — 0 очков за пропущенное
  const s2 = await at(NOW + DAY, () => routes['GET /guess']({ env, me }));
  const part = { [s2.items[0].k]: 42 };
  const res2 = await at(NOW + DAY, () => routes['POST /guess']({ env, request: { body: { answers: part } }, me }));
  assert.equal(res2.items[0].guess, 10);
  assert.ok(res2.items.slice(1).every((x) => x.guess === null && x.points === 0));
});

test('игра: два ответа сразу (двойное нажатие) — засчитывается один, опыт один раз', async () => {
  const { env, routes, given } = await setup();
  const me = { id: 'u1' };
  const s = await at(NOW, () => routes['GET /guess']({ env, me }));
  const answers = Object.fromEntries(s.items.map((x) => [x.k, 7]));
  const [a, b] = await at(NOW, () => Promise.all([routes['POST /guess']({ env, request: { body: { answers } }, me }), routes['POST /guess']({ env, request: { body: { answers } }, me })]));
  assert.deepEqual([a.done === true, b.done === true].sort(), [false, true]);
  assert.equal([a, b].filter((x) => x.status === 409).length, 1);
  assert.equal(given.length, 1);
});

test('игра: без друзей и у друзей без оценок — пусто, с причиной', async () => {
  const { env, routes } = await setup();
  const solo = await at(NOW, () => routes['GET /guess']({ env, me: { id: 'u9' } }));
  assert.deepEqual({ items: solo.items, empty: solo.empty }, { items: [], empty: 'friends' });
  env.DB.raw.prepare("INSERT INTO friendships (a, b, status) VALUES ('u9', 'f3', 'accepted')").run();
  env.DB.raw.prepare("UPDATE shelves SET data = ? WHERE user_id = 'f3'").run(JSON.stringify({ ratings: [r('z', 'Скрыто', 3, { vis: 'private' })] }));
  const none = await at(NOW, () => routes['GET /guess']({ env, me: { id: 'u9' } }));
  assert.equal(none.empty, 'ratings');
  assert.equal((await at(NOW, () => routes['POST /guess']({ env, request: { body: { answers: {} } }, me: { id: 'u9' } }))).status, 400);
});
