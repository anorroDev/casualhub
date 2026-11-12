// «Бинго для стрима»: линии, свободный центр, карточки, список клише. node --test tests/bingo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineDone, newCard, cleanItems, BINGO_DEFAULT, FREE } from '../functions/_lib/bingo.js';

test('карточка: 24 разных клише и свободный центр', () => {
  const c = newCard(36);
  assert.equal(c.length, 25);
  assert.equal(c[FREE], -1);
  const rest = c.filter((x) => x >= 0);
  assert.equal(new Set(rest).size, 24);
  assert.ok(rest.every((x) => x >= 0 && x < 36));
});

test('линия: ряд, столбец и диагональ; центр закрыт всегда', () => {
  const cells = Array.from({ length: 25 }, (_, i) => (i === FREE ? -1 : i));
  assert.equal(lineDone(cells, [0, 1, 2, 3]), false);
  assert.equal(lineDone(cells, [0, 1, 2, 3, 4]), true, 'первый ряд');
  assert.equal(lineDone(cells, [2, 7, 17, 22]), true, 'средний столбец — с центром');
  assert.equal(lineDone(cells, [0, 6, 18, 24]), true, 'диагональ — с центром');
  assert.equal(lineDone(cells, [10, 11, 13]), false);
});

test('список клише: 24–60 разных, лишнее отбрасывается', () => {
  assert.ok(BINGO_DEFAULT.length >= 30 && cleanItems(BINGO_DEFAULT));
  assert.equal(cleanItems(['a', 'b']), null);
  const many = Array.from({ length: 30 }, (_, i) => `клише ${i}`);
  assert.equal(cleanItems([...many, 'КЛИШЕ 1', ' ', 'x'.repeat(100)]).length, 31);
});
