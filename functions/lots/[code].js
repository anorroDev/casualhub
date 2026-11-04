// Казуал Хаб: страница сбора по ссылке /lots/<код>. Сама страница та же, предпросмотр свой у каждого сбора.
import { pageWithMeta } from '../_lib/page-meta.js';

const CODE_RE = /^[A-Za-z0-9]{12}$/;
const KIND = { game: 'игры', movie: 'фильмы и сериалы', anime: 'аниме', book: 'книги', music: 'музыка', any: 'что угодно' };
const lotWord = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'лот' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'лота' : 'лотов'; };

export async function onRequest({ request, env, params, next }) {
  const code = String(params.code || '');
  // остальное здесь — файлы страницы, например /lots/app.js
  if (!CODE_RE.test(code) || (request.method !== 'GET' && request.method !== 'HEAD')) return next();
  return pageWithMeta(request, env, '/lots/', async () => {
    const room = await env.DB.prepare('SELECT r.title, r.kind, r.per_user, r.ends_at, r.closed, r.live, u.username AS owner, u.banned AS banned, (SELECT COUNT(*) FROM lots l WHERE l.room_id = r.id) AS n FROM lot_rooms r LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?').bind(code).first();
    if (!room || room.banned) return null;
    let winner = '';
    try { winner = String((JSON.parse(room.live || 'null') || {}).winner.n || ''); } catch (e) {}
    const who = room.owner || 'Ведущий';
    const title = room.title ? room.title + ' · Сбор лотов' : 'Сбор лотов · Казуал Хаб';
    if (winner) {
      // победитель виден прямо в карточке ссылки; «?w=…» — свежий адрес для мессенджера, который запомнил ссылку до победы
      const lot = await env.DB.prepare('SELECT l.img, u.username AS author FROM lots l LEFT JOIN users u ON u.id = l.user_id WHERE l.room_id = ? AND l.name = ?').bind(code, winner).first();
      const u = new URL(request.url), w = /^\?w=[a-z0-9]{1,13}$/.test(u.search) ? u.search : '';
      return {
        title: `🏆 ${winner} — победитель${room.title ? ' · ' + room.title : ''}`,
        description: `Аукцион «${room.title || 'Сбор лотов'}» закончился: победил ${winner}${lot && lot.author ? `, лот от ${lot.author}` : ''}. Вёл сбор ${who}.`,
        image: lot && /^https:\/\//.test(lot.img || '') ? lot.img : '',
        url: u.origin + u.pathname + w,
      };
    }
    const open = !room.closed && (!room.ends_at || Date.now() < room.ends_at);
    const got = `Уже ${room.n} ${lotWord(room.n)}.`;
    return {
      title,
      description: open
        ? `${who} собирает лоты: ${KIND[room.kind] || KIND.any}. Можно добавить ${room.per_user} ${lotWord(room.per_user)} и смотреть, как крутится колесо. ${got}`
        : `${who} закончил сбор лотов: ${KIND[room.kind] || KIND.any}. ${got} Здесь видно, как крутится колесо.`,
      image: '',
    };
  });
}
