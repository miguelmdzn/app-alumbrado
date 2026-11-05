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

function estatusKey(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'atendido' || v === 'atendida') return 'atendido';
  return 'pendiente';
}

function estatusLabel(value) {
  return estatusKey(value) === 'atendido' ? 'Atendido' : 'Pendiente';
}

function openAttendModal(id) {
  pendingAttendId = id;
  $('modalAtendido')?.classList.remove('hidden');
}

function closeAttendModal() {
  pendingAttendId = null;
  $('modalAtendido')?.classList.add('hidden');
}

/* --------------------------------------------------------------------------
   VISTA DE PANTALLA: Tabla interactiva de registros
   -------------------------------------------------------------------------- */
function renderTable(reportes) {
  const tbody = $('reportesTableBody');
  if (!tbody) return;

  const filtro = $('filterEstatus')?.value || 'pendiente';

  if (reportes.length === 0) {
    const hasQuery = ($('searchInput')?.value || '').trim();
    const emptyText = hasQuery
      ? 'No se encontraron reportes con esa búsqueda.'
      : filtro === 'atendido'
        ? 'No se encontraron reportes atendidos.'
        : 'No se encontraron reportes pendientes.';
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
    const status = estatusKey(r.estatus);
    const checkBtn = status === 'pendiente'
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
        <td><span class="badge-status badge-status-${status}">${estatusLabel(r.estatus)}</span></td>
        <td class="td-center">
          <div class="table-actions">
            <a class="btn-icon-action" href="reportes.html?id=${encodeURIComponent(r.id)}" title="Editar reporte" aria-label="Editar reporte">${PENCIL_ICON}</a>
            ${checkBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-atender]').forEach((btn) => {
    btn.onclick = () => openAttendModal(btn.dataset.atender);
  });
}

/* --------------------------------------------------------------------------
   Cálculo de días transcurridos
   -------------------------------------------------------------------------- */
function getDaysAgo(dateStr, todayIso) {
  if (!dateStr) return 0;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return 0;
  const dOld = new Date(parts[0], parts[1] - 1, parts[2]);
  const todayParts = todayIso.split('-').map(Number);
  const dNow = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const diffTime = dNow.getTime() - dOld.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
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

  // Separar los reportes en:
  // 1) Días anteriores (fecha < hoy)
  // 2) Del día (fecha >= hoy o sin fecha)
  const anteriores = [];
  const delDia = [];

  reportes.forEach((r) => {
    const daysAgo = getDaysAgo(r.fecha, todayIso);
    if (daysAgo > 0) {
      anteriores.push({ ...r, _daysAgo: daysAgo });
    } else {
      delDia.push(r);
    }
  });

  // Ordenar anteriores: del más antiguo al más reciente
  anteriores.sort((a, b) => {
    const da = a.fecha || '9999-99-99';
    const db = b.fecha || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    return (a.folio || '').localeCompare(b.folio || '');
  });

  // Ordenar los del día por folio o ID
  delDia.sort((a, b) => {
    return (a.folio || '').localeCompare(b.folio || '');
  });

  // Totales oficiales para el encabezado
  const total = reportes.length;
  const totalAnteriores = anteriores.length;
  const totalDelDia = delDia.length;

  if ($('printTotalSummary')) {
    $('printTotalSummary').textContent = `Total: ${total} reportes (${totalAnteriores} de días anteriores, ${totalDelDia} del día)`;
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
    if (r.colonia_comunidad) domParts.push(`Col. ${r.colonia_comunidad}`);
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

    return `
      <tr class="${isAnterior ? 'print-row-anterior' : 'print-row-dia'}">
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
    `;
  };

  let sectionsHtml = '';

  const viendoAtendidos = ($('filterEstatus')?.value || 'pendiente') === 'atendido';
  const tituloAnteriores = viendoAtendidos
    ? `ATENDIDOS DE DÍAS ANTERIORES (${anteriores.length} ${anteriores.length === 1 ? 'reporte' : 'reportes'}, del más antiguo al más reciente)`
    : `PENDIENTES DE DÍAS ANTERIORES (${anteriores.length} ${anteriores.length === 1 ? 'reporte' : 'reportes'}, del más antiguo al más reciente) - ATENCIÓN PRIORITARIA`;

  // 1. Sección: días anteriores
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

  // 2. Sección: REPORTES DEL DÍA
  if (delDia.length > 0 || anteriores.length === 0) {
    sectionsHtml += `
      <div class="print-section print-section-dia">
        <div class="print-section-header-gray">
          REPORTES DEL DÍA ${todayFmt} (${delDia.length} ${delDia.length === 1 ? 'reporte' : 'reportes'})
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
  const filtro = $('filterEstatus')?.value || 'pendiente';

  let filtered = allReportes.filter((r) => estatusKey(r.estatus) === filtro);
  if (query) {
    filtered = filtered.filter((r) => {
      return [
        r.folio, r.usuario, r.atendio, r.direccion,
        r.colonia_comunidad, r.tipo_falla, r.tipo_lampara,
        r.referencias, r.entre_calles, r.observaciones, r.telefono
      ].some((v) => (v || '').toLowerCase().includes(query));
    });
  }

  renderTable(filtered);
  renderPrintDocument(filtered);
}

async function confirmMarcarAtendido() {
  const id = pendingAttendId;
  if (!id) return;

  const reporte = allReportes.find((r) => r.id === id);
  closeAttendModal();
  if (!reporte) return;

  try {
    const saved = await saveReporte({ ...reporte, estatus: 'atendido' });
    const index = allReportes.findIndex((r) => r.id === id);
    if (index >= 0) allReportes[index] = { ...allReportes[index], ...saved, estatus: 'atendido' };
    applyFilterAndRender();
  } catch (err) {
    console.error('Error al marcar reporte como atendido:', err);
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

  try {
    allReportes = await getAllReportes();
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
  $('modalAtendidoSi')?.addEventListener('click', confirmMarcarAtendido);
  $('modalAtendido')?.addEventListener('click', (e) => {
    if (e.target === $('modalAtendido')) closeAttendModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modalAtendido')?.classList.contains('hidden')) {
      closeAttendModal();
    }
  });

  $('btnExportPdf')?.addEventListener('click', () => {
    window.print();
  });
});
