/**
 * ============================================================================
 * DATABASE / REPOSITORIES / EVIDENCIAS — Alumbrado Público
 * ============================================================================
 * Repositorio exclusivo de la tabla `evidencias` (bitácora diaria).
 *
 * En la Base de Datos SQLite se almacena ÚNICAMENTE la referencia relativa:
 *   "2026/11-Noviembre/Semana-46/Dia-16/AP-2026-001/AP-2026-001_foto1_3b12f1df.jpg"
 *
 * El día de la carpeta es el primer día en que ese folio recibió una foto.
 * ============================================================================
 */

import {
  getSQLite,
  isSQLiteReady,
  idbPut,
  idbGetAll,
  idbDelete,
  idbClear,
  generateUUID
} from '../core.js';

import {
  loadEvidenceFile,
  deleteEvidenceFile,
  commitEvidencePhoto,
  localTodayIso,
} from '../storage.js';
import { resolveFolioAnchorDate } from '../photoAnchor.js';

const TABLE = 'evidencias';

function isValidCoord(v) {
  return v !== null && v !== undefined && !isNaN(v) && v !== '';
}

// ---------------------------------------------------------------------------
// Mapper: objeto del frontend -> registro de BD con referencias
// ---------------------------------------------------------------------------
function toRecord(report, uuid, refFoto1, refFoto2) {
  return {
    id:               uuid,
    folio:            report.folio            || '',
    solicitante:      report.solicita         || '',
    fecha_atencion:   report.fecha            || '',
    hora_atencion:    report.hora             || '',
    personal_atendio: report.atendio          || '',
    turno:            report.turno            || 'Matutino',
    ubicacion:        report.ubicacion        || '',
    latitud:          isValidCoord(report.lat)  ? Number(report.lat) : null,
    longitud:         isValidCoord(report.lon)  ? Number(report.lon) : null,
    altitud:          report.alt              || '',
    enlace_maps:      report.mapsUrl          || '',
    observaciones:    report.accion           || '',
    estatus:          report.estatus          || 'Atendido',
    tipo_reporte:     report.tipo             || '',
    foto1:            refFoto1                || null,
    foto2:            refFoto2                || null,
  };
}

// ---------------------------------------------------------------------------
// Mapper: registro de BD -> objeto del frontend
// ---------------------------------------------------------------------------
function toFrontend(r) {
  return {
    id:              r.id,
    folio:           r.folio            || '',
    solicita:        r.solicitante      || '',
    fecha:           r.fecha_atencion   || '',
    hora:            r.hora_atencion    || '',
    atendio:         r.personal_atendio || '',
    turno:           r.turno            || 'Matutino',
    ubicacion:       r.ubicacion        || '',
    lat:             isValidCoord(r.latitud)  ? Number(r.latitud)  : null,
    lon:             isValidCoord(r.longitud) ? Number(r.longitud) : null,
    alt:             r.altitud          || '',
    mapsUrl:         r.enlace_maps      || '',
    accion:          r.observaciones    || '',
    estatus:         r.estatus          || 'Atendido',
    tipo:            r.tipo_reporte     || '',
    fotoRefs:        [r.foto1 || null, r.foto2 || null],
    fotos:           [r.foto1 || null, r.foto2 || null],
    createdAt:       r.created_at       || null,
  };
}

// ---------------------------------------------------------------------------
// API pública del repositorio
// ---------------------------------------------------------------------------

/**
 * Inserta o actualiza un reporte en la BD.
 * Guarda las fotos en disco (Año/Mes/Semana/Día) y guarda sus referencias relativas en la BD.
 */
async function getExistingFotoRefs(id) {
  if (!id) return [null, null];
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT foto1, foto2 FROM ${TABLE} WHERE id = $1;`,
        [id]
      );
      if (!Array.isArray(rows)) return [null, null];
      if (rows[0]) return [rows[0].foto1 || null, rows[0].foto2 || null];
      return [null, null];
    } catch (err) {
      console.warn('[evidencias] No se pudieron leer fotos previas:', err);
    }
  }
  const all = await idbGetAll(TABLE);
  const row = (all || []).find((item) => item.id === id);
  return [row?.foto1 || null, row?.foto2 || null];
}

export async function saveEvidencia(report) {
  const uuid = report.id && report.id.includes('-') ? report.id : generateUUID();
  const folio = report.folio || 'reporte';
  const previous = await getExistingFotoRefs(uuid);
  const anchor = (await resolveFolioAnchorDate(folio)) || localTodayIso();

  const refFoto1 = await commitEvidencePhoto(
    report.fotos?.[0] || report.fotoRefs?.[0] || null,
    previous[0],
    { dateStr: anchor, folio, photoIndex: 1, reportId: uuid, subfolder: '' }
  );
  const refFoto2 = await commitEvidencePhoto(
    report.fotos?.[1] || report.fotoRefs?.[1] || null,
    previous[1],
    { dateStr: anchor, folio, photoIndex: 2, reportId: uuid, subfolder: '' }
  );

  const record = toRecord(report, uuid, refFoto1, refFoto2);

  // 2. Guardar en SQLite (la BD almacena ÚNICAMENTE la referencia del archivo)
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `INSERT OR REPLACE INTO ${TABLE} (
           id, folio, solicitante, fecha_atencion, hora_atencion,
           personal_atendio, turno, ubicacion, latitud, longitud,
           altitud, enlace_maps, observaciones, estatus, tipo_reporte,
           foto1, foto2, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP
         );`,
        [
          record.id, record.folio, record.solicitante,
          record.fecha_atencion, record.hora_atencion, record.personal_atendio,
          record.turno, record.ubicacion, record.latitud, record.longitud,
          record.altitud, record.enlace_maps, record.observaciones,
          record.estatus, record.tipo_reporte, record.foto1, record.foto2,
        ]
      );
    } catch (err) {
      console.error(`[evidencias] SQLite save error:`, err);
    }
  }

  // 3. Respaldo en IndexedDB
  await idbPut(TABLE, record);

  // 4. Cargar las imágenes para la vista en pantalla inmediata
  const imgUrl1 = await loadEvidenceFile(refFoto1);
  const imgUrl2 = await loadEvidenceFile(refFoto2);

  return {
    ...report,
    id: record.id,
    turno: record.turno,
    fotoRefs: [refFoto1, refFoto2],
    fotos: [imgUrl1, imgUrl2]
  };
}

/**
 * Devuelve todos los registros, obteniendo la referencia de la BD y cargando la imagen desde disco
 */
export async function getAllEvidencias() {
  let rows = null;

  // 1. Intentar desde SQLite (fuente autoritativa en Tauri)
  if (isSQLiteReady()) {
    try {
      const result = await getSQLite().select(
        `SELECT * FROM ${TABLE}
         ORDER BY fecha_atencion ASC, hora_atencion ASC, created_at ASC;`
      );
      if (Array.isArray(result)) {
        rows = result;
        if (rows.length === 0) {
          // Si la tabla fue limpiada en SQLite, limpiamos también la caché de IndexedDB
          await idbClear(TABLE);
        }
      }
    } catch (err) {
      console.error(`[evidencias] SQLite getAll error:`, err);
    }
  }

  // 2. Fallback IndexedDB SOLO si SQLite no estuvo disponible o falló la conexión
  if (rows === null) {
    rows = await idbGetAll(TABLE);
  }

  const items = (rows || []).map(toFrontend);

  // 3. Resolver y cargar cada imagen desde su carpeta en disco
  for (const item of items) {
    const f0 = item.fotoRefs[0] ? await loadEvidenceFile(item.fotoRefs[0]) : null;
    const f1 = item.fotoRefs[1] ? await loadEvidenceFile(item.fotoRefs[1]) : null;
    item.fotos = [f0, f1];
  }

  return items;
}

/**
 * Obtiene un registro de evidencia específico por su UUID con sus fotos
 */
export async function getEvidenciaById(id) {
  let row = null;
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(`SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`, [id]);
      if (rows && rows.length > 0) row = rows[0];
    } catch (err) {
      console.error(`[evidencias] SQLite getById error:`, err);
    }
  }

  if (!row) {
    const all = await idbGetAll(TABLE);
    row = all.find((x) => x.id === id);
  }

  if (!row) return null;

  const item = toFrontend(row);
  const f0 = item.fotoRefs[0] ? await loadEvidenceFile(item.fotoRefs[0]) : null;
  const f1 = item.fotoRefs[1] ? await loadEvidenceFile(item.fotoRefs[1]) : null;
  item.fotos = [f0, f1];
  return item;
}

/**
 * Elimina un registro por su UUID y borra sus archivos en disco
 */
export async function deleteEvidencia(id) {
  // 1. Obtener registro para saber qué archivos borrar de disco
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(`SELECT foto1, foto2 FROM ${TABLE} WHERE id = $1;`, [id]);
      if (rows && rows.length > 0) {
        if (rows[0].foto1) await deleteEvidenceFile(rows[0].foto1);
        if (rows[0].foto2) await deleteEvidenceFile(rows[0].foto2);
      }
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error(`[evidencias] SQLite delete error:`, err);
    }
  }

  await idbDelete(TABLE, id);
}

/**
 * Elimina todos los registros de la tabla
 */
export async function clearAllEvidencias() {
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE};`);
    } catch (err) {
      console.error(`[evidencias] SQLite clear error:`, err);
    }
  }
  await idbClear(TABLE);
}
