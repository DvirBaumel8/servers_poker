import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { UpdateUserDto, AdminUpdateUserDto } from "./dto/user.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { ApiKeyRotationService } from "../../common/security";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly apiKeyRotationService: ApiKeyRotationService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: User) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    return this.usersService.findAll();
  }

  @Get(":id")
  async findOne(@Param("id") id: string, @CurrentUser() user: User) {
    if (user.id !== id && user.role !== "admin") {
      throw new ForbiddenException("Access denied");
    }
    const result = await this.usersService.findById(id);
    if (!result) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return result;
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    if (user.id !== id && user.role !== "admin") {
      throw new ForbiddenException("Access denied");
    }
    return this.usersService.update(id, dto);
  }

  @Put(":id/admin")
  async adminUpdate(
    @Param("id") id: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() user: User,
  ) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    return this.usersService.adminUpdate(id, dto);
  }

  @Delete(":id")
  async deactivate(@Param("id") id: string, @CurrentUser() user: User) {
    if (user.id !== id && user.role !== "admin") {
      throw new ForbiddenException("Access denied");
    }
    await this.usersService.deactivate(id);
    return { success: true };
  }

  @Post(":id/rotate-api-key")
  async rotateApiKey(@Param("id") id: string, @CurrentUser() user: User) {
    if (user.id !== id && user.role !== "admin") {
      throw new ForbiddenException("Access denied");
    }

    const result = await this.apiKeyRotationService.rotateApiKey(id);

    return {
      message: "API key rotated successfully",
      newApiKey: result.newApiKey,
      oldApiKeyValidUntil: result.oldApiKeyValidUntil.toISOString(),
      rotatedAt: result.rotatedAt.toISOString(),
      warning:
        "Save this API key securely. It will not be shown again. Your old key remains valid until the specified time.",
    };
  }

  @Get(":id/api-key-status")
  async getApiKeyStatus(@Param("id") id: string, @CurrentUser() user: User) {
    if (user.id !== id && user.role !== "admin") {
      throw new ForbiddenException("Access denied");
    }

    const status = await this.apiKeyRotationService.getRotationStatus(id);

    return {
      hasLegacyKeys: status.hasLegacyKeys,
      legacyKeyExpiresAt: status.legacyKeyExpiresAt?.toISOString(),
    };
  }

  @Post(":id/revoke-api-keys")
  async revokeApiKeys(@Param("id") id: string, @CurrentUser() user: User) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }

    await this.apiKeyRotationService.revokeAllKeys(id);

    return {
      message: "All API keys revoked for user",
      warning:
        "User will need to generate a new API key to continue using the API",
    };
  }
}
