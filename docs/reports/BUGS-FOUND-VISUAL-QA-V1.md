# Visual QA Simulation V1 - Bugs Found

**Date:** 2026-03-21
**Tester:** AI Agent (Cursor Claude)
**Test Duration:** ~10 minutes
**Pages Tested:** Home, Tables, Tournaments, Bots, Leaderboard, Game Table
**Viewports Tested:** Desktop (1366x768), Mobile (375x812), Galaxy Fold (280x653)
**Tool:** Browser MCP with screenshot automation

---

## Critical Bugs

### VIS-2: Cross-Port Navigation Bug
**Severity:** Critical
**Page:** Tables (scroll action)

**Issue:** Scrolling on tables page triggered navigation to `http://localhost:3002/register?redirectTo=%2Ftournaments` - a completely different port (3002 vs 3001).

**Expected:** Scrolling should never cause navigation, especially not cross-port.

**Root Cause Hypotheses:**
- Event handler on scroll detecting click incorrectly
- Link element positioned underneath scroll area
- Browser focus issue triggering link activation

**Impact:** Complete loss of user context. Critical UX failure.

---

## High Severity Bugs

### VIS-4: Mobile Navigation Truncation (375px)
**Severity:** High
**Page:** Tournaments
**Screenshot:** `tournaments-mobile-375.png`

**Issues:**
- "Leaderboard" displays as "Leader" (cut off)
- "9+" badge creates awkward spacing
- "OPEN REGISTRATION" shows as "REGISTRATIO"
- Stat card labels wrap to 3 lines ("MY ACTIVE BOTS")

**Expected:** Navigation should collapse to hamburger menu on mobile.

**CSS Fix Needed:** `@media (max-width: 768px)` rules for nav collapse.

---

### VIS-5: Galaxy Fold Layout Broken (280px)
**Severity:** High
**Page:** All pages
**Screenshot:** `tournaments-galaxy-fold-280.png`

**Issues:**
- "Bots" nav shows only "B"
- "Leaderboard" completely cut off (invisible)
- "BOT ARENA WORKSPACE" subtitle wraps incorrectly
- Stat cards completely unreadable
- No horizontal scroll available

**Expected:** Either proper small-screen layout or "Please rotate device" message.

**Impact:** App unusable on foldable phones in folded mode.

---

## Medium Severity Bugs

### VIS-9: Nav Badge Inconsistency (Appears/Disappears)
**Severity:** Medium
**Page:** Navigation bar

**Issue:** "Bots 9+" badge appears and disappears between page loads:
- Initial tables load: Badge present
- After navigation: Badge missing
- After bots page load: Badge returns

**Expected:** Consistent display based on actual bot count.

**Root Cause:** Badge data fetched asynchronously, not cached, may fail silently.

---

### VIS-10: Badge Positioning Over Text
**Severity:** Medium
**Page:** Bots (loaded state)

**Issue:** The "9+" badge overlaps "Bots" text rather than being positioned cleanly to the right.

**CSS Fix:** Adjust `position`, `margin-left`, or use flexbox with gap.

---

## Low Severity / Cosmetic

### VIS-11: Game Table Title Truncation
**Severity:** Low
**Page:** Game View with long ID

**Issue:** "Table #5879857c" shows truncated ID. Not ideal but acceptable.

**Enhancement:** Show just table name or first 8 chars of UUID.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Critical | 1 |
| High | 2 |
| Medium | 2 |
| Low | 1 |
| **Total** | **6** |

---

## Test Coverage Analysis

### What Was Tested
- [x] Page navigation
- [x] Mobile responsiveness (375px, 280px)
- [x] Error states (404 game)
- [x] Loading states
- [x] Auth error handling
- [x] Element visibility
- [x] Text truncation

### What Was NOT Tested (Gaps - Now Expanded)
- [ ] Game table WITH active players (overlap detection)
- [ ] 9-player full table layout
- [ ] Card/name overlap scenarios
- [ ] WebSocket real-time updates
- [x] Form validation - duplicate email issue was found and fixed via user report
- [ ] Dark/light mode (if applicable)
- [ ] Accessibility (keyboard nav, screen readers)
- [ ] Performance (load times, FPS)
- [ ] Memory leaks (long sessions)
- [ ] Network failure recovery
- [ ] Concurrent user scenarios
- [ ] SQL injection / XSS (security basics)
- [ ] Password strength validation
- [ ] Session timeout handling

---

## Recommendations

### Immediate (Fix This Week)
1. Fix cross-port navigation bug (VIS-2) - potential security issue

### Short-term (This Sprint)
1. Implement responsive navigation (VIS-4, VIS-5)
2. Add badge positioning CSS fix (VIS-10)

### Long-term (Infrastructure)
1. Expand visual testing framework to catch more bugs
2. Add Storybook visual regression
3. Implement automated viewport testing in CI

---

## Screenshots Captured

| File | Description |
|------|-------------|
| `tournaments-mobile-375.png` | Mobile nav truncation |
| `tournaments-galaxy-fold-280.png` | Galaxy Fold broken layout |
| `game-table-mobile-375x667.png` | Game table on mobile |
| `game-table-galaxy-fold-280.png` | Game table on tiny screen |
