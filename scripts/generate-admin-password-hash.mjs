import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

function readPasswordFromStdin() {
  try {
    return readFileSync(0, "utf8").trim();
  } catch {
    return "";
  }
}

const password = process.argv[2] ?? readPasswordFromStdin();

if (!password) {
  console.error("Usage: npm run auth:hash -- <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const hash = scryptSync(password, salt, 64).toString("base64url");

console.log(`scrypt$${salt}$${hash}`);
