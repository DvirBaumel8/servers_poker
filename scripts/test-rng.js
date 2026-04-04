'use strict';
/**
 * RNG Fairness Validator — scripts/test-rng.js
 *
 * Runs 10,000,000 Fisher-Yates shuffles (crypto.randomBytes) and validates
 * that every card appears in every position with uniform probability.
 *
 * Usage:  node scripts/test-rng.js
 * Output: console report + scripts/rng-heatmap.csv + scripts/rng-summary.json
 */

const { isMainThread, Worker, workerData, parentPort } = require('worker_threads');
const { randomBytes } = require('crypto');
const { cpus } = require('os');
const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────

const DECK_SIZE    = 52;
const TOTAL_ITERS  = 10_000_000;
const MATRIX_SIZE  = DECK_SIZE * DECK_SIZE; // 2704 cells
const EXPECTED     = TOTAL_ITERS / DECK_SIZE; // ~192307.69 per cell

// Card labels for display (matches deck.ts suit/rank order)
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const CARD_LABELS = [];
for (const suit of SUITS) for (const rank of RANKS) CARD_LABELS.push(`${rank}${suit}`);

// ─── Shared shuffle logic (JS port of deck.ts lines 58-66) ───────────────────

function shuffle(deck) {
  const d = deck.slice();
  const bytes = randomBytes(d.length * 4);
  for (let i = d.length - 1; i > 0; i--) {
    const j = bytes.readUInt32BE(i * 4) % (i + 1);
    const tmp = d[i]; d[i] = d[j]; d[j] = tmp;
  }
  return d;
}

// ─── Worker thread ────────────────────────────────────────────────────────────

if (!isMainThread) {
  const { iterations } = workerData;

  // Flat Int32Array: freq[card * DECK_SIZE + position]
  const freq = new Int32Array(MATRIX_SIZE);
  const baseDeck = Array.from({ length: DECK_SIZE }, (_, i) => i);

  for (let iter = 0; iter < iterations; iter++) {
    const deck = shuffle(baseDeck);
    for (let pos = 0; pos < DECK_SIZE; pos++) {
      freq[deck[pos] * DECK_SIZE + pos]++;
    }
  }

  parentPort.postMessage({ freq: Buffer.from(freq.buffer) });
  return;
}

// ─── Main thread ──────────────────────────────────────────────────────────────

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

async function main() {
  const numWorkers = cpus().length;
  const baseIter   = Math.floor(TOTAL_ITERS / numWorkers);
  const remainder  = TOTAL_ITERS % numWorkers;

  console.log(`[${ts()}] Starting ${TOTAL_ITERS.toLocaleString()} shuffle simulation across ${numWorkers} workers...`);
  const t0 = Date.now();

  // Spawn workers
  const workerPromises = Array.from({ length: numWorkers }, (_, i) => {
    const iterations = baseIter + (i < remainder ? 1 : 0);
    return new Promise((resolve, reject) => {
      const w = new Worker(__filename, { workerData: { iterations } });
      w.on('message', resolve);
      w.on('error', reject);
    });
  });

  const results = await Promise.all(workerPromises);

  // Merge frequency matrices
  const freq = new Int32Array(MATRIX_SIZE);
  for (const { freq: buf } of results) {
    const workerFreq = new Int32Array(buf.buffer, buf.byteOffset, MATRIX_SIZE);
    for (let i = 0; i < MATRIX_SIZE; i++) freq[i] += workerFreq[i];
  }

  const elapsed = (Date.now() - t0) / 1000;
  console.log(`[${ts()}] Simulation complete in ${elapsed.toFixed(2)}s`);

  // ─── Chi-Squared Test ──────────────────────────────────────────────────────
  // χ² = Σ (O - E)² / E  over all 52×52 cells
  let chi2 = 0;
  for (let i = 0; i < MATRIX_SIZE; i++) {
    const diff = freq[i] - EXPECTED;
    chi2 += (diff * diff) / EXPECTED;
  }

  const df = MATRIX_SIZE - 1; // 2703

  // Wilson-Hilferty normal approximation for p-value of χ²(df)
  const h = Math.pow(chi2 / df, 1 / 3);
  const mu = 1 - 2 / (9 * df);
  const sigma = Math.sqrt(2 / (9 * df));
  const z = (h - mu) / sigma;
  const pValue = 1 - standardNormalCDF(z);

  const pass = pValue >= 0.05;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Chi-Squared Statistic : ${chi2.toFixed(2)}`);
  console.log(`Degrees of Freedom    : ${df}`);
  console.log(`p-value               : ${pValue.toFixed(6)}`);
  console.log(`Result                : ${pass
    ? '✓ PASS — distribution is uniform (p >= 0.05)'
    : '✗ CRITICAL FAILURE — non-random distribution detected (p < 0.05)'}`);
  console.log(`${'─'.repeat(60)}\n`);

  // ─── Distribution Table ───────────────────────────────────────────────────
  // Build array of all cells with their deviation from expected
  const cells = [];
  for (let card = 0; card < DECK_SIZE; card++) {
    for (let pos = 0; pos < DECK_SIZE; pos++) {
      const obs = freq[card * DECK_SIZE + pos];
      cells.push({ card, pos, obs, dev: obs - EXPECTED });
    }
  }
  cells.sort((a, b) => b.obs - a.obs);

  const tableHeader = `  ${'Card'.padEnd(6)} ${'Pos'.padEnd(4)} ${'Observed'.padEnd(10)} vs Expected`;
  console.log('Top 5 most frequent card-position pairs:');
  console.log(tableHeader);
  for (const c of cells.slice(0, 5)) {
    console.log(`  ${CARD_LABELS[c.card].padEnd(6)} ${String(c.pos).padEnd(4)} ${String(c.obs).padEnd(10)} ${c.dev >= 0 ? '+' : ''}${c.dev.toFixed(0)}`);
  }

  console.log('\nBottom 5 least frequent card-position pairs:');
  console.log(tableHeader);
  for (const c of cells.slice(-5).reverse()) {
    console.log(`  ${CARD_LABELS[c.card].padEnd(6)} ${String(c.pos).padEnd(4)} ${String(c.obs).padEnd(10)} ${c.dev >= 0 ? '+' : ''}${c.dev.toFixed(0)}`);
  }

  // ─── Heatmap CSV ──────────────────────────────────────────────────────────
  const csvPath = path.join(__dirname, 'rng-heatmap.csv');
  const header  = ['card', ...Array.from({ length: DECK_SIZE }, (_, i) => `pos${i}`)].join(',');
  const rows    = [header];
  for (let card = 0; card < DECK_SIZE; card++) {
    const row = [CARD_LABELS[card]];
    for (let pos = 0; pos < DECK_SIZE; pos++) row.push(freq[card * DECK_SIZE + pos]);
    rows.push(row.join(','));
  }
  fs.writeFileSync(csvPath, rows.join('\n') + '\n');
  console.log(`\nHeatmap written to scripts/rng-heatmap.csv`);

  // ─── Summary JSON ─────────────────────────────────────────────────────────
  const jsonPath = path.join(__dirname, 'rng-summary.json');

  // Per-card total frequency (should all be ~TOTAL_ITERS)
  const cardTotals = {};
  for (let card = 0; card < DECK_SIZE; card++) {
    let total = 0;
    for (let pos = 0; pos < DECK_SIZE; pos++) total += freq[card * DECK_SIZE + pos];
    cardTotals[CARD_LABELS[card]] = total;
  }

  const summary = {
    simulationDate: new Date().toISOString(),
    totalShuffles: TOTAL_ITERS,
    deckSize: DECK_SIZE,
    workers: numWorkers,
    elapsedSeconds: elapsed,
    chiSquaredStatistic: chi2,
    degreesOfFreedom: df,
    pValue,
    pass,
    expectedFrequencyPerCell: EXPECTED,
    cardTotalFrequencies: cardTotals,
    top5Pairs: cells.slice(0, 5).map(c => ({
      card: CARD_LABELS[c.card],
      position: c.pos,
      observed: c.obs,
      deviation: c.dev
    })),
    bottom5Pairs: cells.slice(-5).reverse().map(c => ({
      card: CARD_LABELS[c.card],
      position: c.pos,
      observed: c.obs,
      deviation: c.dev
    }))
  };
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log('Summary written to scripts/rng-summary.json');

  if (!pass) process.exit(1);
}

// ─── Standard normal CDF (Abramowitz & Stegun approximation) ─────────────────

function standardNormalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530
    + t * (-0.356563782
    + t * (1.781477937
    + t * (-1.821255978
    + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

main().catch(err => { console.error(err); process.exit(1); });
