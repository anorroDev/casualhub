// Статусы оценки словами вида категории (util.js, CasualUtil.status): в оценке лежат общие «Завершено», «В процессе»,
// «В планах», «Брошено», а показываются «Прочитано», «Играю», «Хочу купить»… Браузера нет: util.js выполняется с заглушками.
// node --test tests/status.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../util.js', import.meta.url), 'utf8');
function boot() {
  const style = () => ({ zoom: '', cssText: '', setProperty() {}, removeProperty() {}, getPropertyValue: () => '' });
  class Element { constructor(tag) { this.tagName = tag; this.style = style(); this.children = []; this.dataset = {}; this.classList = { toggle() {}, add() {}, remove() {}, contains: () => false }; } appendChild(c) { this.children.push(c); return c; } getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0 }; } }
  class Document { elementFromPoint() { return null; } }
  class Event { constructor(type) { this.type = type; } }
  class CustomEvent extends Event { constructor(type, o) { super(type); this.detail = o && o.detail; } }
  const document = new Document();
  document.documentElement = new Element('html');
  document.body = document.documentElement.appendChild(new Element('body'));
  document.head = new Element('head');
  document.scripts = [];
  document.createElement = (t) => new Element(t);
  document.dispatchEvent = () => true;
  document.querySelectorAll = () => [];
  const window = { document, screen: { width: 1280 }, innerWidth: 1280, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1, dispatchEvent: () => true, scrollTo() {} };
  window.CSS = { supports: () => false };
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const run = new Function('window', 'document', 'localStorage', 'location', 'addEventListener', 'screen', 'CSS', 'Element', 'MouseEvent', 'Document', 'DOMRect', 'Event', 'CustomEvent', 'setTimeout', 'clearTimeout', 'Range', 'Touch', 'dispatchEvent', SRC);
  run(window, document, localStorage, { search: '', pathname: '/admin/' }, () => {}, window.screen, window.CSS, Element, class {}, Document, class {}, Event, CustomEvent, () => 0, () => {}, undefined, undefined, () => true);
  return window.CasualUtil.status;
}
const st = boot();

test('вид категории по названию: русские, украинские и английские названия', () => {
  const cases = { 'Книги': 'book', 'Игры': 'game', 'Фильмы и сериалы': 'movie', 'Мультфильмы': 'movie', 'Аниме и манга': 'anime', 'Хентай': 'hentai',
    'Еда и заведения': 'food', 'Гаджеты и техника': 'tech', 'Музыка и альбомы': 'music', 'Ігри': 'game', 'Їжа й заклади': 'food', 'Gadgets and tech': 'tech',
    'Books': 'book', 'Кофейни': '', '': '' };
  for (const [name, kind] of Object.entries(cases)) assert.equal(st.kind(name), kind, name);
});

test('слова статусов у каждого вида свои, а храним общие', () => {
  assert.equal(st.label('Завершено', 'Книги'), 'Прочитано');
  assert.equal(st.label('В процессе', 'Книги'), 'Читаю');
  assert.equal(st.label('В планах', 'Книги'), 'Хочу прочитать');
  assert.equal(st.label('Завершено', 'Игры'), 'Пройдено');
  assert.equal(st.label('В процессе', 'Игры'), 'Играю');
  assert.equal(st.label('Просмотрено', 'Фильмы и сериалы'), 'Просмотрено');
  assert.equal(st.label('В процессе', 'Мультфильмы'), 'Смотрю');
  assert.equal(st.label('Завершено', 'Еда и заведения'), 'Попробовано');
  assert.equal(st.label('Брошено', 'Еда и заведения'), 'Не вернусь');
  assert.equal(st.label('В процессе', 'Гаджеты и техника'), 'Пользуюсь');
  assert.equal(st.label('В планах', 'Гаджеты и техника'), 'Хочу купить');
  assert.equal(st.label('Брошено', 'Гаджеты и техника'), 'Не пользуюсь');
  assert.equal(st.label('Завершено', 'Кофейни'), 'Завершено', 'своя категория — общие слова');
  assert.equal(st.label('Просмотрено', 'Кофейни'), 'Завершено', 'фильм, перенесённый в свою категорию');
  assert.equal(st.label('Сингл', 'Музыка и альбомы'), 'Сингл', 'у музыки свои слова — как есть');
  assert.equal(st.label('В планах', 'Музыка и альбомы'), 'В планах');
  assert.equal(st.label('', 'Книги'), '');
});

test('группа статуса и слова вида', () => {
  assert.deepEqual(['Завершено', 'Просмотрено', 'В процессе', 'В планах', 'Брошено', 'Сингл'].map(st.group), ['done', 'done', 'doing', 'plan', 'drop', '']);
  assert.deepEqual(st.words('tech'), { done: 'Опробовано', doing: 'Пользуюсь', plan: 'Хочу купить', drop: 'Не пользуюсь' });
  assert.deepEqual(st.words('нет такого'), { done: 'Завершено', doing: 'В процессе', plan: 'В планах', drop: 'Брошено' });
});

test('у каждого слова статуса есть перевод на английский и украинский', () => {
  const keys = (f) => new Set([...readFileSync(new URL('../' + f, import.meta.url), 'utf8').matchAll(/^("(?:[^"\\]|\\.)*")\s*:/gm)].map((m) => JSON.parse(m[1])));
  const en = keys('lang-en.js'), uk = keys('lang-uk.js');
  for (const kind of ['book', 'game', 'movie', 'anime', 'hentai', 'food', 'tech', '']) {
    for (const w of Object.values(st.words(kind))) { assert.ok(en.has(w), 'нет в lang-en.js: ' + w); assert.ok(uk.has(w), 'нет в lang-uk.js: ' + w); }
  }
});
