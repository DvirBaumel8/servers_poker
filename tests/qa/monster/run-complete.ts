#!/usr/bin/env npx ts-node
/**
 * QA Monster - Complete System Test Runner
 *
 * Runs ALL tests:
 * 1. Backend API tests
 * 2. Frontend visual tests
 * 3. User flow tests
 * 4. Live game tests
 * 5. Security tests
 * 6. Accessibility tests
 * 7. Performance tests
 */

import {
  BACKEND_ENDPOINTS,
  FRONTEND_PAGES,
  FRONTEND_COMPONENTS,
  USER_FLOWS,
  VIEWPORTS,
  COVERAGE_SUMMARY,
  TOTAL_COMPONENTS,
  COMPONENTS_WITH_STORIES,
  COMPONENTS_WITHOUT_STORIES,
} from "./complete-inventory";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function printHeader(title: string): void {
  console.log(`\n${CYAN}${"═".repeat(60)}${RESET}`);
  console.log(`${CYAN}${BOLD}  ${title}${RESET}`);
  console.log(`${CYAN}${"═".repeat(60)}${RESET}\n`);
}

function printSection(title: string): void {
  console.log(`\n${YELLOW}▶ ${title}${RESET}`);
}

// ============================================================================
// PHASE 1: BACKEND API TESTS
// ============================================================================

function generateBackendTestInstructions(): string {
  printHeader("PHASE 1: BACKEND API TESTS");

  let instructions = `
## Backend API Test Instructions

Test EVERY endpoint for:
1. ✅ Success case (valid request)
2. ❌ Error case (invalid request)
3. 🔒 Auth case (unauthorized access)
4. 🚫 Validation case (missing/invalid params)

### Endpoints to Test:

`;

  for (const [module, endpoints] of Object.entries(BACKEND_ENDPOINTS)) {
    instructions += `\n#### Module: ${module}\n\n`;
    for (const ep of endpoints) {
      const authIcon = ep.auth ? "🔒" : "🌐";
      const criticalIcon = (ep as any).critical ? " ⚠️ CRITICAL" : "";
      instructions += `- ${authIcon} \`${ep.method} ${ep.path}\`${criticalIcon}\n`;
    }
  }

  console.log(`  Total endpoints: ${COVERAGE_SUMMARY.backend.endpoints}`);
  console.log(`  Modules: ${COVERAGE_SUMMARY.backend.modules}`);

  return instructions;
}

// ============================================================================
// PHASE 2: FRONTEND VISUAL TESTS
// ============================================================================

function generateVisualTestInstructions(): string {
  printHeader("PHASE 2: FRONTEND VISUAL TESTS");

  let instructions = `
## Frontend Visual Test Instructions

For EACH page, at EACH viewport:
1. 📸 Take screenshot
2. 👀 Check layout integrity
3. 📱 Verify responsive design
4. 🎨 Check visual consistency

### Pages × Viewports Matrix:

| Page | Viewports to Test |
|------|-------------------|
`;

  for (const page of FRONTEND_PAGES) {
    const authIcon = page.auth ? "🔒" : "🌐";
    const criticalIcon = (page as any).critical ? " ⚠️" : "";
    instructions += `| ${authIcon} ${page.path}${criticalIcon} | All ${VIEWPORTS.length} viewports |\n`;
  }

  instructions += `
### Viewports:
${VIEWPORTS.map((v) => `- ${v.name} (${v.width}×${v.height})`).join("\n")}

### At Each Page × Viewport, Check:
- [ ] No horizontal overflow
- [ ] Text readable (not too small)
- [ ] Touch targets adequate (44px+ on mobile)
- [ ] No elements cut off
- [ ] Loading state works
- [ ] Error state works
- [ ] Empty state works
`;

  console.log(
    `  Total combinations: ${FRONTEND_PAGES.length} pages × ${VIEWPORTS.length} viewports = ${FRONTEND_PAGES.length * VIEWPORTS.length}`,
  );

  return instructions;
}

// ============================================================================
// PHASE 3: COMPONENT TESTS
// ============================================================================

function generateComponentTestInstructions(): string {
  printHeader("PHASE 3: COMPONENT TESTS");

  const instructions = `
## Component Test Instructions

### Components WITH Storybook Stories (run visual regression):
${FRONTEND_COMPONENTS.filter((c) => c.hasStory)
  .map((c) => `- ✅ ${c.name} (${c.path})`)
  .join("\n")}

### Components WITHOUT Stories (need stories added):
${FRONTEND_COMPONENTS.filter((c) => !c.hasStory)
  .map((c) => `- ❌ ${c.name} (${c.path})`)
  .join("\n")}

### For Each Component, Test:
- [ ] All prop combinations
- [ ] All states (loading, error, empty, full)
- [ ] Responsive at all viewports
- [ ] Accessibility (keyboard nav, ARIA)
`;

  console.log(
    `  Components with stories: ${COMPONENTS_WITH_STORIES}/${TOTAL_COMPONENTS} (${COVERAGE_SUMMARY.frontend.componentsCoverage})`,
  );
  console.log(`  ${RED}Missing stories: ${COMPONENTS_WITHOUT_STORIES}${RESET}`);

  return instructions;
}

// ============================================================================
// PHASE 4: USER FLOW TESTS
// ============================================================================

function generateFlowTestInstructions(): string {
  printHeader("PHASE 4: USER FLOW TESTS");

  let instructions = `
## User Flow Test Instructions

### Critical Flows (Must Pass):
${USER_FLOWS.filter((f) => f.critical)
  .map((f) => `- ⚠️ ${f.name} [${f.category}]`)
  .join("\n")}

### All Flows:
`;

  const byCategory: Record<string, typeof USER_FLOWS> = {};
  for (const flow of USER_FLOWS) {
    if (!byCategory[flow.category]) byCategory[flow.category] = [];
    byCategory[flow.category].push(flow);
  }

  for (const [category, flows] of Object.entries(byCategory)) {
    instructions += `\n#### ${category.toUpperCase()}\n`;
    for (const flow of flows) {
      const criticalIcon = flow.critical ? "⚠️ " : "";
      instructions += `- ${criticalIcon}${flow.name}\n`;
    }
  }

  instructions += `
### For Each Flow, Test:
- [ ] Happy path (everything works)
- [ ] Error paths (what can go wrong)
- [ ] Edge cases (unusual inputs)
- [ ] Recovery (can user recover from errors)
`;

  console.log(`  Total flows: ${USER_FLOWS.length}`);
  console.log(
    `  Critical flows: ${USER_FLOWS.filter((f) => f.critical).length}`,
  );

  return instructions;
}

// ============================================================================
// PHASE 5: LIVE GAME TESTS
// ============================================================================

function generateLiveGameTestInstructions(): string {
  printHeader("PHASE 5: LIVE GAME TESTS");

  return `
## Live Game Test Instructions

THIS IS THE GAP WE NEED TO FILL.

### Setup:
1. Start backend: \`node dist/src/main.js\`
2. Start frontend: \`cd frontend && npm run dev\`
3. Start simulation: \`npm run sim:multi\`
4. Watch UI simultaneously

### While Simulation Runs, Check:

#### On Game Table Page:
- [ ] Players appear in correct seats
- [ ] Cards display correctly
- [ ] Pot updates in real-time
- [ ] Actions appear in feed
- [ ] Timer works
- [ ] Winner animation plays
- [ ] Chips move correctly
- [ ] **No overlap between cards and names** (YOUR ORIGINAL CONCERN)
- [ ] 9-player layout works
- [ ] All player states visible (active, folded, all-in)

#### On Tournament Page:
- [ ] Player count updates
- [ ] Eliminations show
- [ ] Table count changes
- [ ] Blind level increases
- [ ] Prize pool displays

#### Real-time Updates:
- [ ] WebSocket connects
- [ ] Updates appear within 1 second
- [ ] No missed updates
- [ ] Reconnection works

### Edge Cases:
- [ ] What happens when player disconnects?
- [ ] What happens when WebSocket drops?
- [ ] What happens during table merge?
- [ ] What happens at final table?
`;
}

// ============================================================================
// PHASE 6: SECURITY TESTS
// ============================================================================

function generateSecurityTestInstructions(): string {
  printHeader("PHASE 6: SECURITY TESTS");

  return `
## Security Test Instructions

### XSS (Cross-Site Scripting):
Try these inputs in ALL text fields:
- \`<script>alert('xss')</script>\`
- \`<img src=x onerror=alert('xss')>\`
- \`javascript:alert('xss')\`

### SQL Injection:
Try these inputs:
- \`'; DROP TABLE users; --\`
- \`' OR '1'='1\`
- \`1; SELECT * FROM users\`

### Auth Bypass:
- [ ] Access /profile without login
- [ ] Access /admin/analytics as non-admin
- [ ] Use expired token
- [ ] Use token from different user

### Rate Limiting:
- [ ] Try 100 rapid requests to /auth/login
- [ ] Try 100 rapid requests to /auth/register
- [ ] Check error message doesn't leak info

### Input Validation:
- [ ] Very long strings (10000 chars)
- [ ] Unicode/emoji in all fields
- [ ] Null bytes
- [ ] Negative numbers where positive expected
`;
}

// ============================================================================
// PHASE 7: ACCESSIBILITY TESTS
// ============================================================================

function generateA11yTestInstructions(): string {
  printHeader("PHASE 7: ACCESSIBILITY TESTS");

  return `
## Accessibility Test Instructions

### Automated:
Run axe-core on every page:
\`\`\`bash
npx axe http://localhost:3001/
npx axe http://localhost:3001/login
npx axe http://localhost:3001/register
# ... all pages
\`\`\`

### Manual Checks:

#### Keyboard Navigation:
- [ ] Can reach all interactive elements with Tab
- [ ] Tab order is logical
- [ ] Focus indicator visible
- [ ] Can activate buttons with Enter/Space
- [ ] Can close modals with Escape
- [ ] No focus traps

#### Screen Reader:
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Buttons have accessible names
- [ ] Headings follow hierarchy (h1 → h2 → h3)
- [ ] ARIA labels where needed

#### Visual:
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Text resizable to 200%
- [ ] No info conveyed by color alone
`;
}

// ============================================================================
// PHASE 8: PERFORMANCE TESTS
// ============================================================================

function generatePerformanceTestInstructions(): string {
  printHeader("PHASE 8: PERFORMANCE TESTS");

  return `
## Performance Test Instructions

### Lighthouse:
Run on every page:
\`\`\`bash
npx lighthouse http://localhost:3001/ --output=json
\`\`\`

Targets:
- Performance: > 90
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 90

### Core Web Vitals:
- [ ] LCP (Largest Contentful Paint) < 2.5s
- [ ] FID (First Input Delay) < 100ms
- [ ] CLS (Cumulative Layout Shift) < 0.1

### Load Testing:
\`\`\`bash
npm run test:load
npm run test:load:ws
npm run test:load:games
\`\`\`

### Memory:
- [ ] Open game table for 10 minutes
- [ ] Check memory doesn't grow continuously
- [ ] No memory leaks in DevTools
`;
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const phase = args[0] || "all";

  printHeader("QA MONSTER - COMPLETE SYSTEM TEST");

  console.log(`${BOLD}Coverage Summary:${RESET}`);
  console.log(`  Backend Endpoints: ${COVERAGE_SUMMARY.backend.endpoints}`);
  console.log(`  Frontend Pages: ${COVERAGE_SUMMARY.frontend.pages}`);
  console.log(`  Frontend Components: ${COVERAGE_SUMMARY.frontend.components}`);
  console.log(`  User Flows: ${COVERAGE_SUMMARY.flows.total}`);
  console.log(`  Viewports: ${COVERAGE_SUMMARY.viewports}`);
  console.log(
    `  ${BOLD}Total Test Cases: ~${COVERAGE_SUMMARY.totalTestCases()}${RESET}`,
  );

  let output = "";

  switch (phase) {
    case "backend":
      output = generateBackendTestInstructions();
      break;
    case "visual":
      output = generateVisualTestInstructions();
      break;
    case "components":
      output = generateComponentTestInstructions();
      break;
    case "flows":
      output = generateFlowTestInstructions();
      break;
    case "live":
      output = generateLiveGameTestInstructions();
      break;
    case "security":
      output = generateSecurityTestInstructions();
      break;
    case "a11y":
      output = generateA11yTestInstructions();
      break;
    case "performance":
      output = generatePerformanceTestInstructions();
      break;
    case "all":
    default:
      output += generateBackendTestInstructions();
      output += generateVisualTestInstructions();
      output += generateComponentTestInstructions();
      output += generateFlowTestInstructions();
      output += generateLiveGameTestInstructions();
      output += generateSecurityTestInstructions();
      output += generateA11yTestInstructions();
      output += generatePerformanceTestInstructions();
      break;
  }

  console.log(output);

  printHeader("EXECUTION CHECKLIST");
  console.log(`
${GREEN}Run these commands to execute all tests:${RESET}

# 1. Backend API tests
curl -X GET http://localhost:3000/api/v1/health

# 2. Frontend visual tests (run Storybook)
cd frontend && npm run storybook

# 3. Live game test
npm run sim:multi  # In one terminal
# Then watch UI in browser

# 4. Security scan
# npm install -g owasp-zap (if not installed)
# zap-cli quick-scan http://localhost:3001

# 5. Accessibility
npx axe http://localhost:3001/

# 6. Performance
npx lighthouse http://localhost:3001/ --view
`);
}

main();
