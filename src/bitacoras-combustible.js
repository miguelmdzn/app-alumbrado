import {
  initDatabase,
  getAllVehiculos,
  getBitacorasGasolina,
  listBitacorasPage,
  ultimasCargasVehiculo,
  saveBitacoraGasolina,
  deleteBitacoraGasolina,
} from './db.js';
import { bindAdminDelete } from './admin-mode.js';
import {
  esc,
  etiquetaVehiculo,
  formatoPesos,
  formatoLitros,
  fechaBitacora,
  compararCargaReciente,
  pesosACentavos,
  litrosAMil,
  milALitros,
  htmlSelectorNivel,
  nivelSeleccionado,
  mensajeError,
  semanaActual,
  htmlRelojesNivel,
  partesFecha,
} from './combustible/formato.js';
import { htmlBitacoras, imprimirDocumento } from './combustible/print.js';
import { TablePaginator } from './table-pagination.js';

const $ = (id) => document.getElementById(id);

const EYE_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
`;

const PENCIL_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>
`;

let vehiculos = [];
let todas = [];
let filas = [];
let editId = '';

const paginator = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => { cargar(); },
  storageKey: 'paginator_bitacoras_gasolina',
});

function showToast(type, message) {
  const toast = $('toastNotification');
  const msg = $('toastMessage');
  if (!toast || !msg) return;
  toast.className = `toast-notification toast-${type}`;
  msg.textContent = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 4200);
}

function opcionesVehiculo(selected) {
  const activos = vehiculos.filter((v) => v.estado !== 'Inactivo' || v.id === selected);
  const opciones = activos.map((v) => `
    <option value="${esc(v.id)}"${v.id === selected ? ' selected' : ''}>${esc(etiquetaVehiculo(v))}</option>`);
  return `<option value="">Selecciona un vehículo</option>${opciones.join('')}`;
}

function pintarReloj() {
  const antes = nivelSeleccionado($('nivelAntes'));
  const despues = nivelSeleccionado($('nivelDespues'));
  $('relojNiveles').innerHTML = htmlRelojesNivel(antes, despues, 150);
}

function pintarNiveles(antes, despues) {
  $('nivelAntes').innerHTML = htmlSelectorNivel(antes || 'Vacio');
  $('nivelDespues').innerHTML = htmlSelectorNivel(despues || 'Vacio');
  pintarReloj();
}

function bindNiveles(root) {
  root.addEventListener('click', (event) => {
    const btn = event.target.closest('.nivel-option');
    if (!btn || !root.contains(btn)) return;
    const picker = btn.closest('.nivel-picker');
    picker.querySelectorAll('.nivel-option').forEach((item) => item.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    pintarReloj();
  });
}

function cargasDelVehiculo(vehiculoId) {
  if (!vehiculoId) return [];
  return todas
    .filter((row) => row.vehiculo_id === vehiculoId)
    .sort(compararCargaReciente);
}

function filaResumen(row) {
  return `<tr>
    <td>${esc(fechaBitacora(row.fecha_ticket))}</td>
    <td>${esc(row.numero_ticket)}</td>
    <td>${esc(row.lugar_comision)}</td>
    <td>${esc(formatoLitros(row.litros))}</td>
    <td>${esc(formatoPesos(row.importe))}</td>
    <td>${row.km_anterior ?? ''}</td>
    <td>${row.km_actual ?? ''}</td>
  </tr>`;
}

async function sincronizarUltimasCargas() {
  const bloque = $('bloqueUltimasCargas');
  const esNueva = !editId;
  bloque.classList.toggle('hidden', !esNueva);
  if (!esNueva) return;

  const vehiculoId = $('vehiculoBitacora').value;
  const cuerpo = $('tablaUltimasCargas');
  if (!vehiculoId) {
    cuerpo.innerHTML = '<tr><td colspan="7">Selecciona un vehículo para ver sus últimas cargas.</td></tr>';
    $('kmAnterior').value = '';
    return;
  }
  const recientes = await ultimasCargasVehiculo(vehiculoId, 2);
  $('kmAnterior').value = recientes[0]?.km_actual ?? '';
  cuerpo.innerHTML = recientes.length
    ? recientes.map(filaResumen).join('')
    : '<tr><td colspan="7">Este vehículo no tiene cargas registradas.</td></tr>';
}

function abrirFormulario(row) {
  editId = row?.id || '';
  $('tituloFormBitacora').textContent = editId ? 'Editar bitácora' : 'Nueva bitácora';
  $('vehiculoBitacora').innerHTML = opcionesVehiculo(row?.vehiculo_id || '');
  $('fechaTicket').value = row?.fecha_ticket || semanaActual().hoy;
  $('numeroTicket').value = row?.numero_ticket || '';
  $('lugarComision').value = row?.lugar_comision || '';
  $('litros').value = row ? formatoLitros(row.litros).replace(',', '.') : '';
  $('importe').value = row ? (Number(row.importe) / 100).toFixed(2) : '';
  $('kmAnterior').value = row?.km_anterior ?? '';
  $('kmActual').value = row?.km_actual ?? '';
  $('observaciones').value = row?.observaciones || '';
  pintarNiveles(row?.nivel_antes_cargar, row?.nivel_despues_carga);
  sincronizarUltimasCargas();
  $('seccionListaBitacoras').classList.add('hidden');
  $('panelBitacora').classList.remove('hidden');
  $('panelBitacora').scrollIntoView({ block: 'start' });
  refreshAdminDelete();
}

function cerrarFormulario() {
  editId = '';
  $('panelBitacora').classList.add('hidden');
  $('seccionListaBitacoras').classList.remove('hidden');
  refreshAdminDelete();
  render();
}

function coincide(row, texto) {
  if (!texto) return true;
  const bolsa = [
    row.numero_ticket, row.placas, row.numero_serie, row.lugar_comision,
    row.observaciones, row.marca, fechaBitacora(row.fecha_ticket),
  ].join(' ').toLowerCase();
  return bolsa.includes(texto);
}

function aplicarFiltro({ resetPage = false } = {}) {
  cargar({ reset: resetPage });
}

let totalBitacoras = 0;
let sumaLitros = 0;
let sumaImporte = 0;

function render() {
  $('totalLitros').textContent = formatoLitros(sumaLitros);
  $('totalImporte').textContent = formatoPesos(sumaImporte);
  const n = totalBitacoras;
  $('lblTotalBitacoras').textContent = n === 1 ? '1 registro' : `${n} registros`;
  const pagina = filas;
  if (pagina.length === 0) {
    $('tablaBitacoras').innerHTML = '<tr><td colspan="9" class="table-empty-row">No hay bitácoras con ese criterio.</td></tr>';
    paginator.update(totalBitacoras);
    return;
  }
  $('tablaBitacoras').innerHTML = pagina.map((row) => `
    <tr>
      <td>${esc(fechaBitacora(row.fecha_ticket))}</td>
      <td>${esc(row.numero_ticket)}</td>
      <td>${esc(row.placas || row.vehiculo_id)}</td>
      <td>${esc(row.lugar_comision)}</td>
      <td>${esc(formatoLitros(row.litros))}</td>
      <td>${esc(formatoPesos(row.importe))}</td>
      <td>${row.km_anterior ?? ''}</td>
      <td>${row.km_actual ?? ''}</td>
      <td class="td-center">
        <div class="table-actions">
          <button type="button" class="btn-icon-action" data-accion="ver" data-id="${esc(row.id)}" title="Ver detalle" aria-label="Ver detalle">${EYE_ICON}</button>
          <button type="button" class="btn-icon-action" data-accion="editar" data-id="${esc(row.id)}" title="Editar bitácora" aria-label="Editar bitácora">${PENCIL_ICON}</button>
        </div>
      </td>
    </tr>`).join('');
  paginator.update(totalBitacoras);
}

function enriquecer(rows) {
  const mapa = new Map(vehiculos.map((v) => [v.id, v]));
  return rows.map((row) => {
    const vehiculo = mapa.get(row.vehiculo_id);
    if (!vehiculo) return row;
    return {
      ...row,
      placas: row.placas || vehiculo.placas,
      marca: row.marca || vehiculo.marca,
      modelo: row.modelo || vehiculo.modelo,
      anio: row.anio ?? vehiculo.anio,
      descripcion: row.descripcion || vehiculo.descripcion,
      num_resguardo: row.num_resguardo || vehiculo.num_resguardo,
      responsable_bien: row.responsable_bien || vehiculo.responsable_bien,
      numero_serie: row.numero_serie || vehiculo.numero_serie,
    };
  });
}

async function cargar({ reset = false } = {}) {
  if (reset) paginator.resetPage();
  const limit = paginator.getRowsPerPage();
  const page = await listBitacorasPage({
    texto: $('buscarBitacora')?.value.trim() || '',
    limit,
    offset: (paginator.currentPage - 1) * limit,
  });
  todas = page.rows;
  filas = page.rows;
  totalBitacoras = page.total;
  sumaLitros = Number(page.stats?.litros || 0);
  sumaImporte = Number(page.stats?.importe || 0);
  render();
}

function abrirDetalle(row) {
  $('detalleBitacoraCuerpo').innerHTML = `
    <p><strong>Fecha:</strong> ${esc(fechaBitacora(row.fecha_ticket))}</p>
    <p><strong>Ticket:</strong> ${esc(row.numero_ticket)}</p>
    <p><strong>Vehículo:</strong> ${esc(etiquetaVehiculo({ placas: row.placas, numero_serie: row.numero_serie, marca: row.marca }))}</p>
    <p><strong>Lugar de comisión:</strong> ${esc(row.lugar_comision)}</p>
    <p><strong>Litros:</strong> ${esc(formatoLitros(row.litros))}</p>
    <p><strong>Importe:</strong> ${esc(formatoPesos(row.importe))}</p>
    <p><strong>Km anterior:</strong> ${esc(row.km_anterior ?? '')}</p>
    <p><strong>Km actual:</strong> ${esc(row.km_actual ?? '')}</p>
    <p><strong>Observaciones:</strong> ${esc(row.observaciones)}</p>
    <div class="nivel-reloj">
      ${htmlRelojesNivel(row.nivel_antes_cargar, row.nivel_despues_carga, 160)}
    </div>`;
  $('modalDetalleBitacora').classList.remove('hidden');
  $('btnEditarDesdeDetalleBitacora').onclick = () => {
    $('modalDetalleBitacora').classList.add('hidden');
    abrirFormulario(row);
  };
}

function enRango(row, desde, hasta) {
  const fecha = String(row.fecha_ticket || '');
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

const refreshAdminDelete = bindAdminDelete({
  isEditing: () => Boolean(editId),
  message: '¿Eliminar esta bitácora de forma permanente? Esta acción no se puede deshacer.',
  getId: () => editId,
  removeLocal: deleteBitacoraGasolina,
  after: async () => {
    cerrarFormulario();
    await cargar();
  },
});

$('btnNuevaBitacora').addEventListener('click', () => abrirFormulario(null));
$('btnCancelarBitacora').addEventListener('click', cerrarFormulario);
$('buscarBitacora').addEventListener('input', () => aplicarFiltro({ resetPage: true }));
$('vehiculoBitacora').addEventListener('change', sincronizarUltimasCargas);
const ELABORO_DEFAULT = 'Miguel Angel Méndez Núñez';

$('btnPdfBitacoras').addEventListener('click', () => {
  $('pdfDesde').value = '';
  $('pdfHasta').value = '';
  if ($('pdfElaboro') && !$('pdfElaboro').value.trim()) $('pdfElaboro').value = ELABORO_DEFAULT;
  $('modalPdfBitacora').classList.remove('hidden');
});
$('btnCancelarPdf').addEventListener('click', () => $('modalPdfBitacora').classList.add('hidden'));
$('formPdfBitacora').addEventListener('submit', async (event) => {
  event.preventDefault();
  const desde = $('pdfDesde').value;
  const hasta = $('pdfHasta').value;
  if (!partesFecha(desde) || !partesFecha(hasta) || hasta < desde) {
    showToast('error', 'Indica una fecha inicial y una fecha final válidas.');
    return;
  }
  const texto = $('buscarBitacora').value.trim().toLowerCase();
  const seleccion = (await getBitacorasGasolina({ desde, hasta })).filter((row) => coincide(row, texto));
  if (seleccion.length === 0) {
    showToast('error', 'No hay registros en esas fechas.');
    return;
  }
  const elaboro = $('pdfElaboro')?.value.trim() || ELABORO_DEFAULT;
  const orden = $('pdfOrden')?.value === 'asc' ? 'asc' : 'desc';
  $('modalPdfBitacora').classList.add('hidden');
  showToast('success', 'Generando el documento...');
  imprimirDocumento('Bitácora de gasolina', htmlBitacoras(seleccion, elaboro, orden)).catch((err) => {
    showToast('error', mensajeError(err));
  });
});
$('toastClose')?.addEventListener('click', () => $('toastNotification').classList.add('hidden'));
$('btnCerrarDetalleBitacora')?.addEventListener('click', () => $('modalDetalleBitacora').classList.add('hidden'));
bindNiveles($('panelBitacora'));

$('tablaBitacoras').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-id]');
  if (!btn) return;
  const row = todas.find((item) => item.id === btn.getAttribute('data-id'));
  if (!row) return;
  if (btn.getAttribute('data-accion') === 'ver') abrirDetalle(row);
  else abrirFormulario(row);
});

function enteroONull(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  if (!/^\d+$/.test(texto)) return undefined;
  return Number(texto);
}

$('formBitacora').addEventListener('submit', async (event) => {
  event.preventDefault();
  const mil = litrosAMil($('litros').value);
  const centavos = pesosACentavos($('importe').value);
  const kmAnterior = enteroONull($('kmAnterior').value);
  const kmActual = enteroONull($('kmActual').value);
  if (mil == null) {
    showToast('error', 'Los litros se capturan con hasta 3 decimales.');
    return;
  }
  if (centavos == null) {
    showToast('error', 'El importe se captura en pesos, con hasta 2 decimales.');
    return;
  }
  if (kmAnterior === undefined || kmActual === undefined) {
    showToast('error', 'El kilometraje se captura en números enteros.');
    return;
  }
  try {
    await saveBitacoraGasolina({
      id: editId,
      vehiculo_id: $('vehiculoBitacora').value,
      fecha_ticket: $('fechaTicket').value,
      numero_ticket: $('numeroTicket').value,
      lugar_comision: $('lugarComision').value,
      litros: milALitros(mil),
      importe: centavos,
      km_anterior: kmAnterior,
      km_actual: kmActual,
      nivel_antes_cargar: nivelSeleccionado($('nivelAntes')),
      nivel_despues_carga: nivelSeleccionado($('nivelDespues')),
      observaciones: $('observaciones').value,
    });
    showToast('success', editId ? 'Bitácora actualizada.' : 'Bitácora registrada.');
    cerrarFormulario();
    await cargar();
  } catch (err) {
    showToast('error', mensajeError(err));
  }
});

initDatabase()
  .then(async () => {
    vehiculos = await getAllVehiculos();
    await cargar();
  })
  .catch((err) => showToast('error', mensajeError(err)));
