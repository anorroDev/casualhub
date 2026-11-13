// Курсор из магазина (util.js, CasualUtil.cursor): ставится только своему аккаунту, картинки проверяются, а у правил cursor
// из стилей сайта появляются двойники со своими картинками. Браузера нет: util.js выполняется с заглушками window и document.
// node --test tests/cursor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../util.js', import.meta.url), 'utf8');
const KEY = 'casualhub.cursor.v1';
const svg = (fill) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1" fill="${fill}"/></svg>`);
const CUR = { a: svg('#111'), b: svg('#FD4'), t: svg('#fff'), x: 1, y: 1, tx: 9, ty: 13 };

// sheets — правила стилей «страницы» (как document.styleSheets), user — кто вошёл (null — никто)
function boot({ user = 'u1', stored = null, sheets = [] } = {}) {
  const store = new Map();
  if (user) { store.set('ocenshik.user.v1', JSON.stringify({ id: user })); store.set('casualhub.tokens.v1', JSON.stringify({ [user]: 'tok' })); }
  if (stored) store.set(KEY, JSON.stringify(stored));
  const classes = new Set();
  class Element {
    constructor(tag) { this.tagName = tag; this.nodeName = tag.toUpperCase(); this.children = []; this.parent = null; this.style = { zoom: '', setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }; this.dataset = {}; this.textContent = ''; this.id = ''; }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    get isConnected() { return !!this.parent; }
    getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 }; }
  }
  const html = new Element('html');
  html.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  const document = { documentElement: html, head: html.appendChild(new Element('head')), readyState: 'complete', createElement: (t) => new Element(t), styleSheets: sheets.map((rules) => ({ cssRules: rules, ownerNode: null })), dispatchEvent() {}, elementFromPoint: () => null };
  document.body = html.appendChild(new Element('body'));
  const listeners = {};
  const on = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
  const window = { document, screen: { width: 1280 }, dispatchEvent() {}, scrollTo() {} };
  for (const k of ['innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'devicePixelRatio']) Object.defineProperty(window, k, { get: () => (k === 'innerWidth' ? 1280 : k === 'innerHeight' ? 800 : k === 'devicePixelRatio' ? 1 : 0), configurable: true });
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const run = new Function('window', 'document', 'localStorage', 'location', 'addEventListener', 'screen', 'CSS', 'Element', 'MouseEvent', 'Document', 'DOMRect', 'Event', 'CustomEvent', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'MutationObserver', 'Range', 'Touch', SRC);
  run(window, document, localStorage, { search: '', pathname: '/admin/' }, on, window.screen, { supports: () => false }, Element, class {}, class {}, class {}, class { constructor(t) { this.type = t; } }, class { constructor(t) { this.type = t; } },
    (f) => { f(); return 0; }, () => {}, () => 0, () => {}, undefined, undefined, undefined);
  const site = () => (document.head.children.find((n) => n.id === 'shCurSite') || {}).textContent || '';
  const base = () => (document.head.children.find((n) => n.id === 'shCurBase') || {}).textContent || '';
  const fire = (key) => (listeners.storage || []).forEach((f) => f({ key }));
  return { cursor: window.CasualUtil.cursor, on: () => classes.has('sh-cur'), store, site, base, fire };
}
// правило стилей, похожее на CSSStyleRule
const rule = (selectorText, cursor, important) => ({ selectorText, style: { getPropertyValue: (p) => (p === 'cursor' ? cursor : ''), getPropertyPriority: (p) => (p === 'cursor' && important ? 'important' : '') } });

test('свой курсор: ставится и запоминается только за тем, кто вошёл', () => {
  const u = boot();
  assert.equal(u.on(), false);
  u.cursor.set(CUR);
  assert.equal(u.on(), true);
  assert.equal(JSON.parse(u.store.get(KEY)).uid, 'u1');
  assert.match(u.base(), /--sh-b: url\("data:image\/svg\+xml,[^"]+"\) 1 1, pointer/);
  assert.match(u.base(), /--sh-t: url\("data:[^"]+"\) 9 13, text/);
  u.cursor.set(null);
  assert.equal(u.on(), false);
  assert.equal(u.store.has(KEY), false);
  // без входа не ставится и не запоминается
  const g = boot({ user: null });
  g.cursor.set(CUR);
  assert.equal(g.on(), false);
  assert.equal(g.store.has(KEY), false);
});

test('до первой отрисовки: запомненный курсор своего аккаунта — да, чужого — нет', () => {
  assert.equal(boot({ stored: { ...CUR, uid: 'u1' } }).on(), true);
  assert.equal(boot({ stored: { ...CUR, uid: 'u2' } }).on(), false);
  assert.equal(boot({ user: null, stored: { ...CUR, uid: 'u1' } }).on(), false);
  // вышли в другой вкладке (событие storage) — курсор снимается
  const u = boot({ stored: { ...CUR, uid: 'u1' } });
  u.store.delete('casualhub.tokens.v1');
  u.fire('casualhub.tokens.v1');
  assert.equal(u.on(), false);
});

test('картинки — только SVG data:-адреса без кавычек, точки нажатия — в пределах', () => {
  for (const bad of ['javascript:alert(1)', 'data:image/svg+xml,a")b', 'https://example.com/c.svg', 'data:image/png;base64,AAAA']) {
    const u = boot();
    u.cursor.set({ ...CUR, a: bad });
    assert.equal(u.on(), false, bad);
  }
  const u = boot();
  u.cursor.set({ ...CUR, x: 999, y: -5 });
  assert.match(u.base(), /--sh-a: url\("[^"]+"\) 64 0, default/);
});

test('двойники: «рука» → b, стрелка → a, текст → t, inherit и none как были, !important сохраняется', () => {
  const { cursor } = boot();
  const css = cursor.rewrite([
    rule('.tile, .chip:hover', 'pointer'),
    rule('.btn:disabled', 'default', true),
    rule('.drag', '-webkit-grab, grab'),
    rule('.zoom', 'zoom-in'),
    rule('.split', 'ew-resize'),
    rule('.no', 'not-allowed'),
    rule('.copy-me', 'text'),
    rule('.edit [data-photo]', 'inherit'),
    rule('.hide', 'none'),
    rule('.plain', ''),
  ]);
  assert.match(css, /html\.sh-cur :is\(\.tile\), html\.sh-cur:is\(\.tile\), html\.sh-cur :is\(\.chip:hover\), html\.sh-cur:is\(\.chip:hover\) \{ cursor: var\(--sh-b\); \}/);
  assert.match(css, /:is\(\.btn:disabled\)[^{]*\{ cursor: var\(--sh-a\) !important; \}/);
  for (const s of ['drag', 'zoom', 'split']) assert.match(css, new RegExp(`:is\\(\\.${s}\\)[^{]*\\{ cursor: var\\(--sh-b\\); \\}`), s);
  assert.match(css, /:is\(\.no\)[^{]*\{ cursor: var\(--sh-a\); \}/);
  assert.match(css, /:is\(\.copy-me\)[^{]*\{ cursor: var\(--sh-t\); \}/);
  assert.match(css, /html\.sh-cur :is\(\.edit \[data-photo\]\) \{ cursor: inherit; \}/); // с потомком — без варианта для самого <html>
  assert.match(css, /:is\(\.hide\)[^{]*\{ cursor: none; \}/);
  assert.doesNotMatch(css, /plain/);
});

test('двойники: псевдоэлементы вне :is(), запятые в скобках, url() и относительные адреса', () => {
  const { cursor } = boot();
  const css = cursor.rewrite([
    rule('.wg-rh::after, .x:before', 'pointer'),
    rule('.a:not(.b, .c) > i', 'pointer'),
    rule('[data-x="1,2"]', 'pointer'),
    rule('.own', 'url("data:image/svg+xml,%3Csvg%3E") 1 1, auto'),
    rule('.rel', 'url(cur.png), auto'),
  ]);
  assert.match(css, /html\.sh-cur :is\(\.wg-rh\)::after/);
  assert.match(css, /html\.sh-cur :is\(\.x\):before/);
  assert.match(css, /html\.sh-cur :is\(\.a:not\(\.b, \.c\) > i\) \{/);
  assert.match(css, /html\.sh-cur :is\(\[data-x="1,2"\]\), html\.sh-cur:is\(\[data-x="1,2"\]\) \{/);
  assert.match(css, /:is\(\.own\)[^{]*\{ cursor: url\("data:image\/svg\+xml,%3Csvg%3E"\) 1 1, auto; \}/);
  assert.doesNotMatch(css, /\.rel/); // относительный адрес в другом файле стилей указал бы не туда
});

test('двойники: @media, @supports и @container сохраняются, @keyframes и шрифты пропускаются', () => {
  const { cursor } = boot();
  const css = cursor.rewrite([
    { media: { mediaText: '(hover: hover)' }, conditionText: '(hover: hover)', cssRules: [rule('.m', 'pointer')] },
    { conditionText: '(display: grid)', cssRules: [rule('.s', 'grab')] },
    { containerName: '', conditionText: '(max-width: 380px)', cssRules: [rule('.c', 'pointer')] },
    { name: 'spin', type: 7, cssRules: [{ keyText: '0%', style: { getPropertyValue: () => '', getPropertyPriority: () => '' } }] },
    { style: { getPropertyValue: () => 'pointer', getPropertyPriority: () => '' } },
  ]);
  assert.match(css, /@media \(hover: hover\) \{\nhtml\.sh-cur :is\(\.m\)/);
  assert.match(css, /@supports \(display: grid\) \{\nhtml\.sh-cur :is\(\.s\)/);
  assert.match(css, /@container \(max-width: 380px\) \{\nhtml\.sh-cur :is\(\.c\)/);
  assert.doesNotMatch(css, /spin|keyframes/);
  assert.equal(css.split('\n').filter((l) => l.includes('{ cursor')).length, 3);
});

test('стили страницы: двойники пишутся в свой <style>, курсор сняли — пропадают', () => {
  const u = boot({ sheets: [[rule('.card', 'pointer')], [rule('.btn:disabled', 'default')]] });
  u.cursor.set(CUR);
  assert.match(u.site(), /:is\(\.card\)[^{]*\{ cursor: var\(--sh-b\); \}\nhtml\.sh-cur :is\(\.btn:disabled\)/);
  u.cursor.set(null);
  assert.equal(u.site(), '');
  assert.equal(u.base(), '');
});
