import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager, In, Not } from "typeorm";
import {
  GameStateSnapshot,
  SnapshotStatus,
} from "../entities/game-state-snapshot.entity";

@Injectable()
export class GameStateRepository {
  private readonly logger = new Logger(GameStateRepository.name);

  constructor(
    @InjectRepository(GameStateSnapshot)
    private readonly repository: Repository<GameStateSnapshot>,
  ) {}

  async saveSnapshot(
    snapshot: Partial<GameStateSnapshot>,
    manager?: EntityManager,
  ): Promise<GameStateSnapshot> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    const existing = await repo.findOne({
      where: { game_id: snapshot.game_id, status: "active" },
    });

    if (existing) {
      await repo.update(existing.id, {
        ...snapshot,
        updated_at: new Date(),
      });
      return { ...existing, ...snapshot } as GameStateSnapshot;
    }

    const entity = repo.create(snapshot);
    return repo.save(entity);
  }

  async getActiveSnapshot(
    gameId: string,
    manager?: EntityManager,
  ): Promise<GameStateSnapshot | null> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    return repo.findOne({
      where: { game_id: gameId, status: "active" },
    });
  }

  async getActiveSnapshotByTable(
    tableId: string,
    manager?: EntityManager,
  ): Promise<GameStateSnapshot | null> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    return repo.findOne({
      where: { table_id: tableId, status: "active" },
    });
  }

  async getAllActiveSnapshots(
    manager?: EntityManager,
  ): Promise<GameStateSnapshot[]> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    return repo.find({
      where: { status: "active" },
      order: { updated_at: "DESC" },
    });
  }

  async getOrphanedSnapshots(
    serverInstanceId: string,
    manager?: EntityManager,
  ): Promise<GameStateSnapshot[]> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    return repo.find({
      where: {
        status: "active",
        server_instance_id: Not(serverInstanceId),
      },
    });
  }

  async markAsRecovered(
    snapshotId: string,
    newServerInstanceId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    await repo.update(snapshotId, {
      status: "recovered" as SnapshotStatus,
      server_instance_id: newServerInstanceId,
    });
  }

  async markAsCompleted(
    gameId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    await repo.update(
      { game_id: gameId, status: In(["active", "recovered"]) },
      { status: "completed" as SnapshotStatus },
    );
  }

  async markAsOrphaned(
    snapshotId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    await repo.update(snapshotId, {
      status: "orphaned" as SnapshotStatus,
    });
  }

  async deleteOldSnapshots(
    olderThanDays: number = 7,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await repo
      .createQueryBuilder()
      .delete()
      .where("status IN (:...statuses)", {
        statuses: ["completed", "orphaned"],
      })
      .andWhere("updated_at < :cutoff", { cutoff: cutoffDate })
      .execute();

    return result.affected || 0;
  }

  async getSnapshotsByTournament(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<GameStateSnapshot[]> {
    const repo = manager
      ? manager.getRepository(GameStateSnapshot)
      : this.repository;

    return repo.find({
      where: { tournament_id: tournamentId, status: "active" },
    });
  }
}
