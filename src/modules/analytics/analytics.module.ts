import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsEvent } from "../../entities/analytics-event.entity";
import { PlatformMetrics } from "../../entities/platform-metrics.entity";
import { DailySummary } from "../../entities/daily-summary.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent, PlatformMetrics, DailySummary]),
  ],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
