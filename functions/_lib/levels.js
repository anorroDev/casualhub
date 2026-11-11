// Казуал Хаб: уровни и опыт. Задумка — docs/levels/design.txt, порядок работы — docs/levels/steps.txt.
// Здесь всё, что решает про опыт: формула уровня, звания, за что сколько опыта и лимиты, начисление и списание.
// Правила меняются только тут; API и комнаты зовут award() / revoke() и сами ничего не считают.
// Папка _lib не становится адресом сайта.
//
// Флаг LEVELS (wrangler.toml): "0" — выключено, ничего не пишется и таблицы не создаются (как будто уровней нет);
// "admins" — опыт копится у всех, видят только админы; "1" — для всех.
//
// Журнал xp_log: одна строка на действие, уникальна по (user_id, kind, ref) — за одно и то же опыт дважды не дают,
// даже если действие удалили и сделали снова. Удаление не стирает строку, а ставит gone = 1: опыт за неё уходит,
// а место в дневном лимите остаётся занятым (иначе «удалил — добавил» обходило бы лимит).
// Итог в user_level.xp всегда пересчитывается суммой по журналу, поэтому не разъедется с ним.
// Уровень не падает: списание уменьшает опыт, но не уровень.

// ---------- уровень ----------
export const LEVEL_BASE = 120; // опыта с 1-го уровня на 2-й
export const LEVEL_STEP = 30; // и на столько больше за каждый следующий

// сколько опыта нужно, чтобы с уровня level перейти на следующий
export const needFor = (level) => LEVEL_BASE + LEVEL_STEP * (Math.max(1, level) - 1);
// сколько опыта всего нужно, чтобы дойти до уровня n
export const totalFor = (n) => (n <= 1 ? 0 : LEVEL_BASE * (n - 1) + (LEVEL_STEP / 2) * (n - 1) * (n - 2));
// уровень по опыту: { level, into — набрано на этом уровне, need — нужно на этом уровне }
export function levelOf(xp) {
  xp = Math.max(0, Math.floor(+xp || 0));
  let level = 1;
  while (totalFor(level + 1) <= xp) level++;
  return { level, into: xp - totalFor(level), need: needFor(level) };
}

// ---------- звания (какой набор показывать — решается к шагу 1.5) ----------
export const RANKS = [
  { from: 1, fun: 'Залётный', plain: 'Новичок' },
  { from: 5, fun: 'Казуал', plain: 'Зритель' },
  { from: 10, fun: 'Диванный критик', plain: 'Казуал' },
  { from: 15, fun: 'Знаток с дивана', plain: 'Ценитель' },
  { from: 20, fun: 'Профессиональный нытик', plain: 'Критик' },
  { from: 30, fun: 'Рецензент от бога', plain: 'Эксперт' },
  { from: 40, fun: 'Хранитель вкуса', plain: 'Мастер вкуса' },
  { from: 50, fun: 'Легенда хаба', plain: 'Легенда хаба' },
];
export const rankOf = (level) => RANKS.reduce((r, x) => (level >= x.from ? x : r), RANKS[0]);

// ---------- за что сколько опыта ----------
// xp — опыт; day — сколько раз в день полным опытом; tail — после дневного лимита ещё столько раз по tail.xp;
// pair — сколько раз в день с одним и тем же человеком (peer); ever — сколько раз за всё время.
// Действие сверх лимитов всё равно пишется в журнал с 0 опыта: так оно не даст опыта и потом, при повторе.
export const RULES = {
  rate: { xp: 10, day: 8, tail: { xp: 2, day: 20 } }, // новая оценка с баллами
  review: { xp: 5, day: 5 }, // отзыв от 100 символов
  rate_full: { xp: 3, day: 8 }, // оценка заполнена целиком: баллы по всем критериям и обложка
  plan_done: { xp: 5, day: 5 }, // оценил то, что было «В планах»
  import: { xp: 1, ever: 100 }, // оценка из импорта (Letterboxd)
  tier: { xp: 25, day: 2 }, // новый тир-лист от 8 элементов
  tier_share: { xp: 5, day: 1 }, // поделился тир-листом
  react: { xp: 3, day: 10, pair: 3 }, // реакция на оценку или тир-лист друга
  comment: { xp: 6, day: 6, pair: 2 }, // комментарий или запись на стене
  got_react: { xp: 3, day: 30, pair: 5 }, // твою оценку отметили реакцией
  got_comment: { xp: 4, day: 20 }, // тебе написали комментарий
  friend: { xp: 15, day: 3 }, // новый друг
  lots_host: { xp: 30, day: 1 }, // провёл сбор лотов до победителя
  lot_add: { xp: 5, day: 3 }, // добавил лот в чужой сбор
  lot_win: { xp: 15 }, // твой лот победил
  visit: { xp: 5, day: 1 }, // зашёл на сайт сегодня
  past: { xp: 0 }, // опыт за прошлое (шаг 1.3): сколько — передаёт пересчёт, без лимитов
};

// ---------- флаг ----------
export const levelsMode = (env) => {
  const v = String((env && env.LEVELS) || '0').trim().toLowerCase();
  return v === '1' || v === 'on' ? 'all' : v === 'admins' ? 'admins' : 'off';
};
export const levelsOn = (env) => levelsMode(env) !== 'off';

// ---------- день человека ----------
// день для лимитов и серий — по часовому поясу человека (Cloudflare даёт его в request.cf.timezone), а не по UTC
export function dayKey(now, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  } catch (e) {
    return new Date(now).toISOString().slice(0, 10);
  }
}
const cleanTz = (tz) => {
  const t = String(tz || '').slice(0, 64);
  if (!t) return '';
  try { new Intl.DateTimeFormat('en-CA', { timeZone: t }); return t; } catch (e) { return ''; }
};

// ---------- таблицы ----------
// создаются при первом начислении, только когда флаг включён: с LEVELS = "0" база не меняется вовсе
const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
export async function ensureLevels(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS xp_log (user_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, xp INTEGER NOT NULL, day TEXT NOT NULL, peer TEXT, at INTEGER NOT NULL, gone INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, kind, ref))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS xp_log_day ON xp_log(user_id, day, kind)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS xp_log_at ON xp_log(user_id, at)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS user_level (user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, tz TEXT, updated_at INTEGER NOT NULL)'),
  ]);
  ready.add(env.DB);
}

// пересчитать итог по журналу и прочитать его; уровень поднимается, если опыта хватает, и никогда не опускается
const SUM_SQL = 'INSERT INTO user_level (user_id, xp, level, updated_at) VALUES (?1, (SELECT COALESCE(SUM(xp), 0) FROM xp_log WHERE user_id = ?1 AND gone = 0), 1, ?2) '
  + 'ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, updated_at = excluded.updated_at';
async function settle(env, uid, now, batchFirst) {
  const res = await env.DB.batch([
    ...batchFirst,
    env.DB.prepare(SUM_SQL).bind(uid, now),
    env.DB.prepare('SELECT xp, level FROM user_level WHERE user_id = ?').bind(uid),
  ]);
  const row = (res[res.length - 1].results || [])[0] || { xp: 0, level: 1 };
  const xp = +row.xp || 0, stored = +row.level || 1;
  const want = levelOf(xp).level;
  let levelUp = null;
  if (want > stored) {
    // «поднял уровень» сообщает только тот запрос, который его действительно поднял
    const up = await env.DB.prepare('UPDATE user_level SET level = ?1 WHERE user_id = ?2 AND level < ?1').bind(want, uid).run();
    if (up && up.meta && up.meta.changes) levelUp = { from: stored, to: want };
  }
  const level = Math.max(stored, want);
  return { res, xp, level, levelUp };
}

// сколько опыта даст это действие сейчас, по лимитам
function priceOf(rule, c) {
  if (rule.ever != null && c.ever >= rule.ever) return 0;
  if (rule.pair != null && c.pair >= rule.pair) return 0;
  if (rule.day == null) return rule.xp;
  if (c.day < rule.day) return rule.xp;
  if (rule.tail && c.day < rule.day + rule.tail.day) return rule.tail.xp;
  return 0;
}

// ---------- начисление ----------
// award(env, uid, kind, ref, { peer, tz, now, xp })
//   kind — ключ из RULES; ref — что именно (номер оценки, реакции, комментария…), за одно и то же дважды не дают;
//   peer — второй человек (для лимита на пару); tz — часовой пояс из request.cf.timezone;
//   xp — только для kind 'past': сколько дать за прошлое.
// Возвращает null, если уровни выключены или такое действие уже было, иначе
//   { kind, gained, xp, level, levelUp: null | { from, to } }.
// Ошибки базы не роняют запрос, ради которого начисляли: опыт — не повод не сохранить оценку.
export async function award(env, uid, kind, ref, opts = {}) {
  if (!levelsOn(env) || !uid || !ref) return null;
  const rule = RULES[kind];
  if (!rule) throw new Error('levels: нет правила ' + kind);
  try {
    await ensureLevels(env);
    const now = opts.now || Date.now();
    const tzIn = cleanTz(opts.tz);
    const known = await env.DB.prepare('SELECT tz FROM user_level WHERE user_id = ?').bind(uid).first();
    const tz = tzIn || (known && known.tz) || 'UTC';
    const day = dayKey(now, tz);
    const id = String(ref).slice(0, 200);
    const peer = opts.peer ? String(opts.peer).slice(0, 64) : null;
    // уже было — ничего не делаем (дешевле, чем считать лимиты)
    if (await env.DB.prepare('SELECT 1 FROM xp_log WHERE user_id = ? AND kind = ? AND ref = ?').bind(uid, kind, id).first()) return null;
    let xp = 0;
    if (kind === 'past') xp = Math.max(0, Math.floor(+opts.xp || 0));
    else {
      const [d, p, e] = await env.DB.batch([
        env.DB.prepare('SELECT COUNT(*) AS n FROM xp_log WHERE user_id = ? AND day = ? AND kind = ?').bind(uid, day, kind),
        env.DB.prepare('SELECT COUNT(*) AS n FROM xp_log WHERE user_id = ? AND day = ? AND kind = ? AND peer = ?').bind(uid, day, kind, peer || ''),
        env.DB.prepare('SELECT COUNT(*) AS n FROM xp_log WHERE user_id = ? AND kind = ?').bind(uid, kind),
      ]);
      const n = (r) => +((r.results || [])[0] || {}).n || 0;
      xp = priceOf(rule, { day: n(d), pair: peer ? n(p) : 0, ever: n(e) });
    }
    const first = [env.DB.prepare('INSERT OR IGNORE INTO xp_log (user_id, kind, ref, xp, day, peer, at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(uid, kind, id, xp, day, peer, now)];
    // часовой пояс запоминаем: начисления без запроса (лоты, пересчёт) считают день по нему
    if (tzIn && (!known || known.tz !== tzIn)) {
      first.push(env.DB.prepare('INSERT INTO user_level (user_id, tz, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET tz = excluded.tz').bind(uid, tzIn, now));
    }
    const s = await settle(env, uid, now, first);
    // строку вставил параллельный запрос раньше нас: это его начисление, не наше
    if (!(s.res[0].meta && s.res[0].meta.changes)) return null;
    return { kind, gained: xp, xp: s.xp, level: s.level, levelUp: s.levelUp };
  } catch (e) {
    console.error('levels award', kind, e && e.message);
    return null;
  }
}

// ---------- списание ----------
// revoke(env, uid, kind, ref) — действие удалили: опыт за него уходит, место в журнале и в лимите остаётся.
// Возвращает null, если списывать нечего, иначе { kind, lost, xp, level }.
export async function revoke(env, uid, kind, ref, opts = {}) {
  if (!levelsOn(env) || !uid || !ref) return null;
  try {
    await ensureLevels(env);
    const now = opts.now || Date.now();
    const id = String(ref).slice(0, 200);
    const row = await env.DB.prepare('SELECT xp FROM xp_log WHERE user_id = ? AND kind = ? AND ref = ? AND gone = 0').bind(uid, kind, id).first();
    if (!row) return null;
    const s = await settle(env, uid, now, [env.DB.prepare('UPDATE xp_log SET gone = 1 WHERE user_id = ? AND kind = ? AND ref = ? AND gone = 0').bind(uid, kind, id)]);
    if (!(s.res[0].meta && s.res[0].meta.changes)) return null;
    return { kind, lost: +row.xp || 0, xp: s.xp, level: s.level };
  } catch (e) {
    console.error('levels revoke', kind, e && e.message);
    return null;
  }
}

// уровень человека для показа: { xp, level, into, need, rank } (без таблиц — первый уровень)
export async function readLevel(env, uid) {
  // после списания опыта может стать меньше, чем нужно для уже набранного уровня: полоса тогда просто пустая
  const base = (xp, level) => { const l = levelOf(xp); const lv = Math.max(level, l.level); return { xp, level: lv, into: Math.max(0, xp - totalFor(lv)), need: needFor(lv), rank: rankOf(lv) }; };
  if (!levelsOn(env) || !uid) return base(0, 1);
  await ensureLevels(env);
  const r = await env.DB.prepare('SELECT xp, level FROM user_level WHERE user_id = ?').bind(uid).first();
  return base(r ? +r.xp || 0 : 0, r ? +r.level || 1 : 1);
}
