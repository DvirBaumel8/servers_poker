/**
 * Example 8: Monte Carlo Simulation Bot
 * ======================================
 * Uses Monte Carlo simulation to estimate hand equity.
 * 
 * Features:
 * - Simulates thousands of random outcomes
 * - Calculates precise equity against opponent ranges
 * - Makes decisions based on Expected Value (EV)
 * 
 * Difficulty: Advanced
 * No dependencies (pure JavaScript)
 */

const { createBot, Action, Strategy, HAND_RANKS } = require('../sdk/javascript');

// ─────────────────────────────────────────────────────────────
// CARD UTILITIES
// ─────────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, value: RANK_VALUES[rank] });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cardToString(card) {
  return card.rank + card.suit;
}

function parseCard(str) {
  const suit = str.slice(-1);
  const rank = str.slice(0, -1);
  return { rank, suit, value: RANK_VALUES[rank] };
}

function cardsMatch(a, b) {
  return a.rank === b.rank && a.suit === b.suit;
}

// ─────────────────────────────────────────────────────────────
// HAND EVALUATION
// ─────────────────────────────────────────────────────────────

function evaluateHand(cards) {
  // Sort by value descending
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);
  
  // Count ranks and suits
  const rankCounts = {};
  const suitCounts = {};
  for (const card of sorted) {
    rankCounts[card.value] = (rankCounts[card.value] || 0) + 1;
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }
  
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const isFlush = Object.values(suitCounts).some(c => c >= 5);
  
  // Check for straight
  let isStraight = false;
  let straightHigh = 0;
  const uniqueValues = [...new Set(values)].sort((a, b) => b - a);
  
  for (let i = 0; i <= uniqueValues.length - 5; i++) {
    if (uniqueValues[i] - uniqueValues[i + 4] === 4) {
      isStraight = true;
      straightHigh = uniqueValues[i];
      break;
    }
  }
  // Wheel (A-2-3-4-5)
  if (!isStraight && uniqueValues.includes(14) && uniqueValues.includes(5) && 
      uniqueValues.includes(4) && uniqueValues.includes(3) && uniqueValues.includes(2)) {
    isStraight = true;
    straightHigh = 5;
  }
  
  // Determine hand rank
  let handRank, handValue;
  
  if (isStraight && isFlush) {
    if (straightHigh === 14) {
      handRank = 9; // Royal Flush
      handValue = [9, 14];
    } else {
      handRank = 8; // Straight Flush
      handValue = [8, straightHigh];
    }
  } else if (counts[0] === 4) {
    handRank = 7; // Four of a Kind
    const quadValue = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 4));
    handValue = [7, quadValue];
  } else if (counts[0] === 3 && counts[1] === 2) {
    handRank = 6; // Full House
    const tripValue = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
    const pairValue = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
    handValue = [6, tripValue, pairValue];
  } else if (isFlush) {
    handRank = 5; // Flush
    const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
    const flushCards = sorted.filter(c => c.suit === flushSuit).slice(0, 5);
    handValue = [5, ...flushCards.map(c => c.value)];
  } else if (isStraight) {
    handRank = 4; // Straight
    handValue = [4, straightHigh];
  } else if (counts[0] === 3) {
    handRank = 3; // Three of a Kind
    const tripValue = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
    handValue = [3, tripValue];
  } else if (counts[0] === 2 && counts[1] === 2) {
    handRank = 2; // Two Pair
    const pairs = Object.keys(rankCounts)
      .filter(k => rankCounts[k] === 2)
      .map(Number)
      .sort((a, b) => b - a);
    handValue = [2, pairs[0], pairs[1]];
  } else if (counts[0] === 2) {
    handRank = 1; // One Pair
    const pairValue = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
    handValue = [1, pairValue];
  } else {
    handRank = 0; // High Card
    handValue = [0, ...values.slice(0, 5)];
  }
  
  return { rank: handRank, value: handValue };
}

function compareHands(hand1, hand2) {
  for (let i = 0; i < Math.min(hand1.value.length, hand2.value.length); i++) {
    if (hand1.value[i] > hand2.value[i]) return 1;
    if (hand1.value[i] < hand2.value[i]) return -1;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// MONTE CARLO SIMULATION
// ─────────────────────────────────────────────────────────────

class MonteCarloEngine {
  constructor() {
    this.simulations = 1000; // Adjust for speed vs accuracy
  }
  
  /**
   * Calculate equity against a random opponent hand
   */
  calculateEquity(holeCards, communityCards, numOpponents = 1) {
    const myCards = holeCards.map(c => typeof c === 'string' ? parseCard(c) : c);
    const board = communityCards.map(c => typeof c === 'string' ? parseCard(c) : c);
    
    let wins = 0;
    let ties = 0;
    const total = this.simulations;
    
    for (let i = 0; i < total; i++) {
      const result = this.simulateHand(myCards, board, numOpponents);
      if (result === 1) wins++;
      else if (result === 0) ties++;
    }
    
    // Equity = wins + (ties / 2)
    return (wins + ties / 2) / total;
  }
  
  simulateHand(myCards, board, numOpponents) {
    // Create deck without known cards
    const deck = createDeck().filter(card => 
      !myCards.some(c => cardsMatch(c, card)) &&
      !board.some(c => cardsMatch(c, card))
    );
    
    const shuffled = shuffleDeck(deck);
    let deckIndex = 0;
    
    // Deal opponent hands
    const opponentHands = [];
    for (let i = 0; i < numOpponents; i++) {
      opponentHands.push([shuffled[deckIndex++], shuffled[deckIndex++]]);
    }
    
    // Complete the board
    const fullBoard = [...board];
    while (fullBoard.length < 5) {
      fullBoard.push(shuffled[deckIndex++]);
    }
    
    // Evaluate all hands
    const myHand = evaluateHand([...myCards, ...fullBoard]);
    
    let bestOpponent = null;
    for (const oppCards of opponentHands) {
      const oppHand = evaluateHand([...oppCards, ...fullBoard]);
      if (!bestOpponent || compareHands(oppHand, bestOpponent) > 0) {
        bestOpponent = oppHand;
      }
    }
    
    // Compare
    const comparison = compareHands(myHand, bestOpponent);
    return comparison; // 1 = win, 0 = tie, -1 = loss
  }
  
  /**
   * Calculate Expected Value of an action
   */
  calculateEV(equity, action, pot, toCall) {
    if (action === 'fold') {
      return 0; // Folding costs nothing more
    }
    
    if (action === 'call') {
      // EV = (equity * pot) - ((1 - equity) * toCall)
      return (equity * (pot + toCall)) - ((1 - equity) * toCall);
    }
    
    if (action === 'check') {
      return equity * pot; // Simplified
    }
    
    // For raises, need more complex calculation
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// STRATEGY
// ─────────────────────────────────────────────────────────────

const mc = new MonteCarloEngine();

function decide(state) {
  const { you, action, table } = state;
  const opponents = state.opponentCount();
  
  // ── PRE-FLOP: Use lookup tables (MC too slow) ──────────────
  if (state.isPreFlop()) {
    const strength = Strategy.preFlopStrength(you.holeCards, you.position);
    
    if (strength >= 0.80) {
      return Action.raise(table.bigBlind * 3, action);
    }
    if (strength >= 0.55 && action.toCall <= table.bigBlind * 2) {
      return action.toCall === 0 
        ? Action.raise(table.bigBlind * 2.5, action)
        : Action.call();
    }
    return Action.checkOrFold(action);
  }
  
  // ── POST-FLOP: Use Monte Carlo ─────────────────────────────
  const holeCards = you.holeCards.map(c => c.raw);
  const board = table.communityCards.map(c => c.raw);
  
  const startTime = Date.now();
  const equity = mc.calculateEquity(holeCards, board, opponents);
  const elapsed = Date.now() - startTime;
  
  console.log(`  📊 Monte Carlo: ${(equity * 100).toFixed(1)}% equity vs ${opponents} opponent(s) (${elapsed}ms)`);
  
  // Calculate pot odds
  const potOdds = action.toCall / (table.pot + action.toCall);
  
  // Calculate EV of calling
  const evCall = mc.calculateEV(equity, 'call', table.pot, action.toCall);
  
  console.log(`  📈 Pot odds: ${(potOdds * 100).toFixed(1)}%, EV(call): ${evCall?.toFixed(0) || 'N/A'}`);
  
  if (action.canCheck) {
    // Should we bet?
    if (equity >= 0.65) {
      // Strong hand - bet for value
      const betSize = Math.floor(table.pot * (0.5 + (equity - 0.65)));
      return Action.raise(betSize, action);
    }
    // Check with weak hands
    return Action.check();
  }
  
  // Facing a bet
  if (evCall > 0) {
    // +EV call
    if (equity >= 0.75 && action.maxRaise > 0) {
      // Strong enough to raise
      return Action.raise(Math.floor(table.pot * 0.8), action);
    }
    return Action.call();
  }
  
  // -EV call, but check for implied odds / bluff catching
  if (equity >= potOdds - 0.05 && action.toCall < you.chips * 0.1) {
    // Close decision, small bet, call
    return Action.call();
  }
  
  return Action.fold();
}

// ─────────────────────────────────────────────────────────────
// BOT STARTUP
// ─────────────────────────────────────────────────────────────

createBot({
  port: 3001,
  name: 'MonteCarloBot',
  decide,
});

console.log(`🎲 Monte Carlo simulations: ${mc.simulations} per decision`);
console.log(`   Adjust this.simulations for speed vs accuracy`);
