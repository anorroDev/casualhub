// Казуал Хаб: «Разбор альбома» — треклист альбома с 30-секундными отрывками и разборы того же альбома у друзей.
// Треклист берём у Deezer (там отрывки почти у всех треков), если не нашёлся — у Apple (iTunes). Ключи не нужны.
// Ссылки на отрывки у Deezer подписаны и через какое-то время протухают, поэтому кэш короткий.
import { clip, readShelf, MUSIC_LINK_RE } from './shelf.js';

const UA = { 'user-agent': 'CasualHub/1.0 (+https://casualhub.pages.dev)', accept: 'application/json' };
async function getJson(url, ttl) {
  const cache = caches.default;
  const key = new Request('https://album-cache.casualhub/' + encodeURIComponent(url));
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: UA });
  if (!res.ok) throw new Error('album ' + res.status);
  const data = await res.json();
  await cache.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + ttl } }));
  return data;
}
// сравнение названий: без регистра, скобок «(Deluxe)» и знаков
export const albumNorm = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+(single|ep)$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const httpsOr = (u) => (/^https:\/\/[^\s"'<>\\]{1,1500}$/.test(String(u || '')) ? String(u) : '');
const linkOr = (u) => (MUSIC_LINK_RE.test(String(u || '')) ? String(u) : '');
const MAX_TRACKS = 60;
// насколько найденный альбом похож на искомый: название важнее исполнителя
function score(want, title, artist) {
  const t = albumNorm(title), a = albumNorm(artist), wt = albumNorm(want.title), wa = albumNorm(want.artist);
  let s = 0;
  if (t === wt) s += 4; else if (t.includes(wt) || wt.includes(t)) s += 2;
  if (wa && (a === wa || a.includes(wa) || wa.includes(a))) s += 3;
  return s;
}
async function deezerAlbum(id) {
  const [al, tr] = await Promise.all([getJson(`https://api.deezer.com/album/${id}`, 300), getJson(`https://api.deezer.com/album/${id}/tracks?limit=100`, 300)]);
  if (!al || al.error || !tr || !Array.isArray(tr.data)) return null;
  const tracks = tr.data.filter((x) => x && x.title).slice(0, MAX_TRACKS).map((x, i) => ({
    n: i + 1, disc: +x.disk_number || 1, title: clip(x.title, 140), artist: clip((x.artist || {}).name || (al.artist || {}).name, 80),
    dur: +x.duration || 0, preview: httpsOr(x.preview), link: linkOr(x.link),
  }));
  return { src: 'dz:' + id, title: clip(al.title, 140), artist: clip((al.artist || {}).name, 80), year: String(al.release_date || '').slice(0, 4), art: httpsOr(al.cover_xl || al.cover_big), link: linkOr(al.link), tracks };
}
async function appleAlbum(id) {
  const d = await getJson(`https://itunes.apple.com/lookup?id=${id}&entity=song&country=US&limit=200`, 300);
  const rows = (d && d.results) || [];
  const al = rows.find((x) => x.wrapperType === 'collection');
  const songs = rows.filter((x) => x.wrapperType === 'track' && x.kind === 'song').sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber));
  if (!al || !songs.length) return null;
  const tracks = songs.slice(0, MAX_TRACKS).map((x, i) => ({
    n: i + 1, disc: +x.discNumber || 1, title: clip(x.trackName, 140), artist: clip(x.artistName, 80),
    dur: Math.round((+x.trackTimeMillis || 0) / 1000), preview: httpsOr(x.previewUrl), link: linkOr(x.trackViewUrl),
  }));
  return { src: 'it:' + id, title: clip(al.collectionName, 140), artist: clip(al.artistName, 80), year: String(al.releaseDate || '').slice(0, 4), art: httpsOr(String(al.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.')), link: linkOr(al.collectionViewUrl), tracks };
}
// найти альбом: по прошлому источнику (src), по ссылке из оценки или поиском по исполнителю и названию
export async function albumTracks({ src, link, artist, title }) {
  const s = String(src || '');
  if (/^dz:\d{1,15}$/.test(s)) { const a = await deezerAlbum(s.slice(3)).catch(() => null); if (a && a.tracks.length) return a; }
  if (/^it:\d{1,15}$/.test(s)) { const a = await appleAlbum(s.slice(3)).catch(() => null); if (a && a.tracks.length) return a; }
  const l = String(link || '');
  const dz = /deezer\.com\/(?:[a-z]{2}\/)?album\/(\d{1,15})/.exec(l);
  if (dz) { const a = await deezerAlbum(dz[1]).catch(() => null); if (a && a.tracks.length) return a; }
  const it = /music\.apple\.com\/.*\/album\/[^/]*\/(\d{1,15})/.exec(l) || /music\.apple\.com\/.*\/album\/(\d{1,15})/.exec(l);
  if (it) { const a = await appleAlbum(it[1]).catch(() => null); if (a && a.tracks.length) return a; }
  const want = { artist: String(artist || '').slice(0, 80), title: String(title || '').slice(0, 140) };
  if (albumNorm(want.title).length < 1) return null;
  const q = (want.artist ? want.artist + ' ' : '') + want.title;
  const [dzList, itList] = await Promise.all([
    getJson(`https://api.deezer.com/search/album?limit=10&q=${encodeURIComponent(q)}`, 3600).then((d) => d.data || []).catch(() => []),
    getJson(`https://itunes.apple.com/search?media=music&entity=album&limit=10&country=US&term=${encodeURIComponent(q)}`, 3600).then((d) => d.results || []).catch(() => []),
  ]);
  const best = [
    ...dzList.map((x) => ({ k: 'dz', id: x.id, s: score(want, x.title, (x.artist || {}).name) + 0.5 })), // у Deezer отрывки чаще — при равенстве он
    ...itList.map((x) => ({ k: 'it', id: x.collectionId, s: score(want, x.collectionName, x.artistName) })),
  ].filter((x) => x.id && x.s >= 4).sort((a, b) => b.s - a.s);
  for (const b of best.slice(0, 3)) {
    const a = await (b.k === 'dz' ? deezerAlbum(b.id) : appleAlbum(b.id)).catch(() => null);
    if (a && a.tracks.length >= 2) return a;
  }
  return null;
}

// отрывок одного трека (синглы и треки из прошлых оценок): Deezer по ссылке или поиском, иначе Apple
export async function trackPreview({ link, artist, title }) {
  const want = { artist: String(artist || '').slice(0, 80), title: String(title || '').slice(0, 140) };
  const out = (x) => (x && x.preview ? { title: clip(x.title, 140), artist: clip(x.artist, 80), preview: x.preview, link: x.link || '' } : null);
  const dz = /deezer\.com\/(?:[a-z]{2}\/)?track\/(\d{1,15})/.exec(String(link || ''));
  if (dz) {
    const t = await getJson(`https://api.deezer.com/track/${dz[1]}`, 300).catch(() => null);
    if (t && !t.error && httpsOr(t.preview)) return out({ title: t.title, artist: (t.artist || {}).name, preview: httpsOr(t.preview), link: linkOr(t.link) });
  }
  if (albumNorm(want.title).length < 1) return null;
  const q = (want.artist ? want.artist + ' ' : '') + want.title;
  const [dl, il] = await Promise.all([
    getJson(`https://api.deezer.com/search/track?limit=10&q=${encodeURIComponent(q)}`, 300).then((d) => d.data || []).catch(() => []),
    getJson(`https://itunes.apple.com/search?media=music&entity=song&limit=10&country=US&term=${encodeURIComponent(q)}`, 3600).then((d) => d.results || []).catch(() => []),
  ]);
  const best = [
    ...dl.map((x) => ({ s: score(want, x.title, (x.artist || {}).name) + 0.5, title: x.title, artist: (x.artist || {}).name, preview: httpsOr(x.preview), link: linkOr(x.link) })),
    ...il.map((x) => ({ s: score(want, x.trackName, x.artistName), title: x.trackName, artist: x.artistName, preview: httpsOr(x.previewUrl), link: linkOr(x.trackViewUrl) })),
  ].filter((x) => x.preview && x.s >= 4).sort((a, b) => b.s - a.s)[0];
  return out(best);
}

// разборы того же альбома у друзей: баллы треков по номерам. Альбом узнаём по названию оценки («Исполнитель — Альбом»)
const keyOf = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
export async function friendsAlbum(env, me, name) {
  const want = keyOf(name);
  if (!want) return [];
  const { results: fr } = await env.DB.prepare(
    "SELECT CASE WHEN f.a = ?1 THEN f.b ELSE f.a END AS id, u.username, u.uname FROM friendships f JOIN users u ON u.id = (CASE WHEN f.a = ?1 THEN f.b ELSE f.a END) WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted'"
  ).bind(me.id).all();
  if (!fr.length) return [];
  const ids = fr.slice(0, 90).map((x) => x.id);
  const people = new Map(fr.map((x) => [x.id, { id: x.id, username: x.username, handle: x.uname }]));
  const { results: shelves } = await env.DB.prepare(`SELECT user_id, data FROM shelves WHERE user_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const out = [];
  for (const sh of shelves) {
    let list = [];
    try { list = readShelf(sh).ratings; } catch (e) { continue; }
    const album = list.find((r) => r && r.vis !== 'private' && !r.albumOf && keyOf(r.name) === want);
    if (!album) continue;
    // баллы треков: записи внутри альбома (tracks) и отдельные оценки треков по 4+ критериям — они главнее
    const byN = new Map();
    for (const e of Array.isArray(album.tracks) ? album.tracks : []) if (e && +e.v > 0 && Number.isInteger(+e.n)) byN.set(+e.n, { n: +e.n, v: Math.min(10, +e.v), t: clip(e.t, 140) });
    for (const r of list) if (r && r.albumOf === album.id && r.vis !== 'private' && typeof r.total === 'number' && Number.isFinite(+r.trackNo)) byN.set(+r.trackNo, { n: +r.trackNo, v: Math.max(0, Math.min(10, +r.total)), t: clip(r.title || r.name, 140) });
    const tracks = [...byN.values()].sort((a, b) => a.n - b.n);
    if (tracks.length < 2) continue;
    out.push({ user: people.get(sh.user_id), total: typeof album.total === 'number' ? album.total : null, tracks: tracks.slice(0, 60) });
  }
  return out.sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 6);
}
