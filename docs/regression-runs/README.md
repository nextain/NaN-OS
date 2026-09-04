# 회귀 실행 기록

기계마다 자기 몫의 실기 회귀를 돌리고 결과를 이 디렉터리에 남긴다.

```
node scripts/run-regression.mjs --machine=<이름> --tier=deterministic_ci[,credentialed_live,native_local]
```

남는 파일 하나가 그 기계의 한 번 실행이다. 무엇을 맡았는지(`assigned`),
환경이 없어 건너뛴 것이 무엇인지(`skippedForMissingEnv`), 통과했는지를 담는다.

배포 전에는 이 기록을 모아 본다.

```
node scripts/check-regression-complete.mjs --max-age-hours=24
```

아무도 맡지 않은 스펙이 있거나, 환경이 없어 건너뛴 것이 있거나, 실패한
기계가 있으면 통과하지 않는다. **건너뛴 것은 통과가 아니다** — 그것이
리눅스 음성 결함이 넉 달 산 이유였다.

기록은 커밋한다. 커밋하지 않으면 다른 기계가 그것을 볼 수 없고, 전체가
덮였는지 판단할 수 없다.
