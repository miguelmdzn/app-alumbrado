/**
 * Consultas por página. La pantalla pide solo las filas que caben;
 * el PDF y las búsquedas que necesitan el conjunto completo usan queryMatching.
 */

import { getSQLite, isSQLiteReady } from './core.js';

function entero(valor, minimo) {
  const n = Math.floor(Number(valor));
  if (!Number.isFinite(n)) return minimo;
  return Math.max(minimo, n);
}

export async function queryPage(spec) {
  const limit = entero(spec.limit, 1);
  const offset = entero(spec.offset, 0);
  const where = spec.whereSql || '1=1';
  const params = spec.params || [];
  const extra = spec.extraSql ? `, ${spec.extraSql}` : '';

  if (isSQLiteReady()) {
    try {
      const counts = await getSQLite().select(
        `SELECT COUNT(*) AS total${extra} FROM ${spec.fromSql} WHERE ${where};`,
        params
      );
      const head = counts?.[0] || {};
      const total = Number(head.total ?? 0);
      const rows = await getSQLite().select(
        `SELECT ${spec.selectSql || '*'} FROM ${spec.fromSql} WHERE ${where} ORDER BY ${spec.orderSql} LIMIT ${limit} OFFSET ${offset};`,
        params
      );
      return {
        rows: Array.isArray(rows) ? rows : [],
        total,
        stats: head,
      };
    } catch (err) {
      console.error('[page] SQLite:', err);
    }
  }

  const all = await spec.idbAll();
  const list = (spec.idbFilter ? all.filter(spec.idbFilter) : all.slice())
    .sort(spec.idbCompare || (() => 0));
  const stats = {
    total: list.length,
    ...(spec.idbStats ? spec.idbStats(list) : {}),
  };
  return {
    rows: list.slice(offset, offset + limit),
    total: list.length,
    stats,
  };
}

/** Todas las filas que cumplen el filtro. Solo para imprimir o exportar. */
export async function queryMatching(spec) {
  const paso = 400;
  const primero = await queryPage({ ...spec, limit: paso, offset: 0 });
  const rows = primero.rows.slice();
  let offset = rows.length;
  while (offset < primero.total) {
    const siguiente = await queryPage({ ...spec, limit: paso, offset });
    if (!siguiente.rows.length) break;
    rows.push(...siguiente.rows);
    offset += siguiente.rows.length;
  }
  return rows;
}

export function likeParam(texto) {
  return `%${String(texto || '').trim().toLowerCase().replace(/[%_]/g, '')}%`;
}

export function sqlLike(columnas, inicio) {
  return columnas
    .map((col, i) => `LOWER(IFNULL(${col}, '')) LIKE $${inicio + i}`)
    .join(' OR ');
}
