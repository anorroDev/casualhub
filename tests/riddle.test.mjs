// «Загадка дня»: выбор по дню, подсказки, сравнение ответов, серия, попытки при ответах сразу. node --test tests/riddle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { POOL, riddleOf, hintsOf, isRight, norm, streakOf, makeRiddleRoutes, MAX_TRIES } from '../functions/_lib/riddle.js';
import { dayKey } from '../functions/_lib/levels.js';

test('загадка выбирается по дню, одна на всех; №1 — 12 ноября 2026', () => {
  assert.equal(riddleOf('2026-11-12').n, 1);
  assert.equal(riddleOf('2026-11-13').n, 2);
  assert.deepEqual(riddleOf('2026-11-20').r, riddleOf('2026-11-20').r);
  // за круг по списку загадки не повторяются
  const seen = new Set();
  for (let i = 0; i < POOL.length; i++) seen.add(riddleOf(new Date(Date.UTC(2026, 10, 12) + i * 864e5).toISOString().slice(0, 10)).r.a);
  assert.equal(seen.size, POOL.length);
});

test('у каждой загадки пять подсказок и разные ответы', () => {
  assert.ok(POOL.length >= 60);
  assert.equal(new Set(POOL.map((r) => norm(r.a))).size, POOL.length);
  for (const r of POOL) { assert.equal(hintsOf(r).length, 5); assert.ok(r.y > 1900 && r.y < 2030, r.a); }
});

test('ответ: без регистра и знаков, по вариантам, одна опечатка у длинных', () => {
  const w = POOL.find((r) => r.en === 'The Witcher 3: Wild Hunt');
  assert.ok(isRight(w, 'Ведьмак 3'));
  assert.ok(isRight(w, 'the witcher 3: wild hunt'));
  assert.ok(isRight(w, 'ведмак 3 дикая охота'));
  assert.ok(!isRight(w, 'ведьмак 2'));
  assert.ok(!isRight(w, ''));
  const d = POOL.find((r) => r.a === 'Дюна');
  assert.ok(isRight(d, 'дюна') && isRight(d, 'Dune') && !isRight(d, 'дюны'), 'короткие — без опечаток');
});

test('серия: дни подряд до сегодня или до вчера', () => {
  assert.equal(streakOf(['2026-11-12', '2026-11-11', '2026-11-10'], '2026-11-12'), 3);
  assert.equal(streakOf(['2026-11-11', '2026-11-10'], '2026-11-12'), 2);
  assert.equal(streakOf(['2026-11-10'], '2026-11-12'), 0);
  assert.equal(streakOf([], '2026-11-12'), 0);
});

// ---------- ответы: SQLite в памяти, тот же вид, что у D1 ----------
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
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT);
    CREATE TABLE friendships (a TEXT, b TEXT, status TEXT, PRIMARY KEY (a, b));`);
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const NOW = Date.UTC(2026, 10, 20, 10);
const DAY = dayKey(NOW, 'Europe/Kiev');
const RIGHT = riddleOf(DAY).r.a;
async function setup(before = []) {
  const env = { DB: fakeD1() };
  const given = [];
  const routes = makeRiddleRoutes({
    json: (o) => o, fail: (status, error) => ({ status, error }), readBody: async (req) => (req && req.body) || {},
    lvGive: async (e, req, me, uid, items) => { given.push(items); },
  });
  const me = { id: 'u1' };
  const real = Date.now;
  Date.now = () => NOW;
  try { await routes['GET /riddle']({ env, me }); } finally { Date.now = real; } // заводит таблицу
  if (before.length) env.DB.raw.prepare('INSERT INTO riddle_tries (user_id, day, tries, solved, at) VALUES (?, ?, ?, 0, ?)').run('u1', DAY, JSON.stringify(before), NOW);
  // ответы сразу: оба запроса читают попытки до того, как кто-то из них записал
  const both = async (...gs) => { const real = Date.now; Date.now = () => NOW; try { return await Promise.all(gs.map((g) => routes['POST /riddle/guess']({ env, request: { body: { g } }, me }))); } finally { Date.now = real; } };
  const row = () => { const x = env.DB.raw.prepare('SELECT tries, solved FROM riddle_tries WHERE user_id = ? AND day = ?').get('u1', DAY); return { tries: JSON.parse(x.tries), solved: x.solved }; };
  return { env, routes, given, both, row };
}
const wrong = (n) => Array.from({ length: n }, (_, i) => `мимо ${i + 1}`);

test('ответы сразу: каждая неверная попытка засчитана, ни одна не потерялась', async () => {
  const { both, row } = await setup();
  const [a, b] = await both('мимо а', 'мимо б');
  assert.equal(row().tries.length, 2);
  assert.deepEqual(row().tries.sort(), ['мимо а', 'мимо б']);
  assert.equal(b.tries.length, 2, 'второй ответ видит обе попытки');
  assert.ok(!a.ok && !b.ok);
});

test('ответы сразу: попыток не больше шести, отгадку неверный ответ не затирает', async () => {
  // последняя попытка: верный и неверный ответ сразу — засчитан первый, второй уже видит итог
  let s = await setup(wrong(MAX_TRIES - 1));
  let [a, b] = await s.both(RIGHT, 'мимо последний');
  assert.equal(s.row().solved, 1, 'отгадка осталась');
  assert.equal(s.row().tries.length, MAX_TRIES);
  assert.ok(a.ok && a.solved && b.solved);
  assert.equal(s.given.length, 1, 'опыт — один раз');
  // неверный первым: попытки кончились, верный ответ седьмой попыткой не засчитывается
  s = await setup(wrong(MAX_TRIES - 1));
  [a, b] = await s.both('мимо последний', RIGHT);
  assert.equal(s.row().solved, 0);
  assert.equal(s.row().tries.length, MAX_TRIES);
  assert.ok(b.over && !b.ok);
  assert.equal(s.given.length, 0);
  // отгадал — повтор того же ответа ничего не меняет и опыт второй раз не даёт
  s = await setup();
  [a, b] = await s.both(RIGHT, RIGHT);
  assert.deepEqual(s.row(), { tries: [RIGHT], solved: 1 });
  assert.equal(s.given.length, 1);
});
