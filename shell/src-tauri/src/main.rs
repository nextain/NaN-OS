#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Work around WebKit EGL initialization failure on some GPU/driver combos
    // (e.g. Intel Kaby Lake + XWayland via AppImage GTK hook).
    // This must be set before any GTK/WebKit code runs.
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    naia_shell_lib::run()
}
