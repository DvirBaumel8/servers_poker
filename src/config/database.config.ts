import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: "postgres",
  host: configService.get<string>("DB_HOST", "localhost"),
  port: configService.get<number>("DB_PORT", 5432),
  username: configService.get<string>("DB_USERNAME", "postgres"),
  password: configService.get<string>("DB_PASSWORD", "postgres"),
  database: configService.get<string>("DB_NAME", "poker"),
  entities: [__dirname + "/../entities/*.entity{.ts,.js}"],
  synchronize: configService.get<string>("NODE_ENV") !== "production",
  logging: configService.get<string>("NODE_ENV") === "development",
  ssl:
    configService.get<string>("DB_SSL") === "true"
      ? { rejectUnauthorized: false }
      : false,
  extra: {
    max: configService.get<number>("DB_POOL_SIZE", 20),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
});

export const getTypeOrmConfig = (): TypeOrmModuleOptions => ({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "poker",
  entities: [__dirname + "/../entities/*.entity{.ts,.js}"],
  migrations: [__dirname + "/../migrations/*{.ts,.js}"],
  synchronize: process.env.NODE_ENV !== "production",
  logging: process.env.NODE_ENV === "development",
});
