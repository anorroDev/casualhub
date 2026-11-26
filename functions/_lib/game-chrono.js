// Казуал Хаб: «Хронология» — игра дня (страница games/chrono/, адреса /api/games/chrono…). Пять игр, фильмов, сериалов
// и аниме из списка «Загадки дня» (POOL в riddle.js) — расставить по году выхода, от старых к новым. Набор один на всех:
// день по Киеву, №1 — 26 ноября 2026 (LAUNCH). В наборе разные годы, от самого старого до самого нового — от 10 лет,
// одного вида — не больше двух, нет карточек двух прошлых дней и сегодняшней загадки (иначе «Хронология» выдала бы её
// ответ). Годы уходят на страницу только вместе с итогом. Счёт: сколько карточек на своём месте (из 5) плюс сколько
// соседних пар стоят в верном порядке (из 4) — всего 9. Ответ один раз в день: у вошедших он в chrono_days, повторный
// ответ получает уже записанный итог; у гостей сервер только считает, итог хранит браузер. Опыт — chrono (сыграл)
// и chrono_perfect (без ошибок), по разу в день (levels.js). Обложки — с IMDb (там есть и игры): по названию, виду и году;
// не нашлось — карточка без обложки.
import { dayKey, shiftDay } from './levels.js';
import { POOL, riddleOf, streakOf } from './riddle.js';

export const CHRONO_TZ = 'Europe/Kiev';
export const CHRONO_N = 5;
export const CHRONO_MAX = CHRONO_N * 2 - 1; // 5 мест и 4 пары соседей
const LAUNCH = Date.UTC(2026, 10, 26); // «Хронология» №1
const SPAN = 10; // от самого старого до самого нового — не меньше 10 лет
const PER_KIND = 2; // одного вида (игры, фильмы, сериалы, аниме) — не больше двух
const START_MAX = 4; // перемешанный порядок, который видит игрок, набирает не больше 4 из 9
const HISTORY = 7; // прошлые дни под итогом

// повторяемый случай по строке (как в guess.js): весь день один и тот же набор
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const parse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };

// номер дня: 26 ноября 2026 — №1
export const numberOf = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - LAUNCH) / 864e5) + 1;
};
// карточки набора с годами — так набор и запоминается в chrono_days (правка POOL потом записанное не меняет)
export const setOf = (ids) => ids.map((i) => { const r = POOL[i]; return { id: i, a: r.a, en: r.en && r.en !== r.a ? r.en : '', t: r.t, y: r.y }; });
// счёт: set — карточки с годами, pick — id в том порядке, как расставил игрок
export function scoreOf(set, pick) {
  const year = new Map(set.map((x) => [x.id, x.y]));
  const right = set.slice().sort((a, b) => a.y - b.y).map((x) => x.id);
  const ok = pick.map((id, k) => id === right[k]);
  let pairs = 0;
  for (let k = 0; k + 1 < pick.length; k++) if (year.get(pick[k]) < year.get(pick[k + 1])) pairs++;
  const pos = ok.filter(Boolean).length;
  return { order: pick.slice(), right, years: Object.fromEntries(set.map((x) => [x.id, x.y])), ok, pos, pairs, score: pos + pairs, max: CHRONO_MAX, perfect: pos === set.length };
}

// набор дня: индексы POOL в том порядке, в котором карточки видит игрок (перемешаны, далеко не по годам).
// Карточки двух прошлых дней не повторяются: дни считаются цепочкой (каждый — по своему зерну) внутри блока из BLOCK дней
// от №1, так что считать приходится не больше BLOCK дней, а не всё время с запуска. На прошлый блок первые дни не смотрят.
// Посчитанное запоминается в этом Worker'е: обычно это один шаг от вчера
const BLOCK = 28;
const chain = new Map();
export function chronoOf(day) {
  const n = numberOf(day);
  if (n < 1) return { n, ids: pickFor(day, new Set()) };
  if (!chain.has(day)) {
    let prev = [], prev2 = [];
    for (let d = shiftDay(day, -((n - 1) % BLOCK)); d <= day; d = shiftDay(d, 1)) {
      let ids = chain.get(d);
      if (!ids) { ids = pickFor(d, new Set([...prev, ...prev2])); chain.set(d, ids); }
      prev2 = prev; prev = ids;
    }
    while (chain.size > 150) chain.delete(chain.keys().next().value); // самые старые; понадобятся — посчитаются так же
  }
  return { n, ids: chain.get(day).slice() };
}
function pickFor(day, avoid) {
  const rnd = rng('chrono:' + day);
  const skip = POOL.indexOf(riddleOf(day).r);
  const all = POOL.map((_, i) => i).filter((i) => i !== skip && !avoid.has(i) && Number.isInteger(POOL[i].y));
  const take = (strict) => {
    const got = [], years = new Set(), kinds = {};
    for (const i of shuffle(all.slice(), rnd)) {
      const r = POOL[i];
      if (years.has(r.y) || (strict && (kinds[r.t] || 0) >= PER_KIND)) continue;
      got.push(i); years.add(r.y); kinds[r.t] = (kinds[r.t] || 0) + 1;
      if (got.length === CHRONO_N) break;
    }
    return got;
  };
  let pick = null;
  for (let t = 0; t < 60 && !pick; t++) {
    const got = take(true), ys = got.map((i) => POOL[i].y);
    if (got.length === CHRONO_N && Math.max(...ys) - Math.min(...ys) >= SPAN) pick = got;
  }
  if (!pick) pick = take(false); // запасной путь (на нынешнем списке не нужен): просто разные годы
  const set = setOf(pick);
  let order = pick.slice();
  for (let t = 0; t < 40; t++) { order = shuffle(pick.slice(), rnd); if (scoreOf(set, order).score <= START_MAX) break; }
  return order;
}

// полночь по Киеву, когда начнётся следующий день (зимой UTC+2, летом UTC+3)
export function nextDayAt(now) {
  const day = dayKey(now, CHRONO_TZ), next = shiftDay(day, 1), utc = Date.parse(next + 'T00:00:00Z');
  for (const h of [2, 3, 1, 4]) { const t = utc - h * 3600e3; if (dayKey(t, CHRONO_TZ) === next && dayKey(t - 1, CHRONO_TZ) === day) return t; }
  return utc - 2 * 3600e3;
}

// ---------- обложки: подсказки IMDb (фильмы, сериалы, аниме и игры), по названию, виду и году ----------
const IMDB_KINDS = { game: ['videoGame'], movie: ['movie', 'tvMovie', 'video'], series: ['tvSeries', 'tvMiniSeries'], anime: ['tvSeries', 'tvMiniSeries', 'movie', 'tvMovie', 'video'] };
// у этих в POOL нет английского названия: как они называются на IMDb
const COVER_Q = { 'Брат': 'Brother', 'Иван Васильевич меняет профессию': 'Ivan Vasilyevich Changes His Profession' };
const IMDB_IMG = /^https:\/\/m\.media-amazon\.com\/images\/[A-Z]\/[\w@%.,+-]+\._V1_[^/]*\.jpg$/;
const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8' }; // «Red Dead Redemption II» = «… 2»
const latinKey = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\b(viii|vii|vi|iv|v|iii|ii)\b/g, (m) => ROMAN[m]).replace(/[^a-z0-9]+/g, '');
export const coverQuery = (x) => { const q = COVER_Q[x.a] || x.en || x.a; return /[а-яёіїєґ]/i.test(q) ? '' : q; };
// из подсказок IMDb: того же вида и года (на год-два раньше или позже — только при том же названии: у Minecraft там 2009),
// название совпало или одно начинается с другого («Dune» — «Dune: Part One»). Нет такой — без обложки: чужая картинка
// (Doom 1993 года у Doom 2016-го) запутала бы игрока
export function coverPick(x, list) {
  const want = latinKey(coverQuery(x)), kinds = IMDB_KINDS[x.t] || [];
  let best = null, bestScore = 0;
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || !kinds.includes(c.qid) || !c.i || !IMDB_IMG.test(String(c.i.imageUrl || ''))) continue;
    const name = latinKey(c.l), same = !!want && name === want;
    const near = same || (!!want && !!name && (name.startsWith(want) || want.startsWith(name)));
    const dy = Math.abs(+c.y - x.y);
    if (!near || !(dy === 0 || (dy <= 2 && same))) continue;
    const score = (same ? 2 : 1) + (dy === 0 ? 2 : 0);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best ? best.i.imageUrl.replace(/\._V1_[^/]*\.jpg$/, '._V1_QL75_UX160_.jpg') : '';
}
// сначала «название год» (так IMDb сразу отдаёт нужный год: «doom 2016» — игра, а не фильм 2005-го), не нашлось — просто название
async function coverOf(x, get) {
  const t = coverQuery(x);
  if (!t || !get) return '';
  for (const q of [`${t} ${x.y}`, t]) {
    const d = await get(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q.toLowerCase())}.json`, null, 604800);
    const u = coverPick(x, d && d.d);
    if (u) return u;
  }
  return '';
}
const coverMemo = new Map(); // «день:набор» → обложки (в этом Worker'е, пока он жив)
async function coversOf(day, ids, get) {
  const key = day + ':' + ids.join('-');
  if (coverMemo.has(key)) return coverMemo.get(key);
  const store = typeof caches !== 'undefined' && caches && caches.default ? caches.default : null;
  const req = store ? new Request('https://chrono-cache.casualhub/covers/v1/' + key) : null;
  if (store) { try { const hit = await store.match(req); if (hit) { const v = await hit.json(); coverMemo.set(key, v); return v; } } catch (e) {} }
  let failed = 0;
  // до двух запросов наружу на карточку (каждый ещё читает и пишет кэш): не больше 30 из 50 на запрос
  const urls = await Promise.all(setOf(ids).map((x) => coverOf(x, get).catch(() => { failed++; return ''; })));
  const out = {};
  ids.forEach((id, k) => { if (urls[k]) out[id] = urls[k]; });
  // IMDb ответил на всё — запоминаем на двое суток; не ответил — спросим ещё раз в следующий раз
  if (!failed) {
    coverMemo.set(key, out);
    if (coverMemo.size > 6) coverMemo.delete(coverMemo.keys().next().value);
    if (store) { try { await store.put(req, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=172800' } })); } catch (e) {} }
  }
  return out;
}

// ---------- база ----------
const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
async function ensure(env) {
  if (ready.has(env.DB)) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS chrono_days (user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, items TEXT NOT NULL, pick TEXT NOT NULL, score INTEGER NOT NULL, perfect INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (user_id, day))').run();
  ready.add(env.DB);
}
const itemView = (x) => ({ id: x.id, title: x.a, en: x.en || '', type: x.t }); // без года
const okSet = (set) => Array.isArray(set) && set.length === CHRONO_N && set.every((x) => x && Number.isInteger(x.id) && Number.isInteger(x.y));
const okPick = (pick, ids) => Array.isArray(pick) && pick.length === ids.length && new Set(pick).size === ids.length && pick.every((id) => ids.includes(id));

// что видит страница: набор дня без годов; если сегодня уже отвечал — итог с годами, серия и прошлые дни
async function stateOf(env, me, now) {
  const day = dayKey(now, CHRONO_TZ);
  const { n, ids } = chronoOf(day);
  const st = { day, n, max: CHRONO_MAX, size: CHRONO_N, now, next: nextDayAt(now), signed: !!me, items: setOf(ids).map(itemView), result: null, streak: 0, history: [] };
  if (!me) return st;
  await ensure(env);
  const { results } = await env.DB.prepare('SELECT day, n, items, pick, score, perfect FROM chrono_days WHERE user_id = ? ORDER BY day DESC LIMIT 60').bind(me.id).all();
  const rows = results || [];
  const cur = rows.find((r) => r.day === day);
  if (cur) {
    const set = parse(cur.items, null), pick = parse(cur.pick, null);
    if (okSet(set) && okPick(pick, set.map((x) => x.id))) { st.items = set.map(itemView); st.result = scoreOf(set, pick); }
  }
  st.streak = streakOf(rows.map((r) => r.day), day);
  st.history = rows.filter((r) => r.day < day).slice(0, HISTORY).map((r) => ({ day: r.day, n: +r.n || 0, score: +r.score || 0, perfect: !!r.perfect }));
  return st;
}

// адреса без обязательного входа (API добавляет их в PUBLIC): гость играет, но ничего не записывается
export const CHRONO_PUBLIC = ['GET /games/chrono', 'POST /games/chrono', 'GET /games/chrono/covers'];
export function makeChronoRoutes(h) {
  const { json, fail } = h;
  const userOf = async (env, request) => {
    let me = null;
    try { me = h.currentUser ? await h.currentUser(env, request) : null; } catch (e) {}
    return me && !me.banned ? me : null;
  };
  return {
    // набор дня (без годов), а у вошедшего — ещё его итог за сегодня, серия и прошлые дни
    async 'GET /games/chrono'({ env, request }) { return json(await stateOf(env, await userOf(env, request), Date.now())); },
    // { order: [id × 5], day } — ответ. Вошедший — один раз в день (повторный получает записанный итог, again: true), опыт;
    // гость — только счёт и верный порядок с годами, без записи
    async 'POST /games/chrono'({ env, request }) {
      const me = await userOf(env, request);
      const who = me ? me.id : 'ip:' + (h.clientIp ? h.clientIp(request) : '');
      if (h.burst && h.burst('chrono:' + who, 12, 60e3)) return fail(429, 'Слишком часто. Подожди немного.');
      const b = await h.readBody(request);
      const now = Date.now(), day = dayKey(now, CHRONO_TZ);
      if (b && typeof b.day === 'string' && b.day && b.day !== day) return fail(409, 'Наступил новый день: обнови страницу, там новая «Хронология».');
      const { n, ids } = chronoOf(day);
      const pick = Array.isArray(b && b.order) ? b.order.slice(0, 20).map(Number) : [];
      if (!okPick(pick, ids)) return fail(400, 'Нужен порядок всех пяти карточек. Обнови страницу и попробуй ещё раз.');
      const set = setOf(ids), res = scoreOf(set, pick);
      if (!me) return json({ ...(await stateOf(env, null, now)), result: res, saved: false });
      await ensure(env);
      const w = await env.DB.prepare('INSERT OR IGNORE INTO chrono_days (user_id, day, n, items, pick, score, perfect, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(me.id, day, n, JSON.stringify(set), JSON.stringify(pick), res.score, res.perfect ? 1 : 0, now).run();
      const fresh = !!(w.meta && w.meta.changes);
      if (fresh && h.lvGive) {
        try { await h.lvGive(env, request, me, me.id, [{ kind: 'chrono', ref: day }, ...(res.perfect ? [{ kind: 'chrono_perfect', ref: day }] : [])]); }
        catch (e) { console.error('chrono xp', e && e.message); }
      }
      return json({ ...(await stateOf(env, me, now)), saved: true, again: !fresh });
    },
    // обложки набора дня: { covers: { id: картинка } } — у кого не нашлась, того нет
    async 'GET /games/chrono/covers'() {
      const day = dayKey(Date.now(), CHRONO_TZ);
      const { ids } = chronoOf(day);
      let covers = {};
      try { covers = await coversOf(day, ids, h.cachedJson); } catch (e) {}
      return json({ day, covers });
    },
  };
}
