// Казуал Хаб: новогодний календарь (декабрь 2026, дни — по Киеву). Блок вверху «Почты» в «Прогрессе» (levels-ui.js):
// каждый день можно забрать подарок дня — рофланы в журнал магазина (shop_log, reason 'advent'). Забирают только
// сегодняшний: пропущенный день не вернуть. Кто забрал ADVENT.frameAt дней, получает рамку «Новый год» (frame8,
// EVENT_REWARDS в levels.js): строка shop_owned look.frame8 с ценой 0 — так рамку видят все места, где показывают
// чужое оформление (shop.js → boughtLooks), без отдельной проверки ивента. Пока подарок дня не забран — +1 к счётчику
// непрочитанного в «Почте» (levels-api.js → mailUnread). Адрес — POST /api/levels/advent (levels-api.js).
import { dayKey } from './levels.js';
import { ensureShop } from './shop.js';

export const ADVENT = { year: 2026, month: 12, days: 31, frameAt: 20, frame: 'frame8', tz: 'Europe/Kiev' };
// рофланы за день: по воскресеньям недели календаря (7, 14, 21, 28) — больше, 31 декабря — больше всего
export const adventGift = (day) => (day === 31 ? 50 : day % 7 === 0 ? 25 : 10);
// какой сегодня день календаря (1–31) или 0, если сейчас не декабрь 2026 по Киеву
export function adventDay(now = Date.now()) {
  const [y, m, d] = dayKey(now, ADVENT.tz).split('-').map(Number);
  return y === ADVENT.year && m === ADVENT.month ? d : 0;
}

const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
export async function ensureAdvent(env) {
  if (ready.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS advent (user_id TEXT NOT NULL, day INTEGER NOT NULL, roflans INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, day))').run();
  ready.add(env.DB);
}

// забран ли подарок сегодня (для счётчика непрочитанного); вне декабря — забирать нечего
export async function adventPending(env, uid, now = Date.now()) {
  const day = adventDay(now);
  if (!day) return false;
  await ensureAdvent(env);
  return !(await env.DB.prepare('SELECT 1 FROM advent WHERE user_id = ? AND day = ?').bind(uid, day).first());
}

// календарь для «Почты»: какой сегодня день, какие дни забраны, подарки по дням и сколько нужно до рамки
export async function adventState(env, uid, now = Date.now()) {
  const day = adventDay(now);
  if (!day) return null;
  await ensureAdvent(env);
  const { results } = await env.DB.prepare('SELECT day FROM advent WHERE user_id = ? ORDER BY day').bind(uid).all();
  const opened = (results || []).map((r) => +r.day);
  return {
    day, opened, today: opened.includes(day), frameAt: ADVENT.frameAt, frame: opened.length >= ADVENT.frameAt,
    gifts: Array.from({ length: ADVENT.days }, (_, i) => adventGift(i + 1)),
  };
}

// забрать подарок дня: один раз в день (первичный ключ advent), рофланы — в журнал, рамка — на ADVENT.frameAt-м дне
export async function adventClaim(env, uid, now = Date.now()) {
  const day = adventDay(now);
  if (!day) return { ok: false, status: 404, error: 'Новогодний календарь открыт только в декабре.' };
  await ensureAdvent(env);
  await ensureShop(env);
  const gift = adventGift(day);
  const w = await env.DB.prepare('INSERT OR IGNORE INTO advent (user_id, day, roflans, at) VALUES (?, ?, ?, ?)').bind(uid, day, gift, now).run();
  if (!(w.meta && w.meta.changes)) return { ok: false, status: 409, error: 'Подарок за сегодня уже забран. Завтра будет новый.' };
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM advent WHERE user_id = ?').bind(uid).first();
  const count = +(c && c.n) || 0;
  const writes = [
    env.DB.prepare("INSERT OR IGNORE INTO shop_log (id, user_id, item, delta, reason, note, by_id, at) VALUES (?, ?, NULL, ?, 'advent', ?, NULL, ?)")
      .bind(`advent:${uid}:${day}`, uid, gift, `Новогодний календарь: ${day} декабря`, now),
  ];
  if (count >= ADVENT.frameAt) writes.push(env.DB.prepare('INSERT OR IGNORE INTO shop_owned (user_id, item, price, at) VALUES (?, ?, 0, ?)').bind(uid, 'look.' + ADVENT.frame, now));
  const res = await env.DB.batch(writes);
  const frame = writes.length > 1 && !!(res[1] && res[1].meta && res[1].meta.changes);
  return { ok: true, day, roflans: gift, count, frame };
}
