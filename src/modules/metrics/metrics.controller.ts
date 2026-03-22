import { Controller, Get, Res } from "@nestjs/common";
import { Response } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { PrometheusController } from "@willsoto/nestjs-prometheus";

@Controller("metrics")
export class MetricsController extends PrometheusController {
  @Get()
  @Public()
  async index(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
