// Тесты уровней: node --test tests/levels.test.mjs
// База — настоящий SQLite в памяти (node:sqlite) с тем же видом, что у D1: prepare().bind().first()/all()/run() и batch().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as L from '../functions/_lib/levels.js';

const { needFor, totalFor, levelOf, rankOf, dayKey, shiftDay, weekStart, award, awardMany, revoke, readLevel, levelsMode, RULES, ACHIEVEMENTS, streakStep, shelfDiff, takeNews, questState, firstSteps, backfillUser, lotsWon, visit, achievementsOf, levelsOf, unlockedAt } = L;

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
  // таблицы сайта, которые читают уровни
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, created_at INTEGER, email_ok INTEGER);
    CREATE TABLE friendships (a TEXT, b TEXT, status TEXT, requested_by TEXT, created_at INTEGER, PRIMARY KEY (a, b));
    CREATE TABLE shelves (user_id TEXT PRIMARY KEY, data TEXT, updated_at INTEGER);
    CREATE TABLE photos (key TEXT PRIMARY KEY, user_id TEXT, data TEXT, updated_at INTEGER);
    CREATE TABLE tierlists (user_id TEXT, id TEXT, data TEXT, meta TEXT, private INTEGER, at INTEGER, PRIMARY KEY (user_id, id));
    CREATE TABLE reactions (owner_id TEXT, rid TEXT, from_id TEXT, emoji TEXT, text TEXT, at INTEGER, PRIMARY KEY (owner_id, rid, from_id));
    CREATE TABLE comments (id TEXT PRIMARY KEY, owner_id TEXT, target TEXT, from_id TEXT, text TEXT, at INTEGER);
    CREATE TABLE lot_rooms (id TEXT PRIMARY KEY, owner_id TEXT, live TEXT);
    CREATE TABLE lots (room_id TEXT, id TEXT, user_id TEXT, name TEXT, created_at INTEGER);
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);`);
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
const bare = { noExtras: true }; // только правила опыта, без серий, заданий и наград
const q = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);

test('формула уровня', () => {
  assert.equal(needFor(1), 120);
  assert.equal(needFor(7), 300);
  assert.equal(totalFor(2), 120);
  assert.equal(totalFor(3), 270);
  assert.equal(totalFor(10), 2160);
  assert.equal(totalFor(50), 41160);
  assert.deepEqual(levelOf(119), { level: 1, into: 119, need: 120 });
  assert.deepEqual(levelOf(120), { level: 2, into: 0, need: 150 });
  for (let l = 1; l < 60; l++) assert.ok(needFor(l + 1) > needFor(l));
});

test('звания, флаг, награды по уровням', () => {
  assert.equal(rankOf(1).fun, 'Залётный');
  assert.equal(rankOf(10).fun, 'Диванный критик');
  assert.equal(levelsMode({}), 'off');
  assert.equal(levelsMode({ LEVELS: 'admins' }), 'admins');
  assert.equal(levelsMode({ LEVELS: '1' }), 'all');
  assert.deepEqual(unlockedAt(1).frames, []);
  assert.deepEqual(unlockedAt(12).frames, ['frame1', 'frame2']);
  assert.ok(!unlockedAt(29).colors.includes('gold'));
  assert.ok(unlockedAt(30).colors.includes('gold'));
});

test('дни и недели', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(weekStart('2026-11-11'), '2026-11-09'); // среда → понедельник
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // воскресенье → тот же понедельник
  const late = Date.UTC(2026, 10, 11, 22, 30);
  assert.equal(dayKey(late, 'Europe/Kyiv'), '2026-11-12');
  assert.equal(dayKey(late, 'Не/Пояс'), '2026-11-11');
});

test('выключено: ничего не пишется и таблиц уровней нет', async () => {
  const env = envOf('0');
  assert.equal(await award(env, 'u1', 'rate', 'r1', { now: NOON }), null);
  assert.equal(await revoke(env, 'u1', 'rate', 'r1'), null);
  assert.equal(await visit(env, 'u1', 'UTC'), null);
  assert.equal(q(env, "SELECT name FROM sqlite_master WHERE name IN ('xp_log', 'user_level')").length, 0);
});

test('начисление и повтор', async () => {
  const env = envOf();
  const a = await award(env, 'u1', 'rate', 'r1', { now: NOON, ...bare });
  assert.equal(a.gained, 10);
  assert.equal(await award(env, 'u1', 'rate', 'r1', { now: NOON, ...bare }), null);
  assert.equal((await award(env, 'u2', 'rate', 'r1', { now: NOON, ...bare })).xp, 10);
});

test('дневной лимит оценок и пачка за один вызов (импорт сотни разом)', async () => {
  const env = envOf();
  const r = await awardMany(env, 'u1', Array.from({ length: 30 }, (_, i) => ({ kind: 'rate', ref: 'r' + i })), { now: NOON, ...bare });
  assert.equal(r.gained, 8 * 10 + 20 * 2);
  assert.deepEqual(r.levelUp, { from: 1, to: 2 });
  const rows = q(env, 'SELECT xp FROM xp_log ORDER BY at, rowid');
  assert.equal(rows.length, 30);
  // на следующий день лимит снова полный
  assert.equal((await award(env, 'u1', 'rate', 'next', { now: NOON + DAY, ...bare })).gained, 10);
  // 500 действий за раз — тоже одна пачка, лимит «за всё время» у импорта соблюдается
  const imp = await awardMany(env, 'u3', Array.from({ length: 500 }, (_, i) => ({ kind: 'import', ref: 'i' + i })), { now: NOON, ...bare });
  assert.equal(imp.gained, 100);
});

test('лимит на пару людей', async () => {
  const env = envOf();
  const g = [];
  for (let i = 0; i < 4; i++) g.push((await award(env, 'u1', 'react', 'a' + i, { peer: 'friendA', now: NOON, ...bare })).gained);
  assert.deepEqual(g, [3, 3, 3, 0]);
  assert.equal((await award(env, 'u1', 'react', 'b0', { peer: 'friendB', now: NOON, ...bare })).gained, 3);
});

test('списание: опыт уходит, уровень остаётся, повтор не начисляется', async () => {
  const env = envOf();
  await awardMany(env, 'u1', Array.from({ length: 12 }, (_, i) => ({ kind: 'rate', ref: 'r' + i })), { now: NOON, ...bare });
  await award(env, 'u1', 'past', 'x', { xp: 100, now: NOON, ...bare });
  assert.equal((await readLevel(env, 'u1')).level, 2);
  const r = await revoke(env, 'u1', 'rate', 'r0', { now: NOON });
  assert.equal(r.xp, 178);
  assert.equal(r.level, 2);
  assert.equal(await revoke(env, 'u1', 'rate', 'r0', { now: NOON }), null);
  assert.equal(await award(env, 'u1', 'rate', 'r0', { now: NOON, ...bare }), null);
  assert.equal((await award(env, 'u1', 'rate', 'r12', { now: NOON, ...bare })).gained, 2);
});

test('серия: подряд, заморозка, сброс, бонус за 7 дней', () => {
  let st = {};
  const days = [];
  let d = '2026-11-02';
  for (let i = 0; i < 7; i++) { const s = streakStep(st, d); st = { streak: s.streak, streak_day: d, best_streak: s.best, freezes: s.freezes, freeze_week: s.freezeWeek }; days.push(s.streak); d = shiftDay(d, 1); }
  assert.deepEqual(days, [1, 2, 3, 4, 5, 6, 7]);
  // пропуск одного дня — заморозка
  const skip = streakStep(st, shiftDay(st.streak_day, 2));
  assert.equal(skip.streak, 8);
  assert.ok(skip.froze);
  // два дня пропуска — с начала
  assert.equal(streakStep(st, shiftDay(st.streak_day, 3)).streak, 1);
  // тот же день — без изменений
  assert.equal(streakStep(st, st.streak_day).changed, false);
});

test('серия и бонус в живом начислении', async () => {
  const env = envOf();
  let last;
  for (let i = 0; i < 7; i++) last = await award(env, 'u1', 'rate', 'r' + i, { now: NOON + i * DAY });
  assert.ok(last.news.some((n) => n.t === 'streak' && n.streak === 7 && n.xp === 30));
  const row = q(env, 'SELECT streak, best_streak FROM user_level WHERE user_id = ?', 'u1')[0];
  assert.equal(row.streak, 7);
  // «зашёл на сайт» серию не продлевает
  await visit(env, 'u1', 'UTC', NOON + 7 * DAY);
  assert.equal(q(env, 'SELECT streak_day FROM user_level WHERE user_id = ?', 'u1')[0].streak_day, '2026-11-17');
  const ach = await achievementsOf(env, 'u1');
  assert.equal(ach.find((a) => a.code === 'rhythm').tier, 1);
});

test('задания дня: выбираются по возможностям, засчитываются и платятся один раз', async () => {
  const env = envOf();
  const today = dayKey(NOON, 'UTC');
  // без друзей и планов — только задания «для себя»
  const st = await questState(env.DB ? (await L.ensureLevels(env), env) : env, 'u1', { now: NOON, today });
  assert.equal(st.daily.length, 3);
  for (const d of st.daily) assert.ok(['rate2', 'review1', 'full1'].includes(d.code));
  assert.ok(['tier1', 'rate10'].includes(st.weekly.code));
  // выполнить «оцени 2»: опыт за задание приходит с последним действием
  await award(env, 'u1', 'rate', 'a', { now: NOON });
  const r = await award(env, 'u1', 'rate', 'b', { now: NOON });
  assert.ok(r.news.some((n) => n.t === 'quest' && n.title === 'Оцени 2 произведения'));
  const again = await award(env, 'u1', 'rate', 'c', { now: NOON });
  assert.ok(!again.news.some((n) => n.t === 'quest' && n.title === 'Оцени 2 произведения'));
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM xp_log WHERE kind = 'quest'")[0].n >= 1, true);
});

test('первые шаги и уведомления', async () => {
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1, 1)");
  const r = await award(env, 'u1', 'rate', 'r1', { now: NOON });
  const titles = r.news.filter((n) => n.t === 'first').map((n) => n.title);
  assert.ok(titles.includes('Первая оценка'));
  assert.ok(titles.includes('Подтверди почту'));
  const steps = await firstSteps(env, 'u1');
  assert.ok(steps.find((s) => s.code === 'rate').paid);
  assert.ok(!steps.find((s) => s.code === 'friend').done);
  // уведомления копятся и забираются один раз
  const news = await takeNews(env, 'u1');
  assert.ok(news.length >= 2);
  assert.deepEqual(await takeNews(env, 'u1'), []);
});

test('достижения: ступени и скрытые', async () => {
  const env = envOf();
  await awardMany(env, 'u1', Array.from({ length: 10 }, (_, i) => ({ kind: 'rate', ref: 'r' + i })), { now: NOON });
  let a = await achievementsOf(env, 'u1');
  const critic = a.find((x) => x.code === 'critic');
  assert.equal(critic.tier, 1);
  assert.equal(critic.next, 100);
  const night = a.find((x) => x.code === 'night');
  assert.equal(night.title, '???');
  await award(env, 'u1', 'rate', 'late', { now: NOON + DAY, metrics: { night: 1 } });
  a = await achievementsOf(env, 'u1');
  assert.equal(a.find((x) => x.code === 'night').title, 'Ночной критик');
  assert.ok(ACHIEVEMENTS.length >= 20);
});

test('полка: что начислить и что списать', () => {
  const plan = { id: 'p', status: 'В планах', scores: [], total: null };
  const scoredPlan = { id: 'p', status: 'Просмотрено', scores: [{ v: 8 }], total: 8 };
  const review = { id: 'r', status: 'Просмотрено', scores: [{ v: 7 }, { v: 9 }], total: 8, note: 'x'.repeat(120), photo: { url: 'https://a/b.jpg' } };
  const lb = { id: 'l', src: 'letterboxd', scores: [{ v: 6 }], total: 6 };
  const ex = { id: 'e', example: true, scores: [{ v: 1 }], total: 1 };
  const d = shelfDiff([plan, { id: 'gone', scores: [{ v: 1 }], total: 1 }], [scoredPlan, review, lb, ex]);
  const give = d.give.map((x) => x.kind + ':' + x.ref).sort();
  assert.deepEqual(give, ['import:l', 'plan_done:p', 'rate:p', 'rate:r', 'rate_full:r', 'review:r']);
  assert.ok(d.take.some((x) => x.ref === 'gone' && x.kind === 'rate'));
  assert.equal(d.metrics.cats, 0);
  // правка уже оценённого — ничего нового
  assert.deepEqual(shelfDiff([review], [{ ...review, total: 9 }]).give, []);
});

test('опыт за прошлое: строки как у живых действий, повтор ничего не удваивает', async () => {
  const env = envOf();
  const ratings = Array.from({ length: 60 }, (_, i) => ({ id: 'r' + i, cat: i % 4 ? 'movie' : 'game', status: 'Просмотрено', scores: [{ v: 5 }], total: 5, createdAt: new Date(NOON - (60 - i) * DAY).toISOString(), note: i < 3 ? 'y'.repeat(150) : '' }));
  env.DB.raw.exec(`INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1000, 0), ('u2', 'Боб', 'bob', 1000, 0)`);
  env.DB.raw.prepare('INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?)').run('u1', JSON.stringify({ ratings }), NOON);
  env.DB.raw.exec("INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES ('u1', 'u2', 'accepted', 'u1', 5000)");
  const lv = await backfillUser(env, 'u1', { now: NOON, founderBefore: NOON });
  // 50 × 10 + 10 × 3 + 3 отзыва × 5 + друг 15 + первые шаги (оценка 20, друг 30)
  assert.equal(lv.xp, 500 + 30 + 15 + 15 + 50);
  const again = await backfillUser(env, 'u1', { now: NOON, founderBefore: NOON });
  assert.equal(again.xp, lv.xp);
  const a = await achievementsOf(env, 'u1');
  assert.ok(a.find((x) => x.code === 'founder').got);
  assert.equal(a.find((x) => x.code === 'critic').tier, 1);
  // после пересчёта нет праздничных плашек
  assert.deepEqual(await takeNews(env, 'u1'), []);
  // живое действие с уже засчитанной оценкой опыта не даёт
  assert.equal(await award(env, 'u1', 'rate', 'r5', { now: NOON + DAY }), null);
});

test('лоты: ведущему и победителю один раз', async () => {
  const env = envOf();
  env.DB.raw.exec(`INSERT INTO lot_rooms (id, owner_id) VALUES ('room', 'host');
    INSERT INTO lots (room_id, id, user_id, name) VALUES ('room', 'l1', 'a', 'Hades'), ('room', 'l2', 'b', 'Hades'), ('room', 'l3', 'c', 'Celeste');`);
  const live = { winner: { n: 'Hades', at: NOON }, pickL: 'l2' };
  await lotsWon(env, 'room', live);
  await lotsWon(env, 'room', live);
  assert.equal((await readLevel(env, 'host')).xp >= 30, true);
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM xp_log WHERE kind = 'lots_host'")[0].n, 1);
  assert.equal(q(env, "SELECT user_id FROM xp_log WHERE kind = 'lot_win'")[0].user_id, 'b');
});

test('уровни для списка людей: скрывшие уровень не видны', async () => {
  const env = envOf();
  await award(env, 'u1', 'rate', 'r', { now: NOON, ...bare });
  await award(env, 'u2', 'rate', 'r', { now: NOON, ...bare });
  env.DB.raw.exec(`UPDATE user_level SET prefs = '{"hideLevel":true}' WHERE user_id = 'u2'`);
  const m = await levelsOf(env, ['u1', 'u2', 'u3']);
  assert.deepEqual(Object.keys(m), ['u1']);
  assert.equal(m.u1.level, 1);
});

test('тематическая неделя: ×2 к выбранным действиям и ачивка участника', async () => {
  const env = envOf();
  L.forgetEvent();
  await L.ensureLevels(env);
  env.DB.raw.prepare("INSERT INTO meta (k, v) VALUES ('levels_event', ?)").run(JSON.stringify({ id: 'ev1', title: 'Неделя тир-листов', kinds: ['tier'], mult: 2, until: NOON + DAY }));
  const r = await award(env, 'u1', 'tier', 't1', { now: NOON });
  assert.ok(r.gained >= 50);
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM xp_log WHERE kind = 'event'")[0].n, 1);
  assert.equal((await achievementsOf(env, 'u1')).find((a) => a.code === 'event').tier, 1);
  L.forgetEvent();
});

test('неизвестное действие — ошибка в коде', async () => {
  await assert.rejects(() => award(envOf(), 'u1', 'nope', 'x'));
  for (const [k, r] of Object.entries(RULES)) assert.ok(r.given || Number.isFinite(r.xp), k);
});

test('почта: письмо о новом уровне с тем, что открылось', async () => {
  const env = envOf();
  await awardMany(env, 'u1', Array.from({ length: 30 }, (_, i) => ({ kind: 'rate', ref: 'r' + i })), { now: NOON, ...bare });
  const g = q(env, "SELECT id, to_id, kind, title, body FROM gifts WHERE to_id = 'u1'");
  assert.equal(g.length, 1);
  assert.equal(g[0].title, 'Новый уровень: 2');
  assert.match(g[0].body, /Кружок уровня у аватара/);
  // опыт за прошлое писем не шлёт
  await award(env, 'u2', 'past', 'x', { xp: 500, now: NOON, past: true });
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM gifts WHERE to_id = 'u2'")[0].n, 0);
});

test('опыт за прошлое сам при первом заходе (ensurePast), один раз', async () => {
  const { ensurePast } = await import('../functions/_lib/levels-api.js');
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1000, 0)");
  env.DB.raw.prepare('INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?)').run('u1', JSON.stringify({ ratings: [{ id: 'a', status: 'Просмотрено', scores: [{ v: 8 }], total: 8, createdAt: new Date(NOON - DAY).toISOString() }] }), NOON);
  await ensurePast(env, 'u1');
  const lv = await readLevel(env, 'u1');
  assert.equal(lv.xp, 10 + 20); // оценка и первый шаг «Первая оценка»
  await award(env, 'u1', 'visit', 'd1', { now: NOON, ...bare });
  await ensurePast(env, 'u1');
  assert.equal((await readLevel(env, 'u1')).xp, 35);
  assert.ok((await achievementsOf(env, 'u1')).find((a) => a.code === 'founder').got);
});
