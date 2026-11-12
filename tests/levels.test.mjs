// Тесты уровней: node --test tests/levels.test.mjs
// База — настоящий SQLite в памяти (node:sqlite) с тем же видом, что у D1: prepare().bind().first()/all()/run() и batch().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as L from '../functions/_lib/levels.js';

const { needFor, totalFor, levelOf, dayKey, shiftDay, weekStart, award, awardMany, revoke, readLevel, levelsMode, RULES, ACHIEVEMENTS, streakStep, shelfDiff, takeNews, questState, firstSteps, backfillUser, lotsWon, visit, achievementsOf, levelsOf, unlockedAt } = L;

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

test('флаг и награды по уровням', () => {
  assert.equal(levelsMode({}), 'off');
  assert.equal(levelsMode({ LEVELS: 'admins' }), 'admins');
  assert.equal(levelsMode({ LEVELS: '1' }), 'all');
  assert.deepEqual(unlockedAt(1).frames, []);
  assert.deepEqual(unlockedAt(12).frames, ['frame1', 'frame5', 'frame2']);
  assert.deepEqual(unlockedAt(7).nicks, []);
  assert.deepEqual(unlockedAt(17).nicks, ['outline']);
  assert.deepEqual(unlockedAt(35).nicks, ['outline', 'shadow', 'arcade', 'rainbow']);
  // шрифты ника: пара — сразу всем, остальные — по уровням; админу — все
  assert.deepEqual(unlockedAt(1).fonts, ['comfortaa', 'caveat']);
  assert.ok(!unlockedAt(13).fonts.includes('aladin') && unlockedAt(14).fonts.includes('aladin'));
  assert.equal(unlockedAt(1, true).fonts.length, 17);
  assert.ok(!unlockedAt(24).pet && unlockedAt(25).pet);
  assert.ok(!unlockedAt(49).bgs.includes('legend') && unlockedAt(50).bgs.includes('legend'));
  assert.equal(unlockedAt(1, true).frames.length, 6); // админу открыто всё
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
  assert.ok(r.news.some((n) => n.t === 'quest' && n.title === 'Поставь 2 оценки'));
  const again = await award(env, 'u1', 'rate', 'c', { now: NOON });
  assert.ok(!again.news.some((n) => n.t === 'quest' && n.title === 'Поставь 2 оценки'));
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
  assert.equal(critic.have, 10);
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
  // звание теперь сезонное: 120 опыта за сезон — ещё «Людишка», до «Казуала» (300) — 180
  assert.match(g[0].body, /Звание сезона: Людишка\. До «Казуал» в этом сезоне ещё 180 опыта\./);
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

// ---------- сезоны ----------
const H = 3600e3; // Киев: зимой UTC+2, летом UTC+3
const NOV1 = Date.UTC(2026, 10, 1) - 2 * H, DEC1 = Date.UTC(2026, 11, 1) - 2 * H, FEB1 = Date.UTC(2027, 1, 1) - 2 * H, MAY1 = Date.UTC(2027, 4, 1) - 3 * H; // сезон — три месяца
const rates = (p, n) => Array.from({ length: n }, (_, i) => ({ kind: 'rate', ref: p + i }));
// обращения к D1, как их считает Cloudflare: first/all/run — по одному, пачка (batch) — один запрос
function counted(env) {
  const db = env.DB;
  let n = 0;
  const wrap = (st) => ({ ...st, bind: (...a) => wrap(st.bind(...a)), first: () => { n++; return st.first(); }, all: () => { n++; return st.all(); }, run: () => { n++; return st.run(); } });
  env.DB = { ...db, prepare: (sql) => wrap(db.prepare(sql)), batch: (list) => { n++; return db.batch(list); } };
  return () => n;
}
// адреса уровней с заглушками помощников главного файла API
async function levelRoutes(extra = {}) {
  const { makeLevelsRoutes } = await import('../functions/_lib/levels-api.js');
  const seen = { pokeAll: 0, ann: undefined };
  const routes = makeLevelsRoutes({
    json: (o) => o, fail: (status, message) => ({ status, message }), readBody: async (r) => (r && r.body) || {},
    adminActive: async () => true, isAdmin: async () => !!extra.admin, adminCandidate: () => !!extra.admin, adminLog: async () => {},
    poke: async () => {}, pokeAll: async () => { seen.pokeAll++; }, markNews: () => {},
    getAnnounce: async () => seen.ann || null, setAnnounce: async (e, a) => { seen.ann = a; },
  });
  return { routes, seen };
}
async function atTime(t, fn) {
  const real = Date.now;
  Date.now = () => t;
  try { return await fn(); } finally { Date.now = real; }
}

test('сезон: пороги званий, «Величайший» наверху', () => {
  const R = L.SEASON_RANKS;
  assert.deepEqual(R.map((r) => r.id), ['people', 'casual', 'couch', 'whiner', 'champion', 'godlike', 'taste', 'legend', 'greatest']);
  assert.equal(R[R.length - 1].title, 'Величайший');
  assert.equal(R[0].xp, 0);
  for (let i = 1; i < R.length; i++) assert.ok(R[i].xp > R[i - 1].xp);
  assert.equal(L.seasonRankOf(299).id, 'people');
  assert.equal(L.seasonRankOf(300).id, 'casual');
  assert.equal(L.seasonRankOf(1500).id, 'champion');
  assert.equal(L.seasonRankOf(11999).id, 'legend');
  assert.equal(L.seasonRankOf(1e9).id, 'greatest');
  assert.equal(L.nextSeasonRank(460).id, 'couch');
  assert.equal(L.nextSeasonRank(12000), null);
});

test('сезон: по умолчанию — три месяца по Киеву, сброс 1-го в 00:00', () => {
  assert.equal(L.SEASON_MONTHS, 3);
  assert.equal(L.monthStartKyiv(NOON), NOV1);
  assert.equal(L.defaultSeasonEnd(NOV1), FEB1);
  // начали посреди месяца (сброс админом 25 ноября): конец — тоже 1 февраля
  assert.equal(L.defaultSeasonEnd(Date.UTC(2026, 10, 25)), FEB1);
  assert.equal(L.defaultSeasonEnd(FEB1), MAY1);
  assert.equal(L.fmtKyiv(FEB1), '1 февраля в 00:00 по Киеву');
});

test('сезон: первый — с начала месяца, звание по опыту за сезон, уровень — по всему опыту', async () => {
  const env = envOf();
  await L.ensureLevels(env);
  // октябрьский опыт в сезон не входит
  env.DB.raw.prepare("INSERT INTO xp_log (user_id, kind, ref, xp, day, peer, at) VALUES ('u1', 'gift', 'old', 5000, '2026-10-20', NULL, ?)").run(NOV1 - 10 * DAY);
  const s = await L.currentSeason(env, NOON);
  assert.deepEqual({ n: s.n, title: s.title, start: s.start, end: s.end }, { n: 1, title: 'Сезон 1', start: NOV1, end: FEB1 });
  const r = await awardMany(env, 'u1', rates('r', 16), { now: NOON, ...bare });
  assert.equal(r.seasonXp, 8 * 10 + 8 * 2);
  assert.equal(await L.seasonXpOf(env, 'u1', s), 96);
  assert.ok(r.level >= 10);
  assert.ok(!r.news.some((n) => n.t === 'rank'));
});

test('сезон: «Новое звание» в плашках и звание сезона в письме о новом уровне', async () => {
  const env = envOf();
  await awardMany(env, 'u1', rates('a', 16), { now: NOON, ...bare }); // 96
  const b = await awardMany(env, 'u1', [{ kind: 'gift', ref: 'g1', xp: 400 }], { now: NOON + DAY, ...bare }); // +400 → 496
  assert.deepEqual(b.news.filter((n) => n.t === 'rank'), [{ t: 'rank', rank: 'casual', title: 'Казуал' }]);
  assert.equal(b.news.find((n) => n.t === 'level').rank, 'Казуал');
  const g = q(env, "SELECT body FROM gifts WHERE id = 'lv:u1:4'")[0];
  assert.equal(g.body, 'Звание сезона: Казуал. До «Диванный критик» в этом сезоне ещё 4 опыта.');
  assert.ok((await takeNews(env, 'u1')).some((n) => n.t === 'rank' && n.rank === 'casual'));
});

test('сезон: закрывается один раз — итоги и места одним запросом, следующий сезон, письмо, плашка', async () => {
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1, 1), ('u2', 'Боб', 'bob', 1, 1), ('u3', 'Вера', 'vera', 1, 1)");
  await L.ensureLevels(env);
  const ins = env.DB.raw.prepare("INSERT INTO xp_log (user_id, kind, ref, xp, day, peer, at, gone) VALUES (?, 'gift', ?, ?, '2026-11-11', NULL, ?, ?)");
  ins.run('u1', 'g1', 1600, NOON, 0);
  ins.run('u2', 'g2', 200, NOON, 0);
  ins.run('u2', 'g3', 50, NOV1 - DAY, 0); // до сезона
  ins.run('u3', 'g4', 700, NOON, 1); // удалённое не считается
  ins.run('u1', 'late', 999, FEB1 + 1000, 0); // уже следующий сезон
  env.DB.raw.exec("INSERT INTO user_level (user_id, xp, level, updated_at) VALUES ('u1', 2599, 1, 1), ('u2', 250, 1, 1), ('u3', 0, 1, 1)");
  assert.equal((await L.currentSeason(env, NOON)).n, 1);
  // два запроса сразу после срока: закрывает один, оба видят сезон 2
  const [a, b] = await Promise.all([L.currentSeason(env, FEB1 + 5000), L.currentSeason(env, FEB1 + 5000)]);
  assert.deepEqual([a.n, b.n], [2, 2]);
  assert.deepEqual({ start: a.start, end: a.end, title: a.title }, { start: FEB1, end: MAY1, title: 'Сезон 2' });
  const res = q(env, 'SELECT user_id, xp, rank, place FROM season_results WHERE season = 1 ORDER BY place').map((r) => ({ ...r }));
  assert.deepEqual(res, [{ user_id: 'u1', xp: 1600, rank: 'champion', place: 1 }, { user_id: 'u2', xp: 200, rank: 'people', place: 2 }]);
  assert.equal(q(env, 'SELECT COUNT(*) AS n FROM seasons WHERE closed_at IS NULL')[0].n, 1);
  const letter = q(env, "SELECT to_id, title, body FROM gifts WHERE kind = 'season'");
  assert.equal(letter.length, 1);
  assert.equal(letter[0].to_id, null);
  assert.equal(letter[0].title, 'Сезон 1 закончился, начался сезон 2');
  assert.match(letter[0].body, /Следующий сброс — 1 мая в 00:00 по Киеву\./);
  // плашка «Новый сезон» с итогами — у каждого, у кого есть уровни, один раз
  const news = (await takeNews(env, 'u1')).filter((n) => n.t === 'season');
  assert.equal(news.length, 1);
  assert.equal(news[0].n, 2);
  assert.deepEqual(news[0].prev, { n: 1, rank: 'champion', xp: 1600, place: 1 });
  assert.equal((await takeNews(env, 'u3')).find((n) => n.t === 'season').prev, null);
  // новый сезон: у u1 — только то, что после сброса; итоги видны в истории
  assert.equal(await L.seasonXpOf(env, 'u1', a), 999);
  // снова позже — ничего не удваивается
  await L.currentSeason(env, FEB1 + 60e3);
  assert.equal(q(env, 'SELECT COUNT(*) AS n FROM season_results')[0].n, 2);
  assert.equal(q(env, 'SELECT COUNT(*) AS n FROM seasons')[0].n, 2);
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM gifts WHERE kind = 'season'")[0].n, 1);
  // итоги года: звание — лучшее из сезонов года
  env.DB.raw.exec('ALTER TABLE lot_rooms ADD COLUMN created_at INTEGER');
  const { recap } = await import('../functions/_lib/levels-api.js');
  const y = await recap(env, 'u1', 2026);
  assert.deepEqual({ rank: y.rank, rankId: y.rankId }, { rank: 'Чемпион', rankId: 'champion' });
});

test('сезон: поле season в /levels/me и звание в профиле', async () => {
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1, 0)");
  const { routes } = await levelRoutes();
  await awardMany(env, 'u1', rates('r', 30), { now: NOON, ...bare }); // 120
  await awardMany(env, 'u1', rates('s', 8), { now: NOON + DAY, ...bare }); // +80 → 200
  await awardMany(env, 'u1', [{ kind: 'gift', ref: 'g1', xp: 300 }], { now: NOON + DAY, ...bare }); // +300 → 500
  const m = await atTime(NOON + DAY, () => routes['GET /levels/me']({ env, request: { cf: { timezone: 'Europe/Moscow' } }, me: { id: 'u1' } }));
  assert.deepEqual({ n: m.season.n, start: m.season.start, end: m.season.end, xp: m.season.xp, rank: m.season.rank }, { n: 1, start: NOV1, end: FEB1, xp: 500, rank: 'couch' });
  assert.deepEqual(m.season.ranks.map((r) => r.id), L.SEASON_RANKS.map((r) => r.id));
  assert.deepEqual(m.season.history, []);
  assert.equal(m.rank, 'Диванный критик');
  assert.equal(m.rankId, 'couch');
  // после сброса: опыт сезона с нуля, прошлый — в истории
  const after = await atTime(FEB1 + 1000, () => routes['GET /levels/me']({ env, request: { cf: { timezone: 'Europe/Moscow' } }, me: { id: 'u1' } }));
  assert.equal(after.season.n, 2);
  assert.equal(after.season.xp, 0);
  assert.equal(after.rank, 'Людишка');
  assert.deepEqual(after.season.history, [{ n: 1, title: 'Сезон 1', rank: 'couch', xp: 500, place: 1 }]);
  const p = await atTime(FEB1 + 2000, () => routes['GET /levels/profile']({ env, request: { url: 'https://x/api/levels/profile?id=u1' }, me: { id: 'u1' } }));
  assert.equal(p.rank, 'Людишка');
});

test('сезон: админ назначает сброс — письмо всем и объявление; «Сбросить сейчас»', async () => {
  const env = envOf();
  const { routes, seen } = await levelRoutes({ admin: true });
  const me = { id: 'a'.repeat(24), handle: 'admin' };
  await atTime(NOON, async () => {
    const end = DEC1 - 3600e3; // 30 ноября, 23:00 по Киеву
    const r = await routes['PUT /admin/levels/season']({ env, request: { body: { end, title: 'Сезон 1 — ноябрь' } }, me });
    assert.equal(r.ok, true);
    assert.deepEqual({ n: r.current.n, end: r.current.end, title: r.current.title }, { n: 1, end, title: 'Сезон 1 — ноябрь' });
    const g = q(env, "SELECT to_id, title, until FROM gifts WHERE kind = 'season'");
    assert.equal(g.length, 1);
    assert.equal(g[0].to_id, null);
    assert.equal(g[0].until, end);
    assert.equal(g[0].title, 'Сброс званий 30 ноября в 23:00 по Киеву');
    assert.deepEqual({ id: seen.ann.id, until: seen.ann.until }, { id: 'season-1', until: end });
    assert.match(seen.ann.text, /^Сброс званий 30 ноября в 23:00 по Киеву — конец сезона 1\./);
    assert.equal(seen.pokeAll, 1);
    // перенесли на час раньше: прежнее письмо гаснет, живое — одно
    await routes['PUT /admin/levels/season']({ env, request: { body: { end: end - 3600e3 } }, me });
    assert.equal(q(env, "SELECT COUNT(*) AS n FROM gifts WHERE kind = 'season' AND (until IS NULL OR until > ?)", NOON)[0].n, 1);
    // в прошлое — нельзя
    assert.equal((await routes['PUT /admin/levels/season']({ env, request: { body: { end: NOON - 1 } }, me })).status, 400);
    // сбросить сейчас: сезон 2 — с этого момента, объявление о сбросе снято, письмо о конце сезона пришло
    const x = await routes['POST /admin/levels/season/reset']({ env, request: {}, me });
    assert.deepEqual({ closed: x.closed, n: x.current.n, start: x.current.start, end: x.current.end }, { closed: 1, n: 2, start: NOON, end: FEB1 });
    assert.equal(seen.ann, null);
    assert.equal(q(env, "SELECT COUNT(*) AS n FROM gifts WHERE kind = 'season' AND (until IS NULL OR until > ?)", NOON)[0].n, 1);
    const info = await routes['GET /admin/levels/seasons']({ env, request: {}, me });
    assert.equal(info.current.n, 2);
    assert.deepEqual(info.history.map((h) => [h.n, h.title]), [[1, 'Сезон 1 — ноябрь']]);
  });
});

test('сезон: обращений к D1 — закрытие и /levels/me меньше 50', async (t) => {
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1, 1)");
  for (let u = 0; u < 30; u++) await awardMany(env, 'p' + u, rates('r', 12), { now: NOON, ...bare });
  await awardMany(env, 'u1', rates('r', 20), { now: NOON });
  const { routes } = await levelRoutes();
  const close = counted(env);
  await L.currentSeason(env, FEB1 + 1); // холодный Worker: таблицы, сезон, закрытие, следующий
  const nClose = close();
  const me = counted(env);
  await atTime(FEB1 + 2000, () => routes['GET /levels/me']({ env, request: { cf: { timezone: 'Europe/Moscow' } }, me: { id: 'u1' } }));
  const nMe = me();
  t.diagnostic(`закрытие сезона: ${nClose} обращений к D1, /levels/me: ${nMe}`);
  assert.ok(nClose < 50 && nMe < 50);
  assert.equal(q(env, 'SELECT COUNT(*) AS n FROM season_results WHERE season = 1')[0].n, 31);
});

test('оформление, купленное в магазине раньше уровня, открыто так же, как за уровень', async () => {
  const L = await import('../functions/_lib/levels.js');
  assert.ok(!L.unlockedAt(3).fonts.includes('lobster'));
  assert.ok(L.unlockedAt(3, false, new Set(['font:lobster'])).fonts.includes('lobster'));
  assert.ok(L.unlockedAt(3, false, new Set(['frame6'])).frames.includes('frame6'));
  assert.ok(L.unlockedAt(13).fx.includes('snow') && !L.unlockedAt(32).fx.includes('embers'));
});
