/**
 * ============================================================================
 * REGISTRO DE REPORTES DE FALLAS — Alumbrado Público (registros-reportes.js)
 * ============================================================================
 * - Vista en pantalla: tabla interactiva con búsqueda en tiempo real
 * - Vista de impresión: fichas completas con TODA la información del reporte
 * ============================================================================
 */

import {
  initDatabase,
  getAllReportes,
  deleteReporte,
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

/* --------------------------------------------------------------------------
   VISTA DE PANTALLA: Tabla de registros
   -------------------------------------------------------------------------- */
function renderTable(reportes) {
  const tbody = $('reportesTableBody');
  if (!tbody) return;

  if (reportes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="table-empty-row">
          No se encontraron reportes registrados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = reportes.map((r) => {
    const ubicacion = r.direccion || '—';
    const colonia = r.colonia_comunidad || '—';
    const fechaFmt = fd(r.fecha) || '—';

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
        <td class="td-center">
          <button type="button" class="btn btn-danger-outline btn-table-action" data-del="${r.id}">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (confirm('¿Deseas eliminar este reporte?')) {
        await deleteReporte(btn.dataset.del);
        allReportes = allReportes.filter((x) => x.id !== btn.dataset.del);
        applyFilterAndRender();
      }
    };
  });
}

/* --------------------------------------------------------------------------
   VISTA DE IMPRESIÓN: Fichas completas con toda la info
   -------------------------------------------------------------------------- */
function renderPrintFichas(reportes) {
  const container = $('reportesPrintList');
  if (!container) return;

  if (reportes.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">No hay reportes para imprimir.</div></div>`;
    return;
  }

  container.innerHTML = reportes.map((r, idx) => {
    const fechaFmt = fd(r.fecha) || '—';
    const ubicacionCompleta = [r.direccion, r.colonia_comunidad].filter(Boolean).join(', ') || '—';

    return `
      <article class="report-card reporte-print-card" data-id="${r.id}">

        <!-- Encabezado de la ficha -->
        <header class="card-top">
          <div class="card-folio-block">
            <span>N.° ${idx + 1}</span>
            <span>|</span>
            <span>FOLIO ${esc(r.folio || 'S/F')}</span>
          </div>
          <span class="card-status-text">${esc(r.estatus || 'PENDIENTE')}</span>
        </header>

        <!-- Cuerpo de la ficha: todas las columnas de datos -->
        <div class="reporte-print-body">

          <!-- Columna izquierda -->
          <div class="reporte-print-col">

            <div class="reporte-print-row">
              <div class="reporte-print-cell">
                <span class="cell-caption">FECHA</span>
                <span class="cell-data">${fechaFmt}</span>
              </div>
              <div class="reporte-print-cell">
                <span class="cell-caption">NOMBRE DEL QUE ATIENDE</span>
                <span class="cell-data">${esc(r.atendio || '—')}</span>
              </div>
            </div>

            <div class="reporte-print-row">
              <div class="reporte-print-cell reporte-cell-full">
                <span class="cell-caption">USUARIO / SOLICITANTE</span>
                <span class="cell-data">${esc(r.usuario || '—')}</span>
              </div>
              <div class="reporte-print-cell">
                <span class="cell-caption">TELÉFONO DE CONTACTO</span>
                <span class="cell-data">${esc(r.telefono || '—')}</span>
              </div>
            </div>

            <div class="reporte-print-row">
              <div class="reporte-print-cell reporte-cell-full">
                <span class="cell-caption">DIRECCIÓN (CALLE Y NÚMERO)</span>
                <span class="cell-data">${esc(r.direccion || '—')}</span>
              </div>
              <div class="reporte-print-cell">
                <span class="cell-caption">COLONIA O COMUNIDAD</span>
                <span class="cell-data">${esc(r.colonia_comunidad || '—')}</span>
              </div>
            </div>

            <div class="reporte-print-row">
              <div class="reporte-print-cell">
                <span class="cell-caption">ENTRE QUÉ CALLES</span>
                <span class="cell-data">${esc(r.entre_calles || '—')}</span>
              </div>
              <div class="reporte-print-cell">
                <span class="cell-caption">REFERENCIAS DE UBICACIÓN</span>
                <span class="cell-data">${esc(r.referencias || '—')}</span>
              </div>
            </div>

          </div>

          <!-- Columna derecha -->
          <div class="reporte-print-col reporte-print-col-right">

            <div class="reporte-print-row">
              <div class="reporte-print-cell">
                <span class="cell-caption">NÚM. DE LÁMPARAS</span>
                <span class="cell-data reporte-num-destacado">${r.numero_lamparas || 1}</span>
              </div>
              <div class="reporte-print-cell">
                <span class="cell-caption">TIPO DE LÁMPARA</span>
                <span class="cell-data">${esc(r.tipo_lampara || '—')}</span>
              </div>
            </div>

            <div class="reporte-print-row">
              <div class="reporte-print-cell reporte-cell-full">
                <span class="cell-caption">TIPO DE FALLA</span>
                <span class="cell-data reporte-falla-text">${esc(r.tipo_falla || '—')}</span>
              </div>
            </div>

            <div class="reporte-print-row reporte-row-obs">
              <div class="reporte-print-cell reporte-cell-full">
                <span class="cell-caption">OBSERVACIONES</span>
                <span class="cell-data">${esc(r.observaciones || '—')}</span>
              </div>
            </div>

          </div>

        </div>

        <!-- Espacio para firma de conformidad -->
        <div class="reporte-print-firma">
          <div class="reporte-firma-linea">
            <div class="reporte-firma-box">
              <div class="signature-line"></div>
              <span class="signature-title">FIRMA DEL TÉCNICO QUE ATENDIÓ</span>
              <span class="signature-name">${esc(r.atendio || '')}</span>
            </div>
            <div class="reporte-firma-box">
              <div class="signature-line"></div>
              <span class="signature-title">FIRMA DEL SOLICITANTE</span>
              <span class="signature-name">${esc(r.usuario || '')}</span>
            </div>
          </div>
        </div>

      </article>
    `;
  }).join('');

  /* ---------- KPIs del encabezado de impresión ---------- */
  const total = reportes.length;
  const totalLamparas = reportes.reduce((acc, r) => acc + (parseInt(r.numero_lamparas, 10) || 1), 0);

  if ($('kTotal')) $('kTotal').textContent = total;
  if ($('kLamparas')) $('kLamparas').textContent = totalLamparas;

  // Rango de fechas
  const fechas = reportes
    .map((r) => r.fecha)
    .filter(Boolean)
    .sort();

  if (fechas.length > 0) {
    const desde = fd(fechas[0]);
    const hasta = fd(fechas[fechas.length - 1]);
    if ($('kFechaRango')) {
      $('kFechaRango').textContent = desde === hasta ? desde : `${desde} – ${hasta}`;
    }
  }

  /* ---------- Contadores de la tabla en pantalla ---------- */
  if ($('lblTotal')) $('lblTotal').textContent = total;
  if ($('lblLamparas')) $('lblLamparas').textContent = totalLamparas;

  /* ---------- Fecha de impresión ---------- */
  if ($('printDate')) {
    const hoy = new Date();
    hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
    $('printDate').textContent = hoy.toISOString().slice(0, 10).split('-').reverse().join('/');
  }
}

/* --------------------------------------------------------------------------
   Filtros y búsqueda en tiempo real
   -------------------------------------------------------------------------- */
function applyFilterAndRender() {
  const query = ($('searchInput')?.value || '').trim().toLowerCase();

  let filtered = [...allReportes];
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
  renderPrintFichas(filtered);
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

  // Ordenar más reciente primero
  allReportes.sort((a, b) => {
    const ka = (b.fecha || '') + (b.created_at || '');
    const kb = (a.fecha || '') + (a.created_at || '');
    return ka.localeCompare(kb);
  });

  applyFilterAndRender();
  attachInputNormalizers(document);

  // Búsqueda en vivo
  $('searchInput')?.addEventListener('input', applyFilterAndRender);

  // Exportar / Imprimir PDF
  $('btnExportPdf')?.addEventListener('click', () => {
    window.print();
  });
});

