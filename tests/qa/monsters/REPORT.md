# Monster Army Report

**Last Updated:** 2026-03-21  
**Source:** `tests/qa/monsters/data/memory.json` (auto-generated)

---

## Summary

| Metric | Value |
|--------|-------|
| Total Runs | 50 |
| Open Findings | 129 |
| Fixed Findings | 70 |
| Regressions | 0 |
| Pass Rate | 52.0% |

---

## Open Bugs



### HIGH (2)

#### stale-closure: Potential stale closure: winners used in callback but not in...
- **ID:** `6add4bfe`
- **Location:** frontend/src/components/game/Table.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Potential stale closure: winners used in callback but not in dependency array

#### Security vulnerability: xss_reflected_search
- **ID:** `4e595ae6`
- **Location:** security/xss/xss_reflected_search
- **Monster:** guardian
- **Category:** SECURITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Test for reflected XSS in search parameters: XSS payload reflected in response

### MEDIUM (34)

#### /api/v1/tournaments - sql_injection_drop: wrong status
- **ID:** `076638f8`
- **Location:** /api/v1/tournaments
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 2
- **First Seen:** 2026-03-21

Reject SQL injection in name
Expected 400, got 201

#### /api/v1/tournaments - sql_injection_select: wrong status
- **ID:** `964ef82d`
- **Location:** /api/v1/tournaments
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 2
- **First Seen:** 2026-03-21

Reject SQL injection UNION attack
Expected 400, got 201

#### /api/v1/tournaments - xss_event_handler: wrong status
- **ID:** `7c1c1efe`
- **Location:** /api/v1/tournaments
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 2
- **First Seen:** 2026-03-21

Reject XSS event handlers in name
Expected 400, got 201

#### /api/v1/auth/register - weak_password: wrong status
- **ID:** `3787c35a`
- **Location:** /api/v1/auth/register
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject weak password
Expected 400, got 201

#### /api/v1/auth/register - invalid_email: wrong status
- **ID:** `0f913c75`
- **Location:** /api/v1/auth/register
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject invalid email format
Expected 400, got 201

#### /api/v1/auth/register - missing_fields: wrong status
- **ID:** `64ace60d`
- **Location:** /api/v1/auth/register
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject missing required fields
Expected 400, got 500

#### /api/v1/tournaments - xss_script: wrong status
- **ID:** `a60042dd`
- **Location:** /api/v1/tournaments
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject XSS script tags in name
Expected 400, got 201

#### /api/v1/bots - missing_name: wrong status
- **ID:** `342027ce`
- **Location:** /api/v1/bots
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject missing name
Expected 400, got 409

#### /api/v1/bots - sql_injection: wrong status
- **ID:** `554a4f55`
- **Location:** /api/v1/bots
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject SQL injection in bot name
Expected 400, got 201

#### /api/v1/bots - xss_attack: wrong status
- **ID:** `62290f6d`
- **Location:** /api/v1/bots
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject XSS in bot name
Expected 400, got 201

#### /api/v1/bots - special_chars: wrong status
- **ID:** `785ebc9a`
- **Location:** /api/v1/bots
- **Monster:** api
- **Category:** BUG
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Reject special chars (only letters, numbers, underscores, hyphens allowed)
Expected 400, got 201

#### unsafe-error-access: Unsafe access to error.message without instanceof Error chec...
- **ID:** `19196754`
- **Location:** frontend/src/pages/AdminAnalytics.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Unsafe access to error.message without instanceof Error check

#### hardcoded-url: Hardcoded URL: http://localhost:3001. Use environment variab...
- **ID:** `5178d8c8`
- **Location:** src/config/app.config.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded URL: http://localhost:3001. Use environment variables.

#### hardcoded-url: Hardcoded URL: http://localhost:3001. Use environment variab...
- **ID:** `11ba1268`
- **Location:** src/main.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded URL: http://localhost:3001. Use environment variables.

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `32e39bcb`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `19058918`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `f26230ba`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `c7a49413`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `9f78684f`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `44659ae6`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `ccb03dda`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "botId" should use ParseUUIDPipe for validat...
- **ID:** `96c0cf76`
- **Location:** src/modules/bots/bots-connectivity.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "botId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "handId" should use ParseUUIDPipe for valida...
- **ID:** `c65d8e56`
- **Location:** src/modules/games/games.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "handId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "tableId" should use ParseUUIDPipe for valid...
- **ID:** `be465de3`
- **Location:** src/modules/games/games.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "tableId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "tableId" should use ParseUUIDPipe for valid...
- **ID:** `f0e518b1`
- **Location:** src/modules/games/games.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "tableId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "gameId" should use ParseUUIDPipe for valida...
- **ID:** `8319dcbd`
- **Location:** src/modules/games/games.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "gameId" should use ParseUUIDPipe for validation

#### missing-uuid-validation: Route parameter "gameId" should use ParseUUIDPipe for valida...
- **ID:** `e6dd09a1`
- **Location:** src/modules/games/games.controller.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Route parameter "gameId" should use ParseUUIDPipe for validation

#### hardcoded-url: Hardcoded URL: http://localhost:3001. Use environment variab...
- **ID:** `e47b6bf9`
- **Location:** src/modules/games/games.gateway.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded URL: http://localhost:3001. Use environment variables.

#### hardcoded-url: Hardcoded URL: http://localhost:3002. Use environment variab...
- **ID:** `a6ffe584`
- **Location:** src/modules/games/games.gateway.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded URL: http://localhost:3002. Use environment variables.

#### hardcoded-url: Hardcoded URL: http://localhost:3001. Use environment variab...
- **ID:** `1ca0be94`
- **Location:** src/services/bot-metrics.gateway.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded URL: http://localhost:3001. Use environment variables.

#### hardcoded-url: Hardcoded URL: http://localhost:3002. Use environment variab...
- **ID:** `b600747d`
- **Location:** src/services/bot-metrics.gateway.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded URL: http://localhost:3002. Use environment variables.

#### unsafe-error-access: Unsafe access to error.message without instanceof Error chec...
- **ID:** `c1e51c2c`
- **Location:** tests/qa/monsters/code-quality-monster/code-quality-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Unsafe access to error.message without instanceof Error check

#### empty-catch: Empty catch block silently swallows errors...
- **ID:** `49879b52`
- **Location:** tests/qa/monsters/code-quality-monster/code-quality-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Empty catch block silently swallows errors

#### Security vulnerability: exposure_sensitive_headers
- **ID:** `cac3d39c`
- **Location:** security/exposure/exposure_sensitive_headers
- **Monster:** guardian
- **Category:** SECURITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Check for sensitive information in headers: Sensitive header exposed: x-powered-by: Express

### LOW (93)

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `4052702b`
- **Location:** frontend/src/components/common/Timer.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 3000ms. Consider using a named cons...
- **ID:** `0575d303`
- **Location:** frontend/src/components/game/ActionFeed.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 3000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `6e1d3957`
- **Location:** frontend/src/components/game/ProvablyFairInfo.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1200ms. Consider using a named cons...
- **ID:** `b1b26667`
- **Location:** frontend/src/components/game/WinnerAnimation.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1200ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 4000ms. Consider using a named cons...
- **ID:** `aba04883`
- **Location:** frontend/src/components/game/WinnerAnimation.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 4000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 30000ms. Consider using a named con...
- **ID:** `a499d8e9`
- **Location:** frontend/src/components/layout/Layout.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 30000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `2be96991`
- **Location:** frontend/src/components/tournament/TournamentCard.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `732c5956`
- **Location:** frontend/src/pages/AdminTournaments.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 10000ms. Consider using a named con...
- **ID:** `40a60b7a`
- **Location:** frontend/src/pages/BotProfile.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 10000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `790e6843`
- **Location:** frontend/src/pages/ResetPassword.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `fcc5a240`
- **Location:** frontend/src/pages/TournamentDetail.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `f3c67b32`
- **Location:** frontend/src/pages/TournamentDetail.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 10000ms. Consider using a named con...
- **ID:** `b668ffa7`
- **Location:** frontend/src/pages/Tournaments.tsx
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 10000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `4c095525`
- **Location:** frontend/src/utils/analytics.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `2b4edfaa`
- **Location:** src/migrations/run.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `c9f882ed`
- **Location:** src/migrations/run.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `c25d56be`
- **Location:** src/migrations/run.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `4ebcc359`
- **Location:** src/migrations/run.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `b585d59f`
- **Location:** src/migrations/run.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `ef19509f`
- **Location:** src/migrations/run.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `3c504f9c`
- **Location:** src/migrations/run.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `99991469`
- **Location:** src/modules/metrics/metrics-collector.service.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `63a265af`
- **Location:** src/services/game/game-recovery.service.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `5f3812ac`
- **Location:** src/services/game/game-worker-manager.service.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `51d71e32`
- **Location:** src/simulation/runner.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `09fc502f`
- **Location:** src/simulation/runner.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `8b8c102a`
- **Location:** src/simulation/runner.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `6e4fafae`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `eb3b1af5`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `2c1f71ab`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `0ebe68ce`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `26788822`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `d66574a6`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `45e41e25`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `afa25734`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `f5d181f6`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `4bb99daf`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `5e6a9c53`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `5f716a28`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `eb192390`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `f8f74c06`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `d8766ca6`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `3b2a7aa3`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `3c2e4dc5`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `9f2c33ab`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `37efa846`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `51e6ffe0`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `f3df45b8`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `3a1cdeac`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `7bf2f3fa`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `2710ea79`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `76d42c2c`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `0c289a00`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `89200cfc`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `fdb7bc68`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### console-log: console.log found in production code. Use the logger utility...
- **ID:** `150be01f`
- **Location:** src/simulation/simulation-reporter.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

console.log found in production code. Use the logger utility instead.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `22ea3b7e`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `74ef279f`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `423b3de9`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `74c0db2a`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `39b2f3f5`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `6d98e7ac`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `d8c87d0e`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `73ca50ec`
- **Location:** tests/e2e/game-mechanics.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `61628b09`
- **Location:** tests/e2e/performance-load.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `1e8e6fb2`
- **Location:** tests/e2e/ui-navigation.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 8000ms. Consider using a named cons...
- **ID:** `c5666229`
- **Location:** tests/e2e/ui-navigation.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 8000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 3000ms. Consider using a named cons...
- **ID:** `9b92d8b1`
- **Location:** tests/e2e/websocket-realtime.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 3000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `9e741eae`
- **Location:** tests/e2e/websocket-realtime.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 3000ms. Consider using a named cons...
- **ID:** `b751cc7d`
- **Location:** tests/e2e/websocket-realtime.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 3000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `a901dfb0`
- **Location:** tests/e2e/websocket-realtime.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `b9282605`
- **Location:** tests/e2e/websocket-realtime.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `9769f541`
- **Location:** tests/e2e/websocket.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `6570b96b`
- **Location:** tests/e2e/websocket.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 3000ms. Consider using a named cons...
- **ID:** `92379238`
- **Location:** tests/e2e/websocket.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 3000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `f1232172`
- **Location:** tests/e2e/websocket.e2e.spec.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `60e214d7`
- **Location:** tests/qa/chaos/chaos-scenarios.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 30000ms. Consider using a named con...
- **ID:** `d71236fe`
- **Location:** tests/qa/chaos/chaos-simulation.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 30000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `d27e8de8`
- **Location:** tests/qa/chaos/controllable-bot.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `b5a8a3c3`
- **Location:** tests/qa/monsters/connectors/api-ws-connector.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `652bab5d`
- **Location:** tests/qa/monsters/connectors/api-ws-connector.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `e74daa36`
- **Location:** tests/qa/monsters/connectors/api-ws-connector.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `3ca74814`
- **Location:** tests/qa/monsters/connectors/api-ws-connector.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `b14e4f90`
- **Location:** tests/qa/monsters/connectors/api-ws-connector.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 1000ms. Consider using a named cons...
- **ID:** `c5e7181c`
- **Location:** tests/qa/monsters/e2e-monster/e2e-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 1000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `791e9222`
- **Location:** tests/qa/monsters/flows/game-flow-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `0d9d5589`
- **Location:** tests/qa/monsters/flows/game-flow-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 2000ms. Consider using a named cons...
- **ID:** `b46e8b84`
- **Location:** tests/qa/monsters/flows/tournament-flow-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 2000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 10000ms. Consider using a named con...
- **ID:** `b322bcef`
- **Location:** tests/qa/monsters/guardian-monster/guardian-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 10000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 10000ms. Consider using a named con...
- **ID:** `30712fc5`
- **Location:** tests/qa/monsters/guardian-monster/guardian-monster.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 10000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `fadb09da`
- **Location:** tests/qa/monsters/legacy/simulations/live-tournament-test.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 5000ms. Consider using a named cons...
- **ID:** `7896ea94`
- **Location:** tests/qa/monsters/legacy/simulations/robust-simulation.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 5000ms. Consider using a named constant.

#### hardcoded-timeout: Hardcoded timeout value: 3000ms. Consider using a named cons...
- **ID:** `866e7efc`
- **Location:** tests/qa/monsters/legacy/simulations/robust-simulation.ts
- **Monster:** code-quality
- **Category:** CODE_QUALITY
- **Occurrences:** 1
- **First Seen:** 2026-03-21

Hardcoded timeout value: 3000ms. Consider using a named constant.

---

## Recently Fixed

- ~~Interactivity: Only 7 hover states - many elements feel static...~~ (`dc1510ab`)
- ~~User Experience: Exposing internal ID in UI: {
    return playerNames[botId] ...~~ (`de12d6ed`)
- ~~User Experience: Exposing internal ID in UI: {validation.details.errors.slice...~~ (`5ec49196`)
- ~~User Experience: Exposing internal ID in UI: {
      const playerName = actio...~~ (`980d2b78`)
- ~~User Experience: Exposing internal ID in UI: {game.tableName ||
             ...~~ (`cd62a770`)
- ~~User Experience: Exposing internal ID in UI: Table ${game.tableId......~~ (`c4bfbad8`)
- ~~Overall Design Grade: C - Below Average~~ (`7122f304`)
- ~~Micro-interactions: Only 5 transitions found - interactions feel abrupt...~~ (`d63a8d19`)
- ~~Overall Design Grade: B+ - Good~~ (`7bd40e14`)
- ~~Overall Design Grade: A - Professional~~ (`2ba00367`)

---

## Recent Runs

| Run ID | Date | Duration | Findings | Status |
|--------|------|----------|----------|--------|
| `monster-` | 2026-03-21 | 3.3s | 0 | ✅ |
| `monster-` | 2026-03-21 | 2.7s | 0 | ✅ |
| `monster-` | 2026-03-21 | 2.7s | 0 | ✅ |
| `monster-` | 2026-03-21 | 2.6s | 0 | ✅ |
| `monster-` | 2026-03-21 | 34.7s | 129 | ❌ |

---

## Quick Reference

```bash
# Run monsters
npm run monsters:quick          # Fast validation
npm run monsters:pr             # PR validation  
npm run monsters:nightly        # Full coverage

# Setup test data
npm run test:db:setup
```

---

<!-- MANUAL SECTIONS BELOW -->
<!-- Everything below this line is preserved across auto-generation -->

## Improvement Backlog

### QA System
- [ ] AI-powered visual analysis - "Does this look right?" checks
- [ ] User journey replay from analytics data
- [ ] Triage filter - "Current run only" vs "all time"
- [ ] CI integration - Monster Army as PR gate

### Performance Testing
- [ ] Re-run load tests after N+1 fix
- [ ] WebSocket performance testing
- [ ] Multiple concurrent tournaments
- [ ] Memory growth / endurance test

### Observability
- [ ] Business metrics dashboard (daily active bots, hands per hour)
- [ ] OpenTelemetry distributed tracing

---

*See [README.md](./README.md) for Monster Army architecture.*



















































































































































































