/**
 * ============================================================================
 * DATABASE / REPOSITORIES / ATENCIONES — Alumbrado Público
 * ============================================================================
 * Cada atención pertenece a un reporte por medio del folio.
 * Las fotos se guardan en:
 *   Año/Mes/Semana/DíaPrimeraFoto/Folio/NNATENCION_FECHA/
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

import {
  loadEvidenceFile,
  deleteEvidenceFile,
  commitEvidencePhoto,
  localTodayIso,
  attentionFolderName,
} from '../storage.js';
import { resolveFolioAnchorDate } from '../photoAnchor.js';

const TABLE = 'atenciones';

function isValidCoord(v) {
  return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
}

function folioKey(folio) {
  return String(folio || '').trim().toLowerCase();
}

function toRecord(data, uuid, numero, refFoto1, refFoto2, createdAt) {
  return {
    id: uuid,
    folio: String(data.folio || '').trim(),
    numero: Number(numero) || 1,
    fecha_atencion: data.fecha || data.fecha_atencion || '',
    hora_atencion: data.hora || data.hora_atencion || '',
    descripcion: data.descripcion || '',
    latitud: isValidCoord(data.lat ?? data.latitud) ? Number(data.lat ?? data.latitud) : null,
    longitud: isValidCoord(data.lon ?? data.longitud) ? Number(data.lon ?? data.longitud) : null,
    altitud: data.alt || data.altitud || '',
    enlace_maps: data.mapsUrl || data.enlace_maps || '',
    personal_atendio: data.atendio || data.personal_atendio || '',
    foto1: refFoto1 || null,
    foto2: refFoto2 || null,
    created_at: createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function toFrontend(r) {
  return {
    id: r.id,
    folio: r.folio || '',
    numero: Number(r.numero) || 1,
    fecha: r.fecha_atencion || '',
    hora: r.hora_atencion || '',
    descripcion: r.descripcion || '',
    lat: isValidCoord(r.latitud) ? Number(r.latitud) : null,
    lon: isValidCoord(r.longitud) ? Number(r.longitud) : null,
    alt: r.altitud || '',
    mapsUrl: r.enlace_maps || '',
    atendio: r.personal_atendio || '',
    fotoRefs: [r.foto1 || null, r.foto2 || null],
    fotos: [r.foto1 || null, r.foto2 || null],
    createdAt: r.created_at || null,
  };
}

async function withPhotos(item) {
  const f0 = item.fotoRefs[0] ? await loadEvidenceFile(item.fotoRefs[0]) : null;
  const f1 = item.fotoRefs[1] ? await loadEvidenceFile(item.fotoRefs[1]) : null;
  item.fotos = [f0, f1];
  return item;
}

async function selectRawById(id) {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`,
        [id]
      );
      if (rows && rows[0]) return rows[0];
    } catch (err) {
      console.error('[atenciones] Error al buscar en SQLite:', err);
    }
  }
  const all = await idbGetAll(TABLE);
  return (all || []).find((row) => row.id === id) || null;
}

async function nextNumero(folio) {
  const key = folioKey(folio);
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT COALESCE(MAX(numero), 0) AS max_num
         FROM ${TABLE}
         WHERE lower(trim(folio)) = $1;`,
        [key]
      );
      return Number(rows?.[0]?.max_num || 0) + 1;
    } catch (err) {
      console.error('[atenciones] Error al calcular número:', err);
    }
  }

  const all = await idbGetAll(TABLE);
  let max = 0;
  (all || []).forEach((row) => {
    if (folioKey(row.folio) === key) max = Math.max(max, Number(row.numero) || 0);
  });
  return max + 1;
}

export async function saveAtencion(data) {
  const uuid = data.id && String(data.id).includes('-') ? data.id : generateUUID();
  const existing = await selectRawById(uuid);
  const folio = String(data.folio || existing?.folio || '').trim();
  const numero = existing?.numero || await nextNumero(folio);
  const fecha = data.fecha || data.fecha_atencion || existing?.fecha_atencion || localTodayIso();
  const anchor = (await resolveFolioAnchorDate(folio)) || localTodayIso();
  const subfolder = attentionFolderName(numero, fecha);

  const previous = [existing?.foto1 || null, existing?.foto2 || null];
  const next = [
    data.fotos?.[0] || data.fotoRefs?.[0] || null,
    data.fotos?.[1] || data.fotoRefs?.[1] || null,
  ];

  const refFoto1 = await commitEvidencePhoto(next[0], previous[0], {
    dateStr: anchor,
    folio,
    photoIndex: 1,
    reportId: uuid,
    subfolder,
  });
  const refFoto2 = await commitEvidencePhoto(next[1], previous[1], {
    dateStr: anchor,
    folio,
    photoIndex: 2,
    reportId: uuid,
    subfolder,
  });

  const record = toRecord(
    { ...data, folio, fecha },
    uuid,
    numero,
    refFoto1,
    refFoto2,
    existing?.created_at
  );

  if (isSQLiteReady()) {
    try {
      if (existing) {
        await getSQLite().execute(
          `UPDATE ${TABLE} SET
             folio = $2,
             numero = $3,
             fecha_atencion = $4,
             hora_atencion = $5,
             descripcion = $6,
             latitud = $7,
             longitud = $8,
             altitud = $9,
             enlace_maps = $10,
             personal_atendio = $11,
             foto1 = $12,
             foto2 = $13,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1;`,
          [
            record.id,
            record.folio,
            record.numero,
            record.fecha_atencion,
            record.hora_atencion,
            record.descripcion,
            record.latitud,
            record.longitud,
            record.altitud,
            record.enlace_maps,
            record.personal_atendio,
            record.foto1,
            record.foto2,
          ]
        );
      } else {
        await getSQLite().execute(
          `INSERT INTO ${TABLE} (
             id, folio, numero, fecha_atencion, hora_atencion, descripcion,
             latitud, longitud, altitud, enlace_maps, personal_atendio,
             foto1, foto2, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP
           );`,
          [
            record.id,
            record.folio,
            record.numero,
            record.fecha_atencion,
            record.hora_atencion,
            record.descripcion,
            record.latitud,
            record.longitud,
            record.altitud,
            record.enlace_maps,
            record.personal_atendio,
            record.foto1,
            record.foto2,
            record.created_at,
          ]
        );
      }
    } catch (err) {
      console.error('[atenciones] Error al guardar en SQLite:', err);
    }
  }

  await idbPut(TABLE, record);

  const item = toFrontend(record);
  return withPhotos(item);
}

/**
 * Datos mínimos para el PDF de reportes: folio, fecha y descripción.
 * No carga fotografías.
 */
export async function getAtencionesParaImpresion() {
  let rows = null;

  if (isSQLiteReady()) {
    try {
      const result = await getSQLite().select(
        `SELECT folio, numero, fecha_atencion, descripcion, latitud, longitud, enlace_maps
         FROM ${TABLE}
         ORDER BY numero ASC, fecha_atencion ASC;`
      );
      if (Array.isArray(result)) rows = result;
    } catch (err) {
      console.error('[atenciones] Error al leer atenciones para impresión:', err);
    }
  }

  if (rows === null) {
    rows = await idbGetAll(TABLE) || [];
  }

  const map = new Map();
  rows.forEach((row) => {
    const key = folioKey(row.folio);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      numero: Number(row.numero) || 1,
      fecha: row.fecha_atencion || row.fecha || '',
      descripcion: row.descripcion || '',
      lat: row.latitud ?? row.lat ?? null,
      lon: row.longitud ?? row.lon ?? null,
      mapsUrl: row.enlace_maps || row.mapsUrl || '',
    });
  });

  map.forEach((lista) => {
    lista.sort((a, b) => a.numero - b.numero || String(a.fecha).localeCompare(String(b.fecha)));
  });

  return map;
}

export async function getAtencionesByFolio(folio) {
  const key = folioKey(folio);
  let rows = null;

  if (isSQLiteReady()) {
    try {
      const result = await getSQLite().select(
        `SELECT * FROM ${TABLE}
         WHERE lower(trim(folio)) = $1
         ORDER BY numero ASC, fecha_atencion ASC, hora_atencion ASC;`,
        [key]
      );
      if (Array.isArray(result)) rows = result;
    } catch (err) {
      console.error('[atenciones] Error al consultar SQLite:', err);
    }
  }

  if (rows === null) {
    rows = (await idbGetAll(TABLE) || []).filter((row) => folioKey(row.folio) === key);
    rows.sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));
  }

  const items = [];
  for (const row of rows) {
    items.push(await withPhotos(toFrontend(row)));
  }
  return items;
}

export async function getAtencionById(id) {
  const row = await selectRawById(id);
  if (!row) return null;
  return withPhotos(toFrontend(row));
}

export async function deleteAtencion(id) {
  const row = await selectRawById(id);
  if (row?.foto1) await deleteEvidenceFile(row.foto1);
  if (row?.foto2) await deleteEvidenceFile(row.foto2);

  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error('[atenciones] Error al eliminar en SQLite:', err);
    }
  }

  await idbDelete(TABLE, id);
}
