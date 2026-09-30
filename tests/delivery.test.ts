import test from "node:test";
import { retrieveEmailEvent } from "../lib/email-provider";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  applyDeliveryEventsSql,
  reminderCandidatesSql,
} from "../lib/delivery-sql";

function database() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((s) => s.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  return db;
}
test("email status polling never treats sent as delivered and checks provider identity", async () => {
  const pending: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails/provider-id");
    assert.notEqual(init?.method, "POST");
    return Response.json({ id: "provider-id", last_event: "sent" });
  };
  assert.equal(
    await retrieveEmailEvent("provider-id", "test-key", pending),
    null,
  );
  const delivered: typeof fetch = async () =>
    Response.json({ id: "provider-id", last_event: "delivered" });
  assert.equal(
    await retrieveEmailEvent("provider-id", "test-key", delivered),
    "email.delivered",
  );
  const complained: typeof fetch = async () =>
    Response.json({ id: "provider-id", last_event: "complained" });
  assert.equal(
    await retrieveEmailEvent("provider-id", "test-key", complained),
    "email.complained",
  );
  const mismatch: typeof fetch = async () =>
    Response.json({ id: "another-id", last_event: "delivered" });
  await assert.rejects(
    () => retrieveEmailEvent("provider-id", "test-key", mismatch),
    /did not match/,
  );
  const limited: typeof fetch = async () =>
    new Response("rate limited", { status: 429 });
  await assert.rejects(
    () => retrieveEmailEvent("provider-id", "test-key", limited),
    /429/,
  );
});
function addInvoice(
  db: DatabaseSync,
  id: string,
  owner = "on",
  status = "issued",
  sample = 0,
) {
  db.prepare(
    "INSERT INTO invoices(id,owner,status,sample,data,total,created_at) VALUES (?,?,?,?,?,10000,'2026-09-01T00:00:00Z')",
  ).run(
    id,
    owner,
    status,
    sample,
    JSON.stringify({
      dueDate: "2026-09-01",
      customerEmail: "client@example.test",
    }),
  );
  db.prepare(
    "INSERT INTO deliveries(id,owner,invoice_id,kind,status,created_at,delivered_at) VALUES (?,?,?,'initial','delivered','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')",
  ).run(`${id}:initial`, owner, id);
}
test("reminder query excludes opted-out, paid, sample, and mismatched-owner deliveries", () => {
  const db = database();
  try {
    db.prepare("INSERT INTO businesses(owner,data) VALUES (?,?)").run(
      "on",
      '{"reminders":true}',
    );
    db.prepare("INSERT INTO businesses(owner,data) VALUES (?,?)").run(
      "off",
      '{"reminders":false}',
    );
    addInvoice(db, "eligible");
    addInvoice(db, "paid", "on", "paid");
    addInvoice(db, "sample", "on", "issued", 1);
    addInvoice(db, "off", "off");
    addInvoice(db, "mismatch");
    db.prepare(
      "UPDATE deliveries SET owner='off' WHERE invoice_id='mismatch'",
    ).run();
    assert.deepEqual(
      db
        .prepare(reminderCandidatesSql)
        .all("", "2026-09-10")
        .map((r) => r.id),
      ["eligible"],
    );
  } finally {
    db.close();
  }
});
test("reminder cursor advances and pages retain each invoice's full delivery history", () => {
  const db = database();
  try {
    db.prepare(
      "INSERT INTO businesses(owner,data) VALUES ('on','{\"reminders\":true}')",
    ).run();
    for (let i = 0; i < 101; i++) {
      const id = String(i).padStart(3, "0");
      addInvoice(db, id);
      db.prepare(
        "INSERT INTO deliveries(id,owner,invoice_id,kind,status,created_at) VALUES (?,'on',?,'reminder-1','needs-review','2026-09-04T00:00:00Z')",
      ).run(`${id}:reminder-1`, id);
    }
    const first = db.prepare(reminderCandidatesSql).all("", "2026-09-10");
    assert.equal(first.length, 200);
    assert.equal(new Set(first.map((r) => r.id)).size, 100);
    const second = db.prepare(reminderCandidatesSql).all("099", "2026-09-10");
    assert.deepEqual(
      second.map((r) => r.id),
      ["100", "100"],
    );
  } finally {
    db.close();
  }
});
test("an early webhook survives the send response and bounce never regresses", () => {
  const db = database();
  try {
    addInvoice(db, "invoice");
    db.prepare(
      "UPDATE deliveries SET status='sending',provider_id=NULL,delivered_at=NULL WHERE invoice_id='invoice'",
    ).run();
    const receipt = db.prepare(
      "INSERT OR IGNORE INTO delivery_events(id,provider_id,type,received_at) VALUES (?,'provider',?,?)",
    );
    receipt.run("event1", "email.delivered", "2026-09-02T01:00:00Z");
    db.prepare(applyDeliveryEventsSql).run("provider");
    db.prepare(
      "UPDATE deliveries SET status='accepted',provider_id='provider' WHERE invoice_id='invoice'",
    ).run();
    db.prepare(applyDeliveryEventsSql).run("provider");
    assert.equal(
      db.prepare("SELECT status FROM deliveries").get()!.status,
      "delivered",
    );
    receipt.run("event1", "email.delivered", "2026-09-03T01:00:00Z");
    receipt.run("event2", "email.bounced", "2026-09-03T02:00:00Z");
    receipt.run("event3", "email.delivered", "2026-09-03T03:00:00Z");
    db.prepare(applyDeliveryEventsSql).run("provider");
    const row = db.prepare("SELECT status,delivered_at FROM deliveries").get()!;
    assert.equal(row.status, "bounced");
    assert.equal(row.delivered_at, "2026-09-02T01:00:00Z");
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM delivery_events").get()!.total,
      3,
    );
  } finally {
    db.close();
  }
});
