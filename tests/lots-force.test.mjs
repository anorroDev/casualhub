// «Настройка лотов» (keep/kick): отметки по id лота и прежние — по названию. node --test tests/lots-force.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLive, spinLive, advanceLive } from '../functions/_lib/lots-live.js';

// два «Hades» — разные лоты (ведущий разрешил повторы)
const LOTS = [{ id: 'aaaaaa01', name: 'Hades' }, { id: 'aaaaaa02', name: 'Hades' }, { id: 'aaaaaa03', name: 'Celeste' }, { id: 'aaaaaa04', name: 'Doom' }];
// какие лоты выпадают за много прокруток
function picks(live, mode) {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const r = spinLive(cleanLive(live), LOTS, mode, 8, 1e12 + i * 1e6, false);
    assert.ok(!r.err, r.err && r.err[1]);
    seen.add(r.live.res.id); // выпавший лот прокрутки (pickL появится, когда прокрутка доиграет)
  }
  return [...seen].sort();
}

test('по id: вылетает ровно отмеченный лот, даже если у двух одно название', () => {
  assert.deepEqual(picks({ kickIds: ['aaaaaa02'] }, 'out'), ['aaaaaa02']);
});

test('по id: «Один победитель» — из оставленных', () => {
  assert.deepEqual(picks({ keepIds: ['aaaaaa01'] }, 'one'), ['aaaaaa01']);
});

test('«На выбывание»: оставленные не вылетают, пока есть другие', () => {
  assert.deepEqual(picks({ keepIds: ['aaaaaa01', 'aaaaaa03'] }, 'out'), ['aaaaaa02', 'aaaaaa04']);
});

test('старые снимки по названиям работают как раньше (оба «Hades»)', () => {
  assert.deepEqual(picks({ kick: ['hades'] }, 'out'), ['aaaaaa01', 'aaaaaa02']);
});

test('выпавший лот удалили посреди прокрутки — не вылетает никто, а не второй «Hades»', () => {
  const r = spinLive(cleanLive({ kickIds: ['aaaaaa01'] }), LOTS, 'out', 1, 1e12, false);
  assert.equal(r.live.res.id, 'aaaaaa01');
  const live = r.live;
  const left = LOTS.filter((l) => l.id !== 'aaaaaa01');
  assert.ok(advanceLive(live, live.res.end + 5000, left));
  // не вылетел никто: пустой id на месте выпавшего, outIds — парой с out и hist
  assert.deepEqual(live.outIds, ['']);
  assert.deepEqual([live.out.length, live.hist.length], [1, 1]);
  assert.equal(live.segs.length, left.length);
  assert.equal(live.winner, null);
  // и вторая такая прокрутка не съедает пару: пустых id — два
  const again = spinLive(live, left, 'out', 1, 2e12, false).live;
  advanceLive(again, again.res.end + 5000, left.filter((l) => l.id !== again.res.id));
  assert.deepEqual([again.outIds, again.out.length], [['', ''], 2]);
  // прокрутка из снимка до id (res без id) — как раньше: первый живой с таким названием
  const old = spinLive(cleanLive({ kickIds: ['aaaaaa01'] }), LOTS, 'out', 1, 1e12, false).live;
  delete old.res.id;
  advanceLive(old, old.res.end + 5000, LOTS);
  assert.deepEqual(old.outIds, ['aaaaaa01']);
});

test('без отметок — все лоты; мусорные и повторные id отбрасываются', () => {
  assert.deepEqual(picks({}, 'out'), ['aaaaaa01', 'aaaaaa02', 'aaaaaa03', 'aaaaaa04']);
  assert.deepEqual(cleanLive({ kickIds: ['zz', 'aaaaaa03', 'aaaaaa03', 7, '<b>'] }).kickIds, ['aaaaaa03']);
});
