/**
 * ============================================================================
 * REPORTES DE ALUMBRADO PÚBLICO (reportes.js)
 * ============================================================================
 * Lógica del formulario de reportes de fallas y lámparas:
 * - Normalización automática (Mayúsculas, sin espacios al inicio/final, un solo espacio entre palabras)
 * - Activación dinámica de campos adicionales para "Otro"
 * - Guardado en la base de datos (SQLite / IndexedDB) con formato "OTRO (especificación)"
 * - Alta con estatus "pendiente" y edición de un reporte existente
 * - Notificaciones Toast de confirmación
 * ============================================================================
 */

import {
  initDatabase,
  saveReporte,
  getReporteById,
  searchLocalidades,
} from './db.js';

import { processSyncQueue } from './database/repositories/syncQueue.js';

import {
  attachInputNormalizers,
  normalizeFinal,
} from './normalizer.js';

const $ = (id) => document.getElementById(id);

const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

let toastTimeout = null;
let editingId = null;
let editingEstatus = 'En espera';

/* --------------------------------------------------------------------------
   Autocomplete de Colonia / Comunidad
   -------------------------------------------------------------------------- */
function setupColoniaAutocomplete() {
  const input = document.getElementById('colonia');
  const list  = document.getElementById('listColoniaComunidad');
  if (!input || !list) return;

  let debounceTimer = null;

  function hideList() {
    list.style.display = 'none';
    list.innerHTML = '';
  }

  async function showSuggestions(query) {
    const results = await searchLocalidades(query);
    list.innerHTML = '';
    if (!results.length) { hideList(); return; }

    results.forEach((loc) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.setAttribute('role', 'option');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'autocomplete-item-name';
      nameSpan.textContent = loc.nombre;

      const subSpan = document.createElement('span');
      subSpan.className = 'autocomplete-item-sub';
      subSpan.textContent = loc.tipo === 'Comunidad' ? 'Comunidad / Rancho' : 'Cabecera municipal (Valle de Santiago)';

      li.appendChild(nameSpan);
      li.appendChild(subSpan);

      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = loc.nombre;
        // sincronizar tipo_localidad automáticamente
        const selTipo = document.getElementById('tipoLocalidad');
        if (selTipo && loc.tipo) {
          if (loc.tipo === 'Comunidad') {
            selTipo.value = 'Comunidad';
          } else {
            selTipo.value = 'Cabecera municipal (Valle de Santiago)';
          }
        }
        hideList();
      });

      list.appendChild(li);
    });
    list.style.display = 'block';
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 1) { hideList(); return; }
    debounceTimer = setTimeout(() => showSuggestions(q), 200);
  });

  input.addEventListener('blur', () => {
    setTimeout(hideList, 150);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideList();
  });
}

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

  const estatus = $('estatus');
  const wrapOtroEstatus = $('wrapOtroEstatus');
  const otroEstatus = $('otroEstatus');

  estatus?.addEventListener('change', () => {
    if (estatus.value === 'Otro') {
      wrapOtroEstatus?.classList.remove('hidden');
      otroEstatus?.focus();
    } else {
      wrapOtroEstatus?.classList.add('hidden');
      if (otroEstatus) otroEstatus.value = '';
    }
  });
}

/* --------------------------------------------------------------------------
   Gestión del Formulario (Guardar, Limpiar)
   -------------------------------------------------------------------------- */
function setEditMode(active) {
  const title = $('reporteFormTitle');
  const pageTitle = document.querySelector('.app-title');
  const btn = $('btnSaveReporte');

  if (active) {
    if (title) title.textContent = 'Editar reporte';
    if (pageTitle) pageTitle.textContent = 'Editar reporte';
    if (btn) btn.textContent = 'Guardar cambios';
    document.title = 'Editar reporte - Alumbrado Público';
    return;
  }

  editingId = null;
  editingEstatus = 'En espera';
  if (title) title.textContent = 'Nuevo Reporte de Falla / Lámpara';
  if (pageTitle) pageTitle.textContent = 'Nuevo Reporte de Falla';
  if (btn) btn.textContent = 'Guardar reporte';
  document.title = 'Nuevo Reporte de Falla - Alumbrado Público';
}

function applySelectValue(selectEl, storedValue, wrapEl, otherInput) {
  const raw = String(storedValue || '').trim();
  const otro = raw.match(/^OTRO\s*\((.*)\)\s*$/i);

  if (otro) {
    selectEl.value = 'Otro';
    wrapEl?.classList.remove('hidden');
    if (otherInput) otherInput.value = otro[1].trim();
    return;
  }

  const match = [...selectEl.options].find(
    (opt) => opt.value.toUpperCase() === raw.toUpperCase()
  );

  if (match) {
    selectEl.value = match.value;
    wrapEl?.classList.add('hidden');
    if (otherInput) otherInput.value = '';
    return;
  }

  if (raw) {
    selectEl.value = 'Otro';
    wrapEl?.classList.remove('hidden');
    if (otherInput) otherInput.value = raw;
    return;
  }

  selectEl.selectedIndex = 0;
  wrapEl?.classList.add('hidden');
  if (otherInput) otherInput.value = '';
}

function fillForm(reporte) {
  $('folio').value = reporte.folio || '';
  $('fecha').value = reporte.fecha || today();
  $('atendio').value = reporte.atendio || '';
  $('telefono').value = reporte.telefono || '';
  $('usuario').value = reporte.usuario || '';
  $('direccion').value = reporte.direccion || '';
  $('colonia').value = reporte.colonia_comunidad || '';
  $('numeroLamparas').value = String(reporte.numero_lamparas || 1);
  $('entreCalles').value = reporte.entre_calles || '';
  $('referencias').value = reporte.referencias || '';
  $('observaciones').value = reporte.observaciones || '';

  // Tipo de localidad
  const selTipo = $('tipoLocalidad');
  if (selTipo) {
    selTipo.value = reporte.tipo_localidad || 'Cabecera municipal (Valle de Santiago)';
  }

  applySelectValue($('tipoLampara'), reporte.tipo_lampara, $('wrapOtroLampara'), $('otroLampara'));
  applySelectValue($('tipoFalla'), reporte.tipo_falla, $('wrapOtroFalla'), $('otroFalla'));
  applySelectValue($('estatus'), reporte.estatus || 'En espera', $('wrapOtroEstatus'), $('otroEstatus'));
}

async function loadReporteForEdit(id) {
  try {
    const reporte = await getReporteById(id);
    if (!reporte) {
      showToast('error', 'No se encontró el reporte a editar.');
      return;
    }

    editingId = reporte.id;
    editingEstatus = reporte.estatus || 'En espera';
    fillForm(reporte);
    setEditMode(true);
    $('folio')?.focus();
  } catch (err) {
    console.error('Error al cargar reporte para edición:', err);
    showToast('error', 'No se pudo abrir el reporte para editar.');
  }
}

function resetForm() {
  const form = $('reporteForm');
  if (!form) return;

  if (editingId) {
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    history.replaceState({}, '', `${url.pathname}${url.search}`);
  }

  form.reset();
  $('fecha').value = today();
  $('numeroLamparas').value = '1';

  $('wrapOtroLampara')?.classList.add('hidden');
  $('wrapOtroFalla')?.classList.add('hidden');
  if ($('estatus')) $('estatus').value = 'En espera';
  $('wrapOtroEstatus')?.classList.add('hidden');
  if ($('otroEstatus')) $('otroEstatus').value = '';
  setEditMode(false);

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

  // Resolver estatus (si es Otro, guardar como "Otro(ESPECIFICACIÓN)")
  const selEstatus = $('estatus') ? $('estatus').value : 'En espera';
  let finalEstatus = '';
  if (selEstatus === 'Otro') {
    const especEstatus = normalizeFinal($('otroEstatus').value);
    if (!especEstatus) {
      showToast('error', 'Por favor especifica el estatus en el campo habilitado.');
      $('otroEstatus').focus();
      return;
    }
    finalEstatus = `Otro(${especEstatus})`;
  } else {
    finalEstatus = selEstatus;
  }

  const reportData = {
    folio: folioVal,
    fecha: $('fecha').value || today(),
    atendio: normalizeFinal($('atendio').value),
    usuario: normalizeFinal($('usuario').value),
    direccion: normalizeFinal($('direccion').value),
    colonia_comunidad: normalizeFinal($('colonia').value),
    telefono: normalizeFinal($('telefono').value),
    numero_lamparas: parseInt($('numeroLamparas').value, 10) || 1,
    tipo_lampara: finalTipoLampara,
    tipo_falla: finalTipoFalla,
    entre_calles: normalizeFinal($('entreCalles').value),
    referencias: normalizeFinal($('referencias').value),
    observaciones: normalizeFinal($('observaciones').value),
    estatus: finalEstatus || (editingId ? editingEstatus : 'En espera'),
    tipo_localidad: $('tipoLocalidad')?.value || 'Cabecera municipal (Valle de Santiago)',
  };

  if (editingId) reportData.id = editingId;

  try {
    await saveReporte(reportData);
    showToast('success', editingId ? 'Reporte actualizado correctamente' : 'Reporte guardado correctamente');
    const wasEditing = !!editingId;
    resetForm();
    if (wasEditing) {
      setTimeout(() => {
        window.location.href = 'registros-reportes.html';
      }, 1000);
    }
  } catch (err) {
    console.error('Error al guardar reporte:', err);
    showToast('error', 'Ocurrió un error al guardar el reporte');
  }
});

/* --------------------------------------------------------------------------
   Inicialización
   -------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al conectar base de datos:', err);
  }

  setupConditionalFields();
  setupColoniaAutocomplete();
  attachInputNormalizers(document);

  if ($('fecha')) $('fecha').value = today();

  const editId = new URLSearchParams(window.location.search).get('id');
  if (editId) {
    await loadReporteForEdit(editId);
  }

  // Sincronización automática al recuperar conexión
  window.addEventListener('online', () => {
    console.info('[reportes] Conexión restaurada, procesando cola de reportes...');
    processSyncQueue('reportes').then((res) => {
      if (res.synced > 0) {
        showToast('success', `Conexión restaurada: ${res.synced} reporte(s) sincronizado(s) con Google Sheets.`);
      }
    });
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

