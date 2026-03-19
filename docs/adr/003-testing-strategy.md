# ADR 003: Testing Strategy

## Status

Accepted

## Context

The platform handles "real money" (simulated chips with real value) and must maintain a "zero bug" approach for game logic. Manual testing is insufficient because:

1. **Edge cases are numerous** - All-in scenarios, side pots, split pots
2. **Concurrency issues** - Race conditions in betting
3. **Regression risk** - Changes to betting logic affect everything
4. **Scale testing** - Can't manually test thousands of hands

## Decision

Implement a comprehensive testing strategy with three components:

### 1. Unit Tests (Vitest)

Test individual components in isolation:

```
tests/unit/
  betting.spec.ts       # Betting round logic
  pot-manager.spec.ts   # Side pot calculations
  hand-evaluator.spec.ts # Hand ranking
  chip-conservation.spec.ts # Invariant checks
```

**Coverage Targets:**
- Game engine: 95%+
- Chip handling: 100%
- Other code: 80%+

### 2. Simulation Engine

Run thousands of automated games with various bot personalities:

```
src/simulation/
  simulation-engine.ts  # Core simulation runner
  simulation-reporter.ts # Stats and anomaly detection
  runner.ts             # CLI entry point
```

**Features:**
- Deterministic mode (seeded RNG)
- Multiple bot personalities (caller, folder, maniac, etc.)
- Chip conservation validation after every hand
- Anomaly detection and reporting
- Performance benchmarking

**Bot Personalities:**
- `caller` - Calls most bets
- `folder` - Folds frequently
- `maniac` - Raises aggressively
- `random` - Random valid actions
- `smart` - GTO-inspired decisions
- `crasher` - Tests error handling
- `slow` - Tests timeout handling

### 3. CI Pipeline

Automated testing on every commit:

```yaml
jobs:
  test:
    - npm run lint
    - npm run typecheck
    - npm run test:unit
    - npm run simulate -- --tournaments=5 --seed=12345
```

## Consequences

### Positive

- High confidence in game logic correctness
- Automatic regression detection
- Edge case coverage through simulation
- Performance baseline tracking
- Documentation through test cases

### Negative

- Initial development time for test infrastructure
- Maintenance overhead for test suites
- CI pipeline time cost
- Simulation can't catch all real-world issues

### Neutral

- Vitest chosen over Jest (faster, better ESM support)
- Custom simulation engine vs. property-based testing

## Critical Test Cases

### Must Pass Before Deploy

1. **Chip Conservation**
   - Total chips constant through entire tournament
   - No negative chip counts ever
   - All bets accounted for in pot

2. **All-In Scenarios**
   - Multiple side pots calculated correctly
   - Short all-in doesn't reopen betting
   - Correct winner eligibility per pot

3. **Split Pots**
   - Even splits calculated correctly
   - Odd chip distribution deterministic

4. **Blind Handling**
   - Short stack blinds handled
   - Dead blinds in tournaments

5. **Hand Evaluation**
   - All hand types detected
   - Correct ranking comparison
   - Kicker determination accurate
