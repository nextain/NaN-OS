use tauri::AppHandle;

use super::config::{herdr_command, set_herdr_theme, validate_herdr, write_embedded_herdr_config};

pub(super) const HERDR_PROTOCOL: u64 = 19;
// Herdr currently transports prompts as process arguments. Stay below the
// Windows CreateProcess command-line ceiling after executable/flag overhead.
const HERDR_PROMPT_MAX_BYTES: usize = 12 * 1024;
const HERDR_ID_PART_MAX_BYTES: usize = 64;
const HERDR_LABEL_MAX_BYTES: usize = 256;

pub(super) fn herdr_api_output(
    config_path: &std::path::Path,
    args: &[&str],
) -> Result<String, String> {
    let output = herdr_command()
        .env("HERDR_CONFIG_PATH", config_path)
        .args(args)
        .output()
        .map_err(|e| format!("Herdr API unavailable: {e}"))?;
    if !output.status.success() {
        let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if reason.is_empty() {
            "Herdr API command failed".to_string()
        } else {
            reason
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn herdr_snapshot(app: AppHandle) -> Result<serde_json::Value, String> {
    let config_path = write_embedded_herdr_config(&app)?;
    tokio::task::spawn_blocking(move || {
        validate_herdr()?;
        let raw = herdr_api_output(&config_path, &["api", "snapshot"])?;
        let envelope: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("Invalid Herdr snapshot: {e}"))?;
        let snapshot = envelope
            .pointer("/result/snapshot")
            .cloned()
            .ok_or_else(|| "Herdr snapshot payload missing".to_string())?;
        let protocol = snapshot
            .get("protocol")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| "Herdr snapshot protocol missing".to_string())?;
        if protocol != HERDR_PROTOCOL {
            return Err(format!(
                "Unsupported Herdr protocol {protocol}; expected {HERDR_PROTOCOL}"
            ));
        }
        Ok(snapshot)
    })
    .await
    .map_err(|e| format!("Herdr snapshot task failed: {e}"))?
}

#[tauri::command]
pub async fn herdr_set_theme(app: AppHandle, dark: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || set_herdr_theme(&app, dark))
        .await
        .map_err(|e| format!("Herdr theme task failed: {e}"))?
}

fn valid_herdr_id(value: &str, prefix: char) -> bool {
    let mut parts = value.split(':');
    matches!(parts.next(), Some(workspace) if valid_herdr_id_part(workspace, 'w'))
        && matches!(parts.next(), Some(target) if valid_herdr_id_part(target, prefix))
        && parts.next().is_none()
}

fn valid_herdr_id_part(value: &str, prefix: char) -> bool {
    value.strip_prefix(prefix).is_some_and(|tail| {
        !tail.is_empty()
            && tail.len() <= HERDR_ID_PART_MAX_BYTES
            && tail.chars().all(|c| c.is_ascii_alphanumeric())
    })
}

fn normalized_label(label: Option<String>) -> Result<Option<String>, String> {
    let label = label.filter(|value| !value.trim().is_empty());
    if label
        .as_ref()
        .is_some_and(|value| value.len() > HERDR_LABEL_MAX_BYTES)
    {
        return Err(format!(
            "Herdr workspace label exceeds {HERDR_LABEL_MAX_BYTES} byte limit"
        ));
    }
    Ok(label)
}

#[tauri::command]
pub async fn herdr_focus_workspace(app: AppHandle, workspace_id: String) -> Result<(), String> {
    if !valid_herdr_id_part(&workspace_id, 'w') {
        return Err("Invalid Herdr workspace id".to_string());
    }
    let config_path = write_embedded_herdr_config(&app)?;
    tokio::task::spawn_blocking(move || {
        herdr_api_output(&config_path, &["workspace", "focus", &workspace_id]).map(|_| ())
    })
    .await
    .map_err(|e| format!("Herdr workspace focus task failed: {e}"))?
}

#[tauri::command]
pub async fn herdr_focus_agent(app: AppHandle, pane_id: String) -> Result<(), String> {
    if !valid_herdr_id(&pane_id, 'p') {
        return Err("Invalid Herdr pane id".to_string());
    }
    let config_path = write_embedded_herdr_config(&app)?;
    tokio::task::spawn_blocking(move || {
        herdr_api_output(&config_path, &["agent", "focus", &pane_id]).map(|_| ())
    })
    .await
    .map_err(|e| format!("Herdr agent focus task failed: {e}"))?
}

#[tauri::command]
pub async fn herdr_create_workspace(
    app: AppHandle,
    cwd: String,
    label: Option<String>,
) -> Result<(), String> {
    let cwd =
        dunce::canonicalize(&cwd).map_err(|e| format!("Invalid Herdr workspace directory: {e}"))?;
    if !cwd.is_dir() {
        return Err("Herdr workspace directory is not a directory".to_string());
    }
    let cwd = cwd.to_string_lossy().to_string();
    let label = normalized_label(label)?;
    let config_path = write_embedded_herdr_config(&app)?;
    tokio::task::spawn_blocking(move || {
        validate_herdr()?;
        let mut args = vec!["workspace", "create", "--cwd", cwd.as_str(), "--focus"];
        if let Some(label) = label.as_deref() {
            args.extend(["--label", label]);
        }
        herdr_api_output(&config_path, &args).map(|_| ())
    })
    .await
    .map_err(|e| format!("Herdr workspace create task failed: {e}"))?
}

#[tauri::command]
pub async fn herdr_prompt_agent(
    app: AppHandle,
    pane_id: String,
    text: String,
) -> Result<(), String> {
    if !valid_herdr_id(&pane_id, 'p') {
        return Err("Invalid Herdr pane id".to_string());
    }
    if text.trim().is_empty() {
        return Err("Herdr prompt text is required".to_string());
    }
    if text.len() > HERDR_PROMPT_MAX_BYTES {
        return Err(format!(
            "Herdr prompt exceeds {HERDR_PROMPT_MAX_BYTES} byte limit"
        ));
    }
    let config_path = write_embedded_herdr_config(&app)?;
    tokio::task::spawn_blocking(move || {
        validate_herdr()?;
        herdr_api_output(&config_path, &["agent", "prompt", &pane_id, &text]).map(|_| ())
    })
    .await
    .map_err(|e| format!("Herdr agent prompt task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::{normalized_label, valid_herdr_id};

    #[test]
    fn validates_public_ids() {
        assert!(valid_herdr_id("w9:pB", 'p'));
        assert!(!valid_herdr_id("w:pB", 'p'));
        assert!(!valid_herdr_id("w9:p", 'p'));
        assert!(!valid_herdr_id("w9:pB;rm", 'p'));
        assert!(!valid_herdr_id(&format!("w9:p{}", "a".repeat(65)), 'p'));
    }

    #[test]
    fn normalizes_and_limits_workspace_labels() {
        assert_eq!(normalized_label(None).unwrap(), None);
        assert_eq!(normalized_label(Some("   ".to_string())).unwrap(), None);
        assert_eq!(
            normalized_label(Some("project alpha".to_string())).unwrap(),
            Some("project alpha".to_string())
        );
        assert!(normalized_label(Some("a".repeat(257))).is_err());
    }
}
