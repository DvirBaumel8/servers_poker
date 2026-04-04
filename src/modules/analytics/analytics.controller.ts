import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHash } from "crypto";
import { AnalyticsEvent } from "../../entities/analytics-event.entity";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RecordEventDto, MetricsHistoryQueryDto } from "./dto/analytics.dto";

interface AuthenticatedUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

@Controller("analytics")
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly eventRepository: Repository<AnalyticsEvent>,
  ) {}

  @Public()
  @Post("events")
  @Throttle({ default: { ttl: 60000, limit: 60 } }) // 60 per minute
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
      throw new InternalServerErrorException("Failed to record event");
    }
  }

  @Roles("admin")
  @Get("events/summary")
  async getEventsSummary(
    @Query() query: MetricsHistoryQueryDto,
  ): Promise<Record<string, number>> {
    const days = query.days ?? 7;
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
