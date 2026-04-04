import { Inject, Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import { SupportTicket } from "../../entities/support-ticket.entity";
import { SupportTicketRepository } from "../../repositories/support-ticket.repository";
import { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";
import {
  NOTIFICATION_PROVIDER,
  NotificationProvider,
} from "./notification/notification.provider";

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly ticketRepository: SupportTicketRepository,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notificationProvider: NotificationProvider,
  ) {}

  async submitTicket(
    dto: CreateSupportTicketDto,
    req: Request & { user?: { id: string } },
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepository.createTicket({
      user_id: req.user?.id ?? null,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
      metadata: {
        userAgent: req.headers["user-agent"],
        lastHandId: dto.handId,
        tournamentId: dto.tournamentId,
        url: req.headers["referer"] as string | undefined,
      },
    });

    this.notifyAdmin(ticket);

    return ticket;
  }

  private notifyAdmin(ticket: SupportTicket): void {
    this.notificationProvider.notify(ticket).catch((err: unknown) => {
      this.logger.error(
        `Admin notification failed for ticket ${ticket.id} after retries`,
        err,
      );
    });
  }
}
