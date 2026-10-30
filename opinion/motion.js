/* Живость: буквы заголовка, въезд карточек, отклик ползунков и балла, плавная пересортировка рейтинга и залп клеток при сохранении */
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

  // когда оценки загрузились и страница показалась: карточки въезжают, столбики в рейтинге вырастают
  const intro = () => {
    if (calm) return;
    root.classList.add('intro');
    setTimeout(() => root.classList.remove('intro'), 1400);
  };
  if (!root.classList.contains('booting')) intro();
  else {
    const mo = new MutationObserver(() => { if (!root.classList.contains('booting')) { mo.disconnect(); intro(); } });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  if (calm) return;

  const pop = (node, rot) => node && node.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(1.3) rotate(${rot || 0}deg)` }, { transform: 'scale(1)' }],
    { duration: 340, easing: SPRING });

  // число у критерия подпрыгивает при каждом новом значении
  if (typeof updateRow === 'function') {
    const base = updateRow;
    updateRow = function (id) {
      const r = base.apply(this, arguments);
      const li = el.critArea.querySelector(`.crit[data-id="${CSS.escape(id)}"]`);
      pop(li && li.querySelector('.crit-val'));
      return r;
    };
  }

  // итоговый балл подпрыгивает, когда меняется
  if (typeof updateTotal === 'function') {
    const base = updateTotal;
    let last = el.totalNum.textContent;
    updateTotal = function () {
      const r = base.apply(this, arguments);
      const now = el.totalNum.textContent;
      if (now !== last && now !== '—') pop(el.totalNum, -4);
      last = now;
      return r;
    };
  }

  // рейтинг пересобирается без скачков: оставшиеся строки плывут на новое место, новые въезжают
  if (typeof renderBoard === 'function') {
    const base = renderBoard;
    const rows = () => [...el.board.querySelectorAll(':scope > .entry')];
    renderBoard = function () {
      const before = new Map();
      if (!el.board.hidden && !root.classList.contains('booting')) rows().forEach(li => { const b = li.getBoundingClientRect(); before.set(li.dataset.id, [b.left, b.top]); });
      const r = base.apply(this, arguments);
      if (!before.size || el.board.hidden) return r;
      let k = 0;
      rows().forEach(li => {
        const b = li.getBoundingClientRect(), was = before.get(li.dataset.id);
        if (was) {
          const dx = was[0] - b.left, dy = was[1] - b.top;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 460, easing: OUT });
        } else if (k < 14) {
          li.animate([{ transform: 'translateX(-22px)' }, { transform: 'none' }], { duration: 420, delay: 30 * k++, easing: OUT, fill: 'backwards' });
        }
      });
      return r;
    };
  }

  // залп клеток из кнопки «Сохранить» после удачного сохранения
  const burst = (from) => {
    if (!from) return;
    const b = from.getBoundingClientRect();
    const cs = getComputedStyle(root);
    const colors = ['--good', '--mid', '--bad', '--accent'].map(v => cs.getPropertyValue(v).trim() || '#3550E8');
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('i');
      s.className = 'burst';
      s.style.background = colors[i % colors.length];
      s.style.left = `${b.left + b.width / 2 - 4}px`;
      s.style.top = `${b.top + b.height / 2 - 4}px`;
      document.body.appendChild(s);
      const a = (-160 + Math.random() * 140) * Math.PI / 180, d = 60 + Math.random() * 110, rot = (Math.random() - .5) * 720;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      s.animate([
        { transform: 'translate(0, 0) rotate(0) scale(.4)' },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot / 2}deg) scale(1)`, offset: .45 },
        { transform: `translate(${dx * 1.25}px, ${dy + 120}px) rotate(${rot}deg) scale(.5)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2, .7, .4, 1)' }).onfinish = () => s.remove();
    }
    from.animate([{ transform: 'scale(1)' }, { transform: 'scale(.9)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 480, easing: SPRING });
  };
  if (typeof toast === 'function') {
    const base = toast;
    toast = function (msg) {
      const r = base.apply(this, arguments);
      if (/^(Сохранено|Оценка обновлена)/.test(String(msg))) burst(el.save && !el.save.hidden ? el.save : el.totalNum);
      return r;
    };
  }
})();
