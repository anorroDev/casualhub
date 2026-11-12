// «Царь Горы»: посев сетки, бои горы и сетки, отмена, голоса. node --test tests/king.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, cleanConfig, newState, startState, decide, closeByVotes, undoLast, finishEarly, buildRounds } from '../functions/_lib/king.js';

const cfg = (b) => { const c = cleanConfig(b); assert.ok(!c.err, c.err); return c; };
test('посев сетки: сильные встречаются как можно позже', () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  // 6 участников в сетке на 8: верхние двое проходят первый круг без боя
  const r = buildRounds(['a', 'b', 'c', 'd', 'e', 'f'], 8);
  assert.equal(r[0].filter((m) => m.w).length, 2);
});

test('царь горы: победитель остаётся, серия и рекорд, проигравший выбывает', () => {
  const st = newState(cfg({ fmt: 'hill', p: ['A', 'B', 'C', 'D'] }));
  assert.ok(startState(st, 0).ok);
  const id = (n) => st.p.find((x) => x.n === n).id;
  assert.equal(st.bout.a, id('A'));
  decide(st, 'a', 'host', null, 1); // A побил B
  assert.equal(st.streak, 1);
  decide(st, 'b', 'host', null, 2); // C сверг A
  assert.equal(st.king, id('C'));
  assert.equal(st.streak, 1);
  assert.deepEqual(st.best, { id: id('A'), n: 1 });
  assert.ok(undoLast(st, 3).ok);
  assert.equal(st.king, id('A'));
  decide(st, 'a', 'host', null, 4);
  decide(st, 'a', 'host', null, 5);
  assert.equal(st.status, 'done');
  assert.equal(st.champ, id('A'));
  assert.equal(st.best.n, 3);
});

test('сетка: финал и чемпион; голоса — поровну остаётся верхний', () => {
  const st = newState(cfg({ fmt: 'bracket', size: 4, p: ['A', 'B', 'C', 'D'] }));
  startState(st, 0);
  closeByVotes(st, { a: 2, b: 2 }, 'vote', 1); // поровну — проходит верхний в паре
  closeByVotes(st, { a: 0, b: 3 }, 'vote', 2);
  decide(st, 'a', 'host', null, 3);
  assert.equal(st.status, 'done');
  assert.equal(st.champ, st.p.find((x) => x.n === 'A').id);
});

test('настройки: мало участников — ошибка; закончить гору досрочно', () => {
  assert.ok(cleanConfig({ fmt: 'hill', p: ['A'] }).err);
  assert.ok(cleanConfig({ fmt: 'bracket', size: 8, p: ['A', 'B', 'C'] }).err);
  const st = newState(cfg({ fmt: 'hill', p: ['A', 'B', 'C'] }));
  startState(st, 0);
  assert.ok(finishEarly(st, 1).err, 'сначала хотя бы один бой');
  decide(st, 'a', 'host', null, 2);
  assert.ok(finishEarly(st, 3).ok);
  assert.equal(st.status, 'done');
});
