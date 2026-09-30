# InvoiceFlow AI

InvoiceFlow is an AI-assisted invoice workspace with a public portfolio demo. It creates and edits drafts, calculates exact totals, issues invoices, produces PDFs, and tracks manual payments. The public demo uses one shared fictional workspace; live AI, email delivery, and reminders are disabled there.

## Current release

- Business details, clients, invoices, and activity history in either a shared public demo or a private owner workspace.
- Draft revisions with conflict checks, transactional invoice numbering, and frozen client/business details at issuance.
- USD, EUR, GBP, and PKR totals with explicit discount and tax calculations.
- Paid, overdue, and void states. Payment tracking is manual; the app does not move money.
- Multi-page PDFs generated from the issued snapshot when requested.
- Clearly labeled sample invoices; sample records cannot be emailed.
- OpenAI Responses API extraction with a strict schema, manual review, missing-field warnings, and a per-owner daily request limit (private mode only).
- Resend email with user confirmation, idempotent delivery attempts, webhook receipts, and opt-in reminders (private mode only).
- Signed, HTTP-only owner sessions, same-origin checks, and database-backed login throttling.
- A daily Vercel Cron entry for reminders. It remains inactive until email and reminder settings are configured.

`PUBLIC_DEMO_MODE` defaults to `true`: visitors can open the portfolio demo without an account. When no database is connected, the app displays fictional sample invoices in a read-only preview; these are not saved. With a database, public visitors share the same workspace, so use fictional data only. Public mode disables live AI requests, outgoing email, and reminders. Set `PUBLIC_DEMO_MODE=false` to enable the private, single-owner sign-in flow. This is a portfolio MVP with safeguards for common invoice and delivery errors, not a full accounting system.

## Architecture

Next.js 16, React 19, and TypeScript run as Vercel server functions. Turso/libSQL provides a hosted SQLite-compatible database through `@libsql/client`; local development uses a SQLite file. Invoice PDFs are generated on demand from immutable invoice snapshots, so the deployed app has no Cloudflare storage dependency.

- `app/workspace.tsx`: invoice workspace UI.
- `app/api/workspace/route.ts`: demo or owner-scoped data and invoice actions.
- `app/auth.ts`: public demo identity or signed single-owner sessions.
- `app/api/auth/login/route.ts`: same-origin credential check and persistent attempt throttling.
- `lib/invoice.ts`: validation, exact arithmetic, and status rules.
- `lib/pdf.ts`: PDF rendering; Noto Sans is bundled under SIL OFL.
- `lib/ai.ts`, `app/api/ai/draft/route.ts`: constrained invoice extraction.
- `lib/delivery.ts`: user-confirmed Resend delivery and idempotency.
- `app/api/webhooks/email/route.ts`: signed provider event handling.
- `lib/reminders.ts`: bounded reminder queue and scheduler health.
- `app/api/jobs/reminders/route.ts`: protected Vercel Cron and manual job endpoint.
- `db/schema.ts`, `drizzle/`: schema and append-only migrations.

## Run locally

Requirements: Node.js 22.13+ and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

The dev command applies pending migrations to `invoiceflow.db` and starts Next.js on `http://127.0.0.1:3000`. On loopback only, development uses a synthetic preview owner so the UI can be explored without an account. The local database file is not included in Git or deployment uploads.

To connect AI locally, set `OPENAI_API_KEY`. For email, set a verified `EMAIL_FROM` and `RESEND_API_KEY`. Keep actual credentials in `.env` and never commit that file.

## Prepare a Vercel deployment

The Vercel project uses a separate hosted database. Create a Turso database for the public demo only, then set `TURSO_DATABASE_URL`, a database-scoped `TURSO_AUTH_TOKEN`, and `PUBLIC_DEMO_MODE=true` in Vercel's Production environment variables. Do not connect a database containing private or customer data. Turso's CLI documents database creation and connection tokens at [Turso CLI](https://github.com/tursodatabase/turso-cli); the Node driver is documented at [libSQL client](https://github.com/tursodatabase/libsql-client-ts).

For a private deployment, set `PUBLIC_DEMO_MODE=false` and create the single-owner sign-in values locally:

1. Set `APP_LOGIN_EMAIL` to the private email address you will use to sign in.
2. Run `npm run auth:hash-password` and enter a strong password when prompted. The script prints a salted scrypt hash; copy that hash into Vercel as `APP_LOGIN_PASSWORD_HASH`.
3. Generate a random secret of at least 32 characters, for example with `openssl rand -base64 48`, and set it in Vercel as `SESSION_SECRET`.
4. Add the Turso URL/token locally to `.env` and run `npm run db:migrate` once to initialize the hosted database.
5. Add those same database values, `PUBLIC_DEMO_MODE=false`, and the three sign-in values to Vercel's **Production** environment. Add `OPENAI_API_KEY` and the Resend variables only when those integrations are ready.
6. Deploy the project root with the Vercel CLI (`vercel --prod`) or import this directory into a connected Git repository. `.vercelignore` excludes local secrets and Cloudflare-specific development files.

In private mode, login is limited to the configured owner; there is no registration page. A valid session is signed by the server and stored in an HTTP-only, same-site cookie. Login attempts are counted in the database by a keyed hash of the client address. Keep the database token and session secret private.

## Optional email reminders

For invoice email, set `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_STATUS_MODE=poll`. Poll mode uses the provider's email retrieval endpoint; webhook mode also needs `RESEND_WEBHOOK_SECRET`. The user must confirm each initial invoice send. A provider acceptance is not presented as proof of delivery.

Vercel Cron runs once each day at 06:00 UTC, which works on Vercel Hobby; Hobby timing may vary within the scheduled hour. Set `CRON_SECRET` to a random value of at least 32 characters and set `REMINDER_SCHEDULER_ENABLED=true`. After the first successful scheduled run, refresh Settings and opt in to reminders. The app checks recent provider delivery statuses before sending and attempts at most one reminder per run. Payment, voiding, bounce, complaint, or opt-out stops reminders. Resend and Vercel do not guarantee email delivery or exact cron timing.

The existing local helper remains available for local testing after email setup:

```sh
npm run reminders:check
npm run reminders:watch
```

## Financial rules and limits

All supported currencies use two decimal places. Quantity and rate accept up to two decimal places. Each line is rounded, lines are summed, the invoice discount is applied, then tax is applied. The user is responsible for choosing applicable tax rates; no jurisdiction-specific tax engine is included.

Invoice numbers are unique per owner and assigned within an atomic database batch. Issuance freezes customer and business details. Payment state does not rewrite the issued PDF. Because a database and an email provider cannot share one transaction, ambiguous delivery attempts require reconciliation; retries stop before Resend's idempotency window expires.

PDF text supports Latin, Greek, and Cyrillic scripts. Unsupported glyphs fail clearly. Right-to-left layout is not implemented. The workspace loads the latest 500 invoices and clients; pagination beyond that, team roles, exports, account recovery, and deletion workflows remain future work.

## Portfolio walkthrough

1. Open the public demo; no account is required.
2. If no database is connected, compare the read-only sample draft, issued, paid, and overdue invoices.
3. Create and issue a real draft, download the PDF, and record a manual payment.
4. Try AI drafting after adding an OpenAI key; review every extracted value before saving.
5. Configure Resend with a verified sender and send only to a test inbox before using real recipients.

Use only synthetic client information in public demos. The no-database preview is read-only. When a database is connected, visitors share and can change the public demo workspace, so never store real customer or financial data there. Live integrations are disabled in public mode.

## Production follow-up

- Evaluate AI extraction on a representative synthetic dataset and measure accuracy, latency, and cost.
- Test Resend acceptance, retrieval, webhook signatures, bounce handling, and ambiguous retries with dedicated test addresses.
- Confirm Turso backups/restoration and Vercel environment separation before storing live financial data.
- Add end-to-end browser coverage, accessibility review, pagination, account recovery, and retention/deletion controls before treating this as a business-critical accounting system.

## References

[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), [Resend email status](https://resend.com/docs/api-reference/emails/retrieve-email), [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Noto font source](https://github.com/notofonts/noto-fonts).
