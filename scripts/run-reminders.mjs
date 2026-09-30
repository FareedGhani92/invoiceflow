import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
if (args.some((arg) => !["--watch", "--check"].includes(arg))) {
  console.error("Use --check to check setup, or --watch to run every 15 minutes.");
  process.exit(1);
}
const required = ["RESEND_API_KEY", "EMAIL_FROM", "REMINDER_JOB_SECRET"];
if (process.env.EMAIL_STATUS_MODE === "webhook") required.push("RESEND_WEBHOOK_SECRET");
const missing = required.filter((key) => !process.env[key]?.trim());
if (!["poll", "webhook"].includes(process.env.EMAIL_STATUS_MODE || "poll")) missing.push("EMAIL_STATUS_MODE=poll or webhook");
if ((process.env.REMINDER_JOB_SECRET || "").length < 32 && !missing.includes("REMINDER_JOB_SECRET"))
  missing.push("REMINDER_JOB_SECRET (at least 32 characters)");
if (process.env.REMINDER_SCHEDULER_ENABLED !== "true")
  missing.push("REMINDER_SCHEDULER_ENABLED=true");
if (missing.length) {
  console.error(`Reminder service is off. Configure these entries in .env: ${missing.join(", ")}.`);
  process.exit(1);
}
const base = new URL(process.env.INVOICEFLOW_BASE_URL || "http://127.0.0.1:5173/");
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.username || base.password) {
  console.error("This local runner only connects to an HTTP loopback address.");
  process.exit(1);
}
if (args.includes("--check")) {
  console.log("Local reminder configuration is present. Live delivery has not been tested.");
  process.exit(0);
}
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop.abort());
console.log("Local reminder service started. Only opted-in, eligible invoices can be emailed.");
do {
  try {
    const response = await fetch(new URL("/api/jobs/reminders", base), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.REMINDER_JOB_SECRET}` },
      redirect: "error",
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(90000)]),
    });
    if (!response.ok) throw new Error(`Workspace returned HTTP ${response.status}. Check the app and .env configuration.`);
    const result = await response.json();
    console.log(`${new Date().toISOString()} · checked ${result.inspected}, attempted ${result.attempted}, accepted ${result.accepted}, failed ${result.failed}, email check failures ${result.emailCheckFailures}`);
  } catch (error) {
    if (stop.signal.aborted) break;
    console.error(error instanceof Error ? error.message : "Reminder check failed.");
    if (!args.includes("--watch")) process.exitCode = 1;
  }
  if (!args.includes("--watch") || stop.signal.aborted) break;
  try { await delay(15 * 60000, undefined, { signal: stop.signal }); } catch { break; }
} while (!stop.signal.aborted);
