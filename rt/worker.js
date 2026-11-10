// Казуал Хаб: Worker casualhub-rt — комната лотов вживую (Durable Object LotRoomDO, одна на сбор: idFromName(код)).
// Из интернета он недоступен (workers_dev = false, маршрутов нет): к нему ходят только Pages Functions через привязку.
//   POST /poke — API сайта что-то записал в D1 (снимок, лоты, сбор): комната перечитывает, рассылает и заводит будильник
//   GET  /ws   — WebSocket зрителя; роль (viewer / host / admin) уже проверил маршрут /api/lots/:code/ws
// Снимок в lot_rooms.live — главная копия, комната держит только сокеты и будильник: она доводит прокрутку до вылета
// или победы и запускает следующую в режиме «до победителя», даже если вкладка ведущего закрыта.
//
// Протокол (JSON). Клиент → комната: hello, spin {mode, dur, auto}, stop (выключить «до победителя»), reset,
// force {keep, kick} (только админ). Строка "ping" → "pong" без пробуждения комнаты.
// Комната → клиент: state {live, ver, now} (при подключении и после каждой перемены; keep/kick — только админу),
// gone (сбор удалён), error {code, msg}
import { cleanLive, liveTx, settledLive, liveWake, liveLots, liveView, spinLive, resetLive, stopAuto } from '../functions/_lib/lots-live.js';

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
      if (b.what === 'gone') { this.gone(); return new Response('ok'); }
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
  stateText(live, ver, admin) {
    return JSON.stringify({ t: 'state', live: liveView(live, admin), ver, now: Date.now() });
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
  gone() {
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, JSON.stringify({ t: 'gone' }));
      this.drop(ws, 4404, 'gone');
    }
    this.ctx.storage.deleteAlarm();
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
      this.send(ws, this.stateText(st.live, st.ver, role === 'admin'));
      return;
    }
    const control = role === 'host' || role === 'admin';
    let change = null, log = '';
    if (m.t === 'spin' && control) change = async (live) => spinLive(live, await liveLots(this.env, code), m.mode, m.dur, Date.now(), m.auto === true);
    else if (m.t === 'stop' && control) change = async (live) => stopAuto(live);
    else if (m.t === 'reset' && control) change = async (live) => resetLive(live, Date.now());
    else if (m.t === 'force' && role === 'admin') {
      const clean = cleanLive({ keep: m.keep, kick: m.kick });
      change = async (live) => { if (Array.isArray(m.keep)) live.keep = clean.keep; if (Array.isArray(m.kick)) live.kick = clean.kick; return { live }; };
      log = `lots ${code}: keep ${clean.keep.length}, kick ${clean.kick.length} (rt)`;
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

export default {
  // своих адресов у Worker'а нет: всё идёт через привязку в Pages
  fetch() { return new Response('Not found', { status: 404 }); },
};
