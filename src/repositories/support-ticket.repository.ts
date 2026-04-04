import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BaseRepository } from "./base.repository";
import {
  SupportTicket,
  TicketMetadata,
} from "../entities/support-ticket.entity";

export interface CreateSupportTicketData {
  user_id?: string | null;
  email: string;
  subject: string;
  message: string;
  metadata: TicketMetadata;
}

@Injectable()
export class SupportTicketRepository extends BaseRepository<SupportTicket> {
  protected get entityName(): string {
    return "SupportTicket";
  }

  constructor(
    @InjectRepository(SupportTicket)
    protected readonly repository: Repository<SupportTicket>,
  ) {
    super();
  }

  async createTicket(data: CreateSupportTicketData): Promise<SupportTicket> {
    const ticket = this.repository.create({
      user_id: data.user_id ?? null,
      email: data.email,
      subject: data.subject,
      message: data.message,
      status: "open",
      metadata: data.metadata,
    });
    return this.repository.save(ticket);
  }
}
