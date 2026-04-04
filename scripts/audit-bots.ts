#!/usr/bin/env npx ts-node
/**
 * Bot Logic Auditor CLI
 *
 * Usage: npx ts-node scripts/audit-bots.ts
 *
 * Runs 6 sanity scenarios against all 8 bot personality presets and prints a
 * "Logic Health Report" to the terminal.
 *
 * Exit code:
 *   0 — all checks passed (or only strategy_sanity warnings)
 *   1 — one or more illegal_move (hard) failures found
 */

import { BotAuditor, type BotAuditReport, type BotScenarioResult } from "../src/testing-utilities/bot-auditor";
import { PERSONALITY_PRESETS } from "../src/modules/bot-strategy/presets/personality-presets";
import type { BotStrategy } from "../src/domain/bot-strategy/strategy.types";

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
};

function pass(s: string) {
  return `${C.green}${s}${C.reset}`;
}
function fail(s: string) {
  return `${C.red}${s}${C.reset}`;
}
function warn(s: string) {
  return `${C.yellow}${s}${C.reset}`;
}
function dim(s: string) {
  return `${C.dim}${s}${C.reset}`;
}
function bold(s: string) {
  return `${C.bold}${s}${C.reset}`;
}

// ── Build strategies ──────────────────────────────────────────────────────────

const bots = PERSONALITY_PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  strategy: {
    version: 1,
    tier: "quick",
    personality: preset.personality,
  } as BotStrategy,
}));

// ── Run audit ────────────────────────────────────────────────────────────────

const auditor = new BotAuditor();

console.log(`\n${bold("══════════════════════════════════════════════════")}`);
console.log(`${bold("  BOT LOGIC HEALTH REPORT")}`);
console.log(`${bold("══════════════════════════════════════════════════")}`);
console.log(
  dim(`  Testing ${bots.length} bots × 6 scenarios  |  ${new Date().toISOString()}\n`),
);

const report: BotAuditReport = auditor.runAll(bots);

// ── Print per-bot results ─────────────────────────────────────────────────────

const botNames = [...new Set(report.results.map((r) => r.botName))];

for (const botName of botNames) {
  const botResults = report.results.filter((r) => r.botName === botName);
  const botSummary = report.summary.byBot[botName];
  const totalAssertions = botResults.reduce((s, r) => s + r.assertions.length, 0);
  const illegalFails = botResults
    .flatMap((r) => r.assertions)
    .filter((a) => !a.passed && a.category === "illegal_move");
  const sanityFails = botResults
    .flatMap((r) => r.assertions)
    .filter((a) => !a.passed && a.category === "strategy_sanity");

  const hasHardFail = illegalFails.length > 0;
  const hasSoftFail = sanityFails.length > 0;

  const statusIcon = hasHardFail ? fail("✗ FAIL") : hasSoftFail ? warn("⚠ WARN") : pass("✓ PASS");
  const scoreStr = hasHardFail
    ? fail(`${botSummary.passed}/${totalAssertions}`)
    : hasSoftFail
    ? warn(`${botSummary.passed}/${totalAssertions}`)
    : pass(`${totalAssertions}/${totalAssertions}`);

  console.log(`  ${statusIcon}  ${bold(botName.padEnd(20))} ${scoreStr} checks`);

  // Show failures
  const failures = botResults.flatMap((r) =>
    r.assertions
      .filter((a) => !a.passed)
      .map((a) => ({ scenario: r, assertion: a })),
  );

  for (const { scenario, assertion } of failures) {
    const tag = assertion.category === "illegal_move" ? fail("[ILLEGAL]") : warn("[FLAG]   ");
    console.log(`         ${tag} ${bold(assertion.assertionName)} @ ${dim(scenario.scenarioName)}`);
    console.log(
      `                  Action taken: ${fail(JSON.stringify(scenario.actionTaken))}`,
    );
    console.log(`                  ${dim(assertion.message)}`);
    console.log(
      `                  Context: equity=${(assertion.context.equity * 100).toFixed(1)}%, ` +
        `potOdds=${(assertion.context.potOdds * 100).toFixed(1)}%, ` +
        `toCall=${assertion.context.toCall}, ` +
        `chips=${assertion.context.chips}`,
    );
    console.log(`                  Explanation: ${dim(scenario.explanation)}`);
  }
}

// ── Scenario legend ──────────────────────────────────────────────────────────

console.log(`\n${bold("  ── Scenario Definitions ──────────────────────────")}`);
const uniqueScenarios = [
  ...new Map(report.results.map((r) => [r.scenarioName, r])).values(),
];
for (const r of uniqueScenarios) {
  const categories = r.assertions.map((a) => a.category).join(", ");
  const tag = categories.includes("illegal_move") ? dim("[ILLEGAL]") : dim("[SANITY] ");
  console.log(`  ${tag} ${bold(r.scenarioName.padEnd(28))} ${dim(r.scenarioDescription.substring(0, 60))}...`);
}

// ── Summary footer ────────────────────────────────────────────────────────────

const { totalChecks, passed, failed } = report.summary;
const illegalFails = report.results
  .flatMap((r) => r.assertions)
  .filter((a) => !a.passed && a.category === "illegal_move").length;
const sanityFails = report.results
  .flatMap((r) => r.assertions)
  .filter((a) => !a.passed && a.category === "strategy_sanity").length;

console.log(`\n${bold("══════════════════════════════════════════════════")}`);
console.log(
  `  Total checks: ${bold(String(totalChecks))}   ` +
    `${pass(`${passed} passed`)}   ` +
    (failed > 0 ? fail(`${failed} failed`) : dim("0 failed")),
);
if (illegalFails > 0) {
  console.log(`\n  ${fail(`✗ ${illegalFails} ILLEGAL MOVE violation(s) found`)}`);
}
if (sanityFails > 0) {
  console.log(`  ${warn(`⚠  ${sanityFails} strategy sanity flag(s) (review recommended)`)}`);
}
if (failed === 0) {
  console.log(`\n  ${pass("✓ All bots pass all logic checks")}`);
}
console.log(`${bold("══════════════════════════════════════════════════")}\n`);

// ── Exit code ────────────────────────────────────────────────────────────────
// Hard fail only on illegal_move violations; strategy_sanity flags are non-fatal.
process.exit(illegalFails > 0 ? 1 : 0);
