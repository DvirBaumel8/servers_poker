#!/usr/bin/env npx ts-node
/**
 * Automated Poker Logic Validator
 *
 * Usage:
 *   npm run audit:games
 *   npm run audit:games -- --batch=500 --concurrency=100
 *
 * Exit codes:
 *   0 — no bugs found
 *   1 — bugs found (CI-friendly)
 *   2 — fatal error (DB connection, etc.)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { GameValidatorService } from "../src/services/audit/game-validator.service";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Parse optional CLI flags: --batch=N --concurrency=N
const args = process.argv.slice(2);
let batchSize = 1000;
let concurrency = 200;

for (const arg of args) {
  const batchMatch = arg.match(/^--batch=(\d+)$/);
  const concMatch = arg.match(/^--concurrency=(\d+)$/);
  if (batchMatch) batchSize = parseInt(batchMatch[1], 10);
  if (concMatch) concurrency = parseInt(concMatch[1], 10);
}

async function main(): Promise<void> {
  console.log("=== Automated Poker Logic Validator ===\n");
  console.log(`Batch size : ${batchSize}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log("");

  const svc = new GameValidatorService();

  try {
    await svc.connect();
  } catch (err) {
    console.error("Fatal: could not connect to database:", err);
    process.exit(2);
  }

  let summary;
  try {
    summary = await svc.auditHands(batchSize, concurrency);
  } catch (err) {
    console.error("Fatal: audit failed:", err);
    await svc.disconnect().catch(() => {});
    process.exit(2);
  }

  await svc.disconnect().catch(() => {});

  // Print summary
  console.log(`Audited ${summary.audited} hand(s).\n`);
  console.log("Results by check:");
  console.log(`  Chip leaks (zero-sum)         : ${summary.chipLeaks}`);
  console.log(`  Pot mismatches                : ${summary.potMismatches}`);
  console.log(`  Action sequence errors        : ${summary.sequenceErrors}`);
  console.log(`  Side-pot eligibility errors   : ${summary.sidePotErrors}`);
  console.log(`  Winner-calculation errors     : ${summary.showdownErrors}`);
  console.log(`  Winner amount errors          : ${summary.winnerAmountErrors}`);
  console.log(`  Duplicate card errors         : ${summary.duplicateCardErrors}`);
  console.log(`  Seed replay errors            : ${summary.seedReplayErrors}`);
  console.log(`  Street progression errors     : ${summary.streetProgressionErrors}`);
  console.log(`  Min-raise violations          : ${summary.minRaiseErrors}`);
  console.log(`  Odd-chip rule violations      : ${summary.oddChipErrors}`);
  console.log(`  Blind structure errors        : ${summary.blindStructureErrors}`);
  console.log(`  Duplicate action_seq errors   : ${summary.duplicateActionSeqErrors}`);
  console.log(`  Cross-hand chip continuity    : ${summary.chipContinuityErrors}`);
  console.log(`  Win-rate anomalies (>85%)     : ${summary.winRateAnomalies}`);
  console.log(`  Zero response-time actions    : ${summary.zeroResponseTimeErrors}`);
  console.log(`  ITM count errors (pods)       : ${summary.itmCountErrors}`);
  console.log(`  Prize pool mismatches (pods)  : ${summary.prizePoolErrors}`);
  console.log("");

  if (summary.totalBugsFound === 0) {
    console.log(`Audited ${summary.audited} hands. No bugs found.`);
    process.exit(0);
  }

  // Build human-readable bug summary for the task-required output format
  const parts: string[] = [];
  if (summary.chipLeaks > 0)
    parts.push(`${summary.chipLeaks} chip leak(s)`);
  if (summary.potMismatches > 0)
    parts.push(`${summary.potMismatches} pot mismatch(es)`);
  if (summary.sequenceErrors > 0)
    parts.push(`${summary.sequenceErrors} sequence error(s)`);
  if (summary.sidePotErrors > 0)
    parts.push(`${summary.sidePotErrors} side-pot error(s)`);
  if (summary.showdownErrors > 0)
    parts.push(`${summary.showdownErrors} winner-calculation error(s)`);
  if (summary.duplicateCardErrors > 0)
    parts.push(`${summary.duplicateCardErrors} duplicate-card error(s)`);
  if (summary.seedReplayErrors > 0)
    parts.push(`${summary.seedReplayErrors} seed-replay error(s)`);
  if (summary.streetProgressionErrors > 0)
    parts.push(`${summary.streetProgressionErrors} street-progression error(s)`);
  if (summary.minRaiseErrors > 0)
    parts.push(`${summary.minRaiseErrors} min-raise violation(s)`);
  if (summary.oddChipErrors > 0)
    parts.push(`${summary.oddChipErrors} odd-chip violation(s)`);
  if (summary.itmCountErrors > 0)
    parts.push(`${summary.itmCountErrors} ITM-count error(s)`);
  if (summary.prizePoolErrors > 0)
    parts.push(`${summary.prizePoolErrors} prize-pool mismatch(es)`);
  if (summary.chipContinuityErrors > 0)
    parts.push(`${summary.chipContinuityErrors} chip-continuity error(s)`);
  if (summary.duplicateActionSeqErrors > 0)
    parts.push(`${summary.duplicateActionSeqErrors} duplicate-action-seq error(s)`);
  if (summary.winnerAmountErrors > 0)
    parts.push(`${summary.winnerAmountErrors} winner-amount error(s)`);
  if (summary.blindStructureErrors > 0)
    parts.push(`${summary.blindStructureErrors} blind-structure error(s)`);
  if (summary.winRateAnomalies > 0)
    parts.push(`${summary.winRateAnomalies} win-rate anomal(ies)`);
  if (summary.zeroResponseTimeErrors > 0)
    parts.push(`${summary.zeroResponseTimeErrors} zero-response-time action(s)`);

  console.log(
    `Audited ${summary.audited} hands. Found ${parts.join(" and ")}.`,
  );
  console.log(
    "\nDetails stored in the logic_bugs table. Failing hands flagged with validation_error = true.",
  );

  process.exit(1);
}

main();
