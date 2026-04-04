import { SupportTicket } from "../../../entities/support-ticket.entity";

export const NOTIFICATION_PROVIDER = "NOTIFICATION_PROVIDER";

export interface NotificationProvider {
  notify(ticket: SupportTicket): Promise<void>;
}
