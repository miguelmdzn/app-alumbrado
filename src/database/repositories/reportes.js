/**
 * ============================================================================
 * DATABASE / REPOSITORIES / REPORTES — Alumbrado Público
 * ============================================================================
 * Repositorio para la gestión de reportes de fallas y lámparas.
 * Almacena en SQLite con respaldo en IndexedDB.
 * ============================================================================
 */

import {
  getSQLite,
  isSQLiteReady,
  idbPut,
  idbGetAll,
  idbDelete,
  idbClear,
  generateUUID,
} from '../core.js';

import { findOrCreateLocalidad } from './localidades.js';
import { enqueueRecord, processSyncQueue } from './syncQueue.js';

const TABLE = 'reportes';

// ---------------------------------------------------------------------------
// Mapper: Normalización de datos para la base de datos
// ---------------------------------------------------------------------------
function normalizeEstatus(value) {
  const v = String(value || '').trim();
  if (!v) return 'En espera';
  const lower = v.toLowerCase();
  if (lower === 'atendido' || lower === 'atendida') return 'Atendido';
  if (lower === 'en espera') return 'En espera';
  if (lower === 'pendiente') return 'Pendiente';
  if (lower === 'urgente') return 'Urgente';
  const m = v.match(/^otro\s*\((.*)\)\s*$/i);
  if (m) {
    return `Otro(${m[1].trim()})`;
  }
  return v;
}

function toRecord(data, uuid) {
  return {
    id: uuid,
    folio: (data.folio || '').trim(),
    fecha: (data.fecha || '').trim(),
    atendio: (data.atendio || '').trim(),
    usuario: (data.usuario || '').trim(),
    direccion: (data.direccion || '').trim(),
    colonia_comunidad: (data.colonia_comunidad || data.colonia || '').trim(),
    telefono: (data.telefono || '').trim(),
    numero_lamparas: parseInt(data.numero_lamparas || data.numeroLamparas, 10) || 1,
    tipo_lampara: (data.tipo_lampara || data.tipoLampara || '').trim(),
    tipo_falla: (data.tipo_falla || data.tipoFalla || '').trim(),
    observaciones: (data.observaciones || '').trim(),
    referencias: (data.referencias || '').trim(),
    entre_calles: (data.entre_calles || data.entreCalles || '').trim(),
    estatus: normalizeEstatus(data.estatus),
    tipo_localidad: (data.tipo_localidad || 'Cabecera municipal (Valle de Santiago)').trim(),
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// API pública del repositorio
// ---------------------------------------------------------------------------

/**
 * Guarda o actualiza un reporte en SQLite e IndexedDB
 */
export async function saveReporte(reportData) {
  const uuid = reportData.id && reportData.id.includes('-') ? reportData.id : generateUUID();
  const record = toRecord(reportData, uuid);

  // 1. Guardar en SQLite si está disponible
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `INSERT OR REPLACE INTO ${TABLE} (
           id, folio, fecha, atendio, usuario, direccion, colonia_comunidad,
           telefono, numero_lamparas, tipo_lampara, tipo_falla, observaciones,
           referencias, entre_calles, estatus, tipo_localidad, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
           COALESCE((SELECT created_at FROM ${TABLE} WHERE id = $1), CURRENT_TIMESTAMP),
           CURRENT_TIMESTAMP
         );`,
        [
          record.id,
          record.folio,
          record.fecha,
          record.atendio,
          record.usuario,
          record.direccion,
          record.colonia_comunidad,
          record.telefono,
          record.numero_lamparas,
          record.tipo_lampara,
          record.tipo_falla,
          record.observaciones,
          record.referencias,
          record.entre_calles,
          record.estatus,
          record.tipo_localidad,
        ]
      );
    } catch (err) {
      console.error(`[reportes] Error al guardar en SQLite:`, err);
    }
  }

  // 2. Respaldo en IndexedDB
  await idbPut(TABLE, record);

  // 3. Auto-registrar localidad si hay nombre de colonia/comunidad
  if (record.colonia_comunidad) {
    try {
      // Mapeamos el tipo_localidad del reporte al tipo de localidad
      const tipoLocalidad = record.tipo_localidad === 'Comunidad'
        ? 'Comunidad'
        : 'Cabecera municipal';
      await findOrCreateLocalidad(record.colonia_comunidad, tipoLocalidad);
    } catch (err) {
      console.warn('[reportes] No se pudo auto-registrar localidad:', err);
    }
  }

  // 4. Encolar en la cola de sincronización para Google Sheets (offline-first)
  try {
    await enqueueRecord('reportes', record.id, record);
    // Disparar sincronización en segundo plano con Google Apps Script
    processSyncQueue('reportes').catch((err) => {
      console.warn('[reportes] Sincronización en cola pendiente:', err);
    });
  } catch (err) {
    console.warn('[reportes] Error al encolar en syncQueue:', err);
  }

  return record;
}

/**
 * Obtiene todos los reportes ordenados cronológicamente
 */
export async function getAllReportes() {
  // 1. Intentar desde SQLite (fuente autoritativa en Tauri)
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE}
         ORDER BY fecha DESC, created_at DESC;`
      );
      if (Array.isArray(rows)) {
        if (rows.length === 0) {
          // Si la tabla fue limpiada en SQLite, limpiamos también la caché de IndexedDB
          await idbClear(TABLE);
        }
        return rows;
      }
    } catch (err) {
      console.error(`[reportes] Error al consultar SQLite:`, err);
    }
  }

  // 2. Fallback IndexedDB SOLO si SQLite no está listo o falló la conexión
  const rows = await idbGetAll(TABLE);
  if (rows && rows.length > 0) {
    rows.sort((a, b) => {
      const ka = (b.fecha || '') + (b.created_at || '');
      const kb = (a.fecha || '') + (a.created_at || '');
      return ka.localeCompare(kb);
    });
  }

  return rows || [];
}

/**
 * Elimina un reporte por su UUID
 */
export async function deleteReporte(id) {
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error(`[reportes] Error al eliminar en SQLite:`, err);
    }
  }

  await idbDelete(TABLE, id);
  return true;
}

/**
 * Obtiene un reporte específico por su ID
 */
export async function getReporteById(id) {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(`SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`, [id]);
      if (rows && rows.length > 0) return rows[0];
    } catch (err) {
      console.error(`[reportes] Error al buscar en SQLite:`, err);
    }
  }

  const all = await idbGetAll(TABLE);
  return all.find((r) => r.id === id) || null;
}

