# Naia 스토어 런칭 패키지

기준일: 2026-08-05  
대상 제품: **Naia 0.1.6** (`com.naia.shell`)  
퍼블리셔: **Nextain Inc.**

이 폴더는 Steam과 Microsoft Store 제출에 필요한 문안, 심사 메모, 체크리스트, 그래픽 자산 생성 도구를 한곳에 모은다.

## 먼저 읽을 결론

- **Microsoft Store**: 일반 Win32 앱 배포 경로가 명확하다. 현재 NSIS/MSI 빌드가 있으나 제출 전 코드 서명, 고정 다운로드 URL 또는 MSIX 패키징, 개인정보처리방침 URL 확인이 필요하다.
- **Steam**: Valve는 비게임 소프트웨어를 제한된 범주에서 주로 받는다. Naia의 현재 일반 AI 동반자 포지션은 명시된 범주와 정확히 일치하지 않으므로 Steam Direct 비용을 지불하기 전에 Valve에 적합성을 확인한다.
- **생성형 AI**: Naia는 실행 중 모델이 응답을 생성한다. Steam Content Survey의 Live-Generated 항목과 Microsoft Partner Center의 live generative AI 사용 항목에 반드시 신고한다.
- **정직한 출시 문구**: README에서 제품 검증이 부분적이라고 밝힌 음성·아바타 기능은 확정 기능처럼 과장하지 않았다.

## 폴더 구성

- `research-sources.md`: 최신 공식 규격과 링크
- `launch-readiness.md`: 출시 차단 항목과 권장 순서
- `steam/`: Steamworks 입력 문안·설문 초안·SteamPipe 템플릿
- `microsoft-store/`: Partner Center 입력 문안·심사 메모
- `media/`: 제출 이미지, 실제 화면 캡처, 트레일러 콘티

## 미디어 생성

PowerShell에서 다음을 실행한다.

```powershell
powershell -ExecutionPolicy Bypass -File docs/store-launch/media/build-assets.ps1
```

스크립트는 프로젝트에 포함된 Naia 공식 로고·캐릭터 이미지와 실제 앱 캡처만 사용한다. 생성형 이미지 도구가 Windows 샌드박스에서 로컬 참조 파일을 읽지 못했기 때문에, 브랜드가 다른 캐릭터를 새로 생성해 제출하는 위험을 피했다.

## 사람이 확정해야 하는 값

- 가격과 무료/유료 정책
- 고객지원 이메일과 지원 URL
- 개인정보처리방침 URL
- Steam 분류 적합성에 대한 Valve 답변
- Microsoft Store 배포 방식(MSIX 권장 또는 서명된 오프라인 MSI/EXE)
- 대상 국가, 출시일, 연령등급 설문 답변
- 외부 모델 요금 또는 Naia 크레딧 정책의 최종 표시 문구

