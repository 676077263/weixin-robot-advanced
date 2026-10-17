import { DatabaseSync } from 'node:sqlite';
import { config } from './config';

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  openid        TEXT PRIMARY KEY,
  gold          INTEGER NOT NULL DEFAULT 0,
  state         TEXT NOT NULL DEFAULT 'home',
  state_data    TEXT NOT NULL DEFAULT '',
  signin_date   TEXT NOT NULL DEFAULT '',
  signin_streak INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_active   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  openid TEXT NOT NULL,
  key    TEXT NOT NULL,
  value  TEXT NOT NULL,
  PRIMARY KEY (openid, key)
);

CREATE TABLE IF NOT EXISTS plots (
  openid     TEXT NOT NULL,
  idx        INTEGER NOT NULL,
  crop       TEXT NOT NULL,
  planted_at INTEGER NOT NULL,
  PRIMARY KEY (openid, idx)
);

CREATE TABLE IF NOT EXISTS pets (
  openid     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  species    TEXT NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1,
  exp        INTEGER NOT NULL DEFAULT 0,
  mood       INTEGER NOT NULL DEFAULT 80,
  fed_at     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cultivators (
  openid       TEXT PRIMARY KEY,
  realm        INTEGER NOT NULL DEFAULT 0,
  exp          INTEGER NOT NULL DEFAULT 0,
  meditated_at INTEGER NOT NULL,
  adventures   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lives (
  openid      TEXT PRIMARY KEY,
  level       INTEGER NOT NULL DEFAULT 0,
  works       INTEGER NOT NULL DEFAULT 0,
  deposit     INTEGER NOT NULL DEFAULT 0,
  interest_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  openid   TEXT NOT NULL,
  card_key TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (openid, card_key)
);

CREATE TABLE IF NOT EXISTS bindings (
  email    TEXT PRIMARY KEY,
  openid   TEXT NOT NULL,
  bound_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seen_msgs (
  msg_id TEXT PRIMARY KEY,
  ts     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_id     TEXT NOT NULL,
  openid     TEXT NOT NULL,
  msg_type   TEXT NOT NULL,
  content    TEXT NOT NULL,
  reply      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);
`);
