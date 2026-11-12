/**
 * ============================================================================
 * REGISTRO DE REPORTES DE FALLAS — Alumbrado Público (registros-reportes.js)
 * ============================================================================
 * - Vista en pantalla: tabla interactiva con búsqueda en tiempo real
 * - Vista de impresión: diseño tabular oficial dividido en dos secciones:
 *   1) Pendientes de días anteriores (Atención prioritaria, del más antiguo al más reciente)
 *   2) Reportes del día (generados el día de emisión del PDF)
 * ============================================================================
 */

import {
  initDatabase,
  getAllReportes,
  saveReporte,
  syncOfficialHolidays,
  getActiveHolidaysSet,
  countBusinessDays,
  getAllSolicitudesLamparas,
} from './db.js';

import { attachInputNormalizers } from './normalizer.js';
import { processSyncQueue } from './database/repositories/syncQueue.js';
import { TablePaginator } from './table-pagination.js';
import { buildReporteEstadisticoHTML } from './reporte-estadistico.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));

const fd = (s) => (s ? s.split('-').reverse().join('/') : '');

let allReportes = [];
let pendingAttendId = null;
let lastFilteredReportes = [];

/* Vista activa: 'reportes' | 'solicitudes' */
let vistaActual = 'reportes';
let allSolicitudes = [];

const paginator = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => {
    if (vistaActual === 'solicitudes') {
      renderSolicitudesTable(allSolicitudes);
    } else {
      renderTable(lastFilteredReportes);
    }
  },
  storageKey: 'paginator_reportes',
});

const paginatorSolicitudes = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => renderSolicitudesTable(allSolicitudes),
  storageKey: 'paginator_solicitudes',
});

const PENCIL_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>
`;

const CHECK_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

const EYE_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

function isAtendido(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'atendido' || v === 'atendida';
}

function extractOtroEspec(value) {
  const v = String(value || '').trim();
  const m = v.match(/^Otro\s*\((.*)\)\s*$/i);
  return m ? m[1].trim() : v;
}

function getStatusGroup(value) {
  const v = String(value || '').trim().toLowerCase();
  if (isAtendido(v)) return 'atendido';
  if (v === 'en espera') return 'espera';
  if (v === 'pendiente') return 'pendiente';
  if (v === 'urgente') return 'urgente';
  return 'otro';
}

function formatStatusLabel(value) {
  const v = String(value || '').trim();
  if (!v) return 'En espera';
  const lower = v.toLowerCase();
  if (lower === 'atendido' || lower === 'atendida') return 'Atendido';
  if (lower === 'en espera') return 'En espera';
  if (lower === 'pendiente') return 'Pendiente';
  if (lower === 'urgente') return 'Urgente';
  const m = v.match(/^Otro\s*\((.*)\)\s*$/i);
  if (m) return `Otro(${m[1].trim()})`;
  return v;
}

function getPriorityRank(estatus) {
  const s = String(estatus || '').trim().toLowerCase();
  if (isAtendido(s)) return 0;
  if (s === 'en espera') return 1;    // Nivel más bajo
  if (s === 'pendiente') return 2;    // Luego pendientes
  if (s === 'urgente') return 3;      // Luego urgente
  return 4;                           // Hasta arriba: Otro(...)
}

function sortReportesByHierarchy(lista) {
  return lista.sort((a, b) => {
    const rankA = getPriorityRank(a.estatus);
    const rankB = getPriorityRank(b.estatus);
    if (rankA !== rankB) {
      return rankB - rankA; // Mayor jerarquía primero (4: Otro, 3: Urgente, 2: Pendiente, 1: En espera, 0: Atendido)
    }
    // Mismo nivel de estatus: ordenar por fecha (más antiguo primero si es pendiente/urgente/otro, o más reciente)
    const fa = a.fecha || '9999-99-99';
    const fb = b.fecha || '9999-99-99';
    if (fa !== fb) return fa.localeCompare(fb);
    return (a.folio || '').localeCompare(b.folio || '');
  });
}

function openAttendModal(id) {
  pendingAttendId = id;
  $('modalAtendido')?.classList.remove('hidden');
}

function closeAttendModal() {
  $('modalAtendido')?.classList.add('hidden');
}

function openOpcionesModal() {
  $('modalOpcionesAtendido')?.classList.remove('hidden');
}

function closeOpcionesModal() {
  pendingAttendId = null;
  $('modalOpcionesAtendido')?.classList.add('hidden');
}

function openDetalleModal(id) {
  const r = allReportes.find((item) => item.id === id);
  if (!r) return;

  const content = $('modalDetalleContent');
  if (!content) return;

  const statusGroup = getStatusGroup(r.estatus);
  const statusLabel = formatStatusLabel(r.estatus);
  const fechaFmt = fd(r.fecha) || '—';
  const domParts = [];
  if (r.direccion) domParts.push(r.direccion);
  if (r.colonia_comunidad) domParts.push(`${r.colonia_comunidad}`);
  const domicilio = domParts.join(', ') || '—';

  content.innerHTML = `
    <div class="detail-item">
      <span class="detail-label">Folio</span>
      <span class="detail-value"><strong>${esc(r.folio || 'S/F')}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Estatus</span>
      <span class="detail-value"><span class="badge-status badge-status-${statusGroup}">${esc(statusLabel)}</span></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Fecha del reporte</span>
      <span class="detail-value">${fechaFmt}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Personal que atendió</span>
      <span class="detail-value">${esc(r.atendio || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Usuario / Solicitante</span>
      <span class="detail-value"><strong>${esc(r.usuario || '—')}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Teléfono de contacto</span>
      <span class="detail-value">${esc(r.telefono || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Tipo de localidad</span>
      <span class="detail-value">${esc(r.tipo_localidad || 'Cabecera municipal (Valle de Santiago)')}</span>
    </div>
    <div class="detail-item-full detail-item">
      <span class="detail-label">Dirección y Colonia</span>
      <span class="detail-value">${esc(domicilio)}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Entre qué calles</span>
      <span class="detail-value">${esc(r.entre_calles || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Referencias</span>
      <span class="detail-value">${esc(r.referencias || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Número de lámparas</span>
      <span class="detail-value"><strong>${r.numero_lamparas || 1}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Tipo de lámpara</span>
      <span class="detail-value">${esc(r.tipo_lampara || '—')}</span>
    </div>
    <div class="detail-item-full detail-item">
      <span class="detail-label">Tipo de falla</span>
      <span class="detail-value">${esc(r.tipo_falla || '—')}</span>
    </div>
    <div class="detail-item-full detail-item">
      <span class="detail-label">Observaciones</span>
      <span class="detail-value">${esc(r.observaciones || '—')}</span>
    </div>
  `;

  $('modalDetalleReporte')?.classList.remove('hidden');
}

function closeDetalleModal() {
  $('modalDetalleReporte')?.classList.add('hidden');
}

function onConfirmAtendidoSi() {
  closeAttendModal();
  openOpcionesModal();
}

async function finalizarSoloTerminado() {
  const id = pendingAttendId;
  closeOpcionesModal();
  if (!id) return;

  const reporte = allReportes.find((r) => r.id === id);
  if (!reporte) return;

  try {
    const saved = await saveReporte({ ...reporte, estatus: 'Atendido' });
    const index = allReportes.findIndex((r) => r.id === id);
    if (index >= 0) allReportes[index] = { ...allReportes[index], ...saved, estatus: 'Atendido' };
    applyFilterAndRender();
  } catch (err) {
    console.error('Error al marcar reporte como atendido:', err);
  }
}

async function finalizarYAnadirEvidencia() {
  const id = pendingAttendId;
  closeOpcionesModal();
  if (!id) return;

  const reporte = allReportes.find((r) => r.id === id);
  if (!reporte) return;

  try {
    await saveReporte({ ...reporte, estatus: 'Atendido' });
    const index = allReportes.findIndex((r) => r.id === id);
    if (index >= 0) allReportes[index] = { ...allReportes[index], estatus: 'Atendido' };

    const dirParts = [];
    if (reporte.direccion) dirParts.push(reporte.direccion);
    if (reporte.colonia_comunidad) dirParts.push(`${reporte.colonia_comunidad}`);
    const ubicacion = dirParts.join(', ');
    const tipo = reporte.tipo_falla || reporte.tipo_lampara || 'Falla de alumbrado';

    const query = new URLSearchParams({
      folio: reporte.folio || '',
      tipo: tipo,
      ubicacion: ubicacion
    });

    window.location.href = `index.html?${query.toString()}`;
  } catch (err) {
    console.error('Error al finalizar y redirigir a evidencia:', err);
  }
}

/* --------------------------------------------------------------------------
   VISTA DE PANTALLA: Tabla interactiva de registros
   -------------------------------------------------------------------------- */
function renderTable(reportes) {
  const tbody = $('reportesTableBody');
  if (!tbody) return;

  lastFilteredReportes = reportes;
  const pageData = paginator.getCurrentSlice(reportes);
  const filtro = $('filterEstatus')?.value || 'sin_atender';

  if (pageData.length === 0) {
    const hasQuery = ($('searchInput')?.value || '').trim();
    const emptyText = hasQuery
      ? 'No se encontraron reportes con esa búsqueda.'
      : filtro === 'atendido'
        ? 'No se encontraron reportes atendidos.'
        : 'No se encontraron reportes sin atender.';
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="table-empty-row">
          ${emptyText}
        </td>
      </tr>
    `;
    paginator.update(reportes.length);
    return;
  }

  tbody.innerHTML = pageData.map((r) => {
    const ubicacion = r.direccion || '—';
    const colonia = r.colonia_comunidad || '—';
    const fechaFmt = fd(r.fecha) || '—';
    const statusGroup = getStatusGroup(r.estatus);
    const displayStatus = formatStatusLabel(r.estatus);
    const checkBtn = !isAtendido(r.estatus)
      ? `<button type="button" class="btn-icon-action btn-icon-action-check" data-atender="${esc(r.id)}" title="Marcar como atendido" aria-label="Marcar como atendido">${CHECK_ICON}</button>`
      : '';

    return `
      <tr>
        <td class="td-folio">${esc(r.folio || 'S/F')}</td>
        <td class="td-datetime">${fechaFmt}</td>
        <td>${esc(r.atendio || '—')}</td>
        <td><strong>${esc(r.usuario || '—')}</strong></td>
        <td class="td-domicilio">${esc(ubicacion)}</td>
        <td>${esc(colonia)}</td>
        <td>${esc(r.telefono || '—')}</td>
        <td class="td-center"><strong>${r.numero_lamparas || 1}</strong></td>
        <td><span class="badge-lampara">${esc(r.tipo_lampara || '—')}</span></td>
        <td><span class="badge-falla">${esc(r.tipo_falla || '—')}</span></td>
        <td><span class="badge-status badge-status-${statusGroup}">${esc(displayStatus)}</span></td>
        <td class="td-center">
          <div class="table-actions">
            <button type="button" class="btn-icon-action" data-detalle="${esc(r.id)}" title="Ver detalle del reporte" aria-label="Ver detalle del reporte">${EYE_ICON}</button>
            <a class="btn-icon-action" href="reportes.html?id=${encodeURIComponent(r.id)}" title="Editar reporte" aria-label="Editar reporte">${PENCIL_ICON}</a>
            ${checkBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-detalle]').forEach((btn) => {
    btn.onclick = () => openDetalleModal(btn.dataset.detalle);
  });

  tbody.querySelectorAll('[data-atender]').forEach((btn) => {
    btn.onclick = () => openAttendModal(btn.dataset.atender);
  });

  paginator.update(reportes.length);
}

/* --------------------------------------------------------------------------
   Cálculo de días hábiles y actualización dinámica de estatus
   - 0 a 4 días hábiles: "En espera"
   - 5 a 9 días hábiles: "Pendiente"
   - 10+ días hábiles:   "Urgente"
   (Sin contar fines de semana ni días inhábiles oficiales/municipales activos)
   -------------------------------------------------------------------------- */
let currentHolidaysSet = null;

function getDaysAgo(dateStr, todayIso) {
  if (!dateStr) return 0;
  if (currentHolidaysSet) {
    return countBusinessDays(dateStr, todayIso, currentHolidaysSet);
  }
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return 0;
  const dOld = new Date(parts[0], parts[1] - 1, parts[2]);
  const todayParts = todayIso.split('-').map(Number);
  const dNow = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const diffTime = dNow.getTime() - dOld.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

async function updateReportesStatusByBusinessDays(reportesList, todayIso, holidaysSet) {
  for (const r of reportesList) {
    const s = String(r.estatus || '').trim();
    const lower = s.toLowerCase();
    // No modificar si ya está atendido ni si es un estatus manual "Otro(...)"
    if (lower === 'atendido' || lower === 'atendida' || lower.startsWith('otro')) {
      continue;
    }

    const businessDays = countBusinessDays(r.fecha, todayIso, holidaysSet);
    let targetStatus = 'En espera';
    if (businessDays >= 10) {
      targetStatus = 'Urgente';
    } else if (businessDays >= 5) {
      targetStatus = 'Pendiente';
    } else {
      targetStatus = 'En espera';
    }

    if (s !== targetStatus) {
      r.estatus = targetStatus;
      try {
        await saveReporte(r);
      } catch (err) {
        console.warn('Error al actualizar estatus por días hábiles:', err);
      }
    }
  }
}

/* --------------------------------------------------------------------------
   VISTA DE IMPRESIÓN OFICIAL: Diseño tabular con secciones prioritarias
   -------------------------------------------------------------------------- */
function renderPrintDocument(reportes) {
  const container = $('reportesPrintContainer');
  if (!container) return;

  const hoy = new Date();
  hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
  const todayIso = hoy.toISOString().slice(0, 10); // YYYY-MM-DD
  const todayFmt = fd(todayIso); // DD/MM/AAAA

  if ($('printDate')) {
    $('printDate').textContent = todayFmt;
  }

  // Separar los reportes en listas según la estricta jerarquía de estatus:
  // 1) Solicitudes de lámparas (arriba del todo)
  // 2) Estatus "Otro"
  // 3) Estatus "Urgente"
  // 4) Estatus "Pendiente" (tanto de días anteriores como del día)
  // 5) Estatus "En espera" (tanto de días anteriores como del día)
  // 6) Estatus "Atendido" (si el filtro actual incluye atendidos)
  const reportesOtro = [];
  const reportesUrgente = [];
  const reportesPendiente = [];
  const reportesEnEspera = [];
  const reportesAtendido = [];

  reportes.forEach((r) => {
    const daysAgo = getDaysAgo(r.fecha, todayIso);
    const withDays = daysAgo > 0 ? { ...r, _daysAgo: daysAgo } : { ...r, _daysAgo: 0 };
    const grp = getStatusGroup(r.estatus);

    if (grp === 'otro') {
      reportesOtro.push(withDays);
    } else if (grp === 'urgente') {
      reportesUrgente.push(withDays);
    } else if (grp === 'pendiente') {
      reportesPendiente.push(withDays);
    } else if (grp === 'atendido') {
      reportesAtendido.push(withDays);
    } else {
      reportesEnEspera.push(withDays);
    }
  });

  // Ordenar cada grupo: de más antiguo a más reciente por fecha
  const sortByDateAsc = (a, b) => {
    const da = a.fecha || '9999-99-99';
    const db = b.fecha || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    return (a.folio || '').localeCompare(b.folio || '');
  };

  reportesOtro.sort(sortByDateAsc);
  reportesUrgente.sort(sortByDateAsc);
  reportesPendiente.sort(sortByDateAsc);
  reportesEnEspera.sort(sortByDateAsc);
  reportesAtendido.sort(sortByDateAsc);

  // Totales oficiales para el encabezado
  const total = reportes.length;
  const totalOtro = reportesOtro.length;
  const totalUrgente = reportesUrgente.length;
  const totalPendiente = reportesPendiente.length;
  const totalEnEspera = reportesEnEspera.length;

  if ($('printTotalSummary')) {
    const parts = [];
    if (allSolicitudes && allSolicitudes.length > 0) parts.push(`${allSolicitudes.length} solicitudes`);
    if (totalOtro > 0) parts.push(`${totalOtro} otro`);
    if (totalUrgente > 0) parts.push(`${totalUrgente} urgentes`);
    if (totalPendiente > 0) parts.push(`${totalPendiente} pendientes`);
    if (totalEnEspera > 0) parts.push(`${totalEnEspera} en espera`);
    $('printTotalSummary').textContent = `Total: ${total} reportes (${parts.join(', ')})`;
  }

  // Contadores de la tabla en pantalla (solo si estamos en vista de reportes)
  if (vistaActual === 'reportes') {
    const totalLamparas = reportes.reduce((acc, r) => acc + (parseInt(r.numero_lamparas, 10) || 1), 0);
    if ($('lblTotal')) $('lblTotal').textContent = total;
    if ($('lblLamparas')) $('lblLamparas').textContent = totalLamparas;
  }

  if (total === 0 && (!allSolicitudes || allSolicitudes.length === 0)) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">No hay reportes ni solicitudes para imprimir.</div></div>`;
    return;
  }

  const theadHtml = `
    <thead>
      <tr class="print-table-subhead">
        <th class="th-folio">FOLIO</th>
        <th class="th-fecha">FECHA</th>
        <th class="th-solicitante">SOLICITANTE / TELÉFONO</th>
        <th class="th-domicilio">DOMICILIO / ENTRE CALLES</th>
        <th class="th-lamparas">LÁMPARAS / TIPO</th>
        <th class="th-falla">FALLA / REFERENCIAS</th>
      </tr>
    </thead>
  `;

  const renderPrintRow = (r, isAnterior) => {
    const fechaFmt = fd(r.fecha) || '—';
    const solicitante = esc(r.usuario || '—');
    const telefono = r.telefono ? `Tel. ${esc(r.telefono)}` : 'Tel. —';

    // Domicilio completo y Entre calles
    const domParts = [];
    if (r.direccion) domParts.push(r.direccion);
    if (r.colonia_comunidad) domParts.push(`${r.colonia_comunidad}`);
    const domicilio = domParts.join(', ') || '—';

    let entreCalles = r.entre_calles ? r.entre_calles.trim() : '';
    if (entreCalles) {
      if (!/^entre\s+/i.test(entreCalles)) {
        entreCalles = `Entre ${entreCalles}`;
      }
    } else {
      entreCalles = '—';
    }

    // Cantidad de lámparas y tipo
    const cant = parseInt(r.numero_lamparas, 10) || 1;
    const cantText = cant === 1 ? '1 lámpara' : `${cant} lámparas`;
    const tipoLampara = r.tipo_lampara || '—';

    // Falla y referencias
    const falla = esc(r.tipo_falla || '—');
    let refText = r.referencias ? r.referencias.trim() : '';
    if (refText) {
      if (!/^ref\b/i.test(refText)) {
        refText = `Ref. ${refText}`;
      }
    } else {
      refText = 'Ref. —';
    }

    const fechaCellHtml = isAnterior && r._daysAgo > 0
      ? `<div class="print-fecha-val">${fechaFmt}</div><div class="print-ago-text">hace ${r._daysAgo} ${r._daysAgo === 1 ? 'día' : 'días'}</div>`
      : `<div class="print-fecha-val">${fechaFmt}</div>`;

    const obsText = (r.observaciones || '').trim();
    const obsRow = obsText
      ? `
        <tr class="print-row-observaciones ${isAnterior ? 'print-row-anterior' : 'print-row-dia'}">
          <td colspan="6" class="col-observaciones">
            <span class="print-obs-label">Observaciones:</span> <span class="print-obs-text">${esc(obsText)}</span>
          </td>
        </tr>
      `
      : '';

    return `
      <tr class="${isAnterior ? 'print-row-anterior' : 'print-row-dia'} ${obsText ? 'has-observaciones' : ''}">
        <td class="col-folio">${esc(r.folio || 'S/F')}</td>
        <td class="col-fecha">${fechaCellHtml}</td>
        <td class="col-solicitante">
          <div class="print-title-bold">${solicitante}</div>
          <div class="print-sub-text">${esc(telefono)}</div>
        </td>
        <td class="col-domicilio">
          <div class="print-title-normal">${esc(domicilio)}</div>
          <div class="print-sub-text">${esc(entreCalles)}</div>
        </td>
        <td class="col-lamparas">
          <div class="print-title-normal">${cantText}</div>
          <div class="print-sub-text">${esc(tipoLampara)}</div>
        </td>
        <td class="col-falla">
          <div class="print-title-bold">${falla}</div>
          <div class="print-sub-text">${esc(refText)}</div>
        </td>
      </tr>
      ${obsRow}
    `;
  };

  let sectionsHtml = '';

  // 0. Sección: SOLICITUDES DE LÁMPARAS (Aparece hasta arriba si hay registradas)
  if (allSolicitudes && allSolicitudes.length > 0) {
    const solicitudesPrintRows = allSolicitudes.map((s) => {
      const solicitante = esc(s.nombre_solicitante || '—');
      const telefono = esc(s.telefono || '—');
      const colonia = esc(s.colonia_comunidad || '—');
      const cant = parseInt(s.cantidad_lamparas, 10) || 1;
      const cantText = cant === 1 ? '1 lámpara' : `${cant} lámparas`;
      const descText = esc(s.descripcion || '—');

      return `
        <tr class="print-row-dia">
          <td class="col-solicitante">
            <div class="print-title-bold">${solicitante}</div>
          </td>
          <td>
            <div class="print-title-normal">${telefono}</div>
          </td>
          <td class="col-domicilio">
            <div class="print-title-normal">${colonia}</div>
          </td>
          <td class="col-lamparas">
            <div class="print-title-normal">${cantText}</div>
          </td>
          <td>
            <div class="print-title-normal">${descText}</div>
          </td>
        </tr>
      `;
    }).join('');

    sectionsHtml += `
      <div class="print-section print-section-otro">
        <div class="print-section-header-dark" style="background-color: #2c3e50;">
          SOLICITUDES DE LÁMPARAS (${allSolicitudes.length} ${allSolicitudes.length === 1 ? 'SOLICITUD' : 'SOLICITUDES'})
        </div>
        <table class="print-reports-table">
          <thead>
            <tr class="print-table-subhead">
              <th class="th-solicitante">SOLICITANTE</th>
              <th class="th-fecha">TELÉFONO</th>
              <th class="th-domicilio">COLONIA O COMUNIDAD</th>
              <th class="th-lamparas">CANTIDAD DE LÁMPARAS</th>
              <th class="th-falla">DESCRIPCIÓN</th>
            </tr>
          </thead>
          <tbody>
            ${solicitudesPrintRows}
          </tbody>
        </table>
      </div>
    `;
  }

  // 1. Sección: OTRO (se agrupa y muestra el texto del nuevo input como título)
  if (reportesOtro.length > 0) {
    const gruposOtro = new Map();
    reportesOtro.forEach((r) => {
      const espec = extractOtroEspec(r.estatus) || 'OTRO';
      if (!gruposOtro.has(espec)) {
        gruposOtro.set(espec, []);
      }
      gruposOtro.get(espec).push(r);
    });

    gruposOtro.forEach((lista, espec) => {
      const tituloEspec = espec.toUpperCase();
      sectionsHtml += `
        <div class="print-section print-section-otro">
          <div class="print-section-header-dark">
            ${esc(tituloEspec)} (${lista.length} ${lista.length === 1 ? 'REPORTE' : 'REPORTES'})
          </div>
          <table class="print-reports-table">
            ${theadHtml}
            <tbody>
              ${lista.map((r) => renderPrintRow(r, r._daysAgo > 0)).join('')}
            </tbody>
          </table>
        </div>
      `;
    });
  }

  // 2. Sección: URGENTES (arriba de pendientes)
  if (reportesUrgente.length > 0) {
    sectionsHtml += `
      <div class="print-section print-section-urgente">
        <div class="print-section-header-dark" style="background-color: #c0392b;">
          URGENTES (${reportesUrgente.length} ${reportesUrgente.length === 1 ? 'REPORTE' : 'REPORTES'})
        </div>
        <table class="print-reports-table">
          ${theadHtml}
          <tbody>
            ${reportesUrgente.map((r) => renderPrintRow(r, r._daysAgo > 0)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // 3. Sección: PENDIENTES
  if (reportesPendiente.length > 0) {
    sectionsHtml += `
      <div class="print-section print-section-anteriores">
        <div class="print-section-header-dark" style="background-color: #d35400;">
          PENDIENTES (${reportesPendiente.length} ${reportesPendiente.length === 1 ? 'REPORTE' : 'REPORTES'})
        </div>
        <table class="print-reports-table">
          ${theadHtml}
          <tbody>
            ${reportesPendiente.map((r) => renderPrintRow(r, r._daysAgo > 0)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // 4. Sección: EN ESPERA (hasta el último de los activos)
  if (reportesEnEspera.length > 0) {
    sectionsHtml += `
      <div class="print-section print-section-dia">
        <div class="print-section-header-gray">
          EN ESPERA (${reportesEnEspera.length} ${reportesEnEspera.length === 1 ? 'REPORTE' : 'REPORTES'})
        </div>
        <table class="print-reports-table">
          ${theadHtml}
          <tbody>
            ${reportesEnEspera.map((r) => renderPrintRow(r, r._daysAgo > 0)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // 5. Sección: ATENDIDOS (si se está filtrando o existen atendidos)
  if (reportesAtendido.length > 0) {
    sectionsHtml += `
      <div class="print-section print-section-dia">
        <div class="print-section-header-dark" style="background-color: #27ae60;">
          ATENDIDOS (${reportesAtendido.length} ${reportesAtendido.length === 1 ? 'REPORTE' : 'REPORTES'})
        </div>
        <table class="print-reports-table">
          ${theadHtml}
          <tbody>
            ${reportesAtendido.map((r) => renderPrintRow(r, r._daysAgo > 0)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = sectionsHtml;
}

/* --------------------------------------------------------------------------
   VISTA DE SOLICITUDES DE LÁMPARAS
   -------------------------------------------------------------------------- */
const PENCIL_SOL_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>
`;

function renderSolicitudesTable(lista) {
  const tbody = $('solicitudesTableBody');
  if (!tbody) return;

  const pageData = paginator.getCurrentSlice(lista);

  if (pageData.length === 0) {
    const hasQuery = ($('searchInput')?.value || '').trim();
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty-row">
          ${hasQuery ? 'No se encontraron solicitudes con esa búsqueda.' : 'No hay solicitudes de instalación de lámparas registradas.'}
        </td>
      </tr>
    `;
    paginator.update(lista.length);
    return;
  }

  tbody.innerHTML = pageData.map((s) => {
    const fechaFmt = fd(s.fecha_solicitud) || '—';
    const statusGroup = (() => {
      const v = String(s.estatus || '').trim().toLowerCase();
      if (v === 'atendido' || v === 'atendida') return 'atendido';
      if (v === 'urgente') return 'urgente';
      if (v === 'pendiente') return 'pendiente';
      return 'espera';
    })();
    return `
      <tr>
        <td class="td-datetime">${fechaFmt}</td>
        <td><strong>${esc(s.nombre_solicitante || '—')}</strong></td>
        <td>${esc(s.tipo_localidad || '—')}</td>
        <td class="td-center"><strong>${s.cantidad_lamparas || 1}</strong></td>
        <td><span class="badge-status badge-status-${statusGroup}">${esc(s.estatus || 'En espera')}</span></td>
        <td>${esc(s.descripcion || '—')}</td>
        <td>${esc(s.observaciones || '—')}</td>
        <td class="td-center">
          <div class="table-actions">
            <a class="btn-icon-action" href="solicitudes-lamparas.html?id=${encodeURIComponent(s.id)}" title="Editar solicitud" aria-label="Editar solicitud">${PENCIL_SOL_ICON}</a>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  paginator.update(lista.length);
}

/* --------------------------------------------------------------------------
   ALTERNAR ENTRE VISTA DE REPORTES Y SOLICITUDES
   -------------------------------------------------------------------------- */
function activarVistaReportes() {
  vistaActual = 'reportes';

  $('vistaReportes')?.classList.remove('hidden');
  $('vistaSolicitudes')?.classList.add('hidden');

  const filterEl = $('filterEstatus');
  if (filterEl) filterEl.style.display = '';
  const pillEl = $('pillLamparas');
  if (pillEl) pillEl.style.display = '';

  const lbl = $('lblToggleVista');
  if (lbl) lbl.textContent = 'Solicitudes';
  if ($('pageViewTitle')) $('pageViewTitle').textContent = 'REGISTRO DE REPORTES';
  if ($('pageViewDesc'))  $('pageViewDesc').textContent  = 'Consulta e impresión de reportes de fallas de Alumbrado Público.';

  paginator.resetPage();
  applyFilterAndRender();
}

async function activarVistaSolicitudes() {
  vistaActual = 'solicitudes';

  $('vistaReportes')?.classList.add('hidden');
  $('vistaSolicitudes')?.classList.remove('hidden');

  const filterEl = $('filterEstatus');
  if (filterEl) filterEl.style.display = 'none';
  const pillEl = $('pillLamparas');
  if (pillEl) pillEl.style.display = 'none';

  const lbl = $('lblToggleVista');
  if (lbl) lbl.textContent = 'Reportes';
  if ($('pageViewTitle')) $('pageViewTitle').textContent = 'SOLICITUDES DE INSTALACIÓN DE LÁMPARAS';
  if ($('pageViewDesc'))  $('pageViewDesc').textContent  = 'Consulta de solicitudes de instalación de nuevas lámparas.';

  if ($('lblTotal')) $('lblTotal').textContent = '...';

  try {
    allSolicitudes = await getAllSolicitudesLamparas();
  } catch (err) {
    console.error('[solicitudes] Error al cargar:', err);
    allSolicitudes = [];
  }

  // Búsqueda en tiempo real sobre solicitudes
  const query = ($('searchInput')?.value || '').trim().toLowerCase();
  let lista = allSolicitudes;
  if (query) {
    lista = allSolicitudes.filter((s) =>
      [s.nombre_solicitante, s.tipo_localidad, s.descripcion, s.observaciones, s.estatus]
        .some((v) => (v || '').toLowerCase().includes(query))
    );
  }

  if ($('lblTotal')) $('lblTotal').textContent = lista.length;

  paginator.resetPage();
  renderSolicitudesTable(lista);
  // Regenerar vista de impresión con solicitudes arriba
  renderPrintDocument(allReportes);
}

/* --------------------------------------------------------------------------
   Filtros y búsqueda en tiempo real
   -------------------------------------------------------------------------- */
function applyFilterAndRender() {
  const query = ($('searchInput')?.value || '').trim().toLowerCase();

  // Si estamos viendo solicitudes, filtrar y renderizar solicitudes
  if (vistaActual === 'solicitudes') {
    let lista = allSolicitudes;
    if (query) {
      lista = allSolicitudes.filter((s) =>
        [s.nombre_solicitante, s.tipo_localidad, s.descripcion, s.observaciones, s.estatus]
          .some((v) => (v || '').toLowerCase().includes(query))
      );
    }
    if ($('lblTotal')) $('lblTotal').textContent = lista.length;
    paginator.resetPage();
    renderSolicitudesTable(lista);
    return;
  }

  // Vista de reportes
  const filtro = $('filterEstatus')?.value || 'sin_atender';

  let filtered = allReportes.filter((r) => {
    const atendido = isAtendido(r.estatus);
    if (filtro === 'atendido') return atendido;
    return !atendido;
  });

  if (query) {
    filtered = filtered.filter((r) => {
      return [
        r.folio, r.usuario, r.atendio, r.direccion,
        r.colonia_comunidad, r.tipo_localidad, r.tipo_falla, r.tipo_lampara,
        r.referencias, r.entre_calles, r.observaciones, r.telefono,
        r.estatus
      ].some((v) => (v || '').toLowerCase().includes(query));
    });
  }

  // Asegurar que la lista filtrada mantenga la jerarquía de estatus
  sortReportesByHierarchy(filtered);

  paginator.resetPage();
  renderTable(filtered);
  renderPrintDocument(filtered);
}

/* --------------------------------------------------------------------------
   GENERAR INFORME ESTADÍSTICO
   -------------------------------------------------------------------------- */
function openModalInforme() {
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const toISO = (d) => d.toISOString().slice(0, 10);
  const ini = $('informeFechaInicio');
  const fin = $('informeFechaFin');
  if (ini) ini.value = toISO(primerDia);
  if (fin) fin.value = toISO(hoy);
  $('modalGenerarInforme')?.classList.remove('hidden');
}

function closeModalInforme() {
  $('modalGenerarInforme')?.classList.add('hidden');
}

function closeTipoReporteModal() {
  $('modalTipoReporte')?.classList.add('hidden');
}

function generarInforme() {
  const fechaIni = $('informeFechaInicio')?.value;
  const fechaFin = $('informeFechaFin')?.value;
  if (!fechaIni || !fechaFin) {
    alert('Por favor selecciona las fechas de inicio y fin.');
    return;
  }
  if (fechaIni > fechaFin) {
    alert('La fecha de inicio no puede ser mayor que la fecha de fin.');
    return;
  }

  // Guardar parámetros de filtro para la vista del informe
  try {
    sessionStorage.setItem('informe_filtro', JSON.stringify({ fechaIni, fechaFin }));
  } catch (e) {
    console.warn('Error al guardar en sessionStorage:', e);
  }

  closeModalInforme();

  // Intentar abrir en pestaña nueva; si Tauri WebView2 lo bloquea, navegar directamente
  try {
    const win = window.open('informe-estadistico.html', '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.location.href = 'informe-estadistico.html';
    }
  } catch {
    window.location.href = 'informe-estadistico.html';
  }
}



/* --------------------------------------------------------------------------
   Inicialización
   -------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al conectar base de datos:', err);
  }

  const hoy = new Date();
  hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
  const todayIso = hoy.toISOString().slice(0, 10);

  // Sincronizar días festivos oficiales y asuetos municipales en BD
  try {
    await syncOfficialHolidays();
  } catch (err) {
    console.warn('Error al sincronizar días oficiales:', err);
  }

  try {
    currentHolidaysSet = await getActiveHolidaysSet();
  } catch (err) {
    console.warn('Error al obtener días festivos activos:', err);
    currentHolidaysSet = new Set();
  }

  try {
    allReportes = await getAllReportes();
  } catch (err) {
    console.error('Error al cargar reportes:', err);
    allReportes = [];
  }

  // Pre-cargar solicitudes de instalación para estadísticas y vista de impresión
  try {
    allSolicitudes = await getAllSolicitudesLamparas();
  } catch (err) {
    console.warn('Error al cargar solicitudes iniciales:', err);
    allSolicitudes = [];
  }

  // Ordenar por estricta jerarquía de estatus para la pantalla:
  // 1) Otro (mayor jerarquía)
  // 2) Urgente
  // 3) Pendiente
  // 4) En espera (hasta el final)
  sortReportesByHierarchy(allReportes);

  applyFilterAndRender();
  attachInputNormalizers(document);

  $('searchInput')?.addEventListener('input', applyFilterAndRender);
  $('filterEstatus')?.addEventListener('change', applyFilterAndRender);

  $('modalAtendidoNo')?.addEventListener('click', closeAttendModal);
  $('modalAtendidoSi')?.addEventListener('click', onConfirmAtendidoSi);
  $('btnSoloTerminado')?.addEventListener('click', finalizarSoloTerminado);
  $('btnAnadirEvidencia')?.addEventListener('click', finalizarYAnadirEvidencia);

  $('btnCerrarDetalle')?.addEventListener('click', closeDetalleModal);
  $('btnCerrarDetalleX')?.addEventListener('click', closeDetalleModal);

  $('modalAtendido')?.addEventListener('click', (e) => {
    if (e.target === $('modalAtendido')) closeAttendModal();
  });
  $('modalOpcionesAtendido')?.addEventListener('click', (e) => {
    if (e.target === $('modalOpcionesAtendido')) closeOpcionesModal();
  });
  $('modalDetalleReporte')?.addEventListener('click', (e) => {
    if (e.target === $('modalDetalleReporte')) closeDetalleModal();
  });

  $('btnNuevoReporte')?.addEventListener('click', () => {
    $('modalTipoReporte')?.classList.remove('hidden');
  });

  // Botón para alternar entre vista de Reportes y Solicitudes
  $('btnToggleVista')?.addEventListener('click', () => {
    if (vistaActual === 'reportes') {
      activarVistaSolicitudes();
    } else {
      activarVistaReportes();
    }
  });

  $('btnTipoReporteFalla')?.addEventListener('click', () => {
    window.location.href = 'reportes.html';
  });
  $('btnTipoSolicitudLampara')?.addEventListener('click', () => {
    window.location.href = 'solicitudes-lamparas.html';
  });
  $('btnCerrarTipoReporteX')?.addEventListener('click', closeTipoReporteModal);
  $('modalTipoReporte')?.addEventListener('click', (e) => {
    if (e.target === $('modalTipoReporte')) closeTipoReporteModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('modalAtendido')?.classList.contains('hidden')) closeAttendModal();
      if (!$('modalOpcionesAtendido')?.classList.contains('hidden')) closeOpcionesModal();
      if (!$('modalDetalleReporte')?.classList.contains('hidden')) closeDetalleModal();
      if (!$('modalTipoReporte')?.classList.contains('hidden')) closeTipoReporteModal();
    }
  });

  $('btnExportPdf')?.addEventListener('click', () => {
    window.print();
  });

  // Botón: Generar informe estadístico
  $('btnGenerarInforme')?.addEventListener('click', openModalInforme);
  $('btnCerrarInformeX')?.addEventListener('click', closeModalInforme);
  $('btnCancelarInforme')?.addEventListener('click', closeModalInforme);
  $('btnConfirmarInforme')?.addEventListener('click', generarInforme);
  $('modalGenerarInforme')?.addEventListener('click', (e) => {
    if (e.target === $('modalGenerarInforme')) closeModalInforme();
  });

  // Sidebar: Google Sheets → navega a personal.html
  $('btnSidebarGoogleSheets')?.addEventListener('click', () => {
    window.location.href = 'personal.html';
  });

  // Reintento automático de sincronización al volver internet
  window.addEventListener('online', () => {
    console.info('[registros-reportes] Conexión restaurada, procesando cola de reportes...');
    processSyncQueue('reportes');
  });

  // Toggle de submenú Herramientas en barra lateral: navegar a herramientas.html
  // (el toggle lo maneja herramientas.html con su script inline)
});


