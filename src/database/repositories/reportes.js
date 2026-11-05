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
  generateUUID,
} from '../core.js';

const TABLE = 'reportes';

// ---------------------------------------------------------------------------
// Mapper: Normalización de datos para la base de datos
// ---------------------------------------------------------------------------
function normalizeEstatus(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'atendido' || v === 'atendida') return 'atendido';
  return 'pendiente';
}

function toRecord(data, uuid) {
  return {
    id:                uuid,
    folio:             (data.folio || '').trim(),
    fecha:             (data.fecha || '').trim(),
    atendio:           (data.atendio || '').trim(),
    usuario:           (data.usuario || '').trim(),
    direccion:         (data.direccion || '').trim(),
    colonia_comunidad: (data.colonia_comunidad || data.colonia || '').trim(),
    telefono:          (data.telefono || '').trim(),
    numero_lamparas:   parseInt(data.numero_lamparas || data.numeroLamparas, 10) || 1,
    tipo_lampara:      (data.tipo_lampara || data.tipoLampara || '').trim(),
    tipo_falla:        (data.tipo_falla || data.tipoFalla || '').trim(),
    observaciones:     (data.observaciones || '').trim(),
    referencias:       (data.referencias || '').trim(),
    entre_calles:      (data.entre_calles || data.entreCalles || '').trim(),
    estatus:           normalizeEstatus(data.estatus),
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
           referencias, entre_calles, estatus, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP
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
        ]
      );
    } catch (err) {
      console.error(`[reportes] Error al guardar en SQLite:`, err);
    }
  }

  // 2. Respaldo en IndexedDB
  await idbPut(TABLE, record);

  return record;
}

/**
 * Obtiene todos los reportes ordenados cronológicamente
 */
export async function getAllReportes() {
  let rows = [];

  // 1. Intentar desde SQLite
  if (isSQLiteReady()) {
    try {
      rows = await getSQLite().select(
        `SELECT * FROM ${TABLE}
         ORDER BY fecha DESC, created_at DESC;`
      );
    } catch (err) {
      console.error(`[reportes] Error al consultar SQLite:`, err);
    }
  }

  // 2. Fallback IndexedDB
  if (!rows || rows.length === 0) {
    rows = await idbGetAll(TABLE);
    if (rows && rows.length > 0) {
      rows.sort((a, b) => {
        const ka = (b.fecha || '') + (b.created_at || '');
        const kb = (a.fecha || '') + (a.created_at || '');
        return ka.localeCompare(kb);
      });
    }
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

