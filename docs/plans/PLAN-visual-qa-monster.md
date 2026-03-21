# Plan: Visual QA Monster Framework

## Vision

Build an AI-powered QA system that automatically finds **200+ bugs** per release cycle, catching issues before they reach production. This framework will be a core competitive advantage - enabling rapid development with near-zero escaped defects.

---

## Current State vs Target

| Metric | Current (V1) | Target (Monster) |
|--------|--------------|------------------|
| Bugs Found | 11 | 200+ |
| Test Duration | 10 min manual | 30 min automated |
| Pages Covered | 6 | All pages + flows |
| Viewports | 3 | 16+ devices |
| Test Types | Visual only | 12 test types |
| CI Integration | None | Full pipeline |
| Regression | None | Baseline comparison |
| Accessibility | None | WCAG 2.1 AA |

---

## The 12 Test Types (Bug Multiplier Strategy)

### 1. Visual Regression Testing (Current: Basic)
**Current:** Manual screenshots, human review
**Monster Mode:**
- Automated baseline screenshots for every page/state
- Pixel-diff comparison with configurable threshold
- Perceptual diff (ignores anti-aliasing, catches real changes)
- Historical tracking of visual changes

**Bug Yield:** 20-30 bugs/release

### 2. DOM Overlap Detection (Current: Planned)
**Implementation:**
```typescript
// For every interactive element, check bounding box overlaps
for (const player of players) {
  const cardBox = await getBoundingBox(player.cards);
  const nameBox = await getBoundingBox(player.name);
  for (const other of players) {
    if (other !== player) {
      const otherNameBox = await getBoundingBox(other.name);
      if (overlaps(cardBox, otherNameBox) > 10%) {
        reportBug('OVERLAP', `${player.name}'s cards overlap ${other.name}`);
      }
    }
  }
}
```

**Bug Yield:** 15-25 bugs (especially at 9-player tables)

### 3. Responsive Layout Testing
**Viewports to Test (16 devices):**
```typescript
const VIEWPORTS = [
  // Desktop
  { name: '4K', width: 3840, height: 2160 },
  { name: '1440p', width: 2560, height: 1440 },
  { name: '1080p', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  // Tablet
  { name: 'iPad-Pro', width: 1024, height: 1366 },
  { name: 'iPad-Air', width: 820, height: 1180 },
  { name: 'Surface', width: 912, height: 1368 },
  // Mobile
  { name: 'iPhone-14-Pro-Max', width: 430, height: 932 },
  { name: 'iPhone-14', width: 390, height: 844 },
  { name: 'iPhone-SE', width: 375, height: 667 },
  { name: 'Pixel-7', width: 412, height: 915 },
  { name: 'Galaxy-S21', width: 360, height: 800 },
  { name: 'Galaxy-Fold', width: 280, height: 653 },
  // Edge cases
  { name: 'ultra-wide', width: 3440, height: 1440 },
  { name: 'portrait-monitor', width: 1080, height: 1920 },
  { name: 'tiny', width: 320, height: 480 },
];
```

**Checks per viewport:**
- Horizontal overflow (scrollbar appears)
- Text truncation (important text cut off)
- Touch target size (minimum 44x44px)
- Element visibility (critical elements off-screen)
- Layout breaks (flex/grid failures)

**Bug Yield:** 30-50 bugs

### 4. State Combination Testing
**The Problem:** We test individual states, but bugs hide in combinations.

**State Matrix:**
```typescript
const USER_STATES = ['logged_out', 'logged_in', 'admin', 'suspended'];
const GAME_STATES = ['waiting', 'running', 'showdown', 'finished', 'error'];
const PLAYER_COUNTS = [0, 1, 2, 6, 9];
const PLAYER_STATES = ['active', 'folded', 'all_in', 'disconnected', 'busted'];
const NETWORK_STATES = ['online', 'slow', 'offline', 'reconnecting'];

// Generate all combinations
const testCases = cartesianProduct(
  USER_STATES, GAME_STATES, PLAYER_COUNTS, PLAYER_STATES, NETWORK_STATES
);
// = 4 × 5 × 5 × 5 × 4 = 2,000 combinations!
```

**Smart Sampling:** Use pairwise testing to reduce to ~100 meaningful combinations.

**Bug Yield:** 40-60 bugs

### 5. User Flow Testing
**Critical Flows:**
```typescript
const FLOWS = [
  {
    name: 'New User Onboarding',
    steps: [
      'land_on_home',
      'click_create_account',
      'fill_registration',
      'submit_registration',
      'verify_email',
      'login',
      'create_first_bot',
      'join_first_tournament',
    ],
  },
  {
    name: 'Play Full Tournament',
    steps: [
      'login',
      'browse_tournaments',
      'register_bot',
      'wait_for_start',
      'watch_game',
      'observe_blind_increase',
      'observe_table_consolidation',
      'observe_final_table',
      'see_results',
    ],
  },
  {
    name: 'Bot Management',
    steps: [
      'login',
      'go_to_bots',
      'create_new_bot',
      'validate_endpoint',
      'activate_bot',
      'deploy_to_table',
      'watch_bot_play',
      'view_bot_stats',
    ],
  },
];
```

**Bug Yield:** 15-25 bugs (flow-specific issues)

### 6. Error State Testing
**Error Scenarios to Inject:**
```typescript
const ERROR_SCENARIOS = [
  // API Errors
  { type: 'api_404', trigger: '/game/fake-id' },
  { type: 'api_500', trigger: 'inject_server_error' },
  { type: 'api_401', trigger: 'expire_token' },
  { type: 'api_403', trigger: 'access_admin_as_user' },
  { type: 'api_429', trigger: 'rapid_requests' },
  { type: 'api_timeout', trigger: 'slow_backend' },
  
  // Network Errors
  { type: 'offline', trigger: 'disable_network' },
  { type: 'slow_3g', trigger: 'throttle_network' },
  { type: 'intermittent', trigger: 'flaky_network' },
  
  // WebSocket Errors
  { type: 'ws_disconnect', trigger: 'close_websocket' },
  { type: 'ws_timeout', trigger: 'no_response' },
  
  // Form Errors
  { type: 'validation', trigger: 'invalid_input' },
  { type: 'duplicate', trigger: 'existing_email' },
];
```

**Checks:**
- Error message displayed (not blank screen)
- Error message is user-friendly (no technical jargon)
- Recovery path available (retry, go back)
- No sensitive info leaked

**Bug Yield:** 20-30 bugs

### 7. Accessibility Testing
**WCAG 2.1 AA Compliance:**
```typescript
const ACCESSIBILITY_CHECKS = [
  // Color contrast
  { check: 'contrast_ratio', min: 4.5 }, // Normal text
  { check: 'contrast_ratio_large', min: 3.0 }, // Large text
  
  // Focus
  { check: 'focus_visible', required: true },
  { check: 'focus_order', logical: true },
  { check: 'skip_links', present: true },
  
  // Screen readers
  { check: 'aria_labels', all_interactive: true },
  { check: 'alt_text', all_images: true },
  { check: 'heading_hierarchy', valid: true },
  
  // Keyboard
  { check: 'keyboard_navigable', all_interactive: true },
  { check: 'no_keyboard_traps', verified: true },
  
  // Motion
  { check: 'reduced_motion', respected: true },
];
```

**Tool Integration:** Axe-core for automated accessibility scanning.

**Bug Yield:** 25-40 bugs

### 8. Performance Testing
**Metrics to Capture:**
```typescript
const PERFORMANCE_METRICS = {
  // Core Web Vitals
  LCP: { max: 2500 }, // Largest Contentful Paint
  FID: { max: 100 },  // First Input Delay
  CLS: { max: 0.1 },  // Cumulative Layout Shift
  
  // Additional
  TTFB: { max: 800 }, // Time to First Byte
  TTI: { max: 3800 }, // Time to Interactive
  TBT: { max: 200 },  // Total Blocking Time
  
  // Game-specific
  frame_rate: { min: 30 }, // Animation smoothness
  action_response: { max: 100 }, // Button click to visual feedback
};
```

**Bug Yield:** 10-15 bugs

### 9. Data Integrity Testing
**Verify UI matches Backend:**
```typescript
const INTEGRITY_CHECKS = [
  // Compare displayed values to API responses
  { element: 'pot_display', api: '/game/:id', field: 'pot' },
  { element: 'chip_count', api: '/game/:id', field: 'players[*].chips' },
  { element: 'tournament_field', api: '/tournament/:id', field: 'entries_count' },
  { element: 'leaderboard_rank', api: '/leaderboard', field: 'entries[*].rank' },
];
```

**Bug Yield:** 5-10 bugs

### 10. Real-time Update Testing
**WebSocket Event Verification:**
```typescript
const REALTIME_TESTS = [
  {
    event: 'player_joined',
    expected_ui_change: 'new_player_seat_appears',
    max_latency: 500,
  },
  {
    event: 'player_action',
    expected_ui_change: 'action_badge_shows',
    max_latency: 300,
  },
  {
    event: 'cards_dealt',
    expected_ui_change: 'community_cards_animate',
    max_latency: 1000,
  },
  {
    event: 'hand_result',
    expected_ui_change: 'winner_animation_plays',
    max_latency: 2000,
  },
];
```

**Bug Yield:** 10-15 bugs

### 11. Edge Case Data Testing
**Boundary Values:**
```typescript
const EDGE_CASES = {
  player_name: [
    '', // Empty
    'A', // Single char
    'A'.repeat(100), // Very long
    '🎰🃏♠️', // Emoji
    '<script>alert("xss")</script>', // XSS attempt
    'Player "Nickname"', // Quotes
  ],
  chip_count: [
    0,
    1,
    999999999, // Very large
    -1, // Invalid (should never happen)
  ],
  player_count: [0, 1, 2, 5, 6, 9, 10], // 10 is over max
  tournament_field: [0, 1, 100, 1000],
};
```

**Bug Yield:** 15-20 bugs

### 12. Memory & Stability Testing
**Long-running Session Tests:**
```typescript
const STABILITY_TESTS = [
  {
    name: 'memory_leak_game',
    action: 'watch_game_for_1_hour',
    check: 'memory_growth < 50MB',
  },
  {
    name: 'memory_leak_navigation',
    action: 'navigate_100_pages',
    check: 'memory_returns_to_baseline',
  },
  {
    name: 'event_listener_cleanup',
    action: 'mount_unmount_components_100x',
    check: 'no_orphan_listeners',
  },
];
```

**Bug Yield:** 5-10 bugs

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Create `VisualTestOrchestrator` class
- [ ] Implement viewport loop (all 16 devices)
- [ ] Add screenshot baseline system
- [ ] Create bug report generator

### Phase 2: Detection Engines (Week 2)
- [ ] DOM overlap detector (bounding box analysis)
- [ ] Accessibility scanner (axe-core integration)
- [ ] Performance profiler (Core Web Vitals)
- [ ] Error state detector

### Phase 3: State Machine (Week 3)
- [ ] State combination generator
- [ ] User flow executor
- [ ] WebSocket event simulator
- [ ] Mock data injector

### Phase 4: CI Integration (Week 4)
- [ ] GitHub Actions workflow
- [ ] Visual diff reporting
- [ ] Slack/Discord notifications
- [ ] Automatic issue creation

### Phase 5: Intelligence (Week 5+)
- [ ] Bug pattern recognition
- [ ] Flaky test detection
- [ ] Priority scoring
- [ ] Historical trend analysis

---

## File Structure

```
tests/
├── visual/
│   ├── orchestrator.ts           # Main test runner
│   ├── engines/
│   │   ├── overlap-detector.ts   # DOM overlap detection
│   │   ├── responsive-checker.ts # Viewport testing
│   │   ├── accessibility.ts      # A11y scanning
│   │   ├── performance.ts        # Core Web Vitals
│   │   ├── realtime.ts          # WebSocket testing
│   │   └── integrity.ts         # Data verification
│   ├── flows/
│   │   ├── onboarding.flow.ts
│   │   ├── tournament.flow.ts
│   │   └── bot-management.flow.ts
│   ├── states/
│   │   ├── state-matrix.ts      # State combination generator
│   │   └── mock-data.ts         # Edge case data
│   ├── baselines/               # Screenshot baselines
│   │   ├── desktop/
│   │   ├── tablet/
│   │   └── mobile/
│   ├── reports/                 # Generated reports
│   └── config/
│       ├── viewports.ts
│       └── thresholds.ts
```

---

## Expected Bug Yield by Category

| Test Type | Bugs/Release | Cumulative |
|-----------|--------------|------------|
| Visual Regression | 25 | 25 |
| DOM Overlap | 20 | 45 |
| Responsive | 40 | 85 |
| State Combinations | 50 | 135 |
| User Flows | 20 | 155 |
| Error States | 25 | 180 |
| Accessibility | 30 | 210 |
| Performance | 12 | 222 |
| Data Integrity | 8 | 230 |
| Real-time | 12 | 242 |
| Edge Cases | 18 | 260 |
| Stability | 8 | 268 |

**Total Expected:** ~250 bugs catchable per release cycle

---

## Quick Wins (Implement Now)

### 1. Viewport Loop (30 min)
```typescript
async function runAllViewports(page: string) {
  for (const viewport of VIEWPORTS) {
    await browser_resize(viewport.width, viewport.height);
    await browser_navigate(page);
    await browser_take_screenshot(`${page}-${viewport.name}.png`);
    const issues = await detectIssues();
    if (issues.length) {
      reportBugs(issues, viewport, page);
    }
  }
}
```

### 2. Overlap Detection (30 min)
Already have `dom-overlap-detector.ts` - need to run it on actual pages.

### 3. Error Route Testing (15 min)
```typescript
const ERROR_URLS = [
  '/game/fake',
  '/tournament/fake',
  '/bot/fake',
  '/admin', // without auth
];
for (const url of ERROR_URLS) {
  await browser_navigate(url);
  await verifyErrorHandling();
}
```

### 4. Full Storybook Scan (20 min)
```bash
cd frontend && npm run storybook
# Then automatically test every story at every viewport
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Bugs found per run | 50+ |
| False positive rate | < 5% |
| Test execution time | < 30 min |
| Coverage (pages) | 100% |
| Coverage (states) | 80% |
| CI integration | ✓ |
| Auto-reporting | ✓ |

---

## Next Steps

1. **Now:** Run overlap detection on game tables with players
2. **Today:** Implement viewport loop for all pages
3. **This week:** Build state combination generator
4. **Next week:** CI integration with baseline comparisons
