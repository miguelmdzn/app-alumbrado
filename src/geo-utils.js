/**
 * ============================================================================
 * GEO UTILS — Funciones compartidas de geolocalización y Google Maps
 * ============================================================================
 */

export function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    return str;
  }
}

export function parseMapsInput(text) {
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

export function generateQrDataUrl(targetUrl) {
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

