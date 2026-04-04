import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../common/redis";

export interface RedisHealthStatus {
  connected: boolean;
  latencyMs: number | null;
  error?: string;
}

@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name);

  constructor(private readonly redisService: RedisService) {}

  async getHealthStatus(): Promise<RedisHealthStatus> {
    const status: RedisHealthStatus = {
      connected: false,
      latencyMs: null,
    };

    try {
      const start = Date.now();
      const connected = await this.redisService.ping();
      status.latencyMs = Date.now() - start;
      status.connected = connected;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      status.error = errorMessage;
      this.logger.error(`Redis health check failed: ${errorMessage}`);
    }

    return status;
  }

  async isHealthy(): Promise<boolean> {
    try {
      return await this.redisService.ping();
    } catch {
      return false;
    }
  }
}
