"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  LayoutDashboard,
  Loader2,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  X,
  Send,
  Clock3,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWebMCP } from "@/lib/webmcp";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "sonner";
import {
  blankInvoice,
  calculate,
  currencies,
  defaultBusiness,
  displayDate,
  invoiceSchema,
  money,
  monthlyPayments,
  statusOf,
  type Activity,
  type Business,
  type Customer,
  type Invoice,
  type InvoiceData,
} from "@/lib/invoice";

type Boot = {
  business: Business;
  invoices: Invoice[];
  customers: Customer[];
  activities: Activity[];
  integrations: { ai: boolean; email: boolean; reminders: boolean };
  reminderScheduler: {
    configured: boolean;
    lastRunAt: string | null;
    lastError: string | null;
  };
  demoFallback?: boolean;
};
type View = "overview" | "invoices" | "clients" | "settings";
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "clients", label: "Clients", icon: Users },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
function sampleWorkspace(): Boot {
  const business: Business = {
    ...defaultBusiness,
    name: "Forma Studio (sample)",
    email: "hello@forma.example",
    address: "25 Studio Lane\nLondon, UK",
    paymentInstructions: "Sample only — no payment is due.",
  };
  const date = (offset: number) => {
    const value = new Date();
    value.setDate(value.getDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const samples = [
    { client: "Northstar", title: "Brand identity", amount: "3200", status: "paid" as const, due: -10, num: "DEMO-1081" },
    { client: "Layers Studio", title: "Website development", amount: "4800", status: "issued" as const, due: 8, num: "DEMO-1082" },
    { client: "Morrow & Co.", title: "Monthly design support", amount: "1600", status: "issued" as const, due: -5, num: "DEMO-1083" },
    { client: "Offscript", title: "Editorial direction", amount: "2250", status: "paid" as const, due: -22, num: "DEMO-1084" },
    { client: "Kinfolk Labs", title: "Product discovery", amount: "950", status: "draft" as const, due: 14, num: null },
  ];
  const invoices: Invoice[] = samples.map((sample, index) => {
    const dueDate = date(sample.due);
    const issue = new Date(`${dueDate}T12:00:00Z`);
    issue.setUTCDate(issue.getUTCDate() - 14);
    const issueDate = issue.toISOString().slice(0, 10);
    const data: InvoiceData = {
      ...blankInvoice(business),
      customerName: sample.client,
      customerEmail: `billing@${sample.client.toLowerCase().replace(/[^a-z]/g, "")}.example`,
      title: sample.title,
      currency: "USD",
      issueDate,
      dueDate,
      items: [{ id: `sample-item-${index}`, description: sample.title, quantity: "1", rate: sample.amount }],
      notes: "Sample invoice — for demonstration only.",
    };
    return {
      id: `sample-invoice-${index}`,
      number: sample.num,
      status: sample.status,
      revision: 1,
      data,
      total: calculate(data).total,
      createdAt: `${issueDate}T12:00:00.000Z`,
      paidAt: sample.status === "paid" ? `${dueDate}T12:00:00.000Z` : null,
      sample: true,
      business,
    };
  });
  const customers: Customer[] = samples.map((sample, index) => ({
    id: `sample-customer-${index}`,
    name: sample.client,
    email: `billing@${sample.client.toLowerCase().replace(/[^a-z]/g, "")}.example`,
    address: "Sample address",
  }));
  return {
    business,
    invoices,
    customers,
    activities: [],
    integrations: { ai: false, email: false, reminders: false },
    reminderScheduler: { configured: false, lastRunAt: null, lastError: null },
    demoFallback: true,
  };
}
async function request(action: string, payload: Record<string, unknown> = {}) {
  const r = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = (await r.json()) as { invoice: Invoice; error?: string };
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Status({ invoice }: { invoice: Invoice }) {
  const s = statusOf(invoice);
  return (
    <span className={`status ${s}`}>
      {s === "paid" ? (
        <Check size={12} />
      ) : s === "overdue" ? (
        <Clock3 size={12} />
      ) : null}
      {s === "issued" ? "Unpaid" : s[0].toUpperCase() + s.slice(1)}
    </span>
  );
}
export default function Workspace({ userName, publicDemo }: { userName: string; publicDemo: boolean }) {
  const [view, setView] = useState<View>("overview");
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState(false);
  const [current, setCurrent] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<InvoiceData>(() => blankInvoice());
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<void> | void;
  } | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [client, setClient] = useState({ name: "", email: "", address: "" });
  const openClient = (c?: Customer) => {
    setClientId(c?.id || null);
    setClient(
      c
        ? { name: c.name, email: c.email, address: c.address }
        : { name: "", email: "", address: "" },
    );
    setClientOpen(true);
  };
  const [profile, setProfile] = useState<Business>(defaultBusiness);
  const [notes, setNotes] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const load = async () => {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store" });
      const d = (await r.json()) as Boot & { error?: string };
      if (!r.ok) throw Error(d.error || "Unable to load workspace");
      setBoot(d);
      setProfile(d.business);
      setError("");
      return d as Boot;
    } catch (error) {
      if (!publicDemo) throw error;
      const preview = sampleWorkspace();
      setBoot(preview);
      setProfile(preview.business);
      setError("");
      return preview;
    }
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  const openInvoice = (inv?: Invoice) => {
    setCurrent(inv || null);
    setDraft(inv ? structuredClone(inv.data) : blankInvoice(boot?.business));
    setAiWarnings([]);
    setDirty(false);
    setEditor(true);
  };
  const change = <K extends keyof InvoiceData>(
    key: K,
    value: InvoiceData[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  useWebMCP(invoicesForTools(boot), () => {
    if (editor)
      throw Error("Close the current invoice before starting another draft.");
    openInvoice();
  });
  const closeEditor = () => {
    if (dirty)
      setConfirmation({
        title: "Discard unsaved changes?",
        description: "Your last saved version will stay in your workspace.",
        action: () => {
          setDirty(false);
          setEditor(false);
        },
      });
    else setEditor(false);
  };
  const save = async () => {
    const parsed = invoiceSchema.safeParse(draft);
    if (!parsed.success) throw Error(parsed.error.issues[0].message);
    const data = await request("save-invoice", {
      id: current?.id,
      revision: current?.revision,
      data: draft,
    });
    setCurrent(data.invoice);
    setDirty(false);
    await load();
    toast.success("Draft saved");
    return data.invoice as Invoice;
  };
  const transition = (action: string, title: string, description: string) =>
    setConfirmation({
      title,
      description,
      action: async () => {
        if (!current) return;
        const result = await request(action, {
          id: current.id,
          revision: current.revision,
        });
        if (result.invoice) {
          setCurrent(result.invoice);
          setDraft(result.invoice.data);
        } else setEditor(false);
        await load();
        toast.success(
          (
            {
              issue: "Invoice issued",
              "mark-paid": "Payment recorded",
              void: "Invoice voided",
              "delete-draft": "Draft deleted",
            } as Record<string, string>
          )[action] || "Saved",
        );
      },
    });
  let totals;
  try {
    totals = calculate(draft);
  } catch {
    totals = {
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      lines: draft.items.map(() => 0),
    };
  }
  const locked = !!current && current.status !== "draft";
  const b = boot?.business || defaultBusiness;
  const invoices = boot?.invoices || [];
  const visible = invoices.filter(
    (i) =>
      (filter === "all" || statusOf(i) === filter) &&
      `${i.number || "Draft"} ${i.data.customerName} ${i.data.title}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const matched = invoices.filter((i) => i.data.currency === b.currency);
  const paid = matched
    .filter((i) => i.status === "paid")
    .reduce((n, i) => n + i.total, 0);
  const outstanding = matched
    .filter((i) => i.status === "issued")
    .reduce((n, i) => n + i.total, 0);
  const overdue = matched
    .filter((i) => statusOf(i) === "overdue")
    .reduce((n, i) => n + i.total, 0);
  const draftCount = invoices.filter((i) => i.status === "draft").length;
  const metrics = [
    {
      label: "Total collected",
      value: money(paid, b.currency),
      icon: Wallet,
      detail: "Recorded payments",
      className: "green",
    },
    {
      label: "Outstanding",
      value: money(outstanding, b.currency),
      icon: ArrowUpRight,
      detail: "Awaiting payment",
      className: "blue",
    },
    {
      label: "Overdue",
      value: money(overdue, b.currency),
      icon: Clock3,
      detail: "Past the due date",
      className: "orange",
    },
    {
      label: "Draft invoices",
      value: String(draftCount).padStart(2, "0"),
      icon: FileText,
      detail: "Ready for your review",
      className: "purple",
    },
  ];
  const months = monthlyPayments(matched);
  const max = Math.max(...months.map((m) => m.value), 10000);
  const invoiceTable = (limit?: number) => (
    <div className="table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice / project</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>
              <span className="sr-only">Open</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.slice(0, limit).map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                <button className="invoice-link" onClick={() => openInvoice(i)}>
                  {i.number || "Draft"}
                  <span>
                    {i.data.title}
                    {i.sample ? " · Sample" : ""}
                  </span>
                </button>
              </TableCell>
              <TableCell>
                <div className="client-cell">
                  <span className="avatar small">
                    {i.data.customerName.slice(0, 2).toUpperCase()}
                  </span>
                  {i.data.customerName}
                </div>
              </TableCell>
              <TableCell className={statusOf(i) === "overdue" ? "late" : ""}>
                {displayDate(i.data.dueDate)}
              </TableCell>
              <TableCell>
                <Status invoice={i} />
              </TableCell>
              <TableCell className="amount text-right">
                {money(i.total, i.data.currency)}
              </TableCell>
              <TableCell>
                <button
                  aria-label={`Open ${i.number || i.data.title}`}
                  className="icon-btn"
                  onClick={() => openInvoice(i)}
                >
                  <ChevronRight size={16} />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!visible.length && (
        <div className="empty-state">
          <FileText size={28} />
          <h3>
            {search || filter !== "all"
              ? "No matching invoices"
              : "Your first invoice starts here"}
          </h3>
          <p>
            {search || filter !== "all"
              ? "Try another search or status."
              : "Add your client and line items. We’ll take care of the totals."}
          </p>
          {!search && filter === "all" && (
            <Button onClick={() => openInvoice()}>
              <Plus size={16} />
              Create invoice
            </Button>
          )}
        </div>
      )}
    </div>
  );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "238px" } as React.CSSProperties}
    >
      <Toaster richColors position="bottom-right" />
      <Sidebar className="app-sidebar">
        <SidebarHeader className="brand">
          <span className="brand-icon">f</span>
          <span>
            invoiceflow<span className="brand-ai">AI</span>
          </span>
        </SidebarHeader>
        <SidebarContent>
          <div className="workspace-label">WORKSPACE</div>
          <SidebarMenu>
            {navigation.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  isActive={view === n.id}
                  onClick={() => {
                    setView(n.id);
                    setSearch("");
                    setFilter("all");
                  }}
                  className="nav-item"
                >
                  <n.icon size={19} />
                  <span>{n.label}</span>
                  {n.id === "invoices" && !!invoices.length && (
                    <span className="nav-count">{invoices.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <div className="note-icon">
              <ShieldCheck size={19} />
            </div>
            <strong>A little less admin.</strong>
            <p>A little more time for the work you love.</p>
            <Button
              variant="outline"
              onClick={() => {
                setView("settings");
              }}
            >
              Set up your business
              <ArrowUpRight size={15} />
            </Button>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="account">
            <span className="avatar">{userName.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{userName}</strong>
              <span>Shared demo workspace</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-toggle" />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === view)?.label}</strong>
          </div>
          <span className="topbar-right">
            <ShieldCheck size={15} />
            {boot?.demoFallback
              ? "Sample preview · not saved"
              : "Public demo · sample data is shared"}
          </span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR WORK, PAID.</div>
              <h1>
                {view === "overview"
                  ? "Business at a glance"
                  : view === "invoices"
                    ? "All invoices"
                    : view === "clients"
                      ? "Your clients"
                      : "Business settings"}
              </h1>
              <p>
                {view === "overview"
                  ? "A clear view of what’s paid and what’s next."
                  : view === "invoices"
                    ? "From the first draft to the final payment."
                    : view === "clients"
                      ? "Good work starts with good relationships."
                      : "The details that make every invoice yours."}
              </p>
            </div>
            {view !== "settings" && (
              <Button
                className="primary-action"
                disabled={boot?.demoFallback}
                onClick={() =>
                  view === "clients" ? openClient() : openInvoice()
                }
              >
                <Plus size={17} />
                {view === "clients" ? "Add client" : "New invoice"}
              </Button>
            )}
          </div>
          {boot?.demoFallback && (
            <div className="demo-banner">
              <span>
                These fictional sample invoices are shown because no database is connected. Changes cannot be saved in this preview.
              </span>
            </div>
          )}
          {error ? (
            <div className="error-panel" role="alert">
              <h3>We couldn’t load your workspace</h3>
              <p>{error}</p>
              <Button
                onClick={() =>
                  run(async () => {
                    await load();
                  })
                }
              >
                Try again
              </Button>
            </div>
          ) : !boot ? (
            <div className="metrics">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <div className="metrics">
                    {metrics.map((m) => (
                      <div className="metric" key={m.label}>
                        <div className="metric-top">
                          <span>{m.label}</span>
                          <span className={`metric-icon ${m.className}`}>
                            <m.icon size={18} />
                          </span>
                        </div>
                        <strong>{m.value}</strong>
                        <span className="metric-detail">{m.detail}</span>
                      </div>
                    ))}
                  </div>
                  <div className="overview-middle">
                    <section className="panel revenue-panel">
                      <div className="section-heading">
                        <div>
                          <h2>Payment overview</h2>
                          <p>
                            Collected over the last six months · {b.currency}
                          </p>
                        </div>
                        <span className="chart-legend">
                          <i />
                          Collected
                        </span>
                      </div>
                      <div className="chart">
                        <div className="chart-axis">
                          <span>{money(max, b.currency)}</span>
                          <span>{money(max / 2, b.currency)}</span>
                          <span>0</span>
                        </div>
                        <div className="chart-plot">
                          <div className="gridlines">
                            <i />
                            <i />
                            <i />
                          </div>
                          {months.map((m, i) => (
                            <div className="chart-column" key={m.label}>
                              <div
                                className={`chart-bar ${i === 5 ? "last" : ""}`}
                                style={{
                                  height: `${Math.max(2, (m.value / max) * 100)}%`,
                                }}
                                title={`${m.label}: ${money(m.value, b.currency)}`}
                              />
                              <span>{m.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                    <section className="assist-card">
                      <span className="assist-icon">
                        <Sparkles size={22} />
                      </span>
                      <span className="assist-label">
                        MEET YOUR INVOICE ASSISTANT
                      </span>
                      <h2>
                        From a few words
                        <br />
                        to your next invoice.
                      </h2>
                      <p>
                        Describe the work. Review the details. Make it official.
                      </p>
                      <Button onClick={() => setAiOpen(true)}>
                        Draft with AI <ArrowUpRight size={17} />
                      </Button>
                      <span className="assist-foot">
                        You always have the final say.
                      </span>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>
                          Recent invoices{" "}
                          <span className="count-pill">{invoices.length}</span>
                        </h2>
                        <p>Your latest work, all in one place.</p>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setView("invoices");
                        }}
                      >
                        View all invoices
                        <ArrowUpRight size={16} />
                      </Button>
                    </div>
                    {invoiceTable(5)}
                  </section>
                  <div className="bottom-grid">
                    <section className="panel activity-panel">
                      <h2>Recent activity</h2>
                      {boot.activities.length ? (
                        boot.activities.slice(0, 4).map((a) => (
                          <div className="activity" key={a.id}>
                            <span className="activity-icon">
                              <Check size={14} />
                            </span>
                            <div>
                              <p>{a.message}</p>
                              <span>
                                {new Date(a.createdAt).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          Your invoice milestones will appear here.
                        </p>
                      )}
                    </section>
                    <section className="panel getting-started">
                      <span className="eyebrow">A GOOD PLACE TO START</span>
                      <h2>Make your first invoice count.</h2>
                      <button onClick={() => setView("settings")}>
                        <span>01</span>Add your business details
                        <ChevronRight size={16} />
                      </button>
                      <button onClick={() => openClient()}>
                        <span>02</span>Save your first client
                        <ChevronRight size={16} />
                      </button>
                      <button onClick={() => openInvoice()}>
                        <span>03</span>Create a professional invoice
                        <ChevronRight size={16} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {view === "invoices" && (
                <section className="panel">
                  <div className="list-toolbar">
                    <Tabs value={filter} onValueChange={setFilter}>
                      <TabsList>
                        {["all", "draft", "issued", "paid", "overdue"].map(
                          (t) => (
                            <TabsTrigger value={t} key={t}>
                              {t === "all"
                                ? "All invoices"
                                : t === "issued"
                                  ? "Unpaid"
                                  : t[0].toUpperCase() + t.slice(1)}
                            </TabsTrigger>
                          ),
                        )}
                      </TabsList>
                    </Tabs>
                    <div className="search-box">
                      <Search size={17} />
                      <Input
                        aria-label="Search invoices"
                        placeholder="Search invoices…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  {invoiceTable()}
                </section>
              )}
              {view === "clients" && (
                <>
                  <div className="search-box client-search">
                    <Search size={17} />
                    <Input
                      aria-label="Search clients"
                      placeholder="Find a client…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="clients-grid">
                    {boot.customers
                      .filter((c) =>
                        `${c.name} ${c.email}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((c) => (
                        <section className="panel client-card" key={c.id}>
                          <span className="avatar large">
                            {c.name.slice(0, 2).toUpperCase()}
                          </span>
                          <h2>{c.name}</h2>
                          <p>{c.email || "No email added"}</p>
                          <p className="address">
                            {c.address || "No billing address added"}
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => {
                              openInvoice();
                              setDraft({
                                ...blankInvoice(b),
                                customerName: c.name,
                                customerEmail: c.email,
                                customerAddress: c.address,
                              });
                              setDirty(true);
                            }}
                          >
                            Create invoice
                            <ArrowUpRight size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            className="ml-2"
                            onClick={() => openClient(c)}
                          >
                            Edit client
                          </Button>
                        </section>
                      ))}
                  </div>
                  {!boot.customers.length && (
                    <div className="panel empty-state">
                      <Users size={28} />
                      <h3>A home for your clients</h3>
                      <p>
                        Save their details once, then reuse them on every
                        invoice.
                      </p>
                      <Button onClick={() => openClient()}>
                        <Plus size={16} />
                        Add your first client
                      </Button>
                    </div>
                  )}
                </>
              )}
              {view === "settings" && (
                <div className="settings-grid">
                  <form
                    className="panel settings-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        await request("save-business", { data: profile });
                        await load();
                        toast.success("Business details saved");
                      });
                    }}
                  >
                    <div className="section-heading">
                      <div>
                        <h2>Business profile</h2>
                        <p>These details appear on newly issued invoices.</p>
                      </div>
                    </div>
                    <Field label="Business name">
                      <Input
                        required
                        value={profile.name}
                        onChange={(e) =>
                          setProfile({ ...profile, name: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Business email">
                      <Input
                        type="email"
                        required
                        value={profile.email}
                        onChange={(e) =>
                          setProfile({ ...profile, email: e.target.value })
                        }
                        placeholder="hello@yourstudio.com"
                      />
                    </Field>
                    <Field label="Business address">
                      <Textarea
                        value={profile.address}
                        onChange={(e) =>
                          setProfile({ ...profile, address: e.target.value })
                        }
                        placeholder="Street, city, postal code, country"
                      />
                    </Field>
                    <div className="field-grid">
                      <Field label="Default currency">
                        <Select
                          value={profile.currency}
                          onValueChange={(v) =>
                            setProfile({
                              ...profile,
                              currency: v as Business["currency"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {currencies.map((c) => (
                              <SelectItem value={c} key={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Invoice prefix">
                        <Input
                          value={profile.prefix}
                          onChange={(e) =>
                            setProfile({
                              ...profile,
                              prefix: e.target.value.toUpperCase(),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Payment instructions">
                      <Textarea
                        value={profile.paymentInstructions}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            paymentInstructions: e.target.value,
                          })
                        }
                        placeholder="How should your clients pay you?"
                      />
                    </Field>
                    <Button disabled={busy || boot?.demoFallback} type="submit">
                      {busy && <Loader2 className="animate-spin" size={16} />}
                      Save changes
                    </Button>
                  </form>
                  <div>
                    <section className="panel integrations">
                      <h2>Connections</h2>
                      <div>
                        <Sparkles size={20} />
                        <span>
                          <strong>AI drafting</strong>
                          <small>
                            {boot.integrations.ai
                              ? "Connected"
                              : "Connection required"}
                          </small>
                        </span>
                        <span
                          className={`connection ${boot.integrations.ai ? "connected" : ""}`}
                        >
                          {boot.integrations.ai ? "Ready" : "Not set up"}
                        </span>
                      </div>
                      <div>
                        <Send size={20} />
                        <span>
                          <strong>Email delivery</strong>
                          <small>
                            {boot.integrations.email
                              ? "Connected"
                              : "Connection required"}
                          </small>
                        </span>
                        <span
                          className={`connection ${boot.integrations.email ? "connected" : ""}`}
                        >
                          {boot.integrations.email ? "Ready" : "Not set up"}
                        </span>
                      </div>
                      <div>
                        <Clock3 size={20} />
                        <span>
                          <strong>Scheduled reminders</strong>
                          <small>
                            {boot.integrations.reminders
                              ? "Send up to three reminders, starting three days after the due date."
                              : boot.reminderScheduler.configured
                                ? "Waiting for the reminder service to check in"
                                : "Email and a scheduler connection required"}
                          </small>
                        </span>
                        <span
                          className={`connection ${boot.integrations.reminders ? "connected" : ""}`}
                        >
                          {boot.integrations.reminders
                            ? "Ready"
                            : boot.reminderScheduler.configured
                              ? "Paused"
                              : "Not set up"}
                        </span>
                      </div>
                      {(boot.integrations.reminders || profile.reminders) && (
                        <label className="reminder-consent">
                          <input
                            type="checkbox"
                            checked={profile.reminders}
                            onChange={(event) =>
                              setProfile({
                                ...profile,
                                reminders: event.target.checked,
                              })
                            }
                          />
                          <span>
                            {boot.integrations.reminders
                              ? "Send automatic payment reminders for my unpaid invoices after the original email is delivered. Save changes to apply."
                              : "Reminders are paused while the connection is unavailable. Uncheck to opt out, then save changes."}
                          </span>
                        </label>
                      )}
                      <p>
                        Invoice editing, payment tracking, and PDF downloads
                        work independently of these connections.
                      </p>
                    </section>
                    <section className="panel settings-note">
                      <ShieldCheck size={24} />
                      <h2>Your records stay yours.</h2>
                      <p>
                        Issued invoices keep a fixed copy of your details.
                        Updating your business profile won’t change earlier
                        invoices.
                      </p>
                    </section>
                  </div>
                </div>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>Made for independent work.</span>
            <span>
              InvoiceFlow <span className="footer-spark">✦</span>
            </span>
          </footer>
        </main>
      </SidebarInset>
      <Sheet
        open={editor}
        onOpenChange={(v) => {
          if (!v) closeEditor();
        }}
      >
        <SheetContent className="invoice-sheet" showCloseButton={false}>
          <SheetHeader className="editor-heading">
            <div>
              <SheetTitle>
                {locked
                  ? current?.number
                  : current
                    ? "Edit draft"
                    : "Create an invoice"}
              </SheetTitle>
              <SheetDescription>
                {locked
                  ? "A fixed record of your work."
                  : "The details on the left. The finished look on the right."}
              </SheetDescription>
            </div>
            <button
              className="icon-btn"
              aria-label="Close invoice"
              onClick={closeEditor}
            >
              <X size={21} />
            </button>
          </SheetHeader>
          <div className="editor-body">
            <div className="editor-form">
              {locked ? (
                <div className="locked-note">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Invoice details are locked</strong>
                    <p>
                      Issued invoices preserve the details your client received.
                    </p>
                    <Status invoice={current!} />
                    {current?.delivery && (
                      <p>
                        Email:{" "}
                        {current.delivery === "accepted"
                          ? "Accepted by provider"
                          : current.delivery}
                      </p>
                    )}
                    {current?.delivery === "needs-review" && (
                      <p>
                        Check this delivery in your email provider before
                        sending again. Automatic retries have stopped.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-section">
                    <h3>Client & project</h3>
                    {boot?.customers.length ? (
                      <Field label="Saved client">
                        <Select
                          onValueChange={(id) => {
                            const c = boot.customers.find((c) => c.id === id)!;
                            setDraft((d) => ({
                              ...d,
                              customerName: c.name,
                              customerEmail: c.email,
                              customerAddress: c.address,
                            }));
                            setDirty(true);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a client" />
                          </SelectTrigger>
                          <SelectContent>
                            {boot.customers.map((c) => (
                              <SelectItem value={c.id} key={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    ) : null}
                    <Field label="Client name">
                      <Input
                        value={draft.customerName}
                        onChange={(e) => change("customerName", e.target.value)}
                        placeholder="Acme Studio"
                      />
                    </Field>
                    <Field label="Client email">
                      <Input
                        type="email"
                        value={draft.customerEmail}
                        onChange={(e) =>
                          change("customerEmail", e.target.value)
                        }
                        placeholder="billing@acme.com"
                      />
                    </Field>
                    <Field label="Billing address">
                      <Textarea
                        value={draft.customerAddress}
                        onChange={(e) =>
                          change("customerAddress", e.target.value)
                        }
                        rows={2}
                      />
                    </Field>
                    <Field label="Project / reference">
                      <Input
                        value={draft.title}
                        onChange={(e) => change("title", e.target.value)}
                      />
                    </Field>
                    <div className="field-grid">
                      <Field label="Issue date">
                        <Input
                          type="date"
                          value={draft.issueDate}
                          onChange={(e) => change("issueDate", e.target.value)}
                        />
                      </Field>
                      <Field label="Due date">
                        <Input
                          type="date"
                          value={draft.dueDate}
                          onChange={(e) => change("dueDate", e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field label="Currency">
                      <Select
                        value={draft.currency}
                        onValueChange={(v) =>
                          change("currency", v as InvoiceData["currency"])
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currencies.map((c) => (
                            <SelectItem value={c} key={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="form-section">
                    <h3>Line items</h3>
                    {draft.items.map((item, index) => (
                      <div className="line-item" key={item.id}>
                        <Field label={`Description ${index + 1}`}>
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              change(
                                "items",
                                draft.items.map((i, n) =>
                                  n === index
                                    ? { ...i, description: e.target.value }
                                    : i,
                                ),
                              )
                            }
                            placeholder="Website design"
                          />
                        </Field>
                        <div className="line-fields">
                          <Field label="Quantity">
                            <Input
                              inputMode="decimal"
                              value={item.quantity}
                              onChange={(e) =>
                                change(
                                  "items",
                                  draft.items.map((i, n) =>
                                    n === index
                                      ? { ...i, quantity: e.target.value }
                                      : i,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field label={`Rate (${draft.currency})`}>
                            <Input
                              inputMode="decimal"
                              value={item.rate}
                              onChange={(e) =>
                                change(
                                  "items",
                                  draft.items.map((i, n) =>
                                    n === index
                                      ? { ...i, rate: e.target.value }
                                      : i,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove item ${index + 1}`}
                            disabled={draft.items.length === 1}
                            onClick={() =>
                              change(
                                "items",
                                draft.items.filter((_, n) => n !== index),
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      disabled={draft.items.length >= 50}
                      onClick={() =>
                        change("items", [
                          ...draft.items,
                          {
                            id: crypto.randomUUID(),
                            description: "",
                            quantity: "1",
                            rate: "0",
                          },
                        ])
                      }
                    >
                      <Plus size={16} />
                      Add line item
                    </Button>
                    <div className="field-grid totals-input">
                      <Field label="Discount (%)">
                        <Input
                          inputMode="decimal"
                          value={draft.discount}
                          onChange={(e) => change("discount", e.target.value)}
                        />
                      </Field>
                      <Field label="Tax (%)">
                        <Input
                          inputMode="decimal"
                          value={draft.tax}
                          onChange={(e) => change("tax", e.target.value)}
                        />
                      </Field>
                    </div>
                    <p className="form-hint">
                      Discount applies before tax. Amounts round to two decimals
                      per line.
                    </p>
                  </div>
                  <div className="form-section">
                    <h3>The finishing touches</h3>
                    <Field label="Note to client">
                      <Textarea
                        value={draft.notes}
                        onChange={(e) => change("notes", e.target.value)}
                      />
                    </Field>
                    <Field label="Payment instructions">
                      <Textarea
                        value={draft.paymentInstructions}
                        onChange={(e) =>
                          change("paymentInstructions", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              )}
              {aiWarnings.length > 0 && (
                <div className="ai-warning">
                  <strong>Review these details</strong>
                  {aiWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="preview-area">
              <div className="preview-label">
                <span>
                  <span className="preview-dot" />
                  LIVE PREVIEW
                </span>
                <span>A4 document</span>
              </div>
              <InvoicePreview
                draft={draft}
                business={current?.business || b}
                number={current?.number}
                totals={totals}
                status={current?.status}
              />
            </div>
          </div>
          <div className="editor-footer">
            <div>
              <span>{locked ? "Invoice total" : "Total due"}</span>
              <strong>{money(totals.total, draft.currency)}</strong>
            </div>
            <div className="editor-actions">
              {locked ? (
                <>
                  <Button
                    variant="outline"
                    disabled={boot?.demoFallback}
                    onClick={() =>
                      window.open(
                        `/api/invoices/${current!.id}/pdf`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <Download size={16} />
                    Download PDF
                  </Button>
                  {current?.status === "issued" && (
                    <>
                      <Button
                        variant="outline"
                        disabled={boot?.demoFallback}
                        onClick={() =>
                          transition(
                            "mark-paid",
                            "Record full payment?",
                            "This records the full amount as paid. It does not charge your client.",
                          )
                        }
                      >
                        <Check size={16} />
                        Mark paid
                      </Button>
                      <Button
                        onClick={() =>
                          setConfirmation({
                            title: "Email this invoice?",
                            description: `Send ${current.number} to ${current.data.customerEmail || "the client (email missing)"}.`,
                            action: async () => {
                              const r = await fetch(
                                `/api/invoices/${current.id}/send`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: "{}",
                                },
                              );
                              const d = (await r.json()) as { error?: string };
                              if (!r.ok)
                                throw Error(d.error || "Delivery failed");
                              await load();
                              toast.success("Invoice accepted for delivery");
                            },
                          })
                        }
                        disabled={
                          !boot?.integrations.email || current.sample || busy
                        }
                      >
                        <Send size={16} />
                        Send invoice
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {current && (
                    <Button
                      variant="ghost"
                      disabled={busy || boot?.demoFallback}
                      aria-label="Delete draft"
                      onClick={() =>
                        transition(
                          "delete-draft",
                          "Delete this draft?",
                          "This removes the draft from your workspace.",
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy || boot?.demoFallback}
                    onClick={() =>
                      run(async () => {
                        await save();
                      })
                    }
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : null}
                    Save draft
                  </Button>
                  <Button
                    disabled={busy || dirty || !current || boot?.demoFallback}
                    onClick={() =>
                      transition(
                        "issue",
                        "Issue this invoice?",
                        "This assigns an invoice number and locks the details. You can then download or send the PDF.",
                      )
                    }
                  >
                    <ShieldCheck size={16} />
                    Issue invoice
                  </Button>
                </>
              )}
            </div>
          </div>
          {current?.status === "issued" && (
            <div className="secondary-actions">
              <button
                disabled={boot?.demoFallback}
                onClick={() =>
                  transition(
                    "void",
                    "Void this invoice?",
                    "This preserves the invoice record and removes it from your outstanding balance.",
                  )
                }
              >
                Void invoice
              </button>
              {!boot?.integrations.email && (
                <span>
                  Email delivery needs a connection. PDF download is ready.
                </span>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={clientOpen} onOpenChange={setClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {clientId ? "Edit client" : "Add a client"}
            </DialogTitle>
            <DialogDescription>
              Save their billing details for your next invoice.
            </DialogDescription>
          </DialogHeader>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await request("save-customer", { id: clientId, data: client });
                await load();
                setClientOpen(false);
                setClient({ name: "", email: "", address: "" });
                toast.success(clientId ? "Client updated" : "Client added");
              });
            }}
          >
            <Field label="Client / company name">
              <Input
                required
                value={client.name}
                onChange={(e) => setClient({ ...client, name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={client.email}
                onChange={(e) =>
                  setClient({ ...client, email: e.target.value })
                }
              />
            </Field>
            <Field label="Billing address">
              <Textarea
                value={client.address}
                onChange={(e) =>
                  setClient({ ...client, address: e.target.value })
                }
              />
            </Field>
                    <Button disabled={busy || boot?.demoFallback} type="submit">
              Save client
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="ai-dialog">
          <DialogHeader>
            <span className="ai-dialog-icon">
              <Sparkles size={24} />
            </span>
            <DialogTitle>Start with a few words.</DialogTitle>
            <DialogDescription>
              Tell us who you’re billing, what you did, and the rate.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Invoice Acme Studio for 12 hours of website design at USD 50 per hour…"
          />
          <p className="form-hint">
            Your notes will be sent to OpenAI to prepare this draft. Review the
            result before issuing an invoice.
          </p>
          {!boot?.integrations.ai && (
            <div className="connection-notice">
              <strong>AI connection pending</strong>
              <p>
                Live drafting needs an AI connection. You can explore a clearly
                labeled sample or create an invoice manually.
              </p>
            </div>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              onClick={() => {
                openInvoice();
                setDraft({
                  ...blankInvoice(b),
                  customerName: "Acme Studio (sample)",
                  title: "Website design",
                  items: [
                    {
                      id: crypto.randomUUID(),
                      description: "Website design — sample item",
                      quantity: "12",
                      rate: "50",
                    },
                  ],
                  currency: "USD",
                });
                setAiWarnings([
                  "Sample draft — no AI request was made. Replace the sample client and confirm every detail.",
                ]);
                setDirty(true);
                setAiOpen(false);
              }}
            >
              Try sample draft
            </Button>
            <Button
              disabled={
                busy || !boot?.integrations.ai || notes.trim().length < 10
              }
              onClick={() =>
                run(async () => {
                  const r = await fetch("/api/ai/draft", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notes }),
                  });
                  const data = (await r.json()) as {
                    draft: InvoiceData;
                    warnings: string[];
                    error?: string;
                  };
                  if (!r.ok) throw Error(data.error || "Drafting failed");
                  openInvoice();
                  setDraft({ ...blankInvoice(b), ...data.draft });
                  setAiWarnings(data.warnings);
                  setDirty(true);
                  setAiOpen(false);
                })
              }
            >
              {busy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              Generate draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(v) => {
          if (!v && !busy) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                run(async () => {
                  await confirmation?.action();
                  setConfirmation(null);
                });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
function InvoicePreview({
  draft,
  business,
  number,
  totals,
  status,
}: {
  draft: InvoiceData;
  business: Business;
  number?: string | null;
  totals: ReturnType<typeof calculate>;
  status?: string;
}) {
  return (
    <article className="invoice-paper">
      <div className="paper-top">
        <div>
          <span className="paper-logo">
            {business.name.slice(0, 1).toUpperCase()}
          </span>
          <h2>{business.name}</h2>
          <p>{business.email}</p>
          <p className="pre-line">{business.address}</p>
        </div>
        <div className="paper-title">
          <span>INVOICE</span>
          <strong>{number || "DRAFT"}</strong>
          {status === "paid" && <span className="paid-stamp">PAID</span>}
        </div>
      </div>
      <div className="paper-meta">
        <div>
          <span className="paper-label">BILL TO</span>
          <strong>{draft.customerName || "Your client"}</strong>
          <p>{draft.customerEmail}</p>
          <p className="pre-line">{draft.customerAddress}</p>
        </div>
        <div>
          <span className="paper-label">ISSUED</span>
          <p>{draft.issueDate ? displayDate(draft.issueDate) : "—"}</p>
          <span className="paper-label due-label">DUE DATE</span>
          <p>{draft.dueDate ? displayDate(draft.dueDate) : "—"}</p>
        </div>
      </div>
      <h3 className="paper-project">{draft.title}</h3>
      <div className="paper-items">
        <div className="paper-item head">
          <span>DESCRIPTION</span>
          <span>QTY</span>
          <span>RATE</span>
          <span>AMOUNT</span>
        </div>
        {draft.items.map((item, index) => (
          <div className="paper-item" key={item.id}>
            <span>{item.description || "Your service or product"}</span>
            <span>{item.quantity || "0"}</span>
            <span>{money(Number(item.rate || 0) * 100, draft.currency)}</span>
            <strong>{money(totals.lines[index] || 0, draft.currency)}</strong>
          </div>
        ))}
      </div>
      <div className="paper-summary">
        <div>
          <span>Subtotal</span>
          <span>{money(totals.subtotal, draft.currency)}</span>
        </div>
        {Number(draft.discount) > 0 && (
          <div>
            <span>Discount ({draft.discount}%)</span>
            <span>−{money(totals.discount, draft.currency)}</span>
          </div>
        )}
        <div>
          <span>Tax ({draft.tax || 0}%)</span>
          <span>{money(totals.tax, draft.currency)}</span>
        </div>
        <div className="paper-total">
          <span>
            Total due <small>{draft.currency}</small>
          </span>
          <strong>{money(totals.total, draft.currency)}</strong>
        </div>
      </div>
      <div className="paper-notes">
        {draft.paymentInstructions && (
          <>
            <span className="paper-label">PAYMENT DETAILS</span>
            <p className="pre-line">{draft.paymentInstructions}</p>
          </>
        )}
        <p className="pre-line">{draft.notes}</p>
      </div>
      <div className="paper-bottom">
        <span>{business.name}</span>
        <span>Created with invoiceflow</span>
      </div>
    </article>
  );
}

function invoicesForTools(boot: Boot | null) {
  return (
    boot?.invoices.map((i) => ({
      id: i.id,
      number: i.number,
      client: i.data.customerName,
      status: statusOf(i),
      currency: i.data.currency,
      total: i.total,
    })) || []
  );
}
