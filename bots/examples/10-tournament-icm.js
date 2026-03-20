/**
 * Example 10: Tournament ICM Bot
 * ==============================
 * Uses ICM (Independent Chip Model) for tournament decisions.
 * 
 * Features:
 * - Calculates tournament equity based on chip stacks
 * - Adjusts strategy based on bubble factor
 * - Short-stack shove/fold ranges
 * - Chip leader strategy
 * 
 * Difficulty: Advanced
 * No dependencies
 */

const { createBot, Action, Strategy } = require('../sdk/javascript');

// ─────────────────────────────────────────────────────────────
// ICM CALCULATOR
// ─────────────────────────────────────────────────────────────

class ICMCalculator {
  /**
   * Calculate tournament equity for each player using Malmuth-Harville model
   * @param {number[]} stacks - Array of chip stacks
   * @param {number[]} payouts - Array of payouts (1st, 2nd, 3rd, etc.)
   * @returns {number[]} - Equity for each player
   */
  static calculateEquity(stacks, payouts) {
    const n = stacks.length;
    const totalChips = stacks.reduce((a, b) => a + b, 0);
    const equity = new Array(n).fill(0);
    
    // For each place
    for (let place = 0; place < Math.min(n, payouts.length); place++) {
      const payout = payouts[place];
      
      // For each player
      for (let player = 0; player < n; player++) {
        // Probability of player finishing in this place
        const prob = this.placeProb(stacks, player, place, totalChips);
        equity[player] += prob * payout;
      }
    }
    
    return equity;
  }
  
  /**
   * Probability of player finishing in a specific place
   */
  static placeProb(stacks, player, place, totalChips) {
    if (place === 0) {
      // Probability of winning = chips / total
      return stacks[player] / totalChips;
    }
    
    // Recursive calculation for lower places
    const n = stacks.length;
    let prob = 0;
    
    for (let winner = 0; winner < n; winner++) {
      if (winner === player) continue;
      
      // Probability that 'winner' finishes 1st
      const winnerProb = stacks[winner] / totalChips;
      
      // Remaining stacks after winner is removed
      const remainingStacks = stacks.filter((_, i) => i !== winner);
      const remainingTotal = totalChips - stacks[winner];
      
      // Player's index in remaining array
      const playerNewIndex = player > winner ? player - 1 : player;
      
      // Probability of player finishing in (place-1) among remaining
      if (place === 1) {
        prob += winnerProb * (remainingStacks[playerNewIndex] / remainingTotal);
      } else {
        // For deeper places, use simplified model
        prob += winnerProb * (remainingStacks[playerNewIndex] / remainingTotal);
      }
    }
    
    return prob;
  }
  
  /**
   * Calculate bubble factor - how much riskier is losing vs winning
   * Returns a multiplier (1.0 = no bubble, >1 = bubble pressure)
   */
  static bubbleFactor(myStack, stacks, payouts) {
    const n = stacks.length;
    const myIndex = stacks.indexOf(myStack);
    
    // Current equity
    const currentEquity = this.calculateEquity(stacks, payouts);
    const myEquity = currentEquity[myIndex];
    
    // Equity if we double up (win all-in vs average stack)
    const avgOppStack = (stacks.reduce((a, b) => a + b, 0) - myStack) / (n - 1);
    const winStacks = stacks.map((s, i) => {
      if (i === myIndex) return myStack + avgOppStack;
      return s - avgOppStack / (n - 1);
    }).filter(s => s > 0);
    
    const winEquity = this.calculateEquity(winStacks, payouts);
    const myWinEquity = winEquity[0]; // We're first in new array
    
    // Equity if we bust
    const loseEquity = 0;
    
    // Bubble factor = (current - lose) / (win - current)
    const risk = myEquity - loseEquity;
    const reward = myWinEquity - myEquity;
    
    if (reward <= 0) return 5; // Very high risk
    return Math.max(1, risk / reward);
  }
}

// ─────────────────────────────────────────────────────────────
// TOURNAMENT STRATEGY
// ─────────────────────────────────────────────────────────────

class TournamentStrategy {
  constructor() {
    // Standard tournament payout structure (percentage)
    this.payouts = [0.50, 0.30, 0.20]; // Top 3 get paid
    this.lastHandNumber = 0;
  }
  
  decide(state) {
    const { you, action, table, players } = state;
    const bb = table.bigBlind;
    
    // Calculate stack sizes
    const allStacks = [you.chips, ...players.filter(p => !p.disconnected).map(p => p.chips)];
    const myStackBBs = you.chips / bb;
    const avgStack = allStacks.reduce((a, b) => a + b, 0) / allStacks.length;
    const myStackVsAvg = you.chips / avgStack;
    
    // Determine tournament stage
    const playersRemaining = allStacks.filter(s => s > 0).length;
    const stage = this.getTournamentStage(playersRemaining, this.payouts.length);
    
    // Calculate bubble factor
    const bubbleFactor = ICMCalculator.bubbleFactor(you.chips, allStacks, this.payouts);
    
    console.log(`  🏆 Stage: ${stage} | Stack: ${myStackBBs.toFixed(0)} BB (${(myStackVsAvg * 100).toFixed(0)}% avg)`);
    console.log(`  🫧 Bubble Factor: ${bubbleFactor.toFixed(2)}`);
    
    // ── SHORT STACK (<15 BB): Push/Fold ──────────────────────
    if (myStackBBs < 15) {
      return this.pushFoldStrategy(state, myStackBBs, bubbleFactor);
    }
    
    // ── MEDIUM STACK (15-30 BB): Careful play ────────────────
    if (myStackBBs < 30) {
      return this.mediumStackStrategy(state, bubbleFactor);
    }
    
    // ── BIG STACK (30+ BB): Apply pressure ───────────────────
    return this.bigStackStrategy(state, myStackVsAvg, bubbleFactor);
  }
  
  getTournamentStage(remaining, paidPlaces) {
    if (remaining <= paidPlaces) return 'IN_THE_MONEY';
    if (remaining <= paidPlaces + 2) return 'BUBBLE';
    if (remaining <= paidPlaces * 2) return 'APPROACHING_BUBBLE';
    return 'EARLY';
  }
  
  pushFoldStrategy(state, stackBBs, bubbleFactor) {
    const { you, action, table } = state;
    const strength = Strategy.preFlopStrength(you.holeCards, you.position);
    
    // Adjust push range based on bubble factor
    // Higher bubble factor = tighter range
    const baseThreshold = this.getPushThreshold(stackBBs, you.position);
    const adjustedThreshold = baseThreshold + (bubbleFactor - 1) * 0.1;
    
    console.log(`  📊 Push threshold: ${(adjustedThreshold * 100).toFixed(0)}% (hand: ${(strength * 100).toFixed(0)}%)`);
    
    if (state.isPreFlop()) {
      if (action.canCheck) {
        // In BB, facing no raise
        if (strength >= adjustedThreshold - 0.1) {
          return Action.allIn(action);
        }
        return Action.check();
      }
      
      // Facing raise - tighter range
      if (strength >= adjustedThreshold + 0.1) {
        return Action.allIn(action);
      }
      return Action.fold();
    }
    
    // Post-flop with short stack - push or fold
    const postStrength = Strategy.postFlopStrength(you.bestHand, state.opponentCount());
    if (postStrength >= 0.50) {
      return Action.allIn(action);
    }
    return Action.checkOrFold(action);
  }
  
  getPushThreshold(stackBBs, position) {
    // Nash equilibrium push ranges (simplified)
    const positions = {
      'BTN': { 5: 0.35, 10: 0.45, 15: 0.55 },
      'BTN/SB': { 5: 0.30, 10: 0.40, 15: 0.50 },
      'CO': { 5: 0.40, 10: 0.50, 15: 0.60 },
      'SB': { 5: 0.35, 10: 0.45, 15: 0.55 },
      'BB': { 5: 0.25, 10: 0.35, 15: 0.45 },
    };
    
    const posRanges = positions[position] || positions['CO'];
    
    if (stackBBs <= 5) return posRanges[5];
    if (stackBBs <= 10) return posRanges[10];
    return posRanges[15];
  }
  
  mediumStackStrategy(state, bubbleFactor) {
    const { you, action, table } = state;
    const bb = table.bigBlind;
    
    // Play tight on bubble
    const tightnessAdjust = (bubbleFactor - 1) * 0.1;
    
    if (state.isPreFlop()) {
      const strength = Strategy.preFlopStrength(you.holeCards, you.position);
      const threshold = 0.55 + tightnessAdjust;
      
      if (action.canCheck) {
        if (strength >= threshold) {
          return Action.raise(bb * 2.5, action);
        }
        return Action.check();
      }
      
      // Facing raise - be careful
      if (strength >= threshold + 0.15) {
        return Action.call();
      }
      return Action.fold();
    }
    
    // Post-flop: Standard strategy with bubble adjustment
    const strength = Strategy.postFlopStrength(you.bestHand, state.opponentCount());
    const potOdds = state.potOdds();
    
    if (action.canCheck) {
      if (strength >= 0.65) {
        return Action.raise(Math.floor(table.pot * 0.6), action);
      }
      return Action.check();
    }
    
    if (strength >= potOdds + 0.15 + tightnessAdjust) {
      return Action.call();
    }
    return Action.fold();
  }
  
  bigStackStrategy(state, stackVsAvg, bubbleFactor) {
    const { you, action, table, players } = state;
    const bb = table.bigBlind;
    
    // Big stack can apply pressure
    const isChipLeader = stackVsAvg > 1.3;
    
    if (state.isPreFlop()) {
      const strength = Strategy.preFlopStrength(you.holeCards, you.position);
      
      // Open wider from late position
      if (action.canCheck || action.toCall <= bb * 2) {
        if (you.inPosition() && strength >= 0.40) {
          return Action.raise(bb * 2.5, action);
        }
        if (strength >= 0.55) {
          return Action.raise(bb * 2.5, action);
        }
      }
      
      // Facing 3-bet - only continue with strong hands
      if (action.toCall > bb * 4) {
        if (strength >= 0.75) return Action.call();
        return Action.fold();
      }
      
      return Action.checkOrFold(action);
    }
    
    // Post-flop: Aggressive with chip lead
    const strength = Strategy.postFlopStrength(you.bestHand, state.opponentCount());
    
    if (action.canCheck) {
      // Bet more often as chip leader
      if (isChipLeader && strength >= 0.45) {
        return Action.raise(Math.floor(table.pot * 0.65), action);
      }
      if (strength >= 0.55) {
        return Action.raise(Math.floor(table.pot * 0.6), action);
      }
      return Action.check();
    }
    
    // Call lighter with big stack
    const potOdds = state.potOdds();
    if (strength >= potOdds + 0.05) {
      return Action.call();
    }
    return Action.fold();
  }
}

// ─────────────────────────────────────────────────────────────
// BOT STARTUP
// ─────────────────────────────────────────────────────────────

const strategy = new TournamentStrategy();

createBot({
  port: 3001,
  name: 'TournamentICM',
  decide: (state) => strategy.decide(state),
});

console.log(`🏆 Tournament ICM Bot active`);
console.log(`   Using Independent Chip Model for decisions`);
console.log(`   Payout structure: 50% / 30% / 20%`);
