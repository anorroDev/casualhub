-- Казуал Хаб: база для друзей (Cloudflare D1).
-- Применить один раз: npx wrangler d1 execute casualhub --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,          -- ник, как его видят все; может совпадать с чужим
  uname TEXT NOT NULL UNIQUE,      -- @юзернейм: латиница, цифры, _ и .; по нему вход и заявки в друзья
  pass_hash TEXT NOT NULL,         -- PBKDF2-SHA256, пароль в открытом виде не хранится
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  email TEXT,                      -- почта в нижнем регистре, по ней тоже можно войти
  nkey TEXT,                       -- ник в нижнем регистре: вход старым ником, пока он ни у кого не совпадает
  last_seen INTEGER,               -- когда последний раз был на сайте (для «в сети»)
  hide_online INTEGER              -- 1: не показывать друзьям, что в сети
);
CREATE INDEX IF NOT EXISTS users_seen ON users(last_seen);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);
-- Сервер сам создаёт эти таблицы и добавляет колонки email и nkey при первом запросе,
-- так что этот файл нужен только для ручной установки.

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,     -- SHA-256 от токена, сам токен лежит только у пользователя
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Пара всегда хранится как (a, b) с a < b; status: pending или accepted
CREATE TABLE IF NOT EXISTS friendships (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE INDEX IF NOT EXISTS friendships_b ON friendships(b);

-- Фото оценок: ключ «id пользователя:id оценки», data URL картинки
CREATE TABLE IF NOT EXISTS photos (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Копия оценок пользователя ({ratings, deleted}), которую видят его друзья и его же другие устройства
CREATE TABLE IF NOT EXISTS shelves (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Счётчики попыток входа/регистрации/заявок (защита от перебора паролей)
CREATE TABLE IF NOT EXISTS attempts (
  key TEXT PRIMARY KEY,            -- например login-ip:1.2.3.4 или login-acc:ник
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL        -- когда окно обнуляется
);


-- Реакции друзей на оценки: 🔥 / 💀 / «не согласен» (fire / skull / nope) и короткий комментарий
CREATE TABLE IF NOT EXISTS reactions (
  owner_id TEXT NOT NULL,          -- чья оценка
  rid TEXT NOT NULL,               -- id оценки
  from_id TEXT NOT NULL,           -- кто отреагировал
  emoji TEXT,
  text TEXT,                       -- до 140 символов
  at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, rid, from_id)
);
CREATE INDEX IF NOT EXISTS reactions_from ON reactions(from_id);

-- Служебные отметки сервера, например «старые ники уже переведены в юзернеймы»
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

-- Гости на сайте для счётчика «сейчас на сайте»: случайный id браузера и время последней отметки
CREATE TABLE IF NOT EXISTS presence (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS presence_at ON presence(at);
