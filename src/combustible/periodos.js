/** Llamadas a las operaciones de presupuesto. La validación vive en Rust. */

function invoke(cmd, args) {
  const fn = window.__TAURI__?.core?.invoke;
  if (typeof fn !== 'function') {
    throw new Error('Los ajustes de combustible se registran en la aplicación de escritorio.');
  }
  return args ? fn(cmd, args) : fn(cmd);
}

export function listarPeriodos() {
  return invoke('combustible_listar_periodos');
}

export function detallePeriodo(periodoId) {
  return invoke('combustible_detalle', { periodoId });
}

export function abrirPeriodo(payload) {
  return invoke('combustible_abrir_periodo', { payload });
}

export function transferirCombustible(payload) {
  return invoke('combustible_transferir', { payload });
}

export function cerrarPeriodo(periodoId) {
  return invoke('combustible_cerrar_periodo', { periodoId });
}

export function editarMovimiento(payload) {
  return invoke('combustible_editar_movimiento', { payload });
}

export function eliminarMovimiento(movimientoId) {
  return invoke('combustible_eliminar_movimiento', { movimientoId });
}

export function eliminarPeriodo(periodoId) {
  return invoke('combustible_eliminar_periodo', { periodoId });
}
