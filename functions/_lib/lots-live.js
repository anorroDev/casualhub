// Казуал Хаб: колесо лотов на сервере — снимок для зрителей, прокрутка и её итог.
// Общее для API сайта (functions/api) и Worker'а casualhub-rt (папка rt/), в котором живёт комната лотов (Durable Object):
// комната доводит прокрутки по будильникам и рассылает снимок по WebSocket.
// Главная копия снимка — lot_rooms.live в D1. И API, и комната меняют её только через liveTx и settledLive:
// запись проходит, лишь если снимок с момента чтения никто не поменял, поэтому они не затирают друг друга.
// Папка _lib не становится адресом сайта.
import { clip } from './shelf.js';

export const LOT_NAME = 60, MAX_LOTS = 300;
export const STICKER_RE = /^hub\/(?!.*\.\.)[\w\-\/.]{1,100}\.(png|gif|webp|webm|jpe?g)$/; // путь картинки из каталога колеса
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const lotTrack = (v) => (typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v) ? v : '');
export function cleanLive(b) {
  const finite = (v) => (Number.isFinite(+v) ? +v : 0);
  const spin = b && b.spin && typeof b.spin === 'object' ? { from: finite(b.spin.from), to: finite(b.spin.to), ms: Math.max(0, Math.min(120000, finite(b.spin.ms))), at: finite(b.spin.at) } : null;
  return {
    segs: (Array.isArray(b && b.segs) ? b.segs : []).slice(0, MAX_LOTS).map((x) => ({ n: clip(x && x.n, LOT_NAME), p: Math.max(0, Math.min(1, finite(x && x.p))), c: HEX_COLOR.test(String(x && x.c)) ? x.c : '#64748B', t: HEX_COLOR.test(String(x && x.t)) ? x.t : '#FFFFFF', ...(/^[0-9a-f]{16}$/.test(String(x && x.l)) ? { l: x.l } : {}) })),
    rot: finite(b && b.rot), spin, pick: clip(b && b.pick, LOT_NAME), hub: Math.max(10, Math.min(60, finite(b && b.hub) || 24)),
    hubImg: b && STICKER_RE.test(String(b.hubImg)) ? b.hubImg : '',
    hubOwn: b && /^g[a-z0-9]{1,30}$/.test(String(b.hubOwn)) ? b.hubOwn : '',
    seen: Math.max(0, Math.min(MAX_LOTS, Math.round(finite(b && b.seen)))),
    ...(Array.isArray(b && b.ids) ? { ids: b.ids.slice(0, MAX_LOTS).map(String).filter((x) => /^[0-9a-f]{16}$/.test(x)) } : {}),
    // музыка ведущего: трек, позиция в секундах на момент at (часы сервера), пауза и автопереключение
    music: (() => { const m = (b && b.music) || {}; return { bg: lotTrack(m.bg), win: lotTrack(m.win), cur: lotTrack(m.cur), pos: Math.max(0, Math.min(36000, finite(m.pos))), at: finite(m.at), pause: m.pause === true, auto: m.auto !== false }; })(),
    pics: !(b && b.pics === false),
    status: clip(b && b.status, 140),
    out: (Array.isArray(b && b.out) ? b.out : []).slice(0, MAX_LOTS).map((x) => clip(x, LOT_NAME)),
    // что выпадало по очереди: каждый итог прокрутки (вылет или победа в режиме «Один победитель»)
    hist: (Array.isArray(b && b.hist) ? b.hist : []).slice(-MAX_LOTS).map((x) => clip(x, LOT_NAME)),
    winner: b && b.winner && b.winner.n ? { n: clip(b.winner.n, LOT_NAME), sum: clip(b.winner.sum, 40), at: finite(b.winner.at) } : null,
    keep: (Array.isArray(b && b.keep) ? b.keep : []).slice(0, MAX_LOTS).map((x) => clip(x, LOT_NAME)),
    kick: (Array.isArray(b && b.kick) ? b.kick : []).slice(0, MAX_LOTS).map((x) => clip(x, LOT_NAME)),
  };
}

// что ведущий меняет своим снимком (PUT /lots/:code/live); остальное в снимке — работа сервера
export const LIVE_OWNER = ['hub', 'hubImg', 'hubOwn', 'seen', 'ids', 'music', 'pics'];
// отсчёт перед стартом; сколько мигает выпавший сектор, прежде чем вылететь; пауза перед следующей прокруткой «до победителя»
export const LIVE_LEAD = 2600, LIVE_OUT_MS = 1100, LIVE_NEXT_MS = 900;
const TAU = Math.PI * 2;
const mod = (a, b) => ((a % b) + b) % b;
// честное число от 0 до n − 1: без перекоса к младшим числам, который даёт простое «случайное % n»
export function uniform(n) {
  const lim = Math.floor(2 ** 32 / n) * n, u = new Uint32Array(1);
  do crypto.getRandomValues(u); while (u[0] >= lim);
  return u[0] % n;
}
const rand01 = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
// те же цвета секторов, что рисует страница сбора: цвет закреплён за местом лота в сборе
const LOT_PALETTE = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#F97316', '#06B6D4', '#E4553F', '#84CC16', '#64748B'];
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const inkOn = (c) => { const L = lum(c); return (L + 0.05) / (lum('#14161C') + 0.05) >= 1.05 / (L + 0.05) ? '#14161C' : '#FFFFFF'; };
const lowName = (s) => String(s || '').toLowerCase();
const inNames = (arr, name) => Array.isArray(arr) && arr.some((x) => lowName(x) === lowName(name));
// лоты сбора в том порядке, в каком их видит страница (по времени добавления, без лотов удалённых аккаунтов)
export async function liveLots(env, code) {
  const { results } = await env.DB.prepare('SELECT l.id, l.name FROM lots l JOIN users u ON u.id = l.user_id WHERE l.room_id = ? ORDER BY l.created_at LIMIT ?').bind(code, MAX_LOTS).all();
  return results;
}
// кто вылетел — id лотов (outIds): когда повторы разрешены, два «Hades» — разные лоты, и вылетает только один из них.
// out с именами остаётся для показа. В снимках, где outIds ещё нет, каждое имя из out выбивает один лот, а не все с ним
export function goneIds(lots, live) {
  if (Array.isArray(live && live.outIds)) return new Set(live.outIds);
  const gone = new Set();
  for (const x of Array.isArray(live && live.out) ? live.out : []) {
    const l = lots.find((y) => !gone.has(y.id) && lowName(y.name) === lowName(x));
    if (l) gone.add(l.id);
  }
  return gone;
}
const lotsAlive = (lots, live) => { const gone = goneIds(lots, live); return lots.filter((l) => !gone.has(l.id)); };
const lotSegs = (lots, alive) => alive.map((l) => { const c = LOT_PALETTE[Math.max(0, lots.indexOf(l)) % LOT_PALETTE.length]; return { n: l.name, p: 1 / alive.length, c, t: inkOn(c), l: l.id }; });
// из кого выбирает прокрутка (номера в alive). «На выбывание»: сначала те, кого админ отметил на вылет, иначе все,
// кроме оставленных. «Один победитель»: сначала оставленные, иначе все, кроме отмеченных на вылет. Иначе все
function spinPool(alive, mode, keep, kick) {
  const all = alive.map((_, i) => i);
  const marked = all.filter((i) => inNames(mode === 'one' ? keep : kick, alive[i].name));
  const free = all.filter((i) => !inNames(mode === 'one' ? kick : keep, alive[i].name));
  return marked.length ? marked : free.length ? free : all;
}
// идёт прокрутка или её итог ещё не записан
export const liveBusy = (live, now) => !!(live && (live.res || (live.spin && now < +live.spin.at + +live.spin.ms)));

// новая прокрутка: цель выбирает сервер, всем уходит одна и та же прокрутка (угол и время старта по часам сервера).
// auto — «до победителя»: после вылета следующая прокрутка начнётся сама. Возвращает { live } или { err: [статус, текст] }
export function spinLive(live, lots, mode, dur, now, auto) {
  mode = mode === 'one' ? 'one' : 'out';
  dur = Math.max(1, Math.min(30, Math.round(+dur) || 8));
  if (liveBusy(live, now)) return { err: [409, 'Колесо уже крутится.'] };
  if (mode === 'out' && live.winner) return { err: [409, 'Победитель уже есть. Жми «Вернуть всех», чтобы крутить заново.'] };
  const alive = lotsAlive(lots, live);
  if (alive.length < 2) return { err: [409, 'Чтобы крутить, на колесе нужно хотя бы два лота.'] };
  const pool = spinPool(alive, mode, live.keep, live.kick);
  const k = pool[uniform(pool.length)];
  // стрелка вверху: под ней окажется случайная точка выпавшего сектора, не у самого края.
  // Сектора равные, их границы — как у place() на странице сбора
  const start = k / alive.length * TAU, end = (k + 1) / alive.length * TAU;
  const a = start + (0.12 + 0.76 * rand01()) * (end - start);
  const from = mod(live.spin ? +live.spin.to || 0 : +live.rot || 0, TAU);
  const to = from + (3 + Math.round(dur * 0.6)) * TAU + mod(-Math.PI / 2 - a - from, TAU);
  // старт через LIVE_LEAD: кто спрашивает сервер раз в 2 секунды, успевает получить прокрутку до её начала
  const at = now + LIVE_LEAD, ms = dur * 1000;
  Object.assign(live, {
    segs: lotSegs(lots, alive), rot: +from.toFixed(4), spin: { from: +from.toFixed(4), to: +to.toFixed(4), ms, at }, pick: '', pickL: '',
    winner: mode === 'one' ? null : live.winner || null, status: 'Колесо крутится',
    seen: lots.length, ids: lots.map((l) => l.id), res: { n: alive[k].name, id: alive[k].id, mode, end: at + ms },
  });
  delete live.next;
  if (auto && mode === 'out') live.auto = { dur }; else delete live.auto;
  return { live };
}
// «Вернуть всех»: вылетевшие снова на колесе, победителя и истории нет. Настройку лотов админа (keep/kick) не трогает
export function resetLive(live, now) {
  if (liveBusy(live, now)) return { err: [409, 'Колесо крутится, подожди конца прокрутки.'] };
  Object.assign(live, { spin: null, pick: '', pickL: '', status: '', out: [], outIds: [], winner: null, hist: [] });
  delete live.res; delete live.auto; delete live.next;
  return { live };
}
// «до победителя» больше не крутить: текущая прокрутка доиграет, следующей не будет
export function stopAuto(live) {
  delete live.auto; delete live.next;
  return { live };
}

// когда снимку пора меняться по часам сервера (0 — ничего не ждёт): остановка прокрутки, вылет, следующая прокрутка
export function liveWake(live) {
  const r = live && live.res;
  if (r) return r.mode === 'one' || live.pick !== r.n ? +r.end : +r.end + LIVE_OUT_MS;
  return live && live.next ? +live.next : 0;
}
// довести снимок до момента now: итог прокрутки («Один победитель» — сразу после остановки; «На выбывание» — сектор
// мигает LIVE_OUT_MS, потом лот вылетает) и следующая прокрутка «до победителя». lots — лоты сбора.
// Возвращает true, если снимок поменялся
export function advanceLive(live, now, lots) {
  let changed = false;
  for (let step = 0; step < 4; step++) {
    const r = live.res;
    if (r && r.n && now >= +r.end) {
      const hist = Array.isArray(live.hist) ? live.hist : [];
      if (live.spin) live.rot = +live.spin.to || 0;
      // pickL — id выпавшего лота: страница подсвечивает именно его сектор, а не все с таким названием
      if (r.mode === 'one') {
        Object.assign(live, { pick: r.n, pickL: r.id || '', winner: { n: r.n, sum: '', at: +r.end }, status: `Победитель: ${r.n}`, hist: [...hist, r.n].slice(-MAX_LOTS) });
        delete live.res; delete live.auto; delete live.next;
        return true;
      }
      if (now < +r.end + LIVE_OUT_MS) {
        if (live.pick === r.n) return changed;
        Object.assign(live, { pick: r.n, pickL: r.id || '', status: `Вылетает: ${r.n}` });
        return true;
      }
      // вылетает ровно выпавший лот: по id, а у прокрутки, начатой до этой версии, — первый живой с таким именем
      const gone = goneIds(lots, live);
      const hit = r.id && lots.some((l) => l.id === r.id) ? r.id : (lots.find((l) => !gone.has(l.id) && lowName(l.name) === lowName(r.n)) || {}).id;
      if (hit) gone.add(hit);
      const out = [...(Array.isArray(live.out) ? live.out : []), r.n];
      const left = lots.filter((l) => !gone.has(l.id));
      const winner = left.length === 1 ? { n: left[0].name, sum: '', at: +r.end + LIVE_OUT_MS } : null;
      Object.assign(live, {
        segs: lotSegs(lots, left), spin: null, pick: '', pickL: '', out, outIds: [...gone], winner, hist: [...hist, r.n].slice(-MAX_LOTS),
        status: winner ? `Победитель: ${winner.n}` : `Вылетел: ${r.n}. Осталось ${left.length}`,
        seen: lots.length, ids: lots.map((l) => l.id),
      });
      delete live.res;
      if (live.auto && !winner && left.length >= 2) live.next = +r.end + LIVE_OUT_MS + LIVE_NEXT_MS;
      else { delete live.auto; delete live.next; }
      changed = true;
      continue;
    }
    if (!r && live.next && now >= +live.next) {
      // «до победителя»: следующая прокрутка — с тем же временем, что выбрал ведущий
      const dur = live.auto && live.auto.dur;
      if (!live.auto || spinLive(live, lots, 'out', dur, now, true).err) { delete live.auto; delete live.next; }
      return true;
    }
    return changed;
  }
  return changed;
}

const parseLive = (text) => { try { return text ? JSON.parse(text) : null; } catch (e) { return null; } };
// снимок колеса, доведённый до текущего момента. Записывает, только если с момента чтения снимок никто не поменял;
// иначе перечитывает (следующую прокрутку выбирает случай, поэтому отдавать свой незаписанный вариант нельзя).
// text — снимок, как он лежит в базе. Возвращает { live, wrote }
export async function settledLive(env, code, text) {
  for (let i = 0; i < 4; i++) {
    const live = parseLive(text), now = Date.now(), wake = liveWake(live);
    if (!live || !wake || now < wake) return { live, wrote: false };
    if (!advanceLive(live, now, await liveLots(env, code))) return { live, wrote: false };
    const w = await env.DB.prepare('UPDATE lot_rooms SET live = ? WHERE id = ? AND live IS ?').bind(JSON.stringify(live), code, text).run();
    if (w.meta.changes) return { live, wrote: true };
    const row = await env.DB.prepare('SELECT live FROM lot_rooms WHERE id = ?').bind(code).first();
    if (!row) return { live: null, wrote: false };
    text = row.live;
  }
  return { live: parseLive(text), wrote: false };
}
// изменить снимок: прочитать, довести до текущего момента, fn(live, room) меняет live, записать, если никто не успел раньше.
// fn возвращает { live } или { err: [статус, текст] }. Ответ: { live, room } | { err } | { big: true }
export async function liveTx(env, code, fn) {
  for (let i = 0; i < 4; i++) {
    const room = await env.DB.prepare('SELECT owner_id, live, ver FROM lot_rooms WHERE id = ?').bind(code).first();
    if (!room) return { err: [404, 'Такого сбора нет.'] };
    const live = parseLive(room.live) || cleanLive({}), now = Date.now(), wake = liveWake(live);
    if (wake && now >= wake) advanceLive(live, now, await liveLots(env, code));
    const r = await fn(live, room);
    if (r.err) return r;
    const data = JSON.stringify(r.live);
    if (data.length > 90000) return { big: true };
    const w = await env.DB.prepare('UPDATE lot_rooms SET live = ? WHERE id = ? AND live IS ?').bind(data, code, room.live).run();
    if (w.meta.changes) return { live: r.live, room };
  }
  return { err: [409, 'Колесо сейчас меняют, попробуй ещё раз.'] };
}
// снимок для клиента: без выпавшего лота (он виден из угла прокрутки, но готовым именем не отдаём),
// «Настройка лотов» (keep/kick) — только админу
export function liveView(live, admin) {
  if (!live) return null;
  const { res, keep, kick, ...rest } = live;
  return admin ? { ...rest, keep: keep || [], kick: kick || [] } : rest;
}
