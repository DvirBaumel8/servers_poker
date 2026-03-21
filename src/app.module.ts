import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from "@nestjs/core";

import { appConfig, getDatabaseConfig } from "./config";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { GameExceptionFilter } from "./common/filters/game-exception.filter";
import { SentryExceptionFilter } from "./common/sentry/sentry.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { AuditLogInterceptor } from "./common/interceptors/audit-log.interceptor";
import { MetricsInterceptor } from "./common/interceptors/metrics.interceptor";
import { TimeoutInterceptor } from "./common/interceptors/timeout.interceptor";
import { AuditLog } from "./entities/audit-log.entity";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { IpBlockGuard } from "./common/guards/ip-block.guard";
import { CustomThrottlerGuard } from "./common/guards/custom-throttler.guard";

import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { BotsModule } from "./modules/bots/bots.module";
import { GamesModule } from "./modules/games/games.module";
import { TournamentsModule } from "./modules/tournaments/tournaments.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { PreviewModule } from "./modules/preview/preview.module";
import { ServicesModule } from "./services/services.module";
import { SecurityModule } from "./common/security";
import { JwtConfigModule } from "./common/jwt";
import { HealthModule } from "./modules/health/health.module";
import { MetricsModule } from "./modules/metrics/metrics.module";
import { SentryModule } from "./common/sentry";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: [".env.local", ".env"],
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>("nodeEnv", "development");
        const isProduction = nodeEnv === "production";

        return {
          pinoHttp: {
            level: isProduction ? "info" : "debug",
            transport: isProduction
              ? undefined
              : {
                  target: "pino-pretty",
                  options: {
                    colorize: true,
                    singleLine: true,
                  },
                },
            formatters: {
              level: (label: string) => ({ level: label }),
            },
            serializers: {
              req: (req: Record<string, unknown>) => ({
                method: req.method,
                url: req.url,
                headers: {
                  "user-agent": (req.headers as Record<string, string>)?.[
                    "user-agent"
                  ],
                  "x-request-id": (req.headers as Record<string, string>)?.[
                    "x-request-id"
                  ],
                },
              }),
              res: (res: Record<string, unknown>) => ({
                statusCode: res.statusCode,
              }),
            },
            autoLogging: {
              ignore: (req: { url?: string }) =>
                req.url === "/api/v1/health" ||
                req.url === "/api/v1/health/live" ||
                req.url === "/metrics",
            },
            customProps: () => ({
              service: "poker-engine",
              environment: nodeEnv,
            }),
          },
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>("rateLimitWindowMs", 60000),
          limit: configService.get<number>("rateLimitMax", 100),
        },
      ],
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([AuditLog]),
    JwtConfigModule,
    SecurityModule,
    ServicesModule,
    HealthModule,
    MetricsModule,
    SentryModule,
    AuthModule,
    UsersModule,
    BotsModule,
    GamesModule,
    TournamentsModule,
    AnalyticsModule,
    PreviewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: GameExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: IpBlockGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
