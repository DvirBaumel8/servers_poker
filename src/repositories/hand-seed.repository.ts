import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { HandSeed } from "../entities/hand-seed.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class HandSeedRepository extends BaseRepository<HandSeed> {
  constructor(
    @InjectRepository(HandSeed)
    protected readonly repository: Repository<HandSeed>,
  ) {
    super();
  }

  async findByGameAndHand(
    gameId: string,
    handNumber: number,
    manager?: EntityManager,
  ): Promise<HandSeed | null> {
    const repo = manager ? manager.getRepository(HandSeed) : this.repository;
    return repo.findOne({
      where: { game_id: gameId, hand_number: handNumber },
    });
  }

  async findByGame(
    gameId: string,
    manager?: EntityManager,
  ): Promise<HandSeed[]> {
    const repo = manager ? manager.getRepository(HandSeed) : this.repository;
    return repo.find({
      where: { game_id: gameId },
      order: { hand_number: "ASC" },
    });
  }

  async createHandSeed(
    data: {
      game_id: string;
      hand_number: number;
      server_seed: string;
      server_seed_hash: string;
      client_seed: string;
      combined_hash: string;
      deck_order: number[];
    },
    manager?: EntityManager,
  ): Promise<HandSeed> {
    const repo = manager ? manager.getRepository(HandSeed) : this.repository;
    const handSeed = repo.create({
      ...data,
      revealed: false,
    });
    return repo.save(handSeed);
  }

  async revealSeed(
    gameId: string,
    handNumber: number,
    manager?: EntityManager,
  ): Promise<HandSeed | null> {
    const repo = manager ? manager.getRepository(HandSeed) : this.repository;
    const seed = await repo.findOne({
      where: { game_id: gameId, hand_number: handNumber },
    });
    if (!seed) return null;

    seed.revealed = true;
    seed.revealed_at = new Date();
    return repo.save(seed);
  }

  async getRevealedSeeds(
    gameId: string,
    manager?: EntityManager,
  ): Promise<HandSeed[]> {
    const repo = manager ? manager.getRepository(HandSeed) : this.repository;
    return repo.find({
      where: { game_id: gameId, revealed: true },
      order: { hand_number: "ASC" },
    });
  }
}
