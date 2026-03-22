import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
  Inject,
} from "@nestjs/common";
import { Response, Request } from "express";
import { MetricsService } from "../../modules/metrics/metrics.service";

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
}

const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  ThrottlerException: "Too many requests. Please wait a moment and try again.",
  UnauthorizedException: "Please sign in to continue.",
  ForbiddenException: "You don't have permission to perform this action.",
  NotFoundException: "The requested resource was not found.",
  ConflictException: "This action conflicts with an existing resource.",
  BadRequestException: "Invalid request. Please check your input.",
  PayloadTooLargeException: "The request is too large. Please reduce the size.",
  UnsupportedMediaTypeException: "Unsupported file type.",
  InternalServerErrorException: "Something went wrong. Please try again later.",
  ServiceUnavailableException:
    "Service temporarily unavailable. Please try again later.",
  GatewayTimeoutException: "Request timed out. Please try again.",
};

const USER_FRIENDLY_ERRORS: Record<string, string> = {
  ThrottlerException: "Rate Limited",
  UnauthorizedException: "Authentication Required",
  ForbiddenException: "Access Denied",
  NotFoundException: "Not Found",
  ConflictException: "Conflict",
  BadRequestException: "Bad Request",
  PayloadTooLargeException: "Payload Too Large",
  UnsupportedMediaTypeException: "Unsupported Media Type",
  InternalServerErrorException: "Server Error",
  ServiceUnavailableException: "Service Unavailable",
  GatewayTimeoutException: "Timeout",
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(
    @Optional()
    @Inject(MetricsService)
    private readonly metricsService: MetricsService | null,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error = "Internal Server Error";
    let exceptionName = "";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      exceptionName = exception.name;
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const responseObj = exceptionResponse as Record<string, any>;
        message = responseObj.message || message;
        error = responseObj.error || exception.name;
      }

      if (USER_FRIENDLY_MESSAGES[exceptionName]) {
        message = USER_FRIENDLY_MESSAGES[exceptionName];
      }
      if (USER_FRIENDLY_ERRORS[exceptionName]) {
        error = USER_FRIENDLY_ERRORS[exceptionName];
      }
    } else if (exception instanceof Error) {
      exceptionName = exception.name;
      message =
        USER_FRIENDLY_MESSAGES[exceptionName] ||
        "An unexpected error occurred. Please try again.";
      error = USER_FRIENDLY_ERRORS[exceptionName] || "Error";
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: Array.isArray(message) ? message.join(", ") : message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status}: ${message}`,
      );
    }

    // Record categorized error metric (GAP-7 fix)
    if (this.metricsService) {
      const errorType = this.categorizeError(exceptionName, status);
      this.metricsService.recordError(errorType, request.url, status);
    }

    response.status(status).json(errorResponse);
  }

  private categorizeError(exceptionName: string, status: number): string {
    // Map exception names to error categories
    const categoryMap: Record<string, string> = {
      BadRequestException: "validation",
      ValidationError: "validation",
      UnauthorizedException: "auth",
      ForbiddenException: "auth",
      NotFoundException: "not_found",
      ConflictException: "conflict",
      ThrottlerException: "rate_limit",
      PayloadTooLargeException: "payload",
      GatewayTimeoutException: "timeout",
      ServiceUnavailableException: "service_unavailable",
    };

    if (categoryMap[exceptionName]) {
      return categoryMap[exceptionName];
    }

    // Fall back to status code based categories
    if (status >= 500) {
      return "server_error";
    }
    if (status >= 400) {
      return "client_error";
    }

    return "unknown";
  }
}
