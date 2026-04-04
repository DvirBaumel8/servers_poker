import {
  Controller,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { ArchiveService } from "./archive.service";
import {
  ArchivedHandResponseDto,
  ArchivedHandListResponseDto,
} from "./dto/archived-hand.dto";

@ApiTags("Archive")
@Controller("archive")
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get("tournaments/:tournamentId/hands")
  @Roles("admin")
  @ApiOperation({ summary: "List archived hands for a tournament" })
  async listArchivedHands(
    @Param("tournamentId") tournamentId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<ArchivedHandListResponseDto> {
    return this.archiveService.listArchivedHands(tournamentId, page, limit);
  }

  @Get("tournaments/:tournamentId/hands/:handId")
  @Roles("admin")
  @ApiOperation({ summary: "Get a single archived hand with full details" })
  async getArchivedHand(
    @Param("tournamentId") tournamentId: string,
    @Param("handId") handId: string,
  ): Promise<ArchivedHandResponseDto> {
    return this.archiveService.getArchivedHand(tournamentId, handId);
  }
}
