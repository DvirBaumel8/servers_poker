import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../../services/email.service";

@Injectable()
export class TournamentAlertService {
  private readonly logger = new Logger(TournamentAlertService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fire-and-forget alert for tournament errors.
   * Never throws — all failures are logged and swallowed.
   */
  async sendTournamentErrorAlert(
    tournamentId: string,
    tournamentName: string,
    error: Error,
  ): Promise<void> {
    try {
      const adminEmail =
        this.configService.get<string>("TOURNAMENT_ALERT_EMAIL") ??
        this.configService.get<string>("SUPPORT_ADMIN_EMAIL");

      if (!adminEmail) {
        this.logger.warn(
          "No alert email configured (TOURNAMENT_ALERT_EMAIL / SUPPORT_ADMIN_EMAIL)",
        );
        return;
      }

      const subject = `[TOURNAMENT ERROR] ${tournamentName} (${tournamentId.slice(0, 8)})`;
      const text = [
        `Tournament "${tournamentName}" encountered a fatal error.`,
        ``,
        `Tournament ID: ${tournamentId}`,
        `Time: ${new Date().toISOString()}`,
        `Error: ${error.message}`,
        ``,
        `Stack trace:`,
        error.stack ?? "(no stack)",
      ].join("\n");

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #b71c1c; text-align: center;">Tournament Error Alert</h1>
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px;">
            <p style="color: #fb7185; font-size: 18px; font-weight: bold;">${tournamentName}</p>
            <p style="color: #9ca3af;">Tournament ID: <code style="color: #fbbf24;">${tournamentId}</code></p>
            <p style="color: #9ca3af;">Time: ${new Date().toISOString()}</p>
            <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; margin-top: 16px;">
              <p style="color: #fb7185; font-weight: bold; margin: 0 0 8px 0;">Error:</p>
              <pre style="color: #e2e8f0; white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 13px;">${error.message}</pre>
            </div>
            <div style="background: #0f0f1a; padding: 16px; border-radius: 8px; margin-top: 12px;">
              <p style="color: #6b7280; font-weight: bold; margin: 0 0 8px 0;">Stack trace:</p>
              <pre style="color: #94a3b8; white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 11px;">${error.stack ?? "(no stack)"}</pre>
            </div>
          </div>
        </div>
      `;

      await this.emailService.sendEmail({
        to: adminEmail,
        subject,
        text,
        html,
      });
      this.logger.log(`Tournament error alert sent for ${tournamentId}`);
    } catch (alertError) {
      this.logger.error(
        `Failed to send tournament error alert for ${tournamentId}:`,
        alertError instanceof Error ? alertError.message : String(alertError),
      );
    }
  }
}
