import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { User } from "../entities/user.entity";
import { BaseRepository } from "./base.repository";

@Injectable()
export class UserRepository extends BaseRepository<User> {
  protected get entityName(): string {
    return "User";
  }

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
    return this.getRepo(manager).findOne({ where: { email } });
  }

  async findByName(
    name: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    return this.getRepo(manager).findOne({ where: { name } });
  }

  async findByRefreshTokenHash(hash: string): Promise<User | null> {
    return this.repository.findOne({ where: { refresh_token_hash: hash } });
  }
}
