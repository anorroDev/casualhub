// Перевод сайта (lang-en.js, lang-uk.js и движок lang-core.js): в словарях одни и те же русские ключи, {} на месте,
// слова после числа у украинского — форма в форму; движок переводит строки, числа со словами и шаблоны.
// node --test tests/lang.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const packOf = (lang) => { const ctx = { window: {} }; vm.runInNewContext(src(`lang-${lang}.js`), ctx); return ctx.window.CasualLangPack; };
// движок в песочнице: страница без узлов, только то, что ему нужно при запуске
function engine(lang) {
  const nil = { nodeType: 1, tagName: 'HTML', getAttribute: () => null, querySelectorAll: () => [] };
  const ctx = {
    window: { CasualLang: { lang } },
    document: { documentElement: nil, head: { appendChild() {} }, readyState: 'complete', createElement: () => ({}), createTreeWalker: () => ({ nextNode: () => null }), querySelectorAll: () => [], addEventListener() {} },
    MutationObserver: class { observe() {} },
    NodeFilter: { SHOW_TEXT: 4 },
    navigator: {},
    Date, Number,
  };
  ctx.window.confirm = () => true;
  vm.createContext(ctx);
  vm.runInContext(src(`lang-${lang}.js`), ctx);
  vm.runInContext(src('lang-core.js'), ctx);
  return ctx.window.CasualLang.t;
}

const en = packOf('en'), uk = packOf('uk');

test('в английском и украинском словарях одни и те же русские ключи', () => {
  const ek = Object.keys(en.dict), uk_ = Object.keys(uk.dict);
  assert.ok(ek.length > 3000);
  const missUk = ek.filter((k) => !(k in uk.dict)), missEn = uk_.filter((k) => !(k in en.dict));
  assert.deepEqual(missUk, [], 'нет в lang-uk.js — допиши украинский перевод');
  assert.deepEqual(missEn, [], 'нет в lang-en.js — допиши английский перевод');
});

test('{} в переводе столько же, сколько в ключе, и перевод не пустой', () => {
  const cnt = (s) => (s.match(/\{\}/g) || []).length;
  for (const [name, p] of [['lang-en.js', en], ['lang-uk.js', uk]]) {
    for (const [k, v] of Object.entries(p.dict)) {
      assert.ok(typeof v === 'string' && v.trim(), `${name}: пустой перевод «${k}»`);
      assert.equal(cnt(v), cnt(k), `${name}: {} не сходятся в «${k}»`);
    }
  }
});

test('слова после числа: у украинского на каждую русскую форму — своя', () => {
  assert.equal(uk.nouns.length, en.nouns.length);
  for (const [ru, forms] of uk.nouns) {
    assert.ok(Array.isArray(forms) && forms.length === ru.length, `формы для ${ru[0]}`);
    assert.ok(en.nouns.some(([r]) => r[0] === ru[0]), `в lang-en.js тоже есть ${ru[0]}`);
  }
});

test('движок: строки, слова после числа, шаблоны — по-английски и по-украински', () => {
  const tEn = engine('en'), tUk = engine('uk');
  assert.equal(tEn('Сохранить'), 'Save');
  assert.equal(tUk('Сохранить'), 'Зберегти');
  assert.equal(tEn('5 оценок'), '5 ratings');
  assert.equal(tUk('5 оценок'), '5 оцінок');
  assert.equal(tUk('2 друга'), '2 друзі');
  assert.equal(tUk('21 оценка'), '21 оцінка');
  assert.equal(tEn('5 записей за 3 дня'), '5 entries over 3 days');
  assert.equal(tUk('5 записей за 3 дня'), '5 записів за 3 дні');
  assert.equal(tUk('Применить к 3 оценкам'), 'Застосувати до 3 оцінок');
  assert.equal(tUk('«Hades» в планах'), '«Hades» у планах', 'кавычки-ёлочки у украинского остаются');
  assert.equal(tEn('«Hades» в планах'), '“Hades” is in your plans', 'шаблон, который начинается с кавычки, тоже срабатывает');
  assert.equal(tEn('Цвет итогового балла:'), 'Total score color:', 'точная строка без двоеточия важнее шаблона «Цвет {}»');
  assert.equal(tUk('Цвет итогового балла:'), 'Колір підсумкового бала:');
  assert.equal(tEn('Не хватает рофланов: нужно ещё 40.'), 'Not enough Souls: you need 40 more.', 'шаблон с точкой в конце совпадает и без неё');
  assert.equal(tEn('Нажми на клетку или отметь «В планах»'), 'Tap a cell or mark it “Planned”', 'ключ без последней » — как раньше');
  assert.equal(tEn('×2 опыта за: Оценка, Отзыв. До 30 ноября в 18:00 по Киеву.'), '×2 XP for: Rating, Review. Until 30 November at 18:00 Kyiv time.');
  assert.equal(tUk('×2 опыта за: Оценка, Отзыв. До 30 ноября в 18:00 по Киеву.'), '×2 досвіду за: Оцінка, Відгук. До 30 листопада о 18:00 за Києвом.');
  assert.equal(tEn('Тематическая неделя «Музыка»: ×2 опыта за Оценка, Провёл «Царя Горы»'), 'Theme week “Music”: ×2 XP for Rating, Hosted “King of the Hill”');
  assert.equal(tEn('среднее по трекам 7,3 · разобрано 5 из 10'), 'track average 7,3 · 5 of 10 done');
  assert.equal(tUk('Хорошо · 10 треков · 24 листопада'), 'Добре · 10 треків · 24 листопада');
  assert.equal(tEn('5 дней подряд'), '5 days in a row');
  assert.equal(tUk('2 дня подряд'), '2 дні поспіль');
  assert.equal(tUk('Тестер Два'), 'Тестер Два', 'чего нет в словаре — не трогаем');
  assert.equal(tUk(tUk('Настройки')), 'Налаштування', 'переведённое второй раз не меняется');
});

// страница в песочнице: элементы с классами и подписями, текст в них и холст. closest понимает то, что есть в SKIP
// движка: [translate="no"], .класс и «.класс тег»
function pageWith(lang) {
  const all = [], texts = [];
  const match = (n, s) => {
    if (s === '[translate="no"]') return n.a.translate === 'no';
    const [c, tag] = s.split(/\s+/);
    if (!tag) return c.startsWith('.') && n.cls.includes(c.slice(1));
    if (n.tagName !== tag.toUpperCase()) return false;
    for (let p = n.parentElement; p; p = p.parentElement) if (p.cls.includes(c.slice(1))) return true;
    return false;
  };
  const el = (tag, a = {}, parent = null, cls = []) => {
    const n = { nodeType: 1, tagName: tag.toUpperCase(), parentElement: parent, a: { ...a }, cls,
      getAttribute: (k) => (k in n.a ? n.a[k] : null), setAttribute: (k, v) => { n.a[k] = String(v); },
      closest: (sel) => { for (let x = n; x; x = x.parentElement) if (sel.split(',').some((s) => match(x, s.trim()))) return x; return null; } };
    all.push(n);
    return n;
  };
  const text = (parent, v) => { const t = { nodeType: 3, nodeValue: v, parentElement: parent }; texts.push(t); return t; };
  class Ctx { constructor(canvas) { this.canvas = canvas; this.out = []; } fillText(s) { this.out.push(s); } measureText(s) { return { s }; } }
  const root = el('html');
  const page = { el: (tag, a, parent, cls) => el(tag, a, parent || root, cls), text, Ctx };
  page.run = () => {
    const ctx = {
      window: { CasualLang: { lang }, CanvasRenderingContext2D: Ctx },
      CanvasRenderingContext2D: Ctx,
      document: { documentElement: Object.assign(root, { querySelectorAll: () => all.filter((n) => n !== root && Object.keys(n.a).length) }), head: { appendChild() {} }, readyState: 'complete', createElement: () => ({}), createTreeWalker: () => { let i = 0; return { nextNode: () => texts[i++] || null }; }, querySelectorAll: () => [], addEventListener() {} },
      MutationObserver: class { observe() {} },
      NodeFilter: { SHOW_TEXT: 4 },
      navigator: {},
      Date, Number,
    };
    ctx.window.confirm = () => true;
    vm.createContext(ctx);
    vm.runInContext(src(`lang-${lang}.js`), ctx);
    vm.runInContext(src('lang-core.js'), ctx);
  };
  return page;
}

test('написанное людьми не переводится: ни текст, ни подписи (SKIP и translate="no"), ни надписи на холсте с translate = false', () => {
  const P = pageWith('en');
  const plainBtn = P.el('button', { title: 'Сохранить', 'aria-label': 'Сохранить' });
  const card = P.el('button', { title: 'Сохранить', 'aria-label': 'Сохранить', translate: 'no' }, null, ['tl-card']); // карточка тир-листа по имени «Сохранить»
  const inCard = P.el('small', { title: 'Сохранить' }, card);
  const meta = P.el('div', {}, null, ['cm-meta']), who = P.el('b', { title: 'Сохранить' }, meta); // ник в комментарии
  const lab = P.el('button', { title: 'Настроить ряд' }, null, ['tl-lab']); // ряд тир-листа: подпись кнопки — интерфейс
  const labText = P.el('span', { translate: 'no' }, lab);
  const t1 = P.text(plainBtn, 'Сохранить'), t2 = P.text(inCard, 'Сохранить'), t3 = P.text(labText, 'Сохранить');
  P.run();
  assert.equal(plainBtn.a.title, 'Save');
  assert.equal(plainBtn.a['aria-label'], 'Save');
  assert.equal(t1.nodeValue, 'Save');
  assert.equal(card.a.title, 'Сохранить', 'title карточки — её название');
  assert.equal(card.a['aria-label'], 'Сохранить');
  assert.equal(inCard.a.title, 'Сохранить', 'и всё внутри неё');
  assert.equal(t2.nodeValue, 'Сохранить');
  assert.equal(who.a.title, 'Сохранить', 'подписи внутри SKIP — как их текст');
  assert.equal(lab.a.title, 'Row settings', 'у ряда подпись кнопки переводится…');
  assert.equal(t3.nodeValue, 'Сохранить', '…а его название — нет');
  // холст: картинка тир-листа (canvas.translate = false) рисует как есть, остальные — с переводом
  const own = new P.Ctx({ translate: false }), site = new P.Ctx({});
  own.fillText('Сохранить', 0, 0); site.fillText('Сохранить', 0, 0);
  assert.deepEqual([own.out, site.out], [['Сохранить'], ['Save']]);
  assert.equal(own.measureText('Сохранить').s, 'Сохранить');
  assert.equal(site.measureText('Сохранить').s, 'Save');
});
