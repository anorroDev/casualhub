// Казуал Хаб: копия базы (JSON Lines из вкладки «Копии» в админке или из R2) → SQL для wrangler d1 execute.
//   node rt/restore.mjs casualhub-2026-11-11T01-00-00Z.ndjson restore.sql
//   node rt/restore.mjs папка-с-кусками restore.sql — куски part-00000.ndjson… из R2, если админка не открывается
//   npx wrangler d1 execute casualhub --remote --file restore.sql
// Формат копии — в начале rt/backup.js. Таблицы и индексы создаются, если их нет; строки пишутся INSERT OR REPLACE
// с прежним rowid, поэтому файл можно прогнать ещё раз. Одна команда в D1 — не длиннее 100 КБ, а фото бывают до 2 МБ:
// длинные значения сначала пишутся пустыми и дописываются кусками — UPDATE … SET поле = поле || '…' WHERE rowid = ….
// Копия должна быть целой: в конце строка {"end":true}, и строк каждой таблицы столько, сколько в ней записано.
// Оборванную копию скрипт переводит только с --partial. SQL пишется в файл, а не в консоль (в PowerShell «>» дал бы
// UTF-16), сначала как restore.sql.part: настоящее имя он получает, только когда всё проверено.
import fs from 'node:fs';
import { once } from 'node:events';

const MAX_STMT = 90000; // байт в команде: предел D1 — 100 000
const LONG = 8000; // строка длиннее (в кавычках, в байтах) пишется отдельными командами
const args = process.argv.slice(2), partial = args.includes('--partial');
const [src, dst] = args.filter((a) => !a.startsWith('--'));
if (!src || !dst) { console.error('Как запустить: node rt/restore.mjs копия.ndjson|папка-с-кусками restore.sql [--partial]'); process.exit(2); }
class Stop extends Error {}
const stop = (msg) => { throw new Stop(msg); };

const q = (name) => '"' + String(name).replace(/"/g, '""') + '"';
const lit = (s) => "'" + s.replace(/'/g, "''") + "'";
const bytes = (s) => Buffer.byteLength(s);
const val = (v) => (v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL')
  : typeof v === 'boolean' ? (v ? '1' : '0')
  : typeof v === 'object' && typeof v.b64 === 'string' ? "X'" + Buffer.from(v.b64, 'base64').toString('hex') + "'"
  : lit(String(v)));
const ifNot = (sql) => sql.replace(/^\s*CREATE\s+(UNIQUE\s+)?(TABLE|INDEX|VIEW|TRIGGER)\s+(?!IF\s+NOT\s+EXISTS\b)/i, (m, u, k) => `CREATE ${u ? 'UNIQUE ' : ''}${k.toUpperCase()} IF NOT EXISTS `);
// куски строки, каждый в кавычках не длиннее MAX_STMT - 1000 байт; суррогатную пару (эмодзи) не разрывает
function pieces(s) {
  const out = [], room = MAX_STMT - 1000;
  for (let i = 0; i < s.length;) {
    let n = Math.min(s.length - i, room - 2);
    for (;;) {
      let end = i + n;
      if (end < s.length && end - i > 1 && /[\uD800-\uDBFF]/.test(s[end - 1])) end--;
      const p = s.slice(i, end);
      if (bytes(lit(p)) <= room || end - i <= 1) { out.push(p); i = end; break; }
      n = Math.max(1, Math.floor(n / 2));
    }
  }
  return out;
}
// строка таблицы → команды: INSERT с прежним rowid, длинные строки — пустыми, потом дописываются кусками
function rowSql(table, cols, row) {
  const T = q(table), parts = row.map(val), later = [];
  const defer = (min) => row.forEach((v, i) => { if (i > 0 && typeof v === 'string' && !later.includes(i) && bytes(parts[i]) > min) { later.push(i); parts[i] = "''"; } });
  defer(LONG);
  if (bytes(parts.join(', ')) > MAX_STMT - 2000) defer(200); // много средних полей в одной строке
  const out = [`INSERT OR REPLACE INTO ${T} (${cols.map(q).join(', ')}) VALUES (${parts.join(', ')});`];
  for (const i of later) for (const p of pieces(row[i])) out.push(`UPDATE ${T} SET ${q(cols[i])} = ${q(cols[i])} || ${lit(p)} WHERE rowid = ${row[0]};`);
  return out;
}
// строки файлов подряд: только по \n (readline в Node режет ещё и по U+2028, а он бывает внутри текста)
async function* fileLines(files) {
  let rest = '';
  for (const file of files) {
    for await (const chunk of fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
      rest += chunk;
      let from = 0, i;
      while ((i = rest.indexOf('\n', from)) >= 0) { yield rest.slice(from, rest[i - 1] === '\r' ? i - 1 : i); from = i + 1; }
      rest = rest.slice(from);
    }
  }
  if (rest) yield rest;
}
// копия — один файл (из админки) или папка с кусками из R2: part-00000.ndjson, part-00001.ndjson… по порядку
function inputs() {
  if (!fs.existsSync(src)) stop('нет файла ' + src);
  if (!fs.statSync(src).isDirectory()) return [src];
  const parts = fs.readdirSync(src).filter((f) => /^part-\d{5}\.ndjson$/.test(f)).sort();
  if (!parts.length) stop(`в папке ${src} нет кусков part-00000.ndjson…`);
  parts.forEach((f, i) => { if (f !== `part-${String(i).padStart(5, '0')}.ndjson`) stop(`нет куска part-${String(i).padStart(5, '0')}.ndjson: скачай все куски подряд`); });
  return parts.map((f) => src.replace(/[\\/]+$/, '') + '/' + f);
}

const part = dst + '.part';
let out = null;
async function main() {
  const files = inputs();
  out = fs.createWriteStream(part, { encoding: 'utf8' });
  let stmts = 0, longest = 0, head = null, table = null, cols = null, end = null, ln = 0;
  const write = async (s) => { stmts++; longest = Math.max(longest, bytes(s)); if (!out.write(s + '\n')) await once(out, 'drain'); };
  const seen = {}, indexes = [];
  for await (const line of fileLines(files)) {
    ln++;
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch (e) {
      // скачивание оборвалось посреди строки: с --partial берём всё до неё, проверка ниже скажет, чего не хватает
      if (partial && head) break;
      stop(`строка ${ln} — не JSON: копия оборвана или повреждена`);
    }
    if (!head) {
      if (!rec || rec.casualhub !== 'backup' || rec.v !== 1 || !Array.isArray(rec.schema)) stop('это не копия Казуал Хаба: первая строка должна быть {"casualhub":"backup","v":1,…}');
      head = rec;
      out.write(`-- Казуал Хаб: восстановление из копии ${rec.id} (${new Date(rec.at).toISOString()})\n`);
      await write('PRAGMA defer_foreign_keys = true;');
      for (const s of rec.schema) { if (s.type === 'table') await write(ifNot(s.sql) + ';'); else indexes.push(s); }
      continue;
    }
    if (Array.isArray(rec)) {
      if (!table) stop(`строка ${ln}: значения до названия таблицы`);
      if (rec.length !== cols.length) stop(`строка ${ln}: в ${table} ${cols.length} полей, а пришло ${rec.length}`);
      for (const st of rowSql(table, cols, rec)) await write(st);
      seen[table]++;
    } else if (rec.table) {
      table = rec.table; cols = rec.columns; seen[table] = seen[table] || 0;
    } else if (rec.end) { end = rec; break; }
  }
  if (!head) stop('файл пустой');
  // индексы — после строк: так вставка быстрее, а уникальные уже ничему не мешают
  for (const s of indexes) await write(ifNot(s.sql) + ';');
  out.end();
  await once(out, 'finish');

  const bad = end ? [] : ['нет последней строки {"end":true}: копия оборвана'];
  if (end) for (const t of new Set([...Object.keys(end.rows || {}), ...Object.keys(seen)])) if ((end.rows[t] || 0) !== (seen[t] || 0)) bad.push(`${t}: в копии ${seen[t] || 0} строк, а должно быть ${end.rows[t] || 0}`);
  if (bad.length && !partial) stop(bad.join('; ') + '. Если всё равно нужно то, что есть, — запусти с --partial');
  fs.renameSync(part, dst);
  for (const m of bad) console.error('restore: внимание — ' + m);
  const total = Object.values(seen).reduce((a, b) => a + b, 0);
  console.error(`restore: копия ${head.id}: ${Object.keys(seen).length} таблиц, ${total} строк → ${dst}: ${stmts} команд, самая длинная ${longest} байт`);
}
try {
  await main();
} catch (e) {
  // недописанный SQL не оставляем: его легко принять за целый и запустить
  if (out) { if (!out.closed) { out.destroy(); await once(out, 'close').catch(() => {}); } try { fs.unlinkSync(part); } catch (x) {} }
  console.error('restore: ' + (e instanceof Stop ? e.message : (e && e.stack) || e));
  process.exit(1);
}
