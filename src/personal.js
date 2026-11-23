/**
 * ============================================================================
 * PLANTILLA DE PERSONAL — Alumbrado Público (personal.js)
 * ============================================================================
 * - Vista en pantalla: tabla con búsqueda y filtros por estatus
 * - Modal para alta y edición de trabajadores
 * - Eliminación con confirmación
 * - Guardado sincronizado en SQLite / IndexedDB
 * ============================================================================
 */

import {
  initDatabase,
  savePersonal,
  deletePersonal,
  getFullName,
  listPersonalPage,
  resumenPersonal,
} from './db.js';

import {
  attachInputNormalizers,
  normalizeFinal,
} from './normalizer.js';

import { TablePaginator } from './table-pagination.js';
import { bindAdminDelete, unlinkFromSheets } from './admin-mode.js';

import {
  enqueueRecord,
  processSyncQueue,
  getPendingItems,
} from './database/repositories/syncQueue.js';

import {
  syncPersonalToGoogleSheet,
  getSheetsConfig,
  saveSheetsConfig,
  generateAuthUrl,
  openExternalUrl,
  parseAuthCode,
  exchangeCodeForTokens,
  getValidAccessToken,
  DEFAULT_SPREADSHEET_ID,
} from './googleSheets.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c]));

let resumen = { total: 0, activos: 0, inactivos: 0 };
let lastFilteredPersonal = [];
let cargaToken = 0;
let editingId = null;
let refreshAdminDelete = () => {};
let deletingId = null;
let toastTimeout = null;

const paginator = new TablePaginator({
  containerId: 'tablePagination',
  onPageChange: () => { cargarPersonal(); },
  storageKey: 'paginator_personal',
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

const TRASH_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
`;

/* --------------------------------------------------------------------------
   Notificaciones Toast
   -------------------------------------------------------------------------- */
function showToast(type, message) {
  const toast = $('toastNotification');
  const msgEl = $('toastMessage');
  const iconEl = $('toastIcon');

  if (!toast || !msgEl || !iconEl) return;

  toast.className = `toast-notification toast-${type}`;
  msgEl.textContent = message;

  if (type === 'success') {
    iconEl.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  } else {
    iconEl.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
  }

  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

$('toastClose')?.addEventListener('click', () => {
  if (toastTimeout) clearTimeout(toastTimeout);
  $('toastNotification')?.classList.add('hidden');
});

/* --------------------------------------------------------------------------
   Renderizado de la Tabla de Personal
   -------------------------------------------------------------------------- */
function renderTable(personalList, meta = {}) {
  const tbody = $('personalTableBody');
  if (!tbody) return;

  lastFilteredPersonal = personalList;
  const pageData = meta.paged ? personalList : paginator.getCurrentSlice(personalList);
  const totalFiltrado = meta.paged ? meta.total : personalList.length;

  const total = resumen.total;
  const activos = resumen.activos;
  const inactivos = resumen.inactivos;

  if ($('lblTotal')) $('lblTotal').textContent = total;
  if ($('lblActivos')) $('lblActivos').textContent = activos;
  if ($('lblInactivos')) $('lblInactivos').textContent = inactivos;

  if (pageData.length === 0) {
    const hasQuery = ($('searchInput')?.value || '').trim();
    const filtro = $('filterEstatus')?.value || 'Activo';
    const emptyText = hasQuery
      ? 'No se encontró personal con ese criterio de búsqueda.'
      : filtro === 'Activo'
        ? 'No hay personal activo registrado.'
        : filtro === 'Inactivo'
          ? 'No hay personal inactivo registrado.'
          : 'No hay personal registrado aún. Haz clic en «Nuevo personal» para registrar.';

    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty-row">
          ${emptyText}
        </td>
      </tr>
    `;
    paginator.update(totalFiltrado);
    return;
  }

  tbody.innerHTML = pageData.map((p) => {
    const nombreCompleto = getFullName(p) || '—';
    const numTrabajador = p.numero_trabajador || '—';
    const numChecador = p.numero_checador_digital || '—';
    const cargo = p.cargo || '—';
    const esActivo = (p.estatus || 'Activo') === 'Activo';
    const statusClass = esActivo ? 'badge-status-atendido' : 'badge-status-espera';
    const statusLabel = esActivo ? 'Activo' : 'Inactivo';

    return `
      <tr>
        <td><strong>${esc(numTrabajador)}</strong></td>
        <td>${esc(numChecador)}</td>
        <td><strong>${esc(nombreCompleto)}</strong></td>
        <td>${esc(cargo)}</td>
        <td><span class="badge-status ${statusClass}">${statusLabel}</span></td>
        <td class="td-center">
          <div class="table-actions">
            <button type="button" class="btn-icon-action" data-ver="${esc(p.id)}" title="Ver detalle" aria-label="Ver detalle">${EYE_ICON}</button>
            <button type="button" class="btn-icon-action" data-editar="${esc(p.id)}" title="Editar trabajador" aria-label="Editar trabajador">${PENCIL_ICON}</button>
            <button type="button" class="btn-icon-action btn-icon-action-danger admin-only-delete" data-eliminar="${esc(p.id)}" title="Eliminar trabajador" aria-label="Eliminar trabajador">${TRASH_ICON}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-ver]').forEach((btn) => {
    btn.onclick = () => openDetallePersonal(btn.dataset.ver);
  });

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.onclick = () => openModalPersonal(btn.dataset.editar);
  });

  tbody.querySelectorAll('[data-eliminar]').forEach((btn) => {
    btn.onclick = () => openModalEliminar(btn.dataset.eliminar);
  });

  paginator.update(totalFiltrado);
}

/* --------------------------------------------------------------------------
   Filtros y Búsqueda en Tiempo Real
   -------------------------------------------------------------------------- */
async function cargarPersonal({ reset = false, conResumen = false } = {}) {
  if (reset) paginator.resetPage();
  const token = ++cargaToken;
  const limit = paginator.getRowsPerPage();
  const offset = (paginator.currentPage - 1) * limit;
  const texto = ($('searchInput')?.value || '').trim();
  const estatus = $('filterEstatus')?.value || 'Activo';
  try {
    const page = await listPersonalPage({ estatus, texto, limit, offset });
    if (conResumen) resumen = await resumenPersonal();
    if (token !== cargaToken) return;
    lastFilteredPersonal = page.rows;
    renderTable(page.rows, { paged: true, total: page.total });
  } catch (err) {
    console.error('Error al cargar personal:', err);
  }
}

function applyFilterAndRender() {
  cargarPersonal({ reset: true, conResumen: true });
}

/* --------------------------------------------------------------------------
   Gestión del Modal de Personal (Alta / Edición)
   -------------------------------------------------------------------------- */
function openModalPersonal(id = null) {
  const modal = $('modalPersonal');
  const title = $('modalPersonalTitle');
  const form = $('formPersonal');
  if (!modal || !form) return;

  editingId = id;

  if (id) {
    const p = lastFilteredPersonal.find((item) => item.id === id);
    if (!p) return;
    if (title) title.textContent = 'Editar Trabajador';
    $('nombres').value = p.nombres || '';
    $('apellido1').value = p.apellido1 || '';
    $('apellido2').value = p.apellido2 || '';
    $('cargo').value = p.cargo || '';
    $('numeroTrabajador').value = p.numero_trabajador || '';
    $('numeroChecadorDigital').value = p.numero_checador_digital || '';
    $('estatusPersonal').value = p.estatus || 'Activo';
  } else {
    if (title) title.textContent = 'Nuevo Trabajador';
    form.reset();
    $('estatusPersonal').value = 'Activo';
  }

  modal.classList.remove('hidden');
  refreshAdminDelete();
  $('nombres')?.focus();
}

function closeModalPersonal() {
  editingId = null;
  $('modalPersonal')?.classList.add('hidden');
  $('formPersonal')?.reset();
  refreshAdminDelete();
}

function openDetallePersonal(id) {
  const p = lastFilteredPersonal.find((item) => item.id === id);
  if (!p) return;
  const content = $('modalDetallePersonalContent');
  if (content) {
    const rows = [
      ['Número de trabajador', p.numero_trabajador || '—'],
      ['Checador digital', p.numero_checador_digital || '—'],
      ['Nombre', getFullName(p) || '—'],
      ['Cargo', p.cargo || '—'],
      ['Estatus', p.estatus || 'Activo'],
    ];
    content.innerHTML = rows.map(([label, value]) => `
      <div class="detail-item">
        <span class="detail-label">${esc(label)}</span>
        <span class="detail-value"><strong>${esc(value)}</strong></span>
      </div>
    `).join('');
  }
  $('modalDetallePersonal')?.classList.remove('hidden');
}

refreshAdminDelete = bindAdminDelete({
  isEditing: () => Boolean(editingId),
  table: 'personal',
  message: '¿Eliminar a este trabajador de forma permanente? Si está vinculado a Google Sheets, también se borrará de ahí.',
  getId: () => editingId,
  removeLocal: (id) => deletePersonal(id),
  after: () => {
    lastFilteredPersonal = lastFilteredPersonal.filter((p) => p.id !== editingId);
    closeModalPersonal();
    applyFilterAndRender();
  },
});

/* --------------------------------------------------------------------------
   Gestión del Modal de Eliminación
   -------------------------------------------------------------------------- */
function openModalEliminar(id) {
  deletingId = id;
  const p = lastFilteredPersonal.find((item) => item.id === id);
  const nombre = p ? getFullName(p) : 'este trabajador';
  if ($('modalEliminarTexto')) {
    $('modalEliminarTexto').textContent = `¿Deseas eliminar a "${nombre}" de la plantilla?`;
  }
  $('modalEliminarPersonal')?.classList.remove('hidden');
}

function closeModalEliminar() {
  deletingId = null;
  $('modalEliminarPersonal')?.classList.add('hidden');
}

async function confirmEliminar() {
  const id = deletingId;
  closeModalEliminar();
  if (!id) return;

  try {
    await deletePersonal(id);
    const sheet = await unlinkFromSheets('personal', id);
    lastFilteredPersonal = lastFilteredPersonal.filter((p) => p.id !== id);
    const extra = sheet.removed ? ' También se borró de Google Sheets.' : (sheet.linked && sheet.error ? ' No se pudo borrar de Google Sheets.' : '');
    showToast('success', `Trabajador eliminado correctamente.${extra}`);
    applyFilterAndRender();
  } catch (err) {
    console.error('Error al eliminar trabajador:', err);
    showToast('error', 'Ocurrió un error al eliminar el trabajador.');
  }
}

/* --------------------------------------------------------------------------
   Guardado de Personal
   -------------------------------------------------------------------------- */
$('formPersonal')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    nombres: normalizeFinal($('nombres')?.value),
    apellido1: normalizeFinal($('apellido1')?.value),
    apellido2: normalizeFinal($('apellido2')?.value),
    cargo: normalizeFinal($('cargo')?.value),
    numero_trabajador: normalizeFinal($('numeroTrabajador')?.value),
    numero_checador_digital: normalizeFinal($('numeroChecadorDigital')?.value),
    estatus: $('estatusPersonal')?.value || 'Activo',
  };

  if (editingId) {
    data.id = editingId;
  }

  try {
    const saved = await savePersonal(data);
    if (editingId) {
      const idx = lastFilteredPersonal.findIndex((p) => p.id === editingId);
      if (idx >= 0) lastFilteredPersonal[idx] = { ...lastFilteredPersonal[idx], ...saved };
      showToast('success', 'Trabajador actualizado correctamente.');
    } else {
      lastFilteredPersonal.unshift(saved);
      showToast('success', 'Trabajador guardado en la base de datos.');
    }

    // Encolar de forma segura en SQLite (actualiza payload más reciente si ya estaba en cola)
    try {
      await enqueueRecord('personal', saved.id, saved);
      // Disparar sincronización con Google Apps Script en segundo plano
      processSyncQueue('personal')
        .then((syncRes) => {
          if (syncRes.synced > 0) {
            showToast('success', 'Registro sincronizado con Google Sheets (Hoja PERSONAL).');
          } else if (syncRes.failed > 0) {
            console.info('[SyncQueue] Registro pendiente de sincronización en cola local.');
          }
        })
        .catch((err) => {
          console.warn('[SyncQueue] Sincronización pendiente:', err);
        });
    } catch (queueErr) {
      console.warn('[SyncQueue] Error al encolar registro:', queueErr);
    }

    closeModalPersonal();
    applyFilterAndRender();
  } catch (err) {
    console.error('Error al guardar trabajador:', err);
    showToast('error', 'Ocurrió un error al guardar los datos del trabajador.');
  }
});

/* --------------------------------------------------------------------------
   Gestión del Modal de Google Sheets (Google Apps Script Web App)
   -------------------------------------------------------------------------- */
async function updateSheetsUI() {
  const badge = $('badgeSheetsConnection');
  const inputUrl = $('inputGasUrl');
  const queueStatus = $('syncQueueStatus');

  let isConfigured = false;

  if (window.__TAURI__?.core?.invoke) {
    try {
      const status = await window.__TAURI__.core.invoke('get_gas_config_status');
      if (status && status.is_configured) {
        isConfigured = true;
        if (badge) {
          badge.textContent = 'Configurado';
          badge.className = 'badge-status badge-tipo-oficial';
        }
        if (inputUrl && !inputUrl.value && status.endpoint_url) {
          inputUrl.placeholder = status.endpoint_url;
        }
      }
    } catch (e) {
      console.warn('Error al leer estado de Google Apps Script:', e);
    }
  }

  if (!isConfigured && badge) {
    badge.textContent = 'No configurado';
    badge.className = 'badge-status badge-status-inactivo';
  }

  // Comprobar registros pendientes en la cola local
  try {
    const pendings = await getPendingItems();
    if (queueStatus) {
      if (pendings && pendings.length > 0) {
        queueStatus.style.display = 'block';
        queueStatus.innerHTML = `⚠️ <strong>${pendings.length}</strong> registro(s) pendiente(s) de sincronizar con Google Sheets.`;
      } else {
        queueStatus.style.display = 'block';
        queueStatus.innerHTML = `✅ Todos los registros locales están sincronizados.`;
      }
    }
  } catch {
    if (queueStatus) queueStatus.style.display = 'none';
  }
}

function openModalGoogleSheets() {
  const modal = $('modalGoogleSheets');
  if (!modal) return;
  updateSheetsUI();
  modal.classList.remove('hidden');
}

function closeModalGoogleSheets() {
  $('modalGoogleSheets')?.classList.add('hidden');
}

/* --------------------------------------------------------------------------
   Inicialización
   -------------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
    console.info('[personal] initDatabase OK');
  } catch (err) {
    console.warn('Error al conectar base de datos:', err);
  }

  await cargarPersonal({ conResumen: true });
  attachInputNormalizers(document);

  $('searchInput')?.addEventListener('input', applyFilterAndRender);
  $('filterEstatus')?.addEventListener('change', applyFilterAndRender);

  $('btnNuevoPersonal')?.addEventListener('click', () => openModalPersonal(null));
  $('btnCancelarPersonal')?.addEventListener('click', closeModalPersonal);
  $('btnCerrarModalPersonalX')?.addEventListener('click', closeModalPersonal);

  $('btnEliminarNo')?.addEventListener('click', closeModalEliminar);
  $('btnCerrarDetallePersonal')?.addEventListener('click', () => $('modalDetallePersonal')?.classList.add('hidden'));
  $('btnCerrarDetallePersonalX')?.addEventListener('click', () => $('modalDetallePersonal')?.classList.add('hidden'));
  $('btnEliminarSi')?.addEventListener('click', confirmEliminar);

  $('modalPersonal')?.addEventListener('click', (e) => {
    if (e.target === $('modalPersonal')) closeModalPersonal();
  });
  $('modalEliminarPersonal')?.addEventListener('click', (e) => {
    if (e.target === $('modalEliminarPersonal')) closeModalEliminar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('modalPersonal')?.classList.contains('hidden')) closeModalPersonal();
      if (!$('modalEliminarPersonal')?.classList.contains('hidden')) closeModalEliminar();
      if (!$('modalGoogleSheets')?.classList.contains('hidden')) closeModalGoogleSheets();
    }
  });

  // Modal Google Sheets (desde el botón en la barra lateral fija)
  $('btnSidebarGoogleSheets')?.addEventListener('click', openModalGoogleSheets);
  $('btnCerrarSheetsModal')?.addEventListener('click', closeModalGoogleSheets);
  $('btnCerrarSheetsModalX')?.addEventListener('click', closeModalGoogleSheets);

  // Apertura automática si viene el parámetro ?openSheets=1
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openSheets') === '1') {
      openModalGoogleSheets();
    }
  } catch {}

  $('modalGoogleSheets')?.addEventListener('click', (e) => {
    if (e.target === $('modalGoogleSheets')) closeModalGoogleSheets();
  });

  // Guardar configuración de Google Apps Script en Rust (Credential Manager)
  $('btnGuardarGasConfig')?.addEventListener('click', async () => {
    const url = $('inputGasUrl')?.value?.trim();
    const token = $('inputGasToken')?.value?.trim();

    if (!url) {
      showToast('error', 'Por favor ingresa la URL de la aplicación web de Google Apps Script.');
      return;
    }
    if (!token) {
      showToast('error', 'Por favor ingresa el Token Secreto.');
      return;
    }

    try {
      await window.__TAURI__.core.invoke('save_gas_config', {
        endpointUrl: url,
        secretToken: token,
        endpoint_url: url,
        secret_token: token,
      });
      if ($('inputGasToken')) $('inputGasToken').value = '';
      showToast('success', 'Credenciales guardadas de forma segura en Windows.');
      await updateSheetsUI();
    } catch (err) {
      console.error('Error al guardar credenciales:', err);
      showToast('error', `Error al guardar: ${err}`);
    }
  });

  // Probar conexión HTTP desde Rust hacia Google Apps Script
  $('btnProbarConexionGas')?.addEventListener('click', async () => {
    const btn = $('btnProbarConexionGas');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Probando conexión...';
    }

    try {
      showToast('success', 'Verificando comunicación desde Rust con Google Apps Script...');
      const res = await window.__TAURI__.core.invoke('test_gas_connection');
      console.info('[GAS Test] Respuesta del Web App:', res);
      showToast('success', '¡Conexión HTTP exitosa con Google Apps Script!');
      await updateSheetsUI();
    } catch (err) {
      console.error('[GAS Test] Falló la prueba:', err);
      showToast('error', `Prueba fallida: ${err}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Probar Conexión';
      }
    }
  });

  // Sincronizar registros pendientes manualmente
  $('btnSincronizarPendientes')?.addEventListener('click', async () => {
    const btn = $('btnSincronizarPendientes');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sincronizando...';
    }

    try {
      showToast('success', 'Procesando cola de sincronización...');
      const res = await processSyncQueue();
      if (res.reason === 'not_configured') {
        showToast('error', 'Primero configura y guarda la URL y el Token Secreto.');
      } else if (res.total === 0) {
        showToast('success', 'No hay registros pendientes en la cola.');
      } else {
        showToast('success', `Sincronización: ${res.synced} enviado(s), ${res.failed} pendiente(s).`);
      }
      await updateSheetsUI();
    } catch (err) {
      console.error('Error al sincronizar pendientes:', err);
      showToast('error', `Error al sincronizar: ${err}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sincronizar Pendientes';
      }
    }
  });

  // Reintento automático cuando regresa la conexión a Internet
  window.addEventListener('online', () => {
    console.info('[SyncQueue] Conexión a internet restaurada. Procesando cola...');
    processSyncQueue().then((res) => {
      if (res.synced > 0) {
        showToast('success', `Conexión restaurada: ${res.synced} registro(s) sincronizado(s) en Google Sheets.`);
        updateSheetsUI();
      }
    }).catch(() => {});
  });
});

