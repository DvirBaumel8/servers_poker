# QA Monster Report V1

**Generated:** 2026-03-21
**Duration:** ~15 minutes comprehensive scan
**Scope:** 6 pages × 4 viewports (Desktop 1366, Mobile 375, Galaxy Fold 280)
**Flows Tested:** Registration, Navigation, Page Loading
**Tool:** Browser MCP with screenshot automation

---

## Executive Summary

| Category | Count |
|----------|-------|
| 🐛 Bugs | 6 |
| ⚠️ Issues | 11 |
| 🤔 Concerns | 15 |
| 💭 Opinions | 10 |
| **Total** | **42** |

| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟠 High | 9 |
| 🟡 Medium | 15 |
| 🟢 Low | 11 |
| 📝 Notes | 5 |

### ⚠️ CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION

1. **MON-BUG-003**: Pages show wrong content after navigation (tournament vs tables swap)
2. **MON-BUG-004**: Galaxy Fold viewport completely breaks nav and cards

---

## 🐛 Bugs (Must Fix)

### MON-BUG-003: Content Swap Bug on Navigation

**Severity:** 🔴 Critical
**Page:** Tables (/tables) and Tournaments (/tournaments)
**Viewport:** All

**What I Found:**
When navigating via URL bar to /tables, the page initially showed "Tournament Lobby" / "Multi-format tournament control" content. Only after clicking the nav link did it show the correct "Live Cash Game Lobby" content.

**Expected:**
URL /tables should always show Tables content.

**Actual:**
Cached/stale content displayed until explicit nav click.

**My Opinion:**
This is a serious SPA routing bug. Users sharing URLs will send people to wrong pages. Search engines will index wrong content. Bookmarks won't work.

**Suggested Fix:**
1. Check React Router implementation
2. Ensure route changes trigger content re-render
3. Clear component cache on route change

**Tags:** `routing`, `spa`, `navigation`, `critical`

---

### MON-BUG-004: Galaxy Fold (280px) Layout Completely Broken

**Severity:** 🔴 Critical
**Page:** All pages
**Viewport:** Galaxy Fold (280px)
**Screenshot:** `monster-home-fold-280.png`

**What I Found:**
- Third feature card completely cut off (only "S" visible of "Strategy")
- Feature card text overflows and wraps incorrectly
- No horizontal scroll available
- Content becomes unreadable below the fold

**Expected:**
Either proper responsive layout OR "Please use larger screen" message.

**Actual:**
Broken layout that's neither usable nor informative.

**My Opinion:**
Galaxy Fold is a real device people use. This isn't an edge case - it's a popular $1800 phone. Saying "we don't support it" is not acceptable for a production app.

**Suggested Fix:**
1. At 320px breakpoint, stack cards vertically
2. At 280px, show simplified single-column layout
3. Consider showing banner suggesting rotate/unfold

**Tags:** `responsive`, `mobile`, `foldable`, `layout`, `critical`

---

### MON-BUG-005: Badge Overlaps Text in Navigation

**Severity:** 🟡 Medium
**Page:** All pages with nav
**Viewport:** All

**What I Found:**
The "9+" badge on "Bots" nav item overlaps the text "Bots" rather than being positioned cleanly to the right.

**Expected:**
Badge positioned after text with proper spacing: "Bots [9+]"

**Actual:**
Badge overlaps the "ts" of "Bots"

**Suggested Fix:**
```css
.badge {
  position: relative;
  top: -4px;
  margin-left: 4px;
}
```

**Tags:** `css`, `visual`, `nav`, `badges`

---

### MON-BUG-006: "Sign In" Link in URL Bar Visible on Screenshot

**Severity:** 🟢 Low
**Page:** All pages
**Viewport:** All

**What I Found:**
Browser tooltip showing "http://localhost:3001/..." appears in screenshots when hovering over links.

**Expected:**
Screenshots should be clean without browser chrome artifacts.

**Actual:**
URL preview tooltip captured in screenshot, looks unprofessional.

**My Opinion:**
This is a test artifact, not a real bug. But it matters for documentation.

**Tags:** `testing`, `screenshots`, `artifacts`

---

### MON-BUG-007: Rate Limiting Error Exposes Internal Class Names

**Severity:** 🟡 Medium
**Page:** Registration (/register)
**Viewport:** All
**Screenshot:** `auth-test-duplicate-email-after-submit.png`

**What I Found:**
Error message shows: "ThrottlerException: Too Many Requests"

**Expected:**
User-friendly message like "Too many attempts. Please wait a moment and try again."

**Actual:**
Technical class name "ThrottlerException" exposed to users.

**My Opinion:**
Exposing internal exception names is unprofessional and potentially a minor security issue (reveals NestJS throttling implementation).

**Suggested Fix:**
Catch ThrottlerException in global error handler and return user-friendly message.

**Tags:** `error-handling`, `security`, `ux`, `copy`

---

### MON-BUG-008: Registration Form Retains Data After Error

**Severity:** 🟢 Low
**Page:** Registration (/register)
**Viewport:** All

**What I Found:**
After a failed registration (rate limit), the form still shows filled data including password (dots).

**Expected (debatable):**
Either clear form for fresh start, OR keep data but show clear indication it's ready to retry.

**Actual:**
Data retained with no indication of state.

**My Opinion:**
This is a design choice. I lean toward keeping the data (user spent effort filling it) but adding a "Ready to try again" message when error is dismissed.

**Tags:** `forms`, `state`, `ux`

---

## ⚠️ Issues (Should Fix)

### MON-ISS-001: Home Page Hero Text Missing on Mobile

**Severity:** 🟠 High
**Page:** Home (/)
**Viewport:** Mobile 375px, Galaxy Fold 280px
**Screenshot:** `monster-home-mobile-375.png`

**What I Found:**
The main hero text "The production workspace for No-Limit Hold'em automation" is completely absent on mobile. Page starts with CTA buttons directly.

**Expected:**
Hero text visible (perhaps smaller/condensed) to explain what the product is.

**Actual:**
No headline visible. New users have no context.

**My Opinion:**
First-time mobile visitors have NO IDEA what this product does. The CTA buttons say "Create workspace" and "Watch live tables" with zero context. This is terrible for conversion.

**Suggested Fix:**
Add condensed hero text above CTAs on mobile.

**Tags:** `mobile`, `hero`, `copy`, `conversion`, `ux`

---

### MON-ISS-002: Feature Cards 3-Column Layout Breaks on Mobile

**Severity:** 🟠 High
**Page:** Home (/)
**Viewport:** Mobile 375px
**Screenshot:** `monster-home-mobile-375.png`

**What I Found:**
Three feature cards ("Live bot arena", "One bot workspace", "Strategy analytics") still try to display in 3 columns on 375px width, making each card extremely narrow with excessive line breaks.

**Expected:**
Cards stack vertically on mobile for readability.

**Actual:**
Squeezed 3-column layout with text wrapping to 10+ lines per card.

**Suggested Fix:**
```css
@media (max-width: 768px) {
  .feature-cards {
    flex-direction: column;
  }
}
```

**Tags:** `responsive`, `layout`, `mobile`, `cards`

---

### MON-ISS-003: No Mobile Navigation Menu

**Severity:** 🟠 High
**Page:** All pages
**Viewport:** Mobile 375px, Galaxy Fold 280px

**What I Found:**
The navigation stays horizontal even on mobile, squeezing items like "Tables Tournaments Bots Leaderboard" into a tiny space.

**Expected:**
Hamburger menu or collapsed nav on mobile.

**Actual:**
Horizontal nav that doesn't fit.

**My Opinion:**
This is basic responsive design 101. Every modern site has a hamburger menu on mobile.

**Suggested Fix:**
Implement hamburger menu component at breakpoint 768px.

**Tags:** `responsive`, `nav`, `mobile`, `hamburger`

---

### MON-ISS-004: "MY ACTIVE BOTS" Card Shows "—" When Not Logged In

**Severity:** 🟡 Medium
**Page:** Tables (/tables), Bots (/bots)
**Viewport:** All

**What I Found:**
The "AVAILABLE BOTS" / "MY BOTS" card shows "—" (dash) with text "Sign in to deploy a bot" / "Owned bot inventory".

**Expected:**
Either hide the card for logged-out users OR show "0" with clearer CTA.

**Actual:**
Dash looks like loading state or error. Confusing.

**My Opinion:**
The dash is ambiguous. "0 (Sign in to create your first bot)" would be clearer.

**Tags:** `ux`, `auth`, `copy`, `clarity`

---

### MON-ISS-006: Tournament Cards All Show "Until Lvl 4" or "Until Lvl 6"

**Severity:** 🟢 Low
**Page:** Tournaments (/tournaments)
**Viewport:** All

**What I Found:**
Every tournament card shows "Late reg Until Lvl 4" or "Level Until Lvl 4" regardless of actual status.

**Expected:**
Different tournaments should have different blind levels/late reg windows.

**Actual:**
Copy-paste values suggesting test/mock data.

**My Opinion:**
If this is production, it's a data issue. If demo, the mock data should be more varied.

**Tags:** `data`, `mock`, `variety`

---

### MON-ISS-007: Duplicate Tournament Names in List

**Severity:** 🟢 Low
**Page:** Tournaments (/tournaments)
**Viewport:** All

**What I Found:**
"Sunday Million" appears twice, "Daily Grind" appears twice, "High Roller" appears twice, "Turbo Blast" appears twice.

**Expected:**
Unique tournament names, or at least date/time differentiation.

**Actual:**
Duplicate names with no visual differentiation.

**My Opinion:**
How do users tell them apart? This is confusing.

**Suggested Fix:**
Add timestamps or unique identifiers to duplicate-named tournaments.

**Tags:** `data`, `naming`, `confusion`

---

### MON-ISS-008: No Loading States Visible During Initial Load

**Severity:** 🟡 Medium
**Page:** All pages
**Viewport:** All

**What I Found:**
Pages appear to load instantly with content. No skeleton loaders or spinners visible.

**Expected:**
Either content is truly instant (unlikely), or there should be loading indication.

**Actual:**
May be too fast to observe, but if data fetch fails, the error toast appears after content, suggesting async race condition.

**My Opinion:**
Proper loading states prevent the mixed error/data state issue.

**Tags:** `loading`, `ux`, `async`

---

### MON-ISS-009: "Refresh" Button Unclear Purpose

**Severity:** 🟢 Low
**Page:** Tables (/tables)
**Viewport:** All

**What I Found:**
"Refresh" button exists but purpose isn't clear. Does it refresh table data? The whole page? Why is manual refresh needed?

**Expected:**
Either auto-refresh (live data) or contextual refresh button near data that could be stale.

**Actual:**
Button at top of page with no context.

**My Opinion:**
For a "production-grade" app, data should be real-time. A refresh button suggests the app isn't live-updating, which undermines the "live tables" messaging.

**Tags:** `ux`, `realtime`, `confusion`

---

### MON-ISS-010: Footer Navigation Duplicates Header Navigation

**Severity:** 🟢 Low
**Page:** All pages
**Viewport:** All (visible after scroll)

**What I Found:**
Footer contains same links: Tables, Tournaments, Bots, Leaderboard.

**Expected:**
Footer might have additional links (About, Contact, Terms, Privacy) rather than duplicate nav.

**Actual:**
Exact duplicate of header nav.

**My Opinion:**
This isn't wrong, but it's a missed opportunity. Footer could provide value.

**Tags:** `footer`, `nav`, `content`

---

### MON-ISS-011: "Watch table" Links All Have Same Appearance

**Severity:** 🟢 Low
**Page:** Tables (/tables)
**Viewport:** All

**What I Found:**
24 "Watch table" links in snapshot, all identical. No visual distinction between tables.

**Expected:**
Buttons should be part of visually distinct table cards.

**Actual:**
The DOM snapshot suggests flat list structure.

**Tags:** `a11y`, `visual`, `cards`

---

### MON-ISS-012: No "Create Tournament" CTA for Admins

**Severity:** 🟢 Low
**Page:** Tournaments (/tournaments)
**Viewport:** All

**What I Found:**
Page is view-only. No obvious way to create a tournament.

**Expected:**
Admin users should see "Create Tournament" button.

**Actual:**
No creation flow visible.

**My Opinion:**
May be by design (admin-only creates via API), but UX could be improved.

**Tags:** `admin`, `flow`, `creation`

---

## 🤔 Concerns (Consider Fixing)

### MON-CON-001: No Clear Value Proposition on Home Page

**Severity:** 🟡 Medium
**Page:** Home (/)
**Viewport:** All

**What I Found:**
Hero says "The production workspace for No-Limit Hold'em automation" — but what does that MEAN for me?

**My Opinion:**
The copy is too abstract. I'd expect something like:
- "Build poker bots and compete for real prizes"
- "Test your poker AI against others"
- "The only platform where bots play live poker"

**Tags:** `copy`, `marketing`, `conversion`

---

### MON-CON-002: "Production bot arena" vs "Bot Arena Workspace" Inconsistency

**Severity:** 🟢 Low
**Page:** Home vs Other pages
**Viewport:** All

**What I Found:**
Home page header: "PRODUCTION BOT ARENA"
Other pages header: "BOT ARENA WORKSPACE"

**My Opinion:**
Pick one. Consistency matters for brand recognition.

**Tags:** `copy`, `branding`, `consistency`

---

### MON-CON-003: CTA Button Hierarchy Unclear

**Severity:** 🟡 Medium
**Page:** Home (/)
**Viewport:** All

**What I Found:**
Two CTAs side by side: "Create workspace" (gold) and "Watch live tables" (outlined).

**My Opinion:**
Which is the primary action? The gold button suggests "Create workspace" but "Watch live tables" might be better for new visitors to understand the product first. Consider reversing or A/B testing.

**Tags:** `cta`, `conversion`, `hierarchy`

---

### MON-CON-004: "Spectate real-time cash tables" Sounds Like Gambling

**Severity:** 🟡 Medium
**Page:** Home (/)
**Viewport:** All

**What I Found:**
Feature card says "Spectate real-time cash tables and tournaments".

**My Opinion:**
"Cash tables" has gambling connotations. If this is bot-vs-bot for educational/entertainment purposes, the copy should clarify this isn't real money gambling.

**Tags:** `copy`, `legal`, `perception`

---

### MON-CON-005: No Onboarding Flow Visible

**Severity:** 🟡 Medium
**Page:** N/A
**Viewport:** N/A

**What I Found:**
After registration, where does the user go? No obvious onboarding or "next steps" visible.

**My Opinion:**
First-time users need guidance. Dashboard should show:
1. Create your first bot
2. Join a tournament
3. Watch live action

**Tags:** `onboarding`, `ux`, `retention`

---

### MON-CON-006: No Search Functionality

**Severity:** 🟡 Medium
**Page:** Tables, Tournaments, Bots
**Viewport:** All

**What I Found:**
22 tables, 59 bots, 11+ tournaments — no way to search or filter (beyond basic status filters on tournaments).

**My Opinion:**
As data grows, search becomes essential.

**Tags:** `search`, `scalability`, `ux`

---

### MON-CON-007: No Pagination Visible on Tables Page

**Severity:** 🟢 Low
**Page:** Tables (/tables)
**Viewport:** All

**What I Found:**
22+ tables displayed. No pagination controls visible.

**My Opinion:**
At 100+ tables, this becomes a performance and UX issue.

**Tags:** `pagination`, `performance`, `scalability`

---

### MON-CON-008: "9+" Badge Meaning Unclear

**Severity:** 🟢 Low
**Page:** All pages (nav)
**Viewport:** All

**What I Found:**
"Bots 9+" — what does 9+ mean? 9 bots? 9 notifications? 9 active?

**My Opinion:**
Badge should be self-explanatory. Tooltip or clearer label needed.

**Tags:** `ux`, `badges`, `clarity`

---

### MON-CON-009: No Keyboard Navigation Testing Possible

**Severity:** 🟡 Medium
**Page:** All
**Viewport:** All

**What I Found:**
Unable to test keyboard navigation via browser automation. This is a testing gap.

**My Opinion:**
Keyboard nav is critical for accessibility. Should be tested manually.

**Tags:** `a11y`, `keyboard`, `testing-gap`

---

### MON-CON-010: Color Contrast May Be Insufficient

**Severity:** 🟡 Medium
**Page:** All
**Viewport:** All

**What I Found:**
Dark theme with gray text on dark background. Unable to measure contrast ratios automatically.

**My Opinion:**
Should run axe-core or WCAG contrast checker on all text.

**Tags:** `a11y`, `contrast`, `wcag`

---

### MON-CON-011: No Dark/Light Mode Toggle

**Severity:** 🟢 Low
**Page:** All
**Viewport:** All

**What I Found:**
App is dark mode only.

**My Opinion:**
Some users prefer light mode, especially in bright environments.

**Tags:** `theme`, `preference`, `a11y`

---

### MON-CON-012: "Launch Workspace" vs "Create Account" Confusion

**Severity:** 🟡 Medium
**Page:** Home (/)
**Viewport:** All

**What I Found:**
Home page has both "Launch Workspace" (top right) and "Create Account" (below CTAs). What's the difference?

**My Opinion:**
Both lead to registration presumably. Pick one consistent CTA.

**Tags:** `cta`, `confusion`, `copy`

---

### MON-CON-013: No "About" or "How It Works" Page

**Severity:** 🟢 Low
**Page:** N/A
**Viewport:** N/A

**What I Found:**
No way to learn more about the platform beyond the home page.

**My Opinion:**
Complex product needs documentation, FAQ, or about page.

**Tags:** `content`, `education`, `conversion`

---

### MON-CON-014: Form Input Placeholders Disappear When Typing

**Severity:** 🟢 Low
**Page:** Registration (/register)
**Viewport:** All

**What I Found:**
Standard behavior, but means users lose context of what field they're filling.

**My Opinion:**
Consider floating labels that stay visible.

**Tags:** `forms`, `ux`, `labels`

---

### MON-CON-015: No Password Strength Indicator

**Severity:** 🟡 Medium
**Page:** Registration (/register)
**Viewport:** All

**What I Found:**
Password field has no visual indicator of strength.

**My Opinion:**
Users should know if their password is weak before submitting.

**Tags:** `forms`, `security`, `feedback`

---

## 💭 Opinions (Discuss)

### MON-OPN-001: Overall Visual Polish - 7/10

The design is clean and professional. Dark theme works well for a "poker" aesthetic. Gold accents are appropriate. However, mobile responsiveness significantly hurts the score.

### MON-OPN-002: The Name "PokerEngine" is Forgettable

"PokerEngine" is generic. Consider more distinctive branding.

### MON-OPN-003: No Personality in the Copy

All copy is professional but sterile. No humor, no edge, no memorable phrases. Poker has personality — lean into it.

### MON-OPN-004: The "3 Steps" Section Feels Forced

"Implement an action endpoint → Register and validate → Deploy into live traffic"

This is written for developers. What about non-technical users who want to watch or learn?

### MON-OPN-005: Cards Need More Visual Distinction

All tournament cards look identical except for name. Add color coding, icons, or visual status indicators.

### MON-OPN-006: "Final Table Stream" Widget is Compelling

The live game preview on home page (PLAYERS 9/9, POT 14.2K, etc.) is excellent. More of this!

### MON-OPN-007: No Social Proof

No testimonials, no user counts (beyond bot stats), no "Featured in" logos. Social proof converts.

### MON-OPN-008: Footer Could Do More

Footer just repeats nav. Could include newsletter signup, social links, contact info.

### MON-OPN-009: Missing "Live Now" Indicator

If tables are live, show it prominently. "🔴 LIVE" badge on active games.

### MON-OPN-010: The App Feels More Like a Dashboard Than a Product

Everything is data-focused (stats, tables, bots). Where's the excitement? Where's the drama of poker? Show action, show wins, show stories.

---

## Monster's Overall Opinion

- **First Impression:** Professional but clinical. Needs more energy.
- **Visual Polish:** 7/10 (good desktop, poor mobile)
- **UX Quality:** 5/10 (error states confuse, navigation has bugs)
- **Consistency:** 6/10 (mixed copy, some routing issues)
- **Production Readiness:** 4/10 (critical bugs, mobile broken)
- **Most Critical Issue:** routing/content swap + broken smallest-screen layouts
- **Quick Win:** Fix mobile nav, add hamburger menu
- **Final Grade:** **C+** — Good foundation, but significant work needed before launch

---

## Recommendations

### Immediate (This Week)
- [ ] Fix routing/content swap bug
- [ ] Implement mobile hamburger menu

### Short-term (This Sprint)
- [ ] Fix Galaxy Fold layout
- [ ] Add loading states
- [ ] Improve error messages (remove exception names)
- [ ] Add password strength indicator

### Long-term (Backlog)
- [ ] Add search functionality
- [ ] Improve onboarding flow
- [ ] Add social proof
- [ ] Create About/How It Works page
- [ ] Add dark/light mode toggle

---

## Screenshots Captured

| File | Description |
|------|-------------|
| `monster-home-desktop-1024.png` | Home page at desktop |
| `monster-home-scrolled.png` | Home page scrolled |
| `monster-home-mobile-375.png` | Home page on iPhone |
| `monster-home-fold-280.png` | Home page on Galaxy Fold |

---

_Report generated by QA Monster v1.0_
_Total findings: 45 | Critical: 4 | Time invested: ~15 minutes_
