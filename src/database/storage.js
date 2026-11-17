/**
 * ============================================================================
 * DATABASE / STORAGE — GESTIÓN DE ARCHIVOS DE EVIDENCIAS EN DISCO
 * ============================================================================
 * El día de la ruta es el primer día en que se adjuntó una foto a ese folio.
 * Las atenciones posteriores, aunque sean de otra fecha, cuelgan del mismo día:
 *
 *   evidencias/
 *     └── [Año]
 *         └── [Mes]
 *             └── [Semana]
 *                 └── [Día de la primera foto]
 *                     └── [Folio]
 *                         ├── [Folio]_foto1_[id].jpg          (evidencias)
 *                         ├── 01ATENCION_2026-11-16/
 *                         │     └── [Folio]_foto1_[id].jpg
 *                         └── 02ATENCION_2026-11-20/
 *                               └── [Folio]_foto1_[id].jpg
 *
 * En SQLite solo se guarda la referencia relativa.
 * ============================================================================
 */

// Caché en memoria para evitar lecturas repetidas de disco
const _imageCache = new Map();

/** Fecha local YYYY-MM-DD (no UTC). */
export function localTodayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Extrae la fecha ancla de una ruta ya guardada.
 * Sirve tanto para la estructura nueva (.../Dia-16/FOLIO/...) como para la anterior.
 */
export function anchorDateFromRelativePath(relativePath) {
  if (!relativePath || String(relativePath).startsWith('data:')) return null;
  const match = String(relativePath).match(/^(\d{4})\/(\d{2})-[^/]+\/Semana-\d+\/Dia-(\d{2})(?:\/|$)/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function earliestAnchorDate(paths) {
  const dates = (paths || []).map(anchorDateFromRelativePath).filter(Boolean).sort();
  return dates[0] || null;
}

/** Carpeta de una atención: 01ATENCION_2026-11-16 */
export function attentionFolderName(numero, fecha) {
  const n = Math.max(1, Number(numero) || 1);
  const label = String(n).padStart(2, '0');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? fecha : localTodayIso();
  return `${label}ATENCION_${day}`;
}

/**
 * Guarda una imagen bajo Año/Mes/Semana/Día/Folio[/subcarpeta].
 * `dateStr` debe ser el día ancla del folio.
 * `subfolder` vacío deja la foto dentro de la carpeta del folio (evidencias).
 */
export async function saveEvidenceFile(base64Data, dateStr, folio, photoIndex, reportId, subfolder = '') {
  if (!base64Data) return null;

  if (!base64Data.startsWith('data:image/') && !base64Data.startsWith('data:')) {
    return base64Data;
  }

  const invoke = window.__TAURI__?.core?.invoke;

  if (typeof invoke === 'function') {
    try {
      const relativePath = await invoke('save_evidence_image', {
        base64Data,
        dateStr: dateStr || localTodayIso(),
        folio: folio || 'reporte',
        photoIndex: Number(photoIndex) || 1,
        reportId: String(reportId || Date.now()),
        subfolder: subfolder || null,
      });

      _imageCache.set(relativePath, base64Data);
      return relativePath;
    } catch (err) {
      console.error('[Storage] Error al guardar imagen en disco:', err);
    }
  }

  return base64Data;
}

export async function getEvidenceRelativeDir(dateStr, folio, subfolder = '') {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== 'function') return null;
  try {
    return await invoke('evidence_relative_dir', {
      dateStr: dateStr || localTodayIso(),
      folio: folio || 'reporte',
      subfolder: subfolder || null,
    });
  } catch (err) {
    console.error('[Storage] No se pudo armar la carpeta:', err);
    return null;
  }
}

export async function moveEvidenceFile(relativePath, newRelativeDir) {
  if (!relativePath || !newRelativeDir) return relativePath;
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== 'function') return relativePath;
  const moved = await invoke('move_evidence_file', {
    relativePath,
    newRelativeDir,
  });
  if (moved && moved !== relativePath && _imageCache.has(relativePath)) {
    _imageCache.set(moved, _imageCache.get(relativePath));
    _imageCache.delete(relativePath);
  }
  return moved || relativePath;
}

/**
 * Coloca una foto en la carpeta definitiva.
 * Si ya es una ruta y la carpeta cambió (otra fecha de atención), la mueve.
 */
export async function placeEvidencePhoto(ref, { dateStr, folio, photoIndex, reportId, subfolder = '' }) {
  if (!ref) return null;

  if (String(ref).startsWith('data:image/') || String(ref).startsWith('data:')) {
    return saveEvidenceFile(ref, dateStr, folio, photoIndex, reportId, subfolder);
  }

  const targetDir = await getEvidenceRelativeDir(dateStr, folio, subfolder);
  if (!targetDir) return ref;

  const currentDir = String(ref).split('/').slice(0, -1).join('/');
  if (currentDir === targetDir) return ref;

  try {
    return await moveEvidenceFile(ref, targetDir);
  } catch (err) {
    console.warn('[Storage] No se movió la foto; se conserva la ruta anterior:', err);
    return ref;
  }
}

/**
 * Guarda o quita una foto y borra el archivo anterior si fue reemplazado.
 */
export async function commitEvidencePhoto(nextRef, previousRef, options) {
  if (!nextRef) {
    if (previousRef && !String(previousRef).startsWith('data:')) {
      await deleteEvidenceFile(previousRef);
    }
    return null;
  }

  const saved = await placeEvidencePhoto(nextRef, options);
  const savedOnDisk = saved && !String(saved).startsWith('data:');
  if (
    previousRef &&
    previousRef !== saved &&
    savedOnDisk &&
    !String(previousRef).startsWith('data:')
  ) {
    await deleteEvidenceFile(previousRef);
  }
  return saved;
}

/**
 * Carga una imagen desde su referencia relativa y retorna la Data URL (base64)
 */
export async function loadEvidenceFile(relativeOrDataUrl) {
  if (!relativeOrDataUrl) return null;

  // Si ya es DataURL, devolver directa
  if (relativeOrDataUrl.startsWith('data:image/') || relativeOrDataUrl.startsWith('data:')) {
    return relativeOrDataUrl;
  }

  // Verificar si está en memoria
  if (_imageCache.has(relativeOrDataUrl)) {
    return _imageCache.get(relativeOrDataUrl);
  }

  const invoke = window.__TAURI__?.core?.invoke;

  if (typeof invoke === 'function') {
    try {
      const dataUrl = await invoke('read_evidence_image', {
        relativePath: relativeOrDataUrl
      });
      _imageCache.set(relativeOrDataUrl, dataUrl);
      return dataUrl;
    } catch (err) {
      console.warn(`[Storage] No se pudo leer la imagen "${relativeOrDataUrl}":`, err);
    }
  }

  return null;
}

/**
 * Obtiene la ruta física absoluta de la carpeta de evidencias
 */
export async function getEvidenciasFolderPath() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke === 'function') {
    try {
      return await invoke('get_evidence_folder_path');
    } catch (err) {
      console.warn('[Storage] Error al obtener ruta de evidencias:', err);
    }
  }
  return null;
}

/**
 * Abre la carpeta de evidencias (o subcarpeta) en el explorador de Windows
 */
export async function openEvidenciasFolder(subfolder = null) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke === 'function') {
    try {
      await invoke('open_evidence_folder', { subfolder });
      return true;
    } catch (err) {
      console.error('[Storage] Error al abrir carpeta de evidencias:', err);
    }
  }
  return false;
}

/**
 * Elimina una imagen del disco
 */
export async function deleteEvidenceFile(relativePath) {
  if (!relativePath) return;

  _imageCache.delete(relativePath);

  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke === 'function') {
    try {
      await invoke('delete_evidence_image', { relativePath });
    } catch (err) {
      console.warn('[Storage] Error al eliminar imagen de disco:', err);
    }
  }
}

