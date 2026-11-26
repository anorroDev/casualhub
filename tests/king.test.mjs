// «Царь Горы»: посев сетки, бои горы и сетки, отмена, голоса. node --test tests/king.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { seedOrder, cleanConfig, newState, startState, decide, closeByVotes, undoLast, finishEarly, buildRounds, addPeople, removePerson, setRules, bracketErr, allIn, closeAll, makeKingRoutes } from '../functions/_lib/king.js';

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

test('все в комнате высказались: голоса есть — бой закрывается сразу, все «пас» — ждём ведущего', () => {
  assert.equal(allIn([]), false, 'никого — ждать некого, но и закрывать не по кому');
  assert.equal(allIn([{ pick: 'a' }, { pick: null }]), false);
  assert.equal(allIn([{ pick: 'a' }, { pick: 'x' }, { pick: 'b' }]), true);
  const st = newState(cfg({ fmt: 'hill', mode: 'vote', timer: 60, p: ['A', 'B', 'C'] }));
  startState(st, 0);
  const n = st.bout.n;
  assert.ok(closeAll(st, { a: 0, b: 0 }, -1).same, 'бой ещё не открылся');
  // все сказали «пас»: таймер стоит, решает ведущий; второй раз — без перемен
  assert.ok(closeAll(st, { a: 0, b: 0 }, 10).idle);
  assert.deepEqual([st.bout.n, st.bout.ends, st.bout.idle, st.bout.pass], [n, 0, 1, 1]);
  assert.ok(closeAll(st, { a: 0, b: 0 }, 11).same);
  // кто-то передумал и проголосовал — бой закрывается по голосам, отметка «все»
  const r = closeAll(st, { a: 1, b: 2 }, 12);
  assert.equal(r.closed.w, 'b');
  assert.equal(r.closed.by, 'all');
  assert.deepEqual([r.closed.va, r.closed.vb], [1, 2]);
  assert.notEqual(st.bout.n, n);
  // в бою, который решает ведущий, голосов нет — закрывать нечего
  const host = newState(cfg({ fmt: 'hill', p: ['A', 'B'] }));
  startState(host, 0);
  assert.ok(closeAll(host, { a: 1, b: 0 }, 10).same);
});

test('голоса из чата Twitch: ник — как в Twitch, последний голос ника — его, «все высказались» с чатом не закрывает бой', async () => {
  const { cleanChatVotes, allInClose } = await import('../functions/_lib/king.js');
  assert.deepEqual(cleanChatVotes([{ u: 'Viewer_1', pick: 'a' }, { u: 'viewer_1', pick: 'b' }, { u: 'bad nick', pick: 'a' }, { u: 'x'.repeat(26), pick: 'a' }, { u: 'ok', pick: 'x' }, { u: 'two', pick: 'b' }, null]),
    [{ u: 'viewer_1', pick: 'b' }, { u: 'two', pick: 'b' }]);
  assert.deepEqual(cleanChatVotes('nope'), []);
  assert.equal(cleanChatVotes(Array.from({ length: 300 }, (_, i) => ({ u: 'u' + i, pick: 'a' }))).length, 200, 'не больше 200 за раз');
  const voted = [{ user_id: 'u1', pick: 'a' }];
  assert.equal(allInClose({ status: 'live' }, voted), true);
  assert.equal(allInClose({ status: 'live', chat: true }, voted), false, 'ведущий ждёт голоса чата — только таймер или кнопка');
});

test('отмена боя: отменённый исход открывает бой под новым номером (прежние голоса не в счёт), «Закончить» — под прежним', () => {
  const st = newState(cfg({ fmt: 'hill', mode: 'vote', timer: 30, p: ['A', 'B', 'C'] }));
  startState(st, 0);
  const n = st.bout.n;
  decide(st, 'a', 'vote', { va: 2, vb: 1 }, 10);
  const next = st.next;
  assert.ok(undoLast(st, 20).ok);
  assert.equal(st.log.length, 0);
  assert.notEqual(st.bout.n, n, 'номер боя новый: голоса за прежний номер не считаются');
  assert.equal(st.bout.n, next, 'номер, которого ещё не было');
  assert.equal(st.next, next + 1);
  assert.deepEqual([st.bout.opens, st.bout.ends], [20, 20 + 30e3]);
  // «Закончить» и «Продолжить турнир»: бой не решали — номер и голоса прежние
  decide(st, 'a', 'vote', { va: 1, vb: 0 }, 30);
  const open = st.bout.n;
  assert.ok(finishEarly(st, 40).ok);
  assert.ok(undoLast(st, 50).ok);
  assert.equal(st.status, 'live');
  assert.equal(st.bout.n, open);
});

test('все высказались — по счёту всей комнаты; бои решает ведущий — чат Twitch выключен', () => {
  assert.equal(allIn({ n: 61, said: 60 }), false, 'шестьдесят первый ещё думает');
  assert.equal(allIn({ n: 61, said: 61 }), true);
  assert.equal(allIn({ n: 0, said: 0 }), false);
  assert.equal(allIn(null), false);
  const st = newState(cfg({ fmt: 'hill', mode: 'vote', p: ['A', 'B'] }));
  st.chat = true;
  assert.ok(setRules(st, { timer: 30 }, 0).ok);
  assert.equal(st.chat, true, 'голосование осталось — чат не трогаем');
  assert.ok(setRules(st, { mode: 'host' }, 0).ok);
  assert.equal(st.chat, undefined);
});

// D1 на SQLite в памяти (как в tests/bingo.test.mjs) и адреса турнира без остального API
function kingEnv() {
  const db = new DatabaseSync(':memory:');
  const isRead = (sql) => /^\s*(SELECT|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
    exec() {
      const p = db.prepare(sql);
      if (isRead(sql)) return { results: p.all(...args), meta: { changes: 0 } };
      return { results: [], meta: { changes: p.run(...args).changes } };
    },
  });
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, banned INTEGER)');
  const env = {
    DB: {
      prepare: (sql) => stmt(sql),
      async batch(list) {
        db.exec('BEGIN');
        try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
      },
    },
  };
  const r = makeKingRoutes({
    json: (body, status = 200) => ({ status, body }), fail: (status, error) => ({ status, body: { error } }),
    readBody: async (req) => req.body || {}, sha256: async (s) => createHash('sha256').update(s).digest('hex'),
  });
  const user = (id) => { db.prepare('INSERT OR IGNORE INTO users (id, username, uname) VALUES (?, ?, ?)').run(id, id, id); return { id }; };
  const post = (path, me, body) => r['POST ' + path]({ env, request: { body, headers: new Headers() }, me });
  const here = (code, ids) => { for (const id of ids) { user(id); db.prepare('INSERT OR REPLACE INTO king_seen (room_id, user_id, at) VALUES (?, ?, ?)').run(code, id, Date.now()); } };
  return { db, user, post, here };
}

test('отменили бой, который закрыли «все высказались», — он открыт, пока не проголосуют заново', async () => {
  const k = kingEnv();
  const host = k.user('host');
  const made = await k.post('/king', host, { fmt: 'hill', mode: 'vote', timer: 60, p: ['A', 'B', 'C', 'D'], start: true });
  assert.equal(made.status, 200);
  const c = made.body.room.id, n = made.body.state.bout.n;
  k.here(c, ['v1', 'v2']);
  assert.equal((await k.post('/king/vote', { id: 'v1' }, { c, n, pick: 'a' })).body.state.log.length, 0, 'второй ещё думает');
  const closed = await k.post('/king/vote', { id: 'v2' }, { c, n, pick: 'b' });
  assert.deepEqual(closed.body.state.log.map((e) => e.by), ['all']);
  const undone = await k.post('/king/act', host, { c, act: 'undo' });
  assert.equal(undone.status, 200);
  assert.equal(undone.body.state.log.length, 0, 'тот же запрос не закрыл бой прежними голосами');
  const re = undone.body.state.bout;
  assert.ok(re && re.n !== n);
  assert.deepEqual([undone.body.tally.a, undone.body.tally.b], [0, 0]);
  assert.equal(undone.body.people.filter((p) => p.v).length, 0, 'в открытом заново бою никто ещё не голосовал');
  // за прежний номер голосовать нельзя, за новый — как обычно; проголосовали все — бой закрылся по новым голосам
  assert.equal((await k.post('/king/vote', { id: 'v1' }, { c, n, pick: 'a' })).status, 409);
  await k.post('/king/vote', { id: 'v1' }, { c, n: re.n, pick: 'b' });
  const again = await k.post('/king/vote', { id: 'v2' }, { c, n: re.n, pick: 'b' });
  assert.deepEqual(again.body.state.log.map((e) => [e.by, e.va, e.vb]), [['all', 0, 2]]);
});

test('«все высказались» считает всю комнату, а не первых 60 из списка', async () => {
  const k = kingEnv();
  const host = k.user('host');
  const made = await k.post('/king', host, { fmt: 'hill', mode: 'vote', timer: 60, p: ['A', 'B'], start: true });
  const c = made.body.room.id, n = made.body.state.bout.n;
  const ids = Array.from({ length: 61 }, (_, i) => 'v' + String(i).padStart(2, '0'));
  k.here(c, ids);
  // первые 60 (по порядку прихода) уже проголосовали, шестьдесят первый — нет
  for (const id of ids.slice(0, 60)) k.db.prepare('INSERT INTO king_votes (room_id, bout, user_id, pick, at) VALUES (?, ?, ?, ?, ?)').run(c, n, id, 'a', Date.now());
  const wait = await k.post('/king/vote', { id: ids[0] }, { c, n, pick: 'b' });
  assert.equal(wait.status, 200);
  assert.equal(wait.body.state.log.length, 0, 'бой ждёт шестьдесят первого');
  assert.equal(wait.body.people.length, 60, 'в списке — только первые 60');
  assert.deepEqual(wait.body.crowd, { n: 61, said: 60 });
  const done = await k.post('/king/vote', { id: ids[60] }, { c, n, pick: 'x' });
  assert.deepEqual(done.body.state.log.map((e) => [e.by, e.va, e.vb]), [['all', 59, 1]]);
});

test('чат Twitch: бои решает ведущий — флаг чата снят и после возврата к голосованию не возвращается сам', async () => {
  const k = kingEnv();
  const host = k.user('host');
  const made = await k.post('/king', host, { fmt: 'hill', mode: 'vote', timer: 60, p: ['A', 'B', 'C'], start: true });
  const c = made.body.room.id;
  assert.equal((await k.post('/king/act', host, { c, act: 'chat', on: true })).body.state.chat, true);
  assert.equal((await k.post('/king/act', host, { c, act: 'rules', mode: 'host' })).body.state.chat, undefined);
  assert.equal((await k.post('/king/act', host, { c, act: 'rules', mode: 'vote' })).body.state.chat, undefined, 'чат подключают заново кнопкой');
});
