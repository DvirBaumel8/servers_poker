import { Module, Global, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";

@Global()
@Module({})
export class SentryModule implements OnModuleInit {
  private readonly logger = new Logger(SentryModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const dsn = this.configService.get<string>("SENTRY_DSN");
    const nodeEnv = this.configService.get<string>("nodeEnv", "development");
    const isProduction = nodeEnv === "production";

    if (!dsn) {
      this.logger.log("Sentry DSN not configured, error tracking disabled");
      return;
    }

    Sentry.init({
      dsn,
      environment: nodeEnv,
      enabled: isProduction || !!dsn,
      tracesSampleRate: isProduction ? 0.1 : 1.0,
      profilesSampleRate: isProduction ? 0.1 : 1.0,
      integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },
    });

    this.logger.log(`Sentry initialized for environment: ${nodeEnv}`);
  }
}
