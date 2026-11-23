/**
 * Bitácoras de combustible.
 * Estos registros no modifican el presupuesto ni los saldos semanales.
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

const TABLE = 'bitacoras_gasolina';

const SELECT_JOIN = `
  SELECT
    b.id, b.fecha_ticket, b.numero_ticket, b.lugar_comision, b.litros, b.importe,
    b.km_anterior, b.km_actual, b.nivel_antes_cargar, b.nivel_despues_carga,
    b.vehiculo_id, b.observaciones, b.created_at, b.updated_at,
    v.placas, v.marca, v.modelo, v.anio, v.descripcion, v.num_resguardo,
    v.responsable_bien, v.numero_serie, v.estado AS vehiculo_estado
  FROM ${TABLE} b
  JOIN vehiculos v ON v.id = b.vehiculo_id
`;

function limpio(valor) {
  return String(valor ?? '').trim();
}

function mayus(valor) {
  return limpio(valor).toLocaleUpperCase('es-MX');
}

function toRecord(data, id) {
  return {
    id,
    fecha_ticket: limpio(data.fecha_ticket),
    numero_ticket: mayus(data.numero_ticket),
    lugar_comision: mayus(data.lugar_comision),
    litros: data.litros,
    importe: data.importe,
    km_anterior: data.km_anterior ?? null,
    km_actual: data.km_actual ?? null,
    nivel_antes_cargar: limpio(data.nivel_antes_cargar) || 'Vacio',
    nivel_despues_carga: limpio(data.nivel_despues_carga) || 'Vacio',
    vehiculo_id: limpio(data.vehiculo_id),
    observaciones: mayus(data.observaciones),
  };
}

function pasaFiltro(row, filtros) {
  if (filtros.vehiculoId && row.vehiculo_id !== filtros.vehiculoId) return false;
  if (filtros.desde && String(row.fecha_ticket || '') < filtros.desde) return false;
  if (filtros.hasta && String(row.fecha_ticket || '') > filtros.hasta) return false;
  if (filtros.ticket) {
    const ticket = String(row.numero_ticket || '').toLowerCase();
    if (!ticket.includes(filtros.ticket.toLowerCase())) return false;
  }
  return true;
}

export async function getBitacoraGasolinaById(id) {
  if (isSQLiteReady()) {
    const rows = await getSQLite().select(
      `${SELECT_JOIN} WHERE b.id = $1 LIMIT 1;`,
      [id]
    );
    if (Array.isArray(rows)) return rows[0] || null;
  }
  const todos = await idbGetAll(TABLE);
  return todos.find((r) => r.id === id) || null;
}

export async function getBitacorasGasolina(filtros = {}) {
  const filtro = {
    vehiculoId: limpio(filtros.vehiculoId),
    desde: limpio(filtros.desde),
    hasta: limpio(filtros.hasta),
    ticket: limpio(filtros.ticket),
  };

  if (isSQLiteReady()) {
    const rows = await getSQLite().select(
      `${SELECT_JOIN}
       WHERE ($1 = '' OR b.vehiculo_id = $1)
         AND ($2 = '' OR b.fecha_ticket >= $2)
         AND ($3 = '' OR b.fecha_ticket <= $3)
         AND ($4 = '' OR b.numero_ticket LIKE '%' || $4 || '%')
       ORDER BY b.fecha_ticket ASC, b.created_at ASC;`,
      [filtro.vehiculoId, filtro.desde, filtro.hasta, filtro.ticket]
    );
    if (Array.isArray(rows)) {
      if (!filtro.vehiculoId && !filtro.desde && !filtro.hasta && !filtro.ticket && rows.length === 0) {
        await idbClear(TABLE);
      }
      return rows;
    }
  }

  const rows = (await idbGetAll(TABLE)).filter((row) => pasaFiltro(row, filtro));
  rows.sort((a, b) => String(a.fecha_ticket).localeCompare(String(b.fecha_ticket)));
  return rows;
}

export async function saveBitacoraGasolina(data) {
  const editing = Boolean(data.id);
  const id = editing ? data.id : generateUUID();
  const record = toRecord(data, id);
  if (!record.vehiculo_id) throw new Error('Selecciona el vehículo.');
  if (!record.fecha_ticket) throw new Error('Indica la fecha del ticket.');
  if (!record.numero_ticket) throw new Error('Indica el número de ticket.');
  if (!(record.litros > 0)) throw new Error('Indica los litros cargados.');
  if (!(record.importe > 0)) throw new Error('Indica el importe del ticket.');

  if (isSQLiteReady()) {
    const conn = getSQLite();
    const vehiculo = await conn.select(
      'SELECT id FROM vehiculos WHERE id = $1 LIMIT 1;',
      [record.vehiculo_id]
    );
    if (!Array.isArray(vehiculo) || vehiculo.length === 0) {
      throw new Error('El vehículo no está en el catálogo.');
    }
    if (editing) {
      await conn.execute(
        `UPDATE ${TABLE}
         SET fecha_ticket = $1, numero_ticket = $2, lugar_comision = $3, litros = $4,
             importe = $5, km_anterior = $6, km_actual = $7, nivel_antes_cargar = $8,
             nivel_despues_carga = $9, vehiculo_id = $10, observaciones = $11,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $12;`,
        [
          record.fecha_ticket,
          record.numero_ticket,
          record.lugar_comision,
          record.litros,
          record.importe,
          record.km_anterior,
          record.km_actual,
          record.nivel_antes_cargar,
          record.nivel_despues_carga,
          record.vehiculo_id,
          record.observaciones,
          record.id,
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO ${TABLE} (
           id, fecha_ticket, numero_ticket, lugar_comision, litros, importe,
           km_anterior, km_actual, nivel_antes_cargar, nivel_despues_carga,
           vehiculo_id, observaciones
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12);`,
        [
          record.id,
          record.fecha_ticket,
          record.numero_ticket,
          record.lugar_comision,
          record.litros,
          record.importe,
          record.km_anterior,
          record.km_actual,
          record.nivel_antes_cargar,
          record.nivel_despues_carga,
          record.vehiculo_id,
          record.observaciones,
        ]
      );
    }
  }

  await idbPut(TABLE, {
    ...record,
    updated_at: new Date().toISOString(),
    created_at: data.created_at || new Date().toISOString(),
  });
  return record;
}

export async function deleteBitacoraGasolina(id) {
  if (isSQLiteReady()) {
    await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
  }
  await idbDelete(TABLE, id);
}

const CAMPOS_BITACORA = ['b.numero_ticket', 'v.placas', 'v.numero_serie', 'b.lugar_comision', 'b.observaciones', 'v.marca', 'b.fecha_ticket'];

export async function listBitacorasPage({ texto = '', limit = 10, offset = 0 } = {}) {
  const like = texto.trim() ? likeParam(texto) : '';
  const q = texto.trim().toLowerCase();
  return queryPage({
    fromSql: `${TABLE} b JOIN vehiculos v ON v.id = b.vehiculo_id`,
    selectSql: `
      b.id, b.fecha_ticket, b.numero_ticket, b.lugar_comision, b.litros, b.importe,
      b.km_anterior, b.km_actual, b.nivel_antes_cargar, b.nivel_despues_carga,
      b.vehiculo_id, b.observaciones, b.created_at, b.updated_at,
      v.placas, v.marca, v.modelo, v.anio, v.descripcion, v.num_resguardo,
      v.responsable_bien, v.numero_serie, v.estado AS vehiculo_estado`,
    whereSql: `($1 = '' OR ${sqlLike(CAMPOS_BITACORA, 2)})`,
    params: [like ? '1' : '', ...CAMPOS_BITACORA.map(() => like || '%')],
    orderSql: 'b.fecha_ticket ASC, b.created_at ASC',
    extraSql: 'COALESCE(SUM(b.litros), 0) AS litros, COALESCE(SUM(b.importe), 0) AS importe',
    limit,
    offset,
    idbAll: async () => {
      const cargas = await idbGetAll(TABLE);
      const vehiculos = await idbGetAll('vehiculos');
      const porId = new Map(vehiculos.map((v) => [v.id, v]));
      return cargas.map((row) => ({ ...porId.get(row.vehiculo_id), ...row, vehiculo_estado: porId.get(row.vehiculo_id)?.estado }));
    },
    idbFilter: (row) => {
      if (!q) return true;
      return [row.numero_ticket, row.placas, row.numero_serie, row.lugar_comision, row.observaciones, row.marca, row.fecha_ticket]
        .some((v) => String(v || '').toLowerCase().includes(q));
    },
    idbCompare: (a, b) => String(a.fecha_ticket || '').localeCompare(String(b.fecha_ticket || '')),
    idbStats: (list) => ({
      litros: list.reduce((acc, row) => acc + (Number(row.litros) || 0), 0),
      importe: list.reduce((acc, row) => acc + (Number(row.importe) || 0), 0),
    }),
  });
}

export async function ultimasCargasVehiculo(vehiculoId, limite = 2) {
  if (!vehiculoId) return [];
  const n = Math.max(1, Math.floor(Number(limite) || 2));
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(
        `${SELECT_JOIN}
         WHERE b.vehiculo_id = $1
         ORDER BY b.fecha_ticket DESC, b.created_at DESC
         LIMIT ${n};`,
        [vehiculoId]
      );
      if (Array.isArray(rows)) return rows;
    } catch (err) {
      console.error('[bitacoras] últimas cargas:', err);
    }
  }
  const rows = await getBitacorasGasolina({ vehiculoId });
  return rows
    .sort((a, b) => String(b.fecha_ticket || '').localeCompare(String(a.fecha_ticket || '')))
    .slice(0, n);
}
