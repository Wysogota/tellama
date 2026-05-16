import db from './db.js';

export function runServerMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      personal_info TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id                     TEXT PRIMARY KEY,
      name                   TEXT NOT NULL,
      personal_info          TEXT NOT NULL DEFAULT '{}',
      created_at             INTEGER NOT NULL,
      updated_at             INTEGER NOT NULL,
      last_background_update INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id              TEXT PRIMARY KEY,
      user_profile_id TEXT NOT NULL,
      persona_id      TEXT NOT NULL,
      name            TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )
  `);

  try {
    db.exec(`ALTER TABLE chat_sessions ADD COLUMN name TEXT`);
  } catch (e) {
    // Column already exists
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT PRIMARY KEY,
      session_id        TEXT NOT NULL,
      role              TEXT NOT NULL,
      content           TEXT NOT NULL,
      parent_message_id TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      metadata          TEXT DEFAULT '{}',
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_branch_state (
      session_id         TEXT NOT NULL,
      parent_message_id  TEXT NOT NULL,
      active_child_index INTEGER NOT NULL DEFAULT 0,
      updated_at         INTEGER NOT NULL,
      PRIMARY KEY (session_id, parent_message_id)
    )
  `);


  
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT,
      updated_at  INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS deleted_records (
      id          TEXT NOT NULL,
      table_name  TEXT NOT NULL,
      deleted_at  INTEGER NOT NULL,
      PRIMARY KEY (id, table_name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      provider   TEXT PRIMARY KEY,
      key_value  TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS favorite_models (
      model_id   TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    db.exec(`ALTER TABLE messages ADD COLUMN metadata TEXT DEFAULT '{}'`);
  } catch (e) {}



  console.log('[Server Migrations] Database schema initialized');
}
