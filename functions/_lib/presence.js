// Казуал Хаб: «в сети», заявки в друзья и объявление сайта — общее для API (POST /ping) и комнаты присутствия
// PresenceDO в Worker'е casualhub-rt. Источник правды — D1: users.last_seen (аккаунты) и presence (гости),
// поэтому счётчик «N на сайте» и «был(а) N мин назад» одинаковы и у страниц на сокете, и у страниц на опросе.
// Папка _lib не становится адресом сайта.

export const ONLINE_MS = 150e3; // «в сети» — заходил за последние 2,5 минуты
export const GUEST_RE = /^[a-z0-9]{12,40}$/;
const CHUNK = 50; // столько id в одном IN (...) — D1 ограничивает число параметров запроса

// сколько людей на сайте: аккаунты и гости, заходившие за ONLINE_MS
export async function onlineCount(env, now) {
  const [a, b] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?').bind(now - ONLINE_MS),
    env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE at > ?').bind(now - ONLINE_MS),
  ]);
  return ((a.results[0] || {}).n || 0) + ((b.results[0] || {}).n || 0);
}
// друзья в сети (кто не скрывает, что в сети) и заявки, которые ждут ответа, — одним походом в базу
export async function friendsAndIncoming(env, uid, now) {
  const [fr, inc] = await env.DB.batch([
    env.DB.prepare(
      "SELECT u.id, u.last_seen FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ?1 THEN f.b ELSE f.a END) WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted' AND (u.hide_online IS NULL OR u.hide_online = 0) AND u.last_seen > ?2"
    ).bind(uid, now - ONLINE_MS),
    env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'pending' AND requested_by != ?1").bind(uid),
  ]);
  return { friends: (fr.results || []).map((x) => ({ id: x.id, at: x.last_seen })), incoming: (inc.results && inc.results[0] && inc.results[0].n) || 0 };
}
// все друзья человека (id), чтобы сказать им «пришёл» и «ушёл»
export async function friendIds(env, uid) {
  const { results } = await env.DB.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(uid).all();
  return (results || []).map((x) => x.id);
}
// объявление сайта, если оно сейчас действует: {id, text, kind} или null
export async function readAnnounce(env, now) {
  let a = null;
  try { const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'announce'").first(); a = r ? JSON.parse(r.v) : null; } catch (e) {}
  return a && a.text && (!a.until || a.until > now) ? { id: a.id, text: a.text, kind: a.kind } : null;
}
// отметить «заходил сейчас»; пишем не чаще раза в gap (по умолчанию 45 секунд) на человека, база не тратится на каждую вкладку.
// Комната присутствия отмечает всех раз в такт и передаёт gap меньше такта: при равных значениях каждая вторая отметка
// пропускалась бы, и «в сети» обновлялось бы раз в два такта
export const TOUCH_GAP = 45e3;
export async function touchUsers(env, ids, now, gap = TOUCH_GAP) {
  const q = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    q.push(env.DB.prepare(`UPDATE users SET last_seen = ?1 WHERE id IN (${part.map((_, k) => '?' + (k + 3)).join(', ')}) AND (last_seen IS NULL OR last_seen < ?2)`).bind(now, now - gap, ...part));
  }
  if (q.length) await env.DB.batch(q);
}
export async function touchGuests(env, ids, now, gap = TOUCH_GAP) {
  const q = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    q.push(env.DB.prepare(`INSERT INTO presence (id, at) VALUES ${part.map((_, k) => `(?${k + 3}, ?1)`).join(', ')} ON CONFLICT(id) DO UPDATE SET at = ?1 WHERE presence.at < ?2`).bind(now, now - gap, ...part.map((g) => 'g:' + g)));
  }
  if (q.length) await env.DB.batch(q);
}
