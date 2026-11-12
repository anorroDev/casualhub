// Казуал Хаб: «Бинго для стрима» в Лотах (страница — lots/bingo.js). Ведущий сбора запускает бинго со списком клише
// и отмечает, что случилось на стриме; у каждого зрителя своя перемешанная карточка 5×5 (центр свободный), клетки
// закрываются сами — сжульничать нельзя. Кто первым собрал линию (ряд, столбец, диагональ) — победил; первым трём — опыт.
// Игра — строка в bingo_games (клише, отмеченные, победители), карточки — строка на зрителя в bingo_cards.

export const BINGO_DEFAULT = [
  'Вылет на первой минуте', 'Чат пишет «людишки»', 'Забыл включить микрофон', 'Донат с музыкой на всю громкость',
  '«Это последняя катка»', 'Лагает интернет', 'Ругает баланс игры', 'Кто-то в чате спойлерит', '«Я так и знал»',
  'Перезапуск игры', 'Ест на стриме', 'Кот в кадре', 'Звонок в дверь', '«Чат, вы видели?»', 'Сохранение не сработало',
  'Застрял в текстуре', 'Пять минут ищет предмет', '«Это не баг, это фича»', 'Смерть от падения', 'Чат советует не то',
  'Обещает пройти без смертей', 'Спам рофлан-эмоутами', '«Сейчас будет жёстко»', 'Читает донат с ошибками',
  'Пауза «на минуточку»', 'Музыка громче голоса', 'Спорит с чатом', 'Неожиданный скример', '«Ну это рандом»',
  'Модератор банит за спойлер', 'Колесо выбрало худший лот', 'Пьёт чай', '«Я тут уже был»', 'Ачивка во время катсцены',
  'Разговор про погоду', 'Чат просит другую игру',
];
export const FREE = 12; // центр карточки
export const LINES = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
];
// собрана ли линия: клетка закрыта, если она свободная или её клише отмечено
export function lineDone(cells, marked) {
  const m = new Set(marked);
  return LINES.some((line) => line.every((p) => p === FREE || m.has(cells[p])));
}
// карточка: 24 разных клише из списка в случайном порядке, в центре -1 (свободно)
export function newCard(n, rnd = Math.random) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const c = idx.slice(0, 24);
  c.splice(FREE, 0, -1);
  return c;
}
// список клише от ведущего: 24–60 разных строк до 60 знаков, иначе null
export function cleanItems(list) {
  if (!Array.isArray(list)) return null;
  const out = [], seen = new Set();
  for (const x of list) {
    const s = String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (s.length < 2 || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase()); out.push(s);
    if (out.length >= 60) break;
  }
  return out.length >= 24 ? out : null;
}
const arr = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };

let ready = null;
async function ensure(env) {
  if (ready === env.DB) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS bingo_games (room_id TEXT PRIMARY KEY, items TEXT NOT NULL, marked TEXT NOT NULL DEFAULT '[]', winners TEXT NOT NULL DEFAULT '[]', at INTEGER NOT NULL)"),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS bingo_cards (room_id TEXT NOT NULL, user_id TEXT NOT NULL, cells TEXT NOT NULL, won_at INTEGER, PRIMARY KEY (room_id, user_id))'),
  ]);
  ready = env.DB;
}

export function makeBingoRoutes(h) {
  const { json, fail } = h;
  const CODE = /^[A-Za-z0-9]{12}$/;
  const userOf = async (env, request) => { try { return h.currentUser ? await h.currentUser(env, request) : null; } catch (e) { return null; } };
  async function view(env, code, me) {
    await ensure(env);
    const uid = me ? me.id : '';
    const [room, game, card, players] = await env.DB.batch([
      // xb — метка бинго в снимке колеса (stamp ниже): по ней страница видит, что её ответ не старше снимка
      env.DB.prepare("SELECT owner_id, CASE WHEN json_valid(live) THEN json_extract(live, '$.xb') END AS xb FROM lot_rooms WHERE id = ?").bind(code),
      env.DB.prepare('SELECT items, marked, winners FROM bingo_games WHERE room_id = ?').bind(code),
      env.DB.prepare('SELECT cells, won_at FROM bingo_cards WHERE room_id = ? AND user_id = ?').bind(code, uid),
      env.DB.prepare('SELECT COUNT(*) AS n FROM bingo_cards WHERE room_id = ?').bind(code),
    ]);
    const r = room.results && room.results[0];
    if (!r) return null;
    const host = !!uid && uid === r.owner_id, xb = +r.xb || 0;
    const g = game.results && game.results[0];
    if (!g) return { on: false, host, xb, defaults: host ? BINGO_DEFAULT : undefined };
    const items = arr(g.items);
    let c = card.results && card.results[0];
    // первая карточка зрителя — при первом заходе (у ведущего карточки нет: он отмечает)
    if (!c && uid && !host) {
      const cells = newCard(items.length);
      await env.DB.prepare('INSERT OR IGNORE INTO bingo_cards (room_id, user_id, cells) VALUES (?, ?, ?)').bind(code, uid, JSON.stringify(cells)).run();
      c = await env.DB.prepare('SELECT cells, won_at FROM bingo_cards WHERE room_id = ? AND user_id = ?').bind(code, uid).first();
    }
    const winners = arr(g.winners);
    return {
      on: true, host, xb, items, marked: arr(g.marked), card: c ? arr(c.cells) : null, won: !!(c && c.won_at),
      place: c && c.won_at ? winners.findIndex((w) => w.id === uid) + 1 : 0,
      winners: winners.map((w) => ({ name: w.name, at: w.at })), players: (players.results && players.results[0] && +players.results[0].n) || 0,
    };
  }
  // бинго поменялось — на единицу больше метка xb в снимке колеса (lot_rooms.live). Снимок и так сразу уходит всем по сокету
  // комнаты лотов (без комнаты — опросом с ETag), а страницы по новой метке перечитывают бинго (lots/bingo.js).
  // liveTx и settledLive пишут снимок, только если его не меняли с чтения, — после этой записи они просто перечитают его.
  // Снимка нет (ведущий ещё не открывал колесо) — нет и метки: тогда страницы, как раньше, спрашивают идущее бинго сами раз в 6 с
  async function stamp(env, code) {
    try {
      const w = await env.DB.prepare("UPDATE lot_rooms SET live = json_set(live, '$.xb', coalesce(json_extract(live, '$.xb'), 0) + 1) WHERE id = ? AND json_valid(live)").bind(code).run();
      if (w.meta && w.meta.changes && h.pokeRoom) await h.pokeRoom(env, code, 'live');
    } catch (e) { console.error('bingo stamp', code, e && e.message); }
  }
  return {
    // бинго сбора: клише, отмеченные, своя карточка (выдаётся при первом заходе), победители
    async 'GET /lots/:code/bingo'({ env, request, arg }) {
      if (!CODE.test(arg || '')) return fail(404, 'Такого сбора нет.');
      const v = await view(env, arg, await userOf(env, request));
      return v ? json(v) : fail(404, 'Такого сбора нет.');
    },
    // ведущий: { act: 'start', items? } — новая игра; { act: 'mark', i, on } — случилось ли клише; { act: 'stop' }
    async 'POST /lots/:code/bingo'({ env, request, me, arg }) {
      if (!CODE.test(arg || '')) return fail(404, 'Такого сбора нет.');
      if (h.burst && h.burst('bingo:' + me.id, 120, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = (await h.readBody(request)) || {};
      await ensure(env);
      const room = await env.DB.prepare('SELECT owner_id FROM lot_rooms WHERE id = ?').bind(arg).first();
      if (!room) return fail(404, 'Такого сбора нет.');
      if (room.owner_id !== me.id) return fail(403, 'Бинго ведёт только ведущий сбора.');
      const now = Date.now();
      if (b.act === 'start') {
        const items = b.items == null ? BINGO_DEFAULT : cleanItems(b.items);
        if (!items) return fail(400, 'Нужно от 24 до 60 разных клише, каждое до 60 знаков.');
        await env.DB.batch([
          env.DB.prepare("INSERT INTO bingo_games (room_id, items, marked, winners, at) VALUES (?, ?, '[]', '[]', ?) ON CONFLICT(room_id) DO UPDATE SET items = excluded.items, marked = '[]', winners = '[]', at = excluded.at").bind(arg, JSON.stringify(items), now),
          env.DB.prepare('DELETE FROM bingo_cards WHERE room_id = ?').bind(arg),
        ]);
      } else if (b.act === 'stop') {
        await env.DB.batch([env.DB.prepare('DELETE FROM bingo_games WHERE room_id = ?').bind(arg), env.DB.prepare('DELETE FROM bingo_cards WHERE room_id = ?').bind(arg)]);
      } else if (b.act === 'mark') {
        const g = await env.DB.prepare('SELECT items, marked, winners FROM bingo_games WHERE room_id = ?').bind(arg).first();
        if (!g) return fail(400, 'Бинго ещё не запущено.');
        const items = arr(g.items), i = Math.floor(+b.i);
        if (!(i >= 0 && i < items.length)) return fail(400, 'Нет такого клише.');
        const marked = new Set(arr(g.marked));
        if (b.on === false) marked.delete(i); else marked.add(i);
        const winners = arr(g.winners), fresh = [];
        // новые победители: одно чтение карточек без победы и одна запись (отменённая отметка победу не отнимает)
        if (b.on !== false) {
          const { results } = await env.DB.prepare('SELECT c.user_id, c.cells, u.username AS name FROM bingo_cards c JOIN users u ON u.id = c.user_id WHERE c.room_id = ? AND c.won_at IS NULL LIMIT 1000').bind(arg).all();
          for (const x of results || []) if (lineDone(arr(x.cells), [...marked])) fresh.push({ id: x.user_id, name: x.name, at: now });
        }
        const all = [...winners, ...fresh];
        const writes = [env.DB.prepare('UPDATE bingo_games SET marked = ?, winners = ? WHERE room_id = ?').bind(JSON.stringify([...marked]), JSON.stringify(all), arg)];
        if (fresh.length) writes.push(env.DB.prepare('UPDATE bingo_cards SET won_at = ? WHERE room_id = ? AND won_at IS NULL AND user_id IN (SELECT value FROM json_each(?))').bind(now, arg, JSON.stringify(fresh.map((x) => x.id))));
        await env.DB.batch(writes);
        // опыт — первым трём победителям игры
        if (h.lvGive) for (const w of fresh) if (all.indexOf(w) < 3) { try { await h.lvGive(env, request, me, w.id, [{ kind: 'bingo_win', ref: `${arg}:${w.id}`, peer: me.id }]); } catch (e) { console.error('bingo xp', e && e.message); } }
      } else return fail(400, 'Неизвестное действие.');
      await stamp(env, arg);
      return json(await view(env, arg, me));
    },
  };
}
