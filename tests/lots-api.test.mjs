// Сбор лотов через сам API (functions/api/[[path]].js) на SQLite в памяти: свой лот во время прокрутки, «Убрать» ведущего
// (/drop) через liveTx, повторы по id, вето «Вечера с друзьями» в ответе сбора и версия пульта. node --test tests/lots-api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { onRequest } from '../functions/api/[[path]].js';
import { cleanLive } from '../functions/_lib/lots-live.js';

// D1 на SQLite в памяти (как в tests/bingo.test.mjs). Одна база на весь файл: схему API создаёт один раз за запуск
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
const env = { DB: fakeD1() };
const db = env.DB.raw;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const tok = (who) => who.repeat(64).slice(0, 64);
const uid = (who) => 'u'.repeat(23) + who;
async function call(method, path, body, who) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (who) headers.set('authorization', 'Bearer ' + tok(who));
  const request = new Request('https://x.test/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const res = await onRequest({ request, env, params: { path: path.split('?')[0].split('/') } });
  return { status: res.status, d: await res.json().catch(() => null) };
}
let ready = null;
// ведущий a, зрители b и c
function people() {
  if (!ready) ready = call('GET', 'lots/AAAAAAAAAAAA').then(() => {
    const now = Date.now();
    for (const who of ['a', 'b', 'c']) {
      db.prepare('INSERT INTO users (id, username, uname, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(uid(who), 'User ' + who, 'user_' + who, 'x', 'x', now);
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at, seen_at) VALUES (?, ?, ?, ?, ?)').run(sha(tok(who)), uid(who), now + 25 * 864e5, now, now);
    }
  });
  return ready;
}
async function room(opts) {
  await people();
  const r = await call('POST', 'lots', { title: 'Сбор', kind: 'any', perUser: 3, ...opts }, 'a');
  assert.equal(r.status, 200);
  return r.d.room.id;
}
async function add(code, who, names) {
  for (const name of names) assert.equal((await call('POST', 'lots/' + code, { name }, who)).status, 200, name);
}
const lotsOf = (code) => db.prepare('SELECT id, user_id, name FROM lots WHERE room_id = ? ORDER BY created_at').all(code);
const idOf = (code, name, who) => lotsOf(code).find((l) => l.name === name && (!who || l.user_id === uid(who))).id;
const liveOf = (code) => JSON.parse(db.prepare('SELECT live FROM lot_rooms WHERE id = ?').get(code).live);
const setLive = (code, live) => db.prepare('UPDATE lot_rooms SET live = ? WHERE id = ?').run(JSON.stringify(live), code);
// прокрутка кончилась давно: часы снимка — на ms назад
function rewind(code, ms) {
  const live = liveOf(code);
  if (live.spin) live.spin.at -= ms;
  if (live.res) live.res.end -= ms;
  setLive(code, live);
}

test('свой лот, пока колесо крутится, не убрать и не заменить; после прокрутки — можно, если он не вылетел', async () => {
  const code = await room({ editOwn: true });
  await add(code, 'a', ['One', 'Two']);
  await add(code, 'b', ['Mango', 'Kiwi']);
  const mine = [idOf(code, 'Mango'), idOf(code, 'Kiwi')];
  assert.equal((await call('POST', `lots/${code}/spin`, { mode: 'out', dur: 1 }, 'a')).status, 200);
  const del = await call('DELETE', `lots/${code}/${mine[0]}`, null, 'b');
  assert.equal(del.status, 409);
  assert.match(del.d.error, /Колесо крутится/);
  assert.equal((await call('PUT', `lots/${code}/${mine[1]}`, { name: 'Other' }, 'b')).status, 409);
  assert.equal(lotsOf(code).length, 4, 'ничего не удалено');
  const target = liveOf(code).res.id;
  rewind(code, 60000);
  // итог записывает сам запрос на правку: невылетевший свой лот уходит, вылетевший — окончательный
  const free = mine.find((id) => id !== target);
  assert.equal((await call('DELETE', `lots/${code}/${free}`, null, 'b')).status, 200);
  assert.deepEqual(liveOf(code).outIds, [target]);
  if (mine.includes(target)) assert.equal((await call('DELETE', `lots/${code}/${target}`, null, 'b')).status, 403);
});

test('повторы разрешены: вылетел один «Hades» — свой второй «Hades» убрать можно; у старого снимка без outIds — по названию', async () => {
  const code = await room({ editOwn: true, uniq: false });
  await add(code, 'a', ['Hades', 'Doom']);
  await add(code, 'b', ['Hades']);
  setLive(code, { ...cleanLive({}), out: ['Hades'], outIds: [idOf(code, 'Hades', 'a')], hist: ['Hades'] });
  assert.equal((await call('DELETE', `lots/${code}/${idOf(code, 'Hades', 'b')}`, null, 'b')).status, 200);
  await add(code, 'b', ['Hades']);
  setLive(code, { ...cleanLive({}), out: ['Hades'], hist: ['Hades'] });
  assert.equal((await call('DELETE', `lots/${code}/${idOf(code, 'Hades', 'b')}`, null, 'b')).status, 403);
});

test('«Убрать» ведущего во время прокрутки: лоты удалены, прокрутка и сектора как были; выпавший удалённый — не вылетает никто', async () => {
  const code = await room({});
  await add(code, 'a', ['A1', 'A2', 'A3', 'A4']);
  assert.equal((await call('POST', `lots/${code}/spin`, { mode: 'out', dur: 1 }, 'a')).status, 200);
  const before = liveOf(code), target = before.res.id;
  assert.equal((await call('POST', `lots/${code}/drop`, { ids: [target] }, 'a')).status, 200);
  const mid = liveOf(code);
  assert.deepEqual([mid.spin, mid.segs, mid.res], [before.spin, before.segs, before.res], 'стрелка встанет туда, куда целилась прокрутка');
  assert.ok(!mid.ids.includes(target));
  assert.equal(lotsOf(code).length, 3);
  rewind(code, 60000);
  const after = (await call('GET', `lots/${code}`, null, 'a')).d.live;
  // не вылетел никто: на месте выпавшего — пустой id, outIds идёт парой с out и hist
  assert.deepEqual(after.outIds, ['']);
  assert.equal(after.out.length, after.outIds.length);
  assert.equal(after.hist.length, after.outIds.length);
  assert.deepEqual(after.segs.map((x) => x.l).sort(), lotsOf(code).map((l) => l.id).sort());
});

test('«Убрать» ведущего без прокрутки: сектор уходит сразу, из вылетевших — только этот лот, а не все с таким названием', async () => {
  const code = await room({ uniq: false });
  await add(code, 'a', ['Hades', 'Hades', 'Doom']);
  const [h1, h2, d] = lotsOf(code).map((l) => l.id);
  const seg = (n, l) => ({ n, p: 0.5, c: '#3550E8', t: '#FFFFFF', l });
  setLive(code, { ...cleanLive({ segs: [seg('Hades', h2), seg('Doom', d)] }), out: ['Hades'], outIds: [h1], hist: ['Hades'], ids: [h1, h2, d], seen: 3 });
  assert.equal((await call('POST', `lots/${code}/drop`, { ids: [h2] }, 'a')).status, 200);
  const live = liveOf(code);
  assert.deepEqual(live.segs.map((x) => [x.l, x.p]), [[d, 1]]);
  assert.deepEqual([live.out, live.outIds], [['Hades'], [h1]], 'вылет первого «Hades» на месте');
  assert.deepEqual([live.ids, live.seen], [[h1, d], 2]);
  // вылетевший сам удалённый лот уходит из вылетевших вместе со своим id
  assert.equal((await call('POST', `lots/${code}/drop`, { ids: [h1] }, 'a')).status, 200);
  assert.deepEqual([liveOf(code).out, liveOf(code).outIds], [[], []]);
});

test('вето «Вечера с друзьями»: лот под вето помечен в ответе сбора и не крутится; пульт старой версии — «обнови страницу»', async () => {
  const code = await room({});
  assert.equal((await call('POST', `lots/${code}/evening`, { on: true }, 'a')).status, 200);
  await add(code, 'b', ['B1']);
  await add(code, 'c', ['C1']);
  await add(code, 'a', ['A1']);
  const v0 = (await call('GET', `lots/${code}`, null, 'a')).d.room.ver;
  assert.equal((await call('POST', `lots/${code}/veto`, { lot: idOf(code, 'C1') }, 'b')).status, 200);
  const g = await call('GET', `lots/${code}?v=${v0}`, null, 'a');
  assert.ok(g.d.room.ver > v0, 'вето поменяло список лотов — страница его перечитает');
  assert.deepEqual(g.d.lots.filter((l) => l.veto).map((l) => l.name), ['C1']);
  assert.equal((await call('PUT', `lots/${code}/live`, { v: 2, pics: false }, 'a')).status, 409);
  assert.equal((await call('PUT', `lots/${code}/live`, { v: 3, pics: false }, 'a')).status, 200);
  assert.equal((await call('POST', `lots/${code}/spin`, { mode: 'out', dur: 1 }, 'a')).status, 200);
  assert.deepEqual(liveOf(code).segs.map((x) => x.n).sort(), ['A1', 'B1']);
  // после первой прокрутки «Вечер» не снять: вето так и решают, что крутится
  const off = await call('POST', `lots/${code}/evening`, { on: false }, 'a');
  assert.equal(off.status, 409);
  assert.equal((await call('GET', `lots/${code}/veto`, null, 'a')).d.vetoes.length, 1);
});

test('«Вечер» до первой прокрутки снимается вместе с вето, и список лотов перечитывается', async () => {
  const code = await room({});
  await call('POST', `lots/${code}/evening`, { on: true }, 'a');
  await add(code, 'b', ['B1']);
  await add(code, 'c', ['C1']);
  await add(code, 'a', ['A1']);
  await call('POST', `lots/${code}/veto`, { lot: idOf(code, 'C1') }, 'b');
  const v0 = (await call('GET', `lots/${code}`, null, 'a')).d.room.ver;
  const off = await call('POST', `lots/${code}/evening`, { on: false }, 'a');
  assert.equal(off.status, 200);
  assert.deepEqual([off.d.evening, off.d.vetoes], [false, []]);
  const g = await call('GET', `lots/${code}?v=${v0}`, null, 'a');
  assert.ok(g.d.room.ver > v0);
  assert.deepEqual(g.d.lots.filter((l) => l.veto), []);
});
