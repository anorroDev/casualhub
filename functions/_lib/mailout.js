// Казуал Хаб: письма об обновлениях сайта — рассылка «Что нового» через Resend, пачками.
// Папка _lib не становится адресом сайта.
//
// Кому: подтверждённая почта (users.email_ok = 1), аккаунт не заблокирован, человек не отписался (mail_prefs.news = 0).
// Список снимается в mailout_queue одним INSERT … SELECT в тот момент, когда рассылка начинается, дальше письма уходят
// пачками: до 100 за один вызов Resend /emails/batch (это один подзапрос, а на бесплатном плане Cloudflare их 50 на вызов).
// Учёт — та же очередь: у каждой строки статус wait → sending → sent. Сколько ушло за последние 24 часа, считается по ней:
// у бесплатного Resend 100 писем в день на всё, поэтому рассылке по умолчанию 80 (MAILOUT_DAILY), остальное — кодам входа
// и сбросу пароля. Упёрлись в предел или Resend ответил 429 — строки возвращаются в wait, рассылка ждёт до paused_until,
// продолжает кнопка «Продолжить» в админке или ночной cron в casualhub-rt. Ничего не теряется и не уходит дважды:
// пачка «застряла» в sending (Worker оборвался) — она отправляется снова с тем же Idempotency-Key, и Resend её не повторит.
//
// Отписка: у каждого свой случайный токен (mail_prefs.token); ссылка в письме и заголовок List-Unsubscribe
// (с List-Unsubscribe-Post — «в одно нажатие» прямо в почте) ведут на /api/mail/unsub. Входить не нужно.
// Язык письма — mail_prefs.lang: его запоминает /ping (кука casualhub_lang) и настройки.
import { clip } from './shelf.js';
import { levelsOn, ensureLevels } from './levels.js';

export const mailOn = (env) => !!(env && env.MAIL_KEY && env.MAIL_FROM);
const fromOf = (env) => String(env.MAIL_FROM || '').trim().replace(/^["'«](.*)["'»]$/s, '$1').trim();
// писем рассылки за 24 часа (на бесплатном Resend всего 100 в день) и писем в одной пачке (у Resend не больше 100)
export const dailyCap = (env) => { const n = parseInt(env && env.MAILOUT_DAILY, 10); return n >= 1 && n <= 50000 ? n : 80; };
export const batchSize = (env) => { const n = parseInt(env && env.MAILOUT_BATCH, 10); return n >= 1 && n <= 100 ? n : 100; };
const STUCK_MS = 10 * 60e3; // пачка в sending дольше — Worker не дожил до ответа, шлём её снова тем же ключом
const DAY = 864e5;
const one = (r) => ((r && r.results) || [])[0] || {};
const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const line = (v, n) => clip(String(v == null ? '' : v).replace(/\s+/g, ' ').trim(), n);
const sameToken = (a, b) => {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};

// ---------- таблицы ----------
const ready = new WeakSet();
export async function ensureMailout(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    // настройки писем у человека: news — письма об обновлениях (по умолчанию да), token — для ссылки «Отписаться», lang — язык писем
    env.DB.prepare("CREATE TABLE IF NOT EXISTS mail_prefs (user_id TEXT PRIMARY KEY, news INTEGER NOT NULL DEFAULT 1, token TEXT NOT NULL DEFAULT '', lang TEXT, at INTEGER)"),
    // рассылки: content — тексты по языкам; start_at — не раньше (напоминание о сбросе званий); queued_at — список снят
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mailouts (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, content TEXT NOT NULL, origin TEXT NOT NULL, start_at INTEGER, queued_at INTEGER, '
      + 'total INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, paused_until INTEGER, pause_kind TEXT, last_error TEXT, done_at INTEGER, canceled INTEGER NOT NULL DEFAULT 0, by_id TEXT, created_at INTEGER NOT NULL)'),
    // кому и что ушло: wait → sending (claim — метка пачки) → sent; skip — рассылку остановили
    env.DB.prepare("CREATE TABLE IF NOT EXISTS mailout_queue (mailout INTEGER NOT NULL, user_id TEXT NOT NULL, email TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'ru', status TEXT NOT NULL DEFAULT 'wait', claim TEXT, claimed_at INTEGER, sent_at INTEGER, PRIMARY KEY (mailout, user_id))"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS mailout_queue_wait ON mailout_queue(mailout, status)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS mailout_queue_claim ON mailout_queue(claim)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS mailout_queue_sent ON mailout_queue(status, sent_at)'),
  ]);
  ready.add(env.DB);
}

// кто получает письма об обновлениях (users u LEFT JOIN mail_prefs p)
const ELIGIBLE = "u.email_ok = 1 AND COALESCE(u.banned, 0) = 0 AND u.email IS NOT NULL AND instr(u.email, '@') > 1 AND COALESCE(p.news, 1) = 1";
export async function eligibleCount(env) {
  await ensureMailout(env);
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN mail_prefs p ON p.user_id = u.id WHERE ${ELIGIBLE}`).first();
  return +(r && r.n) || 0;
}

// ---------- язык и настройки человека ----------
const langSeen = new Map(); // в этом Worker'е уже записано: id → язык (чтобы /ping не писал каждый раз)
export async function rememberLang(env, uid, lang) {
  if (!uid) return;
  const l = lang === 'en' ? 'en' : 'ru';
  if (langSeen.get(uid) === l) return;
  try {
    await ensureMailout(env);
    await env.DB.prepare('INSERT INTO mail_prefs (user_id, news, token, lang, at) VALUES (?1, 1, lower(hex(randomblob(12))), ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET lang = excluded.lang WHERE mail_prefs.lang IS NOT excluded.lang')
      .bind(uid, l, Date.now()).run();
    if (langSeen.size > 5000) langSeen.clear();
    langSeen.set(uid, l);
  } catch (e) { console.error('mail lang', e && e.message); }
}
async function prefsRow(env, uid) {
  await ensureMailout(env);
  await env.DB.prepare("INSERT INTO mail_prefs (user_id, news, token, at) VALUES (?1, 1, lower(hex(randomblob(12))), ?2) ON CONFLICT(user_id) DO UPDATE SET token = lower(hex(randomblob(12))) WHERE mail_prefs.token = ''")
    .bind(uid, Date.now()).run();
  return env.DB.prepare('SELECT news, token, lang FROM mail_prefs WHERE user_id = ?').bind(uid).first();
}

// ---------- содержание ----------
// content: { ru: { subject, teaser, items: [{ t, d }], cta }, en?: { … }, link }. Английского может не быть — тогда всем русский
export function cleanContent(c, origin) {
  const part = (x) => {
    if (!x || typeof x !== 'object') return null;
    const items = (Array.isArray(x.items) ? x.items : []).map((it) => ({ t: line(it && it.t, 90), d: line(it && it.d, 300) })).filter((it) => it.t).slice(0, 6);
    const p = { subject: line(x.subject, 120), teaser: line(x.teaser, 500), items, cta: line(x.cta, 40) };
    return p.subject && items.length ? p : null;
  };
  const ru = part(c && c.ru);
  if (!ru) return { error: 'Нужны тема и хотя бы один пункт.' };
  const link = String((c && c.link) || '').trim();
  if (link && !/^https:\/\/[^\s"'<>\\]{3,500}$/.test(link) && !(origin && link.startsWith(origin + '/'))) return { error: 'Ссылка кнопки должна начинаться с https://' };
  return { content: { ru, en: part(c && c.en), link: link || (origin ? origin + '/#whatsnew' : '') } };
}
const T = {
  ru: { brand: 'Казуал Хаб', kicker: 'Что нового', cta: 'Посмотреть, что нового', why: 'Это письмо пришло, потому что у тебя аккаунт на Казуал Хабе с подтверждённой почтой.', unsub: 'Отписаться от писем об обновлениях', unsubText: 'Не хочешь таких писем — отписаться в одно нажатие' },
  en: { brand: 'Casual Hub', kicker: 'What’s new', cta: 'See what’s new', why: 'You’re getting this because you have a Casual Hub account with a confirmed email.', unsub: 'Unsubscribe from update emails', unsubText: 'Don’t want these emails? Unsubscribe in one click' },
};
// письмо одному человеку: { subject, html, text } на его языке; unsub — его ссылка «Отписаться»
export function composeNews(content, lang, { origin, unsub }) {
  const en = lang === 'en' && content.en;
  const p = en ? content.en : content.ru, t = T[en ? 'en' : 'ru'];
  const cta = p.cta || t.cta, link = content.link || origin + '/';
  const logo = origin + '/icon-192.png';
  const items = p.items.map((it) => `<tr><td class="item" style="padding:12px 0;border-top:1px solid #e6e8ef;">`
    + `<div class="ink" style="font-size:15px;line-height:1.4;font-weight:700;color:#14161c;">${esc(it.t)}</div>`
    + (it.d ? `<div class="soft" style="margin-top:3px;font-size:14px;line-height:1.5;color:#4a4f5c;">${esc(it.d)}</div>` : '') + '</td></tr>').join('');
  const font = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;";
  const html = `<!doctype html><html lang="${en ? 'en' : 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(p.subject)}</title>`
    + '<style>@media (prefers-color-scheme: dark){.bg{background:#0f1116!important}.card{background:#17191f!important;border-color:#2a2d36!important}'
    + '.ink{color:#f1f2f6!important}.soft{color:#c3c7d2!important}.muted{color:#9aa0b2!important}.item{border-color:#2a2d36!important}.muted a{color:#9aa0b2!important}}'
    + '[data-ogsc] .bg{background:#0f1116!important}[data-ogsc] .card{background:#17191f!important}[data-ogsc] .ink{color:#f1f2f6!important}[data-ogsc] .soft{color:#c3c7d2!important}</style></head>'
    + `<body class="bg" style="margin:0;padding:0;background:#f2f3f7;">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(p.teaser || p.items[0].t)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#f2f3f7;"><tr><td align="center" style="padding:28px 12px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;background:#ffffff;border:1px solid #e3e5ec;border-radius:20px;${font}">`
    + `<tr><td style="padding:26px 28px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>`
    + `<td style="padding-right:10px;"><img src="${esc(logo)}" width="36" height="36" alt="" style="display:block;border-radius:10px;"></td>`
    + `<td class="muted" style="font-size:13px;font-weight:700;color:#6b7080;">${esc(t.brand)} · ${esc(t.kicker)}</td></tr></table></td></tr>`
    + `<tr><td style="padding:12px 28px 0;"><h1 class="ink" style="margin:0;font-size:24px;line-height:1.25;color:#14161c;">${esc(p.subject)}</h1>`
    + (p.teaser ? `<p class="soft" style="margin:10px 0 0;font-size:15px;line-height:1.55;color:#4a4f5c;">${esc(p.teaser)}</p>` : '') + '</td></tr>'
    + `<tr><td style="padding:16px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>`
    + `<tr><td align="center" style="padding:22px 28px 26px;"><a href="${esc(link)}" style="display:inline-block;padding:15px 26px;border-radius:14px;background:#3550E8;color:#ffffff;font-size:16px;font-weight:700;line-height:1.2;text-decoration:none;">${esc(cta)}</a></td></tr>`
    + `<tr><td class="muted" style="padding:0 28px 24px;font-size:12px;line-height:1.5;color:#6b7080;">${esc(t.why)} `
    + `<a href="${esc(unsub)}" style="color:#6b7080;">${esc(t.unsubText)}</a>.</td></tr>`
    + '</table></td></tr></table></body></html>';
  const text = [`${t.brand} · ${t.kicker}`, '', p.subject, '', ...(p.teaser ? [p.teaser, ''] : []),
    ...p.items.map((it) => `— ${it.t}${it.d ? '. ' + it.d : ''}`), '', `${cta}: ${link}`, '', `${t.unsub}: ${unsub}`].join('\n');
  return { subject: p.subject, html, text };
}
const unsubUrl = (origin, uid, token) => `${origin}/api/mail/unsub?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(token)}`;
// письмо в «Почту» уровней (то же, что ушло на почту): короткий текст без разметки
function letterBody(p) {
  return clip([p.teaser, ...p.items.map((it) => `• ${it.t}${it.d ? ' — ' + it.d : ''}`)].filter(Boolean).join('\n'), 1500);
}

// ---------- Resend ----------
async function resendBatch(env, emails, key) {
  let res, body = '', d = {};
  try {
    res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + String(env.MAIL_KEY).trim(), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(emails),
    });
    body = await res.text();
  } catch (e) {
    return { ok: false, status: 0, msg: 'Нет связи с Resend: ' + String((e && e.message) || e).slice(0, 200) };
  }
  try { d = JSON.parse(body); } catch (e) {}
  if (res.ok) return { ok: true, status: res.status, ids: Array.isArray(d.data) ? d.data.length : emails.length };
  return { ok: false, status: res.status, name: String(d.name || ''), retry: +res.headers.get('retry-after') || 0, msg: String(d.message || d.error || body || '').slice(0, 300) };
}
const email = (env, to, m, headers) => ({ from: fromOf(env), to: [to], subject: m.subject, html: m.html, text: m.text, ...(headers ? { headers } : {}) });

// ---------- рассылка ----------
const view = (m) => {
  if (!m) return null;
  let c = {};
  try { c = JSON.parse(m.content); } catch (e) {}
  return {
    id: +m.id, kind: m.kind, ref: m.ref || '', subject: (c.ru && c.ru.subject) || '', total: +m.total || 0, sent: +m.sent || 0,
    startAt: m.start_at ? +m.start_at : null, queuedAt: m.queued_at ? +m.queued_at : null, pausedUntil: m.paused_until ? +m.paused_until : null,
    pauseKind: m.pause_kind || '', lastError: m.last_error || '', doneAt: m.done_at ? +m.done_at : null, canceled: !!m.canceled, createdAt: +m.created_at,
  };
};
const nextUtcMidnight = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };
// новая рассылка (или запланированная — start_at). Список получателей снимается, когда она начнётся
export async function createMailout(env, { kind = 'news', ref = null, content, origin, startAt = null, by = null, now = Date.now() }) {
  await ensureMailout(env);
  const r = await env.DB.prepare('INSERT INTO mailouts (kind, ref, content, origin, start_at, by_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(kind, ref, JSON.stringify(content), origin, startAt, by, now).first();
  return +r.id;
}
// снять список получателей: токены для ссылок «Отписаться» и очередь — одной пачкой, без цикла по людям
async function snapshot(env, m, now) {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO mail_prefs (user_id, news, token, at) SELECT u.id, 1, lower(hex(randomblob(12))), ?1 FROM users u LEFT JOIN mail_prefs p ON p.user_id = u.id WHERE ${ELIGIBLE} AND (p.token IS NULL OR p.token = '')
      ON CONFLICT(user_id) DO UPDATE SET token = lower(hex(randomblob(12))) WHERE mail_prefs.token = ''`).bind(now),
    env.DB.prepare(`INSERT OR IGNORE INTO mailout_queue (mailout, user_id, email, lang, status) SELECT ?1, u.id, u.email, CASE WHEN p.lang = 'en' THEN 'en' ELSE 'ru' END, 'wait'
      FROM users u LEFT JOIN mail_prefs p ON p.user_id = u.id WHERE ${ELIGIBLE}`).bind(m.id),
    env.DB.prepare('UPDATE mailouts SET queued_at = ?2, total = (SELECT COUNT(*) FROM mailout_queue WHERE mailout = ?1) WHERE id = ?1').bind(m.id, now),
  ]);
}
// один шаг рассылки: снять список (если ещё не снят), взять пачку в пределах дневного лимита, отправить одним вызовом
// Resend. Возвращает состояние для админки: { off | idle | current, limited, paused, sentNow, sent24, cap }
export async function mailoutStep(env, { now = Date.now(), force = false } = {}) {
  if (!mailOn(env)) return { off: true };
  await ensureMailout(env);
  let m = await env.DB.prepare('SELECT * FROM mailouts WHERE done_at IS NULL AND canceled = 0 AND (start_at IS NULL OR start_at <= ?) ORDER BY id LIMIT 1').bind(now).first();
  if (!m) return { idle: true };
  const cap = dailyCap(env);
  if (m.paused_until && now < +m.paused_until && !(force && m.pause_kind === 'error')) return { current: view(m), paused: true, cap };
  if (!m.queued_at) {
    await snapshot(env, m, now);
    m = await env.DB.prepare('SELECT * FROM mailouts WHERE id = ?').bind(m.id).first();
  }
  const [win, stuck] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n, MIN(sent_at) AS first FROM mailout_queue WHERE status = 'sent' AND sent_at > ?").bind(now - DAY),
    env.DB.prepare("SELECT claim FROM mailout_queue WHERE mailout = ? AND status = 'sending' AND claimed_at < ? LIMIT 1").bind(m.id, now - STUCK_MS),
  ]);
  const sent24 = +one(win).n || 0;
  let claim = one(stuck).claim || null;
  let rows;
  if (claim) {
    // застрявшая пачка: та же метка — тот же Idempotency-Key, Resend второй раз не отправит
    rows = (await env.DB.prepare('SELECT q.user_id, q.email, q.lang, p.token FROM mailout_queue q LEFT JOIN mail_prefs p ON p.user_id = q.user_id WHERE q.claim = ?').bind(claim).all()).results || [];
  } else {
    const room = Math.min(batchSize(env), cap - sent24);
    if (room <= 0) {
      const until = Math.max(now + 60e3, (+one(win).first || now) + DAY);
      await env.DB.prepare("UPDATE mailouts SET paused_until = ?2, pause_kind = 'limit' WHERE id = ?1").bind(m.id, until).run();
      return { current: view({ ...m, paused_until: until, pause_kind: 'limit' }), limited: true, sent24, cap };
    }
    claim = randHex(8);
    const [, got] = await env.DB.batch([
      env.DB.prepare("UPDATE mailout_queue SET status = 'sending', claim = ?3, claimed_at = ?4 WHERE rowid IN (SELECT rowid FROM mailout_queue WHERE mailout = ?1 AND status = 'wait' ORDER BY rowid LIMIT ?2)").bind(m.id, room, claim, now),
      env.DB.prepare('SELECT q.user_id, q.email, q.lang, p.token FROM mailout_queue q LEFT JOIN mail_prefs p ON p.user_id = q.user_id WHERE q.claim = ?').bind(claim),
    ]);
    rows = got.results || [];
  }
  if (!rows.length) {
    // ждущих не осталось: рассылка закончилась (старые записи о том, кому ушло, живут 90 дней)
    await env.DB.batch([
      env.DB.prepare("UPDATE mailouts SET done_at = ?2, paused_until = NULL, pause_kind = NULL, sent = (SELECT COUNT(*) FROM mailout_queue WHERE mailout = ?1 AND status = 'sent') WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM mailout_queue WHERE mailout = ?1 AND status IN ('wait', 'sending'))").bind(m.id, now),
      env.DB.prepare('DELETE FROM mailout_queue WHERE mailout IN (SELECT id FROM mailouts WHERE done_at IS NOT NULL AND done_at < ?)').bind(now - 90 * DAY),
    ]);
    const done = await env.DB.prepare('SELECT * FROM mailouts WHERE id = ?').bind(m.id).first();
    return { current: view(done), done: !!(done && done.done_at), sent24, cap };
  }
  let content = {};
  try { content = JSON.parse(m.content); } catch (e) {}
  const emails = rows.map((r) => {
    const unsub = unsubUrl(m.origin, r.user_id, r.token || '');
    return email(env, r.email, composeNews(content, r.lang, { origin: m.origin, unsub }), { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
  });
  const res = await resendBatch(env, emails, `mailout-${m.id}-${claim}`);
  if (res.ok) {
    await env.DB.batch([
      env.DB.prepare("UPDATE mailout_queue SET status = 'sent', sent_at = ?2, claim = NULL WHERE claim = ?1 AND status = 'sending'").bind(claim, now),
      env.DB.prepare("UPDATE mailouts SET sent = (SELECT COUNT(*) FROM mailout_queue WHERE mailout = ?1 AND status = 'sent'), last_error = NULL, paused_until = NULL, pause_kind = NULL WHERE id = ?1").bind(m.id),
      env.DB.prepare("UPDATE mailouts SET done_at = ?2 WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM mailout_queue WHERE mailout = ?1 AND status IN ('wait', 'sending'))").bind(m.id, now),
    ]);
  } else {
    // 429 — лимит Resend (в секунду или за день): ждём и продолжаем; другие 4xx — ошибка ключа, домена или письма:
    // стоп, пока админ не нажмёт «Продолжить»; 5xx и обрыв связи — пробуем снова через 10 минут
    const limit = res.status === 429;
    const until = limit ? (res.retry ? now + res.retry * 1000 : /quota/i.test(res.name + res.msg) ? nextUtcMidnight(now) + 10 * 60e3 : now + 60e3)
      : res.status >= 400 && res.status < 500 ? now + 365 * DAY : now + 10 * 60e3;
    await env.DB.batch([
      env.DB.prepare("UPDATE mailout_queue SET status = 'wait', claim = NULL, claimed_at = NULL WHERE claim = ?1 AND status = 'sending'").bind(claim),
      env.DB.prepare('UPDATE mailouts SET paused_until = ?2, pause_kind = ?3, last_error = ?4 WHERE id = ?1').bind(m.id, until, limit ? 'limit' : 'error', `${res.status || 'сеть'}: ${res.msg || res.name}`.slice(0, 300)),
    ]);
  }
  const after = await env.DB.prepare('SELECT * FROM mailouts WHERE id = ?').bind(m.id).first();
  return { current: view(after), sentNow: res.ok ? rows.length : 0, done: !!(after && after.done_at), limited: !res.ok && res.status === 429, failed: !res.ok, sent24: sent24 + (res.ok ? rows.length : 0), cap };
}
// остановить рассылку: кто не получил — уже не получит
export async function cancelMailout(env, id) {
  await ensureMailout(env);
  await env.DB.batch([
    env.DB.prepare('UPDATE mailouts SET canceled = 1 WHERE id = ? AND done_at IS NULL').bind(id),
    env.DB.prepare("UPDATE mailout_queue SET status = 'skip' WHERE mailout = ? AND status = 'wait'").bind(id),
  ]);
}

// ---------- напоминание о сбросе званий (сезоны, functions/_lib/levels-api.js) ----------
// за 3 дня до сброса (если до сброса меньше — сразу) уходит письмо всем, кто получает письма об обновлениях
export const REMIND_BEFORE = 3 * DAY;
export function seasonReminderContent(n, whenText, origin) {
  return {
    ru: {
      subject: `Через 3 дня сброс званий`, teaser: `Сезон ${n} закончится ${whenText}. Есть время поднять звание напоследок — итоги сезона останутся в «Прогрессе».`,
      items: [{ t: 'Звание сбросится', d: 'В новом сезоне все снова начнут с «Людишки».' }, { t: 'Уровень и награды останутся', d: 'Сбрасывается только звание сезона, опыт за всё время на месте.' }, { t: 'Итоги сезона сохранятся', d: 'Звание и место в сезоне будут видны в окне «Прогресс».' }],
      cta: 'Посмотреть своё звание',
    },
    en: {
      subject: 'Title reset in 3 days', teaser: `Season ${n} ends ${whenText}. There’s still time to climb — your season results will stay in “Progress”.`,
      items: [{ t: 'Your title resets', d: 'Everyone starts the new season as a “Little human”.' }, { t: 'Levels and rewards stay', d: 'Only the season title resets; your all-time XP stays.' }, { t: 'Season results are kept', d: 'Your title and place will be shown in the “Progress” window.' }],
      cta: 'See my title',
    },
    link: origin + '/',
  };
}
// назначить (или перенести) напоминание о сбросе сезона n; remind = false — снять
export async function planSeasonReminder(env, { n, end, whenText, origin, by, remind, now = Date.now() }) {
  await ensureMailout(env);
  const ref = `season:${n}`;
  // прежнее, ещё не начатое напоминание этого сезона снимается в любом случае
  await env.DB.prepare("UPDATE mailouts SET canceled = 1 WHERE kind = 'season' AND ref = ? AND queued_at IS NULL AND done_at IS NULL AND canceled = 0").bind(ref).run();
  if (!remind) return null;
  const startAt = Math.max(now, end - REMIND_BEFORE);
  const id = await createMailout(env, { kind: 'season', ref, content: seasonReminderContent(n, whenText, origin), origin, startAt, by, now });
  return { id, at: startAt };
}
export async function seasonReminderOf(env, n) {
  await ensureMailout(env);
  const m = await env.DB.prepare("SELECT * FROM mailouts WHERE kind = 'season' AND ref = ? AND canceled = 0 ORDER BY id DESC LIMIT 1").bind(`season:${n}`).first();
  return view(m);
}
export async function cancelSeasonReminder(env, n) {
  await ensureMailout(env);
  await env.DB.prepare("UPDATE mailouts SET canceled = 1 WHERE kind = 'season' AND ref = ? AND queued_at IS NULL AND done_at IS NULL").bind(`season:${n}`).run();
}

// ---------- страница «Отписаться» (из письма, без входа) ----------
const PAGE = {
  ru: {
    title: 'Письма Казуал Хаба', askH: 'Отписаться от писем об обновлениях?', askP: 'Больше не будем присылать письма о том, что нового на Казуал Хабе. Письма для входа и восстановления пароля останутся.',
    ask: 'Отписаться', doneH: 'Готово, писем об обновлениях больше не будет', doneP: 'Передумаешь — их можно вернуть здесь или в Настройках на сайте.', back: 'Вернуть письма',
    backH: 'Письма вернулись', backP: 'Будем иногда писать о том, что нового на сайте.', badH: 'Ссылка не подходит', badP: 'Отписаться можно на сайте: Настройки → «Письма об обновлениях».', site: 'На Казуал Хаб',
  },
  en: {
    title: 'Casual Hub emails', askH: 'Unsubscribe from update emails?', askP: 'We’ll stop sending emails about what’s new on Casual Hub. Sign-in and password emails will still arrive.',
    ask: 'Unsubscribe', doneH: 'Done, no more update emails', doneP: 'Changed your mind? Turn them back on here or in Settings on the site.', back: 'Turn emails back on',
    backH: 'Emails are back on', backP: 'We’ll write now and then about what’s new on the site.', badH: 'This link doesn’t work', badP: 'You can unsubscribe on the site: Settings → “Update emails”.', site: 'Go to Casual Hub',
  },
};
function page(lang, state, action) {
  const t = PAGE[lang === 'en' ? 'en' : 'ru'];
  const [h, p] = { ask: [t.askH, t.askP], done: [t.doneH, t.doneP], back: [t.backH, t.backP], bad: [t.badH, t.badP] }[state];
  const form = (news, label, auto, ghost) => `<form method="post" action="${esc(action)}"${auto ? ' data-auto' : ''}><input type="hidden" name="news" value="${news}"><button${ghost ? ' class="ghost"' : ''}>${esc(label)}</button></form>`;
  const act = state === 'ask' ? form(0, t.ask, true) : state === 'done' ? form(1, t.back, false, true) : '';
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">`
    + `<meta name="color-scheme" content="light dark"><title>${esc(t.title)}</title><link rel="icon" href="/favicon.ico">`
    + '<style>:root{--bg:#f2f3f7;--card:#fff;--ink:#14161c;--muted:#5d6272;--line:#e3e5ec;--accent:#3550E8}'
    + '@media (prefers-color-scheme:dark){:root{--bg:#0f1116;--card:#17191f;--ink:#f1f2f6;--muted:#a3a9b8;--line:#2a2d36;--accent:#5b6ff0}}'
    + 'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    + 'main{width:min(440px,100%);background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px;box-sizing:border-box}'
    + 'h1{font-size:21px;line-height:1.3;margin:0 0 8px}p{margin:0 0 18px;color:var(--muted)}form{margin:0 0 14px}'
    + 'button{font:inherit;font-weight:700;border:0;border-radius:14px;padding:12px 18px;background:var(--accent);color:#fff;cursor:pointer}'
    + 'button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}a{color:var(--ink)}</style></head>'
    + `<body><main><h1>${esc(h)}</h1><p>${esc(p)}</p>${act}<a href="/">${esc(t.site)}</a></main>`
    + (state === 'ask' ? '<script src="/mail-unsub.js" defer></script>' : '') + '</body></html>';
}
const htmlRes = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
// проверить ссылку: { row } — токен верный, иначе null
async function checkLink(env, uid, t) {
  if (!/^[0-9a-f]{24}$/.test(String(uid || '')) && !/^[\w-]{1,64}$/.test(String(uid || ''))) return null;
  await ensureMailout(env);
  const row = await env.DB.prepare('SELECT news, token, lang FROM mail_prefs WHERE user_id = ?').bind(String(uid)).first();
  return row && sameToken(row.token, t) ? row : null;
}

// ---------- адреса ----------
// h: { json, fail, readBody, adminActive, adminLog, burst, clientIp, langOf, pokeAll, maskMail }
export function makeMailoutRoutes(h) {
  const { json, fail } = h;
  const status = async (env, extra = {}) => {
    const [cur, recent, win] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM mailouts WHERE done_at IS NULL AND canceled = 0 AND queued_at IS NOT NULL ORDER BY id LIMIT 1'),
      env.DB.prepare("SELECT * FROM mailouts WHERE kind = 'news' ORDER BY id DESC LIMIT 5"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM mailout_queue WHERE status = 'sent' AND sent_at > ?").bind(Date.now() - DAY),
    ]);
    const planned = (await env.DB.prepare('SELECT * FROM mailouts WHERE done_at IS NULL AND canceled = 0 AND queued_at IS NULL ORDER BY start_at LIMIT 5').all()).results || [];
    return {
      on: mailOn(env), cap: dailyCap(env), sent24: +one(win).n || 0, eligible: await eligibleCount(env),
      current: view(one(cur).id ? one(cur) : null), recent: (recent.results || []).map(view), planned: planned.map(view), ...extra,
    };
  };
  return {
    // настройки писем у человека: переключатель «Письма об обновлениях» (settings.js)
    async 'GET /mail/prefs'({ env, request, me }) {
      await rememberLang(env, me.id, h.langOf(request));
      const p = await prefsRow(env, me.id);
      return json({ news: +p.news !== 0, email: h.maskMail(me.email), verified: !!me.email_ok, lang: p.lang || 'ru' });
    },
    async 'PUT /mail/prefs'({ env, request, me }) {
      const b = await h.readBody(request);
      if (typeof b.news !== 'boolean') return fail(400, 'Нужно news: да или нет.');
      await prefsRow(env, me.id);
      await env.DB.prepare('UPDATE mail_prefs SET news = ?, at = ? WHERE user_id = ?').bind(b.news ? 1 : 0, Date.now(), me.id).run();
      return json({ ok: true, news: b.news });
    },
    // «Отписаться» из письма: страница, которая сама нажимает кнопку (/mail-unsub.js). Сканеры ссылок в почте
    // скриптов не запускают, поэтому случайно никого не отпишут; без скрипта — одна кнопка
    async 'GET /mail/unsub'({ env, request }) {
      if (h.burst('unsub:' + h.clientIp(request), 30, 60e3)) return htmlRes('Too many requests', 429);
      const q = new URL(request.url).searchParams, uid = q.get('u') || '', t = q.get('t') || '';
      const row = await checkLink(env, uid, t);
      const lang = row ? row.lang : h.langOf(request);
      if (!row) return htmlRes(page(lang, 'bad', ''), 403);
      return htmlRes(page(lang, +row.news === 0 ? 'done' : 'ask', `/api/mail/unsub?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(t)}`));
    },
    // нажатие на странице (форма: news = 0 / 1) или «отписаться в одно нажатие» прямо в почте (List-Unsubscribe-Post:
    // тело List-Unsubscribe=One-Click, адрес — тот же, с u и t)
    async 'POST /mail/unsub'({ env, request }) {
      if (h.burst('unsub:' + h.clientIp(request), 30, 60e3)) return htmlRes('Too many requests', 429);
      const q = new URL(request.url).searchParams;
      let body = {};
      try {
        const raw = (await request.text()).slice(0, 2000);
        body = raw.trim().startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      } catch (e) {}
      const uid = String(body.u || q.get('u') || ''), t = String(body.t || q.get('t') || '');
      const row = await checkLink(env, uid, t);
      if (!row) return htmlRes(page(h.langOf(request), 'bad', ''), 403);
      const news = String(body.news) === '1' ? 1 : 0;
      await env.DB.prepare('UPDATE mail_prefs SET news = ?, at = ? WHERE user_id = ?').bind(news, Date.now(), uid).run();
      return htmlRes(page(row.lang, news ? 'back' : 'done', `/api/mail/unsub?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(t)}`));
    },

    // ---------- админка: рассылка «Что нового» ----------
    async 'GET /admin/mailout'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureMailout(env);
      return json(await status(env));
    },
    // проверка: письмо себе (русское и, если заполнено, английское) — одной пачкой
    async 'POST /admin/mailout/test'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (h.burst('mailouttest:' + me.id, 6, 60e3)) return fail(429, 'Подожди минуту.');
      if (!mailOn(env)) return fail(400, 'Почта не подключена: нет MAIL_KEY или MAIL_FROM.');
      if (!me.email) return fail(400, 'У твоего аккаунта нет почты.');
      const origin = new URL(request.url).origin;
      const c = cleanContent((await h.readBody(request)).content, origin);
      if (c.error) return fail(400, c.error);
      const p = await prefsRow(env, me.id);
      const unsub = unsubUrl(origin, me.id, p.token);
      const langs = c.content.en ? ['ru', 'en'] : ['ru'];
      const res = await resendBatch(env, langs.map((l) => email(env, me.email, composeNews(c.content, l, { origin, unsub }), { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })), null);
      if (!res.ok) return fail(502, `Resend не принял письмо (${res.status || 'сеть'}): ${res.msg || res.name}`);
      await h.adminLog(env, request, me, 'mailout: test', true);
      return json({ ok: true, to: h.maskMail(me.email), n: langs.length });
    },
    // разослать всем: снимок получателей, письмо во «внутреннюю» почту уровней, первая пачка сразу
    async 'POST /admin/mailout'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!mailOn(env)) return fail(400, 'Почта не подключена: нет MAIL_KEY или MAIL_FROM.');
      await ensureMailout(env);
      const origin = new URL(request.url).origin;
      const c = cleanContent((await h.readBody(request)).content, origin);
      if (c.error) return fail(400, c.error);
      const busy = await env.DB.prepare("SELECT id FROM mailouts WHERE kind = 'news' AND done_at IS NULL AND canceled = 0 LIMIT 1").first();
      if (busy) return fail(409, 'Прошлая рассылка ещё идёт: дождись её или останови.');
      const now = Date.now();
      const id = await createMailout(env, { kind: 'news', content: c.content, origin, by: me.id, now });
      // то же письмо — во «внутреннюю» почту уровней (письмо всем, без кнопки)
      if (levelsOn(env)) {
        try {
          await ensureLevels(env);
          await env.DB.prepare("INSERT OR IGNORE INTO gifts (id, to_id, kind, title, body, xp, at, by_id) VALUES (?, NULL, 'news', ?, ?, 0, ?, ?)").bind(`news:${id}`, c.content.ru.subject, letterBody(c.content.ru), now, me.id).run();
          await h.pokeAll(env);
        } catch (e) { console.error('mailout letter', e && e.message); }
      }
      const step = await mailoutStep(env, { now });
      await h.adminLog(env, request, me, `mailout: «${c.content.ru.subject.slice(0, 60)}»`, true);
      return json(await status(env, { step }));
    },
    // ещё пачка (в пределах дневного лимита); после ошибки ключа или домена — повторить
    async 'POST /admin/mailout/continue'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureMailout(env);
      const step = await mailoutStep(env, { force: true });
      return json(await status(env, { step }));
    },
    async 'DELETE /admin/mailout'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      await ensureMailout(env);
      const id = +new URL(request.url).searchParams.get('id') || 0;
      if (!id) return fail(400, 'Какую рассылку остановить?');
      await cancelMailout(env, id);
      await h.adminLog(env, request, me, `mailout: stop ${id}`, true);
      return json(await status(env));
    },
  };
}
