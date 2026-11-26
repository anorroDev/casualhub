// Казуал Хаб: «Угадай по пикселям» — мини-игра дня (страница /games/pixel/, id pixel). Каждый день по Киеву одна обложка
// на всех: игра, фильм, сериал или аниме из списка «Загадки дня» (POOL и сравнение ответов — riddle.js, поэтому написание
// не важно: регистр, «ё», знаки, одна опечатка у длинных названий). Порядок дней — свой (своё зерно), а тайтл загадки дня
// в тот же день пропускается. Номер — №1 с 26 ноября 2026.
// Обложка крупными пикселями; каждая неверная попытка или «Пропустить» делает её чётче: 6 попыток, STEPS — сколько пикселей
// в ширину на каждой (0 — картинка целиком). Пиксели рисует браузер на холсте, а картинку берёт только с нашего адреса
// (GET /games/pixel/img?d=день): настоящий адрес (в нём название или код Steam) и название до конца игры на страницу не
// уходят, метаданные файла вырезаются (stripMeta: в EXIF и XMP бывает название).
// Обложку дня сервер ищет один раз помощниками поиска works.js и API (Steam, IMDb, AniList, Wikidata, Википедия) и
// запоминает в pixel_days (день → номер тайтла в POOL и адрес картинки): весь день она у всех одна. Не нашлась — следующий
// тайтл по тому же порядку. Ответы источников и сама картинка лежат в Cache API, своих таблиц-кэшей нет. На поиск у запроса —
// не больше LOOKUP подзапросов (бесплатный план — до 50 на запрос): не хватило — следующий запрос продолжит с кэша.
// Попытки — pixel_tries (строка на человека и день). Запись — условным UPDATE с n = n + 1 при том n, которое видела
// страница: параллельные запросы не дадут больше 6 попыток, а двойное нажатие не засчитается дважды.
// Без входа играть можно (адреса PIXEL_PUBLIC): попытки гостя живут в его браузере и приходят списком prev — сервер только
// сверяет ответ; рекордов и опыта нет. Вошёл в тот же день — сыгранное переносится в аккаунт (POST /games/pixel/claim).
// Опыт — правила pixel (угадал) и pixel_fast (с 1-й или 2-й попытки) в levels.js, раз в день; ref — день.
import { dayKey, shiftDay } from './levels.js';
import { POOL, norm, isRight, riddleOf, streakOf } from './riddle.js';
import { findWorks } from './works.js';

export const PIXEL_TZ = 'Europe/Kiev';
export const MAX_TRIES = 6;
// сколько пикселей в ширину на 1-й…6-й попытке; 0 — картинка целиком
export const STEPS = [6, 9, 14, 22, 36, 0];
// эти адреса открыты без входа: гость тоже играет (API добавляет их в PUBLIC)
export const PIXEL_PUBLIC = ['GET /games/pixel', 'GET /games/pixel/names', 'GET /games/pixel/img', 'POST /games/pixel/guess'];
const LAUNCH = Date.UTC(2026, 10, 26); // №1
const RECENT = 14; // что было картинкой последние две недели, снова не берём
const LOOKUP = 32; // подзапросов на поиск обложки в одном запросе
const IMG_MAX = 4e6;
const IMG_TTL = 7 * 86400;
const NONE_TTL = 3 * 86400;
const UA = 'CasualHub/1.0 (+https://casualhub.pages.dev)';
const DAY_RE = /^\d{4}-\d\d-\d\d$/;
// картинки — только с сайтов обложек: Steam, IMDb (Amazon), AniList, Википедия, Kitsu, MyAnimeList
const IMG_HOST = /^https:\/\/(?:[a-z0-9-]+\.)*(?:steamstatic\.com|akamaihd\.net|media-amazon\.com|anilist\.co|wikimedia\.org|kitsu\.(?:app|io)|myanimelist\.net)\//;

// ---------- какой тайтл в какой день ----------
// перемешано постоянным зерном, не тем, что у загадки дня: порядок тайтлов другой
function shuffled(seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = POOL.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const ORDER = shuffled(0x50495845); // «PIXE»
const dayIdx = (day) => { const [y, m, d] = String(day).split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - LAUNCH) / 864e5); };
export const numberOf = (day) => Math.max(1, dayIdx(day) + 1);
// тайтлы дня по порядку (номера в POOL): свой, а если у него нет обложки — следующие по тому же кругу. Без загадки дня
// (не одно и то же сегодня в двух играх) и без того, что было картинкой недавно (recent — номера в POOL)
export function candidatesOf(day, recent = new Set()) {
  const L = ORDER.length, base = ((dayIdx(day) % L) + L) % L, riddle = POOL.indexOf(riddleOf(day).r);
  const out = [];
  for (let k = 0; k < L; k++) { const i = ORDER[(base + k) % L]; if (i !== riddle && !recent.has(i)) out.push(i); }
  return out;
}
// все названия — подсказки при вводе (ответ среди них, но какой — не видно): как показывать (a, en) и как ещё пишут (al)
export const NAMES = POOL.map((r) => ({ a: r.a, en: r.en && r.en !== r.a ? r.en : '', al: (r.al || []).slice() })).sort((x, y) => x.a.localeCompare(y.a, 'ru'));
// когда по Киеву начнётся следующий день — для «новая картинка через …» (летнее время двигает полночь: ищем саму смену дня)
let kyivFmt = null;
const kyivDay = (t) => { try { kyivFmt = kyivFmt || new Intl.DateTimeFormat('en-CA', { timeZone: PIXEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }); return kyivFmt.format(new Date(t)); } catch (e) { return dayKey(t, PIXEL_TZ); } };
export function nextDay(now) {
  const day = kyivDay(now);
  let lo = now, hi = now + 26 * 3600e3;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (kyivDay(mid) === day) lo = mid; else hi = mid; }
  return hi;
}

// ---------- попытки ----------
const cleanGuess = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 80);
const parse = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.map((x) => String(x == null ? '' : x)) : []; } catch (e) { return []; } };
// попытки по порядку ('' — «Пропустить»): первый верный ответ заканчивает игру, после него ничего не считается
export function replay(r, list) {
  const tries = [];
  let solved = false;
  for (const raw of (Array.isArray(list) ? list : []).slice(0, MAX_TRIES)) {
    const g = cleanGuess(raw);
    tries.push(g);
    if (g && isRight(r, g)) { solved = true; break; }
  }
  return { tries, solved, over: !solved && tries.length >= MAX_TRIES };
}
// рекорды по своим законченным дням ({ day, n, solved }): сыграно, угадано, серия (до сегодня или до вчера), лучшая серия,
// сколько раз угадано с 1-й…6-й попытки
export function statsOf(rows, today) {
  const done = (rows || []).filter((x) => x && (x.solved || +x.n >= MAX_TRIES));
  const won = done.filter((x) => x.solved);
  const dist = Array(MAX_TRIES).fill(0);
  for (const x of won) dist[Math.min(MAX_TRIES, Math.max(1, +x.n || 1)) - 1]++;
  const days = won.map((x) => x.day).sort();
  let best = 0, run = 0, prev = '';
  for (const d of days) { run = prev && shiftDay(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { played: done.length, won: won.length, streak: streakOf(days, today), best, dist };
}

// ---------- картинка: метаданные долой ----------
const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));
function join(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
// JPEG: без APP1–APP15 (EXIF, XMP, Photoshop с IPTC) и комментариев; ICC-профиль (APP2) и Adobe (APP14, от него зависят
// цвета) остаются. Данные кадра копируются как есть до следующего маркера (FF и не 00, не RSTn)
function stripJpeg(b) {
  const parts = [b.subarray(0, 2)];
  let i = 2, w = 0, h = 0;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    const mk = b[i + 1];
    if (mk === 0xff) { i++; continue; }
    if (mk === 0xd9) { parts.push(b.subarray(i, i + 2)); return { bytes: join(parts), w, h }; }
    if (mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3], end = i + 2 + len;
    if (len < 2 || end > b.length) return null;
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc && len >= 7) { h = (b[i + 5] << 8) | b[i + 6]; w = (b[i + 7] << 8) | b[i + 8]; }
    const app = mk >= 0xe1 && mk <= 0xef;
    const keep = mk !== 0xfe && (!app || (mk === 0xe2 && ascii(b, i + 4, i + 15) === 'ICC_PROFILE') || (mk === 0xee && ascii(b, i + 4, i + 9) === 'Adobe'));
    if (keep) parts.push(b.subarray(i, end));
    i = end;
    if (mk === 0xda) {
      let j = i;
      for (;;) {
        j = b.indexOf(0xff, j);
        if (j < 0 || j + 1 >= b.length) { parts.push(b.subarray(i)); return { bytes: join(parts), w, h }; }
        const nx = b[j + 1];
        if (nx === 0x00 || (nx >= 0xd0 && nx <= 0xd7)) { j += 2; continue; }
        if (nx === 0xff) { j += 1; continue; }
        break;
      }
      parts.push(b.subarray(i, j));
      i = j;
    }
  }
  return { bytes: join(parts), w, h };
}
// PNG: без текстовых кусков (tEXt, zTXt, iTXt), EXIF и времени
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
function stripPng(b) {
  const parts = [b.subarray(0, 8)];
  const u32 = (k) => ((b[k] << 24) | (b[k + 1] << 16) | (b[k + 2] << 8) | b[k + 3]) >>> 0;
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32(i), type = ascii(b, i + 4, i + 8), end = i + 12 + len;
    if (end > b.length) return null;
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') return { bytes: join(parts), w: u32(16), h: u32(20) };
  }
  return null;
}
// WebP: без кусков EXIF и XMP (и их флагов в VP8X), размер RIFF пересчитан
function stripWebp(b) {
  const parts = [];
  const le = (k, n) => { let v = 0; for (let x = n - 1; x >= 0; x--) v = v * 256 + b[k + x]; return v; };
  let i = 12, total = 4, w = 0, h = 0;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, i + 4), len = le(i + 4, 4), end = Math.min(b.length, i + 8 + len + (len & 1));
    if (i + 8 + len > b.length) return null;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const part = type === 'VP8X' ? b.slice(i, end) : b.subarray(i, end);
      if (type === 'VP8X' && len >= 10) { part[8] &= ~0x0c; w = le(i + 12, 3) + 1; h = le(i + 15, 3) + 1; }
      parts.push(part);
      total += end - i;
    }
    i = end;
  }
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 4));
  head.set(b.subarray(8, 12), 8);
  for (let k = 0; k < 4; k++) head[4 + k] = Math.floor(total / 256 ** k) & 255;
  return { bytes: join([head, ...parts]), w, h };
}
// { type, bytes, w, h } или null: не JPEG, PNG или WebP, битая или слишком маленькая (заглушка вместо обложки)
export function stripMeta(b) {
  if (!b || b.length < 32) return null;
  let o = null, type = '';
  if (b[0] === 0xff && b[1] === 0xd8) { o = stripJpeg(b); type = 'image/jpeg'; }
  else if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') { o = stripPng(b); type = 'image/png'; }
  else if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') { o = stripWebp(b); type = 'image/webp'; }
  if (!o || (o.w && o.w < 100) || (o.h && o.h < 100)) return null;
  return { type, ...o };
}

// ---------- поиск обложки ----------
// счёт подзапросов (fetch, чтение и запись Cache API): кончился — поиск прерывается (short), следующий запрос продолжит с кэша
function meter(limit) {
  return { used: 0, short: false, errors: 0, spend(n) { if (this.used + n > limit) { this.short = true; throw new Error('pixel: подзапросы кончились'); } this.used += n; } };
}
// как cachedJson в API (и тот же ключ кэша — ответы общие с поиском обложек), но со счётом: чтение кэша — 1, промах — ещё 2
function getter(cache, fetcher, m) {
  return async (url, init, ttl) => {
    const key = new Request('https://covers-cache.casualhub/' + encodeURIComponent(url + '|' + ((init && init.body) || '')));
    m.spend(1);
    const hit = await cache.match(key);
    if (hit) return hit.json();
    m.spend(2);
    const { wait, ...opts } = init || {};
    let data;
    try {
      const res = await fetcher(url, { ...opts, signal: AbortSignal.timeout(wait || 6000), headers: { 'user-agent': UA, accept: 'application/json', ...((init && init.headers) || {}) } });
      if (!res.ok) throw new Error('pixel: источник ответил ' + res.status);
      data = await res.json();
    } catch (e) { m.errors++; throw e; }
    await cache.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + (ttl || 86400) } }));
    return data;
  };
}
// зависимости findWorks (works.js): поиск обложек, карточки Steam и перевод названий — функции API; их подзапросы
// считаем с запасом (Steam — два запроса, аниме — до трёх сайтов). Поиск обложек запоминается: works.js повторяет тот же
// поиск Steam, что уже сделал coverFor, — второй раз он ничего не стоит
function lookupDeps(dep, m) {
  const w = dep.works || {};
  const counted = (fn, cost, empty) => async (...a) => {
    if (!fn) return empty;
    m.spend(typeof cost === 'function' ? cost(...a) : cost);
    try { return await fn(...a); } catch (e) { m.errors++; throw e; }
  };
  const cover = counted(w.cover, (kind) => (kind === 'anime' ? 9 : 6), []), seen = new Map();
  return {
    get: getter(dep.cache, dep.fetch, m),
    cover: (kind, q) => { const k = kind + '|' + q; if (!seen.has(k)) seen.set(k, cover(kind, q)); return seen.get(k); },
    steam: counted(w.steam, 3, []),
    latin: counted(w.latin, 9, []),
    translit: w.translit || ((s) => String(s)),
    genres: w.genres || (() => []),
    lang: 'en', geo: null,
  };
}
// год карточки рядом с годом тайтла: у игр карточка бывает раньше (ранний доступ: Minecraft в Wikidata — с 2009-го)
const YEAR_OK = { game: [-3, 1] };
// у аниме AniList находит и мангу с тем же названием и годом («Твоё имя»): её обложка другая
const NOT_KIND = { anime: /^(Манга|Ранобэ)$/ };
// пометка в скобках в конце названия — так AniList отличает экранизации: «JoJo's Bizarre Adventure (TV)», «… (2000)».
// Какая из них нужна, решает год
const bare = (t) => String(t || '').replace(/\s*\([^()]{1,16}\)\s*$/, '');
function fits(r, c) {
  if (!c || !c.art || (NOT_KIND[r.t] && NOT_KIND[r.t].test(c.sub || '')) || ![c.title, c.ru].some((t) => t && (isRight(r, t) || isRight(r, bare(t))))) return false;
  const y = parseInt(String(c.year || ''), 10);
  if (!y) return null; // года нет — подойдёт, если с годом ничего не нашлось
  const [lo, hi] = YEAR_OK[r.t] || [-1, 1];
  return y - r.y >= lo && y - r.y <= hi;
}
// обложка игры из английской Википедии (несвободный файл статьи — коробка); с Викисклада бывают фото и скриншоты
const WIKI_COVER = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/en\//;
// { art, alt } — адреса картинки (alt — запасная), null — у тайтла обложки нет. Игры: сначала Steam, если название в магазине
// совпало целиком (года Steam не знает: «DOOM» — та, что 2016 года, а «DOOM (1993)» уже не подходит), иначе поиск works.js
// (Wikidata, Википедия, Steam) с годом. Фильмы и сериалы — IMDb (по-русски — ещё Wikidata), аниме — AniList
export async function coverFor(r, d) {
  const q = r.en || r.a;
  if (r.t === 'game') {
    const exact = [r.a, r.en].filter(Boolean).map(norm);
    const st = await d.cover('game', q).catch(() => []);
    const s = (st || []).find((c) => c && c.art && exact.includes(norm(c.title)));
    if (s) return { art: s.art, alt: s.alt && s.alt !== s.art ? s.alt : '' };
  }
  const { items } = await findWorks(r.t === 'game' ? 'game' : r.t === 'anime' ? 'anime' : 'movie', q, d);
  const hit = items.find((c) => fits(r, c) === true) || items.find((c) => fits(r, c) === null);
  if (!hit) return null;
  // у игры со Steam и статьёй английской Википедии запасная — коробка оттуда: она того самого года (у CS:GO, а не у CS2)
  if (r.t === 'game' && hit.alt && WIKI_COVER.test(hit.alt) && !WIKI_COVER.test(hit.art)) return { art: hit.alt, alt: hit.art };
  const alt = hit.alt || hit.thumb || '';
  return { art: hit.art, alt: alt !== hit.art ? alt : '' };
}
async function readCapped(res, max) {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch (e) {} return null; }
    parts.push(value);
  }
  return join(parts);
}
// картинка по адресу обложки: переадресации проходим сами (каждая — тоже на сайт обложек), до 4 МБ, без метаданных
async function loadImage(url, fetcher, m) {
  let u = String(url || '');
  for (let hop = 0; hop < 4; hop++) {
    if (!IMG_HOST.test(u)) return null;
    try { if (m) m.spend(2); } catch (e) { return null; }
    let res;
    try { res = await fetcher(u, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA, accept: 'image/webp,image/jpeg,image/png;q=0.9,image/*;q=0.5' } }); }
    catch (e) { if (m) m.errors++; return null; }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      try { u = new URL(loc || '', u).href; } catch (e) { return null; }
      if (!loc) return null;
      continue;
    }
    if (!res.ok || +(res.headers.get('content-length') || 0) > IMG_MAX) return null;
    let buf;
    try { buf = await readCapped(res, IMG_MAX); } catch (e) { if (m) m.errors++; return null; }
    return buf ? stripMeta(buf) : null;
  }
  return null;
}
const NONE_KEY = (r) => new Request('https://pixel-cache.casualhub/none/' + encodeURIComponent(norm(r.a)));
const IMG_KEY = (day, idx) => new Request(`https://pixel-cache.casualhub/img/${day}/${idx}`);
const putImg = (cache, day, idx, img) => cache.put(IMG_KEY(day, idx), new Response(img.bytes, { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=' + IMG_TTL } }));

// ---------- база ----------
const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    // картинка дня: какой тайтл (номер в POOL) и откуда картинка (alt — запасной адрес); пишется один раз
    env.DB.prepare("CREATE TABLE IF NOT EXISTS pixel_days (day TEXT PRIMARY KEY, idx INTEGER NOT NULL, art TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL)"),
    // попытки: tries — список ответов ('' — пропуск), n — сколько их
    env.DB.prepare("CREATE TABLE IF NOT EXISTS pixel_tries (user_id TEXT NOT NULL, day TEXT NOT NULL, tries TEXT NOT NULL DEFAULT '[]', n INTEGER NOT NULL DEFAULT 0, solved INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, done_at INTEGER, PRIMARY KEY (user_id, day))"),
  ]);
  ready.add(env.DB);
}
// картинка дня: из pixel_days, а если её ещё нет — найти и запомнить (кто записал первым, тот и прав: параллельный запрос
// прочтёт ту же строку). Тайтл без обложки помечается в кэше на три дня; источник не ответил — тайтл не помечаем, но сегодня
// берём следующий. null — пока не нашлась (кончился счёт подзапросов или не ответил никто): страница спросит ещё раз
async function pickOf(env, day, dep) {
  const have = await env.DB.prepare('SELECT idx, art, alt FROM pixel_days WHERE day = ?').bind(day).first();
  if (have && POOL[have.idx]) return have;
  const { results } = await env.DB.prepare('SELECT idx FROM pixel_days WHERE day >= ? AND day < ?').bind(shiftDay(day, -RECENT), day).all();
  const recent = new Set((results || []).map((x) => +x.idx));
  const m = meter(LOOKUP), d = lookupDeps(dep, m);
  for (const idx of candidatesOf(day, recent)) {
    const r = POOL[idx];
    try { m.spend(1); } catch (e) { return null; }
    if (await dep.cache.match(NONE_KEY(r))) continue;
    const errs = m.errors;
    let c;
    try { c = await coverFor(r, d); } catch (e) { c = undefined; }
    if (m.short) return null;
    if (c) {
      for (const [art, alt] of [[c.art, c.alt], [c.alt, c.art]]) {
        if (!art) continue;
        const img = await loadImage(art, dep.fetch, m);
        if (img) {
          await env.DB.prepare('INSERT OR IGNORE INTO pixel_days (day, idx, art, alt, at) VALUES (?, ?, ?, ?, ?)').bind(day, idx, art, alt || '', Date.now()).run();
          const row = await env.DB.prepare('SELECT idx, art, alt FROM pixel_days WHERE day = ?').bind(day).first();
          if (row && row.idx === idx && row.art === art) await putImg(dep.cache, day, idx, img);
          return row;
        }
        if (m.short) return null;
      }
    }
    if (c || (c === null && m.errors === errs)) await dep.cache.put(NONE_KEY(r), new Response('1', { headers: { 'cache-control': 'public, max-age=' + NONE_TTL } }));
  }
  return null;
}

// ---------- ответы страницы ----------
const answerOf = (r) => ({ title: r.a, en: r.en && r.en !== r.a ? r.en : '', year: r.y, type: r.t });
const baseView = (day, now) => ({ day, n: numberOf(day), max: MAX_TRIES, steps: STEPS, now, next: nextDay(now) });
// адрес картинки — наш, без названия; ответ — только когда игра кончилась
function playView(day, pick, st, now, extra) {
  const done = st.solved || st.over;
  return { ...baseView(day, now), ready: true, img: '/api/games/pixel/img?d=' + day, tries: st.tries, solved: st.solved, over: st.over, answer: done ? answerOf(POOL[pick.idx]) : null, ...extra };
}
async function userView(env, uid, day, pick, now, extra) {
  const [row, past, fr] = await env.DB.batch([
    env.DB.prepare('SELECT tries, n, solved FROM pixel_tries WHERE user_id = ? AND day = ?').bind(uid, day),
    env.DB.prepare('SELECT day, n, solved FROM pixel_tries WHERE user_id = ? AND (solved = 1 OR n >= ?) ORDER BY day DESC LIMIT 400').bind(uid, MAX_TRIES),
    // друзья, которые сегодня уже доиграли: сколько попыток (без их ответов)
    env.DB.prepare(`SELECT u.username AS name, u.uname AS handle, t.n AS n, t.solved AS solved FROM friendships f
      JOIN pixel_tries t ON t.user_id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END AND t.day = ?2
      JOIN users u ON u.id = t.user_id WHERE (f.a = ?1 OR f.b = ?1) AND f.status = 'accepted' AND (t.solved = 1 OR t.n >= ?3) LIMIT 50`).bind(uid, day, MAX_TRIES),
  ]);
  const cur = (row.results || [])[0];
  const st = cur ? { tries: parse(cur.tries), solved: !!cur.solved, over: !cur.solved && +cur.n >= MAX_TRIES } : { tries: [], solved: false, over: false };
  const friends = (fr.results || []).map((x) => ({ name: x.name || '', handle: x.handle || '', tries: +x.n || 0, solved: !!x.solved }))
    .sort((a, b) => (b.solved - a.solved) || (a.tries - b.tries));
  return playView(day, pick, st, now, { guest: false, stats: statsOf(past.results || [], day), friends, ...extra });
}
const guestView = (day, pick, st, now, extra) => playView(day, pick, st, now, { guest: true, stats: null, friends: [], ...extra });

export function makePixelRoutes(h) {
  const { json, fail } = h;
  const NO_CACHE = { match: async () => undefined, put: async () => {} };
  const depOf = () => ({
    cache: h.cache || (typeof caches !== 'undefined' && caches.default) || NO_CACHE,
    fetch: h.fetch || ((...a) => fetch(...a)),
    works: h.works || {},
  });
  const ipOf = (request) => (h.clientIp ? h.clientIp(request) : '');
  // адреса открыты без входа: вошедшего узнаём сами (заблокированный играет как гость)
  const userOf = async (env, request) => {
    let u = null;
    try { u = h.currentUser ? await h.currentUser(env, request) : null; } catch (e) {}
    return u && !u.banned ? u : null;
  };
  const slow = (key, max) => !!(h.burst && h.burst(key, max, 60e3));
  async function giveXp(env, request, me, day, n) {
    if (!h.lvGive) return;
    try { await h.lvGive(env, request, me, me.id, [{ kind: 'pixel', ref: day }, ...(n <= 2 ? [{ kind: 'pixel_fast', ref: day }] : [])]); }
    catch (e) { console.error('pixel xp', e && e.message); }
  }
  // сегодняшний день по Киеву и его картинка (null — ещё не нашлась)
  async function today(env) {
    await ensure(env);
    const now = Date.now(), day = dayKey(now, PIXEL_TZ);
    const pick = await pickOf(env, day, depOf());
    return { now, day, pick };
  }
  const NOT_READY = 'Картинка дня ещё не готова, попробуй через минуту.';
  const NEW_DAY = 'Наступил новый день — обнови страницу: там уже новая картинка.';
  return {
    // сегодняшняя игра: номер, готова ли картинка; у вошедшего — его попытки, рекорды и друзья, у гостя попытки в браузере
    async 'GET /games/pixel'({ env, request }) {
      const me = await userOf(env, request);
      if (slow('pixel:' + (me ? me.id : 'ip:' + ipOf(request)), 60)) return fail(429, 'Слишком часто. Подожди немного.');
      const { now, day, pick } = await today(env);
      if (!pick) return json({ ...baseView(day, now), ready: false, guest: !me });
      return json(me ? await userView(env, me.id, day, pick, now) : guestView(day, pick, { tries: [], solved: false, over: false }, now));
    },
    async 'GET /games/pixel/names'() { return json({ items: NAMES }); },
    // картинка дня — байты с нашего адреса, без метаданных. Завтрашнюю заранее не отдаём
    async 'GET /games/pixel/img'({ env, request }) {
      const none = (status) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
      const day = new URL(request.url).searchParams.get('d') || '';
      if (!DAY_RE.test(day) || day > dayKey(Date.now(), PIXEL_TZ)) return none(404);
      if (slow('pximg:' + ipOf(request), 120)) return none(429);
      await ensure(env);
      const row = await env.DB.prepare('SELECT idx, art, alt FROM pixel_days WHERE day = ?').bind(day).first();
      if (!row) return none(404);
      const dep = depOf();
      let img = null;
      const hit = await dep.cache.match(IMG_KEY(day, row.idx));
      const ht = hit && hit.headers.get('content-type');
      if (hit && /^image\/(jpeg|png|webp)$/.test(ht || '')) img = { type: ht, bytes: new Uint8Array(await hit.arrayBuffer()) };
      for (const u of img ? [] : [row.art, row.alt]) {
        if (u && (img = await loadImage(u, dep.fetch, null))) { await putImg(dep.cache, day, row.idx, img); break; }
      }
      if (!img) return none(502);
      return new Response(img.bytes, { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
    },
    // { day, guess } или { day, skip: true }; at — сколько попыток видела страница (двойное нажатие и вторая вкладка не
    // засчитаются ещё раз); у гостя ещё prev — его прошлые попытки; peek — только узнать состояние (гость после обновления)
    async 'POST /games/pixel/guess'({ env, request }) {
      const me = await userOf(env, request);
      if (slow('pixelg:' + (me ? me.id : 'ip:' + ipOf(request)), 30)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = await h.readBody(request);
      const { now, day, pick } = await today(env);
      if (b.day && b.day !== day) return fail(409, NEW_DAY);
      if (!pick) return fail(503, NOT_READY);
      const r = POOL[pick.idx], skip = b.skip === true, g = skip ? '' : cleanGuess(b.guess);
      if (!me) {
        const prev = replay(r, Array.isArray(b.prev) ? b.prev : []);
        if (prev.solved || prev.over || b.peek === true) return json(guestView(day, pick, prev, now, { right: null }));
        if (!skip && !norm(g)) return fail(400, 'Напиши ответ или нажми «Пропустить».');
        if (g && prev.tries.some((t) => t && norm(t) === norm(g))) return fail(400, 'Этот ответ уже был.');
        const st = replay(r, [...prev.tries, g]);
        return json(guestView(day, pick, st, now, { right: !!g && st.solved }));
      }
      if (b.peek === true) return json(await userView(env, me.id, day, pick, now, { right: null }));
      if (!skip && !norm(g)) return fail(400, 'Напиши ответ или нажми «Пропустить».');
      await env.DB.prepare("INSERT OR IGNORE INTO pixel_tries (user_id, day, tries, n, solved, at) VALUES (?, ?, '[]', 0, 0, ?)").bind(me.id, day, now).run();
      const cur = await env.DB.prepare('SELECT tries, n, solved FROM pixel_tries WHERE user_id = ? AND day = ?').bind(me.id, day).first();
      const n = +cur.n || 0;
      if (cur.solved || n >= MAX_TRIES) return json(await userView(env, me.id, day, pick, now, { right: null }));
      if (Number.isInteger(b.at) && b.at !== n) return json(await userView(env, me.id, day, pick, now, { right: null, stale: true }));
      if (g && parse(cur.tries).some((t) => t && norm(t) === norm(g))) return fail(400, 'Этот ответ уже был.');
      const ok = !!g && isRight(r, g), fin = ok || n + 1 >= MAX_TRIES;
      // попытка засчитывается, только если с чтения её никто не добавил: n то же, игра не кончилась
      const w = await env.DB.prepare("UPDATE pixel_tries SET tries = json_insert(tries, '$[#]', ?1), n = n + 1, solved = ?2, at = ?3, done_at = ?4 WHERE user_id = ?5 AND day = ?6 AND solved = 0 AND n = ?7 AND n < ?8")
        .bind(g, ok ? 1 : 0, now, fin ? now : null, me.id, day, n, MAX_TRIES).run();
      const counted = !!(w.meta && w.meta.changes);
      if (counted && ok) await giveXp(env, request, me, day, n + 1);
      return json(await userView(env, me.id, day, pick, now, counted ? { right: ok } : { right: null, stale: true }));
    },
    // сыгранное сегодня без входа — в аккаунт, если в нём сегодня ещё ни одной попытки: { day, tries }. Ответы сверяются заново
    async 'POST /games/pixel/claim'({ env, request, me }) {
      if (slow('pixelc:' + me.id, 10)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = await h.readBody(request);
      const { now, day, pick } = await today(env);
      if (b.day !== day) return fail(409, NEW_DAY);
      if (!pick) return fail(503, NOT_READY);
      const st = replay(POOL[pick.idx], Array.isArray(b.tries) ? b.tries : []);
      if (st.tries.length) {
        const fin = st.solved || st.over;
        const w = await env.DB.prepare(`INSERT INTO pixel_tries (user_id, day, tries, n, solved, at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, day) DO UPDATE SET tries = excluded.tries, n = excluded.n, solved = excluded.solved, at = excluded.at, done_at = excluded.done_at WHERE pixel_tries.n = 0`)
          .bind(me.id, day, JSON.stringify(st.tries), st.tries.length, st.solved ? 1 : 0, now, fin ? now : null).run();
        if (w.meta && w.meta.changes && st.solved) await giveXp(env, request, me, day, st.tries.length);
      }
      return json(await userView(env, me.id, day, pick, now));
    },
  };
}
