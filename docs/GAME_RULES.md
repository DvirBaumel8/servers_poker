# Poker Game Rules Implementation

## Overview

This document describes how No-Limit Texas Hold'em is implemented in the Poker Platform.

## Game Structure

### Players
- Minimum: 2 players (heads-up)
- Maximum: 10 players per table
- Default: 9-handed

### Chips
- All chip amounts use `BIGINT` (64-bit integers)
- No floating point to avoid precision errors
- Minimum chip unit: 1

### Blinds and Antes
- Small Blind (SB): First position after dealer
- Big Blind (BB): Second position after dealer
- Ante: Optional per-player forced bet (tournaments)

## Betting Rules

### Bet Types

**Fold**
- Forfeit the hand
- No chips required
- Cannot be undone

**Check**
- Pass without betting
- Only valid when current bet equals player's bet
- Moves to next player

**Call**
- Match the current bet
- Amount = currentBet - playerBet
- Goes all-in if insufficient chips

**Bet/Raise**
- Increase the current bet
- Minimum raise = previous raise amount (or big blind)
- Maximum = all remaining chips

**All-In**
- Bet entire remaining stack
- Creates side pot if other players continue

### Minimum Raise

The minimum raise amount equals:
- The size of the previous raise, OR
- The big blind if no raise yet

Example:
- BB is 100
- Player A raises to 300 (raise of 200)
- Player B's minimum re-raise is 200 more (to 500)

### Short All-In

When a player goes all-in for less than the minimum raise:
- The action does NOT reopen betting
- Players who already acted cannot raise again
- They can only call or fold

Example:
- Player A bets 500
- Player B goes all-in for 300 more (800 total)
- Player A cannot re-raise (already acted, short raise)

## Pot Management

### Main Pot
- All players with sufficient chips contribute equally
- Any player can win

### Side Pots

Created when a player goes all-in with less than other players' bets.

Example:
```
Player A: 100 chips (all-in)
Player B: 300 chips (all-in)
Player C: 500 chips (calls)

Pot 1 (main): 300 (100 × 3) - A, B, C eligible
Pot 2: 400 (200 × 2) - B, C eligible
Pot 3: 200 (uncalled bet) - returned to C
```

### Odd Chips

When a pot cannot be divided evenly:
- Extra chip(s) go to first eligible position from dealer
- Consistent with live poker rules

## Hand Evaluation

### Hand Rankings (High to Low)

1. **Royal Flush** (10, J, Q, K, A same suit)
2. **Straight Flush** (5 consecutive cards, same suit)
3. **Four of a Kind** (4 cards same rank)
4. **Full House** (3 of a kind + pair)
5. **Flush** (5 cards same suit)
6. **Straight** (5 consecutive cards)
7. **Three of a Kind** (3 cards same rank)
8. **Two Pair** (2 different pairs)
9. **One Pair** (2 cards same rank)
10. **High Card** (none of the above)

### Special Cases

**Wheel Straight**: A-2-3-4-5 is the lowest straight (Ace plays low)

**Broadway Straight**: 10-J-Q-K-A is the highest straight

**Kickers**: When hands tie, highest unused cards determine winner

Example:
- Player A: A-K with board 2-3-5-7-9 = Ace high, King kicker
- Player B: A-Q with board 2-3-5-7-9 = Ace high, Queen kicker
- Player A wins (King > Queen)

## Betting Rounds

### Pre-Flop
1. Dealer button assigned
2. Small blind posted
3. Big blind posted
4. Antes posted (if applicable)
5. Hole cards dealt (2 per player)
6. Action starts left of big blind

### Flop
1. Burn card
2. Three community cards dealt
3. Action starts left of dealer

### Turn
1. Burn card
2. One community card dealt
3. Action starts left of dealer

### River
1. Burn card
2. One community card dealt
3. Action starts left of dealer

### Showdown
- Remaining players reveal hands
- Best hand(s) win the pot(s)
- If only one player remains, no showdown required

## Chip Conservation

The platform enforces strict chip conservation:

```
Total Chips = Sum of all player stacks + Pot
```

This invariant is checked:
- After every betting action
- After every pot distribution
- At hand completion

Violations trigger:
1. Immediate game halt
2. Error logging with full state
3. Alert to administrators
4. Recovery from last valid state

## Timeouts and Disconnections

### Timeout Handling
- Default timeout: 10 seconds per action
- On timeout: automatic fold
- Strike system: 3 strikes = disconnection

### Disconnection
- Disconnected players auto-fold until reconnection
- Chips remain in tournament (if applicable)
- Player can reconnect if tournament still running

### Strike System
```
Strike 1: Warning logged, fold action
Strike 2: Warning logged, fold action
Strike 3: Player disconnected, chips forfeited (cash) or blinded off (tournament)
```

## Tournament-Specific Rules

### Blind Levels
- Increase based on time or hands played
- Antes typically start at level 3-4
- Structure defined at tournament creation

### Table Balancing
- Triggered when table imbalance exceeds 2 players
- Players moved to maintain balance
- Preference for moving non-button players

### Final Table
- All remaining players combined to single table
- Redrawn seats
- Play until winner determined

### Payouts
- Configured per tournament
- Typically top 10-15% paid
- Winner takes largest share

## Validation Rules

### Action Validation
1. Player is in the hand (not folded)
2. Player is not all-in
3. Action is valid for current state
4. Amount is within valid range (if applicable)
5. Player has sufficient chips

### State Validation
1. Exactly 2 hole cards per active player
2. 0-5 community cards
3. All chip totals non-negative
4. Pot total matches sum of bets
5. Total chips conserved
