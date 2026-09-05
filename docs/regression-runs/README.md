# 회귀 실행 기록

기계마다 자기 몫의 실기 회귀를 돌리고 결과를 이 디렉터리에 남긴다.

```
node scripts/run-regression.mjs --machine=<이름> --tier=deterministic_ci[,credentialed_live,native_local]
```

남는 파일 하나가 그 기계의 한 번 실행이다. 담기는 것은 다음과 같다.

| 필드 | 뜻 |
|---|---|
| `planned` | 이 기계가 맡기로 한 스펙. **관측이 아니라 계획이다** |
| `executed` | 실제로 끝까지 돈 스펙. 완결성 판정은 이것만 센다 |
| `groups` | wdio 설정별 결과. 한 설정이 실패해도 다른 설정의 결과는 남는다 |
| `envMissingBeforeRun` | 실행 전에 환경이 없어 건너뛸 것으로 예측한 스펙 |
| `status` | `passed` / `failed` / `prerequisites-missing` |

`planned` 와 `executed` 를 나눈 이유가 있다. 예전에는 계획을 그대로 배정으로
적었고 완결성 게이트가 그것을 덮인 것으로 셌다. 그러면 wdio 가 시작하자마자
죽어도 기록에는 전부 덮였다고 남는다. **손으로 기록을 만들 때 `executed` 를
빠뜨리면 그 기계의 몫은 전부 미실행으로 집계된다.**

배포 전에는 이 기록을 모아 본다.

```
node scripts/check-regression-complete.mjs --max-age-hours=24
```

아무도 맡지 않은 스펙이 있거나, 환경이 없어 건너뛴 것이 있거나, 실패한
기계가 있으면 통과하지 않는다. **건너뛴 것은 통과가 아니다** — 그것이
리눅스 음성 결함이 넉 달 산 이유였다.

기록은 커밋한다. 커밋하지 않으면 다른 기계가 그것을 볼 수 없고, 전체가
덮였는지 판단할 수 없다.
