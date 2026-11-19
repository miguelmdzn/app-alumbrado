/**
 * Requisición de pago: se llena en pantalla y se imprime solo el texto,
 * en la posición del formato físico (21.4 cm × 28 cm).
 */

import { attachInputNormalizers } from './normalizer.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'requi-borrador-v1';
const OFFSET_KEY = 'requi-ajuste-impresion';

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}[c]));

let lineSeq = 1;
let lineas = [];

function lineaVacia() {
  lineSeq += 1;
  return { id: lineSeq, cantidad: '', unidad: '', descripcion: '', unitario: '' };
}

function hoyIso() {
  const hoy = new Date();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${m}-${d}`;
}

function fechaImpresa(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseNum(value) {
  let text = String(value ?? '').trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function fmtCantidad(value) {
  const number = parseNum(value);
  if (number == null) return String(value || '').trim();
  return number.toLocaleString('es-MX', { maximumFractionDigits: 3 });
}

function fmtMoney(number) {
  if (number == null || !Number.isFinite(number)) return '';
  return number.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function leerLinea(row) {
  return {
    id: Number(row.dataset.id),
    cantidad: row.querySelector('[data-k="cantidad"]').value,
    unidad: row.querySelector('[data-k="unidad"]').value,
    descripcion: row.querySelector('[data-k="descripcion"]').value,
    unitario: row.querySelector('[data-k="unitario"]').value,
  };
}

function leerFormulario() {
  lineas = [...document.querySelectorAll('#lineasBody tr')].map(leerLinea);
  const partidas = lineas.map((linea) => {
    const cantidad = parseNum(linea.cantidad);
    const unitario = parseNum(linea.unitario);
    const tieneTexto = [linea.cantidad, linea.unidad, linea.descripcion, linea.unitario]
      .some((parte) => String(parte || '').trim());
    const importe = cantidad != null && unitario != null ? cantidad * unitario : null;
    return { ...linea, cantidadNum: cantidad, unitario, importe, tieneTexto };
  }).filter((linea) => linea.tieneTexto);

  const subtotal = partidas.reduce((acc, linea) => acc + (linea.importe || 0), 0);
  const tasa = parseNum($('ivaTasa').value);
  const ivaAuto = tasa == null ? 0 : subtotal * (tasa / 100);
  const ivaManual = parseNum($('ivaManual').value);
  const totalManual = parseNum($('totalManual').value);
  const iva = ivaManual == null ? ivaAuto : ivaManual;
  const total = totalManual == null ? subtotal + iva : totalManual;

  return {
    proveedor: $('proveedor').value.trim(),
    direccion: $('direccion').value.trim(),
    lugar: $('lugar').value.trim(),
    aut: $('autPresupuestal').value.trim(),
    partida: $('noPartida').value.trim(),
    noProv: $('noProv').value.trim(),
    fecha: $('fecha').value,
    objetivo: $('objetivo').value.trim(),
    elaboro: $('elaboro').value.trim(),
    autorizoDep: $('autorizoDep').value.trim(),
    autorizoAdq: $('autorizoAdq').value.trim(),
    partidas,
    retIsr: parseNum($('retIsr').value) ?? 0,
    redCedular: parseNum($('redCedular').value) ?? 0,
    subtotal,
    iva,
    total,
    hayPartidas: partidas.length > 0,
  };
}

function pintarHoja(data) {
  $('outProveedor').textContent = data.proveedor;
  $('outDireccion').textContent = data.direccion;
  $('outLugar').textContent = data.lugar;
  $('outAut').textContent = data.aut;
  $('outPartida').textContent = data.partida;
  $('outNoProv').textContent = data.noProv;
  $('outFecha').textContent = fechaImpresa(data.fecha);
  $('outObjetivo').textContent = data.objetivo;
  $('outElaboro').textContent = data.elaboro;
  $('outAutDep').textContent = data.autorizoDep;
  $('outAdq').textContent = data.autorizoAdq;
  $('outSubtotal').textContent = data.hayPartidas ? fmtMoney(data.subtotal) : '';
  $('outIva').textContent = data.hayPartidas ? fmtMoney(data.iva) : '';
  const mostrarTotal = data.hayPartidas || parseNum($('totalManual').value) != null;
  $('outRetIsr').textContent = mostrarTotal ? `Ret ISR $${fmtMoney(data.retIsr)}` : '';
  $('outTotalNum').textContent = mostrarTotal ? fmtMoney(data.total) : '';
  $('outRedCed').textContent = mostrarTotal ? `Red Cedular $${fmtMoney(data.redCedular)}` : '';

  $('outPartidas').innerHTML = data.partidas.map((linea) => `
    <div class="rq-line">
      <span></span>
      <span class="rq-c">${esc(fmtCantidad(linea.cantidad))}</span>
      <span class="rq-u">${esc(linea.unidad)}</span>
      <span class="rq-d">${esc(linea.descripcion)}</span>
      <span class="rq-pu">${linea.unitario == null ? '' : esc(fmtMoney(linea.unitario))}</span>
      <span class="rq-pt">${linea.importe == null ? '' : esc(fmtMoney(linea.importe))}</span>
      <span></span>
    </div>
  `).join('');

  const alto = $('outPartidas').scrollHeight;
  const limite = $('outPartidas').clientHeight;
  const aviso = $('avisoPartidas');
  if (aviso) {
    const rebosa = limite > 0 && data.partidas.length > 0 && alto > limite + 2;
    aviso.classList.toggle('hidden', !rebosa);
  }

  document.querySelectorAll('#lineasBody tr').forEach((row) => {
    const linea = data.partidas.find((item) => item.id === Number(row.dataset.id));
    const celda = row.querySelector('[data-importe]');
    if (celda) celda.textContent = linea && linea.importe != null ? fmtMoney(linea.importe) : '';
  });
  $('lblSubtotal').textContent = data.hayPartidas ? fmtMoney(data.subtotal) : '—';
  $('lblIva').textContent = data.hayPartidas ? fmtMoney(data.iva) : '—';
  $('lblTotal').textContent = data.hayPartidas ? fmtMoney(data.total) : '—';
  $('lblRetIsr').textContent = `$${fmtMoney(data.retIsr)}`;
  $('lblRedCed').textContent = `$${fmtMoney(data.redCedular)}`;
  document.querySelectorAll('textarea').forEach(ajustarCaja);
}

function filaHtml(linea) {
  return `
    <tr data-id="${linea.id}">
      <td><input class="rq-input" data-k="cantidad" data-keep-case="true" inputmode="decimal" value="${esc(linea.cantidad)}"></td>
      <td><input class="rq-input" data-k="unidad" value="${esc(linea.unidad)}" placeholder="PZA"></td>
      <td><textarea class="rq-input rq-desc" data-k="descripcion" rows="2">${esc(linea.descripcion)}</textarea></td>
      <td><input class="rq-input rq-money" data-k="unitario" data-keep-case="true" inputmode="decimal" value="${esc(linea.unitario)}"></td>
      <td class="rq-importe" data-importe></td>
      <td><button type="button" class="rq-quitar" data-quitar title="Quitar partida">×</button></td>
    </tr>
  `;
}

function dibujarLineas() {
  $('lineasBody').innerHTML = lineas.map(filaHtml).join('');
  attachInputNormalizers($('lineasBody'));
}

function ajustarCaja(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(el.scrollHeight, 48)}px`;
}

function guardarBorrador() {
  const data = {
    proveedor: $('proveedor').value,
    direccion: $('direccion').value,
    lugar: $('lugar').value,
    aut: $('autPresupuestal').value,
    partida: $('noPartida').value,
    noProv: $('noProv').value,
    fecha: $('fecha').value,
    objetivo: $('objetivo').value,
    elaboro: $('elaboro').value,
    autorizoDep: $('autorizoDep').value,
    autorizoAdq: $('autorizoAdq').value,
    ivaTasa: $('ivaTasa').value,
    ivaManual: $('ivaManual').value,
    totalManual: $('totalManual').value,
    retIsr: $('retIsr').value,
    redCedular: $('redCedular').value,
    lineas,
  };
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    /* El borrador es una ayuda; si no cabe, el formulario sigue en pantalla. */
  }
}

function aplicarAjuste() {
  const x = Number($('ajusteX').value) || 0;
  const y = Number($('ajusteY').value) || 0;
  $('rqPage').style.transform = `translate(${x}mm, ${y}mm)`;
  try {
    localStorage.setItem(OFFSET_KEY, JSON.stringify({ x, y }));
  } catch {
    /* El ajuste se mantiene en los campos aunque no se pueda guardar. */
  }
}

function actualizar() {
  lineas = [...document.querySelectorAll('#lineasBody tr')].map(leerLinea);
  pintarHoja(leerFormulario());
  guardarBorrador();
}

function agregarLinea() {
  lineas = [...document.querySelectorAll('#lineasBody tr')].map(leerLinea);
  lineas.push(lineaVacia());
  dibujarLineas();
  actualizar();
  const filas = document.querySelectorAll('#lineasBody tr');
  filas[filas.length - 1]?.querySelector('input')?.focus();
}

function limpiar() {
  $('proveedor').value = '';
  $('direccion').value = '';
  $('lugar').value = '';
  $('autPresupuestal').value = '';
  $('noPartida').value = '';
  $('noProv').value = '';
  $('fecha').value = hoyIso();
  $('objetivo').value = '';
  $('elaboro').value = '';
  $('autorizoDep').value = '';
  $('autorizoAdq').value = '';
  $('ivaTasa').value = '16';
  $('ivaManual').value = '';
  $('totalManual').value = '';
  $('retIsr').value = '0.00';
  $('redCedular').value = '0.00';
  lineSeq = 1;
  lineas = Array.from({ length: 6 }, lineaVacia);
  dibujarLineas();
  actualizar();
}

function imprimir() {
  actualizar();
  const titulo = document.title;
  document.title = ' ';
  const restaurar = () => {
    document.title = titulo;
    window.removeEventListener('afterprint', restaurar);
  };
  window.addEventListener('afterprint', restaurar);
  window.print();
}

function cargarBorrador() {
  let data = null;
  try {
    data = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    data = null;
  }
  if (!data) {
    $('fecha').value = hoyIso();
    lineas = Array.from({ length: 6 }, lineaVacia);
    return;
  }
  $('proveedor').value = data.proveedor || '';
  $('direccion').value = data.direccion || '';
  $('lugar').value = data.lugar || '';
  $('autPresupuestal').value = data.aut || '';
  $('noPartida').value = data.partida || '';
  $('noProv').value = data.noProv || '';
  $('fecha').value = data.fecha || hoyIso();
  $('objetivo').value = data.objetivo || '';
  $('elaboro').value = data.elaboro || '';
  $('autorizoDep').value = data.autorizoDep || '';
  $('autorizoAdq').value = data.autorizoAdq || '';
  $('ivaTasa').value = data.ivaTasa || '16';
  $('ivaManual').value = data.ivaManual || '';
  $('totalManual').value = data.totalManual || '';
  $('retIsr').value = data.retIsr || '0.00';
  $('redCedular').value = data.redCedular || '0.00';
  lineas = Array.isArray(data.lineas) && data.lineas.length
    ? data.lineas.map((linea) => ({ ...lineaVacia(), ...linea, id: lineaVacia().id }))
    : Array.from({ length: 6 }, lineaVacia);
}

function cargarAjuste() {
  try {
    const data = JSON.parse(localStorage.getItem(OFFSET_KEY) || '{}');
    if (data && typeof data.x === 'number') $('ajusteX').value = data.x;
    if (data && typeof data.y === 'number') $('ajusteY').value = data.y;
  } catch {
    /* Sin ajuste guardado se imprime en la posición medida. */
  }
  aplicarAjuste();
}

document.addEventListener('DOMContentLoaded', () => {
  cargarBorrador();
  dibujarLineas();
  cargarAjuste();
  attachInputNormalizers(document);
  actualizar();

  document.getElementById('formRequi')?.addEventListener('input', actualizar);
  $('lineasBody').addEventListener('input', actualizar);
  $('lineasBody').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-quitar]');
    if (!btn) return;
    const filas = [...document.querySelectorAll('#lineasBody tr')];
    if (filas.length === 1) {
      filas[0].querySelectorAll('input').forEach((input) => { input.value = ''; });
      actualizar();
      return;
    }
    btn.closest('tr')?.remove();
    actualizar();
  });
  $('btnAgregar').addEventListener('click', agregarLinea);
  $('btnLimpiar').addEventListener('click', limpiar);
  $('btnImprimir').addEventListener('click', imprimir);
  $('btnVista').addEventListener('click', () => {
    $('modalVista').classList.remove('hidden');
    actualizar();
  });
  $('btnCerrarVista').addEventListener('click', () => $('modalVista').classList.add('hidden'));
  $('modalVista').addEventListener('click', (event) => {
    if (event.target === $('modalVista')) $('modalVista').classList.add('hidden');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $('modalVista').classList.add('hidden');
  });
  $('ajusteX').addEventListener('input', aplicarAjuste);
  $('ajusteY').addEventListener('input', aplicarAjuste);
});
