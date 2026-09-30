import { db, settings } from "./server";
import { retrieveEmailEvent } from "./email-provider";
import { applyDeliveryEventsSql } from "./delivery-sql";

export function pollsEmailStatus() {
  return (settings().EMAIL_STATUS_MODE || "poll") === "poll";
}
async function refresh(providerId: string) {
  const event = await retrieveEmailEvent(
    providerId,
    settings().RESEND_API_KEY!,
  );
  if (!event) return;
  await db().batch([
    db()
      .prepare(
        "INSERT OR IGNORE INTO delivery_events(id,provider_id,type,received_at) VALUES (?,?,?,?)",
      )
      .bind(
        `poll:${providerId}:${event}`,
        providerId,
        event,
        new Date().toISOString(),
      ),
    db().prepare(applyDeliveryEventsSql).bind(providerId),
  ]);
}
export async function refreshInvoiceDeliveries(
  owner: string,
  invoiceId: string,
) {
  if (!pollsEmailStatus()) return;
  const rows = await db()
    .prepare(
      "SELECT provider_id FROM deliveries WHERE owner=? AND invoice_id=? AND provider_id IS NOT NULL AND status IN ('accepted','delivered') ORDER BY created_at DESC LIMIT 4",
    )
    .bind(owner, invoiceId)
    .all<{ provider_id: string }>();
  for (const [index, row] of rows.results.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 550));
    await refresh(row.provider_id);
  }
}

/** Rotate through outstanding delivery records so early pending emails cannot starve later ones. */
export async function syncEmailStatuses() {
  if (!pollsEmailStatus()) return { checked: 0, failed: 0 };
  const previous = await db()
    .prepare("SELECT cursor FROM automation_state WHERE name='email-status'")
    .first<{ cursor: string }>();
  let cursor = previous?.cursor || "";
  const query =
    "SELECT d.id,d.provider_id FROM deliveries d JOIN invoices i ON i.id=d.invoice_id AND i.owner=d.owner WHERE d.id>? AND d.provider_id IS NOT NULL AND d.status IN ('accepted','delivered') AND i.status='issued' AND i.sample=0 ORDER BY d.id LIMIT 3";
  let rows = await db()
    .prepare(query)
    .bind(cursor)
    .all<{ id: string; provider_id: string }>();
  if (!rows.results.length && cursor) {
    cursor = "";
    rows = await db()
      .prepare(query)
      .bind(cursor)
      .all<{ id: string; provider_id: string }>();
  }
  let failed = 0;
  for (const [index, row] of rows.results.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 550));
    try {
      await refresh(row.provider_id);
    } catch {
      failed++;
    }
    cursor = row.id;
  }
  if (rows.results.length < 3) cursor = "";
  await db()
    .prepare(
      "INSERT INTO automation_state(name,cursor,last_run_at,last_error) VALUES ('email-status',?,?,?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor,last_run_at=excluded.last_run_at,last_error=excluded.last_error",
    )
    .bind(
      cursor,
      new Date().toISOString(),
      failed ? "Some email statuses could not be checked." : null,
    )
    .run();
  return { checked: rows.results.length, failed };
}
