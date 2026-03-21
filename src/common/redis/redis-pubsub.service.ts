import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export type MessageHandler = (channel: string, message: string) => void;

@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly keyPrefix: string;
  private readonly handlers = new Map<string, Set<MessageHandler>>();
  private isSubscriberReady = false;

  constructor(private readonly configService: ConfigService) {
    const config = {
      host: this.configService.get<string>("REDIS_HOST", "localhost"),
      port: this.configService.get<number>("REDIS_PORT", 6379),
      password: this.configService.get<string>("REDIS_PASSWORD") || undefined,
      db: this.configService.get<number>("REDIS_DB", 0),
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
    };

    this.keyPrefix = this.configService.get<string>(
      "REDIS_KEY_PREFIX",
      "poker:",
    );

    this.publisher = new Redis(config);
    this.subscriber = new Redis(config);

    this.publisher.on("connect", () => {
      this.logger.log("Redis publisher connected");
    });

    this.publisher.on("error", (err) => {
      this.logger.error(`Redis publisher error: ${err.message}`);
    });

    this.subscriber.on("connect", () => {
      this.logger.log("Redis subscriber connected");
      this.isSubscriberReady = true;
    });

    this.subscriber.on("error", (err) => {
      this.logger.error(`Redis subscriber error: ${err.message}`);
    });

    this.subscriber.on("message", (channel, message) => {
      this.handleMessage(channel, message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
    this.logger.log("Redis pub/sub connections closed");
  }

  private getFullChannel(channel: string): string {
    return `${this.keyPrefix}${channel}`;
  }

  async publish(channel: string, message: string | object): Promise<number> {
    const fullChannel = this.getFullChannel(channel);
    const payload =
      typeof message === "string" ? message : JSON.stringify(message);
    return this.publisher.publish(fullChannel, payload);
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    const fullChannel = this.getFullChannel(channel);

    if (!this.handlers.has(fullChannel)) {
      this.handlers.set(fullChannel, new Set());
      await this.subscriber.subscribe(fullChannel);
      this.logger.debug(`Subscribed to channel: ${fullChannel}`);
    }

    this.handlers.get(fullChannel)!.add(handler);
  }

  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    const fullChannel = this.getFullChannel(channel);
    const channelHandlers = this.handlers.get(fullChannel);

    if (!channelHandlers) return;

    if (handler) {
      channelHandlers.delete(handler);
    }

    if (!handler || channelHandlers.size === 0) {
      await this.subscriber.unsubscribe(fullChannel);
      this.handlers.delete(fullChannel);
      this.logger.debug(`Unsubscribed from channel: ${fullChannel}`);
    }
  }

  private handleMessage(channel: string, message: string): void {
    const handlers = this.handlers.get(channel);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(channel, message);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Error in message handler for ${channel}: ${errorMessage}`,
        );
      }
    }
  }

  isReady(): boolean {
    return this.isSubscriberReady;
  }

  async waitForReady(timeoutMs: number = 5000): Promise<boolean> {
    if (this.isSubscriberReady) return true;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      const checkReady = () => {
        if (this.isSubscriberReady) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          setTimeout(checkReady, 100);
        }
      };

      checkReady();
    });
  }
}
