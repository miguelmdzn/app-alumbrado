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
  listEvidenciasPage,
  listEvidenciasMatching,
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
  listReportesPage,
  listReportesMatching,
  resumenReportes,
} from './database/repositories/reportes.js';

// ---- Repositorio: personal (plantilla de trabajadores) ---------------------
export {
  savePersonal,
  getAllPersonal,
  deletePersonal,
  getPersonalById,
  getFullName,
  listPersonalPage,
  resumenPersonal,
} from './database/repositories/personal.js';

// ---- Repositorio: dias_inhabiles (feriados oficiales y asuetos municipales) -
export {
  saveDiaInhabil,
  getAllDiasInhabiles,
  getDiaInhabilById,
  deleteDiaInhabil,
  listDiasPage,
  resumenDiasInhabiles,
  syncOfficialHolidays,
  getActiveHolidaysSet,
  countBusinessDays,
  estatusPorDiasHabiles,
  getOfficialMexicanHolidays,
} from './database/repositories/diasInhabiles.js';

// ---- Repositorio: solicitudes de instalación de lámparas --------------------
export {
  saveSolicitudLampara,
  getAllSolicitudesLamparas,
  getSolicitudLamparaById,
  deleteSolicitudLampara,
  listSolicitudesPage,
} from './database/repositories/solicitudesLamparas.js';

// ---- Repositorio: localidades (colonias y comunidades del municipio) --------
export {
  getAllLocalidades,
  listLocalidadesPage,
  searchLocalidades,
  saveLocalidad,
  updateLocalidad,
  deleteLocalidad,
  findOrCreateLocalidad,
} from './database/repositories/localidades.js';

// ---- Repositorio: lámparas LED instaladas en campo --------------------------
export {
  saveLamparaInstalada,
  getAllLamparasInstaladas,
  getLamparaInstaladaById,
  deleteLamparaInstalada,
  listLamparasPage,
} from './database/repositories/lamparasInstaladas.js';

// ---- Repositorio: atenciones de un reporte (ligadas por folio) --------------
export {
  saveAtencion,
  getAtencionesByFolio,
  getAtencionesParaImpresion,
  getAtencionById,
  deleteAtencion,
} from './database/repositories/atenciones.js';

// ---- Repositorio: catálogo de vehículos (control de combustibles) ----------
export {
  saveVehiculo,
  getAllVehiculos,
  getVehiculoById,
  deleteVehiculo,
  listVehiculosPage,
} from './database/repositories/vehiculos.js';

// ---- Repositorio: bitácoras de combustible (no mueven el presupuesto) -------
export {
  saveBitacoraGasolina,
  getBitacorasGasolina,
  getBitacoraGasolinaById,
  deleteBitacoraGasolina,
  listBitacorasPage,
  ultimasCargasVehiculo,
} from './database/repositories/bitacorasGasolina.js';
