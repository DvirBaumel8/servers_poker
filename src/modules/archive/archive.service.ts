import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { DataSource, In } from "typeorm";
import { gzipSync, gunzipSync } from "zlib";

import { LockService } from "../../common/redis/lock.service";
import { Tournament } from "../../entities/tournament.entity";
import { Hand } from "../../entities/hand.entity";
import { HandPlayer } from "../../entities/hand-player.entity";
import { Action } from "../../entities/action.entity";
import { LogicBug } from "../../entities/logic-bug.entity";
import { CloudStorageService } from "./cloud-storage.service";
import { ARCHIVE_CONFIG } from "./archive.config";
import {
  TournamentArchive,
  ArchivedHand,
  ArchivedHandPlayer,
  ArchivedAction,
  ArchivedLogicBug,
  ArchivedHandResponseDto,
  ArchivedHandListResponseDto,
} from "./dto/archived-hand.dto";

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);
  private readonly retentionDays: number;
  private readonly deleteBatchSize: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly cloudStorage: CloudStorageService,
    private readonly lockService: LockService,
    private readonly configService: ConfigService,
  ) {
    this.retentionDays = this.configService.get<number>(
      "ARCHIVE_RETENTION_DAYS",
      ARCHIVE_CONFIG.DEFAULT_RETENTION_DAYS,
    );
    this.deleteBatchSize = this.configService.get<number>(
      "ARCHIVE_DELETE_BATCH_SIZE",
      ARCHIVE_CONFIG.DEFAULT_DELETE_BATCH_SIZE,
    );
  }

  // ---------------------------------------------------------------------------
  // Cron
  // ---------------------------------------------------------------------------

  @Cron(ARCHIVE_CONFIG.CRON_SCHEDULE, {
    name: "archive-old-tournaments",
    timeZone: "UTC",
  })
  async runArchiveCron(): Promise<void> {
    await this.lockService.withLock(
      { key: ARCHIVE_CONFIG.LOCK_KEY, ttlMs: ARCHIVE_CONFIG.LOCK_TTL_MS },
      () => this.archiveEligibleTournaments(),
    );
  }

  // ---------------------------------------------------------------------------
  // Eligibility
  // ---------------------------------------------------------------------------

  async archiveEligibleTournaments(): Promise<number> {
    const eligibleIds = await this.findEligibleTournamentIds();
    if (eligibleIds.length === 0) {
      this.logger.log("No tournaments eligible for archiving");
      return 0;
    }

    this.logger.log(
      `Found ${eligibleIds.length} tournament(s) eligible for archiving`,
    );

    let archived = 0;
    for (const id of eligibleIds) {
      try {
        await this.archiveSingleTournament(id);
        archived++;
      } catch (err) {
        this.logger.error(
          `Failed to archive tournament ${id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(`Archived ${archived}/${eligibleIds.length} tournament(s)`);
    return archived;
  }

  private async findEligibleTournamentIds(): Promise<string[]> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT t.id
       FROM tournaments t
       WHERE t.status = 'finished'
         AND t.is_archived = FALSE
         AND t.finished_at < NOW() - INTERVAL '${this.retentionDays} days'
         AND NOT EXISTS (
           SELECT 1 FROM hands h
           WHERE h.tournament_id = t.id
             AND (h.is_audited = FALSE OR h.validation_error = TRUE)
         )
         AND EXISTS (
           SELECT 1 FROM hands h2 WHERE h2.tournament_id = t.id
         )
       ORDER BY t.finished_at ASC
       LIMIT $1`,
      [ARCHIVE_CONFIG.MAX_TOURNAMENTS_PER_RUN],
    );

    return rows.map((r) => r.id);
  }

  // ---------------------------------------------------------------------------
  // Single tournament pipeline
  // ---------------------------------------------------------------------------

  async archiveSingleTournament(tournamentId: string): Promise<void> {
    const tournament = await this.dataSource
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });

    // Phase 1: Serialize
    const compressed = await this.serializeTournamentData(tournamentId);

    // Phase 2: Upload to S3
    const key = this.buildArchiveKey(tournament);
    const alreadyExists = await this.cloudStorage.exists(key);
    if (!alreadyExists) {
      const etag = await this.cloudStorage.upload(
        key,
        compressed,
        "application/json",
      );
      this.logger.log(
        `Uploaded archive for ${tournamentId} (ETag: ${etag}, ${compressed.length} bytes)`,
      );
    } else {
      this.logger.warn(`Archive already exists at ${key}, skipping upload`);
    }

    // Phase 3: Mark archived
    await this.dataSource.getRepository(Tournament).update(tournamentId, {
      is_archived: true,
      archive_url: key,
    });

    // Phase 4: Prune detailed records
    const deleted = await this.pruneHandsInChunks(tournamentId);
    this.logger.log(
      `Archived tournament ${tournamentId}: ${deleted} hands pruned`,
    );
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  private async serializeTournamentData(tournamentId: string): Promise<Buffer> {
    const archive: TournamentArchive = {
      version: 1,
      tournament_id: tournamentId,
      archived_at: new Date().toISOString(),
      hand_count: 0,
      hands: [],
    };

    const handRepo = this.dataSource.getRepository(Hand);
    const pageSize = ARCHIVE_CONFIG.SERIALIZATION_PAGE_SIZE;
    let offset = 0;

    while (true) {
      const hands = await handRepo.find({
        where: { tournament_id: tournamentId },
        order: { hand_number: "ASC" },
        skip: offset,
        take: pageSize,
      });

      if (hands.length === 0) break;

      const handIds = hands.map((h) => h.id);

      const [players, actions, logicBugs] = await Promise.all([
        this.dataSource
          .getRepository(HandPlayer)
          .find({ where: { hand_id: In(handIds) } as any }),
        this.dataSource
          .getRepository(Action)
          .find({ where: { hand_id: In(handIds) } as any }),
        this.dataSource
          .getRepository(LogicBug)
          .find({ where: { hand_id: In(handIds) } as any }),
      ]);

      const playersByHand = groupBy(players, "hand_id");
      const actionsByHand = groupBy(actions, "hand_id");
      const bugsByHand = groupBy(logicBugs, "hand_id");

      for (const hand of hands) {
        archive.hands.push({
          ...serializeHand(hand),
          players: (playersByHand[hand.id] ?? []).map(serializeHandPlayer),
          actions: (actionsByHand[hand.id] ?? []).map(serializeAction),
          logic_bugs: (bugsByHand[hand.id] ?? []).map(serializeLogicBug),
        });
      }

      offset += pageSize;
      if (hands.length < pageSize) break;
    }

    archive.hand_count = archive.hands.length;

    const json = JSON.stringify(archive, bigintReplacer);
    return gzipSync(Buffer.from(json));
  }

  private buildArchiveKey(tournament: Tournament): string {
    const d = tournament.finished_at!;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `archive/tournaments/${yyyy}/${mm}/${dd}/${tournament.id}.json.gz`;
  }

  // ---------------------------------------------------------------------------
  // Pruning
  // ---------------------------------------------------------------------------

  private async pruneHandsInChunks(tournamentId: string): Promise<number> {
    const handRepo = this.dataSource.getRepository(Hand);
    let totalDeleted = 0;

    while (true) {
      const rows: Array<{ h_id: string }> = await handRepo
        .createQueryBuilder("h")
        .select("h.id", "h_id")
        .where("h.tournament_id = :tid", { tid: tournamentId })
        .limit(this.deleteBatchSize)
        .getRawMany();

      if (rows.length === 0) break;

      await handRepo.delete(rows.map((r) => r.h_id));
      totalDeleted += rows.length;

      this.logger.debug(
        `Pruned ${rows.length} hands for tournament ${tournamentId} (total: ${totalDeleted})`,
      );
    }

    return totalDeleted;
  }

  // ---------------------------------------------------------------------------
  // Retrieval / Hydration
  // ---------------------------------------------------------------------------

  async getArchivedHand(
    tournamentId: string,
    handId: string,
  ): Promise<ArchivedHandResponseDto> {
    // Check DB first
    const dbHand = await this.dataSource.getRepository(Hand).findOne({
      where: { id: handId, tournament_id: tournamentId },
      relations: ["players", "actions"],
    });

    if (dbHand) {
      const hand = serializeHand(dbHand);
      return {
        ...hand,
        players: ((dbHand as any).players ?? []).map(serializeHandPlayer),
        actions: ((dbHand as any).actions ?? []).map(serializeAction),
      };
    }

    // Fallback to S3
    const tournament = await this.dataSource
      .getRepository(Tournament)
      .findOneBy({ id: tournamentId });

    if (!tournament?.archive_url) {
      throw new NotFoundException(`Hand ${handId} not found`);
    }

    const archive = await this.downloadAndParse(tournament.archive_url);
    const archivedHand = archive.hands.find((h) => h.id === handId);

    if (!archivedHand) {
      throw new NotFoundException(`Hand ${handId} not found in archive`);
    }

    return {
      id: archivedHand.id,
      game_id: archivedHand.game_id,
      hand_number: archivedHand.hand_number,
      dealer_bot_id: archivedHand.dealer_bot_id,
      small_blind: archivedHand.small_blind,
      big_blind: archivedHand.big_blind,
      ante: archivedHand.ante,
      community_cards: archivedHand.community_cards,
      pot: archivedHand.pot,
      stage: archivedHand.stage,
      started_at: archivedHand.started_at,
      finished_at: archivedHand.finished_at,
      players: archivedHand.players,
      actions: archivedHand.actions,
    };
  }

  async listArchivedHands(
    tournamentId: string,
    page = 1,
    limit = 50,
  ): Promise<ArchivedHandListResponseDto> {
    // Check if hands still in DB
    const handRepo = this.dataSource.getRepository(Hand);
    const [dbHands, count] = await handRepo.findAndCount({
      where: { tournament_id: tournamentId },
      order: { hand_number: "ASC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (count > 0) {
      return {
        tournament_id: tournamentId,
        hand_count: count,
        hands: dbHands.map((h) => ({
          id: h.id,
          hand_number: h.hand_number,
          pot: String(h.pot),
          stage: h.stage,
          started_at: h.started_at?.toISOString() ?? null,
          finished_at: h.finished_at?.toISOString() ?? null,
        })),
      };
    }

    // Fallback to S3
    const tournament = await this.dataSource
      .getRepository(Tournament)
      .findOneBy({ id: tournamentId });

    if (!tournament?.archive_url) {
      return { tournament_id: tournamentId, hand_count: 0, hands: [] };
    }

    const archive = await this.downloadAndParse(tournament.archive_url);
    const start = (page - 1) * limit;
    const slice = archive.hands.slice(start, start + limit);

    return {
      tournament_id: tournamentId,
      hand_count: archive.hand_count,
      hands: slice.map((h) => ({
        id: h.id,
        hand_number: h.hand_number,
        pot: h.pot,
        stage: h.stage,
        started_at: h.started_at,
        finished_at: h.finished_at,
      })),
    };
  }

  private async downloadAndParse(
    archiveUrl: string,
  ): Promise<TournamentArchive> {
    const compressed = await this.cloudStorage.download(archiveUrl);
    const json = gunzipSync(compressed).toString("utf8");
    return JSON.parse(json) as TournamentArchive;
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function serializeHand(
  hand: Hand,
): Omit<ArchivedHand, "players" | "actions" | "logic_bugs"> {
  return {
    id: hand.id,
    game_id: hand.game_id,
    hand_number: hand.hand_number,
    dealer_bot_id: hand.dealer_bot_id ?? null,
    small_blind: String(hand.small_blind),
    big_blind: String(hand.big_blind),
    ante: String(hand.ante),
    community_cards: hand.community_cards,
    pot: String(hand.pot),
    stage: hand.stage,
    started_at: hand.started_at?.toISOString() ?? null,
    finished_at: hand.finished_at?.toISOString() ?? null,
    validation_error: hand.validation_error,
    is_audited: hand.is_audited,
  };
}

function serializeHandPlayer(hp: HandPlayer): ArchivedHandPlayer {
  return {
    id: hp.id,
    hand_id: (hp as any).hand_id,
    bot_id: (hp as any).bot_id,
    position: hp.position,
    hole_cards: hp.hole_cards,
    start_chips: String(hp.start_chips),
    end_chips: hp.end_chips != null ? String(hp.end_chips) : null,
    amount_bet: String(hp.amount_bet),
    amount_won: hp.amount_won != null ? String(hp.amount_won) : null,
    folded: hp.folded,
    all_in: hp.all_in,
    won: hp.won,
    saw_flop: hp.saw_flop,
    saw_showdown: hp.saw_showdown,
    card_status: hp.card_status,
    best_hand: hp.best_hand,
  };
}

function serializeAction(action: Action): ArchivedAction {
  return {
    id: action.id,
    hand_id: (action as any).hand_id,
    bot_id: (action as any).bot_id,
    action_seq: action.action_seq,
    action_type: action.action_type,
    stage: action.stage,
    amount: String(action.amount),
    pot_after:
      action.pot_after != null
        ? String(action.pot_after)
        : (action.pot_after ?? null),
    chips_after:
      action.chips_after != null
        ? String(action.chips_after)
        : (action.chips_after ?? null),
    response_time_ms: action.response_time_ms ?? null,
  };
}

function serializeLogicBug(bug: LogicBug): ArchivedLogicBug {
  return {
    id: bug.id,
    hand_id: bug.hand_id ?? null,
    check_name: bug.check_name,
    description: bug.description,
    details: bug.details,
    detected_at: bug.detected_at.toISOString(),
  };
}

function groupBy<T extends Record<string, any>>(
  arr: T[],
  key: string,
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    const k = item[key];
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}
