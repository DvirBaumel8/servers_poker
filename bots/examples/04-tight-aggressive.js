/**
 * Example 4: Tight-Aggressive ("TAG")
 * ====================================
 * The classic winning strategy: play few hands, but play them hard.
 * 
 * Lines of actual code: ~40
 * Difficulty: Intermediate
 * Expected result: Positive EV against most opponents
 */

const { createBot, Action, Strategy } = require('../sdk/javascript');

createBot({
  port: 3001,
  name: 'TightAggressive',
  decide: (state) => {
    const { you, action, table } = state;
    const bb = table.bigBlind;
    
    // ── PRE-FLOP ─────────────────────────────────────────────
    if (state.isPreFlop()) {
      const strength = Strategy.preFlopStrength(you.holeCards, you.position);
      
      // Premium hands (AA, KK, QQ, AK): 3-bet or raise big
      if (strength >= 0.85) {
        return Action.raise(bb * 3 + action.toCall, action);
      }
      
      // Strong hands: open raise or call
      if (strength >= 0.65) {
        if (action.canCheck || action.toCall <= bb * 2) {
          return action.toCall === 0 
            ? Action.raise(bb * 2.5, action)
            : Action.call();
        }
      }
      
      // Playable hands in position
      if (strength >= 0.50 && you.inPosition() && action.toCall <= bb * 3) {
        return Action.call();
      }
      
      return Action.checkOrFold(action);
    }
    
    // ── POST-FLOP ─────────────────────────────────────────────
    const strength = Strategy.postFlopStrength(you.bestHand, state.opponentCount());
    const potOdds = state.potOdds();
    
    // Very strong hands: bet for value
    if (strength >= 0.70) {
      if (action.canCheck) {
        return Action.raise(Math.floor(table.pot * 0.75), action);
      }
      return Action.raise(action.toCall + Math.floor(table.pot * 0.5), action);
    }
    
    // Medium hands: call if odds are good
    if (strength >= 0.40 && strength > potOdds + 0.1) {
      return Action.checkOrCall(action);
    }
    
    // Weak hands: check or fold
    return Action.checkOrFold(action);
  }
});
