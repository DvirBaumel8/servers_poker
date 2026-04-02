# Poker Game Bugs - Auto-Generated

Last updated: 2026-04-02T20:43:40.219Z
Total bugs found: 4

## Bug #1 - 2026-04-02T20:43:17.857Z
**Severity**: Critical
**Invariant Broken**: Total chips mismatch
**Game ID**: sim-fe88bca9
**Action #**: 107

### Error Details:
```json
{
  "expected": 6000,
  "actual": 5990,
  "delta": -10,
  "stacks": 5990,
  "pot": 0
}
```

### Last 10 Actions:
- check
- check
- check
- fold
- check
- call 10
- raise 20
- call 20
- call 56
- call 115

---

## Bug #2 - 2026-04-02T20:43:17.865Z
**Severity**: Critical
**Invariant Broken**: Game loop threw exception
**Game ID**: sim-fe88bca9
**Action #**: 108

### Error Details:
```json
{
  "error": "Chip conservation violated on hand 3: expected 6000, got 5990 (5990 in stacks + 0 in pot). Players: [Shark:980, Rock:0, Maniac:0, Station:5010, Nit:0, ProBot:0]",
  "stack": "Error: Chip conservation violated on hand 3: expected 6000, got 5990 (5990 in stacks + 0 in pot). Players: [Shark:980, Rock:0, Maniac:0, Station:5010, Nit:0, ProBot:0]\n    at GameInstance.assertChipConservation (/Users/dvir.baumel/servers_poker/servers_poker/src/services/game/live-game-manager.service.ts:965:19)\n    at GameInstance.startGame (/Users/dvir.baumel/servers_poker/servers_poker/src/services/game/live-game-manager.service.ts:332:14)\n    at async runSimulatedGame (/Users/dvir.baumel/servers_poker/servers_poker/src/testing-utilities/game-simulator.ts:197:5)\n    at async main (/Users/dvir.baumel/servers_poker/servers_poker/scripts/run-poker-tests.ts:48:22)"
}
```

### Last 10 Actions:
- check
- check
- check
- fold
- check
- call 10
- raise 20
- call 20
- call 56
- call 115

---

## Bug #3 - 2026-04-02T20:43:26.433Z
**Severity**: Critical
**Invariant Broken**: Total chips mismatch
**Game ID**: sim-9320a17d
**Action #**: 1124

### Error Details:
```json
{
  "expected": 6000,
  "actual": 5990,
  "delta": -10,
  "stacks": 5990,
  "pot": 0
}
```

### Last 10 Actions:
- check
- check
- check
- fold
- check
- call 5
- fold
- fold
- raise 55
- fold

---

## Bug #4 - 2026-04-02T20:43:26.435Z
**Severity**: Critical
**Invariant Broken**: Game loop threw exception
**Game ID**: sim-9320a17d
**Action #**: 1125

### Error Details:
```json
{
  "error": "Chip conservation violated on hand 70: expected 6000, got 5990 (5990 in stacks + 0 in pot). Players: [Shark:0, Rock:0, Maniac:735, Station:0, Nit:5255, ProBot:0]",
  "stack": "Error: Chip conservation violated on hand 70: expected 6000, got 5990 (5990 in stacks + 0 in pot). Players: [Shark:0, Rock:0, Maniac:735, Station:0, Nit:5255, ProBot:0]\n    at GameInstance.assertChipConservation (/Users/dvir.baumel/servers_poker/servers_poker/src/services/game/live-game-manager.service.ts:965:19)\n    at GameInstance.startGame (/Users/dvir.baumel/servers_poker/servers_poker/src/services/game/live-game-manager.service.ts:332:14)\n    at async runSimulatedGame (/Users/dvir.baumel/servers_poker/servers_poker/src/testing-utilities/game-simulator.ts:197:5)\n    at async main (/Users/dvir.baumel/servers_poker/servers_poker/scripts/run-poker-tests.ts:48:22)"
}
```

### Last 10 Actions:
- check
- check
- check
- fold
- check
- call 5
- fold
- fold
- raise 55
- fold

---

