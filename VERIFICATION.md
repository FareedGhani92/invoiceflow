# Verification — 30 September 2026

## Vercel migration

- `npm run typecheck` passed after switching the data and authentication layers.
- `npm run build` passed with the native Next.js production build. The build includes the workspace, sign-in page, invoice APIs, protected reminder endpoint, and provider webhook.
- The distributable source archive is about 0.9 MB. Local `node_modules` is about 993 MB, but Vercel excludes it and installs dependencies during its build. `.vercelignore` also excludes the local Next build and database files.
- Next's API route traces are about 10–12 MB each before Vercel runtime overhead, comfortably below the 225 MB target.
- All five schema migrations applied to the local SQLite database through the new migration command.
- No deployment was made. This workspace has no confirmed Vercel deployment session, and the production database and owner credentials have not been configured.
- The live Turso database migration has not been run. `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are required before applying it remotely.
- Live OpenAI calls, Resend delivery, webhook callbacks, scheduled reminder dispatch, and browser sign-in against the Vercel deployment remain unverified.

The earlier local release verification on 29 September passed 17 unit tests and API/browser checks against the Cloudflare-emulated local runtime. Those checks were not rerun after replacing that runtime with Next.js and libSQL; the current evidence is the passing TypeScript and production build checks above.

## Deployment blockers

- Create a hosted Turso database and configure its URL and auth token in Vercel.
- Configure the owner email, password hash, and session secret in Vercel.
- Apply the schema migrations, then deploy.
- Add OpenAI and Resend credentials separately if those live integrations are wanted.

No real email was sent, no remote database was modified, and no deployment files were uploaded during this migration work.
