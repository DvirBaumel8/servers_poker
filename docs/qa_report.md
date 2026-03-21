# 🧪 Complete QA Report

**Generated:** 3/22/2026, 1:27:53 AM
**Total Duration:** 232.3s

## Summary

| Metric | Value |
|--------|-------|
| Total Suites | 11 |
| Passed | 6 |
| Failed | 5 |
| Success Rate | 54.5% |

## Results by Category


### Unit

| Suite | Status | Duration |
|-------|--------|----------|
| Unit Tests | ✅ Pass | 10.7s |


### Monster

| Suite | Status | Duration |
|-------|--------|----------|
| Monsters (Fast) | ✅ Pass | 7.2s |
| Monsters (All 21) | ✅ Pass | 19.8s |


### Integration

| Suite | Status | Duration |
|-------|--------|----------|
| Integration Tests | ❌ Fail | 1.3s |


### Simulation

| Suite | Status | Duration |
|-------|--------|----------|
| Basic Simulation | ❌ Fail | 64.0s |
| All Simulations | ❌ Fail | 3.5s |


### E2e

| Suite | Status | Duration |
|-------|--------|----------|
| E2E Tests | ❌ Fail | 57.2s |


### Visual

| Suite | Status | Duration |
|-------|--------|----------|
| Visual Tests | ✅ Pass | 1.3s |


### Load

| Suite | Status | Duration |
|-------|--------|----------|
| Load Tests (Quick) | ❌ Fail | 71.7s |


### Chaos

| Suite | Status | Duration |
|-------|--------|----------|
| Chaos Tests (Light) | ✅ Pass | 1.5s |


### Monitoring

| Suite | Status | Duration |
|-------|--------|----------|
| Monitoring Tests | ✅ Pass | 1.3s |


## Failed Suites


### Integration Tests
- **Error:** Test assertions failed
- **Duration:** 1.3s
- **Command:** `npm run test:integration`


### Basic Simulation
- **Error:** Test assertions failed
- **Duration:** 64.0s
- **Command:** `npm run sim:basic`


### E2E Tests
- **Error:** Test assertions failed
- **Duration:** 57.2s
- **Command:** `npm run test:e2e`


### All Simulations
- **Error:** Test assertions failed
- **Duration:** 3.5s
- **Command:** `npm run sim:all`


### Load Tests (Quick)
- **Error:** Test assertions failed
- **Duration:** 71.7s
- **Command:** `npm run load:quick`


---
*Run `npm run qa:all` to regenerate this report.*
