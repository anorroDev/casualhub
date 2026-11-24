// Казуал Хаб: адреса API про уровни (/api/levels/…, /api/admin/levels…). Правила — в levels.js, здесь только
// чтение, настройки, рейтинг недели, приглашения, итоги года и админка. Главный файл API подключает эти адреса
// через makeLevelsRoutes(h), передавая свои помощники (ответы, проверки админа, журнал админки).
// Папка _lib не становится адресом сайта.
import {
  levelsMode, levelsOn, ensureLevels, readLevel, levelView, prefsOf, lookOf, unlockedAt, levelsOf, achievementsOf, questState,
  firstSteps, takeNews, dayKey, weekStart, shiftDay, cleanTz, backfillUser, grantSpecial, currentEvent, forgetEvent, RULES, awardMany, CAT_GROUPS, RATING_KINDS,
  ACHIEVEMENTS, REWARDS, NAME_COLORS, PROFILE_BGS, isScored, textLen, award, INVITE_REWARDS, EVENT_REWARDS, INV_SQL, invitesOf, STREAK_BONUS, FIRST_STEPS,
  achBackLetter, ACH_TIER_XP, ACH_ONE_XP, swapQuest, recalcUser, nameKey,
  SEASON_RANKS, seasonRankOf, rankFields, currentSeason, closeSeason, forgetSeason, seasonXpOf, seasonXpMany, seasonPlanLetter, fmtKyiv,
} from './levels.js';
import { FOODS, boughtLooks, ensureShop } from './shop.js';
import { settleWeekTop, weekTop, TOP_MIN, TOP_BASE, TOP_PER, TOP_BONUS_MAX } from './weektop.js';
import { spanMs } from './presence.js';
import { ADVENT, adventDay, adventPending, adventState, adventClaim } from './advent.js';
// еда Васяна, которая открывается уровнем: показывается в «Прогрессе» рядом с наградами оформления
const FOOD_GIFTS = FOODS.filter((f) => f.unlock).map((f) => ({ level: f.unlock, title: f.title }));
import { planSeasonReminder, cancelSeasonReminder, seasonReminderOf, mailOn } from './mailout.js';

// подписи для истории опыта
export const KIND_LABEL = {
  rate: 'Оценка', review: 'Отзыв', rate_full: 'Оценка целиком', plan_done: 'Оценено из «В планах»', album_full: 'Альбом по трекам', album_track: 'Трек в разборе альбома', import: 'Импорт из Letterboxd',
  tier: 'Тир-лист', tier_share: 'Ссылка на тир-лист', react: 'Реакция другу', comment: 'Комментарий',
  got_react: 'Реакция на твою оценку', got_comment: 'Комментарий тебе', friend: 'Новый друг', lots_host: 'Сбор лотов до победителя',
  lot_add: 'Лот в чужой сбор', lot_win: 'Твой лот победил', visit: 'Заход на сайт', invite: 'Приглашение', quest: 'Задание дня',
  quest_all: 'Все задания дня', quest_week: 'Задание недели', streak: 'Серия дней', first: 'Первые шаги', past: 'Опыт за прошлое',
  admin: 'От администрации', event: 'Тематическая неделя', gift: 'Подарок из почты', ach: 'Достижение', mentor: 'Друг по твоей ссылке дошёл до 10-го уровня',
  riddle: 'Загадка дня', guess: 'Угадай оценку друга', predict_win: 'Угадал победителя сбора', bingo_win: 'Линия в бинго', king_host: 'Провёл «Царя Горы»', king_vote: 'Голос в «Царе Горы»',
  tier_coop: '«Тир-лист вместе»', tier_coop_host: 'Провёл «Тир-лист вместе»',
};
// таблица «За что сколько опыта» в «Прогрессе»: цифры — прямо из RULES, подписи — в levels-ui.js (XP_TABLE)
const xpRules = () => Object.fromEntries(Object.entries(RULES).filter(([, r]) => !r.given).map(([k, r]) => [k, { xp: r.xp, day: r.day, tail: r.tail, pair: r.pair, ever: r.ever }]));
const INVITE_RE = /^[a-z0-9]{8}$/;
const FOUNDERS_BEFORE = Date.UTC(2026, 10, 12); // кто зарегистрировался до запуска уровней — «Основатель хаба»
const parse = (s, d) => { try { const v = s ? JSON.parse(s) : null; return v == null ? d : v; } catch (e) { return d; } };
const randCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => 'abcdefghijkmnopqrstuvwxyz23456789'[b % 33]).join('');

// опыт за прошлое — сам, при первом заходе после запуска (нет строки в user_level): уровень и «Основатель хаба»
// появляются сразу, без кнопки в админке. Повторный вызов ничего не удваивает
export async function ensurePast(env, uid) {
  if (!levelsOn(env) || !uid) return;
  try {
    await ensureLevels(env);
    if (await env.DB.prepare('SELECT 1 FROM user_level WHERE user_id = ?').bind(uid).first()) return;
    await backfillUser(env, uid, { founderBefore: FOUNDERS_BEFORE });
  } catch (e) { console.error('levels past', e && e.message); }
}
// видит ли человек уровни: при LEVELS = "admins" — только админы
export async function levelsVisible(env, me, h) {
  const m = levelsMode(env);
  if (m === 'all') return true;
  if (m !== 'admins' || !me) return false;
  return !!(h.adminCandidate(me, env) || (await h.isAdmin(env, me)));
}
export const tzOf = (request) => cleanTz(request && request.cf && request.cf.timezone);

// письма человеку: всем (to_id пустой) и лично ему, кроме просроченных; новые сверху
const MAIL_SQL = `SELECT g.id, g.kind, g.title, g.body, g.xp, g.at, g.until, COALESCE(b.read, 0) AS read, COALESCE(b.claimed, 0) AS claimed
  FROM gifts g LEFT JOIN gift_box b ON b.gift_id = g.id AND b.user_id = ?1
  WHERE (g.to_id IS NULL OR g.to_id = ?1) AND (g.until IS NULL OR g.until > ?2) AND g.kind != 'news' ORDER BY g.at DESC LIMIT 60`;
// «Почта» — только для наград и подарков: новости (kind 'news', копии рассылок до 12 ноября) в ней не показываются,
// их место — «Что нового». Строки в gifts остаются, но ни в списке, ни в счётчике непрочитанных их нет
// «Первая десятка»: первые 10 аккаунтов сайта (по дате регистрации) получают достижение и личное письмо
// с котиком Васяном (kind 'vasyan', id 'vasyan:<uid>'). Забрал письмо — Васян гуляет у него внизу экрана (vasyan.js)
const FIRST_N = 10;
let firstIds = null, firstAt = 0;
async function firstTen(env) {
  if (firstIds && Date.now() - firstAt < 600e3) return firstIds;
  const { results } = await env.DB.prepare('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT ?').bind(FIRST_N).all();
  firstIds = new Set((results || []).map((r) => r.id)); firstAt = Date.now();
  return firstIds;
}
async function ensureFirst(env, uid) {
  try {
    if (!(await firstTen(env)).has(uid)) return;
    const gid = 'vasyan:' + uid;
    if (await env.DB.prepare('SELECT 1 FROM gifts WHERE id = ?').bind(gid).first()) return;
    await grantSpecial(env, uid, 'first10');
    await env.DB.prepare("INSERT OR IGNORE INTO gifts (id, to_id, kind, title, body, xp, at) VALUES (?, ?, 'vasyan', ?, ?, 0, ?)").bind(gid, uid,
      'Котик Васян — тебе',
      'Ты в первой десятке людей на Казуал Хабе. В подарок — котик Васян: он будет гулять у тебя внизу экрана, его можно гладить и кормить из миски в левом углу. Таких котиков всего 10.',
      Date.now()).run();
  } catch (e) { console.error('first10', e && e.message); }
}
const vasyanOwned = async (env, uid) => !!(await env.DB.prepare('SELECT 1 FROM gift_box WHERE gift_id = ? AND user_id = ? AND claimed = 1').bind('vasyan:' + uid, uid).first());
export async function mailUnread(env, uid) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (${MAIL_SQL}) WHERE read = 0 OR ((xp > 0 OR kind = 'vasyan') AND claimed = 0)`).bind(uid, Date.now()).first();
  // в декабре — ещё подарок дня новогоднего календаря, пока его не забрали (advent.js)
  let pend = false;
  try { pend = await adventPending(env, uid); } catch (e) { console.error('advent unread', e && e.message); }
  return (+(r && r.n) || 0) + (pend ? 1 : 0);
}

// сезон для окна «Прогресс» (поле season в /levels/me): номер, срок сброса, мой опыт и звание за сезон,
// все звания по возрастанию порога и мои прошлые сезоны (новые сверху, не больше 12) — одной пачкой
export async function seasonOf(env, uid, s) {
  if (!s) return null;
  const [sx, hist] = await env.DB.batch([
    env.DB.prepare('SELECT COALESCE(SUM(xp), 0) AS s FROM xp_log WHERE user_id = ? AND gone = 0 AND at >= ?').bind(uid, s.start),
    env.DB.prepare('SELECT r.season AS n, s.title, r.rank, r.xp, r.place FROM season_results r JOIN seasons s ON s.n = r.season WHERE r.user_id = ? ORDER BY r.season DESC LIMIT 12').bind(uid),
  ]);
  const xp = +(((sx.results || [])[0] || {}).s) || 0;
  return {
    n: s.n, title: s.title, start: s.start, end: s.end, xp, rank: seasonRankOf(xp).id,
    ranks: SEASON_RANKS.map((r) => ({ id: r.id, title: r.title, xp: r.xp })),
    history: (hist.results || []).map((x) => ({ n: +x.n, title: x.title, rank: x.rank, xp: +x.xp || 0, place: +x.place || 0 })),
  };
}

export function makeLevelsRoutes(h) {
  const { json, fail } = h;
  const off = () => json({ on: false });
  const gate = async (env, me) => levelsOn(env) && (await levelsVisible(env, me, h));
  // строка уровня и сколько друзей по ссылке дошли до 3-го уровня (inv — для наград за приглашения в lookOf)
  const userRow = (env, uid) => env.DB.prepare(`SELECT ul.*, ${INV_SQL} FROM user_level ul WHERE ul.user_id = ?`).bind(uid).first();

  return {
    // всё про мой прогресс одним запросом: уровень, серия, задания, первые шаги, оформление
    async 'GET /levels/me'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensurePast(env, me.id);
      const now = Date.now();
      // опыт за достижения, полученные до того, как за них стали его давать, — письмом в «Почту», забирается кнопкой
      try { await achBackLetter(env, me.id, now); } catch (e) { console.error('levels ach letter', e && e.message); }
      // неделя закончилась: топ-5 сайта получают рофланы письмом (weektop.js; разложится один раз)
      try { await settleWeekTop(env, now); } catch (e) { console.error('levels week top', e && e.message); }
      const row = (await userRow(env, me.id)) || {};
      const tz = tzOf(request) || row.tz || 'UTC';
      const today = dayKey(now, tz);
      const lv = levelView(+row.xp || 0, +row.level || 1);
      const prefs = prefsOf(row);
      const admin = !!(h.adminCandidate(me, env) || (await h.isAdmin(env, me)));
      const bought = (await boughtLooks(env, [me.id])).get(me.id) || null; // оформление, купленное в магазине раньше уровня
      await ensureFirst(env, me.id);
      // сезон первым: если срок вышел, этот же запрос его закроет, и опыт сезона будет уже нового
      const season = await seasonOf(env, me.id, await currentSeason(env, now));
      const [quests, steps, ev] = await Promise.all([questState(env, me.id, { now, today, row }), firstSteps(env, me.id), currentEvent(env, now)]);
      const alive = row.streak_day === today || row.streak_day === shiftDay(today, -1) || (row.streak_day === shiftDay(today, -2) && +row.freezes > 0);
      return json({
        on: true, mode: levelsMode(env), ...lv, ...rankFields(season.xp), season, prefs, look: lookOf(row, season.xp, bought), unlocked: unlockedAt(lv.level, false, bought, invitesOf(row)), admin,
        streak: { days: alive ? +row.streak || 0 : 0, best: +row.best_streak || 0, freezes: row.freezes == null ? 1 : +row.freezes, today: row.streak_day === today },
        quests, steps: steps.every((s) => s.paid) ? null : steps,
        event: ev ? { title: ev.title, kinds: ev.kinds, mult: ev.mult, until: ev.until } : null,
        rewards: REWARDS, foods: FOOD_GIFTS, colors: NAME_COLORS, bgs: Object.keys(PROFILE_BGS), invRewards: INVITE_REWARDS, invites: invitesOf(row),
        xpRules: xpRules(), streakBonus: STREAK_BONUS, firstXp: FIRST_STEPS.map((f) => f.xp), achXp: { tiers: ACH_TIER_XP, one: ACH_ONE_XP },
        recap: recapOpen(now) || admin ? 2026 : null, // админ видит итоги заранее, чтобы проверить их до декабря
        advent: adventDay(now) ? { day: adventDay(now), frameAt: ADVENT.frameAt } : null, evRewards: EVENT_REWARDS, // новогодний календарь и награды за ивенты
        mail: await mailUnread(env, me.id),
        vasyan: await vasyanOwned(env, me.id),
      });
    },
    // почта: подарки от администрации и письма о новых уровнях
    async 'GET /levels/mail'({ env, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const now = Date.now();
      const { results } = await env.DB.prepare(MAIL_SQL).bind(me.id, now).all();
      return json({
        items: (results || []).map((g) => ({ id: g.id, kind: g.kind, title: g.title, body: g.body || '', xp: +g.xp || 0, at: +g.at, until: g.until ? +g.until : null, read: !!g.read, claimed: !!g.claimed })),
        advent: await adventState(env, me.id, now), // новогодний календарь — только в декабре
      });
    },
    // новогодний календарь: забрать подарок дня (рофланы; на 20-м дне — ещё и рамка «Новый год»)
    async 'POST /levels/advent'({ env, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const r = await adventClaim(env, me.id, Date.now());
      if (!r.ok) return fail(r.status, r.error);
      return json({ ...r, unread: await mailUnread(env, me.id) });
    },
    // открыл почту — всё прочитано (забрать подарки всё равно нужно кнопкой)
    async 'POST /levels/mail/read'({ env, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const now = Date.now();
      const { results } = await env.DB.prepare(MAIL_SQL).bind(me.id, now).all();
      const unread = (results || []).filter((g) => !g.read);
      if (unread.length) await env.DB.batch(unread.map((g) => env.DB.prepare('INSERT INTO gift_box (gift_id, user_id, read, at) VALUES (?, ?, 1, ?) ON CONFLICT(gift_id, user_id) DO UPDATE SET read = 1').bind(g.id, me.id, now)));
      return json({ ok: true, unread: await mailUnread(env, me.id) });
    },
    // забрать подарок: опыт начисляется один раз
    async 'POST /levels/mail/claim'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const { id } = await h.readBody(request);
      const now = Date.now();
      const g = await env.DB.prepare('SELECT id, kind, xp, to_id, until FROM gifts WHERE id = ?').bind(String(id || '')).first();
      if (!g || (g.to_id && g.to_id !== me.id) || (g.until && g.until <= now)) return fail(404, 'Такого подарка нет или он уже истёк.');
      if (g.kind === 'roflans') { // награда за топ недели: рофланы в журнал магазина, один раз
        if (!(+g.xp > 0)) return fail(400, 'В этом письме нечего забирать.');
        await ensureShop(env);
        const w = await env.DB.prepare('INSERT INTO gift_box (gift_id, user_id, read, claimed, at) VALUES (?1, ?2, 1, 1, ?3) ON CONFLICT(gift_id, user_id) DO UPDATE SET claimed = 1, read = 1 WHERE claimed = 0').bind(g.id, me.id, now).run();
        if (!(w.meta && w.meta.changes)) return fail(409, 'Этот подарок уже забран.');
        await env.DB.prepare("INSERT OR IGNORE INTO shop_log (id, user_id, item, delta, reason, note, by_id, at) VALUES (?, ?, NULL, ?, 'top', ?, NULL, ?)")
          .bind('gift:' + g.id + ':' + me.id, me.id, +g.xp, String(g.title || '').slice(0, 120), now).run();
        return json({ ok: true, gained: 0, roflans: +g.xp, unread: await mailUnread(env, me.id) });
      }
      if (g.kind === 'vasyan') { // котик, не опыт
        await env.DB.prepare('INSERT INTO gift_box (gift_id, user_id, read, claimed, at) VALUES (?1, ?2, 1, 1, ?3) ON CONFLICT(gift_id, user_id) DO UPDATE SET claimed = 1, read = 1').bind(g.id, me.id, now).run();
        return json({ ok: true, gained: 0, vasyan: true, unread: await mailUnread(env, me.id) });
      }
      if (!(+g.xp > 0)) return fail(400, 'В этом письме нечего забирать.');
      const w = await env.DB.prepare('INSERT INTO gift_box (gift_id, user_id, read, claimed, at) VALUES (?1, ?2, 1, 1, ?3) ON CONFLICT(gift_id, user_id) DO UPDATE SET claimed = 1, read = 1 WHERE claimed = 0').bind(g.id, me.id, now).run();
      if (!(w.meta && w.meta.changes)) return fail(409, 'Этот подарок уже забран.');
      const r = await awardMany(env, me.id, [{ kind: 'gift', ref: g.id, xp: +g.xp }], { now, tz: tzOf(request) });
      h.markNews(request, r);
      return json({ ok: true, gained: r ? r.gained : 0, level: r ? r.level : null, unread: await mailUnread(env, me.id) });
    },
    // бесплатная замена задания дня (одна в день): { code } — какое заменить
    async 'POST /levels/quest/swap'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const { code } = await h.readBody(request);
      const now = Date.now();
      const row = (await userRow(env, me.id)) || {};
      const r = await swapQuest(env, me.id, String(code || ''), { now, today: dayKey(now, tzOf(request) || row.tz || 'UTC') });
      return r.ok ? json(r) : fail(r.status || 400, r.error);
    },
    // новые награды (плашки): отдаются один раз
    async 'GET /levels/news'({ env, me }) {
      if (!(await gate(env, me))) return json({ news: [] });
      return json({ news: await takeNews(env, me.id) });
    },
    // достижения: свои — все (закрытые серым, скрытые «???»), чужие — только полученные
    async 'GET /levels/achievements'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const id = new URL(request.url).searchParams.get('id') || me.id;
      if (id !== me.id) {
        const row = await userRow(env, id);
        if (!row || prefsOf(row).hideLevel) return json({ items: [] });
        return json({ items: (await achievementsOf(env, id)).filter((a) => a.got) });
      }
      return json({ items: await achievementsOf(env, me.id) });
    },
    // последние 40 начислений, с названиями оценок
    async 'GET /levels/history'({ env, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const { results } = await env.DB.prepare('SELECT kind, ref, xp, at, gone FROM xp_log WHERE user_id = ? AND (xp != 0 OR gone = 1) ORDER BY at DESC, rowid DESC LIMIT 40').bind(me.id).all();
      const sh = await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(me.id).first();
      const names = new Map();
      try { const d = JSON.parse((sh && sh.data) || '{}'); for (const r of (Array.isArray(d) ? d : d.ratings || [])) if (r && r.id) names.set(r.id, String(r.name || '').slice(0, 80)); } catch (e) {}
      const items = (results || []).map((r) => ({
        what: KIND_LABEL[r.kind] || r.kind, name: ['rate', 'review', 'rate_full', 'plan_done', 'album_full', 'import'].includes(r.kind) ? names.get(r.ref) || '' : '',
        xp: +r.xp || 0, at: +r.at || 0, gone: !!r.gone,
      }));
      return json({ items });
    },
    // настройки: скрыть уровень, рейтинг, уведомления, витрина, рамка, цвет ника, фон
    async 'PUT /levels/prefs'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const b = await h.readBody(request);
      const row = (await userRow(env, me.id)) || {};
      const cur = prefsOf(row);
      const bought = (await boughtLooks(env, [me.id])).get(me.id) || null;
      const lv = levelView(+row.xp || 0, +row.level || 1).level, u = unlockedAt(lv, false, bought, invitesOf(row));
      const next = { ...cur }; // оформление — по уровню у всех, у админа тоже
      for (const k of ['intro', 'hideLevel', 'hideBoard', 'notify', 'anim']) if (typeof b[k] === 'boolean') next[k] = b[k];
      if (Array.isArray(b.showcase)) {
        const own = new Set(((await env.DB.prepare('SELECT code FROM achievements WHERE user_id = ?').bind(me.id).all()).results || []).map((x) => x.code));
        next.showcase = [...new Set(b.showcase.map(String))].filter((c) => own.has(c)).slice(0, 3);
      }
      if (typeof b.frame === 'string') { if (b.frame && !u.frames.includes(b.frame)) return fail(403, 'Эта рамка ещё не открыта.'); next.frame = b.frame; }
      if (typeof b.color === 'string') { if (b.color && !u.colors.includes(b.color)) return fail(403, 'Этот цвет ещё не открыт.'); next.color = b.color; }
      if (typeof b.bg === 'string') { if (b.bg && !u.bgs.includes(b.bg)) return fail(403, 'Этот фон ещё не открыт.'); next.bg = b.bg; }
      if (typeof b.nick === 'string') { if (b.nick && !u.nicks.includes(b.nick)) return fail(403, 'Этот ник ещё не открыт.'); next.nick = b.nick; }
      if (typeof b.font === 'string') { if (b.font && !u.fonts.includes(b.font)) return fail(403, 'Этот шрифт ещё не открыт.'); next.font = b.font; }
      if (typeof b.fx === 'string') { if (b.fx && !u.fx.includes(b.fx)) return fail(403, 'Этот эффект ещё не открыт.'); next.fx = b.fx; }
      if (typeof b.pet === 'boolean') { if (b.pet && !u.pet) return fail(403, 'Васян откроется на 25-м уровне.'); next.pet = b.pet; }
      await env.DB.prepare('INSERT INTO user_level (user_id, updated_at, prefs) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET prefs = ?3').bind(me.id, Date.now(), JSON.stringify(next)).run();
      const sxp = await seasonXpOf(env, me.id, await currentSeason(env));
      return json({ ok: true, prefs: next, look: lookOf({ ...row, prefs: JSON.stringify(next) }, sxp, bought) });
    },
    // кружки уровня у чужих аватаров: ?ids=a,b,c
    async 'GET /levels/users'({ env, request, me }) {
      if (!(await gate(env, me))) return json({ users: {} });
      const ids = String(new URL(request.url).searchParams.get('ids') || '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f]{24}$/.test(x)).slice(0, 200);
      const uniq = [...new Set(ids)];
      return json({ users: await levelsOf(env, uniq, await boughtLooks(env, uniq)) });
    },
    // профиль человека: уровень, звание, оформление и витрина
    async 'GET /levels/profile'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const id = new URL(request.url).searchParams.get('id') || me.id;
      let row = await userRow(env, id);
      // строки уровня ещё нет (опыта не было: давно не заходил) — у человека всё равно 1-й уровень и звание сезона,
      // а не пустое место в профиле
      if (!row && (await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(id).first())) row = { user_id: id, xp: 0, level: 1, prefs: null };
      if (!row || (id !== me.id && prefsOf(row).hideLevel)) return json({ on: true, hidden: true });
      const lv = levelView(+row.xp || 0, +row.level || 1);
      const show = prefsOf(row).showcase;
      const all = await achievementsOf(env, id);
      const showcase = show.map((c) => all.find((a) => a.code === c && a.got)).filter(Boolean);
      const sxp = await seasonXpOf(env, id, await currentSeason(env));
      const bought = (await boughtLooks(env, [id])).get(id) || null;
      return json({ on: true, level: lv.level, ...rankFields(sxp), seasonXp: sxp, xp: lv.xp, into: lv.into, need: lv.need, look: lookOf(row, sxp, bought), showcase, achievements: all.filter((a) => a.got).length });
    },
    // рейтинг недели: друзья или весь сайт. «Лучший прогресс» — рост к прошлой неделе
    async 'GET /levels/board'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const scope = new URL(request.url).searchParams.get('scope') === 'all' ? 'all' : 'friends';
      const row = (await userRow(env, me.id)) || {};
      const today = dayKey(Date.now(), tzOf(request) || row.tz || 'UTC');
      const wk = weekStart(today), prev = shiftDay(wk, -7);
      let ids = null;
      if (scope === 'friends') {
        const { results } = await env.DB.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(me.id).all();
        ids = [me.id, ...(results || []).map((x) => x.id)].slice(0, 90);
      }
      // за всё время: весь набранный опыт (user_level.xp), топ-50 и своё место, если в топ не попал
      if (new URL(request.url).searchParams.get('period') === 'all') {
        const inIds = ids ? `AND ul.user_id IN (${ids.map(() => '?').join(', ')})` : '';
        const { results: all } = await env.DB.prepare(
          `SELECT ul.user_id, ul.xp, ul.level, ul.prefs, u.username, u.uname FROM user_level ul JOIN users u ON u.id = ul.user_id
           WHERE ul.xp > 0 ${inIds} ORDER BY ul.xp DESC, ul.user_id LIMIT 120`
        ).bind(...(ids || [])).all();
        const seen = (all || []).filter((r) => r.user_id === me.id || !prefsOf(r).hideBoard).map((r) => ({
          id: r.user_id, username: r.username, handle: r.uname, xp: +r.xp || 0,
          level: prefsOf(r).hideLevel && r.user_id !== me.id ? null : levelView(+r.xp || 0, +r.level || 1).level, me: r.user_id === me.id,
        }));
        const top = seen.slice(0, 50).map((x, i) => ({ ...x, place: i + 1 }));
        let mine = null;
        if (!top.some((x) => x.me)) {
          const my = (await env.DB.prepare('SELECT xp, level FROM user_level WHERE user_id = ?').bind(me.id).first()) || { xp: 0, level: 1 };
          if (+my.xp > 0) {
            // место без учёта скрывших себя из рейтинга: на «Весь сайт» хватает одного счётчика
            const above = ids ? seen.filter((x) => x.xp > +my.xp).length
              : +((await env.DB.prepare('SELECT COUNT(*) AS n FROM user_level WHERE xp > ?').bind(+my.xp).first()) || {}).n || 0;
            mine = { id: me.id, username: me.username, handle: me.uname || me.handle, xp: +my.xp, level: levelView(+my.xp, +my.level || 1).level, me: true, place: above + 1 };
          }
        }
        const shownAll = [...top, ...(mine ? [mine] : [])].filter((x) => x.level != null);
        const sxa = await seasonXpMany(env, [...new Set(shownAll.map((x) => x.id))], await currentSeason(env));
        const rk = (x) => (x.level != null ? { ...x, ...rankFields(sxa[x.id] || 0) } : x);
        return json({ scope, period: 'all', top: top.map(rk), mine: mine ? rk(mine) : null });
      }
      const where = ids ? `AND l.user_id IN (${ids.map(() => '?').join(', ')})` : '';
      const { results } = await env.DB.prepare(
        `SELECT l.user_id, SUM(CASE WHEN l.day >= ?1 THEN l.xp ELSE 0 END) AS week, SUM(CASE WHEN l.day < ?1 THEN l.xp ELSE 0 END) AS prev,
                u.username, u.uname, ul.prefs, ul.xp, ul.level
         FROM xp_log l JOIN users u ON u.id = l.user_id LEFT JOIN user_level ul ON ul.user_id = l.user_id
         WHERE l.day >= ?2 AND l.gone = 0 ${where} GROUP BY l.user_id`
      ).bind(wk, prev, ...(ids || [])).all();
      const list = (results || []).filter((r) => r.user_id === me.id || !prefsOf(r).hideBoard).map((r) => ({
        id: r.user_id, username: r.username, handle: r.uname, week: +r.week || 0, prev: +r.prev || 0,
        level: prefsOf(r).hideLevel && r.user_id !== me.id ? null : levelView(+r.xp || 0, +r.level || 1).level, me: r.user_id === me.id,
      }));
      const top = list.filter((x) => x.week > 0).sort((a, b) => b.week - a.week).slice(0, 50).map((x, i) => ({ ...x, place: i + 1 }));
      // лучший прогресс: больше всех вырос относительно прошлой недели (от 30 опыта, чтобы не выигрывал «с 1 до 5»)
      const grown = list.filter((x) => x.week >= 30).map((x) => ({ ...x, growth: x.prev ? Math.round(((x.week - x.prev) / x.prev) * 100) : null }))
        .filter((x) => x.growth === null || x.growth > 0).sort((a, b) => (b.growth === null ? 1e9 : b.growth) - (a.growth === null ? 1e9 : a.growth))[0] || null;
      // звание сезона у каждого в списке (у скрывших уровень — нет)
      const shown = [...top, ...(grown ? [grown] : [])].filter((x) => x.level != null);
      const sx = await seasonXpMany(env, [...new Set(shown.map((x) => x.id))], await currentSeason(env));
      const withRank = (x) => (x.level != null ? { ...x, ...rankFields(sx[x.id] || 0) } : x);
      // награда топ-5 сайта за эту неделю (сколько получит каждый, если неделя закончится сейчас) — и в «Друзьях»
      const prizes = new Map((await weekTop(env, wk)).map((t) => [t.id, t]));
      const withPrize = (x) => (prizes.has(x.id) ? { ...x, prize: prizes.get(x.id).prize, sitePlace: prizes.get(x.id).place } : x);
      return json({ scope, week: wk, top: top.map(withRank).map(withPrize), best: grown ? withRank(grown) : null, prize: { min: TOP_MIN, base: TOP_BASE, per: TOP_PER, max: TOP_BONUS_MAX } });
    },
    // личная ссылка-приглашение и всё про приглашения: кто пришёл (уровень, заявка в друзья, что засчитано),
    // награды за друзей, кто позвал меня самого
    async 'GET /levels/invite'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      let r = await env.DB.prepare('SELECT code FROM invites WHERE user_id = ?').bind(me.id).first();
      if (!r) {
        for (let i = 0; i < 4 && !r; i++) {
          const code = randCode();
          const w = await env.DB.prepare('INSERT OR IGNORE INTO invites (code, user_id, at) VALUES (?, ?, ?)').bind(code, me.id, Date.now()).run();
          if (w.meta && w.meta.changes) r = { code };
        }
      }
      if (!r) return fail(500, 'Не получилось создать ссылку, попробуй ещё раз.');
      const [ppl, by] = await env.DB.batch([
        env.DB.prepare(`SELECT i.user_id, i.rewarded, i.at, u.username, u.uname, ul.xp, ul.level, f.status, f.requested_by
          FROM invited i JOIN users u ON u.id = i.user_id
          LEFT JOIN user_level ul ON ul.user_id = i.user_id
          LEFT JOIN friendships f ON f.a = MIN(i.user_id, ?1) AND f.b = MAX(i.user_id, ?1)
          WHERE i.by_id = ?1 ORDER BY i.at DESC LIMIT 60`).bind(me.id),
        env.DB.prepare('SELECT i.rewarded, u.id, u.username, u.uname FROM invited i JOIN users u ON u.id = i.by_id WHERE i.user_id = ?').bind(me.id),
      ]);
      const list = ppl.results || [];
      const counted = list.filter((x) => +x.rewarded > 0).length;
      const b = (by.results || [])[0];
      return json({
        code: r.code, url: new URL(request.url).origin + '/?invite=' + r.code, xp: RULES.invite.xp, mentorXp: RULES.mentor.xp,
        people: list.map((x) => ({
          id: x.user_id, username: x.username, handle: x.uname, at: +x.at || 0,
          level: levelView(+x.xp || 0, +x.level || 1).level, stage: +x.rewarded || 0,
          // дружба: friend — уже друзья, incoming — новичок ждёт, когда примешь его заявку, '' — заявки нет (отклонил)
          rel: x.status === 'accepted' ? 'friend' : x.status === 'pending' ? (x.requested_by === me.id ? 'sent' : 'incoming') : '',
        })),
        counted, mentors: list.filter((x) => +x.rewarded > 1).length,
        rewards: INVITE_REWARDS.map((w) => ({ ...w, got: counted >= w.n })),
        by: b ? { id: b.id, username: b.username, handle: b.uname, stage: +b.rewarded || 0 } : null,
      });
    },
    // кто зовёт по ссылке: ник для приветствия новичку (без входа). Только при уровнях для всех
    async 'GET /levels/invite/who'({ env, request }) {
      if (levelsMode(env) !== 'all') return json({});
      const code = String(new URL(request.url).searchParams.get('code') || '');
      if (!INVITE_RE.test(code)) return json({});
      await ensureLevels(env);
      const r = await env.DB.prepare('SELECT u.username FROM invites i JOIN users u ON u.id = i.user_id WHERE i.code = ?').bind(code).first();
      return json(r ? { username: r.username, xp: RULES.invite.xp } : {});
    },
    // итоги года: что было за год, одной карточкой
    async 'GET /levels/recap'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      const now = Date.now();
      const admin = h.adminCandidate(me, env) || (await h.isAdmin(env, me));
      if (!recapOpen(now) && !admin) return fail(404, 'Итоги года откроются в декабре.');
      await ensureLevels(env);
      const data = await recap(env, me.id, 2026);
      if (recapOpen(now)) await grantSpecial(env, me.id, 'recap2026'); // предпросмотр админа ачивку не выдаёт
      return json(data);
    },

    // ---------- админка ----------
    async 'GET /admin/levels'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return json({ mode: 'off', users: [], event: null });
      await ensureLevels(env);
      const s = await currentSeason(env);
      const { results } = await env.DB.prepare(
        `SELECT u.id, u.username, u.uname, ul.xp, ul.level, ul.streak, ul.best_streak, ul.streak_day, ul.prefs,
                (SELECT COUNT(*) FROM achievements a WHERE a.user_id = u.id) AS ach,
                (SELECT COALESCE(SUM(xp), 0) FROM xp_log l WHERE l.user_id = u.id AND l.gone = 0 AND l.at > ?1) AS week,
                (SELECT COALESCE(SUM(xp), 0) FROM xp_log l WHERE l.user_id = u.id AND l.gone = 0 AND l.at >= ?2) AS season
         FROM users u LEFT JOIN user_level ul ON ul.user_id = u.id ORDER BY COALESCE(ul.xp, 0) DESC LIMIT 200`
      ).bind(Date.now() - 7 * 864e5, s ? s.start : Date.now() + 1).all();
      const ev = await currentEvent(env);
      // подозрительно быстро: больше трёх дневных лимитов за последний час
      const { results: fast } = await env.DB.prepare('SELECT user_id, COUNT(*) AS n FROM xp_log WHERE at > ? AND xp > 0 GROUP BY user_id HAVING n > 60').bind(Date.now() - 3600e3).all();
      const flagged = new Set((fast || []).map((x) => x.user_id));
      return json({
        mode: levelsMode(env), event: ev, cats: Object.entries(CAT_GROUPS).map(([k, g]) => ({ k, label: g.label })), kinds: Object.keys(RULES).filter((k) => !RULES[k].given && !['visit', 'quest', 'quest_all', 'quest_week', 'invite'].includes(k)).map((k) => ({ k, label: KIND_LABEL[k] || k })),
        users: (results || []).map((r) => {
          const lv = levelView(+r.xp || 0, +r.level || 1);
          return { id: r.id, username: r.username, handle: r.uname, xp: lv.xp, level: lv.level, ...rankFields(+r.season || 0), season: +r.season || 0, streak: +r.streak || 0, best: +r.best_streak || 0, ach: +r.ach || 0, week: +r.week || 0, hidden: prefsOf(r).hideLevel, fast: flagged.has(r.id) };
        }),
      });
    },
    async 'GET /admin/levels/log'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureLevels(env);
      const id = new URL(request.url).searchParams.get('id') || '';
      const { results } = await env.DB.prepare('SELECT kind, ref, xp, day, peer, at, gone FROM xp_log WHERE user_id = ? ORDER BY at DESC, rowid DESC LIMIT 200').bind(id).all();
      return json({ items: (results || []).map((r) => ({ ...r, what: KIND_LABEL[r.kind] || r.kind })) });
    },
    // опыт за прошлое всем (повторный запуск ничего не удваивает)
    async 'POST /admin/levels/backfill'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return fail(400, 'Уровни выключены (LEVELS = "0").');
      const { results } = await env.DB.prepare('SELECT id FROM users ORDER BY created_at').all();
      const out = [];
      for (const u of results || []) {
        const lv = await backfillUser(env, u.id, { founderBefore: FOUNDERS_BEFORE });
        out.push({ id: u.id, xp: lv.xp, level: lv.level });
      }
      await h.adminLog(env, request, me, `levels: backfill ${out.length}`, true);
      return json({ ok: true, users: out });
    },
    // пересчёт опыта по нынешним правилам (recalcUser в levels.js): { apply, after } — по 10 человек за запрос (разбор полки
    // и журнала каждого — время процессора), админка зовёт, пока next не пустой. apply: false — только показать, что изменится
    async 'POST /admin/levels/recalc'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return fail(400, 'Уровни выключены (LEVELS = "0").');
      await ensureLevels(env);
      const b = (await h.readBody(request)) || {};
      const after = /^[0-9a-f]{24}$/.test(String(b.after || '')) ? String(b.after) : '';
      const { results } = await env.DB.prepare('SELECT ul.user_id AS id, u.username, u.uname FROM user_level ul LEFT JOIN users u ON u.id = ul.user_id WHERE ul.user_id > ? ORDER BY ul.user_id LIMIT 10').bind(after).all();
      const list = results || [], users = [];
      for (const x of list) {
        const r = await recalcUser(env, x.id, { apply: b.apply === true });
        if (r.changed) users.push({ ...r, username: x.username || '', handle: x.uname || '' });
      }
      if (b.apply === true && users.length) await h.adminLog(env, request, me, `levels: recalc ${users.length} (${users.reduce((a, r) => a + r.xpAfter - r.xpBefore, 0)} xp)`, true);
      return json({ users, scanned: list.length, next: list.length === 10 ? list[list.length - 1].id : '' });
    },
    // поправить опыт вручную: +N или −N с пометкой
    async 'POST /admin/levels/adjust'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureLevels(env);
      const b = await h.readBody(request);
      const id = String(b.id || ''), xp = Math.trunc(+b.xp || 0), note = String(b.note || '').slice(0, 120);
      if (!/^[0-9a-f]{24}$/.test(id) || !xp || Math.abs(xp) > 100000) return fail(400, 'Нужен человек и число опыта.');
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO xp_log (user_id, kind, ref, xp, day, peer, at) VALUES (?, 'admin', ?, ?, ?, ?, ?)").bind(id, 'adm:' + now, xp, dayKey(now, 'UTC'), note || null, now),
        env.DB.prepare("INSERT INTO user_level (user_id, xp, level, updated_at) VALUES (?1, (SELECT COALESCE(SUM(xp), 0) FROM xp_log WHERE user_id = ?1 AND gone = 0), 1, ?2) ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, updated_at = excluded.updated_at").bind(id, now),
      ]);
      const lv = await readLevel(env, id);
      await h.adminLog(env, request, me, `levels: ${xp > 0 ? '+' : ''}${xp} ${id}${note ? ' (' + note + ')' : ''}`, true);
      return json({ ok: true, xp: lv.xp, level: lv.level });
    },
    // выдать или снять достижение
    async 'POST /admin/levels/ach'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureLevels(env);
      const b = await h.readBody(request);
      const id = String(b.id || ''), code = String(b.code || '');
      if (!/^[0-9a-f]{24}$/.test(id) || !ACHIEVEMENTS.some((a) => a.code === code)) return fail(400, 'Нет такого человека или достижения.');
      if (b.give) await env.DB.prepare('INSERT INTO achievements (user_id, code, tier, at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, code) DO UPDATE SET tier = excluded.tier').bind(id, code, Math.max(1, Math.min(3, +b.tier || 1)), Date.now()).run();
      else await env.DB.prepare('DELETE FROM achievements WHERE user_id = ? AND code = ?').bind(id, code).run();
      await h.adminLog(env, request, me, `levels: ach ${b.give ? '+' : '-'}${code} ${id}`, true);
      return json({ ok: true });
    },
    // подарок в почту: всем или одному человеку (по юзернейму), с опытом или просто письмо
    async 'POST /admin/levels/gift'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return fail(400, 'Уровни выключены (LEVELS = "0").');
      await ensureLevels(env);
      const b = await h.readBody(request);
      const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const body = String(b.body || '').replace(/\r\n?/g, '\n').trim().slice(0, 600);
      const xp = Math.max(0, Math.min(1000, Math.round(+b.xp || 0)));
      const days = Math.max(1, Math.min(90, Math.round(+b.days || 30)));
      if (!title) return fail(400, 'Нужен заголовок письма.');
      let to = null;
      const who = String(b.to || '').trim().replace(/^@+/, '').toLowerCase();
      if (who && who !== 'all') {
        const u = await env.DB.prepare('SELECT id FROM users WHERE uname = ?').bind(who).first();
        if (!u) return fail(404, `Нет пользователя @${who}.`);
        to = u.id;
      }
      const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await env.DB.prepare("INSERT INTO gifts (id, to_id, kind, title, body, xp, at, until, by_id) VALUES (?, ?, 'gift', ?, ?, ?, ?, ?, ?)").bind(id, to, title, body, xp, Date.now(), Date.now() + days * 864e5, me.id).run();
      await h.adminLog(env, request, me, `levels: gift ${to ? '@' + who : 'всем'} «${title}» +${xp}`, true);
      if (to) await h.poke(env, to); else await h.pokeAll(env);
      return json({ ok: true, id });
    },
    async 'GET /admin/levels/gifts'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureLevels(env);
      const { results } = await env.DB.prepare(`SELECT g.id, g.to_id, g.title, g.xp, g.at, g.until, u.uname,
          (SELECT COUNT(*) FROM gift_box b WHERE b.gift_id = g.id AND b.claimed = 1) AS claimed
        FROM gifts g LEFT JOIN users u ON u.id = g.to_id WHERE g.kind = 'gift' ORDER BY g.at DESC LIMIT 30`).all();
      return json({ items: (results || []).map((g) => ({ id: g.id, to: g.to_id ? '@' + (g.uname || '?') : 'всем', title: g.title, xp: +g.xp || 0, at: +g.at, until: g.until ? +g.until : null, claimed: +g.claimed || 0 })) });
    },
    async 'DELETE /admin/levels/gift'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureLevels(env);
      const id = new URL(request.url).searchParams.get('id') || '';
      await env.DB.prepare("UPDATE gifts SET until = ? WHERE id = ? AND kind = 'gift'").bind(Date.now(), id).run();
      await h.adminLog(env, request, me, `levels: gift off ${id}`, true);
      return json({ ok: true });
    },
    // тематическая неделя: ×2 к выбранным действиям на N дней
    async 'PUT /admin/levels/event'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      const b = await h.readBody(request);
      const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const kinds = (Array.isArray(b.kinds) ? b.kinds : []).map(String).filter((k) => RULES[k] && !RULES[k].given);
      // срок: число и единица (минуты, часы, дни, недели); старый вид — дни
      const span = b.unit ? spanMs(b.n, b.unit) : Math.max(1, Math.min(14, Math.round(+b.days || 7))) * 864e5;
      const mult = [1.5, 2, 3].includes(+b.mult) ? +b.mult : 2;
      // только оценки этих групп категорий (например, «Музыка»); пусто — любые
      const cats = (Array.isArray(b.cats) ? b.cats : []).map(String).filter((k) => CAT_GROUPS[k]);
      if (!title || !kinds.length) return fail(400, 'Нужны название и хотя бы одно действие.');
      if (span < 10 * 60e3) return fail(400, 'Неделя идёт хотя бы 10 минут.');
      const ev = { id: Date.now().toString(36), title, kinds, mult, until: Date.now() + span, ...(cats.length ? { cats } : {}) };
      await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('levels_event', ?)").bind(JSON.stringify(ev)).run();
      forgetEvent();
      // объявление-окно о неделе: каждый прочитает его один раз, а потом внизу страницы идёт таймер (online.js)
      if (b.announce !== false && h.setAnnounce) {
        const note = String(b.note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        const what = kinds.map((k) => KIND_LABEL[k] || k).join(', ');
        const only = cats.length && kinds.some((k) => RATING_KINDS.has(k)) ? ` Оценки — только в категориях: ${cats.map((c) => CAT_GROUPS[c].label).join(', ')}.` : '';
        // свои слова админа — отдельным полем note: окно показывает их отдельно от строк «за что» и «до когда»
        await h.setAnnounce(env, { id: 'ev-' + ev.id, kind: 'event', title, text: `×${String(mult).replace('.', ',')} опыта за: ${what}.${only} До ${fmtKyiv(ev.until)}.`, note, until: ev.until, by: me.handle });
      } else if (h.pokeAnnounce) await h.pokeAnnounce(env); // без объявления: открытые вкладки всё равно узнают и покажут таймер
      await h.adminLog(env, request, me, `levels: event ${title} ×${mult} ${Math.round(span / 60e3)}m`, true);
      return json({ ok: true, event: ev });
    },
    async 'DELETE /admin/levels/event'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      const was = await currentEvent(env);
      await env.DB.prepare("DELETE FROM meta WHERE k = 'levels_event'").run();
      forgetEvent();
      // объявление о неделе уходит вместе с ней
      let poked = false;
      if (was && h.getAnnounce && h.setAnnounce) { const a = await h.getAnnounce(env); if (a && a.id === 'ev-' + was.id) { await h.setAnnounce(env, null); poked = true; } }
      // объявление уже другое (или его не было): таймер «×2» в открытых вкладках всё равно должен пропасть сразу
      if (!poked && h.pokeAnnounce) await h.pokeAnnounce(env);
      await h.adminLog(env, request, me, 'levels: event off', true);
      return json({ ok: true });
    },

    // ---------- сезоны ----------
    // текущий сезон (кто сейчас впереди) и прошлые — с числом участников и тремя лучшими
    async 'GET /admin/levels/seasons'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return json({ current: null, history: [], ranks: SEASON_RANKS });
      const cur = await currentSeason(env);
      const { results: past } = await env.DB.prepare('SELECT n, title, start_at, end_at, closed_at, planned_by FROM seasons WHERE closed_at IS NOT NULL ORDER BY n DESC LIMIT 12').all();
      const ns = (past || []).map((s) => +s.n);
      const marks = ns.map(() => '?').join(', ') || 'NULL';
      const [top, cnt, live, players] = await env.DB.batch([
        env.DB.prepare(`SELECT r.season, r.place, r.xp, r.rank, u.username, u.uname FROM season_results r LEFT JOIN users u ON u.id = r.user_id WHERE r.place <= 3 AND r.season IN (${marks}) ORDER BY r.season DESC, r.place`).bind(...ns),
        env.DB.prepare(`SELECT season, COUNT(*) AS n FROM season_results WHERE season IN (${marks}) GROUP BY season`).bind(...ns),
        env.DB.prepare('SELECT l.user_id, SUM(l.xp) AS s, u.username, u.uname FROM xp_log l LEFT JOIN users u ON u.id = l.user_id WHERE l.gone = 0 AND l.at >= ? GROUP BY l.user_id HAVING s > 0 ORDER BY s DESC LIMIT 3').bind(cur.start),
        env.DB.prepare('SELECT COUNT(*) AS n FROM (SELECT user_id FROM xp_log WHERE gone = 0 AND at >= ? GROUP BY user_id HAVING SUM(xp) > 0)').bind(cur.start),
      ]);
      const who = (x) => ({ username: x.username || '?', handle: x.uname || '' });
      const remind = await seasonReminderOf(env, cur.n);
      return json({
        ranks: SEASON_RANKS, mail: mailOn(env),
        current: { ...cur, remind, players: +(((players.results || [])[0] || {}).n) || 0, top: (live.results || []).map((x, i) => ({ place: i + 1, ...who(x), xp: +x.s || 0, ...rankFields(+x.s || 0) })) },
        history: (past || []).map((s) => ({
          n: +s.n, title: s.title, start: +s.start_at, end: +s.end_at, closed: +s.closed_at, by: s.planned_by || '',
          players: +(((cnt.results || []).find((x) => +x.season === +s.n) || {}).n) || 0,
          top: (top.results || []).filter((x) => +x.season === +s.n).map((x) => ({ place: +x.place, ...who(x), xp: +x.xp || 0, rankId: x.rank, rank: (SEASON_RANKS.find((r) => r.id === x.rank) || SEASON_RANKS[0]).title })),
        })),
      });
    },
    // назначить сброс: когда кончится текущий сезон (и, если хочется, его название). Всем — письмо в почту уровней
    // и объявление вверху сайта до самого сброса; прежние письма о сбросе этого сезона гаснут
    async 'PUT /admin/levels/season'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return fail(400, 'Уровни выключены (LEVELS = "0").');
      const b = await h.readBody(request);
      const now = Date.now();
      const end = Math.round(+b.end || 0);
      if (!(end > now + 60e3) || end > now + 120 * 864e5) return fail(400, 'Сброс можно назначить не раньше чем через минуту и не дальше чем через 120 дней.');
      const cur = await currentSeason(env, now);
      if (!cur) return fail(500, 'Сезон не найден, обнови страницу.');
      const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
      const letter = seasonPlanLetter(cur.n, end);
      await env.DB.batch([
        env.DB.prepare("UPDATE seasons SET end_at = ?2, title = COALESCE(NULLIF(?3, ''), title), planned_by = ?4, planned_at = ?5 WHERE n = ?1 AND closed_at IS NULL").bind(cur.n, end, title, String(me.handle || me.id), now),
        env.DB.prepare("UPDATE gifts SET until = ?2 WHERE kind = 'season' AND id LIKE ?1 AND id != ?3 AND (until IS NULL OR until > ?2)").bind(`season:${cur.n}:plan:%`, now, letter.id),
        env.DB.prepare("INSERT OR IGNORE INTO gifts (id, to_id, kind, title, body, xp, at, until, by_id) VALUES (?, NULL, 'season', ?, ?, 0, ?, ?, ?)").bind(letter.id, letter.title, letter.body, now, end, me.id),
      ]);
      forgetSeason();
      if (b.announce !== false && h.setAnnounce) {
        await h.setAnnounce(env, { id: `season-${cur.n}`, text: `Сброс званий ${fmtKyiv(end)} — конец сезона ${cur.n}. Уровень, опыт и награды останутся.`, kind: 'info', until: end, by: me.handle });
      }
      // письмо на почту за 3 дня до сброса (functions/_lib/mailout.js; уходит с ближайшим шагом рассылки — cron в rt
      // или «Продолжить» в админке). Без галочки прежнее напоминание этого сезона снимается
      let origin = '';
      try { origin = new URL(request.url).origin; } catch (e) {}
      await planSeasonReminder(env, { n: cur.n, end, whenText: fmtKyiv(end), origin, by: me.id, remind: b.remind === true && !!origin, now });
      await h.pokeAll(env);
      await h.adminLog(env, request, me, `levels: сброс сезона ${cur.n} — ${fmtKyiv(end)}`, true);
      return json({ ok: true, current: await currentSeason(env) });
    },
    // сбросить сейчас: сезон закрывает этот запрос (итоги, письмо, плашки), сразу начинается следующий
    async 'POST /admin/levels/season/reset'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return fail(400, 'Уровни выключены (LEVELS = "0").');
      const now = Date.now();
      const cur = await currentSeason(env, now);
      if (!cur) return fail(500, 'Сезон не найден, обнови страницу.');
      await env.DB.prepare('UPDATE seasons SET end_at = ?2 WHERE n = ?1 AND closed_at IS NULL').bind(cur.n, now).run();
      const next = await closeSeason(env, { ...cur, end: now }, now);
      forgetSeason();
      // объявление о сбросе этого сезона и неотправленное напоминание письмом больше не нужны
      if (h.getAnnounce && h.setAnnounce) { const a = await h.getAnnounce(env); if (a && a.id === `season-${cur.n}`) await h.setAnnounce(env, null); }
      await cancelSeasonReminder(env, cur.n);
      await h.adminLog(env, request, me, `levels: сезон ${cur.n} сброшен вручную`, true);
      return json({ ok: true, closed: cur.n, current: next });
    },
  };
}

// приглашение при регистрации: запомнить, кто пригласил, и отправить ему заявку в друзья от новичка.
// Принимает её пригласивший сам: ссылку могли выложить публично, а друзьям открыты оценки «только для друзей».
// Опыт за дружбу — как у любой заявки, когда её примут (POST /friends/accept). Возвращает id пригласившего или null
export async function acceptInvite(env, uid, code) {
  if (!levelsOn(env) || !INVITE_RE.test(String(code || ''))) return null;
  try {
    await ensureLevels(env);
    const inv = await env.DB.prepare('SELECT user_id FROM invites WHERE code = ?').bind(code).first();
    if (!inv || inv.user_id === uid) return null;
    const now = Date.now();
    const [a, b] = inv.user_id < uid ? [inv.user_id, uid] : [uid, inv.user_id];
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO invited (user_id, by_id, at) VALUES (?, ?, ?)').bind(uid, inv.user_id, now),
      env.DB.prepare("INSERT OR IGNORE INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, 'pending', ?, ?)").bind(a, b, uid, now),
    ]);
    return inv.user_id;
  } catch (e) {
    console.error('levels invite', e && e.message);
    return null;
  }
}

// итоги года открыты с 1 декабря по 31 января
export const recapOpen = (now) => { const d = new Date(now); const m = d.getUTCMonth(), y = d.getUTCFullYear(); return (y === 2026 && m === 11) || (y === 2027 && m === 0); };

export async function recap(env, uid, year) {
  const from = Date.UTC(year, 0, 1), to = Date.UTC(year + 1, 0, 1);
  const inYear = (t) => { const v = +new Date(t || 0) || 0; return v >= from && v < to; };
  const cur = await currentSeason(env);
  const [sh, rcOut, rcIn, cmOut, cmIn, tl, lots, lv, ach, me, past, now_, kinds, fr] = await env.DB.batch([
    env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(uid),
    env.DB.prepare('SELECT owner_id AS id, COUNT(*) AS n FROM reactions WHERE from_id = ? AND owner_id != ? AND at >= ? AND at < ? GROUP BY owner_id').bind(uid, uid, from, to),
    env.DB.prepare('SELECT from_id AS id, COUNT(*) AS n FROM reactions WHERE owner_id = ? AND from_id != ? AND at >= ? AND at < ? GROUP BY from_id').bind(uid, uid, from, to),
    env.DB.prepare('SELECT owner_id AS id, COUNT(*) AS n FROM comments WHERE from_id = ? AND owner_id != ? AND at >= ? AND at < ? GROUP BY owner_id').bind(uid, uid, from, to),
    env.DB.prepare('SELECT from_id AS id, COUNT(*) AS n FROM comments WHERE owner_id = ? AND from_id != ? AND at >= ? AND at < ? GROUP BY from_id').bind(uid, uid, from, to),
    env.DB.prepare('SELECT COUNT(*) AS n FROM tierlists WHERE user_id = ? AND data IS NOT NULL AND at >= ? AND at < ?').bind(uid, from, to),
    env.DB.prepare('SELECT COUNT(*) AS n FROM lot_rooms WHERE owner_id = ? AND created_at >= ? AND created_at < ?').bind(uid, from, to),
    env.DB.prepare('SELECT xp, level, best_streak FROM user_level WHERE user_id = ?').bind(uid),
    env.DB.prepare('SELECT COUNT(*) AS n FROM achievements WHERE user_id = ? AND at >= ? AND at < ?').bind(uid, from, to),
    env.DB.prepare('SELECT username, created_at FROM users WHERE id = ?').bind(uid),
    // звание года — лучшее из сезонов этого года (и текущего)
    env.DB.prepare('SELECT r.rank FROM season_results r JOIN seasons s ON s.n = r.season WHERE r.user_id = ? AND s.start_at >= ? AND s.start_at < ?').bind(uid, from - 31 * 864e5, to),
    env.DB.prepare('SELECT COALESCE(SUM(xp), 0) AS s FROM xp_log WHERE user_id = ? AND gone = 0 AND at >= ?').bind(uid, cur ? cur.start : Date.now() + 1),
    // что засчитано за год по видам: загадки, лоты, «Царь Горы», прогнозы, бинго, задания (снятое не считается)
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM xp_log WHERE user_id = ? AND gone = 0 AND at >= ? AND at < ? GROUP BY kind').bind(uid, from, to),
    env.DB.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(uid),
  ]);
  // рофланы за год: только полученное, без покупок (у сайта без магазина таблицы может не быть)
  let roflans = 0;
  try {
    const r = await env.DB.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM shop_log WHERE user_id = ? AND delta > 0 AND at >= ? AND at < ?').bind(uid, from, to).first();
    roflans = +(r && r.s) || 0;
  } catch (e) {}
  const rankIdx = (id) => SEASON_RANKS.findIndex((r) => r.id === id);
  const bestRank = [...(past.results || []).map((x) => x.rank), seasonRankOf(+(((now_.results || [])[0] || {}).s) || 0).id]
    .reduce((a, id) => (rankIdx(id) > rankIdx(a) ? id : a), SEASON_RANKS[0].id);
  let ratings = [];
  try { const d = JSON.parse(((sh.results || [])[0] || {}).data || '{}'); ratings = Array.isArray(d) ? d : d.ratings || []; } catch (e) {}
  const year_ = ratings.filter((r) => r && !r.example && isScored(r) && inYear(r.createdAt || r.updatedAt));
  const plans = ratings.filter((r) => r && !r.example && r.status === 'В планах' && inYear(r.createdAt)).length;
  const cats = {};
  for (const r of year_) { const k = String(r.catName || r.cat || 'Без категории'); cats[k] = (cats[k] || 0) + 1; }
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0] || null;
  const avg = year_.length ? Math.round((year_.reduce((s, r) => s + (+r.total || 0), 0) / year_.length) * 10) / 10 : null;
  const best = [...year_].sort((a, b) => (+b.total || 0) - (+a.total || 0) || (+new Date(b.createdAt || 0) - +new Date(a.createdAt || 0)))[0] || null;
  const worst = [...year_].sort((a, b) => (+a.total || 0) - (+b.total || 0))[0] || null;
  const longest = [...year_].sort((a, b) => textLen(b) - textLen(a))[0] || null;
  // лучший друг года: больше всего реакций и комментариев в обе стороны
  const pal = {};
  for (const res of [rcOut, rcIn, cmOut, cmIn]) for (const x of res.results || []) pal[x.id] = (pal[x.id] || 0) + (+x.n || 0);
  const palTop = Object.entries(pal).sort((a, b) => b[1] - a[1])[0] || null;
  let friend = null;
  if (palTop) { const u = await env.DB.prepare('SELECT username, uname FROM users WHERE id = ?').bind(palTop[0]).first(); if (u) friend = { id: palTop[0], username: u.username, handle: u.uname, together: palTop[1] }; }
  const sum = (res) => (res.results || []).reduce((s, x) => s + (+x.n || 0), 0);
  const l = (lv.results || [])[0] || {};
  const view = levelView(+l.xp || 0, +l.level || 1);
  const name = (r) => (r ? { name: String(r.name || '').slice(0, 80), total: +r.total || 0, cat: String(r.catName || '').slice(0, 40) } : null);
  // музыка: разобранные по трекам альбомы года, лучший альбом и лучший трек (балл трека живёт в tracks альбома)
  const albums = ratings.filter((r) => r && !r.example && !r.albumOf && Array.isArray(r.tracks) && (inYear(r.createdAt) || inYear(r.updatedAt)))
    .map((r) => ({ r, tr: r.tracks.filter((e) => e && +e.v > 0) })).filter((a) => a.tr.length);
  const topAlbum = albums.filter((a) => isScored(a.r)).sort((a, b) => (+b.r.total || 0) - (+a.r.total || 0))[0] || null;
  let topTrack = null;
  for (const a of albums) for (const e of a.tr) if (!topTrack || +e.v > topTrack.v) topTrack = { name: String(e.t || '').slice(0, 80) || `№${+e.n || 0}`, album: String(a.r.name || '').slice(0, 80), v: +e.v };
  const music = { albums: albums.length, tracks: albums.reduce((s, a) => s + a.tr.length, 0), top: topAlbum ? { name: String(topAlbum.r.name || '').slice(0, 80), total: +topAlbum.r.total || 0 } : null, track: topTrack };
  // самая спорная оценка года — дальше всего от среднего у друзей; оценки друзей «только я» не считаются, как и в их профиле
  let hot = null;
  const fids = (fr.results || []).map((x) => x.id).slice(0, 90);
  if (fids.length && year_.length) {
    const mine = new Map(year_.map((r) => [nameKey(r.name), r]));
    const sums = new Map();
    const { results: shs } = await env.DB.prepare(`SELECT data FROM shelves WHERE user_id IN (${fids.map(() => '?').join(',')})`).bind(...fids).all();
    for (const s of shs || []) {
      let list = [];
      try { const d = JSON.parse(s.data || '{}'); list = Array.isArray(d) ? d : d.ratings || []; } catch (e) { continue; }
      const once = new Set();
      for (const r of list) {
        if (!r || r.example || r.vis === 'private' || !isScored(r)) continue;
        const k = nameKey(r.name);
        if (!mine.has(k) || once.has(k)) continue;
        once.add(k);
        const t = sums.get(k) || { sum: 0, n: 0 };
        t.sum += +r.total; t.n++;
        sums.set(k, t);
      }
    }
    let best_ = null;
    for (const [k, t] of sums) {
      const m = mine.get(k), avg = t.sum / t.n, diff = Math.abs((+m.total || 0) - avg);
      if (!best_ || diff > best_.diff || (diff === best_.diff && t.n > best_.n)) best_ = { name: String(m.name || '').slice(0, 80), mine: +m.total || 0, theirs: Math.round(avg * 10) / 10, n: t.n, diff };
    }
    // меньше полутора баллов разницы — это не спор
    if (best_ && best_.diff >= 1.5) hot = { name: best_.name, mine: best_.mine, theirs: best_.theirs, n: best_.n };
  }
  const kn = Object.fromEntries((kinds.results || []).map((x) => [x.kind, +x.n || 0]));
  const modes = {
    riddles: kn.riddle || 0, lotsWon: kn.lot_win || 0, lotsHosted: kn.lots_host || 0, kingHosted: kn.king_host || 0, kingVotes: kn.king_vote || 0,
    predictWins: kn.predict_win || 0, bingoWins: kn.bingo_win || 0, tierCoop: (kn.tier_coop || 0) + (kn.tier_coop_host || 0), quests: kn.quest || 0, guesses: kn.guess || 0,
  };
  return {
    year, username: ((me.results || [])[0] || {}).username || '',
    ratings: year_.length, plans, avg, favs: year_.filter((r) => r.fav).length,
    topCat: topCat ? { name: topCat[0].slice(0, 40), n: topCat[1] } : null, cats: Object.keys(cats).length,
    best: name(best), worst: worst && best && worst.id !== best.id ? name(worst) : null, longest: longest && textLen(longest) >= 100 ? { ...name(longest), chars: textLen(longest) } : null,
    reactsGiven: sum(rcOut), reactsGot: sum(rcIn), commentsGiven: sum(cmOut), commentsGot: sum(cmIn),
    tierlists: ((tl.results || [])[0] || {}).n || 0, lotRooms: ((lots.results || [])[0] || {}).n || 0,
    friend, level: view.level, rank: (SEASON_RANKS[rankIdx(bestRank)] || SEASON_RANKS[0]).title, rankId: bestRank, xp: view.xp, bestStreak: +l.best_streak || 0, achievements: ((ach.results || [])[0] || {}).n || 0,
    music, modes, hot, roflans,
  };
}
