import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { Simulation, SimulationStatus } from "../entities/simulation.entity";
import { SimulationResult } from "../entities/simulation-result.entity";
import { BaseRepository } from "./base.repository";
import type { HeatmapData } from "../entities/simulation-result.entity";

@Injectable()
export class SimulationRepository extends BaseRepository<Simulation> {
  protected get entityName(): string {
    return "Simulation";
  }

  constructor(
    @InjectRepository(Simulation)
    protected readonly repository: Repository<Simulation>,
    @InjectRepository(SimulationResult)
    private readonly resultRepo: Repository<SimulationResult>,
  ) {
    super();
  }

  async countActiveForUser(userId: string): Promise<number> {
    return this.repository.count({
      where: [
        { user_id: userId, status: "PENDING" },
        { user_id: userId, status: "RUNNING" },
      ],
    });
  }

  async findByUserId(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<[Simulation[], number]> {
    return this.repository.findAndCount({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      take: limit,
      skip: offset,
    });
  }

  async updateStatus(
    id: string,
    status: SimulationStatus,
    extra: Partial<Pick<Simulation, "progress_hands" | "completed_at">> = {},
    manager?: EntityManager,
  ): Promise<void> {
    await this.getRepo(manager).update(id, { status, ...extra });
  }

  async updateProgress(id: string, progressHands: number): Promise<void> {
    await this.repository.update(id, { progress_hands: progressHands });
  }

  async saveResult(data: {
    simulationId: string;
    totalProfit: bigint;
    bbPer100: number;
    winRate: number;
    vpip: number;
    pfr: number;
    aggressionFactor: number;
    heatmapData: HeatmapData;
    equityRealization: number;
    profitCurve: number[];
  }): Promise<SimulationResult> {
    const result = this.resultRepo.create({
      simulation_id: data.simulationId,
      total_profit: data.totalProfit,
      bb_per_100: data.bbPer100,
      win_rate: data.winRate,
      vpip: data.vpip,
      pfr: data.pfr,
      aggression_factor: data.aggressionFactor,
      heatmap_data: data.heatmapData,
      equity_realization: data.equityRealization,
      profit_curve: data.profitCurve,
    });
    return this.resultRepo.save(result);
  }

  async findResult(simulationId: string): Promise<SimulationResult | null> {
    return this.resultRepo.findOne({ where: { simulation_id: simulationId } });
  }

  async deleteById(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, user_id: userId });
    return (result.affected ?? 0) > 0;
  }
}
