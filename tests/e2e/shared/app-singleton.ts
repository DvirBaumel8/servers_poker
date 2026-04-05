import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD } from "@nestjs/core";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as entities from "../../../src/entities";
import { appConfig } from "../../../src/config";
import { JwtAuthGuard } from "../../../src/common/guards/jwt-auth.guard";
import { CustomThrottlerGuard } from "../../../src/common/guards/custom-throttler.guard";
import { BigIntInterceptor } from "../../../src/common/interceptors/bigint.interceptor";
import { ServicesModule } from "../../../src/services/services.module";
import { AuthModule } from "../../../src/modules/auth/auth.module";
import { UsersModule } from "../../../src/modules/users/users.module";
import { BotsModule } from "../../../src/modules/bots/bots.module";
import { GamesModule } from "../../../src/modules/games/games.module";
import { TournamentsModule } from "../../../src/modules/tournaments/tournaments.module";
import { FinanceModule } from "../../../src/modules/finance/finance.module";
import { MatchmakingModule } from "../../../src/modules/matchmaking/matchmaking.module";

export interface SharedAppContext {
  app: INestApplication;
  dataSource: DataSource;
  jwtService: JwtService;
  module: TestingModule;
}

let _ctx: SharedAppContext | null = null;

export async function getSharedApp(): Promise<SharedAppContext> {
  if (_ctx) return _ctx;

  // Must be set before module init so TournamentDirectorService picks it up
  process.env.TOURNAMENT_SCHEDULER_CRON =
    process.env.TOURNAMENT_SCHEDULER_CRON || "*/5 * * * * *";
  // Disable auto-scheduler so it doesn't race against matchmaking E2E tests
  // (scheduler would auto-start Daily Master tournaments whose scheduled_start_at is in the past)
  process.env.TOURNAMENT_SCHEDULER_ENABLED = "false";

  const moduleFixture = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
      TypeOrmModule.forRoot({
        type: "postgres",
        host: process.env.TEST_DB_HOST || "localhost",
        port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
        username: process.env.TEST_DB_USERNAME || "postgres",
        password: process.env.TEST_DB_PASSWORD || "postgres",
        database: process.env.TEST_DB_NAME || "poker_test",
        entities: Object.values(entities),
        synchronize: true,
        dropSchema: true,
      }),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
      EventEmitterModule.forRoot(),
      ScheduleModule.forRoot(),
      ServicesModule,
      AuthModule,
      UsersModule,
      BotsModule,
      GamesModule,
      TournamentsModule,
      FinanceModule,
      MatchmakingModule,
    ],
    providers: [
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new BigIntInterceptor());
  app.setGlobalPrefix("api/v1");

  await app.listen(0);

  _ctx = {
    app,
    dataSource: moduleFixture.get(DataSource),
    jwtService: moduleFixture.get(JwtService),
    module: moduleFixture,
  };

  return _ctx;
}

export async function closeSharedApp(): Promise<void> {
  if (_ctx) {
    if (_ctx.dataSource?.isInitialized) await _ctx.dataSource.destroy();
    await _ctx.app.close();
    _ctx = null;
  }
}
