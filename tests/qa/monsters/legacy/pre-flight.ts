#!/usr/bin/env npx ts-node
/**
 * QA Monster - Pre-Flight Checks
 *
 * Validates that the environment is ready for QA testing.
 * Checks backends, frontends, data availability, and optionally seeds test data.
 */

import { PRE_FLIGHT_CHECKS, createRunConfig } from "./monster-config";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

interface CheckResult {
  name: string;
  passed: boolean;
  required: boolean;
  message: string;
  data?: unknown;
  autoFix?: string;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function runCheck(
  check: (typeof PRE_FLIGHT_CHECKS)[0],
): Promise<CheckResult> {
  const result: CheckResult = {
    name: check.name,
    passed: false,
    required: check.required,
    message: "",
    autoFix: check.autoFix,
  };

  if (!check.endpoint) {
    result.passed = true;
    result.message = "No endpoint to check (manual verification)";
    return result;
  }

  try {
    const response = await fetchWithTimeout(check.endpoint);

    if (!response.ok) {
      result.message = `HTTP ${response.status}: ${response.statusText}`;
      return result;
    }

    // Special checks based on check type
    switch (check.name) {
      case "database_has_games": {
        const games = await response.json();
        if (Array.isArray(games) && games.length > 0) {
          result.passed = true;
          result.message = `Found ${games.length} games`;
          result.data = { count: games.length };
        } else {
          result.message = "No games found in database";
        }
        break;
      }

      case "tables_have_players": {
        const games = await response.json();
        const gamesWithPlayers = (games as any[]).filter(
          (g) => g.players && g.players.length > 0,
        );
        if (gamesWithPlayers.length > 0) {
          result.passed = true;
          result.message = `Found ${gamesWithPlayers.length} tables with players`;
          result.data = {
            tablesWithPlayers: gamesWithPlayers.length,
            totalPlayers: gamesWithPlayers.reduce(
              (sum, g) => sum + g.players.length,
              0,
            ),
          };
        } else {
          result.message = "No tables have active players";
        }
        break;
      }

      case "tournaments_exist": {
        const tournaments = await response.json();
        if (Array.isArray(tournaments) && tournaments.length > 0) {
          result.passed = true;
          const running = tournaments.filter(
            (t: any) => t.status === "running",
          ).length;
          result.message = `Found ${tournaments.length} tournaments (${running} running)`;
          result.data = { total: tournaments.length, running };
        } else {
          result.message = "No tournaments found";
        }
        break;
      }

      default: {
        result.passed = true;
        result.message = "Endpoint responding";
      }
    }
  } catch (error: any) {
    if (error.name === "AbortError") {
      result.message = "Request timed out (5s)";
    } else if (error.code === "ECONNREFUSED") {
      result.message = "Connection refused - server not running";
    } else {
      result.message = error.message || "Unknown error";
    }
  }

  return result;
}

async function runAllChecks(): Promise<{
  results: CheckResult[];
  allRequiredPassed: boolean;
  allPassed: boolean;
}> {
  console.log(`\n${CYAN}${"═".repeat(60)}${RESET}`);
  console.log(`${CYAN}${BOLD}  QA MONSTER - PRE-FLIGHT CHECKS${RESET}`);
  console.log(`${CYAN}${"═".repeat(60)}${RESET}\n`);

  const results: CheckResult[] = [];
  let allRequiredPassed = true;
  let allPassed = true;

  for (const check of PRE_FLIGHT_CHECKS) {
    process.stdout.write(`  ${DIM}Checking ${check.name}...${RESET}`);
    const result = await runCheck(check);
    results.push(result);

    // Clear the line and print result
    process.stdout.write("\r\x1b[K");

    const icon = result.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const reqLabel = result.required
      ? `${RED}[REQUIRED]${RESET}`
      : `${YELLOW}[OPTIONAL]${RESET}`;

    console.log(`  ${icon} ${check.description}`);
    console.log(`    ${DIM}${result.message}${RESET}`);

    if (!result.passed) {
      if (result.required) {
        allRequiredPassed = false;
        console.log(`    ${reqLabel}`);
      } else {
        console.log(`    ${reqLabel}`);
        if (result.autoFix) {
          console.log(
            `    ${YELLOW}Auto-fix: ${BOLD}${result.autoFix}${RESET}`,
          );
        }
      }
      allPassed = false;
    }
  }

  return { results, allRequiredPassed, allPassed };
}

function printSummary(
  results: CheckResult[],
  allRequiredPassed: boolean,
  allPassed: boolean,
): void {
  console.log(`\n${CYAN}${"─".repeat(60)}${RESET}`);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const requiredFailed = results.filter((r) => !r.passed && r.required).length;
  const optionalFailed = results.filter((r) => !r.passed && !r.required).length;

  console.log(`\n  ${BOLD}Summary:${RESET}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
  if (requiredFailed > 0) {
    console.log(`  ${RED}Required failed: ${requiredFailed}${RESET}`);
  }
  if (optionalFailed > 0) {
    console.log(`  ${YELLOW}Optional failed: ${optionalFailed}${RESET}`);
  }

  console.log();

  if (allPassed) {
    console.log(`  ${GREEN}${BOLD}✓ All pre-flight checks passed!${RESET}`);
    console.log(`  ${GREEN}Ready to run QA Monster.${RESET}\n`);
  } else if (allRequiredPassed) {
    console.log(
      `  ${YELLOW}${BOLD}⚠ Optional checks failed, but required checks passed.${RESET}`,
    );
    console.log(`  ${YELLOW}QA Monster can run with limited coverage.${RESET}`);

    // Suggest auto-fixes
    const fixable = results.filter((r) => !r.passed && r.autoFix);
    if (fixable.length > 0) {
      console.log(`\n  ${BOLD}To enable full testing, run:${RESET}`);
      for (const r of fixable) {
        console.log(`    ${CYAN}${r.autoFix}${RESET}`);
      }
    }
    console.log();
  } else {
    console.log(
      `  ${RED}${BOLD}✗ Required checks failed. Cannot run QA Monster.${RESET}`,
    );
    console.log(`  ${RED}Fix the issues above and try again.${RESET}\n`);
    process.exit(1);
  }
}

function printRunConfig(): void {
  const config = createRunConfig();
  console.log(`  ${BOLD}Run Configuration:${RESET}`);
  console.log(`    Version: ${config.version}`);
  console.log(`    Run ID: ${config.runId}`);
  console.log(`    Viewports: ${config.viewports.length}`);
  console.log(`    Pages: ${config.pages.length}`);
  console.log(`    Performance Profiling: ${config.performanceProfiling}`);
  console.log(`    Console Error Checking: ${config.consoleErrorChecking}`);
  console.log(`    Overflow Detection: ${config.overflowDetection}`);
  console.log();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const showConfig = args.includes("--config");

  const { results, allRequiredPassed, allPassed } = await runAllChecks();
  printSummary(results, allRequiredPassed, allPassed);

  if (showConfig || allPassed) {
    printRunConfig();
  }

  // Output JSON if requested
  if (args.includes("--json")) {
    console.log(
      JSON.stringify({ results, allRequiredPassed, allPassed }, null, 2),
    );
  }
}

main().catch(console.error);
