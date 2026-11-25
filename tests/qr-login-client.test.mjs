// Страница входа по QR-коду (/qr-login.js) с поддельными часами и сетью: опрос один, «Войти» в последние секунды не
// теряется, новый код не ждёт застрявший старый опрос, телефон дожидается проверки сессии.
// node --test tests/qr-login-client.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../qr-login.js', import.meta.url), 'utf8');
function world() {
  let now = 0, tid = 0;
  const timers = [], L = {}, calls = [];
  const body = { innerHTML: '' }, title = { textContent: '' }, modal = { hidden: false };
  const doc = {
    hidden: false,
    getElementById: (id) => (id === 'authModal' ? modal : id === 'authBody' ? body : id === 'authTitle' ? title : null),
    addEventListener: (n, f) => { (L[n] = L[n] || []).push(f); },
  };
  const w = {
    CasualUtil: { esc: (s) => String(s), script: async () => {} }, CasualQR: { svg: () => '<svg/>' },
    openAuthModal() { modal.hidden = false; }, closeAuthModal() { modal.hidden = true; },
    loginWithSession: async (r) => { calls.push('LOGIN ' + r.token); return true; },
  };
  const ctx = {
    window: w, document: doc, location: { origin: 'https://x' }, localStorage: { getItem: () => null }, Promise, Intl,
    Date: { now: () => now },
    setTimeout: (f, ms) => { timers.push({ id: ++tid, at: now + ms, f }); return tid; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const flush = async () => { for (let i = 0; i < 40; i++) await null; };
  const tick = async (ms) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift(); now = t.at; t.f(); await flush();
    }
    now = end;
  };
  const later = (ms, f) => timers.push({ id: ++tid, at: now + ms, f });
  const click = (what) => L.click.forEach((f) => f({ target: { closest: () => ({ dataset: { qr: what }, disabled: false }) } }));
  return { w, doc, L, calls, tick, flush, later, click, body, get now() { return now; } };
}

test('компьютер: «Войти» на телефоне за миг до конца кода — вопрос «Войти как…?», а не новый код; «Да» — вход', async () => {
  const W = world();
  let n = 0;
  W.w.casualApi = { post: (p, d) => new Promise((res) => W.later(100, () => {
    if (p === '/qr/new') return res({ id: 'a' + (++n), key: 'k', ttl: 180000 });
    const approved = d.id === 'a1' && W.now >= 179900;
    res(approved ? (d.take ? { state: 'ok', token: 'T', user: { id: 'u' } } : { state: 'confirm', user: { name: 'Я', handle: 'me' } }) : { state: 'wait' });
  })) };
  W.w.CasualQrLogin.show(); await W.flush(); await W.tick(200000);
  assert.match(W.body.innerHTML, /Войти как Я \(@me\)\?/);
  assert.equal(n, 1, 'код не меняли: срок знает сервер');
  assert.equal(W.calls.length, 0, 'без «Да» не входим');
  W.click('take'); await W.flush(); await W.tick(1000);
  assert.deepEqual(W.calls, ['LOGIN T']);
});

test('компьютер: вкладку спрятали и показали, пока опрос в пути, — опрос всё равно один', async () => {
  const W = world();
  let release = [];
  W.w.casualApi = { post: (p) => {
    if (p === '/qr/new') return Promise.resolve({ id: 'a', key: 'k', ttl: 180000 });
    W.calls.push(p);
    return new Promise((r) => release.push(() => r({ state: 'wait' })));
  } };
  W.w.CasualQrLogin.show(); await W.flush(); await W.tick(2500);
  W.L.visibilitychange.forEach((f) => f()); await W.flush();
  release.forEach((f) => f()); release = []; await W.flush();
  const before = W.calls.length;
  W.w.casualApi.post = async (p) => { W.calls.push(p); return { state: 'wait' }; };
  await W.tick(25000);
  assert.equal(W.calls.length - before, 10, 'раз в 2,5 с, без второго круга');
});

test('компьютер: «Новый код», пока старый опрос висит в медленной сети, — новый код опрашивается, старый ответ не мешает', async () => {
  const W = world();
  let n = 0, slow = null;
  W.w.casualApi = { post: (p, d) => {
    if (p === '/qr/new') return Promise.resolve({ id: 'c' + (++n), key: 'k', ttl: 180000 });
    W.calls.push(d.id);
    if (d.id === 'c1') return new Promise((r) => { slow = r; });
    return Promise.resolve({ state: 'wait' });
  } };
  W.w.CasualQrLogin.show(); await W.flush(); await W.tick(2600);
  W.click('again'); await W.flush(); await W.tick(10000);
  assert.ok(W.calls.filter((c) => c === 'c2').length >= 3, 'новый код опрашивается');
  const c2 = W.calls.length;
  slow({ state: 'wait' }); await W.flush(); await W.tick(5000);
  assert.equal(W.calls.filter((c) => c === 'c1').length, 1, 'старый код больше не спрашиваем');
  assert.equal(W.calls.length - c2, 2, 'за 5 с — два опроса нового кода, не больше');
});

test('телефон: сессия проверяется дольше 6 с — сначала «войди здесь», появилась — вопрос открывается сам', async () => {
  const W = world();
  let online = false, saw = 0;
  W.w.casualApi = { online: () => online, post: async (p) => {
    if (p === '/qr/see') { saw++; return { state: 'ask', device: 'Chrome · Windows', country: 'UA', city: 'Kyiv', user: { name: 'Я', handle: 'me' } }; }
    return {};
  } };
  W.w.CasualQrLogin.ask('d'.repeat(32)); await W.flush(); await W.tick(7000);
  assert.match(W.body.innerHTML, /Войти здесь/);
  online = true; await W.tick(1000);
  assert.equal(saw, 1);
  assert.match(W.body.innerHTML, /Войти в аккаунт @me на другом устройстве\?/);
  assert.match(W.body.innerHTML, /Kyiv, /, 'город и страна компьютера');
});
