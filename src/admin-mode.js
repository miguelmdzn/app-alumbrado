/**
 * Modo administrador. Se activa con el icono de luz de la barra lateral.
 * La sesión dura mientras la aplicación sigue abierta.
 */
import { deleteSheetRowById, getValidAccessToken } from './googleSheets.js';
import { discardQueueRecord, hasQueueRecord } from './database/repositories/syncQueue.js';

const SESSION_KEY = 'alumbrado_admin_session';
const PASSWORD = 'AlumPValle+';
const LINKED_TABLES = new Set(['reportes', 'personal']);

const listeners = new Set();

export function isAdmin() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function onAdminChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  const on = isAdmin();
  document.body.classList.toggle('is-admin', on);
  const badge = document.querySelector('.sidebar-brand-badge');
  badge?.classList.toggle('is-admin-on', on);
  badge?.setAttribute('title', on ? 'Modo administrador activo' : 'Modo administrador');
  listeners.forEach((fn) => {
    try { fn(on); } catch (err) { console.error(err); }
  });
}

function setAdmin(on) {
  if (on) sessionStorage.setItem(SESSION_KEY, '1');
  else sessionStorage.removeItem(SESSION_KEY);
  notify();
}

function showToast(type, message) {
  const toast = document.getElementById('toastNotification');
  const msg = document.getElementById('toastMessage');
  const icon = document.getElementById('toastIcon');
  if (!toast || !msg) return;
  toast.className = `toast-notification toast-${type}`;
  msg.textContent = message;
  if (icon) {
    icon.innerHTML = type === 'success'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  }
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4800);
}

function ensureModals() {
  if (document.getElementById('adminGate')) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="adminGate" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="adminGateTitle">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-title" id="adminGateTitle">Inserta la contraseña</h2>
        <p class="modal-text" id="adminGateText">El modo administrador permite borrar registros de forma permanente.</p>
        <label class="field" id="adminGateField">
          <span class="field-label">Contraseña</span>
          <input type="password" id="adminPasswordInput" class="field-input" autocomplete="off" spellcheck="false" data-keep-case="true">
        </label>
        <p class="modal-text hidden" id="adminGateError" style="color:#b91c1c;margin-top:8px;">Contraseña incorrecta.</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="adminGateCancel">Cancelar</button>
          <button type="button" class="btn btn-primary" id="adminGateOk">Entrar</button>
        </div>
      </div>
    </div>
    <div id="adminConfirm" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="adminConfirmTitle">
      <div class="modal-card" style="max-width: 460px;">
        <h2 class="modal-title" id="adminConfirmTitle">Confirmar eliminación</h2>
        <p class="modal-text" id="adminConfirmText"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="adminConfirmNo">Cancelar</button>
          <button type="button" class="btn admin-delete-btn" id="adminConfirmYes" style="flex-basis:auto;margin-top:0;">Eliminar completamente</button>
        </div>
      </div>
    </div>
  `;
  document.body.append(...wrap.children);

  const gate = document.getElementById('adminGate');
  const input = document.getElementById('adminPasswordInput');
  const error = document.getElementById('adminGateError');
  const field = document.getElementById('adminGateField');
  const text = document.getElementById('adminGateText');
  const title = document.getElementById('adminGateTitle');
  const ok = document.getElementById('adminGateOk');

  const closeGate = () => {
    gate.classList.add('hidden');
    input.value = '';
    error.classList.add('hidden');
  };

  const openGate = () => {
    error.classList.add('hidden');
    input.value = '';
    if (isAdmin()) {
      title.textContent = 'Modo administrador';
      text.textContent = 'Ya estás en modo administrador. ¿Deseas salir?';
      field.classList.add('hidden');
      ok.textContent = 'Salir';
    } else {
      title.textContent = 'Inserta la contraseña';
      text.textContent = 'El modo administrador permite borrar registros de forma permanente.';
      field.classList.remove('hidden');
      ok.textContent = 'Entrar';
    }
    gate.classList.remove('hidden');
    if (!isAdmin()) input.focus();
  };

  document.getElementById('adminGateCancel').addEventListener('click', closeGate);
  gate.addEventListener('click', (e) => {
    if (e.target === gate) closeGate();
  });
  ok.addEventListener('click', () => {
    if (isAdmin()) {
      setAdmin(false);
      closeGate();
      showToast('success', 'Saliste del modo administrador.');
      return;
    }
    if (input.value.trim() === PASSWORD) {
      setAdmin(true);
      closeGate();
      showToast('success', 'Modo administrador activado.');
      return;
    }
    error.classList.remove('hidden');
    input.focus();
    input.select();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ok.click();
    }
  });

  const badge = document.querySelector('.sidebar-brand-badge');
  if (badge && badge.dataset.adminArmed !== '1') {
    badge.dataset.adminArmed = '1';
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.addEventListener('click', openGate);
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openGate();
      }
    });
  }
}

export function confirmPermanentDelete(message) {
  ensureModals();
  const modal = document.getElementById('adminConfirm');
  const text = document.getElementById('adminConfirmText');
  text.textContent = message;
  modal.classList.remove('hidden');
  return new Promise((resolve) => {
    const yes = document.getElementById('adminConfirmYes');
    const no = document.getElementById('adminConfirmNo');
    const finish = (value) => {
      modal.classList.add('hidden');
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      modal.removeEventListener('click', onBackdrop);
      resolve(value);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onBackdrop = (e) => {
      if (e.target === modal) finish(false);
    };
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    modal.addEventListener('click', onBackdrop);
  });
}

async function isGasConfigured() {
  if (!window.__TAURI__?.core?.invoke) return false;
  try {
    const status = await window.__TAURI__.core.invoke('get_gas_config_status');
    return Boolean(status?.is_configured);
  } catch {
    return false;
  }
}

async function deleteGasRecord(table, id) {
  if (!window.__TAURI__?.core?.invoke) return { removed: false, reason: 'no_tauri' };
  try {
    await window.__TAURI__.core.invoke('send_gas_record', {
      table,
      action: 'delete',
      record: { id },
    });
    return { removed: true };
  } catch (err) {
    return { removed: false, reason: 'error', error: err?.message || String(err) };
  }
}

/**
 * Quita el registro de Google Sheets cuando personal o reportes están vinculados.
 */
export async function unlinkFromSheets(table, id) {
  if (!table || !id || !LINKED_TABLES.has(table)) {
    return { linked: false, removed: false };
  }

  const queued = await hasQueueRecord(table, id);
  await discardQueueRecord(table, id);

  const gasOn = await isGasConfigured();
  let token = null;
  try { token = await getValidAccessToken(); } catch { token = null; }

  if (!gasOn && !token) {
    return { linked: false, removed: false, queueCleared: queued };
  }

  let removed = false;
  let error = '';

  if (gasOn) {
    const gas = await deleteGasRecord(table, id);
    if (gas.removed) removed = true;
    else if (gas.error) error = gas.error;
  }

  if (token) {
    const api = await deleteSheetRowById(table, id);
    if (api.removed) removed = true;
    else if (api.reason === 'error' && api.error) error = error || api.error;
    else if (api.reason === 'not_found' && !gasOn) {
      return { linked: queued, removed: false, missing: true };
    }
  }

  return { linked: true, removed, error, missing: !removed && !error };
}

export function bindAdminDelete({
  buttonId = 'btnAdminDelete',
  isEditing,
  message,
  table = null,
  getId,
  removeLocal,
  after,
}) {
  const refresh = () => {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    const show = isAdmin() && Boolean(isEditing());
    btn.classList.toggle('hidden', !show);
  };

  onAdminChange(refresh);

  const btn = document.getElementById(buttonId);
  btn?.addEventListener('click', async () => {
    if (!isAdmin() || !isEditing()) return;
    const id = getId();
    if (!id) return;
    const ok = await confirmPermanentDelete(
      message || '¿Eliminar este registro de forma permanente? Esta acción no se puede deshacer.'
    );
    if (!ok) return;

    try {
      await removeLocal(id);
    } catch (err) {
      console.error(err);
      showToast('error', err?.message || 'No se pudo eliminar el registro de la base de datos.');
      return;
    }

    let sheetNote = '';
    try {
      const sheet = await unlinkFromSheets(table, id);
      if (sheet.removed) sheetNote = ' También se borró de Google Sheets.';
      else if (sheet.linked && sheet.error) sheetNote = ' No se pudo borrar de Google Sheets.';
    } catch (err) {
      console.error(err);
      sheetNote = ' No se pudo borrar de Google Sheets.';
    }

    showToast('success', `Registro eliminado de la base de datos.${sheetNote}`);
    if (after) await after();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  return refresh;
}

function start() {
  ensureModals();
  notify();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
