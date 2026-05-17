import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  createAdminSessionCookieValue,
  getAdminSessionCookieOptions,
  verifyAdminCredentials
} from "@/lib/auth/admin";

function getSafeRedirect(request: Request, value: string | null) {
  const requestUrl = new URL(request.url);
  const target = value?.trim() || "/transactions";
  const candidate = new URL(target, requestUrl);

  if (
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\") &&
    candidate.origin === requestUrl.origin
  ) {
    return new URL(`${candidate.pathname}${candidate.search}${candidate.hash}`, requestUrl);
  }

  return new URL("/transactions", requestUrl);
}

async function parseLoginRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;

    return {
      username: typeof body.username === "string" ? body.username : "",
      password: typeof body.password === "string" ? body.password : "",
      next: typeof body.next === "string" ? body.next : null,
      expectsJson: true
    };
  }

  const formData = await request.formData();

  return {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? ""),
    expectsJson: false
  };
}

export async function POST(request: Request) {
  const login = await parseLoginRequest(request);
  const isValid = await verifyAdminCredentials(login.username, login.password);

  if (!isValid) {
    if (login.expectsJson) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid admin username or password."
          }
        },
        { status: 401 }
      );
    }

    const redirectUrl = getSafeRedirect(request, "/login");
    redirectUrl.searchParams.set("error", "invalid");
    redirectUrl.searchParams.set("next", login.next || "/transactions");
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  const cookieValue = createAdminSessionCookieValue(login.username);
  const sessionPayload = JSON.parse(Buffer.from(cookieValue.split(".")[0], "base64url").toString("utf8")) as {
    expiresAt: number;
  };

  if (login.expectsJson) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      adminSessionCookieName,
      cookieValue,
      getAdminSessionCookieOptions(new Date(sessionPayload.expiresAt))
    );
    return response;
  }

  const response = NextResponse.redirect(getSafeRedirect(request, login.next), { status: 303 });
  response.cookies.set(
    adminSessionCookieName,
    cookieValue,
    getAdminSessionCookieOptions(new Date(sessionPayload.expiresAt))
  );
  return response;
}
