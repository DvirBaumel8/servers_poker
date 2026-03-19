import { DataSource } from "typeorm";

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const dataSource = new DataSource({
      type: "postgres",
      host: process.env.TEST_DB_HOST || "localhost",
      port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
      username: process.env.TEST_DB_USERNAME || "postgres",
      password: process.env.TEST_DB_PASSWORD || "postgres",
      database: process.env.TEST_DB_NAME || "poker_test",
    });

    await dataSource.initialize();
    await dataSource.destroy();
    return true;
  } catch {
    return false;
  }
}

export const skipIfNoDatabase =
  process.env.SKIP_E2E_IF_NO_DB !== "false" &&
  !process.env.TEST_DB_HOST &&
  !process.env.CI;
