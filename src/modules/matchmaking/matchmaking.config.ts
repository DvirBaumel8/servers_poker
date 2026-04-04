export const MATCHMAKING_CONFIG = {
  /** 60% of monthly premium revenue goes to daily prize pool */
  REVENUE_POOL_PERCENTAGE: 60n,

  /** Days per month for daily pool calculation */
  DAYS_PER_MONTH: 30n,

  /** 15% of field gets paid (ITM = In The Money) */
  ITM_PERCENTAGE: 0.15,

  /** Minimum players to run a tournament */
  MIN_PLAYERS: 2,

  /** Default table size for pods */
  DEFAULT_POD_SIZE: 9,

  /** Cron schedules (UTC) */
  CRON_CREATE: "0 8 * * *",
  CRON_LOCK: "55 20 * * *",
  CRON_EXECUTE: "0 21 * * *",

  /**
   * Payout curve percentages for top 3 ITM positions.
   * Remaining positions split the leftover equally.
   */
  PAYOUT_CURVE: [30, 20, 15],
} as const;
