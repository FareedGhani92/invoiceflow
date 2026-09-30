import { createClient } from "@libsql/client";
import nextEnv from "@next/env";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root);
const url = process.env.TURSO_DATABASE_URL || (process.env.NODE_ENV === "production" ? "" : "file:./invoiceflow.db");
if (!url) throw new Error("Set TURSO_DATABASE_URL before running the database migrations.");
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

try {
  await client.execute("CREATE TABLE IF NOT EXISTS _invoiceflow_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)");
  const files = (await readdir(path.join(root, "drizzle"))).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const name of files) {
    const applied = await client.execute({ sql: "SELECT name FROM _invoiceflow_migrations WHERE name=?", args: [name] });
    if (applied.rows.length) continue;
    const source = await readFile(path.join(root, "drizzle", name), "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .flatMap((part) => part.split(";"))
      .map((part) => part.trim())
      .filter(Boolean)
      .map((sql) => ({ sql }));
    statements.push({ sql: "INSERT INTO _invoiceflow_migrations(name,applied_at) VALUES (?,?)", args: [name, new Date().toISOString()] });
    await client.batch(statements, "write");
    process.stdout.write(`Applied ${name}\n`);
  }
} finally {
  client.close();
}
