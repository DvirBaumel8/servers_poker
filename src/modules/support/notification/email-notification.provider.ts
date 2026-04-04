import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../../../services/email.service";
import { SupportTicket } from "../../../entities/support-ticket.entity";
import { NotificationProvider } from "./notification.provider";

const MAX_ATTEMPTS = 3;
const RETRYABLE_CODES = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"];

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(EmailNotificationProvider.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async notify(ticket: SupportTicket): Promise<void> {
    const adminEmail = this.configService.get<string>("SUPPORT_ADMIN_EMAIL");
    if (!adminEmail) {
      this.logger.warn(
        "SUPPORT_ADMIN_EMAIL not configured — skipping admin notification",
      );
      return;
    }

    const subject = `[Support] ${ticket.subject} — from ${ticket.email}`;
    const handLink = ticket.metadata.lastHandId
      ? `\n\nHand History: /api/v1/hands/${ticket.metadata.lastHandId}`
      : "";
    const text = [
      `From: ${ticket.email}`,
      ticket.user_id ? `User ID: ${ticket.user_id}` : "User: anonymous",
      `Subject: ${ticket.subject}`,
      "",
      ticket.message,
      handLink,
      "",
      `Ticket ID: ${ticket.id}`,
      ticket.metadata.url ? `URL: ${ticket.metadata.url}` : "",
      ticket.metadata.userAgent
        ? `User-Agent: ${ticket.metadata.userAgent}`
        : "",
    ]
      .filter((line) => line !== undefined)
      .join("\n")
      .trim();

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.emailService.sendEmail({ to: adminEmail, subject, text });
        return;
      } catch (err) {
        lastError = err;
        if (!this.isRetryable(err)) {
          this.logger.warn(
            `Non-retryable email error for ticket ${ticket.id} (attempt ${attempt}): ${(err as Error).message}`,
          );
          return;
        }
        if (attempt < MAX_ATTEMPTS) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          this.logger.warn(
            `Email attempt ${attempt}/${MAX_ATTEMPTS} failed for ticket ${ticket.id}, retrying in ${delayMs}ms`,
          );
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    throw lastError;
  }

  private isRetryable(err: unknown): boolean {
    if (err === null || typeof err !== "object") return false;
    const e = err as Record<string, unknown>;
    const code = (e.responseCode as number) ?? (e.status as number) ?? 0;
    if (code >= 500) return true;
    if (code >= 400) return false;
    return RETRYABLE_CODES.includes((e.code as string) ?? "");
  }
}
