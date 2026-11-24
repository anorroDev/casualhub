// Уведомления в Telegram: привязка по коду, вебхук с секретом, что и как часто присылать, язык, /stop.
// Telegram подменён: fetch записывает вызовы. node --test tests/tg.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { makeTgRoutes, tgNotify, tgOn, TG_KINDS } from '../functions/_lib/tg.js';

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
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT);
    CREATE TABLE mail_prefs (user_id TEXT PRIMARY KEY, news INTEGER, lang TEXT, lang_pick TEXT);`);
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) { db.exec('BEGIN'); try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
const TG = { TG_TOKEN: '123:abc', TG_BOT: 'casualhub_test_bot', TG_SECRET: 's3cret' };
function setup(extra = TG) {
  const env = { DB: fakeD1(), ...extra };
  env.DB.raw.exec("INSERT INTO users (id, username, uname) VALUES ('u1', 'Аня', 'anya'), ('u2', 'Боря', 'borya')");
  const sent = [];
  let reply = () => ({ ok: true, result: {} });
  globalThis.fetch = async (url, init) => {
    const m = /^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/.exec(String(url));
    assert.ok(m, 'только Telegram: ' + url);
    const body = JSON.parse(init.body);
    sent.push({ token: m[1], method: m[2], body });
    const r = reply(m[2], body);
    return new Response(JSON.stringify(r), { status: r.ok ? 200 : r.error_code || 400, headers: { 'content-type': 'application/json' } });
  };
  const routes = makeTgRoutes({
    json: (o, status) => (status ? { ...o, status } : o), fail: (status, error) => ({ status, error }), readBody: async (req) => (req && req.body) || {},
    publicRoutes: new Set(), adminActive: async () => true,
  });
  const hook = (body, secret = TG.TG_SECRET) => routes['POST /tg/hook']({ env, request: { url: 'https://casualhub.test/api/tg/hook', headers: new Headers(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}), body } });
  return { env, routes, sent, hook, setReply: (f) => { reply = f; } };
}
const req = { url: 'https://casualhub.test/api/tg/link', headers: new Headers() };
const msg = (chat, text) => ({ update_id: 1, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text } });

test('без токена всё выключено', async () => {
  const { env, routes } = setup({});
  assert.equal(tgOn(env), false);
  assert.deepEqual(await routes['GET /tg/me']({ env, me: { id: 'u1' } }), { on: false });
  assert.equal((await routes['POST /tg/link']({ env, request: req, me: { id: 'u1' } })).status, 503);
  assert.equal(await tgNotify(env, 'u1', 'react', { from: { username: 'Боря' }, emoji: '🔥' }, 'https://casualhub.test'), false);
});

test('привязка: код из Настроек → /start в боте; чужой секрет и старый код не проходят; /stop отвязывает', async () => {
  const { env, routes, sent, hook } = setup();
  const me = { id: 'u1' };
  const l = await routes['POST /tg/link']({ env, request: req, me });
  const code = new URL(l.url).searchParams.get('start');
  assert.equal(new URL(l.url).origin + new URL(l.url).pathname, 'https://t.me/casualhub_test_bot');
  assert.match(code, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal((await hook(msg(555, '/start ' + code), 'wrong')).status, 403, 'вебхук без нашего секрета — мимо');
  assert.equal((await hook(msg(555, '/start ' + code), null)).status, 403);
  await hook(msg(555, '/start ' + code));
  const st = await routes['GET /tg/me']({ env, me });
  assert.deepEqual({ on: st.on, bot: st.bot, linked: st.linked }, { on: true, bot: 'casualhub_test_bot', linked: true });
  assert.deepEqual(st.prefs, Object.fromEntries(TG_KINDS.map((k) => [k, true])), 'по умолчанию — всё включено');
  const ok = sent.find((s) => s.method === 'sendMessage' && String(s.body.chat_id) === '555');
  assert.match(ok.body.text, /Аня/);
  // код одноразовый
  await hook(msg(777, '/start ' + code));
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM tg_links WHERE chat_id = '777'").get().n, 0);
  assert.match(sent.at(-1).body.text, /устарела/);
  // /stop — отвязать
  await hook(msg(555, '/stop'));
  assert.equal((await routes['GET /tg/me']({ env, me })).linked, false);
});

test('уведомления: по переключателям, не чаще раза в минуту на вид, на языке человека, заблокировал бота — отвязка', async () => {
  const { env, routes, sent, hook, setReply } = setup();
  const me = { id: 'u1' };
  const code = new URL((await routes['POST /tg/link']({ env, request: req, me })).url).searchParams.get('start');
  await hook(msg(555, '/start ' + code));
  const n0 = sent.length;
  const T = Date.UTC(2026, 11, 3, 10);
  const real = Date.now;
  try {
    Date.now = () => T;
    assert.equal(await tgNotify(env, 'u1', 'react', { from: { username: 'Боря', handle: 'borya' }, emoji: 'fire' }, 'https://casualhub.test'), true);
    assert.match(sent.at(-1).body.text, /Боря/);
    assert.match(sent.at(-1).body.text, /🔥/);
    assert.equal(sent.at(-1).body.reply_markup.inline_keyboard[0][0].url, 'https://casualhub.test/opinion/');
    Date.now = () => T + 30e3;
    assert.equal(await tgNotify(env, 'u1', 'react', { from: { username: 'Вика' }, emoji: '😂' }, 'https://casualhub.test'), false, 'та же реакция через 30 секунд — молчим');
    assert.equal(await tgNotify(env, 'u1', 'comment', { from: { username: 'Вика' }, text: 'класс' }, 'https://casualhub.test'), true, 'другой вид — можно');
    Date.now = () => T + 61e3;
    assert.equal(await tgNotify(env, 'u1', 'react', { from: { username: 'Вика' }, emoji: '😂' }, 'https://casualhub.test'), true, 'через минуту — снова можно');
    // выключил реакции — не шлём
    await routes['PUT /tg/prefs']({ env, request: { body: { react: false } }, me });
    Date.now = () => T + 200e3;
    assert.equal(await tgNotify(env, 'u1', 'react', { from: { username: 'Вика' }, emoji: '😂' }, 'https://casualhub.test'), false);
    assert.equal(await tgNotify(env, 'u2', 'friend', { t: 'request', from: { username: 'Аня' } }, 'https://casualhub.test'), false, 'без привязки — некуда');
    // язык — как у писем: выбранный в Настройках важнее языка сайта
    env.DB.raw.exec("INSERT INTO mail_prefs (user_id, news, lang, lang_pick) VALUES ('u1', 1, 'en', 'uk')");
    Date.now = () => T + 400e3;
    await tgNotify(env, 'u1', 'friend', { t: 'request', from: { username: 'Боря' } }, 'https://casualhub.test');
    assert.match(sent.at(-1).body.text, /друзі/);
    // заблокировал бота: Telegram отвечает 403 — привязку убираем
    setReply(() => ({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }));
    Date.now = () => T + 600e3;
    assert.equal(await tgNotify(env, 'u1', 'comment', { from: { username: 'Боря' }, text: 'ау' }, 'https://casualhub.test'), false);
    assert.equal((await routes['GET /tg/me']({ env, me })).linked, false);
  } finally { Date.now = real; }
  assert.ok(sent.slice(n0).every((s) => s.token === '123:abc'));
});

test('нет связи с Telegram — вебхук всё равно отвечает «ок», а не 500 (иначе Telegram будет повторять)', async () => {
  const { env, routes, hook } = setup();
  const code = new URL((await routes['POST /tg/link']({ env, request: req, me: { id: 'u1' } })).url).searchParams.get('start');
  globalThis.fetch = async () => { throw new Error('network down'); };
  const r = await hook(msg(555, '/start ' + code));
  assert.deepEqual(r, { ok: true });
  assert.equal((await routes['GET /tg/me']({ env, me: { id: 'u1' } })).linked, true, 'привязка прошла, хоть ответ бота и не ушёл');
});

test('админ: вебхук ставится с секретом и адресом сайта', async () => {
  const { env, routes, sent } = setup();
  const r = await routes['POST /admin/tg/webhook']({ env, request: { url: 'https://casualhub.test/api/admin/tg/webhook', headers: new Headers() }, me: { id: 'a' } });
  assert.equal(r.ok, true);
  const w = sent.find((s) => s.method === 'setWebhook');
  assert.deepEqual({ url: w.body.url, secret: w.body.secret_token }, { url: 'https://casualhub.test/api/tg/hook', secret: 's3cret' });
});
