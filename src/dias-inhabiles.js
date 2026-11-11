/**
 * ============================================================================
 * GESTIÓN DE DÍAS INHÁBILES Y FERIADOS — Alumbrado Público (dias-inhabiles.js)
 * ============================================================================
 * - Feriados oficiales de México (calculados y actualizados automáticamente cada año)
 * - Días de asueto municipal (agregados manualmente; siguen activos hasta desactivarse)
 * - Ver a detalle, agregar y editar días inhábiles
 * - Integración con el cálculo de días hábiles de reportes
 * ============================================================================
 */

import {
  initDatabase,
  getAllDiasInhabiles,
  saveDiaInhabil,
  deleteDiaInhabil,
  syncOfficialHolidays,
} from './db.js';

import {
  attachInputNormalizers,
  normalizeFinal,
} from './normalizer.js';

import { TablePaginator } from './table-pagination.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

function formatFechaLarga(fechaIso) {
  if (!fechaIso) return '—';
  const parts = fechaIso.split('-').map(Number);
  if (parts.length !== 3) return fechaIso;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const diaSemana = DIAS_SEMANA[d.getDay()];
  const diaMes = parts[2];
  const mesNombre = MESES[parts[1] - 1];
  const anio = parts[0];
  const dd = String(diaMes).padStart(2, '0');
  const mm = String(parts[1]).padStart(2, '0');
  return {
    corta: `${dd}/${mm}/${anio}`,
    diaNombre: diaSemana,
    larga: `${diaSemana}, ${diaMes} de ${mesNombre} de ${anio}`,
  };
}

let allDias = [];
let lastFilteredDias = [];
let editingId = null;
let deletingId = null;
let toastTimeout = null;

const paginator = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => renderTable(lastFilteredDias),
  storageKey: 'paginator_dias',
});

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

/* --------------------------------------------------------------------------
   Notificaciones Toast
   -------------------------------------------------------------------------- */
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
  }, 4500);
}

$('toastClose')?.addEventListener('click', () => {
  if (toastTimeout) clearTimeout(toastTimeout);
  $('toastNotification')?.classList.add('hidden');
});

/* --------------------------------------------------------------------------
   Renderizado de la Tabla de Días Inhábiles
   -------------------------------------------------------------------------- */
function renderTable(diasList) {
  const tbody = $('diasTableBody');
  if (!tbody) return;

  lastFilteredDias = diasList;

  // Actualizar estadísticas globales
  const total = allDias.length;
  const oficiales = allDias.filter((d) => (d.tipo || '').toLowerCase() === 'oficial').length;
  const municipales = allDias.filter((d) => (d.tipo || '').toLowerCase() === 'municipal').length;
  const activos = allDias.filter((d) => d.activo === 1 || d.activo === true || d.activo === '1').length;

  if ($('lblTotal')) $('lblTotal').textContent = total;
  if ($('lblOficiales')) $('lblOficiales').textContent = oficiales;
  if ($('lblMunicipales')) $('lblMunicipales').textContent = municipales;
  if ($('lblActivos')) $('lblActivos').textContent = activos;

  const pageData = paginator.getCurrentSlice(diasList);

  if (pageData.length === 0) {
    const hasQuery = ($('searchInput')?.value || '').trim();
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty-row">
          ${hasQuery ? 'No se encontraron días inhábiles que coincidan con la búsqueda.' : 'No hay días inhábiles registrados para los filtros seleccionados.'}
        </td>
      </tr>
    `;
    paginator.update(diasList.length);
    return;
  }

  tbody.innerHTML = pageData.map((d) => {
    const infoFecha = formatFechaLarga(d.fecha);
    const esOficial = (d.tipo || '').toLowerCase() === 'oficial';
    const esActivo = d.activo === 1 || d.activo === true || d.activo === '1';

    const tipoBadge = esOficial
      ? `<span class="badge-status badge-tipo-oficial">Oficial (México)</span>`
      : `<span class="badge-status badge-tipo-municipal">Municipal</span>`;

    const statusBadge = esActivo
      ? `<span class="badge-status badge-status-atendido">Activo</span>`
      : `<span class="badge-status badge-status-inactivo">Inactivo</span>`;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--primary);">${infoFecha.corta}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${infoFecha.diaNombre}</div>
        </td>
        <td>
          <strong style="color: #0F172A;">${esc(d.descripcion || 'Sin descripción')}</strong>
        </td>
        <td>${tipoBadge}</td>
        <td class="td-center"><strong>${d.year || '—'}</strong></td>
        <td>${statusBadge}</td>
        <td class="td-center">
          <div class="table-actions">
            <button type="button" class="btn-icon-action" data-detalle="${esc(d.id)}" title="Ver detalle" aria-label="Ver detalle">${EYE_ICON}</button>
            <button type="button" class="btn-icon-action" data-editar="${esc(d.id)}" title="Editar día inhábil" aria-label="Editar día inhábil">${PENCIL_ICON}</button>
            <button type="button" class="btn-icon-action btn-icon-action-danger" data-eliminar="${esc(d.id)}" title="Eliminar día inhábil" aria-label="Eliminar día inhábil">${TRASH_ICON}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-detalle]').forEach((btn) => {
    btn.onclick = () => openModalDetalle(btn.dataset.detalle);
  });

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.onclick = () => openModalDia(btn.dataset.editar);
  });

  tbody.querySelectorAll('[data-eliminar]').forEach((btn) => {
    btn.onclick = () => openModalEliminar(btn.dataset.eliminar);
  });

  paginator.update(diasList.length);
}

/* --------------------------------------------------------------------------
   Filtros y Búsqueda en Tiempo Real
   -------------------------------------------------------------------------- */
function applyFilterAndRender() {
  const query = ($('searchInput')?.value || '').trim().toLowerCase();
  const filterYear = $('filterYear')?.value || 'todos';
  const filterTipo = $('filterTipo')?.value || 'todos';
  const filterActivo = $('filterActivo')?.value || '1';

  let filtered = [...allDias];

  // Filtro por año
  if (filterYear !== 'todos') {
    filtered = filtered.filter((d) => String(d.year) === String(filterYear));
  }

  // Filtro por tipo
  if (filterTipo !== 'todos') {
    filtered = filtered.filter((d) => (d.tipo || '').toLowerCase() === filterTipo.toLowerCase());
  }

  // Filtro por estatus activo / inactivo
  if (filterActivo !== 'todos') {
    const wantActivo = filterActivo === '1';
    filtered = filtered.filter((d) => {
      const isActivo = d.activo === 1 || d.activo === true || d.activo === '1';
      return isActivo === wantActivo;
    });
  }

  // Búsqueda libre
  if (query) {
    filtered = filtered.filter((d) => {
      const desc = (d.descripcion || '').toLowerCase();
      const fecha = (d.fecha || '').toLowerCase();
      const tipo = (d.tipo || '').toLowerCase();
      const year = String(d.year || '');
      return desc.includes(query) || fecha.includes(query) || tipo.includes(query) || year.includes(query);
    });
  }

  paginator.resetPage();
  renderTable(filtered);
}

function updateYearFilterOptions() {
  const select = $('filterYear');
  if (!select) return;

  const currentVal = select.value;
  const currentYear = new Date().getFullYear();
  const yearsSet = new Set([currentYear - 1, currentYear, currentYear + 1]);

  allDias.forEach((d) => {
    if (d.year) yearsSet.add(Number(d.year));
  });

  const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

  let html = '<option value="todos">Todos los años</option>';
  sortedYears.forEach((y) => {
    const isSelected = String(y) === String(currentYear) && currentVal === 'todos';
    html += `<option value="${y}" ${isSelected ? 'selected' : ''}>${y}</option>`;
  });

  select.innerHTML = html;
  if (currentVal && currentVal !== 'todos') {
    select.value = currentVal;
  }
}

/* --------------------------------------------------------------------------
   Modal: Ver Detalle del Día Inhábil
   -------------------------------------------------------------------------- */
function openModalDetalle(id) {
  const d = allDias.find((item) => item.id === id);
  if (!d) return;

  const content = $('modalDetalleDiaContent');
  if (!content) return;

  const infoFecha = formatFechaLarga(d.fecha);
  const esOficial = (d.tipo || '').toLowerCase() === 'oficial';
  const esActivo = d.activo === 1 || d.activo === true || d.activo === '1';
  const tipoTexto = esOficial ? 'Oficial (Ley Federal del Trabajo - México)' : 'Asueto Municipal';
  const estatusTexto = esActivo ? 'Activo (Aplica en cálculo de días hábiles)' : 'Inactivo (No aplica)';
  const createdAtFmt = d.created_at ? d.created_at.replace('T', ' ').slice(0, 19) : '—';

  content.innerHTML = `
    <div class="detail-item" style="grid-column: span 2;">
      <span class="detail-label">Fecha:</span>
      <span class="detail-value" style="font-size: 15px; font-weight: 700; color: var(--primary);">
        ${infoFecha.larga} (${infoFecha.corta})
      </span>
    </div>
    <div class="detail-item" style="grid-column: span 2;">
      <span class="detail-label">Descripción:</span>
      <span class="detail-value"><strong>${esc(d.descripcion || '—')}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Tipo de día inhábil:</span>
      <span class="detail-value">${esc(tipoTexto)}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Año correspondiente:</span>
      <span class="detail-value"><strong>${d.year || '—'}</strong></span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Estatus:</span>
      <span class="detail-value">${esc(estatusTexto)}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Fecha en que se ingresó:</span>
      <span class="detail-value">${esc(createdAtFmt)}</span>
    </div>
  `;

  $('modalDetalleDia')?.classList.remove('hidden');
}

function closeModalDetalle() {
  $('modalDetalleDia')?.classList.add('hidden');
}

/* --------------------------------------------------------------------------
   Modal: Agregar / Editar Día Inhábil
   -------------------------------------------------------------------------- */
function openModalDia(id = null) {
  const modal = $('modalDiaInhabil');
  const title = $('modalDiaTitle');
  const form = $('formDiaInhabil');
  if (!modal || !form) return;

  editingId = id;

  if (id) {
    const d = allDias.find((item) => item.id === id);
    if (!d) return;
    if (title) title.textContent = 'Editar Día Inhábil';
    $('fechaDia').value = d.fecha || '';
    $('descDia').value = d.descripcion || '';
    $('tipoDia').value = d.tipo || 'Municipal';
    $('activoDia').value = String(d.activo ?? 1);
  } else {
    if (title) title.textContent = 'Nuevo Día Inhábil';
    form.reset();
    const hoyIso = new Date().toISOString().slice(0, 10);
    $('fechaDia').value = hoyIso;
    $('tipoDia').value = 'Municipal';
    $('activoDia').value = '1';
  }

  modal.classList.remove('hidden');
  $('descDia')?.focus();
}

function closeModalDia() {
  editingId = null;
  $('modalDiaInhabil')?.classList.add('hidden');
  $('formDiaInhabil')?.reset();
}

/* --------------------------------------------------------------------------
   Modal: Confirmación de Eliminación
   -------------------------------------------------------------------------- */
function openModalEliminar(id) {
  deletingId = id;
  const d = allDias.find((item) => item.id === id);
  const nombre = d ? `${d.descripcion} (${d.fecha})` : 'este día';
  if ($('modalEliminarDiaTexto')) {
    $('modalEliminarDiaTexto').textContent = `¿Deseas eliminar "${nombre}" del calendario de días inhábiles?`;
  }
  $('modalEliminarDia')?.classList.remove('hidden');
}

function closeModalEliminar() {
  deletingId = null;
  $('modalEliminarDia')?.classList.add('hidden');
}

async function confirmEliminar() {
  const id = deletingId;
  closeModalEliminar();
  if (!id) return;

  try {
    await deleteDiaInhabil(id);
    allDias = allDias.filter((d) => d.id !== id);
    showToast('success', 'Día inhábil eliminado correctamente.');
    updateYearFilterOptions();
    applyFilterAndRender();
  } catch (err) {
    console.error('Error al eliminar día inhábil:', err);
    showToast('error', 'Ocurrió un error al eliminar el día inhábil.');
  }
}

/* --------------------------------------------------------------------------
   Guardado de Día Inhábil (Alta / Edición)
   -------------------------------------------------------------------------- */
$('formDiaInhabil')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fechaVal = $('fechaDia')?.value;
  const descVal = normalizeFinal($('descDia')?.value);
  const tipoVal = $('tipoDia')?.value || 'Municipal';
  const activoVal = Number($('activoDia')?.value || 1);

  if (!fechaVal) {
    showToast('error', 'Por favor selecciona la fecha del día inhábil.');
    $('fechaDia')?.focus();
    return;
  }

  if (!descVal) {
    showToast('error', 'Por favor ingresa una descripción para el día inhábil.');
    $('descDia')?.focus();
    return;
  }

  const yearVal = Number(fechaVal.split('-')[0]) || new Date().getFullYear();

  const data = {
    fecha: fechaVal,
    descripcion: descVal,
    tipo: tipoVal,
    year: yearVal,
    activo: activoVal,
  };

  if (editingId) {
    data.id = editingId;
  }

  try {
    const saved = await saveDiaInhabil(data);
    if (editingId) {
      const idx = allDias.findIndex((d) => d.id === editingId);
      if (idx >= 0) allDias[idx] = { ...allDias[idx], ...saved };
      showToast('success', 'Día inhábil actualizado correctamente.');
    } else {
      allDias.push(saved);
      allDias.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      showToast('success', 'Día inhábil guardado correctamente.');
    }

    closeModalDia();
    updateYearFilterOptions();
    applyFilterAndRender();
  } catch (err) {
    console.error('Error al guardar día inhábil:', err);
    showToast('error', 'Ocurrió un error al guardar el día inhábil.');
  }
});

/* --------------------------------------------------------------------------
   Inicialización de la Página
   -------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al inicializar base de datos:', err);
  }

  // Sincronizar automáticamente feriados oficiales de México
  try {
    await syncOfficialHolidays();
  } catch (err) {
    console.warn('Error al sincronizar feriados oficiales:', err);
  }

  // Cargar todos los días inhábiles
  try {
    allDias = await getAllDiasInhabiles();
  } catch (err) {
    console.error('Error al consultar días inhábiles:', err);
    allDias = [];
  }

  updateYearFilterOptions();
  applyFilterAndRender();
  attachInputNormalizers(document);

  // Filtros interactivos
  $('searchInput')?.addEventListener('input', applyFilterAndRender);
  $('filterYear')?.addEventListener('change', applyFilterAndRender);
  $('filterTipo')?.addEventListener('change', applyFilterAndRender);
  $('filterActivo')?.addEventListener('change', applyFilterAndRender);

  // Botones de modales
  $('btnNuevoDia')?.addEventListener('click', () => openModalDia(null));
  $('btnCancelarDia')?.addEventListener('click', closeModalDia);
  $('btnCerrarModalDiaX')?.addEventListener('click', closeModalDia);

  $('btnCerrarDetalleDia')?.addEventListener('click', closeModalDetalle);
  $('btnCerrarDetalleDiaX')?.addEventListener('click', closeModalDetalle);

  $('btnEliminarDiaNo')?.addEventListener('click', closeModalEliminar);
  $('btnEliminarDiaSi')?.addEventListener('click', confirmEliminar);

  // Cerrar al hacer clic en el backdrop
  $('modalDiaInhabil')?.addEventListener('click', (e) => {
    if (e.target === $('modalDiaInhabil')) closeModalDia();
  });
  $('modalDetalleDia')?.addEventListener('click', (e) => {
    if (e.target === $('modalDetalleDia')) closeModalDetalle();
  });
  $('modalEliminarDia')?.addEventListener('click', (e) => {
    if (e.target === $('modalEliminarDia')) closeModalEliminar();
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('modalDiaInhabil')?.classList.contains('hidden')) closeModalDia();
      if (!$('modalDetalleDia')?.classList.contains('hidden')) closeModalDetalle();
      if (!$('modalEliminarDia')?.classList.contains('hidden')) closeModalEliminar();
    }
  });
});

