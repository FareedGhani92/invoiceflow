import { z } from "zod";
import {
  owner,
  db,
  business,
  invoice,
  invoiceRow,
  audit,
  body,
  errorResponse,
  AppError,
  settings,
  isPublicDemo,
} from "@/lib/server";
import {
  invoiceSchema,
  businessSchema,
  customerSchema,
  calculate,
} from "@/lib/invoice";
import { reminderSchedulerStatus } from "@/lib/reminders";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await owner();
    const b = await business(user);
    const [rows, clients, events] = await Promise.all([
      db()
        .prepare(
          "SELECT i.*, (SELECT d.status FROM deliveries d WHERE d.invoice_id=i.id AND d.owner=i.owner ORDER BY d.created_at DESC LIMIT 1) AS delivery FROM invoices i WHERE owner=? ORDER BY created_at DESC LIMIT 500",
        )
        .bind(user)
        .all(),
      db()
        .prepare(
          "SELECT id,data FROM customers WHERE owner=? ORDER BY json_extract(data,'$.name') LIMIT 500",
        )
        .bind(user)
        .all<{ id: string; data: string }>(),
      db()
        .prepare(
          "SELECT id,invoice_id,message,created_at FROM activities WHERE owner=? ORDER BY created_at DESC LIMIT 20",
        )
        .bind(user)
        .all(),
    ]);
    const env = settings();
    const scheduler = await reminderSchedulerStatus();
    return Response.json(
      {
        business: b,
        invoices: rows.results.map(invoiceRow),
        customers: clients.results.map((c) => ({
          id: c.id,
          ...JSON.parse(c.data),
        })),
        activities: events.results.map((e) => ({
          id: e.id,
          invoiceId: e.invoice_id,
          message: e.message,
          createdAt: e.created_at,
        })),
        integrations: {
          ai: !isPublicDemo() && !!env.OPENAI_API_KEY,
          email: !isPublicDemo() && !!env.RESEND_API_KEY && !!env.EMAIL_FROM,
          reminders: !isPublicDemo() && scheduler.ready,
        },
        reminderScheduler: isPublicDemo()
          ? { configured: false, lastRunAt: null, lastError: null }
          : scheduler,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const user = await owner();
    const input = await body(req);
    const b = await business(user);
    const action = z.string().parse(input.action);
    if (action === "save-business") {
      const data = businessSchema.parse(input.data);
      if (isPublicDemo() && data.reminders)
        throw new AppError("Automatic reminders are disabled in the public demo.");
      if (
        data.reminders &&
        !b.reminders &&
        !(await reminderSchedulerStatus()).ready
      )
        throw new AppError(
          "Connect email and the reminder scheduler before enabling reminders.",
        );
      await db()
        .prepare("UPDATE businesses SET data=? WHERE owner=?")
        .bind(JSON.stringify(data), user)
        .run();
      return Response.json({ ok: true });
    }
    if (action === "save-customer") {
      const data = customerSchema.parse(input.data);
      if (input.id) {
        const id = z.string().uuid().parse(input.id);
        const result = await db()
          .prepare("UPDATE customers SET data=? WHERE id=? AND owner=?")
          .bind(JSON.stringify(data), id, user)
          .run();
        if (!result.meta.changes) throw new AppError("Client not found.", 404);
        return Response.json({ id });
      }
      const id = crypto.randomUUID();
      await db()
        .prepare("INSERT INTO customers(id,owner,data) VALUES (?,?,?)")
        .bind(id, user, JSON.stringify(data))
        .run();
      return Response.json({ id });
    }
    if (action === "save-invoice") {
      const data = invoiceSchema.parse(input.data);
      const total = calculate(data).total;
      if (input.id) {
        const id = z.string().uuid().parse(input.id);
        const current = await invoice(user, id);
        if (current.status !== "draft")
          throw new AppError(
            "Issued invoices are locked. Create a new draft to make changes.",
            409,
          );
        const revision = z.number().int().positive().parse(input.revision);
        const result = await db()
          .prepare(
            "UPDATE invoices SET data=?,total=?,revision=revision+1 WHERE id=? AND owner=? AND status='draft' AND revision=?",
          )
          .bind(JSON.stringify(data), total, id, user, revision)
          .run();
        if (!result.meta.changes)
          throw new AppError(
            "This invoice changed in another window. Close and reopen it before editing.",
            409,
          );
        await audit(user, id, "Draft updated").run();
        return Response.json({ invoice: await invoice(user, id) });
      }
      const id = crypto.randomUUID();
      await db().batch([
        db()
          .prepare(
            "INSERT INTO invoices(id,owner,data,total,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(
            id,
            user,
            JSON.stringify(data),
            total,
            new Date().toISOString(),
          ),
        audit(user, id, `Draft created for ${data.customerName}`),
      ]);
      return Response.json({ invoice: await invoice(user, id) });
    }
    const id = z.string().uuid().parse(input.id);
    const current = await invoice(user, id);
    if (action === "issue") {
      if (current.status !== "draft")
        return Response.json({ invoice: current });
      if (b.name === "Your studio" || !b.email)
        throw new AppError(
          "Add your business name and email in Settings before issuing an invoice.",
        );
      const revision = z.number().int().positive().parse(input.revision);
      const result = await db().batch([
        db()
          .prepare(
            "UPDATE businesses SET next_number=next_number+1 WHERE owner=?",
          )
          .bind(user),
        db()
          .prepare(
            "UPDATE invoices SET status='issued',number=(SELECT json_extract(data,'$.prefix')||'-'||next_number FROM businesses WHERE owner=?),business=?,revision=revision+1 WHERE id=? AND owner=? AND status='draft' AND revision=?",
          )
          .bind(user, JSON.stringify(b), id, user, revision),
      ]);
      if (!result[1].meta.changes)
        throw new AppError(
          "This draft changed. Reopen it to review before issuing.",
          409,
        );
      await audit(user, id, "Invoice issued and details locked").run();
      return Response.json({ invoice: await invoice(user, id) });
    }
    if (action === "mark-paid") {
      if (current.status === "paid") return Response.json({ invoice: current });
      if (current.status !== "issued")
        throw new AppError("Only issued invoices can be marked as paid.");
      const result = await db()
        .prepare(
          "UPDATE invoices SET status='paid',paid_at=?,revision=revision+1 WHERE id=? AND owner=? AND status='issued'",
        )
        .bind(new Date().toISOString(), id, user)
        .run();
      if (result.meta.changes)
        await audit(
          user,
          id,
          `Payment of ${current.data.currency} ${(current.total / 100).toFixed(2)} recorded manually`,
        ).run();
      return Response.json({ invoice: await invoice(user, id) });
    }
    if (action === "void") {
      if (current.status !== "issued")
        throw new AppError("Only unpaid issued invoices can be voided.");
      const result = await db()
        .prepare(
          "UPDATE invoices SET status='void',revision=revision+1 WHERE id=? AND owner=? AND status='issued'",
        )
        .bind(id, user)
        .run();
      if (result.meta.changes) await audit(user, id, "Invoice voided").run();
      return Response.json({ invoice: await invoice(user, id) });
    }
    if (action === "delete-draft") {
      if (current.status !== "draft")
        throw new AppError("Only drafts can be deleted.");
      await db().batch([
        db()
          .prepare(
            "DELETE FROM invoices WHERE id=? AND owner=? AND status='draft'",
          )
          .bind(id, user),
        audit(user, id, "Draft deleted"),
      ]);
      return Response.json({ ok: true });
    }
    throw new AppError("Unknown action.");
  } catch (e) {
    return errorResponse(e);
  }
}
