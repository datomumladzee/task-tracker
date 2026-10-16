"use client";

// Login in one or two steps, matching the backend's LoginResponse:
//   mfa_required false  the reply has an access token, we are done
//   mfa_required true   the reply has a pending token; ask for a 6-digit code
//                       and trade both for an access token at /auth/2fa/login
//
// The pending token is kept in component state only, never in localStorage.
// It is worth nothing without the code, and gone if the page is closed.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { login, totpLogin } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";

export default function LoginPage() {
  const { status, signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already logged in, for example after a refresh: nothing to do here.
  useEffect(() => {
    if (status === "in") router.replace("/projects");
  }, [status, router]);

  async function finish(accessToken: string) {
    await signIn(accessToken);
    router.push("/projects");
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
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
      <AuthCard title="Two-factor code">
        <form onSubmit={submitCode} className="space-y-3">
          <p className="text-sm text-zinc-600">Enter the 6-digit code from your authenticator app.</p>
          <Input
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
          />
          <ErrorText message={error} />
          <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
            Verify
          </Button>
          <button type="button" onClick={startOver} className="w-full text-sm text-zinc-600 underline">
            Start over
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Log in">
      <form onSubmit={submitPassword} className="space-y-3">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <ErrorText message={error} />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Logging in..." : "Log in"}
        </Button>
        <p className="text-center text-sm text-zinc-600">
          No account? <Link href="/register" className="underline">Register</Link>
        </p>
      </form>
    </AuthCard>
  );
}
