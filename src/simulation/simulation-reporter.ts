import { Logger } from "@nestjs/common";
import { SimulationStats, SimulationAnomaly } from "./simulation-engine";

export interface SimulationReport {
  summary: {
    totalHands: number;
    totalTournaments: number;
    totalCashGames: number;
    averageHandDurationMs: number;
    chipConservationViolations: number;
    errorRate: number;
    successRate: number;
  };
  handDistribution: {
    preflop: number;
    flop: number;
    turn: number;
    river: number;
    showdown: number;
  };
  botPerformance: Array<{
    botId: string;
    wins: number;
    profit: number;
  }>;
  anomalyBreakdown: {
    critical: number;
    error: number;
    warning: number;
    byType: Record<string, number>;
  };
  recommendations: string[];
}

export class SimulationReporter {
  private readonly logger = new Logger(SimulationReporter.name);

  generateReport(stats: SimulationStats): SimulationReport {
    const totalErrors =
      stats.chipConservationViolations +
      stats.botTimeouts +
      stats.botErrors +
      stats.invalidActions;

    const errorRate = stats.totalHands > 0 ? totalErrors / stats.totalHands : 0;
    const successRate = 1 - errorRate;

    const anomalyBreakdown = this.analyzeAnomalies(stats.anomalies);
    const recommendations = this.generateRecommendations(
      stats,
      anomalyBreakdown,
    );

    const botPerformance = Object.keys(stats.winsByBot)
      .map((botId) => ({
        botId,
        wins: stats.winsByBot[botId] || 0,
        profit: stats.profitByBot[botId] || 0,
      }))
      .sort((a, b) => b.wins - a.wins);

    return {
      summary: {
        totalHands: stats.totalHands,
        totalTournaments: stats.totalTournaments,
        totalCashGames: stats.totalCashGames,
        averageHandDurationMs:
          Math.round(stats.averageHandDurationMs * 100) / 100,
        chipConservationViolations: stats.chipConservationViolations,
        errorRate: Math.round(errorRate * 10000) / 100,
        successRate: Math.round(successRate * 10000) / 100,
      },
      handDistribution: stats.handsByStage as any,
      botPerformance,
      anomalyBreakdown,
      recommendations,
    };
  }

  private analyzeAnomalies(anomalies: SimulationAnomaly[]): {
    critical: number;
    error: number;
    warning: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    let critical = 0;
    let error = 0;
    let warning = 0;

    for (const anomaly of anomalies) {
      byType[anomaly.type] = (byType[anomaly.type] || 0) + 1;

      switch (anomaly.severity) {
        case "critical":
          critical++;
          break;
        case "error":
          error++;
          break;
        case "warning":
          warning++;
          break;
      }
    }

    return { critical, error, warning, byType };
  }

  private generateRecommendations(
    stats: SimulationStats,
    anomalyBreakdown: {
      critical: number;
      error: number;
      warning: number;
      byType: Record<string, number>;
    },
  ): string[] {
    const recommendations: string[] = [];

    if (stats.chipConservationViolations > 0) {
      recommendations.push(
        `CRITICAL: ${stats.chipConservationViolations} chip conservation violations detected. ` +
          `Review betting logic and pot calculations immediately.`,
      );
    }

    const timeoutRate =
      stats.totalHands > 0 ? stats.botTimeouts / stats.totalHands : 0;
    if (timeoutRate > 0.05) {
      recommendations.push(
        `High timeout rate (${(timeoutRate * 100).toFixed(1)}%). ` +
          `Consider increasing turn timeout or optimizing bot response times.`,
      );
    }

    const invalidRate =
      stats.totalHands > 0 ? stats.invalidActions / stats.totalHands : 0;
    if (invalidRate > 0.02) {
      recommendations.push(
        `Elevated invalid action rate (${(invalidRate * 100).toFixed(1)}%). ` +
          `Review action validation logic and bot response handling.`,
      );
    }

    if (anomalyBreakdown.critical > 0) {
      recommendations.push(
        `${anomalyBreakdown.critical} critical anomalies detected. ` +
          `These require immediate attention before production deployment.`,
      );
    }

    const showdownRate =
      stats.totalHands > 0
        ? (stats.handsByStage.showdown || 0) / stats.totalHands
        : 0;
    if (showdownRate < 0.1) {
      recommendations.push(
        `Low showdown rate (${(showdownRate * 100).toFixed(1)}%). ` +
          `Consider adjusting bot aggression or reviewing fold logic.`,
      );
    }

    if (stats.allInHands / stats.totalHands > 0.3) {
      recommendations.push(
        `High all-in frequency (${((stats.allInHands / stats.totalHands) * 100).toFixed(1)}%). ` +
          `Side pot logic should be thoroughly tested.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "No significant issues detected. System appears stable.",
      );
    }

    return recommendations;
  }

  printReport(report: SimulationReport): void {
    console.log("\n" + "=".repeat(60));
    console.log("SIMULATION REPORT");
    console.log("=".repeat(60));

    console.log("\n📊 SUMMARY");
    console.log("-".repeat(40));
    console.log(`Total Hands:        ${report.summary.totalHands}`);
    console.log(`Total Tournaments:  ${report.summary.totalTournaments}`);
    console.log(`Total Cash Games:   ${report.summary.totalCashGames}`);
    console.log(
      `Avg Hand Duration:  ${report.summary.averageHandDurationMs}ms`,
    );
    console.log(`Success Rate:       ${report.summary.successRate}%`);
    console.log(`Error Rate:         ${report.summary.errorRate}%`);
    console.log(
      `Chip Violations:    ${report.summary.chipConservationViolations}`,
    );

    console.log("\n🎰 HAND DISTRIBUTION");
    console.log("-".repeat(40));
    const total = report.summary.totalHands;
    for (const [stage, count] of Object.entries(report.handDistribution)) {
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
      console.log(`${stage.padEnd(12)} ${String(count).padStart(6)} (${pct}%)`);
    }

    if (report.botPerformance.length > 0) {
      console.log("\n🤖 BOT PERFORMANCE");
      console.log("-".repeat(40));
      for (const bot of report.botPerformance.slice(0, 10)) {
        console.log(
          `${bot.botId.padEnd(15)} Wins: ${String(bot.wins).padStart(3)}  ` +
            `Profit: ${bot.profit >= 0 ? "+" : ""}${bot.profit}`,
        );
      }
    }

    console.log("\n⚠️ ANOMALIES");
    console.log("-".repeat(40));
    console.log(`Critical: ${report.anomalyBreakdown.critical}`);
    console.log(`Error:    ${report.anomalyBreakdown.error}`);
    console.log(`Warning:  ${report.anomalyBreakdown.warning}`);

    if (Object.keys(report.anomalyBreakdown.byType).length > 0) {
      console.log("\nBy Type:");
      for (const [type, count] of Object.entries(
        report.anomalyBreakdown.byType,
      )) {
        console.log(`  ${type}: ${count}`);
      }
    }

    console.log("\n💡 RECOMMENDATIONS");
    console.log("-".repeat(40));
    for (const rec of report.recommendations) {
      console.log(`• ${rec}`);
    }

    console.log("\n" + "=".repeat(60) + "\n");
  }
}
