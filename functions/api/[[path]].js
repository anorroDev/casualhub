// Казуал Хаб: онлайн-аккаунты, друзья и оценки друзей.
// Cloudflare Pages Functions, база D1 подключена как binding DB (см. schema.sql и README).

const enc = new TextEncoder();
const ITER = 10000; // PBKDF2: больше не даёт бесплатный тариф по времени CPU
const SESSION_DAYS = 30;
const MAX_SHELF = 1800000; // символов JSON на одного человека (фото хранятся отдельно)
const NAME_RE = /^[\p{L}\p{N}_.\- ]{2,24}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Таблицы создаются и обновляются сами при первом запросе (то же, что в schema.sql),
// чтобы новые поля вроде email не требовали ручной миграции.
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL, uname TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL, email TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS friendships (a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (a, b))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS friendships_b ON friendships(b)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shelves (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS photos (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS reactions (owner_id TEXT NOT NULL, rid TEXT NOT NULL, from_id TEXT NOT NULL, emoji TEXT, text TEXT, at INTEGER NOT NULL, PRIMARY KEY (owner_id, rid, from_id))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS reactions_from ON reactions(from_id)'),
  ]);
  const { results } = await env.DB.prepare('PRAGMA table_info(users)').all();
  if (!results.some((c) => c.name === 'email')) await env.DB.prepare('ALTER TABLE users ADD COLUMN email TEXT').run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email)').run();
  schemaReady = true;
}
const cleanEmail = (s) => String(s || '').trim().toLowerCase();

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
// ---------- защита от перебора: счётчики попыток в окне времени ----------
const LIMITS = {
  loginIp: { max: 30, win: 15 * 60e3 },   // неудачных входов с одного адреса
  loginAcc: { max: 10, win: 15 * 60e3 },  // неудачных входов в один аккаунт
  register: { max: 10, win: 60 * 60e3 },  // регистраций (и попыток на занятые почту/ник) с одного адреса
  friendReq: { max: 40, win: 10 * 60e3 }, // заявок в друзья (перебор ников)
  react: { max: 120, win: 10 * 60e3 },    // реакций и комментариев
};
const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';
async function overLimit(env, key, kind) {
  const row = await env.DB.prepare('SELECT count, reset_at FROM attempts WHERE key = ?').bind(key).first();
  if (!row || row.reset_at <= Date.now() || row.count < LIMITS[kind].max) return 0;
  return Math.max(1, Math.ceil((row.reset_at - Date.now()) / 60e3));
}
async function hit(env, key, kind) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO attempts (key, count, reset_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET ' +
    'count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END, reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END'
  ).bind(key, now + LIMITS[kind].win, now).run();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM attempts WHERE reset_at <= ?').bind(now).run();
}
const tooMany = (min) => new Response(JSON.stringify({ error: `Слишком много попыток. Подожди ${min} мин. и попробуй снова.` }), {
  status: 429,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(min * 60) },
});

async function link(env, x, y) {
  const [a, b] = pair(x, y);
  return env.DB.prepare('SELECT status, requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
}

const routes = {
  async 'POST /register'({ env, request }) {
    const ipKey = 'reg:' + clientIp(request);
    const wait = await overLimit(env, ipKey, 'register');
    if (wait) return tooMany(wait);
    const { username, password, email } = await readBody(request);
    const name = cleanName(username);
    const mail = cleanEmail(email);
    const pass = String(password || '');
    if (!EMAIL_RE.test(mail) || mail.length > 120) return fail(400, 'Нужна почта, например name@mail.com.');
    if (!NAME_RE.test(name)) return fail(400, 'Ник: от 2 до 24 символов, буквы, цифры, пробел, точка, дефис или подчёркивание.');
    if (pass.length < 6 || pass.length > 200) return fail(400, 'Пароль: от 6 символов.');
    const uname = name.toLowerCase();
    // в лимит идут только настоящие регистрации и проверки занятых почт и ников, опечатки в форме не считаются
    await hit(env, ipKey, 'register');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(mail).first()) return fail(409, 'На эту почту уже есть аккаунт.');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE uname = ?').bind(uname).first()) return fail(409, 'Такой ник уже занят.');
    const id = randHex(12);
    const salt = randHex(16);
    await env.DB.prepare('INSERT INTO users (id, username, uname, pass_hash, salt, created_at, email) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, uname, await hashPass(pass, salt), salt, Date.now(), mail).run();
    return json({ token: await newSession(env, id), user: { id, username: name, email: mail } });
  },

  // вход по почте или по нику
  async 'POST /login'({ env, request }) {
    const { login, username, password } = await readBody(request);
    const ident = String(login || username || '').trim();
    const ipKey = 'login-ip:' + clientIp(request);
    const accKey = 'login-acc:' + ident.toLowerCase().slice(0, 120);
    const wait = Math.max(await overLimit(env, ipKey, 'loginIp'), await overLimit(env, accKey, 'loginAcc'));
    if (wait) return tooMany(wait);
    const u = await env.DB.prepare('SELECT id, username, email, pass_hash, salt FROM users WHERE uname = ? OR email = ?')
      .bind(cleanName(ident).toLowerCase(), cleanEmail(ident)).first();
    if (!u || !sameHex(await hashPass(String(password || ''), u.salt), u.pass_hash)) {
      await hit(env, ipKey, 'loginIp');
      await hit(env, accKey, 'loginAcc');
      return fail(401, 'Неверная почта, ник или пароль.');
    }
    await env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(accKey).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(u.id, Date.now()).run();
    return json({ token: await newSession(env, u.id), user: { id: u.id, username: u.username, email: u.email || '' } });
  },

  async 'POST /logout'({ env, request }) {
    const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
    return json({ ok: true });
  },

  async 'GET /me'({ me }) {
    return json({ user: me });
  },

  // смена ника и/или пароля из профиля на сайте
  async 'PUT /account'({ env, request, me }) {
    const { username, password, email } = await readBody(request);
    let name = me.username;
    if (email != null && email !== '') {
      const mail = cleanEmail(email);
      if (!EMAIL_RE.test(mail) || mail.length > 120) return fail(400, 'Нужна почта, например name@mail.com.');
      const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(mail).first();
      if (taken && taken.id !== me.id) return fail(409, 'На эту почту уже есть аккаунт.');
      await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(mail, me.id).run();
    }
    if (username != null && cleanName(username) !== me.username) {
      name = cleanName(username);
      if (!NAME_RE.test(name)) return fail(400, 'Ник: от 2 до 24 символов, буквы, цифры, пробел, точка, дефис или подчёркивание.');
      const taken = await env.DB.prepare('SELECT id FROM users WHERE uname = ?').bind(name.toLowerCase()).first();
      if (taken && taken.id !== me.id) return fail(409, 'Такой ник уже занят.');
      await env.DB.prepare('UPDATE users SET username = ?, uname = ? WHERE id = ?').bind(name, name.toLowerCase(), me.id).run();
    }
    if (password) {
      const pass = String(password);
      if (pass.length < 6 || pass.length > 200) return fail(400, 'Пароль: от 6 символов.');
      const salt = randHex(16);
      await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPass(pass, salt), salt, me.id).run();
    }
    return json({ user: { id: me.id, username: name } });
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
    const wait = await overLimit(env, 'freq:' + me.id, 'friendReq');
    if (wait) return tooMany(wait);
    await hit(env, 'freq:' + me.id, 'friendReq');
    const { username } = await readBody(request);
    const other = await env.DB.prepare('SELECT id, username FROM users WHERE uname = ?').bind(cleanName(username).toLowerCase()).first();
    if (!other) return fail(404, 'Такого ника нет среди подключённых к друзьям. Проверь ник; если друг зарегистрировался давно, пусть зайдёт на сайт в свой аккаунт или нажмёт «👥 Друзья» → «Подключить».');
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

  // Оценки с разных устройств объединяются: по id остаётся более свежая версия,
  // удалённые (deleted: [{id, at}]) запоминаются и больше не возвращаются, их фото стираются.
  async 'PUT /shelf'({ env, request, me }) {
    const { ratings, deleted, cats, profile } = await readBody(request);
    if (!Array.isArray(ratings)) return fail(400, 'Нужен список оценок.');
    const row = await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first();
    const old = readShelf(row);
    const del = new Map(old.deleted.map((d) => [d.id, d.at]));
    for (const d of Array.isArray(deleted) ? deleted : []) {
      if (d && typeof d.id === 'string' && Number.isFinite(+d.at)) del.set(d.id, Math.max(del.get(d.id) || 0, +d.at));
    }
    const byId = new Map();
    for (const r of [...old.ratings, ...ratings]) {
      if (!r || typeof r.id !== 'string') continue;
      const cur = byId.get(r.id);
      if (!cur || stampOf(r) >= stampOf(cur)) byId.set(r.id, r);
    }
    const merged = [...byId.values()].filter((r) => !(del.has(r.id) && stampOf(r) <= del.get(r.id)));
    // отметки об удалении старше полугода больше не нужны: все устройства давно синхронизировались
    const keepAfter = Date.now() - 183 * 864e5;
    const tomb = [...del.entries()].filter(([, at]) => at > keepAfter).map(([id, at]) => ({ id, at }));
    // категории с критериями: целый список, остаётся более свежий (at — время правки на устройстве)
    let catsOut = old.cats;
    if (cats && Array.isArray(cats.items) && Number.isFinite(+cats.at) && (!old.cats || +cats.at > +old.cats.at)) {
      catsOut = { items: cats.items.slice(0, 40), at: +cats.at };
    }
    // удалённые категории ({ id, name, at }): объединяем всегда, чтобы их не вернуло устройство со старым списком
    const catDel = new Map();
    for (const d of [...((old.cats && old.cats.deleted) || []), ...((cats && Array.isArray(cats.deleted)) ? cats.deleted : [])]) {
      if (!d || typeof d.id !== 'string' || !Number.isFinite(+d.at)) continue;
      const prev = catDel.get(d.id);
      if (!prev || +d.at > prev.at) catDel.set(d.id, { id: d.id.slice(0, 80), name: String(d.name || '').slice(0, 60), at: +d.at });
    }
    // категорию создали заново позже удаления (она есть в более свежем списке): отметка больше не нужна
    if (catsOut) for (const [id, d] of catDel) {
      if (catsOut.items.some((c) => c && (c.id === d.id || (d.name && String(c.name || '').trim().toLowerCase() === d.name.trim().toLowerCase()))) && +catsOut.at > d.at) catDel.delete(id);
    }
    if (catsOut) catsOut = { ...catsOut, deleted: [...catDel.values()].sort((a, b) => b.at - a.at).slice(0, 100) };
    // темы, скрытые из профиля: тоже остаётся более свежий выбор
    let profileOut = old.profile;
    if (profile && Array.isArray(profile.hide) && Number.isFinite(+profile.at) && (!old.profile || +profile.at > +old.profile.at)) {
      profileOut = { hide: profile.hide.filter((x) => typeof x === 'string').slice(0, 40).map((x) => x.slice(0, 60)), at: +profile.at };
    }
    const shelfData = { ratings: merged, deleted: tomb };
    if (catsOut) shelfData.cats = catsOut;
    if (profileOut) shelfData.profile = profileOut;
    const data = JSON.stringify(shelfData);
    if (data.length > MAX_SHELF) return fail(413, 'Слишком много данных, убери длинные заметки.');
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(me.id, data, now).run();
    // фото стираем только у оценок, удалённых в этот раз, а не у всех прежних
    const oldDel = new Set(old.deleted.map((d) => d.id));
    const live = new Set(merged.map((r) => r.id));
    const gone = tomb.filter((d) => !oldDel.has(d.id) && !live.has(d.id)).map((d) => d.id).slice(0, 100);
    if (gone.length) {
      // вместе с фото уходит и его превью «<id>.t»
      await env.DB.batch(gone.flatMap((id) => [`${me.id}:${id}`, `${me.id}:${id}.t`].map((k) => env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(k))));
    }
    return json({ ok: true, updatedAt: now, count: merged.length, catsAt: catsOut ? catsOut.at : null });
  },

  async 'GET /shelf/:id'({ env, me, arg }) {
    if (!(await canSee(env, me, arg))) return fail(403, 'Оценки видны только друзьям.');
    const user = await env.DB.prepare('SELECT id, username FROM users WHERE id = ?').bind(arg).first();
    if (!user) return fail(404, 'Пользователь не найден.');
    const shelf = await env.DB.prepare('SELECT data, updated_at FROM shelves WHERE user_id = ?').bind(arg).first();
    const s = readShelf(shelf);
    // свои категории видит только хозяин
    return json({ user, ratings: s.ratings, deleted: s.deleted, cats: arg === me.id ? s.cats || null : undefined, profile: s.profile || null, updatedAt: shelf ? shelf.updated_at : null });
  },

  // исполнители по имени: имя и фото, без заглушек Genius вместо фото
  async 'GET /genius/artist'({ env, request }) {
    if (!env.GENIUS_TOKEN) return fail(503, 'Genius не подключён.');
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return json({ artists: [] });
    const res = await geniusFetch(env, 'https://api.genius.com/search?q=' + encodeURIComponent(q), 86400);
    if (res.status === 401) return fail(502, 'Genius не принял токен (401): в секрете GENIUS_TOKEN нужен Client Access Token.');
    if (!res.ok) return fail(502, `Genius не ответил (${res.status}).`);
    const d = await res.json();
    const seen = new Set();
    const artists = [];
    for (const h of (d.response && d.response.hits) || []) {
      const a = h && h.result && h.result.primary_artist;
      if (!a || seen.has(a.id) || typeof a.image_url !== 'string' || /default_avatar|default_cover/.test(a.image_url)) continue;
      seen.add(a.id);
      artists.push({ name: String(a.name || '').slice(0, 80), image: a.image_url });
      if (artists.length >= 4) break;
    }
    return json({ artists });
  },
  // картинка с Genius в виде data URL: браузер не может скачать её напрямую из-за CORS
  async 'GET /genius/img'({ env, request }) {
    const u = new URL(request.url).searchParams.get('u') || '';
    if (!GENIUS_IMG.test(u)) return fail(400, 'Это не картинка Genius.');
    const res = await geniusFetch(env, u, 604800);
    const type = (res.headers.get('content-type') || '').split(';')[0];
    if (!res.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return fail(502, 'Картинка не загрузилась.');
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3e6) return fail(413, 'Картинка слишком большая.');
    return json({ data: `data:${type};base64,${b64(buf)}` });
  },
  // фото оценки: кладёт и удаляет хозяин, смотрят хозяин и друзья
  async 'PUT /photo/:rid'({ env, request, me, arg }) {
    const { data } = await readBody(request);
    if (typeof data !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(data)) return fail(400, 'Нужна картинка.');
    if (data.length > MAX_PHOTO) return fail(413, 'Фото слишком большое.');
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO photos (key, user_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(`${me.id}:${arg}`, me.id, data, now).run();
    return json({ ok: true, updatedAt: now });
  },
  async 'DELETE /photo/:rid'({ env, me, arg }) {
    await env.DB.prepare('DELETE FROM photos WHERE key = ? OR key = ?').bind(`${me.id}:${arg}`, `${me.id}:${arg}.t`).run();
    return json({ ok: true });
  },
  // ---------- реакции: друг ставит 🔥 / 💀 / «не согласен» и может оставить короткий комментарий ----------
  async 'PUT /react/:uid/:rid'({ env, request, me, arg }) {
    const [uid, rid] = arg;
    if (uid === me.id) return fail(400, 'На свои оценки реакции не ставятся.');
    if (!(await canSee(env, me, uid))) return fail(403, 'Реагировать можно только на оценки друзей.');
    const wait = await overLimit(env, 'react:' + me.id, 'react');
    if (wait) return tooMany(wait);
    await hit(env, 'react:' + me.id, 'react');
    const body = await readBody(request);
    const emoji = REACTIONS.includes(body.emoji) ? body.emoji : null;
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!emoji && !text) {
      await env.DB.prepare('DELETE FROM reactions WHERE owner_id = ? AND rid = ? AND from_id = ?').bind(uid, rid, me.id).run();
      return json({ ok: true, removed: true });
    }
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO reactions (owner_id, rid, from_id, emoji, text, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, rid, from_id) DO UPDATE SET emoji = excluded.emoji, text = excluded.text, at = excluded.at'
    ).bind(uid, rid, me.id, emoji, text || null, now).run();
    return json({ ok: true, at: now });
  },
  // все реакции на оценки человека: видят он сам и его друзья
  async 'GET /reacts/:id'({ env, me, arg }) {
    if (!(await canSee(env, me, arg))) return fail(403, 'Реакции видны только друзьям.');
    const { results } = await env.DB.prepare(
      'SELECT r.rid, r.from_id, u.username, r.emoji, r.text, r.at FROM reactions r JOIN users u ON u.id = r.from_id WHERE r.owner_id = ? ORDER BY r.at DESC LIMIT 2000'
    ).bind(arg).all();
    return json({ items: results.map((x) => ({ rid: x.rid, from: { id: x.from_id, username: x.username }, emoji: x.emoji || null, text: x.text || '', at: x.at })) });
  },

  // лента: свежие оценки друзей
  async 'GET /feed'({ env, me }) {
    const { results: fr } = await env.DB.prepare(
      "SELECT CASE WHEN f.a = ?1 THEN f.b ELSE f.a END AS id, u.username FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ?1 THEN f.b ELSE f.a END) WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted'"
    ).bind(me.id).all();
    if (!fr.length) return json({ friends: 0, items: [] });
    const ids = fr.slice(0, 90).map((x) => x.id);
    const names = new Map(fr.map((x) => [x.id, x.username]));
    const marks = ids.map(() => '?').join(',');
    const items = [];
    const { results: shelves } = await env.DB.prepare(`SELECT user_id, data FROM shelves WHERE user_id IN (${marks})`).bind(...ids).all();
    for (const sh of shelves) {
      let list = [];
      try { list = readShelf(sh).ratings; } catch (e) { continue; }
      list.map((r) => ({ r, at: stampOf(r) })).sort((a, b) => b.at - a.at).slice(0, 15).forEach(({ r, at }) => {
        if (!r || !r.name || !at) return;
        items.push({
          kind: 'rating', at, user: { id: sh.user_id, username: names.get(sh.user_id) },
          rating: { id: r.id, name: String(r.name).slice(0, 120), total: r.total ?? null, cat: r.catLabel || '', status: r.status || '', fav: !!r.fav, photo: r.photo && (r.photo.remote || r.photo.url) ? { remote: !!r.photo.remote, url: r.photo.url || '' } : null, edited: !!(r.updatedAt && r.createdAt && stampOf({ updatedAt: r.updatedAt }) - stampOf({ createdAt: r.createdAt }) > 60e3) },
        });
      });
    }
    // реакции на эти оценки друзей: счётчики у строк ленты
    const rids = items.filter((x) => x.kind === 'rating').map((x) => x.user.id + ':' + x.rating.id);
    if (rids.length) {
      const { results: rx } = await env.DB.prepare(`SELECT owner_id, rid, emoji, text FROM reactions WHERE owner_id IN (${marks})`).bind(...ids).all();
      const sum = new Map();
      for (const x of rx) {
        const k = x.owner_id + ':' + x.rid;
        const o = sum.get(k) || { fire: 0, skull: 0, nope: 0, text: 0 };
        if (x.emoji && o[x.emoji] != null) o[x.emoji]++;
        if (x.text) o.text++;
        sum.set(k, o);
      }
      items.forEach((x) => { if (x.kind === 'rating') { const o = sum.get(x.user.id + ':' + x.rating.id); if (o) x.reacts = o; } });
    }
    // друзья отреагировали на мои оценки
    const { results: mineRx } = await env.DB.prepare(`SELECT rid, from_id, emoji, text, at FROM reactions WHERE owner_id = ? AND from_id IN (${marks}) ORDER BY at DESC LIMIT 15`).bind(me.id, ...ids).all();
    if (mineRx.length) {
      const myShelf = readShelf(await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first());
      const nameOf = new Map(myShelf.ratings.map((r) => [r.id, r.name]));
      for (const x of mineRx) {
        if (!nameOf.has(x.rid)) continue;
        items.push({ kind: 'react', at: x.at, user: { id: x.from_id, username: names.get(x.from_id) }, react: { rid: x.rid, name: String(nameOf.get(x.rid)).slice(0, 120), emoji: x.emoji || null, text: x.text || '' } });
      }
    }
    items.sort((a, b) => b.at - a.at);
    return json({ friends: fr.length, items: items.slice(0, 40) });
  },

  // ?meta=1 — только когда фото менялось (телефон не качает аватар заново, если он тот же);
  // ?thumb=1 — маленькое превью «<id>.t», а если его ещё нет, то полное фото
  async 'GET /photo/:uid/:rid'({ env, request, me, arg }) {
    const [uid, rid] = arg;
    if (!(await canSee(env, me, uid))) return fail(403, 'Фото видны только друзьям.');
    const q = new URL(request.url).searchParams;
    if (q.has('meta')) {
      const m = await env.DB.prepare('SELECT updated_at FROM photos WHERE key = ?').bind(`${uid}:${rid}`).first();
      return json({ updatedAt: m ? m.updated_at : null });
    }
    let row = null;
    if (q.has('thumb')) row = await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${uid}:${rid}.t`).first();
    if (!row) row = await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${uid}:${rid}`).first();
    // фото нет — это обычное дело (нет аватарки, баннера), не ошибка: браузер не сыплет 404 в консоль
    return json({ data: row ? row.data : null });
  },
};

const MAX_PHOTO = 1900000; // символов в data URL, предел строки в D1 около 2 МБ
const RID_RE = /^[\w.-]{1,80}$/;
const REACTIONS = ['fire', 'skull', 'nope']; // 🔥 огонь, 💀 жесть, 🙅 не согласен
const stampOf = (r) => +new Date(r.updatedAt || r.createdAt || 0) || 0;
function readShelf(row) {
  if (!row) return { ratings: [], deleted: [] };
  const d = JSON.parse(row.data);
  if (Array.isArray(d)) return { ratings: d, deleted: [] }; // старый формат: просто список
  const cats = d.cats && Array.isArray(d.cats.items) && Number.isFinite(+d.cats.at) ? d.cats : null;
  const profile = d.profile && Array.isArray(d.profile.hide) && Number.isFinite(+d.profile.at) ? d.profile : null;
  return { ratings: Array.isArray(d.ratings) ? d.ratings : [], deleted: Array.isArray(d.deleted) ? d.deleted : [], cats, profile };
}
// ---------- Genius: фото исполнителей ----------
// Токен лежит в секрете GENIUS_TOKEN и наружу не уходит. Поиск доступен только вошедшим, ответы кэшируются на сутки.
const GENIUS_IMG = /^https:\/\/(images|assets|t2)\.genius\.com\/|^https:\/\/images\.rapgenius\.com\//;
async function geniusFetch(env, url, ttl) {
  const cache = caches.default;
  const key = new Request('https://genius-cache.casualhub/' + encodeURIComponent(url));
  const hitRes = await cache.match(key);
  if (hitRes) return hitRes;
  const headers = { 'user-agent': 'CasualHub/1.0 (+https://casualhub.pages.dev)', accept: url.startsWith('https://api.genius.com/') ? 'application/json' : 'image/*' };
  if (url.startsWith('https://api.genius.com/')) headers.authorization = 'Bearer ' + String(env.GENIUS_TOKEN).trim();
  const res = await fetch(url, { headers });
  if (!res.ok) return res;
  const copy = new Response(res.body, res);
  copy.headers.set('cache-control', 'public, max-age=' + ttl);
  await cache.put(key, copy.clone());
  return copy;
}
const b64 = (buf) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};

async function canSee(env, me, uid) {
  if (uid === me.id) return true;
  const row = await link(env, me.id, uid);
  return !!row && row.status === 'accepted';
}

const PUBLIC = new Set(['POST /register', 'POST /login', 'POST /logout']);

export async function onRequest({ request, env, params }) {
  const segs = [].concat(params.path || []);
  const path = '/' + segs.join('/');
  if (path === '/health') return json({ ok: !!env.DB });
  if (!env.DB) return fail(503, 'Сервер друзей ещё не подключён: нет базы данных.');

  let key = `${request.method} ${path}`;
  let arg = null;
  if (!routes[key] && segs.length === 2 && segs[0] === 'shelf') { key = `${request.method} /shelf/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'photo' && RID_RE.test(segs[1])) { key = `${request.method} /photo/:rid`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'photo' && RID_RE.test(segs[2])) { key = `${request.method} /photo/:uid/:rid`; arg = [segs[1], segs[2]]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'react' && RID_RE.test(segs[2])) { key = `${request.method} /react/:uid/:rid`; arg = [segs[1], segs[2]]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'reacts') { key = `${request.method} /reacts/:id`; arg = segs[1]; }
  const handler = routes[key];
  if (!handler) return fail(404, 'Нет такого адреса.');

  try {
    await ensureSchema(env);
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
