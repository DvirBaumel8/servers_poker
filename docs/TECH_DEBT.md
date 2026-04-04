# Technical Debt & Future Improvements

This file tracks technical debt, security hardening items, and improvements to address before production deployment or scaling.

**Priority Levels:**
- 🔴 **Critical** - Must fix before production
- 🟠 **High** - Should fix soon after launch
- 🟡 **Medium** - Plan for next iteration
- 🟢 **Low** - Nice to have

---

## Observability

### 🟡 Monitoring Stack Not Implemented
**Added:** 2026-03-27
**Context:** Prometheus, Grafana, and Alertmanager were documented (README, API.md, ARCHITECTURE.md) but never implemented. No `/metrics` endpoint exists. No `monitoring/` directory exists. Only health checks (`@nestjs/terminus`) and structured logging (`nestjs-pino`) are in place.
**Action Required:**
- [ ] Implement Prometheus metrics endpoint (`prom-client`)
- [ ] Add Grafana dashboard configuration
- [ ] Configure Alertmanager for alerting
- [ ] Integrate Sentry for error tracking (also documented but absent)

**Deferred:** Post-MVP.

---

## Performance & Scaling

### 🟡 Database Connection Pooling Tuning
**Added:** 2026-03-20
**Context:** Default TypeORM pool settings.
**Action Required:**
- [ ] Profile connection usage under load
- [ ] Tune pool size based on expected concurrency

---

## Feature Completeness

### 🟠 Scheduled Tournament Start Timer
**Added:** 2026-03-20
**Context:** `type:'scheduled'` exists but no timer fires at `scheduled_start_at`.
**Action Required:**
- [ ] Implement cron/scheduler to start tournaments at scheduled time

### 🟠 Tournament Reset/Restart
**Added:** 2026-03-20
**Context:** Finished tournaments can't be restarted without manual DB changes.
**Action Required:**
- [ ] Add admin endpoint to reset tournament state

---

## Testing Infrastructure

### 🟢 Mobile/Tablet Viewport Testing
**Added:** 2026-03-21
**Context:** Browser QA Monster currently only tests desktop viewport (1920x1080) to speed up test runs.
**Action Required:**
- [ ] Add mobile viewport testing when responsive design is prioritized
- [ ] Suggested viewports: iPhone 16 (393x852), iPad (768x1024)
- [ ] Update `tests/qa/monsters/browser-monster/browser-qa-monster.ts` VIEWPORTS array

### 🟡 E2E Tests Stability
**Added:** 2026-03-21
**Updated:** 2026-03-22
**Context:** E2E tests had intermittent failures from fixed `sleep()` calls and parallel schema conflicts.

**Current State:**
- Schema conflicts fixed with `--no-file-parallelism`
- `continue-on-error` removed from CI — monsters must pass
- `game-mechanics.e2e.spec.ts` migrated from fixed sleeps to `waitForCondition()` polling
- `ui-navigation.e2e.spec.ts` sleeps reduced/removed

**Action Required:**
- [ ] Migrate remaining WebSocket E2E sleeps to event-based waits
- [ ] Consider splitting E2E tests into separate jobs that run against different databases
- [ ] Fix `strategy-analyzer-pipeline.e2e.spec.ts` — currently skipped because background game workers from prior test suites corrupt the DB connection pool, causing `DecisionLoggerService.forceFlush()` to silently fail. Root cause: E2E test suites don't stop running games in `afterAll`, so their workers survive into the next suite's `dropSchema: true`

---

## Code Quality

### 🟢 Remove Console Logs
**Added:** 2026-03-20
**Context:** Some debug console.log statements may remain in codebase.
**Action Required:**
- [ ] Audit and remove or convert to proper Logger

### 🟢 Standardize Error Codes
**Added:** 2026-03-20
**Context:** Some endpoints return different error formats.
**Action Required:**
- [ ] Create error code enum
- [ ] Standardize all error responses

---

## How to Use This File

1. When starting new work, check this file for relevant items
2. When adding tech debt, include:
   - Date added
   - Context (why the shortcut was taken)
   - Risk (what could go wrong)
   - Action items (specific tasks to fix it)
3. When completing items, move to "Completed" section with date
4. Review quarterly and reprioritize

---

## Completed

### ✅ Redis for Session State (Horizontal Scaling)
**Added:** 2026-03-20
**Completed:** 2026-03-21
**Context:** In-memory state prevented horizontal scaling.
**Solution Implemented:**
- [x] `RedisModule` with `RedisService` and `RedisPubSubService`
- [x] `GameOwnershipService` for distributed locking (SET NX EX pattern)
- [x] `RedisGameStateService` for game/tournament state persistence
- [x] `RedisEventBusService` for cross-instance event distribution via pub/sub
- [x] `RedisHealthService` for monitoring
- [x] Updated `LiveGameManagerService` with optional Redis integration
- [x] Updated `GamesGateway` to receive events from other instances
- [x] Updated `TournamentDirectorService` with tournament ownership
- [x] Updated `GameRecoveryService` to recover from Redis state
- [x] Redis added to `docker-compose.yml`
- [x] `@socket.io/redis-adapter` for cross-instance WebSocket broadcasts
- [x] `RedisIoAdapter` configured in `main.ts`
- [x] `RedisSocketStateService` for WebSocket connection state in Redis
- [x] Sticky sessions no longer required for horizontal scaling

**Architecture:**
- Single executor model: one instance owns each game's execution loop
- Other instances sync state via Redis and can take over on failover
- Socket.IO Redis adapter enables broadcasts to clients on any instance
- Ownership TTL: 10 seconds, renewal every 3 seconds
- Socket state TTL: 1 hour with automatic refresh
- Backward compatible: works without Redis (falls back to in-memory)
