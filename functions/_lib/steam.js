// Казуал Хаб: импорт игр из Steam в Мнение (страница — opinion/steam.js). Ключ Steam Web API — STEAM_KEY (переменная
// Pages; без него всё выключено: GET /steam/on → { on: false }, кнопки в Мнении нет). Профиль — ссылка
// steamcommunity.com/id/<имя> или /profiles/<id64>, сам id64 или имя (его переводит ResolveVanityURL). Игры — GetOwnedGames:
// нужен открытый профиль и «Сведения об играх: открытые». Отдаём список по наигранному — оценки собирает уже страница.
export const steamOn = (env) => !!(env && env.STEAM_KEY);
const ID_RE = /^7656119\d{10}$/;
const VANITY_RE = /^[A-Za-z0-9_-]{2,32}$/;
const art = (appid) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;

// ссылка, id64 или имя → { id } | { vanity } | null
export function profileOf(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  let m = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/profiles\/(\d{17})(?:[/?#].*)?$/i.exec(v);
  if (m) return ID_RE.test(m[1]) ? { id: m[1] } : null;
  m = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/id\/([^/?#]+)(?:[/?#].*)?$/i.exec(v);
  if (m) return VANITY_RE.test(m[1]) ? { vanity: m[1] } : null;
  if (ID_RE.test(v)) return { id: v };
  if (/^https?:|\//i.test(v)) return null;
  return VANITY_RE.test(v) ? { vanity: v } : null;
}

async function steamJson(env, path, params) {
  const u = new URL('https://api.steampowered.com/' + path);
  u.searchParams.set('key', env.STEAM_KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('steam ' + r.status);
  return r.json();
}

export function makeSteamRoutes(h) {
  const { json, fail } = h;
  return {
    async 'GET /steam/on'({ env }) { return json({ on: steamOn(env) }); },
    // ?profile=ссылка, id64 или имя → { steamid, games: [{ appid, name, hours, last, art }] } — по наигранному, не больше 1000
    async 'GET /steam/games'({ env, request, me }) {
      if (!steamOn(env)) return fail(503, 'Импорт из Steam на сайте пока не подключён.');
      if (h.burst && h.burst('steam:' + me.id, 10, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const p = profileOf(new URL(request.url).searchParams.get('profile'));
      if (!p) return fail(400, 'Вставь ссылку на профиль Steam, его id или имя из ссылки.');
      try {
        let id = p.id;
        if (!id) {
          const v = await steamJson(env, 'ISteamUser/ResolveVanityURL/v1/', { vanityurl: p.vanity });
          id = v && v.response && v.response.success === 1 && ID_RE.test(String(v.response.steamid)) ? String(v.response.steamid) : '';
          if (!id) return fail(404, 'Такого профиля Steam нет. Проверь ссылку.');
        }
        const d = await steamJson(env, 'IPlayerService/GetOwnedGames/v1/', { steamid: id, include_appinfo: 1, include_played_free_games: 1, format: 'json' });
        const list = d && d.response && Array.isArray(d.response.games) ? d.response.games : null;
        if (!list) return fail(403, 'Список игр скрыт. В Steam: профиль → «Редактировать профиль» → «Приватность» → «Сведения об играх» — «Открытые».');
        const games = list.filter((g) => g && Number.isInteger(g.appid) && g.name)
          .sort((a, b) => (+b.playtime_forever || 0) - (+a.playtime_forever || 0)).slice(0, 1000)
          .map((g) => ({ appid: g.appid, name: String(g.name).slice(0, 120), hours: Math.round((+g.playtime_forever || 0) / 6) / 10, last: +g.rtime_last_played > 0 ? +g.rtime_last_played * 1000 : null, art: art(g.appid) }));
        return json({ steamid: id, games });
      } catch (e) {
        console.error('steam', e && e.message);
        return fail(502, 'Steam сейчас не отвечает, попробуй позже.');
      }
    },
  };
}
