/**
 * run-chaos-suite.ts
 * ------------------
 * Executes the 4-job Chaos Testing Suite to verify:
 *   1. The "69 bug" is dead — raise amounts are varied, not all the same
 *   2. Source field is populated ("Hard Rule" | "Personality" | etc.)
 *   3. The lean log schema is correct end-to-end
 *
 * Jobs:
 *   1. Clone War        — 6 identical bots, clone war mode
 *   2. Whale vs Minnows — 1 bot 5 000 chips vs 5 bots 100 chips
 *   3. Strategy Hybrid  — 3 Strategy-tier (rules) vs 3 Quick-tier
 *   4. Hyper Turbo      — mixed DNA, blinds double every 2 hands
 *
 * Usage:
 *   npx tsx scripts/run-chaos-suite.ts
 *
 * Output files written to logs/chaos/:
 *   clone_war_results.json
 *   whale_pressure_results.json
 *   hybrid_logic_results.json
 *   hyper_turbo_results.json
 */

import { runChaosTournament, type ChaosBotConfig } from "../src/testing-utilities/chaos-tournament";
import type { BotStrategy } from "../src/domain/bot-strategy/strategy.types";
import type { ActionLog } from "../src/services/game/tournament-log.types";

// ─── Helper: quick-tier bot ───────────────────────────────────────────────────

function quickBot(
  name: string,
  aggression: number,
  bluffFrequency: number,
  riskTolerance: number,
  tightness: number,
  startingChips?: number,
): ChaosBotConfig {
  return {
    name,
    startingChips,
    strategy: {
      version: 1,
      tier: "quick",
      personality: { aggression, bluffFrequency, riskTolerance, tightness },
    } as BotStrategy,
  };
}

// ─── Helper: strategy-tier bot ───────────────────────────────────────────────

function strategyBot(name: string, aggression: number, tightness: number): ChaosBotConfig {
  return {
    name,
    strategy: {
      version: 1,
      tier: "strategy",
      personality: { aggression, bluffFrequency: 15, riskTolerance: 50, tightness },
      rules: {
        preflop: [
          {
            id: `${name}-pf-premium`,
            priority: 1,
            enabled: true,
            label: "Raise premium hands preflop",
            conditions: [{ field: "holeCardRank", operator: "equals", value: "premium" }],
            action: { type: "raise", sizing: { mode: "bb_multiple", value: 3.0 } },
          },
          {
            id: `${name}-pf-weak-fold`,
            priority: 2,
            enabled: true,
            label: "Fold weak hands preflop",
            conditions: [{ field: "holeCardRank", operator: "equals", value: "weak" }],
            action: { type: "fold" },
          },
        ],
        flop: [
          {
            id: `${name}-flop-strong`,
            priority: 1,
            enabled: true,
            label: "Raise strong flop hands",
            conditions: [
              { field: "handStrength", operator: "in", value: ["trips", "straight", "flush", "full_house", "quads"] },
            ],
            action: { type: "raise", sizing: { mode: "pot_fraction", value: 0.75 } },
          },
        ],
        river: [
          {
            id: `${name}-river-bluff-catch`,
            priority: 1,
            enabled: true,
            label: "Call river with strong made hand",
            conditions: [
              { field: "handStrength", operator: "in", value: ["straight", "flush", "full_house", "quads", "straight_flush"] },
            ],
            action: { type: "call" },
          },
        ],
      },
    } as BotStrategy,
  };
}

// ─── Anomaly analysis ─────────────────────────────────────────────────────────

interface AnomalyReport {
  jobName: string;
  totalActions: number;
  raiseActions: number;
  uniqueRaiseAmounts: Set<number>;
  sourceDistribution: Record<string, number>;
  equityRange: { min: number; max: number };
  anomalies: string[];
}

function analyzeJob(jobName: string, actions: ActionLog[]): AnomalyReport {
  const report: AnomalyReport = {
    jobName,
    totalActions: actions.length,
    raiseActions: 0,
    uniqueRaiseAmounts: new Set(),
    sourceDistribution: {},
    equityRange: { min: Infinity, max: -Infinity },
    anomalies: [],
  };

  for (const action of actions) {
    // Source distribution
    const src = action.metrics.source ?? "unknown";
    report.sourceDistribution[src] = (report.sourceDistribution[src] ?? 0) + 1;

    // Equity range
    if (action.metrics.eq < report.equityRange.min) report.equityRange.min = action.metrics.eq;
    if (action.metrics.eq > report.equityRange.max) report.equityRange.max = action.metrics.eq;

    // Raise amounts
    if (action.dec === "raise" && action.amt !== undefined) {
      report.raiseActions++;
      report.uniqueRaiseAmounts.add(action.amt);
    }
  }

  // Anomaly checks
  if (report.raiseActions > 5 && report.uniqueRaiseAmounts.size === 1) {
    const [onlyAmt] = report.uniqueRaiseAmounts;
    report.anomalies.push(
      `🔴 RAISE MONOTONY — all ${report.raiseActions} raise actions used the same amount: ${onlyAmt}. Potential "69 bug" still active.`,
    );
  }

  if (report.raiseActions > 0 && report.uniqueRaiseAmounts.size <= 2) {
    report.anomalies.push(
      `🟡 LOW RAISE VARIETY — only ${report.uniqueRaiseAmounts.size} distinct raise amounts over ${report.raiseActions} raises: [${[...report.uniqueRaiseAmounts].join(", ")}]`,
    );
  }

  const unknownCount = report.sourceDistribution["unknown"] ?? 0;
  if (unknownCount > 0) {
    report.anomalies.push(`🟡 MISSING SOURCE — ${unknownCount} actions have no decision source field`);
  }

  if (report.equityRange.min === Infinity) {
    report.anomalies.push("🟡 NO EQUITY DATA — no actions had equity values");
  } else if (report.equityRange.max - report.equityRange.min < 0.05) {
    report.anomalies.push(
      `🟡 NARROW EQUITY RANGE — all equity values between ${report.equityRange.min.toFixed(3)} and ${report.equityRange.max.toFixed(3)}`,
    );
  }

  return report;
}

function printReport(r: AnomalyReport) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${r.jobName}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Actions   : ${r.totalActions}`);
  console.log(`  Raises    : ${r.raiseActions} (${r.uniqueRaiseAmounts.size} unique amounts)`);
  if (r.uniqueRaiseAmounts.size > 0 && r.uniqueRaiseAmounts.size <= 10) {
    console.log(`  Raise $$$  : [${[...r.uniqueRaiseAmounts].sort((a, b) => a - b).join(", ")}]`);
  }
  console.log(`  Equity    : ${r.equityRange.min.toFixed(3)} – ${r.equityRange.max.toFixed(3)}`);
  console.log(`  Sources   :`);
  for (const [src, count] of Object.entries(r.sourceDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${src.padEnd(20)} ${count}`);
  }
  if (r.anomalies.length === 0) {
    console.log(`  Anomalies : ✅ None detected`);
  } else {
    console.log(`  Anomalies :`);
    for (const a of r.anomalies) console.log(`    ${a}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const OUT_DIR = "logs/chaos";
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           CHAOS TESTING SUITE — BotRoyale Engine        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const allReports: AnomalyReport[] = [];

  // ─── JOB 1: Clone War ──────────────────────────────────────────────────────
  console.log("\n[1/4] Clone War — 6 identical bots, aggression 50...");
  const cloneBots: ChaosBotConfig[] = Array.from({ length: 6 }, (_, i) =>
    quickBot(`Clone${i + 1}`, 50, 20, 50, 50),
  );
  const job1 = await runChaosTournament({
    bots: cloneBots,
    cloneWarMode: true,
    bigBlind: 100,
    smallBlind: 50,
    handLimit: 200,
    outputPath: `${OUT_DIR}/clone_war_results.json`,
  });
  console.log(`    Winner: ${job1.winner ?? "(no winner — hand limit)"} | Hands: ${job1.handsPlayed}`);
  console.log(`    Elimination order: ${job1.eliminationOrder.join(" → ") || "(none)"}`);
  const r1 = analyzeJob("JOB 1 — Clone War", job1.log.hands.flatMap((h) => h.actions));
  allReports.push(r1);
  printReport(r1);

  // ─── JOB 2: Whale vs Minnows ───────────────────────────────────────────────
  console.log("\n[2/4] Whale vs Minnows — 1 × 5 000 chips vs 5 × 100 chips...");
  const whaleBots: ChaosBotConfig[] = [
    quickBot("Whale", 70, 30, 60, 40, 5_000),
    quickBot("Minnow1", 40, 10, 30, 70, 100),
    quickBot("Minnow2", 35, 15, 25, 75, 100),
    quickBot("Minnow3", 50, 20, 40, 60, 100),
    quickBot("Minnow4", 45, 10, 35, 65, 100),
    quickBot("Minnow5", 30, 5, 20, 80, 100),
  ];
  const job2 = await runChaosTournament({
    bots: whaleBots,
    stackImbalanceMode: true,
    bigBlind: 20,
    smallBlind: 10,
    handLimit: 300,
    outputPath: `${OUT_DIR}/whale_pressure_results.json`,
  });
  console.log(`    Winner: ${job2.winner ?? "(no winner — hand limit)"} | Hands: ${job2.handsPlayed}`);
  console.log(`    Final chips: ${JSON.stringify(job2.finalChips)}`);
  const r2 = analyzeJob("JOB 2 — Whale vs Minnows", job2.log.hands.flatMap((h) => h.actions));
  allReports.push(r2);
  printReport(r2);

  // ─── JOB 3: Strategy Hybrid ────────────────────────────────────────────────
  console.log("\n[3/4] Strategy Hybrid — 3 rules-based vs 3 quick-tier...");
  const hybridBots: ChaosBotConfig[] = [
    strategyBot("RulesShark", 65, 65),
    strategyBot("RulesRock", 30, 80),
    strategyBot("RulesBully", 80, 50),
    quickBot("QuickManiac", 90, 70, 80, 15),
    quickBot("QuickNit", 20, 5, 20, 90),
    quickBot("QuickBalance", 55, 25, 55, 55),
  ];
  const job3 = await runChaosTournament({
    bots: hybridBots,
    bigBlind: 100,
    smallBlind: 50,
    handLimit: 300,
    outputPath: `${OUT_DIR}/hybrid_logic_results.json`,
  });
  console.log(`    Winner: ${job3.winner ?? "(no winner — hand limit)"} | Hands: ${job3.handsPlayed}`);
  console.log(`    Elimination order: ${job3.eliminationOrder.join(" → ") || "(none)"}`);
  const r3 = analyzeJob("JOB 3 — Strategy Hybrid", job3.log.hands.flatMap((h) => h.actions));
  allReports.push(r3);
  printReport(r3);

  // ─── JOB 4: Hyper Turbo ────────────────────────────────────────────────────
  console.log("\n[4/4] Hyper Turbo — mixed DNA, blinds double every 2 hands...");
  const turboBots: ChaosBotConfig[] = [
    quickBot("TurboManiac1", 95, 80, 90, 10),
    quickBot("TurboManiac2", 90, 75, 85, 15),
    quickBot("TurboRock1", 20, 5, 25, 88),
    quickBot("TurboRock2", 25, 8, 30, 85),
    quickBot("TurboNit", 15, 3, 20, 95),
    quickBot("TurboBalance", 55, 25, 50, 55),
  ];
  const job4 = await runChaosTournament({
    bots: turboBots,
    bigBlind: 20,
    smallBlind: 10,
    handLimit: 200,
    blindEscalationEveryHands: 2,
    outputPath: `${OUT_DIR}/hyper_turbo_results.json`,
  });
  console.log(`    Winner: ${job4.winner ?? "(no winner — hand limit)"} | Hands: ${job4.handsPlayed}`);
  console.log(`    Elimination order: ${job4.eliminationOrder.join(" → ") || "(none)"}`);
  const r4 = analyzeJob("JOB 4 — Hyper Turbo", job4.log.hands.flatMap((h) => h.actions));
  allReports.push(r4);
  printReport(r4);

  // ─── Overall anomaly summary ───────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                  ANOMALY SUMMARY                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  let totalAnomalies = 0;
  for (const r of allReports) {
    totalAnomalies += r.anomalies.length;
    if (r.anomalies.length > 0) {
      console.log(`\n  ${r.jobName}:`);
      for (const a of r.anomalies) console.log(`    ${a}`);
    }
  }

  if (totalAnomalies === 0) {
    console.log("\n  ✅ No anomalies detected across all 4 jobs.");
    console.log("  ✅ Raise amounts are varied — 69-bug confirmed DEAD.");
    console.log("  ✅ Source field populated on all decisions.");
    console.log("  ✅ Equity ranges show real variance.");
  }

  console.log(`\n  Output files written to: ${OUT_DIR}/`);
  console.log("  • clone_war_results.json");
  console.log("  • whale_pressure_results.json");
  console.log("  • hybrid_logic_results.json");
  console.log("  • hyper_turbo_results.json\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
