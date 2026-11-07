// Казуал Хаб: советы «Тебе может понравиться». Смотрим на оценки человека и ищем похожее:
//   фильмы, сериалы и мультфильмы — по Wikidata: общие темы, режиссёр, сценарист, франшиза, первоисточник и жанры;
//   игры — так же по Wikidata (студия, издатель, серия, жанры), обложки из Steam;
//   аниме — готовые рекомендации зрителей AniList;
//   друзья — то, что друзья оценили высоко, а у тебя этого нет.
// Ключи сервисов не нужны. Подбор долгий (Wikidata отвечает секундами), поэтому результат хранится сутки в таблице recs.

const UA = { 'user-agent': 'CasualHub/1.0 (+https://casualhub.pages.dev)' };
// Wikidata ограничивает одновременные запросы: на «подожди» (429) одна повторная попытка через пару секунд
const get = async (url, init, again) => {
  const res = await fetch(url, { ...(init || {}), signal: AbortSignal.timeout(15000), headers: { ...UA, accept: 'application/json', ...((init && init.headers) || {}) } });
  if (res.status === 429 && !again) { await new Promise((r) => setTimeout(r, 2500)); return get(url, init, true); }
  if (!res.ok) throw new Error('recs ' + res.status);
  return res.json();
};
const sparql = async (q) => ((await get('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { accept: 'application/sparql-results+json' } })).results || {}).bindings || [];
const QID = (u) => String(u).replace('http://www.wikidata.org/entity/', '');
const CYR = /[а-яё]/i;
// сравнение названий: без регистра, знаков и «ё»
export const titleKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
const yearOf = (meta) => { const m = /\b(19|20)\d{2}\b/.exec(String(meta || '')); return m ? +m[0] : 0; };
// категория оценки → что это
export function kindOf(cat) {
  const k = String(cat || '').toLowerCase();
  if (/аниме|манг|anime|manga/.test(k)) return 'anime';
  if (/игр|game/.test(k)) return 'game';
  if (/фильм|сериал|кино|мульт|film|movie|series|cartoon|animat/.test(k)) return 'movie';
  return '';
}

// ---------- Wikidata ----------
// название (русское или нет) → элемент Wikidata, у которого есть нужный код (IMDb, Steam, AniList); год из описания помогает выбрать
export async function wdFind(name, year, prop, trace) {
  const t = (x) => { if (trace) trace.push(x); };
  const lang = CYR.test(name) ? 'ru' : 'en';
  const s = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=8&language=${lang}&uselang=${lang}&search=${encodeURIComponent(name)}`);
  const ids = (s.search || []).map((x) => x.id).filter((id) => /^Q\d+$/.test(id)).slice(0, 8);
  t('search ' + ids.join(',') + (s.error ? ' error ' + JSON.stringify(s.error).slice(0, 120) : ''));
  if (!ids.length) return null;
  // только код и год, без карточек целиком: так ответ маленький
  let hits = [];
  try {
    const rows = await sparql(`SELECT ?i ?v (SAMPLE(YEAR(?d)) AS ?y) WHERE { VALUES ?i { ${ids.map((x) => 'wd:' + x).join(' ')} } ?i wdt:${prop} ?v. OPTIONAL { ?i wdt:P577|wdt:P580 ?d } } GROUP BY ?i ?v`);
    t('sparql ' + rows.length);
    hits = ids.map((id) => rows.find((r) => QID(r.i.value) === id)).filter(Boolean).map((r) => ({ q: QID(r.i.value), val: r.v.value, y: r.y ? +r.y.value : 0 }));
  } catch (e) { t('sparql ' + (e && e.message)); }
  // запасной путь: те же сведения по одному элементу через API Wikidata (ответы крошечные)
  if (!hits.length) {
    for (const id of ids.slice(0, 4)) {
      const c = await get(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${id}&property=${prop}`).catch((e) => { t('claims ' + (e && e.message)); return {}; });
      const v = (((c.claims || {})[prop] || [])[0] || {}).mainsnak;
      if (!v || !v.datavalue) continue;
      const d = await get(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${id}&property=P577`).catch(() => ({}));
      const tm = ((((d.claims || {}).P577 || [])[0] || {}).mainsnak || {}).datavalue;
      const y = tm && tm.value && /^[+-](\d{4})/.exec(tm.value.time || '');
      hits.push({ q: id, val: String(v.datavalue.value), y: y ? +y[1] : 0 });
      if (!year || (y && Math.abs(+y[1] - year) <= 1)) break;
    }
    t('claims ' + hits.length);
  }
  if (!hits.length) return null;
  const best = (year && hits.find((r) => r.y && Math.abs(r.y - year) <= 1)) || hits[0];
  t('best ' + best.q + ' ' + best.val + ' ' + best.y);
  return best;
}
// похожее на элемент: общие связи (редкая связь весит больше частой), потом общие жанры и известность
const W = { P921: 3, P57: 2, P58: 1, P179: 4, P144: 3, P178: 2, P123: 1, P162: 1 };
async function wdSimilar(seed, prop) {
  const s = await sparql(`SELECT ?p ?t WHERE { VALUES ?p { wdt:P921 wdt:P57 wdt:P58 wdt:P179 wdt:P144 wdt:P178 wdt:P123 wdt:P162 wdt:P136 } wd:${seed} ?p ?t }`);
  const links = s.map((x) => ({ p: x.p.value.split('/').pop(), t: QID(x.t.value) }));
  const genres = new Set(links.filter((l) => l.p === 'P136').map((l) => l.t));
  const vals = links.filter((l) => l.p !== 'P136').slice(0, 40).map((l) => `(wdt:${l.p} wd:${l.t})`).join(' ');
  if (!vals) return [];
  const f = await sparql(`SELECT ?f ?p ?t ?l WHERE { VALUES (?p ?t) { ${vals} } ?f ?p ?t; wdt:${prop} ?k; wikibase:sitelinks ?l. FILTER(?l > 12 && ?f != wd:${seed}) } LIMIT 2500`);
  const per = {}, score = {}, pop = {};
  f.forEach((x) => { const k = x.p.value + x.t.value; per[k] = (per[k] || 0) + 1; });
  f.forEach((x) => { const id = QID(x.f.value), p = x.p.value.split('/').pop(); score[id] = (score[id] || 0) + W[p] / Math.log2(2 + per[x.p.value + x.t.value]); pop[id] = +x.l.value; });
  const cand = Object.keys(score).sort((a, b) => score[b] - score[a] || pop[b] - pop[a]).slice(0, 45);
  if (!cand.length) return [];
  // названия, код, год и жанры кандидатов одним лёгким запросом
  const rows = await sparql(`SELECT ?f (SAMPLE(?c) AS ?code) (SAMPLE(?r0) AS ?ru) (SAMPLE(?e0) AS ?en) (SAMPLE(YEAR(?d)) AS ?year) (GROUP_CONCAT(DISTINCT ?g; separator=" ") AS ?gs) WHERE {
    VALUES ?f { ${cand.map((x) => 'wd:' + x).join(' ')} } ?f wdt:${prop} ?c.
    OPTIONAL { ?f rdfs:label ?r0 FILTER(lang(?r0) = "ru") } OPTIONAL { ?f rdfs:label ?e0 FILTER(lang(?e0) = "en") }
    OPTIONAL { ?f wdt:P577|wdt:P580 ?d } OPTIONAL { ?f wdt:P136 ?g } } GROUP BY ?f`);
  return rows.map((x) => {
    const id = QID(x.f.value);
    const g = new Set(String((x.gs && x.gs.value) || '').split(' ').filter(Boolean).map(QID));
    const gm = [...genres].filter((t) => g.has(t)).length;
    // без общего жанра похожесть случайная: такой кандидат почти не всплывает
    const r = ((score[id] || 0) + gm * 0.7) * (gm || !genres.size ? 1 : 0.25) + Math.log10(pop[id] || 1) * 0.3;
    return { code: String(x.code ? x.code.value : ''), ru: x.ru ? x.ru.value : '', en: x.en ? x.en.value : '', year: x.year ? +x.year.value : 0, r };
  }).filter((x) => x.code && (x.ru || x.en)).sort((a, b) => b.r - a.r).slice(0, 14);
}

// ---------- AniList ----------
const AL_REC = 'query($id:Int,$s:String){Media(id:$id,search:$s,type:ANIME){id title{romaji english} recommendations(sort:RATING_DESC,perPage:12){nodes{rating mediaRecommendation{id type title{romaji english} seasonYear coverImage{large} isAdult}}}}}';
async function aniRecs(name, year) {
  let id = null, search = null;
  if (CYR.test(name)) { const w = await wdFind(name, year, 'P8729').catch(() => null); if (w) id = +w.val; }
  if (!id) search = name;
  const d = await get('https://graphql.anilist.co', { method: 'POST', body: JSON.stringify({ query: AL_REC, variables: { id, s: search } }), headers: { 'content-type': 'application/json' } });
  const m = d && d.data && d.data.Media;
  if (!m) return [];
  return m.recommendations.nodes.map((n) => n.mediaRecommendation).filter((x) => x && x.type === 'ANIME' && !x.isAdult).map((x, i) => ({
    code: String(x.id), ru: '', en: (x.title.english || x.title.romaji || '').slice(0, 140), year: x.seasonYear || 0, art: x.coverImage && x.coverImage.large || '', r: 12 - i,
  }));
}

// ---------- обложки ----------
async function imdbArt(tt) {
  try {
    const d = await get(`https://v3.sg.media-imdb.com/suggestion/x/${tt}.json`);
    const it = (d.d || []).find((x) => x.id === tt);
    return it && it.i && it.i.imageUrl ? it.i.imageUrl.replace(/\._V1_[^/]*\.jpg$/, '._V1_QL80_UX400_.jpg') : '';
  } catch (e) { return ''; }
}
const steamArt = (id) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`;

// ---------- подбор ----------
// семена: что человеку зашло (балл от 7,5) или во что он сейчас погружён; по два на вид — Wikidata отвечает медленно
function seedsOf(ratings, kind, n) {
  return ratings.filter((r) => r && r.name && kindOf(r.catLabel || r.catName) === kind && (r.total >= 7.5 || /В процессе/.test(r.status || '')))
    .sort((a, b) => (b.total || 7) - (a.total || 7) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, n);
}
// mine — ключи названий, что уже есть у человека; hidden — убранные им советы
export async function computeRecs({ ratings, friends, hidden }) {
  const mine = new Set(ratings.map((r) => titleKey(r.name)));
  const hide = new Set(hidden || []);
  const out = { at: Date.now(), movie: [], game: [], anime: [], friends: [] };
  const merge = (list, seed, kind, add) => {
    const total = typeof seed.total === 'number' ? seed.total : 8;
    for (const x of list) {
      const key = kind + ':' + x.code;
      if (hide.has(key) || mine.has(titleKey(x.ru)) || mine.has(titleKey(x.en))) continue;
      const have = add.get(key);
      const r = x.r * (total / 10);
      if (have) { have.r += r; if (!have.why2 && have.why !== seed.name) have.why2 = seed.name; continue; }
      add.set(key, { key, kind, code: x.code, title: x.ru || x.en, orig: x.ru && x.en && x.ru !== x.en ? x.en : '', year: x.year || 0, art: x.art || '', why: seed.name, cat: seed.catLabel || seed.catName || '', r });
    }
  };
  const run = async (kind, prop, n) => {
    const add = new Map();
    for (const seed of seedsOf(ratings, kind, n)) {
      try {
        if (kind === 'anime') { merge(await aniRecs(seed.name, yearOf(seed.meta)), seed, kind, add); continue; }
        const w = await wdFind(seed.name, yearOf(seed.meta), prop);
        if (w) merge(await wdSimilar(w.q, prop), seed, kind, add);
      } catch (e) {}
    }
    return [...add.values()].sort((a, b) => b.r - a.r).slice(0, 10);
  };
  // аниме — AniList, его спрашиваем параллельно; фильмы и игры — Wikidata, по очереди
  const animeP = run('anime', '', 3);
  const movie = await run('movie', 'P345', 2);
  const game = await run('game', 'P1733', 2);
  const anime = await animeP;
  // обложки: фильмы — из IMDb (по коду), игры — из Steam
  await Promise.all(movie.slice(0, 8).map(async (x) => { x.art = await imdbArt(x.code); }));
  game.forEach((x) => { x.art = steamArt(x.code); });
  out.movie = movie.filter((x) => x.art || movie.length < 4);
  out.game = game;
  out.anime = anime;
  // друзья: оценили на 8 и выше, у тебя этого нет; чем больше друзей так считают, тем выше
  const fr = new Map();
  for (const f of friends || []) {
    for (const r of f.ratings || []) {
      if (!r || !r.name || r.vis === 'private' || !(r.total >= 8) || !kindOf(r.catLabel || r.catName)) continue;
      const k = titleKey(r.name);
      if (!k || mine.has(k) || hide.has('f:' + k)) continue;
      const have = fr.get(k);
      const who = { id: f.user.id, name: f.user.username, handle: f.user.handle || '', total: r.total, rid: r.id };
      if (have) { have.by.push(who); have.r += r.total; continue; }
      fr.set(k, { key: 'f:' + k, kind: kindOf(r.catLabel || r.catName), title: String(r.name).slice(0, 140), year: yearOf(r.meta), meta: String(r.meta || '').slice(0, 80), cat: r.catLabel || r.catName || '', art: r.photo && r.photo.url ? r.photo.url : '', remote: !!(r.photo && r.photo.remote), by: [who], r: r.total });
    }
  }
  out.friends = [...fr.values()].sort((a, b) => b.by.length - a.by.length || b.r - a.r).slice(0, 12);
  return out;
}
// отпечаток семян: поменялись любимые оценки — советы пересчитываются раньше, чем через сутки
export function seedSig(ratings) {
  return ['movie', 'game', 'anime'].map((k) => seedsOf(ratings, k, k === 'anime' ? 3 : 2).map((r) => titleKey(r.name)).join(',')).join('|');
}
