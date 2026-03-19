/**
 * Poker Engine SDK for JavaScript/Node.js
 * ========================================
 * 
 * Zero-config bot creation. Just implement your strategy.
 * 
 * Usage:
 *   const { createBot, Action } = require('@poker-engine/sdk');
 *   
 *   createBot({
 *     port: 3001,
 *     decide: (state) => {
 *       if (state.action.canCheck) return Action.check();
 *       return Action.fold();
 *     }
 *   });
 */

'use strict';
const http = require('http');

// ─────────────────────────────────────────────────────────────
// CARD & HAND UTILITIES
// ─────────────────────────────────────────────────────────────

const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const HAND_RANKS = {
  'HIGH_CARD': 0, 'ONE_PAIR': 1, 'TWO_PAIR': 2, 'THREE_OF_A_KIND': 3,
  'STRAIGHT': 4, 'FLUSH': 5, 'FULL_HOUSE': 6, 'FOUR_OF_A_KIND': 7,
  'STRAIGHT_FLUSH': 8, 'ROYAL_FLUSH': 9
};

class Card {
  constructor(str) {
    this.raw = str;
    this.hidden = str === '??';
    if (!this.hidden) {
      this.suit = str.slice(-1);
      this.rank = str.slice(0, -1);
      this.value = RANK_VALUES[this.rank] || 0;
    }
  }
  toString() { return this.raw; }
  
  // Convenience methods
  isAce() { return this.value === 14; }
  isFace() { return this.value >= 11; }
  isBroadway() { return this.value >= 10; }
}

class BestHand {
  constructor(data) {
    this.name = data.name;
    this.cards = data.cards.map(c => new Card(c));
    this.rank = HAND_RANKS[data.name] || 0;
  }
  
  is(name) { return this.name === name; }
  isAtLeast(name) { return this.rank >= (HAND_RANKS[name] || 0); }
  isBetterThan(name) { return this.rank > (HAND_RANKS[name] || 0); }
  
  // Quick checks
  isPair() { return this.is('ONE_PAIR'); }
  isTwoPair() { return this.is('TWO_PAIR'); }
  isTrips() { return this.is('THREE_OF_A_KIND'); }
  isStraight() { return this.is('STRAIGHT'); }
  isFlush() { return this.is('FLUSH'); }
  isFullHouse() { return this.is('FULL_HOUSE'); }
  isQuads() { return this.is('FOUR_OF_A_KIND'); }
  isMonster() { return this.rank >= HAND_RANKS['FULL_HOUSE']; }
  isStrong() { return this.rank >= HAND_RANKS['TWO_PAIR']; }
}

// ─────────────────────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────────────────────

class GameState {
  constructor(payload) {
    this.gameId = payload.gameId;
    this.handNumber = payload.handNumber;
    this.stage = payload.stage;
    
    // You
    const you = payload.you;
    this.you = {
      name: you.name,
      chips: you.chips,
      holeCards: you.holeCards.map(c => new Card(c)),
      bet: you.bet,
      position: you.position,
      bestHand: you.bestHand ? new BestHand(you.bestHand) : null,
      
      // Convenience
      inPosition: () => ['BTN', 'CO', 'BTN/SB'].includes(you.position),
      isBlind: () => ['SB', 'BB', 'BTN/SB'].includes(you.position),
      stackInBBs: (bb) => you.chips / (bb || payload.table.bigBlind),
    };
    
    // Action options
    const act = payload.action;
    this.action = {
      canCheck: act.canCheck,
      toCall: act.toCall,
      minRaise: act.minRaise,
      maxRaise: act.maxRaise,
      
      // Convenience
      canRaise: () => act.maxRaise > 0,
      potOdds: (pot) => act.toCall / (pot + act.toCall) || 0,
    };
    
    // Table
    const tbl = payload.table;
    this.table = {
      pot: tbl.pot,
      currentBet: tbl.currentBet,
      communityCards: tbl.communityCards.map(c => new Card(c)),
      smallBlind: tbl.smallBlind,
      bigBlind: tbl.bigBlind,
      ante: tbl.ante,
    };
    
    // Players
    this.players = payload.players.map(p => ({
      name: p.name,
      chips: p.chips,
      bet: p.bet,
      folded: p.folded,
      allIn: p.allIn,
      position: p.position,
      disconnected: p.disconnected,
      isActive: !p.folded && !p.allIn && !p.disconnected && p.chips > 0,
    }));
  }
  
  // Stage helpers
  isPreFlop() { return this.stage === 'pre-flop'; }
  isFlop() { return this.stage === 'flop'; }
  isTurn() { return this.stage === 'turn'; }
  isRiver() { return this.stage === 'river'; }
  isPostFlop() { return !this.isPreFlop(); }
  
  // Player helpers
  activePlayers() { return this.players.filter(p => !p.folded && !p.disconnected); }
  opponentCount() { return this.activePlayers().length; }
  
  // Pot helpers
  potOdds() { return this.action.potOdds(this.table.pot); }
  spr() { return this.you.chips / (this.table.pot || 1); }
}

// ─────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────

const Action = {
  fold: () => ({ type: 'fold' }),
  check: () => ({ type: 'check' }),
  call: () => ({ type: 'call' }),
  
  raise: (amount, action) => {
    if (action) {
      amount = Math.max(action.minRaise, Math.min(amount, action.maxRaise));
    }
    return { type: 'raise', amount: Math.floor(amount) };
  },
  
  allIn: (action) => ({ type: 'raise', amount: action?.maxRaise || 999999 }),
  
  // Sizing helpers
  potSized: (pot, action) => Action.raise(pot, action),
  halfPot: (pot, action) => Action.raise(Math.floor(pot / 2), action),
  thirdPot: (pot, action) => Action.raise(Math.floor(pot / 3), action),
  minRaise: (action) => Action.raise(action.minRaise, action),
  
  // Smart defaults
  checkOrCall: (action) => action.canCheck ? Action.check() : Action.call(),
  checkOrFold: (action) => action.canCheck ? Action.check() : Action.fold(),
};

// ─────────────────────────────────────────────────────────────
// STRATEGY HELPERS
// ─────────────────────────────────────────────────────────────

const Strategy = {
  /**
   * Pre-flop hand strength (0-1)
   */
  preFlopStrength: (holeCards, position) => {
    if (holeCards.length < 2 || holeCards[0].hidden) return 0.1;
    
    const [a, b] = [...holeCards].sort((x, y) => y.value - x.value);
    const isPair = a.rank === b.rank;
    const isSuited = a.suit === b.suit;
    const gap = a.value - b.value;
    const isBroadway = a.value >= 10 && b.value >= 10;
    const hasAce = a.value === 14;
    const inLate = ['BTN', 'CO', 'BTN/SB'].includes(position);
    
    let score = 0;
    
    if (isPair) {
      score = a.value >= 10 ? 0.95 : (a.value >= 7 ? 0.70 : 0.50);
    } else if (isBroadway) {
      if (a.value === 14 && b.value === 13) score = isSuited ? 0.90 : 0.85;
      else if (a.value === 14) score = isSuited ? 0.80 : 0.72;
      else score = isSuited ? 0.68 : 0.58;
    } else if (hasAce) {
      score = isSuited ? 0.60 : 0.45;
    } else if (isSuited && gap <= 2) {
      score = a.value >= 7 ? 0.55 : 0.42;
    } else if (gap === 0) {
      score = a.value >= 8 ? 0.42 : 0.30;
    } else {
      score = 0.15;
    }
    
    if (inLate) score = Math.min(score + 0.12, 1.0);
    return score;
  },
  
  /**
   * Post-flop hand strength (0-1)
   */
  postFlopStrength: (bestHand, opponentCount = 1) => {
    if (!bestHand) return 0.1;
    const base = {
      'HIGH_CARD': 0.08, 'ONE_PAIR': 0.30, 'TWO_PAIR': 0.52,
      'THREE_OF_A_KIND': 0.65, 'STRAIGHT': 0.76, 'FLUSH': 0.82,
      'FULL_HOUSE': 0.90, 'FOUR_OF_A_KIND': 0.97,
      'STRAIGHT_FLUSH': 0.99, 'ROYAL_FLUSH': 1.0
    }[bestHand.name] || 0.1;
    const discount = Math.max(0, (opponentCount - 1) * 0.05);
    return Math.max(base - discount, 0.02);
  },
  
  /**
   * Should we be aggressive with this hand?
   */
  shouldValueBet: (state) => {
    if (state.isPreFlop()) {
      return Strategy.preFlopStrength(state.you.holeCards, state.you.position) >= 0.65;
    }
    return Strategy.postFlopStrength(state.you.bestHand, state.opponentCount()) >= 0.55;
  },
  
  /**
   * Is calling profitable based on pot odds?
   */
  shouldCall: (state, buffer = 0.08) => {
    const equity = state.isPreFlop() 
      ? Strategy.preFlopStrength(state.you.holeCards, state.you.position)
      : Strategy.postFlopStrength(state.you.bestHand, state.opponentCount());
    return equity >= state.potOdds() + buffer;
  },
  
  /**
   * Standard bet sizing
   */
  betSize: (strength, pot, action) => {
    let fraction;
    if (strength >= 0.90) fraction = 1.0;
    else if (strength >= 0.70) fraction = 0.75;
    else if (strength >= 0.55) fraction = 0.50;
    else fraction = 0.33;
    return Action.raise(Math.floor(pot * fraction), action);
  },
};

// ─────────────────────────────────────────────────────────────
// BOT SERVER
// ─────────────────────────────────────────────────────────────

function createBot(options) {
  const {
    port = 3001,
    name = 'PokerBot',
    decide,
    onError = (err) => console.error('[Bot error]', err.message),
    verbose = true,
  } = options;
  
  if (typeof decide !== 'function') {
    throw new Error('decide must be a function');
  }
  
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', bot: name }));
    }
    
    if (req.method === 'POST' && req.url === '/action') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const startTime = Date.now();
        try {
          const payload = JSON.parse(body);
          const state = new GameState(payload);
          
          if (verbose) {
            console.log(
              `[Hand ${state.handNumber}] ${state.stage.toUpperCase()}` +
              ` | ${state.you.holeCards.join(' ')}` +
              ` | Pot: ${state.table.pot}` +
              ` | To call: ${state.action.toCall}` +
              (state.you.bestHand ? ` | Best: ${state.you.bestHand.name}` : '')
            );
          }
          
          const result = await Promise.resolve(decide(state));
          const elapsed = Date.now() - startTime;
          
          if (verbose) {
            console.log(`  → ${result.type}${result.amount !== undefined ? ' ' + result.amount : ''} (${elapsed}ms)`);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          onError(err);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 'fold' }));
        }
      });
      return;
    }
    
    res.writeHead(404);
    res.end('Not found');
  });
  
  server.listen(port, () => {
    console.log(`🤖 ${name} running on http://localhost:${port}`);
    console.log(`   POST /action  — receives game state, returns action`);
    console.log(`   GET  /health  — health check`);
  });
  
  return server;
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  createBot,
  Action,
  Strategy,
  GameState,
  Card,
  BestHand,
  HAND_RANKS,
  RANK_VALUES,
};
