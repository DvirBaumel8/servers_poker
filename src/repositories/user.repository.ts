import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { User } from "../entities/user.entity";
import { BaseRepository } from "./base.repository";
import * as crypto from "crypto";

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    protected readonly repository: Repository<User>,
  ) {
    super();
  }

  async findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const repo = manager ? manager.getRepository(User) : this.repository;
    return repo.findOne({ where: { email } });
  }

  async findByApiKeyHash(
    apiKeyHash: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const repo = manager ? manager.getRepository(User) : this.repository;
    return repo.findOne({ where: { api_key_hash: apiKeyHash, active: true } });
  }

  async findByApiKey(
    rawKey: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const hash = this.hashApiKey(rawKey);
    return this.findByApiKeyHash(hash, manager);
  }

  hashApiKey(rawKey: string): string {
    return crypto.createHash("sha256").update(rawKey).digest("hex");
  }

  generateApiKey(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString("hex");
    const hash = this.hashApiKey(raw);
    return { raw, hash };
  }
}
