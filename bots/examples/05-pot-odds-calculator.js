/**
 * Example 5: Pot Odds Bot
 * =======================
 * Makes mathematically correct decisions based on pot odds.
 * 
 * Lines of actual code: ~30
 * Difficulty: Intermediate
 * Expected result: Break-even to slightly profitable
 */

const { createBot, Action, Strategy } = require('../sdk/javascript');

createBot({
  port: 3001,
  name: 'PotOddsBot',
  decide: (state) => {
    const { you, action, table } = state;
    
    // Calculate our estimated equity
    let equity;
    if (state.isPreFlop()) {
      equity = Strategy.preFlopStrength(you.holeCards, you.position);
    } else {
      equity = Strategy.postFlopStrength(you.bestHand, state.opponentCount());
    }
    
    // Calculate pot odds
    const potOdds = action.toCall / (table.pot + action.toCall);
    
    console.log(`  Equity: ${(equity * 100).toFixed(1)}%, Pot odds: ${(potOdds * 100).toFixed(1)}%`);
    
    // If we can check, do so unless we have a strong hand
    if (action.canCheck) {
      if (equity >= 0.65) {
        // Bet for value
        const betSize = Math.floor(table.pot * (equity - 0.3));
        return Action.raise(Math.max(betSize, action.minRaise), action);
      }
      return Action.check();
    }
    
    // Calculate expected value of calling
    // EV(call) = (equity * (pot + toCall)) - ((1 - equity) * toCall)
    const evCall = (equity * (table.pot + action.toCall)) - ((1 - equity) * action.toCall);
    
    if (evCall > 0) {
      // Calling is +EV
      // But if we have a strong hand, consider raising
      if (equity >= 0.70 && action.maxRaise > 0) {
        return Action.raise(Math.floor(table.pot * 0.75), action);
      }
      return Action.call();
    }
    
    // Calling is -EV, fold
    return Action.fold();
  }
});
