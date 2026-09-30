import { createHmac, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const scrypt = promisify(scryptCallback);
const COOKIE = "invoiceflow_session";
const LIFETIME = 60 * 60 * 24 * 7;
const publicDemoUser: AppUser = {
  userId: "public-demo",
  displayName: "InvoiceFlow Demo",
  email: "demo@invoiceflow.local",
  fullName: "InvoiceFlow Demo",
};

export function isPublicDemo() {
  return process.env.PUBLIC_DEMO_MODE !== "false";
}

export type AppUser = { userId: string; displayName: string; email: string; fullName: string | null };
type Session = AppUser & { exp: number };

export async function getUser(): Promise<AppUser | null> {
  // Public portfolio mode intentionally shares one fictional demo workspace.
  // Set PUBLIC_DEMO_MODE=false to restore the private sign-in flow.
  if (isPublicDemo()) return publicDemoUser;

  const raw = (await cookies()).get(COOKIE)?.value;
  const session = raw ? readSession(raw) : null;
  if (session && session.exp > Math.floor(Date.now() / 1000)) {
    const configuredEmail = process.env.APP_LOGIN_EMAIL?.trim().toLowerCase();
    if (configuredEmail && session.userId === configuredEmail && session.email === configuredEmail)
      return session;
  }

  const host = (await headers()).get("host")?.split(":")[0];
  if (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(host ?? "")) {
    return { userId: "local-preview-user", displayName: "InvoiceFlow Preview", email: "preview@invoiceflow.local", fullName: "InvoiceFlow Preview" };
  }
  return null;
}

export async function requireUser(returnTo: string): Promise<AppUser> {
  const user = await getUser();
  if (user) return user;
  redirect(`/login?returnTo=${encodeURIComponent(safePath(returnTo))}`);
}

export async function verifyLogin(email: string, password: string): Promise<AppUser | null> {
  const expectedEmail = process.env.APP_LOGIN_EMAIL?.trim().toLowerCase();
  const encodedHash = process.env.APP_LOGIN_PASSWORD_HASH;
  const secret = process.env.SESSION_SECRET;
  if (!expectedEmail || !encodedHash || !secret || secret.length < 32) return null;
  const [scheme, salt, digest] = encodedHash.split("$");
  if (scheme !== "scrypt" || !/^[a-f\d]{32,128}$/i.test(salt ?? "") || !/^[a-f\d]{128}$/i.test(digest ?? "")) return null;
  const givenEmail = Buffer.from(email.trim().toLowerCase());
  const configuredEmail = Buffer.from(expectedEmail);
  const emailMatches = givenEmail.length === configuredEmail.length && timingSafeEqual(givenEmail, configuredEmail);
  const calculated = (await scrypt(password, Buffer.from(salt, "hex"), 64)) as Buffer;
  const expected = Buffer.from(digest, "hex");
  if (!emailMatches || !timingSafeEqual(calculated, expected)) return null;
  return { userId: expectedEmail, email: expectedEmail, displayName: expectedEmail, fullName: null };
}

export async function setSession(user: AppUser) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  const payload: Session = { ...user, exp: Math.floor(Date.now() / 1000) + LIFETIME };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  (await cookies()).set(COOKIE, `${encoded}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LIFETIME,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

function readSession(raw: string): Session | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  const [encoded, supplied] = raw.split(".");
  if (!encoded || !supplied) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const providedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Session;
    if (!value.userId || !value.email || !value.displayName || !Number.isFinite(value.exp)) return null;
    return value;
  } catch {
    return null;
  }
}

function safePath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://invoiceflow.invalid");
    return url.origin === "https://invoiceflow.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
