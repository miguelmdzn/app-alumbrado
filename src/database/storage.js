/**
 * ============================================================================
 * DATABASE / STORAGE — GESTIÓN DE ARCHIVOS DE EVIDENCIAS EN DISCO
 * ============================================================================
 * Estructura de carpetas en disco:
 *   evidencias/
 *     └── [Año] (ej. 2026)
 *         └── [Mes] (ej. 11-Noviembre)
 *             └── [Semana] (ej. Semana-45)
 *                 └── [Día] (ej. Dia-04)
 *                     └── [Folio]_foto[1|2]_[id].jpg
 *
 * En la Base de Datos (SQLite) se almacena únicamente la referencia relativa:
 *   "2026/11-Noviembre/Semana-45/Dia-04/AP-2026-001_foto1_3b12f1df.jpg"
 * ============================================================================
 */

// Caché en memoria para evitar lecturas repetidas de disco
const _imageCache = new Map();

/**
 * Guarda una imagen en la jerarquía de carpetas física (Año/Mes/Semana/Día).
 * Retorna la referencia relativa para almacenar en la BD.
 */
export async function saveEvidenceFile(base64Data, dateStr, folio, photoIndex, reportId) {
  if (!base64Data) return null;

  // Si ya es una ruta relativa existente en disco (no es base64 data URL), devolverla tal cual
  if (!base64Data.startsWith('data:image/') && !base64Data.startsWith('data:')) {
    return base64Data;
  }

  const invoke = window.__TAURI__?.core?.invoke;

  if (typeof invoke === 'function') {
    try {
      const relativePath = await invoke('save_evidence_image', {
        base64Data,
        dateStr: dateStr || new Date().toISOString().slice(0, 10),
        folio: folio || 'reporte',
        photoIndex: Number(photoIndex) || 1,
        reportId: String(reportId || Date.now())
      });

      // Guardar en caché en memoria la dataURL asociada a esta ruta
      _imageCache.set(relativePath, base64Data);
      return relativePath;
    } catch (err) {
      console.error('[Storage] Error al guardar imagen en disco:', err);
    }
  }

  // Fallback para entorno web (conservar DataURL en IndexedDB)
  return base64Data;
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

