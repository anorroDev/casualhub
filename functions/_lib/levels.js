// Казуал Хаб: уровни, опыт, достижения, серии и задания. Задумка — docs/levels/design.txt, порядок работы — steps.txt.
// Всё, что решает про опыт, лежит здесь; API и комнаты зовут award() / awardMany() / revoke() и сами ничего не считают.
// Папка _lib не становится адресом сайта.
//
// Флаг LEVELS (wrangler.toml): "0" — выключено, ничего не пишется и таблицы не создаются (как будто уровней нет);
// "admins" — опыт копится у всех, видят только админы; "1" — для всех.
//
// Журнал xp_log: одна строка на действие, уникальна по (user_id, kind, ref) — за одно и то же опыт дважды не дают,
// даже если действие удалили и сделали снова. Удаление не стирает строку, а ставит gone = 1: опыт за неё уходит,
// а место в дневном лимите остаётся занятым (иначе «удалил — добавил» обходило бы лимит).
// Итог в user_level.xp всегда пересчитывается суммой по журналу, поэтому не разъедется с ним. Уровень не падает.
// Достижения и задания считаются по тому же журналу (сколько строк каждого вида), отдельных счётчиков нет.
//
// Запросов к базе на одно начисление — постоянное число, сколько бы действий ни пришло разом (импорт сотен оценок):
// чтение одной пачкой, запись одной пачкой, проверка наград одной пачкой.

// ---------- уровень ----------
export const LEVEL_BASE = 120; // опыта с 1-го уровня на 2-й
export const LEVEL_STEP = 30; // и на столько больше за каждый следующий
export const needFor = (level) => LEVEL_BASE + LEVEL_STEP * (Math.max(1, level) - 1);
export const totalFor = (n) => (n <= 1 ? 0 : LEVEL_BASE * (n - 1) + (LEVEL_STEP / 2) * (n - 1) * (n - 2));
export function levelOf(xp) {
  xp = Math.max(0, Math.floor(+xp || 0));
  let level = 1;
  while (totalFor(level + 1) <= xp) level++;
  return { level, into: xp - totalFor(level), need: needFor(level) };
}

// ---------- звания по уровню (прежние) ----------
// Больше нигде не показываются: звание теперь сезонное (ниже). Оставлены для старых тестов и записей.
export const RANKS = [
  { from: 1, fun: 'Людишка', plain: 'Новичок' },
  { from: 5, fun: 'Казуал', plain: 'Зритель' },
  { from: 10, fun: 'Диванный критик', plain: 'Казуал' },
  { from: 15, fun: 'Профессиональный нытик', plain: 'Ценитель' },
  { from: 20, fun: 'Чемпион', plain: 'Критик' },
  { from: 30, fun: 'Рецензент от бога', plain: 'Эксперт' },
  { from: 40, fun: 'Хранитель вкуса', plain: 'Мастер вкуса' },
  { from: 50, fun: 'Легенда', plain: 'Легенда' },
];
export const rankOf = (level) => RANKS.reduce((r, x) => (level >= x.from ? x : r), RANKS[0]);

// ---------- сезоны: звание за три месяца, как на Faceit ----------
// Уровень и опыт за всё время не сбрасываются: уровни открывают оформление, его не отнимают. Звание — сезонное:
// по опыту, набранному с начала сезона (строки xp_log с at в сезоне и gone = 0). Сезон по умолчанию — три месяца
// (SEASON_MONTHS), сброс 1-го числа в 00:00 по Киеву; когда сбросить, может назначить админ. При сбросе итоги каждого
// (опыт, звание, место) уходят в season_results, и все снова «Людишка».
// Пороги — по модели живых действий с нынешними RULES, заданиями и сериями, за сезон: заходит 8 дней в месяц по оценке —
// ~480 опыта (Казуал); обычный (18 дней в месяц, 2 оценки, иногда отзыв, пара реакций) — ~4 200, к концу сезона «Хранитель
// вкуса»; активный (каждый день, 4 оценки, отзыв, 5 реакций, тир-лист в неделю) — ~16 000, «Величайший» месяца за два
// с половиной; всё до дневных лимитов каждый день — ~33 000, «Величайший» за месяц.
// id — имена значков званий (art/), не менять.
export const SEASON_MONTHS = 3;
export const SEASON_RANKS = [
  { id: 'people', title: 'Людишка', xp: 0 },
  { id: 'casual', title: 'Казуал', xp: 300 },
  { id: 'couch', title: 'Диванный критик', xp: 500 },
  { id: 'whiner', title: 'Профессиональный нытик', xp: 900 },
  { id: 'champion', title: 'Чемпион', xp: 1500 },
  { id: 'godlike', title: 'Рецензент от бога', xp: 2500 },
  { id: 'taste', title: 'Хранитель вкуса', xp: 4000 },
  { id: 'legend', title: 'Легенда', xp: 7000 },
  { id: 'greatest', title: 'Величайший', xp: 12000 },
];
export const seasonRankOf = (xp) => SEASON_RANKS.reduce((r, x) => ((+xp || 0) >= x.xp ? x : r), SEASON_RANKS[0]);
// следующее звание (null — уже самое высокое)
export const nextSeasonRank = (xp) => SEASON_RANKS.find((x) => x.xp > (+xp || 0)) || null;
// поля звания для ответов API: название и id значка
export const rankFields = (xp) => { const r = seasonRankOf(xp); return { rank: r.title, rankId: r.id }; };
const KYIV = 'Europe/Kiev'; // Киев, с летним временем (это имя есть и в старых ICU)
let kyivFmt = null;
// сдвиг Киева от UTC в момент t, мс; без Intl — по правилу ЕС (лето — с апреля по октябрь)
function kyivOffset(t) {
  try {
    kyivFmt = kyivFmt || new Intl.DateTimeFormat('en-US', { timeZone: KYIV, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const p = {};
    for (const x of kyivFmt.formatToParts(new Date(t))) p[x.type] = +x.value;
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60000) * 60000;
  } catch (e) {
    const m = new Date(t).getUTCMonth();
    return (m >= 3 && m <= 9 ? 3 : 2) * 3600e3;
  }
}
// 00:00 по Киеву числа y-m-d (m с нуля; 12 и больше — следующий год)
export function kyivMidnight(y, m, d) { const u = Date.UTC(y, m, d); return u - kyivOffset(u - 2 * 3600e3); }
// начало месяца (1-е число, 00:00 по Киеву), в котором момент t
export function monthStartKyiv(t) { const d = new Date(t + kyivOffset(t)); return kyivMidnight(d.getUTCFullYear(), d.getUTCMonth(), 1); }
// конец сезона по умолчанию: 1-е число через три месяца от месяца начала, 00:00 по Киеву (1 ноября → 1 февраля).
// Сезон, начатый посреди месяца, чуть короче, но не меньше двух месяцев
export function defaultSeasonEnd(start) {
  const d = new Date(start + kyivOffset(start));
  return kyivMidnight(d.getUTCFullYear(), d.getUTCMonth() + SEASON_MONTHS, 1);
}
// «1 декабря в 00:00 по Киеву» — для писем и объявления
export function fmtKyiv(t) {
  try {
    const p = new Intl.DateTimeFormat('ru-RU', { timeZone: KYIV, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
    const g = (k) => (p.find((x) => x.type === k) || {}).value || '';
    return `${g('day')} ${g('month')} в ${g('hour')}:${g('minute')} по Киеву`;
  } catch (e) {
    return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
}

// ---------- за что сколько опыта ----------
// xp — опыт; day — сколько раз в день полным опытом; tail — после дневного лимита ещё столько раз по tail.xp;
// pair — сколько раз в день с одним и тем же человеком (peer); ever — сколько раз за всё время;
// given — опыт передаёт тот, кто начисляет (серии, первые шаги, задания, опыт за прошлое).
// Действие сверх лимитов всё равно пишется в журнал с 0 опыта: так оно не даст опыта и потом, при повторе.
export const RULES = {
  rate: { xp: 10, day: 8, tail: { xp: 2, day: 20 } }, // новая оценка с баллами
  review: { xp: 5, day: 5 }, // отзыв от 100 символов
  rate_full: { xp: 3, day: 8 }, // оценка заполнена целиком: баллы по 2+ критериям и обложка
  plan_done: { xp: 5, day: 5 }, // оценил то, что было «В планах»
  import: { xp: 1, ever: 100 }, // оценка из импорта (Letterboxd)
  tier: { xp: 25, day: 2 }, // новый тир-лист от 8 элементов
  tier_share: { xp: 5, day: 1 }, // поделился тир-листом
  react: { xp: 3, day: 10, pair: 3 }, // реакция на оценку или тир-лист друга
  comment: { xp: 6, day: 6, pair: 2 }, // комментарий или запись на стене
  got_react: { xp: 3, day: 30, pair: 5 }, // твою оценку отметили реакцией
  got_comment: { xp: 4, day: 20 }, // тебе написали комментарий
  friend: { xp: 15, day: 3 }, // новый друг
  lots_host: { xp: 30, day: 1 }, // провёл сбор лотов до победителя (от 3 участников)
  lot_add: { xp: 5, day: 3 }, // добавил лот в чужой сбор
  lot_win: { xp: 15 }, // твой лот победил
  visit: { xp: 5, day: 1 }, // зашёл на сайт сегодня
  invite: { xp: 100 }, // друг пришёл по ссылке и дошёл до 3-го уровня (обоим)
  quest: { xp: 15 }, // задание дня
  quest_all: { xp: 20 }, // все три задания дня
  quest_week: { xp: 100 }, // задание недели
  streak: { given: true }, // серия 7 / 30 / 100 дней
  first: { given: true }, // первые шаги
  past: { given: true }, // опыт за прошлое одной строкой (если понадобится)
  gift: { given: true }, // подарок из почты (опыт, который прислала администрация)
};
// что считается «сделал что-то за день» для серии: всё, кроме простого захода и наград
const ACTIVE = new Set(['rate', 'review', 'rate_full', 'plan_done', 'import', 'tier', 'tier_share', 'react', 'comment', 'friend', 'lots_host', 'lot_add']);
export const STREAK_BONUS = { 7: 30, 30: 150, 100: 500 };

// ---------- достижения ----------
// metric — вид в журнале (сколько действий), список видов или особая мерка; tiers — пороги бронзы, серебра, золота
// (одна цифра — одна ступень). hidden — до получения видно «???». special — выдаётся отдельно.
export const ACHIEVEMENTS = [
  { code: 'founder', title: 'Основатель хаба', desc: 'Был на сайте до запуска уровней', special: true },
  { code: 'first10', title: 'Первая десятка', desc: 'Один из первых 10 аккаунтов на сайте. Награда — котик Васян', special: true },
  { code: 'first_steps', title: 'Первые шаги', desc: 'Прошёл все первые шаги', special: true },
  { code: 'critic', title: 'Критик', desc: 'Оценки', metric: ['rate', 'import'], tiers: [10, 100, 500] },
  { code: 'reviewer', title: 'Рецензент', desc: 'Отзывы от 100 символов', metric: 'review', tiers: [5, 25, 100] },
  { code: 'omnivore', title: 'Всеядный', desc: 'Оценки в разных категориях', metric: '@cats', tiers: [3, 5, 8] },
  { code: 'finisher', title: 'Довёл до конца', desc: 'Оценил то, что было «В планах»', metric: 'plan_done', tiers: [5, 25, 100] },
  { code: 'moved', title: 'Переезд', desc: 'Перенёс оценки из Letterboxd', metric: 'import', tiers: [1] },
  { code: 'tiermaker', title: 'Тир-лист-мейкер', desc: 'Тир-листы', metric: 'tier', tiers: [1, 10, 30] },
  { code: 'masterpiece', title: 'Хит тир-листов', desc: 'Тир-лист собрал 10 реакций', metric: '@tierReacts', tiers: [10] },
  { code: 'soul', title: 'Душа компании', desc: 'Друзья', metric: 'friend', tiers: [3, 10, 25] },
  { code: 'chatter', title: 'Болтун', desc: 'Комментарии', metric: 'comment', tiers: [10, 100, 500] },
  { code: 'fan', title: 'Ценитель чужого', desc: 'Реакции друзьям', metric: 'react', tiers: [25, 250, 1000] },
  { code: 'popular', title: 'Популярный', desc: 'Реакции на твои оценки', metric: 'got_react', tiers: [25, 250, 1000] },
  { code: 'recruiter', title: 'Вербовщик', desc: 'Друзья, пришедшие по твоей ссылке', metric: 'invite', tiers: [1, 3, 10] },
  { code: 'auctioneer', title: 'Аукционист', desc: 'Сборы лотов до победителя', metric: 'lots_host', tiers: [1, 10, 50] },
  { code: 'lucky', title: 'Счастливчик', desc: 'Твой лот победил', metric: 'lot_win', tiers: [1, 5, 20] },
  { code: 'rhythm', title: 'В ритме', desc: 'Серия дней подряд', metric: '@streak', tiers: [7, 30, 100] },
  { code: 'questor', title: 'Исполнительный', desc: 'Все задания дня', metric: 'quest_all', tiers: [5, 30, 100] },
  { code: 'night', title: 'Ночной критик', desc: 'Оценка между 2 и 5 часами ночи', metric: '@night', tiers: [1], hidden: true },
  { code: 'strict', title: 'Строгий судья', desc: '10 оценок на 2 балла и ниже', metric: '@strict', tiers: [10], hidden: true },
  { code: 'nope', title: 'Не согласен', desc: '20 раз поставил «не согласен»', metric: '@nope', tiers: [20], hidden: true },
  { code: 'comeback', title: 'Вернулся', desc: 'Зашёл после перерыва в 30 дней', metric: '@comeback', tiers: [1], hidden: true },
  { code: 'event', title: 'Участник события', desc: 'Сделал что-нибудь в тематическую неделю', metric: '@event', tiers: [1, 3, 10] },
  { code: 'recap2026', title: 'Итоги 2026', desc: 'Посмотрел свои итоги 2026 года', special: true },
];
const ACH = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));
export const TIER_NAMES = ['', 'бронза', 'серебро', 'золото'];
// какая ступень достигнута при значении v (0 — никакая)
export const tierFor = (a, v) => (a.tiers || []).reduce((t, need, i) => (v >= need ? i + 1 : t), 0);

// ---------- задания ----------
// kinds — какие строки журнала засчитываются; goal — сколько; need — когда задание можно выдать
export const DAILY = [
  { code: 'rate2', title: 'Поставь 2 оценки', kinds: ['rate', 'import'], goal: 2 },
  { code: 'review1', title: 'Напиши отзыв от 100 символов', kinds: ['review'], goal: 1 },
  { code: 'full1', title: 'Заполни оценку целиком: все критерии и обложка', kinds: ['rate_full'], goal: 1 },
  { code: 'react3', title: 'Отреагируй на 3 оценки друзей', kinds: ['react'], goal: 3, need: 'friends' },
  { code: 'comment1', title: 'Прокомментируй оценку друга', kinds: ['comment'], goal: 1, need: 'friends' },
  { code: 'plan1', title: 'Оцени что-нибудь из «В планах»', kinds: ['plan_done'], goal: 1, need: 'plans' },
];
export const WEEKLY = [
  { code: 'tier1', title: 'Собери тир-лист', kinds: ['tier'], goal: 1 },
  { code: 'rate10', title: '10 оценок за неделю', kinds: ['rate', 'import'], goal: 10 },
  { code: 'social10', title: '10 реакций и комментариев друзьям', kinds: ['react', 'comment'], goal: 10, need: 'friends' },
  { code: 'host1', title: 'Проведи сбор лотов с друзьями', kinds: ['lots_host'], goal: 1, need: 'friends' },
];
// первые шаги: kind — что засчитывается (строка журнала), check — особая проверка
export const FIRST_STEPS = [
  { code: 'avatar', title: 'Поставь аватар', xp: 20, check: 'avatar' },
  { code: 'rate', title: 'Первая оценка', xp: 20, kinds: ['rate', 'import'] },
  { code: 'friend', title: 'Первый друг', xp: 30, kinds: ['friend'] },
  { code: 'react', title: 'Первая реакция другу', xp: 20, kinds: ['react'] },
  { code: 'tier', title: 'Первый тир-лист', xp: 40, kinds: ['tier'] },
  { code: 'email', title: 'Подтверди почту', xp: 20, check: 'email' },
];

// ---------- награды за уровни (только внешний вид) ----------
// id рамок frame1–frame4 и фонов — прежние: их уже выбирали; новые добавлены рядом
export const REWARDS = [
  { level: 2, kind: 'badge', id: 'badge', title: 'Кружок уровня у аватара' },
  { level: 3, kind: 'frame', id: 'frame1', title: 'Рамка «Казуал»' },
  { level: 5, kind: 'frame', id: 'frame5', title: 'Рамка «Пиксель»' },
  { level: 7, kind: 'chip', id: 'rankchip', title: 'Звание рядом с ником в профиле' },
  { level: 10, kind: 'color', id: 'colors', title: 'Цвет ника на выбор' },
  { level: 12, kind: 'frame', id: 'frame2', title: 'Рамка «Неон»' },
  { level: 15, kind: 'bg', id: 'bgs', title: 'Пиксельный фон профиля на выбор' },
  { level: 18, kind: 'nick', id: 'shadow', title: 'Ник с пиксельной тенью' },
  { level: 20, kind: 'frame', id: 'frame3', title: 'Рамка «Переливы»' },
  { level: 22, kind: 'fx', id: 'stars', title: 'Звездопад в шапке профиля' },
  { level: 25, kind: 'pet', id: 'pet', title: 'Котик Васян живёт у тебя в профиле' },
  { level: 30, kind: 'color', id: 'gold', title: '«Золотой» ник' },
  { level: 35, kind: 'nick', id: 'rainbow', title: 'Радужный ник' },
  { level: 40, kind: 'frame', id: 'frame4', title: 'Рамка «Мастер» с короной' },
  { level: 45, kind: 'fx', id: 'confetti', title: 'Конфетти, когда открывают твой профиль' },
  { level: 50, kind: 'frame', id: 'frame6', title: 'Рамка и фон «Легенда»' },
];
export const NAME_COLORS = { blue: '#5B74FF', pink: '#E85FA5', green: '#2EAD60', orange: '#F08A24', violet: '#9B6BFF', teal: '#14A3A8', gold: '#E2A925' };
export const PROFILE_BGS = { dawn: 1, night: 1, city: 1, forest: 1, ember: 1, legend: 1 };
const FRAMES = ['frame1', 'frame5', 'frame2', 'frame3', 'frame4', 'frame6']; // по уровню
const NICKS = ['shadow', 'rainbow'];
const FXS = ['stars', 'confetti'];
// что из оформления доступно на уровне; all — админу открыто всё (проверять награды до выхода)
export function unlockedAt(level, all = false) {
  const got = new Set(REWARDS.filter((r) => all || level >= r.level).map((r) => r.id));
  return {
    frames: FRAMES.filter((f) => got.has(f)),
    colors: got.has('colors') ? Object.keys(NAME_COLORS).filter((c) => c !== 'gold' || got.has('gold')) : [],
    bgs: got.has('bgs') ? Object.keys(PROFILE_BGS).filter((b) => b !== 'legend' || got.has('frame6')) : [],
    nicks: NICKS.filter((n) => got.has(n)),
    fx: FXS.filter((f) => got.has(f)),
    pet: got.has('pet'),
    rankChip: got.has('rankchip'),
    badge: got.has('badge'),
  };
}

// ---------- флаг ----------
export const levelsMode = (env) => {
  const v = String((env && env.LEVELS) || '0').trim().toLowerCase();
  return v === '1' || v === 'on' ? 'all' : v === 'admins' ? 'admins' : 'off';
};
export const levelsOn = (env) => levelsMode(env) !== 'off';

// ---------- день и неделя человека ----------
export function dayKey(now, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  } catch (e) {
    return new Date(now).toISOString().slice(0, 10);
  }
}
// день со сдвигом: '2026-11-11' и -1 → '2026-11-10'
export const shiftDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// понедельник недели этого дня
export const weekStart = (day) => { const d = new Date(day + 'T00:00:00Z'); return shiftDay(day, -((d.getUTCDay() + 6) % 7)); };
export const cleanTz = (tz) => {
  const t = String(tz || '').slice(0, 64);
  if (!t) return '';
  try { new Intl.DateTimeFormat('en-CA', { timeZone: t }); return t; } catch (e) { return ''; }
};
const hourIn = (now, tz) => { try { return +new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)); } catch (e) { return new Date(now).getUTCHours(); } };
// детерминированный «случай» для выбора заданий: у человека в этот день всегда те же задания
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
}

// ---------- таблицы ----------
const ready = new WeakSet(); // по базе: в тестах их несколько, в Worker'е одна
export async function ensureLevels(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS xp_log (user_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, xp INTEGER NOT NULL, day TEXT NOT NULL, peer TEXT, at INTEGER NOT NULL, gone INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, kind, ref))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS xp_log_day ON xp_log(user_id, day, kind)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS xp_log_at ON xp_log(user_id, at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS xp_log_daykind ON xp_log(day, user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS user_level (user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, tz TEXT, updated_at INTEGER NOT NULL, '
      + 'streak INTEGER NOT NULL DEFAULT 0, streak_day TEXT, best_streak INTEGER NOT NULL DEFAULT 0, freezes INTEGER NOT NULL DEFAULT 1, freeze_week TEXT, '
      + 'quest_day TEXT, quests TEXT, quest_week TEXT, wquest TEXT, news TEXT, prefs TEXT, metrics TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS achievements (user_id TEXT NOT NULL, code TEXT NOT NULL, tier INTEGER NOT NULL DEFAULT 1, at INTEGER NOT NULL, PRIMARY KEY (user_id, code))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS achievements_code ON achievements(code, tier)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS invited (user_id TEXT PRIMARY KEY, by_id TEXT NOT NULL, at INTEGER NOT NULL, rewarded INTEGER NOT NULL DEFAULT 0)'),
    // почта: письма всем (to_id пустой) или одному человеку; в gift_box — прочитано ли и забран ли подарок
    env.DB.prepare('CREATE TABLE IF NOT EXISTS gifts (id TEXT PRIMARY KEY, to_id TEXT, kind TEXT NOT NULL DEFAULT \'gift\', title TEXT NOT NULL, body TEXT, xp INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, until INTEGER, by_id TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS gifts_to ON gifts(to_id, at)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS gift_box (gift_id TEXT NOT NULL, user_id TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, claimed INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (gift_id, user_id))'),
    // сезоны: открыт тот, у которого closed_at пустой (всегда один); end_at — когда сбросить (назначает админ)
    env.DB.prepare('CREATE TABLE IF NOT EXISTS seasons (n INTEGER PRIMARY KEY, title TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER, closed_at INTEGER, closed_by TEXT, planned_by TEXT, planned_at INTEGER)'),
    // итоги закрытого сезона: опыт за сезон, звание (id из SEASON_RANKS) и место среди всех
    env.DB.prepare('CREATE TABLE IF NOT EXISTS season_results (season INTEGER NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL, rank TEXT NOT NULL, place INTEGER NOT NULL, PRIMARY KEY (season, user_id))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS season_results_user ON season_results(user_id, season)'),
  ]);
  ready.add(env.DB);
}

// ---------- сезон ----------
// Текущий сезон живёт в памяти Worker'а 30 секунд; срок сверяется при каждом обращении, поэтому сброс случается
// с первым запросом после назначенного времени (начисление, заход, окно «Прогресс»), а ночной cron в rt —
// подстраховка, если никто не заходил. Закрывает сезон ровно один запрос: см. closeSeason.
let seasonCache = { at: 0, v: null, db: null };
export const forgetSeason = () => { seasonCache = { at: 0, v: null, db: null }; };
const rowSeason = (r) => ({ n: +r.n, title: r.title, start: +r.start_at, end: r.end_at == null ? null : +r.end_at });
const OPEN_SQL = 'SELECT n, title, start_at, end_at, planned_by FROM seasons WHERE closed_at IS NULL ORDER BY n DESC LIMIT 1';
// кому сообщить о закрытии сезона (API и комната лотов — всем открытым вкладкам: «загляни за новостями»)
const seasonHooks = [];
export const onSeasonClose = (fn) => { if (!seasonHooks.includes(fn)) seasonHooks.push(fn); };
// текущий сезон { n, title, start, end }; null — уровни выключены
export async function currentSeason(env, now = Date.now()) {
  if (!levelsOn(env)) return null;
  const c = seasonCache;
  let s = c.db === env.DB && c.at > now - 30e3 && c.at <= now ? c.v : null;
  if (!s) {
    await ensureLevels(env);
    const r = await env.DB.prepare(OPEN_SQL).first();
    if (r) await toKyivEnd(env, r);
    s = r ? rowSeason(r) : await openSeason(env, now);
    seasonCache = { at: now, v: s, db: env.DB };
  }
  if (s && s.end != null && now >= s.end) {
    s = await closeSeason(env, s, now);
    seasonCache = { at: now, v: s, db: env.DB };
  }
  return s;
}
// конец «по умолчанию» раньше считался по Москве (1-е число, 00:00 МСК): такой конец переносится на 00:00 по Киеву.
// Конец, который назначил админ (planned_by), не трогается. Срабатывает один раз: киевский конец уже не 00:00 МСК (а летом совпадает)
async function toKyivEnd(env, r) {
  if (r.planned_by != null || r.end_at == null) return;
  const t = +r.end_at, d = new Date(t + 3 * 3600e3);
  if (d.getUTCDate() !== 1 || d.getUTCHours() !== 0 || t % 60000) return;
  const fix = kyivMidnight(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (fix === t) return;
  await env.DB.prepare('UPDATE seasons SET end_at = ? WHERE n = ? AND planned_by IS NULL AND end_at = ?').bind(fix, r.n, t).run();
  r.end_at = fix;
}
// открытого сезона нет: первый — с начала этого месяца (опыт, набранный в нём до запуска сезонов, засчитывается),
// а если прошлый почему-то закрыт без следующего — следующий с его конца
async function openSeason(env, now) {
  const last = await env.DB.prepare('SELECT n, end_at, closed_at FROM seasons ORDER BY n DESC LIMIT 1').first();
  const n = last ? +last.n + 1 : 1;
  const start = last ? +last.end_at || +last.closed_at || now : monthStartKyiv(now);
  await env.DB.prepare('INSERT OR IGNORE INTO seasons (n, title, start_at, end_at) VALUES (?, ?, ?, ?)').bind(n, `Сезон ${n}`, start, defaultSeasonEnd(Math.max(start, monthStartKyiv(now)))).run();
  const r = await env.DB.prepare(OPEN_SQL).first();
  return r ? rowSeason(r) : null;
}
// закрыть сезон, у которого вышел срок, и открыть следующий — одной пачкой (в D1 пачка — одна транзакция и один запрос).
// Первая строка «забирает» закрытие: ставит closed_by = случайная метка этого запроса, только если сезон ещё открыт.
// Остальные строки срабатывают лишь там, где метка своя, поэтому второй запрос (даже в ту же миллисекунду) ничего
// не делает. Итоги — одним INSERT … SELECT … GROUP BY, без цикла по людям; место — по опыту сезона.
// Плашка «Новый сезон» с личными итогами — тоже одним UPDATE по всем user_level.
export async function closeSeason(env, s, now = Date.now()) {
  const n = s.n, next = n + 1, end = s.end != null ? Math.min(s.end, now) : now;
  const nextEnd = defaultSeasonEnd(Math.max(end, monthStartKyiv(now)));
  const token = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const mine = 'EXISTS (SELECT 1 FROM seasons WHERE n = ?1 AND closed_by = ?2)';
  const caseRank = 'CASE ' + [...SEASON_RANKS].reverse().map((r) => `WHEN s >= ${+r.xp} THEN '${r.id}'`).join(' ') + ' END';
  const nextTitle = `Сезон ${next}`;
  const letter = seasonEndLetter(n, next, nextEnd);
  const res = await env.DB.batch([
    env.DB.prepare('UPDATE seasons SET closed_at = ?3, end_at = ?4, closed_by = ?2 WHERE n = ?1 AND closed_at IS NULL AND end_at <= ?3').bind(n, token, now, end),
    env.DB.prepare(`INSERT OR IGNORE INTO season_results (season, user_id, xp, rank, place)
      SELECT ?1, user_id, s, ${caseRank}, ROW_NUMBER() OVER (ORDER BY s DESC, user_id)
      FROM (SELECT user_id, SUM(xp) AS s FROM xp_log WHERE gone = 0 AND at >= ?3 AND at < ?4 GROUP BY user_id)
      WHERE s > 0 AND ${mine}`).bind(n, token, s.start, end),
    env.DB.prepare(`INSERT OR IGNORE INTO seasons (n, title, start_at, end_at) SELECT ?3, ?4, ?5, ?6 WHERE ${mine}`).bind(n, token, next, nextTitle, end, nextEnd),
    env.DB.prepare(`INSERT OR IGNORE INTO gifts (id, to_id, kind, title, body, xp, at) SELECT ?3, NULL, 'season', ?4, ?5, 0, ?6 WHERE ${mine}`).bind(n, token, `season:${n}:end`, letter.title, letter.body, now),
    // письмо о назначенном сбросе больше не нужно: сброс случился
    env.DB.prepare(`UPDATE gifts SET until = ?4 WHERE kind = 'season' AND id LIKE ?3 AND (until IS NULL OR until > ?4) AND ${mine}`).bind(n, token, `season:${n}:plan:%`, now),
    env.DB.prepare(`UPDATE user_level SET news = json_insert(CASE WHEN json_valid(news) THEN news ELSE '[]' END, '$[#]', json_object('t', 'season', 'n', ?3, 'title', ?4, 'at', ?5,
        'prev', json((SELECT json_object('n', r.season, 'rank', r.rank, 'xp', r.xp, 'place', r.place) FROM season_results r WHERE r.season = ?1 AND r.user_id = user_level.user_id))))
      WHERE ${mine}`).bind(n, token, next, nextTitle, now),
  ]);
  const closed = !!(res[0] && res[0].meta && res[0].meta.changes);
  if (closed) for (const fn of seasonHooks) { try { await fn(env, { n, next }); } catch (e) { console.error('season hook', e && e.message); } }
  const r = await env.DB.prepare(OPEN_SQL).first();
  return r ? rowSeason(r) : null;
}
function seasonEndLetter(n, next, nextEnd) {
  return {
    title: `Сезон ${n} закончился, начался сезон ${next}`,
    body: `Звания сбросились: все снова начинают с «${SEASON_RANKS[0].title}», уровень и награды остались. Своё звание и место в прошлом сезоне — в окне «Прогресс». Следующий сброс — ${fmtKyiv(nextEnd)}.`,
  };
}
// письмо всем о назначенном сбросе (id свой у каждого назначения; прежние письма этого сезона гаснут)
export function seasonPlanLetter(n, end) {
  return {
    id: `season:${n}:plan:${end}`,
    title: `Сброс званий ${fmtKyiv(end)}`,
    body: `Сезон ${n} закончится ${fmtKyiv(end)}. Звания сбросятся, и начнётся сезон ${n + 1}: уровень, опыт за всё время и награды останутся, а своё звание и место в сезоне ${n} будут видны в окне «Прогресс».`,
  };
}
// опыт человека за сезон (с его начала)
export async function seasonXpOf(env, uid, s) {
  if (!s || !uid) return 0;
  const r = await env.DB.prepare('SELECT COALESCE(SUM(xp), 0) AS s FROM xp_log WHERE user_id = ? AND gone = 0 AND at >= ?').bind(uid, s.start).first();
  return +(r && r.s) || 0;
}
// опыт за сезон у нескольких людей: { id: опыт } (кого нет — 0)
export async function seasonXpMany(env, ids, s) {
  const out = {};
  if (!s || !ids.length) return out;
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT user_id, SUM(xp) AS s FROM xp_log WHERE gone = 0 AND at >= ? AND user_id IN (${inList(part.length)}) GROUP BY user_id`).bind(s.start, ...part).all();
    for (const r of results || []) out[r.user_id] = +r.s || 0;
  }
  return out;
}

// ---------- тематическая неделя (админ включает в админке) ----------
// meta.levels_event = { id, title, kinds: [...], mult, until }
let eventCache = { at: 0, v: null };
export async function currentEvent(env, now = Date.now()) {
  if (eventCache.at > now - 30e3 && eventCache.db === env.DB) return eventCache.v && eventCache.v.until > now ? eventCache.v : null;
  let v = null;
  try { const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'levels_event'").first(); v = r ? JSON.parse(r.v) : null; } catch (e) {}
  eventCache = { at: now, v, db: env.DB };
  return v && v.until > now ? v : null;
}
export const forgetEvent = () => { eventCache = { at: 0, v: null }; };

// сколько опыта даст действие сейчас, по лимитам
function priceOf(rule, c) {
  if (rule.ever != null && c.ever >= rule.ever) return 0;
  if (rule.pair != null && c.pair >= rule.pair) return 0;
  if (rule.day == null) return rule.xp;
  if (c.day < rule.day) return rule.xp;
  if (rule.tail && c.day < rule.day + rule.tail.day) return rule.tail.xp;
  return 0;
}
const CHUNK = 12; // строк в одном INSERT: у D1 не больше 100 параметров на запрос, у строки их 7
const inList = (n) => Array(n).fill('?').join(', ');
const n0 = (r) => +((r && r.results || [])[0] || {}).n || 0;
const parse = (s, d) => { try { const v = s ? JSON.parse(s) : null; return v == null ? d : v; } catch (e) { return d; } };

// ---------- начисление ----------
// awardMany(env, uid, items, { tz, now, metrics })
//   items — [{ kind, ref, peer?, xp? (для given), day? (для опыта за прошлое — день действия) }]
//   tz — часовой пояс из request.cf.timezone; metrics — особые мерки для достижений ({ cats, strict, nope, tierReacts })
//   past — опыт за прошлое: без лимитов, без серий и заданий, xp у каждого действия свой.
// Возвращает null, если уровни выключены или новых действий нет, иначе
//   { gained, xp, level, levelUp, news: [...] } — news уже записаны человеку и уйдут ему плашкой.
// Ошибки базы не роняют запрос, ради которого начисляли: опыт — не повод не сохранить оценку.
export async function awardMany(env, uid, items, opts = {}) {
  if (!levelsOn(env) || !uid || !Array.isArray(items) || !items.length) return null;
  for (const it of items) if (!RULES[it.kind]) throw new Error('levels: нет правила ' + it.kind);
  try {
    await ensureLevels(env);
    return await doAward(env, uid, items, opts);
  } catch (e) {
    console.error('levels award', e && e.message);
    return null;
  }
}
export const award = (env, uid, kind, ref, opts = {}) => awardMany(env, uid, [{ kind, ref, peer: opts.peer, xp: opts.xp }], opts);

async function doAward(env, uid, items, opts) {
  const now = opts.now || Date.now();
  const tzIn = cleanTz(opts.tz);
  const known = await env.DB.prepare('SELECT * FROM user_level WHERE user_id = ?').bind(uid).first();
  const tz = tzIn || (known && known.tz) || 'UTC';
  const today = dayKey(now, tz);
  // одинаковые действия в одном вызове — одно
  const seen = new Set();
  const list = [];
  for (const it of items) {
    const ref = String(it.ref == null ? '' : it.ref).slice(0, 200);
    if (!ref || seen.has(it.kind + '\n' + ref)) continue;
    seen.add(it.kind + '\n' + ref);
    list.push({ ...it, ref, peer: it.peer ? String(it.peer).slice(0, 64) : null });
  }
  if (!list.length) return null;
  const kinds = [...new Set(list.map((x) => x.kind))];
  // что уже было и сколько сегодня / с этим человеком / всего — одной пачкой
  const reads = [];
  for (const k of kinds) {
    const refs = list.filter((x) => x.kind === k).map((x) => x.ref);
    for (let i = 0; i < refs.length; i += 90) reads.push({ t: 'has', q: env.DB.prepare(`SELECT kind, ref FROM xp_log WHERE user_id = ? AND kind = ? AND ref IN (${inList(Math.min(90, refs.length - i))})`).bind(uid, k, ...refs.slice(i, i + 90)) });
    reads.push({ t: 'day', k, q: env.DB.prepare('SELECT peer, COUNT(*) AS n FROM xp_log WHERE user_id = ? AND day = ? AND kind = ? GROUP BY peer').bind(uid, today, k) });
    if (RULES[k].ever != null) reads.push({ t: 'ever', k, q: env.DB.prepare('SELECT COUNT(*) AS n FROM xp_log WHERE user_id = ? AND kind = ?').bind(uid, k) });
  }
  const got = await env.DB.batch(reads.map((r) => r.q));
  const has = new Set(), dayN = {}, pairN = {}, everN = {};
  reads.forEach((r, i) => {
    const rows = got[i].results || [];
    if (r.t === 'has') rows.forEach((x) => has.add(x.kind + '\n' + x.ref));
    else if (r.t === 'day') { dayN[r.k] = 0; pairN[r.k] = {}; rows.forEach((x) => { dayN[r.k] += +x.n || 0; if (x.peer) pairN[r.k][x.peer] = +x.n || 0; }); }
    else everN[r.k] = n0(got[i]);
  });
  const event = opts.past ? null : await currentEvent(env, now);
  const rows = [];
  for (const it of list) {
    if (has.has(it.kind + '\n' + it.ref)) continue;
    const rule = RULES[it.kind];
    let xp;
    if (opts.past || rule.given) xp = Math.max(0, Math.floor(+it.xp || 0));
    else {
      xp = priceOf(rule, { day: dayN[it.kind] || 0, pair: it.peer ? (pairN[it.kind] || {})[it.peer] || 0 : 0, ever: everN[it.kind] || 0 });
      if (xp && event && Array.isArray(event.kinds) && event.kinds.includes(it.kind)) xp = Math.round(xp * Math.min(3, Math.max(1, +event.mult || 2)));
    }
    dayN[it.kind] = (dayN[it.kind] || 0) + 1;
    if (it.peer) { pairN[it.kind] = pairN[it.kind] || {}; pairN[it.kind][it.peer] = (pairN[it.kind][it.peer] || 0) + 1; }
    everN[it.kind] = (everN[it.kind] || 0) + 1;
    rows.push({ ...it, xp, day: opts.past && it.day ? it.day : today, at: opts.past && it.at ? +it.at : now, ev: event && xp && Array.isArray(event.kinds) && event.kinds.includes(it.kind) ? event.id : null });
  }
  if (!rows.length) return null;
  const writes = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    writes.push(env.DB.prepare(`INSERT OR IGNORE INTO xp_log (user_id, kind, ref, xp, day, peer, at) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...part.flatMap((r) => [uid, r.kind, r.ref, r.xp, r.day, r.peer, r.at])));
  }
  // участие в тематической неделе: отметка на каждое событие, по ней ачивка «Участник события»
  const evIds = [...new Set(rows.map((r) => r.ev).filter(Boolean))];
  for (const id of evIds) writes.push(env.DB.prepare('INSERT OR IGNORE INTO xp_log (user_id, kind, ref, xp, day, peer, at) VALUES (?, ?, ?, 0, ?, NULL, ?)').bind(uid, 'event', String(id).slice(0, 60), today, now));
  if (tzIn && (!known || known.tz !== tzIn)) writes.push(env.DB.prepare('INSERT INTO user_level (user_id, tz, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET tz = excluded.tz').bind(uid, tzIn, now));
  const season = await currentSeason(env, now);
  const s = await settle(env, uid, now, writes, season);
  const inserted = s.res.slice(0, Math.ceil(rows.length / CHUNK)).reduce((a, r) => a + ((r.meta && r.meta.changes) || 0), 0);
  if (!inserted) return null;
  const gained = rows.reduce((a, r) => a + r.xp, 0);
  // звание сезона до и после: перешёл порог — «Новое звание» (опыт за прошлое званий не объявляет)
  const inSeason = season ? rows.reduce((a, r) => a + (r.at >= season.start ? r.xp : 0), 0) : 0;
  const rankNow = seasonRankOf(s.season), rankBefore = seasonRankOf(s.season - inSeason);
  const rankUp = !opts.past && rankNow.xp > rankBefore.xp ? { t: 'rank', rank: rankNow.id, title: rankNow.title } : null;
  const news = [];
  if (s.levelUp) news.push({ t: 'level', from: s.levelUp.from, to: s.levelUp.to, rank: rankNow.title });
  if (rankUp) news.push(rankUp);
  if (s.levelUp && !opts.past) await levelLetter(env, uid, s.levelUp, now, s.season);
  // серия, задания, достижения, приглашения — только за живые действия, не за пересчёт прошлого
  let extra = { gained: 0 };
  if (!opts.past && !opts.noExtras) extra = await extras(env, uid, { now, today, tz, rows, row: known, level: s.level, metrics: opts.metrics, news });
  else if (opts.past) await checkAchievements(env, uid, { now, metrics: opts.metrics, news, quiet: opts.quietAch });
  const total = s.xp + extra.gained;
  const level = Math.max(s.level, extra.level || 0);
  if (news.length && !opts.silent) await pushNews(env, uid, news, now);
  return { gained: gained + extra.gained, xp: total, level, levelUp: s.levelUp || extra.levelUp || null, rankUp: extra.rankUp || rankUp, seasonXp: extra.seasonXp != null ? extra.seasonXp : s.season, news };
}

// письмо в почту о новом уровне: звание сезона и сколько до следующего
export async function levelLetter(env, uid, up, now = Date.now(), seasonXp = 0) {
  try {
    const r = seasonRankOf(seasonXp), next = nextSeasonRank(seasonXp);
    let body = `Звание сезона: ${r.title}.` + (next ? ` До «${next.title}» в этом сезоне ещё ${next.xp - (+seasonXp || 0)} опыта.` : ' Это самое высокое звание сезона.');
    // новая еда для Васяна — тем, у кого он есть (первая десятка или 25-й уровень). shop.js сам подключает этот файл,
    // поэтому он берётся здесь, при вызове, а не наверху
    const { foodsUnlocked } = await import('./shop.js');
    const food = foodsUnlocked(up.from, up.to);
    if (food.length && (up.to >= 25 || (await env.DB.prepare('SELECT 1 FROM gift_box WHERE gift_id = ? AND user_id = ? AND claimed = 1').bind('vasyan:' + uid, uid).first()))) {
      body += ` Новая еда для Васяна: ${food.map((f) => f.title).join(', ')}.`;
    }
    await env.DB.prepare("INSERT OR IGNORE INTO gifts (id, to_id, kind, title, body, xp, at) VALUES (?, ?, 'level', ?, ?, 0, ?)").bind(`lv:${uid}:${up.to}`, uid, `Новый уровень: ${up.to}`, body, now).run();
  } catch (e) { console.error('levels letter', e && e.message); }
}

// пересчитать итог по журналу; уровень поднимается, если опыта хватает, и никогда не опускается.
// В той же пачке — опыт за текущий сезон (для звания), отдельного запроса на это нет
const SUM_SQL = 'INSERT INTO user_level (user_id, xp, level, updated_at) VALUES (?1, (SELECT COALESCE(SUM(xp), 0) FROM xp_log WHERE user_id = ?1 AND gone = 0), 1, ?2) '
  + 'ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, updated_at = excluded.updated_at';
async function settle(env, uid, now, batchFirst, season = null) {
  const res = await env.DB.batch([
    ...batchFirst,
    env.DB.prepare(SUM_SQL).bind(uid, now),
    env.DB.prepare('SELECT xp, level, (SELECT COALESCE(SUM(xp), 0) FROM xp_log WHERE user_id = ?1 AND gone = 0 AND at >= ?2) AS season FROM user_level WHERE user_id = ?1').bind(uid, season ? season.start : now + 1),
  ]);
  const row = (res[res.length - 1].results || [])[0] || { xp: 0, level: 1, season: 0 };
  const xp = +row.xp || 0, stored = +row.level || 1;
  const want = levelOf(xp).level;
  let levelUp = null;
  if (want > stored) {
    // «поднял уровень» сообщает только тот запрос, который его действительно поднял
    const up = await env.DB.prepare('UPDATE user_level SET level = ?1 WHERE user_id = ?2 AND level < ?1').bind(want, uid).run();
    if (up && up.meta && up.meta.changes) levelUp = { from: stored, to: want };
  }
  return { res, xp, level: Math.max(stored, want), levelUp, season: +row.season || 0 };
}

// дописать уведомления человеку (их заберёт страница: по сокету или при следующем /ping)
async function pushNews(env, uid, news, now) {
  const r = await env.DB.prepare('SELECT news FROM user_level WHERE user_id = ?').bind(uid).first();
  const all = [...parse(r && r.news, []), ...news.map((n) => ({ ...n, at: now }))].slice(-20);
  await env.DB.prepare('UPDATE user_level SET news = ? WHERE user_id = ?').bind(JSON.stringify(all), uid).run();
}
// забрать уведомления: отдаёт и очищает
export async function takeNews(env, uid) {
  if (!levelsOn(env) || !uid) return [];
  await ensureLevels(env);
  // прочитать и очистить одной пачкой (RETURNING отдал бы уже очищенное значение)
  const [r] = await env.DB.batch([
    env.DB.prepare('SELECT news FROM user_level WHERE user_id = ?').bind(uid),
    env.DB.prepare('UPDATE user_level SET news = NULL WHERE user_id = ? AND news IS NOT NULL').bind(uid),
  ]);
  return parse(((r.results || [])[0] || {}).news, []);
}

// ---------- серия, задания, достижения после живого действия ----------
async function extras(env, uid, c) {
  const { now, today, rows, news } = c;
  const bonus = [];
  const state = c.row || {};
  const sets = [], binds = [];
  // серия: день засчитывается за любое «настоящее» действие, не за простой заход
  if (rows.some((r) => ACTIVE.has(r.kind))) {
    const st = streakStep(state, today);
    if (st.changed) {
      sets.push('streak = ?', 'streak_day = ?', 'best_streak = ?', 'freezes = ?', 'freeze_week = ?');
      binds.push(st.streak, today, st.best, st.freezes, st.freezeWeek);
      if (st.froze) news.push({ t: 'freeze', streak: st.streak });
      if (STREAK_BONUS[st.streak]) {
        bonus.push({ kind: 'streak', ref: `${st.streak}:${today}`, xp: STREAK_BONUS[st.streak] });
        news.push({ t: 'streak', streak: st.streak, xp: STREAK_BONUS[st.streak] });
      }
    }
  }
  if (sets.length) await env.DB.prepare(`UPDATE user_level SET ${sets.join(', ')} WHERE user_id = ?`).bind(...binds, uid).run();
  // задания дня и недели: прогресс — по журналу за сегодня / за неделю
  const q = await questState(env, uid, { now, today, row: state });
  for (const d of q.daily) if (d.done && !d.paid) { bonus.push({ kind: 'quest', ref: `${today}:${d.code}`, xp: RULES.quest.xp }); news.push({ t: 'quest', title: d.title, xp: RULES.quest.xp }); }
  if (q.daily.length && q.daily.every((d) => d.done) && !q.allPaid) { bonus.push({ kind: 'quest_all', ref: today, xp: RULES.quest_all.xp }); news.push({ t: 'quest_all', xp: RULES.quest_all.xp }); }
  if (q.weekly && q.weekly.done && !q.weekly.paid) { bonus.push({ kind: 'quest_week', ref: `${q.week}:${q.weekly.code}`, xp: RULES.quest_week.xp }); news.push({ t: 'quest_week', title: q.weekly.title, xp: RULES.quest_week.xp }); }
  // первые шаги
  for (const f of await firstStepsDue(env, uid)) { bonus.push({ kind: 'first', ref: f.code, xp: f.xp }); news.push({ t: 'first', title: f.title, xp: f.xp }); }
  let res = { gained: 0 };
  if (bonus.length) {
    const r = await doAward(env, uid, bonus, { now, noExtras: true, silent: true, tz: c.tz });
    if (r) {
      res = { gained: r.gained, level: r.level, levelUp: r.levelUp, rankUp: r.rankUp, seasonXp: r.seasonXp };
      if (r.levelUp) news.push({ t: 'level', from: r.levelUp.from, to: r.levelUp.to, rank: seasonRankOf(r.seasonXp).title });
      // бонус (задание, серия, первый шаг) довёл до нового звания
      if (r.rankUp) news.push(r.rankUp);
    }
  }
  // приглашённый дошёл до 3-го уровня — опыт обоим
  const lvNow = Math.max(c.level, res.level || 0);
  if (lvNow >= 3) {
    const inv = await env.DB.prepare('UPDATE invited SET rewarded = 1 WHERE user_id = ? AND rewarded = 0 RETURNING by_id').bind(uid).first().catch(() => null);
    if (inv && inv.by_id) {
      const me = await doAward(env, uid, [{ kind: 'invite', ref: 'joined' }], { now, noExtras: true, silent: true });
      if (me) { res.gained += me.gained; news.push({ t: 'invite_me', xp: RULES.invite.xp }); }
      await awardMany(env, inv.by_id, [{ kind: 'invite', ref: uid }], { now, metrics: {}, noExtras: false });
      await pushNews(env, inv.by_id, [{ t: 'invite', xp: RULES.invite.xp }], now);
    }
  }
  await checkAchievements(env, uid, { now, metrics: c.metrics, news, row: state });
  return res;
}

// следующий шаг серии: today — день действия
export function streakStep(st, today) {
  const week = weekStart(today);
  let freezes = st.freezes == null ? 1 : +st.freezes, freezeWeek = st.freeze_week || week;
  // раз в неделю — новая «заморозка», копится до двух
  if (freezeWeek !== week) { freezes = Math.min(2, freezes + 1); freezeWeek = week; }
  const last = st.streak_day || '';
  let streak = +st.streak || 0, froze = false;
  if (last === today) return { changed: false, streak, best: +st.best_streak || 0, freezes, freezeWeek };
  if (last === shiftDay(today, -1)) streak += 1;
  else if (last === shiftDay(today, -2) && freezes > 0) { freezes -= 1; streak += 1; froze = true; }
  else streak = 1;
  return { changed: true, streak, best: Math.max(+st.best_streak || 0, streak), freezes, freezeWeek, froze, comeback: !!last && last < shiftDay(today, -30) };
}

// задания: выбрать на сегодня (если ещё не выбраны) и посчитать прогресс
export async function questState(env, uid, { now, today, row }) {
  row = row || (await env.DB.prepare('SELECT * FROM user_level WHERE user_id = ?').bind(uid).first()) || {};
  const week = weekStart(today);
  let daily = row.quest_day === today ? parse(row.quests, []) : null;
  let wq = row.quest_week === week ? row.wquest : null;
  if (!daily || !wq) {
    // что можно выдать: задания «с друзьями» — только если друзья есть, «из планов» — только если есть планы
    const [fr, sh] = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(uid),
      env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(uid),
    ]);
    const friends = n0(fr) > 0;
    let plans = false;
    try { const d = JSON.parse(((sh.results || [])[0] || {}).data || '{}'); plans = (Array.isArray(d) ? d : d.ratings || []).some((r) => r && r.status === 'В планах'); } catch (e) {}
    const ok = (x) => !x.need || (x.need === 'friends' && friends) || (x.need === 'plans' && plans);
    if (!daily) {
      const rnd = seeded(uid + ':' + today), pool = DAILY.filter(ok);
      daily = [];
      while (daily.length < 3 && pool.length) daily.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].code);
    }
    if (!wq) { const pool = WEEKLY.filter(ok); wq = pool[Math.floor(seeded(uid + ':' + week)() * pool.length)].code; }
    await env.DB.prepare('INSERT INTO user_level (user_id, updated_at, quest_day, quests, quest_week, wquest) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(user_id) DO UPDATE SET quest_day = ?3, quests = ?4, quest_week = ?5, wquest = ?6')
      .bind(uid, now, today, JSON.stringify(daily), week, wq).run();
  }
  const [td, wk, paid] = await env.DB.batch([
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM xp_log WHERE user_id = ? AND day = ? AND gone = 0 GROUP BY kind').bind(uid, today),
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM xp_log WHERE user_id = ? AND day >= ? AND day <= ? AND gone = 0 GROUP BY kind').bind(uid, week, shiftDay(week, 6)),
    env.DB.prepare("SELECT kind, ref FROM xp_log WHERE user_id = ? AND ((kind = 'quest' AND ref LIKE ?) OR (kind = 'quest_all' AND ref = ?) OR (kind = 'quest_week' AND ref LIKE ?))").bind(uid, today + ':%', today, week + ':%'),
  ]);
  const cnt = (res) => Object.fromEntries((res.results || []).map((x) => [x.kind, +x.n || 0]));
  const t = cnt(td), w = cnt(wk);
  const paidSet = new Set((paid.results || []).map((x) => x.kind + ':' + x.ref));
  const prog = (def, c) => Math.min(def.goal, def.kinds.reduce((a, k) => a + (c[k] || 0), 0));
  const dl = daily.map((code) => DAILY.find((d) => d.code === code)).filter(Boolean).map((d) => {
    const p = prog(d, t);
    return { code: d.code, title: d.title, goal: d.goal, progress: p, done: p >= d.goal, paid: paidSet.has(`quest:${today}:${d.code}`), xp: RULES.quest.xp };
  });
  const wd = WEEKLY.find((d) => d.code === wq);
  const weekly = wd ? (() => { const p = prog(wd, w); return { code: wd.code, title: wd.title, goal: wd.goal, progress: p, done: p >= wd.goal, paid: paidSet.has(`quest_week:${week}:${wd.code}`), xp: RULES.quest_week.xp }; })() : null;
  return { day: today, week, daily: dl, allPaid: paidSet.has(`quest_all:${today}`), allXp: RULES.quest_all.xp, weekly };
}

// первые шаги, которые выполнены, но ещё не оплачены
export async function firstSteps(env, uid) {
  const [cnt, paid, u, ava] = await env.DB.batch([
    env.DB.prepare("SELECT kind, COUNT(*) AS n FROM xp_log WHERE user_id = ? AND gone = 0 AND kind IN ('rate', 'import', 'friend', 'react', 'tier') GROUP BY kind").bind(uid),
    env.DB.prepare("SELECT ref FROM xp_log WHERE user_id = ? AND kind = 'first'").bind(uid),
    env.DB.prepare('SELECT email_ok FROM users WHERE id = ?').bind(uid),
    env.DB.prepare('SELECT 1 AS ok FROM photos WHERE key = ?').bind(uid + ':avatar'),
  ]);
  const c = Object.fromEntries((cnt.results || []).map((x) => [x.kind, +x.n || 0]));
  const done = new Set((paid.results || []).map((x) => x.ref));
  const emailOk = !!(((u.results || [])[0] || {}).email_ok);
  const hasAva = !!(ava.results || []).length;
  return FIRST_STEPS.map((f) => ({
    code: f.code, title: f.title, xp: f.xp, paid: done.has(f.code),
    done: f.check === 'email' ? emailOk : f.check === 'avatar' ? hasAva : f.kinds.some((k) => c[k] > 0),
  }));
}
async function firstStepsDue(env, uid) {
  return (await firstSteps(env, uid)).filter((f) => f.done && !f.paid);
}

// ---------- достижения ----------
// мерки: строки журнала по видам, лучшая серия и особые мерки, которые передаёт вызывающий
export async function checkAchievements(env, uid, { now, metrics, news, row, quiet }) {
  const [cnt, have, lv] = await env.DB.batch([
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM xp_log WHERE user_id = ? AND gone = 0 GROUP BY kind').bind(uid),
    env.DB.prepare('SELECT code, tier FROM achievements WHERE user_id = ?').bind(uid),
    env.DB.prepare('SELECT best_streak, streak_day, metrics FROM user_level WHERE user_id = ?').bind(uid),
  ]);
  const c = Object.fromEntries((cnt.results || []).map((x) => [x.kind, +x.n || 0]));
  const owned = Object.fromEntries((have.results || []).map((x) => [x.code, +x.tier || 1]));
  const l = (lv.results || [])[0] || {};
  // особые мерки копятся: максимум из прежних и новых (например, «категорий» больше не станет меньше от удаления)
  const m = { ...parse(l.metrics, {}) };
  for (const [k, v] of Object.entries(metrics || {})) if (Number.isFinite(+v)) m[k] = Math.max(+m[k] || 0, +v);
  m.streak = Math.max(+m.streak || 0, +l.best_streak || 0);
  m.event = c.event || 0;
  const value = (a) => (typeof a.metric === 'string' && a.metric[0] === '@' ? +m[a.metric.slice(1)] || 0
    : (Array.isArray(a.metric) ? a.metric : [a.metric]).reduce((s, k) => s + (c[k] || 0), 0));
  const writes = [env.DB.prepare('UPDATE user_level SET metrics = ? WHERE user_id = ?').bind(JSON.stringify(m), uid)];
  for (const a of ACHIEVEMENTS) {
    if (a.special) continue;
    const t = tierFor(a, value(a));
    if (t > (owned[a.code] || 0)) {
      writes.push(env.DB.prepare('INSERT INTO achievements (user_id, code, tier, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, code) DO UPDATE SET tier = ?3, at = ?4 WHERE tier < ?3').bind(uid, a.code, t, now));
      if (!quiet) news.push({ t: 'ach', code: a.code, title: a.title, tier: (a.tiers || []).length > 1 ? t : 0 });
    }
  }
  await env.DB.batch(writes);
}
// выдать особое достижение (основатель, первые шаги, итоги года)
export async function grantSpecial(env, uid, code, { now = Date.now(), quiet } = {}) {
  if (!levelsOn(env) || !ACH[code]) return false;
  await ensureLevels(env);
  const r = await env.DB.prepare('INSERT OR IGNORE INTO achievements (user_id, code, tier, at) VALUES (?, ?, 1, ?)').bind(uid, code, now).run();
  const fresh = !!(r.meta && r.meta.changes);
  if (fresh && !quiet) await pushNews(env, uid, [{ t: 'ach', code, title: ACH[code].title, tier: 0 }], now);
  return fresh;
}

// ---------- списание ----------
export async function revokeMany(env, uid, items, opts = {}) {
  if (!levelsOn(env) || !uid || !Array.isArray(items) || !items.length) return null;
  try {
    await ensureLevels(env);
    const now = opts.now || Date.now();
    const writes = items.filter((x) => x && x.kind && x.ref).map((x) => env.DB.prepare('UPDATE xp_log SET gone = 1 WHERE user_id = ? AND kind = ? AND ref = ? AND gone = 0').bind(uid, x.kind, String(x.ref).slice(0, 200)));
    if (!writes.length) return null;
    const s = await settle(env, uid, now, writes);
    const changed = s.res.slice(0, writes.length).reduce((a, r) => a + ((r.meta && r.meta.changes) || 0), 0);
    return changed ? { xp: s.xp, level: s.level } : null;
  } catch (e) {
    console.error('levels revoke', e && e.message);
    return null;
  }
}
export const revoke = (env, uid, kind, ref, opts) => revokeMany(env, uid, [{ kind, ref }], opts);

// ---------- заход за день (из /ping) ----------
export async function visit(env, uid, tz, now = Date.now()) {
  if (!levelsOn(env) || !uid) return null;
  try {
    await ensureLevels(env);
    const row = await env.DB.prepare('SELECT tz, streak_day, news IS NOT NULL AS pending FROM user_level WHERE user_id = ?').bind(uid).first();
    const zone = cleanTz(tz) || (row && row.tz) || 'UTC';
    const today = dayKey(now, zone);
    const r = await awardMany(env, uid, [{ kind: 'visit', ref: today }], { tz: zone, now });
    // вернулся после долгого перерыва (последний активный день больше 30 дней назад)
    if (r && row && row.streak_day && row.streak_day < shiftDay(today, -30)) {
      const more = [];
      await checkAchievements(env, uid, { now, metrics: { comeback: 1 }, news: more });
      if (more.length) { await pushNews(env, uid, more, now); r.news.push(...more); }
    }
    // у человека уже лежат плашки (например, «Новый сезон» после сброса, пока он был без сокета) — pending:
    // API поставит x-levels, и страница их заберёт
    const pending = !!(row && +row.pending);
    return r ? { ...r, pending } : pending ? { news: [], pending } : null;
  } catch (e) {
    console.error('levels visit', e && e.message);
    return null;
  }
}

// ---------- чтение ----------
// уровень и опыт за всё время. Звания здесь нет: оно сезонное — rankFields(опыт сезона)
export function levelView(xp, level) {
  const l = levelOf(xp), lv = Math.max(level || 1, l.level);
  return { xp, level: lv, into: Math.max(0, xp - totalFor(lv)), need: needFor(lv) };
}
export async function readLevel(env, uid) {
  if (!levelsOn(env) || !uid) return levelView(0, 1);
  await ensureLevels(env);
  const r = await env.DB.prepare('SELECT xp, level FROM user_level WHERE user_id = ?').bind(uid).first();
  return levelView(r ? +r.xp || 0 : 0, r ? +r.level || 1 : 1);
}
export const prefsOf = (row) => {
  const p = parse(row && row.prefs, {});
  return { intro: !!p.intro, hideLevel: !!p.hideLevel, hideBoard: !!p.hideBoard, notify: p.notify !== false, anim: p.anim !== false, showcase: Array.isArray(p.showcase) ? p.showcase.slice(0, 3) : [], frame: p.frame || '', color: p.color || '', bg: p.bg || '', nick: p.nick || '', fx: p.fx || '', pet: !!p.pet, adm: !!p.adm };
};
// оформление, которое видят другие: только то, что открыто уровнем.
// adm — выбор сохранил админ (PUT /levels/prefs ставит его сам): ему для проверки открыто всё.
// rank — звание сезона рядом с ником (награда 7-го уровня), seasonXp — опыт человека за текущий сезон
export function lookOf(row, seasonXp = 0) {
  const lv = levelView(+row.xp || 0, +row.level || 1).level;
  const p = prefsOf(row), u = unlockedAt(lv, p.adm), r = seasonRankOf(seasonXp);
  return {
    level: lv,
    frame: u.frames.includes(p.frame) ? p.frame : '',
    color: u.colors.includes(p.color) ? p.color : '',
    bg: u.bgs.includes(p.bg) ? p.bg : '',
    nick: u.nicks.includes(p.nick) ? p.nick : '',
    fx: u.fx.includes(p.fx) ? p.fx : '',
    pet: u.pet && p.pet,
    rank: u.rankChip ? r.title : '',
    rankId: u.rankChip ? r.id : '',
  };
}
// уровни для списка людей (кружки у аватаров): скрывшие уровень не попадают. Опыт сезона — в том же запросе
export async function levelsOf(env, ids) {
  if (!levelsOn(env) || !ids.length) return {};
  await ensureLevels(env);
  const s = await currentSeason(env);
  const out = {};
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT ul.user_id, ul.xp, ul.level, ul.prefs, (SELECT COALESCE(SUM(l.xp), 0) FROM xp_log l WHERE l.user_id = ul.user_id AND l.gone = 0 AND l.at >= ?1) AS season
      FROM user_level ul WHERE ul.user_id IN (${part.map((_, k) => '?' + (k + 2)).join(', ')})`).bind(s ? s.start : Date.now() + 1, ...part).all();
    for (const r of results || []) if (!prefsOf(r).hideLevel) out[r.user_id] = lookOf(r, +r.season || 0);
  }
  return out;
}
export async function achievementsOf(env, uid) {
  const [mine, all, users, kinds, lv] = await env.DB.batch([
    env.DB.prepare('SELECT code, tier, at FROM achievements WHERE user_id = ?').bind(uid),
    env.DB.prepare('SELECT code, COUNT(*) AS n FROM achievements GROUP BY code'),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users'),
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM xp_log WHERE user_id = ? AND gone = 0 GROUP BY kind').bind(uid),
    env.DB.prepare('SELECT best_streak, metrics FROM user_level WHERE user_id = ?').bind(uid),
  ]);
  const own = Object.fromEntries((mine.results || []).map((x) => [x.code, x]));
  const cnt = Object.fromEntries((all.results || []).map((x) => [x.code, +x.n || 0]));
  const people = Math.max(1, n0(users));
  // прогресс: те же мерки, что у checkAchievements
  const c = Object.fromEntries((kinds.results || []).map((x) => [x.kind, +x.n || 0]));
  const l = (lv.results || [])[0] || {};
  const m = { ...parse(l.metrics, {}) };
  m.streak = Math.max(+m.streak || 0, +l.best_streak || 0);
  m.event = c.event || 0;
  const value = (a) => (!a.metric ? 0 : typeof a.metric === 'string' && a.metric[0] === '@' ? +m[a.metric.slice(1)] || 0
    : (Array.isArray(a.metric) ? a.metric : [a.metric]).reduce((s, k) => s + (c[k] || 0), 0));
  return ACHIEVEMENTS.map((a) => {
    const o = own[a.code];
    const show = o || !a.hidden;
    const next = show && a.tiers ? a.tiers[o ? +o.tier : 0] || null : null;
    return {
      code: a.code, got: !!o, tier: o ? +o.tier : 0, tiers: (a.tiers || []).length, at: o ? o.at : null,
      title: show ? a.title : '???', desc: show ? a.desc : 'Скрытое достижение', next,
      have: show && next ? Math.min(value(a), next) : null,
      hidden: !!a.hidden, special: !!a.special, rarity: Math.round(((cnt[a.code] || 0) / people) * 100),
    };
  });
}

// ---------- лоты: победа ----------
// после записи победителя (API или комната лотов): ведущему — за проведённый сбор, автору выпавшего лота — за победу.
// ref — сбор и момент победы, поэтому повторные вызовы ничего не удваивают.
export async function lotsWon(env, code, live) {
  if (!levelsOn(env) || !live || !live.winner) return;
  try {
    const at = +live.winner.at || 0;
    const { results: lots } = await env.DB.prepare('SELECT id, user_id, name FROM lots WHERE room_id = ?').bind(code).all();
    const room = await env.DB.prepare('SELECT owner_id FROM lot_rooms WHERE id = ?').bind(code).first();
    if (!room) return;
    const people = new Set((lots || []).map((l) => l.user_id));
    const ref = `${code}:${at}`;
    if (people.size >= 3) await award(env, room.owner_id, 'lots_host', ref);
    // выпавший лот: по id (pickL) или единственный оставшийся
    let win = live.pickL ? (lots || []).find((l) => l.id === live.pickL) : null;
    if (!win) {
      const out = new Set(Array.isArray(live.outIds) ? live.outIds : []);
      const left = (lots || []).filter((l) => !out.has(l.id) && l.name === live.winner.n);
      win = left.length === 1 ? left[0] : null;
    }
    if (win && win.user_id && win.user_id !== room.owner_id) await award(env, win.user_id, 'lot_win', ref);
  } catch (e) {
    console.error('levels lots', e && e.message);
  }
}

// ---------- опыт за прошлое ----------
// Один раз по уже сделанному. Строки пишутся теми же видами, что и живые действия (с днём, когда это было сделано),
// поэтому достижения считаются сразу, а повторное действие с той же оценкой опыта не даст. Повторный запуск ничего
// не удваивает. Оценки: первые 50 по 10, дальше по 3; отзывы по 5; тир-листы по 25; друзья по 15; реакции по 3;
// комментарии по 6 (не больше 200 каждого вида), сборы лотов по 30.
export const PAST = { rateFull: 50, rateXp: 10, rateTailXp: 3, review: 5, tier: 25, friend: 15, react: 3, comment: 6, cap: 200, lots: 30, firstXp: true };
export async function backfillUser(env, uid, { now = Date.now(), founderBefore } = {}) {
  if (!levelsOn(env)) return null;
  await ensureLevels(env);
  const dayOf = (t) => dayKey(+t || now, 'UTC');
  const items = [];
  const [sh, tl, fr, rc, cm, lr, u] = await env.DB.batch([
    env.DB.prepare('SELECT data FROM shelves WHERE user_id = ?').bind(uid),
    env.DB.prepare('SELECT id, data, at FROM tierlists WHERE user_id = ? AND data IS NOT NULL').bind(uid),
    env.DB.prepare("SELECT CASE WHEN a = ?1 THEN b ELSE a END AS id, created_at FROM friendships WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(uid),
    env.DB.prepare('SELECT owner_id, rid, at, emoji FROM reactions WHERE from_id = ? AND owner_id != ? ORDER BY at LIMIT ?').bind(uid, uid, PAST.cap),
    env.DB.prepare('SELECT id, owner_id, at FROM comments WHERE from_id = ? ORDER BY at LIMIT ?').bind(uid, PAST.cap),
    env.DB.prepare('SELECT id, live FROM lot_rooms WHERE owner_id = ?').bind(uid),
    env.DB.prepare('SELECT created_at FROM users WHERE id = ?').bind(uid),
  ]);
  const metrics = {};
  let ratings = [];
  try { const d = JSON.parse(((sh.results || [])[0] || {}).data || '{}'); ratings = Array.isArray(d) ? d : d.ratings || []; } catch (e) {}
  ratings = ratings.filter((r) => r && typeof r.id === 'string' && !r.example);
  const scored = ratings.filter(isScored).sort((a, b) => stamp(a) - stamp(b));
  scored.forEach((r, i) => {
    const kind = r.src === 'letterboxd' ? 'import' : 'rate';
    const xp = kind === 'import' ? (i < 100 ? 1 : 0) : i < PAST.rateFull ? PAST.rateXp : PAST.rateTailXp;
    items.push({ kind, ref: r.id, xp, day: dayOf(stamp(r)), at: stamp(r) || now });
    if (kind === 'rate' && textLen(r) >= 100) items.push({ kind: 'review', ref: r.id, xp: PAST.review, day: dayOf(stamp(r)), at: stamp(r) || now });
  });
  metrics.cats = new Set(scored.map((r) => r.cat || r.catName).filter(Boolean)).size;
  metrics.strict = scored.filter((r) => +r.total <= 2).length;
  for (const t of tl.results || []) {
    let n = 0;
    try { n = Object.keys((JSON.parse(t.data) || {}).items || {}).length; } catch (e) {}
    if (n >= 8) items.push({ kind: 'tier', ref: t.id, xp: PAST.tier, day: dayOf(t.at), at: +t.at || now });
  }
  for (const f of fr.results || []) items.push({ kind: 'friend', ref: f.id, xp: PAST.friend, day: dayOf(f.created_at), at: +f.created_at || now });
  for (const r of rc.results || []) items.push({ kind: 'react', ref: `${r.owner_id}:${r.rid}`, peer: r.owner_id, xp: PAST.react, day: dayOf(r.at), at: +r.at || now });
  metrics.nope = (rc.results || []).filter((r) => r.emoji === 'nope').length;
  for (const c of cm.results || []) items.push({ kind: 'comment', ref: c.id, peer: c.owner_id === uid ? 'self' : c.owner_id, xp: PAST.comment, day: dayOf(c.at), at: +c.at || now });
  for (const l of lr.results || []) {
    let live = null;
    try { live = JSON.parse(l.live || 'null'); } catch (e) {}
    if (live && live.winner) items.push({ kind: 'lots_host', ref: `${l.id}:${+live.winner.at || 0}`, xp: PAST.lots, day: dayOf(live.winner.at), at: +live.winner.at || now });
  }
  // полученные реакции и комментарии — тоже опыт (тому, кому их поставили)
  const [grc, gcm] = await env.DB.batch([
    env.DB.prepare('SELECT from_id, rid, at FROM reactions WHERE owner_id = ? AND from_id != ? ORDER BY at LIMIT ?').bind(uid, uid, PAST.cap),
    env.DB.prepare('SELECT id, from_id, at FROM comments WHERE owner_id = ? AND from_id != ? ORDER BY at LIMIT ?').bind(uid, uid, PAST.cap),
  ]);
  for (const r of grc.results || []) items.push({ kind: 'got_react', ref: `${r.from_id}:${r.rid}`, peer: r.from_id, xp: 3, day: dayOf(r.at), at: +r.at || now });
  for (const c of gcm.results || []) items.push({ kind: 'got_comment', ref: c.id, peer: c.from_id, xp: 4, day: dayOf(c.at), at: +c.at || now });
  const res = items.length ? await awardMany(env, uid, items, { past: true, now, metrics, quietAch: true }) : null;
  if (!res) await checkAchievements(env, uid, { now, metrics, news: [], quiet: true });
  const created = +(((u.results || [])[0] || {}).created_at) || 0;
  if (founderBefore && created && created < founderBefore) await grantSpecial(env, uid, 'founder', { now, quiet: true });
  // первые шаги, уже сделанные раньше, засчитываются вместе с опытом
  const due = await firstStepsDue(env, uid);
  if (due.length) await awardMany(env, uid, due.map((f) => ({ kind: 'first', ref: f.code, xp: f.xp })), { past: true, now });
  const steps = await firstSteps(env, uid);
  if (steps.every((f) => f.done)) await grantSpecial(env, uid, 'first_steps', { now, quiet: true });
  // уровень после пересчёта — без праздничной плашки: он «был всегда»
  await env.DB.prepare('UPDATE user_level SET news = NULL WHERE user_id = ?').bind(uid).run();
  return readLevel(env, uid);
}

// ---------- оценки: что нового на полке ----------
// у оценки есть баллы (не «В планах» и не «В процессе» без баллов)
export const isScored = (r) => !!r && r.total != null && Number.isFinite(+r.total) && Array.isArray(r.scores) && r.scores.length > 0 && r.status !== 'В планах';
export const textLen = (r) => [r.note, r.pros, r.cons].map((x) => String(x || '').trim().length).reduce((a, b) => a + b, 0);
const isFull = (r) => isScored(r) && r.scores.length >= 2 && r.scores.every((s) => +s.v > 0) && !!r.photo;
const stamp = (r) => +new Date(r.createdAt || r.updatedAt || 0) || 0;
// сравнить полку «было / стало»: что начислить и что списать. oldList и newList — списки оценок.
export function shelfDiff(oldList, newList) {
  const before = new Map((oldList || []).filter((r) => r && typeof r.id === 'string').map((r) => [r.id, r]));
  const after = new Map((newList || []).filter((r) => r && typeof r.id === 'string').map((r) => [r.id, r]));
  const give = [], take = [];
  for (const [id, r] of after) {
    if (r.example) continue;
    const o = before.get(id);
    if (isScored(r) && !(o && isScored(o))) {
      give.push({ kind: r.src === 'letterboxd' ? 'import' : 'rate', ref: id });
      if (o && o.status === 'В планах') give.push({ kind: 'plan_done', ref: id });
    }
    if (r.src !== 'letterboxd' && isScored(r)) {
      if (textLen(r) >= 100 && !(o && textLen(o) >= 100 && isScored(o))) give.push({ kind: 'review', ref: id });
      if (isFull(r) && !(o && isFull(o))) give.push({ kind: 'rate_full', ref: id });
    }
  }
  for (const [id] of before) if (!after.has(id)) for (const kind of ['rate', 'import', 'review', 'rate_full', 'plan_done']) take.push({ kind, ref: id });
  const scored = [...after.values()].filter((r) => !r.example && isScored(r));
  const metrics = { cats: new Set(scored.map((r) => r.cat || r.catName).filter(Boolean)).size, strict: scored.filter((r) => +r.total <= 2).length };
  return { give, take, metrics };
}
// оценка поставлена ночью (2–5 часов по времени человека) — для скрытой ачивки
export const nightNow = (now, tz) => { if (!tz) return false; const h = hourIn(now, tz); return h >= 2 && h < 5; }; // без часового пояса не гадаем
