// gif-shrink.js: кодировщик GIF (палитра, LZW, кадры) — собираем GIF и разбираем его обратно простым декодером.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../gif-shrink.js';

const G = globalThis.CasualGif;

// простой разбор GIF: логический экран, палитра и кадры (индексы после LZW)
function readGif(u8) {
  let p = 0;
  const b = () => u8[p++], w = () => u8[p++] | (u8[p++] << 8);
  const head = String.fromCharCode(...u8.slice(0, 6)); p = 6;
  const W = w(), H = w(), flags = b(); b(); b();
  const tableSize = flags & 0x80 ? 1 << ((flags & 7) + 1) : 0;
  p += tableSize * 3;
  const frames = [];
  let gce = null, loop = false;
  for (;;) {
    const t = b();
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b();
      const blocks = [];
      for (let n = b(); n; n = b()) { blocks.push(u8.slice(p, p + n)); p += n; }
      if (label === 0xf9) { const x = blocks[0]; gce = { dispose: (x[0] >> 2) & 7, trans: x[0] & 1, delay: x[1] | (x[2] << 8), ti: x[3] }; }
      if (label === 0xff && String.fromCharCode(...blocks[0]) === 'NETSCAPE2.0') loop = true;
      continue;
    }
    assert.equal(t, 0x2c, 'ожидался кадр');
    const x = w(), y = w(), fw = w(), fh = w();
    b();
    const minSize = b();
    const data = [];
    for (let n = b(); n; n = b()) { for (let i = 0; i < n; i++) data.push(u8[p + i]); p += n; }
    frames.push({ x, y, w: fw, h: fh, gce, ix: lzwDecode(data, minSize) });
    gce = null;
  }
  return { head, W, H, tableSize, frames, loop };
}
function lzwDecode(data, minSize) {
  const clear = 1 << minSize, eoi = clear + 1;
  let size, next, dict;
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; size = minSize + 1; next = eoi + 1; };
  reset();
  let bits = 0, cur = 0, pos = 0, prev = null;
  const out = [];
  for (;;) {
    while (bits < size) { if (pos >= data.length) return out; cur |= data[pos++] << bits; bits += 8; }
    const code = cur & ((1 << size) - 1);
    cur >>>= size; bits -= size;
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) return out;
    let entry;
    if (code < next && dict[code]) entry = dict[code];
    else if (code === next && prev) entry = prev.concat(prev[0]);
    else throw new Error('неверный код ' + code);
    out.push(...entry);
    if (prev && next < 4096) { dict[next++] = prev.concat(entry[0]); if (next >= 1 << size && size < 12) size++; }
    prev = entry;
  }
}

test('GIF: заголовок, бесконечный повтор, кадры и индексы возвращаются как были (и через «очистку» словаря)', () => {
  const W = 120, H = 90, pal = Array.from({ length: 200 }, (_, i) => [i, 255 - i, (i * 7) & 255]);
  // шум, чтобы словарь LZW переполнился и сработала «очистка» на 4096-м коде
  let s = 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const a = Uint8Array.from({ length: W * H }, () => Math.floor(rnd() * 200));
  const sub = Uint8Array.from({ length: 10 * 8 }, (_, i) => i % 200);
  const u8 = G.encodeGif(W, H, pal, [
    { ix: a, x: 0, y: 0, w: W, h: H, delay: 80, dispose: 1 },
    { ix: sub, x: 5, y: 7, w: 10, h: 8, delay: 15, dispose: 1 },
  ], false);
  const g = readGif(u8);
  assert.equal(g.head, 'GIF89a');
  assert.deepEqual([g.W, g.H, g.tableSize, g.loop], [W, H, 256, true]);
  assert.equal(g.frames.length, 2);
  assert.deepEqual(g.frames[0].ix, [...a]);
  assert.deepEqual([g.frames[1].x, g.frames[1].y, g.frames[1].w, g.frames[1].h], [5, 7, 10, 8]);
  assert.deepEqual(g.frames[1].ix, [...sub]);
  assert.equal(g.frames[0].gce.delay, 8);
  assert.equal(g.frames[1].gce.delay, 2); // меньше 20 мс браузеры показывают медленно — не меньше 2 сотых
});

test('GIF: с прозрачностью индекс 0 прозрачный, палитра маленькая — код короче', () => {
  const pal = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  const ix = Uint8Array.from([0, 1, 2, 3, 3, 2, 1, 0]);
  const g = readGif(G.encodeGif(4, 2, pal, [{ ix, x: 0, y: 0, w: 4, h: 2, delay: 100, dispose: 2 }], true));
  assert.equal(g.tableSize, 4);
  assert.deepEqual(g.frames[0].ix, [...ix]);
  assert.deepEqual([g.frames[0].gce.trans, g.frames[0].gce.dispose], [1, 2]);
});

test('палитра: медианное сечение не даёт больше цветов, чем просили, и находит основные', () => {
  const px = new Uint32Array(3000);
  for (let i = 0; i < px.length; i++) px[i] = i % 3 === 0 ? 0xff0000 : i % 3 === 1 ? 0x00ff00 : 0x0000ff;
  const pal = G.medianCut(px, 4);
  assert.ok(pal.length <= 4);
  for (const want of [[255, 0, 0], [0, 255, 0], [0, 0, 255]]) assert.ok(pal.some((p) => p.every((v, i) => Math.abs(v - want[i]) < 3)), JSON.stringify(want));
});
