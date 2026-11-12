// «Тир-лист вместе»: комната, раскладка, средний тир-лист. node --test tests/tiercoop.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRoom, cleanPicks, average } from '../functions/_lib/tiercoop.js';

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
