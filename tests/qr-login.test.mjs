// Вход по QR-коду (functions/_lib/qr-login.js): компьютер просит код, телефон с входом разрешает, компьютер
// подтверждает аккаунт, сессия — один раз. node --test tests/qr-login.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { makeQrLoginRoutes, dropQr, QR_GONE, QR_TTL, CONFIRM_TTL } from '../functions/_lib/qr-login.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, email TEXT, created_at INTEGER, banned INTEGER DEFAULT 0, totp TEXT, email_ok INTEGER, hide_online INTEGER);
    INSERT INTO users (id, username, uname) VALUES ('u1', 'Тестер', 'tester'), ('u2', 'Зритель', 'viewer');`);
  return { raw: db, prepare: (sql) => stmt(sql) };
}
function setup() {
  const sessions = [], limits = [];
  const h = {
    json: (data, status = 200) => ({ status, data }),
    fail: (status, error) => ({ status, data: { error } }),
    readBody: async (req) => req.body || {},
    burst: () => 0,
    bump: async (env, key, kind) => { limits.push([key, kind]); return 0; },
    tooMany: (min) => ({ status: 429, data: { error: 'wait ' + min } }),
    clientIp: () => '1.2.3.4',
    sha256: async (s) => createHash('sha256').update(s).digest('hex'),
    randHex: (n) => randomBytes(n).toString('hex'),
    newSession: async (env, uid, req) => { sessions.push({ uid, ua: req.headers.get('user-agent') }); return 'tok-' + uid; },
    ownUser: (u) => ({ id: u.id, username: u.username, handle: u.uname }),
    deviceLabel: (ua) => (/Windows/.test(ua || '') ? 'Chrome · Windows' : ''),
  };
  const env = { DB: fakeD1() };
  const R = makeQrLoginRoutes(h);
  const req = (body, ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/131') => ({ body, headers: new Headers({ 'user-agent': ua }), cf: { country: 'UA', city: 'Kyiv' } });
  const me = { id: 'u1', username: 'Тестер', handle: 'tester' };
  const at = (id) => env.DB.raw.prepare('SELECT state, expires_at FROM qr_logins WHERE id = ?').get(id);
  return {
    env, sessions, limits, at,
    create: async () => (await R['POST /qr/new']({ env, request: req() })).data,
    poll: async (id, key, take) => (await R['POST /qr/poll']({ env, request: req(take ? { id, key, take: true } : { id, key }) })).data,
    see: async (id, who = me) => (await R['POST /qr/see']({ env, request: req({ id }, 'iPhone'), me: who })).data,
    answer: async (id, ok, who = me) => R['POST /qr/answer']({ env, request: req({ id, ok }, 'iPhone'), me: who }),
  };
}
const viewer = { id: 'u2', username: 'Зритель', handle: 'viewer' };

test('вход по QR: ждём телефон → телефон открыл ссылку → разрешил → компьютер подтвердил аккаунт → сессия один раз', async () => {
  const s = setup();
  const c = await s.create();
  assert.match(c.id, /^[0-9a-f]{32}$/);
  assert.match(c.key, /^[0-9a-f]{64}$/);
  assert.equal(c.ttl, QR_TTL);
  assert.deepEqual(s.limits, [['qrnew:1.2.3.4', 'qrNew']], 'новые коды считаются в базе, по адресу');
  assert.deepEqual(await s.poll(c.id, c.key), { state: 'wait' });
  const row = s.env.DB.raw.prepare('SELECT key_hash FROM qr_logins WHERE id = ?').get(c.id);
  assert.notEqual(row.key_hash, c.key, 'ключ компьютера в базе — только хешем');
  const seen = await s.see(c.id);
  assert.equal(seen.state, 'ask');
  assert.equal(seen.device, 'Chrome · Windows', 'телефон видит устройство компьютера, а не своё');
  assert.deepEqual([seen.country, seen.city, seen.user.handle], ['UA', 'Kyiv', 'tester']);
  assert.ok(seen.left > 0 && seen.left <= QR_TTL);
  assert.deepEqual(await s.poll(c.id, c.key), { state: 'seen' }, 'компьютер узнаёт, что пора подтвердить на телефоне');
  assert.equal((await s.answer(c.id, true)).status, 200);
  assert.deepEqual(await s.poll(c.id, c.key), { state: 'confirm', user: { name: 'Тестер', handle: 'tester' } }, 'сначала — чей аккаунт');
  assert.equal(s.sessions.length, 0, 'без «Да» на компьютере сессии нет');
  const got = await s.poll(c.id, c.key, true);
  assert.deepEqual(got, { state: 'ok', token: 'tok-u1', user: { id: 'u1', username: 'Тестер', handle: 'tester' } });
  assert.deepEqual(s.sessions, [{ uid: 'u1', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131' }], 'сессия — на устройство компьютера');
  assert.deepEqual(await s.poll(c.id, c.key, true), { state: 'gone' }, 'второй раз сессию не дают');
  assert.equal(s.sessions.length, 1);
  assert.equal((await s.see(c.id)).state, 'done');
});

test('вход по QR: QR отсканировал чужой — компьютер видит, чей аккаунт, и может не входить', async () => {
  const s = setup();
  const c = await s.create();
  await s.answer(c.id, true, viewer);
  assert.deepEqual(await s.poll(c.id, c.key), { state: 'confirm', user: { name: 'Зритель', handle: 'viewer' } });
  assert.equal(s.sessions.length, 0, 'пока на компьютере не нажали «Да», в чужой аккаунт не входят');
});

test('вход по QR: без ключа компьютера сессию не забрать; отказ; устаревший код; разрешили в последние секунды', async () => {
  const s = setup();
  const c = await s.create();
  await s.answer(c.id, true);
  assert.deepEqual(await s.poll(c.id, 'f'.repeat(64), true), { state: 'gone' }, 'чужой ключ — как будто кода нет');
  assert.deepEqual(await s.poll(c.id, 'nope', true), { state: 'gone' });
  assert.equal(s.sessions.length, 0);
  assert.equal((await s.answer(c.id, true)).status, 410, 'ответить второй раз нельзя');

  const d = await s.create();
  await s.answer(d.id, false);
  assert.deepEqual(await s.poll(d.id, d.key), { state: 'denied' });
  assert.deepEqual(await s.poll(d.id, d.key, true), { state: 'denied' });
  assert.equal((await s.see(d.id)).state, 'gone');

  const old = await s.create();
  s.env.DB.raw.prepare('UPDATE qr_logins SET expires_at = ? WHERE id = ?').run(Date.now() - 1, old.id);
  assert.equal((await s.see(old.id)).state, 'gone');
  const late = await s.answer(old.id, true);
  assert.deepEqual([late.status, late.data.error], [410, QR_GONE]);
  assert.deepEqual(await s.poll(old.id, old.key), { state: 'gone' });

  // «Войти» нажали за секунду до конца кода — у компьютера ещё 2 минуты на «Да»
  const edge = await s.create();
  s.env.DB.raw.prepare('UPDATE qr_logins SET expires_at = ? WHERE id = ?').run(Date.now() + 1000, edge.id);
  await s.answer(edge.id, true);
  assert.ok(s.at(edge.id).expires_at >= Date.now() + CONFIRM_TTL - 5000, 'после «Войти» срок продлён');
  assert.equal((await s.poll(edge.id, edge.key)).state, 'confirm');
  assert.equal((await s.poll(edge.id, edge.key, true)).state, 'ok');
  // но не дольше: подтвердили через 2 минуты с лишним — код устарел
  const stale = await s.create();
  await s.answer(stale.id, true);
  s.env.DB.raw.prepare('UPDATE qr_logins SET expires_at = ? WHERE id = ?').run(Date.now() - 1, stale.id);
  assert.deepEqual(await s.poll(stale.id, stale.key, true), { state: 'gone' });
});

test('вход по QR: заблокированный аккаунт и отозванные сессии; мусор вместо кода — «устарел»', async () => {
  const s = setup();
  const c = await s.create();
  await s.answer(c.id, true, viewer);
  s.env.DB.raw.prepare('UPDATE users SET banned = 1 WHERE id = ?').run('u2');
  assert.deepEqual(await s.poll(c.id, c.key), { state: 'denied' });
  assert.deepEqual(await s.poll(c.id, c.key, true), { state: 'denied' });
  assert.equal(s.sessions.length, 0);
  // «Выйти на всех устройствах» или новый пароль: разрешённый, но не забранный вход тоже пропадает
  const d = await s.create();
  await s.answer(d.id, true);
  await dropQr(s.env, 'u1');
  assert.deepEqual(await s.poll(d.id, d.key, true), { state: 'gone' });
  assert.equal(s.sessions.length, 0);
  await dropQr({ DB: { prepare: () => { throw new Error('no such table: qr_logins'); } } }, 'u1'); // таблицы ещё нет — не падает
  assert.deepEqual(await s.see('../../etc'), { state: 'gone' });
  assert.equal((await s.answer("1' OR '1'='1", true)).status, 410);
  assert.deepEqual(await s.poll('', ''), { state: 'gone' });
});
