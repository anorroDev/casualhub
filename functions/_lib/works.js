// Казуал Хаб: поиск произведения для «Новой оценки» в Мнении — по названию и по автору одной строкой (GET /api/works).
// Книги — Open Library (ищет и по автору; по-русски берёт русское издание), аниме и манга — AniList (тайтлы, авторы
// и студии одним запросом), 18+ — те же источники, что у обложек, фильмы, сериалы и мультфильмы — IMDb (названия и люди)
// и Wikidata (фильмы человека, русские названия), игры — Wikidata (все платформы: PlayStation, Xbox, Nintendo, PC, телефоны;
// игры разработчика или издателя; обложки — Steam или английская Википедия) и Steam, заведения — OpenStreetMap
// (Photon), техника — Wikidata. Всё идёт через наш сервер (браузеру чужие сайты запрещает CSP), ответы кэшируются.
// findWorks отдаёт { items, src }: до 12 штук { id, title, ru, by, sub, note, year, art, thumb, alt, tall, genres }.
//   title — название из источника, ru — русское (искали по-русски и оно нашлось), by — автор, студия, режиссёр или
//   разработчик, sub — вид («Книга», «Манга», «Кафе»), note — адрес, описание или платформы игры, id — код для /covers/info
//   (IMDb у фильмов, Steam у игр, MyAnimeList у 18+; у игры без Steam — код Wikidata «Q…», его /covers/info не знает).
//   Зависимости передаёт API (d): get — cachedJson, cover — поиск
//   обложек, latin — английские названия для русского запроса, translit, steam — карточки Steam, genres — жанры по-русски,
//   lang — язык сайта (ru, uk, en), geo — примерное место человека для заведений (или null).
export const WORK_KINDS = ['book', 'anime', 'hentai', 'movie', 'game', 'food', 'tech'];
// подпись под списком — только названия источников, без русских слов: её переводит шаблон «Источник: {}»
export const WORK_SRC = { book: 'Open Library', anime: 'AniList', hentai: 'AniList, MyAnimeList, Shikimori', movie: 'IMDb, Wikidata', game: 'Wikidata, Wikipedia, Steam', food: '© OpenStreetMap', tech: 'Wikidata' };
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
// «™» и «®» Steam пишет вплотную к словам (STAR WARS™ Battlefront™ II): убираем до разложения, иначе ™ станет «TM»
export const norm = (s) => String(s || '').replace(/[™®©℠]/g, ' ').toLowerCase().replace(/ё/g, 'е').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zа-яіїєґ0-9]+/gi, ' ').trim();
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
// wait — сколько ждать ответа (по умолчанию cachedJson ждёт 6 с)
async function sparql(query, d, wait) {
  const r = await d.get('https://query.wikidata.org/sparql?format=json&query=' + enc(query), { headers: { accept: 'application/sparql-results+json' }, ...(wait ? { wait } : {}) }, 604800);
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

// ---------- игры ----------
// платформы (P400 в Wikidata) коротко и год выхода приставки (у PC, Mac и Linux — 0: игры на них выходили всегда).
// Порядок — кого показывать первым: нынешние консоли, PC и телефоны, потом старые. Названия свои: у многих приставок
// в Wikidata осталась только метка «mul», английской нет
const PLATFORMS = [
  ['Q63184502', 'PS5', 2020], ['Q98973368', 'Xbox Series', 2020], ['Q122761124', 'Switch 2', 2025], ['Q19610114', 'Switch', 2017],
  ['Q1406', 'PC', 0], ['Q48493', 'iOS', 2007], ['Q94', 'Android', 2008], ['Q5014725', 'PS4', 2013], ['Q13361286', 'Xbox One', 2013],
  ['Q56942', 'Wii U', 2012], ['Q203597', '3DS', 2011], ['Q188808', 'PS Vita', 2011], ['Q10683', 'PS3', 2006], ['Q48263', 'Xbox 360', 2005],
  ['Q8079', 'Wii', 2006], ['Q170323', 'DS', 2004], ['Q170325', 'PSP', 2004], ['Q10680', 'PS2', 2000], ['Q132020', 'Xbox', 2001],
  ['Q182172', 'GameCube', 2001], ['Q188642', 'GBA', 2001], ['Q10677', 'PlayStation', 1994], ['Q184839', 'N64', 1996], ['Q200912', 'Saturn', 1994],
  ['Q184198', 'Dreamcast', 1998], ['Q203992', 'Game Boy Color', 1998], ['Q186437', 'Game Boy', 1989], ['Q183259', 'SNES', 1990],
  ['Q10676', 'Mega Drive', 1988], ['Q172742', 'NES', 1983], ['Q209868', 'Master System', 1985], ['Q751719', 'Game Gear', 1990],
  ['Q192851', 'Arcade', 1971], ['Q14116', 'Mac', 0], ['Q388', 'Linux', 0], ['Q170434', 'DOS', 0], ['Q47604', 'DOS', 0], ['Q99775', 'C64', 1982], ['Q100047', 'Amiga', 1985],
  ['Q23882', 'ZX Spectrum', 1982],
];
// под названием — до трёх платформ, остальные числом: «PS5, Xbox Series, PC +3». Сначала те, что были, когда игра вышла:
// у Ocarina of Time (1998) первой N64, а не Wii U, где её переиздали. Незнакомые (браузер, «телефон») не пишем
export function platformLine(ids, year) {
  const have = new Set(ids || []), y = +year || 9999;
  const known = PLATFORMS.filter(([id]) => have.has(id));
  const names = [...new Set([...known.filter((p) => p[2] <= y + 1), ...known.filter((p) => p[2] > y + 1)].map((p) => p[1]))];
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}
// жанры на языке сайта, до двух: «приключенческий экшен», «шутер от первого лица». «Постапокалиптическая компьютерная игра»
// и похожие — это мир игры, а не жанр: такие не берём
const GENRE_FIX = { 'компьютерная ролевая игра': 'ролевая игра', "комп'ютерна рольова гра": 'рольова гра', 'role-playing video game': 'role-playing game' };
const GENRE_NOT = /компьютерн|комп'ютерн|видеоигр|відеогр|video game/;
export function gameGenres(list) {
  const out = [];
  for (const g of list || []) {
    let v = clip(g, 60).toLowerCase().replace(/[ʼ’]/g, "'");
    v = GENRE_FIX[v] || v;
    if (v && v.length <= 30 && !GENRE_NOT.test(v) && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 2);
}
// имя студии короче: без «Inc.», «Co., Ltd.»; студии Nintendo в Wikidata записаны полностью — пишем, как их называют обычно
export const devName = (s) => clip(s, 80).replace(/,?\s+(?:Inc\.?|Co\.,? Ltd\.?|Ltd\.?|LLC|GmbH|S\.A\.|Corporation|Corp\.)$/i, '')
  .replace(/^Nintendo Entertainment (Analysis|Planning) (?:&|and) Development$/, (m, w) => (w === 'Analysis' ? 'Nintendo EAD' : 'Nintendo EPD'));
// подробности игр одним запросом: у каждого свойства свой подзапрос, чтобы строки не перемножались (так быстрее в разы).
// Названия (en, mul и на языке сайта), год, код Steam, платформы, жанры, статьи английской и русской Википедий (обложка), число
// статей во всех Википедиях (известные игры — первыми), издатели и разработчики — по строке на каждого; late — пришёл
// потом (у Minecraft Microsoft с «начала» 2014-го, а делала игру Mojang)
const GAME_INFO = (ids, lang, glang) => {
  const v = `VALUES ?g { ${ids.map((i) => 'wd:' + i).join(' ')} }`;
  return `SELECT ?g ?links ?en ?mul ?lo ?date ?steam ?wiki ?ruwiki ?pfs ?gns ?pubs ?by ?byn ?late WHERE { ${v} ?g wikibase:sitelinks ?links. `
    + 'OPTIONAL { ?g rdfs:label ?en FILTER(LANG(?en) = "en") } OPTIONAL { ?g rdfs:label ?mul FILTER(LANG(?mul) = "mul") } '
    + (lang ? `OPTIONAL { ?g rdfs:label ?lo FILTER(LANG(?lo) = "${lang}") } ` : '')
    + 'OPTIONAL { ?wiki schema:about ?g; schema:isPartOf <https://en.wikipedia.org/> } '
    + 'OPTIONAL { ?ruwiki schema:about ?g; schema:isPartOf <https://ru.wikipedia.org/> } '
    + `OPTIONAL { SELECT ?g (MIN(?d) AS ?date) WHERE { ${v} ?g wdt:P577 ?d } GROUP BY ?g } `
    + `OPTIONAL { SELECT ?g (SAMPLE(?s) AS ?steam) WHERE { ${v} ?g wdt:P1733 ?s } GROUP BY ?g } `
    + `OPTIONAL { SELECT ?g (GROUP_CONCAT(DISTINCT STRAFTER(STR(?p), "entity/"); separator=" ") AS ?pfs) WHERE { ${v} ?g wdt:P400 ?p } GROUP BY ?g } `
    + `OPTIONAL { SELECT ?g (GROUP_CONCAT(DISTINCT ?n; separator="|") AS ?gns) WHERE { ${v} ?g wdt:P136 ?x. ?x rdfs:label ?n FILTER(LANG(?n) = "${glang}") } GROUP BY ?g } `
    + `OPTIONAL { SELECT ?g (GROUP_CONCAT(DISTINCT ?n; separator="|") AS ?pubs) WHERE { ${v} ?g wdt:P123 ?x. ?x rdfs:label ?n FILTER(LANG(?n) = "en" || LANG(?n) = "mul") } GROUP BY ?g } `
    + `OPTIONAL { SELECT ?g ?by ?byn ?late WHERE { ${v} ?g p:P178 ?s. ?s ps:P178 ?x; wikibase:rank ?rk. FILTER(?rk != wikibase:DeprecatedRank) `
    + '?x wikibase:sitelinks ?byn; rdfs:label ?by FILTER(LANG(?by) = "en" || LANG(?by) = "mul") BIND(EXISTS { ?s pq:P580 ?t } AS ?late) } } '
    + '}';
};
// игра: card — карточка списка, остальное — чтобы склеить со Steam, найти обложку и выбрать порядок.
// x: { qid, links, en, lo, wiki, ruwiki (статьи английской и русской Википедий), year, steam, pfs, genres, devs }
function gameOf(x, cyr) {
  const en = clip(x.en, 140), lo = clip(x.lo, 140), title = en || lo, year = /^\d{4}$/.test(x.year) ? x.year : '';
  const pfs = (x.pfs || []).filter((p) => /^Q\d+$/.test(p)), devs = [...new Set((x.devs || []).map(devName).filter(Boolean))];
  return { qid: x.qid, links: +x.links || 0, steam: /^\d{1,9}$/.test(x.steam || '') ? x.steam : '', wiki: clip(x.wiki, 250), ruwiki: clip(x.ruwiki, 250), pfs, devs, names: [title, lo].filter(Boolean),
    card: blank({ title, ru: cyr && lo && lo !== title && CYR.test(lo) ? lo : '', by: clip(devs.slice(0, 2).join(', '), 80), sub: 'Игра', note: platformLine(pfs, year), year, genres: gameGenres(x.genres) }) };
}
// первое слово имени студии без «The»: Nintendo EPD → nintendo, The Pokémon Company → pokemon
const firstWord = (s) => norm(s).replace(/^the /, '').split(' ')[0];
// адрес статьи → её название: https://en.wikipedia.org/wiki/Halo_3 → «Halo 3»
function pageOf(url, host) {
  const m = String(url || '').match(/^https:\/\/(en|ru)\.wikipedia\.org\/wiki\/([^?#]+)$/);
  try { return m && m[1] === host ? decodeURIComponent(m[2]).replace(/_/g, ' ') : ''; } catch (e) { return ''; }
}
// qid → игра. Строк у игры столько, сколько разработчиков: соберём их. Первым — студия издателя (у Breath of the Wild
// Nintendo EPD, а не помогавшая Monolith Soft), потом известные (у GTA V Rockstar North, а не Rockstar Leeds),
// пришедшие потом — в конце (у Minecraft Microsoft после Mojang)
async function wdGameInfo(ids, d, lang, glang, cyr) {
  const got = new Map();
  for (const b of await sparql(GAME_INFO(ids, lang, glang), d)) {
    const id = qidOf(val(b, 'g'));
    if (!/^Q\d+$/.test(id)) continue;
    if (!got.has(id)) {
      got.set(id, { qid: id, links: val(b, 'links'), en: val(b, 'en') || val(b, 'mul'), lo: val(b, 'lo'), wiki: pageOf(val(b, 'wiki'), 'en'), ruwiki: pageOf(val(b, 'ruwiki'), 'ru'), year: val(b, 'date').slice(0, 4), steam: val(b, 'steam'),
        pfs: val(b, 'pfs').split(' '), genres: val(b, 'gns').split('|'), pubs: new Set(val(b, 'pubs').split('|').map(firstWord).filter(Boolean)), devs: [] });
    }
    if (val(b, 'by')) got.get(id).devs.push({ name: val(b, 'by'), n: +val(b, 'byn') || 0, late: val(b, 'late') === 'true' });
  }
  return new Map([...got].map(([id, x]) => {
    const pub = (v) => (x.pubs.has(firstWord(v.name)) ? 1 : 0);
    const devs = x.devs.sort((a, b) => a.late - b.late || pub(b) - pub(a) || b.n - a.n).map((v) => v.name);
    return [id, gameOf({ ...x, devs }, cyr)];
  }).filter(([, g]) => g.card.title));
}
// SPARQL не ответил (его сервер бывает занят) — названия, год из описания («2017 video game»), статьи Википедии и их
// число (известность) из API Wikidata: без платформ и разработчика, зато список есть
async function wdGameLite(ids, d, lang, cyr) {
  const r = await d.get(`https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&props=labels|descriptions|sitelinks&languages=en|mul${lang ? '|' + lang : ''}&ids=${ids.join('|')}`, null, 604800);
  const out = new Map();
  for (const id of ids) {
    const e = r && r.entities && r.entities[id], L = (e && e.labels) || {}, D = (e && e.descriptions) || {}, S = (e && e.sitelinks) || {};
    const label = (k) => (L[k] && typeof L[k].value === 'string' ? L[k].value : '');
    const desc = String((D.en || D.mul || {}).value || '');
    const site = (k) => (S[k] && typeof S[k].title === 'string' ? S[k].title : '');
    const g = gameOf({ qid: id, links: Object.keys(S).length, en: label('en') || label('mul'), lo: lang ? label(lang) : '', wiki: site('enwiki'), ruwiki: site('ruwiki'),
      year: (desc.match(/\b(19[5-9]\d|20[0-4]\d)\b/) || [''])[0] }, cyr);
    if (g.card.title) out.set(id, g);
  }
  return out;
}
// игры всех платформ: полнотекстовый поиск Wikidata только по видеоиграм (P31 = Q7889). Он знает русские и украинские
// названия и сокращения («гта 5», «botw»); по-русски ищем ещё и транслитом — «марио карт» → mario kart
async function wdGameIds(q, d) {
  const qs = CYR.test(q) ? [...new Set([q, d.translit(q)])] : [q];
  const lists = await Promise.all(qs.map((s) => d.get(`https://www.wikidata.org/w/api.php?format=json&action=query&list=search&srlimit=10&srprop=&srsearch=${enc(s + ' haswbstatement:P31=Q7889')}`, null, 604800).catch(() => null)));
  const ids = [];
  for (const r of lists) for (const x of (r && r.query && r.query.search) || []) if (x && /^Q\d+$/.test(x.title) && !ids.includes(x.title)) ids.push(x.title);
  return ids.slice(0, 14);
}
// разработчик или издатель («nintendo», «fromsoftware», «нинтендо»): его игры всех платформ, самые известные первыми.
// Спрашиваем только про то, что по описанию — компания или студия: «Halo» (серия) и «Mario» (персонаж) — нет
const STUDIO_RE = /developer|publisher|company|studio|corporation|subsidiary|разработчик|издател|компани|студи|корпораци|розробник|видав|компані|студі/i;
// …но не сама игра, в описании которой есть студия: «компьютерная игра, разработанная студией CD Projekt RED»
const GAME_DESC = /компьютерн\S* игр[аы]|видеоигр[аы]|відеогр[аи]|комп['ʼ’]ютерн\S* гр[аи]|video game$|video game (?:by|from|developed|published|for|series)\b/i;
async function wdStudio(q, d, cyr) {
  // «rockstar» — сначала песни и фильмы, Rockstar Games ниже: смотрим все восемь найденных
  const hits = (await wdSearch(q, cyr ? 'ru' : 'en', d)).filter((h) => STUDIO_RE.test(h.desc) && !GAME_DESC.test(h.desc)).slice(0, 3);
  if (!hits.length) return null;
  const rows = await sparql(`SELECT DISTINCT ?g ?dev ?links WHERE { VALUES ?dev { ${hits.map((h) => 'wd:' + h.id).join(' ')} } `
    + '{ ?g wdt:P178 ?dev } UNION { ?g wdt:P123 ?dev } ?g wdt:P31 wd:Q7889; wikibase:sitelinks ?links. } ORDER BY DESC(?links) LIMIT 30', d, 4000); // студия — не главное: дольше 4 с не ждём
  // студия — та, чьи игры известнее всего (сумма статей), и игр у неё хотя бы две
  const n = new Map(), mass = new Map();
  for (const b of rows) { const k = qidOf(val(b, 'dev')); n.set(k, (n.get(k) || 0) + 1); mass.set(k, (mass.get(k) || 0) + (+val(b, 'links') || 0)); }
  const top = [...n.keys()].filter((k) => n.get(k) >= 2).sort((a, b) => mass.get(b) - mass.get(a))[0];
  const dev = top ? hits.find((h) => h.id === top) : null;
  if (!dev) return null;
  const ids = [...new Set(rows.filter((b) => qidOf(val(b, 'dev')) === dev.id).map((b) => qidOf(val(b, 'g'))).filter((x) => /^Q\d+$/.test(x)))];
  return { name: devName(dev.label), ids: ids.slice(0, 10) };
}
// обложки из Википедии (host — en или ru) одним запросом: у игр там коробка. Она не свободная, поэтому pilicense=any (как
// у лотов). Статья бывает перенаправлением (Mario Kart 8 Deluxe → Mario Kart 8): картинка достаётся каждому, кто туда пришёл
async function wikiCovers(titles, d, host = 'en') {
  const out = new Map();
  if (!titles.length) return out;
  const r = await d.get(`https://${host}.wikipedia.org/w/api.php?format=json&action=query&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=600&pilicense=any&titles=${enc(titles.join('|'))}`, null, 604800);
  const q = (r && r.query) || {}, step = new Map(), back = new Map();
  for (const x of [...(q.normalized || []), ...(q.redirects || [])]) if (x && x.from && x.to) step.set(x.from, x.to);
  for (const t of titles) {
    let f = t;
    for (let i = 0; i < 3 && step.has(f); i++) f = step.get(f);
    back.set(f, [...(back.get(f) || []), t]);
  }
  for (const p of Object.values(q.pages || {})) {
    const t = p && p.thumbnail, u = t && https(t.source);
    if (u) for (const k of back.get(p.title) || [p.title]) out.set(k, { art: u.replace(/\?.*$/, ''), tall: +t.height > +t.width * 1.15 });
  }
  return out;
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
  // Игры всех платформ — из Wikidata (поиск по названию и игры студии), PC — ещё и из Steam: поиски параллельно, потом
  // одним запросом подробности, потом обложки. Запросов наружу до 9 (по-русски Steam сам не ищет — его поиск, только
  // если Wikidata ничего не нашла)
  async game(q, d) {
    const cyr = CYR.test(q), lang = labelLang(d), glang = d.lang === 'uk' || d.lang === 'en' ? d.lang : 'ru';
    const [steamFound, ids, studio] = await Promise.all([
      cyr ? Promise.resolve([]) : d.cover('game', q).catch(() => []),
      wdGameIds(q, d).catch(() => []),
      wdStudio(q, d, cyr).catch(() => null),
    ]);
    const all = [...new Set([...ids, ...(studio ? studio.ids : [])])].slice(0, 24);
    const info = all.length ? (await wdGameInfo(all, d, lang, glang, cyr).catch(() => null)) || (await wdGameLite(all, d, lang, cyr).catch(() => new Map())) : new Map();
    const found = ids.map((id) => info.get(id)).filter(Boolean);
    // игры студии: сначала те, что она сделала сама (у Capcom — Resident Evil), потом изданные (GTA III — Capcom издавала в Японии)
    const own = (g) => (studio && g.devs.some((x) => firstWord(x) === firstWord(studio.name)) ? 1 : 0);
    const mine = studio ? studio.ids.map((id) => info.get(id)).filter(Boolean).sort((a, b) => own(b) - own(a) || b.links - a.links) : [];
    let steam = steamFound.map(fromCover);
    // по-русски Wikidata ничего не нашла (и это не студия) — Steam через поиск обложек: он сам переведёт название на английский
    if (cyr && !found.length && !mine.length) steam = (await d.cover('game', q).catch(() => [])).map(fromCover);
    // название совпало целиком — первой, но только известная игра: «zelda» — сначала Breath of the Wild, а не малоизвестная
    // «Zelda» 1989 года. Потом те, где есть все слова запроса, внутри — по известности
    const most = Math.max(0, ...found.map((g) => g.links));
    // по-русски сравниваем и с транслитом: «покемон» → pokemon находит Pokémon Yellow, а не только «Покемон ураниум»
    const qs = cyr ? [q, d.translit(q)] : [q];
    const hit = (g) => (g.names.some((n) => qs.some((s) => titleHit(n, s))) && g.links * 5 >= most ? 2 : g.names.some((n) => qs.some((s) => nameHit(n, s))) ? 1 : 0);
    found.sort((a, b) => hit(b) - hit(a) || b.links - a.links);
    const top = found.slice(0, 10), games = [...top, ...mine];
    // игра из Steam, у которой в Wikidata нет кода Steam, — та же, если такое название в списке у неё одной, код Steam ещё
    // ничей и она есть на PC (или платформы неизвестны). Silent Hill 2 2001 года не забирает код ремейка 2024-го, а из двух
    // God of War (2005 и 2018) без кодов ни одна не получает чужой
    const claimed = new Set(games.map((g) => g.steam).filter(Boolean)), named = new Map();
    for (const g of new Set(games)) { const k = norm(g.card.title); if (k) named.set(k, (named.get(k) || 0) + 1); }
    for (const g of new Set(games)) {
      const k = norm(g.card.title);
      if (g.steam || !k || named.get(k) !== 1 || (g.pfs.length && !g.pfs.includes('Q1406'))) continue;
      const s = steam.find((c) => !claimed.has(c.id) && norm(c.title) === k);
      if (s) { g.steam = s.id; claimed.add(s.id); }
    }
    // обложки: есть в Steam — вертикальная оттуда (крупнее), нет — коробка из английской Википедии, нет и там — из русской
    const have = new Map(steam.map((c) => [c.id, c]));
    const need = [...new Set(games.map((g) => g.steam).filter((s) => s && !have.has(s)))].slice(0, 20);
    const [covers, extra] = await Promise.all([
      wikiCovers([...new Set(games.map((g) => g.wiki).filter(Boolean))].slice(0, 40), d).catch(() => new Map()),
      need.length ? d.steam(need.map((id) => ({ id: +id, name: '' }))).catch(() => []) : Promise.resolve([]),
    ]);
    for (const c of extra) if (c && c.id) have.set(String(c.id), fromCover(c));
    // у Minecraft в английской Википедии картинки нет, а в русской есть: её спрашиваем только для тех, кто остался без обложки
    const bare = games.filter((g) => g.ruwiki && !(g.steam && have.has(g.steam)) && !(g.wiki && covers.has(g.wiki)));
    const coversRu = bare.length ? await wikiCovers([...new Set(bare.map((g) => g.ruwiki))].slice(0, 20), d, 'ru').catch(() => new Map()) : new Map();
    const used = new Set();
    const cardOf = (g, by) => {
      const s = g.steam && have.get(g.steam), w = (g.wiki && covers.get(g.wiki)) || (g.ruwiki && coversRu.get(g.ruwiki));
      if (s) used.add(s.id);
      const art = s ? s.art : w ? w.art : '';
      // код Steam — чтобы выбор спросил у Steam русское название и жанры; без него — код Wikidata, только против повторов
      return { ...g.card, id: s ? s.id : g.qid, by: g.card.by || by || '', art, thumb: s ? s.thumb : art, alt: s ? (w ? w.art : s.alt) : '', tall: s ? s.tall : !!(w && w.tall) };
    };
    const titles = top.map((g) => ({ c: cardOf(g), grp: [3, 1, 0][hit(g)] }));
    const works = mine.map((g) => cardOf(g, studio.name));
    // только из Steam (значит, PC): с тем же названием, что запрос, — после игр Wikidata со словами запроса (известность
    // Steam-игры не знаем), но раньше остальных; прочие — в конце
    titles.push(...steam.filter((c) => !used.has(c.id)).map((c) => ({ c: { ...c, note: 'PC' }, grp: titleHit(c.title, q) ? 2 : 4 })));
    const list = titles.sort((a, b) => a.grp - b.grp).map((t) => t.c);
    // название известной игры совпало — найденное по названию первым; нет — то, где игры известнее: «halo» — игры Halo,
    // а не студии Halo Studios, «rockstar» — игры Rockstar Games, а не Rockstar Games presents Table Tennis. Найденное
    // поиском без слов запроса в названии (GTA V по «rockstar» — из описания) в этом споре не считается: это и есть игры студии
    const best = (gs) => Math.max(0, ...gs.map((g) => g.links));
    return dedupe(titles.some((t) => t.grp === 0) || !works.length || best(top.filter((g) => hit(g) > 0)) >= best(mine) ? [...list, ...works] : [...works, ...list]);
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
