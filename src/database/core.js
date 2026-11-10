/**
 * ============================================================================
 * DATABASE / CORE — Alumbrado Público
 * ============================================================================
 * Responsabilidades:
 *   - Gestión de la conexión única a SQLite (Tauri plugin-sql)
 *   - Respaldo paralelo en IndexedDB del navegador
 *   - Ejecución de migraciones de esquema versionadas
 *   - Generación de UUIDs seguros
 *
 * La base de datos se llama: alumbrado_publico.db
 * Ruta en el sistema:        %APPDATA%\com.v1.app-bitacora\alumbrado_publico.db
 *                            (Windows: C:\Users\<usuario>\AppData\Roaming\com.v1.app-bitacora\)
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// UUID criptográfico v4
// ---------------------------------------------------------------------------
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Nombre del archivo de base de datos
// ---------------------------------------------------------------------------
export const DB_NAME = 'sqlite:alumbrado_publico.db';

// ---------------------------------------------------------------------------
// Singleton de conexión SQLite
// ---------------------------------------------------------------------------
let _sqliteConn = null;
let _sqliteReady = false;

export function getSQLite() {
  return _sqliteConn;
}

export function isSQLiteReady() {
  return _sqliteReady;
}

// ---------------------------------------------------------------------------
// Singleton de IndexedDB (respaldo offline)
// ---------------------------------------------------------------------------
const IDB_NAME   = 'alumbrado_publico_idb';
const IDB_VERSION = 5;

// Registro de object stores para IDB — se expande conforme se crean módulos
const IDB_STORES = [
  { name: 'evidencias',         keyPath: 'id' },
  { name: 'config_bitacora',    keyPath: 'clave' },
  { name: 'reportes',           keyPath: 'id' },
  { name: 'personal',           keyPath: 'id' },
  { name: 'dias_inhabiles',     keyPath: 'id' },
  { name: 'localidades',        keyPath: 'id' },
  // → Agregar aquí nuevas tablas según se expanda el sistema
];

let _idbPromise = null;

export function getIDB() {
  if (!_idbPromise) {
    _idbPromise = new Promise((resolve, reject) => {
      try {
        const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const store of IDB_STORES) {
            if (!db.objectStoreNames.contains(store.name)) {
              db.createObjectStore(store.name, { keyPath: store.keyPath });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror  = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }
  return _idbPromise;
}

// ---------------------------------------------------------------------------
// Helpers genéricos de IDB (read / write / delete / clear)
// Se exportan para que los repositorios los usen sin duplicar código
// ---------------------------------------------------------------------------
export async function idbPut(storeName, record) {
  try {
    const db = await getIDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    return true;
  } catch (err) {
    console.warn(`[IDB] put ${storeName}:`, err);
    return false;
  }
}

export async function idbGetAll(storeName) {
  try {
    const db = await getIDB();
    const tx = db.transaction(storeName, 'readonly');
    return await new Promise((resolve) => {
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    });
  } catch (err) {
    console.warn(`[IDB] getAll ${storeName}:`, err);
    return [];
  }
}

export async function idbDelete(storeName, id) {
  try {
    const db = await getIDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    return true;
  } catch (err) {
    console.warn(`[IDB] delete ${storeName}:`, err);
    return false;
  }
}

export async function idbClear(storeName) {
  try {
    const db = await getIDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    return true;
  } catch (err) {
    console.warn(`[IDB] clear ${storeName}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap principal — llamar una sola vez al arrancar la app
// ---------------------------------------------------------------------------
export async function initDatabase() {
  // 1. Intentar conectar a SQLite (solo disponible dentro de Tauri)
  const invoke = window.__TAURI__?.core?.invoke;

  if (typeof invoke === 'function') {
    try {
      const dbPath = await invoke('plugin:sql|load', {
        db: DB_NAME,
        options: {}
      });

      _sqliteConn = {
        path: dbPath,
        execute(query, values = []) {
          return invoke('plugin:sql|execute', { db: dbPath, query, values: values ?? [] });
        },
        select(query, values = []) {
          return invoke('plugin:sql|select', { db: dbPath, query, values: values ?? [] });
        }
      };

      _sqliteReady = true;
      console.info(`[DB] SQLite conectado → ${DB_NAME}`);
    } catch (err) {
      console.warn('[DB] SQLite no disponible, se usará IndexedDB:', err);
      _sqliteReady = false;
    }
  } else {
    console.info('[DB] Entorno sin Tauri — usando sólo IndexedDB.');
    _sqliteReady = false;
  }

  // 2. Inicializar respaldo IndexedDB (siempre)
  try {
    await getIDB();
    console.info('[DB] IndexedDB listo.');
  } catch (err) {
    console.warn('[DB] IndexedDB error:', err);
  }

  // 3. Correr migraciones de esquema SQLite
  if (_sqliteReady) {
    const { runMigrations } = await import('./migrations.js');
    await runMigrations(_sqliteConn);
  }

  return { sqlite: _sqliteReady, dbName: DB_NAME };
}

