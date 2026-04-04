import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager, DeepPartial } from "typeorm";
import { BaseRepository } from "./base.repository";
import { TournamentPod } from "../entities/tournament-pod.entity";

@Injectable()
export class TournamentPodRepository extends BaseRepository<TournamentPod> {
  protected get entityName(): string {
    return "TournamentPod";
  }

  constructor(
    @InjectRepository(TournamentPod)
    protected readonly repository: Repository<TournamentPod>,
  ) {
    super();
  }

  async findByMasterTournamentId(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentPod[]> {
    return this.getRepo(manager).find({
      where: { master_tournament_id: tournamentId },
      order: { pod_number: "ASC" },
    });
  }

  async findPendingByTournamentId(
    tournamentId: string,
    manager?: EntityManager,
  ): Promise<TournamentPod[]> {
    return this.getRepo(manager).find({
      where: { master_tournament_id: tournamentId, status: "pending" },
      order: { pod_number: "ASC" },
    });
  }

  /**
   * Bulk insert pods — single INSERT statement for all pods.
   */
  async bulkCreate(
    pods: DeepPartial<TournamentPod>[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getRepo(manager);
    await repo.insert(pods as TournamentPod[]);
  }
}
