import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDatabaseHandle } from "./client";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const { db, sqlite } = createDatabaseHandle();

try {
  migrate(db, { migrationsFolder });
  console.log(`Database migrations applied from ${migrationsFolder}.`);
} finally {
  sqlite.close();
}
