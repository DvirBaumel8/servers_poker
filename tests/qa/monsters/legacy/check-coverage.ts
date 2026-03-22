#!/usr/bin/env npx ts-node
/**
 * QA Monster Coverage Checker
 *
 * Run this to check if your new feature has monster coverage.
 * Usage: npx ts-node tests/qa-monster/check-coverage.ts /your-new-route
 */

import { PAGES, FLOWS, VIEWPORTS } from "./monster-config";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

function checkPageCoverage(routePath: string): void {
  console.log(`\n${BLUE}═══════════════════════════════════════════${RESET}`);
  console.log(`${BLUE}  QA Monster Coverage Check: ${routePath}${RESET}`);
  console.log(`${BLUE}═══════════════════════════════════════════${RESET}\n`);

  // Check if page exists
  const page = PAGES.find(
    (p) =>
      p.path === routePath ||
      p.path.replace(":id", "[id]") ===
        routePath.replace(/[a-f0-9-]{36}/g, "[id]"),
  );

  if (!page) {
    console.log(
      `${RED}✗ Page "${routePath}" NOT found in monster config${RESET}`,
    );
    console.log(`\n${YELLOW}Action required:${RESET}`);
    console.log(
      `Add this page to PAGES array in tests/qa-monster/monster-config.ts:\n`,
    );
    console.log(`{
  path: '${routePath}',
  name: 'Your Page Name',
  requiresAuth: false,
  criticalFlows: ['list', 'your', 'flows'],
  interactiveElements: ['list', 'interactive', 'elements'],
  dataStates: ['loading', 'loaded', 'empty', 'error'],
}`);
    return;
  }

  console.log(`${GREEN}✓ Page found: ${page.name}${RESET}`);
  console.log(`  Path: ${page.path}`);
  console.log(`  Auth required: ${page.requiresAuth}`);

  // Check critical flows
  console.log(`\n${BLUE}Critical Flows:${RESET}`);
  if (page.criticalFlows.length === 0) {
    console.log(`  ${YELLOW}⚠ No critical flows defined${RESET}`);
  } else {
    page.criticalFlows.forEach((flow) => {
      const flowExists = FLOWS.find(
        (f) =>
          f.name.toLowerCase().includes(flow.toLowerCase()) ||
          f.steps.some((s) => s.toLowerCase().includes(flow.toLowerCase())),
      );
      if (flowExists) {
        console.log(
          `  ${GREEN}✓ ${flow}${RESET} → covered by "${flowExists.name}"`,
        );
      } else {
        console.log(`  ${YELLOW}⚠ ${flow}${RESET} → no matching flow found`);
      }
    });
  }

  // Check interactive elements
  console.log(`\n${BLUE}Interactive Elements:${RESET}`);
  if (page.interactiveElements.length === 0) {
    console.log(`  ${YELLOW}⚠ No interactive elements defined${RESET}`);
  } else {
    page.interactiveElements.forEach((el) => {
      console.log(`  • ${el}`);
    });
  }

  // Check data states
  console.log(`\n${BLUE}Data States:${RESET}`);
  if (page.dataStates.length === 0) {
    console.log(`  ${YELLOW}⚠ No data states defined${RESET}`);
  } else {
    page.dataStates.forEach((state) => {
      console.log(`  • ${state}`);
    });
  }

  // Viewport coverage
  console.log(`\n${BLUE}Viewport Coverage:${RESET}`);
  console.log(`  ${GREEN}✓ ${VIEWPORTS.length} viewports configured${RESET}`);
  const mobileCount = VIEWPORTS.filter((v) => v.type === "mobile").length;
  const tabletCount = VIEWPORTS.filter((v) => v.type === "tablet").length;
  const desktopCount = VIEWPORTS.filter((v) => v.type === "desktop").length;
  console.log(
    `    Desktop: ${desktopCount}, Tablet: ${tabletCount}, Mobile: ${mobileCount}`,
  );

  // Suggestions
  console.log(`\n${BLUE}Suggestions:${RESET}`);
  console.log(`  1. Consider these edge cases:`);
  console.log(`     • What happens with empty data?`);
  console.log(`     • What happens on error?`);
  console.log(`     • What happens on slow network?`);
  console.log(`     • What happens at 280px width (Galaxy Fold)?`);
  console.log(`  2. Test these interactions:`);
  console.log(`     • Keyboard navigation`);
  console.log(`     • Back button behavior`);
  console.log(`     • Refresh during action`);

  console.log(`\n${BLUE}═══════════════════════════════════════════${RESET}\n`);
}

function listAllCoverage(): void {
  console.log(`\n${BLUE}═══════════════════════════════════════════${RESET}`);
  console.log(`${BLUE}  QA Monster - Full Coverage Report${RESET}`);
  console.log(`${BLUE}═══════════════════════════════════════════${RESET}\n`);

  console.log(`${BLUE}Pages Covered (${PAGES.length}):${RESET}`);
  PAGES.forEach((p) => {
    const flowCount = p.criticalFlows.length;
    const elementCount = p.interactiveElements.length;
    const stateCount = p.dataStates.length;
    console.log(`  ${p.requiresAuth ? "🔒" : "🌐"} ${p.name} (${p.path})`);
    console.log(
      `     Flows: ${flowCount}, Elements: ${elementCount}, States: ${stateCount}`,
    );
  });

  console.log(`\n${BLUE}User Flows Covered (${FLOWS.length}):${RESET}`);
  FLOWS.forEach((f) => {
    console.log(`  📋 ${f.name}`);
    console.log(
      `     Steps: ${f.steps.length}, Edge cases: ${f.edgeCases.length}`,
    );
  });

  console.log(`\n${BLUE}Viewports (${VIEWPORTS.length}):${RESET}`);
  VIEWPORTS.forEach((v) => {
    const icon =
      v.type === "desktop"
        ? "🖥️"
        : v.type === "tablet"
          ? "📱"
          : v.type === "mobile"
            ? "📲"
            : "📱";
    console.log(`  ${icon} ${v.name} (${v.width}×${v.height})`);
  });

  // Calculate total test combinations
  const totalCombinations = PAGES.length * VIEWPORTS.length;
  console.log(`\n${BLUE}Total Test Combinations:${RESET}`);
  console.log(
    `  ${PAGES.length} pages × ${VIEWPORTS.length} viewports = ${totalCombinations} visual checks`,
  );
  console.log(`  + ${FLOWS.length} user flows`);
  console.log(
    `  + ${FLOWS.reduce((acc, f) => acc + f.edgeCases.length, 0)} edge cases`,
  );

  console.log(`\n${BLUE}═══════════════════════════════════════════${RESET}\n`);
}

function printHelp(): void {
  console.log(`
${BLUE}QA Monster Coverage Checker${RESET}

Usage:
  npx ts-node tests/qa-monster/check-coverage.ts [command] [args]

Commands:
  /path           Check coverage for a specific route
  --all           List all coverage
  --help          Show this help

Examples:
  npx ts-node tests/qa-monster/check-coverage.ts /bots
  npx ts-node tests/qa-monster/check-coverage.ts /game/abc-123
  npx ts-node tests/qa-monster/check-coverage.ts --all
`);
}

// Main
const arg = process.argv[2];

if (!arg || arg === "--help") {
  printHelp();
} else if (arg === "--all") {
  listAllCoverage();
} else if (arg.startsWith("/")) {
  checkPageCoverage(arg);
} else {
  console.log(`${RED}Unknown argument: ${arg}${RESET}`);
  printHelp();
}
