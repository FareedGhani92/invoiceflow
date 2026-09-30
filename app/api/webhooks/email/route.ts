import { Buffer } from "node:buffer";
import { settings, db, AppError, errorResponse } from "@/lib/server";
import { z } from "zod";
import { applyDeliveryEventsSql } from "@/lib/delivery-sql";
export async function POST(req: Request) {
  try {
    const secret = settings().RESEND_WEBHOOK_SECRET;
    if (!secret) throw new AppError("Webhook not configured.", 503);
    const id = req.headers.get("svix-id"),
      timestamp = req.headers.get("svix-timestamp"),
      signature = req.headers.get("svix-signature");
    if (
      !id ||
      !timestamp ||
      !signature ||
      !/^\d+$/.test(timestamp) ||
      !Number.isFinite(Number(timestamp)) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    )
      throw new AppError("Invalid webhook.", 401);
    const raw = await req.text();
    if (raw.length > 64000) throw new AppError("Payload too large.", 413);
    const key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(secret.replace(/^whsec_/, ""), "base64"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    let verified = false;
    for (const candidate of signature.split(" ")) {
      const [version, sig] = candidate.split(",");
      if (
        version === "v1" &&
        sig &&
        (await crypto.subtle.verify(
          "HMAC",
          key,
          Buffer.from(sig, "base64"),
          new TextEncoder().encode(`${id}.${timestamp}.${raw}`),
        ))
      )
        verified = true;
    }
    if (!verified) throw new AppError("Invalid signature.", 401);
    const event = z
      .object({
        type: z.string(),
        data: z.object({ email_id: z.string().min(1).max(200) }),
      })
      .parse(JSON.parse(raw));
    if (
      [
        "email.delivered",
        "email.bounced",
        "email.complained",
        "email.suppressed",
        "email.failed",
        "email.canceled",
      ].includes(event.type)
    )
      await db().batch([
        db()
          .prepare(
            "INSERT OR IGNORE INTO delivery_events(id,provider_id,type,received_at) VALUES (?,?,?,?)",
          )
          .bind(id, event.data.email_id, event.type, new Date().toISOString()),
        db().prepare(applyDeliveryEventsSql).bind(event.data.email_id),
      ]);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
