import { initDatabase, getAllVehiculos } from './db.js';
import { bindAdminDelete } from './admin-mode.js';
import {
  listarPeriodos,
  detallePeriodo,
  abrirPeriodo,
  transferirCombustible,
  cerrarPeriodo,
  editarMovimiento,
  eliminarMovimiento,
  eliminarPeriodo,
} from './combustible/periodos.js';
import {
  esc,
  etiquetaVehiculo,
  formatoPesos,
  fechaDocumento,
  tituloSemana,
  pesosACentavos,
  semanaActual,
  mensajeError,
} from './combustible/formato.js';
import { htmlAjuste, imprimirDocumento } from './combustible/print.js';

const $ = (id) => document.getElementById(id);
let vehiculos = [];
let lista = [];
let detalle = null;
let editMovimientoId = '';

function showToast(type, message) {
  const toast = $('toastNotification');
  const msg = $('toastMessage');
  if (!toast || !msg) return;
  toast.className = `toast-notification toast-${type}`;
  msg.textContent = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 4600);
}

function vehiculoDe(id) {
  return vehiculos.find((v) => v.id === id);
}

function opciones(select, items, placeholder) {
  const actual = select.value;
  select.innerHTML = `<option value="">${esc(placeholder)}</option>${items.map((item) => `
    <option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')}`;
  if ([...select.options].some((op) => op.value === actual)) select.value = actual;
}

function saldosVisibles() {
  return (detalle?.saldos || []).filter((s) => s.estado === 'Activo' || s.saldoCentavos !== 0);
}

function render() {
  const abierto = lista.find((p) => p.estado === 'ABIERTO');
  const periodo = detalle?.periodo;
  const viendoAbierto = periodo?.estado === 'ABIERTO';
  $('panelAbrir').classList.toggle('hidden', Boolean(abierto));
  $('panelPeriodo').classList.toggle('hidden', !periodo);
  $('panelMovimientos').classList.toggle('hidden', !periodo);
  $('panelTransferencia').classList.toggle('hidden', !viendoAbierto);
  if (!periodo) {
    $('tablaMovimientos').innerHTML = '';
    $('tablaSaldos').innerHTML = '';
  } else {
    $('tituloPeriodo').textContent = tituloSemana(periodo.fechaInicio, periodo.fechaFin);
    $('estadoPeriodo').textContent = periodo.estado;
    $('presupuestoPeriodo').textContent = formatoPesos(periodo.presupuestoCentavos);
    $('vehiculoInicial').textContent = periodo.vehiculoInicialPlacas || periodo.vehiculoInicialId;
    const sobrante = periodo.estado === 'CERRADO' && periodo.sobranteCentavos != null
      ? periodo.sobranteCentavos
      : detalle.disponibleCentavos;
    $('lblSobrante').textContent = periodo.estado === 'CERRADO' ? 'Sobrante de la semana' : 'Dinero en los vehículos';
    $('sobrantePeriodo').textContent = formatoPesos(sobrante);
    $('btnCerrarPeriodo').classList.toggle('hidden', !viendoAbierto);
    const saldos = saldosVisibles();
    $('tablaSaldos').innerHTML = saldos.map((s) => `
      <tr>
        <td>${esc(s.placas || s.vehiculoId)}</td>
        <td>${esc(s.marca)}</td>
        <td>${esc(formatoPesos(s.saldoCentavos))}</td>
      </tr>`).join('') || '<tr><td colspan="3">Sin vehículos en el catálogo.</td></tr>';
    $('tablaMovimientos').innerHTML = (detalle.movimientos || []).map((m) => `
      <tr>
        <td>${esc(fechaDocumento(m.fechaMovimiento))}</td>
        <td>${esc(m.origenPlacas)}</td>
        <td>${esc(m.destinoPlacas)}</td>
        <td>${esc(formatoPesos(m.importeCentavos))}</td>
        <td>${esc(m.observaciones)}</td>
        <td>
          <button type="button" class="btn btn-secondary" data-accion="ver" data-mov="${esc(m.id)}">Ver</button>
          ${viendoAbierto ? `<button type="button" class="btn btn-secondary" data-accion="editar" data-mov="${esc(m.id)}">Editar</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="6">Este periodo todavía no tiene transferencias.</td></tr>';

    const conSaldo = saldos.filter((s) => s.saldoCentavos > 0).map((s) => ({
      id: s.vehiculoId,
      label: `${s.placas || s.vehiculoId} · ${formatoPesos(s.saldoCentavos)}`,
    }));
    const destinos = saldos.map((s) => ({
      id: s.vehiculoId,
      label: etiquetaVehiculo(vehiculoDe(s.vehiculoId)) || s.placas || s.vehiculoId,
    }));
    opciones($('origenTransferencia'), conSaldo, 'Vehículo con saldo');
    opciones($('destinoTransferencia'), destinos, 'Vehículo destino');
    actualizarDisponible();
  }
  if (!viendoAbierto) cerrarEdicionMovimiento();
  refreshAdminPeriodo();

  $('tablaPeriodos').innerHTML = lista.map((p) => `
    <tr>
      <td>${esc(tituloSemana(p.fechaInicio, p.fechaFin))}</td>
      <td>${esc(p.vehiculoInicialPlacas)}</td>
      <td>${esc(p.estado)}</td>
      <td>${p.sobranteCentavos == null ? '' : esc(formatoPesos(p.sobranteCentavos))}</td>
      <td><button type="button" class="btn btn-secondary" data-periodo="${esc(p.id)}">Ver</button></td>
    </tr>`).join('') || '<tr><td colspan="5">Todavía no hay periodos.</td></tr>';
}

function actualizarDisponible() {
  const origen = $('origenTransferencia').value;
  const saldo = (detalle?.saldos || []).find((s) => s.vehiculoId === origen);
  $('disponibleOrigen').textContent = saldo ? formatoPesos(saldo.saldoCentavos) : '$0.00';
}

async function mostrar(periodoId) {
  detalle = await detallePeriodo(periodoId);
  render();
}

async function recargarLista(periodoId) {
  lista = await listarPeriodos();
  const id = periodoId || lista.find((p) => p.estado === 'ABIERTO')?.id;
  if (id) await mostrar(id);
  else {
    detalle = null;
    render();
  }
}

function cerrarEdicionMovimiento() {
  editMovimientoId = '';
  $('panelEditarMovimiento')?.classList.add('hidden');
  refreshAdminMovimiento();
}

function abrirDetalleMovimiento(m) {
  $('detalleMovimientoCuerpo').innerHTML = `
    <p><strong>Fecha:</strong> ${esc(fechaDocumento(m.fechaMovimiento))}</p>
    <p><strong>Origen:</strong> ${esc(m.origenPlacas)}</p>
    <p><strong>Destino:</strong> ${esc(m.destinoPlacas)}</p>
    <p><strong>Importe:</strong> ${esc(formatoPesos(m.importeCentavos))}</p>
    <p><strong>Observaciones:</strong> ${esc(m.observaciones)}</p>`;
  $('modalDetalleMovimiento').classList.remove('hidden');
  const abierto = detalle?.periodo?.estado === 'ABIERTO';
  $('btnEditarDesdeDetalleMovimiento').classList.toggle('hidden', !abierto);
  $('btnEditarDesdeDetalleMovimiento').onclick = () => {
    $('modalDetalleMovimiento').classList.add('hidden');
    abrirEdicionMovimiento(m);
  };
}

function abrirEdicionMovimiento(m) {
  editMovimientoId = m.id;
  const saldos = saldosVisibles();
  const opcionesHtml = saldos.map((s) => `<option value="${esc(s.vehiculoId)}">${esc(s.placas || s.vehiculoId)}</option>`).join('');
  $('editOrigen').innerHTML = opcionesHtml;
  $('editDestino').innerHTML = opcionesHtml;
  $('editOrigen').value = m.origenId;
  $('editDestino').value = m.destinoId;
  $('editImporte').value = (Number(m.importeCentavos) / 100).toFixed(2);
  $('editFecha').value = m.fechaMovimiento;
  $('editObs').value = m.observaciones || '';
  $('panelEditarMovimiento').classList.remove('hidden');
  refreshAdminMovimiento();
}

const refreshAdminPeriodo = bindAdminDelete({
  buttonId: 'btnAdminDeletePeriodo',
  isEditing: () => Boolean(detalle?.periodo),
  message: '¿Eliminar este periodo y todas sus transferencias de forma permanente? Esta acción no se puede deshacer.',
  getId: () => detalle?.periodo?.id,
  removeLocal: eliminarPeriodo,
  after: async () => {
    detalle = null;
    cerrarEdicionMovimiento();
    await recargarLista();
  },
});

const refreshAdminMovimiento = bindAdminDelete({
  buttonId: 'btnAdminDeleteMovimiento',
  isEditing: () => Boolean(editMovimientoId) && detalle?.periodo?.estado === 'ABIERTO',
  message: '¿Eliminar esta transferencia de forma permanente? Esta acción no se puede deshacer.',
  getId: () => editMovimientoId,
  removeLocal: async (id) => {
    detalle = await eliminarMovimiento(id);
  },
  after: async () => {
    cerrarEdicionMovimiento();
    lista = await listarPeriodos();
    render();
  },
});

$('origenTransferencia').addEventListener('change', () => {
  actualizarDisponible();
  const origen = $('origenTransferencia').value;
  if ($('destinoTransferencia').value === origen) $('destinoTransferencia').value = '';
});

$('formAbrir').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const nuevo = await abrirPeriodo({
      fechaInicio: $('fechaInicio').value,
      fechaFin: $('fechaFin').value,
      vehiculoInicialId: $('vehiculoInicialSelect').value,
    });
    showToast('success', 'Periodo abierto con $4,500.00.');
    detalle = nuevo;
    lista = await listarPeriodos();
    render();
  } catch (err) {
    showToast('error', mensajeError(err));
  }
});

$('formTransferencia').addEventListener('submit', async (event) => {
  event.preventDefault();
  const centavos = pesosACentavos($('importeTransferencia').value);
  if (centavos == null) {
    showToast('error', 'El importe se captura en pesos, con hasta 2 decimales.');
    return;
  }
  try {
    detalle = await transferirCombustible({
      periodoId: detalle.periodo.id,
      vehiculoOrigenId: $('origenTransferencia').value,
      vehiculoDestinoId: $('destinoTransferencia').value,
      importeCentavos: centavos,
      fechaMovimiento: $('fechaMovimiento').value,
      observaciones: String($('obsTransferencia').value || '').trim().toLocaleUpperCase('es-MX'),
    });
    $('importeTransferencia').value = '';
    $('obsTransferencia').value = '';
    showToast('success', 'Transferencia registrada.');
    lista = await listarPeriodos();
    render();
  } catch (err) {
    showToast('error', mensajeError(err));
  }
});

$('btnCerrarPeriodo').addEventListener('click', async () => {
  if (!detalle?.periodo) return;
  const ok = window.confirm('¿Cerrar esta semana? El sobrante se registra y la siguiente semana vuelve a empezar con $4,500.00.');
  if (!ok) return;
  try {
    detalle = await cerrarPeriodo(detalle.periodo.id);
    showToast('success', `Semana cerrada. Sobrante ${formatoPesos(detalle.periodo.sobranteCentavos)}.`);
    lista = await listarPeriodos();
    render();
  } catch (err) {
    showToast('error', mensajeError(err));
  }
});

$('btnPdfAjuste').addEventListener('click', () => {
  if (!detalle) return;
  showToast('success', 'Generando el documento...');
  imprimirDocumento('Ajuste de combustible', htmlAjuste(detalle)).catch((err) => {
    showToast('error', mensajeError(err));
  });
});

$('tablaMovimientos').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-mov]');
  if (!btn) return;
  const mov = (detalle?.movimientos || []).find((m) => m.id === btn.getAttribute('data-mov'));
  if (!mov) return;
  if (btn.getAttribute('data-accion') === 'ver') abrirDetalleMovimiento(mov);
  else abrirEdicionMovimiento(mov);
});

$('btnCancelarEdicionMovimiento')?.addEventListener('click', cerrarEdicionMovimiento);
$('btnCerrarDetalleMovimiento')?.addEventListener('click', () => $('modalDetalleMovimiento').classList.add('hidden'));
$('formEditarMovimiento')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const centavos = pesosACentavos($('editImporte').value);
  if (centavos == null) {
    showToast('error', 'El importe se captura en pesos, con hasta 2 decimales.');
    return;
  }
  try {
    detalle = await editarMovimiento({
      id: editMovimientoId,
      vehiculoOrigenId: $('editOrigen').value,
      vehiculoDestinoId: $('editDestino').value,
      importeCentavos: centavos,
      fechaMovimiento: $('editFecha').value,
      observaciones: String($('editObs').value || '').trim().toLocaleUpperCase('es-MX'),
    });
    showToast('success', 'Transferencia actualizada.');
    cerrarEdicionMovimiento();
    lista = await listarPeriodos();
    render();
  } catch (err) {
    showToast('error', mensajeError(err));
  }
});

$('tablaPeriodos').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-periodo]');
  if (!btn) return;
  mostrar(btn.getAttribute('data-periodo')).catch((err) => showToast('error', mensajeError(err)));
});

$('toastClose')?.addEventListener('click', () => $('toastNotification').classList.add('hidden'));

initDatabase()
  .then(async () => {
    const semana = semanaActual();
    $('fechaInicio').value = semana.inicio;
    $('fechaFin').value = semana.fin;
    $('fechaMovimiento').value = semana.hoy;
    vehiculos = await getAllVehiculos();
    const activos = vehiculos.filter((v) => v.estado !== 'Inactivo');
    $('vehiculoInicialSelect').innerHTML = `<option value="">Selecciona el vehículo</option>${
      activos.map((v) => `<option value="${esc(v.id)}">${esc(etiquetaVehiculo(v))}</option>`).join('')
    }`;
    await recargarLista();
  })
  .catch((err) => showToast('error', mensajeError(err)));
