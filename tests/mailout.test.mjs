// Тесты писем об обновлениях: node --test tests/mailout.test.mjs
// База — SQLite в памяти (node:sqlite) с тем же видом, что у D1; Resend подменён (globalThis.fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as M from '../functions/_lib/mailout.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isRead = (sql) => /^\s*(SELECT|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
    exec() {
      const p = db.prepare(sql);
      if (isRead(sql)) return { results: p.all(...args), meta: { changes: 0 } };
      return { results: [], meta: { changes: p.run(...args).changes } };
    },
  });
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, email TEXT, email_ok INTEGER, banned INTEGER, created_at INTEGER);
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);`);
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const ORIGIN = 'https://casualhub.pages.dev';
const envOf = (extra = {}) => ({ DB: fakeD1(), MAIL_KEY: 're_test', MAIL_FROM: 'Казуал Хаб <news@example.com>', LEVELS: '1', ...extra });
const q = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const DAY = 864e5;
const user = (env, id, { email = id + '@mail.test', ok = 1, banned = 0 } = {}) => env.DB.raw.prepare('INSERT INTO users (id, username, uname, email, email_ok, banned, created_at) VALUES (?, ?, ?, ?, ?, ?, 1)').run(id, id, id, email, ok, banned);
const CONTENT = {
  ru: { subject: 'Котик Васян и сезоны званий', teaser: 'Мы обновили Казуал Хаб — вот главное:', items: [{ t: 'Сезоны званий', d: 'Звание теперь за месяц.' }, { t: 'Котик Васян', d: 'Гуляет по сайту.' }, { t: 'Рассылка', d: '' }] },
  en: { subject: 'Vasyan the cat and title seasons', teaser: 'We’ve updated Casual Hub:', items: [{ t: 'Title seasons', d: 'Titles are monthly now.' }, { t: 'Vasyan the cat', d: '' }, { t: 'Newsletter', d: '' }] },
  link: ORIGIN + '/#whatsnew',
};
// подменённый Resend: что отправили и что ответить
function fakeResend(answer = () => ({ status: 200 })) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, key: opts.headers['idempotency-key'] || null, body });
    const a = answer(calls.length, body);
    const json = a.status === 200 ? { data: body.map((_, i) => ({ id: 'e' + i })) } : { statusCode: a.status, name: a.name || '', message: a.message || '' };
    return new Response(JSON.stringify(json), { status: a.status, headers: { 'content-type': 'application/json', ...(a.retry ? { 'retry-after': String(a.retry) } : {}) } });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
// адреса с заглушками помощников главного файла API
function routes(extra = {}) {
  const seen = { pokeAll: 0, log: [] };
  const r = M.makeMailoutRoutes({
    json: (o) => o, fail: (status, message) => ({ status, message }), readBody: async (x) => (x && x.body) || {},
    adminActive: async () => true, adminLog: async (env, req, me, what) => { seen.log.push(what); }, burst: () => 0, clientIp: () => 'ip',
    langOf: () => 'ru', maskMail: (m) => String(m || '').replace(/^(..)[^@]*/, '$1…'), pokeAll: async () => { seen.pokeAll++; }, ...extra,
  });
  return { r, seen };
}
// обращения к D1, как их считает Cloudflare: first/all/run — по одному, пачка — один запрос
function counted(env) {
  const db = env.DB;
  let n = 0;
  const wrap = (st) => ({ ...st, bind: (...a) => wrap(st.bind(...a)), first: () => { n++; return st.first(); }, all: () => { n++; return st.all(); }, run: () => { n++; return st.run(); } });
  env.DB = { ...db, prepare: (sql) => wrap(db.prepare(sql)), batch: (list) => { n++; return db.batch(list); } };
  return () => n;
}

test('кому: только подтверждённая почта, не заблокированные и не отписавшиеся; язык — свой', async () => {
  const env = envOf();
  user(env, 'a'); user(env, 'b', { ok: 0 }); user(env, 'c', { banned: 1 }); user(env, 'd'); user(env, 'e', { email: null }); user(env, 'f');
  await M.rememberLang(env, 'f', 'en');
  await M.ensureMailout(env);
  env.DB.raw.exec("INSERT INTO mail_prefs (user_id, news, token, at) VALUES ('d', 0, 'tok', 1)");
  assert.equal(await M.eligibleCount(env), 2);
  const fr = fakeResend();
  try {
    await M.createMailout(env, { content: CONTENT, origin: ORIGIN, now: T0 });
    const s = await M.mailoutStep(env, { now: T0 });
    assert.equal(s.sentNow, 2);
    assert.equal(fr.calls.length, 1);
    assert.equal(fr.calls[0].url, 'https://api.resend.com/emails/batch');
    const mails = Object.fromEntries(fr.calls[0].body.map((m) => [m.to[0], m]));
    assert.deepEqual(Object.keys(mails).sort(), ['a@mail.test', 'f@mail.test']);
    assert.equal(mails['a@mail.test'].subject, 'Котик Васян и сезоны званий');
    assert.equal(mails['f@mail.test'].subject, 'Vasyan the cat and title seasons');
    assert.equal(mails['a@mail.test'].from, 'Казуал Хаб <news@example.com>');
    // ссылка «Отписаться» со своим токеном — и в письме, и в заголовке
    const tok = q(env, "SELECT token FROM mail_prefs WHERE user_id = 'a'")[0].token;
    assert.match(tok, /^[0-9a-f]{24}$/);
    const unsub = `${ORIGIN}/api/mail/unsub?u=a&t=${tok}`;
    assert.equal(mails['a@mail.test'].headers['List-Unsubscribe'], `<${unsub}>`);
    assert.equal(mails['a@mail.test'].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.ok(mails['a@mail.test'].html.includes(unsub.replace(/&/g, '&amp;')));
    assert.ok(mails['a@mail.test'].text.includes(unsub));
    // все получили — рассылка закончилась в том же шаге, следующему шагу делать нечего
    assert.equal(s.done, true);
    assert.equal(s.current.sent, 2);
    assert.equal((await M.mailoutStep(env, { now: T0 + 1000 })).idle, true);
  } finally { fr.restore(); }
});

test('пачки: не больше лимита за сутки, остальное — завтра; каждому по одному письму', async () => {
  const env = envOf({ MAILOUT_DAILY: '80' });
  for (let i = 0; i < 250; i++) user(env, 'u' + String(i).padStart(3, '0'));
  const fr = fakeResend();
  try {
    await M.createMailout(env, { content: CONTENT, origin: ORIGIN, now: T0 });
    let s = await M.mailoutStep(env, { now: T0 });
    assert.equal(s.sentNow, 80);
    assert.equal(s.current.total, 250);
    // в тот же день — лимит: ничего не уходит, ждём сутки от первой отправки
    s = await M.mailoutStep(env, { now: T0 + 3600e3 });
    assert.equal(s.limited, true);
    assert.equal(fr.calls.length, 1);
    assert.equal(s.current.pausedUntil, T0 + DAY);
    s = await M.mailoutStep(env, { now: T0 + 2 * 3600e3 });
    assert.equal(s.paused, true);
    let t = T0 + DAY + 1000;
    for (let k = 0; k < 6 && !s.done; k++, t += DAY + 1000) s = await M.mailoutStep(env, { now: t });
    assert.deepEqual(fr.calls.map((c) => c.body.length), [80, 80, 80, 10]);
    assert.equal(s.current.sent, 250);
    assert.ok(s.current.doneAt);
    const to = fr.calls.flatMap((c) => c.body.map((m) => m.to[0]));
    assert.equal(new Set(to).size, 250);
    assert.equal(q(env, "SELECT COUNT(*) AS n FROM mailout_queue WHERE status = 'sent'")[0].n, 250);
  } finally { fr.restore(); }
});

test('429 и ошибки: ничего не теряется, рассылка ждёт и продолжает', async () => {
  const env = envOf();
  for (let i = 0; i < 5; i++) user(env, 'u' + i);
  let mode = 'quota';
  const fr = fakeResend(() => (mode === 'quota' ? { status: 429, name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' }
    : mode === 'bad' ? { status: 403, name: 'validation_error', message: 'The domain is not verified.' } : { status: 200 }));
  try {
    await M.createMailout(env, { content: CONTENT, origin: ORIGIN, now: T0 });
    let s = await M.mailoutStep(env, { now: T0 });
    assert.equal(s.limited, true);
    assert.equal(s.current.sent, 0);
    assert.equal(s.current.pauseKind, 'limit');
    assert.equal(s.current.pausedUntil, Date.UTC(2026, 10, 13) + 10 * 60e3); // после полуночи по UTC
    assert.equal(q(env, "SELECT COUNT(*) AS n FROM mailout_queue WHERE status = 'wait'")[0].n, 5);
    // «Продолжить» лимит Resend не обходит
    s = await M.mailoutStep(env, { now: T0 + 60e3, force: true });
    assert.equal(s.paused, true);
    // домен не подтверждён: стоп до админа, причина видна
    mode = 'bad';
    s = await M.mailoutStep(env, { now: Date.UTC(2026, 10, 13, 1) });
    assert.equal(s.current.pauseKind, 'error');
    assert.match(s.current.lastError, /^403: The domain is not verified\./);
    assert.equal((await M.mailoutStep(env, { now: Date.UTC(2026, 10, 13, 2) })).paused, true);
    mode = 'ok';
    s = await M.mailoutStep(env, { now: Date.UTC(2026, 10, 13, 3), force: true });
    assert.equal(s.sentNow, 5);
    assert.equal(s.current.lastError, '');
  } finally { fr.restore(); }
});

test('застрявшая пачка уходит снова тем же Idempotency-Key', async () => {
  const env = envOf();
  for (let i = 0; i < 3; i++) user(env, 'u' + i);
  const fr = fakeResend();
  try {
    const id = await M.createMailout(env, { content: CONTENT, origin: ORIGIN, now: T0 });
    // Worker оборвался после того, как взял пачку: строки остались в sending, рассылка не закончена
    await M.mailoutStep(env, { now: T0 });
    env.DB.raw.prepare("UPDATE mailout_queue SET status = 'sending', claim = 'abc', claimed_at = ?, sent_at = NULL").run(T0);
    env.DB.raw.exec('UPDATE mailouts SET done_at = NULL, sent = 0');
    fr.calls.length = 0;
    const s = await M.mailoutStep(env, { now: T0 + 11 * 60e3 });
    assert.equal(fr.calls.length, 1);
    assert.equal(fr.calls[0].key, `mailout-${id}-abc`);
    assert.equal(s.sentNow, 3);
    assert.equal(q(env, "SELECT COUNT(*) AS n FROM mailout_queue WHERE status = 'sent'")[0].n, 3);
  } finally { fr.restore(); }
});

test('отписка: ссылка с токеном, страница, «в одно нажатие» из почты и переключатель в настройках', async () => {
  const env = envOf();
  user(env, 'a'); user(env, 'b');
  const { r } = routes();
  const me = { id: 'a', email: 'a@mail.test', email_ok: 1 };
  const p = await r['GET /mail/prefs']({ env, request: {}, me });
  assert.deepEqual({ news: p.news, verified: p.verified }, { news: true, verified: true });
  const tok = q(env, "SELECT token FROM mail_prefs WHERE user_id = 'a'")[0].token;
  const url = (t) => `${ORIGIN}/api/mail/unsub?u=a&t=${t}`;
  // чужой или пустой токен не подходит
  let res = await r['GET /mail/unsub']({ env, request: new Request(url('0'.repeat(24))) });
  assert.equal(res.status, 403);
  assert.match(await res.text(), /Ссылка не подходит/);
  res = await r['POST /mail/unsub']({ env, request: new Request(url(''), { method: 'POST', body: 'news=0', headers: { 'content-type': 'application/x-www-form-urlencoded' } }) });
  assert.equal(res.status, 403);
  // своя ссылка: страница сама нажмёт «Отписаться» (/mail-unsub.js), сканеры без скриптов — нет
  res = await r['GET /mail/unsub']({ env, request: new Request(url(tok)) });
  const page = await res.text();
  assert.equal(res.status, 200);
  assert.match(page, /<form method="post" action="\/api\/mail\/unsub\?u=a&amp;t=[0-9a-f]{24}" data-auto>/);
  assert.match(page, /<script src="\/mail-unsub\.js" defer><\/script>/);
  assert.equal(q(env, "SELECT news FROM mail_prefs WHERE user_id = 'a'")[0].news, 1);
  // нажатие на странице
  res = await r['POST /mail/unsub']({ env, request: new Request(url(tok), { method: 'POST', body: 'news=0', headers: { 'content-type': 'application/x-www-form-urlencoded' } }) });
  assert.match(await res.text(), /писем об обновлениях больше не будет/);
  assert.equal(q(env, "SELECT news FROM mail_prefs WHERE user_id = 'a'")[0].news, 0);
  // вернуть
  await r['POST /mail/unsub']({ env, request: new Request(url(tok), { method: 'POST', body: 'news=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } }) });
  assert.equal(q(env, "SELECT news FROM mail_prefs WHERE user_id = 'a'")[0].news, 1);
  // «Отписаться» прямо в почте (RFC 8058): POST на тот же адрес с телом List-Unsubscribe=One-Click
  res = await r['POST /mail/unsub']({ env, request: new Request(url(tok), { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } }) });
  assert.equal(res.status, 200);
  assert.equal(q(env, "SELECT news FROM mail_prefs WHERE user_id = 'a'")[0].news, 0);
  assert.equal(await M.eligibleCount(env), 1);
  // переключатель в настройках
  assert.deepEqual(await r['PUT /mail/prefs']({ env, request: { body: { news: true } }, me }), { ok: true, news: true });
  assert.equal((await r['GET /mail/prefs']({ env, request: {}, me })).news, true);
  assert.equal((await r['PUT /mail/prefs']({ env, request: { body: { news: 'да' } }, me })).status, 400);
});

test('письмо: HTML и текст, кнопка, отписка, английский, экранирование', () => {
  const unsub = ORIGIN + '/api/mail/unsub?u=a&t=x';
  const ru = M.composeNews({ ...CONTENT, ru: { ...CONTENT.ru, subject: 'Новое <script>' } }, 'ru', { origin: ORIGIN, unsub });
  assert.equal(ru.subject, 'Новое <script>');
  assert.ok(ru.html.includes('Новое &lt;script&gt;') && !ru.html.includes('<script>'));
  assert.ok(ru.html.includes('Посмотреть, что нового'));
  assert.ok(ru.html.includes(`href="${ORIGIN}/#whatsnew"`));
  assert.ok(ru.html.includes('prefers-color-scheme: dark'));
  for (const it of CONTENT.ru.items) assert.ok(ru.html.includes(it.t) && ru.text.includes(it.t));
  assert.ok(ru.text.includes('Посмотреть, что нового: ' + ORIGIN + '/#whatsnew'));
  assert.ok(ru.text.includes('Отписаться от писем об обновлениях: ' + unsub));
  const en = M.composeNews(CONTENT, 'en', { origin: ORIGIN, unsub });
  assert.equal(en.subject, CONTENT.en.subject);
  assert.ok(en.html.includes('See what’s new') && en.html.includes('lang="en"'));
  // английского нет — всем русский
  assert.equal(M.composeNews({ ...CONTENT, en: null }, 'en', { origin: ORIGIN, unsub }).subject, CONTENT.ru.subject);
  // проверка содержания
  assert.equal(M.cleanContent({ ru: { subject: '', items: [] } }, ORIGIN).error, 'Нужны тема и хотя бы один пункт.');
  assert.match(M.cleanContent({ ru: CONTENT.ru, link: 'javascript:alert(1)' }, ORIGIN).error, /https/);
  assert.equal(M.cleanContent({ ru: CONTENT.ru }, ORIGIN).content.link, ORIGIN + '/#whatsnew');
  assert.equal(M.cleanContent({ ru: { ...CONTENT.ru, items: Array.from({ length: 9 }, (_, i) => ({ t: 'п' + i })) } }, ORIGIN).content.ru.items.length, 6);
});

test('админка: себе, всем (и во «внутреннюю» почту), вторая рассылка не начнётся, остановить', async () => {
  const env = envOf();
  for (let i = 0; i < 4; i++) user(env, 'u' + i);
  const { r, seen } = routes();
  const me = { id: 'adm', email: 'admin@mail.test', email_ok: 1 };
  const request = (body) => ({ url: ORIGIN + '/api/admin/mailout', body });
  const fr = fakeResend();
  try {
    const t = await r['POST /admin/mailout/test']({ env, request: request({ content: CONTENT }), me });
    assert.deepEqual({ ok: t.ok, n: t.n }, { ok: true, n: 2 });
    assert.deepEqual(fr.calls[0].body.map((m) => m.to[0]), ['admin@mail.test', 'admin@mail.test']);
    assert.equal((await r['POST /admin/mailout/test']({ env, request: request({ content: { ru: { subject: 'x', items: [] } } }), me })).status, 400);
    const s = await r['POST /admin/mailout']({ env, request: request({ content: CONTENT }), me });
    assert.equal(s.step.sentNow, 4);
    assert.equal(s.recent[0].subject, CONTENT.ru.subject);
    // во «внутреннюю» почту уровней новости не попадают: она только для наград и подарков
    const hasGifts = q(env, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gifts'").length > 0;
    if (hasGifts) assert.equal(q(env, "SELECT 1 FROM gifts WHERE kind = 'news'").length, 0);
    assert.ok(!seen.pokeAll);
    // новая рассылка, пока идёт прошлая, — нельзя; остановить — кто не получил, уже не получит
    for (let i = 4; i < 8; i++) user(env, 'u' + i);
    env.DB.raw.exec('UPDATE mailouts SET done_at = NULL');
    env.DB.raw.exec("INSERT INTO mailout_queue (mailout, user_id, email, lang, status) SELECT 1, id, email, 'ru', 'wait' FROM users WHERE id IN ('u4', 'u5')");
    assert.equal((await r['POST /admin/mailout']({ env, request: request({ content: CONTENT }), me })).status, 409);
    const st = await r['DELETE /admin/mailout']({ env, request: { url: ORIGIN + '/api/admin/mailout?id=1' }, me });
    assert.equal(st.current, null);
    assert.equal(q(env, "SELECT COUNT(*) AS n FROM mailout_queue WHERE status = 'skip'")[0].n, 2);
  } finally { fr.restore(); }
});

test('напоминание о сбросе званий: за 3 дня до сброса, перенос и отмена', async () => {
  const env = envOf();
  user(env, 'a');
  const fr = fakeResend();
  try {
    const end = T0 + 10 * DAY;
    const p = await M.planSeasonReminder(env, { n: 1, end, whenText: '22 ноября в 12:00 по Москве', origin: ORIGIN, by: 'adm', remind: true, now: T0 });
    assert.equal(p.at, end - 3 * DAY);
    assert.equal((await M.mailoutStep(env, { now: T0 })).idle, true); // ещё рано
    // перенесли — прежнее напоминание снято, новое — к новой дате
    const p2 = await M.planSeasonReminder(env, { n: 1, end: end + DAY, whenText: '23 ноября в 12:00 по Москве', origin: ORIGIN, by: 'adm', remind: true, now: T0 });
    assert.equal((await M.seasonReminderOf(env, 1)).id, p2.id);
    assert.equal(q(env, "SELECT COUNT(*) AS n FROM mailouts WHERE kind = 'season' AND canceled = 0")[0].n, 1);
    const s = await M.mailoutStep(env, { now: p2.at + 1000 });
    assert.equal(s.sentNow, 1);
    assert.equal(fr.calls[0].body[0].subject, 'Через 3 дня сброс званий');
    assert.match(fr.calls[0].body[0].text, /Сезон 1 закончится 23 ноября в 12:00 по Москве\./);
    // без галочки — снять (если ещё не начато)
    await M.planSeasonReminder(env, { n: 2, end: end + 30 * DAY, whenText: '…', origin: ORIGIN, remind: true, now: T0 });
    await M.planSeasonReminder(env, { n: 2, end: end + 30 * DAY, whenText: '…', origin: ORIGIN, remind: false, now: T0 });
    assert.equal(await M.seasonReminderOf(env, 2), null);
  } finally { fr.restore(); }
});

test('сброс званий в админке: галочка «напомнить письмом» ставит напоминание, «Сбросить сейчас» его снимает', async () => {
  const { makeLevelsRoutes } = await import('../functions/_lib/levels-api.js');
  const env = envOf();
  const me = { id: 'adm', handle: 'adm' };
  const lr = makeLevelsRoutes({
    json: (o) => o, fail: (status, message) => ({ status, message }), readBody: async (x) => (x && x.body) || {},
    adminActive: async () => true, isAdmin: async () => true, adminCandidate: () => true, adminLog: async () => {},
    poke: async () => {}, pokeAll: async () => {}, markNews: () => {}, getAnnounce: async () => null, setAnnounce: async () => {},
  });
  const real = Date.now;
  Date.now = () => T0;
  try {
    const end = T0 + 10 * DAY;
    await lr['PUT /admin/levels/season']({ env, request: { url: ORIGIN + '/api/admin/levels/season', body: { end, remind: true } }, me });
    const r = await M.seasonReminderOf(env, 1);
    assert.deepEqual({ startAt: r.startAt, subject: r.subject }, { startAt: end - 3 * DAY, subject: 'Через 3 дня сброс званий' });
    assert.equal((await lr['GET /admin/levels/seasons']({ env, request: {}, me })).current.remind.id, r.id);
    await lr['POST /admin/levels/season/reset']({ env, request: {}, me });
    assert.equal(await M.seasonReminderOf(env, 1), null);
  } finally { Date.now = real; }
});

test('обращений к D1: «Разослать всем» и шаг рассылки меньше 50, язык из /ping — без записи каждый раз', async (t) => {
  const env = envOf();
  for (let i = 0; i < 300; i++) user(env, 'u' + String(i).padStart(3, '0'));
  const { r } = routes();
  const me = { id: 'adm', email: 'admin@mail.test', email_ok: 1 };
  const fr = fakeResend();
  try {
    const c1 = counted(env);
    await r['POST /admin/mailout']({ env, request: { url: ORIGIN + '/api/admin/mailout', body: { content: CONTENT } }, me });
    const nSend = c1();
    const c2 = counted(env);
    await M.mailoutStep(env, { now: Date.now() + 2 * DAY });
    const nStep = c2();
    const c3 = counted(env);
    await M.rememberLang(env, 'u001', 'en');
    await M.rememberLang(env, 'u001', 'en');
    const nLang = c3();
    t.diagnostic(`«Разослать всем» (300 человек): ${nSend} обращений к D1, следующая пачка: ${nStep}, язык дважды: ${nLang}`);
    assert.ok(nSend < 50 && nStep < 50);
    assert.equal(nLang, 2); // таблицы (холодный Worker) и одна запись; второй раз — ничего
    assert.equal(fr.calls.length, 2); // одна пачка — один вызов Resend
  } finally { fr.restore(); }
});
