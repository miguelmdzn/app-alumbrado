//! Presupuesto semanal de combustible.
//! Los importes viven en centavos. El saldo de cada vehículo se calcula
//! con el presupuesto inicial y las transferencias; no se edita a mano.

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::ops::Deref;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const PRESUPUESTO_CENTAVOS: i64 = 450_000;

#[derive(Debug, Clone)]
struct Columna {
    vehiculo_id: String,
    placas: String,
    saldo_centavos: i64,
    monto_centavos: i64,
}

#[derive(Debug, Clone)]
struct Movimiento {
    origen_id: String,
    origen_placas: String,
    destino_id: String,
    destino_placas: String,
    importe: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbrirPayload {
    pub fecha_inicio: String,
    pub fecha_fin: String,
    pub vehiculo_inicial_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferirPayload {
    pub periodo_id: String,
    pub vehiculo_origen_id: String,
    pub vehiculo_destino_id: String,
    pub importe_centavos: i64,
    pub fecha_movimiento: String,
    pub observaciones: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditarMovimientoPayload {
    pub id: String,
    pub vehiculo_origen_id: String,
    pub vehiculo_destino_id: String,
    pub importe_centavos: i64,
    pub fecha_movimiento: String,
    pub observaciones: String,
}

fn map_err(err: rusqlite::Error) -> String {
    let msg = err.to_string();
    if msg.contains("no such table") {
        return "Falta actualizar la base de datos. Cierra y vuelve a abrir la aplicación.".into();
    }
    format!("No se pudo completar la operación de combustible: {msg}")
}

fn fecha_iso(valor: &str) -> bool {
    let bytes = valor.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let mes: u32 = valor[5..7].parse().unwrap_or(0);
    let dia: u32 = valor[8..10].parse().unwrap_or(0);
    (1..=12).contains(&mes) && (1..=31).contains(&dia)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("alumbrado_publico.db"))
}

fn abrir_conexion(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    if !path.exists() {
        return Err(
            "No se encontró la base de datos. Abre la aplicación para prepararla.".into(),
        );
    }
    let conn = Connection::open(path).map_err(map_err)?;
    conn.busy_timeout(Duration::from_secs(8)).map_err(map_err)?;
    conn.pragma_update(None, "foreign_keys", 1_i64)
        .map_err(map_err)?;
    Ok(conn)
}

fn saldo(conn: &Connection, periodo_id: &str, vehiculo_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT
            (CASE WHEN ?2 = p.vehiculo_inicial_id THEN p.presupuesto_inicial ELSE 0 END)
            + CAST(COALESCE((SELECT SUM(importe) FROM movimientos_combustible
                WHERE periodo_id = p.id AND vehiculo_destino_id = ?2), 0) AS INTEGER)
            - CAST(COALESCE((SELECT SUM(importe) FROM movimientos_combustible
                WHERE periodo_id = p.id AND vehiculo_origen_id = ?2), 0) AS INTEGER)
         FROM periodos_combustible p
         WHERE p.id = ?1",
        params![periodo_id, vehiculo_id],
        |row| row.get(0),
    )
    .map_err(map_err)
}

fn columnas_ajuste(inicial_id: &str, presupuesto: i64, movs: &[Movimiento]) -> (Vec<Columna>, Vec<Columna>) {
    let mut running: HashMap<String, i64> = HashMap::new();
    running.insert(inicial_id.to_string(), presupuesto);
    let mut placas: HashMap<String, String> = HashMap::new();
    let mut first_out: HashMap<String, i64> = HashMap::new();
    let mut first_in: HashMap<String, i64> = HashMap::new();
    let mut sum_out: HashMap<String, i64> = HashMap::new();
    let mut sum_in: HashMap<String, i64> = HashMap::new();
    let mut orden_out: Vec<String> = Vec::new();
    let mut orden_in: Vec<String> = Vec::new();

    for mov in movs {
        placas.insert(mov.origen_id.clone(), mov.origen_placas.clone());
        placas.insert(mov.destino_id.clone(), mov.destino_placas.clone());
        let saldo_origen = running.get(&mov.origen_id).copied().unwrap_or(0);
        let saldo_destino = running.get(&mov.destino_id).copied().unwrap_or(0);
        if !first_out.contains_key(&mov.origen_id) {
            first_out.insert(mov.origen_id.clone(), saldo_origen);
            orden_out.push(mov.origen_id.clone());
        }
        if !first_in.contains_key(&mov.destino_id) {
            first_in.insert(mov.destino_id.clone(), saldo_destino);
            orden_in.push(mov.destino_id.clone());
        }
        *sum_out.entry(mov.origen_id.clone()).or_insert(0) += mov.importe;
        *sum_in.entry(mov.destino_id.clone()).or_insert(0) += mov.importe;
        running.insert(mov.origen_id.clone(), saldo_origen - mov.importe);
        running.insert(mov.destino_id.clone(), saldo_destino + mov.importe);
    }

    let restar = orden_out
        .into_iter()
        .map(|id| Columna {
            placas: placas.get(&id).cloned().unwrap_or_default(),
            saldo_centavos: first_out[&id],
            monto_centavos: sum_out[&id],
            vehiculo_id: id.clone(),
        })
        .collect();
    let sumar = orden_in
        .into_iter()
        .map(|id| Columna {
            placas: placas.get(&id).cloned().unwrap_or_default(),
            saldo_centavos: first_in[&id],
            monto_centavos: sum_in[&id],
            vehiculo_id: id.clone(),
        })
        .collect();
    (restar, sumar)
}

fn columna_json(col: &Columna) -> Value {
    json!({
        "vehiculoId": col.vehiculo_id,
        "placas": col.placas,
        "saldoCentavos": col.saldo_centavos,
        "montoCentavos": col.monto_centavos,
    })
}

fn detalle(conn: &Connection, periodo_id: &str) -> Result<Value, String> {
    let periodo = conn
        .query_row(
            "SELECT p.id, p.fecha_inicio, p.fecha_fin, p.vehiculo_inicial_id,
                    COALESCE(v.placas, ''), p.presupuesto_inicial, p.sobrante, p.estado,
                    p.created_at, p.closed_at
             FROM periodos_combustible p
             LEFT JOIN vehiculos v ON v.id = p.vehiculo_inicial_id
             WHERE p.id = ?1",
            [periodo_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            },
        )
        .optional()
        .map_err(map_err)?
        .ok_or_else(|| "No se encontró el periodo.".to_string())?;

    let mut mov_stmt = conn
        .prepare(
            "SELECT m.id, m.vehiculo_origen_id, COALESCE(o.placas, m.vehiculo_origen_id),
                    m.vehiculo_destino_id, COALESCE(d.placas, m.vehiculo_destino_id),
                    m.importe, m.fecha_movimiento, COALESCE(m.observaciones, ''), m.created_at
             FROM movimientos_combustible m
             LEFT JOIN vehiculos o ON o.id = m.vehiculo_origen_id
             LEFT JOIN vehiculos d ON d.id = m.vehiculo_destino_id
             WHERE m.periodo_id = ?1
             ORDER BY m.fecha_movimiento ASC, m.created_at ASC, m.id ASC",
        )
        .map_err(map_err)?;
    let mov_rows = mov_stmt
        .query_map([periodo_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(map_err)?;

    let mut movimientos_json = Vec::new();
    let mut movimientos = Vec::new();
    for item in mov_rows {
        let (id, origen_id, origen_placas, destino_id, destino_placas, importe, fecha, obs, created) =
            item.map_err(map_err)?;
        movimientos.push(Movimiento {
            origen_id: origen_id.clone(),
            origen_placas: origen_placas.clone(),
            destino_id: destino_id.clone(),
            destino_placas: destino_placas.clone(),
            importe,
        });
        movimientos_json.push(json!({
            "id": id,
            "origenId": origen_id,
            "origenPlacas": origen_placas,
            "destinoId": destino_id,
            "destinoPlacas": destino_placas,
            "importeCentavos": importe,
            "fechaMovimiento": fecha,
            "observaciones": obs,
            "createdAt": created,
        }));
    }

    let mut saldo_stmt = conn
        .prepare(
            "SELECT v.id, COALESCE(v.placas, ''), COALESCE(v.marca, ''),
                    COALESCE(v.estado, 'Activo'),
                    (CASE WHEN v.id = ?2 THEN ?3 ELSE 0 END)
                    + CAST(COALESCE((SELECT SUM(importe) FROM movimientos_combustible
                        WHERE periodo_id = ?1 AND vehiculo_destino_id = v.id), 0) AS INTEGER)
                    - CAST(COALESCE((SELECT SUM(importe) FROM movimientos_combustible
                        WHERE periodo_id = ?1 AND vehiculo_origen_id = v.id), 0) AS INTEGER)
             FROM vehiculos v
             ORDER BY COALESCE(v.placas, v.numero_serie) COLLATE NOCASE",
        )
        .map_err(map_err)?;
    let saldo_rows = saldo_stmt
        .query_map(
            params![periodo_id, periodo.3, periodo.5],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            },
        )
        .map_err(map_err)?;

    let mut saldos = Vec::new();
    let mut disponible = 0_i64;
    for item in saldo_rows {
        let (id, placas, marca, estado, saldo_centavos) = item.map_err(map_err)?;
        disponible += saldo_centavos;
        saldos.push(json!({
            "vehiculoId": id,
            "placas": placas,
            "marca": marca,
            "estado": estado,
            "saldoCentavos": saldo_centavos,
        }));
    }

    let (restar, sumar) = columnas_ajuste(&periodo.3, periodo.5, &movimientos);

    Ok(json!({
        "periodo": {
            "id": periodo.0,
            "fechaInicio": periodo.1,
            "fechaFin": periodo.2,
            "vehiculoInicialId": periodo.3,
            "vehiculoInicialPlacas": periodo.4,
            "presupuestoCentavos": periodo.5,
            "sobranteCentavos": periodo.6,
            "estado": periodo.7,
            "createdAt": periodo.8,
            "closedAt": periodo.9,
        },
        "movimientos": movimientos_json,
        "saldos": saldos,
        "restar": restar.iter().map(columna_json).collect::<Vec<_>>(),
        "sumar": sumar.iter().map(columna_json).collect::<Vec<_>>(),
        "disponibleCentavos": disponible,
    }))
}

fn abrir_periodo(conn: &mut Connection, payload: &AbrirPayload) -> Result<String, String> {
    let inicio = payload.fecha_inicio.trim();
    let fin = payload.fecha_fin.trim();
    let vehiculo = payload.vehiculo_inicial_id.trim();
    if !fecha_iso(inicio) || !fecha_iso(fin) {
        return Err("Indica la fecha de inicio y la fecha de fin de la semana.".into());
    }
    if fin < inicio {
        return Err("La fecha final queda antes de la fecha inicial.".into());
    }
    if vehiculo.is_empty() {
        return Err("Selecciona el vehículo que recibe el presupuesto.".into());
    }

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_err)?;
    let abierto: Option<String> = tx
        .query_row(
            "SELECT id FROM periodos_combustible WHERE estado = 'ABIERTO' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(map_err)?;
    if abierto.is_some() {
        return Err("Ya hay un periodo abierto. Ciérralo para iniciar la siguiente semana.".into());
    }

    let estado: String = tx
        .query_row(
            "SELECT estado FROM vehiculos WHERE id = ?1",
            [vehiculo],
            |row| row.get(0),
        )
        .optional()
        .map_err(map_err)?
        .ok_or_else(|| "El vehículo no está en el catálogo.".to_string())?;
    if estado != "Activo" {
        return Err("El vehículo que recibe el presupuesto debe estar activo.".into());
    }

    let id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO periodos_combustible
            (id, fecha_inicio, fecha_fin, vehiculo_inicial_id, presupuesto_inicial, estado)
         VALUES (?1, ?2, ?3, ?4, ?5, 'ABIERTO')",
        params![id, inicio, fin, vehiculo, PRESUPUESTO_CENTAVOS],
    )
    .map_err(map_err)?;
    tx.commit().map_err(map_err)?;
    Ok(id)
}

fn transferir(conn: &mut Connection, payload: &TransferirPayload) -> Result<(), String> {
    let periodo_id = payload.periodo_id.trim();
    let origen = payload.vehiculo_origen_id.trim();
    let destino = payload.vehiculo_destino_id.trim();
    let fecha = payload.fecha_movimiento.trim();
    let obs = payload.observaciones.trim();
    if periodo_id.is_empty() {
        return Err("Selecciona el periodo.".into());
    }
    if origen.is_empty() || destino.is_empty() {
        return Err("Selecciona el vehículo de origen y el de destino.".into());
    }
    if origen == destino {
        return Err("El origen y el destino son el mismo vehículo.".into());
    }
    if payload.importe_centavos <= 0 {
        return Err("El importe de la transferencia debe ser mayor a cero.".into());
    }
    if !fecha_iso(fecha) {
        return Err("Indica la fecha del movimiento.".into());
    }

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_err)?;
    let periodo: Option<(String, String, String)> = tx
        .query_row(
            "SELECT estado, fecha_inicio, fecha_fin FROM periodos_combustible WHERE id = ?1",
            [periodo_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(map_err)?;
    let Some((estado, inicio, fin)) = periodo else {
        return Err("No se encontró el periodo.".into());
    };
    if estado != "ABIERTO" {
        return Err("El periodo está cerrado. Sus movimientos quedan como quedaron.".into());
    }
    if fecha < inicio.as_str() || fecha > fin.as_str() {
        return Err("La fecha del movimiento queda fuera de la semana del periodo.".into());
    }

    for serie in [origen, destino] {
        let existe: Option<String> = tx
            .query_row(
                "SELECT id FROM vehiculos WHERE id = ?1",
                [serie],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_err)?;
        if existe.is_none() {
            return Err("Uno de los vehículos no está en el catálogo.".into());
        }
    }

    let disponible = saldo(tx.deref(), periodo_id, origen)?;
    if payload.importe_centavos > disponible {
        return Err("El importe supera el saldo disponible del vehículo de origen.".into());
    }

    tx.execute(
        "INSERT INTO movimientos_combustible
            (id, periodo_id, vehiculo_origen_id, vehiculo_destino_id, importe, fecha_movimiento, observaciones)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            Uuid::new_v4().to_string(),
            periodo_id,
            origen,
            destino,
            payload.importe_centavos,
            fecha,
            obs,
        ],
    )
    .map_err(map_err)?;
    tx.commit().map_err(map_err)?;
    Ok(())
}

fn asegurar_saldos(conn: &Connection, periodo_id: &str) -> Result<(), String> {
    let (inicial, presupuesto): (String, i64) = conn
        .query_row(
            "SELECT vehiculo_inicial_id, presupuesto_inicial FROM periodos_combustible WHERE id = ?1",
            [periodo_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(map_err)?;
    let mut stmt = conn
        .prepare(
            "SELECT vehiculo_origen_id, vehiculo_destino_id, importe
             FROM movimientos_combustible
             WHERE periodo_id = ?1
             ORDER BY fecha_movimiento, created_at, id",
        )
        .map_err(map_err)?;
    let filas = stmt
        .query_map([periodo_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(map_err)?;
    let mut running: HashMap<String, i64> = HashMap::new();
    running.insert(inicial, presupuesto);
    for fila in filas {
        let (origen, destino, importe) = fila.map_err(map_err)?;
        let saldo_origen = running.get(&origen).copied().unwrap_or(0);
        if importe > saldo_origen {
            return Err("El cambio deja un saldo negativo en la cadena de transferencias.".into());
        }
        let saldo_destino = running.get(&destino).copied().unwrap_or(0);
        running.insert(origen, saldo_origen - importe);
        running.insert(destino, saldo_destino + importe);
    }
    Ok(())
}

fn editar_movimiento(conn: &mut Connection, payload: &EditarMovimientoPayload) -> Result<String, String> {
    let id = payload.id.trim();
    let origen = payload.vehiculo_origen_id.trim();
    let destino = payload.vehiculo_destino_id.trim();
    let fecha = payload.fecha_movimiento.trim();
    let obs = payload.observaciones.trim();
    if id.is_empty() {
        return Err("Selecciona el movimiento.".into());
    }
    if origen.is_empty() || destino.is_empty() || origen == destino {
        return Err("El origen y el destino deben ser dos vehículos distintos.".into());
    }
    if payload.importe_centavos <= 0 {
        return Err("El importe de la transferencia debe ser mayor a cero.".into());
    }
    if !fecha_iso(fecha) {
        return Err("Indica la fecha del movimiento.".into());
    }

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_err)?;
    let actual: Option<(String, String, String, String)> = tx
        .query_row(
            "SELECT m.periodo_id, p.estado, p.fecha_inicio, p.fecha_fin
             FROM movimientos_combustible m
             JOIN periodos_combustible p ON p.id = m.periodo_id
             WHERE m.id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(map_err)?;
    let Some((periodo_id, estado, inicio, fin)) = actual else {
        return Err("No se encontró el movimiento.".into());
    };
    if estado != "ABIERTO" {
        return Err("El periodo está cerrado. Sus movimientos quedan como quedaron.".into());
    }
    if fecha < inicio.as_str() || fecha > fin.as_str() {
        return Err("La fecha del movimiento queda fuera de la semana del periodo.".into());
    }
    for vehiculo in [origen, destino] {
        let existe: Option<String> = tx
            .query_row("SELECT id FROM vehiculos WHERE id = ?1", [vehiculo], |row| row.get(0))
            .optional()
            .map_err(map_err)?;
        if existe.is_none() {
            return Err("Uno de los vehículos no está en el catálogo.".into());
        }
    }
    tx.execute(
        "UPDATE movimientos_combustible
         SET vehiculo_origen_id = ?2, vehiculo_destino_id = ?3, importe = ?4,
             fecha_movimiento = ?5, observaciones = ?6
         WHERE id = ?1",
        params![id, origen, destino, payload.importe_centavos, fecha, obs],
    )
    .map_err(map_err)?;
    asegurar_saldos(tx.deref(), &periodo_id)?;
    tx.commit().map_err(map_err)?;
    Ok(periodo_id)
}

fn eliminar_movimiento(conn: &mut Connection, movimiento_id: &str) -> Result<String, String> {
    let movimiento_id = movimiento_id.trim();
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_err)?;
    let actual: Option<(String, String)> = tx
        .query_row(
            "SELECT m.periodo_id, p.estado
             FROM movimientos_combustible m
             JOIN periodos_combustible p ON p.id = m.periodo_id
             WHERE m.id = ?1",
            [movimiento_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(map_err)?;
    let Some((periodo_id, estado)) = actual else {
        return Err("No se encontró el movimiento.".into());
    };
    if estado != "ABIERTO" {
        return Err("El periodo está cerrado. Sus movimientos quedan como quedaron.".into());
    }
    tx.execute(
        "DELETE FROM movimientos_combustible WHERE id = ?1",
        [movimiento_id],
    )
    .map_err(map_err)?;
    asegurar_saldos(tx.deref(), &periodo_id)?;
    tx.commit().map_err(map_err)?;
    Ok(periodo_id)
}

fn eliminar_periodo(conn: &mut Connection, periodo_id: &str) -> Result<(), String> {
    let periodo_id = periodo_id.trim();
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_err)?;
    let existe: Option<String> = tx
        .query_row(
            "SELECT id FROM periodos_combustible WHERE id = ?1",
            [periodo_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(map_err)?;
    if existe.is_none() {
        return Err("No se encontró el periodo.".into());
    }
    tx.execute(
        "DELETE FROM movimientos_combustible WHERE periodo_id = ?1",
        [periodo_id],
    )
    .map_err(map_err)?;
    tx.execute("DELETE FROM periodos_combustible WHERE id = ?1", [periodo_id])
        .map_err(map_err)?;
    tx.commit().map_err(map_err)?;
    Ok(())
}

fn cerrar_periodo(conn: &mut Connection, periodo_id: &str) -> Result<(), String> {
    let periodo_id = periodo_id.trim();
    if periodo_id.is_empty() {
        return Err("Selecciona el periodo.".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_err)?;
    let estado: Option<String> = tx
        .query_row(
            "SELECT estado FROM periodos_combustible WHERE id = ?1",
            [periodo_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(map_err)?;
    if estado.as_deref() != Some("ABIERTO") {
        return Err("El periodo ya está cerrado.".into());
    }

    let sobrante: i64 = tx
        .query_row(
            "SELECT CAST(COALESCE(SUM(
                (CASE WHEN v.id = p.vehiculo_inicial_id THEN p.presupuesto_inicial ELSE 0 END)
                + CAST(COALESCE((SELECT SUM(importe) FROM movimientos_combustible
                    WHERE periodo_id = p.id AND vehiculo_destino_id = v.id), 0) AS INTEGER)
                - CAST(COALESCE((SELECT SUM(importe) FROM movimientos_combustible
                    WHERE periodo_id = p.id AND vehiculo_origen_id = v.id), 0) AS INTEGER)
            ), 0) AS INTEGER)
             FROM vehiculos v
             JOIN periodos_combustible p ON p.id = ?1",
            [periodo_id],
            |row| row.get(0),
        )
        .map_err(map_err)?;

    let cambios = tx
        .execute(
            "UPDATE periodos_combustible
             SET estado = 'CERRADO',
                 sobrante = ?2,
                 closed_at = datetime('now', 'localtime')
             WHERE id = ?1 AND estado = 'ABIERTO'",
            params![periodo_id, sobrante],
        )
        .map_err(map_err)?;
    if cambios != 1 {
        return Err("El periodo ya está cerrado.".into());
    }
    tx.commit().map_err(map_err)?;
    Ok(())
}

fn listar(conn: &Connection) -> Result<Value, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.fecha_inicio, p.fecha_fin, p.vehiculo_inicial_id,
                    COALESCE(v.placas, ''), p.presupuesto_inicial, p.sobrante, p.estado,
                    p.created_at, p.closed_at
             FROM periodos_combustible p
             LEFT JOIN vehiculos v ON v.id = p.vehiculo_inicial_id
             ORDER BY p.fecha_inicio DESC, p.created_at DESC",
        )
        .map_err(map_err)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "fechaInicio": row.get::<_, String>(1)?,
                "fechaFin": row.get::<_, String>(2)?,
                "vehiculoInicialId": row.get::<_, String>(3)?,
                "vehiculoInicialPlacas": row.get::<_, String>(4)?,
                "presupuestoCentavos": row.get::<_, i64>(5)?,
                "sobranteCentavos": row.get::<_, Option<i64>>(6)?,
                "estado": row.get::<_, String>(7)?,
                "createdAt": row.get::<_, String>(8)?,
                "closedAt": row.get::<_, Option<String>>(9)?,
            }))
        })
        .map_err(map_err)?;
    let mut lista = Vec::new();
    for row in rows {
        lista.push(row.map_err(map_err)?);
    }
    Ok(Value::Array(lista))
}

#[tauri::command]
pub fn combustible_listar_periodos(app: AppHandle) -> Result<Value, String> {
    let conn = abrir_conexion(&app)?;
    listar(&conn)
}

#[tauri::command]
pub fn combustible_detalle(app: AppHandle, periodo_id: String) -> Result<Value, String> {
    let conn = abrir_conexion(&app)?;
    detalle(&conn, periodo_id.trim())
}

#[tauri::command]
pub fn combustible_abrir_periodo(app: AppHandle, payload: AbrirPayload) -> Result<Value, String> {
    let mut conn = abrir_conexion(&app)?;
    let id = abrir_periodo(&mut conn, &payload)?;
    detalle(&conn, &id)
}

#[tauri::command]
pub fn combustible_transferir(app: AppHandle, payload: TransferirPayload) -> Result<Value, String> {
    let mut conn = abrir_conexion(&app)?;
    let periodo_id = payload.periodo_id.clone();
    transferir(&mut conn, &payload)?;
    detalle(&conn, periodo_id.trim())
}

#[tauri::command]
pub fn combustible_cerrar_periodo(app: AppHandle, periodo_id: String) -> Result<Value, String> {
    let mut conn = abrir_conexion(&app)?;
    cerrar_periodo(&mut conn, &periodo_id)?;
    detalle(&conn, periodo_id.trim())
}

#[tauri::command]
pub fn combustible_editar_movimiento(
    app: AppHandle,
    payload: EditarMovimientoPayload,
) -> Result<Value, String> {
    let mut conn = abrir_conexion(&app)?;
    let periodo_id = editar_movimiento(&mut conn, &payload)?;
    detalle(&conn, &periodo_id)
}

#[tauri::command]
pub fn combustible_eliminar_movimiento(app: AppHandle, movimiento_id: String) -> Result<Value, String> {
    let mut conn = abrir_conexion(&app)?;
    let periodo_id = eliminar_movimiento(&mut conn, &movimiento_id)?;
    detalle(&conn, &periodo_id)
}

#[tauri::command]
pub fn combustible_eliminar_periodo(app: AppHandle, periodo_id: String) -> Result<(), String> {
    let mut conn = abrir_conexion(&app)?;
    eliminar_periodo(&mut conn, &periodo_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ESQUEMA: &str = "
        CREATE TABLE vehiculos (
            id TEXT PRIMARY KEY,
            numero_serie TEXT,
            placas TEXT,
            marca TEXT,
            modelo TEXT,
            anio INTEGER,
            descripcion TEXT,
            num_resguardo TEXT,
            responsable_bien TEXT,
            estado TEXT NOT NULL DEFAULT 'Activo',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE periodos_combustible (
            id TEXT PRIMARY KEY,
            fecha_inicio TEXT NOT NULL,
            fecha_fin TEXT NOT NULL,
            vehiculo_inicial_id TEXT NOT NULL REFERENCES vehiculos(id),
            presupuesto_inicial INTEGER NOT NULL DEFAULT 450000 CHECK (presupuesto_inicial = 450000),
            sobrante INTEGER,
            estado TEXT NOT NULL CHECK (estado IN ('ABIERTO', 'CERRADO')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            closed_at TEXT
        );
        CREATE TABLE movimientos_combustible (
            id TEXT PRIMARY KEY,
            periodo_id TEXT NOT NULL REFERENCES periodos_combustible(id),
            vehiculo_origen_id TEXT NOT NULL REFERENCES vehiculos(id),
            vehiculo_destino_id TEXT NOT NULL REFERENCES vehiculos(id),
            importe INTEGER NOT NULL CHECK (importe > 0),
            fecha_movimiento TEXT NOT NULL,
            observaciones TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (vehiculo_origen_id != vehiculo_destino_id)
        );
    ";

    fn base() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(ESQUEMA).unwrap();
        conn.execute(
            "INSERT INTO vehiculos (id, numero_serie, placas, estado) VALUES
                ('A', 'SA', 'GG4034D4', 'Activo'),
                ('B', 'SB', 'GR6211B', 'Activo'),
                ('C', 'SC', 'GF2122D', 'Activo'),
                ('D', 'SD', 'GR6201B', 'Activo'),
                ('X', 'SX', 'INACTIVA', 'Inactivo')",
            [],
        )
        .unwrap();
        conn
    }

    fn abrir(conn: &mut Connection, vehiculo: &str) -> String {
        abrir_periodo(
            conn,
            &AbrirPayload {
                fecha_inicio: "2026-10-19".into(),
                fecha_fin: "2026-10-23".into(),
                vehiculo_inicial_id: vehiculo.into(),
            },
        )
        .unwrap()
    }

    fn mover(conn: &mut Connection, periodo: &str, origen: &str, destino: &str, centavos: i64) {
        transferir(
            conn,
            &TransferirPayload {
                periodo_id: periodo.into(),
                vehiculo_origen_id: origen.into(),
                vehiculo_destino_id: destino.into(),
                importe_centavos: centavos,
                fecha_movimiento: "2026-10-20".into(),
                observaciones: String::new(),
            },
        )
        .unwrap();
    }

    #[test]
    fn distribuye_el_presupuesto_como_en_el_formato() {
        let mut conn = base();
        let id = abrir(&mut conn, "A");
        assert_eq!(saldo(&conn, &id, "A").unwrap(), 450_000);
        assert_eq!(saldo(&conn, &id, "B").unwrap(), 0);
        mover(&mut conn, &id, "A", "B", 50_000);
        mover(&mut conn, &id, "A", "C", 50_000);
        mover(&mut conn, &id, "A", "D", 50_000);
        assert_eq!(saldo(&conn, &id, "A").unwrap(), 300_000);
        assert_eq!(saldo(&conn, &id, "B").unwrap(), 50_000);

        let doc = detalle(&conn, &id).unwrap();
        let restar = doc["restar"].as_array().unwrap();
        let sumar = doc["sumar"].as_array().unwrap();
        assert_eq!(restar.len(), 1);
        assert_eq!(restar[0]["saldoCentavos"], 450_000);
        assert_eq!(restar[0]["montoCentavos"], 150_000);
        assert_eq!(sumar.len(), 3);
        assert_eq!(sumar[0]["montoCentavos"], 50_000);
        assert_eq!(sumar[0]["saldoCentavos"], 0);
    }

    #[test]
    fn permite_transferencias_encadenadas_y_rechaza_exceso_o_el_mismo_vehiculo() {
        let mut conn = base();
        let id = abrir(&mut conn, "A");
        mover(&mut conn, &id, "A", "B", 150_000);
        mover(&mut conn, &id, "B", "C", 50_000);
        assert_eq!(saldo(&conn, &id, "A").unwrap(), 300_000);
        assert_eq!(saldo(&conn, &id, "B").unwrap(), 100_000);
        assert_eq!(saldo(&conn, &id, "C").unwrap(), 50_000);

        let exceso = transferir(
            &mut conn,
            &TransferirPayload {
                periodo_id: id.clone(),
                vehiculo_origen_id: "C".into(),
                vehiculo_destino_id: "D".into(),
                importe_centavos: 50_001,
                fecha_movimiento: "2026-10-21".into(),
                observaciones: String::new(),
            },
        );
        assert!(exceso.is_err());
        assert_eq!(saldo(&conn, &id, "C").unwrap(), 50_000);

        let mismo = transferir(
            &mut conn,
            &TransferirPayload {
                periodo_id: id.clone(),
                vehiculo_origen_id: "A".into(),
                vehiculo_destino_id: "A".into(),
                importe_centavos: 100,
                fecha_movimiento: "2026-10-21".into(),
                observaciones: String::new(),
            },
        );
        assert!(mismo.is_err());
    }

    #[test]
    fn el_cierre_guarda_el_sobrante_y_la_semana_siguiente_empieza_en_4500() {
        let mut conn = base();
        let primero = abrir(&mut conn, "A");
        mover(&mut conn, &primero, "A", "B", 150_000);
        cerrar_periodo(&mut conn, &primero).unwrap();
        let cerrado = detalle(&conn, &primero).unwrap();
        assert_eq!(cerrado["periodo"]["estado"], "CERRADO");
        assert_eq!(cerrado["periodo"]["sobranteCentavos"], 450_000);
        assert_eq!(cerrado["disponibleCentavos"], 450_000);

        let bloqueado = transferir(
            &mut conn,
            &TransferirPayload {
                periodo_id: primero.clone(),
                vehiculo_origen_id: "B".into(),
                vehiculo_destino_id: "C".into(),
                importe_centavos: 1_000,
                fecha_movimiento: "2026-10-22".into(),
                observaciones: String::new(),
            },
        );
        assert!(bloqueado.is_err());

        let segundo = abrir_periodo(
            &mut conn,
            &AbrirPayload {
                fecha_inicio: "2026-10-26".into(),
                fecha_fin: "2026-10-30".into(),
                vehiculo_inicial_id: "C".into(),
            },
        )
        .unwrap();
        assert_eq!(saldo(&conn, &segundo, "C").unwrap(), 450_000);
        assert_eq!(saldo(&conn, &segundo, "A").unwrap(), 0);
        assert_eq!(saldo(&conn, &segundo, "B").unwrap(), 0);
        assert_eq!(saldo(&conn, &primero, "B").unwrap(), 150_000);
    }

    #[test]
    fn rechaza_otro_periodo_abierto_y_un_vehiculo_inactivo() {
        let mut conn = base();
        let _id = abrir(&mut conn, "A");
        let duplicado = abrir_periodo(
            &mut conn,
            &AbrirPayload {
                fecha_inicio: "2026-10-26".into(),
                fecha_fin: "2026-10-30".into(),
                vehiculo_inicial_id: "B".into(),
            },
        );
        assert!(duplicado.is_err());
        let inactivo = abrir_periodo(
            &mut conn,
            &AbrirPayload {
                fecha_inicio: "2026-10-19".into(),
                fecha_fin: "2026-10-23".into(),
                vehiculo_inicial_id: "X".into(),
            },
        );
        assert!(inactivo.is_err());
    }
}
