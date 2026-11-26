// Тесты поиска произведений для «Новой оценки» (functions/_lib/works.js): node --test tests/works.test.mjs
// Сеть подменена: ответы источников — по началу адреса.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWorks, cyrTitle, bookItems, foodItems, techItems, suggestItems, ordered, nameHit, norm, platformLine, gameGenres, devName, WORK_KINDS } from '../functions/_lib/works.js';

function deps(routes, extra = {}) {
  const asked = [];
  const get = async (url, init) => {
    asked.push(url);
    for (const [k, v] of routes) if (url.startsWith(k)) return typeof v === 'function' ? v(url, init) : v;
    throw new Error('нет ответа для ' + url);
  };
  return { asked, get, cover: async () => [], latin: async () => [], translit: (s) => s, steam: async () => [], genres: (g) => g.map((x) => String(x).toLowerCase()).slice(0, 3), lang: 'ru', geo: null, ...extra };
}
const sparqlRows = (rows) => ({ results: { bindings: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { value: String(v) }]))) } });

test('русское название книги: из названия работы или издания', () => {
  assert.equal(cyrTitle('Война и мир / Voĭna i mir'), 'Война и мир');
  assert.equal(cyrTitle('Казаки (Kazaki)'), 'Казаки');
  assert.equal(cyrTitle('War and Peace', 'Voina i mir = ВОЙНА И МИРЪ'), 'Война и миръ');
  assert.equal(cyrTitle('It', 'ОНО'), 'ОНО');
  assert.equal(cyrTitle('Empire V. Ампир В'), '', 'вперемешку с латиницей — не русское название');
  assert.equal(cyrTitle('Harry Potter', ''), '');
});

test('книги: по-русски — русское издание и его обложка, мусор без обложки и автора отброшен, повторы склеены', () => {
  const d = { docs: [
    { title: 'Harry Potter and the Chamber of Secrets', author_name: ['J. K. Rowling'], first_publish_year: 1998, cover_i: 10, editions: { docs: [{ title: 'Гарри Поттер и Тайная комната', language: ['rus'], cover_i: 11 }] } },
    { title: 'Сборник статей', author_name: [], editions: { docs: [] } },
    { title: 'Мастер и Маргарита', author_name: ['Михаил Булгаков'], first_publish_year: 1966, editions: { docs: [] } },
    { title: 'Мастер и Маргарита', author_name: ['Михаил Булгаков'], cover_i: 7, editions: { docs: [] } },
  ] };
  const ru = bookItems(d, true);
  assert.equal(ru.length, 2);
  assert.equal(ru[0].ru, 'Гарри Поттер и Тайная комната');
  assert.equal(ru[0].art, 'https://covers.openlibrary.org/b/id/11-L.jpg', 'обложка русского издания');
  assert.equal(ru[0].by, 'J. K. Rowling');
  assert.equal(ru[0].year, '1998');
  assert.equal(ru[1].title, 'Мастер и Маргарита');
  assert.equal(ru[1].art, 'https://covers.openlibrary.org/b/id/7-L.jpg', 'у повтора нашлась обложка — она переходит к первому');
  const en = bookItems(d, false);
  assert.equal(en[0].ru, '');
  assert.equal(en[0].art, 'https://covers.openlibrary.org/b/id/10-L.jpg', 'по-английски — обложка работы');
});

test('книги: по-русски Open Library спрашивается с lang', async () => {
  const d = deps([['https://openlibrary.org/search.json', { docs: [{ title: 'Собачье сердце', author_name: ['Михаил Булгаков'], cover_i: 3 }] }]]);
  const r = await findWorks('book', 'Булгаков', d);
  assert.match(d.asked[0], /&lang=ru&/);
  assert.match(d.asked[0], /fields=key,.*editions\.title/, 'без key Open Library не отдаёт издания');
  assert.equal(r.src, 'Open Library');
  assert.equal(r.items[0].by, 'Михаил Булгаков');
  const u = deps([['https://openlibrary.org/search.json', { docs: [] }]], { lang: 'uk' });
  await findWorks('book', 'Шевченко', u);
  assert.match(u.asked[0], /&lang=uk&/);
  const e = deps([['https://openlibrary.org/search.json', { docs: [] }]]);
  await findWorks('book', 'Tolstoy', e);
  assert.doesNotMatch(e.asked[0], /&lang=/);
});

test('имя автора: каждое слово запроса начинает слово в имени', () => {
  assert.ok(nameHit('Christopher Nolan', 'nolan'));
  assert.ok(nameHit('Studio Ghibli', 'ghibli'));
  assert.ok(nameHit('Hayao Miyazaki', 'miyazaki hay'));
  assert.ok(!nameHit('Nolan North', 'chris'));
  assert.ok(!nameHit('Ghibli', ''));
});

test('порядок: совпало название — сначала найденные по названию, иначе — работы автора', () => {
  const t = [{ title: 'Naruto', by: 'Studio Pierrot' }], w = [{ title: 'Spirited Away', by: 'Hayao Miyazaki' }];
  assert.deepEqual(ordered(t, w, 'naruto').map((x) => x.title), ['Naruto', 'Spirited Away']);
  assert.deepEqual(ordered([{ title: 'Miyazaki-san' }], w, 'miyazaki').map((x) => x.title), ['Spirited Away', 'Miyazaki-san']);
  assert.deepEqual(ordered([{ id: 'tt1', title: 'A' }], [{ id: 'tt1', title: 'A', by: 'X' }], 'zzz').map((x) => x.id), ['tt1'], 'одно и то же — один раз');
});

test('аниме: тайтлы, работы автора и студии одним запросом; взрослое не показывается', async () => {
  const m = (id, t, extra = {}) => ({ id, type: 'ANIME', format: 'MOVIE', isAdult: false, title: { english: t }, startDate: { year: 2001 }, genres: ['Fantasy'], coverImage: { large: `https://img/${id}.jpg` }, studios: { nodes: [{ name: 'Studio Ghibli' }] }, staff: { edges: [] }, ...extra });
  const data = { data: {
    m: { media: [m(1, 'Miyazaki-san ka no Miyazaki', { type: 'MANGA', format: 'ONE_SHOT', staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Satoaki Masuda' } } }] } })] },
    p: { staff: [{ name: { full: 'Hayao Miyazaki', native: '宮崎駿' }, staffMedia: { nodes: [m(2, 'Spirited Away'), m(3, 'Spirited Away'), m(4, 'Adult thing', { isAdult: true })] } }] },
    s: { studios: [] },
  } };
  const d = deps([['https://graphql.anilist.co', data]]);
  const r = await findWorks('anime', 'Miyazaki', d);
  assert.deepEqual(r.items.map((x) => x.title), ['Spirited Away', 'Miyazaki-san ka no Miyazaki']);
  assert.equal(r.items[0].by, 'Hayao Miyazaki');
  assert.equal(r.items[0].sub, 'Аниме-фильм');
  assert.deepEqual(r.items[0].genres, ['fantasy']);
  assert.equal(r.items[1].by, 'Satoaki Masuda', 'у манги автор — из Story & Art');
  assert.equal(r.items[1].sub, 'Манга');
});

test('аниме: AniList не ответил — тайтлы из поиска обложек', async () => {
  const d = deps([], { cover: async (kind, q) => (kind === 'anime' ? [{ title: 'Naruto', sub: 'Аниме', art: 'https://k/n.jpg', tall: true }] : []) });
  const r = await findWorks('anime', 'naruto', d);
  assert.deepEqual(r.items.map((x) => x.title), ['Naruto']);
});

test('фильмы: человек из IMDb — его фильмы из Wikidata с русскими названиями, первыми', async () => {
  const sug = (id, l, extra = {}) => ({ id, l, qid: 'movie', y: 2014, s: 'Matthew McConaughey', i: { imageUrl: `https://m.media-amazon.com/images/M/${id}._V1_.jpg` }, ...extra });
  const d = deps([
    ['https://v3.sg.media-imdb.com/suggestion/x/', { d: [{ id: 'nm0634240', l: 'Christopher Nolan', s: 'Producer, Tenet (2020)' }, sug('tt0150143', 'Claire Dolan')] }],
    ['https://query.wikidata.org/sparql', sparqlRows([{ imdb: 'tt0816692', links: 90, ru: 'Интерстеллар', en: 'Interstellar', date: '2014-10-26' }, { imdb: 'tt1375666', links: 88, ru: 'Начало', en: 'Inception', date: '2010-07-08' }])],
    ['https://v3.sg.media-imdb.com/suggestion/t/tt0816692', { d: [sug('tt0816692', 'Interstellar')] }],
    ['https://v3.sg.media-imdb.com/suggestion/t/tt1375666', { d: [sug('tt1375666', 'Inception', { y: 2010 })] }],
  ]);
  const r = await findWorks('movie', 'nolan', d);
  assert.deepEqual(r.items.map((x) => x.title), ['Interstellar', 'Inception', 'Claire Dolan']);
  assert.equal(r.items[0].ru, 'Интерстеллар');
  assert.equal(r.items[0].by, 'Christopher Nolan');
  assert.equal(r.items[0].id, 'tt0816692', 'по коду IMDb выбор потом спросит русское название и режиссёра');
  assert.match(r.items[0].art, /_V1_QL80_UX600_\.jpg$/);
  assert.match(d.asked.find((u) => u.startsWith('https://query.wikidata.org/')), /nm0634240/);
});

test('фильмы по-русски: человек и фильмы из полнотекстового поиска Wikidata, названия на языке сайта', async () => {
  const sug = (id, l, y) => ({ d: [{ id, l, qid: 'movie', y, s: 'Tom Hanks', i: { imageUrl: `https://m.media-amazon.com/images/M/${id}._V1_.jpg` } }] });
  const d = deps([
    ['https://v3.sg.media-imdb.com/suggestion/x/', { d: [] }],
    ['https://www.wikidata.org/w/api.php?format=json&action=query&list=search', { query: { search: [{ title: 'Q208263' }, { title: 'Q25191' }] } }],
    ['https://query.wikidata.org/sparql', (url) => (decodeURIComponent(url).includes('VALUES ?item')
      ? sparqlRows([{ item: 'http://www.wikidata.org/entity/Q208263', imdb: 'tt0120689', l: 'Зелёная миля' }, { item: 'http://www.wikidata.org/entity/Q25191', imdb: 'nm0634240', l: 'Кристофер Нолан' }])
      : sparqlRows([]))],
    ['https://v3.sg.media-imdb.com/suggestion/t/tt0120689', sug('tt0120689', 'The Green Mile', 1999)],
  ]);
  const r = await findWorks('movie', 'зелёная миля', d);
  assert.equal(r.items[0].ru, 'Зелёная миля');
  assert.equal(r.items[0].title, 'The Green Mile');
  assert.match(d.asked.find((u) => u.includes('list=search')), /haswbstatement%3AP345/);
  assert.ok(!d.asked.some((u) => decodeURIComponent(u).includes('nm0634240')), 'имя не совпало с запросом — фильмы человека не ищем');
  const p = deps([
    ['https://v3.sg.media-imdb.com/suggestion/x/', { d: [] }],
    ['https://www.wikidata.org/w/api.php?format=json&action=query&list=search', { query: { search: [{ title: 'Q25191' }] } }],
    ['https://query.wikidata.org/sparql', (url) => (decodeURIComponent(url).includes('VALUES ?item')
      ? sparqlRows([{ item: 'http://www.wikidata.org/entity/Q25191', imdb: 'nm0634240', l: 'Кристофер Нолан' }])
      : sparqlRows([{ imdb: 'tt0816692', links: 90, ru: 'Інтерстеллар', en: 'Interstellar', date: '2014-10-26' }]))],
    ['https://v3.sg.media-imdb.com/suggestion/t/tt0816692', sug('tt0816692', 'Interstellar', 2014)],
  ], { lang: 'uk' });
  const pr = await findWorks('movie', 'Нолан', p);
  assert.deepEqual(pr.items.map((x) => [x.ru, x.by]), [['Інтерстеллар', 'Кристофер Нолан']]);
  assert.match(decodeURIComponent(p.asked.find((u) => u.includes('nm0634240'))), /lang\(\?r\) = "uk"/, 'названия — на украинском');
});

test('фильмы по-русски: игра или эпизод с кодом IMDb из Wikidata не выдаются за фильм', async () => {
  const d = deps([
    ['https://v3.sg.media-imdb.com/suggestion/x/', { d: [] }],
    ['https://www.wikidata.org/w/api.php?format=json&action=query&list=search', { query: { search: [{ title: 'Q1' }, { title: 'Q2' }] } }],
    ['https://query.wikidata.org/sparql', sparqlRows([{ item: 'http://www.wikidata.org/entity/Q1', imdb: 'tt1', l: 'Ведьмак' }, { item: 'http://www.wikidata.org/entity/Q2', imdb: 'tt2', l: 'Ведьмак 3' }])],
    ['https://v3.sg.media-imdb.com/suggestion/t/tt1', { d: [{ id: 'tt1', l: 'The Witcher', qid: 'tvSeries', y: 2019, i: { imageUrl: 'https://m.media-amazon.com/a._V1_.jpg' } }] }],
    ['https://v3.sg.media-imdb.com/suggestion/t/tt2', { d: [{ id: 'tt2', l: 'The Witcher 3', qid: 'videoGame', y: 2015, i: { imageUrl: 'https://m.media-amazon.com/b._V1_.jpg' } }] }],
  ]);
  const r = await findWorks('movie', 'ведьмак', d);
  assert.deepEqual(r.items.map((x) => [x.ru, x.sub]), [['Ведьмак', 'Сериал']]);
});

test('фильмы: название совпало — найденное по названию первым, человека не ищем без совпадения имени', async () => {
  const d = deps([['https://v3.sg.media-imdb.com/suggestion/x/', { d: [{ id: 'tt0816692', l: 'Interstellar', qid: 'movie', y: 2014, s: 'McConaughey', i: { imageUrl: 'https://m.media-amazon.com/i._V1_.jpg' } }, { id: 'nm1', l: 'Somebody Else', s: 'Actor' }] }]]);
  const r = await findWorks('movie', 'interstellar', d);
  assert.deepEqual(r.items.map((x) => x.title), ['Interstellar']);
  assert.ok(!d.asked.some((u) => u.startsWith('https://query.wikidata.org/')), 'Wikidata не спрашивали');
});

const E = (id) => 'http://www.wikidata.org/entity/' + id;
const WD_SEARCH = 'https://www.wikidata.org/w/api.php?format=json&action=query&list=search';
const WD_ENT = 'https://www.wikidata.org/w/api.php?format=json&action=wbsearchentities';
// строки подробностей игры: у каждого разработчика своя строка (как отдаёт SPARQL)
const gameRows = (g, devs = [{}]) => devs.map((v) => ({ g: E(g.id), links: g.links || 1, ...(g.en ? { en: g.en } : {}), ...(g.mul ? { mul: g.mul } : {}), ...(g.lo ? { lo: g.lo } : {}),
  ...(g.date ? { date: g.date } : {}), ...(g.steam ? { steam: g.steam } : {}), ...(g.wiki ? { wiki: 'https://en.wikipedia.org/wiki/' + g.wiki } : {}),
  ...(g.ruwiki ? { ruwiki: 'https://ru.wikipedia.org/wiki/' + g.ruwiki } : {}), ...(g.pfs ? { pfs: g.pfs } : {}), ...(g.gns ? { gns: g.gns } : {}), ...(g.pubs ? { pubs: g.pubs } : {}),
  ...(v.by ? { by: v.by, byn: v.n || 1, late: v.late ? 'true' : 'false' } : {}) }));

test('платформы игры: коротко, сначала те, что были при выходе, остальные числом; жанры без «компьютерной игры»; студии короче', () => {
  assert.equal(platformLine(['Q122761124', 'Q56942', 'Q19610114'], '2017'), 'Switch, Wii U, Switch 2', 'Switch 2 вышла позже игры');
  assert.equal(platformLine(['Q8079', 'Q56942', 'Q184839', 'Q182172', 'Q203597'], '1998'), 'N64, Wii U, 3DS +2', 'у Ocarina of Time первой — N64');
  assert.equal(platformLine(['Q63184502', 'Q98973368', 'Q1406', 'Q5014725', 'Q13361286'], '2022'), 'PS5, Xbox Series, PC +2');
  assert.equal(platformLine(['Q170434', 'Q47604', 'Q6368'], ''), 'DOS', 'повторы склеены, незнакомые пропущены');
  assert.deepEqual(gameGenres(['постапокалиптическая компьютерная игра', 'компьютерная ролевая игра', 'приключенческий экшен', 'шутер']), ['ролевая игра', 'приключенческий экшен']);
  assert.deepEqual(gameGenres(["Комп’ютерна рольова гра", 'role-playing video game', '2015 video game']), ['рольова гра', 'role-playing game']);
  assert.equal(devName('Nintendo Entertainment Planning & Development'), 'Nintendo EPD');
  assert.equal(devName('Monolith Soft Inc.'), 'Monolith Soft');
  assert.equal(devName('Square Enix Co., Ltd.'), 'Square Enix');
});

test('игры всех платформ из Wikidata: платформы, разработчик, год; известная — первой; со Steam склеено по коду', async () => {
  const d = deps([
    [WD_SEARCH, { query: { search: [{ title: 'Q3' }, { title: 'Q1' }, { title: 'Q2' }] } }],
    [WD_ENT, { search: [{ id: 'Q9', label: 'Zelda', description: 'fictional character' }] }],
    ['https://query.wikidata.org/sparql', (url) => sparqlRows(decodeURIComponent(url).includes('VALUES ?g') ? [
      ...gameRows({ id: 'Q1', links: 52, en: 'The Legend of Zelda: Breath of the Wild', date: '2017-03-03T00:00:00Z', wiki: 'BotW', pfs: 'Q122761124 Q56942 Q19610114',
        gns: 'постапокалиптическая компьютерная игра|приключенческий экшен', pubs: 'Nintendo' },
        [{ by: 'Monolith Soft Inc.', n: 21 }, { by: 'Nintendo Entertainment Planning & Development', n: 18 }, { by: 'Microsoft', n: 178, late: true }]),
      ...gameRows({ id: 'Q2', links: 40, mul: 'Elden Ring', date: '2022-02-25T00:00:00Z', steam: '1245620', wiki: 'Elden_Ring', pfs: 'Q63184502 Q1406' }, [{ by: 'Microsoft', n: 178, late: true }, { by: 'FromSoftware', n: 30 }]),
      ...gameRows({ id: 'Q3', links: 2, en: 'Zelda', date: '1989-01-01T00:00:00Z' }),
    ] : [])],
    ['https://en.wikipedia.org/w/api.php', { query: { normalized: [{ from: 'Elden_Ring', to: 'Elden Ring' }], redirects: [{ from: 'BotW', to: 'Breath of the Wild' }], pages: {
      1: { title: 'Breath of the Wild', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/c/c6/BotW.jpg?utm_source=x', width: 273, height: 365 } },
      2: { title: 'Elden Ring', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/b/b9/ER.jpg', width: 300, height: 300 } },
    } } }],
  ], { cover: async () => [{ id: '1245620', title: 'ELDEN RING', sub: 'Игра', art: 'https://s/er.jpg', tall: true }, { id: '777', title: 'Zelda-like Indie', sub: 'Игра', art: 'https://s/z.jpg', tall: true }] });
  const r = await findWorks('game', 'zelda', d);
  assert.equal(r.src, 'Wikidata, Wikipedia, Steam');
  assert.deepEqual(r.items.map((x) => x.title), ['The Legend of Zelda: Breath of the Wild', 'Zelda', 'Elden Ring', 'Zelda-like Indie'],
    'малоизвестная «Zelda» — не первой, хоть название и совпало; без слова запроса в названии — после; только из Steam — в конце');
  const [botw, , er, indie] = r.items;
  assert.equal(botw.note, 'Switch, Wii U, Switch 2');
  assert.equal(botw.by, 'Nintendo EPD, Monolith Soft', 'первой — студия издателя, хоть помогавшая и известнее');
  assert.equal(r.items[2].by, 'FromSoftware, Microsoft', 'пришедший потом разработчик — в конце, хоть он и известнее');
  assert.equal(botw.year, '2017');
  assert.deepEqual(botw.genres, ['приключенческий экшен']);
  assert.equal(botw.id, 'Q1', 'без Steam — код Wikidata');
  assert.equal(botw.art, 'https://upload.wikimedia.org/wikipedia/en/c/c6/BotW.jpg', 'обложка через перенаправление, без хвоста ?utm');
  assert.equal(botw.tall, true);
  assert.equal(er.id, '1245620', 'та же игра в Steam — по коду Steam из Wikidata');
  assert.equal(er.art, 'https://s/er.jpg', 'обложка — из Steam');
  assert.equal(er.alt, 'https://upload.wikimedia.org/wikipedia/en/b/b9/ER.jpg', 'запасная — из Википедии');
  assert.equal(er.note, 'PS5, PC');
  assert.equal(indie.note, 'PC', 'только из Steam — значит, PC');
  assert.ok(!d.asked.some((u) => decodeURIComponent(u).includes('VALUES ?dev')), 'персонаж — не студия: её игры не ищем');
  assert.match(decodeURIComponent(d.asked.find((u) => u.startsWith(WD_SEARCH))), /zelda haswbstatement:P31=Q7889/);
});

test('игры: Steam к игре Wikidata по названию — только однозначно: чужой код и одинаковые названия не склеиваются', async () => {
  assert.equal(norm('STAR WARS™ Battlefront™ II'), 'star wars battlefront ii', '™ вплотную к слову не превращается в «tm»');
  const run = async (q, rows, steam, extra = []) => {
    const d = deps([
      [WD_SEARCH, { query: { search: rows.map((g) => ({ title: g.id })) } }],
      [WD_ENT, { search: [] }],
      ['https://query.wikidata.org/sparql', sparqlRows(rows.flatMap((g) => gameRows(g)))],
      ['https://en.wikipedia.org/w/api.php', { query: { pages: {} } }],
      ...extra,
    ], { cover: async () => steam });
    return (await findWorks('game', q, d)).items.map((x) => [x.title, x.year, x.id]);
  };
  const card = (id, title) => ({ id, title, sub: 'Игра', art: `https://s/${id}.jpg`, tall: true });
  // в Steam только ремейк: его код есть в Wikidata у ремейка — игра 2001 года его не забирает, обе на месте
  assert.deepEqual(await run('silent hill 2', [
    { id: 'Q752835', links: 60, en: 'Silent Hill 2', date: '2001-09-24T00:00:00Z', pfs: 'Q1406 Q10680' },
    { id: 'Q114770599', links: 30, en: 'Silent Hill 2', date: '2024-10-08T00:00:00Z', steam: '2124490', pfs: 'Q63184502 Q1406' },
  ], [card('2124490', 'SILENT HILL 2')]), [['Silent Hill 2', '2001', 'Q752835'], ['Silent Hill 2', '2024', '2124490']]);
  // у Wikidata нет кода, а название в списке не одно — Steam-игра остаётся отдельной
  assert.deepEqual(await run('god of war', [
    { id: 'Q1', links: 50, en: 'God of War', date: '2005-03-22T00:00:00Z' },
    { id: 'Q2', links: 60, en: 'God of War', date: '2018-04-20T00:00:00Z' },
  ], [card('1593500', 'God of War')]), [['God of War', '2018', 'Q2'], ['God of War', '2005', 'Q1'], ['God of War', '', '1593500']]);
  // одно название, код ничей, ™ не мешает — та же игра
  assert.deepEqual(await run('star wars battlefront', [{ id: 'Q3', links: 40, en: 'Star Wars Battlefront II', date: '2017-11-17T00:00:00Z', pfs: 'Q1406' }],
    [card('1237950', 'STAR WARS™ Battlefront™ II')]), [['Star Wars Battlefront II', '2017', '1237950']]);
  // названия без латиницы и кириллицы (после norm пустые) не совпадают друг с другом
  assert.deepEqual(await run('kirby', [{ id: 'Q4', links: 20, mul: '星のカービィ', date: '1992-04-27T00:00:00Z' }], [card('555', '三国志')]),
    [['星のカービィ', '1992', 'Q4'], ['三国志', '', '555']]);
});

test('игры студии: свои первыми, изданные потом; песня и игра со студией в описании — не студия', async () => {
  const d = deps([
    [WD_SEARCH, { query: { search: [] } }],
    [WD_ENT, { search: [
      { id: 'Q10', label: 'Capcom', description: '2017 single by Post Malone' },
      { id: 'Q12', label: 'Capcom Fighting', description: 'компьютерная игра, разработанная студией Capcom' },
      { id: 'Q11', label: 'Capcom', description: 'Japanese video game developer and publisher' },
    ] }],
    ['https://query.wikidata.org/sparql', (url) => {
      const u = decodeURIComponent(url);
      if (u.includes('VALUES ?dev')) return sparqlRows([['Q20', 80], ['Q21', 50], ['Q22', 44]].map(([g, links]) => ({ g: E(g), dev: E('Q11'), links })));
      return sparqlRows([
        ...gameRows({ id: 'Q20', links: 80, en: 'Grand Theft Auto III', date: '2001-10-22T00:00:00Z' }, [{ by: 'Rockstar North' }]),
        ...gameRows({ id: 'Q21', links: 50, en: 'Resident Evil 4', date: '2005-01-11T00:00:00Z' }, [{ by: 'Capcom' }]),
        ...gameRows({ id: 'Q22', links: 44, en: 'Resident Evil', date: '1996-03-22T00:00:00Z' }, [{ by: 'Capcom' }]),
      ]);
    }],
    ['https://en.wikipedia.org/w/api.php', { query: { pages: {} } }],
  ], { cover: async () => [{ id: '42', title: 'Capcom', sub: 'Игра', art: 'https://s/42.jpg', tall: true }] });
  const r = await findWorks('game', 'capcom', d);
  assert.deepEqual(r.items.map((x) => [x.title, x.by]), [['Resident Evil 4', 'Capcom'], ['Resident Evil', 'Capcom'], ['Grand Theft Auto III', 'Rockstar North'], ['Capcom', '']],
    'игра из Steam, названная как студия, не ставит себя выше игр студии');
  const q = decodeURIComponent(d.asked.find((u) => decodeURIComponent(u).includes('VALUES ?dev')));
  assert.match(q, /VALUES \?dev \{ wd:Q11 \}/, 'спрашиваем только про студию');
  assert.match(q, /\{ \?g wdt:P178 \?dev \} UNION \{ \?g wdt:P123 \?dev \}/, 'разработчик или издатель');
});

test('игры по-русски: поиск Wikidata и транслитом, русское название; не нашлось — Steam через поиск обложек', async () => {
  const d = deps([
    [WD_SEARCH, (url) => ({ query: { search: decodeURIComponent(url).includes('vedmak') ? [{ title: 'Q5' }] : [{ title: 'Q4' }] } })],
    [WD_ENT, { search: [] }],
    ['https://query.wikidata.org/sparql', sparqlRows([
      ...gameRows({ id: 'Q4', links: 60, en: 'The Witcher 3: Wild Hunt', lo: 'Ведьмак 3: Дикая Охота', date: '2015-05-19T00:00:00Z', steam: '292030', pfs: 'Q1406 Q5014725' }, [{ by: 'CD Projekt RED' }]),
      ...gameRows({ id: 'Q5', links: 30, en: 'The Witcher 2: Assassins of Kings', lo: 'Ведьмак 2: Убийцы королей', date: '2011-05-17T00:00:00Z' }),
    ])],
    ['https://en.wikipedia.org/w/api.php', { query: { pages: {} } }],
  ], { translit: () => 'vedmak 3', steam: async (list) => list.map((i) => ({ id: String(i.id), title: 'The Witcher 3', sub: 'Игра', art: `https://s/${i.id}.jpg`, tall: true })) });
  const r = await findWorks('game', 'ведьмак 3', d);
  assert.deepEqual(r.items.map((x) => [x.ru, x.title]), [['Ведьмак 3: Дикая Охота', 'The Witcher 3: Wild Hunt'], ['Ведьмак 2: Убийцы королей', 'The Witcher 2: Assassins of Kings']]);
  assert.equal(r.items[0].art, 'https://s/292030.jpg', 'обложка из Steam по коду из Wikidata');
  assert.equal(d.asked.filter((u) => u.startsWith(WD_SEARCH)).length, 2, 'поиск и по-русски, и транслитом');
  assert.match(decodeURIComponent(d.asked.find((u) => u.startsWith('https://query.wikidata.org/'))), /LANG\(\?lo\) = "ru"/);
  let coverAsked = '';
  const e = deps([[WD_SEARCH, { query: { search: [] } }], [WD_ENT, { search: [] }]], {
    cover: async (kind, q) => { coverAsked = q; return [{ id: '1817070', title: "Marvel's Spider-Man Remastered", sub: 'Игра', art: 'https://s/sm.jpg', tall: true }]; },
  });
  const s = await findWorks('game', 'спайдермен', e);
  assert.equal(coverAsked, 'спайдермен', 'Wikidata ничего не знает — Steam сам переведёт название');
  assert.deepEqual(s.items.map((x) => x.title), ["Marvel's Spider-Man Remastered"]);
});

test('игры: SPARQL не ответил — список из API Wikidata: название, год из описания, обложка, известные первыми', async () => {
  const many = Object.fromEntries(['enwiki', 'ruwiki', 'dewiki', 'frwiki', 'jawiki', 'eswiki'].map((k) => [k, { title: 'Bloodborne' }]));
  const d = deps([
    [WD_SEARCH, { query: { search: [{ title: 'Q99' }, { title: 'Q17154554' }] } }],
    [WD_ENT, { search: [] }],
    ['https://www.wikidata.org/w/api.php?format=json&action=wbgetentities', { entities: {
      Q99: { labels: { en: { value: 'Bloodborne' } }, descriptions: { en: { value: '2030 fan game' } }, sitelinks: {} },
      Q17154554: { labels: { mul: { value: 'Bloodborne' } }, descriptions: { en: { value: '2015 video game' } }, sitelinks: many },
    } }],
    ['https://en.wikipedia.org/w/api.php', { query: { pages: { 1: { title: 'Bloodborne', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/6/68/BB.jpg', width: 288, height: 345 } } } } }],
  ]);
  const r = await findWorks('game', 'bloodborne', d);
  assert.deepEqual(r.items.map((x) => [x.title, x.year, x.art]), [['Bloodborne', '2015', 'https://upload.wikimedia.org/wikipedia/en/6/68/BB.jpg'], ['Bloodborne', '2030', '']],
    'у какой больше статей в Википедиях — та и первая');
  assert.ok(d.asked.some((u) => u.startsWith('https://query.wikidata.org/')), 'сначала спросили SPARQL');
});

test('заведения: вид по-русски, адрес, повторы убраны; рядом — по примерному месту', async () => {
  const f = (name, v, city, street, n) => ({ properties: { name, osm_value: v, city, street, housenumber: n } });
  const items = foodItems({ features: [f('Пузата Хата', 'fast_food', 'Київ', 'вулиця Верхній Вал', '28-30'), f('Пузата Хата', 'fast_food', 'Київ', 'вулиця Верхній Вал', '28-30'), f('Kava', 'cafe', 'Львів'), { properties: {} }] });
  assert.deepEqual(items.map((x) => [x.title, x.sub, x.note]), [['Пузата Хата', 'Фастфуд', 'Київ, вулиця Верхній Вал 28-30'], ['Kava', 'Кафе', 'Львів']]);
  const d = deps([['https://photon.komoot.io/api/', { features: [] }]], { geo: { lat: 50.4, lon: 30.5 } });
  const r = await findWorks('food', 'пузата хата', d);
  assert.equal(r.src, '© OpenStreetMap');
  assert.match(d.asked[0], /osm_tag=amenity:restaurant/);
  assert.match(d.asked[0], /&lat=50\.4&lon=30\.5/);
});

test('техника: только устройства по описанию, фото и год', async () => {
  const s = { search: [
    { id: 'Q1', label: 'iPhone 15', description: 'смартфон компании Apple 2023 года' },
    { id: 'Q2', label: 'яблоко', description: 'плод яблони, фрукт' },
    { id: 'Q3', label: 'PlayStation 5', description: 'игровая приставка Sony' },
    { id: 'Q4', label: 'PlayStation All-Stars', description: 'компьютерная игра 2012 года' },
    { id: 'Q5', label: 'PlayStation Studios', description: 'группа разработчиков компьютерных игр' },
  ] };
  const items = techItems(s, new Map([['Q1', 'https://upload.wikimedia.org/x/500px-IPhone_15.png']]));
  assert.deepEqual(items.map((x) => x.title), ['iPhone 15', 'PlayStation 5']);
  assert.equal(items[0].year, '2023');
  assert.equal(items[0].thumb, 'https://upload.wikimedia.org/x/250px-IPhone_15.png');
  assert.equal(items[1].art, '');
  const d = deps([
    ['https://www.wikidata.org/w/api.php?format=json&action=wbsearchentities', s],
    ['https://www.wikidata.org/w/api.php?format=json&action=query&prop=pageimages', { query: { pages: { 1: { title: 'Q3', thumbnail: { source: 'https://upload.wikimedia.org/p/500px-PS5.png?utm_source=x' } } } } }],
  ]);
  const r = await findWorks('tech', 'PlayStation', d);
  assert.equal(r.items.find((x) => x.title === 'PlayStation 5').art, 'https://upload.wikimedia.org/p/500px-PS5.png', 'хвост ?utm… отрезан');
  assert.match(d.asked.find((u) => u.includes('prop=pageimages')), /titles=Q1\|Q3$/, 'фото спрашиваются только у устройств');
});

test('техника: нишевые модели — из подсказок поисковика, без служебного и чужих слов', async () => {
  const ac = [{ phrase: 'atk gear' }, { phrase: 'atk hub software' }, { phrase: 'atkins' }, { phrase: 'atk raider 13 evo' }, { phrase: 'atk store' }, { phrase: 'atk x1 pro max' }, { phrase: 'atk' }];
  assert.deepEqual(suggestItems(ac, 'ATK').map((x) => x.title), ['ATK Gear', 'ATK Raider 13 Evo', 'ATK X1 Pro Max'], 'короткий запрос — целым словом; «store», «software» и повтор запроса — мимо');
  const ru = suggestItems([{ phrase: 'наушники sony' }, { phrase: 'наушники sony wh-1000xm5' }, { phrase: 'наушники sony wh-1000 xm5 или аирподс макс' }], 'наушники sony');
  assert.deepEqual(ru.map((x) => [x.sub, x.title]), [['Наушники', 'Sony WH-1000XM5']], 'вид устройства — в sub, «или …» — мимо');
  assert.deepEqual(suggestItems([{ phrase: 'logitech g29' }, { phrase: 'logitech options' }], 'logitec').map((x) => x.title), ['Logitech G29'], 'длинный запрос дополняется');
  // в поиске: сначала Wikidata (с фото), потом модели из подсказок, повторы — один раз
  const d = deps([
    ['https://www.wikidata.org/w/api.php?format=json&action=wbsearchentities', { search: [{ id: 'Q9', label: 'ATK X1', description: 'computer mouse' }] }],
    ['https://www.wikidata.org/w/api.php?format=json&action=query&prop=pageimages', { query: { pages: {} } }],
    ['https://duckduckgo.com/ac/', [{ phrase: 'atk x1' }, { phrase: 'atk x1 ultimate' }]],
  ]);
  const r = await findWorks('tech', 'atk x1', d);
  assert.deepEqual(r.items.map((x) => x.title), ['ATK X1', 'ATK X1 Ultimate']);
  assert.equal(r.src, 'Wikidata, DuckDuckGo');
  // подсказки не ответили — остаётся Wikidata
  const d2 = deps([['https://www.wikidata.org/w/api.php?format=json&action=wbsearchentities', { search: [] }]]);
  assert.deepEqual((await findWorks('tech', 'atk', d2)).items, []);
});

test('неизвестный вид — пусто, список видов — как на странице', async () => {
  assert.deepEqual(await findWorks('music', 'x', deps([])), { items: [], src: '' });
  assert.deepEqual(WORK_KINDS, ['book', 'anime', 'hentai', 'movie', 'game', 'food', 'tech']);
});
