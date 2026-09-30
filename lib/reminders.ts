import { db, invoiceRow, settings } from "./server";
import { sendReminder } from "./delivery";
import { nextReminder } from "./reminder-policy";
import { reminderCandidatesSql } from "./delivery-sql";
import { pollsEmailStatus, syncEmailStatuses } from "./email-sync";

export function remindersConfigured() {
  const config = settings();
  return !!(
    config.RESEND_API_KEY &&
    config.EMAIL_FROM &&
    (pollsEmailStatus() ||
      (config.EMAIL_STATUS_MODE === "webhook" &&
        config.RESEND_WEBHOOK_SECRET)) &&
    ((config.REMINDER_JOB_SECRET && config.REMINDER_JOB_SECRET.length >= 32) ||
      (config.VERCEL === "1" && config.CRON_SECRET && config.CRON_SECRET.length >= 32)) &&
    config.REMINDER_SCHEDULER_ENABLED === "true"
  );
}

export async function reminderSchedulerStatus() {
  const state = await db()
    .prepare(
      "SELECT last_run_at,last_error FROM automation_state WHERE name='reminders'",
    )
    .first<{ last_run_at: string | null; last_error: string | null }>();
  const configured = remindersConfigured();
  const lastRunAt = state?.last_run_at || null;
  return {
    configured,
    ready:
      configured &&
      !!lastRunAt &&
      Date.now() - Date.parse(lastRunAt) <
        (process.env.VERCEL === "1" ? 26 * 3600000 : 45 * 60000),
    lastRunAt,
    lastError: state?.last_error || null,
  };
}

/** One bounded batch per scheduler invocation. A later run picks up the rest. */
export async function dispatchDueReminders(now = new Date()) {
  const emailSync = await syncEmailStatuses();
  const cutoff = new Date(now.getTime() - 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const state = await db()
    .prepare("SELECT cursor FROM automation_state WHERE name='reminders'")
    .first<{ cursor: string }>();
  let cursor = state?.cursor || "";
  await db()
    .prepare(
      "UPDATE deliveries SET status='needs-review',error='Retry window expired; reconcile with the email provider' WHERE kind LIKE 'reminder-%' AND status IN ('pending','failed','unknown','sending') AND created_at<?",
    )
    .bind(new Date(now.getTime() - 22 * 3600000).toISOString())
    .run();
  let rows = await db()
    .prepare(reminderCandidatesSql)
    .bind(cursor, cutoff)
    .all<Record<string, unknown>>();
  if (!rows.results.length && cursor) {
    cursor = "";
    rows = await db()
      .prepare(reminderCandidatesSql)
      .bind(cursor, cutoff)
      .all<Record<string, unknown>>();
  }
  const grouped = new Map<
    string,
    {
      owner: string;
      row: Record<string, unknown>;
      attempts: {
        kind: string;
        status: string;
        created_at: string;
        delivered_at: string | null;
      }[];
    }
  >();
  for (const row of rows.results) {
    const id = String(row.id);
    if (!grouped.has(id))
      grouped.set(id, { owner: String(row.owner), row, attempts: [] });
    if (row.attempt_kind)
      grouped.get(id)!.attempts.push({
        kind: String(row.attempt_kind),
        status: String(row.attempt_status),
        created_at: String(row.attempt_created_at),
        delivered_at: row.attempt_delivered_at
          ? String(row.attempt_delivered_at)
          : null,
      });
  }
  let attempted = 0,
    accepted = 0,
    failed = 0;
  let inspected = 0;
  for (const [id, item] of grouped) {
    const stage = nextReminder(invoiceRow(item.row), item.attempts, now);
    if (stage && attempted >= 1) break;
    cursor = id;
    inspected++;
    if (!stage) continue;
    attempted++;
    try {
      const result = await sendReminder(item.owner, id, stage);
      if (result.status === "accepted") accepted++;
    } catch (error) {
      failed++;
      console.error(
        "Reminder dispatch failed",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
  if (inspected === grouped.size && grouped.size < 100) cursor = "";
  await db()
    .prepare(
      "INSERT INTO automation_state(name,cursor,last_run_at,last_error) VALUES ('reminders',?,?,?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor,last_run_at=excluded.last_run_at,last_error=excluded.last_error",
    )
    .bind(
      cursor,
      now.toISOString(),
      failed || emailSync.failed
        ? "Some email checks or reminder attempts need attention."
        : null,
    )
    .run();
  return {
    inspected,
    attempted,
    accepted,
    failed,
    emailChecks: emailSync.checked,
    emailCheckFailures: emailSync.failed,
  };
}
