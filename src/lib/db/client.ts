import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool as NodePostgresPool } from "pg";
import * as schema from "./schema";

const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres@localhost:5432/portfoliotrack";

function getDatabaseUrl() {
  const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
  const hostedDatabaseUrl = process.env.DATABASE_URL;
  const databaseUrl =
    process.env.NODE_ENV === "production"
      ? hostedDatabaseUrl || localDatabaseUrl || ""
      : localDatabaseUrl || hostedDatabaseUrl || DEFAULT_LOCAL_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or LOCAL_DATABASE_URL is required to connect to Postgres.");
  }

  return databaseUrl;
}

function isLocalDatabaseUrl(databaseUrl: string) {
  try {
    const hostname = new URL(databaseUrl).hostname;

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function createDatabaseHandle() {
  const databaseUrl = getDatabaseUrl();

  if (isLocalDatabaseUrl(databaseUrl)) {
    const pool = new NodePostgresPool({ connectionString: databaseUrl });
    const db = drizzleNodePostgres(pool, { schema });

    return { db, pool };
  }

  const pool = new NeonPool({ connectionString: databaseUrl });
  const db = drizzleNeon(pool, { schema });

  return { db, pool };
}

export type DatabaseHandle = ReturnType<typeof createDatabaseHandle>;
