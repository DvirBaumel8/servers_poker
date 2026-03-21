import { Injectable, Optional } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { RedisService } from "../../../common/redis/redis.service";

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @Optional()
    private readonly redisService: RedisService | null,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.redisService) {
      return this.getStatus(key, true, { message: "Redis not configured" });
    }

    try {
      const isConnected = await this.redisService.ping();
      const result = this.getStatus(key, isConnected);

      if (isConnected) {
        return result;
      }

      throw new HealthCheckError("Redis check failed", result);
    } catch (error) {
      const result = this.getStatus(key, false, {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw new HealthCheckError("Redis check failed", result);
    }
  }
}
