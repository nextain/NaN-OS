# Cafelua OS USB 부팅 매뉴얼

**날짜**: 2026-02-15

GitHub push부터 USB 부팅까지의 전체 과정.

---

## 1. 사전 준비

### GitHub 리포지토리 설정

```bash
# 리포지토리: luke-n-alpha/cafelua-os
# 이미 설정됨
git remote -v
# origin  git@github.com:luke-n-alpha/cafelua-os.git
```

### Cosign 서명 키 생성 (최초 1회)

```bash
# cosign 설치 (로컬)
# Fedora: sudo dnf install cosign
# macOS: brew install cosign

# 키 쌍 생성
cosign generate-key-pair

# 결과:
# - cosign.key (비밀키 → GitHub Secret에 저장)
# - cosign.pub (공개키 → 리포지토리에 커밋)
```

### GitHub Secrets 설정

1. GitHub → `luke-n-alpha/cafelua-os` → Settings → Secrets and variables → Actions
2. **New repository secret** 클릭
3. Name: `SIGNING_SECRET`
4. Value: `cosign.key` 파일의 전체 내용 붙여넣기
5. Save

### GitHub Packages 권한 확인

1. Settings → Actions → General → Workflow permissions
2. **Read and write permissions** 선택
3. Save

---

## 2. 이미지 빌드 (자동)

### Push하면 자동 빌드됨

```bash
git push origin main
```

빌드 트리거 조건:
- `os/**` 파일 변경 + main 브랜치 push
- 또는 Actions 탭에서 수동 실행 (workflow_dispatch)

### 빌드 확인

1. GitHub → Actions 탭 → "Build Cafelua OS" 워크플로우
2. 초록색 체크 = 성공 (약 15-30분 소요)
3. 성공 시 이미지 위치: `ghcr.io/luke-n-alpha/cafelua-os:latest`

### 이미지 확인 (로컬)

```bash
# 이미지가 ghcr.io에 올라갔는지 확인
podman pull ghcr.io/luke-n-alpha/cafelua-os:latest
podman inspect ghcr.io/luke-n-alpha/cafelua-os:latest | grep -i cafelua
```

---

## 3. ISO 생성 (수동)

### GitHub Actions에서 수동 트리거

1. GitHub → Actions 탭 → **"Generate ISO"** 워크플로우
2. **Run workflow** 클릭
3. image_tag: `latest` (기본값)
4. **Run workflow** 클릭
5. 완료까지 약 20-40분 소요

### ISO 다운로드

**방법 A: Artifacts에서 다운로드**
1. 완료된 워크플로우 실행 클릭
2. 하단 Artifacts 섹션에서 `cafelua-os-latest` 다운로드

**방법 B: Releases에서 다운로드**
1. GitHub → Releases 탭
2. Draft release에서 ISO 다운로드

**방법 C: gh CLI로 다운로드**
```bash
# 최신 워크플로우 실행의 artifact 다운로드
gh run download --repo luke-n-alpha/cafelua-os --name cafelua-os-latest --dir ~/Downloads/
```

---

## 4. USB 플래싱

### 준비물

- USB 메모리 (최소 8GB, 권장 16GB+)
- 다운로드한 ISO 파일

### 방법 A: dd (Linux/macOS)

```bash
# USB 디바이스 확인
lsblk
# 예: /dev/sdb (USB), /dev/nvme0n1 (내장 디스크 - 절대 쓰지 말것!)

# ⚠️ 반드시 올바른 디바이스인지 확인!
# 잘못된 디바이스에 쓰면 데이터가 모두 삭제됨

sudo dd if=~/Downloads/cafelua-os-latest.iso of=/dev/sdX bs=4M status=progress oflag=sync
# sdX를 실제 USB 디바이스로 변경
```

### 방법 B: Fedora Media Writer (추천, GUI)

```bash
# Fedora:
sudo dnf install mediawriter

# Flatpak:
flatpak install flathub org.fedoraproject.MediaWriter
```

1. Fedora Media Writer 실행
2. "Custom image" 선택
3. 다운로드한 ISO 선택
4. USB 선택 → Write

### 방법 C: Ventoy (멀티 부팅)

```bash
# Ventoy가 이미 설치된 USB라면 ISO를 그냥 복사
cp ~/Downloads/cafelua-os-latest.iso /run/media/$USER/Ventoy/
```

---

## 5. USB 부팅

### BIOS 진입

| 제조사 | 부팅 메뉴 키 | BIOS 설정 키 |
|--------|-------------|-------------|
| 레노버 | F12 | F2 |
| 삼성 | F2 | F2 |
| ASUS | F8 / ESC | F2 / DEL |
| HP | F9 | F10 |
| Dell | F12 | F2 |

1. 노트북 전원 켜면서 부팅 메뉴 키 연타
2. USB 선택
3. Cafelua OS 설치 화면 진입

### Secure Boot

Bazzite 기반이므로 Secure Boot는 보통 지원됨.
문제가 생기면 BIOS에서 Secure Boot를 끄고 다시 시도.

---

## 6. 설치 후 확인

```bash
# OS 이름 확인
cat /etc/os-release
# NAME="Cafelua OS"
# PRETTY_NAME="Cafelua OS (Bazzite)"

# 스모크 테스트 (리포를 클론해서 실행)
git clone https://github.com/luke-n-alpha/cafelua-os.git
bash cafelua-os/os/tests/smoke.sh

# 또는 개별 확인
node --version      # v22+
pnpm --version      # 설치됨
podman --version    # 설치됨
which gcc           # /usr/bin/gcc
```

---

## 트러블슈팅

### 빌드 실패: "SIGNING_SECRET not found"

→ GitHub Secrets에 `SIGNING_SECRET` 추가 (위 1번 참조)

### 빌드 실패: 패키지를 찾을 수 없음

→ Fedora 버전에 따라 패키지명이 다를 수 있음. `recipe.yml` 확인

### ISO 생성 실패: 이미지를 pull할 수 없음

→ ghcr.io 이미지가 public인지 확인:
  GitHub → Packages → cafelua-os → Package settings → Visibility: Public

### USB 부팅 안 됨

→ Secure Boot 끄기, USB 포맷 다시 하기, 다른 USB 포트 시도

### Node.js 버전이 22 미만

→ Fedora 기본 nodejs 패키지 버전 확인. 필요시 NodeSource repo 추가
