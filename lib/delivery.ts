import { Buffer } from "node:buffer";
import { db, invoice, settings, AppError, audit } from "./server";
import { generatePdf } from "./pdf";
import { nextReminder, type ReminderStage } from "./reminder-policy";
import { applyDeliveryEventsSql } from "./delivery-sql";
import { refreshInvoiceDeliveries } from "./email-sync";
export async function sendInvoice(user: string, id: string) {
  return deliver(user, id, "initial");
}
export async function sendReminder(
  user: string,
  id: string,
  stage: ReminderStage,
) {
  return deliver(user, id, `reminder-${stage}`);
}
async function deliver(user: string, id: string, kind: string) {
  const inv = await invoice(user, id);
  const config = settings();
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM)
    throw new AppError(
      "Email delivery is not connected yet. Download the PDF and share it yourself.",
      503,
    );
  if (inv.status !== "issued")
    throw new AppError("Only unpaid, issued invoices can be sent.");
  if (inv.sample)
    throw new AppError(
      "Sample invoices cannot be emailed. Create a real invoice first.",
    );
  if (!inv.data.customerEmail)
    throw new AppError(
      "This invoice has no client email. Void it and create a corrected invoice.",
    );
  if (kind !== "initial") {
    await refreshInvoiceDeliveries(user, id);
    const profile = await db()
      .prepare("SELECT data FROM businesses WHERE owner=?")
      .bind(user)
      .first<{ data: string }>();
    if (!profile || JSON.parse(profile.data).reminders !== true)
      throw new AppError("Reminders are turned off for this business.", 409);
    const attempts = await db()
      .prepare(
        "SELECT kind,status,created_at,delivered_at FROM deliveries WHERE owner=? AND invoice_id=?",
      )
      .bind(user, id)
      .all<{
        kind: string;
        status: string;
        created_at: string;
        delivered_at: string | null;
      }>();
    if (
      nextReminder(inv, attempts.results, new Date()) !== Number(kind.slice(-1))
    )
      throw new AppError(
        "This reminder is not due or an earlier email needs attention.",
        409,
      );
  }
  const deliveryId = `${id}:${kind}`;
  const now = new Date().toISOString();
  await db()
    .prepare(
      "INSERT OR IGNORE INTO deliveries(id,owner,invoice_id,kind,status,created_at) VALUES (?,?,?,?,'pending',?)",
    )
    .bind(deliveryId, user, id, kind, now)
    .run();
  const delivery = await db()
    .prepare("SELECT * FROM deliveries WHERE id=? AND owner=?")
    .bind(deliveryId, user)
    .first<{
      status: string;
      created_at: string;
      provider_id: string | null;
    }>();
  if (delivery?.provider_id)
    return { status: delivery.status, alreadySent: true };
  // Stop well before the provider's 24-hour idempotency window expires.
  if (Date.now() - Date.parse(delivery!.created_at) > 22 * 60 * 60 * 1000) {
    await db()
      .prepare(
        "UPDATE deliveries SET status='needs-review',error='Retry window expired; reconcile with the email provider' WHERE id=? AND owner=? AND provider_id IS NULL",
      )
      .bind(deliveryId, user)
      .run();
    throw new AppError(
      "This delivery needs manual reconciliation with the email provider before resending.",
      409,
    );
  }
  const cutoff = new Date(Date.now() - 90000).toISOString();
  const claimed = await db()
    .prepare(
      "UPDATE deliveries SET status='sending',attempted_at=?,error=NULL WHERE id=? AND owner=? AND (status IN ('pending','failed','unknown') OR (status='sending' AND attempted_at<?))",
    )
    .bind(now, deliveryId, user, cutoff)
    .run();
  if (!claimed.meta.changes)
    throw new AppError(
      "This invoice is already being sent. Check again shortly.",
      409,
    );
  try {
    const fresh = await invoice(user, id);
    if (fresh.status !== "issued")
      throw new AppError("Invoice status changed. Delivery cancelled.", 409);
    if (kind !== "initial") {
      const profile = await db()
        .prepare("SELECT data FROM businesses WHERE owner=?")
        .bind(user)
        .first<{ data: string }>();
      if (!profile || JSON.parse(profile.data).reminders !== true)
        throw new AppError(
          "Reminders were turned off. Delivery cancelled.",
          409,
        );
    }
    const bytes = await generatePdf(inv);
    const payload = {
      from: config.EMAIL_FROM,
      to: [inv.data.customerEmail],
      subject:
        kind === "initial"
          ? `Invoice ${inv.number} from ${inv.business!.name}`
          : `Payment reminder for invoice ${inv.number}`,
      text:
        kind === "initial"
          ? `Hello ${inv.data.customerName},\n\nPlease find invoice ${inv.number} attached.\n\nTotal: ${inv.data.currency} ${(inv.total / 100).toFixed(2)}\nDue date: ${inv.data.dueDate}\n\n${inv.data.paymentInstructions}\n\n${inv.data.notes}\n\n${inv.business!.name}`
          : `Hello ${inv.data.customerName},\n\nThis is a reminder that invoice ${inv.number} was due on ${inv.data.dueDate}. Our records show it as unpaid. If you have already paid, please disregard this message.\n\nTotal: ${inv.data.currency} ${(inv.total / 100).toFixed(2)}\n\n${inv.data.paymentInstructions}\n\n${inv.business!.name}`,
      attachments: [
        {
          filename: `${inv.number}.pdf`,
          content: Buffer.from(bytes).toString("base64"),
        },
      ],
    };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `invoice/${id}/${kind}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      await db()
        .prepare(
          "UPDATE deliveries SET status='failed',error=? WHERE id=? AND owner=?",
        )
        .bind(`Provider HTTP ${response.status}`, deliveryId, user)
        .run();
      throw new AppError(
        "Email was not confirmed. Check the email connection, then retry this same invoice.",
        502,
      );
    }
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw Error("Missing provider reference");
    await db().batch([
      db()
        .prepare(
          "UPDATE deliveries SET status='accepted',provider_id=?,error=NULL WHERE id=? AND owner=?",
        )
        .bind(data.id, deliveryId, user),
      db().prepare(applyDeliveryEventsSql).bind(data.id),
      audit(
        user,
        id,
        `${kind === "initial" ? "Invoice" : "Reminder"} ${inv.number} accepted by email provider`,
      ),
    ]);
    return { status: "accepted" };
  } catch (e) {
    await db()
      .prepare(
        "UPDATE deliveries SET status='unknown',error='Delivery not confirmed; retry with the same idempotency key' WHERE id=? AND owner=? AND status='sending'",
      )
      .bind(deliveryId, user)
      .run();
    throw e;
  }
}
