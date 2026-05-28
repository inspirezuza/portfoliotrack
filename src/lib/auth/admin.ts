import "server-only";

import { scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE_NAME = "portfoliotrack.admin";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AdminSessionPayload = {
  username: string;
  expiresAt: number;
};

export type AdminSession = {
  username: string;
  expiresAt: Date;
};

export const adminSessionCookieName = SESSION_COOKIE_NAME;

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? null;
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parsePasswordHash(value: string) {
  const [algorithm, salt, hash] = value.split("$");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return null;
  }

  return { salt, hash };
}

export async function verifyAdminCredentials(username: string, password: string) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (!expectedUsername || !passwordHash || !safeEqual(username, expectedUsername)) {
    return false;
  }

  const parsedHash = parsePasswordHash(passwordHash);

  if (parsedHash == null) {
    return false;
  }

  const candidateHash = (await scryptAsync(password, parsedHash.salt, 64)) as Buffer;

  return safeEqual(candidateHash.toString("base64url"), parsedHash.hash);
}

export function createAdminSessionCookieValue(username: string, now = Date.now()) {
  const secret = getAuthSecret();

  if (!secret) {
    throw new Error("AUTH_SECRET is required to create an admin session.");
  }

  const payload: AdminSessionPayload = {
    username,
    expiresAt: now + SESSION_TTL_MS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

function verifySessionCookieValue(value: string | undefined): AdminSession | null {
  const secret = getAuthSecret();

  if (!value || !secret) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");

  if (!encodedPayload || !signature || !safeEqual(signature, signValue(encodedPayload, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<AdminSessionPayload>;

    if (
      typeof payload.username !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      username: payload.username,
      expiresAt: new Date(payload.expiresAt),
    };
  } catch {
    return null;
  }
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return verifySessionCookieValue(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function isAdminAuthenticated() {
  return (await getAdminSession()) != null;
}

export function getAdminSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function getExpiredAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  };
}

export async function requireAdmin() {
  const session = await getAdminSession();

  if (session == null) {
    throw new Error("ADMIN_REQUIRED");
  }

  return session;
}
