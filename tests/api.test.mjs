// Адреса API целиком — functions/api/[[path]].js через onRequest, как их зовёт Cloudflare: вход, защита, полка, реакции,
// комментарии, фото, ссылки на отзыв, удаление аккаунта. База — SQLite в памяти (node:sqlite) с тем же видом, что у D1.
// node --test tests/api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isRead = (sql) => /^\s*(SELECT|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const stmt = (sql, args = []) => ({
    sql,
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    exec() {
      const p = db.prepare(sql);
      if (isRead(sql)) return { results: p.all(...args), meta: { changes: 0 } };
      return { results: [], meta: { changes: Number(p.run(...args).changes) } };
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

// свежий модуль API на каждый тест: у модуля свои кэши (схема уже создана, лимиты в памяти)
let gen = 0;
async function site(extra = {}) {
  const mod = await import(new URL(`../functions/api/%5B%5Bpath%5D%5D.js?t=${++gen}`, import.meta.url).href);
  const env = { DB: fakeD1(), ...extra };
  const call = async (method, path, { token, body, ip = '10.0.0.1' } = {}) => {
    const headers = { 'CF-Connecting-IP': ip };
    if (token) headers.authorization = 'Bearer ' + token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const request = new Request('https://casualhub.test/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const res = await mod.onRequest({ request, env, params: { path: path.split('?')[0].split('/').filter(Boolean) }, waitUntil: () => {} });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}
    return { status: res.status, data, res };
  };
  const q = (sql, ...a) => env.DB.raw.prepare(sql).all(...a);
  const one = (sql, ...a) => env.DB.raw.prepare(sql).get(...a);
  // новый аккаунт через /register: { id, token, pass }
  let n = 0;
  const join = async (handle, pass = 'пароль-' + handle + '-1') => {
    const r = await call('POST', '/register', { body: { username: handle, handle, password: pass, email: handle + '@mail.test' }, ip: '10.1.0.' + (++n) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return { id: r.data.user.id, token: r.data.token, pass, handle };
  };
  const friends = async (a, b) => {
    assert.equal((await call('POST', '/friends/request', { token: a.token, body: { handle: b.handle } })).status, 200);
    assert.equal((await call('POST', '/friends/accept', { token: b.token, body: { userId: a.id } })).status, 200);
  };
  const shelf = (u, ratings, deleted = []) => call('PUT', '/shelf', { token: u.token, body: { ratings, deleted } });
  return { env, call, q, one, join, friends, shelf };
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const iso = (t) => new Date(t).toISOString();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// код из приложения-аутентификатора для секрета base32 (RFC 6238, как у сервера)
function totp(secret, step = Math.floor(Date.now() / 30e3)) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0;
  const key = [];
  for (const c of secret) { val = ((val << 5) | A.indexOf(c)) & 0xffff; bits += 5; if (bits >= 8) { key.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(step / 4294967296), 0); msg.writeUInt32BE(step >>> 0, 4);
  const h = createHmac('sha1', Buffer.from(key)).update(msg).digest();
  const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
const xp = (s, uid, kind, ref) => s.one('SELECT gone FROM xp_log WHERE user_id = ? AND kind = ? AND ref = ?', uid, kind, ref);

test('защита: включить приложение-аутентификатор и вход по коду — только с текущим паролем; новый пароль выключает вход по коду', async () => {
  const s = await site();
  const u = await s.join('tester');
  const start = await s.call('POST', '/2fa/start', { token: u.token });
  assert.equal(start.status, 200);
  const code = totp(start.data.secret);
  // укравший сеанс пароля не знает — подключить своё приложение не выйдет
  let r = await s.call('POST', '/2fa/enable', { token: u.token, body: { code } });
  assert.deepEqual([r.status, r.data.error], [403, 'Чтобы включить защиту, впиши текущий пароль.']);
  r = await s.call('POST', '/2fa/enable', { token: u.token, body: { code, password: 'не тот пароль' } });
  assert.deepEqual([r.status, r.data.error], [403, 'Текущий пароль не подходит.']);
  assert.equal(s.one('SELECT totp FROM users WHERE id = ?', u.id).totp, null);
  r = await s.call('POST', '/2fa/enable', { token: u.token, body: { code, password: u.pass } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.twoFactor, true);
  const backup = r.data.codes;
  assert.equal(backup.length, 10);
  // вход по коду без пароля: включить — тоже с паролем, и неверный пароль запасной код не тратит
  r = await s.call('POST', '/2fa/free', { token: u.token, body: { on: true, code: backup[0] } });
  assert.deepEqual([r.status, r.data.error], [403, 'Чтобы включить вход по коду, впиши текущий пароль.']);
  r = await s.call('POST', '/2fa/free', { token: u.token, body: { on: true, code: backup[0], password: u.pass } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.codeLogin, true);
  assert.equal(JSON.parse(s.one('SELECT totp FROM users WHERE id = ?', u.id).totp).codes.length, 9, 'потрачен один запасной код');
  // смена пароля: вход по коду выключается, остальное в защите на месте
  r = await s.call('PUT', '/account', { token: u.token, body: { password: 'новый-пароль-2', current: u.pass } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.codeLogin, false);
  assert.equal(r.data.user.twoFactor, true);
  let t = JSON.parse(s.one('SELECT totp FROM users WHERE id = ?', u.id).totp);
  assert.equal(t.free, undefined);
  assert.equal(t.s, start.data.secret);
  assert.equal(t.codes.length, 9);
  // включили снова, потом сбросили пароль по ссылке из письма — тоже выключается
  r = await s.call('POST', '/2fa/free', { token: u.token, body: { on: true, code: backup[1], password: 'новый-пароль-2' } });
  assert.equal(r.data.user.codeLogin, true);
  const tok = 'ab'.repeat(32);
  s.env.DB.raw.prepare("INSERT INTO mail_tokens (hash, user_id, kind, email, expires_at) VALUES (?, ?, 'reset', ?, ?)").run(sha(tok), u.id, 'tester@mail.test', Date.now() + 3600e3);
  r = await s.call('POST', '/password/reset', { body: { token: tok, password: 'третий-пароль-3' } });
  assert.equal(r.status, 200);
  t = JSON.parse(s.one('SELECT totp FROM users WHERE id = ?', u.id).totp);
  assert.equal(t.free, undefined);
  assert.equal(t.s, start.data.secret, 'сброс пароля по почте защиту не снимает');
});

test('сброс пароля: ссылка на прежнюю почту после смены почты не работает и не «подтверждает» новую', async () => {
  const s = await site();
  const u = await s.join('mailer');
  const token = (t, email) => s.env.DB.raw.prepare("INSERT INTO mail_tokens (hash, user_id, kind, email, expires_at) VALUES (?, ?, 'reset', ?, ?)").run(sha(t), u.id, email, Date.now() + 3600e3);
  const t1 = '1a'.repeat(32), t2 = '2b'.repeat(32), t3 = '3c'.repeat(32);
  token(t1, 'mailer@mail.test');
  // почту сменили: старые ссылки на сброс гаснут сразу
  assert.equal((await s.call('PUT', '/account', { token: u.token, body: { email: 'new@mail.test', current: u.pass } })).status, 200);
  assert.equal(s.one('SELECT used FROM mail_tokens WHERE hash = ?', sha(t1)).used, 1);
  let r = await s.call('POST', '/password/reset', { body: { token: t1, password: 'чужой-пароль-1' } });
  assert.deepEqual([r.status, r.data.error], [400, 'Ссылка устарела или уже использована. Запроси новое письмо.']);
  // и даже не погашенная ссылка на прежнюю почту (письмо ушло до смены) — не подходит
  token(t2, 'mailer@mail.test');
  r = await s.call('POST', '/password/reset', { body: { token: t2, password: 'чужой-пароль-2' } });
  assert.equal(r.status, 400);
  assert.equal(s.one('SELECT email_ok FROM users WHERE id = ?', u.id).email_ok, 0, 'новая почта не стала подтверждённой');
  assert.equal((await s.call('POST', '/login', { body: { login: 'mailer', password: u.pass } })).status, 200, 'пароль прежний');
  // ссылка на нынешнюю почту — работает и подтверждает её
  token(t3, 'new@mail.test');
  r = await s.call('POST', '/password/reset', { body: { token: t3, password: 'новый-пароль-3' } });
  assert.equal(r.status, 200);
  assert.equal(s.one('SELECT email_ok FROM users WHERE id = ?', u.id).email_ok, 1);
  assert.equal((await s.call('POST', '/login', { body: { login: 'mailer', password: 'новый-пароль-3' } })).status, 200);
});

test('вход: чужие неверные пароли с одной сети не запирают хозяина; со всех сетей — общий потолок', async () => {
  const s = await site();
  const u = await s.join('owner');
  const login = (password, ip) => s.call('POST', '/login', { body: { login: 'owner', password }, ip });
  for (let i = 0; i < 10; i++) assert.equal((await login('мимо-' + i, '203.0.113.7')).status, 401);
  assert.equal((await login('мимо', '203.0.113.7')).status, 429, 'одиннадцатая попытка с той же сети — подожди');
  assert.equal((await login(u.pass, '203.0.113.7')).status, 429, 'и с верным паролем с этой сети — тоже');
  assert.equal((await login(u.pass, '198.51.100.20')).status, 200, 'хозяин со своей сети входит');
  // IPv6: вся сеть /64 — одна сеть
  for (let i = 0; i < 10; i++) await login('мимо', '2001:db8:1:2::' + (i + 1).toString(16));
  assert.equal((await login(u.pass, '2001:db8:1:2:ffff::1')).status, 429);
  assert.equal((await login(u.pass, '2001:db8:1:3::1')).status, 200);
  // подбор с многих сетей упирается в общий потолок аккаунта (100 за 15 минут)
  s.env.DB.raw.exec('DELETE FROM attempts');
  for (let net = 0; net < 10; net++) for (let i = 0; i < 10; i++) await login('мимо', `192.0.2.${net + 1}`);
  assert.equal((await login(u.pass, '198.51.100.99')).status, 429);
  // сброс пароля по почте снимает все счётчики аккаунта
  const tok = 'cd'.repeat(32);
  s.env.DB.raw.prepare("INSERT INTO mail_tokens (hash, user_id, kind, email, expires_at) VALUES (?, ?, 'reset', 'owner@mail.test', ?)").run(sha(tok), u.id, Date.now() + 3600e3);
  assert.equal((await s.call('POST', '/password/reset', { body: { token: tok, password: 'новый-пароль-4' }, ip: '198.51.100.5' })).status, 200);
  assert.equal(s.one("SELECT COUNT(*) AS n FROM attempts WHERE key LIKE 'login-acc:' || ? || '%'", u.id).n, 0);
  assert.equal((await login('новый-пароль-4', '192.0.2.1')).status, 200);
});

test('встречная заявка в друзья — дружба и опыт за нового друга обоим, как при «Принять»', async () => {
  const s = await site({ LEVELS: '1' });
  const a = await s.join('alice'), b = await s.join('bobby');
  assert.equal((await s.call('POST', '/friends/request', { token: a.token, body: { handle: 'bobby' } })).data.status, 'pending');
  const r = await s.call('POST', '/friends/request', { token: b.token, body: { handle: 'alice' } });
  assert.equal(r.data.status, 'accepted');
  assert.equal(xp(s, a.id, 'friend', b.id).gone, 0);
  assert.equal(xp(s, b.id, 'friend', a.id).gone, 0);
});

test('полка: время из будущего не держит оценку — её можно изменить и удалить, в том числе застрявшую раньше', async () => {
  const s = await site();
  const u = await s.join('clock');
  const now = Date.now(), future = iso(now + 30 * 864e5);
  assert.equal((await s.shelf(u, [{ id: 'r1', name: 'Спешащие часы', createdAt: future, updatedAt: future }])).status, 200);
  const stored = () => JSON.parse(s.one('SELECT data FROM shelves WHERE user_id = ?', u.id).data).ratings;
  const r1 = stored().find((r) => r.id === 'r1');
  assert.ok(+new Date(r1.updatedAt) <= Date.now() && +new Date(r1.createdAt) <= Date.now(), 'время не позже, чем сейчас');
  assert.equal((await s.shelf(u, [], [{ id: 'r1', at: Date.now() + 1 }])).status, 200);
  assert.equal(stored().length, 0, 'удаление с другого устройства прошло');
  // оценка, записанная из будущего до этой проверки: правка с верными часами всё равно проходит
  s.env.DB.raw.prepare('UPDATE shelves SET data = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify({ ratings: [{ id: 'r2', name: 'Старое', updatedAt: future }], deleted: [] }), now - 3600e3, u.id);
  await s.shelf(u, [{ id: 'r2', name: 'Новое', updatedAt: iso(now - 60e3) }]);
  assert.equal(stored().find((r) => r.id === 'r2').name, 'Новое');
});

test('подписки: /follow меняет только своё поле — оценки, записанные в это же время, не откатываются', async () => {
  const s = await site();
  const u = await s.join('follower');
  await s.shelf(u, [{ id: 'r1', name: 'Первая', updatedAt: iso(Date.now() - 1000) }]);
  // пока /follow делает своё, другое устройство дописывает оценку (раньше /follow записывал прочитанную копию целиком)
  const raw = s.env.DB.prepare;
  let armed = true;
  s.env.DB.prepare = (sql) => {
    if (armed && /INSERT INTO shelves/.test(sql)) {
      armed = false;
      const d = JSON.parse(s.one('SELECT data FROM shelves WHERE user_id = ?', u.id).data);
      d.ratings.push({ id: 'r2', name: 'Вторая', updatedAt: iso(Date.now()) });
      s.env.DB.raw.prepare('UPDATE shelves SET data = ? WHERE user_id = ?').run(JSON.stringify(d), u.id);
    }
    return raw(sql);
  };
  const r = await s.call('PUT', '/follow', { token: u.token, body: { ids: ['f1', 'f2', 'bad id!'], at: 100 } });
  s.env.DB.prepare = raw;
  assert.deepEqual([...r.data.ids], ['f1', 'f2']);
  const d = JSON.parse(s.one('SELECT data FROM shelves WHERE user_id = ?', u.id).data);
  assert.deepEqual(d.ratings.map((x) => x.id), ['r1', 'r2'], 'оценка с другого устройства на месте');
  assert.deepEqual(d.follow, { ids: ['f1', 'f2'], at: 100 });
  // выбор старше того, что на сервере, не записывается: сервер отдаёт свой
  const old = await s.call('PUT', '/follow', { token: u.token, body: { ids: ['zz'], at: 50 } });
  assert.deepEqual([...old.data.ids], ['f1', 'f2']);
  assert.deepEqual((await s.call('GET', '/follow', { token: u.token })).data, { ids: ['f1', 'f2'], at: 100 });
  // полки ещё нет — заводится; полка старого вида (просто список) — становится новой
  const v = await s.join('newbie');
  assert.deepEqual([...(await s.call('PUT', '/follow', { token: v.token, body: { ids: ['x'], at: 1 } })).data.ids], ['x']);
  s.env.DB.raw.prepare('UPDATE shelves SET data = ? WHERE user_id = ?').run(JSON.stringify([{ id: 'a1', name: 'Старый вид' }]), v.id);
  await s.call('PUT', '/follow', { token: v.token, body: { ids: ['y'], at: 2 } });
  const dv = JSON.parse(s.one('SELECT data FROM shelves WHERE user_id = ?', v.id).data);
  assert.deepEqual([dv.ratings[0].id, dv.follow.ids[0]], ['a1', 'y']);
});

test('реакции: только на оценку или тир-лист, которые у друга есть и видны ему', async () => {
  const s = await site({ LEVELS: '1' });
  const a = await s.join('reacter'), b = await s.join('target');
  await s.friends(a, b);
  await s.shelf(b, [{ id: 'r1', name: 'Видна друзьям' }, { id: 'r2', name: 'Только я', vis: 'private' }]);
  const tier = (id, priv) => s.env.DB.raw.prepare('INSERT INTO tierlists (user_id, id, data, meta, private, at) VALUES (?, ?, ?, ?, ?, ?)').run(b.id, id, '{}', '{}', priv, 1);
  tier('t1', 0); tier('t2', 1);
  const react = (rid) => s.call('PUT', `/react/${b.id}/${rid}`, { token: a.token, body: { emoji: 'fire' } });
  assert.equal((await react('r1')).status, 200);
  assert.equal((await react('t.t1')).status, 200);
  for (const [rid, err] of [['fake1', 'Нет такой оценки.'], ['r2', 'Нет такой оценки.'], ['t.t2', 'Нет такого тир-листа.'], ['t.nope', 'Нет такого тир-листа.']]) {
    const r = await react(rid);
    assert.deepEqual([r.status, r.data.error], [404, err], rid);
    assert.equal(xp(s, a.id, 'react', `${b.id}:${rid}`), undefined, 'за выдуманное опыта нет: ' + rid);
  }
  assert.equal(s.one('SELECT COUNT(*) AS n FROM reactions WHERE owner_id = ?', b.id).n, 2);
  assert.equal(xp(s, a.id, 'react', `${b.id}:r1`).gone, 0);
  // убрать свою реакцию можно всегда
  assert.equal((await s.call('PUT', `/react/${b.id}/r1`, { token: a.token, body: {} })).data.removed, true);
});

test('комментарии: опыт хозяину — тоже от 10 знаков; удалил оценку или тир-лист — опыт за реакции и комментарии под ними снят', async () => {
  const s = await site({ LEVELS: '1' });
  const a = await s.join('writer'), b = await s.join('author');
  await s.friends(a, b);
  await s.shelf(b, [{ id: 'r1', name: 'Под удаление', updatedAt: iso(Date.now() - 5000) }]);
  const short = await s.call('POST', `/comments/${b.id}/r.r1`, { token: a.token, body: { text: '+' } });
  assert.equal(short.status, 200);
  assert.equal(xp(s, b.id, 'got_comment', short.data.item.id), undefined, 'за «+» хозяину опыта нет');
  assert.equal(xp(s, a.id, 'comment', short.data.item.id), undefined);
  const long = await s.call('POST', `/comments/${b.id}/r.r1`, { token: a.token, body: { text: 'Отличный выбор, согласен' } });
  assert.equal(xp(s, b.id, 'got_comment', long.data.item.id).gone, 0);
  assert.equal(xp(s, a.id, 'comment', long.data.item.id).gone, 0);
  await s.call('PUT', `/react/${b.id}/r1`, { token: a.token, body: { emoji: 'fire' } });
  assert.equal(xp(s, a.id, 'react', `${b.id}:r1`).gone, 0);
  assert.equal(xp(s, b.id, 'got_react', `${a.id}:r1`).gone, 0);
  // хозяин удалил оценку: реакции и комментарии под ней уходят — и опыт за них у обоих
  await s.shelf(b, [], [{ id: 'r1', at: Date.now() }]);
  assert.equal(s.one('SELECT COUNT(*) AS n FROM reactions WHERE owner_id = ?', b.id).n, 0);
  assert.equal(s.one('SELECT COUNT(*) AS n FROM comments WHERE owner_id = ?', b.id).n, 0);
  assert.equal(xp(s, a.id, 'react', `${b.id}:r1`).gone, 1);
  assert.equal(xp(s, b.id, 'got_react', `${a.id}:r1`).gone, 1);
  assert.equal(xp(s, a.id, 'comment', long.data.item.id).gone, 1);
  assert.equal(xp(s, b.id, 'got_comment', long.data.item.id).gone, 1);
  // то же у тир-листа
  s.env.DB.raw.prepare('INSERT INTO tierlists (user_id, id, data, meta, private, at) VALUES (?, ?, ?, ?, 0, ?)').run(b.id, 't1', '{"items":{}}', '{}', 1);
  await s.call('PUT', `/react/${b.id}/t.t1`, { token: a.token, body: { emoji: 'lol' } });
  const tc = await s.call('POST', `/comments/${b.id}/t.t1`, { token: a.token, body: { text: 'Спорный тир-лист, но годный' } });
  assert.equal(xp(s, a.id, 'react', `${b.id}:t.t1`).gone, 0);
  assert.equal((await s.call('DELETE', '/tierlist/t1', { token: b.token })).status, 200);
  assert.equal(xp(s, a.id, 'react', `${b.id}:t.t1`).gone, 1);
  assert.equal(xp(s, b.id, 'got_react', `${a.id}:t.t1`).gone, 1);
  assert.equal(xp(s, a.id, 'comment', tc.data.item.id).gone, 1);
  assert.equal(xp(s, b.id, 'got_comment', tc.data.item.id).gone, 1);
});

test('«только я»: картинку по ссылке на отзыв и фото оценки другу не отдаём', async () => {
  const s = await site();
  const a = await s.join('viewer'), b = await s.join('owner2');
  await s.friends(a, b);
  const t0 = Date.now() - 60e3;
  await s.shelf(b, [{ id: 'r1', name: 'С фото', photo: { remote: true }, updatedAt: iso(t0) }]);
  assert.equal((await s.call('PUT', '/photo/r1', { token: b.token, body: { data: PNG } })).status, 200);
  const sid = (await s.call('POST', '/share', { token: b.token, body: { rid: 'r1' } })).data.id;
  assert.match(sid, /^[A-Za-z0-9]{12}$/);
  let img = await s.call('GET', `/share/${sid}/img`);
  assert.deepEqual([img.status, img.res.headers.get('content-type')], [200, 'image/png']);
  assert.equal((await s.call('GET', `/photo/${b.id}/r1`, { token: a.token })).data.data, PNG);
  // оценку сделали «только я»
  await s.shelf(b, [{ id: 'r1', name: 'С фото', photo: { remote: true }, vis: 'private', updatedAt: iso(t0 + 1000) }]);
  img = await s.call('GET', `/share/${sid}/img`);
  assert.equal(img.status, 404, 'по ссылке картинки больше нет');
  assert.deepEqual((await s.call('GET', `/photo/${b.id}/r1`, { token: a.token })).data, { data: null }, 'другу — как будто фото нет');
  assert.deepEqual((await s.call('GET', `/photo/${b.id}/r1?thumb=1`, { token: a.token })).data, { data: null });
  assert.deepEqual((await s.call('GET', `/photo/${b.id}/r1?meta=1`, { token: a.token })).data, { updatedAt: null });
  assert.equal((await s.call('GET', `/photo/${b.id}/r1`, { token: b.token })).data.data, PNG, 'хозяин своё видит');
  assert.equal((await s.call('GET', `/photo/${b.id}/avatar`, { token: a.token })).status, 200);
  // полка, записанная до колонки priv: список «только я» считается из самих оценок и запоминается
  s.env.DB.raw.prepare('UPDATE shelves SET priv = NULL WHERE user_id = ?').run(b.id);
  assert.deepEqual((await s.call('GET', `/photo/${b.id}/r1`, { token: a.token })).data, { data: null });
  assert.deepEqual(JSON.parse(s.one('SELECT priv FROM shelves WHERE user_id = ?', b.id).priv), ['r1']);
  s.env.DB.raw.prepare('UPDATE shelves SET priv = NULL, data = ? WHERE user_id = ?').run(JSON.stringify([{ id: 'old' }]), b.id);
  await s.call('GET', `/photo/${b.id}/r1`, { token: a.token });
  assert.equal(s.one('SELECT priv FROM shelves WHERE user_id = ?', b.id).priv, '[]', 'полка старого вида (просто список) — «только я» нет');
  // тир-лист по ссылке: скрыли — картинок по ссылке нет
  s.env.DB.raw.prepare('INSERT INTO tierlists (user_id, id, data, meta, private, at) VALUES (?, ?, ?, ?, 0, ?)').run(b.id, 't1', JSON.stringify({ items: { x: { id: 'x', kind: 'img', img: 'ti_x' } } }), '{}', 1);
  s.env.DB.raw.prepare('INSERT INTO photos (key, user_id, data, updated_at) VALUES (?, ?, ?, 1)').run(`${b.id}:ti_x`, b.id, PNG);
  const tid = (await s.call('POST', '/tierlist-share', { token: b.token, body: { id: 't1' } })).data.id;
  assert.equal((await s.call('GET', `/share/${tid}/img?k=ti_x`)).status, 200);
  s.env.DB.raw.prepare('UPDATE tierlists SET private = 1 WHERE user_id = ? AND id = ?').run(b.id, 't1');
  assert.equal((await s.call('GET', `/share/${tid}/img?k=ti_x`)).status, 404);
});

// ---------- удаление аккаунта ----------
const ROOT = fileURLToPath(new URL('..', import.meta.url));
// все таблицы, что создаёт код сайта (functions/ и rt/), — как они написаны в исходниках: «CREATE TABLE IF NOT EXISTS …»,
// склейки строк «' + '» и \' внутри строки — как в JS
function sourceTables() {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.m?js$/.test(f)) files.push(p); } };
  walk(join(ROOT, 'functions')); walk(join(ROOT, 'rt'));
  const out = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const re = /(['"`])CREATE TABLE IF NOT EXISTS (\w+) \(/g;
    let m;
    while ((m = re.exec(src))) {
      const quote = m[1];
      let i = re.lastIndex, depth = 1, body = '';
      while (i < src.length && depth > 0) {
        if (src.startsWith('\\' + quote, i)) { body += quote; i += 2; continue; }
        if (src[i] === quote) {
          const more = /^\s*\+\s*(['"`])/.exec(src.slice(i + 1, i + 200));
          if (!more) break;
          i += 1 + more[0].length;
          continue;
        }
        if (src[i] === '(') depth++;
        if (src[i] === ')') depth--;
        if (depth > 0) body += src[i];
        i++;
      }
      out.set(m[2], `CREATE TABLE IF NOT EXISTS ${m[2]} (${body})`);
    }
  }
  return out;
}
// колонки с id человека; остаются после удаления: журнал админки (кто из админов что сделал)
const USER_COLS = ['user_id', 'owner_id', 'from_id', 'to_id', 'a', 'b'];
const KEEP = new Set(['admin_log.user_id']);

test('удаление аккаунта: стираются его строки во всех таблицах, что создаёт код, и всё в его сборах, турнирах и комнатах', async () => {
  const s = await site({ LEVELS: '1' });
  const x = await s.join('leaver'), y = await s.join('stayer');
  const tables = sourceTables();
  assert.ok(tables.size >= 50, 'нашлись таблицы из исходников: ' + tables.size);
  for (const sql of tables.values()) s.env.DB.raw.exec(sql);
  const have = s.q("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name);
  for (const t of tables.keys()) assert.ok(have.includes(t), 'таблица создана: ' + t);
  // строка с нужным значением в колонке, остальное — что угодно, лишь бы вставилось
  let k = 0;
  const cols = (t) => s.q(`PRAGMA table_info(${t})`);
  const put = (t, set) => {
    const row = {};
    for (const c of cols(t)) {
      if (c.name in set) row[c.name] = set[c.name];
      else if (c.pk || (c.notnull && c.dflt_value == null)) row[c.name] = /INT/i.test(c.type) ? 1e6 + ++k : 'v' + ++k;
    }
    const names = Object.keys(row);
    s.env.DB.raw.prepare(`INSERT OR IGNORE INTO ${t} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`).run(...names.map((c) => row[c]));
  };
  const skip = new Set(['users', 'admins']); // админа так не удалить; users — сами аккаунты
  for (const t of have) {
    if (skip.has(t)) continue;
    for (const c of cols(t)) if (USER_COLS.includes(c.name)) { put(t, { [c.name]: x.id }); put(t, { [c.name]: y.id }); }
  }
  // его сборы, турнир и комната «Тир-лист вместе» — в них чужие лоты, голоса, прогнозы, бинго и чат
  put('lot_rooms', { id: 'xlots', owner_id: x.id }); put('king_rooms', { id: 'xking', owner_id: x.id }); put('tier_rooms', { id: 'xtier', owner_id: x.id });
  const roomOf = (t) => (t.startsWith('king_') ? 'xking' : t.startsWith('tier_') ? 'xtier' : 'xlots');
  for (const t of have) if (cols(t).some((c) => c.name === 'room_id')) put(t, { room_id: roomOf(t), ...(cols(t).some((c) => c.name === 'user_id') ? { user_id: y.id } : {}) });
  put('chat_msgs', { scope: 'lots', room: 'xlots', user_id: y.id }); put('chat_msgs', { scope: 'king', room: 'xking', user_id: y.id });
  // лимиты попыток по его id; приглашение: его пригласил y — строка его, он пригласил y — строка y
  for (const key of ['acc:', 'login-acc:', 'code-acc:', 'photo:']) put('attempts', { key: key + x.id });
  put('attempts', { key: `login-acc:${x.id}:203.0.113.7` }); put('attempts', { key: 'acc:' + y.id });
  s.env.DB.raw.exec('DELETE FROM invited');
  put('invited', { user_id: x.id, by_id: y.id }); put('invited', { user_id: y.id, by_id: x.id });
  put('xp_log', { user_id: y.id, kind: 'friend', ref: x.id, peer: x.id });

  const bad = await s.call('POST', '/account/delete', { token: x.token, body: { password: x.pass, confirm: 'не он' } });
  assert.equal(bad.status, 400);
  const r = await s.call('POST', '/account/delete', { token: x.token, body: { password: x.pass, confirm: '@leaver' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  for (const t of have) {
    for (const c of cols(t)) {
      if (!USER_COLS.includes(c.name) && !(t === 'users' && c.name === 'id')) continue;
      const left = s.one(`SELECT COUNT(*) AS n FROM ${t} WHERE ${c.name} = ?`, x.id).n;
      if (KEEP.has(`${t}.${c.name}`)) assert.ok(left > 0, `${t}.${c.name} остаётся`);
      else assert.equal(left, 0, `${t}.${c.name}: строк удалённого не осталось`);
    }
    if (cols(t).some((c) => c.name === 'room_id')) assert.equal(s.one(`SELECT COUNT(*) AS n FROM ${t} WHERE room_id IN ('xlots', 'xking', 'xtier')`).n, 0, `${t}: его комнаты целиком`);
  }
  assert.equal(s.one("SELECT COUNT(*) AS n FROM chat_msgs WHERE room IN ('xlots', 'xking')").n, 0, 'чаты его сбора и турнира');
  assert.equal(s.one("SELECT COUNT(*) AS n FROM attempts WHERE key LIKE '%' || ? || '%'", x.id).n, 0, 'его лимиты попыток');
  // чужое на месте: строки y, приглашённый им y, опыт y «за друга»
  assert.equal(s.one("SELECT COUNT(*) AS n FROM attempts WHERE key = 'acc:' || ?", y.id).n, 1);
  assert.equal(s.one('SELECT COUNT(*) AS n FROM invited WHERE user_id = ?', y.id).n, 1);
  assert.equal(s.one("SELECT COUNT(*) AS n FROM xp_log WHERE user_id = ? AND kind = 'friend'", y.id).n, 1);
  for (const t of ['shelves', 'photos', 'shop_owned', 'user_level', 'tg_links', 'mail_prefs', 'recs']) assert.equal(s.one(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`, y.id).n, 1, t + ' у второго аккаунта');
  assert.equal((await s.call('GET', '/me', { token: x.token })).status, 401, 'сеансов удалённого нет');
});

test('удаление аккаунта: таблиц режимов, уровней и писем ещё нет — удаление всё равно проходит', async () => {
  const s = await site();
  const x = await s.join('early');
  const r = await s.call('POST', '/account/delete', { token: x.token, body: { password: x.pass, confirm: 'early' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(s.one('SELECT COUNT(*) AS n FROM users WHERE id = ?', x.id).n, 0);
  assert.equal(s.one("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'xp_log'").n, 0, 'лишних таблиц удаление не заводит');
});
