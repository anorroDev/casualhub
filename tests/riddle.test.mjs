// «Загадка дня»: выбор по дню, подсказки, сравнение ответов, серия. node --test tests/riddle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POOL, riddleOf, hintsOf, isRight, norm, streakOf } from '../functions/_lib/riddle.js';

test('загадка выбирается по дню, одна на всех; №1 — 12 ноября 2026', () => {
  assert.equal(riddleOf('2026-11-12').n, 1);
  assert.equal(riddleOf('2026-11-13').n, 2);
  assert.deepEqual(riddleOf('2026-11-20').r, riddleOf('2026-11-20').r);
  // за круг по списку загадки не повторяются
  const seen = new Set();
  for (let i = 0; i < POOL.length; i++) seen.add(riddleOf(new Date(Date.UTC(2026, 10, 12) + i * 864e5).toISOString().slice(0, 10)).r.a);
  assert.equal(seen.size, POOL.length);
});

test('у каждой загадки пять подсказок и разные ответы', () => {
  assert.ok(POOL.length >= 60);
  assert.equal(new Set(POOL.map((r) => norm(r.a))).size, POOL.length);
  for (const r of POOL) { assert.equal(hintsOf(r).length, 5); assert.ok(r.y > 1900 && r.y < 2030, r.a); }
});

test('ответ: без регистра и знаков, по вариантам, одна опечатка у длинных', () => {
  const w = POOL.find((r) => r.en === 'The Witcher 3: Wild Hunt');
  assert.ok(isRight(w, 'Ведьмак 3'));
  assert.ok(isRight(w, 'the witcher 3: wild hunt'));
  assert.ok(isRight(w, 'ведмак 3 дикая охота'));
  assert.ok(!isRight(w, 'ведьмак 2'));
  assert.ok(!isRight(w, ''));
  const d = POOL.find((r) => r.a === 'Дюна');
  assert.ok(isRight(d, 'дюна') && isRight(d, 'Dune') && !isRight(d, 'дюны'), 'короткие — без опечаток');
});

test('серия: дни подряд до сегодня или до вчера', () => {
  assert.equal(streakOf(['2026-11-12', '2026-11-11', '2026-11-10'], '2026-11-12'), 3);
  assert.equal(streakOf(['2026-11-11', '2026-11-10'], '2026-11-12'), 2);
  assert.equal(streakOf(['2026-11-10'], '2026-11-12'), 0);
  assert.equal(streakOf([], '2026-11-12'), 0);
});
