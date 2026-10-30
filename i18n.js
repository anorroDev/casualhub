/* Казуал Хаб: язык сайта. Основной — русский, английский включается в меню ☰ и запоминается в этом браузере.
   Перевод лежит в /lang-en.js и грузится только у тех, кто выбрал английский: остальным ничего лишнего качать не нужно.
   Кука casualhub_lang нужна только серверу: страница отзыва /r/<код> и письма с кодом выходят на выбранном языке. */
(() => {
  const KEY = 'casualhub.lang.v1';
  let lang = 'ru';
  try { if (localStorage.getItem(KEY) === 'en') lang = 'en'; } catch (e) {}
  const cookie = (v) => { document.cookie = `casualhub_lang=${v}; Path=/; Max-Age=${v === 'en' ? 31536000 : 0}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; };
  window.CasualLang = {
    lang,
    set(v) {
      if (v !== 'en') v = 'ru';
      try { localStorage.setItem(KEY, v); } catch (e) {}
      cookie(v);
      location.reload();
    },
  };
  document.documentElement.lang = lang;
  if (lang === 'en') {
    cookie('en');
    // до первой отрисовки: страница сразу появляется на английском, без мелькания русского
    document.write('<script src="/lang-en.js"><\/script>');
  }
})();
