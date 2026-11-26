// «Васян ловит еду»: правила появления у страницы и сервера одни, потолок счёта по ним, забег и сохранение, рекорд и опыт,
// лучшие за сегодня среди друзей, день по Киеву, кадры Васяна для холста (vasyan.js). node --test tests/game-catch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SPAWN, POINTS, MAX_MS, gapAt, spawnsBy, maxScore, makeCatchRoutes } from '../functions/_lib/game-catch.js';
import { RULES, dayKey } from '../functions/_lib/levels.js';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v)); // объекты из песочницы vm — с чужими прототипами
// games/catch/rules.js — как в браузере
function pageRules() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src('games/catch/rules.js'), ctx);
  return ctx.window.CasualCatchRules;
}
// повторяемый случай
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// вся игра по правилам страницы, как будто поймано всё съедобное: очки на момент каждого появления
function run(P, rnd, until) {
  const last = {}, out = [];
  let sum = 0;
  for (let s = P.SPAWN.first; s <= until; s += P.gapAt(s)) {
    const k = P.pick(s, last, rnd);
    if (k in P.POINTS) sum += P.POINTS[k];
    out.push([s, sum, k]);
  }
  return out;
}

test('правила появления у страницы (rules.js) и у сервера — одни и те же', () => {
  const P = pageRules();
  assert.deepEqual(plain(P.SPAWN), plain(SPAWN));
  assert.deepEqual(plain(P.POINTS), plain(POINTS));
  for (const t of [0, 0.8, 10, 50, 90.5, 300]) assert.equal(P.gapAt(t), gapAt(t));
  assert.equal(P.gapAt(0), SPAWN.gap0);
  assert.equal(P.gapAt(1000), SPAWN.gapMin, 'чаще gapMin не бывает');
  assert.equal(P.hazardAt(1), 0, 'первые секунды без огурцов');
  assert.ok(P.fallAt(600) === P.FALL.max && P.fallAt(0) === P.FALL.v0);
});

test('потолок счёта: по правилам страницы больше не набрать, а честная жадная игра близко к нему', () => {
  const P = pageRules();
  assert.equal(maxScore(0), 0);
  assert.equal(maxScore(1000), 3, 'за секунду — одна штука, лучшая из возможных — рыбка');
  let prev = 0;
  for (let ms = 0; ms <= 600e3; ms += 1700) { const m = maxScore(ms); assert.ok(m >= prev, 'не убывает'); prev = m; }
  assert.equal(maxScore(MAX_MS * 5), maxScore(MAX_MS), 'дольше двух часов не считается');
  // случайные игры: в любой момент очков не больше потолка (ms — время появления, округлённое вниз)
  for (let seed = 1; seed <= 200; seed++) {
    for (const [s, sum] of run(P, rng(seed), 400)) assert.ok(sum <= maxScore(Math.floor(s * 1000)), `seed ${seed}, ${s.toFixed(2)} с: ${sum} > ${maxScore(Math.floor(s * 1000))}`);
  }
  // жадный случай: огурцов нет, каждая еда — как только можно. Это и есть самое большее по правилам
  let calls = 0;
  const greedy = () => (calls++ === 0 ? 0.999999 : 0);
  const P2 = { ...P, pick: (s, last) => { calls = 0; return P.pick(s, last, greedy); } };
  const g = run(P2, null, 600);
  for (const [s, sum] of g) assert.ok(sum <= maxScore(Math.floor(s * 1000)), `жадно, ${s.toFixed(2)} с`);
  const at120 = g.filter(([s]) => s <= 120).pop()[1];
  assert.ok(at120 >= 0.85 * maxScore(120e3), `потолок не слишком щедрый: ${at120} из ${maxScore(120e3)}`);
  assert.equal(spawnsBy(SPAWN.first - 0.01), 0);
  assert.equal(spawnsBy(SPAWN.first), 1);
});

test('опыт: правила catch_play и catch_record — раз в день, немного', () => {
  for (const k of ['catch_play', 'catch_record']) {
    assert.ok(RULES[k] && Number.isFinite(RULES[k].xp) && RULES[k].xp > 0 && RULES[k].xp <= 15, k);
    assert.equal(RULES[k].day, 1, k);
  }
  assert.ok(src('levels-ui.js').includes("['catch_play', "), 'строка в таблице «За что сколько опыта»');
});

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
// 26 ноября 2026, 21:00 UTC — 23:00 по Киеву (зимой UTC+2): через час по Киеву уже 27-е
const NOW = Date.UTC(2026, 10, 26, 21, 0);
const at = async (t, fn) => { const real = Date.now; Date.now = () => t; try { return await fn(); } finally { Date.now = real; } };
function setup(lv) {
  const env = { DB: fakeD1() };
  const q = (sql, ...a) => env.DB.raw.prepare(sql).run(...a);
  q("INSERT INTO users (id, username, uname) VALUES ('u1', 'Аня', 'anya'), ('f1', 'Боря', 'borya'), ('f2', 'Вика', 'vika'), ('s1', 'Чужой', 'stranger')");
  q("INSERT INTO friendships (a, b, status) VALUES ('f1', 'u1', 'accepted'), ('u1', 'f2', 'pending')");
  const given = [];
  const routes = makeCatchRoutes({
    json: (o) => o, fail: (status, error) => ({ status, error }), readBody: async (req) => (req && req.body) || {},
    lvGive: lv || (async (e, req, me, uid, items) => { given.push({ uid, items }); return { gained: items.length * 10 }; }),
  });
  return { env, routes, given };
}
// одна игра: start в t0, счёт через wait мс
async function play(R, env, uid, t0, wait, body) {
  const s = await at(t0, () => R['POST /games/catch/start']({ env, me: { id: uid } }));
  assert.match(s.run, /^[0-9a-f]{32}$/);
  const res = await at(t0 + wait, () => R['POST /games/catch/score']({ env, request: { body: { run: s.run, ...body } }, me: { id: uid } }));
  return { run: s.run, res };
}

test('игра: начало, счёт один раз на игру, рекорды дня и за всё время, опыт', async () => {
  const { env, routes: R, given } = setup();
  const empty = await at(NOW, () => R['GET /games/catch/top']({ env, me: { id: 'u1' } }));
  assert.deepEqual(plain(empty), { day: '2026-11-26', today: { best: 0, games: 0 }, all: { best: 0, games: 0 }, board: [], friends: 1 });

  const a = await play(R, env, 'u1', NOW, 65e3, { score: 150, ms: 60e3 });
  assert.equal(a.res.saved, true);
  assert.deepEqual([a.res.today.best, a.res.all.best, a.res.today.games, a.res.record], [150, 150, 1, false], 'первая игра на сайте — не рекорд');
  assert.deepEqual(given.pop(), { uid: 'u1', items: [{ kind: 'catch_play', ref: '2026-11-26' }] });
  assert.equal(a.res.xp, 10);
  // тот же номер забега второй раз (двойное нажатие, повтор) — не принимается
  const again = await at(NOW + 66e3, () => R['POST /games/catch/score']({ env, request: { body: { run: a.run, score: 150, ms: 60e3 } }, me: { id: 'u1' } }));
  assert.equal(again.status, 409);

  // хуже лучшего — лучший остаётся, игр стало две
  const b = await play(R, env, 'u1', NOW + 70e3, 31e3, { score: 90, ms: 30e3 });
  assert.deepEqual([b.res.today.best, b.res.today.games, b.res.record], [150, 2, false]);
  assert.deepEqual(given.pop().items, [{ kind: 'catch_play', ref: '2026-11-26' }], 'ref — день: второй раз за день опыт не даст (levels.js)');
  // лучше — рекорд и опыт за него
  const c = await play(R, env, 'u1', NOW + 110e3, 92e3, { score: 210, ms: 90e3 });
  assert.deepEqual([c.res.today.best, c.res.all.best, c.res.record], [210, 210, true]);
  assert.deepEqual(given.pop().items, [{ kind: 'catch_play', ref: '2026-11-26' }, { kind: 'catch_record', ref: '2026-11-26' }]);
  // ноль очков — сохраняется, но опыта нет
  const z = await play(R, env, 'u1', NOW + 210e3, 15e3, { score: 0, ms: 14e3 });
  assert.equal(z.res.today.games, 4);
  assert.equal(given.length, 0);
  assert.equal(z.res.xp, 0);

  // через час по Киеву — уже 27-е: сегодня с нуля, рекорд за всё время остался
  const next = await at(NOW + 3600e3, () => R['GET /games/catch/top']({ env, me: { id: 'u1' } }));
  assert.equal(next.day, '2026-11-27');
  assert.deepEqual([next.today.best, next.today.games, next.all.best, next.all.games], [0, 0, 210, 4]);
  assert.equal(dayKey(NOW + 3600e3, 'Europe/Kiev'), '2026-11-27');
  assert.equal(new Date(NOW + 3600e3).toISOString().slice(0, 10), '2026-11-26', 'по UTC ещё 26-е — день считается по Киеву');
});

test('проверки: забег чужой или неизвестный, время больше прошедшего, счёт больше потолка, не числа', async () => {
  const { env, routes: R, given } = setup();
  const score = (t, body, uid = 'u1') => at(t, () => R['POST /games/catch/score']({ env, request: { body }, me: { id: uid } }));
  const s = await at(NOW, () => R['POST /games/catch/start']({ env, me: { id: 'u1' } }));
  assert.equal((await score(NOW + 60e3, { run: s.run, score: 10, ms: 50e3 }, 's1')).status, 409, 'чужой забег');
  assert.equal((await score(NOW + 60e3, { run: 'f'.repeat(32), score: 10, ms: 50e3 })).status, 409, 'такого забега нет');
  assert.equal((await score(NOW + 60e3, { score: 10, ms: 50e3 })).status, 409, 'без забега');
  assert.equal((await score(NOW + 60e3, { run: s.run, score: 1.5, ms: 50e3 })).status, 400, 'счёт — целое');
  assert.equal((await score(NOW + 60e3, { run: s.run, score: 10, ms: '50000' })).status, 400, 'время — число');
  // игра «шла» две минуты, а прошла одна — не сходится (запас на сеть — 10 с)
  assert.equal((await score(NOW + 60e3, { run: s.run, score: 10, ms: 120e3 })).status, 400);
  // неудачная попытка забег уже потратила
  assert.equal((await score(NOW + 61e3, { run: s.run, score: 10, ms: 50e3 })).status, 409);
  const s2 = await at(NOW, () => R['POST /games/catch/start']({ env, me: { id: 'u1' } }));
  assert.equal((await score(NOW + 60e3, { run: s2.run, score: maxScore(55e3) + 1, ms: 55e3 })).status, 400, 'больше, чем можно поймать');
  const s3 = await at(NOW, () => R['POST /games/catch/start']({ env, me: { id: 'u1' } }));
  const ok = await score(NOW + 58e3, { run: s3.run, score: maxScore(66e3), ms: 66e3 });
  assert.equal(ok.saved, true, 'ровно потолок — можно; запас на сеть — 10 с');
  assert.equal(given.length, 1);
  // начатых и не сохранённых игр — не больше пяти: самая старая забывается
  const runs = [];
  for (let i = 0; i < 6; i++) runs.push((await at(NOW + i * 1000, () => R['POST /games/catch/start']({ env, me: { id: 'u1' } }))).run);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM catch_runs WHERE user_id = 'u1'").get().n, 5);
  assert.equal((await score(NOW + 90e3, { run: runs[0], score: 5, ms: 20e3 })).status, 409);
  assert.equal((await score(NOW + 90e3, { run: runs[5], score: 5, ms: 20e3 })).saved, true);
  // забег, начатый больше шести часов назад, — забыт
  const old = await at(NOW, () => R['POST /games/catch/start']({ env, me: { id: 'f1' } }));
  assert.equal((await score(NOW + 7 * 3600e3, { run: old.run, score: 5, ms: 20e3 }, 'f1')).status, 409);
});

test('лучшие за сегодня: я и друзья (только принятые), по убыванию; без друзей — friends: 0', async () => {
  const { env, routes: R } = setup();
  await play(R, env, 'u1', NOW, 61e3, { score: 120, ms: 60e3 });
  await play(R, env, 'f1', NOW, 61e3, { score: 180, ms: 60e3 });
  await play(R, env, 'f2', NOW, 61e3, { score: 300, ms: 60e3 }); // только заявка — не друг
  await play(R, env, 's1', NOW, 61e3, { score: 250, ms: 60e3 }); // чужой
  const top = await at(NOW + 70e3, () => R['GET /games/catch/top']({ env, me: { id: 'u1' } }));
  assert.deepEqual(plain(top.board), [
    { id: 'f1', username: 'Боря', handle: 'borya', score: 180, me: false },
    { id: 'u1', username: 'Аня', handle: 'anya', score: 120, me: true },
  ]);
  const solo = await at(NOW + 70e3, () => R['GET /games/catch/top']({ env, me: { id: 's1' } }));
  assert.equal(solo.friends, 0);
  assert.deepEqual(solo.board.map((x) => x.id), ['s1']);
  // вчерашние рекорды в сегодняшний список не попадают
  const tomorrow = await at(NOW + 3600e3, () => R['GET /games/catch/top']({ env, me: { id: 'u1' } }));
  assert.deepEqual(tomorrow.board, []);
});

test('опыт не сохранился (ошибка уровней) — счёт всё равно сохранён', async () => {
  const { env, routes: R } = setup(async () => { throw new Error('levels down'); });
  const err = console.error;
  console.error = () => {};
  try {
    const { res } = await play(R, env, 'u1', NOW, 61e3, { score: 40, ms: 60e3 });
    assert.equal(res.saved, true);
    assert.equal(res.xp, 0);
    assert.equal(res.today.best, 40);
  } finally { console.error = err; }
});

// vasyan.js в песочнице: на страницах игр котик не гуляет, но кадры для холста отдаёт
function loadVasyan(path) {
  const appended = [];
  const store = { 'casualhub.vasyan.own': '1', 'ocenshik.user.v1': JSON.stringify({ id: 'u1' }), 'casualhub.tokens.v1': JSON.stringify({ u1: 't' }) };
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, addEventListener() {}, appendChild() {}, append() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], firstChild: { style: {} } });
  const doc = { readyState: 'complete', hidden: false, createElement: el, addEventListener() {}, head: { appendChild() {} }, body: { append: (...a) => appended.push(...a), appendChild: (a) => appended.push(a) }, querySelectorAll: () => [], elementsFromPoint: () => [], documentElement: {} };
  const ctx = { document: doc, location: { pathname: path }, localStorage: { getItem: (k) => store[k] ?? null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1200, innerHeight: 800, performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, MutationObserver: class { observe() {} disconnect() {} }, setTimeout: () => 0, clearTimeout() {}, scrollY: 0, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(src('vasyan.js'), ctx); } catch (e) { /* заглушки DOM не всё умеют: на обычной странице котик успевает начать вставляться */ }
  return { V: ctx.CasualVasyan, appended };
}

test('vasyan.js: на /games/ котик не гуляет, а кадры и еду отдаёт пиксельной сеткой', () => {
  const game = loadVasyan('/games/catch/');
  assert.equal(game.appended.length, 0, 'на странице игры котик не появляется');
  assert.ok(loadVasyan('/king/').appended.length > 0, 'на других страницах — как раньше');
  const V = game.V;
  const w = V.pixels('walkA');
  assert.deepEqual([w.w, w.h, w.px.length, w.px[0].length], [19, 13, 13, 19]);
  assert.ok(w.px.flat().includes('#F4F4F0') && w.px.flat().includes('#1B1B1F'), 'окрас «Классика» и контур');
  for (const n of ['walkB', 'jump', 'sit', 'blink', 'eatA', 'eatB', 'scared', 'hang', 'hangB', 'heart', 'kibble', 'fish', 'sausage', 'cake', 'food.cake']) assert.ok(V.pixels(n) && V.pixels(n).px.flat().some(Boolean), n);
  assert.equal(V.pixels('nope'), null);
  assert.equal(V.pixels('constructor'), null);
  assert.ok(V.pixels('sit', { coat: 'ghost' }).px.flat().includes('#8EA6E0'), 'у «Призрака» свой контур');
  assert.ok(V.pixels('walkA', { outfit: 'hat' }).h > w.h, 'наряд поверх головы');
  // сетка каждый раз новая: игра её не испортит
  w.px[0][0] = 'red';
  assert.notEqual(V.pixels('walkA').px[0][0], 'red');
});
