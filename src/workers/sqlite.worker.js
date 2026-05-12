import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let db = null;

const log = (...a) => console.log('[SQLiteWorker]', ...a);
const err = (...a) => console.error('[SQLiteWorker]', ...a);

async function initDB() {
  let sqlite3 = await sqlite3InitModule({ print: log, printErr: err });
  if (sqlite3.sqlite3) sqlite3 = sqlite3.sqlite3; // Handle nested property in some builds
  log('sqlite3 initialized, keys:', Object.keys(sqlite3));

  try {
    const PoolUtil = await sqlite3.installOpfsSAHPoolVfs({ clearOnInit: false });
    db = new PoolUtil.OpfsSAHPoolDb('/tellama.db');
    log('Opened OPFS SAHPool database:', db.filename);
  } catch (e) {
    err('OPFS SAHPool failed, fallback to in-memory:', e.message);
    db = new sqlite3.oo1.DB(':memory:');
  }
}

const initPromise = initDB();

self.onmessage = async ({ data }) => {
  const { id, type, sql, params = [] } = data;
  try {
    await initPromise;

    if (type === 'ping') {
      self.postMessage({ id, result: { ok: true } });
      return;
    }

    if (type === 'exec') {
      // Run one or more statements, no rows returned
      db.exec({ sql, bind: params.length ? params : undefined });
      self.postMessage({ id, result: { changes: db.changes() } });
      return;
    }

    if (type === 'query') {
      // SELECT – return rows as array of objects
      const rows = [];
      db.exec({
        sql,
        bind: params.length ? params : undefined,
        rowMode: 'object',
        callback: row => rows.push(row),
      });
      self.postMessage({ id, result: { rows } });
      return;
    }

    if (type === 'run') {
      // Single statement, return lastInsertRowid + changes
      db.exec({ sql, bind: params.length ? params : undefined });
      self.postMessage({ id, result: { changes: db.changes(), lastInsertRowid: db.selectValue('SELECT last_insert_rowid()') } });
      return;
    }

    if (type === 'batch') {
      // Multiple statements in a transaction
      const statements = data.statements; // [{ sql, params }]
      db.exec('BEGIN');
      try {
        for (const s of statements) {
          db.exec({ sql: s.sql, bind: s.params?.length ? s.params : undefined });
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      self.postMessage({ id, result: { ok: true } });
      return;
    }

    throw new Error(`Unknown message type: ${type}`);
  } catch (e) {
    err('Error handling message:', e.message);
    self.postMessage({ id, error: e.message });
  }
};
