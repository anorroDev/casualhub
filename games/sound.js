/* Казуал Хаб: звуки мини-игр (/games/<игра>/). Синтез в браузере (Web Audio), без звуковых файлов — пиксельные
   «бипы» в тон играм. CasualSound.play(имя, высота) — из скриптов игр: tap (кнопка, ход), skip, good (верно), coin
   (поймал еду; высота — по ценности), bad (мимо, удар), tick (последние секунды хода), lose (проиграл), win (победа,
   рекорд). Кнопка «Звук» — под описанием игры; выключенный звук помнится в casualhub.sound.v1 ('0') на всех играх.
   В фоновой вкладке тишина; звук начинается только после первого нажатия на странице (так требуют браузеры). */
(() => {
  const KEY = 'casualhub.sound.v1';
  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  // ноты подряд: [частота, длительность в секундах, форма волны, громкость]
  const SND = {
    tap: [[880, 0.04, 'square', 0.025]],
    skip: [[520, 0.06, 'triangle', 0.07], [390, 0.09, 'triangle', 0.07]],
    good: [[660, 0.07, 'square', 0.035], [990, 0.11, 'square', 0.035]],
    coin: [[988, 0.05, 'square', 0.03], [1319, 0.1, 'square', 0.03]],
    bad: [[196, 0.1, 'sawtooth', 0.045], [147, 0.17, 'sawtooth', 0.045]],
    tick: [[1400, 0.025, 'square', 0.02]],
    lose: [[392, 0.13, 'triangle', 0.08], [330, 0.13, 'triangle', 0.08], [247, 0.32, 'triangle', 0.08]],
    win: [[523, 0.09, 'square', 0.035], [659, 0.09, 'square', 0.035], [784, 0.09, 'square', 0.035], [1047, 0.26, 'square', 0.04]],
  };
  let ctx = null;
  function play(name, pitch = 1) {
    const notes = SND[name];
    if (!on || !notes || document.hidden) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      let t = ctx.currentTime + 0.01;
      for (const [f, d, type, v] of notes) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f * pitch, t);
        // мягкие края: без щелчков в начале и в конце ноты
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + d + 0.02);
        t += d * 0.9;
      }
    } catch (e) {}
  }

  // ---------- кнопка «Звук» под описанием игры ----------
  const ICON_ON = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h2.5L8 3v10L4.5 10H2z"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.3 6.3 0 0 1 0 9"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h2.5L8 3v10L4.5 10H2z"/><path d="M11 6l4 4M15 6l-4 4"/></svg>';
  let btn = null;
  const paint = () => {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Выключить звук' : 'Включить звук';
    btn.innerHTML = (on ? ICON_ON : ICON_OFF) + '<span>Звук</span>';
  };
  function set(v) {
    on = !!v;
    try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, '0'); } catch (e) {}
    paint();
  }
  function mount() {
    const lede = document.querySelector('.masthead .lede');
    if (!lede || btn) return;
    const st = document.createElement('style');
    st.textContent = '.snd-btn{height:34px;margin-top:12px;padding:0 12px;gap:6px;font-size:13px}.snd-btn[aria-pressed="false"]{color:var(--ink-2)}';
    document.head.appendChild(st);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost snd-btn';
    btn.addEventListener('click', () => { set(!on); play('tap'); });
    paint();
    lede.after(btn);
  }
  // выключили звук в другой вкладке — и здесь
  addEventListener('storage', (e) => { if (e.key === KEY) { on = e.newValue !== '0'; paint(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.CasualSound = Object.freeze({ play, on: () => on, set });
})();
