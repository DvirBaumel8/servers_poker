/**
 * Example 2: Calling Station
 * ==========================
 * Never folds, never raises. Just calls everything.
 * 
 * Lines of actual code: 4
 * Difficulty: Beginner
 * Expected result: Will lose to aggressive players, but catches bluffs
 */

const { createBot, Action } = require('../sdk/javascript');

createBot({
  port: 3001,
  name: 'CallingStation',
  decide: (state) => {
    // Check if we can, otherwise call anything
    return state.action.canCheck ? Action.check() : Action.call();
  }
});
