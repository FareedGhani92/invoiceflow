"use client";
import { useEffect, useRef } from "react";
type Entry = {
  id: string;
  number: string | null;
  client: string;
  status: string;
  currency: string;
  total: number;
};
type Registry = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
/** Optional browser tools share the same visible state; neither tool issues or sends invoices. */
export function useWebMCP(invoices: Entry[], startDraft: () => void) {
  const ref = useRef({ invoices, startDraft });
  ref.current = { invoices, startDraft };
  useEffect(() => {
    const context = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const checkEmpty = (input: unknown) => {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        throw Error("Expected an empty object.");
    };
    const tools = [
      {
        name: "list_invoices",
        title: "List invoices",
        description:
          "Read invoices currently loaded in this workspace. Amounts are in minor currency units.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input: unknown) {
          checkEmpty(input);
          return { invoices: ref.current.invoices };
        },
      },
      {
        name: "start_invoice_draft",
        title: "Open invoice editor",
        description:
          "Open a new, unsaved invoice editor. Does not save, issue, or send anything.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input: unknown) {
          checkEmpty(input);
          ref.current.startDraft();
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { editor: "open", saved: false };
        },
      },
    ];
    for (const tool of tools)
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
}
