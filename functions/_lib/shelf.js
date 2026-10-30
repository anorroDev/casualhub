// Казуал Хаб: общие функции сервера для оценок (полка пользователя).
// Папка _lib не становится адресом сайта: её подключают API (functions/api) и страница отзыва (functions/r).

export const RID_RE = /^[\w.-]{1,80}$/;
// ---------- чужие оценки: только ожидаемые типы, чтобы в страницу друга не попал код ----------
// управляющие символы и «переворот» направления текста (U+202E и родня): ими подделывают, как выглядит имя или ссылка
export const SPOOF_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
export const clip = (v, n) => String(v == null ? '' : v).replace(SPOOF_RE, '').slice(0, n);
export const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));
export const SAFE_URL = /^https?:\/\/[^\s"'<>()\\]{1,1500}$/;
// любое значение: строки, числа, да/нет и вложенные объекты/списки неглубоко; функции и прочее отбрасываются
// ссылка на трек у оценки: только сами сервисы
export const MUSIC_LINK_RE = /^https:\/\/(open\.spotify\.com|(www\.|music\.)?youtube\.com|youtu\.be|soundcloud\.com)\/[^\s"'<>()\\]{1,300}$/;
export function plain(v, depth) {
  if (v == null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v.slice(0, 20000);
  if (depth > 3) return null;
  if (Array.isArray(v)) return v.slice(0, 400).map((x) => plain(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    let k = 0;
    for (const key of Object.keys(v)) { if (k++ > 80) break; if (key === '__proto__' || key === 'constructor') continue; o[key.slice(0, 60)] = plain(v[key], depth + 1); }
    return o;
  }
  return null;
}
export function cleanRating(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !r.id || r.id.length > 120) return null;
  const o = plain(r, 0);
  for (const k of ['name', 'meta', 'note', 'catLabel', 'catName', 'status', 'pros', 'cons', 'artist']) if (o[k] != null) o[k] = clip(o[k], k === 'note' || k === 'pros' || k === 'cons' ? 8000 : 300);
  o.total = numOrNull(o.total);
  if (o.total != null) o.total = Math.max(0, Math.min(10, o.total));
  o.fav = !!o.fav;
  o.scores = Array.isArray(o.scores) ? o.scores.filter((x) => x && typeof x === 'object' && !Array.isArray(x)).slice(0, 60).map((x) => ({
    ...x, name: clip(x.name, 120), v: Math.max(0, Math.min(10, numOrNull(x.v) || 0)), note: x.note != null ? clip(x.note, 2000) : undefined,
    w: x.w != null ? numOrNull(x.w) : undefined,
  })) : [];
  if (o.photo != null) {
    const p = o.photo && typeof o.photo === 'object' ? o.photo : {};
    const url = typeof p.url === 'string' && SAFE_URL.test(p.url) ? p.url : '';
    const remote = typeof p.remote === 'string' ? clip(p.remote, 80) : p.remote === true;
    o.photo = url || remote ? { ...(url ? { url } : {}), ...(remote ? { remote } : {}), w: Math.max(0, numOrNull(p.w) || 0), h: Math.max(0, numOrNull(p.h) || 0) } : null;
    if (!o.photo) delete o.photo;
  }
  if (o.link != null && !(typeof o.link === 'string' && MUSIC_LINK_RE.test(o.link))) delete o.link;
  // artistAva — отпечаток фото исполнителя (короткая строка), не адрес
  if (o.artistAva != null && !(typeof o.artistAva === 'string' && /^[\w.-]{0,80}$/.test(o.artistAva))) delete o.artistAva;
  return o;
}

export const stampOf = (r) => +new Date(r.updatedAt || r.createdAt || 0) || 0;
export function readShelf(row) {
  if (!row) return { ratings: [], deleted: [] };
  const d = JSON.parse(row.data);
  if (Array.isArray(d)) return { ratings: d, deleted: [] }; // старый формат: просто список
  const cats = d.cats && Array.isArray(d.cats.items) && Number.isFinite(+d.cats.at) ? d.cats : null;
  const profile = d.profile && Array.isArray(d.profile.hide) && Number.isFinite(+d.profile.at) ? d.profile : null;
  const sticker = d.sticker && typeof d.sticker.src === 'string' && Number.isFinite(+d.sticker.at) ? d.sticker : null;
  const layout = d.layout && Array.isArray(d.layout.showcases) && Number.isFinite(+d.layout.at) ? d.layout : null;
  const follow = d.follow && Array.isArray(d.follow.ids) && Number.isFinite(+d.follow.at) ? d.follow : null;
  return { ratings: Array.isArray(d.ratings) ? d.ratings : [], deleted: Array.isArray(d.deleted) ? d.deleted : [], cats, profile, sticker, layout, follow };
}
