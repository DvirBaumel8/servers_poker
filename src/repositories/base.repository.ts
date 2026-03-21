import {
  Repository,
  EntityManager,
  FindOptionsWhere,
  FindManyOptions,
  DeepPartial,
  DataSource,
} from "typeorm";
import { Injectable, NotFoundException } from "@nestjs/common";

/**
 * Abstract base repository providing common CRUD operations.
 * All entity repositories should extend this class.
 */
@Injectable()
export abstract class BaseRepository<T extends { id: string }> {
  protected abstract readonly repository: Repository<T>;

  /**
   * The entity name for error messages (override in subclasses).
   */
  protected get entityName(): string {
    return "Entity";
  }

  /**
   * Get the repository instance, optionally using a transaction manager.
   * Use this to eliminate repeated `manager ? manager.getRepository : this.repository` patterns.
   */
  protected getRepo(manager?: EntityManager): Repository<T> {
    return manager
      ? manager.getRepository<T>(this.repository.target)
      : this.repository;
  }

  async findById(id: string, manager?: EntityManager): Promise<T | null> {
    return this.getRepo(manager).findOne({
      where: { id } as FindOptionsWhere<T>,
    });
  }

  /**
   * Find by ID or throw NotFoundException.
   * Use this to reduce null-check boilerplate in services.
   */
  async findByIdOrThrow(id: string, manager?: EntityManager): Promise<T> {
    const entity = await this.findById(id, manager);
    if (!entity) {
      throw new NotFoundException(`${this.entityName} ${id} not found`);
    }
    return entity;
  }

  async findAll(manager?: EntityManager): Promise<T[]> {
    return this.getRepo(manager).find();
  }

  async findAndCount(
    options: FindManyOptions<T>,
    manager?: EntityManager,
  ): Promise<[T[], number]> {
    return this.getRepo(manager).findAndCount(options);
  }

  async create(data: DeepPartial<T>, manager?: EntityManager): Promise<T> {
    const repo = this.getRepo(manager);
    const entity = repo.create(data);
    return repo.save(entity);
  }

  async update(
    id: string,
    data: DeepPartial<T>,
    manager?: EntityManager,
  ): Promise<T | null> {
    await this.getRepo(manager).update(id, data as any);
    return this.findById(id, manager);
  }

  async delete(id: string, manager?: EntityManager): Promise<boolean> {
    const result = await this.getRepo(manager).delete(id);
    return (result.affected ?? 0) > 0;
  }

  async transaction<R>(
    dataSource: DataSource,
    operation: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    return dataSource.transaction(async (manager) => {
      return operation(manager);
    });
  }
}
