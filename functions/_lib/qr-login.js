// Казуал Хаб: вход по QR-коду (окно входа в Мнении, страница — /qr-login.js). Компьютер без входа просит код
// (POST /qr/new): id уходит в QR — ссылка /opinion/#qr=<id>, key остаётся у компьютера: без него сессию не забрать,
// даже сфотографировав QR. Телефон, где уже выполнен вход, открывает ссылку, видит, какое устройство просит войти
// (браузер, система, страна, город), и разрешает или отказывает (POST /qr/see, POST /qr/answer).
// Компьютер спрашивает каждые пару секунд (POST /qr/poll). Разрешили — сервер сначала говорит, кто (confirm), и компьютер
// спрашивает «Войти как @…?»: QR мог отсканировать не хозяин (например, зритель стрима), и молча входить в чужой
// аккаунт нельзя. «Да» — POST /qr/poll с take: true, сессия выдаётся один раз. Код живёт 3 минуты, после «Войти» на
// телефоне — ещё 2 минуты на «Да» на компьютере. Сессия заводится только в момент выдачи, в таблице её нет.
// Таблица — в SKIP копий (rt/backup.js): нарастёт заново. Сессии отозвали (выйти везде, новый пароль) — dropQr.
// Состояния: wait — ждём телефон, seen — телефон открыл ссылку, ok — разрешил, used — сессию забрали, denied — отказал.
export const QR_TTL = 3 * 60e3;
export const CONFIRM_TTL = 2 * 60e3;
const ID_RE = /^[0-9a-f]{32}$/;
const KEY_RE = /^[0-9a-f]{64}$/;
const BUSY = 'Слишком часто. Подожди немного.';
export const QR_GONE = 'Код устарел: обнови его на компьютере и отсканируй снова.';

const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS qr_logins (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, ua TEXT, country TEXT, city TEXT, state TEXT NOT NULL, user_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)').run();
  ready.add(env.DB);
}
// сессии аккаунта отозваны (выйти на всех устройствах, новый пароль, админ выкинул): разрешённый, но ещё не забранный
// QR-вход тоже не должен сработать. Таблицы может ещё не быть — тогда и забирать нечего
export async function dropQr(env, uid) {
  try { await env.DB.prepare('DELETE FROM qr_logins WHERE user_id = ?').bind(uid).run(); } catch (e) {}
}

// h: json, fail, readBody, burst, bump, tooMany, clientIp, sha256, randHex, newSession, ownUser, deviceLabel — из API
export function makeQrLoginRoutes(h) {
  const { json, fail } = h;
  const row = (env, id) => env.DB.prepare('SELECT * FROM qr_logins WHERE id = ?').bind(id).first();
  return {
    // компьютер: новый код. Устройство и примерное место — чтобы на телефоне было видно, кто просит войти.
    // Лимит — в базе (как у входа по паролю): обычному человеку хватает пары кодов на вход
    async 'POST /qr/new'({ env, request }) {
      const wait = await h.bump(env, 'qrnew:' + h.clientIp(request), 'qrNew');
      if (wait) return h.tooMany(wait);
      await ensure(env);
      const id = h.randHex(16), key = h.randHex(32), now = Date.now(), cf = request.cf || {};
      const country = /^[A-Z]{2}$/.test(cf.country || '') ? cf.country : '';
      await env.DB.prepare('INSERT INTO qr_logins (id, key_hash, ua, country, city, state, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, await h.sha256(key), h.deviceLabel(request.headers.get('user-agent')), country, String(cf.city || '').slice(0, 60), 'wait', now, now + QR_TTL).run();
      if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM qr_logins WHERE expires_at < ?').bind(now - 3600e3).run(); // старые не копятся
      return json({ id, key, ttl: QR_TTL });
    },
    // компьютер: что с кодом. Разрешили — кто (confirm); take: true — сессия, один раз (вторая вкладка с тем же ключом
    // её уже не получит). Лимит — по адресу, а не по коду: иначе тот, кто видел QR, мог бы задушить опрос компьютера
    async 'POST /qr/poll'({ env, request }) {
      const { id, key, take } = await h.readBody(request);
      if (!ID_RE.test(String(id || '')) || !KEY_RE.test(String(key || ''))) return json({ state: 'gone' });
      if (h.burst('qrpoll:' + h.clientIp(request), 120, 60e3)) return fail(429, BUSY);
      await ensure(env);
      const r = await row(env, id);
      if (!r || r.key_hash !== (await h.sha256(key))) return json({ state: 'gone' });
      const now = Date.now();
      if (r.state === 'denied') return json({ state: 'denied' });
      if (r.state === 'ok' && now <= r.expires_at) {
        const u = await env.DB.prepare('SELECT id, username, uname, email, created_at, banned, totp, email_ok, hide_online FROM users WHERE id = ?').bind(r.user_id).first();
        if (!u || u.banned) return json({ state: 'denied' });
        if (take !== true) return json({ state: 'confirm', user: { name: u.username, handle: u.uname } });
        const w = await env.DB.prepare("UPDATE qr_logins SET state = 'used' WHERE id = ? AND state = 'ok'").bind(id).run();
        if (!(w.meta && w.meta.changes)) return json({ state: 'gone' });
        return json({ state: 'ok', token: await h.newSession(env, u.id, request), user: h.ownUser(u) });
      }
      if (r.state === 'used' || r.state === 'ok' || now > r.expires_at) return json({ state: 'gone' });
      return json({ state: r.state === 'seen' ? 'seen' : 'wait' });
    },
    // телефон (с входом): кто просит войти. Открыл ссылку — компьютер узнаёт, что пора подтвердить на телефоне
    async 'POST /qr/see'({ env, request, me }) {
      const { id } = await h.readBody(request);
      if (!ID_RE.test(String(id || ''))) return json({ state: 'gone' });
      if (h.burst('qrsee:' + me.id, 60, 10 * 60e3)) return fail(429, BUSY);
      await ensure(env);
      const r = await row(env, id), now = Date.now();
      if (r && (r.state === 'ok' || r.state === 'used')) return json({ state: 'done' });
      if (!r || r.state === 'denied' || now > r.expires_at) return json({ state: 'gone' });
      if (r.state === 'wait') await env.DB.prepare("UPDATE qr_logins SET state = 'seen' WHERE id = ? AND state = 'wait'").bind(id).run();
      return json({ state: 'ask', device: r.ua || '', country: r.country || '', city: r.city || '', left: r.expires_at - now, user: { name: me.username, handle: me.handle } });
    },
    // телефон: «Войти» (ok: true) или «Это не я». Разрешить можно только живой код, один раз; после «Войти» у
    // компьютера есть ещё CONFIRM_TTL на «Да» — даже если «Войти» нажали в последние секунды кода
    async 'POST /qr/answer'({ env, request, me }) {
      const { id, ok } = await h.readBody(request);
      if (!ID_RE.test(String(id || ''))) return fail(410, QR_GONE);
      if (h.burst('qrans:' + me.id, 30, 10 * 60e3)) return fail(429, BUSY);
      await ensure(env);
      const now = Date.now(), yes = ok === true;
      const w = await env.DB.prepare("UPDATE qr_logins SET state = ?, user_id = ?, expires_at = ? WHERE id = ? AND state IN ('wait', 'seen') AND expires_at > ?")
        .bind(yes ? 'ok' : 'denied', yes ? me.id : null, now + CONFIRM_TTL, id, now).run();
      if (!(w.meta && w.meta.changes)) return fail(410, QR_GONE);
      return json({ ok: true });
    },
  };
}
