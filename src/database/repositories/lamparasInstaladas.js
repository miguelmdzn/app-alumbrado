/**
 * ============================================================================
 * DATABASE / REPOSITORIES / LÁMPARAS INSTALADAS
 * ============================================================================
 * Registro de lámparas LED instaladas en campo.
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
import { queryPage, likeParam, sqlLike } from '../page.js';

const TABLE = 'lamparas_instaladas';

function toRecord(data, uuid) {
  return {
    id: uuid,
    folio: (data.folio || '').trim(),
    fecha: (data.fecha || '').trim(),
    hora: (data.hora || '').trim(),
    tipo_lampara: (data.tipo_lampara || '').trim(),
    ubicacion: (data.ubicacion || '').trim(),
    latitud: data.latitud != null ? parseFloat(data.latitud) : null,
    longitud: data.longitud != null ? parseFloat(data.longitud) : null,
    altitud: (data.altitud || '').trim(),
    enlace_maps: (data.enlace_maps || '').trim(),
    observaciones: (data.observaciones || '').trim(),
    foto1: data.foto1 || null,
    foto2: data.foto2 || null,
    personal_instalo: (data.personal_instalo || '').trim(),
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function saveLamparaInstalada(data) {
  const uuid = data.id && String(data.id).includes('-') ? data.id : generateUUID();
  const record = toRecord(data, uuid);

  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `INSERT OR REPLACE INTO ${TABLE} (
           id, folio, fecha, hora, tipo_lampara, ubicacion,
           latitud, longitud, altitud, enlace_maps, observaciones,
           foto1, foto2, personal_instalo, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           COALESCE((SELECT created_at FROM ${TABLE} WHERE id = $1), CURRENT_TIMESTAMP),
           CURRENT_TIMESTAMP
         );`,
        [
          record.id,
          record.folio,
          record.fecha,
          record.hora,
          record.tipo_lampara,
          record.ubicacion,
          record.latitud,
          record.longitud,
          record.altitud,
          record.enlace_maps,
          record.observaciones,
          record.foto1,
          record.foto2,
          record.personal_instalo,
        ]
      );
    } catch (err) {
      console.error('[lamparas_instaladas] Error al guardar en SQLite:', err);
    }
  }

  await idbPut(TABLE, record);
  return record;
}

export async function getAllLamparasInstaladas() {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE} ORDER BY fecha DESC, created_at DESC;`
      );
      if (Array.isArray(rows)) {
        if (rows.length === 0) await idbClear(TABLE);
        return rows;
      }
    } catch (err) {
      console.error('[lamparas_instaladas] Error al consultar SQLite:', err);
    }
  }

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

export async function getLamparaInstaladaById(id) {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`,
        [id]
      );
      if (rows && rows.length > 0) return rows[0];
    } catch (err) {
      console.error('[lamparas_instaladas] Error al buscar en SQLite:', err);
    }
  }

  const all = await idbGetAll(TABLE);
  return all.find((r) => r.id === id) || null;
}

export async function deleteLamparaInstalada(id) {
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error('[lamparas_instaladas] Error al eliminar en SQLite:', err);
    }
  }

  await idbDelete(TABLE, id);
  return true;
}

const CAMPOS_LAMPARA = ['folio', 'tipo_lampara', 'ubicacion', 'personal_instalo'];

export async function listLamparasPage({ texto = '', idsPersonal = [], limit = 10, offset = 0 } = {}) {
  const like = texto.trim() ? likeParam(texto) : '';
  const q = texto.trim().toLowerCase();
  const extras = idsPersonal.map((_, i) => `OR IFNULL(personal_instalo, '') LIKE $${CAMPOS_LAMPARA.length + 2 + i}`);
  return queryPage({
    fromSql: TABLE,
    whereSql: `($1 = '' OR ${sqlLike(CAMPOS_LAMPARA, 2)} ${extras.join(' ')})`,
    params: [like ? '1' : '', ...CAMPOS_LAMPARA.map(() => like || '%'), ...idsPersonal.map((id) => `%${id}%`)],
    orderSql: 'fecha DESC, created_at DESC',
    limit,
    offset,
    idbAll: () => idbGetAll(TABLE),
    idbFilter: (r) => {
      if (!q) return true;
      if (CAMPOS_LAMPARA.some((campo) => String(r[campo] || '').toLowerCase().includes(q))) return true;
      return idsPersonal.some((id) => String(r.personal_instalo || '').includes(id));
    },
    idbCompare: (a, b) => String((b.fecha || '') + (b.created_at || '')).localeCompare(String((a.fecha || '') + (a.created_at || ''))),
  });
}

