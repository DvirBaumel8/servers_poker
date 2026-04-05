function bigMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

interface Player {
  id: string;
  chips: bigint;
  folded: boolean;
  allIn: boolean;
}

interface Action {
  type: "fold" | "check" | "call" | "raise" | "bet";
  amount?: number;
}

interface Pot {
  amount: bigint;
  eligiblePlayerIds: string[];
}

interface Winner {
  id: string;
  handRank: number;
}

/**
 * PotManager handles main pot and side pots for all-in situations.
 */
export class PotManager {
  pots: Pot[];
  playerBetsThisRound: Record<string, bigint>;
  playerTotalBets: Record<string, bigint>;

  constructor() {
    this.pots = [{ amount: 0n, eligiblePlayerIds: [] }];
    this.playerBetsThisRound = {};
    this.playerTotalBets = {};
  }

  resetRound(): void {
    this.playerBetsThisRound = {};
  }

  addBet(playerId: string, amount: bigint): void {
    this.playerBetsThisRound[playerId] =
      (this.playerBetsThisRound[playerId] ?? 0n) + amount;
    this.playerTotalBets[playerId] =
      (this.playerTotalBets[playerId] ?? 0n) + amount;
  }

  getPlayerBetThisRound(playerId: string): bigint {
    return this.playerBetsThisRound[playerId] ?? 0n;
  }

  getPlayerTotalBet(playerId: string): bigint {
    return this.playerTotalBets[playerId] ?? 0n;
  }

  getTotalPot(): bigint {
    // Return sum of all chips bet in the current hand
    // This is the authoritative record of chips out of stacks
    return Object.values(this.playerTotalBets).reduce(
      (sum, bet) => sum + bet,
      0n,
    );
  }

  calculatePots(players: Player[]): void {
    const activeBets = players
      .filter((p) => (this.playerTotalBets[p.id] ?? 0n) > 0n)
      .map((p) => ({
        id: p.id,
        total: this.playerTotalBets[p.id]!,
        folded: p.folded,
      }))
      .sort((a, b) => (a.total < b.total ? -1 : a.total > b.total ? 1 : 0));

    if (activeBets.length === 0) return;

    const pots: Pot[] = [];
    let previousLevel = 0n;
    const allBetLevels = [...new Set(activeBets.map((b) => b.total))];

    for (const level of allBetLevels) {
      const contribution = level - previousLevel;
      const eligible = activeBets
        .filter((b) => b.total >= level && !b.folded)
        .map((b) => b.id);
      const contributors = activeBets.filter((b) => b.total >= level);
      const potAmount = contribution * BigInt(contributors.length);
      if (potAmount > 0n) {
        if (eligible.length > 0) {
          pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
        } else {
          // Dead money: every player who reached this bet level has folded.
          // Merge into the nearest lower pot that has eligible players so
          // chips are never silently dropped at showdown.
          let merged = false;
          for (let i = pots.length - 1; i >= 0; i--) {
            if (pots[i].eligiblePlayerIds.length > 0) {
              pots[i].amount += potAmount;
              merged = true;
              break;
            }
          }
          if (!merged) {
            // No eligible pot exists yet — keep chips here; showdown will
            // use all active players as a fallback.
            pots.push({ amount: potAmount, eligiblePlayerIds: [] });
          }
        }
      }
      previousLevel = level;
    }

    this.pots =
      pots.length > 0 ? pots : [{ amount: 0n, eligiblePlayerIds: [] }];
  }

  /**
   * Distribute pot among winners with proper odd chip handling.
   * Odd chips go to players closest to the button (dealer + 1 first).
   *
   * @param potAmount - Total pot amount to distribute
   * @param winners - Array of winners with their hand ranks (all equal rank = split)
   * @param playerOrder - Array of player IDs in seat order
   * @param dealerIndex - Index of the dealer in playerOrder
   * @returns Distribution mapping playerId -> amount won
   */
  distributePot(
    potAmount: bigint,
    winners: Winner[],
    playerOrder: string[],
    dealerIndex: number,
  ): Record<string, bigint> {
    const distribution: Record<string, bigint> = {};

    if (winners.length === 0) {
      return distribution;
    }

    if (winners.length === 1) {
      distribution[winners[0].id] = potAmount;
      return distribution;
    }

    const winnerIds = new Set(winners.map((w) => w.id));
    const baseShare = potAmount / BigInt(winners.length);
    const remainder = potAmount % BigInt(winners.length);

    for (const winner of winners) {
      distribution[winner.id] = baseShare;
    }

    if (remainder > 0n) {
      let oddChipsGiven = 0n;
      let searchIndex = (dealerIndex + 1) % playerOrder.length;

      while (oddChipsGiven < remainder) {
        const playerId = playerOrder[searchIndex];
        if (winnerIds.has(playerId)) {
          distribution[playerId] += 1n;
          oddChipsGiven += 1n;
        }
        searchIndex = (searchIndex + 1) % playerOrder.length;

        if (oddChipsGiven >= remainder) break;
      }
    }

    return distribution;
  }
}

/**
 * BettingRound manages a single round of betting.
 * Raise amounts are now ADDITIONAL chips on top of the current bet.
 */
export const MAX_RAISES_PER_STREET = 5;

export class BettingRound {
  players: Player[];
  smallBlind: bigint;
  bigBlind: bigint;
  isPreFlop: boolean;
  dealerIndex: number;
  currentMaxBet: bigint;
  lastRaiseDelta: bigint;
  lastRaiserIndex: number;
  actedPlayers: Set<string>;
  betsThisRound: Record<string, bigint>;
  private lastRaiseWasFull: boolean = true;
  private bettingReopenedFor: Set<string> = new Set();
  private raisesThisStreet: number = 0;

  constructor({
    players,
    smallBlind,
    bigBlind,
    isPreFlop = false,
    dealerIndex,
  }: {
    players: Player[];
    smallBlind: bigint;
    bigBlind: bigint;
    isPreFlop?: boolean;
    dealerIndex: number;
  }) {
    this.players = players;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.isPreFlop = isPreFlop;
    this.dealerIndex = dealerIndex;
    this.currentMaxBet = 0n;
    this.lastRaiseDelta = bigBlind;
    this.lastRaiserIndex = -1;
    this.actedPlayers = new Set();
    this.betsThisRound = {};
    this.lastRaiseWasFull = true;
    this.bettingReopenedFor = new Set();
    this.raisesThisStreet = 0;
  }

  getPlayerBet(playerId: string): bigint {
    return this.betsThisRound[playerId] ?? 0n;
  }

  getCallAmount(player: Player): bigint {
    return bigMin(
      this.currentMaxBet - this.getPlayerBet(player.id),
      player.chips,
    );
  }

  canCheck(player: Player): boolean {
    return this.getPlayerBet(player.id) >= this.currentMaxBet;
  }

  /**
   * Apply an action from a player.
   * For 'raise': action.amount is ADDITIONAL chips on top of what the player has already bet.
   * @returns {{ valid, error, amountAdded }}
   */
  applyAction(
    player: Player,
    action: Action,
  ): { valid: boolean; error?: string; amountAdded: bigint } {
    const { type, amount } = action;
    const alreadyBet = this.getPlayerBet(player.id);
    const toCall = this.currentMaxBet - alreadyBet;

    if (type === "fold") {
      player.folded = true;
      this.actedPlayers.add(player.id);
      return { valid: true, amountAdded: 0n };
    }

    if (type === "check") {
      if (toCall > 0n)
        return {
          valid: false,
          error: `Must call ${toCall} or fold`,
          amountAdded: 0n,
        };
      this.actedPlayers.add(player.id);
      return { valid: true, amountAdded: 0n };
    }

    if (type === "call") {
      const callAmount = bigMin(toCall, player.chips);
      player.chips -= callAmount;
      this.betsThisRound[player.id] = alreadyBet + callAmount;
      if (player.chips === 0n) player.allIn = true;
      this.actedPlayers.add(player.id);
      return { valid: true, amountAdded: callAmount };
    }

    if (type === "raise" || type === "bet") {
      // amount = raise delta (chips above the current max bet, on top of the call)
      const raiseBy = amount != null ? BigInt(Math.round(amount)) : 0n;

      if (raiseBy <= 0n) {
        return {
          valid: false,
          error: "Raise amount must be a positive number",
          amountAdded: 0n,
        };
      }

      // Total the player will have bet after this action (= currentMaxBet + raiseBy)
      const newTotalAmount = alreadyBet + toCall + raiseBy;
      const additional = newTotalAmount - alreadyBet; // toCall + raiseBy

      // Delta Rule: new total must be >= currentMaxBet + lastRaiseDelta
      if (
        newTotalAmount < this.currentMaxBet + this.lastRaiseDelta &&
        player.chips > additional
      ) {
        return {
          valid: false,
          error: `Minimum raise is to ${this.currentMaxBet + this.lastRaiseDelta}`,
          amountAdded: 0n,
        };
      }

      const actualAdditional = bigMin(additional, player.chips);
      player.chips -= actualAdditional;
      this.betsThisRound[player.id] = alreadyBet + actualAdditional;

      if (player.chips === 0n) player.allIn = true;

      const newBet = this.betsThisRound[player.id];
      const raiseAmount = newBet - this.currentMaxBet;

      if (newBet > this.currentMaxBet) {
        this.raisesThisStreet++;
        const isFullRaise = raiseAmount >= this.lastRaiseDelta;
        this.lastRaiseWasFull = isFullRaise;

        if (isFullRaise) {
          // Use bigMax to ensure lastRaiseDelta never falls below 1 BB
          this.lastRaiseDelta = bigMax(this.bigBlind, raiseAmount);
          this.bettingReopenedFor = new Set(
            this.players.filter((p) => p.id !== player.id).map((p) => p.id),
          );
        }

        this.currentMaxBet = newBet;
        this.lastRaiserIndex = this.players.findIndex(
          (p) => p.id === player.id,
        );
        this.actedPlayers = new Set([player.id]);
      }

      return { valid: true, amountAdded: actualAdditional };
    }

    return {
      valid: false,
      error: `Unknown action type: ${type}`,
      amountAdded: 0n,
    };
  }

  isBettingComplete(): boolean {
    const notFolded = this.players.filter((p) => !p.folded);
    if (notFolded.length <= 1) return true;

    const canAct = this.players.filter(
      (p) => !p.folded && !p.allIn && p.chips > 0n,
    );
    if (canAct.length === 0) return true;

    for (const p of canAct) {
      if (!this.actedPlayers.has(p.id)) return false;
      if (this.getPlayerBet(p.id) < this.currentMaxBet && p.chips > 0n)
        return false;
    }

    return true;
  }

  /**
   * Check if a player can re-raise.
   * After a short all-in (raise less than min raise), betting is NOT reopened
   * for players who already acted.
   */
  canReraise(playerId: string): boolean {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return false;
    if (player.folded || player.allIn || player.chips === 0n) return false;

    if (this.raisesThisStreet >= MAX_RAISES_PER_STREET) return false;

    if (!this.lastRaiseWasFull) {
      return false;
    }

    return this.bettingReopenedFor.has(playerId);
  }

  /**
   * Check if the last raise was a full raise (>= min raise).
   */
  wasLastRaiseFull(): boolean {
    return this.lastRaiseWasFull;
  }

  /**
   * Get valid actions for a player considering short all-in rules.
   */
  getValidActionsForPlayer(player: Player): string[] {
    const actions: string[] = [];

    if (player.folded || player.allIn) {
      return actions;
    }

    actions.push("fold");

    const toCall = this.getCallAmount(player);
    if (toCall === 0n) {
      actions.push("check");
    } else if (player.chips >= toCall) {
      actions.push("call");
    }

    // Allow raise if no one has bet yet (first open) OR betting was reopened after a full raise;
    // block if the per-street raise cap has been reached.
    const canBetOrRaise =
      player.chips > toCall &&
      this.raisesThisStreet < MAX_RAISES_PER_STREET &&
      (this.lastRaiserIndex === -1 || this.canReraise(player.id));
    if (canBetOrRaise) {
      actions.push("raise");
    }

    if (player.chips > 0n && toCall > 0n) {
      actions.push("all_in");
    }

    return actions;
  }
}
