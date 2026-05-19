import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAdminSession } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAdminSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const nextPath = resolvedSearchParams.next?.startsWith("/") ? resolvedSearchParams.next : "/transactions";

  if (session != null) {
    redirect(nextPath);
  }

  return (
    <section className="login-page">
      <article className="surface-card login-card">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Sign in</h1>
          <p className="field-hint">Unlock transaction editing, instrument search, and market refresh controls.</p>
        </div>

        {resolvedSearchParams.error ? (
          <p className="form-banner form-banner-error">Invalid admin username or password.</p>
        ) : null}

        <form action="/api/auth/login" method="post" className="login-form">
          <input type="hidden" name="next" value={nextPath} />
          <label className="field-group">
            <span className="field-label">Username</span>
            <input name="username" autoComplete="username" required />
          </label>
          <label className="field-group">
            <span className="field-label">Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <PendingSubmitButton className="primary-button" pendingLabel="Signing in...">
            Sign in
          </PendingSubmitButton>
        </form>
      </article>
    </section>
  );
}
