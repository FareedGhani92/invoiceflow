import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const businesses = sqliteTable("businesses", {
  owner: text("owner").primaryKey(),
  data: text("data").notNull(),
  nextNumber: integer("next_number").notNull().default(1000),
});
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    data: text("data").notNull(),
  },
  (t) => [index("customers_owner").on(t.owner)],
);
export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    number: text("number"),
    status: text("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    data: text("data").notNull(),
    business: text("business"),
    total: integer("total").notNull(),
    createdAt: text("created_at").notNull(),
    paidAt: text("paid_at"),
    sample: integer("sample").notNull().default(0),
  },
  (t) => [
    index("invoices_owner_created").on(t.owner, t.createdAt),
    uniqueIndex("invoices_owner_number").on(t.owner, t.number),
  ],
);
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    invoiceId: text("invoice_id"),
    message: text("message").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("activities_owner_created").on(t.owner, t.createdAt)],
);
export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    invoiceId: text("invoice_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    providerId: text("provider_id"),
    attemptedAt: text("attempted_at"),
    deliveredAt: text("delivered_at"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("deliveries_owner_invoice").on(t.owner, t.invoiceId),
    uniqueIndex("deliveries_invoice_kind").on(t.invoiceId, t.kind),
  ],
);
export const usage = sqliteTable("usage", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
});
export const automationState = sqliteTable("automation_state", {
  name: text("name").primaryKey(),
  cursor: text("cursor").notNull().default(""),
  lastRunAt: text("last_run_at"),
  lastError: text("last_error"),
});
export const deliveryEvents = sqliteTable(
  "delivery_events",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull(),
    type: text("type").notNull(),
    receivedAt: text("received_at").notNull(),
  },
  (t) => [index("delivery_events_provider").on(t.providerId)],
);
