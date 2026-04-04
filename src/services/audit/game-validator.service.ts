/**
 * GameValidatorService
 * ====================
 * Standalone (no NestJS DI) offline audit service.
 * Reads completed hands from the DB, runs 11 invariant checks, and writes
 * logic_bugs + sets hands.validation_error — never mutates game outcomes.
 *
 * Usage:
 *   const svc = new GameValidatorService()
 *   await svc.connect()
 *   const summary = await svc.auditHands()
 *   await svc.disconnect()
 */

import * as crypto from "crypto";
import "reflect-metadata";
import { DataSource, In, IsNull, Not } from "typeorm";
import { types as pgTypes } from "pg";
import { Hand } from "../../entities/hand.entity";
import { HandSeed } from "../../entities/hand-seed.entity";
import { TournamentPod } from "../../entities/tournament-pod.entity";
import { LogicBug } from "../../entities/logic-bug.entity";
import { determineWinners } from "../../domain/handEvaluator";

// pg driver: return bigint columns as strings so BigInt() can parse them.
pgTypes.setTypeParser(20, (val: string) => val);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditSummary {
  audited: number;
  chipLeaks: number;
  potMismatches: number;
  sequenceErrors: number;
  sidePotErrors: number;
  showdownErrors: number;
  duplicateCardErrors: number;
  seedReplayErrors: number;
  streetProgressionErrors: number;
  minRaiseErrors: number;
  oddChipErrors: number;
  itmCountErrors: number;
  prizePoolErrors: number;
  // new checks
  chipContinuityErrors: number;
  duplicateActionSeqErrors: number;
  winnerAmountErrors: number;
  blindStructureErrors: number;
  winRateAnomalies: number;
  zeroResponseTimeErrors: number;
  totalBugsFound: number;
}

interface BugInsert {
  hand_id: string | null;
  check_name: string;
  description: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pure crypto helpers (mirrors ProvablyFairService — no NestJS DI needed)
// ---------------------------------------------------------------------------

function combineSeedsHmac(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): string {
  return crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
}

function generateDeckOrder(combinedHash: string): number[] {
  const deckSize = 52;
  const order = Array.from({ length: deckSize }, (_, i) => i);
  let hashIndex = 0;

  const getNextByte = (): number => {
    if (hashIndex >= combinedHash.length) {
      const ext = crypto
        .createHash("sha256")
        .update(combinedHash + hashIndex.toString())
        .digest("hex");
      hashIndex = 0;
      return parseInt(ext.substring(0, 2), 16);
    }
    const byte = parseInt(combinedHash.substring(hashIndex, hashIndex + 2), 16);
    hashIndex += 2;
    return byte;
  };

  for (let i = deckSize - 1; i > 0; i--) {
    const randomValue = (getNextByte() << 8) | getNextByte();
    const j = randomValue % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }

  return order;
}

// ---------------------------------------------------------------------------
// Card rank → numeric value (mirrors deck.ts RANK_VALUES)
// ---------------------------------------------------------------------------

const RANK_VALUES: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

// Safe bigint JSON replacer
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function serializeDetails(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj, bigintReplacer));
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

export class GameValidatorService {
  private ds!: DataSource;

  async connect(): Promise<void> {
    this.ds = new DataSource({
      type: "postgres",
      host: process.env.DB_HOST ?? "localhost",
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? "postgres",
      password: process.env.DB_PASSWORD ?? "postgres",
      database: process.env.DB_NAME ?? "poker",
      ssl:
        process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      entities: [__dirname + "/../../entities/*.entity{.ts,.js}"],
      logging: false,
    });
    await this.ds.initialize();
  }

  async disconnect(): Promise<void> {
    if (this.ds?.isInitialized) {
      await this.ds.destroy();
    }
  }

  // -------------------------------------------------------------------------
  // Main audit entry point
  // -------------------------------------------------------------------------

  async auditHands(batchSize = 1000, concurrency = 200): Promise<AuditSummary> {
    const summary: AuditSummary = {
      audited: 0,
      chipLeaks: 0,
      potMismatches: 0,
      sequenceErrors: 0,
      sidePotErrors: 0,
      showdownErrors: 0,
      duplicateCardErrors: 0,
      seedReplayErrors: 0,
      streetProgressionErrors: 0,
      minRaiseErrors: 0,
      oddChipErrors: 0,
      itmCountErrors: 0,
      prizePoolErrors: 0,
      chipContinuityErrors: 0,
      duplicateActionSeqErrors: 0,
      winnerAmountErrors: 0,
      blindStructureErrors: 0,
      winRateAnomalies: 0,
      zeroResponseTimeErrors: 0,
      totalBugsFound: 0,
    };

    const handRepo = this.ds.getRepository(Hand);
    const seedRepo = this.ds.getRepository(HandSeed);

    // Iterate completed hands in pages
    let offset = 0;
    while (true) {
      // Use finished_at IS NOT NULL to catch all completed hands regardless of final stage.
      // The batch simulation path sets stage to the last betting street played (e.g. 'showdown'),
      // while the live game path uses 'complete'. Both are valid completed hands.
      //
      // Load hands first, then relations separately.  TypeORM's leftJoinAndSelect crashes on
      // hands with zero actions (LEFT JOIN produces all-NULL action rows, bigIntTransformer
      // then receives null for the NOT NULL `amount` column).
      const hands = await handRepo.find({
        where: { finished_at: Not(IsNull()) } as any,
        order: { created_at: "ASC" },
        skip: offset,
        take: batchSize,
      });
      if (hands.length > 0) {
        const handIds = hands.map((h) => h.id);
        const [allPlayers, allActions] = await Promise.all([
          this.ds.getRepository("HandPlayer").find({
            where: { hand_id: In(handIds) } as any,
          }),
          this.ds.getRepository("Action").find({
            where: { hand_id: In(handIds) } as any,
          }),
        ]);
        const playersByHand = groupBy(allPlayers as any[], "hand_id");
        const actionsByHand = groupBy(allActions as any[], "hand_id");
        for (const hand of hands) {
          (hand as any).players = playersByHand[hand.id] ?? [];
          (hand as any).actions = actionsByHand[hand.id] ?? [];
        }
      }

      if (hands.length === 0) break;

      // Pre-fetch hand seeds for this page (keyed by "gameId:handNumber")
      const seedKeys = hands.map((h) => ({
        game_id: h.game_id,
        hand_number: h.hand_number,
      }));

      const seedRows = await seedRepo
        .createQueryBuilder("hs")
        .where(
          seedKeys
            .map(
              (_, i) => `(hs.game_id = :gid${i} AND hs.hand_number = :hn${i})`,
            )
            .join(" OR "),
          Object.fromEntries(
            seedKeys.flatMap((k, i) => [
              [`gid${i}`, k.game_id],
              [`hn${i}`, k.hand_number],
            ]),
          ),
        )
        .getMany();

      const seedMap = new Map<string, HandSeed>();
      for (const s of seedRows) {
        seedMap.set(`${s.game_id}:${s.hand_number}`, s);
      }

      // Split into concurrent chunks
      const chunks = chunkArray(hands, concurrency);
      const allBugs: BugInsert[] = [];
      const failingHandIds = new Set<string>();
      const allHandIds = new Set<string>(hands.map((h) => h.id));

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map((hand) =>
            this.validateHand(
              hand,
              seedMap.get(`${hand.game_id}:${hand.hand_number}`),
            ),
          ),
        );

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === "fulfilled") {
            const bugs = result.value;
            if (bugs.length > 0) {
              allBugs.push(...bugs);
              failingHandIds.add(chunk[i].id);
              for (const bug of bugs) {
                incrementSummary(summary, bug.check_name);
              }
            }
          }
          // Rejected promises = unhandled errors; skip hand silently.
        }
      }

      // Persist: flag hands + insert bugs + mark all as audited
      await this.persistBugs(allBugs, failingHandIds, allHandIds);

      summary.audited += hands.length;
      offset += batchSize;

      if (hands.length < batchSize) break;
    }

    // Pod-level financial checks (run once)
    const podBugs = await this.auditPods();
    await this.persistBugs(podBugs, new Set(), new Set());
    for (const bug of podBugs) {
      incrementSummary(summary, bug.check_name);
    }

    // Cross-hand chip continuity (SQL-based, runs once across all data)
    const continuityBugs = await this.checkChipContinuity();
    await this.persistBugs(continuityBugs, new Set(), new Set());
    for (const bug of continuityBugs) {
      incrementSummary(summary, bug.check_name);
    }

    // Statistical anomaly checks (SQL-based, runs once across all data)
    const anomalyBugs = await this.auditAnomalies();
    await this.persistBugs(anomalyBugs, new Set(), new Set());
    for (const bug of anomalyBugs) {
      incrementSummary(summary, bug.check_name);
    }

    summary.totalBugsFound =
      summary.chipLeaks +
      summary.potMismatches +
      summary.sequenceErrors +
      summary.sidePotErrors +
      summary.showdownErrors +
      summary.duplicateCardErrors +
      summary.seedReplayErrors +
      summary.streetProgressionErrors +
      summary.minRaiseErrors +
      summary.oddChipErrors +
      summary.itmCountErrors +
      summary.prizePoolErrors +
      summary.chipContinuityErrors +
      summary.duplicateActionSeqErrors +
      summary.winnerAmountErrors +
      summary.blindStructureErrors +
      summary.winRateAnomalies +
      summary.zeroResponseTimeErrors;

    return summary;
  }

  // -------------------------------------------------------------------------
  // Per-hand validation — runs all 9 hand-level checks
  // -------------------------------------------------------------------------

  private async validateHand(
    hand: Hand,
    seed?: HandSeed,
  ): Promise<BugInsert[]> {
    const bugs: BugInsert[] = [];

    bugs.push(...this.checkNoDuplicateCards(hand));
    bugs.push(...this.checkZeroSum(hand));
    bugs.push(...this.checkPotMatching(hand));
    bugs.push(...this.checkActionSequence(hand));
    bugs.push(...this.checkStreetProgression(hand));
    bugs.push(...this.checkSidePotEligibility(hand));
    bugs.push(...this.checkOddChipRule(hand));
    bugs.push(...this.checkMinRaise(hand));
    bugs.push(...this.checkShowdownFairness(hand));
    bugs.push(...this.checkWinnerAmounts(hand));
    bugs.push(...this.checkDuplicateActionSeq(hand));
    bugs.push(...this.checkBlindStructure(hand));
    if (seed) bugs.push(...this.checkSeedReplay(hand, seed));

    return bugs;
  }

  // =========================================================================
  // CHECK 1 — No duplicate cards
  // =========================================================================

  private checkNoDuplicateCards(hand: Hand): BugInsert[] {
    const seen = new Map<string, string>(); // key → source
    const duplicates: string[] = [];

    const registerCard = (rank: string, suit: string, source: string) => {
      const key = `${rank}${suit}`;
      if (seen.has(key)) {
        duplicates.push(`${key} (${source} and ${seen.get(key)})`);
      } else {
        seen.set(key, source);
      }
    };

    for (const card of hand.community_cards) {
      registerCard(card.rank, card.suit, "community");
    }

    for (const hp of hand.players) {
      for (const card of hp.hole_cards ?? []) {
        registerCard(card.rank, card.suit, `hole:${hp.bot_id}`);
      }
    }

    if (duplicates.length === 0) return [];

    return [
      {
        hand_id: hand.id,
        check_name: "no_duplicate_cards",
        description: `Hand ${hand.id} contains ${duplicates.length} duplicate card(s)`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          duplicates,
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK 2 — Zero-sum / chip integrity (rake = 0)
  // =========================================================================

  private checkZeroSum(hand: Hand): BugInsert[] {
    const startTotal = hand.players.reduce(
      (sum, hp) => sum + hp.start_chips,
      0n,
    );
    const endTotal = hand.players.reduce(
      (sum, hp) => sum + (hp.end_chips ?? 0n),
      0n,
    );

    if (startTotal === endTotal) return [];

    const delta = endTotal - startTotal;
    return [
      {
        hand_id: hand.id,
        check_name: "zero_sum",
        description: `Chip conservation violated: delta = ${delta}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          start_total: startTotal,
          end_total: endTotal,
          delta,
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK 3 — Pot matching: sum(amount_bet) must equal hand.pot
  // =========================================================================

  private checkPotMatching(hand: Hand): BugInsert[] {
    // BatchTournamentPersistenceService doesn't populate amount_bet for simulation hands.
    // When all players have amount_bet=0, try to reconstruct from actions.
    // If reconstruction also gives 0 (e.g., blinds not stored as actions), skip — insufficient data.
    const allZero = hand.players.every((hp) => hp.amount_bet === 0n);

    let betTotal: bigint;
    if (allZero) {
      // BatchTournamentPersistenceService never populates amount_bet for simulation hands,
      // and blind posting actions are also not recorded. We cannot reconstruct the true bet
      // total without blind amounts, so skip this check to avoid false positives.
      return [];
    } else {
      betTotal = hand.players.reduce((sum, hp) => sum + hp.amount_bet, 0n);
    }

    if (betTotal === hand.pot) return [];

    const delta = betTotal - hand.pot;
    return [
      {
        hand_id: hand.id,
        check_name: "pot_matching",
        description: `sum(amount_bet)=${betTotal} ≠ hand.pot=${hand.pot}, delta=${delta}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          sum_amount_bet: betTotal,
          hand_pot: hand.pot,
          delta,
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK 4 — Action sequence: folded player must not act again
  // =========================================================================

  private checkActionSequence(hand: Hand): BugInsert[] {
    const bugs: BugInsert[] = [];
    const sorted = [...hand.actions].sort(
      (a, b) => a.action_seq - b.action_seq,
    );

    const foldedAt = new Map<string, number>(); // bot_id → action_seq of fold

    for (const action of sorted) {
      const prevFold = foldedAt.get(action.bot_id);
      if (prevFold !== undefined && action.action_seq > prevFold) {
        bugs.push({
          hand_id: hand.id,
          check_name: "action_sequence",
          description: `Bot ${action.bot_id} acted (seq ${action.action_seq}) after folding (seq ${prevFold})`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            bot_id: action.bot_id,
            folded_at_seq: prevFold,
            acted_at_seq: action.action_seq,
            action_type: action.action_type,
          }),
        });
      }

      if (action.action_type === "fold") {
        foldedAt.set(action.bot_id, action.action_seq);
      }
    }

    // Sub-check: all-in player must never have folded
    const allInBotIds = new Set(
      hand.players.filter((hp) => hp.all_in).map((hp) => hp.bot_id),
    );
    for (const [botId, foldSeq] of foldedAt.entries()) {
      if (allInBotIds.has(botId)) {
        bugs.push({
          hand_id: hand.id,
          check_name: "action_sequence",
          description: `Bot ${botId} is marked all_in in hand_players but has a fold action at seq ${foldSeq}`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            bot_id: botId,
            fold_seq: foldSeq,
            violation: "all_in_player_folded",
          }),
        });
      }
    }

    return bugs;
  }

  // =========================================================================
  // CHECK 5 — Street progression: stages must appear in order
  // =========================================================================

  private checkStreetProgression(hand: Hand): BugInsert[] {
    if (hand.actions.length === 0) return [];

    const stageOrder: Record<string, number> = {
      preflop: 0,
      flop: 1,
      turn: 2,
      river: 3,
    };

    // Build min/max seq per stage
    const stageBounds = new Map<string, { min: number; max: number }>();
    for (const action of hand.actions) {
      const stage = action.stage;
      const existing = stageBounds.get(stage);
      if (!existing) {
        stageBounds.set(stage, {
          min: action.action_seq,
          max: action.action_seq,
        });
      } else {
        existing.min = Math.min(existing.min, action.action_seq);
        existing.max = Math.max(existing.max, action.action_seq);
      }
    }

    // Verify ordering: max of earlier stage < min of later stage
    const orderedStages = [...stageBounds.entries()].sort(
      ([a], [b]) => (stageOrder[a] ?? 0) - (stageOrder[b] ?? 0),
    );

    const violations: string[] = [];
    for (let i = 0; i < orderedStages.length - 1; i++) {
      const [stageA, boundsA] = orderedStages[i];
      const [stageB, boundsB] = orderedStages[i + 1];
      if (boundsA.max >= boundsB.min) {
        violations.push(
          `${stageA} max seq ${boundsA.max} >= ${stageB} min seq ${boundsB.min}`,
        );
      }
    }

    if (violations.length === 0) return [];

    const bounds = Object.fromEntries(stageBounds.entries());
    return [
      {
        hand_id: hand.id,
        check_name: "street_progression",
        description: `Street ordering violated: ${violations.join("; ")}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          stage_bounds: bounds,
          violations,
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK 6 — Side-pot eligibility: all-in players can't over-win
  // =========================================================================

  private checkSidePotEligibility(hand: Hand): BugInsert[] {
    const bugs: BugInsert[] = [];
    const allInPlayers = hand.players.filter((hp) => hp.all_in);

    // BatchTournamentPersistenceService never populates amount_bet for simulation hands.
    // Without amount_bet we can't compute side-pot eligibility — skip to avoid false positives.
    const allZero = hand.players.every((hp) => hp.amount_bet === 0n);
    if (allZero) return [];

    const getAmountBet = (_botId: string, storedBet: bigint): bigint =>
      storedBet;

    for (const hp of allInPlayers) {
      if (hp.amount_won === null || hp.amount_won === 0n) continue;

      const X = getAmountBet(hp.bot_id, hp.amount_bet);
      if (X === 0n) continue; // can't determine eligibility without bet info

      // Max eligible = X * count(players whose amount_bet >= X)
      const contributors = hand.players.filter(
        (p) => getAmountBet(p.bot_id, p.amount_bet) >= X,
      );
      const maxEligible = X * BigInt(contributors.length);

      if (hp.amount_won > maxEligible) {
        bugs.push({
          hand_id: hand.id,
          check_name: "side_pot_eligibility",
          description: `All-in bot ${hp.bot_id} won ${hp.amount_won} but max eligible is ${maxEligible}`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            bot_id: hp.bot_id,
            amount_bet: X,
            amount_won: hp.amount_won,
            max_eligible: maxEligible,
            contributor_count: contributors.length,
            reconstructed_from_actions: allZero,
          }),
        });
      }
    }

    return bugs;
  }

  // =========================================================================
  // CHECK 7 — Odd chip rule: split-pot remainder goes to earliest position
  // =========================================================================

  private checkOddChipRule(hand: Hand): BugInsert[] {
    // Only applies to showdown splits (≥2 winners)
    const winners = hand.players.filter((hp) => hp.won);
    if (winners.length < 2) return [];
    // Skip hands that ended before showdown (e.g. everyone folded to one)
    if (hand.community_cards.length < 5) return [];

    const totalWon = winners.reduce(
      (sum, hp) => sum + (hp.amount_won ?? 0n),
      0n,
    );

    // First verify sum of winnings equals the pot
    if (totalWon !== hand.pot) {
      return [
        {
          hand_id: hand.id,
          check_name: "odd_chip_rule",
          description: `sum(winners' amount_won)=${totalWon} ≠ hand.pot=${hand.pot}`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            total_won: totalWon,
            hand_pot: hand.pot,
          }),
        },
      ];
    }

    const n = BigInt(winners.length);
    const baseShare = hand.pot / n;
    const remainder = hand.pot % n;

    if (remainder === 0n) return []; // No odd chip — nothing to check

    // Find dealer position by looking up dealer_bot_id in hand_players
    const dealerHp = hand.players.find(
      (hp) => hp.bot_id === hand.dealer_bot_id,
    );
    const dealerPosition = dealerHp?.position ?? 0;

    // Sort winners clockwise from dealer+1 (smallest position > dealer, wrapping around)
    const sortedWinners = [...winners].sort((a, b) => {
      const aDist = (a.position - dealerPosition - 1 + 10) % 10;
      const bDist = (b.position - dealerPosition - 1 + 10) % 10;
      return aDist - bDist;
    });

    // First `remainder` winners in clockwise order should get baseShare+1, rest get baseShare
    const expectedAmounts = new Map<string, bigint>();
    for (let i = 0; i < sortedWinners.length; i++) {
      expectedAmounts.set(
        sortedWinners[i].bot_id,
        i < Number(remainder) ? baseShare + 1n : baseShare,
      );
    }

    const violations: Array<{
      bot_id: string;
      expected: string;
      actual: string;
    }> = [];
    for (const hp of winners) {
      const expected = expectedAmounts.get(hp.bot_id) ?? baseShare;
      const actual = hp.amount_won ?? 0n;
      if (actual !== expected) {
        violations.push({
          bot_id: hp.bot_id,
          expected: expected.toString(),
          actual: actual.toString(),
        });
      }
    }

    if (violations.length === 0) return [];

    return [
      {
        hand_id: hand.id,
        check_name: "odd_chip_rule",
        description: `Odd chip(s) not awarded correctly: ${violations.length} winner(s) have wrong amount`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          dealer_bot_id: hand.dealer_bot_id,
          dealer_position: dealerPosition,
          remainder,
          violations,
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK 8 — Min-raise enforcement
  // =========================================================================

  private checkMinRaise(hand: Hand): BugInsert[] {
    const bugs: BugInsert[] = [];

    const sortedActions = [...hand.actions].sort(
      (a, b) => a.action_seq - b.action_seq,
    );

    const stages: Array<"preflop" | "flop" | "turn" | "river"> = [
      "preflop",
      "flop",
      "turn",
      "river",
    ];

    for (const stage of stages) {
      const stageActions = sortedActions.filter((a) => a.stage === stage);
      if (stageActions.length === 0) continue;

      // Initial lastRaiseDelta = big_blind; currentMaxBet starts at bigBlind preflop, 0 postflop
      let lastRaiseDelta = hand.big_blind;
      let currentMaxBet = stage === "preflop" ? hand.big_blind : 0n;

      for (const action of stageActions) {
        if (action.action_type === "big_blind") {
          // BB sets the initial bar; lastRaiseDelta = BB amount
          if (action.amount > currentMaxBet) {
            currentMaxBet = action.amount;
            lastRaiseDelta = action.amount;
          }
          continue;
        }

        if (action.action_type === "raise" || action.action_type === "bet") {
          const raiseBy = action.amount; // stored as raise delta
          // Skip all-in (chips_after === 0) — permitted to raise less
          if (action.chips_after !== null && action.chips_after === 0n) {
            // Still update the max bet / delta if this is a legal full raise
            if (raiseBy >= lastRaiseDelta) {
              lastRaiseDelta = raiseBy;
            }
            currentMaxBet += raiseBy;
            continue;
          }

          if (raiseBy < lastRaiseDelta) {
            bugs.push({
              hand_id: hand.id,
              check_name: "min_raise",
              description: `Bot ${action.bot_id} raised by ${raiseBy} below minimum ${lastRaiseDelta} at seq ${action.action_seq}`,
              details: serializeDetails({
                snapshot: buildHandSnapshot(hand),
                action_seq: action.action_seq,
                bot_id: action.bot_id,
                stage,
                raise_by: raiseBy,
                min_required: lastRaiseDelta,
                current_max_bet: currentMaxBet,
              }),
            });
          }

          // Update tracking
          lastRaiseDelta = raiseBy;
          currentMaxBet += raiseBy;
        }
      }
    }

    return bugs;
  }

  // =========================================================================
  // CHECK 9 — Showdown fairness: re-evaluate winner with HandEvaluator
  // =========================================================================

  private checkShowdownFairness(hand: Hand): BugInsert[] {
    // Only check hands that went to showdown with cards visible
    const showdownPlayers = hand.players.filter(
      (hp) => hp.saw_showdown && hp.hole_cards && hp.hole_cards.length === 2,
    );

    if (showdownPlayers.length < 2 || hand.community_cards.length < 3)
      return [];

    // Convert cards to handEvaluator format
    const evalPlayers = showdownPlayers.map((hp) => ({
      id: hp.bot_id,
      holeCards: hp.hole_cards.map((c) => ({
        value: RANK_VALUES[c.rank] ?? 0,
        suit: c.suit,
      })),
    }));

    const communityCards = hand.community_cards.map((c) => ({
      value: RANK_VALUES[c.rank] ?? 0,
      suit: c.suit,
    }));

    let computedWinners: string[];
    try {
      const result = determineWinners(evalPlayers, communityCards);
      computedWinners = result.winners.map((w) => w.playerId);
    } catch {
      // HandEvaluator failure — skip this hand rather than false-positive
      return [];
    }

    const recordedWinners = hand.players
      .filter((hp) => hp.won && hp.saw_showdown)
      .map((hp) => hp.bot_id);

    const computedSet = new Set(computedWinners);
    const recordedSet = new Set(recordedWinners);

    const mismatch =
      computedWinners.some((id) => !recordedSet.has(id)) ||
      recordedWinners.some((id) => !computedSet.has(id));

    if (!mismatch) return [];

    return [
      {
        hand_id: hand.id,
        check_name: "showdown_fairness",
        description: `Winner mismatch: computed=${computedWinners.join(",")} recorded=${recordedWinners.join(",")}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          computed_winners: computedWinners,
          recorded_winners: recordedWinners,
          community_cards: hand.community_cards,
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK 10 — Seed replay (provably fair verification)
  // =========================================================================

  private checkSeedReplay(hand: Hand, seed: HandSeed): BugInsert[] {
    // 1. Verify SHA256(server_seed) === server_seed_hash
    const calculatedHash = crypto
      .createHash("sha256")
      .update(seed.server_seed)
      .digest("hex");

    if (calculatedHash !== seed.server_seed_hash) {
      return [
        {
          hand_id: hand.id,
          check_name: "seed_replay",
          description: `Server seed hash mismatch: stored hash does not match SHA256(server_seed)`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            stored_hash: seed.server_seed_hash,
            computed_hash: calculatedHash,
          }),
        },
      ];
    }

    // 2. Recompute combined_hash and deck_order; compare with stored values
    const computedCombined = combineSeedsHmac(
      seed.server_seed,
      seed.client_seed,
      hand.hand_number,
    );
    const computedOrder = generateDeckOrder(computedCombined);
    const storedOrder = seed.deck_order;

    const mismatchAt = computedOrder.findIndex((v, i) => v !== storedOrder[i]);

    if (mismatchAt === -1) return []; // all good

    return [
      {
        hand_id: hand.id,
        check_name: "seed_replay",
        description: `Deck order mismatch at index ${mismatchAt}: computed ${computedOrder[mismatchAt]} vs stored ${storedOrder[mismatchAt]}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          mismatch_at_index: mismatchAt,
          computed_value: computedOrder[mismatchAt],
          stored_value: storedOrder[mismatchAt],
          // Only include first 10 entries to keep the JSON small
          computed_deck_order_preview: computedOrder.slice(0, 10),
          stored_deck_order_preview: storedOrder.slice(0, 10),
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK — Winner amount consistency
  // =========================================================================

  private checkWinnerAmounts(hand: Hand): BugInsert[] {
    const bugs: BugInsert[] = [];

    // 1. sum(amount_won for winners) must equal hand.pot
    const winnersTotal = hand.players
      .filter((hp) => hp.won)
      .reduce((sum, hp) => sum + (hp.amount_won ?? 0n), 0n);

    if (winnersTotal !== hand.pot && hand.players.some((hp) => hp.won)) {
      bugs.push({
        hand_id: hand.id,
        check_name: "winner_amounts",
        description: `sum(winners' amount_won)=${winnersTotal} ≠ hand.pot=${hand.pot}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          winners_total: winnersTotal,
          hand_pot: hand.pot,
          delta: winnersTotal - hand.pot,
        }),
      });
    }

    // 2. won=true players must have amount_won > 0; won=false must have amount_won = 0
    for (const hp of hand.players) {
      if (hp.won && (hp.amount_won === null || hp.amount_won === 0n)) {
        bugs.push({
          hand_id: hand.id,
          check_name: "winner_amounts",
          description: `Bot ${hp.bot_id} marked won=true but amount_won=${hp.amount_won}`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            bot_id: hp.bot_id,
            won: hp.won,
            amount_won: hp.amount_won,
          }),
        });
      }
      if (!hp.won && hp.amount_won !== null && hp.amount_won > 0n) {
        bugs.push({
          hand_id: hand.id,
          check_name: "winner_amounts",
          description: `Bot ${hp.bot_id} marked won=false but amount_won=${hp.amount_won}`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            bot_id: hp.bot_id,
            won: hp.won,
            amount_won: hp.amount_won,
          }),
        });
      }
    }

    return bugs;
  }

  // =========================================================================
  // CHECK — Duplicate action_seq within a hand
  // =========================================================================

  private checkDuplicateActionSeq(hand: Hand): BugInsert[] {
    if (hand.actions.length === 0) return [];

    const seqCount = new Map<number, number>();
    for (const a of hand.actions) {
      seqCount.set(a.action_seq, (seqCount.get(a.action_seq) ?? 0) + 1);
    }

    const dupes = [...seqCount.entries()].filter(([, count]) => count > 1);
    if (dupes.length === 0) return [];

    return [
      {
        hand_id: hand.id,
        check_name: "duplicate_action_seq",
        description: `Hand has ${dupes.length} duplicate action_seq value(s): ${dupes.map(([seq, n]) => `seq ${seq} appears ${n}x`).join(", ")}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          duplicates: dupes.map(([seq, count]) => ({ seq, count })),
        }),
      },
    ];
  }

  // =========================================================================
  // CHECK — Blind structure: SB + BB posted first, correct amounts
  // =========================================================================

  private checkBlindStructure(hand: Hand): BugInsert[] {
    if (hand.actions.length === 0) return [];

    const blindTypes = new Set(["blind", "small_blind", "big_blind"]);
    const blindActions = hand.actions.filter((a) =>
      blindTypes.has(a.action_type),
    );

    if (blindActions.length === 0) return []; // no blind actions recorded — skip

    const sortedBlinds = [...blindActions].sort(
      (a, b) => a.action_seq - b.action_seq,
    );
    const sortedNonBlinds = hand.actions
      .filter((a) => !blindTypes.has(a.action_type) && a.action_type !== "ante")
      .sort((a, b) => a.action_seq - b.action_seq);

    const bugs: BugInsert[] = [];

    // Blinds must precede all non-blind actions
    const firstNonBlindSeq = sortedNonBlinds[0]?.action_seq ?? Infinity;
    const lastBlindSeq =
      sortedBlinds[sortedBlinds.length - 1]?.action_seq ?? -1;
    if (lastBlindSeq > firstNonBlindSeq) {
      bugs.push({
        hand_id: hand.id,
        check_name: "blind_structure",
        description: `Blind posted after non-blind action: last blind seq=${lastBlindSeq}, first non-blind seq=${firstNonBlindSeq}`,
        details: serializeDetails({
          snapshot: buildHandSnapshot(hand),
          last_blind_seq: lastBlindSeq,
          first_non_blind_seq: firstNonBlindSeq,
        }),
      });
    }

    // Two-player games (heads-up) may have only 1 or 2 blind actions; 3+ player must have both SB and BB
    if (hand.players.length >= 3) {
      const amounts = sortedBlinds.map((a) => BigInt(a.amount ?? 0));
      if (amounts.length < 2) {
        bugs.push({
          hand_id: hand.id,
          check_name: "blind_structure",
          description: `Expected 2 blind actions (SB+BB) for ${hand.players.length}-player hand, found ${amounts.length}`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            blind_actions: sortedBlinds.map((a) => ({
              seq: a.action_seq,
              amount: a.amount?.toString(),
              bot_id: a.bot_id,
            })),
          }),
        });
      } else {
        // Smallest blind = SB; largest = BB; BB should be 2× SB
        const minBlind = amounts.reduce((a, b) => (a < b ? a : b));
        const maxBlind = amounts.reduce((a, b) => (a > b ? a : b));
        if (maxBlind !== minBlind * 2n && minBlind > 0n) {
          bugs.push({
            hand_id: hand.id,
            check_name: "blind_structure",
            description: `BB (${maxBlind}) is not 2× SB (${minBlind})`,
            details: serializeDetails({
              snapshot: buildHandSnapshot(hand),
              small_blind: minBlind,
              big_blind: maxBlind,
            }),
          });
        }
      }

      // Same bot can't post both SB and BB in a 3+ player game
      const blindBotIds = sortedBlinds.map((a) => a.bot_id);
      if (
        new Set(blindBotIds).size < blindBotIds.length &&
        hand.players.length >= 3
      ) {
        bugs.push({
          hand_id: hand.id,
          check_name: "blind_structure",
          description: `Same bot posted multiple blinds in a ${hand.players.length}-player hand`,
          details: serializeDetails({
            snapshot: buildHandSnapshot(hand),
            blind_bot_ids: blindBotIds,
          }),
        });
      }
    }

    return bugs;
  }

  // =========================================================================
  // Cross-hand chip continuity (SQL-based, runs once after page sweep)
  // =========================================================================

  private async checkChipContinuity(): Promise<BugInsert[]> {
    const rows = await this.ds.query<
      Array<{
        hand_id_n: string;
        hand_id_n1: string;
        bot_id: string;
        end_chips: string;
        start_chips: string;
        game_id: string;
      }>
    >(`
      SELECT
        hp1.hand_id  AS hand_id_n,
        hp2.hand_id  AS hand_id_n1,
        hp1.bot_id,
        hp1.end_chips::text   AS end_chips,
        hp2.start_chips::text AS start_chips,
        h1.game_id
      FROM hand_players hp1
      JOIN hand_players hp2 ON hp1.bot_id = hp2.bot_id
      JOIN hands h1 ON h1.id = hp1.hand_id
      JOIN hands h2 ON h2.id = hp2.hand_id
      WHERE h1.game_id = h2.game_id
        AND h2.hand_number = h1.hand_number + 1
        AND h1.finished_at IS NOT NULL
        AND h2.finished_at IS NOT NULL
        AND hp1.end_chips IS NOT NULL
        AND hp2.start_chips IS NOT NULL
        AND hp1.end_chips != hp2.start_chips
      LIMIT 500
    `);

    return rows.map((row) => ({
      hand_id: row.hand_id_n1,
      check_name: "chip_continuity",
      description: `Bot ${row.bot_id} in game ${row.game_id}: end_chips of hand ${row.hand_id_n} (${row.end_chips}) ≠ start_chips of hand ${row.hand_id_n1} (${row.start_chips})`,
      details: serializeDetails({
        game_id: row.game_id,
        bot_id: row.bot_id,
        hand_id_n: row.hand_id_n,
        hand_id_n1: row.hand_id_n1,
        end_chips_n: row.end_chips,
        start_chips_n1: row.start_chips,
        delta: (BigInt(row.start_chips) - BigInt(row.end_chips)).toString(),
      }),
    }));
  }

  // =========================================================================
  // Statistical anomaly checks (SQL-based, runs once)
  // =========================================================================

  private async auditAnomalies(): Promise<BugInsert[]> {
    const bugs: BugInsert[] = [];

    // CHECK F — Win rate anomaly: bot wins >85% of hands in a game (min 5 hands)
    const winRateRows = await this.ds.query<
      Array<{
        game_id: string;
        bot_id: string;
        wins: string;
        total_hands: string;
        win_pct: string;
      }>
    >(`
      SELECT
        h.game_id,
        hp.bot_id,
        COUNT(*) FILTER (WHERE hp.won = true)::text   AS wins,
        COUNT(*)::text                                 AS total_hands,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE hp.won = true)
          / NULLIF(COUNT(*), 0)
        )::text                                        AS win_pct
      FROM hand_players hp
      JOIN hands h ON h.id = hp.hand_id
      WHERE h.finished_at IS NOT NULL
      GROUP BY h.game_id, hp.bot_id
      HAVING COUNT(*) >= 5
         AND (COUNT(*) FILTER (WHERE hp.won = true))::float / COUNT(*) > 0.85
    `);

    for (const row of winRateRows) {
      bugs.push({
        hand_id: null,
        check_name: "win_rate_anomaly",
        description: `Bot ${row.bot_id} in game ${row.game_id} won ${row.win_pct}% of ${row.total_hands} hands (>${85}% threshold)`,
        details: serializeDetails({
          game_id: row.game_id,
          bot_id: row.bot_id,
          wins: parseInt(row.wins, 10),
          total_hands: parseInt(row.total_hands, 10),
          win_pct: parseFloat(row.win_pct),
          threshold_pct: 85,
        }),
      });
    }

    // CHECK G — Zero response time on non-blind decisions (suspicious bot behavior)
    const hasResponseTime = await this.ds.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'actions'
            AND column_name  = 'response_time_ms'
       ) AS exists`,
    );

    if (hasResponseTime[0]?.exists) {
      const zeroRtRows = await this.ds.query<
        Array<{
          hand_id: string;
          bot_id: string;
          action_seq: string;
          action_type: string;
        }>
      >(`
        SELECT a.hand_id, a.bot_id, a.action_seq::text AS action_seq, a.action_type
        FROM actions a
        JOIN hands h ON h.id = a.hand_id
        WHERE h.finished_at IS NOT NULL
          AND a.response_time_ms IS NOT NULL
          AND a.response_time_ms = 0
          AND a.action_type NOT IN ('blind', 'small_blind', 'big_blind', 'ante')
        ORDER BY a.hand_id, a.action_seq
        LIMIT 200
      `);

      for (const row of zeroRtRows) {
        bugs.push({
          hand_id: row.hand_id,
          check_name: "zero_response_time",
          description: `Bot ${row.bot_id} responded in 0ms on ${row.action_type} action (seq ${row.action_seq}) — possible bypass`,
          details: serializeDetails({
            hand_id: row.hand_id,
            bot_id: row.bot_id,
            action_seq: row.action_seq,
            action_type: row.action_type,
          }),
        });
      }
    }

    return bugs;
  }

  // =========================================================================
  // Pod-level financial checks
  // =========================================================================

  private async auditPods(): Promise<BugInsert[]> {
    const bugs: BugInsert[] = [];

    // tournament_pods table may not exist if the matchmaking migration hasn't been run
    const tableExists = await this.ds.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'tournament_pods'
       ) AS exists`,
    );
    if (!tableExists[0]?.exists) return bugs;

    const pods = await this.ds.getRepository(TournamentPod).find({
      where: { status: "finished" },
    });

    if (pods.length === 0) return bugs;

    for (const pod of pods) {
      bugs.push(...(await this.checkITMCount(pod)));
      bugs.push(...(await this.checkPrizePoolMatch(pod)));
    }

    return bugs;
  }

  // CHECK 11 — ITM count (In The Money)
  private async checkITMCount(pod: TournamentPod): Promise<BugInsert[]> {
    const expectedITM = Math.max(
      1,
      Math.floor(pod.player_count * 0.15), // mirrors MATCHMAKING_CONFIG.ITM_PERCENTAGE
    );

    const [{ count }] = await this.ds.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
         FROM tournament_entries
        WHERE tournament_id = $1
          AND payout > 0`,
      [pod.master_tournament_id],
    );

    const actualITM = parseInt(count, 10);
    if (actualITM === expectedITM) return [];

    return [
      {
        hand_id: null,
        check_name: "itm_count",
        description: `Pod ${pod.id} (#${pod.pod_number}): expected ${expectedITM} ITM players, found ${actualITM}`,
        details: serializeDetails({
          pod_id: pod.id,
          pod_number: pod.pod_number,
          player_count: pod.player_count,
          expected_itm: expectedITM,
          actual_itm: actualITM,
        }),
      },
    ];
  }

  // CHECK 12 — Prize pool match: transaction payouts must equal pod.prize_pool
  private async checkPrizePoolMatch(pod: TournamentPod): Promise<BugInsert[]> {
    const [{ total }] = await this.ds.query<Array<{ total: string | null }>>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
         FROM transactions
        WHERE type = 'payout'
          AND reference_id = $1`,
      [pod.id],
    );

    const txTotal = BigInt(total ?? "0");
    const prizePool = pod.prize_pool;

    if (txTotal === prizePool) return [];

    const delta = txTotal - prizePool;
    return [
      {
        hand_id: null,
        check_name: "prize_pool_match",
        description: `Pod ${pod.id}: payout transactions sum ${txTotal} ≠ prize_pool ${prizePool}, delta=${delta}`,
        details: serializeDetails({
          pod_id: pod.id,
          pod_number: pod.pod_number,
          prize_pool: prizePool,
          transactions_total: txTotal,
          delta,
        }),
      },
    ];
  }

  // =========================================================================
  // Persistence helpers
  // =========================================================================

  private async persistBugs(
    bugs: BugInsert[],
    failingHandIds: Set<string>,
    allHandIds: Set<string>,
  ): Promise<void> {
    await this.ds.transaction(async (manager) => {
      // Flag hands with errors
      if (failingHandIds.size > 0) {
        await manager
          .getRepository(Hand)
          .update({ id: In([...failingHandIds]) }, { validation_error: true });
      }

      // Mark all processed hands as audited (regardless of pass/fail)
      if (allHandIds.size > 0) {
        const ids = [...allHandIds];
        for (let i = 0; i < ids.length; i += 5000) {
          await manager
            .getRepository(Hand)
            .update({ id: In(ids.slice(i, i + 5000)) }, { is_audited: true });
        }
      }

      // Insert logic_bugs (skip duplicates based on hand_id + check_name + description)
      if (bugs.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(LogicBug)
          .values(
            bugs.map((b) => ({
              hand_id: b.hand_id,
              check_name: b.check_name,
              description: b.description,
              details: b.details,
              detected_at: new Date(),
            })),
          )
          .orIgnore()
          .execute();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBy<T extends Record<string, any>>(
  arr: T[],
  key: string,
): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = item[key] as string;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function buildHandSnapshot(hand: Hand): Record<string, unknown> {
  return {
    hand_id: hand.id,
    game_id: hand.game_id,
    hand_number: hand.hand_number,
    stage: hand.stage,
    pot: hand.pot?.toString(),
    community_cards: hand.community_cards,
    players: hand.players.map((hp) => ({
      bot_id: hp.bot_id,
      position: hp.position,
      start_chips: hp.start_chips?.toString(),
      end_chips: hp.end_chips?.toString(),
      amount_bet: hp.amount_bet?.toString(),
      amount_won: hp.amount_won?.toString(),
      folded: hp.folded,
      all_in: hp.all_in,
      won: hp.won,
    })),
    actions: hand.actions
      .sort((a, b) => a.action_seq - b.action_seq)
      .map((a) => ({
        seq: a.action_seq,
        bot_id: a.bot_id,
        type: a.action_type,
        stage: a.stage,
        amount: a.amount?.toString(),
        chips_after: a.chips_after?.toString(),
      })),
  };
}

function incrementSummary(summary: AuditSummary, checkName: string): void {
  const map: Record<string, keyof AuditSummary> = {
    zero_sum: "chipLeaks",
    pot_matching: "potMismatches",
    action_sequence: "sequenceErrors",
    side_pot_eligibility: "sidePotErrors",
    showdown_fairness: "showdownErrors",
    no_duplicate_cards: "duplicateCardErrors",
    seed_replay: "seedReplayErrors",
    street_progression: "streetProgressionErrors",
    min_raise: "minRaiseErrors",
    odd_chip_rule: "oddChipErrors",
    itm_count: "itmCountErrors",
    prize_pool_match: "prizePoolErrors",
    chip_continuity: "chipContinuityErrors",
    duplicate_action_seq: "duplicateActionSeqErrors",
    winner_amounts: "winnerAmountErrors",
    blind_structure: "blindStructureErrors",
    win_rate_anomaly: "winRateAnomalies",
    zero_response_time: "zeroResponseTimeErrors",
  };
  const key = map[checkName];
  if (key) (summary[key] as number)++;
}
