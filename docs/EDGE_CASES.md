# Poker Engine — Edge Cases & Bug Prevention

A comprehensive list of edge cases, potential bugs, and their handling status.
This document is the definitive reference for testing and QA.

---

## Critical Priority (Money/Chip Integrity)

### 1. Side Pot Distribution with Multiple All-Ins
**Scenario:** Three players all-in with different amounts: P1 ($100), P2 ($250), P3 ($500)
**Expected:**
- Main pot: $300 (P1, P2, P3 each contribute $100) - all three eligible
- Side pot 1: $300 (P2, P3 each contribute $150 more) - P2 and P3 eligible
- Side pot 2: $250 (P3 contributes remaining $250) - only P3 eligible

**Status:** ⚠️ Implemented in `PotManager.calculatePots()` - needs comprehensive tests
**Test needed:** Multiple all-in amounts with different winners per pot

### 2. Split Pot with Odd Chips
**Scenario:** $101 pot split between 2 players with identical hands
**Expected:** One player gets $51, other gets $50. Odd chip goes to first player after button.
**Status:** ✅ Implemented in `PotManager.distributePot()` with proper odd chip distribution
**Tests:** 9 TDD tests in `edge-cases-tdd.spec.ts` covering 2-way, 3-way, 4-way splits

### 3. Three-Way (or More) Split Pot
**Scenario:** Three players tie at showdown with $100 pot
**Expected:** Each gets $33, odd chip(s) distributed starting from closest to button
**Status:** ✅ Implemented in `PotManager.distributePot()` with button-based odd chip distribution
**Tests:** TDD tests verify correct distribution for $100/3 = 34 + 33 + 33

### 4. Side Pot with Folded Player's Chips
**Scenario:** P1 bets $100, P2 calls, P3 raises to $300, P1 folds, P2 goes all-in for $150 total
**Expected:** P1's folded $100 still in main pot, correctly distributed
**Status:** ✅ `PotManager` includes folded players' contributions
**Test needed:** Verify folded player chips are in correct pot

### 5. Short All-In Does Not Reopen Betting
**Scenario:** P1 bets $100, P2 calls, P3 all-in for $130 (less than min raise of $100)
**Expected:** P1 and P2 can only call $30 or fold - cannot re-raise
**Status:** ✅ Fully implemented in `BettingRound` with `canReraise()`, `wasLastRaiseFull()`, `getValidActionsForPlayer()`
**Tests:** TDD tests verify re-raise blocked after short all-in, allowed after full raise

### 6. All-In for Exactly the Blind Amount
**Scenario:** Player in BB position has exactly $50 (the BB amount)
**Expected:** Player posts blind and is immediately all-in, can win main pot
**Status:** ⚠️ Needs verification
**Test needed:** BB all-in edge case with subsequent betting

### 7. Chip Conservation After Hand Cancellation
**Scenario:** Hand cancelled mid-play (server error, all disconnect)
**Expected:** All chips returned to players at start-of-hand amounts
**Status:** ✅ Implemented in `PokerGameService.rollbackHand()` with snapshot restore
**Tests:** 6 TDD tests verify chip restoration, pot reset, status reset, event emission

---

## High Priority (Game Flow)

### 8. Heads-Up Blind Posting
**Scenario:** Only 2 players remaining
**Expected:** 
- Button/Small Blind is the same position
- Small blind acts first preflop, last postflop
- When transitioning from 3 to 2 players, blind positions adjust correctly
**Status:** ⚠️ Needs verification for transition case
**Test needed:** 3-player to heads-up transition, dealer button movement

### 9. Dead Button Rule vs Moving Button
**Scenario:** Big blind busts, next hand dealer button position
**Expected:** Choose one system and implement consistently:
- Dead Button: BB always advances, button may skip seats
- Moving Button: Button always advances
**Status:** ✅ Implemented Dead Button rule in `PokerGameService.advanceDealer()` and `getBlindPositions()`
**Tests:** 5 TDD tests verify button skips eliminated players, heads-up BTN=SB handling

### 10. Player Busts on Ante (Zero Chips After Ante)
**Scenario:** Player has exactly 25 chips, ante is 25
**Expected:** Player posts ante and is immediately all-in for the main pot
**Status:** ⚠️ Needs verification
**Test needed:** Ante equals remaining chips

### 11. All Players All-In Preflop
**Scenario:** All remaining players are all-in before any community cards
**Expected:** 
- No more betting rounds
- Deal all 5 community cards
- Determine winner and distribute pots
**Status:** ⚠️ Needs verification
**Test needed:** 5-player preflop all-in

### 12. Simultaneous Bust (Same Hand, Same Chips)
**Scenario:** Two players with same stack go all-in vs each other, both lose to third player
**Expected:** Both finish in same position, split any payout for that position
**Status:** ⚠️ Likely not handled
**Fix needed:** Track bust order or handle ties

### 13. Multiple Players Disconnect Same Hand
**Scenario:** 3 of 4 players disconnect during a hand
**Expected:** 
- Each gets penalty fold in order
- Remaining player wins the pot
- Tournament continues with remaining player(s)
**Status:** ⚠️ Partial - single disconnect works, multiple needs testing
**Test needed:** Sequential disconnect handling

---

## Medium Priority (Tournament)

### 14. Table Balancing with Odd Player Counts
**Scenario:** 19 players, 3 tables (currently 6-7-6), one table has player bust
**Expected:** Move player from 7-seat table to maintain balance (≤2 difference)
**Status:** ⚠️ Tournament director exists but needs verification
**Test needed:** Complex rebalancing scenarios

### 15. Final Table Formation Mid-Hand
**Scenario:** A bust during a hand brings total players to ≤9 across multiple tables
**Expected:** 
- Complete current hands on all tables
- Then consolidate to final table
- Not mid-hand
**Status:** ⚠️ Needs verification
**Test needed:** Trigger final table during active hand

### 16. Late Registration at High Blind Level
**Scenario:** Player registers when blinds are 500/1000, gets starting stack of 1000
**Expected:** Player starts with 1BB (severely disadvantaged but legal)
**Status:** ✅ Documented in KNOWLEDGE.md
**Test needed:** Verify play is possible at <1BB effective stack

### 17. Bubble Play - Last Player Before Money
**Scenario:** Tournament pays top 3, 4 players remain, one busts
**Expected:** 
- Accurate finish position (4th = bubble)
- Payout of $0 for bubble
- Correct handling if multiple bust same hand
**Status:** ⚠️ Needs verification for simultaneous bust on bubble

### 18. Hand-for-Hand Play
**Scenario:** Bubble situation, need synchronized hand completion
**Expected:** 
- All tables start hands simultaneously
- No new hands until all complete
- Fair bust determination across tables
**Status:** ✅ Logic implemented and tested (TDD tests verify synchronization, waiting, bust ordering)
**Tests:** 6 TDD tests verify bubble detection, table sync, pause completed tables, bust chip-count ordering

---

## Lower Priority (Edge Cases)

### 19. Action Timeout Exactly on Turn Change
**Scenario:** Bot times out at the exact moment the server advances turn
**Expected:** Clean handling without double action or skipped player
**Status:** ⚠️ Race condition possible
**Fix needed:** Mutex/lock on turn transitions

### 20. WebSocket Reconnection Mid-Hand
**Scenario:** Bot disconnects, reconnects before timeout expires
**Expected:** 
- Reconnection accepted
- Strike counter reset to 0
- Player continues in hand
**Status:** ⚠️ Partial - `addPlayer` has reconnection logic
**Test needed:** Reconnect during active hand

### 21. Invalid JSON Response from Bot
**Scenario:** Bot returns `{ "type": "rais` (truncated/invalid JSON)
**Expected:** 
- Parse error caught
- Penalty fold applied
- Strike incremented
- Game continues
**Status:** ⚠️ Needs verification in bot caller
**Test needed:** Various malformed responses

### 22. Bot Returns Valid JSON but Wrong Schema
**Scenario:** Bot returns `{ "action": "fold" }` instead of `{ "type": "fold" }`
**Expected:** Invalid action handling, penalty fold
**Status:** ⚠️ Needs DTO validation
**Fix needed:** Strict schema validation on bot responses

### 23. Extremely Large Chip Amounts
**Scenario:** Player has 9,007,199,254,740,992 chips (JS MAX_SAFE_INTEGER)
**Expected:** 
- No overflow
- Accurate arithmetic
- BIGINT storage in PostgreSQL works
**Status:** ✅ BIGINT in DB, but JS arithmetic needs verification
**Test needed:** Large number arithmetic edge cases

### 24. Decimal Chip Amounts
**Scenario:** Split pot results in non-integer (shouldn't happen but...)
**Expected:** Always integer chips, proper rounding
**Status:** ⚠️ Needs verification
**Fix needed:** Ensure all chip ops use Math.floor

### 25. Tournament with 1 Registrant
**Scenario:** Only one bot registers before start time
**Expected:** 
- Tournament cancelled OR
- Wait for minimum players
- Refund entry fee
**Status:** ⚠️ Needs verification
**Test needed:** Minimum player enforcement

### 26. Same Bot Registers Twice
**Scenario:** Race condition allows double registration
**Expected:** Second registration rejected, first preserved
**Status:** ⚠️ Check for UNIQUE constraint or app-level check
**Fix needed:** Ensure atomic registration

### 27. Button on Eliminated Player
**Scenario:** Dealer busts, next hand button assignment
**Expected:** Button moves to next active player
**Status:** ⚠️ Needs verification in dealer rotation logic
**Test needed:** Button movement after bust

---

## Concurrency & Race Conditions

### 28. Two Actions Received Simultaneously
**Scenario:** Due to network, two action messages arrive at nearly same time
**Expected:** First processed, second rejected as out-of-turn
**Status:** ✅ `currentPlayerId` check exists
**Test needed:** Concurrent WebSocket message handling

### 29. State Read During Write
**Scenario:** Client requests game state while action is being processed
**Expected:** Consistent state returned (before or after action, not partial)
**Status:** ⚠️ No explicit locking
**Fix needed:** Consider read/write locks for state access

### 30. Tournament State During Table Break
**Scenario:** Query tournament state while table is being broken/reformed
**Expected:** Consistent response
**Status:** ⚠️ `_handLock` exists but state queries may bypass
**Test needed:** Concurrent state queries during transitions

---

## Bot Protocol Edge Cases

### 31. Bot Returns Action After Timeout
**Scenario:** Bot responds after timeout but before next player acts
**Expected:** Response ignored, penalty fold already applied
**Status:** ⚠️ Needs verification in timeout handling
**Test needed:** Late response handling

### 32. Bot Raises by Zero
**Scenario:** `{ "type": "raise", "amount": 0 }`
**Expected:** Invalid action, penalty fold
**Status:** ✅ Validation exists in `BettingRound.applyAction`

### 33. Bot Raises More Than Stack
**Scenario:** Bot has 500 chips, raises 1000
**Expected:** Treated as all-in for 500
**Status:** ✅ `Math.min` used in action processing

### 34. Bot Bets Negative Amount
**Scenario:** `{ "type": "raise", "amount": -100 }`
**Expected:** Invalid action, penalty fold
**Status:** ✅ Validation checks positive amount

### 35. Bot Returns Extra Fields
**Scenario:** `{ "type": "fold", "secret_data": "..." }`
**Expected:** Extra fields ignored, action processed
**Status:** ⚠️ Depends on parsing implementation
**Test needed:** Verify extra fields don't cause issues

---

## Implementation Priority

### ✅ Completed (Production Ready):
1. ✅ Split pot odd chip distribution (#2, #3) - `PotManager.distributePot()`
2. ✅ Short all-in reopening validation (#5) - `BettingRound.canReraise()`
3. ✅ Hand cancellation/rollback (#7) - `PokerGameService.rollbackHand()`
4. ✅ Dead button rule implementation (#9) - `PokerGameService.advanceDealer()`
5. ✅ Hand-for-hand bubble play logic (#18) - TDD tests verify synchronization

### Must Fix Before Production:
1. Heads-up blind posting transition (#8) - Needs verification
2. Simultaneous bust handling (#12) - Needs implementation

### Should Fix:
1. Concurrency locks (#29, #30)
2. Strict bot response validation (#22)

### Nice to Have:
1. Large number handling verification (#23)
2. Additional edge case test coverage

---

## Testing Commands

```bash
# Run all edge case tests
npm run test -- --grep "edge"

# Run specific category
npm run test -- --grep "side pot"
npm run test -- --grep "heads-up"
npm run test -- --grep "all-in"

# Simulation with stress testing
npm run simulate -- --bots=45 --deterministic --personalities=maniac,allin,crasher
```

---

## References

- Betfair "Everyone Got Second" bug (2008) - payout calculation error
- GGPoker $5M tournament cancellation (2025) - table balancing bugs
- TDA (Tournament Directors Association) rules for official poker rulings
