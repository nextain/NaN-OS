mod audit;

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

// OpenClaw Gateway process handle
struct GatewayProcess {
    child: Child,
    we_spawned: bool, // only kill on shutdown if we spawned it
}

struct AppState {
    agent: Mutex<Option<AgentProcess>>,
    gateway: Mutex<Option<GatewayProcess>>,
}

struct AuditState {
    db: audit::AuditDb,
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

/// Spawn or attach to OpenClaw Gateway
fn spawn_gateway() -> Result<GatewayProcess, String> {
    // 1. Check if already running (e.g. systemd or manual start)
    if check_gateway_health_sync() {
        eprintln!("[Cafelua] Gateway already running — reusing existing instance");
        // Return a dummy process (no child to kill)
        // Use a no-op child: spawn a trivial process that exits immediately
        let child = Command::new("true")
            .spawn()
            .map_err(|e| format!("Failed to create dummy process: {}", e))?;
        return Ok(GatewayProcess {
            child,
            we_spawned: false,
        });
    }

    // 2. Find Node.js
    let node_bin = find_node_binary()?;

    // 3. Find openclaw binary
    let home = std::env::var("HOME").unwrap_or_default();
    let openclaw_bin = format!("{}/.cafelua/openclaw/node_modules/.bin/openclaw", home);
    if !std::path::Path::new(&openclaw_bin).exists() {
        return Err(format!(
            "OpenClaw not installed at {}. Run: config/scripts/setup-openclaw.sh",
            openclaw_bin
        ));
    }

    // 4. Config path
    let openclaw_dir = format!("{}/.cafelua/openclaw", home);
    let config_path = format!("{}/openclaw.json", openclaw_dir);

    eprintln!(
        "[Cafelua] Spawning Gateway: {} {} gateway run --bind loopback --port 18789",
        node_bin.display(),
        openclaw_bin
    );

    // 5. Spawn
    let child = Command::new(node_bin.as_os_str())
        .arg(&openclaw_bin)
        .arg("gateway")
        .arg("run")
        .arg("--bind")
        .arg("loopback")
        .arg("--port")
        .arg("18789")
        .env("OPENCLAW_CONFIG_PATH", &config_path)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to spawn Gateway: {}", e))?;

    eprintln!("[Cafelua] Gateway process spawned (PID: {})", child.id());

    // 6. Wait for health check (max 5s, 500ms intervals)
    for i in 0..10 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if check_gateway_health_sync() {
            eprintln!(
                "[Cafelua] Gateway healthy after {}ms",
                (i + 1) * 500
            );
            return Ok(GatewayProcess {
                child,
                we_spawned: true,
            });
        }
    }

    // Gateway started but not healthy — still return it, maybe it needs more time
    eprintln!("[Cafelua] Gateway spawned but not yet healthy — continuing anyway");
    Ok(GatewayProcess {
        child,
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

            // Spawn Gateway first (Agent connects to it via WebSocket)
            let (gateway_running, gateway_managed) = match spawn_gateway() {
                Ok(process) => {
                    let managed = process.we_spawned;
                    let mut guard = state.gateway.lock().unwrap();
                    *guard = Some(process);
                    eprintln!("[Cafelua] Gateway ready (managed={})", managed);
                    (true, managed)
                }
                Err(e) => {
                    eprintln!("[Cafelua] Gateway not available: {}", e);
                    eprintln!("[Cafelua] Running without Gateway (tools will be unavailable)");
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
                    eprintln!("[Cafelua] agent-core started");
                }
                Err(e) => {
                    eprintln!("[Cafelua] agent-core not available: {}", e);
                    eprintln!("[Cafelua] Running without agent (chat will be unavailable)");
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

                    // Kill gateway only if we spawned it
                    let gateway_lock = state.gateway.lock();
                    if let Ok(mut guard) = gateway_lock {
                        if let Some(mut process) = guard.take() {
                            if process.we_spawned {
                                eprintln!("[Cafelua] Terminating Gateway (we spawned it)...");
                                let _ = process.child.kill();
                            } else {
                                eprintln!("[Cafelua] Gateway not managed by us — leaving it running");
                            }
                        }
                    }
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
            we_spawned: false,
        };
        assert!(!process.we_spawned);

        let child2 = Command::new("true").spawn().unwrap();
        let process2 = GatewayProcess {
            child: child2,
            we_spawned: true,
        };
        assert!(process2.we_spawned);
    }
}
