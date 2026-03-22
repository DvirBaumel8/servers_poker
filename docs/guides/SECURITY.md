# Poker Engine — Security Architecture

A living document. Update whenever a security decision is made, a vulnerability is identified, or a control is implemented or deferred.

---

## Threat Model

**Who are the users?**
Users who build bots via the BotBuilder UI. Bots run in-process using strategy evaluation — no external servers.

**What do we protect?**
- Game integrity — bots cannot cheat, spoof other players, or manipulate outcomes
- Data — hand history and user accounts are valuable; they are the product
- Service availability — the platform must remain stable under load
- Chip integrity — all chip movements must be tracked and conserved

**What are the realistic threats?**
- Impersonation — someone joins a table pretending to be another user's bot
- Data scraping — bulk harvesting of hand history for a competitive edge
- Denial of service — flooding the join/register endpoints or running slow bots intentionally
- Replay attacks — replaying a valid join request to seat a bot multiple times
- Out-of-turn actions — bots sending actions when it's not their turn

---

## Current Controls (NestJS Migration)

### Authentication

#### JWT Authentication (Users)
- **Mechanism:** JWT tokens with configurable expiration (default 24h)
- **Implementation:** `@nestjs/jwt` with `passport-jwt` strategy
- **Guards:** `JwtAuthGuard` validates tokens on protected routes
- **Token payload:** `{ sub: userId, email: string, role: string }`
- **Secret enforcement:** `JWT_SECRET` must be set in all non-development environments. The application refuses to start if `JWT_SECRET` is missing or uses a default value outside of `NODE_ENV=development`. No hardcoded fallback exists.

#### Refresh Tokens
- **Opaque refresh tokens** (32-byte random hex) are issued alongside access tokens on login and email verification.
- Refresh tokens are stored **hashed (SHA-256)** in the database — the plaintext is never persisted.
- **Token rotation:** each refresh issues a new access + refresh pair, invalidating the old refresh token.
- **Expiry:** 7 days. Expired tokens are automatically cleared.
- **Revocation:** `POST /auth/logout` explicitly revokes the user's refresh token.
- **CSRF:** Not applicable — JWT Bearer tokens are used (browser does not auto-attach them to cross-origin requests).

#### Email Verification
- Both `POST /auth/register` and `POST /auth/register-developer` require email verification before issuing a JWT token. The endpoint returns a success message prompting the user to verify their email.
- **Verification codes** are generated using `crypto.randomInt()` (cryptographically secure) instead of `Math.random()`, eliminating predictability of verification codes.

### Authorization

#### Role-Based Access Control (RBAC)
- **Roles:** `admin`, `user` (default)
- **Implementation:** `@Roles()` decorator + `RolesGuard`
- **Enforcement:** All admin endpoints require `admin` role

#### Resource Ownership
- Every write operation verifies ownership — `bot.user_id === user.id`
- Bots can only be modified by their owners
- Tournament management restricted to admins

### Rate Limiting

#### NestJS Throttler Module
- **Global limit:** 300 requests per minute per IP
- **Configuration:** Via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` env vars
- **Customizable:** Per-route overrides via `@Throttle()` decorator

#### Per-Route Auth Limits
| Endpoint | Limit |
|----------|-------|
| `POST /auth/register` | 5 per hour |
| `POST /auth/register-developer` | 3 per hour |
| `POST /auth/login` | 10 per 15 min |
| `POST /auth/verify-email` | 5 per 15 min |
| `POST /auth/resend-verification` | 3 per 15 min |
| `POST /auth/forgot-password` | 3 per 15 min |
| `POST /auth/reset-password` | 3 per 15 min |
| `POST /auth/refresh` | 10 per 15 min |

### Input Validation

#### Strict DTO Validation
- **Implementation:** `class-validator` with `StrictValidationPipe`
- **Options:** `whitelist: true`, `forbidNonWhitelisted: true`

### Audit Logging

#### Request Audit Trail
- **Interceptor:** `AuditLogInterceptor` logs all requests
- **Fields:** user_id, action, resource, IP, user_agent, method, status, duration
- **Storage:** `audit_logs` table in PostgreSQL

#### Chip Movement Tracking
- **Entity:** `ChipMovement` records all chip transactions
- **Fields:** bot_id, game_id, hand_id, movement_type, amount, balance_before/after
- **Constraint:** `CHECK (balance_after >= 0)` prevents negative balances

### Exception Handling

#### Global Exception Filters
- `HttpExceptionFilter` — standardized error responses
- `GameExceptionFilter` — handles game-specific errors:
  - `ChipConservationError` — critical, logged with full game state
  - `InvalidActionError` — returns valid actions to bot
  - `TournamentError` — tournament lifecycle issues

### Transport Security

- TLS handled by reverse proxy (nginx/Caddy)
- CORS configuration via environment variables
- WebSocket connections authenticated via JWT

---

## WebSocket Security

### Authentication
- JWT token validated on connection
- Connections without valid token rejected
- Token refresh handled via HTTP, not WS

### Bot Ownership Verification
- `registerBot` and `subscribeBotActivity` verify `bot.user_id === client.userId`
- Unauthenticated clients are rejected with "Authentication required"
- Ownership mismatch returns "Bot not found or access denied"

### Room Isolation
- Each table is a separate Socket.IO room
- Bots can only subscribe to games they're playing in
- Spectators see `publicState` (no hidden cards)

### Action Validation
- All bot actions validated before processing
- Out-of-turn actions rejected with error event
- Invalid actions result in penalty fold

---

## Game Engine Security

### Chip Conservation
- `ChipInvariantChecker` validates after every action
- `TransactionAuditLog` records all chip movements
- Violations halt the game and log critical error

### Out-of-Turn Protection
When a bot sends an action but it's not their turn:
1. Server checks `currentPlayerId` against bot ID
2. If mismatch: action rejected with `InvalidTurnError`
3. No strike applied (could be race condition)
4. Correct player's turn continues

---

## Database Security

### PostgreSQL Configuration
- Connection pooling prevents resource exhaustion
- Prepared statements prevent SQL injection
- `SERIALIZABLE` transactions for chip movements

### Data Protection
- Sensitive fields hashed (passwords)
- No soft delete on hands/actions — append-only audit trail
- Cascade delete for proper cleanup

---

## Known Vulnerabilities / Gaps (Prioritized)

### P0 — Must fix before production

**[SEC-002] No rate limiting** — FIXED
- Solution: `@nestjs/throttler` with configurable limits

**[SEC-003] No TLS** — OPERATOR RESPONSIBILITY
- Solution: Deploy behind nginx/Caddy with HTTPS

### P1 — Fix before inviting external users

**[SEC-004] WebSocket replay protection** — FIXED
- JWT validation on connect implemented
- Refresh tokens with rotation allow token revocation without changing the global JWT secret

**[SEC-006] No request body size limit** — FIXED
- Solution: Enforced via NestJS body parser config

### P2 — Important but not blocking

**[SEC-008] Concurrent join race condition** — FIXED
- Solution: PostgreSQL `SERIALIZABLE` transactions

---

## Security Review Checklist (Before Production)

- [x] SEC-002: Rate limiting — NestJS Throttler
- [ ] SEC-003: TLS via reverse proxy
- [x] SEC-004: WebSocket JWT auth (partial)
- [x] SEC-006: Request body size limits
- [x] SEC-008: Atomic join — PostgreSQL transactions

---

## CI/CD Security

### Automated Security Scanning

The following security tools run on every PR and push to main:

#### CodeQL (SAST)
- **Purpose:** Static Application Security Testing
- **Languages:** JavaScript/TypeScript
- **Schedule:** On every PR + weekly full scan
- **Config:** `.github/workflows/security.yml`

#### Gitleaks (Secret Detection)
- **Purpose:** Prevents secrets from being committed
- **Scans:** All commits for API keys, tokens, passwords
- **Action:** Blocks PR if secrets detected

#### Dependency Auditing
- **Backend:** `npm audit --audit-level=high` (fails on high/critical)
- **Frontend:** Same audit for frontend dependencies
- **Automated:** Dependabot creates PRs for vulnerable packages

#### License Compliance
- **Tool:** `license-checker`
- **Allowed:** MIT, Apache-2.0, BSD-*, ISC, MPL-2.0, CC0-1.0
- **Action:** Fails CI if non-compliant license detected

### Branch Protection

Main branch requires:
- All CI checks passing (lint, typecheck, tests, security)
- At least 1 PR review
- No direct pushes (all changes via PR)

---

## Dependency Security

### Production Dependencies
With the NestJS migration, we now use npm dependencies:
- `@nestjs/*` — Core framework
- `typeorm`, `pg` — Database ORM and driver
- `passport`, `passport-jwt` — Authentication
- `class-validator`, `class-transformer` — Input validation
- `socket.io` — WebSocket implementation

### Security Practices
- All dependencies pinned to specific versions
- `npm audit` runs in CI pipeline (fails on high/critical)
- Dependabot alerts enabled + automatic PRs
- CodeQL scans for code vulnerabilities
- Gitleaks prevents secret leakage

---

## Incident Response

### Chip Conservation Violation
1. Game immediately halted
2. Full game state logged with `CRITICAL` severity
3. Alert sent to admin channel (when configured)
4. Manual investigation required before restart

### Suspected Bot Tampering
1. Check `audit_logs` for unusual patterns
2. Review `chip_movements` for the bot
3. Compare with simulation baseline
4. Temporary ban if confirmed
