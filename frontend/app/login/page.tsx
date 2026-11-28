"use client";

// Login in one or two steps, matching the backend's LoginResponse:
//   mfa_required false  the reply has an access token, we are done
//   mfa_required true   the reply has a pending token; ask for a 6-digit code
//                       and trade both for an access token at /auth/2fa/login
//
// The pending token is kept in component state only, never in localStorage.
// It is worth nothing without the code, and gone if the page is closed.

import { LIMITS } from "@/lib/limits";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { Input } from "@/components/ui/Input";
import { safeNext, useAuth } from "@/lib/auth";
import { login, totpLogin } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { checkEmail, checkLoginPassword, useFieldErrors } from "@/lib/validation";

// The page to return to: /login?next=/projects/45 came from RequireAuth.
// Read when needed, not at render, since the server has no window.
function destination(): string {
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

export default function LoginPage() {
  const { status, signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { errors, validateAll, recheck } = useFieldErrors<"email" | "password">();

  // Already signed in, for example after a refresh: nothing to do here.
  useEffect(() => {
    if (status === "in") router.replace(destination());
  }, [status, router]);

  async function finish(accessToken: string) {
    await signIn(accessToken);
    router.push(destination());
  }

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Our checks first; nothing is sent while a field is wrong.
    if (!validateAll(e.currentTarget, { email: checkEmail(email), password: checkLoginPassword(password) })) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await login({ email, password });
      if (reply.mfa_required && reply.pending_token) {
        setPendingToken(reply.pending_token);
      } else if (reply.access_token) {
        await finish(reply.access_token);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await totpLogin({ pending_token: pendingToken, code });
      if (reply.access_token) await finish(reply.access_token);
    } catch (err) {
      // Either a wrong code (try again) or the pending token's five minutes
      // ran out (start over). The message says which.
      setError(errorMessage(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setPendingToken(null);
    setCode("");
    setPassword("");
    setError(null);
  }

  if (pendingToken) {
    return (
      <AuthCard title="Two-factor code" subtitle="Enter the 6-digit code from your authenticator app.">
        <form onSubmit={submitCode} className="space-y-5">
          <Input
            tone="dark"
            label="Code"
            maxLength={LIMITS.code}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
          />
          <ErrorText message={error} tone="dark" />
          <Button type="submit" size="lg" tone="dark" disabled={busy || code.length !== 6} className="w-full">
            Verify
          </Button>
          <button type="button" onClick={startOver} className="w-full text-sm text-muted-on-dark underline hover:text-on-dark">
            Start over
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign in">
      <form onSubmit={submitPassword} noValidate className="space-y-5">
        <Input
          tone="dark"
          label="Email"
          maxLength={LIMITS.email}
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            recheck("email", checkEmail(e.target.value));
          }}
          error={errors.email}
          autoComplete="email"
          required
        />
        <Input
          tone="dark"
          label="Password"
          maxLength={LIMITS.password}
          name="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            recheck("password", checkLoginPassword(e.target.value));
          }}
          error={errors.password}
          autoComplete="current-password"
          required
        />
        <ErrorText message={error} tone="dark" />
        <Button type="submit" size="lg" tone="dark" disabled={busy} className="w-full">
          {busy ? "Signing in..." : "Sign in"}
        </Button>
        <p className="text-center text-sm text-muted-on-dark">
          No account? <Link href="/register" className="text-on-dark underline hover:text-white">Sign up</Link>
        </p>
      </form>
    </AuthCard>
  );
}
