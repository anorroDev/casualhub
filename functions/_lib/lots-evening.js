// Казуал Хаб: «Вечер с друзьями» — маленький сбор лотов без стрима (страница — lots/evening.js, создание — в Колесе).
// Компания накидывает варианты, у каждого участника одно вето: оно убирает чужой вариант из прокрутки.
// Сбор помечен строкой в lot_evening; вето — строка на человека в lot_vetoes. Из прокрутки вето убирает liveLots
// (functions/_lib/lots-live.js) — его зовут и API, и комната лотов, так правило одно для обоих.
import { VETO_SQL } from './lots-live.js';
import { predictOpen } from './lots-predict.js';

const EVENING_SQL = 'CREATE TABLE IF NOT EXISTS lot_evening (room_id TEXT PRIMARY KEY, at INTEGER NOT NULL)';
let ready = null;
export async function ensureEvening(env) {
  if (ready === env.DB) return;
  await env.DB.batch([env.DB.prepare(EVENING_SQL), env.DB.prepare(VETO_SQL)]);
  ready = env.DB;
}
const parse = (s) => { try { const v = JSON.parse(s || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };

// можно ли этому человеку наложить вето на lot: '' — можно, иначе причина
export function vetoCheck({ lots, vetoes, uid, owner, lot }) {
  const it = (lots || []).find((l) => l.id === lot);
  if (!it) return 'Такого варианта в сборе нет.';
  if (it.user_id === uid) return 'Свой вариант убрать вето нельзя.';
  if (uid !== owner && !(lots || []).some((l) => l.user_id === uid)) return 'Вето есть у тех, кто добавил вариант.';
  const others = (vetoes || []).filter((v) => v.user_id !== uid);
  if (others.some((v) => v.lot_id === lot)) return 'Этот вариант уже убрали.';
  const left = (lots || []).filter((l) => l.id !== lot && !others.some((v) => v.lot_id === l.id));
  if (left.length < 2) return 'Нужно оставить хотя бы два варианта.';
  return '';
}

export function makeEveningRoutes(h) {
  const { json, fail } = h;
  const CODE = /^[A-Za-z0-9]{12}$/;
  async function view(env, code, me) {
    await ensureEvening(env);
    const [room, ev, lots, vetoes] = await env.DB.batch([
      env.DB.prepare('SELECT owner_id, live FROM lot_rooms WHERE id = ?').bind(code),
      env.DB.prepare('SELECT room_id FROM lot_evening WHERE room_id = ?').bind(code),
      env.DB.prepare('SELECT id, user_id FROM lots WHERE room_id = ?').bind(code),
      env.DB.prepare('SELECT v.user_id, v.lot_id, u.username AS name FROM lot_vetoes v JOIN users u ON u.id = v.user_id WHERE v.room_id = ? ORDER BY v.at').bind(code),
    ]);
    const r = room.results && room.results[0];
    if (!r) return null;
    const uid = me ? me.id : '', list = lots.results || [], vs = vetoes.results || [];
    const mine = (vs.find((v) => v.user_id === uid) || {}).lot_id || '';
    return {
      evening: !!(ev.results && ev.results.length), open: predictOpen(parse(r.live)), host: !!uid && uid === r.owner_id,
      mine, can: !!uid && (uid === r.owner_id || list.some((l) => l.user_id === uid)), own: list.filter((l) => l.user_id === uid).map((l) => l.id),
      vetoes: vs.map((v) => ({ lot: v.lot_id, name: v.name, me: v.user_id === uid })),
    };
  }
  const userOf = async (env, request) => { try { return h.currentUser ? await h.currentUser(env, request) : null; } catch (e) { return null; } };
  return {
    // вечер ли это и кто какой вариант убрал
    async 'GET /lots/:code/veto'({ env, request, arg }) {
      if (!CODE.test(arg || '')) return fail(404, 'Такого сбора нет.');
      const v = await view(env, arg, await userOf(env, request));
      return v ? json(v) : fail(404, 'Такого сбора нет.');
    },
    // { lot } — своё вето (заменяет прежнее); lot: '' — снять. Только до первой прокрутки
    async 'POST /lots/:code/veto'({ env, request, me, arg }) {
      if (!CODE.test(arg || '')) return fail(404, 'Такого сбора нет.');
      if (h.burst && h.burst('veto:' + me.id, 30, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = await h.readBody(request);
      const lot = String((b && b.lot) || '').slice(0, 40);
      await ensureEvening(env);
      const [room, ev, lots, vetoes] = await env.DB.batch([
        env.DB.prepare('SELECT owner_id, live FROM lot_rooms WHERE id = ?').bind(arg),
        env.DB.prepare('SELECT room_id FROM lot_evening WHERE room_id = ?').bind(arg),
        env.DB.prepare('SELECT id, user_id FROM lots WHERE room_id = ?').bind(arg),
        env.DB.prepare('SELECT user_id, lot_id FROM lot_vetoes WHERE room_id = ?').bind(arg),
      ]);
      const r = room.results && room.results[0];
      if (!r) return fail(404, 'Такого сбора нет.');
      if (!(ev.results && ev.results.length)) return fail(400, 'Вето бывает только в «Вечере с друзьями».');
      if (!predictOpen(parse(r.live))) return fail(409, 'Колесо уже крутится: вето больше не меняются.');
      if (lot) {
        const why = vetoCheck({ lots: lots.results, vetoes: vetoes.results, uid: me.id, owner: r.owner_id, lot });
        if (why) return fail(400, why);
        await env.DB.prepare('INSERT INTO lot_vetoes (room_id, user_id, lot_id, at) VALUES (?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET lot_id = excluded.lot_id, at = excluded.at').bind(arg, me.id, lot, Date.now()).run();
      } else await env.DB.prepare('DELETE FROM lot_vetoes WHERE room_id = ? AND user_id = ?').bind(arg, me.id).run();
      if (h.pokeRoom) { try { await h.pokeRoom(env, arg, 'lots'); } catch (e) {} }
      return json(await view(env, arg, me));
    },
    // { on } — ведущий делает сбор «Вечером с друзьями» (Колесо зовёт сразу после создания) или снимает это
    async 'POST /lots/:code/evening'({ env, request, me, arg }) {
      if (!CODE.test(arg || '')) return fail(404, 'Такого сбора нет.');
      const b = await h.readBody(request);
      await ensureEvening(env);
      const room = await env.DB.prepare('SELECT owner_id FROM lot_rooms WHERE id = ?').bind(arg).first();
      if (!room) return fail(404, 'Такого сбора нет.');
      if (room.owner_id !== me.id) return fail(403, 'Это может только ведущий.');
      if (b && b.on === false) await env.DB.batch([env.DB.prepare('DELETE FROM lot_evening WHERE room_id = ?').bind(arg), env.DB.prepare('DELETE FROM lot_vetoes WHERE room_id = ?').bind(arg)]);
      else await env.DB.prepare('INSERT OR IGNORE INTO lot_evening (room_id, at) VALUES (?, ?)').bind(arg, Date.now()).run();
      return json(await view(env, arg, me));
    },
  };
}
