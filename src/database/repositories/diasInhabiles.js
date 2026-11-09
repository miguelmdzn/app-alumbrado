/**
 * ============================================================================
 * DATABASE / REPOSITORIES / DIAS_INHABILES — Alumbrado Público
 * ============================================================================
 * Repositorio para la gestión de días inhábiles:
 * - Días feriados oficiales de México (Ley Federal del Trabajo, Art. 74).
 *   Se generan y actualizan automáticamente cada año.
 * - Días de asueto municipal: se agregan manualmente y continúan activos
 *   hasta que se desactiven explícitamente.
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

const TABLE = 'dias_inhabiles';

// ---------------------------------------------------------------------------
// Cálculo de feriados oficiales de México según la Ley Federal del Trabajo
// ---------------------------------------------------------------------------

/**
 * Encuentra el n-ésimo lunes de un mes dado (mes 0-indexado: 0 = Ene, 1 = Feb, ...)
 */
function getNthMonday(year, monthIndex, nth) {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, monthIndex, day);
    if (d.getMonth() !== monthIndex) break;
    if (d.getDay() === 1) { // 1 = Lunes
      count++;
      if (count === nth) {
        const dd = String(day).padStart(2, '0');
        const mm = String(monthIndex + 1).padStart(2, '0');
        return `${year}-${mm}-${dd}`;
      }
    }
  }
  return null;
}

/**
 * Devuelve la lista de feriados oficiales de México para un año determinado
 */
export function getOfficialMexicanHolidays(year) {
  const y = Number(year);
  const holidays = [
    {
      fecha: `${y}-01-01`,
      descripcion: 'Año Nuevo',
      tipo: 'Oficial',
      year: y,
    },
    {
      fecha: getNthMonday(y, 1, 1), // Primer lunes de febrero (5 de Feb)
      descripcion: 'Día de la Constitución Mexicana (Primer lunes de febrero)',
      tipo: 'Oficial',
      year: y,
    },
    {
      fecha: getNthMonday(y, 2, 3), // Tercer lunes de marzo (21 de Mar)
      descripcion: 'Natalicio de Benito Juárez (Tercer lunes de marzo)',
      tipo: 'Oficial',
      year: y,
    },
    {
      fecha: `${y}-05-01`,
      descripcion: 'Día del Trabajo',
      tipo: 'Oficial',
      year: y,
    },
    {
      fecha: `${y}-09-16`,
      descripcion: 'Día de la Independencia de México',
      tipo: 'Oficial',
      year: y,
    },
    {
      fecha: getNthMonday(y, 10, 3), // Tercer lunes de noviembre (20 de Nov)
      descripcion: 'Día de la Revolución Mexicana (Tercer lunes de noviembre)',
      tipo: 'Oficial',
      year: y,
    },
    {
      fecha: `${y}-12-25`,
      descripcion: 'Navidad',
      tipo: 'Oficial',
      year: y,
    },
  ];

  // El 1 de octubre de cada 6 años (Transmisión del Poder Ejecutivo Federal - 2024, 2030, etc.)
  if ((y - 2024) % 6 === 0) {
    holidays.push({
      fecha: `${y}-10-01`,
      descripcion: 'Transmisión del Poder Ejecutivo Federal',
      tipo: 'Oficial',
      year: y,
    });
  }

  return holidays.filter((h) => Boolean(h.fecha));
}

// ---------------------------------------------------------------------------
// Normalización de datos para la base de datos
// ---------------------------------------------------------------------------
function toRecord(data, uuid) {
  const fecha = String(data.fecha || '').trim();
  const year = data.year ? Number(data.year) : (fecha ? Number(fecha.split('-')[0]) : new Date().getFullYear());
  const activo = (data.activo === 0 || data.activo === false || data.activo === '0') ? 0 : 1;

  return {
    id: uuid,
    fecha: fecha,
    descripcion: String(data.descripcion || '').trim(),
    tipo: (data.tipo || 'Oficial').trim(),
    year: year,
    activo: activo,
  };
}

// ---------------------------------------------------------------------------
// API pública del repositorio
// ---------------------------------------------------------------------------

/**
 * Guarda o actualiza un día inhábil en SQLite e IndexedDB
 */
export async function saveDiaInhabil(data) {
  const uuid = data.id && data.id.includes('-') ? data.id : generateUUID();
  const record = toRecord(data, uuid);

  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(
        `INSERT OR REPLACE INTO ${TABLE} (
           id, fecha, descripcion, tipo, year, activo, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
         );`,
        [
          record.id,
          record.fecha,
          record.descripcion,
          record.tipo,
          record.year,
          record.activo,
        ]
      );
    } catch (err) {
      console.error(`[dias_inhabiles] Error al guardar en SQLite:`, err);
    }
  }

  await idbPut(TABLE, record);
  return record;
}

/**
 * Obtiene todos los días inhábiles ordenados por fecha ascendente
 */
export async function getAllDiasInhabiles(filterYear = null) {
  let rows = [];

  if (isSQLiteReady()) {
    try {
      if (filterYear) {
        rows = await getSQLite().select(
          `SELECT * FROM ${TABLE} WHERE year = $1 ORDER BY fecha ASC, created_at ASC;`,
          [Number(filterYear)]
        );
      } else {
        rows = await getSQLite().select(
          `SELECT * FROM ${TABLE} ORDER BY fecha ASC, created_at ASC;`
        );
      }
    } catch (err) {
      console.error(`[dias_inhabiles] Error al consultar SQLite:`, err);
    }
  }

  if (!rows || rows.length === 0) {
    const all = await idbGetAll(TABLE);
    rows = filterYear ? all.filter((r) => Number(r.year) === Number(filterYear)) : all;
    rows.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }

  return rows || [];
}

/**
 * Obtiene un día inhábil por su UUID
 */
export async function getDiaInhabilById(id) {
  if (isSQLiteReady()) {
    try {
      const rows = await getSQLite().select(`SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1;`, [id]);
      if (rows && rows.length > 0) return rows[0];
    } catch (err) {
      console.error(`[dias_inhabiles] Error al buscar en SQLite:`, err);
    }
  }

  const all = await idbGetAll(TABLE);
  return all.find((r) => r.id === id) || null;
}

/**
 * Elimina un día inhábil por su UUID
 */
export async function deleteDiaInhabil(id) {
  if (isSQLiteReady()) {
    try {
      await getSQLite().execute(`DELETE FROM ${TABLE} WHERE id = $1;`, [id]);
    } catch (err) {
      console.error(`[dias_inhabiles] Error al eliminar en SQLite:`, err);
    }
  }

  await idbDelete(TABLE, id);
  return true;
}

/**
 * Sincroniza y actualiza automáticamente los días festivos oficiales de México.
 * Se asegura de que para el año actual (y adyacentes) existan los días oficiales por ley.
 * Además, para los días municipales activos, si no están dados de alta para el año actual,
 * los proyecta para que sigan activos como lo solicita el usuario.
 */
export async function syncOfficialHolidays(targetYear = new Date().getFullYear()) {
  const currentYear = Number(targetYear);
  const yearsToSync = [currentYear - 1, currentYear, currentYear + 1];

  const existing = await getAllDiasInhabiles();
  const existingMap = new Map();
  existing.forEach((h) => {
    existingMap.set(`${h.tipo}|${h.fecha}`, h);
  });

  // 1. Insertar días oficiales faltantes para cada año
  for (const y of yearsToSync) {
    const officialHolidays = getOfficialMexicanHolidays(y);
    for (const h of officialHolidays) {
      const key = `Oficial|${h.fecha}`;
      if (!existingMap.has(key)) {
        await saveDiaInhabil({
          id: generateUUID(),
          fecha: h.fecha,
          descripcion: h.descripcion,
          tipo: 'Oficial',
          year: y,
          activo: 1,
        });
        existingMap.set(key, { ...h, activo: 1 });
      }
    }
  }

  // 2. Proyección de días municipales activos:
  // "los dias municipales esos son los que se agregaran manualmente, pero si no se llegan a desactivar seguiran hasta que se desactiven"
  const activeMunicipales = existing.filter((h) => h.tipo === 'Municipal' && (h.activo === 1 || h.activo === true));
  for (const mun of activeMunicipales) {
    if (!mun.fecha) continue;
    const parts = mun.fecha.split('-');
    if (parts.length === 3) {
      const mmdd = `${parts[1]}-${parts[2]}`;
      for (const y of yearsToSync) {
        const projectedDate = `${y}-${mmdd}`;
        const key = `Municipal|${projectedDate}`;
        if (!existingMap.has(key)) {
          await saveDiaInhabil({
            id: generateUUID(),
            fecha: projectedDate,
            descripcion: mun.descripcion,
            tipo: 'Municipal',
            year: y,
            activo: 1,
          });
          existingMap.set(key, { ...mun, fecha: projectedDate, year: y, activo: 1 });
        }
      }
    }
  }
}

/**
 * Devuelve un Set con las cadenas de fecha 'YYYY-MM-DD' de todos los días inhábiles activos
 */
export async function getActiveHolidaysSet() {
  const all = await getAllDiasInhabiles();
  const set = new Set();
  const activeMunicipalesMmDd = [];

  for (const h of all) {
    const isActivo = h.activo === 1 || h.activo === true || h.activo === '1';
    if (isActivo && h.fecha) {
      set.add(h.fecha);
      if (h.tipo === 'Municipal') {
        const parts = h.fecha.split('-');
        if (parts.length === 3) {
          activeMunicipalesMmDd.push(`${parts[1]}-${parts[2]}`);
        }
      }
    }
  }

  return {
    has(dateStr) {
      if (set.has(dateStr)) return true;
      if (dateStr && activeMunicipalesMmDd.length > 0) {
        const mmdd = dateStr.slice(5);
        if (activeMunicipalesMmDd.includes(mmdd)) return true;
      }
      return false;
    },
    size: set.size,
  };
}

/**
 * Cuenta los días hábiles transcurridos entre dos fechas,
 * excluyendo fines de semana (sábado y domingo) y días feriados/inhábiles activos.
 */
export function countBusinessDays(startDateStr, endDateStr, holidaysSet = null) {
  if (!startDateStr || !endDateStr) return 0;
  const startParts = startDateStr.split('-').map(Number);
  const endParts = endDateStr.split('-').map(Number);
  if (startParts.length !== 3 || endParts.length !== 3) return 0;

  const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
  if (start > end) return 0;

  let businessDays = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1); // Se cuentan los días hábiles transcurridos después de la fecha de registro

  while (cur <= end) {
    const dayOfWeek = cur.getDay(); // 0 = Domingo, 6 = Sábado
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;

    const isHoliday = holidaysSet && typeof holidaysSet.has === 'function' ? holidaysSet.has(iso) : false;

    if (!isWeekend && !isHoliday) {
      businessDays++;
    }

    cur.setDate(cur.getDate() + 1);
  }

  return businessDays;
}

