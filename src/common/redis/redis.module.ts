import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RedisService } from "./redis.service";
import { RedisCacheService } from "./redis-cache.service";
import { LockService } from "./lock.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, RedisCacheService, LockService],
  exports: [RedisService, RedisCacheService, LockService],
})
export class RedisModule {}
