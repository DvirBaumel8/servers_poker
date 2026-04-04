import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Logger,
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
import { assertFound } from "../../common/utils";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard, SelfOrAdminGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

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
}
