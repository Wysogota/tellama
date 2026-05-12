import express from 'express';
import db from '../db.js';

const router = express.Router();

// Set by index.js after WebSocket server is created
let _notifyClients = null;
export function setNotifyClients(fn) { _notifyClients = fn; }

// Push updates from client to server
router.post('/push', (req, res) => {
  const { deviceId, records } = req.body;
  if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'Invalid records' });

  const syncedIds = {
    user_profiles: [],
    personas: [],
    chat_sessions: [],
    messages: [],
    session_branch_state: [],
    memories_store: [],
    app_settings: [],
    deleted_records: []
  };

  const transaction = db.transaction((recs) => {
    for (const record of recs) {
      const { _table, sync_status, ...data } = record;
      
      if (_table === 'user_profiles') {
        const isDeleted = db.prepare("SELECT 1 FROM deleted_records WHERE id = ? AND table_name = 'user_profiles'").get(data.id);
        if (!isDeleted) {
          db.prepare(`INSERT INTO user_profiles (id, name, personal_info, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET name=excluded.name, personal_info=excluded.personal_info, updated_at=excluded.updated_at
                      WHERE excluded.updated_at > user_profiles.updated_at`)
            .run(data.id, data.name, data.personal_info ?? '{}', data.created_at, data.updated_at);
          syncedIds.user_profiles.push(data.id);
        } else {
          syncedIds.user_profiles.push(data.id); // acknowledge so client stops pushing
        }
      }
      
      if (_table === 'personas') {
        const isDeleted = db.prepare("SELECT 1 FROM deleted_records WHERE id = ? AND table_name = 'personas'").get(data.id);
        if (!isDeleted) {
          db.prepare(`INSERT INTO personas (id, name, personal_info, created_at, updated_at, last_background_update)
                      VALUES (?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET name=excluded.name, personal_info=excluded.personal_info, updated_at=excluded.updated_at
                      WHERE excluded.updated_at > personas.updated_at`)
            .run(data.id, data.name, data.personal_info ?? '{}', data.created_at, data.updated_at, data.last_background_update ?? null);
          syncedIds.personas.push(data.id);
        } else {
          syncedIds.personas.push(data.id);
        }
      }

      if (_table === 'chat_sessions') {
        const isDeleted = db.prepare("SELECT 1 FROM deleted_records WHERE id = ? AND table_name = 'chat_sessions'").get(data.id);
        if (!isDeleted) {
          db.prepare(`INSERT INTO chat_sessions (id, user_profile_id, persona_id, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
                      WHERE excluded.updated_at > chat_sessions.updated_at`)
            .run(data.id, data.user_profile_id ?? '', data.persona_id ?? '', data.created_at, data.updated_at);
          syncedIds.chat_sessions.push(data.id);
        } else {
          syncedIds.chat_sessions.push(data.id);
        }
      }

      if (_table === 'messages') {
        const isDeleted = db.prepare("SELECT 1 FROM deleted_records WHERE id = ? AND table_name = 'messages'").get(data.id);
        if (!isDeleted) {
          db.prepare(`INSERT INTO messages (id, session_id, role, content, parent_message_id, created_at, updated_at, metadata)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at, metadata=excluded.metadata
                      WHERE excluded.updated_at > messages.updated_at`)
            .run(data.id, data.session_id, data.role ?? 'user', data.content ?? '', data.parent_message_id ?? null, data.created_at, data.updated_at, data.metadata ?? '{}');
          syncedIds.messages.push(data.id);
        } else {
          syncedIds.messages.push(data.id);
        }
      }

      if (_table === 'session_branch_state') {
        db.prepare(`INSERT INTO session_branch_state (session_id, parent_message_id, active_child_index, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(session_id, parent_message_id) DO UPDATE SET active_child_index=excluded.active_child_index, updated_at=excluded.updated_at
                    WHERE excluded.updated_at > session_branch_state.updated_at`)
          .run(data.session_id, data.parent_message_id ?? 'root', data.active_child_index ?? 0, data.updated_at);
        syncedIds.session_branch_state.push(`${data.session_id}:${data.parent_message_id}`);
      }

      if (_table === 'memories_store') {
        db.prepare(`INSERT INTO memories_store (id, persona_id, memory_type, content, importance_score, embedding_ref, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING`)
          .run(data.id, data.persona_id, data.memory_type ?? '', data.content ?? '', data.importance_score ?? 0.5, data.embedding_ref ?? null, data.created_at);
        syncedIds.memories_store.push(data.id);
      }
      
      if (_table === 'app_settings') {
        db.prepare(`INSERT INTO app_settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
                    WHERE excluded.updated_at > app_settings.updated_at`)
          .run(data.key, data.value ?? '', data.updated_at);
        syncedIds.app_settings.push(data.key);
      }
      
      if (_table === 'deleted_records') {
        const allowedTables = ['user_profiles', 'personas', 'chat_sessions', 'messages', 'session_branch_state', 'memories_store', 'app_settings'];
        if (allowedTables.includes(data.table_name)) {
          db.prepare(`DELETE FROM ${data.table_name} WHERE id = ?`).run(data.id);
          if (data.table_name === 'chat_sessions') {
            db.prepare(`DELETE FROM session_branch_state WHERE session_id = ?`).run(data.id);
          }
        }
        db.prepare(`INSERT INTO deleted_records (id, table_name, deleted_at) VALUES (?, ?, ?) ON CONFLICT(id, table_name) DO UPDATE SET deleted_at=excluded.deleted_at`).run(data.id, data.table_name, data.deleted_at);
        syncedIds.deleted_records.push(data.id);
      }
    }
  });

  try {
    transaction(records);

    // Broadcast invalidation to all other connected WebSocket clients
    const changedTables = Object.entries(syncedIds)
      .filter(([, ids]) => ids.length > 0)
      .map(([table]) => table);
    if (changedTables.length > 0 && _notifyClients) {
      _notifyClients({ type: 'invalidate', tables: changedTables, from: deviceId, timestamp: Date.now() });
    }

    res.json({ syncedIds });
  } catch (e) {
    console.error('[Sync API] Push error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Pull updates from server to client
router.get('/pull', (req, res) => {
  const { since, deviceId } = req.query;
  const sinceTs = parseInt(since) || 0;

  try {
    // IMPORTANT: deleted_records MUST come first so the client applies tombstones
    // before processing any live records in the same batch. This prevents
    // a deleted item from being re-inserted by a later record in the same pull.
    const deletedRecords = db.prepare("SELECT *, 'deleted_records' as _table FROM deleted_records WHERE deleted_at > ?").all(sinceTs);
    const liveRecords = [
      ...db.prepare("SELECT *, 'user_profiles' as _table FROM user_profiles WHERE updated_at > ?").all(sinceTs),
      ...db.prepare("SELECT *, 'personas' as _table FROM personas WHERE updated_at > ?").all(sinceTs),
      ...db.prepare("SELECT *, 'chat_sessions' as _table FROM chat_sessions WHERE updated_at > ?").all(sinceTs),
      ...db.prepare("SELECT *, 'messages' as _table FROM messages WHERE updated_at > ?").all(sinceTs),
      ...db.prepare("SELECT *, 'session_branch_state' as _table FROM session_branch_state WHERE updated_at > ?").all(sinceTs),
      ...db.prepare("SELECT *, 'memories_store' as _table FROM memories_store WHERE created_at > ?").all(sinceTs),
      ...db.prepare("SELECT *, 'app_settings' as _table FROM app_settings WHERE updated_at > ?").all(sinceTs),
    ];
    const records = [...deletedRecords, ...liveRecords];

    res.json({
      records,
      timestamp: Date.now()
    });
  } catch (e) {
    console.error('[Sync API] Pull error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
