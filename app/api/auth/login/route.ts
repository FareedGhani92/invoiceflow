import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { setSession, verifyLogin } from "@/app/auth";
import { db } from "@/lib/server";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });

  const now = Date.now();
  const emailSecret = process.env.SESSION_SECRET || "invalid-setup";
  const clientAddress = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  const key = createHmac("sha256", emailSecret).update(clientAddress).digest("hex");
  const timestamp = new Date(now).toISOString();
  const resetAt = new Date(now + 15 * 60 * 1000).toISOString();
  await db().prepare("DELETE FROM auth_attempts WHERE reset_at<?").bind(new Date(now - 86400000).toISOString()).run();
  const rate = await db().prepare(
    "INSERT INTO auth_attempts(key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_attempts.reset_at<? THEN 1 ELSE auth_attempts.count+1 END,reset_at=CASE WHEN auth_attempts.reset_at<? THEN excluded.reset_at ELSE auth_attempts.reset_at END RETURNING count,reset_at",
  ).bind(key, resetAt, timestamp, timestamp).first<{ count: number; reset_at: string }>();
  if (Number(rate?.count) > 8) {
    const response = NextResponse.redirect(new URL("/login?error=wait", request.url), 303);
    response.headers.set("Retry-After", String(Math.max(1, Math.ceil((Date.parse(rate!.reset_at) - now) / 1000))));
    return response;
  }

  let email = "";
  let password = "";
  try {
    const form = await request.formData();
    email = String(form.get("email") ?? "");
    password = String(form.get("password") ?? "");
  } catch {
    return NextResponse.json({ error: "Please use the sign-in form." }, { status: 400 });
  }
  if (email.length > 320 || password.length > 1024) return NextResponse.json({ error: "Invalid sign-in details." }, { status: 400 });

  const user = await verifyLogin(email, password);
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }
  await db().prepare("DELETE FROM auth_attempts WHERE key=?").bind(key).run();
  await setSession(user);
  const requestedPath = new URL(request.url).searchParams.get("returnTo") || "/";
  let destination = new URL("/", request.url);
  try {
    const candidate = new URL(requestedPath, request.url);
    if (candidate.origin === new URL(request.url).origin) destination = candidate;
  } catch {
    // Keep the user on the app when the return path is malformed.
  }
  return NextResponse.redirect(destination, 303);
}
