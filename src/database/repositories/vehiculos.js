/**
 * Catálogo de vehículos del control de combustibles.
 * El id es un UUID. El número de serie se puede corregir.
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

const TABLE = 'vehiculos';

function limpio(valor) {
  return String(valor ?? '').trim();
}

function mayus(valor) {
  return limpio(valor).toLocaleUpperCase('es-MX');
}

function toRecord(data, id) {
  const anioTexto = limpio(data.anio);
  const anio = anioTexto ? Number(anioTexto) : null;
  return {
    id,
    numero_serie: mayus(data.numero_serie),
    placas: mayus(data.placas),
    marca: mayus(data.marca),
    modelo: mayus(data.modelo),
    anio: Number.isInteger(anio) ? anio : null,
    descripcion: mayus(data.descripcion),
    num_resguardo: mayus(data.num_resguardo),
    responsable_bien: mayus(data.responsable_bien),
    estado: limpio(data.estado) === 'Inactivo' ? 'Inactivo' : 'Activo',
  };
}

export async function getVehiculoById(id) {
  if (!id) return null;
  if (isSQLiteReady()) {
    const rows = await getSQLite().select(
      `SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (Array.isArray(rows)) return rows[0] || null;
  }
  const todos = await idbGetAll(TABLE);
  return todos.find((v) => v.id === id) || null;
}

export async function getAllVehiculos() {
  if (isSQLiteReady()) {
    const rows = await getSQLite().select(
      `SELECT * FROM ${TABLE}
       ORDER BY CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END,
                placas COLLATE NOCASE, numero_serie COLLATE NOCASE;`
    );
    if (Array.isArray(rows)) {
      if (rows.length === 0) await idbClear(TABLE);
      return rows;
    }
  }
  const rows = await idbGetAll(TABLE);
  rows.sort((a, b) => {
    const ea = a.estado === 'Activo' ? 0 : 1;
    const eb = b.estado === 'Activo' ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return String(a.placas || '').localeCompare(String(b.placas || ''), 'es');
  });
  return rows;
}

async function serieOcupada(numeroSerie, idActual) {
  const serie = limpio(numeroSerie);
  if (!serie) return false;
  if (isSQLiteReady()) {
    const rows = await getSQLite().select(
      `SELECT id FROM ${TABLE} WHERE numero_serie = $1 AND id != $2 LIMIT 1;`,
      [serie, idActual || '']
    );
    return Array.isArray(rows) && rows.length > 0;
  }
  const todos = await idbGetAll(TABLE);
  return todos.some((v) => v.numero_serie === serie && v.id !== idActual);
}

export async function saveVehiculo(data, editing = false) {
  const id = editing ? data.id : generateUUID();
  const record = toRecord(data, id);
  if (!record.id) throw new Error('No se encontró el vehículo para editarlo.');
  if (!record.numero_serie) throw new Error('Indica el número de serie.');
  if (record.anio !== null && (record.anio < 1950 || record.anio > 2100)) {
    throw new Error('El año del vehículo queda fuera de rango.');
  }
  const previo = editing ? await getVehiculoById(record.id) : null;
  if (editing && !previo) throw new Error('No se encontró el vehículo para editarlo.');
  if (await serieOcupada(record.numero_serie, record.id)) {
    throw new Error('Ya existe un vehículo con ese número de serie.');
  }

  if (isSQLiteReady()) {
    const conn = getSQLite();
    if (editing) {
      await conn.execute(
        `UPDATE ${TABLE}
         SET numero_serie = $1, placas = $2, marca = $3, modelo = $4, anio = $5,
             descripcion = $6, num_resguardo = $7, responsable_bien = $8, estado = $9,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $10;`,
        [
          record.numero_serie, record.placas, record.marca, record.modelo, record.anio,
          record.descripcion, record.num_resguardo, record.responsable_bien, record.estado,
          record.id,
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO ${TABLE} (
           id, numero_serie, placas, marca, modelo, anio, descripcion,
           num_resguardo, responsable_bien, estado
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
        [
          record.id, record.numero_serie, record.placas, record.marca, record.modelo,
          record.anio, record.descripcion, record.num_resguardo, record.responsable_bien,
          record.estado,
        ]
      );
    }
  }

  await idbPut(TABLE, {
    ...record,
    updated_at: new Date().toISOString(),
    created_at: previo?.created_at || new Date().toISOString(),
  });
  return record;
}

export async function deleteVehiculo(id) {
  if (isSQLiteReady()) {
    const conn = getSQLite();
    const usos = await conn.select(
      `SELECT
         (SELECT COUNT(*) FROM periodos_combustible WHERE vehiculo_inicial_id = $1)
         + (SELECT COUNT(*) FROM movimientos_combustible
            WHERE vehiculo_origen_id = $1 OR vehiculo_destino_id = $1) AS usos;`,
      [id]
    );
    if (Number(usos?.[0]?.usos || 0) > 0) {
      throw new Error('Este vehículo tiene ajustes de combustible. Elimina esos periodos antes de borrar la unidad.');
    }
    await conn.execute('DELETE FROM bitacoras_gasolina WHERE vehiculo_id = $1;', [id]);
    await conn.execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
  }
  const bitacoras = await idbGetAll('bitacoras_gasolina');
  for (const row of bitacoras) {
    if (row.vehiculo_id === id) await idbDelete('bitacoras_gasolina', row.id);
  }
  await idbDelete(TABLE, id);
}

const CAMPOS_VEHICULO = ['placas', 'numero_serie', 'marca', 'modelo', 'responsable_bien', 'num_resguardo', 'descripcion'];

export async function listVehiculosPage({ estado = 'Activo', texto = '', limit = 10, offset = 0 } = {}) {
  const like = texto.trim() ? likeParam(texto) : '';
  const q = texto.trim().toLowerCase();
  return queryPage({
    fromSql: TABLE,
    whereSql: `($1 = '' OR estado = $1) AND ($2 = '' OR ${sqlLike(CAMPOS_VEHICULO, 3)})`,
    params: [estado || '', like ? '1' : '', ...CAMPOS_VEHICULO.map(() => like || '%')],
    orderSql: `CASE WHEN estado = 'Activo' THEN 0 ELSE 1 END, placas COLLATE NOCASE, numero_serie COLLATE NOCASE`,
    limit,
    offset,
    idbAll: () => idbGetAll(TABLE),
    idbFilter: (v) => {
      if (estado && v.estado !== estado) return false;
      if (!q) return true;
      return CAMPOS_VEHICULO.some((campo) => String(v[campo] || '').toLowerCase().includes(q));
    },
    idbCompare: (a, b) => {
      const ea = a.estado === 'Activo' ? 0 : 1;
      const eb = b.estado === 'Activo' ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return String(a.placas || '').localeCompare(String(b.placas || ''), 'es');
    },
  });
}
