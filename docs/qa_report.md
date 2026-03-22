# 🧪 Complete QA Report

**Generated:** 3/22/2026, 1:51:53 AM
**Total Duration:** 579.6s
**Time Saved (parallel):** 13.5s (2% faster)

## Summary

| Metric | Value |
|--------|-------|
| Total Suites | 11 |
| Passed | 8 |
| Failed | 3 |
| Success Rate | 72.7% |

## Results by Category


### Monster

| Suite | Status | Duration |
|-------|--------|----------|
| Monsters (Fast) | ✅ Pass | 7.9s |
| Monsters (All 21) | ✅ Pass | 21.0s |


### Unit

| Suite | Status | Duration |
|-------|--------|----------|
| Unit Tests | ✅ Pass | 12.2s |


### Integration

| Suite | Status | Duration |
|-------|--------|----------|
| Integration Tests | ✅ Pass | 1.8s |


### Simulation

| Suite | Status | Duration |
|-------|--------|----------|
| Basic Simulation | ✅ Pass | 64.1s |
| All Simulations | ❌ Fail | 300.0s |


### Visual

| Suite | Status | Duration |
|-------|--------|----------|
| Visual Tests | ✅ Pass | 1.9s |


### Monitoring

| Suite | Status | Duration |
|-------|--------|----------|
| Monitoring Tests | ✅ Pass | 1.9s |


### Load

| Suite | Status | Duration |
|-------|--------|----------|
| Load Tests (Quick) | ❌ Fail | 72.3s |


### E2e

| Suite | Status | Duration |
|-------|--------|----------|
| E2E Tests | ❌ Fail | 108.3s |


### Chaos

| Suite | Status | Duration |
|-------|--------|----------|
| Chaos Tests (Light) | ✅ Pass | 1.8s |


## Failed Suites


### Load Tests (Quick)
- **Error:** Test assertions failed
- **Duration:** 72.3s
- **Command:** `npm run load:quick`


### E2E Tests
- **Error:** Test assertions failed
- **Duration:** 108.3s
- **Command:** `npm run test:e2e`


### All Simulations
- **Error:** Timeout after 300s
- **Duration:** 300.0s
- **Command:** `npm run sim:all`


## Optimization Stats

| Metric | Value |
|--------|-------|
| Sequential Time (est.) | 593.1s |
| Actual Time | 579.6s |
| Time Saved | 13.5s |
| Speedup | 1.0x |

---
*Run `npm run qa:all` to regenerate this report.*
