// Тесты уровней: node --test tests/levels.test.mjs
// База — настоящий SQLite в памяти (node:sqlite) с тем же видом, что у D1: prepare().bind().first()/all()/run() и batch().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { needFor, totalFor, levelOf, rankOf, dayKey, award, revoke, readLevel, levelsMode, RULES } from '../functions/_lib/levels.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isRead = (sql) => /^\s*(SELECT|PRAGMA)/i.test(sql);
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
const envOf = (LEVELS = '1') => ({ DB: fakeD1(), LEVELS });
const NOON = Date.UTC(2026, 10, 11, 12, 0, 0); // 11 ноября 2026, 12:00 UTC
const DAY = 864e5;

test('формула уровня', () => {
  assert.equal(needFor(1), 120);
  assert.equal(needFor(7), 300);
  assert.equal(totalFor(1), 0);
  assert.equal(totalFor(2), 120);
  assert.equal(totalFor(3), 270);
  assert.equal(totalFor(5), 660);
  assert.equal(totalFor(10), 2160);
  assert.equal(totalFor(20), 7410);
  assert.equal(totalFor(50), 41160);
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 120 });
  assert.deepEqual(levelOf(119), { level: 1, into: 119, need: 120 });
  assert.deepEqual(levelOf(120), { level: 2, into: 0, need: 150 });
  assert.deepEqual(levelOf(2160 + 5), { level: 10, into: 5, need: 390 });
  // каждый следующий уровень дороже предыдущего
  for (let l = 1; l < 60; l++) assert.ok(needFor(l + 1) > needFor(l));
});

test('звания по уровню', () => {
  assert.equal(rankOf(1).fun, 'Залётный');
  assert.equal(rankOf(9).fun, 'Казуал');
  assert.equal(rankOf(10).fun, 'Диванный критик');
  assert.equal(rankOf(99).fun, 'Легенда хаба');
});

test('флаг', () => {
  assert.equal(levelsMode({}), 'off');
  assert.equal(levelsMode({ LEVELS: '0' }), 'off');
  assert.equal(levelsMode({ LEVELS: 'admins' }), 'admins');
  assert.equal(levelsMode({ LEVELS: '1' }), 'all');
});

test('выключено: ничего не пишется и таблиц нет', async () => {
  const env = envOf('0');
  assert.equal(await award(env, 'u1', 'rate', 'r1', { now: NOON }), null);
  assert.equal(await revoke(env, 'u1', 'rate', 'r1'), null);
  const t = env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  assert.equal(t.length, 0);
});

test('начисление и повтор', async () => {
  const env = envOf();
  const a = await award(env, 'u1', 'rate', 'r1', { now: NOON });
  assert.equal(a.gained, 10);
  assert.equal(a.xp, 10);
  assert.equal(a.level, 1);
  // то же самое ещё раз — ничего
  assert.equal(await award(env, 'u1', 'rate', 'r1', { now: NOON }), null);
  // другой человек — своё
  assert.equal((await award(env, 'u2', 'rate', 'r1', { now: NOON })).xp, 10);
  assert.equal((await readLevel(env, 'u1')).xp, 10);
});

test('дневной лимит оценок: 8 по 10, ещё 20 по 2, дальше 0; новый уровень сообщается один раз', async () => {
  const env = envOf();
  const got = [];
  let ups = 0;
  for (let i = 0; i < 30; i++) {
    const r = await award(env, 'u1', 'rate', 'r' + i, { now: NOON + i });
    got.push(r.gained);
    if (r.levelUp) { ups++; assert.deepEqual(r.levelUp, { from: 1, to: 2 }); }
  }
  assert.deepEqual(got.slice(0, 8), Array(8).fill(10));
  assert.deepEqual(got.slice(8, 28), Array(20).fill(2));
  assert.deepEqual(got.slice(28), [0, 0]);
  assert.equal(got.reduce((a, b) => a + b, 0), 120);
  assert.equal(ups, 1);
  assert.equal((await readLevel(env, 'u1')).level, 2);
  // на следующий день лимит снова полный
  assert.equal((await award(env, 'u1', 'rate', 'next', { now: NOON + DAY })).gained, 10);
});

test('лимит на пару людей', async () => {
  const env = envOf();
  const g = [];
  for (let i = 0; i < 4; i++) g.push((await award(env, 'u1', 'react', 'a' + i, { peer: 'friendA', now: NOON })).gained);
  assert.deepEqual(g, [3, 3, 3, 0]);
  // другому другу — снова полный опыт
  assert.equal((await award(env, 'u1', 'react', 'b0', { peer: 'friendB', now: NOON })).gained, 3);
});

test('лимит за всё время (импорт)', async () => {
  const env = envOf();
  let sum = 0;
  for (let i = 0; i < 103; i++) sum += (await award(env, 'u1', 'import', 'i' + i, { now: NOON + i * DAY })).gained;
  assert.equal(sum, 100);
});

test('списание: опыт уходит, уровень остаётся, повтор не начисляется, место в лимите занято', async () => {
  const env = envOf();
  for (let i = 0; i < 12; i++) await award(env, 'u1', 'rate', 'r' + i, { now: NOON });
  const before = await readLevel(env, 'u1');
  assert.equal(before.xp, 88); // 8 по 10 и 4 по 2
  await award(env, 'u1', 'past', 'all', { xp: 100, now: NOON });
  assert.equal((await readLevel(env, 'u1')).level, 2);
  const r = await revoke(env, 'u1', 'rate', 'r0', { now: NOON });
  assert.equal(r.lost, 10);
  assert.equal(r.xp, 178);
  assert.equal(r.level, 2);
  const lv = await readLevel(env, 'u1');
  assert.equal(lv.level, 2); // 178 опыта: уровень не падает
  assert.ok(lv.into >= 0);
  // второй раз списывать нечего
  assert.equal(await revoke(env, 'u1', 'rate', 'r0', { now: NOON }), null);
  // удалил и добавил заново — опыта нет
  assert.equal(await award(env, 'u1', 'rate', 'r0', { now: NOON }), null);
  // удалённая оценка всё равно занимает место в лимите дня: следующая идёт по 2
  assert.equal((await award(env, 'u1', 'rate', 'r12', { now: NOON })).gained, 2);
});

test('опыт за прошлое — сколько передали, без лимитов', async () => {
  const env = envOf();
  const r = await award(env, 'u1', 'past', 'backfill-v1', { xp: 833, now: NOON });
  assert.equal(r.gained, 833);
  assert.equal(r.level, 5); // 833 опыта: до 6-го нужно 900
  assert.deepEqual(r.levelUp, { from: 1, to: 5 });
  assert.equal(await award(env, 'u1', 'past', 'backfill-v1', { xp: 833, now: NOON }), null);
});

test('день — по часовому поясу человека', async () => {
  // 22:30 UTC 11 ноября — в Киеве уже 12 ноября, в Нью-Йорке ещё 11-е
  const late = Date.UTC(2026, 10, 11, 22, 30);
  assert.equal(dayKey(late, 'UTC'), '2026-11-11');
  assert.equal(dayKey(late, 'Europe/Kyiv'), '2026-11-12');
  assert.equal(dayKey(late, 'America/New_York'), '2026-11-11');
  assert.equal(dayKey(late, 'Не/Пояс'), '2026-11-11');
  // запомненный пояс работает и без запроса: «зашёл сегодня» дважды за киевский день — один раз
  const env = envOf();
  assert.equal((await award(env, 'u1', 'visit', 'v-a', { tz: 'Europe/Kyiv', now: late })).gained, 5);
  assert.equal((await award(env, 'u1', 'visit', 'v-b', { now: late + 3600e3 })).gained, 0);
});

test('неизвестное действие — ошибка в коде, а не тихий ноль', async () => {
  await assert.rejects(() => award(envOf(), 'u1', 'nope', 'x'));
});

test('у каждого правила есть опыт', () => {
  for (const [k, r] of Object.entries(RULES)) assert.ok(Number.isFinite(r.xp), k);
});
