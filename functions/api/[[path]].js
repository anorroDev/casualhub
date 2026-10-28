// Казуал Хаб: онлайн-аккаунты, друзья и оценки друзей.
// Cloudflare Pages Functions, база D1 подключена как binding DB (см. schema.sql и README).

import { clip, numOrNull, SAFE_URL, cleanRating, readShelf, stampOf, RID_RE, SPOOF_RE } from '../_lib/shelf.js';

const enc = new TextEncoder();
const ITER = 10000; // PBKDF2: больше не даёт бесплатный тариф по времени CPU
const SESSION_DAYS = 30;
const MAX_SHELF = 1800000; // символов JSON на одного человека (фото хранятся отдельно)
const NAME_RE = /^[\p{L}\p{N}_.\- ]{2,24}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// @юзернейм: латиница, цифры, «_» и «.», от 3 до 20 символов, точка не по краям. Хранится в колонке uname.
const HANDLE_RE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const cleanHandle = (s) => String(s || '').trim().replace(/^@+/, '').toLowerCase();
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
// юзернейм из ника: «Бог» → bog, «Алекс 2» → aleks_2
function toHandle(name) {
  let h = Array.from(String(name || '').toLowerCase()).map((c) => (TR[c] != null ? TR[c] : c)).join('')
    .replace(/[\s-]+/g, '_').replace(/[^a-z0-9_.]/g, '').replace(/_{2,}/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 20);
  if (!h) h = 'user';
  while (h.length < 3) h += Math.floor(Math.random() * 10);
  return h.replace(/\.+$/, '_');
}
// свободный юзернейм: сам вариант или он же с цифрами
async function freeHandle(env, base, selfId) {
  for (let i = 0; i < 12; i++) {
    const h = i ? base.slice(0, 15) + '_' + Math.floor(1000 + Math.random() * 9000) : base;
    const row = await env.DB.prepare('SELECT id FROM users WHERE uname = ?').bind(h).first();
    if (!row || row.id === selfId) return h;
  }
  return 'user_' + randHex(6);
}
// что отдаём о человеке: друзьям — ник и юзернейм, себе — ещё почту и дату регистрации
const pubUser = (u) => ({ id: u.id, username: u.username, handle: u.handle || u.uname });
const ownUser = (u) => ({ ...pubUser(u), email: u.email || '', createdAt: u.created_at || u.createdAt || null, hideOnline: !!u.hide_online });

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
    // ссылки на отзыв: случайный код → чья оценка; одна ссылка на оценку
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, rid TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS shares_owner_rid ON shares(owner_id, rid)'),
    // комментарии: на стене профиля (target = 'wall') и под оценкой (target = 'r.<id оценки>')
    env.DB.prepare('CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, target TEXT NOT NULL, from_id TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS comments_owner ON comments(owner_id, target, at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS comments_from ON comments(from_id)'),
  ]);
  const { results } = await env.DB.prepare('PRAGMA table_info(users)').all();
  if (!results.some((c) => c.name === 'email')) await env.DB.prepare('ALTER TABLE users ADD COLUMN email TEXT').run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email)').run();
  if (!results.some((c) => c.name === 'nkey')) await env.DB.prepare('ALTER TABLE users ADD COLUMN nkey TEXT').run();
  if (!results.some((c) => c.name === 'last_seen')) await env.DB.prepare('ALTER TABLE users ADD COLUMN last_seen INTEGER').run();
  if (!results.some((c) => c.name === 'hide_online')) await env.DB.prepare('ALTER TABLE users ADD COLUMN hide_online INTEGER').run();
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS users_seen ON users(last_seen)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS presence (id TEXT PRIMARY KEY, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS presence_at ON presence(at)'),
  ]);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)').run();
  if (!(await env.DB.prepare("SELECT 1 FROM meta WHERE k = 'handles'").first())) {
    const { results: all } = await env.DB.prepare('SELECT id, username, uname, nkey FROM users').all();
    for (const u of all) {
      // nkey — ник в нижнем регистре: по нему ещё можно войти старым ником, пока он ни у кого не совпадает
      const nkey = u.nkey || String(u.username).toLowerCase();
      const handle = HANDLE_RE.test(u.uname) ? u.uname : await freeHandle(env, toHandle(u.username), u.id);
      try { await env.DB.prepare('UPDATE users SET uname = ?, nkey = ? WHERE id = ?').bind(handle, nkey, u.id).run(); } catch (e) {}
    }
    await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('handles', '1')").run();
  }
  schemaReady = true;
}
const cleanEmail = (s) => String(s || '').trim().toLowerCase();

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
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
const MAX_BODY = 2200000; // фото до ~1,9 МБ плюс запас
class TooBig extends Error {}
async function readBody(request) {
  if (+(request.headers.get('content-length') || 0) > MAX_BODY) throw new TooBig();
  let text = '';
  try { text = await request.text(); } catch (e) { return {}; }
  if (text.length > MAX_BODY) throw new TooBig();
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}

// ---------- защита от наплыва запросов: счётчик в памяти воркера, без запросов к базе ----------
// Не общий для всех серверов Cloudflare, но гасит перебор и флуд с одного адреса почти бесплатно.
const BURST = new Map(); // ключ -> { n, reset }
function burst(key, max, winMs) {
  const now = Date.now();
  let b = BURST.get(key);
  if (!b || b.reset <= now) { b = { n: 0, reset: now + winMs }; BURST.set(key, b); }
  b.n++;
  if (BURST.size > 20000) for (const [k, v] of BURST) if (v.reset <= now) BURST.delete(k);
  return b.n > max ? Math.ceil((b.reset - now) / 1000) : 0;
}

async function currentUser(env, request) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const th = await sha256(m[1]);
  const now = Date.now();
  const u = await env.DB.prepare(
    'SELECT u.id, u.username, u.uname AS handle, u.email, u.created_at, u.hide_online, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
  ).bind(th, now).first();
  // кто заходит, тот не вылетает: меньше 20 дней до конца сессии — продлеваем на 30 (запись раз в ~10 дней)
  if (u && u.expires_at - now < 20 * 864e5) await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(now + SESSION_DAYS * 864e5, th).run();
  if (Math.random() < 0.002) await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run(); // старые сессии не копятся
  return u;
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
  comment: { max: 60, win: 10 * 60e3 },   // комментариев на стенах и под оценками
};
const CM_MAX = 500; // символов в одном комментарии
const CM_TARGET_RE = /^(wall|r\.[\w.-]{1,80})$/;
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
    // общий потолок на сервер: бот-сеть с тысяч адресов не наплодит аккаунтов и не выжжет записи в базу
    if (burst('reg:all', 30, 60e3)) return tooMany(1);
    const wait = await overLimit(env, ipKey, 'register');
    if (wait) return tooMany(wait);
    const { username, handle, password, email } = await readBody(request);
    const name = cleanName(username);
    const mail = cleanEmail(email);
    const pass = String(password || '');
    const wanted = handle ? cleanHandle(handle) : '';
    if (!EMAIL_RE.test(mail) || mail.length > 120) return fail(400, 'Нужна почта, например name@mail.com.');
    if (!NAME_RE.test(name)) return fail(400, NAME_HINT);
    if (wanted && !HANDLE_RE.test(wanted)) return fail(400, HANDLE_HINT);
    if (weakPass(pass)) return fail(400, WEAK_PASS);
    // в лимит идут только настоящие регистрации и проверки занятых почт и юзернеймов, опечатки в форме не считаются
    await hit(env, ipKey, 'register');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(mail).first()) return fail(409, 'На эту почту уже есть аккаунт.');
    if (wanted && await env.DB.prepare('SELECT 1 FROM users WHERE uname = ?').bind(wanted).first()) return fail(409, `Юзернейм @${wanted} уже занят.`);
    const uname = wanted || await freeHandle(env, toHandle(name)); // старые версии сайта юзернейм не присылают
    const id = randHex(12);
    const salt = randHex(16);
    const now = Date.now();
    await env.DB.prepare('INSERT INTO users (id, username, uname, pass_hash, salt, created_at, email, nkey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, uname, await hashPass(pass, salt), salt, now, mail, name.toLowerCase()).run();
    return json({ token: await newSession(env, id), user: ownUser({ id, username: name, uname, email: mail, created_at: now }) });
  },

  // вход по почте или по нику
  async 'POST /login'({ env, request }) {
    const { login, username, password } = await readBody(request);
    const ident = String(login || username || '').trim();
    const ipKey = 'login-ip:' + clientIp(request);
    const accKey = 'login-acc:' + ident.toLowerCase().slice(0, 120);
    // общий потолок входов на сервер: перебор с многих адресов упирается в него раньше, чем в лимит базы
    if (burst('login:all', 300, 60e3)) return tooMany(1);
    const wait = Math.max(await overLimit(env, ipKey, 'loginIp'), await overLimit(env, accKey, 'loginAcc'));
    if (wait) return tooMany(wait);
    const COLS = 'id, username, uname, email, created_at, pass_hash, salt';
    let u = await env.DB.prepare(`SELECT ${COLS} FROM users WHERE uname = ? OR email = ?`).bind(cleanHandle(ident), cleanEmail(ident)).first();
    if (!u) {
      const { results: same } = await env.DB.prepare(`SELECT ${COLS} FROM users WHERE nkey = ? LIMIT 2`).bind(cleanName(ident).toLowerCase()).all();
      if (same.length === 1) u = same[0];
    }
    // и для несуществующего аккаунта считаем хеш: по времени ответа не понять, есть ли такой
    const hash = await hashPass(String(password || '').slice(0, 200), u ? u.salt : 'no-such-user-salt'); // паролей длиннее 200 не бывает
    if (!u || !sameHex(hash, u.pass_hash)) {
      await hit(env, ipKey, 'loginIp');
      await hit(env, accKey, 'loginAcc');
      return fail(401, 'Неверная почта, юзернейм или пароль.');
    }
    await env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(accKey).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(u.id, Date.now()).run();
    return json({ token: await newSession(env, u.id), user: ownUser(u) });
  },

  async 'POST /logout'({ env, request }) {
    const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
    return json({ ok: true });
  },

  async 'GET /me'({ me }) {
    return json({ user: ownUser(me) });
  },

  // смена ника и/или пароля из профиля на сайте
  async 'PUT /account'({ env, request, me }) {
    const { username, handle, password, email, current, hideOnline } = await readBody(request);
    const out = { ...me };
    const mail = email != null && email !== '' ? cleanEmail(email) : null;
    const mailChange = mail != null && mail !== (me.email || '');
    const h = handle != null ? cleanHandle(handle) : null;
    const handleChange = h != null && h !== me.handle;
    const name = username != null ? cleanName(username) : null;
    const nameChange = name != null && name !== me.username;
    const pass = password ? String(password) : '';
    // сначала все проверки, потом все записи: при ошибке в одном поле остальные не меняются наполовину
    if (mailChange && (!EMAIL_RE.test(mail) || mail.length > 120)) return fail(400, 'Нужна почта, например name@mail.com.');
    if (handleChange && !HANDLE_RE.test(h)) return fail(400, HANDLE_HINT);
    if (nameChange && !NAME_RE.test(name)) return fail(400, NAME_HINT);
    if (pass && weakPass(pass)) return fail(400, WEAK_PASS);
    if (pass || mailChange) {
      // украденной сессии мало, чтобы угнать аккаунт: почту и пароль меняют, зная текущий пароль
      const wait = await overLimit(env, 'acc:' + me.id, 'loginAcc');
      if (wait) return tooMany(wait);
      const cur = String(current || '');
      const row = await env.DB.prepare('SELECT pass_hash, salt FROM users WHERE id = ?').bind(me.id).first();
      // паролей длиннее 200 не бывает: огромную строку даже не хешируем, чтобы ей нельзя было нагрузить сервер
      if (!row || cur.length > 200 || !sameHex(await hashPass(cur, row.salt), row.pass_hash)) {
        await hit(env, 'acc:' + me.id, 'loginAcc');
        return fail(403, current ? 'Текущий пароль не подходит.' : 'Чтобы сменить почту или пароль, впиши текущий пароль.');
      }
    }
    if (mailChange) {
      const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(mail).first();
      if (taken && taken.id !== me.id) return fail(409, 'На эту почту уже есть аккаунт.');
    }
    if (handleChange) {
      const taken = await env.DB.prepare('SELECT id FROM users WHERE uname = ?').bind(h).first();
      if (taken && taken.id !== me.id) return fail(409, `Юзернейм @${h} уже занят.`);
    }
    if (hideOnline != null) {
      await env.DB.prepare('UPDATE users SET hide_online = ? WHERE id = ?').bind(hideOnline ? 1 : 0, me.id).run();
      out.hide_online = hideOnline ? 1 : 0;
    }
    if (mailChange) {
      await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(mail, me.id).run();
      out.email = mail;
    }
    if (handleChange) {
      await env.DB.prepare('UPDATE users SET uname = ? WHERE id = ?').bind(h, me.id).run();
      out.handle = h;
    }
    // ник может совпадать с чужим: друзья различают людей по @юзернейму
    if (nameChange) {
      await env.DB.prepare('UPDATE users SET username = ?, nkey = ? WHERE id = ?').bind(name, name.toLowerCase(), me.id).run();
      out.username = name;
    }
    if (pass) {
      const salt = randHex(16);
      await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPass(pass, salt), salt, me.id).run();
      // все остальные устройства выходят из аккаунта: если пароль утёк, старые сессии больше не работают
      const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(me.id, m ? await sha256(m[1]) : '').run();
    }
    return json({ user: ownUser(out) });
  },

  // гость присылает случайный id из своего браузера, вошедший — токен
  async 'POST /ping'({ env, request }) {
    const ip = clientIp(request);
    if (burst('ping:' + ip, 150, 60e3)) return json({ online: onlineCache.n, friends: [] });
    const now = Date.now();
    const me = await currentUser(env, request);
    if (me) {
      // пишем не чаще раза в 45 секунд: база не тратится на каждую вкладку
      await env.DB.prepare('UPDATE users SET last_seen = ?1 WHERE id = ?2 AND (last_seen IS NULL OR last_seen < ?3)').bind(now, me.id, now - 45e3).run();
    } else {
      const { guest } = await readBody(request);
      if (typeof guest === 'string' && /^[a-z0-9]{12,40}$/.test(guest) && !burst('pingw:' + ip, 60, 60e3) && !burst('pingw:all', 400, 60e3)) {
        await env.DB.prepare('INSERT INTO presence (id, at) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET at = ?2 WHERE at < ?3').bind('g:' + guest, now, now - 45e3).run();
      }
    }
    // число на сайте считается не чаще раза в 20 секунд на сервер
    if (onlineCache.at < now - 20e3) {
      const [a, b] = await env.DB.batch([
        env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?').bind(now - ONLINE_MS),
        env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE at > ?').bind(now - ONLINE_MS),
      ]);
      onlineCache.n = ((a.results[0] || {}).n || 0) + ((b.results[0] || {}).n || 0);
      onlineCache.at = now;
      if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM presence WHERE at < ?').bind(now - 864e5).run();
    }
    let friends = [];
    if (me) {
      const { results } = await env.DB.prepare(
        "SELECT u.id, u.last_seen FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ?1 THEN f.b ELSE f.a END) WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted' AND (u.hide_online IS NULL OR u.hide_online = 0) AND u.last_seen > ?2"
      ).bind(me.id, now - ONLINE_MS).all();
      friends = results.map((x) => ({ id: x.id, at: x.last_seen }));
    }
    // заявки в друзья, которые ждут ответа: красная цифра на кнопке «Друзья»
    let incoming = 0;
    if (me) {
      const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'pending' AND requested_by != ?1").bind(me.id).first();
      incoming = c ? c.n : 0;
    }
    return json({ online: Math.max(onlineCache.n, me ? 1 : 0), friends, incoming, window: ONLINE_MS });
  },

  async 'GET /friends'({ env, me }) {
    const { results } = await env.DB.prepare(
      `SELECT f.status, f.requested_by, u.id, u.username, u.uname, u.last_seen, u.hide_online, s.updated_at
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
         LEFT JOIN shelves s ON s.user_id = u.id
        WHERE f.a = ?1 OR f.b = ?1
        ORDER BY u.uname`
    ).bind(me.id).all();
    const pick = (r) => ({ ...pubUser(r), updatedAt: r.updated_at || null, lastSeen: r.status === 'accepted' && !r.hide_online ? r.last_seen || null : null });
    return json({
      friends: results.filter((r) => r.status === 'accepted').map(pick),
      incoming: results.filter((r) => r.status === 'pending' && r.requested_by !== me.id).map(pick),
      outgoing: results.filter((r) => r.status === 'pending' && r.requested_by === me.id).map(pick),
    });
  },

  // поиск людей для заявки: по началу @юзернейма или по части ника, без себя; видно, кто уже в друзьях
  async 'GET /users/search'({ env, request, me }) {
    if (burst('usearch:' + me.id, 60, 60e3)) return tooMany(1);
    const q = cleanHandle(new URL(request.url).searchParams.get('q')).slice(0, 24);
    if (q.length < 2) return json({ users: [] });
    const like = q.replace(/[\\%_]/g, '\\$&');
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.username, u.uname, f.status, f.requested_by FROM users u
         LEFT JOIN friendships f ON (f.a = ?3 AND f.b = u.id) OR (f.b = ?3 AND f.a = u.id)
        WHERE u.id <> ?3 AND (u.uname LIKE ?1 ESCAPE '\\' OR u.nkey LIKE ?2 ESCAPE '\\')
        ORDER BY CASE WHEN u.uname = ?4 THEN 0 WHEN u.uname LIKE ?1 ESCAPE '\\' THEN 1 ELSE 2 END, u.uname
        LIMIT 8`
    ).bind(like + '%', '%' + like + '%', me.id, q).all();
    return json({ users: (results || []).map((r) => ({ ...pubUser(r), rel: r.status === 'accepted' ? 'friend' : r.status ? (r.requested_by === me.id ? 'sent' : 'incoming') : '' })) });
  },
  // друзья другого человека: видны его друзьям, если он не скрыл блок «Друзья» в профиле
  async 'GET /friends/of/:id'({ env, me, arg }) {
    if (!(await canSee(env, me, arg))) return fail(403, 'Друзья видны только друзьям.');
    const s = readShelf(await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(arg).first());
    if (arg !== me.id && s.layout && s.layout.sections && s.layout.sections.friends === false) return json({ friends: [], hidden: true });
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.username, u.uname FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
        WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted'
        ORDER BY u.uname LIMIT 300`
    ).bind(arg).all();
    return json({ friends: (results || []).map(pubUser) });
  },
  async 'POST /friends/request'({ env, request, me }) {
    const wait = await overLimit(env, 'freq:' + me.id, 'friendReq');
    if (wait) return tooMany(wait);
    await hit(env, 'freq:' + me.id, 'friendReq');
    const body = await readBody(request);
    const h = cleanHandle(body.handle || body.username);
    const row0 = HANDLE_RE.test(h) ? await env.DB.prepare('SELECT id, username, uname FROM users WHERE uname = ?').bind(h).first() : null;
    if (!row0) return fail(404, `Нет никого с юзернеймом @${h || '…'}. Попроси друга глянуть свой @ в окне «Друзья» или в профиле.`);
    const other = pubUser(row0);
    if (other.id === me.id) return fail(400, 'Себя в друзья добавить нельзя.');
    const row = await link(env, me.id, other.id);
    const [a, b] = pair(me.id, other.id);
    if (row) {
      if (row.status === 'accepted') return fail(409, `Вы с ${other.username} (@${other.handle}) уже друзья.`);
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
    // обычный сайт шлёт оценки раз в несколько секунд; больше — это флуд записями
    if (burst('shelf:' + me.id, 40, 60e3)) return tooMany(1);
    const { ratings, deleted, cats, profile, sticker, layout } = await readBody(request);
    if (!Array.isArray(ratings)) return fail(400, 'Нужен список оценок.');
    const row = await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first();
    const old = readShelf(row);
    const del = new Map(old.deleted.map((d) => [d.id, d.at]));
    for (const d of Array.isArray(deleted) ? deleted : []) {
      if (d && typeof d.id === 'string' && Number.isFinite(+d.at)) del.set(d.id, Math.max(del.get(d.id) || 0, +d.at));
    }
    const byId = new Map();
    // новые оценки чистим, старые уже лежат в базе (их чистит чтение для друзей)
    const incoming = ratings.slice(0, 5000).map(cleanRating).filter(Boolean);
    for (const r of [...old.ratings, ...incoming]) {
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
    // стикер возле ника в профиле (картинка из колеса): остаётся более свежий выбор, пустой src — стикер убран
    let stickerOut = old.sticker;
    if (sticker && Number.isFinite(+sticker.at) && (sticker.src === '' || STICKER_RE.test(String(sticker.src))) && (!old.sticker || +sticker.at > +old.sticker.at)) {
      stickerOut = { src: String(sticker.src), at: +sticker.at };
    }
    // оформление профиля (витрины и какие блоки видны): остаётся более свежий выбор
    let layoutOut = old.layout;
    if (layout && typeof layout === 'object' && Number.isFinite(+layout.at) && (!old.layout || +layout.at > +old.layout.at)) layoutOut = cleanLayout(layout);
    const shelfData = { ratings: merged, deleted: tomb };
    if (old.follow) shelfData.follow = old.follow; // подписки меняются только через /follow
    if (layoutOut) shelfData.layout = layoutOut;
    if (stickerOut) shelfData.sticker = stickerOut;
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
      await env.DB.batch(gone.flatMap((id) => [`${me.id}:${id}`, `${me.id}:${id}.t`].map((k) => env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(k))
        .concat(env.DB.prepare('DELETE FROM shares WHERE owner_id = ? AND rid = ?').bind(me.id, id)) // и ссылка на отзыв закрывается
        .concat(env.DB.prepare('DELETE FROM comments WHERE owner_id = ? AND target = ?').bind(me.id, 'r.' + id)))); // и ветка комментариев под ней
    }
    return json({ ok: true, updatedAt: now, count: merged.length, catsAt: catsOut ? catsOut.at : null });
  },

  async 'GET /shelf/:id'({ env, me, arg }) {
    if (!(await canSee(env, me, arg))) return fail(403, 'Оценки видны только друзьям.');
    const row = await env.DB.prepare('SELECT id, username, uname, created_at, last_seen, hide_online FROM users WHERE id = ?').bind(arg).first();
    if (!row) return fail(404, 'Пользователь не найден.');
    // число друзей — для значка «Душа компании»
    const fc = await env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(arg).first();
    const user = { ...pubUser(row), createdAt: row.created_at || null, friends: fc ? fc.n : 0, lastSeen: row.hide_online ? null : row.last_seen || null };
    const shelf = await env.DB.prepare('SELECT data, updated_at FROM shelves WHERE user_id = ?').bind(arg).first();
    const s = readShelf(shelf);
    // свои категории видит только хозяин
    // друзьям — только очищенные оценки (вдруг в базе лежит что-то записанное до проверки типов)
    return json({ user, ratings: arg === me.id ? s.ratings : s.ratings.map(cleanRating).filter(Boolean), deleted: s.deleted, cats: arg === me.id ? s.cats || null : undefined, profile: s.profile || null, sticker: s.sticker || null, layout: s.layout || null, updatedAt: shelf ? shelf.updated_at : null });
  },

  // подписки на оценки друзей: список id, хранится в своей полке, виден только хозяину
  async 'GET /follow'({ env, me }) {
    const s = readShelf(await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first());
    return json(s.follow || { ids: [], at: 0 });
  },
  async 'PUT /follow'({ env, request, me }) {
    if (burst('follow:' + me.id, 30, 60e3)) return tooMany(1);
    const { ids, at } = await readBody(request);
    if (!Array.isArray(ids) || !Number.isFinite(+at)) return fail(400, 'Нужен список подписок.');
    const row = await env.DB.prepare('SELECT data, updated_at FROM shelves WHERE user_id = ?').bind(me.id).first();
    let d = row ? JSON.parse(row.data) : { ratings: [], deleted: [] };
    if (Array.isArray(d)) d = { ratings: d, deleted: [] };
    if (d.follow && +d.follow.at > +at) return json(d.follow); // на другом устройстве выбор свежее
    d.follow = { ids: [...new Set(ids.filter((x) => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)))].slice(0, 200), at: +at };
    // время обновления полки не трогаем: друзья не должны видеть «оценки обновлены» из-за подписки
    await env.DB.prepare(
      'INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data'
    ).bind(me.id, JSON.stringify(d), row ? row.updated_at : Date.now()).run();
    return json(d.follow);
  },

  // исполнители по имени: имя и фото. Сначала Genius; если он отказал (например, 429 — слишком много запросов
  // с общих адресов Cloudflare) или ничего не нашёл, ищем на Deezer, ему ключ не нужен
  async 'GET /genius/artist'({ env, request, me }) {
    // поиск идёт с нашим ключом Genius: частые запросы одного человека могли бы заблокировать ключ для всех
    if (burst('genius:' + me.id, 40, 60e3)) return tooMany(1);
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return json({ artists: [] });
    let artists = [], why = env.GENIUS_TOKEN ? '' : 'Genius не подключён.';
    if (env.GENIUS_TOKEN && Date.now() >= geniusPause) {
      try {
        const res = await geniusFetch(env, 'https://api.genius.com/search?q=' + encodeURIComponent(q), 86400);
        if (res.status === 429) geniusPause = Date.now() + 60e3; // минуту не дёргаем Genius
        if (res.status === 401) why = 'Genius не принял токен (401): в секрете GENIUS_TOKEN нужен Client Access Token.';
        else if (!res.ok) why = `Genius не ответил (${res.status}).`;
        else artists = geniusArtists(await res.json());
      } catch (e) { why = 'Genius не ответил.'; }
    } else if (env.GENIUS_TOKEN) why = 'Genius просил подождать (429).';
    if (!artists.length) {
      try {
        const res = await geniusFetch(env, 'https://api.deezer.com/search/artist?limit=8&q=' + encodeURIComponent(q), 86400);
        if (res.ok) artists = deezerArtists(await res.json(), q);
      } catch (e) {}
    }
    if (!artists.length && why) return fail(502, why);
    return json({ artists });
  },
  // картинка с Genius в виде data URL: браузер не может скачать её напрямую из-за CORS
  async 'GET /genius/img'({ env, request, me }) {
    if (burst('geniusimg:' + me.id, 40, 60e3)) return tooMany(1);
    const u = new URL(request.url).searchParams.get('u') || '';
    if (!GENIUS_IMG.test(u)) return fail(400, 'Это не картинка Genius.');
    const res = await geniusFetch(env, u, 604800);
    if (!res.ok) return fail(502, `Картинка не загрузилась (${res.status}).`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3e6) return fail(413, 'Картинка слишком большая.');
    // тип берём по первым байтам: CDN иногда отдаёт картинку как application/octet-stream
    const h = new Uint8Array(buf.slice(0, 12));
    const type = h[0] === 0xff && h[1] === 0xd8 ? 'image/jpeg' : h[0] === 0x89 && h[1] === 0x50 ? 'image/png'
      : h[0] === 0x47 && h[1] === 0x49 ? 'image/gif' : h[8] === 0x57 && h[9] === 0x45 ? 'image/webp' : '';
    if (!type) return fail(502, 'Это не картинка.');
    return json({ data: `data:${type};base64,${b64(buf)}` });
  },
  // картинка по ссылке для фото оценки: скачиваем сразу, чтобы фото не пропало, когда чужая ссылка протухнет
  // или сайт запретит показывать картинку у нас. Браузер сам скачать не может: CORS чужих сайтов и наш CSP
  // обложки по названию: игры — Steam, фильмы и сериалы — IMDb, книги — Open Library, аниме и манга — AniList.
  // Ключи не нужны, ответы кэшируются на сутки. Выбранную обложку Мнение скачивает через /fetch-img
  async 'GET /covers'({ request, me }) {
    if (burst('covers:' + me.id, 40, 60e3)) return tooMany(1);
    const sp = new URL(request.url).searchParams;
    const kind = sp.get('kind') || '';
    const q = (sp.get('q') || '').trim().slice(0, 100);
    if (q.length < 2 || !Object.prototype.hasOwnProperty.call(COVER_FIND, kind)) return json({ items: [] });
    try {
      // по-русски Steam и сайты аниме ничего не находят: для кириллицы сразу ищем по английскому названию
      const ru = (kind === 'game' || kind === 'anime') && CYR.test(q);
      let items = ru ? [] : await COVER_FIND[kind](q).catch(() => []);
      // Steam и AniList не знают русских названий: сначала ищем английское (Wikidata, русская Википедия)
      if (ru) {
        const found = [];
        const titles = await latinTitles(q, kind);
        for (const t of titles) found.push(...(await COVER_FIND[kind](t).catch(() => [])));
        // перевод не помог — возможно, это транслит («Элден ринг» → Elden ring)
        const tr = translit(q);
        if (!found.length && !titles.some((t) => t.toLowerCase() === tr.toLowerCase())) found.push(...(await COVER_FIND[kind](tr).catch(() => [])));
        items = found.concat(items);
      }
      const seen = new Set();
      items = items.filter((c) => c.title && /^https:\/\//.test(c.art) && !seen.has(c.art) && seen.add(c.art)).slice(0, 8);
      return json({ items });
    } catch (e) {
      return fail(502, 'Поиск обложек сейчас не отвечает');
    }
  },
  async 'GET /fetch-img'({ request, me }) {
    if (burst('fetchimg:' + me.id, 30, 60e3)) return tooMany(1);
    let u;
    try { u = new URL(new URL(request.url).searchParams.get('u') || ''); } catch (e) { return fail(400, 'Это не ссылка'); }
    if (!publicUrl(u)) return fail(400, 'Такую ссылку открыть нельзя');
    // переадресации проходим сами и проверяем каждую: иначе публичная ссылка могла бы увести на внутренний адрес
    let res;
    try {
      for (let hop = 0; ; hop++) {
        res = await fetch(u.href, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; CasualHub/1.0; +https://casualhub.pages.dev)', accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.5' } });
        if (res.status < 300 || res.status >= 400) break;
        const loc = res.headers.get('location');
        if (!loc || hop >= 4) return fail(502, 'Сайт с картинкой слишком долго перенаправляет');
        u = new URL(loc, u);
        if (!publicUrl(u)) return fail(400, 'Такую ссылку открыть нельзя');
      }
    } catch (e) { return fail(502, 'Сайт с картинкой не ответил'); }
    if (!res.ok) return fail(502, `Сайт с картинкой её не отдал (${res.status})`);
    if (+res.headers.get('content-length') > 6e6) return fail(413, 'Картинка больше 6 МБ');
    // читаем по кусочкам и обрываем на 6 МБ: размер в заголовке может врать или отсутствовать
    const buf = await readCapped(res, 6e6);
    if (!buf) return fail(413, 'Картинка больше 6 МБ');
    const type = imageType(buf);
    if (!type) return fail(415, 'По ссылке страница, а не картинка. Открой саму картинку и скопируй её адрес');
    return json({ data: `data:${type};base64,${b64(buf)}` });
  },
  // фото оценки: кладёт и удаляет хозяин, смотрят хозяин и друзья
  async 'PUT /photo/:rid'({ env, request, me, arg }) {
    if (burst('photo:' + me.id, 80, 60e3)) return tooMany(1);
    const { data } = await readBody(request);
    // у баннера в конце бывает «#pos=x,y» — какая часть картинки видна
    if (typeof data !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*(#pos=\d{1,3},\d{1,3})?$/.test(data)) return fail(400, 'Нужна картинка.');
    if (data.length > MAX_PHOTO) return fail(413, 'Фото слишком большое.');
    const key = `${me.id}:${arg}`;
    if (!(await env.DB.prepare('SELECT 1 FROM photos WHERE key = ?').bind(key).first())) {
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE user_id = ?').bind(me.id).first();
      if (c && c.n >= MAX_PHOTOS) return fail(413, `Слишком много фото в аккаунте (больше ${MAX_PHOTOS}). Удали старые оценки с фото.`);
    }
    const now = Date.now();
    // аватар и баннер: прежняя картинка уходит в историю (последние 8), её можно вернуть одним нажатием
    if (HIST_KINDS.has(arg)) await toHistory(env, me.id, arg, data);
    await env.DB.prepare(
      'INSERT INTO photos (key, user_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(key, me.id, data, now).run();
    return json({ ok: true, updatedAt: now });
  },
  async 'DELETE /photo/:rid'({ env, me, arg }) {
    if (HIST_KINDS.has(arg)) await toHistory(env, me.id, arg, null); // убранный аватар или баннер тоже остаётся в истории
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
    const text = String(body.text || '').replace(SPOOF_RE, '').replace(/\s+/g, ' ').trim().slice(0, 140);
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
      'SELECT r.rid, r.from_id, u.username, u.uname, r.emoji, r.text, r.at FROM reactions r JOIN users u ON u.id = r.from_id WHERE r.owner_id = ? ORDER BY r.at DESC LIMIT 2000'
    ).bind(arg).all();
    return json({ items: results.map((x) => ({ rid: x.rid, from: { id: x.from_id, username: x.username, handle: x.uname }, emoji: x.emoji || null, text: x.text || '', at: x.at })) });
  },

  // ---------- ссылки на отзыв ----------
  // Ссылка открывает оценку всем, у кого она есть, без входа. Код случайный (12 знаков), угадать нельзя;
  // хозяин может закрыть ссылку, а удалённая оценка по ссылке больше не показывается.
  async 'POST /share'({ env, request, me }) {
    if (burst('share:' + me.id, 30, 600e3)) return tooMany(10);
    const { rid } = await readBody(request);
    if (typeof rid !== 'string' || !RID_RE.test(rid)) return fail(400, 'Нет такой оценки.');
    const s = readShelf(await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first());
    const r = s.ratings.find((x) => x && x.id === rid && !x.example);
    if (!r) return fail(404, 'Оценка ещё не дошла до сервера. Подожди пару секунд и попробуй снова.');
    const had = await env.DB.prepare('SELECT id FROM shares WHERE owner_id = ? AND rid = ?').bind(me.id, rid).first();
    if (had) return json({ id: had.id });
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares WHERE owner_id = ?').bind(me.id).first();
    if (c && c.n >= 500) return fail(413, 'Слишком много открытых ссылок. Закрой старые.');
    const id = shareId();
    await env.DB.prepare('INSERT INTO shares (id, owner_id, rid, created_at) VALUES (?, ?, ?, ?)').bind(id, me.id, rid, Date.now()).run();
    return json({ id });
  },
  async 'GET /shares'({ env, me }) {
    const { results } = await env.DB.prepare('SELECT id, rid FROM shares WHERE owner_id = ? LIMIT 500').bind(me.id).all();
    return json({ items: results });
  },
  async 'DELETE /share/:id'({ env, me, arg }) {
    await env.DB.prepare('DELETE FROM shares WHERE id = ? AND owner_id = ?').bind(arg, me.id).run();
    return json({ ok: true });
  },
  // картинка отзыва (для страницы /r/<код> и превью в чатах): только если ссылка есть и оценка жива
  async 'GET /share/:id/img'({ env, request, arg }) {
    if (burst('shareimg:' + clientIp(request), 240, 60e3)) return new Response(null, { status: 429 });
    const sh = await env.DB.prepare('SELECT owner_id, rid FROM shares WHERE id = ?').bind(arg).first();
    if (!sh) return new Response(null, { status: 404 });
    const row = (await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${sh.owner_id}:${sh.rid}.t`).first())
      || (await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${sh.owner_id}:${sh.rid}`).first());
    const m = row && /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+=*)$/.exec(row.data);
    if (!m) return new Response(null, { status: 404 });
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
  },

  // лента: свежие оценки друзей
  async 'GET /feed'({ env, me }) {
    const { results: fr } = await env.DB.prepare(
      "SELECT CASE WHEN f.a = ?1 THEN f.b ELSE f.a END AS id, u.username, u.uname FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ?1 THEN f.b ELSE f.a END) WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted'"
    ).bind(me.id).all();
    if (!fr.length) return json({ friends: 0, items: [] });
    const ids = fr.slice(0, 90).map((x) => x.id);
    const people = new Map(fr.map((x) => [x.id, pubUser(x)]));
    const marks = ids.map(() => '?').join(',');
    const items = [];
    const { results: shelves } = await env.DB.prepare(`SELECT user_id, data FROM shelves WHERE user_id IN (${marks})`).bind(...ids).all();
    for (const sh of shelves) {
      let list = [];
      try { list = readShelf(sh).ratings; } catch (e) { continue; }
      list.map((r) => ({ r, at: stampOf(r) })).sort((a, b) => b.at - a.at).slice(0, 15).forEach(({ r, at }) => {
        if (!r || !r.name || !at) return;
        items.push({
          kind: 'rating', at, user: people.get(sh.user_id),
          rating: { id: clip(r.id, 120), name: clip(r.name, 120), total: numOrNull(r.total), cat: clip(r.catLabel, 80), status: clip(r.status, 60), fav: !!r.fav, photo: r.photo && (r.photo.remote || r.photo.url) ? { remote: !!r.photo.remote, url: typeof r.photo.url === 'string' && SAFE_URL.test(r.photo.url) ? r.photo.url : '' } : null, edited: !!(r.updatedAt && r.createdAt && stampOf({ updatedAt: r.updatedAt }) - stampOf({ createdAt: r.createdAt }) > 60e3) },
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
        const o = sum.get(k) || Object.fromEntries(REACTIONS.map((r) => [r, 0]).concat([['text', 0]]));
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
        items.push({ kind: 'react', at: x.at, user: people.get(x.from_id), react: { rid: x.rid, name: String(nameOf.get(x.rid)).slice(0, 120), emoji: x.emoji || null, text: x.text || '' } });
      }
    }
    // друзья написали мне: на стене профиля или под моей оценкой
    const { results: mineCm } = await env.DB.prepare(`SELECT target, from_id, text, at FROM comments WHERE owner_id = ? AND from_id IN (${marks}) ORDER BY at DESC LIMIT 15`).bind(me.id, ...ids).all();
    if (mineCm.length) {
      const myShelf = readShelf(await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first());
      const nameOf = new Map(myShelf.ratings.map((r) => [r.id, r.name]));
      for (const x of mineCm) {
        const rid = x.target === 'wall' ? null : x.target.slice(2);
        if (rid && !nameOf.has(rid)) continue;
        items.push({ kind: 'comment', at: x.at, user: people.get(x.from_id), comment: { rid, name: rid ? String(nameOf.get(rid)).slice(0, 120) : '', text: String(x.text).slice(0, 200) } });
      }
    }
    items.sort((a, b) => b.at - a.at);
    return json({ friends: fr.length, items: items.slice(0, 40) });
  },

  // ---------- комментарии: стена профиля («wall») и ветка под оценкой («r.<id оценки>»); видят хозяин и его друзья ----------
  async 'GET /comments/:uid/:target'({ env, me, arg }) {
    const [uid, target] = arg;
    if (!(await canSee(env, me, uid))) return fail(403, 'Комментарии видны только друзьям.');
    const { results } = await env.DB.prepare(
      'SELECT c.id, c.from_id, c.text, c.at, u.username, u.uname FROM comments c LEFT JOIN users u ON u.id = c.from_id WHERE c.owner_id = ? AND c.target = ? ORDER BY c.at DESC LIMIT 200'
    ).bind(uid, target).all();
    return json({
      items: results.reverse().map((x) => ({
        id: x.id, text: x.text, at: x.at,
        from: { id: x.from_id, username: x.username || 'удалённый аккаунт', handle: x.uname || '' },
        canDelete: x.from_id === me.id || uid === me.id,
      })),
    });
  },
  async 'POST /comments/:uid/:target'({ env, request, me, arg }) {
    const [uid, target] = arg;
    if (!(await canSee(env, me, uid))) return fail(403, 'Писать можно только себе и друзьям.');
    if (burst('cm:' + me.id, 12, 60e3)) return tooMany(1);
    const wait = await overLimit(env, 'cm:' + me.id, 'comment');
    if (wait) return tooMany(wait);
    const body = await readBody(request);
    // переносы строк оставляем (не больше двух подряд), остальное — как в реакциях: без невидимых и «переворачивающих» символов
    const text = String(body.text || '').replace(SPOOF_RE, '').replace(/\r\n?/g, '\n').replace(/[ \t\f\v ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, CM_MAX);
    if (!text) return fail(400, 'Напиши что-нибудь.');
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE owner_id = ?').bind(uid).first();
    if (n && n.n >= 5000) return fail(413, 'У этого профиля слишком много комментариев.');
    await hit(env, 'cm:' + me.id, 'comment');
    const id = randHex(10), now = Date.now();
    await env.DB.prepare('INSERT INTO comments (id, owner_id, target, from_id, text, at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, uid, target, me.id, text, now).run();
    return json({ item: { id, text, at: now, from: pubUser(me), canDelete: true } });
  },
  // удалить может автор комментария и хозяин профиля, на чьей стене или оценке он написан
  async 'DELETE /comment/:id'({ env, me, arg }) {
    await env.DB.prepare('DELETE FROM comments WHERE id = ? AND (from_id = ? OR owner_id = ?)').bind(arg, me.id, me.id).run();
    return json({ ok: true });
  },
  // сколько комментариев под оценками человека: число 💬 у строк рейтинга
  async 'GET /comments-count/:uid'({ env, me, arg }) {
    if (!(await canSee(env, me, arg))) return fail(403, 'Комментарии видны только друзьям.');
    const { results } = await env.DB.prepare("SELECT target, COUNT(*) AS n FROM comments WHERE owner_id = ? AND target != 'wall' GROUP BY target").bind(arg).all();
    return json({ counts: Object.fromEntries(results.map((x) => [x.target.slice(2), x.n])) });
  },

  // ?meta=1 — только когда фото менялось (телефон не качает аватар заново, если он тот же);
  // ?thumb=1 — маленькое превью «<id>.t», а если его ещё нет, то полное фото
  // история аватарок или баннеров: только список (что есть и когда), сами картинки грузятся по одной
  async 'GET /photo-history/:kind'({ env, me, arg }) {
    const { results } = await env.DB.prepare('SELECT key, updated_at FROM photos WHERE user_id = ? AND key LIKE ? ORDER BY key DESC LIMIT ?').bind(me.id, `${me.id}:${arg}.h.%`, HIST_MAX).all();
    return json({ items: results.map((r) => ({ id: r.key.slice(me.id.length + 1), at: r.updated_at })) });
  },
  async 'GET /photo/:uid/:rid'({ env, request, me, arg }) {
    const [uid, rid] = arg;
    if (HIST_RE.test(rid) && uid !== me.id) return json({ data: null }); // историю аватарок и баннеров видит только хозяин
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

// новые пароли: от 8 символов и не из самых частых (старые, покороче, продолжают работать при входе)
const COMMON_PASS = new Set(['12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344', 'password', 'password1', 'qwertyui', 'qwerty123', 'qwertyuiop', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'abcd1234', 'iloveyou', 'sunshine', 'football', 'baseball', 'princess', 'superman', 'starwars', 'whatever', 'trustno1', 'asdfghjk', 'йцукенгш', 'пароль123', 'casualhub', 'mnenie123']);
const weakPass = (p) => p.length < 8 || p.length > 200 || COMMON_PASS.has(p.toLowerCase()) || /^(.)\1+$/.test(p);
const WEAK_PASS = 'Пароль: от 8 символов и не из самых простых вроде «12345678» или «password».';
const NAME_HINT = 'Ник: от 2 до 24 символов, буквы, цифры, пробел, точка, дефис или подчёркивание.';
const HANDLE_HINT = 'Юзернейм: от 3 до 20 символов, латинские буквы, цифры, «_» и «.» (точка не в начале и не в конце).';
// история аватарок и баннеров: ключ «<id>:avatar.h.<время>», хранятся 8 последних
const HIST_KINDS = new Set(['avatar', 'banner']);
const HIST_RE = /\.h\.\d+$/;
const HIST_MAX = 8;
async function toHistory(env, uid, kind, next) {
  const old = await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${uid}:${kind}`).first();
  if (!old || !old.data || old.data === next) return;
  const now = Date.now(), hk = `${uid}:${kind}.h.${now}`;
  // та же картинка уже лежит в истории — она просто поднимается наверх, без копии
  const same = await env.DB.prepare('SELECT key FROM photos WHERE user_id = ? AND key LIKE ? AND data = ?').bind(uid, `${uid}:${kind}.h.%`, old.data).first();
  if (same) await env.DB.prepare('UPDATE photos SET key = ?, updated_at = ? WHERE key = ?').bind(hk, now, same.key).run();
  else await env.DB.prepare('INSERT OR REPLACE INTO photos (key, user_id, data, updated_at) VALUES (?, ?, ?, ?)').bind(hk, uid, old.data, now).run();
  // картинку вернули из истории: теперь она текущая, в истории ей больше не место
  if (next) await env.DB.prepare('DELETE FROM photos WHERE user_id = ? AND key LIKE ? AND data = ?').bind(uid, `${uid}:${kind}.h.%`, next).run();
  const { results } = await env.DB.prepare('SELECT key FROM photos WHERE user_id = ? AND key LIKE ? ORDER BY key DESC LIMIT -1 OFFSET ?').bind(uid, `${uid}:${kind}.h.%`, HIST_MAX).all();
  if (results.length) await env.DB.batch(results.map((r) => env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(r.key)));
}
const MAX_PHOTOS = 1200; // фото, превью, аватар и баннер вместе
const MAX_PHOTO = 1900000; // символов в data URL, предел строки в D1 около 2 МБ
// оформление профиля: до 6 витрин (топ-3/5/10 из темы, лучшие по баллу или выбранные вручную) и видимость блоков
const LAYOUT_SECTIONS = ['stats', 'titles', 'podium', 'all', 'badges', 'friends', 'hist', 'cats'];
function cleanLayout(l) {
  const one = (x) => String(x == null ? '' : x).replace(SPOOF_RE, '');
  const showcases = (Array.isArray(l.showcases) ? l.showcases : []).filter((s) => s && typeof s === 'object').slice(0, 6).map((s) => ({
    id: /^[\w-]{1,40}$/.test(String(s.id)) ? String(s.id) : 'sc' + Math.random().toString(36).slice(2, 8),
    title: one(s.title).slice(0, 60),
    cat: one(s.cat).slice(0, 60),
    n: [3, 5, 10].includes(+s.n) ? +s.n : 5,
    mode: s.mode === 'pick' ? 'pick' : 'auto',
    ids: (Array.isArray(s.ids) ? s.ids : []).filter((id) => typeof id === 'string' && RID_RE.test(id)).slice(0, 10),
    style: s.style === 'list' ? 'list' : 'posters',
  }));
  const sections = {};
  if (l.sections && typeof l.sections === 'object') for (const k of LAYOUT_SECTIONS) if (typeof l.sections[k] === 'boolean') sections[k] = l.sections[k];
  return { showcases, sections, at: +l.at };
}
const STICKER_RE = /^hub\/(?!.*\.\.)[\w\-\/.]{1,100}\.(png|gif|webp|webm|jpe?g)$/; // путь картинки из каталога колеса
// 🔥 огонь, 💀 жесть, 🙅 не согласен, 😂 ору, 😍 обожаю, 👍 согласен, 👎 мимо, 🤔 спорно, 😭 до слёз, 🤡 клоунада, 🗿 база, 🐐 легенда
const REACTIONS = ['fire', 'skull', 'nope', 'lol', 'love', 'like', 'dislike', 'think', 'cry', 'clown', 'moai', 'goat'];
// ---------- Genius: фото исполнителей ----------
// Токен лежит в секрете GENIUS_TOKEN и наружу не уходит. Поиск доступен только вошедшим, ответы кэшируются на сутки.
const GENIUS_IMG = /^https:\/\/(images|assets|t2)\.genius\.com\/|^https:\/\/images\.rapgenius\.com\/|^https:\/\/(cdn-images|e-cdns-images)\.dzcdn\.net\//;
let geniusPause = 0; // после 429 Genius минуту не трогаем (в пределах одного экземпляра сервера)
function geniusArtists(d) {
  const seen = new Set();
  const out = [];
  for (const h of (d && d.response && d.response.hits) || []) {
    const a = h && h.result && h.result.primary_artist;
    if (!a || seen.has(a.id) || typeof a.image_url !== 'string' || /default_avatar|default_cover/.test(a.image_url)) continue;
    seen.add(a.id);
    out.push({ name: String(a.name || '').slice(0, 80), image: a.image_url, source: 'Genius' });
    if (out.length >= 4) break;
  }
  return out;
}
// Deezer: сначала точное совпадение имени, потом самые популярные; без пустых заглушек вместо фото
function deezerArtists(d, q) {
  const k = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const want = k(q);
  return ((d && d.data) || [])
    .filter((a) => a && typeof a.picture_big === 'string' && /^https:\/\//.test(a.picture_big) && !/\/artist\/\//.test(a.picture_big))
    .map((a) => ({ name: String(a.name || '').slice(0, 80), image: a.picture_big, source: 'Deezer', score: (k(a.name) === want ? 1e12 : 0) + (+a.nb_fan || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score, ...a }) => a);
}
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
// ---------- поиск обложек ----------
async function cachedJson(url, init, ttl) {
  const cache = caches.default;
  const key = new Request('https://covers-cache.casualhub/' + encodeURIComponent(url + '|' + ((init && init.body) || '')));
  const hitRes = await cache.match(key);
  if (hitRes) return hitRes.json();
  // долго молчащий сайт не держит поиск: через 6 секунд переходим к следующему источнику
  const res = await fetch(url, { ...(init || {}), signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'CasualHub/1.0 (+https://casualhub.pages.dev)', accept: 'application/json', ...((init && init.headers) || {}) } });
  if (!res.ok) throw new Error('covers ' + res.status);
  const data = await res.json();
  await cache.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + ttl } }));
  return data;
}
// русское название → до двух английских: «Дота 2» → Dota 2, «Созданные в бездне» → Made in Abyss
const CYR = /[а-яё]/i;
async function latinTitles(q, kind) {
  const want = kind === 'game' ? /video game|computer game|\bgame\b/i : /anime|manga|light novel|novel series|franchise|television series/i;
  const out = [];
  const add = (t) => {
    const v = String(t || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (v && !CYR.test(v) && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  const W = 'https://www.wikidata.org/w/api.php?format=json&';
  const RU = 'https://ru.wikipedia.org/w/api.php?format=json&action=query&';
  // 1) Wikidata по русским названиям и синонимам: подходящие по описанию («video game», «anime») первыми
  try {
    const d = await cachedJson(W + 'action=wbsearchentities&type=item&limit=7&language=ru&uselang=en&search=' + encodeURIComponent(q), null, 604800);
    const hits = (d.search || []).filter((x) => x && x.label && !CYR.test(x.label));
    hits.filter((x) => want.test(x.description || '')).concat(hits).slice(0, 2).forEach((x) => add(x.label));
  } catch (e) {}
  // 2) русская Википедия: статья часто и называется по-английски, иначе берём ссылку на английскую статью
  if (out.length < 2) {
    try {
      const d = await cachedJson(RU + 'list=search&srlimit=1&srsearch=' + encodeURIComponent(q), null, 604800);
      const t = d.query && d.query.search && d.query.search[0] && d.query.search[0].title;
      if (t && !CYR.test(t)) add(t);
      else if (t) {
        const l = await cachedJson(RU + 'prop=langlinks&lllang=en&titles=' + encodeURIComponent(t), null, 604800);
        const pg = Object.values((l.query && l.query.pages) || {})[0];
        if (pg && pg.langlinks && pg.langlinks[0]) add(pg.langlinks[0]['*']);
      }
    } catch (e) {}
  }
  // 3) полнотекстовый поиск Wikidata, если ничего не нашлось
  if (!out.length) {
    try {
      const d = await cachedJson(W + 'action=query&list=search&srlimit=5&srsearch=' + encodeURIComponent(q), null, 604800);
      const ids = ((d.query && d.query.search) || []).map((x) => x.title).filter((x) => /^Q\d+$/.test(x)).join('|');
      if (ids) {
        const e = await cachedJson(W + 'action=wbgetentities&props=labels|descriptions&languages=en&ids=' + ids, null, 604800);
        const list = Object.values(e.entities || {}).map((x) => ({ label: x.labels && x.labels.en && x.labels.en.value, desc: (x.descriptions && x.descriptions.en && x.descriptions.en.value) || '' })).filter((x) => x.label);
        list.filter((x) => want.test(x.desc) && !/character/i.test(x.desc)).slice(0, 2).forEach((x) => add(x.label));
      }
    } catch (e) {}
  }
  // 4) ничего не нашлось: может, это транслит («Элден ринг» → Elden ring)
  if (!out.length) add(translit(q));
  return out.slice(0, 2);
}
// таблица TR (кириллица → латиница) объявлена в начале файла
const translit = (s) => String(s).replace(/[а-яё]/gi, (c) => { const t = TR[c.toLowerCase()] || ''; return c === c.toLowerCase() ? t : t.charAt(0).toUpperCase() + t.slice(1); });
async function aniList(q) {
  const body = JSON.stringify({ query: 'query($s:String){Page(perPage:10){media(search:$s,sort:SEARCH_MATCH,isAdult:false){type format title{romaji english}startDate{year}coverImage{extraLarge large}}}}', variables: { s: q } });
  const d = await cachedJson('https://graphql.anilist.co', { method: 'POST', body, headers: { 'content-type': 'application/json' } }, 86400);
  const list = (d && d.data && d.data.Page && d.data.Page.media) || [];
  // сначала аниме, потом манга: категория обычно про аниме
  return list.filter((m) => m && m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)).sort((x, y) => (x.type === 'MANGA') - (y.type === 'MANGA')).map((m) => ({
    title: String((m.title && (m.title.english || m.title.romaji)) || '').slice(0, 140), sub: ANI_KIND[m.format] || (m.type === 'MANGA' ? 'Манга' : 'Аниме'),
    year: m.startDate && m.startDate.year ? String(m.startDate.year) : '', art: m.coverImage.extraLarge || m.coverImage.large, thumb: m.coverImage.large || m.coverImage.extraLarge, tall: true,
  }));
}
const KITSU_KIND = { TV: 'Аниме', movie: 'Аниме-фильм', OVA: 'OVA', ONA: 'ONA', special: 'Спецвыпуск', music: 'Клип' };
async function kitsu(q) {
  const d = await cachedJson('https://kitsu.io/api/edge/anime?page[limit]=8&filter[text]=' + encodeURIComponent(q), { headers: { accept: 'application/vnd.api+json' } }, 86400);
  return (d.data || []).map((x) => x && x.attributes).filter((a) => a && a.posterImage && (a.posterImage.large || a.posterImage.original)).map((a) => ({
    title: String((a.titles && a.titles.en) || a.canonicalTitle || '').slice(0, 140), sub: KITSU_KIND[a.subtype] || 'Аниме', year: String(a.startDate || '').slice(0, 4),
    art: a.posterImage.large || a.posterImage.original, thumb: a.posterImage.medium || a.posterImage.large, tall: true,
  }));
}
async function jikan(q) {
  const d = await cachedJson('https://api.jikan.moe/v4/anime?limit=8&sfw=true&q=' + encodeURIComponent(q), null, 86400);
  return (d.data || []).filter((a) => a && a.images && a.images.jpg && a.images.jpg.large_image_url).map((a) => ({
    title: String(a.title_english || a.title || '').slice(0, 140), sub: a.type === 'Movie' ? 'Аниме-фильм' : 'Аниме', year: a.year ? String(a.year) : '',
    art: a.images.jpg.large_image_url, thumb: a.images.jpg.image_url || a.images.jpg.large_image_url, tall: true,
  }));
}
const STEAM_ART = (id, file) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/${file}`;
const IMDB_KIND = { movie: 'Фильм', tvMovie: 'Фильм', video: 'Фильм', tvSeries: 'Сериал', tvMiniSeries: 'Мини-сериал', short: 'Короткий метр', tvSpecial: 'Спецвыпуск' };
const ANI_KIND = { TV: 'Аниме', TV_SHORT: 'Аниме', MOVIE: 'Аниме-фильм', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Спецвыпуск', MANGA: 'Манга', ONE_SHOT: 'Манга', NOVEL: 'Ранобэ' };
const COVER_FIND = {
  // Steam: вертикальная обложка 600×900, у старых игр её может не быть — тогда шапка магазина
  async game(q) {
    const d = await cachedJson('https://store.steampowered.com/api/storesearch/?l=english&cc=US&term=' + encodeURIComponent(q), null, 86400);
    return (d.items || []).filter((i) => i && Number.isInteger(i.id) && !/\b(soundtrack|ost|artbook|dlc)\b/i.test(i.name || ''))
      .map((i) => ({ title: String(i.name || '').slice(0, 140), sub: 'Игра', year: '', art: STEAM_ART(i.id, 'library_600x900.jpg'), alt: STEAM_ART(i.id, 'header.jpg'), tall: true }));
  },
  async movie(q) {
    const d = await cachedJson(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q.toLowerCase())}.json`, null, 86400);
    return (d.d || []).filter((i) => i && i.i && typeof i.i.imageUrl === 'string' && IMDB_KIND[i.qid]).map((i) => {
      const art = i.i.imageUrl.replace(/\._V1_[^/]*\.jpg$/, '._V1_QL80_UX600_.jpg');
      return { title: String(i.l || '').slice(0, 140), sub: IMDB_KIND[i.qid], year: i.y ? String(i.y) : '', art, thumb: art.replace('UX600', 'UX240'), tall: true };
    });
  },
  async book(q) {
    const d = await cachedJson('https://openlibrary.org/search.json?limit=12&fields=title,author_name,first_publish_year,cover_i&q=' + encodeURIComponent(q), null, 86400);
    return (d.docs || []).filter((b) => b && Number.isInteger(b.cover_i)).map((b) => ({
      title: String(b.title || '').slice(0, 140), sub: (b.author_name || []).slice(0, 2).join(', ').slice(0, 80), year: b.first_publish_year ? String(b.first_publish_year) : '',
      art: `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg`, thumb: `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`, tall: true,
    }));
  },
  // аниме: AniList, если он не ответил (с адресов Cloudflare бывает 403/429) — Kitsu, потом Jikan (MyAnimeList)
  async anime(q) {
    for (const find of [aniList, kitsu, jikan]) {
      try { const r = await find(q); if (r.length) return r; } catch (e) {}
    }
    return [];
  },
};
// тип картинки по первым байтам (заголовкам чужих сайтов верить нельзя)
// ссылка наружу: только http(s), без внутренних имён и голых IP-адресов (в том числе записанных хитро: 0x7f.1, 2130706433), стандартные порты
function publicUrl(u) {
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$|^0x|^\[|:/.test(h)) return false;
  if (/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|arpa)$/.test(h)) return false;
  return true;
}
async function readCapped(res, max) {
  if (!res.body) return new ArrayBuffer(0);
  const reader = res.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch (e) {} return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out.buffer;
}
function imageType(buf) {
  const h = new Uint8Array(buf.slice(0, 16));
  if (h[0] === 0xff && h[1] === 0xd8) return 'image/jpeg';
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'image/png';
  if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46) return 'image/gif';
  if (h[0] === 0x52 && h[1] === 0x49 && h[8] === 0x57 && h[9] === 0x45) return 'image/webp';
  if (String.fromCharCode(...h.slice(4, 12)) === 'ftypavif') return 'image/avif';
  return '';
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

const PUBLIC = new Set(['POST /register', 'POST /login', 'POST /logout', 'POST /ping', 'GET /share/:id/img']);
// код ссылки на отзыв: 12 знаков из 62 — около 71 бита случайности
const SHARE_RE = /^[A-Za-z0-9]{12}$/;
function shareId() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(24))].filter((b) => b < 248).slice(0, 12).map((b) => abc[b % 62]).join('').padEnd(12, 'x');
}
const ONLINE_MS = 150e3; // «в сети» — заходил за последние 2,5 минуты
const onlineCache = { n: 0, at: 0 };

export async function onRequest({ request, env, params }) {
  const segs = [].concat(params.path || []);
  const path = '/' + segs.join('/');
  if (path === '/health') return json({ ok: !!env.DB });
  if (!env.DB) return fail(503, 'Сервер друзей ещё не подключён: нет базы данных.');

  let key = `${request.method} ${path}`;
  let arg = null;
  if (!routes[key] && segs.length === 2 && segs[0] === 'shelf') { key = `${request.method} /shelf/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'friends' && segs[1] === 'of') { key = `${request.method} /friends/of/:id`; arg = segs[2]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'photo' && RID_RE.test(segs[1])) { key = `${request.method} /photo/:rid`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'photo' && RID_RE.test(segs[2])) { key = `${request.method} /photo/:uid/:rid`; arg = [segs[1], segs[2]]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'react' && RID_RE.test(segs[2])) { key = `${request.method} /react/:uid/:rid`; arg = [segs[1], segs[2]]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'comments' && CM_TARGET_RE.test(segs[2])) { key = `${request.method} /comments/:uid/:target`; arg = [segs[1], segs[2]]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'comment' && /^[0-9a-f]{20}$/.test(segs[1])) { key = `${request.method} /comment/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'comments-count') { key = `${request.method} /comments-count/:uid`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'photo-history' && HIST_KINDS.has(segs[1])) { key = `${request.method} /photo-history/:kind`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'reacts') { key = `${request.method} /reacts/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'share' && SHARE_RE.test(segs[1])) { key = `${request.method} /share/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'share' && segs[2] === 'img' && SHARE_RE.test(segs[1])) { key = `${request.method} /share/:id/img`; arg = segs[1]; }
  const handler = routes[key];
  if (!handler) return fail(404, 'Нет такого адреса.');
  // флуд с одного адреса гасится до базы данных
  const ip = clientIp(request);
  // щедро: за одним адресом бывает много людей (мобильный интернет), а доска друга с фото — это десятки запросов
  const slow = burst('all:' + ip, 900, 60e3) || (request.method !== 'GET' && burst('w:' + ip, 150, 60e3));
  if (slow) return new Response(JSON.stringify({ error: 'Слишком много запросов, подожди немного.' }), { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': String(slow) } });

  try {
    await ensureSchema(env);
    let me = null;
    if (!PUBLIC.has(key)) {
      me = await currentUser(env, request);
      if (!me) return fail(401, 'Нужно войти в онлайн-аккаунт.');
    }
    return await handler({ env, request, me, arg });
  } catch (e) {
    if (e instanceof TooBig) return fail(413, 'Слишком большой запрос.');
    console.error(e);
    return fail(500, 'Ошибка сервера, попробуй ещё раз.');
  }
}
