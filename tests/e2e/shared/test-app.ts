import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as entities from "../../../src/entities";
import { appConfig } from "../../../src/config";
import { JwtAuthGuard } from "../../../src/common/guards/jwt-auth.guard";
import { CustomThrottlerGuard } from "../../../src/common/guards/custom-throttler.guard";

export interface TestAppContext {
  app: INestApplication;
  dataSource: DataSource;
  jwtService: JwtService;
  module: TestingModule;
}

export interface CreateTestAppOptions {
  imports?: any[];
  dropSchema?: boolean;
}

export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<TestAppContext> {
  const { imports = [], dropSchema = true } = options;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [appConfig],
      }),
      TypeOrmModule.forRoot({
        type: "postgres",
        host: process.env.TEST_DB_HOST || "localhost",
        port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
        username: process.env.TEST_DB_USERNAME || "postgres",
        password: process.env.TEST_DB_PASSWORD || "postgres",
        database: process.env.TEST_DB_NAME || "poker_test",
        entities: Object.values(entities),
        synchronize: true,
        dropSchema,
      }),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
      EventEmitterModule.forRoot(),
      ...imports,
    ],
    providers: [
      {
        provide: APP_GUARD,
        useClass: JwtAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: CustomThrottlerGuard,
      },
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
  app.setGlobalPrefix("api/v1");

  await app.init();

  return {
    app,
    dataSource: moduleFixture.get(DataSource),
    jwtService: moduleFixture.get(JwtService),
    module: moduleFixture,
  };
}

export async function closeTestApp(ctx: TestAppContext): Promise<void> {
  if (ctx.dataSource?.isInitialized) {
    await ctx.dataSource.destroy();
  }
  await ctx.app.close();
}
