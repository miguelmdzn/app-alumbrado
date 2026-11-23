import {
  initDatabase,
  saveVehiculo,
  deleteVehiculo,
  listVehiculosPage,
} from './db.js';
import { bindAdminDelete } from './admin-mode.js';
import { TablePaginator } from './table-pagination.js';
import { esc, mensajeError } from './combustible/formato.js';

const $ = (id) => document.getElementById(id);

const paginator = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => { recargar(); },
  storageKey: 'paginator_vehiculos',
});

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
let totalVehiculos = 0;
let editando = false;
let editId = '';

function showToast(type, message) {
  const toast = $('toastNotification');
  const msg = $('toastMessage');
  if (!toast || !msg) return;
  toast.className = `toast-notification toast-${type}`;
  msg.textContent = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 4200);
}

function leerFormulario() {
  return {
    id: editId,
    numero_serie: $('numeroSerie').value,
    placas: $('placas').value,
    marca: $('marca').value,
    modelo: $('modelo').value,
    anio: $('anio').value,
    descripcion: $('descripcion').value,
    num_resguardo: $('numResguardo').value,
    responsable_bien: $('responsableBien').value,
    estado: $('estado').value,
  };
}

function abrirFormulario(vehiculo) {
  editando = Boolean(vehiculo);
  editId = vehiculo?.id || '';
  $('tituloFormVehiculo').textContent = editando ? 'Editar vehículo' : 'Nuevo vehículo';
  $('numeroSerie').readOnly = false;
  $('numeroSerie').value = vehiculo?.numero_serie || '';
  $('placas').value = vehiculo?.placas || '';
  $('marca').value = vehiculo?.marca || '';
  $('modelo').value = vehiculo?.modelo || '';
  $('anio').value = vehiculo?.anio || '';
  $('descripcion').value = vehiculo?.descripcion || '';
  $('numResguardo').value = vehiculo?.num_resguardo || '';
  $('responsableBien').value = vehiculo?.responsable_bien || '';
  $('estado').value = vehiculo?.estado === 'Inactivo' ? 'Inactivo' : 'Activo';
  $('btnDesactivarVehiculo').classList.toggle('hidden', !editando);
  $('btnDesactivarVehiculo').textContent = vehiculo?.estado === 'Inactivo' ? 'Activar' : 'Desactivar';
  $('panelVehiculo').classList.remove('hidden');
  refreshAdminDelete();
  $('numeroSerie').focus();
}

function cerrarFormulario() {
  editando = false;
  editId = '';
  $('formVehiculo').reset();
  $('panelVehiculo').classList.add('hidden');
  refreshAdminDelete();
}

function textoVehiculo(v) {
  return [v.placas, v.numero_serie, v.marca, v.modelo, v.responsable_bien, v.num_resguardo, v.descripcion]
    .join(' ')
    .toLowerCase();
}

function filtrados() {
  const q = $('buscarVehiculo').value.trim().toLowerCase();
  const estado = $('filtroEstado').value;
  return vehiculos.filter((v) => {
    if (estado && v.estado !== estado) return false;
    if (!q) return true;
    return textoVehiculo(v).includes(q);
  });
}

function render() {
  const rows = vehiculos;
  $('lblTotalVehiculos').textContent = String(totalVehiculos);
  if (rows.length === 0) {
    $('tablaVehiculos').innerHTML = '<tr><td colspan="8">No hay vehículos con ese criterio.</td></tr>';
    paginator.update(totalVehiculos);
    return;
  }
  $('tablaVehiculos').innerHTML = rows.map((v) => `
    <tr>
      <td>${esc(v.placas)}</td>
      <td>${esc(v.numero_serie)}</td>
      <td>${esc(v.marca)}</td>
      <td>${esc([v.modelo, v.anio].filter(Boolean).join(' '))}</td>
      <td>${esc(v.num_resguardo)}</td>
      <td>${esc(v.responsable_bien)}</td>
      <td>${esc(v.estado || 'Activo')}</td>
      <td class="td-center">
        <div class="table-actions">
          <button type="button" class="btn-icon-action" data-accion="ver" data-id="${esc(v.id)}" title="Ver detalle" aria-label="Ver detalle">${EYE_ICON}</button>
          <button type="button" class="btn-icon-action" data-accion="editar" data-id="${esc(v.id)}" title="Editar vehículo" aria-label="Editar vehículo">${PENCIL_ICON}</button>
        </div>
      </td>
    </tr>`).join('');
  paginator.update(totalVehiculos);
}

function abrirDetalle(v) {
  $('detalleVehiculoCuerpo').innerHTML = [
    ['Placas', v.placas],
    ['Número de serie', v.numero_serie],
    ['Marca', v.marca],
    ['Modelo', [v.modelo, v.anio].filter(Boolean).join(' ')],
    ['Descripción', v.descripcion],
    ['Resguardo', v.num_resguardo],
    ['Responsable del bien', v.responsable_bien],
    ['Estado', v.estado || 'Activo'],
  ].map(([etiqueta, valor]) => `<p><strong>${esc(etiqueta)}:</strong> ${esc(valor)}</p>`).join('');
  $('modalDetalleVehiculo').classList.remove('hidden');
  $('btnEditarDesdeDetalle').onclick = () => {
    $('modalDetalleVehiculo').classList.add('hidden');
    abrirFormulario(v);
  };
}

async function recargar({ reset = false } = {}) {
  if (reset) paginator.resetPage();
  const limit = paginator.getRowsPerPage();
  const page = await listVehiculosPage({
    estado: $('filtroEstado').value,
    texto: $('buscarVehiculo').value.trim(),
    limit,
    offset: (paginator.currentPage - 1) * limit,
  });
  vehiculos = page.rows;
  totalVehiculos = page.total;
  render();
}

const refreshAdminDelete = bindAdminDelete({
  isEditing: () => editando,
  message: '¿Eliminar este vehículo de forma permanente? También se borran sus bitácoras. Esta acción no se puede deshacer.',
  getId: () => editId,
  removeLocal: deleteVehiculo,
  after: async () => {
    cerrarFormulario();
    await recargar();
  },
});

$('btnNuevoVehiculo').addEventListener('click', () => abrirFormulario(null));
$('btnCancelarVehiculo').addEventListener('click', cerrarFormulario);
$('buscarVehiculo').addEventListener('input', () => { recargar({ reset: true }); });
$('filtroEstado').addEventListener('change', () => { recargar({ reset: true }); });
$('toastClose')?.addEventListener('click', () => $('toastNotification').classList.add('hidden'));
$('btnCerrarDetalleVehiculo')?.addEventListener('click', () => $('modalDetalleVehiculo').classList.add('hidden'));

$('tablaVehiculos').addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-id]');
  if (!btn) return;
  const vehiculo = vehiculos.find((v) => v.id === btn.getAttribute('data-id'));
  if (!vehiculo) return;
  if (btn.getAttribute('data-accion') === 'ver') abrirDetalle(vehiculo);
  else abrirFormulario(vehiculo);
});

$('btnDesactivarVehiculo').addEventListener('click', async () => {
  const actual = vehiculos.find((v) => v.id === editId);
  if (!actual) return;
  const activar = actual.estado === 'Inactivo';
  const pregunta = activar
    ? '¿Activar este vehículo?'
    : '¿Desactivar este vehículo? Se conserva en el catálogo y en sus registros.';
  if (!window.confirm(pregunta)) return;
  try {
    await saveVehiculo({ ...actual, estado: activar ? 'Activo' : 'Inactivo' }, true);
    showToast('success', activar ? 'Vehículo activado.' : 'Vehículo desactivado.');
    cerrarFormulario();
    await recargar();
  } catch (err) {
    showToast('error', mensajeError(err));
  }
});

$('formVehiculo').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveVehiculo(leerFormulario(), editando);
    showToast('success', editando ? 'Vehículo actualizado.' : 'Vehículo registrado.');
    cerrarFormulario();
    await recargar();
  } catch (err) {
    showToast('error', mensajeError(err));
  }
});

initDatabase()
  .then(recargar)
  .catch((err) => showToast('error', mensajeError(err)));
