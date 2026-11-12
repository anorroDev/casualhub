// «Бинго для стрима»: линии, свободный центр, карточки, список клише, метка в снимке колеса. node --test tests/bingo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { lineDone, newCard, cleanItems, BINGO_DEFAULT, FREE, makeBingoRoutes } from '../functions/_lib/bingo.js';
import { cleanLive, liveTx, resetLive } from '../functions/_lib/lots-live.js';

// D1 на SQLite в памяти (как в tests/chat.test.mjs)
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
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE lot_rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, live TEXT, ver INTEGER NOT NULL DEFAULT 1);`);
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

test('бинго: запуск, отметка и конец меняют метку xb в снимке колеса и будят комнату; без снимка — ничего', async () => {
  const ROOM = 'AbCdEfGh1234', BARE = 'ZzZzZzZz9999', BAD = 'QqQqQqQq7777';
  const env = { DB: fakeD1() };
  env.DB.raw.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run('host', 'Ведущий');
  env.DB.raw.prepare('INSERT INTO lot_rooms (id, owner_id, live) VALUES (?, ?, ?)').run(ROOM, 'host', JSON.stringify(cleanLive({ rot: 1.5, status: 'Колесо ждёт' })));
  env.DB.raw.prepare('INSERT INTO lot_rooms (id, owner_id, live) VALUES (?, ?, NULL)').run(BARE, 'host');
  env.DB.raw.prepare('INSERT INTO lot_rooms (id, owner_id, live) VALUES (?, ?, ?)').run(BAD, 'host', '{битый');
  const pokes = [];
  const r = makeBingoRoutes({
    json: (body, status = 200) => ({ status, body }), fail: (status, error) => ({ status, body: { error } }),
    readBody: async (req) => req.body || {}, currentUser: async () => null, pokeRoom: async (e, code, what) => { pokes.push([code, what]); },
  });
  const post = (code, body) => r['POST /lots/:code/bingo']({ env, request: { body }, me: { id: 'host' }, arg: code });
  const liveOf = (code) => { const row = env.DB.raw.prepare('SELECT live FROM lot_rooms WHERE id = ?').get(code); return row.live == null ? null : JSON.parse(row.live); };

  const started = await post(ROOM, { act: 'start' });
  assert.equal(started.status, 200);
  assert.equal(liveOf(ROOM).xb, 1);
  assert.equal(started.body.xb, 1, 'ответ бинго знает свою метку — страница не перечитает его зря');
  assert.equal((await post(ROOM, { act: 'mark', i: 0, on: true })).status, 200);
  assert.equal(liveOf(ROOM).xb, 2);
  assert.deepEqual([liveOf(ROOM).rot, liveOf(ROOM).status], [1.5, 'Колесо ждёт'], 'остальной снимок прежний');
  // запись снимка через liveTx («Вернуть всех») метку не теряет
  assert.ok(!(await liveTx(env, ROOM, (lv) => resetLive(lv, Date.now()))).err);
  assert.equal(liveOf(ROOM).xb, 2);
  assert.equal((await post(ROOM, { act: 'stop' })).status, 200);
  assert.equal(liveOf(ROOM).xb, 3);
  assert.deepEqual(pokes, [[ROOM, 'live'], [ROOM, 'live'], [ROOM, 'live']]);
  // сбор без снимка и с битым снимком: бинго работает, снимок не трогаем, комнату не будим
  assert.equal((await post(BARE, { act: 'start' })).status, 200);
  assert.equal(liveOf(BARE), null);
  const bad = await post(BAD, { act: 'start' });
  assert.deepEqual([bad.status, bad.body.xb], [200, 0]);
  assert.equal(env.DB.raw.prepare('SELECT live FROM lot_rooms WHERE id = ?').get(BAD).live, '{битый');
  assert.equal(pokes.length, 3);
});

test('карточка: 24 разных клише и свободный центр', () => {
  const c = newCard(36);
  assert.equal(c.length, 25);
  assert.equal(c[FREE], -1);
  const rest = c.filter((x) => x >= 0);
  assert.equal(new Set(rest).size, 24);
  assert.ok(rest.every((x) => x >= 0 && x < 36));
});

test('линия: ряд, столбец и диагональ; центр закрыт всегда', () => {
  const cells = Array.from({ length: 25 }, (_, i) => (i === FREE ? -1 : i));
  assert.equal(lineDone(cells, [0, 1, 2, 3]), false);
  assert.equal(lineDone(cells, [0, 1, 2, 3, 4]), true, 'первый ряд');
  assert.equal(lineDone(cells, [2, 7, 17, 22]), true, 'средний столбец — с центром');
  assert.equal(lineDone(cells, [0, 6, 18, 24]), true, 'диагональ — с центром');
  assert.equal(lineDone(cells, [10, 11, 13]), false);
});

test('список клише: 24–60 разных, лишнее отбрасывается', () => {
  assert.ok(BINGO_DEFAULT.length >= 30 && cleanItems(BINGO_DEFAULT));
  assert.equal(cleanItems(['a', 'b']), null);
  const many = Array.from({ length: 30 }, (_, i) => `клише ${i}`);
  assert.equal(cleanItems([...many, 'КЛИШЕ 1', ' ', 'x'.repeat(100)]).length, 31);
});
