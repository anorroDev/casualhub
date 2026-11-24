/* Казуал Хаб: движок перевода сайта с русского. Словарь и особенности языка лежат в /lang-<язык>.js (window.CasualLangPack),
   i18n.js подключает его и этот файл через document.write до первой отрисовки, только если выбран не русский.
   Страницы пишут текст по-русски, а движок заменяет его на лету: и в разметке, и в том, что появляется позже
   (окна, сообщения сервера, подсказки, холсты, системные окна). {} в ключе словаря — любое значение.
   Текст, написанный людьми (оценки, комментарии, ники), не переводится: совпасть со словарём он может только дословно.
   Пакет языка: dict — словарь; nouns — слово после числа: [русские формы, одна, несколько] (выбор по числу, как в английском)
   или [русские формы, те же формы на языке] (форма в форму — у украинского числа те же, что у русского); over — «за» в «5 записей
   за 3 дня»; locale — для дат и чисел; quotes — «» → “”; dot — 7,5–10 → 7.5–10; css — подписи, заданные в стилях;
   wordmark — большая надпись на главной, если её название другое; cyr — язык тоже на кириллице (переведённое не похоже
   на «ещё не переведённое» по одним буквам). */
(() => {
  const P = window.CasualLangPack;
  if (!P || !P.dict || !window.CasualLang) return;
  const X = P.dict, NOUNS = P.nouns || [];
  const CYR = /[а-яёА-ЯЁ]/;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = new Map(), lower = new Map(), tpls = [], noun = new Map();
  const add = (k, v, soft) => {
    if (k.includes('{}')) {
      const lit = k.replace(/\{\}/g, '');
      tpls.push({ re: new RegExp('^' + k.split('{}').map(reEsc).join('(.*?)') + '$', 's'), v, len: lit.length, needNum: lit.trim().length < 6 && k.startsWith('{}') });
    } else {
      const nk = norm(k);
      if (soft && exact.has(nk)) return;
      exact.set(nk, v);
      if (!lower.has(nk.toLowerCase())) lower.set(nk.toLowerCase(), v);
    }
  };
  for (const k of Object.keys(X)) add(k, X[k]);
  // точку, «!», «?», многоточие и двоеточие в конце текста движок отрезает и ищет середину, поэтому ключ с ними — ещё и без них
  // (у перевода — тоже без своих: русские вернутся на место). Иначе шаблон с точкой в конце не совпал бы никогда.
  // Кавычку в конце не трогаем: в переводе она часто стоит не там («заменить «{}».» → “replace “{}” with.”)
  const TAIL = /[.!?…:;]+$/u;
  const tpl0 = new Set(Object.keys(X).filter((k) => k.includes('{}')));
  for (const k of Object.keys(X)) {
    const t = norm(k).match(TAIL);
    if (!t) continue;
    const k2 = norm(k).slice(0, -t[0].length);
    if (!/\p{L}/u.test(k2) || k2 in X || tpl0.has(k2)) continue;
    const v = X[k], vt = v.match(TAIL);
    add(k2, vt ? v.slice(0, -vt[0].length) : v, true);
  }
  tpls.sort((a, b) => b.len - a.len);
  // слово после числа. По числу (английский): [одна, несколько]; форма в форму (украинский): та же форма на языке
  // слово без числа рядом (число в соседнем теге): первая форма — одна штука, остальные — несколько
  const nounAlone = new Map();
  NOUNS.forEach(([ru, a, b]) => ru.forEach((w, i) => {
    if (Array.isArray(a)) { const t = a[i] != null ? a[i] : a[a.length - 1]; noun.set(w, () => t); nounAlone.set(w, t); }
    else { noun.set(w, (n) => (n === 1 ? a : b)); nounAlone.set(w, i ? b : a); }
  }));
  const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const dress = P.quotes ? (s) => s.replace(/«/g, '“').replace(/»/g, '”') : (s) => s;
  const over = P.over || 'over';
  const cache = new Map();

  function known(core) {
    if (exact.has(core)) return exact.get(core);
    const low = core.toLowerCase();
    if (lower.has(low)) { const v = lower.get(low); return core[0] !== low[0] ? up(v) : v; }
    const w = nounAlone.get(core);
    return w != null ? w : null;
  }
  // шаблон из словаря: {} — любое значение, оно тоже проходит через перевод
  function tpl(core) {
    for (const t of tpls) {
      const g = t.re.exec(core);
      if (!g) continue;
      if (t.needNum && !/^\s*\d/.test(g[1] || '')) continue; // «Девушка из Омска» — не «{} из {}»
      let i = 1;
      return t.v.replace(/\{\}/g, () => tr(g[i++] || ''));
    }
    return null;
  }
  // перевод текста без внешних знаков; null — такого в словаре нет (значит, это написал человек)
  function inner(core) {
    const k = known(core);
    if (k != null) return k;
    // число и слово: «5 оценок»
    let m = /^(\d[\d\s]*) (.+)$/.exec(core);
    if (m) {
      const n = +m[1].replace(/\s/g, ''), w = noun.get(m[2]);
      if (w) return `${m[1]} ${w(n)}`;
      const t = known(m[2]);
      if (t != null) return `${m[1]} ${t}`;
    }
    // «5 записей за 3 дня»
    m = /^(\d+) (\S+) за (\d+) (\S+)$/.exec(core);
    if (m && noun.has(m[2]) && noun.has(m[4])) return `${m[1]} ${noun.get(m[2])(+m[1])} ${over} ${m[3]} ${noun.get(m[4])(+m[3])}`;
    const tv = tpl(core);
    if (tv != null) return tv;
    // составное: части переводятся по отдельности
    if (core.includes(' · ')) {
      const p = core.split(' · '), o = p.map(tr);
      if (o.some((x, i) => x !== p[i])) return dress(o.join(' · '));
    }
    const c = core.indexOf(': ');
    if (c > 0) {
      const l = core.slice(0, c), r = core.slice(c + 2), lt = known(l), rt = tr(r);
      if (lt != null || rt !== r) return `${lt != null ? lt : l}: ${rt}`;
    }
    const d = core.indexOf(' — ');
    if (d > 0) {
      const l = known(core.slice(0, d));
      if (l != null) return `${l} — ${tr(core.slice(d + 3))}`;
    }
    // списки вроде «2010, фантастика, боевик»: только если известно всё
    if (core.includes(', ')) {
      const p = core.split(', '), o = p.map((x) => (CYR.test(x) ? known(x) : x));
      if (o.every((x) => x != null) && p.some((x) => CYR.test(x))) return o.join(', ');
    }
    // два предложения: только если второе переведено целиком (у языка на кириллице — если оно поменялось или было без русских букв)
    const dot = core.indexOf('. ');
    if (dot > 0) {
      const rest = core.slice(dot + 2), l = known(core.slice(0, dot)), r = tr(rest);
      if (l != null && (P.cyr ? !CYR.test(rest) || r !== rest : !CYR.test(r))) return `${l}. ${r}`;
    }
    return null;
  }
  function tr(raw) {
    // одна буква без пробелов вокруг — заглушка обложки или аватарки («И» от «Игры»), а не союз
    if (typeof raw !== 'string' || raw.length < 2 || !CYR.test(raw)) return raw;
    const hit = cache.get(raw);
    if (hit !== undefined) return hit;
    if (cache.size > 8000) cache.clear();
    let out = null;
    const whole = norm(raw);
    const direct = exact.get(whole);
    if (direct != null) out = raw.match(/^\s*/)[0] + direct + raw.match(/\s*$/)[0];
    else {
      // края отрезаются вместе с кавычкой: поэтому в словаре «Нажми на клетку или отметь «В планах» — без последней »
      const m = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u.exec(raw);
      const core = norm(m[2]);
      const t = core ? inner(core) : null;
      if (t != null) out = dress(m[1] + t + m[3]);
      // шаблон или список целиком, вместе с кавычками по краям («{}» в планах; «Оценка, Провёл «Царя Горы»»): без краёв
      // начало шаблона или последняя фраза списка теряются. Только когда больше ничего не нашлось: иначе «Цвет {}»
      // перебил бы точное «Цвет итогового балла» у строки с двоеточием
      else if (whole !== core) {
        const tw = tpl(whole);
        const t2 = tw != null ? tw : inner(whole);
        if (t2 != null) out = raw.match(/^\s*/)[0] + dress(t2) + raw.match(/\s*$/)[0];
      }
    }
    const res = out == null ? raw : out;
    cache.set(raw, res);
    // переведённое уже не трогаем: украинский тоже кириллица, и наблюдатель увидит его ещё раз
    if (res !== raw) cache.set(res, res);
    return res;
  }
  window.CasualLang.t = tr;

  // ---------- страница: текст и подписи, в том числе то, что появится позже ----------
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'aria-valuetext'];
  const SKIP_TAG = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
  // написанное людьми и журнал «Что нового» не трогаем, даже если слово случайно есть в словаре
  const SKIP = '.pv-cap, .cm-text, .rx-list span, .adm-text, .site-ann span, .wn-body, .cm-meta b, .adm-who b, .fr-who b, .tl-txt, .tl-lab, .tl-tile b, .ch-txt, .ch-who';
  function text(n) {
    const v = n.nodeValue;
    // шкала в подписях: 7,5–10 → 7.5–10
    if (P.dot && v && /^\s*\d+(,\d+)?[–-]\d+(,\d+)?\s*$/.test(v) && v.includes(',')) { n.nodeValue = v.replace(/,/g, '.'); return; }
    if (!v || !CYR.test(v)) return;
    const p = n.parentElement;
    if (!p || SKIP_TAG.has(p.tagName)) return;
    const o = tr(v);
    if (o !== v && !p.closest(SKIP)) n.nodeValue = o;
  }
  function attrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !CYR.test(v)) continue;
      const o = tr(v);
      if (o !== v) el.setAttribute(a, o);
    }
  }
  function scan(root) {
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1 || SKIP_TAG.has(root.tagName)) return;
    attrs(root);
    root.querySelectorAll('[title],[placeholder],[aria-label],[alt],[aria-valuetext]').forEach(attrs);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) text(n);
  }
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(scan);
      else if (m.type === 'characterData') text(m.target);
      else if (m.type === 'attributes' && m.target.nodeType === 1) attrs(m.target);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  scan(document.documentElement);

  // ---------- то, что не лежит в разметке ----------
  // даты и числа на языке страницы: страницы пишут 'ru-RU'
  const loc = P.locale || 'en-GB';
  const toLoc = (l) => (l === 'ru-RU' || l === 'ru' ? loc : l);
  [[Date.prototype, 'toLocaleDateString'], [Date.prototype, 'toLocaleTimeString'], [Date.prototype, 'toLocaleString'], [Number.prototype, 'toLocaleString']].forEach(([o, m]) => {
    const f = o[m];
    o[m] = function (l, opt) { return f.call(this, toLoc(l), opt); };
  });
  // картинки с итогом и тир-листом рисуются на холсте: подписи проходят через тот же словарь
  if (window.CanvasRenderingContext2D) {
    const C = CanvasRenderingContext2D.prototype, ft = C.fillText, mt = C.measureText;
    C.fillText = function (s, ...a) { return ft.call(this, tr(s), ...a); };
    C.measureText = function (s) { return mt.call(this, tr(s)); };
  }
  // системные окна и копирование итога текстом
  const conf = window.confirm;
  window.confirm = (s) => conf.call(window, tr(s));
  const clip = navigator.clipboard;
  if (clip && clip.writeText) {
    const wt = clip.writeText.bind(clip);
    clip.writeText = (s) => wt(String(s).split('\n').map(tr).join('\n'));
  }
  // подписи, которые заданы в самих стилях
  if (P.css) {
    const st = document.createElement('style');
    st.textContent = P.css;
    document.head.appendChild(st);
  }
  // большая надпись на главной собрана по буквам
  if (P.wordmark) {
    const hero = () => {
      let i = 0;
      document.querySelectorAll('.wordmark .word').forEach((w, k) => {
        w.innerHTML = [...(P.wordmark[k] || '')].map((c) => `<span class="ch" style="--i:${i++}">${c}</span>`).join('');
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hero); else hero();
  }
})();
