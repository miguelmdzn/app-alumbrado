import {
  initDatabase,
  getAllVehiculos,
  saveVehiculo,
  deleteVehiculo,
} from './db.js';
import { bindAdminDelete } from './admin-mode.js';
import { esc, mensajeError } from './combustible/formato.js';

const $ = (id) => document.getElementById(id);
let vehiculos = [];
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
  const rows = filtrados();
  $('lblTotalVehiculos').textContent = String(rows.length);
  if (rows.length === 0) {
    $('tablaVehiculos').innerHTML = '<tr><td colspan="8">No hay vehículos con ese criterio.</td></tr>';
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
      <td>
        <button type="button" class="btn btn-secondary" data-accion="ver" data-id="${esc(v.id)}">Ver</button>
        <button type="button" class="btn btn-secondary" data-accion="editar" data-id="${esc(v.id)}">Editar</button>
      </td>
    </tr>`).join('');
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

async function recargar() {
  vehiculos = await getAllVehiculos();
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
$('buscarVehiculo').addEventListener('input', render);
$('filtroEstado').addEventListener('change', render);
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
