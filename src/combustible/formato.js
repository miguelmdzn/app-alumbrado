/** Formato de dinero en centavos, fechas y dibujo del tanque. */

export const NIVELES = [
  { id: 'Vacio', label: 'Vacío', t: 0 },
  { id: '1/4', label: '1/4', t: 0.25 },
  { id: '1/3', label: '1/3', t: 1 / 3 },
  { id: '1/2', label: '1/2', t: 0.5 },
  { id: '2/3', label: '2/3', t: 2 / 3 },
  { id: '3/4', label: '3/4', t: 0.75 },
  { id: 'Lleno', label: 'Lleno', t: 1 },
];

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function formatoPesos(centavos) {
  const n = Math.trunc(Number(centavos) || 0);
  const signo = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const enteros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = String(abs % 100).padStart(2, '0');
  return `${signo}$${enteros}.${dec}`;
}

export function pesosACentavos(valor) {
  const texto = String(valor ?? '').trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!texto) return null;
  let normal = texto;
  if (texto.includes(',') && texto.includes('.')) {
    normal = texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  } else if (texto.includes(',')) {
    normal = texto.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const [enteros, dec = ''] = normal.split('.');
  return Number(enteros) * 100 + Number(dec.padEnd(2, '0').slice(0, 2));
}

export function litrosAMil(valor) {
  const texto = String(valor ?? '').trim().replace(/\s/g, '');
  if (!texto) return null;
  let normal = texto;
  if (texto.includes(',') && texto.includes('.')) {
    normal = texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  } else if (texto.includes(',')) {
    normal = texto.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,3})?$/.test(normal)) return null;
  const [enteros, dec = ''] = normal.split('.');
  return Number(enteros) * 1000 + Number(dec.padEnd(3, '0').slice(0, 3));
}

export function milALitros(mil) {
  return Math.round(Number(mil) || 0) / 1000;
}

export function formatoLitros(valor) {
  const mil = Math.round(Number(valor) * 1000);
  if (!Number.isFinite(mil)) return '';
  const abs = Math.abs(mil);
  const enteros = String(Math.floor(abs / 1000));
  const dec = String(abs % 1000).padStart(3, '0');
  return `${mil < 0 ? '-' : ''}${enteros},${dec}`;
}

export function partesFecha(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

export function fechaDocumento(iso) {
  const p = partesFecha(iso);
  if (!p) return '';
  return `${p.d}/${p.m + 1}/${p.y}`;
}

/** Fecha de bitácora: el día siempre ocupa dos dígitos (6 → 06). */
export function fechaBitacora(iso) {
  const p = partesFecha(iso);
  if (!p) return '';
  return `${String(p.d).padStart(2, '0')}/${p.m + 1}/${p.y}`;
}

/** De la carga más reciente a la más antigua. */
export function compararCargaReciente(a, b) {
  const porFecha = String(b.fecha_ticket || '').localeCompare(String(a.fecha_ticket || ''));
  if (porFecha) return porFecha;
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

export function tituloSemana(inicio, fin) {
  const a = partesFecha(inicio);
  const b = partesFecha(fin);
  if (!a || !b) return 'SEMANA';
  if (a.m === b.m && a.y === b.y) {
    return `SEMANA DEL ${a.d} AL ${b.d} DE ${MESES[a.m]}, ${a.y}`;
  }
  return `SEMANA DEL ${a.d} DE ${MESES[a.m]} AL ${b.d} DE ${MESES[b.m]}, ${b.y}`;
}

export function semanaActual() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dia === 0 ? 6 : dia - 1));
  const viernes = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 4);
  const iso = (fecha) => {
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  };
  return { inicio: iso(lunes), fin: iso(viernes), hoy: iso(hoy) };
}

export function etiquetaVehiculo(v) {
  if (!v) return '';
  const placa = String(v.placas || '').trim();
  const serie = String(v.numero_serie || v.vehiculoId || '').trim();
  const marca = String(v.marca || '').trim();
  return [placa || serie, marca].filter(Boolean).join(' · ');
}

function punto(t, radio) {
  const rad = Math.PI * (1 - t);
  return [60 + Math.cos(rad) * radio, 62 - Math.sin(rad) * radio];
}

function nivelDe(nivelId) {
  return NIVELES.find((n) => n.id === nivelId) || NIVELES[0];
}

function manosReloj(t, color) {
  const rad = Math.PI * (1 - t);
  const cx = 60;
  const cy = 62;
  const largo = (radio) => [
    cx + Math.cos(rad) * radio,
    cy - Math.sin(rad) * radio,
  ];
  const corto = (radio) => [
    cx - Math.cos(rad) * radio,
    cy + Math.sin(rad) * radio,
  ];
  const linea = (a, b, grosor) => {
    const [x1, y1] = a;
    const [x2, y2] = b;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round"/>`;
  };
  return `${linea(largo(7), largo(34), 2.7)}${linea(corto(5), corto(15), 2.7)}`;
}

export function tanqueSvg(nivelId, px = 86, color = '#1a1a1a') {
  const nivel = nivelDe(nivelId);
  const marcas = [
    ['E', 0],
    ['1/4', 0.25],
    ['1/2', 0.5],
    ['3/4', 0.75],
    ['F', 1],
  ];
  const textos = marcas.map(([texto, t]) => {
    const [x, y] = punto(t, 46);
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" font-size="9" font-family="Arial, sans-serif" fill="#222">${texto}</text>`;
  }).join('');
  const ticks = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1].map((t) => {
    const [x1, y1] = punto(t, 33);
    const [x3, y3] = punto(t, 40);
    const fino = t === 1 / 3 || t === 2 / 3;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x3.toFixed(1)}" y2="${y3.toFixed(1)}" stroke="#222" stroke-width="${fino ? 1 : 1.7}"/>`;
  }).join('');
  return `<svg class="tanque-svg" width="${px}" height="${Math.round(px * 0.8)}" viewBox="0 0 120 96" role="img" aria-label="${esc(nivel.label)}">
    <path d="M 18 62 A 42 42 0 0 1 102 62" fill="none" stroke="#222" stroke-width="1.8"/>
    ${ticks}
    ${textos}
    ${manosReloj(nivel.t, color)}
    <circle cx="60" cy="62" r="3.2" fill="#222"/>
  </svg>`;
}

export function htmlRelojesNivel(antesId, despuesId, px = 150) {
  return `<div class="nivel-relojes">
    <div class="nivel-reloj-item">
      ${tanqueSvg(antesId || 'Vacio', px, '#1a1a1a')}
      <p>Antes de cargar</p>
    </div>
    <div class="nivel-reloj-item">
      ${tanqueSvg(despuesId || 'Vacio', px, '#c62828')}
      <p>Después de cargar</p>
    </div>
  </div>`;
}

export function htmlSelectorNivel(selected) {
  return `<div class="nivel-picker">${NIVELES.map((n) => `
    <button type="button" class="nivel-option${n.id === selected ? ' is-selected' : ''}" data-nivel-valor="${esc(n.id)}">
      ${tanqueSvg(n.id, 68)}
      <span>${esc(n.label)}</span>
    </button>`).join('')}</div>`;
}

export function nivelSeleccionado(root) {
  return root?.querySelector('.nivel-option.is-selected')?.getAttribute('data-nivel-valor') || 'Vacio';
}

export function mensajeError(err) {
  if (!err) return 'No se pudo completar la operación.';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}
