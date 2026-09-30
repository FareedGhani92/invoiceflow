import test from "node:test";
import assert from "node:assert/strict";
import {
  blankInvoice,
  calculate,
  defaultBusiness,
  invoiceSchema,
  statusOf,
  monthlyPayments,
  type Invoice,
} from "../lib/invoice";
import { normalizeExtraction } from "../lib/ai";
import { generatePdf } from "../lib/pdf";
import { PDFDocument } from "pdf-lib";
import { writeFileSync } from "node:fs";
import { nextReminder } from "../lib/reminder-policy";
function valid() {
  return {
    ...blankInvoice(),
    customerName: "Acme Studio",
    customerEmail: "billing@acme.example",
    title: "Website design",
    issueDate: "2026-09-01",
    dueDate: "2026-09-30",
    items: [
      { id: "one", description: "Website design", quantity: "12", rate: "50" },
    ],
  };
}
test("payment chart labels and records use the same month across timezone boundaries", () => {
  const months = monthlyPayments(
    [
      { status: "paid", paidAt: "2026-09-30T22:00:00Z", total: 56700 },
      { status: "paid", paidAt: "2026-08-31T23:00:00Z", total: 10000 },
    ],
    new Date("2026-10-01T00:30:00+05:00"),
  );
  assert.deepEqual(months.slice(-2), [
    { label: "Aug", value: 10000 },
    { label: "Sep", value: 56700 },
  ]);
});
function issued(): Invoice {
  return {
    id: "c63aaf1c-d240-4844-8eaf-ea604a13c9ad",
    number: "INV-1001",
    status: "issued",
    revision: 2,
    data: valid(),
    business: {
      ...defaultBusiness,
      name: "Forma Studio",
      email: "hello@forma.example",
      address: "25 Studio Lane, London",
    },
    total: 60000,
    createdAt: "2026-09-01T12:00:00Z",
    paidAt: null,
    sample: false,
  };
}
test("discount precedes tax and amounts remain exact", () => {
  assert.deepEqual(calculate({ ...valid(), discount: "10", tax: "5" }), {
    lines: [60000],
    subtotal: 60000,
    discount: 6000,
    tax: 2700,
    total: 56700,
  });
});
test("rounds fractional quantities per line without floating-point drift", () => {
  assert.equal(
    calculate({
      ...valid(),
      items: [
        { id: "1", description: "fraction", quantity: "0.33", rate: "0.05" },
        { id: "2", description: "fraction", quantity: "0.33", rate: "0.05" },
      ],
    }).total,
    4,
  );
});
test("rejects zero quantities, impossible dates, and excessive precision", () => {
  assert.equal(
    invoiceSchema.safeParse({ ...valid(), dueDate: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    invoiceSchema.safeParse({ ...valid(), dueDate: "2026-08-30" }).success,
    false,
  );
  assert.equal(
    invoiceSchema.safeParse({
      ...valid(),
      items: [{ id: "1", description: "x", quantity: "0", rate: "1" }],
    }).success,
    false,
  );
  assert.equal(
    invoiceSchema.safeParse({ ...valid(), tax: "100.01" }).success,
    false,
  );
  assert.throws(() =>
    calculate({
      ...valid(),
      items: [{ id: "1", description: "x", quantity: "1", rate: "0.001" }],
    }),
  );
});
test("protects totals from unsupported magnitude", () => {
  assert.throws(() =>
    calculate({
      ...valid(),
      items: [
        { id: "1", description: "x", quantity: "99999999", rate: "99999999" },
      ],
    }),
  );
});
test("paid invoices never become overdue", () => {
  const i = issued();
  i.status = "paid";
  i.data.dueDate = "2001-01-01";
  assert.equal(statusOf(i), "paid");
  i.status = "issued";
  assert.equal(statusOf(i), "overdue");
});
test("AI normalization preserves missing rate and due date for review", () => {
  const result = normalizeExtraction(
    {
      customerName: "Acme",
      customerEmail: null,
      customerAddress: null,
      title: "Design",
      currency: null,
      dueDate: null,
      items: [{ description: "Design", quantity: "12", rate: null }],
      warnings: [],
    },
    defaultBusiness,
  );
  assert.equal(result.draft.items[0].rate, "");
  assert.equal(result.draft.dueDate, "");
  assert.ok(result.warnings.some((w) => w.includes("rate")));
  assert.equal(invoiceSchema.safeParse(result.draft).success, false);
});
test("AI rejects unsupported currency and oversized extracted items", () => {
  assert.throws(() =>
    normalizeExtraction(
      {
        customerName: null,
        customerEmail: null,
        customerAddress: null,
        title: null,
        currency: "FAKE",
        dueDate: null,
        items: [],
        warnings: [],
      },
      defaultBusiness,
    ),
  );
});
test("generates a real PDF with frozen business metadata", async () => {
  const bytes = await generatePdf(issued());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getAuthor(), "Forma Studio");
  if (process.env.PDF_TEST_OUTPUT)
    writeFileSync(process.env.PDF_TEST_OUTPUT, bytes);
});
test("long invoices paginate and preserve the document", async () => {
  const invoice = issued();
  invoice.data.items = Array.from({ length: 50 }, (_, i) => ({
    id: String(i),
    description:
      `Line ${i + 1}: ` + "Detailed design and implementation work. ".repeat(6),
    quantity: "1",
    rate: "50",
  }));
  invoice.total = calculate(invoice.data).total;
  const pdf = await PDFDocument.load(await generatePdf(invoice));
  assert.ok(pdf.getPageCount() >= 4);
});
test("drafts cannot be rendered as issued PDFs", async () => {
  const i = issued();
  delete i.business;
  i.number = null;
  await assert.rejects(() => generatePdf(i), /Issue this invoice/);
});
test("reminders require a delivered original and stop on payment or bounce", () => {
  const inv = issued();
  const original = {
    kind: "initial",
    status: "delivered",
    created_at: "2026-09-01T00:00:00Z",
    delivered_at: "2026-09-01T00:00:00Z",
  };
  const now = new Date("2026-10-03T12:00:00Z");
  assert.equal(nextReminder(inv, [], now), null);
  assert.equal(nextReminder(inv, [original], now), 1);
  assert.equal(
    nextReminder(
      inv,
      [{ ...original, delivered_at: "2026-10-02T12:00:00Z" }],
      now,
    ),
    null,
  );
  assert.equal(nextReminder({ ...inv, status: "paid" }, [original], now), null);
  assert.equal(nextReminder({ ...inv, sample: true }, [original], now), null);
  assert.equal(
    nextReminder(
      inv,
      [
        original,
        {
          kind: "reminder-1",
          status: "bounced",
          created_at: now.toISOString(),
        },
      ],
      now,
    ),
    null,
  );
});
test("reminders enforce three stages with seven days between sends", () => {
  const inv = issued();
  const original = {
    kind: "initial",
    status: "delivered",
    created_at: "2026-09-01T00:00:00Z",
    delivered_at: "2026-09-01T00:00:00Z",
  };
  const first = {
    kind: "reminder-1",
    status: "delivered",
    created_at: "2026-10-05T12:00:00Z",
    delivered_at: "2026-10-05T12:00:00Z",
  };
  assert.equal(
    nextReminder(inv, [original], new Date("2026-10-02T23:59:59Z")),
    null,
  );
  assert.equal(
    nextReminder(inv, [original, first], new Date("2026-10-10T12:00:00Z")),
    null,
  );
  assert.equal(
    nextReminder(inv, [original, first], new Date("2026-10-12T12:00:00Z")),
    2,
  );
  assert.equal(
    nextReminder(
      inv,
      [
        original,
        first,
        {
          kind: "reminder-2",
          status: "accepted",
          created_at: "2026-10-12T12:00:00Z",
        },
      ],
      new Date("2026-10-20T12:00:00Z"),
    ),
    null,
  );
  assert.equal(
    nextReminder(
      inv,
      [
        original,
        first,
        {
          kind: "reminder-2",
          status: "delivered",
          created_at: "2026-10-12T12:00:00Z",
          delivered_at: "2026-10-12T12:00:00Z",
        },
      ],
      new Date("2026-10-20T12:00:00Z"),
    ),
    3,
  );
});
