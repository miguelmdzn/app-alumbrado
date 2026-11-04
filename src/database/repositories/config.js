/**
 * ============================================================================
 * DATABASE / REPOSITORIES / CONFIG_BITACORA — Alumbrado Público
 * ============================================================================
 * Repositorio de la tabla `config_bitacora`.
 * Almacena pares clave/valor de configuración del sistema.
 * Usada actualmente para guardar los metadatos de la bitácora diaria
 * (Fecha, Área, Elaboró, Revisó), pero disponible para cualquier módulo.
 *
 * Convención de claves:  "<modulo>.<param>"
 *   p.ej.  "bitacora.fecha", "bitacora.area", "sistema.version"
 * ============================================================================
 */

import {
  getSQLite,
  isSQLiteReady,
  idbPut,
  idbGetAll,
} from '../core.js';

const TABLE = 'config_bitacora';

/**
 * Guarda o actualiza uno o varios pares clave/valor.
 *
 * @param {Record<string, string>} entries - Objeto plano { clave: valor }
 */
export async function saveConfig(entries) {
  const pairs = Object.entries(entries);

  if (isSQLiteReady()) {
    for (const [clave, valor] of pairs) {
      try {
        await getSQLite().execute(
          `INSERT OR REPLACE INTO ${TABLE} (clave, valor, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP);`,
          [clave, String(valor ?? '')]
        );
      } catch (err) {
        console.warn(`[config_bitacora] SQLite save "${clave}":`, err);
      }
    }
  }

  for (const [clave, valor] of pairs) {
    await idbPut(TABLE, { clave, valor: String(valor ?? '') });
  }

  // Respaldo localStorage
  try {
    const current = JSON.parse(localStorage.getItem('ap_config_cache') || '{}');
    for (const [k, v] of pairs) current[k] = String(v ?? '');
    localStorage.setItem('ap_config_cache', JSON.stringify(current));
  } catch (_) {}
}

/**
 * Carga todos los pares clave/valor y los devuelve como objeto plano.
 *
 * @returns {Record<string, string>|null}
 */
export async function loadConfig() {
  // 1. SQLite
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(`SELECT clave, valor FROM ${TABLE};`);
      if (rows && rows.length > 0) {
        return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
      }
    } catch (err) {
      console.warn('[config_bitacora] SQLite load error:', err);
    }
  }

  // 2. IndexedDB
  const rows = await idbGetAll(TABLE);
  if (rows && rows.length > 0) {
    return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  }

  // 3. localStorage
  try {
    const local = localStorage.getItem('ap_config_cache');
    if (local) return JSON.parse(local);
  } catch (_) {}

  return null;
}

// ---------------------------------------------------------------------------
// Alias semánticos para metadatos de la bitácora (compatibilidad con main.js)
// ---------------------------------------------------------------------------

/**
 * Guarda los metadatos generales de la bitácora.
 * @param {{ fecha, area, elab, reviso }} meta
 */
export async function saveMetadatos(meta) {
  const mapped = {
    'bitacora.fecha':  meta.fecha  ?? '',
    'bitacora.area':   meta.area   ?? '',
    'bitacora.elab':   meta.elab   ?? '',
    'bitacora.reviso': meta.reviso ?? '',
  };
  return saveConfig(mapped);
}

/**
 * Carga los metadatos generales de la bitácora.
 * @returns {{ fecha, area, elab, reviso }|null}
 */
export async function loadMetadatos() {
  const all = await loadConfig();
  if (!all) return null;
  return {
    fecha:  all['bitacora.fecha']  ?? '',
    area:   all['bitacora.area']   ?? '',
    elab:   all['bitacora.elab']   ?? '',
    reviso: all['bitacora.reviso'] ?? '',
  };
}

