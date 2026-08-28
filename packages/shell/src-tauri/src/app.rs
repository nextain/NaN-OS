use serde::{Deserialize, Serialize};

use crate::home_dir;

/// App manifest stored in ~/.naia/apps/{id}/app.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppManifest {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    /// Path to SVG icon file, relative to app directory (e.g. "icon.svg")
    #[serde(rename = "iconUrl", skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    /// Inline SVG content — populated at load time from iconUrl, not stored in app.json
    #[serde(
        rename = "iconSvg",
        skip_deserializing,
        skip_serializing_if = "Option::is_none"
    )]
    pub icon_svg: Option<String>,
    pub names: Option<std::collections::HashMap<String, String>>,
    pub version: Option<String>,
    /// Tools the app exposes to Naia. Declared statically in app.json so the
    /// Shell can register proxy stubs with the Agent; actual execution is routed
    /// to the app iframe via postMessage (GenericInstalledApp).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AppToolSpec>>,
    /// Absolute path to index.html if present — used for iframe rendering
    #[serde(
        rename = "htmlEntry",
        skip_deserializing,
        skip_serializing_if = "Option::is_none"
    )]
    pub html_entry: Option<String>,
}

/// A tool an installed app exposes to Naia.
/// Mirrors the shell `NaiaTool` shape — forwarded verbatim to the Agent.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppToolSpec {
    /// Unique skill name with `skill_` prefix, e.g. "skill_memo_read".
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// JSON Schema for parameters (arbitrary JSON object).
    #[serde(default)]
    pub parameters: serde_json::Value,
    /// Permission tier (0=auto, 1=notify, 2=confirm). Defaults to 1.
    #[serde(default = "default_tool_tier")]
    pub tier: u8,
}

fn default_tool_tier() -> u8 {
    1
}

fn apps_root(home: &std::path::Path) -> std::path::PathBuf {
    home.join(".naia").join("apps")
}

fn legacy_apps_root(home: &std::path::Path) -> std::path::PathBuf {
    home.join(".naia").join("apps")
}

fn valid_app_id(id: &str) -> bool {
    !id.is_empty()
        && !id.contains("..")
        && !id.contains('\0')
        && !id.chars().any(char::is_control)
        && id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
}

/// Move valid legacy `~/.naia/apps/*` installs into the canonical app store.
/// Existing canonical ids win; symlinks and malformed manifests are left untouched.
fn migrate_legacy_apps(home: &std::path::Path) -> Result<usize, String> {
    let legacy_root = legacy_apps_root(home);
    if !legacy_root.is_dir() {
        return Ok(0);
    }
    let canonical_legacy = dunce::canonicalize(&legacy_root)
        .map_err(|e| format!("Failed to inspect legacy app directory: {e}"))?;
    let canonical_root = apps_root(home);
    std::fs::create_dir_all(&canonical_root)
        .map_err(|e| format!("Failed to create apps directory: {e}"))?;
    let mut migrated = 0;

    for entry in std::fs::read_dir(&legacy_root)
        .map_err(|e| format!("Failed to read legacy app directory: {e}"))?
        .flatten()
    {
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let source = entry.path();
        let canonical_source = match dunce::canonicalize(&source) {
            Ok(value) if value.starts_with(&canonical_legacy) => value,
            _ => continue,
        };
        let id = std::fs::read_to_string(source.join("app.json"))
            .ok()
            .and_then(|data| serde_json::from_str::<serde_json::Value>(&data).ok())
            .and_then(|manifest| manifest.get("id")?.as_str().map(str::to_owned));
        let Some(id) = id.filter(|value| valid_app_id(value)) else {
            continue;
        };
        let destination = canonical_root.join(id);
        if destination.exists() {
            continue;
        }
        std::fs::rename(&canonical_source, &destination)
            .map_err(|e| format!("Failed to migrate legacy app: {e}"))?;
        migrated += 1;
    }
    Ok(migrated)
}

/// List installed apps by scanning ~/.naia/apps/ after the safe legacy migration.
#[tauri::command]
pub fn app_list_installed() -> Result<Vec<AppManifest>, String> {
    let home = home_dir();
    let home_path = std::path::PathBuf::from(&home);
    list_installed_at(&home_path)
}

fn list_installed_at(home_path: &std::path::Path) -> Result<Vec<AppManifest>, String> {
    migrate_legacy_apps(home_path)?;
    let apps_dir = apps_root(home_path);

    if !apps_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut apps: Vec<AppManifest> = Vec::new();

    let entries = match std::fs::read_dir(&apps_dir) {
        Ok(e) => e,
        Err(e) => return Err(format!("Failed to read apps directory: {e}")),
    };

    for entry in entries.flatten() {
        let manifest_path = entry.path().join("app.json");
        if !manifest_path.exists() {
            continue;
        }

        let data = match std::fs::read_to_string(&manifest_path) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let mut manifest: AppManifest = match serde_json::from_str(&data) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Load inline SVG if iconUrl is specified
        if let Some(ref icon_url) = manifest.icon_url.clone() {
            let svg_path = entry.path().join(icon_url);
            if let Ok(svg) = std::fs::read_to_string(&svg_path) {
                manifest.icon_svg = Some(svg);
            }
        }

        // Detect index.html for iframe rendering
        let html_path = entry.path().join("index.html");
        if html_path.exists() {
            manifest.html_entry = html_path.to_string_lossy().into_owned().into();
        }

        apps.push(manifest);
    }

    Ok(apps)
}

/// Read a file on behalf of an iframe app.
/// Restricted to files inside the user's HOME directory (max 1 MB).
/// Called from iframe-bridge.ts → Tauri invoke("app_read_file").
#[tauri::command]
pub fn app_read_file(path: String) -> Result<String, String> {
    let home = home_dir();
    // Canonicalize HOME itself to handle symlinks in the home path
    let home_path = dunce::canonicalize(&home).map_err(|_| "Access denied".to_string())?;

    // Resolve to canonical path to defeat symlink / path-traversal attacks.
    // Returns a generic "Access denied" to avoid leaking path existence.
    let canonical = dunce::canonicalize(&path).map_err(|_| "Access denied".to_string())?;

    if !canonical.starts_with(&home_path) {
        return Err("Access denied".to_string());
    }

    // Enforce 1 MB read limit to prevent OOM from large/virtual files
    const MAX_BYTES: u64 = 1024 * 1024;
    let metadata = std::fs::metadata(&canonical).map_err(|_| "Access denied".to_string())?;
    if metadata.len() > MAX_BYTES {
        return Err(format!("File too large (max {} bytes)", MAX_BYTES));
    }

    std::fs::read_to_string(&canonical).map_err(|e| format!("Failed to read file: {}", e))
}

/// Shell result returned to the iframe app.
#[derive(Debug, Serialize)]
pub struct AppShellResult {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

/// Allowed commands mapped to absolute paths to prevent PATH hijacking.
/// Note: path-containing arguments are blocked by the '/' restriction below.
/// File access should use app_read_file rather than shell commands.
#[cfg(unix)]
const SHELL_CMD_MAP: &[(&str, &str)] = &[
    ("ls", "/usr/bin/ls"),
    ("echo", "/usr/bin/echo"),
    ("pwd", "/usr/bin/pwd"),
    ("date", "/usr/bin/date"),
    ("uname", "/usr/bin/uname"),
    ("whoami", "/usr/bin/whoami"),
];

#[cfg(windows)]
const SHELL_CMD_MAP: &[(&str, &str)] = &[
    ("ls", r"C:\Windows\System32\cmd.exe"),    // /C dir
    ("echo", r"C:\Windows\System32\cmd.exe"),  // /C echo
    ("pwd", r"C:\Windows\System32\cmd.exe"),   // /C cd
    ("date", r"C:\Windows\System32\cmd.exe"),  // /C date /t
    ("uname", r"C:\Windows\System32\cmd.exe"), // /C ver
    ("whoami", r"C:\Windows\System32\whoami.exe"),
];

/// Map shell command name to Windows cmd.exe arguments
#[cfg(windows)]
fn windows_cmd_args(cmd: &str, args: &[String]) -> Vec<String> {
    match cmd {
        "ls" => {
            let mut v = vec!["/C".to_string(), "dir".to_string()];
            v.extend(args.iter().cloned());
            v
        }
        "echo" => {
            let mut v = vec!["/C".to_string(), "echo".to_string()];
            v.extend(args.iter().cloned());
            v
        }
        "pwd" => vec!["/C".to_string(), "cd".to_string()],
        "date" => vec!["/C".to_string(), "date".to_string(), "/t".to_string()],
        "uname" => vec!["/C".to_string(), "ver".to_string()],
        _ => args.to_vec(),
    }
}

/// Run an allowlisted shell command on behalf of an iframe app.
/// Uses absolute command paths (no PATH lookup). cwd is always HOME.
/// Called from iframe-bridge.ts → Tauri invoke("app_run_shell").
#[tauri::command]
pub fn app_run_shell(cmd: String, args: Vec<String>) -> Result<AppShellResult, String> {
    // Resolve command to absolute path — rejects anything not on the allowlist
    let program = SHELL_CMD_MAP
        .iter()
        .find(|(name, _)| *name == cmd.as_str())
        .map(|(_, path)| *path)
        .ok_or_else(|| format!("Command not allowed: {}", cmd))?;

    // Validate args: no shell metacharacters, null bytes, path separators, or traversal
    for arg in &args {
        if arg.contains('\0') {
            return Err("Argument contains null byte".to_string());
        }
        if arg.contains(['|', '&', ';', '$', '`', '\n', '\r']) {
            return Err(format!("Argument contains disallowed characters: {}", arg));
        }
        // Block path separators (both / and \ on all platforms)
        if arg.contains('/') || arg.contains('\\') {
            return Err(format!("Path separator not allowed in argument: {}", arg));
        }
        if arg.contains("..") {
            return Err(format!("Path traversal not allowed in argument: {}", arg));
        }
    }

    let home = home_dir();
    // Canonicalize HOME consistently with app_read_file; fall back to raw path if unavailable
    let home_path = dunce::canonicalize(&home).unwrap_or_else(|_| std::path::PathBuf::from(&home));

    #[cfg(unix)]
    let final_args = args.clone();
    #[cfg(windows)]
    let final_args = windows_cmd_args(&cmd, &args);

    let mut cmd = std::process::Command::new(program);
    cmd.args(&final_args).current_dir(&home_path); // Always run from HOME, never inheriting Tauri's cwd
    crate::platform::hide_console(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    Ok(AppShellResult {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code().unwrap_or(-1),
    })
}

/// Remove an installed app by its app id.
///
/// Scans `~/.naia/apps/*/app.json` and removes every directory whose
/// manifest `id` matches — this is robust to the directory name differing from
/// the id (e.g. a repo cloned as `naia-memo-app` but whose app.json
/// declares `id: "memo"`). Mirrors the legacy agent `actionRemove` logic.
#[tauri::command]
pub fn app_remove_installed(app_id: String) -> Result<(), String> {
    if !valid_app_id(&app_id) {
        return Err(format!("Invalid app id: {}", app_id));
    }

    let home = home_dir();
    let home_path = std::path::PathBuf::from(&home);
    remove_installed_at(&home_path, &app_id)
}

fn remove_installed_at(home_path: &std::path::Path, app_id: &str) -> Result<(), String> {
    let apps_root = apps_root(&home_path);

    if !apps_root.is_dir() {
        return Ok(()); // nothing installed
    }

    #[derive(Deserialize)]
    struct ManifestLite {
        id: Option<String>,
    }

    for entry in
        std::fs::read_dir(&apps_root).map_err(|e| format!("Failed to read apps dir: {}", e))?
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        // Skip in-flight install temp dirs.
        if entry
            .file_name()
            .to_string_lossy()
            .starts_with(".~install-")
        {
            continue;
        }

        let dir = entry.path();
        let manifest_path = dir.join("app.json");
        if !manifest_path.exists() {
            continue;
        }

        let id = std::fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|d| serde_json::from_str::<ManifestLite>(&d).ok())
            .and_then(|m| m.id);
        if id.as_deref() != Some(app_id) {
            continue;
        }

        let canonical_apps_root =
            dunce::canonicalize(&apps_root).map_err(|_| "Access denied".to_string())?;
        // Canonicalize to defeat symlinks — never delete outside the app store.
        let canonical = dunce::canonicalize(&dir).map_err(|_| "Access denied".to_string())?;
        if !canonical.starts_with(&canonical_apps_root) || canonical == canonical_apps_root {
            return Err("Access denied".to_string());
        }
        std::fs::remove_dir_all(&canonical)
            .map_err(|e| format!("Failed to remove app {}: {}", app_id, e))?;
        // Keep scanning — removes every dir bound to this id (dedupe).
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_app(root: &std::path::Path, directory: &str, id: &str) -> std::path::PathBuf {
        let path = root.join(directory);
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(
            path.join("app.json"),
            serde_json::json!({ "id": id, "name": id }).to_string(),
        )
        .unwrap();
        std::fs::write(path.join("index.html"), "ok").unwrap();
        path
    }

    #[test]
    fn legacy_install_migrates_to_canonical_apps_store_and_can_be_removed() {
        let home = tempfile::tempdir().unwrap();
        let legacy = legacy_apps_root(home.path());
        let old = write_app(&legacy, "old-repo-name", "notes");

        assert_eq!(migrate_legacy_apps(home.path()).unwrap(), 1);
        assert!(!old.exists());
        let installed = apps_root(home.path()).join("notes");
        assert!(installed.join("app.json").is_file());
        let first_list = list_installed_at(home.path()).unwrap();
        let restart_list = list_installed_at(home.path()).unwrap();
        assert_eq!(first_list.len(), 1);
        assert_eq!(restart_list[0].id, "notes");

        remove_installed_at(home.path(), "notes").unwrap();
        assert!(!installed.exists());
        assert!(list_installed_at(home.path()).unwrap().is_empty());
    }

    #[test]
    fn canonical_duplicate_wins_without_deleting_legacy_data() {
        let home = tempfile::tempdir().unwrap();
        let canonical = write_app(&apps_root(home.path()), "notes", "notes");
        let legacy = write_app(&legacy_apps_root(home.path()), "old-notes", "notes");

        assert_eq!(migrate_legacy_apps(home.path()).unwrap(), 0);
        assert!(canonical.exists());
        assert!(legacy.exists());
    }

    #[test]
    fn malformed_ids_and_symlinks_cannot_escape_the_app_store() {
        let home = tempfile::tempdir().unwrap();
        assert!(!valid_app_id("../outside"));
        assert!(!valid_app_id("nested/app"));
        assert!(remove_installed_at(home.path(), "../outside").is_ok());

        #[cfg(unix)]
        {
            let outside = tempfile::tempdir().unwrap();
            write_app(outside.path(), "victim", "linked");
            std::fs::create_dir_all(apps_root(home.path())).unwrap();
            std::os::unix::fs::symlink(
                outside.path().join("victim"),
                apps_root(home.path()).join("linked"),
            )
            .unwrap();
            remove_installed_at(home.path(), "linked").unwrap();
            assert!(outside.path().join("victim").exists());
        }
    }
}

/// Result of a successful app install.
#[derive(Debug, Serialize)]
pub struct AppInstallResult {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// Derive a app directory name from a Git URL.
/// Strips query/hash, trailing slash and ".git", then takes the last path segment.
fn derive_app_name(source: &str) -> String {
    let s = source.trim();
    // strip query/hash
    let s = s.split(['?', '#']).next().unwrap_or(s);
    // strip trailing slash(es)
    let s = s.trim_end_matches('/');
    // strip .git suffix
    let s = s.trim_end_matches(".git");
    // take last path segment (after last '/' or ':')
    let seg = s.rsplit(['/', ':']).next().unwrap_or(s);
    seg.to_string()
}

/// Install a app from a Git URL into `~/.naia/apps/{app-id}/`.
///
/// Ported from the legacy agent skill `agent/src/skills/built-in/app.ts`
/// (#89, with #257 HTTPS-only hardening) into a shell-side Tauri command —
/// app install is a filesystem operation, not an AI task, so it belongs in
/// the shell rather than being routed through the agent.
///
/// The directory name is the app **id** (read from the cloned `app.json`),
/// NOT the repo name. This keeps `app_remove_installed` (which matches by id)
/// consistent: dir name == id == canonical identifier.
///
/// Security:
/// - HTTPS-only (#257): rejects `http://`, `git@`, `file://`, `data:`, bare paths.
/// - The app id (untrusted, from app.json) is sanitized before becoming a
///   path segment, so the destination cannot escape `~/.naia/apps/`.
/// - `git` is invoked with an arg vector (no shell).
/// - On any failure the temp clone is removed.
#[tauri::command]
pub fn app_install(source: String) -> Result<AppInstallResult, String> {
    let source = source.trim();

    // #257: HTTPS-only.
    if !source.starts_with("https://") {
        return Err(format!(
            "지원하지 않는 소스입니다. HTTPS Git URL만 설치할 수 있습니다\n(예: https://github.com/org/app.git).\n받은 소스: {}",
            source
        ));
    }

    let derived = derive_app_name(source);
    // The derived name is only used for the temp dir; still sanity-check it.
    let derived_ok = !derived.is_empty()
        && derived
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_');
    if !derived_ok {
        return Err(format!(
            "유효하지 않은 저장소 이름이 도출되었습니다: {:?}",
            derived
        ));
    }

    let home = home_dir();
    let home_path = dunce::canonicalize(&home).unwrap_or_else(|_| std::path::PathBuf::from(&home));
    let apps_root = apps_root(&std::path::PathBuf::from(&home));
    std::fs::create_dir_all(&apps_root).map_err(|e| format!("앱 디렉토리 생성 실패: {}", e))?;

    // Temp clone target *inside* apps_root (same volume → rename is atomic).
    // Leading-dot prefix keeps it out of the installed-app list while cloning.
    let tmp = apps_root.join(format!(".~install-{}", derived));
    if tmp.exists() {
        let _ = std::fs::remove_dir_all(&tmp); // clear stale partial clone
    }

    // Clone via arg vector — no shell, no shell injection. --depth 1 for speed.
    let mut command = std::process::Command::new("git");
    command.args(["clone", "--depth", "1", source, &tmp.to_string_lossy()]);
    crate::platform::hide_console(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("git 실행 실패 (git이 설치되어 있는지 확인): {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_dir_all(&tmp);
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "git clone 실패: {}",
            if stderr.is_empty() {
                "알 수 없는 오류".to_string()
            } else {
                stderr
            }
        ));
    }

    // Verify app.json manifest exists.
    let manifest_path = tmp.join("app.json");
    if !manifest_path.exists() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err(
            "설치된 앱에 app.json 매니페스트가 없습니다 — 임시 디렉토리를 제거했습니다."
                .to_string(),
        );
    }

    // Read id (the canonical app id → becomes the directory name).
    #[derive(Deserialize)]
    struct ManifestLite {
        id: Option<String>,
        name: Option<String>,
    }
    let (id, display_name) = std::fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|data| serde_json::from_str::<ManifestLite>(&data).ok())
        .map(|m| {
            (
                m.id.unwrap_or_else(|| derived.clone()),
                m.name.unwrap_or_else(|| derived.clone()),
            )
        })
        .unwrap_or_else(|| (derived.clone(), derived.clone()));

    // The id becomes a path segment — sanitize strictly.
    if !valid_app_id(&id) {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err(format!(
            "app.json의 id가 유효하지 않아 설치할 수 없습니다 (영문/숫자/-/_ 만 허용): {:?}",
            id
        ));
    }

    // Final destination keyed by id.
    let dest = apps_root.join(&id);
    if dest.exists() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err(format!(
            "앱 \"{}\" 이(가) 이미 설치되어 있습니다: {}\n먼저 제거한 뒤 다시 설치하세요.",
            id,
            dest.display()
        ));
    }

    // Move temp → final (same volume, so rename is O(1) and atomic).
    std::fs::rename(&tmp, &dest).map_err(|e| {
        let _ = std::fs::remove_dir_all(&tmp);
        format!("설치 마무리 실패 (rename): {}", e)
    })?;

    // Home boundary sanity check (defense in depth).
    if let Ok(canonical_dest) = dunce::canonicalize(&dest) {
        if !canonical_dest.starts_with(&home_path) {
            let _ = std::fs::remove_dir_all(&canonical_dest);
            return Err("Access denied".to_string());
        }
    }

    Ok(AppInstallResult {
        id,
        name: display_name,
        path: dest.to_string_lossy().into_owned(),
    })
}
