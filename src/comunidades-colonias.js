/**
 * ============================================================================
 * COMUNIDADES Y COLONIAS (comunidades-colonias.js)
 * ============================================================================
 * CRUD completo del catálogo de localidades (colonias y comunidades).
 * ============================================================================
 */

import {
  initDatabase,
  getAllLocalidades,
  saveLocalidad,
  updateLocalidad,
  deleteLocalidad,
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

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let allLocalidades = [];
let editingId = null;
let deletingId = null;
let toastTimeout = null;

const paginator = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => renderTable(),
  storageKey: 'paginator_localidades',
});

// ---------------------------------------------------------------------------
// Toast flotante
// ---------------------------------------------------------------------------
function showToast(type, message) {
  const toast = $('toastNotification');
  const msgEl = $('toastMessage');
  const iconEl = $('toastIcon');

  if (!toast || !msgEl || !iconEl) return;

  toast.className = `toast-notification toast-${type}`;
  msgEl.textContent = message;

  if (type === 'success') {
    iconEl.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  } else {
    iconEl.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
  }

  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// ---------------------------------------------------------------------------
// Iconos SVG inline
// ---------------------------------------------------------------------------
const EYE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const PENCIL_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
const TRASH_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

// ---------------------------------------------------------------------------
// Render tabla
// ---------------------------------------------------------------------------
function getFilteredList() {
  const query  = ($('searchLocalidades')?.value || '').trim().toLowerCase();
  const tipo   = $('filterTipo')?.value || '';

  let list = allLocalidades;

  if (tipo) {
    list = list.filter((r) => r.tipo === tipo);
  }

  if (query) {
    list = list.filter((r) =>
      (r.nombre || '').toLowerCase().includes(query) ||
      (r.tipo || '').toLowerCase().includes(query)
    );
  }

  return list;
}

function tipoLabel(tipo) {
  if (tipo === 'Comunidad') return 'Comunidad / Rancho';
  if (tipo === 'Cabecera municipal') return 'Cabecera Municipal';
  return tipo || '—';
}

function renderTable() {
  const tbody = $('localidadesTableBody');
  if (!tbody) return;

  const list = getFilteredList();

  if ($('lblTotal')) $('lblTotal').textContent = list.length;

  const pageData = paginator.getCurrentSlice(list);

  if (pageData.length === 0) {
    const q = ($('searchLocalidades')?.value || '').trim();
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="table-empty-row">
          ${q ? 'No se encontraron localidades con esa búsqueda.' : 'No hay localidades registradas aún.'}
        </td>
      </tr>
    `;
    paginator.update(list.length);
    return;
  }

  tbody.innerHTML = pageData.map((r) => `
    <tr>
      <td><strong>${esc(r.nombre || '—')}</strong></td>
      <td><span class="badge-status ${r.tipo === 'Comunidad' ? 'badge-status-pendiente' : 'badge-status-atendido'}">${esc(tipoLabel(r.tipo))}</span></td>
      <td class="td-center">
        <div class="table-actions">
          <button type="button" class="btn-icon-action" data-ver="${esc(r.id)}" title="Ver detalle" aria-label="Ver">${EYE_ICON}</button>
          <button type="button" class="btn-icon-action" data-editar="${esc(r.id)}" title="Editar" aria-label="Editar">${PENCIL_ICON}</button>
          <button type="button" class="btn-icon-action btn-icon-action-danger" data-eliminar="${esc(r.id)}" title="Eliminar" aria-label="Eliminar">${TRASH_ICON}</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Eventos de filas
  tbody.querySelectorAll('[data-ver]').forEach((btn) => {
    btn.onclick = () => openDetalleModal(btn.dataset.ver);
  });
  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.onclick = () => openEditModal(btn.dataset.editar);
  });
  tbody.querySelectorAll('[data-eliminar]').forEach((btn) => {
    btn.onclick = () => openEliminarModal(btn.dataset.eliminar);
  });

  paginator.update(list.length);
}

// ---------------------------------------------------------------------------
// Modal crear / editar
// ---------------------------------------------------------------------------
function openCreateModal() {
  editingId = null;
  if ($('modalLocalidadTitle')) $('modalLocalidadTitle').textContent = 'Nueva Localidad';
  if ($('btnGuardarLocalidad')) $('btnGuardarLocalidad').textContent = 'Guardar';
  if ($('inputNombreLocalidad')) $('inputNombreLocalidad').value = '';
  if ($('selectTipoLocalidad')) $('selectTipoLocalidad').value = 'Cabecera municipal';
  $('modalLocalidad')?.classList.remove('hidden');
  $('inputNombreLocalidad')?.focus();
}

function openEditModal(id) {
  const loc = allLocalidades.find((r) => r.id === id);
  if (!loc) return;

  editingId = id;
  if ($('modalLocalidadTitle')) $('modalLocalidadTitle').textContent = 'Editar Localidad';
  if ($('btnGuardarLocalidad')) $('btnGuardarLocalidad').textContent = 'Guardar cambios';
  if ($('inputNombreLocalidad')) $('inputNombreLocalidad').value = loc.nombre || '';
  if ($('selectTipoLocalidad')) $('selectTipoLocalidad').value = loc.tipo || 'Cabecera municipal';
  $('modalLocalidad')?.classList.remove('hidden');
  $('inputNombreLocalidad')?.focus();
}

function closeLocalidadModal() {
  $('modalLocalidad')?.classList.add('hidden');
  editingId = null;
}

// ---------------------------------------------------------------------------
// Modal detalle
// ---------------------------------------------------------------------------
function openDetalleModal(id) {
  const loc = allLocalidades.find((r) => r.id === id);
  if (!loc) return;

  const content = $('modalDetalleLocContent');
  if (content) {
    content.innerHTML = `
      <div class="detail-item">
        <span class="detail-label">Nombre</span>
        <span class="detail-value"><strong>${esc(loc.nombre || '—')}</strong></span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Tipo</span>
        <span class="detail-value">${esc(tipoLabel(loc.tipo))}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Creado</span>
        <span class="detail-value">${esc((loc.created_at || '').replace('T', ' ').slice(0, 16))}</span>
      </div>
    `;
  }
  $('modalDetalleLocalidad')?.classList.remove('hidden');
}

function closeDetalleModal() {
  $('modalDetalleLocalidad')?.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Modal eliminar
// ---------------------------------------------------------------------------
function openEliminarModal(id) {
  deletingId = id;
  $('modalEliminarLocalidad')?.classList.remove('hidden');
}

function closeEliminarModal() {
  deletingId = null;
  $('modalEliminarLocalidad')?.classList.add('hidden');
}

async function confirmarEliminar() {
  if (!deletingId) return;
  try {
    await deleteLocalidad(deletingId);
    allLocalidades = allLocalidades.filter((r) => r.id !== deletingId);
    closeEliminarModal();
    renderTable();
    showToast('success', 'Localidad eliminada correctamente');
  } catch (err) {
    console.error('[comunidades-colonias] Error al eliminar:', err);
    showToast('error', 'No se pudo eliminar la localidad. Intenta de nuevo.');
  }
}

// ---------------------------------------------------------------------------
// Guardar (crear o editar)
// ---------------------------------------------------------------------------
async function guardarLocalidad(e) {
  e.preventDefault();

  const nombre = ($('inputNombreLocalidad')?.value || '').trim().toUpperCase();
  const tipo   = $('selectTipoLocalidad')?.value || 'Cabecera municipal';

  if (!nombre) {
    $('inputNombreLocalidad')?.focus();
    return;
  }

  try {
    const isEdit = !!editingId;
    if (editingId) {
      const updated = await updateLocalidad(editingId, { nombre, tipo });
      const idx = allLocalidades.findIndex((r) => r.id === editingId);
      if (idx >= 0) allLocalidades[idx] = { ...allLocalidades[idx], ...updated };
    } else {
      const saved = await saveLocalidad({ nombre, tipo });
      // Verificar si ya existía (INSERT OR IGNORE podría no insertar)
      if (!allLocalidades.find((r) => r.id === saved.id)) {
        allLocalidades.push(saved);
      }
    }

    closeLocalidadModal();
    allLocalidades = await getAllLocalidades();
    renderTable();
    showToast('success', isEdit ? 'Localidad actualizada correctamente' : 'Localidad guardada correctamente');
  } catch (err) {
    console.error('[comunidades-colonias] Error al guardar:', err);
    showToast('error', 'No se pudo guardar la localidad. Intenta de nuevo.');
  }
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('[comunidades-colonias] Error al conectar BD:', err);
  }

  try {
    allLocalidades = await getAllLocalidades();
  } catch (err) {
    console.error('[comunidades-colonias] Error al cargar localidades:', err);
    allLocalidades = [];
  }

  renderTable();
  attachInputNormalizers(document);

  $('toastClose')?.addEventListener('click', () => {
    if (toastTimeout) clearTimeout(toastTimeout);
    $('toastNotification')?.classList.add('hidden');
  });

  // Búsqueda y filtro en tiempo real
  $('searchLocalidades')?.addEventListener('input', () => {
    paginator.resetPage();
    renderTable();
  });
  $('filterTipo')?.addEventListener('change', () => {
    paginator.resetPage();
    renderTable();
  });

  // Botón Agregar
  $('btnNuevaLocalidad')?.addEventListener('click', openCreateModal);

  // Modal localidad
  $('formLocalidad')?.addEventListener('submit', guardarLocalidad);
  $('btnCancelarLocalidad')?.addEventListener('click', closeLocalidadModal);
  $('btnCerrarModalLocalidadX')?.addEventListener('click', closeLocalidadModal);
  $('modalLocalidad')?.addEventListener('click', (e) => {
    if (e.target === $('modalLocalidad')) closeLocalidadModal();
  });

  // Modal detalle
  $('btnCerrarDetalleLoc')?.addEventListener('click', closeDetalleModal);
  $('btnCerrarDetalleLocX')?.addEventListener('click', closeDetalleModal);
  $('modalDetalleLocalidad')?.addEventListener('click', (e) => {
    if (e.target === $('modalDetalleLocalidad')) closeDetalleModal();
  });

  // Modal eliminar
  $('btnCancelarEliminarLoc')?.addEventListener('click', closeEliminarModal);
  $('btnConfirmarEliminarLoc')?.addEventListener('click', confirmarEliminar);
  $('modalEliminarLocalidad')?.addEventListener('click', (e) => {
    if (e.target === $('modalEliminarLocalidad')) closeEliminarModal();
  });

  // Cerrar modales con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('modalLocalidad')?.classList.contains('hidden')) closeLocalidadModal();
      if (!$('modalDetalleLocalidad')?.classList.contains('hidden')) closeDetalleModal();
      if (!$('modalEliminarLocalidad')?.classList.contains('hidden')) closeEliminarModal();
    }
  });
});

