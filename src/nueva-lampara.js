/**
 * ============================================================================
 * NUEVA INSTALACIÓN DE LÁMPARA LED — FORMULARIO (nueva-lampara.js)
 * ============================================================================
 * Mismo diseño y comportamiento que el formulario de evidencia (index.html),
 * adaptado para los campos de instalación de lámparas LED.
 * Reutiliza cálculo automático de latitud/longitud desde enlaces de Maps,
 * código QR en tiempo real, selección múltiple de personal con chips,
 * y compresión de evidencias fotográficas.
 * ============================================================================
 */

import {
  initDatabase,
  generateUUID,
  saveLamparaInstalada,
  getLamparaInstaladaById,
  getAllPersonal,
  getFullName,
} from './db.js';

import { attachInputNormalizers, normalizeFinal } from './normalizer.js';
import { parseMapsInput, generateQrDataUrl } from './geo-utils.js';

const $ = (id) => document.getElementById(id);

const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const nowTime = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

let fotos = [null, null];
let toastTimeout = null;
let editingId = null;

// Catálogo de personal y multiselect
let allPersonal = [];
let selectedInstaladorIds = [];
let multiselectHighlightIndex = -1;
let currentFilteredInstaladores = [];

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
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 4500);
}

$('toastClose')?.addEventListener('click', () => {
  if (toastTimeout) clearTimeout(toastTimeout);
  $('toastNotification')?.classList.add('hidden');
});

/* --------------------------------------------------------------------------
   Compresión y Zonas de Carga de Fotografías (Idéntico a evidencias)
   -------------------------------------------------------------------------- */
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
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function drawDrops() {
  const labels = ['Foto 1 (Antes / Ubicación)', 'Foto 2 (Lámpara LED instalada)'];
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
           <div class="drop-hint">Haz clic, arrastra o presiona Ctrl+V</div>`
    }
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

    el.onpaste = async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const blob = item.getAsFile();
          fotos[i] = await readImg(blob);
          drawDrops();
          break;
        }
      }
    };
  });

  dropsEl.querySelectorAll('.btn-remove-photo').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      fotos[+btn.dataset.x] = null;
      drawDrops();
    };
  });
}

async function addFiles(files, startIdx) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  for (let k = 0; k < list.length && (startIdx + k) < 2; k++) {
    fotos[startIdx + k] = await readImg(list[k]);
  }
  drawDrops();
}

window.addEventListener('paste', async (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const items = (e.clipboardData || window.clipboardData).items;
  for (const item of items) {
    if (item.type.indexOf('image') === 0) {
      const blob = item.getAsFile();
      const emptyIdx = fotos[0] === null ? 0 : (fotos[1] === null ? 1 : 0);
      fotos[emptyIdx] = await readImg(blob);
      drawDrops();
      break;
    }
  }
});

/* --------------------------------------------------------------------------
   Geolocalización y Código QR (Reutilizando la misma función exacta de evidencias)
   -------------------------------------------------------------------------- */
function updateGeoPreview() {
  const msgEl = $('geoMsg');
  const previewBox = $('formQrPreview');
  const previewImg = $('formQrImg');
  const previewUrl = $('formQrUrlPreview');

  const latVal = parseFloat($('lat').value);
  const lonVal = parseFloat($('lon').value);
  const hasManualCoords = !isNaN(latVal) && !isNaN(lonVal) && Math.abs(latVal) <= 90 && Math.abs(lonVal) <= 180;

  const geoText = $('geoLink').value.trim();
  const parsed = parseMapsInput(geoText);

  let targetUrl = '';

  if (hasManualCoords) {
    targetUrl = `https://www.google.com/maps?q=${Number(latVal.toFixed(6))},${Number(lonVal.toFixed(6))}`;
    msgEl.className = 'geo-hint-badge ok';
    msgEl.textContent = `Coordenadas válidas: Latitud ${latVal.toFixed(6)}, Longitud ${lonVal.toFixed(6)}`;
  } else if (parsed && parsed.qrUrl) {
    targetUrl = parsed.qrUrl;
    if (parsed.lat !== null && parsed.lon !== null) {
      msgEl.className = 'geo-hint-badge ok';
      msgEl.textContent = `Ubicación identificada: Latitud ${parsed.lat}, Longitud ${parsed.lon}`;
    } else {
      msgEl.className = 'geo-hint-badge';
      msgEl.textContent = 'Enlace reconocido. Presiona «Calcular» para extraer latitud y longitud.';
    }
  } else if (!geoText) {
    msgEl.className = 'geo-hint-badge';
    msgEl.textContent = 'Pega el enlace de Google Maps y presiona «Calcular» para extraer latitud y longitud automáticamente.';
    previewBox.classList.add('hidden');
    return;
  } else {
    msgEl.className = 'geo-hint-badge warn';
    msgEl.textContent = 'No se reconocieron coordenadas válidas. Puedes ingresarlas directamente en Latitud y Longitud.';
    previewBox.classList.add('hidden');
    return;
  }

  if (targetUrl) {
    const qrData = generateQrDataUrl(targetUrl);
    if (qrData) {
      previewBox.classList.remove('hidden');
      previewImg.innerHTML = `<img src="${qrData}" alt="QR">`;
      previewUrl.textContent = targetUrl;
    } else {
      previewBox.classList.add('hidden');
    }
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
    msgEl.textContent = 'Por favor ingresa o pega primero un enlace de Google Maps o coordenadas.';
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
    msgEl.textContent = `Coordenadas calculadas: Latitud ${parsed.lat}, Longitud ${parsed.lon}`;
    return;
  }

  if (parsed && parsed.isShort) {
    btn.disabled = true;
    btn.textContent = 'Calculando...';
    msgEl.className = 'geo-hint-badge';
    msgEl.textContent = 'Consultando enlace corto...';

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
        const subParsed = parseMapsInput(resolvedUrl) || parseMapsInput(contents);

        if (subParsed && subParsed.lat !== null && subParsed.lon !== null) {
          $('lat').value = subParsed.lat;
          $('lon').value = subParsed.lon;
          if (subParsed.alt && !$('alt').value) $('alt').value = subParsed.alt;
          updateGeoPreview();
          msgEl.className = 'geo-hint-badge ok';
          msgEl.textContent = `Coordenadas calculadas: Latitud ${subParsed.lat}, Longitud ${subParsed.lon}`;
          resolved = true;
        }
      }
    } catch (err) {
      console.warn('No se pudo resolver enlace corto automáticamente:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Calcular';
    }

    if (!resolved) {
      updateGeoPreview();
      msgEl.className = 'geo-hint-badge warn';
      msgEl.textContent = 'Enlace corto: ábrelo en navegador y copia la URL completa, o ingresa Latitud y Longitud manualmente.';
    }
    return;
  }

  updateGeoPreview();
  msgEl.className = 'geo-hint-badge warn';
  msgEl.textContent = 'No se encontraron coordenadas en el enlace. Puedes ingresarlas manualmente.';
}

/* --------------------------------------------------------------------------
   Multiselect: Personal que la instaló (Idéntico a evidencias con chips)
   -------------------------------------------------------------------------- */
function renderChips() {
  const box = $('instaladorChipsBox');
  const input = $('instaladorSearchInput');
  const hiddenInput = $('personalInstalo');
  if (!box || !input) return;

  box.querySelectorAll('.multiselect-chip').forEach((c) => c.remove());

  selectedInstaladorIds.forEach((id) => {
    const p = allPersonal.find((item) => item.id === id);
    const name = p ? getFullName(p) : id;

    const chip = document.createElement('span');
    chip.className = 'multiselect-chip';
    chip.dataset.id = id;

    const textSpan = document.createElement('span');
    textSpan.className = 'multiselect-chip-text';
    textSpan.textContent = name;
    textSpan.title = name;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'multiselect-chip-remove';
    removeBtn.setAttribute('aria-label', `Quitar ${name}`);
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeInstaladorChip(id);
    };

    chip.appendChild(textSpan);
    chip.appendChild(removeBtn);
    box.insertBefore(chip, input);
  });

  if (hiddenInput) {
    hiddenInput.value = selectedInstaladorIds.join(',');
  }
}

function removeInstaladorChip(id) {
  selectedInstaladorIds = selectedInstaladorIds.filter((item) => item !== id);
  renderChips();
  $('instaladorSearchInput')?.focus();
}

function addInstaladorChip(id) {
  if (!id) return;
  if (!selectedInstaladorIds.includes(id)) {
    selectedInstaladorIds.push(id);
    renderChips();
  }
  const input = $('instaladorSearchInput');
  if (input) input.value = '';
  closeInstaladorDropdown();
  input?.focus();
}

function filterPersonalList(query) {
  const q = (query || '').trim().toLowerCase();
  const available = allPersonal.filter((p) => !selectedInstaladorIds.includes(p.id));

  if (!q) {
    return available.filter((p) => (p.estatus || 'Activo') === 'Activo').slice(0, 15);
  }

  return available.filter((p) => {
    const full = getFullName(p).toLowerCase();
    const cargo = (p.cargo || '').toLowerCase();
    const numT = (p.numero_trabajador || '').toLowerCase();
    return full.includes(q) || cargo.includes(q) || numT.includes(q);
  });
}

function openInstaladorDropdown(query = '') {
  const dropdown = $('instaladorDropdown');
  if (!dropdown) return;

  currentFilteredInstaladores = filterPersonalList(query);
  multiselectHighlightIndex = currentFilteredInstaladores.length > 0 ? 0 : -1;

  if (currentFilteredInstaladores.length === 0) {
    const hasAny = allPersonal.length > 0;
    dropdown.innerHTML = `
      <div class="multiselect-empty">
        ${hasAny ? 'No se encontró personal con ese nombre.' : 'No hay personal registrado en la plantilla.'}
      </div>
    `;
  } else {
    dropdown.innerHTML = currentFilteredInstaladores.map((p, idx) => {
      const name = getFullName(p) || 'Sin nombre';
      const cargo = p.cargo ? esc(p.cargo) : '';
      const numT = p.numero_trabajador ? `Núm. ${esc(p.numero_trabajador)}` : '';
      const subParts = [cargo, numT].filter(Boolean).join(' • ');

      return `
        <div class="multiselect-item ${idx === 0 ? 'active' : ''}" data-index="${idx}" data-id="${esc(p.id)}">
          <div class="multiselect-item-name">${esc(name)}</div>
          ${subParts ? `<div class="multiselect-item-sub">${subParts}</div>` : ''}
        </div>
      `;
    }).join('');

    dropdown.querySelectorAll('.multiselect-item').forEach((item) => {
      item.onclick = (e) => {
        e.stopPropagation();
        addInstaladorChip(item.dataset.id);
      };
      item.onmouseenter = () => {
        setHighlightedIndex(Number(item.dataset.index));
      };
    });
  }

  dropdown.classList.remove('hidden');
}

function closeInstaladorDropdown() {
  multiselectHighlightIndex = -1;
  currentFilteredInstaladores = [];
  $('instaladorDropdown')?.classList.add('hidden');
}

function setHighlightedIndex(index) {
  multiselectHighlightIndex = index;
  const dropdown = $('instaladorDropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.multiselect-item');
  items.forEach((item, idx) => {
    if (idx === multiselectHighlightIndex) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

function initInstaladorMultiSelect() {
  const container = $('instaladorContainer');
  const box = $('instaladorChipsBox');
  const input = $('instaladorSearchInput');
  const dropdown = $('instaladorDropdown');

  if (!container || !box || !input || !dropdown) return;

  input.addEventListener('focus', () => {
    openInstaladorDropdown(input.value);
  });

  input.addEventListener('input', () => {
    openInstaladorDropdown(input.value);
  });

  input.addEventListener('keydown', (e) => {
    const isDropdownOpen = !dropdown.classList.contains('hidden');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen) {
        openInstaladorDropdown(input.value);
      } else if (currentFilteredInstaladores.length > 0) {
        const nextIndex = (multiselectHighlightIndex + 1) % currentFilteredInstaladores.length;
        setHighlightedIndex(nextIndex);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isDropdownOpen && currentFilteredInstaladores.length > 0) {
        const prevIndex = (multiselectHighlightIndex - 1 + currentFilteredInstaladores.length) % currentFilteredInstaladores.length;
        setHighlightedIndex(prevIndex);
      }
      return;
    }

    if (e.key === 'Enter') {
      if (isDropdownOpen && multiselectHighlightIndex >= 0 && currentFilteredInstaladores[multiselectHighlightIndex]) {
        e.preventDefault();
        e.stopPropagation();
        addInstaladorChip(currentFilteredInstaladores[multiselectHighlightIndex].id);
        return;
      }
      if (isDropdownOpen) {
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Backspace' && input.value === '') {
      if (selectedInstaladorIds.length > 0) {
        selectedInstaladorIds.pop();
        renderChips();
        if (isDropdownOpen) {
          openInstaladorDropdown(input.value);
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      closeInstaladorDropdown();
      return;
    }
  });

  box.addEventListener('click', (e) => {
    if (e.target !== input && !e.target.closest('.multiselect-chip-remove')) {
      input.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      closeInstaladorDropdown();
    }
  });
}

/* --------------------------------------------------------------------------
   Operaciones de Formulario (Guardar, Limpiar, Edición)
   -------------------------------------------------------------------------- */
function resolveTipoLampara() {
  const sel = $('tipoLampara') ? $('tipoLampara').value : 'LED';
  if (sel !== 'Otro') return sel;
  const espec = normalizeFinal($('otroTipo')?.value || '');
  return espec ? `Otro(${espec})` : 'Otro';
}

function resetForm() {
  $('formLampara').reset();
  $('fecha').value = today();
  $('hora').value = nowTime();
  if ($('tipoLampara')) $('tipoLampara').value = 'LED';
  $('wrapOtroTipo')?.classList.add('hidden');
  if ($('otroTipo')) $('otroTipo').value = '';

  selectedInstaladorIds = [];
  renderChips();

  $('lat').value = '';
  $('lon').value = '';
  $('alt').value = '';
  $('geoLink').value = '';

  fotos = [null, null];
  drawDrops();
  updateGeoPreview();

  editingId = null;
  $('formTitle').textContent = 'Nueva Instalación de Lámpara LED';
  $('pageTitle').textContent = 'Ingreso de Instalación de Lámpara LED';
  $('btnSave').textContent = 'Guardar instalación';
  $('btnCancel')?.classList.add('hidden');
  $('folio')?.focus();
}

function fillForm(row) {
  editingId = row.id;
  $('folio').value = row.folio || '';
  $('fecha').value = row.fecha || today();
  $('hora').value = row.hora || nowTime();
  $('ubicacion').value = row.ubicacion || '';
  $('observaciones').value = row.observaciones || '';
  $('lat').value = row.latitud != null ? row.latitud : '';
  $('lon').value = row.longitud != null ? row.longitud : '';
  $('alt').value = row.altitud || '';
  $('geoLink').value = row.enlace_maps || '';

  // Tipo de lámpara
  const rawTipo = String(row.tipo_lampara || 'LED').trim();
  const mOtro = rawTipo.match(/^Otro\s*\((.*)\)\s*$/i);
  if (mOtro) {
    $('tipoLampara').value = 'Otro';
    $('wrapOtroTipo')?.classList.remove('hidden');
    $('otroTipo').value = mOtro[1].trim();
  } else {
    const match = [...$('tipoLampara').options].find((opt) => opt.value.toLowerCase() === rawTipo.toLowerCase());
    $('tipoLampara').value = match ? match.value : 'Otro';
    if (!match && rawTipo) {
      $('wrapOtroTipo')?.classList.remove('hidden');
      $('otroTipo').value = rawTipo;
    } else {
      $('wrapOtroTipo')?.classList.add('hidden');
      $('otroTipo').value = '';
    }
  }

  // Personal que la instaló
  selectedInstaladorIds = (row.personal_instalo || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  renderChips();

  // Fotos
  fotos = [row.foto1 || null, row.foto2 || null];
  drawDrops();
  updateGeoPreview();

  $('formTitle').textContent = 'Editar Instalación de Lámpara LED';
  $('pageTitle').textContent = 'Editar Instalación de Lámpara LED';
  $('btnSave').textContent = 'Guardar cambios';
  $('btnCancel')?.classList.remove('hidden');
}

// Envío del formulario
$('formLampara').onsubmit = async (e) => {
  e.preventDefault();

  const fechaVal = $('fecha').value.trim();
  if (!fechaVal) {
    showToast('error', 'Por favor selecciona la fecha de instalación.');
    $('fecha').focus();
    return;
  }

  const ubicacionVal = normalizeFinal($('ubicacion').value);
  if (!ubicacionVal) {
    showToast('error', 'Por favor ingresa la ubicación o domicilio.');
    $('ubicacion').focus();
    return;
  }

  const geoText = $('geoLink').value.trim();
  const parsed = parseMapsInput(geoText);

  let finalLat = null;
  let finalLon = null;
  let finalAlt = $('alt').value.trim();
  let finalMapsUrl = '';

  const manualLat = parseFloat($('lat').value);
  const manualLon = parseFloat($('lon').value);
  const hasManualCoords = !isNaN(manualLat) && !isNaN(manualLon) && Math.abs(manualLat) <= 90 && Math.abs(manualLon) <= 180;

  if (hasManualCoords) {
    finalLat = Number(manualLat.toFixed(6));
    finalLon = Number(manualLon.toFixed(6));
    finalMapsUrl = `https://www.google.com/maps?q=${finalLat},${finalLon}`;
  } else if (parsed && parsed.lat !== null && parsed.lon !== null) {
    finalLat = parsed.lat;
    finalLon = parsed.lon;
    finalMapsUrl = parsed.qrUrl || `https://www.google.com/maps?q=${finalLat},${finalLon}`;
  } else if (parsed && parsed.qrUrl) {
    finalMapsUrl = parsed.qrUrl;
  }

  if (parsed && parsed.alt && !finalAlt) {
    finalAlt = parsed.alt;
  }

  const isEditing = Boolean(editingId);
  const payload = {
    id: editingId || generateUUID(),
    folio: normalizeFinal($('folio').value),
    fecha: fechaVal,
    hora: $('hora').value.trim() || nowTime(),
    tipo_lampara: resolveTipoLampara(),
    ubicacion: ubicacionVal,
    latitud: finalLat,
    longitud: finalLon,
    altitud: finalAlt,
    enlace_maps: finalMapsUrl,
    observaciones: normalizeFinal($('observaciones').value),
    foto1: fotos[0] || null,
    foto2: fotos[1] || null,
    personal_instalo: $('personalInstalo').value,
  };

  try {
    await saveLamparaInstalada(payload);
    showToast('success', isEditing ? 'Instalación actualizada correctamente' : 'Instalación registrada correctamente');

    if (isEditing) {
      setTimeout(() => {
        window.location.href = 'lamparas-instaladas.html';
      }, 1000);
    } else {
      resetForm();
    }
  } catch (err) {
    console.error('Error al guardar instalación:', err);
    showToast('error', 'Ocurrió un error al guardar la instalación');
  }
};

/* --------------------------------------------------------------------------
   Eventos y Listeners
   -------------------------------------------------------------------------- */
$('btnResetForm')?.addEventListener('click', resetForm);
$('btnCancel')?.addEventListener('click', () => {
  window.location.href = 'lamparas-instaladas.html';
});

$('tipoLampara')?.addEventListener('change', () => {
  if ($('tipoLampara').value === 'Otro') {
    $('wrapOtroTipo')?.classList.remove('hidden');
    $('otroTipo')?.focus();
  } else {
    $('wrapOtroTipo')?.classList.add('hidden');
    if ($('otroTipo')) $('otroTipo').value = '';
  }
});

// Eventos de geolocalización (botón "Calcular" e inputs)
$('btnObtenerGeo')?.addEventListener('click', obtenerCoordenadasDelLink);

$('geoLink')?.addEventListener('input', () => {
  const geoText = $('geoLink').value.trim();
  const parsed = parseMapsInput(geoText);
  if (parsed && parsed.lat !== null && parsed.lon !== null) {
    $('lat').value = parsed.lat;
    $('lon').value = parsed.lon;
    if (parsed.alt && !$('alt').value) $('alt').value = parsed.alt;
  }
  updateGeoPreview();
});

$('lat')?.addEventListener('input', updateGeoPreview);
$('lon')?.addEventListener('input', updateGeoPreview);

/* --------------------------------------------------------------------------
   Inicialización de la Página
   -------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al inicializar base de datos:', err);
  }

  // Cargar plantilla de personal para el multiselect
  try {
    allPersonal = await getAllPersonal();
  } catch (err) {
    console.warn('Error al cargar personal:', err);
    allPersonal = [];
  }

  initInstaladorMultiSelect();
  resetForm();
  attachInputNormalizers(document);

  // Carga para edición si proviene con parámetro ?edit=UUID
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    try {
      const item = await getLamparaInstaladaById(editId);
      if (item) {
        fillForm(item);
        showToast('success', 'Registro cargado para edición.');
      }
    } catch (err) {
      console.error('Error al cargar instalación para edición:', err);
    }
  }

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

