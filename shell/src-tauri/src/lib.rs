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

struct AppState {
    agent: Mutex<Option<AgentProcess>>,
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

/// Spawn the Node.js agent-core process with stdio pipes
fn spawn_agent_core(app_handle: &AppHandle) -> Result<AgentProcess, String> {
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

    // Stdout reader thread: forward JSON lines as Tauri events
    let handle = app_handle.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(json_line) => {
                    let trimmed = json_line.trim();
                    if trimmed.is_empty() || !trimmed.starts_with('{') {
                        continue;
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
) -> Result<(), String> {
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
                    return restart_agent(state, handle, message);
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
                    restart_agent(state, handle, message)
                } else {
                    Err(format!("Write failed: {}", e))
                }
            }
        }
    } else {
        drop(guard);
        if let Some(handle) = app_handle {
            restart_agent(state, handle, message)
        } else {
            Err("agent-core not running".to_string())
        }
    }
}

fn restart_agent(
    state: &AppState,
    app_handle: &AppHandle,
    message: &str,
) -> Result<(), String> {
    eprintln!("[Cafelua] Restarting agent-core...");
    match spawn_agent_core(app_handle) {
        Ok(process) => {
            let mut guard = state
                .agent
                .lock()
                .map_err(|e| format!("Lock error: {}", e))?;
            *guard = Some(process);
            eprintln!("[Cafelua] agent-core restarted");
            drop(guard);
            std::thread::sleep(std::time::Duration::from_millis(300));
            send_to_agent(state, message, None)
        }
        Err(e) => Err(format!("Restart failed: {}", e)),
    }
}

#[tauri::command]
async fn send_to_agent_command(
    app: AppHandle,
    message: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    send_to_agent(&state, &message, Some(&app))
}

#[tauri::command]
async fn cancel_stream(
    app: AppHandle,
    request_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let cancel = serde_json::json!({
        "type": "cancel_stream",
        "requestId": request_id
    });
    send_to_agent(&state, &cancel.to_string(), Some(&app))
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
        })
        .invoke_handler(tauri::generate_handler![
            send_to_agent_command,
            cancel_stream,
            reset_window_state,
            preview_tts,
            gateway_health,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state: tauri::State<'_, AppState> = app.state();

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

            match spawn_agent_core(&app_handle) {
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
                    let lock_result = state.agent.lock();
                    if let Ok(mut guard) = lock_result {
                        if let Some(mut process) = guard.take() {
                            eprintln!("[Cafelua] Terminating agent-core...");
                            let _ = process.child.kill();
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
    async fn gateway_health_returns_false_when_no_gateway() {
        // No gateway running → should return false, not error
        let result = gateway_health().await;
        assert!(result.is_ok());
        // Gateway likely not running during test
        assert_eq!(result.unwrap(), false);
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
}
