// «Тир-лист вместе»: комната, раскладка, средний тир-лист. node --test tests/tiercoop.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cleanRoom, cleanPicks, average, TC } from '../functions/_lib/tiercoop.js';

const room = cleanRoom({ title: 'Игры', rows: [{ t: 'S', c: '#ff0000' }, { t: 'A', c: 'red' }, { t: 'B' }], items: [{ n: 'Hades' }, { n: 'hades' }, { n: 'Doom', img: 'javascript:alert(1)' }, { n: 'Celeste', img: 'https://x.test/c.png' }] });
test('комната: повторы убираются, чужие ссылки на картинки — нет, цвета проверяются', () => {
  assert.equal(room.items.length, 3);
  assert.equal(room.items[1].img, '');
  assert.equal(room.items[2].img, 'https://x.test/c.png');
  assert.equal(room.rows[1].c, '#6B7280');
  assert.ok(cleanRoom({ rows: [{ t: 'S' }], items: [{ n: 'a' }, { n: 'b' }] }).err);
});
test('раскладка: только свои элементы и существующие ряды', () => {
  assert.deepEqual(cleanPicks({ i0: 0, i1: 7, zz: 1, i2: '2' }, room), { i0: 0, i2: 2 });
});
test('средний: ряд по среднему, голоса и разброс', () => {
  const a = average(room, [{ i0: 0, i1: 2 }, { i0: 1, i1: 0 }, { i0: 0 }]);
  const h = a.find((x) => x.id === 'i0'), d = a.find((x) => x.id === 'i1'), c = a.find((x) => x.id === 'i2');
  assert.equal(h.row, 0); assert.equal(h.n, 3);
  assert.equal(d.row, 1); assert.equal(d.spread, 1);
  assert.equal(c.row, -1); assert.equal(c.n, 0);
});

// страница (tierlist/coop.js) до создания комнаты говорит, что в неё не попадёт: её правила — те же, что у cleanRoom
const COOP_SRC = readFileSync(new URL('../tierlist/coop.js', import.meta.url), 'utf8');
function coopPage() {
  const ctx = { window: {}, document: { createElement: () => ({}), head: { appendChild() {} } }, location: { search: '' }, URLSearchParams, localStorage: { getItem: () => null } };
  vm.createContext(ctx);
  vm.runInContext(COOP_SRC, ctx);
  return ctx.window.CasualTierCoop;
}
const plain = (v) => JSON.parse(JSON.stringify(v)); // объекты из песочницы — для deepEqual
test('«Вместе»: лимиты страницы — те же, что у сервера', () => {
  const m = /const ROOM = \{ ROWS: (\d+), ITEMS: (\d+), NAME: (\d+) \}/.exec(COOP_SRC);
  assert.ok(m, 'ROOM в tierlist/coop.js');
  assert.deepEqual(m.slice(1).map(Number), [TC.ROWS, TC.ITEMS, TC.NAME]);
});
test('«Вместе»: страница заранее знает, что обрежет сервер, и отправляет ровно то, что он оставит', () => {
  const { plan } = coopPage();
  // 75 карточек в 12 рядах и без места: повторы названий (и другим регистром), картинки с устройства, стикеры, без названия
  const items = {}, rows = [], pool = [];
  for (let i = 0; i < 75; i++) {
    const id = 'c' + i, kind = i % 6 === 0 ? 'img' : i % 6 === 1 ? 'url' : 'text';
    const name = i % 11 === 0 ? (i % 2 ? 'Hades' : 'HADES') : i === 8 ? '' : `Карточка  ${i}`;
    items[id] = { id, kind, name, ...(kind === 'url' ? { src: `/wheel/hub/roflan/r${i}.png` } : kind === 'img' ? { img: 'ti_' + i } : {}) };
    if (i < 60) { const k = i % 12; (rows[k] = rows[k] || { id: 'r' + k, label: 'Ряд ' + k, color: '#43C97A', items: [] }).items.push(id); } else pool.push(id);
  }
  const l = { title: 'Игры', rows, pool, items };
  const p = plain(plan(l));
  // как страница отправляла раньше: всё подряд, а обрезал сервер
  const all = [...rows.flatMap((r) => r.items), ...pool];
  const before = cleanRoom({ title: l.title, rows: rows.map((r) => ({ t: r.label, c: r.color })), items: all.map((id, k) => ({ n: items[id].name.trim() || `Элемент ${k + 1}`, img: items[id].kind === 'url' ? items[id].src : '' })) });
  const now = cleanRoom({ title: l.title, rows: p.rows, items: p.items });
  assert.deepEqual(now.items, before.items);
  assert.deepEqual(now.rows, before.rows);
  assert.equal(p.items.length, TC.ITEMS);
  assert.ok(p.cut.same > 0 && p.cut.over > 0);
  assert.equal(p.cut.over + p.cut.same, all.length - p.items.length, 'каждая непопавшая карточка посчитана');
  assert.equal(p.cut.rows, rows.length - TC.ROWS);
  // картинки с устройства среди попавших станут текстом: в комнате у них нет картинки. Попавшая карточка — первая с таким названием
  const first = new Map();
  all.forEach((id, k) => { const n = (items[id].name.replace(/\s+/g, ' ').trim() || `Элемент ${k + 1}`).toLowerCase(); if (!first.has(n)) first.set(n, id); });
  const keptImg = before.items.filter((x) => items[first.get(x.n.toLowerCase())].kind === 'img').length;
  assert.ok(keptImg > 0);
  assert.equal(p.cut.pics, keptImg);
  // в маленьком тир-листе обрезать нечего
  const small = plain(plan({ rows: [{ label: 'S', color: '#43C97A', items: ['a'] }, { label: 'A', color: '#9BCF4E', items: [] }], pool: ['b'], items: { a: { kind: 'url', name: 'Папич', src: '/wheel/hub/papich/p1.webp' }, b: { kind: 'text', name: 'Шаурма' } } }));
  assert.deepEqual(small.cut, { over: 0, same: 0, pics: 0, rows: 0 });
  assert.deepEqual(small.items, [{ n: 'Папич', img: '/wheel/hub/papich/p1.webp' }, { n: 'Шаурма', img: '' }]);
});
