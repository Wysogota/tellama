import db from './DatabaseBridge.js';

/**
 * Client-side DDL migrations.
 * Run once at startup. Safe to run multiple times (IF NOT EXISTS).
 */
export async function runMigrations() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      personal_info TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      sync_status   TEXT NOT NULL DEFAULT 'pending'
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id                     TEXT PRIMARY KEY,
      name                   TEXT NOT NULL,
      personal_info          TEXT NOT NULL DEFAULT '{}',
      created_at             INTEGER NOT NULL,
      updated_at             INTEGER NOT NULL,
      last_background_update INTEGER,
      sync_status            TEXT NOT NULL DEFAULT 'pending'
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id              TEXT PRIMARY KEY,
      user_profile_id TEXT NOT NULL,
      persona_id      TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      sync_status     TEXT NOT NULL DEFAULT 'pending'
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT PRIMARY KEY,
      session_id        TEXT NOT NULL,
      role              TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content           TEXT NOT NULL,
      parent_message_id TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      metadata          TEXT DEFAULT '{}',
      sync_status       TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS session_branch_state (
      session_id         TEXT NOT NULL,
      parent_message_id  TEXT NOT NULL,
      active_child_index INTEGER NOT NULL DEFAULT 0,
      updated_at         INTEGER NOT NULL,
      sync_status        TEXT NOT NULL DEFAULT 'pending',
      PRIMARY KEY (session_id, parent_message_id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS memories_store (
      id               TEXT PRIMARY KEY,
      persona_id       TEXT NOT NULL,
      memory_type      TEXT NOT NULL,
      content          TEXT NOT NULL,
      importance_score REAL NOT NULL DEFAULT 0.5,
      created_at       INTEGER NOT NULL,
      sync_status      TEXT NOT NULL DEFAULT 'pending'
    )
  `);

  try {
    await db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[384]
      )
    `);
  } catch (e) {
    console.warn('[Migrations] Failed to create vec_memories table. Check if sqlite-vec is loaded properly.', e.message);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT,
      updated_at  INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS deleted_records (
      id          TEXT NOT NULL,
      table_name  TEXT NOT NULL,
      deleted_at  INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      PRIMARY KEY (id, table_name)
    )
  `);

  // Indexes
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session   ON messages(session_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_parent    ON messages(parent_message_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_pending   ON messages(sync_status) WHERE sync_status = 'pending'`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_personas_pending   ON personas(sync_status) WHERE sync_status = 'pending'`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_profiles_pending   ON user_profiles(sync_status) WHERE sync_status = 'pending'`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_deleted_pending    ON deleted_records(sync_status) WHERE sync_status = 'pending'`);

  try {
    const tableInfo = await db.query("PRAGMA table_info(messages)");
    const hasMetadata = tableInfo.rows.some(col => col.name === 'metadata');
    if (!hasMetadata) {
      await db.exec(`ALTER TABLE messages ADD COLUMN metadata TEXT DEFAULT '{}'`);
    }
  } catch (e) {
    console.warn('[Migrations] Metadata column check/add failed:', e.message);
  }

  try {
    await db.exec(`ALTER TABLE memories_store DROP COLUMN embedding_ref`);
  } catch (e) {
    // Ignore error if column doesn't exist or DB is too old
  }

  console.log('[Migrations] All tables created/verified');
}
