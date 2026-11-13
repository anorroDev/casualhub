// Размер интерфейса (util.js, CasualUtil.size): предел по ширине экрана, запоминание, zoom на <html> и подмена координат
// окна при размере не 100 %. Браузера нет: util.js выполняется с заглушками window и document.
// node --test tests/size.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../util.js', import.meta.url), 'utf8');
const KEY = 'casualhub.size.v1';

// std — браузер считает zoom по стандарту (прямоугольники в пикселях экрана); known — знает ли zoom вообще
function boot({ width = 1280, height = 800, std = true, known = true, stored = null } = {}) {
  const store = new Map(stored ? [[KEY, String(stored)]] : []);
  const env = { width, height, sx: 0, sy: 0, efp: null, scrolled: null, events: [] };
  const style = () => { const p = new Map(); return { zoom: '', cssText: '', setProperty: (k, v) => p.set(k, String(v)), removeProperty: (k) => p.delete(k), getPropertyValue: (k) => p.get(k) || '' }; };
  const zoomOf = (el) => { let z = 1; for (let n = el; n; n = n.parent) z *= parseFloat(n.style.zoom) || +((/zoom:([\d.]+)/.exec(n.style.cssText) || [0, 1])[1]); return z; };
  const num = (el, k) => +((new RegExp(k + ':(\\d+)px').exec(el.style.cssText) || [0, 0])[1]);
  class Element {
    constructor(tag) { this.tagName = tag; this.style = style(); this.children = []; this.dataset = {}; this.parent = null; this.box = null; }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; }
    get firstChild() { return this.children[0] || null; }
    // «настоящий» прямоугольник: размеры блока в пикселях страницы × все zoom над ним (по-старому — без zoom)
    getBoundingClientRect() {
      const b = this.box || { x: 0, y: 0, width: num(this, 'width'), height: num(this, 'height') }, z = std ? zoomOf(this) : 1;
      return { x: b.x * z, y: b.y * z, width: b.width * z, height: b.height * z, left: b.x * z, top: b.y * z };
    }
    get clientWidth() { return this.tagName === 'html' ? env.width - 12 : 0; }
    get scrollTop() { return this.tagName === 'html' ? env.sy : 0; }
    set scrollTop(v) { if (this.tagName === 'html') env.sy = v; }
  }
  class Document { elementFromPoint(x, y) { env.efp = [x, y]; return null; } }
  class MouseEvent { constructor(x, y) { this.px = x; this.py = y; } get clientX() { return this.px; } get clientY() { return this.py; } }
  class DOMRect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h }); } }
  const listeners = {};
  const on = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
  const fire = (e) => { env.events.push(e.type); (listeners[e.type] || []).forEach((f) => f(e)); return true; };
  const document = new Document();
  const html = document.documentElement = new Element('html');
  document.body = html.appendChild(new Element('body'));
  document.head = new Element('head');
  document.scripts = [];
  document.createElement = (t) => new Element(t);
  document.dispatchEvent = fire;
  const window = { document, screen: { width }, Touch: undefined, Range: undefined, dispatchEvent: fire, scrollTo(x, y) { env.scrolled = typeof x === 'object' ? x : [x, y]; if (typeof x !== 'object') { env.sx = x; env.sy = y; } } };
  for (const [k, get] of Object.entries({ innerWidth: () => env.width, innerHeight: () => env.height, scrollX: () => env.sx, scrollY: () => env.sy, devicePixelRatio: () => 2 })) {
    Object.defineProperty(window, k, { get, set() {}, configurable: true, enumerable: true });
  }
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const CSS = { supports: (p) => known && p === 'zoom' };
  window.CSS = CSS;
  class Event { constructor(type) { this.type = type; } }
  class CustomEvent extends Event { constructor(type, o) { super(type); this.detail = o && o.detail; } }
  // таймер срабатывает сразу: «подождать, пока окно перестанут тянуть» здесь не нужно
  const run = new Function('window', 'document', 'localStorage', 'location', 'addEventListener', 'screen', 'CSS', 'Element', 'MouseEvent', 'Document', 'DOMRect', 'Event', 'CustomEvent', 'setTimeout', 'clearTimeout', 'Range', 'Touch', SRC);
  run(window, document, localStorage, { search: '', pathname: '/admin/' }, on, window.screen, CSS, Element, MouseEvent, Document, DOMRect, Event, CustomEvent, (f) => { f(); return 0; }, () => {}, undefined, undefined);
  return { size: window.CasualUtil.size, window, document, html, store, env, fire, Element, MouseEvent, resize(w) { env.width = w; window.screen.width = w; fire(new Event('resize')); } };
}

test('100 %: zoom нет и ничего не подменено', () => {
  const b = boot();
  const nat = b.Element.prototype.getBoundingClientRect;
  assert.equal(b.size.get(), 100);
  assert.equal(b.html.style.zoom, '');
  assert.equal(b.window.innerWidth, 1280);
  assert.equal(b.window.devicePixelRatio, 2);
  assert.equal(b.Element.prototype.getBoundingClientRect, nat);
  assert.deepEqual([...b.size.list], [80, 90, 100, 110, 125, 150]);
});

test('выбранный размер ставится при загрузке: zoom, --uiz и координаты окна — в пикселях страницы', () => {
  const b = boot({ stored: 125 });
  assert.equal(b.size.get(), 125);
  assert.equal(b.html.style.zoom, '1.25');
  assert.equal(b.html.style.getPropertyValue('--uiz'), '1.25');
  assert.equal(b.window.innerWidth, 1024);
  assert.equal(b.window.innerHeight, 640);
  assert.equal(b.window.devicePixelRatio, 2.5); // холсты остаются чёткими
  assert.equal(b.html.clientWidth, (1280 - 12) / 1.25);
  // блок 200×40 в точке (100, 50) страницы: браузер отдал бы (125, 62.5, 250, 50), скрипты получают пиксели страницы
  const el = b.document.body.appendChild(new b.Element('div'));
  el.box = { x: 100, y: 50, width: 200, height: 40 };
  const r = el.getBoundingClientRect();
  assert.deepEqual([r.left, r.top, r.width, r.height, r.right, r.bottom], [100, 50, 200, 40, 300, 90]);
  assert.equal(new b.MouseEvent(250, 500).clientX, 200);
  assert.equal(new b.MouseEvent(250, 500).clientY, 400);
  b.document.elementFromPoint(100, 50);
  assert.deepEqual(b.env.efp, [125, 62.5]);
  b.window.scrollTo(0, 400);
  assert.deepEqual(b.env.scrolled, [0, 500]);
  assert.equal(b.window.scrollY, 400);
  assert.equal(b.html.scrollTop, 400);
  b.window.scrollTo({ top: 100, behavior: 'smooth' });
  assert.deepEqual(b.env.scrolled, { top: 125, behavior: 'smooth' });
});

test('apply: запоминает, 100 % убирает ключ и zoom, о смене узнают по resize и casualhub:size', () => {
  const b = boot();
  assert.equal(b.size.apply(150, true), 150);
  assert.equal(b.store.get(KEY), '150');
  assert.equal(b.html.style.zoom, '1.5');
  assert.ok(b.env.events.includes('resize') && b.env.events.includes('casualhub:size'));
  assert.equal(b.size.apply(90, false), 90); // примерка: в память не попадает
  assert.equal(b.store.get(KEY), '150');
  assert.equal(b.size.apply(100, true), 100);
  assert.equal(b.store.has(KEY), false);
  assert.equal(b.html.style.zoom, '');
  assert.equal(b.window.innerWidth, 1280);
  assert.equal(b.size.apply(77, true), 100); // такого размера нет
});

test('место на странице сохраняется: прокрутка окна пересчитывается под новый размер', () => {
  const b = boot();
  b.env.sy = 800;
  b.size.apply(125, false);
  assert.equal(b.env.sy, 1000); // страница стала в 1,25 раза длиннее
  assert.equal(b.window.scrollY, 800);
});

test('предел по ширине: раскладке для компьютера нужно 720 px, для планшета 560, телефонной 320', () => {
  const fit = (width, pct) => boot({ width }).size.apply(pct, false);
  assert.equal(fit(1280, 150), 150); // 853
  assert.equal(fit(1080, 150), 150); // ровно 720
  assert.equal(fit(1000, 150), 125); // 666 < 720, а 800 помещается
  assert.equal(fit(980, 150), 125);
  assert.equal(fit(840, 150), 150); // планшет: ровно 560
  assert.equal(fit(700, 150), 125); // 466 < 560, а 560 помещается
  assert.equal(fit(600, 125), 100); // 545 < 560 даже при 110 %
  assert.equal(fit(430, 150), 125); // телефон: 344
  assert.equal(fit(400, 125), 125); // ровно 320
  assert.equal(fit(360, 125), 110); // 327
  assert.equal(fit(340, 110), 100); // 309 < 320
  assert.equal(fit(340, 80), 80); // мельче — помещается всегда
  const b = boot({ width: 360 });
  assert.equal(b.size.fits(110), true);
  assert.equal(b.size.fits(125), false);
});

test('узкое окно: стоит помещающийся размер, выбранный помнится и возвращается, когда окно расширили', () => {
  const b = boot({ width: 1000, stored: 150 });
  assert.equal(b.size.get(), 125);
  assert.equal(b.size.stored(), 150);
  b.resize(1280);
  assert.equal(b.size.get(), 150);
  b.resize(600);
  assert.equal(b.size.get(), 100);
  assert.equal(b.html.style.zoom, '');
  assert.equal(b.store.get(KEY), '150');
});

test('выбрали размер в другой вкладке — эта вкладка меняется тоже', () => {
  const b = boot();
  b.store.set(KEY, '110');
  b.fire({ type: 'storage', key: KEY });
  assert.equal(b.size.get(), 110);
  b.store.delete(KEY);
  b.fire({ type: 'storage', key: KEY });
  assert.equal(b.size.get(), 100);
  b.fire({ type: 'storage', key: 'другое' });
  assert.equal(b.size.get(), 100);
});

test('браузер со старым zoom (координаты не масштабирует) или без zoom размер не меняет', () => {
  for (const o of [{ std: false }, { known: false }]) {
    const b = boot({ ...o, stored: 125 });
    assert.equal(b.size.ok(), false);
    assert.equal(b.size.get(), 100);
    assert.equal(b.html.style.zoom, '');
    assert.equal(b.window.innerWidth, 1280);
    assert.equal(b.size.apply(150, true), 100);
    assert.equal(b.store.has(KEY), false); // выбор, который не сработает, не запоминаем
  }
  assert.equal(boot().size.ok(), true);
});
