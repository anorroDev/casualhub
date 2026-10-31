// Казуал Хаб: онлайн-аккаунты, друзья и оценки друзей.
// Cloudflare Pages Functions, база D1 подключена как binding DB.

import { clip, numOrNull, SAFE_URL, cleanRating, readShelf, stampOf, RID_RE, SPOOF_RE, MUSIC_LINK_RE } from '../_lib/shelf.js';

const enc = new TextEncoder();
const ITER = 10000;
const SESSION_DAYS = 30;
const MAX_SHELF = 1800000; // символов JSON на одного человека (фото хранятся отдельно)
const NAME_RE = /^[\p{L}\p{N}_.\- ]{2,24}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEW_MAIL_RE = /^[^\s@<>"'`,;:()[\]\\]+@[^\s@<>"'`,;:()[\]\\]+\.[^\s@<>"'`,;:()[\]\\.]{2,}$/;
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
    if ((!row || row.id === selfId) && !ADMIN_HANDLES.includes(h)) return h;
  }
  return 'user_' + randHex(6);
}
// что отдаём о человеке: друзьям — ник и юзернейм, себе — ещё почту и дату регистрации
const pubUser = (u) => ({ id: u.id, username: u.username, handle: u.handle || u.uname });
const ownUser = (u) => ({ ...pubUser(u), email: u.email || '', createdAt: u.created_at || u.createdAt || null, hideOnline: !!u.hide_online });

// Таблицы создаются и обновляются сами при первом запросе,
// чтобы новые поля вроде email не требовали ручной миграции.
let schemeReady = false;
async function ensureScheme(env) {
  if (schemeReady) return;
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
    // тир-листы: data пустая — тир-лист удалён (отметка нужна, чтобы его не вернуло другое устройство)
    env.DB.prepare("CREATE TABLE IF NOT EXISTS lot_rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'game', per_user INTEGER NOT NULL, ends_at INTEGER, closed INTEGER NOT NULL DEFAULT 0, ver INTEGER NOT NULL DEFAULT 1, live TEXT, created_at INTEGER NOT NULL)"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS lot_rooms_owner ON lot_rooms(owner_id)'),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS lots (room_id TEXT NOT NULL, id TEXT NOT NULL, user_id TEXT NOT NULL, ref TEXT NOT NULL, name TEXT NOT NULL, img TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY (room_id, id), UNIQUE (room_id, ref))"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS lots_user ON lots(room_id, user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS tierlists (user_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT, meta TEXT, private INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (user_id, id))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS comments_from ON comments(from_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS admins (user_id TEXT PRIMARY KEY, handle TEXT NOT NULL, at INTEGER NOT NULL, pin_hash TEXT, pin_salt TEXT, pin_until INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, until INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_log (at INTEGER NOT NULL, user_id TEXT NOT NULL, ip TEXT, action TEXT NOT NULL, ok INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS admin_log_at ON admin_log(at)'),
    // без него подсчёт фото человека и история аватарок читали всю таблицу на каждую загрузку
    env.DB.prepare('CREATE INDEX IF NOT EXISTS photos_user ON photos(user_id)'),
  ]);
  const { results } = await env.DB.prepare('PRAGMA table_info(users)').all();
  if (!results.some((c) => c.name === 'email')) await env.DB.prepare('ALTER TABLE users ADD COLUMN email TEXT').run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email)').run();
  if (!results.some((c) => c.name === 'nkey')) await env.DB.prepare('ALTER TABLE users ADD COLUMN nkey TEXT').run();
  if (!results.some((c) => c.name === 'last_seen')) await env.DB.prepare('ALTER TABLE users ADD COLUMN last_seen INTEGER').run();
  if (!results.some((c) => c.name === 'hide_online')) await env.DB.prepare('ALTER TABLE users ADD COLUMN hide_online INTEGER').run();
  if (!results.some((c) => c.name === 'banned')) await env.DB.prepare('ALTER TABLE users ADD COLUMN banned INTEGER').run();
  if (!results.some((c) => c.name === 'ban_reason')) await env.DB.prepare('ALTER TABLE users ADD COLUMN ban_reason TEXT').run();
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS users_seen ON users(last_seen)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS users_nkey ON users(nkey)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS presence (id TEXT PRIMARY KEY, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS presence_at ON presence(at)'),
  ]);
  const { results: ac } = await env.DB.prepare('PRAGMA table_info(admins)').all();
  for (const [c, t] of [['pin_hash', 'TEXT'], ['pin_salt', 'TEXT'], ['pin_until', 'INTEGER']]) {
    if (!ac.some((x) => x.name === c)) await env.DB.prepare(`ALTER TABLE admins ADD COLUMN ${c} ${t}`).run();
  }
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
  schemeReady = true;
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
    'SELECT u.id, u.username, u.uname AS handle, u.email, u.created_at, u.hide_online, u.banned, u.ban_reason, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
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
const LIMITS = {
  loginIp: { max: 30, win: 15 * 60e3 },
  loginAcc: { max: 10, win: 15 * 60e3 },
  register: { max: 10, win: 60 * 60e3 },
  friendReq: { max: 40, win: 10 * 60e3 },
  react: { max: 120, win: 10 * 60e3 },
  comment: { max: 60, win: 10 * 60e3 },
  admin: { max: 5, win: 60 * 60e3 },
};
const ADMIN_HANDLES = ['YW5vcnJv', 'eXVrb21hZ29k'].map(atob);
const adminIds = (env) => String(env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const adminCandidate = (me, env) => {
  if (!me || !ADMIN_HANDLES.includes(String(me.handle || '').toLowerCase())) return false;
  const ids = adminIds(env || {});
  return !ids.length || ids.includes(me.id);
};
const reservedHandle = (env, h, me) => ADMIN_HANDLES.includes(String(h || '').toLowerCase()) && !(me && adminIds(env).includes(me.id));
const PIN_RE = /^\d{4,8}$/;
const PIN_SET_MS = 15 * 60e3;
const adminRow = (env, me) => (me ? env.DB.prepare('SELECT user_id, pin_hash, pin_salt, pin_until FROM admins WHERE user_id = ?').bind(me.id).first() : null);
const isAdmin = async (env, me) => !!(await adminRow(env, me));
const ADMIN_TTL = 12 * 3600e3;
const tokenHashOf = async (request) => { const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/); return m ? sha256(m[1]) : null; };
async function adminActive(env, request, me) {
  if (!(await isAdmin(env, me)) || !adminCandidate(me, env)) return false;
  const th = await tokenHashOf(request);
  return !!(th && (await env.DB.prepare('SELECT 1 FROM admin_sessions WHERE token_hash = ? AND user_id = ? AND until > ?').bind(th, me.id, Date.now()).first()));
}
async function openAdmin(env, request, me) {
  const th = await tokenHashOf(request), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO admin_sessions (token_hash, user_id, until) VALUES (?, ?, ?)').bind(th, me.id, now + ADMIN_TTL),
    env.DB.prepare('DELETE FROM admin_sessions WHERE until < ?').bind(now),
  ]);
  return now + ADMIN_TTL;
}
const adminLog = async (env, request, me, action, ok) => {
  try {
    await env.DB.prepare('INSERT INTO admin_log (at, user_id, ip, action, ok) VALUES (?, ?, ?, ?, ?)')
      .bind(Date.now(), me ? me.id : '', clientIp(request), String(action).slice(0, 80), ok ? 1 : 0).run();
    if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM admin_log WHERE at < ?').bind(Date.now() - 365 * 864e5).run(); // журнал хранится год
  } catch (e) {}
};
// сравнение без подсказки по времени ответа: сравниваются отпечатки одинаковой длины (sameHex — выше)
const sameSecret = async (a, b) => sameHex(await sha256(a), await sha256(b));
async function adminTry(env, request, me) {
  const keys = ['admin:' + me.id, 'adminip:' + clientIp(request)];
  if (burst('adminunlock:all', 20, 60e3)) return { wait: 1, keys };
  let wait = 0;
  for (const k of keys) wait = Math.max(wait, await bump(env, k, 'admin'));
  return { wait, keys };
}
// удачный вход: счётчик аккаунта обнуляется, с адреса снимается только эта попытка
const adminTryOk = (env, t) => env.DB.batch([
  env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(t.keys[0]),
  env.DB.prepare('UPDATE attempts SET count = MAX(0, count - 1) WHERE key = ?').bind(t.keys[1]),
]);
const isAdminAccount = async (env, u) => ADMIN_HANDLES.includes(String(u.uname || '').toLowerCase()) || !!(await env.DB.prepare('SELECT 1 FROM admins WHERE user_id = ?').bind(u.id).first());
const CM_MAX = 500; // символов в одном комментарии
const CM_TARGET_RE = /^(wall|[rt]\.[\w.-]{1,80})$/; // стена, оценка или тир-лист
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
// попытка засчитывается сразу, до проверки пароля: если сначала проверять, а считать потом, сотня одновременных запросов
// прошла бы мимо лимита. Сколько минут ждать (0 — можно); удачная попытка снимается отдельно
async function bump(env, key, kind) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'INSERT INTO attempts (key, count, reset_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET ' +
    'count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END, reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END RETURNING count, reset_at'
  ).bind(key, now + LIMITS[kind].win, now).first();
  return row && row.count > LIMITS[kind].max ? Math.max(1, Math.ceil((row.reset_at - now) / 60e3)) : 0;
}
// сколько байт можно потратить за сутки (фото): то же окно, только считаем байты, а не попытки
async function spend(env, key, bytes, max) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'INSERT INTO attempts (key, count, reset_at) VALUES (?1, ?4, ?2) ON CONFLICT(key) DO UPDATE SET ' +
    'count = CASE WHEN reset_at <= ?3 THEN ?4 ELSE count + ?4 END, reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END RETURNING count, reset_at'
  ).bind(key, now + 864e5, now, bytes).first();
  return row && row.count > max ? Math.max(1, Math.ceil((row.reset_at - now) / 60e3)) : 0;
}
const tooMany =(min) => new Response(JSON.stringify({ error: `Слишком много попыток. Подожди ${min} мин. и попробуй снова.` }), {
  status: 429,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(min * 60) },
});

async function createUser(env, d) {
  const id = randHex(12), now = Date.now();
  await env.DB.prepare('INSERT INTO users (id, username, uname, pass_hash, salt, created_at, email, nkey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, d.name, d.uname, d.passHash, d.salt, now, d.mail, d.name.toLowerCase()).run();
  return { token: await newSession(env, id), user: ownUser({ id, username: d.name, uname: d.uname, email: d.mail, created_at: now }) };
}
async function link(env, x, y) {
  const [a, b] = pair(x, y);
  return env.DB.prepare('SELECT status, requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
}

const routes = {
  async 'POST /register'({ env, request }) {
    const ipKey = 'reg:' + clientIp(request);
    if (burst('reg:all', 30, 60e3)) return tooMany(1);
    const wait = await overLimit(env, ipKey, 'register');
    if (wait) return tooMany(wait);
    const { username, handle, password, email } = await readBody(request);
    const name = cleanName(username);
    const mail = cleanEmail(email);
    const pass = String(password || '');
    const wanted = handle ? cleanHandle(handle) : '';
    if (!NEW_MAIL_RE.test(mail) || mail.length > 120) return fail(400, 'Нужна почта, например name@mail.com.');
    if (!NAME_RE.test(name)) return fail(400, NAME_HINT);
    if (wanted && !HANDLE_RE.test(wanted)) return fail(400, HANDLE_HINT);
    if (wanted && reservedHandle(env, wanted, null)) return fail(409, `Юзернейм @${wanted} уже занят.`);
    if (weakPass(pass)) return fail(400, WEAK_PASS);
    // в лимит идут только настоящие регистрации и проверки занятых почт и юзернеймов, опечатки в форме не считаются
    await hit(env, ipKey, 'register');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(mail).first()) return fail(409, 'На эту почту уже есть аккаунт.');
    if (wanted && await env.DB.prepare('SELECT 1 FROM users WHERE uname = ?').bind(wanted).first()) return fail(409, `Юзернейм @${wanted} уже занят.`);
    const uname = wanted || await freeHandle(env, toHandle(name)); // старые версии сайта юзернейм не присылают
    const salt = randHex(16);
    const passHash = await hashPass(pass, salt);
    return json(await createUser(env, { name, uname, mail, passHash, salt }));
  },
  // вход по почте или по нику
  async 'POST /login'({ env, request }) {
    const { login, username, password } = await readBody(request);
    const ident = String(login || username || '').trim();
    const ipKey = 'login-ip:' + clientIp(request);
    if (burst('login:all', 300, 60e3)) return tooMany(1);
    const waitIp = await bump(env, ipKey, 'loginIp');
    if (waitIp) return tooMany(waitIp);
    const COLS = 'id, username, uname, email, created_at, pass_hash, salt, banned, ban_reason';
    let u = await env.DB.prepare(`SELECT ${COLS} FROM users WHERE uname = ? OR email = ?`).bind(cleanHandle(ident), cleanEmail(ident)).first();
    if (!u) {
      const { results: same } = await env.DB.prepare(`SELECT ${COLS} FROM users WHERE nkey = ? LIMIT 2`).bind(cleanName(ident).toLowerCase()).all();
      if (same.length === 1) u = same[0];
    }
    // счётчик на сам аккаунт, а не на написанное: «@ник», «@@ник», почта и ник — один и тот же человек
    const accKey = u ? 'login-acc:' + u.id : '';
    if (u) { const waitAcc = await bump(env, accKey, 'loginAcc'); if (waitAcc) return tooMany(waitAcc); }
    const hash = await hashPass(String(password || '').slice(0, 200), u ? u.salt : 'no-such-user-salt'); // паролей длиннее 200 не бывает
    if (!u || !sameHex(hash, u.pass_hash)) return fail(401, 'Неверная почта, юзернейм или пароль.');
    if (u.banned) return fail(403, 'Аккаунт заблокирован администрацией' + (u.ban_reason ? ': ' + u.ban_reason : '.'));
    // пароль верный: попытка не считается
    await env.DB.batch([
      env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(accKey),
      env.DB.prepare('UPDATE attempts SET count = MAX(0, count - 1) WHERE key = ?').bind(ipKey),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(u.id, Date.now()),
    ]);
    return json({ token: await newSession(env, u.id), user: ownUser(u) });
  },

  async 'POST /logout'({ env, request }) {
    const m = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
    if (m) { const th = await sha256(m[1]); await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th), env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(th)]); }
    return json({ ok: true });
  },

  async 'GET /me'({ env, me }) {
    return json({ user: { ...ownUser(me), admin: !!(await adminRow(env, me)) } });
  },

  async 'GET /admin/me'({ env, request, me }) {
    if (!adminCandidate(me, env)) return fail(404, 'Нет такого адреса.');
    const row = await adminRow(env, me);
    return json({ admin: !!row, pinSet: !!(row && row.pin_hash), active: !!row && (await adminActive(env, request, me)), ready: !!env.ADMIN_CODE, handle: me.handle });
  },
  async 'POST /admin/unlock'({ env, request, me }) {
    if (!adminCandidate(me, env)) return fail(404, 'Нет такого адреса.');
    if (!env.ADMIN_CODE) return fail(503, 'Одноразовый пароль ещё не задан на сервере.');
    const t = await adminTry(env, request, me);
    if (t.wait) return tooMany(t.wait);
    const { code } = await readBody(request);
    const ok = typeof code === 'string' && code.trim().length > 0 && code.length <= 200 && (await sameSecret(code.trim(), String(env.ADMIN_CODE).trim()));
    await adminLog(env, request, me, 'unlock:code', ok);
    if (!ok) return fail(403, 'Неверный одноразовый пароль.');
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO admins (user_id, handle, at) VALUES (?, ?, ?)').bind(me.id, me.handle, now),
      env.DB.prepare('UPDATE admins SET pin_hash = NULL, pin_salt = NULL, pin_until = ? WHERE user_id = ?').bind(now + PIN_SET_MS, me.id),
      env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(me.id),
    ]);
    await adminTryOk(env, t);
    return json({ ok: true });
  },
  async 'POST /admin/pin/set'({ env, request, me }) {
    if (!adminCandidate(me, env)) return fail(404, 'Нет такого адреса.');
    const row = await adminRow(env, me);
    if (!row) return fail(404, 'Нет такого адреса.');
    if (row.pin_hash) return fail(409, 'Пин-код уже задан. Если забыл, сбрось его одноразовым паролем.');
    if (!(row.pin_until > Date.now())) return fail(403, 'Время задать пин-код вышло. Введи одноразовый пароль ещё раз.');
    const { pin } = await readBody(request);
    if (typeof pin !== 'string' || !PIN_RE.test(pin)) return fail(400, 'Пин-код — от 4 до 8 цифр.');
    const salt = randHex(16);
    await env.DB.prepare('UPDATE admins SET pin_hash = ?, pin_salt = ?, pin_until = NULL WHERE user_id = ? AND pin_hash IS NULL').bind(await hashPass(pin, salt), salt, me.id).run();
    await adminLog(env, request, me, 'pin:set', true);
    return json({ ok: true, until: await openAdmin(env, request, me) });
  },
  async 'POST /admin/pin'({ env, request, me }) {
    if (!adminCandidate(me, env)) return fail(404, 'Нет такого адреса.');
    const row = await adminRow(env, me);
    if (!row) return fail(404, 'Нет такого адреса.');
    if (!row.pin_hash) return fail(409, 'Сначала задай пин-код.');
    const t = await adminTry(env, request, me);
    if (t.wait) return tooMany(t.wait);
    const { pin } = await readBody(request);
    const ok = typeof pin === 'string' && PIN_RE.test(pin) && sameHex(await hashPass(pin, row.pin_salt), row.pin_hash);
    await adminLog(env, request, me, 'unlock:pin', ok);
    if (!ok) return fail(403, 'Неверный пин-код.');
    await adminTryOk(env, t);
    return json({ ok: true, until: await openAdmin(env, request, me) });
  },
  async 'POST /admin/lock'({ env, request, me }) {
    if (!adminCandidate(me, env)) return fail(404, 'Нет такого адреса.');
    const th = await tokenHashOf(request);
    if (th) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(th).run();
    await adminLog(env, request, me, 'lock', true);
    return json({ ok: true });
  },

  // объявление отдельно и часто: страницы спрашивают его раз в 15 секунд, поэтому новое появляется у всех почти сразу
  async 'GET /announce'({ env, request }) {
    if (burst('ann:' + clientIp(request), 40, 60e3)) return tooMany(1); // страница просто пропустит этот раз, плашка не пропадёт
    return json({ announce: await currentAnnounce(env) });
  },
  async 'GET /admin/stats'({ env, request, me }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const now = Date.now();
    const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
    // оценки считает сама база: разбирать тут все полки целиком значило бы упереться в лимит времени сервера
    const [users, fresh, day, online, guests, banned, comments, reacts, shares, shelves, photos] = await env.DB.batch([
      q('SELECT COUNT(*) AS n FROM users'),
      q('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 7 * 864e5),
      q('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', now - 864e5),
      q('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', now - ONLINE_MS),
      q('SELECT COUNT(*) AS n FROM presence WHERE at > ?', now - ONLINE_MS),
      q('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
      q('SELECT COUNT(*) AS n FROM comments'),
      q('SELECT COUNT(*) AS n FROM reactions'),
      q('SELECT COUNT(*) AS n FROM shares'),
      q(`SELECT COALESCE(SUM(${SHELF_COUNT}), 0) AS n FROM shelves`),
      q('SELECT COUNT(*) AS n FROM photos'),
    ]);
    const n = (r) => ((r.results || [])[0] || {}).n || 0;
    return json({ users: n(users), new7: n(fresh), active24: n(day), onlineUsers: n(online), onlineGuests: n(guests), banned: n(banned), ratings: n(shelves), comments: n(comments), reactions: n(reacts), shares: n(shares), photos: n(photos), dbBytes: (photos.meta && photos.meta.size_after) || 0 });
  },
  async 'GET /admin/users'({ env, request, me }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const sp = new URL(request.url).searchParams;
    const raw = String(sp.get('q') || '').trim().slice(0, 60);
    const offset = Math.max(0, Math.min(1e6, Math.floor(+sp.get('offset') || 0)));
    const like = '%' + raw.toLowerCase().replace(/^@+/, '').replace(/[\\%_]/g, '\\$&') + '%';
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.username, u.uname, u.email, u.created_at, u.last_seen, u.banned, u.ban_reason, a.user_id AS adm, (SELECT ${SHELF_COUNT} FROM shelves WHERE shelves.user_id = u.id) AS ratings
         FROM users u LEFT JOIN admins a ON a.user_id = u.id
        WHERE ?1 = '' OR u.uname LIKE ?2 ESCAPE '\\' OR u.nkey LIKE ?2 ESCAPE '\\' OR u.email LIKE ?2 ESCAPE '\\' OR u.id = ?1
        ORDER BY u.created_at DESC LIMIT 51 OFFSET ?3`
    ).bind(raw, like, offset).all();
    return json({ more: results.length > 50, users: results.slice(0, 50).map((u) => ({ id: u.id, username: u.username, handle: u.uname, email: u.email || '', createdAt: u.created_at, lastSeen: u.last_seen || null, banned: !!u.banned, banReason: u.ban_reason || '', ratings: u.ratings || 0, admin: !!u.adm || ADMIN_HANDLES.includes(String(u.uname).toLowerCase()) })) });
  },
  async 'POST /admin/ban/:id'({ env, request, me, arg }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const { on, reason } = await readBody(request);
    const u = await env.DB.prepare('SELECT id, uname FROM users WHERE id = ?').bind(arg).first();
    if (!u) return fail(404, 'Нет такого аккаунта.');
    if (u.id === me.id || (await isAdminAccount(env, u))) return fail(400, 'Админа забанить нельзя.');
    const why = clip(String(reason || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(), 200); // причину человек видит при входе: без разметки
    if (on) await env.DB.batch([
      env.DB.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').bind(why || null, u.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    ]);
    else await env.DB.prepare('UPDATE users SET banned = NULL, ban_reason = NULL WHERE id = ?').bind(u.id).run();
    await adminLog(env, request, me, (on ? 'ban ' : 'unban ') + u.uname, true);
    return json({ ok: true });
  },
  async 'POST /admin/rename/:id'({ env, request, me, arg }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const { handle, username, email } = await readBody(request);
    const u = await env.DB.prepare('SELECT id, username, uname, email FROM users WHERE id = ?').bind(arg).first();
    if (!u) return fail(404, 'Нет такого аккаунта.');
    const h = handle != null && handle !== '' ? cleanHandle(handle) : null;
    const name = username != null && username !== '' ? cleanName(username) : null;
    const mail = email != null && email !== '' ? cleanEmail(email) : null;
    const mailChange = mail != null && mail !== (u.email || '');
    const handleChange = h != null && h !== u.uname;
    const nameChange = name != null && name !== u.username;
    // сначала все проверки, потом все записи: при ошибке в одном поле остальные не меняются наполовину
    if (mailChange) {
      if (!NEW_MAIL_RE.test(mail) || mail.length > 120) return fail(400, 'Нужна почта, например name@mail.com.');
      const taken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(mail).first();
      if (taken && taken.id !== u.id) return fail(409, 'На эту почту уже есть аккаунт.');
    }
    if (handleChange) {
      if (!HANDLE_RE.test(h)) return fail(400, HANDLE_HINT);
      const own = ADMIN_HANDLES.includes(String(u.uname).toLowerCase());
      if (ADMIN_HANDLES.includes(h) && !own) return fail(409, `Юзернейм @${h} уже занят.`);
      const taken = await env.DB.prepare('SELECT id FROM users WHERE uname = ?').bind(h).first();
      if (taken && taken.id !== u.id) return fail(409, `Юзернейм @${h} уже занят.`);
    }
    if (nameChange && !NAME_RE.test(name)) return fail(400, NAME_HINT);
    const writes = [];
    if (mailChange) writes.push(env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(mail, u.id));
    if (handleChange) writes.push(env.DB.prepare('UPDATE users SET uname = ? WHERE id = ?').bind(h, u.id));
    if (nameChange) writes.push(env.DB.prepare('UPDATE users SET username = ?, nkey = ? WHERE id = ?').bind(name, name.toLowerCase(), u.id));
    if (!writes.length) return json({ ok: true, handle: u.uname, username: u.username });
    await env.DB.batch(writes);
    if (mailChange) await adminLog(env, request, me, `email @${u.uname}`, true);
    if (handleChange || nameChange) await adminLog(env, request, me, `rename @${u.uname} → @${handleChange ? h : u.uname}${nameChange ? ' «' + name + '»' : ''}`, true);
    return json({ ok: true, handle: handleChange ? h : u.uname, username: nameChange ? name : u.username });
  },
  async 'POST /admin/delete/:id'({ env, request, me, arg }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const { confirm } = await readBody(request);
    const u = await env.DB.prepare('SELECT id, uname, username FROM users WHERE id = ?').bind(arg).first();
    if (!u) return fail(404, 'Нет такого аккаунта.');
    if (u.id === me.id || (await isAdminAccount(env, u))) return fail(400, 'Админа удалить нельзя.');
    if (cleanHandle(confirm) !== u.uname) return fail(400, `Чтобы удалить, впиши его юзернейм @${u.uname}.`);
    const id = u.id;
    await env.DB.batch([
      'DELETE FROM sessions WHERE user_id = ?1',
      'DELETE FROM shelves WHERE user_id = ?1',
      'DELETE FROM tierlists WHERE user_id = ?1',
      'DELETE FROM lots WHERE user_id = ?1 OR room_id IN (SELECT id FROM lot_rooms WHERE owner_id = ?1)',
      'DELETE FROM lot_rooms WHERE owner_id = ?1',
      'DELETE FROM photos WHERE user_id = ?1',
      'DELETE FROM friendships WHERE a = ?1 OR b = ?1',
      'DELETE FROM reactions WHERE owner_id = ?1 OR from_id = ?1',
      'DELETE FROM comments WHERE owner_id = ?1 OR from_id = ?1',
      'DELETE FROM shares WHERE owner_id = ?1',
      'DELETE FROM users WHERE id = ?1',
    ].map((q) => env.DB.prepare(q).bind(id)));
    await adminLog(env, request, me, `delete account @${u.uname} «${u.username}»`, true);
    return json({ ok: true });
  },
  // выкинуть со всех устройств (например, если пароль утёк): все сессии аккаунта удаляются
  async 'POST /admin/kick/:id'({ env, request, me, arg }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const u = await env.DB.prepare('SELECT id, uname FROM users WHERE id = ?').bind(arg).first();
    if (!u) return fail(404, 'Нет такого аккаунта.');
    if (u.id === me.id || (await isAdminAccount(env, u))) return fail(400, 'Админа выкинуть нельзя.');
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
    await adminLog(env, request, me, 'kick ' + u.uname, true);
    return json({ ok: true });
  },
  async 'GET /admin/comments'({ env, request, me }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.owner_id, c.target, c.from_id, c.text, c.at, f.username AS fname, f.uname AS fhandle, o.username AS oname, o.uname AS ohandle
         FROM comments c LEFT JOIN users f ON f.id = c.from_id LEFT JOIN users o ON o.id = c.owner_id ORDER BY c.at DESC LIMIT 100`
    ).all();
    return json({ items: results.map((x) => ({ id: x.id, text: x.text, at: x.at, where: x.target === 'wall' ? 'wall' : x.target.startsWith('t.') ? 'tier' : 'rating', from: { id: x.from_id, username: x.fname || '?', handle: x.fhandle || '' }, owner: { id: x.owner_id, username: x.oname || '?', handle: x.ohandle || '' } })) });
  },
  async 'DELETE /admin/comment/:id'({ env, request, me, arg }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const c = await env.DB.prepare('SELECT text FROM comments WHERE id = ?').bind(arg).first();
    await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(arg).run();
    await adminLog(env, request, me, 'delete comment ' + (c ? String(c.text).slice(0, 50) : arg), !!c);
    return json({ ok: true });
  },
  // объявление: плашка вверху у всех на сайте (приходит вместе с /ping); пустой текст — убрать
  async 'GET /admin/announce'({ env, request, me }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'announce'").first();
    let v = null; try { v = r ? JSON.parse(r.v) : null; } catch (e) {}
    return json({ announce: v });
  },
  async 'PUT /admin/announce'({ env, request, me }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const { text, kind, hours } = await readBody(request);
    const t = clip(String(text || '').replace(/\s+/g, ' ').trim(), 280);
    if (!t) await env.DB.prepare("DELETE FROM meta WHERE k = 'announce'").run();
    else {
      const h = Math.max(0, Math.min(24 * 30, +hours || 0));
      const v = { id: randHex(6), text: t, kind: ['info', 'warn', 'party'].includes(kind) ? kind : 'info', at: Date.now(), until: h ? Date.now() + h * 3600e3 : 0, by: me.handle };
      await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('announce', ?)").bind(JSON.stringify(v)).run();
    }
    announceCache.at = 0;
    await adminLog(env, request, me, t ? 'announce: ' + t.slice(0, 60) : 'announce off', true);
    return json({ ok: true });
  },
  async 'GET /admin/log'({ env, request, me }) {
    if (!(await adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
    const { results } = await env.DB.prepare('SELECT l.at, l.ip, l.action, l.ok, u.uname FROM admin_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.at DESC LIMIT 60').all();
    return json({ items: results.map((x) => ({ at: x.at, handle: x.uname || '', action: x.action, ok: !!x.ok, ip: x.ip ? String(x.ip).replace(/(\d+\.\d+)\.\d+\.\d+$/, '$1.*.*').replace(/^([0-9a-f]+:[0-9a-f]+):.*$/i, '$1:…') : '' })) });
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
    if (mailChange && (!NEW_MAIL_RE.test(mail) || mail.length > 120)) return fail(400, 'Нужна почта, например name@mail.com.');
    if (handleChange && !HANDLE_RE.test(h)) return fail(400, HANDLE_HINT);
    if (handleChange && reservedHandle(env, h, me) && !(await env.DB.prepare('SELECT 1 FROM admins WHERE user_id = ? AND handle = ?').bind(me.id, h).first())) return fail(409, `Юзернейм @${h} уже занят.`);
    if (nameChange && !NAME_RE.test(name)) return fail(400, NAME_HINT);
    if (pass && weakPass(pass)) return fail(400, WEAK_PASS);
    if (pass || mailChange) {
      const wait = await bump(env, 'acc:' + me.id, 'loginAcc');
      if (wait) return tooMany(wait);
      const cur = String(current || '');
      const row = await env.DB.prepare('SELECT pass_hash, salt FROM users WHERE id = ?').bind(me.id).first();
      if (!row || cur.length > 200 || !sameHex(await hashPass(cur, row.salt), row.pass_hash)) {
        return fail(403, current ? 'Текущий пароль не подходит.' : 'Чтобы сменить почту или пароль, впиши текущий пароль.');
      }
      await env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind('acc:' + me.id).run();
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
      await env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(me.id).run();
    }
    return json({ user: ownUser(out) });
  },

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
    const sentToken = /^Bearer /.test(request.headers.get('authorization') || '');
    return json({ online: Math.max(onlineCache.n, me ? 1 : 0), friends, incoming, window: ONLINE_MS, announce: await currentAnnounce(env), ...(sentToken ? { authed: !!me } : {}) });
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
  // профиль по имени: /u/<@юзернейм или ник>. Сначала точный @юзернейм, потом ник; одинаковых ников — список на выбор
  async 'GET /users/resolve'({ env, request, me }) {
    if (burst('resolve:' + me.id, 60, 60e3)) return tooMany(1);
    const raw = String(new URL(request.url).searchParams.get('q') || '').trim().slice(0, 40);
    if (!raw) return fail(400, 'Нужен @юзернейм или ник.');
    const h = cleanHandle(raw);
    const byHandle = HANDLE_RE.test(h) ? await env.DB.prepare('SELECT id, username, uname FROM users WHERE uname = ?').bind(h).first() : null;
    if (byHandle) return json({ user: pubUser(byHandle) });
    const { results } = await env.DB.prepare('SELECT id, username, uname FROM users WHERE nkey = ? ORDER BY created_at LIMIT 8').bind(cleanName(raw).toLowerCase()).all();
    if (results.length === 1) return json({ user: pubUser(results[0]) });
    if (results.length > 1) return json({ users: results.map(pubUser) });
    return fail(404, `Нет никого с юзернеймом или ником «${clip(raw, 40)}».`);
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
    if (burst('shelf:' + me.id, 40, 60e3)) return tooMany(1);
    const { ratings, deleted, cats, profile, sticker, layout } = await readBody(request);
    if (!Array.isArray(ratings)) return fail(400, 'Нужен список оценок.');
    const row = await env.DB.prepare('SELECT data, updated_at FROM shelves WHERE user_id = ?').bind(me.id).first();
    const old = readShelf(row);
    const del = new Map(old.deleted.map((d) => [d.id, d.at]));
    for (const d of Array.isArray(deleted) ? deleted : []) {
      // отметка из будущего (сбитые часы) навсегда не дала бы вернуть оценку: не позже, чем сейчас
      if (d && typeof d.id === 'string' && d.id.length <= 120 && Number.isFinite(+d.at)) del.set(d.id, Math.max(del.get(d.id) || 0, Math.min(+d.at, Date.now())));
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
    // «оценки обновлены» — это когда менялись сами оценки, а не когда человек просто открыл сайт:
    // ничего не поменялось — не пишем вовсе; оценки поменялись — ставим время самой свежей оценки (её поставили, может, ночью без интернета)
    const now = Date.now();
    let updated = row ? +row.updated_at || now : now;
    if (!row || row.data !== data) {
      const sameRatings = row && JSON.stringify(old.ratings) === JSON.stringify(shelfData.ratings) && JSON.stringify(old.deleted) === JSON.stringify(shelfData.deleted);
      if (!sameRatings) {
        const newest = Math.max(0, ...shelfData.ratings.map(stampOf), ...(shelfData.deleted || []).map((d) => +d.at || 0));
        updated = Math.min(now, newest || now);
        if (row && updated < +row.updated_at) updated = +row.updated_at; // время не идёт назад
      }
      await env.DB.prepare(
        'INSERT INTO shelves (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
      ).bind(me.id, data, updated).run();
    }
    // фото стираем только у оценок, удалённых в этот раз, а не у всех прежних
    const oldDel = new Set(old.deleted.map((d) => d.id));
    const live = new Set(merged.map((r) => r.id));
    const gone = tomb.filter((d) => !oldDel.has(d.id) && !live.has(d.id)).map((d) => d.id).slice(0, 100);
    if (gone.length) {
      // вместе с фото уходит и его превью «<id>.t»
      await env.DB.batch(gone.flatMap((id) => [`${me.id}:${id}`, `${me.id}:${id}.t`].map((k) => env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(k))
        .concat(env.DB.prepare('DELETE FROM shares WHERE owner_id = ? AND rid = ?').bind(me.id, id)) // и ссылка на отзыв закрывается
        .concat(env.DB.prepare('DELETE FROM reactions WHERE owner_id = ? AND rid = ?').bind(me.id, id)) // и реакции
        .concat(env.DB.prepare('DELETE FROM comments WHERE owner_id = ? AND target = ?').bind(me.id, 'r.' + id)))); // и ветка комментариев под ней
    }
    return json({ ok: true, updatedAt: updated, count: merged.length, catsAt: catsOut ? catsOut.at : null });
  },

  async 'GET /shelf/:id'({ env, me, arg }) {
    if (!(await canSee(env, me, arg))) return fail(403, 'Оценки видны только друзьям.');
    const row = await env.DB.prepare('SELECT id, username, uname, created_at, last_seen, hide_online FROM users WHERE id = ?').bind(arg).first();
    if (!row) return fail(404, 'Пользователь не найден.');
    // число друзей — для значка «Душа компании»
    const fc = await env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(arg).first();
    const user = { ...pubUser(row), createdAt: row.created_at || null, friends: fc ? fc.n : 0, lastSeen: row.hide_online ? null : row.last_seen || null };
    if (await env.DB.prepare('SELECT 1 FROM admins WHERE user_id = ?').bind(row.id).first()) user.admin = true;
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
    // причину отказа видно только в логах функции: посетителю незачем знать, какие у сайта ключи
    let artists = [], why = env.GENIUS_TOKEN ? '' : 'нет ключа';
    if (env.GENIUS_TOKEN && Date.now() >= geniusPause) {
      try {
        const res = await geniusFetch(env, 'https://api.genius.com/search?q=' + encodeURIComponent(q), 86400);
        if (res.status === 429) geniusPause = Date.now() + 60e3; // минуту не дёргаем Genius
        if (!res.ok) why = 'ответ ' + res.status;
        else artists = geniusArtists(await res.json());
      } catch (e) { why = 'нет ответа'; }
    } else if (env.GENIUS_TOKEN) why = 'пауза после 429';
    if (!artists.length) {
      try {
        const res = await geniusFetch(env, 'https://api.deezer.com/search/artist?limit=8&q=' + encodeURIComponent(q), 86400);
        if (res.ok) artists = deezerArtists(await res.json(), q);
      } catch (e) {}
    }
    if (!artists.length && why) {
      console.error('Genius: ' + why);
      return fail(502, 'Поиск исполнителей сейчас не отвечает, попробуй позже.');
    }
    return json({ artists });
  },
  // имена исполнителей для подсказки при вводе: Deezer прощает опечатки («deathmerie» → deathmarried)
  async 'GET /music/artists'({ request, me }) {
    if (burst('martists:' + me.id, 60, 60e3)) return tooMany(1);
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return json({ artists: [] });
    try {
      const d = await cachedJson('https://api.deezer.com/search/artist?limit=8&q=' + encodeURIComponent(q), null, 86400);
      // у исполнителей без фото Deezer отдаёт заглушку с адресом «…/artist//…»
      // профили почти без слушателей — это обычно не настоящие исполнители; точное совпадение с именем всё равно показываем
      const artists = (d.data || []).filter((a) => a && a.name && (+a.nb_fan >= 100 || String(a.name).toLowerCase() === q.toLowerCase())).map((a) => ({
        name: String(a.name).slice(0, 80),
        img: DZ_IMG.test(a.picture_medium || '') && !/\/artist\/\//.test(a.picture_medium) ? a.picture_medium : '',
        fans: +a.nb_fan || 0,
      }));
      return json({ artists });
    } catch (e) { return json({ artists: [] }); }
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
  // подробности выбранной обложки: русское название и основные жанры (фильмы — Wikidata по коду IMDb, игры — Steam)
  async 'GET /covers/info'({ request, me }) {
    if (burst('cinfo:' + me.id, 60, 60e3)) return tooMany(1);
    const sp = new URL(request.url).searchParams;
    const kind = sp.get('kind') || '', id = sp.get('id') || '';
    try {
      if (kind === 'movie' && /^tt\d{5,10}$/.test(id)) return json(await filmInfo(id));
      if (kind === 'game' && /^\d{1,9}$/.test(id)) return json(await gameInfo(id));
    } catch (e) {
      return fail(502, 'Подробности сейчас не отвечают');
    }
    return json({ ru: '', genres: [] });
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
        res = await fetch(u.href, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; CasualHub/1.0; +https://casualhub.pages.dev)', accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.5' } });
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
    let buf;
    try { buf = await readCapped(res, 6e6); } catch (e) { return fail(502, 'Сайт с картинкой не ответил'); }
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
    // за сутки на человека и на адрес: один аккаунт не должен за минуты забить базу, общую на всех
    const over = Math.max(await spend(env, 'photo:' + me.id, data.length, PHOTO_DAY_USER), await spend(env, 'photoip:' + clientIp(request), data.length, PHOTO_DAY_IP));
    if (over) return new Response(JSON.stringify({ error: 'На сегодня лимит загрузки фото исчерпан. Остальные дойдут завтра сами.' }), { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(over * 60) } });
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
  // ---------- тир-листы: свои видит хозяин, остальные — только друзья, и только те, что не скрыты ----------
  // что лежит в аккаунте и что удалено; сами тир-листы устройство докачивает по одному
  async 'GET /tierlists'({ env, me }) {
    const { results } = await env.DB.prepare('SELECT id, at, data IS NULL AS gone FROM tierlists WHERE user_id = ?').bind(me.id).all();
    return json({ items: results.filter((x) => !x.gone).map(({ id, at }) => ({ id, at })), deleted: results.filter((x) => x.gone).map(({ id, at }) => ({ id, at })) });
  },
  async 'GET /tierlists-feed'({ env, me }) {
    if (burst('tierfeed:' + me.id, 60, 60e3)) return tooMany(1);
    const { results: fr } = await env.DB.prepare(
      "SELECT CASE WHEN f.a = ?1 THEN f.b ELSE f.a END AS id, u.username, u.uname FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ?1 THEN f.b ELSE f.a END) WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted'"
    ).bind(me.id).all();
    if (!fr.length) return json({ friends: 0, items: [] });
    const ids = fr.slice(0, 90).map((x) => x.id);
    const people = new Map(fr.map((x) => [x.id, pubUser(x)]));
    const { results } = await env.DB.prepare(`SELECT user_id, id, meta, at FROM tierlists WHERE user_id IN (${ids.map(() => '?').join(',')}) AND data IS NOT NULL AND private = 0 ORDER BY at DESC LIMIT 60`).bind(...ids).all();
    const items = [];
    for (const x of results) {
      try { items.push({ ...JSON.parse(x.meta), id: x.id, at: x.at, user: people.get(x.user_id) }); } catch (e) {}
    }
    return json({ friends: fr.length, items });
  },
  async 'GET /tierlist/:uid/:id'({ env, me, arg }) {
    const [uid, id] = arg;
    if (!(await canSee(env, me, uid))) return fail(403, 'Тир-листы видны только друзьям.');
    const row = await env.DB.prepare('SELECT data, private, at FROM tierlists WHERE user_id = ? AND id = ?').bind(uid, id).first();
    if (!row || row.data == null || (row.private && uid !== me.id)) return fail(404, 'Тир-лист не найден: его удалили или скрыли.');
    const u = await env.DB.prepare('SELECT id, username, uname FROM users WHERE id = ?').bind(uid).first();
    if (!u) return fail(404, 'Тир-лист не найден: его удалили или скрыли.');
    return json({ list: { ...JSON.parse(row.data), at: row.at }, user: pubUser(u) });
  },
  async 'PUT /tierlist/:id'({ env, request, me, arg }) {
    if (burst('tier:' + me.id, 60, 60e3)) return tooMany(1);
    const { list: raw } = await readBody(request);
    const list = cleanTierList(raw, arg);
    if (!list) return fail(400, 'Это не тир-лист.');
    const now = Date.now();
    const at = Math.min(Number.isFinite(+list.at) && +list.at > 0 ? +list.at : now, now); // сбитые часы не держат тир-лист «новее всех» навсегда
    list.at = at;
    const data = JSON.stringify(list);
    if (data.length > MAX_TIER) return fail(413, 'В тир-листе слишком много данных.');
    const old = await env.DB.prepare('SELECT data, at FROM tierlists WHERE user_id = ? AND id = ?').bind(me.id, arg).first();
    // на сервере версия не старше: устройство её заберёт, а если тир-лист удалён, удалит у себя
    if (old && at <= old.at) return json({ ok: true, stale: true, gone: old.data == null, at: old.at });
    if (!old || old.data == null) {
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM tierlists WHERE user_id = ? AND data IS NOT NULL').bind(me.id).first();
      if (c && c.n >= MAX_TIERS) return fail(413, `Слишком много тир-листов в аккаунте (больше ${MAX_TIERS}). Удали старые.`);
    }
    // картинки, которых в тир-листе больше нет, стираем сразу: на другом устройстве они уже не понадобятся
    const keep = new Set(tierImgs(list));
    const dropped = old && old.data ? tierImgs(JSON.parse(old.data)).filter((k) => !keep.has(k)).slice(0, 200) : [];
    await env.DB.batch([
      env.DB.prepare('INSERT INTO tierlists (user_id, id, data, meta, private, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET data = excluded.data, meta = excluded.meta, private = excluded.private, at = excluded.at')
        .bind(me.id, arg, data, JSON.stringify(tierMeta(list)), list.private ? 1 : 0, at),
      ...dropped.map((k) => env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(`${me.id}:${k}`)),
    ]);
    return json({ ok: true, at });
  },
  async 'DELETE /tierlist/:id'({ env, request, me, arg }) {
    if (burst('tier:' + me.id, 60, 60e3)) return tooMany(1);
    const now = Date.now();
    const asked = +new URL(request.url).searchParams.get('at');
    const at = Math.min(Number.isFinite(asked) && asked > 0 ? asked : now, now);
    const old = await env.DB.prepare('SELECT data, at FROM tierlists WHERE user_id = ? AND id = ?').bind(me.id, arg).first();
    if (old && old.data != null && old.at > at) return json({ ok: true, stale: true, at: old.at }); // на другом устройстве его правили позже
    const imgs = old && old.data ? tierImgs(JSON.parse(old.data)).slice(0, 500) : [];
    await env.DB.batch([
      env.DB.prepare('INSERT INTO tierlists (user_id, id, data, meta, private, at) VALUES (?, ?, NULL, NULL, 0, ?) ON CONFLICT(user_id, id) DO UPDATE SET data = NULL, meta = NULL, private = 0, at = excluded.at').bind(me.id, arg, at),
      // отметки об удалении старше полугода больше не нужны: все устройства давно синхронизировались
      env.DB.prepare('DELETE FROM tierlists WHERE user_id = ? AND data IS NULL AND at < ?').bind(me.id, now - 183 * 864e5),
      env.DB.prepare('DELETE FROM comments WHERE owner_id = ? AND target = ?').bind(me.id, 't.' + arg),
      env.DB.prepare('DELETE FROM reactions WHERE owner_id = ? AND rid = ?').bind(me.id, 't.' + arg),
      env.DB.prepare('DELETE FROM shares WHERE owner_id = ? AND rid = ?').bind(me.id, 't.' + arg),
      ...imgs.map((k) => env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(`${me.id}:${k}`)),
    ]);
    return json({ ok: true, at });
  },
  // ссылка на тир-лист: открывается у всех, у кого она есть, даже если тир-лист скрыт от друзей. Закрывается через DELETE /share/:id
  async 'POST /tierlist-share'({ env, request, me }) {
    if (burst('share:' + me.id, 30, 600e3)) return tooMany(10);
    const { id } = await readBody(request);
    if (typeof id !== 'string' || !TIER_ID_RE.test(id)) return fail(400, 'Нет такого тир-листа.');
    const row = await env.DB.prepare('SELECT 1 FROM tierlists WHERE user_id = ? AND id = ? AND data IS NOT NULL').bind(me.id, id).first();
    if (!row) return fail(404, 'Тир-лист ещё не дошёл до сервера. Подожди пару секунд и попробуй снова.');
    const rid = 't.' + id;
    const had = await env.DB.prepare('SELECT id FROM shares WHERE owner_id = ? AND rid = ?').bind(me.id, rid).first();
    if (had) return json({ id: had.id });
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares WHERE owner_id = ?').bind(me.id).first();
    if (c && c.n >= 500) return fail(413, 'Слишком много открытых ссылок. Закрой старые.');
    const sid = shareId();
    await env.DB.prepare('INSERT INTO shares (id, owner_id, rid, created_at) VALUES (?, ?, ?, ?)').bind(sid, me.id, rid, Date.now()).run();
    return json({ id: sid });
  },
  // картинка карточки: квадрат 240×240, ключ придумывает браузер
  async 'PUT /tierlist-img/:key'({ env, request, me, arg }) {
    if (burst('tierimg:' + me.id, 120, 60e3)) return tooMany(1);
    const { data } = await readBody(request);
    if (typeof data !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(data)) return fail(400, 'Нужна картинка.');
    if (data.length > MAX_TIER_IMG) return fail(413, 'Картинка слишком большая.');
    const key = `${me.id}:${arg}`;
    if (!(await env.DB.prepare('SELECT 1 FROM photos WHERE key = ?').bind(key).first())) {
      // ключи «<id>:ti_…» идут подряд: считаем только их, по первичному ключу
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE key >= ? AND key < ?').bind(`${me.id}:ti_`, `${me.id}:ti\``).first();
      if (c && c.n >= MAX_TIER_IMGS) return fail(413, 'Слишком много картинок в тир-листах аккаунта. Новые останутся только на этом устройстве.');
    }
    const over = Math.max(await spend(env, 'photo:' + me.id, data.length, PHOTO_DAY_USER), await spend(env, 'photoip:' + clientIp(request), data.length, PHOTO_DAY_IP));
    if (over) return new Response(JSON.stringify({ error: 'На сегодня лимит загрузки фото исчерпан. Остальные дойдут завтра сами.' }), { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(over * 60) } });
    await env.DB.prepare('INSERT INTO photos (key, user_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(key, me.id, data, Date.now()).run();
    return json({ ok: true });
  },
  // несколько картинок за раз: тир-лист из сотни карточек не должен делать сотню запросов
  async 'POST /tierlist-imgs/:uid'({ env, request, me, arg }) {
    if (burst('tierimgs:' + me.id, 240, 60e3)) return tooMany(1);
    if (!(await canSee(env, me, arg))) return fail(403, 'Картинки видны только друзьям.');
    const { keys } = await readBody(request);
    const list = (Array.isArray(keys) ? keys : []).filter((k) => typeof k === 'string' && TIER_IMG_RE.test(k)).slice(0, 40);
    if (!list.length) return json({ images: {} });
    const { results } = await env.DB.prepare(`SELECT key, data FROM photos WHERE key IN (${list.map(() => '?').join(',')})`).bind(...list.map((k) => `${arg}:${k}`)).all();
    return json({ images: Object.fromEntries(results.map((x) => [x.key.slice(arg.length + 1), x.data])) });
  },
  // ---------- лоты по ссылке: ведущий открывает сбор и выбирает категорию, зрители добавляют лоты, у каждого свой лимит ----------
  // игры для сбора: Steam и Википедия, там есть и то, чего нет в Steam
  async 'GET /games/search'({ request, me }) {
    if (burst('steam:' + me.id, 60, 60e3)) return tooMany(1);
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
    if (q.length < 2) return json({ items: [] });
    const ru = CYR.test(q);
    const names = ru ? await latinTitles(q, 'game').catch(() => []) : [];
    const lists = await Promise.allSettled([steamGames(q), ...names.map(steamGames), wikiGames(q, ru ? 'ru' : 'en'), ...names.map((t) => wikiGames(t, 'en'))]);
    if (lists.every((x) => x.status === 'rejected')) return fail(502, 'Поиск игр сейчас не отвечает, попробуй ещё раз.');
    const seen = new Set(), items = [];
    for (const l of lists) for (const x of l.status === 'fulfilled' ? l.value : []) { const k = lotKey(x.name); if (k && !seen.has(k)) { seen.add(k); items.push(x); } }
    // точное совпадение первым, чтобы по «world of warcraft» сверху был он сам
    const want = [lotKey(q), ...names.map(lotKey)];
    return json({ items: items.sort((a, b) => want.includes(lotKey(b.name)) - want.includes(lotKey(a.name))).slice(0, 10) });
  },
  // своя картинка ведущего в центре колеса: одна на аккаунт, зрителям она видна, пока стоит на его колесе
  async 'PUT /lots-hub'({ env, request, me }) {
    if (burst('lothub:' + me.id, 30, 60e3)) return tooMany(1);
    const { data } = await readBody(request);
    if (typeof data !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(data)) return fail(400, 'Нужна картинка.');
    if (data.length > MAX_PHOTO) return fail(413, 'Картинка слишком большая.');
    const over = Math.max(await spend(env, 'photo:' + me.id, data.length, PHOTO_DAY_USER), await spend(env, 'photoip:' + clientIp(request), data.length, PHOTO_DAY_IP));
    if (over) return fail(429, 'На сегодня лимит загрузки фото исчерпан.');
    await env.DB.prepare('INSERT INTO photos (key, user_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(`${me.id}:lothub`, me.id, data, Date.now()).run();
    return json({ ok: true });
  },
  async 'DELETE /lots-hub'({ env, me }) {
    await env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(`${me.id}:lothub`).run();
    return json({ ok: true });
  },
  async 'POST /lots'({ env, request, me }) {
    if (burst('lotnew:' + me.id, 20, 600e3)) return tooMany(10);
    const b = await readBody(request);
    const now = Date.now();
    const id = shareId();
    // старые сборы остаются со своими ссылками; убираем только самые давние сверх лимита
    const old = await env.DB.prepare('SELECT id FROM lot_rooms WHERE owner_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?').bind(me.id, MAX_LOT_ROOMS - 1).all();
    await env.DB.batch([
      ...old.results.flatMap((x) => [env.DB.prepare('DELETE FROM lots WHERE room_id = ?').bind(x.id), env.DB.prepare('DELETE FROM lot_rooms WHERE id = ?').bind(x.id)]),
      env.DB.prepare('INSERT INTO lot_rooms (id, owner_id, title, kind, per_user, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, me.id, lotTitle(b.title), LOT_KINDS.includes(b.kind) ? b.kind : 'game', lotLimit(b.perUser), lotEnds(b.minutes, now), now),
    ]);
    return lotAnswer(env, id, me);
  },
  async 'GET /lots-mine'({ env, me }) {
    const { results } = await env.DB.prepare('SELECT r.id, r.title, r.kind, r.per_user, r.ends_at, r.closed, r.live, r.created_at, (SELECT COUNT(*) FROM lots l WHERE l.room_id = r.id) AS n FROM lot_rooms r WHERE r.owner_id = ? ORDER BY r.created_at DESC LIMIT ?').bind(me.id, MAX_LOT_ROOMS).all();
    return json({ now: Date.now(), rooms: results.map((x) => {
      let winner = '';
      try { const l = x.live ? JSON.parse(x.live) : null; winner = (l && l.winner && l.winner.n) || ''; } catch (e) {}
      return { id: x.id, title: x.title, kind: x.kind, perUser: x.per_user, endsAt: x.ends_at, closed: !!x.closed, createdAt: x.created_at, n: x.n, winner };
    }) });
  },
  // открывается и без входа: посмотреть на колесо можно всем, у кого есть ссылка
  async 'GET /lots/:code'({ env, request, arg }) {
    if (burst('lotget:' + clientIp(request), 1500, 60e3)) return tooMany(1);
    let me = null;
    try { me = await currentUser(env, request); } catch (e) {}
    const v = new URL(request.url).searchParams.get('v');
    return lotAnswer(env, arg, me && !me.banned ? me : null, v);
  },
  async 'POST /lots/:code'({ env, request, me, arg }) {
    if (burst('lotadd:' + me.id, 30, 60e3)) return tooMany(1);
    const room = await env.DB.prepare('SELECT * FROM lot_rooms WHERE id = ?').bind(arg).first();
    if (!room) return fail(404, 'Такого сбора нет.');
    const now = Date.now();
    if (room.closed) return fail(403, 'Сбор закрыт, больше добавлять нельзя.');
    if (room.ends_at && now >= room.ends_at) return fail(403, 'Время вышло, больше добавлять нельзя.');
    const b = await readBody(request);
    let lot;
    try { lot = await lotItem(room.kind, b); }
    catch (e) { return fail(502, 'Поиск сейчас не отвечает, попробуй ещё раз.'); }
    if (lot.error) return fail(lot.status || 400, lot.error);
    // одна и та же игра могла прийти из разных источников
    if (room.kind === 'game') {
      const { results } = await env.DB.prepare('SELECT name FROM lots WHERE room_id = ?').bind(arg).all();
      if (results.some((x) => lotKey(x.name) === lotKey(lot.name))) return fail(409, 'Это уже добавили.');
    }
    const r = await env.DB.prepare(`INSERT INTO lots (room_id, id, user_id, ref, name, img, link, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE (SELECT COUNT(*) FROM lots WHERE room_id = ?1 AND user_id = ?3) < ?9 AND (SELECT COUNT(*) FROM lots WHERE room_id = ?1) < ?10
      ON CONFLICT(room_id, ref) DO NOTHING`).bind(arg, randHex(8), me.id, lot.ref, lot.name, lot.img, lot.link, now, room.per_user, MAX_LOTS).run();
    if (!r.meta.changes) {
      const has = await env.DB.prepare('SELECT 1 FROM lots WHERE room_id = ? AND ref = ?').bind(arg, lot.ref).first();
      if (has) return fail(409, 'Это уже добавили.');
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM lots WHERE room_id = ?').bind(arg).first();
      return fail(403, c.n >= MAX_LOTS ? 'В этом сборе уже слишком много лотов.' : `Больше добавить нельзя: лимит ${room.per_user} на человека.`);
    }
    await env.DB.prepare('UPDATE lot_rooms SET ver = ver + 1 WHERE id = ?').bind(arg).run();
    return lotAnswer(env, arg, me);
  },
  // ведущий: лимит, время, закрыть или открыть снова
  async 'PATCH /lots/:code'({ env, request, me, arg }) {
    if (burst('lotroom:' + me.id, 120, 600e3)) return tooMany(10);
    const room = await env.DB.prepare('SELECT * FROM lot_rooms WHERE id = ? AND owner_id = ?').bind(arg, me.id).first();
    if (!room) return fail(404, 'Такого сбора нет.');
    const b = await readBody(request);
    const now = Date.now();
    let ends = room.ends_at, closed = room.closed;
    if (b.minutes !== undefined) { ends = lotEnds(b.minutes, now); closed = 0; }
    if (b.extra !== undefined) {
      const extra = Math.max(-1440, Math.min(1440, Math.round(+b.extra) || 0));
      // отнять можно только у идущего таймера: время кончается не раньше, чем сейчас
      if (extra > 0) { ends = Math.max(room.ends_at || now, now) + extra * 60e3; closed = 0; }
      else if (extra < 0 && room.ends_at) ends = Math.max(now, room.ends_at + extra * 60e3);
    }
    if (typeof b.closed === 'boolean') closed = b.closed ? 1 : 0;
    await env.DB.prepare('UPDATE lot_rooms SET per_user = ?, title = ?, ends_at = ?, closed = ?, ver = ver + 1 WHERE id = ?')
      .bind(b.perUser !== undefined ? lotLimit(b.perUser) : room.per_user, b.title !== undefined ? lotTitle(b.title) : room.title, ends, closed, arg).run();
    return lotAnswer(env, arg, me);
  },
  async 'DELETE /lots/:code'({ env, me, arg }) {
    const room = await env.DB.prepare('SELECT 1 FROM lot_rooms WHERE id = ? AND owner_id = ?').bind(arg, me.id).first();
    if (!room) return fail(404, 'Такого сбора нет.');
    await env.DB.batch([env.DB.prepare('DELETE FROM lots WHERE room_id = ?').bind(arg), env.DB.prepare('DELETE FROM lot_rooms WHERE id = ?').bind(arg)]);
    return json({ ok: true });
  },
  // что сейчас на колесе у ведущего: зрители рисуют то же самое
  async 'GET /lots/:code/hub'({ env, request, arg }) {
    if (burst('lothubget:' + clientIp(request), 240, 60e3)) return new Response(null, { status: 429 });
    const room = await env.DB.prepare('SELECT r.owner_id, r.live, u.banned FROM lot_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?').bind(arg).first();
    if (!room || room.banned) return new Response(null, { status: 404 });
    let own = '';
    try { own = (JSON.parse(room.live || 'null') || {}).hubOwn; } catch (e) {}
    if (!own) return new Response(null, { status: 404 });
    const row = await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${room.owner_id}:lothub`).first();
    const m = row && /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+=*)$/.exec(row.data);
    if (!m) return new Response(null, { status: 404 });
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
  },
  async 'PUT /lots/:code/live'({ env, request, me, arg }) {
    if (burst('lotlive:' + me.id, 240, 60e3)) return tooMany(1);
    const live = cleanLive(await readBody(request));
    const data = JSON.stringify(live);
    if (data.length > 60000) return fail(413, 'Слишком много лотов на колесе.');
    const r = await env.DB.prepare('UPDATE lot_rooms SET live = ? WHERE id = ? AND owner_id = ?').bind(data, arg, me.id).run();
    if (!r.meta.changes) return fail(404, 'Такого сбора нет.');
    return json({ ok: true });
  },
  // поиск треков и альбомов по названию: только лицензионные каталоги, где исполнители настоящие
  async 'GET /music/search'({ env, request, me }) {
    if (burst('msearch:' + me.id, 40, 60e3)) return tooMany(1);
    const sp = new URL(request.url).searchParams;
    const q = (sp.get('q') || '').trim().slice(0, 100);
    if (q.length < 2) return json({ items: [] });
    return json({ items: await musicSearch(env, q, sp.get('kind') === 'album') });
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
    const sh = await env.DB.prepare('SELECT s.owner_id, s.rid, u.banned FROM shares s LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = ?').bind(arg).first();
    if (!sh || sh.banned) return new Response(null, { status: 404 });
    let row;
    if (sh.rid.startsWith('t.')) {
      // картинка тир-листа: отдаём только те, что есть в этом тир-листе
      const k = new URL(request.url).searchParams.get('k') || '';
      const tl = await env.DB.prepare('SELECT data FROM tierlists WHERE user_id = ? AND id = ?').bind(sh.owner_id, sh.rid.slice(2)).first();
      if (!tl || tl.data == null || !tierImgs(JSON.parse(tl.data)).includes(k)) return new Response(null, { status: 404 });
      row = await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${sh.owner_id}:${k}`).first();
    } else {
      row = (await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${sh.owner_id}:${sh.rid}.t`).first())
        || (await env.DB.prepare('SELECT data FROM photos WHERE key = ?').bind(`${sh.owner_id}:${sh.rid}`).first());
    }
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
      // дата из будущего не держит оценку наверху ленты
      list.map((r) => ({ r, at: Math.min(stampOf(r), Date.now()) })).sort((a, b) => b.at - a.at).slice(0, 15).forEach(({ r, at }) => {
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
    // тир-листы друзей и то, что друзья написали под моими
    const { results: tl } = await env.DB.prepare(`SELECT user_id, id, meta, at FROM tierlists WHERE user_id IN (${marks}) AND data IS NOT NULL AND private = 0 ORDER BY at DESC LIMIT 10`).bind(...ids).all();
    for (const x of tl) {
      try { const m = JSON.parse(x.meta); items.push({ kind: 'tier', at: x.at, user: people.get(x.user_id), tier: { id: x.id, title: clip(m.title, 120), count: +m.count || 0 } }); } catch (e) {}
    }
    const { results: myTl } = await env.DB.prepare('SELECT id, meta FROM tierlists WHERE user_id = ? AND data IS NOT NULL').bind(me.id).all();
    const tierName = new Map();
    for (const x of myTl) { try { tierName.set(x.id, clip(JSON.parse(x.meta).title, 120) || 'Без названия'); } catch (e) {} }
    for (const x of mineRx) {
      if (!x.rid.startsWith('t.') || !tierName.has(x.rid.slice(2))) continue;
      items.push({ kind: 'react', at: x.at, user: people.get(x.from_id), react: { rid: x.rid, tier: x.rid.slice(2), name: tierName.get(x.rid.slice(2)), emoji: x.emoji || null, text: x.text || '' } });
    }
    // друзья написали мне: на стене профиля или под моей оценкой
    const { results: mineCm } = await env.DB.prepare(`SELECT target, from_id, text, at FROM comments WHERE owner_id = ? AND from_id IN (${marks}) ORDER BY at DESC LIMIT 15`).bind(me.id, ...ids).all();
    if (mineCm.length) {
      const myShelf = readShelf(await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first());
      const nameOf = new Map(myShelf.ratings.map((r) => [r.id, r.name]));
      for (const x of mineCm) {
        if (x.target.startsWith('t.')) {
          const t = x.target.slice(2);
          if (tierName.has(t)) items.push({ kind: 'comment', at: x.at, user: people.get(x.from_id), comment: { rid: null, tier: t, name: tierName.get(t), text: String(x.text).slice(0, 200) } });
          continue;
        }
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
const PHOTO_DAY_USER = 200e6, PHOTO_DAY_IP = 400e6; // сколько символов фото можно залить за сутки
// сколько оценок на полке: сама база считает длину списка, старый формат полки — просто список
const SHELF_COUNT = "CASE json_type(data) WHEN 'array' THEN json_array_length(data) ELSE COALESCE(json_array_length(data, '$.ratings'), 0) END";
// оформление профиля: до 6 витрин (топ-3/5/10 из темы, лучшие по баллу или выбранные вручную) и видимость блоков
// тир-листы: только ожидаемые поля, чтобы в страницу друга не попало лишнее
const MAX_TIERS = 100, MAX_TIER = 150e3, MAX_TIER_IMG = 200e3, MAX_TIER_IMGS = 800;
const TIER_ID_RE = /^\w{1,40}$/, TIER_IMG_RE = /^ti_\w{1,40}$/, TIER_COLOR_RE = /^#[0-9a-f]{6}$/i;
const TIER_ITEM_RE = /^(?!__proto__$|constructor$|prototype$)[\w.:-]{1,80}$/;
const TIER_SRC_RE = /^\/wheel\/hub\/(?!.*\.\.)[\w\-\/.]{1,120}\.(png|webp|gif|jpe?g)$/i;
function cleanTierList(raw, id) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {};
  const items = {};
  for (const k of Object.keys(src).slice(0, 500)) {
    const it = src[k];
    if (!TIER_ITEM_RE.test(k) || !it || typeof it !== 'object') continue;
    const o = { id: k, name: clip(it.name, 80).trim(), kind: 'text' };
    if (it.kind === 'img' && TIER_IMG_RE.test(String(it.img))) { o.kind = 'img'; o.img = String(it.img); }
    else if (it.kind === 'url' && TIER_SRC_RE.test(String(it.src))) { o.kind = 'url'; o.src = String(it.src); }
    else if (!o.name) continue;
    items[k] = o;
  }
  const seen = new Set();
  const own = (a) => (Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && Object.prototype.hasOwnProperty.call(items, x) && !seen.has(x) && seen.add(x));
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 20).filter((r) => r && typeof r === 'object').map((r) => ({
    id: TIER_ID_RE.test(String(r.id)) ? String(r.id) : randHex(4),
    label: clip(r.label, 40).trim(),
    color: TIER_COLOR_RE.test(String(r.color)) ? String(r.color) : '#9AA0AE',
    items: own(r.items),
  }));
  if (!rows.length) return null;
  const pool = own(raw.pool);
  Object.keys(items).forEach((k) => { if (!seen.has(k)) { seen.add(k); pool.push(k); } });
  return { id, title: clip(raw.title, 80).trim(), rows, pool, items, captions: !!raw.captions, private: !!raw.private, fav: !!raw.fav, at: +raw.at || 0 };
}
const tierImgs = (l) => Object.values((l && l.items) || {}).map((it) => it && it.img).filter((k) => typeof k === 'string' && TIER_IMG_RE.test(k));
// короткое описание для ленты друзей: разбирать сами тир-листы ради карточек в списке было бы дорого
const tierMeta = (l) => ({
  title: l.title, count: Object.keys(l.items).length,
  rows: l.rows.slice(0, 6).map((r) => ({
    label: clip(r.label, 12), color: r.color, n: r.items.length,
    items: r.items.slice(0, 7).map((id) => { const it = l.items[id]; return { name: clip(it.name, 24), ...(it.img ? { img: it.img } : {}), ...(it.src ? { src: it.src } : {}) }; }),
  })),
});

// ---------- лоты по ссылке ----------
const LOT_NAME = 60, MAX_LOTS = 300, MAX_LOT_ROOMS = 30;
const LOT_KINDS = ['game', 'movie', 'anime', 'book', 'music', 'any'];
const lotKey = (v) => String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
async function steamGames(q) {
  const d = await cachedJson('https://store.steampowered.com/api/storesearch/?l=russian&cc=US&term=' + encodeURIComponent(q), null, 86400);
  return (d.items || []).filter((x) => x && x.type === 'app' && Number.isInteger(x.id) && x.name && !/\b(soundtrack|ost|artbook|dlc)\b/i.test(x.name)).slice(0, 8).map((x) => ({ appId: x.id, name: clip(x.name, LOT_NAME), img: httpsOnly(x.tiny_image), sub: 'Steam' }));
}
// только сами игры: без серий, персонажей, студий и турниров
const WIKI_GAME = { en: /\bvideo game(?: (?:by|from|developed|for)\b.*)?$|\bcomputer game$/i, ru: /компьютерная игра|видеоигра/i };
const wikiApi = (lang) => `https://${lang}.wikipedia.org/w/api.php?format=json&action=query&redirects=1&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=500&pilicense=any&`;
function wikiCard(p, lang) {
  if (!p || !p.title || p.missing !== undefined || !WIKI_GAME[lang].test(p.description || '')) return null;
  const year = (/\b(19|20)\d\d\b/.exec(p.description) || [''])[0];
  const base = p.title.replace(/\s*\([^)]*\)\s*$/, '');
  // у одноимённых игр разные годы: Doom (1993) и Doom (2016)
  const name = clip(base !== p.title && year ? `${base} (${year})` : base, LOT_NAME).trim();
  return { wiki: p.title, lang, name, img: httpsOnly(p.thumbnail && p.thumbnail.source), sub: year || 'Игра', link: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` };
}
async function wikiGames(q, lang) {
  const word = lang === 'ru' ? ' компьютерная игра' : ' video game';
  const d = await cachedJson(wikiApi(lang) + 'generator=search&gsrlimit=15&gsrsearch=' + encodeURIComponent(q + word), null, 86400);
  return Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index).map((p) => wikiCard(p, lang)).filter(Boolean).slice(0, 8).map(({ link, ...x }) => x);
}
async function wikiGame(title, lang) {
  const d = await cachedJson(wikiApi(lang) + 'titles=' + encodeURIComponent(clip(title, 200)), null, 86400);
  return Object.values((d.query && d.query.pages) || {}).map((p) => wikiCard(p, lang)).find(Boolean) || null;
}
// что именно добавляют: название и картинку берём из каталога, а не со слов браузера. Текст свободный только в категории «что угодно» и у игры, которой нет в каталогах
async function lotItem(kind, b) {
  if (kind === 'any') {
    const name = clip(b.name, LOT_NAME).replace(SPOOF_RE, '').trim();
    if (!lotKey(name)) return { error: 'Впиши название.' };
    return { ref: 'any:' + lotKey(name), name, img: '', link: '' };
  }
  if (kind === 'game') {
    // игры нет ни в одном каталоге: хватит названия
    if (typeof b.custom === 'string') {
      const name = clip(b.custom, LOT_NAME).replace(SPOOF_RE, '').trim();
      if (lotKey(name).length < 2) return { error: 'Впиши название игры.' };
      return { ref: 'game:' + lotKey(name), name, img: '', link: '' };
    }
    if (typeof b.wiki === 'string') {
      const lang = b.lang === 'ru' ? 'ru' : 'en', g = await wikiGame(b.wiki, lang);
      if (!g) return { error: 'Выбери из списка.' };
      return { ref: 'wiki:' + lang + ':' + lotKey(b.wiki), name: g.name, img: g.img, link: g.link };
    }
    const appId = b.appId;
    if (!Number.isInteger(appId) || appId <= 0 || appId > 9999999999) return { error: 'Это не игра из Steam.' };
    const g = ((await cachedJson(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian&cc=US&filters=basic`, null, 86400)) || {})[appId];
    if (!g || !g.success || !g.data || !g.data.name) return { status: 404, error: 'Такой игры нет в Steam.' };
    if (g.data.type !== 'game') return { error: 'Это не игра, а дополнение или что-то другое. Выбери саму игру.' };
    return { ref: 'steam:' + appId, name: clip(g.data.name, LOT_NAME).trim(), img: httpsOnly(g.data.header_image), link: `https://store.steampowered.com/app/${appId}/` };
  }
  const title = clip(b.title, 140).trim(), artist = clip(b.artist, 80).trim();
  if (!lotKey(title)) return { error: 'Выбери из списка.' };
  const found = await COVER_FIND[kind](artist ? artist + ' ' + title : title);
  const hit = found.find((x) => lotKey(x.title) === lotKey(title) && (!artist || lotKey(x.artist) === lotKey(artist)));
  if (!hit) return { error: 'Выбери из списка.' };
  const name = clip(hit.artist ? hit.artist + ' — ' + hit.title : hit.title, LOT_NAME).trim();
  return { ref: kind + ':' + lotKey(name), name, img: httpsOnly(hit.art), link: '' };
}
const lotLimit = (v) => Math.max(1, Math.min(5, Math.round(+v) || 3));
const lotTitle = (v) => clip(v, 60).replace(SPOOF_RE, '').trim();
const lotEnds = (minutes, now) => { const m = Math.round(+minutes) || 0; return m > 0 ? now + Math.min(m, 1440) * 60e3 : null; };
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const lotTrack = (v) => (typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v) ? v : '');
function cleanLive(b) {
  const finite = (v) => (Number.isFinite(+v) ? +v : 0);
  const spin = b && b.spin && typeof b.spin === 'object' ? { from: finite(b.spin.from), to: finite(b.spin.to), ms: Math.max(0, Math.min(120000, finite(b.spin.ms))), at: finite(b.spin.at) } : null;
  return {
    segs: (Array.isArray(b && b.segs) ? b.segs : []).slice(0, MAX_LOTS).map((x) => ({ n: clip(x && x.n, LOT_NAME), p: Math.max(0, Math.min(1, finite(x && x.p))), c: HEX_COLOR.test(String(x && x.c)) ? x.c : '#64748B', t: HEX_COLOR.test(String(x && x.t)) ? x.t : '#FFFFFF' })),
    rot: finite(b && b.rot), spin, pick: clip(b && b.pick, LOT_NAME), hub: Math.max(10, Math.min(60, finite(b && b.hub) || 24)),
    hubImg: b && STICKER_RE.test(String(b.hubImg)) ? b.hubImg : '',
    hubOwn: b && /^g[a-z0-9]{1,30}$/.test(String(b.hubOwn)) ? b.hubOwn : '',
    seen: Math.max(0, Math.min(MAX_LOTS, Math.round(finite(b && b.seen)))),
    music: { bg: lotTrack(b && b.music && b.music.bg), win: lotTrack(b && b.music && b.music.win) },
    status: clip(b && b.status, 140),
    out: (Array.isArray(b && b.out) ? b.out : []).slice(0, MAX_LOTS).map((x) => clip(x, LOT_NAME)),
    winner: b && b.winner && b.winner.n ? { n: clip(b.winner.n, LOT_NAME), sum: clip(b.winner.sum, 40), at: finite(b.winner.at) } : null,
  };
}
async function lotAnswer(env, id, me, knownVer) {
  const row = await env.DB.prepare('SELECT r.*, u.username AS owner_name, u.banned AS owner_banned FROM lot_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?').bind(id).first();
  if (!row || row.owner_banned) return fail(404, 'Такого сбора нет.');
  const own = !!me && row.owner_id === me.id;
  const out = { room: { id: row.id, title: row.title, kind: row.kind, perUser: row.per_user, endsAt: row.ends_at, closed: !!row.closed, ver: row.ver, own, owner: row.owner_name || '' }, now: Date.now(), live: null };
  try { out.live = row.live ? JSON.parse(row.live) : null; } catch (e) {}
  // список лотов отдаём, только если он поменялся: страница спрашивает часто
  if (String(knownVer) !== String(row.ver)) {
    const { results } = await env.DB.prepare('SELECT l.id, l.ref, l.name, l.img, l.link, l.user_id, u.username FROM lots l LEFT JOIN users u ON u.id = l.user_id WHERE l.room_id = ? ORDER BY l.created_at LIMIT ?').bind(id, MAX_LOTS).all();
    out.lots = results.map((x) => ({ id: x.id, ref: x.ref, name: x.name, img: x.img, link: x.link, by: x.username || '', mine: !!me && x.user_id === me.id }));
  }
  return json(out);
}

// ---------- поиск музыки ----------
const httpsOnly = (s) => (/^https:\/\/[^\s"'<>()\\]{1,500}$/.test(String(s || '')) ? String(s) : '');
// караоке, каверы и «в стиле»: это не сами исполнители, даже если лежит в каталоге
const NOT_OFFICIAL = /karaoke|tribute|made famous|originally performed|in the style of|as made|cover version|covered by|cover of|covers|(piano|guitar|acoustic|instrumental) cover|караоке|минусовка|кавер/i;
const YTM_HEADERS = { 'content-type': 'application/json', origin: 'https://music.youtube.com', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36' };
async function ytMusicSearch(q) {
  // раздел «Песни»: туда попадают только релизы исполнителей, без чужих роликов
  const d = await cachedJson('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', { method: 'POST', headers: YTM_HEADERS, body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20250101.01.00', hl: 'ru', gl: 'US' } }, query: q, params: 'EgWKAQIIAWoMEA4QChADEAQQCRAF' }) }, 86400);
  const rows = [];
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 24 || rows.length >= 8) return;
    if (o.musicResponsiveListItemRenderer) { rows.push(o.musicResponsiveListItemRenderer); return; }
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  walk(d, 0);
  return rows.map((x) => {
    const cols = (x.flexColumns || []).map((c) => (((c.musicResponsiveListItemFlexColumnRenderer || {}).text || {}).runs || []).map((t) => t.text).join(''));
    const parts = String(cols[1] || '').split(' • ');
    const id = x.playlistItemData && x.playlistItemData.videoId;
    const th = (((x.thumbnail || {}).musicThumbnailRenderer || {}).thumbnail || {}).thumbnails || [];
    const url = th.length ? String(th[th.length - 1].url || '') : '';
    return { title: cols[0], artist: parts[0], album: parts.length > 2 ? parts[1] : '', kind: 'Трек', art: url.replace(/=w\d+-h\d+.*$/, '=w600-h600-l90-rj'), thumb: url, source: 'YouTube Music', link: id ? 'https://music.youtube.com/watch?v=' + id : '' };
  }).filter((x) => x.link);
}
async function deezerMusicSearch(q, album) {
  const d = await cachedJson(`https://api.deezer.com/search/${album ? 'album' : 'track'}?limit=20&q=${encodeURIComponent(q)}`, null, 86400);
  return (d.data || []).map((x) => {
    const al = album ? x : x.album || {};
    return { title: x.title, artist: (x.artist || {}).name, album: album ? '' : al.title, kind: album ? 'Альбом' : 'Трек', art: al.cover_xl || al.cover_big || '', thumb: al.cover_medium || '', source: 'Deezer', link: x.link };
  });
}
async function appleMusicSearch(q, album) {
  const d = await cachedJson(`https://itunes.apple.com/search?media=music&entity=${album ? 'album' : 'song'}&limit=20&country=US&term=${encodeURIComponent(q)}`, null, 86400);
  return (d.results || []).map((x) => {
    const a = String(x.artworkUrl100 || '');
    return { title: album ? x.collectionName : x.trackName, artist: x.artistName, album: album ? '' : x.collectionName, year: String(x.releaseDate || '').slice(0, 4), kind: album ? 'Альбом' : 'Трек', art: a.replace(/\/\d+x\d+bb\./, '/600x600bb.'), thumb: a.replace(/\/\d+x\d+bb\./, '/200x200bb.'), source: 'Apple Music', link: album ? x.collectionViewUrl : x.trackViewUrl };
  });
}
let spotifyAuth = { token: '', until: 0 };
async function spotifySearch(env, q, album) {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return [];
  if (Date.now() >= spotifyAuth.until) {
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', signal: AbortSignal.timeout(6000), headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + btoa(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET) }, body: 'grant_type=client_credentials' });
    if (!r.ok) return [];
    const t = await r.json();
    spotifyAuth = { token: t.access_token, until: Date.now() + ((+t.expires_in || 3600) - 60) * 1000 };
  }
  const r = await fetch(`https://api.spotify.com/v1/search?type=${album ? 'album' : 'track'}&limit=8&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(6000), headers: { authorization: 'Bearer ' + spotifyAuth.token } });
  if (!r.ok) return [];
  const d = await r.json();
  return (((album ? d.albums : d.tracks) || {}).items || []).filter(Boolean).map((x) => {
    const al = album ? x : x.album || {};
    const imgs = al.images || [];
    return { title: x.name, artist: (x.artists || []).map((a) => a.name).join(', '), album: album ? '' : al.name, year: String(al.release_date || '').slice(0, 4), kind: album ? 'Альбом' : 'Трек', art: (imgs[0] || {}).url || '', thumb: (imgs[imgs.length - 1] || {}).url || '', source: 'Spotify', link: (x.external_urls || {}).spotify || '' };
  });
}
async function musicSearch(env, q, album) {
  const lists = await Promise.all([
    spotifySearch(env, q, album).catch(() => []),
    album ? [] : ytMusicSearch(q).catch(() => []),
    appleMusicSearch(q, album).catch(() => []),
    deezerMusicSearch(q, album).catch(() => []),
  ]);
  const norm = (v) => String(v || '').toLowerCase().replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+(single|ep)$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const LINK_ORDER = ['Spotify', 'YouTube Music', 'Apple Music', 'Deezer'];
  const seen = new Map();
  lists.flat().forEach((x, pos) => {
    if (!x.title || !x.artist || !/^https:\/\//.test(String(x.art || '')) || NOT_OFFICIAL.test(x.title + ' ' + x.artist + ' ' + (x.album || ''))) return;
    const k = norm(x.artist.split(/,|&| и | feat.? | ft.? | x /i)[0]) + '|' + norm(x.title);
    const cur = seen.get(k);
    if (!cur) { seen.set(k, { ...x, n: 1, pos }); return; }
    cur.n += 1; // тот же трек в другом каталоге — верный признак настоящего релиза
    if (!cur.year && x.year) cur.year = x.year;
    if (LINK_ORDER.indexOf(x.source) < LINK_ORDER.indexOf(cur.source) && x.link) { cur.link = x.link; cur.source = x.source; }
  });
  // настоящий релиз есть сразу в нескольких каталогах, а залитое кем попало — обычно в одном. Такое показываем, только если другого нет
  const all = [...seen.values()].sort((a, b) => b.n - a.n || a.pos - b.pos);
  const sure = all.filter((x) => x.n > 1);
  return (sure.length ? sure : all).slice(0, 8).map((x) => ({
    title: clip(x.title, 140), artist: clip(x.artist, 80), album: clip(x.album, 80), year: /^(19|20)\d{2}$/.test(x.year || '') ? x.year : '', kind: x.kind,
    art: httpsOnly(x.art), thumb: httpsOnly(x.thumb) || httpsOnly(x.art), source: x.source, link: MUSIC_LINK_RE.test(String(x.link || '')) ? x.link : '',
  }));
}

const LAYOUT_SECTIONS = ['stats', 'titles', 'podium', 'all', 'badges', 'taste', 'friends', 'hist', 'cats'];
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
  // блоки профиля: видимость, порядок и размер (витрины — ключи sc:<id>), выбранные звания
  const WKEY = /^(stats|podium|all|badges|taste|friends|hist|cats|sc:[\w-]{1,40})$/;
  const sections = {};
  if (l.sections && typeof l.sections === 'object') {
    for (const k of LAYOUT_SECTIONS) if (typeof l.sections[k] === 'boolean') sections[k] = l.sections[k];
    Object.keys(l.sections).filter((k) => /^sc:[\w-]{1,40}$/.test(k) && typeof l.sections[k] === 'boolean').slice(0, 12).forEach((k) => { sections[k] = l.sections[k]; });
  }
  const order = (Array.isArray(l.order) ? l.order : []).filter((k) => typeof k === 'string' && WKEY.test(k)).slice(0, 30);
  const size = {};
  if (l.size && typeof l.size === 'object') for (const [k, v] of Object.entries(l.size).slice(0, 30)) if (WKEY.test(k) && ['s', 'm', 'l', 'f'].includes(v)) size[k] = v;
  const grid = {};
  if (l.grid && typeof l.grid === 'object') {
    for (const [k, v] of Object.entries(l.grid).slice(0, 30)) {
      if (!WKEY.test(k) || !v || typeof v !== 'object') continue;
      const x = Math.round(+v.x), y = Math.round(+v.y), w = Math.round(+v.w), h = Math.round(+v.h);
      if (!(x >= 0 && x <= 11 && w >= 1 && w <= 12 && y >= 0 && y <= 20000)) continue;
      grid[k] = { x, y, w };
      if (h >= 5 && h <= 600) grid[k].h = h; // высота вручную (в строках по 8px), без неё — по содержимому
    }
  }
  const out = { showcases, sections, order, size, grid, at: +l.at };
  // цифры в профиле: id из каталога (count, s:plan, k:movie:done, c:<отпечаток категории>…)
  if (Array.isArray(l.stats)) out.stats = l.stats.filter((s) => typeof s === 'string' && /^[a-z]{1,10}(:[a-z0-9]{1,16}){0,2}$/.test(s)).slice(0, 12);
  if (Array.isArray(l.titles)) out.titles = l.titles.filter((t) => typeof t === 'string' && /^[\w:-]{1,40}$/.test(t)).slice(0, 4);
  return out;
}
const STICKER_RE = /^hub\/(?!.*\.\.)[\w\-\/.]{1,100}\.(png|gif|webp|webm|jpe?g)$/; // путь картинки из каталога колеса
// 🔥 огонь, 💀 жесть, 🙅 не согласен, 😂 ору, 😍 обожаю, 👍 согласен, 👎 мимо, 🤔 спорно, 😭 до слёз, 🤡 клоунада, 🗿 база, 🐐 GOAT
const REACTIONS = ['fire', 'skull', 'nope', 'lol', 'love', 'like', 'dislike', 'think', 'cry', 'clown', 'moai', 'goat'];
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
  const body = JSON.stringify({ query: 'query($s:String){Page(perPage:10){media(search:$s,sort:SEARCH_MATCH,isAdult:false){type format title{romaji english}startDate{year}genres coverImage{extraLarge large}}}}', variables: { s: q } });
  const d = await cachedJson('https://graphql.anilist.co', { method: 'POST', body, headers: { 'content-type': 'application/json' } }, 86400);
  const list = (d && d.data && d.data.Page && d.data.Page.media) || [];
  // сначала аниме, потом манга: категория обычно про аниме
  return list.filter((m) => m && m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)).sort((x, y) => (x.type === 'MANGA') - (y.type === 'MANGA')).map((m) => ({
    title: String((m.title && (m.title.english || m.title.romaji)) || '').slice(0, 140), sub: ANI_KIND[m.format] || (m.type === 'MANGA' ? 'Манга' : 'Аниме'),
    year: m.startDate && m.startDate.year ? String(m.startDate.year) : '', art: m.coverImage.extraLarge || m.coverImage.large, thumb: m.coverImage.large || m.coverImage.extraLarge, tall: true,
    genres: genresRu(m.genres),
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
    genres: genresRu((a.genres || []).map((g) => g && g.name)),
  }));
}
// жанры по-русски, только основные: из меток Wikidata («научно-фантастический фильм», «фильм-триллер»)
// и английских названий AniList / MyAnimeList (Sci-Fi, Slice of Life). Порядок — от самых определяющих
const GENRE_RULES = [
  ['мультфильм', /анимац|мультфильм|мультипликац|аниме|animation/], ['ужасы', /ужас|хоррор|сплэттер|horror/], ['фантастика', /фантаст|sci-?fi|mecha/],
  ['фэнтези', /фэнтез|fantasy/], ['супергерои', /супергер/], ['комедия', /комеди|юмор|comedy/], ['боевик', /боевик|экшн|^action$/],
  ['триллер', /триллер|саспенс|thriller|suspense/], ['криминал', /криминал|ограблен|гангстер|crime/], ['детектив', /детектив|тайна|нуар|mystery/],
  ['мелодрама', /мелодрам|романтич|romance/], ['приключения', /приключен|adventure/], ['психологический', /психолог|psychological/],
  ['сверхъестественное', /сверхъестеств|supernatural/], ['повседневность', /повседневн|slice of life/], ['военный', /военн/],
  ['вестерн', /вестерн/], ['мюзикл', /мюзикл|музыкальн|^music$/], ['исторический', /историч/], ['биография', /биограф/],
  ['документальный', /документ/], ['спорт', /спортивн|^sports?$/], ['семейный', /семейн|детск/], ['драма', /(?<!мело)драм|drama/],
];
function genresRu(list) {
  const got = new Set();
  for (const g of list || []) {
    const t = String(g || '').toLowerCase();
    for (const [name, re] of GENRE_RULES) if (re.test(t)) got.add(name);
  }
  return GENRE_RULES.map(([name]) => name).filter((n) => got.has(n)).slice(0, 3);
}
async function filmInfo(imdb) {
  const q = `SELECT ?ru (GROUP_CONCAT(DISTINCT ?g; separator="|") AS ?gs) WHERE { ?f wdt:P345 "${imdb}". OPTIONAL { ?f rdfs:label ?ru FILTER(lang(?ru) = "ru") } OPTIONAL { ?f wdt:P136 ?gg. ?gg rdfs:label ?g FILTER(lang(?g) = "ru") } } GROUP BY ?ru LIMIT 1`;
  const d = await cachedJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { accept: 'application/sparql-results+json' } }, 7 * 86400);
  const b = ((d && d.results && d.results.bindings) || [])[0] || {};
  return { ru: b.ru ? String(b.ru.value).slice(0, 140) : '', genres: genresRu(b.gs ? String(b.gs.value).split('|') : []) };
}
async function gameInfo(appid) {
  const d = await cachedJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=russian&cc=US&filters=basic,genres`, null, 7 * 86400);
  const g = (d && d[appid] && d[appid].success && d[appid].data) || {};
  const genres = (g.genres || []).map((x) => String((x && x.description) || '').toLowerCase()).filter(Boolean).slice(0, 3);
  return { ru: typeof g.name === 'string' ? g.name.slice(0, 140) : '', genres };
}
const STEAM_ART = (id, file) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/${file}`;
const IMDB_KIND = { movie: 'Фильм', tvMovie: 'Фильм', video: 'Фильм', tvSeries: 'Сериал', tvMiniSeries: 'Мини-сериал', short: 'Короткий метр', tvSpecial: 'Спецвыпуск' };
const ANI_KIND = { TV: 'Аниме', TV_SHORT: 'Аниме', MOVIE: 'Аниме-фильм', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Спецвыпуск', MANGA: 'Манга', ONE_SHOT: 'Манга', NOVEL: 'Ранобэ' };
const DZ_IMG = /^https:\/\/(cdn-images|e-cdns-images)\.dzcdn\.net\//;
const DZ_KIND = { album: 'Альбом', ep: 'EP', single: 'Сингл', compile: 'Сборник' };
const COVER_FIND = {
  // музыка: Deezer. iTunes браузер спрашивает сам, но небольших исполнителей там часто нет. Сначала альбомы, потом треки
  async music(q) {
    const get = (what) => cachedJson(`https://api.deezer.com/search/${what}?limit=8&q=${encodeURIComponent(q)}`, null, 86400).catch(() => ({}));
    const [al, tr] = await Promise.all([get('album'), get('track')]);
    const out = [];
    for (const a of al.data || []) {
      if (!a || !DZ_IMG.test(a.cover_xl || '')) continue;
      out.push({ id: '', title: String(a.title || '').slice(0, 140), artist: String((a.artist && a.artist.name) || '').slice(0, 80), sub: DZ_KIND[a.record_type] || 'Альбом', year: '', art: a.cover_xl, thumb: DZ_IMG.test(a.cover_medium || '') ? a.cover_medium : a.cover_xl, tall: false });
    }
    for (const t of tr.data || []) {
      const a = t && t.album;
      if (!a || !DZ_IMG.test(a.cover_xl || '')) continue;
      out.push({ id: '', title: String(t.title || '').slice(0, 140), artist: String((t.artist && t.artist.name) || '').slice(0, 80), sub: 'Трек', year: '', art: a.cover_xl, thumb: DZ_IMG.test(a.cover_medium || '') ? a.cover_medium : a.cover_xl, tall: false });
    }
    return out;
  },
  // Steam: вертикальная обложка 600×900, у старых игр её может не быть — тогда шапка магазина
  async game(q) {
    const d = await cachedJson('https://store.steampowered.com/api/storesearch/?l=english&cc=US&term=' + encodeURIComponent(q), null, 86400);
    return (d.items || []).filter((i) => i && Number.isInteger(i.id) && !/\b(soundtrack|ost|artbook|dlc)\b/i.test(i.name || ''))
      .map((i) => ({ id: String(i.id), title: String(i.name || '').slice(0, 140), sub: 'Игра', year: '', art: STEAM_ART(i.id, 'library_600x900.jpg'), alt: STEAM_ART(i.id, 'header.jpg'), tall: true }));
  },
  async movie(q) {
    const d = await cachedJson(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q.toLowerCase())}.json`, null, 86400);
    return (d.d || []).filter((i) => i && i.i && typeof i.i.imageUrl === 'string' && IMDB_KIND[i.qid]).map((i) => {
      const art = i.i.imageUrl.replace(/\._V1_[^/]*\.jpg$/, '._V1_QL80_UX600_.jpg');
      return { id: /^tt\d{5,10}$/.test(i.id) ? i.id : '', title: String(i.l || '').slice(0, 140), sub: IMDB_KIND[i.qid], year: i.y ? String(i.y) : '', art, thumb: art.replace('UX600', 'UX240'), tall: true };
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
  const h = u.hostname.toLowerCase().replace(/\.+$/, ''); // «localhost.» с точкой на конце — тот же localhost
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

const PUBLIC = new Set(['POST /register', 'POST /login', 'POST /logout', 'POST /ping', 'GET /share/:id/img', 'GET /announce', 'GET /lots/:code', 'GET /lots/:code/hub']);
// код ссылки на отзыв: 12 знаков из 62 — около 71 бита случайности
const SHARE_RE = /^[A-Za-z0-9]{12}$/;
function shareId() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(24))].filter((b) => b < 248).slice(0, 12).map((b) => abc[b % 62]).join('').padEnd(12, 'x');
}
const ONLINE_MS = 150e3; // «в сети» — заходил за последние 2,5 минуты
const onlineCache = { n: 0, at: 0 };
const announceCache = { v: null, at: 0 };
async function currentAnnounce(env) {
  const now = Date.now();
  if (announceCache.at < now - 5e3) {
    try { const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'announce'").first(); announceCache.v = r ? JSON.parse(r.v) : null; } catch (e) { announceCache.v = null; }
    announceCache.at = now;
  }
  const a = announceCache.v;
  return a && a.text && (!a.until || a.until > now) ? { id: a.id, text: a.text, kind: a.kind } : null;
}

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
  if (!routes[key] && segs.length === 3 && segs[0] === 'admin' && ['ban', 'kick', 'rename', 'delete'].includes(segs[1]) && /^[0-9a-f]{24}$/.test(segs[2])) { key = `${request.method} /admin/${segs[1]}/:id`; arg = segs[2]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'admin' && segs[1] === 'comment' && /^[0-9a-f]{20}$/.test(segs[2])) { key = `${request.method} /admin/comment/:id`; arg = segs[2]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'comments' && CM_TARGET_RE.test(segs[2])) { key = `${request.method} /comments/:uid/:target`; arg = [segs[1], segs[2]]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'comment' && /^[0-9a-f]{20}$/.test(segs[1])) { key = `${request.method} /comment/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'photo-history' && HIST_KINDS.has(segs[1])) { key = `${request.method} /photo-history/:kind`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'tierlist' && TIER_ID_RE.test(segs[2])) { key = `${request.method} /tierlist/:uid/:id`; arg = [segs[1], segs[2]]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'tierlist' && TIER_ID_RE.test(segs[1])) { key = `${request.method} /tierlist/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'tierlist-img' && TIER_IMG_RE.test(segs[1])) { key = `${request.method} /tierlist-img/:key`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'tierlist-imgs') { key = `${request.method} /tierlist-imgs/:uid`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'reacts') { key = `${request.method} /reacts/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'lots' && SHARE_RE.test(segs[1])) { key = `${request.method} /lots/:code`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'lots' && SHARE_RE.test(segs[1]) && segs[2] === 'live') { key = `${request.method} /lots/:code/live`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'lots' && SHARE_RE.test(segs[1]) && segs[2] === 'hub') { key = `${request.method} /lots/:code/hub`; arg = segs[1]; }
  if (!routes[key] && segs.length === 2 && segs[0] === 'share' && SHARE_RE.test(segs[1])) { key = `${request.method} /share/:id`; arg = segs[1]; }
  if (!routes[key] && segs.length === 3 && segs[0] === 'share' && segs[2] === 'img' && SHARE_RE.test(segs[1])) { key = `${request.method} /share/:id/img`; arg = segs[1]; }
  const handler = routes[key];
  if (!handler) return fail(404, 'Нет такого адреса.');
  const ip = clientIp(request);
  // щедро: за одним адресом бывает много людей (мобильный интернет), а доска друга с фото — это десятки запросов
  const slow = burst('all:' + ip, 900, 60e3) || (request.method !== 'GET' && burst('w:' + ip, 150, 60e3));
  if (slow) return new Response(JSON.stringify({ error: 'Слишком много запросов, подожди немного.' }), { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': String(slow) } });

  try {
    await ensureScheme(env);
    let me = null;
    if (!PUBLIC.has(key)) {
      me = await currentUser(env, request);
      if (!me) return fail(401, 'Нужно войти в онлайн-аккаунт.');
      if (me.banned) return fail(403, 'Аккаунт заблокирован администрацией' + (me.ban_reason ? ': ' + me.ban_reason : '.'));
    }
    return await handler({ env, request, me, arg });
  } catch (e) {
    if (e instanceof TooBig) return fail(413, 'Слишком большой запрос.');
    console.error(e);
    return fail(500, 'Ошибка сервера, попробуй ещё раз.');
  }
}
