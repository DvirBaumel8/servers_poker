/**
 * Example 6: Position-Aware Bot
 * =============================
 * Plays differently based on position. Loose in position, tight out of position.
 * 
 * Lines of actual code: ~45
 * Difficulty: Intermediate
 * Expected result: Good against position-unaware opponents
 */

const { createBot, Action, Strategy } = require('../sdk/javascript');

createBot({
  port: 3001,
  name: 'PositionBot',
  decide: (state) => {
    const { you, action, table } = state;
    const inPosition = you.inPosition();
    const bb = table.bigBlind;
    
    // Adjust strength thresholds based on position
    const positionBonus = inPosition ? 0.15 : 0;
    
    if (state.isPreFlop()) {
      const strength = Strategy.preFlopStrength(you.holeCards, you.position);
      
      // In late position: play more hands and be aggressive
      if (inPosition) {
        if (strength >= 0.75) {
          return Action.raise(bb * 3, action);
        }
        if (strength >= 0.45) {
          return action.toCall <= bb * 2 ? Action.call() : Action.fold();
        }
      } else {
        // Out of position: only play premium
        if (strength >= 0.80) {
          return Action.raise(bb * 3, action);
        }
        if (strength >= 0.65 && action.toCall <= bb * 2) {
          return Action.call();
        }
      }
      
      return Action.checkOrFold(action);
    }
    
    // Post-flop: much more aggressive in position
    const strength = Strategy.postFlopStrength(you.bestHand, state.opponentCount());
    const adjustedStrength = strength + positionBonus;
    
    if (action.canCheck) {
      // In position: bet more often
      if (inPosition && adjustedStrength >= 0.50) {
        return Action.raise(Math.floor(table.pot * 0.6), action);
      }
      // Out of position: only bet strong hands
      if (!inPosition && strength >= 0.70) {
        return Action.raise(Math.floor(table.pot * 0.75), action);
      }
      return Action.check();
    }
    
    // Facing a bet
    if (adjustedStrength >= 0.55) {
      // Strong enough to continue
      if (strength >= 0.75 && inPosition) {
        return Action.raise(action.toCall * 2, action);
      }
      return Action.call();
    }
    
    return Action.fold();
  }
});
