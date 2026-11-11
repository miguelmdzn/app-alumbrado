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
  getFullNameFunc = null
) {
  const total = reportes.length;
  const atendidosList = reportes.filter((r) => isAtendido(r.estatus));
  const pendientesList = reportes.filter((r) => !isAtendido(r.estatus));
  const atendidosCount = atendidosList.length;
  const pendientesCount = pendientesList.length;

  const totalLamparas = reportes.reduce(
    (acc, r) => acc + (parseInt(r.numero_lamparas, 10) || 1),
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
    if (ev.folio) {
      evidenciasByFolio.set(String(ev.folio).trim().toLowerCase(), ev);
    }
  });

  const personalCatalogMap = new Map();
  (personalList || []).forEach((p) => {
    if (p.id) personalCatalogMap.set(String(p.id).trim(), p);
    if (p.numero_trabajador) personalCatalogMap.set(String(p.numero_trabajador).trim(), p);
    if (p.numero_checador_digital) personalCatalogMap.set(String(p.numero_checador_digital).trim(), p);
  });

  function resolveWorkerName(raw) {
    if (!raw) return '';
    const clean = String(raw).trim();
    const p = personalCatalogMap.get(clean);
    if (p) {
      if (typeof getFullNameFunc === 'function') {
        const full = getFullNameFunc(p);
        if (full) return full;
      }
      const full = `${p.nombres || ''} ${p.apellido1 || ''} ${p.apellido2 || ''}`.trim();
      if (full) return full;
    }
    return clean;
  }

  // =========================================================================
  // Estimación de tiempo promedio de atención (días) usando Evidencias
  // =========================================================================
  let tiempoPromedioAtencion = '1.6';
  if (atendidosCount > 0) {
    const diffs = atendidosList.map((r) => {
      const fr = parseDateIso(r.fecha);
      // Buscar si tiene fecha de atención en la evidencia correspondiente
      const ev = r.folio ? evidenciasByFolio.get(String(r.folio).trim().toLowerCase()) : null;
      let fa = ev?.fecha ? parseDateIso(ev.fecha) : null;
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

  const hoy = new Date();
  hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
  const hoyIso = hoy.toISOString().slice(0, 10);
  const hoyFmt = fd(hoyIso);
  const periodoFmt = `${fd(fechaIni)} — ${fd(fechaFin)}`;
  const mesAnoTitulo = `${getMonthName(dIni)} ${dIni.getFullYear()}`;

  // =========================================================================
  // 1. Agrupación por Localidad (Top para la Página 1 y desglose para Página 2)
  // =========================================================================
  const locMap = new Map();
  reportes.forEach((r) => {
    let locName = (r.colonia_comunidad || r.tipo_localidad || 'Cabecera municipal').trim();
    if (!locName) locName = 'Cabecera municipal';

    let colName = (r.direccion || '').split(',')[0].trim() || 'Centro';
    if (!colName || colName.length < 3) colName = 'Centro';

    if (!locMap.has(locName)) {
      locMap.set(locName, {
        nombre: locName,
        total: 0,
        lamparas: 0,
        atendidos: 0,
        pendientes: 0,
        colonias: new Map(),
      });
    }

    const loc = locMap.get(locName);
    const lamps = parseInt(r.numero_lamparas, 10) || 1;
    const isAt = isAtendido(r.estatus);

    loc.total += 1;
    loc.lamparas += lamps;
    if (isAt) loc.atendidos += 1;
    else loc.pendientes += 1;

    if (!loc.colonias.has(colName)) {
      loc.colonias.set(colName, {
        nombre: colName,
        total: 0,
        lamparas: 0,
        atendidos: 0,
        pendientes: 0,
      });
    }
    const c = loc.colonias.get(colName);
    c.total += 1;
    c.lamparas += lamps;
    if (isAt) c.atendidos += 1;
    else c.pendientes += 1;
  });

  const localidadesSorted = Array.from(locMap.values()).sort((a, b) => b.total - a.total);
  const topLocalidades = localidadesSorted.slice(0, 8);
  const maxLocReportes = Math.max(...topLocalidades.map((l) => l.total), 1);

  // =========================================================================
  // 2. Agrupación por Tipo de Falla
  // =========================================================================
  const fallasMap = new Map();
  reportes.forEach((r) => {
    const f = (r.tipo_falla || 'Otros').trim();
    fallasMap.set(f, (fallasMap.get(f) || 0) + 1);
  });
  const fallasSorted = Array.from(fallasMap.entries())
    .map(([nombre, conteo]) => ({
      nombre,
      conteo,
      pct: total > 0 ? Math.round((conteo / total) * 100) : 0,
    }))
    .sort((a, b) => b.conteo - a.conteo)
    .slice(0, 5);
  const maxFallaConteo = Math.max(...fallasSorted.map((f) => f.conteo), 1);

  // =========================================================================
  // 3. Agrupación por Tipo de Lámpara
  // =========================================================================
  const lamparasMap = new Map();
  reportes.forEach((r) => {
    const t = (r.tipo_lampara || 'Blanca').trim();
    const cant = parseInt(r.numero_lamparas, 10) || 1;
    lamparasMap.set(t, (lamparasMap.get(t) || 0) + cant);
  });
  const lamparasSorted = Array.from(lamparasMap.entries())
    .map(([nombre, conteo]) => ({
      nombre,
      conteo,
      pct: totalLamparas > 0 ? Math.round((conteo / totalLamparas) * 100) : 0,
    }))
    .sort((a, b) => b.conteo - a.conteo);
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
    if (diasBuckets.length > 31) break;
  }

  reportes.forEach((r) => {
    if (r.fecha) {
      const match = diasBuckets.find((b) => b.iso === r.fecha);
      if (match) match.count += 1;
    }
  });

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
    .slice(0, 5)
    .map((r) => {
      let antiguedadLabel = 'hoy';
      let antiguedadClase = 'badge-antiguedad-hoy';
      if (r.fecha) {
        const rf = parseDateIso(r.fecha);
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
        localidad: r.colonia_comunidad || 'Cabecera',
        falla: r.tipo_falla || r.tipo_lampara || 'Sin especificar',
        antiguedadLabel,
        antiguedadClase,
      };
    });

  // =========================================================================
  // 7. Personal que Atendió (Página 2) — OBTENIDO DE LA TABLA DE EVIDENCIAS
  // =========================================================================
  const personalServiciosMap = new Map();
  const foliosContabilizados = new Set();

  // Función auxiliar para sumar servicios por nombre de trabajador
  function addServicioPersona(nombre) {
    if (!nombre) return;
    const n = nombre.trim();
    if (n) {
      personalServiciosMap.set(n, (personalServiciosMap.get(n) || 0) + 1);
    }
  }

  // A) Primero, para cada reporte atendido en el periodo, buscar el personal de su evidencia
  atendidosList.forEach((r) => {
    const fKey = String(r.folio || '').trim().toLowerCase();
    const ev = fKey ? evidenciasByFolio.get(fKey) : null;
    if (ev && ev.atendio) {
      foliosContabilizados.add(fKey);
      const tokens = String(ev.atendio).split(',').map((t) => t.trim()).filter(Boolean);
      tokens.forEach((tok) => {
        const resolvedName = resolveWorkerName(tok);
        addServicioPersona(resolvedName);
      });
    }
  });

  // B) Además, incluir todas las evidencias registradas en el periodo seleccionado
  (evidencias || []).forEach((ev) => {
    const evFecha = ev.fecha || '';
    if (evFecha >= fechaIni && evFecha <= fechaFin) {
      const fKey = String(ev.folio || '').trim().toLowerCase();
      // Si no fue ya contabilizado mediante el reporte atendido
      if (!foliosContabilizados.has(fKey) && ev.atendio) {
        foliosContabilizados.add(fKey);
        const tokens = String(ev.atendio).split(',').map((t) => t.trim()).filter(Boolean);
        tokens.forEach((tok) => {
          const resolvedName = resolveWorkerName(tok);
          addServicioPersona(resolvedName);
        });
      }
    }
  });

  // Fallback: si ninguna evidencia tenía personal pero r.atendio existe
  if (personalServiciosMap.size === 0) {
    atendidosList.forEach((r) => {
      const raw = (r.atendio || '').trim();
      if (raw) {
        const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
        tokens.forEach((tok) => addServicioPersona(resolveWorkerName(tok)));
      }
    });
  }

  const personalSorted = Array.from(personalServiciosMap.entries())
    .map(([nombre, servicios]) => ({ nombre, servicios }))
    .sort((a, b) => b.servicios - a.servicios)
    .slice(0, 6);
  const maxServiciosPersonal = Math.max(...personalSorted.map((p) => p.servicios), 1);

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
      overflow: hidden;
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
      grid-template-columns: 180px 1fr 70px;
      font-size: 9px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .loc-row {
      display: grid;
      grid-template-columns: 180px 1fr 70px;
      align-items: center;
      gap: 10px;
      padding: 3px 0;
    }

    .loc-name {
      font-size: 10px;
      font-weight: 600;
      color: #1E293B;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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

    .personal-row {
      display: grid;
      grid-template-columns: 150px 1fr 24px;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }

    .personal-name {
      font-size: 9px;
      font-weight: 600;
      color: #1E293B;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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

          ${topLocalidades.map((loc) => {
            const pctAt = loc.total > 0 ? (loc.atendidos / loc.total) * 100 : 0;
            const pctPend = loc.total > 0 ? (loc.pendientes / loc.total) * 100 : 0;
            const barWidth = Math.max(8, Math.round((loc.total / maxLocReportes) * 100));

            return `
              <div class="loc-row">
                <span class="loc-name" title="${esc(loc.nombre)}">${esc(loc.nombre)}</span>
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
            <div class="days-avg-line" style="bottom: ${Math.min(90, Math.max(10, Math.round((promedioPorDia / maxDiaCount) * 75)))}px;"></div>
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
            ---- Promedio ${promedioPorDia}/día
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
      <span>Página 1 de 2</span>
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
          <h2 class="section-title">DETALLE POR LOCALIDAD Y COLONIA</h2>
        </div>

        <table class="table-sheet2">
          <thead>
            <tr>
              <th>LOCALIDAD / COLONIA</th>
              <th>REPORTES</th>
              <th>LÁMPARAS</th>
              <th>ATENDIDOS</th>
              <th>PENDIENTES</th>
              <th style="width: 110px;">% ATENCIÓN</th>
            </tr>
          </thead>
          <tbody>
            ${localidadesSorted.slice(0, 7).map((loc) => {
              const locPct = loc.total > 0 ? Math.round((loc.atendidos / loc.total) * 100) : 0;
              const colRows = Array.from(loc.colonias.values())
                .sort((a, b) => b.total - a.total)
                .slice(0, 3)
                .map((c) => {
                  const cPct = c.total > 0 ? Math.round((c.atendidos / c.total) * 100) : 0;
                  return `
                    <tr class="tr-colonia-sub">
                      <td>${esc(c.nombre)}</td>
                      <td>${c.total}</td>
                      <td>${c.lamparas}</td>
                      <td>${c.atendidos}</td>
                      <td>${c.pendientes}</td>
                      <td>
                        <span class="table-progress-bar"><span class="table-progress-fill" style="width: ${cPct}%;"></span></span>
                        ${cPct}%
                      </td>
                    </tr>
                  `;
                }).join('');

              return `
                <tr class="tr-loc-main">
                  <td>${esc(loc.nombre)}</td>
                  <td>${loc.total}</td>
                  <td>${loc.lamparas}</td>
                  <td>${loc.atendidos}</td>
                  <td>${loc.pendientes}</td>
                  <td>
                    <span class="table-progress-bar"><span class="table-progress-fill" style="width: ${locPct}%;"></span></span>
                    ${locPct}%
                  </td>
                </tr>
                ${colRows}
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
        </div>

        <!-- Personal que Atendió (desde la tabla de evidencias) -->
        <div class="col-card">
          <div class="section-header">
            <div class="section-accent-bar"></div>
            <h2 class="section-title">PERSONAL QUE ATENDIÓ</h2>
          </div>

          <div style="margin-top: 4px;">
            <div style="display: grid; grid-template-columns: 150px 1fr 24px; font-size: 8px; font-weight: 800; color: #64748B; margin-bottom: 6px;">
              <span>NOMBRE</span>
              <span>SERVICIOS</span>
              <span></span>
            </div>

            ${personalSorted.length > 0 ? personalSorted.map((p) => {
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
            }).join('') : `
              <div style="text-align: center; color: #94A3B8; padding: 12px; font-size: 9px;">
                No hay servicios asignados a personal en este periodo
              </div>
            `}
          </div>
        </div>
      </div>

    </div>

    <footer class="sheet-footer">
      <span>Alumbrado Público · Resumen de periodo (${diasPeriodo} días)</span>
      <span>Página 2 de 2</span>
    </footer>
  </article>

</body>
</html>`;
}
