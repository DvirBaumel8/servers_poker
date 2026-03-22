# Performance Load Testing Framework

Comprehensive load testing for the Poker Tournament Platform.

**Target Scale:** 100 concurrent tournaments, 1000 virtual users

## Quick Start

```bash
# Ensure backend is running
npm run dev

# Quick CI validation (~2 min)
npm run load:quick

# Full sustained load test (100 tournaments, 10 min)
npm run load:sustained
```

## Available Scenarios

| Scenario | Command | Duration | Scale | Use Case |
|----------|---------|----------|-------|----------|
| **Quick** | `npm run load:quick` | ~2 min | 20 tournaments | CI/CD validation |
| **Baseline** | `npm run load:baseline` | ~2 min | 5 tournaments | Establish baseline metrics |
| **Ramp-up** | `npm run load:ramp` | ~5 min | 1→50 tournaments | Find breaking points |
| **Sustained** | `npm run load:sustained` | ~12 min | 100 tournaments | Target load validation |
| **Spike** | `npm run load:spike` | ~3 min | 0→100 in 10s | Stress test |

## SLOs (Service Level Objectives)

The framework validates against these default SLOs:

| Metric | Target | Description |
|--------|--------|-------------|
| HTTP P50 | ≤50ms | Median response time |
| HTTP P95 | ≤200ms | 95th percentile latency |
| HTTP P99 | ≤500ms | 99th percentile latency |
| Error Rate | ≤1% | Failed requests percentage |
| Memory Growth | ≤500MB | Heap growth during test |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Load Controller                             │
│  • Orchestrates test phases (ramp-up, sustained, ramp-down)     │
│  • Manages virtual tournament lifecycle                          │
│  • Collects metrics and generates reports                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Virtual         │ │ Virtual         │ │ Virtual         │
│ Tournament 1    │ │ Tournament 2    │ │ Tournament N    │
│                 │ │                 │ │                 │
│ • Bot servers   │ │ • Bot servers   │ │ • Bot servers   │
│ • WS connection │ │ • WS connection │ │ • WS connection │
│ • State monitor │ │ • State monitor │ │ • State monitor │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
                   ┌─────────────────┐
                   │  Metrics        │
                   │  Collector      │
                   │                 │
                   │ • Latency HDR   │
                   │ • Throughput    │
                   │ • Error rates   │
                   │ • Resources     │
                   └─────────────────┘
```

## Usage Examples

### Basic Load Test

```bash
# Run with verbose logging
npm run load:quick -- --verbose

# Run sustained test
npm run load:sustained
```

### Programmatic Usage

```typescript
import { runLoadTest } from './tests/qa/performance/load-controller';

const result = await runLoadTest('sustained', { verbose: true });

console.log(`SLO Status: ${result.sloValidation.passed ? 'PASSED' : 'FAILED'}`);
console.log(`P95 Latency: ${result.metrics.httpLatency.p95}ms`);
```

### Custom Scenario

```typescript
import { SCENARIOS, ScenarioConfig } from './tests/qa/performance/load-config';

// Modify existing scenario
const customScenario: ScenarioConfig = {
  ...SCENARIOS.sustained,
  name: 'Custom',
  targetTournaments: 50,
  sustainedDurationMs: 300000, // 5 minutes
};
```

## Report Output

After each test, reports are saved to `tests/qa/performance/reports/`:

- `load-test-{scenario}-{timestamp}.json` - Machine-readable metrics
- `load-test-{scenario}-{timestamp}.md` - Human-readable report
- `load-test-{scenario}-{timestamp}-metrics.txt` - Detailed metrics dump

### Sample Report

```markdown
# Load Test Report: Sustained

## Summary
| Metric | Value |
|--------|-------|
| Duration | 620.5s |
| SLO Status | ✅ PASSED |

## HTTP Latency
| Percentile | Value | SLO | Status |
|------------|-------|-----|--------|
| P50 | 23.5ms | 50ms | ✅ |
| P95 | 87.2ms | 200ms | ✅ |
| P99 | 156.8ms | 500ms | ✅ |
```

## CI/CD Integration

### GitHub Actions

```yaml
jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Start services
        run: docker-compose up -d
        
      - name: Wait for healthy
        run: |
          timeout 60 bash -c 'until curl -s http://localhost:3000/api/v1/health; do sleep 2; done'
          
      - name: Run load test
        run: npm run load:ci
        
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: load-test-report
          path: tests/qa/performance/reports/
```

### Environment Variables

```bash
# Override default endpoints
LOAD_TEST_BACKEND_URL=http://staging:3000
LOAD_TEST_WS_URL=ws://staging:3000
LOAD_TEST_DB_HOST=postgres
LOAD_TEST_DB_NAME=poker_test
```

## Troubleshooting

### High Latency

1. Check database connection pool size
2. Review slow query logs
3. Monitor CPU/memory during test

### WebSocket Disconnects

1. Check server WebSocket limits
2. Review load balancer timeout settings
3. Monitor for memory leaks in game state

### Memory Growth

1. Look for event listener leaks
2. Check game state cleanup after completion
3. Review bot server shutdown

## File Structure

```
tests/qa/performance/
├── README.md                    # This file
├── index.ts                     # Exports
├── load-config.ts               # Scenarios, SLOs, types
├── metrics-collector.ts         # Metrics aggregation
├── virtual-tournament.ts        # Tournament simulation
├── load-controller.ts           # Main orchestrator
├── load-test.ts                 # Legacy API load test
├── network-resilience.test.ts   # Fault injection tests
├── scenarios/
│   ├── baseline.scenario.ts
│   ├── ramp-up.scenario.ts
│   ├── sustained.scenario.ts
│   ├── spike.scenario.ts
│   └── quick.scenario.ts
└── reports/                     # Generated reports
```

## Future Enhancements

- [ ] Distributed load testing with k6
- [ ] Real-time dashboard with Grafana
- [ ] Automated performance regression detection
- [ ] WebSocket latency histogram
- [ ] Database query profiling integration
