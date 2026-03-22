# Monster Army - Self-Improving QA System

A comprehensive, self-improving QA system designed for **zero-bug poker development**.

## 📚 Documentation

- **[📋 MONSTERS.md](./MONSTERS.md)** - Complete guide to all 23 monsters
- **[📋 REPORT.md](./REPORT.md)** - Findings, bugs, and metrics
- **[🗂️ ISSUES-REPORT.md](./shared/ISSUES-REPORT.md)** - Current open issues

## ⚡ Quick Start

```bash
# Run this before every commit (< 1 second!)
npm run monsters:quick-check

# See all open issues
npm run monsters:issues
```

## Philosophy

For a poker platform handling real money:
- **Bugs aren't inconvenient - they're catastrophic**
- Every card, chip, and action must be 100% correct
- **Bugs hide in the seams** between systems, not just in isolated components
- The system must continuously learn and improve

## The Integration Pyramid

Monsters are organized in **layers of integration** to catch bugs at every level:

```
                              ▲
                             /│\
                            / │ \
     Layer 4:              /  │  \         E2E MONSTER
     Full System          /   │   \        Complete user journeys
     (weekly)            /────┼────\       
                        /     │     \
     Layer 3:          /      │      \     FLOW MONSTERS
     Multi-System     /       │       \    Game, Tournament flows
     (nightly)       /────────┼────────\   API→DB→WS→UI
                    /         │         \
     Layer 2:      /          │          \ CONNECTOR MONSTERS
     Two Systems  /           │           \API↔DB, API↔WS, WS↔UI
     (every PR)  /─────────────┼───────────\
                /              │            \
     Layer 1:  /               │             \ UNIT MONSTERS
     Single   /                │              \API, Visual, Invariant
     (every commit)            │               \
              ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
```

## Why Layers Matter

**Unit tests alone miss "seam bugs":**

```
Each component works perfectly alone:
✅ API calculates pot split correctly
✅ Database stores chip values correctly  
✅ WebSocket sends events correctly
✅ UI displays chips correctly

But together, a race condition causes:
❌ UI receives stale state, shows wrong chips
❌ User sees 1000 chips when they actually have 1500
```

**Connector and Flow monsters catch these integration bugs.**

## Layer 1: Unit Monsters (Single System)

| Monster | System | What it tests |
|---------|--------|---------------|
| **API Monster** 🔌 | Backend API | Endpoints, contracts, auth, rate limiting |
| **Contract Monster** | FE + API | Static scan: `frontend/src/api/*.ts` `.map()` on paginated calls vs controller patterns |

**API Monster base URL:** Paths in `api-monster/api-monster.config.ts` already include `/api/v1/...`. `API_BASE_URL` / `API_URL` may be set to the full API root (e.g. `http://localhost:3000/api/v1`, same style as `getEnv().apiBaseUrl`). The shared helper `getOriginForApiV1Paths()` strips a trailing `/api/v1` so URLs are not doubled (which would otherwise yield 404s while `/health` still passes). Connection failures are surfaced as HTTP status `0` and are skipped in the monster; `429` on `POST /auth/register` is skipped when rate limits fire in CI.
| **Visual Monster** 👁️ | Frontend UI | Viewports, overflow, console errors |
| **Invariant Monster** 🔒 | Game Logic | Money, cards, actions, tournaments |
| **Guardian Monster** 🛡️ | Security | XSS, injection, accessibility (planned) |
| **Regression Monster** 🔁 | Bug history | Reads `tests/qa/monsters/data/bug-retrospectives.json`, verifies fixes not reverted |
| **Explorer Monster** 🦸 | Frontend UI | Autonomous crawl (medium preset); default cap 90s, override `EXPLORER_MAX_RUNTIME` |

## Layer 2: Connector Monsters (Two Systems)

| Monster | Systems | What it tests |
|---------|---------|---------------|
| **API-DB Connector** | API ↔ Database | Persistence, consistency, transactions |
| **API-WS Connector** | API ↔ WebSocket | Event propagation, timing, room isolation |
| **WS-UI Connector** | WebSocket ↔ UI | Client updates, state sync (planned) |
| **Auth-Flow Connector** | Auth ↔ All | JWT flows, session handling (planned) |

## Layer 3: Flow Monsters (Multi-System)

| Monster | Flow | Systems |
|---------|------|---------|
| **Game Flow** | Complete hand | API → DB → WS → UI → Bot |
| **Tournament Flow** | Tournament lifecycle | API → DB → WS → Scheduler |
| **Simulation Monster** 🎰 | Live game validation | Real games → Invariants → Reports |
| **Betting Flow** | Bet → Pot → Payout | API → Invariants → WS (planned) |
| **Player Flow** | Join → Play → Leave | Auth → API → DB → WS (planned) |

## Layer 4: E2E Monster (Full System)

Tests complete user journeys across ALL systems (planned).

## Quick Start

```bash
# Layer 1: Unit tests (fast, run on every commit)
npm run monsters:unit

# Layer 2: Connector tests (run on PRs)
npm run monsters:connectors

# Layer 3: Flow tests (run nightly)
npm run monsters:flows

# Combined presets (all auto-start BE/FE if not running)
npm run monsters:quick      # API + Invariant only
npm run monsters:pr         # Layers 1+2 (for PR validation)
npm run monsters:nightly    # Layers 1+2+3 (full coverage)

# Run specific monsters
npm run monsters:api
npm run monsters:api-db
npm run monsters:game-flow

# 🦸 EXPLORER MONSTER - Autonomous UI Crawler
npm run monsters:explorer   # Medium army preset; ~90s default cap (see EXPLORER_MAX_RUNTIME)

# 🔁 REGRESSION MONSTER - Historical fix checks
npm run monsters:regression-check   # bug-retrospectives.json vs codebase

# 🗄️ DATA INTEGRITY MONSTER - Data layer validation
npm run monsters:data-integrity     # FKs, cascades, enums, chips, transactions, DTOs

# 📈 DATA ANALYTICS MONSTER - Analytics pipeline per DATA.md
npm run monsters:data-analytics     # chip movements, bot stats, hand history, replay data

# 📋 LOG ANALYZER MONSTER - Backend/frontend log health
npm run monsters:log-analyzer       # sensitive data in logs, silent catches, live response analysis

# 🎰 SIMULATION MONSTER - Professional QA Testing
npm run monsters:simulation           # Standard mode (~90s, 4 scenarios)
npm run monsters:simulation:quick     # Quick mode (~30s, CI-friendly)
npm run monsters:simulation:thorough  # Thorough mode (~5-10min, 7 scenarios)

# Parallel execution
npm run monsters:nightly --parallel

# CI mode (JSON output, static analysis only, no server needed)
npm run monsters:ci

# Disable auto-start of BE/FE (fail if servers aren't running)
npm run monsters:all -- --no-auto-start

# Static analysis only (no BE/FE required)
npm run monsters:all -- --static
```

## Server Management

`run-all.ts` automatically manages BE and FE servers:

- **Checks** if BE (port 3000) and FE (port 3001) are already running
- **Starts** them if not (BE via `node dist/src/main.js`, FE via `npx vite`)
- **Tears down** only the servers it started (leaves your manually-started servers alone)
- **Handles SIGINT/SIGTERM** for clean cleanup on Ctrl+C

Flags:
- `--no-auto-start` — skip auto-start, monsters that need servers will be skipped if servers are down
- `--static` — only run static-analysis monsters (no BE/FE needed at all)

## Unified storage

- **Source of truth:** `shared/issue-tracker.ts` persists to `shared/issues.json` only.
- **Deprecated:** `memory/memory-store.ts` — do not use for new code; triage, code-fixer, auto-improve, and iteration-runner all read/write via the issue tracker.

## Checks performed

`BaseMonster` exposes `checksPerformed` and `recordCheck()`. When a run finds zero issues, summaries still show work done, e.g. `Checks: 42. Findings: 0C 0H 0M 0L`.

## Dead-weight analysis

`run-all.ts` (e.g. `npm run monsters:all`) flags monsters with **5+ runs and 0 issues**: **BROKEN** (failures exceed successes), **INEFFECTIVE** (10+ runs, still zero findings), or **WATCH** (needs tuning). The same dead-weight block is written to `docs/MONSTER_EVOLUTION.md` under **Dead-Weight Analysis**.

## Self-Improvement Features

### Auto-Improve Mode 🤖

Auto-improve (`evolution/auto-improve.ts`) edits config arrays in place (finds the array terminator `];` and inserts entries). CLI: `--dry-run` (default), `--apply`, or `--commit`.

```bash
# Preview what would change (safe, no writes)
npm run monsters:evolve

# Actually apply changes to files
npm run monsters:evolve:apply

# Apply changes AND commit to new branch
npm run monsters:evolve:commit
```

**What it can automatically do:**
- Add new endpoints to API Monster config
- Add new pages/viewports to Visual Monster config
- Create regression test files for found bugs
- Add new invariant rules based on violations

**Safety mechanisms:**
1. **Dry run by default** — preview before `--apply` / `--commit`
2. **New branch** — commits go to `monster-improve-*` branches
3. **No auto-merge** — requires human approval via PR
4. **Max changes per run** — limited to 10 changes

### Lifecycle fix stage

`lifecycle-runner.ts` applies **CodeFixer** (`evolution/code-fixer.ts`) for CSS-class issues: overflow, hover, focus, z-index, contrast (replaces prior stub fixers).

### Regression Detection
When a previously-fixed bug reappears, it's automatically flagged as critical.

### Trend Analysis
- Tracks bug hotspots (areas with recurring issues)
- Calculates regression rate
- Measures mean time to resolution

### Coverage Gap Detection
Identifies endpoints/pages/components without test coverage.

### Evolution Reports
After each run, the Evolution Agent:
1. Analyzes findings for patterns
2. Suggests new test cases (or creates them with `--auto-improve`)
3. Recommends config changes (or applies them with `--auto-improve`)
4. Flags items needing human review

## Key Files

```
tests/qa/monsters/
├── shared/
│   ├── types.ts           # Core types (Finding, Run, etc.)
│   ├── base-monster.ts    # Base class (checksPerformed, recordCheck)
│   ├── issue-tracker.ts   # Single persistence API → issues.json
│   ├── issues.json        # Issue database (only store)
│   └── reporter.ts        # Report generation
├── memory/
│   └── memory-store.ts    # Deprecated — use issue-tracker
├── api-monster/
│   ├── api-monster.ts
│   └── api-monster.config.ts
├── visual-monster/
│   ├── visual-monster.ts
│   └── visual-monster.config.ts
├── invariant-monster/
│   ├── invariant-monster.ts
│   └── poker-invariants.ts   # Critical poker rules
├── evolution/
│   ├── auto-improve.ts       # Safe config edits (--dry-run | --apply | --commit)
│   ├── code-fixer.ts         # CSS fixes (lifecycle + npm run monsters:fix)
│   └── evolution-agent.ts    # Self-improvement brain
├── regression-monster/
│   └── regression-monster.ts # bug-retrospectives.json guard
├── data-integrity-monster/
│   └── data-integrity-monster.ts # Entity/migration/DTO/chip integrity
├── data-analytics-monster/
│   └── data-analytics-monster.ts # Analytics pipeline per DATA.md
├── log-analyzer-monster/
│   └── log-analyzer-monster.ts # Backend/frontend log health analysis
└── orchestrator.ts          # Main entry point
```

## Poker Invariants

These rules must **NEVER** be violated:

### Money
- `chip_conservation`: Total chips = constant
- `no_negative_stacks`: All chips >= 0
- `no_negative_pot`: Pot >= 0
- `bet_within_stack`: Bets <= player's chips

### Cards
- `unique_cards_in_play`: No duplicates
- `valid_card_format`: Cards like "Ah", "Kd"
- `community_cards_count`: 0, 3, 4, or 5 cards
- `hole_cards_count`: Exactly 2 per player

### Actions
- `correct_turn`: Only active player acts
- `folded_player_cannot_act`: Folded = out
- `valid_action_type`: fold/check/call/bet/raise/all-in

## CI Integration

The orchestrator returns exit codes:
- `0`: All passed, no critical/high issues
- `1`: Failed, critical or high issues found
- `2`: Error, monster crashed

### GitHub Actions

Monster Army is integrated into the CI pipeline (`.github/workflows/ci.yml`):

```yaml
- name: Run Monster Army (PR validation)
  run: npm run monsters:pr -- --ci
```

**Key features:**
- Runs on every PR (after lint & typecheck)
- Uses `--pr` preset (Layers 1+2)
- Uploads reports as artifacts
- Comments findings on PRs
- Blocks merge on critical issues

### Local vs CI

| Mode | Command | What Runs |
|------|---------|-----------|
| Quick | `npm run monsters:quick` | API + Invariant only |
| PR | `npm run monsters:pr` | Layers 1+2 (fast) |
| Nightly | `npm run monsters:nightly` | Layers 1+2+3 (comprehensive) |
| CI | `npm run monsters:ci` | All + JSON output |

## Reports

Each run generates:
- `report.json`: Machine-readable results
- `report.md`: Human-readable markdown
- Console output with colors and summaries

Reports are saved to `tests/qa/monsters/reports/<run-id>/`

## Memory & Learning

The **issue tracker** (`issues.json`) holds findings with fingerprints, status, severity, and source monster. Run history for dead-weight analysis lives in monster stats (see `run-all.ts` / `docs/MONSTER_EVOLUTION.md`).

## Data Cleanup

Monster Army generates data over time. The system has automatic and manual cleanup:

### Automatic Cleanup

`cleanup.ts` removes stale iteration/triage reports, legacy `tests/qa/monsters/data/memory.json` runs (if present), and old `auto-generated/` files (`--keep-days`, `--keep-runs`). Clear `issues.json` via `npm run monsters:issues:clear`.

### Manual Cleanup

```bash
# Preview what would be deleted
npm run monsters:cleanup:preview

# Clean old data (keep last 7 days)
npm run monsters:cleanup

# Complete reset (delete everything)
npm run monsters:cleanup:all

# Custom retention
npx ts-node tests/qa/monsters/cleanup.ts --keep-days 3 --keep-runs 10
```

### What Gets Cleaned

| Data | Location | Default Retention |
|------|----------|-------------------|
| Iteration reports | `reports/iterations/*.json` | 7 days |
| Triage reports | `reports/triage-*.json` | 7 days |
| Primary issues DB | `shared/issues.json` | Per cleanup / tracker rules |
| Legacy memory (if present) | `data/memory.json` | Deprecated |
| Auto-generated tests | `auto-generated/` | 7 days |

---

*Zero bugs. Always improving.*
