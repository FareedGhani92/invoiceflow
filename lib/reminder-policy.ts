import type { Invoice } from "./invoice";

export type ReminderStage = 1 | 2 | 3;
export const REMINDER_DAYS: Record<ReminderStage, number> = {
  1: 3,
  2: 10,
  3: 17,
};

type Attempt = {
  kind: string;
  status: string;
  created_at: string;
  delivered_at?: string | null;
};

/** One reminder at most every seven days, with no catch-up burst. */
export function nextReminder(
  invoice: Pick<Invoice, "status" | "sample" | "data">,
  attempts: Attempt[],
  now: Date,
): ReminderStage | null {
  if (
    invoice.status !== "issued" ||
    invoice.sample ||
    !invoice.data.customerEmail
  )
    return null;
  const original = attempts.find(
    (a) => a.kind === "initial" && a.status === "delivered",
  );
  const originalDeliveredAt = Date.parse(original?.delivered_at || "");
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(originalDeliveredAt) ||
    now.getTime() - originalDeliveredAt < 3 * 86400000
  )
    return null;
  if (
    attempts.some((a) =>
      ["bounced", "blocked", "needs-review"].includes(a.status),
    )
  )
    return null;
  const due = Date.parse(`${invoice.data.dueDate}T00:00:00Z`);
  if (!Number.isFinite(due)) return null;
  for (const stage of [1, 2, 3] as const) {
    const kind = `reminder-${stage}`;
    const existing = attempts.find((a) => a.kind === kind);
    if (existing) {
      if (["pending", "failed", "unknown", "sending"].includes(existing.status))
        return stage;
      if (existing.status !== "delivered") return null;
      continue;
    }
    if (now.getTime() < due + REMINDER_DAYS[stage] * 86400000) return null;
    const last = attempts
      .filter((a) => a.kind.startsWith("reminder-"))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const lastDeliveredAt = Date.parse(last?.delivered_at || "");
    if (
      last &&
      (!Number.isFinite(lastDeliveredAt) ||
        now.getTime() - lastDeliveredAt < 7 * 86400000)
    )
      return null;
    return stage;
  }
  return null;
}
