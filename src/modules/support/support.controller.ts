import { Body, Controller, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiProperty,
} from "@nestjs/swagger";
import { Request } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { SupportService } from "./support.service";
import { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";

class SubmitTicketResponseDto {
  @ApiProperty({ example: "550e8400-e29b-41d4-a716-446655440000" })
  id: string;

  @ApiProperty({ example: "open" })
  status: string;
}

@ApiTags("Support")
@Controller("contact")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Public()
  @Post()
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  @ApiOperation({ summary: "Submit a support ticket" })
  @ApiBody({ type: CreateSupportTicketDto })
  @ApiResponse({
    status: 201,
    description: "Ticket created successfully",
    type: SubmitTicketResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 429, description: "Too many requests (max 3/hour)" })
  async submit(
    @Body() dto: CreateSupportTicketDto,
    @Req() req: Request,
  ): Promise<SubmitTicketResponseDto> {
    const ticket = await this.supportService.submitTicket(dto, req as any);
    return { id: ticket.id, status: ticket.status };
  }
}
