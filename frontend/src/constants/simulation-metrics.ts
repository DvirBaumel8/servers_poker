/**
 * Tooltip definitions for simulation result metrics.
 * Keys match the metric labels used in SimulationsPage metric cards.
 */
export const METRIC_TOOLTIPS: Record<string, string> = {
  'bb/100': 'Average Big Blinds won/lost per 100 hands.',
  'Win Rate': 'Percentage of hands where your bot won the pot.',
  'VPIP': 'Voluntarily Put In Pot. Percentage of hands played.',
  'PFR': 'Pre-Flop Raise. Percentage of hands raised before the flop.',
  'Agg Factor': 'Ratio of aggressive actions (bet/raise) vs passive actions (call).',
  'Total Profit': 'Net chip gain or loss over all simulated hands.',
}
