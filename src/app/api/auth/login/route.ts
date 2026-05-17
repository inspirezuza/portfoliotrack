import { NextResponse } from "next/server";
import {
  adminSessionCookieName,
  createAdminSessionCookieValue,
  getAdminSessionCookieOptions,
  verifyAdminCredentials
} from "@/lib/auth/admin";

function getSafeRedirectPath(value: string | null) {
  const target = value?.trim() || "/transactions";

  if (
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\")
  ) {
    return target;
  }

  return "/transactions";
}

function redirectResponse(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location
    }
  });
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

    const redirectUrl = new URLSearchParams({
      error: "invalid",
      next: getSafeRedirectPath(login.next)
    });

    return redirectResponse(`/login?${redirectUrl.toString()}`);
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

  const response = redirectResponse(getSafeRedirectPath(login.next));
  response.cookies.set(
    adminSessionCookieName,
    cookieValue,
    getAdminSessionCookieOptions(new Date(sessionPayload.expiresAt))
  );
  return response;
}
