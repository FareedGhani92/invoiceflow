import { NextResponse } from "next/server";
import { clearSession } from "@/app/auth";

export async function GET(request: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/login", request.url));
}
