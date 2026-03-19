import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request } from "express";

interface AuditLogEntry {
  timestamp: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  ip: string;
  userAgent: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestBody?: Record<string, any>;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger("AuditLog");

  private readonly sensitiveFields = [
    "password",
    "api_key",
    "apiKey",
    "token",
    "secret",
    "authorization",
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip, body } = request;
    const userAgent = request.get("user-agent") || "";
    const userId = (request as any).user?.id || null;
    const startTime = Date.now();

    const sanitizedBody = this.sanitizeBody(body);
    const [resource, resourceId] = this.extractResource(url);

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const durationMs = Date.now() - startTime;

          const entry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            userId,
            action: this.getAction(method),
            resource,
            resourceId,
            ip: ip || "unknown",
            userAgent,
            method,
            statusCode: response.statusCode,
            durationMs,
            requestBody: sanitizedBody,
          };

          this.logEntry(entry);
        },
        error: (error) => {
          const durationMs = Date.now() - startTime;

          const entry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            userId,
            action: this.getAction(method),
            resource,
            resourceId,
            ip: ip || "unknown",
            userAgent,
            method,
            statusCode: error.status || 500,
            durationMs,
            requestBody: sanitizedBody,
          };

          this.logEntry(entry, error.message);
        },
      }),
    );
  }

  private sanitizeBody(body: any): Record<string, any> | undefined {
    if (!body || typeof body !== "object") {
      return undefined;
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(body)) {
      if (this.sensitiveFields.some((f) => key.toLowerCase().includes(f))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeBody(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private extractResource(url: string): [string, string | null] {
    const parts = url
      .replace(/^\/api\/v\d+\//, "")
      .split("/")
      .filter(Boolean);

    if (parts.length === 0) {
      return ["root", null];
    }

    const resource = parts[0];
    const resourceId = parts.length > 1 ? parts[1] : null;

    return [resource, resourceId];
  }

  private getAction(method: string): string {
    switch (method.toUpperCase()) {
      case "GET":
        return "read";
      case "POST":
        return "create";
      case "PUT":
      case "PATCH":
        return "update";
      case "DELETE":
        return "delete";
      default:
        return "unknown";
    }
  }

  private logEntry(entry: AuditLogEntry, error?: string): void {
    const logLine = JSON.stringify({
      ...entry,
      ...(error && { error }),
    });

    if (error) {
      this.logger.warn(logLine);
    } else {
      this.logger.log(logLine);
    }
  }
}
