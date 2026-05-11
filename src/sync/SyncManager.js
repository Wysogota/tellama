import { v4 as uuidv4 } from 'uuid';
import db from '../db/DatabaseBridge.js';
import * as queries from '../db/queries.js';

let syncInterval = null;
let isSyncing = false;

// ─── WebSocket live-update client ────────────────────────────────────────────
let ws = null;
let wsReconnectTimeout = null;
let wsReconnectDelay = 1000; // start at 1s, exponential backoff up to 30s
let _wsServerUrl = null;
let _wsOnInvalidate = null; // called immediately on 'invalidate' from server

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const wsUrl = _wsServerUrl.replace(/^http/, 'ws');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[SyncManager WS] Connected to', wsUrl);
    wsReconnectDelay = 1000; // reset backoff on successful connect
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'invalidate') {
        console.log('[SyncManager WS] Server invalidated tables:', msg.tables, '— pulling now');
        const hasUpdates = await syncPull(_wsServerUrl);
        if (hasUpdates && _wsOnInvalidate) {
          await _wsOnInvalidate();
        }
      }
    } catch (e) {
      console.warn('[SyncManager WS] Message parse error:', e.message);
    }
  };

  ws.onclose = () => {
    console.log(`[SyncManager WS] Disconnected — reconnecting in ${wsReconnectDelay}ms`);
    wsReconnectTimeout = setTimeout(() => {
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
      connectWebSocket();
    }, wsReconnectDelay);
  };

  ws.onerror = (e) => {
    console.warn('[SyncManager WS] Error:', e.message ?? e.type);
    ws.close();
  };
}

export function disconnectWebSocket() {
  if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

export async function getDeviceId() {
  let deviceId = await queries.getSyncMeta('device_id');
  if (!deviceId) {
    deviceId = uuidv4();
    await queries.setSyncMeta('device_id', deviceId);
  }
  return deviceId;
}

export async function syncPush(serverUrl) {
  if (isSyncing) return;
  isSyncing = true;
  
  try {
    const deviceId = await getDeviceId();
    const pending = await queries.getPendingRecords();
    
    if (pending.length === 0) {
      isSyncing = false;
      return;
    }

    console.log(`[SyncManager] Pushing ${pending.length} records to server...`);
    
    const response = await fetch(`${serverUrl}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, records: pending }),
    });

    if (response.ok) {
      const { syncedIds } = await response.json();
      // syncedIds: { user_profiles: [...], personas: [...], ... }
      for (const [table, ids] of Object.entries(syncedIds)) {
        await queries.markSynced(table, ids);
      }
      console.log('[SyncManager] Push successful');
    }
  } catch (e) {
    console.error('[SyncManager] Push failed:', e.message);
  } finally {
    isSyncing = false;
  }
}

export async function syncPull(serverUrl) {
  try {
    const deviceId = await getDeviceId();
    const lastPullAt = await queries.getSyncMeta('last_pull_at') || 0;
    
    console.log(`[SyncManager] Pulling updates since ${lastPullAt}...`);
    
    const response = await fetch(`${serverUrl}/sync/pull?since=${lastPullAt}&deviceId=${deviceId}`);
    if (response.ok) {
      const { records, timestamp } = await response.json();
      
      if (records.length > 0) {
        console.log(`[SyncManager] Applying ${records.length} updates from server...`);
        for (const record of records) {
          const { _table, ...data } = record;
          try {
            if (_table === 'user_profiles') {
              const personalInfo = JSON.parse(data.personal_info || '{}');
              await queries.applyProfileFromServer({
                id: data.id,
                name: data.name,
                biography: personalInfo.biography || '',
                age: personalInfo.age || '',
                gender: personalInfo.gender || '',
                avatar: personalInfo.avatar || null,
                createdAt: data.created_at,
                updated_at: data.updated_at,  // pass server timestamp
              });
            }
            if (_table === 'personas') {
              const personalInfo = JSON.parse(data.personal_info || '{}');
              await queries.applyPersonaFromServer({
                id: data.id,
                name: data.name,
                biography: personalInfo.biography || '',
                age: personalInfo.age || '',
                gender: personalInfo.gender || '',
                traits: personalInfo.traits || [],
                style: personalInfo.style || [],
                temperature: personalInfo.temperature ?? 0.7,
                initiativeFrequency: personalInfo.initiativeFrequency || 'never',
                avatar: personalInfo.avatar || null,
                createdAt: data.created_at,
                updated_at: data.updated_at,  // pass server timestamp
              });
            }
            if (_table === 'chat_sessions') {
              await queries.upsertSession({
                id: data.id,
                userProfileId: data.user_profile_id,
                personaId: data.persona_id,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
              });
            }
            if (_table === 'messages') {
              await queries.insertMessage({
                id: data.id,
                sessionId: data.session_id,
                sender: data.role === 'user' ? 'user' : 'bot',
                content: data.content,
                parentId: data.parent_message_id,
                timestamp: data.created_at,
                metadata: data.metadata,
              });
            }
            if (_table === 'session_branch_state') {
              await queries.upsertBranchState(
                data.session_id,
                data.parent_message_id === 'root' ? null : data.parent_message_id,
                data.active_child_index
              );
            }
            if (_table === 'app_settings') {
              await queries.applySettingFromServer(
                data.key,
                data.value,
                data.updated_at
              );
            }
          } catch (err) {
            console.error(`[SyncManager] Error applying ${_table} record:`, err.message);
          }
        }
      }
      
      await queries.setSyncMeta('last_pull_at', timestamp);
      return records.length > 0;
    }
  } catch (e) {
    console.error('[SyncManager] Pull failed:', e.message);
  }
  return false;
}

export function startSync(serverUrl, onPullComplete = null, intervalMs = 60000) {
  if (syncInterval) clearInterval(syncInterval);

  // Store for WebSocket handler
  _wsServerUrl = serverUrl;
  _wsOnInvalidate = onPullComplete;

  // Initial pull on startup
  const runInitial = async () => {
    const hasUpdates = await syncPull(serverUrl);
    if (hasUpdates && onPullComplete) {
      try { await onPullComplete(); } catch (e) { console.warn('[SyncManager] onPullComplete error:', e.message); }
    }
    await syncPush(serverUrl);
  };
  runInitial();

  // Open WebSocket for instant server → client push notifications
  connectWebSocket();

  // Fallback: periodic full sync in case WS events were missed
  const fallbackSync = async () => {
    const hasUpdates = await syncPull(serverUrl);
    if (hasUpdates && onPullComplete) {
      try { await onPullComplete(); } catch (e) { console.warn('[SyncManager] fallback onPullComplete error:', e.message); }
    }
    await syncPush(serverUrl);
  };
  syncInterval = setInterval(fallbackSync, intervalMs);

  return () => {
    clearInterval(syncInterval);
    disconnectWebSocket();
  };
}
