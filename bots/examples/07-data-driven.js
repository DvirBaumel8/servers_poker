/**
 * Example 7: Data-Driven Bot with Persistence
 * ============================================
 * Collects data on opponents, persists to SQLite, and adjusts strategy.
 * 
 * Features:
 * - Tracks opponent statistics (VPIP, PFR, aggression)
 * - Persists data to SQLite database
 * - Adjusts strategy based on opponent tendencies
 * - Hand history analysis
 * 
 * Difficulty: Advanced
 * Dependencies: better-sqlite3 (npm install better-sqlite3)
 */

const { createBot, Action, Strategy } = require('../sdk/javascript');
const Database = require('better-sqlite3');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// DATABASE SETUP
// ─────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'bot-data.db');
const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS opponents (
    name TEXT PRIMARY KEY,
    hands_played INTEGER DEFAULT 0,
    vpip_count INTEGER DEFAULT 0,
    pfr_count INTEGER DEFAULT 0,
    three_bet_count INTEGER DEFAULT 0,
    cbet_count INTEGER DEFAULT 0,
    cbet_opportunity INTEGER DEFAULT 0,
    fold_to_cbet_count INTEGER DEFAULT 0,
    fold_to_cbet_opportunity INTEGER DEFAULT 0,
    showdown_wins INTEGER DEFAULT 0,
    showdowns INTEGER DEFAULT 0,
    total_won BIGINT DEFAULT 0,
    total_lost BIGINT DEFAULT 0,
    last_seen TEXT,
    notes TEXT
  );
  
  CREATE TABLE IF NOT EXISTS hand_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT,
    hand_number INTEGER,
    opponent_name TEXT,
    stage TEXT,
    action_type TEXT,
    amount INTEGER,
    pot_size INTEGER,
    our_position TEXT,
    their_position TEXT,
    timestamp TEXT
  );
  
  CREATE TABLE IF NOT EXISTS session_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_start TEXT,
    session_end TEXT,
    hands_played INTEGER,
    chips_won INTEGER,
    biggest_pot_won INTEGER,
    showdowns_won INTEGER,
    showdowns_lost INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_opponent_name ON hand_history(opponent_name);
  CREATE INDEX IF NOT EXISTS idx_game_id ON hand_history(game_id);
`);

// Prepared statements
const insertOpponent = db.prepare(`
  INSERT OR IGNORE INTO opponents (name, last_seen) VALUES (?, ?)
`);

const updateOpponentStats = db.prepare(`
  UPDATE opponents SET
    hands_played = hands_played + ?,
    vpip_count = vpip_count + ?,
    pfr_count = pfr_count + ?,
    three_bet_count = three_bet_count + ?,
    cbet_count = cbet_count + ?,
    cbet_opportunity = cbet_opportunity + ?,
    fold_to_cbet_count = fold_to_cbet_count + ?,
    fold_to_cbet_opportunity = fold_to_cbet_opportunity + ?,
    showdown_wins = showdown_wins + ?,
    showdowns = showdowns + ?,
    total_won = total_won + ?,
    total_lost = total_lost + ?,
    last_seen = ?
  WHERE name = ?
`);

const getOpponent = db.prepare(`
  SELECT * FROM opponents WHERE name = ?
`);

const insertHandAction = db.prepare(`
  INSERT INTO hand_history (game_id, hand_number, opponent_name, stage, action_type, amount, pot_size, our_position, their_position, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getRecentActions = db.prepare(`
  SELECT * FROM hand_history 
  WHERE opponent_name = ? 
  ORDER BY id DESC 
  LIMIT 100
`);

// ─────────────────────────────────────────────────────────────
// OPPONENT MODELING
// ─────────────────────────────────────────────────────────────

class OpponentModel {
  constructor(name) {
    this.name = name;
    this.stats = null;
    this.recentActions = [];
    this.load();
  }
  
  load() {
    insertOpponent.run(this.name, new Date().toISOString());
    this.stats = getOpponent.get(this.name);
    this.recentActions = getRecentActions.all(this.name);
  }
  
  // VPIP: Voluntarily Put money In Pot (excluding blinds)
  getVPIP() {
    if (this.stats.hands_played < 10) return 0.5; // Default for unknown
    return this.stats.vpip_count / this.stats.hands_played;
  }
  
  // PFR: Pre-Flop Raise percentage
  getPFR() {
    if (this.stats.hands_played < 10) return 0.2; // Default
    return this.stats.pfr_count / this.stats.hands_played;
  }
  
  // 3-bet percentage
  getThreeBet() {
    if (this.stats.hands_played < 20) return 0.08; // Default
    return this.stats.three_bet_count / this.stats.hands_played;
  }
  
  // C-bet (continuation bet) percentage
  getCBet() {
    if (this.stats.cbet_opportunity < 5) return 0.7; // Default
    return this.stats.cbet_count / this.stats.cbet_opportunity;
  }
  
  // Fold to C-bet percentage
  getFoldToCBet() {
    if (this.stats.fold_to_cbet_opportunity < 5) return 0.4; // Default
    return this.stats.fold_to_cbet_count / this.stats.fold_to_cbet_opportunity;
  }
  
  // Showdown win rate
  getShowdownWinRate() {
    if (this.stats.showdowns < 5) return 0.5; // Default
    return this.stats.showdown_wins / this.stats.showdowns;
  }
  
  // Player type classification
  getPlayerType() {
    const vpip = this.getVPIP();
    const pfr = this.getPFR();
    
    if (vpip > 0.40 && pfr > 0.25) return 'LAG';   // Loose-Aggressive
    if (vpip > 0.40 && pfr <= 0.25) return 'LP';   // Loose-Passive
    if (vpip <= 0.25 && pfr > 0.15) return 'TAG';  // Tight-Aggressive
    if (vpip <= 0.25 && pfr <= 0.15) return 'TP';  // Tight-Passive
    return 'REG';  // Regular
  }
  
  // Aggression factor
  getAggressionFactor() {
    const raises = this.recentActions.filter(a => a.action_type === 'raise').length;
    const calls = this.recentActions.filter(a => a.action_type === 'call').length;
    if (calls === 0) return raises > 0 ? 10 : 1;
    return raises / calls;
  }
  
  recordAction(gameId, handNumber, stage, actionType, amount, pot, ourPosition, theirPosition) {
    insertHandAction.run(
      gameId, handNumber, this.name, stage, actionType, amount, pot,
      ourPosition, theirPosition, new Date().toISOString()
    );
  }
  
  updateStats(updates) {
    updateOpponentStats.run(
      updates.hands || 0,
      updates.vpip || 0,
      updates.pfr || 0,
      updates.threeBet || 0,
      updates.cbet || 0,
      updates.cbetOpp || 0,
      updates.foldToCbet || 0,
      updates.foldToCbetOpp || 0,
      updates.showdownWin || 0,
      updates.showdown || 0,
      updates.won || 0,
      updates.lost || 0,
      new Date().toISOString(),
      this.name
    );
    this.load(); // Refresh
  }
}

// ─────────────────────────────────────────────────────────────
// STRATEGY ENGINE
// ─────────────────────────────────────────────────────────────

class DataDrivenStrategy {
  constructor() {
    this.opponents = new Map();
    this.currentHand = {
      number: 0,
      gameId: null,
      preFlopRaiser: null,
      weRaisedPreflop: false,
      potAtFlop: 0,
    };
  }
  
  getOpponent(name) {
    if (!this.opponents.has(name)) {
      this.opponents.set(name, new OpponentModel(name));
    }
    return this.opponents.get(name);
  }
  
  decide(state) {
    const { you, action, table, players } = state;
    
    // Track hand progression
    if (state.handNumber !== this.currentHand.number || state.gameId !== this.currentHand.gameId) {
      this.currentHand = {
        number: state.handNumber,
        gameId: state.gameId,
        preFlopRaiser: null,
        weRaisedPreflop: false,
        potAtFlop: 0,
      };
    }
    
    // Get opponent models
    const activeOpponents = players
      .filter(p => !p.folded && !p.disconnected)
      .map(p => this.getOpponent(p.name));
    
    // Record opponent actions we've observed
    this.recordObservedActions(state, activeOpponents);
    
    // Calculate our hand strength
    const handStrength = state.isPreFlop()
      ? Strategy.preFlopStrength(you.holeCards, you.position)
      : Strategy.postFlopStrength(you.bestHand, state.opponentCount());
    
    // Adjust strategy based on opponents
    const strategy = this.selectStrategy(state, activeOpponents, handStrength);
    
    return strategy;
  }
  
  recordObservedActions(state, opponents) {
    // Track who raised preflop
    if (state.isPreFlop() && state.table.currentBet > state.table.bigBlind) {
      const raiser = state.players.find(p => p.bet === state.table.currentBet && !p.folded);
      if (raiser) {
        this.currentHand.preFlopRaiser = raiser.name;
      }
    }
    
    // Track pot at flop for c-bet calculations
    if (state.isFlop() && this.currentHand.potAtFlop === 0) {
      this.currentHand.potAtFlop = state.table.pot;
    }
  }
  
  selectStrategy(state, opponents, handStrength) {
    const { you, action, table } = state;
    
    // No opponents with data, use default strategy
    if (opponents.length === 0) {
      return this.defaultStrategy(state, handStrength);
    }
    
    // Get primary opponent (the one with most chips or who raised)
    const primaryOpponent = opponents.reduce((a, b) => 
      this.getOpponent(a.name).stats.hands_played > this.getOpponent(b.name).stats.hands_played ? a : b
    );
    
    const oppType = primaryOpponent.getPlayerType();
    const oppVPIP = primaryOpponent.getVPIP();
    const oppAF = primaryOpponent.getAggressionFactor();
    
    console.log(`  Opponent ${primaryOpponent.name}: ${oppType} (VPIP: ${(oppVPIP*100).toFixed(0)}%, AF: ${oppAF.toFixed(1)})`);
    
    // ── PRE-FLOP ─────────────────────────────────────────────
    if (state.isPreFlop()) {
      return this.preFlopVsType(state, handStrength, oppType, primaryOpponent);
    }
    
    // ── POST-FLOP ────────────────────────────────────────────
    return this.postFlopVsType(state, handStrength, oppType, primaryOpponent);
  }
  
  preFlopVsType(state, strength, oppType, opponent) {
    const { action, table } = state;
    const bb = table.bigBlind;
    
    switch (oppType) {
      case 'LAG': // Loose-Aggressive: Tighten up, 3-bet strong hands
        if (strength >= 0.80) {
          return Action.raise(bb * 3.5, action); // Bigger raises
        }
        if (strength >= 0.60 && action.toCall <= bb * 3) {
          return Action.call(); // Call with medium hands
        }
        return Action.checkOrFold(action);
        
      case 'LP': // Loose-Passive: Value bet relentlessly
        if (strength >= 0.55) {
          return Action.raise(bb * 3, action);
        }
        if (strength >= 0.40 && action.toCall <= bb * 2) {
          return Action.call(); // See flops cheaply
        }
        return Action.checkOrFold(action);
        
      case 'TAG': // Tight-Aggressive: Respect raises, bluff occasionally
        if (strength >= 0.75) {
          return Action.raise(bb * 3, action);
        }
        if (strength >= 0.60 && action.toCall <= bb * 2) {
          return Action.call();
        }
        // Occasionally 3-bet bluff in position
        if (state.you.inPosition() && Math.random() < 0.1 && strength >= 0.45) {
          return Action.raise(bb * 3, action);
        }
        return Action.checkOrFold(action);
        
      case 'TP': // Tight-Passive: Steal blinds, value bet
        if (strength >= 0.45 && action.canCheck) {
          return Action.raise(bb * 2.5, action); // Open wide
        }
        if (strength >= 0.65) {
          return Action.raise(bb * 3, action);
        }
        return Action.checkOrFold(action);
        
      default:
        return this.defaultStrategy(state, strength);
    }
  }
  
  postFlopVsType(state, strength, oppType, opponent) {
    const { action, table, you } = state;
    const pot = table.pot;
    
    // We raised preflop - consider c-betting
    const wePFR = this.currentHand.weRaisedPreflop;
    const foldToCbet = opponent.getFoldToCBet();
    
    switch (oppType) {
      case 'LAG': // Let them bluff, call down with medium+ hands
        if (action.canCheck) {
          // Check to induce bluffs
          if (strength >= 0.70) {
            return Action.raise(Math.floor(pot * 0.6), action);
          }
          return Action.check();
        }
        // Facing bet: call more often
        if (strength >= 0.45) {
          return Action.call();
        }
        return Action.fold();
        
      case 'LP': // Value bet thin, they call too much
        if (action.canCheck) {
          if (strength >= 0.50) {
            // Bet for value with medium hands
            return Action.raise(Math.floor(pot * 0.7), action);
          }
          return Action.check();
        }
        // They rarely bet without a hand
        if (strength >= 0.55) {
          return Action.call();
        }
        return Action.fold();
        
      case 'TAG': // Respect bets, bluff when checked to
        if (action.canCheck) {
          // They fold to c-bets often
          if (wePFR && foldToCbet > 0.5) {
            return Action.raise(Math.floor(pot * 0.5), action);
          }
          if (strength >= 0.65) {
            return Action.raise(Math.floor(pot * 0.6), action);
          }
          return Action.check();
        }
        // Only continue with strong hands
        if (strength >= 0.60) {
          return Action.call();
        }
        return Action.fold();
        
      case 'TP': // They only bet with strong hands
        if (action.canCheck) {
          // Bet for value
          if (strength >= 0.55) {
            return Action.raise(Math.floor(pot * 0.65), action);
          }
          return Action.check();
        }
        // Respect their bets - they're usually strong
        if (strength >= 0.70) {
          return Action.call();
        }
        return Action.fold();
        
      default:
        return this.defaultStrategy(state, strength);
    }
  }
  
  defaultStrategy(state, strength) {
    const { action, table } = state;
    
    if (state.isPreFlop()) {
      if (strength >= 0.70) {
        return Action.raise(table.bigBlind * 3, action);
      }
      if (strength >= 0.50 && action.toCall <= table.bigBlind * 2) {
        return Action.call();
      }
      return Action.checkOrFold(action);
    }
    
    // Post-flop
    if (action.canCheck) {
      if (strength >= 0.60) {
        return Action.raise(Math.floor(table.pot * 0.6), action);
      }
      return Action.check();
    }
    
    if (strength >= state.potOdds() + 0.1) {
      return Action.call();
    }
    return Action.fold();
  }
}

// ─────────────────────────────────────────────────────────────
// BOT STARTUP
// ─────────────────────────────────────────────────────────────

const strategy = new DataDrivenStrategy();

createBot({
  port: 3001,
  name: 'DataDrivenBot',
  decide: (state) => strategy.decide(state),
});

// Cleanup on exit
process.on('SIGINT', () => {
  db.close();
  process.exit();
});

console.log(`📊 Database: ${DB_PATH}`);
console.log(`   Tracking opponent statistics...`);
