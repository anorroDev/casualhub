// Казуал Хаб: резервные копии базы — BackupDO, одна на сайт (idFromName('backup')), живёт в Worker'е casualhub-rt.
// Раз в сутки cron (scheduled в rt/worker.js) зовёт /start, и комната по будильникам переписывает D1 в R2 (привязка BACKUPS).
// За один будильник — не больше 40 запросов к D1 и около 8 МБ текста: кусок уходит в R2, следующий будильник берёт дальше.
// Так копия укладывается в лимиты и бесплатного плана (50 запросов к D1 за вызов, у будильника 30 с процессора),
// какой бы большой ни была база. Это не мгновенный снимок: строка, которая поменялась, пока шла копия, попадёт в неё
// старой или новой.
//
// Формат — JSON Lines, запись на строку. Куски backups/<id>/part-00000.ndjson, part-00001… склеиваются по порядку:
//   {"casualhub":"backup","v":1,"id","at","schema":[{type,name,tbl_name,sql}]} — схема всех таблиц и индексов, и тех, что без строк
//   {"table":"users","columns":["rowid","id",…]} — за ней строки этой таблицы массивами [rowid, значение, …]
//   {"end":true,"rows":{"users":12,…}} — последняя строка; если её нет, файл оборван
// BLOB (сейчас в базе их нет) пишется как {"b64":"…"}. У таблиц из SKIP в копии только схема, без строк.
// Восстановление: node rt/restore.mjs копия.ndjson > restore.sql, дальше README, раздел «Резервные копии».
//
// Без привязки BACKUPS на всё отвечает {off: true} с заголовком x-backup-off.
//   POST /start      — начать копию (cron или админ, кто — в x-backup-by); если копия уже идёт, ответит {running: true}
//   GET  /status     — {runs: готовые копии, новые сверху; run: идущая или null; error: последняя неудача; keep}
//   GET  /export?id= — копия одним файлом (без id — последняя)

// входы, лимиты, одноразовые ссылки из писем, «кто на сайте» и кэш IMDb: после восстановления всё это нарастёт заново
export const SKIP = new Set(['sessions', 'admin_sessions', 'attempts', 'mail_tokens', 'presence', 'imdb_info', 'imdb_find']);
const MAX_Q = 40; // запросов к D1 за будильник: на бесплатном плане за вызов можно 50
const PART = 8e6; // символов в куске (base64 и латиница — по байту на символ)
const PAGE = 3e6; // символов на одну выборку: сколько строк брать, считается по самой длинной строке таблицы
const MAX_ROWS = 2000;
const SLICE_MS = 20e3; // будильник не дольше 20 секунд
const GAP_MS = 200; // пауза между будильниками
const STUCK_MS = 3600e3; // копия час без движения — зависла: следующий /start начнёт заново
const TRIES = 5; // ошибок подряд, после которых копия бросается
const FIRST = -Number.MAX_SAFE_INTEGER; // rowid «до первой строки»
const LS = String.fromCharCode(0x2028), SEP_RE = new RegExp('[' + LS + String.fromCharCode(0x2029) + ']', 'g'); // кодами: в исходнике сам символ стал бы концом строки

const partKey = (id, n) => `backups/${id}/part-${String(n).padStart(5, '0')}.ndjson`;
const quote = (name) => '"' + String(name).replace(/"/g, '""') + '"';
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const cell = (v) => (v instanceof ArrayBuffer ? { b64: b64(new Uint8Array(v)) }
  : ArrayBuffer.isView(v) ? { b64: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  : Array.isArray(v) ? { b64: b64(Uint8Array.from(v)) } : v);
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export class BackupDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  keep() { const n = parseInt(this.env.BACKUP_KEEP, 10); return n >= 1 && n <= 90 ? n : 14; }
  async fetch(request) {
    // R2 не подключено — копий нет. Не 503: такой ответ привязка (по крайней мере локальная) принимает за обрыв связи
    if (!this.env.BACKUPS) return new Response('{"off":true}', { headers: { 'content-type': 'application/json; charset=utf-8', 'x-backup-off': '1' } });
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/start') return json(await this.start(request.headers.get('x-backup-by') || 'cron'));
    if (url.pathname === '/status') return json(await this.status());
    if (url.pathname === '/export') return this.export(url.searchParams.get('id') || '');
    return new Response('Not found', { status: 404 });
  }
  async start(by) {
    const now = Date.now(), cur = await this.ctx.storage.get('run');
    if (cur && now - cur.moved < STUCK_MS) return { ok: true, running: true, id: cur.id };
    if (cur) await this.wipe(cur.id, cur.part); // зависла: её куски не нужны
    const runs = (await this.ctx.storage.get('runs')) || [];
    let id = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
    if (runs.some((r) => r.id === id)) id += '-' + (now % 1000);
    const run = { id, at: now, moved: now, by: String(by).slice(0, 40), started: false, tables: [], ti: 0, cols: null, after: FIRST, limit: 1, div: 1, part: 0, sizes: [], bytes: 0, rows: {}, fails: 0 };
    await this.ctx.storage.put('run', run);
    await this.ctx.storage.setAlarm(now + 50);
    return { ok: true, id };
  }
  async alarm() {
    const run = await this.ctx.storage.get('run');
    if (!run || !this.env.BACKUPS) return;
    try {
      await this.slice(run);
    } catch (e) {
      // run в памяти мог уйти вперёд, а кусок в R2 не лёг: продолжаем с того, что было сохранено до этого будильника
      const msg = String((e && e.message) || e).slice(0, 300);
      console.error('backup', run.id, msg);
      const saved = (await this.ctx.storage.get('run')) || run;
      saved.fails = (saved.fails || 0) + 1;
      if (saved.fails >= TRIES) { await this.fail(saved, msg); return; }
      // вдруг не прошла слишком большая выборка: дальше по этой таблице вдвое меньше (а если таблица ещё не начата — при начале)
      if (saved.cols) saved.limit = Math.max(1, Math.floor(saved.limit / 2));
      else saved.div = Math.min(64, (saved.div || 1) * 2);
      await this.ctx.storage.put('run', saved);
      await this.ctx.storage.setAlarm(Date.now() + 30e3 * saved.fails);
    }
  }
  async slice(run) {
    const db = this.env.DB, t0 = Date.now(), out = [];
    let size = 0, q = 0;
    // U+2028 и U+2029 JSON оставляет как есть, а часть читалок (readline в Node) считает их концом строки — экранируем
    const put = (v) => { const s = JSON.stringify(v).replace(SEP_RE, (c) => (c === LS ? '\\u2028' : '\\u2029')) + '\n'; out.push(s); size += s.length; };
    if (!run.started) {
      // схема всех таблиц и индексов, кроме служебных таблиц SQLite и D1
      const { results } = await db.prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite~_%' ESCAPE '~' AND name NOT LIKE '~_cf~_%' ESCAPE '~' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid"
      ).all();
      q++;
      run.tables = results.filter((r) => r.type === 'table' && !SKIP.has(r.name)).map((r) => r.name);
      run.started = true;
      put({ casualhub: 'backup', v: 1, id: run.id, at: run.at, schema: results });
    }
    // начало таблицы стоит три запроса, поэтому новый круг — только пока до MAX_Q остаётся хотя бы три
    while (run.ti < run.tables.length && q <= MAX_Q - 3 && size < PART && Date.now() - t0 < SLICE_MS) {
      const t = run.tables[run.ti], name = quote(t);
      if (!run.cols) {
        // все таблицы сайта обычные, с rowid: по нему копия и идёт, и восстановление (rt/restore.mjs) дописывает длинные значения
        run.cols = (await db.prepare(`PRAGMA table_info(${name})`).all()).results.map((c) => c.name);
        q++;
        if (!run.cols.length) { run.ti++; run.cols = null; continue; } // таблицу удалили, пока шла копия
        const len = run.cols.map((c) => `IFNULL(length(${quote(c)}), 0)`).join(' + ');
        const st = await db.prepare(`SELECT IFNULL(MAX(${len}), 0) AS mx FROM ${name}`).first();
        q++;
        run.limit = Math.max(1, Math.min(MAX_ROWS, Math.floor(PAGE / Math.max(200, st.mx) / (run.div || 1))));
        run.after = FIRST;
        run.rows[t] = 0;
        put({ table: t, columns: ['rowid', ...run.cols] });
      }
      const rows = await db.prepare(`SELECT rowid, ${run.cols.map(quote).join(', ')} FROM ${name} WHERE rowid > ?1 ORDER BY rowid LIMIT ${run.limit}`).bind(run.after).raw();
      q++;
      for (const r of rows) put(r.map(cell));
      run.rows[t] += rows.length;
      if (rows.length < run.limit) { run.ti++; run.cols = null; } else run.after = rows[rows.length - 1][0];
    }
    const done = run.ti >= run.tables.length;
    if (done) put({ end: true, rows: run.rows });
    if (out.length) {
      const obj = await this.env.BACKUPS.put(partKey(run.id, run.part), out.join(''), { httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' } });
      run.sizes.push(obj.size);
      run.bytes += obj.size;
      run.part++;
    }
    run.fails = 0;
    run.div = 1;
    run.moved = Date.now();
    if (done) { await this.finish(run); return; }
    await this.ctx.storage.put('run', run);
    await this.ctx.storage.setAlarm(Date.now() + GAP_MS);
  }
  async finish(run) {
    const runs = (await this.ctx.storage.get('runs')) || [];
    runs.unshift({ id: run.id, at: run.at, done: Date.now(), by: run.by, bytes: run.bytes, parts: run.sizes, rows: run.rows });
    const old = runs.splice(this.keep());
    await this.ctx.storage.put('runs', runs);
    await this.ctx.storage.delete(['run', 'error']);
    for (const r of old) await this.wipe(r.id, r.parts.length);
  }
  async fail(run, msg) {
    await this.ctx.storage.put('error', { at: Date.now(), id: run.id, msg });
    await this.ctx.storage.delete('run');
    await this.wipe(run.id, run.part);
  }
  async wipe(id, n) {
    const keys = Array.from({ length: n }, (_, i) => partKey(id, i));
    for (let i = 0; i < keys.length; i += 1000) await this.env.BACKUPS.delete(keys.slice(i, i + 1000));
  }
  async status() {
    const got = await this.ctx.storage.get(['runs', 'run', 'error']);
    const runs = got.get('runs') || [], run = got.get('run');
    return {
      keep: this.keep(),
      runs: runs.map((r) => ({ id: r.id, at: r.at, done: r.done, by: r.by, bytes: r.bytes, rows: sum(r.rows), tables: Object.keys(r.rows).length })),
      run: run ? { id: run.id, at: run.at, by: run.by, table: run.tables[run.ti] || null, step: run.ti, of: run.tables.length, rows: sum(run.rows), bytes: run.bytes, fails: run.fails } : null,
      error: got.get('error') || null,
    };
  }
  async export(id) {
    const runs = (await this.ctx.storage.get('runs')) || [];
    const r = id ? runs.find((x) => x.id === id) : runs[0];
    if (!r) return json({ error: 'no backup' }, 404);
    // куски по порядку в один поток; длина известна заранее, поэтому у загрузки виден размер
    const { readable, writable } = new FixedLengthStream(r.parts.reduce((a, b) => a + b, 0));
    (async () => {
      for (let i = 0; i < r.parts.length; i++) {
        const o = await this.env.BACKUPS.get(partKey(r.id, i));
        if (!o) throw new Error('нет куска ' + i);
        await o.body.pipeTo(writable, { preventClose: true });
      }
      await writable.close();
    })().catch((e) => { console.error('backup export', r.id, e && e.message); writable.abort(e).catch(() => {}); });
    return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': `attachment; filename="casualhub-${r.id}.ndjson"`, 'x-backup-id': r.id } });
  }
}
