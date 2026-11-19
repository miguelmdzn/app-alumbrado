/**
 * Búsqueda profunda de reportes por el texto que regresa el personal
 * y por el enlace o las coordenadas de Maps.
 */

import { parseMapsInput } from './geo-utils.js';

const CENTRO = { lat: 20.392, lon: -101.191 };
const RADIO_ZONA = 50000;
const RADIO_ATENCION = 400;
const RADIO_CALLE = 500;
const RADIO_COLONIA = 1200;
const RADIO_DESCARTE = 1500;
const CACHE_KEY = 'alumbrado_busqueda_geo_v1';

const STOP = new Set(`
de la el los las en y a que se por con del al un una es lo su sus para como mas
fue ya o u no si me te le les mi tu hay esta este esto esa ese aqui alla muy tan
tambien pero porque cuando donde quien sobre hacia desde hasta av col num sr
sra don dona calle avenida favor gracias buenas tardes dias noches entre
`.trim().split(/\s+/));

const ZONA_DEBIL = new Set(['centro', 'municipal', 'cabecera', 'colonia', 'barrio', 'fraccionamiento']);

let colaGeo = Promise.resolve();
let ultimoGeo = 0;

function textoPlano(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensDe(texto) {
  const vistos = new Set();
  const salida = [];
  textoPlano(texto).split(' ').forEach((token) => {
    const sirve = /^\d{3,}$/.test(token) || (token.length >= 4 && !STOP.has(token));
    if (!sirve || vistos.has(token)) return;
    vistos.add(token);
    salida.push(token);
  });
  return salida;
}

function contieneToken(haystack, token) {
  return haystack.includes(` ${token} `);
}

function evaluarTexto(tokens, haystack) {
  if (!tokens.length) return { ok: false, hits: 0, ratio: 0 };
  const hits = tokens.filter((token) => contieneToken(haystack, token));
  const ratio = hits.length / tokens.length;
  const ok = tokens.length <= 2
    ? hits.length === tokens.length
    : hits.length >= 2 && ratio >= 0.4;
  return { ok, hits: hits.length, ratio };
}

function metrosEntre(aLat, aLon, bLat, bLon) {
  const rad = (grados) => grados * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const seno = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(seno)));
}

function enZona(lat, lon) {
  return metrosEntre(lat, lon, CENTRO.lat, CENTRO.lon) <= RADIO_ZONA;
}

function textoDistancia(metros) {
  if (!Number.isFinite(metros)) return '';
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}

function folioKey(folio) {
  return String(folio || '').trim().toLowerCase();
}

function atencionesDe(mapa, reporte) {
  if (!mapa || typeof mapa.get !== 'function') return [];
  return mapa.get(folioKey(reporte.folio)) || [];
}

function haystackReporte(reporte, atenciones) {
  const partes = [
    reporte.folio,
    reporte.usuario,
    reporte.atendio,
    reporte.direccion,
    reporte.colonia_comunidad,
    reporte.tipo_localidad,
    reporte.tipo_falla,
    reporte.tipo_lampara,
    reporte.referencias,
    reporte.entre_calles,
    reporte.observaciones,
    reporte.telefono,
    reporte.estatus,
    ...atenciones.map((item) => item.descripcion),
  ];
  return ` ${textoPlano(partes.filter(Boolean).join(' '))} `;
}

function consultaDireccion(reporte) {
  const nucleo = [reporte.direccion, reporte.entre_calles, reporte.colonia_comunidad]
    .map((parte) => String(parte || '').trim())
    .filter(Boolean)
    .join(', ');
  if (!nucleo) return '';
  if (/valle de santiago/i.test(nucleo)) return nucleo;
  return `${nucleo}, Valle de Santiago, Guanajuato, Mexico`;
}

function umbralDireccion(reporte) {
  return String(reporte.direccion || '').trim().length >= 4 ? RADIO_CALLE : RADIO_COLONIA;
}

function coordAtencion(item) {
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { lat, lon };
  }
  const parsed = parseMapsInput(item?.mapsUrl || '');
  if (parsed?.lat != null && parsed?.lon != null) return { lat: parsed.lat, lon: parsed.lon };
  return null;
}

function distanciaAtencion(atenciones, destino) {
  let mejor = null;
  atenciones.forEach((item) => {
    const punto = coordAtencion(item);
    if (!punto) return;
    const metros = metrosEntre(punto.lat, punto.lon, destino.lat, destino.lon);
    if (mejor == null || metros < mejor) mejor = metros;
  });
  return mejor;
}

function tokensLugar(lugar) {
  const road = tokensDe(lugar?.road || '').filter((token) => !ZONA_DEBIL.has(token));
  const zona = tokensDe([
    lugar?.suburb,
    lugar?.neighbourhood,
    lugar?.village,
    lugar?.hamlet,
    lugar?.city_district,
  ].filter(Boolean).join(' ')).filter((token) => !ZONA_DEBIL.has(token));
  return { road, zona };
}

function coincideCalle(road, haystack) {
  if (!road.length) return false;
  const hits = road.filter((token) => contieneToken(haystack, token));
  return hits.length >= 1 && hits.length / road.length >= 0.5;
}

function leerCache() {
  try {
    const data = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function guardarCache(cache) {
  const claves = Object.keys(cache);
  if (claves.length > 300) {
    claves.slice(0, claves.length - 300).forEach((clave) => { delete cache[clave]; });
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* La caché es solo una ayuda; si no cabe, se consulta de nuevo. */
  }
}

function esperarTurno() {
  const trabajo = colaGeo.then(async () => {
    const espera = Math.max(0, 1100 - (Date.now() - ultimoGeo));
    if (espera) await new Promise((resolve) => setTimeout(resolve, espera));
    ultimoGeo = Date.now();
  });
  colaGeo = trabajo.catch(() => {});
  return trabajo;
}

async function consultarLugar({ consulta = '', lat = null, lon = null } = {}) {
  await esperarTurno();
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke === 'function') {
    try {
      return await invoke('consultar_lugar_maps', { consulta, lat, lon });
    } catch (err) {
      console.warn('[busqueda] consulta de mapa:', err);
    }
  }
  const url = consulta
    ? `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=mx&q=${encodeURIComponent(consulta)}`
    : `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lon}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error('El mapa no respondió.');
  return resp.json();
}

function puntoDeRespuesta(data) {
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || item.lat == null || item.lon == null) return null;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !enZona(lat, lon)) return null;
  return { lat, lon, address: item.address || {} };
}

async function geocodificarDireccion(consulta, cache) {
  if (!consulta) return null;
  if (Object.prototype.hasOwnProperty.call(cache, consulta)) return cache[consulta];
  try {
    const data = await consultarLugar({ consulta });
    cache[consulta] = puntoDeRespuesta(data);
  } catch (err) {
    console.warn('[busqueda] geocodificar:', err);
    cache[consulta] = null;
  }
  guardarCache(cache);
  return cache[consulta];
}

async function lugarDesdeCoordenadas(coords, cache) {
  const clave = `rev:${coords.lat.toFixed(5)},${coords.lon.toFixed(5)}`;
  if (Object.prototype.hasOwnProperty.call(cache, clave)) return cache[clave];
  try {
    const data = await consultarLugar({ lat: coords.lat, lon: coords.lon });
    const punto = puntoDeRespuesta(data) || (Array.isArray(data) ? null : data);
    cache[clave] = punto?.address || data?.address || null;
  } catch (err) {
    console.warn('[busqueda] inverso:', err);
    cache[clave] = null;
  }
  guardarCache(cache);
  return cache[clave];
}

function separarEntrada(descripcion, enlace) {
  const crudo = String(descripcion || '');
  const urls = crudo.match(/https?:\/\/\S+/gi) || [];
  const mapsEnTexto = urls.find((url) => /maps|goo\.gl|google\.com\/maps|geo:/i.test(url)) || '';
  const texto = crudo.replace(/https?:\/\/\S+/gi, ' ').trim();
  const link = String(enlace || '').trim() || mapsEnTexto;
  return { texto, link };
}

async function coordenadasDelEnlace(enlace) {
  const directo = parseMapsInput(enlace);
  if (directo?.lat != null && directo?.lon != null) {
    return { lat: directo.lat, lon: directo.lon };
  }
  const url = directo?.url || (String(enlace || '').match(/https?:\/\/\S+/i) || [])[0] || '';
  if (!url) return null;

  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke === 'function') {
    try {
      const data = await invoke('resolver_enlace_maps', { url });
      const deUrl = parseMapsInput(data?.url || '');
      if (deUrl?.lat != null) return { lat: deUrl.lat, lon: deUrl.lon };
      const dePista = parseMapsInput(data?.pista || '');
      if (dePista?.lat != null) return { lat: dePista.lat, lon: dePista.lon };
    } catch (err) {
      console.warn('[busqueda] enlace corto:', err);
    }
  }

  try {
    const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (resp.ok) {
      const data = await resp.json();
      const resuelto = parseMapsInput(data?.status?.url || '') || parseMapsInput(data?.contents || '');
      if (resuelto?.lat != null) return { lat: resuelto.lat, lon: resuelto.lon };
    }
  } catch (err) {
    console.warn('[busqueda] enlace corto:', err);
  }
  return null;
}

function notaDe(pieza) {
  if (pieza.textoOk && Number.isFinite(pieza.metros)) {
    return `Coincide el texto y está a ${textoDistancia(pieza.metros)} del enlace`;
  }
  if (pieza.textoOk && pieza.calleOk) return 'Coincide el texto y la calle del enlace';
  if (pieza.textoOk) return 'Coincide la descripción';
  if (Number.isFinite(pieza.metros)) return `La dirección queda a ${textoDistancia(pieza.metros)} del enlace`;
  if (pieza.calleOk) return 'La dirección coincide con la calle del enlace';
  return 'Coincidencia de ubicación';
}

export async function buscarReportesProfundo({
  descripcion = '',
  enlace = '',
  reportes = [],
  atencionesPorFolio = new Map(),
  onStatus = null,
} = {}) {
  const { texto, link } = separarEntrada(descripcion, enlace);
  const tokens = tokensDe(texto);
  const pideTexto = tokens.length > 0;
  const pideMapa = Boolean(link);

  if (!pideTexto && !pideMapa) {
    return {
      ids: [],
      notas: new Map(),
      mensaje: 'Escribe una descripción o pega un enlace de Maps.',
      vacio: 'Escribe una descripción o pega un enlace de Maps.',
    };
  }

  onStatus?.('Revisando todos los reportes...');
  let coords = null;
  let avisoMapa = '';
  if (pideMapa) {
    onStatus?.('Leyendo las coordenadas del enlace...');
    coords = await coordenadasDelEnlace(link);
    if (!coords) {
      avisoMapa = 'No pude leer las coordenadas de ese enlace.';
    }
  }

  const cache = leerCache();
  let lugar = null;
  if (coords) {
    onStatus?.('Buscando en el mapa la calle de ese enlace...');
    lugar = await lugarDesdeCoordenadas(coords, cache);
  }
  const { road } = tokensLugar(lugar);

  const piezas = reportes.map((reporte) => {
    const atenciones = atencionesDe(atencionesPorFolio, reporte);
    const haystack = haystackReporte(reporte, atenciones);
    const textoEval = evaluarTexto(tokens, haystack);
    const metrosGuardados = coords ? distanciaAtencion(atenciones, coords) : null;
    const cercaGuardada = metrosGuardados != null && metrosGuardados <= RADIO_ATENCION;
    const calleOk = Boolean(coords) && coincideCalle(road, haystack);
    return {
      id: reporte.id,
      reporte,
      ratio: textoEval.ratio,
      textoOk: textoEval.ok,
      metros: cercaGuardada ? metrosGuardados : null,
      calleOk,
      cercaGuardada,
    };
  });

  const necesitaGeo = (pieza) => {
    if (!coords || pieza.cercaGuardada) return false;
    if (pideTexto) return pieza.textoOk;
    return pieza.calleOk;
  };

  const porGeocodificar = piezas
    .filter(necesitaGeo)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 20);

  let geoIntentos = 0;
  let geoAciertos = 0;
  for (let i = 0; i < porGeocodificar.length; i += 1) {
    const pieza = porGeocodificar[i];
    onStatus?.(`Comparando direcciones con el enlace (${i + 1} de ${porGeocodificar.length})...`);
    geoIntentos += 1;
    const punto = await geocodificarDireccion(consultaDireccion(pieza.reporte), cache);
    if (!punto) continue;
    geoAciertos += 1;
    const metros = metrosEntre(punto.lat, punto.lon, coords.lat, coords.lon);
    const umbral = umbralDireccion(pieza.reporte);
    if (metros <= umbral) pieza.metros = metros;
    else if (pieza.calleOk && metros > RADIO_DESCARTE) pieza.calleOk = false;
    else if (!pieza.calleOk) pieza.lejos = true;
  }

  const mapaSinConfirmar = Boolean(coords) && geoIntentos > 0 && geoAciertos === 0;
  let aceptadas = piezas.filter((pieza) => {
    const lugarOk = pieza.cercaGuardada || Number.isFinite(pieza.metros) || (pieza.calleOk && !pieza.lejos);
    if (pideTexto && pideMapa && coords && !mapaSinConfirmar) return pieza.textoOk && lugarOk;
    if (pideTexto) return pieza.textoOk;
    return lugarOk;
  });

  aceptadas.sort((a, b) => {
    const da = Number.isFinite(a.metros) ? a.metros : 999999;
    const db = Number.isFinite(b.metros) ? b.metros : 999999;
    if (da !== db) return da - db;
    return b.ratio - a.ratio;
  });

  const notas = new Map(aceptadas.map((pieza) => [pieza.id, notaDe(pieza)]));
  const textoCercanos = piezas.filter((pieza) => pieza.textoOk).length;
  let mensaje = '';
  let vacio = 'Ningún reporte coincide con esa búsqueda.';

  if (mapaSinConfirmar && pideTexto && aceptadas.length) {
    mensaje = aceptadas.length === 1
      ? 'No pude comparar las direcciones con el mapa. Se muestra 1 coincidencia de la descripción.'
      : `No pude comparar las direcciones con el mapa. Se muestran ${aceptadas.length} coincidencias de la descripción.`;
    vacio = mensaje;
  } else if (pideTexto && pideMapa && coords && aceptadas.length === 0) {
    mensaje = textoCercanos
      ? `Ningún reporte coincide con las dos cosas. ${textoCercanos} se parecen al texto, pero no quedan cerca del enlace.`
      : 'Ningún reporte coincide con esa descripción ni con ese enlace.';
    vacio = mensaje;
  } else if (pideMapa && !coords && pideTexto) {
    mensaje = `${avisoMapa} Se muestran ${aceptadas.length} coincidencias del texto.`;
    vacio = `${avisoMapa} Tampoco hubo coincidencias en la descripción.`;
  } else if (pideMapa && !coords) {
    mensaje = `${avisoMapa} Pega las coordenadas o el enlace completo de Google Maps.`;
    vacio = mensaje;
  } else if (aceptadas.length === 0) {
    mensaje = pideMapa
      ? 'Ningún reporte queda cerca de ese enlace.'
      : 'Ningún reporte coincide con esa descripción.';
    vacio = mensaje;
  } else if (aceptadas.length === 1) {
    mensaje = '1 reporte coincide.';
  } else {
    mensaje = `${aceptadas.length} reportes coinciden.`;
  }

  return {
    ids: aceptadas.map((pieza) => pieza.id),
    notas,
    mensaje,
    vacio,
  };
}
