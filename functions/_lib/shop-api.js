// Казуал Хаб: адреса магазина (/api/shop/…, /api/admin/shop…). Правила, цены и покупка — в shop.js. Главный файл API
// подключает эти адреса через makeShopRoutes(h), передавая свои помощники (ответы, проверки админа, журнал админки).
// Папка _lib не становится адресом сайта.
import { levelsMode } from './levels.js';
import { shopOn, shopState, shopView, buy, grant, shopLog, shopTotals, wear, looksOf } from './shop.js';

// не чаще 30 покупок в минуту на человека (в этом экземпляре функции): кнопку «Купить» не задолбить скриптом
const hits = new Map();
function tooFast(uid, now = Date.now()) {
  const h = hits.get(uid) || { n: 0, until: now + 60e3 };
  if (h.until < now) { h.n = 0; h.until = now + 60e3; }
  h.n++;
  if (hits.size > 500) hits.clear();
  hits.set(uid, h);
  return h.n > 30;
}

export function makeShopRoutes(h) {
  const { json, fail } = h;
  // открыт, если открыты уровни; при LEVELS = "admins" — только админам, как и уровни
  const gate = async (env, me) => shopOn(env) && (levelsMode(env) === 'all' || !!(h.adminCandidate(me, env) || (await h.isAdmin(env, me))));
  const answer = (r) => (r.err ? json({ error: r.err[1], need: r.need || 0 }, r.err[0]) : json({ ok: true, already: !!r.already, ...(r.st ? shopView(r.st) : {}) }));
  // человек для админки: по юзернейму (можно с @) или по id
  const userBy = (env, q) => {
    const s = String(q || '').trim().replace(/^@+/, '').toLowerCase();
    if (!s) return null;
    return env.DB.prepare('SELECT id, username, uname FROM users WHERE uname = ? OR id = ?').bind(s, s).first();
  };

  return {
    // баланс, заработанное по видам, каталог с отметкой «куплено», есть ли Васян, сколько «заморозок»
    async 'GET /shop/me'({ env, me }) {
      if (!(await gate(env, me))) return json({ on: false });
      return json(shopView(await shopState(env, me.id)));
    },
    // купить: { item, rid } — rid нужен для расходуемого (повтор того же запроса не купит дважды)
    async 'POST /shop/buy'({ env, request, me }) {
      if (!(await gate(env, me))) return fail(404, 'Магазин пока закрыт.');
      if (tooFast(me.id)) return fail(429, 'Слишком часто. Подожди минуту.');
      const b = await h.readBody(request);
      return answer(await buy(env, me.id, b.item, { rid: String(b.rid || '') }));
    },
    // надеть купленное или вернуть «как у всех»: { item }
    async 'PUT /shop/wear'({ env, request, me }) {
      if (!(await gate(env, me))) return fail(404, 'Магазин пока закрыт.');
      if (tooFast(me.id)) return fail(429, 'Слишком часто. Подожди минуту.');
      const b = await h.readBody(request);
      return answer(await wear(env, me.id, b.item));
    },
    // что надето у людей: ?ids=a,b,c — рамка аватара, значок и стиль ника (их видят все, кто видит человека)
    async 'GET /shop/look'({ env, request, me }) {
      if (!(await gate(env, me))) return json({ users: {} });
      const ids = String(new URL(request.url).searchParams.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean);
      return json({ users: await looksOf(env, ids) });
    },

    // ---------- админка ----------
    // ?user=юзернейм — баланс человека и его журнал; без него — последние операции всего сайта и сводка
    async 'GET /admin/shop'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!shopOn(env)) return json({ on: false });
      const q = new URL(request.url).searchParams.get('user');
      if (q) {
        const u = await userBy(env, q);
        if (!u) return fail(404, 'Нет такого человека.');
        const st = await shopState(env, u.id);
        return json({ on: true, user: { id: u.id, username: u.username, handle: u.uname }, ...shopView(st), log: await shopLog(env, { uid: u.id, limit: 100 }) });
      }
      return json({ on: true, totals: await shopTotals(env), log: await shopLog(env, { limit: 60 }) });
    },
    // подарить или снять рофланы: { to: юзернейм или id, delta, note }
    async 'POST /admin/shop/grant'({ env, request, me }) {
      if (!(await h.adminActive(env, request, me))) return fail(404, 'Нет такого адреса.');
      if (!shopOn(env)) return fail(400, 'Магазин выключен вместе с уровнями (LEVELS = "0").');
      const b = await h.readBody(request);
      const u = await userBy(env, b.to);
      if (!u) return fail(404, 'Нет такого человека.');
      const r = await grant(env, u.id, b.delta, { by: me.id, note: b.note });
      if (r.err) return fail(r.err[0], r.err[1]);
      const d = Math.trunc(+b.delta || 0);
      await h.adminLog(env, request, me, `shop: ${d > 0 ? '+' : ''}${d} @${u.uname}`, true);
      return json({ ok: true, user: { id: u.id, username: u.username, handle: u.uname }, ...shopView(r.st), log: await shopLog(env, { uid: u.id, limit: 100 }) });
    },
  };
}
