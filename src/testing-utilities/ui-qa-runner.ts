import { Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { randomUUID } from "crypto";

import { GameInstance } from "../services/game/live-game-manager.service";
import type { GameStateSnapshot } from "../services/game/live-game-manager.service";
import { PERSONALITY_PRESETS } from "../modules/bot-strategy/presets/personality-presets";
import type { BotStrategy } from "../domain/bot-strategy/strategy.types";
import {
  analyzeScreenshotsWithRateLimit,
  GeminiAnalysis,
} from "./gemini-qa-service";

export interface UIQAResult {
  gamesRun: number;
  screenshotsTaken: number;
  analysisResults: Array<{
    screenshotPath: string;
    gameNumber: number;
    stage: string;
    analysis: GeminiAnalysis;
  }>;
  reportPath: string;
  duration: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function runSingleGame(
  gameNumber: number,
  config: {
    botCount: number;
    startingChips?: number;
    smallBlind?: number;
    bigBlind?: number;
  },
  onScreenshot: (
    path: string,
    state: GameStateSnapshot,
    stage: string,
  ) => Promise<void>,
): Promise<void> {
  const logger = new Logger("UIQARunner");
  const eventEmitter = new EventEmitter2();
  const gameId = `ui-qa-game-${gameNumber}-${randomUUID().substring(0, 8)}`;
  const tableId = `table-${randomUUID().substring(0, 8)}`;
  const startingChips = config.startingChips ?? 1000;
  const smallBlind = config.smallBlind ?? 10;
  const bigBlind = config.bigBlind ?? 20;

  const game = new GameInstance(logger, eventEmitter, {
    tableId,
    gameId,
    smallBlind,
    bigBlind,
    startingChips,
    sleepMs: 0,
  });

  // Add bots with shuffled personality presets
  const shuffledPresets = shuffleArray(PERSONALITY_PRESETS);
  const botNames = [
    "Shark",
    "Rock",
    "Maniac",
    "Station",
    "Nit",
    "ProBot",
    "Tricky",
    "Bully",
    "Shadow",
  ];

  for (let i = 0; i < config.botCount; i++) {
    const preset = shuffledPresets[i % shuffledPresets.length];
    const strategy: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: preset.personality,
    };

    game.addPlayer({
      id: `bot-${i}-${randomUUID().substring(0, 6)}`,
      name: botNames[i] || `Bot${i}`,
      strategy,
      chips: startingChips,
    });
  }

  // Track stages to only screenshot at meaningful moments
  let lastStage = "pre-flop";
  const screenshotStages = new Set<string>();

  const stateUpdatedHandler = async () => {
    const currentStage = game.stage;

    // Screenshot at stage transitions (when stage changes)
    // and at showdown
    if (currentStage !== lastStage || currentStage === "showdown") {
      if (!screenshotStages.has(currentStage)) {
        screenshotStages.add(currentStage);
        const state = game.getPublicState();
        try {
          await onScreenshot(
            `game-${gameNumber}-${currentStage}`,
            state,
            currentStage,
          );
        } catch (e) {
          logger.warn(`Failed to take screenshot: ${(e as Error).message}`);
        }
      }
      lastStage = currentStage;
    }
  };

  eventEmitter.on("game.stateUpdated", stateUpdatedHandler);

  try {
    await game.startGame();
  } catch (e) {
    logger.error(`Game ${gameNumber} failed:`, (e as Error).message);
  }

  eventEmitter.off("game.stateUpdated", stateUpdatedHandler);
}

export async function runUIQA(config: {
  gameCount: number;
  botCount?: number;
  startingChips?: number;
  smallBlind?: number;
  bigBlind?: number;
}): Promise<UIQAResult> {
  try {
    // Import these here to avoid module shadowing issues
    const fs = await import("fs");
    const path = await import("path");

    const startTime = Date.now();
    const botCount = config.botCount ?? 4;
    const startingChips = config.startingChips ?? 1000;
    const smallBlind = config.smallBlind ?? 10;
    const bigBlind = config.bigBlind ?? 20;

    const screenshotDir = path.join(process.cwd(), "tmp", "ui-qa-screenshots");
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshots: Array<{
      path: string;
      state: GameStateSnapshot;
      gameNumber: number;
      stage: string;
    }> = [];
    const screenshotStages = new Set<string>(); // Track stages to avoid duplicate screenshots

    console.log(
      `🎬 Running ${config.gameCount} UI QA games with ${botCount} bots each...\n`,
    );

    for (let i = 1; i <= config.gameCount; i++) {
      process.stdout.write(`Game ${i}/${config.gameCount}... `);

      screenshotStages.clear(); // Reset for each game
      await runSingleGame(
        i,
        { botCount, startingChips, smallBlind, bigBlind },
        async (name, state, stage) => {
          // Only screenshot each stage once per game (avoid duplicates)
          if (!screenshotStages.has(stage)) {
            screenshotStages.add(stage);
            const stateJsonPath = path.join(screenshotDir, `${name}.json`);
            fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2));
            screenshots.push({
              path: stateJsonPath,
              state,
              gameNumber: i,
              stage,
            });
          }
        },
      );

      console.log("✓");
    }

    console.log(`\n📸 Took ${screenshots.length} screenshots\n`);

    // Convert to screenshot items for Gemini
    const screenshotItems = screenshots.map((s) => ({
      path: s.path,
      state: s.state,
    }));

    console.log(`🤖 Sending to Gemini for analysis...\n`);
    const analysisResults =
      await analyzeScreenshotsWithRateLimit(screenshotItems);

    console.log(`\n📊 Generating report...`);

    // Generate UI_QA_REPORT.md for detailed analysis
    const reportPath = path.join(process.cwd(), "UI_QA_REPORT.md");

    let reportContent = `# UI Visual QA Report - Auto-Generated

Date: ${new Date().toISOString()}
Games analyzed: ${config.gameCount}
Screenshots: ${screenshots.length}

## Summary

`;

    let totalImprovements = 0;
    let totalUXIssues = 0;

    analysisResults.forEach((analysis) => {
      totalImprovements += analysis.improvements.length;
      totalUXIssues += analysis.uxIssues.length;
    });

    reportContent += `- **Design improvements needed**: ${totalImprovements}\n`;
    reportContent += `- **UX issues found**: ${totalUXIssues}\n\n`;

    // Group by game and stage
    screenshots.forEach((screenshot, idx) => {
      const analysis = analysisResults[idx];

      reportContent += `---\n\n`;
      reportContent += `## Screenshot ${idx + 1}: Game #${screenshot.gameNumber} - ${screenshot.stage}\n\n`;
      reportContent += `**File**: \`tmp/ui-qa-screenshots/${path.basename(screenshot.path)}\`\n\n`;

      if (analysis.designQuality) {
        reportContent += `**Design Score**: ${analysis.designQuality.score}/10 - ${analysis.designQuality.summary}\n\n`;
      }

      if (analysis.strengths.length > 0) {
        reportContent += `### ✅ Strengths\n\n`;
        analysis.strengths.forEach((strength) => {
          reportContent += `- ${strength}\n`;
        });
        reportContent += "\n";
      }

      if (analysis.improvements.length > 0) {
        reportContent += `### 🎨 Improvements\n\n`;
        analysis.improvements.forEach((improvement) => {
          reportContent += `- **${improvement.area}** (${improvement.priority}): ${improvement.suggestion}\n`;
          reportContent += `  - Issue: ${improvement.issue}\n`;
        });
        reportContent += "\n";
      }

      if (analysis.uxIssues.length > 0) {
        reportContent += `### 😕 UX Issues\n\n`;
        analysis.uxIssues.forEach((issue) => {
          reportContent += `- **${issue.category}**: ${issue.description}\n`;
          reportContent += `  - Impact: ${issue.impact}\n`;
        });
        reportContent += "\n";
      }
    });

    fs.writeFileSync(reportPath, reportContent, "utf-8");

    const duration = Date.now() - startTime;

    console.log(`✅ Report saved to ${reportPath}`);

    return {
      gamesRun: config.gameCount,
      screenshotsTaken: screenshots.length,
      analysisResults: screenshots.map((s, idx) => ({
        screenshotPath: s.path,
        gameNumber: s.gameNumber,
        stage: s.stage,
        analysis: analysisResults[idx],
      })),
      reportPath,
      duration,
    };
  } catch (e) {
    console.error("💥 Error in runUIQA:", (e as Error).message);
    throw e;
  }
}
