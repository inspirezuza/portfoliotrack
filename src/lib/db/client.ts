import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to Neon Postgres.");
  }

  return databaseUrl;
}

export function createDatabaseHandle() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const db = drizzle(pool, { schema });

  return { db, pool };
}

export type DatabaseHandle = ReturnType<typeof createDatabaseHandle>;
