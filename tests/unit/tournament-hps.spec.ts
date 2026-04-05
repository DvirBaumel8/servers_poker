/**
 * Unit tests for the rolling HPS (hands-per-second) calculation used by
 * ActiveTournament in tournament-director.service.ts.
 *
 * The logic is extracted as a pure function here so it can be tested
 * without instantiating the full NestJS director.
 */
import { describe, it, expect } from "vitest";

/**
 * Mirrors the HPS accumulation logic in ActiveTournament.handleHandComplete().
 * lastHandTs = 0 means "not yet initialised" (first hand is skipped).
 */
function computeRollingHps(
  lastHandTs: number,
  rollingHps: number,
  now: number,
): { lastHandTs: number; rollingHps: number } {
  if (lastHandTs === 0) {
    return { lastHandTs: now, rollingHps };
  }
  const dt = (now - lastHandTs) / 1000;
  if (dt > 0) {
    rollingHps = 0.2 * (1 / dt) + 0.8 * rollingHps;
  }
  return { lastHandTs: now, rollingHps };
}

describe("Rolling HPS calculation", () => {
  it("first hand only sets the timestamp — hps stays 0", () => {
    const { rollingHps, lastHandTs } = computeRollingHps(0, 0, 1000);
    expect(rollingHps).toBe(0);
    expect(lastHandTs).toBe(1000);
  });

  it("second hand computes a non-zero hps", () => {
    // First hand
    let state = computeRollingHps(0, 0, 1000);
    // Second hand 100ms later → 10 hands/sec instantaneous
    state = computeRollingHps(state.lastHandTs, state.rollingHps, 1100);
    expect(state.rollingHps).toBeGreaterThan(0);
  });

  it("converges to correct value for steady-rate hands", () => {
    // Simulate 50 hands at 100ms apart (10 HPS)
    let state = { lastHandTs: 0, rollingHps: 0 };
    let t = 0;
    for (let i = 0; i < 50; i++) {
      t += 100; // 100ms per hand = 10 HPS
      state = computeRollingHps(state.lastHandTs, state.rollingHps, t);
    }
    // After convergence, Math.round should give 10
    expect(Math.round(state.rollingHps)).toBe(10);
  });

  it("does not collapse to 0 for slow hands (>1s between hands)", () => {
    // Hands every 2 seconds → 0.5 HPS — previously Math.round collapsed this to 0
    let state = { lastHandTs: 0, rollingHps: 0 };
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += 2000; // 2s per hand
      state = computeRollingHps(state.lastHandTs, state.rollingHps, t);
    }
    // rollingHps should be ~0.5 — round to 1 (not 0)
    expect(state.rollingHps).toBeGreaterThan(0.4);
    expect(state.rollingHps).toBeLessThan(0.6);
  });

  it("large initial delay (director created long before first hand) does not skew hps", () => {
    // Director created at t=0, first hand fires at t=30s (30,000ms)
    // With old code: lastHandTs = Date.now() at creation → huge dt → hps collapses to 0
    // With new code: lastHandTs = 0 → first hand just sets timestamp → no bad sample

    // First hand at 30s
    let state = computeRollingHps(0, 0, 30_000);
    expect(state.rollingHps).toBe(0); // first hand skipped — no spike or collapse

    // Subsequent hands at 100ms each → 10 HPS
    for (let i = 0; i < 30; i++) {
      state = computeRollingHps(
        state.lastHandTs,
        state.rollingHps,
        state.lastHandTs + 100,
      );
    }
    expect(Math.round(state.rollingHps)).toBe(10);
  });
});
