/**
 * Tests for poker engine
 * Run with: node test.js
 */

const { bestHand, determineWinners, compareHands } = require('./src/handEvaluator');
const { PokerGame } = require('./src/game');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

function card(str) {
  const rankStr = str.slice(0, -1);
  const suit = str.slice(-1);
  const values = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
  return { rank: rankStr, suit, value: values[rankStr] };
}

function cards(...strs) {
  return strs.map(card);
}

// ============================================================
console.log('\n🃏 Hand Evaluator Tests\n');
// ============================================================

test('Royal Flush', () => {
  const hand = bestHand(cards('A♠', 'K♠'), cards('Q♠', 'J♠', '10♠', '2♥', '3♦'));
  assertEqual(hand.name, 'ROYAL_FLUSH');
});

test('Straight Flush', () => {
  const hand = bestHand(cards('9♠', '8♠'), cards('7♠', '6♠', '5♠', '2♥', 'A♦'));
  assertEqual(hand.name, 'STRAIGHT_FLUSH');
});

test('Four of a Kind', () => {
  const hand = bestHand(cards('A♠', 'A♥'), cards('A♦', 'A♣', '5♠', '2♥', '3♦'));
  assertEqual(hand.name, 'FOUR_OF_A_KIND');
});

test('Full House', () => {
  const hand = bestHand(cards('A♠', 'A♥'), cards('A♦', 'K♣', 'K♠', '2♥', '3♦'));
  assertEqual(hand.name, 'FULL_HOUSE');
});

test('Flush', () => {
  const hand = bestHand(cards('A♠', 'K♠'), cards('Q♠', 'J♠', '5♠', '2♥', '3♦'));
  assertEqual(hand.name, 'FLUSH');
});

test('Straight', () => {
  const hand = bestHand(cards('9♠', '8♥'), cards('7♦', '6♣', '5♠', '2♥', 'A♦'));
  assertEqual(hand.name, 'STRAIGHT');
});

test('Ace-low straight (wheel)', () => {
  const hand = bestHand(cards('A♠', '2♥'), cards('3♦', '4♣', '5♠', 'K♥', 'Q♦'));
  assertEqual(hand.name, 'STRAIGHT');
  assertEqual(hand.tiebreakers[0], 5); // high card is 5, not ace
});

test('Three of a Kind', () => {
  const hand = bestHand(cards('A♠', 'A♥'), cards('A♦', '4♣', '7♠', '2♥', 'J♦'));
  assertEqual(hand.name, 'THREE_OF_A_KIND');
});

test('Two Pair', () => {
  const hand = bestHand(cards('A♠', 'A♥'), cards('K♦', 'K♣', '5♠', '2♥', '3♦'));
  assertEqual(hand.name, 'TWO_PAIR');
});

test('One Pair', () => {
  const hand = bestHand(cards('A♠', 'A♥'), cards('2♦', '4♣', '6♠', '8♥', '10♦'));
  assertEqual(hand.name, 'ONE_PAIR');
});

test('High Card', () => {
  const hand = bestHand(cards('A♠', 'K♥'), cards('Q♦', 'J♣', '9♠', '7♥', '2♦'));
  assertEqual(hand.name, 'HIGH_CARD');
});

test('Better kicker wins one pair', () => {
  const p1 = { id: '1', holeCards: cards('A♠', 'K♥') };
  const p2 = { id: '2', holeCards: cards('A♦', 'Q♣') };
  const community = cards('A♣', '2♠', '3♦', '7♥', '9♣');
  const { winners } = determineWinners([p1, p2], community);
  assertEqual(winners[0].playerId, '1', 'Player with K kicker should win');
});

test('Split pot on equal hands', () => {
  const p1 = { id: '1', holeCards: cards('2♠', '3♥') };
  const p2 = { id: '2', holeCards: cards('2♦', '3♣') };
  const community = cards('A♠', 'A♥', 'A♦', 'K♠', 'K♥');
  const { winners } = determineWinners([p1, p2], community);
  assertEqual(winners.length, 2, 'Should be a split pot');
});

// ============================================================
console.log('\n🎮 Game Engine Tests\n');
// ============================================================

test('Game can be created and players can join', () => {
  const game = new PokerGame({ smallBlind: 10, bigBlind: 20, startingChips: 1000 });
  assert(game.players.length === 0);
  assert(game.status === 'waiting');
  game.addPlayer({ id: 'p1', name: 'Alice', endpoint: null });
  assert(game.players.length === 1);
  assert(game.status === 'waiting');
  assert(game.smallBlind === 10);
  assert(game.bigBlind === 20);
});

test('Hand runs to completion (2 players, no endpoints - auto call/check)', async () => {
  let handCompleted = false;
  const game = new PokerGame({
    smallBlind: 10,
    bigBlind: 20,
    startingChips: 200,
    onHandComplete: () => { handCompleted = true; },
  });
  game.addPlayer({ id: 'p1', name: 'Alice', endpoint: null });
  game.addPlayer({ id: 'p2', name: 'Bob', endpoint: null });
  game.stop(); // prevent auto-loop, we call playHand manually

  await game.playHand();
  assert(handCompleted, 'onHandComplete should be called');

  const totalChips = game.players.reduce((s, p) => s + p.chips, 0);
  assertEqual(totalChips, 400, 'Total chips should be conserved');
});

test('Chips are conserved across multiple hands', async () => {
  const game = new PokerGame({ smallBlind: 10, bigBlind: 20, startingChips: 500 });
  game.addPlayer({ id: 'p1', name: 'Alice', endpoint: null });
  game.addPlayer({ id: 'p2', name: 'Bob', endpoint: null });
  game.addPlayer({ id: 'p3', name: 'Carol', endpoint: null });
  game.stop(); // prevent auto-loop

  for (let i = 0; i < 5; i++) {
    await game.playHand();
    game.dealerIndex = (game.dealerIndex + 1) % game.players.length;
    const total = game.players.reduce((s, p) => s + p.chips, 0);
    assertEqual(total, 1500, `Chips not conserved after hand ${i+1}`);
    // Reset for next hand
    game.players.forEach(p => { p.folded = false; p.allIn = false; });
  }
});

// ============================================================
console.log('\n📊 Results\n');
// ============================================================

console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('');

if (failed > 0) process.exit(1);
