// Казуал Хаб: большая анимация (GIF или анимированный WebP) для аватара и баннера — ужать в браузере до лимита.
// Кадры разбирает сам браузер (ImageDecoder), дальше: уменьшить, свести к общей палитре (медианное сечение по всем кадрам)
// и собрать GIF заново; у следующих кадров пишется только изменившийся прямоугольник. Не влезло — реже кадры, меньше
// цветов, меньше размер, пока не влезет (или null). Без ImageDecoder (старые Safari и Firefox) — тоже null: страница
// ставит первый кадр, как раньше. Подгружается только при выборе большой картинки (profile/app.js → CasualUtil.script).
// Тесты кодировщика — tests/gif.test.mjs.
(function (root) {
  'use strict';
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // ---------- палитра: медианное сечение ----------
  function range(b) {
    let rn = 255, rx = 0, gn = 255, gx = 0, bn = 255, bx = 0;
    for (let i = 0; i < b.length; i++) {
      const c = b[i], r = (c >> 16) & 255, g = (c >> 8) & 255, l = c & 255;
      if (r < rn) rn = r; if (r > rx) rx = r; if (g < gn) gn = g; if (g > gx) gx = g; if (l < bn) bn = l; if (l > bx) bx = l;
    }
    const dr = rx - rn, dg = gx - gn, db = bx - bn;
    return dr >= dg && dr >= db ? { size: dr, sh: 16 } : dg >= db ? { size: dg, sh: 8 } : { size: db, sh: 0 };
  }
  // px — цвета 0xRRGGBB (выборка со всех кадров), n — сколько цветов нужно. Делим коробку, где цвета разбросаны сильнее всего
  function medianCut(px, n) {
    let boxes = [px];
    while (boxes.length < n) {
      let bi = -1, best = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].length < 2) continue;
        const w = range(boxes[i]).size * Math.sqrt(boxes[i].length);
        if (w > best) { best = w; bi = i; }
      }
      if (bi < 0) break;
      const sh = range(boxes[bi]).sh;
      const sorted = Uint32Array.from(boxes[bi]).sort((x, y) => ((x >> sh) & 255) - ((y >> sh) & 255));
      const mid = sorted.length >> 1;
      boxes.splice(bi, 1, sorted.subarray(0, mid), sorted.subarray(mid));
    }
    return boxes.filter((b) => b.length).map((b) => {
      let r = 0, g = 0, l = 0;
      for (let i = 0; i < b.length; i++) { r += (b[i] >> 16) & 255; g += (b[i] >> 8) & 255; l += b[i] & 255; }
      return [Math.round(r / b.length), Math.round(g / b.length), Math.round(l / b.length)];
    });
  }
  // ближайший цвет палитры (глаз сильнее различает зелёный), с кэшем по 18 битам цвета — кадры похожи, кэш почти всегда попадает
  function mapper(pal) {
    const cache = new Map();
    return (r, g, b) => {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let i = cache.get(key);
      if (i !== undefined) return i;
      let best = Infinity;
      i = 0;
      for (let k = 0; k < pal.length; k++) {
        const p = pal[k], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < best) { best = d; i = k; }
      }
      cache.set(key, i);
      return i;
    };
  }

  // ---------- GIF ----------
  function writer() {
    let a = new Uint8Array(1 << 16), n = 0;
    const room = (k) => { if (n + k > a.length) { const b = new Uint8Array(Math.max(a.length * 2, n + k)); b.set(a.subarray(0, n)); a = b; } };
    return {
      b(v) { room(1); a[n++] = v; },
      w(v) { room(2); a[n++] = v & 255; a[n++] = (v >> 8) & 255; },
      s(str) { room(str.length); for (let i = 0; i < str.length; i++) a[n++] = str.charCodeAt(i); },
      all(xs) { room(xs.length); a.set(xs, n); n += xs.length; },
      done: () => a.slice(0, n),
    };
  }
  // LZW как в GIF: коды растут с 3 до 12 бит, на 4096-м — «очистка» словаря. Пишет в o: размер кода, подблоки по 255, 0
  function lzw(o, ix, minSize) {
    const clear = 1 << minSize, eoi = clear + 1;
    let size = minSize + 1, next = eoi + 1, cur = 0, bits = 0, dict = new Map();
    const buf = [];
    const put = (c) => { cur |= c << bits; bits += size; while (bits >= 8) { buf.push(cur & 255); cur >>>= 8; bits -= 8; } };
    put(clear);
    let pre = ix[0];
    for (let i = 1; i < ix.length; i++) {
      const k = ix[i], key = (pre << 8) | k, hit = dict.get(key);
      if (hit !== undefined) { pre = hit; continue; }
      put(pre);
      if (next === 4096) { put(clear); next = eoi + 1; size = minSize + 1; dict = new Map(); }
      else { if (next >= 1 << size) size++; dict.set(key, next++); }
      pre = k;
    }
    put(pre);
    if (next < 4096 && next >= 1 << size && size < 12) size++;
    put(eoi);
    if (bits > 0) buf.push(cur & 255);
    o.b(minSize);
    for (let i = 0; i < buf.length; i += 255) { const m = Math.min(255, buf.length - i); o.b(m); o.all(buf.slice(i, i + m)); }
    o.b(0);
  }
  // pal — [[r,g,b]…] (до 256, с прозрачным — до 255: тогда индекс 0 прозрачный, цвета с 1);
  // frames — [{ ix: индексы w×h, x, y, w, h, delay: мс, dispose: 1 — оставить, 2 — стереть до фона }]
  function encodeGif(W, H, pal, frames, trans) {
    const o = writer();
    const count = pal.length + (trans ? 1 : 0);
    let bitsN = 1;
    while ((1 << bitsN) < count) bitsN++;
    o.s('GIF89a'); o.w(W); o.w(H);
    o.b(0x80 | ((bitsN - 1) << 4) | (bitsN - 1)); o.b(0); o.b(0);
    const table = new Uint8Array((1 << bitsN) * 3);
    pal.forEach((p, i) => { const k = (i + (trans ? 1 : 0)) * 3; table[k] = p[0]; table[k + 1] = p[1]; table[k + 2] = p[2]; });
    o.all(table);
    o.all([0x21, 0xff, 0x0b]); o.s('NETSCAPE2.0'); o.all([3, 1, 0, 0, 0]); // повторять бесконечно
    const minSize = Math.max(2, bitsN);
    for (const f of frames) {
      o.all([0x21, 0xf9, 4, (f.dispose << 2) | (trans ? 1 : 0)]); o.w(Math.max(2, Math.round(f.delay / 10))); o.b(0); o.b(0);
      o.b(0x2c); o.w(f.x); o.w(f.y); o.w(f.w); o.w(f.h); o.b(0);
      lzw(o, f.ix, minSize);
    }
    o.b(0x3b);
    return o.done();
  }
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ---------- кадры из файла ----------
  // square — аватар: середина квадратом, сторона до size; иначе (баннер) — целиком, вписать в box
  async function decodeAll(file, opt) {
    const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
    try {
      await dec.tracks.ready;
      try { await dec.completed; } catch (e) {}
      const tr = dec.tracks.selectedTrack;
      const n = tr ? tr.frameCount : 0;
      if (!tr || !tr.animated || n < 2) return null;
      const every = Math.max(1, Math.ceil(n / (opt.frames || 100)));
      const frames = [];
      let w = 0, h = 0, crop = null;
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        try {
          const delay = image.duration ? image.duration / 1000 : 100; // в микросекундах
          if (!crop) {
            const iw = image.displayWidth, ih = image.displayHeight;
            if (opt.square) {
              const s = Math.min(iw, ih), k = Math.min(1, (opt.size || 200) / s);
              crop = [Math.round((iw - s) / 2), Math.round((ih - s) / 2), s, s];
              w = h = Math.max(16, Math.round(s * k));
            } else {
              const [bw, bh] = opt.box || [640, 256], k = Math.min(1, bw / iw, bh / ih);
              crop = [0, 0, iw, ih];
              w = Math.max(16, Math.round(iw * k)); h = Math.max(16, Math.round(ih * k));
            }
          }
          if (i % every === 0) frames.push({ bmp: await createImageBitmap(image, crop[0], crop[1], crop[2], crop[3], { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }), delay });
          else frames[frames.length - 1].delay += delay;
        } finally { image.close(); }
        if (i % 8 === 7) await tick();
      }
      return { w, h, frames };
    } finally { dec.close(); }
  }

  // один проход: размер scale, каждый keep-й кадр, colors цветов → байты GIF
  async function build(src, scale, keep, colors) {
    const W = Math.max(16, Math.round(src.w * scale)), H = Math.max(16, Math.round(src.h * scale));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const picked = [];
    src.frames.forEach((f, i) => { if (i % keep === 0) picked.push({ bmp: f.bmp, delay: f.delay }); else picked[picked.length - 1].delay += f.delay; });
    const datas = [];
    let trans = false;
    for (const f of picked) {
      cx.clearRect(0, 0, W, H);
      cx.drawImage(f.bmp, 0, 0, W, H);
      const d = cx.getImageData(0, 0, W, H).data;
      if (!trans) for (let i = 3; i < d.length; i += 4) if (d[i] < 128) { trans = true; break; }
      datas.push(d);
      await tick();
    }
    // палитра — по выборке до ~60 000 точек со всех кадров
    const total = W * H * datas.length, step = Math.max(1, Math.floor(total / 60000));
    const sample = [];
    let c = 0;
    for (const d of datas) for (let i = 0; i < d.length; i += 4) { if (c++ % step || d[i + 3] < 128) continue; sample.push((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); }
    const pal = medianCut(Uint32Array.from(sample.length ? sample : [0]), trans ? colors - 1 : colors);
    const map = mapper(pal), base = trans ? 1 : 0;
    const frames = [];
    let prev = null;
    for (let k = 0; k < datas.length; k++) {
      const d = datas[k], ix = new Uint8Array(W * H);
      for (let p = 0, i = 0; p < ix.length; p++, i += 4) ix[p] = d[i + 3] < 128 ? 0 : map(d[i], d[i + 1], d[i + 2]) + base;
      if (!trans && prev) {
        // только изменившийся прямоугольник: остальное остаётся от прошлого кадра
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
          const row = y * W;
          for (let x = 0; x < W; x++) if (ix[row + x] !== prev[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
        }
        if (x1 < 0) { frames[frames.length - 1].delay += picked[k].delay; continue; } // кадр не изменился
        const w = x1 - x0 + 1, h = y1 - y0 + 1, sub = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) sub.set(ix.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w);
        frames.push({ ix: sub, x: x0, y: y0, w, h, delay: picked[k].delay, dispose: 1 });
      } else frames.push({ ix, x: 0, y: 0, w: W, h: H, delay: picked[k].delay, dispose: trans ? 2 : 1 });
      prev = ix;
      await tick();
    }
    return { bytes: encodeGif(W, H, pal, frames, trans), w: W, h: H, n: frames.length };
  }

  // file — GIF или WebP; opt: { max — байт, square + size (аватар) или box: [w, h] (баннер), frames — не больше кадров }.
  // Ответ: { data: data URL GIF, w, h, n } или null (не анимация, браузер не умеет, не влезло)
  async function shrink(file, opt = {}) {
    if (typeof ImageDecoder === 'undefined' || !file) return null;
    try { if (ImageDecoder.isTypeSupported && !(await ImageDecoder.isTypeSupported(file.type))) return null; } catch (e) { return null; }
    let src = null;
    try {
      src = await decodeAll(file, opt);
      if (!src) return null;
      const max = opt.max || 1048576;
      let scale = 1, keep = 1, colors = 256;
      for (let t = 0; t < 8; t++) {
        const out = await build(src, scale, keep, colors);
        if (out.bytes.length <= max) return { data: 'data:image/gif;base64,' + b64(out.bytes), w: out.w, h: out.h, n: out.n };
        const r = out.bytes.length / max;
        if (r > 2 && keep < 3) keep++; // сначала реже кадры — меньше всего портит картинку
        else if (colors > 128 && r < 1.6) colors = 128;
        else scale *= Math.max(0.55, Math.min(0.9, Math.sqrt(1 / r) * 0.95));
        if (Math.round(src.w * scale) < 48 || Math.round(src.h * scale) < 24) break;
      }
      return null;
    } catch (e) {
      return null;
    } finally {
      if (src) src.frames.forEach((f) => { try { f.bmp.close(); } catch (e) {} });
    }
  }

  root.CasualGif = Object.freeze({ shrink, encodeGif, medianCut });
})(typeof window !== 'undefined' ? window : globalThis);
