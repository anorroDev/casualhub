// Казуал Хаб: рейтинг IMDb у фильмов и сериалов. Оценки отдаёт OMDb (omdbapi.com) по коду IMDb; ключ — секрет OMDB_KEY.
// Код фильма по названию ищем сами: латиницей — в подсказках IMDb, по-русски — в Wikidata (у фильмов там есть код IMDb).
// Бесплатно OMDb даёт 1000 запросов в день, поэтому всё хранится в базе: рейтинг — неделю, найденный код — месяц.
import { titleKey, wdFind } from './recs.js';

const UA = { 'user-agent': 'CasualHub/1.0 (+https://casualhub.pages.dev)', accept: 'application/json' };
const TT = /^tt\d{5,10}$/;
const CYR = /[а-яё]/i;
const WEEK = 7 * 864e5, MONTH = 30 * 864e5;
let made = false;
async function tables(env) {
  if (made) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS imdb_info (id TEXT PRIMARY KEY, data TEXT, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS imdb_find (k TEXT PRIMARY KEY, id TEXT, at INTEGER NOT NULL)'),
  ]);
  made = true;
}
const get = async (url) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('imdb ' + r.status);
  return r.json();
};
// название → код IMDb: год из описания помогает выбрать среди одноимённых
// год известен — подходит только фильм того же года (±1): чужой рейтинг хуже, чем никакого
const yearOk = (y, year) => !year || (y && Math.abs(y - year) <= 1);
async function findId(name, year) {
  const wd = async () => { const w = await wdFind(name, year, 'P345').catch(() => null); return w && TT.test(w.val) && yearOk(w.y, year) ? w.val : ''; };
  if (CYR.test(name)) return wd();
  const d = await get(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(name.toLowerCase().slice(0, 80))}.json`);
  const list = (d.d || []).filter((x) => x && TT.test(x.id) && /movie|tvSeries|tvMiniSeries|tvMovie|video|tvSpecial|short/.test(x.qid || ''));
  const k = titleKey(name);
  const same = list.filter((x) => titleKey(x.l) === k);
  const pick = year ? same.find((x) => yearOk(x.y, year)) || list.find((x) => yearOk(x.y, year)) : same[0] || list[0];
  return pick ? pick.id : wd();
}
const num = (v) => { const n = parseFloat(String(v || '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
async function omdb(env, id) {
  const d = await get(`https://www.omdbapi.com/?i=${id}&apikey=${encodeURIComponent(env.OMDB_KEY)}`);
  if (!d || d.Response !== 'True') return { id, none: true };
  const by = (src) => ((d.Ratings || []).find((x) => x && x.Source === src) || {}).Value || '';
  return { id, r: num(d.imdbRating), v: num(d.imdbVotes), rt: by('Rotten Tomatoes').replace(/[^\d%]/g, '').slice(0, 5), mc: num(d.Metascore), type: d.Type === 'series' ? 'series' : 'movie' };
}
// items: [{ k, id?, name, year }] → { [k]: { id, r, v, rt, mc } | null }. За один раз ищем не больше 8 кодов и спрашиваем OMDb не больше 15 раз
export async function imdbLookup(env, items) {
  await tables(env);
  const out = {}, now = Date.now();
  const list = items.slice(0, 40).map((x) => ({ k: String(x.k || '').slice(0, 200), id: TT.test(x.id || '') ? x.id : '', name: String(x.name || '').trim().slice(0, 140), year: +x.year || 0 })).filter((x) => x.k && (x.id || x.name));
  let finds = 0, asks = 0;
  for (const x of list) {
    if (x.id) continue;
    const fk = titleKey(x.name) + '|' + (x.year || '');
    const row = await env.DB.prepare('SELECT id, at FROM imdb_find WHERE k = ?').bind(fk).first();
    if (row && now - row.at < MONTH) { x.id = row.id || ''; continue; }
    if (finds >= 8) { x.later = true; continue; }
    finds++;
    try { x.id = await findId(x.name, x.year); } catch (e) { x.later = true; continue; }
    await env.DB.prepare('INSERT INTO imdb_find (k, id, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET id = ?2, at = ?3').bind(fk, x.id, now).run();
  }
  for (const x of list) {
    if (!x.id) { out[x.k] = x.later ? undefined : null; continue; }
    const row = await env.DB.prepare('SELECT data, at FROM imdb_info WHERE id = ?').bind(x.id).first();
    if (row && now - row.at < WEEK) { const d = JSON.parse(row.data); out[x.k] = d.none ? null : d; continue; }
    if (!env.OMDB_KEY || asks >= 15) { out[x.k] = row ? JSON.parse(row.data) : undefined; continue; }
    asks++;
    try {
      const d = await omdb(env, x.id);
      await env.DB.prepare('INSERT INTO imdb_info (id, data, at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = ?2, at = ?3').bind(x.id, JSON.stringify(d), now).run();
      out[x.k] = d.none ? null : d;
    } catch (e) { out[x.k] = row ? JSON.parse(row.data) : undefined; }
  }
  // undefined — «ещё не знаем, спроси позже», null — «у этого фильма рейтинга нет»
  return out;
}
