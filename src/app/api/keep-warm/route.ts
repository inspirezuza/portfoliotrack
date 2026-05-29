import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/runtime";

export const dynamic = "force-dynamic";

function getCronSecret() {
  const secret = process.env.CRON_SECRET?.trim();

  return secret === "" ? undefined : secret;
}

/**
 * Lightweight DB ping used to keep the Neon compute from scaling to zero so the
 * next real visitor avoids a cold start. Runs a trivial `SELECT 1` and nothing
 * else. Authorised the same way as the other cron endpoints (Bearer CRON_SECRET),
 * which Vercel Cron sends automatically and an external pinger can supply via the
 * Authorization header.
 *
 * Neon free tier note: keeping the compute warm consumes the monthly compute-hour
 * quota (~191h). Schedule the pinger only over the hours people actually use the
 * app rather than 24/7 — see .github/workflows/keep-warm.yml.
 */
export async function GET(request: Request) {
  const secret = getCronSecret();

  if (secret == null) {
    return NextResponse.json(
      { error: { code: "CRON_SECRET_MISSING", message: "CRON_SECRET is not configured." } },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Keep-warm authorization failed." } },
      { status: 401 },
    );
  }

  try {
    await db.execute(sql`SELECT 1`);

    return NextResponse.json({ ok: true, warmedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Keep-warm ping failed", error);

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Keep-warm ping failed." } },
      { status: 500 },
    );
  }
}
