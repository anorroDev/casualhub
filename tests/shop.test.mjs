// Тесты магазина: node --test tests/shop.test.mjs
// База — настоящий SQLite в памяти (node:sqlite) с тем же видом, что у D1: prepare().bind().first()/all()/run() и batch().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import * as S from '../functions/_lib/shop.js';
import { makeShopRoutes } from '../functions/_lib/shop-api.js';
import { ensureLevels, levelLetter } from '../functions/_lib/levels.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const isRead = (sql) => /^\s*(SELECT|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    exec() {
      const p = db.prepare(sql);
      if (isRead(sql)) return { results: p.all(...args), meta: { changes: 0 } };
      return { results: [], meta: { changes: Number(p.run(...args).changes) } };
    },
  });
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, uname TEXT, created_at INTEGER, email_ok INTEGER);
    CREATE TABLE friendships (a TEXT, b TEXT, status TEXT, requested_by TEXT, created_at INTEGER, PRIMARY KEY (a, b));
    CREATE TABLE shelves (user_id TEXT PRIMARY KEY, data TEXT, updated_at INTEGER);
    CREATE TABLE photos (key TEXT PRIMARY KEY, user_id TEXT, data TEXT, updated_at INTEGER);
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);`);
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
const U = 'a'.repeat(24), V = 'b'.repeat(24);
async function setup(mode = '1') {
  const env = { DB: fakeD1(), LEVELS: mode };
  await ensureLevels(env);
  const db = env.DB.raw;
  db.prepare('INSERT INTO users (id, username, uname, created_at) VALUES (?, ?, ?, ?)').run(U, 'Юзер', 'user1', 1);
  db.prepare('INSERT INTO users (id, username, uname, created_at) VALUES (?, ?, ?, ?)').run(V, 'Вася', 'vasya', 2);
  return { env, db };
}
const setXp = (db, uid, xp, level = 1, freezes = null) => db.prepare('INSERT INTO user_level (user_id, xp, level, updated_at, freezes) VALUES (?, ?, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, freezes = excluded.freezes').run(uid, xp, level, freezes ?? 1);

test('заработанное: 1 рофлан за 10 опыта, достижения по ступеням, особые, сезоны', () => {
  assert.deepEqual(S.earnedFrom(0, [], []), { xp: 0, ach: 0, season: 0, total: 0 });
  assert.equal(S.earnedFrom(999, [], []).xp, 99);
  const a = S.earnedFrom(0, [{ code: 'critic', tier: 1 }, { code: 'soul', tier: 2 }, { code: 'chatter', tier: 3 }, { code: 'founder', tier: 1 }, { code: 'nope', tier: 1 }, { code: 'нет такого', tier: 3 }], []);
  assert.equal(a.ach, 15 + 55 + 155 + 30 + 15);
  assert.equal(S.earnedFrom(0, [], ['champion', 'greatest', 'people', '???']).season, 240 + 900); // сезон — три месяца, награда втрое
});

test('баланс: опыт, достижения и итоги сезонов, если таблица есть', async () => {
  const { env, db } = await setup();
  setXp(db, U, 1234);
  db.prepare('INSERT INTO achievements (user_id, code, tier, at) VALUES (?, ?, ?, 1)').run(U, 'critic', 2);
  let st = await S.shopState(env, U);
  assert.equal(st.balance, 123 + 55);
  assert.equal(st.earned.season, 0); // таблицы итогов нет — без ошибки
  // таблицу итогов заводят сезоны (levels.js); если её ещё нет — заводим такую же
  db.exec('CREATE TABLE IF NOT EXISTS season_results (season INTEGER NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL, rank TEXT NOT NULL, place INTEGER NOT NULL, PRIMARY KEY (season, user_id))');
  db.prepare('INSERT INTO season_results (season, user_id, xp, rank, place) VALUES (1, ?, 1200, ?, 3)').run(U, 'whiner');
  st = await S.shopState(env, U);
  assert.equal(st.earned.season, 150);
  assert.equal(st.balance, 123 + 55 + 150);
});

test('покупка: нет такого, бесплатное, не хватает, куплено, повтор без второго списания', async () => {
  const { env, db } = await setup();
  setXp(db, U, 1000); // 100 рофланов
  assert.equal((await S.buy(env, U, 'site.bg.nope')).err[0], 400);
  assert.ok((await S.buy(env, U, 'site.cursor.default')).free);
  const poor = await S.buy(env, U, 'site.bg.horizon');
  assert.equal(poor.err[0], 409);
  assert.equal(poor.need, 150);
  const r = await S.buy(env, U, 'site.cursor.pixel');
  assert.ok(r.ok && !r.already);
  assert.equal(r.st.balance, 20);
  assert.ok(r.st.owned.has('site.cursor.pixel'));
  const again = await S.buy(env, U, 'site.cursor.pixel');
  assert.ok(again.ok && again.already);
  assert.equal((await S.shopState(env, U)).balance, 20);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM shop_log WHERE reason = 'buy'").get().n, 1);
});

test('одновременные покупки: денег хватает на одну — проходит одна', async () => {
  const { env, db } = await setup();
  setXp(db, U, 1300); // 130 рофланов: «Пиксель» 80 или «Лапка» 120, не обе
  const [a, b] = await Promise.all([S.buy(env, U, 'site.cursor.pixel'), S.buy(env, U, 'site.cursor.paw')]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
  assert.equal([a, b].filter((x) => x.err).length, 1);
  const st = await S.shopState(env, U);
  assert.ok(st.balance >= 0);
  assert.equal(st.owned.size, 1);
});

test('Васян: окрасы и наряды — только у хозяев (письмо из почты или 25-й уровень)', async () => {
  const { env, db } = await setup();
  setXp(db, U, 5000, 10);
  assert.equal((await S.buy(env, U, 'vasyan.skin.ginger')).err[0], 403);
  db.prepare("INSERT INTO gift_box (gift_id, user_id, read, claimed, at) VALUES (?, ?, 1, 1, 1)").run('vasyan:' + U, U);
  assert.ok((await S.buy(env, U, 'vasyan.skin.ginger')).ok);
  setXp(db, V, 9000, 25);
  assert.ok((await S.buy(env, V, 'vasyan.outfit.crown')).ok);
  const view = S.shopView(await S.shopState(env, V));
  assert.equal(view.vasyan, true);
  assert.ok(view.items.find((x) => x.id === 'vasyan.outfit.crown').owned);
  assert.ok(view.items.find((x) => x.id === 'vasyan.skin.classic').owned); // бесплатное есть у всех
});

test('заморозка серии: нужна серия, не больше двух, повтор того же запроса — без второй', async () => {
  const { env, db } = await setup();
  assert.equal((await S.buy(env, V, 'perk.freeze')).err[0], 409); // строки уровня нет — и рофланов нет
  db.prepare('INSERT INTO achievements (user_id, code, tier, at) VALUES (?, ?, ?, 1)').run(V, 'founder', 1); // 30 рофланов без опыта
  db.prepare('INSERT INTO achievements (user_id, code, tier, at) VALUES (?, ?, ?, 1)').run(V, 'critic', 3); // ещё 155
  assert.match((await S.buy(env, V, 'perk.freeze')).err[1], /Серии ещё нет/);
  setXp(db, U, 2000, 5, 1); // 200 рофланов, одна заморозка
  const one = await S.buy(env, U, 'perk.freeze', { rid: 'abc123' });
  assert.ok(one.ok && !one.already);
  assert.equal(one.st.freezes, 2);
  assert.equal(one.st.balance, 140);
  const retry = await S.buy(env, U, 'perk.freeze', { rid: 'abc123' });
  assert.ok(retry.err || retry.already); // две уже есть: больше не помещается, второй раз не списано
  assert.equal((await S.shopState(env, U)).freezes, 2);
  assert.equal((await S.shopState(env, U)).balance, 140);
  db.prepare('UPDATE user_level SET freezes = 1 WHERE user_id = ?').run(U);
  const same = await S.buy(env, U, 'perk.freeze', { rid: 'abc123' }); // тот же запрос пришёл ещё раз
  assert.ok(same.ok && same.already);
  assert.equal((await S.shopState(env, U)).freezes, 1);
  assert.equal((await S.shopState(env, U)).balance, 140);
});

test('опыт сняли после покупки: баланс ниже нуля, страница видит 0 и долг, купить нельзя', async () => {
  const { env, db } = await setup();
  setXp(db, U, 900);
  assert.ok((await S.buy(env, U, 'site.cursor.pixel')).ok); // 90 − 80 = 10
  setXp(db, U, 300); // удалил оценки: 30 заработано, 80 потрачено
  const v = S.shopView(await S.shopState(env, U));
  assert.equal(v.balance, 0);
  assert.equal(v.debt, 50);
  assert.equal((await S.buy(env, U, 'site.bg.horizon')).err[0], 409);
});

test('админ: подарить и снять, снять больше, чем есть, нельзя', async () => {
  const { env, db } = await setup();
  setXp(db, U, 100); // 10
  assert.equal((await S.grant(env, U, 0)).err[0], 400);
  assert.equal((await S.grant(env, U, 500, { by: V, note: 'за турнир' })).st.balance, 510);
  assert.equal((await S.grant(env, U, -600)).err[0], 409);
  assert.equal((await S.grant(env, U, -500)).st.balance, 10);
  const log = await S.shopLog(env, { uid: U });
  assert.equal(log.length, 2);
  assert.equal(log.find((x) => x.delta === 500).note, 'за турнир');
  assert.equal(log.find((x) => x.delta === 500).by, 'vasya');
  const t = await S.shopTotals(env);
  assert.equal(t.buys, 0);
});

test('адреса: закрыт при LEVELS = "0", при "admins" — только админам, покупка через POST /shop/buy', async () => {
  const mk = (adminOk) => makeShopRoutes({
    json: (d, status = 200) => ({ status, d }),
    fail: (status, error) => ({ status, d: { error } }),
    readBody: async (r) => r.body,
    adminActive: async () => adminOk, isAdmin: async () => adminOk, adminCandidate: () => adminOk, adminLog: async () => {},
  });
  const off = await setup('0');
  assert.equal((await mk(true)['GET /shop/me']({ env: off.env, me: { id: U } })).d.on, false);
  const adm = await setup('admins');
  assert.equal((await mk(false)['GET /shop/me']({ env: adm.env, me: { id: U } })).d.on, false);
  assert.equal((await mk(true)['GET /shop/me']({ env: adm.env, me: { id: U } })).d.on, true);
  const all = await setup('1');
  setXp(all.db, U, 1000);
  const R = mk(false);
  const me = await R['GET /shop/me']({ env: all.env, me: { id: U } });
  assert.equal(me.d.balance, 100);
  assert.ok(me.d.items.length >= 20);
  const ok = await R['POST /shop/buy']({ env: all.env, request: { body: { item: 'site.cursor.pixel' } }, me: { id: U } });
  assert.equal(ok.status, 200);
  assert.equal(ok.d.balance, 20);
  const no = await R['POST /shop/buy']({ env: all.env, request: { body: { item: 'site.bg.horizon' } }, me: { id: U } });
  assert.equal(no.status, 409);
  assert.equal(no.d.need, 230);
  assert.equal((await R['GET /admin/shop']({ env: all.env, request: { url: 'https://x/api/admin/shop' }, me: { id: V } })).status, 404); // не админ
  const A = mk(true);
  const g = await A['POST /admin/shop/grant']({ env: all.env, request: { body: { to: '@user1', delta: 300, note: 'тест' } }, me: { id: V } });
  assert.equal(g.d.balance, 320);
  const look = await A['GET /admin/shop']({ env: all.env, request: { url: 'https://x/api/admin/shop?user=user1' }, me: { id: V } });
  assert.equal(look.d.user.handle, 'user1');
  assert.equal(look.d.log.length, 2);
  const site = await A['GET /admin/shop']({ env: all.env, request: { url: 'https://x/api/admin/shop' }, me: { id: V } });
  assert.equal(site.d.totals.buys, 1);
  assert.equal(site.d.totals.top[0].item, 'site.cursor.pixel');
});

test('надеть: только купленное, купленное надевается сразу, бесплатное — снять, другие видят рамку, значок и ник', async () => {
  const { env, db } = await setup();
  setXp(db, U, 6000); // 600 рофланов
  assert.equal((await S.wear(env, U, 'shop.frame.fire')).err[0], 403);
  assert.equal((await S.wear(env, U, 'perk.freeze')).err[0], 400);
  const b = await S.buy(env, U, 'shop.frame.fire');
  assert.equal(S.shopView(b.st).wear.frame, 'shop.frame.fire'); // надето сразу
  await S.buy(env, U, 'shop.badge.potato');
  await S.buy(env, U, 'shop.wheel.neon');
  await S.buy(env, U, 'shop.frame.wood'); // новая рамка сменила старую
  let v = S.shopView(await S.shopState(env, U));
  assert.equal(v.wear.frame, 'shop.frame.wood');
  assert.equal(v.wear.wheel, 'shop.wheel.neon');
  assert.equal(v.wear.nick, 'shop.nick.none'); // не надето — «как у всех»
  assert.ok((await S.wear(env, U, 'shop.frame.fire')).ok); // купленное раньше — снова
  const looks = await S.looksOf(env, [U, V, 'не id']);
  assert.deepEqual(looks, { [U]: { frame: 'shop.frame.fire', badge: 'shop.badge.potato' } }); // колесо другим не видно
  assert.ok((await S.wear(env, U, 'shop.frame.none')).ok);
  v = S.shopView(await S.shopState(env, U));
  assert.equal(v.wear.frame, 'shop.frame.none');
  assert.deepEqual(await S.looksOf(env, [U]), { [U]: { badge: 'shop.badge.potato' } });
});

test('каталог: для всех 20–30 платных товаров в 6 разделах, от дешёвых до дорогих', () => {
  const all = S.ITEMS.filter((x) => x.sec !== 'vasyan' && x.price > 0);
  assert.ok(all.length >= 20 && all.length <= 30, String(all.length));
  assert.deepEqual([...new Set(S.ITEMS.filter((x) => x.sec !== 'vasyan').map((x) => x.sec))].sort(), ['nick', 'perks', 'profile', 'site', 'tier', 'wheel']);
  assert.ok(Math.min(...all.map((x) => x.price)) <= 30);
  assert.ok(Math.max(...all.map((x) => x.price)) >= 700);
  for (const s of S.SLOTS) assert.equal(S.ITEMS.filter((x) => x.slot === s && !x.price).length, 1, 'бесплатное в слоте ' + s);
});

test('каталог: id уникальны, цены целые, у Васяна общие с vasyan.js id', () => {
  const ids = S.ITEMS.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of S.ITEMS) assert.ok(Number.isInteger(x.price) && x.price >= 0, x.id);
  const skins = S.ITEMS.filter((x) => x.kind === 'skin').map((x) => x.id.split('.').pop());
  assert.deepEqual(skins.sort(), ['black', 'btabby', 'calico', 'classic', 'ghost', 'ginger', 'siamese', 'tabby', 'white']);
  const outfits = S.ITEMS.filter((x) => x.kind === 'outfit').map((x) => x.id.split('.').pop());
  assert.deepEqual(outfits.sort(), ['bow', 'crown', 'glasses', 'hat', 'headphones', 'none', 'scarf']);
});

// ---------- еда Васяна ----------
const hasVasyan = (db, uid) => db.prepare('INSERT INTO gift_box (gift_id, user_id, read, claimed, at) VALUES (?, ?, 1, 1, 1)').run('vasyan:' + uid, uid);

test('еда: сухой корм у всех, остальная по одной за уровень со 2-го, цены 40–200', () => {
  const foods = S.ITEMS.filter((x) => x.kind === 'food');
  assert.ok(foods.length >= 10 && foods.length <= 14, String(foods.length));
  assert.equal(foods[0].id, 'vasyan.food.kibble');
  assert.equal(foods[0].price, 0);
  foods.slice(1).forEach((f, i) => {
    assert.equal(f.unlock, i + 2, f.id);
    assert.ok(f.price >= 40 && f.price <= 200, f.id);
    assert.equal(f.sec, 'vasyan');
  });
  assert.deepEqual(S.foodsUnlocked(1, 3).map((f) => f.title), ['Рыбка', 'Молоко']);
  assert.deepEqual(S.foodsUnlocked(5, 5), []);
});

test('еда: открытая уровнем — своя без покупки, закрытую можно купить раньше', async () => {
  const { env, db } = await setup();
  setXp(db, U, 3000, 3); // 300 рофланов, 3-й уровень
  hasVasyan(db, U);
  let v = S.shopView(await S.shopState(env, U));
  const it = (id) => v.items.find((x) => x.id === id);
  assert.ok(it('vasyan.food.kibble').owned && !it('vasyan.food.kibble').byLevel);
  assert.ok(it('vasyan.food.fish').owned && it('vasyan.food.fish').byLevel); // 2-й уровень
  assert.ok(it('vasyan.food.milk').owned && it('vasyan.food.milk').byLevel); // 3-й
  assert.ok(!it('vasyan.food.sausage').owned);
  assert.equal(it('vasyan.food.sausage').unlock, 4);
  // открытую уровнем купить нельзя и не нужно: рофланы не списываются
  const free = await S.buy(env, U, 'vasyan.food.fish');
  assert.ok(free.ok && free.already);
  assert.equal(free.st.balance, 300);
  // закрытую — можно, раньше её уровня
  const b = await S.buy(env, U, 'vasyan.food.sushi');
  assert.ok(b.ok && !b.already);
  assert.equal(b.st.balance, 140);
  v = S.shopView(b.st);
  assert.ok(it('vasyan.food.sushi').owned && !it('vasyan.food.sushi').byLevel);
  // уровень вырос — открылась следующая, купленная осталась своей
  setXp(db, U, 3000, 4);
  v = S.shopView(await S.shopState(env, U));
  assert.ok(it('vasyan.food.sausage').owned && it('vasyan.food.sausage').byLevel);
  assert.ok(it('vasyan.food.sushi').owned);
});

test('еда: чужая не своя, без Васяна не купить, насыпает страница, а не сервер', async () => {
  const { env, db } = await setup();
  setXp(db, U, 9000, 14); // всё открыто уровнем
  hasVasyan(db, U);
  setXp(db, V, 3000, 1); // 300 рофланов, 1-й уровень, Васяна нет
  const u = S.shopView(await S.shopState(env, U));
  assert.ok(u.items.filter((x) => x.kind === 'food').every((x) => x.owned));
  const w = S.shopView(await S.shopState(env, V));
  assert.deepEqual(w.items.filter((x) => x.kind === 'food' && x.owned).map((x) => x.id), ['vasyan.food.kibble']);
  assert.equal((await S.buy(env, V, 'vasyan.food.cake')).err[0], 403);
  // выбор еды живёт в браузере (vasyan.js, casualhub.vasyan.v1.food) — сервер её не «надевает»
  assert.equal((await S.wear(env, U, 'vasyan.food.fish')).err[0], 400);
  // страница получает, что своё и с какого уровня откроется остальное
  const R = makeShopRoutes({ json: (d, status = 200) => ({ status, d }), fail: (status, error) => ({ status, d: { error } }), readBody: async (r) => r.body, adminActive: async () => false, isAdmin: async () => false, adminCandidate: () => false, adminLog: async () => {} });
  const me = await R['GET /shop/me']({ env, me: { id: V } });
  const cake = me.d.items.find((x) => x.id === 'vasyan.food.cake');
  assert.deepEqual([cake.owned, cake.unlock, cake.byLevel], [false, 14, false]);
});

test('еда: в письме о новом уровне — новая еда, только тем, у кого есть Васян', async () => {
  const { env, db } = await setup();
  hasVasyan(db, U);
  await levelLetter(env, U, { from: 1, to: 3 }, 1000, 0);
  await levelLetter(env, V, { from: 1, to: 3 }, 1000, 0);
  const body = (uid, lv) => db.prepare('SELECT body FROM gifts WHERE id = ?').get(`lv:${uid}:${lv}`).body;
  assert.match(body(U, 3), /Новая еда для Васяна: Рыбка, Молоко\./);
  assert.doesNotMatch(body(V, 3), /еда/);
  await levelLetter(env, V, { from: 24, to: 25 }, 1000, 0); // на 25-м Васян есть у всех, но новой еды там нет
  assert.doesNotMatch(body(V, 25), /еда/);
});

test('еда: id и названия общие с vasyan.js, в том же порядке', () => {
  const src = readFileSync(new URL('../vasyan.js', import.meta.url), 'utf8');
  const at = src.indexOf('const FOODS = [');
  const block = src.slice(at, src.indexOf('];', at));
  const client = [...block.matchAll(/\{ id: '([a-z]+)', name: '([^']+)'/g)].map((m) => [m[1], m[2]]);
  const server = S.ITEMS.filter((x) => x.kind === 'food').map((x) => [x.id.split('.').pop(), x.title]);
  assert.deepEqual(client, server);
});
