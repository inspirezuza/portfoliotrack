import { fileURLToPath } from "node:url";

const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres@localhost:5432/portfoliotrack";

const MODE_ALIASES = new Map([
  ["dev", "development"],
  ["local", "development"],
  ["development", "development"],
  ["prod", "production"],
  ["production", "production"],
]);

function parseMode(argv, env) {
  const explicitModeIndex = argv.indexOf("--mode");
  const explicitMode = explicitModeIndex === -1 ? "" : argv[explicitModeIndex + 1] || "";
  const rawMode = explicitMode || env.NODE_ENV || "development";
  const mode = MODE_ALIASES.get(rawMode);

  if (!mode) {
    throw new Error(`Unknown environment check mode "${rawMode}". Use development or production.`);
  }

  return mode;
}

function getMissingNames(names, env) {
  return names.filter((name) => !env[name] || env[name]?.trim() === "");
}

function getDatabaseUrl(mode, env) {
  if (mode === "production") {
    return env.DATABASE_URL || "";
  }

  return env.LOCAL_DATABASE_URL || env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
}

function validateEnvironment({ mode, env }) {
  const requiredNames =
    mode === "production"
      ? ["DATABASE_URL", "AUTH_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "CRON_SECRET"]
      : ["AUTH_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD_HASH"];
  const missing = getMissingNames(requiredNames, env);
  const warnings = [];
  const databaseUrl = getDatabaseUrl(mode, env);

  if (mode === "development" && !env.LOCAL_DATABASE_URL && !env.DATABASE_URL) {
    warnings.push(
      `No LOCAL_DATABASE_URL or DATABASE_URL set; using ${DEFAULT_LOCAL_DATABASE_URL}.`,
    );
  }

  return {
    databaseUrl,
    missing,
    mode,
    ok: missing.length === 0,
    warnings,
  };
}

function printResult(result) {
  for (const warning of result.warnings) {
    console.warn(`[config:check] warning: ${warning}`);
  }

  if (!result.ok) {
    console.error(
      `[config:check] missing required ${result.mode} env: ${result.missing.join(", ")}`,
    );
    return;
  }

  console.log(`[config:check] ${result.mode} env looks ready.`);
}

function main() {
  const mode = parseMode(process.argv.slice(2), process.env);
  const result = validateEnvironment({ mode, env: process.env });
  printResult(result);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

export { DEFAULT_LOCAL_DATABASE_URL, parseMode, validateEnvironment };
