import { Injectable } from "@nestjs/common";

export interface PayoutResult {
  rank: number;
  amount: number;
  percentage: number;
}

/**
 * PrizePoolService — Dynamic tier-based payout calculator.
 *
 * Uses integer percentage tables per player-count bracket and BigInt arithmetic
 * to guarantee the sum of all prizes equals totalPool exactly (remainder → 1st place).
 *
 * Tier table:
 *  1–6   players  → 1 ITM  [100]
 *  7–15  players  → 2 ITM  [70, 30]
 *  16–30 players  → 3 ITM  [50, 30, 20]
 *  31–50 players  → 5 ITM  [40, 25, 15, 12, 8]
 *  51–99 players  → 8 ITM  [30, 20, 15, 10, 8, 7, 5, 5]
 *  100+  players  → 10% ITM, top-3 [25, 15, 10], rest linear-decay to share the remaining 50
 */
@Injectable()
export class PrizePoolService {
  /**
   * Calculate prize payouts for a tournament.
   *
   * @param totalPool      Total prize pool in the smallest currency unit (cents/agorot). Must be a positive integer.
   * @param participantCount Number of registered players. Must be >= 1.
   * @returns Ordered array of payouts (rank 1 = winner). Amounts sum exactly to totalPool.
   */
  calculatePayouts(
    totalPool: number,
    participantCount: number,
  ): PayoutResult[] {
    if (!Number.isInteger(totalPool) || totalPool < 1) {
      throw new Error("totalPool must be a positive integer");
    }
    if (!Number.isInteger(participantCount) || participantCount < 1) {
      throw new Error("participantCount must be a positive integer");
    }

    const pool = BigInt(totalPool);
    const percentages = this.resolvePercentages(participantCount);

    let remaining = pool;
    const results: PayoutResult[] = percentages.map((pct, i) => {
      const amount = (pool * BigInt(pct)) / 100n;
      remaining -= amount;
      return { rank: i + 1, amount: Number(amount), percentage: pct };
    });

    // Add BigInt division remainder to 1st place so sum === totalPool exactly
    if (remaining > 0n) {
      results[0].amount += Number(remaining);
    }

    return results;
  }

  /**
   * Resolve the integer percentage array for a given participant count.
   * Each value represents a whole-number percentage (e.g. 30 = 30%).
   * The array sum may be slightly below 100 for the 100+ tier due to
   * integer floor; the remainder is handled by calculatePayouts.
   */
  private resolvePercentages(n: number): number[] {
    if (n <= 6) return [100];
    if (n <= 15) return [70, 30];
    if (n <= 30) return [50, 30, 20];
    if (n <= 50) return [40, 25, 15, 12, 8];
    if (n <= 99) return [30, 20, 15, 10, 8, 7, 5, 5];
    return this.buildLargeFieldPercentages(n);
  }

  /**
   * For 100+ player fields:
   * - ITM = max(10, floor(n × 0.10))
   * - Top 3 positions: [25, 15, 10]  (50% total)
   * - Remaining R = ITM-3 positions share the other 50% via linear decay:
   *     weight[j] = R - j  (highest weight → 4th place)
   *     pct[j]   = floor(50 × weight[j] / sumWeights)
   */
  private buildLargeFieldPercentages(n: number): number[] {
    const itm = Math.max(10, Math.floor(n * 0.1));
    const top = [25, 15, 10];
    const R = itm - 3;
    const sumWeights = (R * (R + 1)) / 2;
    const decay = Array.from({ length: R }, (_, j) =>
      Math.floor((50 * (R - j)) / sumWeights),
    );
    return [...top, ...decay];
  }
}
