/**
 * Poker Engine — Node.js Bot Boilerplate
 * =======================================
 * Copy this file, implement the `decide()` function, and deploy.
 *
 * Run: node bot.js [port]
 *
 * Your only job: implement decide(state) at the bottom of this file.
 * Everything else is handled for you.
 */

'use strict';
const http = require('http');
const PORT = process.argv[2] || 3001;

// ─────────────────────────────────────────────────────────────
// ENTITIES  —  typed wrappers around the raw JSON payload
// ─────────────────────────────────────────────────────────────

class Card {
  constructor(str) {
    this.raw = str;
    this.hidden = str === '??';
    if (!this.hidden) {
      this.suit = str.slice(-1);           // ♠ ♥ ♦ ♣
      this.rank = str.slice(0, -1);        // A K Q J 10 9 ... 2
      this.value = Card.rankValue(this.rank);
      this.isRed = this.suit === '♥' || this.suit === '♦';
    }
  }
  static rankValue(rank) {
    const map = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
    return map[rank] || 0;
  }
  toString() { return this.raw; }
}

class BestHand {
  constructor(data) {
    this.name = data.name;           // e.g. "FLUSH"
    this.cards = data.cards.map(c => new Card(c));
    this.rank = BestHand.RANKS[data.name] || 0;
  }
  static RANKS = {
    HIGH_CARD:0, ONE_PAIR:1, TWO_PAIR:2, THREE_OF_A_KIND:3,
    STRAIGHT:4, FLUSH:5, FULL_HOUSE:6, FOUR_OF_A_KIND:7,
    STRAIGHT_FLUSH:8, ROYAL_FLUSH:9,
  };
  isAt(name) { return this.name === name; }
  isAtLeast(name) { return this.rank >= BestHand.RANKS[name]; }
}

class ActionOptions {
  constructor(data) {
    this.canCheck = data.canCheck;
    this.toCall   = data.toCall;
    this.minRaise = data.minRaise;
    this.maxRaise = data.maxRaise;
  }
  /** Pot odds as a fraction (0–1). Call if your equity exceeds this. */
  potOdds(pot) { return this.toCall / (pot + this.toCall) || 0; }
  canRaise()   { return this.maxRaise > 0; }
  canCall()    { return this.toCall > 0; }
}

class Player {
  constructor(data) {
    this.name         = data.name;
    this.chips        = data.chips;
    this.bet          = data.bet;
    this.folded       = data.folded;
    this.allIn        = data.allIn;
    this.position     = data.position;
    this.disconnected = data.disconnected;
    this.isActive     = !data.folded && !data.allIn && !data.disconnected && data.chips > 0;
  }
}

class YouState {
  constructor(data) {
    this.name      = data.name;
    this.chips     = data.chips;
    this.holeCards = data.holeCards.map(c => new Card(c));
    this.bet       = data.bet;
    this.position  = data.position;
    this.bestHand  = data.bestHand ? new BestHand(data.bestHand) : null;
  }

  /** True if playing from late position (CO, BTN, BTN/SB) */
  inPosition()  { return ['BTN','CO','BTN/SB'].includes(this.position); }
  isBlind()     { return ['SB','BB','BTN/SB'].includes(this.position); }
  isDealer()    { return ['BTN','BTN/SB'].includes(this.position); }

  /** Effective stack as multiple of big blind */
  stackInBBs(bigBlind) { return this.chips / bigBlind; }
}

class TableState {
  constructor(data) {
    this.pot            = data.pot;
    this.currentBet     = data.currentBet;
    this.communityCards = data.communityCards.map(c => new Card(c));
    this.smallBlind     = data.smallBlind;
    this.bigBlind       = data.bigBlind;
    this.ante           = data.ante;
  }
  /** Total pot if we call (for pot odds calculation) */
  potAfterCall(toCall) { return this.pot + toCall; }
  hasFlop()  { return this.communityCards.length >= 3; }
  hasTurn()  { return this.communityCards.length >= 4; }
  hasRiver() { return this.communityCards.length === 5; }
}

class GameState {
  constructor(payload) {
    this.gameId     = payload.gameId;
    this.handNumber = payload.handNumber;
    this.stage      = payload.stage;   // 'pre-flop' | 'flop' | 'turn' | 'river'
    this.you        = new YouState(payload.you);
    this.action     = new ActionOptions(payload.action);
    this.table      = new TableState(payload.table);
    this.players    = payload.players.map(p => new Player(p));
  }

  /** Players still in the hand (not folded, not disconnected) */
  activePlayers() { return this.players.filter(p => !p.folded && !p.disconnected); }

  /** Number of opponents still in the hand */
  opponentCount() { return this.activePlayers().filter(p => p.name !== this.you.name).length; }

  isPreFlop() { return this.stage === 'pre-flop'; }
  isFlop()    { return this.stage === 'flop'; }
  isTurn()    { return this.stage === 'turn'; }
  isRiver()   { return this.stage === 'river'; }
}

// ─────────────────────────────────────────────────────────────
// ACTIONS  —  helpers for building valid responses
// ─────────────────────────────────────────────────────────────

const Action = {
  fold:  ()      => ({ type: 'fold' }),
  check: ()      => ({ type: 'check' }),
  call:  ()      => ({ type: 'call' }),

  /**
   * Raise by `amount` additional chips (on top of the call).
   * Amount is automatically clamped to [minRaise, maxRaise].
   */
  raiseBy: (amount, actionOptions) => {
    const clamped = actionOptions
      ? Math.min(Math.max(amount, actionOptions.minRaise), actionOptions.maxRaise)
      : amount;
    return { type: 'raise', amount: Math.floor(clamped) };
  },

  /** Go all-in */
  allIn: (actionOptions) => ({
    type: 'raise',
    amount: actionOptions ? actionOptions.maxRaise : 999999,
  }),

  /** Pot-sized raise (raise by the current pot size) */
  potSized: (pot, actionOptions) => Action.raiseBy(pot, actionOptions),

  /** Half-pot raise */
  halfPot: (pot, actionOptions) => Action.raiseBy(Math.floor(pot / 2), actionOptions),

  /** Check if possible, otherwise call */
  checkOrCall: (actionOptions) =>
    actionOptions.canCheck ? Action.check() : Action.call(),
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Pot odds — fraction of the total pot you need to invest to call.
 * If your hand equity exceeds this, calling is profitable long-term.
 * Example: toCall=100, pot=300 → 0.25 → need >25% equity to call.
 */
function potOdds(toCall, pot) {
  if (toCall === 0) return 0;
  return toCall / (pot + toCall);
}

/**
 * Pre-flop hand strength by position.
 *
 * Returns 0–1. Higher = stronger / more playable.
 * Takes position into account: late position widens the playable range.
 *
 * Approach: score each hole card individually then combine.
 * Pairs, suited connectors, and broadway cards score higher.
 */
function preFlopStrength(holeCards, position) {
  if (holeCards.length < 2 || holeCards[0].hidden) return 0.1;

  const [a, b] = holeCards.sort((x, y) => y.value - x.value); // high card first
  const isPair     = a.rank === b.rank;
  const isSuited   = a.suit === b.suit;
  const gap        = a.value - b.value;        // 0 = connected, 1 = one-gapper
  const isBroadway = a.value >= 10 && b.value >= 10;
  const hasAce     = a.value === 14;
  const inLate     = ['BTN', 'CO', 'BTN/SB'].includes(position);
  const inMid      = ['HJ', 'MP', 'MP+1'].includes(position);

  let score = 0;

  // Pairs
  if (isPair) {
    if (a.value >= 10) score = 0.95;       // JJ+
    else if (a.value >= 7) score = 0.70;   // 77–TT
    else score = 0.50;                     // 22–66 (set mining)
  }
  // Broadway (AK, AQ, KQ, etc.)
  else if (isBroadway) {
    if (a.value === 14 && b.value === 13) score = isSuited ? 0.90 : 0.85; // AK
    else if (a.value === 14) score = isSuited ? 0.80 : 0.72;              // AQ, AJ, AT
    else score = isSuited ? 0.68 : 0.58;                                   // KQ, KJ, QJ etc.
  }
  // Ace with non-broadway kicker
  else if (hasAce) {
    score = isSuited ? 0.60 : 0.45;       // A9s, A5s, A2o etc.
  }
  // Suited connectors and one-gappers
  else if (isSuited && gap <= 2) {
    score = a.value >= 7 ? 0.55 : 0.42;   // High suited connectors > low
  }
  // Offsuit connectors
  else if (gap === 0) {
    score = a.value >= 8 ? 0.42 : 0.30;
  }
  else {
    score = 0.15; // trash
  }

  // Position bonus: late position can profitably play wider ranges
  if (inLate) score = Math.min(score + 0.12, 1.0);
  else if (inMid) score = Math.min(score + 0.06, 1.0);

  return score;
}

/**
 * Post-flop hand strength from bestHand.
 * Adjusted for number of opponents — a pair is weaker against 4 opponents.
 */
function postFlopStrength(bestHand, opponentCount) {
  if (!bestHand) return 0.1;
  const base = {
    HIGH_CARD:0.08, ONE_PAIR:0.30, TWO_PAIR:0.52, THREE_OF_A_KIND:0.65,
    STRAIGHT:0.76, FLUSH:0.82, FULL_HOUSE:0.90, FOUR_OF_A_KIND:0.97,
    STRAIGHT_FLUSH:0.99, ROYAL_FLUSH:1.0,
  }[bestHand.name] || 0.1;

  // Discount for more opponents — more people = more likely someone has you beat
  const discount = Math.max(0, (opponentCount - 1) * 0.05);
  return Math.max(base - discount, 0.02);
}

/**
 * Stack-to-pot ratio (SPR).
 * Low SPR (<4): commit with top pair or better.
 * High SPR (>10): need strong hands to build pot.
 */
function spr(chips, pot) {
  return pot > 0 ? chips / pot : 99;
}

/**
 * Effective stack in big blinds. Under 10BB → push/fold territory.
 */
function stackBBs(chips, bigBlind) {
  return bigBlind > 0 ? chips / bigBlind : 99;
}

/**
 * Bet sizing — returns chips to raise by (additional on top of call).
 * Scales with hand strength: stronger hands bet more.
 */
function betSize(strength, pot, action) {
  let fraction;
  if (strength >= 0.90) fraction = 1.0;       // pot-sized with monsters
  else if (strength >= 0.70) fraction = 0.75; // 3/4 pot with strong hands
  else if (strength >= 0.55) fraction = 0.50; // half pot with medium hands
  else fraction = 0.33;                        // small probe bet
  return Action.raiseBy(Math.floor(pot * fraction), action);
}

// ─────────────────────────────────────────────────────────────
// YOUR STRATEGY  —  implement this function
// ─────────────────────────────────────────────────────────────

/**
 * decide(state) — your bot's brain.
 *
 * @param {GameState} state  — the full game state
 * @returns {object}          — an Action: fold / check / call / raise
 *
 * Replace or extend this function with your own strategy.
 * The default implementation uses position-aware pre-flop ranges
 * and pot odds post-flop. It's a reasonable starting point but
 * definitely beatable — that's the point.
 */
function decide(state) {
  const { you, action, table } = state;
  const opponents = state.opponentCount();
  const bbSize    = table.bigBlind;
  const myStack   = you.chips;
  const myBBs     = stackBBs(myStack, bbSize);

  // ── SHORT STACK: push/fold under 10 big blinds ──────────────
  if (myBBs < 10 && !action.canCheck) {
    const pfStr = preFlopStrength(you.holeCards, you.position);
    // Push any decent hand, fold the rest — standard short-stack ICM play
    if (pfStr >= 0.50) return Action.allIn(action);
    return Action.fold();
  }

  // ── PRE-FLOP ─────────────────────────────────────────────────
  if (state.isPreFlop()) {
    const pfStr = preFlopStrength(you.holeCards, you.position);
    const toCall = action.toCall;
    const raiseSize = bbSize * 2.5; // standard open raise

    // No action to us yet (we can check, or we're in BB and nobody raised)
    if (action.canCheck) {
      if (pfStr >= 0.55) return Action.raiseBy(raiseSize, action); // open raise
      return Action.check();
    }

    // Facing a raise
    const callFraction = toCall / myStack;
    if (pfStr >= 0.85) {
      // Premium hand — 3-bet
      return Action.raiseBy(toCall * 3, action);
    }
    if (pfStr >= 0.65 && callFraction < 0.10) {
      // Good hand, call if not too expensive
      return Action.call();
    }
    if (pfStr >= 0.50 && callFraction < 0.05 && you.inPosition()) {
      // Speculative hand in position with good price
      return Action.call();
    }
    return Action.fold();
  }

  // ── POST-FLOP ─────────────────────────────────────────────────
  const strength = postFlopStrength(you.bestHand, opponents);
  const odds     = potOdds(action.toCall, table.pot);
  const currentSPR = spr(myStack, table.pot);

  // Facing a bet or raise
  if (!action.canCheck) {
    // With very strong hands and low SPR, consider going all-in
    if (strength >= 0.82 && currentSPR < 4 && action.canRaise()) {
      return Action.allIn(action);
    }
    // Raise with strong hands if there's value
    if (strength >= 0.72 && action.canRaise() && action.toCall < myStack * 0.25) {
      return betSize(strength, table.pot, action);
    }
    // Call if equity justifies it (with a small buffer)
    if (strength >= odds + 0.08) {
      return Action.call();
    }
    return Action.fold();
  }

  // Nobody bet — we can check
  if (strength >= 0.55 && action.canRaise()) {
    // Bet for value (or as a probe with medium hands in position)
    if (strength >= 0.65 || you.inPosition()) {
      return betSize(strength, table.pot, action);
    }
  }
  // Check with weak hands, out of position, or on dry boards
  return Action.check();
}

// ─────────────────────────────────────────────────────────────
// SERVER  —  do not modify below this line
// ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', bot: 'Node.js Boilerplate' }));
  }

  if (req.method === 'POST' && req.url === '/action') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const state = new GameState(payload);

        console.log(
          `[Hand ${state.handNumber}] ${state.stage.toUpperCase()}` +
          ` | ${state.you.holeCards.join(' ')}` +
          ` | Pot: ${state.table.pot}` +
          ` | To call: ${state.action.toCall}` +
          (state.you.bestHand ? ` | Best: ${state.you.bestHand.name}` : '')
        );

        const result = await Promise.resolve(decide(state));

        console.log(`  → ${result.type}${result.amount !== undefined ? ' ' + result.amount : ''}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('[Bot error]', err.message);
        // Always return a valid action even on error — fold is safe
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'fold' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🤖 Bot running on http://localhost:${PORT}`);
  console.log(`   POST /action  — receives game state, returns action`);
  console.log(`   GET  /health  — health check`);
});
