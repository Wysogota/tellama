/**
 * DatabaseBridge — async RPC bridge from the UI thread to the SQLite Web Worker.
 * All methods return Promises.
 */

let worker = null;
let pending = new Map(); // id → { resolve, reject }
let msgId = 0;
let readyPromise = null;

function getWorker() {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/sqlite.worker.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = ({ data }) => {
      const cb = pending.get(data.id);
      if (!cb) return;
      pending.delete(data.id);
      if (data.error) cb.reject(new Error(data.error));
      else cb.resolve(data.result);
    };
    worker.onerror = (e) => {
      console.error('[DatabaseBridge] Worker error:', e);
    };
  }
  return worker;
}

function send(msg) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...msg });
  });
}

const db = {
  /** Ensure the worker is alive */
  ping: () => send({ type: 'ping' }),

  /** Run SQL with no result rows (DDL, INSERT, UPDATE, DELETE) */
  exec: (sql, params = []) => send({ type: 'exec', sql, params }),

  /** Run SELECT and return { rows: [...] } */
  query: (sql, params = []) => send({ type: 'query', sql, params }),

  /** Run a single statement and return { changes, lastInsertRowid } */
  run: (sql, params = []) => send({ type: 'run', sql, params }),

  /** Run an array of { sql, params } objects inside a transaction */
  batch: (statements) => send({ type: 'batch', statements }),
};

export function getDB() {
  return db;
}

/** Initialize and warm up the worker. Call once at app start. */
export async function initDatabase() {
  if (readyPromise) return readyPromise;
  readyPromise = db.ping().then(() => {
    console.log('[DatabaseBridge] Worker ready');
  });
  return readyPromise;
}

export default db;
