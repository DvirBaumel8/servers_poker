/**
 * Example 1: Check/Fold Bot
 * =========================
 * The simplest possible strategy. Never puts money in voluntarily.
 * 
 * Lines of actual code: 4
 * Difficulty: Beginner
 * Expected result: Will slowly bleed chips but never make big mistakes
 */

const { createBot, Action } = require('../sdk/javascript');

createBot({
  port: 3001,
  name: 'CheckFoldBot',
  decide: (state) => {
    // If we can check, check. Otherwise, fold.
    return state.action.canCheck ? Action.check() : Action.fold();
  }
});
