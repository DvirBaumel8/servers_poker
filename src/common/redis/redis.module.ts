import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { RedisService } from "./redis.service";
import { RedisPubSubService } from "./redis-pubsub.service";
import { RedisCacheService } from "./redis-cache.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, RedisPubSubService, RedisCacheService],
  exports: [RedisService, RedisPubSubService, RedisCacheService],
})
export class RedisModule {}
