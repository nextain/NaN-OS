use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static RECORDING: OnceLock<Mutex<Option<(Child, PathBuf)>>> = OnceLock::new();

fn root(adk_path: &str, app_id: &str) -> Result<PathBuf, String> {
    // app_id is a single path component; '.'/'..' would traverse out of apps/ (the
    // char whitelist permits '.'). Reject them, and defense-in-depth: verify the
    // canonical root stays under the canonical apps dir so no traversal can escape.
    if app_id.is_empty() || app_id.len() > 160 || app_id == "." || app_id == ".." || !app_id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')) {
        return Err("invalid app id".into());
    }
    let apps = Path::new(adk_path).join("data-private").join("apps");
    std::fs::create_dir_all(&apps).map_err(|error| error.to_string())?;
    let apps = apps.canonicalize().map_err(|error| error.to_string())?;
    let root = apps.join(app_id);
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    if !root.starts_with(&apps) {
        return Err("app id escapes the sandbox root".into());
    }
    Ok(root)
}

fn file(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative_path.is_empty() || relative.is_absolute() || relative.components().any(|part| !matches!(part, Component::Normal(_))) {
        return Err("sandbox paths must be relative".into());
    }
    let output = root.join(relative);
    let parent = output.parent().ok_or("sandbox path has no parent")?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    if !parent.canonicalize().map_err(|error| error.to_string())?.starts_with(root) {
        return Err("sandbox path escape rejected".into());
    }
    Ok(output)
}

#[tauri::command]
pub fn app_sandbox_root(adk_path: String, app_id: String) -> Result<String, String> {
    Ok(root(&adk_path, &app_id)?.to_string_lossy().into_owned())
}
#[tauri::command]
pub fn app_sandbox_write_file(adk_path: String, app_id: String, relative_path: String, bytes: Vec<u8>) -> Result<String, String> {
    let output = file(&root(&adk_path, &app_id)?, &relative_path)?;
    std::fs::write(&output, bytes).map_err(|error| error.to_string())?;
    Ok(output.to_string_lossy().into_owned())
}
#[tauri::command]
pub fn app_sandbox_read_file(adk_path: String, app_id: String, relative_path: String) -> Result<Vec<u8>, String> {
    let output = file(&root(&adk_path, &app_id)?, &relative_path)?;
    if !output.is_file() { return Err("sandbox file does not exist".into()); }
    std::fs::read(&output).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn app_sandbox_open_in_workspace(app: AppHandle, adk_path: String, app_id: String, relative_path: String) -> Result<String, String> {
    let output = file(&root(&adk_path, &app_id)?, &relative_path)?;
    if !output.is_file() { return Err("sandbox file does not exist".into()); }
    let path = output.to_string_lossy().into_owned();
    // Sandbox lives under <adkPath>/data-private/apps, outside the git workspace root,
    // so grant this exact file a session read/write grant (as CLI/drag-drop do) or the
    // workspace viewer rejects it. Emit the granted (canonical) path.
    let granted = crate::workspace::grant_open_file(&path).unwrap_or(path);
    app.emit("workspace-open-file-request", granted.clone()).map_err(|error| error.to_string())?;
    Ok(granted)
}
#[tauri::command]
pub fn slides_recording_start(adk_path: String) -> Result<(), String> {
    let recording = RECORDING.get_or_init(|| Mutex::new(None));
    let mut recording = recording.lock().map_err(|_| "recording lock poisoned")?;
    if recording.is_some() { return Err("recording already active".into()); }
    let folder = root(&adk_path, "land.naia.slides")?.join("video");
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs();
    let output = folder.join(format!("naia-presentation-{timestamp}.mp4"));
    let ffmpeg = std::env::var("NAIA_FFMPEG_PATH").unwrap_or_else(|_| "ffmpeg".into());
    let child = Command::new(ffmpeg).args(["-y", "-f", "gdigrab", "-framerate", "30", "-draw_mouse", "0", "-i", "title=Naia", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"]).arg(&output).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|error| format!("could not start MP4 recording: {error}"))?;
    *recording = Some((child, output));
    Ok(())
}
#[tauri::command]
pub fn slides_recording_stop() -> Result<String, String> {
    let recording = RECORDING.get_or_init(|| Mutex::new(None));
    let mut recording = recording.lock().map_err(|_| "recording lock poisoned")?;
    let (mut child, output) = recording.take().ok_or("recording is not active")?;
    let _ = child.kill();
    let _ = child.wait();
    Ok(output.to_string_lossy().into_owned())
}

#[cfg(test)]
mod app_sandbox_escape_tests {
    use super::root;
    // Distinct temp ADK per test process; leaves dirs (test scratch) — acceptable.
    fn adk() -> String {
        std::env::temp_dir()
            .join(format!("naia-sbx-{}", std::process::id()))
            .to_string_lossy()
            .into_owned()
    }
    #[test]
    fn rejects_parent_traversal_app_id() {
        // ".." would escape <adk>/data-private/apps into data-private (codex #1).
        assert!(root(&adk(), "..").is_err());
        assert!(root(&adk(), ".").is_err());
    }
    #[test]
    fn allows_normal_dotted_app_id_and_contains_it() {
        let r = root(&adk(), "land.naia.shell").expect("normal app id ok");
        assert!(r.ends_with("land.naia.shell"));
        assert!(r.to_string_lossy().replace('\\', "/").contains("data-private/apps/land.naia.shell"));
    }
}
