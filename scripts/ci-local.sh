#!/bin/bash
#
# 🔄 LOCAL CI SIMULATION SCRIPT
#
# Simulates the CI pipeline locally to catch issues before pushing.
# Run this before creating a PR to verify CI will pass.
#
# Usage:
#   ./scripts/ci-local.sh           # Run all checks
#   ./scripts/ci-local.sh --quick   # Run quick checks only
#   ./scripts/ci-local.sh --fix     # Auto-fix lint/format issues
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
echo "  🔄 LOCAL CI SIMULATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

FAILED=0
PASSED=0

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
    local line_count=$(wc -l < /tmp/ci-local-output.txt)
    if [ "$line_count" -gt 50 ]; then
      echo "    ... (truncated, see /tmp/ci-local-output.txt for full output)"
    fi
    echo ""
  fi
}

echo -e "${BLUE}📋 STEP 1: LINT & FORMAT${NC}"
echo ""

FRONTEND_DIR="$PWD/frontend"

if [ "$FIX_MODE" = true ]; then
  echo "  🔧 Auto-fix mode enabled"
  echo ""
  run_step "Backend ESLint (fix)" "npx eslint 'src/**/*.ts' 'tests/**/*.ts' --fix --quiet"
  run_step "Backend Prettier (fix)" "npx prettier --write 'src/**/*.ts'"
  run_step "Frontend ESLint (fix)" "npx eslint $FRONTEND_DIR/src --ext ts,tsx --fix --quiet"
  run_step "Frontend Prettier (fix)" "npx prettier --write '$FRONTEND_DIR/src/**/*.{ts,tsx}'"
else
  run_step "Backend ESLint" "npx eslint 'src/**/*.ts' 'tests/**/*.ts' --quiet"
  run_step "Frontend ESLint" "npx eslint $FRONTEND_DIR/src --ext ts,tsx --max-warnings 0 --quiet"
  run_step "Backend Prettier" "npx prettier --check 'src/**/*.ts'"
  run_step "Frontend Prettier" "npx prettier --check '$FRONTEND_DIR/src/**/*.{ts,tsx}'"
fi

echo ""
echo -e "${BLUE}📋 STEP 2: TYPE CHECK${NC}"
echo ""

run_step "Backend TypeScript" "npx tsc --noEmit"
run_step "Frontend TypeScript" "npx tsc --noEmit -p $FRONTEND_DIR/tsconfig.json"

echo ""
echo -e "${BLUE}📋 STEP 3: UNIT TESTS${NC}"
echo ""

if [ "$QUICK_MODE" = true ]; then
  run_step "Backend Unit Tests (quick)" "npx vitest run tests/unit --bail 1"
  run_step "Frontend Unit Tests (quick)" "(cd $FRONTEND_DIR && npm run test:run -- --bail 1)"
else
  run_step "Backend Unit Tests" "npx vitest run tests/unit"
  run_step "Frontend Unit Tests" "(cd $FRONTEND_DIR && npm run test:run)"
fi

if [ "$QUICK_MODE" = false ]; then
  echo ""
  echo -e "${BLUE}📋 STEP 4: MONSTER ARMY (Quick Check)${NC}"
  echo ""
  
  run_step "Monster Quick Check" "npm run monsters:quick 2>&1 | tail -20"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL CHECKS PASSED ($PASSED/$((PASSED+FAILED)))${NC}"
  echo ""
  echo "   Your code is ready for PR! 🎉"
  echo ""
else
  echo -e "${RED}❌ SOME CHECKS FAILED ($FAILED failed, $PASSED passed)${NC}"
  echo ""
  echo "   Fix the issues above before pushing."
  echo "   Run with --fix to auto-fix lint/format issues:"
  echo ""
  echo "     ./scripts/ci-local.sh --fix"
  echo ""
  exit 1
fi
