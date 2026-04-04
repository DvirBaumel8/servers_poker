import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, EMPTY, from } from "rxjs";
import { switchMap, finalize } from "rxjs/operators";
import { LockService } from "../redis/lock.service";
import {
  DISTRIBUTED_LOCK_KEY,
  DistributedLockMetadata,
} from "../decorators/distributed-lock.decorator";

/**
 * Interceptor that acquires a distributed Redis lock before handler execution
 * and releases it after completion. Activated by the @DistributedLock() decorator.
 *
 * If the lock cannot be acquired, the handler is skipped (returns empty response).
 * Only applies to HTTP/WebSocket handlers — does NOT apply to @Cron methods.
 */
@Injectable()
export class DistributedLockInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly lockService: LockService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> | Promise<Observable<unknown>> {
    const metadata = this.reflector.get<DistributedLockMetadata>(
      DISTRIBUTED_LOCK_KEY,
      context.getHandler(),
    );

    if (!metadata) {
      return next.handle();
    }

    return from(
      this.lockService.acquire({ key: metadata.key, ttlMs: metadata.ttlMs }),
    ).pipe(
      switchMap((lock) => {
        if (!lock.acquired) {
          return EMPTY;
        }

        return next.handle().pipe(
          finalize(async () => {
            await this.lockService.release(lock.lockKey, lock.ownerId);
          }),
        );
      }),
    );
  }
}
