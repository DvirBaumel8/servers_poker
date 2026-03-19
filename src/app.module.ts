import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from "@nestjs/core";

import { appConfig, getDatabaseConfig } from "./config";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { GameExceptionFilter } from "./common/filters/game-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { AuditLogInterceptor } from "./common/interceptors/audit-log.interceptor";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { BotsModule } from "./modules/bots/bots.module";
import { GamesModule } from "./modules/games/games.module";
import { TournamentsModule } from "./modules/tournaments/tournaments.module";
import { ServicesModule } from "./services/services.module";
import { SecurityModule } from "./common/security";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: [".env.local", ".env"],
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
    SecurityModule,
    ServicesModule,
    AuthModule,
    UsersModule,
    BotsModule,
    GamesModule,
    TournamentsModule,
  ],
  providers: [
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
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
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
