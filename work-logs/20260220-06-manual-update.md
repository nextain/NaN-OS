# 20260220-06-manual-update.md

## 개요
- **주제**: `lab.cafelua.com` 사용자 매뉴얼 최신화 및 스크린샷 갱신
- **상태**: Done
- **날짜**: 2026-02-20
- **목표**: 
  1. OpenClaw 통합으로 인해 추가된 신규 탭(채널, 에이전트, 진단)과 설정(채널, 디바이스 등)을 매뉴얼 스크린샷 스크립트(`99-screenshots.spec.ts`)에 추가.
  2. 스크립트를 실행하여 최신 UI가 반영된 스크린샷 생성.
  3. `project-lab.cafelua.com/src/content/manual/`의 한국어 및 영어 마크다운 파일에 신규 기능 설명을 추가.
  4. 커밋 및 푸시.

## 진행 계획 및 결과

### Step 1: 스크린샷 자동화 스크립트 업데이트 [완료]
- `cafelua-os/shell/e2e-tauri/specs/99-screenshots.spec.ts` 수정
- 추가할 화면: Channels 탭, Agents 탭, Diagnostics 탭, 설정의 Channels/Device 섹션.

### Step 2: 스크린샷 생성 [완료]
- `pnpm exec wdio run e2e-tauri/wdio.conf.ts --spec e2e-tauri/specs/99-screenshots.spec.ts` 실행하여 이미지 추출.
- 새로 캡처된 5개의 이미지(`.png`)를 `ko` 폴더에서 `en` 폴더로 복사 완료.

### Step 3: 매뉴얼 내용 업데이트 [완료]
- `project-lab.cafelua.com/src/lib/manual-docs.ts` 및 `types.ts` 업데이트 (라우팅 및 다국어 키 추가).
- `project-lab.cafelua.com/src/content/manual/ko` 및 `en` 폴더에 `channels.md`, `agents.md`, `diagnostics.md` 파일 추가 완료.
- `main-screen.md`의 탭 개수(5개 → 8개) 수정 및 `settings.md`에 Device/Channels 섹션 추가 완료.
