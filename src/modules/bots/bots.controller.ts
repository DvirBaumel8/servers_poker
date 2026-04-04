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
  Logger,
} from "@nestjs/common";
import { BotsService } from "./bots.service";
import { BotActivityService } from "../../services/bot/bot-activity.service";
import { UpdateBotDto } from "./dto/internal-bot.dto";
import { ScenarioDto } from "./dto/scenario.dto";
import { PaginationDto } from "../../common/dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { User } from "../../entities/user.entity";
import { assertFound } from "../../common/utils";

@Controller("bots")
@UseGuards(JwtAuthGuard)
export class BotsController {
  private readonly logger = new Logger(BotsController.name);

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
  async findMy(@CurrentUser() user: User, @Query() pagination: PaginationDto) {
    return this.botsService.findByUserIdPaginated(
      user.id,
      pagination.limit ?? 20,
      pagination.offset ?? 0,
    );
  }

  @Get("my/activity")
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

  @Post(":id/scenario")
  async evaluateScenario(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: ScenarioDto,
  ) {
    return this.botsService.evaluateScenario(id, user.id, dto);
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBotDto,
    @CurrentUser() user: User,
  ) {
    return this.botsService.update(id, user.id, dto);
  }

  @Post(":id/activate")
  async activate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.botsService.activate(id, user.id, user.role === "admin");
    return { success: true };
  }

  @Post(":id/duplicate")
  async duplicate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.botsService.duplicate(id, user.id);
  }

  @Delete(":id")
  async deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.botsService.deactivate(id, user.id, user.role === "admin");
    return { success: true };
  }
}
