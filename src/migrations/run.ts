import dataSource from "../config/typeorm.config";

async function runMigrations() {
  console.log("Initializing database connection...");

  try {
    await dataSource.initialize();
    console.log("Database connection established");

    console.log("Running migrations...");
    const migrations = await dataSource.runMigrations();

    if (migrations.length === 0) {
      console.log("No pending migrations");
    } else {
      console.log(`Executed ${migrations.length} migration(s):`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    }

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runMigrations();
