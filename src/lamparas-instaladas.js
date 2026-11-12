/**
 * ============================================================================
 * LÁMPARAS LED INSTALADAS (lamparas-instaladas.js)
 * ============================================================================
 * Vista de tabla para el control de lámparas LED instaladas en campo.
 * Misma estética y comportamiento que las demás tablas (registros / reportes):
 * - Paginación automática y búsqueda en vivo.
 * - Enlace directo a Google Maps por coordenadas o URL.
 * - Modal de detalle con fotografías y datos completos.
 * - Navegación al formulario de captura y edición (nueva-lampara.html).
 * ============================================================================
 */

import {
  initDatabase,
  getAllLamparasInstaladas,
  deleteLamparaInstalada,
  getAllPersonal,
  getFullName,
} from './db.js';

import { attachInputNormalizers } from './normalizer.js';
import { TablePaginator } from './table-pagination.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

const fd = (s) => (s ? s.split('-').reverse().join('/') : '');

const EYE_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

const PENCIL_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>
`;

const TRASH_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
`;

// Estado
let allRecords = [];
let lastFiltered = [];
let allPersonal = [];
let pendingDeleteId = null;
let toastTimeout = null;

/* --------------------------------------------------------------------------
   Paginador
   -------------------------------------------------------------------------- */
const paginator = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => renderTable(lastFiltered),
  storageKey: 'paginator_lamparas_instaladas',
});

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */
function showToast(type, message) {
  const toast = $('toastNotification');
  const msgEl = $('toastMessage');
  const iconEl = $('toastIcon');
  if (!toast || !msgEl || !iconEl) return;

  toast.className = `toast-notification toast-${type}`;
  msgEl.textContent = message;
  iconEl.innerHTML = type === 'success'
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 4500);
}

function resolvePersonalDisplay(rawTokens) {
  if (!rawTokens) return '—';
  const tokens = String(rawTokens).split(',').map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return '—';
  return tokens.map((tok) => {
    const p = allPersonal.find((item) => item.id === tok);
    return p ? (getFullName(p) || tok) : tok;
  }).join(', ');
}

/* --------------------------------------------------------------------------
   Renderizado de Tabla
   -------------------------------------------------------------------------- */
function renderTable(records) {
  const tbody = $('lamparasTableBody');
  if (!tbody) return;

  lastFiltered = records;
  const pageData = paginator.getCurrentSlice(records);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty-row">No se encontraron registros de lámparas instaladas.</td></tr>`;
    paginator.update(records.length);
    return;
  }

  tbody.innerHTML = pageData.map((r) => {
    const mapsUrl = r.enlace_maps || (r.latitud != null && r.longitud != null
      ? `https://www.google.com/maps?q=${r.latitud},${r.longitud}`
      : '');

    const mapsIcon = mapsUrl
      ? `<a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="maps-icon-link" title="Ver en Google Maps">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
             <circle cx="12" cy="10" r="3"></circle>
           </svg>
         </a>`
      : `<span class="maps-icon-disabled" title="Sin enlace de Maps">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
             <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
             <circle cx="12" cy="10" r="3"></circle>
           </svg>
         </span>`;

    const personalDisplay = resolvePersonalDisplay(r.personal_instalo);

    const coordsDisplay = (r.latitud != null && r.longitud != null)
      ? `${Number(r.latitud).toFixed(5)}, ${Number(r.longitud).toFixed(5)}`
      : (r.altitud ? esc(r.altitud) : '—');

    const numFotos = (r.foto1 ? 1 : 0) + (r.foto2 ? 1 : 0);
    const fotosBadge = numFotos > 0
      ? `<span class="badge-tipo" style="background:#e0f2fe;color:#0369a1;cursor:pointer;" data-ver="${esc(r.id)}" title="Ver fotografías">📷 ${numFotos} foto${numFotos > 1 ? 's' : ''}</span>`
      : '<span style="color:#94a3b8;">—</span>';

    return `
      <tr data-record-id="${r.id}">
        <td class="td-folio"><strong>${esc(r.folio || 'S/F')}</strong></td>
        <td>${esc(fd(r.fecha) || '—')}</td>
        <td>${r.hora ? `<span class="td-datetime-sub">${esc(r.hora)} hrs</span>` : '—'}</td>
        <td><span class="badge-tipo">${esc(r.tipo_lampara || 'LED')}</span></td>
        <td class="td-domicilio">${esc(r.ubicacion || '—')}</td>
        <td><strong>${esc(personalDisplay)}</strong></td>
        <td class="td-coord">${coordsDisplay}</td>
        <td class="td-center">${mapsIcon}</td>
        <td class="td-center">${fotosBadge}</td>
        <td class="td-center">
          <div class="table-actions">
            <button type="button" class="btn-icon-action" data-ver="${esc(r.id)}" title="Ver detalle de la instalación">
              ${EYE_ICON}
            </button>
            <a class="btn-icon-action" href="nueva-lampara.html?edit=${encodeURIComponent(r.id)}" title="Editar instalación">
              ${PENCIL_ICON}
            </a>
            <button type="button" class="btn-icon-action btn-icon-action-danger" data-del="${esc(r.id)}" title="Eliminar instalación">
              ${TRASH_ICON}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-ver]').forEach((btn) => {
    btn.onclick = () => openDetalle(btn.dataset.ver);
  });
  tbody.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = () => openDeleteConfirm(btn.dataset.del);
  });

  paginator.update(records.length);
}

/* --------------------------------------------------------------------------
   Filtro y Búsqueda
   -------------------------------------------------------------------------- */
function applyFilter() {
  const q = ($('searchInput')?.value || '').trim().toLowerCase();
  let filtered = [...allRecords];
  if (q) {
    filtered = filtered.filter((r) => {
      const folio = (r.folio || '').toLowerCase();
      const tipo = (r.tipo_lampara || '').toLowerCase();
      const ubi = (r.ubicacion || '').toLowerCase();
      const persRaw = (r.personal_instalo || '').toLowerCase();
      const persNom = resolvePersonalDisplay(r.personal_instalo).toLowerCase();
      return folio.includes(q) || tipo.includes(q) || ubi.includes(q) || persRaw.includes(q) || persNom.includes(q);
    });
  }
  paginator.resetPage();
  renderTable(filtered);
  if ($('lblTotalLamparas')) $('lblTotalLamparas').textContent = filtered.length;
}

/* --------------------------------------------------------------------------
   Modal: Detalle
   -------------------------------------------------------------------------- */
function openDetalle(id) {
  const r = allRecords.find((item) => item.id === id);
  if (!r) return;

  const content = $('modalDetalleLamparaContent');
  if (!content) return;

  const personalDisplay = resolvePersonalDisplay(r.personal_instalo);
  const mapsUrl = r.enlace_maps || (r.latitud != null && r.longitud != null
    ? `https://www.google.com/maps?q=${r.latitud},${r.longitud}`
    : '');

  const fotoHtml = (f1, f2) => {
    if (!f1 && !f2) return '';
    return `
      <div class="detail-item" style="grid-column: span 2;">
        <span class="detail-label">Fotografías adjuntas:</span>
        <div style="display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap;">
          ${f1 ? `<div style="flex: 1; min-width: 200px;"><img src="${f1}" style="width: 100%; max-height: 260px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-line);" alt="Foto 1"></div>` : ''}
          ${f2 ? `<div style="flex: 1; min-width: 200px;"><img src="${f2}" style="width: 100%; max-height: 260px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-line);" alt="Foto 2"></div>` : ''}
        </div>
      </div>
    `;
  };

  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><span class="detail-label">Folio:</span><span class="detail-value"><strong>${esc(r.folio || 'S/F')}</strong></span></div>
      <div class="detail-item"><span class="detail-label">Fecha y Hora:</span><span class="detail-value">${esc(fd(r.fecha) || '—')} ${r.hora ? `· ${esc(r.hora)} hrs` : ''}</span></div>
      <div class="detail-item"><span class="detail-label">Tipo de lámpara:</span><span class="detail-value"><span class="badge-tipo">${esc(r.tipo_lampara || 'LED')}</span></span></div>
      <div class="detail-item"><span class="detail-label">Altitud:</span><span class="detail-value">${esc(r.altitud || '—')}</span></div>
      <div class="detail-item" style="grid-column: span 2;"><span class="detail-label">Ubicación / Domicilio:</span><span class="detail-value">${esc(r.ubicacion || '—')}</span></div>
      <div class="detail-item" style="grid-column: span 2;"><span class="detail-label">Personal que la instaló:</span><span class="detail-value"><strong>${esc(personalDisplay)}</strong></span></div>
      <div class="detail-item"><span class="detail-label">Latitud:</span><span class="detail-value">${r.latitud != null ? r.latitud : '—'}</span></div>
      <div class="detail-item"><span class="detail-label">Longitud:</span><span class="detail-value">${r.longitud != null ? r.longitud : '—'}</span></div>
      <div class="detail-item" style="grid-column: span 2;"><span class="detail-label">Enlace de Google Maps:</span><span class="detail-value">${mapsUrl ? `<a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-weight: 600; text-decoration: underline;">Abrir ubicación en Google Maps</a>` : '—'}</span></div>
      <div class="detail-item" style="grid-column: span 2;"><span class="detail-label">Observaciones:</span><span class="detail-value">${esc(r.observaciones || '—')}</span></div>
      ${fotoHtml(r.foto1, r.foto2)}
    </div>
  `;

  $('modalDetalleLampara').classList.remove('hidden');
}

function closeDetalle() {
  $('modalDetalleLampara').classList.add('hidden');
}

/* --------------------------------------------------------------------------
   Modal: Eliminar
   -------------------------------------------------------------------------- */
function openDeleteConfirm(id) {
  pendingDeleteId = id;
  $('modalEliminarLampara').classList.remove('hidden');
}

function closeDeleteConfirm() {
  pendingDeleteId = null;
  $('modalEliminarLampara').classList.add('hidden');
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  try {
    await deleteLamparaInstalada(pendingDeleteId);
    allRecords = allRecords.filter((r) => r.id !== pendingDeleteId);
    showToast('success', 'Registro de lámpara eliminado correctamente.');
    applyFilter();
  } catch (err) {
    console.error(err);
    showToast('error', 'No se pudo eliminar el registro.');
  }
  closeDeleteConfirm();
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

  // Cargar personal
  try {
    allPersonal = await getAllPersonal();
  } catch (err) {
    console.warn('Error al cargar personal:', err);
    allPersonal = [];
  }

  // Cargar lámparas instaladas
  try {
    allRecords = await getAllLamparasInstaladas();
  } catch (err) {
    console.error('Error al cargar lámparas instaladas:', err);
    allRecords = [];
  }

  attachInputNormalizers(document);
  applyFilter();

  // Búsqueda en vivo
  $('searchInput')?.addEventListener('input', applyFilter);

  // Cerrar detalle
  $('btnCerrarDetalleLamparaX')?.addEventListener('click', closeDetalle);
  $('btnCerrarDetalleLampara')?.addEventListener('click', closeDetalle);
  $('modalDetalleLampara')?.addEventListener('click', (e) => {
    if (e.target === $('modalDetalleLampara')) closeDetalle();
  });

  // Eliminar
  $('btnEliminarLamparaNo')?.addEventListener('click', closeDeleteConfirm);
  $('btnEliminarLamparaNo2')?.addEventListener('click', closeDeleteConfirm);
  $('btnEliminarLamparaSi')?.addEventListener('click', confirmDelete);
  $('modalEliminarLampara')?.addEventListener('click', (e) => {
    if (e.target === $('modalEliminarLampara')) closeDeleteConfirm();
  });

  // Toast close
  $('toastClose')?.addEventListener('click', () => {
    if (toastTimeout) clearTimeout(toastTimeout);
    $('toastNotification')?.classList.add('hidden');
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

  // Google Sheets lateral
  $('btnSidebarGoogleSheets')?.addEventListener('click', () => {
    window.location.href = 'personal.html?openSheets=1';
  });
});
