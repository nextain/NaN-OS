# Naia OS 리브랜딩 및 컨셉 변경 로그

- **날짜**: 2026-02-21
- **목표**: Cafelua OS를 Naia OS로, Cafelua Lab을 Nextain Lab / Naia OS Lab으로 전면 리브랜딩

## 주요 변경 사항

### 1. 브랜드 및 캐릭터 변경
- **제품명**: `Cafelua OS` → `Naia OS`
- **조직/브랜드명**: `Cafelua` → `Nextain`
- **캐릭터명**: `Alpha (알파)` → `Naia (낸)`
- **도메인**: `lab.cafelua.com` → `naia.nextain.io` (Vercel 배포 시 반영 예정)
- **Deep Link URL 스킴**: `cafelua://` → `nanos://`

### 2. 디자인 및 테마 변경 (`nextain-desing-concept.md` 반영)
- `Naia OS` 테마(Tailwind CSS 및 `theme.json`) 컬러 그라데이션 및 코어 컬러 변경:
  - `Nextain Blue` (`#2563EB`)
  - `Flow Cyan` (`#06B6D4`)
  - `Evolution Green` (`#10B981`)
  - `Terminal Black` (`#171717`)
  - `Cloud White` (`#F8FAFC`)
  - `Deep Node` (`#0F172A`)
- 브랜드 로고 교체:
  - `nanos-logo.png` 를 OS 및 주요 서비스 로고로 적용
  - `nextain-logo.png` 추가

### 3. 코드베이스 및 컨텍스트 일괄 업데이트
- 프로젝트 내부 설정, 번역 파일(`ko.ts`, `en.ts`), 마크다운 매뉴얼, 테스트 코드, 시스템 프롬프트 등에서 브랜드 관련 문자열 일괄 치환 완료.
- `.agents/context/` 및 관련 문서 내 계획과 컨텍스트 일관성 확보.

## 다음 계획
- Vercel에 커스텀 도메인(`naia.nextain.io`) 등록 및 인증서 발급 확인
- 데스크톱 클라이언트(`Naia OS`)와의 Deep Link(`nanos://auth`) 통합 테스트 진행
- 리브랜딩된 UI/UX QA 및 E2E 테스트 통과 확인
