import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Observable, tap, catchError, throwError } from "rxjs";
import { AuditLog, AuditAction } from "../../entities/audit-log.entity";

const AUDITED_ROUTES = new Set([
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/register-developer",
  "POST /api/v1/auth/login",
  "POST /api/v1/bots",
  "PUT /api/v1/bots",
  "DELETE /api/v1/bots",
  "POST /api/v1/games/tables",
  "POST /api/v1/games",
  "POST /api/v1/tournaments",
]);

const SENSITIVE_DATA_PATTERNS = [
  /\/games\/[^/]+\/hands/, // Hand history access
  /\/games\/[^/]+\/seeds/, // Game seeds access
  /\/games\/hands\//, // Individual hand access
  /\/table\/[^/]+\/history/, // Table history access
  /\/games\/leaderboard/, // Leaderboard access
  /\/tournaments\/[^/]+\/leaderboard/, // Tournament leaderboard
  /\/tournaments\/[^/]+\/results/, // Tournament results
];

function shouldAudit(method: string, path: string): boolean {
  const key = `${method} ${path}`;
  for (const route of AUDITED_ROUTES) {
    if (key.startsWith(route)) return true;
  }

  for (const pattern of SENSITIVE_DATA_PATTERNS) {
    if (pattern.test(path)) return true;
  }

  return false;
}

function mapAction(method: string, path: string): AuditAction {
  if (path.includes("/login")) return "login";
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "delete";
  if (
    path.includes("/hands") ||
    path.includes("/seeds") ||
    path.includes("/history") ||
    path.includes("/leaderboard") ||
    path.includes("/results")
  ) {
    return "read";
  }
  return "read";
}

function extractResource(path: string): string {
  const parts = path.replace("/api/v1/", "").split("/");
  return parts[0] || "unknown";
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const path = req.path || req.url;

    if (!shouldAudit(method, path)) {
      return next.handle();
    }

    const startTime = Date.now();
    const userId = req.user?.id || null;

    return next.handle().pipe(
      tap((responseBody) => {
        const duration = Date.now() - startTime;
        this.saveLog({
          userId,
          method,
          path,
          statusCode: 200,
          duration,
          req,
          responseBody,
        }).catch(() => {});
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.saveLog({
          userId,
          method,
          path,
          statusCode: error.status || 500,
          duration,
          req,
          error: error.message,
        }).catch(() => {});
        return throwError(() => error);
      }),
    );
  }

  private async saveLog(data: {
    userId: string | null;
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    req: any;
    responseBody?: any;
    error?: string;
  }): Promise<void> {
    try {
      const sanitizedBody = data.req.body ? { ...data.req.body } : null;
      if (sanitizedBody?.password) sanitizedBody.password = "[REDACTED]";
      if (sanitizedBody?.newPassword) sanitizedBody.newPassword = "[REDACTED]";

      const log = this.auditLogRepository.create({
        user_id: data.userId,
        action: mapAction(data.method, data.path),
        resource: extractResource(data.path),
        resource_id: this.extractResourceId(data.path),
        ip_address:
          data.req.ip || data.req.headers?.["x-forwarded-for"] || null,
        user_agent: data.req.headers?.["user-agent"]?.slice(0, 500) || null,
        http_method: data.method,
        status_code: data.statusCode,
        duration_ms: data.duration,
        request_body: sanitizedBody,
        error_message: data.error || null,
      });

      await this.auditLogRepository.save(log);
    } catch (err) {
      this.logger.debug(`Audit log save failed: ${err}`);
    }
  }

  private extractResourceId(path: string): string | null {
    const uuidRegex =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = path.match(uuidRegex);
    return match ? match[0] : null;
  }
}
