import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SupportTicket } from "../../entities/support-ticket.entity";
import { SupportTicketRepository } from "../../repositories/support-ticket.repository";
import { EmailNotificationProvider } from "./notification/email-notification.provider";
import { NOTIFICATION_PROVIDER } from "./notification/notification.provider";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket])],
  controllers: [SupportController],
  providers: [
    SupportService,
    SupportTicketRepository,
    {
      provide: NOTIFICATION_PROVIDER,
      useClass: EmailNotificationProvider,
    },
  ],
})
export class SupportModule {}
