# Simulation Test Framework

## Overview

This framework provides tiered integration tests that run real games through the actual backend services to validate end-to-end functionality and catch regressions.

Unlike unit tests, these simulations:
- Use real PostgreSQL database
- Start real HTTP bot servers
- Exercise the full NestJS stack
- Validate state consistency across services

## 🎯 Simulation Monster v2 - The Professional QA Tester

**The most important testing tool in this project.** The Simulation Monster acts like a **senior QA engineer + product manager** who:

1. Runs REAL poker games (not mocks) with various scenarios
2. Validates poker invariants in real-time during gameplay
3. Measures and critiques game timing, UX, and flow
4. Tests edge cases that humans would find annoying
5. Compares against industry best practices
6. Generates actionable, prioritized findings

### Quick Start

```bash
# Standard mode - runs 4 scenarios (~90 seconds)
npm run monsters:simulation

# Quick mode - just heads-up + all-in (~30 seconds, good for CI)
npm run monsters:simulation:quick

# Thorough mode - all 7 scenarios (~5-10 minutes)
npm run monsters:simulation:thorough
```

### Simulation Scenarios

| Scenario | Players | Description | Duration |
|----------|---------|-------------|----------|
| **Heads-Up** | 2 | Basic cash game validation | ~10s |
| **Single-Table** | 6 | Core tournament mechanics | ~30s |
| **Multi-Table** | 18 | Table balancing, breaks | ~60s |
| **Chaos** | 4 | Inject failures, disconnects, timeouts | ~30s |
| **Edge-Cases** | 3 | Specific poker edge cases | ~15s |
| **All-In Showdown** | 2 | Force all-in, test showdown logic | ~10s |
| **Split-Pot** | 4 | Multiple all-ins, side pot logic | ~20s |

### Mode Configurations

| Mode | Scenarios | Duration | Use Case |
|------|-----------|----------|----------|
| **quick** | heads-up, all-in-showdown | ~30s | CI, quick validation |
| **standard** | + single-table, edge-cases | ~90s | Daily, PR validation |
| **thorough** | all 7 scenarios | ~5-10min | Release, nightly |

### Bot Personalities

The monster uses various bot personalities to stress-test the game engine:

| Personality | Behavior |
|-------------|----------|
| `tight-passive` | Check/fold, rarely bets |
| `tight-aggressive` | Plays few hands but bets hard |
| `loose-passive` | Calls almost everything |
| `loose-aggressive` | Raises constantly |
| `all-in-maniac` | Goes all-in frequently |
| `timeout-bot` | Slow responses (tests timeouts) |
| `disconnect-bot` | Disconnects mid-hand (chaos) |

### What Gets Validated

**Invariant Checks** (from `poker-invariants.ts`):
- Chip conservation (no chips created/destroyed)
- Card uniqueness (no duplicates)
- Valid stage transitions (preflop → flop → turn → river)
- No negative chips/pot values
- Correct betting rules

**UX/Timing Checks**:
- Hand completion speed vs industry standards
- Short stack warnings
- Player count validations

**Competitive Analysis**:
- Compares timing to PokerStars/GGPoker standards
- Flags performance deviations

### Example Output

```
═══════════════════════════════════════════════════════════════════════
                    PROFESSIONAL QA SIMULATION REPORT
═══════════════════════════════════════════════════════════════════════

📋 EXECUTIVE SUMMARY
────────────────────────────────────────
Mode: STANDARD
Total Runtime: 87.3s
Scenarios Run: 4
Total Hands Played: 95
Total States Validated: 1247
Invariants Checked: 18705
Invariant Violations: 0

📊 SCENARIO RESULTS
────────────────────────────────────────
✅ Heads-Up Cash Game: 20 hands, 0 violations (12.1s)
✅ Single Table Tournament: 45 hands, 0 violations (42.3s)
✅ Edge Case Testing: 15 hands, 0 violations (15.8s)
✅ All-In Showdown: 10 hands, 0 violations (8.1s)

⏱️  PERFORMANCE METRICS
────────────────────────────────────────
Avg Hand Duration: 892ms
Max Hand Duration: 2341ms

📈 COMPETITIVE ANALYSIS (vs Industry Standards)
────────────────────────────────────────
Turn Timeout: 15000ms recommended
Max Players/Table: 10 (industry standard)
Error Rate Target: < 0.1%

═══════════════════════════════════════════════════════════════════════
All findings have been persisted to docs/MONSTERS_ISSUES.md
═══════════════════════════════════════════════════════════════════════
```

### CI Integration

The Simulation Monster runs as part of the Monster Army CI job:

```yaml
# In .github/workflows/ci.yml
- name: Run Simulation Monster
  run: npm run monsters:simulation:quick
```

### Findings Persistence

All findings are automatically persisted to:
- `tests/qa/monsters/shared/issues.json` (machine-readable)
- `docs/MONSTERS_ISSUES.md` (human-readable)

The unified issue tracker deduplicates by fingerprint.

---

## Legacy Simulations

The original simulation framework is still available for specific scenarios:

### Test Tiers

| Tier | Players | Duration | Run When | Purpose |
|------|---------|----------|----------|---------|
| **Basic** | 2 | ~30s | Every commit | Catch fundamental breaks |
| **Single-Table** | 9 | ~2-5min | Daily/PR | Validate core tournament mechanics |
| **Multi-Table** | 30 | ~10-15min | Weekly/Release | Complete tournament lifecycle |

### Running Legacy Simulations

```bash
# Run basic simulation (fastest, for quick checks)
npm run sim:basic

# Run single-table tournament
npm run sim:single

# Run multi-table tournament (most comprehensive)
npm run sim:multi

# Run all simulations
npm run sim:all

# CI mode (basic only, fail fast)
npm run sim:ci

# With verbose logging
npm run sim:basic -- --verbose

# Smaller multi-table (18 players instead of 30)
npm run sim:multi -- --small
```

### What Each Simulation Tests

#### Basic Simulation
- 2-player heads-up game starts and completes
- Chip conservation across 10+ hands
- Bot registration and validation
- Game state consistency
- No crashes or critical errors

#### Single-Table Simulation
- 9-player tournament lifecycle
- Player elimination flow
- Blind level advancement
- Tournament completion with winner
- Prize distribution
- Database state consistency

#### Multi-Table Simulation
- 30+ player multi-table tournament
- Table consolidation (breaking tables)
- Player redistribution
- Final table formation
- Late registration
- Error recovery
- Full tournament completion
- Comprehensive database validation

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_DB_HOST` | localhost | PostgreSQL host |
| `TEST_DB_PORT` | 5432 | PostgreSQL port |
| `TEST_DB_USERNAME` | postgres | Database user |
| `TEST_DB_PASSWORD` | postgres | Database password |
| `TEST_DB_NAME` | poker_test | Test database name |

## Troubleshooting

### Simulation hangs
- Check if PostgreSQL is running
- Check bot server ports aren't in use (7000-9000 range)
- Try with `--verbose` to see where it stuck

### Database connection errors
- Ensure `poker_test` database exists
- Check PostgreSQL is accepting connections
- Verify credentials in environment variables

### "Table in error state"
- This usually indicates a bug in the game engine
- Check backend logs for stack traces
- The simulation will record this as an error

## Best Practices

1. **Use the Simulation Monster for all testing**: It's the most comprehensive
2. **Run `monsters:simulation:quick` before pushing**: Fast and catches most issues
3. **Run `monsters:simulation` before PRs**: Validates all core scenarios
4. **Run `monsters:simulation:thorough` weekly**: Comprehensive but time-consuming
5. **Check the issue tracker**: `docs/MONSTERS_ISSUES.md` for persistent findings
6. **Don't ignore warnings**: They often predict future failures
