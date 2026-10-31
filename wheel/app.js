(() => {
  const TAU = Math.PI * 2;
  const KEY = 'koleso-vybyvanie-v1';
  const PREFS_KEY = 'ocenshik.prefs.v1'; // общий с «Оценщиком всего»: тема одна на весь сайт
  const $ = (s) => document.querySelector(s);
  const canvas = $('#wheel');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drawRot = null; // пока колесо крутит видеокарта, рисуем его в стартовом положении
  const FONT = 'Onest, ui-sans-serif, system-ui, sans-serif';
  const SAMPLE = [['Hollow Knight', 1500], ['Hades', 1200], ['Disco Elysium', 800], ['Outer Wilds', 500], ['Celeste', 300], ['Inscryption', 250]];

  const CUR = {
    UAH: { sym: '₴', in: 'гривнах' },
    USD: { sym: '$', in: 'долларах' },
    EUR: { sym: '€', in: 'евро' },
    ILS: { sym: '₪', in: 'шекелях' },
    RUB: { sym: '₽', in: 'рублях' },
  };
  const CODES = Object.keys(CUR);
  // сколько единиц валюты дают за 1 доллар (примерно, правится на странице)
  const DEF_RATES = { UAH: 41.5, USD: 1, EUR: 0.86, ILS: 3.3, RUB: 80 };
  const DUR_MIN = 1, DUR_MAX = 30; // секунды прокрута
  const HUBS = [[24, 'Малый'], [34, 'Средний'], [44, 'Большой']];
  // те же темы, что на главной Казуал Хаба
  const THEMES = window.CasualThemes.list; // общий список тем: /themes.js
  const THEME_IDS = THEMES.map((x) => x.id);

  // сектора: цвета аватаров «Оценщика» плюс лайм и графит; подпись тёмная или белая, смотря что контрастнее
  const PALETTE = ['#3550E8', '#EAA92C', '#2EAD60', '#EC4899', '#9333EA', '#F97316', '#06B6D4', '#E4553F', '#84CC16', '#64748B'];
  const INK_ON = '#14161C';
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const SEG_COLORS = PALETTE.map((c) => {
    const L = lum(c);
    return { c, t: (L + 0.05) / (lum(INK_ON) + 0.05) >= 1.05 / (L + 0.05) ? INK_ON : '#FFFFFF' };
  });
  const colorOf = (i) => SEG_COLORS[(Math.max(1, i.id) - 1) % SEG_COLORS.length];

  const HINT_SIMPLE = 'Все сектора равны. Выпавший сектор выбывает, последний оставшийся побеждает.';
  const HINT_DON = 'Шанс победить равен доле доната в банке. Сектор вылета у каждого равен сумме донатов остальных, поэтому крупный донат вылетает реже, а пропорция держится на каждом шаге. Донаты в разных валютах пересчитываются в валюту банка, повтор имени добавляет сумму к уже вписанной.<br><code>вылет = (банк − донат) ÷ ((N − 1) × банк)</code>';

  const svg = (inner, size, sw) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  const ICON = {
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 16, 2),
    xs: svg('<path d="M6 6l12 12M18 6L6 18"/>', 11, 3),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 20, 2),
    play: svg('<path d="M8 5l11 7-11 7z"/>', 16, 2),
    pause: svg('<path d="M8 5v14M16 5v14"/>', 16, 2.6),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>', 16, 2),
  };

  // вылет и щелчки всегда стандартные; выбирать можно фон страницы и трек победы
  const MUSIC_SLOTS = [
    ['bg', '🎶 Фон', 'играет по кругу, пока ты на странице'],
    ['win', '🏆 Победа', 'играет, когда есть победитель'],
  ];
  // треки на выбор: ровно те ссылки, что дал хозяин колеса; играют через встроенные плееры YouTube и Spotify
  const PRESETS = [
    // start — секунда, где начинается звук: тишина в начале ролика пропускается (замерено по громкости дорожки)
    { id: 'vika', title: 'VI KA — Гимн Папича (Arthas)', src: 'yt', key: 'SXe1aTEJU2w', start: 0.6 },
    { id: 'mk', title: 'Mortal Kombat — Techno Syndrome', src: 'yt', key: 'kWO2AuJT67w', start: 0.4 },
    { id: 'serious', title: 'Serious Sam — The Grand Cathedral', src: 'yt', key: '0IVRoqDWwIk', start: 5.5 },
    { id: 'chopin', title: 'Шопен — Вальс до-диез минор, оп. 64 № 2', src: 'yt', key: 'SUT_0c2QVzo', start: 5 },
    { id: 'eva', title: 'Evangelion — E05 (ReMaster TV Original)', src: 'yt', key: '7dVDG6IqtV8', alt: ['ELcLRK8LZ-o'], start: 0 },
  ];
  const DEFAULT_WIN = 'vika'; // победа по умолчанию
  const presetOf = (v) => (typeof v === 'string' && v.startsWith('preset:') ? PRESETS.find((p) => p.id === v.slice(7)) || null : null);
  const EMPTY_HTML = `<li class="empty">
    <div class="ghost-rows" aria-hidden="true"><span>1</span><b class="w1"></b><i></i><span>2</span><b class="w2"></b><i></i><span>3</span><b class="w3"></b><i></i></div>
    <p><strong>Колесо пустое.</strong> Впиши первого участника выше или вставь сразу целый список.</p>
  </li>`;

  let S = null, T = {}, dpr = 1, size = 0, autoTimer = 0, clearTimer = 0, ac = null, lastTick = 0;
  const fitCache = new Map();

  // ---------- helpers ----------
  const fmt = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('ru-RU');
  const pct = (x) => {
    const v = x * 100;
    return (v > 0 && v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v))) + '%';
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mod = (a, m) => ((a % m) + m) % m;
  const num = (s) => parseFloat(String(s).replace(/[\s ]/g, '').replace(',', '.'));
  const nearest = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const rnd = () => {
    try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; }
    catch (e) { return Math.random(); }
  };

  // ---------- state ----------
  function fresh() {
    return {
      v: 2, mode: 'donate', cur: 'UAH', rates: { ...DEF_RATES }, items: [], seq: 0, outSeq: 0, rot: 0,
      duration: 8, pick: 'out', auto: false, sound: true, sample: false, hub: 24, gif: '', section: 'wheel',
      music: { bg: '', win: 'preset:vika' }, bgOn: true, vol: 80,
    };
  }
  function makeItem(name, amount, cur) {
    const id = ++S.seq;
    return { id, name, amount: +amount || 0, cur: CUR[cur] ? cur : S.cur, out: false, outOrder: 0, startWin: null };
  }
  const alive = () => S.items.filter((i) => !i.out);
  const rate = (c) => (S.rates && S.rates[c] > 0 ? S.rates[c] : DEF_RATES[c]);
  const conv = (amount, from, to) => ((+amount || 0) / rate(from)) * rate(to);
  const sym = (c) => (CUR[c] || CUR[S.cur]).sym;
  const convText = (i) => (i.cur !== S.cur ? `≈ ${fmt(conv(i.amount, i.cur, S.cur))} ${sym(S.cur)}` : '');
  // вес в донатном режиме = сумма, пересчитанная в валюту банка
  const weight = (i) => (S.mode === 'donate' ? Math.max(0, conv(i.amount, i.cur, S.cur)) : 1);
  const bankSum = () => alive().reduce((s, i) => s + weight(i), 0);

  function curFrom(tok) {
    if (!tok) return null;
    const t = tok.toLowerCase();
    if (t === '₴' || t === 'uah' || t.startsWith('гр')) return 'UAH';
    if (t === '$' || t === 'usd' || t.startsWith('дол')) return 'USD';
    if (t === '€' || t === 'eur' || t === 'евро') return 'EUR';
    if (t === '₪' || t === 'ils' || t.startsWith('шек')) return 'ILS';
    if (t === '₽' || t === 'rub' || t.startsWith('р')) return 'RUB';
    return null;
  }

  // Шанс победы i = w_i / W. Чтобы это держалось после каждого вылета,
  // вероятность вылета на этом спине q_i = (W − w_i) / ((N − 1) · W).
  function chances() {
    const a = alive(), n = a.length, res = new Map();
    if (!n) return res;
    if (n === 1) { res.set(a[0].id, { win: 1, drop: 0 }); return res; }
    const W = a.reduce((s, i) => s + weight(i), 0);
    const eq = W <= 0;
    const Wt = eq ? n : W;
    a.forEach((i) => {
      const w = eq ? 1 : weight(i);
      res.set(i.id, { win: w / Wt, drop: (Wt - w) / ((n - 1) * Wt) });
    });
    return res;
  }

  function segments() {
    const a = alive(), ch = chances(), out = [];
    let acc = 0;
    a.forEach((i) => {
      const p = a.length === 1 ? 1 : ch.get(i.id).drop;
      if (p <= 0) return;
      out.push({ item: i, p, start: acc * TAU, end: (acc + p) * TAU });
      acc += p;
    });
    return out;
  }

  function segAt(rot, segs) {
    const a = mod(-Math.PI / 2 - rot, TAU);
    return segs.find((s) => a >= s.start && a < s.end) || segs[segs.length - 1];
  }

  let shownLastOut; // последний вылетевший, который уже показан в списке
  const freshRows = new Set(); // id строк, которые только что появились: въезжают один раз
  function addItem(name, amount, cur) {
    name = String(name).trim().slice(0, 60);
    if (!name) return 'empty';
    if (S.sample) { S.items = []; S.outSeq = 0; S.sample = false; }
    const ex = alive().find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (ex) {
      if (S.mode === 'donate') {
        // докидка в другой валюте пересчитывается в валюту участника
        ex.amount = Math.round(((+ex.amount || 0) + conv(amount, cur || ex.cur, ex.cur)) * 100) / 100;
        return 'merged';
      }
      return 'dup';
    }
    const it = makeItem(name, amount, cur);
    S.items.push(it);
    freshRows.add(it.id); // строка въедет в список при следующей отрисовке
    return 'added';
  }

  function save() {
    try { const { spinning, ...rest } = S; localStorage.setItem(KEY, JSON.stringify(rest)); } catch (e) {}
    lotsLiveSoon();
  }

  // ---------- theme, shared with the rater ----------
  function readThemePref() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (p && THEME_IDS.includes(p.theme)) return p.theme;
    } catch (e) {}
    return 'auto';
  }
  function writeThemePref(t) {
    try {
      let p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
      p.theme = t;
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  let theme = 'auto';
  function applyTheme(t, fromUser) {
    theme = THEME_IDS.includes(t) ? t : 'auto';
    // «Авто» при загрузке не трогает атрибут, чтобы не перебить тему, выбранную снаружи
    if (theme === 'auto') { if (fromUser) document.documentElement.removeAttribute('data-theme'); }
    else document.documentElement.setAttribute('data-theme', theme);
    const th = THEMES.find((x) => x.id === theme);
    $('#themeBtn').innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M8 1.6a6.4 6.4 0 0 0 0 12.8z" fill="currentColor"/></svg><span>Тема: ${th.name}</span>`;
    $('#themeBtn').setAttribute('aria-label', `Тема: ${th.name}`);
    $('#themeMenu').classList.add('tm-grid');
    $('#themeMenu').innerHTML = window.CasualThemes.menuHTML(theme);
    if (fromUser) writeThemePref(theme);
  }

  // ---------- drawing ----------
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    T = { panel: g('--panel'), panel2: g('--panel-2'), ink: g('--ink'), ink3: g('--ink-3'), accent: g('--accent') };
  }

  function resize() {
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    size = Math.round(canvas.clientWidth * dpr); // clientWidth не меняется, когда колесо повёрнуто
    if (!size) return;
    canvas.width = size;
    canvas.height = size;
    fitCache.clear();
    draw();
  }

  function fit(text, maxW, font) {
    const k = font + '|' + maxW + '|' + text;
    if (fitCache.has(k)) return fitCache.get(k);
    let s = text;
    if (ctx.measureText(s).width > maxW) {
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      s += '…';
    }
    fitCache.set(k, s);
    return s;
  }

  // Перерисовка колеса. Без своих сегментов (обычная перерисовка после изменений) колесо не прыгает,
  // а плавно перетекает: выбывший или удалённый участник сужается до нуля, новый вырастает из нуля.
  // кадр анимации, который не замирает в фоне: на виду — обычный кадр экрана, во свёрнутой вкладке (Alt+Tab) — таймер.
  // Прокрутка считается по часам, поэтому в фоне колесо докручивается и останавливается вовремя, вылет и победа тоже срабатывают
  function bgFrame(fn) {
    const h = { done: false, id: 0, to: 0 };
    const go = () => { if (h.done) return; h.done = true; cancelAnimationFrame(h.id); clearTimeout(h.to); fn(performance.now()); };
    h.id = requestAnimationFrame(go);
    h.to = setTimeout(go, document.hidden ? 0 : 120);
    return h;
  }
  function bgCancel(h) { if (h && h.done === false) { h.done = true; cancelAnimationFrame(h.id); clearTimeout(h.to); } }
  let shownSegs = null, tweenRaf = 0;
  function draw(segs, hl) {
    if (segs || hl || S.spinning || reduced || !shownSegs || !size) {
      if (tweenRaf) { bgCancel(tweenRaf); tweenRaf = 0; }
      const out = segs || segments();
      paint(out, hl);
      shownSegs = out;
      return;
    }
    const next = segments();
    const same = next.length === shownSegs.length && next.every((x, k) => x.item.id === shownSegs[k].item.id && Math.abs((x.end - x.start) - (shownSegs[k].end - shownSegs[k].start)) < 1e-4);
    if (same) { if (!tweenRaf) paint(next); shownSegs = tweenRaf ? shownSegs : next; return; }
    tweenTo(next);
  }
  function tweenTo(next) {
    const prev = shownSegs;
    const ids = new Set(next.map((x) => x.item.id));
    // порядок как у нового колеса, а ушедшие стоят на прежнем месте и сужаются там
    const order = next.map((x) => x.item);
    prev.forEach((x, k) => {
      if (ids.has(x.item.id)) return;
      const before = prev.slice(0, k).reverse().find((p) => ids.has(p.item.id));
      order.splice(before ? order.findIndex((it) => it.id === before.item.id) + 1 : 0, 0, x.item);
    });
    const w0 = new Map(prev.map((x) => [x.item.id, x.end - x.start]));
    const w1 = new Map(next.map((x) => [x.item.id, x.end - x.start]));
    const t0 = performance.now(), D = 400;
    if (tweenRaf) bgCancel(tweenRaf);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / D);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      let acc = 0;
      const cur = [];
      for (const it of order) {
        const a = w0.get(it.id) || 0, b = w1.get(it.id) || 0;
        const w = a + (b - a) * k;
        if (w > 1e-4) cur.push({ item: it, p: w / TAU, start: acc, end: acc + w });
        acc += w;
      }
      paint(cur);
      shownSegs = cur;
      if (t < 1) tweenRaf = bgFrame(frame);
      else { tweenRaf = 0; shownSegs = next; paint(next); }
    };
    tweenRaf = bgFrame(frame);
  }

  function paint(segs, hl) {
    if (!size) return;
    const rot = drawRot == null ? S.rot : drawRot;
    const c = size / 2;
    const ring = Math.max(8, size * 0.03);
    const R = c - ring - 2 * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(c, c);

    if (!segs.length) {
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = T.panel2; ctx.fill();
    }

    for (const s of segs) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, rot + s.start, rot + s.end);
      ctx.closePath();
      ctx.fillStyle = colorOf(s.item).c;
      ctx.fill();
      if (hl && hl.id === s.item.id) { ctx.fillStyle = `rgba(255,255,255,${hl.a})`; ctx.fill(); }
    }

    if (segs.length > 1) {
      ctx.lineWidth = Math.max(1.5, 2 * dpr);
      ctx.strokeStyle = T.panel;
      for (const s of segs) {
        const a = rot + s.start;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
      }
    }

    // подписи вдоль радиуса, от обода к центру
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const inner = (S.hub / 100) * c + 6 * dpr, pad = 12 * dpr, maxW = Math.round(R - inner - pad);
    for (const s of segs) {
      const ang = s.end - s.start;
      const fs = Math.round(Math.min(R * 0.072, R * 0.68 * Math.min(ang, 1.2) * 0.55));
      if (fs < 9 * dpr) continue;
      const font = `600 ${fs}px ${FONT}`;
      ctx.save();
      ctx.rotate(rot + (s.start + s.end) / 2);
      ctx.font = font;
      ctx.fillStyle = colorOf(s.item).t;
      ctx.fillText(fit(s.item.name, maxW, font), R - pad, 0);
      ctx.restore();
    }

    // обод: тёмное кольцо с ячейками, как шкала у «Оценщика»
    ctx.beginPath(); ctx.arc(0, 0, R + ring / 2, 0, TAU);
    ctx.lineWidth = ring; ctx.strokeStyle = T.ink; ctx.stroke();
    const nb = 36, cs = ring * 0.36;
    ctx.fillStyle = T.panel;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU;
      ctx.save();
      ctx.translate(Math.cos(a) * (R + ring / 2), Math.sin(a) * (R + ring / 2));
      ctx.rotate(a);
      ctx.globalAlpha = k % 2 ? 0.4 : 0.9;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-cs / 2, -cs / 2, cs, cs, cs * 0.3);
      else ctx.rect(-cs / 2, -cs / 2, cs, cs);
      ctx.fill();
      ctx.restore();
    }

    if (!segs.length) {
      ctx.fillStyle = T.ink3; ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(R * 0.07)}px ${FONT}`;
      ctx.fillText('Колесо пустое', 0, R * 0.55);
    }
  }

  // ---------- sound ----------
  function ensureAudio() {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  // общая громкость 0…1 из ползунка «Громкость»
  const volume = () => Math.max(0, Math.min(100, S.vol == null ? 80 : +S.vol)) / 100;
  function tone(freq, t, len, vol, type) {
    vol = Math.max(0.0002, vol * volume());
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + len + 0.02);
  }
  function kick() {
    if (reduced) return;
    const p = $('#pointer');
    if (p.animate) p.animate([{ transform: 'translateX(-50%) rotate(-16deg)' }, { transform: 'translateX(-50%) rotate(0deg)' }], { duration: 140, easing: 'ease-out' });
  }
  function tick() {
    kick();
    if (!S.sound || !ac) return;
    const t = ac.currentTime;
    if (t - lastTick < 0.035) return;
    lastTick = t;
    tone(1500, t, 0.03, 0.05, 'square');
  }
  function playOut() {
    if (!S.sound || !ac) return;
    const t = ac.currentTime;
    tone(330, t, 0.18, 0.12); tone(220, t + 0.12, 0.3, 0.12);
  }
  // стандартная победа: фанфара по нотам и долгий аккорд, заметно громче щелчков
  function playWin() {
    if (!S.sound || !ac) return;
    const t = ac.currentTime + 0.02;
    [523, 659, 784, 1047, 784, 1047].forEach((f, k) => {
      tone(f, t + k * 0.13, 0.34, 0.22);
      tone(f / 2, t + k * 0.13, 0.3, 0.08, 'square');
    });
    const end = t + 6 * 0.13;
    [523, 659, 784, 1047].forEach((f) => tone(f, end, 1.4, 0.16));
    tone(262, end, 1.4, 0.1, 'square');
  }

  // ---------- spin ----------
  function lock(on) {
    $('#deskSet').disabled = on;
    $('#spin').disabled = on || alive().length < 2;
    $('#spin').classList.toggle('spinning', on);
    $('#stage').classList.toggle('is-spinning', on);
    $('#restart').disabled = on || !S.items.some((i) => i.out);
  }

  function spin() {
    if (S.spinning) return;
    const a = alive();
    if (a.length < 2) { idleStatus(); return; }
    if (S.pick === 'one' || a.length === 2) cueWin(); // этот спин может дать победителя
    // новый спин: песня прошлой победы замолкает
    if (CH.win.active) { stopChannel('win'); resumeBg(); }
    if (a.length === S.items.length || S.pick === 'one') {
      const ch = chances();
      a.forEach((i) => { i.startWin = ch.get(i.id).win; });
    }
    if (S.sound) ensureAudio();

    const segs = segments();
    const r = rnd();
    let acc = 0, pick = segs[segs.length - 1];
    for (const s of segs) { acc += s.p; if (r < acc) { pick = s; break; } }
    const target = pick.start + (0.06 + rnd() * 0.88) * (pick.end - pick.start);

    const dur = reduced ? 1200 : S.duration * 1000;
    const turns = reduced ? 1 : Math.max(2, Math.round(S.duration * 0.8));
    const from = S.rot;
    const base = -Math.PI / 2 - target;
    const to = base + TAU * Math.ceil((from + TAU * turns - base) / TAU);

    S.spinning = true;
    lock(true);
    setStatus('Крутится…', baseSub());
    lotsSpin(from, to, dur);
    const t0 = performance.now();
    let last = segAt(from, segs), nameAt = t0;
    $('#ticker').textContent = last.item.name;

    // колесо рисуется один раз, а крутит его видеокарта: canvas поворачивается целиком, без перерисовки в каждом кадре
    drawRot = from;
    draw(segs);
    canvas.style.willChange = 'transform';
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      S.rot = from + (to - from) * e;
      const cur = segAt(S.rot, segs);
      if (cur !== last) { last = cur; tick(); }
      // на большой скорости имена мелькали бы и резали глаза: новое не чаще раза в 0,3 секунды, а к концу прокрутки — каждое
      if (now - nameAt >= 300 && $('#ticker').textContent !== last.item.name) { nameAt = now; $('#ticker').textContent = last.item.name; }
      canvas.style.transform = `rotate(${S.rot - from}rad)`;
      if (t < 1) bgFrame(frame);
      else {
        $('#ticker').textContent = last.item.name;
        drawRot = null;
        canvas.style.transform = '';
        canvas.style.willChange = '';
        draw(segs);
        land(pick, segs);
      }
    };
    bgFrame(frame);
  }

  function land(pick, segs) {
    if (S.pick === 'one') return landOne(pick, segs);
    setStatus(`Вылетает: <b>${esc(pick.item.name)}</b>`, baseSub(), 'bad');
    livePick = pick.item.name;
    lotsLiveNow();
    // на последнем вылете звучит победная, её запускает showWinner
    if (alive().length > 2) playOut();
    // лот уходит за секунду: 0,6 с мигает под стрелкой, 0,4 с его сектор сужается до нуля
    const t0 = performance.now(), D = reduced ? 400 : 600;
    const pulse = (now) => {
      const t = (now - t0) / D;
      if (t < 1) {
        draw(segs, { id: pick.item.id, a: 0.5 * Math.abs(Math.sin(t * Math.PI * 3)) });
        bgFrame(pulse);
        return;
      }
      pick.item.out = true;
      pick.item.outOrder = ++S.outSeq;
      S.rot = mod(S.rot, TAU);
      S.spinning = false;
      lock(false);
      save();
      render(true);
      const left = alive();
      if (left.length === 1) {
        setStatus(`Победитель: <b>${esc(left[0].name)}</b>`, winSub(left[0]), 'good');
        showWinner(left[0]);
      } else {
        setStatus(`<b>${esc(pick.item.name)}</b> выбывает`, baseSub(), 'bad');
        if (S.auto) autoTimer = setTimeout(spin, reduced ? 600 : 1100);
      }
    };
    bgFrame(pulse);
  }

  // обычный режим: на кого показала стрелка, тот и победил, никто не выбывает
  function landOne(pick, segs) {
    setStatus(`Выпал: <b>${esc(pick.item.name)}</b>`, baseSub(), 'good');
    livePick = pick.item.name;
    lotsLiveNow();
    const t0 = performance.now(), D = reduced ? 400 : 900;
    const pulse = (now) => {
      const t = (now - t0) / D;
      if (t < 1) {
        draw(segs, { id: pick.item.id, a: 0.5 * Math.abs(Math.sin(t * Math.PI * 3)) });
        bgFrame(pulse);
        return;
      }
      S.rot = mod(S.rot, TAU);
      S.spinning = false;
      lock(false);
      save();
      render(true);
      setStatus(`Победитель: <b>${esc(pick.item.name)}</b>`, winSub(pick.item), 'good');
      showWinner(pick.item);
    };
    bgFrame(pulse);
  }

  // ---------- UI ----------
  function setStatus(main, sub, tier) {
    $('#statusMain').innerHTML = main;
    $('#statusSub').textContent = sub || '';
    const b = $('#aliveBadge');
    b.dataset.tier = tier || 'idle';
    b.textContent = alive().length;
  }
  function baseSub() {
    const n = alive().length, total = S.items.length;
    const bank = S.mode === 'donate' && n ? ` · банк ${fmt(bankSum())} ${sym(S.cur)}` : '';
    return (n < total ? `осталось из ${total}` : 'участников на колесе') + bank;
  }
  function winSub(w) {
    if (S.pick === 'one') return S.mode === 'donate' && w.startWin != null ? `шанс был ${pct(w.startWin)}` : `выпал из ${S.items.length}`;
    return S.mode === 'donate' && w.startWin != null ? `шанс на старте был ${pct(w.startWin)}` : `последний из ${S.items.length}`;
  }
  function idleStatus() {
    const a = alive(), n = a.length;
    if (n >= 2) setStatus('Жми «Крутить»', baseSub());
    else if (n === 1 && S.items.some((i) => i.out) && S.pick !== 'one') setStatus(`Победитель: <b>${esc(a[0].name)}</b>`, winSub(a[0]), 'good');
    else if (n === 1) setStatus('Нужен ещё хотя бы один', 'добавь участника в список');
    else setStatus('Колесо пустое', 'добавь участников в список');
  }
  function msg(text, kind) {
    const el = $('#formMsg');
    el.textContent = text || '';
    el.className = 'field-msg' + (kind ? ' ' + kind : '');
  }
  function updateTicker() {
    const segs = segments();
    $('#ticker').textContent = segs.length ? segAt(S.rot, segs).item.name : '—';
  }
  function updateMeta() {
    const n = alive().length;
    $('#boardStat').innerHTML = `<b>${n}</b> на колесе` + (S.mode === 'donate' ? ` · банк <b>${fmt(bankSum())} ${sym(S.cur)}</b>` : '');
    $('#mnavCount').textContent = n;
    $('#aliveBadge').textContent = n;
  }
  function refreshNumbers() {
    const ch = chances();
    document.querySelectorAll('#list .prow').forEach((row) => {
      const c = ch.get(+row.dataset.id);
      if (!c) return;
      const pc = row.querySelector('.pc');
      pc.querySelector('b').textContent = pct(c.win);
      pc.querySelector('i').textContent = pct(c.drop);
      pc.title = `Шанс победы ${pct(c.win)} · шанс вылететь на этом спине ${pct(c.drop)}`;
      const it = S.items.find((x) => x.id === +row.dataset.id);
      const cv = row.querySelector('.e-sub');
      if (cv && it) cv.textContent = convText(it);
    });
    updateMeta();
    draw();
    updateTicker();
    if (!S.spinning) idleStatus();
  }

  function renderCur() {
    $('#curTabs').innerHTML = CODES.map((c) =>
      `<button type="button" data-cur="${c}" aria-pressed="${c === S.cur}" title="Банк в ${CUR[c].in}">${CUR[c].sym}</button>`
    ).join('');
    $('#rateGrid').innerHTML = CODES.filter((c) => c !== S.cur).map((c) => {
      const v = rate(S.cur) / rate(c);
      return `<label class="rate" for="rate-${c}">1 ${CUR[c].sym} =<input class="inp" id="rate-${c}" data-cur="${c}" inputmode="decimal" value="${+v.toPrecision(4)}">${sym(S.cur)}</label>`;
    }).join('');
  }
  function renderSegs() {
    $('#durRange').value = S.duration;
    $('#durVal').textContent = S.duration + ' с';
    $('#hubSeg').innerHTML = HUBS.map(([v, l]) => `<button type="button" data-hub="${v}" aria-pressed="${v === S.hub}">${l}</button>`).join('');
  }
  function markSeg(sel, attr, val) {
    document.querySelectorAll(`${sel} [${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(+b.getAttribute(attr) === val)));
  }
  function applySection() {
    $('#layout').dataset.section = S.section;
    document.querySelectorAll('#mnav [data-section]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.section === S.section)));
  }

  function render(keep) {
    const don = S.mode === 'donate';
    document.querySelectorAll('.view-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
    $('#amountWrap').hidden = !don;
    $('#curTabs').hidden = !don;
    $('#ratesBox').hidden = !don;
    renderCur();
    $('#modeHint').innerHTML = don ? HINT_DON : HINT_SIMPLE;
    $('#bulk').placeholder = don ? 'Hollow Knight 1500\nHades — 20 $\nCeleste, 300 грн' : 'Hollow Knight\nHades\nCeleste';
    $('#bulkHint').textContent = don
      ? 'Строка: имя, сумма и валюта, например «Hades $20» или «Celeste 1 500 грн». Без валюты берётся выбранная в форме.'
      : 'Одно имя на строку.';
    $('#sampleNote').hidden = !S.sample;
    // «Экспорт» в шапке колеса: пока есть победитель — и после закрытия его карточки, и после перезагрузки страницы
    $('#exportRes').hidden = !winnerNow();

    const a = alive(), ch = chances();
    // в донатном режиме топ по сумме (в валюте банка), сверху самый крупный
    const rows = don ? a.slice().sort((x, y) => weight(y) - weight(x) || x.id - y.id) : a;
    const list = $('#list');
    list.classList.toggle('simple', !don);
    list.innerHTML = rows.length
      ? rows.map((i, idx) => {
          const c = ch.get(i.id), col = colorOf(i);
          return `<li class="prow${freshRows.has(i.id) ? ' row-in' : ''}" data-id="${i.id}">
            ${don ? `<span class="rank">${idx + 1}</span>` : ''}
            <div class="pnm"><i class="sw" style="--c:${col.c}"></i><div class="e-text"><span class="e-name">${esc(i.name)}</span>${don ? `<span class="e-sub">${convText(i)}</span>` : ''}</div></div>
            ${don ? `<label class="amt" for="amt-${i.id}"><input class="inp" id="amt-${i.id}" data-act="amt" inputmode="decimal" value="${i.amount}" aria-label="Донат: ${esc(i.name)}, ${i.cur}"><span>${sym(i.cur)}</span></label>` : ''}
            <span class="pc" title="Шанс победы ${pct(c.win)} · шанс вылететь на этом спине ${pct(c.drop)}"><b>${pct(c.win)}</b><i>${pct(c.drop)}</i></span>
            <button type="button" class="mini-btn del" data-act="del" aria-label="Убрать ${esc(i.name)}">${ICON.x}</button>
          </li>`;
        }).join('')
      : EMPTY_HTML;

    const outs = S.items.filter((i) => i.out).sort((x, y) => x.outOrder - y.outOrder);
    $('#outBox').hidden = !outs.length;
    // последний вылетевший въезжает в список вылетевших
    const lastOut = outs.length ? outs[outs.length - 1].id : null;
    if (lastOut !== shownLastOut) { if (shownLastOut !== undefined && lastOut != null) freshRows.add('o' + lastOut); shownLastOut = lastOut; }
    $('#outList').innerHTML = outs.map((i, k) => `<li class="orow${freshRows.has('o' + i.id) ? ' row-in' : ''}">
        <span class="onum">${k + 1}</span>
        <span class="oname">${esc(i.name)}</span>
        ${don ? `<span class="oamt">${fmt(i.amount)} ${sym(i.cur)}</span>` : '<span></span>'}
        <button type="button" class="link-btn" data-act="back" data-id="${i.id}">вернуть</button>
      </li>`).join('');
    freshRows.clear();

    $('#auto').checked = S.auto;
    $('#autoOpt').hidden = S.pick === 'one';
    document.querySelectorAll('#pickSeg [data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === S.pick)));
    $('#pickHint').textContent = S.pick === 'one'
      ? 'Одна прокрутка — один победитель, участники остаются на колесе.'
      : 'Каждая прокрутка выбивает одного, побеждает последний.';
    $('#snd').checked = S.sound;

    updateMeta();
    draw();
    updateTicker();
    $('#spin').disabled = S.spinning || a.length < 2;
    $('#restart').disabled = S.spinning || !outs.length;
    if (!keep) idleStatus();
  }

  // заставка победы: стикер, имя по буквам, сумма, конфетти; клик или клавиша — сразу к карточке
  let fxDone = null;
  function winFx(it) {
    const fx = $('#winFx');
    if (reduced) return Promise.resolve();
    return new Promise((resolve) => {
      const timers = [];
      const at = (ms, f) => timers.push(setTimeout(f, ms));
      let raf = 0;
      const stage = fx.querySelector('.fx-stage');
      const stick = fx.querySelector('.fx-sticker');
      const brow = fx.querySelector('.fx-eyebrow');
      const name = fx.querySelector('.fx-name');
      const sum = fx.querySelector('.fx-sum');
      stage.querySelectorAll('.in').forEach((n) => n.classList.remove('in'));
      // случайный стикер из базовых картинок сайта
      const pool = BASE_HUBS.length ? BASE_HUBS : [];
      const st = pool[Math.floor(Math.random() * pool.length)];
      stick.innerHTML = st ? (st.video
        ? `<video src="${st.src}" autoplay muted loop playsinline></video>`
        : `<img src="${st.src}" alt="">`) : '';
      stick.hidden = !st;
      // имя: каждая буква прилетает со своей стороны, слова не рвутся
      const chars = Array.from(it.name);
      name.style.setProperty('--len', String(Math.min(chars.length, 24)));
      let k = 0;
      name.innerHTML = it.name.split(/(\s+)/).map((w) => /^\s+$/.test(w) ? w : `<span class="fx-word${Array.from(w).length > 12 ? ' long' : ''}">${Array.from(w).map((c) => {
        const a = Math.random() * TAU, dist = 160 + Math.random() * 220;
        return `<span class="fx-ch" style="--dx:${Math.round(Math.cos(a) * dist)}px;--dy:${Math.round(Math.sin(a) * dist)}px;--r:${Math.round((Math.random() - .5) * 400)}deg;--d:${(k++ * Math.min(70, 900 / chars.length)).toFixed(0)}ms">${esc(c)}</span>`;
      }).join('')}</span>`).join('');
      const money = S.mode === 'donate' && +it.amount > 0;
      sum.hidden = !money;
      sum.textContent = money ? `${fmt(0)} ${sym(it.cur)}` : '';
      // заставка раскрывается кругом из центра колеса
      const wr = $('.wheel-wrap').getBoundingClientRect();
      fx.style.setProperty('--fx-x', `${Math.round(wr.left + wr.width / 2)}px`);
      fx.style.setProperty('--fx-y', `${Math.round(wr.top + wr.height / 2)}px`);
      fx.classList.remove('closing');
      fx.hidden = false;
      fx.classList.add('open');
      fx.querySelector('.fx-skip').focus({ preventScroll: true });
      const step = Math.min(110, 1400 / chars.length);
      name.querySelectorAll('.fx-ch').forEach((c, j) => c.style.setProperty('--d', (j * step).toFixed(0) + 'ms'));
      const nameAt = st ? 1100 : 400;
      const lettersEnd = nameAt + 800 + chars.length * step;
      at(st ? 150 : 0, () => stick.classList.add('in'));
      at(nameAt - 150, () => brow.classList.add('in'));
      at(nameAt, () => name.querySelectorAll('.fx-ch').forEach((c) => c.classList.add('in')));
      at(lettersEnd - 250, () => confetti());
      at(lettersEnd + 600, () => fx.querySelector('.fx-hint').classList.add('in'));
      if (money) {
        at(lettersEnd, () => {
          sum.classList.add('in');
          const t0 = performance.now(), D = 1400, to = +it.amount;
          const count = (now) => {
            const t = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - t, 3);
            sum.textContent = `${fmt(t < 1 ? Math.round(to * e) : to)} ${sym(it.cur)}`;
            if (t < 1) requestAnimationFrame(count);
          };
          requestAnimationFrame(count);
        });
      }
      const end = () => {
        if (!fxDone) return;
        fxDone = null;
        timers.forEach(clearTimeout);
        cancelAnimationFrame(raf);
        fx.removeEventListener('click', end);
        document.removeEventListener('keydown', onKey, true);
        clearInterval(watch);
        fx.querySelector('.fx-hint').classList.remove('in');
        prog.style.width = '0';
        fx.classList.remove('open');
        fx.classList.add('closing');
        setTimeout(() => {
          fx.hidden = true;
          fx.classList.remove('closing');
          stick.innerHTML = '';
          const cv = fx.querySelector('.fx-confetti');
          cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        }, 400);
        resolve();
      };
      const onKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); end(); }
      };
      fxDone = end;
      fx.addEventListener('click', end);
      document.addEventListener('keydown', onKey, true);
      // сама заставка уходит, когда кончилась песня победы; без песни (звук выключен, трек не включился) — через несколько секунд
      const t0 = Date.now();
      const minEnd = lettersEnd + (money ? 4500 : 4000);
      const prog = fx.querySelector('.fx-prog');
      let lastBurst = 0, lastSwap = 0;
      const watch = setInterval(() => {
        const el = Date.now() - t0;
        const tr = winTrack();
        prog.style.width = (tr && tr.dur > 0 ? Math.min(1, tr.pos / tr.dur) : Math.min(1, el / minEnd)) * 100 + '%';
        if (el < minEnd) return;
        if (!tr) { end(); return; }
        // пока играет песня: время от времени снова конфетти и новый стикер
        if (el - lastBurst > 9000) { lastBurst = el; confetti(); }
        if (pool.length > 1 && el - lastSwap > 12000) {
          lastSwap = el;
          const nx = pool[Math.floor(Math.random() * pool.length)];
          stick.classList.remove('in');
          stick.innerHTML = nx.video ? `<video src="${nx.src}" autoplay muted loop playsinline></video>` : `<img src="${nx.src}" alt="">`;
          void stick.offsetWidth;
          stick.classList.add('in');
        }
      }, 400);

      function confetti() {
        const cv = fx.querySelector('.fx-confetti');
        const dpr = Math.min(2, devicePixelRatio || 1);
        cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
        const g = cv.getContext('2d');
        g.scale(dpr, dpr);
        const nb = name.getBoundingClientRect();
        const ox = nb.left + nb.width / 2, oy = nb.top + nb.height / 2;
        const parts = Array.from({ length: 160 }, (_, i) => {
          const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.6, v = 6 + Math.random() * 11;
          return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
            r: Math.random() * TAU, vr: (Math.random() - .5) * .4, c: PALETTE[i % PALETTE.length] };
        });
        const tick = () => {
          g.clearRect(0, 0, innerWidth, innerHeight);
          let alive = 0;
          for (const p of parts) {
            p.vx *= .985; p.vy = p.vy * .985 + .32; p.x += p.vx; p.y += p.vy; p.r += p.vr;
            if (p.y > innerHeight + 20) continue;
            alive++;
            g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
            g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
            g.restore();
          }
          if (alive) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    });
  }

  // ---------- итог розыгрыша: текст и картинка ----------
  let lastWinner = null;
  // текущий победитель: на выбывание — последний оставшийся, в «Одном победителе» — тот, кто выпал последним
  const winnerNow = () => (S.pick === 'one' ? (lastWinner && S.items.includes(lastWinner) ? lastWinner : null) : (S.items.length > 1 && alive().length === 1 ? alive()[0] : null));
  function resultData(it) {
    const don = S.mode === 'donate';
    const money = (i) => (don ? `${fmt(i.amount)} ${sym(i.cur)}` : '');
    const outs = S.pick === 'one' ? [] : S.items.filter((i) => i.out).sort((x, y) => x.outOrder - y.outOrder);
    return {
      name: it.name, money: money(it), don,
      chance: don && it.startWin != null ? pct(it.startWin) : '',
      total: S.items.length,
      bank: don ? `${fmt(S.items.reduce((t, i) => t + weight(i), 0))} ${sym(S.cur)}` : '', // весь банк, а не только оставшиеся
      outs: outs.map((i) => ({ name: i.name, money: money(i) })),
      date: new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
  }
  function resultText(it) {
    const d = resultData(it);
    const lines = [`🏆 Победитель: ${d.name}${d.money ? ' — ' + d.money : ''}${d.chance ? ` (шанс ${d.chance})` : ''}`];
    lines.push(S.pick === 'one' ? `Выпал с одной прокрутки из ${d.total}` : `Остался последним из ${d.total}`);
    if (d.bank) lines.push(`Банк: ${d.bank}`);
    if (d.outs.length) {
      lines.push('', 'Порядок вылета:');
      d.outs.forEach((o, k) => lines.push(`${k + 1}. ${o.name}${o.money ? ' — ' + o.money : ''}`));
    }
    lines.push('', `Колесо Казуала · ${d.date}`, location.origin + '/wheel/');
    return lines.join('\n');
  }
  async function resultImage(it) {
    const d = resultData(it);
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
    const C = { bg: v('--bg', '#101114'), panel: v('--panel', '#17181c'), ink: v('--ink', '#f2f2f2'), ink2: v('--ink-2', '#b5b5b5'), ink3: v('--ink-3', '#7a7a7a'), line: v('--line', '#2a2b30'), good: v('--good', '#2EAD60'), accent: v('--accent', '#3550E8'), onTier: v('--on-tier', '#fff') };
    const disp = (v('--font-display', 'Handjet') || 'Handjet').split(',')[0].replace(/["']/g, '').trim();
    try { await document.fonts.load(`800 80px "${disp}"`); await document.fonts.load('600 30px Onest'); } catch (e) {}
    const W = 1080, rows = Math.min(d.outs.length, 14);
    const H = Math.max(1080, 720 + (rows ? 110 + rows * 52 : 0) + (d.outs.length > rows ? 52 : 0));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const rrect = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    // точечный фон, как на сайте
    g.fillStyle = C.line;
    for (let y = 20; y < H; y += 28) for (let x = 20; x < W; x += 28) g.fillRect(x, y, 2, 2);
    // лучи за победителем
    g.save(); g.translate(W / 2, 330); g.fillStyle = C.accent; g.globalAlpha = .12;
    for (let k = 0; k < 16; k++) { g.rotate(TAU / 16); g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, -620); g.lineTo(60, -620); g.closePath(); g.fill(); }
    g.restore();
    const fit = (text, font, size, max) => { let sz = size; do { g.font = font.replace('$', sz); sz -= 4; } while (g.measureText(text).width > max && sz > 20); };
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink3; g.font = `700 34px "${disp}", ${FONT}`;
    g.fillText('КОЛЕСО КАЗУАЛА', W / 2, 90);
    g.fillStyle = C.accent; g.font = `700 40px "${disp}", ${FONT}`;
    g.fillText('П О Б Е Д И Т Е Л Ь', W / 2, 230);
    g.fillStyle = C.ink; fit(d.name, `800 $px "${disp}", ${FONT}`, 190, W - 120);
    g.fillText(d.name, W / 2, 400);
    let y = 470;
    if (d.money) {
      g.font = `800 64px "${disp}", ${FONT}`;
      const tw = g.measureText(d.money).width + 60;
      g.fillStyle = C.good; rrect((W - tw) / 2, y, tw, 92, 20); g.fill();
      g.fillStyle = C.onTier; g.fillText(d.money, W / 2, y + 70);
      y += 130;
    } else y += 30;
    g.fillStyle = C.ink2; g.font = `600 32px ${FONT}`;
    const sub = [S.pick === 'one' ? `выпал из ${d.total}` : `последний из ${d.total}`, d.chance && `шанс ${d.chance}`, d.bank && `банк ${d.bank}`].filter(Boolean).join('  ·  ');
    g.fillText(sub, W / 2, y + 20);
    y += 100;
    if (rows) {
      g.textAlign = 'left'; g.fillStyle = C.ink3; g.font = `700 30px "${disp}", ${FONT}`;
      g.fillText('ПОРЯДОК ВЫЛЕТА', 120, y); y += 24;
      g.fillStyle = C.panel; g.strokeStyle = C.line; g.lineWidth = 2;
      const boxH = rows * 52 + (d.outs.length > rows ? 52 : 0) + 24;
      rrect(100, y, W - 200, boxH, 24); g.fill(); g.stroke();
      y += 50;
      d.outs.slice(0, rows).forEach((o, k) => {
        g.font = `500 30px ${FONT}`;
        g.textAlign = 'left'; g.fillStyle = C.ink3; g.fillText(String(k + 1), 130, y);
        g.fillStyle = C.ink2; fit(o.name, `500 $px ${FONT}`, 30, o.money ? 560 : 760); g.fillText(o.name, 190, y);
        g.font = `500 30px ${FONT}`;
        if (o.money) { g.textAlign = 'right'; g.fillStyle = C.ink3; g.fillText(o.money, W - 130, y); }
        y += 52;
      });
      if (d.outs.length > rows) { g.textAlign = 'left'; g.fillStyle = C.ink3; g.fillText(`…и ещё ${d.outs.length - rows}`, 190, y); }
    }
    g.textAlign = 'center'; g.fillStyle = C.ink3; g.font = `500 28px ${FONT}`;
    g.fillText(`${d.date}  ·  ${location.host}/wheel`, W / 2, H - 50);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  function wMsg(t) { $('#wMsg').textContent = t || ''; }
  async function shareImage() {
    if (!lastWinner) return;
    wMsg('Рисую картинку…');
    try {
      const blob = await resultImage(lastWinner);
      const file = new File([blob], `wheel-${Date.now()}.png`, { type: 'image/png' });
      // на телефоне — системное «Поделиться» (сохранить в фото, отправить в чат), на компьютере — скачать файл
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Колесо Казуала', text: `Победитель: ${lastWinner.name}` }); wMsg(''); return; }
        catch (e) { if (e.name === 'AbortError') { wMsg(''); return; } }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      wMsg('Картинка сохранена.');
    } catch (e) { wMsg('Не получилось сделать картинку.'); }
  }
  // картинка с итогом прямо в буфер обмена: вставляется в чат через Ctrl+V или «Вставить»
  async function copyImage() {
    if (!lastWinner) return;
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
      wMsg('Этот браузер не умеет копировать картинки, сохраняю файл…');
      return shareImage();
    }
    wMsg('Рисую картинку…');
    try {
      // картинка отдаётся обещанием сразу: Safari копирует, только пока не прошло нажатие
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': resultImage(lastWinner) })]);
      wMsg('Картинка скопирована, можно вставить в чат.');
    } catch (e) {
      wMsg('Не получилось скопировать картинку. Нажми «Сохранить картинку».');
    }
  }
  async function copyResult() {
    if (!lastWinner) return;
    const text = resultText(lastWinner);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      try { ok = document.execCommand('copy'); } catch (e2) {}
      ta.remove();
    }
    wMsg(ok ? 'Текст скопирован, можно вставить в чат.' : 'Не удалось скопировать.');
  }

  function showWinner(it) {
    lastWinner = it;
    lotsWinner = { n: it.name, at: Date.now() + lotsOffset, sum: S.mode === 'donate' && +it.amount > 0 ? `${fmt(it.amount)} ${sym(it.cur)}` : '' };
    lotsLiveNow();
    wMsg('');
    playWinMusic();
    winFx(it).then(() => openWinnerCard(it));
  }
  function openWinnerCard(it) {
    $('#wName').textContent = it.name;
    const total = S.items.length;
    $('#wStats').innerHTML = S.mode === 'donate' && it.startWin != null
      ? `<span class="badge" data-tier="good">${pct(it.startWin)}</span>
         <div class="total-meta"><strong>${S.pick === 'one' ? 'шанс был' : 'шанс на старте'}</strong><span>донат ${fmt(it.amount)} ${sym(it.cur)}${it.cur !== S.cur ? ' ' + convText(it) : ''}</span></div>`
      : `<span class="badge" data-tier="good">${total}</span>
         <div class="total-meta"><strong>${S.mode === 'donate' ? `донат ${fmt(it.amount)} ${sym(it.cur)}` : 'участников было на колесе'}</strong><span>${S.pick === 'one' ? 'выпал с одной прокрутки' : 'остался последним'}</span></div>`;
    $('#wAgain').textContent = S.pick === 'one' ? 'Крутить ещё раз' : 'Новый раунд с теми же';
    $('#winner').hidden = false;
    $('#wAgain').focus();
  }
  // песня победы доигрывает до конца и после закрытия карточки; фон вернётся, когда она кончится
  function hideWinner() {
    if ($('#winner').hidden) return;
    $('#winner').hidden = true;
    if (CH.win.active) { stopChannel('win'); resumeBg(); }
    $('#restart').focus();
  }

  function restoreAll() {
    if (S.spinning) return;
    clearTimeout(autoTimer);
    stopChannel('win');
    resumeBg();
    S.items.forEach((i) => { i.out = false; i.outOrder = 0; });
    S.outSeq = 0;
    lotsWinner = null;
    $('#winner').hidden = true;
    save();
    render();
  }

  // ---------- гифки в центре (хранятся в IndexedDB этого браузера) ----------
  let dbP = null, persistOk = true, G = [];
  function db() {
    if (!dbP) dbP = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('koleso-gifs', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('gifs', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
      } catch (e) { rej(e); }
    });
    return dbP;
  }
  function idbReq(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const tx = d.transaction('gifs', mode);
      const q = fn(tx.objectStore('gifs'));
      tx.oncomplete = () => res(q && q.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    }));
  }
  const gifsAll = () => idbReq('readonly', (s) => s.getAll());
  const gifPut = (rec) => idbReq('readwrite', (s) => s.put(rec));
  const gifDel = (id) => idbReq('readwrite', (s) => s.delete(id));

  function gifNote(text, kind) {
    const el = $('#gifNote');
    el.textContent = text || (persistOk
      ? 'GIF, PNG, JPG или WebP. Файл можно перетащить прямо на колесо.'
      : 'Браузер не даёт сохранить гифки: после перезагрузки их придётся загрузить заново.');
    el.className = 'field-msg' + (kind ? ' ' + kind : '');
  }

  function applyHub() {
    $('.wheel-wrap').style.setProperty('--hub', S.hub + '%');
    draw();
  }

  // базовые картинки для центра лежат в hub/ и перечислены в hub/index.json по группам:
  // стикеры «Папич by @St1ckyyy», roflan-эмоуты, эмоуты канала arthas
  let BASE_GROUPS = [], BASE_HUBS = [];
  // iPhone со старой iOS не играет WebM: рядом лежат те же ролики в MP4
  const WEBM_OK = (() => { try { return !!document.createElement('video').canPlayType('video/webm; codecs="vp9"'); } catch (e) { return false; } })();
  const vsrc = (src) => (WEBM_OK ? src : src.replace(/\.webm$/i, '.mp4'));
  function loadBaseHubs() {
    return fetch('hub/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => {
        BASE_GROUPS = d.groups || [];
        // убранный повтор: выбор переходит на оставшийся вариант того же смайла
        if (d.aliases && d.aliases[S.gif]) { S.gif = d.aliases[S.gif]; save(); }
        BASE_HUBS = BASE_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, src: vsrc(it.src), video: /\.webm$/i.test(it.src) })));
        if (!BASE_GROUPS.some((g) => g.id === S.baseGroup)) {
          const own = BASE_GROUPS.find((g) => g.items.some((it) => it.id === S.gif));
          S.baseGroup = own ? own.id : (BASE_GROUPS[0] && BASE_GROUPS[0].id);
        }
        renderBaseHubs();
        renderGifs();
      })
      .catch(() => { $('#baseThumbs').innerHTML = '<p class="field-msg">Базовые картинки не загрузились, обнови страницу.</p>'; });
  }
  function renderBaseHubs() {
    const g = BASE_GROUPS.find((x) => x.id === S.baseGroup) || BASE_GROUPS[0];
    $('#baseTabs').innerHTML = BASE_GROUPS.map((x) => `<button type="button" data-bgroup="${x.id}" aria-pressed="${g && x.id === g.id}">${esc(x.title)} <b>${x.items.length}</b></button>`).join('');
    $('#baseThumbs').innerHTML = g ? g.items.map((it) => {
      const b = BASE_HUBS.find((x) => x.id === it.id);
      return `<button type="button" class="th th-base" data-gif="${b.id}" aria-pressed="${b.id === S.gif}" title="${esc(b.name)}" aria-label="${esc(b.name)}">${b.video
        ? `<video data-src="${b.src}" muted loop playsinline preload="none"></video>`
        : `<img src="${b.src}" alt="" loading="lazy" decoding="async">`}</button>`;
    }).join('') : '';
    watchThumbVideos();
  }
  // видео-стикеры грузятся и играют, только пока видны: на телефоне не качаем все сразу
  let thumbObs = null;
  function watchThumbVideos() {
    const vids = [...document.querySelectorAll('#baseThumbs video[data-src]')];
    if (!('IntersectionObserver' in window)) { vids.forEach((v) => { v.src = v.dataset.src; v.play().catch(() => {}); }); return; }
    if (!thumbObs) {
      thumbObs = new IntersectionObserver((ents) => ents.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) { if (!v.getAttribute('src')) v.src = v.dataset.src; v.play().catch(() => {}); }
        else if (!v.paused) v.pause();
      }), { rootMargin: '120px' });
    }
    thumbObs.disconnect(); // старые миниатюры после перерисовки больше не нужны
    vids.forEach((v) => thumbObs.observe(v));
  }

  function renderGifs() {
    const base = BASE_HUBS.find((b) => b.id === S.gif);
    const cur = base ? null : G.find((g) => g.id === S.gif);
    const img = $('#hubImg'), vid = $('#hubVid');
    const src = base ? base.src : cur ? cur.url : '';
    const isVid = !!(base && base.video);
    if (src && !isVid) { img.src = src; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    if (isVid) {
      if (vid.getAttribute('src') !== src) vid.src = src;
      vid.hidden = false;
      vid.play().catch(() => {});
    } else if (!vid.hidden) {
      vid.pause(); vid.hidden = true; vid.removeAttribute('src'); vid.load();
    }
    $('#spin').classList.toggle('has-gif', !!src);
    document.querySelectorAll('#baseThumbs [data-gif]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gif === S.gif)));
    $('#thumbs').innerHTML =
      `<button type="button" class="th add" id="gifPick" aria-label="Загрузить гифку">${ICON.plus}<span>Гифка</span></button>` +
      `<button type="button" class="th" data-gif="" aria-pressed="${!src}">Без гифки</button>` +
      G.map((g) => `<span class="thw">
        <button type="button" class="th" data-gif="${g.id}" aria-pressed="${g.id === S.gif}" title="${esc(g.name)}"><img src="${g.url}" alt="${esc(g.name)}"></button>
        <button type="button" class="th-x" data-del="${g.id}" aria-label="Удалить ${esc(g.name)}">${ICON.xs}</button>
      </span>`).join('');
  }

  async function addGifs(files) {
    const list = [...files].filter((f) => /^image\/(gif|png|jpe?g|webp)$/.test(f.type));
    if (!list.length) { gifNote('Это не картинка. Нужен файл GIF, PNG, JPG или WebP.', 'err'); return; }
    let added = 0;
    for (const f of list) {
      if (f.size > 20 * 1024 * 1024) { gifNote(`«${f.name}» больше 20 МБ, возьми файл поменьше.`, 'err'); continue; }
      const rec = { id: 'g' + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36), name: f.name, blob: f, added: Date.now() };
      try { await gifPut(rec); } catch (e) { persistOk = false; }
      G.push({ ...rec, url: URL.createObjectURL(f) });
      S.gif = rec.id;
      added++;
    }
    if (!added) return;
    if (S.hub === HUBS[0][0]) { S.hub = HUBS[1][0]; applyHub(); markSeg('#hubSeg', 'data-hub', S.hub); } // с гифкой центр крупнее
    save();
    renderGifs();
    gifNote();
  }

  function removeGif(id) {
    const g = G.find((x) => x.id === id);
    if (!g) return;
    gifDel(id).catch(() => {});
    URL.revokeObjectURL(g.url);
    G = G.filter((x) => x.id !== id);
    if (S.gif === id) S.gif = '';
    save();
    renderGifs();
  }

  // ---------- музыка: фон страницы и трек победы (свои файлы лежат в том же IndexedDB, kind: 'audio') ----------
  let A = [], pendingSlot = '', bgWasOn = false;
  const slotTitle = (slot) => (MUSIC_SLOTS.find((m) => m[0] === slot) || [, slot])[1];
  // фон: всё, кроме VI KA; победа: только VI KA (или свой файл)
  const slotPresets = (slot) => (slot === 'bg' ? PRESETS.filter((p) => p.id !== DEFAULT_WIN) : PRESETS.filter((p) => p.id === DEFAULT_WIN));
  const CH = {
    bg: { active: false, type: null, el: null, loop: false, onFail: null },
    win: { active: false, type: null, el: null, loop: false, onFail: null },
  };

  // ---------- встроенные плееры YouTube и Spotify, по одному на канал ----------
  const EMB = { ytApi: null, spApi: null, yt: {}, ytReady: {}, sp: {}, spReady: {}, spUri: {}, cued: {}, failed: false };
  // песню победы подгружаем, пока колесо крутится: на победе она заиграет сразу, без паузы и тишины
  function cueWin() {
    const p = presetOf(S.music.win);
    if (!S.sound || !p || p.src !== 'yt' || EMB.failed || CH.win.active) return;
    ytPlayer('win').then((y) => { if (CH.win.active) return; try { y.cueVideoById({ videoId: p.key, startSeconds: p.start || 0 }); EMB.cued.win = p.key; } catch (e) {} }).catch(() => {});
  }
  // громкость играющего канала: свой файл и YouTube (у Spotify в плеере её не поменять)
  function applyVolume(ch) {
    const c = CH[ch], k = ch === 'bg' ? 0.6 : 1;
    if (c.el) c.el.volume = Math.min(1, volume() * k);
    try { if (EMB.yt[ch] && EMB.yt[ch].setVolume) EMB.yt[ch].setVolume(Math.round(volume() * k * 100)); } catch (e) {}
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  function ytApi() {
    if (!EMB.ytApi) {
      EMB.ytApi = Promise.race([new Promise((res, rej) => {
        if (window.YT && window.YT.Player) { res(); return; }
        window.onYouTubeIframeAPIReady = () => res();
        loadScript('https://www.youtube.com/iframe_api').catch(rej);
      }), timeout(15000)]);
      EMB.ytApi.catch(() => { EMB.failed = true; });
    }
    return EMB.ytApi;
  }
  function spApi() {
    if (!EMB.spApi) {
      EMB.spApi = Promise.race([new Promise((res, rej) => {
        window.onSpotifyIframeApiReady = (api) => res(api);
        loadScript('https://open.spotify.com/embed/iframe-api/v1').catch(rej);
      }), timeout(15000)]);
      EMB.spApi.catch(() => { EMB.failed = true; });
    }
    return EMB.spApi;
  }
  function ytPlayer(ch) {
    if (!EMB.ytReady[ch]) {
      EMB.ytReady[ch] = ytApi().then(() => new Promise((res) => {
        EMB.yt[ch] = new YT.Player('yt-' + ch, {
          width: 192, height: 108,
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => res(EMB.yt[ch]),
            onStateChange: (e) => { if (e.data === 0) channelEnded(ch); },
            onError: (e) => {
              // запасная копия ролика, если основной нельзя встраивать
              const c = CH[ch];
              if (c.active && c.type === 'yt' && c.alts && c.alts.length) { EMB.yt[ch].loadVideoById({ videoId: c.alts.shift(), startSeconds: 0 }); return; }
              embedFailed(ch, e.data === 150 || e.data === 101
              ? 'Автор этого ролика на YouTube запретил проигрывать его на других сайтах. Поставь трек через «Свой файл».'
              : 'YouTube не дал проиграть этот трек.');
            },
          },
        });
      }));
    }
    return EMB.ytReady[ch];
  }
  function spPlayer(ch, uri) {
    if (!EMB.spReady[ch]) {
      EMB.spUri[ch] = uri;
      EMB.spReady[ch] = spApi().then((api) => new Promise((res) => {
        api.createController(document.getElementById('sp-' + ch), { uri, width: '100%', height: 80 }, (ctrl) => {
          EMB.sp[ch] = ctrl;
          ctrl.addListener('ready', () => res(ctrl));
          ctrl.addListener('playback_update', (e) => {
            const d = e && e.data;
            if (d) { CH[ch].pos = d.position; CH[ch].dur = d.duration; }
            if (d && d.duration && !d.isPaused && d.position >= d.duration - 400) channelEnded(ch);
          });
        });
      }));
    }
    return EMB.spReady[ch];
  }
  // плееры живут за пределами экрана, на странице видна только строка «Сейчас играет»
  function showFrame(ch, p) {
    const box = $('#mplayer-' + ch);
    box.hidden = false;
    box.querySelector('.mp-title').textContent = p.title;
    paintPlayers();
  }
  const hideFrame = (ch) => { $('#mplayer-' + ch).hidden = true; };

  // ролик не играет: сообщаем, а на победе звучит стандартная фанфара
  function embedFailed(ch, text) {
    const c = CH[ch];
    if (!c.active) return;
    musicNote(text + (ch === 'win' ? ' Пока играет стандартная фанфара.' : ''), 'err');
    hideFrame(ch);
    const f = c.onFail;
    Object.assign(c, { active: false, type: null, onFail: null });
    renderMusic();
    if (f) f();
  }
  async function startPreset(ch, p) {
    const c = CH[ch];
    showFrame(ch, p);
    try {
      if (p.src === 'yt') {
        const y = await ytPlayer(ch);
        if (!c.active || c.type !== 'yt') return;
        c.alts = (p.alt || []).slice();
        applyVolume(ch);
        // ролик уже подгружен во время вращения — просто включаем с нужной секунды, без паузы на загрузку
        if (EMB.cued[ch] === p.key) y.seekTo(p.start || 0, true);
        else y.loadVideoById({ videoId: p.key, startSeconds: p.start || 0 });
        EMB.cued[ch] = null;
        y.playVideo();
        // iPhone и Android молча блокируют звук без нажатия: если трек так и не заиграл, звучит стандартная фанфара
        setTimeout(() => {
          if (!c.active || c.type !== 'yt') return;
          let st = -1;
          try { st = y.getPlayerState(); } catch (e) {}
          if (st !== 1 && st !== 3) embedFailed(ch, ch === 'bg' ? 'Браузер не дал включить музыку сам: нажми ▶ у фоновой музыки.' : 'Браузер не дал включить трек без нажатия.');
        }, 4000);
      } else {
        const uri = 'spotify:track:' + p.key;
        const s = await spPlayer(ch, uri);
        if (!c.active || c.type !== 'sp') return;
        if (EMB.spUri[ch] !== uri) { s.loadUri(uri); EMB.spUri[ch] = uri; setTimeout(() => { if (c.active && c.type === 'sp') s.play(); }, 500); }
        else s.play();
      }
    } catch (e) {
      embedFailed(ch, 'Треки из списка играют на casualhub.pages.dev, здесь встроенные плееры недоступны.');
    }
  }
  // включить канал; false — играть нечего (тогда звучит стандартный звук)
  function playChannel(ch, opts = {}) {
    stopChannel(ch);
    if (!S.sound && !opts.force) return false;
    const c = CH[ch];
    const v = S.music[ch];
    const p = presetOf(v);
    if (p) {
      if (EMB.failed) return false;
      Object.assign(c, { active: true, paused: false, type: p.src, loop: !!opts.loop, onFail: opts.onFail || null, start: p.start || 0 });
      startPreset(ch, p);
      renderMusic();
      return true;
    }
    const rec = A.find((a) => a.id === v);
    if (!rec) return false;
    const el = new Audio(rec.url);
    showFrame(ch, { title: rec.name });
    // тишина в начале файла пропускается; по кругу тоже с первой секунды со звуком (см. channelEnded)
    el.loop = !!opts.loop && !(rec.start > 0);
    if (rec.start > 0) el.currentTime = rec.start;
    el.volume = Math.min(1, volume() * (ch === 'bg' ? 0.6 : 1));
    el.addEventListener('ended', () => channelEnded(ch));
    const fail = opts.onFail || null;
    // заблокированный автозапуск своего файла: на победе вместо него стандартная фанфара
    el.play().catch(() => { if (c.el === el) { stopChannel(ch); if (fail) fail(); } });
    Object.assign(c, { active: true, paused: false, type: 'file', el, loop: !!opts.loop, onFail: null, start: rec.start || 0 });
    renderMusic();
    return true;
  }
  function stopChannel(ch) {
    const c = CH[ch];
    const was = c.active;
    c.active = false;
    if (c.el) { c.el.pause(); c.el = null; }
    try { if (c.type === 'yt' && EMB.yt[ch] && EMB.yt[ch].pauseVideo) EMB.yt[ch].pauseVideo(); } catch (e) {}
    try { if (c.type === 'sp' && EMB.sp[ch]) EMB.sp[ch].pause(); } catch (e) {}
    c.type = null;
    c.onFail = null;
    c.paused = false;
    hideFrame(ch);
    if (was) renderMusic();
  }
  // что играет в канале: { pos, dur } в секундах (dur 0 — длина пока неизвестна), иначе null
  function trackOf(ch) {
    const c = CH[ch];
    if (!c.active) return null;
    try {
      if (c.type === 'file' && c.el) return { pos: c.el.currentTime || 0, dur: Number.isFinite(c.el.duration) ? c.el.duration : 0 };
      if (c.type === 'yt' && EMB.yt[ch] && EMB.yt[ch].getDuration) return { pos: EMB.yt[ch].getCurrentTime() || 0, dur: EMB.yt[ch].getDuration() || 0 };
      if (c.type === 'sp') return { pos: (c.pos || 0) / 1000, dur: (c.dur || 0) / 1000 };
    } catch (e) {}
    return { pos: 0, dur: 0 };
  }
  const winTrack = () => trackOf('win');
  // перемотка на секунду sec (не раньше начала звука и не дальше конца)
  function seekChannel(ch, sec) {
    const c = CH[ch], tr = trackOf(ch);
    if (!tr) return;
    const to = Math.max(c.start || 0, tr.dur ? Math.min(tr.dur - 0.5, sec) : sec);
    try {
      if (c.type === 'file' && c.el) c.el.currentTime = to;
      else if (c.type === 'yt' && EMB.yt[ch]) EMB.yt[ch].seekTo(to, true);
      else if (c.type === 'sp' && EMB.sp[ch]) { EMB.sp[ch].seek(to); c.pos = to * 1000; }
    } catch (e) {}
    paintPlayers();
  }
  // пауза и продолжение с того же места
  function togglePause(ch) {
    const c = CH[ch];
    if (!c.active) return;
    c.paused = !c.paused;
    try {
      if (c.type === 'file' && c.el) { if (c.paused) c.el.pause(); else c.el.play().catch(() => {}); }
      else if (c.type === 'yt' && EMB.yt[ch]) { if (c.paused) EMB.yt[ch].pauseVideo(); else EMB.yt[ch].playVideo(); }
      else if (c.type === 'sp' && EMB.sp[ch]) { if (c.paused) EMB.sp[ch].pause(); else EMB.sp[ch].resume(); }
    } catch (e) {}
    paintPlayers();
  }
  const mmss = (t) => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  // пульт под треком: время, полоса перемотки, значок паузы; обновляется и когда вкладка свёрнута
  let seeking = null;
  // то, что видит человек: позиция и длина без отрезанной тишины в начале
  function shownTrack(ch) {
    const tr = trackOf(ch) || { pos: 0, dur: 0 };
    const s = CH[ch].start || 0;
    return { pos: Math.max(0, tr.pos - s), dur: tr.dur ? Math.max(0, tr.dur - s) : 0 };
  }
  function paintPlayers() {
    for (const ch of ['bg', 'win']) {
      const box = document.getElementById('mplayer-' + ch);
      if (!box || box.hidden) continue;
      // время и ползунок считаются от начала звука: тишина в начале ролика отрезана, поэтому трек идёт с 0:00
      const tr = shownTrack(ch);
      const range = box.querySelector('.mp-seek');
      range.disabled = !tr.dur;
      if (seeking !== ch) range.value = tr.dur ? Math.round((tr.pos / tr.dur) * 1000) : 0;
      box.querySelector('[data-mp-pos]').textContent = mmss(seeking === ch && tr.dur ? (range.value / 1000) * tr.dur : tr.pos);
      box.querySelector('[data-mp-dur]').textContent = tr.dur ? mmss(tr.dur) : '—';
      const pp = box.querySelector('.mp-pp');
      const paused = !!CH[ch].paused;
      if (pp.dataset.state !== String(paused)) {
        pp.dataset.state = String(paused);
        pp.innerHTML = paused ? ICON.play : ICON.pause;
        pp.setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
        pp.title = paused ? 'Продолжить' : 'Пауза';
      }
    }
  }
  setInterval(() => { if (CH.bg.active || CH.win.active) paintPlayers(); }, 400);
  function channelEnded(ch) {
    const c = CH[ch];
    if (!c.active) return;
    if (c.loop) {
      try {
        if (c.type === 'yt') { EMB.yt[ch].seekTo(c.start || 0); EMB.yt[ch].playVideo(); }
        else if (c.type === 'sp') { EMB.sp[ch].seek(0); EMB.sp[ch].resume(); }
        else if (c.type === 'file' && c.el) { c.el.currentTime = c.start || 0; c.el.play().catch(() => {}); }
      } catch (e) {}
      return;
    }
    stopChannel(ch);
    if (ch === 'win') resumeBg();
  }

  // фон играет по кругу и стартует от первого действия на странице (так требуют браузеры)
  function startBg(force) {
    if (!S.music.bg || (!S.bgOn && !force) || CH.win.active || CH.bg.active) return;
    playChannel('bg', { loop: true, force });
  }
  function pauseBgForWin() { bgWasOn = CH.bg.active; if (bgWasOn) stopChannel('bg'); }
  function resumeBg() { if (bgWasOn) { bgWasOn = false; startBg(); } }
  function playWinMusic() {
    pauseBgForWin();
    if (!playChannel('win', { onFail: playWin })) playWin();
  }

  function musicNote(text, kind) {
    const el = $('#musicNote');
    el.textContent = text || 'Трек можно выбрать из списка или поставить свой файл, он сохранится в этом браузере. Вылет и щелчки при вращении всегда стандартные.';
    el.className = 'field-msg' + (kind ? ' ' + kind : '');
  }

  function renderMusic() {
    const vol = $('#vol');
    if (vol && document.activeElement !== vol) { vol.value = S.vol == null ? 80 : S.vol; $('#volVal').textContent = vol.value + '%'; }
    $('#mslots').innerHTML = MUSIC_SLOTS.map(([slot, title, when]) => {
      const v = S.music[slot];
      const rec = A.find((a) => a.id === v);
      const pre = presetOf(v);
      const on = CH[slot].active;
      const has = !!(rec || pre);
      // один список на всё: треки, свой файл, загрузка своего, без музыки
      const opts = slotPresets(slot).map((p) => [`preset:${p.id}`, p.title])
        .concat(rec ? [[rec.id, '📁 ' + rec.name]] : [])
        .concat([['__upload', rec ? '📁 Загрузить другой файл…' : '📁 Загрузить свой файл…']])
        .concat(slot === 'bg' ? [['', '🔇 Без музыки']] : []);
      const label = on ? (slot === 'bg' ? 'Выключить' : 'Стоп') : (slot === 'bg' ? 'Включить' : 'Послушать');
      return `<div class="mcard${on ? ' on' : ''}">
        <div class="mc-head"><strong>${title}</strong><button type="button" class="mplay${on ? ' on' : ''}" data-mplay="${slot}"${has ? '' : ' disabled'} aria-label="${label}: ${title}">${on ? ICON.stop : ICON.play}${label}</button></div>
        <small>${when}</small>
        <select class="inp mpick" data-mpick="${slot}" aria-label="Трек: ${title}">${opts.map(([val, t]) => `<option value="${esc(val)}"${val === (v || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </div>`;
    }).join('');
  }
  function dropAudio(id) {
    const a = A.find((x) => x.id === id);
    if (!a) return;
    gifDel(id).catch(() => {});
    URL.revokeObjectURL(a.url);
    A = A.filter((x) => x.id !== id);
  }

  // где в своём файле кончается тишина: первая доля секунды громче 5% от пика
  async function leadingSilence(blob) {
    try {
      const a = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(await blob.arrayBuffer());
      const sr = a.sampleRate, chs = [...Array(a.numberOfChannels)].map((_, i) => a.getChannelData(i));
      let peak = 0;
      for (const ch of chs) for (let i = 0; i < ch.length; i += 64) peak = Math.max(peak, Math.abs(ch[i]));
      const thr = Math.max(0.01, peak * 0.05), win = Math.round(sr * 0.02), n = chs[0].length;
      for (let i = 0; i < n; i += win) {
        let sum = 0, cnt = 0;
        for (const ch of chs) for (let j = i; j < Math.min(i + win, n); j++) { sum += ch[j] * ch[j]; cnt++; }
        if (Math.sqrt(sum / cnt) > thr) return Math.max(0, Math.round((i / sr - 0.05) * 100) / 100);
      }
    } catch (e) {}
    return 0;
  }
  async function addAudio(file, slot) {
    if (!file || !(/^audio\//.test(file.type) || /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba)$/i.test(file.name))) {
      musicNote('Это не аудио. Нужен mp3, ogg, wav или m4a.', 'err');
      return;
    }
    if (file.size > 30 * 1024 * 1024) { musicNote(`«${file.name}» больше 30 МБ, возьми файл поменьше.`, 'err'); return; }
    stopChannel(slot);
    const old = S.music[slot];
    const rec = { id: 'a' + Date.now().toString(36) + Math.floor(rnd() * 1e6).toString(36), kind: 'audio', slot, name: file.name, blob: file, added: Date.now() };
    musicNote('Ищу, где в треке начинается звук…');
    rec.start = await leadingSilence(file);
    try { await gifPut(rec); } catch (e) { persistOk = false; }
    A.push({ ...rec, url: URL.createObjectURL(file) });
    S.music[slot] = rec.id;
    if (old && !presetOf(old)) dropAudio(old);
    if (slot === 'bg') S.bgOn = true;
    save();
    renderMusic();
    if (slot === 'bg') startBg(true);
    musicNote(persistOk ? `«${file.name}» стоит на «${slotTitle(slot)}».` : 'Браузер не даёт сохранить трек: после перезагрузки его придётся загрузить заново.', persistOk ? 'ok' : 'err');
  }

  function bind() {
    $('#spin').addEventListener('click', () => { clearTimeout(autoTimer); lotsSpinAsk(); });

    $('#mslots').addEventListener('click', (e) => {
      const pl = e.target.closest('[data-mplay]');
      if (!pl) return;
      const slot = pl.dataset.mplay;
      if (S.spinning && slot === 'win' && !CH.win.active) return; // трек победы занят: колесо может вот-вот выдать победителя
      if (slot === 'bg') {
        if (CH.bg.active) { stopChannel('bg'); S.bgOn = false; musicNote(); }
        else { S.bgOn = true; startBg(true); }
        save();
        return;
      }
      // прослушать трек победы: фон на это время затихает
      if (CH.win.active) { stopChannel('win'); resumeBg(); return; }
      pauseBgForWin();
      if (!playChannel('win', { force: true })) resumeBg();
    });
    // пульт трека: −10 с, пауза, +10 с и перемотка ползунком (работают и пока колесо крутится)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mp]');
      if (!b) return;
      const ch = b.dataset.ch, tr = trackOf(ch);
      if (!tr) return;
      if (b.dataset.mp === 'toggle') togglePause(ch);
      else seekChannel(ch, tr.pos + (b.dataset.mp === 'fwd' ? 10 : -10));
    });
    document.addEventListener('input', (e) => {
      const r = e.target.closest('.mp-seek');
      if (!r) return;
      seeking = r.dataset.ch;
      paintPlayers();
    });
    document.addEventListener('change', (e) => {
      const r = e.target.closest('.mp-seek');
      if (!r) return;
      const ch = r.dataset.ch, tr = trackOf(ch);
      seeking = null;
      const sh = shownTrack(ch);
      if (tr && sh.dur) seekChannel(ch, (CH[ch].start || 0) + (r.value / 1000) * sh.dur);
    });
    // трек из списка
    $('#mslots').addEventListener('change', (e) => {
      const sel = e.target.closest('[data-mpick]');
      if (!sel) return;
      const slot = sel.dataset.mpick;
      if (sel.value === '__upload') { pendingSlot = slot; renderMusic(); $('#audioFile').click(); return; }
      if (sel.value === S.music[slot]) return;
      if (!sel.value) {
        // «Без музыки» — только у фона
        stopChannel(slot);
        const old = S.music[slot];
        if (old && !presetOf(old)) dropAudio(old);
        S.music[slot] = '';
        save();
        renderMusic();
        musicNote('Фоновая музыка выключена.', 'ok');
        return;
      }
      stopChannel(slot);
      const old = S.music[slot];
      if (old && !presetOf(old)) dropAudio(old);
      S.music[slot] = sel.value; // в списке уже «preset:id»
      if (slot === 'bg') S.bgOn = true;
      save();
      renderMusic();
      // название: у пресета — из списка треков, у своего файла — как подписан в выпадающем списке
      const p = presetOf(S.music[slot]);
      const opt = sel.selectedOptions && sel.selectedOptions[0];
      const title = p ? p.title : (opt ? opt.textContent.trim() : 'Свой трек');
      if (slot === 'bg') { startBg(true); musicNote(`«${title}» играет фоном.`, 'ok'); }
      else musicNote(`«${title}» стоит на победе. Нажми «Послушать», чтобы проверить.`, 'ok');
    });
    // громкость: сразу для того, что играет
    let volSave = 0;
    $('#vol').addEventListener('input', (e) => {
      S.vol = +e.target.value;
      $('#volVal').textContent = S.vol + '%';
      applyVolume('bg'); applyVolume('win');
      clearTimeout(volSave); volSave = setTimeout(save, 300);
    });
    // фон включается от первого действия на странице: без него браузер звук не пустит
    const kickBg = (e) => {
      if (e.target && e.target.closest && e.target.closest('#mslots')) return;
      document.removeEventListener('pointerdown', kickBg, true);
      document.removeEventListener('keydown', kickBg, true);
      if (S.sound) ensureAudio();
      startBg();
    };
    document.addEventListener('pointerdown', kickBg, true);
    document.addEventListener('keydown', kickBg, true);
    $('#audioFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f && pendingSlot) addAudio(f, pendingSlot);
      e.target.value = '';
    });
    $('#restart').addEventListener('click', restoreAll);

    $('#themeMenu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-id]');
      if (!b) return;
      const swap = () => { applyTheme(b.dataset.themeId, true); readTheme(); draw(); };
      // новая тема расходится кругом от выбранного пункта, где это умеет браузер
      if (document.startViewTransition && !reduced) {
        const r = b.getBoundingClientRect();
        document.documentElement.style.setProperty('--tx', `${r.left + r.width / 2}px`);
        document.documentElement.style.setProperty('--ty', `${r.top + r.height / 2}px`);
        document.documentElement.classList.add('theme-swap');
        let done = false;
        const go = () => { if (!done) { done = true; swap(); } };
        const vt = document.startViewTransition(go);
        vt.ready.catch(() => {});
        if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
        vt.finished.catch(() => {}).finally(() => document.documentElement.classList.remove('theme-swap'));
        setTimeout(go, 400); // если переход не начался (вкладка в фоне), тема всё равно сменится
      } else swap();
      $('#themePick').open = false;
      $('#themeBtn').focus();
    });
    document.addEventListener('click', (e) => { const p = $('#themePick'); if (p.open && !p.contains(e.target)) p.open = false; });
    // меню тем не уходит за край экрана, где бы ни оказалась кнопка
    $('#themePick').addEventListener('toggle', () => {
      const pick = $('#themePick'), menu = $('#themeMenu');
      if (!pick.open || !menu) return;
      menu.style.translate = '';
      const box = menu.offsetParent ? menu.offsetParent.getBoundingClientRect() : { left: 0 };
      const left = box.left + menu.offsetLeft, right = left + menu.offsetWidth;
      const shift = left < 8 ? 8 - left : right > innerWidth - 8 ? innerWidth - 8 - right : 0;
      if (shift) menu.style.translate = `${Math.round(shift)}px 0`;
    });

    $('#mnav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-section]');
      if (!b || S.section === b.dataset.section) return;
      S.section = b.dataset.section;
      applySection();
      save();
      const y = $('#layout').getBoundingClientRect().top + window.scrollY - $('#mnav').offsetHeight - 24;
      if (window.scrollY > y) window.scrollTo(0, Math.max(0, y));
      resize();
    });

    document.querySelectorAll('.view-tab').forEach((b) => b.addEventListener('click', () => {
      if (S.spinning || S.mode === b.dataset.mode) return;
      S.mode = b.dataset.mode;
      msg('');
      save();
      render();
    }));

    $('#durRange').addEventListener('input', (e) => {
      S.duration = Math.min(DUR_MAX, Math.max(DUR_MIN, Math.round(+e.target.value) || 8));
      $('#durVal').textContent = S.duration + ' с';
      save();
    });
    $('#hubSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hub]');
      if (!b) return;
      S.hub = +b.dataset.hub;
      markSeg('#hubSeg', 'data-hub', S.hub);
      applyHub();
      save();
    });
    $('#pickSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b || S.spinning || b.dataset.pick === S.pick) return;
      S.pick = b.dataset.pick;
      // в обычном режиме выбывших нет: возвращаем всех на колесо
      if (S.pick === 'one') S.items.forEach((i) => { i.out = false; i.outOrder = 0; });
      clearTimeout(autoTimer);
      save();
      render();
    });
    $('#auto').addEventListener('change', (e) => { S.auto = e.target.checked; if (!S.auto) clearTimeout(autoTimer); save(); });
    $('#snd').addEventListener('change', (e) => {
      S.sound = e.target.checked;
      if (!S.sound) { stopChannel('bg'); stopChannel('win'); bgWasOn = false; } else startBg();
      save();
    });

    $('#curTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cur]');
      if (!b || S.spinning) return;
      S.cur = b.dataset.cur;
      $('#cur').value = S.cur;
      save();
      render();
      const nb = $(`#curTabs [data-cur="${S.cur}"]`);
      if (nb) nb.focus();
    });

    // в суммах и курсах — только число: цифры, пробелы между тысячами и одна запятая или точка.
    // Ловим раньше остальных обработчиков, поэтому буквы не успевают попасть ни в поле, ни в сохранённые данные
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.inputMode !== 'decimal') return;
      const dec = t.closest('#rateGrid') ? 6 : 2; // у курса бывает много знаков после запятой
      let v = t.value.replace(/[^\d.,\s ]/g, '').replace(/^[\s ]+/, '');
      const sep = v.search(/[.,]/);
      let int = sep < 0 ? v : v.slice(0, sep), frac = sep < 0 ? null : v.slice(sep + 1).replace(/[^\d]/g, '').slice(0, dec);
      if (int.replace(/\D/g, '').length > 10) int = int.replace(/\D/g, '').slice(0, 10); // больше миллиарда донатов не бывает
      v = frac == null ? int : int + v[sep] + frac;
      if (v === t.value) return;
      const pos = Math.max(0, (t.selectionStart || 0) - (t.value.length - v.length));
      t.value = v;
      try { t.setSelectionRange(pos, pos); } catch (_) {}
    }, true);

    $('#rateGrid').addEventListener('input', (e) => {
      const c = e.target.dataset.cur;
      if (!c) return;
      const v = num(e.target.value);
      if (!(v > 0)) return;
      S.rates[c] = rate(S.cur) / v;
      save();
      refreshNumbers();
    });
    $('#ratesReset').addEventListener('click', () => { S.rates = { ...DEF_RATES }; save(); render(); });

    $('#sampleClear').addEventListener('click', () => {
      S.items = [];
      S.outSeq = 0;
      S.sample = false;
      save();
      render();
      $('#name').focus();
    });

    $('#addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#name').value.trim();
      const amount = num($('#amount').value);
      if (!name) return msg('Впиши имя или название.', 'err');
      if (S.mode === 'donate' && !(amount > 0)) { $('#amount').focus(); return msg('Впиши сумму доната больше нуля.', 'err'); }
      const cur = $('#cur').value;
      const r = addItem(name, S.mode === 'donate' ? amount : 0, cur);
      if (r === 'dup') return msg(`«${name}» уже на колесе.`, 'err');
      msg(r === 'merged' ? `К «${name}» добавлено ${fmt(amount)} ${sym(cur)}` : `«${name}» на колесе.`, 'ok');
      $('#name').value = '';
      $('#amount').value = '';
      $('#name').focus();
      save();
      render();
    });

    $('#bulkAdd').addEventListener('click', () => {
      const lines = $('#bulk').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (!lines.length) return msg('Вставь хотя бы одну строку.', 'err');
      let added = 0, merged = 0, dup = 0, noSum = 0;
      // имя, разделитель, [символ валюты] сумма [валюта]: «Hades $20», «Hades 1 500 грн», «Hades — 300 ₪»
      const re = /^(.*?)[\s,;:=\-–—]+(₴|\$|€|₪|₽)?\s*(\d{1,3}(?:[  .']\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(₴|грн\.?|грив[а-яё]*|uah|\$|usd|дол[а-яё.]*|€|eur|евро|₪|ils|шек[а-яё.]*|₽|руб[а-яё.]*|rub|р\.?)?$/i;
      const fallback = $('#cur').value;
      lines.forEach((line) => {
        let name = line, amount = 0, cur = fallback;
        if (S.mode === 'donate') {
          const m = line.match(re);
          if (m && m[1].trim()) {
            name = m[1].trim();
            amount = parseFloat(m[3].replace(/[  .']/g, '') + (m[4] ? '.' + m[4] : '')); // «1 500», «1.500» и «1'500» — тысячи
            cur = curFrom(m[2]) || curFrom(m[5]) || fallback;
          } else noSum++;
        }
        const r = addItem(name, amount, cur);
        if (r === 'added') added++;
        else if (r === 'merged') merged++;
        else if (r === 'dup') dup++;
      });
      $('#bulk').value = '';
      let text = `Добавлено: ${added}`;
      if (merged) text += `, суммировано: ${merged}`;
      if (dup) text += `, повторов пропущено: ${dup}`;
      if (noSum) text += `. Без суммы: ${noSum}, впиши её в списке.`;
      msg(text, noSum ? 'err' : 'ok');
      save();
      render();
    });

    $('#list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="del"]');
      if (!b || S.spinning) return;
      const id = +b.closest('.prow').dataset.id;
      S.items = S.items.filter((i) => i.id !== id);
      S.sample = false;
      save();
      render();
    });

    $('#list').addEventListener('input', (e) => {
      const inp = e.target.closest('[data-act="amt"]');
      if (!inp) return;
      const it = S.items.find((i) => i.id === +inp.closest('.prow').dataset.id);
      if (!it) return;
      const v = num(inp.value);
      it.amount = v > 0 ? v : 0;
      S.sample = false;
      $('#sampleNote').hidden = true;
      save();
      refreshNumbers();
    });

    // пересортировать топ, когда закончили править сумму (не во время ввода)
    $('#list').addEventListener('focusout', (e) => {
      if (!e.target.closest('[data-act="amt"]')) return;
      setTimeout(() => {
        if (S.spinning || $('#list').contains(document.activeElement)) return;
        render(true);
      }, 0);
    });
    $('#list').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-act="amt"]')) e.target.blur();
    });

    $('#outList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="back"]');
      if (!b || S.spinning) return;
      const it = S.items.find((i) => i.id === +b.dataset.id);
      if (it) { it.out = false; it.outOrder = 0; }
      $('#winner').hidden = true;
      save();
      render();
    });

    $('#clear').addEventListener('click', () => {
      const b = $('#clear');
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Точно? Нажми ещё раз';
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => { delete b.dataset.armed; b.textContent = 'Очистить всё'; }, 3000);
        return;
      }
      clearTimeout(clearTimer);
      delete b.dataset.armed;
      b.textContent = 'Очистить всё';
      clearTimeout(autoTimer);
      S.items = [];
      S.outSeq = 0;
      S.sample = false;
      msg('');
      save();
      render();
      $('#name').focus();
    });

    $('#gifFile').addEventListener('change', (e) => { addGifs(e.target.files); e.target.value = ''; });
    $('#thumbs').addEventListener('click', (e) => {
      if (e.target.closest('#gifPick')) { $('#gifFile').click(); return; }
      const del = e.target.closest('[data-del]');
      if (del) { removeGif(del.dataset.del); return; }
      const b = e.target.closest('[data-gif]');
      if (!b) return;
      S.gif = b.dataset.gif;
      save();
      renderGifs();
    });
    $('#baseTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bgroup]');
      if (!b || b.dataset.bgroup === S.baseGroup) return;
      S.baseGroup = b.dataset.bgroup;
      save();
      renderBaseHubs();
      $('#baseThumbs').scrollTop = 0;
    });
    $('#baseThumbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-gif]');
      if (!b) return;
      S.gif = b.dataset.gif;
      if (S.hub === HUBS[0][0]) { S.hub = HUBS[1][0]; applyHub(); markSeg('#hubSeg', 'data-hub', S.hub); } // с картинкой центр крупнее
      save();
      renderGifs();
    });

    // перетаскивание файла: подсветка на колесе, принимается в любом месте страницы
    const wrap = $('.wheel-wrap');
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    let dragDepth = 0;
    document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; wrap.classList.add('drop'); });
    document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) wrap.classList.remove('drop'); });
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      wrap.classList.remove('drop');
      addGifs(e.dataTransfer.files);
    });

    $('#wImg').addEventListener('click', shareImage);
    $('#wCopyImg').addEventListener('click', copyImage);
    $('#wCopy').addEventListener('click', copyResult);
    $('#wAgain').addEventListener('click', () => { restoreAll(); if (S.pick === 'one') spin(); });
    $('#wClose').addEventListener('click', hideWinner);
    const muteWin = (e) => { e.stopPropagation(); if (CH.win.active) stopChannel('win'); };
    $('#fxMute').addEventListener('click', muteWin);
    $('#wMute').addEventListener('click', muteWin);
    setInterval(() => { $('#fxMute').hidden = $('#wMute').hidden = !CH.win.active; }, 300);
    // та же карточка, что после победы (картинка: скопировать или скачать, текст), только без музыки и салюта
    $('#exportRes').addEventListener('click', () => { const w = winnerNow(); if (!w) return; lastWinner = w; wMsg(''); openWinnerCard(w); });
    $('#winner').addEventListener('click', (e) => { if (e.target.id === 'winner') hideWinner(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideWinner(); });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); draw(); });
    new MutationObserver(() => { readTheme(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new ResizeObserver(resize).observe(canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitCache.clear(); draw(); });
  }

  function start(data) {
    let d = data && Array.isArray(data.items) ? data : null;
    if (!d) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const p = JSON.parse(raw); if (p && Array.isArray(p.items)) d = p; }
      } catch (e) {}
    }
    S = Object.assign(fresh(), d || {});
    S.spinning = false;
    if (S.pick !== 'one') S.pick = 'out';
    if (d && !d.v) {
      // старые сохранения открывались в рублях; по умолчанию банк в гривнах
      const wasRub = !d.cur || d.cur === 'RUB';
      if (wasRub) S.cur = 'UAH';
      S.items.forEach((i) => { if (!i.cur || (wasRub && i.cur === 'RUB')) i.cur = 'UAH'; });
      save();
    }
    if (!CUR[S.cur]) S.cur = 'UAH';
    S.rates = Object.assign({ ...DEF_RATES }, S.rates || {});
    S.items.forEach((i) => { if (!CUR[i.cur]) i.cur = S.cur; });
    S.duration = Math.min(DUR_MAX, Math.max(DUR_MIN, Math.round(+S.duration) || 8));
    S.hub = nearest(+S.hub || HUBS[0][0], HUBS.map((h) => h[0]));
    if (!['wheel', 'list'].includes(S.section)) S.section = 'wheel';
    S.music = Object.assign({ bg: '', win: '' }, S.music || {});
    // бывший «Спин» становится фоном (кроме VI KA, она только для победы), «Вылет» теперь всегда стандартный
    if (S.music.spin && !S.music.bg) S.music.bg = S.music.spin;
    if (S.music.bg === 'preset:' + DEFAULT_WIN) S.music.bg = '';
    delete S.music.spin;
    delete S.music.out;
    if (S.bgOn == null) S.bgOn = true;
    // победа по умолчанию VI KA; пустой трек победы тоже означает VI KA
    if (!S.music.win) S.music.win = 'preset:' + DEFAULT_WIN;
    // на победе из списка остался только VI KA: другие треки из списка заменяем на него
    if (presetOf(S.music.win) && presetOf(S.music.win).id !== DEFAULT_WIN) S.music.win = 'preset:' + DEFAULT_WIN;
    if (!d) { S.sample = true; SAMPLE.forEach(([n, a]) => S.items.push(makeItem(n, a, S.cur))); }
    $('#cur').innerHTML = CODES.map((c) => `<option value="${c}">${CUR[c].sym} ${c}</option>`).join('');
    $('#cur').value = S.cur;
    if (!/\/wheel(\/|\/index\.html)?$/.test(location.pathname)) { $('#backLink').hidden = true; $('#opinionLink').hidden = true; } // вне сайта ссылкам некуда вести

    applyTheme(readThemePref(), false);
    readTheme();
    bind();
    renderSegs();
    applySection();
    render();
    resize();
    applyHub();
    renderGifs();
    loadBaseHubs();
    gifNote();
    lotsInit();
    renderMusic();
    musicNote();
    gifsAll()
      .then((recs) => {
        const all = recs || [];
        G = all.filter((r) => r.kind !== 'audio').sort((x, y) => x.added - y.added).map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
        A = all.filter((r) => r.kind === 'audio').map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
        // файлы, загруженные до обрезки тишины: находим её один раз и запоминаем
        A.filter((r) => r.start == null).forEach(async (r) => {
          r.start = await leadingSilence(r.blob);
          const { url, ...keep } = r;
          gifPut(keep).catch(() => {});
        });
        MUSIC_SLOTS.forEach(([s]) => {
          if (S.music[s] && !presetOf(S.music[s]) && !A.some((a) => a.id === S.music[s])) S.music[s] = s === 'win' ? 'preset:' + DEFAULT_WIN : '';
        });
        renderGifs();
        renderMusic();
      })
      .catch(() => { persistOk = false; gifNote(); musicNote(); });
  }

  // появление разделов после нажатий: чуть выезжают снизу, без затухания; через секунду после загрузки
  if (!reduced) {
    const SEL = '.card, .out-box, .board-list, .example-bar, .empty';
    const kick = (n) => {
      if (!(n instanceof Element) || !n.matches(SEL)) return;
      n.classList.remove('enter');
      void n.offsetWidth;
      n.classList.add('enter');
    };
    addEventListener('animationend', (e) => { if (e.animationName === 'enter-up' && e.target.classList) e.target.classList.remove('enter'); });
    const watch = () => setTimeout(() => {
      new MutationObserver((ms) => {
        for (const m of ms) {
          const n = m.target;
          if (m.attributeName === 'hidden' && !n.hidden) kick(n);
          if (m.attributeName === 'data-section') n.querySelectorAll(':scope > .card').forEach((c) => { if (getComputedStyle(c).display !== 'none') kick(c); });
        }
      }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden', 'data-section'] });
    }, 1000);
    if (document.readyState === 'complete') watch(); else addEventListener('load', watch);
  }

  // ---------- лоты по ссылке: зрители добавляют игры сами, а колесо видят вживую ----------
  const lotsAccount = (() => { try { const u = JSON.parse(localStorage.getItem('ocenshik.user.v1') || 'null'); const t = u && (JSON.parse(localStorage.getItem('casualhub.tokens.v1') || 'null') || {})[u.id]; return u && t ? { id: u.id, token: t } : null; } catch (e) { return null; } })();
  const LOTS_KEY = 'casualhub.lots.v1' + (lotsAccount ? ':' + lotsAccount.id : '');
  let lotsRoom = null, lotsList = [], lotsOffset = 0, lotsMap = {}, lotsWinner = null, liveSpin = null, liveT = 0, liveSig = '', lotsPollT = 0, livePick = '', lotsPerNew = 3, lotsMinsNew = 10, lotsKindNew = 'game', lotsErr = '', lotsRooms = [], lotsAskedFor = null;
  const LOT_KIND_NAMES = { game: 'Игры из Steam', movie: 'Фильмы и сериалы', anime: 'Аниме', book: 'Книги', music: 'Музыка', any: 'Что угодно' };
  async function lotsApi(path, method = 'GET', body) {
    let r;
    try {
      r = await fetch('/api' + path, { method, cache: 'no-store', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (lotsAccount ? lotsAccount.token : '') }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (e) { throw new Error('Нет связи с сервером.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Сервер не ответил.');
    return d;
  }
  const lotsLeft = () => (lotsRoom && lotsRoom.endsAt ? lotsRoom.endsAt - (Date.now() + lotsOffset) : null);
  const lotsOpen = () => !!lotsRoom && !lotsRoom.closed && (lotsRoom.endsAt == null || lotsLeft() > 0);
  const lotsLink = () => (lotsRoom ? location.origin + '/lots/#' + lotsRoom.id : '');
  const lotsMmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(t / 60); return m + ':' + String(t % 60).padStart(2, '0'); };
  function lotsTake(d) {
    if (d.now) lotsOffset = d.now - Date.now();
    if (d.room !== undefined) lotsRoom = d.room;
    if (d.lots) lotsList = d.lots;
    lotsImport();
    lotsPaint();
  }
  // новые лоты встают на колесо. Пока колесо крутится, ничего не трогаем
  function lotsImport() {
    if (!lotsRoom || S.spinning) return;
    let changed = false;
    for (const l of lotsList) {
      if (lotsMap[l.id]) continue;
      const r = addItem(l.name, 0, S.cur);
      const it = S.items.find((i) => i.name.toLowerCase() === l.name.toLowerCase());
      lotsMap[l.id] = it ? it.id : -1;
      if (r === 'added') { changed = true; msg(`Новый лот: «${l.name}»`, 'ok'); }
    }
    try { localStorage.setItem(LOTS_KEY, JSON.stringify({ code: lotsRoom.id, map: lotsMap })); } catch (e) {}
    if (changed) { save(); render(); }
  }
  function lotsLiveBody() {
    const a = S.sample ? [] : segments();
    const left = alive();
    const won = lotsWinner || (S.pick !== 'one' && !S.spinning && S.items.length > 1 && left.length === 1 ? { n: left[0].name } : null);
    return {
      segs: a.map((x) => ({ n: x.item.name, p: +x.p.toFixed(6), c: colorOf(x.item).c, t: colorOf(x.item).t })),
      rot: +mod(S.rot, TAU).toFixed(4), spin: liveSpin, pick: livePick, hub: S.hub,
      // зрителям уходят только треки из списка и картинки сайта: свои файлы лежат в браузере ведущего
      music: { bg: S.bgOn && presetOf(S.music.bg) ? presetOf(S.music.bg).id : '', win: presetOf(S.music.win) ? presetOf(S.music.win).id : '' },
      hubImg: (() => { const b = BASE_HUBS.find((x) => x.id === S.gif); return b ? b.src.replace(/\.mp4$/i, '.webm') : ''; })(),
      status: S.sample ? '' : $('#statusMain').textContent.slice(0, 140),
      out: S.items.filter((i) => i.out).map((i) => i.name), winner: won,
    };
  }
  function lotsLiveNow() {
    clearTimeout(liveT);
    if (!lotsRoom || !lotsAccount) return;
    const body = lotsLiveBody(), sig = JSON.stringify(body);
    if (sig === liveSig) return;
    liveSig = sig;
    lotsApi('/lots/' + lotsRoom.id + '/live', 'PUT', body).catch(() => { liveSig = ''; });
  }
  function lotsLiveSoon() {
    if (!lotsRoom) return;
    if (!S.spinning) { liveSpin = null; livePick = ''; }
    clearTimeout(liveT);
    liveT = setTimeout(lotsLiveNow, 500);
  }
  // сам момент старта уходит сразу и по общему времени: зрители крутят колесо синхронно
  function lotsSpin(from, to, ms) {
    if (!lotsRoom) return;
    liveSpin = { from: +from.toFixed(4), to: +to.toFixed(4), ms, at: Date.now() + lotsOffset };
    livePick = '';
    lotsLiveNow();
  }
  // таймер сбора ещё идёт: сначала спрашиваем. На один таймер один раз, чтобы не мешать следующим прокруткам
  function lotsSpinAsk() {
    if (S.spinning || !lotsRoom || !lotsRoom.endsAt || !lotsOpen() || lotsAskedFor === lotsRoom.endsAt || alive().length < 2) { spin(); return; }
    $('#lotsAskText').textContent = `До конца сбора ${lotsMmss(lotsLeft())}, зрители ещё могут добавлять лоты. Крутить сейчас?`;
    $('#lotsAsk').hidden = false;
    $('#lotsAskNo').focus({ preventScroll: true });
  }
  function lotsAskInit() {
    const box = $('#lotsAsk');
    const hide = () => { box.hidden = true; };
    $('#lotsAskNo').addEventListener('click', hide);
    box.addEventListener('click', (e) => { if (e.target === box) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) hide(); });
    $('#lotsAskSpin').addEventListener('click', () => { lotsAskedFor = lotsRoom && lotsRoom.endsAt; hide(); spin(); });
    $('#lotsAskClose').addEventListener('click', async () => {
      hide();
      await lotsDo(() => lotsApi('/lots/' + lotsRoom.id, 'PATCH', { closed: true }));
      spin();
    });
  }
  function lotsPaint() {
    const box = $('#lotsBody');
    if (!box) return;
    if (!lotsAccount) { box.innerHTML = '<p class="lots-note">Войди в аккаунт, и можно будет дать зрителям ссылку: они сами добавят лоты, а твоё колесо будут видеть вживую.</p><a class="btn small primary" href="/opinion/#login">Войти</a>'; return; }
    if (!lotsRoom) {
      box.innerHTML = `<p class="lots-note">Дай ссылку зрителям: они сами добавят лоты, те встанут на колесо, а как оно крутится, будут видеть вживую.</p>
        <label class="lots-f">Название<input class="inp" id="lotsTitle" maxlength="60" placeholder="Например, Аук Толика"></label>
        <div class="lots-f"><span>Категория колеса</span><div class="seg" role="group" aria-label="Категория колеса">${Object.entries(LOT_KIND_NAMES).map(([k, t]) => `<button type="button" data-lots-kind="${k}" aria-pressed="${k === lotsKindNew}">${t}</button>`).join('')}</div></div>
        <div class="lots-f"><span>Лотов на человека</span><div class="seg" role="group" aria-label="Лотов на человека">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-lots-per="${n}" aria-pressed="${n === lotsPerNew}">${n}</button>`).join('')}</div></div>
        <label class="lots-f">Сколько минут можно вписывать (0 — пока не закроешь сам)<input class="inp lots-mins" id="lotsMins" type="number" inputmode="numeric" min="0" max="1440" value="${lotsMinsNew}"></label>
        <div class="dfoot"><button type="button" class="btn small primary" data-lots="create">Открыть сбор</button></div>
        ${lotsErr ? `<p class="lots-note bad">${esc(lotsErr)}</p>` : ''}
        <div id="lotsRooms"></div>`;
      lotsPaintRooms();
      return;
    }
    const left = lotsLeft(), open = lotsOpen();
    box.innerHTML = `<label class="lots-f">Ссылка для зрителей<div class="lots-row"><input class="inp" id="lotsUrl" readonly value="${esc(lotsLink())}"><button type="button" class="btn small primary" data-lots="copy">Скопировать</button></div></label>
      <p class="lots-note">Категория: ${esc(LOT_KIND_NAMES[lotsRoom.kind] || '')}</p>
      <div class="lots-row"><b>${lotsList.length}</b> ${lotsList.length % 10 === 1 && lotsList.length % 100 !== 11 ? 'лот' : lotsList.length % 10 > 1 && lotsList.length % 10 < 5 && (lotsList.length % 100 < 12 || lotsList.length % 100 > 14) ? 'лота' : 'лотов'} · <span id="lotsClock" class="${open ? 'lots-note' : 'lots-note bad'}">${lotsClockText(left, open)}</span></div>
      <p class="lots-note">Пока идёт сбор, вкладку можно закрыть: зрители всё равно видят лоты, а на твоё колесо они встанут, когда вернёшься. Открытой она нужна, только когда крутишь.</p>
      <p class="lots-note">Зрители слышат музыку из списка, а свой загруженный файл играет только у тебя.</p>
      <div class="lots-f"><span>Лотов на человека</span><div class="seg" role="group" aria-label="Лотов на человека">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-lots-limit="${n}" aria-pressed="${n === lotsRoom.perUser}">${n}</button>`).join('')}</div></div>
      <div class="lots-row">
        ${open ? '' : '<button type="button" class="btn small primary" data-lots="spin">Крутить</button>'}
        ${open && lotsRoom.endsAt ? '<button type="button" class="btn small ghost" data-lots="minus">−1 минута</button>' : ''}
        <button type="button" class="btn small ghost" data-lots="plus">+1 минута</button>
        ${open ? '<button type="button" class="btn small ghost" data-lots="close">Закрыть сбор</button>' : '<button type="button" class="btn small ghost" data-lots="reopen">Открыть снова</button>'}
        <button type="button" class="btn text" data-lots="new">Новый сбор</button>
      </div>
      ${lotsErr ? `<p class="lots-note bad">${esc(lotsErr)}</p>` : ''}
      <div id="lotsRooms"></div>`;
    lotsPaintRooms();
  }
  // все сборы ведущего: ссылка на каждый лежит здесь, сколько бы новых он ни открыл
  function lotsPaintRooms() {
    const box = $('#lotsRooms');
    if (!box) return;
    const now = Date.now() + lotsOffset;
    const rows = lotsRooms.map((r) => {
      const on = lotsRoom && lotsRoom.id === r.id;
      const room = on ? { ...r, ...lotsRoom, n: lotsList.length } : r;
      const state = room.winner ? '🏆 ' + room.winner : room.closed ? 'закрыт' : room.endsAt && room.endsAt <= now ? 'время вышло' : 'открыт';
      return `<li${on ? ' class="on"' : ''}><span class="lots-room"><b>${esc(room.title || 'Без названия')}</b><small>${esc(LOT_KIND_NAMES[room.kind] || '')} · лотов: ${room.n} · ${esc(state)}${on ? ' · сейчас на колесе' : ''}</small></span><button type="button" class="btn small ghost" data-lots-copy="${esc(r.id)}">Ссылка</button>${on || room.winner ? '' : `<button type="button" class="btn small ghost" data-lots-open="${esc(r.id)}">На колесо</button>`}<button type="button" class="btn text" data-lots-del="${esc(r.id)}">Удалить</button></li>`;
    });
    box.innerHTML = rows.length ? `<div class="lots-f"><span>Мои сборы</span><ul class="lots-rooms">${rows.join('')}</ul></div>` : '';
  }
  async function lotsRefreshRooms() {
    try { const d = await lotsApi('/lots-mine'); lotsRooms = d.rooms || []; if (d.now) lotsOffset = d.now - Date.now(); lotsPaintRooms(); } catch (e) {}
  }
  // снимаем лоты текущего сбора с колеса; сам сбор и его ссылка остаются
  function lotsDetach() {
    const old = new Set(Object.values(lotsMap));
    clearTimeout(lotsPollT);
    lotsRoom = null; lotsList = []; lotsMap = {}; lotsErr = ''; lotsWinner = null; liveSpin = null; livePick = ''; liveSig = '';
    $('#winner').hidden = true;
    stopChannel('win');
    resumeBg();
    if (old.size) { S.items = S.items.filter((i) => !old.has(i.id)); save(); render(); }
    try { localStorage.setItem(LOTS_KEY, JSON.stringify({ code: '', map: {} })); } catch (e) {}
  }
  // вернуть старый сбор на колесо: его лоты встают заново, а вылетевшие остаются вылетевшими
  async function lotsResume(id) {
    if (S.spinning) return;
    lotsErr = '';
    let d;
    try { d = await lotsApi('/lots/' + id); } catch (e) { lotsErr = e.message; lotsPaint(); return; }
    lotsDetach();
    if (S.sample) { S.items = []; S.outSeq = 0; S.sample = false; }
    lotsTake(d);
    const out = d.live && Array.isArray(d.live.out) ? d.live.out : [];
    if (out.length) {
      S.items.forEach((i) => { if (out.includes(i.name)) { i.out = true; i.outOrder = ++S.outSeq; } });
      save();
      render();
    }
    lotsLiveNow();
    lotsPoll();
  }
  function lotsClockText(left, open) {
    if (lotsRoom.closed) return 'сбор закрыт';
    if (left == null) return 'без таймера';
    return open ? 'осталось ' + lotsMmss(left) : 'время вышло';
  }
  async function lotsDo(fn) {
    lotsErr = '';
    try { lotsTake(await fn()); } catch (e) { lotsErr = e.message; lotsPaint(); }
  }
  async function lotsPoll() {
    clearTimeout(lotsPollT);
    if (!lotsRoom) return;
    if (!S.spinning) {
      try { const d = await lotsApi('/lots/' + lotsRoom.id + '?v=' + lotsRoom.ver); lotsOffset = d.now - Date.now(); lotsRoom = d.room; if (d.lots) { lotsList = d.lots; lotsImport(); lotsPaint(); } } catch (e) {}
    }
    // и когда вкладка в фоне: лоты должны доезжать, пока ведущий занят другим окном
    lotsPollT = setTimeout(lotsPoll, lotsOpen() ? 2000 : 8000);
  }
  async function lotsInit() {
    const box = $('#lotsBody');
    if (!box) return;
    lotsAskInit();
    lotsPaint();
    box.addEventListener('click', async (e) => {
      const per = e.target.closest('[data-lots-per], [data-lots-kind]');
      if (per) {
        if (per.dataset.lotsPer) lotsPerNew = +per.dataset.lotsPer; else lotsKindNew = per.dataset.lotsKind;
        lotsMinsNew = +$('#lotsMins').value || 0;
        const title = $('#lotsTitle').value;
        lotsPaint();
        $('#lotsTitle').value = title;
        return;
      }
      const lim = e.target.closest('[data-lots-limit]');
      if (lim) { lotsDo(() => lotsApi('/lots/' + lotsRoom.id, 'PATCH', { perUser: +lim.dataset.lotsLimit })); return; }
      const cp = e.target.closest('[data-lots-copy]');
      if (cp) {
        const url = location.origin + '/lots/#' + cp.dataset.lotsCopy;
        try { await navigator.clipboard.writeText(url); msg('Ссылка скопирована.', 'ok'); } catch (er) { msg(url, 'ok'); }
        return;
      }
      const op = e.target.closest('[data-lots-open]');
      if (op) { lotsResume(op.dataset.lotsOpen); return; }
      const del = e.target.closest('[data-lots-del]');
      if (del) {
        // удаление насовсем: ссылка перестанет открываться, поэтому нажать нужно дважды
        if (!del.dataset.armed) {
          del.dataset.armed = '1';
          del.textContent = 'Точно удалить?';
          setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Удалить'; } }, 3000);
          return;
        }
        const id = del.dataset.lotsDel;
        try {
          await lotsApi('/lots/' + id, 'DELETE');
          if (lotsRoom && lotsRoom.id === id) { lotsDetach(); lotsPaint(); }
          lotsRooms = lotsRooms.filter((r) => r.id !== id);
          lotsPaintRooms();
        } catch (er) { lotsErr = er.message; lotsPaint(); }
        return;
      }
      const b = e.target.closest('[data-lots]');
      if (!b) return;
      const a = b.dataset.lots;
      if (a === 'create') {
        const minutes = Math.max(0, Math.min(1440, Math.round(+$('#lotsMins').value) || 0));
        await lotsDo(() => lotsApi('/lots', 'POST', { title: $('#lotsTitle').value, kind: lotsKindNew, perUser: lotsPerNew, minutes }));
        if (lotsRoom) {
          // пример на колесе зрителям ни к чему: дальше на нём только их лоты
          if (S.sample) { S.items = []; S.outSeq = 0; S.sample = false; save(); render(); }
          lotsMap = {}; liveSig = ''; lotsWinner = null; lotsLiveNow(); lotsPoll();
          lotsRefreshRooms();
        }
      } else if (a === 'copy') {
        try { await navigator.clipboard.writeText(lotsLink()); msg('Ссылка скопирована.', 'ok'); }
        catch (er) { const u = $('#lotsUrl'); u.focus(); u.select(); msg('Скопируй ссылку из поля.', 'ok'); }
      } else if (a === 'plus') lotsDo(() => lotsApi('/lots/' + lotsRoom.id, 'PATCH', { extra: 1 }));
      else if (a === 'minus') lotsDo(() => lotsApi('/lots/' + lotsRoom.id, 'PATCH', { extra: -1 }));
      else if (a === 'spin') {
        if (S.spinning) return;
        if (alive().length < 2) { msg('Чтобы крутить, на колесе нужно хотя бы два лота.', 'err'); return; }
        $('#stage').scrollIntoView({ block: 'center', behavior: 'smooth' });
        clearTimeout(autoTimer);
        spin();
      }
      else if (a === 'close') lotsDo(() => lotsApi('/lots/' + lotsRoom.id, 'PATCH', { closed: true }));
      else if (a === 'reopen') lotsDo(() => lotsApi('/lots/' + lotsRoom.id, 'PATCH', { closed: false, ...(lotsLeft() != null && lotsLeft() <= 0 ? { extra: 5 } : {}) }));
      else if (a === 'new') {
        if (S.spinning) return;
        lotsDetach();
        lotsPaint();
        lotsRefreshRooms();
      }
    });
    setInterval(() => { if (!lotsRoom) return; const c = $('#lotsClock'); if (!c) return; const open = lotsOpen(), t = lotsClockText(lotsLeft(), open); if (open !== (c.className === 'lots-note')) { lotsPaint(); return; } if (c.textContent !== t) c.textContent = t; }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && lotsRoom) lotsPoll(); });
    if (!lotsAccount) return;
    try {
      const d = await lotsApi('/lots-mine');
      lotsRooms = d.rooms || [];
      if (d.now) lotsOffset = d.now - Date.now();
      let st = null;
      try { st = JSON.parse(localStorage.getItem(LOTS_KEY) || 'null'); } catch (e) {}
      // на этом устройстве сбор уже шёл: продолжаем его; с другого устройства подхватываем свежий открытый сбор
      const pick = lotsRooms.find((r) => st && r.id === st.code) || (st && st.code === '' ? null : lotsRooms.find((r) => !r.winner && !r.closed && (!r.endsAt || r.endsAt > d.now)));
      if (pick) {
        if (st && st.code === pick.id) { lotsMap = st.map || {}; Object.keys(lotsMap).forEach((k) => { if (!S.items.some((i) => i.id === lotsMap[k])) delete lotsMap[k]; }); }
        lotsTake(await lotsApi('/lots/' + pick.id));
        lotsLiveNow();
        lotsPoll();
      } else lotsPaintRooms();
    } catch (e) {}
  }

  window.claude?.hot?.snapshot?.(() => { const { spinning, ...rest } = S || {}; return rest; });
  window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
