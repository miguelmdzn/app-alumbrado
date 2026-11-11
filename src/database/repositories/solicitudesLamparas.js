/**
 * ============================================================================
 * DATABASE / REPOSITORIES / SOLICITUDES DE INSTALACIÓN DE LÁMPARAS
 * ============================================================================
 * Tabla independiente de los reportes de falla.
 * Comparte los mismos valores de tipo de localidad que los reportes normales.
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

const TABLE = 'solicitudes_instalacion_lamparas';

const TIPO_CABECERA = 'Cabecera municipal (Valle de Santiago)';
const TIPO_COMUNIDAD = 'Comunidad';

function normalizeEstatus(value) {
  const v = String(value || '').trim();
  if (!v) return 'En espera';
  const lower = v.toLowerCase();
  if (lower === 'atendido' || lower === 'atendida') return 'Atendido';
  if (lower === 'en espera') return 'En espera';
  if (lower === 'pendiente') return 'Pendiente';
  if (lower === 'urgente') return 'Urgente';
  const m = v.match(/^otro\s*\((.*)\)\s*$/i);
  if (m) return `Otro(${m[1].trim()})`;
  return v;
}

function normalizeTipoLocalidad(value) {
  const v = String(value || '').trim();
  if (v === TIPO_COMUNIDAD) return TIPO_COMUNIDAD;
  return TIPO_CABECERA;
}

function toRecord(data, uuid) {
  return {
    id: uuid,
    nombre_solicitante: (data.nombre_solicitante || data.nombreSolicitante || '').trim(),
    fecha_solicitud: (data.fecha_solicitud || data.fechaSolicitud || '').trim(),
    tipo_localidad: normalizeTipoLocalidad(data.tipo_localidad || data.tipoLocalidad),
    colonia_comunidad: (data.colonia_comunidad || data.colonia || '').trim(),
    descripcion: (data.descripcion || '').trim(),
    estatus: normalizeEstatus(data.estatus),
    cantidad_lamparas: parseInt(data.cantidad_lamparas || data.cantidadLamparas, 10) || 1,
    observaciones: (data.observaciones || '').trim(),
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function saveSolicitudLampara(data) {
  const uuid = data.id && String(data.id).includes('-') ? data.id : generateUUID();
  const record = toRecord(data, uuid);

  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `INSERT OR REPLACE INTO ${TABLE} (
           id, nombre_solicitante, fecha_solicitud, tipo_localidad, colonia_comunidad,
           descripcion, estatus, cantidad_lamparas, observaciones, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           COALESCE((SELECT created_at FROM ${TABLE} WHERE id = $1), CURRENT_TIMESTAMP),
           CURRENT_TIMESTAMP
         );`,
        [
          record.id,
          record.nombre_solicitante,
          record.fecha_solicitud,
          record.tipo_localidad,
          record.colonia_comunidad,
          record.descripcion,
          record.estatus,
          record.cantidad_lamparas,
          record.observaciones,
        ]
      );
    } catch (err) {
      console.error('[solicitudes_lamparas] Error al guardar en SQLite:', err);
    }
  }

  await idbPut(TABLE, record);
  return record;
}

export async function getAllSolicitudesLamparas() {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE}
         ORDER BY fecha_solicitud DESC, created_at DESC;`
      );
      if (Array.isArray(rows)) {
        if (rows.length === 0) await idbClear(TABLE);
        return rows;
      }
    } catch (err) {
      console.error('[solicitudes_lamparas] Error al consultar SQLite:', err);
    }
  }

  const rows = await idbGetAll(TABLE);
  if (rows && rows.length > 0) {
    rows.sort((a, b) => {
      const ka = (b.fecha_solicitud || '') + (b.created_at || '');
      const kb = (a.fecha_solicitud || '') + (a.created_at || '');
      return ka.localeCompare(kb);
    });
  }
  return rows || [];
}

export async function getSolicitudLamparaById(id) {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`,
        [id]
      );
      if (rows && rows.length > 0) return rows[0];
    } catch (err) {
      console.error('[solicitudes_lamparas] Error al buscar en SQLite:', err);
    }
  }

  const all = await idbGetAll(TABLE);
  return all.find((r) => r.id === id) || null;
}

export async function deleteSolicitudLampara(id) {
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error('[solicitudes_lamparas] Error al eliminar en SQLite:', err);
    }
  }

  await idbDelete(TABLE, id);
  return true;
}
