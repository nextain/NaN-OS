mod audit;
mod memory;

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

#[cfg(target_os = "linux")]
use webkit2gtk::PermissionRequestExt;

// agent-core process handle
struct AgentProcess {
    child: Child,
    stdin: std::process::ChildStdin,
}

// OpenClaw Gateway + Node Host process handle
struct GatewayProcess {
    child: Child,
    node_host: Option<Child>,
    we_spawned: bool, // only kill on shutdown if we spawned it
}

struct AppState {
    agent: Mutex<Option<AgentProcess>>,
    gateway: Mutex<Option<GatewayProcess>>,
}

struct AuditState {
    db: audit::AuditDb,
}

struct MemoryState {
    db: memory::MemoryDb,
}

/// JSON chunk forwarded from agent-core stdout to the frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
struct AgentChunk {
    #[serde(rename = "type")]
    chunk_type: String,
    #[serde(flatten)]
    rest: serde_json::Value,
}

/// Saved window position/size
#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn window_state_path(app_handle: &AppHandle) -> Option<std::path::PathBuf> {
    app_handle
        .path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("window-state.json"))
}

fn load_window_state(app_handle: &AppHandle) -> Option<WindowState> {
    let path = window_state_path(app_handle)?;
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_window_state(app_handle: &AppHandle, state: &WindowState) {
    if let Some(path) = window_state_path(app_handle) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(state) {
            let _ = std::fs::write(&path, json);
        }
    }
}

/// Get log directory (~/.cafelua/logs/) and ensure it exists
fn log_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let dir = std::path::PathBuf::from(home).join(".cafelua/logs");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Open a log file for a component (append mode, timestamped per session)
fn open_log_file(component: &str) -> Option<std::fs::File> {
    let path = log_dir().join(format!("{}.log", component));
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok()
}

/// Write a line to a log file and stderr
fn log_both(msg: &str) {
    eprintln!("{}", msg);
    if let Some(mut f) = open_log_file("cafelua") {
        use std::io::Write as _;
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{}] {}", secs, msg);
    }
}

/// Find Node.js binary (system path first, then nvm fallback)
fn find_node_binary() -> Result<std::path::PathBuf, String> {
    // Check system node first
    if let Ok(output) = Command::new("node").arg("-v").output() {
        if output.status.success() {
            let version_str = String::from_utf8_lossy(&output.stdout);
            let major: u32 = version_str
                .trim()
                .trim_start_matches('v')
                .split('.')
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            if major >= 22 {
                return Ok(std::path::PathBuf::from("node"));
            }
        }
    }

    // Try nvm fallback
    let home = std::env::var("HOME").unwrap_or_default();
    let nvm_dir = format!("{}/.config/nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        let mut versions: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                let name = name.trim_start_matches('v').to_string();
                let major: u32 = name.split('.').next()?.parse().ok()?;
                if major >= 22 {
                    Some((major, e.path()))
                } else {
                    None
                }
            })
            .collect();
        versions.sort_by(|a, b| b.0.cmp(&a.0)); // highest first
        if let Some((_, path)) = versions.first() {
            let node_bin = path.join("bin/node");
            if node_bin.exists() {
                return Ok(node_bin);
            }
        }
    }

    Err("Node.js 22+ not found (checked system PATH and nvm)".to_string())
}

/// Check if OpenClaw Gateway is already running (blocking, for setup use)
fn check_gateway_health_sync() -> bool {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build();
    match client {
        Ok(c) => c
            .get("http://127.0.0.1:18789/__openclaw__/canvas/")
            .send()
            .is_ok(),
        Err(_) => false,
    }
}

/// Find openclaw binary and node binary paths
fn find_openclaw_paths() -> Result<(std::path::PathBuf, String, String), String> {
    let node_bin = find_node_binary()?;
    let home = std::env::var("HOME").unwrap_or_default();
    let openclaw_bin = format!("{}/.cafelua/openclaw/node_modules/.bin/openclaw", home);
    if !std::path::Path::new(&openclaw_bin).exists() {
        return Err(format!(
            "OpenClaw not installed at {}. Run: config/scripts/setup-openclaw.sh",
            openclaw_bin
        ));
    }
    let config_path = format!("{}/.cafelua/openclaw/openclaw.json", home);
    Ok((node_bin, openclaw_bin, config_path))
}

/// Spawn Node Host process (connects to Gateway for command execution)
fn spawn_node_host(
    node_bin: &std::path::Path,
    openclaw_bin: &str,
    config_path: &str,
) -> Result<Child, String> {
    log_both("[Cafelua] Spawning Node Host: node run --host 127.0.0.1 --port 18789");

    let gateway_log = open_log_file("node-host");
    let stdout_cfg = match &gateway_log {
        Some(_) => Stdio::from(open_log_file("node-host").unwrap()),
        None => Stdio::inherit(),
    };
    let stderr_cfg = match open_log_file("node-host") {
        Some(f) => Stdio::from(f),
        None => Stdio::inherit(),
    };

    let child = Command::new(node_bin.as_os_str())
        .arg(openclaw_bin)
        .arg("node")
        .arg("run")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("18789")
        .arg("--display-name")
        .arg("CafeLuaLocal")
        .env("OPENCLAW_CONFIG_PATH", config_path)
        .stdout(stdout_cfg)
        .stderr(stderr_cfg)
        .spawn()
        .map_err(|e| format!("Failed to spawn Node Host: {}", e))?;

    log_both(&format!(
        "[Cafelua] Node Host spawned (PID: {})",
        child.id()
    ));
    Ok(child)
}

/// Spawn or attach to OpenClaw Gateway + Node Host
fn spawn_gateway() -> Result<GatewayProcess, String> {
    // 1. Check if already running (e.g. systemd or manual start)
    if check_gateway_health_sync() {
        log_both("[Cafelua] Gateway already running — reusing existing instance");
        let child = Command::new("true")
            .spawn()
            .map_err(|e| format!("Failed to create dummy process: {}", e))?;

        // Still spawn Node Host if needed (Gateway may be external but node host not running)
        let node_host = match find_openclaw_paths() {
            Ok((node_bin, openclaw_bin, config_path)) => {
                match spawn_node_host(&node_bin, &openclaw_bin, &config_path) {
                    Ok(nh) => Some(nh),
                    Err(e) => {
                        log_both(&format!("[Cafelua] Node Host spawn failed: {}", e));
                        None
                    }
                }
            }
            Err(_) => None,
        };

        return Ok(GatewayProcess {
            child,
            node_host,
            we_spawned: false,
        });
    }

    // 2. Find paths
    let (node_bin, openclaw_bin, config_path) = find_openclaw_paths()?;

    log_both(&format!(
        "[Cafelua] Spawning Gateway: {} {} gateway run --bind loopback --port 18789",
        node_bin.display(),
        openclaw_bin
    ));

    // 3. Spawn Gateway with log files
    let gw_stdout = match open_log_file("gateway") {
        Some(f) => Stdio::from(f),
        None => Stdio::inherit(),
    };
    let gw_stderr = match open_log_file("gateway") {
        Some(f) => Stdio::from(f),
        None => Stdio::inherit(),
    };

    let child = Command::new(node_bin.as_os_str())
        .arg(&openclaw_bin)
        .arg("gateway")
        .arg("run")
        .arg("--bind")
        .arg("loopback")
        .arg("--port")
        .arg("18789")
        .env("OPENCLAW_CONFIG_PATH", &config_path)
        .stdout(gw_stdout)
        .stderr(gw_stderr)
        .spawn()
        .map_err(|e| format!("Failed to spawn Gateway: {}", e))?;

    log_both(&format!(
        "[Cafelua] Gateway process spawned (PID: {})",
        child.id()
    ));

    // 4. Wait for health check (max 5s, 500ms intervals)
    let mut gateway_healthy = false;
    for i in 0..10 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if check_gateway_health_sync() {
            log_both(&format!(
                "[Cafelua] Gateway healthy after {}ms",
                (i + 1) * 500
            ));
            gateway_healthy = true;
            break;
        }
    }

    if !gateway_healthy {
        log_both("[Cafelua] Gateway spawned but not yet healthy — continuing anyway");
    }

    // 5. Spawn Node Host (after Gateway is ready)
    let node_host = match spawn_node_host(&node_bin, &openclaw_bin, &config_path) {
        Ok(nh) => {
            // Give Node Host a moment to connect
            std::thread::sleep(std::time::Duration::from_millis(1000));
            Some(nh)
        }
        Err(e) => {
            log_both(&format!("[Cafelua] Node Host spawn failed: {}", e));
            None
        }
    };

    Ok(GatewayProcess {
        child,
        node_host,
        we_spawned: true,
    })
}

/// Spawn the Node.js agent-core process with stdio pipes
fn spawn_agent_core(app_handle: &AppHandle, audit_db: &audit::AuditDb) -> Result<AgentProcess, String> {
    let agent_path = std::env::var("CAFELUA_AGENT_PATH")
        .unwrap_or_else(|_| "node".to_string());

    // In dev: tsx for TypeScript direct execution; in prod: compiled JS
    let agent_script = std::env::var("CAFELUA_AGENT_SCRIPT")
        .unwrap_or_else(|_| {
            // Try paths relative to current dir (src-tauri/ in dev)
            let candidates = [
                "../../agent/src/index.ts",  // from src-tauri/
                "../agent/src/index.ts",     // from shell/
            ];
            for rel in &candidates {
                let dev_path = std::env::current_dir()
                    .map(|d| d.join(rel))
                    .unwrap_or_default();
                if dev_path.exists() {
                    eprintln!("[Cafelua] Found agent at: {}", dev_path.display());
                    return dev_path.canonicalize()
                        .unwrap_or(dev_path)
                        .to_string_lossy()
                        .to_string();
                }
            }
            // Production: compiled JS
            "../agent/dist/index.js".to_string()
        });

    let use_tsx = agent_script.ends_with(".ts");
    let runner = if use_tsx {
        std::env::var("CAFELUA_AGENT_RUNNER")
            .unwrap_or_else(|_| "npx".to_string())
    } else {
        agent_path.clone()
    };

    eprintln!("[Cafelua] Starting agent-core: {} {}", runner, agent_script);

    let mut child = if use_tsx {
        Command::new(&runner)
            .arg("tsx")
            .arg(&agent_script)
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn agent-core: {}", e))?
    } else {
        Command::new(&runner)
            .arg(&agent_script)
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn agent-core: {}", e))?
    };

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to get agent stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get agent stdout".to_string())?;

    // Stdout reader thread: forward JSON lines as Tauri events + audit log
    let handle = app_handle.clone();
    let audit_db_clone = audit_db.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(json_line) => {
                    let trimmed = json_line.trim();
                    if trimmed.is_empty() || !trimmed.starts_with('{') {
                        continue;
                    }
                    // Audit log: parse and record before emitting
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        audit::maybe_log_event(&audit_db_clone, &parsed);
                    }
                    // Forward raw JSON to frontend
                    if let Err(e) = handle.emit("agent_response", trimmed) {
                        eprintln!("[Cafelua] Failed to emit agent_response: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!("[Cafelua] Error reading agent stdout: {}", e);
                    break;
                }
            }
        }
        eprintln!("[Cafelua] agent-core stdout reader ended");
    });

    Ok(AgentProcess { child, stdin })
}

/// Send a message to agent-core stdin, with crash recovery
fn send_to_agent(
    state: &AppState,
    message: &str,
    app_handle: Option<&AppHandle>,
    audit_db: Option<&audit::AuditDb>,
) -> Result<(), String> {
    // Log approval_decision events (shell→agent direction)
    if let Some(db) = audit_db {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(message) {
            if parsed.get("type").and_then(|v| v.as_str()) == Some("approval_response") {
                let request_id = parsed
                    .get("requestId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let tool_name = parsed.get("toolName").and_then(|v| v.as_str());
                let tool_call_id = parsed.get("toolCallId").and_then(|v| v.as_str());
                let decision = parsed
                    .get("decision")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let payload = serde_json::json!({ "decision": decision }).to_string();
                let _ = audit::insert_event(
                    db,
                    request_id,
                    "approval_decision",
                    tool_name,
                    tool_call_id,
                    None,
                    None,
                    Some(&payload),
                );
            }
        }
    }

    let mut guard = state
        .agent
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if let Some(ref mut process) = *guard {
        // Check if process is still alive
        match process.child.try_wait() {
            Ok(Some(status)) => {
                eprintln!("[Cafelua] agent-core exited: {:?}", status);
                *guard = None;
                drop(guard);
                if let Some(handle) = app_handle {
                    return restart_agent(state, handle, message, audit_db);
                }
                return Err("agent-core died".to_string());
            }
            Ok(None) => {} // still running
            Err(e) => eprintln!("[Cafelua] Failed to check agent status: {}", e),
        }

        // Write to stdin
        match writeln!(process.stdin, "{}", message) {
            Ok(_) => {
                process
                    .stdin
                    .flush()
                    .map_err(|e| format!("Flush error: {}", e))?;
                Ok(())
            }
            Err(e) => {
                eprintln!("[Cafelua] Write to agent failed: {}", e);
                *guard = None;
                drop(guard);
                if let Some(handle) = app_handle {
                    restart_agent(state, handle, message, audit_db)
                } else {
                    Err(format!("Write failed: {}", e))
                }
            }
        }
    } else {
        drop(guard);
        if let Some(handle) = app_handle {
            restart_agent(state, handle, message, audit_db)
        } else {
            Err("agent-core not running".to_string())
        }
    }
}

fn restart_agent(
    state: &AppState,
    app_handle: &AppHandle,
    message: &str,
    audit_db: Option<&audit::AuditDb>,
) -> Result<(), String> {
    eprintln!("[Cafelua] Restarting agent-core...");
    // Use a temporary empty db if none provided (shouldn't happen in practice)
    let empty_db;
    let db = match audit_db {
        Some(db) => db,
        None => {
            empty_db = std::sync::Arc::new(Mutex::new(
                rusqlite::Connection::open_in_memory().map_err(|e| format!("DB error: {}", e))?,
            ));
            &empty_db
        }
    };
    match spawn_agent_core(app_handle, db) {
        Ok(process) => {
            let mut guard = state
                .agent
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            *guard = Some(process);
            eprintln!("[Cafelua] agent-core restarted");
            drop(guard);
            std::thread::sleep(std::time::Duration::from_millis(300));
            send_to_agent(state, message, None, audit_db)
        }
        Err(e) => Err(format!("Restart failed: {}", e)),
    }
}

#[tauri::command]
async fn send_to_agent_command(
    app: AppHandle,
    message: String,
    state: tauri::State<'_, AppState>,
    audit_state: tauri::State<'_, AuditState>,
) -> Result<(), String> {
    send_to_agent(&state, &message, Some(&app), Some(&audit_state.db))
}

#[tauri::command]
async fn cancel_stream(
    app: AppHandle,
    request_id: String,
    state: tauri::State<'_, AppState>,
    audit_state: tauri::State<'_, AuditState>,
) -> Result<(), String> {
    let cancel = serde_json::json!({
        "type": "cancel_stream",
        "requestId": request_id
    });
    send_to_agent(&state, &cancel.to_string(), Some(&app), Some(&audit_state.db))
}

#[tauri::command]
async fn get_audit_log(
    filter: audit::AuditFilter,
    audit_state: tauri::State<'_, AuditState>,
) -> Result<Vec<audit::AuditEvent>, String> {
    audit::query_events(&audit_state.db, &filter)
}

#[tauri::command]
async fn get_audit_stats(
    audit_state: tauri::State<'_, AuditState>,
) -> Result<audit::AuditStats, String> {
    audit::query_stats(&audit_state.db)
}

// === Memory commands ===

#[tauri::command]
async fn memory_create_session(
    id: String,
    title: Option<String>,
    state: tauri::State<'_, MemoryState>,
) -> Result<memory::Session, String> {
    memory::create_session(&state.db, &id, title.as_deref())
}

#[tauri::command]
async fn memory_get_last_session(
    state: tauri::State<'_, MemoryState>,
) -> Result<Option<memory::Session>, String> {
    memory::get_last_session(&state.db)
}

#[tauri::command]
async fn memory_get_sessions(
    limit: u32,
    state: tauri::State<'_, MemoryState>,
) -> Result<Vec<memory::Session>, String> {
    memory::get_recent_sessions(&state.db, limit)
}

#[tauri::command]
async fn memory_save_message(
    msg: memory::MessageRow,
    state: tauri::State<'_, MemoryState>,
) -> Result<(), String> {
    memory::insert_message(&state.db, &msg)
}

#[tauri::command]
async fn memory_get_messages(
    session_id: String,
    state: tauri::State<'_, MemoryState>,
) -> Result<Vec<memory::MessageRow>, String> {
    memory::get_session_messages(&state.db, &session_id)
}

#[tauri::command]
async fn memory_search(
    query: String,
    limit: u32,
    state: tauri::State<'_, MemoryState>,
) -> Result<Vec<memory::MessageRow>, String> {
    memory::search_messages(&state.db, &query, limit)
}

#[tauri::command]
async fn memory_delete_session(
    session_id: String,
    state: tauri::State<'_, MemoryState>,
) -> Result<(), String> {
    memory::delete_session(&state.db, &session_id)
}

#[tauri::command]
async fn memory_update_title(
    session_id: String,
    title: String,
    state: tauri::State<'_, MemoryState>,
) -> Result<(), String> {
    memory::update_session_title(&state.db, &session_id, &title)
}

#[tauri::command]
async fn memory_get_sessions_with_count(
    limit: u32,
    state: tauri::State<'_, MemoryState>,
) -> Result<Vec<memory::SessionWithCount>, String> {
    memory::get_sessions_with_count(&state.db, limit)
}

#[tauri::command]
async fn memory_update_summary(
    session_id: String,
    summary: String,
    state: tauri::State<'_, MemoryState>,
) -> Result<(), String> {
    memory::update_session_summary(&state.db, &session_id, &summary)
}

#[tauri::command]
async fn memory_search_fts(
    query: String,
    limit: u32,
    state: tauri::State<'_, MemoryState>,
) -> Result<Vec<memory::MessageRow>, String> {
    memory::search_fts(&state.db, &query, limit)
}

// === Facts commands ===

#[tauri::command]
async fn memory_get_all_facts(
    state: tauri::State<'_, MemoryState>,
) -> Result<Vec<memory::Fact>, String> {
    memory::get_all_facts(&state.db)
}

#[tauri::command]
async fn memory_upsert_fact(
    fact: memory::Fact,
    state: tauri::State<'_, MemoryState>,
) -> Result<(), String> {
    memory::upsert_fact(&state.db, &fact)
}

#[tauri::command]
async fn memory_delete_fact(
    fact_id: String,
    state: tauri::State<'_, MemoryState>,
) -> Result<(), String> {
    memory::delete_fact(&state.db, &fact_id)
}

/// Validate an API key by making a test request to the provider
#[tauri::command]
async fn validate_api_key(provider: String, api_key: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let result = match provider.as_str() {
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models?key={}",
                api_key
            );
            client.get(&url).send().await
        }
        "xai" => {
            client
                .get("https://api.x.ai/v1/models")
                .header("Authorization", format!("Bearer {}", api_key))
                .send()
                .await
        }
        "anthropic" => {
            client
                .get("https://api.anthropic.com/v1/models")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
        }
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    match result {
        Ok(res) => Ok(res.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn preview_tts(api_key: String, voice: String, text: String) -> Result<String, String> {
    let url = format!(
        "https://texttospeech.googleapis.com/v1/text:synthesize?key={}",
        api_key
    );
    let language_code = &voice[..5]; // e.g. "ko-KR"
    let body = serde_json::json!({
        "input": { "text": text },
        "voice": { "languageCode": language_code, "name": voice },
        "audioConfig": { "audioEncoding": "MP3" }
    });

    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("TTS request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("TTS API error {}: {}", status, body));
    }

    #[derive(Deserialize)]
    struct TtsResponse {
        #[serde(rename = "audioContent")]
        audio_content: Option<String>,
    }

    let data: TtsResponse = res
        .json()
        .await
        .map_err(|e| format!("TTS response parse error: {}", e))?;

    data.audio_content
        .ok_or_else(|| "No audio content in response".to_string())
}

/// Check if OpenClaw Gateway is reachable on localhost
#[tauri::command]
async fn gateway_health() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match client
        .get("http://127.0.0.1:18789/__openclaw__/canvas/")
        .send()
        .await
    {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn reset_window_state(app: AppHandle) -> Result<(), String> {
    if let Some(path) = window_state_path(&app) {
        let _ = std::fs::remove_file(&path);
        eprintln!("[Cafelua] Window state reset");
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            agent: Mutex::new(None),
            gateway: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            send_to_agent_command,
            cancel_stream,
            reset_window_state,
            preview_tts,
            gateway_health,
            get_audit_log,
            get_audit_stats,
            memory_create_session,
            memory_get_last_session,
            memory_get_sessions,
            memory_save_message,
            memory_get_messages,
            memory_search,
            memory_delete_session,
            memory_update_title,
            memory_get_sessions_with_count,
            memory_update_summary,
            memory_search_fts,
            memory_get_all_facts,
            memory_upsert_fact,
            memory_delete_fact,
            validate_api_key,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state: tauri::State<'_, AppState> = app.state();

            // Initialize audit DB
            let audit_db_path = app_handle
                .path()
                .app_config_dir()
                .map(|d| d.join("audit.db"))
                .map_err(|e| format!("Failed to get config dir: {}", e))?;
            if let Some(parent) = audit_db_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let audit_db = audit::init_db(&audit_db_path)
                .map_err(|e| -> Box<dyn std::error::Error> { format!("Failed to init audit DB: {}", e).into() })?;
            app.manage(AuditState { db: audit_db.clone() });
            eprintln!("[Cafelua] Audit DB initialized at: {}", audit_db_path.display());

            // Initialize memory DB
            let memory_db_path = app_handle
                .path()
                .app_config_dir()
                .map(|d| d.join("memory.db"))
                .map_err(|e| format!("Failed to get config dir: {}", e))?;
            let memory_db = memory::init_db(&memory_db_path)
                .map_err(|e| -> Box<dyn std::error::Error> { format!("Failed to init memory DB: {}", e).into() })?;
            app.manage(MemoryState { db: memory_db });
            eprintln!("[Cafelua] Memory DB initialized at: {}", memory_db_path.display());

            // Restore or dock window
            if let Some(window) = app.get_webview_window("main") {
                if let Some(saved) = load_window_state(&app_handle) {
                    let _ = window.set_size(PhysicalSize::new(saved.width, saved.height));
                    let _ = window.set_position(PhysicalPosition::new(saved.x, saved.y));
                    eprintln!("[Cafelua] Window restored: {}x{} at ({},{})", saved.width, saved.height, saved.x, saved.y);
                } else if let Some(monitor) = window.current_monitor().ok().flatten() {
                    let monitor_size = monitor.size();
                    let monitor_pos = monitor.position();
                    let scale = monitor.scale_factor();
                    let width = (380.0 * scale) as u32;
                    let height = monitor_size.height;
                    let x = monitor_pos.x + (monitor_size.width as i32 - width as i32);
                    let y = monitor_pos.y;
                    let _ = window.set_size(PhysicalSize::new(width, height));
                    let _ = window.set_position(PhysicalPosition::new(x, y));
                    eprintln!("[Cafelua] Window docked: {}x{} at ({},{})", width, height, x, y);
                }
                let _ = window.show();
            }

            // Enable microphone/media permissions for webkit2gtk
            #[cfg(target_os = "linux")]
            if let Some(webview_window) = app.get_webview_window("main") {
                let _ = webview_window.with_webview(|webview| {
                    use webkit2gtk::WebViewExt;
                    webview.inner().connect_permission_request(|_, request| {
                        request.allow();
                        true
                    });
                });
            }

            // Log session start
            log_both("[Cafelua] === Session started ===");
            log_both(&format!("[Cafelua] Log files at: {}", log_dir().display()));

            // Spawn Gateway first (Agent connects to it via WebSocket)
            let (gateway_running, gateway_managed) = match spawn_gateway() {
                Ok(process) => {
                    let managed = process.we_spawned;
                    let has_node_host = process.node_host.is_some();
                    let mut guard = state.gateway.lock().unwrap();
                    *guard = Some(process);
                    log_both(&format!(
                        "[Cafelua] Gateway ready (managed={}, node_host={})",
                        managed, has_node_host
                    ));
                    (true, managed)
                }
                Err(e) => {
                    log_both(&format!("[Cafelua] Gateway not available: {}", e));
                    log_both("[Cafelua] Running without Gateway (tools will be unavailable)");
                    (false, false)
                }
            };

            // Emit gateway status to frontend
            let _ = app_handle.emit(
                "gateway_status",
                serde_json::json!({ "running": gateway_running, "managed": gateway_managed }),
            );

            // Then spawn Agent
            match spawn_agent_core(&app_handle, &audit_db) {
                Ok(process) => {
                    let mut guard = state.agent.lock().unwrap();
                    *guard = Some(process);
                    log_both("[Cafelua] agent-core started");
                }
                Err(e) => {
                    log_both(&format!("[Cafelua] agent-core not available: {}", e));
                    log_both("[Cafelua] Running without agent (chat will be unavailable)");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Moved(pos) => {
                    if let Ok(size) = window.outer_size() {
                        save_window_state(&window.app_handle(), &WindowState {
                            x: pos.x,
                            y: pos.y,
                            width: size.width,
                            height: size.height,
                        });
                    }
                }
                tauri::WindowEvent::Resized(size) => {
                    if let Ok(pos) = window.outer_position() {
                        save_window_state(&window.app_handle(), &WindowState {
                            x: pos.x,
                            y: pos.y,
                            width: size.width,
                            height: size.height,
                        });
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    let state: tauri::State<'_, AppState> = window.state();

                    // Kill agent first (it depends on gateway)
                    let agent_lock = state.agent.lock();
                    if let Ok(mut guard) = agent_lock {
                        if let Some(mut process) = guard.take() {
                            eprintln!("[Cafelua] Terminating agent-core...");
                            let _ = process.child.kill();
                        }
                    }

                    // Kill Node Host + Gateway (only if we spawned)
                    let gateway_lock = state.gateway.lock();
                    if let Ok(mut guard) = gateway_lock {
                        if let Some(mut process) = guard.take() {
                            // Kill Node Host first
                            if let Some(ref mut nh) = process.node_host {
                                log_both("[Cafelua] Terminating Node Host...");
                                let _ = nh.kill();
                            }
                            // Kill Gateway
                            if process.we_spawned {
                                log_both("[Cafelua] Terminating Gateway (we spawned it)...");
                                let _ = process.child.kill();
                            } else {
                                log_both("[Cafelua] Gateway not managed by us — leaving it running");
                            }
                        }
                    }
                    log_both("[Cafelua] === Session ended ===");
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_chunk_deserializes() {
        let json = r#"{"type":"text","requestId":"req-1","text":"Hello"}"#;
        let chunk: AgentChunk = serde_json::from_str(json).unwrap();
        assert_eq!(chunk.chunk_type, "text");
    }

    #[test]
    fn agent_chunk_usage_deserializes() {
        let json = r#"{"type":"usage","requestId":"req-1","inputTokens":100,"outputTokens":50,"cost":0.001,"model":"gemini-2.5-flash"}"#;
        let chunk: AgentChunk = serde_json::from_str(json).unwrap();
        assert_eq!(chunk.chunk_type, "usage");
    }

    #[test]
    fn window_state_serializes() {
        let state = WindowState {
            x: 100,
            y: 200,
            width: 380,
            height: 900,
        };
        let json = serde_json::to_string(&state).unwrap();
        let parsed: WindowState = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.x, 100);
        assert_eq!(parsed.width, 380);
    }

    #[tokio::test]
    async fn gateway_health_returns_ok() {
        // Should return Ok(bool), not Err — regardless of gateway state
        let result = gateway_health().await;
        assert!(result.is_ok());
    }

    #[test]
    fn cancel_request_formats_correctly() {
        let request_id = "req-123";
        let cancel = serde_json::json!({
            "type": "cancel_stream",
            "requestId": request_id
        });
        let s = cancel.to_string();
        assert!(s.contains("cancel_stream"));
        assert!(s.contains("req-123"));
    }

    #[test]
    fn find_node_binary_returns_result() {
        // Should find node on dev machine (CI may differ)
        let result = find_node_binary();
        // Either Ok (node found) or Err (not found) — both are valid
        match result {
            Ok(path) => assert!(!path.as_os_str().is_empty()),
            Err(e) => assert!(e.contains("Node.js")),
        }
    }

    #[test]
    fn check_gateway_health_sync_returns_bool() {
        // Should return a bool without panicking, regardless of gateway state
        let _healthy = check_gateway_health_sync();
        // Result is environment-dependent: true if gateway running, false if not
    }

    #[test]
    fn gateway_process_we_spawned_flag() {
        // Verify the struct has the expected fields
        let child = Command::new("true").spawn().unwrap();
        let process = GatewayProcess {
            child,
            node_host: None,
            we_spawned: false,
        };
        assert!(!process.we_spawned);
        assert!(process.node_host.is_none());

        let child2 = Command::new("true").spawn().unwrap();
        let nh = Command::new("true").spawn().unwrap();
        let process2 = GatewayProcess {
            child: child2,
            node_host: Some(nh),
            we_spawned: true,
        };
        assert!(process2.we_spawned);
        assert!(process2.node_host.is_some());
    }

    #[test]
    fn log_dir_creates_directory() {
        let dir = log_dir();
        assert!(dir.exists());
        assert!(dir.ends_with(".cafelua/logs"));
    }
}
