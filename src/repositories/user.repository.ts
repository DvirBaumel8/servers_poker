import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository, EntityManager } from "typeorm";
import { User } from "../entities/user.entity";
import { BaseRepository } from "./base.repository";
import * as crypto from "crypto";

@Injectable()
export class UserRepository extends BaseRepository<User> {
  private readonly apiKeyHashSecret: string;
  private static readonly API_KEY_HASH_ITERATIONS = 210000;

  constructor(
    @InjectRepository(User)
    protected readonly repository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    super();
    this.apiKeyHashSecret = this.configService.get<string>(
      "API_KEY_HMAC_SECRET",
      crypto.randomBytes(32).toString("hex"),
    );
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

  /**
   * Hash API keys deterministically so they can be looked up by value
   * without storing the raw key in the database.
   */
  hashApiKey(rawKey: string): string {
    return crypto
      .pbkdf2Sync(
        rawKey,
        this.apiKeyHashSecret,
        UserRepository.API_KEY_HASH_ITERATIONS,
        32,
        "sha256",
      )
      .toString("hex");
  }

  generateApiKey(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString("hex");
    const hash = this.hashApiKey(raw);
    return { raw, hash };
  }
}
