#!/bin/bash
#
# LOCAL CI SIMULATION SCRIPT
#
# Mirrors the GitHub Actions pipeline (ci.yml + security.yml + quality.yml).
# If this passes, CI will pass (modulo CodeQL, Gitleaks, and Lighthouse which
# require GitHub infrastructure and cannot be run locally).
#
# Usage:
#   ./scripts/ci-local.sh           # Run all checks
#   ./scripts/ci-local.sh --quick   # Lint + types + unit tests only (fast)
#   ./scripts/ci-local.sh --fix     # Auto-fix lint issues
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
QUICK_MODE=false
FIX_MODE=false
for arg in "$@"; do
  case $arg in
    --quick)
      QUICK_MODE=true
      ;;
    --fix)
      FIX_MODE=true
      ;;
  esac
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  LOCAL CI SIMULATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

FAILED=0
PASSED=0
FRONTEND_DIR="$PWD/frontend"

run_step() {
  local name=$1
  local command=$2

  echo -n "  ▶ $name... "

  if eval "$command" > /tmp/ci-local-output.txt 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ FAIL${NC}"
    FAILED=$((FAILED + 1))
    echo ""
    echo -e "${YELLOW}    Output:${NC}"
    head -50 /tmp/ci-local-output.txt | sed 's/^/    /'
    local line_count
    line_count=$(wc -l < /tmp/ci-local-output.txt)
    if [ "$line_count" -gt 50 ]; then
      echo "    ... (truncated, see /tmp/ci-local-output.txt for full output)"
    fi
    echo ""
  fi
}

# ─── STEP 0: Dependency check ───────────────────────────────────────────────

echo -e "${BLUE}STEP 0: DEPENDENCY CHECK${NC}"
echo ""

run_step "Backend dependencies installed" "npm ls --depth=0 > /dev/null 2>&1"
run_step "Frontend dependencies installed" "test -d $FRONTEND_DIR/node_modules"

# ─── STEP 1: Lint (mirrors ci.yml lint job) ─────────────────────────────────

echo ""
echo -e "${BLUE}STEP 1: LINT${NC}"
echo "  (mirrors: ci.yml → lint job)"
echo ""

if [ "$FIX_MODE" = true ]; then
  echo "  Auto-fix mode enabled"
  echo ""
  run_step "Backend ESLint (fix)"  "npx eslint 'src/**/*.ts' 'tests/**/*.ts' --fix"
  run_step "Frontend ESLint (fix)" "npx eslint $FRONTEND_DIR/src --fix"
else
  # CI runs: npm run lint (backend) and npx eslint src (frontend) — no --quiet flag
  run_step "Backend ESLint"  "npx eslint 'src/**/*.ts' 'tests/**/*.ts'"
  run_step "Frontend ESLint" "npx eslint $FRONTEND_DIR/src"
fi

# ─── STEP 2: Type check (mirrors ci.yml typecheck job) ──────────────────────

echo ""
echo -e "${BLUE}STEP 2: TYPE CHECK${NC}"
echo "  (mirrors: ci.yml → typecheck job)"
echo ""

run_step "Backend TypeScript"  "npx tsc --noEmit --incremental false"
run_step "Frontend TypeScript" "(cd $FRONTEND_DIR && npx tsc --noEmit)"

# ─── STEP 3: Security audit (mirrors security.yml dependency-audit job) ──────

echo ""
echo -e "${BLUE}STEP 3: SECURITY AUDIT${NC}"
echo "  (mirrors: security.yml → dependency-audit job)"
echo ""

run_step "Backend npm audit (critical)"  "npm audit --audit-level=critical"
run_step "Frontend npm audit (critical)" "(cd $FRONTEND_DIR && npm audit --audit-level=critical)"

if [ "$QUICK_MODE" = true ]; then
  # ─── Quick: unit tests only ─────────────────────────────────────────────────

  echo ""
  echo -e "${BLUE}STEP 4: UNIT TESTS (quick mode)${NC}"
  echo ""

  run_step "Backend unit tests"  "npx vitest run tests/unit --bail 1"
  run_step "Frontend unit tests" "(cd $FRONTEND_DIR && npm run test:run -- --bail 1)"

else
  # ─── Full: build + all tests + license (mirrors full CI) ─────────────────────

  echo ""
  echo -e "${BLUE}STEP 4: BUILD${NC}"
  echo "  (mirrors: ci.yml → test-all job (backend build) + build job)"
  echo ""

  run_step "Backend build"  "npm run build"
  run_step "Frontend build" "(cd $FRONTEND_DIR && npm run build)"

  echo ""
  echo -e "${BLUE}STEP 5: ALL TESTS${NC}"
  echo "  (mirrors: ci.yml → test-all job)"
  echo "  Note: integration tests require local Postgres + Redis (TEST_DB_* env vars)"
  echo ""

  run_step "Backend all tests"  "npx vitest run"
  run_step "Frontend unit tests" "(cd $FRONTEND_DIR && npm run test:run)"

  echo ""
  echo -e "${BLUE}STEP 6: LICENSE CHECK${NC}"
  echo "  (mirrors: quality.yml → license-check job)"
  echo ""

  run_step "Backend license check"  "npm run license:check"
  run_step "Frontend license check" "(cd $FRONTEND_DIR && npx license-checker --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;CC0-1.0;CC-BY-4.0;CC-BY-3.0;Unlicense;Python-2.0;BlueOak-1.0.0;MPL-2.0' --excludePrivatePackages)"

fi

# ─── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}ALL CHECKS PASSED ($PASSED/$((PASSED+FAILED)))${NC}"
  echo ""
  if [ "$QUICK_MODE" = true ]; then
    echo "  Quick mode passed. Run without --quick for full CI simulation."
  else
    echo "  Your code is ready for PR!"
    echo "  Note: CodeQL, Gitleaks, and Lighthouse run only on GitHub."
  fi
  echo ""
else
  echo -e "${RED}SOME CHECKS FAILED ($FAILED failed, $PASSED passed)${NC}"
  echo ""
  echo "  Fix the issues above before pushing."
  if [ "$FIX_MODE" = false ]; then
    echo "  Run with --fix to auto-fix lint issues:"
    echo ""
    echo "    ./scripts/ci-local.sh --fix"
  fi
  echo ""
  exit 1
fi
