// Казуал Хаб: чат комнаты — в сборе лотов (/lots/<код>) и в «Царе Горы» (/king/?c=<код>). Клиент — общий виджет /chat.js
// (window.CasualChat), на странице сбора его ставит lots/chat.js. Главный файл API подключает адреса одной строкой:
// makeChatRoutes(h), передавая свои помощники (ответы, вход, лимиты, проверку админа). Папка _lib не становится адресом сайта.
//
// Сообщение — строка chat_msgs: scope ('lots' | 'king'), room (код комнаты), автор, текст до 300 символов и/или стикер
// из каталога Колеса (/wheel/hub/index.json, путь hub/…). Удалённое сообщение стирается, а вместо него пишется отметка —
// строка с del = номер удалённого: по ней удаление видят и те, кто спрашивает «что нового после N». Поэтому номера
// в комнате только растут и курсор after ничего не пропускает. В комнате хранятся последние CHAT.KEEP строк,
// сообщения старше CHAT.TTL понемногу стираются при новых.
// Читать может любой, у кого есть ссылка на комнату (как и саму комнату); писать — вошедшие, кроме заблокированных;
// удалить — автор, хозяин комнаты и админ сайта. Сообщения заблокированных и удалённых аккаунтов не отдаются.
//   GET  /chat?s=lots&r=<код>         — последние сообщения, кто ты (you), можешь ли удалять чужие (mod), есть ли комната вживую (rt)
//   GET  /chat?s=lots&r=<код>&after=N — только новое после N: { msgs, del, last }; так опрос без новостей почти ничего не стоит
//   POST /chat { s, r, text, sticker } → { m }
//   POST /chat/delete { s, r, id }
//   GET  /chat/ws?s=&r=               — WebSocket к комнате чата в Worker'е casualhub-rt: новые сообщения и удаления
//                                       приходят сразу, без опроса. Комната чата — того же класса LotRoomDO, но своя:
//                                       idFromName('chat:<scope>:<код>'), в ней только сокеты читателей (rt/worker.js)
// Удалили комнату — удалите и её чат: chatDrop(env, scope, код) в той же пачке и chatGone(env, scope, код) после
// (сбор лотов — DELETE /lots/:code в functions/api; «Царь Горы» — POST /king/delete в king.js).

export const CHAT = {
  TEXT: 300, // символов в сообщении
  PAGE: 50, // сообщений при открытии
  WINDOW: 80, // строк, из которых они набираются (с отметками об удалении)
  NEWER: 100, // новых за один опрос; больше — страница получает свежие PAGE заново (reset)
  KEEP: 300, // строк в комнате
  TTL: 30 * 864e5, // сообщения старше — стираются
  GAP_MS: 1200, // не чаще одного сообщения за столько от человека
  PER_MIN: 30, // и не больше стольких в минуту
};
export const SCOPES = ['lots', 'king'];
const CODE_RE = /^[A-Za-z0-9]{12}$/;
// стикер — картинка из каталога Колеса: путь hub/…; без «..» и «//», чтобы не выйти за /wheel/hub/
export const STICKER_RE = /^hub\/[\w\/.-]{1,120}\.(?:gif|png|webp|webm)$/;
// управляющие символы и подмена направления текста (как SPOOF_RE в shelf.js), переводы строк и табуляция — в пробел
const CTRL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
// хоть один видимый знак: сообщение из одних невидимых пробелов — пустое
const VISIBLE = /[^\s\u200b-\u200f\u2060\ufeff]/;
const NO_ROOM = 'Такого чата нет: комнату удалили или ссылка с ошибкой.';

export const scopeOf = (v) => (SCOPES.includes(v) ? v : '');
export const codeOf = (v) => (CODE_RE.test(String(v == null ? '' : v)) ? String(v) : '');
// текст сообщения: { text } (пустая строка — без текста) или { err }
export function cleanText(v) {
  if (v == null || v === '') return { text: '' };
  if (typeof v !== 'string') return { err: 'Не похоже на сообщение.' };
  const text = v.replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > CHAT.TEXT) return { err: `Слишком длинно: в сообщении до ${CHAT.TEXT} символов.` };
  return { text: VISIBLE.test(text) ? text : '' };
}
// стикер: { sticker } (пустая строка — без стикера) или { err }
export function cleanSticker(v) {
  if (v == null || v === '') return { sticker: '' };
  const s = String(v);
  if (!STICKER_RE.test(s) || s.includes('..') || s.includes('//')) return { err: 'Такого стикера нет.' };
  return { sticker: s };
}
// сообщение целиком: нужен текст или стикер
export function cleanMessage(b) {
  const t = cleanText(b && b.text);
  if (t.err) return t;
  const s = cleanSticker(b && b.sticker);
  if (s.err) return s;
  if (!t.text && !s.sticker) return { err: 'Пустое сообщение: напиши что-нибудь или выбери стикер.' };
  return { text: t.text, sticker: s.sticker };
}

// ---------- таблица ----------
const made = new WeakSet();
export async function ensureChat(env) {
  if (made.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS chat_msgs (id INTEGER PRIMARY KEY, scope TEXT NOT NULL, room TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', sticker TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, del INTEGER)"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS chat_msgs_room ON chat_msgs(scope, room, id)'),
  ]);
  made.add(env.DB);
}
// комната: хозяин и заблокирован ли он (заблокированного комнаты не видно, как и самого сбора или турнира)
const ROOM_SQL = {
  lots: 'SELECT r.owner_id AS owner, u.banned AS banned FROM lot_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?',
  king: 'SELECT r.owner_id AS owner, u.banned AS banned FROM king_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?',
};
// та же проверка внутри записи: сообщение ложится, только если комната есть (?2 — код)
const ROOM_OK = {
  lots: 'SELECT 1 FROM lot_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?2 AND (u.banned IS NULL OR u.banned = 0)',
  king: 'SELECT 1 FROM king_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?2 AND (u.banned IS NULL OR u.banned = 0)',
};
const MSG_SQL = 'SELECT m.id, m.user_id, m.text, m.sticker, m.at, m.del, u.id AS uid, u.username, u.uname, u.banned FROM chat_msgs m LEFT JOIN users u ON u.id = m.user_id';
// таблицы king_rooms нет, пока никто не создал турнир: значит, и комнаты нет
const noTable = (e) => /no such table/i.test(String((e && e.message) || e));
// чат удалённой комнаты — в ту же пачку, что и сама комната (таблицу chat_msgs перед этим создаёт ensureChat)
export const chatDrop = (env, scope, code) => env.DB.prepare('DELETE FROM chat_msgs WHERE scope = ? AND room = ?').bind(scope, code);
// удаление аккаунта (?1 — его id): его сообщения и чаты его сборов. До строки, которая удаляет его lot_rooms
export const CHAT_USER_SQL = "DELETE FROM chat_msgs WHERE user_id = ?1 OR (scope = 'lots' AND room IN (SELECT id FROM lot_rooms WHERE owner_id = ?1))";

// что отдаём о сообщении: автор — ник и юзернейм (почту — никогда)
export const msgOut = (r) => ({ id: r.id, at: r.at, text: r.text || '', sticker: r.sticker || '', u: { id: r.user_id, name: r.username || '', handle: r.uname || '' } });
// строки по возрастанию номера → сообщения, удаления и курсор. Сообщения заблокированных и удалённых аккаунтов пропускаются,
// но курсор идёт и за них, иначе опрос спрашивал бы их снова
export function digest(rows, last = 0) {
  const msgs = [], del = [];
  for (const r of rows) {
    if (r.id > last) last = r.id;
    if (r.del) { del.push(r.del); continue; }
    if (!r.uid || r.banned) continue;
    msgs.push(msgOut(r));
  }
  return { msgs, del, last };
}

// ---------- комната вживую (Worker casualhub-rt) ----------
// тот же переключатель, что rtOn в functions/api: есть привязка LOT_RT и LOTS_RT не "0"
export const chatLive = (env) => !!(env && env.LOT_RT) && env.LOTS_RT !== '0';
const chatRoom = (env, scope, code) => env.LOT_RT.get(env.LOT_RT.idFromName(`chat:${scope}:${code}`));
// разослать читателям чата: { t: 'chat', m } — новое сообщение, { t: 'chatdel', id } — удалено, { t: 'gone' } — комнаты больше нет
export async function chatPoke(env, scope, code, body) {
  if (!chatLive(env)) return;
  try { await chatRoom(env, scope, code).fetch('https://rt/chat', { method: 'POST', body: JSON.stringify(body) }); }
  catch (e) { console.error('chat rt poke', scope, code, e && e.message); }
}
export const chatGone = (env, scope, code) => chatPoke(env, scope, code, { t: 'gone' });

// ---------- адреса ----------
export function makeChatRoutes(h) {
  const { json, fail, readBody } = h;
  const slow = (key, max, win) => (h.burst ? h.burst(key, max, win) : 0);
  const ipOf = (request) => (h.clientIp ? h.clientIp(request) : '');
  const isAdmin = async (env, me) => {
    if (!me || !h.adminCandidate || !h.adminCandidate(me, env) || !h.isAdmin) return false;
    try { return !!(await h.isAdmin(env, me)); } catch (e) { return false; }
  };
  // комната: строка { owner, banned } или null; ошибку «нет таблицы» считаем «нет комнаты»
  async function roomOf(env, scope, code) {
    try { return await env.DB.prepare(ROOM_SQL[scope]).bind(code).first(); } catch (e) { if (noTable(e)) return null; throw e; }
  }
  // последние сообщения комнаты (по возрастанию) и курсор
  async function windowOf(env, scope, code, roomFirst) {
    const q = env.DB.prepare(`${MSG_SQL} WHERE m.scope = ? AND m.room = ? ORDER BY m.id DESC LIMIT ?`).bind(scope, code, CHAT.WINDOW);
    const res = roomFirst ? await env.DB.batch([env.DB.prepare(ROOM_SQL[scope]).bind(code), q]) : [null, { results: (await q.all()).results }];
    const d = digest((res[1].results || []).slice().reverse());
    return { room: res[0] ? (res[0].results || [])[0] || null : undefined, msgs: d.msgs.slice(-CHAT.PAGE), last: d.last };
  }
  return {
    // открыт без входа: читать чат может любой, у кого есть ссылка на комнату
    async 'GET /chat'({ env, request }) {
      const sp = new URL(request.url).searchParams;
      const scope = scopeOf(sp.get('s')), code = codeOf(sp.get('r'));
      if (!scope || !code) return fail(404, NO_ROOM);
      if (slow('chatget:' + ipOf(request), 600, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      await ensureChat(env);
      const a = sp.get('after');
      const after = a != null && /^\d{1,15}$/.test(a) ? +a : null;
      if (after != null) {
        // опрос: только то, что новее курсора, и комната (её могли удалить) — одной пачкой
        let room, rows;
        try {
          const [r, m] = await env.DB.batch([
            env.DB.prepare(ROOM_SQL[scope]).bind(code),
            env.DB.prepare(`${MSG_SQL} WHERE m.scope = ? AND m.room = ? AND m.id > ? ORDER BY m.id LIMIT ?`).bind(scope, code, after, CHAT.NEWER + 1),
          ]);
          room = (r.results || [])[0]; rows = m.results || [];
        } catch (e) { if (noTable(e)) return fail(404, NO_ROOM); throw e; }
        if (!room || room.banned) return fail(404, NO_ROOM);
        // страница долго спала и пропустила много: свежие сообщения заново, без отметок об удалении
        if (rows.length > CHAT.NEWER) { const w = await windowOf(env, scope, code, false); return json({ reset: true, msgs: w.msgs, del: [], last: w.last }); }
        return json(digest(rows, after));
      }
      let w;
      try { w = await windowOf(env, scope, code, true); } catch (e) { if (noTable(e)) return fail(404, NO_ROOM); throw e; }
      if (!w.room || w.room.banned) return fail(404, NO_ROOM);
      // кто смотрит: вошедшему — поле для сообщения, хозяину комнаты и админу — удаление чужих
      let me = null;
      try { me = h.currentUser ? await h.currentUser(env, request) : null; } catch (e) {}
      const you = me && !me.banned ? { id: me.id, name: me.username || '', handle: me.handle || '' } : null;
      const mod = !!you && (w.room.owner === me.id || (await isAdmin(env, me)));
      return json({ msgs: w.msgs, last: w.last, you, mod, banned: !!(me && me.banned), rt: chatLive(env), max: CHAT.TEXT });
    },
    // { s, r, text, sticker } — новое сообщение; ответ — оно само, остальным его разошлёт комната вживую
    async 'POST /chat'({ env, request, me }) {
      const b = await readBody(request);
      const scope = scopeOf(b.s), code = codeOf(b.r);
      if (!scope || !code) return fail(404, NO_ROOM);
      if (slow('chat1:' + me.id, 1, CHAT.GAP_MS) || slow('chat:' + me.id, CHAT.PER_MIN, 60e3)) return fail(429, 'Не так быстро: подожди немного.');
      const c = cleanMessage(b);
      if (c.err) return fail(400, c.err);
      await ensureChat(env);
      const now = Date.now();
      let row = null;
      // комната проверяется в той же записи: её не удалят между проверкой и сообщением
      try {
        row = await env.DB.prepare(`INSERT INTO chat_msgs (scope, room, user_id, text, sticker, at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (${ROOM_OK[scope]}) RETURNING id`)
          .bind(scope, code, me.id, c.text, c.sticker, now).first();
      } catch (e) { if (noTable(e)) return fail(404, NO_ROOM); throw e; }
      if (!row || !row.id) return fail(404, NO_ROOM);
      // комната не разрастается: последние CHAT.KEEP строк, а старое (дольше CHAT.TTL) понемногу стирается по всему сайту
      try {
        if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM chat_msgs WHERE scope = ?1 AND room = ?2 AND id < (SELECT id FROM chat_msgs WHERE scope = ?1 AND room = ?2 ORDER BY id DESC LIMIT 1 OFFSET ?3)').bind(scope, code, CHAT.KEEP - 1).run();
        if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM chat_msgs WHERE id IN (SELECT id FROM chat_msgs ORDER BY id LIMIT 200) AND at < ?').bind(now - CHAT.TTL).run();
      } catch (e) { console.error('chat prune', e && e.message); }
      const m = { id: row.id, at: now, text: c.text, sticker: c.sticker, u: { id: me.id, name: me.username || '', handle: me.handle || '' } };
      await chatPoke(env, scope, code, { t: 'chat', m });
      return json({ m });
    },
    // { s, r, id } — удалить: своё, любое в своей комнате или любое как админ сайта
    async 'POST /chat/delete'({ env, request, me }) {
      const b = await readBody(request);
      const scope = scopeOf(b.s), code = codeOf(b.r), id = Math.floor(+b.id || 0);
      if (!scope || !code) return fail(404, NO_ROOM);
      if (!(id > 0)) return fail(400, 'Какое сообщение удалить?');
      if (slow('chatdel:' + me.id, 60, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      await ensureChat(env);
      let room, msg;
      try {
        const [r, m] = await env.DB.batch([
          env.DB.prepare(ROOM_SQL[scope]).bind(code),
          env.DB.prepare('SELECT id, user_id FROM chat_msgs WHERE id = ? AND scope = ? AND room = ? AND del IS NULL').bind(id, scope, code),
        ]);
        room = (r.results || [])[0]; msg = (m.results || [])[0];
      } catch (e) { if (noTable(e)) return fail(404, NO_ROOM); throw e; }
      if (!room || room.banned) return fail(404, NO_ROOM);
      if (!msg) return json({ ok: true, id, gone: true }); // уже удалили — для страницы итог тот же
      const how = msg.user_id === me.id ? 'own' : room.owner === me.id ? 'owner' : (await isAdmin(env, me)) ? 'admin' : '';
      if (!how) return fail(403, 'Чужие сообщения удаляют только ведущий и админ.');
      await env.DB.batch([
        env.DB.prepare('DELETE FROM chat_msgs WHERE id = ?').bind(id),
        env.DB.prepare("INSERT INTO chat_msgs (scope, room, user_id, text, sticker, at, del) VALUES (?, ?, '', '', '', ?, ?)").bind(scope, code, Date.now(), id),
      ]);
      if (how === 'admin' && h.adminLog) await h.adminLog(env, request, me, `chat ${scope} ${code}: deleted #${id}`, true);
      await chatPoke(env, scope, code, { t: 'chatdel', id });
      return json({ ok: true, id });
    },
    // чат вживую: WebSocket к комнате чата. Смотреть может любой со ссылкой, писать в сокет нечего (только "ping")
    async 'GET /chat/ws'({ env, request }) {
      if (!chatLive(env)) return fail(404, 'Нет такого адреса.');
      if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return fail(426, 'Нужен WebSocket.');
      if (slow('chatws:' + ipOf(request), 120, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const sp = new URL(request.url).searchParams;
      const scope = scopeOf(sp.get('s')), code = codeOf(sp.get('r'));
      if (!scope || !code) return fail(404, NO_ROOM);
      const room = await roomOf(env, scope, code);
      if (!room || room.banned) return fail(404, NO_ROOM);
      const protos = (request.headers.get('sec-websocket-protocol') || '').split(',').map((x) => x.trim());
      const headers = new Headers({ upgrade: 'websocket', 'x-rt-chat': `${scope}:${code}`, 'x-rt-proto': protos.includes('casualhub') ? 'casualhub' : '' });
      for (const k of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions']) { const v = request.headers.get(k); if (v) headers.set(k, v); }
      return chatRoom(env, scope, code).fetch('https://rt/chat/ws', { headers });
    },
  };
}
