import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { StrategyTunerService } from "./strategy-tuner.service";

@Controller("strategy-tuner")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StrategyTunerController {
  constructor(private readonly tunerService: StrategyTunerService) {}

  @Post("run")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  async triggerRun() {
    const run = await this.tunerService.runTuner();
    return {
      id: run.id,
      status: run.status,
      reports_analyzed: run.reports_analyzed,
      proposed_changes: run.proposed_changes,
      pr_url: run.pr_url,
      branch_name: run.branch_name,
      summary: run.summary,
      error: run.error_message,
    };
  }

  @Get("history")
  @Roles("admin")
  async getHistory(@Query("limit") limit?: string) {
    const parsedLimit = Math.min(parseInt(limit || "20", 10) || 20, 100);
    const runs = await this.tunerService.getHistory(parsedLimit);
    return {
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        reports_analyzed: r.reports_analyzed,
        proposed_changes: r.proposed_changes,
        pr_url: r.pr_url,
        branch_name: r.branch_name,
        summary: r.summary,
        started_at: r.started_at,
        completed_at: r.completed_at,
      })),
    };
  }
}
