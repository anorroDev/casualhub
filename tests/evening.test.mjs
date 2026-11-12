// «Вечер с друзьями»: кто и на что может наложить вето. node --test tests/evening.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vetoCheck } from '../functions/_lib/lots-evening.js';

const lots = [{ id: 'l1', user_id: 'a' }, { id: 'l2', user_id: 'b' }, { id: 'l3', user_id: 'c' }, { id: 'l4', user_id: 'b' }];
test('вето — только на чужой вариант и только у участников', () => {
  assert.equal(vetoCheck({ lots, vetoes: [], uid: 'a', owner: 'h', lot: 'l2' }), '');
  assert.match(vetoCheck({ lots, vetoes: [], uid: 'a', owner: 'h', lot: 'l1' }), /Свой вариант/);
  assert.match(vetoCheck({ lots, vetoes: [], uid: 'z', owner: 'h', lot: 'l2' }), /у тех, кто добавил/);
  assert.equal(vetoCheck({ lots, vetoes: [], uid: 'h', owner: 'h', lot: 'l2' }), '', 'ведущий без своего варианта — тоже с вето');
  assert.match(vetoCheck({ lots, vetoes: [], uid: 'a', owner: 'h', lot: 'nope' }), /нет/);
});
test('один вариант дважды не убрать, и минимум два варианта остаются', () => {
  assert.match(vetoCheck({ lots, vetoes: [{ user_id: 'c', lot_id: 'l2' }], uid: 'a', owner: 'h', lot: 'l2' }), /уже убрали/);
  // своё прежнее вето не мешает переложить его на другой вариант
  assert.equal(vetoCheck({ lots, vetoes: [{ user_id: 'a', lot_id: 'l2' }], uid: 'a', owner: 'h', lot: 'l3' }), '');
  const two = lots.slice(0, 3);
  assert.match(vetoCheck({ lots: two, vetoes: [{ user_id: 'b', lot_id: 'l1' }], uid: 'a', owner: 'h', lot: 'l3' }), /хотя бы два/);
});
