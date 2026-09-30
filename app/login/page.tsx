import { redirect } from "next/navigation";
import { getUser } from "@/app/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const user = await getUser();
  if (user) redirect("/");
  const { error, returnTo = "/" } = await searchParams;
  const configured = Boolean(process.env.APP_LOGIN_EMAIL && process.env.APP_LOGIN_PASSWORD_HASH && process.env.SESSION_SECRET);

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark">IF</div>
        <p className="eyebrow">INVOICEFLOW AI</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="login-copy">Sign in to your private invoice workspace.</p>
        {!configured ? (
          <p className="login-error">Sign-in is not configured yet. Add the owner email, password hash, and session secret in your deployment settings.</p>
        ) : (
          <form action={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`} method="post" className="login-form">
            <label>Email address<input name="email" type="email" autoComplete="username" required maxLength={320} /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
            {error === "invalid" && <p className="login-error" role="alert">Those sign-in details didn’t match. Please try again.</p>}
            {error === "wait" && <p className="login-error" role="alert">Too many attempts. Please wait a few minutes before trying again.</p>}
            <button type="submit">Sign in</button>
          </form>
        )}
        <p className="login-footnote">Your invoices are private to this account.</p>
      </section>
    </main>
  );
}
