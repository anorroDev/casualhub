// Импорт игр из Steam: профиль из ссылки, id или имени; список игр по наигранному; закрытый профиль; без ключа.
// Steam подменён: fetch отвечает по адресу. node --test tests/steam.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileOf, makeSteamRoutes, steamOn } from '../functions/_lib/steam.js';

const ID = '76561198000000001';
function setup(env = { STEAM_KEY: 'k3y' }, answer) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u.pathname + '?' + [...u.searchParams.keys()].join(','));
    assert.equal(u.searchParams.get('key'), 'k3y');
    const r = answer(u);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const routes = makeSteamRoutes({ json: (o) => o, fail: (status, error) => ({ status, error }), burst: () => 0 });
  const get = (profile) => routes['GET /steam/games']({ env, request: { url: 'https://casualhub.test/api/steam/games?profile=' + encodeURIComponent(profile) }, me: { id: 'u1' } });
  return { routes, get, calls, env };
}
const GAMES = { response: { game_count: 3, games: [
  { appid: 10, name: 'Counter-Strike', playtime_forever: 30, rtime_last_played: 1700000000 },
  { appid: 1145360, name: 'Hades', playtime_forever: 3725, rtime_last_played: 1760000000 },
  { appid: 413150, name: 'Stardew Valley', playtime_forever: 0 },
] } };

test('профиль: ссылка на /profiles/ и /id/, id64 или имя', () => {
  assert.deepEqual(profileOf(`https://steamcommunity.com/profiles/${ID}/`), { id: ID });
  assert.deepEqual(profileOf('https://steamcommunity.com/id/Gabe_N/games/?tab=all'), { vanity: 'Gabe_N' });
  assert.deepEqual(profileOf(ID), { id: ID });
  assert.deepEqual(profileOf(' gaben '), { vanity: 'gaben' });
  assert.equal(profileOf('https://store.steampowered.com/app/10'), null);
  assert.equal(profileOf('не профиль'), null);
  assert.equal(profileOf(''), null);
});

test('игры по наигранному: часы, обложка, когда играл; имя переводится в id', async () => {
  const { get, calls } = setup(undefined, (u) => (u.pathname.includes('ResolveVanityURL') ? { response: { success: 1, steamid: ID } } : GAMES));
  const r = await get('https://steamcommunity.com/id/gaben');
  assert.equal(r.steamid, ID);
  assert.deepEqual(r.games.map((g) => g.name), ['Hades', 'Counter-Strike', 'Stardew Valley']);
  assert.deepEqual({ ...r.games[0] }, { appid: 1145360, name: 'Hades', hours: 62.1, last: 1760000000000, art: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/library_600x900.jpg' });
  assert.equal(r.games[2].last, null);
  assert.deepEqual(calls.map((c) => c.split('?')[0].split('/')[1]), ['ISteamUser', 'IPlayerService']);
});

test('закрытый профиль, нет такого имени, Steam молчит, без ключа', async () => {
  assert.equal((await setup(undefined, () => ({ response: {} })).get(ID)).status, 403, 'игры скрыты настройками приватности');
  assert.equal((await setup(undefined, () => ({ response: { success: 42, message: 'No match' } })).get('nobody_here')).status, 404);
  assert.equal((await setup(undefined, () => new Error('down')).get(ID)).status, 502);
  assert.equal((await setup(undefined, () => GAMES).get('https://example.com/x')).status, 400);
  const off = setup({}, () => GAMES);
  assert.equal(steamOn(off.env), false);
  assert.equal((await off.get(ID)).status, 503);
  assert.deepEqual(await off.routes['GET /steam/on']({ env: off.env }), { on: false });
});
