# Tournament Simulation V4 - Bugs Found

**Date:** 2026-03-21
**Tournament:** Simulation Test V4 - Fixed Chips
**Players:** 30
**Initial Tables:** 4

## Still Worth Re-Checking

The original core runtime failures from this report have been addressed:
- blind levels now advance repeatedly in multi-table simulation runs
- `playersRemaining` and chip syncing are being updated from tournament state/seat data
- tournament games now create backing `games` rows, which removes the earlier FK failures
- table error recovery and table-breaking logic were hardened to avoid stuck/broken redistribution paths

The remaining work is mainly verification-oriented:
1. run one full end-to-end multi-table simulation after the latest persistence changes and confirm the final summary is clean
2. keep an eye on post-finish reporting versus live-state clearing, since some earlier simulation assertions were reading cleared in-memory tables instead of persisted tournament data
