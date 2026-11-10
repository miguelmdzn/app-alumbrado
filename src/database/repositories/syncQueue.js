/**
 * ============================================================================
 * DATABASE / REPOSITORIES / SYNC_QUEUE — Alumbrado Público
 * ============================================================================
 * Cola de sincronización offline-first para Google Sheets (vía Google Apps Script).
 * Garantiza:
 *   - Funcionamiento sin conexión a Internet (almacenamiento en SQLite local).
 *   - Si un registro pendiente se modifica localmente, se actualiza el payload más reciente.
 *   - Reintentos controlados y registro de errores detallados.
 *   - Verificación estricta de que la respuesta tenga { success: true }.
 * ============================================================================
 */

import { getSQLite, isSQLiteReady } from '../core.js';

const TABLE = 'sync_queue';

/**
 * Agrega o actualiza un registro en la cola de sincronización.
 * Si ya existe uno pendiente/fallido para la misma tabla y record_id,
 * se actualiza con la versión más reciente del payload.
 *
 * @param {string} tableName - Nombre de la entidad (ej: 'personal', 'reportes')
 * @param {string} recordId  - Identificador único del registro local
 * @param {object} payload   - Datos del registro a enviar
 */
export async function enqueueRecord(tableName, recordId, payload) {
  if (!tableName || !recordId || !payload) return false;

  const payloadJson = JSON.stringify(payload);
  const conn = getSQLite();

  if (conn && isSQLiteReady()) {
    try {
      await conn.execute(
        `INSERT INTO ${TABLE} (table_name, record_id, payload_json, status, retry_count, updated_at)
         VALUES ($1, $2, $3, 'pending', 0, CURRENT_TIMESTAMP)
         ON CONFLICT(table_name, record_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           status = 'pending',
           retry_count = 0,
           updated_at = CURRENT_TIMESTAMP;`,
        [tableName, String(recordId), payloadJson]
      );
      return true;
    } catch (err) {
      console.error(`[SyncQueue] Error al encolar en SQLite (${tableName}:${recordId}):`, err);
    }
  }

  return false;
}

/**
 * Obtiene los registros pendientes o con fallas previas listos para reintento.
 *
 * @param {string|null} tableName - Filtrar por tabla opcional
 * @param {number} limit          - Máximo de elementos a procesar en un lote
 */
export async function getPendingItems(tableName = null, limit = 50) {
  const conn = getSQLite();
  if (!conn || !isSQLiteReady()) return [];

  try {
    if (tableName) {
      return await conn.select(
        `SELECT id, table_name, record_id, payload_json, retry_count, last_error
         FROM ${TABLE}
         WHERE table_name = $1 AND status IN ('pending', 'failed')
         ORDER BY id ASC
         LIMIT $2;`,
        [tableName, limit]
      );
    }

    return await conn.select(
      `SELECT id, table_name, record_id, payload_json, retry_count, last_error
       FROM ${TABLE}
       WHERE status IN ('pending', 'failed')
       ORDER BY id ASC
       LIMIT $1;`,
      [limit]
    );
  } catch (err) {
    console.error('[SyncQueue] Error al obtener registros pendientes:', err);
    return [];
  }
}

/**
 * Marca un elemento como sincronizado con éxito.
 */
export async function markSynced(queueId) {
  const conn = getSQLite();
  if (!conn || !isSQLiteReady()) return;

  try {
    await conn.execute(
      `UPDATE ${TABLE}
       SET status = 'synced',
           last_error = NULL,
           synced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1;`,
      [queueId]
    );
  } catch (err) {
    console.error(`[SyncQueue] Error al marcar sincronizado ID ${queueId}:`, err);
  }
}

/**
 * Registra un fallo en la sincronización conservando el error y aumentando reintentos.
 */
export async function markFailed(queueId, errorMessage) {
  const conn = getSQLite();
  if (!conn || !isSQLiteReady()) return;

  try {
    await conn.execute(
      `UPDATE ${TABLE}
       SET status = 'failed',
           last_error = $2,
           retry_count = retry_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1;`,
      [queueId, String(errorMessage || 'Error desconocido').slice(0, 500)]
    );
  } catch (err) {
    console.error(`[SyncQueue] Error al marcar fallo ID ${queueId}:`, err);
  }
}

/**
 * Procesa la cola de sincronización enviando registros pendientes a Google Apps Script
 * mediante el backend de Rust. Solo marca como exitoso si success === true.
 *
 * @param {string|null} tableName - Filtrar por tabla específica opcional
 * @returns {Promise<{ total: number, synced: number, failed: number, reason?: string }>}
 */
export async function processSyncQueue(tableName = null) {
  if (!window.__TAURI__?.core?.invoke) {
    return { total: 0, synced: 0, failed: 0, reason: 'tauri_not_available' };
  }

  // Verificar si hay configuración activa antes de intentar
  try {
    const status = await window.__TAURI__.core.invoke('get_gas_config_status');
    if (!status?.is_configured) {
      return { total: 0, synced: 0, failed: 0, reason: 'not_configured' };
    }
  } catch (e) {
    return { total: 0, synced: 0, failed: 0, reason: 'config_read_error' };
  }

  const items = await getPendingItems(tableName, 50);
  if (!items || items.length === 0) {
    return { total: 0, synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    let payloadObj = null;
    try {
      payloadObj = JSON.parse(item.payload_json);
    } catch {
      await markFailed(item.id, 'JSON de payload inválido en base de datos');
      failed++;
      continue;
    }

    try {
      // Invocación segura hacia Rust (inyecta token desde el SO y sigue redirecciones)
      const res = await window.__TAURI__.core.invoke('send_gas_record', {
        table: item.table_name,
        action: 'upsert',
        record: payloadObj,
      });

      // Validación estricta: solo marcar como exitoso si res.success === true
      if (res && res.success === true) {
        await markSynced(item.id);
        synced++;
      } else {
        const errMsg = res?.error || 'Google Apps Script no confirmó éxito (success != true)';
        await markFailed(item.id, errMsg);
        failed++;
      }
    } catch (err) {
      const errMsg = err?.message || String(err);
      await markFailed(item.id, errMsg);
      failed++;
      // Si el error es de conexión de red, detener el lote para no saturar reintentos
      if (errMsg.toLowerCase().includes('conexión') || errMsg.toLowerCase().includes('internet')) {
        break;
      }
    }
  }

  return { total: items.length, synced, failed };
}

