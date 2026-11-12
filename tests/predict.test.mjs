// «Прогнозы» на победителя сбора лотов: когда открыты и какой лот выпал. node --test tests/predict.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictOpen, winnerLot } from '../functions/_lib/lots-predict.js';

test('прогнозы открыты до первой прокрутки и закрываются на ней', () => {
  assert.equal(predictOpen(null), true);
  assert.equal(predictOpen({ mode: 'out' }), true);
  assert.equal(predictOpen({ res: { n: 'Hades', id: 'a1' } }), false);
  assert.equal(predictOpen({ hist: ['Doom'] }), false);
  assert.equal(predictOpen({ outIds: ['a2'] }), false);
  assert.equal(predictOpen({ winner: { n: 'Hades', at: 1 } }), false);
});

test('выпавший лот: по id, а без него — единственный оставшийся с именем победителя', () => {
  const lots = [{ id: 'a1', name: 'Hades' }, { id: 'a2', name: 'Hades' }, { id: 'a3', name: 'Doom' }];
  assert.equal(winnerLot({ winner: { n: 'Hades', at: 5 }, pickL: 'a2' }, lots), 'a2');
  assert.equal(winnerLot({ winner: { n: 'Hades', at: 5 }, outIds: ['a1'] }, lots), 'a2');
  assert.equal(winnerLot({ winner: { n: 'Hades', at: 5 } }, lots), ''); // два «Hades» — не угадать, какой
  assert.equal(winnerLot({ mode: 'out' }, lots), '');
});
