import { DataSource } from "typeorm";
import { types } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

types.setTypeParser(20, (val: string) => val);

const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  username: process.env.DB_USERNAME ?? "postgres",
  password: process.env.DB_PASSWORD ?? "postgres",
  database: process.env.DB_NAME ?? "poker",
  entities: [__dirname + "/../entities/*.entity{.ts,.js}"],
  migrations: [__dirname + "/*-*{.ts,.js}"],
  logging: true,
});

async function run() {
  await dataSource.initialize();
  const migrations = await dataSource.runMigrations();
  for (const m of migrations) {
    process.stdout.write(`  ✓ ${m.name}\n`);
  }
  await dataSource.destroy();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
