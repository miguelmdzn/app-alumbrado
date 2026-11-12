/**
 * ============================================================================
 * DATABASE / MIGRATIONS — Alumbrado Público
 * ============================================================================
 * Sistema de migraciones versionadas para SQLite.
 *
 * Cómo agregar una nueva tabla al sistema:
 *   1. Crea una nueva entrada en el array MIGRATIONS con la siguiente versión.
 *   2. Escribe el SQL de creación de la tabla en `up`.
 *   3. No modifiques migraciones ya aplicadas — crea una nueva.
 *   4. La tabla `_schema_migrations` lleva el registro de qué versiones ya corrieron.
 *
 * Convención de nombres de tablas:
 *   - Siempre en snake_case y en español descriptivo.
 *   - Prefijo por dominio si hay riesgo de colisión (p.ej. "inv_", "mant_").
 * ============================================================================
 */

/**
 * Lista ordenada de migraciones.
 * Cada entrada tiene:
 *   version  → número entero único e incremental (nunca reutilizar)
 *   name     → descripción corta en snake_case (solo para logs)
 *   up       → SQL a ejecutar (puede ser múltiples sentencias separadas por ";")
 */
const MIGRATIONS = [
  // -------------------------------------------------------------------------
  // v1 — Estructura base del sistema: metadatos y tabla de control de migraciones
  // -------------------------------------------------------------------------
  {
    version: 1,
    name: 'create_schema_migrations_and_config',
    up: `
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        TEXT    NOT NULL,
        applied_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Configuración general del módulo de Alumbrado Público
      -- clave / valor genérico para cualquier parámetro del sistema
      CREATE TABLE IF NOT EXISTS config_bitacora (
        clave       TEXT PRIMARY KEY,
        valor       TEXT,
        updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `
  },

  // -------------------------------------------------------------------------
  // v2 — Tabla de evidencias de bitácora diaria
  // -------------------------------------------------------------------------
  {
    version: 2,
    name: 'create_evidencias',
    up: `
      CREATE TABLE IF NOT EXISTS evidencias (
        id               TEXT    PRIMARY KEY,
        folio            TEXT    NOT NULL,
        solicitante      TEXT,
        fecha_atencion   TEXT,
        hora_atencion    TEXT,
        personal_atendio TEXT,
        turno            TEXT,
        ubicacion        TEXT,
        latitud          REAL,
        longitud         REAL,
        altitud          TEXT,
        enlace_maps      TEXT,
        observaciones    TEXT,
        estatus          TEXT    NOT NULL DEFAULT 'Atendido',
        tipo_reporte     TEXT,
        foto1            TEXT,
        foto2            TEXT,
        created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_evidencias_fecha
        ON evidencias (fecha_atencion);

      CREATE INDEX IF NOT EXISTS idx_evidencias_folio
        ON evidencias (folio);

      CREATE INDEX IF NOT EXISTS idx_evidencias_estatus
        ON evidencias (estatus);
    `
  },

  // -------------------------------------------------------------------------
  // v3 — Tabla de reportes de fallas y lámparas de Alumbrado Público
  // -------------------------------------------------------------------------
  {
    version: 3,
    name: 'create_reportes',
    up: `
      CREATE TABLE IF NOT EXISTS reportes (
        id                TEXT PRIMARY KEY,
        folio             TEXT NOT NULL,
        fecha             TEXT,
        atendio           TEXT,
        usuario           TEXT,
        direccion         TEXT,
        colonia_comunidad TEXT,
        telefono          TEXT,
        numero_lamparas   INTEGER DEFAULT 1,
        tipo_lampara      TEXT,
        tipo_falla        TEXT,
        observaciones     TEXT,
        referencias       TEXT,
        entre_calles      TEXT,
        estatus           TEXT NOT NULL DEFAULT 'Pendiente',
        created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_reportes_folio
        ON reportes (folio);

      CREATE INDEX IF NOT EXISTS idx_reportes_fecha
        ON reportes (fecha);

      CREATE INDEX IF NOT EXISTS idx_reportes_colonia
        ON reportes (colonia_comunidad);
    `
  },

  // -------------------------------------------------------------------------
  // v4 — Índice de estatus en reportes para optimizar consultas y reportes
  // -------------------------------------------------------------------------
  {
    version: 4,
    name: 'add_index_reportes_estatus',
    up: `
      CREATE INDEX IF NOT EXISTS idx_reportes_estatus
        ON reportes (estatus);
    `
  },

  // -------------------------------------------------------------------------
  // v5 — Tabla de personal de Alumbrado Público
  // -------------------------------------------------------------------------
  {
    version: 5,
    name: 'create_personal',
    up: `
      CREATE TABLE IF NOT EXISTS personal (
        id                       TEXT PRIMARY KEY,
        nombres                  TEXT,
        apellido1                TEXT,
        apellido2                TEXT,
        cargo                    TEXT,
        numero_trabajador        TEXT,
        numero_checador_digital  TEXT,
        estatus                  TEXT DEFAULT 'Activo',
        created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_personal_estatus
        ON personal (estatus);

      CREATE INDEX IF NOT EXISTS idx_personal_nombres
        ON personal (nombres, apellido1);
    `
  },

  // -------------------------------------------------------------------------
  // v6 — Tabla de días inhábiles (oficiales de México y asuetos municipales)
  // -------------------------------------------------------------------------
  {
    version: 6,
    name: 'create_dias_inhabiles',
    up: `
      CREATE TABLE IF NOT EXISTS dias_inhabiles (
        id           TEXT PRIMARY KEY,
        fecha        TEXT NOT NULL,
        descripcion  TEXT NOT NULL,
        tipo         TEXT NOT NULL DEFAULT 'Oficial',
        year         INTEGER NOT NULL,
        activo       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_dias_inhabiles_fecha
        ON dias_inhabiles (fecha);

      CREATE INDEX IF NOT EXISTS idx_dias_inhabiles_year
        ON dias_inhabiles (year);

      CREATE INDEX IF NOT EXISTS idx_dias_inhabiles_tipo
        ON dias_inhabiles (tipo);

      CREATE INDEX IF NOT EXISTS idx_dias_inhabiles_activo
        ON dias_inhabiles (activo);
    `
  },

  // -------------------------------------------------------------------------
  // v7 — Cola de sincronización segura offline-first (Google Sheets / GAS)
  // -------------------------------------------------------------------------
  {
    version: 7,
    name: 'create_sync_queue',
    up: `
      CREATE TABLE IF NOT EXISTS sync_queue (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name    TEXT NOT NULL,
        record_id     TEXT NOT NULL,
        payload_json  TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        last_error    TEXT,
        retry_count   INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced_at     TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_unique_record
        ON sync_queue (table_name, record_id);

      CREATE INDEX IF NOT EXISTS idx_sync_status
        ON sync_queue (status);
    `
  },

  // -------------------------------------------------------------------------
  // v8 — Agrega tipo_localidad a reportes (preserva datos existentes)
  // -------------------------------------------------------------------------
  {
    version: 8,
    name: 'add_tipo_localidad_to_reportes',
    up: `
      ALTER TABLE reportes ADD COLUMN tipo_localidad TEXT DEFAULT 'Cabecera municipal (Valle de Santiago)'
    `
  },

  // -------------------------------------------------------------------------
  // v9 — Tabla de localidades (colonias y comunidades del municipio)
  // -------------------------------------------------------------------------
  {
    version: 9,
    name: 'create_localidades',
    up: `
      CREATE TABLE IF NOT EXISTS localidades (
        id         TEXT PRIMARY KEY,
        nombre     TEXT NOT NULL,
        tipo       TEXT NOT NULL DEFAULT 'Cabecera municipal',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_localidades_nombre_tipo ON localidades (nombre, tipo);
      CREATE INDEX IF NOT EXISTS idx_localidades_tipo ON localidades (tipo)
    `
  },

  // -------------------------------------------------------------------------
  // v10 — Solicitudes de instalación de lámparas (tabla nueva, independiente)
  // -------------------------------------------------------------------------
  {
    version: 10,
    name: 'create_solicitudes_instalacion_lamparas',
    up: `
      CREATE TABLE IF NOT EXISTS solicitudes_instalacion_lamparas (
        id                  TEXT PRIMARY KEY,
        nombre_solicitante  TEXT,
        fecha_solicitud     TEXT,
        tipo_localidad      TEXT DEFAULT 'Cabecera municipal (Valle de Santiago)',
        descripcion         TEXT,
        estatus             TEXT NOT NULL DEFAULT 'En espera',
        cantidad_lamparas   INTEGER DEFAULT 1,
        observaciones       TEXT,
        created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_solicitudes_lamparas_fecha
        ON solicitudes_instalacion_lamparas (fecha_solicitud);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_lamparas_estatus
        ON solicitudes_instalacion_lamparas (estatus);

      CREATE INDEX IF NOT EXISTS idx_solicitudes_lamparas_tipo_localidad
        ON solicitudes_instalacion_lamparas (tipo_localidad);
    `
  },

  // -------------------------------------------------------------------------
  // v11 — Agregar colonia_comunidad a solicitudes_instalacion_lamparas
  // -------------------------------------------------------------------------
  {
    version: 11,
    name: 'add_colonia_comunidad_to_solicitudes',
    up: `
      ALTER TABLE solicitudes_instalacion_lamparas ADD COLUMN colonia_comunidad TEXT;
    `
  },

  // -------------------------------------------------------------------------
  // v12 — Agregar telefono a solicitudes_instalacion_lamparas
  // -------------------------------------------------------------------------
  {
    version: 12,
    name: 'add_telefono_to_solicitudes_lamparas',
    up: `
      ALTER TABLE solicitudes_instalacion_lamparas ADD COLUMN telefono TEXT;
    `
  },

  // -------------------------------------------------------------------------
  // v13 — Tabla de lámparas LED instaladas (registro de instalaciones en campo)
  // -------------------------------------------------------------------------
  {
    version: 13,
    name: 'create_lamparas_instaladas',
    up: `
      CREATE TABLE IF NOT EXISTS lamparas_instaladas (
        id                TEXT PRIMARY KEY,
        folio             TEXT,
        fecha             TEXT,
        hora              TEXT,
        tipo_lampara      TEXT,
        ubicacion         TEXT,
        latitud           REAL,
        longitud          REAL,
        altitud           TEXT,
        enlace_maps       TEXT,
        observaciones     TEXT,
        foto1             TEXT,
        foto2             TEXT,
        personal_instalo  TEXT,
        created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_lamparas_instaladas_folio
        ON lamparas_instaladas (folio);

      CREATE INDEX IF NOT EXISTS idx_lamparas_instaladas_fecha
        ON lamparas_instaladas (fecha);
    `
  },

  // -------------------------------------------------------------------------
  // v14 — Agregar personal_instalo a evidencias
  // -------------------------------------------------------------------------
  {
    version: 14,
    name: 'add_personal_instalo_to_evidencias',
    up: `
      ALTER TABLE evidencias ADD COLUMN personal_instalo TEXT;
    `
  },

  // -------------------------------------------------------------------------
  // → PLANTILLA para futuras tablas — copiar y ajustar
  //
  // {
  //   version: 3,
  //   name: 'create_<nombre_tabla>',
  //   up: `
  //     CREATE TABLE IF NOT EXISTS <nombre_tabla> (
  //       id          TEXT PRIMARY KEY,
  //       ...campos...
  //       created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  //     );
  //   `
  // },
  // -------------------------------------------------------------------------
];

/**
 * Ejecuta todas las migraciones pendientes sobre la conexión dada.
 * Es seguro llamarlo en cada arranque: salta las versiones ya aplicadas.
 *
 * @param {object} conn - Objeto de conexión SQLite del core.
 */
export async function runMigrations(conn) {
  if (!conn) return;

  try {
    // Asegurar que la tabla de control exista (bootstrap mínimo)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        TEXT    NOT NULL,
        applied_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Leer versiones ya aplicadas
    const applied = await conn.select(
      'SELECT version FROM _schema_migrations ORDER BY version ASC;'
    );
    const appliedVersions = new Set((applied || []).map((r) => r.version));

    // Correr sólo las pendientes, en orden
    for (const migration of MIGRATIONS) {
      if (appliedVersions.has(migration.version)) continue;

      console.info(`[Migrations] Aplicando v${migration.version}: ${migration.name}`);

      // Ejecutar cada sentencia individualmente (plugin-sql no soporta multi-statement nativo)
      const statements = migration.up
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        await conn.execute(stmt + ';');
      }

      // Registrar como aplicada
      await conn.execute(
        'INSERT INTO _schema_migrations (version, name) VALUES ($1, $2);',
        [migration.version, migration.name]
      );

      console.info(`[Migrations] v${migration.version} completada.`);
    }

    console.info('[Migrations] Esquema actualizado correctamente.');
  } catch (err) {
    console.error('[Migrations] Error al correr migraciones:', err);
  }
}

