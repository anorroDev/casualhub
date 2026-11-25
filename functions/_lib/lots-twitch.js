// Казуал Хаб: лоты из чата Twitch. Страница ведущего (lots/app.js + /twitch-chat.js) читает чат канала и шлёт пачкой
// «!лот название» на POST /api/lots/:code/twitch (API): лот — от ведущего, с пометкой via 'tw:<ник>' и via_name (как ник
// виден в чате). Здесь — чистые правила пачки: какой ник и название годятся, сколько лотов уже у каждого ника в сборе.
export const TW_LOGIN_RE = /^[a-z0-9_]{1,25}$/;
const SPOOF = /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
const cut = (s, n) => String(s == null ? '' : s).replace(SPOOF, '').replace(/\s+/g, ' ').trim().slice(0, n);

// [{ login, display, name }] → годные: ник — латиница Twitch (без регистра), название — 1–60 знаков, не больше max за раз
export function cleanTwitchLots(items, max = 25) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const x of items) {
    if (out.length >= max) break;
    if (!x || typeof x !== 'object') continue;
    const login = String(x.login || '').toLowerCase();
    const name = cut(x.name, 60);
    if (!TW_LOGIN_RE.test(login) || !name) continue;
    out.push({ login, display: cut(x.display, 40) || login, name });
  }
  return out;
}

// сколько лотов уже у каждого ника: строки lots с via 'tw:<ник>' → { 'tw:<ник>': число }
export function twitchCounts(rows) {
  const c = {};
  for (const r of rows || []) if (r && typeof r.via === 'string' && r.via.startsWith('tw:')) c[r.via] = (c[r.via] || 0) + 1;
  return c;
}
