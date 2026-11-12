// Казуал Хаб: «Царь Горы» — турниры по ссылке. Страница — /king/ (king/app.js), карточка — на главной (index.html).
// Главный файл API подключает адреса одной строкой: makeKingRoutes(h), передавая свои помощники (ответы, вход,
// опыт, лимиты и список открытых без входа адресов). Папка _lib не становится адресом сайта.
//
// Два формата:
//   hill    — «Царь горы»: участники в очереди, царь бьётся с очередным претендентом, победитель остаётся на горе.
//             Проигравший выбывает. Считаем, сколько боёв подряд держится царь (streak), рекорд (best) и кто кого сверг (log.x).
//   bracket — «Сетка» на 4, 8, 16 или 32: посев по порядку (1-й с последним, первые встретятся в финале) или случайный.
//             Участников ровно столько, каков размер сетки (bracketErr). Пропуски (верхние по посеву без боя) умеет
//             buildRounds — они остались у старых турниров, созданных до этого правила.
// Бой решает ведущий (mode: 'host') или голосование по ссылке (mode: 'vote'): ведущий закрывает бой или его закрывает
// таймер. При равенстве голосов царь остаётся на горе, в сетке проходит верхний в паре.
//
// Всё про турнир лежит одним снимком в king_rooms.state (JSON), голоса — в king_votes (строка на человека и бой).
// Снимок меняется только через tx(): запись проходит, если снимок никто не поменял с момента чтения (ver).
// Комнаты (Durable Object) нет: страницы опрашивают GET /king/room с ETag, таймер закрывает первый запрос после срока.
// Как подключить комнату позже — h.poke (зовётся после каждой записи), см. notes.

// ---------- правила ----------
import { ensureChat, chatDrop, chatGone } from './chat.js'; // чат турнира удаляется вместе с ним
export const KING = {
  HILL_MAX: 64, // участников в «Царе горы»
  SIZES: [4, 8, 16, 32], // сетка
  TIMERS: [0, 15, 30, 45, 60, 90, 120, 180, 300], // секунд на голосование, 0 — без таймера
  PAUSE: 4000, // столько после боя видно итог, потом открывается следующий
  ROOMS: 30, // турниров у ведущего: старые сверх этого удаляются
  NAME: 80, TITLE: 80, IMG: 600,
  IMG_DATA: 16000, // своя обложка участника (из «Мнения»): маленький data URL, лежит у турнира в king_imgs
  HOST_MIN: 4, // опыт ведущему — за турнир хотя бы на 4 участника
};
export const CODE_RE = /^[A-Za-z0-9]{12}$/;
const IMG_RE = /^(https:\/\/[^\s"'<>()\\]{8,590}|\/wheel\/hub\/[\w\/.-]{1,120}\.(?:gif|png|webp|jpe?g)|\/art\/[\w\/.-]{1,120}\.(?:svg|png|webp))$/;
const DATA_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const parse = (s) => { try { const v = JSON.parse(s || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export function roomCode() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(24))].filter((b) => b < 248).slice(0, 12).map((b) => abc[b % 62]).join('').padEnd(12, 'k');
}

// участники от страницы: название (обязательно) и картинка (ссылка https, стикер сайта, своя маленькая картинка или ничего).
// Своя картинка: { img: '@', data } — data уходит в king_imgs, в снимке остаётся «@». Повторы названий убираются
export function cleanPeople(list, max) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const n = clean(x && (typeof x === 'string' ? x : x.n), KING.NAME);
    const k = n.toLowerCase();
    if (!n || seen.has(k)) continue;
    seen.add(k);
    const raw = x && typeof x.img === 'string' ? x.img : '';
    if (raw.length <= KING.IMG_DATA && DATA_RE.test(raw)) out.push({ n, img: '@', data: raw });
    else { const img = clean(raw, KING.IMG); out.push({ n, img: IMG_RE.test(img) ? img : '' }); }
    if (out.length >= max) break;
  }
  return out;
}
const many = (n) => { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? 'участников' : b === 1 ? 'участник' : b > 1 && b < 5 ? 'участника' : 'участников'; };
// сетка заполняется целиком: участников ровно size. Пусто — всё в порядке, иначе понятный текст, сколько добавить или убрать
export function bracketErr(n, size) {
  if (n < size) return `Для сетки на ${size} нужно ровно ${size} ${many(size)}, сейчас ${n}: добавь ещё ${size - n}.`;
  if (n > size) return `В сетку на ${size} помещается ровно ${size} ${many(size)}, сейчас ${n}: убери ${n - size}${size < 32 ? ' или выбери сетку побольше' : ''}.`;
  return '';
}
// настройки нового турнира; ошибка — { err: текст }
export function cleanConfig(b) {
  const fmt = b && b.fmt === 'bracket' ? 'bracket' : 'hill';
  const mode = b && b.mode === 'vote' ? 'vote' : 'host';
  const timer = KING.TIMERS.includes(+(b && b.timer)) ? +b.timer : 0;
  const seed = b && b.seed === 'random' ? 'random' : 'order';
  // в сетку — не обрезаем молча: лишних считаем, чтобы сказать, сколько убрать
  const p = cleanPeople(b && b.p, KING.HILL_MAX);
  let size = 0;
  if (fmt === 'bracket') {
    size = KING.SIZES.includes(+b.size) ? +b.size : KING.SIZES.find((s) => s >= p.length) || 32;
    const err = bracketErr(p.length, size);
    if (err) return { err };
  } else if (p.length < 2) return { err: 'Нужно хотя бы двое участников.' };
  const title = clean(b && b.title, KING.TITLE) || (fmt === 'bracket' ? 'Сетка' : 'Царь горы');
  return { title, fmt, mode, timer, seed, size, p };
}

// ---------- снимок турнира ----------
// imgs — куда сложить свои картинки участников ({ id, data }) для king_imgs; без него свои картинки не ставятся
export function newState(cfg, imgs) {
  const st = {
    v: 1, fmt: cfg.fmt, mode: cfg.mode, timer: cfg.timer, seed: cfg.seed, size: cfg.size || 0,
    status: 'ready', p: [], pv: 1, pid: 1,
    king: null, streak: 0, queue: [], out: [], best: null, rounds: null,
    bout: null, next: 1, log: [], champ: null, doneAt: 0, undo: null,
  };
  for (const x of cfg.p) {
    const id = 'p' + (st.pid++).toString(36);
    st.p.push({ id, n: x.n, img: x.data && !imgs ? '' : x.img });
    if (x.data && imgs) imgs.push({ id, data: x.data });
  }
  return st;
}
// стандартный посев: 1–8, 4–5, 2–7, 3–6 — сильные по списку встречаются как можно позже
export function seedOrder(size) {
  let o = [1, 2];
  while (o.length < size) { const n = o.length * 2; o = o.flatMap((s) => [s, n + 1 - s]); }
  return o;
}
function place(rounds, r, m, id) {
  const nx = rounds[r + 1];
  if (nx) nx[m >> 1][m % 2 ? 'b' : 'a'] = id;
}
export function buildRounds(ids, size) {
  const order = seedOrder(size), r0 = [];
  for (let i = 0; i < size; i += 2) {
    const a = ids[order[i] - 1] || null, b = ids[order[i + 1] - 1] || null;
    r0.push(a && b ? { a, b } : { a, b, w: a || b || null });
  }
  const rounds = [r0];
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => ({})));
  r0.forEach((mt, m) => { if (mt.w) place(rounds, 0, m, mt.w); });
  return rounds;
}
function mkBout(st, a, b, now, delay, r, m) {
  const opens = now + (delay || 0);
  const bout = { n: st.next++, a, b, opens, ends: st.mode === 'vote' && st.timer ? opens + st.timer * 1000 : 0 };
  if (r != null) { bout.r = r; bout.m = m; }
  return bout;
}
function finish(st, now) {
  st.bout = null;
  st.status = 'done';
  st.doneAt = now;
  if (st.fmt === 'hill') st.champ = st.king;
  else { const fin = st.rounds[st.rounds.length - 1][0]; st.champ = (fin && fin.w) || null; }
}
// следующий бой: в «Царе горы» — царь и первый в очереди, в сетке — первая пара, где известны оба
function openNext(st, now, delay) {
  st.bout = null;
  if (st.fmt === 'hill') {
    if (!st.king) st.king = st.queue.shift() || null;
    if (!st.king || !st.queue.length) return finish(st, now);
    st.bout = mkBout(st, st.king, st.queue.shift(), now, delay);
    return;
  }
  for (let r = 0; r < st.rounds.length; r++) {
    for (let m = 0; m < st.rounds[r].length; m++) {
      const mt = st.rounds[r][m];
      if (mt.a && mt.b && !mt.w) { st.bout = mkBout(st, mt.a, mt.b, now, delay, r, m); return; }
    }
  }
  finish(st, now);
}
export function startState(st, now, rnd = Math.random) {
  if (st.status !== 'ready') return { err: [409, 'Турнир уже идёт.'] };
  const ids = st.p.map((x) => x.id);
  if (st.seed === 'random') shuffle(ids, rnd);
  if (st.fmt === 'hill') {
    if (ids.length < 2) return { err: [400, 'Нужно хотя бы двое участников.'] };
    st.queue = ids;
  } else {
    const err = bracketErr(ids.length, st.size);
    if (err) return { err: [400, err] };
    st.rounds = buildRounds(ids, st.size);
  }
  st.status = 'live';
  openNext(st, now, 0);
  return { ok: true, opened: st.bout };
}
const UNDO = ['status', 'king', 'streak', 'queue', 'out', 'best', 'rounds', 'bout', 'next', 'champ', 'doneAt'];
const snapshot = (st) => ({ ...JSON.parse(JSON.stringify(Object.fromEntries(UNDO.map((k) => [k, st[k]])))), logN: st.log.length });
// исход боя: w — 'a' или 'b' (в «Царе горы» a — царь), by — host | vote | timer, votes — { va, vb }
export function decide(st, w, by, votes, now) {
  const bt = st.bout;
  if (st.status !== 'live' || !bt) return { err: [409, 'Сейчас боя нет.'] };
  if (w !== 'a' && w !== 'b') return { err: [400, 'Кто победил?'] };
  st.undo = snapshot(st);
  const va = Math.max(0, Math.floor(+(votes && votes.va) || 0)), vb = Math.max(0, Math.floor(+(votes && votes.vb) || 0));
  const entry = { n: bt.n, a: bt.a, b: bt.b, w, by, va, vb, at: now };
  if (st.fmt === 'hill') {
    const kingWon = w === 'a';
    st.out.push(kingWon ? bt.b : bt.a);
    if (kingWon) st.streak++;
    else { st.king = bt.b; st.streak = 1; entry.x = 1; }
    if (!st.best || st.streak > st.best.n) st.best = { id: st.king, n: st.streak };
  } else {
    const id = w === 'a' ? bt.a : bt.b;
    st.rounds[bt.r][bt.m].w = id;
    place(st.rounds, bt.r, bt.m, id);
    entry.r = bt.r; entry.m = bt.m;
  }
  st.log.push(entry);
  openNext(st, now, KING.PAUSE);
  return { ok: true, closed: entry, opened: st.bout, done: st.status === 'done' };
}
export const tallyOf = (rows) => {
  const t = { a: 0, b: 0 };
  for (const r of rows || []) if (r.pick === 'a' || r.pick === 'b') t[r.pick] += +r.n || 0;
  return t;
};
// закрыть по голосам: больше голосов — победа, поровну — царь остаётся (в сетке — верхний в паре)
export function closeByVotes(st, tally, by, now) {
  const va = +(tally && tally.a) || 0, vb = +(tally && tally.b) || 0;
  return decide(st, vb > va ? 'b' : 'a', by, { va, vb }, now);
}
// таймер: срок вышел — бой закрывается по голосам. Никто не проголосовал — таймер останавливается, ждём ведущего
export function settle(st, tally, now) {
  const bt = st.bout;
  if (st.status !== 'live' || !bt || !bt.ends || now < bt.ends) return { same: true };
  if (!((+tally.a || 0) + (+tally.b || 0))) { bt.ends = 0; bt.idle = 1; return { ok: true, idle: true }; }
  return closeByVotes(st, tally, 'timer', now);
}
export const timerDue = (st, now) => !!(st && st.status === 'live' && st.bout && st.bout.ends && now >= st.bout.ends);
export function undoLast(st, now) {
  const u = st.undo;
  if (!u) return { err: [409, 'Отменять нечего.'] };
  for (const k of UNDO) st[k] = u[k];
  st.log = st.log.slice(0, u.logN);
  st.undo = null;
  if (st.bout) { st.bout.opens = now; st.bout.ends = st.mode === 'vote' && st.timer ? now + st.timer * 1000 : 0; delete st.bout.idle; }
  return { ok: true, reopened: st.bout };
}
// досрочно закончить «Царя горы»: царь на горе — последний царь, претендент возвращается в начало очереди
export function finishEarly(st, now) {
  if (st.fmt !== 'hill' || st.status !== 'live') return { err: [409, 'Закончить раньше можно только «Царя горы».'] };
  if (!st.log.length) return { err: [409, 'Сначала хотя бы один бой.'] };
  st.undo = snapshot(st);
  if (st.bout) st.queue.unshift(st.bout.b);
  finish(st, now);
  return { ok: true, done: true };
}
export function addPeople(st, list, imgs) {
  if (st.status === 'done') return { err: [409, 'Турнир уже закончился.'] };
  if (st.fmt === 'bracket' && st.status !== 'ready') return { err: [409, 'В сетку добавлять можно только до начала.'] };
  const max = st.fmt === 'bracket' ? st.size : KING.HILL_MAX;
  const have = new Set(st.p.map((x) => x.n.toLowerCase()));
  const add = cleanPeople(list, max).filter((x) => !have.has(x.n.toLowerCase())).slice(0, Math.max(0, max - st.p.length));
  if (!add.length) return { err: [400, st.p.length >= max ? `Больше ${max} участников нельзя.` : 'Это уже есть.'] };
  for (const x of add) {
    const id = 'p' + (st.pid++).toString(36);
    st.p.push({ id, n: x.n, img: x.data && !imgs ? '' : x.img });
    if (x.data && imgs) imgs.push({ id, data: x.data });
    if (st.status === 'live') st.queue.push(id);
  }
  st.pv++;
  st.undo = null;
  return { ok: true, added: add.length };
}
export function removePerson(st, id) {
  const i = st.p.findIndex((x) => x.id === id);
  if (i < 0) return { err: [404, 'Такого участника нет.'] };
  if (st.status === 'live') {
    const q = st.fmt === 'hill' ? st.queue.indexOf(id) : -1;
    if (q < 0) return { err: [409, 'Убрать можно только тех, кто ещё ждёт в очереди.'] };
    st.queue.splice(q, 1);
  } else if (st.status !== 'ready') return { err: [409, 'Турнир уже закончился.'] };
  st.p.splice(i, 1);
  st.pv++;
  st.undo = null;
  return { ok: true };
}
export function setRules(st, b, now) {
  if (st.status === 'done') return { err: [409, 'Турнир уже закончился.'] };
  if (b.mode === 'host' || b.mode === 'vote') st.mode = b.mode;
  if (b.timer !== undefined) { if (!KING.TIMERS.includes(+b.timer)) return { err: [400, 'Такого таймера нет.'] }; st.timer = +b.timer; }
  if (st.status === 'ready') {
    if (b.seed === 'order' || b.seed === 'random') st.seed = b.seed;
    if (st.fmt === 'bracket' && KING.SIZES.includes(+b.size)) st.size = +b.size;
  }
  const bt = st.bout;
  if (bt && (b.mode !== undefined || b.timer !== undefined)) {
    bt.ends = st.mode === 'vote' && st.timer ? Math.max(now, bt.opens) + st.timer * 1000 : 0;
    delete bt.idle;
  }
  return { ok: true };
}
// что видят страницы: без снимка для «Отменить»; участников — только если их список поменялся (pv)
export function publicState(st, withPeople) {
  const { undo, pid, ...rest } = st;
  const out = { ...rest, canUndo: !!undo };
  if (!withPeople) delete out.p;
  return out;
}
// строка для списков и главной: без разбора снимка
export function summary(st) {
  const by = new Map(st.p.map((x) => [x.id, x.n]));
  const king = st.fmt === 'hill' ? st.champ || st.king : st.champ;
  return {
    status: st.status, bout: st.bout ? st.bout.n : 0, people: st.p.length,
    king: (king && by.get(king)) || null, streak: st.fmt === 'hill' ? st.streak : 0,
    best: st.best ? by.get(st.best.id) || null : null, best_n: st.best ? st.best.n : 0, bouts: st.log.length,
  };
}

// ---------- таблицы ----------
const ready = new WeakSet();
export async function ensureKing(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS king_rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, fmt TEXT NOT NULL, status TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1, bout INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, people INTEGER NOT NULL DEFAULT 0, king TEXT, streak INTEGER NOT NULL DEFAULT 0, best TEXT, best_n INTEGER NOT NULL DEFAULT 0, bouts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, done_at INTEGER)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS king_rooms_owner ON king_rooms(owner_id, created_at)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS king_imgs (room_id TEXT NOT NULL, pid TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (room_id, pid))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS king_votes (room_id TEXT NOT NULL, bout INTEGER NOT NULL, user_id TEXT NOT NULL, pick TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (room_id, bout, user_id))'),
  ]);
  ready.add(env.DB);
}
const ROW = 'SELECT r.id, r.owner_id, r.title, r.fmt, r.status, r.ver, r.state, r.created_at, u.username AS owner_name, u.banned AS owner_banned FROM king_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?';
const TALLY = 'SELECT pick, COUNT(*) AS n FROM king_votes WHERE room_id = ?1 AND bout = ?2 GROUP BY pick';
const mirror = (st) => { const s = summary(st); return [s.status, s.bout, s.people, s.king, s.streak, s.best, s.best_n, s.bouts]; };
// изменить снимок: fn(st, row) меняет st на месте и возвращает { err } | { same } | что угодно ещё (уйдёт в ответ).
// Запись проходит, только если ver тот же, что при чтении; иначе — ещё раз с новым снимком
export async function tx(env, code, fn, now = Date.now()) {
  for (let i = 0; i < 4; i++) {
    const row = await env.DB.prepare(ROW).bind(code).first();
    if (!row || row.owner_banned) return { err: [404, 'Такого турнира нет.'] };
    const st = parse(row.state);
    if (!st) return { err: [500, 'Турнир испорчен.'] };
    const r = (await fn(st, row)) || {};
    if (r.err || r.same) return { ...r, row, st };
    const res = await env.DB.prepare('UPDATE king_rooms SET state = ?, status = ?, bout = ?, people = ?, king = ?, streak = ?, best = ?, best_n = ?, bouts = ?, title = ?, updated_at = ?, done_at = ?, ver = ver + 1 WHERE id = ? AND ver = ?')
      .bind(JSON.stringify(st), ...mirror(st), r.title || row.title, now, st.status === 'done' ? st.doneAt || now : null, code, row.ver).run();
    if (res.meta && res.meta.changes) return { ...r, row: { ...row, ver: row.ver + 1, title: r.title || row.title }, st, wrote: true };
  }
  return { err: [409, 'Турнир сейчас меняют, попробуй ещё раз.'] };
}

// ---------- адреса ----------
export function makeKingRoutes(h) {
  const { json, fail, readBody } = h;
  // смотреть турнир можно без входа: страница зрителя и вид для стрима
  if (h.publicRoutes) h.publicRoutes.add('GET /king/room');
  const slow = (key, max, win) => (h.burst ? h.burst(key, max, win) : 0);
  const busy = () => fail(429, 'Слишком часто. Подожди немного.');
  const hook = async (env, ev) => { if (h.onBout) { try { await h.onBout(env, ev); } catch (e) { console.error('king hook', e && e.message); } } };
  const poke = async (env, code) => { if (h.poke) { try { await h.poke(env, code); } catch (e) {} } };
  // бой открылся или закрылся: прогнозы (h.onBout) и комната (h.poke), если их подключили
  async function after(env, code, row, r) {
    const by = new Map(r.st.p.map((x) => [x.id, x]));
    const who = (id) => (id && by.get(id) ? { id, n: by.get(id).n } : null);
    if (r.closed) await hook(env, { type: 'close', code, owner: row.owner_id, n: r.closed.n, a: who(r.closed.a), b: who(r.closed.b), w: r.closed.w, by: r.closed.by });
    if (r.reopened) await hook(env, { type: 'reopen', code, owner: row.owner_id, n: r.reopened.n });
    if (r.opened) await hook(env, { type: 'open', code, owner: row.owner_id, n: r.opened.n, a: who(r.opened.a), b: who(r.opened.b), opens: r.opened.opens, ends: r.opened.ends });
    await poke(env, code);
  }
  // турнир доведён до конца: опыт ведущему (один раз на турнир, правило king_host в levels.js)
  async function hostXp(env, request, me, row, st) {
    if (st.status !== 'done' || st.p.length < KING.HOST_MIN || st.log.length < 2 || !h.lvGive) return;
    try { await h.lvGive(env, request, me, row.owner_id, [{ kind: 'king_host', ref: row.id }]); } catch (e) { console.error('king xp', e && e.message); }
  }
  // таймер вышел: закрывает тот запрос, который первым это заметил (ведущего или зрителя)
  async function settleDue(env, request, me, code, now) {
    const r = await tx(env, code, async (st) => {
      if (!timerDue(st, now)) return { same: true };
      const t = await env.DB.prepare(TALLY).bind(code, st.bout.n).all();
      return settle(st, tallyOf(t.results), now);
    }, now);
    if (r.wrote) { await after(env, code, r.row, r); if (r.done) await hostXp(env, request, me, r.row, r.st); }
  }
  // ответ страницам: снимок, голоса текущего боя, свой голос. conditional — с ETag: без перемен 304 без тела
  async function answer(env, request, me, code, pv, conditional) {
    const now = Date.now();
    const read = async () => {
      const [a, b] = await env.DB.batch([
        env.DB.prepare(ROW).bind(code),
        env.DB.prepare('SELECT pick, COUNT(*) AS n, SUM(CASE WHEN user_id = ?2 THEN 1 ELSE 0 END) AS me FROM king_votes WHERE room_id = ?1 AND bout = (SELECT bout FROM king_rooms WHERE id = ?1) GROUP BY pick').bind(code, me ? me.id : ''),
      ]);
      return { row: (a.results || [])[0], votes: b.results || [] };
    };
    let { row, votes } = await read();
    if (!row || row.owner_banned) return fail(404, 'Такого турнира нет.');
    let st = parse(row.state);
    if (timerDue(st, now)) { await settleDue(env, request, me, code, now); ({ row, votes } = await read()); st = parse(row && row.state); if (!row || !st) return fail(404, 'Такого турнира нет.'); }
    const mine = (votes.find((v) => +v.me > 0) || {}).pick || null;
    const out = {
      room: { id: row.id, title: row.title, fmt: row.fmt, status: row.status, ver: row.ver, own: !!me && me.id === row.owner_id, owner: row.owner_name || '', created: row.created_at },
      state: publicState(st, String(pv) !== String(st.pv)), tally: tallyOf(votes), mine, now,
    };
    if (!conditional) return json(out);
    const tag = '"' + (await h.sha256(JSON.stringify({ ...out, now: 0 }))).slice(0, 32) + '"';
    const seen = (request.headers.get('if-none-match') || '').split(',').map((x) => x.trim().replace(/^W\//, ''));
    if (seen.includes(tag)) return new Response(null, { status: 304, headers: { etag: tag, 'cache-control': 'no-store' } });
    const res = json(out);
    res.headers.set('etag', tag);
    return res;
  }
  const codeOf = (v) => (CODE_RE.test(String(v || '')) ? String(v) : '');

  return {
    // новый турнир: { title, fmt, mode, timer, size, seed, p: [{ n, img }], start }. start: false — «Создать и начать позже»:
    // турнир ждёт в статусе ready, ведущий правит список (add, remove) и начинает сам (act start)
    async 'POST /king'({ env, request, me }) {
      if (slow('kingnew:' + me.id, 20, 600e3)) return busy();
      await ensureKing(env);
      const b = await readBody(request);
      const cfg = cleanConfig(b);
      if (cfg.err) return fail(400, cfg.err);
      const now = Date.now();
      const imgs = [];
      const st = newState(cfg, imgs);
      if (b.start === true) startState(st, now);
      const old = await env.DB.prepare('SELECT id FROM king_rooms WHERE owner_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?').bind(me.id, KING.ROOMS - 1).all();
      if ((old.results || []).length) await ensureChat(env); // чаты старых турниров уходят вместе с ними
      const drop = (old.results || []).flatMap((x) => [chatDrop(env, 'king', x.id), env.DB.prepare('DELETE FROM king_votes WHERE room_id = ?').bind(x.id), env.DB.prepare('DELETE FROM king_imgs WHERE room_id = ?').bind(x.id), env.DB.prepare('DELETE FROM king_rooms WHERE id = ?').bind(x.id)]);
      const imgSql = (c) => imgs.map((x) => env.DB.prepare('INSERT OR REPLACE INTO king_imgs (room_id, pid, data) VALUES (?, ?, ?)').bind(c, x.id, x.data));
      const m = mirror(st);
      let code = '';
      // код случайный (62^12): совпадение почти невозможно, но и тогда — просто следующий
      for (let i = 0; i < 3 && !code; i++) {
        const c = roomCode();
        try {
          await env.DB.batch([...(i ? [] : drop), env.DB.prepare('INSERT INTO king_rooms (id, owner_id, title, fmt, status, ver, bout, state, people, king, streak, best, best_n, bouts, created_at, updated_at, done_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)')
            .bind(c, me.id, cfg.title, cfg.fmt, m[0], m[1], JSON.stringify(st), ...m.slice(2), now, now), ...imgSql(c)]);
          code = c;
        } catch (e) { if (i === 2) throw e; }
      }
      if (st.bout) await after(env, code, { owner_id: me.id }, { st, opened: st.bout });
      return answer(env, request, me, code, null, false);
    },
    // снимок турнира: ?c=код&pv=версия списка участников (если та же — без списка). Открыт без входа
    async 'GET /king/room'({ env, request }) {
      const sp = new URL(request.url).searchParams;
      const code = codeOf(sp.get('c'));
      if (!code) return fail(404, 'Такого турнира нет.');
      if (slow('kingget:' + (h.clientIp ? h.clientIp(request) : ''), 1500, 60e3)) return busy();
      await ensureKing(env);
      let me = null;
      try { me = h.currentUser ? await h.currentUser(env, request) : null; } catch (e) {}
      if (me && me.banned) me = null;
      return answer(env, request, me, code, sp.get('pv'), true);
    },
    // пульт ведущего: { c, act, ... } — start, pick { n, w }, close { n }, rules { mode, timer, seed, size }, add { p }, remove { id },
    // undo, finish, title { title }
    async 'POST /king/act'({ env, request, me }) {
      if (slow('kingact:' + me.id, 240, 60e3)) return busy();
      await ensureKing(env);
      const b = await readBody(request);
      const code = codeOf(b.c);
      if (!code) return fail(404, 'Такого турнира нет.');
      const now = Date.now();
      const imgs = []; // свои картинки добавленных участников (снимок может переписываться заново — тогда и список)
      const r = await tx(env, code, async (st, row) => {
        imgs.length = 0;
        if (row.owner_id !== me.id) return { err: [403, 'Это может только ведущий.'] };
        const n = Math.floor(+b.n || 0);
        const tally = async () => (st.bout ? tallyOf((await env.DB.prepare(TALLY).bind(code, st.bout.n).all()).results) : { a: 0, b: 0 });
        switch (b.act) {
          case 'start': return startState(st, now);
          case 'pick': {
            if (!st.bout || st.bout.n !== n) return { err: [409, 'Этот бой уже закрыт.'] };
            const t = await tally();
            return decide(st, b.w, 'host', { va: t.a, vb: t.b }, now);
          }
          case 'close': {
            if (!st.bout || st.bout.n !== n) return { err: [409, 'Этот бой уже закрыт.'] };
            return closeByVotes(st, await tally(), 'vote', now);
          }
          case 'rules': return setRules(st, b, now);
          case 'add': return addPeople(st, b.p, imgs);
          case 'remove': return removePerson(st, String(b.id || ''));
          case 'undo': return undoLast(st, now);
          case 'finish': return finishEarly(st, now);
          case 'title': { const t = clean(b.title, KING.TITLE); return t ? { ok: true, title: t } : { err: [400, 'Нужно название.'] }; }
          default: return { err: [400, 'Нет такого действия.'] };
        }
      }, now);
      if (r.err) return fail(...r.err);
      if (r.wrote) {
        // отменили бой: голоса за бои, которых больше нет, не должны достаться новым
        if (b.act === 'undo') await env.DB.prepare('DELETE FROM king_votes WHERE room_id = ? AND bout >= ?').bind(code, r.st.next).run();
        if (imgs.length) await env.DB.batch(imgs.map((x) => env.DB.prepare('INSERT OR REPLACE INTO king_imgs (room_id, pid, data) VALUES (?, ?, ?)').bind(code, x.id, x.data)));
        if (b.act === 'remove') await env.DB.prepare('DELETE FROM king_imgs WHERE room_id = ? AND pid = ?').bind(code, String(b.id || '')).run();
        await after(env, code, r.row, r);
        if (r.done) await hostXp(env, request, me, r.row, r.st);
      }
      return answer(env, request, me, code, null, false);
    },
    // голос: { c, n — номер боя, pick: 'a' | 'b' }. Передумать можно, пока бой открыт
    async 'POST /king/vote'({ env, request, me }) {
      if (slow('kingvote:' + me.id, 90, 60e3)) return busy();
      await ensureKing(env);
      const b = await readBody(request);
      const code = codeOf(b.c), n = Math.floor(+b.n || 0), pick = b.pick === 'b' ? 'b' : b.pick === 'a' ? 'a' : '';
      if (!code) return fail(404, 'Такого турнира нет.');
      if (!pick) return fail(400, 'За кого голос?');
      const row = await env.DB.prepare('SELECT owner_id, state FROM king_rooms WHERE id = ?').bind(code).first();
      const st = row && parse(row.state);
      if (!st) return fail(404, 'Такого турнира нет.');
      const now = Date.now(), bt = st.bout;
      if (st.status !== 'live' || !bt || bt.n !== n) return fail(409, 'Этот бой уже закрыт.');
      if (st.mode !== 'vote') return fail(409, 'Этот бой решает ведущий.');
      if (now < bt.opens - 1000) return fail(409, 'Голосование ещё не началось.');
      if (bt.ends && now > bt.ends + 1500) return fail(409, 'Время вышло.');
      await env.DB.prepare('INSERT INTO king_votes (room_id, bout, user_id, pick, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(room_id, bout, user_id) DO UPDATE SET pick = excluded.pick, at = excluded.at').bind(code, n, me.id, pick, now).run();
      // голосующим — понемногу (правило king_vote: дневной лимит и не больше 5 в день у одного ведущего); себе за свой турнир — нет
      if (h.lvGive && me.id !== row.owner_id) { try { await h.lvGive(env, request, me, me.id, [{ kind: 'king_vote', ref: `${code}:${n}`, peer: row.owner_id }]); } catch (e) {} }
      await poke(env, code);
      return answer(env, request, me, code, b.pv, false);
    },
    // своя картинка участника (обложка из «Мнения»): ?c=код&p=id. Открыта без входа, как и турнир; у участника она не меняется — кэш надолго
    async 'GET /king/img'({ env, request }) {
      const sp = new URL(request.url).searchParams;
      const code = codeOf(sp.get('c')), pid = /^p[0-9a-z]{1,8}$/.test(sp.get('p') || '') ? sp.get('p') : '';
      const none = (status) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
      if (!code || !pid) return none(404);
      if (slow('kingimg:' + (h.clientIp ? h.clientIp(request) : ''), 3000, 60e3)) return none(429);
      await ensureKing(env);
      const row = await env.DB.prepare('SELECT data FROM king_imgs WHERE room_id = ? AND pid = ?').bind(code, pid).first();
      const m = row && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(row.data);
      if (!m) return none(404);
      const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      return new Response(bin, { headers: { 'content-type': m[1], 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
    },
    // свои турниры: история; ?brief=1 — для карточки на главной (сколько всего и последний)
    async 'GET /king/mine'({ env, request, me }) {
      await ensureKing(env);
      const { results } = await env.DB.prepare('SELECT id, title, fmt, status, people, king, streak, best, best_n, bouts, created_at, updated_at, done_at FROM king_rooms WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?').bind(me.id, KING.ROOMS).all();
      const rooms = (results || []).map((x) => ({ id: x.id, title: x.title, fmt: x.fmt, status: x.status, people: x.people, king: x.king, streak: x.streak, best: x.best, bestN: x.best_n, bouts: x.bouts, created: x.created_at, updated: x.updated_at, done: x.done_at }));
      if (new URL(request.url).searchParams.get('brief')) {
        const last = rooms.slice().sort((a, b) => (b.status === 'live') - (a.status === 'live') || b.updated - a.updated)[0] || null;
        return json({ n: rooms.length, done: rooms.filter((x) => x.status === 'done').length, last });
      }
      return json({ rooms, now: Date.now() });
    },
    async 'POST /king/delete'({ env, request, me }) {
      await ensureKing(env);
      const code = codeOf((await readBody(request)).c);
      const row = code && (await env.DB.prepare('SELECT owner_id FROM king_rooms WHERE id = ?').bind(code).first());
      if (!row || row.owner_id !== me.id) return fail(404, 'Такого турнира нет.');
      await ensureChat(env);
      await env.DB.batch([chatDrop(env, 'king', code), env.DB.prepare('DELETE FROM king_votes WHERE room_id = ?').bind(code), env.DB.prepare('DELETE FROM king_imgs WHERE room_id = ?').bind(code), env.DB.prepare('DELETE FROM king_rooms WHERE id = ?').bind(code)]);
      await poke(env, code);
      await chatGone(env, 'king', code);
      return json({ ok: true });
    },
  };
}
