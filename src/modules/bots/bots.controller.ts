import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { BotsService } from "./bots.service";
import { BotActivityService } from "../../services/bot/bot-activity.service";
import { CreateBotDto, UpdateBotDto } from "./dto/bot.dto";
import { PaginationDto } from "../../common/dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ScopesGuard } from "../../common/guards/scopes.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireScopes } from "../../common/decorators/scopes.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { User } from "../../entities/user.entity";
import { assertFound } from "../../common/utils";

@Controller("bots")
@UseGuards(JwtAuthGuard, ScopesGuard)
export class BotsController {
  constructor(
    private readonly botsService: BotsService,
    private readonly botActivityService: BotActivityService,
  ) {}

  @Public()
  @Get()
  async findAll(@Query() pagination: PaginationDto) {
    return this.botsService.findActivePaginated(
      pagination.limit ?? 20,
      pagination.offset ?? 0,
    );
  }

  @Get("my")
  @RequireScopes("operate:bots")
  async findMy(@CurrentUser() user: User, @Query() pagination: PaginationDto) {
    return this.botsService.findByUserIdPaginated(
      user.id,
      pagination.limit ?? 20,
      pagination.offset ?? 0,
    );
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

  @Public()
  @Get("active")
  async getActiveBots() {
    const activities = await this.botActivityService.getAllActiveBots();
    return {
      bots: activities,
      totalActive: activities.length,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    const bot = await this.botsService.findById(id);
    assertFound(bot, "Bot", id);
    return bot;
  }

  @Public()
  @Get(":id/profile")
  async getProfile(@Param("id", ParseUUIDPipe) id: string) {
    return this.botsService.getProfile(id);
  }

  @Public()
  @Get(":id/activity")
  async getBotActivity(@Param("id", ParseUUIDPipe) id: string) {
    const activity = await this.botActivityService.getBotActivity(id);
    assertFound(activity, "Bot", id);
    return activity;
  }

  @Post()
  @RequireScopes("operate:bots")
  @Throttle({ default: { ttl: 3600000, limit: 10 } }) // 10 bots per hour
  async create(@Body() dto: CreateBotDto, @CurrentUser() user: User) {
    return this.botsService.create(user.id, dto);
  }

  @Put(":id")
  @RequireScopes("operate:bots")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBotDto,
    @CurrentUser() user: User,
  ) {
    return this.botsService.update(id, user.id, dto);
  }

  @Post(":id/validate")
  @RequireScopes("operate:bots")
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 validations per minute (makes external HTTP calls)
  async validate(@Param("id", ParseUUIDPipe) id: string) {
    return this.botsService.validate(id);
  }

  @Post(":id/activate")
  @RequireScopes("operate:bots")
  async activate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.botsService.activate(id, user.id, user.role === "admin");
    return { success: true };
  }

  @Delete(":id")
  @RequireScopes("operate:bots")
  async deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.botsService.deactivate(id, user.id, user.role === "admin");
    return { success: true };
  }
}
