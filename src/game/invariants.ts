import { Logger } from "@nestjs/common";
import {
  ChipConservationError,
  GameException,
} from "../common/filters/game-exception.filter";

export interface ChipHolder {
  id: string;
  name: string;
  chips: number;
}

export interface PotState {
  getTotalPot(): number;
}

export interface GameStateForInvariant {
  players: ChipHolder[];
  potManager?: PotState;
  expectedTotalChips: number;
  handNumber: number;
  stage: string;
}

export interface ActionValidation {
  action: string;
  amount?: number;
  playerChips: number;
  toCall: number;
  minRaise: number;
  currentBet: number;
  playerBet: number;
}

export class ChipInvariantChecker {
  private readonly logger = new Logger(ChipInvariantChecker.name);

  assertChipConservation(game: GameStateForInvariant): void {
    const inStacks = game.players.reduce((sum, p) => sum + p.chips, 0);
    const inPot = game.potManager?.getTotalPot() ?? 0;
    const total = inStacks + inPot;

    if (total !== game.expectedTotalChips) {
      const playerDetails = game.players
        .map((p) => `${p.name}: ${p.chips}`)
        .join(", ");

      this.logger.error(
        `Chip conservation violated: expected ${game.expectedTotalChips}, got ${total}`,
        {
          inStacks,
          inPot,
          handNumber: game.handNumber,
          stage: game.stage,
          players: playerDetails,
        },
      );

      throw new ChipConservationError(game.expectedTotalChips, total, {
        inStacks,
        inPot,
        handNumber: game.handNumber,
        stage: game.stage,
        players: game.players.map((p) => ({
          id: p.id,
          name: p.name,
          chips: p.chips,
        })),
      });
    }
  }

  assertNonNegativeChips(player: ChipHolder): void {
    if (player.chips < 0) {
      throw new GameException(
        `Player ${player.name} has negative chips: ${player.chips}`,
        "NEGATIVE_CHIPS",
        { playerId: player.id, chips: player.chips },
      );
    }
  }

  assertValidPotDistribution(
    pots: Array<{ amount: number; eligiblePlayerIds: string[] }>,
    activePlayers: ChipHolder[],
  ): void {
    for (const pot of pots) {
      if (pot.amount < 0) {
        throw new GameException(
          `Pot has negative amount: ${pot.amount}`,
          "NEGATIVE_POT",
          { pot },
        );
      }

      if (pot.amount > 0 && pot.eligiblePlayerIds.length === 0) {
        this.logger.warn(`Pot with ${pot.amount} has no eligible players`);
      }

      for (const eligibleId of pot.eligiblePlayerIds) {
        const player = activePlayers.find((p) => p.id === eligibleId);
        if (!player) {
          this.logger.warn(
            `Eligible player ${eligibleId} not found in active players`,
          );
        }
      }
    }
  }

  validateAction(validation: ActionValidation): {
    valid: boolean;
    error?: string;
  } {
    const {
      action,
      amount,
      playerChips,
      toCall,
      minRaise,
      currentBet,
      playerBet,
    } = validation;

    if (playerChips < 0) {
      return { valid: false, error: "Player has negative chips" };
    }

    switch (action) {
      case "fold":
        return { valid: true };

      case "check":
        if (currentBet > playerBet && playerChips > 0) {
          return {
            valid: false,
            error: `Cannot check, must call ${toCall} or fold`,
          };
        }
        return { valid: true };

      case "call":
        if (toCall <= 0 && playerChips > 0) {
          return { valid: false, error: "Nothing to call, use check instead" };
        }
        return { valid: true };

      case "bet":
      case "raise":
        if (amount === undefined || amount <= 0) {
          return { valid: false, error: "Bet/raise amount must be positive" };
        }
        if (amount < minRaise && playerChips > toCall + amount) {
          return { valid: false, error: `Minimum raise is ${minRaise}` };
        }
        if (toCall + amount > playerChips) {
          return {
            valid: false,
            error: `Insufficient chips: need ${toCall + amount}, have ${playerChips}`,
          };
        }
        return { valid: true };

      case "all_in":
        if (playerChips <= 0) {
          return { valid: false, error: "Cannot go all-in with no chips" };
        }
        return { valid: true };

      default:
        return { valid: false, error: `Unknown action: ${action}` };
    }
  }

  assertNoShortAllInReopeningViolation(
    raiseAmount: number,
    minRaise: number,
    isAllIn: boolean,
  ): void {
    if (isAllIn && raiseAmount < minRaise) {
      this.logger.debug(
        `Short all-in detected: raise ${raiseAmount} < minRaise ${minRaise}. ` +
          `This should not reopen betting for players who already acted.`,
      );
    }
  }

  computeExpectedTotal(players: ChipHolder[], potManager?: PotState): number {
    const inStacks = players.reduce((sum, p) => sum + p.chips, 0);
    const inPot = potManager?.getTotalPot() ?? 0;
    return inStacks + inPot;
  }
}

export class TransactionAuditLog {
  private entries: Array<{
    timestamp: Date;
    type: "bet" | "win" | "ante" | "blind" | "refund";
    playerId: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    handNumber: number;
    details?: Record<string, any>;
  }> = [];

  log(
    type: "bet" | "win" | "ante" | "blind" | "refund",
    playerId: string,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    handNumber: number,
    details?: Record<string, any>,
  ): void {
    this.entries.push({
      timestamp: new Date(),
      type,
      playerId,
      amount,
      balanceBefore,
      balanceAfter,
      handNumber,
      details,
    });
  }

  getEntries() {
    return [...this.entries];
  }

  getEntriesForHand(handNumber: number) {
    return this.entries.filter((e) => e.handNumber === handNumber);
  }

  getEntriesForPlayer(playerId: string) {
    return this.entries.filter((e) => e.playerId === playerId);
  }

  verifyBalance(playerId: string, expectedBalance: number): boolean {
    const playerEntries = this.getEntriesForPlayer(playerId);
    if (playerEntries.length === 0) return true;

    const lastEntry = playerEntries[playerEntries.length - 1];
    return lastEntry.balanceAfter === expectedBalance;
  }

  clear(): void {
    this.entries = [];
  }
}

export const chipInvariantChecker = new ChipInvariantChecker();
