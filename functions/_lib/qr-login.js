// Казуал Хаб: вход без пароля (окно входа в Мнении, страница — /qr-login.js): по QR-коду с телефона, где вход уже есть,
// и по коду из приложения-аутентификатора (POST /login/code — ниже, у makeQrLoginRoutes).
// Вход по QR-коду. Компьютер без входа просит код
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
// один ответ на «нет такого аккаунта», «вход по коду выключен» и «код не тот»: по нему не узнать, у кого что включено
export const CODE_BAD = 'Код не подходит. Вход по коду работает, только если в Настройках включён вход по коду без пароля.';
export const CODE_TRIES = 10; // неверных кодов подряд — и вход по коду выключается сам
// адрес для лимита: у IPv6 — вся сеть /64 (у одного человека их обычно целая подсеть), у IPv4 — сам адрес
export function netOf(ip) {
  ip = String(ip || '').toLowerCase();
  if (!ip.includes(':')) return ip;
  const [a, b] = ip.split('::');
  const head = a ? a.split(':') : [], tail = b ? b.split(':') : [];
  const full = b === undefined ? head : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail];
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

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

// h: json, fail, readBody, burst, bump, tooMany, clientIp, sha256, randHex, newSession, ownUser, deviceLabel, findLogin,
// totpOf, totpStep, secondFactor, passOk, BAD_CODE — из API
export function makeQrLoginRoutes(h) {
  const { json, fail } = h;
  const row = (env, id) => env.DB.prepare('SELECT * FROM qr_logins WHERE id = ?').bind(id).first();
  return {
    // ---------- вход по коду из приложения, без пароля ----------
    // Только у тех, кто сам включил его в Настройках (totp.free): иначе код из приложения — второй шаг после пароля, и
    // молча делать его единственным нельзя. В коде всего 6 цифр, поэтому:
    //   • 10 неверных кодов подряд (t.bad, обнуляет только верный) выключают вход по коду совсем — включить снова можно
    //     только войдя по паролю. Так у подбора всего 10 попыток, сколько бы адресов и дней у него ни было;
    //   • принимаются только текущий и прошлый код (2 из миллиона), один и тот же второй раз не пройдёт (t.last);
    //   • в час — 5 попыток на аккаунт (и на написанное, если такого аккаунта нет: по лимиту не узнать, есть ли он),
    //     20 с адреса (у IPv6 — с сети /64), 120 в минуту на всех.
    async 'POST /login/code'({ env, request }) {
      const { login, code } = await h.readBody(request);
      const ident = String(login || '').trim().slice(0, 120);
      if (h.burst('code:all', 120, 60e3)) return fail(429, BUSY);
      const waitIp = await h.bump(env, 'code-ip:' + netOf(h.clientIp(request)), 'codeIp');
      if (waitIp) return h.tooMany(waitIp);
      const u = ident ? await h.findLogin(env, ident) : null;
      const waitAcc = await h.bump(env, 'code-acc:' + (u ? u.id : 'x:' + ident.toLowerCase()), 'codeAcc');
      if (waitAcc) return fail(429, `Слишком много попыток входа по коду. Войди по паролю или подожди ${waitAcc} мин.`);
      const t = u ? h.totpOf(u) : null;
      if (!t || !t.free) return fail(401, CODE_BAD);
      const st = await h.totpStep(t.s, code, t.last, [0, -1]);
      if (!st) {
        // неверный код: +1 к счётчику подряд; десятый — вход по коду выключается (одним запросом, без гонок)
        await env.DB.prepare("UPDATE users SET totp = CASE WHEN COALESCE(json_extract(totp, '$.bad'), 0) + 1 >= ?2 THEN json_remove(json_set(totp, '$.bad', 0), '$.free') "
          + "ELSE json_set(totp, '$.bad', COALESCE(json_extract(totp, '$.bad'), 0) + 1) END WHERE id = ?1 AND json_extract(totp, '$.free') = 1").bind(u.id, CODE_TRIES).run();
        return fail(401, CODE_BAD);
      }
      if (u.banned) return fail(403, 'Аккаунт заблокирован администрацией' + (u.ban_reason ? ': ' + u.ban_reason : '.'));
      // верный код: шаг запоминается, счётчик неверных — в ноль, и только если вход по коду всё ещё включён, а этот шаг
      // никто не успел забрать: два одновременных входа одним кодом — один вход
      const w = await env.DB.prepare("UPDATE users SET totp = json_set(totp, '$.last', ?1, '$.bad', 0) WHERE id = ?2 AND json_extract(totp, '$.free') = 1 AND COALESCE(json_extract(totp, '$.last'), 0) < ?1")
        .bind(st, u.id).run();
      if (!(w.meta && w.meta.changes)) return fail(401, CODE_BAD);
      await env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind('code-acc:' + u.id).run();
      return json({ token: await h.newSession(env, u.id, request), user: h.ownUser({ ...u, totp: JSON.stringify({ ...t, last: st, bad: 0 }) }) });
    },
    // Настройки → Безопасность: включить или выключить вход по коду без пароля. Нужен код из приложения (или запасной),
    // а чтобы включить — ещё и текущий пароль, как у включения защиты (/2fa/enable): с одним украденным сеансом и
    // подсмотренным кодом вход без пароля себе не сделать. Пароль проверяется до кода: неверный пароль код не тратит.
    // Новый пароль (смена или сброс по почте) вход по коду выключает сам — NO_FREE_SQL в API.
    // Меняется только поле free (и счётчик неверных), а не весь JSON: last и запасные коды мог поменять другой вход
    async 'POST /2fa/free'({ env, request, me }) {
      const { on, code, password } = await h.readBody(request);
      if (!h.totpOf(me)) return fail(400, 'Сначала включи двухфакторную защиту.');
      // вкладка Настроек со старой страницей поля для пароля не знает: пусть обновится, счётчик попыток не тратим
      if (on === true && password === undefined) return fail(409, 'Страница устарела: обнови её и впиши текущий пароль.');
      const wait = await h.bump(env, 'acc:' + me.id, 'loginAcc');
      if (wait) return h.tooMany(wait);
      if (on === true && !(await h.passOk(env, me.id, password))) return fail(403, password ? 'Текущий пароль не подходит.' : 'Чтобы включить вход по коду, впиши текущий пароль.');
      if (!(await h.secondFactor(env, me, code))) return fail(403, h.BAD_CODE);
      await env.DB.prepare(on === true
        ? "UPDATE users SET totp = json_set(totp, '$.free', 1, '$.bad', 0) WHERE id = ? AND totp IS NOT NULL"
        : "UPDATE users SET totp = json_remove(totp, '$.free') WHERE id = ? AND totp IS NOT NULL").bind(me.id).run();
      const cur = await env.DB.prepare('SELECT totp FROM users WHERE id = ?').bind(me.id).first();
      if (!h.totpOf(cur)) return fail(400, 'Сначала включи двухфакторную защиту.');
      return json({ user: h.ownUser({ ...me, totp: cur.totp }) });
    },
    // ---------- вход по QR-коду ----------
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
