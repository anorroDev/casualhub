/* Казуал Хаб: язык сайта. Основной — русский; английский и украинский включаются в Настройках (раздел «Внешний вид», settings.js)
   и запоминаются в этом браузере. Перевод — словарь /lang-en.js или /lang-uk.js и общий движок /lang-core.js: грузятся только
   у тех, кто выбрал другой язык, остальным ничего лишнего качать не нужно.
   Кука casualhub_lang нужна только серверу: страница отзыва /r/<код> и письма с кодом выходят на выбранном языке. */
(() => {
  const KEY = 'casualhub.lang.v1';
  const LANGS = ['ru', 'uk', 'en'];
  let lang = 'ru';
  try { const v = localStorage.getItem(KEY); if (LANGS.includes(v)) lang = v; } catch (e) {}
  const cookie = (v) => { document.cookie = `casualhub_lang=${v}; Path=/; Max-Age=${v !== 'ru' ? 31536000 : 0}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; };
  window.CasualLang = {
    lang,
    list: LANGS,
    set(v) {
      if (!LANGS.includes(v)) v = 'ru';
      try { localStorage.setItem(KEY, v); } catch (e) {}
      cookie(v);
      location.reload();
    },
  };
  document.documentElement.lang = lang;
  if (lang !== 'ru') {
    cookie(lang);
    // до первой отрисовки: страница сразу появляется на выбранном языке, без мелькания русского
    document.write(`<script src="/lang-${lang}.js"><\/script><script src="/lang-core.js"><\/script>`);
  }
})();
