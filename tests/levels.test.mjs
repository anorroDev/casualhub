// Тесты уровней: node --test tests/levels.test.mjs
// База — настоящий SQLite в памяти (node:sqlite) с тем же видом, что у D1: prepare().bind().first()/all()/run() и batch().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
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
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, created_at INTEGER, email_ok INTEGER, banned INTEGER);
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
  assert.equal(unlockedAt(1, true).frames.length, 7); // админу открыто всё (и рамка за приглашения)
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
  // у каждого задания — подсказка, где это делается и что засчитывается
  for (const d of [...st.daily, st.weekly]) assert.ok(d.hint && d.hint.length > 20, `подсказка у ${d.code}`);
  // выполнить «оцени 2»: опыт за задание приходит с последним действием
  await award(env, 'u1', 'rate', 'a', { now: NOON });
  const r = await award(env, 'u1', 'rate', 'b', { now: NOON });
  assert.ok(r.news.some((n) => n.t === 'quest' && n.title === 'Поставь 2 новые оценки'));
  const again = await award(env, 'u1', 'rate', 'c', { now: NOON });
  assert.ok(!again.news.some((n) => n.t === 'quest' && n.title === 'Поставь 2 новые оценки'));
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM xp_log WHERE kind = 'quest'")[0].n >= 1, true);
});

test('задания: у всех есть подсказка, и название с подсказкой переведены в lang-en.js', () => {
  const en = readFileSync(new URL('../lang-en.js', import.meta.url), 'utf8');
  for (const d of [...L.DAILY, ...L.WEEKLY]) {
    assert.ok(d.hint && d.hint.length > 20, `подсказка у ${d.code}`);
    for (const s of [d.title, d.hint]) assert.ok(en.includes(JSON.stringify(s) + ':'), `нет перевода: ${s}`);
  }
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

test('тир-лист засчитывается, когда в нём впервые 8 карточек, а не только при первом сохранении', async () => {
  const { tierDone, TIER_MIN } = L;
  const t = (n) => ({ items: Object.fromEntries(Array.from({ length: n }, (_, i) => ['i' + i, { id: 'i' + i, name: 'К' + i }])) });
  assert.equal(TIER_MIN, 8);
  assert.equal(tierDone(null, t(8)), true); // сразу 8 — как раньше
  assert.equal(tierDone(null, t(1)), false); // страница отправила тир-лист с первой карточкой
  assert.equal(tierDone(t(3), t(10)), true); // …и потом он вырос — теперь засчитывается
  assert.equal(tierDone(t(7), t(8)), true);
  assert.equal(tierDone(t(8), t(12)), false); // правка уже засчитанного — нет
  assert.equal(tierDone(t(10), t(5)), false);
  // один тир-лист — один раз: убрал карточки и добавил снова — опыта больше нет, даже после удаления
  const env = envOf();
  const a = await award(env, 'u1', 'tier', 'tl1', { now: NOON });
  assert.ok(a.gained >= RULES.tier.xp); // вместе с ним может прийти и первый шаг «Первый тир-лист»
  assert.equal(await award(env, 'u1', 'tier', 'tl1', { now: NOON + 60e3 }), null);
  await revoke(env, 'u1', 'tier', 'tl1');
  assert.equal(await award(env, 'u1', 'tier', 'tl1', { now: NOON + 120e3 }), null);
});

// то, что обещают подсказки заданий в «Прогрессе» (DAILY.hint): поменялось правило — поправь подсказку
test('полка: правила из подсказок заданий', () => {
  const kinds = (o, n) => shelfDiff(o, n).give.map((x) => x.kind).sort();
  const old = { id: 'o', status: 'Пройдено', scores: [{ v: 7 }, { v: 8 }], total: 7.5 };
  // отзыв: «Плюсы», «Минусы» и «Заметки» вместе от 100 знаков, можно дописать к старой оценке
  assert.deepEqual(kinds([old], [{ ...old, pros: 'п'.repeat(40), cons: 'м'.repeat(30), note: 'з'.repeat(30) }]), ['review']);
  assert.deepEqual(kinds([old], [{ ...old, pros: 'п'.repeat(40), cons: 'м'.repeat(30), note: 'з'.repeat(29) }]), []);
  // оценка с обложкой: баллы хотя бы по двум критериям и фото, можно дополнить старую
  assert.deepEqual(kinds([old], [{ ...old, photo: { url: 'https://a/b.jpg' } }]), ['rate_full']);
  const one = { id: 'one', status: 'Пройдено', scores: [{ v: 7 }], total: 7, photo: { url: 'https://a/b.jpg' } };
  assert.deepEqual(kinds([], [one]), ['rate']);
  // «В планах» без баллов — ещё не оценка, оценили его — и новая оценка, и «из планов»
  const plan = { id: 'pl', status: 'В планах', scores: [], total: null };
  assert.deepEqual(kinds([], [plan]), []);
  assert.deepEqual(kinds([plan], [{ ...plan, status: 'Пройдено', scores: [{ v: 9 }], total: 9 }]), ['plan_done', 'rate']);
});

test('опыт за прошлое: строки как у живых действий, повтор ничего не удваивает', async () => {
  const env = envOf();
  const ratings = Array.from({ length: 60 }, (_, i) => ({ id: 'r' + i, cat: i % 4 ? 'movie' : 'game', status: 'Просмотрено', scores: [{ v: 5 }], total: 5, createdAt: new Date(NOON - (60 - i) * DAY).toISOString(), note: i < 3 ? 'y'.repeat(150) : '' }));
  env.DB.raw.exec(`INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1000, 0), ('u2', 'Боб', 'bob', 1000, 0)`);
  env.DB.raw.prepare('INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?)').run('u1', JSON.stringify({ ratings }), NOON);
  env.DB.raw.exec("INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES ('u1', 'u2', 'accepted', 'u1', 5000)");
  const lv = await backfillUser(env, 'u1', { now: NOON, founderBefore: NOON });
  // 50 × 10 + 10 × 3 + 3 отзыва × 5 + друг 15 + первые шаги (оценка 20, друг 30) + достижения («Основатель» 100, «Критик» бронза 50)
  assert.equal(lv.xp, 500 + 30 + 15 + 15 + 50 + 100 + 50);
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
  assert.equal(lv.xp, 10 + 20 + 100); // оценка, первый шаг «Первая оценка» и «Основатель хаба»
  await award(env, 'u1', 'visit', 'd1', { now: NOON, ...bare });
  await ensurePast(env, 'u1');
  assert.equal((await readLevel(env, 'u1')).xp, 135);
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
  assert.deepEqual({ n: m.season.n, start: m.season.start, end: m.season.end, xp: m.season.xp, rank: m.season.rank }, { n: 1, start: NOV1, end: FEB1, xp: 600, rank: 'couch' }); // +100 за «Первую десятку» при первом /levels/me
  assert.deepEqual(m.season.ranks.map((r) => r.id), L.SEASON_RANKS.map((r) => r.id));
  assert.deepEqual(m.season.history, []);
  assert.equal(m.rank, 'Диванный критик');
  assert.equal(m.rankId, 'couch');
  // после сброса: опыт сезона с нуля, прошлый — в истории
  const after = await atTime(FEB1 + 1000, () => routes['GET /levels/me']({ env, request: { cf: { timezone: 'Europe/Moscow' } }, me: { id: 'u1' } }));
  assert.equal(after.season.n, 2);
  assert.equal(after.season.xp, 0);
  assert.equal(after.rank, 'Людишка');
  assert.deepEqual(after.season.history, [{ n: 1, title: 'Сезон 1', rank: 'couch', xp: 600, place: 1 }]);
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

test('приглашения: 3-й уровень — опыт обоим, 10-й — «Наставник», награды за друзей, «Вербовщик» только у позвавшего', async () => {
  const { acceptInvite } = await import('../functions/_lib/levels-api.js');
  const env = envOf();
  env.DB.raw.exec(`INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('host', 'Хозяин', 'host', 1, 0), ('n1', 'Новичок', 'n1', 2, 0)`);
  const { routes } = await levelRoutes();
  const inv = await routes['GET /levels/invite']({ env, request: { url: 'https://x/api/levels/invite' }, me: { id: 'host' } });
  assert.match(inv.url, /\/\?invite=[a-z0-9]{8}$/);
  assert.deepEqual(await routes['GET /levels/invite/who']({ env, request: { url: 'https://x/api/levels/invite/who?code=' + inv.code } }), { username: 'Хозяин', xp: 100 });
  assert.deepEqual(await routes['GET /levels/invite/who']({ env, request: { url: 'https://x/api/levels/invite/who?code=zzzzzzzz' } }), {});
  assert.equal(await acceptInvite(env, 'n1', inv.code), 'host');
  assert.equal(await acceptInvite(env, 'host', inv.code), null); // себя не пригласить
  // новичок пришёл: в списке, заявка ждёт хозяина, ничего ещё не засчитано
  let d = await routes['GET /levels/invite']({ env, request: { url: 'https://x/api/levels/invite' }, me: { id: 'host' } });
  assert.deepEqual(d.people.map((p) => [p.id, p.stage, p.rel, p.level]), [['n1', 0, 'incoming', 1]]);
  assert.equal(d.counted, 0);
  assert.ok(d.rewards.every((r) => !r.got));
  // новичок дошёл до 3-го уровня живым действием: +100 обоим, у хозяина — мятный ник и «Вербовщик», у новичка — «По приглашению»
  await awardMany(env, 'n1', [{ kind: 'gift', ref: 'g', xp: 270 }], { now: NOON, ...bare });
  await award(env, 'n1', 'visit', 'd1', { now: NOON + 1000 });
  assert.equal((await readLevel(env, 'host')).xp, 100 + 50); // и «Вербовщик» бронза
  d = await routes['GET /levels/invite']({ env, request: { url: 'https://x/api/levels/invite' }, me: { id: 'host' } });
  assert.equal(d.counted, 1);
  assert.deepEqual(d.rewards.filter((r) => r.got).map((r) => r.id), ['mint']);
  const me = await routes['GET /levels/me']({ env, request: { cf: {} }, me: { id: 'host' } });
  assert.equal(me.invites, 1);
  assert.ok(me.unlocked.colors.includes('mint') && !me.unlocked.frames.includes('frame7'));
  assert.ok(me.xpRules.invite.xp === 100 && me.xpRules.rate.day === 8 && !me.xpRules.gift);
  const put = await routes['PUT /levels/prefs']({ env, request: { body: { color: 'mint' } }, me: { id: 'host' } });
  assert.equal(put.look.color, 'mint');
  assert.equal((await levelsOf(env, ['host'])).host.color, 'mint');
  const achOf = async (u) => Object.fromEntries((await achievementsOf(env, u)).map((a) => [a.code, a]));
  let ah = await achOf('host'), an = await achOf('n1');
  assert.ok(ah.recruiter.got && !ah.invited.got);
  assert.ok(an.invited.got && !an.recruiter.got); // своя строка новичка — не вербовка
  assert.ok((await takeNews(env, 'host')).some((n) => n.t === 'invite_rw' && n.title === 'Мятный цвет ника'));
  // до 10-го уровня: хозяину ещё +150 и «Наставник»; повтор ничего не даёт
  const mid = (await readLevel(env, 'host')).xp;
  await awardMany(env, 'n1', [{ kind: 'gift', ref: 'g2', xp: 2000 }], { now: NOON + 2000, ...bare });
  await award(env, 'n1', 'visit', 'd2', { now: NOON + DAY });
  await award(env, 'n1', 'visit', 'd3', { now: NOON + 2 * DAY });
  assert.equal((await readLevel(env, 'host')).xp, mid + 150 + 50); // «Наставник» +150 и его бронза
  ah = await achOf('host');
  assert.ok(ah.mentor.got);
  d = await routes['GET /levels/invite']({ env, request: { url: 'https://x/api/levels/invite' }, me: { id: 'host' } });
  assert.deepEqual([d.people[0].stage, d.mentors], [2, 1]);
  // новичок видит, кто его позвал
  const dn = await routes['GET /levels/invite']({ env, request: { url: 'https://x/api/levels/invite' }, me: { id: 'n1' } });
  assert.deepEqual([dn.by.username, dn.by.stage], ['Хозяин', 2]);
  // фон «Горизонт» и прочее — только когда засчитано достаточно друзей
  assert.ok(!unlockedAt(50, false, null, 9).bgs.includes('horizon') && unlockedAt(1, false, null, 10).bgs.includes('horizon'));
  assert.ok(!unlockedAt(50).colors.includes('mint') && unlockedAt(1, false, null, 5).fx.includes('hearts'));
});

test('достижения дают опыт: за каждую ступень один раз, за полученные раньше — при заходе', async () => {
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1, 0)");
  // «Критик» сразу серебро (100 оценок): бронза 50 + серебро 150
  await awardMany(env, 'u1', rates('r', 99), { now: NOON, ...bare });
  await award(env, 'u1', 'rate', 'last', { now: NOON + DAY });
  const log = q(env, "SELECT ref, xp FROM xp_log WHERE user_id = 'u1' AND kind = 'ach' ORDER BY ref");
  assert.deepEqual(log.map((x) => [x.ref, x.xp]), [['critic:1', 50], ['critic:2', 150]]);
  assert.ok((await takeNews(env, 'u1')).some((n) => n.t === 'ach' && n.code === 'critic' && n.xp === 200));
  // достижение, записанное без опыта (как до этого обновления): при заходе — письмо в почту, опыт — только по кнопке, один раз
  env.DB.raw.exec("INSERT INTO achievements (user_id, code, tier, at) VALUES ('u1', 'night', 1, 1)");
  const { routes } = await levelRoutes();
  await award(env, 'u1', 'rate', 'one-more', { now: NOON + 2 * DAY }); // новое действие старое достижение не оплачивает
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM xp_log WHERE user_id = 'u1' AND ref = 'night:1'")[0].n, 0);
  const before = (await readLevel(env, 'u1')).xp;
  await routes['GET /levels/me']({ env, request: { cf: {} }, me: { id: 'u1' } });
  await routes['GET /levels/me']({ env, request: { cf: {} }, me: { id: 'u1' } });
  const first10 = (await achievementsOf(env, 'u1')).find((a) => a.code === 'first10').got; // список первых десяти кэшируется между тестами
  assert.equal((await readLevel(env, 'u1')).xp, before + (first10 ? 100 : 0)); // «Ночной критик» — ещё нет
  const mail = await routes['GET /levels/mail']({ env, request: { url: 'https://x/api/levels/mail' }, me: { id: 'u1' } });
  const letter = (mail.items || []).find((g) => g.id === 'achback:u1');
  assert.ok(letter && letter.xp === 100 && /Ночной критик/.test(letter.body));
  const got = await routes['POST /levels/mail/claim']({ env, request: { body: { id: 'achback:u1' } }, me: { id: 'u1' } });
  assert.equal(got.gained, 100);
  assert.equal((await routes['POST /levels/mail/claim']({ env, request: { body: { id: 'achback:u1' } }, me: { id: 'u1' } })).status, 409);
  await routes['GET /levels/me']({ env, request: { cf: {} }, me: { id: 'u1' } });
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM gifts WHERE id LIKE 'achback:%'")[0].n, 1); // второе письмо не появляется
  const items = await achievementsOf(env, 'u1');
  assert.equal(items.find((a) => a.code === 'critic').xp, 400); // дальше — золото
});

test('задания дня: одна бесплатная замена в день, только невыполненного, завтра — снова', async () => {
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1, 0), ('u2', 'Боб', 'bob', 2, 0)");
  env.DB.raw.exec("INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES ('u1', 'u2', 'accepted', 'u1', 1)");
  await award(env, 'u1', 'visit', 'd0', { now: NOON, ...bare });
  const today = dayKey(NOON, 'UTC');
  const q1 = await questState(env, 'u1', { now: NOON, today });
  assert.equal(q1.swap, true);
  const target = q1.daily[0].code;
  const r = await L.swapQuest(env, 'u1', target, { now: NOON, today });
  assert.ok(r.ok && r.code !== target && !q1.daily.some((d) => d.code === r.code));
  const q2 = await questState(env, 'u1', { now: NOON, today });
  assert.equal(q2.swap, false);
  assert.deepEqual(q2.daily.map((d) => d.code), [r.code, ...q1.daily.slice(1).map((d) => d.code)]);
  assert.equal((await L.swapQuest(env, 'u1', q2.daily[1].code, { now: NOON, today })).status, 409); // вторая — нельзя
  // завтра: новые задания и снова одна замена
  const tomorrow = shiftDay(today, 1);
  assert.equal((await questState(env, 'u1', { now: NOON + DAY, today: tomorrow })).swap, true);
  // выполненное заменить нельзя
  const q3 = await questState(env, 'u1', { now: NOON + DAY, today: tomorrow });
  const rate = q3.daily.find((d) => d.code === 'rate2');
  if (rate) {
    await awardMany(env, 'u1', [{ kind: 'rate', ref: 'x1' }, { kind: 'rate', ref: 'x2' }], { now: NOON + DAY, ...bare });
    assert.equal((await L.swapQuest(env, 'u1', 'rate2', { now: NOON + DAY, today: tomorrow })).status, 409);
  }
});

test('разбор альбома: засчитан, когда каждый трек оценён или пропущен и оценена половина; удаление альбома списывает', () => {
  const sc = (v) => [{ id: 'trk-score', name: 'Оценка трека', v }];
  const album = { id: 'rA', name: 'X — Y', status: 'Альбом', trackCount: 4, skip: [4], scores: [], total: null };
  const t = (n, v) => ({ id: 'rt' + n, name: 'X — t' + n, status: 'Трек', albumOf: 'rA', trackNo: n, scores: sc(v), total: v });
  const two = [album, t(1, 8), t(2, 6)];
  assert.equal(L.shelfDiff([], two).give.filter((g) => g.kind === 'album_full').length, 0, 'два из четырёх и один пропуск — ещё не целиком');
  const three = [...two, t(3, 9)];
  assert.deepEqual(L.shelfDiff(two, three).give.filter((g) => g.kind === 'album_full'), [{ kind: 'album_full', ref: 'rA' }]);
  assert.equal(L.shelfDiff(three, three).give.filter((g) => g.kind === 'album_full').length, 0, 'повторное сохранение не даёт ещё раз');
  const halfSkip = [{ ...album, skip: [2, 3, 4] }, t(1, 7)];
  assert.equal(L.albumsFull(halfSkip).size, 0, 'пропустить почти всё нельзя: оценить нужно хотя бы половину');
  assert.ok(L.shelfDiff(three, three.filter((r) => r.id !== 'rA')).take.some((x) => x.kind === 'album_full' && x.ref === 'rA'));
});

test('группы категорий для тематической недели: по названию, и кириллица тоже', () => {
  assert.equal(L.catGroupOf('Еда'), 'food');
  assert.equal(L.catGroupOf('Моя еда'), 'food');
  assert.equal(L.catGroupOf('Еда и заведения'), 'food');
  assert.notEqual(L.catGroupOf('Беда'), 'food', '«еда» внутри слова — не еда');
  assert.equal(L.catGroupOf('Музыка и альбомы'), 'music');
  assert.equal(L.catGroupOf('Что-то своё'), '');
  // названия по-украински
  assert.equal(L.catGroupOf('Музика'), 'music');
  assert.equal(L.catGroupOf('Ігри'), 'games');
  assert.equal(L.catGroupOf('Фільми й серіали'), 'movies');
  assert.equal(L.catGroupOf('Аніме'), 'anime');
  assert.equal(L.catGroupOf('Моя їжа'), 'food');
});

test('трек внутри альбома: album_track за новый трек; вынесен в отдельную оценку (rid) — тот же трек, без rate и без списания', () => {
  const album = (tracks) => ({ id: 'rA', name: 'X — Y', status: 'Альбом', trackCount: 3, scores: [], total: null, tracks });
  const one = [album([{ n: 1, v: 8 }, { n: 2, v: 6 }])];
  assert.deepEqual(L.shelfDiff([], one).give.filter((g) => g.kind === 'album_track').map((g) => g.ref), ['rA:1', 'rA:2']);
  // трек 1 оценили по 4+ критериям: отдельная оценка (albumOf, trackNo), в записи альбома — rid
  const t1 = { id: 'rT1', name: 'X — t1', status: 'Трек', albumOf: 'rA', trackNo: 1, scores: [1, 2, 3, 4].map((i) => ({ id: 'c' + i, v: 8 })), total: 8 };
  const full = [album([{ n: 1, v: 8, rid: 'rT1' }, { n: 2, v: 6 }]), t1];
  const d = L.shelfDiff(one, full);
  assert.deepEqual([...d.give, ...d.take].map((x) => x.kind + ':' + x.ref), [], 'тот же трек: ни rate, ни второй album_track, ни списания');
  assert.equal(L.shelfDiff(full, full).take.length + L.shelfDiff(full, full).give.length, 0, 'повторное сохранение ничего не меняет');
  assert.equal(L.shelfDiff(one, [album([{ n: 1, v: 9 }, { n: 2, v: 6 }])]).take.length, 0, 'другой балл того же трека — не списание');
  // отдельную оценку-трек удалили, а в альбоме осталась ссылка rid — трек пропал, album_track списывается
  assert.deepEqual(L.shelfDiff(full, [full[0]]).take.filter((x) => x.kind === 'album_track').map((x) => x.ref), ['rA:1']);
});

test('трек альбома — не новая оценка: задания «новые оценки» и «Критик» его не считают, импорт — тоже не новая оценка', async () => {
  const sc = [1, 2, 3, 4].map((i) => ({ id: 'c' + i, v: 7 }));
  const tracks = Array.from({ length: 12 }, (_, i) => ({ id: 'tr' + i, name: 'A — t' + i, status: 'Трек', albumOf: 'alb', trackNo: i + 1, scores: sc, total: 7 }));
  const d = L.shelfDiff([], tracks);
  assert.equal(d.give.filter((g) => g.kind === 'rate').length, 0, 'оценка-трек не даёт rate');
  assert.equal(d.give.filter((g) => g.kind === 'album_track').length, 12);
  for (const code of ['rate2', 'rate10']) assert.deepEqual([...L.DAILY, ...L.WEEKLY].find((x) => x.code === code).kinds, ['rate'], code);
  // живое начисление: 12 треков одного альбома и 5 импортов — задание недели «10 новых оценок» не выполнено
  const env = envOf();
  await L.ensureLevels(env);
  const now = Date.UTC(2026, 10, 25, 12);
  env.DB.raw.prepare("INSERT INTO user_level (user_id, xp, level, updated_at, quest_week, wquest, quest_day, quests) VALUES ('u1', 0, 1, 1, '2026-11-23', 'rate10', '2026-11-25', ?)").run(JSON.stringify({ l: ['rate2', 'review1', 'full1'], s: 0 }));
  await awardMany(env, 'u1', [...d.give, ...Array.from({ length: 5 }, (_, i) => ({ kind: 'import', ref: 'lb' + i }))], { now, tz: 'UTC' });
  const st = await questState(env, 'u1', { now, today: '2026-11-25' });
  assert.equal(st.weekly.code, 'rate10');
  assert.equal(st.weekly.progress, 0);
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM xp_log WHERE kind IN ('quest', 'quest_week')")[0].n, 0, 'ни задания дня, ни недели');
});

test('пересчёт опыта: rate за треки → album_track, задания без треков и импорта списываются, повтор ничего не меняет', async () => {
  const env = envOf();
  await L.ensureLevels(env);
  const sc = [1, 2, 3, 4].map((i) => ({ id: 'c' + i, v: 7 }));
  const trk = (i) => ({ id: 'tr' + i, name: 'A — t' + i, status: 'Трек', albumOf: 'alb', trackNo: i + 1, scores: sc, total: 7 });
  // на полке: альбом с 9 треками-оценками и одна обычная оценка
  const shelf = [{ id: 'alb', name: 'A', status: 'Альбом', scores: sc, total: 7 }, ...Array.from({ length: 9 }, (_, i) => trk(i)), { id: 'r1', name: 'Фильм', status: 'Просмотрено', scores: sc, total: 8 }];
  env.DB.raw.prepare('INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?)').run('u1', JSON.stringify({ ratings: shelf }), 1);
  const at = Date.UTC(2026, 10, 25, 10), day = '2026-11-25', wk = '2026-11-23';
  const ins = env.DB.raw.prepare('INSERT INTO xp_log (user_id, kind, ref, xp, day, at, gone) VALUES (?, ?, ?, ?, ?, ?, ?)');
  // как начисляли раньше: rate за альбом, 9 треков и фильм (по 10, дальше по 2), задание дня, «все три», задание недели
  ins.run('u1', 'rate', 'alb', 10, day, at, 0);
  for (let i = 0; i < 9; i++) ins.run('u1', 'rate', 'tr' + i, i < 7 ? 10 : 2, day, at + i + 1, 0);
  ins.run('u1', 'rate', 'r1', 2, day, at + 20, 0);
  ins.run('u1', 'review', 'r1', 5, day, at + 20, 0);
  ins.run('u1', 'rate_full', 'r1', 3, day, at + 20, 0);
  ins.run('u1', 'quest', `${day}:rate2`, 15, day, at + 21, 0);
  ins.run('u1', 'quest', `${day}:review1`, 15, day, at + 21, 0);
  ins.run('u1', 'quest', `${day}:full1`, 15, day, at + 21, 0);
  ins.run('u1', 'quest_all', day, 20, day, at + 21, 0);
  ins.run('u1', 'quest_week', `${wk}:rate10`, 100, day, at + 21, 0);
  // давний трек 24 ноября, когда каждый трек был отдельной оценкой, потом переехал внутрь альбома (rate списан)
  ins.run('u1', 'rate', 'oldtrack', 10, '2026-11-24', Date.UTC(2026, 10, 24, 3), 1);
  ins.run('u1', 'quest', '2026-11-24:rate2', 15, '2026-11-24', Date.UTC(2026, 10, 24, 3), 0);
  ins.run('u1', 'rate', 'other', 10, '2026-11-24', Date.UTC(2026, 10, 24, 3), 0);
  env.DB.raw.prepare("INSERT INTO user_level (user_id, xp, level, updated_at) VALUES ('u1', 0, 1, 1)").run();
  const sumNow = () => q(env, "SELECT COALESCE(SUM(xp), 0) AS n FROM xp_log WHERE user_id = 'u1' AND gone = 0")[0].n;
  const before = sumNow();
  const dry = await L.recalcUser(env, 'u1');
  assert.equal(sumNow(), before, 'проверка ничего не пишет');
  assert.equal(dry.tracks, 9);
  // задание недели: без треков за неделю 3 новые оценки (альбом, фильм, «other») — не 10; задание дня rate2 за 25-е:
  // альбом и фильм — 2, честное; за 24-е — одна «other» (трек тогда не в счёт) — списывается, «все три» за 25-е остаются
  assert.deepEqual(dry.quests.map((x) => x.ref).sort(), ['2026-11-23:rate10', '2026-11-24:rate2']);
  const res = await L.recalcUser(env, 'u1', { apply: true });
  assert.equal(res.xpAfter, sumNow());
  assert.equal(res.xpBefore - res.xpAfter, (7 * 10 + 2 * 2) - 9 * RULES.album_track.xp + 100 + 15, 'минус rate за треки (+ 4 за каждый трек) и два задания');
  assert.equal(q(env, "SELECT COUNT(*) AS n FROM xp_log WHERE kind = 'album_track' AND gone = 0 AND xp = 4")[0].n, 9);
  assert.equal(q(env, "SELECT xp FROM user_level WHERE user_id = 'u1'")[0].xp, res.xpAfter);
  // повторный пересчёт ничего не меняет, а новое сохранение полки трек второй раз не засчитывает
  assert.equal((await L.recalcUser(env, 'u1', { apply: true })).changed, false);
  assert.equal(await award(env, 'u1', 'album_track', 'alb:1', { now: at + DAY }), null);
});

test('топ недели: топ-5 сайта от 50 опыта получает рофланы письмом один раз, скрывшие себя, удалённые и заблокированные — нет', async () => {
  const W = await import('../functions/_lib/weektop.js');
  const env = envOf();
  await L.ensureLevels(env);
  const wk = '2026-11-16';
  // y — аккаунт удалён (опыт в журнале остался), z — заблокирован
  const xp = { a: 486, b: 300, c: 120, d: 90, e: 60, f: 55, g: 40, y: 900, z: 700 };
  for (const [u, n] of Object.entries(xp)) {
    env.DB.raw.prepare('INSERT INTO xp_log (user_id, kind, ref, xp, day, at, gone) VALUES (?, ?, ?, ?, ?, ?, 0)').run(u, 'admin', 'w' + u, n, '2026-11-18', 1);
    env.DB.raw.prepare('INSERT OR IGNORE INTO user_level (user_id, xp, level, prefs, updated_at) VALUES (?, ?, 1, ?, 1)').run(u, n, u === 'b' ? JSON.stringify({ hideBoard: true }) : null);
    if (u !== 'y') env.DB.raw.prepare('INSERT OR IGNORE INTO users (id, username, uname, created_at, banned) VALUES (?, ?, ?, 1, ?)').run(u, u, u, u === 'z' ? 1 : null);
  }
  const top = await W.weekTop(env, wk);
  assert.deepEqual(top.map((t) => t.id), ['a', 'c', 'd', 'e', 'f'], 'b скрыл себя, g меньше 50, y удалён, z заблокирован');
  assert.equal(top[0].prize, 60 + 19, '486 опыта: +19 за активность');
  assert.equal(W.topPrize(1, 5000), 100, 'бонус не больше 40');
  W.forgetSettled();
  const now = Date.parse('2026-11-24T10:00:00Z');
  assert.equal(await W.settleWeekTop(env, now), 5);
  W.forgetSettled();
  assert.equal(await W.settleWeekTop(env, now), 0, 'вторая раскладка ничего не удваивает');
  const g = q(env, "SELECT id, to_id, xp FROM gifts WHERE kind = 'roflans' ORDER BY xp DESC");
  assert.equal(g.length, 5);
  assert.equal(g[0].id, 'top:2026-11-16:a');
});

test('разбор альбома: треки внутри альбома — опыт за каждый трек, полный разбор, удаление альбома списывает всё', () => {
  const avg = [{ id: 'alb-avg', name: 'Среднее по трекам', v: 7.5 }];
  const a0 = { id: 'rB', name: 'X — Z', status: 'Альбом', trackCount: 4, skip: [], scores: [], total: null, tracks: [] };
  const a1 = { ...a0, scores: avg, total: 7.5, tracks: [{ n: 1, v: 8 }, { n: 2, v: 7 }] };
  const d1 = L.shelfDiff([a0], [a1]);
  assert.deepEqual(d1.give.filter((g) => g.kind === 'album_track').map((g) => g.ref), ['rB:1', 'rB:2']);
  assert.ok(d1.give.some((g) => g.kind === 'rate' && g.ref === 'rB'), 'у альбома появился балл — это одна оценка');
  const a2 = { ...a1, skip: [4], tracks: [...a1.tracks, { n: 3, v: 9 }] };
  const d2 = L.shelfDiff([a1], [a2]);
  assert.deepEqual(d2.give.filter((g) => g.kind === 'album_track').map((g) => g.ref), ['rB:3'], 'только новый трек');
  assert.ok(d2.give.some((g) => g.kind === 'album_full' && g.ref === 'rB'));
  const full = { id: 'rt5', name: 'X — t', status: 'Трек', albumOf: 'rB', trackNo: 4, scores: [1, 2, 3, 4].map((i) => ({ id: 'c' + i, name: 'c', v: 8 })), total: 8 };
  const a3 = { ...a2, skip: [], tracks: [...a2.tracks, { n: 4, v: 8, rid: 'rt5' }] };
  const d3 = L.shelfDiff([a2], [a3, full]);
  // трек по 4+ критериям — отдельная оценка, но не новая оценка: album_track за трек 4, rate за неё нет
  assert.deepEqual(d3.give.filter((g) => g.kind === 'album_track').map((g) => g.ref), ['rB:4']);
  assert.ok(!d3.give.some((g) => g.kind === 'rate' && g.ref === 'rt5'));
  const d4 = L.shelfDiff([a3, full], [full]);
  assert.deepEqual(d4.take.filter((x) => x.kind === 'album_track').map((x) => x.ref).sort(), ['rB:1', 'rB:2', 'rB:3']);
});

test('тематическая неделя: срок числом и единицей, объявление о ней, «Закончить» снимает объявление', async () => {
  const env = envOf();
  const { routes, seen } = await levelRoutes({ admin: true });
  const me = { id: 'a'.repeat(24), handle: 'admin' };
  await atTime(NOON, async () => {
    const r = await routes['PUT /admin/levels/event']({ env, request: { body: { title: 'Неделя тир-листов', mult: 2, n: 36, unit: 'hour', kinds: ['tier', 'react'], note: 'Зовите друзей!' } }, me });
    assert.equal(r.ok, true);
    assert.equal(r.event.until, NOON + 36 * 3600e3);
    assert.equal(seen.ann.id, 'ev-' + r.event.id);
    assert.equal(seen.ann.kind, 'event');
    assert.equal(seen.ann.until, r.event.until);
    assert.match(seen.ann.text, /^×2 опыта за: Тир-лист, Реакция другу\. До .+\.$/);
    assert.equal(seen.ann.note, 'Зовите друзей!', 'свои слова админа — отдельным полем');
    assert.equal((await routes['PUT /admin/levels/event']({ env, request: { body: { title: 'x', n: 5, unit: 'min', kinds: ['tier'] } }, me })).status, 400, 'меньше 10 минут нельзя');
    await routes['DELETE /admin/levels/event']({ env, request: {}, me });
    assert.equal(seen.ann, null, 'объявление ушло вместе с неделей');
  });
  const P = await import('../functions/_lib/presence.js');
  assert.equal(P.spanMs(2, 'week'), 14 * 864e5);
  assert.equal(P.spanMs(999, 'week'), 90 * 864e5, 'не дольше 90 дней');
  assert.equal(P.spanMs(3, 'nope'), 0);
});

test('тематическая неделя по категории: «Музыка» умножает оценки музыки и разбор альбома, но не игры', () => {
  const ev = { kinds: ['rate', 'album_track', 'tier'], cats: ['music'] };
  const d = L.shelfDiff([], [
    { id: 'm1', name: 'A — B', catLabel: 'Музыка и альбомы', status: 'Альбом', scores: [{ id: 'c', v: 8 }], total: 8 },
    { id: 'g1', name: 'Hades', catLabel: 'Игры', scores: [{ id: 'c', v: 9 }], total: 9 },
  ]);
  const by = Object.fromEntries(d.give.filter((x) => x.kind === 'rate').map((x) => [x.ref, x]));
  assert.equal(by.m1.cg, 'music');
  assert.equal(by.g1.cg, 'games');
  assert.equal(L.eventHits(ev, by.m1), true);
  assert.equal(L.eventHits(ev, by.g1), false, 'игры не попадают под «Музыку»');
  assert.equal(L.eventHits(ev, { kind: 'album_track', ref: 'x:1' }), true);
  assert.equal(L.eventHits(ev, { kind: 'tier', ref: 't' }), true, 'не оценки — категория не важна');
  assert.equal(L.eventHits({ kinds: ['rate'] }, by.g1), true, 'без категорий — все оценки');
});

test('итоги года: музыка, режимы, рофланы и самая спорная оценка', async () => {
  const env = envOf();
  const { recap } = await import('../functions/_lib/levels-api.js');
  await L.ensureLevels(env);
  env.DB.raw.exec('ALTER TABLE lot_rooms ADD COLUMN created_at INTEGER');
  const T = (m, d) => new Date(Date.UTC(2026, m - 1, d, 12)).toISOString();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at) VALUES ('u1', 'Аня', 'anya', 1), ('u2', 'Боря', 'borya', 1), ('u3', 'Вика', 'vika', 1), ('u4', 'Гоша', 'gosha', 1)");
  env.DB.raw.exec("INSERT INTO friendships (a, b, status) VALUES ('u1', 'u2', 'accepted'), ('u3', 'u1', 'accepted'), ('u1', 'u4', 'pending')");
  const sc = (v) => [{ v }];
  const shelf = (id, ratings) => env.DB.raw.prepare('INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, 1)').run(id, JSON.stringify({ ratings }));
  shelf('u1', [
    { id: 'h', name: 'Hades', catName: 'Игры', total: 9, scores: sc(9), createdAt: T(3, 1) },
    { id: 'd', name: 'Dune', catName: 'Фильмы', total: 3, scores: sc(3), createdAt: T(5, 1) },
    { id: 'b', name: 'Blonde', catName: 'Музыка и альбомы', total: 8.6, scores: sc(8.6), trackCount: 3, createdAt: T(11, 24),
      tracks: [{ n: 1, t: 'Nikes', v: 8 }, { n: 2, t: 'Ivy', v: 9.5 }, { n: 3, t: 'Pink + White', v: 8.2 }] },
    { id: 'o', name: 'Old', catName: 'Игры', total: 5, scores: sc(5), createdAt: '2025-06-01T12:00:00.000Z' },
  ]);
  shelf('u2', [{ id: 'x1', name: 'Hades', total: 4, scores: sc(4), vis: 'friends' }, { id: 'x2', name: 'Dune', total: 3.5, scores: sc(3.5) }]);
  // скрытая оценка друга («только я») в итоги не идёт: с ней спорной стала бы «Dune»
  shelf('u3', [{ id: 'y1', name: 'Hades', total: 9, scores: sc(9), vis: 'private' }, { id: 'y2', name: ' dune ', total: 9, scores: sc(9) }]);
  shelf('u4', [{ id: 'z1', name: 'Hades', total: 0.5, scores: sc(0.5) }]); // только заявка, не друг
  // журнал опыта: засчитанное за год, без снятого и прошлогоднего
  const at = Date.UTC(2026, 6, 1);
  const log = (kind, ref, t = at, gone = 0) => env.DB.raw.prepare('INSERT INTO xp_log (user_id, kind, ref, xp, day, at, gone) VALUES (?, ?, ?, 1, ?, ?, ?)').run('u1', kind, ref, '2026-07-01', t, gone);
  ['r1', 'r2', 'r3'].forEach((r) => log('riddle', r));
  log('riddle', 'r4', at, 1);
  log('riddle', 'r0', Date.UTC(2025, 6, 1));
  log('lot_win', 'w1'); log('lot_win', 'w2'); log('lots_host', 'h1'); log('king_host', 'k1'); log('king_vote', 'v1'); log('predict_win', 'p1');
  ['q1', 'q2', 'q3', 'q4'].forEach((r) => log('quest', r));
  let y = await recap(env, 'u1', 2026);
  assert.equal(y.ratings, 3);
  assert.deepEqual(y.music, { albums: 1, tracks: 3, top: { name: 'Blonde', total: 8.6 }, track: { name: 'Ivy', album: 'Blonde', v: 9.5 } });
  assert.deepEqual(y.modes, { riddles: 3, lotsWon: 2, lotsHosted: 1, kingHosted: 1, kingVotes: 1, predictWins: 1, bingoWins: 0, tierCoop: 0, quests: 4 });
  assert.deepEqual(y.hot, { name: 'Hades', mine: 9, theirs: 4, n: 1 });
  assert.equal(y.roflans, 0, 'таблицы магазина ещё нет — итоги не падают');
  env.DB.raw.exec('CREATE TABLE shop_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item TEXT, delta INTEGER NOT NULL, reason TEXT NOT NULL, note TEXT, by_id TEXT, at INTEGER NOT NULL)');
  const pay = (id, delta, t) => env.DB.raw.prepare("INSERT INTO shop_log (id, user_id, delta, reason, at) VALUES (?, 'u1', ?, 'x', ?)").run(id, delta, t);
  pay('a', 60, at); pay('b', 45, at); pay('c', -30, at); pay('d', 100, Date.UTC(2025, 1, 1));
  y = await recap(env, 'u1', 2026);
  assert.equal(y.roflans, 105, 'только полученное за год, без покупок');
  // без друзей и без альбомов — пустые поля, а не ошибка
  const z = await recap(env, 'u4', 2026);
  assert.equal(z.hot, null);
  assert.deepEqual(z.music, { albums: 0, tracks: 0, top: null, track: null });
});

test('итоги года: админ смотрит заранее, ачивка — только когда итоги открыты', async () => {
  const env = envOf();
  env.DB.raw.exec("INSERT INTO users (id, username, uname, created_at, email_ok) VALUES ('u1', 'Аня', 'anya', 1, 0)");
  env.DB.raw.exec('ALTER TABLE lot_rooms ADD COLUMN created_at INTEGER');
  const req = { cf: { timezone: 'Europe/Kiev' } };
  const DEC2 = Date.UTC(2026, 11, 2, 12);
  const admin = (await levelRoutes({ admin: true })).routes, user = (await levelRoutes()).routes;
  const me = { id: 'u1' };
  assert.equal((await atTime(NOON, () => user['GET /levels/me']({ env, request: req, me }))).recap, null);
  assert.equal((await atTime(NOON, () => admin['GET /levels/me']({ env, request: req, me }))).recap, 2026, 'админ видит вкладку до декабря');
  assert.equal((await atTime(NOON, () => user['GET /levels/recap']({ env, request: req, me }))).status, 404);
  const early = await atTime(NOON, () => admin['GET /levels/recap']({ env, request: req, me }));
  assert.equal(early.year, 2026);
  const got = () => q(env, "SELECT COUNT(*) AS n FROM achievements WHERE user_id = 'u1' AND code = 'recap2026'")[0].n;
  assert.equal(got(), 0, 'предпросмотр админа ачивку не выдаёт');
  await atTime(DEC2, () => user['GET /levels/recap']({ env, request: req, me }));
  assert.equal(got(), 1);
});
