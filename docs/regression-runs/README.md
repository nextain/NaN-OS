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

### 돌리기 전에 알아야 할 것

전용 wdio 설정 열한 개는 **짝 naia-agent 체크아웃**을 요구한다. 그것이 없으면
설정 파일을 읽는 단계에서 죽는데, 그것은 회귀가 깨진 것이 아니라 환경이 없는
것이다. 러너는 이 경우를 `prerequisites-missing` 으로 따로 적는다.

설정이 기본으로 보는 자리(`<저장소 옆>/naia-agent-worktrees`)는 이 배치와
한 단계 어긋나 있다. 실제 워크트리는 `projects/naia-agent-worktrees` 아래에
있으므로, 자리를 알려 주고 돌린다.

```
NAIA_AGENT_WORKTREES_DIR=<alpha-adk>/projects/naia-agent-worktrees \
NAIA_E2E_ARTIFACTS_DIR=<쓰기 가능한 디렉터리> \
  node scripts/run-regression.mjs --machine=<이름> --tier=deterministic_ci
```

배포 전에는 이 기록을 모아 본다.

```
node scripts/check-regression-complete.mjs --max-age-hours=24
```

아무도 맡지 않은 스펙이 있거나, 환경이 없어 건너뛴 것이 있거나, 실패한
기계가 있으면 통과하지 않는다. **건너뛴 것은 통과가 아니다** — 그것이
리눅스 음성 결함이 넉 달 산 이유였다.

기록은 커밋한다. 커밋하지 않으면 다른 기계가 그것을 볼 수 없고, 전체가
덮였는지 판단할 수 없다.
