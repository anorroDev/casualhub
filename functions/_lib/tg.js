// Казуал Хаб: уведомления в Telegram. Бот — TG_BOT (имя без @), токен — TG_TOKEN, секрет вебхука — TG_SECRET
// (переменные Pages; без TG_TOKEN и TG_BOT всё выключено: /tg/me отвечает { on: false }, Настройки строку не показывают).
// Привязка: Настройки → «Общее» → «Telegram» → «Подключить» (POST /api/tg/link: одноразовый код на 15 минут) →
// ссылка t.me/<бот>?start=<код> → человек жмёт «Старт» → Telegram присылает «/start <код>» на вебхук (POST /api/tg/hook,
// заголовок X-Telegram-Bot-Api-Secret-Token = TG_SECRET) → чат привязан к аккаунту. «/stop» в боте или «Отключить» — отвязать.
// Вебхук ставит админ кнопкой в админке (POST /api/admin/tg/webhook → setWebhook).
// Что присылать — заявки в друзья, реакции, комментарии (TG_KINDS) — по переключателям (tg_links.prefs). Одного вида
// человеку не чаще раза в минуту (tg_sent). Язык — как у писем: выбранный в Настройках, иначе язык сайта (mail_prefs).
// Заблокировал бота (Telegram ответил 403) — привязка снимается. Отправка не задерживает ответ: API зовёт tgNotify
// через waitUntil. Таблицы tg_codes и tg_sent в копию не идут (rt/backup.js → SKIP).

export const TG_KINDS = ['friend', 'react', 'comment'];
const CODE_TTL = 15 * 60e3;
const GAP = 60e3;
export const tgOn = (env) => !!(env && env.TG_TOKEN && env.TG_BOT);

const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS tg_links (user_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, prefs TEXT, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS tg_links_chat ON tg_links(chat_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS tg_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS tg_sent (user_id TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, kind))'),
  ]);
  ready.add(env.DB);
}
const parse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
const prefsOf = (raw) => { const p = parse(raw, {}); return Object.fromEntries(TG_KINDS.map((k) => [k, p[k] !== false])); };
const randCode = () => { const b = new Uint8Array(12); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };

// запрос к Telegram; нет связи — { ok: false, status: 0 }, а не исключение (иначе вебхук ответит 500, и Telegram будет повторять)
async function tgCall(env, method, params) {
  let r;
  try { r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) }); }
  catch (e) { console.error('tg', method, e && e.message); return { ok: false, status: 0, data: null }; }
  let d = null;
  try { d = await r.json(); } catch (e) {}
  return { ok: !!(r.ok && d && d.ok), status: r.status, data: d };
}

// тексты на трёх языках; {name} — ник, {x} — реакция или текст
const T = {
  ru: {
    linked: 'Готово: уведомления Казуал Хаба для {name} включены. Что присылать — в Настройках на сайте. Отключить — /stop.',
    hello: 'Привет! Чтобы получать уведомления Казуал Хаба, открой на сайте Настройки → «Общее» → «Telegram» и нажми «Подключить».',
    old: 'Ссылка устарела. Нажми «Подключить» в Настройках ещё раз.',
    stop: 'Уведомления выключены. Включить снова — в Настройках на сайте.',
    request: '{name} хочет добавить тебя в друзья.',
    accepted: '{name} и ты теперь друзья.',
    react: 'Реакция на твою оценку от {name}: {x}',
    comment: 'Комментарий от {name}: «{x}»',
    open: 'Открыть Казуал Хаб',
  },
  uk: {
    linked: 'Готово: сповіщення Казуал Хабу для {name} увімкнено. Що надсилати — у Налаштуваннях на сайті. Вимкнути — /stop.',
    hello: 'Привіт! Щоб отримувати сповіщення Казуал Хабу, відкрий на сайті Налаштування → «Загальне» → «Telegram» і натисни «Підключити».',
    old: 'Посилання застаріло. Натисни «Підключити» в Налаштуваннях ще раз.',
    stop: 'Сповіщення вимкнено. Увімкнути знову — у Налаштуваннях на сайті.',
    request: '{name} хоче додати тебе в друзі.',
    accepted: '{name} і ти тепер друзі.',
    react: 'Реакція на твою оцінку від {name}: {x}',
    comment: 'Коментар від {name}: «{x}»',
    open: 'Відкрити Казуал Хаб',
  },
  en: {
    linked: 'Done: Casual Hub notifications for {name} are on. Choose what to get in Settings on the site. To turn off — /stop.',
    hello: 'Hi! To get Casual Hub notifications, open Settings → “General” → “Telegram” on the site and press “Connect”.',
    old: 'This link has expired. Press “Connect” in Settings again.',
    stop: 'Notifications are off. Turn them back on in Settings on the site.',
    request: '{name} wants to add you as a friend.',
    accepted: 'You and {name} are friends now.',
    react: 'Reaction to your rating from {name}: {x}',
    comment: 'Comment from {name}: “{x}”',
    open: 'Open Casual Hub',
  },
};
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => String(o[k] == null ? '' : o[k]));
const clipText = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
async function langOf(env, uid) {
  try {
    const r = await env.DB.prepare('SELECT lang, lang_pick FROM mail_prefs WHERE user_id = ?').bind(uid).first();
    const l = r && (r.lang_pick || r.lang);
    return l === 'uk' || l === 'en' ? l : 'ru';
  } catch (e) { return 'ru'; }
}
// реакции сайта хранятся кодами (REACTIONS в API): в Telegram — эмодзи
const EMO = { fire: '🔥', skull: '💀', nope: '🙅', lol: '😂', love: '❤️', like: '👍', dislike: '👎', think: '🤔', cry: '😢', clown: '🤡', moai: '🗿', goat: '🐐' };
const nameOf = (u) => clipText((u && (u.username || (u.handle ? '@' + u.handle : ''))) || '?', 40);

// уведомить человека: kind — friend | react | comment; data — { from, t ('request' | 'accepted'), emoji, text }.
// true — отправлено; false — выключено, не привязан, рано (раз в минуту на вид) или Telegram не принял
export async function tgNotify(env, uid, kind, data, origin) {
  try {
    if (!tgOn(env) || !uid || !TG_KINDS.includes(kind)) return false;
    await ensure(env);
    const link = await env.DB.prepare('SELECT chat_id, prefs FROM tg_links WHERE user_id = ?').bind(uid).first();
    if (!link || !prefsOf(link.prefs)[kind]) return false;
    const now = Date.now();
    const w = await env.DB.prepare('INSERT INTO tg_sent (user_id, kind, at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id, kind) DO UPDATE SET at = ?3 WHERE tg_sent.at <= ?4').bind(uid, kind, now, now - GAP).run();
    if (!(w.meta && w.meta.changes)) return false;
    const L = T[await langOf(env, uid)];
    const name = nameOf(data && data.from);
    const text = kind === 'friend' ? fill(data && data.t === 'accepted' ? L.accepted : L.request, { name })
      : kind === 'react' ? fill(L.react, { name, x: [EMO[data && data.emoji] || '', data && data.text ? `«${clipText(data.text, 140)}»` : ''].filter(Boolean).join(' ') || '👀' })
      : fill(L.comment, { name, x: clipText(data && data.text, 200) });
    const url = /^https:\/\//.test(String(origin || '')) ? `${origin}/opinion/` : null;
    const r = await tgCall(env, 'sendMessage', { chat_id: link.chat_id, text, disable_web_page_preview: true, ...(url ? { reply_markup: { inline_keyboard: [[{ text: L.open, url }]] } } : {}) });
    if (!r.ok && r.status === 403) await env.DB.prepare('DELETE FROM tg_links WHERE user_id = ?').bind(uid).run(); // бот заблокирован
    return r.ok;
  } catch (e) { console.error('tg notify', e && e.message); return false; }
}

export function makeTgRoutes(h) {
  const { json, fail } = h;
  if (h.publicRoutes) h.publicRoutes.add('POST /tg/hook'); // вебхук Telegram — без входа, проверка по секрету
  const off = () => fail(503, 'Уведомления в Telegram на сайте пока не подключены.');
  return {
    // подключён ли бот на сайте, привязан ли мой чат и что присылать
    async 'GET /tg/me'({ env, me }) {
      if (!tgOn(env)) return json({ on: false });
      await ensure(env);
      const link = await env.DB.prepare('SELECT prefs FROM tg_links WHERE user_id = ?').bind(me.id).first();
      return json({ on: true, bot: env.TG_BOT, linked: !!link, prefs: prefsOf(link && link.prefs) });
    },
    // одноразовый код и ссылка на бота: «Старт» в Telegram привяжет чат к этому аккаунту
    async 'POST /tg/link'({ env, me }) {
      if (!tgOn(env)) return off();
      await ensure(env);
      const now = Date.now(), code = randCode();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM tg_codes WHERE user_id = ? OR exp < ?').bind(me.id, now),
        env.DB.prepare('INSERT INTO tg_codes (code, user_id, exp) VALUES (?, ?, ?)').bind(code, me.id, now + CODE_TTL),
      ]);
      return json({ url: `https://t.me/${encodeURIComponent(env.TG_BOT)}?start=${code}`, exp: now + CODE_TTL });
    },
    // { friend, react, comment }: true/false — что присылать
    async 'PUT /tg/prefs'({ env, request, me }) {
      if (!tgOn(env)) return off();
      await ensure(env);
      const b = await h.readBody(request);
      const link = await env.DB.prepare('SELECT prefs FROM tg_links WHERE user_id = ?').bind(me.id).first();
      if (!link) return fail(404, 'Telegram не подключён.');
      const p = prefsOf(link.prefs);
      for (const k of TG_KINDS) if (typeof (b && b[k]) === 'boolean') p[k] = b[k];
      await env.DB.prepare('UPDATE tg_links SET prefs = ? WHERE user_id = ?').bind(JSON.stringify(p), me.id).run();
      return json({ ok: true, prefs: p });
    },
    async 'POST /tg/unlink'({ env, me }) {
      if (!tgOn(env)) return off();
      await ensure(env);
      await env.DB.prepare('DELETE FROM tg_links WHERE user_id = ?').bind(me.id).run();
      return json({ ok: true });
    },
    // вебхук: /start <код> — привязать, /stop — отвязать, остальное — подсказка
    async 'POST /tg/hook'({ env, request }) {
      if (!tgOn(env) || !env.TG_SECRET || request.headers.get('x-telegram-bot-api-secret-token') !== env.TG_SECRET) return fail(403, 'Нет доступа.');
      await ensure(env);
      const u = await h.readBody(request);
      const m = u && u.message;
      if (!m || !m.chat || m.chat.type !== 'private' || typeof m.text !== 'string') return json({ ok: true });
      const chat = String(m.chat.id), text = m.text.trim(), now = Date.now();
      const say = (s) => tgCall(env, 'sendMessage', { chat_id: chat, text: s, disable_web_page_preview: true });
      const known = await env.DB.prepare('SELECT user_id FROM tg_links WHERE chat_id = ?').bind(chat).first();
      const lang = known ? await langOf(env, known.user_id) : (/^(uk)/.test(String((m.from && m.from.language_code) || '')) ? 'uk' : /^(ru|be|kk)/.test(String((m.from && m.from.language_code) || '')) || !(m.from && m.from.language_code) ? 'ru' : 'en');
      if (/^\/stop\b/.test(text)) {
        await env.DB.prepare('DELETE FROM tg_links WHERE chat_id = ?').bind(chat).run();
        await say(T[lang].stop);
        return json({ ok: true });
      }
      const st = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,64})$/.exec(text);
      if (st) {
        const c = await env.DB.prepare('DELETE FROM tg_codes WHERE code = ? AND exp >= ? RETURNING user_id').bind(st[1], now).first();
        if (!c) { await say(T[lang].old); return json({ ok: true }); }
        const user = await env.DB.prepare('SELECT username, uname FROM users WHERE id = ?').bind(c.user_id).first();
        // один чат — один аккаунт: прежняя привязка этого чата снимается
        await env.DB.batch([
          env.DB.prepare('DELETE FROM tg_links WHERE chat_id = ? AND user_id != ?').bind(chat, c.user_id),
          env.DB.prepare('INSERT INTO tg_links (user_id, chat_id, prefs, at) VALUES (?1, ?2, NULL, ?3) ON CONFLICT(user_id) DO UPDATE SET chat_id = ?2, at = ?3').bind(c.user_id, chat, now),
        ]);
        await say(fill(T[await langOf(env, c.user_id)].linked, { name: nameOf({ username: user && user.username, handle: user && user.uname }) }));
        return json({ ok: true });
      }
      await say(T[lang].hello);
      return json({ ok: true });
    },
    // админ: поставить вебхук на этот сайт (адрес — из запроса, секрет — TG_SECRET) и узнать, что сейчас стоит
    async 'POST /admin/tg/webhook'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!tgOn(env) || !env.TG_SECRET) return fail(400, 'Нужны переменные TG_TOKEN, TG_BOT и TG_SECRET.');
      const url = new URL(request.url).origin + '/api/tg/hook';
      const r = await tgCall(env, 'setWebhook', { url, secret_token: env.TG_SECRET, allowed_updates: ['message'], drop_pending_updates: true });
      if (!r.ok) return fail(502, 'Telegram не принял вебхук: ' + String((r.data && r.data.description) || r.status));
      return json({ ok: true, url });
    },
    async 'GET /admin/tg'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!tgOn(env)) return json({ on: false });
      await ensure(env);
      const [info, n] = await Promise.all([tgCall(env, 'getWebhookInfo', {}), env.DB.prepare('SELECT COUNT(*) AS n FROM tg_links').first()]);
      const w = (info.data && info.data.result) || {};
      return json({ on: true, bot: env.TG_BOT, secret: !!env.TG_SECRET, webhook: w.url || '', pending: +w.pending_update_count || 0, error: w.last_error_message || '', linked: +(n && n.n) || 0 });
    },
  };
}
