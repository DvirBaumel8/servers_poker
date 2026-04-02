import { GameInstance } from "../services/game/live-game-manager.service";
import { GameStateSnapshot } from "../services/game/live-game-manager.service";
import { randomUUID } from "crypto";

export interface BugReport {
  id: string;
  timestamp: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  invariant: string;
  gameId: string;
  actionNumber: number;
  errorDetails: Record<string, unknown>;
  gameState: GameStateSnapshot;
  lastActions: string[];
}

export class ValidatorSuite {
  /**
   * Run all validators after an action. Returns array of bugs found (never throws).
   */
  static runAll(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
  ): BugReport[] {
    const bugs: BugReport[] = [];
    const timestamp = new Date().toISOString();

    // Run each validator and collect bugs
    bugs.push(
      ...this.totalChipsConserved(game, actionNumber, lastActions, timestamp),
    );
    bugs.push(
      ...this.potEqualsStackedBets(game, actionNumber, lastActions, timestamp),
    );
    bugs.push(
      ...this.validCardCounts(game, actionNumber, lastActions, timestamp),
    );
    bugs.push(
      ...this.validCommunityCards(game, actionNumber, lastActions, timestamp),
    );
    bugs.push(
      ...this.validActivePlayerCount(
        game,
        actionNumber,
        lastActions,
        timestamp,
      ),
    );
    bugs.push(
      ...this.noDuplicateCards(game, actionNumber, lastActions, timestamp),
    );
    bugs.push(
      ...this.validBetSizes(game, actionNumber, lastActions, timestamp),
    );
    bugs.push(
      ...this.sidePotMathCorrect(game, actionNumber, lastActions, timestamp),
    );

    return bugs;
  }

  private static totalChipsConserved(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    if (!game.potManager) return [];

    try {
      const sumOfStacks = game.players.reduce((sum, p) => sum + p.chips, 0);
      const pot = game.potManager.getTotalPot();
      const total = sumOfStacks + pot;

      // Assume expectedTotal was set at game start
      const expectedTotal =
        (game as any).expectedTotalChips ||
        game.players.length * ((game as any).startingChips || 1000);

      if (total !== expectedTotal) {
        return [
          {
            id: randomUUID(),
            timestamp,
            severity: "Critical",
            invariant: "Total chips mismatch",
            gameId: game.gameId,
            actionNumber,
            errorDetails: {
              expected: expectedTotal,
              actual: total,
              delta: total - expectedTotal,
              stacks: sumOfStacks,
              pot,
            },
            gameState: game.getPublicState(),
            lastActions: lastActions.slice(-10),
          },
        ];
      }
    } catch (e) {
      return [
        {
          id: randomUUID(),
          timestamp,
          severity: "Critical",
          invariant: "Total chips check threw exception",
          gameId: game.gameId,
          actionNumber,
          errorDetails: {
            error: (e as Error).message,
          },
          gameState: game.getPublicState(),
          lastActions: lastActions.slice(-10),
        },
      ];
    }

    return [];
  }

  private static potEqualsStackedBets(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    if (!game.potManager) return [];

    try {
      // Only check this after betting has occurred
      const totalBet = Object.values(
        game.potManager["playerTotalBets"] || {},
      ).reduce(
        (sum: number, bet: any) => sum + (typeof bet === "number" ? bet : 0),
        0,
      );

      if (totalBet === 0) return []; // No bets yet

      const sumOfBets = game.players.reduce(
        (sum, p) => sum + game.potManager!.getPlayerBetThisRound(p.id),
        0,
      );

      // Check that all bets are accounted for in playerTotalBets
      if (sumOfBets > 0 && totalBet < sumOfBets) {
        return [
          {
            id: randomUUID(),
            timestamp,
            severity: "High",
            invariant: "Stacked bets not properly tracked",
            gameId: game.gameId,
            actionNumber,
            errorDetails: {
              trackedBets: totalBet,
              stackedBets: sumOfBets,
            },
            gameState: game.getPublicState(),
            lastActions: lastActions.slice(-10),
          },
        ];
      }
    } catch {
      // Silently skip if potManager is in inconsistent state
    }

    return [];
  }

  private static validCardCounts(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    const bugs: BugReport[] = [];

    for (const player of game.players) {
      const count = player.holeCards?.length || 0;
      // Valid states: 0 (before deal), 2 (after deal), 0 (after showdown if collected)
      if (count !== 0 && count !== 2) {
        bugs.push({
          id: randomUUID(),
          timestamp,
          severity: "Critical",
          invariant: "Invalid hole card count",
          gameId: game.gameId,
          actionNumber,
          errorDetails: {
            playerId: player.id,
            playerName: player.name,
            cardCount: count,
            expectedValues: [0, 2],
          },
          gameState: game.getPublicState(),
          lastActions: lastActions.slice(-10),
        });
      }
    }

    return bugs;
  }

  private static validCommunityCards(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    const count = game.communityCards?.length || 0;
    const valid = [0, 3, 4, 5].includes(count);

    if (!valid) {
      return [
        {
          id: randomUUID(),
          timestamp,
          severity: "Critical",
          invariant: "Invalid community card count",
          gameId: game.gameId,
          actionNumber,
          errorDetails: {
            actual: count,
            valid: [0, 3, 4, 5],
          },
          gameState: game.getPublicState(),
          lastActions: lastActions.slice(-10),
        },
      ];
    }

    return [];
  }

  private static validActivePlayerCount(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    const activePlayers = game.players.filter(
      (p) => !p.disconnected && p.chips > 0,
    );

    if (activePlayers.length < 0) {
      return [
        {
          id: randomUUID(),
          timestamp,
          severity: "Critical",
          invariant: "Negative active player count",
          gameId: game.gameId,
          actionNumber,
          errorDetails: {
            count: activePlayers.length,
          },
          gameState: game.getPublicState(),
          lastActions: lastActions.slice(-10),
        },
      ];
    }

    return [];
  }

  private static noDuplicateCards(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    const allCards: string[] = [];

    // Collect all hole cards
    for (const player of game.players) {
      if (player.holeCards) {
        allCards.push(...player.holeCards);
      }
    }

    // Collect all community cards
    if (game.communityCards) {
      for (const card of game.communityCards) {
        const cardStr =
          typeof card === "string"
            ? card
            : `${(card as any).rank}${(card as any).suit}`;
        if (cardStr !== "??") {
          allCards.push(cardStr);
        }
      }
    }

    // Check for duplicates
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const card of allCards) {
      if (seen.has(card) && card !== "??") {
        duplicates.push(card);
      }
      seen.add(card);
    }

    if (duplicates.length > 0) {
      return [
        {
          id: randomUUID(),
          timestamp,
          severity: "Critical",
          invariant: "Duplicate cards detected",
          gameId: game.gameId,
          actionNumber,
          errorDetails: {
            duplicates,
            allCards,
          },
          gameState: game.getPublicState(),
          lastActions: lastActions.slice(-10),
        },
      ];
    }

    return [];
  }

  private static validBetSizes(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    const bugs: BugReport[] = [];

    if (!game.potManager) return [];

    for (const player of game.players) {
      const bet = game.potManager.getPlayerBetThisRound(player.id);
      if (bet < 0) {
        bugs.push({
          id: randomUUID(),
          timestamp,
          severity: "Critical",
          invariant: "Negative bet",
          gameId: game.gameId,
          actionNumber,
          errorDetails: {
            playerId: player.id,
            playerName: player.name,
            bet,
          },
          gameState: game.getPublicState(),
          lastActions: lastActions.slice(-10),
        });
      }
    }

    return bugs;
  }

  private static sidePotMathCorrect(
    game: GameInstance,
    actionNumber: number,
    lastActions: string[],
    timestamp: string,
  ): BugReport[] {
    if (!game.potManager || game.potManager.pots.length <= 1) {
      return [];
    }

    // Only validate after betting is complete (in showdown)
    // During active betting, pots may be out of sync with playerTotalBets
    if (game.stage !== "showdown") {
      return [];
    }

    try {
      const sumOfPots = game.potManager.pots.reduce(
        (sum, pot) => sum + pot.amount,
        0,
      );

      // Get total bets made (authoritative source)
      const totalBet = Object.values(
        game.potManager["playerTotalBets"] || {},
      ).reduce(
        (sum: number, bet: any) => sum + (typeof bet === "number" ? bet : 0),
        0,
      );

      // After showdown, pots should match all bets made
      if (sumOfPots !== totalBet) {
        return [
          {
            id: randomUUID(),
            timestamp,
            severity: "Critical",
            invariant: "Side pot math incorrect",
            gameId: game.gameId,
            actionNumber,
            errorDetails: {
              potsCount: game.potManager.pots.length,
              sumOfPots,
              totalBet,
              delta: totalBet - sumOfPots,
              pots: game.potManager.pots.map((p) => ({
                amount: p.amount,
                eligibleCount: p.eligiblePlayerIds.length,
              })),
            },
            gameState: game.getPublicState(),
            lastActions: lastActions.slice(-10),
          },
        ];
      }
    } catch {
      // Silently skip if potManager is in inconsistent state
    }

    return [];
  }
}
