use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const HERDR_MIN_VERSION: (u32, u32, u32) = (0, 8, 0);
static HERDR_CONFIG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static HERDR_CONFIG_PATH: OnceLock<std::path::PathBuf> = OnceLock::new();

pub(super) fn herdr_command() -> std::process::Command {
    let mut command = std::process::Command::new("herdr");
    crate::platform::hide_console(&mut command);
    command
}

fn parse_herdr_version(raw: &str) -> Option<(u32, u32, u32)> {
    let version = raw.split_whitespace().find(|part| {
        part.chars().next().is_some_and(|c| c.is_ascii_digit()) && part.contains('.')
    })?;
    let mut parts = version.split('.');
    Some((
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.split('-').next()?.parse().ok()?,
    ))
}

fn replace_or_insert_ui_setting(config: &mut String, key: &str, value: &str) {
    let lines: Vec<&str> = config.lines().collect();
    let mut in_ui = false;
    let mut ui_found = false;
    let mut replaced = false;
    let mut output = Vec::with_capacity(lines.len() + 4);

    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if in_ui && !replaced {
                output.push(format!("{key} = {value}"));
                replaced = true;
            }
            in_ui = trimmed == "[ui]";
            ui_found |= in_ui;
        }
        if in_ui {
            let uncommented = trimmed.strip_prefix('#').unwrap_or(trimmed).trim();
            if uncommented
                .split_once('=')
                .is_some_and(|(candidate, _)| candidate.trim() == key)
            {
                if !replaced {
                    output.push(format!("{key} = {value}"));
                    replaced = true;
                }
                continue;
            }
        }
        output.push(line.to_string());
    }
    if !ui_found {
        output.push(String::new());
        output.push("[ui]".to_string());
    }
    if !replaced {
        output.push(format!("{key} = {value}"));
    }
    *config = output.join("\n") + "\n";
}

pub(super) fn write_embedded_herdr_config(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if let Some(path) = HERDR_CONFIG_PATH.get() {
        return Ok(path.clone());
    }
    let _config_guard = HERDR_CONFIG_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Herdr config lock poisoned".to_string())?;
    if let Some(path) = HERDR_CONFIG_PATH.get() {
        return Ok(path.clone());
    }
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("herdr app config directory unavailable: {e}"))?
        .join("herdr-embedded");
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("herdr embedded config directory failed: {e}"))?;

    let global_path = dirs::config_dir().map(|path| path.join("herdr").join("config.toml"));
    let mut config = global_path
        .as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_else(|| "[ui]\n".to_string());
    replace_or_insert_ui_setting(&mut config, "sidebar_start_collapsed", "true");
    replace_or_insert_ui_setting(&mut config, "sidebar_collapsed_mode", "\"hidden\"");

    let path = config_dir.join("config.toml");
    let temporary = config_dir.join("config.toml.tmp");
    std::fs::write(&temporary, config.as_bytes())
        .map_err(|e| format!("herdr embedded config write failed: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("herdr embedded config permissions failed: {e}"))?;
    }
    #[cfg(windows)]
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("herdr embedded config replace preparation failed: {e}"))?;
    }
    std::fs::rename(&temporary, &path)
        .map_err(|e| format!("herdr embedded config replace failed: {e}"))?;
    let _ = HERDR_CONFIG_PATH.set(path.clone());
    Ok(path)
}

pub(super) fn validate_herdr() -> Result<String, String> {
    let output = herdr_command()
        .arg("--version")
        .output()
        .map_err(|e| format!("Herdr is not installed or not on PATH: {e}"))?;
    if !output.status.success() {
        return Err("Herdr version check failed".to_string());
    }
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let version =
        parse_herdr_version(&raw).ok_or_else(|| format!("Unrecognized Herdr version: {raw}"))?;
    if version < HERDR_MIN_VERSION {
        return Err(format!("Herdr 0.8.0 or newer is required; found {raw}"));
    }
    Ok(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_config_preserves_other_settings_and_replaces_sidebar_values() {
        let mut config = "theme = \"naia\"\n[ui]\nsidebar_start_collapsed = false\n# sidebar_collapsed_mode = \"compact\"\nmobile_breakpoint = 90\n[keys]\nquit = \"q\"\n".to_string();
        replace_or_insert_ui_setting(&mut config, "sidebar_start_collapsed", "true");
        replace_or_insert_ui_setting(&mut config, "sidebar_collapsed_mode", "\"hidden\"");
        assert!(config.contains("theme = \"naia\""));
        assert!(config.contains("sidebar_start_collapsed = true"));
        assert!(config.contains("sidebar_collapsed_mode = \"hidden\""));
        assert!(config.contains("mobile_breakpoint = 90"));
        assert!(config.contains("[keys]"));
        assert_eq!(config.matches("sidebar_start_collapsed").count(), 1);
    }

    #[test]
    fn parses_supported_version_shapes() {
        assert_eq!(parse_herdr_version("herdr 0.8.0"), Some((0, 8, 0)));
        assert_eq!(parse_herdr_version("herdr 1.2.3-preview"), Some((1, 2, 3)));
    }
}
