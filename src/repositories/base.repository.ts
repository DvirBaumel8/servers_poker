import {
  Repository,
  EntityManager,
  FindOptionsWhere,
  DeepPartial,
  DataSource,
} from "typeorm";
import { Injectable } from "@nestjs/common";

@Injectable()
export abstract class BaseRepository<T extends { id: string }> {
  protected abstract readonly repository: Repository<T>;

  async findById(id: string, manager?: EntityManager): Promise<T | null> {
    const repo = manager
      ? manager.getRepository<T>(this.repository.target)
      : this.repository;
    return repo.findOne({ where: { id } as FindOptionsWhere<T> });
  }

  async findAll(manager?: EntityManager): Promise<T[]> {
    const repo = manager
      ? manager.getRepository<T>(this.repository.target)
      : this.repository;
    return repo.find();
  }

  async create(data: DeepPartial<T>, manager?: EntityManager): Promise<T> {
    const repo = manager
      ? manager.getRepository<T>(this.repository.target)
      : this.repository;
    const entity = repo.create(data);
    return repo.save(entity);
  }

  async update(
    id: string,
    data: DeepPartial<T>,
    manager?: EntityManager,
  ): Promise<T | null> {
    const repo = manager
      ? manager.getRepository<T>(this.repository.target)
      : this.repository;
    await repo.update(id, data as any);
    return this.findById(id, manager);
  }

  async delete(id: string, manager?: EntityManager): Promise<boolean> {
    const repo = manager
      ? manager.getRepository<T>(this.repository.target)
      : this.repository;
    const result = await repo.delete(id);
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
