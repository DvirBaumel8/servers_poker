import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailService } from "./email.service";
import {
  PlatformAnalyticsService,
  DailySummaryData,
} from "./platform-analytics.service";
import { DailySummary } from "../entities/daily-summary.entity";
import { RedisHealthService } from "./redis/redis-health.service";

@Injectable()
export class DailySummaryService implements OnModuleInit {
  private readonly logger = new Logger(DailySummaryService.name);
  private readonly isEnabled: boolean;
  private readonly recipients: string[];
  private readonly summaryHour: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly analyticsService: PlatformAnalyticsService,
    private readonly redisHealthService: RedisHealthService,
    @InjectRepository(DailySummary)
    private readonly summaryRepository: Repository<DailySummary>,
  ) {
    this.isEnabled =
      this.configService.get<string>("DAILY_SUMMARY_ENABLED", "false") ===
      "true";
    this.recipients = this.parseRecipients(
      this.configService.get<string>("DAILY_SUMMARY_RECIPIENTS", ""),
    );
    this.summaryHour = parseInt(
      this.configService.get<string>("DAILY_SUMMARY_HOUR", "8"),
      10,
    );
  }

  onModuleInit(): void {
    if (this.isEnabled) {
      this.logger.log(
        `Daily summary service enabled. Recipients: ${this.recipients.join(", ")}`,
      );
      this.logger.log(`Summary will be sent at ${this.summaryHour}:00 UTC`);
    } else {
      this.logger.log("Daily summary service is disabled");
    }
  }

  private parseRecipients(recipientsStr: string): string[] {
    return recipientsStr
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0 && email.includes("@"));
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleDailySummaryCron(): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const currentHour = new Date().getUTCHours();
    if (currentHour !== this.summaryHour) {
      return;
    }

    await this.sendDailySummary();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyMetricsCron(): Promise<void> {
    try {
      await this.analyticsService.saveDailyMetrics();
      this.logger.log("Daily metrics snapshot saved");
    } catch (error) {
      this.logger.error("Failed to save daily metrics:", error);
    }
  }

  async sendDailySummary(): Promise<boolean> {
    if (this.recipients.length === 0) {
      this.logger.warn("No recipients configured for daily summary");
      return false;
    }

    const summaryDate = this.getYesterdayDate();
    const existingSummary = await this.findExistingSummary(summaryDate);

    if (existingSummary?.status === "sent") {
      this.logger.log(`Summary for ${summaryDate.toISOString()} already sent`);
      return true;
    }

    const summary =
      existingSummary || (await this.createSummaryRecord(summaryDate));

    try {
      const data = await this.analyticsService.getDailySummaryData();
      const redisHealth = await this.getRedisHealthStatus();

      const emailContent = this.generateEmailContent(data, redisHealth);

      let allSent = true;
      for (const recipient of this.recipients) {
        const sent = await this.emailService.sendEmail({
          to: recipient,
          subject: this.getEmailSubject(data.date),
          text: emailContent.text,
          html: emailContent.html,
        });

        if (!sent) {
          allSent = false;
          this.logger.error(`Failed to send summary to ${recipient}`);
        }
      }

      summary.status = allSent ? "sent" : "failed";
      summary.sent_at = new Date();
      summary.metrics_snapshot = data as unknown as Record<string, unknown>;

      if (!allSent) {
        summary.error_message = "Some recipients failed to receive the email";
        summary.retry_count += 1;
      }

      await this.summaryRepository.save(summary);

      this.logger.log(
        `Daily summary ${allSent ? "sent successfully" : "partially failed"}`,
      );
      return allSent;
    } catch (error) {
      summary.status = "failed";
      summary.error_message =
        error instanceof Error ? error.message : "Unknown error";
      summary.retry_count += 1;
      await this.summaryRepository.save(summary);

      this.logger.error("Failed to send daily summary:", error);
      return false;
    }
  }

  private async getRedisHealthStatus(): Promise<{
    connected: boolean;
    latencyMs?: number;
  }> {
    try {
      const health = await this.redisHealthService.getHealthStatus();
      return {
        connected: health.connected,
        latencyMs: health.latencyMs ?? undefined,
      };
    } catch {
      return { connected: false };
    }
  }

  private getEmailSubject(date: Date): string {
    const appName = this.configService.get<string>(
      "APP_NAME",
      "Poker Platform",
    );
    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return `[${appName}] Daily Summary - ${dateStr}`;
  }

  private generateEmailContent(
    data: DailySummaryData,
    redisHealth: { connected: boolean; latencyMs?: number },
  ): { text: string; html: string } {
    const text = this.generateTextContent(data, redisHealth);
    const html = this.generateHtmlContent(data, redisHealth);
    return { text, html };
  }

  private generateTextContent(
    data: DailySummaryData,
    redisHealth: { connected: boolean; latencyMs?: number },
  ): string {
    const topPerformersText = data.topPerformers
      .map(
        (p, i) =>
          `${i + 1}. ${p.botName}: ${p.netChips >= 0 ? "+" : ""}${this.formatNumber(p.netChips)} chips`,
      )
      .join("\n");

    return `
DAILY SUMMARY
=============

Platform Health
---------------
- Database Status: Healthy
- Redis Status: ${redisHealth.connected ? "Connected" : "Disconnected"}${redisHealth.latencyMs ? ` (${redisHealth.latencyMs}ms)` : ""}

User Activity (Last 24h)
------------------------
- New Registrations: ${data.today.newUsers}
- Active Users: ${data.today.activeUsers}
- Total Users: ${this.formatNumber(data.lifetime.totalUsers)}

Bot Activity (Last 24h)
-----------------------
- New Bots Registered: ${data.today.newBots}
- Active Bots: ${data.today.activeBots}
- Total Bots: ${this.formatNumber(data.lifetime.totalBots)}

Game Activity (Last 24h)
------------------------
- Cash Games Completed: ${data.today.gamesPlayed}
- Tournaments Completed: ${data.today.tournamentsCompleted}
- Total Hands Dealt: ${this.formatNumber(data.today.handsDealt)}
- Peak Concurrent Games: ${data.peakConcurrentGames}

Performance Metrics
-------------------
- Avg Bot Response Time: ${data.health.avgBotResponseMs}ms
- Bot Timeouts: ${data.health.botTimeoutCount}
- Bot Errors: ${data.health.botErrorCount}
- Error Rate: ${data.health.errorRate}

Top Performing Bots (24h)
-------------------------
${topPerformersText || "No bot activity today"}

Lifetime Totals
---------------
- Total Hands Dealt: ${this.formatNumber(data.lifetime.totalHandsDealt)}
- Total Tournaments: ${this.formatNumber(data.lifetime.totalTournaments)}
- Total Games: ${this.formatNumber(data.lifetime.totalGames)}
- Total Chip Volume: ${this.formatLargeNumber(data.lifetime.totalChipVolume)}
`.trim();
  }

  private generateHtmlContent(
    data: DailySummaryData,
    redisHealth: { connected: boolean; latencyMs?: number },
  ): string {
    const topPerformersHtml =
      data.topPerformers.length > 0
        ? data.topPerformers
            .map(
              (p, i) => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #333;">${i + 1}</td>
            <td style="padding: 8px; border-bottom: 1px solid #333;">${p.botName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #333; color: ${p.netChips >= 0 ? "#22c55e" : "#ef4444"};">
              ${p.netChips >= 0 ? "+" : ""}${this.formatNumber(p.netChips)}
            </td>
          </tr>
        `,
            )
            .join("")
        : `<tr><td colspan="3" style="padding: 8px; text-align: center; color: #6b7280;">No bot activity today</td></tr>`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #0f0f1a;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 30px; margin-bottom: 20px;">
      <h1 style="color: #fbbf24; margin: 0 0 10px 0; font-size: 24px;">Daily Summary</h1>
      <p style="color: #9ca3af; margin: 0; font-size: 14px;">
        ${data.date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>
    </div>

    <!-- Platform Health -->
    <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
      <h2 style="color: #ffffff; margin: 0 0 15px 0; font-size: 16px;">Platform Health</h2>
      <div style="display: flex; gap: 20px; flex-wrap: wrap;">
        <div style="color: #9ca3af;">
          <span style="color: #22c55e;">●</span> Database: Healthy
        </div>
        <div style="color: #9ca3af;">
          <span style="color: ${redisHealth.connected ? "#22c55e" : "#ef4444"};">●</span> 
          Redis: ${redisHealth.connected ? "Connected" : "Disconnected"}
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">
      <!-- User Activity -->
      <div style="background: #1a1a2e; border-radius: 8px; padding: 20px;">
        <h3 style="color: #9ca3af; margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase;">User Activity (24h)</h3>
        <div style="margin-bottom: 10px;">
          <div style="color: #6b7280; font-size: 12px;">New Users</div>
          <div style="color: #ffffff; font-size: 24px; font-weight: bold;">${data.today.newUsers}</div>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="color: #6b7280; font-size: 12px;">Active Users</div>
          <div style="color: #ffffff; font-size: 18px;">${data.today.activeUsers}</div>
        </div>
        <div style="color: #6b7280; font-size: 12px;">
          Total: ${this.formatNumber(data.lifetime.totalUsers)}
        </div>
      </div>

      <!-- Bot Activity -->
      <div style="background: #1a1a2e; border-radius: 8px; padding: 20px;">
        <h3 style="color: #9ca3af; margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase;">Bot Activity (24h)</h3>
        <div style="margin-bottom: 10px;">
          <div style="color: #6b7280; font-size: 12px;">New Bots</div>
          <div style="color: #ffffff; font-size: 24px; font-weight: bold;">${data.today.newBots}</div>
        </div>
        <div style="margin-bottom: 10px;">
          <div style="color: #6b7280; font-size: 12px;">Active Bots</div>
          <div style="color: #ffffff; font-size: 18px;">${data.today.activeBots}</div>
        </div>
        <div style="color: #6b7280; font-size: 12px;">
          Total: ${this.formatNumber(data.lifetime.totalBots)}
        </div>
      </div>

      <!-- Game Activity -->
      <div style="background: #1a1a2e; border-radius: 8px; padding: 20px;">
        <h3 style="color: #9ca3af; margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase;">Game Activity (24h)</h3>
        <div style="margin-bottom: 10px;">
          <div style="color: #6b7280; font-size: 12px;">Hands Dealt</div>
          <div style="color: #fbbf24; font-size: 24px; font-weight: bold;">${this.formatNumber(data.today.handsDealt)}</div>
        </div>
        <div style="display: flex; gap: 15px;">
          <div>
            <div style="color: #6b7280; font-size: 12px;">Games</div>
            <div style="color: #ffffff; font-size: 16px;">${data.today.gamesPlayed}</div>
          </div>
          <div>
            <div style="color: #6b7280; font-size: 12px;">Tournaments</div>
            <div style="color: #ffffff; font-size: 16px;">${data.today.tournamentsCompleted}</div>
          </div>
        </div>
      </div>

      <!-- Performance -->
      <div style="background: #1a1a2e; border-radius: 8px; padding: 20px;">
        <h3 style="color: #9ca3af; margin: 0 0 15px 0; font-size: 12px; text-transform: uppercase;">Performance</h3>
        <div style="margin-bottom: 10px;">
          <div style="color: #6b7280; font-size: 12px;">Avg Response Time</div>
          <div style="color: #ffffff; font-size: 24px; font-weight: bold;">${data.health.avgBotResponseMs}ms</div>
        </div>
        <div style="display: flex; gap: 15px;">
          <div>
            <div style="color: #6b7280; font-size: 12px;">Timeouts</div>
            <div style="color: ${data.health.botTimeoutCount > 0 ? "#ef4444" : "#22c55e"}; font-size: 16px;">${data.health.botTimeoutCount}</div>
          </div>
          <div>
            <div style="color: #6b7280; font-size: 12px;">Error Rate</div>
            <div style="color: #ffffff; font-size: 16px;">${data.health.errorRate}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top Performers -->
    <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
      <h2 style="color: #ffffff; margin: 0 0 15px 0; font-size: 16px;">Top Performing Bots (24h)</h2>
      <table style="width: 100%; border-collapse: collapse; color: #ffffff;">
        <thead>
          <tr style="color: #6b7280; font-size: 12px; text-transform: uppercase;">
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #333;">#</th>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #333;">Bot</th>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #333;">Net Chips</th>
          </tr>
        </thead>
        <tbody>
          ${topPerformersHtml}
        </tbody>
      </table>
    </div>

    <!-- Lifetime Totals -->
    <div style="background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%); border-radius: 8px; padding: 20px;">
      <h2 style="color: #fbbf24; margin: 0 0 15px 0; font-size: 16px;">Lifetime Totals</h2>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
        <div>
          <div style="color: #6b7280; font-size: 12px;">Total Hands</div>
          <div style="color: #ffffff; font-size: 20px; font-weight: bold;">${this.formatNumber(data.lifetime.totalHandsDealt)}</div>
        </div>
        <div>
          <div style="color: #6b7280; font-size: 12px;">Total Games</div>
          <div style="color: #ffffff; font-size: 20px; font-weight: bold;">${this.formatNumber(data.lifetime.totalGames)}</div>
        </div>
        <div>
          <div style="color: #6b7280; font-size: 12px;">Total Tournaments</div>
          <div style="color: #ffffff; font-size: 20px; font-weight: bold;">${this.formatNumber(data.lifetime.totalTournaments)}</div>
        </div>
        <div>
          <div style="color: #6b7280; font-size: 12px;">Chip Volume</div>
          <div style="color: #ffffff; font-size: 20px; font-weight: bold;">${this.formatLargeNumber(data.lifetime.totalChipVolume)}</div>
        </div>
      </div>
    </div>

    <div style="text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px;">
      This is an automated summary from your Poker Platform.
    </div>
  </div>
</body>
</html>
`.trim();
  }

  private formatNumber(num: number): string {
    return num.toLocaleString("en-US");
  }

  private formatLargeNumber(num: number): string {
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(1)}B`;
    }
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`;
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toString();
  }

  private getYesterdayDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private async findExistingSummary(date: Date): Promise<DailySummary | null> {
    return this.summaryRepository.findOne({
      where: { summary_date: date },
    });
  }

  private async createSummaryRecord(date: Date): Promise<DailySummary> {
    const summary = this.summaryRepository.create({
      summary_date: date,
      status: "pending",
      recipients: this.recipients,
    });
    return this.summaryRepository.save(summary);
  }

  async triggerManualSummary(): Promise<boolean> {
    this.logger.log("Triggering manual daily summary");
    return this.sendDailySummary();
  }
}
