// Казуал Хаб: магазин — валюта «рофланы» (по-английски Souls), каталог, баланс и покупки. Адреса — shop-api.js,
// окно магазина — /shop.js, вкладка в админке — /admin/shop.js.
//
// Рофланы отдельно не начисляются: заработанное считается по тому, что уже есть на сайте, — опыт за всё время
// (user_level.xp: оценки, отзывы, задания, серии, заходы — всё, за что дают опыт), достижения и итоговые звания
// прошлых сезонов. Траты и подарки админа — журнал shop_log (delta < 0 — потрачено или снято, > 0 — подарено).
// Баланс = заработанное + сумма delta. Поэтому уровни для магазина ничего не пишут, а опыт, который потом сняли
// (удалил оценку), уменьшает и заработанное: баланс может уйти ниже нуля, тогда купить ничего нельзя, пока не
// наберётся снова.
//
// Покупка — одна пачка запросов: списание пишется, только если хватает рофланов и предмета ещё нет, а предмет
// попадает в shop_owned, только если списание записалось. У покупки свой id в журнале, повтор ничего не удваивает.
// Что купил — shop_owned; как это носить, решает страница: vasyan.js — окрасы и наряды Васяна, /shop.js — фон и курсор.
// Купить можно только оформление и «заморозку» серии; ни опыта, ни званий за рофланы нет, случайных наград тоже.
// Папка _lib не становится адресом сайта.
import { levelsMode, ensureLevels, ACHIEVEMENTS } from './levels.js';

// ---------- сколько рофланов за что ----------
export const XP_PER_ROFLAN = 10; // 1 рофлан за каждые 10 опыта
export const ACH_PAY = [0, 15, 55, 155]; // за достижение: бронза 15, серебро ещё 40, золото ещё 100 (сумма за все ступени)
export const ACH_SPECIAL = 30; // особое: «Основатель хаба», «Первая десятка», «Первые шаги», «Итоги года»
// за итоговое звание сезона (id званий — как у сезонов в levels.js)
// за звание в конце сезона (сезон — три месяца, поэтому втрое больше, чем было за месячный)
export const SEASON_PAY = { people: 0, casual: 30, couch: 75, whiner: 150, champion: 240, godlike: 360, taste: 510, legend: 690, greatest: 900 };
export const FREEZE_MAX = 2; // «заморозок» серии больше двух не бывает и без магазина (levels.js, streakStep)

// ---------- каталог ----------
// sec — раздел окна; kind — что это; price 0 — есть у всех; consumable — расходуется (можно купить снова).
// slot — что надевается (в каждом слоте надето одно, сервер помнит это в shop_wear, и оно одинаково на всех устройствах).
// pub — надетое видят другие (рамка аватара, значок и стиль ника: GET /shop/look); остальное видит только сам человек.
// Как выглядит каждый предмет, решает /shop.js (рамки, значки, стили ника, палитры колеса и тир-листа, конфетти);
// окрасы и наряды Васяна рисует vasyan.js (id общие с ним), носит их тоже он.
const wearable = [
  // профиль: рамка аватара и значок у ника — их видят все
  ['shop.frame.none', 'profile', 'frame', 'Без рамки', 0],
  ['shop.frame.wood', 'profile', 'frame', 'Рамка «Дерево»', 40],
  ['shop.frame.mint', 'profile', 'frame', 'Рамка «Мята»', 70],
  ['shop.frame.fire', 'profile', 'frame', 'Рамка «Огонь»', 160],
  ['shop.frame.ice', 'profile', 'frame', 'Рамка «Лёд»', 160],
  ['shop.frame.retro', 'profile', 'frame', 'Рамка «Ретро»', 320],
  ['shop.frame.royal', 'profile', 'frame', 'Рамка «Королевская»', 800],
  ['shop.badge.none', 'profile', 'badge', 'Без значка', 0],
  ['shop.badge.potato', 'profile', 'badge', 'Значок «Картошка»', 25],
  ['shop.badge.coffee', 'profile', 'badge', 'Значок «Кофе»', 45],
  ['shop.badge.heart', 'profile', 'badge', 'Значок «Сердце»', 60],
  ['shop.badge.bolt', 'profile', 'badge', 'Значок «Молния»', 120],
  ['shop.badge.roflan', 'profile', 'badge', 'Значок «Рофлан»', 350],
  // ник: как написано имя в профиле и списках
  ['shop.nick.none', 'nick', 'nick', 'Обычный ник', 0],
  ['shop.nick.serif', 'nick', 'nick', 'Ник с засечками', 60],
  ['shop.nick.pixel', 'nick', 'nick', 'Пиксельный ник', 90],
  ['shop.nick.outline', 'nick', 'nick', 'Ник с контуром', 150],
  ['shop.nick.wave', 'nick', 'nick', 'Ник с волной', 220],
  // Колесо: цвета секторов и конфетти на победу (видит сам человек на своём колесе)
  ['shop.wheel.default', 'wheel', 'wheel', 'Обычное колесо', 0],
  ['shop.wheel.candy', 'wheel', 'wheel', 'Колесо «Конфеты»', 100],
  ['shop.wheel.ocean', 'wheel', 'wheel', 'Колесо «Океан»', 140],
  ['shop.wheel.neon', 'wheel', 'wheel', 'Колесо «Неон»', 200],
  ['shop.wheel.arcade', 'wheel', 'wheel', 'Колесо «Аркада»', 300],
  ['shop.confetti.default', 'wheel', 'confetti', 'Обычное конфетти', 0],
  ['shop.confetti.hearts', 'wheel', 'confetti', 'Конфетти «Сердечки»', 80],
  ['shop.confetti.stars', 'wheel', 'confetti', 'Конфетти «Звёзды»', 120],
  ['shop.confetti.roflan', 'wheel', 'confetti', 'Конфетти «Рофланы»', 450],
  // тир-листы: цвета рядов новых тир-листов, палитра рядов и фон картинки при скачивании
  ['shop.tier.default', 'tier', 'tier', 'Обычная тема', 0],
  ['shop.tier.pastel', 'tier', 'tier', 'Тема «Пастель»', 90],
  ['shop.tier.arcade', 'tier', 'tier', 'Тема «Аркада»', 180],
  ['shop.tier.night', 'tier', 'tier', 'Тема «Ночь»', 250],
  // сайт: фон и курсор
  ['site.bg.stars', 'site', 'bg', 'Фон «Звёзды»', 0],
  ['site.bg.horizon', 'site', 'bg', 'Фон «Пейзаж»', 250],
  ['site.cursor.default', 'site', 'cursor', 'Обычный курсор', 0],
  ['site.cursor.pixel', 'site', 'cursor', 'Курсор «Пиксель»', 80],
  ['site.cursor.paw', 'site', 'cursor', 'Курсор «Лапка»', 120],
].map(([id, sec, slot, title, price]) => ({ id, sec, kind: slot, slot, title, price, pub: ['frame', 'badge', 'nick'].includes(slot) }));
// еда Васяна (id общие с vasyan.js): сухой корм — у всех; остальная открывается по одной за каждый уровень, начиная
// со 2-го (unlock — уровень), или покупается раньше. Насыпает её vasyan.js (CasualVasyan.setFood), сервер только знает,
// чья она: куплена или уровень >= unlock
export const FOODS = [
  ['kibble', 'Сухой корм', 0],
  ['fish', 'Рыбка', 40],
  ['milk', 'Молоко', 40],
  ['sausage', 'Сосиска', 60],
  ['cheese', 'Сыр', 60],
  ['chicken', 'Курочка', 80],
  ['pelmeni', 'Пельмени', 80],
  ['noodles', 'Доширак', 60],
  ['shrimp', 'Креветки', 120],
  ['pizza', 'Пицца', 120],
  ['watermelon', 'Арбуз', 100],
  ['sushi', 'Суши', 160],
  ['shawarma', 'Шаурма', 150],
  ['cake', 'Тортик', 200],
].map(([name, title, price], i) => ({ id: 'vasyan.food.' + name, sec: 'vasyan', kind: 'food', title, price, unlock: price ? i + 1 : 0 }));
const FOOD_ITEMS = FOODS;
// своё ли: бесплатное, куплено или открыто уровнем
const ownedBy = (it, st) => !it.price || st.owned.has(it.id) || (!!it.unlock && st.level >= it.unlock);
// какая еда открылась, когда уровень вырос с from до to (для письма о новом уровне)
export const foodsUnlocked = (from, to) => FOODS.filter((f) => f.unlock > (+from || 0) && f.unlock <= (+to || 0));
export const SLOTS = ['frame', 'badge', 'nick', 'wheel', 'confetti', 'tier', 'bg', 'cursor'];
export const PUB_SLOTS = ['frame', 'badge', 'nick'];
export const ITEMS = [
  ...wearable,
  { id: 'perk.freeze', sec: 'perks', kind: 'freeze', title: 'Заморозка серии', price: 60, consumable: true },
  { id: 'vasyan.skin.classic', sec: 'vasyan', kind: 'skin', title: 'Классика', price: 0 },
  { id: 'vasyan.skin.ginger', sec: 'vasyan', kind: 'skin', title: 'Рыжий', price: 120 },
  { id: 'vasyan.skin.black', sec: 'vasyan', kind: 'skin', title: 'Чёрный', price: 120 },
  { id: 'vasyan.skin.white', sec: 'vasyan', kind: 'skin', title: 'Белый', price: 150 },
  { id: 'vasyan.skin.tabby', sec: 'vasyan', kind: 'skin', title: 'Серый полосатый', price: 150 },
  { id: 'vasyan.skin.siamese', sec: 'vasyan', kind: 'skin', title: 'Сиамский', price: 200 },
  { id: 'vasyan.skin.calico', sec: 'vasyan', kind: 'skin', title: 'Трёхцветный', price: 200 },
  { id: 'vasyan.skin.ghost', sec: 'vasyan', kind: 'skin', title: 'Призрак', price: 400 },
  { id: 'vasyan.outfit.none', sec: 'vasyan', kind: 'outfit', title: 'Без наряда', price: 0 },
  { id: 'vasyan.outfit.bow', sec: 'vasyan', kind: 'outfit', title: 'Бантик', price: 60 },
  { id: 'vasyan.outfit.scarf', sec: 'vasyan', kind: 'outfit', title: 'Шарф', price: 80 },
  { id: 'vasyan.outfit.glasses', sec: 'vasyan', kind: 'outfit', title: 'Очки', price: 100 },
  { id: 'vasyan.outfit.hat', sec: 'vasyan', kind: 'outfit', title: 'Шляпа', price: 120 },
  { id: 'vasyan.outfit.headphones', sec: 'vasyan', kind: 'outfit', title: 'Наушники', price: 150 },
  { id: 'vasyan.outfit.crown', sec: 'vasyan', kind: 'outfit', title: 'Корона', price: 300 },
  ...FOOD_ITEMS,
];
const BY_ID = new Map(ITEMS.map((x) => [x.id, x]));
export const itemOf = (id) => BY_ID.get(String(id || '')) || null;
const ACH_DEF = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

// магазин открыт там же, где уровни: LEVELS = "0" — закрыт, "admins" — только админам (решает shop-api.js), "1" — всем
export const shopOn = (env) => levelsMode(env) !== 'off';

// ---------- таблицы ----------
const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
export async function ensureShop(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shop_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item TEXT, delta INTEGER NOT NULL, reason TEXT NOT NULL, note TEXT, by_id TEXT, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS shop_log_user ON shop_log(user_id, at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS shop_log_at ON shop_log(at)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shop_owned (user_id TEXT NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, item))'),
    // что надето: в каждом слоте одно; нет строки — надето бесплатное «как у всех»
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shop_wear (user_id TEXT NOT NULL, slot TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, slot))'),
  ]);
  ready.add(env.DB);
}

// ---------- заработанное ----------
// итоговые звания прошлых сезонов (id звания) — из таблицы итогов сезонов. Её заводят сезоны (levels.js); имя
// таблицы и колонок — только здесь. Таблицы нет (сезонов ещё не было) — за сезоны ничего, без ошибки.
export const SEASON_SQL = 'SELECT rank FROM season_results WHERE user_id = ?';
async function seasonRanksOf(env, uid) {
  try {
    const { results } = await env.DB.prepare(SEASON_SQL).bind(uid).all();
    return (results || []).map((r) => String(r.rank || ''));
  } catch (e) {
    return [];
  }
}
// xp — опыт за всё время, ach — строки достижений { code, tier }, seasons — id итоговых званий
export function earnedFrom(xp, ach, seasons) {
  const fromXp = Math.floor(Math.max(0, +xp || 0) / XP_PER_ROFLAN);
  let fromAch = 0;
  for (const a of ach || []) {
    const def = ACH_DEF.get(a && a.code);
    if (!def) continue;
    fromAch += def.special ? ACH_SPECIAL : ACH_PAY[Math.max(1, Math.min(3, Math.floor(+a.tier || 1)))];
  }
  const fromSeason = (seasons || []).reduce((s, r) => s + (SEASON_PAY[r] || 0), 0);
  return { xp: fromXp, ach: fromAch, season: fromSeason, total: fromXp + fromAch + fromSeason };
}

// всё про человека одной пачкой: заработано, баланс, что куплено, есть ли Васян, сколько «заморозок»
export async function shopState(env, uid) {
  await ensureLevels(env);
  await ensureShop(env);
  const [lv, ach, log, own, gift, worn] = await env.DB.batch([
    env.DB.prepare('SELECT xp, level, freezes FROM user_level WHERE user_id = ?').bind(uid),
    env.DB.prepare('SELECT code, tier FROM achievements WHERE user_id = ?').bind(uid),
    env.DB.prepare("SELECT COALESCE(SUM(delta), 0) AS sum, COALESCE(SUM(CASE WHEN reason = 'buy' THEN -delta ELSE 0 END), 0) AS spent, "
      + "COALESCE(SUM(CASE WHEN reason = 'admin' THEN delta ELSE 0 END), 0) AS gifts FROM shop_log WHERE user_id = ?").bind(uid),
    env.DB.prepare('SELECT item FROM shop_owned WHERE user_id = ?').bind(uid),
    env.DB.prepare('SELECT 1 AS ok FROM gift_box WHERE gift_id = ? AND user_id = ? AND claimed = 1').bind('vasyan:' + uid, uid),
    env.DB.prepare('SELECT slot, item FROM shop_wear WHERE user_id = ?').bind(uid),
  ]);
  const row = (lv.results || [])[0] || null;
  const ownedSet = new Set((own.results || []).map((x) => x.item));
  const sums = (log.results || [])[0] || {};
  const earned = earnedFrom(row ? row.xp : 0, ach.results || [], await seasonRanksOf(env, uid));
  const level = row ? +row.level || 1 : 1;
  return {
    earned,
    spent: +sums.spent || 0,
    gifts: +sums.gifts || 0,
    balance: earned.total + (+sums.sum || 0),
    owned: ownedSet,
    wear: wearMap(worn.results || [], ownedSet),
    level,
    // Васян есть у «Первой десятки» (забрал письмо с котиком) и у всех с 25-го уровня (награда «Васян в профиле»)
    vasyan: !!(gift.results || []).length || level >= 25,
    hasLevel: !!row,
    freezes: row ? (row.freezes == null ? 1 : +row.freezes) : 1,
  };
}

// надетое по слотам: только известные предметы своего слота, и только купленные (вдруг покупку сняли)
function wearMap(rows, ownedSet) {
  const out = {};
  for (const r of rows) {
    const it = itemOf(r.item);
    if (it && it.slot === r.slot && (!it.price || !ownedSet || ownedSet.has(it.id))) out[r.slot] = it.id;
  }
  return out;
}
const DEFAULT = Object.fromEntries(SLOTS.map((s) => [s, (ITEMS.find((x) => x.slot === s && !x.price) || {}).id]));

// что отдать странице
export function shopView(st) {
  return {
    on: true,
    balance: Math.max(0, st.balance),
    debt: st.balance < 0 ? -st.balance : 0,
    earned: st.earned,
    spent: st.spent,
    gifts: st.gifts,
    rate: XP_PER_ROFLAN,
    vasyan: st.vasyan,
    freezes: st.freezes,
    freezeMax: FREEZE_MAX,
    wear: { ...DEFAULT, ...(st.wear || {}) },
    // unlock — с какого уровня еда своя без покупки; byLevel — своя именно за уровень (не куплена)
    items: ITEMS.map((x) => ({ id: x.id, sec: x.sec, kind: x.kind, slot: x.slot || null, pub: !!x.pub, title: x.title, price: x.price, consumable: !!x.consumable,
      owned: ownedBy(x, st), unlock: x.unlock || 0, byLevel: !!x.unlock && st.level >= x.unlock && !st.owned.has(x.id) })),
  };
}

// ---------- надеть ----------
// надеть купленное (или бесплатное «как у всех» — тогда строка слота просто убирается)
export async function wear(env, uid, itemId, now = Date.now()) {
  const it = itemOf(itemId);
  if (!it || !it.slot) return { err: [400, 'Это не надевается.'] };
  await ensureShop(env);
  if (!it.price) {
    await env.DB.prepare('DELETE FROM shop_wear WHERE user_id = ? AND slot = ?').bind(uid, it.slot).run();
    return { ok: true, st: await shopState(env, uid) };
  }
  const r = await env.DB.prepare('INSERT INTO shop_wear (user_id, slot, item, at) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM shop_owned WHERE user_id = ?1 AND item = ?3) '
    + 'ON CONFLICT(user_id, slot) DO UPDATE SET item = excluded.item, at = excluded.at').bind(uid, it.slot, it.id, now).run();
  if (!(r.meta && r.meta.changes)) return { err: [403, 'Сначала это нужно купить.'] };
  return { ok: true, st: await shopState(env, uid) };
}
// что надето у людей из списка — только то, что видят другие (рамка, значок, ник)
export async function looksOf(env, ids) {
  await ensureShop(env);
  const list = [...new Set((ids || []).map(String).filter((x) => /^[0-9a-f]{24}$/.test(x)))].slice(0, 200);
  const out = {};
  for (let i = 0; i < list.length; i += 90) {
    const part = list.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT user_id, slot, item FROM shop_wear WHERE user_id IN (${part.map(() => '?').join(', ')}) AND slot IN ('frame', 'badge', 'nick')`).bind(...part).all();
    for (const r of results || []) {
      const it = itemOf(r.item);
      if (it && it.pub && it.slot === r.slot) (out[r.user_id] = out[r.user_id] || {})[r.slot] = it.id;
    }
  }
  return out;
}

// ---------- покупка ----------
// rid — id запроса от страницы (для расходуемого: повтор того же запроса не купит второй раз)
const RID_RE = /^[a-z0-9]{6,32}$/i;
// хватает ли рофланов: заработанное (?6) + сумма журнала >= цена (?4). Проверка — в той же пачке, что и списание
const ENOUGH = '?6 + COALESCE((SELECT SUM(delta) FROM shop_log WHERE user_id = ?2), 0) >= ?4';
export async function buy(env, uid, itemId, { rid = '', now = Date.now() } = {}) {
  const it = itemOf(itemId);
  if (!it) return { err: [400, 'Такого в магазине нет.'] };
  if (!it.price) return { ok: true, free: true };
  const st = await shopState(env, uid);
  // еда, которую уже открыл уровень, — своя и без покупки: рофланы не списываются
  if (it.unlock && st.level >= it.unlock) return { ok: true, already: true, st };
  if (it.sec === 'vasyan' && !st.vasyan) return { err: [403, 'Окрасы, наряды и еда — для тех, у кого есть котик Васян: первая десятка и все с 25-го уровня.'] };
  if (!it.consumable && st.owned.has(it.id)) return { ok: true, already: true, st };
  if (it.kind === 'freeze') {
    if (!st.hasLevel) return { err: [409, 'Серии ещё нет: заморозка пригодится, когда начнёшь серию.'] };
    if (st.freezes >= FREEZE_MAX) return { err: [409, `Заморозок уже ${FREEZE_MAX} — больше не помещается.`] };
  }
  if (st.balance < it.price) return { err: [409, `Не хватает рофланов: нужно ещё ${it.price - Math.max(0, st.balance)}.`], need: it.price - Math.max(0, st.balance) };
  const id = it.consumable ? `buy:${uid}:${it.id}:${RID_RE.test(rid) ? rid : now}` : `own:${uid}:${it.id}`;
  const log = (extra) => env.DB.prepare(`INSERT OR IGNORE INTO shop_log (id, user_id, item, delta, reason, note, by_id, at) SELECT ?1, ?2, ?3, -?4, 'buy', NULL, NULL, ?5 WHERE ${ENOUGH} AND ${extra}`)
    .bind(id, uid, it.id, it.price, now, st.earned.total);
  const writes = it.kind === 'freeze'
    ? [
      log(`EXISTS (SELECT 1 FROM user_level WHERE user_id = ?2 AND COALESCE(freezes, 1) < ${FREEZE_MAX})`),
      // «заморозка» — только если списание записала именно эта пачка: changes() — сколько строк вставила команда выше.
      // По времени (at = now) нельзя: повтор того же запроса в ту же миллисекунду добавил бы вторую
      env.DB.prepare('UPDATE user_level SET freezes = COALESCE(freezes, 1) + 1 WHERE user_id = ?1 AND changes() > 0').bind(uid),
    ]
    : [
      log('NOT EXISTS (SELECT 1 FROM shop_owned WHERE user_id = ?2 AND item = ?3)'),
      env.DB.prepare('INSERT OR IGNORE INTO shop_owned (user_id, item, price, at) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM shop_log WHERE id = ?5)').bind(uid, it.id, it.price, now, id),
      // купленное сразу надевается — только если покупку записала эта пачка (changes() — строка shop_owned выше)
      ...(it.slot ? [env.DB.prepare('INSERT INTO shop_wear (user_id, slot, item, at) SELECT ?1, ?2, ?3, ?4 WHERE changes() > 0 '
        + 'ON CONFLICT(user_id, slot) DO UPDATE SET item = excluded.item, at = excluded.at').bind(uid, it.slot, it.id, now)] : []),
    ];
  const res = await env.DB.batch(writes);
  const done = !!(res[0] && res[0].meta && res[0].meta.changes);
  const after = await shopState(env, uid);
  if (done) return { ok: true, item: it, st: after };
  // не записалось: этот же запрос уже прошёл раньше, предмет купили в соседней вкладке или рофланов уже не хватает
  if (!it.consumable && after.owned.has(it.id)) return { ok: true, already: true, st: after };
  if (it.consumable && (await env.DB.prepare('SELECT 1 FROM shop_log WHERE id = ?').bind(id).first())) return { ok: true, already: true, st: after };
  if (it.kind === 'freeze' && after.freezes >= FREEZE_MAX) return { err: [409, `Заморозок уже ${FREEZE_MAX} — больше не помещается.`] };
  return { err: [409, 'Не хватает рофланов.'], need: Math.max(1, it.price - Math.max(0, after.balance)) };
}

// ---------- админка ----------
// подарить (delta > 0) или снять (delta < 0) рофланы; снять можно не больше, чем есть
export async function grant(env, uid, delta, { by = null, note = '', now = Date.now() } = {}) {
  const d = Math.trunc(+delta || 0);
  if (!d || Math.abs(d) > 100000) return { err: [400, 'Нужно число рофланов: от −100 000 до 100 000, не ноль.'] };
  const st = await shopState(env, uid);
  const id = `adm:${uid}:${now}:${Math.random().toString(36).slice(2, 8)}`;
  const r = await env.DB.prepare("INSERT INTO shop_log (id, user_id, item, delta, reason, note, by_id, at) SELECT ?1, ?2, NULL, ?3, 'admin', ?4, ?5, ?6 "
    + 'WHERE ?3 > 0 OR ?7 + COALESCE((SELECT SUM(delta) FROM shop_log WHERE user_id = ?2), 0) + ?3 >= 0')
    .bind(id, uid, d, String(note || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null, by, now, st.earned.total).run();
  if (!(r.meta && r.meta.changes)) return { err: [409, `Столько снять нельзя: у человека ${Math.max(0, st.balance)}.`] };
  return { ok: true, st: await shopState(env, uid) };
}
// журнал: последние операции человека или всего сайта, с именами
export async function shopLog(env, { uid = null, limit = 60 } = {}) {
  await ensureShop(env);
  const lim = Math.max(1, Math.min(200, limit));
  const q = uid
    ? env.DB.prepare('SELECT l.id, l.user_id, l.item, l.delta, l.reason, l.note, l.at, u.uname, a.uname AS by_handle FROM shop_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN users a ON a.id = l.by_id WHERE l.user_id = ? ORDER BY l.at DESC LIMIT ?').bind(uid, lim)
    : env.DB.prepare('SELECT l.id, l.user_id, l.item, l.delta, l.reason, l.note, l.at, u.uname, a.uname AS by_handle FROM shop_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN users a ON a.id = l.by_id ORDER BY l.at DESC LIMIT ?').bind(lim);
  const { results } = await q.all();
  return (results || []).map((r) => ({
    user: r.user_id, handle: r.uname || '', item: r.item || '', title: r.item ? (itemOf(r.item) || {}).title || r.item : '',
    delta: +r.delta || 0, reason: r.reason, note: r.note || '', by: r.by_handle || '', at: +r.at || 0,
  }));
}
// сводка для админки: сколько потрачено и что покупают
export async function shopTotals(env) {
  await ensureShop(env);
  const [sum, top] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(-delta), 0) AS spent, COUNT(DISTINCT user_id) AS people FROM shop_log WHERE reason = 'buy'"),
    env.DB.prepare("SELECT item, COUNT(*) AS n FROM shop_log WHERE reason = 'buy' GROUP BY item ORDER BY n DESC LIMIT 8"),
  ]);
  const s = (sum.results || [])[0] || {};
  return {
    buys: +s.n || 0, spent: +s.spent || 0, people: +s.people || 0,
    top: (top.results || []).map((r) => ({ item: r.item, title: (itemOf(r.item) || {}).title || r.item, n: +r.n || 0 })),
  };
}
