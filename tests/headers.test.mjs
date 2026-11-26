// Заголовки страниц с предпросмотром (functions/_lib/page-meta.js: /lots/<код>, /profile/, /u/<ник>) — копия блока /*
// из _headers: на ответы Functions _headers сам не действует, и копия не должна от него отставать.
// node --test tests/headers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECURITY } from '../functions/_lib/page-meta.js';

// блок «/*» из _headers: строки с отступом «Имя: значение» до пустой строки
function siteHeaders() {
  const lines = readFileSync(new URL('../_headers', import.meta.url), 'utf8').split(/\r?\n/);
  const out = {};
  let inside = false;
  for (const line of lines) {
    if (!line.trim()) { if (inside) break; continue; }
    if (!/^\s/.test(line)) { inside = line.trim() === '/*'; continue; }
    if (!inside) continue;
    const i = line.indexOf(':');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

test('копия заголовков в page-meta.js — слово в слово как блок /* в _headers', () => {
  const site = siteHeaders();
  assert.ok(site['Content-Security-Policy'], 'в _headers есть CSP');
  assert.deepEqual(Object.keys(SECURITY).sort(), Object.keys(site).sort(), 'те же заголовки');
  for (const [k, v] of Object.entries(site)) assert.equal(SECURITY[k], v, k);
});

test('в CSP страниц лотов и профиля — сокет комнаты, отрывки Deezer и iTunes, трейлеры IMDb', () => {
  const csp = Object.fromEntries(SECURITY['Content-Security-Policy'].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.ok(csp['connect-src'].includes('wss://casualhub.pages.dev'));
  assert.ok(csp['connect-src'].includes('wss://irc-ws.chat.twitch.tv'));
  assert.ok(csp['media-src'].includes('https://*.dzcdn.net') && csp['media-src'].includes('https://*.itunes.apple.com'));
  assert.ok(csp['frame-src'].includes('https://www.imdb.com'));
});
