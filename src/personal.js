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
  getAllPersonal,
  savePersonal,
  deletePersonal,
  getFullName,
} from './db.js';

import {
  attachInputNormalizers,
  normalizeFinal,
} from './normalizer.js';

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

let allPersonal = [];
let editingId = null;
let deletingId = null;
let toastTimeout = null;

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
function renderTable(personalList) {
  const tbody = $('personalTableBody');
  if (!tbody) return;

  // Actualizar contadores
  const total = allPersonal.length;
  const activos = allPersonal.filter((p) => (p.estatus || 'Activo') === 'Activo').length;
  const inactivos = total - activos;

  if ($('lblTotal')) $('lblTotal').textContent = total;
  if ($('lblActivos')) $('lblActivos').textContent = activos;
  if ($('lblInactivos')) $('lblInactivos').textContent = inactivos;

  if (personalList.length === 0) {
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
    return;
  }

  tbody.innerHTML = personalList.map((p) => {
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
            <button type="button" class="btn-icon-action" data-editar="${esc(p.id)}" title="Editar trabajador" aria-label="Editar trabajador">${PENCIL_ICON}</button>
            <button type="button" class="btn-icon-action btn-icon-action-danger" data-eliminar="${esc(p.id)}" title="Eliminar trabajador" aria-label="Eliminar trabajador">${TRASH_ICON}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.onclick = () => openModalPersonal(btn.dataset.editar);
  });

  tbody.querySelectorAll('[data-eliminar]').forEach((btn) => {
    btn.onclick = () => openModalEliminar(btn.dataset.eliminar);
  });
}

/* --------------------------------------------------------------------------
   Filtros y Búsqueda en Tiempo Real
   -------------------------------------------------------------------------- */
function applyFilterAndRender() {
  const query = ($('searchInput')?.value || '').trim().toLowerCase();
  const filtro = $('filterEstatus')?.value || 'Activo';

  let filtered = allPersonal.filter((p) => {
    const est = p.estatus || 'Activo';
    if (filtro === 'todos') return true;
    return est === filtro;
  });

  if (query) {
    filtered = filtered.filter((p) => {
      const full = getFullName(p).toLowerCase();
      const cargo = (p.cargo || '').toLowerCase();
      const numT = (p.numero_trabajador || '').toLowerCase();
      const numC = (p.numero_checador_digital || '').toLowerCase();
      return full.includes(query) || cargo.includes(query) || numT.includes(query) || numC.includes(query);
    });
  }

  renderTable(filtered);
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
    const p = allPersonal.find((item) => item.id === id);
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
  $('nombres')?.focus();
}

function closeModalPersonal() {
  editingId = null;
  $('modalPersonal')?.classList.add('hidden');
  $('formPersonal')?.reset();
}

/* --------------------------------------------------------------------------
   Gestión del Modal de Eliminación
   -------------------------------------------------------------------------- */
function openModalEliminar(id) {
  deletingId = id;
  const p = allPersonal.find((item) => item.id === id);
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
    allPersonal = allPersonal.filter((p) => p.id !== id);
    showToast('success', 'Trabajador eliminado correctamente.');
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
      const idx = allPersonal.findIndex((p) => p.id === editingId);
      if (idx >= 0) allPersonal[idx] = { ...allPersonal[idx], ...saved };
      showToast('success', 'Trabajador actualizado correctamente.');
    } else {
      allPersonal.unshift(saved);
      showToast('success', 'Trabajador guardado en la base de datos.');

      // Sincronización automática con Google Sheets (Hoja 3: PERSONAL desde A3)
      syncPersonalToGoogleSheet(saved)
        .then((syncRes) => {
          if (syncRes.success) {
            showToast('success', `Trabajador guardado y sincronizado en Google Sheets (${syncRes.range || 'Hoja 3'})`);
          } else if (syncRes.reason === 'missing_id') {
            console.info('[Google Sheets] Hoja no configurada aún.');
          } else if (syncRes.reason === 'unauthorized') {
            console.warn('[Google Sheets] Conecta tu cuenta en el botón de Google Sheets.');
          } else {
            console.warn('[Google Sheets] Error al sincronizar:', syncRes.error);
            showToast('error', `Guardado local OK, pero falló en Sheets: ${syncRes.error}`);
          }
        })
        .catch((err) => {
          console.error('[Google Sheets] Error en sincronización:', err);
        });
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

  if (window.__TAURI__?.core?.invoke) {
    try {
      const status = await window.__TAURI__.core.invoke('get_gas_config_status');
      if (status && status.is_configured) {
        if (badge) {
          badge.textContent = 'Configurado';
          badge.className = 'badge-status badge-tipo-oficial';
        }
        if (inputUrl && !inputUrl.value && status.endpoint_url) {
          inputUrl.placeholder = status.endpoint_url;
        }
        return;
      }
    } catch (e) {
      console.warn('Error al leer estado de Google Apps Script:', e);
    }
  }

  if (badge) {
    badge.textContent = 'No configurado';
    badge.className = 'badge-status badge-status-inactivo';
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
  } catch (err) {
    console.warn('Error al conectar base de datos:', err);
  }

  try {
    allPersonal = await getAllPersonal();
  } catch (err) {
    console.error('Error al cargar personal:', err);
    allPersonal = [];
  }

  applyFilterAndRender();
  attachInputNormalizers(document);

  $('searchInput')?.addEventListener('input', applyFilterAndRender);
  $('filterEstatus')?.addEventListener('change', applyFilterAndRender);

  $('btnNuevoPersonal')?.addEventListener('click', () => openModalPersonal(null));
  $('btnCancelarPersonal')?.addEventListener('click', closeModalPersonal);
  $('btnCerrarModalPersonalX')?.addEventListener('click', closeModalPersonal);

  $('btnEliminarNo')?.addEventListener('click', closeModalEliminar);
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

  // Modal Google Sheets
  $('btnGoogleSheets')?.addEventListener('click', openModalGoogleSheets);
  $('btnCerrarSheetsModal')?.addEventListener('click', closeModalGoogleSheets);
  $('btnCerrarSheetsModalX')?.addEventListener('click', closeModalGoogleSheets);

  $('modalGoogleSheets')?.addEventListener('click', (e) => {
    if (e.target === $('modalGoogleSheets')) closeModalGoogleSheets();
  });

  // 1. Iniciar sesión Google
  $('btnAbrirGoogleAuth')?.addEventListener('click', async () => {
    const authUrl = generateAuthUrl();
    const ok = await openExternalUrl(authUrl);
    if (!ok) {
      showToast('error', 'No se pudo abrir el navegador automáticamente. Usa el botón "Copiar enlace".');
      const notice = $('authUrlNotice');
      if (notice) notice.style.display = 'block';
    }
  });

  // Copiar enlace al portapapeles
  $('btnCopiarAuthUrl')?.addEventListener('click', async () => {
    const authUrl = generateAuthUrl();
    try {
      await navigator.clipboard.writeText(authUrl);
      showToast('success', 'Enlace de Google copiado al portapapeles.');
    } catch {
      // Fallback para portapapeles
      const ta = document.createElement('textarea');
      ta.value = authUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('success', 'Enlace de Google copiado al portapapeles.');
    }
    const notice = $('authUrlNotice');
    if (notice) notice.style.display = 'block';
  });

  // Auto-limpieza al pegar URL en el campo de código
  $('inputAuthCode')?.addEventListener('input', () => {
    const val = $('inputAuthCode').value.trim();
    if (val.toLowerCase().includes('code=')) {   // ← case-insensitive
      const extracted = parseAuthCode(val);
      if (extracted && extracted !== val) {
        $('inputAuthCode').value = extracted;
      }
    }
  });

  // 2. Canjear código de autorización
  let isConnecting = false;
  $('btnCanjearCode')?.addEventListener('click', async () => {
    if (isConnecting) return;
    const btn = $('btnCanjearCode');
    const code = $('inputAuthCode')?.value?.trim();
    if (!code) {
      showToast('error', 'Por favor ingresa la URL o el código de autorización.');
      return;
    }

    isConnecting = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Conectando...';
    }

    try {
      showToast('success', 'Conectando con Google...');
      await exchangeCodeForTokens(code);
      if ($('inputAuthCode')) $('inputAuthCode').value = '';
      updateSheetsUI();
      showToast('success', '¡Conexión exitosa con tu cuenta de Google!');
    } catch (err) {
      console.error('Error al conectar Google:', err);
      showToast('error', `Error al autenticar: ${err.message}`);
    } finally {
      isConnecting = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '2. Conectar';
      }
    }
  });

  // 3. Guardar ID de hoja
  $('btnGuardarSheetsConfig')?.addEventListener('click', () => {
    let val = $('inputSpreadsheetId')?.value?.trim() || '';
    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) val = match[1];

    saveSheetsConfig({ spreadsheetId: val, sheetName: '' });
    showToast('success', 'ID de la hoja de Google guardado correctamente.');
    updateSheetsUI();
  });

  // 4. Inserción de prueba
  $('btnTestSheetsSync')?.addEventListener('click', async () => {
    const cfg = getSheetsConfig();
    if (!cfg.spreadsheetId) {
      showToast('error', 'Primero ingresa y guarda el ID o enlace de la hoja de cálculo.');
      return;
    }
    const sample = {
      id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      nombres: 'Prueba de Conexión',
      apellido1: 'Alumbrado',
      apellido2: 'Público',
      cargo: 'Técnico de Pruebas',
      numero_trabajador: 'PR-001',
      numero_checador_digital: '9999',
      estatus: 'Activo',
    };
    showToast('success', 'Enviando registro de prueba a Google Sheets...');
    try {
      const res = await syncPersonalToGoogleSheet(sample);
      if (res.success) {
        showToast('success', `¡Prueba exitosa! Insertado en: ${res.range}`);
      } else {
        showToast('error', `Falló inserción: ${res.error || res.reason}`);
      }
    } catch (err) {
      showToast('error', `Error: ${err.message}`);
    }
  });

  // Toggle de submenú Herramientas en barra lateral
  $('btnToggleHerramientas')?.addEventListener('click', (e) => {
    e.preventDefault();
    const group = $('navGroupHerramientas');
    if (group) {
      const isOpen = group.classList.toggle('is-open');
      $('btnToggleHerramientas')?.setAttribute('aria-expanded', String(isOpen));
    }
  });
});

