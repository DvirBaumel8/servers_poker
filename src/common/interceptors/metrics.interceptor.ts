import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MetricsService } from "../../modules/metrics/metrics.service";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @Optional()
    private readonly metricsService: MetricsService | null,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.metricsService) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const durationNs = Number(process.hrtime.bigint() - startTime);
          const durationSeconds = durationNs / 1e9;

          this.metricsService?.recordHttpRequest(
            method,
            url,
            statusCode,
            durationSeconds,
          );
        },
        error: (error) => {
          const statusCode = error.status || 500;
          const durationNs = Number(process.hrtime.bigint() - startTime);
          const durationSeconds = durationNs / 1e9;

          this.metricsService?.recordHttpRequest(
            method,
            url,
            statusCode,
            durationSeconds,
          );
        },
      }),
    );
  }
}
