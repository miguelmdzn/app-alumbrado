/**
 * ============================================================================
 * DATABASE / PHOTO ANCHOR — Día de la primera foto de un folio
 * ============================================================================
 * El Año/Mes/Semana/Día de la carpeta no cambia cuando se agregan más fotos
 * o atenciones en días posteriores. Se toma de la ruta más antigua ya guardada.
 * ============================================================================
 */

import { getSQLite, isSQLiteReady, idbGetAll } from './core.js';
import { earliestAnchorDate } from './storage.js';

function pushPaths(target, rows) {
  (rows || []).forEach((row) => {
    if (row?.foto1) target.push(row.foto1);
    if (row?.foto2) target.push(row.foto2);
  });
}

async function pathsFromSqlite(folioKey) {
  const db = getSQLite();
  const paths = [];

  try {
    const evidencias = await db.select(
      `SELECT foto1, foto2 FROM evidencias WHERE lower(trim(folio)) = $1;`,
      [folioKey]
    );
    pushPaths(paths, evidencias);
  } catch (err) {
    console.warn('[photoAnchor] No se pudieron leer evidencias:', err);
  }

  try {
    const atenciones = await db.select(
      `SELECT foto1, foto2 FROM atenciones WHERE lower(trim(folio)) = $1;`,
      [folioKey]
    );
    pushPaths(paths, atenciones);
  } catch (err) {
    console.warn('[photoAnchor] No se pudieron leer atenciones:', err);
  }

  return paths;
}

async function pathsFromIdb(folioKey) {
  const paths = [];
  try {
    const evidencias = await idbGetAll('evidencias');
    pushPaths(
      paths,
      (evidencias || []).filter((row) => String(row.folio || '').trim().toLowerCase() === folioKey)
    );
  } catch (err) {
    console.warn('[photoAnchor] IDB evidencias:', err);
  }

  try {
    const atenciones = await idbGetAll('atenciones');
    pushPaths(
      paths,
      (atenciones || []).filter((row) => String(row.folio || '').trim().toLowerCase() === folioKey)
    );
  } catch (err) {
    console.warn('[photoAnchor] IDB atenciones:', err);
  }

  return paths;
}

/**
 * Fecha YYYY-MM-DD del primer archivo fotográfico del folio, o null si aún no hay fotos.
 */
export async function resolveFolioAnchorDate(folio) {
  const folioKey = String(folio || '').trim().toLowerCase();
  if (!folioKey) return null;

  const paths = isSQLiteReady()
    ? await pathsFromSqlite(folioKey)
    : await pathsFromIdb(folioKey);

  return earliestAnchorDate(paths);
}
