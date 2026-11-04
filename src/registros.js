/**
 * ============================================================================
 * BITÁCORA DIARIA DE REPORTES - REGISTRO DE EVIDENCIAS (registros.js)
 * ============================================================================
 * - Vista en pantalla: Tabla de registros con icono de Google Maps.
 * - Vista de exportación: Bitácora oficial idéntica al diseño aprobado
 *   (Encabezado institucional, 3 KPIs, tarjetas azul marino con QR bajo
 *   coordenadas y fotografías lado a lado, firmas de cierre).
 * ============================================================================
 */

import {
  initDatabase,
  getAllEvidencias,
  deleteEvidencia,
  loadMetadatos,
  openEvidenciasFolder,
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

// Estado en memoria
let allRecords = [];
let metadata = {
  fecha: '',
  area: 'Alumbrado Público',
  elab: '',
  reviso: ''
};

/* --------------------------------------------------------------------------
   Generador de Códigos QR para la Bitácora Oficial de Impresión
   -------------------------------------------------------------------------- */
function generateQrDataUrl(targetUrl) {
  if (!targetUrl || typeof window.qrcode === 'undefined') return '';
  try {
    const q = window.qrcode(0, 'M');
    q.addData(targetUrl);
    q.make();
    return q.createDataURL(5, 1);
  } catch (e) {
    try {
      const q = window.qrcode(0, 'L');
      q.addData(targetUrl);
      q.make();
      return q.createDataURL(5, 1);
    } catch (err) {
      console.warn('Error al generar código QR para bitácora:', err);
      return '';
    }
  }
}

/* --------------------------------------------------------------------------
   VISTA DE PANTALLA: RENDERIZADO DE LA TABLA DE REGISTROS
   -------------------------------------------------------------------------- */
function renderTable(records) {
  const tbody = $('recordsTableBody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty-row">
          No se encontraron registros de evidencias en la base de datos.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map((r) => {
    const mapsTarget = r.mapsUrl || (r.lat != null && r.lon != null ? `https://www.google.com/maps?q=${r.lat},${r.lon}` : '');

    const mapsIconHtml = mapsTarget
      ? `
        <a href="${esc(mapsTarget)}" target="_blank" rel="noopener noreferrer" class="maps-icon-link" title="Abrir ubicación en Google Maps">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </a>
      `
      : `
        <span class="maps-icon-disabled" title="Sin enlace de Google Maps disponible">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </span>
      `;

    const fechaFmt = fd(r.fecha);
    const horaFmt = r.hora || '';
    const latFmt = r.lat != null ? Number(r.lat).toFixed(6) : '—';
    const altFmt = r.alt || '—';

    return `
      <tr data-record-id="${r.id}">
        <td class="td-datetime">
          <div>${fechaFmt || '—'}</div>
          ${horaFmt ? `<div class="td-datetime-sub">${esc(horaFmt)} hrs</div>` : ''}
        </td>
        <td class="td-folio">${esc(r.folio || 'S/F')}</td>
        <td class="td-domicilio">${esc(r.ubicacion || '—')}</td>
        <td class="td-tipo">
          <span class="badge-tipo">${esc(r.tipo || 'General')}</span>
        </td>
        <td class="td-coord">${latFmt}</td>
        <td class="td-altitud">${esc(altFmt)}</td>
        <td class="td-center">${mapsIconHtml}</td>
        <td class="td-center">
          <button type="button" class="btn btn-danger-outline btn-table-action" data-del="${r.id}" title="Eliminar registro">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Vincular eventos de eliminación en tabla
  tbody.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.del;
      if (confirm('¿Estás seguro de que deseas eliminar este reporte de evidencias?')) {
        await deleteEvidencia(id);
        allRecords = allRecords.filter((x) => x.id !== id);
        applyFilterAndRender();
      }
    };
  });
}

/* --------------------------------------------------------------------------
   VISTA DE IMPRESIÓN OFICIAL: RENDERIZADO DE LA BITÁCORA PDF (IMAGE 2)
   -------------------------------------------------------------------------- */
function renderCardBitacora(r, index) {
  const qrUrlTarget = r.mapsUrl || (r.lat != null && r.lon != null ? `https://www.google.com/maps?q=${r.lat},${r.lon}` : '');
  const qrDataUrl = qrUrlTarget ? generateQrDataUrl(qrUrlTarget) : '';

  // Bloque de geolocalización y código QR justo debajo de las coordenadas
  let geoBlockHtml = '';
  if (r.lat != null || r.mapsUrl) {
    geoBlockHtml = `
      <div class="geo-card-block">
        <div class="geo-card-coords">
          <div class="geo-line"><strong>Lat:</strong> ${r.lat != null ? Number(r.lat).toFixed(6) : '—'}</div>
          <div class="geo-line"><strong>Lon:</strong> ${r.lon != null ? Number(r.lon).toFixed(6) : '—'}</div>
          ${r.alt ? `<div class="geo-line"><strong>Alt:</strong> ${esc(r.alt)}</div>` : ''}
        </div>
        ${qrDataUrl ? `
        <div class="geo-qr-box">
          <img src="${qrDataUrl}" alt="Código QR de ubicación">
        </div>
        <div class="geo-scan-note">Escanee el QR para abrir el mapa</div>` : ''}
      </div>
    `;
  } else {
    geoBlockHtml = `
      <div class="geo-card-coords">
        <div class="geo-line">Sin geolocalización</div>
      </div>
    `;
  }

  // Fotos de evidencia
  const renderPhotoCell = (foto, num) => {
    if (foto) {
      return `
        <div class="photo-half">
          <img src="${foto}" alt="Foto ${num}">
        </div>
      `;
    }
    return `
      <div class="photo-half">
        <span class="photo-empty-caption">FOTO ${num}</span>
        <span class="photo-empty-sub">(pegar fotografía)</span>
      </div>
    `;
  };

  const statusUpper = (r.estatus || 'ATENDIDO').toUpperCase();
  const fechaCompleta = `${fd(r.fecha)}${r.hora ? ' ' + esc(r.hora) : ''}`;

  return `
    <article class="report-card" data-report-id="${r.id}">
      <header class="card-top">
        <div class="card-folio-block">
          <span>N.° ${index}</span>
          <span>|</span>
          <span>FOLIO ${esc(r.folio)}</span>
        </div>
        <span class="card-status-text">${statusUpper}</span>
      </header>

      <div class="card-body-grid">
        <!-- Lado izquierdo: Datos y Geolocalización con QR -->
        <div class="card-left-pane">
          <!-- Fila 1 -->
          <div class="card-cell">
            <span class="cell-caption">FECHA Y HORA DE ATENCIÓN</span>
            <span class="cell-data">${fechaCompleta || '—'}</span>
          </div>
          <div class="card-cell">
            <span class="cell-caption">SOLICITA</span>
            <span class="cell-data">${esc(r.solicita) || '—'}</span>
          </div>

          <!-- Fila 2 -->
          <div class="card-cell">
            <span class="cell-caption">TIPO DE REPORTE</span>
            <span class="cell-data">${esc(r.tipo) || '—'}</span>
          </div>
          <div class="card-cell">
            <span class="cell-caption">ATENDIÓ / TURNO</span>
            <span class="cell-data">${esc(r.atendio) || '—'}${r.turno ? ' (' + esc(r.turno) + ')' : ''}</span>
          </div>

          <!-- Fila 3 -->
          <div class="card-cell">
            <span class="cell-caption">UBICACIÓN</span>
            <span class="cell-data">${esc(r.ubicacion) || '—'}</span>
          </div>
          <div class="card-cell">
            <span class="cell-caption">GEOLOCALIZACIÓN</span>
            ${geoBlockHtml}
          </div>

          <!-- Fila 4 -->
          <div class="card-cell card-cell-span2">
            <span class="cell-caption">ACCIÓN REALIZADA</span>
            <span class="cell-data">${esc(r.accion) || '—'}</span>
          </div>
        </div>

        <!-- Lado derecho: Fotografías -->
        <div class="card-right-pane">
          <span class="photos-caption">FOTOGRAFÍAS</span>
          <div class="photos-box-container">
            ${renderPhotoCell(r.fotos?.[0], 1)}
            ${renderPhotoCell(r.fotos?.[1], 2)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderPrintBitacora(records) {
  const listEl = $('list');
  if (!listEl) return;

  if (records.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No hay reportes de evidencia para mostrar en la bitácora.</div>
      </div>
    `;
  } else {
    listEl.innerHTML = records.map((r, i) => renderCardBitacora(r, i + 1)).join('');
  }

  // KPIs oficiales
  const total = records.length;
  const atendidos = records.filter((r) => (r.estatus || '').toLowerCase() === 'atendido').length;
  const pendientes = total - atendidos;

  if ($('kR')) $('kR').textContent = total;
  if ($('kA')) $('kA').textContent = atendidos;
  if ($('kP')) $('kP').textContent = pendientes;

  // Actualizar contadores de resumen en pantalla
  if ($('lblTotal')) $('lblTotal').textContent = total;
  if ($('lblAtendidos')) $('lblAtendidos').textContent = atendidos;
  if ($('lblPendientes')) $('lblPendientes').textContent = pendientes;

  // Encabezados oficiales de la bitácora PDF
  const formattedDate = fd(metadata.fecha) || (records[0]?.fecha ? fd(records[0].fecha) : '');
  const areaName = metadata.area || 'Alumbrado Público';

  if ($('topAreaText')) $('topAreaText').textContent = areaName.toUpperCase();
  if ($('topDateText')) $('topDateText').textContent = formattedDate || '--/--/----';
  if ($('docSubtitle')) $('docSubtitle').textContent = `${areaName} · Fecha: ${formattedDate || '—'}`;

  if ($('fElab')) $('fElab').textContent = metadata.elab || '—';
  if ($('fReviso')) $('fReviso').textContent = metadata.reviso || '—';
}

/* --------------------------------------------------------------------------
   Filtros y Búsqueda
   -------------------------------------------------------------------------- */
function applyFilterAndRender() {
  const query = ($('searchInput')?.value || '').trim().toLowerCase();

  let filtered = [...allRecords];
  if (query) {
    filtered = filtered.filter((r) => {
      const folio = (r.folio || '').toLowerCase();
      const tipo = (r.tipo || '').toLowerCase();
      const ubicacion = (r.ubicacion || '').toLowerCase();
      const solicita = (r.solicita || '').toLowerCase();
      const atendio = (r.atendio || '').toLowerCase();
      return folio.includes(query) || tipo.includes(query) || ubicacion.includes(query) || solicita.includes(query) || atendio.includes(query);
    });
  }

  renderTable(filtered);
  renderPrintBitacora(filtered);
}

/* --------------------------------------------------------------------------
   Inicialización de la Página
   -------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al conectar base de datos:', err);
  }

  // Cargar metadatos institucionales
  const loadedMeta = await loadMetadatos();
  if (loadedMeta) {
    metadata = { ...metadata, ...loadedMeta };
  }

  // Cargar todas las evidencias desde SQLite (con fotos desde el disco)
  try {
    allRecords = await getAllEvidencias();
  } catch (err) {
    console.error('Error al consultar evidencias:', err);
    allRecords = [];
  }

  // Ordenar cronológicamente
  allRecords.sort((a, b) => {
    const kA = (a.fecha || '') + (a.hora || '99:99');
    const kB = (b.fecha || '') + (b.hora || '99:99');
    return kA.localeCompare(kB);
  });

  applyFilterAndRender();
  attachInputNormalizers(document);

  // Búsqueda en vivo
  $('searchInput')?.addEventListener('input', applyFilterAndRender);

  // Botón: Exportar / Imprimir PDF (el formato oficial no cambia)
  $('btnExportPdf')?.addEventListener('click', () => {
    window.print();
  });

  // Botón: Abrir carpeta de fotos en el explorador
  $('btnOpenFolder')?.addEventListener('click', async () => {
    await openEvidenciasFolder();
  });
});

