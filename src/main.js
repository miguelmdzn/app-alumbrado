/**
 * BITÁCORA DIARIA DE REPORTES - INGRESO DE EVIDENCIAS
 * Formulario de captura y geolocalización
 */

import {
  initDatabase,
  saveEvidencia,
  getEvidenciaById,
  saveMetadatos,
  loadMetadatos,
  generateUUID,
  getAllPersonal,
  getFullName,
} from './db.js';

import {
  attachInputNormalizers,
  normalizeFinal,
} from './normalizer.js';

// Utilidades para acceso a elementos y saneamiento
const $ = (id) => document.getElementById(id);

const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

// Estado del formulario y metadatos
let metaState = {
  fecha: today(),
  area: 'Alumbrado Público',
  elab: '',
  reviso: ''
};

let fotos = [null, null];
let toastTimeout = null;
let editingEvidenciaId = null;

/* --------------------------------------------------------------------------
   Notificaciones Toast ("Evidencia agregada correctamente" / "Ocurrió un error")
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

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

$('toastClose')?.addEventListener('click', () => {
  if (toastTimeout) clearTimeout(toastTimeout);
  $('toastNotification')?.classList.add('hidden');
});

/* --------------------------------------------------------------------------
   Compresión y Procesamiento de Fotografías
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
  const labels = ['Foto 1 (Evidencia inicial)', 'Foto 2 (Trabajo realizado)'];
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
   Analizador de Enlaces de Google Maps y Coordenadas
   -------------------------------------------------------------------------- */
function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

function parseMapsInput(text) {
  text = (text || '').trim();
  if (!text) return null;

  const decoded = safeDecode(text);
  let lat = null, lon = null, alt = null;

  // Altitud
  const altTextMatch = decoded.match(/[,;\s](?:alt(?:itud)?:?\s*)?(\d+(?:\.\d+)?)\s*(?:m(?:snm)?|metros)\b/i) ||
    decoded.match(/@[-0-9.,]+,(\d+(?:\.\d+)?)[ma]\b/i);
  if (altTextMatch) {
    alt = `${parseFloat(altTextMatch[1]).toLocaleString('es-MX')} msnm`;
  }

  // 1. Patrón data !3dlat y !4dlon
  const m3d = decoded.match(/!3d(-?\d+(?:\.\d+)?)/);
  const m4d = decoded.match(/!4d(-?\d+(?:\.\d+)?)/);
  if (m3d && m4d) {
    lat = parseFloat(m3d[1]);
    lon = parseFloat(m4d[1]);
  }

  // 2. Patrón @lat,lon
  if (lat === null) {
    const m = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (m) {
      lat = parseFloat(m[1]);
      lon = parseFloat(m[2]);
    }
  }

  // 3. Parámetros query (q, query, ll, center)
  if (lat === null) {
    const m = decoded.match(/[?&](?:q|query|ll|saddr|daddr|center|point)=(?:loc:)?\s*(-?\d+(?:\.\d+)?)(?:[,\s+]|%20)+(-?\d+(?:\.\d+)?)/i);
    if (m) {
      lat = parseFloat(m[1]);
      lon = parseFloat(m[2]);
    }
  }

  // 4. OpenStreetMap mlat / mlon
  if (lat === null) {
    const mlat = decoded.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/i);
    const mlon = decoded.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/i);
    if (mlat && mlon) {
      lat = parseFloat(mlat[1]);
      lon = parseFloat(mlon[1]);
    }
  }

  // 5. Rutas directas /place/lat,lon o /search/lat,lon
  if (lat === null) {
    const m = decoded.match(/\/(?:search|place|dir|maps)\/(?:[^\/]+\/)?(-?\d+(?:\.\d+)?)(?:[,\s+]|%20)+(-?\d+(?:\.\d+)?)/i);
    if (m) {
      lat = parseFloat(m[1]);
      lon = parseFloat(m[2]);
    }
  }

  // 6. Formato geo: URI
  if (lat === null) {
    const m = decoded.match(/geo:\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i);
    if (m) {
      lat = parseFloat(m[1]);
      lon = parseFloat(m[2]);
    }
  }

  // 7. Coordenadas DMS
  if (lat === null) {
    const dmsRegex = /(\d{1,2})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([NSns])\s*[,;\s]\s*(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([EOWeow])/;
    const m = decoded.match(dmsRegex);
    if (m) {
      const latDeg = (+m[1]) + (+m[2] / 60) + (+m[3] / 3600);
      lat = (m[4].toUpperCase() === 'S' ? -1 : 1) * latDeg;
      const lonDeg = (+m[5]) + (+m[6] / 60) + (+m[7] / 3600);
      lon = (['W', 'O'].includes(m[8].toUpperCase()) ? -1 : 1) * lonDeg;
    }
  }

  // 8. Coordenadas decimales simples
  if (lat === null) {
    const m = decoded.match(/(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);
    if (m) {
      lat = parseFloat(m[1]);
      lon = parseFloat(m[2]);
    }
  }

  const validCoords = (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
  if (validCoords) {
    lat = Number(lat.toFixed(6));
    lon = Number(lon.toFixed(6));
  } else {
    lat = null;
    lon = null;
  }

  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
  const cleanUrl = urlMatch ? urlMatch[0] : '';
  const isShort = /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text);

  let qrUrl = '';
  if (cleanUrl) {
    qrUrl = cleanUrl;
  } else if (validCoords) {
    qrUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  }

  return {
    raw: text,
    url: cleanUrl,
    isShort,
    isUrl: !!cleanUrl,
    lat,
    lon,
    alt,
    qrUrl
  };
}

/* --------------------------------------------------------------------------
   Generación de Códigos QR
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
      console.warn('Error al generar código QR:', err);
      return '';
    }
  }
}

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
      msgEl.textContent = 'Enlace reconocido. Presiona «Obtener» para extraer latitud y longitud.';
    }
  } else if (!geoText) {
    msgEl.className = 'geo-hint-badge';
    msgEl.textContent = 'Pega el enlace de Google Maps y presiona «Obtener» para extraer latitud y longitud.';
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
    msgEl.textContent = `Coordenadas obtenidas: Latitud ${parsed.lat}, Longitud ${parsed.lon}`;
    return;
  }

  if (parsed && parsed.isShort) {
    btn.disabled = true;
    btn.textContent = 'Obteniendo...';
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
          msgEl.textContent = `Coordenadas obtenidas: Latitud ${subParsed.lat}, Longitud ${subParsed.lon}`;
          resolved = true;
        }
      }
    } catch (err) {
      console.warn('No se pudo resolver enlace corto automáticamente:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Obtener';
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

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

/* --------------------------------------------------------------------------
   Catálogo de Personal y Autocomplete Multi-Select con Chips
   -------------------------------------------------------------------------- */
let allPersonal = [];
let selectedPersonalIds = [];
let multiselectHighlightedIndex = -1;
let currentFilteredPersonal = [];

function renderChips() {
  const box = $('atendioChipsBox');
  const input = $('atendioSearchInput');
  const hiddenInput = $('atendio');
  if (!box || !input) return;

  // Eliminar chips existentes
  const oldChips = box.querySelectorAll('.multiselect-chip');
  oldChips.forEach((c) => c.remove());

  // Insertar cada chip antes del input
  selectedPersonalIds.forEach((id) => {
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
      removePersonalChip(id);
    };

    chip.appendChild(textSpan);
    chip.appendChild(removeBtn);

    box.insertBefore(chip, input);
  });

  if (hiddenInput) {
    hiddenInput.value = selectedPersonalIds.join(',');
  }
}

function removePersonalChip(id) {
  selectedPersonalIds = selectedPersonalIds.filter((item) => item !== id);
  renderChips();
  $('atendioSearchInput')?.focus();
}

function addPersonalChip(id) {
  if (!id) return;
  if (!selectedPersonalIds.includes(id)) {
    selectedPersonalIds.push(id);
    renderChips();
  }
  const input = $('atendioSearchInput');
  if (input) input.value = '';
  closeAtendioDropdown();
  input?.focus();
}

function filterPersonalList(query) {
  const q = (query || '').trim().toLowerCase();
  const available = allPersonal.filter((p) => !selectedPersonalIds.includes(p.id));

  if (!q) {
    return available.filter((p) => (p.estatus || 'Activo') === 'Activo').slice(0, 15);
  }

  return available.filter((p) => {
    const full = getFullName(p).toLowerCase();
    const cargo = (p.cargo || '').toLowerCase();
    const numT = (p.numero_trabajador || '').toLowerCase();
    const numC = (p.numero_checador_digital || '').toLowerCase();
    return full.includes(q) || cargo.includes(q) || numT.includes(q) || numC.includes(q);
  });
}

function openAtendioDropdown(query = '') {
  const dropdown = $('atendioDropdown');
  if (!dropdown) return;

  currentFilteredPersonal = filterPersonalList(query);
  multiselectHighlightedIndex = currentFilteredPersonal.length > 0 ? 0 : -1;

  if (currentFilteredPersonal.length === 0) {
    const hasAny = allPersonal.length > 0;
    dropdown.innerHTML = `
      <div class="multiselect-empty">
        ${hasAny ? 'No se encontró personal con ese nombre.' : 'No hay personal registrado en la plantilla.'}
      </div>
    `;
  } else {
    dropdown.innerHTML = currentFilteredPersonal.map((p, idx) => {
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
        addPersonalChip(item.dataset.id);
      };
      item.onmouseenter = () => {
        setHighlightedIndex(Number(item.dataset.index));
      };
    });
  }

  dropdown.classList.remove('hidden');
}

function closeAtendioDropdown() {
  multiselectHighlightedIndex = -1;
  currentFilteredPersonal = [];
  $('atendioDropdown')?.classList.add('hidden');
}

function setHighlightedIndex(index) {
  multiselectHighlightedIndex = index;
  const dropdown = $('atendioDropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.multiselect-item');
  items.forEach((item, idx) => {
    if (idx === multiselectHighlightedIndex) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

function initAtendioMultiSelect() {
  const container = $('atendioContainer');
  const box = $('atendioChipsBox');
  const input = $('atendioSearchInput');
  const dropdown = $('atendioDropdown');

  if (!container || !box || !input || !dropdown) return;

  input.addEventListener('focus', () => {
    openAtendioDropdown(input.value);
  });

  input.addEventListener('input', () => {
    openAtendioDropdown(input.value);
  });

  input.addEventListener('keydown', (e) => {
    const isDropdownOpen = !dropdown.classList.contains('hidden');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen) {
        openAtendioDropdown(input.value);
      } else if (currentFilteredPersonal.length > 0) {
        const nextIndex = (multiselectHighlightedIndex + 1) % currentFilteredPersonal.length;
        setHighlightedIndex(nextIndex);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isDropdownOpen && currentFilteredPersonal.length > 0) {
        const prevIndex = (multiselectHighlightedIndex - 1 + currentFilteredPersonal.length) % currentFilteredPersonal.length;
        setHighlightedIndex(prevIndex);
      }
      return;
    }

    if (e.key === 'Enter') {
      if (isDropdownOpen && multiselectHighlightedIndex >= 0 && currentFilteredPersonal[multiselectHighlightedIndex]) {
        e.preventDefault();
        e.stopPropagation();
        addPersonalChip(currentFilteredPersonal[multiselectHighlightedIndex].id);
        return;
      }
      if (isDropdownOpen) {
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Backspace' && input.value === '') {
      if (selectedPersonalIds.length > 0) {
        selectedPersonalIds.pop();
        renderChips();
        if (isDropdownOpen) {
          openAtendioDropdown(input.value);
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      closeAtendioDropdown();
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
      closeAtendioDropdown();
    }
  });
}

/* --------------------------------------------------------------------------
   Multiselect: Personal que Instaló (similar al de Atendió)
   -------------------------------------------------------------------------- */
let selectedInstaladorEvidenciaIds = [];
let instaladorHighlightedIndex = -1;
let currentFilteredInstaladores = [];

function renderInstaladorEvidenciaChips() {
  const box = $('instaladorEvidenciaChipsBox');
  const input = $('instaladorEvidenciaSearchInput');
  const hiddenInput = $('personalInstalo');
  if (!box || !input) return;

  box.querySelectorAll('.multiselect-chip').forEach((c) => c.remove());

  selectedInstaladorEvidenciaIds.forEach((id) => {
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
      selectedInstaladorEvidenciaIds = selectedInstaladorEvidenciaIds.filter((item) => item !== id);
      renderInstaladorEvidenciaChips();
      $('instaladorEvidenciaSearchInput')?.focus();
    };

    chip.appendChild(textSpan);
    chip.appendChild(removeBtn);
    box.insertBefore(chip, input);
  });

  if (hiddenInput) {
    hiddenInput.value = selectedInstaladorEvidenciaIds.join(',');
  }
}

function filterInstaladorEvidenciaList(query) {
  const q = (query || '').trim().toLowerCase();
  const available = allPersonal.filter((p) => !selectedInstaladorEvidenciaIds.includes(p.id));
  if (!q) return available.filter((p) => (p.estatus || 'Activo') === 'Activo').slice(0, 15);
  return available.filter((p) => {
    const full = getFullName(p).toLowerCase();
    const cargo = (p.cargo || '').toLowerCase();
    const numT = (p.numero_trabajador || '').toLowerCase();
    return full.includes(q) || cargo.includes(q) || numT.includes(q);
  });
}

function openInstaladorEvidenciaDropdown(query = '') {
  const dropdown = $('instaladorEvidenciaDropdown');
  if (!dropdown) return;

  currentFilteredInstaladores = filterInstaladorEvidenciaList(query);
  instaladorHighlightedIndex = currentFilteredInstaladores.length > 0 ? 0 : -1;

  if (currentFilteredInstaladores.length === 0) {
    dropdown.innerHTML = `<div class="multiselect-empty">${allPersonal.length > 0 ? 'No se encontró personal.' : 'No hay personal registrado.'}</div>`;
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
        addInstaladorEvidenciaChip(item.dataset.id);
      };
      item.onmouseenter = () => {
        instaladorHighlightedIndex = Number(item.dataset.index);
        setInstaladorEvidenciaHighlight(instaladorHighlightedIndex);
      };
    });
  }
  dropdown.classList.remove('hidden');
}

function closeInstaladorEvidenciaDropdown() {
  instaladorHighlightedIndex = -1;
  currentFilteredInstaladores = [];
  $('instaladorEvidenciaDropdown')?.classList.add('hidden');
}

function setInstaladorEvidenciaHighlight(index) {
  instaladorHighlightedIndex = index;
  const dropdown = $('instaladorEvidenciaDropdown');
  if (!dropdown) return;
  dropdown.querySelectorAll('.multiselect-item').forEach((item, idx) => {
    if (idx === instaladorHighlightedIndex) { item.classList.add('active'); item.scrollIntoView({ block: 'nearest' }); }
    else item.classList.remove('active');
  });
}

function addInstaladorEvidenciaChip(id) {
  if (!id || selectedInstaladorEvidenciaIds.includes(id)) return;
  selectedInstaladorEvidenciaIds.push(id);
  renderInstaladorEvidenciaChips();
  const input = $('instaladorEvidenciaSearchInput');
  if (input) input.value = '';
  closeInstaladorEvidenciaDropdown();
  input?.focus();
}

function initInstaladorEvidenciaMultiSelect() {
  const container = $('instaladorEvidenciaContainer');
  const box = $('instaladorEvidenciaChipsBox');
  const input = $('instaladorEvidenciaSearchInput');
  const dropdown = $('instaladorEvidenciaDropdown');
  if (!container || !box || !input || !dropdown) return;

  input.addEventListener('focus', () => openInstaladorEvidenciaDropdown(input.value));
  input.addEventListener('input', () => openInstaladorEvidenciaDropdown(input.value));

  input.addEventListener('keydown', (e) => {
    const isOpen = !dropdown.classList.contains('hidden');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) openInstaladorEvidenciaDropdown(input.value);
      else if (currentFilteredInstaladores.length > 0) setInstaladorEvidenciaHighlight((instaladorHighlightedIndex + 1) % currentFilteredInstaladores.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && currentFilteredInstaladores.length > 0) setInstaladorEvidenciaHighlight((instaladorHighlightedIndex - 1 + currentFilteredInstaladores.length) % currentFilteredInstaladores.length);
      return;
    }
    if (e.key === 'Enter') {
      if (isOpen && instaladorHighlightedIndex >= 0 && currentFilteredInstaladores[instaladorHighlightedIndex]) {
        e.preventDefault(); e.stopPropagation();
        addInstaladorEvidenciaChip(currentFilteredInstaladores[instaladorHighlightedIndex].id);
      } else if (isOpen) e.preventDefault();
      return;
    }
    if (e.key === 'Backspace' && input.value === '') {
      if (selectedInstaladorEvidenciaIds.length > 0) {
        selectedInstaladorEvidenciaIds.pop();
        renderInstaladorEvidenciaChips();
        if (isOpen) openInstaladorEvidenciaDropdown(input.value);
      }
      return;
    }
    if (e.key === 'Escape') { closeInstaladorEvidenciaDropdown(); return; }
  });

  box.addEventListener('click', (e) => {
    if (e.target !== input && !e.target.closest('.multiselect-chip-remove')) input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closeInstaladorEvidenciaDropdown();
  });
}

/* --------------------------------------------------------------------------
   Operaciones de Formulario (Guardar, Limpiar)
   -------------------------------------------------------------------------- */
const FIELDS = ['folio', 'fecha', 'hora', 'estatus', 'solicita', 'atendio', 'turno', 'tipo', 'ubicacion', 'accion'];

function resetForm(preserveHelpers = true) {
  const keptValues = preserveHelpers
    ? {
      solicita: $('solicita').value,
      atendio: $('atendio').value,
      personalInstalo: $('personalInstalo')?.value || '',
      turno: $('turno').value
    }
    : {};

  $('form').reset();
  $('fecha').value = metaState.fecha || today();
  $('solicita').value = keptValues.solicita || '';
  $('atendio').value = keptValues.atendio || '';
  if ($('personalInstalo')) $('personalInstalo').value = keptValues.personalInstalo || '';
  if (keptValues.turno) $('turno').value = keptValues.turno;

  // Restaurar chips de personal que atendió a partir de IDs preservados
  selectedPersonalIds = (keptValues.atendio || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  renderChips();

  // Restaurar chips de personal que instaló a partir de IDs preservados
  selectedInstaladorEvidenciaIds = (keptValues.personalInstalo || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  renderInstaladorEvidenciaChips();

  $('lat').value = '';
  $('lon').value = '';
  $('alt').value = '';
  $('geoLink').value = '';

  fotos = [null, null];

  drawDrops();
  updateGeoPreview();

  editingEvidenciaId = null;
  $('formTitle').textContent = 'Nuevo Reporte de Evidencia';
  $('btnSave').textContent = 'Agregar reporte';
  $('btnCancel').classList.add('hidden');
}

$('form').onsubmit = async (e) => {
  e.preventDefault();

  const folioVal = $('folio').value.trim();
  if (!folioVal) {
    showToast('error', 'Ocurrió un error: por favor ingresa el folio.');
    $('folio').focus();
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

  const isEditing = Boolean(editingEvidenciaId);
  const reportData = {
    id: editingEvidenciaId || generateUUID(),
    lat: finalLat,
    lon: finalLon,
    alt: finalAlt,
    mapsUrl: finalMapsUrl,
    fotos: [...fotos]
  };

  FIELDS.forEach((field) => {
    reportData[field] = normalizeFinal($(field).value);
  });
  // Guardar IDs exactos de los trabajadores seleccionados (sin mutaciones de texto)
  reportData.atendio = $('atendio').value;
  reportData.personalInstalo = $('personalInstalo')?.value || '';

  try {
    // Guardar en la base de datos (SQLite / IndexedDB + carpetas organizadas por fecha)
    await saveEvidencia(reportData);

    // Notificación de éxito requerida
    showToast('success', isEditing ? 'Evidencia actualizada correctamente' : 'Evidencia agregada correctamente');

    if (isEditing) {
      setTimeout(() => {
        window.location.href = 'registros.html';
      }, 1000);
    } else {
      resetForm(true);
      $('folio').focus();
    }
  } catch (err) {
    console.error('Error al guardar evidencia:', err);
    // Notificación de error requerida
    showToast('error', 'Ocurrió un error');
  }
};

$('btnCancel').onclick = () => resetForm(true);

// Sincronización de metadatos generales
[['mFecha', 'fecha'], ['mArea', 'area'], ['mElab', 'elab'], ['mReviso', 'reviso']].forEach(([id, key]) => {
  $(id)?.addEventListener('input', async () => {
    metaState[key] = $(id).value.trim();
    if (key === 'fecha') {
      $('fecha').value = metaState.fecha;
    }
    await saveMetadatos(metaState);
  });
});

// Eventos de geolocalización
$('btnObtenerGeo').addEventListener('click', obtenerCoordenadasDelLink);

$('geoLink').addEventListener('input', () => {
  const geoText = $('geoLink').value.trim();
  const parsed = parseMapsInput(geoText);
  if (parsed && parsed.lat !== null && parsed.lon !== null) {
    $('lat').value = parsed.lat;
    $('lon').value = parsed.lon;
    if (parsed.alt && !$('alt').value) $('alt').value = parsed.alt;
  }
  updateGeoPreview();
});

$('lat').addEventListener('input', updateGeoPreview);
$('lon').addEventListener('input', updateGeoPreview);

/* --------------------------------------------------------------------------
   Inicialización de la aplicación
   -------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al inicializar base de datos:', err);
  }

  const loadedMeta = await loadMetadatos();
  if (loadedMeta) {
    metaState = { ...metaState, ...loadedMeta };
  }

  $('mFecha').value = metaState.fecha || today();
  $('mArea').value = metaState.area || 'Alumbrado Público';
  $('mElab').value = metaState.elab || '';
  $('mReviso').value = metaState.reviso || '';

  // Cargar plantilla de personal para el multiselect
  try {
    allPersonal = await getAllPersonal();
  } catch (err) {
    console.warn('Error al cargar plantilla de personal:', err);
    allPersonal = [];
  }

  initAtendioMultiSelect();
  initInstaladorEvidenciaMultiSelect();
  resetForm(false);
  attachInputNormalizers(document);

  // Carga para edición si proviene con parámetro ?edit=UUID
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    try {
      const ev = await getEvidenciaById(editId);
      if (ev) {
        editingEvidenciaId = ev.id;
        $('formTitle').textContent = 'Editar Reporte de Evidencia';
        $('btnSave').textContent = 'Guardar cambios';
        $('btnCancel').classList.remove('hidden');

        if ($('folio')) $('folio').value = ev.folio || '';
        if ($('fecha')) $('fecha').value = ev.fecha || today();
        if ($('hora')) $('hora').value = ev.hora || '';
        if ($('estatus')) $('estatus').value = ev.estatus || 'Atendido';
        if ($('solicita')) $('solicita').value = ev.solicita || '';
        if ($('turno')) $('turno').value = ev.turno || 'Matutino';
        if ($('tipo')) $('tipo').value = ev.tipo || '';
        if ($('ubicacion')) $('ubicacion').value = ev.ubicacion || '';
        if ($('accion')) $('accion').value = ev.accion || '';
        if ($('lat')) $('lat').value = ev.lat != null ? ev.lat : '';
        if ($('lon')) $('lon').value = ev.lon != null ? ev.lon : '';
        if ($('alt')) $('alt').value = ev.alt || '';
        if ($('geoLink')) $('geoLink').value = ev.mapsUrl || '';

        // Restaurar chips de personal que atendió
        selectedPersonalIds = (ev.atendio || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        renderChips();

        // Restaurar chips de personal que instaló
        selectedInstaladorEvidenciaIds = (ev.personalInstalo || ev.personal_instalo || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        renderInstaladorEvidenciaChips();

        // Fotos
        fotos = [ev.fotos?.[0] || null, ev.fotos?.[1] || null];
        drawDrops();
        updateGeoPreview();

        showToast('success', 'Evidencia cargada para edición.');
        return;
      }
    } catch (err) {
      console.error('Error al cargar evidencia para edición:', err);
    }
  }

  // Autollenado de campos si proviene de un reporte finalizado
  const pFolio = params.get('folio');
  const pTipo = params.get('tipo');
  const pUbicacion = params.get('ubicacion');

  if (pFolio || pTipo || pUbicacion) {
    if (pFolio && $('folio')) $('folio').value = pFolio;
    if (pTipo && $('tipo')) $('tipo').value = pTipo;
    if (pUbicacion && $('ubicacion')) $('ubicacion').value = pUbicacion;
    if ($('estatus')) $('estatus').value = 'Atendido';
    showToast('success', 'Datos del reporte cargados para nueva evidencia.');
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
});
