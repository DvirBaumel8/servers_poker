import { createDeck, shuffle, cardToString } from "./deck";
import { determineWinners, bestHand } from "./handEvaluator";
import { PotManager, BettingRound } from "./betting";
import logger from "./logger";

const POSITION_NAMES: { [key: number]: string[] } = {
  2: ["BTN/SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "UTG+1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"],
};

const MAX_STRIKES = 3;

class PokerGame {
  players: any[];
  smallBlind: number;
  bigBlind: number;
  ante: number;
  startingChips: number;
  onStateUpdate: (state: any) => void;
  onHandComplete: (result: any) => void;
  onPlayerJoined: (player: any) => void;
  onPlayerRemoved: (player: any) => void;
  turnTimeoutMs: number;
  botCaller: (endpoint: string, payload: any) => Promise<any>;
  gameId: string | null;
  dealerIndex: number;
  handNumber: number;
  log: any[];
  running: boolean;
  status: string;
  stage!: string;
  communityCards!: any[];
  potManager!: any;
  bettingRound: any;
  activePlayer: any;
  _expectedTotalChips?: number;
  _sleepMs?: number;

  constructor(config: any) {
    this.players = [];
    this.smallBlind = config.smallBlind || 10;
    this.bigBlind = config.bigBlind || 20;
    this.ante = config.ante || 0;
    this.startingChips = config.startingChips || 1000;
    this.onStateUpdate = config.onStateUpdate || (() => {});
    this.onHandComplete = config.onHandComplete || (() => {});
    this.onPlayerJoined = config.onPlayerJoined || (() => {});
    this.onPlayerRemoved = config.onPlayerRemoved || (() => {});
    this.turnTimeoutMs = config.turnTimeoutMs || 10000;
    this.botCaller = config.botCaller;
    this.gameId = config.gameId || null;

    this.dealerIndex = 0;
    this.handNumber = 0;
    this.log = [];
    this.running = false;
    this.status = "waiting";
  }

  addPlayer({
    id,
    name,
    endpoint,
  }: {
    id: string;
    name: string;
    endpoint: string;
  }) {
    const existing = this.players.find((p) => p.id === id);

    if (existing) {
      if (!existing.disconnected) {
        throw new Error(`${name} is already seated at this table`);
      }
      existing.disconnected = false;
      existing.strikes = 0;
      existing.endpoint = endpoint;
      this._logEvent({ message: `${name} reconnected to the table` });
      this.onStateUpdate(this.getPublicState());
      return;
    }

    const player = {
      id,
      name,
      endpoint,
      chips: this.startingChips,
      holeCards: [],
      folded: true,
      allIn: false,
      strikes: 0,
      disconnected: false,
    };
    this.players.push(player);
    this._logEvent({ message: `${name} joined the table` });
    this.onPlayerJoined(player);
    this.onStateUpdate(this.getPublicState());

    if (
      !this.running &&
      this.status !== "finished" &&
      this._activeSeatCount() >= 2
    ) {
      setImmediate(() => {
        if (!this.running && this.status !== "finished") {
          this.startGame().catch((e) => console.error("Game loop error:", e));
        }
      });
    }
  }

  async startGame() {
    this.running = true;
    this.status = "running";

    while (this.running) {
      const playable = this._playablePlayers();
      if (playable.length < 2) {
        const winner = playable[0];
        this._logEvent({
          message: `Game over! Winner: ${winner?.name ?? "nobody"}`,
        });
        this.status = "finished";
        this.onStateUpdate(this.getPublicState());
        break;
      }
      try {
        await this.playHand();
        this._assertChipConservation();
      } catch (e: any) {
        logger.gameError(
          "game",
          `Hand ${this.handNumber} crashed — stopping game`,
          this,
          {},
          e,
        );
        this.running = false;
        this.status = "error";
        this.onStateUpdate(this.getPublicState());
        throw e;
      }
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
      await this._sleep(this._sleepMs ?? 1500);
    }
  }

  async playHand() {
    this.handNumber++;
    this.stage = "pre-flop";
    this.communityCards = [];
    this.potManager = new PotManager();
    this.log = [];

    for (const p of this.players) {
      p.holeCards = [];
      p.folded = p.chips === 0 || p.disconnected;
      p.allIn = false;
    }

    const deck = shuffle(createDeck());
    let di = 0;
    for (const p of this.players.filter((p) => !p.folded)) {
      p.holeCards = [deck[di++], deck[di++]];
    }

    this._logEvent({
      message: `Hand #${this.handNumber} started. Dealer: ${this.players[this.dealerIndex].name}`,
    });

    if (this.ante > 0) {
      for (const p of this.players.filter((p) => !p.folded)) {
        const anteAmt = Math.min(this.ante, p.chips);
        p.chips -= anteAmt;
        if (p.chips === 0) p.allIn = true;
        this.potManager.addBet(p.id, anteAmt);
      }
      this._logEvent({ message: `Antes posted: ${this.ante} each` });
    }

    const sbIndex = this._nextActiveIndex(this.dealerIndex);
    const bbIndex = this._nextActiveIndex(sbIndex);
    const sb = this.players[sbIndex];
    const bb = this.players[bbIndex];
    const sbAmt = Math.min(this.smallBlind, sb.chips);
    const bbAmt = Math.min(this.bigBlind, bb.chips);

    sb.chips -= sbAmt;
    if (sb.chips === 0) sb.allIn = true;
    bb.chips -= bbAmt;
    if (bb.chips === 0) bb.allIn = true;
    this.potManager.addBet(sb.id, sbAmt);
    this.potManager.addBet(bb.id, bbAmt);

    this._logEvent({ message: `${sb.name} posts small blind: ${sbAmt}` });
    this._logEvent({ message: `${bb.name} posts big blind: ${bbAmt}` });
    this.onStateUpdate(this.getPublicState());

    await this._bettingRound("pre-flop", this._nextActiveIndex(bbIndex), {
      initialBet: this.bigBlind,
      betsThisRound: { [sb.id]: sbAmt, [bb.id]: bbAmt },
    });
    if (this._activePlayers().length <= 1) return this._awardPot();

    di++;
    this.communityCards = [deck[di++], deck[di++], deck[di++]];
    this._logEvent({
      message: `Flop: ${this.communityCards.map(cardToString).join(" ")}`,
    });
    this.onStateUpdate(this.getPublicState());
    await this._bettingRound("flop", this._nextActiveIndex(this.dealerIndex));
    if (this._activePlayers().length <= 1) return this._awardPot();

    di++;
    this.communityCards.push(deck[di++]);
    this._logEvent({
      message: `Turn: ${cardToString(this.communityCards[3])}`,
    });
    this.onStateUpdate(this.getPublicState());
    await this._bettingRound("turn", this._nextActiveIndex(this.dealerIndex));
    if (this._activePlayers().length <= 1) return this._awardPot();

    di++;
    this.communityCards.push(deck[di++]);
    this._logEvent({
      message: `River: ${cardToString(this.communityCards[4])}`,
    });
    this.onStateUpdate(this.getPublicState());
    await this._bettingRound("river", this._nextActiveIndex(this.dealerIndex));
    if (this._activePlayers().length <= 1) return this._awardPot();

    return this._showdown();
  }

  async _bettingRound(
    stageName: string,
    startIndex: number,
    options: any = {},
  ) {
    this.stage = stageName;
    this.bettingRound = new BettingRound({
      players: this.players,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      isPreFlop: stageName === "pre-flop",
      dealerIndex: this.dealerIndex,
    });

    if (options.betsThisRound) {
      for (const [pid, amt] of Object.entries(options.betsThisRound)) {
        this.bettingRound.betsThisRound[pid] = amt;
      }
      this.bettingRound.currentBet = options.initialBet || 0;
    }

    let currentIndex = startIndex;
    let maxIterations = this.players.length * 4;

    while (!this.bettingRound.isBettingComplete() && maxIterations-- > 0) {
      const player = this.players[currentIndex];

      if (player.folded || player.allIn) {
        currentIndex = this._nextActiveIndex(currentIndex);
        continue;
      }

      this.activePlayer = player;
      this.onStateUpdate(this.getPublicState(player.id));

      const botPayload = this._buildBotPayload(player);
      const action = await this._getPlayerActionSafe(player, botPayload);

      const result = this.bettingRound.applyAction(player, action);
      if (!result.valid) {
        this._logEvent({
          message: `Invalid action from ${player.name}: ${result.error} — folding`,
        });
        this.bettingRound.applyAction(player, { type: "fold" });
      } else {
        if (result.amountAdded > 0)
          this.potManager.addBet(player.id, result.amountAdded);
        this._logEvent({
          message: this._describeAction(player, action, result),
        });
      }

      this.onStateUpdate(this.getPublicState());
      currentIndex = this._nextActiveIndex(currentIndex);
    }

    this.activePlayer = null;
    this.bettingRound = null;
    this.potManager.calculatePots(this.players);
  }

  async _getPlayerActionSafe(player: any, botPayload: any) {
    try {
      const action = await this._getPlayerAction(player, botPayload);
      player.strikes = 0;
      return action;
    } catch (e: any) {
      player.strikes++;
      const reason =
        e.message === "Timeout" ? "timed out" : `errored (${e.message})`;

      if (player.strikes >= MAX_STRIKES) {
        player.disconnected = true;
        this._logEvent({
          message: `${player.name} ${reason} — strike ${player.strikes}/${MAX_STRIKES}. Disconnected from table.`,
        });
        this.onPlayerRemoved(player);
      } else {
        this._logEvent({
          message: `${player.name} ${reason} — strike ${player.strikes}/${MAX_STRIKES}. Folding.`,
        });
      }

      return { type: "fold" };
    }
  }

  async _getPlayerAction(player: any, botPayload: any) {
    if (player.endpoint && this.botCaller) {
      return await Promise.race([
        this.botCaller(player.endpoint, botPayload),
        this._sleep(this.turnTimeoutMs).then(() => {
          throw new Error("Timeout");
        }),
      ]);
    }
    return botPayload.action.toCall > 0 ? { type: "call" } : { type: "check" };
  }

  _awardPot() {
    this.stage = "showdown";
    const winner = this._activePlayers()[0];
    const total = this.potManager.getTotalPot();
    winner.chips += total;
    this.potManager.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this._logEvent({
      message: `${winner.name} wins ${total} (everyone else folded)`,
    });
    this.onStateUpdate(this.getPublicState());
    this.onHandComplete({
      winners: [{ playerId: winner.id, amount: total }],
      atShowdown: false,
    });
  }

  _showdown() {
    this.stage = "showdown";
    const active = this._activePlayers();
    this.potManager.calculatePots(this.players);
    const results: any[] = [];

    for (const pot of this.potManager.pots) {
      const eligible = active.filter((p) =>
        pot.eligiblePlayerIds.includes(p.id),
      );
      if (eligible.length === 0) continue;
      const { winners } = determineWinners(eligible, this.communityCards);
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;
      winners.forEach((w: any, i: number) => {
        const player = this.players.find((p) => p.id === w.playerId);
        const amount = share + (i === 0 ? remainder : 0);
        player.chips += amount;
        results.push({ playerId: w.playerId, amount, hand: w.hand });
        this._logEvent({
          message: `${player.name} wins ${amount} with ${w.hand.name}`,
        });
      });
    }

    this.potManager.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this.onStateUpdate(this.getPublicState());
    this.onHandComplete({ winners: results, atShowdown: true });
  }

  _buildBotPayload(player: any) {
    const positions = this._computePositions();
    const toCall = this.bettingRound.getCallAmount(player);

    return {
      gameId: this.gameId,
      handNumber: this.handNumber,
      stage: this.stage,

      you: {
        name: player.name,
        chips: player.chips,
        holeCards: player.holeCards.map(cardToString),
        bet: this.bettingRound.getPlayerBet(player.id),
        position: positions[player.id] || "Unknown",
        ...(this.communityCards.length > 0 && {
          bestHand: (() => {
            const h = bestHand(player.holeCards, this.communityCards);
            return {
              name: h.name,
              cards: h.cards.map(cardToString),
            };
          })(),
        }),
      },

      action: {
        canCheck: this.bettingRound.canCheck(player),
        toCall,
        minRaise: this.bettingRound.minRaise,
        maxRaise: player.chips - toCall,
      },

      table: {
        pot: this.potManager.getTotalPot(),
        currentBet: this.bettingRound.currentBet,
        communityCards: this.communityCards.map(cardToString),
        smallBlind: this.smallBlind,
        bigBlind: this.bigBlind,
        ante: this.ante,
      },

      players: this.players.map((p) => ({
        name: p.name,
        chips: p.chips,
        bet: this.bettingRound.getPlayerBet(p.id),
        folded: p.folded,
        allIn: p.allIn,
        disconnected: p.disconnected,
        position: positions[p.id] || "Unknown",
      })),
    };
  }

  getPublicState(forPlayerId: string | null = null) {
    const positions = this.status === "running" ? this._computePositions() : {};
    return {
      handNumber: this.handNumber,
      status: this.status,
      stage: this.stage,
      communityCards: (this.communityCards || []).map(cardToString),
      pot: this.potManager ? this.potManager.getTotalPot() : 0,
      currentBet: this.bettingRound ? this.bettingRound.currentBet : 0,
      activePlayerId: this.activePlayer ? this.activePlayer.id : null,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      ante: this.ante,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        folded: p.folded,
        allIn: p.allIn,
        disconnected: p.disconnected,
        strikes: p.strikes,
        position: positions[p.id] || null,
        bet: this.bettingRound ? this.bettingRound.getPlayerBet(p.id) : 0,
        holeCards:
          forPlayerId === p.id || this.stage === "showdown"
            ? p.holeCards.map(cardToString)
            : p.holeCards.map(() => "??"),
      })),
      log: this.log.slice(-20),
    };
  }

  _computePositions() {
    const active = this.players.filter((p) => p.chips > 0 && !p.disconnected);
    const n = active.length;
    const names = POSITION_NAMES[Math.min(n, 9)] || POSITION_NAMES[9];
    const positions: { [key: string]: string } = {};
    const dealerPlayer = this.players[this.dealerIndex];
    const dealerActiveIndex = active.findIndex((p) => p.id === dealerPlayer.id);
    active.forEach((p, i) => {
      const offset = (i - dealerActiveIndex + n) % n;
      positions[p.id] = names[offset] || `Seat${offset}`;
    });
    return positions;
  }

  _playablePlayers() {
    return this.players.filter((p) => p.chips > 0 && !p.disconnected);
  }

  _activePlayers() {
    return this.players.filter((p) => !p.folded);
  }

  _activeSeatCount() {
    return this.players.filter((p) => !p.disconnected).length;
  }

  _nextActiveIndex(fromIndex: number) {
    let idx = (fromIndex + 1) % this.players.length;
    let tries = 0;
    while (
      (this.players[idx].folded ||
        this.players[idx].chips === 0 ||
        this.players[idx].disconnected) &&
      tries < this.players.length
    ) {
      idx = (idx + 1) % this.players.length;
      tries++;
    }
    return idx;
  }

  _describeAction(player: any, action: any, result: any) {
    if (action.type === "fold") return `${player.name} folds`;
    if (action.type === "check") return `${player.name} checks`;
    if (action.type === "call")
      return `${player.name} calls ${result.amountAdded}`;
    if (action.type === "raise" || action.type === "bet")
      return `${player.name} raises by ${action.amount}`;
    return `${player.name} acts`;
  }

  _logEvent(event: any) {
    this.log.push({ ...event, timestamp: Date.now() });
    console.log(
      `[Hand ${this.handNumber}] ${event.message || JSON.stringify(event)}`,
    );
  }

  _assertChipConservation() {
    if (this._expectedTotalChips === undefined) return;
    const inStacks = this.players.reduce((s, p) => s + p.chips, 0);
    const inPot = this.potManager?.getTotalPot?.() ?? 0;
    const total = inStacks + inPot;
    if (total !== this._expectedTotalChips) {
      const detail = this.players.map((p) => `${p.name}:${p.chips}`).join(", ");
      const err = new Error(
        `Chip conservation violated on hand ${this.handNumber}: ` +
          `expected ${this._expectedTotalChips}, got ${total} ` +
          `(${inStacks} in stacks + ${inPot} in pot). Players: [${detail}]`,
      ) as any;
      err.code = "CHIP_CONSERVATION_VIOLATION";
      throw err;
    }
  }

  _sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  stop() {
    this.running = false;
  }
}

export { PokerGame };
