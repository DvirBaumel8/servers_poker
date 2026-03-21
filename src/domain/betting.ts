interface Player {
  id: string;
  chips: number;
  folded: boolean;
  allIn: boolean;
}

interface Action {
  type: "fold" | "check" | "call" | "raise" | "bet";
  amount?: number;
}

interface Pot {
  amount: number;
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
  playerBetsThisRound: { [key: string]: number };
  playerTotalBets: { [key: string]: number };

  constructor() {
    this.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this.playerBetsThisRound = {};
    this.playerTotalBets = {};
  }

  resetRound(): void {
    this.playerBetsThisRound = {};
  }

  addBet(playerId: string, amount: number): void {
    this.playerBetsThisRound[playerId] =
      (this.playerBetsThisRound[playerId] || 0) + amount;
    this.playerTotalBets[playerId] =
      (this.playerTotalBets[playerId] || 0) + amount;
  }

  getPlayerBetThisRound(playerId: string): number {
    return this.playerBetsThisRound[playerId] || 0;
  }

  getPlayerTotalBet(playerId: string): number {
    return this.playerTotalBets[playerId] || 0;
  }

  getTotalPot(): number {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  calculatePots(players: Player[]): void {
    const activeBets = players
      .filter((p) => this.playerTotalBets[p.id] > 0)
      .map((p) => ({
        id: p.id,
        total: this.playerTotalBets[p.id],
        folded: p.folded,
      }))
      .sort((a, b) => a.total - b.total);

    if (activeBets.length === 0) return;

    const pots: Pot[] = [];
    let previousLevel = 0;
    const allBetLevels = [...new Set(activeBets.map((b) => b.total))];

    for (const level of allBetLevels) {
      const contribution = level - previousLevel;
      const eligible = activeBets
        .filter((b) => b.total >= level && !b.folded)
        .map((b) => b.id);
      const contributors = activeBets.filter((b) => b.total >= level);
      const potAmount = contribution * contributors.length;
      if (potAmount > 0)
        pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
      previousLevel = level;
    }

    this.pots = pots.length > 0 ? pots : [{ amount: 0, eligiblePlayerIds: [] }];
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
    potAmount: number,
    winners: Winner[],
    playerOrder: string[],
    dealerIndex: number,
  ): Record<string, number> {
    const distribution: Record<string, number> = {};

    if (winners.length === 0) {
      return distribution;
    }

    if (winners.length === 1) {
      distribution[winners[0].id] = potAmount;
      return distribution;
    }

    const winnerIds = new Set(winners.map((w) => w.id));
    const baseShare = Math.floor(potAmount / winners.length);
    const remainder = potAmount % winners.length;

    for (const winner of winners) {
      distribution[winner.id] = baseShare;
    }

    if (remainder > 0) {
      let oddChipsGiven = 0;
      let searchIndex = (dealerIndex + 1) % playerOrder.length;

      while (oddChipsGiven < remainder) {
        const playerId = playerOrder[searchIndex];
        if (winnerIds.has(playerId)) {
          distribution[playerId]++;
          oddChipsGiven++;
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
export class BettingRound {
  players: Player[];
  smallBlind: number;
  bigBlind: number;
  isPreFlop: boolean;
  dealerIndex: number;
  currentBet: number;
  minRaise: number;
  lastRaiserIndex: number;
  actedPlayers: Set<string>;
  betsThisRound: { [key: string]: number };
  private lastRaiseWasFull: boolean = true;
  private bettingReopenedFor: Set<string> = new Set();

  constructor({
    players,
    smallBlind,
    bigBlind,
    isPreFlop = false,
    dealerIndex,
  }: {
    players: Player[];
    smallBlind: number;
    bigBlind: number;
    isPreFlop?: boolean;
    dealerIndex: number;
  }) {
    this.players = players;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.isPreFlop = isPreFlop;
    this.dealerIndex = dealerIndex;
    this.currentBet = 0;
    this.minRaise = bigBlind;
    this.lastRaiserIndex = -1;
    this.actedPlayers = new Set();
    this.betsThisRound = {};
    this.lastRaiseWasFull = true;
    this.bettingReopenedFor = new Set();
  }

  getPlayerBet(playerId: string): number {
    return this.betsThisRound[playerId] || 0;
  }

  getCallAmount(player: Player): number {
    return Math.min(
      this.currentBet - this.getPlayerBet(player.id),
      player.chips,
    );
  }

  canCheck(player: Player): boolean {
    return this.getPlayerBet(player.id) >= this.currentBet;
  }

  /**
   * Apply an action from a player.
   * For 'raise': action.amount is ADDITIONAL chips on top of what the player has already bet.
   * @returns {{ valid, error, amountAdded }}
   */
  applyAction(
    player: Player,
    action: Action,
  ): { valid: boolean; error?: string; amountAdded: number } {
    const { type, amount } = action;
    const alreadyBet = this.getPlayerBet(player.id);
    const toCall = this.currentBet - alreadyBet;

    if (type === "fold") {
      player.folded = true;
      this.actedPlayers.add(player.id);
      return { valid: true, amountAdded: 0 };
    }

    if (type === "check") {
      if (toCall > 0)
        return {
          valid: false,
          error: `Must call ${toCall} or fold`,
          amountAdded: 0,
        };
      this.actedPlayers.add(player.id);
      return { valid: true, amountAdded: 0 };
    }

    if (type === "call") {
      const callAmount = Math.min(toCall, player.chips);
      player.chips -= callAmount;
      this.betsThisRound[player.id] = alreadyBet + callAmount;
      if (player.chips === 0) player.allIn = true;
      this.actedPlayers.add(player.id);
      return { valid: true, amountAdded: callAmount };
    }

    if (type === "raise" || type === "bet") {
      // amount = additional chips on top of what the player has already put in this round
      const raiseBy = Number(amount);

      if (!raiseBy || raiseBy <= 0) {
        return {
          valid: false,
          error: "Raise amount must be a positive number",
          amountAdded: 0,
        };
      }

      // Total the player will have bet after this action
      const newPlayerTotal = alreadyBet + toCall + raiseBy;
      const additional = newPlayerTotal - alreadyBet; // toCall + raiseBy

      if (raiseBy < this.minRaise && player.chips > additional) {
        return {
          valid: false,
          error: `Minimum raise is ${this.minRaise}`,
          amountAdded: 0,
        };
      }

      const actualAdditional = Math.min(additional, player.chips);
      player.chips -= actualAdditional;
      this.betsThisRound[player.id] = alreadyBet + actualAdditional;

      if (player.chips === 0) player.allIn = true;

      const newBet = this.betsThisRound[player.id];
      const raiseAmount = newBet - this.currentBet;

      if (newBet > this.currentBet) {
        const isFullRaise = raiseAmount >= this.minRaise;
        this.lastRaiseWasFull = isFullRaise;

        if (isFullRaise) {
          this.minRaise = raiseAmount;
          this.bettingReopenedFor = new Set(
            this.players.filter((p) => p.id !== player.id).map((p) => p.id),
          );
        }

        this.currentBet = newBet;
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
      amountAdded: 0,
    };
  }

  isBettingComplete(): boolean {
    const notFolded = this.players.filter((p) => !p.folded);
    if (notFolded.length <= 1) return true;

    const canAct = this.players.filter(
      (p) => !p.folded && !p.allIn && p.chips > 0,
    );
    if (canAct.length === 0) return true;

    for (const p of canAct) {
      if (!this.actedPlayers.has(p.id)) return false;
      if (this.getPlayerBet(p.id) < this.currentBet && p.chips > 0)
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
    if (player.folded || player.allIn || player.chips === 0) return false;

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
    if (toCall === 0) {
      actions.push("check");
    } else if (player.chips >= toCall) {
      actions.push("call");
    }

    if (player.chips > toCall && this.canReraise(player.id)) {
      actions.push("raise");
    }

    if (player.chips > 0 && toCall > 0) {
      actions.push("all_in");
    }

    return actions;
  }
}
