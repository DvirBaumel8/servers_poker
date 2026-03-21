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
import { BotActivityService } from "../../services/bot-activity.service";
import { CreateBotDto, UpdateBotDto } from "./dto/bot.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { Public } from "../../common/decorators/public.decorator";

@Controller("bots")
export class BotsController {
  constructor(
    private readonly botsService: BotsService,
    private readonly botActivityService: BotActivityService,
  ) {}

  @Public()
  @Get()
  async findAll() {
    return this.botsService.findActive();
  }

  @UseGuards(JwtAuthGuard)
  @Get("my")
  async findMy(@CurrentUser() user: User) {
    return this.botsService.findByUserId(user.id);
  }

  @UseGuards(JwtAuthGuard)
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
  async findOne(@Param("id") id: string) {
    const bot = await this.botsService.findById(id);
    if (!bot) {
      throw new NotFoundException(`Bot ${id} not found`);
    }
    return bot;
  }

  @Public()
  @Get(":id/profile")
  async getProfile(@Param("id") id: string) {
    return this.botsService.getProfile(id);
  }

  @Public()
  @Get(":id/activity")
  async getBotActivity(@Param("id") id: string) {
    const activity = await this.botActivityService.getBotActivity(id);
    if (!activity) {
      throw new NotFoundException(`Bot ${id} not found`);
    }
    return activity;
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateBotDto, @CurrentUser() user: User) {
    return this.botsService.create(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateBotDto,
    @CurrentUser() user: User,
  ) {
    return this.botsService.update(id, user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/validate")
  async validate(@Param("id") id: string) {
    return this.botsService.validate(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/activate")
  async activate(@Param("id") id: string, @CurrentUser() user: User) {
    await this.botsService.activate(id, user.id, user.role === "admin");
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  async deactivate(@Param("id") id: string, @CurrentUser() user: User) {
    await this.botsService.deactivate(id, user.id, user.role === "admin");
    return { success: true };
  }
}
