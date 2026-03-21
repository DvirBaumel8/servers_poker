#!/usr/bin/env npx ts-node
/**
 * Visual Test Runner
 * ==================
 *
 * Orchestrates all visual tests and generates reports.
 *
 * Usage:
 *   npx ts-node tests/visual/run-visual-tests.ts [options]
 *
 * Options:
 *   --type=<test-type>   Run specific test type (game-table, responsive, error-states, all)
 *   --generate-ai        Generate AI instructions instead of running tests
 *   --verbose            Enable verbose logging
 *   --help               Show help
 */

import {
  generateAITestInstructions,
  GAME_TABLE_TESTS,
} from "./game-table-visual.test";
import { generateWSTestInstructions } from "./websocket-realtime.test";
import { generateResponsiveTestInstructions } from "./responsive-viewport.test";
import { generateErrorTestInstructions } from "./error-states.test";
import {
  generateResilienceTestInstructions,
  RESILIENCE_SCENARIOS,
} from "../performance/network-resilience.test";

// Note: Visual tests are now located in tests/qa/visual/

interface VisualTestSuite {
  name: string;
  description: string;
  aiInstructions: () => string;
  testDefinitions?: any;
  category: "visual" | "functional" | "performance";
}

const TEST_SUITES: VisualTestSuite[] = [
  {
    name: "Game Table Visual",
    description: "Visual regression tests for the poker table UI",
    aiInstructions: generateAITestInstructions,
    testDefinitions: GAME_TABLE_TESTS,
    category: "visual",
  },
  {
    name: "WebSocket Real-time",
    description: "Tests that UI updates correctly on WebSocket events",
    aiInstructions: generateWSTestInstructions,
    category: "functional",
  },
  {
    name: "Responsive Viewport",
    description: "Tests layout at various screen sizes",
    aiInstructions: generateResponsiveTestInstructions,
    category: "visual",
  },
  {
    name: "Error States",
    description: "Tests error handling UI",
    aiInstructions: generateErrorTestInstructions,
    category: "functional",
  },
  {
    name: "Network Resilience",
    description: "Tests system behavior under network failures",
    aiInstructions: generateResilienceTestInstructions,
    testDefinitions: RESILIENCE_SCENARIOS,
    category: "performance",
  },
];

function printHelp(): void {
  console.log(`
Visual Test Runner
==================

A comprehensive visual testing framework for the poker platform.

USAGE
  npx ts-node tests/visual/run-visual-tests.ts [command] [options]

COMMANDS
  list          List all available test suites
  ai <suite>    Generate AI instructions for a test suite
  all           Generate all AI instructions
  help          Show this help message

OPTIONS
  --verbose     Enable verbose output
  --output=<f>  Write output to file instead of stdout

EXAMPLES
  # List available test suites
  npx ts-node tests/visual/run-visual-tests.ts list

  # Generate AI instructions for game table tests
  npx ts-node tests/visual/run-visual-tests.ts ai "Game Table Visual"

  # Generate all instructions to a file
  npx ts-node tests/visual/run-visual-tests.ts all --output=ai-test-instructions.md

TEST SUITES
${TEST_SUITES.map((s) => `  - ${s.name}: ${s.description}`).join("\n")}

USING WITH AI/CURSOR
  1. Run: npx ts-node tests/visual/run-visual-tests.ts ai "Game Table Visual"
  2. Copy the output or have AI read the file
  3. AI uses browser MCP tools to execute the tests
  4. AI reports findings in markdown format
`);
}

function listSuites(): void {
  console.log("\nAvailable Visual Test Suites\n");
  console.log("============================\n");

  for (const suite of TEST_SUITES) {
    console.log(`📋 ${suite.name}`);
    console.log(`   Category: ${suite.category}`);
    console.log(`   ${suite.description}`);
    if (suite.testDefinitions) {
      const count =
        typeof suite.testDefinitions === "object"
          ? Object.keys(suite.testDefinitions).length
          : suite.testDefinitions.length;
      console.log(`   Tests: ${count}`);
    }
    console.log();
  }
}

function generateAIInstructions(suiteName: string): void {
  const suite = TEST_SUITES.find(
    (s) => s.name.toLowerCase() === suiteName.toLowerCase(),
  );

  if (!suite) {
    console.error(`Unknown test suite: ${suiteName}`);
    console.error("Available suites:");
    TEST_SUITES.forEach((s) => console.error(`  - ${s.name}`));
    process.exit(1);
  }

  console.log(suite.aiInstructions());
}

function generateAllInstructions(): void {
  console.log("# Complete Visual Test Instructions\n");
  console.log("Generated: " + new Date().toISOString() + "\n");
  console.log("---\n");

  for (const suite of TEST_SUITES) {
    console.log(`\n# ${suite.name}\n`);
    console.log(`Category: ${suite.category}\n`);
    console.log(suite.aiInstructions());
    console.log("\n---\n");
  }
}

function generateQuickStartGuide(): void {
  console.log(`
# Visual Testing Quick Start Guide

## For AI/Cursor Agents

### Step 1: Ensure Services Running
- Backend: http://localhost:3000
- Frontend: http://localhost:3001

### Step 2: Pick a Test Type

1. **Game Table Visual Tests** (Highest Priority)
   - Detect card/name overlaps
   - Check player positioning
   - Verify element visibility

2. **Responsive Tests**
   - Test different screen sizes
   - Check mobile/tablet layouts
   - Verify touch targets

3. **Error State Tests**
   - Test 404/500 handling
   - Verify error messages
   - Check recovery flows

### Step 3: Execute Tests

Use browser MCP tools:
- \`browser_navigate\` - Go to pages
- \`browser_snapshot\` - Get DOM state
- \`browser_take_screenshot\` - Visual capture
- \`browser_get_bounding_box\` - Check overlaps
- \`browser_resize\` - Test viewports

### Step 4: Report Findings

Format as:
\`\`\`markdown
## Visual Test Report

### Issues Found
1. [CRITICAL] Description
2. [MAJOR] Description
3. [MINOR] Description

### Screenshots
- screenshot-1.png: Description
- screenshot-2.png: Description

### Recommendations
- Suggestion 1
- Suggestion 2
\`\`\`

## Quick Commands

\`\`\`bash
# List test suites
npm run test:visual -- list

# Generate AI instructions for game table tests
npm run test:visual -- ai "Game Table Visual"

# Generate all instructions
npm run test:visual -- all
\`\`\`
`);
}

// Main execution
const args = process.argv.slice(2);
const command = args[0] || "help";

switch (command) {
  case "list":
    listSuites();
    break;
  case "ai":
    if (!args[1]) {
      console.error("Please specify a test suite name");
      listSuites();
      process.exit(1);
    }
    generateAIInstructions(args[1]);
    break;
  case "all":
    generateAllInstructions();
    break;
  case "quickstart":
    generateQuickStartGuide();
    break;
  case "help":
  default:
    printHelp();
    break;
}
