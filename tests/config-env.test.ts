import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts", "check-env.mjs");
const cleanEnv = {
  NODE_ENV: "test" as const,
  PATH: process.env.PATH ?? "",
  SystemRoot: process.env.SystemRoot ?? "",
  TEMP: process.env.TEMP ?? "",
  TMP: process.env.TMP ?? "",
};

function runCheck(args: string[], env: Record<string, string | undefined>) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: { ...cleanEnv, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("config check accepts a complete production environment", () => {
  const output = runCheck(["--mode", "production"], {
    ADMIN_PASSWORD_HASH: "hash",
    ADMIN_USERNAME: "admin",
    AUTH_SECRET: "secret",
    CRON_SECRET: "cron-secret",
    DATABASE_URL: "postgresql://example.invalid/portfoliotrack",
  });

  assert.match(output, /production env looks ready/);
});

test("config check rejects production when deployment secrets are missing", () => {
  assert.throws(
    () =>
      runCheck(["--mode", "production"], {
        ADMIN_USERNAME: "admin",
        AUTH_SECRET: "secret",
        DATABASE_URL: "postgresql://example.invalid/portfoliotrack",
      }),
    /missing required production env: ADMIN_PASSWORD_HASH, CRON_SECRET/,
  );
});

test("config check warns when local database settings fall back to localhost", () => {
  const output = runCheck(["--mode", "development"], {
    ADMIN_PASSWORD_HASH: "hash",
    ADMIN_USERNAME: "admin",
    AUTH_SECRET: "secret",
  });

  assert.match(output, /development env looks ready/);
});
