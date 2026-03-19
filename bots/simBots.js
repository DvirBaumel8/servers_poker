/**
 * simBots.js
 * ==========
 * Internal bot personalities for simulation runs.
 *
 * These bots run in-process — no HTTP calls.
 * They receive the same payload a real bot would and return an action.
 *
 * Personalities:
 *   caller      — always calls, checks when possible. Baseline chip sink.
 *   folder      — folds everything except premiums. Tight-passive.
 *   maniac      — raises constantly. Tests re-raises and side pots.
 *   random      — randomly picks a valid action. Stress-tests edge cases.
 *   smart       — position-aware with pot odds. Tests the full decision tree.
 *   allin       — goes all-in every hand. Tests all-in/side-pot logic exhaustively.
 *   slowroll    — delays responses randomly (tests timeout handling in simulation).
 *   crasher     — occasionally returns bad JSON or no response (tests fault tolerance).
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const HAND_RANK = {
  HIGH_CARD:0, ONE_PAIR:1, TWO_PAIR:2, THREE_OF_A_KIND:3,
  STRAIGHT:4, FLUSH:5, FULL_HOUSE:6, FOUR_OF_A_KIND:7,
  STRAIGHT_FLUSH:8, ROYAL_FLUSH:9,
};

function handRank(payload) {
  return HAND_RANK[payload.you.bestHand?.name] ?? -1;
}

function potOdds(payload) {
  const { toCall } = payload.action;
  const pot = payload.table.pot;
  return toCall === 0 ? 0 : toCall / (pot + toCall);
}

function clampRaise(amount, action) {
  return Math.max(action.minRaise, Math.min(amount, action.maxRaise));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────
// PERSONALITIES
// ─────────────────────────────────────────────────────────────

/**
 * Always call, check when free. Never folds, never raises.
 * Good for testing that chips flow correctly and games terminate.
 */
async function caller(payload) {
  const { canCheck } = payload.action;
  return canCheck ? { type: 'check' } : { type: 'call' };
}

/**
 * Fold everything except very strong hands.
 * Tests that tight bots can survive and that blinds don't kill them instantly.
 */
async function folder(payload) {
  const rank = handRank(payload);
  const { canCheck, toCall, minRaise, maxRaise } = payload.action;

  if (canCheck) {
    if (rank >= HAND_RANK.FLUSH) return { type: 'raise', amount: clampRaise(toCall + minRaise, payload.action) };
    return { type: 'check' };
  }

  if (rank >= HAND_RANK.THREE_OF_A_KIND) return { type: 'call' };
  if (rank >= HAND_RANK.FLUSH && maxRaise > 0) return { type: 'raise', amount: clampRaise(minRaise, payload.action) };
  return { type: 'fold' };
}

/**
 * Raise aggressively on every opportunity. Tests re-raise caps and side pots.
 */
async function maniac(payload) {
  const { canCheck, minRaise, maxRaise, toCall } = payload.action;
  if (maxRaise > 0) {
    const amount = Math.min(minRaise * 3, maxRaise);
    return { type: 'raise', amount: clampRaise(amount, payload.action) };
  }
  if (canCheck) return { type: 'check' };
  return { type: 'call' };
}

/**
 * Random valid action. Maximizes variety — stress-tests all code paths.
 */
async function random(payload) {
  const { canCheck, minRaise, maxRaise, toCall } = payload.action;
  const options = ['fold'];
  if (canCheck) options.push('check');
  if (toCall > 0) options.push('call');
  if (maxRaise > 0) options.push('raise');

  const choice = options[Math.floor(Math.random() * options.length)];
  if (choice === 'raise') {
    const range = maxRaise - minRaise;
    const amount = minRaise + Math.floor(Math.random() * range);
    return { type: 'raise', amount: clampRaise(amount, payload.action) };
  }
  return { type: choice };
}

/**
 * Position-aware with pot odds. Most realistic strategy.
 * Tests the full decision tree including 3-bets and river bluffs.
 */
async function smart(payload) {
  const { you, action, table, stage } = payload;
  const rank   = handRank(payload);
  const odds   = potOdds(payload);
  const inLate = ['BTN', 'CO', 'BTN/SB'].includes(you.position);
  const myBBs  = table.bigBlind > 0 ? you.chips / table.bigBlind : 99;
  const { canCheck, toCall, minRaise, maxRaise } = action;

  // Short stack: push or fold
  if (myBBs < 10 && !canCheck) {
    if (rank >= HAND_RANK.ONE_PAIR || (rank === -1 && Math.random() < 0.3)) {
      return { type: 'raise', amount: maxRaise };
    }
    return { type: 'fold' };
  }

  if (stage === 'pre-flop') {
    if (canCheck) {
      if (inLate || Math.random() < 0.3)
        return { type: 'raise', amount: clampRaise(table.bigBlind * 2.5, action) };
      return { type: 'check' };
    }
    const callFraction = toCall / (you.chips || 1);
    if (callFraction < 0.05) return { type: 'call' };
    return { type: 'fold' };
  }

  // Post-flop
  const strength = rank >= 0 ? (rank + 1) / 10 : 0.05;
  if (!canCheck) {
    if (strength > odds + 0.1) {
      if (strength > 0.7 && maxRaise > 0)
        return { type: 'raise', amount: clampRaise(Math.floor(table.pot * 0.75), action) };
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  if (strength > 0.5 && maxRaise > 0)
    return { type: 'raise', amount: clampRaise(Math.floor(table.pot * 0.5), action) };
  return { type: 'check' };
}

/**
 * Goes all-in every single hand.
 * Exhaustively tests all-in handling, side pot logic, and chip redistribution.
 */
async function allin(payload) {
  const { maxRaise, canCheck } = payload.action;
  if (maxRaise > 0) return { type: 'raise', amount: maxRaise };
  if (canCheck) return { type: 'check' };
  return { type: 'call' };
}

/**
 * Occasionally returns bad data. Tests fault tolerance and penalty fold system.
 * Probability of misbehavior: ~15% of actions.
 */
async function crasher(payload) {
  const roll = Math.random();
  if (roll < 0.05) throw new Error('Bot internal error (simulated crash)');
  if (roll < 0.08) return { type: 'invalid_action_type' };
  if (roll < 0.10) return { type: 'raise', amount: -999 };
  if (roll < 0.12) return 'not json at all';
  if (roll < 0.15) await sleep(15000); // simulate timeout (only in real timeout test)
  // Default: smart play
  return smart(payload);
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

const PERSONALITIES = { caller, folder, maniac, random, smart, allin, crasher };

/**
 * Create an in-process bot caller compatible with PokerGame's botCaller interface.
 *
 * @param {Function} personality  - one of the exported personality functions
 * @param {object}   opts
 * @param {number}   opts.delayMs - artificial delay (default 0, use >0 to test timeouts)
 * @param {string}   opts.name    - bot name for logging
 */
function createBotCaller(personalityFn, opts = {}) {
  const { delayMs = 0, name = 'SimBot' } = opts;
  return async function(endpoint, payload) {
    if (delayMs > 0) await sleep(delayMs);
    const result = await personalityFn(payload);
    return result;
  };
}

/**
 * Create a map of botId → caller function.
 * The PokerGame's botCaller is called with (endpoint, payload).
 * In simulation mode, we use the endpoint string as a key to look up the personality.
 *
 * Convention: endpoint = 'sim://personality_name' e.g. 'sim://smart'
 */
function createSimBotCaller(overrideMap = {}) {
  return async function simCaller(endpoint, payload) {
    // endpoint format: 'sim://personality_name'
    const personalityName = endpoint.replace('sim://', '');
    const personalityFn = overrideMap[personalityName] || PERSONALITIES[personalityName] || smart;
    return await personalityFn(payload);
  };
}

module.exports = { PERSONALITIES, createBotCaller, createSimBotCaller };
