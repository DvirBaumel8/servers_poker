# Technical Debt & Future Improvements

This file tracks technical debt, security hardening items, and improvements to address before production deployment or scaling.

**Priority Levels:**
- 🔴 **Critical** - Must fix before production
- 🟠 **High** - Should fix soon after launch
- 🟡 **Medium** - Plan for next iteration
- 🟢 **Low** - Nice to have

---

## Security Hardening

### 🔴 Enforce HTTPS-Only Bot Endpoints
**Added:** 2026-03-20
**Context:** Currently allowing HTTP and localhost for bot endpoints to ease local development.
**Risk:** In production, HTTP endpoints expose game state and bot actions to interception. Localhost allows potential SSRF attacks.
**Action Required:**
- [ ] Add environment-based validation (`NODE_ENV=production`)
- [ ] Reject `http://` URLs in production (require `https://`)
- [ ] Block localhost, 127.0.0.1, and private IP ranges (10.x, 192.168.x, 172.16-31.x)
- [ ] Block cloud metadata endpoints (169.254.169.254)
- [ ] Add DNS resolution check before accepting endpoint

### 🔴 Require Email Verification Before Playing
**Added:** 2026-03-20
**Context:** Currently skipping email verification for developer convenience.
**Risk:** Allows spam registrations, fake accounts, harder to contact users about issues.
**Action Required:**
- [ ] Enable email verification flow for API registrations
- [ ] Bot cannot join games until email is verified
- [ ] Consider grace period (e.g., 1 game allowed before verification)

---

## Performance & Scaling

### 🟡 Redis for Session State
**Added:** 2026-03-20
**Context:** Currently using in-memory state for live games.
**Risk:** Cannot horizontally scale, all state lost on restart.
**Action Required:**
- [ ] Migrate game state to Redis
- [ ] Implement Redis pub/sub for multi-instance coordination

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

_(Move items here when done, with completion date)_
