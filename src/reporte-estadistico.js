/**
 * ============================================================================
 * GENERADOR DE REPORTE ESTADÍSTICO — Alumbrado Público (reporte-estadistico.js)
 * ============================================================================
 * Genera un informe ejecutivo formal de 2 páginas idéntico al diseño PDF oficial:
 * Página 1:
 *  - Encabezado con periodo y fecha de emisión
 *  - 5 Indicadores Generales (Reportes, Lámparas, Atendidos, Pendientes, Tiempo promedio)
 *  - Gráfica Reportes por Localidad (Atendidos vs Pendientes + Lámparas)
 *  - Distribución Tipo de Falla (Barras y porcentajes)
 *  - Distribución Tipo de Lámpara (Barras de Blanca, Amarilla sodio, LED)
 *  - Gráfica de barras Reportes por Día del periodo (Entre semana, Fin de semana, Picos)
 *  - Recuadro "Lo más relevante"
 * Página 2:
 *  - Detalle por Localidad y Colonia (Tabla jerárquica con % atención)
 *  - Pendientes Prioritarios (Folios con mayor retraso y badge de antigüedad)
 *  - Personal que atendió (Extraído de la tabla de evidencias con nombres de los trabajadores)
 * ============================================================================
 */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

const fd = (s) => (s ? s.split('-').reverse().join('/') : '');

function isAtendido(val) {
  const v = String(val || '').trim().toLowerCase();
  return v === 'atendido' || v === 'atendida';
}

function parseDateIso(str) {
  if (!str) return null;
  const parts = str.split('-').map(Number);
  if (parts.length !== 3) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getDaysDiff(d1, d2) {
  const t1 = d1.getTime();
  const t2 = d2.getTime();
  return Math.max(1, Math.round(Math.abs(t2 - t1) / (1000 * 60 * 60 * 24)) + 1);
}

function fechaDia(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function foldKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function lampCount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 1;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

function splitPersonas(raw) {
  return String(raw || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Porcentajes enteros que suman 100 cuando el desglose está completo. */
function porcentajesCerrados(items, total, countKey) {
  if (!items.length || total <= 0) {
    return items.map((item) => ({ ...item, pct: 0 }));
  }
  const withFloor = items.map((item) => {
    const exact = (item[countKey] / total) * 100;
    return { ...item, pct: Math.floor(exact), _frac: exact - Math.floor(exact) };
  });
  let restante = 100 - withFloor.reduce((sum, item) => sum + item.pct, 0);
  const orden = withFloor
    .map((item, index) => ({ index, frac: item._frac }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < orden.length && restante > 0; i += 1) {
    withFloor[orden[i].index].pct += 1;
    restante -= 1;
  }
  return withFloor.map(({ _frac, ...item }) => item);
}

function localToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getMonthName(dateObj) {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  return meses[dateObj.getMonth()] || '';
}

export function buildReporteEstadisticoHTML(
  reportes,
  evidencias = [],
  personalList = [],
  fechaIni,
  fechaFin,
  getFullNameFunc = null,
  solicitudes = []
) {
  let inicio = fechaDia(fechaIni);
  let fin = fechaDia(fechaFin);
  if (inicio && fin && inicio > fin) {
    const swap = inicio;
    inicio = fin;
    fin = swap;
  }
  fechaIni = inicio;
  fechaFin = fin;

  reportes = (Array.isArray(reportes) ? reportes : []).filter((r) => {
    const fecha = fechaDia(r.fecha);
    return fecha && (!fechaIni || fecha >= fechaIni) && (!fechaFin || fecha <= fechaFin);
  });

  const total = reportes.length;
  const atendidosList = reportes.filter((r) => isAtendido(r.estatus));
  const pendientesList = reportes.filter((r) => !isAtendido(r.estatus));
  const atendidosCount = atendidosList.length;
  const pendientesCount = pendientesList.length;

  const totalLamparas = reportes.reduce(
    (acc, r) => acc + lampCount(r.numero_lamparas),
    0
  );

  const efectividad = total > 0 ? Math.round((atendidosCount / total) * 100) : 0;
  const pctPendientes = total > 0 ? Math.round((pendientesCount / total) * 100) : 0;
  const lamparasPorReporte = total > 0 ? (totalLamparas / total).toFixed(1) : '1.0';

  const dIni = parseDateIso(fechaIni) || new Date();
  const dFin = parseDateIso(fechaFin) || new Date();
  const diasPeriodo = getDaysDiff(dIni, dFin);
  const promedioPorDia = (total / diasPeriodo).toFixed(1);

  // =========================================================================
  // Mapeos de Evidencias y Catálogo de Personal
  // =========================================================================
  const evidenciasByFolio = new Map();
  (evidencias || []).forEach((ev) => {
    const folio = String(ev.folio || '').trim().toLowerCase();
    if (!folio) return;
    if (!evidenciasByFolio.has(folio)) evidenciasByFolio.set(folio, []);
    evidenciasByFolio.get(folio).push(ev);
  });

  const personalCatalogMap = new Map();
  const personalByFold = new Map();
  (personalList || []).forEach((p) => {
    const full = (typeof getFullNameFunc === 'function' ? getFullNameFunc(p) : '')
      || `${p.nombres || ''} ${p.apellido1 || ''} ${p.apellido2 || ''}`.replace(/\s+/g, ' ').trim();
    if (p.id) personalCatalogMap.set(String(p.id).trim(), p);
    if (p.numero_trabajador) personalCatalogMap.set(String(p.numero_trabajador).trim(), p);
    if (p.numero_checador_digital) personalCatalogMap.set(String(p.numero_checador_digital).trim(), p);
    if (full && !personalByFold.has(foldKey(full))) personalByFold.set(foldKey(full), full);
  });

  function nombreCatalogo(persona) {
    if (!persona) return '';
    if (typeof getFullNameFunc === 'function') {
      const full = getFullNameFunc(persona);
      if (full) return full.replace(/\s+/g, ' ').trim();
    }
    return `${persona.nombres || ''} ${persona.apellido1 || ''} ${persona.apellido2 || ''}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  function resolveWorker(raw) {
    const clean = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!clean) return null;
    const persona = personalCatalogMap.get(clean);
    if (persona) {
      const oficial = nombreCatalogo(persona);
      if (oficial) return { nombre: oficial, oficial: true };
    }
    const porNombre = personalByFold.get(foldKey(clean));
    if (porNombre) return { nombre: porNombre, oficial: true };
    return { nombre: clean, oficial: false };
  }

  // =========================================================================
  // Estimación de tiempo promedio de atención (días) usando Evidencias
  // =========================================================================
  let tiempoPromedioAtencion = '0.0';
  if (atendidosCount > 0) {
    const diffs = atendidosList.map((r) => {
      const fr = parseDateIso(fechaDia(r.fecha));
      // Buscar si tiene fecha de atención en la evidencia correspondiente
      const folioKey = r.folio ? String(r.folio).trim().toLowerCase() : '';
      const evidenciasFolio = folioKey ? (evidenciasByFolio.get(folioKey) || []) : [];
      const fechasEv = evidenciasFolio
        .map((ev) => parseDateIso(fechaDia(ev.fecha)))
        .filter(Boolean)
        .sort((a, b) => a - b);
      let fa = fechasEv.find((fecha) => !fr || fecha >= fr) || fechasEv[0] || null;
      if (!fa) {
        fa = parseDateIso(r.updated_at?.slice(0, 10)) || dFin;
      }
      if (fr && fa && fa >= fr) {
        return Math.max(1, Math.round((fa - fr) / (1000 * 60 * 60 * 24)));
      }
      return 1;
    });
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    tiempoPromedioAtencion = avg.toFixed(1);
  }

  const hoy = localToday();
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const hoyFmt = fd(hoyIso);
  const periodoFmt = `${fd(fechaIni)} — ${fd(fechaFin)}`;
  const mesAnoTitulo = `${getMonthName(dIni)} ${dIni.getFullYear()}`;

  // =========================================================================
  // 1. Agrupación por Localidad (Top para la Página 1 y desglose para Página 2)
  // =========================================================================
  const locMap = new Map();
  reportes.forEach((r) => {
    const locName = String(r.colonia_comunidad || '').replace(/\s+/g, ' ').trim() || 'Sin localidad';
    const tipoRaw = String(r.tipo_localidad || '').trim().toLowerCase();
    const tipo = !r.colonia_comunidad
      ? 'Sin clasificar'
      : (tipoRaw.startsWith('comunidad') ? 'Comunidad' : 'Cabecera municipal');
    const locKey = `${foldKey(locName)}|${tipo}`;

    if (!locMap.has(locKey)) {
      locMap.set(locKey, {
        nombre: locName,
        tipo,
        total: 0,
        lamparas: 0,
        atendidos: 0,
        pendientes: 0,
      });
    }

    const loc = locMap.get(locKey);
    const lamps = lampCount(r.numero_lamparas);
    const isAt = isAtendido(r.estatus);

    loc.total += 1;
    loc.lamparas += lamps;
    if (isAt) loc.atendidos += 1;
    else loc.pendientes += 1;
  });

  const localidadesSorted = Array.from(locMap.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  const topLocalidades = localidadesSorted;
  const maxLocReportes = Math.max(...topLocalidades.map((l) => l.total), 1);
  const sumaLocalidades = localidadesSorted.reduce((sum, loc) => sum + loc.total, 0);

  // =========================================================================
  // 2. Agrupación por Tipo de Falla
  // =========================================================================
  const fallasMap = new Map();
  reportes.forEach((r) => {
    const f = String(r.tipo_falla || '').replace(/\s+/g, ' ').trim() || 'Sin especificar';
    const key = foldKey(f);
    if (!fallasMap.has(key)) fallasMap.set(key, { nombre: f, conteo: 0 });
    fallasMap.get(key).conteo += 1;
  });
  const fallasSorted = porcentajesCerrados(
    Array.from(fallasMap.values()).sort((a, b) => b.conteo - a.conteo || a.nombre.localeCompare(b.nombre, 'es')),
    total,
    'conteo'
  );
  const maxFallaConteo = Math.max(...fallasSorted.map((f) => f.conteo), 1);

  // =========================================================================
  // 3. Agrupación por Tipo de Lámpara
  // =========================================================================
  const lamparasMap = new Map();
  reportes.forEach((r) => {
    const t = String(r.tipo_lampara || '').replace(/\s+/g, ' ').trim() || 'Sin especificar';
    const key = foldKey(t);
    const cant = lampCount(r.numero_lamparas);
    if (!lamparasMap.has(key)) lamparasMap.set(key, { nombre: t, conteo: 0 });
    lamparasMap.get(key).conteo += cant;
  });
  const lamparasSorted = porcentajesCerrados(
    Array.from(lamparasMap.values()).sort((a, b) => b.conteo - a.conteo || a.nombre.localeCompare(b.nombre, 'es')),
    totalLamparas,
    'conteo'
  );
  const maxLamparaConteo = Math.max(...lamparasSorted.map((l) => l.conteo), 1);

  // =========================================================================
  // 4. Reportes por Día del Periodo (Gráfica de barras verticales)
  // =========================================================================
  const diasBuckets = [];
  const cur = new Date(dIni);
  while (cur <= dFin) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const dayOfWeek = cur.getDay(); // 0 domingo, 6 sabado
    diasBuckets.push({
      iso,
      diaNum: d,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      count: 0,
    });
    cur.setDate(cur.getDate() + 1);
    if (diasBuckets.length > 400) break;
  }

  reportes.forEach((r) => {
    const fecha = fechaDia(r.fecha);
    if (fecha) {
      const match = diasBuckets.find((b) => b.iso === fecha);
      if (match) match.count += 1;
    }
  });
  const reportesEnGraficaDia = diasBuckets.reduce((sum, b) => sum + b.count, 0);

  const maxDiaCount = Math.max(...diasBuckets.map((b) => b.count), 1);
  const diasPico = diasBuckets.filter((b) => b.count === maxDiaCount && b.count > 0);
  const diasPicoStr = diasPico.map((b) => b.diaNum).join(' y ');

  // =========================================================================
  // 5. Lo más relevante
  // =========================================================================
  const topLoc = topLocalidades[0] || { nombre: 'La cabecera', total: 0, lamparas: 0 };
  const pctTopLocReportes = total > 0 ? Math.round((topLoc.total / total) * 100) : 0;
  const pctTopLocLamparas = totalLamparas > 0 ? Math.round((topLoc.lamparas / totalLamparas) * 100) : 0;
  const topFalla = fallasSorted[0] || { nombre: 'Falla general', pct: 0 };
  const loMasRelevanteText = `${topLoc.nombre} concentra el ${pctTopLocReportes}% de los reportes y ${pctTopLocLamparas}% de las lámparas. «${topFalla.nombre}» es la falla más común (${topFalla.pct}%).`;

  // =========================================================================
  // 6. Pendientes Prioritarios (Página 2)
  // =========================================================================
  const pendientesPrioritarios = [...pendientesList]
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
    .slice(0, 8)
    .map((r) => {
      let antiguedadLabel = 'hoy';
      let antiguedadClase = 'badge-antiguedad-hoy';
      if (r.fecha) {
        const rf = parseDateIso(fechaDia(r.fecha));
        if (rf) {
          const diff = Math.max(0, Math.floor((hoy - rf) / (1000 * 60 * 60 * 24)));
          if (diff > 0) {
            antiguedadLabel = `${diff} días`;
            if (diff >= 10) antiguedadClase = 'badge-antiguedad-alerta';
            else if (diff >= 5) antiguedadClase = 'badge-antiguedad-media';
            else antiguedadClase = 'badge-antiguedad-baja';
          }
        }
      }
      return {
        folio: r.folio || 'S/F',
        localidad: r.colonia_comunidad || 'Sin localidad',
        falla: r.tipo_falla || r.tipo_lampara || 'Sin especificar',
        antiguedadLabel,
        antiguedadClase,
      };
    });

  // =========================================================================
  // 7. Personal que Atendió (Página 2) — OBTENIDO DE LA TABLA DE EVIDENCIAS
  // =========================================================================
  const personalServiciosMap = new Map();
  let reportesSinPersonal = 0;

  function addServicioPersona(raw, folioKey) {
    const resolved = resolveWorker(raw);
    if (!resolved) return false;
    const key = foldKey(resolved.nombre);
    if (!key) return false;
    let entry = personalServiciosMap.get(key);
    if (!entry) {
      entry = { nombre: resolved.nombre, oficial: resolved.oficial, servicios: 0, folios: new Set() };
      personalServiciosMap.set(key, entry);
    } else if (resolved.oficial && !entry.oficial) {
      entry.nombre = resolved.nombre;
      entry.oficial = true;
    }
    if (folioKey) {
      if (entry.folios.has(folioKey)) return true;
      entry.folios.add(folioKey);
    }
    entry.servicios += 1;
    return true;
  }

  // Cada reporte atendido del periodo suma un servicio a cada persona que participó.
  // Se unen el personal del reporte y el de todas sus evidencias, sin contar dos veces
  // a la misma persona en el mismo folio.
  atendidosList.forEach((r) => {
    const folioKey = String(r.folio || r.id || '').trim().toLowerCase();
    const tokens = new Set(splitPersonas(r.atendio));
    const evidenciasFolio = evidenciasByFolio.get(String(r.folio || '').trim().toLowerCase()) || [];
    evidenciasFolio.forEach((ev) => {
      splitPersonas(ev.atendio).forEach((token) => tokens.add(token));
      splitPersonas(ev.personalInstalo || ev.personal_instalo).forEach((token) => tokens.add(token));
    });

    let alguien = false;
    tokens.forEach((token) => {
      if (addServicioPersona(token, folioKey)) alguien = true;
    });
    if (!alguien) reportesSinPersonal += 1;
  });

  const personalSorted = Array.from(personalServiciosMap.values())
    .filter((p) => p.servicios > 0)
    .sort((a, b) => b.servicios - a.servicios || a.nombre.localeCompare(b.nombre, 'es'));
  const maxServiciosPersonal = Math.max(...personalSorted.map((p) => p.servicios), 1);
  const totalServiciosPersonal = personalSorted.reduce((sum, p) => sum + p.servicios, 0);

  // =========================================================================
  // 8. Solicitudes de instalación de lámparas (página propia)
  // =========================================================================
  const solicitudesPeriodo = (Array.isArray(solicitudes) ? solicitudes : []).filter((s) => {
    const fecha = fechaDia(s.fecha_solicitud || s.fechaSolicitud);
    return fecha && (!fechaIni || fecha >= fechaIni) && (!fechaFin || fecha <= fechaFin);
  });

  const solicitudesAtendidas = solicitudesPeriodo.filter((s) => isAtendido(s.estatus));
  const solicitudesNoAtendidas = solicitudesPeriodo.filter((s) => !isAtendido(s.estatus));
  const totalSolicitudes = solicitudesPeriodo.length;
  const lamparasSolicitadas = solicitudesPeriodo.reduce(
    (sum, s) => sum + lampCount(s.cantidad_lamparas ?? s.cantidadLamparas),
    0
  );
  const lamparasInstaladasSol = solicitudesAtendidas.reduce(
    (sum, s) => sum + lampCount(s.cantidad_lamparas ?? s.cantidadLamparas),
    0
  );
  const efectividadSol = totalSolicitudes > 0
    ? Math.round((solicitudesAtendidas.length / totalSolicitudes) * 100)
    : 0;

  const estatusSolMap = new Map();
  solicitudesPeriodo.forEach((s) => {
    const nombre = isAtendido(s.estatus)
      ? 'Atendido'
      : (String(s.estatus || '').replace(/\s+/g, ' ').trim() || 'En espera');
    const key = foldKey(nombre);
    if (!estatusSolMap.has(key)) estatusSolMap.set(key, { nombre, conteo: 0 });
    estatusSolMap.get(key).conteo += 1;
  });
  const estatusSolSorted = porcentajesCerrados(
    Array.from(estatusSolMap.values()).sort((a, b) => b.conteo - a.conteo || a.nombre.localeCompare(b.nombre, 'es')),
    totalSolicitudes,
    'conteo'
  );
  const maxEstatusSol = Math.max(...estatusSolSorted.map((e) => e.conteo), 1);

  const tipoSolMap = new Map();
  solicitudesPeriodo.forEach((s) => {
    const tipoRaw = String(s.tipo_localidad || '').trim().toLowerCase();
    const nombre = tipoRaw.startsWith('comunidad') ? 'Comunidad' : 'Cabecera municipal';
    if (!tipoSolMap.has(nombre)) {
      tipoSolMap.set(nombre, { nombre, solicitudes: 0, lamparas: 0, atendidas: 0 });
    }
    const row = tipoSolMap.get(nombre);
    row.solicitudes += 1;
    row.lamparas += lampCount(s.cantidad_lamparas ?? s.cantidadLamparas);
    if (isAtendido(s.estatus)) row.atendidas += 1;
  });
  const tipoSolSorted = Array.from(tipoSolMap.values()).sort((a, b) => b.solicitudes - a.solicitudes);

  const locSolMap = new Map();
  solicitudesPeriodo.forEach((s) => {
    const locName = String(s.colonia_comunidad || '').replace(/\s+/g, ' ').trim() || 'Sin localidad';
    const key = foldKey(locName);
    if (!locSolMap.has(key)) {
      locSolMap.set(key, {
        nombre: locName,
        total: 0,
        lamparas: 0,
        atendidas: 0,
        pendientes: 0,
      });
    }
    const row = locSolMap.get(key);
    const lamps = lampCount(s.cantidad_lamparas ?? s.cantidadLamparas);
    row.total += 1;
    row.lamparas += lamps;
    if (isAtendido(s.estatus)) row.atendidas += 1;
    else row.pendientes += 1;
  });
  const locSolSorted = Array.from(locSolMap.values()).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
  const maxLocSol = Math.max(...locSolSorted.map((l) => l.total), 1);

  const solicitudesPrioritarias = [...solicitudesNoAtendidas]
    .sort((a, b) => fechaDia(a.fecha_solicitud).localeCompare(fechaDia(b.fecha_solicitud)))
    .slice(0, 8)
    .map((s) => {
      let antiguedadLabel = 'hoy';
      let antiguedadClase = 'badge-antiguedad-hoy';
      const rf = parseDateIso(fechaDia(s.fecha_solicitud || s.fechaSolicitud));
      if (rf) {
        const diff = Math.max(0, Math.floor((hoy - rf) / (1000 * 60 * 60 * 24)));
        if (diff > 0) {
          antiguedadLabel = `${diff} días`;
          if (diff >= 10) antiguedadClase = 'badge-antiguedad-alerta';
          else if (diff >= 5) antiguedadClase = 'badge-antiguedad-media';
          else antiguedadClase = 'badge-antiguedad-baja';
        }
      }
      return {
        solicitante: s.nombre_solicitante || 'Sin nombre',
        localidad: s.colonia_comunidad || 'Sin localidad',
        lamparas: lampCount(s.cantidad_lamparas ?? s.cantidadLamparas),
        estatus: s.estatus || 'En espera',
        antiguedadLabel,
        antiguedadClase,
      };
    });

  // =========================================================================
  // HTML RENDER
  // =========================================================================
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Reporte Estadístico — Alumbrado Público (${periodoFmt})</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      line-height: 1.35;
      color: #1E293B;
      background-color: #ECEFF3;
      -webkit-font-smoothing: antialiased;
      padding: 20px 0;
    }

    .report-sheet {
      width: 215.9mm;
      min-height: 279.4mm;
      margin: 0 auto 20px auto;
      background: #FFFFFF;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: visible;
      page-break-after: always;
      break-after: page;
    }

    /* Encabezado azul oscuro idéntico al PDF */
    .sheet-header {
      background: #0E1F38;
      color: #FFFFFF;
      padding: 16px 24px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-main-title {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      line-height: 1.1;
      color: #FFFFFF;
    }

    .header-sub-title {
      font-size: 11px;
      font-weight: 500;
      color: #94A3B8;
      margin-top: 3px;
    }

    .header-right {
      text-align: right;
    }

    .header-periodo-tag {
      font-size: 9px;
      font-weight: 800;
      color: #F59E0B;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .header-periodo-range {
      font-size: 13.5px;
      font-weight: 800;
      color: #FFFFFF;
      margin-top: 1px;
    }

    .header-emitido {
      font-size: 9.5px;
      color: #94A3B8;
      margin-top: 2px;
    }

    .sheet-content {
      padding: 16px 24px 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Títulos de sección con barra amarilla vertical */
    .section-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }

    .section-accent-bar {
      width: 4px;
      height: 12px;
      background: #F59E0B;
      border-radius: 1px;
    }

    .section-title {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #1E293B;
    }

    /* ================= Indicadores Generales ================= */
    .kpi-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
      gap: 10px;
      background: #F8FAFD;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 12px 14px;
    }

    .kpi-box {
      border-left: 3px solid #0E1F38;
      padding-left: 10px;
      display: flex;
      flex-direction: column;
    }

    .kpi-box.kpi-box-green {
      border-left-color: #10B981;
    }

    .kpi-box.kpi-box-orange {
      border-left-color: #F59E0B;
    }

    .kpi-num {
      font-size: 26px;
      font-weight: 900;
      line-height: 1;
      color: #0E1F38;
      letter-spacing: -0.5px;
    }

    .kpi-num.kpi-num-green {
      color: #059669;
    }

    .kpi-num.kpi-num-orange {
      color: #D97706;
    }

    .kpi-tag {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #1E293B;
      margin-top: 3px;
    }

    .kpi-note {
      font-size: 8.5px;
      color: #64748B;
      margin-top: 1px;
    }

    /* ================= Reportes por Localidad ================= */
    .loc-table-container {
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 10px 14px;
      background: #FFFFFF;
    }

    .loc-header-row {
      display: grid;
      grid-template-columns: minmax(150px, 230px) 1fr 70px;
      font-size: 9px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .loc-row {
      display: grid;
      grid-template-columns: minmax(150px, 230px) 1fr 70px;
      align-items: center;
      gap: 10px;
      padding: 3px 0;
    }

    .loc-name {
      font-size: 10px;
      font-weight: 600;
      color: #1E293B;
      line-height: 1.25;
    }

    .loc-tipo {
      display: block;
      font-size: 8px;
      font-weight: 600;
      color: #64748B;
    }

    .loc-bar-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .loc-bar-track {
      flex: 1;
      height: 14px;
      background: #F1F5F9;
      border-radius: 3px;
      overflow: hidden;
      display: flex;
    }

    .loc-bar-atendidos {
      background: #0E1F38;
      height: 100%;
    }

    .loc-bar-pendientes {
      background: #F59E0B;
      height: 100%;
    }

    .loc-count-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #0E1F38;
      min-width: 18px;
    }

    .loc-lamp-badge {
      background: #F1F5F9;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
      text-align: center;
    }

    .loc-legend {
      display: flex;
      gap: 14px;
      font-size: 9px;
      color: #64748B;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #E2E8F0;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .legend-box {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }

    /* ================= Dos Columnas: Falla y Lámpara ================= */
    .two-cols-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .col-card {
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 10px 14px;
      background: #FFFFFF;
    }

    .horizontal-stat-row {
      display: grid;
      grid-template-columns: 140px 1fr;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
    }

    .stat-label-text {
      font-size: 9.5px;
      font-weight: 600;
      color: #1E293B;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stat-bar-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .stat-bar-track {
      flex: 1;
      height: 12px;
      background: #F1F5F9;
      border-radius: 2px;
      overflow: hidden;
    }

    .stat-bar-fill {
      height: 100%;
      background: #0E1F38;
      border-radius: 2px;
    }

    .stat-bar-fill.fill-orange {
      background: #F59E0B;
    }

    .stat-bar-fill.fill-green {
      background: #10B981;
    }

    .stat-val-text {
      font-size: 9px;
      font-weight: 700;
      color: #475569;
      min-width: 48px;
    }

    .lamp-summary-note {
      font-size: 8.5px;
      color: #64748B;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #F1F5F9;
    }

    /* ================= Reportes por Día ================= */
    .chart-days-card {
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 10px 14px 8px;
      background: #FFFFFF;
    }

    .days-bars-wrapper {
      height: 85px;
      display: flex;
      align-items: flex-end;
      gap: 3px;
      border-bottom: 1px solid #CBD5E1;
      padding-bottom: 2px;
      position: relative;
    }

    .days-avg-line {
      position: absolute;
      left: 0;
      right: 0;
      border-top: 1px dashed #64748B;
      pointer-events: none;
      z-index: 1;
    }

    .day-bar-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
    }

    .day-val-num {
      font-size: 8px;
      font-weight: 800;
      color: #1E293B;
      margin-bottom: 2px;
    }

    .day-bar-rect {
      width: 100%;
      border-radius: 2px 2px 0 0;
      min-height: 2px;
    }

    .bar-weekday {
      background: #0E1F38;
    }

    .bar-weekend {
      background: #93C5FD;
    }

    .bar-peak {
      background: #F59E0B;
    }

    .days-axis-labels {
      display: flex;
      gap: 3px;
      margin-top: 3px;
    }

    .day-axis-num {
      flex: 1;
      text-align: center;
      font-size: 7.5px;
      color: #64748B;
      font-weight: 600;
    }

    .days-legend-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 8.5px;
      color: #64748B;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #F1F5F9;
      flex-wrap: wrap;
      gap: 8px;
    }

    /* ================= Lo más relevante ================= */
    .highlight-card {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 6px;
      padding: 9px 14px;
    }

    .highlight-title {
      font-size: 8.5px;
      font-weight: 800;
      color: #D97706;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .highlight-text {
      font-size: 9.5px;
      color: #92400E;
      line-height: 1.4;
    }

    /* ================= Tabla Detallada Página 2 ================= */
    .table-sheet2 {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      border: 1px solid #E2E8F0;
      border-radius: 4px;
      overflow: hidden;
    }

    .table-sheet2 th {
      background: #0E1F38;
      color: #FFFFFF;
      padding: 6px 10px;
      text-align: right;
      font-weight: 800;
      font-size: 8.5px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }

    .table-sheet2 th:first-child {
      text-align: left;
    }

    .table-sheet2 td {
      padding: 4.5px 10px;
      border-bottom: 1px solid #F1F5F9;
      color: #334155;
      text-align: right;
    }

    .table-sheet2 td:first-child {
      text-align: left;
    }

    .tr-loc-main td {
      font-weight: 800;
      background: #F8FAFD;
      color: #0E1F38;
      border-top: 1px solid #E2E8F0;
    }

    .tr-colonia-sub td {
      font-size: 9px;
      color: #64748B;
      padding-left: 20px;
    }

    .tr-total-general td {
      background: #0E1F38;
      color: #FFFFFF;
      font-weight: 900;
      font-size: 10px;
      border-top: 2px solid #0E1F38;
    }

    .table-progress-bar {
      width: 44px;
      height: 6px;
      background: #E2E8F0;
      border-radius: 3px;
      display: inline-block;
      vertical-align: middle;
      margin-right: 5px;
      overflow: hidden;
    }

    .table-progress-fill {
      height: 100%;
      background: #10B981;
      border-radius: 3px;
    }

    /* ================= Página 2 Sección Inferior ================= */
    .pendientes-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }

    .pendientes-table th {
      text-align: left;
      font-weight: 800;
      color: #64748B;
      font-size: 8px;
      padding: 4px 6px;
      border-bottom: 1px solid #CBD5E1;
      text-transform: uppercase;
    }

    .pendientes-table td {
      padding: 5px 6px;
      border-bottom: 1px solid #F1F5F9;
      color: #1E293B;
    }

    .badge-antiguedad {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 8.5px;
      font-weight: 700;
      text-align: center;
    }

    .badge-antiguedad-alerta {
      background: #F59E0B;
      color: #FFFFFF;
    }

    .badge-antiguedad-media {
      background: #FBBF24;
      color: #78350F;
    }

    .badge-antiguedad-baja {
      background: #F1F5F9;
      color: #475569;
    }

    .badge-antiguedad-hoy {
      background: #E2E8F0;
      color: #475569;
    }

    .personal-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 22px;
    }

    .personal-row {
      display: grid;
      grid-template-columns: minmax(120px, 1.3fr) 1fr 28px;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      break-inside: avoid;
    }

    .personal-name {
      font-size: 9px;
      font-weight: 600;
      color: #1E293B;
      line-height: 1.25;
    }

    .personal-bar-track {
      height: 10px;
      background: #F1F5F9;
      border-radius: 2px;
      overflow: hidden;
    }

    .personal-bar-fill {
      height: 100%;
      background: #0E1F38;
      border-radius: 2px;
    }

    .personal-count {
      font-size: 9px;
      font-weight: 800;
      color: #0E1F38;
      text-align: right;
    }

    /* Pie de página */
    .sheet-footer {
      padding: 10px 24px 12px;
      border-top: 1px solid #E2E8F0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #94A3B8;
      background: #FFFFFF;
    }

    /* Barra flotante de impresión en pantalla */
    .screen-action-bar {
      position: sticky;
      top: 10px;
      z-index: 100;
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .btn-action-print {
      background: #0E1F38;
      color: #FFFFFF;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(14, 31, 56, 0.25);
      transition: background 0.15s ease;
    }

    .btn-action-print:hover {
      background: #1A365D;
    }

    @media print {
      body {
        background: #FFFFFF;
        padding: 0;
      }
      .screen-action-bar {
        display: none !important;
      }
      .report-sheet {
        margin: 0;
        box-shadow: none;
        width: 100%;
        min-height: 100vh;
        page-break-after: always;
        break-after: page;
      }
      @page {
        size: letter portrait;
        margin: 0;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>

  <div class="screen-action-bar">
    <button class="btn-action-print" onclick="window.print()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Imprimir / Guardar como PDF
    </button>
  </div>

  <!-- ===================================================================== -->
  <!-- PÁGINA 1: MÉTRICAS Y GRÁFICAS GENERALES                              -->
  <!-- ===================================================================== -->
  <article class="report-sheet">
    <header class="sheet-header">
      <div>
        <h1 class="header-main-title">REPORTE ESTADÍSTICO</h1>
        <div class="header-sub-title">ALUMBRADO PÚBLICO · Resumen de reportes ciudadanos</div>
      </div>
      <div class="header-right">
        <div class="header-periodo-tag">PERIODO</div>
        <div class="header-periodo-range">${periodoFmt}</div>
        <div class="header-emitido">Emitido: ${hoyFmt}</div>
      </div>
    </header>

    <div class="sheet-content">

      <!-- 1. Indicadores Generales -->
      <div>
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">INDICADORES GENERALES</h2>
        </div>
        <div class="kpi-row">
          <div class="kpi-box">
            <span class="kpi-num">${total}</span>
            <span class="kpi-tag">REPORTES</span>
            <span class="kpi-note">${promedioPorDia} por día en promedio</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">${totalLamparas}</span>
            <span class="kpi-tag">LÁMPARAS</span>
            <span class="kpi-note">involucradas</span>
          </div>
          <div class="kpi-box kpi-box-green">
            <span class="kpi-num kpi-num-green">${atendidosCount}</span>
            <span class="kpi-tag">ATENDIDOS</span>
            <span class="kpi-note">${efectividad}% de efectividad</span>
          </div>
          <div class="kpi-box kpi-box-orange">
            <span class="kpi-num kpi-num-orange">${pendientesCount}</span>
            <span class="kpi-tag">PENDIENTES</span>
            <span class="kpi-note">${pctPendientes}% por atender</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">${tiempoPromedioAtencion}</span>
            <span class="kpi-tag">DÍAS</span>
            <span class="kpi-note">tiempo prom. de atención</span>
          </div>
        </div>
      </div>

      <!-- 2. Reportes por Localidad -->
      <div>
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">REPORTES POR LOCALIDAD</h2>
        </div>
        <div class="loc-table-container">
          <div class="loc-header-row">
            <span>LOCALIDAD</span>
            <span>REPORTES (ATENDIDOS / PENDIENTES)</span>
            <span style="text-align: right;">LÁMPARAS</span>
          </div>

          ${topLocalidades.length === 0 ? `<div style="color:#94A3B8;font-size:9px;padding:8px 0;">No hay reportes en este periodo</div>` : topLocalidades.map((loc) => {
            const pctAt = loc.total > 0 ? (loc.atendidos / loc.total) * 100 : 0;
            const pctPend = loc.total > 0 ? (loc.pendientes / loc.total) * 100 : 0;
            const barWidth = Math.max(8, Math.round((loc.total / maxLocReportes) * 100));

            return `
              <div class="loc-row">
                <span class="loc-name" title="${esc(loc.nombre)}">${esc(loc.nombre)}<span class="loc-tipo">${esc(loc.tipo)}</span></span>
                <div class="loc-bar-container">
                  <div class="loc-bar-track" style="width: ${barWidth}%;">
                    <div class="loc-bar-atendidos" style="width: ${pctAt}%;" title="Atendidos: ${loc.atendidos}"></div>
                    <div class="loc-bar-pendientes" style="width: ${pctPend}%;" title="Pendientes: ${loc.pendientes}"></div>
                  </div>
                  <span class="loc-count-label">${loc.total}</span>
                </div>
                <div style="text-align: right;">
                  <span class="loc-lamp-badge">${loc.lamparas}</span>
                </div>
              </div>
            `;
          }).join('')}

          <div class="loc-legend">
            <div class="legend-item">
              <div class="legend-box" style="background: #0E1F38;"></div>
              <span>Atendidos</span>
            </div>
            <div class="legend-item">
              <div class="legend-box" style="background: #F59E0B;"></div>
              <span>Pendientes</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Tipo de Falla y Tipo de Lámpara -->
      <div class="two-cols-row">
        <!-- Falla -->
        <div class="col-card">
          <div class="section-header">
            <div class="section-accent-bar"></div>
            <h2 class="section-title">TIPO DE FALLA</h2>
          </div>
          <div>
            ${fallasSorted.map((f) => {
              const fillW = Math.max(6, Math.round((f.conteo / maxFallaConteo) * 100));
              return `
                <div class="horizontal-stat-row">
                  <span class="stat-label-text" title="${esc(f.nombre)}">${esc(f.nombre)}</span>
                  <div class="stat-bar-group">
                    <div class="stat-bar-track">
                      <div class="stat-bar-fill" style="width: ${fillW}%;"></div>
                    </div>
                    <span class="stat-val-text">${f.conteo} (${f.pct}%)</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Lámpara -->
        <div class="col-card">
          <div class="section-header">
            <div class="section-accent-bar"></div>
            <h2 class="section-title">TIPO DE LÁMPARA</h2>
          </div>
          <div>
            ${lamparasSorted.map((l) => {
              const fillW = Math.max(6, Math.round((l.conteo / maxLamparaConteo) * 100));
              let fillCls = '';
              const lower = l.nombre.toLowerCase();
              if (lower.includes('amarilla') || lower.includes('sodio')) fillCls = 'fill-orange';
              else if (lower.includes('led')) fillCls = 'fill-green';

              return `
                <div class="horizontal-stat-row">
                  <span class="stat-label-text" title="${esc(l.nombre)}">${esc(l.nombre)}</span>
                  <div class="stat-bar-group">
                    <div class="stat-bar-track">
                      <div class="stat-bar-fill ${fillCls}" style="width: ${fillW}%;"></div>
                    </div>
                    <span class="stat-val-text">${l.conteo} (${l.pct}%)</span>
                  </div>
                </div>
              `;
            }).join('')}
            <div class="lamp-summary-note">
              Total: ${totalLamparas} lámparas en ${total} reportes (${lamparasPorReporte} lámparas por reporte)
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Reportes por Día -->
      <div class="chart-days-card">
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">REPORTES POR DÍA · ${mesAnoTitulo}</h2>
        </div>

        <div class="days-bars-wrapper">
          <!-- Línea discontinua de promedio -->
          ${promedioPorDia > 0 ? `
            <div class="days-avg-line" style="bottom: ${Math.min(68, Math.max(4, Math.round((Number(promedioPorDia) / maxDiaCount) * 65)))}px;"></div>
          ` : ''}

          ${diasBuckets.map((b) => {
            const h = b.count > 0 ? Math.max(6, Math.round((b.count / maxDiaCount) * 65)) : 2;
            let barCls = b.isWeekend ? 'bar-weekend' : 'bar-weekday';
            if (b.count === maxDiaCount && b.count > 0) barCls = 'bar-peak';

            return `
              <div class="day-bar-col">
                <span class="day-val-num">${b.count > 0 ? b.count : ''}</span>
                <div class="day-bar-rect ${barCls}" style="height: ${h}px;" title="Día ${b.diaNum}: ${b.count} reportes"></div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="days-axis-labels">
          ${diasBuckets.map((b) => `
            <span class="day-axis-num">${b.diaNum}</span>
          `).join('')}
        </div>

        <div class="days-legend-row">
          <div style="display: flex; gap: 12px;">
            <div class="legend-item">
              <div class="legend-box" style="background: #0E1F38;"></div>
              <span>Entre semana</span>
            </div>
            <div class="legend-item">
              <div class="legend-box" style="background: #93C5FD;"></div>
              <span>Fin de semana</span>
            </div>
            ${diasPicoStr ? `
              <div class="legend-item">
                <div class="legend-box" style="background: #F59E0B;"></div>
                <span>Día con más reportes (${diasPicoStr})</span>
              </div>
            ` : ''}
          </div>
          <div style="font-weight: 700; color: #475569;">
            ---- Promedio ${promedioPorDia}/día${reportesEnGraficaDia === total ? '' : ` · ${reportesEnGraficaDia} de ${total} reportes en la gráfica`}
          </div>
        </div>
      </div>

      <!-- 5. Lo más relevante -->
      <div class="highlight-card">
        <div class="highlight-title">LO MÁS RELEVANTE</div>
        <div class="highlight-text">${esc(loMasRelevanteText)}</div>
      </div>

    </div>

    <footer class="sheet-footer">
      <span>Alumbrado Público · Resumen de periodo (${diasPeriodo} días)</span>
      <span>Página 1 de 3</span>
    </footer>
  </article>


  <!-- ===================================================================== -->
  <!-- PÁGINA 2: DETALLE TABULAR, PRIORITARIOS Y PERSONAL                   -->
  <!-- ===================================================================== -->
  <article class="report-sheet">
    <header class="sheet-header">
      <div>
        <h1 class="header-main-title">REPORTE ESTADÍSTICO</h1>
        <div class="header-sub-title">ALUMBRADO PÚBLICO · Resumen de reportes ciudadanos</div>
      </div>
      <div class="header-right">
        <div class="header-periodo-tag">PERIODO</div>
        <div class="header-periodo-range">${periodoFmt}</div>
        <div class="header-emitido">Emitido: ${hoyFmt}</div>
      </div>
    </header>

    <div class="sheet-content">

      <!-- 1. Detalle por Localidad y Colonia -->
      <div>
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">DETALLE POR LOCALIDAD</h2>
        </div>

        <table class="table-sheet2">
          <thead>
            <tr>
              <th>LOCALIDAD</th>
              <th>REPORTES</th>
              <th>LÁMPARAS</th>
              <th>ATENDIDOS</th>
              <th>PENDIENTES</th>
              <th style="width: 110px;">% ATENCIÓN</th>
            </tr>
          </thead>
          <tbody>
            ${localidadesSorted.map((loc) => {
              const locPct = loc.total > 0 ? Math.round((loc.atendidos / loc.total) * 100) : 0;
              return `
                <tr class="tr-loc-main">
                  <td>${esc(loc.nombre)} <span style="font-weight: 600; color: #64748B;">· ${esc(loc.tipo)}</span></td>
                  <td>${loc.total}</td>
                  <td>${loc.lamparas}</td>
                  <td>${loc.atendidos}</td>
                  <td>${loc.pendientes}</td>
                  <td>
                    <span class="table-progress-bar"><span class="table-progress-fill" style="width: ${locPct}%;"></span></span>
                    ${locPct}%
                  </td>
                </tr>
              `;
            }).join('')}

            <tr class="tr-total-general">
              <td>TOTAL GENERAL</td>
              <td>${total}</td>
              <td>${totalLamparas}</td>
              <td>${atendidosCount}</td>
              <td>${pendientesCount}</td>
              <td>
                <span class="table-progress-bar"><span class="table-progress-fill" style="width: ${efectividad}%;"></span></span>
                ${efectividad}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 2. Pendientes Prioritarios y Personal que Atendió -->
      <div class="two-cols-row" style="margin-top: 6px;">
        <!-- Pendientes Prioritarios -->
        <div class="col-card">
          <div class="section-header">
            <div class="section-accent-bar"></div>
            <h2 class="section-title">PENDIENTES PRIORITARIOS</h2>
          </div>

          <table class="pendientes-table">
            <thead>
              <tr>
                <th style="width: 50px;">FOLIO</th>
                <th>LOCALIDAD</th>
                <th>FALLA</th>
                <th style="text-align: right; width: 75px;">ANTIGÜEDAD</th>
              </tr>
            </thead>
            <tbody>
              ${pendientesPrioritarios.length > 0 ? pendientesPrioritarios.map((p) => `
                <tr>
                  <td><strong>${esc(p.folio)}</strong></td>
                  <td>${esc(p.localidad)}</td>
                  <td>${esc(p.falla)}</td>
                  <td style="text-align: right;">
                    <span class="badge-antiguedad ${p.antiguedadClase}">${p.antiguedadLabel}</span>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="4" style="text-align: center; color: #94A3B8; padding: 12px;">
                    No hay reportes pendientes en este periodo
                  </td>
                </tr>
              `}
            </tbody>
          </table>
          ${pendientesCount > pendientesPrioritarios.length ? `
            <div class="lamp-summary-note">Los ${pendientesCount} pendientes están en los indicadores. Aquí se listan los ${pendientesPrioritarios.length} más antiguos.</div>
          ` : ''}
        </div>
      </div>

      <div class="col-card">
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">PERSONAL QUE ATENDIÓ · ${personalSorted.length} CON AL MENOS 1 SERVICIO</h2>
        </div>

        <div style="margin-top: 4px;">
          ${personalSorted.length > 0 ? `
            <div class="personal-grid">
              ${personalSorted.map((p) => {
                const w = Math.max(6, Math.round((p.servicios / maxServiciosPersonal) * 100));
                return `
                  <div class="personal-row">
                    <span class="personal-name" title="${esc(p.nombre)}">${esc(p.nombre)}</span>
                    <div class="personal-bar-track">
                      <div class="personal-bar-fill" style="width: ${w}%;"></div>
                    </div>
                    <span class="personal-count">${p.servicios}</span>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="lamp-summary-note">
              ${personalSorted.length} trabajadores · ${totalServiciosPersonal} participaciones en ${atendidosCount} reportes atendidos.
              La suma puede ser mayor que los reportes cuando un servicio lo hizo más de una persona.
              ${reportesSinPersonal > 0 ? `${reportesSinPersonal} reportes atendidos no tienen personal registrado.` : ''}
            </div>
          ` : `
            <div style="text-align: center; color: #94A3B8; padding: 12px; font-size: 9px;">
              No hay personal registrado en los reportes atendidos de este periodo
            </div>
          `}
        </div>
      </div>

    </div>

    <footer class="sheet-footer">
      <span>Alumbrado Público · ${localidadesSorted.length} localidades · ${sumaLocalidades} reportes</span>
      <span>Página 2 de 3</span>
    </footer>
  </article>

  <!-- ===================================================================== -->
  <!-- PÁGINA 3: SOLICITUDES DE INSTALACIÓN DE LÁMPARAS                     -->
  <!-- ===================================================================== -->
  <article class="report-sheet">
    <header class="sheet-header">
      <div>
        <h1 class="header-main-title">REPORTE ESTADÍSTICO</h1>
        <div class="header-sub-title">ALUMBRADO PÚBLICO · Solicitudes de instalación de lámparas</div>
      </div>
      <div class="header-right">
        <div class="header-periodo-tag">PERIODO</div>
        <div class="header-periodo-range">${periodoFmt}</div>
        <div class="header-emitido">Emitido: ${hoyFmt}</div>
      </div>
    </header>

    <div class="sheet-content">
      <div>
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">INSTALACIÓN DE LÁMPARAS · INDICADORES</h2>
        </div>
        <div class="kpi-row">
          <div class="kpi-box">
            <span class="kpi-num">${totalSolicitudes}</span>
            <span class="kpi-tag">SOLICITUDES</span>
            <span class="kpi-note">en el periodo</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">${lamparasSolicitadas}</span>
            <span class="kpi-tag">LÁMPARAS</span>
            <span class="kpi-note">solicitadas</span>
          </div>
          <div class="kpi-box kpi-box-green">
            <span class="kpi-num kpi-num-green">${solicitudesAtendidas.length}</span>
            <span class="kpi-tag">ATENDIDAS</span>
            <span class="kpi-note">${efectividadSol}% de atención</span>
          </div>
          <div class="kpi-box kpi-box-orange">
            <span class="kpi-num kpi-num-orange">${solicitudesNoAtendidas.length}</span>
            <span class="kpi-tag">SIN ATENDER</span>
            <span class="kpi-note">${totalSolicitudes > 0 ? Math.round((solicitudesNoAtendidas.length / totalSolicitudes) * 100) : 0}% del total</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">${lamparasInstaladasSol}</span>
            <span class="kpi-tag">INSTALADAS</span>
            <span class="kpi-note">en solicitudes atendidas</span>
          </div>
        </div>
      </div>

      <div class="two-cols-row">
        <div class="col-card">
          <div class="section-header">
            <div class="section-accent-bar"></div>
            <h2 class="section-title">POR ESTATUS</h2>
          </div>
          ${estatusSolSorted.length > 0 ? estatusSolSorted.map((e) => {
            const fillW = Math.max(6, Math.round((e.conteo / maxEstatusSol) * 100));
            return `
              <div class="horizontal-stat-row">
                <span class="stat-label-text">${esc(e.nombre)}</span>
                <div class="stat-bar-group">
                  <div class="stat-bar-track">
                    <div class="stat-bar-fill ${foldKey(e.nombre) === 'atendido' ? 'fill-green' : 'fill-orange'}" style="width: ${fillW}%;"></div>
                  </div>
                  <span class="stat-val-text">${e.conteo} (${e.pct}%)</span>
                </div>
              </div>
            `;
          }).join('') : `<div style="color:#94A3B8;font-size:9px;padding:8px 0;">No hay solicitudes en este periodo</div>`}
        </div>

        <div class="col-card">
          <div class="section-header">
            <div class="section-accent-bar"></div>
            <h2 class="section-title">CABECERA Y COMUNIDADES</h2>
          </div>
          ${tipoSolSorted.length > 0 ? tipoSolSorted.map((t) => {
            const pct = t.solicitudes > 0 ? Math.round((t.atendidas / t.solicitudes) * 100) : 0;
            return `
              <div class="horizontal-stat-row">
                <span class="stat-label-text">${esc(t.nombre)}</span>
                <div class="stat-bar-group">
                  <div class="stat-bar-track">
                    <div class="stat-bar-fill" style="width: ${totalSolicitudes > 0 ? Math.max(6, Math.round((t.solicitudes / totalSolicitudes) * 100)) : 0}%;"></div>
                  </div>
                  <span class="stat-val-text">${t.solicitudes} sol. · ${t.lamparas} lám. · ${pct}%</span>
                </div>
              </div>
            `;
          }).join('') : `<div style="color:#94A3B8;font-size:9px;padding:8px 0;">Sin solicitudes para clasificar</div>`}
          <div class="lamp-summary-note">
            ${totalSolicitudes > 0 ? (lamparasSolicitadas / totalSolicitudes).toFixed(1) : '0.0'} lámparas por solicitud
          </div>
        </div>
      </div>

      <div>
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">SOLICITUDES POR LOCALIDAD</h2>
        </div>
        <div class="loc-table-container">
          ${locSolSorted.length > 0 ? locSolSorted.map((loc) => {
            const pctAt = loc.total > 0 ? (loc.atendidas / loc.total) * 100 : 0;
            const pctPend = loc.total > 0 ? (loc.pendientes / loc.total) * 100 : 0;
            const barWidth = Math.max(8, Math.round((loc.total / maxLocSol) * 100));
            return `
              <div class="loc-row">
                <span class="loc-name">${esc(loc.nombre)}</span>
                <div class="loc-bar-container">
                  <div class="loc-bar-track" style="width: ${barWidth}%;">
                    <div class="loc-bar-atendidos" style="width: ${pctAt}%;"></div>
                    <div class="loc-bar-pendientes" style="width: ${pctPend}%;"></div>
                  </div>
                  <span class="loc-count-label">${loc.total}</span>
                </div>
                <div style="text-align: right;">
                  <span class="loc-lamp-badge">${loc.lamparas}</span>
                </div>
              </div>
            `;
          }).join('') : `<div style="color:#94A3B8;font-size:9px;padding:8px 0;">No hay solicitudes en este periodo</div>`}
          <div class="loc-legend">
            <div class="legend-item"><div class="legend-box" style="background:#0E1F38;"></div><span>Atendidas</span></div>
            <div class="legend-item"><div class="legend-box" style="background:#F59E0B;"></div><span>Sin atender</span></div>
          </div>
        </div>
      </div>

      <div>
        <div class="section-header">
          <div class="section-accent-bar"></div>
          <h2 class="section-title">DETALLE Y SOLICITUDES MÁS ANTIGUAS SIN ATENDER</h2>
        </div>
        <table class="table-sheet2">
          <thead>
            <tr>
              <th>LOCALIDAD</th>
              <th>SOLICITUDES</th>
              <th>LÁMPARAS</th>
              <th>ATENDIDAS</th>
              <th>SIN ATENDER</th>
              <th style="width: 110px;">% ATENCIÓN</th>
            </tr>
          </thead>
          <tbody>
            ${locSolSorted.map((loc) => {
              const pct = loc.total > 0 ? Math.round((loc.atendidas / loc.total) * 100) : 0;
              return `
                <tr class="tr-loc-main">
                  <td>${esc(loc.nombre)}</td>
                  <td>${loc.total}</td>
                  <td>${loc.lamparas}</td>
                  <td>${loc.atendidas}</td>
                  <td>${loc.pendientes}</td>
                  <td>
                    <span class="table-progress-bar"><span class="table-progress-fill" style="width: ${pct}%;"></span></span>
                    ${pct}%
                  </td>
                </tr>
              `;
            }).join('')}
            <tr class="tr-total-general">
              <td>TOTAL GENERAL</td>
              <td>${totalSolicitudes}</td>
              <td>${lamparasSolicitadas}</td>
              <td>${solicitudesAtendidas.length}</td>
              <td>${solicitudesNoAtendidas.length}</td>
              <td>
                <span class="table-progress-bar"><span class="table-progress-fill" style="width: ${efectividadSol}%;"></span></span>
                ${efectividadSol}%
              </td>
            </tr>
          </tbody>
        </table>

        <table class="pendientes-table" style="margin-top: 12px;">
          <thead>
            <tr>
              <th>SOLICITANTE</th>
              <th>LOCALIDAD</th>
              <th>LÁMPARAS</th>
              <th>ESTATUS</th>
              <th style="text-align: right;">ANTIGÜEDAD</th>
            </tr>
          </thead>
          <tbody>
            ${solicitudesPrioritarias.length > 0 ? solicitudesPrioritarias.map((s) => `
              <tr>
                <td><strong>${esc(s.solicitante)}</strong></td>
                <td>${esc(s.localidad)}</td>
                <td>${s.lamparas}</td>
                <td>${esc(s.estatus)}</td>
                <td style="text-align: right;"><span class="badge-antiguedad ${s.antiguedadClase}">${s.antiguedadLabel}</span></td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="5" style="text-align: center; color: #94A3B8; padding: 12px;">No hay solicitudes sin atender en este periodo</td>
              </tr>
            `}
          </tbody>
        </table>
        ${solicitudesNoAtendidas.length > solicitudesPrioritarias.length ? `
          <div class="lamp-summary-note">Se listan las ${solicitudesPrioritarias.length} solicitudes sin atender más antiguas, de ${solicitudesNoAtendidas.length}.</div>
        ` : ''}
      </div>
    </div>

    <footer class="sheet-footer">
      <span>Alumbrado Público · Instalación de lámparas · ${locSolSorted.length} localidades</span>
      <span>Página 3 de 3</span>
    </footer>
  </article>

</body>
</html>`;
}
