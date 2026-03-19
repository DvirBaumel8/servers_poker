/**
 * Example 3: Tight-Passive ("Rock")
 * =================================
 * Only plays premium hands, but doesn't bet them aggressively.
 * 
 * Lines of actual code: ~15
 * Difficulty: Beginner
 * Expected result: Low variance, modest losses from never extracting value
 */

const { createBot, Action } = require('../sdk/javascript');

const PREMIUM_CARDS = ['A', 'K', 'Q', 'J'];

createBot({
  port: 3001,
  name: 'TightPassive',
  decide: (state) => {
    const { you, action, table } = state;
    
    // Pre-flop: only play hands with 2 premium cards
    if (state.isPreFlop()) {
      const hasPremium = you.holeCards.every(c => PREMIUM_CARDS.includes(c.rank));
      if (hasPremium) {
        return Action.checkOrCall(action);
      }
      return Action.checkOrFold(action);
    }
    
    // Post-flop: only continue with pair or better
    if (you.bestHand && you.bestHand.isAtLeast('ONE_PAIR')) {
      return Action.checkOrCall(action);
    }
    
    return Action.checkOrFold(action);
  }
});
