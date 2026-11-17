/**
 * ============================================================================
 * ATENCIÓN DE REPORTE — formulario de alta y edición
 * ============================================================================
 * El folio llega del reporte y no se captura a mano.
 * Fecha y hora inician con el momento en que se abrió el formulario.
 * ============================================================================
 */

import {
  initDatabase,
  saveAtencion,
  getAtencionById,
  deleteAtencion,
  getAllPersonal,
  getFullName,
} from './db.js';
import { attachInputNormalizers, normalizeFinal } from './normalizer.js';
import { parseMapsInput, generateQrDataUrl } from './geo-utils.js';
import { bindAdminDelete } from './admin-mode.js';

const $ = (id) => document.getElementById(id);

const openedAt = new Date();
const pad = (n) => String(n).padStart(2, '0');
const openedFecha = `${openedAt.getFullYear()}-${pad(openedAt.getMonth() + 1)}-${pad(openedAt.getDate())}`;
const openedHora = `${pad(openedAt.getHours())}:${pad(openedAt.getMinutes())}`;

const params = new URLSearchParams(window.location.search);
const reporteId = params.get('reporteId') || '';
const editId = params.get('id') || '';
let refreshAdminDelete = () => {};
let folioInicial = params.get('folio') || '';

let fotos = [null, null];
let fotoRefs = [null, null];
let allPersonal = [];
let selectedPersonalIds = [];
let highlightedIndex = -1;
let filteredPersonal = [];
let toastTimeout = null;
let saving = false;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

refreshAdminDelete = bindAdminDelete({
  isEditing: () => Boolean(editId),
  message: '¿Eliminar esta atención de forma permanente? Esta acción no se puede deshacer.',
  getId: () => editId,
  removeLocal: (id) => deleteAtencion(id),
  after: () => {
    window.location.href = listUrl();
  },
});

function listUrl() {
  const query = new URLSearchParams({
    folio: $('folio')?.value || folioInicial,
    reporteId,
  });
  return `atenciones.html?${query.toString()}`;
}

function showToast(type, message) {
  const toast = $('toastNotification');
  const iconEl = $('toastIcon');
  const msgEl = $('toastMessage');
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  if (iconEl) {
    iconEl.innerHTML = type === 'success'
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  }
  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 4500);
}

function readImg(file) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * scale);
        c.height = Math.round(im.height * scale);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function drawDrops() {
  const labels = ['Foto 1', 'Foto 2'];
  const dropsEl = $('drops');
  if (!dropsEl) return;
  dropsEl.innerHTML = [0, 1].map((i) => `
    <div class="drop-zone" data-i="${i}" tabindex="0">
      <input type="file" accept="image/*" class="drop-file-input">
      ${fotos[i]
        ? `<img src="${fotos[i]}" alt="Foto ${i + 1}" class="drop-img-preview">
           <button type="button" class="btn-remove-photo" data-x="${i}">Quitar</button>`
        : `<div class="drop-icon">
             <svg class="icon-camera" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
               <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
               <circle cx="12" cy="13" r="4"></circle>
             </svg>
           </div>
           <div class="drop-title">${labels[i]}</div>
           <div class="drop-hint">Haz clic, arrastra o presiona Ctrl+V</div>`}
    </div>
  `).join('');

  dropsEl.querySelectorAll('.drop-zone').forEach((el) => {
    const i = +el.dataset.i;
    const fileInput = el.querySelector('.drop-file-input');
    el.onclick = (e) => {
      if (e.target.closest('.btn-remove-photo')) return;
      fileInput.click();
    };
    fileInput.onchange = (e) => addFiles(e.target.files, i);
    el.ondragover = (e) => {
      e.preventDefault();
      el.classList.add('over');
    };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = (e) => {
      e.preventDefault();
      el.classList.remove('over');
      addFiles(e.dataTransfer.files, i);
    };
  });

  dropsEl.querySelectorAll('.btn-remove-photo').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const i = +btn.dataset.x;
      fotos[i] = null;
      fotoRefs[i] = null;
      drawDrops();
    };
  });
}

async function addFiles(files, startIdx) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  for (let k = 0; k < list.length && (startIdx + k) < 2; k++) {
    fotos[startIdx + k] = await readImg(list[k]);
    fotoRefs[startIdx + k] = null;
  }
  drawDrops();
}

function updateGeoPreview() {
  const msgEl = $('geoMsg');
  const previewBox = $('formQrPreview');
  const previewImg = $('formQrImg');
  const previewUrl = $('formQrUrlPreview');
  if (!msgEl || !previewBox) return;

  const latVal = parseFloat($('lat').value);
  const lonVal = parseFloat($('lon').value);
  const hasManual = !Number.isNaN(latVal) && !Number.isNaN(lonVal) && Math.abs(latVal) <= 90 && Math.abs(lonVal) <= 180;
  const geoText = $('geoLink').value.trim();
  const parsed = parseMapsInput(geoText);
  let targetUrl = '';

  if (hasManual) {
    targetUrl = `https://www.google.com/maps?q=${Number(latVal.toFixed(6))},${Number(lonVal.toFixed(6))}`;
    msgEl.className = 'geo-hint-badge ok';
    msgEl.textContent = `Coordenadas válidas: Latitud ${latVal.toFixed(6)}, Longitud ${lonVal.toFixed(6)}`;
  } else if (parsed && parsed.qrUrl) {
    targetUrl = parsed.qrUrl;
    msgEl.className = parsed.lat !== null ? 'geo-hint-badge ok' : 'geo-hint-badge';
    msgEl.textContent = parsed.lat !== null
      ? `Ubicación identificada: Latitud ${parsed.lat}, Longitud ${parsed.lon}`
      : 'Enlace reconocido. Presiona «Obtener» para extraer latitud y longitud.';
  } else if (!geoText) {
    msgEl.className = 'geo-hint-badge';
    msgEl.textContent = 'Pega el enlace de Google Maps y presiona «Obtener» para extraer latitud y longitud.';
    previewBox.classList.add('hidden');
    return;
  } else {
    msgEl.className = 'geo-hint-badge warn';
    msgEl.textContent = 'No se reconocieron coordenadas válidas. Puedes ingresarlas directamente.';
    previewBox.classList.add('hidden');
    return;
  }

  const qrData = targetUrl ? generateQrDataUrl(targetUrl) : '';
  if (qrData) {
    previewBox.classList.remove('hidden');
    previewImg.innerHTML = `<img src="${qrData}" alt="QR">`;
    previewUrl.textContent = targetUrl;
  } else {
    previewBox.classList.add('hidden');
  }
}

async function obtenerCoordenadasDelLink() {
  const geoText = $('geoLink').value.trim();
  const msgEl = $('geoMsg');
  const btn = $('btnObtenerGeo');
  if (!geoText) {
    msgEl.className = 'geo-hint-badge warn';
    msgEl.textContent = 'Ingresa o pega primero un enlace de Google Maps o coordenadas.';
    $('geoLink').focus();
    return;
  }

  const parsed = parseMapsInput(geoText);
  if (parsed && parsed.lat !== null && parsed.lon !== null) {
    $('lat').value = parsed.lat;
    $('lon').value = parsed.lon;
    if (parsed.alt) $('alt').value = parsed.alt;
    updateGeoPreview();
    msgEl.className = 'geo-hint-badge ok';
    msgEl.textContent = `Coordenadas obtenidas: Latitud ${parsed.lat}, Longitud ${parsed.lon}`;
    return;
  }

  if (parsed && parsed.isShort) {
    btn.disabled = true;
    btn.textContent = 'Obteniendo...';
    let resolved = false;
    try {
      const targetUrl = parsed.url || geoText;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const data = await resp.json();
        const resolvedUrl = (data && data.status && data.status.url) || '';
        const contents = (data && data.contents) || '';
        const sub = parseMapsInput(resolvedUrl) || parseMapsInput(contents);
        if (sub && sub.lat !== null && sub.lon !== null) {
          $('lat').value = sub.lat;
          $('lon').value = sub.lon;
          if (sub.alt && !$('alt').value) $('alt').value = sub.alt;
          updateGeoPreview();
          msgEl.className = 'geo-hint-badge ok';
          msgEl.textContent = `Coordenadas obtenidas: Latitud ${sub.lat}, Longitud ${sub.lon}`;
          resolved = true;
        }
      }
    } catch (err) {
      console.warn('No se pudo resolver el enlace corto:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Obtener';
    }
    if (!resolved) {
      updateGeoPreview();
      msgEl.className = 'geo-hint-badge warn';
      msgEl.textContent = 'Enlace corto: ábrelo en el navegador y copia la URL completa, o escribe latitud y longitud.';
    }
    return;
  }

  updateGeoPreview();
  msgEl.className = 'geo-hint-badge warn';
  msgEl.textContent = 'No se encontraron coordenadas en el enlace. Puedes ingresarlas manualmente.';
}

function renderChips() {
  const box = $('atendioChipsBox');
  const input = $('atendioSearchInput');
  const hidden = $('atendio');
  if (!box || !input) return;
  box.querySelectorAll('.multiselect-chip').forEach((chip) => chip.remove());
  selectedPersonalIds.forEach((id) => {
    const person = allPersonal.find((item) => item.id === id);
    const name = person ? getFullName(person) : id;
    const chip = document.createElement('span');
    chip.className = 'multiselect-chip';
    chip.innerHTML = `<span class="multiselect-chip-text"></span><button type="button" class="multiselect-chip-remove" aria-label="Quitar">&times;</button>`;
    chip.querySelector('.multiselect-chip-text').textContent = name;
    chip.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      selectedPersonalIds = selectedPersonalIds.filter((item) => item !== id);
      renderChips();
    };
    box.insertBefore(chip, input);
  });
  if (hidden) hidden.value = selectedPersonalIds.join(',');
}

function filterPersonal(query) {
  const q = (query || '').trim().toLowerCase();
  const available = allPersonal.filter((p) => !selectedPersonalIds.includes(p.id));
  if (!q) return available.filter((p) => (p.estatus || 'Activo') === 'Activo').slice(0, 15);
  return available.filter((p) => {
    const full = getFullName(p).toLowerCase();
    const cargo = (p.cargo || '').toLowerCase();
    const num = (p.numero_trabajador || '').toLowerCase();
    return full.includes(q) || cargo.includes(q) || num.includes(q);
  });
}

function openDropdown(query = '') {
  const dropdown = $('atendioDropdown');
  if (!dropdown) return;
  filteredPersonal = filterPersonal(query);
  highlightedIndex = filteredPersonal.length ? 0 : -1;
  if (!filteredPersonal.length) {
    dropdown.innerHTML = `<div class="multiselect-empty">${allPersonal.length ? 'No se encontró personal con ese nombre.' : 'No hay personal registrado.'}</div>`;
  } else {
    dropdown.innerHTML = filteredPersonal.map((p, idx) => {
      const name = getFullName(p) || 'Sin nombre';
      const sub = [p.cargo, p.numero_trabajador ? `Núm. ${p.numero_trabajador}` : ''].filter(Boolean).join(' • ');
      return `<div class="multiselect-item ${idx === 0 ? 'active' : ''}" data-index="${idx}" data-id="${esc(p.id)}">
        <div class="multiselect-item-name">${esc(name)}</div>
        ${sub ? `<div class="multiselect-item-sub">${esc(sub)}</div>` : ''}
      </div>`;
    }).join('');
    dropdown.querySelectorAll('.multiselect-item').forEach((item) => {
      item.onclick = (e) => {
        e.stopPropagation();
        addChip(item.dataset.id);
      };
    });
  }
  dropdown.classList.remove('hidden');
}

function closeDropdown() {
  highlightedIndex = -1;
  filteredPersonal = [];
  $('atendioDropdown')?.classList.add('hidden');
}

function addChip(id) {
  if (!id || selectedPersonalIds.includes(id)) {
    closeDropdown();
    return;
  }
  selectedPersonalIds.push(id);
  renderChips();
  const input = $('atendioSearchInput');
  if (input) input.value = '';
  closeDropdown();
  input?.focus();
}

function initPersonal() {
  const container = $('atendioContainer');
  const box = $('atendioChipsBox');
  const input = $('atendioSearchInput');
  if (!container || !box || !input) return;
  input.addEventListener('focus', () => openDropdown(input.value));
  input.addEventListener('input', () => openDropdown(input.value));
  input.addEventListener('keydown', (e) => {
    const open = !$('atendioDropdown')?.classList.contains('hidden');
    if (e.key === 'Enter' && open && filteredPersonal[highlightedIndex]) {
      e.preventDefault();
      addChip(filteredPersonal[highlightedIndex].id);
    } else if (e.key === 'Escape') {
      closeDropdown();
    } else if (e.key === 'Backspace' && input.value === '' && selectedPersonalIds.length) {
      selectedPersonalIds.pop();
      renderChips();
    }
  });
  box.addEventListener('click', (e) => {
    if (!e.target.closest('.multiselect-chip-remove')) input.focus();
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closeDropdown();
  });
}

function fillFromRecord(row) {
  folioInicial = row.folio || folioInicial;
  $('folio').value = folioInicial;
  $('folio').readOnly = true;
  $('fecha').value = row.fecha || openedFecha;
  $('hora').value = (row.hora || '').slice(0, 5);
  $('descripcion').value = row.descripcion || '';
  $('lat').value = row.lat != null ? row.lat : '';
  $('lon').value = row.lon != null ? row.lon : '';
  $('alt').value = row.alt || '';
  $('geoLink').value = row.mapsUrl || '';
  selectedPersonalIds = String(row.atendio || '').split(',').map((s) => s.trim()).filter(Boolean);
  renderChips();
  fotoRefs = [row.fotoRefs?.[0] || null, row.fotoRefs?.[1] || null];
  fotos = [row.fotos?.[0] || null, row.fotos?.[1] || null];
  drawDrops();
  updateGeoPreview();
}

async function onSubmit(e) {
  e.preventDefault();
  if (saving) return;
  const folio = ($('folio').value || '').trim();
  if (!folio) {
    showToast('error', 'El folio del reporte es necesario para guardar la atención.');
    return;
  }

  const lat = parseFloat($('lat').value);
  const lon = parseFloat($('lon').value);
  const hasCoords = !Number.isNaN(lat) && !Number.isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  let mapsUrl = '';
  if (hasCoords) mapsUrl = `https://www.google.com/maps?q=${Number(lat.toFixed(6))},${Number(lon.toFixed(6))}`;
  else {
    const parsed = parseMapsInput($('geoLink').value.trim());
    mapsUrl = parsed?.qrUrl || $('geoLink').value.trim();
  }

  saving = true;
  $('btnSave').disabled = true;
  try {
    await saveAtencion({
      id: editId || undefined,
      folio,
      fecha: $('fecha').value || openedFecha,
      hora: $('hora').value || openedHora,
      descripcion: normalizeFinal($('descripcion').value),
      lat: hasCoords ? Number(lat.toFixed(6)) : null,
      lon: hasCoords ? Number(lon.toFixed(6)) : null,
      alt: normalizeFinal($('alt').value),
      mapsUrl,
      atendio: $('atendio').value,
      fotos: [fotoRefs[0] || fotos[0], fotoRefs[1] || fotos[1]],
    });
    showToast('success', editId ? 'Atención actualizada correctamente' : 'Atención agregada correctamente');
    setTimeout(() => {
      window.location.href = listUrl();
    }, 700);
  } catch (err) {
    console.error('Error al guardar la atención:', err);
    showToast('error', 'No se pudo guardar la atención.');
    saving = false;
    $('btnSave').disabled = false;
  }
}

function initSidebar() {
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
}

window.addEventListener('paste', async (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const items = (e.clipboardData || window.clipboardData)?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.indexOf('image') === 0) {
      const emptyIdx = fotos[0] === null ? 0 : (fotos[1] === null ? 1 : 0);
      fotos[emptyIdx] = await readImg(item.getAsFile());
      fotoRefs[emptyIdx] = null;
      drawDrops();
      break;
    }
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  $('fecha').value = openedFecha;
  $('hora').value = openedHora;
  $('folio').value = folioInicial;
  $('folio').readOnly = Boolean(folioInicial);
  if (!folioInicial) $('folio').readOnly = false;
  $('btnVolver').href = folioInicial ? listUrl() : 'registros-reportes.html';
  drawDrops();
  updateGeoPreview();
  initSidebar();
  initPersonal();
  attachInputNormalizers(document);

  $('form').addEventListener('submit', onSubmit);
  $('btnCancel').addEventListener('click', () => {
    window.location.href = folioInicial || $('folio').value ? listUrl() : 'registros-reportes.html';
  });
  $('btnObtenerGeo').addEventListener('click', obtenerCoordenadasDelLink);
  $('geoLink').addEventListener('input', updateGeoPreview);
  $('lat').addEventListener('input', updateGeoPreview);
  $('lon').addEventListener('input', updateGeoPreview);
  $('toastClose')?.addEventListener('click', () => $('toastNotification')?.classList.add('hidden'));

  try {
    await initDatabase();
    allPersonal = await getAllPersonal();
  } catch (err) {
    console.error('No se pudo abrir la base de datos:', err);
    allPersonal = [];
  }

  if (editId) {
    try {
      const row = await getAtencionById(editId);
      if (!row) {
        showToast('error', 'No se encontró la atención que se quiere editar.');
      } else {
        $('pageTitle').textContent = 'Editar atención';
        $('formTitle').textContent = `Atención ${String(row.numero).padStart(2, '0')}`;
        $('btnSave').textContent = 'Guardar cambios';
        fillFromRecord(row);
        refreshAdminDelete();
        $('btnVolver').href = listUrl();
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'No se pudo cargar la atención.');
    }
  }
});
