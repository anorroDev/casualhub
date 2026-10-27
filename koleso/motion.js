/* Живость: буквы заголовка, въезд карточек, плавное перестроение списка участников и залп клеток у победителя */
(() => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)', OUT = 'cubic-bezier(.2, .8, .2, 1)';

  // заголовок по буквам, как надпись на главной
  const title = document.querySelector('.title');
  if (title && !calm) {
    const text = title.textContent.trim();
    let i = 0;
    title.setAttribute('aria-label', text);
    title.innerHTML = text.split(' ').map(w => `<span class="w" aria-hidden="true">${[...w].map(c => `<span class="ch" style="--i:${i++}">${c}</span>`).join('')}</span>`).join(' ');
  }
  if (calm) return;

  // карточки въезжают при загрузке
  root.classList.add('intro');
  setTimeout(() => root.classList.remove('intro'), 1400);

  // участники: при каждом перестроении оставшиеся строки плывут на новое место, новые въезжают, имя под стрелкой подпрыгивает
  const list = document.getElementById('list');
  const spot = new Map();
  const measure = () => { spot.clear(); list.querySelectorAll(':scope > .prow').forEach(li => spot.set(li.dataset.id, li.offsetTop)); };
  measure();
  new MutationObserver(() => {
    let k = 0;
    const had = spot.size;
    list.querySelectorAll(':scope > .prow').forEach(li => {
      const was = spot.get(li.dataset.id), now = li.offsetTop;
      if (was != null) {
        if (Math.abs(was - now) > 1) li.animate([{ transform: `translateY(${was - now}px)` }, { transform: 'none' }], { duration: 460, easing: OUT });
      } else if (had && k < 14) {
        li.animate([{ transform: 'translateX(-22px)' }, { transform: 'none' }], { duration: 420, delay: 30 * k++, easing: OUT, fill: 'backwards' });
      }
    });
    measure();
  }).observe(list, { childList: true });

  // имя под стрелкой: маленький подскок при каждой смене
  const ticker = document.getElementById('ticker');
  let lastName = ticker.textContent, lastPop = 0;
  new MutationObserver(() => {
    const t = ticker.textContent, now = performance.now();
    if (t === lastName) return;
    lastName = t;
    if (now - lastPop < 70) return; // на большой скорости имена мелькают часто, подскок не на каждое
    lastPop = now;
    ticker.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-4px) scale(1.04)' }, { transform: 'translateY(0) scale(1)' }], { duration: 220, easing: SPRING });
  }).observe(ticker, { childList: true, characterData: true, subtree: true });

  // победитель: из карточки вылетают клетки, имя победителя выпрыгивает
  const sheet = document.getElementById('winner');
  const burst = () => {
    const card = sheet.querySelector('.sheet-card');
    const b = card.getBoundingClientRect();
    const cs = getComputedStyle(root);
    const colors = ['--good', '--mid', '--bad', '--accent'].map(v => cs.getPropertyValue(v).trim() || '#3550E8').concat(['#EC4899', '#06B6D4']);
    for (let i = 0; i < 44; i++) {
      const s = document.createElement('i');
      s.className = 'burst';
      s.style.background = colors[i % colors.length];
      s.style.left = `${b.left + b.width / 2 - 5}px`;
      s.style.top = `${b.top + Math.min(90, b.height / 3)}px`;
      document.body.appendChild(s);
      const a = (-170 + Math.random() * 160) * Math.PI / 180, d = 90 + Math.random() * 190, rot = (Math.random() - .5) * 900;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      s.animate([
        { transform: 'translate(0, 0) rotate(0) scale(.4)' },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot / 2}deg) scale(1)`, offset: .45 },
        { transform: `translate(${dx * 1.25}px, ${dy + 200}px) rotate(${rot}deg) scale(.5)`, opacity: 0 },
      ], { duration: 1200 + Math.random() * 700, easing: 'cubic-bezier(.2, .7, .4, 1)' }).onfinish = () => s.remove();
    }
    const nm = document.getElementById('wName');
    nm.animate([{ transform: 'translateY(26px) scaleY(.6)' }, { transform: 'none' }], { duration: 700, easing: SPRING, fill: 'backwards', delay: 80 });
  };
  new MutationObserver(() => { if (!sheet.hidden) burst(); }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
})();
