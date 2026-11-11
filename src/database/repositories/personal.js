/**
 * ============================================================================
 * DATABASE / REPOSITORIES / PERSONAL — Alumbrado Público
 * ============================================================================
 * Repositorio para la gestión de plantilla de personal y trabajadores.
 * Almacena en SQLite con respaldo en IndexedDB.
 * Ningún campo es obligatorio según requerimientos.
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

const TABLE = 'personal';

/**
 * Obtiene el nombre completo de un trabajador
 * @param {object} p - Objeto con nombres, apellido1, apellido2
 * @returns {string} Nombre completo formateado
 */
export function getFullName(p) {
  if (!p) return '';
  const parts = [p.nombres, p.apellido1, p.apellido2]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Mapper: Normalización de datos para la base de datos
// ---------------------------------------------------------------------------
function toRecord(data, uuid) {
  return {
    id:                       uuid,
    nombres:                  (data.nombres || '').trim(),
    apellido1:                (data.apellido1 || '').trim(),
    apellido2:                (data.apellido2 || '').trim(),
    cargo:                    (data.cargo || '').trim(),
    numero_trabajador:        (data.numero_trabajador ?? data.numeroTrabajador ?? '').toString().trim(),
    numero_checador_digital:  (data.numero_checador_digital ?? data.numeroChecadorDigital ?? '').toString().trim(),
    estatus:                  (data.estatus || 'Activo').trim(),
  };
}

// ---------------------------------------------------------------------------
// API pública del repositorio
// ---------------------------------------------------------------------------

/**
 * Guarda o actualiza un trabajador en SQLite e IndexedDB
 */
export async function savePersonal(personalData) {
  const uuid = personalData.id && personalData.id.includes('-')
    ? personalData.id
    : generateUUID();
  const record = toRecord(personalData, uuid);

  // 1. Guardar en SQLite si está disponible
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `INSERT OR REPLACE INTO ${TABLE} (
           id, nombres, apellido1, apellido2, cargo,
           numero_trabajador, numero_checador_digital, estatus, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP
         );`,
        [
          record.id,
          record.nombres,
          record.apellido1,
          record.apellido2,
          record.cargo,
          record.numero_trabajador,
          record.numero_checador_digital,
          record.estatus,
        ]
      );
    } catch (err) {
      console.error(`[personal] Error al guardar en SQLite:`, err);
    }
  }

  // 2. Respaldo en IndexedDB
  await idbPut(TABLE, record);

  return record;
}

/**
 * Obtiene todo el personal registrado ordenado por nombre
 */
export async function getAllPersonal() {
  // 1. Intentar desde SQLite (fuente autoritativa en Tauri)
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE}
         ORDER BY CASE WHEN estatus = 'Activo' THEN 0 ELSE 1 END,
                  nombres ASC, apellido1 ASC, created_at DESC;`
      );
      console.info('[personal] SQLite rows devueltos:', Array.isArray(rows) ? rows.length : typeof rows);
      if (Array.isArray(rows)) {
        if (rows.length === 0) {
          await idbClear(TABLE);
        }
        return rows;
      }
    } catch (err) {
      console.error(`[personal] Error al consultar SQLite:`, err);
    }
  } else {
    console.warn('[personal] isSQLiteReady() = false → usando IndexedDB');
  }

  // 2. Fallback IndexedDB SOLO si SQLite no está disponible o falló la conexión
  const rows = await idbGetAll(TABLE);
  if (rows && rows.length > 0) {
    rows.sort((a, b) => {
      const ea = (a.estatus || 'Activo') === 'Activo' ? 0 : 1;
      const eb = (b.estatus || 'Activo') === 'Activo' ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const na = getFullName(a);
      const nb = getFullName(b);
      return na.localeCompare(nb);
    });
  }

  return rows || [];
}

/**
 * Obtiene un trabajador por su ID
 */
export async function getPersonalById(id) {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(`SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`, [id]);
      if (rows && rows.length > 0) return rows[0];
    } catch (err) {
      console.error(`[personal] Error al buscar en SQLite:`, err);
    }
  }

  const all = await idbGetAll(TABLE);
  return all.find((r) => r.id === id) || null;
}

/**
 * Elimina un trabajador por su ID
 */
export async function deletePersonal(id) {
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error(`[personal] Error al eliminar en SQLite:`, err);
    }
  }

  await idbDelete(TABLE, id);
  return true;
}

