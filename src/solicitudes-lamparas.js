/**
 * Solicitudes de instalación de lámparas.
 * Formulario y listado sobre la tabla solicitudes_instalacion_lamparas.
 */

import {
  initDatabase,
  saveSolicitudLampara,
  getAllSolicitudesLamparas,
  getSolicitudLamparaById,
  searchLocalidades,
  findOrCreateLocalidad,
} from './db.js';

import { attachInputNormalizers, normalizeFinal } from './normalizer.js';

const $ = (id) => document.getElementById(id);

const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

const fd = (s) => (s ? s.split('-').reverse().join('/') : '');

let toastTimeout = null;
let editingId = null;

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

    // Opción para agregar nueva si no coincide exactamente
    const q = query.trim();
    const exactMatch = results.some((r) => r.nombre.toLowerCase() === q.toLowerCase());

    if (q && !exactMatch) {
      const liNew = document.createElement('li');
      liNew.className = 'autocomplete-item autocomplete-item-add';
      liNew.setAttribute('role', 'option');
      liNew.innerHTML = `<span class="autocomplete-item-name">➕ Agregar "<strong>${esc(q)}</strong>"</span>`;
      liNew.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        input.value = q;
        const selTipo = document.getElementById('tipoLocalidad');
        const tipo = (selTipo?.value === 'Comunidad') ? 'Comunidad' : 'Cabecera municipal';
        try {
          await findOrCreateLocalidad(q, tipo);
        } catch (err) {
          console.warn('[solicitudes] No se pudo guardar localidad:', err);
        }
        hideList();
      });
      list.appendChild(liNew);
    }

    if (!results.length && !q) { hideList(); return; }

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
        const selTipo = document.getElementById('tipoLocalidad');
        if (selTipo && loc.tipo) {
          selTipo.value = loc.tipo === 'Comunidad' ? 'Comunidad' : 'Cabecera municipal (Valle de Santiago)';
        }
        hideList();
      });

      list.appendChild(li);
    });

    if (list.children.length > 0) {
      list.style.display = 'block';
    } else {
      hideList();
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 1) { hideList(); return; }
    debounceTimer = setTimeout(() => showSuggestions(q), 200);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q.length >= 1) showSuggestions(q);
  });

  input.addEventListener('blur', () => {
    setTimeout(hideList, 150);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideList();
  });
}

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

function setEditMode(active) {
  const title = $('solicitudFormTitle');
  const pageTitle = $('pageTitle');
  const btn = $('btnSaveSolicitud');
  if (active) {
    if (title) title.textContent = 'Editar solicitud de lámpara';
    if (pageTitle) pageTitle.textContent = 'Editar solicitud de lámpara';
    if (btn) btn.textContent = 'Guardar cambios';
    return;
  }
  editingId = null;
  if (title) title.textContent = 'Nueva solicitud de lámpara';
  if (pageTitle) pageTitle.textContent = 'Solicitud de instalación de lámpara';
  if (btn) btn.textContent = 'Guardar solicitud';
}

function resetForm() {
  const form = $('solicitudForm');
  if (!form) return;
  form.reset();
  if ($('fechaSolicitud')) $('fechaSolicitud').value = today();
  if ($('cantidadLamparas')) $('cantidadLamparas').value = '1';
  if ($('estatus')) $('estatus').value = 'En espera';
  $('wrapOtroEstatus')?.classList.add('hidden');
  if ($('otroEstatus')) $('otroEstatus').value = '';
  if ($('tipoLocalidad')) $('tipoLocalidad').value = 'Cabecera municipal (Valle de Santiago)';
  setEditMode(false);
  $('nombreSolicitante')?.focus();
}

function resolveEstatus() {
  const sel = $('estatus') ? $('estatus').value : 'En espera';
  if (sel !== 'Otro') return sel;
  const espec = normalizeFinal($('otroEstatus')?.value || '');
  if (!espec) return null;
  return `Otro(${espec})`;
}

function fillForm(row) {
  $('nombreSolicitante').value = row.nombre_solicitante || '';
  $('fechaSolicitud').value = row.fecha_solicitud || today();
  $('tipoLocalidad').value = row.tipo_localidad || 'Cabecera municipal (Valle de Santiago)';
  $('cantidadLamparas').value = String(row.cantidad_lamparas || 1);
  if ($('colonia')) $('colonia').value = row.colonia_comunidad || '';
  if ($('telefono')) $('telefono').value = row.telefono || '';
  $('descripcion').value = row.descripcion || '';
  $('observaciones').value = row.observaciones || '';

  const raw = String(row.estatus || 'En espera').trim();
  const otro = raw.match(/^Otro\s*\((.*)\)\s*$/i);
  if (otro) {
    $('estatus').value = 'Otro';
    $('wrapOtroEstatus')?.classList.remove('hidden');
    $('otroEstatus').value = otro[1].trim();
  } else {
    const match = [...$('estatus').options].find((opt) => opt.value.toUpperCase() === raw.toUpperCase());
    $('estatus').value = match ? match.value : 'En espera';
    $('wrapOtroEstatus')?.classList.add('hidden');
    $('otroEstatus').value = '';
  }
}

async function renderList() {
  const body = $('solicitudesTableBody');
  const total = $('lblTotalSolicitudes');
  if (!body) return;

  let rows = [];
  try {
    rows = await getAllSolicitudesLamparas();
  } catch (err) {
    console.error(err);
  }

  if (total) total.textContent = String(rows.length);

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7">No hay solicitudes de instalación registradas.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((r) => `
    <tr>
      <td>${esc(fd(r.fecha_solicitud))}</td>
      <td>${esc(r.nombre_solicitante)}</td>
      <td>${esc(r.tipo_localidad)}</td>
      <td>${esc(r.cantidad_lamparas)}</td>
      <td>${esc(r.estatus)}</td>
      <td>${esc(r.descripcion)}</td>
      <td>
        <button type="button" class="btn btn-secondary" data-editar="${esc(r.id)}">Editar</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = rows.find((item) => item.id === btn.dataset.editar);
      if (!row) return;
      editingId = row.id;
      fillForm(row);
      setEditMode(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

$('toastClose')?.addEventListener('click', () => {
  if (toastTimeout) clearTimeout(toastTimeout);
  $('toastNotification')?.classList.add('hidden');
});

$('estatus')?.addEventListener('change', () => {
  if ($('estatus').value === 'Otro') {
    $('wrapOtroEstatus')?.classList.remove('hidden');
    $('otroEstatus')?.focus();
  } else {
    $('wrapOtroEstatus')?.classList.add('hidden');
    if ($('otroEstatus')) $('otroEstatus').value = '';
  }
});

$('btnResetSolicitud')?.addEventListener('click', resetForm);

$('solicitudForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = normalizeFinal($('nombreSolicitante').value);
  if (!nombre) {
    showToast('error', 'Escribe el nombre del solicitante.');
    $('nombreSolicitante').focus();
    return;
  }

  const estatus = resolveEstatus();
  if (!estatus) {
    showToast('error', 'Especifica el estatus.');
    $('otroEstatus')?.focus();
    return;
  }

  const payload = {
    nombre_solicitante: nombre,
    fecha_solicitud: $('fechaSolicitud').value || today(),
    tipo_localidad: $('tipoLocalidad')?.value || 'Cabecera municipal (Valle de Santiago)',
    colonia_comunidad: normalizeFinal($('colonia')?.value || ''),
    telefono: normalizeFinal($('telefono')?.value || ''),
    descripcion: normalizeFinal($('descripcion').value),
    estatus,
    cantidad_lamparas: parseInt($('cantidadLamparas').value, 10) || 1,
    observaciones: normalizeFinal($('observaciones').value),
  };
  if (editingId) payload.id = editingId;

  // Auto-registrar localidad si se escribió una nueva
  const coloniaVal = normalizeFinal($('colonia')?.value || '');
  if (coloniaVal) {
    const tipoLoc = ($('tipoLocalidad')?.value === 'Comunidad') ? 'Comunidad' : 'Cabecera municipal';
    try { await findOrCreateLocalidad(coloniaVal, tipoLoc); } catch (_) { /* silent */ }
  }

  try {
    await saveSolicitudLampara(payload);
    showToast('success', editingId ? 'Solicitud actualizada.' : 'Solicitud de lámpara guardada.');
    const wasEditing = !!editingId;
    resetForm();
    if (wasEditing) {
      setTimeout(() => {
        window.location.href = 'registros-reportes.html';
      }, 1000);
    }
  } catch (err) {
    console.error(err);
    showToast('error', 'No se pudo guardar la solicitud.');
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al conectar base de datos:', err);
  }

  setupColoniaAutocomplete();
  attachInputNormalizers(document);
  if ($('fechaSolicitud')) $('fechaSolicitud').value = today();

  // Si viene con parámetro ?id=... cargamos para edición
  try {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam) {
      const item = await getSolicitudLamparaById(idParam);
      if (item) {
        editingId = item.id;
        fillForm(item);
        setEditMode(true);
      }
    }
  } catch (err) {
    console.warn('Error al cargar solicitud por parámetro id:', err);
  }

  $('btnToggleHerramientas')?.addEventListener('click', (e) => {
    e.preventDefault();
    const group = $('navGroupHerramientas');
    if (!group) return;
    const isOpen = group.classList.toggle('is-open');
    $('btnToggleHerramientas')?.setAttribute('aria-expanded', String(isOpen));
  });
});
