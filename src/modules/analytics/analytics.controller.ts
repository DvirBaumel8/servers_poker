import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Logger,
} from "@nestjs/common";
import { Request } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHash } from "crypto";
import { PlatformAnalyticsService } from "../../services/platform-analytics.service";
import { DailySummaryService } from "../../services/daily-summary.service";
import { AnalyticsEvent } from "../../entities/analytics-event.entity";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  RecordEventDto,
  PlatformStatsDto,
  AdminStatsDto,
  MetricsHistoryQueryDto,
} from "./dto/analytics.dto";

interface AuthenticatedUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

@Controller("analytics")
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analyticsService: PlatformAnalyticsService,
    private readonly dailySummaryService: DailySummaryService,
    @InjectRepository(AnalyticsEvent)
    private readonly eventRepository: Repository<AnalyticsEvent>,
  ) {}

  @Public()
  @Get("platform/stats")
  async getPlatformStats(): Promise<PlatformStatsDto> {
    return this.analyticsService.getPlatformStats();
  }

  @Roles("admin")
  @Get("admin/stats")
  async getAdminStats(
    @Query() query: MetricsHistoryQueryDto,
  ): Promise<AdminStatsDto> {
    const days = parseInt(query.days || "30", 10);

    const [stats, topPerformers, metricsHistory] = await Promise.all([
      this.analyticsService.getPlatformStats(),
      this.analyticsService.getTopPerformers(10),
      this.analyticsService.getMetricsHistory(days),
    ]);

    return {
      ...stats,
      topPerformers,
      metricsHistory: metricsHistory.map((m) => ({
        date: m.date.toISOString().split("T")[0],
        hands_dealt: m.hands_dealt,
        games_played: m.games_played,
        active_users: m.active_users,
        active_bots: m.active_bots,
      })),
    };
  }

  @Roles("admin")
  @Post("admin/trigger-summary")
  async triggerDailySummary(): Promise<{ success: boolean; message: string }> {
    const success = await this.dailySummaryService.triggerManualSummary();
    return {
      success,
      message: success
        ? "Daily summary sent successfully"
        : "Failed to send daily summary",
    };
  }

  @Roles("admin")
  @Post("admin/save-metrics")
  async saveMetricsSnapshot(): Promise<{ success: boolean; message: string }> {
    try {
      await this.analyticsService.saveDailyMetrics();
      return {
        success: true,
        message: "Metrics snapshot saved successfully",
      };
    } catch (error) {
      this.logger.error("Failed to save metrics snapshot:", error);
      return {
        success: false,
        message: "Failed to save metrics snapshot",
      };
    }
  }

  @Public()
  @Post("events")
  async recordEvent(
    @Body() dto: RecordEventDto,
    @Req() req: Request,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<{ success: boolean }> {
    try {
      const ipHash = this.hashIp(this.getClientIp(req));
      const userAgent = req.headers["user-agent"]?.substring(0, 500) || null;

      const event = this.eventRepository.create({
        user_id: user?.id || null,
        event_type: dto.event_type as AnalyticsEvent["event_type"],
        event_data: dto.event_data || {},
        session_id: dto.session_id,
        ip_hash: ipHash,
        user_agent: userAgent,
        page_url: dto.page_url || null,
        referrer: dto.referrer || null,
      });

      await this.eventRepository.save(event);

      return { success: true };
    } catch (error) {
      this.logger.error("Failed to record analytics event:", error);
      return { success: false };
    }
  }

  @Roles("admin")
  @Get("events/summary")
  async getEventsSummary(
    @Query() query: MetricsHistoryQueryDto,
  ): Promise<Record<string, number>> {
    const days = parseInt(query.days || "7", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await this.eventRepository
      .createQueryBuilder("event")
      .select("event.event_type", "event_type")
      .addSelect("COUNT(*)", "count")
      .where("event.created_at >= :since", { since })
      .groupBy("event.event_type")
      .getRawMany();

    const summary: Record<string, number> = {};
    for (const row of result) {
      summary[row.event_type] = parseInt(row.count, 10);
    }

    return summary;
  }

  @Roles("admin")
  @Get("metrics/history")
  async getMetricsHistory(@Query() query: MetricsHistoryQueryDto) {
    const days = parseInt(query.days || "30", 10);
    return this.analyticsService.getMetricsHistory(days);
  }

  private getClientIp(req: Request): string {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string") {
      return forwardedFor.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress || "unknown";
  }

  private hashIp(ip: string): string {
    return createHash("sha256").update(ip).digest("hex").substring(0, 64);
  }
}
