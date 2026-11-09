/**
 * ============================================================================
 * DATABASE — PUNTO DE ENTRADA PÚBLICO (db.js)
 * Base de datos: alumbrado_publico.db
 * ============================================================================
 *
 * Este archivo es la única puerta de acceso a la base de datos desde main.js
 * y cualquier otro módulo de la UI.
 *
 * Arquitectura:
 *
 *   db.js                     ← Aquí estás (re-exportaciones)
 *   database/
 *     core.js                 ← Conexión SQLite + IDB + generateUUID
 *     migrations.js           ← Migraciones versionadas del esquema
 *     repositories/
 *       evidencias.js         ← Tabla evidencias  (bitácora diaria)
 *       config.js             ← Tabla config_bitacora (metadatos / configuración)
 *       <nueva_tabla>.js      ← Agrega aquí nuevos repositorios
 *
 * Para agregar una nueva tabla al sistema:
 *   1. Crea `database/repositories/<modulo>.js`
 *   2. Añade la migración en `database/migrations.js`
 *   3. Re-exporta las funciones públicas aquí abajo
 *   4. Registra el object store IDB en `database/core.js → IDB_STORES`
 *
 * Ubicación del archivo de base de datos en disco:
 *   Windows → C:\Users\<usuario>\AppData\Roaming\com.v1.app-bitacora\alumbrado_publico.db
 *   macOS   → ~/Library/Application Support/com.v1.app-bitacora/alumbrado_publico.db
 *   Linux   → ~/.local/share/com.v1.app-bitacora/alumbrado_publico.db
 *
 * ============================================================================
 */

// Core — inicialización y UUID
export { initDatabase, generateUUID, DB_NAME } from './database/core.js';

// ---- Repositorio: evidencias (bitácora diaria de reportes) ----------------
export {
  saveEvidencia,
  getAllEvidencias,
  getEvidenciaById,
  deleteEvidencia,
  clearAllEvidencias,
} from './database/repositories/evidencias.js';

// ---- Repositorio: config_bitacora (metadatos y configuración) -------------
export {
  saveConfig,
  loadConfig,
  saveMetadatos,
  loadMetadatos,
} from './database/repositories/config.js';

// ---- Almacenamiento físico de evidencias en disco (Año / Mes / Semana / Día)
export {
  saveEvidenceFile,
  loadEvidenceFile,
  getEvidenciasFolderPath,
  openEvidenciasFolder,
  deleteEvidenceFile,
} from './database/storage.js';

// ---- Repositorio: reportes (reportes ciudadanos y fallas de lámparas) ----
export {
  saveReporte,
  getAllReportes,
  deleteReporte,
  getReporteById,
} from './database/repositories/reportes.js';

// ---- Repositorio: personal (plantilla de trabajadores) ---------------------
export {
  savePersonal,
  getAllPersonal,
  deletePersonal,
  getPersonalById,
  getFullName,
} from './database/repositories/personal.js';

// ---- Repositorio: dias_inhabiles (feriados oficiales y asuetos municipales) -
export {
  saveDiaInhabil,
  getAllDiasInhabiles,
  getDiaInhabilById,
  deleteDiaInhabil,
  syncOfficialHolidays,
  getActiveHolidaysSet,
  countBusinessDays,
  getOfficialMexicanHolidays,
} from './database/repositories/diasInhabiles.js';
