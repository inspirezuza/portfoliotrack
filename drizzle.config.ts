import path from "node:path";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: path.join(".", "data", "portfolio.sqlite")
  }
} satisfies Config;
