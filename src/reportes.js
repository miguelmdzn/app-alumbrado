/**
 * ============================================================================
 * REPORTES DE ALUMBRADO PÚBLICO (reportes.js)
 * ============================================================================
 * Lógica del formulario de reportes de fallas y lámparas:
 * - Normalización automática (Mayúsculas, sin espacios al inicio/final, un solo espacio entre palabras)
 * - Activación dinámica de campos adicionales para "Otro"
 * - Guardado en la base de datos (SQLite / IndexedDB) con formato "OTRO (especificación)"
 * - Notificaciones Toast de confirmación
 * - Tabla interactiva con búsqueda en tiempo real
 * ============================================================================
 */

import {
  initDatabase,
  saveReporte,
  getAllReportes,
  deleteReporte,
} from './db.js';

import {
  attachInputNormalizers,
  normalizeFinal,
} from './normalizer.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));

const fd = (s) => (s ? s.split('-').reverse().join('/') : '');

const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

let allReportes = [];
let toastTimeout = null;

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
   Control de Campos Condicionales "Otro"
   -------------------------------------------------------------------------- */
function setupConditionalFields() {
  const tipoLampara = $('tipoLampara');
  const wrapOtroLampara = $('wrapOtroLampara');
  const otroLampara = $('otroLampara');

  tipoLampara?.addEventListener('change', () => {
    if (tipoLampara.value === 'Otro') {
      wrapOtroLampara?.classList.remove('hidden');
      otroLampara?.focus();
    } else {
      wrapOtroLampara?.classList.add('hidden');
      if (otroLampara) otroLampara.value = '';
    }
  });

  const tipoFalla = $('tipoFalla');
  const wrapOtroFalla = $('wrapOtroFalla');
  const otroFalla = $('otroFalla');

  tipoFalla?.addEventListener('change', () => {
    if (tipoFalla.value === 'Otro') {
      wrapOtroFalla?.classList.remove('hidden');
      otroFalla?.focus();
    } else {
      wrapOtroFalla?.classList.add('hidden');
      if (otroFalla) otroFalla.value = '';
    }
  });
}

/* --------------------------------------------------------------------------
   Gestión del Formulario (Guardar, Limpiar)
   -------------------------------------------------------------------------- */
function resetForm() {
  const form = $('reporteForm');
  if (!form) return;

  form.reset();
  $('fecha').value = today();
  $('numeroLamparas').value = '1';

  $('wrapOtroLampara')?.classList.add('hidden');
  $('wrapOtroFalla')?.classList.add('hidden');

  $('folio').focus();
}

$('btnResetReporte')?.addEventListener('click', resetForm);

$('reporteForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const folioVal = normalizeFinal($('folio').value);
  if (!folioVal) {
    showToast('error', 'Por favor ingresa el folio del reporte.');
    $('folio').focus();
    return;
  }

  // Resolver tipo de lámpara (si es Otro, guardar como "OTRO (ESPECIFICACIÓN)")
  const selLampara = $('tipoLampara').value;
  let finalTipoLampara = '';
  if (selLampara === 'Otro') {
    const espec = normalizeFinal($('otroLampara').value);
    if (!espec) {
      showToast('error', 'Por favor especifica el tipo de lámpara en el campo habilitado.');
      $('otroLampara').focus();
      return;
    }
    finalTipoLampara = `OTRO (${espec})`;
  } else {
    finalTipoLampara = selLampara.toUpperCase();
  }

  // Resolver tipo de falla (si es Otro, guardar como "OTRO (ESPECIFICACIÓN)")
  const selFalla = $('tipoFalla').value;
  let finalTipoFalla = '';
  if (selFalla === 'Otro') {
    const especFalla = normalizeFinal($('otroFalla').value);
    if (!especFalla) {
      showToast('error', 'Por favor especifica la falla en el campo habilitado.');
      $('otroFalla').focus();
      return;
    }
    finalTipoFalla = `OTRO (${especFalla})`;
  } else {
    finalTipoFalla = selFalla.toUpperCase();
  }

  // Construir objeto normalizado
  const reportData = {
    folio:             folioVal,
    fecha:             $('fecha').value || today(),
    atendio:           normalizeFinal($('atendio').value),
    usuario:           normalizeFinal($('usuario').value),
    direccion:         normalizeFinal($('direccion').value),
    colonia_comunidad: normalizeFinal($('colonia').value),
    telefono:          normalizeFinal($('telefono').value),
    numero_lamparas:   parseInt($('numeroLamparas').value, 10) || 1,
    tipo_lampara:      finalTipoLampara,
    tipo_falla:        finalTipoFalla,
    entre_calles:      normalizeFinal($('entreCalles').value),
    referencias:       normalizeFinal($('referencias').value),
    observaciones:     normalizeFinal($('observaciones').value),
    estatus:           'PENDIENTE'
  };

  try {
    await saveReporte(reportData);
    showToast('success', 'Reporte guardado correctamente');
    resetForm();
  } catch (err) {
    console.error('Error al guardar reporte:', err);
    showToast('error', 'Ocurrió un error al guardar el reporte');
  }
});

/* --------------------------------------------------------------------------
   Renderizado de la Tabla de Reportes
   -------------------------------------------------------------------------- */
function renderTable(reportes) {
  const tbody = $('reportesTableBody');
  if (!tbody) return;

  if (reportes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="table-empty-row">
          No se encontraron reportes registrados en la base de datos.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = reportes.map((r) => {
    const fechaFmt = fd(r.fecha) || '—';
    const ubicacion = [r.direccion, r.colonia_comunidad].filter(Boolean).join(', ') || '—';

    return `
      <tr data-report-id="${r.id}">
        <td class="td-folio">${esc(r.folio || 'S/F')}</td>
        <td class="td-datetime">${fechaFmt}</td>
        <td>${esc(r.atendio || '—')}</td>
        <td><strong>${esc(r.usuario || '—')}</strong></td>
        <td class="td-domicilio">${esc(ubicacion)}</td>
        <td class="td-center"><strong>${r.numero_lamparas || 1}</strong></td>
        <td><span class="badge-lampara">${esc(r.tipo_lampara || '—')}</span></td>
        <td><span class="badge-falla">${esc(r.tipo_falla || '—')}</span></td>
        <td>${esc(r.telefono || '—')}</td>
        <td class="td-center">
          <button type="button" class="btn btn-danger-outline btn-table-action" data-del="${r.id}" title="Eliminar reporte">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Eventos de eliminación
  tbody.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.del;
      if (confirm('¿Deseas eliminar este reporte del sistema?')) {
        await deleteReporte(id);
        allReportes = allReportes.filter((x) => x.id !== id);
        applyFilterAndRender();
        showToast('success', 'Reporte eliminado correctamente');
      }
    };
  });
}

function updateStats(reportes) {
  const total = reportes.length;
  const totalLamparas = reportes.reduce((acc, r) => acc + (parseInt(r.numero_lamparas, 10) || 1), 0);

  if ($('lblTotalReportes')) $('lblTotalReportes').textContent = total;
  if ($('lblTotalLamparas')) $('lblTotalLamparas').textContent = totalLamparas;
}

function applyFilterAndRender() {
  const query = ($('searchReportesInput')?.value || '').trim().toLowerCase();

  let filtered = [...allReportes];
  if (query) {
    filtered = filtered.filter((r) => {
      const folio = (r.folio || '').toLowerCase();
      const usuario = (r.usuario || '').toLowerCase();
      const atendio = (r.atendio || '').toLowerCase();
      const colonia = (r.colonia_comunidad || '').toLowerCase();
      const direccion = (r.direccion || '').toLowerCase();
      const falla = (r.tipo_falla || '').toLowerCase();
      const lampara = (r.tipo_lampara || '').toLowerCase();
      return (
        folio.includes(query) ||
        usuario.includes(query) ||
        atendio.includes(query) ||
        colonia.includes(query) ||
        direccion.includes(query) ||
        falla.includes(query) ||
        lampara.includes(query)
      );
    });
  }

  renderTable(filtered);
  updateStats(filtered);
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

  // Configurar campos condicionales "Otro"
  setupConditionalFields();

  // Activar normalización universal de texto (mayúsculas, sin espacios al inicio/final, un solo espacio intermedio)
  attachInputNormalizers(document);

  // Fecha de hoy por defecto
  if ($('fecha')) $('fecha').value = today();

  // Cargar reportes existentes
  try {
    allReportes = await getAllReportes();
  } catch (err) {
    console.error('Error al cargar reportes:', err);
    allReportes = [];
  }

  applyFilterAndRender();

  // Búsqueda en vivo
  $('searchReportesInput')?.addEventListener('input', applyFilterAndRender);
});

