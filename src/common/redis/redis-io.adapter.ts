import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(
    app: INestApplication,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisHost = this.configService.get<string>("REDIS_HOST", "localhost");
    const redisPort = this.configService.get<number>("REDIS_PORT", 6379);
    const redisPassword = this.configService.get<string>("REDIS_PASSWORD");
    const redisDb = this.configService.get<number>("REDIS_DB", 0);

    const redisUrl = redisPassword
      ? `redis://:${redisPassword}@${redisHost}:${redisPort}/${redisDb}`
      : `redis://${redisHost}:${redisPort}/${redisDb}`;

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) => {
      this.logger.error(`Redis pub client error: ${err.message}`);
    });

    subClient.on("error", (err) => {
      this.logger.error(`Redis sub client error: ${err.message}`);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log(
      `Socket.IO Redis adapter connected to ${redisHost}:${redisPort}`,
    );
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log("Socket.IO server using Redis adapter");
    } else {
      this.logger.warn(
        "Redis adapter not initialized - using default in-memory adapter",
      );
    }

    return server;
  }
}
