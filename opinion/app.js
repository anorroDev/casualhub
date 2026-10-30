'use strict';

/* ---------- Starter data ---------- */
const STARTERS = [
  { id: 'games', name: 'Игры', criteria: [
    { id: 'g-gameplay', name: 'Геймплей', desc: 'Насколько интересно играть' },
    { id: 'g-story', name: 'Сюжет', desc: 'История, персонажи, диалоги' },
    { id: 'g-visuals', name: 'Графика', desc: 'Картинка и визуальный стиль' },
    { id: 'g-audio', name: 'Звук и музыка', desc: 'Саундтрек, озвучка, эффекты' },
    { id: 'g-atmosphere', name: 'Атмосфера', desc: 'Погружение в мир игры' },
    { id: 'g-replay', name: 'Реиграбельность', desc: 'Хочется ли вернуться' },
    { id: 'g-ending', name: 'Концовка', desc: 'Насколько удался финал' },
    { id: 'g-tech', name: 'Техническое состояние', desc: 'Оптимизация, баги, вылеты' }
  ] },
  { id: 'films', name: 'Фильмы и сериалы', criteria: [
    { id: 'f-story', name: 'Сюжет', desc: 'Идея, сценарий, логика событий' },
    { id: 'f-acting', name: 'Актёрская игра', desc: 'Насколько веришь героям' },
    { id: 'f-direction', name: 'Режиссура', desc: 'Темп, постановка, монтаж' },
    { id: 'f-visuals', name: 'Визуал', desc: 'Операторская работа и эффекты' },
    { id: 'f-music', name: 'Музыка и звук', desc: 'Саундтрек и звуковое оформление' },
    { id: 'f-rewatch', name: 'Пересматриваемость', desc: 'Захочется ли посмотреть снова' }
  ] }
];
const NEW_CAT_CRITERIA = [
  { name: 'Общее впечатление', desc: 'Насколько понравилось в целом' },
  { name: 'Качество', desc: 'Исполнение и внимание к деталям' },
  { name: 'Цена и ценность', desc: 'Стоит ли своих денег и времени' }
];

// быстрые шаблоны: встроенные «Игры» и «Фильмы и сериалы» (чтобы вернуть удалённую) и дополнительные
function allTemplates() { return [...STARTERS, ...CAT_TEMPLATES]; }
// у встроенных свои постоянные id категории и критериев, как при первом запуске: старые оценки снова к ним привязываются
function tplCatId(t) { return t.id || tplId(t.name); }
function tplCriteria(t, catId) {
  const own = catId === tplCatId(t);
  return t.criteria.map((x, i) => ({ id: own ? (x.id || `${catId}-${i}`) : `${catId}-${i}`, name: x.name, desc: x.desc }));
}
const CAT_TEMPLATES = [
  { name: 'Музыка и альбомы', criteria: [
    { name: 'Звучание и продакшн', desc: 'Сведение, аранжировки, звук', w: 1 },
    { name: 'Мелодии и хуки', desc: 'Насколько заедает в голове', w: 1 },
    { name: 'Тексты и смысл', desc: 'Лирика, образы, подача', w: 1 },
    { name: 'Атмосфера и стиль', desc: 'Цельность настроения', w: 1 },
    { name: 'Репит-потенциал', desc: 'Хочется ли переслушивать', w: 1 }
  ]},
  { name: 'Книги', criteria: [
    { name: 'Сюжет и интрига', desc: 'Динамика и развитие истории', w: 1 },
    { name: 'Персонажи', desc: 'Глубина и развитие героев', w: 1 },
    { name: 'Язык и стиль', desc: 'Как легко и приятно читать', w: 1 },
    { name: 'Идеи и глубина', desc: 'Мысли и послевкусие', w: 1 },
    { name: 'Концовка', desc: 'Насколько удался финал', w: 1 }
  ]},
  { name: 'Еда и заведения', criteria: [
    { name: 'Вкус блюд', desc: 'Главное впечатление от кухни', w: 2 },
    { name: 'Качество продуктов', desc: 'Свежесть и подача', w: 1 },
    { name: 'Сервис', desc: 'Скорость и вежливость', w: 1 },
    { name: 'Интерьер и уют', desc: 'Атмосфера места', w: 1 },
    { name: 'Цена / качество', desc: 'Оправдан ли чек', w: 1 }
  ]},
  { name: 'Аниме и манга', criteria: [
    { name: 'Сюжет и лор', desc: 'Мир и интрига', w: 1 },
    { name: 'Рисовка и анимация', desc: 'Дизайн, сакуга, экшен', w: 1 },
    { name: 'Персонажи', desc: 'Харизма и химия героев', w: 1 },
    { name: 'ОСТ и сейю', desc: 'Опенинги, музыка, озвучка', w: 1 },
    { name: 'Эмоции', desc: 'Насколько сильно цепляет', w: 1 },
    { name: 'Концовка', desc: 'Насколько удался финал', w: 1 }
  ]},
  { name: 'Гаджеты и техника', criteria: [
    { name: 'Дизайн и сборка', desc: 'Материалы и эргономика', w: 1 },
    { name: 'Экран / Звук', desc: 'Качество мультимедиа', w: 1 },
    { name: 'Производительность', desc: 'Скорость и стабильность работы', w: 2 },
    { name: 'Автономность', desc: 'Батарея и зарядка', w: 1 },
    { name: 'Цена и ценность', desc: 'Конкурентоспособность', w: 1 }
  ]}
];

const MAX_CATS = 24;
// оценка из Letterboxd, ещё не переоценённая по критериям: один балл «Оценка с Letterboxd»
const LB_SCORE = 'lb-score';
const lbOnly = (r) => !!r && Array.isArray(r.scores) && r.scores.length > 0 && r.scores.every(s => s.id === LB_SCORE);
const fromLb = (r) => !!r && (r.src === 'letterboxd' || (Array.isArray(r.scores) && r.scores.some(s => s.id === LB_SCORE)));
const MAX_CRIT = 15;
const DRAFT_KEY = 'ocenshik.draft.v2';
const PREFS_KEY = 'ocenshik.prefs.v1';
const FB = 'Onest, ui-sans-serif, system-ui, sans-serif';
const FD = 'Handjet, Onest, ui-sans-serif, system-ui, sans-serif';

const svg = (inner, size = 16, sw = 1.8) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const ICON = {
  note: svg('<path d="M5.5 3.5h9l4 4v13h-13z"/><path d="M14.5 3.5v4h4"/><path d="M8.5 12h7M8.5 15.5h5"/>', 18),
  noteSm: svg('<path d="M5.5 3.5h9l4 4v13h-13z"/><path d="M8.5 12h7M8.5 15.5h5"/>', 14, 2),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 16, 2),
  trash: svg('<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>', 16),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 16),
  share: svg('<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>', 16),
  shareLg: svg('<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>', 18),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>', 18),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 18),
  unlink: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M4 4l16 16"/>', 18),
  scale: svg('<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/><path d="M19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>', 18),
  up: svg('<path d="M6 15l6-6 6 6"/>', 16, 2),
  down: svg('<path d="M6 9l6 6 6-6"/>', 16, 2),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 15, 2),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-4.5-4.5L7 19.5"/>', 16),
  imageLg: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-4.5-4.5L7 19.5"/>', 28, 1.6),
  chev: '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>'
};

const STORAGE_KEYS = {
  RATINGS: 'ocenshik.ratings.v2',
  CATS: 'ocenshik.cats.v2',
  LOG: 'ocenshik.log.v2',
  USERS: 'ocenshik.users.v1',
  USER: 'ocenshik.user.v1'
};

const AVATAR_COLORS = ['#3550E8', '#2EAD60', '#EAA92C', '#E4553F', '#9333EA', '#06B6D4', '#EC4899', '#F97316'];
function randomAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

const STARTER_RATINGS = [
  {
    id: 'ex-witcher3', cat: 'games', catName: 'Игры', name: 'The Witcher 3: Wild Hunt',
    fav: true, status: '✓ Завершено', meta: '2015 · RPG, Открытый мир',
    pros: 'Выдающиеся побочные квесты\nЖивой и атмосферный мир\nШикарные дополнения Hearts of Stone и Blood and Wine',
    cons: 'Плотва иногда застревает в заборах',
    scores: [
      { id: 'g-gameplay', name: 'Геймплей', v: 9, w: 1, note: 'Увлекательные бои и охота на чудовищ' },
      { id: 'g-story', name: 'Сюжет', v: 10, w: 1, note: 'Один из лучших сюжетов и квестов в жанре' },
      { id: 'g-visuals', name: 'Графика', v: 9, w: 1, note: 'Прекрасный визуальный стиль' },
      { id: 'g-audio', name: 'Звук и музыка', v: 10, w: 1, note: 'Невероятный саундтрек' },
      { id: 'g-atmosphere', name: 'Атмосфера', v: 10, w: 1 },
      { id: 'g-replay', name: 'Реиграбельность', v: 9, w: 1 },
      { id: 'g-tech', name: 'Техническое состояние', v: 8, w: 1 }
    ],
    note: 'Шедевр на все времена, эталон сюжетных ролевых игр.', example: true,
    author: { name: 'Гость' }
  },
  {
    id: 'ex-interstellar', cat: 'films', catName: 'Фильмы и сериалы', name: 'Интерстеллар (Interstellar)',
    fav: true, status: '✓ Завершено', meta: '2014 · Научная фантастика, Драма',
    pros: 'Мощнейший эмоциональный заряд\nГениальный саундтрек Ханса Циммера\nВизуализация космоса и Гаргантюа',
    cons: 'Хронометраж почти 3 часа пролетает слишком быстро',
    scores: [
      { id: 'f-story', name: 'Сюжет', v: 10, w: 1, note: 'Грандиозная научная фантастика' },
      { id: 'f-acting', name: 'Актёрская игра', v: 10, w: 1, note: 'Мэттью Макконахи на высоте' },
      { id: 'f-direction', name: 'Режиссура', v: 10, w: 1, note: 'Кристофер Нолан' },
      { id: 'f-visuals', name: 'Визуал', v: 10, w: 1, note: 'Визуализация черной дыры' },
      { id: 'f-music', name: 'Музыка и звук', v: 10, w: 1, note: 'Ханс Циммер — орган великолепен' },
      { id: 'f-rewatch', name: 'Пересматриваемость', v: 9, w: 1 }
    ],
    note: 'Один из самых сильных научно-фантастических фильмов в истории кино.', example: true,
    author: { name: 'Гость' }
  }
];

// новый базовый критерий «Концовка» добавляется в уже созданные «Игры» и «Аниме и мангу» один раз:
// если его потом удалить, он не вернётся
const MIG_KEY = 'ocenshik.mig.v1';
function migrateCats(items) {
  let done = {};
  try { done = JSON.parse(localStorage.getItem(MIG_KEY) || '{}') || {}; } catch (_) {}
  if (done.ending) return false;
  let changed = false;
  const animeId = tplId('Аниме и манга');
  for (const c of items) {
    const anime = c.id === animeId || keyOf(c.name) === keyOf('Аниме и манга');
    if (c.id !== 'games' && !anime) continue;
    if (c.criteria.length >= MAX_CRIT || c.criteria.some(k => keyOf(k.name) === keyOf('Концовка'))) continue;
    let id = c.id === 'games' ? 'g-ending' : `${c.id}-${c.criteria.length}`;
    if (c.criteria.some(k => k.id === id)) id = newId('c');
    c.criteria.push({ id, name: 'Концовка', desc: 'Насколько удался финал', w: 1 });
    changed = true;
  }
  done.ending = true;
  try { localStorage.setItem(MIG_KEY, JSON.stringify(done)); } catch (_) {}
  return changed;
}
// фото оценок — в IndexedDB (photo-store.js), в localStorage — только ссылка { ref: 'ph_…' }. Аватарку автора в каждую
// оценку тоже не копируем: своя показывается из профиля (renderAuthorMini). Так оценки занимают килобайты, а не мегабайты
const photoKeys = new Set(); // фото, которые уже точно лежат в IndexedDB
const photoBad = new Set();  // фото, которые в IndexedDB записать не вышло: они хранятся прямо в оценке
function photoDataOf(p) {
  if (!p) return '';
  if (typeof p.data === 'string' && p.data.startsWith('data:image/')) return p.data;
  return typeof p.id === 'string' && p.id.startsWith('data:image/') ? p.id : '';
}
function slimForStore(r) {
  const ph = r.photo, d = photoDataOf(ph);
  let photo = ph;
  const key = d && state.photoStore ? window.CasualPhotos.keyOf(d) : '';
  // фото не легло в IndexedDB (кончилось место и т. п.): оставляем его в самой оценке, иначе после перезагрузки осталась бы ссылка в никуда
  if (key && !photoBad.has(key)) {
    if (!photoKeys.has(key)) {
      photoKeys.add(key);
      window.CasualPhotos.put(key, d).then((ok) => {
        if (ok) return;
        photoKeys.delete(key);
        photoBad.add(key);
        try { saveLocalRatings(); } catch (e) {} // сразу пересохраняем: уже записанная ссылка заменится самим фото
      });
    }
    photo = { ref: key, w: ph.w || 0, h: ph.h || 0 };
  } else if (ph && ph.ref && !ph.data) photo = { ref: ph.ref, w: ph.w || 0, h: ph.h || 0 };
  const a = r.author;
  const author = a && typeof a.avatar === 'string' && a.avatar.startsWith('data:') ? Object.assign({}, a, { avatar: '' }) : a;
  return photo === ph && author === a ? r : Object.assign({}, r, { photo, author });
}
// фото из IndexedDB — обратно в оценки (до normalizeRating: ссылку без картинки он бы выбросил)
async function hydratePhotos(list) {
  if (!window.CasualPhotos) return;
  const keys = list.filter(r => r && r.photo && window.CasualPhotos.isKey(r.photo.ref) && !r.photo.data).map(r => r.photo.ref);
  if (!keys.length) return;
  const got = await window.CasualPhotos.getMany(keys);
  for (const r of list) {
    const k = r && r.photo && r.photo.ref;
    if (!k || !got[k]) continue;
    photoKeys.add(k);
    r.photo = { id: got[k], data: got[k], w: r.photo.w || 0, h: r.photo.h || 0 };
  }
}
let storageWarned = 0;
function saveLocalRatings() {
  try { localStorage.setItem(STORAGE_KEYS.RATINGS, JSON.stringify(state.ratings.map(slimForStore))); }
  catch (e) {
    console.error('Save ratings error:', e);
    // молча терять оценки нельзя: говорим, но не чаще раза в минуту
    if (Date.now() - storageWarned > 60e3) { storageWarned = Date.now(); toast('В браузере не хватает места: последние изменения не сохранились здесь. Если вошёл в аккаунт, они уже ушли на сервер'); }
  }
}
function saveLocalCats() {
  try { localStorage.setItem(STORAGE_KEYS.CATS, JSON.stringify(serializeCats())); }
  catch (e) { console.error('Save cats error:', e); }
}
function saveLocalLog() {
  try { localStorage.setItem(STORAGE_KEYS.LOG, JSON.stringify(LOG.entries.slice(0, 400))); }
  catch (e) { console.error('Save log error:', e); }
}

const EYE_OPEN_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const CAMERA_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

let authActiveTab = 'login';
let regSelectedAvatar = '';
let regSelectedColor = '#3550E8';
let editSelectedAvatar = '';
let editSelectedColor = '';

function calcPasswordStrength(pass) {
  if (!pass) return { score: 0, text: 'Впиши пароль', color: 'transparent', width: '0%' };
  let score = 0;
  if (pass.length >= 4) score += 1;
  if (pass.length >= 8) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  if (score <= 1) return { score: 1, text: 'Слабый пароль', color: 'var(--bad)', width: '25%' };
  if (score <= 3) return { score: 2, text: 'Средний пароль: добавь цифры или знаки', color: 'var(--mid)', width: '65%' };
  return { score: 3, text: 'Отличный надёжный пароль! 👍', color: 'var(--good)', width: '100%' };
}

function processAvatarFile(file, callback) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    toast('Нужна картинка: JPG или PNG');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('Файл слишком большой (макс. 8 МБ)');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 160;
      let w = img.width, h = img.height;
      if (w > h) {
        if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
      } else {
        if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      callback(dataUrl);
    };
    img.onerror = () => toast('Не удалось прочитать изображение');
    img.src = e.target.result;
  };
  reader.onerror = () => toast('Ошибка чтения файла');
  reader.readAsDataURL(file);
}

// анимированная аватарка (её ставят в профиле) хранится отдельно и показывается, пока статичная та же
function shownAvatar(u) {
  try {
    const a = JSON.parse(localStorage.getItem('casualhub.avatarAnim.v1') || '{}')[u.id];
    if (a && a.data && typeof u.avatar === 'string' && a.sig === u.avatar.slice(-48)) return a.data;
  } catch (e) {}
  return u.avatar;
}
function renderAuthorMini(author) {
  if (!author) return '👤';
  // своя аватарка в оценках не хранится (место в браузере), берём её из профиля
  const av = !author.avatar && state.user && author.id && author.id === state.user.id ? state.user.avatar || '' : author.avatar || '';
  const isImg = av && (av.startsWith('data:image/') || av.startsWith('http://') || av.startsWith('https://'));
  if (isImg) {
    return `<span class="author-mini-avatar" style="background-image:url('${esc(av)}');"></span>`;
  }
  return '👤';
}

const HANDLE_RE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const HANDLE_HINT = 'Юзернейм: от 3 до 20 символов, латинские буквы, цифры, «_» и «.»';
const cleanHandle = (s) => String(s || '').trim().replace(/^@+/, '').toLowerCase();
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
function suggestHandle(name) {
  return Array.from(String(name || '').toLowerCase()).map(c => (TRANSLIT[c] != null ? TRANSLIT[c] : c)).join('')
    .replace(/[\s-]+/g, '_').replace(/[^a-z0-9_.]/g, '').replace(/_{2,}/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 20);
}

function loadUsers() {
  try {
    state.users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    state.users.forEach(u => {
      if (!u.avatar) u.avatar = (u.name ? u.name.charAt(0).toUpperCase() : '👤');
      if (!u.color) u.color = randomAvatarColor(u.name || 'user');
      if (!u.email) u.email = '';
    });
    const cur = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null');
    if (cur && cur.id) {
      state.user = state.users.find(u => u.id === cur.id) || cur;
      if (!state.user.avatar) state.user.avatar = (state.user.name ? state.user.name.charAt(0).toUpperCase() : '👤');
      if (!state.user.color) state.user.color = randomAvatarColor(state.user.name || 'user');
      if (!state.user.email) state.user.email = '';
    }
  } catch (_) { state.users = []; state.user = null; }
}

function saveUsers() {
  try {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
    if (state.user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(state.user));
    else localStorage.removeItem(STORAGE_KEYS.USER);
  } catch (_) {}
}

function registerUser(username, email, password, avatar, color, handle) {
  username = (username || '').trim();
  handle = cleanHandle(handle);
  if (handle && !HANDLE_RE.test(handle)) { toast(HANDLE_HINT); return false; }
  email = (email || '').trim().toLowerCase();
  password = (password || '').trim();

  if (username.length < 2) { toast('Ник: минимум 2 символа'); return false; }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    toast('Нужна почта, например name@mail.com'); return false;
  }
  if (state.users.some(u => u.email && u.email.toLowerCase() === email)) {
    toast('Эта почта уже привязана к другому аккаунту'); return false;
  }

  if (password.length < 8) {
    toast('Пароль должен содержать минимум 8 символов'); return false;
  }

  const u = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: username,
    email,
    handle: handle || '',
    pass: password,
    avatar: avatar || username.charAt(0).toUpperCase(),
    color: color || '#3550E8',
    createdAt: new Date().toISOString()
  };

  state.users.push(u);
  state.user = u;
  saveUsers();
  renderUserBar();
  renderBoard();
  toast(`Добро пожаловать в клуб, ${username}! 🎉`);
  closeAuthModal();
  return true;
}

function loginUser(identifier, password) {
  identifier = (identifier || '').trim().toLowerCase();
  password = (password || '').trim();
  if (!identifier) { toast('Впиши почту или @юзернейм'); return false; }

  const u = state.users.find(x =>
    (x.name && x.name.toLowerCase() === identifier) ||
    (x.email && x.email.toLowerCase() === identifier) ||
    (x.handle && x.handle === identifier.replace(/^@+/, ''))
  );

  if (!u) { toast('Такого аккаунта нет. Зарегистрируйся'); return false; }
  if (u.pass && u.pass !== password) {
    toast('Неверный пароль, попробуй ещё раз'); return false;
  }

  state.user = u;
  saveUsers();
  renderUserBar();
  renderBoard();
  toast(`Вход выполнен: ${u.name}`);
  closeAuthModal();
  return true;
}

function updateUserProfile(username, email, password, avatar, color, handle) {
  if (!state.user) return false;
  username = (username || '').trim();
  email = (email || '').trim().toLowerCase();
  password = (password || '').trim();

  if (username.length < 2) { toast('Ник: минимум 2 символа'); return false; }

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { toast('Нужна почта, например name@mail.com'); return false; }
    if (state.users.some(u => u.id !== state.user.id && u.email && u.email.toLowerCase() === email)) {
      toast('Эта почта уже привязана к другому аккаунту'); return false;
    }
  }

  state.user.name = username;
  if (email) state.user.email = email;
  if (handle != null && HANDLE_RE.test(cleanHandle(handle))) state.user.handle = cleanHandle(handle);
  if (password) state.user.pass = password;
  if (avatar !== undefined) state.user.avatar = avatar;
  if (color) state.user.color = color;

  const idx = state.users.findIndex(u => u.id === state.user.id);
  if (idx >= 0) state.users[idx] = state.user;

  // Sync ratings created by user
  state.ratings.forEach(r => {
    if (r.author && r.author.id === state.user.id) {
      r.author.name = state.user.name;
      r.author.avatar = state.user.avatar;
      r.author.color = state.user.color;
    }
  });
  saveLocalRatings();

  saveUsers();
  renderUserBar();
  renderBoard();
  toast('Профиль обновлён ✨');
  authActiveTab = 'profile';
  renderAuthModal();
  return true;
}

function logoutUser() {
  state.user = null;
  saveUsers();
  renderUserBar();
  renderBoard();
  toast('Выход выполнен');
  authActiveTab = 'login';
  renderAuthModal();
}

function switchUser(id) {
  const u = state.users.find(x => x.id === id);
  if (u) {
    state.user = u;
    saveUsers();
    renderUserBar();
    renderBoard();
    toast(`Переключено на ${u.name}`);
    closeAuthModal();
  }
}

function renderUserBar() {
  if (!el.userBar) return;
  if (state.user) {
    const isImg = state.user.avatar && (state.user.avatar.startsWith('data:image/') || state.user.avatar.startsWith('http://') || state.user.avatar.startsWith('https://'));
    const avStyle = isImg
      ? `background-image: url('${esc(shownAvatar(state.user))}');`
      : `background-color: ${esc(state.user.color || '#3550E8')};`;
    const avContent = isImg ? '' : esc(state.user.name.charAt(0).toUpperCase());
    el.userBar.innerHTML = `
      <a class="user-pill" id="userPill" href="/profile/" title="Мой профиль">
        <span class="user-avatar" style="${avStyle}">${avContent}</span>
        <span class="user-name">${esc(state.user.name)}</span>
      </a>`;
    // кнопка справа вверху на всех страницах ведёт в профиль; настройки аккаунта — в профиле, «Настроить профиль»
  } else {
    el.userBar.innerHTML = `<button type="button" class="btn ghost small" id="authBtn"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="5.5" r="3"/><path d="M2.5 14c.8-2.8 3-4.2 5.5-4.2s4.7 1.4 5.5 4.2"/></svg>Войти<span class="ab-more"> / Профиль</span></button>`;
    const btn = $('authBtn');
    if (btn) btn.addEventListener('click', () => openAuthModal('login'));
  }
}

// черновик входа и регистрации: введённое не пропадает, если окно закрыли или нажали мимо.
// Пароль не храним — его запоминает сам браузер
const AUTH_DRAFT_KEY = 'ocenshik.authDraft.v1';
function authDraft() { try { return JSON.parse(localStorage.getItem(AUTH_DRAFT_KEY) || '{}') || {}; } catch (_) { return {}; } }
function saveAuthDraft(part, data) { try { const d = authDraft(); d[part] = Object.assign({}, d[part], data); localStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify(d)); } catch (_) {} }
function clearAuthDraft(part) { try { const d = authDraft(); delete d[part]; localStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify(d)); } catch (_) {} }
// в форме что-то введено — клик мимо окна его не закрывает (туда же попадает клик по подсказке браузера)
function authHasInput() { return [...el.authBody.querySelectorAll('input:not([type="file"]):not([type="checkbox"])')].some(i => i.value.trim()); }
function openAuthModal(tab) {
  // настройки открываются с текущими аватаром и цветом профиля
  if (tab === 'edit' && state.user) { editSelectedAvatar = state.user.avatar || ''; editSelectedColor = state.user.color || '#3550E8'; }
  if (tab === 'edit' && !state.user) tab = 'login';
  if (tab) authActiveTab = tab;
  else if (state.user) authActiveTab = 'profile';
  else authActiveTab = 'login';
  renderAuthModal();
  el.authModal.hidden = false;
  document.documentElement.classList.add('locked');
}

function closeAuthModal() {
  el.authModal.hidden = true;
  document.documentElement.classList.remove('locked');
}

function renderAuthModal() {
  if (!el.authBody) return;

  if (state.user && authActiveTab === 'edit') {
    editSelectedAvatar = (editSelectedAvatar !== undefined && editSelectedAvatar !== null) ? editSelectedAvatar : (state.user.avatar || '');
    editSelectedColor = editSelectedColor || state.user.color || '#3550E8';
    const isImg = editSelectedAvatar && (editSelectedAvatar.startsWith('data:image/') || editSelectedAvatar.startsWith('http://') || editSelectedAvatar.startsWith('https://'));

    el.authTitle.textContent = 'Настройки профиля';
    el.authBody.innerHTML = `
      <form class="auth-form" id="formEditProfile">
        <div class="avatar-upload-box">
          <div class="avatar-upload-trigger" id="editAvatarTrigger" role="button" tabindex="0" title="Нажмите на камеру, чтобы выбрать фото">
            <div class="avatar-preview-circle" id="editAvatarCircle" style="${isImg ? `background-image:url('${esc(editSelectedAvatar)}');` : `background-color:${esc(editSelectedColor)};`}">
              <span id="editAvatarInitial">${isImg ? '' : esc(state.user.name.charAt(0).toUpperCase())}</span>
            </div>
            <div class="avatar-camera-badge" title="Сменить аватарку">
              ${CAMERA_SVG}
            </div>
          </div>
          <input type="file" id="editAvatarFile" accept="image/*" class="vh">
          <div class="avatar-upload-info">
            <label for="editAvatarFile" class="avatar-upload-label">
              ${CAMERA_SVG}
              Сменить аватарку
            </label>
            <span class="auth-help" id="editAvatarStatus">${isImg ? 'Своё фото установлено ✓' : 'Нажми на камеру, чтобы поставить своё фото'}</span>
            <button type="button" class="avatar-remove-btn" id="btnRemoveEditAvatar"${isImg ? '' : ' hidden'}>✕ Удалить фото</button>
          </div>
        </div>

        <div class="auth-field">
          <label for="inputEditName">Ник</label>
          <input type="text" id="inputEditName" value="${esc(state.user.name)}" required minlength="2" maxlength="24">
          <span class="auth-help">Так тебя видят все. Может совпадать с чужим ником.</span>
        </div>
        ${state.user.handle ? `<div class="auth-field">
          <label for="inputEditHandle">Юзернейм</label>
          <div class="handle-wrap"><span>@</span><input type="text" id="inputEditHandle" value="${esc(state.user.handle)}" required minlength="3" maxlength="21" autocapitalize="none" autocorrect="off" spellcheck="false"></div>
          <span class="auth-help">По нему тебя находят друзья и по нему можно войти. Латиница, цифры, «_» и «.».</span>
        </div>` : ''}
        <div class="auth-field">
          <label for="inputEditEmail">Почта</label>
          <input type="email" id="inputEditEmail" value="${esc(state.user.email || '')}" placeholder="name@domain.com">
        </div>
        <div class="auth-field">
          <label for="inputEditPass">Новый пароль (оставь пустым, если не меняешь)</label>
          <div class="pwd-wrap">
            <input type="password" id="inputEditPass" autocomplete="new-password" placeholder="Новый пароль">
            <button type="button" class="pwd-toggle" id="btnToggleEditPass" aria-label="Показать/скрыть пароль">${EYE_OPEN_SVG}</button>
          </div>
        </div>
        ${state.user.serverId ? `<div class="auth-field">
          <label for="inputEditCurPass">Текущий пароль</label>
          <input type="password" id="inputEditCurPass" autocomplete="current-password" placeholder="Нужен, только если меняешь почту или пароль">
        </div>` : ''}

        <div style="display:flex;gap:8px;margin-top:6px;">
          <button type="button" class="btn ghost" id="btnCancelEdit" style="flex:1;">Отмена</button>
          <button type="submit" class="btn primary" style="flex:1;">Сохранить</button>
        </div>
      </form>
    `;

    const trigger = $('editAvatarTrigger');
    const fileInput = $('editAvatarFile');
    const circle = $('editAvatarCircle');
    const initialSpan = $('editAvatarInitial');
    const statusSpan = $('editAvatarStatus');
    const removeBtn = $('btnRemoveEditAvatar');

    if (trigger && fileInput) {
      trigger.addEventListener('click', () => fileInput.click());
      trigger.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
      fileInput.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          processAvatarFile(file, dataUrl => {
            editSelectedAvatar = dataUrl;
            circle.style.backgroundImage = `url('${dataUrl}')`;
            initialSpan.textContent = '';
            statusSpan.textContent = 'Новое фото загружено ✓';
            removeBtn.hidden = false;
          });
        }
        e.target.value = '';
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        editSelectedAvatar = '';
        circle.style.backgroundImage = 'none';
        circle.style.backgroundColor = editSelectedColor;
        initialSpan.textContent = $('inputEditName').value.trim().charAt(0).toUpperCase() || '👤';
        statusSpan.textContent = 'Фото удалено (используется буква)';
        removeBtn.hidden = true;
      });
    }

    $('inputEditName').addEventListener('input', () => {
      if (!editSelectedAvatar) {
        initialSpan.textContent = $('inputEditName').value.trim().charAt(0).toUpperCase() || '👤';
      }
    });

    const toggleBtn = $('btnToggleEditPass');
    const passInput = $('inputEditPass');
    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', () => {
        const isPwd = passInput.type === 'password';
        passInput.type = isPwd ? 'text' : 'password';
        toggleBtn.innerHTML = isPwd ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
      });
    }

    $('btnCancelEdit').addEventListener('click', () => {
      authActiveTab = 'profile';
      renderAuthModal();
    });

    $('formEditProfile').addEventListener('submit', e => {
      e.preventDefault();
      const finalAvatar = editSelectedAvatar || $('inputEditName').value.trim().charAt(0).toUpperCase();
      updateUserProfile($('inputEditName').value, $('inputEditEmail').value, $('inputEditPass').value, finalAvatar, editSelectedColor, $('inputEditHandle') ? $('inputEditHandle').value : undefined, $('inputEditCurPass') ? $('inputEditCurPass').value : '');
    });
    return;
  }

  if (state.user && authActiveTab !== 'login' && authActiveTab !== 'reg') {
    const userRatings = state.ratings.filter(r => r.author && r.author.id === state.user.id);
    const userRatingsCount = userRatings.length;
    const userFavCount = userRatings.filter(r => r.fav).length;
    const ratedWithScore = userRatings.filter(r => typeof r.total === 'number' && !isNaN(r.total));
    const userAvg = ratedWithScore.length ? (ratedWithScore.reduce((acc, r) => acc + r.total, 0) / ratedWithScore.length).toFixed(1) : '—';
    const dateStr = fmtDateLong(state.user.createdAt) || 'недавно';
    const otherUsers = state.users.filter(u => u.id !== state.user.id);

    const isImg = state.user.avatar && (state.user.avatar.startsWith('data:image/') || state.user.avatar.startsWith('http://') || state.user.avatar.startsWith('https://'));
    const avStyle = isImg
      ? `background-image: url('${esc(shownAvatar(state.user))}');`
      : `background-color: ${esc(state.user.color || '#3550E8')};`;
    const avContent = isImg ? '' : esc(state.user.name.charAt(0).toUpperCase());

    el.authTitle.textContent = 'Мой профиль';
    el.authBody.innerHTML = `
      <div class="profile-card">
        <div class="profile-head">
          <div class="profile-avatar-wrap" id="profileAvatarTrigger" role="button" tabindex="0" title="Нажмите на камеру, чтобы сменить фото">
            <div class="profile-avatar" style="${avStyle}">
              ${avContent}
            </div>
            <div class="avatar-camera-badge" title="Сменить фото">
              ${CAMERA_SVG}
            </div>
          </div>
          <input type="file" id="profileQuickAvatarFile" accept="image/*" class="vh">
          <div class="profile-titles">
            <h4 class="profile-name">${esc(state.user.name)}</h4>
            ${state.user.handle ? `<span class="profile-handle">@${esc(state.user.handle)}</span>` : ''}
            ${state.user.email ? `<div class="profile-email-tag">✉ ${esc(state.user.email)}</div>` : '<div class="profile-meta">Почта не указана</div>'}
            <div class="profile-meta">В клубе с ${esc(dateStr)}</div>
          </div>
        </div>

        <div class="profile-stats-grid">
          <div class="profile-stat-item">
            <div class="profile-stat-val">${userRatingsCount}</div>
            <div class="profile-stat-lbl">Оценок</div>
          </div>
          <div class="profile-stat-item">
            <div class="profile-stat-val">${userFavCount}</div>
            <div class="profile-stat-lbl">В избранном</div>
          </div>
          <div class="profile-stat-item">
            <div class="profile-stat-val">${userAvg}</div>
            <div class="profile-stat-lbl">Средний балл</div>
          </div>
        </div>

        <a class="btn primary small" href="/profile/" style="width:100%;margin-bottom:8px;text-decoration:none;">Открыть страницу профиля</a>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn ghost small" id="btnEditProfile" style="flex:1;">✏️ Настроить профиль</button>
          <button type="button" class="btn ghost danger small" id="btnLogoutUser" style="flex:1;">🚪 Выйти</button>
        </div>
      </div>

      ${otherUsers.length ? `
        <div class="auth-switch-list">
          <p class="label">Другие профили на этом устройстве</p>
          ${otherUsers.map(u => {
            const uIsImg = u.avatar && (u.avatar.startsWith('data:image/') || u.avatar.startsWith('http://') || u.avatar.startsWith('https://'));
            const uStyle = uIsImg
              ? `background-image: url('${esc(u.avatar)}');`
              : `background-color: ${esc(u.color || '#3550E8')};`;
            const uContent = uIsImg ? '' : esc(u.name.charAt(0).toUpperCase());
            return `
              <div class="auth-switch-item" data-switch-id="${esc(u.id)}">
                <div class="auth-switch-user">
                  <span class="user-avatar" style="${uStyle}">${uContent}</span>
                  <div class="auth-switch-info">
                    <span class="auth-switch-name">${esc(u.name)}</span>
                    ${u.email ? `<span class="auth-switch-email">${esc(u.email)}</span>` : ''}
                  </div>
                </div>
                <span class="btn text small" style="pointer-events:none;">Переключить</span>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      <div style="margin-top:10px;">
        <button type="button" class="btn ghost small" id="btnAddAccount" style="width:100%;">➕ Войти в другой аккаунт</button>
      </div>

      <div class="backup-section">
        <h4 class="backup-title">Резервная копия данных</h4>
        <div class="backup-actions">
          <button type="button" class="btn ghost small" id="btnExportBackup">💾 Скачать копию (JSON)</button>
          <label class="btn ghost small" for="fileImportBackup" style="cursor:pointer;">📥 Восстановить из файла</label>
          <input type="file" id="fileImportBackup" accept=".json" class="vh">
          <button type="button" class="btn ghost small" data-lb-open>🎬 Импорт из Letterboxd</button>
        </div>
      </div>
    `;

    const avatarTrigger = $('profileAvatarTrigger');
    const quickFile = $('profileQuickAvatarFile');
    if (avatarTrigger && quickFile) {
      avatarTrigger.addEventListener('click', () => quickFile.click());
      avatarTrigger.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); quickFile.click(); } });
      quickFile.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          processAvatarFile(file, dataUrl => {
            updateUserProfile(state.user.name, state.user.email, '', dataUrl, state.user.color);
            toast('Аватарка успешно обновлена! 📷');
          });
        }
        e.target.value = '';
      });
    }

    $('btnEditProfile').addEventListener('click', () => {
      editSelectedAvatar = state.user.avatar || '';
      editSelectedColor = state.user.color || '#3550E8';
      authActiveTab = 'edit';
      renderAuthModal();
    });

    $('btnLogoutUser').addEventListener('click', logoutUser);

    $('btnAddAccount').addEventListener('click', () => {
      authActiveTab = 'login';
      renderAuthModal();
    });

    const btnExport = $('btnExportBackup');
    if (btnExport) btnExport.addEventListener('click', exportBackup);
    const fileImport = $('fileImportBackup');
    if (fileImport) fileImport.addEventListener('change', handleBackupImport);

    el.authBody.querySelectorAll('[data-switch-id]').forEach(item => {
      item.addEventListener('click', () => switchUser(item.dataset.switchId));
    });
    return;
  }

  // Not logged in: Show Login / Registration
  el.authTitle.textContent = authActiveTab === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт';
  const dr = authDraft(), dl = dr.login || {}, dg = dr.reg || {};
  const regIsImg = regSelectedAvatar && (regSelectedAvatar.startsWith('data:image/') || regSelectedAvatar.startsWith('http://') || regSelectedAvatar.startsWith('https://'));

  el.authBody.innerHTML = `
    <div class="auth-tabs">
      <button type="button" class="auth-tab${authActiveTab === 'login' ? ' active' : ''}" data-tab="login">Вход</button>
      <button type="button" class="auth-tab${authActiveTab === 'reg' ? ' active' : ''}" data-tab="reg">Регистрация</button>
    </div>

    ${authActiveTab === 'login' ? `
      <form class="auth-form" id="formLogin">
        <div class="auth-field">
          <label for="inputLoginIdent">Почта или @юзернейм</label>
          <input type="text" id="inputLoginIdent" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required placeholder="name@domain.com или @юзернейм" value="${esc(dl.ident || '')}">
        </div>
        <div class="auth-field">
          <label for="inputLoginPass">Пароль</label>
          <div class="pwd-wrap">
            <input type="password" id="inputLoginPass" autocomplete="current-password" placeholder="Пароль">
            <button type="button" class="pwd-toggle" id="btnToggleLoginPass" aria-label="Показать/скрыть пароль">${EYE_OPEN_SVG}</button>
          </div>
        </div>
        <button type="submit" class="btn primary" style="margin-top:4px;">Войти</button>
        <div class="auth-guest-row">
          <button type="button" class="btn text small" id="btnGuestLogin">${state.user ? '← Назад к профилю' : 'Продолжить как гость'}</button>
        </div>
      </form>

      ${state.users.length ? `
        <div class="auth-switch-list">
          <p class="label">Быстрый вход на этом устройстве</p>
          ${state.users.map(u => {
            const uIsImg = u.avatar && (u.avatar.startsWith('data:image/') || u.avatar.startsWith('http://') || u.avatar.startsWith('https://'));
            const uStyle = uIsImg
              ? `background-image: url('${esc(u.avatar)}');`
              : `background-color: ${esc(u.color || '#3550E8')};`;
            const uContent = uIsImg ? '' : esc(u.name.charAt(0).toUpperCase());
            return `
              <div class="auth-switch-item" data-switch-id="${esc(u.id)}">
                <div class="auth-switch-user">
                  <span class="user-avatar" style="${uStyle}">${uContent}</span>
                  <div class="auth-switch-info">
                    <span class="auth-switch-name">${esc(u.name)}</span>
                    ${u.email ? `<span class="auth-switch-email">${esc(u.email)}</span>` : ''}
                  </div>
                </div>
                <span class="btn text small" style="pointer-events:none;">Войти</span>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    ` : `
      <form class="auth-form" id="formReg">
        <div class="avatar-upload-box">
          <div class="avatar-upload-trigger" id="regAvatarTrigger" role="button" tabindex="0" title="Нажмите на камеру, чтобы выбрать фото">
            <div class="avatar-preview-circle" id="regAvatarCircle" style="${regIsImg ? `background-image:url('${esc(regSelectedAvatar)}');` : `background-color:${esc(regSelectedColor)};`}">
              <span id="regAvatarInitial">${regIsImg ? '' : '👤'}</span>
            </div>
            <div class="avatar-camera-badge" title="Загрузить фото">
              ${CAMERA_SVG}
            </div>
          </div>
          <input type="file" id="regAvatarFile" accept="image/*" class="vh">
          <div class="avatar-upload-info">
            <label for="regAvatarFile" class="avatar-upload-label">
              ${CAMERA_SVG}
              Выбрать аватарку
            </label>
            <span class="auth-help" id="regAvatarStatus">${regIsImg ? 'Фотография выбрана ✓' : 'Нажми на камеру, чтобы поставить своё фото'}</span>
            <button type="button" class="avatar-remove-btn" id="btnRemoveRegAvatar"${regIsImg ? '' : ' hidden'}>✕ Удалить фото</button>
          </div>
        </div>

        <div class="auth-field">
          <label for="inputRegName">Ник</label>
          <input type="text" id="inputRegName" name="nickname" autocomplete="nickname" required placeholder="Например, Алекс" minlength="2" maxlength="24" value="${esc(dg.name || '')}">
          <span class="auth-help">Так тебя видят все, может совпадать с чужим. Буквы, цифры, пробел, точка, дефис или подчёркивание.</span>
        </div>

        <div class="auth-field">
          <label for="inputRegHandle">Юзернейм</label>
          <div class="handle-wrap"><span>@</span><input type="text" id="inputRegHandle" name="casual-handle" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" required placeholder="aleks" minlength="3" maxlength="21" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(dg.handle || '')}"></div>
          <span class="auth-help">Твой @ для друзей и для входа, у каждого свой. Латиница, цифры, «_» и «.», потом можно сменить.</span>
        </div>

        <div class="auth-field">
          <label for="inputRegEmail">Почта</label>
          <input type="email" id="inputRegEmail" name="email" autocomplete="username" required placeholder="name@domain.com" value="${esc(dg.email || '')}">
          <span class="auth-help">По почте можно входить вместо @юзернейма. Её видишь только ты.</span>
        </div>

        <div class="auth-field">
          <label for="inputRegPass">Пароль</label>
          <div class="pwd-wrap">
            <input type="password" id="inputRegPass" autocomplete="new-password" placeholder="Минимум 8 символов" required minlength="8">
            <button type="button" class="pwd-toggle" id="btnToggleRegPass" aria-label="Показать/скрыть пароль">${EYE_OPEN_SVG}</button>
          </div>
          <div class="pwd-meter" id="regPwdMeter">
            <div class="pwd-meter-bar"><div class="pwd-meter-fill" id="regPwdFill"></div></div>
            <div class="pwd-meter-info"><span id="regPwdText">Впиши пароль</span></div>
          </div>
        </div>

        <button type="submit" class="btn primary" style="margin-top:6px;">Создать аккаунт</button>
        <div class="auth-guest-row">
          <button type="button" class="btn text small" id="btnGuestReg">${state.user ? '← Назад к профилю' : 'Продолжить как гость'}</button>
        </div>
      </form>
    `}

    <div class="backup-section">
      <h4 class="backup-title">Резервная копия базы</h4>
      <div class="backup-actions">
        <button type="button" class="btn ghost small" id="btnExportBackup">💾 Скачать базу (JSON)</button>
        <label class="btn ghost small" for="fileImportBackup" style="cursor:pointer;">📥 Загрузить базу</label>
        <input type="file" id="fileImportBackup" accept=".json" class="vh">
        <button type="button" class="btn ghost small" data-lb-open>🎬 Импорт из Letterboxd</button>
      </div>
    </div>
  `;

  el.authBody.querySelectorAll('.auth-tab').forEach(b => {
    b.addEventListener('click', () => { authActiveTab = b.dataset.tab; renderAuthModal(); });
  });

  const guestBtn = $('btnGuestLogin') || $('btnGuestReg');
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      if (state.user) { authActiveTab = 'profile'; renderAuthModal(); return; }
      closeAuthModal();
      toast('Режим гостя: оценки хранятся только на этом устройстве');
    });
  }

  // Login Form listeners
  const formLogin = $('formLogin');
  if (formLogin) {
    const toggleBtn = $('btnToggleLoginPass');
    const passInput = $('inputLoginPass');
    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', () => {
        const isPwd = passInput.type === 'password';
        passInput.type = isPwd ? 'text' : 'password';
        toggleBtn.innerHTML = isPwd ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
      });
    }
    $('inputLoginIdent').addEventListener('input', e => saveAuthDraft('login', { ident: e.target.value.trim().slice(0, 120) }));
    formLogin.addEventListener('submit', e => {
      e.preventDefault();
      saveAuthDraft('login', { ident: $('inputLoginIdent').value.trim().slice(0, 120) }); // логин запоминается и после входа
      loginUser($('inputLoginIdent').value, $('inputLoginPass').value);
    });
  }

  // Registration Form listeners
  const formReg = $('formReg');
  if (formReg) {
    const trigger = $('regAvatarTrigger');
    const fileInput = $('regAvatarFile');
    const circle = $('regAvatarCircle');
    const initialSpan = $('regAvatarInitial');
    const statusSpan = $('regAvatarStatus');
    const removeBtn = $('btnRemoveRegAvatar');

    if (trigger && fileInput) {
      trigger.addEventListener('click', () => fileInput.click());
      trigger.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
      fileInput.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          processAvatarFile(file, dataUrl => {
            regSelectedAvatar = dataUrl;
            circle.style.backgroundImage = `url('${dataUrl}')`;
            initialSpan.textContent = '';
            statusSpan.textContent = 'Фотография выбрана ✓';
            removeBtn.hidden = false;
          });
        }
        e.target.value = '';
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        regSelectedAvatar = '';
        circle.style.backgroundImage = 'none';
        circle.style.backgroundColor = regSelectedColor;
        initialSpan.textContent = $('inputRegName').value.trim().charAt(0).toUpperCase() || '👤';
        statusSpan.textContent = 'Нажми на камеру, чтобы поставить своё фото';
        removeBtn.hidden = true;
      });
    }

    // юзернейм подсказывается из ника, пока его не поправили руками
    const handleInput = $('inputRegHandle');
    let handleTouched = !!dg.handleTouched;
    const keepReg = () => saveAuthDraft('reg', { name: $('inputRegName').value.slice(0, 24), handle: handleInput.value.slice(0, 21), email: $('inputRegEmail').value.trim().slice(0, 120), handleTouched });
    handleInput.addEventListener('input', () => { handleTouched = !!handleInput.value; keepReg(); });
    $('inputRegEmail').addEventListener('input', keepReg);
    $('inputRegName').addEventListener('input', () => {
      if (!regSelectedAvatar) {
        initialSpan.textContent = $('inputRegName').value.trim().charAt(0).toUpperCase() || '👤';
      }
      if (!handleTouched) handleInput.value = suggestHandle($('inputRegName').value);
      keepReg();
    });
    if (!regSelectedAvatar && dg.name) initialSpan.textContent = dg.name.trim().charAt(0).toUpperCase() || '👤';

    const passInput = $('inputRegPass');
    const toggleBtn = $('btnToggleRegPass');
    const meterFill = $('regPwdFill');
    const meterText = $('regPwdText');

    if (passInput) {
      passInput.addEventListener('input', () => {
        const strInfo = calcPasswordStrength(passInput.value);
        if (meterFill) {
          meterFill.style.width = strInfo.width;
          meterFill.style.backgroundColor = strInfo.color;
        }
        if (meterText) meterText.textContent = strInfo.text;
      });
    }

    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', () => {
        const isPwd = passInput.type === 'password';
        passInput.type = isPwd ? 'text' : 'password';
        toggleBtn.innerHTML = isPwd ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
      });
    }

    formReg.addEventListener('submit', e => {
      e.preventDefault();
      const finalAvatar = regSelectedAvatar || $('inputRegName').value.trim().charAt(0).toUpperCase();
      Promise.resolve(registerUser($('inputRegName').value, $('inputRegEmail').value, $('inputRegPass').value, finalAvatar, regSelectedColor, $('inputRegHandle').value))
        .then(ok => { if (ok) { clearAuthDraft('reg'); saveAuthDraft('login', { ident: $('inputRegEmail') ? $('inputRegEmail').value.trim() : '' }); } }, () => {});
    });
  }

  const btnExport = $('btnExportBackup');
  if (btnExport) btnExport.addEventListener('click', exportBackup);
  const fileImport = $('fileImportBackup');
  if (fileImport) fileImport.addEventListener('change', handleBackupImport);

  el.authBody.querySelectorAll('[data-switch-id]').forEach(item => {
    item.addEventListener('click', () => switchUser(item.dataset.switchId));
  });
}


function exportBackup() {
  const data = {
    version: 2,
    appName: 'Мнение Казуала',
    exportedAt: new Date().toISOString(),
    ratings: state.ratings,
    categories: serializeCats(),
    users: state.users.map(({ pass, ...u }) => u), // пароль в файл не попадает: файл могут и переслать
    log: LOG.entries
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `opinion-backup-${new Date().toISOString().slice(0, 10)}.json`;
  // ссылка должна быть на странице и жить, пока браузер начинает загрузку (Safari и Firefox иначе ничего не скачивают)
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Резервная копия сохранена в файл JSON');
}
function handleBackupImport(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || (!Array.isArray(data.ratings) && !Array.isArray(data.categories))) {
        toast('В этом файле нет копии Мнения'); return;
      }
      const n = Array.isArray(data.ratings) ? data.ratings.filter(r => r && !r.example).length : 0;
      if (!confirm(`Заменить оценки и категории на этом устройстве данными из файла? В файле ${n} ${plural(n, 'оценка', 'оценки', 'оценок')}.`)) return;
      // файл мог быть поправлен руками или обрезан: битые записи пропускаем, а не ломаем ими страницу на каждом заходе
      if (Array.isArray(data.ratings)) {
        state.ratings = data.ratings.map(r => (r && typeof r.id === 'string' ? normalizeRating(r.id, r) : null)).filter(Boolean);
        saveLocalRatings();
      }
      if (Array.isArray(data.categories) && data.categories.length) {
        const cats = parseCats({ items: data.categories });
        if (cats && cats.length) { state.cats = cats; saveLocalCats(); }
      }
      if (Array.isArray(data.users) && data.users.length) {
        const users = data.users.filter(u => u && typeof u.id === 'string' && u.id && typeof u.name === 'string' && u.name);
        if (users.length) {
          state.users = users;
          if (state.user) state.user = users.find(u => u.id === state.user.id) || state.user;
          saveUsers();
        }
      }
      if (Array.isArray(data.log)) {
        LOG.entries = readLog(data.log);
        indexLog();
        saveLocalLog();
      }
      if (!state.cats.some(c => c.id === form.cat) && !form.editingId) form.cat = state.cats[0].id;
      renderBoard(); renderCats(); renderForm(); renderLog(); renderUserBar();
      toast('Данные восстановлены из копии');
      closeAuthModal();
    } catch (_) {
      toast('Не получилось прочитать файл копии');
    }
  };
  reader.readAsText(f);
}

/* ---------- Helpers ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const str = v => (typeof v === 'string' ? v : '');
const round1 = x => Math.round(x * 10) / 10;
const fmt = n => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
function clampInt(v, lo, hi) { v = Math.round(Number(v) || 0); return Math.max(lo, Math.min(hi, v)); }
function tierV(v) { return v >= 8 ? 'good' : v >= 5 ? 'mid' : v >= 1 ? 'bad' : 'none'; }
function tierT(t) { return t == null ? 'none' : t >= 7.5 ? 'good' : t >= 5 ? 'mid' : 'bad'; }
// у каждого балла от 1 до 10 своё слово; дробный балл округляется
const VERDICTS = ['Ужас', 'Провал', 'Плохо', 'Слабо', 'Средне', 'Нормально', 'Неплохо', 'Хорошо', 'Отлично', 'Шедевр'];
function verdict(t) {
  if (t == null) return '';
  return VERDICTS[Math.max(1, Math.min(10, Math.round(t))) - 1];
}
// постоянные id для категорий из шаблонов: один шаблон на телефоне и на ПК даёт одну и ту же категорию
function tplId(name) { let h = 5381; for (const ch of keyOf(name)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return 't' + h.toString(36); }
function keyOf(s) { return String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '); }
let idSeq = 0;
function newId(p) { idSeq = (idSeq + 1) % 1296; return p + Date.now().toString(36) + idSeq.toString(36) + Math.random().toString(36).slice(2, 6); }
function totalOf(scores) {
  const r = scores.filter(s => s.v > 0);
  if (!r.length) return null;
  let sum = 0, wSum = 0;
  for (const s of r) {
    const w = (typeof s.w === 'number' && s.w > 0) ? s.w : 1;
    sum += s.v * w;
    wSum += w;
  }
  return wSum ? round1(sum / wSum) : null;
}
function critWord(n) { return plural(n, 'критерий', 'критерия', 'критериев'); }
function coverage(n, N) {
  if (N <= 1) return `${n} ${critWord(n)}`;
  if (n === N) return `все ${N} ${critWord(N)}`;
  return `${n} из ${N} ${plural(N, 'критерия', 'критериев', 'критериев')}`;
}
function fmtDate(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  const o = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('ru-RU', o).replace(/\.$/, '');
}
function fmtDateLong(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Elements ---------- */
const $ = id => document.getElementById(id);
const el = {
  rater: $('rater'), raterTitle: $('raterTitle'), headBtn: $('headBtn'), cats: $('cats'),
  name: $('itemName'), nameMsg: $('nameMsg'), note: $('itemNote'), nameLabel: $('nameLabel'),
  artistBox: $('artistBox'), artist: $('itemArtist'), artistAva: $('artistAva'), artistList: $('artistList'),
  artistEdit: $('artistEdit'), artistEditBox: $('artistEditBox'), artistFile: $('artistFile'),
  photoField: $('photoField'), photoBox: $('photoBox'), photoInput: $('photoInput'),
  editCrit: $('editCrit'), critTip: $('critTip'), critArea: $('critArea'),
  total: $('total'), totalNum: $('totalNum'), verdict: $('verdict'), totalSub: $('totalSub'),
  exportForm: $('exportForm'), save: $('saveBtn'),
  boardStat: $('boardStat'), sortGroup: $('sortGroup'), filters: $('filters'),
  searchWrap: $('searchWrap'), search: $('search'), boardNotice: $('boardNotice'),
  exampleBar: $('exampleBar'), dropExamples: $('dropExamples'),
  board: $('board'), noMatch: $('noMatch'), empty: $('empty'),
  toast: $('toast'), sheet: $('sheet'), sheetPreview: $('sheetPreview'), sheetClose: $('sheetClose'),
  shDownload: $('shDownload'), shCopyImg: $('shCopyImg'), shCopyText: $('shCopyText'),
  sheetHint: $('sheetHint'), sheetText: $('sheetText'),
  sheetOpts: $('sheetOpts'), optDesc: $('optDesc'), optNotes: $('optNotes'), optPhoto: $('optPhoto'),
  optDescWrap: $('optDescWrap'), optNotesWrap: $('optNotesWrap'), optPhotoWrap: $('optPhotoWrap'),
  views: $('views'), tabBoard: $('tabBoard'), tabLog: $('tabLog'), panelBoard: $('panelBoard'), panelLog: $('panelLog'),
  logStat: $('logStat'), logMine: $('logMine'),
  logList: $('logList'), logMore: $('logMore'), logEmpty: $('logEmpty'),
  layout: $('layout'), mnav: $('mnav'), mnavCount: $('mnavCount'), navAnchor: $('navAnchor'),
  offlineBar: $('offlineBar'),
  userBar: $('userBar'), authModal: $('authModal'), authClose: $('authClose'), authBody: $('authBody'),
  authTitle: $('authTitle'),
  themeBtn: $('themeBtn'), cmpTrayBtn: $('cmpTrayBtn'), cmpCount: $('cmpCount'),
  favBtn: $('favBtn'), statusChips: $('statusChips'), meta: $('itemMeta'),
  pros: $('itemPros'), cons: $('itemCons'),
  tabStats: $('tabStats'), panelStats: $('panelStats'), statsContent: $('statsContent'),
  layoutGroup: $('layoutGroup'), subFilters: $('subFilters'), randomBtn: $('randomBtn'),
  tierBoard: $('tierBoard'),
  optPc: $('optPc'), optPcWrap: $('optPcWrap'),
  compareModal: $('compareModal'), cmpClose: $('cmpClose'), cmpClearBtn: $('cmpClearBtn'), cmpBody: $('cmpBody')
};

/* ---------- State ---------- */
const state = {
  db: null, downloads: null, assets: null,
  mode: 'loading',          // loading | db | local
  canWrite: true, loaded: false, catsLoaded: false,
  genres: [], genreOpen: false, // фильтр по жанрам в рейтинге и тир-листе
  users: [], user: null,
  ratings: [],
  cats: clone(STARTERS),
  editCat: false, catDelConfirm: false, catAsk: null,
  sort: 'score', filter: 'all', sfilter: 'all', bmode: 'list', query: '',
  theme: 'auto', cmpIds: [],
  open: new Set(), confirmDel: null, flashId: null, saving: false,
  exportOpts: { desc: true, pc: true, notes: true, photo: true },
  view: 'board', logTab: 'mine', section: 'rate'
};
function blankForm(cat) {
  return {
    editingId: null, cat: cat || (state.cats[0] ? state.cats[0].id : 'games'),
    name: '', artist: '', link: '', fav: false, status: '', meta: '', pros: '', cons: '',
    note: '', scores: {}, notes: {}, openNotes: {}, weights: {}, extra: [], extraCatName: '', photo: null, ownOnly: false
  };
}
state.statsView = state.statsView || 'overview';
state.tierOpts = state.tierOpts || { mode: 'scores', cats: null };
let form = blankForm();
let drag = null;
let pendingFocus = null;
let ready = Promise.resolve();

function currentCat() { return state.cats.find(c => c.id === form.cat) || null; }
function formRows() {
  const cat = form.ownOnly ? null : currentCat(); // ownOnly: у категории теперь совсем другие критерии, чем у этой оценки
  // вес критерия свой у каждой оценки (по умолчанию ×1), он хранится в форме, а не в категории
  const rows = cat ? cat.criteria.map(c => ({ id: c.id, name: c.name, desc: c.desc || '', w: form.weights[c.id] || 1, extra: false })) : [];
  const ids = new Set(rows.map(r => r.id));
  for (const x of form.extra) {
    if (!ids.has(x.id)) { rows.push({ id: x.id, name: x.name, desc: x.desc || '', w: form.weights[x.id] || 1, extra: true }); ids.add(x.id); }
  }
  return rows;
}
function collectScores(rows) {
  return rows
    .map((r, i) => ({ id: r.id, name: r.name.trim() || `Критерий ${i + 1}`, desc: (r.desc || '').trim().slice(0, 120), w: r.w || 1, v: form.scores[r.id] || 0, note: (form.notes[r.id] || '').trim().slice(0, 160) }))
    .filter(s => s.v > 0 || s.note)
    .map(s => {
      const o = { id: s.id, name: s.name, v: s.v };
      if (s.w && s.w !== 1) o.w = s.w;
      if (s.desc) o.desc = s.desc;
      if (s.note) o.note = s.note;
      return o;
    });
}
// у музыки название складывается из исполнителя и названия: «Исполнитель — Трек»
function composeName(artist, title) { return artist && title ? `${artist} — ${title}` : (title || artist || ''); }
function formMusic() { return isMusicCat(currentCat()); }
function formFullName() {
  const title = form.name.trim().replace(/\s+/g, ' ');
  return formMusic() ? composeName((form.artist || '').trim().replace(/\s+/g, ' '), title) : title;
}
function findDup() {
  const key = keyOf(form.name.trim() ? formFullName() : '');
  if (!key) return null;
  return state.ratings.find(r => r.nameKey === key && r.cat === form.cat && r.id !== form.editingId) || null;
}

/* ---------- Focus keeping across re-renders ---------- */
function captureFocus(root) {
  const a = document.activeElement;
  if (!a || a === document.body || !root.contains(a)) return null;
  const host = a.closest('[data-id]');
  return {
    elId: a.id || '', id: host ? host.dataset.id : null,
    key: a.dataset.act || (a.classList.contains('slider') ? 'slider' : ''),
    s: typeof a.selectionStart === 'number' ? a.selectionStart : null,
    e: typeof a.selectionEnd === 'number' ? a.selectionEnd : null
  };
}
function restoreFocus(root, k) {
  if (!k) return;
  let t = k.elId ? document.getElementById(k.elId) : null;
  if ((!t || !root.contains(t)) && k.id) {
    const host = root.querySelector(`[data-id="${CSS.escape(k.id)}"]`);
    if (host) {
      t = k.key === 'slider' ? host.querySelector('.slider') : host.querySelector(`[data-act="${k.key}"]`);
      if (t && t.disabled) t = host.querySelector('button:not(:disabled)');
    }
  }
  if (!t || !root.contains(t)) return;
  t.focus({ preventScroll: true });
  if (k.s != null && typeof t.setSelectionRange === 'function') { try { t.setSelectionRange(k.s, k.e); } catch (_) {} }
}

/* ---------- Rendering: form ---------- */
function cellsHTML(v, cls, knob) {
  let s = '';
  for (let i = 1; i <= 10; i++) s += `<span class="${cls}${i <= v ? ' on' : ''}${knob && i === v ? ' knob' : ''}"></span>`;
  return s;
}
const CAT_X = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function renderCats() {
  const editing = !!form.editingId;
  const canDel = !editing && state.cats.length > 1;
  let h = state.cats.map(c => {
    const name = esc(c.name.trim() || 'Без названия');
    if (state.catAsk === c.id) {
      return `<span class="cat-ask" role="group" aria-label="Удаление категории">${catDelText(c)}<button type="button" class="btn small danger-solid" data-act="catx-yes" data-id="${esc(c.id)}">Да</button><button type="button" class="btn small ghost" data-act="catx-no">Нет</button></span>`;
    }
    const move = editing && c.id !== form.cat;
    const chip = `<button type="button" class="chip-btn" data-cat="${esc(c.id)}" aria-pressed="${c.id === form.cat}"${move ? ' title="Перенести оценку в эту категорию"' : ''}>${name}</button>`;
    return canDel
      ? `<span class="cat-chip">${chip}<button type="button" class="cat-x" data-act="catx" data-id="${esc(c.id)}" aria-label="Удалить категорию «${name}»" title="Удалить категорию">${CAT_X}</button></span>`
      : chip;
  }).join('');
  if (state.cats.length < MAX_CATS) h += `<button type="button" class="chip-btn add" data-act="newcat"${editing ? ' disabled' : ''}>${ICON.plus}Категория</button>`;
  el.cats.innerHTML = h;
}
function critRowHTML(r) {
  const v = form.scores[r.id] || 0;
  const note = form.notes[r.id] || '';
  const open = !!note || !!form.openNotes[r.id];
  const nid = 'cn-' + r.id;
  const w = r.w || 1;
  const wBadge = `<button type="button" class="crit-w${w !== 1 ? ' on' : ''}" data-act="w" title="Вес критерия в итоге этой оценки. Нажми: ×1 → ×2 → ×0,5" aria-label="Вес критерия «${esc(r.name)}»: ×${String(w).replace('.', ',')}">×${String(w).replace('.', ',')}</button>`;
  return `<li class="crit" data-id="${esc(r.id)}" data-tier="${tierV(v)}">
<div class="crit-top">
<div class="crit-name"><span class="crit-title" id="${esc(nid)}">${esc(r.name.trim() || 'Без названия')}${wBadge}</span>${r.desc ? `<span class="crit-desc">${esc(r.desc)}</span>` : ''}</div>
<button type="button" class="mini-btn${note.trim() ? ' has' : ''}" data-act="note" aria-expanded="${open}" aria-controls="cnote-${esc(r.id)}" aria-label="Заметка к критерию «${esc(r.name)}»" title="Заметка к критерию">${ICON.note}</button>
<button type="button" class="mini-btn" data-act="clear" aria-label="Сбросить оценку «${esc(r.name)}»" title="Сбросить"${v ? '' : ' hidden'}>${ICON.x}</button>
<span class="crit-val" aria-hidden="true">${v || '—'}</span>
</div>
<div class="slider" role="slider" tabindex="0" aria-labelledby="${esc(nid)}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${v}" aria-valuetext="${v ? v + ' из 10' : 'не оценено'}">${cellsHTML(v, 'cell', true)}</div>
<input class="crit-note" id="cnote-${esc(r.id)}" data-act="cnote" type="text" maxlength="160" enterkeyhint="done" placeholder="Заметка к критерию" aria-label="Заметка к критерию «${esc(r.name)}»" value="${esc(note)}"${open ? '' : ' hidden'}>
</li>`;
}
function editorHTML(cat) {
  const n = cat.criteria.length;
  const starter = STARTERS.some(s => s.id === cat.id);
  const tpls = allTemplates().map((t, idx) => `<button type="button" class="tpl-btn" data-act="apply-tpl" data-tpl="${idx}">${esc(t.name)}</button>`).join('');
  const items = cat.criteria.map((c, i) => {
    return `<li class="ed-item" data-id="${esc(c.id)}">
<span class="ed-num" aria-hidden="true">${i + 1}</span>
<div class="ed-fields">
<input class="ed-input ed-name" id="edn-${esc(c.id)}" data-act="cname" type="text" maxlength="40" enterkeyhint="next" value="${esc(c.name)}" placeholder="Название критерия" aria-label="Критерий ${i + 1}, название">
<textarea class="ed-input ed-desc" id="edd-${esc(c.id)}" data-act="cdesc" rows="1" maxlength="120" enterkeyhint="next" placeholder="Описание, по желанию" aria-label="Критерий ${i + 1}, описание">${esc(c.desc || '')}</textarea>
</div>
<div class="ed-tools">
<button type="button" class="mini-btn" data-act="up" aria-label="Поднять критерий ${i + 1}"${i === 0 ? ' disabled' : ''}>${ICON.up}</button>
<button type="button" class="mini-btn" data-act="down" aria-label="Опустить критерий ${i + 1}"${i === n - 1 ? ' disabled' : ''}>${ICON.down}</button>
<button type="button" class="mini-btn del" data-act="delcrit" aria-label="Удалить критерий ${i + 1}"${n <= 1 ? ' disabled' : ''}>${ICON.trash}</button>
</div>
</li>`;
  }).join('');
  const danger = state.catDelConfirm
    ? `<div class="ed-confirm"><span>${catDelText(cat)}</span><button type="button" class="btn small danger-solid" data-act="catdel-yes">Удалить</button><button type="button" class="btn small ghost" data-act="catdel-no">Отмена</button></div>`
    : `<div class="ed-actions"><button type="button" class="btn small ghost danger" data-act="catdel"${state.cats.length <= 1 ? ' disabled title="Нужна хотя бы одна категория"' : ''}>${ICON.trash}Удалить категорию</button></div>`;
  return `<div class="editor">
<div class="tpl-box"><span class="label">Быстрые шаблоны критериев</span><div class="tpl-list">${tpls}</div></div>
<div><label class="label" for="catNameInput">Название категории</label><input class="ed-input ed-cat" id="catNameInput" data-act="catname" type="text" maxlength="40" enterkeyhint="next" value="${esc(cat.name)}" placeholder="Например, Кофейни"></div>
<div><p class="label">Критерии · ${n} из ${MAX_CRIT}. Вес критерия ставится в каждой оценке, кнопкой ×1 рядом с его названием</p><ul class="ed-list">${items}</ul></div>
<div class="ed-actions">
<button type="button" class="btn small ghost" data-act="addcrit"${n >= MAX_CRIT ? ' disabled' : ''}>${ICON.plus}Добавить критерий</button>
${starter ? '<button type="button" class="btn small text" data-act="resetcat">Вернуть стандартные</button>' : ''}
</div>
${danger}
</div>`;
}
function fitDesc(t) {
  t.style.height = 'auto';
  t.style.height = (t.scrollHeight + 2) + 'px';
}
function renderCrit() {
  const keep = captureFocus(el.critArea);
  const cat = currentCat();
  el.editCrit.hidden = !cat;
  el.editCrit.textContent = state.editCat ? 'Готово' : 'Настроить';
  el.editCrit.setAttribute('aria-pressed', String(state.editCat));
  el.editCrit.classList.toggle('on', state.editCat);
  if (state.editCat && cat) {
    el.critTip.textContent = 'Меняй названия и описания, добавляй, удаляй и переставляй критерии. Всё сохраняется в этой категории.';
    el.critArea.innerHTML = editorHTML(cat);
    el.critArea.querySelectorAll('.ed-desc').forEach(fitDesc);
  } else {
    const rows = formRows();
    el.critTip.textContent = !cat && rows.length
      ? `Категории «${form.extraCatName || 'без названия'}» больше нет, критерии взяты из сохранённой оценки.`
      : cat && form.extra.some(x => x.id === LB_SCORE) && rows.length > 1
        ? 'Это оценка из Letterboxd. Оцени по критериям — при сохранении они заменят «Оценку с Letterboxd».'
        : 'Нажми или потяни по шкале. Критерий без оценки не попадёт в итог.';
    el.critArea.innerHTML = rows.length
      ? `<ul class="crit-list">${rows.map(critRowHTML).join('')}</ul>`
      : `<p class="empty-cat">${state.catsLoaded ? 'Выбери категорию выше или создай новую.' : 'Загружаю категории…'}</p>`;
  }
  restoreFocus(el.critArea, keep);
}
function updateRow(id) {
  const li = el.critArea.querySelector(`.crit[data-id="${CSS.escape(id)}"]`);
  if (!li) return;
  const v = form.scores[id] || 0;
  li.dataset.tier = tierV(v);
  li.querySelectorAll('.cell').forEach((c, i) => { c.classList.toggle('on', i < v); c.classList.toggle('knob', i + 1 === v); });
  const sl = li.querySelector('.slider');
  sl.setAttribute('aria-valuenow', String(v));
  sl.setAttribute('aria-valuetext', v ? `${v} из 10` : 'не оценено');
  li.querySelector('.crit-val').textContent = v || '—';
  li.querySelector('[data-act="clear"]').hidden = !v;
}
function updateTotal() {
  const rows = formRows();
  const ratedRows = rows.filter(r => (form.scores[r.id] || 0) > 0);
  const t = ratedRows.length ? totalOf(ratedRows.map(r => ({ v: form.scores[r.id], w: r.w || 1 }))) : null;
  el.total.dataset.tier = tierT(t);
  el.totalNum.textContent = t == null ? '—' : fmt(t);
  const plan = t == null && noScoreOk(form.status);
  el.verdict.textContent = t == null ? (plan ? form.status.trim() : 'Пока без оценки') : verdict(t);
  el.totalSub.textContent = t == null ? (plan ? 'Можно сохранить и без балла' : 'Подвинь хотя бы один ползунок или отметь «В планах»') : coverage(ratedRows.length, rows.length);
  el.total.classList.remove('nudge');
}
function updateHead() {
  const editing = !!form.editingId;
  el.raterTitle.textContent = editing ? 'Редактирование' : 'Новая оценка';
  el.rater.classList.toggle('is-editing', editing);
  el.headBtn.textContent = editing ? 'Отменить' : 'Очистить';
  el.save.hidden = !state.canWrite;
  el.save.disabled = state.saving;
  el.save.textContent = state.saving ? 'Сохраняю…' : (editing || findDup()) ? 'Обновить' : 'Сохранить';
}
function updateNameState(err) {
  const dup = findDup();
  el.nameMsg.replaceChildren();
  let isErr = false;
  if (err) { el.nameMsg.textContent = err; isErr = true; }
  else if (dup && form.editingId) { el.nameMsg.textContent = 'В этой категории уже есть оценка с таким названием. Измени название.'; isErr = true; }
  else if (dup) {
    const s = document.createElement('span');
    s.textContent = `Уже есть в рейтинге с баллом ${dup.total != null ? fmt(dup.total) : '—'}. Сохранение обновит оценку. `;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'link-btn'; b.textContent = 'Открыть прежнюю';
    b.addEventListener('click', () => loadIntoForm(dup));
    el.nameMsg.append(s, b);
  }
  el.nameMsg.hidden = !el.nameMsg.childNodes.length;
  el.nameMsg.classList.toggle('err', isErr);
  el.name.setAttribute('aria-invalid', String(isErr));
  updateHead();
}
function renderForm() {
  if (el.name.value !== form.name) el.name.value = form.name;
  if (el.note.value !== form.note) el.note.value = form.note;
  if (el.meta && el.meta.value !== (form.meta || '')) el.meta.value = form.meta || '';
  renderMusicPicked();
  if (el.pros && el.pros.value !== (form.pros || '')) el.pros.value = form.pros || '';
  if (el.cons && el.cons.value !== (form.cons || '')) el.cons.value = form.cons || '';
  if (el.favBtn) el.favBtn.setAttribute('aria-pressed', String(!!form.fav));
  renderStatusSet();
  renderArtist();
  if (el.statusChips) {
    el.statusChips.querySelectorAll('button[data-status]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.status.trim() === (form.status || '').trim() && !!form.status));
    });
  }
  autoGrow(el.note);
  renderCats();
  renderPhoto();
  renderCrit();
  updateTotal();
  updateNameState();
}

// статусы: у музыки «Сингл / Альбом», у фильмов и сериалов «Просмотрено» вместо «Завершено»;
// «В планах» и «В процессе» можно сохранить и без балла
const STATUS_SETS = {
  music: [['Сингл', '♪ Сингл'], ['Альбом', '◉ Альбом']],
  movie: [['Просмотрено', '✓ Просмотрено'], ['В процессе', '▶ В процессе'], ['В планах', '◷ В планах'], ['Брошено', '✕ Брошено']],
  base: [['Завершено', '✓ Завершено'], ['В процессе', '▶ В процессе'], ['В планах', '◷ В планах'], ['Брошено', '✕ Брошено']]
};
const NO_SCORE_OK = ['В планах', 'В процессе'];
const noScoreOk = (st) => NO_SCORE_OK.includes(String(st || '').trim());
function statusSet() { return formMusic() ? STATUS_SETS.music : catKind(currentCat()) === 'movie' ? STATUS_SETS.movie : STATUS_SETS.base; }
// статус под текущую категорию: «Завершено» у фильма становится «Просмотрено» и наоборот, чужой статус сбрасывается
function fitStatus(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  const set = statusSet();
  const swap = set === STATUS_SETS.movie ? t.replace('Завершено', 'Просмотрено') : t.replace('Просмотрено', 'Завершено');
  return set.some(([k]) => swap.includes(k)) ? swap : '';
}
// старые оценки фильмов и сериалов: «Завершено» → «Просмотрено» (время правки не трогаем, это не правка оценки)
function migrateWatched() {
  let n = 0;
  for (const r of state.ratings) {
    if (r.example || !/Завершено/.test(r.status || '')) continue;
    if (catKind(state.cats.find(c => c.id === r.cat) || { id: r.cat, name: r.catName || '' }) !== 'movie') continue;
    r.status = r.status.replace('Завершено', 'Просмотрено');
    n++;
  }
  if (n) saveLocalRatings();
}
function renderStatusSet() {
  const box = el.statusChips || $('statusChips');
  if (!box) return;
  const set = statusSet();
  const sig = set.map(x => x[0]).join('|');
  if (box.dataset.set !== sig) {
    box.dataset.set = sig;
    box.innerHTML = set.map(([v, t]) => `<button type="button" class="status-chip" data-status="${v}" aria-pressed="false">${t}</button>`).join('');
  }
  box.querySelectorAll('button[data-status]').forEach(b => b.setAttribute('aria-pressed', String(!!form.status && b.dataset.status === form.status.trim())));
}

/* ---------- Исполнители (музыка) ---------- */
// аватарка исполнителя одна на все его треки: хранится в справочнике, а в оценке только её отпечаток (artistAva),
// чтобы другие устройства и друзья знали, какую картинку подтянуть с сервера
const ARTISTS_KEY = 'ocenshik.artists.v1';
const MUSIC_TPL = 'Музыка и альбомы';
function isMusicCat(c) { return !!c && (c.id === tplId(MUSIC_TPL) || keyOf(c.name).startsWith('музык')); }
function avaFp(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}
let artistsCache = null;
function artistsMap() {
  if (!artistsCache) {
    try { artistsCache = JSON.parse(localStorage.getItem(ARTISTS_KEY) || '{}') || {}; } catch (_) { artistsCache = {}; }
  }
  return artistsCache;
}
function saveArtists() {
  try { localStorage.setItem(ARTISTS_KEY, JSON.stringify(artistsMap())); return true; }
  catch (_) { return false; }
}
function artistGet(name) { const k = keyOf(name); return k ? (artistsMap()[k] || null) : null; }
function artistAvaUrl(r) { if (!r || !r.artist) return ''; const a = artistGet(r.artist); return a && a.ava ? a.ava : ''; }
// все известные исполнители: из справочника и из оценок, частые сверху
function artistList() {
  const m = new Map();
  for (const [k, a] of Object.entries(artistsMap())) if (a && a.name) m.set(k, { key: k, name: a.name, ava: a.ava || '', n: 0 });
  for (const r of state.ratings) {
    if (r.example || !r.artist) continue;
    const k = keyOf(r.artist);
    if (!k) continue;
    const a = m.get(k) || { key: k, name: r.artist, ava: '', n: 0 };
    a.n++;
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ru'));
}
function artistMiniHTML(a) {
  return `<span class="artist-mini">${a.ava ? `<img src="${esc(a.ava)}" alt="">` : esc((a.name.trim().charAt(0) || '?').toUpperCase())}</span>`;
}
// меняет все оценки исполнителя (имя, отпечаток аватарки); оценка получает свежую дату, чтобы правка дошла до других устройств
async function patchArtistRatings(key, patchOf) {
  const list = state.ratings.filter(r => !r.example && r.artist && keyOf(r.artist) === key);
  if (!list.length) return 0;
  const now = new Date().toISOString();
  if (state.mode === 'db') {
    for (const r of list) await putRating(r.id, Object.assign({}, r, patchOf(r), { updatedAt: now }));
  } else {
    list.forEach(r => Object.assign(r, patchOf(r), { updatedAt: now }));
    saveLocalRatings();
    renderBoard();
  }
  return list.length;
}
// quiet: картинка пришла с сервера, оценки трогать не надо
// возвращает false, если браузер не дал сохранить (нет места): тогда всё остаётся как было
function artistSetAva(name, data, quiet) {
  const k = keyOf(name);
  if (!k) return false;
  const m = artistsMap();
  const prev = m[k];
  const cur = prev || { name: name.trim() };
  if (data) m[k] = Object.assign({}, cur, { ava: data, fp: avaFp(data) });
  else { m[k] = Object.assign({}, cur); delete m[k].ava; delete m[k].fp; }
  if (!saveArtists()) { if (prev) m[k] = prev; else delete m[k]; return false; }
  if (!quiet) patchArtistRatings(k, () => ({ artistAva: m[k].fp || '' }));
  renderArtist();
  renderBoard();
  return true;
}
// ставим аватарку из файла; места в браузере мало — пробуем картинку поменьше. Сообщение — по тому, что вышло на самом деле
async function setArtistAvaFile(name, f, done) {
  for (const [side, q] of [[192, 0.86], [112, 0.78], [72, 0.72]]) {
    const d = await artistAvaFromFile(f, side, q);
    if (!d) return false;
    if (artistSetAva(name, d)) { toast(done); return true; }
  }
  toast('В браузере закончилось место, и аватарка не сохранилась. Освободи место: убери лишние фото из старых оценок');
  return false;
}
async function artistRename(oldName, newName) {
  const name = String(newName || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const ok = keyOf(oldName), nk = keyOf(name);
  if (!nk || !ok) return false;
  const m = artistsMap();
  const prev = m[ok] || {}, tgt = m[nk] || {};
  if (ok !== nk) delete m[ok];
  m[nk] = Object.assign({}, tgt, prev, (!prev.ava && tgt.ava) ? { ava: tgt.ava, fp: tgt.fp } : {}, { name });
  saveArtists();
  const fpv = m[nk].fp || '';
  const n = await patchArtistRatings(ok, r => {
    const title = r.title || (r.name.startsWith(r.artist + ' — ') ? r.name.slice(r.artist.length + 3) : r.name);
    const full = composeName(name, title).slice(0, 140);
    return { artist: name, title, name: full, nameKey: keyOf(full), artistAva: fpv };
  });
  if (keyOf(form.artist) === ok) form.artist = name;
  renderForm();
  toast(n ? `Исполнитель переименован, оценок: ${n}` : 'Исполнитель переименован');
  return true;
}
// квадратная аватарка 192×192 из середины картинки
async function artistAvaFromFile(f, out = 192, quality = 0.86) {
  if (!f || !/^image\//.test(f.type)) { toast('Нужна картинка'); return ''; }
  try {
    const bmp = await createImageBitmap(f);
    const side = Math.min(bmp.width, bmp.height);
    const cv = document.createElement('canvas');
    cv.width = cv.height = out;
    cv.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
    if (bmp.close) bmp.close();
    return cv.toDataURL('image/jpeg', quality);
  } catch (_) { toast('Эту картинку не получилось открыть'); return ''; }
}
let artistPick = -1, artistEditing = null;
function renderArtist() {
  if (!el.artistBox) return;
  const music = formMusic();
  el.artistBox.hidden = !music;
  if (!music && form.link) form.link = ''; // «Слушать» есть только у музыки
  renderMusicPicked();
  el.nameLabel.textContent = music ? 'Название трека или альбома' : 'Название';
  el.name.placeholder = music ? 'Начни писать, и трек найдётся' : 'Что оцениваешь?';
  if (!music) { hideArtistList(); return; }
  if (el.artist.value !== (form.artist || '')) el.artist.value = form.artist || '';
  const a = artistGet(form.artist);
  const ava = a && a.ava ? a.ava : '';
  const letter = (form.artist || '').trim().charAt(0).toUpperCase();
  el.artistAva.classList.toggle('has', !!ava);
  el.artistAva.innerHTML = ava ? `<img src="${esc(ava)}" alt="">` : (letter ? esc(letter) : '♪');
  const known = !!keyOf(form.artist) && artistList().some(x => x.key === keyOf(form.artist));
  el.artistEdit.hidden = !known || !!artistEditing;
  scheduleGenius();
  if (artistEditing && keyOf(artistEditing) !== keyOf(form.artist)) closeArtistEdit();
}
function hideArtistList() {
  if (!el.artistList) return;
  el.artistList.hidden = true;
  el.artist.setAttribute('aria-expanded', 'false');
  el.artist.removeAttribute('aria-activedescendant');
  artistPick = -1;
}
// имена исполнителей из интернета: Deezer (через наш сервер, прощает опечатки) и Apple Music. Выбрал — имя подставилось как есть
let artistNetTimer = 0, artistNetKey = '', artistNet = [];
const artistNetSeen = new Map();
function scheduleArtistNet() {
  clearTimeout(artistNetTimer);
  if (!formMusic() || (form.artist || '').trim().length < 2) { artistNet = []; artistNetKey = ''; return; }
  artistNetTimer = setTimeout(findArtistNet, 450);
}
async function findArtistNet() {
  const q = (form.artist || '').trim(), k = keyOf(q);
  if (!k || k === artistNetKey) return;
  artistNetKey = k;
  let list = artistNetSeen.get(k);
  if (!list) {
    const api = window.casualApi;
    const dz = api && api.online() ? api.get('/music/artists?q=' + encodeURIComponent(q)).then(r => (r && r.artists) || [], () => []) : Promise.resolve([]);
    const it = fetch(`https://itunes.apple.com/search?entity=musicArtist&limit=6&country=US&term=${encodeURIComponent(q)}`)
      .then(r => r.json()).then(d => (d.results || []).map(a => ({ name: String(a.artistName || ''), img: '' })), () => []);
    const [a, b] = await Promise.all([dz, it]);
    const seen = new Set();
    list = [];
    for (const x of a.concat(b)) {
      const nk = keyOf(x.name);
      if (!nk || seen.has(nk)) continue;
      seen.add(nk);
      list.push({ name: x.name.trim().slice(0, 80), img: /^https:\/\//.test(x.img || '') ? x.img : '' });
    }
    list = list.slice(0, 6);
    artistNetSeen.set(k, list);
  }
  if (keyOf(form.artist) !== k) return;
  artistNet = list;
  if (document.activeElement === el.artist) showArtistList();
}
function showArtistList() {
  const q = keyOf(el.artist.value);
  const all = artistList();
  const list = all.filter(a => !q || a.key.includes(q)).slice(0, 8);
  // из интернета — только те, кого ещё нет среди своих и кто не совпадает с написанным
  const mine = new Set(all.map(a => a.key));
  const net = q && keyOf(form.artist) === artistNetKey ? artistNet.filter(a => !mine.has(keyOf(a.name)) && keyOf(a.name) !== q) : [];
  if ((!list.length && !net.length) || (list.length === 1 && list[0].key === q && !net.length)) { hideArtistList(); return; }
  artistPick = Math.min(artistPick, list.length + net.length - 1);
  el.artistList.innerHTML = list.map((a, i) => `<li role="option" id="artOpt${i}" data-artist="${esc(a.name)}" aria-selected="${i === artistPick}">${artistMiniHTML(a)}<span>${esc(a.name)}</span>${a.n ? `<small>${a.n} ${plural(a.n, 'оценка', 'оценки', 'оценок')}</small>` : ''}</li>`).join('')
    + (net.length ? `<li class="artist-sep" role="presentation">Нашлось в Deezer и Apple Music</li>` + net.map((a, j) => { const i = list.length + j; return `<li role="option" id="artOpt${i}" data-artist="${esc(a.name)}" aria-selected="${i === artistPick}"><span class="artist-mini">${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc((a.name.charAt(0) || '?').toUpperCase())}</span><span>${esc(a.name)}</span></li>`; }).join('') : '');
  el.artistList.hidden = false;
  el.artist.setAttribute('aria-expanded', 'true');
  if (artistPick >= 0) el.artist.setAttribute('aria-activedescendant', 'artOpt' + artistPick); else el.artist.removeAttribute('aria-activedescendant');
}
function pickArtist(name) {
  form.artist = name;
  el.artist.value = name;
  hideArtistList();
  renderArtist();
  updateNameState();
  scheduleDraft();
  scheduleCovers();
}
function openArtistEdit() {
  const a = artistList().find(x => x.key === keyOf(form.artist));
  if (!a) return;
  artistEditing = a.name;
  el.artistEditBox.innerHTML = `<div class="row">${artistMiniHTML(a)}<input id="artistNewName" type="text" maxlength="80" value="${esc(a.name)}" aria-label="Имя исполнителя"></div>
<div class="row"><button type="button" class="btn small" data-aact="save">Сохранить</button><button type="button" class="btn small ghost" data-aact="ava">${a.ava ? 'Сменить аватарку' : 'Поставить аватарку'}</button>${a.ava ? '<button type="button" class="btn small ghost danger" data-aact="noava">Убрать аватарку</button>' : ''}<button type="button" class="btn small ghost" data-aact="cancel">Отмена</button></div>
<p>Имя и аватарка поменяются во всех оценках этого исполнителя${a.n ? ` (${a.n})` : ''}.</p>`;
  el.artistEditBox.hidden = false;
  el.artistEdit.hidden = true;
  const inp = $('artistNewName');
  inp.focus();
  inp.select();
}
function closeArtistEdit() {
  artistEditing = null;
  el.artistEditBox.hidden = true;
  el.artistEditBox.replaceChildren();
}

/* ---------- Обложки по названию ---------- */
// музыка — iTunes прямо из браузера; игры — Steam, фильмы и сериалы — IMDb, книги — Open Library, аниме — AniList
// через наш сервер (нужен вход). Выбранная обложка скачивается и становится обычным фото оценки
let coverTimer = null, coverCtl = null, coverKey = '', coverItems = [], coverFrom = '';
const COVER_SRC = { music: 'Apple Music и Deezer', game: 'Steam', movie: 'IMDb', book: 'Open Library', anime: 'AniList' };
function coverKind() { return catKind(currentCat()); }
// какие обложки подходят категории: по её названию
function catKind(c) {
  if (!c) return '';
  if (isMusicCat(c)) return 'music';
  const k = `${keyOf(c.name)} ${c.id}`;
  if (/игр|game/.test(k)) return 'game';
  if (/фильм|сериал|кино|film|movie|series/.test(k)) return 'movie';
  if (/книг|литератур|book/.test(k)) return 'book';
  if (/аниме|манг|anime|manga/.test(k)) return 'anime';
  return '';
}
function coverQuery() {
  const kind = coverKind();
  if (!kind || form.photo || !canPhoto() || photoBusy) return '';
  if (kind !== 'music' && !(window.casualApi && window.casualApi.online())) return '';
  const t = form.name.trim(), a = kind === 'music' ? (form.artist || '').trim() : '';
  if (t.length < 2 && a.length < 2) return ''; // у музыки хватает и одного исполнителя
  return kind === 'music' ? `${a} ${t}`.trim() : t;
}
function scheduleCovers() {
  clearTimeout(coverTimer);
  if (!coverQuery()) { if (coverItems.length || coverKey) { coverItems = []; coverKey = ''; renderCovers(); } return; }
  coverTimer = setTimeout(findCovers, 650);
}
async function findCovers() {
  const q = coverQuery();
  const kind = coverKind();
  const key = kind + '|' + q + '|' + (form.status || '');
  if (!q || key === coverKey) return;
  coverKey = key;
  if (coverCtl) coverCtl.abort();
  const ctl = coverCtl = new AbortController();
  if (kind !== 'music') {
    try {
      const r = await window.casualApi.get(`/covers?kind=${kind}&q=${encodeURIComponent(q)}`);
      if (ctl !== coverCtl) return;
      coverItems = ((r && r.items) || []).filter(c => c && /^https:\/\//.test(c.art)).map(c => ({
        id: String(c.id || ''), genres: Array.isArray(c.genres) ? c.genres.map(String).slice(0, 3) : [],
        title: String(c.title || ''), artist: '', kind: String(c.sub || ''), year: String(c.year || ''), genre: '',
        art: c.art, alt: /^https:\/\//.test(c.alt || '') ? c.alt : '', thumb: /^https:\/\//.test(c.thumb || '') ? c.thumb : c.art, tall: !!c.tall, via: 'server'
      }));
    } catch (_) {
      if (ctl !== coverCtl) return;
      coverItems = [];
    }
    coverFrom = kind;
    renderCovers();
    return;
  }
  const ent = form.status === 'Альбом' ? 'album' : form.status === 'Сингл' ? 'song' : 'album,song';
  // Deezer — через наш сервер (нужен вход): там много исполнителей, которых нет в iTunes. Спрашиваем параллельно
  const dz = window.casualApi && window.casualApi.online()
    ? window.casualApi.get(`/covers?kind=music&q=${encodeURIComponent(q)}`).then((r) => ((r && r.items) || []).filter(c => c && /^https:\/\//.test(c.art)).map(c => ({
      title: String(c.title || ''), artist: String(c.artist || ''), kind: String(c.sub || ''), year: '', genre: '',
      art: c.art, thumb: /^https:\/\//.test(c.thumb || '') ? c.thumb : c.art, via: 'server'
    })).filter(c => !(form.status === 'Альбом' && c.kind === 'Трек') && !(form.status === 'Сингл' && c.kind !== 'Трек' && c.kind !== 'Сингл')), () => [])
    : Promise.resolve([]);
  try {
    const res = await fetch(`https://itunes.apple.com/search?media=music&entity=${ent}&limit=15&country=US&term=${encodeURIComponent(q)}`, { signal: ctl.signal });
    const d = await res.json();
    const seen = new Set();
    coverItems = (d.results || []).filter(r => r && typeof r.artworkUrl100 === 'string').map(r => ({
      title: String((r.wrapperType === 'collection' ? r.collectionName : r.trackName) || ''),
      artist: String(r.artistName || ''),
      kind: r.wrapperType === 'collection' ? 'Альбом' : 'Трек',
      year: String(r.releaseDate || '').slice(0, 4),
      genre: String(r.primaryGenreName || ''),
      art: r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.')
    })).filter(c => /^https:\/\/[\w.-]+\.mzstatic\.com\//.test(c.art) && !seen.has(c.art) && seen.add(c.art)).slice(0, 8)
      .map(c => Object.assign(c, { thumb: c.art.replace('/600x600bb.', '/200x200bb.') }));
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    coverItems = [];
  }
  // сначала iTunes, следом Deezer; одинаковые (исполнитель + название) не повторяем
  const same = (c) => keyOf(c.artist) + '|' + keyOf(String(c.title).replace(/\s+-\s+(Single|EP)$/i, ''));
  const have = new Set(coverItems.map(same));
  const extra = (await dz).filter(c => !have.has(same(c)) && have.add(same(c)));
  if (ctl !== coverCtl) return;
  coverItems = coverItems.concat(extra).slice(0, 12);
  coverFrom = 'music';
  renderCovers();
}
function renderCovers() {
  const box = $('coverSugg');
  if (!box) return;
  // пока открыт список найденных треков, вторая подборка обложек только мешает
  const show = coverItems.length > 0 && !!coverQuery() && !musicItems.length;
  box.hidden = !show;
  if (!show) { box.replaceChildren(); return; }
  box.innerHTML = `<span class="label">Обложки из ${esc(COVER_SRC[coverFrom] || 'интернета')}</span><div class="cover-list">${coverItems.map((c, i) => `<button type="button" class="cover-opt${c.tall ? ' tall' : ''}" data-cover="${i}" title="${esc([c.artist, c.title].filter(Boolean).join(' — '))}"><img src="${esc(c.thumb || c.art)}"${c.alt ? ` data-alt="${esc(c.alt)}"` : ''} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span>${esc(c.title)}</span><small>${esc([c.kind, c.year].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>`;
}
// у старых игр Steam нет вертикальной обложки: показываем шапку магазина
document.addEventListener('error', e => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.dataset.alt && img.closest('#coverSugg') && img.src !== img.dataset.alt) {
    const c = coverItems[+img.closest('[data-cover]').dataset.cover];
    if (c) { c.art = c.alt; c.tall = false; img.closest('.cover-opt').classList.remove('tall'); }
    img.src = img.dataset.alt;
  }
}, true);
async function pickCover(i) {
  const c = coverItems[i];
  if (!c || photoBusy) return;
  try {
    let blob = null;
    if (c.via === 'server') {
      // браузеру чужие сайты скачивать нельзя (CSP), поэтому картинку берёт наш сервер
      for (const u of [c.art, c.alt].filter(Boolean)) {
        try { const r = await window.casualApi.get('/fetch-img?u=' + encodeURIComponent(u)); blob = r && r.data ? dataUrlToBlob(r.data) : null; } catch (_) { blob = null; }
        if (blob) break;
      }
      if (!blob) throw new Error('img');
    } else {
      const res = await fetch(c.art);
      if (!res.ok) throw new Error('http');
      blob = await res.blob();
    }
    await setPhotoFromFile(new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' }), false);
    if (!form.photo) throw new Error('photo');
    await fillFromCover(c);
    coverItems = [];
    renderCovers();
    scheduleDraft();
    toast('Обложка добавлена, можно выбрать пропорции');
  } catch (_) {
    toast('Обложка не загрузилась, попробуй другую');
  }
}

// выбрали обложку — подставляем название и год с основными жанрами. Искали по-русски — берём русское название
// (фильмы — из Wikidata, игры — из Steam), а если его нет, оставляем то, что написано
async function fillFromCover(c) {
  const kind = coverFrom;
  if (kind === 'music') { fillMusicFromCover(c); return; }
  let info = { ru: '', genres: c.genres && c.genres.length ? c.genres : c.genre ? [c.genre] : [] };
  if (c.id && (kind === 'movie' || kind === 'game') && window.casualApi && window.casualApi.online()) {
    try { info = Object.assign(info, await window.casualApi.get(`/covers/info?kind=${kind}&id=${encodeURIComponent(c.id)}`)); } catch (_) {}
  }
  const typed = form.name.trim();
  const name = /[а-яё]/i.test(typed) ? String(info.ru || '').trim() : c.title.trim();
  if (name && name !== typed) {
    form.name = name.slice(0, 140);
    el.name.value = form.name;
    updateNameState();
  }
  const meta = (form.meta || '').trim();
  // описание заполняем, только если там пусто или один год — своё не затираем
  if (!meta || /^(18|19|20)\d{2}$/.test(meta)) {
    form.meta = [c.year || meta, ...(info.genres || []).map(g => String(g).toLowerCase())].filter(Boolean).join(', ').slice(0, 80);
    if (el.meta) el.meta.value = form.meta;
  }
}

// музыка: из iTunes приходят исполнитель, название (у синглов и EP с хвостом « - Single»), тип, год и жанр
function fillMusicFromCover(c) {
  const artist = String(c.artist || '').trim().slice(0, 80);
  if (artist && keyOf(artist) !== keyOf(form.artist)) {
    form.artist = artist;
    if (el.artist) el.artist.value = artist;
    renderArtist();
  }
  const title = String(c.title || '').replace(/\s+-\s+(Single|EP)$/i, '').trim();
  if (title && title !== form.name.trim()) {
    form.name = title.slice(0, 140);
    el.name.value = form.name;
  }
  if (!form.status) { form.status = c.kind === 'Альбом' || c.kind === 'EP' || c.kind === 'Сборник' ? 'Альбом' : 'Сингл'; renderStatusSet(); }
  const meta = (form.meta || '').trim();
  if (!meta || /^(18|19|20)\d{2}$/.test(meta)) {
    form.meta = [c.year || meta, c.genre && c.genre.toLowerCase()].filter(Boolean).join(', ').slice(0, 80);
    if (el.meta) el.meta.value = form.meta;
  }
  updateNameState();
}

/* ---------- Поиск трека или альбома ---------- */
function musicMsg(text, bad) {
  const m = $('musicMsg');
  if (!m) return;
  m.textContent = text || '';
  m.hidden = !text;
  m.classList.toggle('err', !!bad);
}
let musicItems = [], musicTimer = 0, musicSeq = 0, musicPhotoAuto = false, musicPickedArtist = '';
function renderMusicPicked() {
  const box = $('musicPicked');
  if (!box) return;
  const music = formMusic();
  if (!music && musicItems.length) { musicItems = []; renderMusicResults(); }
  const html = music ? listenHTML({ link: form.link }) : '';
  box.hidden = !html;
  if (box.dataset.link !== html) { box.dataset.link = html; box.innerHTML = html ? html + '<button type="button" class="mini-btn" id="musicUnlink" aria-label="Убрать ссылку" title="Убрать ссылку">✕</button>' : ''; }
}
function renderMusicResults() {
  const box = $('musicResults');
  if (!box) return;
  box.hidden = !musicItems.length;
  box.innerHTML = musicItems.map((c, i) => `<button type="button" class="music-opt" data-music="${i}"><img src="${esc(c.thumb || c.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span><b>${esc(c.title)}</b><small>${esc([c.artist, c.album, c.year].filter(Boolean).join(' · '))}</small></span><i>${esc(c.kind === 'Альбом' ? 'Альбом' : '')}</i></button>`).join('');
  renderCovers();
}
function musicClear() {
  clearTimeout(musicTimer); musicSeq++;
  musicItems = []; musicPhotoAuto = false;
  musicPickedArtist = '';
  renderMusicResults();
}
// поиск: с аккаунтом — по всем каталогам через наш сервер, без него — только Apple Music
async function searchMusic(q, title) {
  const seq = ++musicSeq;
  const album = form.status === 'Альбом';
  let items = [];
  try {
    if (window.casualApi && window.casualApi.online()) {
      items = ((await window.casualApi.get(`/music/search?q=${encodeURIComponent(q)}${album ? '&kind=album' : ''}`)) || {}).items || [];
      items = items.map(c => ({ ...c, via: 'server' }));
    } else {
      const res = await fetch(`https://itunes.apple.com/search?media=music&entity=${album ? 'album' : 'song'}&limit=8&country=US&term=${encodeURIComponent(q)}`);
      items = ((await res.json()).results || []).filter(r => r && r.artworkUrl100 && !/karaoke|tribute|караоке/i.test((r.trackName || r.collectionName) + ' ' + r.artistName)).map(r => ({
        title: String((album ? r.collectionName : r.trackName) || ''), artist: String(r.artistName || ''), album: album ? '' : String(r.collectionName || ''), year: String(r.releaseDate || '').slice(0, 4),
        kind: album ? 'Альбом' : 'Трек', art: r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.'), thumb: r.artworkUrl100, link: musicLinkOk(album ? r.collectionViewUrl : r.trackViewUrl), via: '',
      }));
    }
  } catch (_) {
    if (seq === musicSeq) musicMsg('Поиск сейчас не отвечает, попробуй ещё раз.', true);
    return;
  }
  if (seq !== musicSeq) return;
  // искали вместе с исполнителем: нужны треки с этим названием, а если таких нет, ищем только по названию
  if (title) {
    const same = items.filter(c => keyOf(c.title).includes(keyOf(title)));
    if (!same.length) return searchMusic(title);
    items = same;
  }
  musicItems = items;
  renderMusicResults();
  musicMsg('');
}
// выбрали трек: исполнитель, название, год, ссылка и обложка подставляются сами
async function applyMusicPick(c) {
  form.link = musicLinkOk(c.link);
  // статус «Сингл» или «Альбом» берём из найденного, а «В планах» и другие, выбранные сами, не трогаем
  if (!form.status || form.status === 'Сингл' || form.status === 'Альбом') { form.status = c.kind === 'Альбом' ? 'Альбом' : 'Сингл'; renderStatusSet(); }
  // год из прошлого выбранного трека не должен остаться у нового
  if (musicPhotoAuto && /^(18|19|20)\d{2}$/.test((form.meta || '').trim())) form.meta = '';
  fillMusicFromCover({ title: c.title, artist: c.artist, kind: c.kind, year: c.year, genre: '' });
  const swap = !form.photo || musicPhotoAuto; // своё фото не заменяем, а обложку от прошлого выбора — да
  musicItems = [];
  renderMusicResults();
  clearTimeout(musicTimer); musicSeq++;
  musicPickedArtist = keyOf(c.artist);
  renderMusicPicked();
  scheduleDraft();
  if (c.art && swap) {
    coverItems = [{ ...c, kind: c.kind === 'Альбом' ? 'Альбом' : 'Трек' }]; coverFrom = 'music';
    await pickCover(0);
    musicPhotoAuto = !!form.photo;
    coverItems = []; renderCovers();
    if (!form.photo) musicMsg('Обложка не загрузилась');
  }
}
/* ---------- Фото исполнителя с Genius ---------- */
// работает только после входа в онлайн-аккаунт: запрос идёт через наш сервер, где лежит токен Genius
let geniusTimer = null, geniusKey = '', geniusItems = [], geniusPauseUntil = 0;
const geniusSkip = new Set(), geniusSeen = new Map(); // найденное по каждому имени, чтобы не спрашивать сервер повторно
function geniusWanted() {
  const a = (form.artist || '').trim();
  const api = window.casualApi;
  const known = artistGet(a);
  return formMusic() && a.length >= 2 && !(known && known.ava) && !geniusSkip.has(keyOf(a)) && !!api && api.online() && Date.now() >= geniusPauseUntil;
}
function scheduleGenius() {
  clearTimeout(geniusTimer);
  if (!geniusWanted()) { geniusItems = []; renderGenius(); return; }
  if (keyOf(form.artist) === geniusKey) { renderGenius(); return; }
  geniusTimer = setTimeout(findGenius, 1100); // ищем, когда имя дописано, а не на каждую букву
}
async function findGenius() {
  const k = keyOf(form.artist);
  if (!k || k === geniusKey) return;
  geniusKey = k;
  if (geniusSeen.has(k)) { geniusItems = geniusSeen.get(k); renderGenius(); return; }
  try {
    const r = await window.casualApi.get('/genius/artist?q=' + encodeURIComponent(form.artist.trim()));
    const list = ((r && r.artists) || []).filter(a => a && typeof a.image === 'string' && /^https:\/\//.test(a.image)).slice(0, 3);
    geniusSeen.set(k, list);
    if (keyOf(form.artist) !== k) return;
    geniusItems = list;
  } catch (_) {
    geniusItems = [];
    geniusPauseUntil = Date.now() + 60e3; // сервер отказал: минуту не спрашиваем
  }
  renderGenius();
}
function renderGenius() {
  const box = $('artistSugg');
  if (!box) return;
  const show = geniusItems.length > 0 && geniusWanted();
  box.hidden = !show;
  if (!show) { box.replaceChildren(); return; }
  const src = [...new Set(geniusItems.map(a => a.source || 'Genius'))].join(' и ');
  box.innerHTML = `<span>Фото с ${esc(src)}:</span>${geniusItems.map((a, i) => `<button type="button" data-genius="${i}" title="Поставить как аватарку исполнителя"><img src="${esc(a.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">${esc(a.name)}</button>`).join('')}<button type="button" class="x" data-genius="skip" aria-label="Не нужно">Не нужно</button>`;
}
async function pickGenius(i) {
  const a = geniusItems[i];
  if (!a || !keyOf(form.artist)) return;
  try {
    // картинки Genius и Deezer отдаются с разрешением CORS, поэтому сначала качаем напрямую, а через наш сервер — если не вышло
    let blob = null;
    try {
      const res = await fetch(a.image, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (res.ok) blob = await res.blob();
    } catch (_) {}
    if (!blob || !blob.size) {
      const r = await window.casualApi.get('/genius/img?u=' + encodeURIComponent(a.image));
      if (!r || typeof r.data !== 'string') throw new Error('img');
      blob = dataUrlToBlob(r.data);
    }
    const type = /^image\//.test(blob.type) ? blob.type : 'image/jpeg';
    // выбрали фото — подставляем и точное имя исполнителя оттуда же («deathmerie» → deathmarried)
    const name = String(a.name || '').trim().slice(0, 80) || form.artist.trim();
    if (keyOf(name) !== keyOf(form.artist)) { form.artist = name; el.artist.value = name; updateNameState(); scheduleDraft(); scheduleCovers(); }
    if (!(await setArtistAvaFile(name, new File([blob], 'artist.jpg', { type }), `Аватарка исполнителя «${name}» поставлена`))) return;
    geniusItems = [];
    renderGenius();
  } catch (_) {
    toast('Фото исполнителя не загрузилось, можно поставить своё');
  }
}

/* ---------- Rendering: board ---------- */
function catNameOf(r) {
  const c = state.cats.find(x => x.id === r.cat);
  return c ? (c.name.trim() || 'Без названия') : (r.catName || 'Без категории');
}
// одна и та же категория с разных устройств может прийти с разными id: в рейтинге их объединяет название
function catKey(r) { return keyOf(catNameOf(r)) || '__none'; }
function groups() {
  const m = new Map();
  for (const r of state.ratings) {
    const k = catKey(r);
    if (!m.has(k)) m.set(k, { id: k, name: catNameOf(r), n: 0 });
    m.get(k).n++;
  }
  const order = state.cats.map(c => keyOf(c.name));
  return [...m.values()].sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.name.localeCompare(b.name, 'ru');
  });
}
const stamp = r => r.updatedAt || r.createdAt || '';
function byScore(a, b) { return (b.total == null ? -1 : b.total) - (a.total == null ? -1 : a.total) || stamp(b).localeCompare(stamp(a)); }
function sortList(list) {
  const a = [...list];
  if (state.sort === 'date') a.sort((x, y) => stamp(y).localeCompare(stamp(x)));
  else if (state.sort === 'name') a.sort((x, y) => x.name.localeCompare(y.name, 'ru', { sensitivity: 'base', numeric: true }));
  else a.sort(byScore);
  return a;
}
function computeRanks(list) {
  const m = new Map();
  let prev = null, rank = 0;
  [...list].sort(byScore).forEach((r, i) => {
    if (r.total == null) { m.set(r.id, null); return; }
    if (r.total !== prev) { rank = i + 1; prev = r.total; }
    m.set(r.id, rank);
  });
  return m;
}
function resolvePhotoUrl(p) {
  if (!p) return '';
  if (p.data) return p.data;
  if (p.ref) return '';
  if (p.url) return p.url;
  if (p.id && (p.id.startsWith('data:') || p.id.startsWith('blob:') || p.id.startsWith('http://') || p.id.startsWith('https://'))) return p.id;
  return '/_blob/' + p.id;
}
function splitLines(txt) {
  return String(txt || '').split(/\r?\n/).map(s => s.replace(/^[+\-•*]\s*/, '').trim()).filter(Boolean);
}
// ссылка на трек: только сами сервисы (то же правило на сервере)
const MUSIC_LINK_RE = /^https:\/\/(open\.spotify\.com|(www\.|music\.)?youtube\.com|youtu\.be|soundcloud\.com|music\.apple\.com|(www\.)?deezer\.com)\/[^\s"'<>()\\]{1,300}$/;
function musicLinkOk(v) { return typeof v === 'string' && MUSIC_LINK_RE.test(v) ? v : ''; }
function listenHTML(r) {
  const u = musicLinkOk(r && r.link);
  if (!u) return '';
  const src = /spotify/.test(u) ? 'Spotify' : /music\.youtube/.test(u) ? 'YouTube Music' : /soundcloud/.test(u) ? 'SoundCloud' : /music\.apple/.test(u) ? 'Apple Music' : /deezer/.test(u) ? 'Deezer' : 'YouTube';
  return `<a class="e-listen" href="${esc(u)}" target="_blank" rel="noopener noreferrer">🎧 Слушать в ${src}</a>`;
}
window.CasualListen = listenHTML;
function entryHTML(r, rank, showCat) {
  const t = r.total;
  const n = r.scores.filter(s => s.v > 0).length;
  const notes = !!r.note || !!r.pros || !!r.cons || r.scores.some(s => s.note);
  const meta = [t != null ? verdict(t) : 'Без оценки', `${n} ${critWord(n)}`, fmtDate(stamp(r))].filter(Boolean).join(' · ');
  const spark = r.scores.map(s => `<i data-tier="${tierV(s.v)}" data-v="${s.v}"></i>`).join('');
  const bd = r.scores.map(s => `<li data-tier="${tierV(s.v)}"><span class="bd-name">${esc(s.name)}${s.w && s.w !== 1 ? ` <small class="crit-w-badge">×${s.w}</small>` : ''}</span><span class="bd-bar" aria-hidden="true">${cellsHTML(s.v, 'bc', false)}</span><b class="bd-v">${s.v || '—'}</b>${s.note ? `<span class="bd-note">${esc(s.note)}</span>` : ''}</li>`).join('');
  const prosList = splitLines(r.pros);
  const consList = splitLines(r.cons);
  const pcHTML = (prosList.length || consList.length)
    ? `<div class="e-pc-grid">
        ${prosList.length ? `<div class="e-pc-box pro"><span class="label pc-label-pro">➕ Плюсы</span><ul>${prosList.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${consList.length ? `<div class="e-pc-box con"><span class="label pc-label-con">➖ Минусы</span><ul>${consList.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </div>`
    : '';
  const inCmp = state.cmpIds.includes(r.id);
  // ссылкой делятся только своими настоящими оценками и только с онлайн-аккаунтом
  const shareOk = !r.example && !!window.CasualShare && window.CasualShare.ready() && (!r.author || !state.user || r.author.id === state.user.id);
  const shared = shareOk && window.CasualShare.has(r.id);
  const confirming = state.confirmDel === r.id;
  // слева две главные кнопки (изменить и удалить), справа — значки: избранное, сравнение, ссылка, картинка
  const ib = (act, icon, label, on, cls) => `<button type="button" class="btn small ghost ib${cls ? ' ' + cls : ''}${on ? ' on' : ''}" data-act="${act}" title="${label}" aria-label="${label}"${on != null ? ` aria-pressed="${!!on}"` : ''}>${icon}</button>`;
  const actions = confirming
    ? `<span class="confirm-q">Удалить «${esc(r.name)}» из рейтинга?</span><button type="button" class="btn small danger-solid" data-act="del-yes">Удалить</button><button type="button" class="btn small ghost" data-act="del-no">Отмена</button>`
    : (state.canWrite ? `<span class="e-main-acts"><button type="button" class="btn small primary act-edit" data-act="edit">${ICON.edit}Изменить</button><button type="button" class="btn small act-del" data-act="del">${ICON.trash}Удалить</button></span>` : '')
      + '<span class="e-icons">'
      + (state.canWrite ? ib('fav-card', ICON.star, r.fav ? 'Убрать из избранного' : 'В избранное', r.fav, 'fav') : '')
      + ib('cmp', ICON.scale, inCmp ? 'Выбрано для сравнения' : 'Сравнить', inCmp)
      + (shareOk ? (shared
        ? ib('link', ICON.link, 'Скопировать ссылку на отзыв', true) + ib('unlink', ICON.unlink, 'Закрыть ссылку: по ней отзыв больше не откроется')
        : ib('link', ICON.link, 'Поделиться ссылкой: отзыв увидит кто угодно, даже без аккаунта')) : '')
      + ib('share', ICON.shareLg, 'Картинка или текст')
      + '</span>';
  const pUrl = resolvePhotoUrl(r.photo);
  const aUrl = pUrl ? '' : artistAvaUrl(r);
  return `<li class="entry${state.flashId === r.id ? ' flash' : ''}" data-id="${esc(r.id)}">
<details${state.open.has(r.id) ? ' open' : ''}>
<summary><span class="sum">
<span class="rank">${rank == null ? '—' : rank}</span>
<span class="e-main">${pUrl ? `<img class="e-thumb" data-photo="thumb" src="${esc(pUrl)}" alt="" loading="lazy" decoding="async">` : aUrl ? `<img class="e-thumb ava" src="${esc(aUrl)}" alt="" loading="lazy" decoding="async">` : ''}<span class="e-text"><span class="e-name">${r.fav ? '<span class="fav-star-inline" title="В избранном">★</span>' : ''}${esc(r.name)}</span><span class="e-sub"><span>${esc(meta)}</span>${showCat ? `<span class="tag">${esc(catNameOf(r))}</span>` : ''}${r.status ? `<span class="tag status-tag">${esc(r.status)}</span>` : ''}${r.meta ? `<span class="tag meta-tag">${esc(r.meta)}</span>` : ''}${r.author && r.author.name ? `<span class="tag author-tag" title="Автор: ${esc(r.author.name)}">${renderAuthorMini(r.author)} ${esc(r.author.name)}</span>` : ''}${r.example ? '<span class="tag ex">пример</span>' : ''}${notes ? `<span class="has-note" title="Есть заметки">${ICON.noteSm}<span class="vh">есть заметки</span></span>` : ''}</span></span></span>
<span class="spark" aria-hidden="true">${spark}</span>
<span class="badge" data-tier="${tierT(t)}">${t != null ? fmt(t) : '—'}</span>
${ICON.chev}
</span></summary>
<div class="e-body">
${pUrl ? `<img class="e-photo" data-photo="body" src="${esc(pUrl)}" alt="Фото: ${esc(r.name)}" loading="lazy" decoding="async"${r.photo.w && r.photo.h ? ` width="${r.photo.w}" height="${r.photo.h}"` : ''}>` : ''}
<ul class="bd">${bd}</ul>
${listenHTML(r)}
${pcHTML}
${r.note ? `<div class="e-note"><span class="label">Заметки</span><p>${esc(r.note)}</p></div>` : ''}
${histHTML(r)}
<div class="e-actions">${actions}</div>
</div>
</details>
</li>`;
}
function renderTierBoard(list) {
  if (!el.tierBoard) return;
  const tiers = [
    { id: 'S', label: 'S', min: 9.2, range: '9,2–10', col: 'var(--good)' },
    { id: 'A', label: 'A', min: 8.2, range: '8,2–9,1', col: 'color-mix(in srgb, var(--good) 75%, var(--mid))' },
    { id: 'B', label: 'B', min: 7.0, range: '7–8,1', col: 'var(--mid)' },
    { id: 'C', label: 'C', min: 5.0, range: '5–6,9', col: 'color-mix(in srgb, var(--mid) 65%, var(--bad))' },
    { id: 'D', label: 'D', min: -1, range: 'ниже 5', col: 'var(--bad)' }
  ];
  const buckets = new Map(tiers.map(t => [t.id, []]));
  for (const r of [...list].sort(byScore)) {
    const val = r.total != null ? r.total : 0;
    const t = tiers.find(x => val >= x.min) || tiers[tiers.length - 1];
    buckets.get(t.id).push(r);
  }
  el.tierBoard.innerHTML = tiers.map(t => {
    const items = buckets.get(t.id);
    const itemsHTML = items.length
      ? items.map(r => {
          const pUrl = resolvePhotoUrl(r.photo) || artistAvaUrl(r);
          return `<button type="button" class="tier-item" data-tier-goto="${esc(r.id)}" title="${esc(r.name)} (${r.total != null ? fmt(r.total) : '—'})">
            ${pUrl ? `<img src="${esc(pUrl)}" alt="">` : ''}
            <span>${r.fav ? '★ ' : ''}${esc(r.name)}</span>
            <b>${r.total != null ? fmt(r.total) : '—'}</b>
          </button>`;
        }).join('')
      : `<span style="font-size:12.5px;color:var(--ink-3);padding-left:4px;">Пусто</span>`;
    return `<div class="tier-row">
      <div class="tier-head" style="--tier-bg:${t.col}" title="${t.id}: итоговый балл ${t.range}${t.id === 'D' ? ', и оценки без балла' : ''}">${t.label}<small>${t.range}</small></div>
      <div class="tier-items">${itemsHTML}</div>
    </div>`;
  }).join('');
}
// жанры и теги из описания «2010, фантастика, боевик»: всё через запятую, кроме года
function genresOf(r) {
  return [...new Set(String((r && r.meta) || '').split(/\s*[,;]\s*/).map(s => s.trim().toLowerCase()).filter(s => s && s.length <= 24 && !/^\d{4}$/.test(s)))];
}
// выбранные жанры нужны все сразу
const hasGenres = (r) => !state.genres.length || (gs => state.genres.every(g => gs.includes(g)))(genresOf(r));
function genreChipsHTML(pool) {
  const n = new Map();
  pool.forEach(r => genresOf(r).forEach(g => n.set(g, (n.get(g) || 0) + 1)));
  state.genres.forEach(g => { if (!n.has(g)) n.set(g, 0); });
  const list = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  return { any: list.length > 0, html: list.map(([g, k]) => `<button type="button" class="chip-btn" data-genre="${esc(g)}" aria-pressed="${state.genres.includes(g)}">${esc(g)} <b>${k}</b></button>`).join('')
    + (state.genres.length ? '<button type="button" class="chip-btn genre-reset" data-genre="*">✕ Сбросить</button>' : '') };
}
function toggleGenre(g) {
  state.genres = g === '*' ? [] : state.genres.includes(g) ? state.genres.filter(x => x !== g) : [...state.genres, g];
  renderBoard(); // заодно перерисует тир-лист в статистике
}
function applySubFilter(list) {
  switch (state.sfilter) {
    case 'fav': return list.filter(r => r.fav);
    case 'mine': return list.filter(r => state.user ? (r.author && r.author.id === state.user.id) : (r.author && r.author.name === 'Гость'));
    case 'master': return list.filter(r => r.total != null && r.total >= 8.5);
    case 'good': return list.filter(r => r.total != null && r.total >= 7.5);
    case 'mid': return list.filter(r => r.total != null && r.total >= 5 && r.total < 7.5);
    case 'bad': return list.filter(r => r.total != null && r.total < 5);
    case 'plan': return list.filter(r => /В планах/.test(r.status || ''));
    case 'doing': return list.filter(r => /В процессе/.test(r.status || ''));
    default: return list;
  }
}
// Оценка с другого устройства ссылается на категорию, которой здесь нет (категории не синхронизируются, только оценки).
// Есть здесь категория с тем же названием: привязываем оценку к ней, а её критерии к местным по названию.
// Нет такой: создаём категорию из критериев оценки с тем же id, что и на другом устройстве. Так у оценки снова есть «Настроить».
function unifyCats() {
  const byId = new Map(state.cats.map(c => [c.id, c]));
  const byName = new Map();
  state.cats.forEach(c => { const k = keyOf(c.name); if (k && !byName.has(k)) byName.set(k, c); });
  let ratings = false, cats = false;
  for (const r of state.ratings) {
    if (!r || r.example || !r.cat || byId.has(r.cat)) continue;
    const k = keyOf(r.catName);
    if (!k) continue;
    let c = byName.get(k);
    if (!c) {
      if (state.cats.length >= MAX_CATS) continue;
      const crit = r.scores.slice(0, MAX_CRIT).map(x => ({ id: x.id, name: x.name, desc: x.desc || '' }));
      c = { id: r.cat, name: String(r.catName).slice(0, 40), criteria: crit.length ? crit : NEW_CAT_CRITERIA.map(x => ({ id: newId('c'), name: x.name, desc: x.desc })) };
      state.cats.push(c); byId.set(c.id, c); byName.set(k, c);
      cats = true;
      continue;
    }
    const local = new Map(c.criteria.map(x => [keyOf(x.name), x.id]));
    const used = new Set();
    r.scores = r.scores.map(x => {
      const id = local.get(keyOf(x.name));
      if (!id || used.has(id)) return x;
      used.add(id);
      return id === x.id ? x : Object.assign({}, x, { id });
    });
    r.cat = c.id;
    ratings = true;
  }
  if (cats) { scheduleCatSave(0); renderCats(); }
  if (ratings && state.mode !== 'db') saveLocalRatings();
  return ratings || cats;
}
function renderBoard() {
  if (state.loaded) { unifyCats(); migrateWatched(); }
  const gs = groups();
  if (state.filter !== 'all' && !gs.some(g => g.id === state.filter)) state.filter = 'all';
  const showFilters = gs.length >= 2;
  el.filters.hidden = !showFilters;
  el.filters.innerHTML = showFilters
    ? `<button type="button" class="chip-btn" data-filter="all" aria-pressed="${state.filter === 'all'}">Все <b>${state.ratings.length}</b></button>`
      + gs.map(g => `<button type="button" class="chip-btn" data-filter="${esc(g.id)}" aria-pressed="${state.filter === g.id}">${esc(g.name)} <b>${g.n}</b></button>`).join('')
    : '';
  if (el.subFilters) {
    el.subFilters.hidden = false; // всегда видно: даже без своих оценок нужен вход к друзьям во «Мои»
    el.subFilters.querySelectorAll('button[data-sfilter]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.sfilter === state.sfilter));
    });
  }
  if (el.layoutGroup) {
    el.layoutGroup.querySelectorAll('button[data-bmode]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.bmode === state.bmode));
    });
  }
  // на кнопке «Вид и фильтры» видно, что включено не по умолчанию
  const moreHint = document.getElementById('boardMoreHint');
  if (moreHint) {
    const parts = [
      { date: 'новые', name: 'А–Я' }[state.sort],
      { master: '8.5+', good: '7.5+', mid: '5–7.4', bad: 'до 5', plan: 'в планах', doing: 'в процессе' }[state.sfilter],
      state.genres.length ? (state.genres.length === 1 ? state.genres[0] : 'жанров: ' + state.genres.length) : '',
    ].filter(Boolean);
    moreHint.textContent = parts.length ? ' · ' + parts.join(' · ') : '';
  }
  const catPool = state.filter === 'all' ? state.ratings : state.ratings.filter(r => catKey(r) === state.filter);
  const subPool = applySubFilter(catPool);
  // жанры — раздел в окне «Фильтры»
  const gSec = document.getElementById('genreSec'), gBox = document.getElementById('genreChips');
  if (gSec && gBox) {
    const g = genreChipsHTML(subPool);
    gSec.hidden = !g.any;
    gBox.innerHTML = g.html;
  }
  const pool = subPool.filter(hasGenres);
  const rated = pool.filter(r => r.total != null);
  const avg = rated.length ? round1(rated.reduce((a, r) => a + r.total, 0) / rated.length) : null;
  el.boardStat.textContent = !state.loaded ? 'Загружаю рейтинг…'
    : !state.ratings.length ? 'Пока ни одной оценки'
    : `${pool.length} ${plural(pool.length, 'оценка', 'оценки', 'оценок')}` + (avg != null ? ` · средний балл ${fmt(avg)}` : '');
  el.searchWrap.hidden = state.ratings.length < 2;
  if (el.searchWrap.hidden && state.query) { state.query = ''; el.search.value = ''; }
  const q = keyOf(state.query);
  const ranks = computeRanks(pool);
  const list = sortList(pool).filter(r => {
    if (!q) return true;
    const hay = [r.nameKey, keyOf(r.meta), keyOf(r.status), keyOf(r.note), keyOf(r.pros), keyOf(r.cons), keyOf(r.author && r.author.name)].join(' ');
    return hay.includes(q);
  });
  const showCat = state.filter === 'all' && showFilters;
  const isTiers = state.bmode === 'tiers';
  el.board.classList.toggle('grid-mode', state.bmode === 'grid');
  if (isTiers) {
    el.board.hidden = true;
    el.tierBoard.hidden = !list.length;
    renderTierBoard(list);
  } else {
    if (el.tierBoard) el.tierBoard.hidden = true;
    el.board.innerHTML = list.map(r => entryHTML(r, ranks.get(r.id), showCat)).join('');
    el.board.hidden = !list.length;
  }
  el.noMatch.hidden = !((catPool.length > 0) && !list.length);
  el.empty.hidden = state.ratings.length > 0;
  el.exampleBar.hidden = !(state.canWrite && state.ratings.some(r => r.example));
  el.mnavCount.textContent = state.ratings.length ? String(state.ratings.length) : '';
  renderStats();
  updateCmpTray();
  if (pendingFocus) {
    const t = el.board.querySelector(pendingFocus);
    pendingFocus = null;
    if (t) t.focus({ preventScroll: true });
  }
}
function renderNotice() {
  let msg = '';
  if (!state.canWrite) msg = 'Сохранять и менять оценки здесь может только владелец страницы. Ползунки и экспорт работают.';
  el.boardNotice.textContent = msg;
  el.boardNotice.hidden = !msg;
  el.offlineBar.hidden = true;
}
function syncSort() {
  el.sortGroup.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('show');
  void el.toast.offsetWidth;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800);
}

/* ---------- Form actions ---------- */
function setScore(id, v) {
  v = clampInt(v, 0, 10);
  if ((form.scores[id] || 0) === v) return;
  if (v) form.scores[id] = v; else delete form.scores[id];
  updateRow(id);
  updateTotal();
  scheduleDraft();
}
function resetForm(cat) {
  musicMsg('');
  musicClear();
  revokeFormPhoto();
  form = blankForm(cat && state.cats.some(c => c.id === cat) ? cat : undefined);
  state.editCat = false;
  state.catDelConfirm = false;
  renderForm();
  saveDraft();
}
function loadIntoForm(r) {
  revokeFormPhoto();
  const cat = state.cats.find(c => c.id === r.cat) || null;
  const ids = new Set(cat ? cat.criteria.map(c => c.id) : []);
  form = blankForm(r.cat);
  form.cat = r.cat;
  form.editingId = r.id;
  form.name = r.name;
  if (r.artist) {
    form.artist = r.artist;
    form.name = r.title || (r.name.startsWith(r.artist + ' — ') ? r.name.slice(r.artist.length + 3) : r.name);
  } else if (isMusicCat(cat) && r.name.includes(' — ')) {
    const i = r.name.indexOf(' — ');
    form.artist = r.name.slice(0, i);
    form.name = r.name.slice(i + 3);
  }
  form.fav = !!r.fav;
  form.status = fitStatus(r.status || '');
  form.meta = r.meta || '';
  form.link = musicLinkOk(r.link);
  form.pros = r.pros || '';
  form.cons = r.cons || '';
  form.note = r.note || '';
  form.extraCatName = r.catName || '';
  // ref: фото лежит только на сервере, в этом браузере его сейчас нет. Без этой ссылки сохранение правки выбросило бы фото из оценки
  form.photo = r.photo ? { kind: 'saved', id: r.photo.id, data: r.photo.data || '', w: r.photo.w, h: r.photo.h, ...(r.photo.ref ? { ref: r.photo.ref } : {}) } : null;
  for (const s of r.scores) {
    if (s.v > 0) form.scores[s.id] = s.v;
    if (s.note) form.notes[s.id] = s.note;
    if (s.w && s.w !== 1) form.weights[s.id] = s.w;
    if (!ids.has(s.id)) form.extra.push({ id: s.id, name: s.name, desc: s.desc || '' });
  }
  form.ownOnly = !!cat && r.scores.length > 0 && !r.scores.some(s => ids.has(s.id)) && !lbOnly(r);
  state.editCat = false;
  state.catDelConfirm = false;
  renderForm();
  saveDraft();
  if (isNarrow()) { setSection('rate'); scrollToSectionTop(); }
  else el.rater.scrollIntoView({ behavior: smoothScroll(), block: 'start' });
  toast(`Открыто для правки: ${r.name}`);
}
// Раньше шаблон переписывал категорию вместе с её оценками: у оценок оставались старые критерии,
// а категория становилась, например, «Музыкой». Такие оценки (ни одного общего критерия с категорией)
// получают свою категорию с прежними критериями; название берётся из подходящего шаблона.
function repairOverwrittenCats() {
  // раньше сюда попадали фильмы из Letterboxd и уезжали в категорию «Фильмы (прежние критерии)»
  // с одним критерием «Оценка с Letterboxd» — возвращаем их обратно и убираем такую категорию
  const lbCats = state.cats.filter(c => c.criteria.length && c.criteria.every(k => k.id === LB_SCORE));
  let healed = 0;
  for (const c of lbCats) {
    const base = keyOf(c.name.replace(/(\s*\(прежние критерии\))+$/u, ''));
    const home = state.cats.find(x => x !== c && !lbCats.includes(x) && keyOf(x.name) === base);
    if (!home) {
      const st = STARTERS.find(s => s.id === 'films');
      c.name = c.name.replace(/(\s*\(прежние критерии\))+$/u, '') || st.name;
      c.criteria = st.criteria.map(k => ({ ...k, id: newId('c') }));
      state.ratings.forEach(r => { if (r.cat === c.id) r.catName = c.name; });
      healed++;
      continue;
    }
    state.ratings.forEach(r => { if (r.cat === c.id) { r.cat = home.id; r.catName = home.name; } });
    state.cats = state.cats.filter(x => x !== c);
    if (form.cat === c.id) form.cat = home.id;
    healed++;
  }
  if (healed) { saveLocalCats(); saveLocalRatings(); }
  const byId = new Map(state.cats.map(c => [c.id, c]));
  const broken = state.ratings.filter(r => {
    if (r.example || !r.scores || !r.scores.length || lbOnly(r)) return false;
    const cat = byId.get(r.cat);
    if (!cat) return false;
    const ids = new Set(cat.criteria.map(k => k.id));
    return !r.scores.some(s => ids.has(s.id));
  });
  if (!broken.length) return;
  // оценки с общими критериями — одна прежняя категория
  const groups = [];
  for (const r of broken) {
    const ids = new Set(r.scores.map(x => x.id));
    let g = groups.find(x => x.cat === r.cat && r.scores.some(sc => x.ids.has(sc.id)));
    if (!g) { g = { cat: r.cat, ids: new Set(), crit: [], list: [] }; groups.push(g); }
    for (const sc of r.scores) if (!g.ids.has(sc.id)) { g.ids.add(sc.id); g.crit.push({ id: sc.id, name: sc.name, desc: sc.desc || '', w: sc.w || 1 }); }
    ids.forEach(i => g.ids.add(i));
    g.list.push(r);
  }
  const key = (t) => keyOf(t);
  const guess = (crit) => {
    const names = new Set(crit.map(k => key(k.name)));
    let best = null, bestHit = 0;
    for (const t of [...STARTERS, ...CAT_TEMPLATES]) {
      const hit = t.criteria.filter(k => names.has(key(k.name))).length;
      if (hit > bestHit && hit >= Math.ceil(Math.min(names.size, t.criteria.length) * 0.6)) { best = t.name; bestHit = hit; }
    }
    return best;
  };
  let made = 0;
  for (const g of groups) {
    if (state.cats.length >= MAX_CATS) break;
    const old = byId.get(g.cat);
    let name = guess(g.crit) || `${old ? old.name : 'Категория'} (прежние критерии)`;
    if (state.cats.some(c => c.name === name)) name = `${name} (прежние критерии)`;
    const nc = { id: newId('k'), name: name.slice(0, 40), criteria: g.crit.slice(0, MAX_CRIT) };
    state.cats.push(nc);
    g.list.forEach(r => { r.cat = nc.id; r.catName = nc.name; });
    made++;
  }
  if (!made) return;
  saveLocalCats();
  saveLocalRatings();
  setTimeout(() => toast(made === 1 ? 'Вернул оценкам их прежнюю категорию, которую перезаписал шаблон' : `Вернул оценкам их прежние категории (${made}), которые перезаписал шаблон`), 600);
}
// Перенос сохранённой оценки в другую категорию: баллы, заметки и веса переходят на критерии
// с тем же названием, остальные оценённые критерии остаются у оценки своими — ничего не теряется.
function moveRatingCat(id) {
  const nc = state.cats.find(c => c.id === id);
  if (!nc) return;
  const wasMusic = formMusic();
  const rows = formRows();
  const byName = new Map(nc.criteria.map(k => [keyOf(k.name), k.id]));
  const own = new Set(nc.criteria.map(k => k.id));
  const used = new Set();
  const scores = {}, notes = {}, weights = {}, extra = [];
  for (const r of rows) {
    let to = byName.get(keyOf(r.name));
    if (!to || used.has(to)) to = own.has(r.id) && !used.has(r.id) ? r.id : null;
    const has = form.scores[r.id] != null || !!form.notes[r.id];
    const target = to || r.id;
    if (to) used.add(to);
    if (form.scores[r.id] != null) scores[target] = form.scores[r.id];
    if (form.notes[r.id]) notes[target] = form.notes[r.id];
    if (form.weights[r.id]) weights[target] = form.weights[r.id];
    if (!to && has) extra.push({ id: r.id, name: r.name, desc: r.desc || '' });
  }
  form.cat = id;
  form.scores = scores; form.notes = notes; form.weights = weights; form.extra = extra;
  form.ownOnly = false;
  form.extraCatName = '';
  // из музыки в другую категорию: исполнитель остаётся в названии
  if (wasMusic && !isMusicCat(nc) && (form.artist || '').trim()) {
    form.name = composeName(form.artist.trim(), form.name.trim());
    form.artist = '';
    if (el.name) el.name.value = form.name;
  }
  form.status = fitStatus(form.status);
  state.catDelConfirm = false;
  renderStatusSet();
  renderArtist();
  renderCats();
  renderCrit();
  updateTotal();
  updateNameState();
  scheduleDraft();
  toast(`Оценка переедет в «${nc.name}», когда нажмёшь «Обновить»`);
}
function switchCat(id) {
  if (id === form.cat || !state.cats.some(c => c.id === id)) return;
  if (form.editingId) { if (state.editCat) toggleEditCat(); moveRatingCat(id); return; }
  const prev = currentCat();
  if (prev && state.editCat) normalizeCat(prev);
  form.cat = id;
  form.extra = [];
  form.status = fitStatus(form.status);
  state.catDelConfirm = false;
  renderStatusSet();
  renderArtist();
  renderCats();
  renderCrit();
  updateTotal();
  updateNameState();
  scheduleDraft();
  if (state.editCat) scheduleCatSave(0);
}
function normalizeCat(cat) {
  cat.name = cat.name.trim().replace(/\s+/g, ' ') || 'Без названия';
  cat.criteria.forEach((c, i) => {
    c.name = c.name.trim().replace(/\s+/g, ' ') || `Критерий ${i + 1}`;
    c.desc = (c.desc || '').trim().replace(/\s+/g, ' ');
  });
}
function toggleEditCat() {
  const cat = currentCat();
  if (!cat) return;
  if (state.editCat) {
    normalizeCat(cat);
    state.editCat = false;
    state.catDelConfirm = false;
    renderCats();
    renderCrit();
    updateTotal();
    scheduleCatSave(0);
  } else {
    state.editCat = true;
    renderCrit();
  }
}
function newCategory() {
  if (form.editingId) return;
  if (state.cats.length >= MAX_CATS) { toast(`Можно создать до ${MAX_CATS} категорий`); return; }
  const prev = currentCat();
  if (prev && state.editCat) normalizeCat(prev);
  const cat = { id: newId('k'), name: 'Новая категория', criteria: NEW_CAT_CRITERIA.map(c => ({ id: newId('c'), name: c.name, desc: c.desc })) };
  state.cats.push(cat);
  form.cat = cat.id;
  form.extra = [];
  state.editCat = true;
  state.catDelConfirm = false;
  renderCats();
  renderCrit();
  updateTotal();
  updateNameState();
  scheduleCatSave(0);
  scheduleDraft();
  const inp = document.getElementById('catNameInput');
  if (inp) { inp.focus(); inp.select(); }
}
function catRatings(cat) {
  if (!cat) return [];
  const known = new Set(state.cats.map(c => c.id));
  const k = keyOf(cat.name);
  return state.ratings.filter(r => r && (r.cat === cat.id || (!known.has(r.cat) && k && keyOf(r.catName) === k)));
}
const catDelText = (cat) => {
  const n = catRatings(cat).filter(r => !r.example).length;
  return n ? `Удалить «${esc(cat.name)}» вместе с ${n} ${plural(n, 'оценкой', 'оценками', 'оценками')}? Они пропадут и на других устройствах.` : `Удалить «${esc(cat.name)}»?`;
};
// Категория удаляется по-настоящему: вместе со своими оценками. Если оставить оценки,
// unifyCats на следующей отрисовке создаст категорию заново по их названию.
async function deleteCategory(id) {
  if (state.cats.length <= 1) return;
  const gone = state.cats.find(c => c.id === id);
  const doomed = catRatings(gone);
  for (const r of doomed) {
    try { await removeRating(r.id); } catch (e) { handleWriteError(e); return; }
    state.open.delete(r.id);
    if (r.example) continue;
    // как при обычном удалении оценки: запись в журнал и фото
    logEvent({ kind: 'rating', op: 'delete', ref: r.id, name: r.name, cat: r.cat, catName: catNameOf(r), total: r.total, info: ratingInfo(r) });
    if (r.photo) dropAsset(r.photo.id);
    if (form.editingId === r.id) form.editingId = null;
  }
  state.cats = state.cats.filter(c => c.id !== id);
  state.editCat = false;
  state.catDelConfirm = false;
  // удалили выбранную категорию: переключаемся на первую, иначе выбор не трогаем
  if (form.cat === id || !state.cats.some(c => c.id === form.cat)) {
    form.cat = state.cats[0].id;
    form.extra = [];
  }
  renderForm();
  renderBoard();
  scheduleCatSave(0);
  scheduleDraft();
  const n = doomed.filter(r => !r.example).length;
  toast(n ? `Категория «${gone ? gone.name : ''}» удалена вместе с ${n} ${plural(n, 'оценкой', 'оценками', 'оценками')}` : `Категория «${gone ? gone.name : ''}» удалена`);
}

async function save() {
  if (state.saving) return;
  if (!state.canWrite) { toast('Сохранять оценки здесь может только владелец страницы'); return; }
  if (state.editCat) toggleEditCat();
  const title = form.name.trim().replace(/\s+/g, ' ');
  if (!title) { updateNameState(formMusic() ? 'Напиши название трека или альбома' : 'Напиши, что оцениваешь'); el.name.focus(); return; }
  const artist = formMusic() ? (form.artist || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  const name = composeName(artist, title).slice(0, 140);
  const rows = formRows();
  if (!rows.length) { toast('Сначала выбери категорию'); return; }
  let scores = collectScores(rows);
  // переоценили фильм из Letterboxd по критериям: его общий балл больше не нужен
  if (scores.some(s => s.id !== LB_SCORE)) scores = scores.filter(s => s.id !== LB_SCORE);
  const t = totalOf(scores);
  if (t == null && !noScoreOk(form.status)) {
    el.total.classList.remove('nudge'); void el.total.offsetWidth; el.total.classList.add('nudge');
    toast('Оцени хотя бы один критерий или отметь «В планах»');
    return;
  }
  const dup = findDup();
  if (dup && form.editingId) { updateNameState(); el.name.focus(); return; }
  const target = (form.editingId && state.ratings.find(r => r.id === form.editingId)) || dup || null;
  const id = target ? target.id : newId('r');
  const cat = currentCat();
  const now = new Date().toISOString();
  const doc = {
    cat: form.cat,
    catName: cat ? (cat.name.trim() || 'Без названия') : (form.extraCatName || (target && target.catName) || 'Без категории'),
    name, nameKey: keyOf(name), scores, total: t,
    fav: !!form.fav,
    status: (form.status || '').trim().slice(0, 40),
    meta: (form.meta || '').trim().slice(0, 80),
    ...(formMusic() && form.link ? { link: form.link } : {}),
    pros: (form.pros || '').trim().slice(0, 1000),
    cons: (form.cons || '').trim().slice(0, 1000),
    note: form.note.trim().slice(0, 4000),
    example: false,
    createdAt: (target && target.createdAt) || now,
    updatedAt: now
  };
  if (fromLb(target)) doc.src = 'letterboxd'; // значок Letterboxd остаётся и после переоценки
  if (target && target.lbName) doc.lbName = target.lbName;
  if (artist) {
    doc.artist = artist;
    doc.title = title;
    const a = artistGet(artist);
    if (a && a.fp) doc.artistAva = a.fp;
  }
  state.saving = true;
  updateHead();
  const p = form.photo;
  let uploaded = null;
  try {
    await ready;
    if (cropPending) await cropPending;
    let photo = null;
    if (p && p.kind === 'new') {
      try { uploaded = await uploadPhoto(p.blob); }
      catch (err) { handleAssetError(err); return; }
      photo = { id: uploaded.id, data: uploaded.data || '', w: p.w, h: p.h };
    } else if (p && p.kind === 'saved') {
      photo = { id: p.id, data: p.data || '', w: p.w || 0, h: p.h || 0, ...(p.ref ? { ref: p.ref } : {}) };
    } else if (!p && !form.editingId && target && target.photo) {
      photo = target.photo;
    }
    if (photo) doc.photo = photo;
    state.flashId = id;
    await putRating(id, doc);
    logRatingSave(target, id, doc, rows.length);
    const oldId = target && target.photo ? target.photo.id : null;
    if (oldId && (!photo || photo.id !== oldId)) dropAsset(oldId);
    resetForm(form.cat);
    toast(`${target ? 'Оценка обновлена' : 'Сохранено'}: ${name}${t != null ? ', ' + fmt(t) : ''}`);
    setTimeout(() => { if (state.flashId === id) state.flashId = null; }, 2000);
  } catch (e) {
    state.flashId = null;
    if (uploaded) dropAsset(uploaded.id);
    if (e && e.code === 'photo_off') toast('Фото здесь сейчас недоступны. Убери фото или обнови страницу');
    else handleWriteError(e);
  } finally {
    state.saving = false;
    updateHead();
  }
}

/* ---------- Storage ---------- */
async function withRetry(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.code === 'unavailable') { await sleep(300 + Math.random() * 500); return await fn(); }
    throw e;
  }
}
async function putRating(id, data) {
  if (state.mode === 'db') { await withRetry(() => state.db.collection('ratings').doc(id).set(data)); return; }
  const r = normalizeRating(id, data);
  if (!r.author) {
    r.author = state.user ? { id: state.user.id, name: state.user.name, avatar: state.user.avatar || state.user.name.charAt(0).toUpperCase(), color: state.user.color || '#3550E8' } : { name: 'Гость' };
  }
  const i = state.ratings.findIndex(x => x.id === id);
  if (i >= 0) state.ratings[i] = r; else state.ratings.push(r);
  saveLocalRatings();
  renderBoard();
}
async function removeRating(id) {
  if (state.mode === 'db') { await withRetry(() => state.db.collection('ratings').doc(id).delete()); return; }
  state.ratings = state.ratings.filter(r => r.id !== id);
  saveLocalRatings();
  renderBoard();
}
function handleWriteError(e) {
  const code = e && e.code;
  if (code === 'invalid_argument') {
    state.canWrite = false;
    renderNotice(); updateHead(); renderBoard(); renderPhoto();
    toast('Сохранять здесь может только владелец страницы');
  } else if (code === 'quota_exceeded') {
    toast('Хранилище заполнено. Удали несколько старых оценок и попробуй снова');
  } else if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') {
    toast('Сохранение сейчас недоступно. Обнови страницу');
  } else {
    toast('Не получилось сохранить. Проверь соединение и попробуй ещё раз');
  }
}
function normalizeRating(id, d) {
  if (!d || typeof d.name !== 'string' || !d.name.trim()) return null;
  const scores = (Array.isArray(d.scores) ? d.scores : [])
    .filter(s => s && typeof s.id === 'string' && typeof s.name === 'string')
    .slice(0, 40)
    .map(s => ({
      id: s.id, name: s.name.slice(0, 60), desc: str(s.desc).slice(0, 120),
      w: (typeof s.w === 'number' && [0.5, 1, 2].includes(s.w)) ? s.w : 1,
      v: clampInt(s.v, 0, 10), note: str(s.note).slice(0, 200)
    }));
  return {
    id, cat: str(d.cat), catName: str(d.catName).slice(0, 60),
    name: d.name.slice(0, 140), nameKey: keyOf(d.name), scores, total: totalOf(scores),
    fav: d.fav === true,
    status: str(d.status).slice(0, 40),
    meta: str(d.meta).slice(0, 80),
    ...(musicLinkOk(d.link) ? { link: musicLinkOk(d.link) } : {}),
    pros: str(d.pros).slice(0, 1000),
    cons: str(d.cons).slice(0, 1000),
    note: str(d.note).slice(0, 4000), example: d.example === true,
    author: (d.author && typeof d.author === 'object') ? { id: str(d.author.id), name: str(d.author.name), avatar: str(d.author.avatar), color: str(d.author.color) } : null,
    photo: normPhoto(d.photo),
    ...(d.src === 'letterboxd' ? { src: 'letterboxd' } : {}),
    ...(str(d.lbName).trim() ? { lbName: str(d.lbName).slice(0, 140) } : {}), // название в Letterboxd, если оценку переименовали
    ...(str(d.artist).trim() ? { artist: str(d.artist).slice(0, 80), title: str(d.title).slice(0, 140), artistAva: str(d.artistAva).slice(0, 40) } : {}),
    createdAt: str(d.createdAt), updatedAt: str(d.updatedAt)
  };
}
function parseCats(d) {
  if (!d || !Array.isArray(d.items)) return null;
  const seen = new Set();
  const out = [];
  for (const c of d.items.slice(0, MAX_CATS)) {
    if (!c || typeof c.id !== 'string' || seen.has(c.id) || !Array.isArray(c.criteria)) continue;
    const crit = [];
    for (const k of c.criteria.slice(0, MAX_CRIT)) {
      if (!k || typeof k.id !== 'string' || seen.has(k.id)) continue;
      seen.add(k.id);
      crit.push({ id: k.id, name: str(k.name).slice(0, 40), desc: str(k.desc).slice(0, 120), w: (typeof k.w === 'number' && [0.5, 1, 2].includes(k.w)) ? k.w : 1 });
    }
    if (!crit.length) continue;
    seen.add(c.id);
    out.push({ id: c.id, name: str(c.name).slice(0, 40) || 'Без названия', criteria: crit });
  }
  return out;
}
function serializeCats() {
  return state.cats.map(c => ({
    id: c.id,
    name: c.name.trim() || 'Без названия',
    criteria: c.criteria.map((k, i) => ({ id: k.id, name: k.name.trim() || `Критерий ${i + 1}`, desc: (k.desc || '').trim(), w: k.w || 1 }))
  }));
}
let catTimer = null, catBusy = false, catAgain = false, catPendingLocal = false;
function scheduleCatSave(delay = 700) {
  if (state.mode === 'loading') { catPendingLocal = true; return; }
  clearTimeout(catTimer);
  catTimer = setTimeout(flushCats, delay);
}
async function flushCats() {
  catTimer = null;
  const items = serializeCats();
  if (state.mode === 'db') {
    if (!state.db || !state.canWrite) return;
    if (catBusy) { catAgain = true; return; }
    catBusy = true;
    try {
      await withRetry(() => state.db.doc('settings/categories').set({ items, updatedAt: new Date().toISOString() }));
      logCats(items);
    } catch (e) {
      handleWriteError(e);
    } finally {
      catBusy = false;
      if (catAgain) { catAgain = false; flushCats(); }
    }
    return;
  }
  // Local mode:
  saveLocalCats();
  logCats(items);
}

let ratingsSig = '';
function onRatings(snap) {
  const list = [];
  for (const d of snap.docs) { const r = normalizeRating(d.id, d.data()); if (r) list.push(r); }
  const first = !state.loaded;
  state.loaded = true;
  if (form.editingId && !snap.metadata.fromCache && !list.some(r => r.id === form.editingId)) {
    form.editingId = null;
    renderCats();
  }
  const sig = JSON.stringify(list);
  if (!first && sig === ratingsSig) { updateNameState(); return; }
  ratingsSig = sig;
  state.ratings = list;
  renderBoard();
  renderLog();
  updateNameState();
}
function onCats(snap) {
  if (drag) { setTimeout(() => onCats(snap), 250); return; }
  const first = !state.catsLoaded;
  state.catsLoaded = true;
  let items = snap.exists ? parseCats(snap.data()) : null;
  if (!items || !items.length) items = clone(STARTERS);
  if (first) catFlushed = catMap(items);
  if (catPendingLocal) { catPendingLocal = false; flushCats(); if (first) renderForm(); return; }
  if (state.editCat || catTimer || catBusy) { if (first) renderForm(); return; }
  if (JSON.stringify(items) !== JSON.stringify(state.cats)) {
    state.cats = items;
    if (!first) { catFlushed = catMap(items); catSessions.clear(); }
    if (!form.editingId && !currentCat()) form.cat = state.cats[0].id;
    renderForm();
    renderBoard();
  } else if (first) {
    if (!form.editingId && !currentCat()) form.cat = state.cats[0].id;
    renderForm();
  }
}
let unsubs = [], resubscribed = false;
function subscribe() {
  unsubs.forEach(u => { try { u(); } catch (_) {} });
  unsubs = [
    state.db.collection('ratings').onSnapshot(onRatings, onDbError),
    state.db.doc('settings/categories').onSnapshot(onCats, onDbError),
    state.db.collection('log').orderBy('date', 'desc').limit(400).onSnapshot(onLog, onLogError)
  ];
}
function onLogError(e) {
  if (e && e.code === 'unavailable' && !resubscribed) { resubscribed = true; setTimeout(subscribe, 1500); return; }
  LOG.loaded = true;
  LOG.error = true;
  logReadyResolve(false);
  renderLogStat();
}
function onDbError(e) {
  const code = e && e.code;
  if (code === 'unavailable' && !resubscribed) { resubscribed = true; setTimeout(subscribe, 1500); return; }
  if (code === 'revoked') { state.canWrite = false; renderNotice(); updateHead(); }
  el.boardStat.textContent = 'Рейтинг сейчас не загружается. Обнови страницу';
}
async function initStorage() {
  loadUsers();
  renderUserBar();
  const c = window.claude;
  const has = !!(c && typeof c.use === 'function');
  if (has) c.use('downloads').then(d => { state.downloads = d || null; }, () => {});
  if (has) c.use('assets').then(a => { state.assets = a || null; renderPhoto(); }, () => {});
  let db = null;
  if (has) { try { db = await c.use('db'); } catch (_) { db = null; } }
  if (!db) {
    state.mode = 'local';
    state.canWrite = true;
    try {
      const savedCats = JSON.parse(localStorage.getItem(STORAGE_KEYS.CATS) || 'null');
      if (savedCats && Array.isArray(savedCats) && savedCats.length) {
        state.cats = parseCats({ items: savedCats });
      }
      if (migrateCats(state.cats)) saveLocalCats();
    } catch (_) {}
    state.photoStore = window.CasualPhotos ? await window.CasualPhotos.ready : false;
    try {
      const savedRatings = JSON.parse(localStorage.getItem(STORAGE_KEYS.RATINGS) || 'null');
      if (savedRatings && Array.isArray(savedRatings)) {
        await hydratePhotos(savedRatings);
        // старые оценки хранили фото прямо в себе (и дважды): переносим в IndexedDB и освобождаем место
        const inline = savedRatings.some(r => r && (photoDataOf(r.photo) || (r.author && /^data:/.test(r.author.avatar || ''))));
        // одна битая запись не должна оставить человека без всех оценок (пустой список потом затёр бы сохранённые)
        state.ratings = savedRatings.map(r => (r && typeof r.id === 'string' ? normalizeRating(r.id, r) : null)).filter(Boolean);
        if (inline && state.photoStore) saveLocalRatings();
        // черновик с сохранённым фото: оно тоже в IndexedDB
        if (form.photo && form.photo.ref && !form.photo.data) {
          const d = await window.CasualPhotos.get(form.photo.ref);
          if (typeof d === 'string') form.photo = { kind: 'saved', id: d, data: d, w: form.photo.w, h: form.photo.h };
        }
      } else {
        state.ratings = clone(STARTER_RATINGS).map(r => normalizeRating(r.id, r));
        saveLocalRatings();
      }
    } catch (_) {}
    try {
      const savedLog = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOG) || 'null');
      // индекс нужен сразу: по нему в карточке оценки показывается «История», без него она пропадала после перезагрузки
      if (savedLog && Array.isArray(savedLog)) { LOG.entries = readLog(savedLog); indexLog(); }
    } catch (_) {}
    state.loaded = true;
    state.catsLoaded = true;
    LOG.loaded = true;
    logReadyResolve(false);
    repairOverwrittenCats();
    fillDraftFromRating();
    if (!form.editingId && !currentCat()) form.cat = state.cats[0].id;
    renderForm(); renderNotice(); renderBoard(); renderLog(); renderUserBar();
    return;
  }
  state.db = db;
  state.mode = 'db';
  subscribe();
  try {
    const user = await c.use('user');
    if (user) { const can = await user.can('data.write'); if (can === false) state.canWrite = false; }
  } catch (_) {}
  renderNotice(); updateHead(); renderBoard(); renderPhoto();
}

/* ---------- Draft and preferences (this browser only) ---------- */
let draftTimer = null;
function scheduleDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300); }
function saveDraft() {
  try {
    const empty = !form.editingId && !form.name.trim() && !form.note.trim() && !form.fav && !form.status
      && !(form.meta || '').trim() && !(form.pros || '').trim() && !(form.cons || '').trim() && !form.link
      && !Object.keys(form.scores).length && !Object.values(form.notes).some(n => n && n.trim()) && !form.photo;
    if (empty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 2, form: { cat: form.cat } }));
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 2, form: {
      editingId: form.editingId, cat: form.cat, name: form.name, artist: form.artist, note: form.note,
      fav: !!form.fav, status: form.status, meta: form.meta, link: form.link, pros: form.pros, cons: form.cons,
      scores: form.scores, notes: form.notes, weights: form.weights, extra: form.extra, extraCatName: form.extraCatName,
      photo: form.photo && form.photo.kind === 'saved' ? draftPhoto(form.photo) : null
    } }));
  } catch (_) {}
}
// фото в черновике — ссылкой на IndexedDB, а не целой картинкой
function draftPhoto(p) {
  const d = photoDataOf(p);
  if (!d || !state.photoStore) return { kind: 'saved', id: p.id, w: p.w, h: p.h };
  const key = window.CasualPhotos.keyOf(d);
  if (photoBad.has(key)) return { kind: 'saved', id: p.id, w: p.w, h: p.h }; // в IndexedDB не легло — черновик хранит само фото
  if (!photoKeys.has(key)) { photoKeys.add(key); window.CasualPhotos.put(key, d).then((ok) => { if (!ok) { photoKeys.delete(key); photoBad.add(key); } }); }
  return { kind: 'saved', ref: key, w: p.w, h: p.h };
}
// старый черновик правки (до того, как в нём стали храниться статус, описание, плюсы и минусы): эти поля берём из самой оценки.
// Иначе «Обновить» стёрло бы их у сохранённой оценки
function fillDraftFromRating() {
  const f = form;
  if (!f.editingId || f.draftOld !== true) return;
  delete f.draftOld;
  const r = state.ratings.find(x => x.id === f.editingId);
  if (!r) return;
  f.fav = !!r.fav; f.status = fitStatus(r.status || ''); f.meta = r.meta || ''; f.link = musicLinkOk(r.link); f.pros = r.pros || ''; f.cons = r.cons || '';
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!d || d.v !== 2 || !d.form) return;
    const f = d.form;
    const scores = {}, notes = {};
    if (f.scores && typeof f.scores === 'object') for (const [k, v] of Object.entries(f.scores)) { const n = clampInt(v, 0, 10); if (n) scores[k] = n; }
    if (f.notes && typeof f.notes === 'object') for (const [k, v] of Object.entries(f.notes)) if (typeof v === 'string' && v) notes[k] = v.slice(0, 160);
    form = Object.assign(blankForm(), {
      editingId: typeof f.editingId === 'string' ? f.editingId : null,
      cat: typeof f.cat === 'string' ? f.cat : blankForm().cat,
      name: str(f.name).slice(0, 140), artist: str(f.artist).slice(0, 80), note: str(f.note).slice(0, 4000), scores, notes,
      fav: f.fav === true, status: str(f.status).slice(0, 40), meta: str(f.meta).slice(0, 80), link: musicLinkOk(f.link), pros: str(f.pros).slice(0, 1000), cons: str(f.cons).slice(0, 1000),
      extra: Array.isArray(f.extra) ? f.extra.filter(x => x && typeof x.id === 'string' && typeof x.name === 'string').map(x => ({ id: x.id, name: x.name, desc: str(x.desc).slice(0, 120) })) : [],
      extraCatName: str(f.extraCatName),
      weights: (() => { const o = {}; if (f.weights && typeof f.weights === 'object') for (const [k, v] of Object.entries(f.weights)) if ([2, 0.5].includes(v)) o[k] = v; return o; })(),
      photo: (() => { const n = f.photo && f.photo.kind === 'saved' ? normPhoto(f.photo) : null; return n ? Object.assign({ kind: 'saved' }, n) : null; })()
    });
    if (typeof f.editingId === 'string' && f.status === undefined) form.draftOld = true;
  } catch (_) {}
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (p && ['score', 'date', 'name'].includes(p.sort)) state.sort = p.sort;
    if (p && ['list', 'grid'].includes(p.bmode)) state.bmode = p.bmode;
    if (p && ['overview', 'tiers'].includes(p.statsView)) state.statsView = p.statsView;
    if (p && p.tierOpts && typeof p.tierOpts === 'object') {
      if (['icons', 'scores', 'names'].includes(p.tierOpts.mode)) state.tierOpts.mode = p.tierOpts.mode;
      if (Array.isArray(p.tierOpts.cats)) state.tierOpts.cats = p.tierOpts.cats.filter(x => typeof x === 'string').slice(0, 40);
    }
    if (p && THEMES.some(t => t.id === p.theme)) state.theme = p.theme;
    if (p && typeof p.filter === 'string') state.filter = p.filter;
    if (p && p.exportOpts && typeof p.exportOpts === 'object') {
      for (const k of ['desc', 'pc', 'notes', 'photo']) if (typeof p.exportOpts[k] === 'boolean') state.exportOpts[k] = p.exportOpts[k];
    }
    if (p && ['board', 'stats', 'log'].includes(p.view)) state.view = p.view;
    if (p && (p.logTab === 'mine' || p.logTab === 'app')) state.logTab = p.logTab;
    if (p && ['rate', 'board', 'stats', 'log'].includes(p.section)) state.section = p.section;
  } catch (_) {}
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      sort: state.sort, bmode: state.bmode, theme: state.theme, filter: state.filter, exportOpts: state.exportOpts,
      statsView: state.statsView, tierOpts: state.tierOpts,
      view: state.view, logTab: state.logTab, section: state.section
    }));
  } catch (_) {}
}

/* ---------- Text and picture export ---------- */
function exportFromForm() {
  const rows = formRows();
  const scores = collectScores(rows);
  const t = totalOf(scores);
  if (t == null) return null;
  const cat = currentCat();
  return {
    name: formFullName() || 'Без названия', catName: cat ? cat.name.trim() : form.extraCatName,
    status: form.status, meta: form.meta, pros: form.pros, cons: form.cons,
    scores, total: t, note: form.note.trim(), date: new Date().toISOString(), photo: form.photo
  };
}
function exportFromRating(r) {
  const cat = state.cats.find(c => c.id === r.cat);
  const scores = r.scores.map(s => {
    const cur = cat ? cat.criteria.find(k => k.id === s.id) : null;
    return Object.assign({}, s, { desc: s.desc || (cur && cur.desc ? cur.desc.trim() : '') });
  });
  return {
    name: r.name, catName: catNameOf(r), status: r.status, meta: r.meta, pros: r.pros, cons: r.cons,
    scores, total: r.total, note: r.note, date: stamp(r) || new Date().toISOString(),
    photo: r.photo ? { kind: 'saved', id: r.photo.id, data: r.photo.data || '', w: r.photo.w, h: r.photo.h } : null
  };
}
function ratingText(d) {
  const lines = [`${d.name}: ${d.total != null ? `${fmt(d.total)} из 10, ${verdict(d.total).toLowerCase()}` : 'без оценки'}`];
  const sub = [d.catName, d.status, d.meta].filter(Boolean).join(' · ');
  if (sub) lines.push(sub);
  lines.push('');
  for (const s of d.scores) {
    lines.push(`${s.name}${s.desc ? ` (${s.desc})` : ''}: ${s.v > 0 ? '▰'.repeat(s.v) + '▱'.repeat(10 - s.v) + ' ' + s.v : 'без оценки'}`);
    if (s.note) lines.push(`  ${s.note}`);
  }
  const pros = splitLines(d.pros);
  const cons = splitLines(d.cons);
  if (pros.length) { lines.push('', 'Плюсы:'); pros.forEach(p => lines.push(`+ ${p}`)); }
  if (cons.length) { lines.push('', 'Минусы:'); cons.forEach(c => lines.push(`- ${c}`)); }
  if (d.note) lines.push('', d.note);
  return lines.join('\n');
}
function setLS(ctx, v) { if ('letterSpacing' in ctx) ctx.letterSpacing = v; }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (ctx.measureText(w).width > maxW && w.length > 1) {
      let cut = w.length - 1;
      while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxW) cut--;
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const tryLine = cur ? cur + ' ' + w : w;
    if (ctx.measureText(tryLine).width <= maxW) cur = tryLine;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (maxLines && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fitText(ctx, kept[maxLines - 1] + '…', maxW);
    return kept;
  }
  return lines;
}
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const p = {};
  for (const k of ['bg', 'dot', 'panel', 'ink', 'ink-2', 'ink-3', 'line', 'cell', 'good', 'mid', 'bad', 'on-tier']) p[k] = cs.getPropertyValue('--' + k).trim() || '#888888';
  return p;
}
const CARD_W = 1080;
function paintCard(ctx, d, pal, draw, bmp) {
  const W = CARD_W, M = 40, P = 56;
  const X0 = M + P, X1 = W - M - P, IW = X1 - X0;
  const BW = 216, BH = 160;
  const tierCol = v => ({ good: pal.good, mid: pal.mid, bad: pal.bad, none: pal.cell })[v];
  if (draw) {
    const H = ctx.canvas.height;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = pal.dot;
    for (let y = 9; y < H; y += 18) for (let x = 9; x < W; x += 18) ctx.fillRect(x - 1, y - 1, 2, 2);
    rr(ctx, M, M, W - 2 * M, H - 2 * M, 34);
    ctx.fillStyle = pal.panel; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = pal.line; ctx.stroke();
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const leftW = IW - BW - 32;
  let y = M + P;
  if (bmp && bmp.width && bmp.height) {
    const ph = Math.round(Math.min(640, Math.max(360, IW * bmp.height / bmp.width)));
    if (draw) {
      ctx.save();
      rr(ctx, X0, y, IW, ph, 24);
      ctx.clip();
      const s = Math.max(IW / bmp.width, ph / bmp.height);
      const sw = IW / s, sh = ph / s;
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, X0, y, IW, ph);
      ctx.restore();
    }
    y += ph + 40;
  }
  const top = y;
  if (d.catName) {
    ctx.font = `700 24px ${FB}`; setLS(ctx, '3px');
    const lab = fitText(ctx, d.catName.toUpperCase(), leftW);
    if (draw) { ctx.fillStyle = pal['ink-2']; ctx.fillText(lab, X0, y + 22); }
    setLS(ctx, '0px');
    y += 24 + 18;
  }
  ctx.font = `700 58px ${FB}`;
  const title = wrapLines(ctx, d.name, leftW, 4);
  if (draw) { ctx.fillStyle = pal.ink; title.forEach((ln, i) => ctx.fillText(ln, X0, y + 52 + i * 66)); }
  y += title.length * 66 + 14;
  const n = d.scores.filter(s => s.v > 0).length;
  ctx.font = `600 28px ${FB}`;
  if (draw) { ctx.fillStyle = pal['ink-2']; ctx.fillText(fitText(ctx, `${verdict(d.total) || d.status || 'Без оценки'} · ${n} ${critWord(n)}`, leftW), X0, y + 26); }
  y += 36;
  const bx = X1 - BW, by = top;
  if (draw) {
    rr(ctx, bx, by, BW, BH, 26);
    ctx.fillStyle = tierCol(tierT(d.total)); ctx.fill();
    ctx.font = `800 128px ${FD}`; ctx.textAlign = 'center';
    const num = d.total != null ? fmt(d.total) : '—'; // оценка «В планах» без балла: не «0,0»
    const m = ctx.measureText(num);
    const asc = m.actualBoundingBoxAscent || 92, dsc = m.actualBoundingBoxDescent || 0;
    ctx.fillStyle = pal['on-tier'];
    ctx.fillText(num, bx + BW / 2, by + BH / 2 + (asc - dsc) / 2);
    ctx.font = `600 22px ${FB}`; ctx.fillStyle = pal['ink-2'];
    ctx.fillText('из 10', bx + BW / 2, by + BH + 30);
    ctx.textAlign = 'left';
  }
  y = Math.max(y, by + BH + 40) + 26;
  if (draw) { ctx.fillStyle = pal.line; ctx.fillRect(X0, y, IW, 2); }
  y += 2;
  const gap = 8, cw = (IW - gap * 9) / 10, ch = 20;
  for (const s of d.scores) {
    y += 30;
    ctx.font = `600 30px ${FB}`;
    const nm = fitText(ctx, s.name, IW - 110);
    if (draw) {
      ctx.fillStyle = pal.ink; ctx.fillText(nm, X0, y + 30);
      ctx.font = `700 56px ${FD}`; ctx.textAlign = 'right';
      ctx.fillStyle = s.v ? pal.ink : pal['ink-3'];
      ctx.fillText(s.v ? String(s.v) : '—', X1, y + 40);
      ctx.textAlign = 'left';
    }
    y += 46;
    if (s.desc) {
      ctx.font = `400 23px ${FB}`;
      const dl = wrapLines(ctx, s.desc, IW, 2);
      if (draw) { ctx.fillStyle = pal['ink-2']; dl.forEach((ln, i) => ctx.fillText(ln, X0, y + 18 + i * 30)); }
      y += dl.length * 30 + 4;
    } else {
      y += 8;
    }
    if (draw) {
      const col = tierCol(tierV(s.v));
      for (let i = 0; i < 10; i++) { rr(ctx, X0 + i * (cw + gap), y, cw, ch, 6); ctx.fillStyle = i < s.v ? col : pal.cell; ctx.fill(); }
    }
    y += ch;
    if (s.note) {
      ctx.font = `400 25px ${FB}`;
      const nl = wrapLines(ctx, s.note, IW, 3);
      y += 12;
      if (draw) { ctx.fillStyle = pal.ink; nl.forEach((ln, i) => ctx.fillText(ln, X0, y + 25 + i * 34)); }
      y += nl.length * 34;
    }
  }
  const prosArr = splitLines(d.pros);
  const consArr = splitLines(d.cons);
  if (prosArr.length || consArr.length) {
    y += 38;
    if (draw) { ctx.fillStyle = pal.line; ctx.fillRect(X0, y, IW, 2); }
    y += 28;
    if (prosArr.length) {
      ctx.font = `700 22px ${FB}`; setLS(ctx, '2px');
      if (draw) { ctx.fillStyle = pal.good; ctx.fillText('ПЛЮСЫ', X0, y + 20); }
      setLS(ctx, '0px');
      y += 32;
      ctx.font = `400 26px ${FB}`;
      for (const pItem of prosArr.slice(0, 6)) {
        const pl = wrapLines(ctx, '+ ' + pItem, IW, 2);
        if (draw) { ctx.fillStyle = pal.ink; pl.forEach((ln, i) => ctx.fillText(ln, X0, y + 24 + i * 34)); }
        y += pl.length * 34 + 4;
      }
      y += 12;
    }
    if (consArr.length) {
      ctx.font = `700 22px ${FB}`; setLS(ctx, '2px');
      if (draw) { ctx.fillStyle = pal.bad; ctx.fillText('МИНУСЫ', X0, y + 20); }
      setLS(ctx, '0px');
      y += 32;
      ctx.font = `400 26px ${FB}`;
      for (const cItem of consArr.slice(0, 6)) {
        const cl = wrapLines(ctx, '− ' + cItem, IW, 2);
        if (draw) { ctx.fillStyle = pal.ink; cl.forEach((ln, i) => ctx.fillText(ln, X0, y + 24 + i * 34)); }
        y += cl.length * 34 + 4;
      }
    }
  }
  if (d.note) {
    y += 40;
    if (draw) { ctx.fillStyle = pal.line; ctx.fillRect(X0, y, IW, 2); }
    y += 32;
    ctx.font = `700 22px ${FB}`; setLS(ctx, '3px');
    if (draw) { ctx.fillStyle = pal['ink-2']; ctx.fillText('ЗАМЕТКИ', X0, y + 20); }
    setLS(ctx, '0px');
    y += 38;
    ctx.font = `400 28px ${FB}`;
    let lines = [];
    for (const para of d.note.split(/\n+/).map(p => p.trim()).filter(Boolean)) lines.push(...wrapLines(ctx, para, IW, 0));
    if (lines.length > 14) { lines = lines.slice(0, 14); lines[13] = fitText(ctx, lines[13] + '…', IW); }
    if (draw) { ctx.fillStyle = pal.ink; lines.forEach((ln, i) => ctx.fillText(ln, X0, y + 28 + i * 40)); }
    y += lines.length * 40;
  }
  y += 44;
  if (draw) { ctx.fillStyle = pal.line; ctx.fillRect(X0, y, IW, 2); }
  y += 28;
  if (draw) {
    ctx.font = `500 24px ${FB}`; ctx.fillStyle = pal['ink-2'];
    ctx.fillText(fmtDateLong(d.date), X0, y + 26);
    ctx.font = `700 38px ${FD}`; ctx.textAlign = 'right'; ctx.fillStyle = pal['ink-3'];
    ctx.fillText('Мнение Казуала', X1, y + 28);
    ctx.textAlign = 'left';
  }
  y += 36;
  return Math.ceil(y + P + M);
}
async function ensureFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const sample = 'Оценка Ёё Abc 0123456789,—…';
  const jobs = ['700 58px Onest', '600 28px Onest', '400 28px Onest', '500 24px Onest', '800 128px Handjet', '700 56px Handjet']
    .map(f => document.fonts.load(f, sample).catch(() => null));
  await Promise.race([Promise.all(jobs), sleep(2500)]);
}
async function renderCardBlob(d) {
  await ensureFonts();
  const pal = readPalette();
  const bmp = d.photo ? await loadPhotoBitmap(d.photo) : null;
  const meas = document.createElement('canvas').getContext('2d');
  const H = paintCard(meas, d, pal, false, bmp);
  const cv = document.createElement('canvas');
  cv.width = CARD_W;
  cv.height = H;
  paintCard(cv.getContext('2d'), d, pal, true, bmp);
  if (bmp && typeof bmp.close === 'function') bmp.close();
  return await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}
function fileNameFor(d) {
  const base = d.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Оценка';
  return d.total != null ? `${base} ${fmt(d.total)}.png` : `${base}.png`;
}
const share = { data: null, blob: null, url: null, filename: '', text: '', trigger: null, token: 0 };
function shareView() {
  const d = share.data, o = state.exportOpts;
  return Object.assign({}, d, {
    pros: o.pc !== false ? d.pros : '',
    cons: o.pc !== false ? d.cons : '',
    note: o.notes ? d.note : '',
    photo: o.photo ? d.photo : null,
    scores: d.scores
      .map(s => Object.assign({}, s, { desc: o.desc ? (s.desc || '') : '', note: o.notes ? (s.note || '') : '' }))
      .filter(s => s.v > 0 || s.note)
  });
}
// ссылка на отзыв: на телефоне — системное «Поделиться», на компьютере — в буфер обмена
async function shareLink(r, b) {
  if (!window.CasualShare || !window.CasualShare.ready()) { toast('Ссылки работают после входа в аккаунт'); return; }
  b.disabled = true;
  let url = '';
  try { url = await window.CasualShare.link(r.id); }
  catch (err) { b.disabled = false; toast(err.message || 'Не получилось сделать ссылку'); return; }
  renderBoard();
  if (matchMedia('(pointer: coarse)').matches && navigator.share) {
    try { await navigator.share({ title: r.name, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {}
  toast(ok ? 'Ссылка на отзыв скопирована, отправь её кому хочешь' : url);
}
function openShare(d, trigger) {
  share.trigger = trigger || null;
  share.data = d;
  const hasDesc = d.scores.some(s => s.desc);
  const hasNotes = !!d.note || d.scores.some(s => s.note);
  el.optDescWrap.hidden = !hasDesc;
  el.optNotesWrap.hidden = !hasNotes;
  el.optPhotoWrap.hidden = !d.photo;
  el.sheetOpts.hidden = !hasDesc && !hasNotes && !d.photo;
  el.optDesc.checked = state.exportOpts.desc;
  el.optNotes.checked = state.exportOpts.notes;
  el.optPhoto.checked = state.exportOpts.photo;
  el.shDownload.hidden = false;
  el.shCopyImg.hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
  const hasPc = !!(d.pros || d.cons);
  if (el.optPcWrap) el.optPcWrap.hidden = !hasPc;
  if (el.optPc) el.optPc.checked = state.exportOpts.pc !== false;
  el.sheetOpts.hidden = !hasDesc && !hasNotes && !d.photo && !hasPc;
  el.sheetHint.textContent = 'Нажми «Скачать PNG», скопируй в буфер или удерживай картинку пальцем / правой кнопкой мыши.';
  el.sheetPreview.innerHTML = '<p class="sheet-wait">Рисую картинку…</p>';
  el.sheet.hidden = false;
  document.documentElement.classList.add('locked');
  el.sheetClose.focus();
  refreshShare();
}
async function refreshShare() {
  if (!share.data) return;
  const v = shareView();
  share.text = ratingText(v);
  share.filename = fileNameFor(v);
  share.blob = null;
  el.sheetText.hidden = true;
  el.shDownload.disabled = true;
  el.shCopyImg.disabled = true;
  el.sheetPreview.classList.add('busy');
  const tok = ++share.token;
  try {
    const blob = await renderCardBlob(v);
    if (tok !== share.token) return;
    share.blob = blob;
    const old = share.url;
    share.url = URL.createObjectURL(blob);
    const img = new Image();
    img.alt = v.total != null ? `Картинка оценки: ${v.name}, ${fmt(v.total)} из 10` : `Картинка оценки: ${v.name}, без балла`;
    img.src = share.url;
    el.sheetPreview.replaceChildren(img);
    if (old) URL.revokeObjectURL(old);
    el.shDownload.disabled = false;
    el.shCopyImg.disabled = false;
  } catch (_) {
    if (tok !== share.token) return;
    el.sheetPreview.innerHTML = '<p class="sheet-wait">Картинку нарисовать не получилось. Текстом скопировать можно.</p>';
  } finally {
    if (tok === share.token) el.sheetPreview.classList.remove('busy');
  }
}
function closeShare() {
  if (el.sheet.hidden) return;
  el.sheet.hidden = true;
  document.documentElement.classList.remove('locked');
  share.token++;
  if (share.url) { URL.revokeObjectURL(share.url); share.url = null; }
  share.blob = null;
  share.data = null;
  el.sheetPreview.classList.remove('busy');
  el.sheetPreview.replaceChildren();
  if (share.trigger && document.contains(share.trigger)) share.trigger.focus({ preventScroll: true });
}
function downloadShare() {
  if (!share.blob) return;
  if (state.downloads) {
    let p;
    try { p = state.downloads.save({ filename: share.filename, data: share.blob }); } catch (e) { p = Promise.reject(e); }
    p.then(res => { if (res && res.status === 'saved') toast('Картинка сохранена'); }, () => fallbackDownload());
    return;
  }
  fallbackDownload();
}
function fallbackDownload() {
  if (!share.blob) return;
  const url = share.url || URL.createObjectURL(share.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = share.filename || 'оценка.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Картинка сохранена в загрузки');
}
function copyShareImage() {
  if (!share.blob) return;
  const fail = () => toast('Браузер не дал скопировать картинку. Скачай её или сохрани вручную');
  try { navigator.clipboard.write([new ClipboardItem({ 'image/png': share.blob })]).then(() => toast('Картинка скопирована'), fail); }
  catch (_) { fail(); }
}
function copyShareText() {
  const text = share.text;
  const fallback = () => {
    el.sheetText.value = text;
    el.sheetText.hidden = false;
    el.sheetText.focus();
    el.sheetText.select();
    try { el.sheetText.setSelectionRange(0, text.length); } catch (_) {}
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    toast(ok ? 'Текст скопирован' : 'Текст выделен ниже, скопируй его вручную');
  };
  let p = null;
  try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : null; } catch (_) { p = null; }
  if (p) p.then(() => toast('Текст скопирован'), fallback); else fallback();
}

/* ---------- Events: form ---------- */
el.cats.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'catx') {
    state.catAsk = b.dataset.id;
    renderCats();
    const y = el.cats.querySelector('[data-act="catx-yes"]');
    if (y) y.focus();
    return;
  }
  if (act === 'catx-no') { state.catAsk = null; renderCats(); return; }
  if (act === 'catx-yes') { state.catAsk = null; deleteCategory(b.dataset.id); return; }
  if (state.catAsk) { state.catAsk = null; renderCats(); }
  if (act === 'newcat') newCategory();
  else if (b.dataset.cat) switchCat(b.dataset.cat);
});
el.name.addEventListener('input', () => {
  form.name = el.name.value;
  // название стало другим — старая кнопка «Слушать» вела бы не туда
  if (form.link) { form.link = ''; renderMusicPicked(); }
  updateNameState(); scheduleDraft(); scheduleCovers(); scheduleMusicSearch();
});
el.note.addEventListener('input', () => { form.note = el.note.value; autoGrow(el.note); scheduleDraft(); });
el.name.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); el.name.blur(); }
});
el.headBtn.addEventListener('click', () => resetForm(form.cat));
el.editCrit.addEventListener('click', toggleEditCat);
el.save.addEventListener('click', save);
el.exportForm.addEventListener('click', () => {
  const d = exportFromForm();
  if (!d) { toast('Сначала оцени хотя бы один критерий'); return; }
  openShare(d, el.exportForm);
});
el.rater.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
});

function valFromX(sl, x) {
  const r = sl.getBoundingClientRect();
  if (!r.width) return 1;
  return Math.max(1, Math.min(10, Math.floor((x - r.left) / r.width * 10) + 1));
}
function setGhost(sl, n) { sl.querySelectorAll('.cell').forEach((c, i) => c.classList.toggle('ghost', i < n)); }
el.critArea.addEventListener('pointerdown', e => {
  const sl = e.target.closest('.slider');
  if (!sl || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const li = sl.closest('.crit');
  if (!li) return;
  drag = { id: li.dataset.id, sl, pid: e.pointerId, x0: e.clientX, y0: e.clientY, active: e.pointerType !== 'touch' };
  if (drag.active) {
    e.preventDefault();
    sl.focus({ preventScroll: true });
    try { sl.setPointerCapture(e.pointerId); } catch (_) {}
    sl.classList.add('dragging');
    setScore(drag.id, valFromX(sl, e.clientX));
  }
});
el.critArea.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.pid) {
    if (!drag.active) {
      const dx = Math.abs(e.clientX - drag.x0), dy = Math.abs(e.clientY - drag.y0);
      if (dy > 10 && dy >= dx) { drag = null; return; }
      if (dx < 8) return;
      drag.active = true;
      drag.sl.classList.add('dragging');
      try { drag.sl.setPointerCapture(drag.pid); } catch (_) {}
    }
    setScore(drag.id, valFromX(drag.sl, e.clientX));
    return;
  }
  if (e.pointerType === 'mouse') {
    const sl = e.target.closest('.slider');
    if (sl) setGhost(sl, valFromX(sl, e.clientX));
  }
});
el.critArea.addEventListener('pointerout', e => {
  const sl = e.target.closest && e.target.closest('.slider');
  if (sl && !(e.relatedTarget && sl.contains(e.relatedTarget))) setGhost(sl, 0);
});
window.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag;
  drag = null;
  d.sl.classList.remove('dragging');
  if (!d.active && document.contains(d.sl)) setScore(d.id, valFromX(d.sl, e.clientX));
});
window.addEventListener('pointercancel', e => {
  if (drag && e.pointerId === drag.pid) { drag.sl.classList.remove('dragging'); drag = null; }
});
el.critArea.addEventListener('keydown', e => {
  const t = e.target;
  if (t.classList.contains('slider')) {
    const id = t.closest('.crit').dataset.id;
    const v = form.scores[id] || 0;
    let n = null;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': n = Math.min(10, v + 1); break;
      case 'ArrowLeft': case 'ArrowDown': n = Math.max(0, v - 1); break;
      case 'PageUp': n = Math.min(10, v + 3); break;
      case 'PageDown': n = Math.max(0, v - 3); break;
      case 'Home': n = 1; break;
      case 'End': n = 10; break;
      case 'Delete': case 'Backspace': n = 0; break;
      default: if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) n = e.key === '0' ? 10 : Number(e.key);
    }
    if (n !== null) { e.preventDefault(); setScore(id, n); }
    return;
  }
  if (e.key === 'Enter' && (t.dataset.act === 'cname' || t.dataset.act === 'cdesc' || t.dataset.act === 'catname')) {
    e.preventDefault();
    const all = [...el.critArea.querySelectorAll('.ed-input')];
    const next = all[all.indexOf(t) + 1];
    if (next) next.focus(); else { const add = el.critArea.querySelector('[data-act="addcrit"]'); if (add) add.focus(); }
  } else if (e.key === 'Enter' && t.dataset.act === 'cnote') {
    e.preventDefault();
    t.blur();
  }
});
el.critArea.addEventListener('input', e => {
  const t = e.target;
  const act = t.dataset.act;
  if (!act) return;
  const cat = currentCat();
  const host = t.closest('[data-id]');
  const id = host ? host.dataset.id : null;
  if (act === 'cnote') {
    if (t.value) form.notes[id] = t.value; else delete form.notes[id];
    const btn = host.querySelector('[data-act="note"]');
    if (btn) btn.classList.toggle('has', !!t.value.trim());
    scheduleDraft();
  } else if (act === 'catname' && cat) {
    cat.name = t.value;
    renderCats();
    scheduleCatSave();
  } else if ((act === 'cname' || act === 'cdesc') && cat) {
    const c = cat.criteria.find(x => x.id === id);
    if (!c) return;
    if (act === 'cname') c.name = t.value; else { c.desc = t.value; fitDesc(t); }
    scheduleCatSave();
  }
});
el.critArea.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  const host = b.closest('[data-id]');
  const id = host ? host.dataset.id : null;
  const cat = currentCat();
  if (act === 'clear') {
    setScore(id, 0);
    host.querySelector('.slider').focus({ preventScroll: true });
  } else if (act === 'w') {
    const order = [1, 2, 0.5];
    const nw = order[(order.indexOf(form.weights[id] || 1) + 1) % order.length];
    if (nw === 1) delete form.weights[id]; else form.weights[id] = nw;
    renderCrit();
    updateTotal();
    scheduleDraft();
    const nb = el.critArea.querySelector(`.crit[data-id="${CSS.escape(id)}"] [data-act="w"]`);
    if (nb) nb.focus({ preventScroll: true });
  } else if (act === 'note') {
    const inp = host.querySelector('.crit-note');
    if (inp.hidden) { inp.hidden = false; form.openNotes[id] = true; b.setAttribute('aria-expanded', 'true'); inp.focus(); }
    else if (!(form.notes[id] || '').trim()) { inp.hidden = true; delete form.openNotes[id]; b.setAttribute('aria-expanded', 'false'); }
    else inp.focus();
  } else if (!cat) {
    return;
  } else if (act === 'up' || act === 'down') {
    const i = cat.criteria.findIndex(x => x.id === id);
    const j = act === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= cat.criteria.length) return;
    [cat.criteria[i], cat.criteria[j]] = [cat.criteria[j], cat.criteria[i]];
    renderCrit();
    scheduleCatSave();
  } else if (act === 'delcrit') {
    if (cat.criteria.length <= 1) return;
    const i = cat.criteria.findIndex(x => x.id === id);
    if (i < 0) return;
    cat.criteria.splice(i, 1);
    delete form.scores[id]; delete form.notes[id]; delete form.openNotes[id];
    renderCrit();
    updateTotal();
    scheduleCatSave();
    scheduleDraft();
    const names = el.critArea.querySelectorAll('.ed-name');
    const f = names[Math.min(i, names.length - 1)];
    if (f) f.focus();
  } else if (act === 'addcrit') {
    if (cat.criteria.length >= MAX_CRIT) return;
    const c = { id: newId('c'), name: '', desc: '' };
    cat.criteria.push(c);
    renderCrit();
    updateTotal();
    scheduleCatSave();
    const f = document.getElementById('edn-' + c.id);
    if (f) f.focus();
  } else if (act === 'cweight') {
    const c = cat.criteria.find(x => x.id === id);
    if (!c) return;
    const order = [1, 2, 0.5];
    c.w = order[(order.indexOf(c.w || 1) + 1) % order.length];
    renderCrit();
    updateTotal();
    scheduleCatSave();
  } else if (act === 'apply-tpl') {
    const tpl = allTemplates()[Number(b.dataset.tpl)];
    if (!tpl) return;
    if (form.editingId) { toast('Сначала сохрани или отмени правку оценки, потом меняй критерии'); return; }
    // такая категория уже есть (например, «Фильмы» вернулись сами по старым оценкам): переключаемся на неё, без дубля
    const same = state.cats.find(c => c.id !== cat.id && (c.id === tplCatId(tpl) || keyOf(c.name) === keyOf(tpl.name)));
    if (same) {
      if (state.editCat) toggleEditCat();
      switchCat(same.id);
      toast(`Категория «${same.name}» уже есть, открыл её`);
      return;
    }
    // в категории уже есть оценки: шаблон становится новой категорией, старые оценки и их критерии не трогаем
    if (state.ratings.some(r => r.cat === cat.id && !r.example)) {
      if (state.cats.length >= MAX_CATS) { toast(`Можно создать до ${MAX_CATS} категорий`); return; }
      const tid = tplCatId(tpl);
      const nid = state.cats.some(c => c.id === tid) ? newId('k') : tid;
      const nc = { id: nid, name: tpl.name, criteria: tplCriteria(tpl, nid) };
      state.cats.push(nc);
      form.cat = nc.id;
      form.extra = [];
      renderCats();
      renderCrit();
      updateTotal();
      updateNameState();
      scheduleCatSave(0);
      scheduleDraft();
      toast(`Шаблон «${tpl.name}» добавлен новой категорией, оценки в «${cat.name}» остались как были`);
      return;
    }
    const tid = tplCatId(tpl);
    if (cat.id !== tid && !state.cats.some(c => c.id === tid)) { cat.id = tid; form.cat = tid; }
    cat.name = tpl.name;
    cat.criteria = tplCriteria(tpl, cat.id);
    renderCats();
    renderCrit();
    updateTotal();
    scheduleCatSave();
    toast(`Применён шаблон «${tpl.name}»`);
  } else if (act === 'resetcat') {
    const s = STARTERS.find(x => x.id === cat.id);
    if (!s) return;
    cat.criteria = clone(s.criteria);
    renderCrit();
    updateTotal();
    scheduleCatSave();
    toast('Стандартные критерии восстановлены');
  } else if (act === 'catdel') {
    state.catDelConfirm = true;
    renderCrit();
    const y = el.critArea.querySelector('[data-act="catdel-yes"]');
    if (y) y.focus();
  } else if (act === 'catdel-no') {
    state.catDelConfirm = false;
    renderCrit();
    const d = el.critArea.querySelector('[data-act="catdel"]');
    if (d) d.focus();
  } else if (act === 'catdel-yes') {
    deleteCategory(cat.id);
  }
});

/* ---------- Events: board ---------- */
el.sortGroup.addEventListener('click', e => {
  const b = e.target.closest('button[data-sort]');
  if (!b) return;
  state.sort = b.dataset.sort;
  syncSort(); savePrefs(); renderBoard();
});
{
  const gBox = document.getElementById('genreChips');
  // окно «Фильтры» не закрывается: чипы перерисовываются, и щелчок иначе выглядел бы как щелчок мимо окна
  if (gBox) gBox.addEventListener('click', e => { const b = e.target.closest('[data-genre]'); if (!b) return; e.stopPropagation(); toggleGenre(b.dataset.genre); });
}
el.filters.addEventListener('click', e => {
  const b = e.target.closest('button[data-filter]');
  if (!b) return;
  state.filter = b.dataset.filter;
  savePrefs(); renderBoard();
});
el.search.addEventListener('input', () => { state.query = el.search.value; renderBoard(); });
el.board.addEventListener('toggle', e => {
  const li = e.target.closest && e.target.closest('.entry');
  if (!li) return;
  if (e.target.open) state.open.add(li.dataset.id); else state.open.delete(li.dataset.id);
}, true);
el.board.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const li = b.closest('.entry');
  const id = li.dataset.id;
  const r = state.ratings.find(x => x.id === id);
  if (!r) return;
  const sel = `.entry[data-id="${CSS.escape(id)}"] [data-act=`;
  switch (b.dataset.act) {
    case 'edit': loadIntoForm(r); break;
    // чуть новее (без сдвига в списке): при равном времени другое устройство со старой копией вернуло бы прежнее избранное
    case 'fav-card': r.fav = !r.fav; r.updatedAt = new Date((+new Date(r.updatedAt || r.createdAt || 0) || Date.now()) + 1000).toISOString(); saveLocalRatings(); renderBoard(); toast(r.fav ? `★ В избранном: ${r.name}` : `Убрано из избранного`); break;
    case 'cmp': toggleCompare(r.id); break;
    case 'share': openShare(exportFromRating(r), b); break;
    case 'link': shareLink(r, b); break;
    case 'unlink':
      b.disabled = true;
      window.CasualShare.revoke(r.id).then(() => { renderBoard(); toast('Ссылка закрыта: по ней отзыв больше не откроется'); }, (err) => { b.disabled = false; toast(err.message || 'Не получилось закрыть ссылку'); });
      break;
    case 'journal': openJournalFor(id); break;
    case 'del': state.confirmDel = id; pendingFocus = sel + '"del-yes"]'; renderBoard(); break;
    case 'del-no': state.confirmDel = null; pendingFocus = sel + '"del"]'; renderBoard(); break;
    case 'del-yes': {
      state.confirmDel = null;
      removeRating(id).then(() => {
        state.open.delete(id);
        logEvent({ kind: 'rating', op: 'delete', ref: id, name: r.name, cat: r.cat, catName: catNameOf(r), total: r.total, info: ratingInfo(r) });
        if (r.photo) {
          dropAsset(r.photo.id);
          if (form.photo && form.photo.kind === 'saved' && form.photo.id === r.photo.id) { form.photo = null; renderPhoto(); }
        }
        if (form.editingId === id) { form.editingId = null; renderCats(); updateNameState(); saveDraft(); }
        toast(`Удалено: ${r.name}`);
      }, err => { handleWriteError(err); renderBoard(); });
      break;
    }
  }
});
el.dropExamples.addEventListener('click', async () => {
  el.dropExamples.disabled = true;
  const gone = [];
  try {
    for (const r of state.ratings.filter(x => x.example)) { await removeRating(r.id); gone.push(r.name); }
    toast('Примеры убраны');
  } catch (err) {
    handleWriteError(err);
  } finally {
    if (gone.length) logEvent({ kind: 'examples', op: 'delete', names: gone });
    el.dropExamples.disabled = false;
  }
});

/* ---------- Events: export sheet ---------- */
el.authClose.addEventListener('click', closeAuthModal);
// клик мимо окна закрывает его, только если в форме ничего не введено и нажатие началось тоже мимо окна
let authDownOut = false;
el.authModal.addEventListener('pointerdown', e => { authDownOut = e.target === el.authModal; });
el.authModal.addEventListener('click', e => { if (e.target === el.authModal && authDownOut && !authHasInput()) closeAuthModal(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.authModal.hidden) closeAuthModal(); });
el.sheetClose.addEventListener('click', closeShare);
el.sheet.addEventListener('click', e => { if (e.target === el.sheet) closeShare(); });
el.shDownload.addEventListener('click', downloadShare);
el.shCopyImg.addEventListener('click', copyShareImage);
el.shCopyText.addEventListener('click', copyShareText);
[el.optDesc, el.optNotes, el.optPhoto].forEach(inp => inp.addEventListener('change', () => {
  // Object.assign: галочка «Плюсы и минусы» хранится тут же и не должна сбрасываться
  Object.assign(state.exportOpts, { desc: el.optDesc.checked, notes: el.optNotes.checked, photo: el.optPhoto.checked });
  savePrefs();
  refreshShare();
}));
document.addEventListener('keydown', e => {
  if (el.sheet.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeShare(); return; }
  if (e.key === 'Tab') {
    const f = [...el.sheet.querySelectorAll('button, input, textarea')].filter(x => !x.disabled && x.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* ---------- Photos ---------- */
const PHOTO_ID = /^[A-Za-z0-9_-]{8,80}$/;
const PHOTO_MAX = 1600;
let photoBusy = false;
function normPhoto(p) {
  if (!p || typeof p !== 'object') return null;
  // фото из IndexedDB, которое не нашлось: ссылка остаётся (на сервере фото есть), но картинки здесь нет
  if (!p.data && window.CasualPhotos && window.CasualPhotos.isKey(p.ref)) return { id: p.ref, ref: p.ref, data: '', w: clampInt(p.w, 0, 20000), h: clampInt(p.h, 0, 20000) };
  const id = str(p.id || p.data);
  if (!id) return null;
  if (PHOTO_ID.test(id) || id.startsWith('data:image/') || id.startsWith('http://') || id.startsWith('https://') || id.startsWith('blob:')) {
    return { id, data: str(p.data || (id.startsWith('data:') ? id : '')), w: clampInt(p.w, 0, 20000), h: clampInt(p.h, 0, 20000) };
  }
  return null;
}
function canPhoto() { return state.canWrite; }
function revokeFormPhoto() {
  if (form && form.photo && form.photo.kind === 'new') {
    if (form.photo.url) URL.revokeObjectURL(form.photo.url);
    if (form.photo.origUrl && form.photo.origUrl !== form.photo.url) URL.revokeObjectURL(form.photo.origUrl);
  }
}
// пропорции кадра: «как есть» (null) и привычные форматы
const RATIOS = [[null, 'Как есть'], [1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [3 / 2, '3:2'], [16 / 9, '16:9'], [9 / 16, '9:16']];
const crop = { zoom: 1, cx: 0.5, cy: 0.5 };
function cropGeom(frame) {
  const p = form.photo, fw = frame.clientWidth, fh = frame.clientHeight;
  const s0 = Math.max(fw / p.origW, fh / p.origH), sc = s0 * crop.zoom;
  const cw = fw / sc, ch = fh / sc;
  crop.cx = Math.min(1 - cw / 2 / p.origW, Math.max(cw / 2 / p.origW, crop.cx));
  crop.cy = Math.min(1 - ch / 2 / p.origH, Math.max(ch / 2 / p.origH, crop.cy));
  return { sc, cw, ch, x: fw / 2 - crop.cx * p.origW * sc, y: fh / 2 - crop.cy * p.origH * sc };
}
function placeCrop() {
  const frame = el.photoBox.querySelector('.crop-frame'), img = frame && frame.querySelector('img');
  if (!img || !form.photo || !form.photo.origW) return;
  const g = cropGeom(frame);
  img.style.width = form.photo.origW + 'px';
  img.style.height = form.photo.origH + 'px';
  img.style.transform = `translate(${g.x}px, ${g.y}px) scale(${g.sc})`;
}
// вырезаем выбранный кадр из оригинала; «как есть» просто возвращает оригинал
let cropJob = 0, cropPending = null;
function commitCrop() { cropPending = cropNow().catch(() => {}); return cropPending; } // сохранение ждёт, пока кадр дорежется
async function cropNow() {
  const p = form.photo;
  if (!p || p.kind !== 'new' || !p.orig) return;
  const job = ++cropJob;
  let blob = p.orig, w = p.origW, h = p.origH;
  if (p.ratio) {
    const frame = el.photoBox.querySelector('.crop-frame');
    if (!frame) return;
    const g = cropGeom(frame);
    const k = Math.min(1, PHOTO_MAX / Math.max(g.cw, g.ch));
    w = Math.max(1, Math.round(g.cw * k)); h = Math.max(1, Math.round(g.ch * k));
    const bmp = await createImageBitmap(p.orig);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, crop.cx * p.origW - g.cw / 2, crop.cy * p.origH - g.ch / 2, g.cw, g.ch, 0, 0, w, h);
    if (bmp.close) bmp.close();
    blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.88));
  }
  if (job !== cropJob || form.photo !== p) return;
  if (p.url && p.url !== p.origUrl) URL.revokeObjectURL(p.url);
  p.blob = blob; p.w = w; p.h = h;
  p.url = blob === p.orig ? p.origUrl : URL.createObjectURL(blob);
}
function renderPhoto() {
  scheduleCovers();
  const p = form.photo;
  const can = canPhoto();
  el.photoField.hidden = !can && !p;
  if (el.photoField.hidden) return;
  el.photoInput.disabled = !can;
  if (photoBusy) { el.photoBox.innerHTML = '<p class="photo-wait">Обрабатываю фото…</p>'; return; }
  const tools = (extra) => can ? `<div class="photo-tools"><label class="btn small ghost" for="photoInput">${ICON.image}Заменить файл</label>${extra || ''}<button type="button" class="btn small ghost danger" data-act="photo-remove">${ICON.trash}Убрать фото</button></div>` : '';
  if (p && p.kind === 'new' && p.orig && can) {
    const r = p.ratio || p.origW / p.origH;
    const chip = ([v, label]) => {
      const shape = v || p.origW / p.origH;
      return `<button type="button" data-ratio="${v || ''}" aria-pressed="${(p.ratio || null) === v}"><i style="width:${Math.round(Math.min(18, 12 * shape))}px"></i>${label}</button>`;
    };
    el.photoBox.innerHTML = `<div class="crop">
      <div class="crop-frame${p.ratio ? '' : ' free'}" style="--r:${r}" tabindex="${p.ratio ? 0 : -1}" aria-label="Кадр фото. Тяни или жми стрелки, чтобы сдвинуть"><img src="${esc(p.origUrl)}" alt=""></div>
      <div class="crop-ratios" role="group" aria-label="Пропорции фото">${RATIOS.map(chip).join('')}</div>
      ${p.ratio ? `<label class="crop-zoom">Масштаб<input type="range" id="cropZoom" min="1" max="3" step="0.01" value="${crop.zoom}"></label><p class="crop-hint">Потяни фото, чтобы выбрать, что попадёт в кадр</p>` : ''}
      ${tools()}
    </div>`;
    placeCrop();
    wireCrop();
  } else if (p) {
    const src = p.kind === 'new' ? p.url : resolvePhotoUrl(p);
    const croppable = can && !(p.kind === 'saved' && /^https?:/.test(p.data || p.id || ''));
    el.photoBox.innerHTML = `<div class="photo-has"><img class="photo-img" data-photo="form" src="${esc(src)}" alt="Фото к оценке">`
      + tools(croppable ? `<button type="button" class="btn small ghost" data-act="photo-crop">Кадрировать</button>` : '')
      + '</div>';
  } else {
    el.photoBox.innerHTML = `<label class="photo-drop" for="photoInput">${ICON.imageLg}<span><strong>Добавить фото или обложку</strong><small class="hint-desk">Выбери файл, перетащи сюда, вставь из буфера (Ctrl+V) или укажи ссылку ниже. Потом можно выбрать пропорции: 1:1, 4:3, 16:9 и другие</small><small class="hint-touch">Из галереи, с камеры или по ссылке, потом выберешь пропорции</small></span></label>
    <div class="photo-url-row"><input type="url" id="photoUrlInput" aria-label="Ссылка на картинку" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="Или вставь прямую ссылку на картинку (https://…)"><button type="button" class="btn small ghost" data-act="photo-url-apply">Ок</button></div>`;
  }
}
// перетаскивание кадра и масштаб: двигаем только картинку внутри рамки, обрезаем, когда отпустили
function wireCrop() {
  const frame = el.photoBox.querySelector('.crop-frame');
  if (!frame || frame.classList.contains('free')) return;
  let drag = null;
  frame.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, cx: crop.cx, cy: crop.cy, sc: cropGeom(frame).sc };
    try { frame.setPointerCapture(e.pointerId); } catch (_) {}
    frame.classList.add('grabbing');
  });
  frame.addEventListener('pointermove', e => {
    if (!drag) return;
    crop.cx = drag.cx - (e.clientX - drag.x) / (form.photo.origW * drag.sc);
    crop.cy = drag.cy - (e.clientY - drag.y) / (form.photo.origH * drag.sc);
    placeCrop();
  });
  const end = () => { if (!drag) return; drag = null; frame.classList.remove('grabbing'); commitCrop(); };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);
  frame.addEventListener('keydown', e => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    crop.cx += d[0] * 0.02; crop.cy += d[1] * 0.02;
    placeCrop(); commitCrop();
  });
  const z = document.getElementById('cropZoom');
  if (z) {
    z.addEventListener('input', () => { crop.zoom = +z.value; placeCrop(); });
    z.addEventListener('change', () => commitCrop());
  }
}
async function decodeImage(file) {
  try {
    const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { src: b, w: b.width, h: b.height, done: () => { if (b.close) b.close(); } };
  } catch (_) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}
async function processPhoto(file) {
  const im = await decodeImage(file);
  try {
    if (!im.w || !im.h) throw new Error('empty');
    const s = Math.min(1, PHOTO_MAX / Math.max(im.w, im.h));
    const w = Math.max(1, Math.round(im.w * s)), h = Math.max(1, Math.round(im.h * s));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(im.src, 0, 0, w, h);
    const blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.86));
    return { blob, w, h };
  } finally {
    im.done();
  }
}
// новое фото: оригинал лежит рядом, пока оценка не сохранена, поэтому пропорции можно менять сколько угодно
function takeOriginal(blob, w, h, ratio) {
  revokeFormPhoto();
  const url = URL.createObjectURL(blob);
  form.photo = { kind: 'new', blob, url, w, h, orig: blob, origUrl: url, origW: w, origH: h, ratio: ratio || null };
  crop.zoom = 1; crop.cx = 0.5; crop.cy = 0.5;
}
async function setPhotoFromFile(file, announce) {
  if (!canPhoto() || photoBusy || !file) return;
  if (file.size > 40 * 1024 * 1024) { toast('Фото слишком большое, выбери файл до 40 МБ'); return; }
  photoBusy = true;
  renderPhoto();
  try {
    const p = await processPhoto(file);
    takeOriginal(p.blob, p.w, p.h);
    if (announce) toast('Фото добавлено, можно выбрать пропорции');
  } catch (_) {
    toast('Не получилось открыть фото. Попробуй JPG или PNG');
  } finally {
    photoBusy = false;
    renderPhoto();
    scheduleDraft();
  }
}
// сохранённое фото тоже можно перекадрировать: берём его как новый оригинал
async function cropSavedPhoto() {
  const p = form.photo;
  if (!p || photoBusy) return;
  photoBusy = true;
  renderPhoto();
  try {
    const bmp = await loadPhotoBitmap(p);
    if (!bmp) throw new Error('load');
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    const blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.9));
    takeOriginal(blob, cv.width, cv.height, 1);
    photoBusy = false;
    renderPhoto();
    await commitCrop();
  } catch (_) {
    toast('Это фото не получается кадрировать здесь. Загрузи файл заново');
  } finally {
    photoBusy = false;
    renderPhoto();
  }
}
function removePhoto() {
  revokeFormPhoto();
  form.photo = null;
  renderPhoto();
  scheduleDraft();
}
async function uploadPhoto(blob) {
  if (state.assets) {
    try { return await state.assets.upload(blob, { type: 'image/jpeg' }); }
    catch (e) {
      if (e && e.code === 'store_unavailable') { await sleep(400 + Math.random() * 600); return await state.assets.upload(blob, { type: 'image/jpeg' }); }
      throw e;
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: reader.result, data: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function dropAsset(id) {
  if (state.assets && id) state.assets.delete(id).catch(() => {});
}
function handleAssetError(e) {
  const code = e && e.code;
  if (code === 'capability_disabled' || code === 'not_granted' || code === 'capability_removed') {
    state.assets = null;
    renderPhoto();
    toast('Фото здесь сейчас недоступны. Убери фото, чтобы сохранить оценку');
    return;
  }
  const msg = {
    too_large: 'Фото слишком большое. Выбери другое',
    unsupported_type: 'Такой формат фото не подходит. Попробуй JPG или PNG',
    quota_or_state: 'Место для фото закончилось. Удали старые оценки с фото',
    rate_limited: 'Слишком много загрузок подряд. Подожди немного',
    upstream_auth: 'Обнови страницу и попробуй снова'
  }[code];
  toast(msg || 'Фото не загрузилось. Попробуй ещё раз');
}
// data: и blob: читаем без fetch: CSP сайта (connect-src) запрещает fetch для таких адресов
function dataUrlToBlob(d) {
  const i = String(d || '').indexOf(',');
  if (!d.startsWith('data:') || i < 0) return null;
  const head = d.slice(5, i), body = d.slice(i + 1);
  const bin = head.endsWith(';base64') ? atob(body) : decodeURIComponent(body);
  const u = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
  return new Blob([u], { type: head.split(';')[0] || 'application/octet-stream' });
}
function imgBitmap(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => createImageBitmap(im).then(res, rej);
    im.onerror = rej;
    im.src = src;
  });
}
async function loadPhotoBitmap(p) {
  try {
    let blob = p.kind === 'new' ? p.blob : null;
    if (!blob && p.ref && !p.data) return null;
    if (!blob) {
      const src = p.data || (p.id && (p.id.startsWith('data:') || p.id.startsWith('blob:')) ? p.id : '/_blob/' + p.id);
      if (src.startsWith('data:')) blob = dataUrlToBlob(src);
      else if (src.startsWith('blob:')) return await imgBitmap(src);
      else {
        const res = await fetch(src);
        if (!res.ok) return null;
        blob = await res.blob();
      }
    }
    return blob ? await createImageBitmap(blob) : null;
  } catch (_) {
    return null;
  }
}

el.photoInput.addEventListener('change', () => {
  const f = el.photoInput.files && el.photoInput.files[0];
  el.photoInput.value = '';
  if (f) setPhotoFromFile(f, false);
});
el.photoBox.addEventListener('click', e => {
  if (e.target.closest('button[data-act="photo-remove"]')) removePhoto();
  if (e.target.closest('button[data-act="photo-crop"]')) cropSavedPhoto();
  const rb = e.target.closest('button[data-ratio]');
  if (rb && form.photo && form.photo.kind === 'new') {
    form.photo.ratio = rb.dataset.ratio ? +rb.dataset.ratio : null;
    crop.zoom = 1; crop.cx = 0.5; crop.cy = 0.5;
    renderPhoto();
    commitCrop();
  }
  if (e.target.closest('button[data-act="photo-url-apply"]')) applyPhotoUrl();
});
// Фото по ссылке: картинку сразу скачиваем (через наш сервер) и храним как своё фото.
// Раньше в оценке оставалась только чужая ссылка, а такие ссылки (особенно скопированные на телефоне) часто
// временные или запрещают показ на других сайтах, и фото через какое-то время пропадало.
let urlPhotoBusy = false;
async function applyPhotoUrl() {
  const inp = document.getElementById('photoUrlInput');
  const url = inp ? inp.value.trim() : '';
  if (!url || (!/^https?:\/\//i.test(url) && !url.startsWith('data:image/'))) {
    toast('Введи корректную ссылку на изображение (https://…)');
    return;
  }
  if (urlPhotoBusy || photoBusy) return;
  if (url.startsWith('data:image/')) {
    let b = null;
    try { b = dataUrlToBlob(url); } catch (_) {} // обрезанная или испорченная ссылка
    if (b) await setPhotoFromFile(new File([b], 'photo', { type: b.type }), true);
    else toast('Эта ссылка на картинку испорчена, скопируй её заново');
    return;
  }
  const api = window.casualApi;
  if (!api || !api.online()) {
    revokeFormPhoto();
    form.photo = { kind: 'saved', id: url, data: url, w: 0, h: 0 };
    renderPhoto();
    scheduleDraft();
    toast('Ссылка добавлена, но такие фото могут пропасть. Войди в аккаунт, и картинка по ссылке будет сохраняться целиком');
    return;
  }
  urlPhotoBusy = true;
  const btn = el.photoBox.querySelector('[data-act="photo-url-apply"]');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  toast('Скачиваю картинку…');
  try {
    const r = await api.get('/fetch-img?u=' + encodeURIComponent(url));
    const b = r && typeof r.data === 'string' ? dataUrlToBlob(r.data) : null;
    if (!b) throw new Error('Картинка не загрузилась');
    urlPhotoBusy = false;
    await setPhotoFromFile(new File([b], 'photo', { type: b.type }), false);
    if (form.photo) toast('Картинка сохранена, можно выбрать пропорции');
  } catch (e) {
    toast(`${e && e.message ? e.message.replace(/\.$/, '') : 'Картинка не загрузилась'}. Можно сохранить её на устройство и загрузить файлом`);
  } finally {
    urlPhotoBusy = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Ок'; }
  }
}
const hasFiles = e => !!(e.dataTransfer && [...e.dataTransfer.types].includes('Files'));
el.rater.addEventListener('dragover', e => {
  if (!canPhoto() || !hasFiles(e)) return;
  e.preventDefault();
  el.photoBox.classList.add('drag');
});
el.rater.addEventListener('dragleave', e => {
  if (!e.relatedTarget || !el.rater.contains(e.relatedTarget)) el.photoBox.classList.remove('drag');
});
el.rater.addEventListener('drop', e => {
  if (!canPhoto() || !hasFiles(e)) return;
  e.preventDefault();
  el.photoBox.classList.remove('drag');
  const files = [...e.dataTransfer.files];
  const f = files.find(x => /^image\//.test(x.type)) || files[0];
  if (f) setPhotoFromFile(f, true);
});
window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', e => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('paste', e => {
  if (!canPhoto() || !el.sheet.hidden) return;
  const cd = e.clipboardData;
  const f = cd ? [...cd.files].find(x => /^image\//.test(x.type)) : null;
  if (!f) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (cd.getData('text/plain') || '').trim()) return;
  e.preventDefault();
  setPhotoFromFile(f, true);
});
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.photo) return;
  if (img.dataset.photo === 'thumb') { img.remove(); return; }
  const ph = document.createElement('div');
  ph.className = 'photo-missing';
  ph.textContent = 'Фото не загрузилось';
  img.replaceWith(ph);
}, true);

/* ---------- Journal ---------- */
const LOG_DOC_MAX_ENTRIES = 200;
const LOG_DOC_MAX_BYTES = 180000;
const CAT_SESSION_MS = 15 * 60 * 1000;
const LOG_PAGE_DAYS = 10;
const textEnc = new TextEncoder();
const byteLen = s => textEnc.encode(s).length;
let logReadyResolve = () => {};
const logReady = new Promise(res => { logReadyResolve = res; });
const LOG = {
  loaded: false, error: false, entries: [], byRef: new Map(), count: { entries: 0, days: 0 },
  docs: new Map(), full: new Set(), queue: Promise.resolve(), pending: new Map(),
  shownDays: LOG_PAGE_DAYS, editing: null, draft: '', dirty: false, flash: null, boardSig: ''
};
let catFlushed = null;
const catSessions = new Map();

const pad2 = n => String(n).padStart(2, '0');
function dayKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function timeOf(iso) { const d = new Date(iso); return isNaN(d) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function dayLabel(key) {
  const [y, m, dd] = key.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 864e5);
  const o = { day: 'numeric', month: 'long' };
  if (y !== today.getFullYear()) o.year = 'numeric';
  const date = d.toLocaleDateString('ru-RU', o).replace(/\s*г\.$/, '');
  if (diff === 0) return `Сегодня, ${date}`;
  if (diff === 1) return `Вчера, ${date}`;
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'long' });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${date}`;
}
function excerpt(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
function ratingInfo(r) {
  return { n: r.scores.filter(s => s.v > 0).length, photo: !!r.photo, note: !!r.note || r.scores.some(s => !!s.note) };
}

/* What changed between two versions of a rating or a category */
function diffRating(a, b) {
  const ch = [];
  if (a.name !== b.name) ch.push({ t: 'name', from: a.name, to: b.name });
  const am = new Map(a.scores.map(s => [s.id, s]));
  const bm = new Map(b.scores.map(s => [s.id, s]));
  const ids = [...b.scores.map(s => s.id), ...a.scores.filter(s => !bm.has(s.id)).map(s => s.id)];
  for (const id of ids) {
    const x = am.get(id), y = bm.get(id);
    const name = (y || x).name;
    const xv = x ? x.v : 0, yv = y ? y.v : 0;
    if (xv !== yv) ch.push({ t: 'score', c: name, from: xv, to: yv });
    const xn = x ? x.note || '' : '', yn = y ? y.note || '' : '';
    if (xn !== yn) ch.push({ t: 'cnote', c: name, op: !xn ? 'add' : !yn ? 'del' : 'edit', to: excerpt(yn, 160) });
  }
  const an = a.note || '', bn = b.note || '';
  if (an !== bn) ch.push({ t: 'note', op: !an ? 'add' : !bn ? 'del' : 'edit', to: excerpt(bn, 140) });
  const ap = a.photo ? a.photo.id : '', bp = b.photo ? b.photo.id : '';
  if (ap !== bp) ch.push({ t: 'photo', op: !ap ? 'add' : !bp ? 'del' : 'replace' });
  return ch;
}
function diffCat(a, b) {
  const ch = [];
  if (a.name !== b.name) ch.push({ t: 'rename', from: a.name, to: b.name });
  const am = new Map(a.criteria.map(k => [k.id, k]));
  const bm = new Map(b.criteria.map(k => [k.id, k]));
  for (const k of b.criteria) {
    const o = am.get(k.id);
    if (!o) { ch.push({ t: 'add', c: k.name }); continue; }
    if (o.name !== k.name) ch.push({ t: 'crename', from: o.name, to: k.name });
    if ((o.desc || '') !== (k.desc || '')) ch.push({ t: 'desc', c: k.name, to: excerpt(k.desc, 120) });
  }
  for (const o of a.criteria) if (!bm.has(o.id)) ch.push({ t: 'del', c: o.name });
  const orderA = a.criteria.filter(k => bm.has(k.id)).map(k => k.id).join('|');
  const orderB = b.criteria.filter(k => am.has(k.id)).map(k => k.id).join('|');
  if (orderA !== orderB) ch.push({ t: 'order' });
  return ch;
}

/* Reading entries back */
const LOG_KINDS = ['rating', 'category', 'examples'];
const LOG_OPS = ['create', 'update', 'delete'];
const CH_TYPES = ['name', 'score', 'cnote', 'note', 'photo', 'rename', 'add', 'del', 'crename', 'desc', 'order'];
function logNum(v) { return typeof v === 'number' && isFinite(v) ? round1(Math.max(0, Math.min(10, v))) : null; }
function normChange(c) {
  if (!c || typeof c !== 'object' || !CH_TYPES.includes(c.t)) return null;
  const o = { t: c.t };
  for (const k of ['c', 'from', 'to', 'op']) if (typeof c[k] === 'string') o[k] = c[k].slice(0, 200);
  if (c.t === 'score') { o.from = clampInt(c.from, 0, 10); o.to = clampInt(c.to, 0, 10); }
  return o;
}
function normEntry(id, e, dayId) {
  if (!e || typeof e !== 'object' || !LOG_KINDS.includes(e.kind) || !LOG_OPS.includes(e.op)) return null;
  const at = str(e.at);
  if (!at || isNaN(new Date(at))) return null;
  const strs = (a, n, len) => (Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, n).map(x => x.slice(0, len)) : []);
  const info = e.info && typeof e.info === 'object'
    ? { n: clampInt(e.info.n, 0, 99), of: clampInt(e.info.of, 0, 99), photo: e.info.photo === true, note: e.info.note === true }
    : null;
  return {
    id, dayId, at, kind: e.kind, op: e.op,
    ref: str(e.ref).slice(0, 80), name: str(e.name).slice(0, 140), cat: str(e.cat).slice(0, 80), catName: str(e.catName).slice(0, 60),
    total: logNum(e.total), prev: logNum(e.prev), info,
    changes: Array.isArray(e.changes) ? e.changes.slice(0, 60).map(normChange).filter(Boolean) : [],
    names: strs(e.names, 40, 140), crit: strs(e.crit, 20, 40),
    bf: e.bf === true, comment: str(e.comment).slice(0, 500)
  };
}
// журнал из браузера или из файла копии: только правильные записи, иначе одна битая ломает показ журнала на каждом заходе
const readLog = (list) => list.map(e => (e && typeof e.id === 'string' ? normEntry(e.id, e, 'local') : null)).filter(Boolean);
function indexLog() {
  LOG.entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  LOG.byRef = new Map();
  for (const e of LOG.entries) {
    if (e.kind !== 'rating') continue;
    if (!LOG.byRef.has(e.ref)) LOG.byRef.set(e.ref, []);
    LOG.byRef.get(e.ref).push(e);
  }
}
function onLog(snap) {
  const entries = [];
  const docs = new Map();
  for (const d of snap.docs) {
    const data = d.data() || {};
    const map = data.entries && typeof data.entries === 'object' && !Array.isArray(data.entries) ? data.entries : {};
    let bytes = 0;
    try { bytes = byteLen(JSON.stringify(data)); } catch (_) {}
    docs.set(d.id, { n: Object.keys(map).length, bytes });
    for (const k of Object.keys(map)) {
      const n = normEntry(k, map[k], d.id);
      if (!n) continue;
      if (LOG.pending.has(k)) n.comment = LOG.pending.get(k);
      entries.push(n);
    }
  }
  LOG.docs = docs;
  LOG.entries = entries;
  LOG.loaded = true;
  LOG.error = false;
  indexLog();
  if (!snap.metadata || !snap.metadata.fromCache) logReadyResolve(true);
  afterLogChange();
}
function boardHistSig() {
  return state.ratings.map(r => (LOG.byRef.get(r.id) || []).map(e => `${e.id}:${e.changes.length}:${e.total}:${e.comment}`).join(',')).join('|');
}
function afterLogChange() {
  renderLog();
  const sig = boardHistSig();
  if (sig !== LOG.boardSig) { LOG.boardSig = sig; renderBoard(); }
}

/* Writing entries: one document per day holds a map of entries */
function enqueue(fn) {
  const job = LOG.queue.then(fn);
  LOG.queue = job.catch(() => {});
  return job;
}
function logEvent(data, session) {
  if (!state.canWrite) return;
  const e = Object.assign({}, data, session ? { id: session.entryId, at: session.at } : { id: newId('e'), at: new Date().toISOString() });
  if (state.mode !== 'db' || !state.db) {
    const n = normEntry(e.id, e, 'local');
    if (!n) return;
    const i = LOG.entries.findIndex(x => x.id === n.id);
    if (i >= 0) { n.comment = LOG.entries[i].comment; LOG.entries[i] = n; } else LOG.entries.push(n);
    indexLog();
    saveLocalLog();
    afterLogChange();
    return;
  }
  enqueue(() => writeLogEntry(e, session)).catch(() => {});
}
function pickDayDoc(day, size) {
  for (let i = 1; i <= 60; i++) {
    const id = i === 1 ? day : `${day}_${i}`;
    if (LOG.full.has(id)) continue;
    const d = LOG.docs.get(id);
    if (!d || (d.n < LOG_DOC_MAX_ENTRIES && d.bytes + size < LOG_DOC_MAX_BYTES)) return id;
  }
  return `${day}_${Date.now().toString(36)}`;
}
function noteDoc(id, size) {
  const d = LOG.docs.get(id) || { n: 0, bytes: 60 };
  d.n += 1;
  d.bytes += size;
  LOG.docs.set(id, d);
}
async function writeLogEntry(e, session) {
  if (state.mode !== 'db') {
    const idx = LOG.entries.findIndex(x => x.id === e.id);
    if (idx >= 0) LOG.entries[idx] = e;
    else LOG.entries.unshift(e);
    if (LOG.entries.length > 400) LOG.entries.length = 400;
    saveLocalLog();
    renderLog();
    return;
  }
  const definitive = await Promise.race([logReady, sleep(12000).then(() => false)]);
  const body = Object.assign({}, e);
  delete body.id;
  const size = byteLen(JSON.stringify(body)) + 64;
  const day = dayKey(new Date(e.at));
  const ref = id => state.db.collection('log').doc(id);
  const put = id => withRetry(() => ref(id).update({ entries: { [e.id]: body } }));
  const create = id => withRetry(() => ref(id).set({ date: day, entries: { [e.id]: body } }));
  if (session && session.dayId) { await put(session.dayId); return; }
  const writeTo = async id => {
    if (LOG.docs.has(id)) await put(id);
    else if (definitive) await create(id);
    else {
      try { await put(id); }
      catch (err) { if (!err || err.code !== 'invalid_argument') throw err; await create(id); }
    }
  };
  let id = pickDayDoc(day, size);
  try {
    await writeTo(id);
  } catch (err) {
    if (!err || err.code !== 'invalid_argument' || !LOG.docs.has(id)) throw err;
    LOG.full.add(id);
    id = pickDayDoc(day, size);
    await writeTo(id);
  }
  noteDoc(id, size);
  if (session) session.dayId = id;
}
function logRatingSave(target, id, doc, of) {
  const after = normalizeRating(id, doc);
  if (!after) return;
  const base = { kind: 'rating', ref: id, name: after.name, cat: after.cat, catName: after.catName, total: after.total };
  if (target) {
    const changes = diffRating(target, after);
    if (changes.length) logEvent(Object.assign(base, { op: 'update', prev: target.total, changes }));
  } else {
    logEvent(Object.assign(base, { op: 'create', info: Object.assign(ratingInfo(after), { of }) }));
  }
}
function catMap(items) { return new Map(items.map(c => [c.id, clone(c)])); }
function logCats(items) {
  const cur = catMap(items);
  if (!catFlushed) { catFlushed = cur; return; }
  const now = Date.now();
  for (const [id, c] of cur) {
    const prev = catFlushed.get(id) || null;
    if (prev && JSON.stringify(prev) === JSON.stringify(c)) continue;
    let s = catSessions.get(id);
    if (!s || now - s.touched > CAT_SESSION_MS) {
      s = { entryId: newId('e'), at: new Date(now).toISOString(), dayId: null, base: prev, touched: now };
      catSessions.set(id, s);
    }
    s.touched = now;
    if (s.base) logEvent({ kind: 'category', op: 'update', ref: id, name: c.name, changes: diffCat(s.base, c) }, s);
    else logEvent({ kind: 'category', op: 'create', ref: id, name: c.name, crit: c.criteria.map(k => k.name) }, s);
  }
  for (const [id, prev] of catFlushed) {
    if (cur.has(id)) continue;
    catSessions.delete(id);
    logEvent({ kind: 'category', op: 'delete', ref: id, name: prev.name, info: { n: prev.criteria.length } });
  }
  catFlushed = cur;
}

/* Rendering */
function badgeSm(v, dim) { return `<span class="badge sm${dim ? ' dim' : ''}" data-tier="${tierT(v)}">${fmt(v)}</span>`; }
function vchip(v) { return `<b class="vchip" data-tier="${tierV(v)}">${v || '—'}</b>`; }
function quote(s) { return `<span class="q">«${esc(s)}»</span>`; }
function changeHTML(c) {
  switch (c.t) {
    case 'name': case 'rename': return `Название: «${esc(c.from)}» → «${esc(c.to)}»`;
    case 'score': return `${esc(c.c)}: ${vchip(c.from)}<span class="arr" aria-hidden="true">→</span>${vchip(c.to)}<span class="vh">, было ${c.from || 'без оценки'}, стало ${c.to || 'без оценки'}</span>`;
    case 'cnote':
      if (c.op === 'del') return `Заметка к «${esc(c.c)}» удалена`;
      return `${c.op === 'add' ? 'Заметка' : 'Новая заметка'} к «${esc(c.c)}»: ${quote(c.to)}`;
    case 'note':
      if (c.op === 'del') return 'Заметки удалены';
      return `${c.op === 'add' ? 'Добавлены заметки' : 'Изменены заметки'}: ${quote(c.to)}`;
    case 'photo': return c.op === 'add' ? 'Добавлено фото' : c.op === 'del' ? 'Фото удалено' : 'Фото заменено';
    case 'add': return `Добавлен критерий «${esc(c.c)}»`;
    case 'del': return `Удалён критерий «${esc(c.c)}»`;
    case 'crename': return `Критерий «${esc(c.from)}» переименован в «${esc(c.to)}»`;
    case 'desc': return c.to ? `Описание «${esc(c.c)}»: ${quote(c.to)}` : `У «${esc(c.c)}» убрано описание`;
    case 'order': return 'Изменён порядок критериев';
  }
  return '';
}
function shortChange(c) {
  switch (c.t) {
    case 'score': return `${c.c} ${c.from || '—'} → ${c.to || '—'}`;
    case 'name': return 'новое название';
    case 'cnote': return c.op === 'del' ? `без заметки к «${c.c}»` : `заметка к «${c.c}»`;
    case 'note': return c.op === 'del' ? 'заметки удалены' : 'заметки';
    case 'photo': return c.op === 'add' ? 'фото добавлено' : c.op === 'del' ? 'фото удалено' : 'фото заменено';
  }
  return '';
}
function visibleLog() { return LOG.entries.filter(e => !(e.op === 'update' && !e.changes.length && !e.bf && !e.comment)); }
function logGroups(list) {
  const groups = [], byDay = new Map();
  for (const e of list) {
    const k = dayKey(new Date(e.at));
    let g = byDay.get(k);
    if (!g) { g = { key: k, items: [] }; byDay.set(k, g); groups.push(g); }
    g.items.push(e);
  }
  return groups;
}
function commentHTML(e) {
  if (LOG.editing === e.id) {
    return `<div class="lg-edit"><label class="vh" for="lgc-${esc(e.id)}">Описание к записи</label><textarea id="lgc-${esc(e.id)}" data-act="lg-text" rows="2" maxlength="500" placeholder="Например, перепрошёл на высокой сложности">${esc(LOG.draft)}</textarea><div class="lg-edit-actions"><button type="button" class="btn small primary" data-act="lg-save">Сохранить</button><button type="button" class="btn small ghost" data-act="lg-cancel">Отмена</button></div></div>`;
  }
  if (e.comment) {
    return `<div class="lg-comment"><p>${esc(e.comment)}</p>${state.canWrite ? `<button type="button" class="mini-btn" data-act="lg-edit" aria-label="Изменить описание" title="Изменить описание">${ICON.edit}</button>` : ''}</div>`;
  }
  return state.canWrite ? `<button type="button" class="lg-add" data-act="lg-edit">${ICON.plus}Добавить описание</button>` : '';
}
function logEntryHTML(e) {
  const tone = e.op === 'create' ? 'add' : e.op === 'delete' ? 'del' : 'edit';
  const nm = esc(e.name || 'Без названия');
  let verb, ref = '', meta = '', score = '', lines = [];
  if (e.kind === 'rating') {
    verb = e.op === 'create' ? 'Новая оценка' : e.op === 'delete' ? 'Удалена оценка' : 'Изменена оценка';
    const exists = e.op !== 'delete' && state.ratings.some(r => r.id === e.ref);
    ref = exists ? `<button type="button" class="lg-ref" data-act="goto" title="Показать в рейтинге">${nm}</button>` : `<span class="lg-ref">${nm}</span>`;
    const bits = [e.catName];
    if (e.op === 'create' && e.info && !e.bf) {
      bits.push(e.info.of ? coverage(e.info.n, e.info.of) : `${e.info.n} ${critWord(e.info.n)}`);
      if (e.info.photo) bits.push('с фото');
      if (e.info.note) bits.push('с заметками');
    }
    meta = bits.filter(Boolean).join(' · ');
    if (e.total != null) {
      score = e.op === 'update' && e.prev != null && e.prev !== e.total
        ? `${badgeSm(e.prev, true)}<span class="lg-arrow" aria-hidden="true">→</span>${badgeSm(e.total)}<span class="vh">Итог был ${fmt(e.prev)}, стал ${fmt(e.total)}</span>`
        : badgeSm(e.total, e.op === 'delete');
    }
    lines = e.changes.map(changeHTML);
  } else if (e.kind === 'category') {
    verb = e.op === 'create' ? 'Новая категория' : e.op === 'delete' ? 'Удалена категория' : 'Изменена категория';
    ref = `<span class="lg-ref">«${nm}»</span>`;
    if (e.op === 'create' && e.crit.length) meta = `Критерии: ${e.crit.join(', ')}`;
    if (e.op === 'delete' && e.info) meta = `${e.info.n} ${critWord(e.info.n)}`;
    lines = e.changes.map(changeHTML);
  } else {
    verb = 'Убраны примеры';
    meta = e.names.join(', ');
  }
  return `<li class="lg${LOG.flash === e.id ? ' flash' : ''}" data-id="${esc(e.id)}" data-ref="${esc(e.ref)}" data-tone="${tone}">
<time class="lg-time" datetime="${esc(e.at)}"><i aria-hidden="true"></i>${timeOf(e.at)}</time>
<div class="lg-body">
<div class="lg-head"><p class="lg-title"><span class="lg-verb">${verb}</span> ${ref}</p>${score ? `<span class="lg-score">${score}</span>` : ''}</div>
${meta ? `<p class="lg-meta">${esc(meta)}</p>` : ''}
${lines.length ? `<ul class="lg-changes">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
${e.bf ? '<p class="lg-bf">Записано задним числом: журнал тогда ещё не вёлся, подробности не сохранились.</p>' : ''}
${commentHTML(e)}
</div>
</li>`;
}
function logDayHTML(g) {
  const n = g.items.length;
  return `<section class="log-day"><h3 class="log-date">${esc(dayLabel(g.key))}<span>${n} ${plural(n, 'запись', 'записи', 'записей')}</span></h3><ol class="log-list">${g.items.map(logEntryHTML).join('')}</ol></section>`;
}
function renderLogStat() {
  if (LOG.error) { el.logStat.textContent = 'Журнал сейчас не загружается. Обнови страницу'; return; }
  const c = LOG.count;
  el.logStat.textContent = !LOG.loaded ? 'Загружаю журнал…'
    : !c.entries ? 'Пока без записей'
    : `${c.entries} ${plural(c.entries, 'запись', 'записи', 'записей')} за ${c.days} ${plural(c.days, 'день', 'дня', 'дней')}`;
}
function renderLog(force) {
  if (LOG.editing && !force) { LOG.dirty = true; return; }
  LOG.dirty = false;
  const list = visibleLog();
  const groups = logGroups(list);
  el.logList.innerHTML = groups.slice(0, LOG.shownDays).map(logDayHTML).join('');
  el.logList.hidden = !list.length;
  el.logMore.hidden = groups.length <= LOG.shownDays;
  el.logEmpty.hidden = !LOG.loaded || list.length > 0;
  LOG.count = { entries: list.length, days: groups.length };
  renderLogStat();
}
function histSummary(e) {
  if (e.op === 'create') return e.bf || e.total == null ? 'Добавлено' : `Добавлено · ${fmt(e.total)}`;
  if (e.op === 'delete') return 'Удалено';
  const parts = [];
  if (e.total != null) parts.push(e.prev != null && e.prev !== e.total ? `${fmt(e.prev)} → ${fmt(e.total)}` : fmt(e.total));
  if (e.bf) parts.push('подробности не сохранились');
  e.changes.slice(0, 2).forEach(c => { const s = shortChange(c); if (s) parts.push(s); });
  if (e.changes.length > 2) parts.push(`ещё ${e.changes.length - 2}`);
  if (e.comment) parts.push(`«${excerpt(e.comment, 60)}»`);
  return parts.join(' · ');
}
function histHTML(r) {
  const list = (LOG.byRef.get(r.id) || []).filter(e => e.op !== 'update' || e.changes.length || e.bf || e.comment);
  if (!list.length) return '';
  const rows = list.slice(0, 5).map(e => `<li><time datetime="${esc(e.at)}">${esc(fmtDate(e.at))}, ${timeOf(e.at)}</time><span>${esc(histSummary(e))}</span></li>`).join('');
  const more = list.length > 5 ? `Ещё ${list.length - 5} в журнале` : 'Открыть в журнале';
  return `<div class="e-hist"><span class="label">История</span><ol>${rows}</ol><button type="button" class="link-btn" data-act="journal">${more}</button></div>`;
}

/* Views */
function setView(v, focus) {
  state.view = ['board', 'stats', 'log'].includes(v) ? v : 'board';
  const tabs = [
    { id: 'board', tab: el.tabBoard, panel: el.panelBoard },
    { id: 'stats', tab: el.tabStats, panel: el.panelStats },
    { id: 'log',   tab: el.tabLog,   panel: el.panelLog }
  ];
  for (const t of tabs) {
    if (!t.tab || !t.panel) continue;
    const active = state.view === t.id;
    t.tab.setAttribute('aria-selected', String(active));
    t.tab.tabIndex = active ? 0 : -1;
    t.panel.hidden = !active;
    if (focus && active) t.tab.focus();
  }
  if (state.view === 'stats') renderStats();
  if (state.section !== 'rate') { state.section = state.view; syncNav(); }
  savePrefs();
}

/* Phone layout: one section at a time, switched from the bar at the top */
const narrowMQ = matchMedia('(max-width: 979px)');
const coarseMQ = matchMedia('(pointer: coarse)');
function isNarrow() { return narrowMQ.matches; }
function syncNav() {
  el.layout.dataset.section = state.section;
  el.mnav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.section === state.section)));
}
function setSection(s) {
  state.section = ['rate', 'board', 'stats', 'log'].includes(s) ? s : 'rate';
  if (state.section === 'rate') { syncNav(); savePrefs(); requestAnimationFrame(() => autoGrow(el.note)); }
  else setView(state.section);
}
function scrollToSectionTop() {
  if (!isNarrow()) return;
  const top = el.navAnchor.getBoundingClientRect().top + window.scrollY;
  if (window.scrollY > top) window.scrollTo({ top, behavior: 'auto' });
}
el.mnav.addEventListener('click', e => {
  const b = e.target.closest('button[data-section]');
  if (!b) return;
  setSection(b.dataset.section);
  scrollToSectionTop();
});

/* Text areas grow with their text where the browser cannot do it itself */
const canFieldSize = !!(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'));
function autoGrow(t) {
  if (canFieldSize || !t || !t.offsetParent) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight + 2, 360) + 'px';
}

/* While typing on a touch screen the score bar stops floating over the field */
const TYPING_FIELDS = 'input[type="text"], input:not([type]), textarea';
let typingTimer = null;
el.rater.addEventListener('focusin', e => {
  if (!coarseMQ.matches || !e.target.matches(TYPING_FIELDS)) return;
  clearTimeout(typingTimer);
  el.rater.classList.add('typing');
});
el.rater.addEventListener('focusout', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    const a = document.activeElement;
    if (!a || !el.rater.contains(a) || !a.matches(TYPING_FIELDS)) el.rater.classList.remove('typing');
  }, 150);
});
el.search.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) el.search.blur(); });
// «Что нового» открывается кнопкой в шапке (whatsnew.js), во вкладке «Журнал» только свои изменения
function setLogTab() {
  state.logTab = 'mine';
  el.logMine.hidden = false;
  renderLogStat();
}
const smoothScroll = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
function goToRating(id) {
  const r = state.ratings.find(x => x.id === id);
  if (!r) { toast('Этой оценки уже нет в рейтинге'); return; }
  if (isNarrow()) setSection('board'); else setView('board');
  if (state.filter !== 'all' && catKey(r) !== state.filter) { state.filter = 'all'; savePrefs(); }
  if (state.query && !r.nameKey.includes(keyOf(state.query))) { state.query = ''; el.search.value = ''; }
  // оценка могла быть скрыта фильтром: «Друзья» вообще прячут свой рейтинг, а уровень и жанр — часть оценок
  if (!applySubFilter([r]).length || state.sfilter === 'mine') state.sfilter = 'all';
  if (!hasGenres(r)) state.genres = [];
  state.open.add(id);
  state.flashId = id;
  renderBoard();
  const li = el.board.querySelector(`.entry[data-id="${CSS.escape(id)}"]`);
  if (li) {
    li.scrollIntoView({ behavior: smoothScroll(), block: 'center' });
    li.querySelector('summary').focus({ preventScroll: true });
  }
  setTimeout(() => { if (state.flashId === id) state.flashId = null; }, 2000);
}
function openJournalFor(id) {
  if (isNarrow()) setSection('log'); else setView('log');
  setLogTab('mine');
  const target = (LOG.byRef.get(id) || []).find(e => e.op !== 'update' || e.changes.length || e.bf || e.comment);
  if (!target) { renderLog(); return; }
  const groups = logGroups(visibleLog());
  const gi = groups.findIndex(g => g.items.some(x => x.id === target.id));
  if (gi >= LOG.shownDays) LOG.shownDays = gi + 1;
  LOG.flash = target.id;
  renderLog(true);
  const node = el.logList.querySelector(`.lg[data-id="${CSS.escape(target.id)}"]`);
  if (node) node.scrollIntoView({ behavior: smoothScroll(), block: 'center' });
  setTimeout(() => { if (LOG.flash === target.id) LOG.flash = null; }, 2000);
}

/* Own descriptions on entries */
function focusEntryAction(id) {
  const li = el.logList.querySelector(`.lg[data-id="${CSS.escape(id)}"]`);
  const t = li && li.querySelector('[data-act="lg-edit"]');
  if (t) t.focus({ preventScroll: true });
}
function startComment(entry) {
  if (!entry || !state.canWrite) return;
  if (LOG.editing && LOG.editing !== entry.id) cancelComment(true);
  LOG.editing = entry.id;
  LOG.draft = entry.comment || '';
  renderLog(true);
  const t = document.getElementById('lgc-' + entry.id);
  if (t) { autoGrow(t); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
}
function cancelComment(silent) {
  const id = LOG.editing;
  LOG.editing = null;
  LOG.draft = '';
  if (silent) return;
  renderLog(true);
  if (id) focusEntryAction(id);
}
async function commitComment() {
  const id = LOG.editing;
  const entry = LOG.entries.find(x => x.id === id);
  if (!entry) { cancelComment(); return; }
  const text = LOG.draft.trim().slice(0, 500);
  const before = entry.comment;
  entry.comment = text;
  LOG.editing = null;
  LOG.draft = '';
  renderLog(true);
  focusEntryAction(id);
  const done = text ? 'Описание сохранено' : 'Описание убрано';
  if (state.mode !== 'db' || !state.db || entry.dayId === 'local') { saveLocalLog(); toast(done); return; }
  LOG.pending.set(id, text);
  try {
    await enqueue(() => withRetry(() => state.db.collection('log').doc(entry.dayId).update({ entries: { [id]: { comment: text } } })));
    toast(done);
  } catch (_) {
    const cur = LOG.entries.find(x => x.id === id);
    if (cur) cur.comment = before;
    renderLog();
    toast('Описание не сохранилось. Попробуй ещё раз');
  } finally {
    LOG.pending.delete(id);
  }
}

el.views.addEventListener('click', e => {
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});
el.views.addEventListener('keydown', e => {
  let v = null;
  const order = ['board', 'stats', 'log'];
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') v = order[(order.indexOf(state.view) + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
  else if (e.key === 'Home') v = 'board';
  else if (e.key === 'End') v = 'log';
  if (!v) return;
  e.preventDefault();
  setView(v, true);
});
el.logMore.addEventListener('click', () => { LOG.shownDays += LOG_PAGE_DAYS; renderLog(); });
el.logList.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  const li = b && b.closest('.lg');
  if (!li) return;
  const entry = LOG.entries.find(x => x.id === li.dataset.id);
  switch (b.dataset.act) {
    case 'goto': goToRating(li.dataset.ref); break;
    case 'lg-edit': startComment(entry); break;
    case 'lg-cancel': cancelComment(); break;
    case 'lg-save': commitComment(); break;
  }
});
el.logList.addEventListener('input', e => { if (e.target.dataset.act === 'lg-text') { LOG.draft = e.target.value; autoGrow(e.target); } });
el.logList.addEventListener('keydown', e => {
  if (e.target.dataset.act !== 'lg-text') return;
  if (e.key === 'Escape') { e.preventDefault(); cancelComment(); }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitComment(); }
});


/* ---------- Statistics, Compare & Theme ---------- */
// темы общие с колесом: список и id должны совпадать с wheel/index.html
const THEMES = window.CasualThemes.list; // общий список тем: /themes.js
function applyTheme(t) {
  const th = THEMES.find(x => x.id === t) || THEMES[0];
  state.theme = th.id;
  if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
  if (el.themeBtn) {
    el.themeBtn.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/></svg><span>Тема: ${th.name}</span>`;
    el.themeBtn.setAttribute('aria-label', `Тема: ${th.name}`);
  }
  const menu = document.getElementById('themeMenu');
  if (menu) {
    menu.classList.add('tm-grid');
    menu.innerHTML = window.CasualThemes.menuHTML(state.theme);
  }
  savePrefs();
}
{
  const pick = document.getElementById('themePick');
  const menu = document.getElementById('themeMenu');
  if (pick && menu) {
    // меню не уходит за край экрана, где бы ни оказалась кнопка (на телефоне её сдвигает кнопка профиля)
    pick.addEventListener('toggle', () => {
      if (!pick.open) return;
      menu.style.translate = '';
      const box = menu.offsetParent ? menu.offsetParent.getBoundingClientRect() : { left: 0 };
      const left = box.left + menu.offsetLeft, right = left + menu.offsetWidth;
      const shift = left < 8 ? 8 - left : right > innerWidth - 8 ? innerWidth - 8 - right : 0;
      if (shift) menu.style.translate = `${Math.round(shift)}px 0`;
    });
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-theme-id]');
      if (!b) return;
      // новая тема расходится кругом от выбранного пункта, где это умеет браузер
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const r = b.getBoundingClientRect();
        document.documentElement.style.setProperty('--tx', `${r.left + r.width / 2}px`);
        document.documentElement.style.setProperty('--ty', `${r.top + r.height / 2}px`);
        document.documentElement.classList.add('theme-swap');
        let done = false;
        const go = () => { if (!done) { done = true; applyTheme(b.dataset.themeId); } };
        const vt = document.startViewTransition(go);
        vt.ready.catch(() => {});
        if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
        vt.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('theme-swap'));
        setTimeout(go, 400); // если переход не начался (вкладка в фоне), тема всё равно сменится
      } else applyTheme(b.dataset.themeId);
      pick.open = false;
      el.themeBtn.focus();
    });
    document.addEventListener('click', e => { if (pick.open && !pick.contains(e.target)) pick.open = false; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && pick.open) { pick.open = false; el.themeBtn.focus(); } });
  }
}

// ---------- Тир-лист в статистике: свои категории, вид элементов и картинка для экспорта ----------
const TL_TIERS = [
  { id: 'S', min: 9.2, range: '9,2–10', col: '#43C97A' },
  { id: 'A', min: 8.2, range: '8,2–9,1', col: '#9BCF4E' },
  { id: 'B', min: 7.0, range: '7–8,1', col: '#F2BA44' },
  { id: 'C', min: 5.0, range: '5–6,9', col: '#F28E4C' },
  { id: 'D', min: -1, range: 'ниже 5', col: '#F26A55' }
];
function tierPool() {
  const cats = state.tierOpts.cats;
  // примеры показываем, только пока своих оценок нет
  const base = state.ratings.some(r => !r.example) ? state.ratings.filter(r => !r.example) : state.ratings;
  return base.filter(r => r.total != null && (!cats || cats.includes(catKey(r))) && hasGenres(r)).sort(byScore);
}
function tierBuckets(list) {
  const b = TL_TIERS.map(t => ({ t, items: [] }));
  for (const r of list) (b.find(x => r.total >= x.t.min) || b[b.length - 1]).items.push(r);
  return b;
}
function renderTierView() {
  const box = document.getElementById('tierView');
  if (!box) return;
  const gs = groups().filter(g => g.id !== '__none' || g.n);
  const sel = state.tierOpts.cats;
  const list = tierPool();
  const mode = state.tierOpts.mode;
  const base = state.ratings.some(r => !r.example) ? state.ratings.filter(r => !r.example) : state.ratings;
  const gs2 = genreChipsHTML(base.filter(r => r.total != null && (!sel || sel.includes(catKey(r)))));
  const chip = (id, name, n, on) => `<button type="button" class="chip-btn" data-tlcat="${esc(id)}" aria-pressed="${on}">${esc(name)}${n != null ? ` <b>${n}</b>` : ''}</button>`;
  const item = (r) => {
    const pUrl = resolvePhotoUrl(r.photo);
    const aUrl = pUrl ? '' : artistAvaUrl(r);
    const letter = esc([...String(r.name).trim()][0] || '?');
    return `<button type="button" class="tl-item" data-tier-goto="${esc(r.id)}" data-tier="${tierT(r.total)}" title="${esc(r.name)} · ${fmt(r.total)}">
      <span class="tl-pic">${pUrl ? `<img src="${esc(pUrl)}" alt="" loading="lazy" decoding="async" data-photo="thumb">` : aUrl ? `<img class="ava" src="${esc(aUrl)}" alt="" loading="lazy" decoding="async">` : `<span>${letter}</span>`}${mode === 'scores' ? `<b>${fmt(r.total)}</b>` : ''}</span>
      ${mode === 'names' ? `<span class="tl-name">${esc(r.name)}</span>` : ''}
    </button>`;
  };
  box.innerHTML = `<div class="tl-tools">
      <div class="tl-opt"><span class="label">Категории</span><div class="chips tl-cats">${chip('all', 'Все', null, !sel)}${gs.map(g => chip(g.id, g.name, g.n, !!sel && sel.includes(g.id))).join('')}</div></div>
      ${gs2.any ? `<div class="tl-opt"><span class="label">Жанры</span><div class="chips tl-cats">${gs2.html}</div></div>` : ''}
      <div class="tl-opt"><span class="label">Вид</span><div class="seg" id="tlMode" role="group" aria-label="Вид тир-листа">
        <button type="button" data-tlmode="icons" aria-pressed="${mode === 'icons'}">Иконки</button>
        <button type="button" data-tlmode="scores" aria-pressed="${mode === 'scores'}">С оценками</button>
        <button type="button" data-tlmode="names" aria-pressed="${mode === 'names'}">С названиями</button>
      </div></div>
      <div class="tl-acts"><button type="button" class="btn small ghost" data-tl="mine" title="Разложить оценки по рядам самому, а не по баллу">✍️ Свой тир-лист</button><button type="button" class="btn small primary" data-tl="png">Скачать PNG</button>${window.ClipboardItem && navigator.clipboard && navigator.clipboard.write ? '<button type="button" class="btn small ghost" data-tl="copy">Скопировать картинку</button>' : ''}</div>
    </div>
    ${list.length ? `<div class="tl" data-mode="${mode}">${tierBuckets(list).map(({ t, items }) => `<div class="tl-row">
      <div class="tl-head" style="--c:${t.col}"><b>${t.id}</b><small>${t.range}</small></div>
      <div class="tl-items">${items.length ? items.map(item).join('') : '<span class="tl-empty">пусто</span>'}</div>
    </div>`).join('')}</div>` : '<div class="empty"><p><strong>Тир-лист пуст.</strong> Здесь появятся оценки с баллом из выбранных категорий.</p></div>'}`;
}
// «Свой тир-лист» (tier-maker.js): те же оценки, что в тир-листе сейчас (категории и жанры), но и без балла тоже
function openTierMaker() {
  if (!window.CasualTierMaker) return;
  const cats = state.tierOpts.cats;
  const base = state.ratings.some(r => !r.example) ? state.ratings.filter(r => !r.example) : state.ratings;
  const list = base.filter(r => (!cats || cats.includes(catKey(r))) && hasGenres(r)).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const what = [cats ? groups().filter(g => cats.includes(g.id)).map(g => g.name).join(', ') : '', state.genres.join(', ')].filter(Boolean).join(' · ');
  window.CasualTierMaker.open({
    scope: 'me',
    title: 'Свой тир-лист' + (what ? ' · ' + what : ''),
    items: list.map(r => ({ id: r.id, name: r.name, total: r.total, img: resolvePhotoUrl(r.photo) || artistAvaUrl(r) || '', ref: r })),
    png: (buckets) => tierExport('png', { buckets, sub: what || 'Все категории' }),
  });
}
// картинка тир-листа: рисуем заново на canvas, фото берём те же, что в рейтинге
async function tierPng(custom) {
  const list = custom ? custom.buckets.flatMap(b => b.items) : tierPool();
  if (!list.length) { toast('В тир-листе пока пусто'); return null; }
  const mode = state.tierOpts.mode;
  try { await document.fonts.load('800 40px Handjet'); await document.fonts.load('600 16px Onest'); } catch (_) {}
  const W = 1200, PAD = 32, HEAD = 112, TILE = 96, GAP = 10, CAP = mode === 'names' ? 38 : 0;
  const perRow = Math.floor((W - PAD * 2 - HEAD - GAP * 2) / (TILE + GAP));
  const buckets = custom ? custom.buckets : tierBuckets(list);
  const rows = buckets.map(b => Math.max(1, Math.ceil(b.items.length / perRow)));
  const rowH = (n) => n * (TILE + CAP) + (n - 1) * GAP + GAP * 2;
  const H = PAD + 92 + rows.reduce((a, n) => a + rowH(n) + 8, 0) + 40 + PAD;
  const bmps = new Map();
  await Promise.all(list.filter(r => r.photo && !/^https?:/.test(resolvePhotoUrl(r.photo))).map(async r => { const b = await loadPhotoBitmap(r.photo); if (b) bmps.set(r.id, b); }));
  await Promise.all(list.filter(r => !r.photo && artistAvaUrl(r)).map(async r => { const b = await loadPhotoBitmap({ data: artistAvaUrl(r) }); if (b) bmps.set(r.id, b); }));
  const cv = document.createElement('canvas');
  const k = 2;
  cv.width = W * k; cv.height = H * k;
  const ctx = cv.getContext('2d');
  ctx.scale(k, k);
  ctx.fillStyle = '#0D0F14'; ctx.fillRect(0, 0, W, H);
  const rr = (x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fillStyle = fill; ctx.fill(); };
  ctx.fillStyle = '#E8EAF0'; ctx.font = '800 46px Handjet, sans-serif'; ctx.textBaseline = 'top';
  ctx.fillText('Мой тир-лист', PAD, PAD);
  const cats = state.tierOpts.cats;
  const sub = (custom ? custom.sub : cats ? groups().filter(g => cats.includes(g.id)).map(g => g.name).join(', ') : 'Все категории') + ` · ${list.length} ${plural(list.length, 'оценка', 'оценки', 'оценок')}`;
  ctx.fillStyle = '#A3A9B8'; ctx.font = '500 16px Onest, sans-serif';
  ctx.fillText(sub.length > 110 ? sub.slice(0, 108) + '…' : sub, PAD, PAD + 54);
  let y = PAD + 92;
  buckets.forEach((b, i) => {
    const h = rowH(rows[i]);
    rr(PAD, y, W - PAD * 2, h, 16, '#161920');
    rr(PAD, y, HEAD, h, 16, b.t.col);
    ctx.fillStyle = '#0D0F14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 56px Handjet, sans-serif'; ctx.fillText(b.t.id, PAD + HEAD / 2, y + h / 2 - 8);
    ctx.font = '600 13px Onest, sans-serif'; ctx.fillText(b.t.range, PAD + HEAD / 2, y + h / 2 + 30);
    b.items.forEach((r, j) => {
      const cx = PAD + HEAD + GAP * 2 + (j % perRow) * (TILE + GAP), cy = y + GAP + Math.floor(j / perRow) * (TILE + CAP + GAP);
      const col = { good: '#43C97A', mid: '#F2BA44', bad: '#F26A55' }[tierT(r.total)] || '#272C36';
      ctx.save();
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx, cy, TILE, TILE, 12) : ctx.rect(cx, cy, TILE, TILE); ctx.clip();
      const bmp = bmps.get(r.id);
      if (bmp) { const s2 = Math.max(TILE / bmp.width, TILE / bmp.height); ctx.drawImage(bmp, cx + (TILE - bmp.width * s2) / 2, cy + (TILE - bmp.height * s2) / 2, bmp.width * s2, bmp.height * s2); }
      else { ctx.fillStyle = '#1D2129'; ctx.fillRect(cx, cy, TILE, TILE); ctx.fillStyle = col; ctx.font = '800 50px Handjet, sans-serif'; ctx.fillText([...String(r.name).trim()][0] || '?', cx + TILE / 2, cy + TILE / 2); }
      ctx.restore();
      if (mode === 'scores' && r.total != null) {
        const t = fmt(r.total);
        ctx.font = '800 22px Handjet, sans-serif';
        const bw = ctx.measureText(t).width + 14;
        rr(cx + TILE - bw - 4, cy + TILE - 30, bw, 26, 7, col);
        ctx.fillStyle = '#0D0F14'; ctx.fillText(t, cx + TILE - bw / 2 - 4, cy + TILE - 17);
      }
      if (mode === 'names') {
        ctx.fillStyle = '#E8EAF0'; ctx.font = '600 12px Onest, sans-serif';
        let n = String(r.name);
        while (n.length > 1 && ctx.measureText(n).width > TILE) n = n.slice(0, -2) + '…';
        ctx.fillText(n, cx + TILE / 2, cy + TILE + 18);
      }
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    y += h + 8;
  });
  ctx.fillStyle = '#6F7585'; ctx.font = '500 14px Onest, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Мнение Казуала · casualhub.pages.dev', W - PAD, H - PAD + 6);
  bmps.forEach(b => b.close && b.close());
  return await new Promise(res => cv.toBlob(res, 'image/png'));
}
async function tierExport(kind, custom) {
  const blob = await tierPng(custom);
  if (!blob) return;
  if (kind === 'copy') {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Тир-лист скопирован'); }
    catch (_) { toast('Браузер не дал скопировать картинку, скачай её'); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'тир-лист.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Тир-лист сохранён в загрузки');
}
function renderStats() {
  if (!el.statsContent) return;
  const seg = document.getElementById('statsSeg'), tv = document.getElementById('tierView');
  if (seg) seg.querySelectorAll('[data-sview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sview === state.statsView)));
  if (state.statsView === 'tiers' && tv) {
    el.statsContent.hidden = true; tv.hidden = false;
    renderTierView();
    return;
  }
  el.statsContent.hidden = false;
  if (tv) tv.hidden = true;
  const rated = state.ratings.filter(r => r.total != null);
  if (!rated.length) {
    el.statsContent.innerHTML = `<div class="empty"><p><strong>Статистика пока пуста.</strong> Добавь хотя бы одну оценку, чтобы увидеть распределение баллов, медиану, рекорды критериев и аналитику по категориям.</p></div>`;
    return;
  }
  const scores = rated.map(r => r.total).sort((a, b) => a - b);
  const avg = round1(scores.reduce((a, b) => a + b, 0) / scores.length);
  const mid = Math.floor(scores.length / 2);
  const median = scores.length % 2 ? scores[mid] : round1((scores[mid - 1] + scores[mid]) / 2);
  const favCount = state.ratings.filter(r => r.fav).length;
  const best = [...rated].sort(byScore)[0];

  const buckets = [
    { label: '9.0–10', min: 9.0, max: 10.1, col: 'var(--good)', n: 0 },
    { label: '7.5–8.9', min: 7.5, max: 9.0, col: 'color-mix(in srgb, var(--good) 70%, var(--mid))', n: 0 },
    { label: '6.0–7.4', min: 6.0, max: 7.5, col: 'var(--mid)', n: 0 },
    { label: '4.0–5.9', min: 4.0, max: 6.0, col: 'color-mix(in srgb, var(--mid) 50%, var(--bad))', n: 0 },
    { label: '1.0–3.9', min: 0,   max: 4.0, col: 'var(--bad)', n: 0 }
  ];
  for (const r of rated) {
    const b = buckets.find(x => r.total >= x.min && r.total < x.max) || buckets[buckets.length - 1];
    b.n++;
  }
  const maxB = Math.max(1, ...buckets.map(b => b.n));

  const catStats = groups().map(g => {
    const items = rated.filter(r => catKey(r) === g.id).sort(byScore);
    const cAvg = items.length ? round1(items.reduce((a, x) => a + x.total, 0) / items.length) : null;
    return { name: g.name, count: items.length, avg: cAvg, top: items[0] || null };
  }).filter(c => c.count > 0);

  el.statsContent.innerHTML = `
    <div class="stats-kpis">
      <div class="kpi-card">
        <span class="kpi-val">${rated.length}</span>
        <span class="kpi-sub">Всего оценок (${favCount} ★)</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-val" style="color:var(--${tierT(avg)})">${fmt(avg)}</span>
        <span class="kpi-sub">Средний балл · ${verdict(avg)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-val">${fmt(median)}</span>
        <span class="kpi-sub">Медиана (${fmt(scores[0])}–${fmt(scores[scores.length - 1])})</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-val" style="color:var(--good)">${best ? fmt(best.total) : '—'}</span>
        <span class="kpi-sub" title="${best ? esc(best.name) : ''}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Лидер: ${best ? esc(best.name) : '—'}</span>
      </div>
    </div>

    <div class="stat-block">
      <h4>Распределение по баллам</h4>
      <div class="dist-list">
        ${buckets.map(b => `
          <div class="dist-row">
            <span class="dist-label">${b.label}</span>
            <div class="dist-track"><div class="dist-fill" style="width:${Math.round(b.n / maxB * 100)}%;background:${b.col}"></div></div>
            <span class="dist-cnt">${b.n} (${Math.round(b.n / rated.length * 100)}%)</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="stat-block">
      <h4>Аналитика по категориям</h4>
      <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:8px;">
        ${catStats.map(c => `
          <div class="cat-stat-row">
            <div style="min-width:0;">
              <strong style="font-size:14.5px;">${esc(c.name)}</strong>
              <p style="font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${c.count} ${plural(c.count, 'оценка', 'оценки', 'оценок')}${c.top ? ` · Топ-1: ${esc(c.top.name)} (${fmt(c.top.total)})` : ''}
              </p>
            </div>
            <span class="badge sm" data-tier="${tierT(c.avg)}">${c.avg != null ? fmt(c.avg) : '—'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function toggleCompare(id) {
  const idx = state.cmpIds.indexOf(id);
  if (idx >= 0) {
    state.cmpIds.splice(idx, 1);
  } else {
    if (state.cmpIds.length >= 2) state.cmpIds.shift();
    state.cmpIds.push(id);
  }
  renderBoard();
  if (state.cmpIds.length === 2) openCompareModal();
  else if (state.cmpIds.length === 1) toast('Выбери вторую оценку для сравнения ⚖️');
}
function updateCmpTray() {
  if (!el.cmpTrayBtn) return;
  state.cmpIds = state.cmpIds.filter(id => state.ratings.some(r => r.id === id));
  el.cmpTrayBtn.hidden = state.cmpIds.length === 0;
  if (el.cmpCount) el.cmpCount.textContent = String(state.cmpIds.length);
}
function openCompareModal() {
  if (state.cmpIds.length < 2) { toast('Выбери две оценки в рейтинге кнопкой «⚖️ Сравнить»'); return; }
  const a = state.ratings.find(r => r.id === state.cmpIds[0]);
  const b = state.ratings.find(r => r.id === state.cmpIds[1]);
  if (!a || !b) return;
  const allCritNames = [];
  const seen = new Set();
  for (const s of [...a.scores, ...b.scores]) {
    const k = keyOf(s.name);
    if (!seen.has(k)) { seen.add(k); allCritNames.push(s.name); }
  }
  const rowsHTML = allCritNames.map(name => {
    const k = keyOf(name);
    const sa = a.scores.find(s => keyOf(s.name) === k);
    const sb = b.scores.find(s => keyOf(s.name) === k);
    const va = sa ? sa.v : 0, vb = sb ? sb.v : 0;
    return `<div class="cmp-row">
      <div class="cmp-val${va > vb ? ' win' : ''}">${va || '—'}</div>
      <div class="cmp-crit-name">${esc(name)}</div>
      <div class="cmp-val right${vb > va ? ' win' : ''}">${vb || '—'}</div>
    </div>`;
  }).join('');

  el.cmpBody.innerHTML = `
    <div class="cmp-header-grid">
      <div class="cmp-col-head">
        <span class="badge big" data-tier="${tierT(a.total)}">${a.total != null ? fmt(a.total) : '—'}</span>
        <h4>${esc(a.name)}</h4>
        <span style="font-size:12px;color:var(--ink-2);">${esc(catNameOf(a))} · ${verdict(a.total)}</span>
      </div>
      <div class="cmp-col-head">
        <span class="badge big" data-tier="${tierT(b.total)}">${b.total != null ? fmt(b.total) : '—'}</span>
        <h4>${esc(b.name)}</h4>
        <span style="font-size:12px;color:var(--ink-2);">${esc(catNameOf(b))} · ${verdict(b.total)}</span>
      </div>
    </div>
    <div class="cmp-table">${rowsHTML}</div>
  `;
  el.compareModal.hidden = false;
  document.documentElement.classList.add('locked');
}
function closeCompareModal() {
  if (!el.compareModal) return;
  el.compareModal.hidden = true;
  document.documentElement.classList.remove('locked');
}
if (el.cmpTrayBtn) el.cmpTrayBtn.addEventListener('click', openCompareModal);
if (el.cmpClose) el.cmpClose.addEventListener('click', closeCompareModal);
if (el.cmpClearBtn) el.cmpClearBtn.addEventListener('click', () => { state.cmpIds = []; closeCompareModal(); renderBoard(); });
if (el.compareModal) el.compareModal.addEventListener('click', e => { if (e.target === el.compareModal) closeCompareModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.compareModal && !el.compareModal.hidden) closeCompareModal(); });

if (el.favBtn) {
  el.favBtn.addEventListener('click', () => {
    form.fav = !form.fav;
    el.favBtn.setAttribute('aria-pressed', String(form.fav));
    scheduleDraft();
  });
}
// поиск трека: идёт прямо при вводе названия
function scheduleMusicSearch() {
  clearTimeout(musicTimer);
  const name = form.name.trim();
  if (!formMusic() || name.length < 2) { musicSeq++; musicItems = []; renderMusicResults(); musicMsg(''); return; }
  // исполнитель, написанный своими руками, уточняет поиск, а оставшийся от прошлого выбранного трека — нет
  const artist = form.artist.trim();
  const both = artist && keyOf(artist) !== musicPickedArtist;
  musicTimer = setTimeout(() => (both ? searchMusic(artist + ' ' + name, name) : searchMusic(name)), 420);
}
{
  const closeMusic = () => { clearTimeout(musicTimer); musicSeq++; musicItems = []; renderMusicResults(); };
  el.name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closeMusic();
    if (e.key === 'Escape' && musicItems.length) { e.stopPropagation(); closeMusic(); }
    if (e.key === 'ArrowDown' && musicItems.length) { e.preventDefault(); const f = document.querySelector('#musicResults .music-opt'); if (f) f.focus(); }
  });
  const list = $('musicResults');
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-music]'); if (b && musicItems[+b.dataset.music]) applyMusicPick(musicItems[+b.dataset.music]); });
  list.addEventListener('keydown', (e) => {
    const b = e.target.closest('.music-opt');
    if (!b) return;
    if (e.key === 'ArrowDown' && b.nextElementSibling) { e.preventDefault(); b.nextElementSibling.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (b.previousElementSibling || el.name).focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); closeMusic(); el.name.focus(); }
  });
  document.addEventListener('click', (e) => { if (musicItems.length && !e.target.closest('#musicResults, #itemName')) closeMusic(); });
  $('musicPicked').addEventListener('click', (e) => { if (e.target.closest('#musicUnlink')) { form.link = ''; renderMusicPicked(); scheduleDraft(); } });
}
if (el.artist) {
  el.artist.addEventListener('input', () => { form.artist = el.artist.value; artistPick = -1; showArtistList(); renderArtist(); updateNameState(); scheduleDraft(); scheduleCovers(); scheduleArtistNet(); });
  el.artist.addEventListener('focus', () => showArtistList());
  el.artist.addEventListener('blur', () => setTimeout(hideArtistList, 120));
  el.artist.addEventListener('keydown', e => {
    const opts = el.artistList.hidden ? [] : [...el.artistList.querySelectorAll('[data-artist]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opts.length) { showArtistList(); return; }
      e.preventDefault();
      artistPick = (artistPick + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === artistPick)));
      el.artist.setAttribute('aria-activedescendant', 'artOpt' + artistPick);
      opts[artistPick].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (artistPick >= 0 && opts[artistPick]) pickArtist(opts[artistPick].dataset.artist);
      else { hideArtistList(); el.name.focus(); }
    } else if (e.key === 'Escape' && !el.artistList.hidden) {
      e.preventDefault();
      hideArtistList();
    }
  });
  el.artistList.addEventListener('mousedown', e => e.preventDefault()); // фокус остаётся в поле
  el.artistList.addEventListener('click', e => { const o = e.target.closest('[data-artist]'); if (o) pickArtist(o.dataset.artist); });
  el.artistAva.addEventListener('click', () => {
    if (!keyOf(form.artist)) { toast('Сначала напиши исполнителя'); el.artist.focus(); return; }
    el.artistFile.click();
  });
  el.artistFile.addEventListener('change', async () => {
    const f = el.artistFile.files && el.artistFile.files[0];
    el.artistFile.value = '';
    const name = artistEditing || form.artist;
    if (!f || !keyOf(name)) return;
    if (!(await setArtistAvaFile(name, f, `Аватарка исполнителя «${name.trim()}» сохранена`))) return;
    if (artistEditing) openArtistEdit();
  });
  el.artistEdit.addEventListener('click', openArtistEdit);
  $('artistSugg').addEventListener('click', e => {
    const b = e.target.closest('[data-genius]');
    if (!b) return;
    if (b.dataset.genius === 'skip') { geniusSkip.add(keyOf(form.artist)); geniusItems = []; renderGenius(); return; }
    pickGenius(+b.dataset.genius);
  });
  $('coverSugg').addEventListener('click', e => { const b = e.target.closest('[data-cover]'); if (b) pickCover(+b.dataset.cover); });
  el.artistEditBox.addEventListener('click', async e => {
    const b = e.target.closest('[data-aact]');
    if (!b) return;
    const act = b.dataset.aact;
    if (act === 'cancel') { closeArtistEdit(); renderArtist(); }
    else if (act === 'ava') el.artistFile.click();
    else if (act === 'noava') { if (!artistSetAva(artistEditing, '')) toast('Не получилось сохранить: в браузере нет места'); openArtistEdit(); }
    else if (act === 'save') {
      const v = $('artistNewName').value;
      if (!keyOf(v)) { toast('Имя исполнителя не может быть пустым'); return; }
      const old = artistEditing;
      closeArtistEdit();
      if (v.trim() !== old) await artistRename(old, v); else renderArtist();
    }
  });
  el.artistEditBox.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'artistNewName') { e.preventDefault(); el.artistEditBox.querySelector('[data-aact="save"]').click(); }
    if (e.key === 'Escape') { closeArtistEdit(); renderArtist(); el.artistEdit.focus(); }
  });
}
if (el.statusChips) {
  el.statusChips.addEventListener('click', e => {
    const b = e.target.closest('button[data-status]');
    if (!b) return;
    const val = b.dataset.status.trim();
    form.status = form.status === val ? '' : val;
    renderForm();
    scheduleDraft();
  });
}
if (el.meta) el.meta.addEventListener('input', () => { form.meta = el.meta.value; scheduleDraft(); });
if (el.pros) el.pros.addEventListener('input', () => { form.pros = el.pros.value; autoGrow(el.pros); scheduleDraft(); });
if (el.cons) el.cons.addEventListener('input', () => { form.cons = el.cons.value; autoGrow(el.cons); scheduleDraft(); });

if (el.layoutGroup) {
  el.layoutGroup.addEventListener('click', e => {
    const b = e.target.closest('button[data-bmode]');
    if (!b) return;
    state.bmode = b.dataset.bmode;
    savePrefs();
    renderBoard();
  });
}
if (el.subFilters) {
  el.subFilters.addEventListener('click', e => {
    const b = e.target.closest('button[data-sfilter]');
    if (!b) return;
    // повторное нажатие на уровень снимает фильтр
    state.sfilter = (state.sfilter === b.dataset.sfilter && b.closest('.lvl-chips')) ? 'all' : b.dataset.sfilter;
    renderBoard();
  });
  // меню «Вид и фильтры» закрывается кликом мимо, по Esc и после случайной оценки
  const boardMore = document.getElementById('boardMore');
  if (boardMore) {
    document.addEventListener('click', e => { if (boardMore.open && !boardMore.contains(e.target)) boardMore.open = false; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && boardMore.open) { boardMore.open = false; boardMore.querySelector('summary').focus(); } });
    if (el.randomBtn) el.randomBtn.addEventListener('click', () => { boardMore.open = false; });
  }
}
if (el.randomBtn) {
  el.randomBtn.addEventListener('click', () => {
    const visible = [...el.board.querySelectorAll('.entry')];
    if (!visible.length && !state.ratings.length) { toast('Пока нет оценок для выбора'); return; }
    const pool = state.ratings;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) {
      if (state.bmode === 'tiers') { state.bmode = 'list'; }
      goToRating(pick.id);
      toast(`🎲 Случайный выбор: ${pick.name}`);
    }
  });
}
{
  const seg = document.getElementById('statsSeg'), tv = document.getElementById('tierView');
  if (seg) seg.addEventListener('click', e => {
    const b = e.target.closest('[data-sview]');
    if (!b || state.statsView === b.dataset.sview) return;
    state.statsView = b.dataset.sview;
    savePrefs();
    renderStats();
  });
  if (tv) tv.addEventListener('click', e => {
    const gb = e.target.closest('[data-genre]');
    if (gb) { toggleGenre(gb.dataset.genre); return; }
    const c = e.target.closest('[data-tlcat]');
    if (c) {
      const id = c.dataset.tlcat;
      let cats = state.tierOpts.cats ? [...state.tierOpts.cats] : [];
      if (id === 'all') cats = null;
      else { cats = cats.includes(id) ? cats.filter(x => x !== id) : [...cats, id]; if (!cats.length) cats = null; }
      state.tierOpts.cats = cats;
      savePrefs(); renderTierView();
      return;
    }
    const m = e.target.closest('[data-tlmode]');
    if (m) { state.tierOpts.mode = m.dataset.tlmode; savePrefs(); renderTierView(); return; }
    const a = e.target.closest('[data-tl]');
    if (a && a.dataset.tl === 'mine') { openTierMaker(); return; }
    if (a) { a.disabled = true; tierExport(a.dataset.tl).finally(() => { a.disabled = false; }); return; }
    const g = e.target.closest('[data-tier-goto]');
    if (g) goToRating(g.dataset.tierGoto);
  });
}
if (el.tierBoard) {
  el.tierBoard.addEventListener('click', e => {
    const b = e.target.closest('[data-tier-goto]');
    if (!b) return;
    state.bmode = 'list';
    goToRating(b.dataset.tierGoto);
  });
}
if (el.optPc) {
  el.optPc.addEventListener('change', () => {
    state.exportOpts.pc = el.optPc.checked;
    savePrefs();
    refreshShare();
  });
}

/* ---------- Две вкладки: что сохранено в другой, приходит и сюда. Иначе следующее сохранение здесь затёрло бы то, что там добавили ---------- */
window.addEventListener('storage', async e => {
  if (state.mode !== 'local' || !e.newValue) return;
  try {
    if (e.key === STORAGE_KEYS.RATINGS) {
      const list = JSON.parse(e.newValue);
      if (!Array.isArray(list)) return;
      await hydratePhotos(list);
      state.ratings = list.map(r => (r && typeof r.id === 'string' ? normalizeRating(r.id, r) : null)).filter(Boolean);
      renderBoard();
      updateNameState();
    } else if (e.key === STORAGE_KEYS.CATS && !state.editCat && !catTimer) {
      const cats = parseCats({ items: JSON.parse(e.newValue) });
      if (!cats || !cats.length) return;
      state.cats = cats;
      if (!form.editingId && !currentCat()) form.cat = state.cats[0].id;
      renderForm();
      renderBoard();
    } else if (e.key === STORAGE_KEYS.LOG && !LOG.editing) {
      const log = JSON.parse(e.newValue);
      if (Array.isArray(log)) { LOG.entries = readLog(log); indexLog(); renderLog(); renderBoard(); }
    }
  } catch (_) {}
});

/* ---------- Boot ---------- */
loadDraft();
loadPrefs();
applyTheme(state.theme);
syncSort();
setView(state.view);
setLogTab(state.logTab);
setSection(state.section);
renderForm();
renderNotice();
renderBoard();
renderLog();
ready = initStorage();

