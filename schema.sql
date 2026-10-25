-- Казуал Хаб: база для друзей (Cloudflare D1).
-- Применить один раз: npx wrangler d1 execute casualhub --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,          -- как человек написал ник
  uname TEXT NOT NULL UNIQUE,      -- ник в нижнем регистре, для поиска и уникальности
  pass_hash TEXT NOT NULL,         -- PBKDF2-SHA256, пароль в открытом виде не хранится
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

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

-- Копия оценок пользователя, которую видят его друзья
CREATE TABLE IF NOT EXISTS shelves (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
