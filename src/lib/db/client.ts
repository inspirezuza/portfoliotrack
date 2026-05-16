import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const dataDir = path.join(process.cwd(), "data");
export const dbPath = path.join(dataDir, "portfolio.sqlite");

function ensureDataDir() {
  mkdirSync(dataDir, { recursive: true });
}

function configureSqlite(sqlite: InstanceType<typeof Database>) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
}

export function createSqliteConnection() {
  ensureDataDir();

  const sqlite = new Database(dbPath);
  configureSqlite(sqlite);

  return sqlite;
}

export function createDatabaseHandle() {
  const sqlite = createSqliteConnection();
  const db = drizzle(sqlite, { schema });

  return { sqlite, db };
}

export type DatabaseHandle = ReturnType<typeof createDatabaseHandle>;
