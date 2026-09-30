import { z } from "zod";
import {
  blankInvoice,
  currencies,
  type Business,
  type InvoiceData,
} from "./invoice";
const nullableString = { type: ["string", "null"] };
export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    customerName: nullableString,
    customerEmail: nullableString,
    customerAddress: nullableString,
    title: nullableString,
    currency: { type: ["string", "null"], enum: [...currencies, null] },
    dueDate: nullableString,
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: nullableString,
          quantity: nullableString,
          rate: nullableString,
        },
        required: ["description", "quantity", "rate"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "customerName",
    "customerEmail",
    "customerAddress",
    "title",
    "currency",
    "dueDate",
    "items",
    "warnings",
  ],
};
export const extractionValidator = z.object({
  customerName: z.string().max(160).nullable(),
  customerEmail: z.string().max(254).nullable(),
  customerAddress: z.string().max(1000).nullable(),
  title: z.string().max(160).nullable(),
  currency: z.enum(currencies).nullable(),
  dueDate: z.string().max(10).nullable(),
  items: z
    .array(
      z.object({
        description: z.string().max(300).nullable(),
        quantity: z.string().max(20).nullable(),
        rate: z.string().max(20).nullable(),
      }),
    )
    .max(50),
  warnings: z.array(z.string().max(500)).max(20),
});
export function normalizeExtraction(
  value: unknown,
  business: Business,
): { draft: InvoiceData; warnings: string[] } {
  const parsed = extractionValidator.parse(value);
  const warnings = [...parsed.warnings];
  const numeric = (value: string | null, label: string) => {
    if (value === null || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) {
      warnings.push(`Enter ${label}; it was missing or could not be verified.`);
      return "";
    }
    return value;
  };
  const draft: InvoiceData = {
    ...blankInvoice(business),
    customerName: parsed.customerName || "",
    customerEmail: parsed.customerEmail || "",
    customerAddress: parsed.customerAddress || "",
    title: parsed.title || "",
    currency: parsed.currency || business.currency,
    dueDate: parsed.dueDate || "",
    items: parsed.items.length
      ? parsed.items.map((i, n) => ({
          id: crypto.randomUUID(),
          description: i.description || "",
          quantity: numeric(i.quantity, `quantity for item ${n + 1}`),
          rate: numeric(i.rate, `rate for item ${n + 1}`),
        }))
      : [{ id: crypto.randomUUID(), description: "", quantity: "", rate: "" }],
  };
  if (!parsed.currency)
    warnings.push(
      `Currency was missing. ${business.currency} is your workspace default; confirm it.`,
    );
  if (!parsed.dueDate) warnings.push("Choose a due date.");
  if (!parsed.customerName) warnings.push("Select or enter a client.");
  if (!parsed.customerEmail)
    warnings.push("Add the client email before sending.");
  warnings.push(
    "Review all extracted details. Tax and discount start at zero; set them explicitly if needed.",
  );
  return { draft, warnings };
}
