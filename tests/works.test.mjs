// Тесты поиска произведений для «Новой оценки» (functions/_lib/works.js): node --test tests/works.test.mjs
// Сеть подменена: ответы источников — по началу адреса.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWorks, cyrTitle, bookItems, foodItems, techItems, ordered, nameHit, WORK_KINDS } from '../functions/_lib/works.js';

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

test('игры: разработчик из Wikidata — его игры из Steam с автором', async () => {
  const d = deps([
    ['https://www.wikidata.org/w/api.php', { search: [{ id: 'Q2414470', label: 'FromSoftware', description: 'Japanese video game developer' }] }],
    ['https://query.wikidata.org/sparql', sparqlRows([{ steam: 1245620, dev: 'http://www.wikidata.org/entity/Q2414470', links: 46 }, { steam: 211420, dev: 'http://www.wikidata.org/entity/Q2414470', links: 40 }])],
  ], {
    cover: async () => [{ id: '999', title: 'FromSoftware Tribute', sub: 'Игра', art: 'https://s/x.jpg', tall: true }],
    steam: async (list) => list.map((i) => ({ id: String(i.id), title: i.id === 1245620 ? 'ELDEN RING' : 'DARK SOULS', sub: 'Игра', art: `https://s/${i.id}.jpg`, tall: true })),
  });
  const r = await findWorks('game', 'FromSoftware', d);
  assert.deepEqual(r.items.map((x) => x.title), ['ELDEN RING', 'DARK SOULS', 'FromSoftware Tribute']);
  assert.equal(r.items[0].by, 'FromSoftware');
  assert.equal(r.items[0].id, '1245620');
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
  assert.match(d.asked[1], /titles=Q1\|Q3$/, 'фото спрашиваются только у устройств');
});

test('неизвестный вид — пусто, список видов — как на странице', async () => {
  assert.deepEqual(await findWorks('music', 'x', deps([])), { items: [], src: '' });
  assert.deepEqual(WORK_KINDS, ['book', 'anime', 'hentai', 'movie', 'game', 'food', 'tech']);
});
