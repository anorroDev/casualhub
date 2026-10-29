/* Фото оценок лежат в IndexedDB браузера: там места много (сотни мегабайт), а в localStorage — около 5 МБ на весь сайт,
   и одно фото там занимало до мегабайта. В самой оценке остаётся только ссылка «ph_<отпечаток>.<полный отпечаток>».
   Первая часть — тот же отпечаток, что Мнение отправляет на сервер вместо фото (friends.js), вторая — по всей картинке,
   чтобы у разных фото ключи точно не совпали. */
(() => {
  const DB = 'casualhub', STORE = 'photos';
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = rq.onblocked = () => res(null);
    } catch (e) { res(null); } // приватный режим или запрет: фото останутся прямо в оценке, как раньше
  }));
  // одна транзакция: fn получает хранилище и возвращает запрос (или ничего), ответ — его результат
  const tx = async (mode, fn) => {
    const db = await open();
    if (!db) return undefined;
    return new Promise((res) => {
      try {
        const t = db.transaction(STORE, mode);
        const rq = fn(t.objectStore(STORE));
        t.oncomplete = () => res(rq && 'result' in rq ? rq.result : true);
        t.onerror = t.onabort = () => res(undefined);
      } catch (e) { res(undefined); }
    });
  };
  // быстрый отпечаток (FNV-1a по каждому 7-му символу и длина) — как fp в friends.js и avaFp в Мнении
  const fp = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
  };
  const full = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  };
  const KEY_RE = /^ph_[0-9a-z]+\.[0-9a-z]+\.[0-9a-z]+$/;
  window.CasualPhotos = {
    ready: open().then(Boolean),
    keyOf: (data) => 'ph_' + fp(data) + '.' + full(data),
    isKey: (k) => typeof k === 'string' && KEY_RE.test(k),
    // отпечаток для сервера (как fp в friends.js): первые две части ключа
    remoteOf: (k) => k.slice(3).split('.').slice(0, 2).join('.'),
    get: (key) => tx('readonly', (st) => st.get(key)),
    // много сразу: { ключ: картинка } за одну транзакцию
    async getMany(keys) {
      const out = {};
      const list = [...new Set(keys)].filter((k) => KEY_RE.test(k));
      if (!list.length) return out;
      await tx('readonly', (st) => { list.forEach((k) => { const rq = st.get(k); rq.onsuccess = () => { if (typeof rq.result === 'string') out[k] = rq.result; }; }); });
      return out;
    },
    put: (key, data) => tx('readwrite', (st) => st.put(data, key)),
  };
})();
