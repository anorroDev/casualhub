// Казуал Хаб: мини-игра «Васян ловит еду» (страница /games/catch/, игра на холсте — games/catch/app.js). Васян бегает
// по низу и ловит еду: корм — 1 очко, рыбка — 3, сосиска — 5, тортик — 10; огурец и капли из тучки отнимают жизнь, жизней три.
// Сервер помнит лучший счёт человека за каждый день (день по Киеву) и отдаёт лучших за сегодня среди друзей; рекорд за всё
// время — лучший из его дней. Сохраняют только вошедшие; гость играет без рекордов.
// Счёт проверяется: игру начинает POST /games/catch/start (номер забега и время начала остаются на сервере), счёт —
// один на забег, время игры — не больше, чем прошло с начала, очков — не больше, чем можно поймать за это время по правилам
// появления еды (maxScore по SPAWN; те же числа — в games/catch/app.js, их сверяет tests/game-catch.test.mjs).
// Опыт — правила catch_play (первая игра дня хотя бы с одним очком) и catch_record (побил свой рекорд, раз в день),
// functions/_lib/levels.js; ref — день.
import { dayKey } from './levels.js';

export const CATCH_TZ = 'Europe/Kiev';
// Правила появления, секунды игрового времени (паузы не идут): первая штука — на first; следующая — через
// max(gapMin, gap0 − gapK·t) после предыдущей; среди них тортик, сосиска и рыбка — с какой секунды можно и не чаще чем раз в столько
export const SPAWN = { first: 0.8, gap0: 1.05, gapK: 0.0078, gapMin: 0.34, fish: [0, 1.2], sausage: [5, 3], cake: [12, 9] };
export const POINTS = { kibble: 1, fish: 3, sausage: 5, cake: 10 };
export const MAX_MS = 2 * 3600e3; // игра дольше двух часов — не верим
const RUN_TTL = 6 * 3600e3; // начатая игра ждёт счёт столько, потом забывается
const RUN_KEEP = 5; // начатых и не сохранённых игр у человека — не больше (несколько вкладок)
const SLACK_MS = 10e3; // запрос start доходит до сервера позже, чем начинается игра на странице
const BOARD_N = 20;

export const gapAt = (t) => Math.max(SPAWN.gapMin, SPAWN.gap0 - SPAWN.gapK * t);
// сколько штук появится к секунде t: та же цепочка, что у страницы (следующая — через gapAt от времени предыдущей)
export function spawnsBy(t) {
  let n = 0;
  for (let s = SPAWN.first; s <= t; s += gapAt(s)) n++;
  return n;
}
// сколько раз за t секунд может появиться еда с правилом [с какой секунды, перерыв]
const upTo = (t, [from, gap]) => (t < from ? 0 : Math.floor((t - from) / gap) + 1);
// больше этого за ms не поймать: как будто всё, что появилось, — еда, а тортики, сосиски и рыбки выпадают так часто,
// как позволяет их перерыв (огурцы и тучки места не занимают). Четверть секунды — запас на округление
export function maxScore(ms) {
  const t = Math.max(0, Math.min(MAX_MS, +ms || 0)) / 1000 + 0.25;
  let left = spawnsBy(t), sum = 0;
  for (const k of ['cake', 'sausage', 'fish']) {
    const n = Math.min(left, upTo(t, SPAWN[k]));
    sum += n * POINTS[k];
    left -= n;
  }
  return sum + left * POINTS.kibble;
}

// ---------- база ----------
const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    // лучший счёт за день: best_ms — сколько длилась та игра, best_at — когда (при равном счёте выше тот, кто раньше)
    env.DB.prepare('CREATE TABLE IF NOT EXISTS catch_days (user_id TEXT NOT NULL, day TEXT NOT NULL, best INTEGER NOT NULL DEFAULT 0, best_ms INTEGER NOT NULL DEFAULT 0, best_at INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (user_id, day))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS catch_days_day ON catch_days(day, best)'),
    // начатые игры: счёт принимается один раз на игру и не раньше, чем она могла кончиться
    env.DB.prepare('CREATE TABLE IF NOT EXISTS catch_runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS catch_runs_user ON catch_runs(user_id, at)'),
  ]);
  ready.add(env.DB);
}
const n0 = (v) => +v || 0;
const runId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

// свои рекорды (сегодня и за всё время) и лучшие за сегодня — я и друзья
async function stateOf(env, uid, now) {
  await ensure(env);
  const day = dayKey(now, CATCH_TZ);
  const [today, all, board, fr] = await env.DB.batch([
    env.DB.prepare('SELECT best, games FROM catch_days WHERE user_id = ? AND day = ?').bind(uid, day),
    env.DB.prepare('SELECT MAX(best) AS best, SUM(games) AS games FROM catch_days WHERE user_id = ?').bind(uid),
    env.DB.prepare(`SELECT d.user_id AS id, d.best AS score, u.username, u.uname FROM catch_days d JOIN users u ON u.id = d.user_id
      WHERE d.day = ?2 AND d.games > 0 AND (d.user_id = ?1 OR d.user_id IN (SELECT CASE WHEN f.a = ?1 THEN f.b ELSE f.a END FROM friendships f WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted'))
      ORDER BY d.best DESC, d.best_at ASC LIMIT ${BOARD_N}`).bind(uid, day),
    env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(uid),
  ]);
  const t = (today.results || [])[0] || {}, a = (all.results || [])[0] || {};
  return {
    day,
    today: { best: n0(t.best), games: n0(t.games) },
    all: { best: n0(a.best), games: n0(a.games) },
    board: (board.results || []).map((x) => ({ id: x.id, username: x.username || '', handle: x.uname || '', score: n0(x.score), me: x.id === uid })),
    friends: n0(((fr.results || [])[0] || {}).n),
  };
}

export function makeCatchRoutes(h) {
  const { json, fail } = h;
  const BAD_RUN = 'Эта игра уже сохранена или не начиналась. Сыграй ещё раз.';
  return {
    // рекорды и лучшие за сегодня среди друзей
    async 'GET /games/catch/top'({ env, me }) { return json(await stateOf(env, me.id, Date.now())); },
    // новая игра: номер забега. Страница не ждёт ответа и сразу начинает играть, счёт потом приходит с этим номером
    async 'POST /games/catch/start'({ env, me }) {
      if (h.burst && h.burst('catch-start:' + me.id, 40, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      await ensure(env);
      const now = Date.now(), id = runId();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM catch_runs WHERE user_id = ? AND at < ?').bind(me.id, now - RUN_TTL),
        env.DB.prepare('INSERT INTO catch_runs (id, user_id, at) VALUES (?, ?, ?)').bind(id, me.id, now),
        env.DB.prepare(`DELETE FROM catch_runs WHERE user_id = ?1 AND id NOT IN (SELECT id FROM catch_runs WHERE user_id = ?1 ORDER BY at DESC LIMIT ${RUN_KEEP})`).bind(me.id),
      ]);
      if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM catch_runs WHERE at < ?').bind(now - RUN_TTL).run(); // чужие брошенные
      return json({ run: id });
    },
    // { run, score, ms } — счёт закончившейся игры: ms — сколько она шла без пауз
    async 'POST /games/catch/score'({ env, request, me }) {
      if (h.burst && h.burst('catch:' + me.id, 40, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = await h.readBody(request);
      const run = /^[0-9a-f]{32}$/.test(String(b.run || '')) ? String(b.run) : '';
      const { score, ms } = b;
      if (!Number.isInteger(score) || !Number.isInteger(ms) || score < 0 || ms < 0) return fail(400, 'Счёт и время игры — целые числа.');
      if (!run) return fail(409, BAD_RUN);
      await ensure(env);
      const now = Date.now();
      const r = await env.DB.prepare('SELECT at FROM catch_runs WHERE id = ? AND user_id = ?').bind(run, me.id).first();
      if (!r) return fail(409, BAD_RUN);
      // одна игра — один счёт: забег удаляется, и второй такой же запрос (двойное нажатие, повтор) уже не пройдёт
      const del = await env.DB.prepare('DELETE FROM catch_runs WHERE id = ? AND user_id = ?').bind(run, me.id).run();
      if (!(del.meta && del.meta.changes)) return fail(409, BAD_RUN);
      if (now - r.at > RUN_TTL) return fail(409, BAD_RUN);
      if (ms > MAX_MS || ms > now - r.at + SLACK_MS) return fail(400, 'Время игры не сходится с часами сервера.');
      if (score > maxScore(ms)) return fail(400, 'Такой счёт за это время не набрать.');
      const day = dayKey(now, CATCH_TZ);
      const prev = await env.DB.prepare('SELECT MAX(best) AS best FROM catch_days WHERE user_id = ?').bind(me.id).first();
      const was = n0(prev && prev.best);
      // в SET все выражения видят строку до записи: best справа — прежний
      await env.DB.prepare(`INSERT INTO catch_days (user_id, day, best, best_ms, best_at, games, at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?5)
        ON CONFLICT(user_id, day) DO UPDATE SET games = games + 1, at = excluded.at,
          best_ms = CASE WHEN excluded.best > best THEN excluded.best_ms ELSE best_ms END,
          best_at = CASE WHEN excluded.best > best THEN excluded.best_at ELSE best_at END,
          best = MAX(best, excluded.best)`).bind(me.id, day, score, ms, now).run();
      // рекорд — только если было что побить: первая игра на сайте рекордом не считается
      const record = was > 0 && score > was;
      const items = [];
      if (score > 0) items.push({ kind: 'catch_play', ref: day });
      if (record) items.push({ kind: 'catch_record', ref: day });
      let xp = 0;
      if (items.length && h.lvGive) {
        try { const res = await h.lvGive(env, request, me, me.id, items); xp = n0(res && res.gained); } catch (e) { console.error('catch xp', e && e.message); }
      }
      return json({ ...(await stateOf(env, me.id, now)), saved: true, score, record, xp });
    },
  };
}
