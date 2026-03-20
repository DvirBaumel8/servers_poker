import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isProduction = configService.get<string>("NODE_ENV") === "production";

  return {
    type: "postgres",
    host: configService.get<string>("DB_HOST", "localhost"),
    port: configService.get<number>("DB_PORT", 5432),
    username: configService.get<string>("DB_USERNAME", "postgres"),
    password: configService.get<string>("DB_PASSWORD", "postgres"),
    database: configService.get<string>("DB_NAME", "poker"),
    entities: [__dirname + "/../entities/*.entity{.ts,.js}"],
    migrations: [__dirname + "/../migrations/*{.ts,.js}"],
    migrationsRun: false,
    synchronize: false,
    logging: !isProduction,
    ssl:
      configService.get<string>("DB_SSL") === "true"
        ? { rejectUnauthorized: false }
        : false,
    extra: {
      max: configService.get<number>("DB_POOL_SIZE", 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  };
};
