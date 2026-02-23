# Naia OS 전체 이슈 목록 (사용자 계정 설치 검증)

## 날짜
2026-02-23

## 검증 환경
- Naia OS v43.20260217 (Bazzite 기반, `ghcr.io/nextain/naia-os:latest`)
- 사용자 계정 luke.yang (uid=1000, wheel 그룹)
- Intel HD Graphics 610 (Kaby Lake), Wayland (KDE Plasma)

---

## 이슈 1: AppImage 파일 권한 711 (사용자 실행 불가)

**심각도**: Critical — 셸이 아예 안 뜸
**상태**: 소스 수정 완료 (커밋 `cd2aff2`), CI 빌드 후 검증 필요

**증상**:
```
Cannot open /proc/self/exe: Permission denied
Failed to get fs offset for /proc/self/exe
```

**원인**: `install-naia-shell.sh`에서 `chmod +x` → BlueBuild 컨테이너 umask로 `711`.
AppImage는 자기 자신을 read해야 FUSE 마운트 가능, 일반 사용자는 read 권한 없음.

**수정**: `chmod +x` → `chmod 755`

**검증**: sudo로 복사 후 chmod 755 적용 → AppImage 실행 성공

---

## 이슈 2: WebKit EGL 흰 화면

**심각도**: Critical — 셸 실행되지만 UI 렌더링 안 됨
**상태**: 소스 수정 완료 (커밋 `cd2aff2`), CI 빌드 후 검증 필요

**증상**: Tauri 윈도우는 열리지만 완전히 하얀 화면. 스크린샷으로 확인.
```
Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
```

**원인**: AppImage의 `linuxdeploy-plugin-gtk.sh`가 `GDK_BACKEND=x11` 강제.
XWayland 환경에서 WebKit의 EGL 초기화 실패. 환경변수로 우회 불가 (검증됨).

**수정**:
- `main.rs`: `WEBKIT_DISABLE_DMABUF_RENDERER=1` 환경변수
- `lib.rs`: `HardwareAccelerationPolicy::Never`

**미검증**: 빌드 도구 없어 새 바이너리 생성 불가. CI 빌드 후 검증 필요.

---

## 이슈 3: Agent 번들링 누락 (AppImage/DEB/RPM)

**심각도**: Critical — 채팅 기능 동작 불가
**상태**: 소스 수정 부분 완료 (커밋 `ea72dbd`), release-app.yml은 미푸시

**증상**:
```
Error: Cannot find module '/tmp/.mount_naia-sXXXXXX/agent/dist/index.js'
```

**원인**: 3계층 문제
1. CI(`release-app.yml`)에서 agent 빌드 단계 누락
2. `tauri.conf.json`에 `bundle.resources` 설정 없음
3. `lib.rs`에서 상대경로 하드코딩 (`../agent/dist/index.js`)

**적용된 수정**:
- `tauri.conf.json`: `bundle.resources`에 agent/dist, package.json, node_modules 추가
- `lib.rs`: Tauri Resource API (`app_handle.path().resource_dir()`)로 경로 해석

**미적용 (개발 PC에서 푸시 필요)**:
```yaml
# .github/workflows/release-app.yml
# "Install frontend dependencies" 와 "Build Tauri app" 사이에:
- name: Build agent
  working-directory: agent
  run: pnpm install --frozen-lockfile && pnpm run build
```
이 머신의 PAT에 `workflow` scope가 없어 push 불가.

---

## 이슈 4: Gateway systemd 서비스 NAMESPACE 에러

**심각도**: High — Gateway 자동 시작 불가
**상태**: 소스 수정 완료 (커밋 `ea72dbd`)

**증상**:
```
naia-gateway.service: Failed to set up mount namespacing:
  /./var/home/luke.yang/.openclaw: No such file or directory
```

**원인**: `naia-gateway.service`의 `ReadWritePaths=%h/.naia %h/.openclaw`에서
`%h/.openclaw` 디렉토리가 존재하지 않음. OpenClaw은 `%h/.naia/openclaw/`에 설치됨.

**수정**: `ReadWritePaths=%h/.naia %h/.openclaw` → `ReadWritePaths=%h/.naia`

---

## 이슈 5: OpenClaw 미설치 (OS 이미지에 미포함)

**심각도**: Medium — Gateway 기능 없이도 기본 채팅은 가능
**상태**: 미수정

**증상**:
```
[Naia] Gateway not available: OpenClaw not installed at ~/.naia/openclaw/...
```

**원인**: `recipe.yml`에 `setup-openclaw.sh` 미포함.
BlueBuild 빌드 시 HOME이 다르므로 `~/.naia/openclaw/`에 설치 불가.

**현재 상태**: 사용자가 수동으로 `setup-openclaw.sh` 실행 필요.
수동 실행 시 정상 설치 확인 (OpenClaw 2026.2.15).

**해결 방향**: 첫 로그인 시 자동 설치 (systemd user service 또는 온보딩 마법사)

---

## 이슈 6: rpm-ostree GPG 키 경로 오류

**심각도**: High — 사용자가 추가 패키지 설치 불가
**상태**: 미수정

**증상**:
```
error: Updating rpm-md repo 'updates': Failed to download gpg key for repo 'updates':
  Couldn't open file /etc/pki/rpm-gpg/RPM-GPG-KEY-fedora-0.1.0-x86_64
```

**원인**: `branding.sh`에서 `VERSION_ID="0.1.0"`으로 설정.
Fedora의 repo 설정이 `$releasever`를 사용하는데, VERSION_ID가 "0.1.0"이라
GPG 키 파일 경로가 `RPM-GPG-KEY-fedora-0.1.0-x86_64`가 됨 (존재하지 않음).

**수정 방향**: `branding.sh`에서 `VERSION_ID`를 Fedora 원본 값(예: 43)으로 유지하거나,
별도의 `NAIA_VERSION` 변수 사용. `os-release`의 `VERSION_ID`는 base OS 버전을 유지해야 함.

---

## 이슈 7: 빌드 환경 부재 (이 머신에서 검증 불가)

**심각도**: Info
**상태**: 이슈 6으로 인해 해결 불가

- Rust: 설치 완료 (rustc 1.93.1)
- pnpm: npm install -g 권한 없음
- -devel 패키지: rpm-ostree가 이슈 6으로 인해 동작 불가
- distrobox: 사용자 설정 에러로 생성 실패

→ 이 머신에서 Tauri 앱 빌드 불가. 개발 PC에서 빌드/검증 필요.

---

## 우선순위 요약

| # | 이슈 | 심각도 | 상태 |
|---|------|--------|------|
| 1 | AppImage 권한 711 | Critical | 소스 수정 완료 |
| 2 | EGL 흰 화면 | Critical | 소스 수정 완료, 미검증 |
| 3 | Agent 번들링 누락 | Critical | 부분 수정, workflow 미푸시 |
| 4 | Gateway NAMESPACE 에러 | High | 소스 수정 완료 |
| 5 | OpenClaw 미설치 | Medium | 미수정 |
| 6 | rpm-ostree GPG 키 | High | 미수정 |
| 7 | 빌드 환경 부재 | Info | 이슈 6 의존 |
