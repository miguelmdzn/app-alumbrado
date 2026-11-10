/**
 * ============================================================================
 * DATABASE / REPOSITORIES / LOCALIDADES — Alumbrado Público
 * ============================================================================
 * Repositorio para el catálogo de localidades (colonias y comunidades).
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

const TABLE = 'localidades';

// ---------------------------------------------------------------------------
// Mapper: normalización de datos
// ---------------------------------------------------------------------------
function toRecord(data, id) {
  return {
    id,
    nombre: (data.nombre || '').trim().toUpperCase(),
    tipo: (data.tipo || 'Cabecera municipal').trim(),
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// API pública del repositorio
// ---------------------------------------------------------------------------

/**
 * Obtiene todas las localidades ordenadas por tipo y nombre
 */
export async function getAllLocalidades() {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE} ORDER BY tipo ASC, nombre ASC;`
      );
      if (Array.isArray(rows)) return rows;
    } catch (err) {
      console.error('[localidades] Error al consultar SQLite:', err);
    }
  }

  const rows = await idbGetAll(TABLE);
  if (rows && rows.length > 0) {
    rows.sort((a, b) => {
      const t = (a.tipo || '').localeCompare(b.tipo || '');
      if (t !== 0) return t;
      return (a.nombre || '').localeCompare(b.nombre || '');
    });
  }
  return rows || [];
}

/**
 * Busca localidades por nombre (búsqueda parcial, para autocomplete)
 * @param {string} query - Texto a buscar
 * @param {string} [tipo] - Filtrar también por tipo si se proporciona
 */
export async function searchLocalidades(query, tipo = null) {
  const q = (query || '').trim().toUpperCase();
  if (!q) return getAllLocalidades();

  if (isSQLiteReady()) {
    try {
      let sql = `SELECT * FROM ${TABLE} WHERE nombre LIKE $1`;
      const params = [`%${q}%`];
      if (tipo) {
        sql += ` AND tipo = $2`;
        params.push(tipo);
      }
      sql += ` ORDER BY nombre ASC LIMIT 20;`;
      const rows = await getSQLite().select(sql, params);
      if (Array.isArray(rows)) return rows;
    } catch (err) {
      console.error('[localidades] Error en searchLocalidades:', err);
    }
  }

  // Fallback IDB
  const all = await idbGetAll(TABLE);
  return (all || []).filter((r) => {
    const match = (r.nombre || '').toUpperCase().includes(q);
    return tipo ? match && r.tipo === tipo : match;
  }).slice(0, 20);
}

/**
 * Guarda una nueva localidad (INSERT OR IGNORE por nombre+tipo para evitar duplicados)
 */
export async function saveLocalidad(data) {
  const id = data.id || generateUUID();
  const record = toRecord(data, id);

  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `INSERT OR IGNORE INTO ${TABLE} (id, nombre, tipo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5);`,
        [record.id, record.nombre, record.tipo, record.created_at, record.updated_at]
      );
    } catch (err) {
      console.error('[localidades] Error al guardar en SQLite:', err);
    }
  }

  await idbPut(TABLE, record);
  return record;
}

/**
 * Actualiza una localidad existente por su ID
 */
export async function updateLocalidad(id, data) {
  const nombre = (data.nombre || '').trim().toUpperCase();
  const tipo   = (data.tipo || 'Cabecera municipal').trim();
  const updated = new Date().toISOString();

  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `UPDATE ${TABLE} SET nombre = $1, tipo = $2, updated_at = $3 WHERE id = $4;`,
        [nombre, tipo, updated, id]
      );
    } catch (err) {
      console.error('[localidades] Error al actualizar en SQLite:', err);
    }
  }

  // Actualizar IDB
  const all = await idbGetAll(TABLE);
  const existing = (all || []).find((r) => r.id === id);
  if (existing) {
    await idbPut(TABLE, { ...existing, nombre, tipo, updated_at: updated });
  }

  return { id, nombre, tipo, updated_at: updated };
}

/**
 * Elimina una localidad por ID
 */
export async function deleteLocalidad(id) {
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error('[localidades] Error al eliminar en SQLite:', err);
    }
  }

  await idbDelete(TABLE, id);
  return true;
}

/**
 * Busca o crea una localidad por nombre y tipo.
 * Si ya existe (misma combinación nombre+tipo), devuelve el existente.
 * Si no existe, lo inserta y devuelve el nuevo registro.
 * Usado al guardar un reporte para auto-registrar localidades nuevas.
 *
 * @param {string} nombre
 * @param {string} tipo
 * @returns {Promise<object>} - Registro de localidad
 */
export async function findOrCreateLocalidad(nombre, tipo) {
  const n = (nombre || '').trim().toUpperCase();
  const t = (tipo || 'Cabecera municipal').trim();
  if (!n) return null;

  // 1. Buscar en SQLite
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE} WHERE nombre = $1 AND tipo = $2 LIMIT 1;`,
        [n, t]
      );
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
    } catch (err) {
      console.error('[localidades] Error en findOrCreateLocalidad (select):', err);
    }
  }

  // 2. Buscar en IDB
  const all = await idbGetAll(TABLE);
  const found = (all || []).find(
    (r) => (r.nombre || '').toUpperCase() === n && r.tipo === t
  );
  if (found) return found;

  // 3. No existe → insertar
  return saveLocalidad({ nombre: n, tipo: t });
}

