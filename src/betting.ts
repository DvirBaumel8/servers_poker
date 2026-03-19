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
      if (newBet > this.currentBet) {
        this.minRaise = newBet - this.currentBet;
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
}
