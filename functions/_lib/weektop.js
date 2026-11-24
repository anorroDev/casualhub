// Казуал Хаб: награда за топ недели. Топ-5 всего сайта по опыту за неделю (понедельник–воскресенье, как задание недели)
// получает рофланы письмом в «Почту» (gifts.kind 'roflans', сумма — в поле xp), забирается кнопкой «Забрать».
// Сколько: за место 60 / 45 / 35 / 25 / 20 и +1 за каждые 25 опыта недели, но не больше +40 — активный первый получит
// до 100, пятый — от 22. В топ попадают только набравшие от 50 опыта: на маленьком сайте пятое место с 5 опыта — не награда.
// Кто скрыл себя из рейтинга (prefs.hideBoard), в топ не попадает, как и в «Рейтинге». Удалённые и заблокированные — тоже:
// забрать награду они не могут, а место заняли бы.
// Выдача ленивая: первый запрос /levels/me после конца недели (по UTC) раскладывает письма; id письма — top:<неделя>:<id>,
// поэтому две вкладки или два запроса подряд ничего не удвоят. Папка _lib не становится адресом сайта.
import { dayKey, shiftDay, weekStart, prefsOf } from './levels.js';

export const TOP_MIN = 50;
export const TOP_BASE = [60, 45, 35, 25, 20];
export const TOP_PER = 25;
export const TOP_BONUS_MAX = 40;
export const topBonus = (xp) => Math.min(TOP_BONUS_MAX, Math.floor(Math.max(0, +xp || 0) / TOP_PER));
export const topPrize = (place, xp) => (place >= 1 && place <= TOP_BASE.length ? TOP_BASE[place - 1] + topBonus(xp) : 0);

// топ-5 недели wk (понедельник 'YYYY-MM-DD'): места, опыт и награда
export async function weekTop(env, wk) {
  const { results } = await env.DB.prepare(
    `SELECT l.user_id, SUM(l.xp) AS xp, ul.prefs FROM xp_log l JOIN users u ON u.id = l.user_id AND COALESCE(u.banned, 0) = 0
     LEFT JOIN user_level ul ON ul.user_id = l.user_id
     WHERE l.day >= ?1 AND l.day < ?2 AND l.gone = 0 GROUP BY l.user_id HAVING SUM(l.xp) >= ?3 ORDER BY SUM(l.xp) DESC, l.user_id LIMIT 30`
  ).bind(wk, shiftDay(wk, 7), TOP_MIN).all();
  return (results || []).filter((r) => !prefsOf(r).hideBoard).slice(0, TOP_BASE.length)
    .map((r, i) => ({ id: r.user_id, xp: +r.xp || 0, place: i + 1, prize: topPrize(i + 1, +r.xp) }));
}

const range = (wk) => {
  const f = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const a = f(wk), b = f(shiftDay(wk, 6));
  return a.split(' ')[1] === b.split(' ')[1] ? `${a.split(' ')[0]}–${b}` : `${a} – ${b}`;
};
// разложить награды за прошлую неделю, если ещё не разложены. Возвращает, сколько писем ушло (0 — уже было)
let settled = '';
export async function settleWeekTop(env, now = Date.now()) {
  const prev = shiftDay(weekStart(dayKey(now, 'UTC')), -7);
  if (settled >= prev) return 0;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)').run();
  const m = await env.DB.prepare("SELECT v FROM meta WHERE k = 'week_top'").first();
  if (m && m.v >= prev) { settled = m.v; return 0; }
  const top = await weekTop(env, prev);
  const nf = (n) => Number(n).toLocaleString('ru-RU');
  // сначала письма (повтор ничего не удвоит), потом отметка, что неделя разложена
  if (top.length) {
    await env.DB.batch(top.map((t) => env.DB.prepare("INSERT OR IGNORE INTO gifts (id, to_id, kind, title, body, xp, at, until, by_id) VALUES (?, ?, 'roflans', ?, ?, ?, ?, NULL, NULL)").bind(
      `top:${prev}:${t.id}`, t.id, `Топ недели: ${t.place}-е место`,
      `За неделю ${range(prev)} ты набрал ${nf(t.xp)} опыта и занял ${t.place}-е место на сайте. Награда: ${TOP_BASE[t.place - 1]} рофланов за место и ${topBonus(t.xp)} за активность.`,
      t.prize, now,
    )));
  }
  await env.DB.prepare("INSERT INTO meta (k, v) VALUES ('week_top', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1 WHERE v < ?1").bind(prev).run();
  settled = prev;
  return top.length;
}
// для тестов: забыть, какая неделя уже разложена в этом процессе
export const forgetSettled = () => { settled = ''; };
