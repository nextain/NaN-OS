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
            let mut reader = reader;
            let mut buffer = [0_u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                        let _ = reader_app.emit(&format!("pty:output:{reader_id}"), data);
                    }
                }
            }
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
