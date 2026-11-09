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
} from './db.js';

import { attachInputNormalizers } from './normalizer.js';

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
  return 4;                           // Hasta arriba: los que digan otro (o personalizado)
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

  const filtro = $('filterEstatus')?.value || 'sin_atender';

  if (reportes.length === 0) {
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
    return;
  }

  tbody.innerHTML = reportes.map((r) => {
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

  // Separar los reportes en tablas por estatus e importancia:
  // 1) Estatus "Otro" (aparece hasta arriba)
  // 2) Estatus "Urgente" (arriba de los de días anteriores)
  // 3) Días anteriores (Pendientes / En espera con fecha < hoy)
  // 4) Del día (Pendientes / En espera generados hoy)
  const reportesOtro = [];
  const reportesUrgente = [];
  const anteriores = [];
  const delDia = [];

  reportes.forEach((r) => {
    const daysAgo = getDaysAgo(r.fecha, todayIso);
    const withDays = daysAgo > 0 ? { ...r, _daysAgo: daysAgo } : { ...r, _daysAgo: 0 };
    const grp = getStatusGroup(r.estatus);

    if (grp === 'otro') {
      reportesOtro.push(withDays);
    } else if (grp === 'urgente') {
      reportesUrgente.push(withDays);
    } else if (daysAgo > 0) {
      anteriores.push(withDays);
    } else {
      delDia.push(withDays);
    }
  });

  // Ordenar "Otro": del más antiguo al más reciente
  reportesOtro.sort((a, b) => {
    const da = a.fecha || '9999-99-99';
    const db = b.fecha || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    return (a.folio || '').localeCompare(b.folio || '');
  });

  // Ordenar "Urgentes": del más antiguo al más reciente
  reportesUrgente.sort((a, b) => {
    const da = a.fecha || '9999-99-99';
    const db = b.fecha || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    return (a.folio || '').localeCompare(b.folio || '');
  });

  // Ordenar anteriores: del más antiguo al más reciente
  anteriores.sort((a, b) => {
    const da = a.fecha || '9999-99-99';
    const db = b.fecha || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    return (a.folio || '').localeCompare(b.folio || '');
  });

  // Ordenar los del día por folio
  delDia.sort((a, b) => {
    return (a.folio || '').localeCompare(b.folio || '');
  });

  // Totales oficiales para el encabezado
  const total = reportes.length;
  const totalOtro = reportesOtro.length;
  const totalUrgente = reportesUrgente.length;
  const totalAnteriores = anteriores.length;
  const totalDelDia = delDia.length;

  if ($('printTotalSummary')) {
    const parts = [];
    if (totalOtro > 0) parts.push(`${totalOtro} otro`);
    if (totalUrgente > 0) parts.push(`${totalUrgente} urgentes`);
    if (totalAnteriores > 0) parts.push(`${totalAnteriores} de días anteriores`);
    if (totalDelDia > 0 || parts.length === 0) parts.push(`${totalDelDia} del día`);
    $('printTotalSummary').textContent = `Total: ${total} reportes (${parts.join(', ')})`;
  }

  // Contadores de la tabla en pantalla
  const totalLamparas = reportes.reduce((acc, r) => acc + (parseInt(r.numero_lamparas, 10) || 1), 0);
  if ($('lblTotal')) $('lblTotal').textContent = total;
  if ($('lblLamparas')) $('lblLamparas').textContent = totalLamparas;

  if (total === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">No hay reportes para imprimir.</div></div>`;
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

  // 2. Sección: URGENTES (arriba de los de días anteriores)
  if (reportesUrgente.length > 0) {
    sectionsHtml += `
      <div class="print-section print-section-urgente">
        <div class="print-section-header-dark">
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

  // 3. Sección: PENDIENTES DE DÍAS ANTERIORES
  const viendoAtendidos = ($('filterEstatus')?.value || 'sin_atender') === 'atendido';
  const tituloAnteriores = viendoAtendidos
    ? `ATENDIDOS DE DÍAS ANTERIORES (${anteriores.length} ${anteriores.length === 1 ? 'REPORTE' : 'REPORTES'}, DEL MÁS ANTIGUO AL MÁS RECIENTE)`
    : `PENDIENTES DE DÍAS ANTERIORES (${anteriores.length} ${anteriores.length === 1 ? 'REPORTE' : 'REPORTES'}, DEL MÁS ANTIGUO AL MÁS RECIENTE) - ATENCIÓN PRIORITARIA`;

  if (anteriores.length > 0) {
    sectionsHtml += `
      <div class="print-section print-section-anteriores">
        <div class="print-section-header-dark">
          ${tituloAnteriores}
        </div>
        <table class="print-reports-table">
          ${theadHtml}
          <tbody>
            ${anteriores.map((r) => renderPrintRow(r, true)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // 4. Sección: REPORTES DEL DÍA
  if (delDia.length > 0 || (reportesOtro.length === 0 && reportesUrgente.length === 0 && anteriores.length === 0)) {
    sectionsHtml += `
      <div class="print-section print-section-dia">
        <div class="print-section-header-gray">
          REPORTES DEL DÍA ${todayFmt} (${delDia.length} ${delDia.length === 1 ? 'REPORTE' : 'REPORTES'})
        </div>
        <table class="print-reports-table">
          ${theadHtml}
          <tbody>
            ${delDia.length > 0
        ? delDia.map((r) => renderPrintRow(r, false)).join('')
        : `<tr><td colspan="6" class="print-empty-row">No hay reportes registrados generados el día de hoy.</td></tr>`
      }
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = sectionsHtml;
}

/* --------------------------------------------------------------------------
   Filtros y búsqueda en tiempo real
   -------------------------------------------------------------------------- */
function applyFilterAndRender() {
  const query = ($('searchInput')?.value || '').trim().toLowerCase();
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
        r.colonia_comunidad, r.tipo_falla, r.tipo_lampara,
        r.referencias, r.entre_calles, r.observaciones, r.telefono,
        r.estatus
      ].some((v) => (v || '').toLowerCase().includes(query));
    });
  }

  renderTable(filtered);
  renderPrintDocument(filtered);
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
    // Actualizar automáticamente estatus según días hábiles transcurridos
    await updateReportesStatusByBusinessDays(allReportes, todayIso, currentHolidaysSet);
  } catch (err) {
    console.error('Error al cargar reportes:', err);
    allReportes = [];
  }

  // Ordenar más reciente primero para la tabla en pantalla
  allReportes.sort((a, b) => {
    const ka = (b.fecha || '') + (b.created_at || '');
    const kb = (a.fecha || '') + (a.created_at || '');
    return ka.localeCompare(kb);
  });

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('modalAtendido')?.classList.contains('hidden')) closeAttendModal();
      if (!$('modalOpcionesAtendido')?.classList.contains('hidden')) closeOpcionesModal();
      if (!$('modalDetalleReporte')?.classList.contains('hidden')) closeDetalleModal();
    }
  });

  $('btnExportPdf')?.addEventListener('click', () => {
    window.print();
  });

  // Toggle de submenú Herramientas en barra lateral
  $('btnToggleHerramientas')?.addEventListener('click', (e) => {
    e.preventDefault();
    const group = $('navGroupHerramientas');
    if (group) {
      const isOpen = group.classList.toggle('is-open');
      $('btnToggleHerramientas')?.setAttribute('aria-expanded', String(isOpen));
    }
  });
});
