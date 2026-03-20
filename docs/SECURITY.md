# Poker Engine — Security Architecture

A living document. Update whenever a security decision is made, a vulnerability is identified, or a control is implemented or deferred.

---

## Threat Model

**Who are the users?**
Bot developers — technically sophisticated, running code on their own servers. Not anonymous consumers.

**What do we protect?**
- Game integrity — bots cannot cheat, spoof other players, or manipulate outcomes
- Data — hand history and user accounts are valuable; they are the product
- Service availability — a misbehaving bot should not disrupt other games
- Chip integrity — all chip movements must be tracked and conserved

**What are the realistic threats?**
- Impersonation — someone joins a table pretending to be another user's bot
- Data scraping — bulk harvesting of hand history for a competitive edge
- Denial of service — flooding the join/register endpoints or running slow bots intentionally
- API key leakage — keys stored insecurely client-side, shared publicly
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

#### API Key Authentication (Bots)
- **Mechanism:** API key sent as `X-API-Key` header
- **Storage:** SHA-256 hashed in `users.api_key_hash`
- **Generation:** `crypto.randomBytes(32).toString('hex')` — 256 bits of entropy
- **Guard:** `ApiKeyGuard` validates keys for bot endpoints

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
- **Global limit:** 100 requests per minute per IP
- **Configuration:** Via `RATE_LIMIT_TTL` and `RATE_LIMIT_MAX` env vars
- **Customizable:** Per-route overrides via `@Throttle()` decorator

### Input Validation

#### Strict DTO Validation
- **Implementation:** `class-validator` with `StrictValidationPipe`
- **Options:** `whitelist: true`, `forbidNonWhitelisted: true`
- **Bot endpoints:** Custom `@IsValidBotEndpoint()` validator blocks internal IPs

#### Bot Endpoint Validation
Blocked patterns:
- Private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- Localhost and loopback (127.x.x.x, ::1)
- Link-local addresses (169.254.x.x)
- Cloud metadata endpoints (169.254.169.254)

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
  - `BotTimeoutError` — strike applied, penalty fold
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

### Bot Fault Isolation
- Bots run on separate servers — no direct game state access
- Timeouts (configurable, default 30s) prevent stalling
- 3-strike disconnect prevents dead bots from degrading games

---

## Database Security

### PostgreSQL Configuration
- Connection pooling prevents resource exhaustion
- Prepared statements prevent SQL injection
- `SERIALIZABLE` transactions for chip movements

### Data Protection
- Sensitive fields hashed (API keys, passwords)
- No soft delete on hands/actions — append-only audit trail
- Cascade delete for proper cleanup

---

## Known Vulnerabilities / Gaps (Prioritized)

### P0 — Must fix before production

**[SEC-001] API keys stored in plaintext** — FIXED
- Solution: SHA-256 hashing implemented in `UserRepository`

**[SEC-002] No rate limiting** — FIXED
- Solution: `@nestjs/throttler` with configurable limits

**[SEC-003] No TLS** — OPERATOR RESPONSIBILITY
- Solution: Deploy behind nginx/Caddy with HTTPS

### P1 — Fix before inviting external users

**[SEC-004] WebSocket replay protection** — PARTIALLY FIXED
- JWT validation on connect implemented
- TODO: Add refresh token handling for long-lived connections

**[SEC-005] Bot endpoint receives no secret** — FIXED
- Risk: Anyone can send fake game state to bot
- Solution: `HmacSigningService` implements HMAC-SHA256 payload signing
- Headers: `X-Poker-Signature`, `X-Poker-Timestamp`, `X-Poker-Nonce`
- Enable via `ENABLE_BOT_HMAC_SIGNING=true` env var

**[SEC-006] No request body size limit** — FIXED
- Solution: Enforced via NestJS body parser config

### P2 — Important but not blocking

**[SEC-007] Bot endpoint URL not validated for SSRF** — FIXED
- Solution: `@IsValidBotEndpoint()` validator blocks private IPs

**[SEC-008] Concurrent join race condition** — FIXED
- Solution: PostgreSQL `SERIALIZABLE` transactions

**[SEC-009] API key entropy** — FIXED
- Solution: `crypto.randomBytes(32).toString('hex')`

**[SEC-010] No key rotation** — FIXED
- Solution: `ApiKeyRotationService` with grace period for old keys
- Endpoint: `POST /users/:id/rotate-api-key`
- Features:
  - Old key valid during grace period (default 24h)
  - Admin can revoke all keys: `POST /users/:id/revoke-api-keys`
  - Status check: `GET /users/:id/api-key-status`

**[SEC-011] Webhook signing** — FIXED
- Solution: `WebhookSigningService` for outgoing webhooks
- Format: Stripe-style `v1=<signature>` in `X-Poker-Webhook-Signature` header
- Includes timestamp validation to prevent replay attacks

---

## Security Review Checklist (Before Production)

- [x] SEC-001: API keys hashed in DB — SHA-256
- [x] SEC-002: Rate limiting — NestJS Throttler
- [ ] SEC-003: TLS via reverse proxy
- [x] SEC-004: WebSocket JWT auth (partial)
- [x] SEC-005: HMAC signing of bot payloads — `HmacSigningService`
- [x] SEC-006: Request body size limits
- [x] SEC-007: SSRF protection on bot endpoints
- [x] SEC-008: Atomic join — PostgreSQL transactions
- [x] SEC-009: Cryptographic API key generation
- [x] SEC-010: Key rotation endpoint — `ApiKeyRotationService`
- [x] SEC-011: Webhook request signing — `WebhookSigningService`

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
- `npm audit` runs in CI pipeline
- Dependabot alerts enabled
- Security scan job in GitHub Actions

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

### API Key Compromise
1. Regenerate key immediately via `POST /auth/regenerate-api-key`
2. Check `audit_logs` for unauthorized access
3. Invalidate any affected game results
