import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { Request, Response } from "express";

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isEnabled = !!this.configService.get<string>("SENTRY_DSN");
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (this.isEnabled && status >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag("url", request.url);
        scope.setTag("method", request.method);
        scope.setTag("statusCode", status.toString());

        if (request.user) {
          scope.setUser({
            id: (request.user as { id?: string }).id,
          });
        }

        scope.setContext("request", {
          url: request.url,
          method: request.method,
          headers: {
            "user-agent": request.headers["user-agent"],
            "x-request-id": request.headers["x-request-id"],
          },
          query: request.query,
        });

        Sentry.captureException(exception);
      });
    }

    const message =
      exception instanceof HttpException
        ? exception.message
        : "Internal server error";

    this.logger.error(
      `${request.method} ${request.url} - ${status}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
