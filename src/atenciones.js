/**
 * ============================================================================
 * ATENCIONES DE UN REPORTE
 * ============================================================================
 * Arriba: información completa del reporte.
 * Abajo: atenciones de ese folio, con detalle y edición.
 * ============================================================================
 */

import {
  initDatabase,
  getAllReportes,
  getReporteById,
  getAtencionesByFolio,
  getAllPersonal,
  getFullName,
} from './db.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const reporteId = params.get('reporteId') || '';
const folioParam = params.get('folio') || '';
let folioActual = folioParam;

let atenciones = [];
let personal = [];
let detalleId = null;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

const fd = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

const EYE_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>`;

const PENCIL_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>`;

function formatPersonal(raw) {
  if (!raw) return '';
  return String(raw).split(',').map((token) => {
    const id = token.trim();
    if (!id) return '';
    const person = personal.find((item) => item.id === id);
    return person ? getFullName(person) : id;
  }).filter(Boolean).join(', ');
}

function statusGroup(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'atendido' || v === 'atendida') return 'atendido';
  if (v === 'en espera') return 'espera';
  if (v === 'pendiente') return 'pendiente';
  if (v === 'urgente') return 'urgente';
  return 'otro';
}

function editUrl(id) {
  const query = new URLSearchParams({
    id,
    folio: folioActual,
    reporteId,
  });
  return `atencion.html?${query.toString()}`;
}

function renderReporte(r) {
  const box = $('reporteInfo');
  if (!box) return;
  if (!r) {
    box.innerHTML = `
      <div class="detail-item detail-item-full">
        <span class="detail-label">Reporte</span>
        <span class="detail-value">No se encontró el reporte${folioParam ? ` del folio ${esc(folioParam)}` : ''}.</span>
      </div>`;
    return;
  }

  const domicilio = [r.direccion, r.colonia_comunidad].filter(Boolean).join(', ') || '—';
  const group = statusGroup(r.estatus);
  box.innerHTML = `
    <div class="detail-item">
      <span class="detail-label">Folio</span>
      <span class="detail-value"><strong>${esc(r.folio || 'S/F')}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Estatus</span>
      <span class="detail-value"><span class="badge-status badge-status-${group}">${esc(r.estatus || 'En espera')}</span></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Fecha del reporte</span>
      <span class="detail-value">${fd(r.fecha) || '—'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Personal que atendió el reporte</span>
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
    <div class="detail-item">
      <span class="detail-label">Número de lámparas</span>
      <span class="detail-value"><strong>${esc(r.numero_lamparas || 1)}</strong></span>
    </div>
    <div class="detail-item detail-item-full">
      <span class="detail-label">Dirección y colonia</span>
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
      <span class="detail-label">Tipo de lámpara</span>
      <span class="detail-value">${esc(r.tipo_lampara || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Tipo de falla</span>
      <span class="detail-value">${esc(r.tipo_falla || '—')}</span>
    </div>
    <div class="detail-item detail-item-full">
      <span class="detail-label">Observaciones</span>
      <span class="detail-value">${esc(r.observaciones || '—')}</span>
    </div>
  `;
}

function renderTabla() {
  const tbody = $('atencionesBody');
  if (!tbody) return;
  if ($('lblTotal')) $('lblTotal').textContent = String(atenciones.length);
  if (!atenciones.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty-row">Este reporte aún no tiene atenciones.</td></tr>`;
    return;
  }

  tbody.innerHTML = atenciones.map((row) => {
    const fotos = (row.fotoRefs || []).filter(Boolean).length;
    const personalTxt = formatPersonal(row.atendio) || '—';
    const desc = row.descripcion || '—';
    return `
      <tr>
        <td><strong>${esc(String(row.numero).padStart(2, '0'))}</strong></td>
        <td>${fd(row.fecha) || '—'}</td>
        <td>${esc(row.hora || '—')}</td>
        <td>${esc(personalTxt)}</td>
        <td>${esc(desc)}</td>
        <td class="td-center">${fotos}</td>
        <td class="td-center">
          <div class="table-actions">
            <button type="button" class="btn-icon-action" data-ver="${esc(row.id)}" title="Ver detalle" aria-label="Ver detalle">${EYE_ICON}</button>
            <a class="btn-icon-action" href="${editUrl(row.id)}" title="Editar atención" aria-label="Editar atención">${PENCIL_ICON}</a>
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-ver]').forEach((btn) => {
    btn.onclick = () => openDetalle(btn.dataset.ver);
  });
}

function openDetalle(id) {
  const row = atenciones.find((item) => item.id === id);
  if (!row) return;
  detalleId = id;
  const content = $('modalDetalleAtencionContent');
  const personalTxt = formatPersonal(row.atendio) || '—';
  const coords = row.lat != null && row.lon != null ? `${row.lat}, ${row.lon}` : '—';
  const maps = row.mapsUrl
    ? `<a href="${esc(row.mapsUrl)}" target="_blank" rel="noopener" style="color: var(--primary); font-weight: 600; text-decoration: underline;">Abrir en Google Maps</a>`
    : '—';
  const f1 = row.fotos?.[0];
  const f2 = row.fotos?.[1];
  const fotosHtml = (f1 || f2) ? `
    <div class="detail-item detail-item-full">
      <span class="detail-label">Fotografías</span>
      <div style="display:flex; gap:12px; margin-top:8px; flex-wrap:wrap;">
        ${f1 ? `<div style="flex:1; min-width:180px;"><img src="${f1}" alt="Foto 1" style="width:100%; max-height:220px; object-fit:cover; border-radius:4px; border:1px solid var(--border-line);"></div>` : ''}
        ${f2 ? `<div style="flex:1; min-width:180px;"><img src="${f2}" alt="Foto 2" style="width:100%; max-height:220px; object-fit:cover; border-radius:4px; border:1px solid var(--border-line);"></div>` : ''}
      </div>
    </div>` : '';

  content.innerHTML = `
    <div class="detail-item">
      <span class="detail-label">Número</span>
      <span class="detail-value"><strong>${esc(String(row.numero).padStart(2, '0'))}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Folio</span>
      <span class="detail-value"><strong>${esc(row.folio || folioParam || 'S/F')}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Fecha de atención</span>
      <span class="detail-value">${fd(row.fecha) || '—'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Hora de atención</span>
      <span class="detail-value">${esc(row.hora || '—')}</span>
    </div>
    <div class="detail-item detail-item-full">
      <span class="detail-label">Personal que atendió</span>
      <span class="detail-value"><strong>${esc(personalTxt)}</strong></span>
    </div>
    <div class="detail-item detail-item-full">
      <span class="detail-label">Descripción</span>
      <span class="detail-value">${esc(row.descripcion || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Latitud</span>
      <span class="detail-value">${row.lat != null ? esc(row.lat) : '—'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Longitud</span>
      <span class="detail-value">${row.lon != null ? esc(row.lon) : '—'}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Altitud</span>
      <span class="detail-value">${esc(row.alt || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Coordenadas</span>
      <span class="detail-value">${esc(coords)}</span>
    </div>
    <div class="detail-item detail-item-full">
      <span class="detail-label">Enlace de Maps</span>
      <span class="detail-value">${maps}</span>
    </div>
    ${fotosHtml}
  `;
  $('modalDetalleAtencion')?.classList.remove('hidden');
}

function closeDetalle() {
  detalleId = null;
  $('modalDetalleAtencion')?.classList.add('hidden');
}

async function loadReporte(folio) {
  if (reporteId) {
    const byId = await getReporteById(reporteId);
    if (byId) return byId;
  }
  const key = String(folio || folioParam).trim().toLowerCase();
  if (!key) return null;
  const all = await getAllReportes();
  return (all || []).find((row) => String(row.folio || '').trim().toLowerCase() === key) || null;
}

document.addEventListener('DOMContentLoaded', async () => {
  const nueva = $('btnNuevaAtencion');
  if (nueva) {
    const query = new URLSearchParams({ folio: folioParam, reporteId });
    nueva.href = `atencion.html?${query.toString()}`;
  }

  $('btnToggleHerramientas')?.addEventListener('click', (e) => {
    e.preventDefault();
    const group = $('navGroupHerramientas');
    if (!group) return;
    const isOpen = group.classList.toggle('is-open');
    $('btnToggleHerramientas')?.setAttribute('aria-expanded', String(isOpen));
  });
  $('btnSidebarGoogleSheets')?.addEventListener('click', () => {
    window.location.href = 'personal.html?openSheets=1';
  });
  $('btnCerrarDetalleAtencion')?.addEventListener('click', closeDetalle);
  $('btnCerrarDetalleAtencionX')?.addEventListener('click', closeDetalle);
  $('btnEditarAtencionDetalle')?.addEventListener('click', () => {
    if (detalleId) window.location.href = editUrl(detalleId);
  });
  $('modalDetalleAtencion')?.addEventListener('click', (e) => {
    if (e.target === $('modalDetalleAtencion')) closeDetalle();
  });

  try {
    await initDatabase();
    personal = await getAllPersonal();
    const reporte = await loadReporte(folioParam);
    folioActual = reporte?.folio || folioParam;
    const folio = folioActual;
    if (nueva && folio) {
      const query = new URLSearchParams({ folio, reporteId });
      nueva.href = `atencion.html?${query.toString()}`;
    }
    renderReporte(reporte);
    if ($('pageDesc') && folio) {
      $('pageDesc').textContent = `Atenciones vinculadas al folio ${folio}.`;
    }
    atenciones = folio ? await getAtencionesByFolio(folio) : [];
    renderTabla();
  } catch (err) {
    console.error('Error al cargar atenciones:', err);
    renderReporte(null);
    const tbody = $('atencionesBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty-row">No se pudieron cargar las atenciones.</td></tr>`;
    }
  }
});
