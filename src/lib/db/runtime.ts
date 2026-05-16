import "server-only";
import { createDatabaseHandle, type DatabaseHandle } from "./client";

const globalForDb = globalThis as typeof globalThis & {
  __portfolioTrackDbHandle?: DatabaseHandle;
};

export function getRuntimeDatabase() {
  if (!globalForDb.__portfolioTrackDbHandle) {
    globalForDb.__portfolioTrackDbHandle = createDatabaseHandle();
  }

  return globalForDb.__portfolioTrackDbHandle;
}

export function getDb() {
  return getRuntimeDatabase().db;
}

export const db = getDb();
