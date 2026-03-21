/**
 * Responsive Layout Checker Engine
 * =================================
 *
 * Tests every page at every viewport and detects layout issues:
 * - Horizontal overflow
 * - Text truncation
 * - Touch target size
 * - Element visibility
 * - Layout breaks
 */

import {
  Bug,
  Viewport,
  generateBugId,
  STANDARD_VIEWPORTS,
} from "../orchestrator";

export interface ResponsiveCheck {
  type:
    | "overflow"
    | "truncation"
    | "touch_target"
    | "visibility"
    | "layout_break";
  element?: string;
  description: string;
  severity: Bug["severity"];
}

export interface ResponsiveTestResult {
  page: string;
  viewport: Viewport;
  checks: ResponsiveCheck[];
  bugs: Bug[];
  screenshot?: string;
}

/**
 * Elements that should never overflow
 */
export const OVERFLOW_SELECTORS = [
  "nav",
  "header",
  "main",
  "footer",
  ".card",
  ".table",
  ".modal",
];

/**
 * Elements that need minimum touch target size
 */
export const TOUCH_TARGET_SELECTORS = [
  "button",
  "a",
  "[role='button']",
  "input[type='checkbox']",
  "input[type='radio']",
  ".clickable",
];

/**
 * Critical elements that must always be visible
 */
export const CRITICAL_VISIBILITY = {
  "/": ["nav", "hero", "cta"],
  "/tables": ["nav", "table-list", "refresh-button"],
  "/tournaments": ["nav", "tournament-list", "filters"],
  "/bots": ["nav", "bot-list"],
  "/leaderboard": ["nav", "ranking-table"],
  "/game/:id": ["back-button", "poker-table", "status-badge"],
};

/**
 * Breakpoints where layout should change
 */
export const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  laptop: 1024,
  desktop: 1280,
};

/**
 * Generate AI instructions for responsive testing
 */
export function generateResponsiveTestInstructions(
  baseUrl: string,
  pages: string[],
  viewports: Viewport[] = STANDARD_VIEWPORTS,
): string {
  return `
# Responsive Layout Testing Instructions

## Configuration
- Base URL: ${baseUrl}
- Pages: ${pages.length}
- Viewports: ${viewports.length}
- Total Tests: ${pages.length * viewports.length}

## Test Matrix

### Pages to Test
${pages.map((p, i) => `${i + 1}. ${p}`).join("\n")}

### Viewports to Test
${viewports.map((v) => `- ${v.name}: ${v.width}x${v.height} (${v.deviceType})`).join("\n")}

## Execution Steps

For EACH page, do the following:

### Step 1: Desktop Baseline (1366x768)
\`\`\`
browser_resize width: 1366, height: 768
browser_navigate to: ${baseUrl}{page}
browser_take_screenshot filename: {page}-desktop-baseline.png
browser_snapshot to verify DOM structure
\`\`\`

### Step 2: Viewport Loop
For each viewport from largest to smallest:

\`\`\`
browser_resize width: {width}, height: {height}
Wait 500ms for reflow
browser_take_screenshot filename: {page}-{viewport}.png
\`\`\`

Check for issues:

#### A. Horizontal Overflow Detection
\`\`\`javascript
// Check if page has horizontal scroll
document.documentElement.scrollWidth > window.innerWidth
\`\`\`
If true → BUG: Horizontal overflow at {viewport}

#### B. Text Truncation
Look for text that is:
- Cut off mid-word
- Showing "..." but critical info hidden
- Overlapping other text

Example issues:
- "Leaderboard" → "Leader" (navigation)
- "OPEN REGISTRATION" → "OPEN REGIST" (stats)
- Player names that are unreadable

#### C. Touch Target Size (Mobile/Tablet only)
For viewports where touch: true:
- All buttons must be >= 44x44px
- Links must have adequate tap area
- Spacing between targets must prevent mis-taps

\`\`\`
browser_get_bounding_box for each button/link
Check: width >= 44 AND height >= 44
\`\`\`

#### D. Element Visibility
Verify critical elements are:
- Fully within viewport (not clipped)
- Not hidden by other elements
- Accessible via scrolling

#### E. Layout Break Detection
Watch for:
- Flex items overflowing container
- Grid items misaligned
- Cards stacking incorrectly
- Navigation breaking apart

### Step 3: Orientation Change (Tablets)
For tablet viewports, also test landscape:
\`\`\`
browser_resize width: 1180, height: 820  // iPad Air landscape
browser_take_screenshot filename: {page}-tablet-landscape.png
\`\`\`

## Bug Classification

| Issue | Severity | Example |
|-------|----------|---------|
| Nav completely broken | Critical | Can't navigate at all |
| Content off-screen | High | Important info hidden |
| Text unreadable | High | Can't understand content |
| Touch targets too small | Medium | Hard to tap |
| Minor overflow | Medium | Slight horizontal scroll |
| Cosmetic misalignment | Low | Spacing slightly off |

## Quick Viewport Tests

### Must-Pass Viewports (Core 6)
1. Desktop (1366x768) - Primary
2. Laptop (1280x800) - Common
3. Tablet (768x1024) - iPad
4. Mobile (375x667) - iPhone SE
5. Mobile Large (428x926) - iPhone 14 Pro Max
6. Fold (280x653) - Galaxy Fold

### Extended Tests (10 more)
- 4K, 1440p, 1080p (large screens)
- Surface Pro, iPad Pro (tablets)
- Pixel, Galaxy (Android)
- Ultra-wide, Tiny (edge cases)

## Output Format

For each viewport with issues:

\`\`\`markdown
### {page} at {viewport.name} ({width}x{height})

**Issues Found:**
1. [OVERFLOW] Page has 200px horizontal scroll
2. [TRUNCATION] Navigation "Leaderboard" shows as "Leader"
3. [TOUCH_TARGET] Button "Dismiss" is only 32x24px
4. [VISIBILITY] Stat cards partially clipped

**Screenshot:** {page}-{viewport}.png
\`\`\`

## Summary Report

After all tests, generate:

\`\`\`markdown
## Responsive Test Summary

| Viewport | Pages Tested | Issues Found |
|----------|--------------|--------------|
| Desktop  | 10           | 2            |
| Tablet   | 10           | 5            |
| Mobile   | 10           | 12           |
| Fold     | 10           | 18           |

### Most Problematic Viewports
1. Galaxy Fold (280px) - 18 issues
2. iPhone SE (375px) - 8 issues

### Most Problematic Pages
1. /tournaments - 12 issues
2. /bots - 8 issues

### Recommendations
1. Implement hamburger nav for mobile
2. Add responsive stat card layout
3. Test at 280px breakpoint
\`\`\`
`;
}

/**
 * State combinations to test at each viewport
 */
export const VIEWPORT_STATE_COMBINATIONS = [
  {
    page: "/game/:id",
    states: ["0_players", "2_players", "6_players", "9_players"],
  },
  {
    page: "/tournaments",
    states: ["empty", "few", "many", "loading", "error"],
  },
  { page: "/bots", states: ["no_bots", "few_bots", "many_bots"] },
  { page: "/leaderboard", states: ["empty", "populated"] },
];

/**
 * Detect responsive bugs from a DOM snapshot
 */
export function analyzeSnapshotForResponsiveBugs(
  snapshot: string,
  viewport: Viewport,
  page: string,
): Bug[] {
  const bugs: Bug[] = [];

  // This is a template - actual implementation would parse the snapshot
  // and detect issues programmatically

  // Check for truncation indicators
  if (snapshot.includes("...") || snapshot.includes("…")) {
    // Potential truncation - need to verify if it's acceptable
  }

  // Check for broken layout indicators in class names
  const layoutIssuePatterns = [
    /overflow-hidden/,
    /truncate/,
    /whitespace-nowrap/,
  ];

  // Mobile-specific checks
  if (viewport.deviceType === "mobile" && viewport.width < 400) {
    // Extra scrutiny for very small screens
  }

  return bugs;
}
