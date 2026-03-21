# Simulation Test Framework

## Overview

This framework provides tiered integration tests that run real games through the actual backend services to validate end-to-end functionality and catch regressions.

Unlike unit tests, these simulations:
- Use real PostgreSQL database
- Start real HTTP bot servers
- Exercise the full NestJS stack
- Validate state consistency across services

## Test Tiers

| Tier | Players | Duration | Run When | Purpose |
|------|---------|----------|----------|---------|
| **Basic** | 2 | ~30s | Every commit | Catch fundamental breaks |
| **Single-Table** | 9 | ~2-5min | Daily/PR | Validate core tournament mechanics |
| **Multi-Table** | 30 | ~10-15min | Weekly/Release | Complete tournament lifecycle |

## Running Simulations

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
npm run sim:multi -- --verbose

# Smaller multi-table (18 players instead of 30)
npm run sim:multi -- --small
```

## What Each Simulation Tests

### Basic Simulation
- 2-player heads-up game starts and completes
- Chip conservation across 10+ hands
- Bot registration and validation
- Game state consistency
- No crashes or critical errors

### Single-Table Simulation
- 9-player tournament lifecycle
- Player elimination flow
- Blind level advancement
- Tournament completion with winner
- Prize distribution
- Database state consistency

### Multi-Table Simulation
- 30+ player multi-table tournament
- Table consolidation (breaking tables)
- Player redistribution
- Final table formation
- Late registration
- Error recovery
- Full tournament completion
- Comprehensive database validation

## Assertions Checked

Every simulation validates:

1. **Chip Conservation**: Total chips remain constant throughout
2. **State Consistency**: Database matches in-memory state
3. **Event Propagation**: Tournament knows about eliminations
4. **Error Handling**: Graceful recovery from failures
5. **Completion**: Game/Tournament reaches proper end state

## Output Format

```
======================================================================
   POKER SIMULATION TEST SUITE
======================================================================

Mode: Interactive
Verbose: false

Simulations to run:
  Basic (2-player):        ✓
  Single-Table (9-player): ✓
  Multi-Table (30-player): skip

──────────────────────────────────────────────────────────────────────
▶ Starting: Basic (2-Player Heads-Up)
──────────────────────────────────────────────────────────────────────

[123ms] [Basic-2Player-HeadsUp] Starting simulation...
[456ms] [Basic-2Player-HeadsUp] Game started
[2000ms] [Basic-2Player-HeadsUp] Hand 10 - Status: running
...

✓ Basic (2-Player Heads-Up): PASSED
  Duration: 5234ms
  Hands: 15

======================================================================
   SIMULATION RESULTS
======================================================================

Total Time: 5s

Results:
  ✓ Passed: 1
  ✗ Failed: 0
  Total:    1
```

## CI Integration

Add to your GitHub Actions workflow:

```yaml
jobs:
  simulation-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: poker_test
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - run: npm ci
      
      # Basic simulation on every commit
      - name: Run Basic Simulation
        run: npm run sim:ci
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PASSWORD: postgres

      # Full simulation on PR to main
      - name: Run Full Simulation Suite
        if: github.event_name == 'pull_request'
        run: npm run sim:all
```

## Adding New Simulations

1. Create a new file in `tests/simulations/`:

```typescript
import { SimulationRunner, SimulationConfig } from "./simulation-runner";

const MY_CONFIG: SimulationConfig = {
  name: "MyCustomSimulation",
  playerCount: 6,
  startingChips: 1000,
  // ...
};

export class MySimulation extends SimulationRunner {
  constructor(config: Partial<SimulationConfig> = {}) {
    super({ ...MY_CONFIG, ...config });
  }

  protected async setupDatabase(): Promise<void> {
    // Setup test database
  }

  protected async setupTestData(): Promise<void> {
    // Create users, bots, tournaments
  }

  protected async executeSimulation(): Promise<void> {
    // Run the simulation logic
  }

  protected async runCustomAssertions(): Promise<void> {
    // Add custom assertions
    this.assert("my_check", condition, "description", expected, actual);
  }
}
```

2. Add to `run-all.ts` if it should be part of the suite.

3. Add npm script in `package.json`.

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
- Check bot server ports aren't in use (7000-7100 range)
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

1. **Run basic simulation before pushing**: Fast and catches most issues
2. **Run single-table before PRs**: Validates tournament mechanics
3. **Run multi-table weekly**: Comprehensive but time-consuming
4. **Check assertions carefully**: Failed assertions indicate real bugs
5. **Don't ignore warnings**: They often predict future failures
