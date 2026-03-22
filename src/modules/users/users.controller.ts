import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { UpdateUserDto, AdminUpdateUserDto } from "./dto/user.dto";
import { PaginationDto } from "../../common/dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  SelfOrAdminGuard,
  RequireSelfOrAdmin,
} from "../../common/guards/self-or-admin.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiKeyRotationService } from "../../common/security";
import { assertFound } from "../../common/utils";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard, SelfOrAdminGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly apiKeyRotationService: ApiKeyRotationService,
  ) {}

  @Get()
  @Roles("admin")
  async findAll(@Query() pagination: PaginationDto) {
    return this.usersService.findAllPaginated(
      pagination.limit ?? 20,
      pagination.offset ?? 0,
    );
  }

  @Get(":id")
  @RequireSelfOrAdmin("id")
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    const result = await this.usersService.findById(id);
    assertFound(result, "User", id);
    return result;
  }

  @Put(":id")
  @RequireSelfOrAdmin("id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Put(":id/admin")
  @Roles("admin")
  async adminUpdate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.usersService.adminUpdate(id, dto);
  }

  @Delete(":id")
  @RequireSelfOrAdmin("id")
  async deactivate(@Param("id", ParseUUIDPipe) id: string) {
    await this.usersService.deactivate(id);
    return { success: true };
  }

  @Post(":id/rotate-api-key")
  @RequireSelfOrAdmin("id")
  async rotateApiKey(@Param("id", ParseUUIDPipe) id: string) {
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
  @RequireSelfOrAdmin("id")
  async getApiKeyStatus(@Param("id", ParseUUIDPipe) id: string) {
    const status = await this.apiKeyRotationService.getRotationStatus(id);

    return {
      hasLegacyKeys: status.hasLegacyKeys,
      legacyKeyExpiresAt: status.legacyKeyExpiresAt?.toISOString(),
    };
  }

  @Post(":id/revoke-api-keys")
  @Roles("admin")
  async revokeApiKeys(@Param("id", ParseUUIDPipe) id: string) {
    await this.apiKeyRotationService.revokeAllKeys(id);

    return {
      message: "All API keys revoked for user",
      warning:
        "User will need to generate a new API key to continue using the API",
    };
  }
}
