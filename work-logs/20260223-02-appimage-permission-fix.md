# AppImage 권한 + EGL 흰 화면 수정

## 날짜
2026-02-23

## 증상
1. **사용자 계정에서 셸 실행 불가**: autostart/수동 실행 모두 즉시 크래시
   ```
   Cannot open /proc/self/exe: Permission denied
   Failed to get fs offset for /proc/self/exe
   ```
2. **권한 수정 후에도 흰 화면**: root 계정과 동일한 흰 화면 (스크린샷으로 확인)

## 환경
- Naia OS (Bazzite 기반), 사용자 계정 luke.yang (uid=1000)
- Intel HD Graphics 610 (Kaby Lake)
- Wayland 세션 (KDE Plasma), XWayland 활성
- AppImage 배포 (`linuxdeploy-plugin-gtk.sh`가 `GDK_BACKEND=x11` 강제)

## 근본 원인 (2개)

### 원인 1: AppImage 파일 권한 711

`install-naia-shell.sh`에서 `chmod +x`만 설정 → BlueBuild 컨테이너의 umask에 의해 `711`(-rwx--x--x).

- AppImage는 `/proc/self/exe`를 통해 자기 자신을 읽어 FUSE 마운트
- `711`: owner(root)만 read 가능, other는 execute만 → 일반 사용자가 읽기 불가
- root 계정에서는 owner라 `rwx` 적용되어 실행 가능했음

### 원인 2: WebKit EGL 초기화 실패

```
Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
```

- AppImage의 GTK 훅(`linuxdeploy-plugin-gtk.sh`)이 `GDK_BACKEND=x11` 강제
- XWayland 환경에서 WebKit의 EGL 초기화가 실패
- WebKitWebProcess는 살아있지만 GPU 렌더링 불가 → 흰 화면
- 환경변수(`WEBKIT_DISABLE_DMABUF_RENDERER`, `LIBGL_ALWAYS_SOFTWARE` 등)로는 해결 불가
  → AppImage의 GTK 훅이 환경을 덮어쓰거나, WebKit 서브프로세스에 전달되지 않음

## 가설 검증

### 검증 1: AppImage 권한 (chmod 755)
1. `sudo cp /usr/bin/naia-shell ~/.local/bin/` (원본은 read 불가라 sudo 필요)
2. `chmod 755` 적용
3. 실행 → **AppImage FUSE 마운트 성공, Tauri 윈도우 생성**
4. 그러나 **흰 화면** (스크린샷으로 확인)

### 검증 2: 환경변수로 EGL 우회
```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
WEBKIT_DISABLE_COMPOSITING_MODE=1 \
LIBGL_ALWAYS_SOFTWARE=1 \
~/.local/bin/naia-shell
```
→ **여전히 흰 화면** (스크린샷으로 확인). 환경변수로는 해결 불가.

### 결론
- 권한 수정: `chmod 755` → AppImage 실행 가능 (검증됨)
- EGL 수정: `HardwareAccelerationPolicy::Never` (Rust 코드 레벨) → 빌드 후 검증 필요
- 두 수정 모두 적용해야 정상 동작

## 수정 내용

### 1. `config/scripts/install-naia-shell.sh` (35행)
```diff
-chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
+chmod 755 "${INSTALL_DIR}/${BINARY_NAME}"
```
명시적 `755`로 group/other에 read 권한 보장.

### 2. `shell/src-tauri/src/main.rs`
```diff
+    #[cfg(target_os = "linux")]
+    {
+        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
+    }
```
Tauri/GTK 초기화 전에 환경변수 설정. AppImage GTK 훅보다 먼저 실행됨.

### 3. `shell/src-tauri/src/lib.rs` (setup 내 with_webview)
```diff
+    if let Some(settings) = webview.inner().settings() {
+        settings.set_hardware_acceleration_policy(
+            webkit2gtk::HardwareAccelerationPolicy::Never,
+        );
+    }
```
WebKit 하드웨어 가속 비활성화. Three.js VRM 아바타는 소프트웨어 렌더링으로 동작.
흰 화면 대비 허용 가능한 트레이드오프.

## 잔여 이슈 (별도 추적)

1. **agent-core 미포함**: AppImage 내부에 `agent/dist/index.js` 없음
   ```
   Error: Cannot find module '/tmp/.mount_naia-sXXXXXX/agent/dist/index.js'
   ```
2. **OpenClaw 미설치**: `setup-openclaw.sh`가 `recipe.yml`에 미포함
3. **EGL 근본 해결**: AppImage 대신 Flatpak으로 배포하면 네이티브 Wayland + GPU 가속 가능
