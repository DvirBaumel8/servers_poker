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

**What are the realistic threats?**
- Impersonation — someone joins a table pretending to be another user's bot
- Data scraping — bulk harvesting of hand history for a competitive edge
- Denial of service — flooding the join/register endpoints or running slow bots intentionally
- API key leakage — keys stored insecurely client-side, shared publicly
- Replay attacks — replaying a valid join request to seat a bot multiple times

---

## Current Controls

### Authentication
- **Mechanism:** Static API key, sent as `Authorization: Bearer <key>` header
- **Storage:** SHA-256 hashed in `users.api_key`. Raw key returned once at registration, never stored.
- **Generation:** `crypto.randomBytes(32).toString('hex')` — 256 bits of entropy.
- **Scope:** One key per user, all permissions. No scoped tokens yet.

### Authorization
- Every write operation verifies ownership — `bot.user_id === user.id`
- Table creation is system-only (no API surface)
- Bot join verifies the bot is active and not already seated
- Hand history requires auth — prevents unauthenticated bulk scraping

### Transport
- No TLS enforced at the application layer — must be handled by reverse proxy (nginx/Caddy) in production
- WebSocket connections inherit the same security model as HTTP — no separate auth on WS

### Bot fault isolation
- Bots run on separate servers — they cannot access game state beyond what's sent to them
- Timeouts (configurable, default 10s) prevent a slow bot from stalling a table
- 3-strike disconnect prevents a dead bot from degrading the game indefinitely

### Data
- SQLite with WAL mode — safe for single-process use
- No soft delete on hands/actions — history is append-only
- Bots are soft-deleted, not hard-deleted — preserves all FK references

---

## Known Vulnerabilities / Gaps (Prioritized)

### P0 — Must fix before any public exposure

**[SEC-001] API keys stored in plaintext**
- Risk: Database breach exposes all user keys
- Fix: Store `SHA-256(api_key)` in DB. On login, hash the provided key and compare. The raw key is only shown once at registration.
- File: `src/db.js` → `createUser()`, `getUserByApiKey()`

**[SEC-002] No rate limiting**
- Risk: Unlimited registration, bot creation, and join attempts. Easy to spam.
- Fix: Per-IP and per-API-key rate limiting on all mutation endpoints.
  - `/users/register`: 5 per IP per hour
  - `/bots` (POST): 20 per user per day  
  - `/games/:id/join`: 10 per user per minute
- Implementation: In-memory sliding window counter in `src/rateLimit.js`, applied as middleware in `server.js`

**[SEC-003] No TLS**
- Risk: API keys and game state sent in plaintext over the network
- Fix: Deploy behind nginx or Caddy with automatic HTTPS. Never expose the Node server directly on port 80/443.

### P1 — Fix before inviting external users

**[SEC-004] WebSocket has no authentication**
- Risk: Anyone can subscribe to any table's live state, including hole cards at showdown
- Current mitigation: Hole cards are only sent to the active player at their turn, and at showdown they're already public. The WS broadcast sends `publicState` which hides hidden cards.
- Fix: Accept `?key=<api_key>` on the WS URL and optionally restrict some state fields (e.g. hole cards) to the owning user only
- File: `src/ws.js`, `server.js` WS connection handler

**[SEC-005] Bot endpoint receives no secret — any server can impersonate a game server**
- Risk: A malicious party could replay game state payloads to a bot, confusing it or harvesting its strategy
- Fix: Sign the bot payload with an HMAC using a shared secret established at bot registration. Bot verifies the signature before acting.
- Fields to add: `signature` in payload, `webhook_secret` in `bots` table

**[SEC-006] No request body size limit**
- Risk: Large bodies can cause memory exhaustion
- Fix: Enforce max body size (e.g. 64KB) in `parseBody()`. Reject with 413 if exceeded.
- File: `server.js` → `parseBody()`

### P2 — Important but not blocking

**[SEC-007] Bot endpoint URL not validated for SSRF**
- Risk: A user could register `http://169.254.169.254/...` (AWS metadata) or internal services as a bot endpoint
- Fix: Validate endpoint hostname against a blocklist of RFC-1918 ranges and known metadata endpoints before storing or calling
- File: `src/routes/bots.js`, `server.js` → `callBot()`

**[SEC-008] Concurrent join race condition**
- Risk: Two requests to join the same table with the same bot could both pass the "already seated" check before either commits
- Fix: Wrap the check+insert in a SQLite transaction with exclusive lock
- File: `server.js` join route

**[SEC-009] API key entropy**
- Current: `uid() + uid()` ≈ 22 chars of base36 ≈ ~113 bits of entropy. Acceptable.
- Fix: Switch to `crypto.randomBytes(32).toString('hex')` = 256 bits. Simple change, do it now.
- File: `src/db.js` → `createUser()`

**[SEC-010] No account lockout or key rotation**
- Risk: Compromised key has permanent access until manually revoked
- Fix: Add `POST /users/rotate-key` endpoint that invalidates old key and issues a new one

---

## Planned Controls (Not Yet Designed)

### Rate limiting architecture (`src/rateLimit.js`)
```
type Limiter = {
  key: string          // e.g. "ip:1.2.3.4" or "user:abc123"
  limit: number        // max requests
  windowMs: number     // rolling window
}
```
In-memory for now. Redis-backed when scaling beyond single process.

### HMAC bot payload signing
```
// At bot registration, generate webhook_secret
// On each turn:
const sig = HMAC-SHA256(JSON.stringify(payload), bot.webhook_secret)
payload.signature = sig
// Bot verifies before acting
```

### API key hashing
```
// Registration:
const rawKey = crypto.randomBytes(32).toString('hex')
const hashedKey = SHA256(rawKey)
store(hashedKey)          // in DB
return(rawKey)            // to user once, never again

// Auth:
const provided = SHA256(req.headers.authorization.split(' ')[1])
const user = db.getUserByHashedKey(provided)
```

### Input validation (`src/validate.js`)
All user-supplied fields should be validated before reaching the DB:
- `username`: alphanumeric + underscore, 2–32 chars
- `email`: basic RFC 5322 pattern
- `bot name`: alphanumeric + spaces + hyphens, 2–32 chars
- `endpoint`: must be HTTP/HTTPS, non-private IP

---

## Security Review Checklist (Before Public Launch)

- [x] SEC-001: API keys hashed in DB — SHA-256, implemented in `src/db.js`
- [x] SEC-002: Rate limiting — sliding window, implemented in `src/rateLimit.js`
- [ ] SEC-003: TLS via reverse proxy, HTTP redirects to HTTPS
- [ ] SEC-004: WS auth and publicState field scoping
- [ ] SEC-005: HMAC signing of bot payloads
- [x] SEC-006: Request body size limits — 64 KB max, implemented in `server.js`
- [ ] SEC-007: SSRF protection on bot endpoints
- [x] SEC-008: Atomic join — `BEGIN EXCLUSIVE` transaction, implemented in `src/db.js`
- [x] SEC-009: API key generation — `crypto.randomBytes(32)`, implemented in `src/db.js`
- [ ] SEC-010: Key rotation endpoint

---

## Implementation Notes

### Scheduled tournaments
`type: "scheduled"` tournaments now auto-start via a 30-second polling interval in `server.js`. If `scheduled_start_at` has passed and fewer than `min_players` have registered, the tournament is cancelled. The scheduler runs on `setInterval(...).unref()` so it doesn't prevent clean process shutdown.

---

## Dependency Security

Currently zero npm dependencies in production (using only Node built-ins). This is a significant security advantage — no supply chain risk from third-party packages. Maintain this as long as possible.

When dependencies are added, require:
- Pinned versions in `package.json`
- `npm audit` passing in CI
- Justification comment for each dependency
