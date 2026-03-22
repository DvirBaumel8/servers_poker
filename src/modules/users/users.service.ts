import { Injectable } from "@nestjs/common";
import { UserRepository } from "../../repositories/user.repository";
import { User } from "../../entities/user.entity";
import {
  UpdateUserDto,
  AdminUpdateUserDto,
  UserResponseDto,
} from "./dto/user.dto";
import { PaginatedResponse } from "../../common/dto";
import { assertFound, toPaginatedResponse } from "../../common/utils";

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(id: string): Promise<UserResponseDto | null> {
    const user = await this.userRepository.findById(id);
    if (!user) return null;
    return this.toResponseDto(user);
  }

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.userRepository.findAll();
    return users.map((u) => this.toResponseDto(u));
  }

  async findAllPaginated(
    limit: number,
    offset: number,
  ): Promise<PaginatedResponse<UserResponseDto>> {
    const [users, total] = await this.userRepository.findAndCount({
      take: limit,
      skip: offset,
      order: { created_at: "DESC" },
    });
    return toPaginatedResponse(users, total, limit, offset, (u) =>
      this.toResponseDto(u),
    );
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.userRepository.update(id, dto);
    assertFound(user, "User", id);
    return this.toResponseDto(user);
  }

  async adminUpdate(
    id: string,
    dto: AdminUpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.update(id, dto);
    assertFound(user, "User", id);
    return this.toResponseDto(user);
  }

  async deactivate(id: string): Promise<void> {
    await this.userRepository.update(id, { active: false });
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
    };
  }
}
