// Казуал Хаб: онлайн-аккаунты, друзья и оценки друзей.
// Cloudflare Pages Functions, база D1 подключена как binding DB (см. schema.sql и README).

const enc = new TextEncoder();
const ITER = 10000; // PBKDF2: больше не даёт бесплатный тариф по времени CPU
const SESSION_DAYS = 30;
const MAX_SHELF = 800000; // байт JSON на одного человека
const NAME_RE = /^[\p{L}\p{N}_.\- ]{2,24}$/u;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, error) => json({ error }, status);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');

async function hashPass(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256);
  return hex(bits);
}
function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function readBody(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

async function currentUser(env, request) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  return env.DB.prepare(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
  ).bind(await sha256(m[1]), Date.now()).first();
}
async function newSession(env, userId) {
  const token = randHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 864e5).run();
  return token;
}
async function link(env, x, y) {
  const [a, b] = pair(x, y);
  return env.DB.prepare('SELECT status, requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
}

const routes = {
  async 'POST /register'({ env, request }) {
    const { username, password } = await readBody(request);
    const name = cleanName(username);
    const pass = String(password || '');
    if (!NAME_RE.test(name)) return fail(400, 'Ник: от 2 до 24 символов, буквы, цифры, пробел, точка, дефис или подчёркивание.');
    if (pass.length < 6 || pass.length > 200) return fail(400, 'Пароль: от 6 символов.');
    const uname = name.toLowerCase();
    if (await env.DB.prepare('SELECT 1 FROM users WHERE uname = ?').bind(uname).first()) return fail(409, 'Такой ник уже занят.');
    const id = randHex(12);
    const salt = randHex(16);
    await env.DB.prepare('INSERT INTO users (id, username, uname, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, name, uname, await hashPass(pass, salt), salt, Date.now()).run();
    return json({ token: await newSession(env, id), user: { id, username: name } });
  },

  async 'POST /login'({ env, request }) {
    const { username, password } = await readBody(request);
    const u = await env.DB.prepare('SELECT id, username, pass_hash, salt FROM users WHERE uname = ?')
      .bind(cleanName(username).toLowerCase()).first();
    if (!u || !sameHex(await hashPass(String(password || ''), u.salt), u.pass_hash)) return fail(401, 'Неверный ник или пароль.');
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(u.id, Date.now()).run();
    return json({ token: await newSession(env, u.id), user: { id: u.id, username: u.username } });
  },

  async 'POST /logout'({ env, request }) {
    const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
    return json({ ok: true });
  },

  async 'GET /me'({ me }) {
    return json({ user: me });
  },

  async 'GET /friends'({ env, me }) {
    const { results } = await env.DB.prepare(
      `SELECT f.status, f.requested_by, u.id, u.username, s.updated_at
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
         LEFT JOIN shelves s ON s.user_id = u.id
        WHERE f.a = ?1 OR f.b = ?1
        ORDER BY u.uname`
    ).bind(me.id).all();
    const pick = (r) => ({ id: r.id, username: r.username, updatedAt: r.updated_at || null });
    return json({
      friends: results.filter((r) => r.status === 'accepted').map(pick),
      incoming: results.filter((r) => r.status === 'pending' && r.requested_by !== me.id).map(pick),
      outgoing: results.filter((r) => r.status === 'pending' && r.requested_by === me.id).map(pick),
    });
  },

  async 'POST /friends/request'({ env, request, me }) {
    const { username } = await readBody(request);
    const other = await env.DB.prepare('SELECT id, username FROM users WHERE uname = ?').bind(cleanName(username).toLowerCase()).first();
    if (!other) return fail(404, 'Нет пользователя с таким ником.');
    if (other.id === me.id) return fail(400, 'Себя в друзья добавить нельзя.');
    const row = await link(env, me.id, other.id);
    const [a, b] = pair(me.id, other.id);
    if (row) {
      if (row.status === 'accepted') return fail(409, `Вы с ${other.username} уже друзья.`);
      if (row.requested_by === me.id) return fail(409, 'Заявка уже отправлена.');
      // встречная заявка: просто принимаем
      await env.DB.prepare("UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?").bind(a, b).run();
      return json({ status: 'accepted', user: other });
    }
    await env.DB.prepare("INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, 'pending', ?, ?)")
      .bind(a, b, me.id, Date.now()).run();
    return json({ status: 'pending', user: other });
  },

  async 'POST /friends/accept'({ env, request, me }) {
    const { userId } = await readBody(request);
    const row = await link(env, me.id, String(userId || ''));
    if (!row || row.status !== 'pending' || row.requested_by === me.id) return fail(404, 'Заявка не найдена.');
    const [a, b] = pair(me.id, String(userId));
    await env.DB.prepare("UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?").bind(a, b).run();
    return json({ ok: true });
  },

  // убрать из друзей, отклонить входящую или отменить свою заявку
  async 'POST /friends/remove'({ env, request, me }) {
    const { userId } = await readBody(request);
    const [a, b] = pair(me.id, String(userId || ''));
    await env.DB.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').bind(a, b).run();
    return json({ ok: true });
  },

  async 'PUT /shelf'({ env, request, me }) {
    const { ratings } = await readBody(request);
    if (!Array.isArray(ratings)) return fail(400, 'Нужен список оценок.');
    const data = JSON.stringify(ratings);
    if (data.length > MAX_SHELF) return fail(413, 'Слишком много данных, убери длинные заметки.');
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(me.id, data, now).run();
    return json({ ok: true, updatedAt: now, count: ratings.length });
  },

  async 'GET /shelf/:id'({ env, me, arg }) {
    if (arg !== me.id) {
      const row = await link(env, me.id, arg);
      if (!row || row.status !== 'accepted') return fail(403, 'Оценки видны только друзьям.');
    }
    const user = await env.DB.prepare('SELECT id, username FROM users WHERE id = ?').bind(arg).first();
    if (!user) return fail(404, 'Пользователь не найден.');
    const shelf = await env.DB.prepare('SELECT data, updated_at FROM shelves WHERE user_id = ?').bind(arg).first();
    return json({ user, ratings: shelf ? JSON.parse(shelf.data) : [], updatedAt: shelf ? shelf.updated_at : null });
  },
};

const PUBLIC = new Set(['POST /register', 'POST /login', 'POST /logout']);

export async function onRequest({ request, env, params }) {
  const segs = [].concat(params.path || []);
  const path = '/' + segs.join('/');
  if (path === '/health') return json({ ok: !!env.DB });
  if (!env.DB) return fail(503, 'Сервер друзей ещё не подключён: нет базы данных.');

  let key = `${request.method} ${path}`;
  let arg = null;
  if (!routes[key] && segs.length === 2 && segs[0] === 'shelf') { key = `${request.method} /shelf/:id`; arg = segs[1]; }
  const handler = routes[key];
  if (!handler) return fail(404, 'Нет такого адреса.');

  try {
    let me = null;
    if (!PUBLIC.has(key)) {
      me = await currentUser(env, request);
      if (!me) return fail(401, 'Нужно войти в онлайн-аккаунт.');
    }
    return await handler({ env, request, me, arg });
  } catch (e) {
    console.error(e);
    return fail(500, 'Ошибка сервера, попробуй ещё раз.');
  }
}
