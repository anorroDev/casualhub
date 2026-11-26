// Казуал Хаб: «Угадай оценку друга» в Мнении (страница — opinion/guess.js). Каждый день — до 5 оценок друзей
// (свежие, за 60 дней; не хватает — и старше), их баллы угадывают ползунком от 1 до 10 с шагом 0,5. Очки за точность:
// до 0,25 — 3, до 0,75 — 2, до 1,5 — 1. Берутся только оценки, которые другу можно показывать (не «только я» и не из
// категорий, скрытых из его профиля), с баллами, без треков внутри альбомов и примеров. Набор дня запоминается вместе
// с баллами друзей при первом заходе: правка оценки потом игру не меняет. Ответ — один раз. День — по Киеву.
// Опыт — правило guess (levels.js), раз в день; таблица недели — я и друзья, сумма очков с понедельника.
import { dayKey, weekStart, isScored } from './levels.js';
import { clip, SAFE_URL, readShelf } from './shelf.js';

export const GUESS_TZ = 'Europe/Kiev';
export const GUESS_N = 5;
const FRESH = 60 * 864e5;
const NSFW_RE = /хентай|hentai|18\s*\+|nsfw/i; // как CasualUtil.nsfw в util.js: такие обложки на странице размыты
export const pointsFor = (guess, total) => {
  const d = Math.abs(+guess - +total);
  return d <= 0.25 + 1e-9 ? 3 : d <= 0.75 + 1e-9 ? 2 : d <= 1.5 + 1e-9 ? 1 : 0;
};
// повторяемый случай по строке «человек:день»: весь день один и тот же набор
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const stamp = (r) => +new Date(r.updatedAt || r.createdAt || 0) || 0;
// ключ категории — как в профиле (profile/app.js → keyOf): скрытые из профиля категории хранятся так.
// В r.cat лежит id категории ('games', 't1abc…'), а профиль скрывает по названию — берём его так же, как профиль (norm)
const catKey = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const catOf = (r) => catKey(r.catName || r.catLabel || r.cat || 'Без категории');
const fits = (r) => !!r && !r.example && r.vis !== 'private' && !r.albumOf && typeof r.id === 'string' && !!String(r.name || '').trim() && isScored(r);
// обложка по ссылке (из поиска, Steam и т. п.): страница ставит её прямо в <img>. Своё загруженное фото (photo.remote)
// лежит в аккаунте друга, ссылки на него нет — тогда буква названия
const coverOf = (p) => (p && typeof p.url === 'string' && /^https:\/\//.test(p.url) && SAFE_URL.test(p.url) ? p.url : '');

// shelves: [{ owner, ratings, hide }] → до GUESS_N вопросов { owner, rid, name, cat, photo, adult, total }:
// сначала свежие, по кругу по друзьям (первые — от разных), не хватило — старше 60 дней
export function pickSet(shelves, seed, now = Date.now()) {
  const rnd = rng(String(seed));
  const out = [];
  for (const old of [false, true]) {
    const groups = shuffle((shelves || []).map((s) => {
      const hid = new Set((s.hide || []).map(catKey));
      const list = (s.ratings || []).filter((r) => fits(r) && !hid.has(catOf(r)) && (now - stamp(r) > FRESH) === old);
      return { owner: s.owner, list: shuffle(list, rnd) };
    }).filter((g) => g.list.length), rnd);
    while (out.length < GUESS_N && groups.some((g) => g.list.length)) {
      for (const g of groups) {
        if (out.length >= GUESS_N) break;
        const r = g.list.shift();
        if (!r) continue;
        const cat = clip(r.catLabel || r.catName || '', 60);
        out.push({
          owner: g.owner, rid: clip(r.id, 120), name: clip(r.name, 120), cat,
          photo: coverOf(r.photo),
          adult: r.adult === true || NSFW_RE.test(cat), total: Math.round(+r.total * 10) / 10,
        });
      }
    }
  }
  return out;
}

const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS guess_days (user_id TEXT NOT NULL, day TEXT NOT NULL, items TEXT NOT NULL, answers TEXT, score INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, done_at INTEGER, PRIMARY KEY (user_id, day))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS guess_days_day ON guess_days(day)'),
  ]);
  ready.add(env.DB);
}
const parse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
const friendsOf = async (env, uid) => (await env.DB.prepare(
  "SELECT CASE WHEN f.a = ?1 THEN f.b ELSE f.a END AS id, u.username, u.uname FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ?1 THEN f.b ELSE f.a END) WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted'",
).bind(uid).all()).results || [];

// набор дня: из базы, а если его ещё нет — собрать из оценок друзей и запомнить (с их баллами на этот момент)
async function setOf(env, uid, day, now, friends) {
  await ensure(env);
  const have = await env.DB.prepare('SELECT items, answers, score FROM guess_days WHERE user_id = ? AND day = ?').bind(uid, day).first();
  if (have) return { items: parse(have.items, []), answers: parse(have.answers, null), score: +have.score || 0 };
  if (!friends.length) return { items: [], answers: null, score: 0, empty: 'friends' };
  const ids = friends.slice(0, 90).map((f) => f.id);
  const { results } = await env.DB.prepare(`SELECT user_id, data FROM shelves WHERE user_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const shelves = [];
  for (const row of results || []) { try { const s = readShelf(row); shelves.push({ owner: row.user_id, ratings: s.ratings, hide: s.profile && s.profile.hide }); } catch (e) {} }
  const people = new Map(friends.map((f) => [f.id, f]));
  const items = pickSet(shelves, uid + ':' + day, now).map((x) => ({ ...x, fu: clip((people.get(x.owner) || {}).username, 60), fh: clip((people.get(x.owner) || {}).uname, 40) }));
  if (!items.length) return { items: [], answers: null, score: 0, empty: 'ratings' }; // не запоминаем: друзья могут оценить что-то позже
  await env.DB.prepare('INSERT OR IGNORE INTO guess_days (user_id, day, items, at) VALUES (?, ?, ?, ?)').bind(uid, day, JSON.stringify(items), now).run();
  const row = await env.DB.prepare('SELECT items, answers, score FROM guess_days WHERE user_id = ? AND day = ?').bind(uid, day).first();
  return { items: parse(row.items, []), answers: parse(row.answers, null), score: +row.score || 0 };
}

async function stateOf(env, uid, now) {
  const day = dayKey(now, GUESS_TZ);
  const friends = await friendsOf(env, uid);
  const st = await setOf(env, uid, day, now, friends);
  const done = Array.isArray(st.answers);
  const items = st.items.map((x, k) => {
    const v = { k, rid: x.rid, name: x.name, cat: x.cat, photo: x.photo || '', adult: !!x.adult, friend: { id: x.owner, username: x.fu || '', handle: x.fh || '' } };
    if (!done) return v; // балл друга — только после ответа
    const g = st.answers[k];
    return { ...v, total: x.total, guess: g == null ? null : g, points: g == null ? 0 : pointsFor(g, x.total) };
  });
  // таблица недели: я и друзья, кто уже ответил с понедельника
  const ids = [uid, ...friends.map((f) => f.id)].slice(0, 91);
  const { results: rows } = await env.DB.prepare(`SELECT g.user_id AS id, SUM(g.score) AS s, COUNT(*) AS n, u.username, u.uname FROM guess_days g JOIN users u ON u.id = g.user_id
    WHERE g.day >= ? AND g.answers IS NOT NULL AND g.user_id IN (${ids.map(() => '?').join(',')}) GROUP BY g.user_id ORDER BY s DESC, n ASC LIMIT 10`).bind(weekStart(day), ...ids).all();
  const board = (rows || []).map((x) => ({ id: x.id, username: x.username || '', handle: x.uname || '', score: +x.s || 0, days: +x.n || 0, me: x.id === uid }));
  return { day, done, items, score: done ? st.score : 0, max: st.items.length * 3, empty: st.empty || null, board };
}

export function makeGuessRoutes(h) {
  const { json, fail } = h;
  return {
    // набор дня (баллы друзей — только после ответа) и таблица недели
    async 'GET /guess'({ env, me }) { return json(await stateOf(env, me.id, Date.now())); },
    // { answers: { номер вопроса: балл 1–10 } } — один раз в день; без ответа на вопрос — 0 очков за него
    async 'POST /guess'({ env, request, me }) {
      if (h.burst && h.burst('guess:' + me.id, 10, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const now = Date.now(), day = dayKey(now, GUESS_TZ);
      const st = await setOf(env, me.id, day, now, await friendsOf(env, me.id));
      if (!st.items.length) return fail(400, 'Сегодня угадывать нечего: у друзей нет оценок, которые тебе видны.');
      if (Array.isArray(st.answers)) return fail(409, 'Сегодня ты уже угадывал. Завтра — новые оценки.');
      const b = await h.readBody(request);
      const ans = (b && typeof b.answers === 'object' && b.answers) || {};
      const guesses = st.items.map((_, k) => { const v = Number(ans[k]); return ans[k] == null || !Number.isFinite(v) ? null : Math.min(10, Math.max(1, Math.round(v * 2) / 2)); });
      const score = st.items.reduce((s, x, k) => s + (guesses[k] == null ? 0 : pointsFor(guesses[k], x.total)), 0);
      const w = await env.DB.prepare('UPDATE guess_days SET answers = ?, score = ?, done_at = ? WHERE user_id = ? AND day = ? AND answers IS NULL').bind(JSON.stringify(guesses), score, now, me.id, day).run();
      if (!(w.meta && w.meta.changes)) return fail(409, 'Сегодня ты уже угадывал. Завтра — новые оценки.');
      if (h.lvGive) {
        try {
          // «Телепат» (мерка @telepath): сколько всего баллов друзей угадано в точку, за все дни
          const { results: all } = await env.DB.prepare('SELECT items, answers FROM guess_days WHERE user_id = ? AND answers IS NOT NULL').bind(me.id).all();
          let telepath = 0;
          for (const row of all || []) { const it = parse(row.items, []), an = parse(row.answers, []); it.forEach((x, k) => { if (an[k] != null && pointsFor(an[k], x.total) === 3) telepath++; }); }
          await h.lvGive(env, request, me, me.id, [{ kind: 'guess', ref: day }], { metrics: { telepath } });
        } catch (e) { console.error('guess xp', e && e.message); }
      }
      return json(await stateOf(env, me.id, now));
    },
  };
}
