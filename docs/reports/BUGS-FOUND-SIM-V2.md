# Bugs Found During Tournament Simulation v2

**Date**: 2026-03-21
**Tournament**: Ultimate Bot Championship v2 (32 players)
**Duration**: ~5 minutes (accelerated testing with 5s turn timeout)

## Bugs Still Open / Not Fully Re-Verified

At the moment, the original simulation issues in this report have either been fixed or superseded by later, more precise simulation findings.

## UI Bugs (From Previous Session)

### Tournament Status Not Updating
- **Issue**: "Registering" badge doesn't update to "Running" in real-time
- **File**: `frontend/src/pages/Tournaments.tsx`

## Performance Observations

1. Tournament completed in ~5 minutes with 32 players
2. Multiple tables consolidated correctly (3 → 2 → 1)
3. Blind levels increased appropriately (level 1 → 7)
4. Prize distribution worked correctly for top 5

## Recommendations

1. Add frontend WebSocket subscriptions for real-time status updates
2. Consider adding structured logging for tournament events
