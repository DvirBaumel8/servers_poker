import {
  Controller,
  Get,
  Put,
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

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
