// Чат комнат (functions/_lib/chat.js): проверка текста и стикеров, адреса /chat на SQLite в памяти (тот же вид, что у D1).
// node --test tests/chat.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { CHAT, cleanText, cleanSticker, cleanMessage, digest, makeChatRoutes, chatDrop, ensureChat, CHAT_USER_SQL } from '../functions/_lib/chat.js';

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
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, email TEXT, banned INTEGER);
    CREATE TABLE lot_rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);`);
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const ROOM = 'AbCdEfGh1234', OTHER = 'ZzZzZzZz9999';
function setup(extra = {}) {
  const env = { DB: fakeD1() };
  const add = (id, banned = 0) => env.DB.raw.prepare('INSERT INTO users (id, username, uname, email, banned) VALUES (?, ?, ?, ?, ?)').run(id, 'Ник ' + id, 'h_' + id, id + '@mail.test', banned);
  add('host'); add('viewer'); add('admin'); add('bad', 1);
  env.DB.raw.prepare('INSERT INTO lot_rooms (id, owner_id) VALUES (?, ?)').run(ROOM, 'host');
  const users = Object.fromEntries(['host', 'viewer', 'admin', 'bad'].map((id) => [id, { id, username: 'Ник ' + id, handle: 'h_' + id, banned: id === 'bad' ? 1 : 0 }]));
  const pokes = [], logs = [];
  const hits = new Map(), lim = { strict: false };
  const r = makeChatRoutes({
    json: (body, status = 200) => ({ status, body }), fail: (status, error) => ({ status, body: { error } }),
    readBody: async (req) => req.body || {}, clientIp: () => 'ip', currentUser: async (e, req) => req.me || null,
    adminCandidate: (me) => !!me && me.id === 'admin', isAdmin: async (e, me) => me.id === 'admin',
    adminLog: async (e, req, me, what) => { logs.push(what); },
    // как burst в functions/api: окно с начала первого запроса
    burst: (key, max) => { if (!lim.strict) return 0; const n = (hits.get(key) || 0) + 1; hits.set(key, n); return n > max ? 1 : 0; },
    ...extra,
  });
  env.LOT_RT = { idFromName: (n) => n, get: (n) => ({ fetch: async (url, init) => { pokes.push({ room: n, url, body: JSON.parse(init.body) }); return new Response('ok'); } }) };
  const get = (q, me) => r['GET /chat']({ env, request: { url: 'https://x/api/chat?' + q, headers: new Headers(), me } });
  const post = (body, me) => r['POST /chat']({ env, request: { body }, me });
  const del = (body, me) => r['POST /chat/delete']({ env, request: { body }, me });
  return { env, r, users, pokes, logs, hits, lim, get, post, del };
}

test('текст: обрезка пробелов, без управляющих символов, до 300 знаков', () => {
  assert.deepEqual(cleanText('  привет\n\tмир  '), { text: 'привет мир' });
  assert.deepEqual(cleanText(undefined), { text: '' });
  assert.equal(cleanText('a' + String.fromCharCode(0x202e) + 'b').text, 'a b', 'подмена направления текста убирается');
  assert.equal(cleanText(String.fromCharCode(0x200b) + ' ' + String.fromCharCode(0x200b)).text, '', 'одни невидимые знаки — пустое сообщение');
  assert.equal(cleanText('я'.repeat(CHAT.TEXT)).text.length, CHAT.TEXT);
  assert.ok(cleanText('я'.repeat(CHAT.TEXT + 1)).err);
  assert.ok(cleanText({ x: 1 }).err);
});

test('стикер: только путь из каталога Колеса', () => {
  assert.deepEqual(cleanSticker('hub/roflan/roflan-001.png'), { sticker: 'hub/roflan/roflan-001.png' });
  assert.deepEqual(cleanSticker('hub/arthas-01.webm'), { sticker: 'hub/arthas-01.webm' });
  for (const bad of ['hub/../api/x.png', 'hub//x.png', '/wheel/hub/x.png', 'hub/x.svg', 'https://evil.test/x.png', 'hub/x.png?a=1', 'hub/<b>.png']) assert.ok(cleanSticker(bad).err, bad);
  assert.ok(cleanMessage({}).err, 'нужен текст или стикер');
  assert.deepEqual(cleanMessage({ sticker: 'hub/papich.gif' }), { text: '', sticker: 'hub/papich.gif' });
  assert.deepEqual(cleanMessage({ text: ' гг ', sticker: 'hub/papich.gif' }), { text: 'гг', sticker: 'hub/papich.gif' });
});

test('курсор идёт и за пропущенные строки: удалённые аккаунты, заблокированные, отметки об удалении', () => {
  const d = digest([
    { id: 5, user_id: 'a', uid: 'a', text: 'hi', sticker: '', at: 1, username: 'A', uname: 'a' },
    { id: 6, user_id: 'x', uid: null, text: 'ушёл', sticker: '', at: 2 },
    { id: 7, user_id: 'b', uid: 'b', banned: 1, text: 'спам', sticker: '', at: 3 },
    { id: 8, user_id: '', uid: null, del: 5, text: '', sticker: '', at: 4 },
  ], 4);
  assert.deepEqual(d.msgs.map((m) => m.id), [5]);
  assert.deepEqual(d.del, [5]);
  assert.equal(d.last, 8);
  assert.deepEqual(d.msgs[0].u, { id: 'a', name: 'A', handle: 'a' });
});

test('написать, прочитать, опрос «что нового», рассылка комнате вживую', async () => {
  const t = setup();
  const a = await t.post({ s: 'lots', r: ROOM, text: 'всем привет' }, t.users.viewer);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.m.text, 'всем привет');
  assert.equal(a.body.m.u.name, 'Ник viewer');
  assert.equal(JSON.stringify(a.body).includes('@mail.test'), false, 'почта не уходит');
  assert.deepEqual(t.pokes.at(-1), { room: `chat:lots:${ROOM}`, url: 'https://rt/chat', body: { t: 'chat', m: a.body.m } });
  const g = await t.get(`s=lots&r=${ROOM}`, t.users.host);
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.msgs.map((m) => m.text), ['всем привет']);
  assert.equal(g.body.last, a.body.m.id);
  assert.equal(g.body.mod, true, 'хозяин сбора может удалять чужие');
  assert.equal(g.body.rt, true);
  assert.deepEqual(g.body.you, { id: 'host', name: 'Ник host', handle: 'h_host' });
  const guest = await t.get(`s=lots&r=${ROOM}`, null);
  assert.equal(guest.body.you, null, 'гость читает, но не пишет');
  assert.equal(guest.body.mod, false);
  const idle = await t.get(`s=lots&r=${ROOM}&after=${g.body.last}`);
  assert.deepEqual(idle.body, { msgs: [], del: [], last: g.body.last });
  const s = await t.post({ s: 'lots', r: ROOM, sticker: 'hub/papich.gif' }, t.users.host);
  const news = await t.get(`s=lots&r=${ROOM}&after=${g.body.last}`);
  assert.deepEqual(news.body.msgs.map((m) => m.sticker), ['hub/papich.gif']);
  assert.equal(news.body.last, s.body.m.id);
});

test('комнаты нет — 404; турнира нет, пока нет и таблицы king_rooms', async () => {
  const t = setup();
  assert.equal((await t.post({ s: 'lots', r: OTHER, text: 'эй' }, t.users.viewer)).status, 404);
  assert.equal((await t.get(`s=lots&r=${OTHER}`)).status, 404);
  assert.equal((await t.post({ s: 'king', r: ROOM, text: 'эй' }, t.users.viewer)).status, 404);
  assert.equal((await t.get(`s=king&r=${ROOM}`)).status, 404);
  assert.equal((await t.get('s=nope&r=' + ROOM)).status, 404);
  assert.equal((await t.post({ s: 'lots', r: 'short', text: 'эй' }, t.users.viewer)).status, 404);
  t.env.DB.raw.exec("CREATE TABLE king_rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL); INSERT INTO king_rooms VALUES ('KiNg00000001', 'host')");
  const k = await t.post({ s: 'king', r: 'KiNg00000001', text: 'за царя' }, t.users.viewer);
  assert.equal(k.status, 200);
  assert.deepEqual((await t.get('s=king&r=KiNg00000001')).body.msgs.map((m) => m.text), ['за царя']);
  assert.deepEqual((await t.get(`s=lots&r=${ROOM}`)).body.msgs, [], 'чаты комнат не смешиваются');
  // сбор заблокированного ведущего не виден — и его чат тоже
  t.env.DB.raw.prepare('INSERT INTO lot_rooms (id, owner_id) VALUES (?, ?)').run(OTHER, 'bad');
  assert.equal((await t.get(`s=lots&r=${OTHER}`)).status, 404);
  assert.equal((await t.post({ s: 'lots', r: OTHER, text: 'эй' }, t.users.viewer)).status, 404);
});

test('удалить: автор, хозяин и админ; остальные — нет. Удаление видно и по опросу', async () => {
  const t = setup();
  const m1 = (await t.post({ s: 'lots', r: ROOM, text: 'раз' }, t.users.viewer)).body.m;
  t.hits.clear();
  const m2 = (await t.post({ s: 'lots', r: ROOM, text: 'два' }, t.users.host)).body.m;
  t.hits.clear();
  const m3 = (await t.post({ s: 'lots', r: ROOM, text: 'три' }, t.users.host)).body.m;
  const before = (await t.get(`s=lots&r=${ROOM}`)).body.last;
  assert.equal((await t.del({ s: 'lots', r: ROOM, id: m2.id }, t.users.viewer)).status, 403, 'зритель чужое не удаляет');
  assert.equal((await t.del({ s: 'lots', r: ROOM, id: m1.id }, t.users.viewer)).status, 200, 'своё — можно');
  assert.equal((await t.del({ s: 'lots', r: ROOM, id: m2.id }, t.users.admin)).status, 200, 'админ — любое');
  assert.equal(t.logs.length, 1, 'удаление админом — в журнал');
  assert.equal((await t.del({ s: 'lots', r: ROOM, id: m3.id }, t.users.host)).status, 200, 'хозяин — любое в своём сборе');
  assert.deepEqual(t.pokes.filter((p) => p.body.t === 'chatdel').map((p) => p.body.id), [m1.id, m2.id, m3.id]);
  const poll = await t.get(`s=lots&r=${ROOM}&after=${before}`);
  assert.deepEqual(poll.body.del.sort(), [m1.id, m2.id, m3.id].sort());
  assert.deepEqual(poll.body.msgs, []);
  assert.ok(poll.body.last > before, 'номера только растут: курсор ушёл за отметки');
  assert.deepEqual((await t.get(`s=lots&r=${ROOM}`)).body.msgs, []);
  // новое сообщение после удаления последнего не получает его номер
  t.hits.clear();
  const m4 = (await t.post({ s: 'lots', r: ROOM, text: 'четыре' }, t.users.viewer)).body.m;
  assert.ok(m4.id > poll.body.last);
  assert.equal((await t.del({ s: 'lots', r: ROOM, id: m1.id }, t.users.viewer)).body.gone, true, 'второй раз — уже удалено');
});

test('заблокированного не видно; лимит частоты; пустое и длинное — 400', async () => {
  const t = setup();
  // блокировку ставят уже после сообщения: оно пропадает из чата
  await t.post({ s: 'lots', r: ROOM, text: 'реклама' }, { ...t.users.viewer, id: 'admin' });
  t.env.DB.raw.prepare('UPDATE users SET banned = 1 WHERE id = ?').run('admin');
  const g = await t.get(`s=lots&r=${ROOM}`);
  assert.deepEqual(g.body.msgs, []);
  assert.ok(g.body.last > 0, 'курсор всё равно за ним');
  t.lim.strict = true;
  assert.equal((await t.post({ s: 'lots', r: ROOM, text: 'раз' }, t.users.viewer)).status, 200);
  assert.equal((await t.post({ s: 'lots', r: ROOM, text: 'два' }, t.users.viewer)).status, 429, 'не чаще раза в 1,2 секунды');
  t.hits.clear();
  assert.equal((await t.post({ s: 'lots', r: ROOM, text: '   ' }, t.users.viewer)).status, 400);
  t.hits.clear();
  assert.equal((await t.post({ s: 'lots', r: ROOM, text: 'я'.repeat(301) }, t.users.viewer)).status, 400);
  t.hits.clear();
  assert.equal((await t.post({ s: 'lots', r: ROOM, sticker: 'hub/../x.png' }, t.users.viewer)).status, 400);
});

test('удаление сбора и аккаунта уносит чат', async () => {
  const t = setup();
  await t.post({ s: 'lots', r: ROOM, text: 'раз' }, t.users.viewer);
  t.hits.clear();
  await t.post({ s: 'lots', r: ROOM, text: 'два' }, t.users.host);
  await ensureChat(t.env);
  await t.env.DB.batch([chatDrop(t.env, 'lots', ROOM)]);
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM chat_msgs').get().n, 0);
  t.hits.clear();
  await t.post({ s: 'lots', r: ROOM, text: 'три' }, t.users.viewer);
  t.hits.clear();
  await t.post({ s: 'lots', r: ROOM, text: 'четыре' }, t.users.host);
  await t.env.DB.batch([t.env.DB.prepare(CHAT_USER_SQL).bind('viewer')]);
  assert.deepEqual((await t.get(`s=lots&r=${ROOM}`)).body.msgs.map((m) => m.text), ['четыре']);
  await t.env.DB.batch([t.env.DB.prepare(CHAT_USER_SQL).bind('host')]);
  assert.equal(t.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM chat_msgs').get().n, 0, 'чат сбора хозяина уходит вместе с ним');
});
