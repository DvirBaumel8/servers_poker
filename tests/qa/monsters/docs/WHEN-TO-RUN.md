# When Does the Monster Run?

## Current State

| Trigger | Monster Runs? | Blocks Merge? | Details |
|---------|--------------|---------------|---------|
| Developer manually | ✅ Yes | N/A | `npm run qa:monster` |
| Pre-commit hook | ✅ Yes | No (reminder) | `.husky/pre-commit` |
| PR opened | ✅ Yes | **YES if critical** | On open + ready_for_review |
| PR updated | ✅ Yes | **YES if critical** | On synchronize (new commits) |
| Nightly scan | ✅ Yes | N/A | 2 AM UTC daily |

## Merge Blocking Rules

| Condition | Merge Allowed? |
|-----------|----------------|
| Critical issues exist in report | ❌ **BLOCKED** |
| New pages without coverage | ⚠️ Warning only |
| All checks pass | ✅ Allowed |

## PR Workflow Optimizations

- **Runs once per update**, not per commit (uses `concurrency` to cancel in-progress)
- **Skips draft PRs** (only runs when ready for review)
- **Updates existing comment** instead of creating new ones
- **Cancels previous runs** when new commits are pushed

## Recommended Triggers

### 1. Pre-PR (Developer Responsibility)
```bash
# Before creating PR, developer runs:
npm run qa:monster:quick
```
**Status:** Manual, documented in CONTRIBUTING.md

### 2. CI Pipeline (Automated)
When a PR is opened, CI should:
1. Build the app
2. Start backend + frontend
3. Run monster quick scan
4. Post findings as PR comment

**Status:** Need to implement

### 3. Nightly Full Scan (Scheduled)
Every night at 2am:
1. Run full monster scan on main branch
2. Generate report
3. Create issue if critical bugs found
4. Send notification

**Status:** Need to implement

### 4. Post-Deploy Check (Production)
After each deploy to staging/production:
1. Run smoke test (critical flows only)
2. Verify pages load
3. Check for console errors

**Status:** Need to implement

---

## Implementation Status

### ✅ Phase 1: GitHub Actions for PR
- `.github/workflows/qa-monster.yml` created
- Runs coverage check on every PR to main
- Posts coverage report as PR comment
- Requires manual checkbox confirmation before merge

### ✅ Phase 2: Nightly Scan
- Scheduled at 2 AM UTC daily via GitHub Actions
- Generates full monster instructions
- Uploads as artifact for review

### ✅ Phase 3: Pre-commit Hook
- `.husky/pre-commit` updated
- Shows reminder when page files are modified
- Non-blocking (reminder only, doesn't fail commit)

### 🔜 Phase 4: Post-Deploy (Future)
- Integrate with deployment pipeline
- Run smoke tests after deploy
- Alert on failure

---

## Issue Lifecycle (Preventing Accumulation)

```
Finding discovered
       ↓
┌──────────────────────────────────────────┐
│ Critical/High → GitHub Issue auto-created │
│ Medium/Low → Logged, triaged weekly       │
└──────────────────────────────────────────┘
       ↓
Week 1: Assigned to owner
       ↓
Week 2: No progress → Reminder comment added
       ↓
Week 3+: Marked "stale", team notified
       ↓
Fixed → PR merged → Issue closed
```

### What Happens Automatically

| Action | When | Who |
|--------|------|-----|
| Issue created | Nightly scan finds Critical/High | Bot |
| Stale label added | Issue > 2 weeks old | Bot (Mondays) |
| Reminder comment | Issue goes stale | Bot |
| PR blocked | Critical issue in report | Bot |

### Preventing Warning Accumulation

1. **Auto-create issues** for High severity (not just Critical)
2. **Weekly stale check** comments on old issues
3. **Nightly scan** catches regressions
4. **Sprint planning** includes QA backlog review

See `tests/qa-monster/OWNERSHIP.md` for full ownership rules.

---

## Quick Commands Reference

```bash
# Full scan (10-15 min) - for thorough review
npm run qa:monster

# Quick scan (2-5 min) - before PR
npm run qa:monster:quick

# Check if your new page has coverage
npm run qa:coverage:check /your-page

# See all coverage
npm run qa:coverage
```
