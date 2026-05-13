import db from './DatabaseBridge.js';
import { generateEmbedding } from '../services/memoryManager.js';

const now = () => Date.now();

/**
 * Returns true if the record is in deleted_records (tombstoned).
 * Used to prevent re-insertion of deleted data during sync pull.
 */
async function isTombstoned(id, tableName) {
  const { rows } = await db.query(
    'SELECT 1 FROM deleted_records WHERE id = ? AND table_name = ?',
    [id, tableName]
  );
  return rows.length > 0;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function personaToRow(p) {
  const info = {
    biography: p.biography || '',
    age: p.age || '',
    gender: p.gender || '',
    traits: p.traits || [],
    style: p.style || [],
    temperature: p.temperature ?? 0.7,
    initiativeFrequency: p.initiativeFrequency || 'never',
    avatar: p.avatar || null,
  };
  return { id: p.id, name: p.name, personal_info: JSON.stringify(info), created_at: p.createdAt || now(), updated_at: p.updatedAt || now() };
}

function rowToPersona(row) {
  const info = JSON.parse(row.personal_info || '{}');
  return {
    id: row.id,
    name: row.name,
    biography: info.biography || '',
    age: info.age || '',
    gender: info.gender || '',
    traits: info.traits || [],
    style: info.style || [],
    temperature: info.temperature ?? 0.7,
    initiativeFrequency: info.initiativeFrequency || 'never',
    avatar: info.avatar || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,  // needed for local-vs-server freshness comparison
  };
}

function profileToRow(p) {
  const info = { biography: p.biography || '', age: p.age || '', gender: p.gender || '', avatar: p.avatar || null };
  return { id: p.id, name: p.name, personal_info: JSON.stringify(info), created_at: p.createdAt || now(), updated_at: p.updatedAt || now() };
}

function rowToProfile(row) {
  const info = JSON.parse(row.personal_info || '{}');
  return {
    id: row.id,
    name: row.name,
    biography: info.biography || '',
    age: info.age || '',
    gender: info.gender || '',
    avatar: info.avatar || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,  // needed for local-vs-server freshness comparison
  };
}

// ─── User Profiles ───────────────────────────────────────────────────────────

export async function getAllProfiles() {
  const { rows } = await db.query('SELECT * FROM user_profiles ORDER BY created_at ASC');
  return rows.map(rowToProfile);
}

export async function upsertProfile(profile) {
  const r = profileToRow(profile);
  await db.exec(
    `INSERT INTO user_profiles (id, name, personal_info, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, personal_info=excluded.personal_info, updated_at=excluded.updated_at, sync_status='pending'`,
    [r.id, r.name, r.personal_info, r.created_at, r.updated_at]
  );
}

/**
 * Apply a user profile received from the server.
 * Only updates local record if server's updated_at is NEWER (true last-write-wins).
 * Skips insertion if the record is tombstoned (deleted locally or by another client).
 */
export async function applyProfileFromServer(profile) {
  // Tombstone guard: never resurrect a deleted record
  if (await isTombstoned(profile.id, 'user_profiles')) {
    console.log(`[queries] applyProfileFromServer: skipping tombstoned profile ${profile.id}`);
    return;
  }
  const r = profileToRow(profile);
  const serverUpdatedAt = profile.updated_at || r.updated_at;
  await db.exec(
    `INSERT INTO user_profiles (id, name, personal_info, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       personal_info=excluded.personal_info,
       updated_at=excluded.updated_at,
       sync_status='synced'
     WHERE excluded.updated_at > user_profiles.updated_at`,
    [r.id, r.name, r.personal_info, r.created_at, serverUpdatedAt]
  );
}

export async function deleteProfile(id) {
  await db.exec('DELETE FROM user_profiles WHERE id = ?', [id]);
  await logDeletion(id, 'user_profiles');
}

// ─── Personas (Contacts) ─────────────────────────────────────────────────────

export async function getAllPersonas() {
  const { rows } = await db.query('SELECT * FROM personas ORDER BY created_at DESC');
  return rows.map(rowToPersona);
}

export async function upsertPersona(persona) {
  const r = personaToRow(persona);
  await db.exec(
    `INSERT INTO personas (id, name, personal_info, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, personal_info=excluded.personal_info, updated_at=excluded.updated_at, sync_status='pending'`,
    [r.id, r.name, r.personal_info, r.created_at, r.updated_at]
  );
}

/**
 * Apply a persona received from the server.
 * Only updates local record if server's updated_at is NEWER (true last-write-wins).
 * Marks sync_status='synced' so it won't be pushed back.
 * Skips insertion if the record is tombstoned.
 */
export async function applyPersonaFromServer(persona) {
  // Tombstone guard: never resurrect a deleted record
  if (await isTombstoned(persona.id, 'personas')) {
    console.log(`[queries] applyPersonaFromServer: skipping tombstoned persona ${persona.id}`);
    return;
  }
  const r = personaToRow(persona);
  // Use server's actual timestamp, not now()
  const serverUpdatedAt = persona.updated_at || r.updated_at;
  await db.exec(
    `INSERT INTO personas (id, name, personal_info, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       personal_info=excluded.personal_info,
       updated_at=excluded.updated_at,
       sync_status='synced'
     WHERE excluded.updated_at > personas.updated_at`,
    [r.id, r.name, r.personal_info, r.created_at, serverUpdatedAt]
  );
}

export async function deletePersona(id) {
  await db.exec('DELETE FROM personas WHERE id = ?', [id]);
  await logDeletion(id, 'personas');
}

// ─── Chat Sessions ───────────────────────────────────────────────────────────

export async function getAllSessions() {
  const { rows } = await db.query('SELECT * FROM chat_sessions');
  return rows;
}

export async function upsertSession(session) {
  const t = now();
  await db.exec(
    `INSERT INTO chat_sessions (id, user_profile_id, persona_id, name, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at, sync_status='pending'`,
    [session.id, session.userProfileId, session.personaId, session.name || null, session.createdAt || t, t]
  );
}

/**
 * Apply a chat session received from the server.
 * Skips if tombstoned.
 */
export async function applySessionFromServer(session) {
  if (await isTombstoned(session.id, 'chat_sessions')) {
    console.log(`[queries] applySessionFromServer: skipping tombstoned session ${session.id}`);
    return;
  }
  await db.exec(
    `INSERT INTO chat_sessions (id, user_profile_id, persona_id, name, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at, sync_status='synced'
     WHERE excluded.updated_at > chat_sessions.updated_at`,
    [session.id, session.userProfileId, session.personaId, session.name || null, session.createdAt, session.updatedAt]
  );
}

export async function updateSessionName(id, name) {
  const t = now();
  await db.exec(
    `UPDATE chat_sessions SET name = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [name, t, id]
  );
}

export async function deleteSession(id) {
  // First, log and delete all messages for this session
  const { rows } = await db.query('SELECT id FROM messages WHERE session_id = ?', [id]);
  for (const row of rows) {
    await logDeletion(row.id, 'messages');
  }
  await db.exec('DELETE FROM messages WHERE session_id = ?', [id]);
  
  await db.exec('DELETE FROM chat_sessions WHERE id = ?', [id]);
  await db.exec('DELETE FROM session_branch_state WHERE session_id = ?', [id]);
  await logDeletion(id, 'chat_sessions');
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessagesForSession(sessionId) {
  const { rows } = await db.query(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId]
  );
  return rows;
}

export async function getBranchStateForSession(sessionId) {
  const { rows } = await db.query(
    'SELECT * FROM session_branch_state WHERE session_id = ?',
    [sessionId]
  );
  return rows;
}

export async function insertMessage(msg) {
  const t = msg.timestamp || now();
  const metadata = JSON.stringify(msg.stats || msg.metadata || {});
  await db.exec(
    `INSERT OR IGNORE INTO messages (id, session_id, role, content, parent_message_id, created_at, updated_at, metadata, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [msg.id, msg.sessionId, msg.sender === 'user' ? 'user' : 'assistant', msg.content, msg.parentId ?? null, t, t, metadata]
  );
}

export async function updateMessageContent(msgId, content) {
  const t = now();
  await db.exec(
    `UPDATE messages SET content = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [content, t, msgId]
  );
}

export async function updateMessageMetadata(id, metadata) {
  const metaStr = JSON.stringify(metadata);
  const t = now();
  await db.exec(
    "UPDATE messages SET metadata=?, updated_at=?, sync_status='pending' WHERE id=?",
    [metaStr, t, id]
  );
}

export async function deleteMessageCascade(msgId) {
  const { rows } = await db.query(`
    WITH RECURSIVE to_delete(id) AS (
      SELECT ? UNION ALL
      SELECT m.id FROM messages m JOIN to_delete td ON m.parent_message_id = td.id
    )
    SELECT id FROM to_delete
  `, [msgId]);

  // Recursively delete via SQL CTE
  await db.exec(`
    WITH RECURSIVE to_delete(id) AS (
      SELECT ? UNION ALL
      SELECT m.id FROM messages m JOIN to_delete td ON m.parent_message_id = td.id
    )
    DELETE FROM messages WHERE id IN (SELECT id FROM to_delete)
  `, [msgId]);

  for (const row of rows) {
    await logDeletion(row.id, 'messages');
  }
}

export async function upsertBranchState(sessionId, parentMsgId, activeIdx) {
  const key = parentMsgId ?? 'root';
  await db.exec(
    `INSERT INTO session_branch_state (session_id, parent_message_id, active_child_index, updated_at, sync_status)
     VALUES (?, ?, ?, ?, 'pending')
     ON CONFLICT(session_id, parent_message_id) DO UPDATE SET active_child_index=excluded.active_child_index, updated_at=excluded.updated_at, sync_status='pending'`,
    [sessionId, key, activeIdx, now()]
  );
}

// ─── Sync Metadata ────────────────────────────────────────────────────────────

export async function getSyncMeta(key) {
  const { rows } = await db.query('SELECT value FROM sync_metadata WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}

export async function setSyncMeta(key, value) {
  await db.exec(
    `INSERT INTO sync_metadata (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, String(value)]
  );
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export async function getAllSettings() {
  const { rows } = await db.query('SELECT * FROM app_settings');
  const settings = {};
  rows.forEach(row => {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch (e) {
      settings[row.key] = row.value;
    }
  });
  return settings;
}

export async function upsertSetting(key, value) {
  const t = now();
  const valStr = JSON.stringify(value);
  await db.exec(
    `INSERT INTO app_settings (key, value, updated_at, sync_status)
     VALUES (?, ?, ?, 'pending')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, sync_status='pending'`,
    [key, valStr, t]
  );
}

export async function applySettingFromServer(key, value, updatedAt) {
  await db.exec(
    `INSERT INTO app_settings (key, value, updated_at, sync_status)
     VALUES (?, ?, ?, 'synced')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, sync_status='synced'
     WHERE excluded.updated_at > app_settings.updated_at`,
    [key, value, updatedAt]
  );
}

// ─── Build In-Memory Tree from SQL rows ──────────────────────────────────────

/**
 * Convert flat SQL rows into the nested tree format used by AppContext.
 * Returns { nodes, rootId, activeChildIndex }
 */
export function buildMessageTree(msgRows, branchRows) {
  const nodes = {};
  let rootId = null;

  // Build nodes map (childrenIds will be filled below)
  for (const row of msgRows) {
    nodes[row.id] = {
      id: row.id,
      parentId: row.parent_message_id ?? null,
      childrenIds: [],
      sender: row.role === 'user' ? 'user' : 'bot',
      content: row.content,
      timestamp: row.created_at,
      stats: JSON.parse(row.metadata || '{}'),
    };
    if (!row.parent_message_id) rootId = row.id;
  }

  // Populate childrenIds in insertion order (messages ordered by created_at)
  for (const row of msgRows) {
    if (row.parent_message_id && nodes[row.parent_message_id]) {
      nodes[row.parent_message_id].childrenIds.push(row.id);
    }
  }

  // Build activeChildIndex from branch state rows
  const activeChildIndex = {};
  for (const row of branchRows) {
    const parentKey = row.parent_message_id === 'root' ? null : row.parent_message_id;
    activeChildIndex[parentKey] = row.active_child_index;
  }

  return { nodes, rootId, activeChildIndex };
}

// ─── Pending Records for Sync ─────────────────────────────────────────────────

export async function getPendingRecords() {
  const [profiles, personas, sessions, messages, branchState, app_settings, deleted_records, memories_store] = await Promise.all([
    db.query("SELECT *, 'user_profiles' as _table FROM user_profiles WHERE sync_status='pending'"),
    db.query("SELECT *, 'personas' as _table FROM personas WHERE sync_status='pending'"),
    db.query("SELECT *, 'chat_sessions' as _table FROM chat_sessions WHERE sync_status='pending'"),
    db.query("SELECT *, 'messages' as _table FROM messages WHERE sync_status='pending'"),
    db.query("SELECT *, 'session_branch_state' as _table FROM session_branch_state WHERE sync_status='pending'"),
    db.query("SELECT *, 'app_settings' as _table FROM app_settings WHERE sync_status='pending'"),
    db.query("SELECT *, 'deleted_records' as _table FROM deleted_records WHERE sync_status='pending'"),
    db.query("SELECT *, 'memories_store' as _table FROM memories_store WHERE sync_status='pending'"),
  ]);
  return [
    ...profiles.rows,
    ...personas.rows,
    ...sessions.rows,
    ...messages.rows,
    ...branchState.rows,
    ...app_settings.rows,
    ...deleted_records.rows,
    ...memories_store.rows,
  ];
}

export async function markSynced(table, ids) {
  if (!ids.length) return;
  if (table === 'session_branch_state') {
    for (const id of ids) {
      const [sessionId, parentMsgId] = id.split(':');
      await db.exec(
        "UPDATE session_branch_state SET sync_status='synced' WHERE session_id=? AND parent_message_id=?",
        [sessionId, parentMsgId]
      );
    }
    return;
  }
  if (table === 'app_settings') {
    const placeholders = ids.map(() => '?').join(',');
    await db.exec(`UPDATE app_settings SET sync_status='synced' WHERE key IN (${placeholders})`, ids);
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  await db.exec(`UPDATE ${table} SET sync_status='synced' WHERE id IN (${placeholders})`, ids);
}

// ─── Deleted Records Sync ─────────────────────────────────────────────────────

export async function applyDeletionFromServer(id, table_name, deleted_at) {
  if (['user_profiles', 'personas', 'chat_sessions', 'messages'].includes(table_name)) {
     await db.exec(`DELETE FROM ${table_name} WHERE id = ?`, [id]);
     if (table_name === 'chat_sessions') {
       await db.exec(`DELETE FROM session_branch_state WHERE session_id = ?`, [id]);
     }
  }
  await db.exec(`INSERT INTO deleted_records (id, table_name, deleted_at, sync_status) VALUES (?, ?, ?, 'synced') ON CONFLICT(id, table_name) DO UPDATE SET deleted_at=excluded.deleted_at, sync_status='synced'`, [id, table_name, deleted_at]);
}

async function logDeletion(id, table_name) {
  const t = now();
  await db.exec(
    `INSERT INTO deleted_records (id, table_name, deleted_at, sync_status) 
     VALUES (?, ?, ?, 'pending') 
     ON CONFLICT(id, table_name) DO UPDATE SET deleted_at=excluded.deleted_at, sync_status='pending'`,
    [id, table_name, t]
  );
}
export async function applyMessageFromServer(msg) {
  if (await isTombstoned(msg.id, 'messages')) {
    console.log(`[queries] applyMessageFromServer: skipping tombstoned message ${msg.id}`);
    return;
  }
  const metadata = typeof msg.metadata === 'string' ? msg.metadata : JSON.stringify(msg.stats || msg.metadata || {});
  await db.exec(
    `INSERT INTO messages (id, session_id, role, content, parent_message_id, created_at, updated_at, metadata, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at, metadata=excluded.metadata, sync_status='synced'
     WHERE excluded.updated_at > messages.updated_at`,
    [msg.id, msg.sessionId, msg.sender === 'user' ? 'user' : 'assistant', msg.content, msg.parentId ?? null, msg.timestamp, msg.updatedAt || msg.timestamp, metadata]
  );
}

export async function applyMemoryFromServer(memory) {
  if (await isTombstoned(memory.id, 'memories_store')) {
    console.log(`[queries] applyMemoryFromServer: skipping tombstoned memory ${memory.id}`);
    return;
  }
  
  // Check if we already have it to avoid regenerating vectors
  const existing = await db.query('SELECT 1 FROM memories_store WHERE id = ?', [memory.id]);
  if (existing.rows.length > 0) {
    // Already exists, just mark synced in case it was pending
    await db.exec("UPDATE memories_store SET sync_status = 'synced' WHERE id = ?", [memory.id]);
    return;
  }

  // It's a new memory from the server. We must generate the local vector embedding.
  console.log(`[queries] Generating local embedding for pulled memory: ${memory.id}`);
  let embStr = null;
  try {
    const embedding = await generateEmbedding(memory.content);
    embStr = JSON.stringify(embedding);
  } catch (e) {
    console.error(`[queries] Failed to generate embedding for pulled memory ${memory.id}:`, e);
    // If it fails, we still save the text fact, just without the vector for now.
    // It won't be searchable but at least it's synced.
  }

  const queries = [
    {
      sql: `INSERT INTO memories_store (id, persona_id, memory_type, content, importance_score, created_at, sync_status)
            VALUES (?, ?, ?, ?, ?, ?, 'synced')
            ON CONFLICT(id) DO UPDATE SET sync_status='synced'`,
      params: [memory.id, memory.persona_id, memory.memory_type || 'long-term', memory.content, memory.importance_score || 0.5, memory.created_at]
    }
  ];

  if (embStr) {
    queries.push({
      sql: `INSERT INTO vec_memories (id, embedding) VALUES (?, ?)`,
      params: [memory.id, embStr]
    });
  }

  await db.batch(queries);
}

