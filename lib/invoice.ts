import { z } from "zod";
export const currencies = ["USD", "EUR", "GBP", "PKR"] as const;
const decimal = z
  .string()
  .regex(
    /^\d{1,8}(\.\d{1,2})?$/,
    "Use a positive number with up to two decimal places.",
  );
const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date.",
  );
export const itemSchema = z.object({
  id: z.string().max(80),
  description: z.string().trim().min(1).max(300),
  quantity: decimal.refine((v) => Number(v) > 0),
  rate: decimal,
});
export const invoiceSchema = z
  .object({
    customerName: z.string().trim().min(1, "Client name is required.").max(160),
    customerEmail: z.union([z.string().email(), z.literal("")]),
    customerAddress: z.string().max(1000),
    title: z.string().trim().min(1).max(160),
    currency: z.enum(currencies),
    issueDate: date,
    dueDate: date,
    items: z.array(itemSchema).min(1).max(50),
    discount: decimal.refine((v) => Number(v) <= 100),
    tax: decimal.refine((v) => Number(v) <= 100),
    notes: z.string().max(2000),
    paymentInstructions: z.string().max(2000),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: "Due date must be on or after the issue date.",
    path: ["dueDate"],
  });
export const businessSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.union([z.string().email(), z.literal("")]),
  address: z.string().max(1000),
  currency: z.enum(currencies),
  paymentInstructions: z.string().max(2000),
  prefix: z.string().regex(/^[A-Z0-9-]{1,12}$/),
  reminders: z.boolean(),
});
export const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.union([z.string().email(), z.literal("")]),
  address: z.string().max(1000),
});
export type InvoiceData = z.infer<typeof invoiceSchema>;
export type Business = z.infer<typeof businessSchema>;
export type Customer = z.infer<typeof customerSchema> & { id: string };
export type Invoice = {
  id: string;
  number: string | null;
  status: "draft" | "issued" | "paid" | "void";
  revision: number;
  data: InvoiceData;
  total: number;
  createdAt: string;
  paidAt: string | null;
  sample: boolean;
  business?: Business;
  delivery?: string;
};
export type Activity = {
  id: string;
  invoiceId: string | null;
  message: string;
  createdAt: string;
};
export const defaultBusiness: Business = {
  name: "Your studio",
  email: "",
  address: "",
  currency: "USD",
  paymentInstructions: "",
  prefix: "INV",
  reminders: false,
};
export const today = () => new Date().toISOString().slice(0, 10);
export function blankInvoice(b: Business = defaultBusiness): InvoiceData {
  const due = new Date();
  due.setDate(due.getDate() + 14);
  return {
    customerName: "",
    customerEmail: "",
    customerAddress: "",
    title: "Design & development",
    currency: b.currency,
    issueDate: today(),
    dueDate: due.toISOString().slice(0, 10),
    items: [
      { id: crypto.randomUUID(), description: "", quantity: "1", rate: "0" },
    ],
    discount: "0",
    tax: "0",
    notes: "Thank you for your business.",
    paymentInstructions: b.paymentInstructions,
  };
}
function scaled(value: string): bigint {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw Error("Invalid amount");
  const [a, b = ""] = value.split(".");
  return BigInt(a) * 100n + BigInt(b.padEnd(2, "0"));
}
function round(n: bigint, d: bigint) {
  return (n + d / 2n) / d;
}
export function calculate(
  data: Pick<InvoiceData, "items" | "discount" | "tax">,
) {
  const lines = data.items.map((i) =>
    round(scaled(i.quantity) * scaled(i.rate), 100n),
  );
  const subtotal = lines.reduce((a, b) => a + b, 0n);
  const discount = round(subtotal * scaled(data.discount), 10000n);
  const taxable = subtotal - discount;
  const tax = round(taxable * scaled(data.tax), 10000n);
  const total = taxable + tax;
  if (total > 1000000000000n || total < 0n)
    throw Error("Invoice amount exceeds the supported limit.");
  return {
    lines: lines.map(Number),
    subtotal: Number(subtotal),
    discount: Number(discount),
    tax: Number(tax),
    total: Number(total),
  };
}
export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
export function displayDate(value: string) {
  return new Date(value + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function statusOf(i: Invoice) {
  return i.status === "issued" && i.data.dueDate < today()
    ? "overdue"
    : i.status;
}
export function monthlyPayments(
  invoices: Pick<Invoice, "status" | "paidAt" | "total">[],
  now = new Date(),
) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1),
    );
    const key = date.toISOString().slice(0, 7);
    return {
      label: date.toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      value: invoices
        .filter((i) => i.status === "paid" && i.paidAt?.startsWith(key))
        .reduce((sum, i) => sum + i.total, 0),
    };
  });
}
