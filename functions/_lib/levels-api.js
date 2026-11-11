// Казуал Хаб: адреса API про уровни (/api/levels/…, /api/admin/levels…). Правила — в levels.js, здесь только
// чтение, настройки, рейтинг недели, приглашения, итоги года и админка. Главный файл API подключает эти адреса
// через makeLevelsRoutes(h), передавая свои помощники (ответы, проверки админа, журнал админки).
// Папка _lib не становится адресом сайта.
import {
  levelsMode, levelsOn, ensureLevels, readLevel, levelView, prefsOf, lookOf, unlockedAt, levelsOf, achievementsOf, questState,
  firstSteps, takeNews, dayKey, weekStart, shiftDay, cleanTz, backfillUser, grantSpecial, currentEvent, forgetEvent, RULES, awardMany,
  ACHIEVEMENTS, REWARDS, NAME_COLORS, PROFILE_BGS, FIRST_STEPS, isScored, textLen, rankOf, award,
} from './levels.js';

// подписи для истории опыта
export const KIND_LABEL = {
  rate: 'оценка', review: 'отзыв', rate_full: 'оценка целиком', plan_done: 'из «В планах»', import: 'импорт из Letterboxd',
  tier: 'тир-лист', tier_share: 'поделился тир-листом', react: 'реакция другу', comment: 'комментарий',
  got_react: 'реакция на твою оценку', got_comment: 'комментарий тебе', friend: 'новый друг', lots_host: 'провёл сбор лотов',
  lot_add: 'лот в чужой сбор', lot_win: 'твой лот победил', visit: 'зашёл на сайт', invite: 'приглашение', quest: 'задание дня',
  quest_all: 'все задания дня', quest_week: 'задание недели', streak: 'серия дней', first: 'первые шаги', past: 'опыт за прошлое',
  admin: 'от администрации', event: 'тематическая неделя', gift: 'подарок из почты',
};
const INVITE_RE = /^[a-z0-9]{8}$/;
const FOUNDERS_BEFORE = Date.UTC(2026, 10, 12); // кто зарегистрировался до запуска уровней — «Основатель хаба»
const parse = (s, d) => { try { const v = s ? JSON.parse(s) : null; return v == null ? d : v; } catch (e) { return d; } };
const randCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => 'abcdefghijkmnopqrstuvwxyz23456789'[b % 33]).join('');

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
  WHERE (g.to_id IS NULL OR g.to_id = ?1) AND (g.until IS NULL OR g.until > ?2) ORDER BY g.at DESC LIMIT 60`;
export async function mailUnread(env, uid) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (${MAIL_SQL}) WHERE read = 0 OR (xp > 0 AND claimed = 0)`).bind(uid, Date.now()).first();
  return +(r && r.n) || 0;
}

export function makeLevelsRoutes(h) {
  const { json, fail } = h;
  const off = () => json({ on: false });
  const gate = async (env, me) => levelsOn(env) && (await levelsVisible(env, me, h));
  const userRow = (env, uid) => env.DB.prepare('SELECT * FROM user_level WHERE user_id = ?').bind(uid).first();

  return {
    // всё про мой прогресс одним запросом: уровень, серия, задания, первые шаги, оформление
    async 'GET /levels/me'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const now = Date.now();
      const row = (await userRow(env, me.id)) || {};
      const tz = tzOf(request) || row.tz || 'UTC';
      const today = dayKey(now, tz);
      const lv = levelView(+row.xp || 0, +row.level || 1);
      const prefs = prefsOf(row);
      const [quests, steps, ev] = await Promise.all([questState(env, me.id, { now, today, row }), firstSteps(env, me.id), currentEvent(env, now)]);
      const alive = row.streak_day === today || row.streak_day === shiftDay(today, -1) || (row.streak_day === shiftDay(today, -2) && +row.freezes > 0);
      return json({
        on: true, mode: levelsMode(env), ...lv, prefs, look: lookOf(row), unlocked: unlockedAt(lv.level),
        streak: { days: alive ? +row.streak || 0 : 0, best: +row.best_streak || 0, freezes: row.freezes == null ? 1 : +row.freezes, today: row.streak_day === today },
        quests, steps: steps.every((s) => s.paid) ? null : steps,
        event: ev ? { title: ev.title, kinds: ev.kinds, mult: ev.mult, until: ev.until } : null,
        rewards: REWARDS, colors: NAME_COLORS, bgs: Object.keys(PROFILE_BGS),
        recap: recapOpen(now) ? 2026 : null,
        mail: await mailUnread(env, me.id),
      });
    },
    // почта: подарки от администрации и письма о новых уровнях
    async 'GET /levels/mail'({ env, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const { results } = await env.DB.prepare(MAIL_SQL).bind(me.id, Date.now()).all();
      return json({ items: (results || []).map((g) => ({ id: g.id, kind: g.kind, title: g.title, body: g.body || '', xp: +g.xp || 0, at: +g.at, until: g.until ? +g.until : null, read: !!g.read, claimed: !!g.claimed })) });
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
      const g = await env.DB.prepare('SELECT id, xp, to_id, until FROM gifts WHERE id = ?').bind(String(id || '')).first();
      if (!g || (g.to_id && g.to_id !== me.id) || (g.until && g.until <= now)) return fail(404, 'Такого подарка нет или он уже истёк.');
      if (!(+g.xp > 0)) return fail(400, 'В этом письме нечего забирать.');
      const w = await env.DB.prepare('INSERT INTO gift_box (gift_id, user_id, read, claimed, at) VALUES (?1, ?2, 1, 1, ?3) ON CONFLICT(gift_id, user_id) DO UPDATE SET claimed = 1, read = 1 WHERE claimed = 0').bind(g.id, me.id, now).run();
      if (!(w.meta && w.meta.changes)) return fail(409, 'Этот подарок уже забран.');
      const r = await awardMany(env, me.id, [{ kind: 'gift', ref: g.id, xp: +g.xp }], { now, tz: tzOf(request) });
      h.markNews(request, r);
      return json({ ok: true, gained: r ? r.gained : 0, level: r ? r.level : null, unread: await mailUnread(env, me.id) });
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
        what: KIND_LABEL[r.kind] || r.kind, name: ['rate', 'review', 'rate_full', 'plan_done', 'import'].includes(r.kind) ? names.get(r.ref) || '' : '',
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
      const lv = levelView(+row.xp || 0, +row.level || 1).level, u = unlockedAt(lv);
      const next = { ...cur };
      for (const k of ['hideLevel', 'hideBoard', 'notify', 'anim']) if (typeof b[k] === 'boolean') next[k] = b[k];
      if (Array.isArray(b.showcase)) {
        const own = new Set(((await env.DB.prepare('SELECT code FROM achievements WHERE user_id = ?').bind(me.id).all()).results || []).map((x) => x.code));
        next.showcase = [...new Set(b.showcase.map(String))].filter((c) => own.has(c)).slice(0, 3);
      }
      if (typeof b.frame === 'string') { if (b.frame && !u.frames.includes(b.frame)) return fail(403, 'Эта рамка ещё не открыта.'); next.frame = b.frame; }
      if (typeof b.color === 'string') { if (b.color && !u.colors.includes(b.color)) return fail(403, 'Этот цвет ещё не открыт.'); next.color = b.color; }
      if (typeof b.bg === 'string') { if (b.bg && !u.bgs.includes(b.bg)) return fail(403, 'Этот фон ещё не открыт.'); next.bg = b.bg; }
      await env.DB.prepare('INSERT INTO user_level (user_id, updated_at, prefs) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET prefs = ?3').bind(me.id, Date.now(), JSON.stringify(next)).run();
      return json({ ok: true, prefs: next, look: lookOf({ ...row, prefs: JSON.stringify(next) }) });
    },
    // кружки уровня у чужих аватаров: ?ids=a,b,c
    async 'GET /levels/users'({ env, request, me }) {
      if (!(await gate(env, me))) return json({ users: {} });
      const ids = String(new URL(request.url).searchParams.get('ids') || '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f]{24}$/.test(x)).slice(0, 200);
      return json({ users: await levelsOf(env, [...new Set(ids)]) });
    },
    // профиль человека: уровень, звание, оформление и витрина
    async 'GET /levels/profile'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      await ensureLevels(env);
      const id = new URL(request.url).searchParams.get('id') || me.id;
      const row = await userRow(env, id);
      if (!row || (id !== me.id && prefsOf(row).hideLevel)) return json({ on: true, hidden: true });
      const lv = levelView(+row.xp || 0, +row.level || 1);
      const show = prefsOf(row).showcase;
      const all = await achievementsOf(env, id);
      const showcase = show.map((c) => all.find((a) => a.code === c && a.got)).filter(Boolean);
      return json({ on: true, level: lv.level, rank: lv.rank, xp: lv.xp, into: lv.into, need: lv.need, look: lookOf(row), showcase, achievements: all.filter((a) => a.got).length });
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
      return json({ scope, week: wk, top, best: grown });
    },
    // личная ссылка-приглашение
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
      const { results } = await env.DB.prepare('SELECT i.user_id, i.rewarded, u.username FROM invited i JOIN users u ON u.id = i.user_id WHERE i.by_id = ? ORDER BY i.at DESC LIMIT 20').bind(me.id).all();
      return json({ code: r.code, url: new URL(request.url).origin + '/?invite=' + r.code, people: (results || []).map((x) => ({ username: x.username, done: !!x.rewarded })), xp: RULES.invite.xp });
    },
    // итоги года: что было за год, одной карточкой
    async 'GET /levels/recap'({ env, request, me }) {
      if (!(await gate(env, me))) return off();
      const now = Date.now();
      const admin = h.adminCandidate(me, env) || (await h.isAdmin(env, me));
      if (!recapOpen(now) && !admin) return fail(404, 'Итоги года откроются в декабре.');
      await ensureLevels(env);
      const data = await recap(env, me.id, 2026);
      await grantSpecial(env, me.id, 'recap2026');
      return json(data);
    },

    // ---------- админка ----------
    async 'GET /admin/levels'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!levelsOn(env)) return json({ mode: 'off', users: [], event: null });
      await ensureLevels(env);
      const { results } = await env.DB.prepare(
        `SELECT u.id, u.username, u.uname, ul.xp, ul.level, ul.streak, ul.best_streak, ul.streak_day, ul.prefs,
                (SELECT COUNT(*) FROM achievements a WHERE a.user_id = u.id) AS ach,
                (SELECT COALESCE(SUM(xp), 0) FROM xp_log l WHERE l.user_id = u.id AND l.gone = 0 AND l.at > ?1) AS week
         FROM users u LEFT JOIN user_level ul ON ul.user_id = u.id ORDER BY COALESCE(ul.xp, 0) DESC LIMIT 200`
      ).bind(Date.now() - 7 * 864e5).all();
      const ev = await currentEvent(env);
      // подозрительно быстро: больше трёх дневных лимитов за последний час
      const { results: fast } = await env.DB.prepare('SELECT user_id, COUNT(*) AS n FROM xp_log WHERE at > ? AND xp > 0 GROUP BY user_id HAVING n > 60').bind(Date.now() - 3600e3).all();
      const flagged = new Set((fast || []).map((x) => x.user_id));
      return json({
        mode: levelsMode(env), event: ev, kinds: Object.keys(RULES).filter((k) => !RULES[k].given && !['visit', 'quest', 'quest_all', 'quest_week', 'invite'].includes(k)).map((k) => ({ k, label: KIND_LABEL[k] || k })),
        users: (results || []).map((r) => {
          const lv = levelView(+r.xp || 0, +r.level || 1);
          return { id: r.id, username: r.username, handle: r.uname, xp: lv.xp, level: lv.level, rank: lv.rank, streak: +r.streak || 0, best: +r.best_streak || 0, ach: +r.ach || 0, week: +r.week || 0, hidden: prefsOf(r).hideLevel, fast: flagged.has(r.id) };
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
      const days = Math.max(1, Math.min(14, Math.round(+b.days || 7)));
      const mult = [1.5, 2, 3].includes(+b.mult) ? +b.mult : 2;
      if (!title || !kinds.length) return fail(400, 'Нужны название и хотя бы одно действие.');
      const ev = { id: Date.now().toString(36), title, kinds, mult, until: Date.now() + days * 864e5 };
      await env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('levels_event', ?)").bind(JSON.stringify(ev)).run();
      forgetEvent();
      await h.adminLog(env, request, me, `levels: event ${title} ×${mult} ${days}d`, true);
      return json({ ok: true, event: ev });
    },
    async 'DELETE /admin/levels/event'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await env.DB.prepare("DELETE FROM meta WHERE k = 'levels_event'").run();
      forgetEvent();
      await h.adminLog(env, request, me, 'levels: event off', true);
      return json({ ok: true });
    },
  };
}

// приглашение при регистрации: запомнить, кто пригласил, и сразу подружить
export async function acceptInvite(env, uid, code) {
  if (!levelsOn(env) || !INVITE_RE.test(String(code || ''))) return;
  try {
    await ensureLevels(env);
    const inv = await env.DB.prepare('SELECT user_id FROM invites WHERE code = ?').bind(code).first();
    if (!inv || inv.user_id === uid) return;
    const now = Date.now();
    const [a, b] = inv.user_id < uid ? [inv.user_id, uid] : [uid, inv.user_id];
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO invited (user_id, by_id, at) VALUES (?, ?, ?)').bind(uid, inv.user_id, now),
      env.DB.prepare("INSERT OR IGNORE INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, 'accepted', ?, ?)").bind(a, b, inv.user_id, now),
    ]);
    await award(env, uid, 'friend', inv.user_id);
    await award(env, inv.user_id, 'friend', uid);
  } catch (e) {
    console.error('levels invite', e && e.message);
  }
}

// итоги года открыты с 1 декабря по 31 января
export const recapOpen = (now) => { const d = new Date(now); const m = d.getUTCMonth(), y = d.getUTCFullYear(); return (y === 2026 && m === 11) || (y === 2027 && m === 0); };

export async function recap(env, uid, year) {
  const from = Date.UTC(year, 0, 1), to = Date.UTC(year + 1, 0, 1);
  const inYear = (t) => { const v = +new Date(t || 0) || 0; return v >= from && v < to; };
  const [sh, rcOut, rcIn, cmOut, cmIn, tl, lots, lv, ach, me] = await env.DB.batch([
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
  ]);
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
  return {
    year, username: ((me.results || [])[0] || {}).username || '',
    ratings: year_.length, plans, avg, favs: year_.filter((r) => r.fav).length,
    topCat: topCat ? { name: topCat[0].slice(0, 40), n: topCat[1] } : null, cats: Object.keys(cats).length,
    best: name(best), worst: worst && best && worst.id !== best.id ? name(worst) : null, longest: longest && textLen(longest) >= 100 ? { ...name(longest), chars: textLen(longest) } : null,
    reactsGiven: sum(rcOut), reactsGot: sum(rcIn), commentsGiven: sum(cmOut), commentsGot: sum(cmIn),
    tierlists: ((tl.results || [])[0] || {}).n || 0, lotRooms: ((lots.results || [])[0] || {}).n || 0,
    friend, level: view.level, rank: view.rank, xp: view.xp, bestStreak: +l.best_streak || 0, achievements: ((ach.results || [])[0] || {}).n || 0,
  };
}
export { rankOf, FIRST_STEPS };
