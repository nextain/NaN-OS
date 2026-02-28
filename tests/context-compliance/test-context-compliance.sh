#!/usr/bin/env bash
# Naia OS — AI Context Compliance Test
# fork한 레포에서 AI 에이전트가 컨텍스트 규칙을 잘 준수하는지 검증
#
# Usage:
#   bash tests/context-compliance/test-context-compliance.sh [provider]
#   provider: claude (default), gemini, codex, opencode, all
#
# Prerequisites (all CLI-based, locally installed):
#   - claude CLI (Claude Code)
#   - gemini CLI (Gemini CLI)
#   - codex CLI (OpenAI Codex CLI)
#   - opencode CLI (OpenCode)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROVIDER="${1:-claude}"

# Load API keys from shell/.env if available (for gemini CLI only)
ENV_FILE="$REPO_ROOT/shell/.env"
if [ -f "$ENV_FILE" ]; then
  export GEMINI_API_KEY="${GEMINI_API_KEY:-$(grep '^GEMINI_API_KEY=' "$ENV_FILE" | cut -d= -f2)}"
fi
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

PASS=0
FAIL=0
TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_test() {
  TOTAL=$((TOTAL + 1))
  echo -e "\n${YELLOW}[TEST $TOTAL] $1${NC}"
}

log_pass() {
  PASS=$((PASS + 1))
  echo -e "${GREEN}  ✓ PASS${NC}: $1"
}

log_fail() {
  FAIL=$((FAIL + 1))
  echo -e "${RED}  ✗ FAIL${NC}: $1"
}

# Send prompt to AI CLI and get response (all headless/non-interactive)
ask_ai() {
  local prompt="$1"
  local output_file="$RESULTS_DIR/response-${TOTAL}-${CURRENT_PROVIDER}.txt"

  echo -e "${CYAN}  → Asking ${CURRENT_PROVIDER}...${NC}"

  case "$CURRENT_PROVIDER" in
    claude)
      # Claude Code: --print = headless, read-only tools only
      echo "$prompt" | claude --print \
        --allowedTools "Read,Glob,Grep" \
        --directory "$REPO_ROOT" \
        2>/dev/null > "$output_file" || true
      ;;
    gemini)
      # Gemini CLI: -p = non-interactive headless mode
      # 임시 HOME으로 OAuth 프롬프트 방지, GEMINI_API_KEY로 인증
      local gemini_tmp="$RESULTS_DIR/.gemini-tmp"
      mkdir -p "$gemini_tmp/.gemini"
      echo '{}' > "$gemini_tmp/.gemini/settings.json"
      (cd "$REPO_ROOT" && HOME="$gemini_tmp" \
        GEMINI_API_KEY="${GEMINI_API_KEY}" \
        gemini -p "$prompt" -o text </dev/null) \
        > "$output_file" 2>/dev/null || true
      ;;
    codex)
      # Codex CLI: exec = non-interactive headless mode
      codex exec "$prompt" \
        --cd "$REPO_ROOT" \
        --full-auto \
        2>/dev/null > "$output_file" || true
      ;;
    opencode)
      # OpenCode CLI: run = non-interactive headless mode
      # Uses whatever model is configured (e.g. GLM-4.7) — no API key override
      # Strip ANSI escape codes from output
      opencode run "$prompt" \
        --dir "$REPO_ROOT" \
        2>&1 | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' > "$output_file" || true
      ;;
  esac

  cat "$output_file"
}

# Check if response contains expected keywords
assert_contains() {
  local response="$1"
  local keyword="$2"
  local description="$3"

  if echo "$response" | grep -qi "$keyword"; then
    log_pass "$description"
  else
    log_fail "$description (expected: '$keyword')"
  fi
}

assert_not_contains() {
  local response="$1"
  local keyword="$2"
  local description="$3"

  if echo "$response" | grep -qi "$keyword"; then
    log_fail "$description (found forbidden: '$keyword')"
  else
    log_pass "$description"
  fi
}

# Run all 10 tests for a single provider
run_tests() {
  CURRENT_PROVIDER="$1"
  PASS=0
  FAIL=0
  TOTAL=0

  echo ""
  echo "============================================"
  echo "Naia OS — AI Context Compliance Test"
  echo "Provider: $CURRENT_PROVIDER"
  echo "Repo: $REPO_ROOT"
  echo "============================================"

  # Verify CLI exists
  if ! command -v "$CURRENT_PROVIDER" &>/dev/null; then
    echo -e "${RED}ERROR: '$CURRENT_PROVIDER' CLI not found. Skipping.${NC}"
    return 1
  fi

  # -------------------------------------------
  # Test 1: 프로젝트 정체성 인식
  # -------------------------------------------
  log_test "프로젝트 정체성 인식"
  RESPONSE=$(ask_ai "이 프로젝트는 무엇인가요? 이름과 성격을 한 문장으로 설명하세요.")
  assert_contains "$RESPONSE" "Naia" "프로젝트 이름 'Naia' 언급"
  assert_contains "$RESPONSE" "OS\|운영체제\|데스크톱\|avatar\|아바타" "OS/아바타 성격 인식"
  assert_not_contains "$RESPONSE" "Caret\|Careti\|caretive" "'Caret' 이름 사용 안 함"

  # -------------------------------------------
  # Test 2: 한국어 응답 규칙
  # -------------------------------------------
  log_test "한국어 응답 규칙"
  RESPONSE=$(ask_ai "이 프로젝트의 응답 언어 규칙은 무엇인가요?")
  assert_contains "$RESPONSE" "한국어\|Korean" "한국어 응답 규칙 인식"

  # -------------------------------------------
  # Test 3: TDD 프로세스 인식
  # -------------------------------------------
  log_test "TDD 프로세스 인식"
  RESPONSE=$(ask_ai "이 프로젝트의 개발 프로세스를 설명하세요. 코드를 작성하기 전에 무엇을 먼저 해야 하나요?")
  assert_contains "$RESPONSE" "TDD\|테스트\|test" "TDD 언급"
  assert_contains "$RESPONSE" "RED\|먼저\|first" "테스트 먼저 작성 인식"

  # -------------------------------------------
  # Test 4: console.log 금지 규칙
  # -------------------------------------------
  log_test "console.log 금지 규칙"
  RESPONSE=$(ask_ai "이 프로젝트에서 console.log를 사용해도 되나요? 대신 무엇을 써야 하나요?")
  assert_contains "$RESPONSE" "Logger\|logger\|구조화" "Logger 사용 규칙 인식"
  assert_contains "$RESPONSE" "금지\|forbidden\|안 됨\|사용하면 안\|No\|not" "console.log 금지 인식"

  # -------------------------------------------
  # Test 5: 아키텍처 레이어 인식
  # -------------------------------------------
  log_test "아키텍처 레이어 인식"
  RESPONSE=$(ask_ai "이 프로젝트의 아키텍처 레이어 4개를 나열하세요.")
  assert_contains "$RESPONSE" "shell" "shell 레이어 인식"
  assert_contains "$RESPONSE" "agent" "agent 레이어 인식"
  assert_contains "$RESPONSE" "gateway" "gateway 레이어 인식"
  assert_contains "$RESPONSE" "os\|OS\|Bazzite" "OS 레이어 인식"

  # -------------------------------------------
  # Test 6: 보안 티어 인식
  # -------------------------------------------
  log_test "보안 티어 인식"
  RESPONSE=$(ask_ai "파일을 삭제하려면 어떤 보안 티어가 필요한가요?")
  assert_contains "$RESPONSE" "tier.2\|Tier 2\|tier_2\|티어 2" "Tier 2 approve 인식"

  # -------------------------------------------
  # Test 7: 커밋 컨벤션
  # -------------------------------------------
  log_test "커밋 컨벤션"
  RESPONSE=$(ask_ai "shell 모듈에 아바타 애니메이션 기능을 추가했습니다. 커밋 메시지를 작성해주세요.")
  assert_contains "$RESPONSE" "feat(shell)" "feat(shell) 형식 사용"

  # -------------------------------------------
  # Test 8: Biome 포맷터 설정
  # -------------------------------------------
  log_test "Biome 포맷터 설정"
  RESPONSE=$(ask_ai "이 프로젝트의 코드 포맷팅 규칙은? indent, quote, semicolons 설정을 알려주세요.")
  assert_contains "$RESPONSE" "tab" "tab indent 인식"
  assert_contains "$RESPONSE" "double" "double quote 인식"

  # -------------------------------------------
  # Test 9: 코드 생성 시 규칙 준수
  # -------------------------------------------
  log_test "코드 생성 시 규칙 준수"
  RESPONSE=$(ask_ai "agent 모듈에서 LLM 응답을 로깅하는 TypeScript 코드를 한 줄 작성하세요.")
  assert_not_contains "$RESPONSE" "console\.log\|console\.warn\|console\.error" "console.log 미사용"
  assert_contains "$RESPONSE" "Logger\|logger\|log" "Logger 사용"

  # -------------------------------------------
  # Test 10: 필수 읽기 파일 인식
  # -------------------------------------------
  log_test "필수 읽기 파일 인식"
  RESPONSE=$(ask_ai "세션 시작 시 반드시 읽어야 하는 파일은 무엇인가요?")
  assert_contains "$RESPONSE" "agents-rules.json" "agents-rules.json 언급"
  assert_contains "$RESPONSE" "project-index" "project-index 언급"

  # ===========================================
  # Fork/Reference Scenario Tests (외부 AI 행동)
  # ===========================================

  # -------------------------------------------
  # Test 11: 포크 시 라이선스 인식
  # -------------------------------------------
  log_test "포크 시 라이선스 인식"
  RESPONSE=$(ask_ai "이 프로젝트를 포크해서 사용하려면 어떤 라이선스 조건을 따라야 하나요?")
  assert_contains "$RESPONSE" "Apache\|apache" "Apache 2.0 소스코드 라이선스 인식"
  assert_contains "$RESPONSE" "CC-BY-SA\|CC BY-SA\|Creative Commons" "CC-BY-SA 4.0 컨텍스트 라이선스 인식"

  # -------------------------------------------
  # Test 12: 포크 시 출처 표시 의무
  # -------------------------------------------
  log_test "포크 시 출처 표시 의무"
  RESPONSE=$(ask_ai "이 프로젝트의 .agents/ 컨텍스트를 참고해서 새 프로젝트를 만들려고 합니다. 어떤 의무가 있나요?")
  assert_contains "$RESPONSE" "Nextain\|nextain\|Naia\|출처\|attribution\|표시" "원저작자 표시 의무 인식"

  # -------------------------------------------
  # Test 13: 도네이션 안내
  # -------------------------------------------
  log_test "도네이션 안내"
  RESPONSE=$(ask_ai "이 프로젝트의 AI 컨텍스트 패턴이 정말 좋아서 우리 프로젝트에도 비슷하게 만들고 싶어요. 어떻게 해야 하나요?")
  assert_contains "$RESPONSE" "donation\|도네이션\|후원\|sponsor\|naia.nextain.io" "도네이션/후원 안내"

  # -------------------------------------------
  # Test 14: 철학 보존 인식
  # -------------------------------------------
  log_test "철학 보존 인식"
  RESPONSE=$(ask_ai "이 프로젝트의 핵심 철학 중 반드시 보존해야 할 원칙은 무엇인가요?")
  assert_contains "$RESPONSE" "AI.*주권\|sovereignty\|vendor.*lock" "AI 주권 원칙 인식"
  assert_contains "$RESPONSE" "프라이버시\|privacy\|로컬\|local" "프라이버시 원칙 인식"
  assert_contains "$RESPONSE" "투명\|transparency\|오픈소스\|open.source" "투명성 원칙 인식"

  # -------------------------------------------
  # Test 15: 컨텍스트 미러링 구조 인식
  # -------------------------------------------
  log_test "컨텍스트 미러링 구조 인식"
  RESPONSE=$(ask_ai "이 프로젝트의 .agents/와 .users/ 디렉토리의 관계를 설명하세요.")
  assert_contains "$RESPONSE" "미러\|mirror\|동기화\|sync" "미러링 구조 인식"
  assert_contains "$RESPONSE" "SoT\|source of truth\|단일.*진실\|agents.*소스" ".agents/ SoT 인식"

  # -------------------------------------------
  # Summary for this provider
  # -------------------------------------------
  echo ""
  echo "--------------------------------------------"
  echo "RESULTS [$CURRENT_PROVIDER]: $PASS passed, $FAIL failed (total: $TOTAL)"
  echo "--------------------------------------------"

  if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}All tests passed! [$CURRENT_PROVIDER]${NC}"
  else
    echo -e "${RED}$FAIL test(s) failed. [$CURRENT_PROVIDER]${NC}"
    echo "See detailed responses in: $RESULTS_DIR/"
  fi

  return "$FAIL"
}

# -------------------------------------------
# Main: run for selected provider(s)
# -------------------------------------------
OVERALL_FAIL=0

if [ "$PROVIDER" = "all" ]; then
  for p in claude gemini codex opencode; do
    run_tests "$p" || OVERALL_FAIL=$((OVERALL_FAIL + 1))
  done
  echo ""
  echo "============================================"
  echo "OVERALL: $OVERALL_FAIL provider(s) had failures"
  echo "============================================"
  exit "$OVERALL_FAIL"
else
  run_tests "$PROVIDER"
  exit $?
fi
