import { rawDb } from "@/db";
import { getUser, isPublicDemo } from "@/app/auth";
import { defaultBusiness, type Business, type Invoice } from "./invoice";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function db() {
  try {
    return rawDb();
  } catch {
    throw new AppError("Storage is temporarily unavailable. Please try again.", 503);
  }
}
export async function owner() {
  const user = await getUser();
  if (!user) throw new AppError("Please sign in to continue.", 401);
  return user.userId;
}
export function settings() {
  return process.env as Record<string, string | undefined>;
}
export { isPublicDemo };
export async function business(user: string): Promise<Business> {
  await db()
    .prepare("INSERT OR IGNORE INTO businesses(owner,data) VALUES (?,?)")
    .bind(user, JSON.stringify(defaultBusiness))
    .run();
  const row = await db()
    .prepare("SELECT data FROM businesses WHERE owner=?")
    .bind(user)
    .first<{ data: string }>();
  return JSON.parse(row!.data);
}
export function invoiceRow(row: Record<string, unknown>): Invoice {
  return {
    id: String(row.id),
    number: row.number ? String(row.number) : null,
    status: row.status as Invoice["status"],
    revision: Number(row.revision),
    data: JSON.parse(String(row.data)),
    total: Number(row.total),
    createdAt: String(row.created_at),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    sample: !!row.sample,
    business: row.business ? JSON.parse(String(row.business)) : undefined,
    delivery: row.delivery ? String(row.delivery) : undefined,
  };
}
export async function invoice(user: string, id: string) {
  const row = await db()
    .prepare("SELECT * FROM invoices WHERE owner=? AND id=?")
    .bind(user, id)
    .first();
  if (!row) throw new AppError("Invoice not found.", 404);
  return invoiceRow(row);
}
export function audit(user: string, id: string | null, message: string) {
  return db()
    .prepare(
      "INSERT INTO activities(id,owner,invoice_id,message,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), user, id, message, new Date().toISOString());
}
export async function body(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new AppError("This request must come from your workspace.", 403);
  const text = await req.text();
  if (text.length > 64000) throw new AppError("The request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Invalid request.");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "issues" in error) {
    const e = error as { issues: { path: string[]; message: string }[] };
    return Response.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }
  console.error(
    "InvoiceFlow request failed",
    error instanceof Error ? error.message : "unknown",
  );
  return Response.json(
    {
      error:
        "Something went wrong. Your changes were not confirmed. Please try again.",
    },
    { status: 500 },
  );
}
