import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { BotsService } from "./bots.service";
import { BotActivityService } from "../../services/bot/bot-activity.service";
import { CreateBotDto, UpdateBotDto } from "./dto/bot.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ScopesGuard } from "../../common/guards/scopes.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireScopes } from "../../common/decorators/scopes.decorator";
import { User } from "../../entities/user.entity";

@Controller("bots")
@UseGuards(JwtAuthGuard, ScopesGuard)
export class BotsController {
  constructor(
    private readonly botsService: BotsService,
    private readonly botActivityService: BotActivityService,
  ) {}

  @Get()
  @RequireScopes("spectate:tables")
  async findAll() {
    return this.botsService.findActive();
  }

  @Get("my")
  @RequireScopes("operate:bots")
  async findMy(@CurrentUser() user: User) {
    return this.botsService.findByUserId(user.id);
  }

  @Get("my/activity")
  @RequireScopes("operate:bots")
  async getMyBotsActivity(@CurrentUser() user: User) {
    const activities = await this.botActivityService.getActiveBotsForUser(
      user.id,
    );
    return {
      bots: activities,
      totalActive: activities.filter((a) => a.isActive).length,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("active")
  @RequireScopes("spectate:tables")
  async getActiveBots() {
    const activities = await this.botActivityService.getAllActiveBots();
    return {
      bots: activities,
      totalActive: activities.length,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(":id")
  @RequireScopes("spectate:tables")
  async findOne(@Param("id") id: string) {
    const bot = await this.botsService.findById(id);
    if (!bot) {
      throw new NotFoundException(`Bot ${id} not found`);
    }
    return bot;
  }

  @Get(":id/profile")
  @RequireScopes("spectate:tables")
  async getProfile(@Param("id") id: string) {
    return this.botsService.getProfile(id);
  }

  @Get(":id/activity")
  @RequireScopes("spectate:tables")
  async getBotActivity(@Param("id") id: string) {
    const activity = await this.botActivityService.getBotActivity(id);
    if (!activity) {
      throw new NotFoundException(`Bot ${id} not found`);
    }
    return activity;
  }

  @Post()
  @RequireScopes("operate:bots")
  async create(@Body() dto: CreateBotDto, @CurrentUser() user: User) {
    return this.botsService.create(user.id, dto);
  }

  @Put(":id")
  @RequireScopes("operate:bots")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateBotDto,
    @CurrentUser() user: User,
  ) {
    return this.botsService.update(id, user.id, dto);
  }

  @Post(":id/validate")
  @RequireScopes("operate:bots")
  async validate(@Param("id") id: string) {
    return this.botsService.validate(id);
  }

  @Post(":id/activate")
  @RequireScopes("operate:bots")
  async activate(@Param("id") id: string, @CurrentUser() user: User) {
    await this.botsService.activate(id, user.id, user.role === "admin");
    return { success: true };
  }

  @Delete(":id")
  @RequireScopes("operate:bots")
  async deactivate(@Param("id") id: string, @CurrentUser() user: User) {
    await this.botsService.deactivate(id, user.id, user.role === "admin");
    return { success: true };
  }
}
