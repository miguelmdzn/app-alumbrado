use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// Nombres de los meses en español para la estructura de carpetas
const MONTH_NAMES: [&str; 12] = [
    "01-Enero",
    "02-Febrero",
    "03-Marzo",
    "04-Abril",
    "05-Mayo",
    "06-Junio",
    "07-Julio",
    "08-Agosto",
    "09-Septiembre",
    "10-Octubre",
    "11-Noviembre",
    "12-Diciembre",
];

const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(BASE64_CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(BASE64_CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(BASE64_CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(BASE64_CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let clean = input.trim();
    let raw = if let Some(idx) = clean.find(";base64,") {
        &clean[idx + 8..]
    } else {
        clean
    };

    let mut table = [0xFFu8; 256];
    for (i, &c) in BASE64_CHARS.iter().enumerate() {
        table[c as usize] = i as u8;
    }

    let filtered: Vec<u8> = raw.bytes().filter(|&b| !b.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(filtered.len() * 3 / 4);
    let mut i = 0;
    while i < filtered.len() {
        if filtered[i] == b'=' {
            break;
        }
        let c0 = table[filtered[i] as usize];
        let c1 = if i + 1 < filtered.len() {
            table[filtered[i + 1] as usize]
        } else {
            0xFF
        };
        if c0 == 0xFF || c1 == 0xFF {
            return Err("Cadena Base64 inválida".into());
        }
        out.push((c0 << 2) | (c1 >> 4));
        if i + 2 < filtered.len() && filtered[i + 2] != b'=' {
            let c2 = table[filtered[i + 2] as usize];
            if c2 == 0xFF {
                return Err("Cadena Base64 inválida".into());
            }
            out.push(((c1 & 0x0F) << 4) | (c2 >> 2));
            if i + 3 < filtered.len() && filtered[i + 3] != b'=' {
                let c3 = table[filtered[i + 3] as usize];
                if c3 == 0xFF {
                    return Err("Cadena Base64 inválida".into());
                }
                out.push(((c2 & 0x03) << 6) | c3);
            }
        }
        i += 4;
    }
    Ok(out)
}

fn get_evidencias_base_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let evidencias = app_data.join("evidencias");
    if !evidencias.exists() {
        fs::create_dir_all(&evidencias).map_err(|e| e.to_string())?;
    }
    Ok(evidencias)
}

fn sanitize_folio(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if clean.is_empty() {
        "reporte".into()
    } else {
        clean
    }
}

/// Calcula la jerarquía: (Año, Mes, Semana, Día) a partir de la fecha "YYYY-MM-DD"
fn calculate_hierarchy(date_str: &str) -> (String, String, String, String) {
    let parts: Vec<&str> = date_str.split('-').collect();
    let year = if !parts.is_empty() && !parts[0].is_empty() {
        parts[0]
    } else {
        "2026"
    };
    let month_num: u32 = parts.get(1).and_then(|m| m.parse().ok()).unwrap_or(1);
    let day_num: u32 = parts.get(2).and_then(|d| d.parse().ok()).unwrap_or(1);

    let month_idx = (month_num.saturating_sub(1) as usize).min(11);
    let month_folder = MONTH_NAMES[month_idx].to_string();

    let days_before = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let y_int = year.parse::<i32>().unwrap_or(2026);
    let is_leap = y_int % 4 == 0 && (y_int % 100 != 0 || y_int % 400 == 0);
    let mut doy = days_before[month_idx] + day_num;
    if is_leap && month_num > 2 {
        doy += 1;
    }
    let week_num = ((doy.saturating_sub(1)) / 7) + 1;
    let week_folder = format!("Semana-{:02}", week_num);
    let day_folder = format!("Dia-{:02}", day_num);

    (year.to_string(), month_folder, week_folder, day_folder)
}

// ---------------------------------------------------------------------------
// Comandos Tauri invocables desde el Frontend
// ---------------------------------------------------------------------------

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Guarda una imagen de evidencia en la jerarquía: año / mes / semana / día
/// Retorna la ruta relativa para ser guardada en la base de datos
#[tauri::command]
fn save_evidence_image(
    app: tauri::AppHandle,
    base64_data: String,
    date_str: String,
    folio: String,
    photo_index: u8,
    report_id: String,
) -> Result<String, String> {
    if base64_data.is_empty() {
        return Ok("".into());
    }

    // 1. Decodificar la imagen Base64 a bytes
    let image_bytes = base64_decode(&base64_data)?;

    // 2. Obtener la carpeta base de evidencias
    let base_dir = get_evidencias_base_dir(&app)?;

    // 3. Calcular la jerarquía cronológica
    let (year, month, week, day) = calculate_hierarchy(&date_str);
    let target_dir = base_dir.join(&year).join(&month).join(&week).join(&day);

    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    // 4. Generar nombre de archivo único y ordenado
    let safe_folio = sanitize_folio(&folio);
    let short_id = if report_id.len() >= 8 {
        &report_id[..8]
    } else {
        "img"
    };
    let file_name = format!("{}_foto{}_{}.jpg", safe_folio, photo_index, short_id);

    // 5. Escribir el archivo en disco
    let file_path = target_dir.join(&file_name);
    fs::write(&file_path, image_bytes).map_err(|e| e.to_string())?;

    // 6. Retornar referencia relativa universal con barras inclinadas '/'
    let relative_path = format!("{}/{}/{}/{}/{}", year, month, week, day, file_name);
    Ok(relative_path)
}

/// Lee una imagen desde su referencia relativa y la devuelve como Data URL base64
#[tauri::command]
fn read_evidence_image(app: tauri::AppHandle, relative_path: String) -> Result<String, String> {
    if relative_path.is_empty() {
        return Ok("".into());
    }

    // Si ya viene como base64 data url, devolverla tal cual
    if relative_path.starts_with("data:") {
        return Ok(relative_path);
    }

    let base_dir = get_evidencias_base_dir(&app)?;
    let clean_rel = relative_path.replace('/', std::path::MAIN_SEPARATOR_STR);
    let file_path = base_dir.join(clean_rel);

    if !file_path.exists() {
        return Err(format!(
            "El archivo de evidencia no existe: {}",
            file_path.display()
        ));
    }

    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;
    let encoded = base64_encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", encoded))
}

/// Obtiene la ruta absoluta de la carpeta de evidencias
#[tauri::command]
fn get_evidence_folder_path(app: tauri::AppHandle) -> Result<String, String> {
    let base_dir = get_evidencias_base_dir(&app)?;
    Ok(base_dir.to_string_lossy().to_string())
}

/// Abre la carpeta de evidencias en el explorador de archivos del sistema operativo
#[tauri::command]
fn open_evidence_folder(app: tauri::AppHandle, subfolder: Option<String>) -> Result<(), String> {
    let base_dir = get_evidencias_base_dir(&app)?;
    let target_dir = if let Some(sub) = subfolder {
        let clean = sub.replace('/', std::path::MAIN_SEPARATOR_STR);
        base_dir.join(clean)
    } else {
        base_dir
    };

    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Elimina un archivo de imagen si existe
#[tauri::command]
fn delete_evidence_image(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
    if relative_path.is_empty() || relative_path.starts_with("data:") {
        return Ok(());
    }

    let base_dir = get_evidencias_base_dir(&app)?;
    let clean_rel = relative_path.replace('/', std::path::MAIN_SEPARATOR_STR);
    let file_path = base_dir.join(clean_rel);

    if file_path.exists() {
        let _ = fs::remove_file(file_path);
    }

    Ok(())
}

/// Abre una URL en el navegador predeterminado del sistema operativo
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================================
// INTEGRACIÓN GOOGLE APPS SCRIPT (COMANDOS SEGUROS DESDE EL BACKEND RUST)
// ============================================================================

const KEYRING_SERVICE: &str = "app_alumbrado_publico_gas";
const KEYRING_URL_KEY: &str = "endpoint_url";
const KEYRING_TOKEN_KEY: &str = "secret_token";

/// Guarda de forma segura la URL y el Token en el Administrador de Credenciales del SO
#[tauri::command]
fn save_gas_config(endpoint_url: String, secret_token: String) -> Result<(), String> {
    let url_trimmed = endpoint_url.trim();
    let token_trimmed = secret_token.trim();

    if url_trimmed.is_empty() {
        return Err("La URL del Web App no puede estar vacía.".into());
    }
    if !url_trimmed.starts_with("https://script.google.com/") {
        return Err("La URL debe ser de Google Apps Script (iniciar con https://script.google.com/).".into());
    }
    if token_trimmed.is_empty() {
        return Err("El Token Secreto no puede estar vacío.".into());
    }

    let entry_url = keyring::Entry::new(KEYRING_SERVICE, KEYRING_URL_KEY)
        .map_err(|e| format!("Error en Credential Manager (URL): {}", e))?;
    let entry_token = keyring::Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY)
        .map_err(|e| format!("Error en Credential Manager (Token): {}", e))?;

    entry_url.set_password(url_trimmed)
        .map_err(|e| format!("No se pudo guardar la URL en el Administrador de Credenciales: {}", e))?;
    entry_token.set_password(token_trimmed)
        .map_err(|e| format!("No se pudo guardar el Token en el Administrador de Credenciales: {}", e))?;

    Ok(())
}

/// Devuelve el estado de la configuración (NUNCA expone el token a JavaScript)
#[tauri::command]
fn get_gas_config_status() -> Result<serde_json::Value, String> {
    let entry_url = keyring::Entry::new(KEYRING_SERVICE, KEYRING_URL_KEY)
        .map_err(|e| e.to_string())?;
    let entry_token = keyring::Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY)
        .map_err(|e| e.to_string())?;

    let url_opt = entry_url.get_password().ok();
    let has_token = entry_token.get_password().is_ok();
    let is_configured = url_opt.is_some() && has_token;

    let display_url = match url_opt {
        Some(u) if u.len() > 40 => {
            format!("{}...{}", &u[..32], &u[u.len() - 10..])
        }
        Some(u) => u,
        None => String::new(),
    };

    Ok(serde_json::json!({
        "is_configured": is_configured,
        "endpoint_url": display_url,
        "has_token": has_token
    }))
}

/// Prueba la conexión enviando una acción ping con el token secreto inyectado desde Rust
#[tauri::command]
async fn test_gas_connection() -> Result<serde_json::Value, String> {
    let entry_url = keyring::Entry::new(KEYRING_SERVICE, KEYRING_URL_KEY)
        .map_err(|e| e.to_string())?;
    let entry_token = keyring::Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY)
        .map_err(|e| e.to_string())?;

    let url = entry_url.get_password()
        .map_err(|_| "La URL de Google Apps Script no está configurada.".to_string())?;
    let token = entry_token.get_password()
        .map_err(|_| "El Token Secreto no está configurado.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(35))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;

    let payload = serde_json::json!({
        "token": token,
        "action": "ping"
    });

    let res = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Tiempo de espera agotado al conectar con Google Apps Script (timeout 35s).".to_string()
            } else if e.is_connect() {
                "Sin conexión a internet o el servidor de Google no responde.".to_string()
            } else {
                format!("Error HTTP: {}", e)
            }
        })?;

    let status = res.status();
    let text = res.text().await.map_err(|e| format!("Error leyendo respuesta: {}", e))?;

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|_| {
        format!(
            "Google respondió con contenido no JSON (HTTP {}): {}",
            status,
            if text.len() > 140 { &text[..140] } else { &text }
        )
    })?;

    if json.get("success").and_then(|v| v.as_bool()) == Some(true) {
        Ok(json)
    } else {
        let err_msg = json.get("error").and_then(|e| e.as_str()).unwrap_or("Error en Apps Script");
        Err(format!("Google Apps Script rechazó la prueba: {}", err_msg))
    }
}

/// Envía un registro a Google Apps Script inyectando el token secreto desde Rust
#[tauri::command]
async fn send_gas_record(
    table: String,
    action: String,
    record: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let entry_url = keyring::Entry::new(KEYRING_SERVICE, KEYRING_URL_KEY)
        .map_err(|e| e.to_string())?;
    let entry_token = keyring::Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY)
        .map_err(|e| e.to_string())?;

    let url = entry_url.get_password()
        .map_err(|_| "La URL de Google Apps Script no está configurada.".to_string())?;
    let token = entry_token.get_password()
        .map_err(|_| "El Token Secreto no está configurado.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Error cliente HTTP: {}", e))?;

    let payload = serde_json::json!({
        "token": token,
        "table": table,
        "action": action,
        "record": record
    });

    let res = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Sin conexión a internet.".to_string()
            } else if e.is_timeout() {
                "Tiempo de espera agotado al enviar a Google Sheets.".to_string()
            } else {
                format!("Error de conexión: {}", e)
            }
        })?;

    let status = res.status();
    let text = res.text().await.map_err(|e| format!("Error leyendo respuesta: {}", e))?;

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|_| {
        format!(
            "Google respondió con formato no válido (HTTP {}): {}",
            status,
            if text.len() > 140 { &text[..140] } else { &text }
        )
    })?;

    if json.get("success").and_then(|v| v.as_bool()) == Some(true) {
        Ok(json)
    } else {
        let err_msg = json.get("error").and_then(|e| e.as_str()).unwrap_or("Error en Apps Script");
        Err(err_msg.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_evidence_image,
            read_evidence_image,
            get_evidence_folder_path,
            open_evidence_folder,
            delete_evidence_image,
            open_external_url,
            save_gas_config,
            get_gas_config_status,
            test_gas_connection,
            send_gas_record
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
