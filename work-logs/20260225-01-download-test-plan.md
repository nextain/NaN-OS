# 다운로드 패키지 종합 테스트 계획

**날짜**: 2026-02-25
**목적**: Naia OS ISO, Flatpak, AppImage, DEB/RPM 패키지 및 Gateway 설치 스크립트의 전체 검증
**작성자**: AI (Claude)

---

## A. ISO 테스트 (빌드 성공 시)

### A-1. 다운로드 및 USB 준비
- [ ] GitHub Actions artifact에서 ISO 파일 다운로드
- [ ] ISO 파일 용량 및 체크섬 확인 (손상 없는지)
- [ ] balenaEtcher로 USB 드라이브에 이미지 굽기
- [ ] USB 굽기 완료 후 에러 없이 성공 메시지 확인

### A-2. USB 부팅 → 라이브 데스크톱
- [ ] USB 부팅 성공 (UEFI 모드)
- [ ] Naia 배경화면 정상 표시
- [ ] 작업표시줄(taskbar)에 Naia 앱 아이콘 표시
- [ ] 한글 입력 동작 확인 (fcitx5-hangul)
  - [ ] 한/영 전환 키 동작
  - [ ] 텍스트 에디터 등에서 한글 타이핑 가능
- [ ] Naia Shell 앱 실행 확인
  - [ ] Shell UI 정상 렌더링
  - [ ] AI 채팅 기능 동작 (메시지 전송 → 응답 수신)
- [ ] Chrome 브라우저 실행 및 웹페이지 로딩 확인
- [ ] Discord 앱 실행 확인
- [ ] 라이브 세션 경고 다이얼로그 표시 확인 (데이터 비저장 경고)

### A-3. 디스크 설치
- [ ] "Install to Hard Drive" 버튼/아이콘 동작
- [ ] 설치 화면에 Naia 브랜딩 표시 (아이콘, 이름 등)
- [ ] 설치 과정 완료 (에러 없이)
- [ ] 재부팅 후 USB 없이 정상 부팅
- [ ] 설치된 시스템에서 위 A-2 항목 재확인

---

## B. Flatpak 테스트 (stock Bazzite 환경)

### B-1. 다운로드 및 설치
- [ ] GitHub Release에서 `Naia-Shell-x86_64.flatpak` 다운로드
- [ ] GNOME Platform runtime 설치:
  ```bash
  flatpak install -y flathub org.gnome.Platform//47
  ```
- [ ] Flatpak 설치:
  ```bash
  flatpak install --user ./Naia-Shell-x86_64.flatpak
  ```
- [ ] 설치 중 에러 메시지 없음

### B-2. 실행 확인
- [ ] Flatpak 실행:
  ```bash
  flatpak run io.nextain.naia.shell  # 또는 해당 app-id
  ```
- [ ] Shell UI 정상 표시 (창 뜨는지)
- [ ] Gateway 미연결 상태에서 적절한 경고/안내 메시지 표시
- [ ] UI 요소 렌더링 깨짐 없음 (폰트, 아이콘, 레이아웃)

---

## C. AppImage 테스트

### C-1. 다운로드 및 실행
- [ ] GitHub Release에서 `Naia.Shell_0.1.0_amd64.AppImage` 다운로드
- [ ] 실행 권한 부여:
  ```bash
  chmod +x Naia.Shell_0.1.0_amd64.AppImage
  ```
- [ ] 실행:
  ```bash
  ./Naia.Shell_0.1.0_amd64.AppImage
  ```
- [ ] UI 정상 표시 확인
- [ ] 창 크기 조절 정상
- [ ] 기본 UI 인터랙션 동작 (탭 전환, 버튼 클릭 등)

---

## D. DEB/RPM 테스트 (해당 환경이 있는 경우)

### D-1. DEB 패키지 (Debian/Ubuntu)
- [ ] 다운로드: `Naia.Shell_*.deb`
- [ ] 설치:
  ```bash
  sudo dpkg -i Naia.Shell_*.deb
  ```
- [ ] 의존성 문제 시:
  ```bash
  sudo apt-get install -f
  ```
- [ ] 앱 실행 확인
- [ ] 앱 메뉴에서 Naia Shell 검색 가능

### D-2. RPM 패키지 (Fedora/RHEL)
- [ ] 다운로드: `Naia.Shell-*.rpm`
- [ ] 설치:
  ```bash
  sudo rpm -i Naia.Shell-*.rpm
  ```
- [ ] 앱 실행 확인
- [ ] 앱 메뉴에서 Naia Shell 검색 가능

---

## E. Gateway 설치 스크립트 테스트

### E-1. 정상 설치 (Node.js 22+ 있는 환경)
- [ ] 스크립트 실행:
  ```bash
  bash scripts/install-gateway.sh
  ```
- [ ] 각 단계별 컬러 출력 확인 (Step 1~5)
- [ ] 설치 성공 메시지 출력
- [ ] `~/.naia/openclaw/node_modules/.bin/openclaw` 바이너리 존재
- [ ] `~/.openclaw/openclaw.json` 설정 파일 생성됨

### E-2. Gateway 시작 및 검증
- [ ] Gateway 시작:
  ```bash
  node ~/.naia/openclaw/node_modules/.bin/openclaw gateway run --bind loopback --port 18789
  ```
- [ ] Health check 성공:
  ```bash
  curl -s http://127.0.0.1:18789/__openclaw__/canvas/
  ```
- [ ] 응답이 정상적으로 오는지 확인 (HTML 또는 JSON)

### E-3. Naia Shell 연결 확인
- [ ] Gateway 실행 중인 상태에서 Naia Shell 실행 (또는 재실행)
- [ ] Shell이 Gateway에 자동 연결
- [ ] AI 채팅 기능 동작 확인

### E-4. 에러 케이스
- [ ] Node.js 미설치 환경에서 실행 시 명확한 에러 메시지 출력
- [ ] 설치 방법 안내 텍스트 표시 (nvm, NodeSource 등)
- [ ] Node.js 18 등 버전이 낮은 환경에서도 명확한 에러 메시지

### E-5. 멱등성 (Idempotent)
- [ ] 스크립트를 2회 연속 실행해도 에러 없이 완료
- [ ] 기존 `openclaw.json`이 있으면 덮어쓰지 않음 (WARN 메시지 출력)
- [ ] package.json은 최신 버전으로 갱신됨

---

## F. 다운로드 페이지 테스트 (naia.nextain.io)

### F-1. 페이지 접근
- [ ] `/ko/download` 페이지 정상 로딩
- [ ] `/en/download` 페이지 정상 로딩
- [ ] 한국어/영어 전환 시 콘텐츠 올바르게 변경

### F-2. 버튼 및 링크 상태
- [ ] 모든 다운로드 버튼이 "Coming Soon" disabled 상태
- [ ] disabled 버튼 클릭 시 아무 동작 없음 (에러 없음)
- [ ] 향후 활성화될 버튼의 디자인/레이아웃 확인

### F-3. 복사 버튼
- [ ] Gateway 설치 명령어 복사 버튼 동작
- [ ] 클립보드에 올바른 명령어 복사됨
- [ ] 복사 성공 피드백 (아이콘 변경 또는 토스트 등)

### F-4. OpenClaw 안내 섹션
- [ ] OpenClaw 설명 섹션 정상 표시
- [ ] 관련 링크 동작 확인

### F-5. 반응형 및 테마
- [ ] 모바일 뷰포트에서 레이아웃 정상 (320px, 375px, 768px)
- [ ] 다크 모드 정상 표시 (배경, 텍스트, 버튼 색상)
- [ ] 라이트 모드 정상 표시
- [ ] 다크/라이트 전환 시 깨짐 없음

---

## G. 검증 완료 후 할 일

### G-1. 다운로드 버튼 활성화
- [ ] 검증 통과한 패키지의 다운로드 버튼 활성화 코드 변경
- [ ] 활성화된 버튼이 올바른 URL로 연결되는지 확인
- [ ] 활성화 후 페이지 재배포 (`vercel --prod`)

### G-2. Release 생성
- [ ] ISO 검증 통과 시 GitHub Release 생성
- [ ] Release에 모든 패키지 첨부 (Flatpak, AppImage, DEB, RPM)
- [ ] Release 노트 작성 (변경사항, 설치 방법)

### G-3. 최종 확인
- [ ] GitHub Release 페이지에서 각 파일 다운로드 링크 동작 확인
- [ ] 파일명이 규칙에 맞는지 확인 (버전, 아키텍처 등)
- [ ] Release가 "Latest"로 표시되는지 확인
- [ ] 다운로드 페이지에서 Release 링크가 올바른지 최종 검증

---

## 테스트 우선순위

| 우선순위 | 항목 | 이유 |
|---------|------|------|
| 1 | E. Gateway 스크립트 | 빠르게 검증 가능, 블로커 |
| 2 | C. AppImage | 의존성 없이 바로 테스트 가능 |
| 3 | B. Flatpak | Bazzite 기본 환경에서 테스트 |
| 4 | F. 다운로드 페이지 | 브라우저만 있으면 가능 |
| 5 | A. ISO | 가장 시간이 오래 걸림, USB 필요 |
| 6 | D. DEB/RPM | 해당 환경이 있는 경우에만 |

---

## 비고

- Gateway 스크립트는 Naia Shell이 단독 패키지(Flatpak/AppImage/DEB/RPM)로 설치된 환경에서 필요
- ISO에는 Gateway가 이미 포함되어 있으므로 별도 설치 불필요
- 테스트 실패 항목은 체크 대신 ~~취소선~~으로 표시하고 실패 사유 기록
