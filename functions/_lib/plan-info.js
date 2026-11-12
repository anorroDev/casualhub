// Казуал Хаб: описание и трейлер для карточки в «В планах» на колесе (wheel/app.js → planCard).
// Описание — из русской Википедии (поиск по названию, году и виду: фильм, сериал, игра…), не нашлось — из английской.
// Статья подходит, только если её название или первые строки называют то же самое (иначе описание чужого фильма хуже никакого).
// Трейлер: у фильмов и сериалов с кодом IMDb — ролик IMDb (подсказки IMDb с includeVideos отдают трейлеры), и ещё — первый
// ролик YouTube по запросу «<название> <год> трейлер» (обычно русский; тот же поиск YouTube, что у музыки, без ключа).
// Ответы хранятся в базе (plan_info): найденное — месяц, ненайденное — три дня. Таблица — кэш, в копию не идёт (rt/backup.js, SKIP).
const MONTH = 30 * 864e5, MISS = 3 * 864e5;
const UA = { 'user-agent': 'CasualHub/1.0 (+https://casualhub.pages.dev)', accept: 'application/json' };
const YT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';
export const KINDS = ['movie', 'series', 'game', 'anime', 'book'];
const WORD = { ru: { movie: 'фильм', series: 'сериал', game: 'игра', anime: 'аниме', book: 'книга' }, en: { movie: 'film', series: 'TV series', game: 'video game', anime: 'anime', book: 'novel' } };

let made = null;
async function table(env) {
  if (made === env.DB) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS plan_info (k TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL)').run();
  made = env.DB;
}
const get = async (url, init = {}) => {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('info ' + r.status);
  return r.json();
};
export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
// суть названия: до двоеточия, тире или скобки («Призрак Цусимы: Режиссёрская версия» → «призрак цусимы»)
export const coreOf = (name) => norm(String(name || '').split(/[:—–(|]/)[0]) || norm(name);
// подходит ли статья: название или начало текста называет то же самое
export const fits = (core, title, extract) => !!core && (norm(title).includes(core) || norm(String(extract || '').slice(0, 400)).includes(core));

async function wiki(lang, name, year, kind) {
  const q = [name, year || '', WORD[lang][kind] || ''].filter(Boolean).join(' ');
  const s = await get(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srprop=&srsearch=${encodeURIComponent(q)}`);
  const hits = ((s.query && s.query.search) || []).map((x) => x.title).filter(Boolean);
  const core = coreOf(name);
  // сначала — статьи, где название совпадает; читаем не больше двух
  const order = [...hits.filter((t) => norm(t).includes(core)), ...hits.filter((t) => !norm(t).includes(core))].slice(0, 2);
  for (const t of order) {
    const d = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`).catch(() => null);
    if (!d || d.type === 'disambiguation' || !d.extract || !fits(core, d.title || t, d.extract)) continue;
    return { desc: String(d.extract).replace(/\s+/g, ' ').trim().slice(0, 1400), src: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || '', lang };
  }
  return null;
}
// трейлер IMDb по коду фильма: из подсказок IMDb (includeVideos=1) — ролик со словом trailer, иначе первый
async function imdbVideo(id) {
  const d = await get(`https://v3.sg.media-imdb.com/suggestion/x/${id}.json?includeVideos=1`);
  const it = (d.d || []).find((x) => x && x.id === id);
  const vs = ((it && it.v) || []).filter((v) => v && /^vi\d{5,12}$/.test(v.id || ''));
  const pick = vs.find((v) => /trailer/i.test(v.l || '')) || vs[0];
  return pick ? { id: pick.id, title: String(pick.l || '').slice(0, 120) } : null;
}
async function trailer(name, year, kind) {
  const q = [name, year || '', kind === 'game' ? 'трейлер игры' : 'трейлер'].filter(Boolean).join(' ');
  const d = await get('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.youtube.com', 'user-agent': YT_UA },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20240814.00.00', hl: 'ru', gl: 'RU' } }, query: q }),
  });
  let hit = null;
  const walk = (o, depth) => {
    if (hit || !o || typeof o !== 'object' || depth > 30) return;
    const v = o.videoRenderer;
    if (v && /^[\w-]{11}$/.test(v.videoId || '')) { hit = { id: v.videoId, title: ((v.title || {}).runs || []).map((r) => r.text).join('').slice(0, 140) }; return; }
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  walk(d, 0);
  return hit;
}

export function makePlanInfoRoutes(h) {
  const { json, fail } = h;
  return {
    // описание и трейлер: ?name=&year=&kind=movie|series|game|anime|book (иначе — «другое», без трейлера)&imdb=tt…
    // (код IMDb — для трейлера с IMDb). Открыт без входа, как IMDb
    async 'GET /plan/info'({ env, request }) {
      if (h.burst && h.burst('planinfo:' + (h.clientIp ? h.clientIp(request) : ''), 60, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const sp = new URL(request.url).searchParams;
      const name = String(sp.get('name') || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      const year = /^(19|20)\d{2}$/.test(sp.get('year') || '') ? +sp.get('year') : 0;
      const kind = KINDS.includes(sp.get('kind')) ? sp.get('kind') : 'other';
      const imdb = /^tt\d{5,10}$/.test(sp.get('imdb') || '') ? sp.get('imdb') : '';
      if (norm(name).length < 2) return fail(400, 'Нужно название.');
      await table(env);
      const k = `${kind}|${norm(name)}|${year || ''}|${imdb}`, now = Date.now();
      const row = await env.DB.prepare('SELECT data, at FROM plan_info WHERE k = ?').bind(k).first();
      if (row) {
        let d = null;
        try { d = JSON.parse(row.data); } catch (e) {}
        if (d && now - row.at < (d.desc || d.trailer || d.iv ? MONTH : MISS)) return json(d);
      }
      let failed = false; // сбой источника (тайм-аут, 429) — не «не нашлось»: такой ответ не запоминаем
      const safe = (p) => (p ? p.catch(() => { failed = true; return null; }) : null);
      const [ru, yt, iv] = await Promise.all([safe(wiki('ru', name, year, kind)), kind === 'other' ? null : safe(trailer(name, year, kind)), imdb ? safe(imdbVideo(imdb)) : null]);
      const w = ru || (await safe(wiki('en', name, year, kind)));
      const d = { desc: w ? w.desc : '', src: w ? w.src : '', lang: w ? w.lang : '', trailer: yt ? yt.id : '', ttitle: yt ? yt.title : '', iv: iv ? iv.id : '', ivt: iv ? iv.title : '' };
      if (!failed && (d.desc || d.trailer || d.iv)) {
        await env.DB.prepare('INSERT INTO plan_info (k, data, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET data = ?2, at = ?3').bind(k, JSON.stringify(d), now).run();
        if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM plan_info WHERE at < ?').bind(now - 2 * MONTH).run();
      }
      return json(d);
    },
  };
}
