import { SetMetadata } from "@nestjs/common";

export const DISTRIBUTED_LOCK_KEY = "distributed_lock";

export interface DistributedLockMetadata {
  key: string;
  ttlMs: number;
}

/**
 * Marks an HTTP/WebSocket handler to be guarded by a distributed Redis lock.
 * The DistributedLockInterceptor reads this metadata and acquires/releases the lock.
 *
 * NOTE: This decorator does NOT work with @Cron methods — NestJS interceptors
 * only apply to the HTTP/WS request pipeline. For cron jobs and event listeners,
 * use `lockService.withLock()` directly.
 */
export const DistributedLock = (key: string, ttlMs: number) =>
  SetMetadata(DISTRIBUTED_LOCK_KEY, { key, ttlMs } as DistributedLockMetadata);
