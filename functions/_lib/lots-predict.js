// Казуал Хаб: «Прогнозы» — зрители угадывают победителя сбора лотов (страница /lots/<код>, блок lots/predict.js).
// Один прогноз на человека и сбор, менять можно до первой прокрутки; потом прогнозы закрыты и видно, кто за кого.
// Админ сайта видит, кто за кого, всё время — и пока прогнозы открыты (остальным в это время — только проценты).
// Опыт за угаданный прогноз (правило predict_win) каждый получает сам, когда смотрит итог (GET), — так в одном запросе
// нет начислений сотням зрителей. Ведущему за свой сбор и в сборе меньше чем от трёх участников опыт не даётся.
// Только виртуальный опыт: никаких ставок, денег и рофланов за прогноз.
import { levelsOn, currentSeason } from './levels.js';

let ready = null;
export async function ensurePredict(env) {
  if (ready === env.DB) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS lot_predicts (room_id TEXT NOT NULL, user_id TEXT NOT NULL, lot_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (room_id, user_id))').run();
  ready = env.DB;
}
// прогнозы открыты, пока колесо ни разу не крутилось (после «Вернуть всех» — снова открыты)
export const predictOpen = (live) => !(live && (live.res || live.winner || live.spin
  || (Array.isArray(live.hist) && live.hist.length) || (Array.isArray(live.outIds) && live.outIds.length)));
// выпавший лот — как в lotsWon: по id (pickL) или единственный оставшийся с именем победителя
export function winnerLot(live, lots) {
  if (!live || !live.winner) return '';
  if (live.pickL) return String(live.pickL);
  const out = new Set(Array.isArray(live.outIds) ? live.outIds : []);
  const left = (lots || []).filter((l) => !out.has(l.id) && l.name === live.winner.n);
  return left.length === 1 ? left[0].id : '';
}
// имена прогнозов: всем — когда прогнозы закрыты, админу — всегда
export const namesVisible = (open, adm) => !open || !!adm;
const parse = (s) => { try { const v = JSON.parse(s || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };

// лучшие прогнозисты сезона: угаданные прогнозы с начала сезона по журналу опыта (кэш на минуту)
let topCache = { at: 0, v: [], db: null };
async function seasonTop(env, now) {
  if (topCache.db === env.DB && now - topCache.at < 60e3 && now >= topCache.at) return topCache.v;
  let v = [];
  try {
    const s = levelsOn(env) ? await currentSeason(env, now) : null;
    if (s) {
      const r = await env.DB.prepare("SELECT x.user_id AS id, u.username AS name, COUNT(*) AS n FROM xp_log x JOIN users u ON u.id = x.user_id WHERE x.kind = 'predict_win' AND x.gone = 0 AND x.at >= ? AND (u.banned IS NULL OR u.banned = 0) GROUP BY x.user_id ORDER BY n DESC, MIN(x.at) ASC LIMIT 10").bind(s.start).all();
      v = (r.results || []).map((x) => ({ id: x.id, name: x.name, n: +x.n || 0 }));
    }
  } catch (e) { v = []; }
  topCache = { at: now, v, db: env.DB };
  return v;
}

export function makePredictRoutes(h) {
  const { json, fail } = h;
  const CODE = /^[A-Za-z0-9]{12}$/;
  // всё про прогнозы сбора одним запросом (пачка D1)
  async function view(env, request, code, me, now) {
    await ensurePredict(env);
    const uid = me ? me.id : '';
    const [room, lots, counts, mine, who] = await env.DB.batch([
      env.DB.prepare('SELECT r.owner_id, r.live, u.banned AS banned FROM lot_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?').bind(code),
      env.DB.prepare('SELECT id, user_id, name FROM lots WHERE room_id = ?').bind(code),
      env.DB.prepare('SELECT lot_id, COUNT(*) AS n FROM lot_predicts WHERE room_id = ? GROUP BY lot_id').bind(code),
      env.DB.prepare('SELECT lot_id FROM lot_predicts WHERE room_id = ? AND user_id = ?').bind(code, uid),
      env.DB.prepare('SELECT p.lot_id, u.username AS name FROM lot_predicts p JOIN users u ON u.id = p.user_id WHERE p.room_id = ? ORDER BY p.at LIMIT 300').bind(code),
    ]);
    const r = room.results && room.results[0];
    if (!r || r.banned) return null;
    const live = parse(r.live), open = predictOpen(live), list = lots.results || [];
    const win = winnerLot(live, list), my = (mine.results && mine.results[0] && mine.results[0].lot_id) || '';
    const c = {};
    let total = 0;
    for (const x of counts.results || []) { c[x.lot_id] = +x.n || 0; total += +x.n || 0; }
    // угадал — опыт (один раз за победителя: ref — сбор и время победы); ведущему и в маленьком сборе — нет
    let got = false;
    if (me && win && my === win) {
      got = true;
      const people = new Set(list.map((l) => l.user_id));
      if (me.id !== r.owner_id && people.size >= 3 && h.lvGive) {
        try { await h.lvGive(env, request, me, me.id, [{ kind: 'predict_win', ref: `${code}:${+(live.winner && live.winner.at) || 0}`, peer: r.owner_id }]); } catch (e) { console.error('predict xp', e && e.message); }
      }
    }
    // кто за кого: всем — когда прогнозы закрыты; админу — и пока открыты (проверка только тогда, когда она что-то меняет)
    let adm = false;
    if (open && me && h.isAdmin) { try { adm = await h.isAdmin(env, me); } catch (e) { adm = false; } }
    let names = null;
    if (namesVisible(open, adm)) { names = {}; for (const x of who.results || []) (names[x.lot_id] = names[x.lot_id] || []).push(x.name); }
    return { open, mine: my, win, got, total, counts: c, who: names, adm, top: await seasonTop(env, now), signed: !!me };
  }
  return {
    // прогнозы сбора: открыт ли, свой прогноз, сколько за какой лот, после закрытия — кто за кого; лучшие за сезон
    async 'GET /lots/:code/predict'({ env, request, arg }) {
      if (!CODE.test(arg || '')) return fail(404, 'Такого сбора нет.');
      let me = null;
      try { me = h.currentUser ? await h.currentUser(env, request) : null; } catch (e) {}
      const v = await view(env, request, arg, me, Date.now());
      return v ? json(v) : fail(404, 'Такого сбора нет.');
    },
    // { lot } — сделать или поменять прогноз (до первой прокрутки); lot: '' — убрать
    async 'POST /lots/:code/predict'({ env, request, me, arg }) {
      if (!CODE.test(arg || '')) return fail(404, 'Такого сбора нет.');
      if (h.burst && h.burst('predict:' + me.id, 30, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = await h.readBody(request);
      const lot = String((b && b.lot) || '').slice(0, 40);
      await ensurePredict(env);
      const [room, has] = await env.DB.batch([
        env.DB.prepare('SELECT live FROM lot_rooms WHERE id = ?').bind(arg),
        env.DB.prepare('SELECT id FROM lots WHERE room_id = ? AND id = ?').bind(arg, lot),
      ]);
      const r = room.results && room.results[0];
      if (!r) return fail(404, 'Такого сбора нет.');
      if (!predictOpen(parse(r.live))) return fail(409, 'Прогнозы закрыты: колесо уже крутится.');
      if (lot && !(has.results && has.results.length)) return fail(400, 'Такого лота в сборе нет.');
      if (lot) await env.DB.prepare('INSERT INTO lot_predicts (room_id, user_id, lot_id, at) VALUES (?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET lot_id = excluded.lot_id, at = excluded.at').bind(arg, me.id, lot, Date.now()).run();
      else await env.DB.prepare('DELETE FROM lot_predicts WHERE room_id = ? AND user_id = ?').bind(arg, me.id).run();
      return json(await view(env, request, arg, me, Date.now()));
    },
  };
}
