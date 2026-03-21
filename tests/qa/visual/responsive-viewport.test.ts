/**
 * Responsive Viewport Tests
 * =========================
 *
 * Test the application at various screen sizes to ensure:
 * - Layout adapts properly
 * - Elements remain visible and accessible
 * - No content overflow or clipping
 * - Touch targets are adequate on mobile
 */

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  deviceType: "desktop" | "tablet" | "mobile";
  orientation?: "portrait" | "landscape";
  userAgent?: string;
  touch?: boolean;
}

/**
 * Standard device viewports for testing
 */
export const DEVICE_VIEWPORTS: ViewportConfig[] = [
  // Desktop
  { name: "desktop-4k", width: 3840, height: 2160, deviceType: "desktop" },
  { name: "desktop-1440p", width: 2560, height: 1440, deviceType: "desktop" },
  { name: "desktop-1080p", width: 1920, height: 1080, deviceType: "desktop" },
  { name: "desktop-standard", width: 1366, height: 768, deviceType: "desktop" },
  { name: "laptop-13", width: 1280, height: 800, deviceType: "desktop" },

  // Tablet
  {
    name: "ipad-pro-12.9",
    width: 1024,
    height: 1366,
    deviceType: "tablet",
    orientation: "portrait",
    touch: true,
  },
  {
    name: "ipad-pro-12.9-landscape",
    width: 1366,
    height: 1024,
    deviceType: "tablet",
    orientation: "landscape",
    touch: true,
  },
  {
    name: "ipad-air",
    width: 820,
    height: 1180,
    deviceType: "tablet",
    orientation: "portrait",
    touch: true,
  },
  {
    name: "ipad-air-landscape",
    width: 1180,
    height: 820,
    deviceType: "tablet",
    orientation: "landscape",
    touch: true,
  },
  {
    name: "surface-pro",
    width: 912,
    height: 1368,
    deviceType: "tablet",
    orientation: "portrait",
    touch: true,
  },

  // Mobile
  {
    name: "iphone-14-pro-max",
    width: 430,
    height: 932,
    deviceType: "mobile",
    orientation: "portrait",
    touch: true,
  },
  {
    name: "iphone-14",
    width: 390,
    height: 844,
    deviceType: "mobile",
    orientation: "portrait",
    touch: true,
  },
  {
    name: "iphone-se",
    width: 375,
    height: 667,
    deviceType: "mobile",
    orientation: "portrait",
    touch: true,
  },
  {
    name: "pixel-7",
    width: 412,
    height: 915,
    deviceType: "mobile",
    orientation: "portrait",
    touch: true,
  },
  {
    name: "galaxy-s21",
    width: 360,
    height: 800,
    deviceType: "mobile",
    orientation: "portrait",
    touch: true,
  },
  {
    name: "galaxy-fold",
    width: 280,
    height: 653,
    deviceType: "mobile",
    orientation: "portrait",
    touch: true,
  },
];

/**
 * Pages to test at each viewport
 */
export const PAGES_TO_TEST = [
  {
    name: "Home",
    path: "/",
    criticalElements: ["navigation", "hero-section", "game-list"],
    mobileSpecific: ["hamburger-menu", "bottom-nav"],
  },
  {
    name: "Tournaments",
    path: "/tournaments",
    criticalElements: ["tournament-list", "filters", "pagination"],
    mobileSpecific: ["filter-modal", "swipe-actions"],
  },
  {
    name: "Game Table",
    path: "/game/:id",
    criticalElements: [
      "poker-table",
      "player-seats",
      "action-buttons",
      "pot-display",
    ],
    mobileSpecific: ["action-drawer", "landscape-prompt"],
    minWidth: 375, // Game table may not work below this
  },
  {
    name: "Leaderboard",
    path: "/leaderboard",
    criticalElements: ["ranking-table", "search", "filters"],
    mobileSpecific: ["horizontal-scroll-table"],
  },
  {
    name: "Profile",
    path: "/profile/:id",
    criticalElements: ["avatar", "stats", "history"],
    mobileSpecific: ["tab-navigation"],
  },
  {
    name: "Login",
    path: "/login",
    criticalElements: ["email-input", "password-input", "submit-button"],
    mobileSpecific: ["keyboard-aware-layout"],
  },
];

/**
 * Responsive issues to check
 */
export const RESPONSIVE_CHECKS = {
  horizontalOverflow: {
    description: "Content overflows horizontally causing horizontal scroll",
    severity: "major",
    check: "document.documentElement.scrollWidth > window.innerWidth",
  },
  textTooSmall: {
    description: "Text is smaller than readable minimum (12px on mobile)",
    severity: "major",
    minFontSize: { desktop: 14, tablet: 13, mobile: 12 },
  },
  touchTargetTooSmall: {
    description: "Interactive elements smaller than 44x44px on touch devices",
    severity: "major",
    minSize: 44,
  },
  overlapAtBreakpoint: {
    description: "Elements overlap that shouldn't at this breakpoint",
    severity: "critical",
  },
  missingResponsiveImage: {
    description: "Images don't scale properly",
    severity: "minor",
  },
  brokenLayout: {
    description: "Layout appears broken (flex items overflow, grid breaks)",
    severity: "critical",
  },
  hiddenCriticalElement: {
    description: "Critical element is hidden or off-screen",
    severity: "critical",
  },
  unreadableContrast: {
    description: "Text contrast insufficient for mobile viewing",
    severity: "major",
  },
};

/**
 * AI Instructions for Responsive Testing
 */
export function generateResponsiveTestInstructions(
  baseUrl: string = "http://localhost:3001",
): string {
  return `
# Responsive Viewport Test Instructions

## Overview
Test the poker application at various screen sizes to find responsive design issues.

## Test Matrix

### Viewports to Test
${DEVICE_VIEWPORTS.map((v) => `- ${v.name}: ${v.width}x${v.height} (${v.deviceType})`).join("\n")}

### Pages to Test
${PAGES_TO_TEST.map((p) => `- ${p.name}: ${p.path}`).join("\n")}

## Procedure for Each Page/Viewport Combination

### Step 1: Setup Viewport
\`\`\`
browser_resize with width: {width}, height: {height}
\`\`\`

### Step 2: Navigate to Page
\`\`\`
browser_navigate to: ${baseUrl}{path}
Wait for page load
\`\`\`

### Step 3: Take Screenshot
\`\`\`
browser_take_screenshot with filename: {page}-{viewport}.png
\`\`\`

### Step 4: Check for Issues

#### A. Horizontal Overflow
- Look for horizontal scrollbar
- Check if content extends beyond viewport
- Run: \`document.documentElement.scrollWidth > window.innerWidth\`

#### B. Element Visibility
- Use browser_snapshot to get all elements
- Check critical elements are present
- Check no elements have display: none that shouldn't

#### C. Touch Targets (Mobile/Tablet)
- Get bounding boxes of interactive elements
- Verify minimum 44x44px size
- Check adequate spacing between targets

#### D. Text Readability
- Check font sizes >= 12px on mobile
- Verify line heights are adequate
- Check text isn't truncated beyond readability

#### E. Layout Integrity
- Check flex/grid layouts aren't broken
- Verify spacing is consistent
- Check images scale properly

### Step 5: Document Issues

For each issue found:
- Screenshot showing the problem
- Viewport where it occurs
- Element reference
- Severity assessment

## Critical Areas for Game Table

The poker table is the most complex component. Pay special attention to:

### Desktop (1366+)
- All 9 player seats visible
- Clear spacing between players
- Full chip stacks visible
- Action buttons accessible

### Tablet (768-1024)
- Consider showing fewer seats
- Action buttons at bottom
- May need scrolling for full table

### Mobile (320-428)
- Game table may not be fully supported
- Should show graceful degradation or "rotate device" message
- Essential info (pot, your cards, action buttons) must be visible

## Specific Breakpoint Tests

### 1024px (Tablet Landscape)
Common breakpoint - check:
- Navigation changes from full to hamburger?
- Game table still renders 9 players?
- Modal dialogs fit screen?

### 768px (Tablet Portrait)  
- Layout should shift to single column
- Tables should become scrollable or cards
- Player seats may reduce to 6?

### 375px (Mobile)
- All navigation in hamburger/bottom nav
- Content in single column
- Large touch targets
- Game table: show landscape prompt or simplified view

## Report Format

\`\`\`markdown
## Responsive Test Report

### Summary
- Viewports tested: X
- Pages tested: Y  
- Issues found: Z

### Critical Issues
[List any layout breaks or unusable states]

### Major Issues
[List readability/usability issues]

### Minor Issues
[List cosmetic issues]

### Screenshots
[Reference to screenshots taken]
\`\`\`
`;
}

/**
 * Test scenarios for AI to execute
 */
export const RESPONSIVE_TEST_SCENARIOS = [
  {
    name: "Desktop to Mobile Cascade",
    description: "Test page at progressively smaller sizes",
    steps: [
      "Start at 1920x1080",
      "Screenshot",
      "Reduce to 1366x768",
      "Screenshot and check for changes",
      "Reduce to 1024x768",
      "Screenshot and check for tablet adaptations",
      "Reduce to 768x1024 (tablet portrait)",
      "Screenshot and check for layout shift",
      "Reduce to 375x667 (mobile)",
      "Screenshot and check for mobile layout",
    ],
  },
  {
    name: "Game Table Responsive Check",
    description: "Specific test for poker table at various sizes",
    steps: [
      "Navigate to game table",
      "Test at 1920x1080 - verify all 9 players visible",
      "Test at 1366x768 - verify layout works",
      "Test at 1024x768 - check for any crowding",
      "Test at 768x1024 - verify playable",
      "Test at 428x926 - check mobile experience",
    ],
    focusOn: ["player-overlap", "action-buttons", "pot-visibility"],
  },
  {
    name: "Orientation Change",
    description: "Test tablet/mobile in both orientations",
    steps: [
      "Navigate to game table",
      "Test at 820x1180 (iPad Air portrait)",
      "Screenshot",
      "Test at 1180x820 (iPad Air landscape)",
      "Screenshot and compare",
      "Verify layout adapts appropriately",
    ],
  },
  {
    name: "Extreme Sizes",
    description: "Test at edge case viewport sizes",
    steps: [
      "Test at minimum mobile (280x568)",
      "Check for graceful degradation",
      "Test at 4K (3840x2160)",
      "Check for proper scaling",
      "Test at ultra-wide (2560x1080)",
      "Check for content distribution",
    ],
  },
];

if (require.main === module) {
  console.log(generateResponsiveTestInstructions());
}
