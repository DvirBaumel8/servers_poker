import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { appConfig } from "../../src/config";

export interface TestContext {
  app: INestApplication;
  module: TestingModule;
  dataSource: DataSource;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string, defaultValue?: any) => {
        const testConfig: Record<string, any> = {
          nodeEnv: "test",
          port: 0,
          DB_HOST: process.env.TEST_DB_HOST || "localhost",
          DB_PORT: parseInt(process.env.TEST_DB_PORT || "5432", 10),
          DB_USERNAME: process.env.TEST_DB_USERNAME || "postgres",
          DB_PASSWORD: process.env.TEST_DB_PASSWORD || "postgres",
          DB_NAME: process.env.TEST_DB_NAME || "poker_test",
          JWT_SECRET: "test-jwt-secret-key-for-testing",
          rateLimitWindowMs: 60000,
          rateLimitMax: 1000,
          GAME_STATE_PERSISTENCE: "false",
          GAME_AUTO_RECOVER: "false",
        };
        return testConfig[key] ?? defaultValue;
      },
    })
    .compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix("api/v1");

  await app.init();

  const dataSource = moduleFixture.get(DataSource);

  return {
    app,
    module: moduleFixture,
    dataSource,
  };
}

export async function createTestAppWithTestDb(): Promise<TestContext> {
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
        entities: [__dirname + "/../../src/entities/*.entity{.ts,.js}"],
        synchronize: true,
        dropSchema: true,
        logging: false,
      }),
      EventEmitterModule.forRoot(),
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

  const dataSource = moduleFixture.get(DataSource);

  return {
    app,
    module: moduleFixture,
    dataSource,
  };
}

export async function cleanupTestApp(context: TestContext): Promise<void> {
  if (context.dataSource?.isInitialized) {
    await context.dataSource.destroy();
  }
  if (context.app) {
    await context.app.close();
  }
}

export async function clearDatabase(dataSource: DataSource): Promise<void> {
  const entities = dataSource.entityMetadatas;

  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(
      `TRUNCATE TABLE "${entity.tableName}" RESTART IDENTITY CASCADE`,
    );
  }
}
