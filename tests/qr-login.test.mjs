// Вход по QR-коду (functions/_lib/qr-login.js): компьютер просит код, телефон с входом разрешает, компьютер
// подтверждает аккаунт, сессия — один раз. node --test tests/qr-login.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { makeQrLoginRoutes, dropQr, netOf, QR_GONE, QR_TTL, CONFIRM_TTL, CODE_BAD, CODE_TRIES } from '../functions/_lib/qr-login.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, email TEXT, created_at INTEGER, banned INTEGER DEFAULT 0, ban_reason TEXT, totp TEXT, email_ok INTEGER, hide_online INTEGER);
    CREATE TABLE attempts (key TEXT PRIMARY KEY, count INTEGER, reset_at INTEGER);
    INSERT INTO users (id, username, uname) VALUES ('u1', 'Тестер', 'tester'), ('u2', 'Зритель', 'viewer');`);
  return { raw: db, prepare: (sql) => stmt(sql) };
}
function setup(over = {}) {
  const sessions = [], limits = [], steps = [], factors = [];
  const h = {
    json: (data, status = 200) => ({ status, data }),
    fail: (status, error) => ({ status, data: { error } }),
    readBody: async (req) => req.body || {},
    burst: () => 0,
    bump: async (env, key, kind) => { limits.push([key, kind]); return over.wait && over.wait(key) ? 7 : 0; },
    tooMany: (min) => ({ status: 429, data: { error: 'wait ' + min } }),
    clientIp: () => '1.2.3.4',
    sha256: async (s) => createHash('sha256').update(s).digest('hex'),
    randHex: (n) => randomBytes(n).toString('hex'),
    newSession: async (env, uid, req) => { sessions.push({ uid, ua: req.headers.get('user-agent') }); return 'tok-' + uid; },
    ownUser: (u) => ({ id: u.id, username: u.username, handle: u.uname, ...(u.totp ? { codeLogin: !!JSON.parse(u.totp).free } : {}) }),
    deviceLabel: (ua) => (/Windows/.test(ua || '') ? 'Chrome · Windows' : ''),
    // вход по коду: «верный» код из приложения — 123456 (шаг 100), запасной для настроек — тот же
    findLogin: async (env, ident) => env.DB.raw.prepare('SELECT * FROM users WHERE uname = ? OR email = ?').get(ident.replace(/^@+/, '').toLowerCase(), ident.toLowerCase()) ?? null,
    totpOf: (u) => { try { const t = u && u.totp ? JSON.parse(u.totp) : null; return t && t.s ? t : null; } catch (e) { return null; } },
    totpStep: async (secret, code, last, offsets) => { steps.push(offsets); return String(code) === '123456' && 100 > (last || 0) ? 100 : 0; },
    secondFactor: async (env, u, code) => { factors.push(code); return String(code) === '123456'; },
    // текущий пароль тестера — «пароль-ок»
    passOk: async (env, uid, password) => uid === 'u1' && password === 'пароль-ок',
    BAD_CODE: 'bad code',
  };
  const env = { DB: fakeD1() };
  const R = makeQrLoginRoutes(h);
  const req = (body, ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/131') => ({ body, headers: new Headers({ 'user-agent': ua }), cf: { country: 'UA', city: 'Kyiv' } });
  const me = { id: 'u1', username: 'Тестер', handle: 'tester' };
  const at = (id) => env.DB.raw.prepare('SELECT state, expires_at FROM qr_logins WHERE id = ?').get(id);
  return {
    env, sessions, limits, steps, factors, at,
    create: async () => (await R['POST /qr/new']({ env, request: req() })).data,
    poll: async (id, key, take) => (await R['POST /qr/poll']({ env, request: req(take ? { id, key, take: true } : { id, key }) })).data,
    see: async (id, who = me) => (await R['POST /qr/see']({ env, request: req({ id }, 'iPhone'), me: who })).data,
    answer: async (id, ok, who = me) => R['POST /qr/answer']({ env, request: req({ id, ok }, 'iPhone'), me: who }),
    byCode: async (login, code) => R['POST /login/code']({ env, request: req({ login, code }) }),
    free: async (on, code, password = 'пароль-ок') => { const u = env.DB.raw.prepare('SELECT * FROM users WHERE id = ?').get('u1'); return R['POST /2fa/free']({ env, request: req({ on, code, password }, 'iPhone'), me: { ...me, totp: u.totp } }); },
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

test('вход по коду из приложения: только если включён в Настройках; один ответ на всё неверное; повтор кода не проходит', async () => {
  const s = setup();
  const db = s.env.DB.raw;
  assert.equal((await s.free(true, '123456')).status, 400, 'без двухфакторной защиты включать нечего');
  db.prepare('UPDATE users SET totp = ? WHERE id = ?').run(JSON.stringify({ s: 'SECRET', last: 0, codes: [] }), 'u1');
  const off = await s.byCode('@tester', '123456');
  assert.deepEqual([off.status, off.data.error], [401, CODE_BAD], 'приложение есть, но вход по коду не включён — не пускаем');
  const bad = await s.free(true, '000000');
  assert.deepEqual([bad.status, bad.data.error], [403, 'bad code'], 'включить — только с кодом из приложения');
  const on = await s.free(true, '123456');
  assert.equal(on.data.user.codeLogin, true);
  assert.equal(JSON.parse(db.prepare('SELECT totp FROM users WHERE id = ?').get('u1').totp).free, 1);
  for (const [login, code] of [['@tester', '000000'], ['nobody', '123456'], ['', '123456']]) {
    const r = await s.byCode(login, code);
    assert.deepEqual([r.status, r.data.error], [401, CODE_BAD], 'неверный код, чужой аккаунт и пустое поле — один и тот же ответ: ' + login);
  }
  const ok = await s.byCode('TESTER', '123456');
  assert.deepEqual(ok.data, { token: 'tok-u1', user: { id: 'u1', username: 'Тестер', handle: 'tester', codeLogin: true } });
  assert.equal(JSON.parse(db.prepare('SELECT totp FROM users WHERE id = ?').get('u1').totp).last, 100, 'шаг кода запомнен');
  const again = await s.byCode('@tester', '123456');
  assert.deepEqual([again.status, again.data.error], [401, CODE_BAD], 'тот же код второй раз не проходит');
  assert.equal(s.sessions.length, 1);
  assert.ok(s.limits.some(([k, kind]) => k === 'code-acc:u1' && kind === 'codeAcc'), 'попытки считаются на аккаунт');
  assert.ok(s.limits.some(([k]) => k === 'code-acc:x:nobody'), 'и на написанное, если такого аккаунта нет: по лимиту не узнать, есть ли он');
  assert.ok(s.steps.every((o) => JSON.stringify(o) === '[0,-1]'), 'без пароля — только текущий и прошлый код');
  const offAgain = await s.free(false, '123456');
  assert.equal(offAgain.data.user.codeLogin, false);
  assert.equal((await s.byCode('@tester', '123456')).status, 401, 'выключил — снова только пароль');
});

test('вход по коду без пароля: включить — только с текущим паролем (укравшему сеанс не включить), выключить — без него', async () => {
  const s = setup();
  const db = s.env.DB.raw;
  const totp = () => JSON.parse(db.prepare('SELECT totp FROM users WHERE id = ?').get('u1').totp);
  db.prepare('UPDATE users SET totp = ? WHERE id = ?').run(JSON.stringify({ s: 'S', last: 0, codes: ['x'] }), 'u1');
  const none = await s.free(true, '123456', '');
  assert.deepEqual([none.status, none.data.error], [403, 'Чтобы включить вход по коду, впиши текущий пароль.']);
  const wrong = await s.free(true, '123456', 'чужой');
  assert.deepEqual([wrong.status, wrong.data.error], [403, 'Текущий пароль не подходит.']);
  assert.equal(totp().free, undefined, 'без пароля вход по коду не включился');
  assert.equal(s.factors.length, 0, 'неверный пароль код из приложения (или запасной) не тратит: пароль проверяется раньше');
  assert.ok(s.limits.filter(([k, kind]) => k === 'acc:u1' && kind === 'loginAcc').length >= 2, 'попытки пароля считаются, как в Настройках');
  const ok = await s.free(true, '123456');
  assert.equal(ok.data.user.codeLogin, true);
  assert.equal(totp().free, 1);
  const off = await s.free(false, '123456', '');
  assert.equal(off.status, 200, 'выключить можно и без пароля');
  assert.equal(off.data.user.codeLogin, false);
  assert.equal(totp().free, undefined);
});

test('вход по коду из приложения: заблокированный не входит, лимиты попыток работают', async () => {
  const s = setup({ wait: (key) => key === 'code-acc:u2' });
  const db = s.env.DB.raw;
  db.prepare('UPDATE users SET totp = ?, banned = 1, ban_reason = ? WHERE id = ?').run(JSON.stringify({ s: 'S', last: 0, free: 1 }), 'спам', 'u1');
  const ban = await s.byCode('@tester', '123456');
  assert.deepEqual([ban.status, ban.data.error], [403, 'Аккаунт заблокирован администрацией: спам']);
  assert.equal(s.sessions.length, 0);
  db.prepare('UPDATE users SET totp = ? WHERE id = ?').run(JSON.stringify({ s: 'S', last: 0, free: 1 }), 'u2');
  const many = await s.byCode('@viewer', '123456');
  assert.deepEqual([many.status, many.data.error], [429, 'Слишком много попыток входа по коду. Войди по паролю или подожди 7 мин.'], 'много попыток на аккаунт — ждать или войти по паролю, даже с верным кодом');
  assert.equal(s.sessions.length, 0);
});

test('вход по коду из приложения: 10 неверных кодов подряд выключают его, верный — обнуляет счёт', async () => {
  const s = setup();
  const db = s.env.DB.raw;
  const totp = () => JSON.parse(db.prepare('SELECT totp FROM users WHERE id = ?').get('u1').totp);
  db.prepare('UPDATE users SET totp = ? WHERE id = ?').run(JSON.stringify({ s: 'S', last: 0, free: 1, codes: ['x'] }), 'u1');
  for (let i = 0; i < 4; i++) await s.byCode('@tester', '000000');
  assert.equal(totp().bad, 4);
  assert.equal((await s.byCode('@tester', '123456')).status, 200);
  assert.deepEqual([totp().bad, totp().last, totp().codes], [0, 100, ['x']], 'верный код: счёт в ноль, шаг запомнен, остальное не тронуто');
  db.prepare('UPDATE users SET totp = ? WHERE id = ?').run(JSON.stringify({ s: 'S', last: 0, free: 1 }), 'u1');
  for (let i = 0; i < CODE_TRIES; i++) assert.equal((await s.byCode('@tester', '000000')).status, 401);
  assert.equal(totp().free, undefined, 'десятый неверный подряд — вход по коду выключен');
  assert.equal(totp().bad, 0);
  const late = await s.byCode('@tester', '123456');
  assert.deepEqual([late.status, late.data.error], [401, CODE_BAD], 'теперь и верный код не пускает — тот же ответ, что всегда');
  assert.equal(s.sessions.length, 1);
  assert.equal((await s.free(true, '123456')).data.user.codeLogin, true, 'включить снова — в Настройках, с кодом');
});

test('адрес для лимита: у IPv6 — сеть /64', () => {
  assert.equal(netOf('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3:8d3::/64');
  assert.equal(netOf('2001:DB8::1'), '2001:db8:0:0::/64');
  assert.equal(netOf('2001:db8:1:2::abcd'), '2001:db8:1:2::/64');
  assert.equal(netOf('::1'), '0:0:0:0::/64');
  assert.equal(netOf('203.0.113.9'), '203.0.113.9');
});
