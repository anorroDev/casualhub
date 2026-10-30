// Казуал Хаб: страница отзыва по ссылке /r/<код>.
// Собирается на сервере и не содержит ни одного скрипта: весь текст экранируется, а заголовок CSP
// запрещает странице выполнять любой код. Поэтому даже если в оценке окажется что-то вредное,
// оно покажется просто текстом. Ссылку создаёт хозяин оценки в Мнении (POST /api/share).
import { cleanRating, readShelf, SAFE_URL } from '../_lib/shelf.js';

const SHARE_RE = /^[A-Za-z0-9]{12}$/;
// язык страницы: тот, что человек выбрал на сайте (кука ставится в i18n.js)
const TEXT = {
  ru: {
    html: 'ru', locale: 'ru-RU', verdicts: ['Ужас', 'Провал', 'Плохо', 'Слабо', 'Средне', 'Нормально', 'Неплохо', 'Хорошо', 'Отлично', 'Шедевр'], notRated: 'Без оценки', notRatedLow: 'без оценки',
    site: 'Казуал Хаб', opinion: 'Мнение Казуала', outOf: 'из 10', ratingBy: 'оценка от', ratingByCap: 'Оценка от', fav: '★ В избранном', crit: 'Критерии', pros: '➕ Плюсы', cons: '➖ Минусы', notes: 'Заметки',
    rate: 'Оценить что-нибудь своё', foot: 'Отзыв открыт по ссылке. Свои оценки можно вести в Мнении Казуала, это бесплатно.', goneTitle: 'Отзыв недоступен', gone: 'Хозяин закрыл ссылку или удалил оценку.', open: 'Открыть Мнение Казуала', home: 'На главную', wait: 'Слишком много запросов, подожди минуту.',
  },
  en: {
    html: 'en', locale: 'en-GB', verdicts: ['Awful', 'Flop', 'Bad', 'Weak', 'Average', 'Okay', 'Not bad', 'Good', 'Great', 'Masterpiece'], notRated: 'Not rated', notRatedLow: 'not rated',
    site: 'Casual Hub', opinion: 'Casual Opinion', outOf: 'out of 10', ratingBy: 'rated by', ratingByCap: 'Rated by', fav: '★ In favorites', crit: 'Criteria', pros: '➕ Pros', cons: '➖ Cons', notes: 'Notes',
    rate: 'Rate something yourself', foot: 'This review is open by link. You can keep your own ratings in Casual Opinion for free.', goneTitle: 'Review unavailable', gone: 'The owner closed the link or deleted the rating.', open: 'Open Casual Opinion', home: 'Home', wait: 'Too many requests, wait a minute.',
  },
};
const langOf = (request) => (/(?:^|;\s*)casualhub_lang=en\b/.test(request.headers.get('cookie') || '') ? TEXT.en : TEXT.ru);
// статусы, стандартные категории и критерии лежат в оценке по-русски
const EN_WORDS = { __proto__: null, 'Завершено': 'Completed', 'Просмотрено': 'Watched', 'В процессе': 'In progress', 'В планах': 'Planned', 'Брошено': 'Dropped', 'Сингл': 'Single', 'Альбом': 'Album', 'Игры': 'Games', 'Фильмы и сериалы': 'Films and series', 'Музыка и альбомы': 'Music and albums', 'Книги': 'Books', 'Еда и заведения': 'Food and places', 'Аниме и манга': 'Anime and manga', 'Гаджеты и техника': 'Gadgets and tech', 'Геймплей': 'Gameplay', 'Сюжет': 'Story', 'Графика': 'Graphics', 'Звук и музыка': 'Sound and music', 'Атмосфера': 'Atmosphere', 'Реиграбельность': 'Replayability', 'Концовка': 'Ending', 'Техническое состояние': 'Technical condition', 'Актёрская игра': 'Acting', 'Режиссура': 'Direction', 'Визуал': 'Visuals', 'Музыка и звук': 'Music and sound', 'Пересматриваемость': 'Rewatchability'};
const word = (T, v) => (T.html === 'en' ? EN_WORDS[v] || String(v || '').replace(/[А-Яа-яЁё][А-Яа-яЁё ]*[А-Яа-яЁё]/g, (m) => EN_WORDS[m] || m) : v);
const verdict = (t, T) => (t == null ? T.notRated : T.verdicts[Math.max(1, Math.min(10, Math.round(t))) - 1]);
const tier = (t) => (t == null ? 'none' : t >= 7.5 ? 'good' : t >= 5 ? 'mid' : 'bad');
const tierV = (v) => (v >= 8 ? 'good' : v >= 5 ? 'mid' : v >= 1 ? 'bad' : 'none');
const fmt = (n, T) => Number(n).toLocaleString(T.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lines = (t) => String(t || '').split(/\r?\n/).map((x) => x.replace(/^[+\-•*]\s*/, '').trim()).filter(Boolean).slice(0, 30);

// флуд с одного адреса гасится до базы
const HITS = new Map();
function tooFast(ip) {
  const now = Date.now();
  let h = HITS.get(ip);
  if (!h || h.reset <= now) { h = { n: 0, reset: now + 60e3 }; HITS.set(ip, h); }
  if (HITS.size > 20000) for (const [k, v] of HITS) if (v.reset <= now) HITS.delete(k);
  return ++h.n > 120;
}

// у страницы свои строгие правила: ни скриптов, ни форм, ни встраивания в чужие сайты
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=60',
  vary: 'Cookie',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const CSS = `
:root { --bg: #0D0F14; --panel: #161920; --panel-2: #1D2129; --ink: #E8EAF0; --ink-2: #A3A9B8; --ink-3: #7B8191; --line: #2A2F3A; --cell: #272C36;
  --accent: #8C9BFF; --good: #43C97A; --mid: #F2BA44; --bad: #F26A55; --on-tier: #0D0F14; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root { --bg: #ECEEF3; --panel: #FFFFFF; --panel-2: #F4F5F8; --ink: #14161C; --ink-2: #565C6B; --ink-3: #666C7B;
  --line: #DADDE5; --cell: #E1E4EB; --accent: #3550E8; --good: #2EAD60; --mid: #EAA92C; --bad: #E4553F; --on-tier: #14161C; color-scheme: light; } }
* { box-sizing: border-box; margin: 0; }
body { min-height: 100vh; background: var(--bg); color: var(--ink); font: 400 16px/1.5 Onest, ui-sans-serif, system-ui, sans-serif;
  padding: max(16px, env(safe-area-inset-top)) 16px 40px; display: grid; justify-items: center; }
.wrap { width: min(620px, 100%); display: grid; gap: 14px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.brand { font-family: Handjet, Onest, sans-serif; font-weight: 800; font-size: 26px; color: var(--ink); text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
.pill { display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); text-decoration: none; font-weight: 600; font-size: 14px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 20px; display: grid; gap: 16px; animation: rise .6s cubic-bezier(.34, 1.56, .64, 1) both; }
@keyframes rise { from { transform: translateY(18px) scale(.985); } }
.photo { width: 100%; max-height: 420px; object-fit: cover; border-radius: 16px; background: var(--panel-2); }
.head { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; }
h1 { font-family: Handjet, Onest, sans-serif; font-weight: 800; font-size: clamp(34px, 8vw, 54px); line-height: .95; overflow-wrap: anywhere; }
.score { flex: none; display: grid; justify-items: center; gap: 4px; }
.badge { min-width: 76px; padding: 8px 12px; border-radius: 16px; text-align: center; font-family: Handjet, Onest, sans-serif; font-weight: 800; font-size: 40px; line-height: 1; background: var(--cell); color: var(--ink); }
.badge[data-tier="good"] { background: var(--good); color: var(--on-tier); } .badge[data-tier="mid"] { background: var(--mid); color: var(--on-tier); } .badge[data-tier="bad"] { background: var(--bad); color: var(--on-tier); }
.verdict { font-size: 13px; font-weight: 700; color: var(--ink-2); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel-2); font-size: 13px; font-weight: 600; color: var(--ink-2); max-width: 100%; overflow-wrap: anywhere; }
.by { font-size: 14px; color: var(--ink-2); }
.by b { color: var(--ink); }
.label { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 6px; }
.crit { list-style: none; padding: 0; display: grid; gap: 10px; }
.crit li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; }
.crit .n { font-weight: 600; overflow-wrap: anywhere; }
.crit .v { font-family: Handjet, Onest, sans-serif; font-weight: 800; font-size: 22px; line-height: 1; }
.cells { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; }
.cells i { height: 8px; border-radius: 3px; background: var(--cell); }
.cells i.on { background: var(--t, var(--accent)); }
.crit li[data-tier="good"] { --t: var(--good); } .crit li[data-tier="mid"] { --t: var(--mid); } .crit li[data-tier="bad"] { --t: var(--bad); }
.cnote { grid-column: 1 / -1; font-size: 13.5px; color: var(--ink-2); }
.pc { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.pc div { padding: 12px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--line); }
.pc ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 14.5px; overflow-wrap: anywhere; }
.note { white-space: pre-wrap; overflow-wrap: anywhere; }
.cta { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { display: inline-flex; align-items: center; justify-content: center; height: 46px; padding: 0 20px; border-radius: 14px; font-weight: 700; text-decoration: none; }
.btn.primary { background: var(--ink); color: var(--bg); }
.btn.ghost { border: 1px solid var(--line); color: var(--ink); background: var(--panel); }
.foot { text-align: center; font-size: 12.5px; color: var(--ink-3); }
.empty { text-align: center; display: grid; gap: 12px; justify-items: center; padding: 30px 20px; }
@media (prefers-reduced-motion: reduce) { .card { animation: none; } }`;

function page(T, title, body, meta) {
  return `<!doctype html>
<html lang="${T.html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
${meta || ''}
<link rel="icon" href="/favicon.ico?v=2" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Handjet:wght@600..800&family=Onest:wght@400..700&display=swap">
<style>${CSS}</style>
</head>
<body><div class="wrap">
<div class="top"><a class="brand" href="/"><svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#14161C"/><g fill="none" stroke-width="5"><path d="M9.21 24.19A9.6 9.6 0 0 1 8.75 11.1" stroke="#F26A55"/><path d="M9.45 10.38A9.6 9.6 0 0 1 22.55 10.38" stroke="#F2BA44"/><path d="M23.25 11.1A9.6 9.6 0 0 1 22.79 24.19" stroke="#43C97A"/></g><g><path d="M16 17.4L22.28 13.48" fill="none" stroke="#E8EAF0" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="17.4" r="3" fill="#E8EAF0"/></g></svg>casualhub</a><a class="pill" href="/opinion/">${T.opinion}</a></div>
${body}
<p class="foot">${T.foot}</p>
</div></body></html>`;
}

function notFound(T) {
  return new Response(page(T, `${T.goneTitle} · ${T.site}`, `<main class="card empty"><h1>${T.goneTitle}</h1>
<p class="by">${T.gone}</p>
<div class="cta"><a class="btn primary" href="/opinion/">${T.open}</a><a class="btn ghost" href="/">${T.home}</a></div></main>`), { status: 404, headers: HEADERS });
}

export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  const id = String(params.id || '');
  const T = langOf(request);
  if (!SHARE_RE.test(id) || !env.DB) return notFound(T);
  if (tooFast(request.headers.get('CF-Connecting-IP') || 'local')) return new Response(T.wait, { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' } });
  let sh, user, r;
  try {
    sh = await env.DB.prepare('SELECT owner_id, rid FROM shares WHERE id = ?').bind(id).first();
    if (!sh) return notFound(T);
    user = await env.DB.prepare('SELECT username, uname, banned FROM users WHERE id = ?').bind(sh.owner_id).first();
    if (user && user.banned) return notFound(T); // отзывы забаненного по ссылке не открываются
    const shelf =readShelf(await env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(sh.owner_id).first());
    r = cleanRating(shelf.ratings.find((x) => x && x.id === sh.rid && !x.example));
  } catch (e) { return notFound(T); }
  if (!r || !user) return notFound(T);

  const origin = new URL(request.url).origin;
  const t = typeof r.total === 'number' ? r.total : null;
  const cat = word(T, r.catLabel || r.catName || '');
  const photo = r.photo && r.photo.remote ? `/api/share/${id}/img` : r.photo && r.photo.url && SAFE_URL.test(r.photo.url) ? r.photo.url : '';
  const when = (() => { const d = new Date(r.updatedAt || r.createdAt || 0); return isNaN(d) || !+d ? '' : d.toLocaleDateString(T.locale, { day: 'numeric', month: 'long', year: 'numeric' }); })();
  const scores = (r.scores || []).filter((s) => s && (s.v > 0 || s.note)).slice(0, 30);
  const pros = lines(r.pros), cons = lines(r.cons);
  const title = `${T.html === 'en' ? '“' : '«'}${r.name}${T.html === 'en' ? '”' : '»'} — ${t != null ? fmt(t, T) + ' ' + T.outOf : T.notRatedLow} · ${T.opinion}`;
  const desc = `${verdict(t, T)}${cat ? ' · ' + cat : ''} · ${T.ratingBy} ${user.username} (@${user.uname})`;
  const meta = [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${T.site}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(origin + '/r/' + id)}">`,
    photo ? `<meta property="og:image" content="${esc(photo.startsWith('/') ? origin + photo : photo)}">` : '',
    `<meta name="twitter:card" content="${photo ? 'summary_large_image' : 'summary'}">`,
  ].join('\n');

  const body = `<main class="card">
${photo ? `<img class="photo" src="${esc(photo)}" alt="" referrerpolicy="no-referrer">` : ''}
<div class="head"><h1>${esc(r.name)}</h1>
<div class="score"><span class="badge" data-tier="${tier(t)}">${t != null ? fmt(t, T) : '—'}</span><span class="verdict">${esc(verdict(t, T))}</span></div></div>
<div class="chips">${r.fav ? `<span class="chip">${T.fav}</span>` : ''}${cat ? `<span class="chip">${esc(cat)}</span>` : ''}${r.status ? `<span class="chip">${esc(word(T, r.status))}</span>` : ''}${r.meta ? `<span class="chip">${esc(r.meta)}</span>` : ''}</div>
<p class="by">${T.ratingByCap} <b>${esc(user.username)}</b> @${esc(user.uname)}${when ? ' · ' + esc(when) : ''}</p>
${scores.length ? `<section><p class="label">${T.crit}</p><ul class="crit">${scores.map((s) => `<li data-tier="${tierV(s.v)}"><span class="n">${esc(word(T, s.name))}</span><span class="v">${s.v || '—'}</span><span class="cells">${Array.from({ length: 10 }, (_, i) => `<i${i < s.v ? ' class="on"' : ''}></i>`).join('')}</span>${s.note ? `<span class="cnote">${esc(s.note)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}
${pros.length || cons.length ? `<section class="pc">${pros.length ? `<div><p class="label">${T.pros}</p><ul>${pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${cons.length ? `<div><p class="label">${T.cons}</p><ul>${cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</section>` : ''}
${r.note ? `<section><p class="label">${T.notes}</p><p class="note">${esc(r.note)}</p></section>` : ''}
<div class="cta"><a class="btn primary" href="/opinion/">${T.rate}</a><a class="btn ghost" href="/">${T.site}</a></div>
</main>`;
  return new Response(request.method === 'HEAD' ? null : page(T, title, body, meta), { headers: HEADERS });
}
