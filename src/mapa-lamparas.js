/**
 * Mapa interactivo de las lámparas LED instaladas.
 * Cada registro con coordenadas se dibuja al abrir la página.
 */

import { initDatabase, getAllLamparasInstaladas, getAllPersonal, getFullName } from './db.js';
import { parseMapsInput } from './geo-utils.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

const fd = (s) => (s ? s.split('-').reverse().join('/') : '');

let personal = [];
let registros = [];
let mapa = null;
let grupo = null;
const marcadores = new Map();

function nombrePersonal(raw) {
  if (!raw) return '—';
  const tokens = String(raw).split(',').map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return '—';
  return tokens.map((tok) => {
    const p = personal.find((item) => item.id === tok);
    return p ? (getFullName(p) || tok) : tok;
  }).join(', ');
}

function coordenadas(r) {
  const lat = Number(r.latitud);
  const lon = Number(r.longitud);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
    return { lat, lon };
  }
  const parsed = parseMapsInput(r.enlace_maps || '');
  if (parsed?.lat != null && parsed?.lon != null) return { lat: parsed.lat, lon: parsed.lon };
  return null;
}

function coincide(r, q) {
  if (!q) return true;
  const blob = [r.folio, r.tipo_lampara, r.ubicacion, r.observaciones, nombrePersonal(r.personal_instalo)]
    .join(' ')
    .toLowerCase();
  return blob.includes(q);
}

function popupHtml(r, coords) {
  const maps = r.enlace_maps || `https://www.google.com/maps?q=${coords.lat},${coords.lon}`;
  return `
    <div>
      <p class="mapa-popup-folio"><strong>${esc(r.folio || 'S/F')}</strong></p>
      <p>${esc(r.tipo_lampara || 'LED')} · ${esc(fd(r.fecha) || 'Sin fecha')}</p>
      <p>${esc(r.ubicacion || 'Sin ubicación')}</p>
      <p>${esc(nombrePersonal(r.personal_instalo))}</p>
      <p><a href="${esc(maps)}" target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a></p>
    </div>
  `;
}

function icono() {
  return L.divIcon({
    className: '',
    html: '<div class="mapa-pin"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
}

function pintar(filtro = '') {
  const q = filtro.trim().toLowerCase();
  const visibles = registros.filter((r) => coincide(r, q));
  const conMapa = [];
  const sinMapa = [];

  grupo.clearLayers();
  marcadores.clear();

  visibles.forEach((r) => {
    const coords = coordenadas(r);
    if (!coords) {
      sinMapa.push(r);
      return;
    }
    conMapa.push({ r, coords });
    const marker = L.marker([coords.lat, coords.lon], { icon: icono(), title: r.folio || 'Lámpara LED' });
    marker.bindPopup(popupHtml(r, coords), { className: 'mapa-popup', maxWidth: 280 });
    marker.on('click', () => marcarActivo(r.id));
    grupo.addLayer(marker);
    marcadores.set(r.id, { marker, coords });
  });

  if ($('lblEnMapa')) $('lblEnMapa').textContent = String(conMapa.length);
  if ($('lblSinCoords')) $('lblSinCoords').textContent = String(sinMapa.length);

  const lista = $('listaLamparas');
  if (lista) {
    if (!registros.length) {
      lista.innerHTML = '<p class="mapa-lamparas-vacio">Todavía no hay lámparas registradas. Cada instalación nueva con coordenadas aparecerá en el mapa.</p>';
    } else if (!visibles.length) {
      lista.innerHTML = '<p class="mapa-lamparas-vacio">No hay lámparas que coincidan con la búsqueda.</p>';
    } else {
      const item = (r, ubicada) => `
        <button type="button" class="mapa-lamparas-item" data-id="${esc(r.id)}" ${ubicada ? '' : 'data-sin-mapa="1"'}>
          <strong>${esc(r.folio || 'S/F')} · ${esc(r.tipo_lampara || 'LED')}</strong>
          <span>${esc(r.ubicacion || 'Sin ubicación')}</span>
          <span>${ubicada ? esc(fd(r.fecha) || '') : 'Sin coordenadas para ubicarla en el mapa'}</span>
        </button>`;
      lista.innerHTML = conMapa.map(({ r }) => item(r, true)).join('') + sinMapa.map((r) => item(r, false)).join('');
      lista.querySelectorAll('[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => enfocar(btn.dataset.id));
      });
    }
  }

  if (conMapa.length === 1) {
    mapa.setView([conMapa[0].coords.lat, conMapa[0].coords.lon], 16);
  } else if (conMapa.length > 1) {
    const bounds = L.latLngBounds(conMapa.map(({ coords }) => [coords.lat, coords.lon]));
    mapa.fitBounds(bounds.pad(0.2), { maxZoom: 16 });
  } else {
    mapa.setView([19.4326, -99.1332], 5);
  }
}

function marcarActivo(id) {
  document.querySelectorAll('.mapa-lamparas-item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === id);
  });
  document.querySelector(`.mapa-lamparas-item[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function enfocar(id) {
  const punto = marcadores.get(id);
  marcarActivo(id);
  if (!punto) return;
  grupo.zoomToShowLayer(punto.marker, () => punto.marker.openPopup());
}

window.addEventListener('DOMContentLoaded', async () => {
  mapa = L.map('mapaLamparas', { zoomControl: true, scrollWheelZoom: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapa);
  grupo = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 48,
    spiderfyOnMaxZoom: true,
  });
  mapa.addLayer(grupo);
  mapa.setView([19.4326, -99.1332], 5);

  try {
    await initDatabase();
    personal = await getAllPersonal();
    registros = await getAllLamparasInstaladas();
  } catch (err) {
    console.error(err);
    registros = [];
  }

  pintar('');
  setTimeout(() => mapa.invalidateSize(), 150);

  $('searchInput')?.addEventListener('input', (e) => pintar(e.target.value));
  window.addEventListener('resize', () => mapa.invalidateSize());
});
