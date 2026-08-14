use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::Read;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use crate::pty::{PtyCreated, PtyHandle, PtyKind, PtyRegistry};

use super::config::{herdr_bin, validate_herdr, write_embedded_herdr_config};

static HERDR_LAUNCH_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn existing_herdr_id<'a>(entries: impl IntoIterator<Item = (&'a str, PtyKind)>) -> Option<&'a str> {
    entries
        .into_iter()
        .find_map(|(id, kind)| (kind == PtyKind::Herdr).then_some(id))
}

/// Emit buffered PTY output as one `pty:output` event, keeping any trailing
/// incomplete UTF-8 sequence in `pending` for the next flush (unless `force`).
fn flush_pty_output(app: &AppHandle, id: &str, pending: &mut Vec<u8>, force: bool) {
    if pending.is_empty() {
        return;
    }
    let cut = if force {
        pending.len()
    } else {
        match std::str::from_utf8(pending) {
            Ok(_) => pending.len(),
            Err(e) => e.valid_up_to(),
        }
    };
    if cut == 0 {
        return;
    }
    let data = String::from_utf8_lossy(&pending[..cut]).to_string();
    let _ = app.emit(&format!("pty:output:{id}"), data);
    pending.drain(..cut);
}

/// Launch the real Herdr client in a dedicated PTY. The frontend cannot choose
/// an executable, argument, or environment variable. Repeated calls reuse the
/// live embedded client rather than attaching a second client.
#[tauri::command]
pub async fn herdr_pty_create(
    registry: tauri::State<'_, PtyRegistry>,
    app: AppHandle,
    dir: String,
    rows: u16,
    cols: u16,
) -> Result<PtyCreated, String> {
    let dir_path =
        dunce::canonicalize(&dir).map_err(|e| format!("Invalid Herdr working directory: {e}"))?;
    if !dir_path.is_dir() {
        return Err("Herdr working directory is not a directory".to_string());
    }
    validate_herdr()?;
    let config_path = write_embedded_herdr_config(&app)?;
    let registry = Arc::clone(&registry);

    tokio::task::spawn_blocking(move || {
        let _launch_guard = HERDR_LAUNCH_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "Herdr launch lock poisoned".to_string())?;
        let existing_id = {
            let handles = registry.lock().unwrap();
            existing_herdr_id(
                handles
                    .iter()
                    .map(|(id, handle)| (id.as_str(), handle.kind)),
            )
            .map(str::to_owned)
        };
        if let Some(pty_id) = existing_id {
            let pid = pty_id
                .strip_prefix("pty-")
                .and_then(|value| value.parse().ok())
                .unwrap_or_default();
            return Ok(PtyCreated { pty_id, pid });
        }

        let pair = NativePtySystem::default()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("open Herdr PTY failed: {e}"))?;
        let mut command = CommandBuilder::new(herdr_bin());
        command.cwd(&dir_path);
        command.env("HERDR_CONFIG_PATH", config_path);
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("Herdr spawn failed: {e}"))?;
        let pid = child
            .process_id()
            .ok_or_else(|| "Herdr PID unavailable".to_string())?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Herdr PTY writer failed: {e}"))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Herdr PTY reader failed: {e}"))?;
        let pty_id = format!("pty-{pid}");
        registry.lock().unwrap().insert(
            pty_id.clone(),
            PtyHandle {
                master: pair.master,
                writer,
                kind: PtyKind::Herdr,
            },
        );

        let reader_id = pty_id.clone();
        let reader_app = app.clone();
        let reader_registry = Arc::clone(&registry);
        std::thread::spawn(move || {
            // Coalesce PTY output into ~8ms windows so a heavy TUI redraw does not
            // flood the IPC bridge with one event per read. A dedicated read
            // sub-thread feeds raw 64KB chunks; this thread batches and emits them.
            use std::sync::mpsc::{self, RecvTimeoutError};
            use std::time::{Duration, Instant};
            const FLUSH: Duration = Duration::from_millis(8);
            const MAX_PENDING: usize = 256 * 1024;
            let (tx, rx) = mpsc::channel::<Vec<u8>>();
            let read_thread = std::thread::spawn(move || {
                let mut reader = reader;
                let mut buffer = [0_u8; 65536];
                while let Ok(count) = reader.read(&mut buffer) {
                    if count == 0 || tx.send(buffer[..count].to_vec()).is_err() {
                        break;
                    }
                }
            });
            let mut pending: Vec<u8> = Vec::new();
            let mut deadline = Instant::now() + FLUSH;
            loop {
                let timeout = deadline.saturating_duration_since(Instant::now());
                match rx.recv_timeout(timeout) {
                    Ok(chunk) => {
                        pending.extend_from_slice(&chunk);
                        if pending.len() >= MAX_PENDING {
                            flush_pty_output(&reader_app, &reader_id, &mut pending, false);
                            deadline = Instant::now() + FLUSH;
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        flush_pty_output(&reader_app, &reader_id, &mut pending, false);
                        deadline = Instant::now() + FLUSH;
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        flush_pty_output(&reader_app, &reader_id, &mut pending, true);
                        break;
                    }
                }
            }
            let _ = read_thread.join();
            reader_registry.lock().unwrap().remove(&reader_id);
            let _ = reader_app.emit(&format!("pty:exit:{reader_id}"), ());
        });

        let wait_id = pty_id.clone();
        let wait_app = app;
        let wait_registry = Arc::clone(&registry);
        std::thread::spawn(move || {
            let mut child = child;
            let _ = child.wait();
            if wait_registry.lock().unwrap().remove(&wait_id).is_some() {
                let _ = wait_app.emit(&format!("pty:exit:{wait_id}"), ());
            }
        });
        Ok(PtyCreated { pty_id, pid })
    })
    .await
    .map_err(|e| format!("Herdr spawn task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::existing_herdr_id;
    use crate::pty::PtyKind;

    #[test]
    fn reuses_only_herdr_and_never_an_ordinary_shell_pty() {
        let entries = [
            ("pty-11", PtyKind::Shell),
            ("pty-22", PtyKind::Herdr),
            ("pty-33", PtyKind::Shell),
        ];
        assert_eq!(existing_herdr_id(entries), Some("pty-22"));
        assert_eq!(existing_herdr_id([("pty-11", PtyKind::Shell)]), None);
    }
}
