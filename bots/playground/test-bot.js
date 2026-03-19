#!/usr/bin/env node
/**
 * Bot Testing Playground
 * ======================
 * Test your bot against various scenarios without joining a real tournament.
 * 
 * Usage:
 *   node test-bot.js http://localhost:3001/action
 *   node test-bot.js http://localhost:3001/action --scenario preflop
 *   node test-bot.js http://localhost:3001/action --all
 *   node test-bot.js http://localhost:3001/action --simulate 10
 */

'use strict';

const http = require('http');
const https = require('https');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function c(color, text) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// ─────────────────────────────────────────────────────────────
// TEST SCENARIOS
// ─────────────────────────────────────────────────────────────

const SCENARIOS = {
  // Pre-flop scenarios
  preflop_premium: {
    name: 'Pre-flop: Premium Hand (AA)',
    description: 'You have pocket aces, facing a raise',
    payload: buildPayload({
      stage: 'pre-flop',
      holeCards: ['A♠', 'A♥'],
      toCall: 100,
      canCheck: false,
    }),
    expectedActions: ['raise', 'call'],
    comment: 'Premium hands should raise or at least call',
  },
  
  preflop_trash: {
    name: 'Pre-flop: Weak Hand (72o)',
    description: 'You have the worst hand, facing a big raise',
    payload: buildPayload({
      stage: 'pre-flop',
      holeCards: ['7♠', '2♦'],
      toCall: 500,
      canCheck: false,
    }),
    expectedActions: ['fold'],
    comment: '72o against a big raise should fold',
  },
  
  preflop_check_bb: {
    name: 'Pre-flop: Big Blind Check',
    description: 'You are in BB, no raise, can check',
    payload: buildPayload({
      stage: 'pre-flop',
      holeCards: ['J♠', '9♥'],
      toCall: 0,
      canCheck: true,
      position: 'BB',
    }),
    expectedActions: ['check', 'raise'],
    comment: 'Can check or raise for value',
  },
  
  // Flop scenarios
  flop_monster: {
    name: 'Flop: Monster Hand (Set)',
    description: 'You flopped a set, opponent bets',
    payload: buildPayload({
      stage: 'flop',
      holeCards: ['K♠', 'K♥'],
      communityCards: ['K♦', '7♣', '2♠'],
      bestHand: { name: 'THREE_OF_A_KIND', cards: ['K♠', 'K♥', 'K♦', '7♣', '2♠'] },
      toCall: 200,
      canCheck: false,
      pot: 500,
    }),
    expectedActions: ['raise', 'call'],
    comment: 'Sets should raise for value',
  },
  
  flop_draw: {
    name: 'Flop: Flush Draw',
    description: 'You have a flush draw facing a bet',
    payload: buildPayload({
      stage: 'flop',
      holeCards: ['A♠', '5♠'],
      communityCards: ['K♠', '9♠', '2♦'],
      bestHand: { name: 'HIGH_CARD', cards: ['A♠', 'K♠', '9♠', '5♠', '2♦'] },
      toCall: 150,
      canCheck: false,
      pot: 400,
    }),
    expectedActions: ['call', 'raise', 'fold'],
    comment: 'Flush draw has ~35% equity, pot odds may justify a call',
  },
  
  flop_missed: {
    name: 'Flop: Completely Missed',
    description: 'You missed the flop completely, opponent bets big',
    payload: buildPayload({
      stage: 'flop',
      holeCards: ['A♠', 'K♥'],
      communityCards: ['7♦', '4♣', '2♠'],
      bestHand: { name: 'HIGH_CARD', cards: ['A♠', 'K♥', '7♦', '4♣', '2♠'] },
      toCall: 400,
      canCheck: false,
      pot: 500,
    }),
    expectedActions: ['fold', 'raise'],
    comment: 'High card facing big bet usually folds (or bluff raises)',
  },
  
  // River scenarios
  river_nuts: {
    name: 'River: The Nuts (Straight)',
    description: 'You have the best possible hand on the river',
    payload: buildPayload({
      stage: 'river',
      holeCards: ['A♠', 'K♥'],
      communityCards: ['Q♦', 'J♣', '10♠', '5♥', '2♣'],
      bestHand: { name: 'STRAIGHT', cards: ['A♠', 'K♥', 'Q♦', 'J♣', '10♠'] },
      toCall: 0,
      canCheck: true,
      pot: 800,
      maxRaise: 3000,
    }),
    expectedActions: ['raise', 'check'],
    comment: 'Nuts should bet big for value',
  },
  
  river_bluff_spot: {
    name: 'River: Bluff Opportunity',
    description: 'You have nothing, but the board is scary',
    payload: buildPayload({
      stage: 'river',
      holeCards: ['6♠', '5♠'],
      communityCards: ['A♦', 'K♦', 'Q♦', 'J♥', '2♣'],
      bestHand: { name: 'HIGH_CARD', cards: ['A♦', 'K♦', 'Q♦', 'J♥', '6♠'] },
      toCall: 0,
      canCheck: true,
      pot: 600,
    }),
    expectedActions: ['check', 'raise'],
    comment: 'Board has 3 diamonds and broadway - could bluff or check',
  },
  
  // Edge cases
  short_stack: {
    name: 'Short Stack (<5 BB)',
    description: 'You have only 4 big blinds with decent cards',
    payload: buildPayload({
      stage: 'pre-flop',
      holeCards: ['A♠', '8♥'],
      chips: 400,
      toCall: 100,
      canCheck: false,
      maxRaise: 300,
    }),
    expectedActions: ['raise', 'call', 'fold'],
    comment: 'Short stack with A8 is push/fold territory',
  },
  
  all_in_decision: {
    name: 'Facing All-In',
    description: 'Opponent is all-in, you have top pair',
    payload: buildPayload({
      stage: 'flop',
      holeCards: ['A♠', 'K♥'],
      communityCards: ['A♦', '7♣', '3♠'],
      bestHand: { name: 'ONE_PAIR', cards: ['A♠', 'A♦', 'K♥', '7♣', '3♠'] },
      toCall: 5000,
      canCheck: false,
      pot: 6000,
      maxRaise: 0,
    }),
    expectedActions: ['call', 'fold'],
    comment: 'Top pair top kicker vs all-in is a tough decision',
  },
  
  heads_up: {
    name: 'Heads-Up: BTN/SB',
    description: 'Heads-up, you are button/small blind',
    payload: buildPayload({
      stage: 'pre-flop',
      holeCards: ['Q♠', 'J♥'],
      position: 'BTN/SB',
      chips: 8000,
      toCall: 50,
      canCheck: false,
      players: [{
        name: 'Opponent',
        chips: 8000,
        bet: 100,
        folded: false,
        allIn: false,
        position: 'BB',
        disconnected: false,
      }],
    }),
    expectedActions: ['raise', 'call', 'fold'],
    comment: 'QJo in position heads-up should play aggressively',
  },
};

function buildPayload(overrides = {}) {
  const defaults = {
    gameId: 'playground-test',
    handNumber: 1,
    stage: 'pre-flop',
    holeCards: ['A♠', 'K♥'],
    chips: 10000,
    bet: 0,
    position: 'BTN',
    bestHand: null,
    toCall: 100,
    canCheck: false,
    minRaise: 200,
    maxRaise: 9900,
    pot: 150,
    currentBet: 100,
    communityCards: [],
    smallBlind: 50,
    bigBlind: 100,
    ante: 0,
    players: [
      {
        name: 'Opponent1',
        chips: 10000,
        bet: 100,
        folded: false,
        allIn: false,
        position: 'SB',
        disconnected: false,
      },
    ],
  };
  
  const merged = { ...defaults, ...overrides };
  
  return {
    gameId: merged.gameId,
    handNumber: merged.handNumber,
    stage: merged.stage,
    you: {
      name: 'TestBot',
      chips: merged.chips,
      holeCards: merged.holeCards,
      bet: merged.bet,
      position: merged.position,
      bestHand: merged.bestHand,
    },
    action: {
      canCheck: merged.canCheck,
      toCall: merged.toCall,
      minRaise: merged.minRaise,
      maxRaise: merged.maxRaise,
    },
    table: {
      pot: merged.pot,
      currentBet: merged.currentBet,
      communityCards: merged.communityCards,
      smallBlind: merged.smallBlind,
      bigBlind: merged.bigBlind,
      ante: merged.ante,
    },
    players: merged.players,
  };
}

// ─────────────────────────────────────────────────────────────
// HTTP CLIENT
// ─────────────────────────────────────────────────────────────

async function callBot(endpoint, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const body = JSON.stringify(payload);
    
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(data),
              raw: data,
            });
          } catch (e) {
            reject(new Error(`Invalid JSON: ${data.slice(0, 100)}`));
          }
        });
      }
    );
    
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    
    req.write(body);
    req.end();
  });
}

async function healthCheck(endpoint) {
  const healthUrl = endpoint.replace(/\/action$/, '/health');
  return new Promise((resolve) => {
    const url = new URL(healthUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const timer = setTimeout(() => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    }, 5000);
    
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'GET',
      },
      (res) => {
        clearTimeout(timer);
        resolve({ ok: res.statusCode === 200, status: res.statusCode });
      }
    );
    
    req.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// TEST RUNNER
// ─────────────────────────────────────────────────────────────

function validateResponse(response, scenario) {
  const errors = [];
  const warnings = [];
  
  if (!response || typeof response !== 'object') {
    errors.push('Response must be a JSON object');
    return { errors, warnings };
  }
  
  if (!response.type) {
    errors.push('Missing "type" field');
    return { errors, warnings };
  }
  
  const validTypes = ['fold', 'check', 'call', 'raise', 'bet', 'all_in'];
  if (!validTypes.includes(response.type)) {
    errors.push(`Invalid action type "${response.type}"`);
  }
  
  if (response.type === 'check' && !scenario.payload.action.canCheck) {
    errors.push('Cannot check when canCheck is false');
  }
  
  if ((response.type === 'raise' || response.type === 'bet')) {
    if (typeof response.amount !== 'number') {
      errors.push('Raise/bet requires numeric "amount"');
    } else if (response.amount <= 0) {
      errors.push('Amount must be positive');
    } else if (response.amount < scenario.payload.action.minRaise) {
      warnings.push(`Amount ${response.amount} below minRaise ${scenario.payload.action.minRaise}`);
    } else if (response.amount > scenario.payload.action.maxRaise) {
      warnings.push(`Amount ${response.amount} exceeds maxRaise ${scenario.payload.action.maxRaise}`);
    }
  }
  
  if (scenario.expectedActions && !scenario.expectedActions.includes(response.type)) {
    warnings.push(`Unusual action "${response.type}" - expected one of: ${scenario.expectedActions.join(', ')}`);
  }
  
  return { errors, warnings };
}

async function runScenario(endpoint, name, scenario) {
  const startTime = Date.now();
  
  try {
    const result = await callBot(endpoint, scenario.payload);
    const elapsed = Date.now() - startTime;
    const validation = validateResponse(result.body, scenario);
    
    return {
      name,
      scenario,
      success: validation.errors.length === 0,
      response: result.body,
      elapsed,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  } catch (error) {
    return {
      name,
      scenario,
      success: false,
      error: error.message,
      elapsed: Date.now() - startTime,
      errors: [error.message],
      warnings: [],
    };
  }
}

function printResult(result) {
  const status = result.success 
    ? c('green', '✓ PASS') 
    : c('red', '✗ FAIL');
  
  console.log(`\n${status} ${c('bold', result.scenario.name)}`);
  console.log(c('gray', `   ${result.scenario.description}`));
  
  if (result.response) {
    const respStr = JSON.stringify(result.response);
    console.log(`   Response: ${c('blue', respStr)} ${c('gray', `(${result.elapsed}ms)`)}`);
  }
  
  if (result.errors.length > 0) {
    result.errors.forEach(e => console.log(`   ${c('red', '✗')} ${e}`));
  }
  
  if (result.warnings.length > 0) {
    result.warnings.forEach(w => console.log(`   ${c('yellow', '⚠')} ${w}`));
  }
  
  if (result.scenario.comment) {
    console.log(c('gray', `   💡 ${result.scenario.comment}`));
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${c('bold', 'Bot Testing Playground')}

Usage:
  node test-bot.js <endpoint> [options]

Options:
  --scenario <name>   Run a specific scenario
  --all               Run all scenarios
  --list              List available scenarios
  --health            Check health endpoint only
  --simulate <n>      Simulate n random hands

Examples:
  node test-bot.js http://localhost:3001/action
  node test-bot.js http://localhost:3001/action --all
  node test-bot.js http://localhost:3001/action --scenario preflop_premium
`);
    return;
  }
  
  if (args.includes('--list')) {
    console.log(c('bold', '\nAvailable Scenarios:\n'));
    Object.entries(SCENARIOS).forEach(([key, scenario]) => {
      console.log(`  ${c('blue', key)}`);
      console.log(`    ${scenario.name}`);
      console.log(c('gray', `    ${scenario.description}\n`));
    });
    return;
  }
  
  const endpoint = args[0];
  console.log(c('bold', `\n🎰 Testing bot at ${endpoint}\n`));
  
  // Health check
  console.log('Checking health endpoint...');
  const health = await healthCheck(endpoint);
  if (!health.ok) {
    console.log(c('red', `✗ Health check failed: ${health.error || `HTTP ${health.status}`}`));
    console.log(c('yellow', '  Make sure your bot is running and /health returns 200'));
    process.exit(1);
  }
  console.log(c('green', '✓ Health check passed\n'));
  
  if (args.includes('--health')) {
    return;
  }
  
  // Determine which scenarios to run
  let scenariosToRun = {};
  
  const scenarioIndex = args.indexOf('--scenario');
  if (scenarioIndex !== -1 && args[scenarioIndex + 1]) {
    const name = args[scenarioIndex + 1];
    if (!SCENARIOS[name]) {
      console.log(c('red', `Unknown scenario: ${name}`));
      console.log('Use --list to see available scenarios');
      process.exit(1);
    }
    scenariosToRun[name] = SCENARIOS[name];
  } else if (args.includes('--all')) {
    scenariosToRun = SCENARIOS;
  } else {
    // Run a few key scenarios by default
    ['preflop_premium', 'preflop_trash', 'flop_monster', 'river_nuts'].forEach(key => {
      if (SCENARIOS[key]) scenariosToRun[key] = SCENARIOS[key];
    });
  }
  
  // Run scenarios
  const results = [];
  for (const [name, scenario] of Object.entries(scenariosToRun)) {
    const result = await runScenario(endpoint, name, scenario);
    results.push(result);
    printResult(result);
  }
  
  // Summary
  const passed = results.filter(r => r.success).length;
  const failed = results.length - passed;
  const avgTime = Math.round(results.reduce((sum, r) => sum + r.elapsed, 0) / results.length);
  
  console.log(c('bold', '\n─────────────────────────────────────'));
  console.log(c('bold', 'Summary'));
  console.log(`  Passed: ${c('green', passed)}`);
  console.log(`  Failed: ${failed > 0 ? c('red', failed) : '0'}`);
  console.log(`  Avg response time: ${avgTime}ms`);
  
  if (failed > 0) {
    console.log(c('yellow', '\n⚠ Some scenarios failed. Review the errors above.'));
    process.exit(1);
  } else {
    console.log(c('green', '\n✓ All scenarios passed!'));
  }
}

main().catch(console.error);
