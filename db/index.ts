import { createClient, type Client, type InStatement, type Value } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

type RunResult = {
  success: true;
  results: Record<string, unknown>[];
  meta: { changes: number };
};

class SqliteStatement {
  private values: Value[] = [];

  constructor(
    private readonly client: Client,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values.map((value) => {
      if (value === null || typeof value === "string" || typeof value === "number") return value;
      if (typeof value === "boolean") return Number(value);
      if (value instanceof ArrayBuffer || value instanceof Uint8Array) return value;
      throw new TypeError("Unsupported SQLite parameter type");
    }) as Value[];
    return this;
  }

  private async execute(): Promise<RunResult> {
    const result = await this.client.execute({ sql: this.sql, args: this.values });
    return {
      success: true,
      results: result.rows.map((row) => ({ ...row })),
      meta: { changes: Number(result.rowsAffected) },
    };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.execute();
    return (result.results[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>() {
    const result = await this.execute();
    return { ...result, results: result.results as T[] };
  }

  run() {
    return this.execute();
  }

  asInStatement(): InStatement {
    return { sql: this.sql, args: this.values };
  }
}

class SqliteDatabase {
  constructor(private readonly client: Client) {}

  prepare(sql: string) {
    return new SqliteStatement(this.client, sql);
  }

  async batch(statements: SqliteStatement[]) {
    const results = await this.client.batch(
      statements.map((statement) => statement.asInStatement()),
      "write",
    );
    return results.map((result) => ({
      success: true as const,
      results: result.rows.map((row) => ({ ...row })),
      meta: { changes: Number(result.rowsAffected) },
    }));
  }
}

let client: Client | undefined;
let database: SqliteDatabase | undefined;

export function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL ||
      (process.env.NODE_ENV === "production" ? "" : "file:./invoiceflow.db");
    if (!url) throw new Error("TURSO_DATABASE_URL is not configured.");
    client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export function getDb() {
  return drizzle(getClient(), { schema });
}

export function rawDb() {
  if (!database) database = new SqliteDatabase(getClient());
  return database;
}
