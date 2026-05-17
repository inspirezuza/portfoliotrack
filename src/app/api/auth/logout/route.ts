import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  getExpiredAdminSessionCookieOptions
} from "@/lib/auth/admin";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.set(
    adminSessionCookieName,
    "",
    getExpiredAdminSessionCookieOptions()
  );
  return response;
}
