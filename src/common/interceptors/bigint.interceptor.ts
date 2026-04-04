import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

function replaceBigInt(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(replaceBigInt);
  if (value instanceof Date) return value;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) {
      out[k] = replaceBigInt(v);
    }
    return out;
  }
  return value;
}

/**
 * Global interceptor that recursively converts BigInt values to strings before
 * NestJS serializes the HTTP response. Apply via app.useGlobalInterceptors().
 *
 * WebSocket events are covered separately by the BigInt.prototype.toJSON
 * monkey-patch in main.ts, which fires inside Socket.IO's JSON.stringify.
 */
@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(replaceBigInt));
  }
}
