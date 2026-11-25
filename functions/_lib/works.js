// Казуал Хаб: поиск произведения для «Новой оценки» в Мнении — по названию и по автору одной строкой (GET /api/works).
// Книги — Open Library (ищет и по автору; по-русски берёт русское издание), аниме и манга — AniList (тайтлы, авторы
// и студии одним запросом), 18+ — те же источники, что у обложек, фильмы, сериалы и мультфильмы — IMDb (названия и люди)
// и Wikidata (фильмы человека, русские названия), игры — Steam и Wikidata (игры разработчика), заведения — OpenStreetMap
// (Photon), техника — Wikidata. Всё идёт через наш сервер (браузеру чужие сайты запрещает CSP), ответы кэшируются.
// findWorks отдаёт { items, src }: до 12 штук { id, title, ru, by, sub, note, year, art, thumb, alt, tall, genres }.
//   title — название из источника, ru — русское (искали по-русски и оно нашлось), by — автор, студия, режиссёр или
//   разработчик, sub — вид («Книга», «Манга», «Кафе»), note — адрес или описание, id — код для /covers/info
//   (IMDb у фильмов, Steam у игр, MyAnimeList у 18+). Зависимости передаёт API (d): get — cachedJson, cover — поиск
//   обложек, latin — английские названия для русского запроса, translit, steam — карточки Steam, genres — жанры по-русски,
//   lang — язык сайта (ru, uk, en), geo — примерное место человека для заведений (или null).
export const WORK_KINDS = ['book', 'anime', 'hentai', 'movie', 'game', 'food', 'tech'];
// подпись под списком — только названия источников, без русских слов: её переводит шаблон «Источник: {}»
export const WORK_SRC = { book: 'Open Library', anime: 'AniList', hentai: 'AniList, MyAnimeList, Shikimori', movie: 'IMDb, Wikidata', game: 'Steam, Wikidata', food: '© OpenStreetMap', tech: 'Wikidata' };
export const IMDB_KIND = { movie: 'Фильм', tvMovie: 'Фильм', video: 'Фильм', tvSeries: 'Сериал', tvMiniSeries: 'Мини-сериал', short: 'Короткий метр', tvSpecial: 'Спецвыпуск' };
const ANI_KIND = { TV: 'Аниме', TV_SHORT: 'Аниме', MOVIE: 'Аниме-фильм', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Спецвыпуск', MUSIC: 'Клип', MANGA: 'Манга', ONE_SHOT: 'Манга', NOVEL: 'Ранобэ' };
const FOOD_TAGS = ['amenity:restaurant', 'amenity:cafe', 'amenity:fast_food', 'amenity:bar', 'amenity:pub', 'amenity:food_court', 'amenity:ice_cream', 'shop:bakery', 'shop:confectionery', 'shop:pastry'];
const FOOD_KIND = { restaurant: 'Ресторан', cafe: 'Кафе', fast_food: 'Фастфуд', bar: 'Бар', pub: 'Паб', food_court: 'Фудкорт', ice_cream: 'Мороженое', bakery: 'Пекарня', confectionery: 'Кондитерская', pastry: 'Кондитерская' };
// техника в Wikidata: что-то из этого есть в описании («смартфон компании Apple», «игровая приставка»)
const TECH_RE = /смартфон|телефон|планшет|ноутбук|компьют|комп['ʼ’]ютер|приставк|консол|наушник|навушник|гарнитур|часы|годинник|камер|фотоаппарат|телевиз|телевіз|монитор|монітор|процессор|процесор|видеокарт|відеокарт|колонк|плеер|плеєр|электрон|електрон|устройств|пристр[оі]|гаджет|ґаджет|дрон|роутер|маршрутизатор|клавиатур|клавіатур|мыш|миш[аі]|геймпад|контроллер|контролер|smartphone|phone|tablet|laptop|notebook|computer|console|headphone|earbud|headset|watch|camera|television|\btv\b|monitor|processor|\b[cg]pu\b|graphics card|speaker|player|electronic|device|gadget|drone|router|keyboard|mouse|controller|gamepad|e-?reader/i;
// …но не игры, студии и прочее, где те же слова: «компьютерная игра 2012 года», «группа разработчиков компьютерных игр»
const TECH_NOT = /компьютерн\S* игр|комп['ʼ’]ютерн\S* гр|видеоигр|відеогр|video game|computer game|разработчик|розробник|developer|издател|видавець|publisher|сериал|серіал|фильм|фільм|\bfilm\b|альбом|album|песн|пісн|\bsong\b/i;
const isTech = (desc) => TECH_RE.test(desc || '') && !TECH_NOT.test(desc || '');
const CYR = /[а-яёіїєґ]/i;
const LAT = /[a-z]/i;
const enc = encodeURIComponent;
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const https = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '');
export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zа-яіїєґ0-9]+/gi, ' ').trim();
// каждое слово запроса начинает слово в имени: «nolan» → Christopher Nolan, «ghibli» → Studio Ghibli
export const nameHit = (name, q) => {
  const n = ' ' + norm(name) + ' ', w = norm(q).split(' ').filter(Boolean);
  return w.length > 0 && w.every((x) => n.includes(' ' + x));
};
// название совпало с запросом целиком («Naruto»). Только начало не считается: «Miyazaki-san ka no Miyazaki» не должно
// оттеснять работы Хаяо Миядзаки, а «FromSoftware Tribute» — игры FromSoftware
const titleHit = (t, q) => { const b = norm(q); return !!b && norm(t) === b; };
const blank = (o) => ({ id: '', title: '', ru: '', by: '', sub: '', note: '', year: '', art: '', thumb: '', alt: '', tall: false, genres: [], ...o });
// карточка из поиска обложек (/covers): у неё нет автора
const fromCover = (c) => blank({ id: String(c.id || ''), title: clip(c.title, 140), ru: clip(c.ru, 140), sub: clip(c.sub, 30), year: clip(c.year, 4), art: https(c.art), thumb: https(c.thumb) || https(c.art), alt: https(c.alt), tall: !!c.tall, genres: Array.isArray(c.genres) ? c.genres.slice(0, 6) : [] });
// одно и то же произведение дважды не показываем: по коду, а без кода — по названию и автору
function dedupe(list) {
  const out = [], seen = new Map();
  for (const c of list) {
    if (!c || !c.title) continue;
    const k = c.id ? 'id:' + c.id : norm(c.ru || c.title) + '|' + norm(String(c.by || '').split(',')[0]);
    const was = seen.get(k);
    if (was) { if (!was.art && c.art) Object.assign(was, { art: c.art, thumb: c.thumb, alt: c.alt, tall: c.tall }); continue; }
    seen.set(k, c);
    out.push(c);
  }
  return out;
}
// кого первым: запрос совпал с названием — сначала найденные по названию, иначе — работы найденного автора
export function ordered(titles, works, q) {
  const exact = titles.some((t) => titleHit(t.title, q) || (t.ru && titleHit(t.ru, q)));
  return dedupe(exact || !works.length ? [...titles, ...works] : [...works, ...titles]);
}
async function wdSearch(q, lang, d, limit = 8) {
  const s = await d.get(`https://www.wikidata.org/w/api.php?format=json&action=wbsearchentities&type=item&limit=${limit}&language=${lang}&uselang=${lang}&search=${enc(q)}`, null, 604800);
  return ((s && s.search) || []).filter((x) => x && /^Q\d+$/.test(x.id)).map((x) => ({ id: x.id, label: clip(x.label, 140), desc: String(x.description || '') }));
}
async function sparql(query, d) {
  const r = await d.get('https://query.wikidata.org/sparql?format=json&query=' + enc(query), { headers: { accept: 'application/sparql-results+json' } }, 604800);
  return (r && r.results && r.results.bindings) || [];
}
const qidOf = (uri) => String(uri || '').split('/').pop();
const val = (b, k) => (b && b[k] && typeof b[k].value === 'string' ? b[k].value : '');

// ---------- книги ----------
// русское название из названия работы или издания: «Война и мир / Voĭna i mir» → «Война и мир», «Казаки (Kazaki)» → «Казаки»
export function cyrTitle(...list) {
  for (const t of list) {
    for (const part of String(t || '').split(/\s+[/=]\s+|\s*[()]\s*/)) {
      const v = part.replace(/^["«„“\s]+|["»“”\s]+$/g, '').trim();
      if (v && CYR.test(v) && !LAT.test(v)) return v.length > 3 && v === v.toUpperCase() ? v.charAt(0) + v.slice(1).toLowerCase() : v;
    }
  }
  return '';
}
export function bookItems(d, cyr, lang3 = 'rus') {
  const out = [];
  for (const b of (d && d.docs) || []) {
    if (!b || !b.title) continue;
    const ed = ((b.editions && b.editions.docs) || [])[0] || {};
    const ru = cyr ? cyrTitle(b.title, ed.title) : '';
    // по-русски (по-украински) — обложка издания на этом языке, если она есть
    const edOwn = cyr && Number.isInteger(ed.cover_i) && Array.isArray(ed.language) && ed.language.includes(lang3);
    const cover = edOwn ? ed.cover_i : Number.isInteger(b.cover_i) ? b.cover_i : Number.isInteger(ed.cover_i) ? ed.cover_i : 0;
    const by = clip([...new Set(b.author_name || [])].slice(0, 2).join(', '), 80); // в Open Library автор бывает записан дважды
    if (!cover && !by) continue; // без обложки и без автора — обычно сборники и статьи
    out.push(blank({ title: clip(b.title, 140), ru: clip(ru, 140), by, sub: 'Книга', year: Number.isInteger(b.first_publish_year) ? String(b.first_publish_year) : '',
      art: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : '', thumb: cover ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : '', tall: true }));
  }
  return dedupe(out);
}
// key нужен, хотя мы его не читаем: без него Open Library не подбирает к работе издание (editions пустые)
const OL_F = 'key,title,author_name,first_publish_year,cover_i,editions,editions.title,editions.language,editions.cover_i';

// ---------- аниме и манга ----------
const AL_M = 'id type format isAdult title{romaji english} startDate{year} genres coverImage{extraLarge large} studios(isMain:true){nodes{name}} staff(perPage:4,sort:RELEVANCE){edges{role node{name{full}}}}';
// тайтлы, человек (автор, режиссёр) и студия — одним запросом
const AL_Q = `query($s:String){m:Page(perPage:8){media(search:$s,sort:SEARCH_MATCH,isAdult:false){${AL_M}}}`
  + `p:Page(perPage:1){staff(search:$s,sort:SEARCH_MATCH){name{full native}staffMedia(perPage:10,sort:POPULARITY_DESC){nodes{${AL_M}}}}}`
  + `s:Page(perPage:1){studios(search:$s,sort:SEARCH_MATCH){name media(perPage:10,sort:POPULARITY_DESC,isMain:true){nodes{${AL_M}}}}}}`;
function aniCard(m, genres) {
  const manga = m.type === 'MANGA';
  const author = (((m.staff && m.staff.edges) || []).find((e) => e && /story|art|original creator/i.test(e.role || '')) || {}).node;
  const studio = ((m.studios && m.studios.nodes) || [])[0];
  const img = m.coverImage || {};
  return blank({ title: clip((m.title && (m.title.english || m.title.romaji)) || '', 140), by: clip(manga ? author && author.name && author.name.full : studio && studio.name, 80),
    sub: ANI_KIND[m.format] || (manga ? 'Манга' : 'Аниме'), year: m.startDate && m.startDate.year ? String(m.startDate.year) : '',
    art: https(img.extraLarge) || https(img.large), thumb: https(img.large) || https(img.extraLarge), tall: true, genres: genres(m.genres || []) });
}
export function aniItems(data, s, genres = () => []) {
  const ok = (m) => m && !m.isAdult && m.title;
  const titles = (((data && data.m && data.m.media) || []).filter(ok)).map((m) => aniCard(m, genres));
  const works = [];
  const p = ((data && data.p && data.p.staff) || [])[0];
  if (p && p.name && [p.name.full, p.name.native].some((n) => n && nameHit(n, s))) {
    works.push(...((p.staffMedia && p.staffMedia.nodes) || []).filter(ok).map((m) => ({ ...aniCard(m, genres), by: clip(p.name.full, 80) })));
  }
  const st = ((data && data.s && data.s.studios) || [])[0];
  if (st && st.name && nameHit(st.name, s)) works.push(...((st.media && st.media.nodes) || []).filter(ok).map((m) => ({ ...aniCard(m, genres), by: clip(st.name, 80) })));
  return { titles, works };
}
// по-русски AniList не ищет: сначала английские названия и имена (Wikidata, Википедия), потом транслит
async function latinOf(q, kind, d) {
  if (!CYR.test(q)) return [q];
  const t = await d.latin(q, kind).catch(() => []);
  return t.length ? t.slice(0, 2) : [d.translit(q)];
}

// ---------- фильмы ----------
const imdbArt = (u) => String(u || '').replace(/\._V1_[^/]*\.jpg$/, '._V1_QL80_UX600_.jpg');
function imdbCard(i) {
  const art = https(imdbArt(i.i && i.i.imageUrl));
  return blank({ id: i.id, title: clip(i.l, 140), by: clip(i.s, 80), sub: IMDB_KIND[i.qid] || 'Фильм', year: i.y ? String(i.y) : '', art, thumb: art ? art.replace('UX600', 'UX240') : '', tall: true });
}
// язык названий из Wikidata: русский или украинский сайт — на нём, английский — без перевода
const labelLang = (d) => (d.lang === 'uk' ? 'uk' : d.lang === 'en' ? '' : 'ru');
// фильмы человека: режиссёр, сценарист или актёр, самые известные (больше всего статей в Википедиях) первыми.
// ru — название на языке сайта (ru или uk), en — английское
const FILMS_OF = (nm, lang) => `SELECT ?imdb ?links (SAMPLE(?r) AS ?ru) (SAMPLE(?e) AS ?en) (MIN(?dt) AS ?date) WHERE { ?p wdt:P345 "${nm}". `
  + '?f wdt:P57|wdt:P58|wdt:P161 ?p; wdt:P345 ?imdb; wikibase:sitelinks ?links. FILTER(STRSTARTS(?imdb, "tt")) '
  + (lang ? `OPTIONAL { ?f rdfs:label ?r FILTER(lang(?r) = "${lang}") } ` : '')
  + 'OPTIONAL { ?f rdfs:label ?e FILTER(lang(?e) = "en") } OPTIONAL { ?f wdt:P577 ?dt } } '
  + 'GROUP BY ?imdb ?links ORDER BY DESC(?links) LIMIT 8';
// по-русски (по-украински) подсказки IMDb не понимают: полнотекстовый поиск Wikidata по тому, у чего есть код IMDb
// (фильмы и люди) — он находит и «Нолан», и «Зелёная миля». Отдаёт [{ imdb, label }] в порядке поиска
async function wdImdb(q, lang, d) {
  const s = await d.get(`https://www.wikidata.org/w/api.php?format=json&action=query&list=search&srlimit=8&srprop=&srsearch=${enc(q + ' haswbstatement:P345')}`, null, 604800);
  const ids = ((s && s.query && s.query.search) || []).map((x) => x && x.title).filter((t) => /^Q\d+$/.test(t || ''));
  if (!ids.length) return [];
  const rows = await sparql(`SELECT ?item ?imdb ?l WHERE { VALUES ?item { ${ids.map((i) => 'wd:' + i).join(' ')} } ?item wdt:P345 ?imdb. `
    + `OPTIONAL { ?item rdfs:label ?l FILTER(lang(?l) = "${lang}") } }`, d);
  const got = new Map();
  for (const b of rows) { const id = qidOf(val(b, 'item')); if (!got.has(id)) got.set(id, { imdb: val(b, 'imdb'), label: clip(val(b, 'l'), 140) }); }
  return ids.map((id) => got.get(id)).filter((x) => x && /^(tt|nm)\d+$/.test(x.imdb));
}
// карточка фильма по коду IMDb: подсказки IMDb понимают и сам код
// null — IMDb не ответил, false — это не фильм и не сериал (игра, эпизод, клип): такое не показываем
async function imdbById(tt, d) {
  const r = await d.get(`https://v3.sg.media-imdb.com/suggestion/t/${tt}.json`, null, 604800).catch(() => null);
  const i = ((r && r.d) || []).find((x) => x && x.id === tt);
  return i ? (IMDB_KIND[i.qid] ? imdbCard(i) : false) : null;
}

// ---------- поиск по видам ----------
const FIND = {
  async book(q, d) {
    const cyr = CYR.test(q);
    const lang = d.lang === 'uk' ? 'uk' : 'ru';
    // Open Library временами думает дольше 6 секунд: ей — до 10
    const r = await d.get(`https://openlibrary.org/search.json?limit=16&fields=${OL_F}${cyr ? '&lang=' + lang : ''}&q=${enc(q)}`, { wait: 10000 }, 86400);
    return bookItems(r, cyr, lang === 'uk' ? 'ukr' : 'rus');
  },
  async anime(q, d) {
    const titles = [], works = [];
    let ok = false;
    const qs = await latinOf(q, 'anime', d);
    for (const s of qs) {
      try {
        const r = await d.get('https://graphql.anilist.co', { method: 'POST', body: JSON.stringify({ query: AL_Q, variables: { s } }), headers: { 'content-type': 'application/json' } }, 86400);
        if (!r || !r.data) continue;
        ok = true;
        const got = aniItems(r.data, s, d.genres);
        titles.push(...got.titles);
        works.push(...got.works);
      } catch (e) {}
    }
    // AniList не ответил (с адресов Cloudflare бывает 403 и 429) — тайтлы из Kitsu и MyAnimeList, как у обложек
    if (!ok) titles.push(...(await d.cover('anime', q).catch(() => [])).map(fromCover));
    return ordered(titles, works, qs[0] || q);
  },
  async hentai(q, d) {
    return dedupe((await d.cover('hentai', q).catch(() => [])).map(fromCover));
  },
  // Запросов наружу немного (бесплатный план — до 50 на запрос, у каждого ещё чтение и запись кэша): подсказки IMDb,
  // по-русски — поиск Wikidata (2), до 3 карточек найденных там фильмов и до 8 фильмов человека (Wikidata + IMDb)
  async movie(q, d) {
    const cyr = CYR.test(q);
    // подсказки IMDb и (по-русски) поиск Wikidata — параллельно: каждый может думать до 6 секунд.
    // По-русски Wikidata знает названия фильмов и имена людей на языке сайта, а код IMDb — у тех и других
    const [sug, wd] = await Promise.all([
      d.get(`https://v3.sg.media-imdb.com/suggestion/x/${enc(q.toLowerCase())}.json`, null, 86400).catch(() => null),
      cyr ? wdImdb(q, d.lang === 'uk' ? 'uk' : 'ru', d).catch(() => []) : Promise.resolve([]),
    ]);
    const list = (sug && sug.d) || [];
    let titles = list.filter((i) => i && /^tt\d+$/.test(i.id) && IMDB_KIND[i.qid]).map(imdbCard).filter((c) => c.art);
    let person = null;
    const ruOf = new Map();
    if (!cyr) {
      const p = list.find((i) => i && /^nm\d+$/.test(i.id) && nameHit(i.l, q));
      if (p) person = { nm: p.id, name: clip(p.l, 80) };
    } else {
      const films = [];
      for (const h of wd) {
        if (/^nm\d+$/.test(h.imdb)) { if (!person && h.label && nameHit(h.label, q)) person = { nm: h.imdb, name: h.label }; continue; }
        if (h.label) ruOf.set(h.imdb, h.label);
        films.push(h.imdb);
      }
      const have = new Set(titles.map((t) => t.id));
      const extra = (await Promise.all(films.filter((tt) => !have.has(tt)).slice(0, 3).map((tt) => imdbById(tt, d)))).filter(Boolean);
      titles = [...extra, ...titles];
    }
    let works = [];
    if (person && /^nm\d{5,10}$/.test(person.nm)) {
      try {
        const rows = await sparql(FILMS_OF(person.nm, labelLang(d)), d);
        const have = new Map(titles.map((t) => [t.id, t]));
        works = (await Promise.all(rows.map(async (b) => {
          const tt = val(b, 'imdb');
          if (!/^tt\d+$/.test(tt)) return null;
          const ru = clip(val(b, 'ru'), 140);
          if (ru) ruOf.set(tt, ru);
          let c = have.get(tt) ? { ...have.get(tt) } : await imdbById(tt, d);
          if (c === false) return null; // не фильм и не сериал
          if (!c) c = blank({ id: tt, title: clip(val(b, 'en') || ru, 140), sub: 'Фильм', year: val(b, 'date').slice(0, 4) });
          return c.title ? { ...c, by: person.name } : null;
        }))).filter(Boolean);
      } catch (e) {}
    }
    const withRu = (c) => (ruOf.get(c.id) && !c.ru ? { ...c, ru: ruOf.get(c.id) } : c);
    return ordered(titles.map(withRu), works.map(withRu), q);
  },
  async game(q, d) {
    const titles = (await d.cover('game', q).catch(() => [])).map(fromCover);
    let works = [];
    try {
      // разработчик или издатель из Wikidata: его игры с кодом Steam, самые известные первыми
      const hits = (await wdSearch(q, CYR.test(q) ? 'ru' : 'en', d)).slice(0, 3);
      if (hits.length) {
        const rows = await sparql(`SELECT ?steam ?dev ?links WHERE { VALUES ?dev { ${hits.map((h) => 'wd:' + h.id).join(' ')} } ?g wdt:P178 ?dev; wdt:P1733 ?steam; wikibase:sitelinks ?links. } ORDER BY DESC(?links) LIMIT 24`, d);
        const n = new Map();
        for (const b of rows) { const k = qidOf(val(b, 'dev')); n.set(k, (n.get(k) || 0) + 1); }
        const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
        const dev = top && top[1] >= 2 ? hits.find((h) => h.id === top[0]) : null;
        if (dev) {
          const ids = [...new Set(rows.filter((b) => qidOf(val(b, 'dev')) === dev.id).map((b) => val(b, 'steam')).filter((x) => /^\d{1,9}$/.test(x)))].slice(0, 10);
          works = (await d.steam(ids.map((id) => ({ id: +id, name: '' })))).map((c) => ({ ...fromCover(c), by: clip(dev.label, 80) }));
        }
      }
    } catch (e) {}
    return ordered(titles, works, q);
  },
  async food(q, d) {
    const geo = d.geo && Number.isFinite(d.geo.lat) && Number.isFinite(d.geo.lon) ? `&lat=${d.geo.lat}&lon=${d.geo.lon}` : '';
    const r = await d.get(`https://photon.komoot.io/api/?limit=12&q=${enc(q)}${FOOD_TAGS.map((t) => '&osm_tag=' + t).join('')}${geo}`, null, 86400);
    return foodItems(r);
  },
  async tech(q, d) {
    const lang = d.lang === 'uk' || d.lang === 'en' ? d.lang : 'ru';
    const s = await d.get(`https://www.wikidata.org/w/api.php?format=json&action=wbsearchentities&type=item&limit=15&language=${CYR.test(q) ? (lang === 'en' ? 'ru' : lang) : 'en'}&uselang=${lang}&search=${enc(q)}`, null, 86400);
    const ids = ((s && s.search) || []).filter((x) => x && /^Q\d+$/.test(x.id) && isTech(x.description)).map((x) => x.id).slice(0, 12);
    const images = new Map();
    if (ids.length) {
      try {
        // картинка страницы Wikidata — это её фото (P18), уже уменьшенное
        const p = await d.get(`https://www.wikidata.org/w/api.php?format=json&action=query&prop=pageimages&piprop=thumbnail&pithumbsize=500&titles=${ids.join('|')}`, null, 86400);
        for (const pg of Object.values((p && p.query && p.query.pages) || {})) {
          const u = pg && pg.thumbnail && https(pg.thumbnail.source);
          if (u) images.set(pg.title, u.replace(/\?.*$/, ''));
        }
      } catch (e) {}
    }
    return techItems(s, images);
  },
};
// заведения из Photon (OpenStreetMap): название, вид и адрес; одинаковые название и адрес — один раз
export function foodItems(d) {
  const out = [], seen = new Set();
  for (const f of (d && d.features) || []) {
    const p = (f && f.properties) || {};
    if (!p.name) continue;
    const city = p.city || p.town || p.village || p.county || '';
    const note = clip([city, [p.street, p.housenumber].filter(Boolean).join(' ')].filter(Boolean).join(', '), 90);
    const k = norm(p.name) + '|' + norm(note);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(blank({ title: clip(p.name, 140), sub: FOOD_KIND[p.osm_value] || 'Заведение', note }));
  }
  return out;
}
// техника из Wikidata: только то, что по описанию — устройство; год — из описания («смартфон Apple 2025 года»)
export function techItems(search, images) {
  return ((search && search.search) || []).filter((x) => x && x.id && x.label && isTech(x.description)).map((x) => {
    const art = (images && images.get(x.id)) || '';
    return blank({ title: clip(x.label, 140), note: clip(x.description, 90), year: (String(x.description || '').match(/\b(19[5-9]\d|20[0-4]\d)\b/) || [''])[0],
      art, thumb: art ? art.replace(/\/\d+px-/, '/250px-') : '' });
  });
}
export async function findWorks(kind, q, d) {
  const find = FIND[kind];
  if (!find) return { items: [], src: '' };
  const items = (await find(String(q || '').trim().slice(0, 100), d)).filter((c) => c && c.title).slice(0, 12);
  return { items, src: WORK_SRC[kind] || '' };
}
