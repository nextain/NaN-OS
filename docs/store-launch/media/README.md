# 미디어 리소스

## 제출 가능 상태

- `source/`: 저장소의 공식 로고·캐릭터·실제 화면 원본 복사본
- `steam/`: Steam 캡슐·라이브러리 규격 자산과 실제 화면 3장
- `microsoft-store/`: 1:1 box art, 2:3 poster, 300×300 app tile, 16:9 super hero, 실제 화면 3장

현재 실제 화면은 3장이다. Steam 최소 5장을 채우기 위해 `screenshot-shot-list.md`의 두 장을 출시 빌드에서 추가 촬영해야 한다. 콘셉트 아트를 스크린샷 슬롯에 넣지 않는다.

## 디자인 원칙

- 프로젝트에 포함된 공식 Naia 자산만 사용
- 캡슐에는 제품명 외 마케팅 문구를 넣지 않음
- Steam Library Hero와 Microsoft Super hero에는 텍스트를 넣지 않음
- 실제 화면에는 로고·슬로건 같은 마케팅 오버레이를 추가하지 않음
- 모든 이미지가 all-ages 메타데이터 요구에 맞도록 폭력·선정적 요소를 배제

## 생성 명령

```powershell
powershell -ExecutionPolicy Bypass -File docs/store-launch/media/build-assets.ps1
```

필수 도구: `ffmpeg`, `ffprobe`.

