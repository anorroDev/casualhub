// Казуал Хаб: «Тир-лист вместе» (страница — tierlist/coop.js). Ведущий открывает комнату из своего тир-листа: ряды и элементы.
// Каждый по ссылке раскладывает элементы по рядам сам, а все видят «средний» тир-лист компании: элемент стоит в ряду,
// куда его в среднем поставили; видно, сколько голосов и где разброс большой. Ведущий закрывает голосование.
// Комната — строка в tier_rooms, раскладки — строка на человека в tier_votes. Обновление — опрос.

export const TC = { ROWS: 10, ITEMS: 60, NAME: 60, TITLE: 80, VOTERS: 500, ROOMS: 20 };
const CODE_RE = /^[A-Za-z0-9]{12}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const IMG_RE = /^(https:\/\/[^\s"'<>()\\]{8,590}|\/wheel\/hub\/[\w/.-]{1,120}\.(?:gif|png|webp|jpe?g))$/;
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const arr = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const obj = (s) => { try { const v = JSON.parse(s || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; } };
function roomCode() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(24))].filter((b) => b < 248).slice(0, 12).map((b) => abc[b % 62]).join('').padEnd(12, 't');
}
// ряды и элементы от страницы; ошибка — { err }
export function cleanRoom(b) {
  const rows = (Array.isArray(b && b.rows) ? b.rows : []).slice(0, TC.ROWS).map((r) => ({ t: clean(r && r.t, 24) || '?', c: COLOR_RE.test(String(r && r.c)) ? String(r.c) : '#6B7280' }));
  const seen = new Set(), items = [];
  for (const x of Array.isArray(b && b.items) ? b.items : []) {
    const n = clean(x && x.n, TC.NAME);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    const img = clean(x && x.img, 600);
    items.push({ id: 'i' + items.length.toString(36), n, img: IMG_RE.test(img) ? img : '' });
    if (items.length >= TC.ITEMS) break;
  }
  if (rows.length < 2) return { err: 'Нужно хотя бы два ряда.' };
  if (items.length < 2) return { err: 'Нужно хотя бы два элемента.' };
  return { title: clean(b && b.title, TC.TITLE) || 'Тир-лист вместе', rows, items };
}
// раскладка человека: { id элемента: номер ряда } только для существующих элементов и рядов
export function cleanPicks(p, room) {
  const ids = new Set(room.items.map((x) => x.id)), out = {};
  for (const [k, v] of Object.entries(p && typeof p === 'object' ? p : {})) {
    const r = Math.floor(+v);
    if (ids.has(k) && r >= 0 && r < room.rows.length) out[k] = r;
  }
  return out;
}
// средний тир-лист: для каждого элемента средний ряд, число голосов и разброс (стандартное отклонение в рядах)
export function average(room, votes) {
  return room.items.map((it) => {
    const xs = votes.map((v) => v[it.id]).filter((x) => Number.isInteger(x));
    if (!xs.length) return { id: it.id, row: -1, n: 0, mean: null, spread: 0 };
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const spread = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return { id: it.id, row: Math.round(mean), n: xs.length, mean: Math.round(mean * 100) / 100, spread: Math.round(spread * 100) / 100 };
  });
}

let ready = null;
async function ensure(env) {
  if (ready === env.DB) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS tier_rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, rows TEXT NOT NULL, items TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS tier_votes (room_id TEXT NOT NULL, user_id TEXT NOT NULL, picks TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (room_id, user_id))'),
  ]);
  ready = env.DB;
}

export function makeTierCoopRoutes(h) {
  const { json, fail } = h;
  const userOf = async (env, request) => { try { return h.currentUser ? await h.currentUser(env, request) : null; } catch (e) { return null; } };
  async function view(env, code, me) {
    await ensure(env);
    const [room, votes] = await env.DB.batch([
      env.DB.prepare('SELECT r.id, r.owner_id, r.title, r.rows, r.items, r.status, u.username AS owner FROM tier_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?').bind(code),
      env.DB.prepare('SELECT user_id, picks FROM tier_votes WHERE room_id = ? ORDER BY at LIMIT ?').bind(code, TC.VOTERS),
    ]);
    const r = room.results && room.results[0];
    if (!r) return null;
    const R = { id: r.id, title: r.title, rows: arr(r.rows), items: arr(r.items), status: r.status, own: !!me && me.id === r.owner_id, owner: r.owner || '' };
    const vs = votes.results || [];
    const mine = me ? vs.find((v) => v.user_id === me.id) : null;
    return { room: R, mine: mine ? obj(mine.picks) || {} : null, avg: average(R, vs.map((v) => obj(v.picks) || {})), voters: vs.length };
  }
  return {
    // новая комната из тир-листа: { title, rows: [{ t, c }], items: [{ n, img }] }
    async 'POST /tiercoop'({ env, me, request }) {
      if (h.burst && h.burst('tcnew:' + me.id, 10, 600e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const c = cleanRoom(await h.readBody(request));
      if (c.err) return fail(400, c.err);
      await ensure(env);
      const now = Date.now(), id = roomCode();
      const old = await env.DB.prepare('SELECT id FROM tier_rooms WHERE owner_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?').bind(me.id, TC.ROOMS - 1).all();
      const drop = (old.results || []).flatMap((x) => [env.DB.prepare('DELETE FROM tier_votes WHERE room_id = ?').bind(x.id), env.DB.prepare('DELETE FROM tier_rooms WHERE id = ?').bind(x.id)]);
      await env.DB.batch([...drop, env.DB.prepare("INSERT INTO tier_rooms (id, owner_id, title, rows, items, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)").bind(id, me.id, c.title, JSON.stringify(c.rows), JSON.stringify(c.items), now, now)]);
      return json({ id });
    },
    // комната: ряды, элементы, своя раскладка, средний тир-лист. Смотреть можно без входа
    async 'GET /tiercoop/room'({ env, request }) {
      const code = new URL(request.url).searchParams.get('c') || '';
      if (!CODE_RE.test(code)) return fail(404, 'Такой комнаты нет.');
      const v = await view(env, code, await userOf(env, request));
      return v ? json(v) : fail(404, 'Такой комнаты нет.');
    },
    // своя раскладка: { c, picks: { id: ряд } } — перезаписывает прежнюю
    async 'POST /tiercoop/vote'({ env, request, me }) {
      if (h.burst && h.burst('tcvote:' + me.id, 120, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = (await h.readBody(request)) || {};
      const code = String(b.c || '');
      if (!CODE_RE.test(code)) return fail(404, 'Такой комнаты нет.');
      await ensure(env);
      const r = await env.DB.prepare('SELECT owner_id, rows, items, status FROM tier_rooms WHERE id = ?').bind(code).first();
      if (!r) return fail(404, 'Такой комнаты нет.');
      if (r.status !== 'open') return fail(409, 'Голосование закрыто.');
      const picks = cleanPicks(b.picks, { rows: arr(r.rows), items: arr(r.items) });
      await env.DB.prepare('INSERT INTO tier_votes (room_id, user_id, picks, at) VALUES (?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET picks = excluded.picks, at = excluded.at').bind(code, me.id, JSON.stringify(picks), Date.now()).run();
      // опыт участнику — за раскладку хотя бы половины элементов, один раз на комнату
      if (h.lvGive && me.id !== r.owner_id && Object.keys(picks).length * 2 >= arr(r.items).length) { try { await h.lvGive(env, request, me, me.id, [{ kind: 'tier_coop', ref: code, peer: r.owner_id }]); } catch (e) {} }
      return json(await view(env, code, me));
    },
    // ведущий закрывает голосование (итог остаётся виден по ссылке); опыт ведущему — если голосовали хотя бы трое
    async 'POST /tiercoop/close'({ env, request, me }) {
      const code = String(((await h.readBody(request)) || {}).c || '');
      if (!CODE_RE.test(code)) return fail(404, 'Такой комнаты нет.');
      await ensure(env);
      const r = await env.DB.prepare('SELECT owner_id FROM tier_rooms WHERE id = ?').bind(code).first();
      if (!r) return fail(404, 'Такой комнаты нет.');
      if (r.owner_id !== me.id) return fail(403, 'Это может только ведущий.');
      await env.DB.prepare("UPDATE tier_rooms SET status = 'closed', updated_at = ? WHERE id = ?").bind(Date.now(), code).run();
      const v = await view(env, code, me);
      if (h.lvGive && v.voters >= 3) { try { await h.lvGive(env, request, me, me.id, [{ kind: 'tier_coop_host', ref: code }]); } catch (e) {} }
      return json(v);
    },
  };
}
