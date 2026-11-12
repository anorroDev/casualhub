// «Царь Горы»: посев сетки, бои горы и сетки, отмена, голоса. node --test tests/king.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, cleanConfig, newState, startState, decide, closeByVotes, undoLast, finishEarly, buildRounds, addPeople, removePerson, setRules, bracketErr } from '../functions/_lib/king.js';

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

test('сетка заполняется целиком: ровно столько участников, каков её размер', () => {
  const names = (n) => Array.from({ length: n }, (_, i) => 'P' + (i + 1));
  for (const size of [4, 8, 16, 32]) {
    assert.ok(!cleanConfig({ fmt: 'bracket', size, p: names(size) }).err, `${size} из ${size}`);
    assert.match(cleanConfig({ fmt: 'bracket', size, p: names(size - 1) }).err, new RegExp(`ровно ${size} .*добавь ещё 1`));
  }
  // лишние не обрезаются молча — сказано, сколько убрать
  assert.match(cleanConfig({ fmt: 'bracket', size: 8, p: names(10) }).err, /помещается ровно 8 участников, сейчас 10: убери 2 или выбери сетку побольше/);
  assert.match(cleanConfig({ fmt: 'bracket', size: 32, p: names(33) }).err, /убери 1\.$/);
  // без размера — ближайшая подходящая сетка, и её тоже нужно заполнить
  assert.match(cleanConfig({ fmt: 'bracket', p: names(5) }).err, /Для сетки на 8 нужно ровно 8 участников, сейчас 5: добавь ещё 3/);
  assert.equal(cleanConfig({ fmt: 'bracket', p: names(4) }).size, 4);
  // повторы названий не считаются: «A» и «a» — один участник
  assert.equal(cleanConfig({ fmt: 'bracket', size: 4, p: ['A', 'a', 'B', 'C', 'D '] }).p.length, 4);
  assert.match(cleanConfig({ fmt: 'bracket', size: 4, p: ['A', 'a', 'B', 'C'] }).err, /сейчас 3: добавь ещё 1/);
  assert.equal(bracketErr(4, 4), '');
  assert.match(bracketErr(3, 4), /ровно 4 участника/);
  // в первом круге сетки нет пропусков: все играют
  const st = newState(cfg({ fmt: 'bracket', size: 8, p: names(8) }));
  assert.ok(startState(st, 0).ok);
  assert.equal(st.rounds[0].filter((m) => m.w).length, 0);
  assert.equal(st.bout.a, st.p[0].id);
  assert.equal(st.bout.b, st.p[7].id);
});

test('до начала: ведущий убирает и добавляет участников, начать сетку можно только заполненной', () => {
  const st = newState(cfg({ fmt: 'bracket', size: 4, p: ['A', 'B', 'C', 'D'] }));
  assert.equal(st.status, 'ready');
  assert.ok(removePerson(st, st.p[1].id).ok);
  assert.equal(st.p.length, 3);
  assert.match(startState(st, 0).err[1], /добавь ещё 1/);
  assert.equal(st.status, 'ready');
  assert.ok(addPeople(st, ['B', 'E']).ok, 'в сетку на 4 — только до заполнения');
  assert.equal(st.p.length, 4);
  assert.match(addPeople(st, ['F']).err[1], /Больше 4/);
  // поменяли размер — снова нужно заполнить
  assert.ok(setRules(st, { size: 8 }, 0).ok);
  assert.match(startState(st, 0).err[1], /ровно 8.*добавь ещё 4/);
  assert.ok(setRules(st, { size: 4 }, 0).ok);
  assert.ok(startState(st, 0).ok);
  // идёт сетка: убрать никого нельзя
  assert.ok(removePerson(st, st.p[0].id).err);
});

test('идёт гора: убрать можно только того, кто ждёт в очереди; новые встают в конец', () => {
  const st = newState(cfg({ fmt: 'hill', p: ['A', 'B', 'C', 'D'] }));
  startState(st, 0);
  const id = (n) => st.p.find((x) => x.n === n).id;
  assert.ok(removePerson(st, id('A')).err, 'царь на горе');
  assert.ok(removePerson(st, id('B')).err, 'претендент в бою');
  assert.ok(removePerson(st, id('C')).ok);
  assert.deepEqual(st.queue, [id('D')]);
  assert.ok(addPeople(st, ['E']).ok);
  assert.deepEqual(st.queue, [id('D'), id('E')]);
  decide(st, 'a', 'host', null, 1);
  assert.ok(removePerson(st, id('B')).err, 'выбывшего уже нет в очереди');
});

test('свои картинки участников (обложки из «Мнения»): маленький data URL — в king_imgs, в снимке «@»', () => {
  const small = 'data:image/jpeg;base64,' + 'A'.repeat(100);
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(20000);
  const imgs = [];
  const st = newState(cleanConfig({ fmt: 'hill', p: [{ n: 'A', img: small }, { n: 'B', img: big }, { n: 'C', img: 'https://x.y/z.png' }, { n: 'D', img: 'data:text/html;base64,AAAA' }] }), imgs);
  assert.deepEqual(st.p.map((x) => x.img), ['@', '', 'https://x.y/z.png', '']);
  assert.deepEqual(imgs, [{ id: st.p[0].id, data: small }]);
  const more = [];
  assert.ok(addPeople(st, [{ n: 'E', img: small }], more).ok);
  assert.deepEqual(more, [{ id: st.p[4].id, data: small }]);
  // без списка картинок (старый вызов) участник остаётся без картинки, а не с «@» без данных
  assert.equal(newState(cleanConfig({ fmt: 'hill', p: [{ n: 'A', img: small }, { n: 'B' }] })).p[0].img, '');
});
