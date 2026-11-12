// Казуал Хаб: Worker casualhub-rt — сайт вживую. Три комнаты (Durable Objects):
//   LotRoomDO — колесо лотов, одна на сбор (idFromName(код)), описание сразу ниже;
//   PresenceDO — присутствие, одна на весь сайт (idFromName('global')), описание у класса;
//   BackupDO — ночная копия базы в R2 (rt/backup.js), её будит cron раз в сутки (scheduled внизу).
// Из интернета он недоступен (workers_dev = false, маршрутов нет): к нему ходят только Pages Functions через привязку.
//   POST /poke — API сайта что-то записал в D1 (снимок, лоты, сбор): комната перечитывает, рассылает и заводит будильник
//   GET  /ws   — WebSocket зрителя; роль (viewer / host / admin) уже проверил маршрут /api/lots/:code/ws
// Снимок в lot_rooms.live — главная копия, комната держит только сокеты и будильник: она доводит прокрутку до вылета
// или победы и запускает следующую в режиме «до победителя», даже если вкладка ведущего закрыта.
//
// Протокол (JSON). Клиент → комната: hello {id}, spin {mode, dur, auto}, stop (выключить «до победителя»), reset,
// force {keep, kick} (только админ). Строка "ping" → "pong" без пробуждения комнаты.
// Комната → клиент: state {live, ver, now, re?} (при подключении, после каждой перемены и в ответ на hello с re = id;
// keep/kick — только админу),
// gone (сбор удалён), error {code, msg}
import { cleanLive, liveTx, settledLive, liveWake, liveLots, liveView, spinLive, resetLive, stopAuto } from '../functions/_lib/lots-live.js';
import { ONLINE_MS, GUEST_RE, onlineCount, friendsAndIncoming, friendIds, readAnnounce, touchUsers, touchGuests } from '../functions/_lib/presence.js';
import { levelsOn, currentSeason, onSeasonClose } from '../functions/_lib/levels.js';
import { mailOn, mailoutStep } from '../functions/_lib/mailout.js';
export { BackupDO } from './backup.js';

const ROLES = ['viewer', 'host', 'admin'];
const MAX_MSG = 2048, RATE_N = 10, RATE_MS = 1000; // не больше 10 сообщений в секунду с сокета, каждое до 2 КБ

export class LotRoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.code = '';
    this.rate = new Map(); // сокет → [начало окна, сколько сообщений]; после сна счётчики начинаются заново
    this.dead = new WeakSet(); // сокеты, которые уже закрыты
    this.sent = ''; // последний разосланный снимок: одинаковое повторно не шлём
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async room() {
    if (!this.code) this.code = (await this.ctx.storage.get('code')) || '';
    return this.code;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const code = request.headers.get('x-rt-code') || '';
    if (/^[A-Za-z0-9]{12}$/.test(code) && code !== this.code) { this.code = code; await this.ctx.storage.put('code', code); }
    if (!this.code) return new Response('no room', { status: 400 });
    if (url.pathname === '/ws') return this.connect(request);
    if (url.pathname === '/poke' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      if (b.what === 'gone') { await this.gone(); return new Response('ok'); }
      await this.sync(b.what !== 'live');
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }
  async connect(request) {
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 });
    const role = ROLES.includes(request.headers.get('x-rt-role')) ? request.headers.get('x-rt-role') : 'viewer';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, uid: request.headers.get('x-rt-uid') || '', ip: request.headers.get('x-rt-ip') || '' });
    const st = await this.load();
    if (!st) { server.send(JSON.stringify({ t: 'gone' })); server.close(4404, 'gone'); }
    else { server.send(this.stateText(st.live, st.ver, role === 'admin')); await this.schedule(st.live); }
    const proto = request.headers.get('x-rt-proto');
    return new Response(null, { status: 101, webSocket: client, headers: proto ? { 'sec-websocket-protocol': proto } : {} });
  }
  // снимок из D1, доведённый до текущего момента (итог прокрутки, следующая прокрутка)
  async load() {
    const row = await this.env.DB.prepare('SELECT live, ver FROM lot_rooms WHERE id = ?').bind(await this.room()).first();
    if (!row) return null;
    const { live } = await settledLive(this.env, this.code, row.live);
    return { live, ver: row.ver };
  }
  stateText(live, ver, admin, re) {
    return JSON.stringify({ t: 'state', live: liveView(live, admin), ver, now: Date.now(), ...(re !== undefined ? { re } : {}) });
  }
  // разослать снимок: зрителям и ведущему без keep/kick, админам — с ними
  broadcast(live, ver, force) {
    const sig = JSON.stringify([liveView(live, true), ver]);
    if (!force && sig === this.sent) return;
    this.sent = sig;
    const plain = this.stateText(live, ver, false), full = this.stateText(live, ver, true);
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, this.ctx.getTags(ws).includes('admin') ? full : plain);
    }
  }
  // будильник на ближайшую перемену по часам сервера; если ничего не ждёт — снять
  async schedule(live) {
    const at = liveWake(live);
    if (at) await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 5));
    else await this.ctx.storage.deleteAlarm();
  }
  async sync(force) {
    const st = await this.load();
    if (!st) return this.gone();
    this.broadcast(st.live, st.ver, force);
    await this.schedule(st.live);
  }
  async alarm() {
    if (!(await this.room())) return;
    await this.sync(false);
  }
  async gone() {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, JSON.stringify({ t: 'gone' }));
      this.drop(ws, 4404, 'gone');
    }
    await this.ctx.storage.deleteAlarm();
  }
  // сокет могли закрыть, пока его сообщения ещё стояли в очереди: в закрытый не пишем
  send(ws, text) {
    if (this.dead.has(ws)) return;
    try { ws.send(text); } catch (e) { this.dead.add(ws); }
  }
  error(ws, code, msg) {
    this.send(ws, JSON.stringify({ t: 'error', code, msg }));
  }
  drop(ws, code, why) {
    this.dead.add(ws);
    this.rate.delete(ws);
    try { ws.close(code, why); } catch (e) {}
  }
  async webSocketMessage(ws, msg) {
    if (this.dead.has(ws)) return;
    if (typeof msg !== 'string' || msg.length > MAX_MSG) { this.error(ws, 413, 'Слишком длинное сообщение.'); this.drop(ws, 1009, 'too big'); return; }
    const now = Date.now(), r = this.rate.get(ws) || [now, 0];
    if (now - r[0] > RATE_MS) { r[0] = now; r[1] = 0; }
    r[1]++;
    this.rate.set(ws, r);
    if (r[1] > RATE_N) { this.error(ws, 429, 'Слишком много сообщений.'); this.drop(ws, 1008, 'rate'); return; }
    let m = null;
    try { m = JSON.parse(msg); } catch (e) {}
    if (!m || typeof m.t !== 'string') return this.error(ws, 400, 'Непонятное сообщение.');
    const { role, uid, ip } = ws.deserializeAttachment() || {};
    const code = await this.room();
    if (m.t === 'hello') {
      const st = await this.load();
      if (!st) return this.gone();
      // re — номер hello: по времени ответа страница сверяет свои часы с часами сервера
      this.send(ws, this.stateText(st.live, st.ver, role === 'admin', Number.isInteger(m.id) ? m.id : undefined));
      return;
    }
    const control = role === 'host' || role === 'admin';
    let change = null, log = '';
    if (m.t === 'spin' && control) change = async (live) => spinLive(live, await liveLots(this.env, code), m.mode, m.dur, Date.now(), m.auto === true);
    else if (m.t === 'stop' && control) change = async (live) => stopAuto(live);
    else if (m.t === 'reset' && control) change = async (live) => resetLive(live, Date.now());
    else if (m.t === 'force' && role === 'admin') {
      // как PUT /lots/:code/live: по названиям — старые вкладки, по id лота — нынешний пульт
      const clean = cleanLive({ keep: m.keep, kick: m.kick, keepIds: m.keepIds, kickIds: m.kickIds });
      change = async (live) => {
        for (const k of ['keep', 'kick', 'keepIds', 'kickIds']) if (Array.isArray(m[k])) live[k] = clean[k];
        return { live };
      };
      log = `lots ${code}: keep ${clean.keep.length + clean.keepIds.length}, kick ${clean.kick.length + clean.kickIds.length} (rt)`;
    } else if (['spin', 'stop', 'reset', 'force'].includes(m.t)) return this.error(ws, 403, 'Недостаточно прав.');
    else return this.error(ws, 400, 'Непонятное сообщение.');
    const res = await liveTx(this.env, code, change);
    if (res.err) return this.error(ws, res.err[0], res.err[1]);
    if (res.big) return this.error(ws, 413, 'Слишком много лотов на колесе.');
    if (log) {
      try { await this.env.DB.prepare('INSERT INTO admin_log (at, user_id, ip, action, ok) VALUES (?, ?, ?, ?, 1)').bind(Date.now(), uid || '', ip || '', log.slice(0, 80)).run(); } catch (e) {}
    }
    this.broadcast(res.live, res.room.ver, false);
    await this.schedule(res.live);
  }
  async webSocketClose(ws, code) {
    this.drop(ws, code === 1005 || code === 1006 ? 1000 : code, 'bye');
  }
  async webSocketError(ws) {
    this.drop(ws, 1011, 'error');
  }
}

// ---------- присутствие вживую ----------
// PresenceDO — одна комната на весь сайт: каждая открытая вкладка держит с ней WebSocket. Сокет помечен «u:<id>»
// (аккаунт), «g:<id>» (гость) или «anon». Кто это, решил маршрут /api/presence/ws. Источник правды «в сети» — D1
// (users.last_seen и presence): раз в 45 секунд комната отмечает всех подключённых, поэтому счётчик «N на сайте»
// и «был(а) N мин назад» одинаковы и у страниц на сокете, и у тех, что ещё спрашивают POST /ping.
//   POST /poke {what}: announce — объявление поменялось; users {ids} — у людей поменялись друзья, заявки или «скрывать,
//   что в сети»; drop {ids} — сеансы закрыты, сокеты этих людей переподключаются; notify {to, n} — реакция или комментарий.
// Комната → клиент (JSON):
//   state {online, friends: [{id, at, on}], incoming, announce, window, now, authed?} — при подключении и когда у человека
//         поменялись друзья или заявки. Как ответ POST /ping, плюс on — друг сейчас на сайте с открытой вкладкой;
//   friend {id, on, at} — друг открыл первую вкладку или закрыл последнюю (тех, кто скрывает «в сети», не видно);
//   count {online} — сколько людей на сайте; announce {announce} — объявление (null — снято или истекло);
//   notify {kind: 'react' | 'comment', from: {id, username, handle}, rid?, emoji?, target?, text} — тебе ответили.
//   reconnect — переподключись (сеанс закрыли): страница подключается заново с тем токеном, что есть, или гостем.
// Клиент → комната: только строка "ping" (ответ "pong" без пробуждения комнаты), остальное не нужно.
const BEAT_MS = 45000, SOON_MS = 3000, CACHE_MS = 5000;
// на такте отметка «заходил» пишется, если прошлой больше BEAT_GAP: меньше такта, иначе каждая вторая пропускалась бы
const BEAT_GAP = BEAT_MS - 10e3;
const UID_RE = /^[0-9a-f]{24}$/;
const short = (v, n) => String(v == null ? '' : v).slice(0, n);
export class PresenceDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.dead = new WeakSet(); // закрытые сокеты, которые ещё могут попасться в списке
    this.rate = new Map();
    this.friends = new Map(); // id → id друзей; после сна читается заново
    this.cnt = { n: 0, at: 0 };
    this.ann = { v: null, at: 0 };
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  // живые сокеты: без закрытых и без отозванных (метка во вложении переживает сон комнаты)
  live(tag) { return (tag ? this.ctx.getWebSockets(tag) : this.ctx.getWebSockets()).filter((w) => !this.dead.has(w) && !(w.deserializeAttachment() || {}).revoked); }
  send(ws, text) {
    if (this.dead.has(ws)) return;
    try { ws.send(text); } catch (e) { this.dead.add(ws); }
  }
  drop(ws, code, why) {
    this.dead.add(ws);
    this.rate.delete(ws);
    try { ws.close(code, why); } catch (e) {}
  }
  // сеанс закрыт: страница переподключается сама (уже как гость, если токен больше не действует), а этому сокету
  // комната больше ничего не шлёт, даже если закрытие до браузера не дошло
  revoke(ws) {
    this.send(ws, JSON.stringify({ t: 'reconnect' }));
    try { ws.serializeAttachment({ ...(ws.deserializeAttachment() || {}), revoked: true }); } catch (e) {}
    this.drop(ws, 4401, 'session');
  }
  broadcast(text) { for (const w of this.live()) this.send(w, text); }
  isOn(id) { return this.live('u:' + id).some((w) => !(w.deserializeAttachment() || {}).hide); }
  async online(now) {
    if (now - this.cnt.at > CACHE_MS) this.cnt = { n: await onlineCount(this.env, now), at: now };
    return this.cnt.n;
  }
  async announce(now) {
    if (now - this.ann.at > CACHE_MS) this.ann = { v: await readAnnounce(this.env, now), at: now };
    return this.ann.v;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') return this.connect(request);
    if (url.pathname === '/poke' && request.method === 'POST') { await this.poke(await request.json().catch(() => ({}))); return new Response('ok'); }
    return new Response('not found', { status: 404 });
  }
  async connect(request) {
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 });
    const h = (k) => request.headers.get(k) || '';
    const uid = UID_RE.test(h('x-rt-uid')) ? h('x-rt-uid') : '';
    const guest = !uid && GUEST_RE.test(h('x-rt-guest')) ? h('x-rt-guest') : '';
    const hide = !!uid && h('x-rt-hide') === '1', bearer = h('x-rt-bearer') === '1';
    const first = !!uid && !this.live('u:' + uid).length;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [uid ? 'u:' + uid : guest ? 'g:' + guest : 'anon']);
    server.serializeAttachment({ uid, guest, hide, bearer });
    const now = Date.now();
    try {
      if (uid) await touchUsers(this.env, [uid], now);
      else if (guest) await touchGuests(this.env, [guest], now);
      if (uid || guest) this.cnt.at = 0; // счётчик пересчитать: пришёл кто-то новый
      this.send(server, JSON.stringify(await this.stateFor(uid, bearer)));
      if (first && !hide) await this.tellFriends(uid, true, now);
    } catch (e) { console.error('presence connect', e && e.message); }
    await this.soon();
    const proto = h('x-rt-proto');
    return new Response(null, { status: 101, webSocket: client, headers: proto ? { 'sec-websocket-protocol': proto } : {} });
  }
  // то же, что отвечает POST /ping, плюс on у друзей, которые сейчас на сокете
  async stateFor(uid, bearer) {
    const now = Date.now();
    const st = { t: 'state', online: await this.online(now), friends: [], incoming: 0, announce: await this.announce(now), window: ONLINE_MS, now };
    if (bearer) st.authed = !!uid;
    if (uid) {
      const q = await friendsAndIncoming(this.env, uid, now);
      st.online = Math.max(st.online, 1);
      st.friends = q.friends.map((f) => ({ ...f, on: this.isOn(f.id) }));
      st.incoming = q.incoming;
    }
    return st;
  }
  // друг открыл первую вкладку или закрыл последнюю: сказать его друзьям, у кого сайт открыт
  async tellFriends(uid, on, at) {
    let ids = this.friends.get(uid);
    if (!ids) {
      ids = await friendIds(this.env, uid);
      if (this.friends.size > 5000) this.friends.clear();
      this.friends.set(uid, ids);
    }
    const text = JSON.stringify({ t: 'friend', id: uid, on, at });
    for (const f of ids) for (const w of this.live('u:' + f)) this.send(w, text);
  }
  // пересчитать счётчик чуть позже: кто-то пришёл или ушёл, а пачка подключений не должна дёргать базу на каждое
  async soon() {
    const at = Date.now() + SOON_MS, cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > at) await this.ctx.storage.setAlarm(at);
  }
  // раз в 45 секунд, пока кто-то подключён: отметить всех «заходил сейчас», разослать счётчик и объявление, если поменялись
  async alarm() {
    const socks = this.live();
    if (!socks.length) return; // все ушли: будильник больше не нужен, комната засыпает
    const now = Date.now(), uids = new Set(), guests = new Set();
    for (const w of socks) { const a = w.deserializeAttachment() || {}; if (a.uid) uids.add(a.uid); else if (a.guest) guests.add(a.guest); }
    try {
      await touchUsers(this.env, [...uids], now, BEAT_GAP);
      await touchGuests(this.env, [...guests], now, BEAT_GAP);
      this.cnt.at = 0; this.ann.at = 0;
      const n = await this.online(now), a = await this.announce(now);
      const sent = (await this.ctx.storage.get('sent')) || {};
      if (sent.n !== n) this.broadcast(JSON.stringify({ t: 'count', online: n }));
      const sig = JSON.stringify(a);
      if (sent.a !== undefined && sent.a !== sig) this.broadcast(JSON.stringify({ t: 'announce', announce: a }));
      await this.ctx.storage.put('sent', { n, a: sig });
    } catch (e) { console.error('presence beat', e && e.message); }
    await this.ctx.storage.setAlarm(now + BEAT_MS);
  }
  async poke(b) {
    const what = b && b.what, now = Date.now();
    if (what === 'announce') {
      this.ann.at = 0;
      const a = await this.announce(now);
      const sent = (await this.ctx.storage.get('sent')) || {};
      await this.ctx.storage.put('sent', { ...sent, a: JSON.stringify(a) });
      this.broadcast(JSON.stringify({ t: 'announce', announce: a }));
      return;
    }
    // уровни: в почте новое письмо для всех — каждой открытой вкладке сигнал «загляни за наградами»
    if (what === 'mail') { this.broadcast(JSON.stringify({ t: 'notify', kind: 'award' })); return; }
    if (what === 'notify') {
      const to = String(b.to || ''), n = b.n || {};
      if (!UID_RE.test(to) || !['react', 'comment', 'award'].includes(n.kind)) return;
      // уровни: только сигнал «загляни за наградами», сами награды страница возьмёт из /api/levels/news
      if (n.kind === 'award') { const t = JSON.stringify({ t: 'notify', kind: 'award' }); for (const w of this.live('u:' + to)) this.send(w, t); return; }
      const from = n.from || {};
      const msg = { t: 'notify', kind: n.kind, from: { id: short(from.id, 24), username: short(from.username, 40), handle: short(from.handle, 32) }, text: short(n.text, 200) };
      if (n.kind === 'react') { msg.rid = short(n.rid, 90); msg.emoji = n.emoji ? short(n.emoji, 16) : null; } else msg.target = short(n.target, 90);
      const text = JSON.stringify(msg);
      for (const w of this.live('u:' + to)) this.send(w, text);
      return;
    }
    const ids = [...new Set((Array.isArray(b && b.ids) ? b.ids : []).map(String).filter((x) => UID_RE.test(x)))].slice(0, 50);
    if (what === 'drop') {
      // сеансы закрыты: сокеты этих людей переподключаются, а закрытые входят уже как гости
      for (const id of ids) {
        this.friends.delete(id);
        const socks = this.live('u:' + id), shown = socks.some((w) => !(w.deserializeAttachment() || {}).hide);
        for (const w of socks) this.revoke(w);
        if (shown) await this.tellFriends(id, false, now);
      }
      return;
    }
    if (what === 'users') {
      // поменялись друзья, заявки или «скрывать, что я в сети»: свежий state тем, у кого сайт открыт
      for (const id of ids) this.friends.delete(id);
      for (const id of ids) {
        const socks = this.live('u:' + id);
        if (!socks.length) continue;
        const row = await this.env.DB.prepare('SELECT hide_online FROM users WHERE id = ?').bind(id).first();
        if (!row) { for (const w of socks) this.revoke(w); continue; }
        const hide = !!row.hide_online, was = !socks.some((w) => !(w.deserializeAttachment() || {}).hide);
        for (const w of socks) { const a = w.deserializeAttachment() || {}; if (a.hide !== hide) w.serializeAttachment({ ...a, hide }); }
        if (was !== hide) await this.tellFriends(id, !hide, now);
        const plain = JSON.stringify(await this.stateFor(id, false)), full = JSON.stringify(await this.stateFor(id, true));
        for (const w of socks) this.send(w, (w.deserializeAttachment() || {}).bearer ? full : plain);
      }
    }
  }
  async webSocketMessage(ws, msg) {
    // от страниц комнате ничего не нужно, кроме "ping" (на него отвечает сама платформа): всё остальное — повод закрыть
    const now = Date.now(), r = this.rate.get(ws) || [now, 0];
    if (now - r[0] > RATE_MS) { r[0] = now; r[1] = 0; }
    r[1]++;
    this.rate.set(ws, r);
    if (r[1] > RATE_N || typeof msg !== 'string' || msg.length > 256) this.drop(ws, 1008, 'unexpected');
  }
  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment() || {};
    this.drop(ws, code === 1005 || code === 1006 ? 1000 : code, 'bye');
    try {
      // закрыта последняя вкладка: «был(а) только что», друзья видят, что ушёл
      if (a.uid && !this.live('u:' + a.uid).length) {
        const now = Date.now();
        await this.env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, a.uid).run();
        if (!a.hide) await this.tellFriends(a.uid, false, now);
      }
      await this.soon();
    } catch (e) { console.error('presence close', e && e.message); }
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }
}

export default {
  // своих адресов у Worker'а нет: всё идёт через привязку в Pages
  fetch() { return new Response('Not found', { status: 404 }); },
  // раз в сутки (triggers в rt/wrangler.toml): начать копию базы. Сам cron только будит комнату — на бесплатном плане
  // у него 10 мс процессора, а у будильников комнаты по 30 секунд
  async scheduled(event, env, ctx) {
    // сезон званий: срок сброса прошёл, а на сайт никто не заходил — закрыть его здесь (обычно его закрывает
    // первый же запрос после срока; повторное закрытие ничего не делает). Процессора тут почти не нужно: ждём базу
    if (env.DB && levelsOn(env)) ctx.waitUntil(currentSeason(env).catch((e) => console.error('season cron', e && e.message)));
    // письма об обновлениях: следующая пачка идущей рассылки и напоминание о сбросе званий, когда подошёл срок.
    // Нужны MAIL_KEY и MAIL_FROM и у этого Worker'а (README, «Письма об обновлениях»)
    if (env.DB && mailOn(env)) ctx.waitUntil(mailoutStep(env).catch((e) => console.error('mailout cron', e && e.message)));
    if (!env.BACKUPS || !env.BACKUP_ROOM) return; // хранилище R2 не подключено: копий нет, комнаты лотов и присутствия работают
    const room = env.BACKUP_ROOM.get(env.BACKUP_ROOM.idFromName('backup'));
    ctx.waitUntil(room.fetch('https://rt/start', { method: 'POST', headers: { 'x-backup-by': 'cron' } }));
  },
};
// сезон закрылся здесь (cron или победа в лотах, доведённая комнатой): всем открытым вкладкам — «загляни за новостями»
onSeasonClose((env) => (env.PRESENCE_ROOM ? env.PRESENCE_ROOM.get(env.PRESENCE_ROOM.idFromName('global')).fetch('https://rt/poke', { method: 'POST', body: JSON.stringify({ what: 'mail' }) }) : null));
