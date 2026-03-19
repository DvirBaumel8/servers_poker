#!/usr/bin/env node

import { SimulationEngine, SimulationConfig } from "./simulation-engine";
import { SimulationReporter } from "./simulation-reporter";

async function main() {
  const args = process.argv.slice(2);
  const config: SimulationConfig = {
    numTournaments: 10,
    numCashGames: 5,
    handsPerCashGame: 100,
    botsPerTable: 6,
    startingChips: 1000,
    blinds: { small: 10, big: 20, ante: 0 },
    deterministicMode: false,
    verboseLogging: false,
    stopOnError: false,
    validateChipsAfterEachHand: true,
  };

  for (const arg of args) {
    const [key, value] = arg.replace("--", "").split("=");
    switch (key) {
      case "tournaments":
        config.numTournaments = parseInt(value, 10);
        break;
      case "cash":
        config.numCashGames = parseInt(value, 10);
        break;
      case "hands":
        config.handsPerCashGame = parseInt(value, 10);
        break;
      case "bots":
        config.botsPerTable = parseInt(value, 10);
        break;
      case "chips":
        config.startingChips = parseInt(value, 10);
        break;
      case "seed":
        config.seed = parseInt(value, 10);
        config.deterministicMode = true;
        break;
      case "verbose":
        config.verboseLogging = value === "true";
        break;
      case "stop-on-error":
        config.stopOnError = value === "true";
        break;
    }
  }

  console.log("🎲 Poker Simulation Engine");
  console.log("Configuration:", JSON.stringify(config, null, 2));

  const engine = new SimulationEngine(config);
  const reporter = new SimulationReporter();

  engine.on("anomaly", (anomaly) => {
    if (anomaly.severity === "critical") {
      console.error(`🚨 CRITICAL: ${anomaly.message}`);
    }
  });

  const startTime = Date.now();
  const stats = await engine.runSimulation();
  const duration = Date.now() - startTime;

  console.log(`\n✅ Simulation completed in ${(duration / 1000).toFixed(2)}s`);

  const report = reporter.generateReport(stats);
  reporter.printReport(report);

  if (stats.chipConservationViolations > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Simulation failed:", error);
  process.exit(1);
});
